// 配方的派生指标：热度、口味画像。
//
// 全部放在这里集中计算，好处是：公式随时可调、可单测，
// 而且不依赖 SQLite 的数学函数编译选项（虽然实测 log() 可用，
// 但把业务公式塞进 SQL 会让它极难调整和验证）。

/**
 * 热度分。
 *
 * 三个信号，取对数是因为它们的量级差异大 —— 评分最多 5 分，
 * 而打卡次数可能到几百。不取对数的话打卡数会完全压过评分。
 *
 *   rating_avg      质量。乘 20 是为了让它和打卡项量级相当（5 分 → 100 分）
 *   cook_count      ★ 最强的意图信号 —— 用户真的照着配了，不只是点了个赞
 *   favorite_count  收藏，弱一些的意图信号
 *
 * 时间衰减：新配方需要曝光机会，老配方不能靠历史积累一直占着榜单。
 * 用「每 30 天减 1 分」的线性衰减，比指数衰减更平缓、更容易理解。
 */
export function computeHotScore({ ratingAvg = 0, cookCount = 0, favoriteCount = 0, createdAt }) {
  const base =
    ratingAvg * 20 +
    Math.log(cookCount + 1) * 12 +
    Math.log(favoriteCount + 1) * 6

  const days = daysSince(createdAt)
  const decay = days / 30

  return Number(Math.max(0, base - decay).toFixed(3))
}

function daysSince(iso) {
  if (!iso) return 0
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, (Date.now() - t) / 86_400_000)
}

/**
 * 口味画像。
 *
 * 对每样调料，用它的风味权重乘以用量档位再求和 —— 也就是「放了多少 × 这个料有多辣」。
 * 最后按所有同类权重的上限归一化到 0–100，这样「微辣」和「爆辣」才有区分度。
 *
 * 归一化的分母用「全部调料都放到最大档」的理论上限，
 * 而不是用户自己的总量 —— 否则只放了两样料的配方也会因为占比高而显示成重辣。
 */
export function computeTasteProfile(items) {
  let spicy = 0
  let salty = 0
  let rich = 0

  for (const it of items) {
    const w = it.amountLevel ?? 0
    spicy += w * (it.spicyWeight ?? 0)
    salty += w * (it.saltyWeight ?? 0)
    rich += w * (it.richWeight ?? 0)
  }

  return {
    heatScore: to100(spicy),
    saltScore: to100(salty),
    richScore: to100(rich),
  }
}

// 单样调料的理论最大贡献 = 档位上限 5 × 权重上限 5 = 25。
// 一个配方通常 3–8 样，取 40 作为满量程 —— 大约是「5 样料都放到最辣」的量级。
const FULL_SCALE = 40

function to100(v) {
  return Math.round(Math.min(100, (v / FULL_SCALE) * 100))
}

/** 一句话概括用量构成，用于列表卡片：「芝麻酱2勺 · 香油1勺 · 蒜末半勺」 */
export function summarizeAmount(items, limit = 3) {
  return items
    .filter((it) => (it.amountLevel ?? 0) > 0)
    .sort((a, b) => b.amountLevel - a.amountLevel)
    .slice(0, limit)
    .map((it) => `${it.shortName || it.condimentName || it.condiment_name}${it.amountLabel ?? it.amount_label}`)
    .join(' · ')
}

export default { computeHotScore, computeTasteProfile, summarizeAmount }
