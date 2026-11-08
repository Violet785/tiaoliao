import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { getDb } from '../db/index.js'
import { withTx } from '../db/tx.js'
import { hashPassword } from '../utils/password.js'
import { submit, review } from '../services/submissionService.js'
import { REFERENCE_BRANDS, REFERENCE_RECIPES } from '../seed/referenceRecipes.js'

export function importReferences({ apply = false, backupPath, adminUsername = 'tiaoliao_admin' } = {}) {
  const db = getDb()
  const admin = db.prepare(`SELECT id FROM users WHERE username = ? AND role = 'admin' AND status = 'normal'`).get(adminUsername)
  if (!admin) throw new Error('需要正常管理员作为参考内容审核人')
  function plan() {
    return REFERENCE_BRANDS.flatMap(name => {
      const shop = db.prepare(`SELECT id FROM restaurants WHERE name = ? AND status = 'published'`).get(name)
      if (!shop) throw new Error(`品牌不存在或未发布：${name}`)
      return REFERENCE_RECIPES.map(recipe => {
        const key = `reference-v1:${shop.id}:${recipe.key}`
        const existing = db.prepare('SELECT id, status FROM recipes WHERE reference_key = ?').get(key)
        if (existing && existing.status !== 'published') throw new Error('已下架的参考内容不会自动恢复')
        return { brand: name, restaurantId: shop.id, key, recipe, existingId: existing?.id }
      })
    })
  }
  const initial = plan()
  if (!apply) return { applied: false, create: initial.filter(i => !i.existingId).length, reuse: initial.filter(i => i.existingId).length, brands: REFERENCE_BRANDS, label: '通用参考 · 待试配，配图为示意，非实拍' }
  if (!backupPath) throw new Error('正式导入必须提供备份路径')
  const backup = path.resolve(backupPath)
  if (fs.existsSync(backup)) throw new Error('备份已存在，请换用新路径')
  fs.mkdirSync(path.dirname(backup), { recursive: true }); db.prepare('VACUUM INTO ?').run(backup)
  const items = withTx(db, () => {
    let editor = db.prepare(`SELECT id, role, status FROM users WHERE username = 'sauce_reference'`).get()
    if (editor && (editor.role !== 'user' || editor.status !== 'normal')) throw new Error('参考编辑账号状态异常')
    if (!editor) {
      // 不提供可登录密码，不伪造真人作者或用户体验。
      const info = db.prepare('INSERT INTO users (username, nickname, password_hash) VALUES (?, ?, ?)')
        .run('sauce_reference', '蘸料编辑', hashPassword(crypto.randomBytes(32).toString('hex')))
      editor = { id: Number(info.lastInsertRowid) }
    }
    return plan().map(item => {
      if (item.existingId) return { brand: item.brand, id: item.existingId, created: false }
      const { recipe } = item
      const r = submit('recipe', { ...recipe, title: recipe.title, description: recipe.description.replace(/参考/g, '搭配'), restaurantId: item.restaurantId, servingNote: '一人小碟；少量起配，尝味后再调整', imageIds: [], clientToken: item.key }, editor.id)
      if (r.submission.status !== 'pending') throw new Error('参考投稿已被处理，需人工检查')
      const approved = review(r.submission.id, 'approve', '编辑编排的通用参考，未经线下试配；非品牌官方配方；示意图非实拍。', admin.id)
      db.prepare(`UPDATE recipes SET reference_key = ?, content_type = 'reference', content_source = ?, cover_illustration = ? WHERE id = ?`)
        .run(item.key, '本站编辑编排，未经线下试配。', `/static/recipes/${recipe.cover}.svg`, approved.submission.publishedId)
      return { brand: item.brand, id: approved.submission.publishedId, created: true }
    })
  })
  return { applied: true, backupPath: backup, created: items.filter(i => i.created).length, reused: items.filter(i => !i.created).length, items }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
  console.log(JSON.stringify(importReferences({ apply: args.includes('--apply'), backupPath: option('--backup'), adminUsername: option('--admin') }), null, 2))
}
