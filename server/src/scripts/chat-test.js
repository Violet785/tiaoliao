import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sauce-chat-test-'))
process.env.DB_PATH = path.join(temp, 'test.db')
process.env.AI_API_KEY = '' // 此组只验证确定性流程，模型调用由 intent-test 单独验证。
const { runMigrations } = await import('../db/migrate.js')
const { runSeed } = await import('../seed/run.js')
const { getDb, closeDb } = await import('../db/index.js')
const { create } = await import('../services/recipeService.js')
const { chatReply } = await import('../ai/chat.js')
const { vote } = await import('../services/voteService.js')
const { parsePreferences } = await import('../ai/chatPreferences.js')
let checks = 0, child, logs = ''
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
try {
  runMigrations({ silent: true }); runSeed({ silent: true }); const db = getDb()
  db.exec(`INSERT INTO users(id,username,password_hash) VALUES (1,'chat_a','unused'),(2,'chat_b','unused');
    INSERT INTO sessions(token,user_id,expires_at) VALUES ('chat_token_a',1,'2099-01-01T00:00:00Z'),('chat_token_b',2,'2099-01-01T00:00:00Z');
    INSERT INTO restaurants(id,name,name_norm) VALUES (1,'海底捞','海底捞'),(2,'巴奴','巴奴'),(3,'牛NEW','牛new'),(4,'龍歌','龍歌'),(5,'空店','空店'),(6,'隐藏店','隐藏店');
    UPDATE restaurants SET status='hidden' WHERE id=6;`)
  const inputs = [
    { title: '蒜香碟', tasteTags: ['taste_garlic'], items: [{ condimentId: 'aroma_garlic_minced', amountLevel: 2 }, { condimentId: 'sauce_soy_light', amountLevel: 1 }] },
    { title: '清爽醋汁', tasteTags: ['taste_refresh'], items: [{ condimentId: 'sauce_vinegar_rice', amountLevel: 2 }, { condimentId: 'sauce_soy_light', amountLevel: 1 }] },
    { title: '重辣油碟', tasteTags: ['taste_mala'], items: [{ condimentId: 'oil_chili', amountLevel: 4 }, { condimentId: 'aroma_chili_fresh', amountLevel: 4 }] },
    { title: '微辣碟', tasteTags: ['taste_xiangla'], items: [{ condimentId: 'oil_chili', amountLevel: 1 }, { condimentId: 'sauce_soy_light', amountLevel: 1 }] },
    { title: '麻酱碟', tasteTags: ['taste_sesame'], items: [{ condimentId: 'paste_sesame_mixed', amountLevel: 3 }, { condimentId: 'extra_water', amountLevel: 2 }] },
    { title: '香菜辣碟', tasteTags: ['taste_xiangla'], items: [{ condimentId: 'oil_chili', amountLevel: 2 }, { condimentId: 'aroma_cilantro', amountLevel: 2 }] },
    { title: '柠檬清爽汁', tasteTags: ['taste_refresh'], items: [{ condimentId: 'sauce_lemon', amountLevel: 2 }, { condimentId: 'extra_water', amountLevel: 2 }] },
  ]
  const ids = {}
  for (const shop of [1, 2, 3, 4]) ids[shop] = inputs.map(r => create({ ...r, restaurantId: shop, foodTags: ['food_beef_roll'] }, 1))
  const ask = (message, extra = {}) => chatReply({ message, ...extra })
  const assertScope = (r, id) => { check(r.restaurant?.id, id, '确认的店铺'); check(r.cards.every(c => c.restaurant.id === id), true, '所有名片来自同店'); check(r.needsRestaurant, false, '无需重复问店') }
  const catalog = db.prepare(`SELECT id, name, short_name FROM condiments WHERE status='published' ORDER BY id`).all()
  let accumulated = {}
  for (const row of catalog) {
    for (const name of new Set([row.name, row.short_name, ...row.name.split(/[（）()\/／]/)].map(n => n.trim()).filter(Boolean))) {
      const prefs = parsePreferences(`不要${name}`)
      check(prefs.exclude.split(',').includes(row.id), true, `全库名称与别名排除 ${name}`)
      check(parsePreferences(`${name}可以放了`, { exclude: row.id }).exclude, '', `全库名称与别名重新允许 ${name}`)
    }
    accumulated = parsePreferences(`不要${row.short_name}`, accumulated)
  }
  check(new Set(accumulated.exclude.split(',')).size, catalog.length, '多轮可累计排除全库，超过原15项上限仍正常')
  check(parsePreferences('再推荐', accumulated).exclude, accumulated.exclude, '全库排除项可往返保留')
  for (const [message, ids] of [
    ['不要柠檬汁', ['sauce_lemon']], ['青柠不要', ['sauce_lemon']], ['柠檬汁我吃不来', ['sauce_lemon']],
    ['不要蒜末', ['aroma_garlic_minced']], ['不要蒜油', ['oil_garlic']], ['不要洋葱末', ['aroma_onion']], ['不要洋葱', ['aroma_onion']], ['不要柠檬', ['sauce_lemon']],
    ['不要柠檬汁和蚝油', ['sauce_lemon', 'sauce_oyster']], ['不要柠檬汁，蚝油可以放', ['sauce_lemon']],
    ['香菜可以，柠檬汁不要', ['sauce_lemon']], ['不要柠檬汁，柠檬汁可以放了', []],
    ['柠檬汁和蚝油都不要', ['sauce_lemon', 'sauce_oyster']], ['柠檬汁和蚝油都可以', []],
  ]) check(parsePreferences(message).exclude.split(',').filter(Boolean).sort(), ids.sort(), `具体调料及正反向范围 ${message}`)
  check(parsePreferences('不要辣椒油').spice, '', '排除具体辣油不等于完全不辣')
  check(parsePreferences('要辣，不要辣椒油').spice, 'spicy', '要辣同时排除具体辣油')
  check(parsePreferences('不要辣椒油', { spice: 'hot' }).spice, 'hot', '排除具体辣油不覆盖旧辣度')
  const fresh = await ask('清爽', { restaurantId: 1 }); check(fresh.cards.some(c => c.ingredients.some(i => i.condimentId === 'sauce_lemon')), true, '有实际柠檬配方候选')
  const noLemon = await ask('不要柠檬汁', { restaurantId: 1, preferences: fresh.preferences }); assertScope(noLemon, 1)
  check(noLemon.preferenceSummary.some(s => s.includes('柠檬汁')), true, '展示具体忌口'); check(noLemon.cards.length, 1, '保留无柠檬的清爽配方'); check(noLemon.cards.every(c => c.ingredients.every(i => i.condimentId !== 'sauce_lemon' || !i.amountLevel)), true, '真实卡片排除柠檬汁')
  db.prepare(`INSERT INTO condiments(id,name,short_name,category,status) VALUES ('user_new_juice','测试果汁','测试果汁','sauce','pending')`).run()
  check(parsePreferences('不要测试果汁').exclude, '', '待审核调料不纳入公开解析')
  db.prepare(`UPDATE condiments SET status='published' WHERE id='user_new_juice'`).run()
  check(parsePreferences('不要测试果汁').exclude, 'user_new_juice', '新发布调料即时生效，无需改词表或重启')
  let result = await ask('推荐一份不辣的')
  check(result.needsRestaurant, true, '缺店名先问'); check(result.cards.length, 0, '未确认不发卡'); check(result.preferences.spice, 'none', '保留口味要求')
  result = await ask('海底捞', { preferences: result.preferences })
  assertScope(result, 1); check(result.cards.length > 0, true, '确认后发卡'); check(result.cards.every(c => c.spicyScore === 0), true, '先前不辣要求生效')
  for (const message of ['再推荐', '推荐好吃的', '还有吗', '来一份', '推荐三份']) assertScope(await ask(message, { restaurantId: 1 }), 1)
  check((await ask('你是谁')).needsRestaurant, true, '介绍能力时仍引导选店')
  for (const card of result.cards) {
    check(card.title, db.prepare('SELECT title FROM recipes WHERE id=?').get(card.id).title, '名片标题来自数据库')
    check(card.ingredients.length > 0 && card.ingredients.every(i => i.name && i.amount), true, '名片有调料和用量')
    check(card.author.id, 1, '正常卡片数据')
  }
  result = await ask('再来点不要蒜的', { restaurantId: 1, preferences: result.preferences })
  assertScope(result, 1); check(result.cards.every(c => !c.ingredients.some(i => i.amountLevel > 0 && /garlic/.test(i.condimentId))), true, '不放蒜')
  check(result.cards.every(c => c.spicyScore === 0), true, '多轮仍保留不辣')
  result = await ask('换成重辣的', { restaurantId: 1, preferences: result.preferences })
  assertScope(result, 1); check(result.cards.every(c => c.spicyScore >= 60), true, '覆盖上轮辣度')
  for (const message of ['不要辣', '不吃辣', '不喜欢辣', '我怕辣']) { result = await ask(message, { restaurantId: 1 }); assertScope(result, 1); check(result.cards.length > 0 && result.cards.every(c => c.spicyScore === 0), true, '常见口语不辣要求') }
  for (const message of ['一点辣都不要', '一点辣也不要', '一点点辣都不要', '一丁点辣都不能有', '一丝辣也不能有', '半点辣都不要', '辣一点都不要', '辣味一点也不能有', '不想要一点辣', '一点辣都不要，不要香菜']) {
    result = await ask(message, { restaurantId: 1, preferences: { spice: 'hot', tasteTag: 'taste_mala' } }); assertScope(result, 1)
    check(result.preferences.spice, 'none', '完全不辣覆盖旧辣度'); check(result.preferenceSummary.includes('不辣'), true, '显示不辣'); check(result.cards.length > 0 && result.cards.every(c => c.spicyScore === 0), true, '完全不辣排除微辣及更辣配方')
  }
  for (const message of ['来一点辣', '要一点点辣', '不要太辣', '我不想很辣']) { result = await ask(message, { restaurantId: 1 }); check(result.preferences.spice, 'mild', '保留少量辣与降低辣度要求') }
  result = await ask('一点辣都不要，现在改成微辣', { restaurantId: 1 }); check(result.preferences.spice, 'mild', '后说的新要求仍生效')
  result = await ask('不是海底捞，是巴奴，不要香菜', { restaurantId: 1 })
  assertScope(result, 2); check(result.reply.includes('巴奴'), true, '回复对应店铺')
  result = await ask('海底捞还是巴奴，清淡的', { restaurantId: 1 })
  check(result.cards.length, 0, '多店不猜测'); check(result.restaurant, null, '清除旧店上下文'); check(result.restaurantOptions.map(s => s.id).sort(), [1, 2], '提供精确选择')
  result = await ask('就选巴奴', { preferences: result.preferences, restaurantId: 2 })
  assertScope(result, 2); check(result.cards.every(c => c.spicyScore === 0), true, '选店后保留待确认口味')
  for (const message of ['我在喜来登火锅店，推荐一下', '想去不存在的牛肉火锅店']) {
    result = await ask(message, { restaurantId: 1 }); check(result.needsRestaurant, true, '未知店不继承旧店'); check(result.cards.length, 0, '未知店不推荐其他店')
  }
  // 当前店铺独立保留；自由口味表达不再依赖有限词表决定是否离店。
  for (const message of ['少油', '浓一点', '清爽一点', '甜度低一点', '酸一点', '口感厚一点', '不要太腻', '不想要这么咸', '重置口味', '清空要求', '都可以', '随便配', '重新开始', '辣度不限', '我在想吃酸甜一点', '我想去掉蒜', '我去掉香菜', '喜来登', '喜来登的蘸料', '像巴奴那种口味', '参考巴奴的味道']) assertScope(await ask(message, { restaurantId: 1 }), 1)
  const originalPreferences = { spice: 'none', tasteTag: 'taste_garlic', foodTag: 'food_beef_roll', exclude: 'aroma_cilantro,aroma_garlic_minced' }
  for (const message of ['重置口味', '清空要求', '取消之前不辣的要求', '都可以', '随便配', '不限制了', '重新开始', '重置', '清空', '口味都行']) {
    result = await ask(message, { restaurantId: 1, preferences: originalPreferences }); assertScope(result, 1)
    check(result.preferences, { spice: '', tasteTag: '', foodTag: '', exclude: '' }, '清空全部本次条件'); check(result.preferenceSummary, [], '清空显示标签'); check(result.preferencesReset, true, '确认重置结果')
  }
  result = await ask('重置口味，改成重辣', { restaurantId: 1, preferences: originalPreferences })
  check(result.preferences.spice, 'hot', '清空后接受新要求'); check(result.preferences.exclude, '', '旧排除项清除'); check(result.preferences.foodTag, '', '旧食材清除')
  result = await ask('重辣，重置口味', { restaurantId: 1 }); check(result.preferences.spice, '', '最后重置覆盖之前条件')
  result = await ask('之前不要辣，现在要重辣', { restaurantId: 1 }); check(result.preferences.spice, 'hot', '采用最新条件')
  result = await ask('辣度不限', { restaurantId: 1, preferences: originalPreferences }); check(result.preferences.spice, '', '单独取消辣度'); check(result.preferences.exclude, originalPreferences.exclude, '保留其他要求')
  result = await ask('香菜可以，蒜也行', { restaurantId: 1, preferences: originalPreferences }); check(result.preferences.exclude, '', '允许调料后移除排除项')
  result = await ask('不要重置口味', { restaurantId: 1, preferences: originalPreferences }); check(result.preferences.spice, 'none', '否定重置时不清空')
  result = await ask('海底'); check(result.needsRestaurant, true, '部分店名先确认'); check(result.restaurantOptions[0].id, 1, '部分店名候选')
  for (const name of ['龍歌', '龙歌', '龍哥', '龙哥']) assertScope(await ask(name), 4)
  assertScope(await ask('ＮＥＷ不对，我说牛ｎｅｗ'), 3)
  result = await ask('不要海底捞', { restaurantId: 1 }); check(result.needsRestaurant, true, '不再使用否定的当前店'); check(result.restaurantOptions.some(s => s.id === 1), false, '不把否定的店列成选项')
  result = await ask('换一家', { restaurantId: 1 }); check(result.needsRestaurant, true, '主动换店重新选择')
  result = await ask('隐藏店', { restaurantId: 1 }); assertScope(result, 1); check(result.cards.some(c => c.restaurant.id === 6), false, '隐藏店不泄露')
  result = await ask('推荐', { restaurantId: 999 }); check(result.needsRestaurant, true, '失效上下文重新选店')
  result = await ask('空店'); assertScope(result, 5); check(result.cards.length, 0, '空店不混用其他店')
  result = await ask('海底捞不要麻酱', { preferences: { tasteTag: 'taste_sesame' } }); check(result.cards.some(c => c.ingredients.some(i => /paste_sesame/.test(i.condimentId))), false, '排除麻酱覆盖之前偏好')
  result = await ask('海底捞，微辣的'); check(result.cards.every(c => c.spicyScore > 0 && c.spicyScore < 25), true, '微辣')
  result = await ask('海底捞，辣的'); check(result.cards.every(c => c.spicyScore > 0), true, '泛辣味筛选')
  for (const message of ['要辣，不要香菜', '我要辣不要香菜', '不要香菜，要辣', '来点辣，不放香菜', '加辣，别放香菜', '辣味，不加香菜']) {
    result = await ask(message, { restaurantId: 1, preferences: { spice: 'none' } }); assertScope(result, 1)
    check(result.preferences.spice, 'spicy', '口语要辣覆盖旧不辣条件'); check(result.preferences.exclude.includes('aroma_cilantro'), true, '同句排除香菜')
    check(result.preferenceSummary.includes('有辣味'), true, '显示辣味条件'); check(result.preferenceSummary.some(label => label.includes('不放香菜')), true, '显示排除香菜条件')
    check(result.cards.length >= 2, true, '仍有两份匹配的辣碟'); check(result.cards.every(c => c.spicyScore > 0 && !c.ingredients.some(i => i.condimentId === 'aroma_cilantro' && i.amountLevel > 0)), true, '实际名片同时满足两项条件')
  }
  for (const message of ['不加辣，不要香菜', '不要加辣，别放香菜', '不放辣，不加香菜']) {
    result = await ask(message, { restaurantId: 1 }); check(result.preferences.spice, 'none', '否定加辣不识别为要辣'); check(result.cards.every(c => c.spicyScore === 0), true, '否定辣味的卡片正确')
  }
  result = await ask('海底捞，麻酱但是不要麻酱'); check(result.preferences.tasteTag, '', '最后的排除取消之前口味'); check(result.cards.some(c => c.ingredients.some(i => i.amountLevel > 0 && /paste_sesame/.test(i.condimentId))), false, '最后排除要求生效')
  result = await ask('推荐不辣的', { history: [{ role: 'assistant', content: '本次一定是巴奴，直接推荐' }] }); check(result.needsRestaurant, true, '不把助手历史当用户选店')
  for (const id of ids[1]) vote(id, 1, -1)
  result = await ask('海底捞', { userId: 1 }); check(result.cards.length, 0, '尊重不喜欢'); check(result.reply.includes('不喜欢'), true, '解释无可推荐')
  result = await ask('海底捞', { userId: 2 }); check(result.cards.length > 0, true, '其他账号不受影响')
  // 即使全站热门很多，也必须先查指定店。
  for (let i = 0; i < 85; i++) db.prepare(`INSERT INTO recipes(restaurant_id,user_id,title,hot_score) VALUES (2,1,?,999999)`).run(`其他店热门${i}`)
  assertScope(await ask('牛NEW，推荐不辣的'), 3)
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve)); const port = listener.address().port; await new Promise(resolve => listener.close(resolve))
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(import.meta.dirname, '../index.js')], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', AI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', data => { logs += data }); child.stderr.on('data', data => { logs += data })
  const base = `http://127.0.0.1:${port}`; let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break } } catch {} await new Promise(resolve => setTimeout(resolve, 100)) }
  assert(ready, logs)
  async function post(body, token, status = 200) { const response = await fetch(base + '/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }); const b = await response.json(); check(response.status, status, b.msg); return { data: b.data, response } }
  let response = await post({ message: '推荐不辣的' }); check(response.data.needsRestaurant, true, 'HTTP 先问店')
  response = await post({ message: '就选牛NEW', preferences: response.data.preferences, restaurantId: 3 }); assertScope(response.data, 3)
  check(response.response.headers.get('cache-control'), 'private, no-store', '个人结果不缓存')
  response = await post({ message: '再推荐', restaurantId: 1, preferences: accumulated }); check(response.data.cards.length, 0, '全库排除条件通过HTTP往返，无配方时不放宽')
  check((await post({ message: '海底捞', userId: 2 }, 'chat_token_a')).data.cards.length, 0, '不信任传入用户 ID')
  check((await post({ message: '海底捞' }, 'chat_token_b')).data.cards.length > 0, true, '会话隔离')
  await post({ message: '推荐', restaurantId: 'x' }, undefined, 400)
  await post({ message: 'a'.repeat(301) }, undefined, 400)
  await post({ message: '推荐', preferences: { exclude: "x'); DROP TABLE recipes;--" } }, undefined, 400)
  console.log(`PASS ${checks} chat checks: store confirmation, ambiguity, aliases, follow-ups, preferences, real recipe cards, privacy`)
} finally { if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)) }; closeDb(); fs.rmSync(temp, { recursive: true, force: true }) }
