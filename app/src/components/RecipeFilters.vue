<template>
  <view class="panel filters">
    <view class="row"><input v-model="keyword" class="search-input" maxlength="60" placeholder="搜配方、调料或店名" confirm-type="search" @confirm="change('keyword', keyword.trim())" /><button class="btn" @click="change('keyword', keyword.trim())">搜索配方</button></view>
    <view class="filter-line"><text class="filter-label">辣度</text><button v-for="s in spices" :key="s.id" class="chip" :class="{ selected: modelValue.spice === s.id }" @click="change('spice', s.id)">{{ s.name }}</button></view>
    <view class="filter-line"><text class="filter-label">口味</text><picker :range="tastes" range-key="name" :value="Math.max(0, tastes.findIndex(t => t.id === modelValue.tasteTag))" @change="change('tasteTag', tastes[$event.detail.value].id)"><view class="picker">{{ tastes.find(t => t.id === modelValue.tasteTag)?.name || '不限口味' }} ⌄</view></picker><text class="filter-label">食材</text><picker :range="foods" range-key="name" :value="Math.max(0, foods.findIndex(t => t.id === modelValue.foodTag))" @change="change('foodTag', foods[$event.detail.value].id)"><view class="picker">{{ foods.find(t => t.id === modelValue.foodTag)?.name || '不限食材' }} ⌄</view></picker></view>
    <view class="filter-line"><text class="filter-label">不想放</text><button v-for="s in exclusions" :key="s.name" class="chip" :class="{ selected: isExcluded(s) }" @click="toggle(s)">{{ s.name }}</button><button class="clear" @click="reset">清空筛选</button></view>
    <view class="muted filter-note">辣度由配方用量估算；排除项只核对已登记调料，复合酱料成分请向店员确认。</view>
    <view v-if="metaFailed" class="row"><text class="muted">口味和食材选项加载失败</text><button class="clear" @click="loadMeta">重试</button></view>
  </view>
</template>
<script setup>
import { ref, watch, onMounted } from 'vue'
import { http } from '../api/request.js'
const props = defineProps({ modelValue: { type: Object, required: true } })
const emit = defineEmits(['update:modelValue', 'change'])
const keyword = ref(props.modelValue.keyword || ''), tastes = ref([{ id: '', name: '不限口味' }]), foods = ref([{ id: '', name: '不限食材' }]), metaFailed = ref(false)
const spices = [{ id: '', name: '不限' }, { id: 'none', name: '不辣' }, { id: 'mild', name: '微辣' }, { id: 'medium', name: '中辣' }, { id: 'hot', name: '重辣' }]
const exclusions = [{ name: '香菜', ids: ['aroma_cilantro'] }, { name: '蒜', ids: ['aroma_garlic_minced', 'aroma_garlic_paste', 'oil_garlic', 'crunch_garlic_fried'] }, { name: '葱', ids: ['aroma_scallion', 'oil_scallion', 'crunch_shallot_fried'] }, { name: '花生', ids: ['paste_peanut', 'oil_peanut', 'crunch_peanut'] }]
watch(() => props.modelValue.keyword, v => { keyword.value = v || '' })
function change(key, value) { const next = { ...props.modelValue, [key]: value }; emit('update:modelValue', next); emit('change', next) }
function isExcluded(s) { const ids = (props.modelValue.exclude || '').split(','); return s.ids.every(id => ids.includes(id)) }
function toggle(s) { const ids = new Set((props.modelValue.exclude || '').split(',').filter(Boolean)); if (isExcluded(s)) s.ids.forEach(id => ids.delete(id)); else s.ids.forEach(id => ids.add(id)); change('exclude', [...ids].join(',')) }
function reset() { keyword.value = ''; const next = { keyword: '', spice: '', tasteTag: '', foodTag: '', exclude: '' }; emit('update:modelValue', next); emit('change', next) }
async function loadMeta() { try { const data = await http.get('/api/tags', undefined, { silent: true }); tastes.value = [{ id: '', name: '不限口味' }, ...data.grouped.taste]; foods.value = [{ id: '', name: '不限食材' }, ...data.grouped.food]; metaFailed.value = false } catch { metaFailed.value = true } }
onMounted(loadMeta)
</script>
<style scoped>
.filters { margin: 22px 0; }.filter-line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 16px; }.filter-label { font-size: 13px; color: #8a7762; margin-right: 4px; }.chip { margin: 0; padding: 0 14px; line-height: 34px; font-size: 13px; border: 1px solid #e5dace; border-radius: 18px; color: #6d5945; background: #faf6ef; }.chip::after, .clear::after { border: 0; }.chip.selected { background: #382c24; color: #fff; border-color: #382c24; }.picker { min-height: 36px; padding: 6px 12px; font-size: 13px; }.clear { padding: 0 8px; margin: 0; background: transparent; font-size: 12px; color: #a45334; line-height: 34px; }.filter-note { font-size: 11px; margin-top: 14px; line-height: 1.6; }
</style>
