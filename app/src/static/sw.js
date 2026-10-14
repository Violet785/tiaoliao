/*
 * Service Worker —— 让 App 在断网时也能打开。
 *
 * 缓存策略是按「数据新鲜度有多重要」分开定的，不是一刀切：
 *
 *   /api/*        永不缓存。配方、评分这些必须是最新的；
 *                 「照着配」需要的离线能力由 App 层自己预取进 Storage，
 *                 不靠 SW —— 那样用户能看到明确的「已下载」状态，比偷偷缓存可信。
 *   /assets/*     缓存优先。构建产物带内容 hash，文件名变了内容才变，可以放心长期存。
 *   页面导航      网络优先 + 离线回退。这样在线时永远拿到最新的 index.html，
 *                 不会出现「新版本发布了但用户还卡在旧壳里」的经典坑。
 *   其它同源资源  先给缓存再后台更新。
 *
 * 改完这里记得把 VERSION 加一，否则老缓存不会清。
 */

const VERSION = 'v1'
const SHELL = `sauce-shell-${VERSION}`
const ASSETS = `sauce-assets-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL)
      await cache.addAll(['/', '/static/manifest.webmanifest'])
      // 不等用户关掉所有旧页面，立刻让新 SW 进入等待→激活流程
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k.startsWith('sauce-') && k !== SHELL && k !== ASSETS)
          .map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // 非 GET 直接放行（POST/PATCH/DELETE 本来也不该被缓存）
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 只管自己的源；第三方（地图、统计）交给浏览器默认行为
  if (url.origin !== self.location.origin) return

  // 接口数据永不缓存 —— 让 SW 直接放行，等价于没装
  if (url.pathname.startsWith('/api/')) return

  // ---- 页面导航：网络优先，离线回退到壳 ----
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          if (fresh.ok) {
            const cache = await caches.open(SHELL)
            cache.put('/', fresh.clone())
          }
          return fresh
        } catch {
          const cached = await caches.match('/')
          return cached || Response.error()
        }
      })(),
    )
    return
  }

  // ---- 带 hash 的构建产物：缓存优先 ----
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        const fresh = await fetch(request)
        if (fresh.ok) {
          const cache = await caches.open(ASSETS)
          cache.put(request, fresh.clone())
        }
        return fresh
      })(),
    )
    return
  }

  // ---- 图标、字体等其它同源静态资源：先给缓存，同时后台更新 ----
  event.respondWith(
    (async () => {
      const cached = await caches.match(request)
      const network = fetch(request)
        .then((fresh) => {
          if (fresh.ok) {
            caches.open(ASSETS).then((c) => c.put(request, fresh.clone()))
          }
          return fresh
        })
        .catch(() => null)

      if (cached) return cached
      const fresh = await network
      return fresh || Response.error()
    })(),
  )
})
