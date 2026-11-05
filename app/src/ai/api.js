// AI 模块的网络层。
//
// 全部走项目统一的 http 封装（自动带 token、自动拆 {code,msg,data} 外壳），
// 这样 AI 功能和主站共用登录态 —— 登录用户能拿到「按你口味」的推荐。
import http from '../api/request.js'

/** 是否配置了模型。UI 用它显示「演示模式」角标 */
export function status() {
  return http.get('/api/ai/status', {}, { auth: false, silent: true })
}

/** 推荐列表。未登录也能用，只是不个性化 */
export function recommend({ limit = 6 } = {}) {
  return http.get('/api/ai/recommend', { limit }, { silent: true })
}

/** 独立页面用的搜索 + 资讯摘要 */
export function search(q) {
  return http.get('/api/ai/search', { q })
}

/** 小窗口对话。history 传最近几条 {role, content} 即可 */
export function chat(message, history = []) {
  return http.post('/api/ai/chat', { message, history }, { silent: true })
}

export default { status, recommend, search, chat }
