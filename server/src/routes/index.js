// 路由聚合。
//
// 加一个新资源 = 新建 routes/xxx.js + 在这里加一行。
// 每个模块只关心自己的路径，前缀统一在挂载点处理。
import { Router } from 'express'
import authRoutes from './auth.js'
import restaurantRoutes from './restaurants.js'
import recipeRoutes from './recipes.js'
import userRoutes from './users.js'
import condimentRoutes from './condiments.js'
import tagRoutes from './tags.js'
import submissionRoutes from './submissions.js'
import aiRoutes from '../ai/index.js'
import { ok } from '../utils/response.js'
import { getDb } from '../db/index.js'

const router = Router()

/** 健康检查。dbOk 真的查一次库，而不是只回一个 ok:true —— 那样没意义。 */
router.get('/health', (_req, res) => {
  let dbOk = false
  try {
    getDb().prepare('SELECT 1 AS x').get()
    dbOk = true
  } catch {
    dbOk = false
  }
  return ok(res, { ok: dbOk, dbOk, version: '1.0.0', time: new Date().toISOString() })
})

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/restaurants', restaurantRoutes)
router.use('/recipes', recipeRoutes)
router.use('/condiments', condimentRoutes)
router.use('/tags', tagRoutes)
router.use('/submissions', submissionRoutes)

// AI 推荐 / 搜索 / 对话。整个模块在 src/ai/ 里，删掉这行就等于关掉功能。
router.use('/ai', aiRoutes)

export default router
