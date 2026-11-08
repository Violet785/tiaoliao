import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn } from 'node:child_process'
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sauce-recommend-test-'))
process.env.DB_PATH = path.join(temp, 'test.db')
const { runMigrations } = await import('../db/migrate.js')
const { runSeed } = await import('../seed/run.js')
const { getDb, closeDb } = await import('../db/index.js')
const { create } = await import('../services/recipeService.js')
const { recommend } = await import('../services/recommendationService.js')
const { vote } = await import('../services/voteService.js')
let checks = 0, child, logs = ''
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
try {
  runMigrations({ silent: true }); runSeed({ silent: true }); const db = getDb()
  db.exec(`INSERT INTO users(id,username,password_hash) VALUES (1,'user_a','unused'),(2,'user_b','unused'),(3,'no_history','unused');
    INSERT INTO restaurants(id,name,name_norm) VALUES (1,'本店','shop'),(2,'其他店','other'),(3,'空店','empty'),(4,'隐藏店','hidden');
    UPDATE restaurants SET status = 'hidden' WHERE id = 4;
    INSERT INTO sessions(token,user_id,expires_at) VALUES ('token_a',1,'2099-01-01T00:00:00Z'),('token_b',2,'2099-01-01T00:00:00Z');`)
  const garlic = [{ condimentId: 'aroma_garlic_minced', amountLevel: 3 }, { condimentId: 'sauce_soy_light', amountLevel: 1 }]
  const chili = [{ condimentId: 'oil_chili', amountLevel: 4 }, { condimentId: 'aroma_chili_fresh', amountLevel: 3 }]
  const sesame = [{ condimentId: 'paste_sesame_mixed', amountLevel: 3 }]
  function recipe(shop, title, items, tasteTags) { return create({ restaurantId: shop, title, items, tasteTags, foodTags: ['food_beef_roll'] }, 1) }
  const likedSource = recipe(2, '他店蒜香', garlic, ['taste_garlic']), dislikedSource = recipe(2, '他店辣碟', chili, ['taste_xiangla'])
  const targetGarlic = recipe(1, '本店蒜香', garlic, ['taste_garlic']), targetChili = recipe(1, '本店辣碟', chili, ['taste_xiangla']), targetSesame = recipe(1, '本店麻酱', sesame, ['taste_sesame'])
  db.prepare(`UPDATE recipes SET content_type = 'reference', content_source = '待试配', cover_illustration = '/static/recipes/garlic.svg' WHERE id = ?`).run(targetGarlic)
  const cold = recommend({ restaurantId: 1 })
  check(cold.personalized, false, '匿名不伪称个性化'); check(cold.loginRequired, true, '匿名提示登录')
  check(cold.list.every(r => r.restaurant.id === 1), true, '仅本店候选'); check(cold.feedback, { likes: 0, dislikes: 0 }, '匿名不读取他人喜好')
  check(recommend({ restaurantId: 1, userId: 3 }).personalized, false, '新用户明确冷启动')
  vote(likedSource, 1, 1); vote(dislikedSource, 1, -1)
  let r = recommend({ restaurantId: 1, userId: 1 })
  check(r.list[0].id, targetGarlic, '跨店点赞优先相近口味'); check(r.feedback, { likes: 1, dislikes: 1 }, '计入正负反馈')
  check(r.list.find(x => x.id === targetSesame).recommendationScore > r.list.find(x => x.id === targetChili).recommendationScore, true, '与不喜欢相近的口味降低排序')
  check(r.list[0].contentType, 'reference', '保留参考标识'); check(r.list[0].recommendationReason.includes('点赞'), true, '推荐有依据说明')
  vote(likedSource, 2, -1); vote(dislikedSource, 2, 1)
  check(recommend({ restaurantId: 1, userId: 2 }).list[0].id, targetChili, '账号喜好相反时排序不同')
  vote(targetGarlic, 1, -1)
  check(recommend({ restaurantId: 1, userId: 1 }).list.some(x => x.id === targetGarlic), false, '已点不喜欢直接排除')
  vote(targetGarlic, 1, 0)
  check(recommend({ restaurantId: 1, userId: 1 }).list[0].id, targetGarlic, '取消后即时恢复')
  vote(likedSource, 1, -1)
  r = recommend({ restaurantId: 1, userId: 1 })
  check(r.feedback, { likes: 0, dislikes: 2 }, '切换投票不累积旧偏好'); check(r.profile, null, '仅负反馈不伪造喜欢画像')
  check(r.list[0].id, targetSesame, '仅有负反馈也能避开相似风味')
  vote(likedSource, 1, 1)
  for (const id of [targetGarlic, targetChili, targetSesame]) vote(id, 1, -1)
  r = recommend({ restaurantId: 1, userId: 1 })
  check(r.list.length, 0, '全部不喜欢时不强推'); check(r.emptyReason, 'all_disliked', '明确空结果原因')
  for (const id of [targetGarlic, targetChili, targetSesame]) vote(id, 1, 0)
  check(recommend({ restaurantId: 1, userId: 1, filters: { exclude: ['aroma_garlic_minced'] } }).list.some(x => x.id === targetGarlic), false, '推荐尊重排除调料')
  check(recommend({ restaurantId: 1, userId: 1, filters: { tasteTag: 'taste_garlic', spice: 'none' } }).list.map(x => x.id), [targetGarlic], '推荐尊重组合筛选')
  check(recommend({ restaurantId: 3, userId: 1 }).emptyReason, 'no_recipes', '空店不混入其他品牌')
  // 超过旧推荐池上限的其他店热门，不得挤掉本店候选。
  for (let i = 0; i < 85; i++) db.prepare(`INSERT INTO recipes(restaurant_id,user_id,title,hot_score) VALUES (2,1,?,99999)`).run(`其他热门${i}`)
  check(recommend({ restaurantId: 1, userId: 1 }).list[0].id, targetGarlic, '先限定本店，后排序')
  db.exec(`INSERT INTO restaurants(id,name,name_norm,status,merged_into_id) VALUES (5,'旧店入口','old','merged',1)`)
  check(recommend({ restaurantId: 5, userId: 1 }).restaurant.id, 1, '旧品牌链接解析')
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve)); const port = listener.address().port; await new Promise(resolve => listener.close(resolve))
  const root = path.resolve(import.meta.dirname, '..')
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'index.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production', AI_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', data => { logs += data }); child.stderr.on('data', data => { logs += data })
  const base = `http://127.0.0.1:${port}`
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break } } catch {} await new Promise(resolve => setTimeout(resolve, 100)) }
  assert(ready, logs)
  async function get(url, token, status = 200) { const response = await fetch(base + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); const body = await response.json(); check(response.status, status, url); return { data: body.data, response } }
  const personal = await get('/api/restaurants/1/recommendations?userId=2', 'token_a')
  check(personal.data.list[0].id, targetGarlic, '只使用会话用户，不信任传入用户 ID')
  check(personal.response.headers.get('cache-control'), 'private, no-store', '不缓存个人结果')
  check((await get('/api/restaurants/1/recommendations', 'token_b')).data.list[0].id, targetChili, '接口账号隔离')
  check((await get('/api/restaurants/1/recommendations', 'bad-token')).data.personalized, false, '过期会话退为匿名')
  check((await get('/api/restaurants/1/recommendations?limit=1', 'token_a')).data.list.length, 1, '数量限制')
  check((await get('/api/restaurants/1/recommendations?limit=999999', 'token_a')).data.list.length <= 12, true, '数量保护')
  await get('/api/restaurants/1abc/recommendations', undefined, 400); await get('/api/restaurants/999/recommendations', undefined, 404); await get('/api/restaurants/4/recommendations', undefined, 404)
  await get('/api/restaurants/1/recommendations?spice=invalid', 'token_a', 400)
  check((await get('/api/ai/recommend?restaurantId=1', 'token_a')).data.list[0].id, targetGarlic, '全站 AI 推荐入口共用偏好逻辑')
  vote(targetGarlic, 1, -1)
  check((await get('/api/ai/recommend?restaurantId=1', 'token_a')).data.list.some(x => x.id === targetGarlic), false, 'AI 入口也排除不喜欢')
  db.prepare(`UPDATE recipes SET status = 'deleted' WHERE id = ?`).run(targetChili)
  check((await get('/api/restaurants/1/recommendations', 'token_b')).data.list.some(x => x.id === targetChili), false, '删除后不推荐')
  db.exec(`UPDATE restaurants SET status = 'hidden' WHERE id = 2`)
  r = recommend({ restaurantId: 1, userId: 2 })
  check(r.personalized, false, '隐藏来源的投票不再参与画像'); check(r.feedback, { likes: 0, dislikes: 0 }, '隐藏来源不泄露反馈')
  console.log(`PASS ${checks} recommendation checks: positive/negative preferences, store scope, filters, live votes, privacy, cold start`)
} finally {
  if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)) }
  closeDb(); fs.rmSync(temp, { recursive: true, force: true })
}
