<template><view><SiteHeader /><view class="shell">正在打开反馈登记…</view></view></template>
<script setup>
import { onLoad } from '@dcloudio/uni-app'
import SiteHeader from '../../components/SiteHeader.vue'
onLoad(() => uni.redirectTo({ url: '/pages/feedback/index?kind=restaurant' }))
</script>
