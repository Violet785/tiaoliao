import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sauce-fill-test-'))
process.env.DB_PATH = path.join(temp, 'test.db')
const { runMigrations } = await import('../db/migrate.js')
const { runSeed } = await import('../seed/run.js')
const { getDb, closeDb } = await import('../db/index.js')
const { fillRecipes, planFill } = await import('./fill-recipes.js')
const { EDITORIAL_RECIPES } = await import('../seed/editorialRecipes.js')
const { prepareItems, detail, cookSession } = await import('../services/recipeService.js')
let checks = 0
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
try {
  runMigrations({ silent: true }); runSeed({ silent: true }); const db = getDb()
  db.exec(`INSERT INTO users(id,username,password_hash,role,nickname) VALUES (1,'test_admin','unused','admin','管理员'),(2,'member','unused','user','用户'),(3,'sauce_reference','unused','user','蘸料参考编辑');
    INSERT INTO restaurants(id,name,name_norm,category,status) VALUES (1,'空火锅店','a','火锅','published'),(2,'空烤肉店','b','烤肉','published'),(3,'空自助餐','c','自助餐','published'),(4,'隐藏店','d','火锅','hidden'),(5,'原有内容店','e','火锅','published');
    INSERT INTO recipes(id,restaurant_id,user_id,title,description,cook_count) VALUES (1,5,2,'用户原配方（参考）','用户原描述',3);
    INSERT INTO recipes(id,restaurant_id,user_id,title,description,content_type,reference_key) VALUES (2,5,3,'蒜香碟（参考）','【通用参考·未经线下试配·非官方】蒜香参考组合','reference','reference-v1:5:garlic');
    INSERT INTO ratings(recipe_id,user_id,score) VALUES (1,2,5);
    INSERT INTO recipe_votes(recipe_id,user_id,value) VALUES (1,2,1);`)
  for (const recipe of EDITORIAL_RECIPES) {
    check(prepareItems(recipe.items).length, recipe.items.length, '调料真实存在且不重复')
    check(recipe.description.length <= 200 && recipe.title.length <= 40, true, '内容长度有效')
    for (const tag of [...recipe.tasteTags, ...recipe.foodTags]) check(Boolean(db.prepare(`SELECT 1 FROM tags WHERE id = ? AND status = 'published'`).get(tag)), true, '标签有效')
  }
  const preview = fillRecipes({ adminUsername: 'test_admin' })
  check(preview.create, 14, '三个空店各四款，已有两款店补两款')
  check(preview.items.some(s => s.id === 4), false, '不填隐藏店')
  check(db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n, 2, '预览不写库')
  assert.throws(() => fillRecipes({ apply: true, adminUsername: 'test_admin' }), /备份/); checks++
  assert.throws(() => fillRecipes({ adminUsername: 'member' }), /管理员/); checks++
  assert.throws(() => planFill(0), /1 至 8/); checks++
  const first = fillRecipes({ apply: true, backupPath: path.join(temp, 'before.db'), adminUsername: 'test_admin' })
  check(first.created, 14, '补足四款'); check(first.renamed, 1, '清理编辑旧标记')
  check(detail(1).recipe.title, '用户原配方（参考）', '不改用户标题')
  check(detail(1).recipe.cookCount, 3, '打卡数量保留')
  check(detail(2).recipe.title, '蒜香碟', '标题去标记'); check(detail(2).recipe.description, '蒜香搭配组合', '描述去前缀')
  check(db.prepare('SELECT nickname FROM users WHERE id=3').get().nickname, '蘸料编辑', '统一编辑名称')
  const originalCounts = () => [db.prepare('SELECT COUNT(*) AS n FROM ratings').get().n, db.prepare('SELECT COUNT(*) AS n FROM recipe_votes').get().n]
  check(originalCounts(), [1, 1], '不制造评价')
  for (const item of first.items) { const full = detail(item.id); check(full.recipe.contentType, 'reference', '内部来源保留'); check(cookSession(item.id).totalSteps > 0, true, '可照着配'); check(full.tags.food.length > 0 && full.tags.taste.length > 0, true, '可筛选'); check(/参考|待试配/.test(full.recipe.title), false, '前台名称不带标记') }
  check(db.prepare(`SELECT COUNT(*) AS n FROM submissions WHERE status = 'approved'`).get().n, 14, '逐条保留审核记录')
  const second = fillRecipes({ apply: true, backupPath: path.join(temp, 'second.db'), adminUsername: 'test_admin' })
  check(second.created, 0, '重复导入不重复'); check(second.renamed, 0, '标记清理幂等')
  assert.throws(() => fillRecipes({ apply: true, backupPath: path.join(temp, 'second.db'), adminUsername: 'test_admin' }), /已存在/); checks++
  db.prepare(`UPDATE recipes SET status = 'deleted' WHERE id = ?`).run(first.items[0].id)
  const replacement = fillRecipes({ apply: true, backupPath: path.join(temp, 'replacement.db'), adminUsername: 'test_admin' })
  check(replacement.created, 1, '下架后使用其他配方补位')
  check(db.prepare('SELECT status FROM recipes WHERE id=?').get(first.items[0].id).status, 'deleted', '不恢复已下架配方')
  check(db.prepare('SELECT COUNT(*) AS n FROM recipes WHERE restaurant_id=4').get().n, 0, '隐藏店保持不变')
  // 模拟发布失败：清理标题、投稿和新配方均在同一事务中回滚。
  db.exec(`INSERT INTO restaurants(id,name,name_norm) VALUES (6,'失败测试店','f');
    UPDATE recipes SET title='蒜香碟（参考）' WHERE id=2;
    CREATE TRIGGER fail_fill BEFORE INSERT ON recipe_items BEGIN SELECT RAISE(ABORT, 'test rollback'); END;`)
  const before = db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n
  assert.throws(() => fillRecipes({ apply: true, backupPath: path.join(temp, 'fail.db'), adminUsername: 'test_admin' }), /test rollback/); checks++
  check(db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n, before, '发布失败整体回滚')
  check(db.prepare('SELECT title FROM recipes WHERE id=2').get().title, '蒜香碟（参考）', '标题清理也回滚')
  console.log(`PASS ${checks} editorial fill checks: recipe validity, backup, preservation, presentation, retry, rollback`)
} finally { closeDb(); fs.rmSync(temp, { recursive: true, force: true }) }
