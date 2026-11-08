// 执行聊天组件本身的 setup 逻辑，验证重置与在途响应的竞争；不连接线上服务。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'
import { build } from 'esbuild'
import { effectScope, reactive, nextTick } from 'vue'
const root = path.resolve(import.meta.dirname, '..'), file = path.join(root, 'src/ai/chat-widget.vue')
const { descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file })
const script = compileScript(descriptor, { id: 'chat-session-test' })
const output = path.join(root, 'node_modules/.cache/sauce-chat-session-test.mjs')
const bundled = await build({ stdin: { contents: script.content, resolveDir: path.dirname(file), sourcefile: file }, bundle: true, format: 'esm', platform: 'node', external: ['vue'], write: false,
  plugins: [{ name: 'test-services', setup(api) {
    api.onResolve({ filter: /^\.\/api\.js$/ }, () => ({ path: 'chat-api', namespace: 'mock' }))
    api.onResolve({ filter: /^\.\.\/api\/restaurant\.js$/ }, () => ({ path: 'restaurant-api', namespace: 'mock' }))
    api.onResolve({ filter: /^\.\.\/store\/user\.js$/ }, () => ({ path: 'user-store', namespace: 'mock' }))
    api.onResolve({ filter: /recipe-card\.vue$/ }, () => ({ path: 'recipe-card', namespace: 'mock' }))
    api.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: {
      'chat-api': 'export const chat = (...args) => globalThis.__chatSessionMock(...args)',
      'restaurant-api': 'export const list = async () => ({list:[]})',
      'user-store': 'export const useUserStore = () => globalThis.__chatSessionUser',
      'recipe-card': 'export default {}',
    }[args.path], loader: 'js' }))
  } }],
})
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, bundled.outputFiles[0].text)
const component = (await import(pathToFileURL(output).href + '?v=' + Date.now())).default
const shopA = { id: 1, name: '海底捞' }, shopB = { id: 2, name: '巴奴' }
globalThis.__chatSessionUser = reactive({ token: 'test-user' })
const response = (restaurant = shopA, preferences = {}, extra = {}) => ({ restaurant, preferences, preferenceSummary: Object.keys(preferences).length ? ['测试口味'] : [], cards: [], reply: '已按当前条件推荐', ...extra })
let checks = 0
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++ }
const scope = effectScope(), props = reactive({ restaurant: shopA })
try {
  const vm = scope.run(() => component.setup(props, { expose() {} }))
  check(vm.selectedRestaurant.value.id, 1, '带入当前店')
  globalThis.__chatSessionMock = async () => response(shopA, { spice: 'none', exclude: 'aroma_garlic_minced' })
  await vm.send('不辣，不放蒜')
  check(vm.preferences.value.spice, 'none', '保存本次要求')
  const before = vm.messages.value.length
  vm.resetTaste()
  check(vm.selectedRestaurant.value.id, 1, '重置口味保留店铺'); check(vm.preferences.value, {}, '清空口味'); check(vm.labels.value, [], '清空口味标签'); check(vm.messages.value.length, before + 1, '保留对话并提示重置')
  let sent
  globalThis.__chatSessionMock = async (...args) => { sent = args[2]; return response() }
  await vm.send('重新推荐')
  check(sent.restaurantId, 1, '后续请求保留店铺'); check(sent.preferences, {}, '后续请求不携带旧要求')
  let resolveOld
  globalThis.__chatSessionMock = () => new Promise(resolve => { resolveOld = resolve })
  const oldRequest = vm.send('旧的口味要求')
  check(vm.sending.value, true, '请求正在进行')
  vm.resetTaste()
  check(vm.sending.value, false, '重置可取消等待状态')
  globalThis.__chatSessionMock = async () => response(shopA, { spice: 'hot' })
  await vm.send('改成重辣')
  resolveOld(response(shopB, { spice: 'none' }, { reply: '迟到的旧回复' })); await oldRequest
  check(vm.selectedRestaurant.value.id, 1, '迟到的回复不能跳店'); check(vm.preferences.value.spice, 'hot', '迟到的回复不能恢复旧条件'); check(vm.messages.value.some(m => m.content === '迟到的旧回复'), false, '旧回复不回灌对话')
  globalThis.__chatSessionMock = async () => response(shopB, { tasteTag: 'taste_sesame' })
  vm.choose(shopB); await nextTick(); await Promise.resolve()
  check(vm.selectedRestaurant.value.id, 2, '主动换店')
  vm.resetConversation(true)
  check(vm.selectedRestaurant.value.id, 2, '清空对话保留已选的新店'); check(vm.preferences.value, {}, '清空对话同时清除要求'); check(vm.messages.value.length, 1, '只留下欢迎语')
  globalThis.__chatSessionMock = () => new Promise(resolve => { resolveOld = resolve })
  const pending = vm.send('另一条在途请求'); vm.resetConversation(true)
  resolveOld(response(shopA, { spice: 'none' })); await pending
  check(vm.selectedRestaurant.value.id, 2, '清空后旧请求不能恢复上一家店'); check(vm.messages.value.length, 1, '清空后旧消息不回来')
  props.restaurant = { id: 3, name: '牛NEW' }; await nextTick()
  check(vm.selectedRestaurant.value.id, 3, '进入新店页面时切换上下文')
  globalThis.__chatSessionUser.token = 'another-test-user'; await nextTick()
  check(vm.messages.value.length, 1, '切换账号清空历史')
  console.log(`PASS ${checks} chat session checks: reset controls, current store, late replies, new requests, account isolation`)
} finally { scope.stop(); delete globalThis.__chatSessionMock; delete globalThis.__chatSessionUser }
