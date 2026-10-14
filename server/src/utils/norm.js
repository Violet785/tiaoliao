// 中文文本归一化与相似度 —— 用于餐馆查重。
//
// 餐馆是用户自建的，同一个店很容易被不同人用不同写法重复创建：
//   「海底捞火锅（万达广场店）」「海底捞火锅 万达店」「海底捞(万达广场店)」
// 靠字符串完全相等根本拦不住，所以做两层：
//   1. 归一化 + 数据库唯一索引（拦完全一致的）
//   2. bigram Dice 相似度（拦写法不同的，见 similarRestaurant）

/**
 * 归一化：NFKC（把全角字符折叠成半角）→ 去所有空白 → 去常见分隔标点 → 小写。
 *
 * 「海底捞火锅（万达广场店）」→「海底捞火锅万达广场店」
 */
export function normalizeText(input) {
  if (!input) return ''
  return String(input)
    .normalize('NFKC')                 // （）→ () 、１２３ → 123、全角空格 → 半角
    .replace(/\s+/g, '')               // 空格、制表、换行
    .replace(/[()（）[\]【】·・.,，。、\-—–_~～"'“”‘’*&+]/g, '')
    .toLowerCase()
}

/**
 * 取中文字符二元组（bigram）。
 * 中文没有天然空格分词，bigram 是最省事又足够准的近似方案。
 * 单字回退成单元素，避免长度为 1 的输入算出 0 相似度。
 */
function bigrams(s) {
  if (!s) return []
  if (s.length === 1) return [s]
  const out = []
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2))
  return out
}

/**
 * Dice 系数：2|A∩B| / (|A|+|B|)，取值 0–1。
 * 对「万达广场店」vs「万达店」这类包含关系表现良好。
 */
export function diceSimilarity(a, b) {
  const A = bigrams(normalizeText(a))
  const B = bigrams(normalizeText(b))
  if (A.length === 0 || B.length === 0) return 0

  const counts = new Map()
  for (const g of A) counts.set(g, (counts.get(g) ?? 0) + 1)

  let intersection = 0
  for (const g of B) {
    const n = counts.get(g)
    if (n > 0) {
      intersection++
      counts.set(g, n - 1)  // 用掉一个，避免重复计数
    }
  }
  return (2 * intersection) / (A.length + B.length)
}

/**
 * 打分：店名权重高于地址（用户更可能把地址写错/写简略）。
 * 同区 +0.05、同 landmark +0.10 作为加分项，用来把「同一家店的不同分店」和
 * 「同一家店的不同写法」区分开。
 */
export function restaurantSimilarity(a, b) {
  const nameSim = diceSimilarity(a.name, b.name)
  const addrSim = diceSimilarity(a.address ?? '', b.address ?? '')

  let score = 0.65 * nameSim + 0.35 * addrSim

  if (a.city && b.city && normalizeText(a.city) === normalizeText(b.city)) score += 0.05
  if (a.landmark && b.landmark && normalizeText(a.landmark) === normalizeText(b.landmark)) {
    score += 0.1
  }

  return { score: Math.min(score, 1), nameSim, addrSim }
}

/**
 * 匹配判定阈值。
 *
 * AUTO 以上直接复用已有餐馆，不再新建（返回给前端提示「已为你匹配到 XX」）；
 * CANDIDATE 以上返回候选让用户确认；再低就当新店处理。
 *
 * 门槛设得偏高（0.86）是有意的：误把两家不同的店合并，用户会看到错误的调料配方，
 * 这比多一条重复数据严重得多。
 */
export const MATCH_AUTO = 0.86
export const MATCH_CANDIDATE = 0.5
