<template>
  <view>
    <SiteHeader />
    <view class="shell user-shell">
      <view class="eyebrow">YOUR LITTLE CORNER</view>
      <view class="page-title">个人中心</view>

      <!-- 未登录 -->
      <template v-if="!store.isLoggedIn">
        <view class="panel guest">
          <view class="guest-title">登录后，你的配方、收藏和打卡都在这里</view>
          <view class="muted">收藏别人的蘸料、给自己配过的打分，都会留在这一个页面。</view>
          <button class="btn guest-btn" @click="login">登录 / 注册</button>
        </view>
      </template>

      <template v-else>
        <!-- 资料卡 -->
        <view class="panel profile">
          <view class="row between">
            <view class="row">
              <text class="avatar-big">{{ store.displayName.slice(0, 1) || '我' }}</text>
              <view>
                <view class="nickname">{{ store.displayName }}</view>
                <view class="muted">@{{ store.user?.username }}</view>
              </view>
            </view>
            <text class="badge">{{ store.isAdmin ? '管理员' : '普通用户' }}</text>
          </view>

          <view class="stats">
            <view v-for="s in stats" :key="s.key" class="stat" :class="{ active: tab === s.key }" @click="switchTab(s.key)">
              <text class="stat-num">{{ s.value }}</text>
              <text class="stat-label">{{ s.label }}</text>
            </view>
          </view>

          <view class="row edit-row">
            <input v-model="nickname" class="field" maxlength="20" placeholder="昵称" />
            <button class="btn" :disabled="saving || nickname === store.displayName" @click="save">
              {{ saving ? '保存中…' : '保存昵称' }}
            </button>
          </view>
        </view>

        <!-- 标签页 -->
        <view class="tabs">
          <view v-for="t in tabs" :key="t.key" class="tab" :class="{ active: tab === t.key }" @click="switchTab(t.key)">
            {{ t.label }}
          </view>
        </view>

        <view v-if="loading" class="empty">加载中…</view>
        <view v-else-if="failed" class="empty"><view>加载失败</view><button class="ghost" @click="loadTab(tab, true)">重试</button></view>

        <!-- 配方 / 收藏 -->
        <template v-else-if="tab === 'recipes' || tab === 'favorites'">
          <view v-if="items.length" class="list">
            <view v-for="it in items" :key="it.id" class="card" @click="openRecipe(it.id)">
              <view class="card-main">
                <view class="card-title">{{ it.title }}</view>
                <view class="muted">
                  {{ it.restaurantName }} · {{ it.itemCount }} 样调料 ·
                  均分 {{ it.ratingAvg ? Number(it.ratingAvg).toFixed(1) : '—' }} · 打卡 {{ it.cookCount }}
                </view>
              </view>
              <text class="card-arrow">↗</text>
            </view>
          </view>
          <view v-else class="empty">
            {{ tab === 'recipes' ? '还没发布过蘸料，去「反馈登记」分享一碗吧。' : '还没有收藏，看到喜欢的点个收藏就出现在这里。' }}
          </view>
        </template>

        <!-- 评价 -->
        <template v-else-if="tab === 'ratings'">
          <view v-if="items.length" class="list">
            <view v-for="it in items" :key="it.recipeId" class="card" @click="openRecipe(it.recipeId)">
              <view class="card-main">
                <view class="row between">
                  <view class="card-title">{{ it.recipeTitle }}</view>
                  <text class="score">{{ '★'.repeat(it.score) }}<text class="score-dim">{{ '★'.repeat(5 - it.score) }}</text></text>
                </view>
                <view class="muted">{{ it.restaurantName }} · {{ date(it.updatedAt) }}</view>
                <view v-if="it.content" class="comment">{{ it.content }}</view>
              </view>
            </view>
          </view>
          <view v-else class="empty">还没给蘸料打过分。用完一碗，回去给它个评价吧。</view>
        </template>

        <!-- 投稿 -->
        <template v-else>
          <view v-if="items.length" class="list">
            <SubmissionCard v-for="record in items" :key="record.id" :record="record" />
          </view>
          <view v-else class="empty">还没有提交过内容。店铺、蘸料、意见都可以在「反馈登记」提交。</view>
        </template>

        <button v-if="hasMore && !loading" class="ghost load-more" @click="loadTab(tab, false)">加载更多</button>
      </template>
    </view>
  </view>
</template>

<script setup>
// 个人中心：资料 + 四类「我的」列表。
//
// 四类数据的接口早就在服务端了（/users/me/recipes|favorites|ratings、/submissions/mine），
// 这里只做聚合展示，不新增任何后端逻辑。
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import SubmissionCard from '../../components/SubmissionCard.vue'
import { useUserStore, requireLogin } from '../../store/user.js'
import * as userApi from '../../api/user.js'
import { mine as mySubmissions } from '../../api/community.js'

const store = useUserStore()

