// 配方。
import { getDb } from '../db/index.js'
import { withTx } from '../db/tx.js'
import { badRequest, notFound, forbidden } from '../utils/errors.js'
import { CATEGORY_META, amountLabel, amountAnchor } from '../constants.js'
import { computeHotScore, computeTasteProfile, summarizeAmount } from './recipeStats.js'
import { recalcCounters } from './restaurantService.js'
import { counts } from './voteService.js'
import { imagesFor } from './mediaService.js'

const RECIPE_COLUMNS = `
  r.id, r.restaurant_id AS restaurantId, r.user_id AS userId,
  r.title, r.description, r.serving_note AS servingNote,
  r.item_count AS itemCount, r.total_amount AS totalAmount,
  r.heat_score AS heatScore, r.salt_score AS saltScore, r.rich_score AS richScore,
  r.rating_count AS ratingCount, r.rating_sum AS ratingSum, r.rating_avg AS ratingAvg,
  r.favorite_count AS favoriteCount, r.cook_count AS cookCount, r.hot_score AS hotScore,
  r.content_type AS contentType, r.content_source AS contentSource, r.cover_illustration AS coverIllustration,
  r.status, r.created_at AS createdAt, r.updated_at AS updatedAt
`

// ─────────────────────────── 读 ───────────────────────────

/** 列表 / 搜索。restaurantId 为空时是全站「发现」流。 */
export function list({
  restaurantId = null, keyword = '', sort = 'hot', tasteTag = '', foodTag = '', spice = '', exclude = [],
  page = 1, pageSize = 20, offset = 0, currentUserId = null,
} = {}) {
  const db = getDb()
  const where = [`r.status = 'published'`, `EXISTS (SELECT 1 FROM restaurants s WHERE s.id = r.restaurant_id AND s.status = 'published')`]
  const params = []

  if (restaurantId) {
    where.push('r.restaurant_id = ?')
    params.push(restaurantId)
  }
  if (keyword) {
    where.push(`(r.title LIKE ? OR r.description LIKE ?
      OR EXISTS (SELECT 1 FROM restaurants shop WHERE shop.id = r.restaurant_id AND shop.name LIKE ?)
      OR EXISTS (SELECT 1 FROM recipe_items item WHERE item.recipe_id = r.id AND item.amount_level > 0 AND item.condiment_name LIKE ?))`)
    params.push(...Array(4).fill(`%${keyword}%`))
  }
  if (spice) {
    where.push({ none: 'r.heat_score = 0', mild: 'r.heat_score > 0 AND r.heat_score < 25',
      medium: 'r.heat_score >= 25 AND r.heat_score < 60', hot: 'r.heat_score >= 60', spicy: 'r.heat_score > 0' }[spice])
  }
  if (exclude.length) {
    where.push(`NOT EXISTS (SELECT 1 FROM recipe_items item WHERE item.recipe_id = r.id
      AND item.amount_level > 0 AND item.condiment_id IN (${exclude.map(() => '?').join(',')}))`)
    params.push(...exclude)
  }
  // 标签用 EXISTS 而不是 JOIN：一个配方可能同时命中多个标签，
  // JOIN 会产生重复行，还得再 DISTINCT，不如 EXISTS 干净。
  if (tasteTag) {
    where.push(`EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
                        WHERE rt.recipe_id = r.id AND rt.tag_id = ? AND t.kind = 'taste')`)
    params.push(tasteTag)
  }
  if (foodTag) {
    where.push(`EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id
                        WHERE rt.recipe_id = r.id AND rt.tag_id = ? AND t.kind = 'food')`)
    params.push(foodTag)
  }

  const whereSql = `WHERE ${where.join(' AND ')}`
  const orderSql =
    sort === 'new' ? 'r.id DESC'
    : sort === 'likes' ? '(SELECT COUNT(*) FROM recipe_votes v WHERE v.recipe_id = r.id AND v.value = 1) DESC, r.id DESC'
    : sort === 'rating' ? 'r.rating_avg DESC, r.rating_count DESC, r.id DESC'
    : sort === 'cook' ? 'r.cook_count DESC, r.id DESC'
    : 'r.hot_score DESC, r.id DESC'

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM recipes r ${whereSql}`)
    .get(...params).n

  const rows = db
    .prepare(
      `SELECT ${RECIPE_COLUMNS},
              u.nickname AS authorNickname, u.avatar_url AS authorAvatar,
              s.id AS shopId, s.name AS shopName
       FROM recipes r
       JOIN users u ON u.id = r.user_id
       JOIN restaurants s ON s.id = r.restaurant_id
       ${whereSql}
       ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, offset)

  return {
    list: rows.map(row => toCard(row, currentUserId)),
    total, page, pageSize,
    hasMore: page * pageSize < total,
  }
}

