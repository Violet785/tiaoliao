// 店铺推荐、全站推荐和对话共用点赞/差评排序，避免入口不同而忽略用户的不喜欢。
import { recommend } from '../services/recommendationService.js'
import { recipeTags } from './data.js'

export function tasteSimilarity(a, b) {
  const dh = (a.heat - b.heat) / 100, ds = (a.salt - b.salt) / 100, dr = (a.rich - b.rich) / 100
  return Math.max(0, 1 - Math.sqrt(dh * dh * 0.45 + ds * ds * 0.3 + dr * dr * 0.25))
}
export function recommendRecipes({ userId = null, restaurantId = null, limit = 6 } = {}) {
  const result = recommend({ userId, restaurantId, limit })
  const tags = recipeTags(result.list.map(r => r.id))
  return {
    ...result, source: 'rule',
    list: result.list.map(r => ({ id: r.id, title: r.title, shop: r.restaurant.name, shopId: r.restaurant.id,
      ...r.tasteProfile, rating: r.ratingAvg, cookCount: r.cookCount, tags: tags.get(r.id) || [],
      contentType: r.contentType, reason: r.recommendationReason, score: r.recommendationScore })),
  }
}
export function summarizeForPrompt(list) {
  return list.map((r, i) => `${i + 1}. 《${r.title}》@${r.shop}｜辣${r.heat} 咸${r.salt} 醇${r.rich}｜均分${r.rating}｜打卡${r.cookCount}${r.tags?.length ? '｜' + r.tags.join('/') : ''}${r.contentType === 'reference' ? '｜通用参考，未经线下试配' : ''}`).join('\n')
}
export default { recommendRecipes, tasteSimilarity, summarizeForPrompt }
