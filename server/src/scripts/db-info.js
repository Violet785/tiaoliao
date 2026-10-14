// 查看数据库现状：表、行数、索引。
// 用法：npm run db:info
import { getDb } from '../db/index.js'
import config from '../config.js'

const db = getDb()

console.log(`数据库：${config.dbPath}\n`)

const tables = db
  .prepare(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`,
  )
  .all()

if (tables.length === 0) {
  console.log('（空库，先跑 npm run migrate）')
  process.exit(0)
}

console.log('表'.padEnd(20) + '行数')
console.log('─'.repeat(28))
for (const { name } of tables) {
  const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get()
  console.log(name.padEnd(20) + n)
}

const migrations = db
  .prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version')
  .all()
console.log('\n已执行的迁移：')
for (const m of migrations) console.log(`  ✓ ${m.version}  (${m.applied_at})`)
