/**
 * 演示数据 —— 一批像样的餐馆、用户和配方，用来开发和演示。
 *
 *   npm run seed:demo          写入（可重复执行，已存在的跳过）
 *   npm run seed:demo -- --clean   清掉全部演示数据
 *
 * 设计上刻意不走 INSERT 直接写表，而是调用 service 层：
 * 步骤序号（step_index）的编排、用量文案（amount_label）的固化、
 * 热度分（hot_score）的计算都在 service 里，直接写 SQL 等于把那些规则抄一遍，
 * 迟早会跟产品代码跑偏。走 service 还能顺带把 service 自己测了。
 *
 * 幂等靠三样东西：用户的 username、餐馆的 client_token、配方的
 * (作者, 餐馆, 标题) 三元组。所以反复跑不会产生重复数据。
 */
import { pathToFileURL } from 'node:url'
import { getDb } from '../db/index.js'
import { hashPassword } from '../utils/password.js'
import * as restaurantService from '../services/restaurantService.js'
import * as recipeService from '../services/recipeService.js'
import * as ratingService from '../services/ratingService.js'

/** 演示账号统一用这个密码，方便你登进去看「我的」页面 */
const DEMO_PASSWORD = 'demo123456'

const USERS = [
  { username: 'majiang_lover', nickname: '麻酱狂魔' },
  { username: 'suanni_king', nickname: '蒜泥白肉' },
  { username: 'laotao_aqiang', nickname: '老饕阿强' },
  { username: 'jianzhi_lin', nickname: '减脂的小林' },
  { username: 'guodi_researcher', nickname: '锅底研究员' },
]

const SHOPS = [
  {
    key: 'hanbaweide',
    name: '汉巴味德自助烤肉（西湖银泰店）',
    city: '杭州',
    address: '上城区延安路 98 号西湖银泰 5 层',
    landmark: '西湖银泰 5 楼，苹果店楼上',
    category: '自助餐',
    note: '调料台在烤肉区右侧，麻酱是没调过的纯芝麻酱，需要自己澥开',
  },
  {
    key: 'xinglunduo',
    name: '星伦多海鲜自助（钱江新城店）',
    city: '杭州',
    address: '上城区富春路 701 号来福士 4 层',
    landmark: '来福士 4 楼，靠近江景那一侧',
    category: '自助餐',
    note: '海鲜为主，调料台偏清爽，没有麻酱 —— 别按北方那套配',
  },
  {
    key: 'benjia',
    name: '本家韩式烤肉自助（滨江天街店）',
    city: '杭州',
    address: '滨江区江南大道 228 号龙湖天街 3 层',
    landmark: '天街 3 楼，电梯口右手边',
    category: '烤肉',
    note: '有韩式蘸酱和干料两区，生菜和小菜自取',
  },
  {
    key: 'nihenxian',
    name: '牛很鲜自助火锅（西溪天街店）',
    city: '杭州',
    address: '西湖区余杭塘路 1001 号龙湖西溪天街 4 层',
    landmark: '西溪天街 4 楼',
    category: '火锅',
    note: '锅底可以选鸳鸯，调料台有现炸的酥黄豆和花生碎，记得最后加',
  },
]

/*
 * 配方的写法说明：
 *   a: [调料 id, 用量档位 0–5, 备注?]
 * 档位含义见 src/constants.js —— 0 不放 / 1 一点点 / 2 半勺 / 3 一勺 / 4 两勺 / 5 三勺以上
 * 顺序不用管，service 会按「幕」重新编排。
 */
