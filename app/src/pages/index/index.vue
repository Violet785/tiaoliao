<template>
  <view><SiteHeader /><view class="shell">
    <view class="home-hero"><view class="eyebrow">DIP INTO SOMETHING GOOD</view><view class="page-title">找到店名，配一碗喜欢的蘸料。</view><view class="muted">大家分享的好味道，都在这里。</view><view class="row search-row"><input v-model="keyword" class="search-input" placeholder="搜索店名，例如 牛NEW、龍哥" confirm-type="search" @confirm="search" /><button class="btn" @click="search">找店铺</button></view></view>
    <view class="panel row between"><view><view class="section-title">还没想好吃什么口味？</view><view class="muted">按辣度、口味和食材找配方，也能排除不喜欢的调料。</view></view><button class="ghost" @click="goRecipes">按口味找配方 ↗</button></view>
    <view class="row between section-title"><text>选一家店，开始蘸</text><text class="muted">{{ total }} 家店铺</text></view>
    <view v-if="loading" class="empty">正在找好味道…</view>
    <view v-else-if="failed" class="empty"><view>加载失败，请稍后重试</view><button class="ghost" @click="load(true)">重新加载</button></view>
    <view v-else-if="!shops.length" class="empty">暂无店铺，可通过右上角「反馈登记」提交店名。</view>
    <view v-else class="grid"><RestaurantCard v-for="shop in shops" :key="shop.id" :restaurant="shop" @select="goShop" /></view>
    <button v-if="hasMore" class="ghost load-more" :disabled="loadingMore" @click="load(false)">加载更多</button>
  </view>
  <AiChat />
  </view>
</template>
<script setup>
import { ref } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import RestaurantCard from '../../components/RestaurantCard.vue'
import AiChat from '../../ai/chat-widget.vue'
import * as api from '../../api/restaurant.js'
const shops = ref([]), total = ref(0), keyword = ref(''), loading = ref(true), failed = ref(false), page = ref(1), hasMore = ref(false), loadingMore = ref(false)
async function load(reset = true) {
  if (loadingMore.value) return
  loadingMore.value = true; if (reset) { page.value = 1; loading.value = true }
  try { const r = await api.list({ page: page.value, pageSize: 12 }); shops.value = reset ? r.list : [...shops.value, ...r.list]; total.value = r.total; hasMore.value = r.hasMore; page.value++; failed.value = false } catch { failed.value = true } finally { loading.value = false; loadingMore.value = false }
}
function search() { uni.navigateTo({ url: `/pages/restaurant/list?keyword=${encodeURIComponent(keyword.value)}` }) }
function goShop(shop) { uni.navigateTo({ url: `/pages/restaurant/detail?id=${shop.id}` }) }
function goRecipes() { uni.navigateTo({ url: '/pages/recipe/list' }) }
onLoad(() => load()); onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh() })
</script>
<style scoped>
.home-hero { padding: 34px 0 30px; border-bottom: 1px solid #e5dacc; }
.home-hero .page-title { max-width: 670px; font-size: 42px; letter-spacing: -1px; margin: 16px 0; }
.search-row { margin-top: 28px; max-width: 650px; }
.search-input { background: #fff; }
.load-more { margin: 26px auto; }
@media(max-width:760px) { .home-hero { padding: 14px 0 26px; } .home-hero .page-title { font-size: 32px; max-width: 330px; line-height: 1.4; } .search-row { gap: 8px; } .search-row .btn { padding: 0 14px; } .search-input { font-size: 13px; } }
</style>