/** 把一行 JOIN 结果压成前端统一的 RecipeCard 形状 */
function toCard(row, currentUserId) {
  const items = getDb()
    .prepare(
      `SELECT ri.condiment_id AS condimentId, ri.condiment_name AS condimentName,
              ri.amount_level AS amountLevel, ri.amount_label AS amountLabel,
              c.short_name AS shortName
       FROM recipe_items ri
       LEFT JOIN condiments c ON c.id = ri.condiment_id
       WHERE ri.recipe_id = ?
       ORDER BY ri.amount_level DESC`,
    )
    .all(row.id)

  return {
    id: row.id,
    contentType: row.contentType, contentSource: row.contentSource, coverIllustration: row.coverIllustration,
    ...counts(row.id, currentUserId),
    images: imagesFor(row.id),
    title: row.title,
    description: row.description,
    itemCount: row.itemCount,
    totalAmount: row.totalAmount,
    // hotScore = 热度分（列表排序依据）；spicyScore = 辣度画像（0–100）。
    // 表里这两列叫 hot_score / heat_score，只差一个字母 —— 之前这里取错了列，
    // 卡片上的「热度」实际显示的是辣度，跟排序结果对不上。
    hotScore: row.hotScore,
    spicyScore: row.heatScore,
    ratingAvg: Number(Number(row.ratingAvg).toFixed(2)),
    ratingCount: row.ratingCount,
    cookCount: row.cookCount,
    favoriteCount: row.favoriteCount,
    amountSummary: summarizeAmount(items),
    author: { id: row.userId, nickname: row.authorNickname, avatarUrl: row.authorAvatar },
    restaurant: { id: row.shopId, name: row.shopName },
    createdAt: row.createdAt,
  }
}

