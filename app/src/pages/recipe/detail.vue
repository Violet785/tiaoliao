<template><view><SiteHeader /><view class="shell recipe-detail"><template v-if="full"><view class="eyebrow" @click="shop">{{ full.restaurant.name }}</view><view class="page-title">{{ full.recipe.title }}</view><view class="row between"><text class="muted">{{ full.author.nickname }} 分享 · {{ full.recipe.servingNote || '一碗自己的好味道' }}</text><VoteButtons :recipe="full.recipe" /></view><view v-if="full.recipe.images.length" class="gallery"><image v-for="img in full.recipe.images" :key="img.id" :src="mediaUrl(img.url)" mode="aspectFill" class="gallery-image" @click="preview(img.url)" /></view><view v-if="full.recipe.description" class="panel description">{{ full.recipe.description }}</view><view class="section-title">这碗蘸料怎么配</view><view class="panel ingredients"><view v-for="it in full.items" :key="it.id" class="ingredient"><view><text class="ingredient-name">{{ it.condimentName }}</text><view v-if="it.amountNote" class="muted">{{ it.amountNote }}</view></view><text class="amount">{{ it.amountLabel }}<text v-if="it.amountLevel > 0"> · {{ it.anchorText }}</text></text></view></view><view v-if="allTags.length" class="row"><text v-for="tag in allTags" :key="tag.id" class="badge">{{ tag.name }}</text></view><button v-if="full.isAuthor" class="ghost edit" @click="edit">修改配方（需审核）</button><view class="muted allergy">如对某种食材过敏，请先确认店内调料成分。</view></template><view v-else class="empty">{{ loading ? '加载中…' : '蘸料不存在或暂时无法加载' }}</view></view></view></template>
<script setup>
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import VoteButtons from '../../components/VoteButtons.vue'
import { detail } from '../../api/recipe.js'
import { mediaUrl } from '../../api/community.js'
const full = ref(null), loading = ref(true), id = ref(0)
const allTags = computed(() => full.value ? Object.values(full.value.tags).flat() : [])
async function load() { loading.value = true; try { full.value = await detail(id.value) } catch {} finally { loading.value = false } }
function shop() { uni.navigateTo({ url: `/pages/restaurant/detail?id=${full.value.restaurant.id}` }) }
function preview(url) { uni.previewImage({ current: mediaUrl(url), urls: full.value.recipe.images.map(i => mediaUrl(i.url)) }) }
function edit() { uni.navigateTo({ url: `/pages/feedback/index?kind=recipe&recipeId=${id.value}` }) }
onLoad(o => { id.value = Number(o?.id); load() }); onShow(() => { if (full.value) load() })
</script>
<style scoped>.recipe-detail { max-width: 900px; }.gallery { display: flex; overflow-x: auto; gap: 14px; margin-top: 28px; }.gallery-image { flex-shrink: 0; width: 320px; height: 240px; border-radius: 16px; }.description { line-height: 1.9; font-size: 16px; white-space: pre-wrap; }.ingredient { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 17px 0; border-bottom: 1px solid #eee7df; }.ingredient:last-child { border: 0; }.ingredients { padding-top: 8px; padding-bottom: 8px; }.ingredient-name { font-weight: 600; }.amount { color: #af6841; font-size: 14px; text-align: right; }.allergy { margin-top: 30px; font-size: 12px; }.edit { margin-top: 25px; }</style>
