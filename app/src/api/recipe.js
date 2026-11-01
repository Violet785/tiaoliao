import { http } from './request.js'
import { PAGE_SIZE } from '../config/index.js'

/**
 * 配方 / 评分 / 收藏 / 打卡。
 *
 * 返回结构（与 server/src/services/recipeService.js 对齐）：
 *   卡片   → { id, title, description, itemCount, totalAmount,
 *              hotScore, spicyScore, ratingAvg, ratingCount, cookCount,
 *              favoriteCount, amountSummary, author, restaurant, createdAt }
 *   详情   → { recipe, restaurant, author, items[], tags, isAuthor, myRating, isFavorite }
 *   照着配 → { title, stages[], skipList[], summaryLine, cookSessionVersion, ... }
 *
 * hotScore 是热度分（排序依据），spicyScore 是辣度画像（0–100）。
 * 名字像但含义完全不同，别弄混。
 */

export const SORTS = [
  { key: 'hot', label: '最热' },
  { key: 'new', label: '最新' },
  { key: 'likes', label: '点赞最多' },
]

export function list({
  restaurantId = null, keyword = '', sort = 'hot', tasteTag = '', foodTag = '',
  page = 1, pageSize = PAGE_SIZE,
} = {}) {
  return http.get('/api/recipes', { restaurantId, keyword, sort, tasteTag, foodTag, page, pageSize })
}

export function detail(id, opts = {}) {
  return http.get(`/api/recipes/${id}`, undefined, opts)
}

/**
 * ★ 照着配的会话包。
 *
 * 整个会话一次拉完 —— 用户站在调料台前可能信号很差，之后断网也要能走完。
 * cookSessionVersion 变了才需要重新拉，前端可以据此判断本地缓存还能不能用。
 */
export function cook(id, opts = {}) {
  return http.get(`/api/recipes/${id}/cook`, undefined, opts)
}

export function create(input, opts = {}) {
  return http.post('/api/recipes', input, opts)
}

export function update(id, input, opts = {}) {
  return http.patch(`/api/recipes/${id}`, input, opts)
}

export function remove(id, opts = {}) {
  return http.del(`/api/recipes/${id}`, undefined, opts)
}

/** 配完打卡。finished 为真时才会累加 cook_count 和热度分。 */
export function logCook(id, { finished = false, stepReached = 0, skipped = [], substituted = [] } = {}) {
  return http.post(
    `/api/recipes/${id}/cook-log`,
    { finished, stepReached, skipped, substituted },
    // 打卡在收尾页触发，那时用户可能已经在往外走，失败了也不该拿弹窗拦他
    { silent: true },
  )
}

// ── 评分：一人一条，重复提交是改分 ──

export function rate(id, { score, content = '', tasteOk = null }, opts = {}) {
  return http.put(`/api/recipes/${id}/rating`, { score, content, tasteOk }, opts)
}

export function unrate(id, opts = {}) {
  return http.del(`/api/recipes/${id}/rating`, undefined, opts)
}

export function ratings(id, { page = 1, pageSize = PAGE_SIZE } = {}) {
  return http.get(`/api/recipes/${id}/ratings`, { page, pageSize })
}

// ── 收藏：幂等，重复调用不会重复计数 ──

export function favorite(id, opts = {}) {
  return http.post(`/api/recipes/${id}/favorite`, undefined, opts)
}

export function unfavorite(id, opts = {}) {
  return http.del(`/api/recipes/${id}/favorite`, undefined, opts)
}
