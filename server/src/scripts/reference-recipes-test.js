import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sauce-reference-test-'))
process.env.DB_PATH = path.join(temp, 'test.db')
const { runMigrations } = await import('../db/migrate.js')
const { runSeed } = await import('../seed/run.js')
const { getDb, closeDb } = await import('../db/index.js')
const { importReferences } = await import('./import-reference-recipes.js')
const { REFERENCE_BRANDS, REFERENCE_RECIPES } = await import('../seed/referenceRecipes.js')
const { detail, cookSession } = await import('../services/recipeService.js')
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
try {
  runMigrations({ silent: true }); runSeed({ silent: true })
  const db = getDb()
  db.exec(`INSERT INTO users(username, password_hash, role) VALUES ('editor_admin','unused','admin')`)
  for (const name of REFERENCE_BRANDS) db.prepare('INSERT INTO restaurants(name,name_norm) VALUES (?,?)').run(name, name.toLowerCase())
  const preview = importReferences({ adminUsername: 'editor_admin' })
  check(preview.create, REFERENCE_BRANDS.length * REFERENCE_RECIPES.length)
  check(db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n, 0)
  assert.throws(() => importReferences({ apply: true, adminUsername: 'editor_admin' }), /备份/); checks++
  assert.throws(() => importReferences({ adminUsername: 'missing' }), /管理员/); checks++
  const result = importReferences({ apply: true, backupPath: path.join(temp, 'backup.db'), adminUsername: 'editor_admin' })
  check(result.created, 40)
  check(fs.existsSync(path.join(temp, 'backup.db')), true)
  check(db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE status = ?').get('approved').n, 40)
  for (const { id } of result.items) {
    const full = detail(id)
    check(full.recipe.contentType, 'reference')
    check(full.recipe.contentSource.includes('未经线下试配'), true)
    check(full.items.length > 0, true)
    check(full.tags.taste.length > 0 && full.tags.food.length > 0, true)
    check(cookSession(id).totalSteps > 0, true)
    check(db.prepare('SELECT recipe_count FROM restaurants WHERE id = ?').get(full.restaurant.id).recipe_count, 5)
  }
  const repeated = importReferences({ apply: true, backupPath: path.join(temp, 'repeat.db'), adminUsername: 'editor_admin' })
  check([repeated.created, repeated.reused], [0, 40])
  check(db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n, 40)
  assert.throws(() => importReferences({ apply: true, backupPath: path.join(temp, 'repeat.db'), adminUsername: 'editor_admin' }), /已存在/); checks++
  db.prepare(`UPDATE recipes SET status = 'deleted' WHERE id = ?`).run(result.items[0].id)
  assert.throws(() => importReferences({ adminUsername: 'editor_admin' }), /不会自动恢复/); checks++
  console.log(`PASS ${checks} reference recipe checks`)
} finally { closeDb(); fs.rmSync(temp, { recursive: true, force: true }) }
