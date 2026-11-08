// 草稿按账号和编辑目标隔离，同一浏览器切换账号也不会读到别人的内容。
export function draftKey(userId, context = 'new') { return `sauce:draft:v1:${userId}:${context}` }
export function readDraft(key) {
  try { const data = uni.getStorageSync(key); return data?.version === 1 && data.form && typeof data.form === 'object' ? data : null } catch { return null }
}
export function writeDraft(key, data) {
  try { uni.setStorageSync(key, JSON.parse(JSON.stringify({ ...data, version: 1, at: Date.now() }))); return true } catch { return false }
}
export function dropDraft(key) { try { uni.removeStorageSync(key); return true } catch { return false } }
