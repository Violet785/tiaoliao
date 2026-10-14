// 全局配置 —— 所有可变参数集中在这里，改配置只动这一个文件
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = path.resolve(__dirname, '..')

function int(value, fallback) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

export const config = {
  port: int(process.env.PORT, 3000),
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  serverRoot: SERVER_ROOT,

  // SQLite 文件路径。注意：DatabaseSync 不会自动建父目录，db/index.js 会确保存在
  dbPath: path.resolve(SERVER_ROOT, process.env.DB_PATH || 'data/dev.db'),

  // 打包好的前端目录（npm run build:h5 的产物）。
  // 生产环境由本服务一并托管 —— 于是「部署」就只是把一个 Node 进程跑起来，
  // 不用再额外配一个 nginx。开发时这个目录多半还不存在，index.js 会自动跳过。
  staticDir: path.resolve(SERVER_ROOT, process.env.STATIC_DIR || '../app/dist/build/h5'),

  // 会话有效期。用不透明 token 而非 JWT —— 可随时撤销（封禁/登出）
  sessionDays: int(process.env.SESSION_DAYS, 30),

  // 微信小程序。两者都为空时，/api/auth/wechat-login 返回明确的未启用提示
  wx: {
    appId: process.env.WX_APPID || '',
    secret: process.env.WX_SECRET || '',
    get enabled() {
      return Boolean(this.appId && this.secret)
    },
  },

  // 分页保护：防止前端传 pageSize=999999 把库拖垮
  pageSize: { default: 20, max: 50 },
}

export default config
