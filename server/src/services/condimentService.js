// 调料库与标签。
//
// 这两份数据是低频变动的元数据，前端会长时间缓存，所以响应里带上 ETag，
// 客户端下次带 If-None-Match 就能拿到 304，省流量也省解析时间。
import crypto from 'node:crypto'
import { getDb } from '../db/index.js'
import { CATEGORY_META, CATEGORY_ORDER } from '../constants.js'
import { conflict, badRequest } from '../utils/errors.js'

const COLUMNS = `
  id, name, short_name AS shortName, category, stage_order AS stageOrder,
  sort_order AS sortOrder, glyph, color, default_amount AS defaultAmount,
  unit_hint AS unitHint, flavor_tags AS flavorTags,
  spicy_weight AS spicyWeight, salty_weight AS saltyWeight, rich_weight AS richWeight,
  caution, is_allergen AS isAllergen
`

function hydrate(row) {
  let flavorTags = []
  try {
    flavorTags = JSON.parse(row.flavorTags)
  } catch {
    // 脏数据不该让整个调料库接口挂掉
  }
  return { ...row, flavorTags, isAllergen: Boolean(row.isAllergen) }
}

/** 全部调料，按「幕」再按摆位排序，并分好组 —— 前端拿到就能直接渲染 */
export function listGrouped() {
  const db = getDb()
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM condiments WHERE status = 'published' ORDER BY stage_order, sort_order`)
    .all()
    .map(hydrate)

  const groups = CATEGORY_ORDER.map((key) => {
    const meta = CATEGORY_META[key]
    return {
      category: key,
      label: meta.label,
      stageOrder: meta.stageOrder,
      stageName: meta.stageName,
      color: meta.color,
      items: rows.filter((r) => r.category === key),
    }
  }).filter((g) => g.items.length > 0)

  return { groups, total: rows.length }
}

/**
 * 用户补充新调料。
 *
 * 进 'pending' 状态而不是直接发布 —— 调料主数据是所有配方共用的基础，
 * 一个错别字或恶意名称会污染每一处引用。等有人审过再发布。
 * （当前没有后台审核界面，先用 sqlite 直接改 status 即可。）
 */
export function createSuggestion({ name, category, unitHint = '勺', glyph = '', userId }) {
  const db = getDb()

  if (!CATEGORY_ORDER.includes(category)) {
    throw badRequest(`类目只能是 ${CATEGORY_ORDER.join(' / ')} 之一`)
  }

  const exists = db.prepare('SELECT id, status FROM condiments WHERE name = ?').get(name)
  if (exists) throw conflict('这个调料已经存在了')

  // 自定义调料用 user_ 前缀的 id，跟预置的语义 id（oil_sesame）在格式上就能区分开
  const id = `user_${crypto.randomBytes(6).toString('hex')}`

  db.prepare(
    `INSERT INTO condiments (id, name, short_name, category, stage_order, sort_order,
                             glyph, color, unit_hint, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  ).run(
    id, name, name, category,
    CATEGORY_META[category].stageOrder,
    9999,                       // 排在预置项之后
    glyph || name.slice(0, 1),
    CATEGORY_META[category].color,
    unitHint, userId,
  )

  return { id, name, status: 'pending' }
}

// ─────────────────────────── 标签 ───────────────────────────

export function listTags(kind = null) {
  const db = getDb()
  const rows = kind
    ? db.prepare(`SELECT id, kind, name FROM tags WHERE kind = ? AND status = 'published' ORDER BY sort_order`).all(kind)
    : db.prepare(`SELECT id, kind, name FROM tags WHERE status = 'published' ORDER BY kind, sort_order`).all()

  if (kind) return { list: rows, total: rows.length }

  return {
    grouped: {
      taste: rows.filter((r) => r.kind === 'taste'),
      food: rows.filter((r) => r.kind === 'food'),
      scene: rows.filter((r) => r.kind === 'scene'),
    },
    total: rows.length,
  }
}

/** 根据内容算一个 ETag。内容没变则值不变。 */
export function etagOf(payload) {
  return `"${crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16)}"`
}
