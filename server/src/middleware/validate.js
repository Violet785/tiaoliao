// 极简参数校验。
//
// 没引 zod / joi —— 本项目的校验需求就是「必填、长度、取值范围、类型」这几种，
// 手写三十行足够，还省一个依赖。
import { badRequest } from '../utils/errors.js'
import config from '../config.js'

/** 取字符串字段并校验长度 */
export function str(body, field, { required = true, min = 1, max = 200, label } = {}) {
  const name = label || field
  const raw = body?.[field]

  if (raw === undefined || raw === null || raw === '') {
    if (required) throw badRequest(`${name}不能为空`)
    return ''
  }
  const value = String(raw).trim()
  if (value.length < min) throw badRequest(`${name}至少 ${min} 个字符`)
  if (value.length > max) throw badRequest(`${name}不能超过 ${max} 个字符`)
  return value
}

/** 取整数并校验范围 */
export function int(body, field, { required = true, min = -Infinity, max = Infinity, label } = {}) {
  const name = label || field
  const raw = body?.[field]

  if (raw === undefined || raw === null || raw === '') {
    if (required) throw badRequest(`${name}不能为空`)
    return null
  }
  const value = Number(raw)
  if (!Number.isInteger(value)) throw badRequest(`${name}必须是整数`)
  if (value < min || value > max) throw badRequest(`${name}需在 ${min}–${max} 之间`)
  return value
}

/** 取布尔，接受 true/false 和 1/0 */
export function bool(body, field, { default: def = false } = {}) {
  const raw = body?.[field]
  if (raw === undefined || raw === null) return def
  return raw === true || raw === 1 || raw === '1' || raw === 'true'
}

/** 取数组，可限定元素类型与最大长度 */
export function arr(body, field, { required = false, max = 50, label } = {}) {
  const name = label || field
  const raw = body?.[field]
  if (raw === undefined || raw === null) {
    if (required) throw badRequest(`${name}不能为空`)
    return []
  }
  if (!Array.isArray(raw)) throw badRequest(`${name}必须是数组`)
  if (raw.length > max) throw badRequest(`${name}最多 ${max} 项`)
  return raw
}

/** 取枚举值 */
export function enumOf(body, field, allowed, { required = true, default: def = null, label } = {}) {
  const name = label || field
  const raw = body?.[field]
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw badRequest(`${name}不能为空`)
    return def
  }
  const value = String(raw)
  if (!allowed.includes(value)) {
    throw badRequest(`${name}只能是 ${allowed.join(' / ')} 之一`)
  }
  return value
}

/** 解析分页参数，并对 pageSize 设上限防止前端要一百万条 */
export function pagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const rawSize = Number.parseInt(query.pageSize, 10) || config.pageSize.default
  const pageSize = Math.min(Math.max(1, rawSize), config.pageSize.max)
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/** 从 URL 参数取正整数 id，顺便挡掉 /api/recipes/abc 这种 */
export function pathId(value, label = 'id') {
  const n = Number(value)
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(n) || n <= 0) throw badRequest(`${label} 不合法`)
  return n
}
