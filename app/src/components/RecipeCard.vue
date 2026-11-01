<template>
  <view class="recipe-card">
    <view class="recipe-link" role="button" tabindex="0" @click="$emit('select', recipe)" @keydown.enter="$emit('select', recipe)">
      <image v-if="recipe.images?.length" class="cover" :src="mediaUrl(recipe.images[0].url)" mode="aspectFill" />
      <view v-else class="cover placeholder"><text>蘸</text><text class="placeholder-note">好味道，慢慢配</text></view>
      <view class="content"><view class="recipe-title">{{ recipe.title }}</view><view class="description">{{ recipe.description || recipe.amountSummary }}</view><view class="ingredients">{{ recipe.amountSummary }}</view><view class="muted">{{ recipe.author?.nickname }}<text v-if="showRestaurant"> · {{ recipe.restaurant?.name }}</text></view></view>
    </view>
    <view class="vote-row"><text class="muted">尝过后留个评价</text><VoteButtons :recipe="recipe" /></view>
  </view>
</template>
<script setup>
import VoteButtons from './VoteButtons.vue'
import { mediaUrl } from '../api/community.js'
defineProps({ recipe: { type: Object, required: true }, showRestaurant: { type: Boolean, default: true } }); defineEmits(['select'])
</script>
<style scoped>
.recipe-card { background: #fff; border: 1px solid #e7ded3; border-radius: 18px; overflow: hidden; }
.recipe-link { cursor: pointer; }
.cover { display: block; width: 100%; height: 180px; background: #ecdfc9; }
.placeholder { display: flex; flex-direction: column; justify-content: center; align-items: center; color: #a37347; font-size: 55px; background: radial-gradient(ellipse at 50% 80%, #d4b38a 0%, #eee1cd 50%, #f6ecdd 100%); }
.placeholder-note { font-size: 11px; letter-spacing: 3px; margin-top: 4px; }
.content { padding: 20px; }
.recipe-title { font-size: 20px; font-weight: 600; }
.description { color: #867768; font-size: 14px; margin-top: 9px; height: 44px; overflow: hidden; }
.ingredients { font-size: 12px; color: #a16d3e; margin: 12px 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.vote-row { padding: 13px 18px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px solid #f1e9df; }
.vote-row>.muted { font-size: 11px; }
</style>
