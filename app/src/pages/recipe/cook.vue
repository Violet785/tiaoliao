<template>
  <view class="cook">
    <!-- 加载 / 出错 -->
    <view v-if="!session" class="cook-center">
      <text class="cook-hint">{{ error || '正在准备调料台…' }}</text>
      <button v-if="error" class="ghost" @click="load">重试</button>
    </view>

    <!-- 配完 -->
    <view v-else-if="done" class="cook-center cook-done">
      <view class="done-mark">✓</view>
      <view class="done-title">配好了</view>
      <view class="done-line">{{ session.summaryLine }}</view>
      <view class="done-sub">{{ recordedSuccess ? '已记录这次试配' : user.isLoggedIn ? '这次试配尚未同步，你仍可以评价这碗蘸料。' : '登录后可以保存试配评价，浏览和照着配无需登录。' }}</view>
      <RecipeRating :recipe-id="id" :existing="myRating" compact @saved="refreshRating" />
      <button class="btn done-btn" @click="backToRecipe">看看这碗蘸料</button>
      <button class="ghost done-btn" @click="restart">再配一遍</button>
    </view>

    <!-- 逐步 -->
    <template v-else>
      <view class="top">
        <view class="top-row">
          <text class="exit" @click="exit">✕</text>
          <text class="top-title">{{ session.title }}</text>
          <text class="top-count">{{ index + 1 }} / {{ total }}</text>
        </view>
        <view class="bar"><view class="bar-fill" :style="{ width: progress + '%' }" /></view>
      </view>

      <view class="stage">
        <text class="stage-name">{{ current.stageName }}</text>
        <text class="stage-sub">{{ session.restaurantName }} · {{ session.servingNote }}</text>
      </view>

      <view class="card" :style="{ borderColor: current.color + '55' }">
        <view class="glyph" :style="{ background: current.color }">{{ current.glyph }}</view>
        <view class="name">{{ current.name }}</view>
        <view class="amount">{{ current.amountLabel }}</view>
        <view v-if="current.anchorText" class="anchor">{{ current.anchorText }}</view>
        <view v-if="current.amountNote" class="note">{{ current.amountNote }}</view>
        <view v-if="current.caution" class="caution">⚠ {{ current.caution }}</view>
        <view v-if="current.isAllergen" class="caution">含常见过敏原，不确定就别放</view>
      </view>

      <view class="substitute" v-if="current.substitute">
        店里没有这个？可以用「{{ current.substitute.name }}」代替
      </view>

      <view class="actions">
        <button class="ghost prev" :disabled="index === 0" @click="prev">上一步</button>
        <button class="btn next" @click="next">{{ isLast ? '配好了' : '下一步' }}</button>
      </view>
      <view class="skip-link" @click="skip">这步没有？跳过它</view>

      <view v-if="session.skipList?.length" class="skip-note">
        这碗不放：<text v-for="s in session.skipList" :key="s.condimentId" class="skip-item">{{ s.name }} </text>
      </view>
    </template>
  </view>
</template>

<script setup>
// M7「照着配」全屏模式。
//
// 场景是用户站在调料台前，一只手拿碗：所以一屏只显示一步、字号大、
// 进度和「下一步」固定在拇指够得到的位置，整包数据一次拉完（断网也能走）。
import { ref, computed } from 'vue'
import RecipeRating from '../../components/RecipeRating.vue'
import { onLoad, onUnload, onBackPress } from '@dcloudio/uni-app'
import { cook, logCook, detail } from '../../api/recipe.js'
import { useUserStore } from '../../store/user.js'
const user = useUserStore(), myRating = ref(null), recordedSuccess = ref(false)
async function refreshRating() { if (user.isLoggedIn) { try { myRating.value = (await detail(id.value)).myRating } catch {} } }

const session = ref(null)
const error = ref('')
const index = ref(0)
const done = ref(false)
const skipped = ref([])
const recorded = ref(false)
const id = ref(0)

const steps = computed(() => {
  if (!session.value) return []
  return session.value.stages.flatMap((stage) =>
    stage.steps.map((step) => ({ ...step, stageName: stage.name })),
  )
})
const total = computed(() => steps.value.length)
const current = computed(() => steps.value[index.value] || {})
const isLast = computed(() => index.value >= total.value - 1)
const progress = computed(() => (total.value ? ((index.value + 1) / total.value) * 100 : 0))

async function load() {
  error.value = ''
  try {
    const data = await cook(id.value)
    if (!data?.stages?.length) {
      error.value = '这个配方还没有可执行的步骤'
      return
    }
    session.value = data
    index.value = 0
    done.value = false
    recorded.value = false
  } catch {
    error.value = '加载失败，检查一下网络'
  }
}

function next() {
  if (!isLast.value) {
    index.value += 1
    return
  }
  finish()
}

function prev() {
  if (index.value > 0) index.value -= 1
}

function skip() {
  const step = current.value
  if (step?.condimentId) skipped.value.push(step.condimentId)
  if (isLast.value) finish()
  else index.value += 1
}

