import { Router } from 'express'
import * as restaurantService from '../services/restaurantService.js'
import * as recipeService from '../services/recipeService.js'
import { submit } from '../services/submissionService.js'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { ok, okList } from '../utils/response.js'
import { str, pagination, pathId } from '../middleware/validate.js'
const router = Router()
router.get('/', (req, res) => {
  const result = restaurantService.list({ ...pagination(req.query), keyword: str(req.query, 'keyword', { required: false, max: 60 }), sort: req.query.sort })
  return okList(res, result.list, result)
})
router.get('/similar', (req, res) => ok(res, restaurantService.findSimilar({ name: str(req.query, 'name', { max: 60 }) })))
router.post('/', requireAuth, (req, res) => {
  res.status(202)
  return ok(res, submit('restaurant', req.body, req.user.id))
})
router.get('/:id', (req, res) => ok(res, restaurantService.detail(pathId(req.params.id))))
router.get('/:id/recipes', optionalAuth, (req, res) => {
  const shop = restaurantService.findById(pathId(req.params.id))
  const result = recipeService.list({ ...pagination(req.query), restaurantId: shop.id, sort: req.query.sort, currentUserId: req.user?.id })
  return okList(res, result.list, result)
})
export default router
