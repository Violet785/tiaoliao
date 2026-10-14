<template>
  <view class="card" hover-class="card-hover" @click="$emit('select', recipe)">
    <view class="head">
      <view class="title">{{ recipe.title }}</view>
      <view class="spicy" :style="{ color: spicy.color, background: spicy.bg }">{{ spicy.label }}</view>
    </view>

    <view v-if="recipe.description" class="desc">{{ recipe.description }}</view>

    <!-- 服务端拼好的，取用量最高的 3 样。两端都不用再写这段逻辑 -->
    <view v-if="recipe.amountSummary" class="amounts">{{ recipe.amountSummary }}</view>

    <view class="foot">
      <view class="who">
        <text class="author">{{ recipe.author?.nickname || '匿名' }}</text>
        <text v-if="showRestaurant && recipe.restaurant" class="shop">· {{ recipe.restaurant.name }}</text>
      </view>

      <view class="signals">
        <text v-if="recipe.ratingCount > 0" class="rating">
          {{ recipe.ratingAvg.toFixed(1) }}<text class="rating-unit">分</text>
        </text>
        <text v-else class="no-rating">暂无评分</text>
        <text v-if="recipe.cookCount > 0" class="cooked">· {{ recipe.cookCount }} 人配过</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  recipe: { type: Object, required: true },
  /** 在店铺页里就不用重复显示店名了 */
  showRestaurant: { type: Boolean, default: true },
})

// 事件名避开 'tap' —— 那是小程序的原生点击事件名，会和处理函数撞车
defineEmits(['select'])

/**
 * 辣度档位。
 *
 * 用服务端算好的 spicyScore（0–100，按辣椒类调料的用量加权），
 * 不在前端重新猜 —— 前端拿不到调料的辣度权重。
 */
const SPICY_LEVELS = [
  { max: 0, label: '不辣', color: '#A89E93', bg: '#F2EEE9' },
  { max: 25, label: '微辣', color: '#B4531F', bg: '#FBF0E6' },
  { max: 60, label: '中辣', color: '#C8452E', bg: '#FAEAE7' },
  { max: 100, label: '重辣', color: '#FFFFFF', bg: '#C8452E' },
]

const spicy = computed(() => {
  const n = Number(props.recipe.spicyScore) || 0
  return SPICY_LEVELS.find((l) => n <= l.max) || SPICY_LEVELS[SPICY_LEVELS.length - 1]
})
</script>

<style scoped>
.card {
  padding: 28rpx;
  background: var(--c-card);
  border-radius: var(--radius-lg);
  margin-bottom: var(--gap);
}

.card-hover {
  background: #FAF8F5;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.title {
  flex: 1;
  font-size: 32rpx;
  font-weight: 600;
  color: var(--c-text);
  line-height: 1.4;
}

.spicy {
  flex-shrink: 0;
  font-size: 22rpx;
  padding: 4rpx 14rpx;
  border-radius: 20rpx;
  line-height: 1.6;
}

.desc {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: var(--c-text-2);
  line-height: 1.6;
  /* 两行够了，详情页有全文 */
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.amounts {
  margin-top: 18rpx;
  padding: 14rpx 20rpx;
  background: var(--c-bg);
  border-radius: var(--radius);
  font-size: 26rpx;
  color: var(--c-text-2);
  line-height: 1.5;
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 20rpx;
  font-size: 24rpx;
  color: var(--c-text-3);
}

.who {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.author {
  color: var(--c-text-2);
}

.shop {
  margin-left: 8rpx;
}

.signals {
  flex-shrink: 0;
}

.rating {
  color: var(--c-primary);
  font-size: 30rpx;
  font-weight: 600;
}

.rating-unit {
  font-size: 22rpx;
  font-weight: 400;
  margin-left: 2rpx;
}

.no-rating {
  color: var(--c-text-3);
}

.cooked {
  margin-left: 8rpx;
}
</style>
