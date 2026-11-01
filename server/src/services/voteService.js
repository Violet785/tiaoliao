import { getDb } from '../db/index.js'
import { withTx } from '../db/tx.js'
import { badRequest, notFound } from '../utils/errors.js'
export function counts(id, userId = null) {
  const db = getDb()
  return {
    likeCount: db.prepare('SELECT COUNT(*) AS n FROM recipe_votes WHERE recipe_id = ? AND value = 1').get(id).n,
    dislikeCount: db.prepare('SELECT COUNT(*) AS n FROM recipe_votes WHERE recipe_id = ? AND value = -1').get(id).n,
    myVote: userId ? db.prepare('SELECT value FROM recipe_votes WHERE recipe_id = ? AND user_id = ?').get(id, userId)?.value || 0 : 0,
  }
}
export function vote(id, userId, value) {
  if (![0, 1, -1].includes(value)) throw badRequest('投票必须为点赞、差评或取消')
  const db = getDb()
  if (!db.prepare(`SELECT 1 FROM recipes r JOIN restaurants s ON s.id = r.restaurant_id
    WHERE r.id = ? AND r.status = 'published' AND s.status = 'published'`).get(id)) throw notFound('配方不存在')
  return withTx(db, () => {
    if (!value) db.prepare('DELETE FROM recipe_votes WHERE recipe_id = ? AND user_id = ?').run(id, userId)
    else db.prepare(`INSERT INTO recipe_votes (recipe_id, user_id, value) VALUES (?, ?, ?)
      ON CONFLICT(recipe_id, user_id) DO UPDATE SET value = excluded.value`).run(id, userId, value)
    return counts(id, userId)
  })
}
