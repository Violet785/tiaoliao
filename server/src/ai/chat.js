// 对话逻辑：先取真实数据，再让模型组织语言；模型不可用时走规则话术。
//
// 关键取舍：模型永远不接触数据库，只在「已经查好的候选」里挑。
// 这样即使模型胡编，也不会出现不存在的店；没有 key 时体验也完整。
import { chat as askModel } from './provider.js'
import { aiConfig } from './config.js'
import { recommendRecipes, summarizeForPrompt } from './recommend.js'
import { SYSTEM_CHAT, buildContext } from './prompt.js'
import * as data from './data.js'

const MAX_HISTORY = 6
const MAX_INPUT = 300

/** 规则模式下的兜底回答。按关键词挑候选，保证「没配模型也能用」。 */
function ruleReply(question, { list, profile }) {
  const q = question.toLowerCase()
  const has = (...words) => words.some((w) => q.includes(w))

  if (has('你好', 'hi', 'hello', '在吗', '你是谁')) {
    return '我是蘸料的推荐助手。可以问我「推荐一份清淡的」「哪家店的麻酱好吃」「牛很鲜有什么配方」。'
  }

  if (!list.length) {
    return '现在库里还没有已发布的配方，等大家上传并审核通过后我就能推荐了。'
  }

  let picked = list
  if (has('清淡', '不辣', '微辣', '怕辣')) {
    picked = [...list].sort((a, b) => a.heat - b.heat).slice(0, 3)
  } else if (has('辣', '重口', '过瘾', '重味')) {
    picked = [...list].sort((a, b) => b.heat - a.heat).slice(0, 3)
  } else if (has('咸', '酱')) {
    picked = [...list].sort((a, b) => b.salt - a.salt).slice(0, 3)
  }

  const top = picked[0]
  const rest = picked.slice(1, 3).map((r) => `《${r.title}》@${r.shop}`).join('、')
  const taste = profile ? `你的口味大致是辣 ${Math.round(profile.heat)}、咸 ${Math.round(profile.salt)}。` : ''

  return `${taste}先试《${top.title}》@${top.shop}：辣 ${top.heat}、咸 ${top.salt}、醇 ${top.rich}，${top.rating ? '均分 ' + top.rating + '，' : ''}被照着配了 ${top.cookCount} 次。${rest ? '另外还可以看 ' + rest + '。' : ''}`
}

/** 从候选里检索跟问题最相关的几条（关键词命中标题/店铺/标签的优先）。 */
function focusCandidates(question, list) {
  const q = question.toLowerCase()
  const hit = list.filter((r) =>
    [r.title, r.shop, ...(r.tags || [])].some((v) => v && q.includes(String(v).toLowerCase())),
  )
  return hit.length ? hit : list
}

/**
 * @param {{message: string, history?: Array, userId?: number|null}} input
 * @returns {Promise<{reply: string, source: 'ai'|'rule', mode: string}>}
 */
export async function chatReply({ message, history = [], userId = null }) {
  const question = String(message || '').trim().slice(0, MAX_INPUT)
  if (!question) {
    return { reply: '想找什么？可以问我「哪家店的蘸料清淡一点」或者「推荐一份麻酱的」。', source: 'rule', mode: aiConfig.enabled ? 'ai' : 'rule' }
  }

  // 候选池给大一点：对话里经常要按店名找，池子太小会漏
  const rec = recommendRecipes({ userId, limit: 20 })
  const candidates = focusCandidates(question, rec.list)
  const restaurants = data.searchRestaurants(question, 3)

  if (aiConfig.enabled) {
    const messages = [
      { role: 'system', content: SYSTEM_CHAT },
      ...history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 500) })),
      {
        role: 'user',
        content: buildContext({
          question,
          recipes: candidates,
          restaurants,
          profile: rec.profile,
        }),
      },
    ]

    const text = await askModel(messages)
    if (text) return { reply: text, source: 'ai', mode: 'ai' }
  }

  // 规则模式用「聚焦后的候选」，这样问「牛很鲜有什么配方」才会先答那家店
  return { reply: ruleReply(question, { list: candidates, profile: rec.profile }), source: 'rule', mode: 'rule' }
}

/** 供调试：把当前候选压缩成一行，确认检索没跑偏。 */
export function debugCandidates(userId) {
  const rec = recommendRecipes({ userId, limit: 5 })
  return summarizeForPrompt(rec.list)
}
