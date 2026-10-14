// 标签种子。三套命名空间互相独立：
//   taste 口味 —— 你想吃什么味（我做的是麻辣还是清爽）
//   food  食材 —— 你蘸什么（配涮羊肉还是配白灼虾）
//   scene 场景 —— 什么场合（减脂还是解馋）
//
// 分开是因为「按食材找配方」和「按口味找配方」是两个完全不同的入口，
// 混在一个标签池里前端没法分别渲染筛选条。

const RAW = {
  taste: [
    ['taste_mala', '麻辣'],
    ['taste_xiangla', '香辣'],
    ['taste_xianxian', '咸鲜'],
    ['taste_suanla', '酸辣'],
    ['taste_garlic', '蒜香'],
    ['taste_sesame', '麻酱浓香'],
    ['taste_sweet', '甜口'],
    ['taste_refresh', '清爽解腻'],
    ['taste_heavy', '重口复合'],
    ['taste_tengjiao', '藤椒麻香'],
    ['taste_shacha', '沙茶鲜'],
    ['taste_soursweet', '酸甜'],
    ['taste_light', '清淡原味'],
    ['taste_seafood', '海鲜味'],
  ],
  food: [
    ['food_lamb', '涮羊肉'],
    ['food_beef_roll', '肥牛卷'],
    ['food_tripe', '毛肚黄喉'],
    ['food_duckblood', '鸭血'],
    ['food_shrimp_slide', '虾滑'],
    ['food_fish', '鱼片'],
    ['food_veg', '蔬菜'],
    ['food_mushroom', '菌菇'],
    ['food_tofu', '豆制品'],
    ['food_noodle', '宽粉粉条'],
    ['food_fried', '油炸小吃'],
    ['food_grill_pork', '烤肉五花'],
    ['food_shellfish', '海鲜贝类'],
    ['food_dumpling', '饺子面食'],
    ['food_boiled_shrimp', '白灼虾'],
    ['food_cold_dish', '口水鸡凉菜'],
  ],
  scene: [
    ['scene_saving', '学生党省钱'],
    ['scene_diet', '减脂控卡'],
    ['scene_indulge', '解馋重口'],
    ['scene_kid', '小孩可吃'],
    ['scene_drink', '下酒'],
  ],
}

export const SEED_TAGS = Object.entries(RAW).flatMap(([kind, rows]) =>
  rows.map(([id, name], i) => ({ id, kind, name, sort_order: i * 10 })),
)

export default SEED_TAGS
