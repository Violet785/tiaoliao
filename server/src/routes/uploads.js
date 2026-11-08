import express, { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { upload, readImage, previewImages } from '../services/mediaService.js'
import { arr } from '../middleware/validate.js'
import { getDb } from '../db/index.js'
import { badRequest } from '../utils/errors.js'
import { ok } from '../utils/response.js'
const router = Router()
router.post('/previews', requireAuth, express.json({ limit: '8kb' }), (req, res) => {
  const ids = arr(req.body, 'imageIds', { max: 4 })
  if (ids.some(id => typeof id !== 'string' || !getDb().prepare('SELECT 1 FROM uploads WHERE id = ? AND user_id = ?').get(id, req.user.id))) throw badRequest('只能恢复自己上传的图片')
  return ok(res, { images: previewImages(ids) })
})
router.post('/', requireAuth, express.json({ limit: '7mb' }), (req, res) => {
  res.status(201)
  return ok(res, upload(req.body?.base64, req.user.id))
})
router.get('/:id', (req, res) => {
  const image = readImage(req.params.id, req.query)
  res.set('Content-Type', image.mime)
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Cache-Control', image.published ? 'public, max-age=300' : 'private, no-store')
  res.sendFile(image.file)
})
export default router
