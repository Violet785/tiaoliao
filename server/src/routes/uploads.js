import express, { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { upload, readImage } from '../services/mediaService.js'
import { ok } from '../utils/response.js'
const router = Router()
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
