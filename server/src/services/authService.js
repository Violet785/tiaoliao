// 账号与会话。
import { getDb } from '../db/index.js'
import { hashPassword, verifyPassword, newSessionToken } from '../utils/password.js'
import { badRequest, conflict, unauthorized } from '../utils/errors.js'
import config from '../config.js'

const PUBLIC_COLUMNS = 'id, username, nickname, avatar_url, role, status, created_at'

/** 去掉敏感字段（password_hash），只返回能公开的部分 */
function toPublicUser(row) {
  if (!row) return null
  const { password_hash: _ph, wx_openid: _wx, ...rest } = row
  return rest
}

/** 生成并落库一个会话，返回 token 与过期时间 */
export function createSession(userId, platform = 'h5') {
  const db = getDb()
  const token = newSessionToken()
  const expiresAt = new Date(
    Date.now() + config.sessionDays * 24 * 60 * 60 * 1000,
  ).toISOString().replace(/\.\d{3}Z$/, 'Z')   // 与库中其它时间格式保持一致

  db.prepare(
    'INSERT INTO sessions (token, user_id, platform, expires_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, platform, expiresAt)

  return { token, expiresAt }
}

export function register({ username, password, nickname }) {
  const db = getDb()

  // 用户名限制成字母数字下划线：避免跟昵称混淆，也便于以后做 @提及
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw badRequest('用户名需为 3–20 位字母、数字或下划线')
  }
  if (password.length < 6) {
    throw badRequest('密码至少 6 位')
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (exists) throw conflict('该用户名已被注册')

  const info = db
    .prepare(
      `INSERT INTO users (username, password_hash, nickname)
       VALUES (?, ?, ?)`,
    )
    .run(username, hashPassword(password), nickname || username)

  const user = db
    .prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`)
    .get(info.lastInsertRowid)

  return { user, ...createSession(user.id, 'h5') }
}

export function login({ username, password, platform = 'h5' }) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username)

  // 用户名不存在和密码错误返回同一句话 —— 不要泄露「这个用户名存在」
  if (!row || !verifyPassword(password, row.password_hash)) {
    throw unauthorized('用户名或密码错误')
  }
  if (row.status === 'banned') throw unauthorized('账号已被封禁')

  const user = toPublicUser(row)
  return { user, ...createSession(user.id, platform) }
}

export function logout(token) {
  if (!token) return { ok: true }
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
  return { ok: true }
}

export function findById(id) {
  const row = getDb().prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id)
  return row ?? null
}

/** 用户统计，用于个人主页 */
export function statsOf(userId) {
  const db = getDb()
  const recipe = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(cook_count), 0) AS cooks
       FROM recipes WHERE user_id = ? AND status = 'published'`,
    )
    .get(userId)
  const rating = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(AVG(score), 0) AS avg
       FROM ratings WHERE user_id = ? AND status = 'published'`,
    )
    .get(userId)

  return {
    recipeCount: recipe.n,
    totalCooks: recipe.cooks,
    ratingCount: rating.n,
    avgGivenScore: Number(rating.avg.toFixed(2)),
  }
}

/**
 * 清理过期会话。启动时跑一次即可 —— 数据量小，不需要定时任务。
 */
export function purgeExpiredSessions() {
  const info = getDb()
    .prepare(`DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%SZ','now')`)
    .run()
  return info.changes
}
