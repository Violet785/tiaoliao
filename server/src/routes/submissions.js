import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { pagination, pathId, str } from '../middleware/validate.js'
import { ok, okList } from '../utils/response.js'
import * as service from '../services/submissionService.js'
const router = Router()
router.use(requireAuth)
router.post('/', (req, res) => { res.status(202); return ok(res, service.submit(req.body?.kind, req.body, req.user.id)) })
router.get('/mine', (req, res) => {
  const result = service.list({ ...pagination(req.query), userId: req.user.id })
  return okList(res, result.list, result)
})
router.get('/', requireAdmin, (req, res) => {
  const result = service.list({ ...pagination(req.query), status: req.query.status || '', kind: req.query.kind || '' })
  return okList(res, result.list, result)
})
router.post('/:id/review', requireAdmin, (req, res) => ok(res, service.review(pathId(req.params.id), req.body?.action,
  str(req.body, 'note', { required: false, max: 500 }), req.user.id)))
export default router
