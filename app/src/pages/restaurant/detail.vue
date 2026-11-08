<template><view><SiteHeader /><view class="shell"><template v-if="shop">
  <view class="eyebrow">GOOD DIPS, SHARED HERE</view><view class="row between"><view><view class="page-title">{{ shop.name }}</view><view class="muted">{{ shop.category }} · {{ shop.recipeCount }} 份蘸料配方</view></view><view class="row"><button class="ghost smart-entry" :class="{ selected: sort === 'smart' }" @click="changeSort('smart')">智能推荐</button><button class="btn" @click="submit">分享这家店的蘸料</button></view></view>
  <view v-if="shop.note" class="panel muted">{{ shop.note }}</view>
  <RecipeFilters v-model="filters" @change="load(true)" />
  <view class="tabs"><button v-for="s in sorts" :key="s.key" class="tab" :class="{ active: sort === s.key }" @click="changeSort(s.key)">{{ s.label }}</button></view>
  <view v-if="sort === 'smart'" class="panel smart-summary">
    <view class="row between"><view class="section-title">为你推荐 · {{ shop.name }}</view><button class="ghost" :disabled="loading" @click="load(true)">重新推荐</button></view>
    <template v-if="recommendation"><view v-if="recommendation.personalized" class="muted">参考你在全站的 {{ recommendation.feedback.likes }} 次点赞、{{ recommendation.feedback.dislikes }} 次不喜欢，只挑这家店的配方。</view><view v-else class="muted">{{ recommendation.loginRequired ? '登录后，会根据你的点赞和不喜欢调整推荐。现在先看看本店推荐。' : '还没有点赞或不喜欢记录，先按本店点赞和使用情况推荐。' }}</view><view v-if="recommendation.loginRequired" class="login-row"><button class="ghost" @click="login">登录，开启个性化推荐</button></view><view class="muted smart-note">与点赞配方相近的口味优先；不喜欢的配方不会出现在这里，相近口味会降低排序。点赞、取消或改成不喜欢后，推荐会更新。</view><view v-if="recommendation.excludedCount" class="muted smart-note">已排除 {{ recommendation.excludedCount }} 份你不喜欢的配方。</view><view v-if="recommendation.eligibleCount > recipes.length" class="muted smart-note">先推荐 {{ recipes.length }} 份，可以切换「最热」查看本店全部配方。</view></template><view v-else class="muted">正在整理本店推荐…</view>
  </view>
  <view v-if="loading" class="empty">{{ sort === 'smart' ? '正在按你的喜好挑选…' : '加载中…' }}</view><view v-else-if="failed" class="empty"><view>加载失败</view><button class="ghost" @click="load(true)">重新加载</button></view><template v-else><view class="grid recipe-grid"><RecipeCard v-for="r in recipes" :key="r.id" :recipe="r" :show-restaurant="false" @select="go" @voted="voted" /></view><view v-if="!recipes.length" class="empty"><view>{{ emptyMessage }}</view><button v-if="sort === 'smart' && recommendation?.emptyReason === 'all_disliked'" class="ghost" @click="changeSort('hot')">查看全部配方，调整喜好</button></view></template><button v-if="hasMore && !loading" class="ghost more" :disabled="loadingMore" @click="load(false)">加载更多</button>
</template><view v-else class="empty">{{ loading ? '加载中…' : '店铺不存在或暂时无法加载' }}</view></view><AiChat v-if="shop" :restaurant="shop" /></view></template>
<script setup>
import { ref, computed, watch } from 'vue'
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
import AiChat from '../../ai/chat-widget.vue'
import RecipeCard from '../../components/RecipeCard.vue'
import RecipeFilters from '../../components/RecipeFilters.vue'
import * as api from '../../api/restaurant.js'
import { SORTS } from '../../api/recipe.js'
import { useUserStore, requireLogin } from '../../store/user.js'
const user = useUserStore(), id = ref(0), shop = ref(null), recipes = ref([]), sort = ref('hot'), page = ref(1), hasMore = ref(false), loading = ref(false), loadingMore = ref(false), failed = ref(false), recommendation = ref(null)
const sorts = [{ key: 'smart', label: '智能推荐' }, ...SORTS]
const filters = ref({ keyword: '', spice: '', tasteTag: '', foodTag: '', exclude: '' })
const emptyMessage = computed(() => !shop.value?.recipeCount ? '这家店还没有配方，欢迎通过「反馈登记」分享一碗。' : sort.value === 'smart' && recommendation.value?.emptyReason === 'all_disliked' ? '符合当前筛选的配方都被你标记为不喜欢，暂不推荐。可以在全部配方中调整喜好。' : '没有符合条件的配方，可以减少筛选条件再试试。')
let requestId = 0
async function load(reset = true) {
  if (!id.value || (!reset && (loading.value || loadingMore.value))) return
  const request = ++requestId, nextPage = reset ? 1 : page.value, mode = sort.value, token = user.token, selectedFilters = { ...filters.value }
  if (reset) loading.value = true; else loadingMore.value = true
  try {
    const detail = await api.detail(id.value)
    const r = mode === 'smart' ? await api.recommendations(detail.restaurant.id, selectedFilters) : await api.recipes(detail.restaurant.id, { ...selectedFilters, page: nextPage, sort: mode })
    if (request !== requestId || token !== user.token) return
    shop.value = detail.restaurant; recipes.value = reset ? r.list : [...recipes.value, ...r.list]; recommendation.value = mode === 'smart' ? r : null; hasMore.value = mode !== 'smart' && r.hasMore; page.value = nextPage + 1; failed.value = false
  } catch { if (request === requestId) failed.value = true } finally { if (request === requestId) { loading.value = false; loadingMore.value = false } }
}
function changeSort(mode) { if (sort.value !== mode) { recommendation.value = null; recipes.value = [] }; sort.value = mode; load(true) }
function voted(value) { const recipe = recipes.value.find(r => r.id === value.recipeId); if (recipe) Object.assign(recipe, value); if (sort.value === 'smart') load(true) }
function go(r) { uni.navigateTo({ url: `/pages/recipe/detail?id=${r.id}` }) }
function submit() { const url = `/pages/feedback/index?kind=recipe&restaurantId=${shop.value.id}`; if (requireLogin(url)) uni.navigateTo({ url }) }
function login() { uni.navigateTo({ url: `/pages/common/login?redirect=${encodeURIComponent(`/pages/restaurant/detail?id=${id.value}&mode=smart`)}` }) }
watch(() => user.token, () => { recommendation.value = null; recipes.value = []; if (id.value) load(true) })
onLoad(o => { id.value = Number(o?.id); if (o?.mode === 'smart') sort.value = 'smart'; load() }); onShow(() => { if (shop.value) load() }); onPullDownRefresh(async () => { await load(); uni.stopPullDownRefresh() })
</script>
<style scoped>.more { margin: 25px auto; }.smart-entry { background: #f5e8d4; border-color: #dfcaab; color: #8b542e; }.smart-entry.selected { background: #382c24; border-color: #382c24; color: white; }.smart-summary { background: #fff9ef; border-color: #e7d4b9; }.smart-summary .section-title { margin: 0; font-size: 20px; }.smart-summary>.muted { margin-top: 12px; line-height: 1.8; }.smart-summary .smart-note { font-size: 12px; }.login-row { margin-top: 14px; }</style>