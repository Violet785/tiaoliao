<template>
  <view class="empty">
    <view class="glyph">{{ glyph }}</view>
    <view class="text">{{ text }}</view>
    <view v-if="hint" class="hint">{{ hint }}</view>
    <button v-if="actionText" class="action" hover-class="action-hover" @click="$emit('action')">
      {{ actionText }}
    </button>
  </view>
</template>

<script setup>
/**
 * 空状态。
 *
 * 用单汉字而不是插画或 emoji：一个汉字在微信、iOS Safari、Chrome 上长得完全一样，
 * 而 emoji 在不同版本的微信里字形差很多，插画则要额外塞图片资源进主包。
 */
defineProps({
  glyph: { type: String, default: '空' },
  text: { type: String, required: true },
  hint: { type: String, default: '' },
  actionText: { type: String, default: '' },
})

defineEmits(['action'])
</script>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 96rpx 48rpx;
}

.glyph {
  width: 128rpx;
  height: 128rpx;
  line-height: 128rpx;
  text-align: center;
  font-size: 64rpx;
  color: var(--c-text-3);
  background: var(--c-line);
  border-radius: 50%;
  margin-bottom: 32rpx;
}

.text {
  font-size: 32rpx;
  color: var(--c-text-2);
  text-align: center;
  line-height: 1.6;
}

.hint {
  font-size: 26rpx;
  color: var(--c-text-3);
  text-align: center;
  line-height: 1.6;
  margin-top: 12rpx;
}

.action {
  margin-top: 40rpx;
  min-width: 320rpx;
  height: 84rpx;
  line-height: 84rpx;
  font-size: 30rpx;
  color: #fff;
  background: var(--c-primary);
  border-radius: 42rpx;
  padding: 0 48rpx;
}

.action::after {
  border: none;
}

.action-hover {
  opacity: 0.85;
}
</style>
