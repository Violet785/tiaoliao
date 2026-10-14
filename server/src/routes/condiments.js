import { Router } from 'express'
import * as condimentService from '../services/condimentService.js'
import { requireAuth } from '../middleware/auth.js'
import { ok } from '../utils/response.js'
import { str, enumOf } from '../middleware/validate.js'
import { CATEGORY_ORDER } from '../constants.js'

const router = Router()

/**
 * 调料库。低频变动，所以带上 ETag 与长缓存 ——
 * 前端首次拉取后本地存 24 小时，之后每次进创作页都秒开。
 * 客户端下次带 If-None-Match 时直接回 304，连响应体都不用传。
 */
router.get('/', (req, res) => {
  const payload = condimentService.listGrouped()
  const etag = condimentService.etagOf(payload)

  res.set('ETag', etag)
  res.set('Cache-Control', 'public, max-age=86400')

  if (req.get('if-none-match') === etag) return res.status(304).end()
  return ok(res, payload)
})

/** 用户补充新调料 —— 进待审状态，不直接发布（见 service 里的说明） */
router.post('/', requireAuth, (req, res) => {
  const result = condimentService.createSuggestion({
    name: str(req.body, 'name', { min: 1, max: 20, label: '调料名' }),
    category: enumOf(req.body, 'category', CATEGORY_ORDER, { label: '类目' }),
    unitHint: str(req.body, 'unitHint', { required: false, max: 4 }) || '勺',
    glyph: str(req.body, 'glyph', { required: false, max: 2 }) || '',
    userId: req.user.id,
  })
  res.status(202)
  return ok(res, result, '已提交，审核通过后即可使用')
})

export default router
