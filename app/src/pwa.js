/**
 * PWA 支持（仅 H5 生效，小程序端整段被条件编译剥掉）。
 *
 * 两件事：
 *   1. 注册 Service Worker —— 让 App 能装到主屏、断网也能打开
 *   2. 抓住 beforeinstallprompt —— 把安装时机交给「我的」页面自己决定，
 *      而不是让浏览器在用户还没搞清楚这 App 干什么的时候就弹窗
 */

let deferredPrompt = null

// #ifdef H5
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // 拦下浏览器默认的小横幅，等我们自己找合适的时机提示
    event.preventDefault()
    deferredPrompt = event
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
  })
}
// #endif

export function isInstalled() {
  // #ifdef H5
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true)
  )
  // #endif
  // eslint-disable-next-line no-unreachable
  return false
}

/** 当前是否可以发起「添加到主屏幕」 */
export function canInstall() {
  return Boolean(deferredPrompt)
}

/**
 * 发起安装。必须在用户点击的同步调用链里触发，否则浏览器会拒绝。
 * @returns {Promise<boolean>} 用户是否接受了
 */
export async function promptInstall() {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  return outcome === 'accepted'
}

export function setupPwa() {
  // #ifdef H5
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  /*
   * Service Worker 只在安全上下文里可用 —— 也就是 https 或 localhost。
   * 用 http://192.168.x.x 或 http://公网IP 打开时浏览器会直接禁用 SW，
   * 不先判断的话控制台会刷一堆看不懂的报错，还会让人以为代码写错了。
   */
  if (!window.isSecureContext) {
    console.info(
      '[pwa] 当前不是安全上下文，跳过 Service Worker 注册。\n' +
        '      想真机测试「添加到主屏幕」，需要用 https 或 localhost 访问（见 README）。',
    )
    return
  }

  /*
   * 开发环境不注册。
   * SW 会把页面缓存住，改完代码刷新看不到效果，排查起来非常费劲 ——
   * 这类问题花掉的时间远比省下的那点加载时间值钱。
   */
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/sw.js').catch((err) => {
      console.warn('[pwa] Service Worker 注册失败：', err)
    })
  })
  // #endif
}
