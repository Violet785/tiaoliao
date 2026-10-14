<script setup>
import { onLaunch } from '@dcloudio/uni-app'
import { useUserStore } from './store/user.js'
import { setUnauthorizedHandler } from './api/request.js'

onLaunch(() => {
  const userStore = useUserStore()

  // token 失效的统一出口。
  //
  // 放在 App.vue 而不是 request.js 里，是为了让网络层不依赖路由 ——
  // 网络层只管「401 了」，至于该跳哪个页面、要不要跳，是应用层的事。
  setUnauthorizedHandler(() => {
    userStore.clear()

    const pages = getCurrentPages()
    const current = pages[pages.length - 1]
    if (current?.route === 'pages/common/login') return   // 已经在登录页就别重复跳
    uni.navigateTo({ url: '/pages/common/login' })
  })

  // 冷启动时静默校验一次。
  // 本地有 token 不代表服务端还认它（可能已过期、也可能账号被封）。
  // 校验失败会走上面的 401 出口自动登出，用户无感。
  if (userStore.isLoggedIn) {
    userStore.refresh().catch(() => {})
  }
})
</script>

<style>
/*
 * 全局设计变量。
 *
 * 用 CSS 变量而不是 scss 变量：不引入 sass 依赖，且 H5 和小程序都原生支持，
 * 以后做深色模式只要在这里换一套值。
 * 配色取「调料台」的意象 —— 瓷碗暖白底、酱褐文字、辣油红强调。
 */
page {
  --c-bg:          #F6F3EE;
  --c-card:        #FFFFFF;
  --c-text:        #2A241F;
  --c-text-2:      #6E645A;
  --c-text-3:      #A89E93;
  --c-line:        #ECE6DE;
  --c-primary:     #C8452E;
  --c-primary-dim: #E8D7D3;
  --c-accent:      #D9A02B;
  --c-ok:          #3E8E5A;

  --radius:        16rpx;
  --radius-lg:     24rpx;
  --gap:           24rpx;

  background-color: var(--c-bg);
  color: var(--c-text);
  font-size: 28rpx;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

/* H5 下 uni-app 用 page 选择器不会命中 :root，这里补一份，
   让弹窗、遮罩等挂在 body 下的元素也能取到变量 */
/* #ifdef H5 */
:root {
  --c-bg:          #F6F3EE;
  --c-card:        #FFFFFF;
  --c-text:        #2A241F;
  --c-text-2:      #6E645A;
  --c-text-3:      #A89E93;
  --c-line:        #ECE6DE;
  --c-primary:     #C8452E;
  --c-primary-dim: #E8D7D3;
  --c-accent:      #D9A02B;
  --c-ok:          #3E8E5A;
  --radius:        16rpx;
  --radius-lg:     24rpx;
  --gap:           24rpx;
}
/* #endif */

/* 去掉 H5 端 uni-app 默认给 input 加的一堆样式，统一由各页面自己控制 */
/* #ifdef H5 */
uni-input {
  display: block;
}
/* #endif */
</style>
