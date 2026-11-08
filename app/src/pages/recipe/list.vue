<template><view><SiteHeader /><view class="shell"><view class="eyebrow">FIND YOUR FLAVOR</view><view class="page-title">找一碗合口味的蘸料</view><view class="muted">从口味、食材和手边的调料开始。</view><RecipeFilters v-model="filters" @change="load(true)" /><view class="row between"><view class="tabs"><button v-for="s in SORTS" :key="s.key" class="tab" :class="{ active: sort === s.key }" @click="sort = s.key; load(true)">{{ s.label }}</button></view><text class="muted">{{ total }} 份配方</text></view><view v-if="loading" class="empty">正在找配方…</view><view v-else-if="failed" class="empty"><view>加载失败</view><button class="ghost" @click="load(true)">重新加载</button></view><view v-else-if="!recipes.length" class="empty">没有符合条件的配方，试试减少筛选条件。</view><view v-else class="grid recipe-grid"><RecipeCard v-for="r in recipes" :key="r.id" :recipe="r" @select="go" /></view><button v-if="hasMore && !loading" class="ghost more" :disabled="loadingMore" @click="load(false)">加载更多</button></view></view></template>
<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import RecipeFilters from '../../components/RecipeFilters.vue'
import RecipeCard from '../../components/RecipeCard.vue'
import { list, SORTS } from '../../api/recipe.js'
const filters = ref({ keyword: '', spice: '', tasteTag: '', foodTag: '', exclude: '' }), sort = ref('hot'), recipes = ref([]), total = ref(0), page = ref(1), hasMore = ref(false), loading = ref(false), loadingMore = ref(false), failed = ref(false)
let requestId = 0
async function load(reset = true) {
  if (!reset && (loading.value || loadingMore.value)) return
  const request = ++requestId, nextPage = reset ? 1 : page.value
  if (reset) loading.value = true; else loadingMore.value = true
  try { const r = await list({ ...filters.value, sort: sort.value, page: nextPage }); if (request !== requestId) return; recipes.value = reset ? r.list : [...recipes.value, ...r.list]; total.value = r.total; hasMore.value = r.hasMore; page.value = nextPage + 1; failed.value = false } catch { if (request === requestId && reset) failed.value = true } finally { if (request === requestId) { loading.value = false; loadingMore.value = false } }
}
function go(r) { uni.navigateTo({ url: `/pages/recipe/detail?id=${r.id}` }) }
onLoad(o => { filters.value.keyword = o?.keyword || ''; load() })
</script>
<style scoped>.more { margin: 24px auto; }</style>
