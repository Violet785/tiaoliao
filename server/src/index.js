// 服务入口：装配 Express、挂路由、启动。
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import config from './config.js'
import apiRoutes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { runMigrations } from './db/migrate.js'
import { purgeExpiredSessions } from './services/authService.js'

const app = express()

// 开发期 H5 跑在 5173、后端在 3000，跨域必须放行。
// 生产环境应该收紧成白名单，但在小程序里请求不受 CORS 约束，
// 所以这里放开不会成为上线的安全问题。
app.use(cors())
app.use(express.json({ limit: '256kb' }))
app.use(express.urlencoded({ extended: true, limit: '256kb' }))

// 极简访问日志。生产环境只记错误，避免刷屏。
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    if (config.isProd && res.statusCode < 400) return
    const ms = Date.now() - start
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`)
  })
  next()
})

app.use('/api', apiRoutes)

// ── 连同前端一起托管 ──
//
// 开发时前端跑在 vite（5173），这里什么都不做。
// 一旦 `npm run build:h5` 出过产物，就把 dist 挂上 ——
// 于是「一个进程、一个端口」同时提供页面和接口，
// 部署时不用再额外配 nginx，给别人试的时候也只需要穿透这一个端口。
const hasStatic = fs.existsSync(path.join(config.staticDir, 'index.html'))

if (hasStatic) {
  app.use(
    express.static(config.staticDir, {
      setHeaders(res, filePath) {
        // index.html 绝不能缓存：它引用的是带哈希的 JS 文件名，
        // 缓存住了用户会一直加载上一版代码，改了东西也不生效
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache')
        }
      },
    }),
  )

  // SPA 兜底：没命中静态文件的 GET 交回首页，剩下的路由交给前端。
  //
  // 现在 uni-app 用的是 hash 路由（/#/pages/xxx），这条其实用不上；
  // 留着是为了将来改成 history 路由时不必再动服务端。
  //
  // 两道闸门：
  //   /api 的 404 必须继续走 JSON —— 否则接口路径写错会收到一坨 HTML，排查时看不懂
  //   带扩展名的是在指名要某个文件，找不到就该 404，不该拿首页糊弄过去
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api')) return next()
    if (path.extname(req.path)) return next()
    res.sendFile(path.join(config.staticDir, 'index.html'))
  })
}

app.use(notFoundHandler)
app.use(errorHandler)   // 必须最后注册

// 启动前确保库是最新的 —— 忘记跑 migrate 是新环境最常见的启动失败原因
runMigrations({ silent: true })
const purged = purgeExpiredSessions()
if (purged > 0) console.log(`[session] 清理了 ${purged} 条过期会话`)

app.listen(config.port, () => {
  console.log('')
  console.log(`  蘸料小程序 · 后端已启动`)
  console.log(`  ────────────────────────────────────`)
  console.log(`  地址    http://localhost:${config.port}`)
  console.log(`  健康检查 http://localhost:${config.port}/api/health`)
  console.log(`  环境    ${config.env}`)
  console.log(`  前端    ${hasStatic ? '已托管打包产物，直接开上面的地址即可' : '未打包（开发时请另开 npm run dev:h5）'}`)
  console.log(`  数据库  ${config.dbPath}`)
  console.log('')
})

export default app
