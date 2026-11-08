import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { getDb } from '../db/index.js'
import { withTx } from '../db/tx.js'
import { submit, review } from '../services/submissionService.js'
import { hashPassword } from '../utils/password.js'
import { EDITORIAL_RECIPES, CATEGORY_GROUPS } from '../seed/editorialRecipes.js'

export function planFill(minimum = 4) {
  if (!Number.isSafeInteger(minimum) || minimum < 1 || minimum > 8) throw new Error('目标配方数需为 1 至 8')
  const db = getDb(), byKey = new Map(EDITORIAL_RECIPES.map(r => [r.key, r]))
  const shops = db.prepare(`SELECT s.id, s.name, s.category, COUNT(r.id) AS count FROM restaurants s
    LEFT JOIN recipes r ON r.restaurant_id = s.id AND r.status = 'published'
    WHERE s.status = 'published' GROUP BY s.id ORDER BY s.id`).all()
  return shops.map(shop => {
    const current = db.prepare('SELECT title, reference_key FROM recipes WHERE restaurant_id = ?').all(shop.id)
    const titles = new Set(current.map(r => r.title.replace(/（参考）$/, ''))), used = new Set(current.map(r => r.reference_key))
    const groups = CATEGORY_GROUPS[shop.category] || CATEGORY_GROUPS.火锅
    const choices = groups.flatMap((group, index) => { const offset = crypto.createHash('sha256').update(`${shop.name}:${index}`).digest()[0] % group.length; return [group[offset]] })
    const candidates = [...new Set([...choices, ...groups.flat(), ...EDITORIAL_RECIPES.map(r => r.key)])]
    const selected = []
    for (const key of candidates) {
      if (selected.length >= Math.max(0, minimum - shop.count)) break
      const recipe = byKey.get(key), referenceKey = `editorial-fill-v1:${shop.id}:${key}`
      if (used.has(referenceKey) || titles.has(recipe.title)) continue
      selected.push({ recipe, referenceKey })
    }
    if (selected.length < Math.max(0, minimum - shop.count)) throw new Error(`可用配方不足：${shop.name}`)
    return { ...shop, selected }
  })
}

export function fillRecipes({ apply = false, backupPath, adminUsername = 'tiaoliao_admin', minimum = 4 } = {}) {
  const db = getDb(), admin = db.prepare(`SELECT id FROM users WHERE username = ? AND role = 'admin' AND status = 'normal'`).get(adminUsername)
  if (!admin) throw new Error('需要正常管理员作为审核人')
  const plan = planFill(minimum)
  const summary = { shops: plan.length, create: plan.reduce((n, s) => n + s.selected.length, 0), minimum,
    items: plan.filter(s => s.selected.length).map(s => ({ id: s.id, name: s.name, before: s.count, titles: s.selected.map(r => r.recipe.title) })) }
  if (!apply) return { applied: false, ...summary }
  if (!backupPath) throw new Error('正式导入需要备份路径')
  const backup = path.resolve(backupPath)
  if (fs.existsSync(backup)) throw new Error('备份文件已存在')
  fs.mkdirSync(path.dirname(backup), { recursive: true }); db.prepare('VACUUM INTO ?').run(backup)
  return withTx(db, () => {
    let editor = db.prepare(`SELECT id, role, status FROM users WHERE username = 'sauce_reference'`).get()
    if (editor && (editor.role !== 'user' || editor.status !== 'normal')) throw new Error('编辑账号状态异常')
    if (!editor) editor = { id: Number(db.prepare('INSERT INTO users(username,nickname,password_hash) VALUES (?,?,?)').run('sauce_reference', '蘸料编辑', hashPassword(crypto.randomBytes(32).toString('hex'))).lastInsertRowid) }
    db.prepare(`UPDATE users SET nickname = '蘸料编辑' WHERE id = ? AND nickname = '蘸料参考编辑'`).run(editor.id)
    // 仅清理同一编辑导入的旧前台前缀，不改用户投稿和审核历史。
    const old = db.prepare(`SELECT id, title, description FROM recipes WHERE user_id = ? AND content_type = 'reference' AND reference_key LIKE 'reference-v1:%'`).all(editor.id)
    let renamed = 0
    for (const recipe of old) {
      const title = recipe.title.replace(/（参考）$/, ''), description = recipe.description.replace(/^【通用参考·未经线下试配·非官方】/, '').replace(/参考/g, '搭配')
      if (title !== recipe.title || description !== recipe.description) { db.prepare(`UPDATE recipes SET title = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(title, description, recipe.id); renamed++ }
    }
    const created = []
    for (const shop of planFill(minimum)) for (const { recipe, referenceKey } of shop.selected) {
      const submitted = submit('recipe', { ...recipe, restaurantId: shop.id, servingNote: '一人小碟；各店勺具不同，少量起配后按口味调整', imageIds: [], clientToken: referenceKey }, editor.id)
      if (submitted.submission.status !== 'pending') throw new Error('该批次已存在审核结果，请检查后重试')
      const published = review(submitted.submission.id, 'approve', '按用户要求编拟补充蘸料；来源内部留档，前台统一展示；未制造点赞、评分或实拍记录。', admin.id)
      db.prepare(`UPDATE recipes SET reference_key = ?, content_type = 'reference', content_source = ?, cover_illustration = ? WHERE id = ?`)
        .run(referenceKey, '站内编拟配方，未经线下试配。', `/static/recipes/${recipe.cover}.svg`, published.submission.publishedId)
      created.push({ shop: shop.name, id: published.submission.publishedId, title: recipe.title })
    }
    return { applied: true, backupPath: backup, created: created.length, renamed, minimum, items: created,
      total: db.prepare(`SELECT COUNT(*) AS n FROM recipes r JOIN restaurants s ON s.id = r.restaurant_id WHERE r.status = 'published' AND s.status = 'published'`).get().n }
  })
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined
  const result = fillRecipes({ apply: args.includes('--apply'), backupPath: option('--backup'), adminUsername: option('--admin'), minimum: option('--minimum') === undefined ? 4 : Number(option('--minimum')) })
  if (option('--report')) fs.writeFileSync(option('--report'), JSON.stringify(result, null, 2), { mode: 0o640 })
  console.log(JSON.stringify(result, null, 2))
}
