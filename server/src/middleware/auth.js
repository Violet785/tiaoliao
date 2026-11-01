// 鉴权中间件。
//
// 用的是不透明 session token 而不是 JWT。理由：
//  · 可撤销 —— 封禁用户 / 主动登出时删一行就生效，JWT 得等过期或用黑名单
//  · role 改动即时生效，不用等 token 刷新
//  · 少一个依赖（jsonwebtoken）
import { getDb } from '../db/index.js'
import { unauthorized, forbidden } from '../utils/errors.js'

const USER_COLUMNS = 'id, username, nickname, avatar_url, role, status, created_at'

/** 从 Authorization: Bearer <token> 解析出 token */
function extractToken(req) {
  const header = req.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return m ? m[1] : null
}

/** 查会话并返回用户；无效则返回 null（不抛错，供 optionalAuth 复用） */
function resolveUser(req) {
  const token = extractToken(req)
  if (!token) return null

  const db = getDb()
  const row = db
    .prepare(
      `SELECT u.${USER_COLUMNS.split(', ').join(', u.')}, s.token
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
    )
    .get(token)

  if (!row) return null
  if (row.status === 'banned') throw forbidden('账号已被封禁')

  const { token: _t, ...user } = row
  return user
}

/** 必须登录。未登录抛 401，由 error 中间件统一转成响应。 */
export function requireAuth(req, _res, next) {
  try {
    const user = resolveUser(req)
    if (!user) throw unauthorized()
    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * 可选登录。
 * 给配方详情这类「不登录也能看，但登录后要多返回 myRating / isAuthor」的接口用。
 */
export function optionalAuth(req, _res, next) {
  try {
    req.user = resolveUser(req)
  } catch {
    req.user = null   // 可选场景下 token 有问题就当未登录，不打断浏览
  }
  next()
}

/** 需要管理员角色 */
export function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized())
  if (req.user.role !== 'admin') {
    return next(forbidden('需要管理员权限'))
  }
  next()
}
