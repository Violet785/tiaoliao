<template>
  <view class="shop-card" role="button" tabindex="0" @click="$emit('select', restaurant)" @keydown.enter="$emit('select', restaurant)">
    <image v-if="restaurant.cover" class="shop-cover" :src="mediaUrl(restaurant.cover.url)" mode="aspectFill" />
    <view class="row between"><text class="shop-icon">{{ restaurant.name.slice(0, 1) }}</text><text class="badge">{{ restaurant.category }}</text></view>
    <view class="shop-name">{{ restaurant.name }}</view>
    <view class="muted">{{ restaurant.recipeCount }} 份蘸料配方</view>
    <view class="shop-bottom"><text>进去看看</text><text>↗</text></view>
  </view>
</template>
<script setup>
import { mediaUrl } from '../api/community.js'
defineProps({ restaurant: { type: Object, required: true } }); defineEmits(['select'])
</script>
<style scoped>
.shop-card { border: 1px solid #e7ded1; border-radius: 18px; padding: 24px; background: #fffcf8; cursor: pointer; transition: transform .18s, box-shadow .18s; }
.shop-card:hover { transform: translateY(-3px); box-shadow: 0 8px 22px #553c1510; }
.shop-cover { display: block; width: 100%; height: 132px; border-radius: 14px; margin-bottom: 18px; background: #ecdfc9; }
.shop-icon { width: 48px; line-height: 48px; text-align: center; border-radius: 14px; background: #eee1cc; font-size: 25px; font-weight: 600; color: #79512c; }
.shop-name { font-size: 23px; font-weight: 600; margin: 28px 0 5px; }
.shop-bottom { display: flex; justify-content: space-between; border-top: 1px solid #eee5d8; margin-top: 24px; padding-top: 14px; color: #b34b2e; font-size: 13px; }
@media(max-width:760px) { .shop-card { padding: 18px; } .shop-name { font-size: 20px; } }
</style>
