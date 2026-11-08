import { getDb } from '../db/index.js'

export function list(userId, { page = 1, pageSize = 20, offset = 0 } = {}) {
  const db = getDb()
  const total = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?').get(userId).n
  const unread = db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n
  const rows = db.prepare(`SELECT id, submission_id AS submissionId, title, content, read_at AS readAt,
    created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`).all(userId, pageSize, offset)
  return { list: rows, total, unread, page, pageSize }
}

// 用用户 ID 约束每次写入；即使传入他人的通知 ID 也不会修改它。
export function markRead(userId, throughId) {
  const result = getDb().prepare(`UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
    WHERE user_id = ? AND id <= ? AND read_at IS NULL`).run(userId, throughId)
  return { updated: result.changes }
}
