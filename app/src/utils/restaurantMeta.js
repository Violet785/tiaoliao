/**
 * 餐馆类目的视觉映射。
 *
 * 和服务端 `restaurantService.js` 里的 CATEGORIES 一一对应 —— 那边是校验用的白名单，
 * 这边只管显示。加类目时两处都要改。
 *
 * 用单汉字而不是 emoji：emoji 在微信不同版本里字形差异很大，
 * 而且大小不受 font-size 精确控制，会撑破卡片布局。
 */
const META = {
  自助餐: { glyph: '自', color: '#C8452E' },
  火锅: { glyph: '火', color: '#B4531F' },
  烤肉: { glyph: '烤', color: '#8B5A2B' },
  麻辣烫: { glyph: '烫', color: '#D9A02B' },
  冒菜: { glyph: '冒', color: '#C98B3E' },
  其他: { glyph: '店', color: '#4A7C9B' },
}

const FALLBACK = META.其他

export function categoryGlyph(category) {
  return (META[category] || FALLBACK).glyph
}

export function categoryColor(category) {
  return (META[category] || FALLBACK).color
}
