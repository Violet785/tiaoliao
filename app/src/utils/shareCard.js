import QRCode from 'qrcode'
import { mediaUrl } from '../api/community.js'

export function recipeLink(id) {
  // #ifdef H5
  return `${window.location.origin}${window.location.pathname}#/pages/recipe/detail?id=${id}`
  // #endif
  // #ifndef H5
  return `/pages/recipe/detail?id=${id}`
  // #endif
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image(), timer = setTimeout(() => reject(new Error('配图加载超时')), 8000)
    image.onload = () => { clearTimeout(timer); resolve(image) }
    image.onerror = () => { clearTimeout(timer); reject(new Error('配图加载失败')) }
    image.src = url
  })
}

function wrap(ctx, value, width) {
  const lines = []; let line = ''
  for (const character of String(value || '')) {
    if (character === '\n' || (line && ctx.measureText(line + character).width > width)) { lines.push(line); line = character === '\n' ? '' : character } else line += character
  }
  if (line) lines.push(line)
  return lines
}

// 本地生成 PNG，不把用户的收藏状态、账号或私有预览链接放进分享图片。
export async function createShareCard(full) {
  if (typeof document === 'undefined') throw new Error('请在网页版生成分享图片')
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持生成图片')
  const font = '"Microsoft YaHei", "PingFang SC", sans-serif'
  ctx.font = `bold 44px ${font}`
  const titleLines = wrap(ctx, full.recipe.title, 780)
  ctx.font = `24px ${font}`
  const itemLines = full.items.map(it => wrap(ctx, `${it.condimentName} · ${it.amountLabel}${it.amountNote ? `（${it.amountNote}）` : ''}`, 760))
  const imageUrl = full.recipe.images?.[0]?.url || full.recipe.coverIllustration
  const photo = imageUrl ? await loadImage(mediaUrl(imageUrl)) : null
  const photoHeight = photo ? 340 : 0
  canvas.width = 900; canvas.height = 560 + titleLines.length * 56 + photoHeight + itemLines.reduce((n, lines) => n + lines.length * 36 + 18, 0)
  ctx.fillStyle = '#f7f1e7'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#bf472d'; ctx.font = `bold 26px ${font}`; ctx.fillText('蘸料 · 一碗好味道', 60, 62)
  ctx.fillStyle = '#80684e'; ctx.font = `26px ${font}`; ctx.fillText(full.restaurant.name, 60, 112)
  ctx.fillStyle = '#33271e'; ctx.font = `bold 44px ${font}`
  let y = 176
  for (const line of titleLines) { ctx.fillText(line, 60, y); y += 56 }
  if (photo) {
    const scale = Math.max(780 / photo.width, 310 / photo.height), sw = 780 / scale, sh = 310 / scale
    ctx.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, 60, y, 780, 310); y += photoHeight
  }
  ctx.fillStyle = '#917c64'; ctx.font = `22px ${font}`
  for (const line of wrap(ctx, full.recipe.servingNote || '少量起配，尝味后再调整', 760).slice(0, 2)) { ctx.fillText(line, 60, y + 12); y += 30 }
  y += 24; ctx.fillStyle = '#47382b'; ctx.font = `24px ${font}`
  for (const lines of itemLines) { for (const line of lines) { ctx.fillText(line, 60, y); y += 36 } y += 18 }
  const link = recipeLink(full.recipe.id), qr = await QRCode.toDataURL(link, { width: 180, margin: 2, errorCorrectionLevel: 'M' }), qrImage = await loadImage(qr)
  const bottom = canvas.height - 200
  ctx.fillStyle = '#e5d8c6'; ctx.fillRect(60, bottom - 22, 780, 1)
  ctx.drawImage(qrImage, 660, bottom, 180, 180)
  ctx.fillStyle = '#47382b'; ctx.font = `bold 27px ${font}`; ctx.fillText('扫码查看完整配方', 60, bottom + 52)
  ctx.fillStyle = '#8a7761'; ctx.font = `21px ${font}`; ctx.fillText('各店调料供应可能不同，请以现场为准。', 60, bottom + 94); ctx.fillText('过敏原和复合调料成分请向店员确认。', 60, bottom + 130)
  return { image: canvas.toDataURL('image/png'), link }
}
