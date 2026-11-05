<template>
  <view>
    <!-- 悬浮入口。只在收起时出现，不挡内容 -->
    <view v-if="!open" class="ai-fab" @click="openPanel">
      <text class="ai-fab-mark">蘸</text>
      <text class="ai-fab-text">AI</text>
    </view>

    <!-- 对话小窗 -->
    <view v-if="open" class="ai-panel" :class="{ 'ai-panel--wide': wide }">
      <view class="ai-head">
        <view class="ai-head-title">
          <text class="ai-dot" />
          <text>蘸料 AI</text>
          <text v-if="!modelEnabled" class="ai-mode">演示模式</text>
        </view>
        <view class="ai-head-actions">
          <text class="ai-icon" @click="toggleWide">{{ wide ? '❐' : '❐' }}</text>
          <text class="ai-icon" @click="close">✕</text>
        </view>
      </view>

      <scroll-view class="ai-body" scroll-y :scroll-into-view="anchor" scroll-with-animation>
        <view v-for="(m, i) in messages" :key="i" :id="'msg-' + i" class="ai-row" :class="m.role === 'user' ? 'ai-row--user' : ''">
          <view class="ai-bubble" :class="m.role === 'user' ? 'ai-bubble--user' : ''">{{ m.content }}</view>
        </view>
        <view v-if="sending" class="ai-row">
          <view class="ai-bubble ai-bubble--typing">正在想…</view>
        </view>
        <view id="ai-bottom" class="ai-bottom-pad" />
      </scroll-view>

      <view v-if="messages.length <= 1" class="ai-chips">
        <text v-for="c in chips" :key="c" class="ai-chip" @click="quick(c)">{{ c }}</text>
      </view>

      <view class="ai-input-row">
        <input
          v-model="draft"
          class="ai-input"
          placeholder="问点什么，比如「清淡一点的」"
          confirm-type="send"
          :disabled="sending"
          @confirm="send()"
        />
        <button class="ai-send" :disabled="sending || !draft.trim()" @click="send()">发送</button>
      </view>
    </view>
  </view>
</template>

<script setup>
// 悬浮对话窗。挂在首页和 AI 页上，不依赖任何路由状态。
//
// 设计取舍：
//  · 会话只存在内存里，刷新即清空 —— 这个场景不需要历史记录，也省得存隐私
//  · 发送时把最近 6 条一起带给后端，模型才能接上「那家店呢」这种指代
//  · 后端没配模型时照常工作，只是回答走规则，头顶显示「演示模式」
import { ref, nextTick, onMounted } from 'vue'
import * as aiApi from './api.js'

const open = ref(false)
const wide = ref(false)
const sending = ref(false)
const draft = ref('')
const anchor = ref('')
const modelEnabled = ref(false)
const messages = ref([
  {
    role: 'assistant',
    content: '我是蘸料的 AI 小助手。可以让我推荐配方、找店，或者问「哪家店清淡一点」。',
  },
])
const chips = ['推荐一份清淡的', '我要辣的', '牛很鲜有什么配方']

onMounted(async () => {
  try {
    const s = await aiApi.status()
    modelEnabled.value = Boolean(s?.enabled)
  } catch {
    modelEnabled.value = false
  }
})

function openPanel() {
  open.value = true
  scrollToBottom()
}

function close() {
  open.value = false
}

function toggleWide() {
  wide.value = !wide.value
}

function scrollToBottom() {
  nextTick(() => {
    anchor.value = ''
    nextTick(() => { anchor.value = 'ai-bottom' })
  })
}

async function send(text) {
  const message = String(text ?? draft.value).trim()
  if (!message || sending.value) return

  draft.value = ''
  messages.value.push({ role: 'user', content: message })
  sending.value = true
  scrollToBottom()

  try {
    const history = messages.value
      .slice(-7, -1)
      .map((m) => ({ role: m.role, content: m.content }))
    const res = await aiApi.chat(message, history)
    modelEnabled.value = res?.mode === 'ai'
    messages.value.push({ role: 'assistant', content: res?.reply || '我没想出来，换个说法试试？' })
  } catch {
    messages.value.push({ role: 'assistant', content: '网络好像不太顺，再发一次试试。' })
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

function quick(text) {
  send(text)
}
</script>

<style scoped>
.ai-fab {
  position: fixed;
  right: 26px;
  bottom: 26px;
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px 10px 10px;
  border-radius: 999px;
  background: #382c24;
  color: #fff;
  box-shadow: 0 10px 26px rgba(56, 44, 36, .28);
  cursor: pointer;
}
.ai-fab-mark {
  width: 30px;
  height: 30px;
  line-height: 30px;
  text-align: center;
  border-radius: 50%;
  background: #c8452e;
  font-size: 15px;
  font-weight: 700;
}
.ai-fab-text { font-size: 13px; letter-spacing: 1px; }

.ai-panel {
  position: fixed;
  right: 26px;
  bottom: 26px;
  z-index: 901;
  width: 352px;
  height: 520px;
  display: flex;
  flex-direction: column;
  background: #fffdfa;
  border: 1px solid #e6dccf;
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(56, 44, 36, .22);
  overflow: hidden;
}
.ai-panel--wide { width: 520px; height: 620px; }

.ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #382c24;
  color: #fff;
}
.ai-head-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
.ai-dot { width: 8px; height: 8px; border-radius: 50%; background: #6fbf8b; }
.ai-mode {
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(255, 255, 255, .16);
  font-size: 11px;
  font-weight: 400;
}
.ai-head-actions { display: flex; gap: 12px; }
.ai-icon { font-size: 14px; opacity: .8; cursor: pointer; }

.ai-body { flex: 1; padding: 14px 14px 0; box-sizing: border-box; }
.ai-row { display: flex; margin-bottom: 10px; }
.ai-row--user { justify-content: flex-end; }
.ai-bubble {
  max-width: 84%;
  padding: 9px 12px;
  border-radius: 12px 12px 12px 4px;
  background: #f3ede4;
  color: #33291f;
  font-size: 13.5px;
  line-height: 1.55;
  word-break: break-word;
}
.ai-bubble--user { background: #c8452e; color: #fff; border-radius: 12px 12px 4px 12px; }
.ai-bubble--typing { color: #8b7a68; font-style: italic; }
.ai-bottom-pad { height: 6px; }

.ai-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 14px 10px; }
.ai-chip {
  padding: 5px 10px;
  border: 1px solid #e2d7c8;
  border-radius: 20px;
  font-size: 12px;
  color: #7a6653;
  background: #fff;
  cursor: pointer;
}

.ai-input-row { display: flex; gap: 8px; padding: 10px 12px 12px; border-top: 1px solid #efe7dc; }
.ai-input {
  flex: 1;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #e2d7c8;
  border-radius: 10px;
  background: #fff;
  font-size: 13.5px;
}
.ai-send {
  margin: 0;
  padding: 0 16px;
  height: 38px;
  line-height: 38px;
  font-size: 13px;
  color: #fff;
  background: #c8452e;
  border-radius: 10px;
}
.ai-send::after { border: none; }
.ai-send[disabled] { opacity: .45; }

@media (max-width: 760px) {
  .ai-panel, .ai-panel--wide { right: 12px; left: 12px; bottom: 12px; width: auto; height: 74vh; }
  .ai-fab { right: 14px; bottom: 18px; }
}
</style>
