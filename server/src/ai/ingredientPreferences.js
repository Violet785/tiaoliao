import { getDb } from '../db/index.js'

const normalize = text => String(text).normalize('NFKC').replace(/\s+/g, '').toLowerCase()
// 泛称才按整组排除；具体名称始终优先匹配，避免「不要蒜末」排除所有蒜类。
const families = {
  香菜: ['aroma_cilantro'], 蒜: ['aroma_garlic_minced', 'aroma_garlic_paste', 'oil_garlic', 'crunch_garlic_fried'],
  葱: ['aroma_scallion', 'oil_scallion', 'crunch_shallot_fried'], 花生: ['paste_peanut', 'oil_peanut', 'crunch_peanut'],
  麻酱: ['paste_sesame', 'paste_sesame_mixed'], 姜: ['aroma_ginger', 'aroma_ginger_shred'],
  醋: ['sauce_vinegar_black', 'sauce_vinegar_rice', 'sauce_vinegar_white'], 酱油: ['sauce_soy_light', 'sauce_soy_dark', 'sauce_soy_steamed'],
}
export function ingredientCatalog() {
  const rows = getDb().prepare(`SELECT id, name, short_name FROM condiments WHERE status = 'published' ORDER BY id`).all()
  const published = new Set(rows.map(r => r.id)), aliases = new Map()
  function add(name, ids) {
    const key = normalize(name)
    if (!key || !ids.length) return
    const entry = aliases.get(key) || { name: name.trim(), key, ids: new Set() }
    ids.forEach(id => entry.ids.add(id)); aliases.set(key, entry)
  }
  for (const row of rows) for (const name of new Set([row.name, row.short_name, ...row.name.split(/[（）()\/／]/)])) {
    add(name, [row.id])
    // 常见省称：洋葱末→洋葱、柠檬汁→柠檬、白胡椒粉→白胡椒。
    const short = name.trim()
    if (short.length > 2 && /[末碎粉汁]$/.test(short)) add(short.slice(0, -1), [row.id])
  }
  for (const [name, ids] of Object.entries(families)) add(name, ids.filter(id => published.has(id)))
  return { aliases, entries: [...aliases.values()].sort((a, b) => b.key.length - a.key.length) }
}
export function ingredientMentions(text, catalog = ingredientCatalog()) {
  const normalized = normalize(text), mentions = []
  for (let index = 0; index < normalized.length;) {
    const entry = catalog.entries.find(e => normalized.startsWith(e.key, index))
    if (entry) { mentions.push({ ...entry, start: index, end: index + entry.key.length }); index += entry.key.length } else index++
  }
  return { text: normalized, mentions }
}
export function withoutIngredientNames(text, catalog = ingredientCatalog()) {
  const match = ingredientMentions(text, catalog)
  let result = '', offset = 0
  for (const mention of match.mentions) { result += match.text.slice(offset, mention.start) + ' '; offset = mention.end }
  return result + match.text.slice(offset)
}
const negative = '不可以(?:放|加)?|不能接受|接受不了|不接受|不喜欢|不爱吃|不想吃|不想要|不能吃|不要|不放|不吃|不加|别放|别加|别用|不用|去掉|排除|避开|吃不来|受不了|讨厌|过敏'
const positive = '可以(?:放|加)?|允许(?:放|加)?|能接受|接受得了|不忌|不排斥|没关系|也行|不限|喜欢|爱吃|想吃|想要|加一点|加点|放点|要'
const actionOf = token => new RegExp(`^(?:${negative})$`).test(token) ? 'exclude' : 'allow'
export function ingredientActions(clause, catalog = ingredientCatalog()) {
  const { text, mentions } = ingredientMentions(clause, catalog), actions = []
  let previousEnd = 0, inherited = null
  for (let i = 0; i < mentions.length; i++) {
    const mention = mentions[i], before = text.slice(previousEnd, mention.start), after = text.slice(mention.end, mentions[i + 1]?.start ?? text.length)
    const prefixes = [...before.matchAll(new RegExp(`${negative}|${positive}`, 'g'))]
    const prefix = prefixes.at(-1)?.[0]
    // 后置表达只属于当前调料，不能把「香菜可以，柠檬汁不要」跨调料传播。
    const suffix = after.match(new RegExp(`^(?:的(?:味道|口味|味))?(?:我)?(?:也|都|已经|实在|真的)*(?:${negative}|${positive.replace(/\|要$/, '')})`))?.[0]
    const suffixToken = suffix?.match(new RegExp(`(?:${negative}|${positive.replace(/\|要$/, '')})$`))?.[0]
    const action = suffixToken ? actionOf(suffixToken) : prefix ? actionOf(prefix) : inherited
    if (suffixToken) {
      // 「柠檬汁和蚝油都不要」的后置指令作用于并列名称，不能越过已有明确指令。
      for (let j = actions.length - 1; j >= 0; j--) {
        if (actions[j].action || !/^(?:和|、|及|与|跟|以及|还有|或|或者)$/.test(text.slice(actions[j].end, mentions[j + 1].start))) break
        actions[j].action = action
      }
    }
    if (prefix) inherited = actionOf(prefix)
    actions.push({ ...mention, action }); previousEnd = mention.end
  }
  return actions
}
export const ingredientClauses = text => text.split(/[，,。；;！？?!]|但是|不过|但|现在|这次/)
export function mentionedIngredient(question, name, catalog = ingredientCatalog()) {
  const target = catalog.aliases.get(normalize(name))
  if (!target) return []
  return ingredientClauses(question).flatMap(c => ingredientActions(c, catalog)).filter(m => m.ids.size === target.ids.size && [...m.ids].every(id => target.ids.has(id)))
}
