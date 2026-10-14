// 统一错误类型与错误码。
//
// 业务代码只管 throw new AppError(...)，由 middleware/error.js 统一转成响应。
// 这样路由里就不会散落一堆 res.status(400).json(...)。

export const CODES = {
  OK: 0,
  BAD_REQUEST: 40001,   // 参数错误
  UNAUTHORIZED: 40100,  // 未登录 / token 失效
  FORBIDDEN: 40300,     // 已登录但无权限
  NOT_FOUND: 40400,
  CONFLICT: 40900,      // 冲突（重名、重复评分等）
  RATE_LIMITED: 42900,
  SERVER_ERROR: 50000,
}

// 错误码 → HTTP 状态码。让两者始终一致，不用在每个路由里手写。
const HTTP_BY_CODE = {
  [CODES.BAD_REQUEST]: 400,
  [CODES.UNAUTHORIZED]: 401,
  [CODES.FORBIDDEN]: 403,
  [CODES.NOT_FOUND]: 404,
  [CODES.CONFLICT]: 409,
  [CODES.RATE_LIMITED]: 429,
  [CODES.SERVER_ERROR]: 500,
}

export class AppError extends Error {
  constructor(code, message, extra = null) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.httpStatus = HTTP_BY_CODE[code] ?? 500
    // 额外载荷，例如 409 重名时把候选列表带回去给前端做二次确认
    this.extra = extra
  }
}

export const badRequest = (msg = '参数错误', extra) => new AppError(CODES.BAD_REQUEST, msg, extra)
export const unauthorized = (msg = '请先登录') => new AppError(CODES.UNAUTHORIZED, msg)
export const forbidden = (msg = '没有权限') => new AppError(CODES.FORBIDDEN, msg)
export const notFound = (msg = '内容不存在') => new AppError(CODES.NOT_FOUND, msg)
export const conflict = (msg = '操作冲突', extra) => new AppError(CODES.CONFLICT, msg, extra)

export default AppError
