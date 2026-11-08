// 评分与收藏。
import { getDb } from '../db/index.js'
import { withTx } from '../db/tx.js'
import { notFound, badRequest } from '../utils/errors.js'
import { refreshHotScore } from './recipeService.js'

/**
 * 打分。一人一配方一条，重复提交是「改分」而不是新增。
 *
 * ★ 全程在一个事务里：「读旧分 → upsert → 重算聚合 → 重算热度」。
 * 拆开做的话，两个人同时打分会出现聚合值与 ratings 表对不上的情况
 * （典型的 read-modify-write 竞态），而且这种偏差会一直留在库里。
 */
export const FEEDBACK_TAGS = ['太咸', '太辣', '太淡', '用量不清楚', '店里缺调料']
function publishedRecipe(db, id) {
  return db.prepare(`SELECT r.id FROM recipes r JOIN restaurants s ON s.id = r.restaurant_id
    WHERE r.id = ? AND r.status = 'published' AND s.status = 'published'`).get(id)
}
export function upsert(recipeId, userId, { score, content = '', tasteOk = null, feedbackTags = [] }) {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw badRequest('评分必须是 1–5 星')
  }

  const db = getDb()
  if (!Array.isArray(feedbackTags) || feedbackTags.length > 5 || feedbackTags.some(tag => !FEEDBACK_TAGS.includes(tag))) throw badRequest('评价标签无效')
  const recipe = publishedRecipe(db, recipeId)
  if (!recipe) throw notFound('配方不存在')

  return withTx(db, () => {
    db.prepare(
      `INSERT INTO ratings (recipe_id, user_id, score, content, taste_ok, feedback_tags)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(recipe_id, user_id) DO UPDATE SET
         score      = excluded.score,
         content    = excluded.content,
         taste_ok   = excluded.taste_ok,
         feedback_tags = excluded.feedback_tags,
         status     = 'published',
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
    ).run(recipeId, userId, score, String(content).slice(0, 500), tasteOk === null ? null : (tasteOk ? 1 : 0), JSON.stringify([...new Set(feedbackTags)]))

    // 从 ratings 表重算，而不是在原值上加减 —— 这样即使历史数据有偏差，
    // 也能在下次打分时自动纠正回来
    const agg = db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(score), 0) AS s
         FROM ratings WHERE recipe_id = ? AND status = 'published'`,
      )
      .get(recipeId)

    const avg = agg.n > 0 ? agg.s / agg.n : 0
    db.prepare(
      'UPDATE recipes SET rating_count = ?, rating_sum = ?, rating_avg = ? WHERE id = ?',
    ).run(agg.n, agg.s, Number(avg.toFixed(3)), recipeId)

    refreshHotScore(db, recipeId)

    const my = db
      .prepare(
        `SELECT score, content, feedback_tags AS feedbackTags, taste_ok AS tasteOk, updated_at AS updatedAt
         FROM ratings WHERE recipe_id = ? AND user_id = ?`,
      )
      .get(recipeId, userId)
    my.feedbackTags = JSON.parse(my.feedbackTags)

    return {
      rating: my,
      recipe: { ratingAvg: Number(avg.toFixed(2)), ratingCount: agg.n },
    }
  })
}

export function removeMine(recipeId, userId) {
  const db = getDb()

  return withTx(db, () => {
    const info = db
      .prepare('DELETE FROM ratings WHERE recipe_id = ? AND user_id = ?')
      .run(recipeId, userId)

    if (info.changes === 0) return { ok: true, removed: false }

    const agg = db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(score), 0) AS s
         FROM ratings WHERE recipe_id = ? AND status = 'published'`,
      )
      .get(recipeId)

    const avg = agg.n > 0 ? agg.s / agg.n : 0
    db.prepare(
      'UPDATE recipes SET rating_count = ?, rating_sum = ?, rating_avg = ? WHERE id = ?',
    ).run(agg.n, agg.s, Number(avg.toFixed(3)), recipeId)

    refreshHotScore(db, recipeId)
    return { ok: true, removed: true }
  })
}

export function listByRecipe(recipeId, { page = 1, pageSize = 20, offset = 0 } = {}) {
  const db = getDb()
  if (!publishedRecipe(db, recipeId)) throw notFound('配方不存在')

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM ratings WHERE recipe_id = ? AND status = 'published'`)
    .get(recipeId).n

  const list = db
    .prepare(
      `SELECT rt.id, rt.score, rt.content, rt.feedback_tags AS feedbackTags, rt.taste_ok AS tasteOk,
              rt.created_at AS createdAt, rt.updated_at AS updatedAt,
              u.id AS userId, u.nickname, u.avatar_url AS avatarUrl
       FROM ratings rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.recipe_id = ? AND rt.status = 'published'
       ORDER BY rt.taste_ok IS NULL, rt.updated_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(recipeId, pageSize, offset)
    .map((r) => ({
      id: r.id,
      score: r.score,
      content: r.content,
      feedbackTags: JSON.parse(r.feedbackTags),
      tasteOk: r.tasteOk === null ? null : Boolean(r.tasteOk),
      user: { id: r.userId, nickname: r.nickname, avatarUrl: r.avatarUrl },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))

  return { list, total, page, pageSize, hasMore: page * pageSize < total }
}

// ─────────────────────────── 收藏 ───────────────────────────

/** 幂等：重复收藏不会报错，也不会重复计数 */
export function addFavorite(recipeId, userId) {
  const db = getDb()
  if (!publishedRecipe(db, recipeId)) {
    throw notFound('配方不存在')
  }

  return withTx(db, () => {
    const info = db
      .prepare('INSERT OR IGNORE INTO favorites (user_id, recipe_id) VALUES (?, ?)')
      .run(userId, recipeId)

    if (info.changes > 0) {
      db.prepare('UPDATE recipes SET favorite_count = favorite_count + 1 WHERE id = ?').run(recipeId)
      refreshHotScore(db, recipeId)
    }

    const { favorite_count: favoriteCount } = db
      .prepare('SELECT favorite_count FROM recipes WHERE id = ?')
      .get(recipeId)
    return { favorited: true, favoriteCount }
  })
}

export function removeFavorite(recipeId, userId) {
  const db = getDb()

  const exists = db.prepare('SELECT favorite_count FROM recipes WHERE id = ?').get(recipeId)
  if (!exists) throw notFound('配方不存在')

  return withTx(db, () => {
    const info = db
      .prepare('DELETE FROM favorites WHERE user_id = ? AND recipe_id = ?')
      .run(userId, recipeId)

    if (info.changes > 0) {
      // MAX(0, ...) 防止历史数据不一致时把计数减成负数
      db.prepare('UPDATE recipes SET favorite_count = MAX(0, favorite_count - 1) WHERE id = ?').run(recipeId)
      refreshHotScore(db, recipeId)
    }

    const { favorite_count: favoriteCount } = db
      .prepare('SELECT favorite_count FROM recipes WHERE id = ?')
      .get(recipeId)
    return { favorited: false, favoriteCount }
  })
}
