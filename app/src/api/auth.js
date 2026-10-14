import { http } from './request.js'

/**
 * 账号相关。
 *
 * 返回结构（与 server/src/services/authService.js 对齐）：
 *   登录/注册 → { user, token, expiresAt }
 *   me       → { user }
 *   user = { id, username, nickname, avatar_url, role, status, created_at }
 */

export function register({ username, password, nickname }) {
  return http.post('/api/auth/register', { username, password, nickname }, { auth: false })
}

export function login({ username, password, platform = 'h5' }) {
  return http.post('/api/auth/login', { username, password, platform }, { auth: false })
}

export function me(opts = {}) {
  return http.get('/api/auth/me', undefined, opts)
}

export function logout(opts = {}) {
  return http.post('/api/auth/logout', undefined, opts)
}
