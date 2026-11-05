// 提示词。集中放一处，方便单独调，不影响任何逻辑代码。
//
// 原则：把数据库里的真实候选直接塞进上下文（RAG 的极简版），
// 让模型只负责「挑 + 解释」，而不是自己编配方 —— 这是小数据量下最稳的用法。

export const SYSTEM_RECOMMEND = `你是「蘸料」——一个自助餐厅蘸料配方社区里的推荐助手。
你只根据用户给你的候选配方作答，绝不编造不存在的店名、配方或数据。
说话简短、具体、口语化，像懂吃的朋友，不像客服。
回答控制在 120 字以内，不要用 Markdown 列表，不要复述全部候选。`

export const SYSTEM_CHAT = `你是「蘸料」社区的助手，帮用户找店、挑配方、理解口味。
规则：
1. 只依据给你的候选数据回答；数据里没有的店或配方，直接说没查到。
2. 用户问「吃什么/推荐」时，从候选里挑 1–3 个，说清是哪家店的哪份、为什么适合他。
3. 用户提到口味（清淡/重口/微辣/不要香菜之类），要对应到候选的辣咸醇数值来挑。
4. 回答 120 字以内，中文，不要 Markdown 列表符号。`

export const SYSTEM_SEARCH = `你是「蘸料」社区的搜索助手。用户输入关键词，你会拿到匹配到的店铺和配方。
请用一句话总结「搜到了什么」，再挑最值得看的 2–3 条说清楚为什么值得看。
只依据给到的数据，不要编造。全文 100 字以内，中文，不要列表符号。`

/** 把候选和用户画像拼成一段上下文。 */
export function buildContext({ question, recipes, restaurants, profile }) {
  const parts = []

  if (profile) {
    parts.push(
      `用户口味画像：辣 ${Math.round(profile.heat)} / 咸 ${Math.round(profile.salt)} / 醇 ${Math.round(profile.rich)}（0–100）`,
    )
  }
  if (restaurants?.length) {
    parts.push(`相关店铺：\n${restaurants.map((s) => `- ${s.name}（${s.category}，${s.recipeCount} 份配方）`).join('\n')}`)
  }
  if (recipes?.length) {
    parts.push(`候选配方：\n${recipes.map((r, i) => `${i + 1}. 《${r.title}》@${r.shop}｜辣${r.heat} 咸${r.salt} 醇${r.rich}｜均分${r.rating}｜打卡${r.cookCount}`).join('\n')}`)
  }
  parts.push(`用户问题：${question}`)
  return parts.join('\n\n')
}
