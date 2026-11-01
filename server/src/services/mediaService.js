import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import config from '../config.js'
import { getDb } from '../db/index.js'
import { badRequest, notFound } from '../utils/errors.js'

export function upload(base64, userId) {
  if (typeof base64 !== 'string' || base64.length > 6990510 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw badRequest('请选择 5MB 以内的 JPG、PNG 或 WebP 图片')
  }
  const bytes = Buffer.from(base64, 'base64')
  let extension, mime
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.includes(Buffer.from('IEND'))) {
    extension = 'png'; mime = 'image/png'
  } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.subarray(-2).equals(Buffer.from([255,217]))) {
    extension = 'jpg'; mime = 'image/jpeg'
  } else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    extension = 'webp'; mime = 'image/webp'
  } else throw badRequest('图片格式不受支持，请使用 JPG、PNG 或 WebP')
  if (bytes.length > 5 * 1024 * 1024 || bytes.length < 20) throw badRequest('图片大小不合法')
  const id = crypto.randomUUID()
  const key = crypto.randomBytes(32).toString('hex')
  fs.mkdirSync(config.uploadDir, { recursive: true })
  const file = path.join(config.uploadDir, `${id}.${extension}`)
  fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o640 })
  try {
    getDb().prepare('INSERT INTO uploads (id, user_id, mime, extension, access_key) VALUES (?, ?, ?, ?, ?)').run(id, userId, mime, extension, key)
  } catch (e) { fs.unlinkSync(file); throw e }
  return { id, url: privateUrl({ id, access_key: key }) }
}

function signature(row, expires) {
  return crypto.createHmac('sha256', row.access_key).update(`${row.id}:${expires}`).digest('hex')
}
function privateUrl(row) {
  const expires = Math.floor(Date.now() / 1000) + 3600
  return `/api/uploads/${row.id}?expires=${expires}&signature=${signature(row, expires)}`
}
export function previewImages(ids = []) {
  return ids.map(id => {
    const row = getDb().prepare('SELECT id, access_key FROM uploads WHERE id = ?').get(id)
    return row ? { id, url: privateUrl(row) } : null
  }).filter(Boolean)
}
export function imagesFor(recipeId) {
  return getDb().prepare('SELECT upload_id AS id FROM recipe_images WHERE recipe_id = ? ORDER BY sort_order').all(recipeId)
    .map(row => ({ id: row.id, url: `/api/uploads/${row.id}` }))
}
export function readImage(id, query) {
  const db = getDb()
  const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(id)
  if (!row) throw notFound('图片不存在')
  const published = db.prepare(`SELECT 1 FROM recipe_images i JOIN recipes r ON r.id = i.recipe_id
    JOIN restaurants s ON s.id = r.restaurant_id WHERE i.upload_id = ? AND r.status = 'published' AND s.status = 'published'`).get(id)
  if (!published) {
    const expires = Number(query.expires)
    const given = String(query.signature || '')
    const expected = signature(row, expires)
    if (!Number.isSafeInteger(expires) || expires < Date.now() / 1000 || !/^[a-f0-9]{64}$/.test(given)
      || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) throw notFound('图片不存在或预览已过期')
  }
  return { file: path.join(config.uploadDir, `${row.id}.${row.extension}`), mime: row.mime, published: Boolean(published) }
}
