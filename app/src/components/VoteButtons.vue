<template>
  <view class="votes" @click.stop>
    <button :class="{ chosen: state.myVote === 1 }" :disabled="busy" :aria-pressed="state.myVote === 1" aria-label="点赞" @click="cast(1)"><image class="thumb" src="/static/thumb.svg" /><text>{{ state.likeCount || 0 }}</text></button>
    <button :class="{ chosen: state.myVote === -1 }" :disabled="busy" :aria-pressed="state.myVote === -1" aria-label="差评" @click="cast(-1)"><image class="thumb down" src="/static/thumb.svg" /><text>{{ state.dislikeCount || 0 }}</text></button>
  </view>
</template>
<script setup>
import { ref, watch } from 'vue'
import { http } from '../api/request.js'
import { requireLogin } from '../store/user.js'
const props = defineProps({ recipe: { type: Object, required: true } })
const emit = defineEmits(['change'])
const state = ref({}), busy = ref(false)
watch(() => props.recipe, r => { state.value = { likeCount: r.likeCount, dislikeCount: r.dislikeCount, myVote: r.myVote } }, { immediate: true, deep: true })
async function cast(value) {
  if (busy.value || !requireLogin(`/pages/recipe/detail?id=${props.recipe.id}`)) return
  busy.value = true
  try { state.value = await http.put(`/api/recipes/${props.recipe.id}/vote`, { value: state.value.myVote === value ? 0 : value }); emit('change', { recipeId: props.recipe.id, ...state.value }) } catch {} finally { busy.value = false }
}
</script>
<style scoped>
.votes { display: flex; gap: 8px; }
button { margin: 0; display: flex; align-items: center; gap: 6px; padding: 0 12px; line-height: 34px; border: 1px solid #e9e0d6; border-radius: 20px; background: #fff; color: #80705e; font-size: 13px; cursor: pointer; }
button::after { border: none; } button.chosen { border-color: #c65b3a; color: #b3452b; background: #fff0e8; }
.thumb { width: 17px; height: 17px; opacity: .8; } .down { transform: rotate(180deg); }
</style>
