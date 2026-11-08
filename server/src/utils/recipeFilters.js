import { str } from '../middleware/validate.js'
import { badRequest } from './errors.js'

export function readRecipeFilters(query) {
  const spice = str(query, 'spice', { required: false, max: 10 })
  if (spice && !['none', 'mild', 'medium', 'hot', 'spicy'].includes(spice)) throw badRequest('辣度筛选无效')
  const raw = str(query, 'exclude', { required: false, max: 6500 })
  const exclude = raw ? [...new Set(raw.split(','))] : []
  if (exclude.length > 128 || exclude.some(id => !/^[a-z0-9_]{1,50}$/.test(id))) throw badRequest('排除调料格式无效')
  return { keyword: str(query, 'keyword', { required: false, max: 60 }),
    tasteTag: str(query, 'tasteTag', { required: false, max: 60 }),
    foodTag: str(query, 'foodTag', { required: false, max: 60 }), spice, exclude }
}