/** 配方详情。currentUserId 有值时会额外返回 myRating / isAuthor / isFavorite。 */
export function detail(id, currentUserId = null) {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT ${RECIPE_COLUMNS},
              u.nickname AS authorNickname, u.avatar_url AS authorAvatar,
              s.name AS shopName, s.city AS shopCity, s.address AS shopAddress
       FROM recipes r
       JOIN users u ON u.id = r.user_id
       JOIN restaurants s ON s.id = r.restaurant_id
       WHERE r.id = ? AND s.status = 'published'`,
    )
    .get(id)

  if (!row || row.status !== 'published') throw notFound('配方不存在')

  const items = db
    .prepare(
      `SELECT ri.id, ri.condiment_id AS condimentId, ri.condiment_name AS condimentName,
              ri.amount_level AS amountLevel, ri.amount_label AS amountLabel,
              ri.amount_note AS amountNote, ri.step_index AS stepIndex,
              ri.stage_order AS stageOrder, ri.stage_name AS stageName,
              c.name, c.short_name AS shortName, c.glyph, c.color, c.unit_hint AS unitHint,
              c.flavor_tags AS flavorTags, c.caution, c.is_allergen AS isAllergen
       FROM recipe_items ri
       LEFT JOIN condiments c ON c.id = ri.condiment_id
       WHERE ri.recipe_id = ?
       ORDER BY ri.stage_order, ri.step_index IS NULL, ri.step_index`,
    )
    .all(id)

  const tags = db
    .prepare(
      `SELECT t.id, t.kind, t.name FROM recipe_tags rt
       JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = ? ORDER BY t.kind, t.sort_order`,
    )
    .all(id)

  const result = {
    recipe: {
      id: row.id,
      contentType: row.contentType, contentSource: row.contentSource, coverIllustration: row.coverIllustration,
      ...counts(row.id, currentUserId),
      images: imagesFor(row.id),
      title: row.title,
      description: row.description,
      servingNote: row.servingNote,
      itemCount: row.itemCount,
      totalAmount: row.totalAmount,
      profile: { heatScore: row.heatScore, saltScore: row.saltScore, richScore: row.richScore },
      ratingAvg: Number(Number(row.ratingAvg).toFixed(2)),
      ratingCount: row.ratingCount,
      favoriteCount: row.favoriteCount,
      cookCount: row.cookCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    restaurant: {
      id: row.restaurantId,
      name: row.shopName,
    },
    author: { id: row.userId, nickname: row.authorNickname, avatarUrl: row.authorAvatar },
    items: items.map((it) => ({
      ...it,
      flavorTags: safeParse(it.flavorTags, []),
      // 物理锚点由「档位 + 单位」组合而来，不存库，避免两处不一致
      anchorText: amountAnchor(it.amountLevel, it.unitHint || '勺'),
      isStep: it.stepIndex !== null,
    })),
    tags: {
      taste: tags.filter((t) => t.kind === 'taste'),
      food: tags.filter((t) => t.kind === 'food'),
      scene: tags.filter((t) => t.kind === 'scene'),
    },
    isAuthor: currentUserId != null && currentUserId === row.userId,
    myRating: null,
    isFavorite: false,
  }

  if (currentUserId) {
    result.myRating = db
      .prepare(
        `SELECT score, content, feedback_tags AS feedbackTags, taste_ok AS tasteOk, updated_at AS updatedAt
         FROM ratings WHERE recipe_id = ? AND user_id = ? AND status = 'published'`,
      )
      .get(id, currentUserId) ?? null
    if (result.myRating) result.myRating.feedbackTags = safeParse(result.myRating.feedbackTags, [])

    result.isFavorite = Boolean(
      db.prepare('SELECT 1 FROM favorites WHERE recipe_id = ? AND user_id = ?').get(id, currentUserId),
    )
  }

  return result
}

/**
 * ★「照着配」预编排包。
 *
 * 这是整个产品的价值落点。设计要点：
 *
 * 1. 服务端把一切都编排好 —— 排序、分幕、锚点文案、可替代品。
 *    客户端在这个页面不承担任何计算逻辑。这是保证 H5 与小程序表现一致的关键，
 *    也让整个会话包能一次性下发、缓存、离线使用（店里信号差是常态）。
 *
 * 2. 一个调料 = 一步。每一步对应一个真实的物理动作（拿勺 → 舀 → 倒 → 放回），
 *    一一对应用户才不会「配到哪了」。
 *
 * 3. 「不放」(level=0) 的项不进步骤序列，单独放在 skipList 里。
 *    它是有价值的信息 —— 明确告诉用户"别放这个"。
 */
export function cookSession(id) {
  const full = detail(id)
  const db = getDb()

  const steps = full.items.filter((it) => it.isStep)
  const skipped = full.items.filter((it) => !it.isStep)

  // 按幕分组。Map 保持插入顺序，而 items 已经按 stage_order 排过序，
  // 所以直接遍历就能得到正确的幕序。
  const stageMap = new Map()
  for (const it of steps) {
    const key = it.stageOrder
    if (!stageMap.has(key)) {
      stageMap.set(key, {
        key: Object.entries(CATEGORY_META).find(([, m]) => m.stageOrder === key)?.[0] ?? 'other',
        name: it.stageName || '其他',
        order: key,
        steps: [],
      })
    }
    stageMap.get(key).steps.push({
      stepIndex: it.stepIndex,
      condimentId: it.condimentId,
      name: it.name || it.condimentName,
      shortName: it.shortName || it.condimentName,
      glyph: it.glyph || '料',
      color: it.color || '#8A8A8A',
      amountLevel: it.amountLevel,
      amountLabel: it.amountLabel,
      anchorText: it.anchorText,
      amountNote: it.amountNote,
      caution: it.caution || '',
      isAllergen: Boolean(it.isAllergen),
    })
  }

  // 可替代品：同类目里挑一个最接近的。这是「这家店没有这个料」时的兜底，
  // 也是宝贵的回流数据（用户实际跳过了什么，说明这家店缺什么）。
  const substitutes = new Map()
  for (const it of steps) {
    const alt = db
      .prepare(
        `SELECT id, name, short_name AS shortName FROM condiments
         WHERE category = (SELECT category FROM condiments WHERE id = ?)
           AND id <> ? AND status = 'published'
         ORDER BY ABS(default_amount - ?), sort_order LIMIT 1`,
      )
      .get(it.condimentId, it.condimentId, it.amountLevel)
    if (alt) substitutes.set(it.condimentId, alt)
  }

  for (const stage of stageMap.values()) {
    for (const s of stage.steps) {
      const alt = substitutes.get(s.condimentId)
      s.substitute = alt ? { condimentId: alt.id, name: alt.shortName || alt.name } : null
    }
  }

  return {
    recipeId: full.recipe.id,
    contentType: full.recipe.contentType,
    title: full.recipe.title,
    description: full.recipe.description,
    servingNote: full.recipe.servingNote,
    restaurantId: full.restaurant.id,
    restaurantName: full.restaurant.name,
    author: full.author,
    totalSteps: steps.length,
    // 每步按 8 秒估：拿勺、舀、倒、放回。给用户一个心理预期
    estimatedSeconds: steps.length * 8,
    stages: [...stageMap.values()],
    skipList: skipped.map((it) => ({
      condimentId: it.condimentId,
      name: it.shortName || it.condimentName,
      note: it.amountNote,
    })),
    summaryLine: summarizeAmount(full.items, 6),
    // 会话包版本号。前端缓存后下次先比这个值，没变就不重新拉取。
    cookSessionVersion: `${full.recipe.id}:v${Date.parse(full.recipe.updatedAt) || 0}`,
  }
}

// ─────────────────────────── 写 ───────────────────────────

/**
 * 新建配方。
 *
 * 服务的步骤序号在这里固化：按「幕」(stage_order) 再按调料自身的 sort_order 排。
 * 让用户自己乱排步骤是错的 —— 这个顺序模拟调料台的物理摆位，
 * 用户照着走一遍就能配完，不用在店里来回折返。
 */
export function create(input, userId) {
  const db = getDb()
  const {
    restaurantId, title, description = '', servingNote = '',
    items = [], tasteTags = [], foodTags = [], sceneTags = [], clientToken = null,
  } = input

  const shop = db
    .prepare(`SELECT id FROM restaurants WHERE id = ? AND status = 'published'`)
    .get(restaurantId)
  if (!shop) throw badRequest('餐馆不存在')

  if (items.length === 0) throw badRequest('至少要加一样调料')
  if (items.length > 30) throw badRequest('调料最多 30 样')

  const prepared = prepareItems(items)

  return withTx(db, () => {
    const profile = computeTasteProfile(prepared)
    const totalAmount = prepared.reduce((s, it) => s + it.amountLevel, 0)
    const stepCount = prepared.filter((it) => it.stepIndex !== null).length

    const info = db
      .prepare(
        `INSERT INTO recipes
           (restaurant_id, user_id, title, description, serving_note,
            item_count, total_amount, heat_score, salt_score, rich_score, client_token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        restaurantId, userId, title, description, servingNote,
        stepCount, totalAmount, profile.heatScore, profile.saltScore, profile.richScore,
        clientToken,
      )

    const recipeId = Number(info.lastInsertRowid)
    insertItems(db, recipeId, prepared)
    insertTags(db, recipeId, [...tasteTags, ...foodTags, ...sceneTags])
    refreshHotScore(db, recipeId)
    recalcCounters(restaurantId)

    return recipeId
  })
}

