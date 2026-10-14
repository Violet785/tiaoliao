<template>
  <view class="page">
    <!-- 自定义导航下要自己留出状态栏/刘海的高度 -->
    <view class="navbar" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view v-if="canGoBack" class="navbar__back" @click="goBack">
        <text class="navbar__back-glyph">‹</text>
      </view>
    </view>

    <view class="hero">
      <view class="hero__logo">蘸</view>
      <view class="hero__name">蘸料</view>
      <view class="hero__slogan">照着别人试过的配方配，比自己瞎调强</view>
    </view>

    <view class="tabs">
      <view
        v-for="t in TABS"
        :key="t.key"
        :class="['tabs__item', mode === t.key && 'tabs__item--on']"
        @click="switchMode(t.key)"
      >{{ t.label }}</view>
    </view>

    <view class="form">
      <view class="field">
        <text class="field__label">用户名</text>
        <input
          class="field__input"
          v-model="form.username"
          placeholder="3–20 位字母、数字或下划线"
          placeholder-class="field__ph"
          :maxlength="20"
          :adjust-position="true"
          @input="errorMsg = ''"
        />
      </view>

      <view class="field">
        <text class="field__label">密码</text>
        <input
          class="field__input"
          v-model="form.password"
          password
          placeholder="至少 6 位"
          placeholder-class="field__ph"
          :maxlength="64"
          @input="errorMsg = ''"
        />
      </view>

      <view v-if="mode === 'register'" class="field">
        <text class="field__label">
          昵称
          <text class="field__opt">选填</text>
        </text>
        <input
          class="field__input"
          v-model="form.nickname"
          placeholder="别人看到的名字，不填就用用户名"
          placeholder-class="field__ph"
          :maxlength="20"
          confirm-type="done"
          @confirm="submit"
        />
      </view>

      <!-- 用行内提示而不是 toast：表单校验错误紧挨着表单看，不用等弹窗消失 -->
      <view v-if="errorMsg" class="error">{{ errorMsg }}</view>

      <button
        class="submit"
        :class="{ 'submit--busy': submitting }"
        :disabled="submitting"
        @click="submit"
      >{{ submitting ? '请稍候…' : (mode === 'login' ? '登录' : '注册并登录') }}</button>

      <view class="skip" @click="skip">先随便看看，不登录</view>
    </view>

    <view class="foot">
      配完记得回来打个分，帮后面的人少走弯路
    </view>
  </view>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '../../store/user.js'
import { success } from '../../utils/feedback.js'

const TABS = [
  { key: 'login', label: '登录' },
  { key: 'register', label: '注册' },
]

const userStore = useUserStore()

const mode = ref('login')
const submitting = ref(false)
const errorMsg = ref('')
const redirect = ref('')

const form = reactive({ username: '', password: '', nickname: '' })

// 自定义导航下拿状态栏高度。getSystemInfoSync 在 H5 返回 statusBarHeight 0。
const statusBarHeight = ref(0)
try {
  statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 0
} catch {}

const canGoBack = computed(() => getCurrentPages().length > 1)

onLoad((query) => {
  if (query?.redirect) redirect.value = decodeURIComponent(query.redirect)
})

function switchMode(next) {
  if (mode.value === next) return
  mode.value = next
  errorMsg.value = ''
}

/**
 * 前端先校验一遍只是为了「更快给出反馈」，
 * 规则与 server/src/services/authService.js 保持一致 ——
 * 真正的把关仍在服务端，这里放宽或收紧都不会造成安全问题。
 */
function validate() {
  const username = form.username.trim()
  if (!username) return '请填用户名'
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return '用户名需为 3–20 位字母、数字或下划线'
  }
  if (!form.password) return '请填密码'
  if (form.password.length < 6) return '密码至少 6 位'
  return ''
}

