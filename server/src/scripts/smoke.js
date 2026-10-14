// 端到端冒烟测试。
//
// 跑通产品的主链路：注册 → 建店 → 发配方 → 照着配 → 打分 → 查重。
// 任何一步挂了都会打印出具体是哪一步、期望什么、实际拿到什么。
//
// 用法（服务需先启动）：
//   npm start          # 另一个终端
//   npm run smoke
import { getDb } from '../db/index.js'
import config from '../config.js'

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000/api'

let passed = 0
let failed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  ✗ ${label}${detail ? `  ← ${detail}` : ''}`)
  }
}

async function call(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    // 204 或空响应体
  }
  return { status: res.status, body: json }
}

// 每次跑用一个独立的用户名，避免跟上次的数据冲突
const stamp = Date.now().toString(36)
const userA = { username: `alice_${stamp}`, password: 'pw123456', nickname: '测试甲' }
const userB = { username: `bob_${stamp}`, password: 'pw123456', nickname: '测试乙' }

console.log(`\n冒烟测试 → ${BASE}\n`)

// ── 1. 健康检查 ──
console.log('[1] 健康检查')
{
  const r = await call('GET', '/health')
  check('服务在线且数据库可读', r.status === 200 && r.body?.data?.dbOk === true, JSON.stringify(r.body))
}

// ── 2. 调料库 ──
console.log('\n[2] 调料库')
let sampleCondiments = []
{
  const r = await call('GET', '/condiments')
  const groups = r.body?.data?.groups ?? []
  const total = r.body?.data?.total ?? 0
  check('返回分组数据', r.status === 200 && groups.length > 0, `groups=${groups.length}`)
  check('调料总数为 71', total === 71, `实际 ${total}`)
  check('按「幕」排序（底油在最前）', groups[0]?.stageName === '底油', `实际 ${groups[0]?.stageName}`)

  sampleCondiments = groups.flatMap((g) => g.items).slice(0, 3).map((i) => i.id)
  check('取到 3 个样例调料', sampleCondiments.length === 3, sampleCondiments.join(','))
}

// ── 3. 注册 ──
console.log('\n[3] 注册与鉴权')
let tokenA = null
let userAId = null
{
  const r = await call('POST', '/auth/register', { body: userA })
  check('注册成功', r.status === 200 && r.body?.data?.token, JSON.stringify(r.body).slice(0, 200))
  tokenA = r.body?.data?.token
  userAId = r.body?.data?.user?.id

  const dup = await call('POST', '/auth/register', { body: userA })
  check('重复用户名被拒（409）', dup.status === 409, `实际 ${dup.status}`)

  const weak = await call('POST', '/auth/register', {
    body: { username: `x_${stamp}`, password: '123' },
  })
  check('弱密码被拒（400）', weak.status === 400, `实际 ${weak.status}`)

  const bad = await call('POST', '/auth/login', {
    body: { username: userA.username, password: 'wrongpass' },
  })
  check('错误密码被拒（401）', bad.status === 401, `实际 ${bad.status}`)

  const me = await call('GET', '/auth/me', { token: tokenA })
  check('带 token 能取到本人', me.status === 200 && me.body?.data?.user?.id === userAId)

  const noAuth = await call('GET', '/auth/me')
  check('不带 token 被拒（401）', noAuth.status === 401, `实际 ${noAuth.status}`)

  // 关键：响应里绝不能出现密码哈希
  check('响应不含 password_hash', !JSON.stringify(me.body).includes('password_hash'))
}

// ── 4. 建店 ──
console.log('\n[4] 餐馆创建与去重')
let restaurantId = null
{
  // 店名带每轮唯一的后缀，这样脚本可以反复跑而不会跟上一轮的数据撞上
  // （没有后缀的话，第二轮的建店会被去重逻辑正确地自动匹配掉，
  //   导致「应该新建」的断言失败 —— 那是测试的问题，不是产品的问题）
  const SHOP = `鼎盛自助烤肉（万达广场店-${stamp}）`
  const SHOP_NO_PAREN = `鼎盛自助烤肉(万达广场店-${stamp})`
  const SHOP_SEARCH = `鼎盛自助烤肉万达广场店-${stamp}`   // 归一化后的形态

  const empty = await call('GET', `/restaurants?keyword=${encodeURIComponent(SHOP_SEARCH)}`)
  check('初始搜不到', empty.body?.data?.list?.length === 0,
    `实际 ${empty.body?.data?.list?.length}`)

  const payload = {
    name: SHOP,
    city: '杭州',
    address: `拱墅区万达广场 3F-${stamp}`,
    landmark: `万达广场 3F-${stamp}`,
    category: '自助餐',
  }

  // forceCreate：跳过相似度拦截。测试需要可重复运行，
  // 不加这个的话第二轮会被上一轮那家同名店拦下来（那是产品的正确行为）。
  const r = await call('POST', '/restaurants', { token: tokenA, body: { ...payload, forceCreate: true } })
  check('建店成功（201）', r.status === 201, JSON.stringify(r.body).slice(0, 200))
  restaurantId = r.body?.data?.restaurant?.id

  const search = await call('GET', `/restaurants?keyword=${encodeURIComponent(SHOP_SEARCH)}`)
  check('能搜到该店', search.body?.data?.list?.length >= 1, `实际 ${search.body?.data?.list?.length}`)

  // 归一化搜索：库里存的名字带全角括号，用户搜的时候通常不打括号。
  const fuzzy = await call('GET', `/restaurants?keyword=${encodeURIComponent(SHOP_SEARCH)}`)
  check('归一化搜索命中（忽略括号）', fuzzy.body?.data?.list?.length >= 1,
    `实际 ${fuzzy.body?.data?.list?.length}`)

  // 反向：搜索词带括号也要能命中（用户从别处复制粘贴过来）
  const fuzzy2 = await call('GET', `/restaurants?keyword=${encodeURIComponent(SHOP_NO_PAREN)}`)
  check('归一化搜索命中（搜索词带括号）', fuzzy2.body?.data?.list?.length >= 1,
    `实际 ${fuzzy2.body?.data?.list?.length}`)

  // 去重（不带 forceCreate）：完全相同的名字+地址，相似度 1.0，应自动匹配而非新建
  const again = await call('POST', '/restaurants', { token: tokenA, body: payload })
  const matched = again.body?.data?.matched === true && again.body?.data?.created === false
  check('同名同址被自动匹配而非新建', matched,
    `status=${again.status} ${JSON.stringify(again.body?.data)?.slice(0, 160)}`)
  check('未产生重复店铺', again.body?.data?.restaurant?.id === restaurantId,
    `期望 ${restaurantId}，实际 ${again.body?.data?.restaurant?.id}`)

  // ★ forceCreate 出口：相似但确实是另一家店时，用户必须能建出来。
  // 没有这个出口的话，用户会被永久卡住（这是真实产品缺陷，不是测试便利）
  //
  // 这里要构造的是「相似但不同」：店名一样、地址完全不同 ——
  // 相似度落在 [0.5, 0.86) 的中间地带，应该返回 409 让用户确认，
  // 而不是自动合并（那会把两家不同的店的数据混在一起）。
  //
  // 地址里刻意不掺时间戳：共享一长串相同字符会把地址相似度抬得很高，
  // 从而越过自动合并线 —— 那是测试数据的假象，不是要测的行为。
  const ambiguous = await call('POST', '/restaurants', {
    token: tokenA,
    body: { name: SHOP_NO_PAREN, city: '杭州', address: '西湖区文三路 100 号' },
  })
  check('相似但不同址返回 409 + 候选', ambiguous.status === 409 && ambiguous.body?.extra?.candidates?.length > 0,
    `status=${ambiguous.status} ${JSON.stringify(ambiguous.body).slice(0, 160)}`)

  const forced2 = await call('POST', '/restaurants', {
    token: tokenA,
    body: {
      name: `${SHOP_NO_PAREN}·二店`, city: '杭州',
      address: `拱墅区万达广场4F-${stamp}`, forceCreate: true,
    },
  })
  check('带 forceCreate 可强行新建相似店', forced2.status === 201,
    `status=${forced2.status} ${JSON.stringify(forced2.body).slice(0, 160)}`)

  // 幂等：同一个 clientToken 重复提交不应建出第二条
  const ct = `tok_${stamp}`
  const idemBody = {
    name: `幂等测试店-${stamp}`, city: '杭州',
    address: `测试路${stamp}号`, clientToken: ct, forceCreate: true,
  }
  const idem1 = await call('POST', '/restaurants', { token: tokenA, body: idemBody })
  const idem2 = await call('POST', '/restaurants', { token: tokenA, body: idemBody })
  check('相同 clientToken 幂等（不重复建店）',
    idem1.body?.data?.restaurant?.id === idem2.body?.data?.restaurant?.id,
    `${idem1.body?.data?.restaurant?.id} vs ${idem2.body?.data?.restaurant?.id}`)
}

// ── 5. 发布配方 ──
console.log('\n[5] 发布配方（结构化 + 幕序）')
let recipeId = null
{
  const bad = await call('POST', '/recipes', {
    token: tokenA,
    body: { restaurantId, title: '空配方', items: [] },
  })
  check('空配方被拒（400）', bad.status === 400, `实际 ${bad.status}`)

  const r = await call('POST', '/recipes', {
    token: tokenA,
    body: {
      restaurantId,
      title: '蒜香麻酱碟',
      description: '第一次来这家店就靠它',
      servingNote: '一小碗，够蘸 10 串',
      items: [
        { condimentId: 'paste_sesame', amountLevel: 4 },
        { condimentId: 'oil_sesame', amountLevel: 4 },
        { condimentId: 'aroma_garlic_minced', amountLevel: 3 },
        { condimentId: 'sauce_soy_light', amountLevel: 3 },
        { condimentId: 'paste_jiucaihua', amountLevel: 0, amountNote: '吃不惯，不放' },
      ],
      tasteTags: ['taste_sesame', 'taste_garlic'],
      foodTags: ['food_lamb', 'food_beef_roll'],
    },
  })
  check('发布成功（201）', r.status === 201, JSON.stringify(r.body).slice(0, 300))
  recipeId = r.body?.data?.recipe?.id

  const items = r.body?.data?.items ?? []
  check('明细共 5 行', items.length === 5, `实际 ${items.length}`)

  const steps = items.filter((i) => i.isStep)
  check('步骤 4 步（不含「不放」的那样）', steps.length === 4, `实际 ${steps.length}`)

  const skipped = items.filter((i) => !i.isStep)
  check('「不放」项被排除在步骤外', skipped.length === 1 && skipped[0].condimentId === 'paste_jiucaihua')

  // ★ 幕序：油(0) → 酱(1) → 汁(2) → 辛香(3)
  const order = steps.map((i) => i.stageOrder)
  const sorted = [...order].sort((a, b) => a - b)
  check('步骤按「幕」排序', JSON.stringify(order) === JSON.stringify(sorted), `实际 ${order.join(',')}`)
  check('第一步是油（底油幕）', steps[0]?.stageOrder === 0, `实际 stage=${steps[0]?.stageOrder}`)

  // 用量文案在写入时固化
  const sesame = items.find((i) => i.condimentId === 'paste_sesame')
  check('用量标签已固化', sesame?.amountLabel === '2勺', `实际 ${sesame?.amountLabel}`)
  check('物理锚点由档位+单位组合', sesame?.anchorText === '2 平勺', `实际 ${sesame?.anchorText}`)

  // 标签
  const tags = r.body?.data?.tags
  check('口味标签 2 个', tags?.taste?.length === 2, `实际 ${tags?.taste?.length}`)
  check('食材标签 2 个', tags?.food?.length === 2, `实际 ${tags?.food?.length}`)

  check('作者标记正确', r.body?.data?.isAuthor === true)
}

// ── 6. 照着配 ──
console.log('\n[6] ★ 照着配预编排')
{
  const r = await call('GET', `/recipes/${recipeId}/cook`)
  const d = r.body?.data
  check('返回会话包', r.status === 200 && d, JSON.stringify(r.body).slice(0, 200))
  check('总步数为 4', d?.totalSteps === 4, `实际 ${d?.totalSteps}`)
  check('分了 4 幕', d?.stages?.length === 4, `实际 ${d?.stages?.length}`)
  check('第一步是底油', d?.stages?.[0]?.name === '底油', `实际 ${d?.stages?.[0]?.name}`)
  check('每步都有单汉字 glyph', d?.stages?.every((s) => s.steps.every((x) => x.glyph)))
  check('每步都有类目色', d?.stages?.every((s) => s.steps.every((x) => /^#[0-9A-F]{6}$/i.test(x.color))))
  check('每步都有物理锚点文案', d?.stages?.every((s) => s.steps.every((x) => x.anchorText)))
  check('skipList 含「不放」的韭菜花', d?.skipList?.length === 1 && d.skipList[0].condimentId === 'paste_jiucaihua')
  check('有可替代品建议', d?.stages?.[0]?.steps?.[0]?.substitute?.condimentId != null)
  check('有会话版本号（供前端缓存判断）', typeof d?.cookSessionVersion === 'string' && d.cookSessionVersion.length > 0)
  check('预计耗时已估算', d?.estimatedSeconds > 0, `实际 ${d?.estimatedSeconds}`)
  check('摘要行已生成', typeof d?.summaryLine === 'string' && d.summaryLine.length > 0, d?.summaryLine)
}

// ── 7. 换用户：浏览 + 打分 ──
console.log('\n[7] 另一个用户浏览与打分')
let tokenB = null
{
  const reg = await call('POST', '/auth/register', { body: userB })
  tokenB = reg.body?.data?.token
  check('注册第二个用户', Boolean(tokenB))

  const list = await call('GET', `/restaurants/${restaurantId}/recipes`)
  check('该店有 1 个配方', list.body?.data?.list?.length === 1, `实际 ${list.body?.data?.list?.length}`)
  check('卡片带用量摘要', Boolean(list.body?.data?.list?.[0]?.amountSummary),
    list.body?.data?.list?.[0]?.amountSummary)

  const noAuth = await call('GET', `/recipes/${recipeId}`)
  check('未登录也能看配方详情', noAuth.status === 200)

  const mine = await call('GET', `/recipes/${recipeId}`, { token: tokenB })
  check('未打分时 myRating 为 null', mine.body?.data?.myRating === null)

  const badScore = await call('PUT', `/recipes/${recipeId}/rating`, {
    token: tokenB, body: { score: 9 },
  })
  check('非法评分被拒（400）', badScore.status === 400, `实际 ${badScore.status}`)

  const rate = await call('PUT', `/recipes/${recipeId}/rating`, {
    token: tokenB, body: { score: 5, content: '照着配了，确实香', tasteOk: true },
  })
  check('打分成功', rate.status === 200 && rate.body?.data?.recipe?.ratingCount === 1,
    JSON.stringify(rate.body?.data?.recipe))

  // 改分：应该更新而不是新增
  const rerate = await call('PUT', `/recipes/${recipeId}/rating`, {
    token: tokenB, body: { score: 3, content: '再想想，有点咸' },
  })
  check('重复打分是改分而非新增', rerate.body?.data?.recipe?.ratingCount === 1,
    `ratingCount=${rerate.body?.data?.recipe?.ratingCount}`)
  check('平均分随之更新为 3', rerate.body?.data?.recipe?.ratingAvg === 3,
    `实际 ${rerate.body?.data?.recipe?.ratingAvg}`)

  const ratings = await call('GET', `/recipes/${recipeId}/ratings`)
  check('评价列表 1 条', ratings.body?.data?.list?.length === 1)
  check('评价含用户昵称', ratings.body?.data?.list?.[0]?.user?.nickname === '测试乙',
    ratings.body?.data?.list?.[0]?.user?.nickname)

  const fav = await call('POST', `/recipes/${recipeId}/favorite`, { token: tokenB })
  check('收藏成功', fav.body?.data?.favorited === true && fav.body?.data?.favoriteCount === 1,
    JSON.stringify(fav.body?.data))

  const favAgain = await call('POST', `/recipes/${recipeId}/favorite`, { token: tokenB })
  check('重复收藏幂等（不重复计数）', favAgain.body?.data?.favoriteCount === 1,
    `实际 ${favAgain.body?.data?.favoriteCount}`)

  const log = await call('POST', `/recipes/${recipeId}/cook-log`, {
    token: tokenB,
    body: { finished: true, stepReached: 4, skipped: [], substituted: [] },
  })
  check('打卡成功且 cook_count 累加', log.body?.data?.cookCount === 1, JSON.stringify(log.body?.data))

  // 卡片上的 hotScore 必须真的是热度分，不能是辣度画像。
  // 表里这两列叫 hot_score / heat_score，只差一个字母，曾经取错过：
  // 列表按热度排、卡片却显示辣度，用户看到的顺序就毫无道理。
  // 直接按公式复算，取错列会立刻对不上。
  const card = (await call('GET', `/restaurants/${restaurantId}/recipes`)).body?.data?.list?.[0]
  const expectedHot =
    card.ratingAvg * 20 + Math.log(card.cookCount + 1) * 12 + Math.log(card.favoriteCount + 1) * 6
  check('hotScore 与评分/打卡/收藏复算一致（不是辣度）',
    Math.abs(card.hotScore - expectedHot) < 1,
    `hotScore=${card.hotScore} 期望≈${expectedHot.toFixed(2)}（评分 ${card.ratingAvg} 打卡 ${card.cookCount} 收藏 ${card.favoriteCount}）`)
  check('另带 0–100 的辣度画像 spicyScore',
    typeof card.spicyScore === 'number' && card.spicyScore >= 0 && card.spicyScore <= 100,
    `spicyScore=${card.spicyScore}`)
}

// ── 8. 权限 ──
console.log('\n[8] 权限边界')
{
  const del = await call('DELETE', `/recipes/${recipeId}`, { token: tokenB })
  check('非作者不能删配方（403）', del.status === 403, `实际 ${del.status}`)

  const noAuth = await call('POST', '/restaurants', {
    body: { name: '未登录建的店' },
  })
  check('未登录不能建店（401）', noAuth.status === 401, `实际 ${noAuth.status}`)
}

// ── 9. 个人中心 ──
console.log('\n[9] 个人中心')
{
  const mine = await call('GET', '/users/me/recipes', { token: tokenA })
  check('我的配方有 1 条', mine.body?.data?.list?.length === 1, `实际 ${mine.body?.data?.list?.length}`)

  const favs = await call('GET', '/users/me/favorites', { token: tokenB })
  check('我的收藏有 1 条', favs.body?.data?.list?.length === 1, `实际 ${favs.body?.data?.list?.length}`)

  const ratings = await call('GET', '/users/me/ratings', { token: tokenB })
  check('我的评价有 1 条', ratings.body?.data?.list?.length === 1, `实际 ${ratings.body?.data?.list?.length}`)

  const me = await call('GET', '/auth/me', { token: tokenA })
  check('/users/me 系列未被 /:id 路由吃掉', me.status === 200, `实际 ${me.status}`)

  const profile = await call('GET', `/users/${userAId}`)
  check('他人主页可访问且不含 username',
    profile.status === 200 && !JSON.stringify(profile.body).includes(userA.username),
    JSON.stringify(profile.body).slice(0, 160))
}

// ── 10. 用量锚点文案（纯函数护栏，不走 HTTP）──
//
// 「平」是勺独有的说法（平勺＝不堆尖），拼到滴/撮/块上不成词。
// 而且 5 档的末尾是「以上」，早年用 /勺$/ 替换时根本进不去 ——
// 滴/撮/块在 5 档上一律错成「3 平勺以上」。穷举一遍最省事。
console.log('\n[10] 用量锚点文案')
{
  const { amountAnchor, amountBar, amountLabel } = await import('../constants.js')
  const cases = [
    ['勺', 3, '1 平勺'], ['勺', 5, '3 平勺以上'],
    ['块', 3, '1 块'], ['块', 5, '3 块以上'],
    ['滴', 3, '1 滴'], ['滴', 5, '3 滴以上'],
    ['撮', 2, '半撮'], ['撮', 4, '2 撮'],
  ]
  for (const [unit, level, want] of cases) {
    const got = amountAnchor(level, unit)
    check(`${unit} 档位 ${level} → 「${want}」`, got === want, `实际「${got}」`)
  }

  // 档位表本身的自洽性：0–5 齐全，且 1 档是最小可见量
  check('档位 0–5 齐全且量条单调递增',
    [0, 1, 2, 3, 4, 5].every((lv) => amountLabel(lv) !== '')
    && [0, 1, 2, 3, 4, 5].map(amountBar).every((b, i, a) => i === 0 || b >= a[i - 1]),
    `量条 ${[0, 1, 2, 3, 4, 5].map(amountBar).join(',')}`)
}

// ── 清理本次跑出来的测试数据 ──
//
// smoke 是直接对着开发库跑的，不清理的话每跑一次就多出三四家
// 「鼎盛自助烤肉-xxx」，首页会被测试垃圾淹没，演示数据也没法看。
// stamp 是本次运行独有的，拿它匹配既精准又不会误伤真实数据。
//
// 生产环境直接跳过 —— 这里的删除是不可逆的，宁可不清理。
function cleanup() {
  if (config.isProd) {
    console.log('\n[清理] NODE_ENV=production，跳过清理')
    return
  }

  const db = getDb()
  const like = `%${stamp}%`
  const userIds = db.prepare('SELECT id FROM users WHERE username LIKE ?').all(like).map((r) => r.id)
  const shopIds = db.prepare('SELECT id FROM restaurants WHERE name LIKE ?').all(like).map((r) => r.id)

  if (!userIds.length && !shopIds.length) return

  const ph = (arr) => arr.map(() => '?').join(',')
  const removed = {}

  const recipeIds = db
    .prepare(
      `SELECT id FROM recipes
       WHERE ${userIds.length ? `user_id IN (${ph(userIds)})` : '0'}
          OR ${shopIds.length ? `restaurant_id IN (${ph(shopIds)})` : '0'}`,
    )
    .all(...userIds, ...shopIds)
    .map((r) => r.id)

  const del = (label, sql, args) => {
    const n = db.prepare(sql).run(...args).changes
    if (n) removed[label] = n
  }

  // 外键开着，必须先删引用方再删被引用方
  if (recipeIds.length) {
    const rp = ph(recipeIds)
    del('cook_logs', `DELETE FROM cook_logs WHERE recipe_id IN (${rp})`, recipeIds)
    del('favorites', `DELETE FROM favorites WHERE recipe_id IN (${rp})`, recipeIds)
    del('ratings', `DELETE FROM ratings WHERE recipe_id IN (${rp})`, recipeIds)
    del('recipe_tags', `DELETE FROM recipe_tags WHERE recipe_id IN (${rp})`, recipeIds)
    del('recipe_items', `DELETE FROM recipe_items WHERE recipe_id IN (${rp})`, recipeIds)
    del('recipes', `DELETE FROM recipes WHERE id IN (${rp})`, recipeIds)
  }

  if (shopIds.length) {
    del('restaurants', `DELETE FROM restaurants WHERE id IN (${ph(shopIds)})`, shopIds)
  }

  if (userIds.length) {
    const up = ph(userIds)
    del('sessions', `DELETE FROM sessions WHERE user_id IN (${up})`, userIds)
    del('users', `DELETE FROM users WHERE id IN (${up})`, userIds)
  }

  const parts = Object.entries(removed).map(([k, v]) => `${k}-${v}`)
  console.log(`\n[清理] 已移除本次测试数据：${parts.length ? parts.join(' ') : '（无残留）'}`)
}

cleanup()

// ── 结果 ──
console.log(`\n${'─'.repeat(46)}`)
if (failed === 0) {
  console.log(`全部通过：${passed} 项 ✓`)
} else {
  console.log(`通过 ${passed} 项，失败 ${failed} 项 ✗`)
  console.log('\n失败项：')
  for (const f of failures) console.log(`  · ${f}`)
}
console.log('')
process.exit(failed === 0 ? 0 : 1)
