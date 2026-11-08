import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sauce-intent-test-'))
let next = { conditions: [] }, status = 200, delay = 0, requests = [], timers = new Set()
const mock = http.createServer(async (req, res) => {
  let text = ''; for await (const part of req) text += part
  requests.push(JSON.parse(text)); const body = next, code = status, wait = delay
  const finish = () => { if (res.destroyed) return; res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: typeof body === 'string' ? body : JSON.stringify(body) } }] })) }
  if (wait) { const timer = setTimeout(() => { timers.delete(timer); finish() }, wait); timers.add(timer) } else finish()
})
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve))
process.env.DB_PATH = path.join(temp, 'test.db')
process.env.AI_BASE_URL = `http://127.0.0.1:${mock.address().port}/v1`
process.env.AI_MODEL = 'test-only-model'; process.env.AI_API_KEY = 'test-only-key'
const { runMigrations } = await import('../db/migrate.js')
const { runSeed } = await import('../seed/run.js')
const { getDb, closeDb } = await import('../db/index.js')
const { create } = await import('../services/recipeService.js')
const { understandTaste, validateIntent } = await import('../ai/intent.js')
const { chatReply } = await import('../ai/chat.js')
const { aiConfig } = await import('../ai/config.js')
let checks = 0
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
const resetMock = conditions => { next = { conditions }; status = 200; delay = 0 }
try {
  runMigrations({ silent: true }); runSeed({ silent: true }); const db = getDb()
  db.exec(`INSERT INTO users(username,password_hash) VALUES ('editor','unused'); INSERT INTO restaurants(id,name,name_norm) VALUES (1,'海底捞','海底捞'),(2,'巴奴','巴奴');`)
  for (const id of [1, 2]) {
    create({ restaurantId: id, title: '辣油碟', items: [{ condimentId: 'oil_chili', amountLevel: 2 }] }, 1)
    create({ restaurantId: id, title: '香菜辣碟', items: [{ condimentId: 'oil_chili', amountLevel: 2 }, { condimentId: 'aroma_cilantro', amountLevel: 2 }] }, 1)
  }
  resetMock(['不要香菜', '要辣'])
  let result = await understandTaste('香菜我吃不来，来点有辣感的', { spice: 'none' })
  check(result.source, 'model', '调用模型'); check(result.preferences.spice, 'spicy', '转换泛辣口语'); check(result.preferences.exclude, 'aroma_cilantro', '转换隐含忌口')
  check(requests[0].response_format.type, 'json_schema', '结构化输出'); check(requests[0].response_format.json_schema.strict, true, '严格模式'); check(requests[0].temperature, 0, '确定性解析'); check(requests[0].messages.at(-1).content, '香菜我吃不来，来点有辣感的', '只发当前一句，不发用户私有记录')
  resetMock(['清爽', '不要蒜'])
  result = await understandTaste('我想清爽点，别弄得满嘴蒜味')
  check(result.preferences.tasteTag, 'taste_refresh', '隐含否定不变成蒜香'); check(result.preferences.exclude.includes('aroma_garlic_minced'), true, '排除蒜类')
  resetMock(['可以放蒜', '微辣'])
  result = await understandTaste('蒜我已经能接受了，来个微辣的', { spice: 'none', exclude: 'aroma_garlic_minced,oil_garlic' })
  check(result.preferences.exclude, '', '语义允许后取消忌口'); check(result.preferences.spice, 'mild', '多条件一起更新')
  resetMock(['清空口味', '重辣'])
  result = await understandTaste('把刚才的忌口都忘掉，这次要重辣', { spice: 'none', tasteTag: 'taste_sesame', exclude: 'aroma_cilantro' })
  check(result.preferences, { spice: 'hot', tasteTag: '', foodTag: '', exclude: '' }, '重置后使用新条件')
  resetMock(['不辣', '不要香菜'])
  result = await understandTaste('要辣，不要香菜')
  check(result.preferences.spice, 'spicy', '明确要求优先于模型误读'); check(result.preferences.exclude, 'aroma_cilantro', '仍保留另一个条件')
  check(validateIntent('{"conditions":["重辣"]}', '来点有辣感的'), ['要辣'], '不擅自升级成重辣')
  check(validateIntent('{"conditions":["微辣"]}', '来点有辣感的'), ['要辣'], '不擅自限定具体程度')
  resetMock(['微辣']); result = await understandTaste('我不想很辣'); check(result.preferences.spice, 'mild', '否定强辣不被规则误覆盖')
  for (const message of ['一点辣都不要', '一点点辣也不要', '一丁点辣都不能有', '辣一点也不要']) {
    resetMock(['微辣'])
    result = await understandTaste(message, { spice: 'hot' })
    check(result.preferences.spice, 'none', '模型误报微辣时仍遵守完全不辣'); check(result.conditions, ['不辣'], '模型解释同步修正为不辣')
  }
  resetMock(['微辣']); result = await chatReply({ message: '一点辣都不要', restaurantId: 1 })
  check(result.preferences.spice, 'none', '模型聊天完全不辣'); check(result.cards.length, 0, '只有辣配方时不放宽为微辣')
  check(validateIntent('{"conditions":["不要香菜"]}', '海底捞'), [], '不添加没提过的忌口')
  check(validateIntent('{"conditions":["不要香菜"]}', '我喜欢香菜'), [], '不把正向喜好反读')
  check(validateIntent('{"conditions":["可以放蒜"]}', '蒜我吃不来'), [], '不能误取消忌口')
  resetMock(['不要柠檬汁'])
  result = await understandTaste('柠檬汁我吃不来')
  check(result.source, 'model', '模型支持全库调料'); check(result.preferences.exclude, 'sauce_lemon', '模型柠檬语义落到真实调料ID')
  const choices = requests.at(-1).response_format.json_schema.schema.properties.conditions.items.enum
  check(choices.includes('不要柠檬汁'), true, '本句真实调料加入模型条件'); check(choices.includes('不要鱼露'), false, '不把无关全库名称塞入小模型提示')
  check(validateIntent('{"conditions":["不要柠檬汁"]}', '我喜欢柠檬汁'), [], '具体调料正向表达不反读')
  check(validateIntent('{"conditions":["不要蒜"]}', '不要蒜末'), [], '模型不能扩大具体调料到整类')
  check(validateIntent('{"conditions":["不辣"]}', '不要辣椒油'), [], '模型不把具体辣油忌口变成所有辣度排除')
  check(validateIntent('{"conditions":["不要柠檬汁","可以放香菜"]}', '不要柠檬汁，香菜可以'), ['不要柠檬汁','可以放香菜'], '允许只作用于对应调料')
  resetMock(['可以放柠檬汁']); result = await understandTaste('柠檬汁可以放了', { exclude: 'sauce_lemon,aroma_cilantro' })
  check(result.preferences.exclude, 'aroma_cilantro', '重新允许柠檬汁保留其他忌口')
  next = 'not json'; result = await understandTaste('不要柠檬汁和蚝油')
  check(result.reason, 'invalid_output', '模型错误时全库备用'); check(result.preferences.exclude.split(',').sort(), ['sauce_lemon','sauce_oyster'], '备用仍识别全部具体调料')
  check(validateIntent('{"conditions":["清空口味"]}', '不要重置口味'), [], '不能误重置')
  check(validateIntent('{"conditions":["配牛肉"]}', '海底捞'), [], '不臆测食材')
  check(validateIntent('{"conditions":["秘密配方"]}', '推荐'), null, '不接受词表外内容')
  check(validateIntent('{"conditions":[],"restaurantId":2}', '推荐'), null, '模型不能选择店铺')
  check(validateIntent('```json\n{"conditions":[]}\n```', '推荐'), null, '不执行非 JSON 输出')
  check(validateIntent(JSON.stringify({ conditions: Array(9).fill('要辣') }), '要辣'), null, '限制长度')
  resetMock(['不要香菜', '要辣'])
  result = await chatReply({ message: '香菜我吃不来，来点有辣感的', restaurantId: 1 })
  check(result.source, 'ai', '聊天接入模型'); check(result.understanding.source, 'model', '公开真实解析来源'); check(result.understanding.model, 'test-only-model', '真实模型名称')
  check(result.restaurant.id, 1, '口味解析保留店铺'); check(result.cards.length, 1, '只有匹配配方'); check(result.cards[0].title, '辣油碟', '名片来自数据库'); check(result.cards[0].ingredients.some(i => i.condimentId === 'aroma_cilantro'), false, '名片遵循排除要求')
  next = 'not json'
  result = await understandTaste('要辣，不要香菜')
  check(result.reason, 'invalid_output', '坏 JSON 备用规则'); check(result.preferences.spice, 'spicy', '失败仍识别已支持条件')
  resetMock([]); status = 500
  check((await understandTaste('要辣')).reason, 'unavailable', '模型服务错误备用')
  resetMock(['要辣']); delay = 150; aiConfig.intentTimeout = 30
  check((await understandTaste('要辣')).reason, 'unavailable', '超时备用')
  aiConfig.intentTimeout = 1000; resetMock(['要辣']); delay = 80
  const first = understandTaste('要辣'); const count = requests.length
  check((await understandTaste('不辣')).reason, 'busy', '繁忙请求不排队耗尽资源'); check(requests.length, count, '并发不多发请求'); await first
  aiConfig.apiKey = ''; const before = requests.length
  check((await understandTaste('要辣')).reason, 'disabled', '未配置时保留规则'); check(requests.length, before, '未配置不调用')
  console.log(`PASS ${checks} model intent checks: real provider calls, constrained JSON, semantic conversion, guards, timeout, concurrency, fallback`)
} finally {
  closeDb(); for (const timer of timers) clearTimeout(timer); mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve)); fs.rmSync(temp, { recursive: true, force: true })
}