const tabs = [
  { key: 'recipes', label: '我的配方' },
  { key: 'favorites', label: '我的收藏' },
  { key: 'ratings', label: '我的评价' },
  { key: 'submissions', label: '我的投稿' },
]

const tab = ref('recipes')
const items = ref([])
const page = ref(1)
const hasMore = ref(false)
const loading = ref(false)
const failed = ref(false)
const nickname = ref('')
const saving = ref(false)
const totals = ref({ recipes: null, favorites: null, ratings: null, submissions: null })

const stats = computed(() =>
  tabs.map((t) => ({
    key: t.key,
    label: t.label.replace('我的', ''),
    value: totals.value[t.key] == null ? '—' : totals.value[t.key],
  })),
)

const apiOf = {
  recipes: (p) => userApi.myRecipes(p),
  favorites: (p) => userApi.myFavorites(p),
  ratings: (p) => userApi.myRatings(p),
  submissions: (p) => mySubmissions(p),
}

async function loadTab(key, reset = true) {
  if (loading.value) return
  loading.value = true
  failed.value = false
  if (reset) {
    page.value = 1
    items.value = []
  }
  try {
    const res = await apiOf[key](page.value)
    items.value = reset ? res.list : [...items.value, ...res.list]
    hasMore.value = Boolean(res.hasMore)
    totals.value[key] = res.total
    page.value += 1
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

/** 打开页面时顺手把四个数字拉一遍（每类只要 1 条，成本很小） */
async function loadTotals() {
  const entries = Object.entries(apiOf)
  await Promise.all(
    entries.map(async ([key, fn]) => {
      try {
        totals.value[key] = (await fn(1, 1)).total
      } catch {
        totals.value[key] = null
      }
    }),
  )
}

function switchTab(key) {
  if (tab.value === key && items.value.length) return
  tab.value = key
  loadTab(key, true)
}

async function save() {
  const value = nickname.value.trim()
  if (!value) return uni.showToast({ title: '昵称不能为空', icon: 'none' })
  saving.value = true
  try {
    await userApi.updateProfile({ nickname: value })
    await store.refresh()
    uni.showToast({ title: '已保存', icon: 'none' })
  } catch {
  } finally {
    saving.value = false
  }
}

function openRecipe(id) {
  uni.navigateTo({ url: `/pages/recipe/detail?id=${id}` })
}

function login() {
  uni.navigateTo({ url: '/pages/common/login' })
}

function date(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

onShow(() => {
  if (!store.isLoggedIn) return
  nickname.value = store.displayName
  loadTotals()
  loadTab(tab.value, true)
})
</script>

<style scoped>
.user-shell { max-width: 900px; }
.guest { text-align: center; padding: 40px 24px; }
.guest-title { font-size: 18px; font-weight: 600; margin-bottom: 10px; }
.guest-btn { margin-top: 22px; width: 220px; }

.profile { margin-top: 18px; }
.avatar-big {
  width: 54px; height: 54px; line-height: 54px; border-radius: 50%;
  background: #eee4d6; color: #6d543c; font-size: 22px; text-align: center; margin-right: 14px;
}
.nickname { font-size: 20px; font-weight: 700; color: #33291f; }

.stats { display: flex; gap: 10px; margin-top: 22px; }
.stat {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 12px 0; border-radius: 12px; background: #faf6ef; cursor: pointer;
  border: 1px solid transparent;
}
.stat.active { background: #f5e9d8; border-color: #e6d3b3; }
.stat-num { font-size: 20px; font-weight: 700; color: #b04a2f; }
.stat-label { font-size: 12px; color: #8a7a68; }

.edit-row { margin-top: 20px; }
.edit-row .field { flex: 1; }
.edit-row .btn { flex: 0 0 auto; height: 46px; line-height: 46px; }

.tabs { display: flex; flex-wrap: wrap; gap: 10px; margin: 24px 0 16px; }
.tab {
  border: 1px solid #e4dbcf; border-radius: 24px; padding: 8px 18px;
  font-size: 14px; color: #786959; background: #fff; cursor: pointer;
}
.tab.active { background: #382c24; color: #fff; border-color: #382c24; }

.list { display: flex; flex-direction: column; gap: 12px; }
.card {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 16px 18px; border: 1px solid #e9e0d3; border-radius: 14px; background: #fff; cursor: pointer;
}
.card:hover { border-color: #d8c8b2; }
.card-main { min-width: 0; flex: 1; }
.card-title { font-size: 16px; font-weight: 600; color: #33291f; }
.card-arrow { color: #c8452e; font-size: 15px; }
.comment { margin-top: 8px; font-size: 13.5px; color: #5f5145; line-height: 1.6; }
.score { color: #d9a02b; font-size: 13px; letter-spacing: 1px; }
.score-dim { color: #e6ddcf; }
.load-more { margin: 20px auto 0; }

@media (max-width: 760px) {
  .stats { gap: 6px; }
  .stat-num { font-size: 17px; }
  .stat-label { font-size: 11px; }
}
</style>
