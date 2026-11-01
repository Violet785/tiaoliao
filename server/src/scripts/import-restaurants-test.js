import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tiaoliao-import-test-'))
process.env.DB_PATH = path.join(temp, 'test.db')
const { runMigrations } = await import('../db/migrate.js')
const { getDb, closeDb } = await import('../db/index.js')
const { importBrands, readManifest } = await import('./import-restaurants.js')
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
try {
  runMigrations({ silent: true })
  const db = getDb()
  db.prepare(`INSERT INTO users (username, password_hash, role) VALUES ('test_admin', 'unused', 'admin')`).run()
  db.prepare(`INSERT INTO users (username, password_hash) VALUES ('user', 'unused')`).run()
  db.prepare(`INSERT INTO restaurants (name, name_norm, recipe_count, cook_count) VALUES ('钱山岭云贵自助小火锅','钱山岭云贵自助小火锅',1,7)`).run()
  db.prepare(`INSERT INTO recipes (restaurant_id, user_id, title, cook_count) VALUES (1,2,'保留的配方',7)`).run()
  const input = path.join(temp, 'manifest.json')
  const manifest = { sourceFile: 'test.xlsx', sourceSha256: 'a'.repeat(64), sourceRecordCount: 5,
    brands: [{ name: '牛NEW', category: '火锅', sourceRows: [2,3] },
      { name: '钱山岭', aliases: ['钱山岭云贵自助小火锅'], category: '火锅', sourceRows: [4,5] }] }
  fs.writeFileSync(input, JSON.stringify(manifest))
  const parsed = readManifest(input)
  const options = { adminUsername: 'test_admin' }
  const dry = importBrands(parsed, options)
  check(dry.summary, { create: 1, rename: 1, reuse: 0 })
  check(db.prepare('SELECT COUNT(*) AS n FROM restaurants').get().n, 1)
  check(db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 0)
  assert.throws(() => importBrands(parsed, { adminUsername: 'user', apply: true, backupPath: path.join(temp, 'bad.db') })); checks++
  assert.throws(() => importBrands(parsed, { ...options, apply: true })); checks++
  const result = importBrands(parsed, { ...options, apply: true, backupPath: path.join(temp, 'before.db') })
  check(result.summary, { create: 1, rename: 1, reuse: 0 })
  check(result.totalPublished, 2)
  check(db.prepare('SELECT restaurant_id FROM recipes').get().restaurant_id, 1)
  check(db.prepare('SELECT name, recipe_count, cook_count FROM restaurants WHERE id = 1').get(),
    Object.assign(Object.create(null), { name: '钱山岭', recipe_count: 1, cook_count: 7 }))
  check(db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE status = 'approved' AND reviewed_by = 1`).get().n, 2)
  const backup = new DatabaseSync(path.join(temp, 'before.db'))
  check(backup.prepare('SELECT name FROM restaurants').get().name, '钱山岭云贵自助小火锅'); backup.close()
  const again = importBrands(parsed, { ...options, apply: true, backupPath: path.join(temp, 'second.db') })
  check(again.summary, { create: 0, rename: 0, reuse: 2 })
  check(db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 2)
  const collision = { ...manifest, brands: [{ name: '重复别名', aliases: ['牛NEW','钱山岭'], category: '火锅', sourceRows: [2] }] }
  assert.throws(() => importBrands(collision, options)); checks++
  const hidden = db.prepare(`INSERT INTO restaurants (name, name_norm, status) VALUES ('隐藏品牌','隐藏品牌','hidden')`).run()
  assert.throws(() => importBrands({ ...manifest, brands: [{ name: '隐藏品牌', category: '火锅', sourceRows: [2] }] }, options)); checks++
  check(db.prepare('SELECT status FROM restaurants WHERE id = ?').get(hidden.lastInsertRowid).status, 'hidden')
  const rollbackManifest = { ...manifest, sourceSha256: 'b'.repeat(64), brands: [
    { name: '应回滚', category: '火锅', sourceRows: [2] }, { name: '故意失败', category: '火锅', sourceRows: [3] }] }
  // 后半批次失败时，前面创建的店和审核记录都必须回滚。
  db.exec(`CREATE TRIGGER test_reject BEFORE INSERT ON restaurants WHEN NEW.name = '故意失败' BEGIN SELECT RAISE(ABORT,'test rollback'); END;`)
  assert.throws(() => importBrands(rollbackManifest, { ...options, apply: true, backupPath: path.join(temp, 'rollback.db') })); checks++
  check(db.prepare(`SELECT COUNT(*) AS n FROM restaurants WHERE name = '应回滚'`).get().n, 0)
  check(db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 2)
  check(db.prepare(`SELECT COUNT(*) AS n FROM restaurants WHERE city <> '' OR address <> ''`).get().n, 0)
  console.log(`PASS ${checks} import checks: preview, permissions, backup, rename preservation, audit, retry, hidden brands, atomic rollback`)
} finally {
  closeDb()
  fs.rmSync(temp, { recursive: true, force: true })
}
