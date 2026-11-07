<template>
  <!-- 桌面：左侧竖栏。把「跟人有关」的入口都收在这里，右侧全留给内容 -->
  <view class="rail">
    <button class="rail-brand" aria-label="回首页" @click="home">蘸</button>

    <view class="rail-nav">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="rail-item"
        :class="{ active: current === item.key }"
        @click="item.run()"
      >
        <text class="rail-glyph">{{ item.glyph }}</text>
        <text class="rail-label">{{ item.label }}</text>
      </button>
    </view>

    <view class="rail-foot">
      <button class="rail-item" :class="{ active: current === 'user' }" @click="account">
        <text class="rail-avatar">{{ store.displayName.slice(0, 1) || '我' }}</text>
        <text class="rail-label">{{ store.isLoggedIn ? '我的' : '登录' }}</text>
      </button>
      <button v-if="store.isLoggedIn" class="rail-item" @click="logout">
        <text class="rail-glyph quiet">出</text>
        <text class="rail-label">退出</text>
      </button>
    </view>
  </view>

  <!-- 移动端：保留原来的顶栏 -->
  <view class="site-header">
    <view class="header-inner">
      <button class="brand" @click="home"><text class="brand-mark">蘸</text><text>蘸料</text><text class="brand-caption">一碗好味道</text></button>
      <view class="account">
        <button class="account-button" :aria-expanded="open" aria-label="用户菜单" @click="open = !open">
          <text class="avatar">{{ store.displayName.slice(0, 1) || '我' }}</text><text class="account-name">{{ store.displayName || '用户' }}</text><text class="chevron">⌄</text>
        </button>
        <view v-if="open" class="menu">
          <view class="menu-meta">{{ store.isAdmin ? '管理员' : store.isLoggedIn ? '普通用户' : '欢迎来蘸料' }}</view>
          <button @click="go('/pages/user/index')">个人用户</button>
          <button @click="go('/pages/feedback/index')">反馈登记</button>
          <button @click="go('/pages/ai/index', false)">AI 找蘸料</button>
          <button v-if="store.isAdmin" @click="go('/pages/admin/review')">审核管理</button>
          <button v-if="store.isLoggedIn" class="logout" @click="logout">退出登录</button>
          <button v-else @click="go('/pages/common/login', false)">登录 / 注册</button>
        </view>
      </view>
    </view>
    <view v-if="open" class="dismiss" @click="open = false" />
  </view>
</template>

<script setup>
// 导航条。两套布局共用一份数据：
//   · 宽屏（≥900px）：左侧固定竖栏，内容区让出 84px，首页能多排一列卡片
//   · 窄屏：原来的顶部栏 + 头像下拉，手机上竖栏太占地方
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUserStore, requireLogin } from '../store/user.js'

const store = useUserStore()
const open = ref(false)
const current = ref('')

onMounted(() => {
  if (typeof getCurrentPages === 'function') {
    const pages = getCurrentPages()
    const route = pages[pages.length - 1]?.route || ''
    current.value = routeToKey(route)
  }
  if (typeof document !== 'undefined') document.addEventListener('keydown', key)
})
onUnmounted(() => {
  if (typeof document !== 'undefined') document.removeEventListener('keydown', key)
})

function routeToKey(route) {
  if (route.includes('index/index')) return 'home'
  if (route.includes('restaurant/list')) return 'shops'
  if (route.includes('ai/index')) return 'ai'
  if (route.includes('feedback/index')) return 'feedback'
  if (route.includes('admin/review')) return 'review'
  if (route.includes('user/index')) return 'user'
  return ''
}

const navItems = computed(() => {
  const items = [
    { key: 'home', glyph: '家', label: '主页', run: home },
    { key: 'shops', glyph: '店', label: '找店', run: () => go('/pages/restaurant/list', false) },
    { key: 'ai', glyph: 'AI', label: 'AI 找蘸料', run: () => go('/pages/ai/index', false) },
    { key: 'feedback', glyph: '报', label: '反馈登记', run: () => go('/pages/feedback/index') },
  ]
  if (store.isAdmin) items.push({ key: 'review', glyph: '审', label: '审核管理', run: () => go('/pages/admin/review') })
  return items
})

