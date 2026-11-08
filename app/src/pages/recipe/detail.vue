<template><view><SiteHeader /><view class="shell recipe-detail">
  <template v-if="full">
    <view class="eyebrow" role="button" @click="shop">{{ full.restaurant.name }}</view><view class="page-title">{{ full.recipe.title }}</view>
    <view class="row between"><text class="muted">{{ full.author.nickname }} 分享 · {{ full.recipe.servingNote || '一碗自己的好味道' }}</text><VoteButtons :recipe="full.recipe" /></view>
    <view class="row interaction-row"><button class="ghost" :class="{ collected: full.isFavorite }" :disabled="favoriteBusy" @click="toggleFavorite">{{ full.isFavorite ? '已收藏 · 点击取消' : '收藏这碗' }}（{{ full.recipe.favoriteCount }}）</button><text class="muted">{{ full.recipe.ratingCount ? `${full.recipe.ratingAvg} 分 · ${full.recipe.ratingCount} 人评价` : '还没有人评分' }}</text></view>
    <view v-if="full.recipe.images.length" class="gallery"><image v-for="img in full.recipe.images" :key="img.id" :src="mediaUrl(img.url)" mode="aspectFill" class="gallery-image" @click="preview(img.url)" /></view><view v-else-if="full.recipe.coverIllustration" class="reference-cover"><image :src="full.recipe.coverIllustration" mode="aspectFit" class="illustration" /></view>
    <button class="btn cook-cta" @click="startCook">开始照着配 · 一步一步来</button><view v-if="full.recipe.description" class="panel description">{{ full.recipe.description }}</view>
    <view class="section-title">这碗蘸料怎么配</view><view class="panel ingredients"><view v-for="it in full.items" :key="it.id" class="ingredient"><view><text class="ingredient-name">{{ it.condimentName }}</text><view v-if="it.amountNote" class="muted">{{ it.amountNote }}</view></view><text class="amount">{{ it.amountLabel }}<text v-if="it.amountLevel > 0"> · {{ it.anchorText }}</text></text></view></view>
    <view v-if="allTags.length" class="row"><text v-for="tag in allTags" :key="tag.id" class="badge">{{ tag.name }}</text></view><button v-if="full.isAuthor" class="ghost edit" @click="edit">修改配方（需审核）</button><view class="muted allergy">如对某种食材过敏，请先确认店内调料成分。</view>
    <view id="rating-section"><RecipeRating :recipe-id="id" :existing="full.myRating" @saved="ratingSaved" /></view>
    <view class="section-title">大家的评价（{{ ratingTotal }}）</view><view v-for="r in reviews" :key="r.id" class="panel review"><view class="row between"><text>{{ r.user.nickname }}</text><text class="score">{{ '★'.repeat(r.score) }}<text class="dim">{{ '★'.repeat(5-r.score) }}</text></text></view><view v-if="r.feedbackTags?.length" class="row review-tags"><text v-for="tag in r.feedbackTags" :key="tag" class="badge">{{ tag }}</text></view><view v-if="r.content" class="review-text">{{ r.content }}</view><view class="muted review-date">{{ new Date(r.updatedAt).toLocaleDateString('zh-CN') }}</view></view>
    <view v-if="ratingsFailed" class="empty"><view>评价加载失败</view><button class="ghost" @click="loadRatings(true)">重试</button></view><view v-else-if="!reviews.length" class="muted">{{ ratingsLoading ? '正在加载评价…' : '还没有评价，尝过以后来说说吧。' }}</view><button v-if="ratingsMore" class="ghost" :disabled="ratingsLoading" @click="loadRatings(false)">更多评价</button>
    <RecipeShare :key="full.recipe.updatedAt" :full="full" />
  </template><view v-else class="empty"><view>{{ loading ? '加载中…' : '蘸料不存在或暂时无法加载' }}</view><button v-if="!loading" class="ghost" @click="load">重新加载</button></view>