const RECIPES = [
  {
    shop: 'hanbaweide',
    by: 'majiang_lover',
    title: '万能麻酱碟',
    description: '北方涮羊肉的底子。纯芝麻酱得先用香油澥开，不然会结成疙瘩挂在碗边上。',
    servingNote: '涮羊肉、肥牛卷、宽粉',
    taste: ['taste_sesame', 'taste_xianxian'],
    food: ['food_lamb', 'food_beef_roll', 'food_noodle'],
    a: [
      ['oil_sesame', 4, '先用它把麻酱澥开，别一次倒完'],
      ['paste_sesame', 5, '这家的麻酱是纯的，要自己调'],
      ['paste_jiucaihua', 3],
      ['paste_fermented_tofu', 1, '连汁一起，搅散'],
      ['sauce_soy_light', 2],
      ['aroma_garlic_paste', 4],
      ['aroma_cilantro', 2],
    ],
  },
  {
    shop: 'hanbaweide',
    by: 'suanni_king',
    title: '解腻蒜香碟',
    description: '烤肉吃到后半程会觉得腻，换这碗。不放麻酱，靠蒜和醋顶。',
    servingNote: '烤五花、烤牛舌，也适合配生菜包肉',
    taste: ['taste_garlic', 'taste_refresh'],
    food: ['food_grill_pork'],
    scene: ['scene_indulge'],
    a: [
      ['aroma_garlic_paste', 5],
      ['sauce_soy_light', 4],
      ['sauce_vinegar_black', 3],
      ['oil_sesame', 2],
      ['aroma_chili_fresh', 1, '怕辣就省掉'],
      ['powder_sugar', 1, '一点点，提鲜不提甜'],
    ],
  },
  {
    shop: 'hanbaweide',
    by: 'laotao_aqiang',
    title: '干碟（辣面 + 孜然）',
    description: '不加水不加油，纯干料。蘸烤肉比湿料香，但一次别蘸太多，会咸。',
    servingNote: '烤五花、烤肉串',
    taste: ['taste_mala', 'taste_xiangla'],
    food: ['food_grill_pork', 'food_fried'],
    scene: ['scene_drink'],
    a: [
      ['powder_chili_flake', 5],
      ['powder_cumin', 4, '孜然是灵魂，别省'],
      ['powder_sesame_seed', 2],
      ['powder_pepper_sichuan', 2],
      ['crunch_pea_crisp', 2, '脆豌豆碎，口感靠它'],
      ['powder_salt', 1],
      ['powder_msg', 1],
    ],
  },
  {
    shop: 'hanbaweide',
    by: 'jianzhi_lin',
    title: '不放油的清爽碟',
    description: '一勺油都不放，靠醋和香菜提味。涮蔬菜和菌菇够用了，热量主要来自食材本身。',
    servingNote: '蔬菜、菌菇、豆腐',
    taste: ['taste_refresh', 'taste_light'],
    food: ['food_veg', 'food_mushroom', 'food_tofu'],
    scene: ['scene_diet'],
    a: [
      ['sauce_soy_light', 3],
      ['sauce_vinegar_rice', 4],
      ['aroma_garlic_minced', 3],
      ['aroma_cilantro', 3],
      ['aroma_chili_fresh', 2],
      ['powder_pepper_black', 1],
      ['oil_sesame', 0, '明确不放 —— 这是这碗的关键'],
    ],
  },
  {
    shop: 'hanbaweide',
    by: 'jianzhi_lin',
    title: '小孩也能吃的不辣碟',
    description: '没有辣椒没有蒜，微甜。带小孩来的时候直接用这个，不用单独再调。',
    servingNote: '什么都能蘸',
    taste: ['taste_sesame', 'taste_sweet'],
    scene: ['scene_kid'],
    a: [
      ['paste_sesame_mixed', 4, '这家有调好的麻酱汁，直接用，省事'],
      ['sauce_soy_light', 2],
      ['powder_sugar', 1],
      ['extra_broth', 2, '加两勺清汤稀释，不然太稠'],
    ],
  },
  {
    shop: 'xinglunduo',
    by: 'guodi_researcher',
    title: '海鲜提鲜碟',
    description: '这家的海鲜够新鲜，调料的作用是提鲜不是盖味。千万别放麻酱，一放整碗就毁了。',
    servingNote: '白灼虾、贝类、三文鱼以外的生鲜',
    taste: ['taste_seafood', 'taste_light'],
    food: ['food_shellfish', 'food_boiled_shrimp', 'food_fish'],
    a: [
      ['sauce_soy_light', 4],
      ['sauce_soy_steamed', 2, '豉油比生抽更配海鲜'],
      ['sauce_lemon', 3, '青柠挤几滴，别用醋代替'],
      ['aroma_ginger_shred', 3],
      ['aroma_scallion', 4],
      ['aroma_chili_fresh', 2],
      ['oil_sesame', 1],
    ],
  },
  {
    shop: 'nihenxian',
    by: 'laotao_aqiang',
    title: '沙茶锅底碟',
    description: '沙茶酱单吃太稠也太咸，必须舀两勺锅底汤化开。潮汕吃法。',
    servingNote: '毛肚、黄喉、牛肉',
    taste: ['taste_shacha', 'taste_xianxian'],
    food: ['food_tripe', 'food_beef_roll'],
    a: [
      ['paste_shacha', 5],
      ['extra_broth', 3, '一定要用锅里的汤，清水不行'],
      ['sauce_soy_light', 2],
      ['sauce_oyster', 2],
      ['aroma_garlic_minced', 4],
      ['aroma_cilantro', 2],
      ['crunch_peanut', 2, '最后撒，早放会泡软'],
    ],
  },
  {
    shop: 'nihenxian',
    by: 'majiang_lover',
    title: '麻辣重口碟',
    description: '涮毛肚鸭血黄喉这种重口食材用的。这碗偏咸，蘸的时候在碗边刮一下再吃。',
    servingNote: '毛肚、黄喉、鸭血',
    taste: ['taste_mala', 'taste_heavy'],
    food: ['food_tripe', 'food_duckblood'],
    a: [
      ['oil_chili_crisp', 5, '这家的油泼辣子有花生碎，很香'],
      ['paste_douban', 2],
      ['sauce_soy_light', 3],
      ['aroma_garlic_minced', 4],
      ['aroma_chili_fresh', 4],
      ['powder_pepper_sichuan', 2],
      ['crunch_peanut', 2],
      ['crunch_soybean', 2, '现炸的酥黄豆，最后加'],
    ],
  },
  {
    shop: 'benjia',
    by: 'suanni_king',
    title: '韩式烤肉蘸酱',
    description: '甜咸口，配生菜包肉。这家的黄豆酱偏咸，所以量要收着点。',
    servingNote: '烤五花、生菜包肉',
    taste: ['taste_sweet', 'taste_garlic'],
    food: ['food_grill_pork'],
    a: [
      ['paste_soybean', 3],
      ['paste_thaichili', 2, '泰式甜辣酱，比韩式辣酱更好买'],
      ['oil_sesame', 2],
      ['aroma_garlic_minced', 2],
      ['aroma_scallion', 3],
      ['powder_sesame_seed', 1],
      ['sauce_vinegar_rice', 1],
    ],
  },
]

