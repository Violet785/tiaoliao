import { getDb } from '../db/index.js'
import { brandName, brandKey } from '../utils/brand.js'
import { badRequest, notFound, conflict } from '../utils/errors.js'

// 店铺封面：取这家店最热的一条、带图的已发布配方，拿它的第一张图。
// 用关联子查询而不是再发一轮请求 —— 列表页最多 12 行，代价可以忽略。
const columns = `id, name, category, note, recipe_count AS recipeCount,
  cook_count AS cookCount, created_at AS createdAt,
  (SELECT i.upload_id FROM recipe_images i
     JOIN recipes r ON r.id = i.recipe_id
    WHERE r.restaurant_id = restaurants.id AND r.status = 'published'
    ORDER BY r.hot_score DESC, i.sort_order
    LIMIT 1) AS coverId`

/** 把 coverId 变成前端能直接用的 { id, url }；没有图就是 null */
function withCover(rows) {
  const map = (row) => {
    const { coverId, ...rest } = row
    return { ...rest, cover: coverId ? { id: coverId, url: `/api/uploads/${coverId}` } : null }
  }
  return Array.isArray(rows) ? rows.map(map) : map(rows)
}

export function list({ keyword = '', sort = 'hot', page = 1, pageSize = 20, offset = 0 } = {}) {
  const db = getDb()
  const where = `status = 'published' AND name_norm LIKE ?`
  const key = `%${brandKey(keyword)}%`
  const total = db.prepare(`SELECT COUNT(*) AS n FROM restaurants WHERE ${where}`).get(key).n
  const order = sort === 'new' ? 'id DESC' : 'recipe_count DESC, cook_count DESC, id DESC'
  return { list: withCover(db.prepare(`SELECT ${columns} FROM restaurants WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).all(key, pageSize, offset)), total, page, pageSize }
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
  return withCover(row)
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
