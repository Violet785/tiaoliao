import { http } from './request.js'
import { PAGE_SIZE } from '../config/index.js'

/**
 * 餐馆相关。
 *
 * 返回结构（与 server/src/services/restaurantService.js 对齐）：
 *   列表/详情 → { id, name, city, address, landmark, category, note,
 *                 recipeCount, cookCount, createdAt }
 *   详情      → { restaurant, topRecipes[] }
 *
 * 注意列表用的是 cookCount（有多少人照着配过）而不是热度分 ——
 * 餐馆这一层没有自己的热度公式，配方热度已经包含在 recipeCount/cookCount 里了。
 */

export const CATEGORIES = ['自助餐', '火锅', '烤肉', '麻辣烫', '冒菜', '其他']

export function list({ keyword = '', city = '', sort = 'hot', page = 1, pageSize = PAGE_SIZE } = {}) {
  return http.get('/api/restaurants', { keyword, city, sort, page, pageSize })
}

/** 建店前的相似度预检。不建店，只回候选。 */
export function similar({ name, city = '', address = '' }) {
  return http.get('/api/restaurants/similar', { name, city, address })
}

/**
 * 建店。三种结果，靠 HTTP 状态码区分：
 *   201 → 新建成功，data.restaurant
 *   200 → 命中了已存在的店（同名同址或高度相似），data.restaurant 是那家店
 *   409 → 有相似但不确定的候选，data.extra.candidates，需要用户确认
 *
 * 409 是会抛 ApiError 的，调用方要接住 err.extra.candidates。
 * 这里默认 silent —— 「找到相似的店」不该弹 toast，那是页面自己要展示的界面。
 */
export function create(input, { silent = true, ...opts } = {}) {
  return http.post('/api/restaurants', input, { silent, ...opts })
}

export function detail(id) {
  return http.get(`/api/restaurants/${id}`)
}
export function recommendations(id, filters = {}) {
  return http.get(`/api/restaurants/${id}/recommendations`, { ...filters, limit: 6 })
}

export function recipes(id, { sort = 'hot', keyword = '', tasteTag = '', foodTag = '', spice = '', exclude = '', page = 1, pageSize = PAGE_SIZE } = {}) {
  return http.get(`/api/restaurants/${id}/recipes`, { sort, keyword, tasteTag, foodTag, spice, exclude, page, pageSize })
}