/** 评价内容 —— 和评分一起构成「别人试过」的可信度 */
const RATINGS = [
  { by: 'laotao_aqiang', on: ['majiang_lover', '万能麻酱碟'], score: 5, content: '澥麻酱那步写得好，我按这个配了三碗', tasteOk: true },
  { by: 'suanni_king', on: ['majiang_lover', '万能麻酱碟'], score: 4, content: '偏咸了一点，腐乳可以再少放' },
  { by: 'jianzhi_lin', on: ['majiang_lover', '万能麻酱碟'], score: 4, content: '好吃是好吃，热量真的高', tasteOk: true },
  { by: 'majiang_lover', on: ['suanni_king', '解腻蒜香碟'], score: 5, content: '蒜泥要多，少了没劲', tasteOk: true },
  { by: 'laotao_aqiang', on: ['suanni_king', '解腻蒜香碟'], score: 5, content: '配烤五花绝了，解腻是真的', tasteOk: true },
  { by: 'jianzhi_lin', on: ['laotao_aqiang', '干碟（辣面 + 孜然）'], score: 4, content: '香，但一次别蘸太多，很咸' },
  { by: 'guodi_researcher', on: ['laotao_aqiang', '干碟（辣面 + 孜然）'], score: 5, content: '孜然那个量给得对', tasteOk: true },
  { by: 'majiang_lover', on: ['guodi_researcher', '海鲜提鲜碟'], score: 5, content: '本来想放麻酱的，忍住了，幸好', tasteOk: true },
  { by: 'laotao_aqiang', on: ['guodi_researcher', '海鲜提鲜碟'], score: 5, content: '青柠是点睛之笔', tasteOk: true },
  { by: 'jianzhi_lin', on: ['guodi_researcher', '海鲜提鲜碟'], score: 4, content: '清爽，配虾很好' },
  { by: 'majiang_lover', on: ['laotao_aqiang', '沙茶锅底碟'], score: 5, content: '用锅底汤化开这句太关键了，之前一直觉得沙茶难吃', tasteOk: true },
  { by: 'suanni_king', on: ['laotao_aqiang', '沙茶锅底碟'], score: 5, content: '潮汕朋友认证过，是这么吃的', tasteOk: true },
  { by: 'guodi_researcher', on: ['majiang_lover', '麻辣重口碟'], score: 4, content: '够味，但确实咸，刮一下再蘸' },
  { by: 'laotao_aqiang', on: ['majiang_lover', '麻辣重口碟'], score: 5, content: '酥黄豆最后加这点很懂' },
  { by: 'jianzhi_lin', on: ['suanni_king', '韩式烤肉蘸酱'], score: 4, content: '甜口的，小孩也爱吃' },
  { by: 'majiang_lover', on: ['jianzhi_lin', '不放油的清爽碟'], score: 4, content: '减脂期靠它活下来的' },
  { by: 'laotao_aqiang', on: ['jianzhi_lin', '不放油的清爽碟'], score: 3, content: '对我来说太淡了，但做法是对的' },
  { by: 'suanni_king', on: ['jianzhi_lin', '小孩也能吃的不辣碟'], score: 5, content: '带娃出门就靠这个，省事' },
]

