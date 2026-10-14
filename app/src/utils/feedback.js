/**
 * 用户反馈统一封装（toast / 确认框 / 震动）。
 *
 * 统一走这里的意义：以后想换一套提示样式，只改这个文件，
 * 不用去二十个页面里翻 uni.showToast。
 */

export function toast(title, { duration = 2000 } = {}) {
  uni.showToast({ title: String(title), icon: 'none', duration })
}

export function success(title, { duration = 1500 } = {}) {
  uni.showToast({ title: String(title), icon: 'success', duration })
}

let loadingDepth = 0

/**
 * 带引用计数的 loading。
 * 并发请求时只显示一个圈，全部结束才关掉 —— 否则先回来的那个会把
 * 还在加载的请求的圈给关掉。
 */
export function showLoading(title = '加载中') {
  loadingDepth += 1
  if (loadingDepth === 1) uni.showLoading({ title, mask: true })
}

export function hideLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1)
  if (loadingDepth === 0) uni.hideLoading()
}

/** uni.showModal 的 Promise 版，返回用户是否点了确定 */
export function confirm(content, { title = '确认', confirmText = '确定', cancelText = '取消' } = {}) {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content: String(content),
      confirmText,
      cancelText,
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    })
  })
}

/** 只有一个「知道了」的提示框，用于需要看清的说明文字 */
export function alert(content, { title = '提示' } = {}) {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content: String(content),
      showCancel: false,
      confirmText: '知道了',
      success: () => resolve(true),
      fail: () => resolve(false),
    })
  })
}

/**
 * 震动反馈。每进/退一步都震一下，用户不用看屏幕也知道操作生效了。
 *
 * H5 上有明确的能力差异，所以是「尽力而为」：
 *   - Android Chrome：navigator.vibrate 可用
 *   - iOS Safari / 微信 iOS：不支持，静默跳过（用户开了静音也一样）
 * 失败绝不能影响主流程。
 */
export function haptic(type = 'light') {
  try {
    uni.vibrateShort({ type })
  } catch {}
}
