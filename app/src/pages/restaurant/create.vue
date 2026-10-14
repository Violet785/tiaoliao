<template>
  <view class="page">
    <view class="row">
      <view class="label">店名<text class="req">*</text></view>
      <input
        class="input"
        v-model="name"
        type="text"
        maxlength="40"
        placeholder="照招牌写，别自己简化"
        placeholder-class="ph"
      />
      <view class="tip">带不带「店」字、有没有「（xx 分店）」，会影响以后别人能不能搜到</view>
    </view>

    <view class="row">
      <view class="label">城市</view>
      <input class="input" v-model="city" type="text" maxlength="20" placeholder="杭州" placeholder-class="ph" />
    </view>

    <view class="row">
      <view class="label">详细地址</view>
      <input
        class="input"
        v-model="address"
        type="text"
        maxlength="80"
        placeholder="上城区延安路 98 号西湖银泰 5 层"
        placeholder-class="ph"
      />
    </view>

    <view class="row">
      <view class="label">怎么找到它</view>
      <input
        class="input"
        v-model="landmark"
        type="text"
        maxlength="60"
        placeholder="西湖银泰 5 楼，苹果店楼上"
        placeholder-class="ph"
      />
      <view class="tip">在商场里看门牌号是没用的，写「几楼、什么旁边」</view>
    </view>

    <view class="row">
      <view class="label">类型</view>
      <view class="chips">
        <view
          v-for="c in restaurantApi.CATEGORIES"
          :key="c"
          class="chip"
          :class="{ 'chip-on': c === category }"
          @click="category = c"
        >
          {{ c }}
        </view>
      </view>
    </view>

    <view class="row">
      <view class="label">这家店的调料台有什么特别的</view>
      <textarea
        class="textarea"
        v-model="note"
        maxlength="200"
        placeholder="比如：麻酱是没调过的纯芝麻酱，得自己澥开；没有小米辣"
        placeholder-class="ph"
      />
      <view class="tip">这条比配方还值钱 —— 下一个人就靠它少走弯路</view>
    </view>

    <button class="submit" :disabled="submitting" hover-class="submit-hover" @click="submit(false)">
      {{ submitting ? '提交中…' : '建 立' }}
    </button>

    <view class="foot">别人搜不到这家店，多半是名字写得跟招牌不一样</view>

    <!-- 相似候选面板 -->
    <view v-if="showCandidates" class="mask" @click="showCandidates = false">
      <view class="sheet" @click.stop>
        <view class="sheet-title">已经有人建过这些店</view>
        <view class="sheet-sub">是其中一家吗？是的话别再建一次，选它就行</view>

        <scroll-view class="sheet-list" scroll-y>
          <view
            v-for="c in candidates"
            :key="c.id"
            class="cand"
            hover-class="cand-hover"
            @click="pickCandidate(c)"
          >
            <view class="cand-name">{{ c.name }}</view>
            <view v-if="c.city || c.address" class="cand-addr">
              <text v-if="c.city">{{ c.city }} · </text>{{ c.address }}
            </view>
            <view class="cand-why">
              <text class="cand-score">{{ Math.round(c.score * 100) }}% 像</text>
              <text v-if="c.matchReason">{{ c.matchReason }}</text>
              <text v-if="c.recipeCount > 0">· 已有 {{ c.recipeCount }} 个配方</text>
            </view>
          </view>
        </scroll-view>

        <button class="sheet-btn ghost" hover-class="ghost-hover" @click="confirmForceCreate">
          都不是，新建一家
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import * as restaurantApi from '../../api/restaurant.js'
import { toast } from '../../utils/feedback.js'
import { requireLogin } from '../../store/user.js'

const name = ref('')
const city = ref('')
const address = ref('')
const landmark = ref('')
const category = ref('自助餐')
const note = ref('')

const submitting = ref(false)
const showCandidates = ref(false)
const candidates = ref([])

/**
 * 幂等令牌 —— 这次建店会话的身份证。
 *
 * 弱网下用户可能连点两次提交，或者第一次请求其实建成功了只是响应超时。
 * 同一个 token 提交第二次，服务端会把第一次建的那家原样返回，
 * 而不是在数据库里多出一家一模一样的店。整个会话共用一个，不重新生成。
 */