/** 收藏与打卡：让热度分排序有真实差异，不然首页顺序是随机的 */
const FAVORITES = [
  ['jianzhi_lin', ['majiang_lover', '万能麻酱碟']],
  ['suanni_king', ['majiang_lover', '万能麻酱碟']],
  ['laotao_aqiang', ['majiang_lover', '万能麻酱碟']],
  ['majiang_lover', ['suanni_king', '解腻蒜香碟']],
  ['guodi_researcher', ['suanni_king', '解腻蒜香碟']],
  ['jianzhi_lin', ['guodi_researcher', '海鲜提鲜碟']],
  ['majiang_lover', ['guodi_researcher', '海鲜提鲜碟']],
  ['laotao_aqiang', ['guodi_researcher', '海鲜提鲜碟']],
  ['suanni_king', ['laotao_aqiang', '沙茶锅底碟']],
  ['majiang_lover', ['laotao_aqiang', '沙茶锅底碟']],
  ['jianzhi_lin', ['laotao_aqiang', '沙茶锅底碟']],
  ['suanni_king', ['jianzhi_lin', '不放油的清爽碟']],
  ['guodi_researcher', ['majiang_lover', '麻辣重口碟']],
]

/** [谁做的, [作者, 标题], 完成次数] */
const COOKS = [
  ['laotao_aqiang', ['majiang_lover', '万能麻酱碟'], 6],
  ['suanni_king', ['majiang_lover', '万能麻酱碟'], 3],
  ['jianzhi_lin', ['majiang_lover', '万能麻酱碟'], 2],
  ['majiang_lover', ['majiang_lover', '万能麻酱碟'], 8],
  ['majiang_lover', ['suanni_king', '解腻蒜香碟'], 4],
  ['laotao_aqiang', ['suanni_king', '解腻蒜香碟'], 3],
  ['guodi_researcher', ['suanni_king', '解腻蒜香碟'], 1],
  ['majiang_lover', ['guodi_researcher', '海鲜提鲜碟'], 3],
  ['laotao_aqiang', ['guodi_researcher', '海鲜提鲜碟'], 5],
  ['jianzhi_lin', ['guodi_researcher', '海鲜提鲜碟'], 2],
  ['majiang_lover', ['laotao_aqiang', '沙茶锅底碟'], 4],
  ['suanni_king', ['laotao_aqiang', '沙茶锅底碟'], 2],
  ['laotao_aqiang', ['laotao_aqiang', '干碟（辣面 + 孜然）'], 5],
  ['jianzhi_lin', ['jianzhi_lin', '不放油的清爽碟'], 9],
  ['majiang_lover', ['jianzhi_lin', '不放油的清爽碟'], 1],
  ['guodi_researcher', ['majiang_lover', '麻辣重口碟'], 2],
  ['suanni_king', ['jianzhi_lin', '小孩也能吃的不辣碟'], 2],
]

