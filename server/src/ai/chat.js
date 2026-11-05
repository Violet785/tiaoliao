// 对话逻辑：规则先选，模型后说；模型不可用时走规则话术。
//
// 关键取舍：选哪一条由规则决定，模型只负责把它讲成一句话。
// 小模型（0.5B–1.5B）判断力弱但语言还过得去，这样分工既稳又快。
import { chat as askModel } from './provider.js'
import { aiConfig } from './config.js'
import { recommendRecipes, summarizeForPrompt } from './recommend.js'
import { SYSTEM_VERBALIZE } from './prompt.js'
import * as data from './data.js'

const MAX_HISTORY = 6
const MAX_INPUT = 300

/** 按问题里的口味词挑候选（规则选，模型不参与）。 */
function pickByIntent(question, list) {
  const q = question.toLowerCase()
  const has = (...words) => words.some((w) => q.includes(w))

  if (has('清淡', '不辣', '微辣', '怕辣')) return [...list].sort((a, b) => a.heat - b.heat)
  if (has('辣', '重口', '过瘾', '重味')) return [...list].sort((a, b) => b.heat - a.heat)
  if (has('咸', '酱')) return [...list].sort((a, b) => b.salt - a.salt)
  return list
}

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

  const picked = pickByIntent(question, list).slice(0, 3)

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

/** 清理模型输出：去掉标签、多余换行；明显在念字段名的直接判为无效。 */
function cleanReply(text) {
  if (!text) return null

  const flat = String(text).replace(/\s+/g, ' ').trim()
  if (!flat) return null

  // 「配方名：」「辣度：」这类标签出现，说明它在复述输入，不是回答
  if (/(配方名|店名|辣度|咸度|醇厚)\s*[:：]/.test(flat)) return null
  // 标签省略冒号、但把数值抄了一遍的情况也要拦（0.5B 很爱这么写）
  if (/(辣度|咸度|醇厚)\s*\d/.test(flat)) return null
  if (/^[-*\d]\.\s/.test(flat)) return null
  if (flat.length > 80) return null

  return flat
}

/** 打招呼之类的非检索问题，直接走规则，别浪费一次推理。 */
function isSmallTalk(question) {
  return /^(你好|您好|hi|hello|哈喽|在吗|你是谁|你能做什么)[!！。.？?\s]*$/i.test(question)
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

  // 寒暄不查库、不推理：小模型答这类问题容易硬推一份配方，很怪
  if (isSmallTalk(question)) {
    return {
      reply: '我是蘸料的推荐助手。可以问我「推荐一份清淡的」「哪家店的麻酱好吃」「牛很鲜有什么配方」。',
      source: 'rule',
      mode: aiConfig.enabled ? 'ai' : 'rule',
    }
  }

  if (aiConfig.enabled) {
    // 分工：规则选哪一条，模型只负责把这一条讲成人话。
    //
    // 为什么不把整个候选列表丢给模型：0.5B/1.5B 在 CPU 上既慢又会「照抄列表」，
    // 实测会推荐错店、编造标题。锁定唯一目标后，它只需要组织一句话，稳定性完全不同。
    const picked = pickByIntent(question, candidates)
    const target = picked[0]

    if (target) {
      const messages = [
        { role: 'system', content: SYSTEM_VERBALIZE },
        ...history
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .slice(-MAX_HISTORY)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 300) })),
        {
          role: 'user',
          content: `配方名：${target.title}\n店名：${target.shop}\n辣度：${target.heat}，咸度：${target.salt}，醇厚：${target.rich}\n用户说：${question}`,
        },
      ]

      // 一句话就够，token 上限压到 90，避免它发散成长篇
      const text = await askModel(messages, { maxTokens: 90, temperature: 0.5 })
      const clean = cleanReply(text)
      // 小模型经常把「配方名：…辣度：…」原样吐回来。这种输出直接丢掉走规则：
      // 与其念字段名，不如用模板给一句完整的话。
      if (clean) return { reply: clean, source: 'ai', mode: 'ai' }
    }
  }

  // 规则模式用「聚焦后的候选」，这样问「牛很鲜有什么配方」才会先答那家店
  return { reply: ruleReply(question, { list: candidates, profile: rec.profile }), source: 'rule', mode: 'rule' }
}

/** 供调试：把当前候选压缩成一行，确认检索没跑偏。 */
export function debugCandidates(userId) {
  const rec = recommendRecipes({ userId, limit: 5 })
  return summarizeForPrompt(rec.list)
}
