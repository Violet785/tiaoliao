<template>
  <view class="panel rating-form">
    <view class="section-title">{{ compact ? '这碗吃起来怎么样？' : '尝过以后，留个评价' }}</view>
    <view class="muted">{{ existing ? '你已经评过这碗，可以在这里修改。' : '每人一条评价，重复提交会更新原评价。' }}</view>
    <view class="row choices"><button v-for="s in choices" :key="s.score" class="ghost" :class="{ selected: score === s.score }" @click="score = s.score">{{ s.label }}</button></view>
    <view class="row stars"><button v-for="n in 5" :key="n" class="star" :class="{ chosen: n <= score }" :aria-label="`${n} 星`" @click="score = n">★</button><text class="muted">{{ score ? `${score} 星` : '请选择评分' }}</text></view>
    <view class="row"><button v-for="tag in tags" :key="tag" class="tag" :class="{ active: selectedTags.includes(tag) }" @click="toggle(tag)">{{ tag }}</button></view>
    <textarea v-model="content" class="textarea" maxlength="500" placeholder="说说味道、用量或缺少的调料（选填）" />
    <view v-if="error" class="error-text">{{ error }}</view><view v-if="saved" class="muted">评价已保存，个人中心也可以查看。</view>
    <view class="row"><button class="btn" :disabled="busy || !score" @click="send">{{ busy ? '保存中…' : existing ? '更新评价' : '提交评价' }}</button><button v-if="existing" class="ghost" :disabled="busy" @click="remove">删除我的评价</button></view>
  </view>
</template>
<script setup>
import { ref, watch } from 'vue'
import { requireLogin } from '../store/user.js'
import { rate, unrate } from '../api/recipe.js'
const props = defineProps({ recipeId: { type: Number, required: true }, existing: { type: Object, default: null }, compact: Boolean })
const emit = defineEmits(['saved'])
const choices = [{ score: 5, label: '好吃' }, { score: 3, label: '一般' }, { score: 1, label: '不喜欢' }], tags = ['太咸', '太辣', '太淡', '用量不清楚', '店里缺调料']
const score = ref(0), content = ref(''), selectedTags = ref([]), busy = ref(false), error = ref(''), saved = ref(false)
watch(() => props.existing, r => { score.value = r?.score || 0; content.value = r?.content || ''; selectedTags.value = [...(r?.feedbackTags || [])] }, { immediate: true })
function toggle(tag) { selectedTags.value = selectedTags.value.includes(tag) ? selectedTags.value.filter(t => t !== tag) : [...selectedTags.value, tag]; saved.value = false }
async function send() {
  if (busy.value || !score.value || !requireLogin(`/pages/recipe/detail?id=${props.recipeId}&review=1`)) return
  busy.value = true; error.value = ''; saved.value = false
  try { await rate(props.recipeId, { score: score.value, content: content.value.trim(), feedbackTags: selectedTags.value, tasteOk: score.value >= 4 ? true : score.value <= 2 ? false : null }); saved.value = true; emit('saved') } catch (e) { error.value = e.message } finally { busy.value = false }
}
async function remove() { if (busy.value) return; busy.value = true; error.value = ''; try { await unrate(props.recipeId); score.value = 0; content.value = ''; selectedTags.value = []; saved.value = false; emit('saved') } catch (e) { error.value = e.message } finally { busy.value = false } }
</script>
<style scoped>.section-title { margin-top: 0; }.choices { margin: 16px 0 4px; }.selected { background: #382c24; color: white; }.stars { margin-bottom: 14px; gap: 4px; }.star { margin: 0; padding: 0 4px; line-height: 40px; background: transparent; color: #d9d0c4; font-size: 30px; }.star::after, .tag::after { border: 0; }.star.chosen { color: #c78920; }.tag { padding: 0 10px; margin: 0; line-height: 32px; font-size: 12px; color: #81664b; border-radius: 18px; background: #f4eee5; }.tag.active { background: #e9d3b6; color: #603d20; }.textarea { margin: 16px 0; min-height: 90px; }</style>