function home() {
  open.value = false
  uni.reLaunch({ url: '/pages/index/index' })
}

function go(url, auth = true) {
  open.value = false
  if (!auth || requireLogin(url)) uni.navigateTo({ url })
}

function account() {
  open.value = false
  if (!store.isLoggedIn) return uni.navigateTo({ url: '/pages/common/login' })
  uni.navigateTo({ url: '/pages/user/index' })
}

async function logout() {
  open.value = false
  await store.logout()
  uni.reLaunch({ url: '/pages/index/index' })
}

function key(e) {
  if (e.key === 'Escape') open.value = false
}
</script>

<style scoped>
/* ─────────── 桌面竖栏 ─────────── */
.rail { display: none; }

@media (min-width: 900px) {
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 84px;
    padding: 18px 0 16px;
    background: #fffcf8;
    border-right: 1px solid #ece3d6;
    z-index: 30;
  }
  .site-header { display: none; }
}

.rail-brand {
  width: 42px;
  line-height: 42px;
  border-radius: 12px 12px 18px 18px;
  background: #bf472d;
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  padding: 0;
  border: 0;
  cursor: pointer;
}
.rail-brand::after, .rail-item::after { border: none; }

.rail-nav { display: flex; flex-direction: column; gap: 6px; margin-top: 22px; flex: 1; }
.rail-foot { display: flex; flex-direction: column; gap: 6px; }

.rail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 64px;
  padding: 8px 0 6px;
  margin: 0;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #6d5b49;
  cursor: pointer;
}
.rail-item:hover { background: #f7efe3; }
.rail-item.active { background: #f3e4cf; color: #b03f27; }

.rail-glyph {
  width: 34px;
  line-height: 34px;
  border-radius: 10px;
  background: #f1e7d8;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
  color: #7a5a38;
}
.rail-item.active .rail-glyph { background: #e8d0b2; color: #a53a22; }
.rail-glyph.quiet { background: transparent; color: #a3937f; font-size: 13px; }
.rail-label { font-size: 11px; line-height: 1.2; }

.rail-avatar {
  width: 34px;
  line-height: 34px;
  border-radius: 50%;
  background: #eee4d6;
  font-size: 15px;
  text-align: center;
  color: #6d543c;
}

/* ─────────── 移动顶栏 ─────────── */
.site-header { position: relative; background: #fffcf8; border-bottom: 1px solid #e8e0d6; z-index: 20; }
.header-inner { max-width: 1120px; margin: auto; height: 82px; padding: 0 28px; display: flex; align-items: center; justify-content: space-between; }
button { margin: 0; padding: 0; background: transparent; border: 0; cursor: pointer; font-size: 14px; }
button::after { border: none; }
.brand { display: flex; align-items: center; gap: 12px; font-size: 22px; font-weight: 700; color: #3a2c22; }
.brand-mark { width: 40px; line-height: 40px; border-radius: 12px 12px 18px 18px; background: #bf472d; color: white; font-size: 24px; }
.brand-caption { font-size: 12px; color: #978572; font-weight: 400; padding-left: 10px; border-left: 1px solid #dfd5c7; }
.account { position: relative; z-index: 22; }
.account-button { display: flex; align-items: center; gap: 8px; line-height: 40px; color: #594536; }
.avatar { width: 34px; line-height: 34px; background: #eee4d6; border-radius: 50%; }
.account-name { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chevron { color: #a28d79; }
.menu { position: absolute; right: 0; top: 52px; width: 180px; background: white; padding: 8px; border: 1px solid #e8dfd3; border-radius: 14px; box-shadow: 0 12px 40px #432e191c; }
.menu button { text-align: left; padding: 0 14px; line-height: 44px; border-radius: 7px; color: #4d3c2e; }
.menu button:hover { background: #f8f3ec; }
.menu .logout { color: #ba4d35; border-top: 1px solid #eee7dd; margin-top: 4px; }
.menu-meta { font-size: 11px; color: #a08d79; padding: 6px 14px; }
.dismiss { position: fixed; inset: 0; z-index: 21; }
@media(max-width:760px) { .header-inner { height: 70px; padding: 0 18px; } .brand-caption { display: none; } }
</style>
