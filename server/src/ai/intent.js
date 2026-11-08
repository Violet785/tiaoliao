import { chat } from './provider.js'
import { aiConfig } from './config.js'
import { parsePreferences } from './chatPreferences.js'
import { preferenceCommand } from './chatCommands.js'
import { ingredientCatalog, ingredientMentions, mentionedIngredient, withoutIngredientNames } from './ingredientPreferences.js'

const ingredients = ['香菜', '蒜', '葱', '花生', '麻酱']
export const CONDITIONS = [
  '要辣', '不辣', '微辣', '中辣', '重辣', '蒜香', '麻酱', '清爽', '酸甜', '沙茶', '藤椒', '咸鲜', '清淡', '重口',
  '配牛肉', '配羊肉', '配海鲜', '配烤肉', '配蔬菜', '配菌菇', '配豆腐', '配虾滑',
  ...ingredients.map(n => '不要' + n), ...ingredients.map(n => '可以放' + n), '清空口味', '辣度不限', '食材不限',
]
function conditionsFor(question, catalog = ingredientCatalog()) {
  const names = ingredientMentions(question, catalog).mentions.map(m => m.name)
  return [...new Set([...CONDITIONS, ...names.flatMap(n => ['不要' + n, '可以放' + n])])]
}
const system = '把用户本句蘸料要求转换为conditions数组，只列出本句明确表达的要求，未提及的不要输出。不要回答问题，不要推荐店铺或配方，只输出JSON。不喜欢、吃不来、受不了的调料用不要；重新允许的调料用可以放。要辣未说程度用要辣，不自动变成重辣。一点辣都不要、一点辣也不能有表示不辣，不是微辣。没说口味的店名或问候输出空数组。'
const examples = [
  ['要辣，不要香菜', ['要辣', '不要香菜']],
  ['麻酱可以，但别放花生', ['麻酱', '不要花生']],
  ['我想清爽点，别弄得满嘴蒜味', ['清爽', '不要蒜']],
  ['海底捞', []],
  ['蒜可以放了，来个微辣的', ['可以放蒜', '微辣']],
  ['把刚才的忌口都忘掉，这次要重辣', ['清空口味', '重辣']],
]
let busy = false
const clausesOf = text => text.split(/[，,。；;！？?!]|但是|不过|但|现在|这次/)
function positiveMention(question, names) {
  return clausesOf(question).some(clause => names.some(name => clause.includes(name)) && !/不喜欢|不要|不想|不吃|不放|别|避开|吃不来|接受不了|受不了|讨厌/.test(clause))
}
export function validateIntent(raw, question) {
  const catalog = ingredientCatalog(), allowed = conditionsFor(question, catalog)
  let object
  try { object = JSON.parse(raw) } catch { return null }
  if (!object || Array.isArray(object) || Object.keys(object).some(key => key !== 'conditions') || !Array.isArray(object.conditions)
    || object.conditions.length > 8 || object.conditions.some(c => typeof c !== 'string' || !allowed.includes(c))) return null
  const accepted = []
  for (let condition of object.conditions) {
    if (condition === '清空口味') {
      const reset = clausesOf(question).some(c => preferenceCommand(c).reset)
      if (!reset) continue
    } else if (condition.startsWith('不要')) {
      const name = condition.slice(2)
      const mentions = mentionedIngredient(question, name, catalog)
      if (!mentions.length || mentions.at(-1).action === 'allow') continue
    } else if (condition.startsWith('可以放')) {
      const name = condition.slice(3)
      if (mentionedIngredient(question, name, catalog).at(-1)?.action !== 'allow') continue
    } else if (condition.startsWith('配')) {
      const name = condition.slice(1), aliases = { 牛肉: ['牛肉', '肥牛'], 羊肉: ['羊肉', '涮羊'], 海鲜: ['海鲜', '虾', '贝'], 菌菇: ['菌菇', '蘑菇'], 豆腐: ['豆腐', '豆制品'] }
      if (!positiveMention(question, aliases[name] || [name])) continue
    } else if (['要辣', '不辣', '微辣', '中辣', '重辣'].includes(condition)) {
      if (!/辣|火辣|刺激|带劲/.test(withoutIngredientNames(question, catalog))) continue
      if (condition === '微辣' && !/微辣|小辣|少辣|一点辣|稍微辣|轻微|(?:别|不要|不想|不喜欢|不能)(?:太|很|重|爆)?辣/.test(question)) condition = '要辣'
      if (condition === '中辣' && !/中辣|辣度适中|适中辣/.test(question)) condition = '要辣'
      if (condition === '重辣' && !/重辣|爆辣|很辣|越辣|特辣|非常辣/.test(question)) condition = '要辣'
      // 明确的不辣要求同时约束模型条件和最终筛选，避免返回相互矛盾的解释。
      if (parsePreferences(question).spice === 'none') condition = '不辣'
    } else if (condition === '辣度不限') {
      if (!/辣/.test(question) || !/不限|都行|随便|不限制|取消/.test(question)) continue
    } else if (condition === '食材不限') {
      if (!/食材|搭配/.test(question) || !/不限|都行|随便|不限制|取消/.test(question)) continue
    } else {
      const evidence = { 蒜香: ['蒜香', '蒜味', '蒜蓉香'], 麻酱: ['麻酱', '芝麻酱'], 清爽: ['清爽', '解腻', '油腻', '腻', '清新'], 酸甜: ['酸甜', '酸酸甜甜'], 沙茶: ['沙茶'], 藤椒: ['藤椒'], 咸鲜: ['咸鲜', '鲜香', '鲜味'], 清淡: ['清淡', '淡', '少盐', '别咸', '不咸'], 重口: ['重口', '浓', '醇厚'] }
      if (!positiveMention(question, evidence[condition] || [condition])) continue
    }
    accepted.push(condition)
  }
  return [...new Set(accepted)]
}

export async function understandTaste(question, previous = {}) {
  const fallback = reason => ({ preferences: parsePreferences(question, previous), source: 'rule', model: null, conditions: [], reason })
  if (!aiConfig.enabled) return fallback('disabled')
  if (busy) return fallback('busy')
  busy = true
  try {
    // 全库匹配后仅将本句涉及的调料加入候选，保持小模型提示短小，也自动支持新发布调料。
    const schema = { type: 'object', properties: { conditions: { type: 'array', items: { enum: conditionsFor(question) }, maxItems: 8 } }, required: ['conditions'], additionalProperties: false }
    const messages = [{ role: 'system', content: system }, ...examples.flatMap(([content, conditions]) => [{ role: 'user', content }, { role: 'assistant', content: JSON.stringify({ conditions }) }]), { role: 'user', content: question }]
    const raw = await chat(messages, { temperature: 0, maxTokens: 120, timeoutMs: aiConfig.intentTimeout, responseFormat: { type: 'json_schema', json_schema: { name: 'sauce_conditions', strict: true, schema } } })
    if (!raw) return fallback('unavailable')
    const conditions = validateIntent(raw, question)
    if (!conditions) return fallback('invalid_output')
    if (!conditions.length) return fallback('no_conditions')
    // 模型只补充语义理解；用户本句明确的条件、取消与重置最后再应用一次。
    const modelPreferences = parsePreferences(conditions.join('，'), previous)
    return { preferences: parsePreferences(question, modelPreferences), source: 'model', model: aiConfig.model, conditions, reason: null }
  } catch { return fallback('unavailable') } finally { busy = false }
}
