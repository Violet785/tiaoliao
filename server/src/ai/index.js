// AI 模块的路由。挂载点：/api/ai（见 routes/index.js 末尾那一行）。
//
// 三个接口对应两个前端形态：
//   GET  /recommend  小窗口和首页卡片用的推荐
//   POST /chat       小窗口的实时对话
//   GET  /search     独立页面的搜索资讯
//
// 所有接口都做了降级：没有 AI_API_KEY 时照常返回数据，只是 source 变成 rule。
import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import { ok } from '../utils/response.js'
import { badRequest } from '../utils/errors.js'
import { aiConfig } from './config.js'
import { recommendRecipes } from './recommend.js'
import { chatReply } from './chat.js'
import { searchInfo } from './search.js'
import { pathId } from '../middleware/validate.js'
import { readRecipeFilters } from '../utils/recipeFilters.js'

const router = Router()

/** 把 limit 限制在合理范围，避免有人拿 limit=99999 打库 */
function takeLimit(raw, fallback = 6, max = 12) {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, 1), max)
}

/** 前端靠这个判断要不要显示「演示模式」角标 */
router.get('/status', (_req, res) =>
  ok(res, {
    enabled: aiConfig.enabled,
    mode: aiConfig.enabled ? 'ai' : 'rule',
    model: aiConfig.enabled ? aiConfig.model : null,
  }),
)

router.get('/recommend', optionalAuth, (req, res) => {
  const limit = takeLimit(req.query.limit)
  const result = recommendRecipes({ userId: req.user?.id ?? null, limit, restaurantId: req.query.restaurantId ? pathId(req.query.restaurantId) : null })
  res.set('Cache-Control', 'private, no-store')
  return ok(res, {
    mode: aiConfig.enabled ? 'ai' : 'rule',
    personalized: result.personalized,
    profile: result.profile,
    feedback: result.feedback,
    list: result.list,
  })
})

router.get('/search', optionalAuth, async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (!q) throw badRequest('请输入搜索关键词')

  const result = await searchInfo({ q, limit: takeLimit(req.query.limit, 6, 12) })
  return ok(res, result)
})

router.post('/chat', optionalAuth, async (req, res) => {
  const message = String(req.body?.message ?? '').trim()
  if (!message) throw badRequest('消息不能为空')
  if (message.length > 300) throw badRequest('消息不能超过 300 个字符')

  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : []
  const result = await chatReply({
    message,
    history,
    userId: req.user?.id ?? null,
    restaurantId: req.body?.restaurantId == null ? null : pathId(req.body.restaurantId),
    preferences: readRecipeFilters(req.body?.preferences || {}),
  })
  res.set('Cache-Control', 'private, no-store')
  return ok(res, result)
})

export default router
