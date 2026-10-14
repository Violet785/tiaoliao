import { Router } from 'express'
import * as condimentService from '../services/condimentService.js'
import { ok } from '../utils/response.js'

const router = Router()

const KINDS = ['taste', 'food', 'scene']

/**
 * 标签。与调料库一样是低频元数据，带 ETag + 长缓存。
 * 不带 kind 时返回三组（前端筛选条一次拿全），带 kind 时只返回一组。
 */
router.get('/', (req, res) => {
  const kind = KINDS.includes(req.query.kind) ? req.query.kind : null
  const payload = condimentService.listTags(kind)
  const etag = condimentService.etagOf(payload)

  res.set('ETag', etag)
  res.set('Cache-Control', 'public, max-age=86400')

  if (req.get('if-none-match') === etag) return res.status(304).end()
  return ok(res, payload)
})

export default router
