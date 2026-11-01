// 版本化 migration 执行器。
//
// node:sqlite 没有迁移工具，所以自己写一个最小的：
// 读 migrations/*.sql，按文件名排序，跳过已执行过的，每个文件包在一个事务里执行，
// 成功后把版本号记进 schema_migrations。
//
// 这样"以后要加字段"就只是新增一个 00X_xxx.sql 文件的事，不用动任何已有代码。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getDb } from './index.js'
import { withTx } from './tx.js'
import { brandName, brandKey } from '../utils/brand.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

export function runMigrations({ silent = false } = {}) {
  const db = getDb()
  db.function('brand_name', { deterministic: true }, brandName)
  db.function('brand_key', { deterministic: true }, brandKey)

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    )
  `)

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version),
  )

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort() // 文件名前缀决定顺序，所以用 001_ / 002_ 命名

  const executed = []

  for (const file of files) {
    const version = path.basename(file, '.sql')
    if (applied.has(version)) continue

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')

    // 每个 migration 一个事务：要么整个文件生效，要么完全不生效，
    // 不会留下执行到一半的残缺 schema
    withTx(db, () => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version)
    })

    executed.push(version)
    if (!silent) console.log(`[migrate] ✓ ${version}`)
  }

  if (!silent && executed.length === 0) {
    console.log('[migrate] 已是最新，无需迁移')
  }

  return executed
}

// 允许直接运行：npm run migrate
// 用 pathToFileURL 而不是手拼 'file://' —— 后者在 Windows 上会少一个斜杠，
// 且不会对中文/空格路径做 URL 编码，导致入口判断永远为 false（静默不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations()
  console.log('[migrate] 完成')
}
