// 根据当前投票即时计算，不缓存用户画像，取消或切换评价后下一次请求立即生效。
import { getDb } from '../db/index.js'
import * as recipes from './recipeService.js'
import { findById } from './restaurantService.js'

function features(ids) {
  const db = getDb(), result = new Map()
  // 分批绑定，避免历史反馈较多时超过 SQLite 参数上限。
  for (let start = 0; start < ids.length; start += 300) {
    const batch = ids.slice(start, start + 300), marks = batch.map(() => '?').join(',')
    for (const r of db.prepare(`SELECT id, heat_score AS heat, salt_score AS salt, rich_score AS rich FROM recipes WHERE id IN (${marks})`).all(...batch)) {
      result.set(r.id, { ...r, ingredients: new Set(), tags: new Set() })
    }
    for (const it of db.prepare(`SELECT recipe_id AS id, condiment_id AS ingredient FROM recipe_items WHERE recipe_id IN (${marks}) AND amount_level > 0`).all(...batch)) result.get(it.id)?.ingredients.add(it.ingredient)
    for (const tag of db.prepare(`SELECT rt.recipe_id AS id, rt.tag_id AS tag FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id IN (${marks}) AND t.status = 'published' AND t.kind IN ('taste','food')`).all(...batch)) result.get(tag.id)?.tags.add(tag.tag)
  }
  return result
}
function overlap(a, b) {
  if (!a.size && !b.size) return 0
  let shared = 0
  for (const key of a) if (b.has(key)) shared++
  return shared / (a.size + b.size - shared)
}
function similarity(a, b) {
  const distance = Math.sqrt(0.45 * ((a.heat - b.heat) / 100) ** 2 + 0.3 * ((a.salt - b.salt) / 100) ** 2 + 0.25 * ((a.rich - b.rich) / 100) ** 2)
  return 0.35 * Math.max(0, 1 - distance) + 0.4 * overlap(a.ingredients, b.ingredients) + 0.25 * overlap(a.tags, b.tags)
}
function affinity(candidate, history) {
  if (!history.length) return 0
  const values = history.map(item => similarity(candidate, item))
  // 兼顾最接近的一种喜好与整体喜好，避免喜欢多种风味后被平均成中间口味。
  return 0.7 * values.reduce((best, value) => Math.max(best, value), 0) + 0.3 * values.reduce((a, b) => a + b, 0) / values.length
}

export function recommend({ restaurantId = null, userId = null, limit = 6, filters = {} } = {}) {
  const db = getDb(), restaurant = restaurantId ? findById(restaurantId) : null
  // 候选先限制到本店并应用筛选，不能先取全站热门再按店过滤。
  const poolSize = db.prepare(`SELECT COUNT(*) AS n FROM recipes r JOIN restaurants s ON s.id = r.restaurant_id
    WHERE r.status = 'published' AND s.status = 'published' ${restaurant ? 'AND r.restaurant_id = ?' : ''}`).get(...(restaurant ? [restaurant.id] : [])).n
  const pool = recipes.list({ ...filters, restaurantId: restaurant?.id || null, pageSize: Math.max(poolSize, 1), currentUserId: userId }).list
  const votes = userId ? db.prepare(`SELECT v.recipe_id AS id, v.value FROM recipe_votes v
    JOIN recipes r ON r.id = v.recipe_id JOIN restaurants s ON s.id = r.restaurant_id
    WHERE v.user_id = ? AND r.status = 'published' AND s.status = 'published'`).all(userId) : []
  const liked = votes.filter(v => v.value === 1), disliked = votes.filter(v => v.value === -1)
  const dislikedIds = new Set(disliked.map(v => v.id)), likedIds = new Set(liked.map(v => v.id))
  const byId = features([...new Set([...pool.map(r => r.id), ...votes.map(v => v.id)])])
  const positives = liked.map(v => byId.get(v.id)), negatives = disliked.map(v => byId.get(v.id))
  const personalized = votes.length > 0, candidates = pool.filter(r => !dislikedIds.has(r.id))
  const maxHot = candidates.reduce((max, r) => Math.max(max, r.hotScore || 0), 1)
  const ranked = candidates.map(recipe => {
    const feature = byId.get(recipe.id), positive = affinity(feature, positives), negative = affinity(feature, negatives)
    const community = (recipe.likeCount + 1) / (recipe.likeCount + recipe.dislikeCount + 2)
    const popularity = 0.65 * (recipe.hotScore || 0) / maxHot + 0.35 * community
    const score = personalized ? 0.68 * positive - 0.62 * negative + 0.2 * popularity + (likedIds.has(recipe.id) ? 0.08 : 0) : popularity
    let reason = `先按${restaurant ? '本店' : '全站'}的点赞与使用情况推荐，留下喜好后会更贴合你`
    if (likedIds.has(recipe.id)) reason = '你点过赞的一碗，可以再配一次'
    else if (positives.length && positive >= 0.45) reason = '调料、口味或搭配与曾点赞的配方相近'
    else if (positives.length && negatives.length) reason = '综合你的点赞与不喜欢排序，尝试另一种风味'
    else if (positives.length) reason = '结合你的点赞口味，提供一个可尝试的选择'
    else if (negatives.length) reason = '已避开你点过不喜欢的配方，并降低相近口味排序'
    return { recipe, score, positive, negative, reason }
  }).sort((a, b) => b.score - a.score || b.recipe.id - a.recipe.id)
  const safeLimit = Math.max(1, Math.min(20, Number.isFinite(limit) ? Math.floor(limit) : 6))
  return {
    restaurant: restaurant ? { id: restaurant.id, name: restaurant.name } : null,
    source: 'votes', personalized, loginRequired: !userId,
    profile: positives.length ? { heat: positives.reduce((sum, f) => sum + f.heat, 0) / positives.length,
      salt: positives.reduce((sum, f) => sum + f.salt, 0) / positives.length,
      rich: positives.reduce((sum, f) => sum + f.rich, 0) / positives.length, samples: positives.length } : null,
    feedback: { likes: liked.length, dislikes: disliked.length },
    eligibleCount: candidates.length, excludedCount: pool.length - candidates.length,
    emptyReason: !pool.length ? 'no_recipes' : !candidates.length ? 'all_disliked' : null,
    list: ranked.slice(0, safeLimit).map(({ recipe, score, reason }) => ({ ...recipe, tasteProfile: { heat: byId.get(recipe.id).heat, salt: byId.get(recipe.id).salt, rich: byId.get(recipe.id).rich }, recommendationReason: reason, recommendationScore: Number(score.toFixed(4)) })),
  }
}
