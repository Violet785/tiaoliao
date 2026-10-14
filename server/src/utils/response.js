// 统一响应格式：{ code, msg, data }
//
// code === 0 表示成功，非 0 表示业务错误。HTTP 状态码同时有意义（见 errors.js），
// 方便用 curl / Postman 直接看，也方便前端 request 拦截器做统一处理。
import { CODES } from './errors.js'

export function ok(res, data = null, msg = 'ok') {
  return res.json({ code: CODES.OK, msg, data })
}

/** 分页响应的标准形状，避免每个列表接口各写各的字段名 */
export function okList(res, list, { page = 1, pageSize = 20, total = null } = {}) {
  const hasMore = total != null
    ? page * pageSize < total
    : list.length >= pageSize
  return ok(res, { list, page, pageSize, total, hasMore })
}

export function fail(res, code, msg, extra = null) {
  const body = { code, msg, data: null }
  if (extra) body.extra = extra
  return res.json(body)
}

export default { ok, okList, fail }