export function update(id, input, userId) {
  const db = getDb()
  const row = db.prepare('SELECT user_id AS userId, restaurant_id AS restaurantId, status FROM recipes WHERE id = ?').get(id)
  if (!row || row.status !== 'published') throw notFound('配方不存在')
  if (row.userId !== userId) throw forbidden('只能修改自己发布的配方')

  const { title, description = '', servingNote = '', items = [], tasteTags = [], foodTags = [], sceneTags = [] } = input
  if (items.length === 0) throw badRequest('至少要加一样调料')

  const prepared = prepareItems(items)

  return withTx(db, () => {
    const profile = computeTasteProfile(prepared)
    const totalAmount = prepared.reduce((s, it) => s + it.amountLevel, 0)
    const stepCount = prepared.filter((it) => it.stepIndex !== null).length

    db.prepare(
      `UPDATE recipes SET
         title = ?, description = ?, serving_note = ?, item_count = ?, total_amount = ?,
         heat_score = ?, salt_score = ?, rich_score = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = ?`,
    ).run(title, description, servingNote, stepCount, totalAmount,
      profile.heatScore, profile.saltScore, profile.richScore, id)

    // 明细整体替换：比起逐条 diff，这样简单且不会漏掉删除的项。
    // 副作用是 recipe_items.id 会变，但没有任何地方持久引用它，可以接受。
    db.prepare('DELETE FROM recipe_items WHERE recipe_id = ?').run(id)
    db.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').run(id)

    insertItems(db, id, prepared)
    insertTags(db, id, [...tasteTags, ...foodTags, ...sceneTags])
    refreshHotScore(db, id)
    recalcCounters(row.restaurantId)

    return id
  })
}

