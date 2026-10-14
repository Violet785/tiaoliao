<template>
  <view class="page">
    <!-- 搜索框是个按钮不是输入框：真正搜索在选店页做，
         首页只负责把用户送过去，避免两处维护同一套搜索逻辑 -->
    <view class="search" hover-class="search-hover" @click="goSearch">
      <view class="search-glyph">搜</view>
      <view class="search-ph">搜店名，比如「汉巴味德」</view>
    </view>

    <view class="head">
      <view class="head-left">
        <text class="head-title">去哪家店</text>
        <text v-if="total > 0" class="head-sub">{{ total }} 家</text>
      </view>

      <!-- 「我的」页还没做，登录入口暂时寄在这里 -->
      <view class="me" :class="{ 'me-on': userStore.isLoggedIn }" hover-class="me-hover" @click="onMe">
        <text class="me-glyph">{{ meGlyph }}</text>
        <text class="me-name">{{ meName }}</text>
      </view>
    </view>

    <view v-if="loading" class="loading">加载中…</view>

    <Empty
      v-else-if="failed"
      glyph="断"
      text="没能连上服务器"
      hint="检查一下网络，或者下拉刷新试试"
      action-text="重试"
      @action="load"
    />

    <template v-else>
      <RestaurantCard v-for="s in shops" :key="s.id" :restaurant="s" @select="goShop" />

      <Empty
        v-if="!shops.length"
        glyph="店"
        text="还没有人建过店"
        hint="你要去的那家店没人建？建一家，顺手写个配方"
        action-text="建一家店"
        @action="goCreate"
      />

      <!-- 有数据时也要留建店入口 —— 搜不到的情况比想象中多 -->
      <view v-else class="more" hover-class="more-hover" @click="goCreate">
        <text class="more-glyph">+</text>
        <text>没找到？建一家</text>
      </view>
    </template>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app'
import * as restaurantApi from '../../api/restaurant.js'
import RestaurantCard from '../../components/RestaurantCard.vue'
import Empty from '../../components/Empty.vue'
import { useUserStore } from '../../store/user.js'
import { toast } from '../../utils/feedback.js'

const userStore = useUserStore()

const shops = ref([])
const total = ref(0)
const loading = ref(true)
const failed = ref(false)

// 都用 computed —— 登录/退出后不用手动刷新，store 一变这里就跟着变
const meName = computed(() => (userStore.isLoggedIn ? userStore.displayName : '未登录'))
const meGlyph = computed(() =>
  userStore.isLoggedIn ? (userStore.displayName || '我').slice(0, 1) : '登',
)

async function load() {
  loading.value = true
  failed.value = false
  try {
    const res = await restaurantApi.list({ sort: 'hot', pageSize: 10 })
    shops.value = res.list || []
    total.value = res.total || 0
  } catch {
    // request.js 已经弹过 toast 了，这里只负责把页面切到失败态
    failed.value = true
  } finally {
    loading.value = false
  }
}

onLoad(load)

onPullDownRefresh(async () => {
  await load()
  uni.stopPullDownRefresh()
})

function goSearch() {
  uni.navigateTo({ url: '/pages/restaurant/list' })
}

function goShop(shop) {
  uni.navigateTo({ url: `/pages/restaurant/detail?id=${shop.id}` })
}

function goCreate() {
  uni.navigateTo({ url: '/pages/restaurant/create' })
}

/**
 * 点右上角那个人。
 *
 * 未登录 → 去登录页。
 * 已登录 → 目前只能退出（「我的」页还没做）。
 *   留这一条是刚需：不然登进去就出不来了，想换个账号测都没法测。
 */
function onMe() {
  if (!userStore.isLoggedIn) {
    uni.navigateTo({ url: '/pages/common/login' })
    return
  }
  uni.showActionSheet({
    itemList: ['退出登录'],
    success: async ({ tapIndex }) => {
      if (tapIndex !== 0) return
      await userStore.logout()
      toast('已退出')
    },
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: var(--gap);
  box-sizing: border-box;
}

.search {
  display: flex;
  align-items: center;
  gap: 16rpx;
  height: 88rpx;
  padding: 0 28rpx;
  background: var(--c-card);
  border-radius: 44rpx;
  margin-bottom: 40rpx;
}

.search-hover {
  background: #FAF8F5;
}

.search-glyph {
  flex-shrink: 0;
  width: 44rpx;
  height: 44rpx;
  line-height: 44rpx;
  text-align: center;
  font-size: 24rpx;
  color: var(--c-text-2);
  background: var(--c-bg);
  border-radius: 50%;
}

.search-ph {
  font-size: 28rpx;
  color: var(--c-text-3);
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.head-left {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  min-width: 0;
}

.head-title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--c-text);
}

.head-sub {
  font-size: 25rpx;
  color: var(--c-text-3);
}

/* ── 右上角登录态 ── */

.me {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
  max-width: 260rpx;
  height: 60rpx;
  padding: 0 20rpx 0 10rpx;
  background: var(--c-card);
  border-radius: 30rpx;
}

.me-hover {
  background: #FAF8F5;
}

.me-glyph {
  flex-shrink: 0;
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  font-size: 24rpx;
  color: var(--c-text-2);
  background: var(--c-bg);
  border-radius: 50%;
}

.me-on .me-glyph {
  color: #fff;
  background: var(--c-primary);
}

.me-name {
  font-size: 25rpx;
  color: var(--c-text-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.me-on .me-name {
  color: var(--c-text);
  font-weight: 600;
}

.loading {
  padding: 80rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: var(--c-text-3);
}

.more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  height: 96rpx;
  background: var(--c-card);
  border-radius: var(--radius-lg);
  font-size: 28rpx;
  color: var(--c-text-2);
}

.more-hover {
  background: #FAF8F5;
}

.more-glyph {
  font-size: 34rpx;
  color: var(--c-primary);
}
</style>
