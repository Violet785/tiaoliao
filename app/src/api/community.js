import { http } from './request.js'
import { BASE_URL } from '../config/index.js'
export const mediaUrl = url => url && !/^https?:/.test(url) ? BASE_URL + url : url
export const submit = data => http.post('/api/submissions', data)
export const mine = (page = 1) => http.get('/api/submissions/mine', { page })
export const queue = data => http.get('/api/submissions', data)
export const review = (id, action, note = '') => http.post(`/api/submissions/${id}/review`, { action, note })
export const kindLabel = { restaurant: '新增店铺', recipe: '上传蘸料', feedback: '其他反馈' }
export const statusLabel = { pending: '待审核', approved: '已通过', rejected: '已驳回' }
export function newToken() { return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` }
export async function uploadFile(file) {
  let base64
  // #ifdef H5
  const blob = await (await fetch(file.path)).blob()
  if (blob.size > 5 * 1024 * 1024) throw new Error('单张图片不能超过 5MB')
  base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob) })
  // #endif
  // #ifndef H5
  base64 = await new Promise((resolve, reject) => uni.getFileSystemManager().readFile({ filePath: file.path, encoding: 'base64', success: r => resolve(r.data), fail: reject }))
  // #endif
  return http.post('/api/uploads', { base64 })
}
