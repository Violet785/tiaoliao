import { Router } from 'express'
import { getDb } from '../db/index.js'
import * as authService from '../services/authService.js'
import { requireAuth } from '../middleware/auth.js'
import { ok, okList } from '../utils/response.js'
import { str, pagination, pathId } from '../middleware/validate.js'
import { notFound } from '../utils/errors.js'

const router = Router()

// ⚠️ 路由顺序有讲究：/me 系列必须声明在 /:id 之前。
// 否则 GET /api/users/me 会先命中 /:id（id='me'），直接报「id 不合法」。

router.patch('/me', requireAuth, (req, res) => {
  const nickname = str(req.body, 'nickname', { min: 1, max: 20, label: '昵称' })
  const avatarUrl = str(req.body, 'avatarUrl', { required: false, max: 300 }) || null

  getDb()
    .prepare(
      `UPDATE users SET nickname = ?, avatar_url = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE id = ?`,
    )
    .run(nickname, avatarUrl, req.user.id)

  return ok(res, { user: authService.findById(req.user.id) })
})

router.get('/me/recipes', requireAuth, (req, res) => {
  const { page, pageSize, offset } = pagination(req.query)
  const db = getDb()

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM recipes WHERE user_id = ? AND status = 'published'`)
    .get(req.user.id).n

  const list = db
    .prepare(
      `SELECT r.id, r.title, r.rating_avg AS ratingAvg, r.rating_count AS ratingCount,
              r.cook_count AS cookCount, r.item_count AS itemCount,
              r.created_at AS createdAt, s.id AS restaurantId, s.name AS restaurantName
       FROM recipes r JOIN restaurants s ON s.id = r.restaurant_id
       WHERE r.user_id = ? AND r.status = 'published'
       ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    )
    .all(req.user.id, pageSize, offset)

  return okList(res, list, { page, pageSize, total })
})

router.get('/me/favorites', requireAuth, (req, res) => {
  const { page, pageSize, offset } = pagination(req.query)
  const db = getDb()

  const total = db
    .prepare('SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?')
    .get(req.user.id).n

  const list = db
    .prepare(
      `SELECT r.id, r.title, r.rating_avg AS ratingAvg, r.rating_count AS ratingCount,
              r.cook_count AS cookCount, r.item_count AS itemCount,
              r.created_at AS createdAt, s.id AS restaurantId, s.name AS restaurantName,
              f.created_at AS favoritedAt
       FROM favorites f
       JOIN recipes r ON r.id = f.recipe_id
       JOIN restaurants s ON s.id = r.restaurant_id
       WHERE f.user_id = ? AND r.status = 'published'
       ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(req.user.id, pageSize, offset)

  return okList(res, list, { page, pageSize, total })
})

router.get('/me/ratings', requireAuth, (req, res) => {
  const { page, pageSize, offset } = pagination(req.query)
  const db = getDb()

  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM ratings WHERE user_id = ? AND status = 'published'`)
    .get(req.user.id).n

  const list = db
    .prepare(
      `SELECT rt.score, rt.content, rt.taste_ok AS tasteOk, rt.updated_at AS updatedAt,
              r.id AS recipeId, r.title AS recipeTitle, s.name AS restaurantName
       FROM ratings rt
       JOIN recipes r ON r.id = rt.recipe_id
       JOIN restaurants s ON s.id = r.restaurant_id
       WHERE rt.user_id = ? AND rt.status = 'published'
       ORDER BY rt.updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(req.user.id, pageSize, offset)

  return okList(res, list, { page, pageSize, total })
})

/** 他人的公开主页。放在最后，避免吃掉上面的 /me 系列。 */
router.get('/:id', (req, res) => {
  const id = pathId(req.params.id)
  const user = authService.findById(id)
  if (!user) throw notFound('用户不存在')

  // 不返回 username —— 避免被人拿去撞库或骚扰
  return ok(res, {
    user: {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    },
    stats: authService.statsOf(id),
  })
})

export default router
