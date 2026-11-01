<template><view><SiteHeader /><view class="shell login-shell"><view class="eyebrow">WELCOME TO THE TABLE</view><view class="page-title">一起分享，好好蘸料。</view><view class="muted">登录后即可分享配方、登记反馈和评价蘸料。</view><view class="panel"><view class="tabs"><button class="tab" :class="{ active: mode === 'login' }" :disabled="busy" @click="mode = 'login'; error = ''">登录</button><button class="tab" :class="{ active: mode === 'register' }" :disabled="busy" @click="mode = 'register'; error = ''">注册</button></view><text class="label">用户名</text><input v-model="form.username" class="field" maxlength="20" placeholder="3–20 位字母、数字或下划线" /><text class="label">密码</text><input v-model="form.password" class="field" password maxlength="64" placeholder="至少 6 位" confirm-type="done" @confirm="send" /><template v-if="mode === 'register'"><text class="label">昵称（选填）</text><input v-model="form.nickname" class="field" maxlength="20" placeholder="别人看到的名字" /></template><view v-if="error" class="error-text">{{ error }}</view><button class="btn submit" :disabled="busy" @click="send">{{ busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录' }}</button></view><view class="muted login-foot">一碗喜欢的味道，值得分享。</view></view></view></template>
<script setup>
import { ref, reactive } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import { useUserStore } from '../../store/user.js'
const store = useUserStore(), mode = ref('login'), busy = ref(false), error = ref(''), redirect = ref('')
const form = reactive({ username: '', password: '', nickname: '' })
onLoad(o => { try { redirect.value = decodeURIComponent(o?.redirect || '') } catch {} })
async function send() {
  if (busy.value) return
  if (!form.username.trim() || !form.password) { error.value = '请填写用户名和密码'; return }
  busy.value = true; error.value = ''
  try {
    if (mode.value === 'login') await store.login(form.username.trim(), form.password)
    else await store.register(form.username.trim(), form.password, form.nickname.trim())
    uni.reLaunch({ url: redirect.value.startsWith('/pages/') ? redirect.value : '/pages/index/index' })
  } catch (e) { error.value = e.message || '登录失败，请重试' } finally { busy.value = false }
}
</script>
<style scoped>.login-shell { max-width: 550px; padding-top: 50px; }.login-shell .page-title { font-size: 30px; }.tabs { margin-top: 0; }.submit { margin-top: 25px; }.login-foot { font-size: 12px; text-align: center; }</style>