function finish() {
  done.value = true
  if (recorded.value) return
  recorded.value = true
  if (!user.isLoggedIn) return
  // 打卡失败不打扰用户：他已经在收碗了
  logCook(id.value, {
    finished: true,
    stepReached: total.value,
    skipped: skipped.value,
  }).then(() => { recordedSuccess.value = true }).catch(() => {})
}

function restart() {
  index.value = 0
  done.value = false
  skipped.value = []
}

function exit() {
  if (user.isLoggedIn && !recorded.value && index.value > 0) {
    recorded.value = true
    logCook(id.value, { finished: false, stepReached: index.value + 1, skipped: skipped.value }).catch(() => {})
  }
  uni.navigateBack()
}

function backToRecipe() {
  uni.redirectTo({ url: `/pages/recipe/detail?id=${id.value}` })
}

// 安卓物理返回键 / H5 浏览器后退：先记一笔未完成，再放行
onBackPress(() => {
  if (user.isLoggedIn && !recorded.value && index.value > 0) {
    recorded.value = true
    logCook(id.value, { finished: false, stepReached: index.value + 1, skipped: skipped.value }).catch(() => {})
  }
  return false
})

onLoad((options) => {
  id.value = Number(options?.id) || 0
  load()
  refreshRating()
  if (typeof uni.setKeepScreenOn === 'function') {
    uni.setKeepScreenOn({ keepScreenOn: true })
  }
})

onUnload(() => {
  if (typeof uni.setKeepScreenOn === 'function') {
    uni.setKeepScreenOn({ keepScreenOn: false })
  }
})

/** H5 上支持左右键翻页，站在电脑前试配方时很顺手 */
function handleKey(e) {
    if (['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return
    if (e.key === 'ArrowRight' && !done.value) next()
    if (e.key === 'ArrowLeft') prev()
}
if (typeof window !== 'undefined') window.addEventListener('keydown', handleKey)
onUnload(() => { if (typeof window !== 'undefined') window.removeEventListener('keydown', handleKey) })
</script>

<style scoped>
.cook {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 18px 20px 26px;
  background: #fbf7f0;
  display: flex;
  flex-direction: column;
}
.cook-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
.cook-hint { color: #8a7a68; font-size: 15px; }

.top-row { display: flex; align-items: center; justify-content: space-between; height: 44px; }
.exit { font-size: 20px; color: #7a6a58; padding: 0 4px; }
.top-title { font-size: 15px; color: #4a3d31; font-weight: 600; }
.top-count { font-size: 13px; color: #9a8a76; }
.bar { height: 6px; border-radius: 6px; background: #ece2d3; overflow: hidden; margin-top: 8px; }
.bar-fill { height: 100%; background: #c8452e; border-radius: 6px; transition: width .2s ease; }

.stage { margin-top: 26px; display: flex; flex-direction: column; gap: 4px; }
.stage-name { font-size: 13px; letter-spacing: 3px; color: #a05a35; font-weight: 600; }
.stage-sub { font-size: 13px; color: #9a8a76; }

.card {
  flex: 1;
  margin: 22px 0 18px;
  border: 2px solid #ecdfc9;
  border-radius: 24px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-shadow: 0 14px 40px rgba(120, 92, 62, .08);
}
.glyph {
  width: 96px;
  height: 96px;
  border-radius: 28px;
  color: #fff;
  font-size: 46px;
  line-height: 96px;
  text-align: center;
  font-weight: 700;
}
.name { margin-top: 22px; font-size: 30px; font-weight: 700; color: #2f251d; letter-spacing: 1px; }
.amount { margin-top: 10px; font-size: 40px; font-weight: 800; color: #c8452e; line-height: 1.1; }
.anchor { margin-top: 8px; font-size: 15px; color: #8a7a68; }
.note { margin-top: 6px; font-size: 14px; color: #9a8a76; }
.caution { margin-top: 14px; font-size: 13px; color: #b4531f; background: #fdf2e6; padding: 6px 12px; border-radius: 8px; }

.substitute { text-align: center; font-size: 13px; color: #8a7a68; margin-bottom: 10px; }

.actions { display: flex; gap: 10px; align-items: stretch; }
.actions .prev { flex: 0 0 96px; height: 50px; line-height: 48px; padding: 0; font-size: 14px; }
.actions .next { flex: 1; height: 50px; line-height: 50px; font-size: 17px; border-radius: 14px; }

.skip-link { text-align: center; font-size: 13px; color: #9a8a76; margin-top: 12px; text-decoration: underline; text-underline-offset: 3px; }
.skip-note { margin-top: 14px; font-size: 12px; color: #a3937f; text-align: center; }
.skip-item { margin-right: 4px; }

.cook-done .done-mark {
  width: 86px; height: 86px; border-radius: 50%;
  background: #3e8e5a; color: #fff; font-size: 42px; line-height: 86px; text-align: center;
}
.done-title { font-size: 30px; font-weight: 700; color: #2f251d; }
.done-line { font-size: 15px; color: #6d5c4b; text-align: center; line-height: 1.7; }
.done-sub { font-size: 13px; color: #9a8a76; }
.done-btn { width: 240px; }

@media (min-width: 760px) {
  .cook { max-width: 720px; margin: 0 auto; }
}
</style>
