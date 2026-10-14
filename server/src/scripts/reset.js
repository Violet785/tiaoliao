// 清空数据库并重建 schema，然后重新灌 seed。
// 仅用于开发期。会删掉 data/ 下的 .db / -wal / -shm 三个文件。
//
// 用法：npm run reset
import fs from 'node:fs'
import path from 'node:path'
import config from '../config.js'

if (config.isProd) {
  console.error('拒绝执行：NODE_ENV=production 下不允许重置数据库。')
  process.exit(1)
}

const targets = [config.dbPath, `${config.dbPath}-wal`, `${config.dbPath}-shm`]

for (const f of targets) {
  if (fs.existsSync(f)) {
    fs.rmSync(f)
    console.log(`[reset] 已删除 ${path.basename(f)}`)
  }
}

// 动态 import：必须在删文件之后才建立连接，否则会连到已删除的旧文件上
const { runMigrations } = await import('../db/migrate.js')
runMigrations()

const { runSeed } = await import('../seed/run.js')
runSeed()

console.log('[reset] 完成')
