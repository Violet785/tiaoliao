// 领域常量 —— 服务端唯一数据源。
//
// 前端 app/src/utils/amount.js 里有一份对应的镜像（两端无法共享模块，
// uni-app 打包和小程序运行时都不适合直接引服务端代码）。
// 改动这里的档位/文案时，记得同步改前端那一份。

/**
 * 用量档位。
 *
 * 为什么用档位而不是毫升/克：
 * 用户在调料台前没有量具，而且每家店的勺子大小根本不一样。
 * "两勺"是一个用户真的能执行的动作，"15ml"不是。
 *
 * level  给机器 —— 排序、聚合、口味画像都靠它
 * label  给人   —— 写入时固化进 recipe_items.amount_label，
 *                  这样以后改文案，历史配方的显示不会跟着漂移
 */
export const AMOUNT_LEVELS = [
  { level: 0, label: '不放', anchor: '', bar: 0 },
  { level: 1, label: '一点点', anchor: '筷子尖蘸一下', bar: 1 },
  { level: 2, label: '半勺', anchor: '半{勺}', bar: 2 },
  { level: 3, label: '1勺', anchor: '1 {平}{勺}', bar: 3 },
  { level: 4, label: '2勺', anchor: '2 {平}{勺}', bar: 4 },
  { level: 5, label: '3勺+', anchor: '3 {平}{勺}以上', bar: 5 },
]

const LEVEL_MAP = new Map(AMOUNT_LEVELS.map((a) => [a.level, a]))

export function amountLabel(level) {
  return LEVEL_MAP.get(level)?.label ?? ''
}

/**
 * 物理锚点文案，例如「2 平勺」。单位由调料自身的 unit_hint 决定。
 *
 * 「平」只跟着「勺」走 —— 平勺是说舀满不堆尖，是勺独有的说法。
 * 滴 / 撮 / 块这些量词前面加「平」不成词（「1 平滴」），所以做成占位符，
 * 只有单位真是勺时才填上。level 5 的「以上」在任何单位下都要保留。
 */
export function amountAnchor(level, unitHint = '勺') {
  const a = LEVEL_MAP.get(level)
  if (!a || !a.anchor) return ''
  // 「筷子尖蘸一下」本身已完整，不再后缀单位
  if (level === 1) return a.anchor
  return a.anchor.replace('{平}', unitHint === '勺' ? '平' : '').replace('{勺}', unitHint)
}

export function amountBar(level) {
  return LEVEL_MAP.get(level)?.bar ?? 0
}

/**
 * 类目 → 「幕」。
 *
 * 照着配的步骤顺序不是让用户随手排的，而是按这个固定幕序 ——
 * 它模拟调料台从前往后的物理摆位（油在最前、粉料在角落、干果碎最后）。
 * 用户顺着走一遍就能配完，不用在调料台前来回折返。
 *
 * 顺序本身也是料理逻辑：油先入碗酱才化得开；粉料晚放是因为遇水会结块；
 * 花生碎最后撒是因为早放会泡软。
 */
export const CATEGORY_META = {
  oil: { stageOrder: 0, stageName: '底油', color: '#D9A02B', label: '油类' },
  paste: { stageOrder: 1, stageName: '主酱', color: '#8B5A2B', label: '酱类' },
  sauce: { stageOrder: 2, stageName: '调味汁', color: '#6E4B2A', label: '汁水' },
  aroma: { stageOrder: 3, stageName: '辛香料', color: '#3E8E5A', label: '鲜香料' },
  powder: { stageOrder: 4, stageName: '粉料', color: '#B4531F', label: '干粉香料' },
  crunch: { stageOrder: 5, stageName: '干料点缀', color: '#C98B3E', label: '干果碎' },
  extra: { stageOrder: 6, stageName: '收尾', color: '#4A7C9B', label: '其他' },
}

export const CATEGORY_ORDER = Object.keys(CATEGORY_META)

export const RECIPE_STATUS = ['published', 'pending', 'rejected', 'deleted']
