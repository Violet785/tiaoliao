// 显式导入精选品牌；默认只预览。通过现有审核服务发布，保留管理员审核记录。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { getDb } from '../db/index.js'
import { withTx } from '../db/tx.js'
import { brandName, brandKey } from '../utils/brand.js'
import { submit, review } from '../services/submissionService.js'

export function readManifest(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!/^[a-f0-9]{64}$/.test(data.sourceSha256) || typeof data.sourceFile !== 'string'
    || data.sourceFile.length > 120 || !Number.isInteger(data.sourceRecordCount)
    || !Array.isArray(data.brands) || !data.brands.length || data.brands.length > 500) throw new Error('导入清单格式无效')
  const keys = new Set()
  for (const brand of data.brands) {
    if (typeof brand.name !== 'string' || !brand.name.trim() || brand.name.length > 60
      || !['自助餐','火锅','烤肉','麻辣烫','冒菜','其他'].includes(brand.category)
      || !Array.isArray(brand.sourceRows) || !brand.sourceRows.length
      || brand.sourceRows.some(n => !Number.isInteger(n) || n < 2 || n > data.sourceRecordCount + 1)
      || (brand.aliases && (!Array.isArray(brand.aliases) || brand.aliases.some(a => typeof a !== 'string' || !brandKey(a))))) throw new Error('店铺或来源行格式无效')
    const key = brandKey(brand.name)
    if (!key || keys.has(key)) throw new Error(`重复或无效店名：${brand.name}`)
    keys.add(key)
  }
  return data
}

export function planImport(manifest) {
  const db = getDb()
  const current = db.prepare(`SELECT id, name, name_norm, status FROM restaurants WHERE status <> 'merged'`).all()
  const claimed = new Set()
  return manifest.brands.map(brand => {
    const name = brandName(brand.name), key = brandKey(name)
    const aliases = new Set([key, ...(brand.aliases || []).map(brandKey)])
    const matches = current.filter(row => aliases.has(brandKey(row.name)))
    if (matches.length > 1) throw new Error(`品牌存在多个有效记录，需先处理：${name}`)
    const existing = matches[0]
    if (existing?.status !== undefined && existing.status !== 'published') throw new Error(`不自动恢复已隐藏店铺：${existing.name}`)
    if (existing && claimed.has(existing.id)) throw new Error(`多个品牌命中了同一家店：${name}`)
    if (existing) claimed.add(existing.id)
    return { brand, name, key, id: existing?.id || null, oldName: existing?.name || null,
      action: !existing ? 'create' : existing.name !== name || existing.name_norm !== key ? 'rename' : 'reuse' }
  })
}

export function importBrands(manifest, { apply = false, backupPath, adminUsername = 'tiaoliao_admin' } = {}) {
  const db = getDb()
  const admin = db.prepare(`SELECT id FROM users WHERE username = ? AND role = 'admin' AND status = 'normal'`).get(adminUsername)
  if (!admin) throw new Error('需要指定一个正常的管理员账号作为导入审核人')
  let plan = planImport(manifest)
  const summarize = items => Object.fromEntries(['create','rename','reuse'].map(action => [action, items.filter(i => i.action === action).length]))
  if (!apply) return { applied: false, sourceFile: manifest.sourceFile, summary: summarize(plan), items: plan }
  if (!backupPath) throw new Error('正式导入必须指定独立备份路径')
  const backup = path.resolve(backupPath)
  fs.mkdirSync(path.dirname(backup), { recursive: true })
  if (fs.existsSync(backup)) throw new Error('备份文件已存在，请使用新的备份文件名')
  // 在线备份包括 WAL 已提交数据；不能直接复制 SQLite 主文件。
  db.prepare('VACUUM INTO ?').run(backup)
  const result = withTx(db, () => {
    // 写锁内重新确认，避免预览后出现同名店导致重复或覆盖。
    plan = planImport(manifest)
    const items = plan.map(item => {
      let id = item.id, submissionId = null
      if (item.action === 'rename') {
        db.prepare(`UPDATE restaurants SET name = ?, name_norm = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`)
          .run(item.name, item.key, id)
      }
      if (item.action !== 'reuse') {
        const brandHash = crypto.createHash('sha256').update(item.key).digest('hex').slice(0, 24)
        const clientToken = `import:${manifest.sourceSha256.slice(0, 16)}:${brandHash}`
        const receipt = submit('restaurant', { name: item.name, category: item.brand.category, note: '', clientToken }, admin.id)
        submissionId = receipt.submission.id
        if (receipt.submission.status === 'rejected') throw new Error(`该批次店铺曾被驳回，不自动重新发布：${item.name}`)
        const approved = receipt.submission.status === 'pending'
          ? review(submissionId, 'approve', `精选品牌导入：${manifest.sourceFile}；来源行 ${item.brand.sourceRows.join(',')}；SHA256 ${manifest.sourceSha256}`, admin.id)
          : receipt
        id = approved.submission.publishedId
      }
      const published = db.prepare(`SELECT id, name, status FROM restaurants WHERE id = ?`).get(id)
      if (!published || published.status !== 'published' || published.name !== item.name) throw new Error(`发布结果校验失败：${item.name}`)
      return { id, name: item.name, action: item.action, oldName: item.oldName, submissionId, sourceRows: item.brand.sourceRows }
    })
    return { items, summary: summarize(items), totalPublished: db.prepare(`SELECT COUNT(*) AS n FROM restaurants WHERE status = 'published'`).get().n }
  })
  return { applied: true, sourceFile: manifest.sourceFile, sourceSha256: manifest.sourceSha256, backupPath: backup, ...result }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
  const input = option('--input')
  if (!input) throw new Error('用法：--input MANIFEST [--apply --backup PATH] [--admin USERNAME] [--report PATH]')
  const result = importBrands(readManifest(input), { apply: args.includes('--apply'), backupPath: option('--backup'), adminUsername: option('--admin') })
  if (option('--report')) fs.writeFileSync(option('--report'), JSON.stringify(result, null, 2) + '\n', { mode: 0o640 })
  console.log(JSON.stringify(result, null, 2))
}
