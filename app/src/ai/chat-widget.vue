<template>
  <view>
    <button v-if="!open" class="ai-fab" aria-label="打开蘸料 AI" @click="openPanel"><text class="ai-fab-mark">蘸</text><text>AI</text></button>
    <view v-if="open" class="ai-panel" :class="{ 'ai-panel--wide': wide }">
      <view class="ai-head"><view class="ai-head-title"><text class="ai-dot" /><text>蘸料 AI</text></view><view class="ai-head-actions"><button :aria-label="wide ? '收起宽屏' : '展开宽屏'" @click="wide = !wide">{{ wide ? '收' : '宽' }}</button><button aria-label="关闭对话" @click="open = false">关</button></view></view>
      <view class="ai-context"><view class="context-row"><text>{{ selectedRestaurant ? `当前店铺：${selectedRestaurant.name}` : '先选店铺，再推荐蘸料' }}</text><button :disabled="sending" @click="togglePicker">{{ pickerOpen ? '收起选店' : selectedRestaurant ? '换店' : '选店' }}</button></view><view v-if="labels.length" class="context-labels">{{ labels.join(' · ') }}</view><view v-else class="context-labels">本次口味不限</view><view class="context-tools"><button @click="resetTaste">重置口味</button><button @click="resetConversation(true)">清空对话</button></view></view>
      <view v-if="pickerOpen" class="store-picker"><view class="store-search"><input v-model="storeQuery" maxlength="60" placeholder="搜索店名" confirm-type="search" @confirm="searchStores" /><button :disabled="storesLoading" @click="searchStores">查找</button></view><scroll-view scroll-y class="store-results"><button v-for="shop in stores" :key="shop.id" :disabled="sending" @click="choose(shop)">{{ shop.name }}<text>{{ shop.recipeCount }} 份配方</text></button><view v-if="storesLoading" class="store-hint">正在找店铺…</view><view v-else-if="storesFailed" class="store-hint">加载失败，请重新查找。</view><view v-else-if="!stores.length" class="store-hint">没找到店名，可以输入更完整的名称。</view></scroll-view></view>
      <scroll-view class="ai-body" scroll-y :scroll-into-view="anchor" scroll-with-animation>
        <view v-for="(m, i) in messages" :key="i" :id="'msg-' + i" class="ai-row" :class="{ 'ai-row--user': m.role === 'user' }">
          <view class="ai-bubble" :class="{ 'ai-bubble--user': m.role === 'user' }">{{ m.content }}</view>
          <view v-if="m.options?.length" class="message-options"><button v-for="shop in m.options" :key="shop.id" :disabled="sending" @click="choose(shop)">{{ shop.name }}</button></view>
          <view v-if="m.cards?.length" class="message-cards"><AiRecipeCard v-for="recipe in m.cards" :key="recipe.id" :recipe="recipe" @voted="v => voted(recipe, m, v)" /><view v-if="m.feedbackSaved" class="feedback-saved">喜好已更新，再推荐时会按新反馈调整。</view></view>
          <button v-if="m.retry && lastFailure" class="retry-message" :disabled="sending" @click="retry">重新发送</button>
        </view>
        <view v-if="sending" class="ai-row"><view class="ai-bubble ai-bubble--typing">正在确认店铺和配方…</view></view><view id="ai-bottom" class="ai-bottom-pad" />
      </scroll-view>
      <view v-if="messages.length <= 1" class="ai-chips"><button v-for="text in chips" :key="text" :disabled="sending" @click="send(text)">{{ text }}</button></view>
      <view class="ai-input-row"><input v-model="draft" class="ai-input" maxlength="300" :placeholder="selectedRestaurant ? '说说口味，比如不辣、不要香菜' : '先说店名，比如海底捞，想吃不辣的'" confirm-type="send" :disabled="sending" @confirm="send()" /><button class="ai-send" :disabled="sending || !draft.trim()" @click="send()">发送</button></view>
    </view>
  </view>
