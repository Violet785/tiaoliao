<template><view><SiteHeader /><view class="shell user-shell"><view class="eyebrow">YOUR LITTLE CORNER</view><view class="page-title">个人用户</view><template v-if="store.isLoggedIn"><view class="panel"><view class="row between"><view><view class="nickname">{{ store.displayName }}</view><view class="muted">@{{ store.user.username }}</view></view><text class="badge">{{ store.isAdmin ? '管理员' : '普通用户' }}</text></view><text class="label">昵称</text><input v-model="nickname" class="field" maxlength="20" placeholder="输入昵称" /><button class="btn save" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存昵称' }}</button></view><view class="row"><button class="ghost" @click="feedback">反馈登记与审核进度</button><button v-if="store.isAdmin" class="ghost" @click="admin">审核管理</button></view><view class="section-title">我发布的蘸料</view><view v-for="r in recipes" :key="r.id" class="panel published row between" @click="go(r.id)"><view><view class="recipe-name">{{ r.title }}</view><view class="muted">{{ r.restaurantName }}</view></view><text>↗</text></view><view v-if="!recipes.length" class="empty">{{ loading ? '加载中…' : failed ? '加载失败，请重新进入' : '还没有发布的蘸料，去反馈登记分享一碗吧。' }}</view><button v-if="hasMore" class="ghost" :disabled="loading" @click="load(false)">加载更多</button></template></view></view></template>
<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import { useUserStore, requireLogin } from '../../store/user.js'
import { http } from '../../api/request.js'
const store = useUserStore(), nickname = ref(''), saving = ref(false), recipes = ref([]), loading = ref(false), failed = ref(false), page = ref(1), hasMore = ref(false)
async function load(reset = true) { if (loading.value) return; loading.value = true; if (reset) page.value = 1; try { const r = await http.get('/api/users/me/recipes', { page: page.value }); recipes.value = reset ? r.list : [...recipes.value, ...r.list]; hasMore.value = r.hasMore; page.value++; failed.value = false } catch { failed.value = true } finally { loading.value = false } }
async function save() { if (!nickname.value.trim()) { uni.showToast({ title: '昵称不能为空', icon: 'none' }); return } saving.value = true; try { await http.patch('/api/users/me', { nickname: nickname.value }); await store.refresh(); uni.showToast({ title: '已保存', icon: 'none' }) } catch {} finally { saving.value = false } }
function go(id) { uni.navigateTo({ url: `/pages/recipe/detail?id=${id}` }) }
function feedback() { uni.navigateTo({ url: '/pages/feedback/index' }) }
function admin() { uni.navigateTo({ url: '/pages/admin/review' }) }
onShow(async () => { if (!requireLogin('/pages/user/index')) return; try { await store.refresh(); nickname.value = store.displayName; await load() } catch {} })
</script>
<style scoped>.user-shell { max-width: 800px; }.nickname { font-size: 24px; font-weight: 600; }.save { margin-top: 15px; }.published { cursor: pointer; }.recipe-name { font-size: 18px; font-weight: 600; }</style>
