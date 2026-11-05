// 搜索 + 资讯摘要。
//
// 独立页面用的就是这一个接口：拿到关键词 → 查店铺和配方 → 生成一段「资讯式」总结。
// 没配模型时，摘要由模板拼出来，信息量一样，只是文风朴素。
import { chat as askModel } from './provider.js'
import { aiConfig } from './config.js'
import { SYSTEM_SEARCH, buildContext } from './prompt.js'
import * as data from './data.js'

const MAX_INPUT = 60

function ruleSummary({ q, restaurants, recipes }) {
  if (!restaurants.length && !recipes.length) {
    return `没找到和「${q}」相关的店或配方。换个说法试试，比如只输入店名里的两个字。`
  }

  const bits = []
  if (restaurants.length) {
    bits.push(`找到 ${restaurants.length} 家店：${restaurants.slice(0, 3).map((s) => `${s.name}（${s.recipeCount} 份配方）`).join('、')}`)
  }
  if (recipes.length) {
    const top = recipes[0]
    bits.push(
      `配方 ${recipes.length} 条，最热的是《${top.title}》@${top.shop}（辣 ${top.heat} / 咸 ${top.salt}，均分 ${Number(top.rating || 0).toFixed(1)}）`,
    )
  }
  return `${bits.join('；')}。`
}

/**
 * @returns {Promise<{q: string, restaurants: object[], recipes: object[], answer: string, source: 'ai'|'rule'}>}
 */
export async function searchInfo({ q, limit = 6, userId = null }) {
  const keyword = String(q || '').trim().slice(0, MAX_INPUT)
  if (!keyword) {
    return { q: '', restaurants: [], recipes: [], answer: '输入店名、配方或口味关键词开始搜索。', source: 'rule' }
  }

  const restaurants = data.searchRestaurants(keyword, 4)
  const recipes = data.searchRecipes(keyword, limit)
  const tagMap = data.recipeTags(recipes.map((r) => r.id))

  const enriched = recipes.map((r) => ({
    id: r.id,
    title: r.title,
    shop: r.shop,
    shopId: r.restaurant_id,
    heat: r.heat,
    salt: r.salt,
    rich: r.rich,
    rating: Number((r.rating || 0).toFixed(2)),
    cookCount: r.cookCount,
    tags: tagMap.get(r.id) || [],
  }))

  let answer = null
  if (aiConfig.enabled) {
    answer = await askModel(
      [
        { role: 'system', content: SYSTEM_SEARCH },
        { role: 'system', content: buildContext({ recipes: enriched, restaurants, profile: null }) },
        { role: 'user', content: keyword },
      ],
      { maxTokens: 200 },
    )
  }

  return {
    q: keyword,
    restaurants,
    recipes: enriched,
    answer: answer || ruleSummary({ q: keyword, restaurants, recipes: enriched }),
    source: answer ? 'ai' : 'rule',
  }
}