const clientToken = `r_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

onLoad((options) => {
  // 从「搜不到」那条路径过来时会带上搜索词当店名预填
  const preset = options?.name
  if (preset) name.value = decodeURIComponent(preset)

  // 建店要登录，进门就拦，别等填完一整个表单再说。
  //
  // 刻意不传 redirect：登录成功后登录页会 navigateBack 回到本页，
  // 页面还在栈里，上面预填的店名不会丢。此刻表单本来也是空的。
  requireLogin()
})

async function submit(forceCreate) {
  const trimmed = name.value.trim()
  if (!trimmed) {
    toast('先写个店名')
    return
  }

  submitting.value = true
  try {
    const res = await restaurantApi.create({
      name: trimmed,
      city: city.value.trim(),
      address: address.value.trim(),
      landmark: landmark.value.trim(),
      category: category.value,
      note: note.value.trim(),
      clientToken,
      forceCreate,
    })

    // 201 = 新建成功；200 = 命中了已存在的店（同名同址或高度相似）。
    // 两种都当成功 —— 用户的目的达到了，是新建还是复用了已有的不重要。
    showCandidates.value = false
    uni.redirectTo({ url: `/pages/restaurant/detail?id=${res.restaurant.id}` })
  } catch (err) {
    // 409 带候选：让用户自己判断是不是同一家。
    // 服务端刻意不替用户决定 —— 自动合并会把两家不同店的数据搅在一起。
    const list = err?.extra?.candidates
    if (list?.length) {
      candidates.value = list
      showCandidates.value = true
    }
    // 其余错误 request.js 已经弹过 toast 了
  } finally {
    submitting.value = false
  }
}

function pickCandidate(c) {
  showCandidates.value = false
  uni.redirectTo({ url: `/pages/restaurant/detail?id=${c.id}` })
}

/** 用户确认「都不是」—— 带上 forceCreate 重提，走同一个 clientToken */
function confirmForceCreate() {
  showCandidates.value = false
  submit(true)
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: var(--gap);
  box-sizing: border-box;
  padding-bottom: 60rpx;
}

.row {
  margin-bottom: 36rpx;
}

.label {
  font-size: 28rpx;
  color: var(--c-text);
  font-weight: 600;
  margin-bottom: 14rpx;
}

.req {
  color: var(--c-primary);
  margin-left: 4rpx;
}

.input {
  width: 100%;
  height: 88rpx;
  padding: 0 26rpx;
  box-sizing: border-box;
  font-size: 28rpx;
  color: var(--c-text);
  background: var(--c-card);
  border-radius: var(--radius);
}

.textarea {
  width: 100%;
  height: 180rpx;
  padding: 22rpx 26rpx;
  box-sizing: border-box;
  font-size: 28rpx;
  color: var(--c-text);
  background: var(--c-card);
  border-radius: var(--radius);
  line-height: 1.6;
}

.ph {
  color: var(--c-text-3);
}

.tip {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: var(--c-text-3);
  line-height: 1.6;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.chip {
  padding: 16rpx 34rpx;
  font-size: 27rpx;
  color: var(--c-text-2);
  background: var(--c-card);
  border-radius: 40rpx;
}

.chip-on {
  color: #fff;
  background: var(--c-primary);
}

.submit {
  margin-top: 56rpx;
  height: 96rpx;
  line-height: 96rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #fff;
  background: var(--c-primary);
  border-radius: 48rpx;
}

.submit::after {
  border: none;
}

.submit-hover {
  opacity: 0.85;
}

.submit[disabled] {
  opacity: 0.6;
}

.foot {
  margin-top: 28rpx;
  text-align: center;
  font-size: 24rpx;
  color: var(--c-text-3);
  line-height: 1.6;
}

/* ── 相似候选面板 ── */

.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(42, 36, 31, 0.45);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  max-height: 76vh;
  padding: 40rpx 32rpx;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: var(--c-bg);
  border-radius: 32rpx 32rpx 0 0;
  display: flex;
  flex-direction: column;
}

.sheet-title {
  font-size: 34rpx;
  font-weight: 600;
  color: var(--c-text);
}

.sheet-sub {
  margin-top: 10rpx;
  font-size: 25rpx;
  color: var(--c-text-3);
  line-height: 1.6;
}

.sheet-list {
  flex: 1;
  min-height: 0;
  margin: 28rpx 0;
  max-height: 46vh;
}

.cand {
  padding: 26rpx 28rpx;
  background: var(--c-card);
  border-radius: var(--radius-lg);
  margin-bottom: 20rpx;
}

.cand-hover {
  background: #FAF8F5;
}

.cand-name {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--c-text);
  line-height: 1.4;
}

.cand-addr {
  margin-top: 10rpx;
  font-size: 25rpx;
  color: var(--c-text-2);
  line-height: 1.5;
}

.cand-why {
  margin-top: 12rpx;
  font-size: 23rpx;
  color: var(--c-text-3);
}

.cand-score {
  color: var(--c-accent);
  font-weight: 600;
  margin-right: 12rpx;
}

.sheet-btn {
  flex-shrink: 0;
  height: 92rpx;
  line-height: 92rpx;
  font-size: 30rpx;
  border-radius: 46rpx;
  color: var(--c-text-2);
  background: var(--c-card);
}

.sheet-btn::after {
  border: none;
}

.ghost-hover {
  background: #F0EBE4;
}
</style>
