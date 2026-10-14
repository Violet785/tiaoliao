import { Router } from 'express'
import * as recipeService from '../services/recipeService.js'
import * as ratingService from '../services/ratingService.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { ok, okList } from '../utils/response.js'
import { str, arr, int, bool, pagination, pathId } from '../middleware/validate.js'
import { badRequest } from '../utils/errors.js'

const router = Router()

/** 校验并规范化前端传来的明细行 */
function readItems(body) {
  const items = arr(body, 'items', { required: true, max: 30, label: '调料' })
  if (items.length === 0) throw badRequest('至少要加一样调料')

  return items.map((it, i) => {
    const condimentId = it?.condimentId
    if (!condimentId || typeof condimentId !== 'string') {
      throw badRequest(`第 ${i + 1} 样调料缺少 condimentId`)
    }
    const amountLevel = Number(it.amountLevel)
    if (!Number.isInteger(amountLevel) || amountLevel < 0 || amountLevel > 5) {
      throw badRequest(`第 ${i + 1} 样调料的用量必须是 0–5`)
    }
    return {
      condimentId,
      amountLevel,
      amountNote: String(it.amountNote ?? '').slice(0, 60),
    }
  })
}

function readTags(body) {
  const pick = (field) =>
    arr(body, field, { max: 10, label: field })
      .filter((v) => typeof v === 'string')
      .slice(0, 10)
  return {
    tasteTags: pick('tasteTags'),
    foodTags: pick('foodTags'),
    sceneTags: pick('sceneTags'),
  }
}

/** 全站配方流（「发现」页）。也支持按标签筛选。 */
router.get('/', (req, res) => {
  const { page, pageSize, offset } = pagination(req.query)
  const result = recipeService.list({
    keyword: req.query.keyword ?? '',
    sort: req.query.sort ?? 'hot',
    tasteTag: req.query.tasteTag ?? '',
    foodTag: req.query.foodTag ?? '',
    page, pageSize, offset,
  })
  return okList(res, result.list, { page, pageSize, total: result.total })
})

router.post('/', requireAuth, (req, res) => {
  const recipeId = recipeService.create(
    {
      restaurantId: int(req.body, 'restaurantId', { min: 1, label: '餐馆' }),
      title: str(req.body, 'title', { max: 40, label: '配方名' }),
      description: str(req.body, 'description', { required: false, max: 200, label: '简介' }),
      servingNote: str(req.body, 'servingNote', { required: false, max: 60, label: '分量说明' }),
      items: readItems(req.body),
      ...readTags(req.body),
      clientToken: str(req.body, 'clientToken', { required: false, max: 64 }) || null,
    },
    req.user.id,
  )

  res.status(201)
  return ok(res, recipeService.detail(recipeId, req.user.id))
})

// optionalAuth：不登录也能看配方（浏览不该有门槛），
// 但登录后要多返回 myRating / isFavorite / isAuthor
router.get('/:id', optionalAuth, (req, res) =>
  ok(res, recipeService.detail(pathId(req.params.id), req.user?.id ?? null)))

/**
 * ★「照着配」预编排包。
 *
 * 单独一个接口而不是塞进详情里，是因为它要能被整个缓存下来离线使用 ——
 * 用户站在调料台前信号往往很差，一次拉全，之后断网也能走完。
 */
router.get('/:id/cook', (req, res) =>
  ok(res, recipeService.cookSession(pathId(req.params.id))))

router.patch('/:id', requireAuth, (req, res) => {
  const id = pathId(req.params.id)
  recipeService.update(
    id,
    {
      title: str(req.body, 'title', { max: 40, label: '配方名' }),
      description: str(req.body, 'description', { required: false, max: 200, label: '简介' }),
      servingNote: str(req.body, 'servingNote', { required: false, max: 60, label: '分量说明' }),
      items: readItems(req.body),
      ...readTags(req.body),
    },
    req.user.id,
  )
  return ok(res, recipeService.detail(id, req.user.id))
})

router.delete('/:id', requireAuth, (req, res) =>
  ok(res, recipeService.remove(pathId(req.params.id), req.user.id)))

// ─────────── 打卡 ───────────

router.post('/:id/cook-log', requireAuth, (req, res) =>
  ok(res, recipeService.logCook(pathId(req.params.id), req.user.id, {
    finished: bool(req.body, 'finished'),
    stepReached: int(req.body, 'stepReached', { required: false, min: 0, max: 100 }) ?? 0,
    skipped: arr(req.body, 'skipped', { max: 30 }).filter((v) => typeof v === 'string'),
    substituted: arr(req.body, 'substituted', { max: 30 }),
  })))

// ─────────── 评分 ───────────

router.put('/:id/rating', requireAuth, (req, res) =>
  ok(res, ratingService.upsert(pathId(req.params.id), req.user.id, {
    score: int(req.body, 'score', { min: 1, max: 5, label: '评分' }),
    content: str(req.body, 'content', { required: false, max: 500, label: '评价' }),
    tasteOk: req.body?.tasteOk === undefined || req.body?.tasteOk === null
      ? null
      : bool(req.body, 'tasteOk'),
  })))

router.delete('/:id/rating', requireAuth, (req, res) =>
  ok(res, ratingService.removeMine(pathId(req.params.id), req.user.id)))

router.get('/:id/ratings', (req, res) => {
  const { page, pageSize, offset } = pagination(req.query)
  const result = ratingService.listByRecipe(pathId(req.params.id), { page, pageSize, offset })
  return okList(res, result.list, { page, pageSize, total: result.total })
})

// ─────────── 收藏 ───────────

router.post('/:id/favorite', requireAuth, (req, res) =>
  ok(res, ratingService.addFavorite(pathId(req.params.id), req.user.id)))

router.delete('/:id/favorite', requireAuth, (req, res) =>
  ok(res, ratingService.removeFavorite(pathId(req.params.id), req.user.id)))

export default router
