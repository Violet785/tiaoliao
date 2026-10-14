import { Router } from 'express'
import * as restaurantService from '../services/restaurantService.js'
import * as recipeService from '../services/recipeService.js'
import { requireAuth } from '../middleware/auth.js'
import { ok, okList } from '../utils/response.js'
import { str, bool, pagination, pathId } from '../middleware/validate.js'

const router = Router()

const CATEGORIES = ['自助餐', '火锅', '烤肉', '麻辣烫', '冒菜', '其他']

/** 搜索 / 列表。未登录也能用 —— 浏览不该有门槛。 */
router.get('/', (req, res) => {
  const { page, pageSize, offset } = pagination(req.query)
  const result = restaurantService.list({
    keyword: req.query.keyword ?? '',
    city: req.query.city ?? '',
    sort: req.query.sort ?? 'hot',
    page, pageSize, offset,
  })
  return okList(res, result.list, { page, pageSize, total: result.total })
})

/**
 * 查重预检。前端在用户填完店名、失焦时调用，
 * 命中就提示「已为你匹配到 XX，不是这家？」——把重复数据拦在提交之前。
 * 注意：必须放在 /:id 之前，否则 'similar' 会被当成 id 匹配掉。
 */
router.get('/similar', (req, res) => {
  const name = str(req.query, 'name', { max: 60, label: '店名' })
  return ok(res, restaurantService.findSimilar({
    name,
    address: req.query.address ?? '',
    city: req.query.city ?? '',
    landmark: req.query.landmark ?? '',
  }))
})

router.post('/', requireAuth, (req, res) => {
  const result = restaurantService.create(
    {
      name: str(req.body, 'name', { max: 60, label: '店名' }),
      address: str(req.body, 'address', { required: false, max: 120, label: '地址' }),
      city: str(req.body, 'city', { required: false, max: 30, label: '城市' }),
      landmark: str(req.body, 'landmark', { required: false, max: 60, label: '位置提示' }),
      category: CATEGORIES.includes(req.body?.category) ? req.body.category : '自助餐',
      note: str(req.body, 'note', { required: false, max: 200, label: '备注' }),
      clientToken: str(req.body, 'clientToken', { required: false, max: 64 }) || null,
      // 用户在「是不是这家？」里选了「都不是」之后带这个标记重提，
      // 跳过相似度拦截强行新建（见 service 里的说明）
      forceCreate: bool(req.body, 'forceCreate'),
    },
    req.user.id,
  )

  // 新建返回 201，复用已有店返回 200 —— 让客户端能区分这两件事
  res.status(result.created ? 201 : 200)
  return ok(res, result)
})

router.get('/:id', (req, res) => ok(res, restaurantService.detail(pathId(req.params.id))))

/** 该店的配方列表。这是产品的核心视图：配方是绑在店上的。 */
router.get('/:id/recipes', (req, res) => {
  const id = pathId(req.params.id)
  restaurantService.findById(id)   // 店不存在直接 404，而不是返回空列表

  const { page, pageSize, offset } = pagination(req.query)
  const result = recipeService.list({
    restaurantId: id,
    sort: req.query.sort ?? 'hot',
    tasteTag: req.query.tasteTag ?? '',
    foodTag: req.query.foodTag ?? '',
    page, pageSize, offset,
  })
  return okList(res, result.list, { page, pageSize, total: result.total })
})

export default router
