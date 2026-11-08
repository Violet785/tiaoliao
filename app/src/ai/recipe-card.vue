<template>
  <view class="ai-recipe-card">
    <view class="card-heading" role="button" tabindex="0" @click="detail" @keydown.enter="detail"><image v-if="cover" :src="cover" mode="aspectFill" class="card-cover" /><view v-else class="card-mark">蘸</view><view class="card-heading-text"><view class="card-shop">{{ recipe.restaurant.name }}</view><view class="card-title">{{ recipe.title }}</view><view class="card-count">{{ recipe.itemCount }} 样调料</view></view></view>
    <view class="card-ingredients"><view v-for="it in recipe.ingredients" :key="it.condimentId" class="card-ingredient"><view><text>{{ it.name }}</text><view v-if="it.note" class="card-note">{{ it.note }}</view></view><text class="card-amount">{{ it.amount }}</text></view></view>
    <view v-if="recipe.tags?.length" class="card-tags"><text v-for="tag in recipe.tags.slice(0, 5)" :key="tag">{{ tag }}</text></view>
    <view class="card-actions"><button @click="detail">查看配方</button><button class="cook" @click="cook">照着配</button></view>
    <view class="card-votes"><text>尝过后留下喜好</text><VoteButtons :recipe="recipe" @change="$emit('voted', $event)" /></view>
  </view>
</template>
<script setup>
import { computed } from 'vue'
import { mediaUrl } from '../api/community.js'
import VoteButtons from '../components/VoteButtons.vue'
const props = defineProps({ recipe: { type: Object, required: true } })
defineEmits(['voted'])
const cover = computed(() => mediaUrl(props.recipe.images?.[0]?.url || props.recipe.coverIllustration || ''))
function detail() { uni.navigateTo({ url: `/pages/recipe/detail?id=${props.recipe.id}` }) }
function cook() { uni.navigateTo({ url: `/pages/recipe/cook?id=${props.recipe.id}` }) }
</script>
<style scoped>
.ai-recipe-card { border: 1px solid #e7d9c5; border-radius: 14px; background: #fff; overflow: hidden; margin-top: 10px; }.card-heading { display: flex; gap: 12px; align-items: center; padding: 14px; cursor: pointer; }.card-cover,.card-mark { width: 62px; height: 62px; border-radius: 10px; flex-shrink: 0; }.card-mark { line-height: 62px; text-align: center; background: #f1e3cf; color: #a57748; font-size: 28px; }.card-heading-text { min-width: 0; }.card-shop { font-size: 11px; color: #a3764e; }.card-title { font-size: 16px; font-weight: 700; color: #3c2d20; overflow-wrap: anywhere; line-height: 1.5; }.card-count { color: #9c8b79; font-size: 11px; }.card-ingredients { padding: 0 14px; }.card-ingredient { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 9px 0; font-size: 12px; border-top: 1px solid #f2e9dd; color: #685440; }.card-amount { flex-shrink: 0; color: #ad5938; }.card-note { font-size: 10px; color: #a08d78; line-height: 1.5; margin-top: 2px; }.card-tags { display: flex; flex-wrap: wrap; gap: 5px; padding: 8px 14px; }.card-tags text { font-size: 10px; color: #8e7355; background: #f6eee2; border-radius: 12px; padding: 2px 7px; }.card-actions { display: flex; gap: 8px; padding: 10px 14px; }.card-actions button { flex: 1; margin: 0; padding: 0 12px; line-height: 36px; font-size: 12px; border: 1px solid #e4d4bf; border-radius: 8px; background: #fffcf7; color: #8b6442; }.card-actions button::after { border: 0; }.card-actions .cook { background: #bf472d; border-color: #bf472d; color: #fff; }.card-votes { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 8px 12px 12px; }.card-votes>text { font-size: 10px; color: #a18b72; }
</style>
