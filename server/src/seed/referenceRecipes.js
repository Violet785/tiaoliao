// 编辑编排的通用起配方案，未声称经过试吃或由任何品牌提供。
export const REFERENCE_BRANDS = ['牛NEW', '龍歌', '芝小官', '钱山岭', '海底捞', '巴奴', '大渝火锅', '二当家']
const item = (condimentId, amountLevel, amountNote) => ({ condimentId, amountLevel, amountNote })
export const REFERENCE_RECIPES = [
  { key: 'garlic', title: '蒜香清爽碟', cover: 'garlic', description: '蒜香搭配醋香的通用起配方案。先少量调匀，尝味后再加生抽；蒜味偏重时减少蒜末。',
    tasteTags: ['taste_garlic', 'taste_refresh'], foodTags: ['food_beef_roll', 'food_veg', 'food_shellfish'],
    items: [item('aroma_garlic_minced', 2, '约半平勺，按喜好减量'), item('sauce_soy_light', 1, '从几滴开始'), item('sauce_vinegar_rice', 2, '约半平勺'), item('aroma_scallion', 1, '少许葱花')] },
  { key: 'sesame', title: '麻酱浓香碟', cover: 'sesame', description: '以店内已调好的麻酱汁为底，少量生抽提味。浓稠时用可直接食用的温水逐次调开；复合麻酱可能含花生等成分，请先确认。',
    tasteTags: ['taste_sesame'], foodTags: ['food_lamb', 'food_beef_roll', 'food_tofu'],
    items: [item('paste_sesame_mixed', 3, '约一平勺，先尝底味'), item('sauce_soy_light', 1, '几滴即可，底酱咸时不加'), item('sauce_vinegar_black', 1, '几滴提香'), item('aroma_scallion', 1, '少许，可不放')] },
  { key: 'mild', title: '微辣蒜香油碟', cover: 'mild', description: '香油、蒜末和少量红油的通用组合。不同店的红油辣度差别较大，先用少量试味；不吃蒜可以跳过。',
    tasteTags: ['taste_xiangla', 'taste_garlic'], foodTags: ['food_tripe', 'food_beef_roll', 'food_mushroom'],
    items: [item('oil_sesame', 2, '约半平勺'), item('oil_chili', 1, '先加几滴尝辣度'), item('aroma_garlic_minced', 2, '约半平勺'), item('sauce_vinegar_black', 1, '几滴'), item('aroma_scallion', 1, '少许')] },
  { key: 'hot', title: '重辣红油碟', cover: 'hot', description: '红油与鲜辣椒组合的重辣参考，适合习惯吃辣的人。各店辣椒强度不同，建议先用下列用量的一半试味，再决定是否增加。',
    tasteTags: ['taste_mala', 'taste_heavy'], foodTags: ['food_tripe', 'food_duckblood', 'food_noodle'],
    items: [item('oil_chili', 3, '约一平勺，先减半试味'), item('aroma_chili_fresh', 2, '少量辣椒圈，先减半'), item('crunch_chili_fried', 2, '约半平勺，先减半'), item('oil_peppercorn', 1, '几滴'), item('sauce_vinegar_black', 1, '几滴')] },
  { key: 'soursweet', title: '酸甜番茄碟', cover: 'soursweet', description: '番茄酱和米醋组合的酸甜参考，适合搭配炸物。不同番茄酱的甜咸度不同，先拌匀尝味，不额外加糖或盐。',
    tasteTags: ['taste_soursweet', 'taste_sweet'], foodTags: ['food_fried', 'food_grill_pork', 'food_veg'],
    items: [item('paste_ketchup', 3, '约一平勺'), item('sauce_vinegar_rice', 1, '几滴起加，按酸度调整'), item('sauce_lemon', 1, '几滴，可不放')] },
]
