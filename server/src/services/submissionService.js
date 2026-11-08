import { getDb } from '../db/index.js'
import { withTx } from '../db/tx.js'
import { badRequest, notFound, forbidden, conflict } from '../utils/errors.js'
import { str, arr, int } from '../middleware/validate.js'
import { brandName, brandKey } from '../utils/brand.js'
import * as restaurants from './restaurantService.js'
import * as recipes from './recipeService.js'
import { previewImages } from './mediaService.js'

export function submit(kind, body, userId, recipeId = null) {
  const db = getDb()
  if (!['restaurant', 'recipe', 'feedback'].includes(kind)) throw badRequest('反馈类型不合法')
  const clientToken = str(body, 'clientToken', { required: false, max: 64 }) || null
  if (clientToken) {
    const prior = db.prepare('SELECT id, kind, payload FROM submissions WHERE user_id = ? AND client_token = ?').get(userId, clientToken)
    if (prior) {
      if (prior.kind !== kind || (JSON.parse(prior.payload).recipeId || null) !== recipeId) throw conflict('重试标识已用于其他登记，请刷新后再试')
      return receipt(prior.id)
    }
  }
  const resubmittedFrom = int(body, 'resubmittedFrom', { required: false, min: 1 }) || null
  if (resubmittedFrom) {
    const previous = db.prepare('SELECT user_id, kind, status, payload FROM submissions WHERE id = ?').get(resubmittedFrom)
    if (!previous || previous.user_id !== userId) throw notFound('原登记不存在')
    if (previous.status !== 'rejected' || previous.kind !== kind
      || (JSON.parse(previous.payload).recipeId || null) !== recipeId) throw badRequest('只能修改自己被驳回的同类登记')
  }
  let payload
  if (kind === 'restaurant') {
    const name = brandName(str(body, 'name', { max: 60, label: '店名' }))
    if (!brandKey(name)) throw badRequest('请填写有效店名')
    payload = { name, category: str(body, 'category', { required: false, max: 20 }) || '其他',
      note: str(body, 'note', { required: false, max: 200 }) }
  } else if (kind === 'feedback') {
    payload = { content: str(body, 'content', { max: 2000, label: '反馈内容' }) }
  } else {
    let restaurantId = int(body, 'restaurantId', { required: !recipeId, min: 1 })
    if (recipeId) {
      const row = db.prepare(`SELECT user_id, restaurant_id, status FROM recipes WHERE id = ?`).get(recipeId)
      if (!row || row.status !== 'published') throw notFound('配方不存在')
      if (row.user_id !== userId) throw forbidden('只能修改自己的配方')
      restaurantId = row.restaurant_id
    }
    restaurantId = restaurants.findById(restaurantId).id
    const items = arr(body, 'items', { required: true, max: 30 })
    if (!items.length) throw badRequest('至少添加一样调料')
    recipes.prepareItems(items)
    if (!items.some(it => Number(it.amountLevel) > 0)) throw badRequest('至少一样调料的用量需要大于零')
    const imageIds = arr(body, 'imageIds', { max: 4 })
    if (new Set(imageIds).size !== imageIds.length) throw badRequest('图片不能重复')
    for (const id of imageIds) {
      if (typeof id !== 'string' || !db.prepare('SELECT 1 FROM uploads WHERE id = ? AND user_id = ?').get(id, userId)) throw badRequest('只能使用自己上传的图片')
    }
    payload = {
      restaurantId, recipeId,
      title: str(body, 'title', { max: 40, label: '蘸料名称' }),
      description: str(body, 'description', { required: false, max: 200 }),
      servingNote: str(body, 'servingNote', { required: false, max: 60 }),
      items: items.map(it => ({ condimentId: it.condimentId, amountLevel: Number(it.amountLevel), amountNote: String(it.amountNote || '').slice(0, 60) })),
      imageIds,
      ...Object.fromEntries(['tasteTags', 'foodTags', 'sceneTags'].map(key => [key, arr(body, key, { max: 10 }).filter(v => typeof v === 'string')])),
    }
  }
  const info = db.prepare('INSERT INTO submissions (user_id, kind, payload, client_token, resubmitted_from) VALUES (?, ?, ?, ?, ?)')
    .run(userId, kind, JSON.stringify(payload), clientToken, resubmittedFrom)
  return receipt(Number(info.lastInsertRowid))
}
function receipt(id) {
  const row = getDb().prepare('SELECT id, kind, status, published_id AS publishedId FROM submissions WHERE id = ?').get(id)
  return { submission: row, message: '已提交，请等待管理员审核' }
}
export function list({ userId = null, id = null, status = '', kind = '', page = 1, pageSize = 20, offset = 0 } = {}) {
  const db = getDb(), where = [], args = []
  if (userId) { where.push('s.user_id = ?'); args.push(userId) }
  if (id) { where.push('s.id = ?'); args.push(id) }
  if (status) { if (!['pending','approved','rejected'].includes(status)) throw badRequest('审核状态不合法'); where.push('s.status = ?'); args.push(status) }
  if (kind) { if (!['restaurant','recipe','feedback'].includes(kind)) throw badRequest('反馈类型不合法'); where.push('s.kind = ?'); args.push(kind) }
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = db.prepare(`SELECT COUNT(*) AS n FROM submissions s ${filter}`).get(...args).n
  const rows = db.prepare(`SELECT s.*, u.nickname, u.username, a.nickname AS reviewer FROM submissions s
    JOIN users u ON u.id = s.user_id LEFT JOIN users a ON a.id = s.reviewed_by ${filter} ORDER BY s.id DESC LIMIT ? OFFSET ?`).all(...args, pageSize, offset)
  return { list: rows.map(row => {
    const payload = JSON.parse(row.payload)
    if (row.kind === 'recipe') {
      payload.restaurantName = db.prepare('SELECT name FROM restaurants WHERE id = ?').get(payload.restaurantId)?.name
      payload.items = payload.items.map(it => ({ ...it, condimentName: db.prepare('SELECT name FROM condiments WHERE id = ?').get(it.condimentId)?.name || it.condimentId }))
      payload.images = previewImages(payload.imageIds)
    }
    return { id: row.id, kind: row.kind, status: row.status, payload, author: { nickname: row.nickname, username: row.username },
      resubmittedFrom: row.resubmitted_from, reviewNote: row.review_note, reviewer: row.reviewer, reviewedAt: row.reviewed_at, createdAt: row.created_at, publishedId: row.published_id }
  }), total, page, pageSize }
}
export function own(id, userId) {
  const record = list({ id, userId }).list[0]
  if (!record) throw notFound('登记不存在')
  return record
}
export function review(id, action, note, adminId) {
  if (!['approve','reject'].includes(action)) throw badRequest('审核操作不合法')
  if (action === 'reject' && !note) throw badRequest('请填写驳回原因')
  const db = getDb()
  return withTx(db, () => {
    const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id)
    if (!row) throw notFound('反馈不存在')
    if (row.status !== 'pending') throw conflict('这条反馈已经审核，请刷新列表')
    const payload = JSON.parse(row.payload)
    let publishedId = null
    if (action === 'approve') {
      if (row.kind === 'restaurant') publishedId = restaurants.create(payload, row.user_id).restaurant.id
      if (row.kind === 'recipe') {
        publishedId = payload.recipeId ? recipes.update(payload.recipeId, payload, row.user_id) : recipes.create(payload, row.user_id)
        db.prepare('DELETE FROM recipe_images WHERE recipe_id = ?').run(publishedId)
        payload.imageIds.forEach((imageId, order) => db.prepare('INSERT INTO recipe_images (recipe_id, upload_id, sort_order) VALUES (?, ?, ?)').run(publishedId, imageId, order))
      }
    }
    db.prepare(`UPDATE submissions SET status = ?, review_note = ?, reviewed_by = ?,
      reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), published_id = ? WHERE id = ?`)
      .run(action === 'approve' ? 'approved' : 'rejected', note, adminId, publishedId, id)
    db.prepare('INSERT INTO notifications (user_id, submission_id, title, content) VALUES (?, ?, ?, ?)')
      .run(row.user_id, id, action === 'approve' ? '投稿已通过审核' : '投稿需修改',
        `${payload.title || payload.name || '意见反馈'}：${note || '审核已通过，可以查看处理结果。'}`)
    return receipt(id)
  })
}