</view><AiChat v-if="full" :restaurant="full.restaurant" /></view></template>
<script setup>
import { ref, computed } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import AiChat from '../../ai/chat-widget.vue'
import VoteButtons from '../../components/VoteButtons.vue'
import RecipeRating from '../../components/RecipeRating.vue'
import RecipeShare from '../../components/RecipeShare.vue'
import * as api from '../../api/recipe.js'
import { mediaUrl } from '../../api/community.js'
import { requireLogin } from '../../store/user.js'
const full = ref(null), loading = ref(true), id = ref(0), favoriteBusy = ref(false), reviews = ref([]), ratingTotal = ref(0), ratingsMore = ref(false), ratingsPage = ref(1), ratingsLoading = ref(false), ratingsFailed = ref(false)
const allTags = computed(() => full.value ? Object.values(full.value.tags).flat() : [])
let focusReview = false
async function load() { loading.value = true; try { full.value = await api.detail(id.value); if (focusReview) { focusReview = false; setTimeout(() => uni.pageScrollTo({ selector: '#rating-section', duration: 200 }), 200) } } catch {} finally { loading.value = false } }
async function loadRatings(reset = true) { if (ratingsLoading.value) return; ratingsLoading.value = true; try { const p = reset ? 1 : ratingsPage.value; const r = await api.ratings(id.value, { page: p }); reviews.value = reset ? r.list : [...reviews.value, ...r.list]; ratingTotal.value = r.total; ratingsMore.value = r.hasMore; ratingsPage.value = p + 1; ratingsFailed.value = false } catch { ratingsFailed.value = true } finally { ratingsLoading.value = false } }
async function ratingSaved() { await Promise.all([load(), loadRatings(true)]) }
async function toggleFavorite() { if (favoriteBusy.value || !requireLogin(`/pages/recipe/detail?id=${id.value}`)) return; favoriteBusy.value = true; try { const r = await (full.value.isFavorite ? api.unfavorite(id.value) : api.favorite(id.value)); full.value.isFavorite = r.favorited; full.value.recipe.favoriteCount = r.favoriteCount } catch {} finally { favoriteBusy.value = false } }
function shop() { uni.navigateTo({ url: `/pages/restaurant/detail?id=${full.value.restaurant.id}` }) }
function preview(url) { uni.previewImage({ current: mediaUrl(url), urls: full.value.recipe.images.map(i => mediaUrl(i.url)) }) }
function startCook() { uni.navigateTo({ url: `/pages/recipe/cook?id=${id.value}` }) }
function edit() { uni.navigateTo({ url: `/pages/feedback/index?kind=recipe&recipeId=${id.value}` }) }
onLoad(o => { id.value = Number(o?.id); focusReview = o?.review === '1'; load(); loadRatings() }); onShow(() => { if (full.value) { load(); loadRatings() } })
</script>
<style scoped>
.recipe-detail { max-width: 900px; }.gallery { display: flex; overflow-x: auto; gap: 14px; margin-top: 28px; }.gallery-image { flex-shrink: 0; width: 320px; height: 240px; border-radius: 16px; }.description { line-height: 1.9; font-size: 16px; white-space: pre-wrap; }.ingredient { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 17px 0; border-bottom: 1px solid #eee7df; }.ingredient:last-child { border: 0; }.ingredients { padding-top: 8px; padding-bottom: 8px; }.ingredient-name { font-weight: 600; }.amount { color: #af6841; font-size: 14px; text-align: right; }.allergy { margin-top: 30px; font-size: 12px; }.edit { margin-top: 25px; }.cook-cta { margin: 22px 0 6px; width: 100%; height: 52px; line-height: 52px; font-size: 16px; border-radius: 14px; }.interaction-row { margin-top: 20px; }.collected { background: #f3e3ce; color: #8e4e25; }.reference-notice { background: #f4e8d6; padding: 14px 18px; border-radius: 12px; margin: 18px 0; color: #975530; font-size: 14px; }.reference-notice .muted { font-size: 12px; margin-top: 5px; }.reference-cover { text-align: center; color: #927354; font-size: 12px; margin-top: 20px; }.illustration { display: block; width: 100%; height: 260px; border-radius: 16px; background: #eee2d0; }.review { margin: 12px 0; }.review-tags { margin-top: 10px; }.review-text { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 12px; }.review-date { font-size: 11px; margin-top: 10px; }.score { color: #c78920; }.dim { color: #dfd4c5; }
</style>
