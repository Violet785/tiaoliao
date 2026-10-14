import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],

  server: {
    host: true,        // 允许手机连同一 WiFi 直接访问，方便真机试「照着配」
    port: 5173,

    // 开发时 H5 请求同源的 /api，由这里转发到本地后端。
    //
    // 为什么走代理而不是直接写 http://localhost:3000：
    //   1. 浏览器始终认为是同源请求 —— 没有跨域问题，也不用后端开 CORS
    //   2. 手机真机调试时只要把 target 改成电脑内网 IP 即可，前端代码一行不用动
    //   3. 上线后由 nginx 做同样的反代，前端代码继续不用动
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
