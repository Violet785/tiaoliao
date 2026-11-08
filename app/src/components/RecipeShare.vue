<template>
  <view class="panel share-panel"><view class="section-title">把这碗分享给朋友</view><view class="muted">生成包含店名、配方用量和二维码的图片。</view><view class="row buttons"><button class="ghost" :disabled="busy" @click="generate">{{ busy ? '正在生成…' : '生成分享卡片' }}</button><button class="ghost" @click="copy">复制配方链接</button></view><view v-if="error" class="error-text">{{ error }}</view><template v-if="poster"><image :src="poster" class="poster" mode="widthFix" :show-menu-by-longpress="true" @click="preview" /><view class="row"><button class="btn" @click="download">保存分享图片</button><button class="ghost" @click="preview">查看大图</button></view><view class="muted save-note">手机可查看大图后长按保存；微信内置浏览器也可使用长按菜单。</view></template></view>
</template>
<script setup>
import { ref } from 'vue'
import { createShareCard, recipeLink } from '../utils/shareCard.js'
const props = defineProps({ full: { type: Object, required: true } })
const poster = ref(''), busy = ref(false), error = ref('')
async function generate() { if (busy.value) return; busy.value = true; error.value = ''; try { poster.value = (await createShareCard(props.full)).image } catch (e) { error.value = e.message + '，可以先复制链接分享。' } finally { busy.value = false } }
function copy() { uni.setClipboardData({ data: recipeLink(props.full.recipe.id), fail: () => { error.value = '复制失败，请复制浏览器地址栏中的链接。' } }) }
function preview() { uni.previewImage({ urls: [poster.value], current: poster.value }) }
function download() {
  // #ifdef H5
  const link = document.createElement('a'); link.href = poster.value; link.download = `蘸料-${props.full.recipe.id}.png`; document.body.appendChild(link); link.click(); link.remove()
  // #endif
  // #ifndef H5
  preview()
  // #endif
}
</script>
<style scoped>.section-title { margin-top: 0; }.buttons { margin-top: 16px; }.poster { display: block; width: 100%; max-width: 440px; margin: 22px 0; border: 1px solid #e4d8c7; border-radius: 12px; }.save-note { margin-top: 14px; font-size: 12px; }</style>
