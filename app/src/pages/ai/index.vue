<template>
  <view>
    <SiteHeader />
    <view class="shell">
      <view class="ai-hero">
        <view class="eyebrow">AI SEARCH</view>
        <view class="page-title">搜店、搜配方，也可以直接问一句。</view>
        <view class="muted">输入店名、配方名或者口味关键词，先给结论，再列证据。</view>

        <view class="row search-row">
          <input
            v-model="keyword"
            class="search-input"
            placeholder="例如：牛、麻酱、清淡、烤肉"
            confirm-type="search"
            @confirm="run()"
          />
          <button class="btn" :disabled="loading || !keyword.trim()" @click="run()">
            {{ loading ? '搜索中…' : '搜索' }}
          </button>
        </view>

        <view class="ai-quick">
          <text v-for="k in quickWords" :key="k" class="ai-quick-item" @click="pick(k)">{{ k }}</text>
        </view>
      </view>

      <!-- 结果 -->
      <view v-if="loading" class="empty">正在翻调料台…</view>

      <block v-else-if="result">
        <view class="ai-answer">
          <view class="ai-answer-head">
            <text class="ai-answer-tag">AI 摘要</text>
            <text class="ai-answer-mode">{{ result.source === 'ai' ? '模型生成' : '规则整理' }}</text>
          </view>
          <view class="ai-answer-text">{{ result.answer }}</view>
        </view>

        <view v-if="result.restaurants.length" class="section-title">店铺 · {{ result.restaurants.length }}</view>
        <view v-if="result.restaurants.length" class="ai-list">
          <view v-for="s in result.restaurants" :key="s.id" class="ai-card" @click="goShop(s.id)">
            <view class="ai-card-main">
              <view class="ai-card-title">{{ s.name }}</view>
              <view class="muted">{{ s.category }} · {{ s.recipeCount }} 份配方 · {{ s.cookCount }} 次打卡</view>
              <view v-if="s.note" class="ai-card-note">{{ s.note }}</view>
            </view>
            <text class="ai-card-arrow">↗</text>
          </view>
        </view>

        <view v-if="result.recipes.length" class="section-title">配方 · {{ result.recipes.length }}</view>
        <view v-if="result.recipes.length" class="ai-list">
          <view v-for="r in result.recipes" :key="r.id" class="ai-card" @click="goRecipe(r.id)">
            <view class="ai-card-main">
              <view class="ai-card-title">{{ r.title }}</view>
              <view class="muted">{{ r.shop }} · 辣 {{ r.heat }} / 咸 {{ r.salt }} / 醇 {{ r.rich }}</view>
              <view class="ai-tags">
                <text v-for="t in r.tags" :key="t" class="ai-tag">{{ t }}</text>
              </view>
            </view>
            <text class="ai-card-arrow">↗</text>
          </view>
        </view>

        <view v-if="!result.restaurants.length && !result.recipes.length" class="empty">
          没搜到「{{ result.q }}」。换个短一点的词试试，比如只输店名里的两个字。
        </view>
      </block>

      <view v-else class="empty">输入关键词开始搜索。</view>
    </view>

    <!-- 同一套对话窗，页面里也能直接问 -->
    <AiChat />
  </view>
</template>

<script setup>
// 独立的「搜索 + 资讯」页。
//
// 和悬浮窗的区别：这里是「检索 + 摘要」的一次性问答，
// 悬浮窗是「多轮对话」。两者共用后端 /api/ai/*，但交互形态不同。
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import AiChat from '../../ai/chat-widget.vue'
import * as aiApi from '../../ai/api.js'

const keyword = ref('')
const loading = ref(false)
const result = ref(null)
const quickWords = ['牛', '麻酱', '清淡', '烤肉', '海鲜']

async function run() {
  const q = keyword.value.trim()
  if (!q || loading.value) return

  loading.value = true
  try {
    result.value = await aiApi.search(q)
  } catch {
    result.value = { q, answer: '搜索失败，稍后再试。', restaurants: [], recipes: [], source: 'rule' }
  } finally {
    loading.value = false
  }
}

// 支持 /pages/ai/index?q=牛 直接出结果，方便分享和外部跳转
onLoad((options) => {
  const q = String(options?.q || '').trim()
  if (!q) return
  keyword.value = q
  run()
})

function pick(word) {
  keyword.value = word
  run()
}

function goShop(id) {
  uni.navigateTo({ url: `/pages/restaurant/detail?id=${id}` })
}

function goRecipe(id) {
  uni.navigateTo({ url: `/pages/recipe/detail?id=${id}` })
}
</script>

<style scoped>
.ai-hero { padding: 30px 0 22px; border-bottom: 1px solid #e5dacc; }
.search-row { margin-top: 22px; max-width: 680px; }
.ai-quick { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.ai-quick-item {
  padding: 6px 12px;
  border: 1px solid #e2d5c4;
  border-radius: 999px;
  font-size: 13px;
  color: #7a6653;
  background: #fff;
  cursor: pointer;
}

.ai-answer {
  margin-top: 26px;
  padding: 20px 22px;
  border: 1px solid #e6d8c6;
  border-radius: 16px;
  background: linear-gradient(180deg, #fffdf8 0%, #fdf8f0 100%);
}
.ai-answer-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ai-answer-tag {
  padding: 3px 10px;
  border-radius: 20px;
  background: #382c24;
  color: #fff;
  font-size: 12px;
  letter-spacing: 1px;
}
.ai-answer-mode { font-size: 12px; color: #9a8a76; }
.ai-answer-text { font-size: 15px; line-height: 1.75; color: #3a2f26; }

.ai-list { display: flex; flex-direction: column; gap: 12px; }
.ai-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid #e9e0d3;
  border-radius: 14px;
  background: #fff;
  cursor: pointer;
}
.ai-card:hover { border-color: #d8c8b2; }
.ai-card-main { min-width: 0; }
.ai-card-title { font-size: 16px; font-weight: 600; color: #33291f; margin-bottom: 4px; }
.ai-card-note { margin-top: 6px; font-size: 13px; color: #8a7a68; }
.ai-card-arrow { color: #c8452e; font-size: 15px; }
.ai-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.ai-tag { padding: 2px 8px; border-radius: 20px; background: #f4ede3; color: #7c6751; font-size: 11.5px; }

@media (max-width: 760px) {
  .ai-hero { padding: 20px 0 16px; }
  .ai-card { padding: 14px; }
}
</style>
