import { getDb } from '../db/index.js'
import { brandName, brandKey } from '../utils/brand.js'
import { badRequest, notFound, conflict } from '../utils/errors.js'

const columns = `id, name, category, note, recipe_count AS recipeCount,
  cook_count AS cookCount, created_at AS createdAt`

export function list({ keyword = '', sort = 'hot', page = 1, pageSize = 20, offset = 0 } = {}) {
  const db = getDb()
  const where = `status = 'published' AND name_norm LIKE ?`
  const key = `%${brandKey(keyword)}%`
  const total = db.prepare(`SELECT COUNT(*) AS n FROM restaurants WHERE ${where}`).get(key).n
  const order = sort === 'new' ? 'id DESC' : 'recipe_count DESC, cook_count DESC, id DESC'
  return { list: db.prepare(`SELECT ${columns} FROM restaurants WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(key, pageSize, offset), total, page, pageSize }
}
export function findById(id) {
  const db = getDb()
  const seen = new Set()
  while (!seen.has(id)) {
    seen.add(id)
    const old = db.prepare('SELECT status, merged_into_id FROM restaurants WHERE id = ?').get(id)
    if (old?.status !== 'merged') break
    id = old.merged_into_id
  }
  const row = db.prepare(`SELECT ${columns} FROM restaurants WHERE id = ? AND status = 'published'`).get(id)
  if (!row) throw notFound('店铺不存在')
  return row
}
export function findSimilar({ name }) {
  const candidates = list({ keyword: name, pageSize: 5 }).list
  return { candidates, autoMatchId: candidates.find(r => brandKey(r.name) === brandKey(name))?.id || null }
}
// 仅在管理员审核通过、种子数据导入时调用。
export function create(input, userId) {
  const db = getDb()
  const name = brandName(input.name)
  const key = brandKey(name)
  if (!key) throw badRequest('请填写有效店名')
  const existing = db.prepare(`SELECT id, status FROM restaurants WHERE name_norm = ? AND status <> 'merged'`).get(key)
  if (existing) {
    if (existing.status !== 'published') throw conflict('该品牌已被隐藏，请先处理已有店铺')
    return { restaurant: findById(existing.id), created: false, matched: true }
  }
  const info = db.prepare(`INSERT INTO restaurants (name, name_norm, category, note, created_by)
    VALUES (?, ?, ?, ?, ?)`).run(name, key, input.category || '其他', input.note || '', userId)
  return { restaurant: findById(Number(info.lastInsertRowid)), created: true, matched: false }
}
export function detail(id) { return { restaurant: findById(id) } }
export function recalcCounters(id) {
  getDb().prepare(`UPDATE restaurants SET
    recipe_count = (SELECT COUNT(*) FROM recipes WHERE restaurant_id = ? AND status = 'published'),
    cook_count = (SELECT COALESCE(SUM(cook_count),0) FROM recipes WHERE restaurant_id = ? AND status = 'published'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(id, id, id)
}
