<template>
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
import { ref, onMounted, onUnmounted } from 'vue'
import { useUserStore, requireLogin } from '../store/user.js'
const store = useUserStore(), open = ref(false)
function home() { open.value = false; uni.reLaunch({ url: '/pages/index/index' }) }
function go(url, auth = true) { open.value = false; if (!auth || requireLogin(url)) uni.navigateTo({ url }) }
async function logout() { open.value = false; await store.logout(); uni.reLaunch({ url: '/pages/index/index' }) }
function key(e) { if (e.key === 'Escape') open.value = false }
onMounted(() => { if (typeof document !== 'undefined') document.addEventListener('keydown', key) })
onUnmounted(() => { if (typeof document !== 'undefined') document.removeEventListener('keydown', key) })
</script>
<style scoped>
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
