import assert from 'node:assert/strict'
import { draftKey, readDraft, writeDraft, dropDraft } from '../src/utils/draft.js'
const storage = new Map()
globalThis.uni = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key) }
let checks = 0
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++ }
const draft = { kind: 'recipe', form: { title: '半碗蒜香', restaurantId: 8, items: [{ condimentId: 'aroma_garlic_minced', amountLevel: 2 }] }, images: [{ id: 'image-id', url: '/private-preview' }], clientToken: 'stable-retry-token' }
check(writeDraft(draftKey(1), draft), true)
check(readDraft(draftKey(1)).form.title, '半碗蒜香')
check(readDraft(draftKey(2)), null)
check(readDraft(draftKey(1, 'edit-8')), null)
check(readDraft(draftKey(1, 'retry-8')), null)
draft.form.title = '改动未保存'
check(readDraft(draftKey(1)).form.title, '半碗蒜香')
check(readDraft(draftKey(1)).clientToken, 'stable-retry-token')
check(readDraft(draftKey(1)).images[0].id, 'image-id')
writeDraft(draftKey(1, 'retry-8'), { ...draft, resubmittedFrom: 8 })
check(readDraft(draftKey(1, 'retry-8')).resubmittedFrom, 8)
check(dropDraft(draftKey(1)), true)
check(readDraft(draftKey(1)), null)
check(readDraft(draftKey(1, 'retry-8')).resubmittedFrom, 8)
uni.setStorageSync = () => { throw new Error('storage full') }
check(writeDraft(draftKey(1), draft), false)
uni.getStorageSync = () => { throw new Error('storage unavailable') }
check(readDraft(draftKey(1)), null)
console.log(`PASS ${checks} draft checks: account isolation, recovery, retry token, storage failures`)
