/**
 * 登录态。
 *
 * 单一事实来源是 Storage，内存里的 ref 只是它的镜像 ——
 * 这样杀掉进程再打开，登录态自动还在，不需要额外写「启动时恢复」的逻辑。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '../api/auth.js'
import * as storage from '../utils/storage.js'

export const useUserStore = defineStore('user', () => {
  const user = ref(storage.getUser())
  const token = ref(storage.getToken())

  const isLoggedIn = computed(() => Boolean(token.value && user.value))
  const displayName = computed(() => user.value?.nickname || user.value?.username || '')
  const isAdmin = computed(() => user.value?.role === 'admin')

  /** 把一次登录/注册的返回写进内存 + Storage */
  function apply({ token: t, user: u }) {
    token.value = t
    user.value = u
    storage.setAuth(t, u)
  }

  function clear() {
    token.value = ''
    user.value = null
    storage.clearAuth()
  }

  async function login(username, password) {
    apply(await authApi.login({ username, password, platform: 'h5' }))
    return user.value
  }

  async function register(username, password, nickname) {
    apply(await authApi.register({ username, password, nickname }))
    return user.value
  }

  /**
   * 用服务端数据刷新本地用户信息。
   * 冷启动时调一次 —— token 可能已过期或被封号，光有本地副本不算数。
   */
  async function refresh() {
    if (!token.value) return null
    const { user: fresh } = await authApi.me({ silent: true })
    user.value = fresh
    storage.setUser(fresh)
    return fresh
  }

  async function logout() {
    // 服务端删会话失败（比如断网）也要照常退出本地，否则用户被困在登录态里
    try {
      await authApi.logout({ silent: true })
    } catch {}
    clear()
  }

  return {
    user, token,
    isLoggedIn, displayName, isAdmin,
    login, register, refresh, logout, clear,
  }
})

/**
 * 需要登录才能做的事，先过这一道。
 *
 * @param {string} [redirect] 登录成功后要回到的页面路径
 * @returns {boolean} 已登录返回 true；未登录会跳登录页并返回 false
 */
export function requireLogin(redirect) {
  const store = useUserStore()
  if (store.isLoggedIn) return true

  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''
  uni.navigateTo({ url: `/pages/common/login${query}` })
  return false
}
