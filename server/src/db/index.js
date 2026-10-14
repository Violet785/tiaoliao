// SQLite 连接单例。
//
// 用 Node 内置的 node:sqlite（Node 22.5+），而不是 better-sqlite3 ——
// 后者是原生模块，在 Windows 上装它要过 node-gyp / MSVC 编译那一关，
// 对新项目是无谓的门槛。内置模块免编译，API 也足够。
//
// 代价：node:sqlite 仍是实验性 API（启动时会有 ExperimentalWarning，已在 npm script 里静音）。
// 真要换回 better-sqlite3，只需改这个文件 —— 上层都没直接 import 'node:sqlite'。
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import config from '../config.js'

let db = null

export function getDb() {
  if (db) return db

  // DatabaseSync 不会自动创建父目录，目录不存在会直接抛错。
  // 第一次 clone 下项目跑起来时最容易踩这个。
  const dir = path.dirname(config.dbPath)
  fs.mkdirSync(dir, { recursive: true })

  db = new DatabaseSync(config.dbPath)

  // 外键约束。实测本机 node:sqlite 默认已是开启，但与 SQLite 官方默认相反，
  // 跨 Node 版本不保证，所以显式声明。
  db.exec('PRAGMA foreign_keys = ON')

  // 默认 busy_timeout 是 0 —— 一旦有并发写就立刻 SQLITE_BUSY 报错。
  // 设为 5 秒，让 SQLite 自己等待重试。
  db.exec('PRAGMA busy_timeout = 5000')

  // WAL 模式：读写不互相阻塞。会额外生成 -wal / -shm 两个文件，已在 .gitignore 里忽略。
  db.exec('PRAGMA journal_mode = WAL')

  // 平衡安全性与速度。NORMAL 在 WAL 下已足够安全（崩溃不丢已提交事务）
  db.exec('PRAGMA synchronous = NORMAL')

  return db
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}

export default getDb
