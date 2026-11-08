import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useUserStore } from './user.js'
import * as api from '../api/community.js'
export const useNotificationStore = defineStore('notifications', () => {
  const unread = ref(0), records = ref([]), failed = ref(false)
  let lastToken = ''
  async function refresh() {
    const user = useUserStore(), token = user.token
    if (lastToken !== token) { unread.value = 0; records.value = []; failed.value = false; lastToken = token }
    if (!user.isLoggedIn) { unread.value = 0; records.value = []; return }
    try { const data = await api.notifications(); if (token !== user.token) return; unread.value = data.unread; records.value = data.list; failed.value = false } catch { if (token === user.token) failed.value = true }
  }
  async function readAll() { if (!records.value.length) return; await api.readNotifications(records.value[0].id); await refresh() }
  return { unread, records, failed, refresh, readAll }
})
