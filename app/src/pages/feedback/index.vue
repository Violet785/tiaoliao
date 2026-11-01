<template><view><SiteHeader /><view class="shell feedback-shell"><view class="eyebrow">MAKE IT BETTER, TOGETHER</view><view class="page-title">反馈登记</view><view class="muted">补充一家店，分享一碗蘸料，或者告诉我们你的建议。</view><view v-if="store.isLoggedIn"><view class="tabs"><button v-for="(label, key) in kindLabel" :key="key" class="tab" :class="{ active: kind === key }" :disabled="busy" @click="switchKind(key)">{{ label }}</button></view><view class="panel form-panel">
<template v-if="kind === 'restaurant'"><view class="form-title">没找到店名？在这里提交</view><view class="muted">只填写店名，无需区分分店。</view><text class="label">店名 *</text><input v-model="form.name" class="field" maxlength="60" placeholder="例如：牛NEW、龍哥" /><text class="label">类型</text><picker :range="categories" :value="categories.indexOf(form.category)" @change="form.category = categories[$event.detail.value]"><view class="picker">{{ form.category }} ⌄</view></picker><text class="label">补充说明</text><textarea v-model="form.note" class="textarea" maxlength="200" placeholder="关于这家店的介绍（选填）" /></template>
<template v-else-if="kind === 'recipe'"><view class="form-title">{{ recipeId ? '修改蘸料配方' : '上传你的蘸料' }}</view><view class="muted">{{ recipeId ? '修改通过审核后会更新，审核期间原配方仍可查看。' : '配方通过审核后，将出现在对应店铺。' }}</view><text class="label">店铺 *</text><view v-if="!recipeId" class="row brand-search"><input v-model="shopSearch" class="search-input" placeholder="按店名查找" @confirm="searchShops" /><button class="ghost" @click="searchShops">查找</button></view><picker :range="shops" range-key="name" :value="shopIndex" :disabled="!!recipeId" @change="form.restaurantId = shops[$event.detail.value]?.id"><view class="picker">{{ selectedShop?.name || '请选择店铺' }} ⌄</view></picker><view v-if="!shops.length" class="muted">暂无匹配店名，请先提交「新增店铺」，通过后再上传蘸料。</view><text class="label">蘸料名称 *</text><input v-model="form.title" class="field" maxlength="40" placeholder="给这碗蘸料起个名字" /><text class="label">味道介绍</text><textarea v-model="form.description" class="textarea" maxlength="200" placeholder="味道、适合搭配什么食材…" /><text class="label">分量说明</text><input v-model="form.servingNote" class="field" maxlength="60" placeholder="例如：一小碗，适合两人" /><view class="row between"><text class="label">调料与用量 *</text><button class="ghost small" :disabled="form.items.length >= 30" @click="addItem">+ 添加调料</button></view><view v-for="(item, i) in form.items" :key="item.key" class="item-editor"><view class="row item-row"><picker class="condiment-picker" :range="condiments" range-key="name" :value="condiments.findIndex(c => c.id === item.condimentId)" @change="item.condimentId = condiments[$event.detail.value]?.id"><view class="picker">{{ condiments.find(c => c.id === item.condimentId)?.name || '选择调料' }} ⌄</view></picker><picker :range="levels" :value="item.amountLevel" @change="item.amountLevel = Number($event.detail.value)"><view class="picker">{{ levels[item.amountLevel] }} ⌄</view></picker><button class="remove" aria-label="删除调料" @click="form.items.splice(i, 1)">×</button></view><input v-model="item.amountNote" class="field item-note" maxlength="60" placeholder="用量补充（选填，例如：半勺）" /></view><text class="label">配图（选填，最多 4 张）</text><view class="muted">支持 JPG、PNG、WebP，单张不超过 5MB。</view><view class="photo-grid"><view v-for="(img, i) in images" :key="img.id" class="image-preview"><image class="photo" mode="aspectFill" :src="mediaUrl(img.url)" /><button class="remove-photo" :disabled="busy" aria-label="移除图片" @click="images.splice(i, 1)">×</button></view><button v-if="images.length < 4" class="photo upload-button" :disabled="uploading || busy" @click="chooseImages">{{ uploading ? '上传中…' : '+ 添加图片' }}</button></view></template>
<template v-else><view class="form-title">你的建议，我们会认真看</view><text class="label">反馈内容 *</text><textarea v-model="form.content" class="textarea" maxlength="2000" placeholder="遇到的问题、想要的功能或其他建议…" /></template>
<view v-if="error" class="error-text">{{ error }}</view><view v-if="success" class="success">{{ success }}</view><view class="submit-row"><button class="btn" :disabled="busy || uploading || !ready" @click="send">{{ busy ? '提交中…' : '提交审核' }}</button><text class="muted">审核结果会显示在下方记录中。</text></view></view>
<view class="row between section-title"><text>我的登记记录</text><button class="ghost" :disabled="recordsLoading" @click="loadRecords(true)">刷新</button></view><SubmissionCard v-for="r in records" :key="r.id" :record="r" /><view v-if="!records.length" class="empty">{{ recordsLoading ? '加载中…' : '还没有登记记录' }}</view><button v-if="hasMore" class="ghost" :disabled="recordsLoading" @click="loadRecords(false)">加载更多</button></view><view v-else class="empty">请先登录后提交反馈。</view></view></view></template>
<script setup>
import { ref, reactive, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import SubmissionCard from '../../components/SubmissionCard.vue'
import { useUserStore, requireLogin } from '../../store/user.js'
import { http } from '../../api/request.js'
import * as api from '../../api/community.js'
import { kindLabel, mediaUrl } from '../../api/community.js'
import * as restaurantApi from '../../api/restaurant.js'
import * as recipeApi from '../../api/recipe.js'
const store = useUserStore(), kind = ref('restaurant'), recipeId = ref(0), busy = ref(false), uploading = ref(false), ready = ref(false), error = ref(''), success = ref(''), token = ref(api.newToken())
const categories = restaurantApi.CATEGORIES, levels = ['不放', '一点点', '少量', '适量', '偏多', '多放']
const form = reactive({ name: '', category: '自助餐', note: '', restaurantId: 0, title: '', description: '', servingNote: '', content: '', items: [], tasteTags: [], foodTags: [], sceneTags: [] })
const shops = ref([]), shopSearch = ref(''), condiments = ref([]), images = ref([]), records = ref([]), recordPage = ref(1), hasMore = ref(false), recordsLoading = ref(false)
const selectedShop = computed(() => shops.value.find(s => s.id === form.restaurantId)), shopIndex = computed(() => Math.max(0, shops.value.findIndex(s => s.id === form.restaurantId)))
function addItem() { if (form.items.length < 30) form.items.push({ key: api.newToken(), condimentId: '', amountLevel: 3, amountNote: '' }) }
function switchKind(key) { kind.value = key; error.value = ''; success.value = ''; token.value = api.newToken() }
async function searchShops() { try { const r = await restaurantApi.list({ keyword: shopSearch.value, pageSize: 50 }); shops.value = r.list; if (!selectedShop.value) form.restaurantId = 0 } catch {} }
async function loadRecords(reset = true) {
  if (recordsLoading.value) return; recordsLoading.value = true; if (reset) recordPage.value = 1
  try { const r = await api.mine(recordPage.value); records.value = reset ? r.list : [...records.value, ...r.list]; hasMore.value = r.hasMore; recordPage.value++ } catch {} finally { recordsLoading.value = false }
}
function chooseImages() {
  uni.chooseImage({ count: 4 - images.value.length, sizeType: ['compressed'], success: async result => {
    uploading.value = true; error.value = ''
    try { for (const file of result.tempFiles) { if (images.value.length >= 4) break; images.value.push(await api.uploadFile(file)) } } catch (e) { error.value = e.message || '图片上传失败，请重试' } finally { uploading.value = false }
  } })
}
async function send() {
  if (busy.value || uploading.value) return
  error.value = ''; success.value = ''
  if (kind.value === 'restaurant' && !form.name.trim()) { error.value = '请填写店名'; return }
  if (kind.value === 'recipe' && (!form.restaurantId || !form.title.trim() || !form.items.length || form.items.some(it => !it.condimentId))) { error.value = '请选择店铺，填写蘸料名称和调料'; return }
  if (kind.value === 'feedback' && !form.content.trim()) { error.value = '请填写反馈内容'; return }
  busy.value = true
  try {
    const payload = { ...form, kind: kind.value, imageIds: images.value.map(i => i.id), clientToken: token.value }
    const r = recipeId.value && kind.value === 'recipe' ? await recipeApi.update(recipeId.value, payload) : await api.submit(payload)
    success.value = `登记 #${r.submission.id} 已提交，等待管理员审核。`; token.value = api.newToken()
    if (kind.value === 'restaurant') { form.name = ''; form.note = '' }
    if (kind.value === 'feedback') form.content = ''
    if (kind.value === 'recipe' && !recipeId.value) { form.title = ''; form.description = ''; form.servingNote = ''; form.items = []; images.value = []; addItem() }
    await loadRecords()
  } catch (e) { error.value = e.message || '提交失败，请重试' } finally { busy.value = false }
}
onLoad(async options => {
  if (!requireLogin('/pages/feedback/index')) return
  if (kindLabel[options?.kind]) kind.value = options.kind
  recipeId.value = Number(options?.recipeId) || 0
  try {
    const [meta] = await Promise.all([http.get('/api/condiments'), searchShops(), loadRecords()])
    condiments.value = meta.groups.flatMap(g => g.items)
    if (recipeId.value) {
      kind.value = 'recipe'; const r = await recipeApi.detail(recipeId.value)
      if (!r.isAuthor) throw new Error('只能修改自己的配方')
      shops.value = [r.restaurant]; Object.assign(form, { restaurantId: r.restaurant.id, title: r.recipe.title, description: r.recipe.description, servingNote: r.recipe.servingNote,
        items: r.items.map(it => ({ ...it, key: api.newToken() })), tasteTags: r.tags.taste.map(t => t.id), foodTags: r.tags.food.map(t => t.id), sceneTags: r.tags.scene.map(t => t.id) })
      images.value = r.recipe.images
    } else addItem()
    ready.value = true
  } catch (e) { error.value = e.message || '表单加载失败，请重新进入' }
})
</script>
<style scoped>.feedback-shell { max-width: 900px; }.form-title { font-size: 21px; font-weight: 600; margin-bottom: 7px; }.brand-search { margin-bottom: 10px; }.submit-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 26px; }.submit-row .muted { font-size: 12px; }.item-editor { padding: 12px; background: #faf7f2; border: 1px solid #eee4d8; border-radius: 12px; margin: 12px 0; }.item-row { flex-wrap: nowrap; gap: 8px; }.condiment-picker { flex: 1; min-width: 0; }.picker { font-size: 14px; }.item-note { margin-top: 9px; font-size: 13px; background: white; }.remove { margin: 0; padding: 0 7px; background: transparent; font-size: 23px; color: #a88d73; }.remove::after { border: none; }.small { line-height: 32px; font-size: 12px; margin-top: 12px; }.image-preview { position: relative; }.remove-photo { position: absolute; right: 2px; top: 2px; background: #392718bb; color: white; line-height: 24px; width: 24px; padding: 0; font-size: 18px; border-radius: 50%; }.upload-button { border: 1px dashed #c6b39b; color: #917250; font-size: 13px; margin: 0; padding: 30px 0; }.upload-button::after { border: 0; }.success { background: #e9f5e8; color: #43724a; padding: 14px; border-radius: 10px; margin-top: 20px; font-size: 14px; }</style>
