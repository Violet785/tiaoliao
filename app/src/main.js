import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { setupPwa } from './pwa.js'

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  setupPwa()
  return { app }
}
