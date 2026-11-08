import { readRecipeFilters } from '../utils/recipeFilters.js'
import { emptyPreferences, preferenceCommand } from './chatCommands.js'
import { ingredientCatalog, ingredientActions, withoutIngredientNames } from './ingredientPreferences.js'
// 数量在否定词前时仍表示完全不辣，不能被后面的「一点辣」微辣规则抢先匹配。
const tinyAmount = '一(?:点(?:点|儿)?|丁点(?:儿)?|丝(?:丝)?|丝毫)|半点'
const rejectAmount = '(?:也|都)?(?:不要|不想要|不能(?:有|吃|加|放|带)?|不(?:要|吃|加|放|带)|别(?:有|加|放|带))'
const rejectsAnySpice = new RegExp(`(?:(?:${tinyAmount})(?:的)?辣(?:味)?|辣(?:味)?(?:${tinyAmount}))${rejectAmount}|(?:不要|不想要|不能有|不加|不放|别加|别放)(?:${tinyAmount})(?:的)?辣`)
export function parsePreferences(question, previous = {}) {
  const base = readRecipeFilters({ ...previous, exclude: Array.isArray(previous.exclude) ? previous.exclude.join(',') : previous.exclude })
  let result = { spice: base.spice, tasteTag: base.tasteTag, foodTag: base.foodTag, exclude: '' }
  const excluded = new Set(base.exclude)
  const catalog = ingredientCatalog()
  // 按先后处理修改，避免「之前不辣，现在重辣」仍被旧条件覆盖。
  for (const original of question.split(/[，,。；;！？?!]|但是|不过|但|现在|这次/)) {
    const command = preferenceCommand(original)
    if (command.reset) { result = emptyPreferences(); excluded.clear() }
    let clause = command.text
    clause = clause.replace(/(?:辣度不限|辣味不限|不限制辣度|不限辣度|取消(?:之前的)?(?:不辣|微辣|中辣|重辣)(?:要求|限制)?)/g, () => { result.spice = ''; return '' })
    clause = clause.replace(/(?:食材不限|不限食材|搭配不限|取消食材限制)/g, () => { result.foodTag = ''; return '' })
    for (const mention of ingredientActions(clause, catalog)) {
      if (mention.action === 'exclude') {
        mention.ids.forEach(id => excluded.add(id))
        if (result.tasteTag === 'taste_sesame' && [...mention.ids].some(id => /^paste_sesame/.test(id))) result.tasteTag = ''
      } else if (mention.action === 'allow') mention.ids.forEach(id => excluded.delete(id))
    }
    const spiceClause = withoutIngredientNames(clause, catalog)
    // 先识别否定与具体辣度，再识别泛辣味，避免把「不加辣」当作「加辣」。
    if (rejectsAnySpice.test(spiceClause) || /不辣|(?:不要|不|别|不用)(?:要|吃|加|放|来|带)?辣|不想(?:要|吃|加|放|来)?辣|不能吃辣|不喜欢辣|怕辣|清淡|无辣/.test(spiceClause)) result.spice = 'none'
    else if (/微辣|一点(?:点|儿)?辣|少辣|(?:别|不要|不想|不喜欢|不能)(?:太|重|很|爆)辣|不太辣/.test(spiceClause)) result.spice = 'mild'
    else if (/中辣/.test(spiceClause)) result.spice = 'medium'
    else if (/重辣|很辣|越辣|爆辣/.test(spiceClause)) result.spice = 'hot'
    else if (/辣的|辣一点|吃辣|香辣|麻辣|酸辣|(?:要|加|放|来)(?:点|一点|些|一些|点儿)?辣|辣味|^辣$/.test(spiceClause)) result.spice = 'spicy'
    const positiveClause = /吃不来|受不了|接受不了|讨厌/.test(clause) ? '' : clause.replace(/(?:不要|不放|不吃|去掉|别|不加|不喜欢).*/, '')
    for (const [pattern, id] of [[/麻酱|芝麻酱/, 'taste_sesame'], [/蒜香|蒜味/, 'taste_garlic'], [/沙茶/, 'taste_shacha'], [/藤椒/, 'taste_tengjiao'], [/酸甜/, 'taste_soursweet'], [/酸辣/, 'taste_suanla'], [/清爽/, 'taste_refresh'], [/甜口|甜一点|甜的/, 'taste_sweet'], [/咸鲜/, 'taste_xianxian'], [/重口/, 'taste_heavy']]) if (pattern.test(positiveClause)) { result.tasteTag = id; break }
    if (/不咸|少盐|低盐/.test(clause)) result.tasteTag = 'taste_light'
    if (result.spice === 'none' && ['taste_mala', 'taste_xiangla', 'taste_suanla', 'taste_tengjiao'].includes(result.tasteTag)) result.tasteTag = ''
    for (const [pattern, id] of [[/虾滑/, 'food_shrimp_slide'], [/牛肉|肥牛/, 'food_beef_roll'], [/羊肉/, 'food_lamb'], [/烤肉/, 'food_grill_pork'], [/海鲜|贝类/, 'food_shellfish'], [/虾/, 'food_boiled_shrimp'], [/蔬菜/, 'food_veg'], [/菌菇|蘑菇/, 'food_mushroom'], [/毛肚|黄喉/, 'food_tripe'], [/豆腐/, 'food_tofu']]) if (pattern.test(positiveClause)) { result.foodTag = id; break }
  }
  result.exclude = [...excluded].join(',')
  return result
}
