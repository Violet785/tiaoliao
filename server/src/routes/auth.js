import { Router } from 'express'
import * as authService from '../services/authService.js'
import { requireAuth } from '../middleware/auth.js'
import { ok } from '../utils/response.js'
import { str } from '../middleware/validate.js'
import { AppError, CODES } from '../utils/errors.js'
import config from '../config.js'

const router = Router()

router.post('/register', (req, res) => {
  const username = str(req.body, 'username', { min: 3, max: 20, label: '用户名' })
  const password = str(req.body, 'password', { min: 6, max: 64, label: '密码' })
  const nickname = str(req.body, 'nickname', { required: false, max: 20, label: '昵称' })

  return ok(res, authService.register({ username, password, nickname }))
})

router.post('/login', (req, res) => {
  const username = str(req.body, 'username', { max: 20, label: '用户名' })
  const password = str(req.body, 'password', { max: 64, label: '密码' })
  const platform = str(req.body, 'platform', { required: false, max: 10 }) || 'h5'

  return ok(res, authService.login({ username, password, platform }))
})

/**
 * 微信一键登录。
 *
 * 现在是个明确的桩：拿到 AppID + AppSecret 填进 .env 后，
 * 把下面的 TODO 换成调用 https://api.weixin.qq.com/sns/jscode2session 即可，
 * 表结构（users.wx_openid）和前端流程都已经预留好了，不需要改别的地方。
 */
router.post('/wechat-login', (_req, _res) => {
  if (!config.wx.enabled) {
    throw new AppError(
      CODES.BAD_REQUEST,
      '微信登录尚未配置。请在 server/.env 中填写 WX_APPID 与 WX_SECRET 后重启服务。',
    )
  }
  // TODO: 调用 jscode2session 换 openid → 查/建用户 → createSession
  throw new AppError(CODES.SERVER_ERROR, '微信登录未实现')
})

router.get('/me', requireAuth, (req, res) => ok(res, { user: req.user }))

router.post('/logout', requireAuth, (req, res) => {
  const header = req.get('authorization') || ''
  const token = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1] ?? null
  return ok(res, authService.logout(token))
})

export default router
