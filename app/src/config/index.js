/**
 * 全局配置 —— 换环境、换平台只改这一个文件。
 *
 * 条件编译把平台差异挡在这里，业务代码永远只 `import { BASE_URL }`，
 * 不需要知道自己跑在 H5 还是小程序里。
 */

let baseUrl = ''

// #ifdef H5
// 留空 = 发同源请求：
//   开发时由 vite 代理转发到 localhost:3000（见 vite.config.js）
//   上线后由 nginx 把 /api 反代到后端进程
// 两种情况下浏览器都认为是同源，天然没有跨域。
baseUrl = ''
// #endif

// #ifndef H5
// 小程序必须用完整域名，且要在微信后台「开发设置 → request 合法域名」里配置，
// 必须 HTTPS。等小程序要上线时再填这里。
baseUrl = 'https://api.example.com'
// #endif

export const BASE_URL = baseUrl

/** 请求超时。调料台经常在地下室信号很差，给宽松一点。 */
export const TIMEOUT = 15000

/** 列表默认每页条数，与后端 config.pageSize.default 保持一致 */
export const PAGE_SIZE = 20

/** 本地缓存的调料/标签数据多久过期（毫秒）。后端每天会发 ETag，这里给一天。 */
export const META_CACHE_TTL = 24 * 60 * 60 * 1000
