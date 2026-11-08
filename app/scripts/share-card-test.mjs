import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createCanvas, Image as CanvasImage, loadImage } from '@napi-rs/canvas'
import jsQR from 'jsqr'
import { createShareCard } from '../src/utils/shareCard.js'
import { REFERENCE_RECIPES } from '../../server/src/seed/referenceRecipes.js'
import { SEED_CONDIMENTS } from '../../server/src/seed/condiments.js'
const root = path.resolve(import.meta.dirname, '..')
const output = path.resolve(root, '../server/data/share-card-checks')
fs.mkdirSync(output, { recursive: true })
globalThis.window = { location: { origin: 'https://sauce.example.test', pathname: '/' } }
let drawn = []
globalThis.document = { createElement(name) {
  assert.equal(name, 'canvas')
  const canvas = createCanvas(900, 500), ctx = canvas.getContext('2d'), fill = ctx.fillText.bind(ctx)
  ctx.fillText = (text, x, y) => { drawn.push({ text, x, y }); return fill(text, x, y) }
  return canvas
} }
globalThis.Image = class {
  constructor() {
    const image = new CanvasImage(), descriptor = Object.getOwnPropertyDescriptor(CanvasImage.prototype, 'src')
    Object.defineProperty(image, 'src', { get: () => descriptor.get.call(image), set: value => {
      const data = String(value).startsWith('data:') ? value : fs.readFileSync(path.join(root, 'src', new URL(value, window.location.origin).pathname))
      descriptor.set.call(image, data)
    } })
    return image
  }
}
let checks = 0
for (const [index, reference] of REFERENCE_RECIPES.entries()) {
  for (const long of [false, true]) {
    drawn = []
    const items = long ? Array.from({ length: 30 }, (_, i) => ({ condimentName: `长配方调料${i + 1}`, amountLabel: '适量', amountNote: '先少量添加，尝味后再调整用量。'.repeat(4) })) : reference.items.map(it => ({ condimentName: SEED_CONDIMENTS.find(c => c.id === it.condimentId).name, amountLabel: '少量', amountNote: it.amountNote }))
    const full = { recipe: { id: index + 1, title: long ? '这是一份用来检查长标题与长配方排版的分享卡片'.repeat(2) : reference.title, contentType: 'reference', coverIllustration: `/static/recipes/${reference.cover}.svg`, images: [], servingNote: '一人小碟；少量起配，尝味后再调整' }, restaurant: { name: '牛NEW' }, items }
    const result = await createShareCard(full)
    assert.match(result.image, /^data:image\/png;base64,/); checks++
    const image = await loadImage(Buffer.from(result.image.split(',')[1], 'base64'))
    fs.writeFileSync(path.join(output, `${reference.key}${long ? '-long' : ''}.png`), Buffer.from(result.image.split(',')[1], 'base64'))
    const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0)
    const pixel = ctx.getImageData(660, image.height - 200, 180, 180)
    const decoded = jsQR(pixel.data, 180, 180)
    assert.equal(decoded?.data, `https://sauce.example.test/#/pages/recipe/detail?id=${index + 1}`); checks++
    const footer = drawn.find(row => row.text === '扫码查看完整配方')
    const lastItem = drawn.filter(row => row.text.includes(long ? '尝味后再调整' : '少量')).at(-1)
    assert(lastItem.y < footer.y - 60, '配方不得覆盖二维码说明'); checks++
    assert(!drawn.some(row => /待试配|非实拍|通用参考/.test(row.text)), '分享卡不显示内容来源标记'); checks++
    fs.writeFileSync(path.join(output, `${reference.key}${long ? '-long' : ''}.png`), Buffer.from(result.image.split(',')[1], 'base64'))
  }
}
console.log(`PASS ${checks} share card checks: PNG, QR round-trip, long recipe layout, presentation`)
console.log(`Preview: ${path.join(output, 'garlic.png')}`)
