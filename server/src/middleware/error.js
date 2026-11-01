// 统一错误出口。
//
// 业务代码只 throw AppError，这里负责转成 { code, msg, data }。
// Express 5 会自动把 async handler 里抛出的错误转发到这里，不用手动 try/catch 包裹。
import { AppError, CODES } from '../utils/errors.js'
import { isSqliteError } from '../db/tx.js'
import config from '../config.js'

/** 404 兜底：匹配不到任何路由时 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    code: CODES.NOT_FOUND,
    msg: `接口不存在: ${req.method} ${req.originalUrl}`,
    data: null,
  })
}

/** 全局错误处理。Express 靠「四个参数」识别这是错误中间件，_next 不能省。 */
export function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') {
    return res.status(err.status || 400).json({ code: CODES.BAD_REQUEST, msg: err.type === 'entity.too.large' ? '提交内容过大' : '提交内容格式不合法', data: null })
  }
  // 已知的业务错误：按它自带的 code / httpStatus 返回
  if (err instanceof AppError) {
    const body = { code: err.code, msg: err.message, data: null }
    if (err.extra) body.extra = err.extra
    return res.status(err.httpStatus).json(body)
  }

  // 唯一约束冲突。最常见的是并发下两个人同时给同一家店打分 / 同一个人重复建店，
  // 转成 409 比裸奔一个 500 友好得多。
  if (isSqliteError(err)) {
    const msg = String(err.message || '')
    if (msg.includes('UNIQUE constraint failed')) {
      console.warn('[error] 唯一约束冲突:', msg)
      return res.status(409).json({
        code: CODES.CONFLICT,
        msg: '数据已存在，请刷新后重试',
        data: null,
      })
    }
    console.error('[error] SQLite 错误:', err)
    return res.status(500).json({
      code: CODES.SERVER_ERROR,
      msg: '数据库操作失败',
      data: null,
    })
  }

  // 未知错误：日志里给全量堆栈，响应里只给一句话，
  // 避免把内部结构泄露给客户端。开发环境额外附上 message 便于排查。
  console.error('[error] 未处理异常:', err)
  return res.status(500).json({
    code: CODES.SERVER_ERROR,
    msg: config.isProd ? '服务异常，请稍后再试' : `服务异常: ${err.message}`,
    data: null,
  })
}
