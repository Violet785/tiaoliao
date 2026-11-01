<template><view><SiteHeader /><view class="shell review-shell"><view class="eyebrow">COMMUNITY REVIEW</view><view class="page-title">审核管理</view><view class="muted">审核店铺、蘸料与用户反馈，通过后自动发布。</view><template v-if="authorized"><view class="tabs"><button v-for="(label, key) in statusLabel" :key="key" class="tab" :class="{ active: status === key }" :disabled="loading || !!busyId" @click="filterStatus(key)">{{ label }}</button></view><view class="row between"><view class="row"><text class="muted">类型</text><picker :range="types" range-key="label" :value="types.findIndex(t => t.key === kind)" :disabled="loading || !!busyId" @change="kind = types[$event.detail.value].key; load(true)"><view class="picker">{{ types.find(t => t.key === kind).label }} ⌄</view></picker></view><button class="ghost" :disabled="loading || !!busyId" @click="load(true)">刷新</button></view><view class="muted total">共 {{ total }} 条{{ statusLabel[status] }}记录</view><SubmissionCard v-for="r in records" :key="r.id" :record="r"><view v-if="r.status === 'pending'" class="actions"><textarea v-model="notes[r.id]" class="textarea review-input" maxlength="500" placeholder="审核意见（驳回时必填）" /><view class="row"><button class="btn" :disabled="!!busyId" @click="decide(r, 'approve')">{{ busyId === r.id ? '处理中…' : r.kind === 'feedback' ? '标记已处理' : '通过并发布' }}</button><button class="ghost" :disabled="!!busyId" @click="decide(r, 'reject')">驳回</button></view></view></SubmissionCard><view v-if="error" class="error-text">{{ error }}</view><view v-if="!records.length" class="empty">{{ loading ? '加载中…' : error ? '加载失败，请重试' : '当前没有需要处理的记录' }}</view><button v-if="hasMore" class="ghost" :disabled="loading || !!busyId" @click="load(false)">加载更多</button></template><view v-else class="empty">{{ checking ? '正在验证管理员权限…' : '此页面仅限管理员访问' }}</view></view></view></template>
<script setup>
import { ref, reactive } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import SubmissionCard from '../../components/SubmissionCard.vue'
import { useUserStore, requireLogin } from '../../store/user.js'
import * as api from '../../api/community.js'
import { kindLabel, statusLabel } from '../../api/community.js'
const store = useUserStore(), authorized = ref(false), checking = ref(true), status = ref('pending'), kind = ref(''), records = ref([]), total = ref(0), hasMore = ref(false), page = ref(1), loading = ref(false), busyId = ref(0), notes = reactive({}), error = ref('')
const types = [{ key: '', label: '全部类型' }, ...Object.entries(kindLabel).map(([key, label]) => ({ key, label }))]
async function load(reset = true) { if (loading.value) return; loading.value = true; error.value = ''; if (reset) page.value = 1; try { const r = await api.queue({ status: status.value, kind: kind.value, page: page.value }); records.value = reset ? r.list : [...records.value, ...r.list]; total.value = r.total; hasMore.value = r.hasMore; page.value++ } catch (e) { error.value = e.message } finally { loading.value = false } }
function filterStatus(s) { status.value = s; load() }
async function decide(record, action) {
  const note = (notes[record.id] || '').trim()
  if (action === 'reject' && !note) { uni.showToast({ title: '请填写驳回原因', icon: 'none' }); return }
  if (busyId.value) return; busyId.value = record.id
  try { await api.review(record.id, action, note); delete notes[record.id]; await load(); uni.showToast({ title: action === 'approve' ? '已审核通过' : '已驳回', icon: 'none' }) } catch (e) { error.value = e.message; if (e.code === 409) await load() } finally { busyId.value = 0 }
}
onShow(async () => { checking.value = true; try { if (!requireLogin('/pages/admin/review')) return; await store.refresh(); authorized.value = store.isAdmin; if (authorized.value) await load() } catch { authorized.value = false } finally { checking.value = false } })
</script>
<style scoped>.review-shell { max-width: 1000px; }.total { margin-top: 18px; }.actions { border-top: 1px solid #eee5da; padding-top: 18px; margin-top: 20px; }.review-input { min-height: 80px; margin-bottom: 14px; }</style>