async function submit() {
  if (submitting.value) return

  const invalid = validate()
  if (invalid) {
    errorMsg.value = invalid
    return
  }
  errorMsg.value = ''
  submitting.value = true

  const username = form.username.trim()
  try {
    if (mode.value === 'login') {
      await userStore.login(username, form.password)
    } else {
      await userStore.register(username, form.password, form.nickname.trim())
    }
    success(mode.value === 'login' ? '登录成功' : '注册成功')
    setTimeout(leave, 600)   // 让「成功」的勾看得见再走
  } catch (err) {
    // 网络层已经 toast 过一次了，这里把同一句话留在表单上不走，
    // 用户改完输入还能看见错在哪
    errorMsg.value = err?.message || '操作失败'
  } finally {
    submitting.value = false
  }
}

function leave() {
  if (redirect.value) {
    // 用 reLaunch 而不是 navigateTo：redirect 后面可能是 tabBar 页，
    // navigateTo 跳不过去；而且登录完成后也不需要保留旧的页面栈
    uni.reLaunch({ url: redirect.value })
    return
  }
  goBack()
}

function goBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
  } else {
    uni.reLaunch({ url: '/pages/index/index' })
  }
}

function skip() {
  goBack()
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 0 48rpx calc(env(safe-area-inset-bottom) + 48rpx);
  box-sizing: border-box;
  background: var(--c-bg);
}

/* ---- 顶部返回 ---- */
.navbar {
  height: 88rpx;
  display: flex;
  align-items: center;
}
.navbar__back {
  width: 72rpx;
  height: 72rpx;
  margin-left: -16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.navbar__back-glyph {
  font-size: 56rpx;
  line-height: 1;
  color: var(--c-text-2);
}

/* ---- 品牌区 ---- */
.hero {
  padding: 40rpx 0 56rpx;
}
.hero__logo {
  width: 128rpx;
  height: 128rpx;
  border-radius: 32rpx;
  background: var(--c-primary);
  color: #fff;
  font-size: 68rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 32rpx rgba(200, 69, 46, 0.28);
}
.hero__name {
  margin-top: 28rpx;
  font-size: 52rpx;
  font-weight: 700;
  letter-spacing: 4rpx;
}
.hero__slogan {
  margin-top: 10rpx;
  font-size: 26rpx;
  color: var(--c-text-3);
}

/* ---- 登录/注册切换 ---- */
.tabs {
  display: flex;
  gap: 8rpx;
  padding: 8rpx;
  background: #EDE8E1;
  border-radius: var(--radius);
}
.tabs__item {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  text-align: center;
  font-size: 29rpx;
  color: var(--c-text-2);
  border-radius: 12rpx;
  transition: all 0.18s;
}
.tabs__item--on {
  background: var(--c-card);
  color: var(--c-text);
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

/* ---- 表单 ---- */
.form {
  margin-top: 40rpx;
}
.field {
  margin-bottom: 32rpx;
}
.field__label {
  display: block;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  color: var(--c-text-2);
}
.field__opt {
  margin-left: 8rpx;
  font-size: 22rpx;
  color: var(--c-text-3);
}
.field__input {
  width: 100%;
  height: 96rpx;
  padding: 0 28rpx;
  box-sizing: border-box;
  background: var(--c-card);
  border: 2rpx solid var(--c-line);
  border-radius: var(--radius);
  font-size: 30rpx;
  color: var(--c-text);
}
.field__ph {
  color: #C4BAAE;
  font-size: 27rpx;
}

.error {
  margin: -8rpx 0 24rpx;
  padding: 20rpx 24rpx;
  background: #FCEFEC;
  border-left: 6rpx solid var(--c-primary);
  border-radius: 8rpx;
  font-size: 26rpx;
  color: var(--c-primary);
}

.submit {
  margin-top: 8rpx;
  height: 104rpx;
  line-height: 104rpx;
  background: var(--c-primary);
  color: #fff;
  font-size: 33rpx;
  font-weight: 600;
  letter-spacing: 4rpx;
  border-radius: var(--radius);
  border: none;
}
.submit::after {
  border: none;
}
.submit--busy,
.submit[disabled] {
  background: #D8A79C;
  color: #FBF4F2;
}

.skip {
  margin-top: 36rpx;
  text-align: center;
  font-size: 27rpx;
  color: var(--c-text-3);
}

.foot {
  margin-top: 80rpx;
  text-align: center;
  font-size: 23rpx;
  color: #BFB5A9;
  line-height: 1.8;
}
</style>
