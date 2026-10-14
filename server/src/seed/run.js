// 灌入基础数据。
//
// 全部使用 INSERT ... ON CONFLICT(id) DO UPDATE，所以可以反复跑：
// 以后调整某个调料的颜色、排序、提醒文案，直接改 condiments.js 再跑一次即可，
// 不会产生重复行，也不会破坏已有配方对它的引用。
import { pathToFileURL } from 'node:url'
import { getDb } from '../db/index.js'
import { withTx } from '../db/tx.js'
import { CATEGORY_META } from '../constants.js'
import { SEED_CONDIMENTS } from './condiments.js'
import { SEED_TAGS } from './tags.js'

export function runSeed({ silent = false } = {}) {
  const db = getDb()

  const result = withTx(db, () => {
    const upsertCondiment = db.prepare(`
      INSERT INTO condiments (
        id, name, short_name, category, stage_order, sort_order,
        glyph, color, default_amount, unit_hint, flavor_tags,
        spicy_weight, salty_weight, rich_weight, caution, is_allergen
      ) VALUES (
        :id, :name, :short_name, :category, :stage_order, :sort_order,
        :glyph, :color, :default_amount, :unit_hint, :flavor_tags,
        :spicy_weight, :salty_weight, :rich_weight, :caution, :is_allergen
      )
      ON CONFLICT(id) DO UPDATE SET
        name           = excluded.name,
        short_name     = excluded.short_name,
        category       = excluded.category,
        stage_order    = excluded.stage_order,
        sort_order     = excluded.sort_order,
        glyph          = excluded.glyph,
        color          = excluded.color,
        default_amount = excluded.default_amount,
        unit_hint      = excluded.unit_hint,
        flavor_tags    = excluded.flavor_tags,
        spicy_weight   = excluded.spicy_weight,
        salty_weight   = excluded.salty_weight,
        rich_weight    = excluded.rich_weight,
        caution        = excluded.caution,
        is_allergen    = excluded.is_allergen
    `)

    for (const c of SEED_CONDIMENTS) {
      const meta = CATEGORY_META[c.category]
      upsertCondiment.run({
        ...c,
        stage_order: meta.stageOrder,
        // 颜色由类目统一决定，不逐个手填 —— 改配色只改 CATEGORY_META 一处
        color: meta.color,
      })
    }

    const upsertTag = db.prepare(`
      INSERT INTO tags (id, kind, name, sort_order)
      VALUES (:id, :kind, :name, :sort_order)
      ON CONFLICT(id) DO UPDATE SET
        kind       = excluded.kind,
        name       = excluded.name,
        sort_order = excluded.sort_order
    `)

    for (const t of SEED_TAGS) upsertTag.run(t)

    return { condiments: SEED_CONDIMENTS.length, tags: SEED_TAGS.length }
  })

  if (!silent) {
    console.log(`[seed] ✓ 调料 ${result.condiments} 项，标签 ${result.tags} 项`)
  }
  return result
}

// 允许直接运行：npm run seed
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeed()
  console.log('[seed] 完成')
}
