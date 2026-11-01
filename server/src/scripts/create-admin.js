import fs from 'node:fs'
import { runMigrations } from '../db/migrate.js'
import { getDb } from '../db/index.js'
import { hashPassword } from '../utils/password.js'
const username = process.argv[2] || 'tiaoliao_admin'
const password = fs.readFileSync(0, 'utf8').trim()
if (!/^[a-zA-Z0-9_]{3,20}$/.test(username) || password.length < 16 || password.length > 128) throw new Error('用户名无效或密码不足 16 位')
runMigrations({ silent: true })
getDb().prepare(`INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, '管理员', 'admin')`)
  .run(username, hashPassword(password))
console.log(`管理员已创建：${username}`)