</template>
<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import * as aiApi from './api.js'
import * as restaurantApi from '../api/restaurant.js'
import { useUserStore } from '../store/user.js'
import AiRecipeCard from './recipe-card.vue'
const props = defineProps({ restaurant: { type: Object, default: null } })
const user = useUserStore(), open = ref(false), wide = ref(false), sending = ref(false), draft = ref(''), anchor = ref(''), selectedRestaurant = ref(null), preferences = ref({}), labels = ref([]), messages = ref([]), pickerOpen = ref(false), storeQuery = ref(''), stores = ref([]), storesLoading = ref(false), storesFailed = ref(false), lastFailure = ref(null)
const chips = computed(() => selectedRestaurant.value ? ['推荐不辣的', '不要香菜', '来点蒜香的'] : ['海底捞有什么蘸料', '牛NEW，不要香菜', '龍歌，想吃微辣的'])
let epoch = 0, searchId = 0
function resetConversation(keepCurrent = false) {
  const current = keepCurrent ? selectedRestaurant.value : props.restaurant
  epoch++; sending.value = false; draft.value = ''; lastFailure.value = null; preferences.value = {}; labels.value = []; pickerOpen.value = false
  selectedRestaurant.value = current ? { id: current.id, name: current.name, recipeCount: current.recipeCount } : null
  messages.value = [{ role: 'assistant', content: selectedRestaurant.value ? `当前是${selectedRestaurant.value.name}。想吃什么口味，或者哪些调料不想放？我会给你这家店的蘸料名片。` : '这次在哪家店吃？告诉我店名和口味，我会先确认店铺，再给你带调料用量的蘸料名片。' }]
}
watch(() => props.restaurant?.id, () => resetConversation(), { immediate: true })
watch(() => user.token, () => resetConversation())
function resetTaste() {
  epoch++; sending.value = false; preferences.value = {}; labels.value = []; draft.value = ''; lastFailure.value = null; pickerOpen.value = false
  messages.value.push({ role: 'assistant', content: selectedRestaurant.value ? `本次口味要求已清空，当前仍是${selectedRestaurant.value.name}。可以重新告诉我想吃什么口味。` : '本次口味要求已清空。选好店铺后，可以重新告诉我想吃什么口味。' })
  scrollTo('msg-' + (messages.value.length - 1))
}
function scrollTo(id = 'ai-bottom') { nextTick(() => { anchor.value = ''; nextTick(() => { anchor.value = id }) }) }
function openPanel() { open.value = true; if (!selectedRestaurant.value) { pickerOpen.value = true; searchStores() }; scrollTo() }
function togglePicker() { pickerOpen.value = !pickerOpen.value; if (pickerOpen.value) searchStores() }
async function searchStores() {
  const request = ++searchId; storesLoading.value = true; storesFailed.value = false
  try { const result = await restaurantApi.list({ keyword: storeQuery.value.trim(), pageSize: 8 }); if (request === searchId) stores.value = result.list } catch { if (request === searchId) storesFailed.value = true } finally { if (request === searchId) storesLoading.value = false }
}
function choose(shop) { if (sending.value) return; selectedRestaurant.value = shop; pickerOpen.value = false; send(`就选${shop.name}`) }
async function send(text, retrying = false) {
  const message = String(text ?? draft.value).trim()
  if (!message || sending.value) return
  const generation = epoch, restaurantId = selectedRestaurant.value?.id || null, selectedPreferences = { ...preferences.value }
  draft.value = ''; if (!retrying) messages.value.push({ role: 'user', content: message }); sending.value = true; lastFailure.value = null; scrollTo()
  try {
    const history = messages.value.slice(-7, -1).map(m => ({ role: m.role, content: m.content }))
    const result = await aiApi.chat(message, history, { restaurantId, preferences: selectedPreferences })
    if (generation !== epoch) return
    selectedRestaurant.value = result.restaurant || null; preferences.value = result.preferences || {}; labels.value = result.preferenceSummary || []; pickerOpen.value = false
    messages.value.push({ role: 'assistant', content: result.reply || '请再确认一下店名和口味。', options: result.restaurantOptions || [], cards: result.cards || [] })
    scrollTo('msg-' + (messages.value.length - 1))
  } catch (error) {
    if (generation !== epoch) return
    lastFailure.value = { message, restaurantId, preferences: selectedPreferences }
    messages.value.push({ role: 'assistant', content: error?.message || '这次没有发送成功，可以重新发送，或调整店名和口味后再试。', retry: true }); scrollTo()
  } finally { if (generation === epoch) sending.value = false }
}
function retry() { const failure = lastFailure.value; if (failure) send(failure.message, true) }
function voted(recipe, message, state) { Object.assign(recipe, state); message.feedbackSaved = true }
</script>
<style scoped>
.ai-fab { position: fixed; right: 26px; bottom: 26px; z-index: 900; display: flex; align-items: center; gap: 8px; margin: 0; padding: 10px 16px 10px 10px; border-radius: 999px; background: #382c24; color: #fff; box-shadow: 0 10px 26px #382c2447; font-size: 13px; line-height: 30px; }.ai-fab::after { border: 0; }.ai-fab-mark { width: 30px; line-height: 30px; text-align: center; border-radius: 50%; background: #c8452e; font-size: 15px; font-weight: 700; }
.ai-panel { position: fixed; right: 26px; bottom: 26px; z-index: 901; width: 390px; height: 640px; max-height: calc(100vh - 52px); max-height: calc(100dvh - 52px); display: flex; flex-direction: column; background: #fffdfa; border: 1px solid #e6dccf; border-radius: 18px; box-shadow: 0 18px 48px #382c2438; overflow: hidden; }.ai-panel--wide { width: 580px; height: 760px; }
.ai-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #382c24; color: white; flex-shrink: 0; }.ai-head-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }.ai-dot { width: 8px; height: 8px; border-radius: 50%; background: #6fbf8b; }.ai-head-actions { display: flex; gap: 12px; }.ai-head-actions button { background: transparent; color: #f5e6d2; font-size: 12px; line-height: 28px; margin: 0; padding: 0 4px; }.ai-head-actions button::after { border: 0; }
.ai-context { padding: 10px 14px; border-bottom: 1px solid #ede2d1; background: #faf0e0; flex-shrink: 0; }.context-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: #765333; }.context-row button { padding: 0 10px; line-height: 28px; margin: 0; font-size: 11px; background: #fffdf7; border: 1px solid #e4d0b3; color: #95633e; border-radius: 8px; flex-shrink: 0; }.context-row button::after { border: 0; }.context-labels { color: #a78a68; font-size: 10px; line-height: 1.6; margin-top: 4px; overflow-wrap: anywhere; }
.context-tools { display: flex; gap: 12px; margin-top: 5px; }.context-tools button { margin: 0; padding: 0 6px; line-height: 26px; font-size: 11px; color: #9a6035; background: transparent; }.context-tools button::after { border: 0; }
.store-picker { padding: 10px 14px; border-bottom: 1px solid #eee3d6; flex-shrink: 0; }.store-search { display: flex; gap: 6px; }.store-search input { flex: 1; min-width: 0; font-size: 12px; border: 1px solid #e7d9c8; border-radius: 8px; padding: 6px 10px; }.store-search button { line-height: 32px; font-size: 12px; color: #8c6340; background: #f4eadb; margin: 0; }.store-search button::after { border: 0; }.store-results { max-height: 140px; margin-top: 8px; }.store-results button { display: flex; justify-content: space-between; background: transparent; text-align: left; margin: 0; padding: 0 6px; font-size: 12px; color: #634b34; line-height: 34px; }.store-results button::after { border: 0; }.store-results button text { font-size: 10px; color: #ae977c; }.store-hint { font-size: 11px; color: #a58a6c; padding: 8px 0; }
.ai-body { flex: 1; height: 0; min-height: 0; padding: 14px 14px 0; box-sizing: border-box; }.ai-row { display: flex; flex-direction: column; align-items: flex-start; margin-bottom: 12px; }.ai-row--user { align-items: flex-end; }.ai-bubble { max-width: 90%; padding: 9px 12px; box-sizing: border-box; border-radius: 12px 12px 12px 4px; background: #f3ede4; color: #33291f; font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; }.ai-bubble--user { background: #c8452e; color: white; border-radius: 12px 12px 4px 12px; }.ai-bubble--typing { color: #8b7a68; }.message-options { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }.message-options button { margin: 0; background: #fff; border: 1px solid #dfc9ac; border-radius: 18px; color: #93623c; font-size: 12px; padding: 0 12px; line-height: 32px; }.message-options button::after { border: 0; }.message-cards { width: 100%; }.feedback-saved { color: #8b765c; font-size: 11px; margin-top: 8px; }.retry-message { background: #fff; border: 1px solid #e1c9aa; padding: 0 10px; line-height: 30px; margin: 8px 0 0; color: #a36a3b; font-size: 12px; }.retry-message::after { border: 0; }.ai-bottom-pad { height: 8px; }
.ai-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 14px 10px; flex-shrink: 0; }.ai-chips button { padding: 0 9px; line-height: 30px; border: 1px solid #e2d7c8; border-radius: 20px; font-size: 11px; color: #7a6653; background: #fff; margin: 0; }.ai-chips button::after { border: 0; }.ai-input-row { display: flex; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid #efe7dc; flex-shrink: 0; }.ai-input { flex: 1; min-width: 0; height: 38px; padding: 0 10px; border: 1px solid #e2d7c8; border-radius: 10px; background: #fff; font-size: 12px; }.ai-send { margin: 0; padding: 0 14px; height: 38px; line-height: 38px; font-size: 12px; color: #fff; background: #c8452e; border-radius: 10px; }.ai-send::after { border: none; }.ai-send[disabled] { opacity: .45; }
@media (max-width:760px) { .ai-panel,.ai-panel--wide { right: 12px; left: 12px; bottom: 12px; width: auto; height: 82vh; height: 82dvh; max-height: calc(100dvh - 24px); }.ai-fab { right: 14px; bottom: 18px; } }
</style>