/** 软删除。保留行是为了让已有的评分/打卡记录仍然有指向，不产生孤儿数据。 */
export function remove(id, userId) {
  const db = getDb()
  const row = db.prepare('SELECT user_id AS userId, restaurant_id AS restaurantId, status FROM recipes WHERE id = ?').get(id)
  if (!row || row.status === 'deleted') throw notFound('配方不存在')
  if (row.userId !== userId) throw forbidden('只能删除自己发布的配方')

  return withTx(db, () => {
    db.prepare(
      `UPDATE recipes SET status = 'deleted', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = ?`,
    ).run(id)
    recalcCounters(row.restaurantId)
    return { ok: true }
  })
}

/** 记录一次「照着配」行为。完成时累加 cook_count —— 这是最强的排序信号。 */
export function logCook(id, userId, { finished = false, stepReached = 0, skipped = [], substituted = [] }) {
  const db = getDb()
  const recipe = db.prepare('SELECT id, restaurant_id AS restaurantId FROM recipes WHERE id = ? AND status = ?').get(id, 'published')
  if (!recipe) throw notFound('配方不存在')

  return withTx(db, () => {
    db.prepare(
      `INSERT INTO cook_logs
         (recipe_id, user_id, restaurant_id, finished, step_reached, skipped, substituted, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, userId, recipe.restaurantId,
      finished ? 1 : 0, stepReached,
      JSON.stringify(skipped), JSON.stringify(substituted),
      finished ? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') : null,
    )

    if (finished) {
      db.prepare('UPDATE recipes SET cook_count = cook_count + 1 WHERE id = ?').run(id)
      recalcCounters(recipe.restaurantId)
      refreshHotScore(db, id)
    }

    const { cookCount } = db.prepare('SELECT cook_count AS cookCount FROM recipes WHERE id = ?').get(id)
    return { cookCount }
  })
}

// ─────────────────────────── 内部工具 ───────────────────────────

/**
 * 校验并装配明细行。
 *
 * 关键动作：按「幕」排序并固化 step_index。
 * 「不放」(level=0) 的项 step_index 为 NULL，不进步骤序列 ——
 * 它们只在开场/收尾作为「本配方不放：韭菜花酱」出现。
 */
export function prepareItems(items) {
  const db = getDb()
  if (!Array.isArray(items) || !items.length || items.some(it => !it || typeof it !== 'object' || typeof it.condimentId !== 'string')) throw badRequest('调料格式不合法')

  // 一次查完所有调料，避免在循环里逐条查库
  const ids = [...new Set(items.map((it) => it.condimentId).filter(Boolean))]
  if (ids.length !== items.length) throw badRequest('存在重复或缺少的调料')

  const placeholders = ids.map(() => '?').join(',')
  const condiments = db
    .prepare(
      `SELECT id, name, short_name AS shortName, category, stage_order AS stageOrder,
              sort_order AS sortOrder, unit_hint AS unitHint,
              spicy_weight AS spicyWeight, salty_weight AS saltyWeight, rich_weight AS richWeight
       FROM condiments WHERE id IN (${placeholders}) AND status = 'published'`,
    )
    .all(...ids)

  const byId = new Map(condiments.map((c) => [c.id, c]))
  for (const id of ids) {
    if (!byId.has(id)) throw badRequest(`调料不存在: ${id}`)
  }

  const prepared = items.map((it) => {
    const c = byId.get(it.condimentId)
    const level = Number(it.amountLevel)
    if (!Number.isInteger(level) || level < 0 || level > 5) {
      throw badRequest(`「${c.name}」的用量不合法`)
    }
    return {
      condimentId: c.id,
      condimentName: c.name,
      shortName: c.shortName || c.name,
      amountLevel: level,
      // 写入时固化成文案。以后调整档位映射表，历史配方显示不会漂移。
      amountLabel: amountLabel(level),
      amountNote: String(it.amountNote ?? '').slice(0, 60),
      stageOrder: c.stageOrder,
      stageName: CATEGORY_META[c.category]?.stageName ?? '',
      _sortOrder: c.sortOrder,
      spicyWeight: c.spicyWeight,
      saltyWeight: c.saltyWeight,
      richWeight: c.richWeight,
    }
  })

  // 按幕排，幕内按调料台摆位排
  prepared.sort((a, b) => a.stageOrder - b.stageOrder || a._sortOrder - b._sortOrder
    || a.condimentId.localeCompare(b.condimentId))

  // 固化步骤序号。level=0 的项保持 null
  let step = 0
  for (const it of prepared) {
    it.stepIndex = it.amountLevel > 0 ? step++ : null
  }

  return prepared
}

function insertItems(db, recipeId, prepared) {
  const stmt = db.prepare(
    `INSERT INTO recipe_items
       (recipe_id, condiment_id, condiment_name, amount_level, amount_label,
        amount_note, step_index, stage_order, stage_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const it of prepared) {
    stmt.run(
      recipeId, it.condimentId, it.condimentName, it.amountLevel, it.amountLabel,
      it.amountNote, it.stepIndex, it.stageOrder, it.stageName,
    )
  }
}

/** 只接受真实存在的标签 id，静默丢弃无效值（不让一个错标签毁掉整次发布） */
function insertTags(db, recipeId, tagIds) {
  const unique = [...new Set(tagIds.filter(Boolean))]
  if (unique.length === 0) return

  const placeholders = unique.map(() => '?').join(',')
  const valid = db
    .prepare(`SELECT id FROM tags WHERE id IN (${placeholders}) AND status = 'published'`)
    .all(...unique)
    .map((t) => t.id)

  const stmt = db.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)')
  for (const tagId of valid) stmt.run(recipeId, tagId)
}

/** 按当前累计数据重算热度分。任何会改变评分/打卡/收藏的写路径都要调用。 */
export function refreshHotScore(db, recipeId) {
  const r = db
    .prepare(
      `SELECT rating_avg AS ratingAvg, cook_count AS cookCount,
              favorite_count AS favoriteCount, created_at AS createdAt
       FROM recipes WHERE id = ?`,
    )
    .get(recipeId)
  if (!r) return

  const hot = computeHotScore(r)
  db.prepare('UPDATE recipes SET hot_score = ? WHERE id = ?').run(hot, recipeId)
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}
