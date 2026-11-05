// 推荐召回与打分（规则层）。
//
// 为什么不做协同过滤：现在的数据量是「个位数配方、几位用户」，
// 相似度矩阵几乎全是 0，算出来的结果还不如按口味画像排。
// 所以这里用「口味向量 + 热度 + 新鲜度」的加权打分，解释性好、可调、零成本。
//
// 大模型不参与这一步 —— 它只在后面负责把结果讲成人话（见 chat.js）。
import * as data from './data.js'

/** 口味相似度：越接近 1 越像。辣度权重最高，因为它是用户最先感知的维度。 */
export function tasteSimilarity(a, b) {
  const dh = (a.heat - b.heat) / 100
  const ds = (a.salt - b.salt) / 100
  const dr = (a.rich - b.rich) / 100
  const dist = Math.sqrt(dh * dh * 0.45 + ds * ds * 0.3 + dr * dr * 0.25)
  return Math.max(0, 1 - dist)
}

function freshness(createdAt) {
  const t = Date.parse(createdAt)
  if (Number.isNaN(t)) return 0.5
  const days = (Date.now() - t) / 86_400_000
  return Math.max(0, 1 - days / 90)
}

function reasonOf({ sim, recipe, profile }) {
  if (sim >= 0.85) return `和你喜欢的口味几乎一致（辣 ${recipe.heat}）`
  if (sim >= 0.7) return `口味接近你常点的（辣 ${recipe.heat} / 咸 ${recipe.salt}）`
  if (profile?.samples) return '这家店里比较受欢迎的一份'
  return '全站最近比较热的一份'
}

/**
 * @returns {{list: object[], profile: object, source: 'rule', personalized: boolean}}
 */
export function recommendRecipes({ userId = null, limit = 6 } = {}) {
  const pool = data.listRecipes(80)
  if (!pool.length) {
    return { list: [], profile: null, source: 'rule', personalized: false }
  }

  const personal = data.userTaste(userId)
  const profile = personal || data.globalTaste()
  const seen = data.interactedRecipeIds(userId)
  const maxHot = Math.max(...pool.map((r) => r.hot || 0), 1)

  const scored = pool.map((recipe) => {
    const sim = tasteSimilarity(profile, recipe)
    const hot = (recipe.hot || 0) / maxHot
    const score = 0.6 * sim + 0.3 * hot + 0.1 * freshness(recipe.createdAt)
    return {
      recipe,
      sim,
      // 已经点过/收藏过的降权，但不排除 —— 有些人就是想再配一次
      score: seen.has(recipe.id) ? score * 0.55 : score,
    }
  })

  scored.sort((a, b) => b.score - a.score)

  const picked = scored.slice(0, limit)
  const tagMap = data.recipeTags(picked.map((p) => p.recipe.id))

  return {
    list: picked.map(({ recipe, sim, score }) => ({
      id: recipe.id,
      title: recipe.title,
      shop: recipe.shop,
      shopId: recipe.restaurant_id,
      heat: recipe.heat,
      salt: recipe.salt,
      rich: recipe.rich,
      rating: Number((recipe.rating || 0).toFixed(2)),
      cookCount: recipe.cookCount,
      tags: tagMap.get(recipe.id) || [],
      reason: reasonOf({ sim, recipe, profile: personal }),
      score: Number(score.toFixed(3)),
    })),
    profile,
    personalized: Boolean(personal),
    source: 'rule',
  }
}

/** 给对话/搜索用的紧凑文本，避免把整个对象塞进 prompt。 */
export function summarizeForPrompt(list) {
  return list
    .map(
      (r, i) =>
        `${i + 1}. 《${r.title}》@${r.shop}｜辣${r.heat} 咸${r.salt} 醇${r.rich}｜均分${r.rating}｜打卡${r.cookCount}${r.tags?.length ? '｜' + r.tags.join('/') : ''}`,
    )
    .join('\n')
}

export default { recommendRecipes, tasteSimilarity, summarizeForPrompt }
