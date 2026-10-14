// 餐馆。
//
// 这里是「用户自建餐馆」这件事最容易出问题的地方：同一个店被不同人重复创建。
// 三道防线，从硬到软：
//   1. 数据库部分唯一索引（city_norm + name_norm + address_norm）—— 拦完全一致的
//   2. 相似度自动匹配 / 候选确认 —— 拦写法不同的，见 findSimilar
//   3. client_token 幂等 —— 拦弱网下用户连点两次「创建」
import { getDb } from '../db/index.js'
import { withTx } from '../db/tx.js'
import { normalizeText, restaurantSimilarity, MATCH_AUTO, MATCH_CANDIDATE } from '../utils/norm.js'
import { conflict, notFound } from '../utils/errors.js'

const CARD_COLUMNS = `
  r.id, r.name, r.city, r.address, r.landmark, r.category, r.note,
  r.recipe_count AS recipeCount, r.cook_count AS cookCount, r.created_at AS createdAt
`

function toCard(row) {
  return row ?? null
}

/** 列表 / 搜索。keyword 走归一化后的前缀包含匹配。 */
export function list({ keyword = '', city = '', sort = 'hot', page = 1, pageSize = 20, offset = 0 }) {
  const db = getDb()
  const where = [`r.status = 'published'`]
  const params = []

  if (keyword) {
    // 用归一化后的字段匹配，这样「海底捞（万达店）」也能被「海底捞万达」搜到
    where.push(`(r.name_norm LIKE ? OR r.address_norm LIKE ?)`)
    const kw = `%${normalizeText(keyword)}%`
    params.push(kw, kw)
  }
  if (city) {
    where.push('r.city_norm = ?')
    params.push(normalizeText(city))
  }

  const whereSql = `WHERE ${where.join(' AND ')}`
  // 排序字段白名单，不能直接拼用户输入
  const orderSql =
    sort === 'new' ? 'r.id DESC'
    : sort === 'recipe' ? 'r.recipe_count DESC, r.id DESC'
    : 'r.cook_count DESC, r.recipe_count DESC, r.id DESC'

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM restaurants r ${whereSql}`)
    .get(...params).n

  const list = db
    .prepare(
      `SELECT ${CARD_COLUMNS} FROM restaurants r ${whereSql}
       ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset)

  return { list, total, page, pageSize, hasMore: page * pageSize < total }
}

export function findById(id) {
  const db = getDb()
  const row = db
    .prepare(`SELECT ${CARD_COLUMNS} FROM restaurants r WHERE r.id = ? AND r.status <> 'merged'`)
    .get(id)
  if (!row) throw notFound('餐馆不存在')
  return row
}

/**
 * 查重预检。
 *
 * 返回按相似度降序的候选，并标出 autoMatchId —— 命中高置信度时前端可以直接提示
 * 「已为你匹配到 XX，不是这家？」而不是让用户自己去列表里翻。
 *
 * 只在同城范围内比对：跨城市的同名店（比如全国连锁）不该被合并。
 */
