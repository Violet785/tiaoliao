import { normalizeText } from './norm.js'

export function brandName(value) {
  const name = String(value ?? '').normalize('NFKC').replace(/\([^)]*店\)/g, '').trim()
  const aliases = {
    '汉巴味德自助烤肉': '汉巴味德', '星伦多海鲜自助': '星伦多',
    '本家韩式烤肉自助': '本家', '牛很鲜自助火锅': '牛很鲜',
    '牛new': '牛NEW', '龙哥': '龍哥',
  }
  return aliases[name.toLowerCase()] || name
}
export const brandKey = (value) => normalizeText(brandName(value))
