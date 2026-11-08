import { getDb } from '../db/index.js'
import { recommend } from '../services/recommendationService.js'
import { detail } from '../services/recipeService.js'
import { resolveStore } from './storeContext.js'
import { preferenceCommand } from './chatCommands.js'
import { understandTaste } from './intent.js'

function preferenceSummary(filters) {
  const labels = [], db = getDb()
  const spicy = { none: '不辣', mild: '微辣', medium: '中辣', hot: '重辣', spicy: '有辣味' }
  if (spicy[filters.spice]) labels.push(spicy[filters.spice])
  for (const id of [filters.tasteTag, filters.foodTag].filter(Boolean)) { const row = db.prepare(`SELECT name FROM tags WHERE id = ? AND status = 'published'`).get(id); if (row) labels.push(row.name) }
  const ids = (filters.exclude || '').split(',').filter(Boolean)
  if (ids.length) {
    const names = db.prepare(`SELECT DISTINCT short_name AS name FROM condiments WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(r => r.name).filter(Boolean)
    if (names.length) labels.push('不放' + names.join('、'))
  }
  return labels
}

// 店铺和配方都由数据库确定。回复与名片来自同一份结果，避免自由生成文本串店。
export async function chatReply({ message, userId = null, restaurantId = null, preferences = {} }) {
  const question = String(message || '').trim().slice(0, 300)
  const scope = resolveStore(question, restaurantId), understanding = await understandTaste(question, preferences)
  const filters = understanding.preferences, labels = preferenceSummary(filters), source = understanding.source === 'model' ? 'ai' : 'rule'
  const preferencesReset = understanding.conditions.includes('清空口味') || question.split(/[，,。；;！？?!]|但是|不过|但|现在|这次/).some(clause => preferenceCommand(clause).reset)
  const base = { source, mode: source, understanding: { source: understanding.source, model: understanding.model, conditions: understanding.conditions, fallbackReason: understanding.reason }, preferencesReset, preferences: filters, preferenceSummary: labels, cards: [], restaurant: scope.restaurant, restaurantOptions: scope.options, needsRestaurant: !scope.restaurant }
  if (!scope.restaurant) {
    const reply = scope.reason === 'ambiguous' ? '你提到了多家店，这次想在哪家配蘸料？选定一家后，我只推荐这家店的配方。'
      : scope.reason === 'partial' ? '店名还没确认完整，你指的是下面哪一家？'
      : scope.reason === 'unknown' ? `还没确认「${scope.hint}」对应哪家店。请填写完整店名，或从下面选择。`
      : '这次在哪家店配蘸料？先告诉我店名，或点下面的店铺，再按你的口味推荐。'
    return { ...base, reply }
  }
  const shop = scope.restaurant
  if (/^(谢谢|谢谢你|好的|好|嗯)[!！。.？?\s]*$/.test(question)) return { ...base, reply: `好的，当前仍是${shop.name}。想换口味或换店时直接告诉我。` }
  if (/^(你好|您好|hi|hello|哈喽|在吗|你是谁|你能做什么)[!！。.？?\s]*$/i.test(question)) return { ...base, reply: `当前是${shop.name}。告诉我想吃什么口味、搭配什么食材，或者哪些调料不想放。` }
  const result = recommend({ restaurantId: shop.id, userId, limit: 3, filters: { ...filters, exclude: filters.exclude ? filters.exclude.split(',') : [] } })
  const cards = result.list.map(recipe => {
    const full = detail(recipe.id, userId)
    return { ...recipe, ingredients: full.items.map(it => ({ condimentId: it.condimentId, name: it.condimentName, amountLevel: it.amountLevel, amount: it.amountLabel, note: it.amountNote })),
      tags: [...full.tags.taste, ...full.tags.food].map(t => t.name) }
  })
  if (!cards.length) {
    const reason = !shop.recipeCount ? '还没有已发布配方，可以先通过反馈登记补充。'
      : result.emptyReason === 'all_disliked' ? '符合要求的配方都被你标记为不喜欢了，可以到店铺里调整喜好，或换个口味条件。'
      : `暂时没有符合${labels.length ? '“' + labels.join('、') + '”' : '当前条件'}的配方。可以减少筛选条件，我仍会只在这家店里找。`
    return { ...base, reply: `${shop.name}${reason}`, personalized: result.personalized, feedback: result.feedback }
  }
  return { ...base, cards, personalized: result.personalized, feedback: result.feedback,
    reply: `${preferencesReset ? '本次口味要求已重置。' : ''}${shop.name}里先看看这${cards.length}款：${cards.map(r => r.title).join('、')}。名片中列了调料和用量，可以直接照着配。` }
}

export function debugCandidates(userId, restaurantId) {
  if (!restaurantId) return '尚未选择店铺'
  return recommend({ userId, restaurantId, limit: 3 }).list.map(r => `${r.restaurant.name}：${r.title}`).join('\n')
}
