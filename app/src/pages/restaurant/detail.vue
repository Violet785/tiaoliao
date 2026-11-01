<template><view><SiteHeader /><view class="shell"><template v-if="shop"><view class="eyebrow">GOOD DIPS, SHARED HERE</view><view class="row between"><view><view class="page-title">{{ shop.name }}</view><view class="muted">{{ shop.category }} · {{ shop.recipeCount }} 份蘸料配方</view></view><text class="shop-seal">{{ shop.name.slice(0, 1) }}</text></view><view v-if="shop.note" class="shop-note">{{ shop.note }}</view><view class="tabs"><button v-for="s in SORTS" :key="s.key" class="tab" :class="{ active: sort === s.key }" @click="changeSort(s.key)">{{ s.label }}</button></view><view class="grid recipe-grid"><RecipeCard v-for="r in recipes" :key="r.id" :recipe="r" :show-restaurant="false" @select="go" /></view><view v-if="!recipes.length" class="empty">{{ loading ? '加载中…' : failed ? '加载失败，请刷新重试' : '还没有蘸料，欢迎通过「反馈登记」分享你的配方。' }}</view><button v-if="hasMore" class="ghost more" :disabled="loading" @click="load(false)">加载更多</button></template><view v-else class="empty">{{ loading ? '加载中…' : '店铺不存在或暂时无法加载' }}</view></view></view></template>
<script setup>
import { ref } from 'vue'
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import RecipeCard from '../../components/RecipeCard.vue'
import * as api from '../../api/restaurant.js'
import { SORTS } from '../../api/recipe.js'
const id = ref(0), shop = ref(null), recipes = ref([]), sort = ref('hot'), page = ref(1), hasMore = ref(false), loading = ref(false), failed = ref(false)
async function load(reset = true) {
  if (!id.value || loading.value) return
  loading.value = true; if (reset) page.value = 1
  try { const detail = await api.detail(id.value); shop.value = detail.restaurant; const r = await api.recipes(shop.value.id, { page: page.value, sort: sort.value }); recipes.value = reset ? r.list : [...recipes.value, ...r.list]; hasMore.value = r.hasMore; page.value++; failed.value = false } catch { failed.value = true } finally { loading.value = false }
}
function changeSort(s) { if (loading.value || sort.value === s) return; sort.value = s; load() }
function go(r) { uni.navigateTo({ url: `/pages/recipe/detail?id=${r.id}` }) }
onLoad(o => { id.value = Number(o?.id); load() }); onShow(() => { if (shop.value) load() }); onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh() })
</script>
<style scoped>.shop-seal { width: 70px; line-height: 70px; text-align: center; background: #eadac2; border-radius: 20px; color: #926235; font-size: 35px; }.shop-note { margin-top: 25px; color: #8b7256; padding: 16px 20px; background: #eee6d8; border-radius: 12px; font-size: 14px; }.more { margin: 25px auto; }</style>
