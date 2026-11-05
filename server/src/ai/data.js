// AI 模块的数据访问层。
//
// 刻意不走其他 service：推荐/搜索需要的字段组合很窄，
// 直接查库比串接 recipeService 更短，也不会因为别处改接口而牵连到这里。
//
// 只读，不写任何表 —— 这个模块不做埋点、不改数据。
import { getDb } from '../db/index.js'

const RECIPE_FIELDS = `
  r.id, r.title, r.description, r.restaurant_id,
  r.heat_score AS heat, r.salt_score AS salt, r.rich_score AS rich,
  r.rating_avg AS rating, r.rating_count AS ratingCount,
  r.cook_count AS cookCount, r.favorite_count AS favoriteCount,
  r.hot_score AS hot, r.created_at AS createdAt,
  s.name AS shop, s.category AS shopCategory
`

/** 已发布配方，按热度降序。limit 上限由调用方保证。 */
export function listRecipes(limit = 20) {
  return getDb()
    .prepare(
      `SELECT ${RECIPE_FIELDS}
       FROM recipes r
       JOIN restaurants s ON s.id = r.restaurant_id
       WHERE r.status = 'published' AND s.status = 'published'
       ORDER BY r.hot_score DESC, r.id DESC
       LIMIT ?`,
    )
    .all(limit)
}

/** 已发布店铺，按配方数与打卡量降序。 */
export function listRestaurants(limit = 20) {
  return getDb()
    .prepare(
      `SELECT id, name, category, note, recipe_count AS recipeCount, cook_count AS cookCount
       FROM restaurants
       WHERE status = 'published'
       ORDER BY recipe_count DESC, cook_count DESC, id DESC
       LIMIT ?`,
    )
    .all(limit)
}

/**
 * 用户口味画像：把他打过高分 / 收藏过 / 照着配过的配方的口味值取平均。
 * 没有行为数据时返回 null，由调用方退回到全站平均。
 */
export function userTaste(userId) {
  if (!userId) return null

  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n,
              AVG(r.heat_score) AS heat,
              AVG(r.salt_score) AS salt,
              AVG(r.rich_score) AS rich
       FROM recipes r
       WHERE r.status = 'published'
         AND (
           EXISTS (SELECT 1 FROM ratings x WHERE x.recipe_id = r.id AND x.user_id = ? AND x.score >= 4)
           OR EXISTS (SELECT 1 FROM favorites f WHERE f.recipe_id = r.id AND f.user_id = ?)
           OR EXISTS (SELECT 1 FROM cook_logs c WHERE c.recipe_id = r.id AND c.user_id = ?)
         )`,
    )
    .get(userId, userId, userId)

  if (!row || !row.n) return null
  return { heat: row.heat ?? 0, salt: row.salt ?? 0, rich: row.rich ?? 0, samples: row.n }
}

/** 用户已经互动过的配方 id，推荐时要降权，避免老是推同一条。 */
export function interactedRecipeIds(userId) {
  if (!userId) return new Set()

  const db = getDb()
  const ids = new Set()
  for (const sql of [
    'SELECT recipe_id AS id FROM ratings WHERE user_id = ?',
    'SELECT recipe_id AS id FROM favorites WHERE user_id = ?',
    'SELECT recipe_id AS id FROM cook_logs WHERE user_id = ?',
  ]) {
    for (const row of db.prepare(sql).all(userId)) ids.add(row.id)
  }
  return ids
}

/** 按店名 / 店备注模糊搜索。 */
export function searchRestaurants(keyword, limit = 8) {
  const like = `%${keyword}%`
  return getDb()
    .prepare(
      `SELECT id, name, category, note, recipe_count AS recipeCount, cook_count AS cookCount
       FROM restaurants
       WHERE status = 'published' AND (name LIKE ? OR note LIKE ? OR category LIKE ?)
       ORDER BY recipe_count DESC, id DESC
       LIMIT ?`,
    )
    .all(like, like, like, limit)
}

/** 按标题 / 描述 / 标签模糊搜索配方。 */
export function searchRecipes(keyword, limit = 8) {
  const like = `%${keyword}%`
  return getDb()
    .prepare(
      `SELECT DISTINCT ${RECIPE_FIELDS}
       FROM recipes r
       JOIN restaurants s ON s.id = r.restaurant_id
       LEFT JOIN recipe_tags rt ON rt.recipe_id = r.id
       LEFT JOIN tags t ON t.id = rt.tag_id
       WHERE r.status = 'published' AND s.status = 'published'
         AND (r.title LIKE ? OR r.description LIKE ? OR t.name LIKE ?)
       ORDER BY r.hot_score DESC, r.id DESC
       LIMIT ?`,
    )
    .all(like, like, like, limit)
}

/** 配方的标签，用于给推荐结果补充可读信息。 */
export function recipeTags(recipeIds) {
  if (!recipeIds.length) return new Map()
  const marks = recipeIds.map(() => '?').join(',')
  const rows = getDb()
    .prepare(
      `SELECT rt.recipe_id AS recipeId, t.name
       FROM recipe_tags rt
       JOIN tags t ON t.id = rt.tag_id
       WHERE rt.recipe_id IN (${marks})
       ORDER BY t.sort_order`,
    )
    .all(...recipeIds)

  const map = new Map()
  for (const row of rows) {
    if (!map.has(row.recipeId)) map.set(row.recipeId, [])
    map.get(row.recipeId).push(row.name)
  }
  return map
}

/** 全站口味均值，作为匿名用户的默认画像。 */
export function globalTaste() {
  const row = getDb()
    .prepare(
      `SELECT AVG(heat_score) AS heat, AVG(salt_score) AS salt, AVG(rich_score) AS rich
       FROM recipes WHERE status = 'published'`,
    )
    .get()
  return { heat: row?.heat ?? 40, salt: row?.salt ?? 50, rich: row?.rich ?? 40 }
}
