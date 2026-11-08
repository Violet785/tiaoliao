import { getDb } from '../db/index.js'
import { findById } from '../services/restaurantService.js'

const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
const aliases = { 龍歌: ['龙歌', '龍哥', '龙哥'], 牛NEW: ['牛new'] }
function contextOf(id) {
  if (!id) return null
  try { const shop = findById(id); return { id: shop.id, name: shop.name, category: shop.category, recipeCount: shop.recipeCount } } catch { return null }
}
function storeRequest(question) {
  if (/(?:别|不要|不用|不想)(?:再)?(?:换|切换|离开|跳).*店/.test(question)) return { explicit: false }
  const generic = /换一家|换个店|换家店|换店铺|换店|切换店|选个店|重新选店|还没选店|不知道哪家|不确定店|不是这家|不要这家|^(?:其他店|别的店)[吧呢？?\s]*$/
  const named = question.match(/(?:店名|店铺|餐厅)(?:是|叫|为|：|:)\s*[「“《"]?([^，,。！？?!「」“”《》"]{1,30})/)
  const location = question.match(/(?:我在(?!想|考虑|问|纠结)|我去(?!掉)|想去(?!掉)|换到|改去|就选|去的是|选的是|这次去|这次在)\s*[「“《"]?(.{1,30}?)(?:[，,。！？?!\s」”》"]|(?:的)?(?:蘸料|调料|配方|推荐|怎么配)|$)/)
  if (named || location) return { explicit: true, hint: (named?.[1] || location?.[1] || '').replace(/(?:的)?(?:蘸料|调料|配方|推荐).*$/, '').trim() }
  return { explicit: generic.test(question) }
}

export function resolveStore(question, restaurantId = null) {
  const shops = getDb().prepare(`SELECT id, name, category, recipe_count AS recipeCount FROM restaurants WHERE status = 'published' ORDER BY recipe_count DESC, id DESC`).all()
  const text = normalize(question), matches = [], current = contextOf(restaurantId)
  for (const shop of shops) for (const name of [shop.name, ...(aliases[shop.name] || [])]) {
    const key = normalize(name); let index = text.indexOf(key)
    while (index >= 0) {
      const negative = /(?:不是|不去|别选|不要|不在|排除|不选|不想去|除了)$/.test(text.slice(Math.max(0, index - 6), index))
      matches.push({ shop, start: index, end: index + key.length, negative }); index = text.indexOf(key, index + key.length)
    }
  }
  const uncontained = matches.filter(m => !matches.some(other => other.start <= m.start && other.end >= m.end && other.end - other.start > m.end - m.start))
  const active = [...new Map(uncontained.filter(m => !m.negative).map(m => [m.shop.id, m.shop])).values()]
  const excluded = new Set(uncontained.filter(m => m.negative).map(m => m.shop.id))
  const request = storeRequest(question)
  if (current && !request.explicit && /(?:像|参考|类似).*(?:口味|味道|风格)|那种口味/.test(question)) return { restaurant: current, options: [], reason: 'context' }
  if (active.length === 1) return { restaurant: active[0], options: [], reason: 'explicit' }
  if (active.length > 1) return { restaurant: null, options: active, reason: 'ambiguous' }
  if (excluded.size) return { restaurant: null, options: shops.filter(s => !excluded.has(s.id)).slice(0, 8), reason: 'choose' }
  // 店铺是独立的会话状态。未识别的口味表达不能清空它，也不能靠词表猜成新店。
  if (current && !request.explicit) return { restaurant: current, options: [], reason: 'context' }
  const hint = request.hint || (!request.explicit ? question.trim() : '')
  const key = normalize(hint)
  if (key && key.length <= 30) {
    const options = shops.filter(shop => [shop.name, ...(aliases[shop.name] || [])].some(name => normalize(name).includes(key) || key.includes(normalize(name))))
    if (options.length) return { restaurant: null, options: options.slice(0, 8), reason: 'partial' }
    if (request.explicit) return { restaurant: null, options: shops.slice(0, 8), reason: 'unknown', hint }
  }
  return { restaurant: null, options: shops.slice(0, 8), reason: 'choose' }
}
