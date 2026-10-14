<template>
  <view class="page">
    <view v-if="loading" class="loading">加载中…</view>

    <template v-else-if="shop">
      <!-- 店铺信息卡 -->
      <view class="hero">
        <view class="hero-top">
          <view class="glyph" :style="{ background: glyphColor }">{{ glyphText }}</view>
          <view class="hero-name">{{ shop.name }}</view>
        </view>

        <view v-if="shop.city || shop.address" class="line">
          <text v-if="shop.city" class="line-city">{{ shop.city }}</text>
          <text v-if="shop.address">{{ shop.address }}</text>
        </view>

        <view v-if="shop.landmark" class="landmark">{{ shop.landmark }}</view>

        <view class="counts">
          <text class="count-strong">{{ shop.recipeCount }} 个配方</text>
          <text v-if="shop.cookCount > 0" class="count">· {{ shop.cookCount }} 人配过</text>
        </view>
      </view>

      <!-- 这家店调料台的特殊之处。用户在这里踩过的坑，比配方本身还值钱 -->
      <view v-if="shop.note" class="note">
        <view class="note-label">这家店要注意</view>
        <view class="note-text">{{ shop.note }}</view>
      </view>

      <!-- 排序 -->
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

      <view v-if="recipesLoading && !recipes.length" class="loading">加载配方…</view>

      <RecipeCard v-for="r in recipes" :key="r.id" :recipe="r" :show-restaurant="false" @select="goRecipe" />

      <Empty
        v-if="!recipesLoading && !recipes.length"
        glyph="料"
        text="这家店还没人写过配方"
        hint="你是第一个来的？回去后把你那碗写下来，下一个人就不用瞎配了"
      />

      <view v-if="recipes.length && !hasMore" class="end">— 就这些了 —</view>
    </template>

    <Empty
      v-else
      glyph="断"
      text="没找到这家店"
      hint="它可能已经被删掉了"
      action-text="回首页"
      @action="goHome"
    />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onLoad, onReachBottom, onPullDownRefresh } from '@dcloudio/uni-app'
import * as restaurantApi from '../../api/restaurant.js'
import { SORTS } from '../../api/recipe.js'
import { categoryGlyph, categoryColor } from '../../utils/restaurantMeta.js'
import RecipeCard from '../../components/RecipeCard.vue'
import Empty from '../../components/Empty.vue'

const shopId = ref(null)
const shop = ref(null)
const recipes = ref([])
const sort = ref('hot')

const loading = ref(true)
const recipesLoading = ref(false)
const page = ref(1)
const hasMore = ref(false)

const glyphText = computed(() => categoryGlyph(shop.value?.category))
const glyphColor = computed(() => categoryColor(shop.value?.category))

async function loadRecipes({ reset = false } = {}) {
  if (recipesLoading.value) return
  if (reset) {
    page.value = 1
    hasMore.value = true
  }
  if (!hasMore.value) return

  recipesLoading.value = true
  try {
    const res = await restaurantApi.recipes(shopId.value, { sort: sort.value, page: page.value })
    recipes.value = reset ? res.list : [...recipes.value, ...res.list]
    hasMore.value = res.hasMore
    page.value += 1
  } catch {
    // toast 已经弹过了，这里保持列表原样，用户可以重试
  } finally {
    recipesLoading.value = false
  }
}

onLoad(async (options) => {
  shopId.value = Number(options?.id)
  if (!shopId.value) {
    loading.value = false
    return
  }

  try {
    const res = await restaurantApi.detail(shopId.value)
    shop.value = res.restaurant
    uni.setNavigationBarTitle({ title: res.restaurant.name })
  } catch {
    shop.value = null
  } finally {
    loading.value = false
  }

  loadRecipes({ reset: true })
})

onReachBottom(() => loadRecipes())

onPullDownRefresh(async () => {
  await Promise.all([
    restaurantApi.detail(shopId.value).then((res) => { shop.value = res.restaurant }).catch(() => {}),
    loadRecipes({ reset: true }),
  ])
  uni.stopPullDownRefresh()
})

function switchSort(key) {
  if (key === sort.value) return
  sort.value = key
  loadRecipes({ reset: true })
}

function goRecipe(recipe) {
  uni.navigateTo({ url: `/pages/recipe/detail?id=${recipe.id}` })
}

function goHome() {
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: var(--gap);
  box-sizing: border-box;
}

.loading {
  padding: 80rpx 0;
  text-align: center;
  font-size: 28rpx;
  color: var(--c-text-3);
}

.hero {
  padding: 32rpx;
  background: var(--c-card);
  border-radius: var(--radius-lg);
}

.hero-top {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.glyph {
  flex-shrink: 0;
  width: 80rpx;
  height: 80rpx;
  line-height: 80rpx;
  text-align: center;
  font-size: 40rpx;
  color: #fff;
  border-radius: 18rpx;
}

.hero-name {
  flex: 1;
  font-size: 36rpx;
  font-weight: 600;
  color: var(--c-text);
  line-height: 1.4;
}

.line {
  margin-top: 20rpx;
  font-size: 26rpx;
  color: var(--c-text-2);
  line-height: 1.6;
}

.line-city {
  margin-right: 12rpx;
}

.landmark {
  margin-top: 10rpx;
  padding-left: 14rpx;
  border-left: 4rpx solid var(--c-accent);
  font-size: 26rpx;
  color: var(--c-accent);
  line-height: 1.5;
}

.counts {
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 2rpx solid var(--c-line);
  font-size: 26rpx;
  color: var(--c-text-2);
}

.count-strong {
  color: var(--c-primary);
  font-weight: 600;
}

.count {
  margin-left: 8rpx;
}

.note {
  margin-top: var(--gap);
  padding: 26rpx 28rpx;
  background: #FDF6E9;
  border-radius: var(--radius-lg);
}

.note-label {
  font-size: 24rpx;
  color: var(--c-accent);
  font-weight: 600;
  margin-bottom: 10rpx;
}

.note-text {
  font-size: 27rpx;
  color: #6E5A2A;
  line-height: 1.7;
}

.tabs {
  display: flex;
  gap: 12rpx;
  margin: 40rpx 0 24rpx;
}

.tab {
  padding: 12rpx 30rpx;
  font-size: 27rpx;
  color: var(--c-text-2);
  background: var(--c-card);
  border-radius: 32rpx;
}

.tab-on {
  color: #fff;
  background: var(--c-primary);
}

.end {
  padding: 40rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: var(--c-text-3);
}
</style>
