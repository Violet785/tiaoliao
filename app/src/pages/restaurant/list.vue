<template>
  <view class="page">
    <view class="bar">
      <view class="search">
        <view class="search-glyph">搜</view>
        <input
          class="search-input"
          v-model="keyword"
          type="text"
          confirm-type="search"
          placeholder="店名、地址都行"
          placeholder-class="search-ph"
          @input="onInput"
          @confirm="reload"
        />
        <view v-if="keyword" class="clear" hover-class="clear-hover" @click="clearKeyword">清</view>
      </view>
      <view class="create" hover-class="create-hover" @click="goCreate">建店</view>
    </view>

    <view class="tabs">
      <view
        v-for="s in SORTS"
        :key="s.key"
        class="tab"
        :class="{ 'tab-on': s.key === sort }"
        @click="switchSort(s.key)"
      >
        {{ s.label }}
      </view>
    </view>

    <view class="body">
      <view v-if="loading && !shops.length" class="hint">加载中…</view>

      <RestaurantCard v-for="s in shops" :key="s.id" :restaurant="s" @select="goDetail" />

      <Empty
        v-if="!loading && !shops.length && keyword"
        glyph="无"
        :text="'没搜到「' + keyword + '」'"
        hint="也可能它在这儿的名字不太一样，比如带不带「店」字"
        action-text="建一家"
        @action="goCreate"
      />

      <Empty
        v-else-if="!loading && !shops.length"
        glyph="店"
        text="还没有人建过店"
        hint="你来开个头"
        action-text="建一家店"
        @action="goCreate"
      />

      <view v-if="shops.length && !hasMore" class="end">— 就这些了 —</view>
      <view v-if="loadingMore" class="hint">加载中…</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onReachBottom } from '@dcloudio/uni-app'
import * as restaurantApi from '../../api/restaurant.js'
import RestaurantCard from '../../components/RestaurantCard.vue'
import Empty from '../../components/Empty.vue'

const SORTS = [
  { key: 'hot', label: '最热' },
  { key: 'new', label: '最新' },
]

const keyword = ref('')
const sort = ref('hot')
const shops = ref([])
const page = ref(1)
const hasMore = ref(true)
const loading = ref(false)
const loadingMore = ref(false)

// 输入时不要每敲一个字就请求一次。350ms 是打字停顿和响应速度的折中。
let debounceTimer = null

async function load({ reset = false } = {}) {
  if (loading.value || loadingMore.value) return
  if (reset) {
    page.value = 1
    hasMore.value = true
  }
  if (!hasMore.value) return

  const first = page.value === 1
  if (first) loading.value = true
  else loadingMore.value = true

  try {
    const res = await restaurantApi.list({
      keyword: keyword.value.trim(),
      sort: sort.value,
      page: page.value,
    })
    shops.value = first ? res.list : [...shops.value, ...res.list]
    hasMore.value = res.hasMore
    page.value += 1
  } catch {
    // toast 已经弹过，保持现状让用户重试
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function reload() {
  load({ reset: true })
}

function onInput() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(reload, 350)
}

function clearKeyword() {
  keyword.value = ''
  reload()
}

function switchSort(key) {
  if (key === sort.value) return
  sort.value = key
  reload()
}

onLoad(() => load({ reset: true }))

onReachBottom(() => load())

function goDetail(shop) {
  uni.navigateTo({ url: `/pages/restaurant/detail?id=${shop.id}` })
}

/** 把搜索词带过去 —— 搜不到才建店，店名十有八九就是刚搜的那个 */
function goCreate() {
  const q = keyword.value.trim()
  uni.navigateTo({ url: `/pages/restaurant/create${q ? `?name=${encodeURIComponent(q)}` : ''}` })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
}

/* 搜索框吸顶：翻到列表下面想换个词再搜时，不用先滚回顶部 */
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: var(--gap);
  padding-bottom: 20rpx;
  background: var(--c-bg);
}

.search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14rpx;
  height: 80rpx;
  padding: 0 24rpx;
  background: var(--c-card);
  border-radius: 40rpx;
}

.search-glyph {
  flex-shrink: 0;
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  font-size: 22rpx;
  color: var(--c-text-2);
  background: var(--c-bg);
  border-radius: 50%;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 80rpx;
  font-size: 28rpx;
  color: var(--c-text);
}

.search-ph {
  color: var(--c-text-3);
}

.clear {
  flex-shrink: 0;
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  font-size: 22rpx;
  color: var(--c-text-2);
  background: var(--c-bg);
  border-radius: 50%;
}

.clear-hover {
  background: var(--c-line);
}

.create {
  flex-shrink: 0;
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 32rpx;
  font-size: 28rpx;
  color: #fff;
  background: var(--c-primary);
  border-radius: 40rpx;
}

.create-hover {
  opacity: 0.85;
}

.tabs {
  display: flex;
  gap: 12rpx;
  padding: 0 var(--gap) 20rpx;
  background: var(--c-bg);
}

.tab {
  padding: 10rpx 28rpx;
  font-size: 26rpx;
  color: var(--c-text-2);
  background: var(--c-card);
  border-radius: 30rpx;
}

.tab-on {
  color: #fff;
  background: var(--c-primary);
}

.body {
  padding: 0 var(--gap) var(--gap);
}

.hint {
  padding: 60rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: var(--c-text-3);
}

.end {
  padding: 40rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: var(--c-text-3);
}
</style>
