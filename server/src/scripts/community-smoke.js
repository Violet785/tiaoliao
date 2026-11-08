// 所有数据位于临时目录，绝不连接或修改开发/生产数据库。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { hashPassword } from '../utils/password.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tiaoliao-test-'))
const dbFile = path.join(temp, 'test.db')
let checks = 0, child, db, logs = ''
function check(value, expected, label) { assert.deepEqual(value, expected, label); checks++ }
const password = 'Testing_Secure_932!'
try {
  // 先造 001 旧版分店数据，验证迁移合并后配方、互动不丢失。
  db = new DatabaseSync(dbFile)
  db.exec(fs.readFileSync(path.join(root, 'db/migrations/001_init.sql'), 'utf8'))
  db.exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT);
    INSERT INTO schema_migrations(version) VALUES ('001_init');`)
  const hash = hashPassword(password)
  const addUser = db.prepare('INSERT INTO users (username, password_hash, nickname, role) VALUES (?, ?, ?, ?)')
  addUser.run('smoke_admin', hash, '测试管理员', 'admin'); addUser.run('smoke_user', hash, '普通用户', 'user')
  db.exec(`INSERT INTO restaurants(id,name,name_norm,city_norm,address_norm) VALUES
    (1,'测试品牌（北京店）','old1','北京','一号'), (2,'测试品牌（上海店）','old2','上海','二号');
    INSERT INTO recipes(id,restaurant_id,user_id,title,cook_count) VALUES (1,2,2,'原配方',3);
    INSERT INTO cook_logs(recipe_id,user_id,restaurant_id,finished) VALUES (1,2,2,1);`)
  db.close(); db = null
  const env = { ...process.env, DB_PATH: dbFile, UPLOAD_DIR: path.join(temp, 'uploads'), NODE_ENV: 'production', HOST: '127.0.0.1', AI_API_KEY: '' }
  for (const file of ['db/migrate.js','seed/run.js']) {
    const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, file)], { env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
  }
  const provision = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'scripts/create-admin.js'), 'new_admin'], { env, input: password, encoding: 'utf8' })
  check(provision.status, 0, '管理员创建脚本')
  const overwrite = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'scripts/create-admin.js'), 'new_admin'], { env, input: password, encoding: 'utf8' })
  check(overwrite.status === 0, false, '不覆盖已有管理员密码')
  db = new DatabaseSync(dbFile)
  check(db.prepare('SELECT COUNT(*) AS n FROM restaurants WHERE status = ?').get('published').n, 1, '合并分店')
  check(db.prepare('SELECT restaurant_id FROM recipes WHERE id = 1').get().restaurant_id, 1, '配方迁移')
  check(db.prepare('SELECT restaurant_id FROM cook_logs WHERE id = 1').get().restaurant_id, 1, '打卡迁移')
  check(db.prepare('SELECT recipe_count, cook_count FROM restaurants WHERE id = 1').get(), Object.assign(Object.create(null), { recipe_count: 1, cook_count: 3 }), '计数保留')
  const listener = net.createServer(); await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve))
  const base = `http://127.0.0.1:${port}`
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(root, 'index.js')], { env: { ...env, PORT: String(port) }, stdio: ['ignore','pipe','pipe'] })
  child.stdout.on('data', b => { logs += b }); child.stderr.on('data', b => { logs += b })
  let ready = false
  for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break } } catch {} await new Promise(resolve => setTimeout(resolve, 100)) }
  assert(ready, logs)
  async function api(method, url, body, token, expected = 200) {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
    const data = await response.json(); check(response.status, expected, `${method} ${url}: ${data.msg}`)
    if (expected < 400) check(data.code, 0, '成功响应')
    return data.data
  }
  const login = username => api('POST', '/api/auth/login', { username, password })
  const admin = (await login('smoke_admin')).token, user = (await login('smoke_user')).token
  check((await login('new_admin')).user.role, 'admin', '新管理员可登录')
  const registered = await api('POST', '/api/auth/register', { username: 'registered_user', password, role: 'admin' })
  check(registered.user.role, 'user', '注册不能提权')
  await api('PATCH', '/api/users/me', { nickname: '试图提权', role: 'admin' }, user)
  check((await api('GET', '/api/auth/me', undefined, user)).user.role, 'user', '个人资料不能提权')
  await api('GET', '/api/submissions', undefined, user, 403)
  await api('GET', '/api/submissions', undefined, undefined, 401)
  const shops = await api('GET', '/api/restaurants')
  check(shops.total, 1, '公开仅一个品牌')
  check('city' in shops.list[0], false, '不返回地理位置')
  check((await api('GET', '/api/restaurants/2')).restaurant.id, 1, '旧分店链接解析')
  const storePayload = { kind: 'restaurant', name: '牛NEW（北京店）', city: '北京', address: '不应该公开', clientToken: 'brand-retry' }
  const submitted = await api('POST', '/api/restaurants', { ...storePayload, status: 'approved', publishedId: 99, role: 'admin' }, user, 202)
  check(submitted.submission.status, 'pending', '新店待审核')
  check((await api('GET', '/api/restaurants')).total, 1, '待审核店不公开')
  check((await api('POST', '/api/restaurants', storePayload, user, 202)).submission.id, submitted.submission.id, '重试幂等')
  await api('POST', `/api/submissions/${submitted.submission.id}/review`, { action: 'approve' }, user, 403)
  const approve = id => api('POST', `/api/submissions/${id}/review`, { action: 'approve' }, admin)
  const approved = await approve(submitted.submission.id), brandId = approved.submission.publishedId
  check((await api('GET', `/api/restaurants/${brandId}`)).restaurant.name, '牛NEW', '发布通用店名')
  await api('POST', `/api/submissions/${submitted.submission.id}/review`, { action: 'approve' }, admin, 409)
  const dup = await api('POST', '/api/submissions', { kind: 'restaurant', name: '牛new（上海店）' }, user, 202)
  check((await approve(dup.submission.id)).submission.publishedId, brandId, '不同分店复用一个品牌')
  check((await api('GET', '/api/restaurants')).total, 2, '无重复品牌')
  const reject = await api('POST', '/api/submissions', { kind: 'feedback', content: '测试反馈' }, user, 202)
  await api('POST', `/api/submissions/${reject.submission.id}/review`, { action: 'reject' }, admin, 400)
  await api('POST', `/api/submissions/${reject.submission.id}/review`, { action: 'reject', note: '请补充信息' }, admin)
  check((await api('GET', '/api/submissions/mine', undefined, registered.token)).total, 0, '反馈记录隔离')
  const mine = await api('GET', '/api/submissions/mine', undefined, user)
  check(mine.list.find(r => r.id === reject.submission.id).reviewNote, '请补充信息', '用户看到驳回原因')
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDecAAAAASUVORK5CYII='
  await api('POST', '/api/uploads', { base64: png }, undefined, 401)
  await api('POST', '/api/uploads', { base64: Buffer.from('<svg onload="alert(1)"/>').toString('base64') }, user, 400)
  await api('POST', '/api/uploads', { base64: '????' }, user, 400)
  await api('POST', '/api/uploads', { base64: 'a'.repeat(6990512) }, user, 400)
  const image = await api('POST', '/api/uploads', { base64: png }, user, 201)
  check((await fetch(base + `/api/uploads/${image.id}`)).status, 404, '待审图片不公开')
  check((await fetch(base + image.url)).status, 200, '拥有签名可以预览')
  check((await fetch(base + image.url.replace(/signature=./, 'signature=z'))).status, 404, '篡改签名无效')
  const recipe = { kind: 'recipe', restaurantId: brandId, title: '测试麻酱', description: '只是一份测试配方', items: [{ condimentId: 'oil_sesame', amountLevel: 2 }], imageIds: [image.id], clientToken: 'recipe-retry' }
  await api('POST', '/api/submissions', recipe, registered.token, 400)
  await api('POST', '/api/submissions', { ...recipe, items: [null] }, user, 400)
  await api('POST', '/api/submissions', { ...recipe, items: [{ condimentId: 'missing', amountLevel: 2 }] }, user, 400)
  await api('POST', '/api/submissions', { ...recipe, items: [{ condimentId: 'oil_sesame', amountLevel: 0 }] }, user, 400)
  const pending = await api('POST', '/api/recipes', recipe, user, 202)
  check((await api('GET', `/api/restaurants/${brandId}/recipes`)).total, 0, '蘸料审核前不可见')
  const reviewQueue = await api('GET', '/api/submissions?status=pending&kind=recipe', undefined, admin)
  check(reviewQueue.list[0].payload.items[0].condimentName.length > 0, true, '审核显示调料名称')
  check((await fetch(base + reviewQueue.list[0].payload.images[0].url)).status, 200, '审核图片预览')
  const published = await approve(pending.submission.id), recipeId = published.submission.publishedId
  const full = await api('GET', `/api/recipes/${recipeId}`, undefined, user)
  check(full.recipe.title, recipe.title, '审核后发布')
  check(full.recipe.images[0].id, image.id, '图片关联配方')
  check('address' in full.restaurant, false, '配方详情无地理位置')
  const picture = await fetch(base + `/api/uploads/${image.id}`)
  check(picture.status, 200, '已发布图片公开'); check(picture.headers.get('content-type'), 'image/png', '固定图片类型')
  const vote = value => api('PUT', `/api/recipes/${recipeId}/vote`, { value }, user)
  await api('PUT', `/api/recipes/${recipeId}/vote`, { value: 1 }, undefined, 401)
  check((await vote(1)).likeCount, 1, '点赞')
  check((await vote(1)).likeCount, 1, '重复点赞不累加')
  const down = await vote(-1); check([down.likeCount, down.dislikeCount, down.myVote], [0,1,-1], '差评替换点赞')
  check((await api('GET', `/api/restaurants/${brandId}/recipes?sort=likes`, undefined, user)).list[0].myVote, -1, '列表返回我的投票')
  check((await vote(0)).dislikeCount, 0, '取消评价')
  await api('PUT', `/api/recipes/${recipeId}/vote`, { value: 2 }, user, 400)
  await api('PATCH', `/api/recipes/${recipeId}`, { ...recipe, title: '越权修改' }, registered.token, 403)
  const edit = await api('PATCH', `/api/recipes/${recipeId}`, { ...recipe, title: '审核后的新名称', clientToken: 'edit-retry' }, user, 202)
  check((await api('PATCH', `/api/recipes/${recipeId}`, { ...recipe, title: '审核后的新名称', clientToken: 'edit-retry' }, user, 202)).submission.id, edit.submission.id, '修改请求重试幂等')
  check((await api('GET', `/api/recipes/${recipeId}`)).recipe.title, recipe.title, '修改待审保留原内容')
  await approve(edit.submission.id)
  check((await api('GET', `/api/recipes/${recipeId}`)).recipe.title, '审核后的新名称', '修改通过后更新')
  await api('GET', `/api/recipes/${recipeId}/cook`)
  await api('PUT', `/api/recipes/${recipeId}/rating`, { score: 5 }, user)
  await api('POST', `/api/recipes/${recipeId}/favorite`, {}, user)
  await api('POST', `/api/recipes/${recipeId}/cook-log`, { finished: true }, user)
  check((await api('GET', `/api/restaurants/${brandId}`)).restaurant.cookCount, 1, '旧互动兼容')
  // 完整发现流程：组合筛选不串店、不重复；零用量调料不参与排除。
  const filteredInput = { kind: 'recipe', restaurantId: brandId, title: '筛选蒜香清爽', description: '清爽测试',
    items: [{ condimentId: 'aroma_garlic_minced', amountLevel: 2 }, { condimentId: 'oil_sesame', amountLevel: 2 }],
    tasteTags: ['taste_garlic'], foodTags: ['food_veg'] }
  const filteredPending = await api('POST', '/api/submissions', filteredInput, user, 202)
  const filteredId = (await approve(filteredPending.submission.id)).submission.publishedId
  const zeroPending = await api('POST', '/api/submissions', { ...filteredInput, title: '筛选不放蒜', items: [{ condimentId: 'aroma_garlic_minced', amountLevel: 0 }, { condimentId: 'oil_chili', amountLevel: 1 }] }, user, 202)
  const zeroId = (await approve(zeroPending.submission.id)).submission.publishedId
  const query = '?keyword=' + encodeURIComponent('筛选') + '&tasteTag=taste_garlic&foodTag=food_veg'
  check((await api('GET', `/api/recipes${query}`)).total, 2, '口味和食材组合搜索')
  check((await api('GET', `/api/recipes${query}&spice=none`)).list.map(r => r.id), [filteredId], '不辣筛选')
  check((await api('GET', `/api/recipes${query}&spice=mild&exclude=aroma_garlic_minced`)).list.map(r => r.id), [zeroId], '排除蒜保留不放蒜的配方')
  check((await api('GET', `/api/restaurants/${brandId}/recipes${query}&exclude=aroma_garlic_minced`)).list.map(r => r.id), [zeroId], '店铺内同样支持组合筛选')
  check((await api('GET', `/api/recipes?restaurantId=1&keyword=${encodeURIComponent('筛选')}`)).total, 0, '品牌筛选隔离')
  check((await api('GET', `/api/recipes?keyword=${encodeURIComponent('蒜末')}`)).list.some(r => r.id === filteredId), true, '调料名称可搜索')
  check((await api('GET', `/api/recipes${query}&spice=hot`)).total, 0, '无匹配条件返回空列表')
  await api('GET', '/api/recipes?spice=invalid', undefined, undefined, 400)
  await api('GET', '/api/recipes?exclude=' + encodeURIComponent("x');DROP TABLE recipes;--"), undefined, undefined, 400)
  const rated = await api('PUT', `/api/recipes/${filteredId}/rating`, { score: 3, content: '需要少放一点盐', feedbackTags: ['太咸', '用量不清楚', '太咸'] }, user)
  check(rated.rating.feedbackTags, ['太咸', '用量不清楚'], '评价标签去重')
  check((await api('GET', `/api/recipes/${filteredId}`, undefined, user)).myRating.feedbackTags, ['太咸', '用量不清楚'], '详情回显评价')
  check((await api('GET', `/api/recipes/${filteredId}/ratings`)).list[0].feedbackTags, ['太咸', '用量不清楚'], '公开评价标签')
  await api('PUT', `/api/recipes/${filteredId}/rating`, { score: 4, feedbackTags: ['随意标签'] }, user, 400)
  await api('PUT', `/api/recipes/${filteredId}/rating`, { score: 5, content: '修改后喜欢', feedbackTags: [] }, user)
  check((await api('GET', `/api/recipes/${filteredId}/ratings`)).total, 1, '改分不新增评价')
  await api('POST', `/api/recipes/${filteredId}/favorite`, {}, user)
  await api('POST', `/api/recipes/${filteredId}/favorite`, {}, user)
  check((await api('GET', `/api/recipes/${filteredId}`, undefined, user)).recipe.favoriteCount, 1, '重复收藏只记一次')
  check((await api('GET', '/api/users/me/favorites', undefined, user)).list.some(r => r.id === filteredId), true, '个人收藏入口闭环')
  await api('DELETE', `/api/recipes/${filteredId}/favorite`, undefined, user)
  check((await api('GET', `/api/recipes/${filteredId}`, undefined, user)).isFavorite, false, '取消收藏回显')
  await api('DELETE', `/api/recipes/${filteredId}/rating`, undefined, user)
  check((await api('GET', `/api/recipes/${filteredId}/ratings`)).total, 0, '删除评价')
  await api('POST', '/api/uploads/previews', { imageIds: [image.id] }, registered.token, 400)
  check((await api('POST', '/api/uploads/previews', { imageIds: [image.id] }, user)).images[0].id, image.id, '草稿图片重新签名')
  await api('GET', `/api/submissions/${reject.submission.id}`, undefined, registered.token, 404)
  check((await api('GET', `/api/submissions/${reject.submission.id}`, undefined, user)).reviewNote, '请补充信息', '本人读取驳回原稿')
  const retry = await api('POST', '/api/submissions', { kind: 'feedback', content: '已补充详细说明', resubmittedFrom: reject.submission.id, clientToken: 'feedback-resubmit' }, user, 202)
  check((await api('GET', `/api/submissions/${retry.submission.id}`, undefined, user)).resubmittedFrom, reject.submission.id, '重提保留原记录链接')
  check((await api('GET', `/api/submissions/${reject.submission.id}`, undefined, user)).status, 'rejected', '重提不覆盖旧审核记录')
  await api('POST', '/api/submissions', { kind: 'feedback', content: '越权重提', resubmittedFrom: reject.submission.id }, registered.token, 404)
  await api('POST', '/api/submissions', { kind: 'feedback', content: '不能从待审重提', resubmittedFrom: retry.submission.id }, user, 400)
  await approve(retry.submission.id)
  await api('GET', '/api/notifications', undefined, undefined, 401)
  check((await api('GET', '/api/notifications', undefined, registered.token)).unread, 0, '通知仅本人可见')
  const notices = await api('GET', '/api/notifications?pageSize=50', undefined, user)
  check(notices.list.some(n => n.submissionId === retry.submission.id), true, '审核结果产生通知')
  check(db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE submission_id = ?').get(retry.submission.id).n, 1, '同一次审核只有一条通知')
  await api('POST', '/api/notifications/read', { throughId: notices.list[0].id }, registered.token)
  check((await api('GET', '/api/notifications', undefined, user)).unread, notices.unread, '他人不能标记我的通知')
  await api('POST', '/api/notifications/read', { throughId: notices.list[0].id }, user)
  check((await api('GET', '/api/notifications', undefined, user)).unread, 0, '批量已读持久化')
  const rejectedEdit = await api('PATCH', `/api/recipes/${filteredId}`, { ...filteredInput, title: '修改被驳回', clientToken: 'rejected-edit' }, user, 202)
  await api('POST', `/api/submissions/${rejectedEdit.submission.id}/review`, { action: 'reject', note: '补充用量' }, admin)
  const retryEdit = await api('PATCH', `/api/recipes/${filteredId}`, { ...filteredInput, title: '补齐后的用量', resubmittedFrom: rejectedEdit.submission.id, clientToken: 'retry-edit' }, user, 202)
  check((await api('GET', `/api/submissions/${retryEdit.submission.id}`, undefined, user)).resubmittedFrom, rejectedEdit.submission.id, '配方修改重提保留关联')
  await approve(retryEdit.submission.id)
  check((await api('GET', `/api/recipes/${filteredId}`)).recipe.title, '补齐后的用量', '重提通过更新原配方')
  // 通过后才发现配方已被删除时，审核必须整体回滚，记录继续待审。
  const abandonedEdit = await api('PATCH', `/api/recipes/${recipeId}`, { ...recipe, title: '无法更新的名称', clientToken: 'abandoned-edit' }, user, 202)
  await api('DELETE', `/api/recipes/${recipeId}`, undefined, user)
  await api('POST', `/api/submissions/${abandonedEdit.submission.id}/review`, { action: 'approve' }, admin, 404)
  check(db.prepare('SELECT status FROM submissions WHERE id = ?').get(abandonedEdit.submission.id).status, 'pending', '审核失败事务回滚')
  await api('GET', `/api/recipes/${recipeId}`, undefined, user, 404)
  check((await fetch(base + `/api/uploads/${image.id}`)).status, 404, '删除配方后图片不公开')
  await api('GET', '/api/recipes/1abc', undefined, undefined, 400)
  const invalidJson = await fetch(base + '/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
  check(invalidJson.status, 400, '非法 JSON 状态')
  check((await invalidJson.json()).code, 40001, '非法 JSON 结构化报错')
  console.log(`PASS ${checks} checks: migration, permissions, moderation, images, votes, existing interactions`)
} catch (err) {
  console.error(err); console.error(logs); process.exitCode = 1
} finally {
  if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)) }
  if (db) db.close()
  fs.rmSync(temp, { recursive: true, force: true })
}