export function findSimilar({ name, address = '', city = '', landmark = '' }) {
  const db = getDb()

  const nameNorm = normalizeText(name)
  if (!nameNorm) return { candidates: [], autoMatchId: null }

  // 取首字相同或包含关系的一批做精算，避免全表扫描做 bigram。
  // 必须带 ORDER BY —— 否则 LIMIT 60 截出来的是哪 60 条完全由存储顺序决定，
  // 相似度算得再准也没用。前缀命中的优先，其次是配方多的热门店。
  const head = nameNorm.slice(0, 2)
  const pool = db
    .prepare(
      `SELECT id, name, city, address, landmark, recipe_count AS recipeCount
       FROM restaurants
       WHERE status = 'published'
         AND (city_norm = ? OR ? = '')
         AND (name_norm LIKE ? OR name_norm LIKE ?)
       ORDER BY (name_norm LIKE ?) DESC, recipe_count DESC, id DESC
       LIMIT 60`,
    )
    .all(
      normalizeText(city), normalizeText(city),
      `%${head}%`, `%${nameNorm.slice(0, 1)}%`,
      `${head}%`,
    )

  const candidates = pool
    .map((r) => {
      const { score, nameSim, addrSim } = restaurantSimilarity(
        { name, address, city, landmark },
        r,
      )
      return {
        id: r.id,
        name: r.name,
        address: r.address,
        city: r.city,
        recipeCount: r.recipeCount,
        score: Number(score.toFixed(3)),
        matchReason: nameSim >= 0.9 ? '店名高度相似' : addrSim >= 0.8 ? '地址高度相似' : '部分相似',
      }
    })
    .filter((c) => c.score >= MATCH_CANDIDATE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  const top = candidates[0]
  const autoMatchId = top && top.score >= MATCH_AUTO ? top.id : null

  return { candidates, autoMatchId }
}

/**
 * 新建餐馆。
 *
 * 返回形状有四种，前端要分别处理：
 *   { created: true }            真正新建了
 *   { matched: true }            高置信度命中已有店，直接复用（不新建）
 *   throw conflict(候选列表)      中等相似度，让用户确认是不是同一家
 *   { created: true }            都不像，正常新建
 *
 * 注意：唯一索引冲突（并发下两个人同时建同一家店）由 error 中间件转成 409，
 * 这里额外做一次捕获，转成「复用已有店」而不是报错 —— 用户的意图已经达成了。
 */
export function create(input, userId) {
  const db = getDb()
  const {
    name, address = '', city = '', landmark = '', category = '自助餐', note = '',
    clientToken = null, forceCreate = false,
  } = input

  // 防线 3：同一个 clientToken 只建一次（弱网重试 / 用户连点）
  if (clientToken) {
    const dup = db
      .prepare(`SELECT ${CARD_COLUMNS} FROM restaurants r WHERE r.client_token = ?`)
      .get(clientToken)
    if (dup) return { restaurant: toCard(dup), created: false, matched: true, idempotent: true }
  }

  // 防线 2：相似度匹配。forceCreate 时整段跳过。
  //
  // forceCreate 是必需的出口，不是可选项：相似但确实是两家不同的店（连锁店的不同分店、
  // 同商场的两家店）如果在这里被 409 挡住又没地方放行，用户就永远建不了这家店。
  // 前端流程是：409 拿到候选 → 展示「是不是这家？」→ 用户选「都不是」→
  // 带 forceCreate 重新提交。
  if (!forceCreate) {
    const { candidates, autoMatchId } = findSimilar({ name, address, city, landmark })

    if (autoMatchId) {
      const existing = findById(autoMatchId)
      return { restaurant: existing, created: false, matched: true, candidates }
    }

    if (candidates.length > 0) {
      // 有相似的但不够确信 —— 交给用户判断，不要替他做决定。
      // 误合并会让用户看到错误的调料配方，比多一条重复数据严重得多。
      throw conflict('可能已存在这家店，请确认', { candidates })
    }
  }

  // 防线 1：唯一索引兜底
  try {
    const info = withTx(db, () =>
      db
        .prepare(
          `INSERT INTO restaurants
             (name, name_norm, city, city_norm, address, address_norm, landmark, category, note, client_token, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          name,
          normalizeText(name),
          city,
          normalizeText(city),
          address,
          normalizeText(address),
          landmark,
          category,
          note,
          clientToken,
          userId,
        ),
    )
    const restaurant = db
      .prepare(`SELECT ${CARD_COLUMNS} FROM restaurants r WHERE r.id = ?`)
      .get(info.lastInsertRowid)
    return { restaurant: toCard(restaurant), created: true, matched: false }
  } catch (err) {
    // 唯一索引撞了 —— 说明别人刚建了同一家店，直接复用
    if (String(err.message || '').includes('UNIQUE constraint failed')) {
      const existing = db
        .prepare(
          `SELECT ${CARD_COLUMNS} FROM restaurants r
           WHERE city_norm = ? AND name_norm = ? AND address_norm = ? AND status <> 'merged'`,
        )
        .get(normalizeText(city), normalizeText(name), normalizeText(address))
      if (existing) return { restaurant: toCard(existing), created: false, matched: true }
    }
    throw err
  }
}

/** 餐馆详情，附带该店评分最高的几个配方 */
export function detail(id) {
  const restaurant = findById(id)
  const topRecipes = getDb()
    .prepare(
      `SELECT id, title, rating_avg AS ratingAvg, rating_count AS ratingCount,
              cook_count AS cookCount, item_count AS itemCount, total_amount AS totalAmount
       FROM recipes
       WHERE restaurant_id = ? AND status = 'published'
       ORDER BY hot_score DESC, id DESC LIMIT 3`,
    )
    .all(id)

  return { restaurant, topRecipes }
}

/** 更新配方数 / 打卡数等冗余计数字段。写路径统一调用，保持与明细一致。 */
export function recalcCounters(restaurantId) {
  const db = getDb()
  db.prepare(
    `UPDATE restaurants SET
       recipe_count = (SELECT COUNT(*) FROM recipes WHERE restaurant_id = ? AND status = 'published'),
       cook_count   = (SELECT COALESCE(SUM(cook_count),0) FROM recipes WHERE restaurant_id = ? AND status = 'published'),
       updated_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now')
     WHERE id = ?`,
  ).run(restaurantId, restaurantId, restaurantId)
}
