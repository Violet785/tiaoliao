<template>
  <view class="card" hover-class="card-hover" @click="$emit('select', restaurant)">
    <view class="glyph" :style="{ background: color }">{{ glyph }}</view>

    <view class="body">
      <view class="name">{{ restaurant.name }}</view>

      <view class="meta">
        <text v-if="restaurant.city" class="meta-item">{{ restaurant.city }}</text>
        <text v-if="restaurant.address" class="meta-item address">{{ restaurant.address }}</text>
      </view>

      <!-- 地标比门牌号好找。用户在商场里看地址是没用的，得知道「几楼、谁旁边」 -->
      <view v-if="restaurant.landmark" class="landmark">{{ restaurant.landmark }}</view>

      <view class="stats">
        <text v-if="restaurant.recipeCount > 0" class="stat strong">
          {{ restaurant.recipeCount }} 个配方
        </text>
        <text v-else class="stat muted">还没有配方</text>
        <text v-if="restaurant.cookCount > 0" class="stat">· {{ restaurant.cookCount }} 人配过</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { categoryGlyph, categoryColor } from '../utils/restaurantMeta.js'

const props = defineProps({
  restaurant: { type: Object, required: true },
})

// 不要用 'tap' 当事件名：uni-app 里 tap 是小程序的原生点击事件，
// 组件上写 @tap 会同时命中自定义 emit 和原生事件，处理函数被调两次，
// 第二次拿到的是事件对象而不是数据。
defineEmits(['select'])

const glyph = computed(() => categoryGlyph(props.restaurant.category))
const color = computed(() => categoryColor(props.restaurant.category))
</script>

<style scoped>
.card {
  display: flex;
  gap: 24rpx;
  padding: 28rpx;
  background: var(--c-card);
  border-radius: var(--radius-lg);
  margin-bottom: var(--gap);
}

.card-hover {
  background: #FAF8F5;
}

.glyph {
  flex-shrink: 0;
  width: 88rpx;
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  font-size: 44rpx;
  color: #fff;
  border-radius: 20rpx;
}

.body {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--c-text);
  line-height: 1.4;
}

.meta {
  margin-top: 10rpx;
  font-size: 25rpx;
  color: var(--c-text-3);
  line-height: 1.5;
}

.meta-item {
  margin-right: 12rpx;
}

/* 地址可能很长，裁掉尾巴比换行好 —— 卡片高度一致，列表看起来才整齐 */
.address {
  display: inline-block;
  max-width: 380rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

/* 用色条代替图标 —— 地标要一眼能扫到，但不能抢店名的视觉重量 */
.landmark {
  margin-top: 8rpx;
  padding-left: 14rpx;
  border-left: 4rpx solid var(--c-accent);
  font-size: 25rpx;
  color: var(--c-accent);
  line-height: 1.5;
}

.stats {
  margin-top: 14rpx;
  font-size: 25rpx;
  color: var(--c-text-2);
}

.stat {
  margin-right: 8rpx;
}

.strong {
  color: var(--c-primary);
  font-weight: 600;
}

.muted {
  color: var(--c-text-3);
}
</style>
