import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { pagination, int } from '../middleware/validate.js'
import { ok } from '../utils/response.js'
import * as service from '../services/notificationService.js'
const router = Router()
router.use(requireAuth)
router.get('/', (req, res) => ok(res, service.list(req.user.id, pagination(req.query))))
router.post('/read', (req, res) => ok(res, service.markRead(req.user.id, int(req.body, 'throughId', { min: 1 }))))
export default router