/* ─────────────────────── 执行 ─────────────────────── */

function ensureUser({ username, nickname }) {
  const db = getDb()
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
  if (existing) return existing.id

  // 不走 authService.register：那个会顺手建一条 session，演示数据不需要
  const info = db
    .prepare('INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)')
    .run(username, hashPassword(DEMO_PASSWORD), nickname)
  return Number(info.lastInsertRowid)
}

function ensureRestaurant(shop, userId) {
  const result = restaurantService.create(
    {
      name: shop.name,
      city: shop.city,
      address: shop.address,
      landmark: shop.landmark,
      category: shop.category,
      note: shop.note,
      // client_token 让「重复执行」变成「返回已存在的那家」，而不是建第二家
      clientToken: `demo:${shop.key}`,
      // 演示数据不该被相似度拦截 —— 那套逻辑是给真实用户防重复用的
      forceCreate: true,
    },
    userId,
  )
  return result.restaurant.id
}

function findRecipe(userId, restaurantId, title) {
  return getDb()
    .prepare(
      `SELECT id FROM recipes
       WHERE user_id = ? AND restaurant_id = ? AND title = ? AND status = 'published'`,
    )
    .get(userId, restaurantId, title)
}

export function runDemoSeed() {
  const stats = { users: 0, shops: 0, recipes: 0, ratings: 0, favorites: 0, cooks: 0 }

  // 用户：先建全部，后面餐馆和配方都要引用
  const userIds = new Map()
  for (const u of USERS) {
    const before = getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE username = ?').get(u.username).n
    userIds.set(u.username, ensureUser(u))
    if (before === 0) stats.users++
  }

  // 用第一个用户作为餐馆的创建者
  const ownerId = userIds.get(USERS[0].username)

  const shopIds = new Map()
  const recipeIds = new Map()
  for (const shop of SHOPS) {
    const before = getDb().prepare('SELECT id FROM restaurants WHERE client_token = ?').get(`demo:${shop.key}`)
    shopIds.set(shop.key, ensureRestaurant(shop, ownerId))
    if (!before) stats.shops++
  }

  for (const r of RECIPES) {
    const userId = userIds.get(r.by)
    const restaurantId = shopIds.get(r.shop)
    if (findRecipe(userId, restaurantId, r.title)) {
      recipeIds.set(`${r.by}|${r.title}`, findRecipe(userId, restaurantId, r.title).id)
      continue
    }

    const id = recipeService.create(
      {
        restaurantId,
        title: r.title,
        description: r.description,
        servingNote: r.servingNote || '',
        items: r.a.map(([condimentId, amountLevel, amountNote]) => ({
          condimentId, amountLevel, amountNote: amountNote || '',
        })),
        tasteTags: r.taste || [],
        foodTags: r.food || [],
        sceneTags: r.scene || [],
      },
      userId,
    )
    recipeIds.set(`${r.by}|${r.title}`, id)
    stats.recipes++
  }

  const lookup = ([author, title]) => recipeIds.get(`${author}|${title}`)

  for (const r of RATINGS) {
    const recipeId = lookup(r.on)
    if (!recipeId) continue
    const userId = userIds.get(r.by)
    // upsert 本身幂等（一人一条），重复跑只是覆盖成同样的值
    const had = getDb()
      .prepare('SELECT 1 FROM ratings WHERE recipe_id = ? AND user_id = ?')
      .get(recipeId, userId)
    ratingService.upsert(recipeId, userId, {
      score: r.score,
      content: r.content || '',
      tasteOk: r.tasteOk ?? null,
    })
    if (!had) stats.ratings++
  }

  for (const [username, target] of FAVORITES) {
    const recipeId = lookup(target)
    if (!recipeId) continue
    const userId = userIds.get(username)
    const had = getDb()
      .prepare('SELECT 1 FROM favorites WHERE user_id = ? AND recipe_id = ?')
      .get(userId, recipeId)
    ratingService.addFavorite(recipeId, userId)
    if (!had) stats.favorites++
  }

  for (const [username, target, times] of COOKS) {
    const recipeId = lookup(target)
    if (!recipeId) continue
    const userId = userIds.get(username)

    // 打卡记录没有唯一约束（同一个人本来就可以重复打卡），
    // 所以靠「已有条数是否够」来判断要不要补
    const had = getDb()
      .prepare('SELECT COUNT(*) AS n FROM cook_logs WHERE recipe_id = ? AND user_id = ?')
      .get(recipeId, userId).n
    for (let i = had; i < times; i++) {
      recipeService.logCook(recipeId, userId, { finished: true, stepReached: 0 })
      stats.cooks++
    }
  }

  return stats
}

