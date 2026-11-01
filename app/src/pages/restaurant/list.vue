<template><view><SiteHeader /><view class="shell"><view class="eyebrow">FIND YOUR FAVORITE</view><view class="page-title">找店铺</view><view class="row"><input v-model="keyword" class="search-input" placeholder="输入店名" confirm-type="search" @confirm="load(true)" /><button class="btn" @click="load(true)">搜索</button></view><view class="section-title">{{ total }} 个结果</view><view class="grid"><RestaurantCard v-for="s in shops" :key="s.id" :restaurant="s" @select="go" /></view><view v-if="!shops.length" class="empty">{{ loading ? '搜索中…' : failed ? '搜索失败，请重试' : '没有找到这个店名，可在右上角「反馈登记」提交。' }}</view><button v-if="hasMore" class="ghost" :disabled="loading" @click="load(false)">加载更多</button></view></view></template>
<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import RestaurantCard from '../../components/RestaurantCard.vue'
import * as api from '../../api/restaurant.js'
const keyword = ref(''), shops = ref([]), total = ref(0), hasMore = ref(false), page = ref(1), loading = ref(false), failed = ref(false)
async function load(reset) { if (loading.value) return; loading.value = true; if (reset) page.value = 1; try { const r = await api.list({ keyword: keyword.value, page: page.value }); shops.value = reset ? r.list : [...shops.value, ...r.list]; total.value = r.total; hasMore.value = r.hasMore; page.value++; failed.value = false } catch { failed.value = true } finally { loading.value = false } }
function go(s) { uni.navigateTo({ url: `/pages/restaurant/detail?id=${s.id}` }) }
onLoad(o => { keyword.value = o?.keyword || ''; load(true) })
</script>
