/**
 * 网络层 —— 全项目唯一发出 HTTP 请求的地方。
 *
 * 职责：
 *   1. 拼 BASE_URL、注入 Authorization 头
 *   2. 拆掉后端的 { code, msg, data } 外壳，成功时直接把 data 交给调用方
 *   3. 失败时统一抛 ApiError（带 code，方便调用方按错误码分支）
 *   4. token 失效（401）时清登录态并通知上层跳登录页
 *
 * 业务错误默认自动 toast —— 否则每个页面都要写一遍 try/catch。
 * 不需要提示的地方传 `silent: true`（例如冷启动时静默校验 token）。
 */
import { BASE_URL, TIMEOUT } from '../config/index.js'
import { getToken, clearAuth } from '../utils/storage.js'
import { toast } from '../utils/feedback.js'

/** 业务错误。code 为后端的错误码，网络层自身的失败统一用 -1。 */
export class ApiError extends Error {
  constructor(code, message, extra = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.extra = extra
  }
}

/** token 失效时的回调，由 App.vue 注入（网络层不该自己决定往哪跳） */
let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

function buildUrl(url) {
  return /^https?:\/\//.test(url) ? url : BASE_URL + url
}

/** 把 uni.request 的失败信息翻译成人话 —— 用户看不懂 errMsg */
function networkMessage(err) {
  const raw = String(err?.errMsg || '')
  if (raw.includes('timeout')) return '网络超时，请重试'
  if (raw.includes('abort')) return '请求已取消'
  return '网络连接失败，请检查网络后重试'
}

export function request(options) {
  const {
    url,
    method = 'GET',
    data,
    auth = true,     // 公开接口（浏览配方、调料表）传 false
    silent = false,  // 出错时不弹 toast
  } = options

  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }
    const token = getToken()
    if (auth && token) header.Authorization = `Bearer ${token}`

    uni.request({
      url: buildUrl(url),
      method,
      data,
      header,
      timeout: TIMEOUT,

      success(res) {
        const body = res.data

        // 网关返回的 HTML 错误页（502/504）不是 JSON，要单独兜住，
        // 否则 body.code 会是 undefined，报出一个看不懂的错
        if (!body || typeof body !== 'object') {
          const msg = `服务器返回异常（HTTP ${res.statusCode}）`
          if (!silent) toast(msg)
          return reject(new ApiError(-1, msg))
        }

        if (body.code === 0) return resolve(body.data)

        // 登录态失效：清本地凭据并交给上层跳登录页。
        // 这里不 toast —— 跳转本身已经是足够的反馈，再弹一个反而吵。
        if (res.statusCode === 401) {
          clearAuth()
          onUnauthorized?.()
          return reject(new ApiError(body.code, body.msg || '登录已过期'))
        }

        const msg = body.msg || '请求失败'
        if (!silent) toast(msg)
        reject(new ApiError(body.code, msg, body.extra))
      },

      fail(err) {
        const msg = networkMessage(err)
        if (!silent) toast(msg)
        reject(new ApiError(-1, msg))
      },
    })
  })
}

export const http = {
  get: (url, data, opts) => request({ url, method: 'GET', data, ...opts }),
  post: (url, data, opts) => request({ url, method: 'POST', data, ...opts }),
  patch: (url, data, opts) => request({ url, method: 'PATCH', data, ...opts }),
  put: (url, data, opts) => request({ url, method: 'PUT', data, ...opts }),
  del: (url, data, opts) => request({ url, method: 'DELETE', data, ...opts }),
}

export default http