/** 清掉全部演示数据。餐馆靠 client_token 认，用户靠 username 认。 */
export function cleanDemo() {
  const db = getDb()
  const usernames = USERS.map((u) => `'${u.username}'`)
  const tokens = SHOPS.map((s) => `'demo:${s.key}'`).join(',')

  const scope = `SELECT id FROM users WHERE username IN (${usernames.join(',')})`
  const shops = `SELECT id FROM restaurants WHERE client_token IN (${tokens})`
  const recipes = `SELECT id FROM recipes WHERE user_id IN (${scope}) OR restaurant_id IN (${shops})`

  const removed = {}
  const del = (label, sql) => {
    removed[label] = db.prepare(sql).run().changes
  }

  // 顺序不能反：外键开着，先删引用方
  del('cook_logs', `DELETE FROM cook_logs WHERE recipe_id IN (${recipes}) OR user_id IN (${scope})`)
  del('favorites', `DELETE FROM favorites WHERE recipe_id IN (${recipes}) OR user_id IN (${scope})`)
  del('ratings', `DELETE FROM ratings WHERE recipe_id IN (${recipes}) OR user_id IN (${scope})`)
  del('recipe_tags', `DELETE FROM recipe_tags WHERE recipe_id IN (${recipes})`)
  del('recipe_items', `DELETE FROM recipe_items WHERE recipe_id IN (${recipes})`)
  del('recipes', `DELETE FROM recipes WHERE id IN (${recipes})`)
  del('restaurants', `DELETE FROM restaurants WHERE id IN (${shops})`)
  del('sessions', `DELETE FROM sessions WHERE user_id IN (${scope})`)
  del('users', `DELETE FROM users WHERE id IN (${scope})`)

  return removed
}

export { DEMO_PASSWORD }

// 允许直接运行：npm run seed:demo [-- --clean]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--clean')) {
    const removed = cleanDemo()
    console.log('[demo] 已清除演示数据：')
    for (const [table, n] of Object.entries(removed)) console.log(`         ${table.padEnd(12)} -${n}`)
  } else {
    const stats = runDemoSeed()
    console.log('[demo] ✓ 演示数据就绪：')
    console.log(`         用户 ${stats.users} 新增 / 共 ${USERS.length}`)
    console.log(`         餐馆 ${stats.shops} 新增 / 共 ${SHOPS.length}`)
    console.log(`         配方 ${stats.recipes} 新增 / 共 ${RECIPES.length}`)
    console.log(`         评分 +${stats.ratings}  收藏 +${stats.favorites}  打卡 +${stats.cooks}`)
    console.log('')
    console.log(`         演示账号：${USERS.map((u) => u.username).join(' / ')}`)
    console.log(`         统一密码：${DEMO_PASSWORD}`)
  }
}
