/**
 * 本地存储封装。
 *
 * 不直接散用 uni.getStorageSync 的原因：
 *   1. key 散落各处容易打错字，而且改名字要全项目搜
 *   2. 「退出登录要清哪些 key」需要一个统一的地方回答
 *   3. uni.getStorageSync 在某些端会抛异常（存储写满、隐私模式），必须包一层
 *
 * 所有 key 统一加 `sauce:` 前缀 —— 微信小程序里同一用户的 storage 可能被多个
 * 小游戏/小程序共享，加前缀避免撞车。
 */

const KEY_TOKEN = 'sauce:token'
const KEY_USER = 'sauce:user'
const KEY_META = 'sauce:meta'
const KEY_COOK = 'sauce:cook:'

function read(key, fallback = null) {
  try {
    const value = uni.getStorageSync(key)
    return value === '' || value === undefined ? fallback : value
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    uni.setStorageSync(key, value)
  } catch {
    // 存储不可用时静默降级：功能受限但页面不该白屏
  }
}

function drop(key) {
  try {
    uni.removeStorageSync(key)
  } catch {}
}

/* ---------- 登录态 ---------- */

export function getToken() {
  return read(KEY_TOKEN, '')
}

export function getUser() {
  return read(KEY_USER, null)
}

export function setAuth(token, user) {
  write(KEY_TOKEN, token)
  write(KEY_USER, user)
}

export function setUser(user) {
  write(KEY_USER, user)
}

/**
 * 只清登录态，不清缓存。
 * 调料表是公共数据，退出登录后仍然有效，没必要重新拉一遍。
 */
export function clearAuth() {
  drop(KEY_TOKEN)
  drop(KEY_USER)
}

/* ---------- 带过期时间的缓存 ---------- */

export function getCache(key, maxAge) {
  const box = read(key, null)
  if (!box || typeof box !== 'object') return null
  if (maxAge != null && Date.now() - (box.at || 0) > maxAge) {
    drop(key)
    return null
  }
  return box.value ?? null
}

export function setCache(key, value) {
  write(key, { at: Date.now(), value })
}

export const META_KEY = KEY_META

/* ---------- 照着配断点续配 ---------- */

/**
 * 每走一步立即落盘。
 *
 * 用「恢复」而不是拦截物理返回键 —— 各端返回键行为不一致，拦起来坑多，
 * 而且用户中途切出去接个电话是很正常的，不该被当成异常。
 */
export function getCookProgress(recipeId) {
  return read(KEY_COOK + recipeId, null)
}

export function setCookProgress(recipeId, data) {
  write(KEY_COOK + recipeId, { ...data, at: Date.now() })
}

export function clearCookProgress(recipeId) {
  drop(KEY_COOK + recipeId)
}
