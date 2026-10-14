// node:sqlite 的辅助层。
//
// 关于 node:sqlite：它是 Node 内置的实验性模块（Node 22.5+），
// 好处是零原生依赖 —— 不用编译 better-sqlite3。但缺少 better-sqlite3 的一些便利：
// 没有 db.transaction()，绑参也更严格。这个文件把差异补齐。

/**
 * 参数规范化。
 *
 * 这是必须的：node:sqlite 只接受 null / number / bigint / string / Buffer。
 * 传 true / false / undefined 不是"尽力转换"，而是**直接抛错**：
 *   TypeError: Provided value cannot be bound to SQLite parameter 1
 *
 * 所以任何写入前都要过一遍这个函数，否则会在运行到一半才炸。
 */
export function bind(v) {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'object' && !Buffer.isBuffer(v)) return JSON.stringify(v)
  return v
}

/** 把对象的所有值都规范化，省得逐个字段手写 bind() */
export function bindAll(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, bind(v)]))
}

/**
 * 事务包装。
 *
 * 用 BEGIN IMMEDIATE 而不是裸 BEGIN：后者在 WAL 模式下是"延迟"事务，
 * 读的时候不拿写锁，等到第一条写语句才升级 —— 并发时升级失败会直接 SQLITE_BUSY，
 * 且无法安全重试。IMMEDIATE 一开始就拿写锁，行为可预期。
 *
 * ⚠️ 铁律：fn 里绝对不能出现 await。
 * DatabaseSync 是同步驱动，事务里挂起会把整个进程的写锁一直攥着。
 */
export function withTx(db, fn) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // 回滚本身失败（例如连接已断）时不要掩盖原始错误
    }
    throw err
  }
}

/**
 * 判断是否为 SQLite 层的错误，用于错误中间件给出更准确的响应。
 * node:sqlite 抛出的错误对象带 code = 'ERR_SQLITE_ERROR'。
 */
export function isSqliteError(err) {
  return Boolean(err && (err.code === 'ERR_SQLITE_ERROR' || err.errcode != null))
}
