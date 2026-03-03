/**
 * 奢贝美容院 - 商品兜底数据
 * 当数据库表不存在或查询失败时，前端使用这些数据展示商品
 */

// 压缩后的图片CDN地址（手机端优化，加载更快）
const CDN = {
  hero: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_hero_92ec7df5.jpg",
  interiorGlow: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_interior-glow_85c7e788.jpg",
  lifestyleWoman: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_lifestyle-woman_6ce2894a.jpg",
  lifestyle: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_lifestyle_acf1f032.jpg",
  heroOld: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_hero-old_0b3dfbfe.jpg",
  benefitsIcons: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_benefits-icons_c59852e6.jpg",
  scienceDiagram: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_science-diagram_74b6138b.jpg",
  // 元气焕活年度私定养护封面（中式养生风格）
  yuanqiCover: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/yuanqi-huanhuo-cover-SNnALrhSqxwtzkGk6z9jN8.webp",
};

export const FALLBACK_PRODUCTS = [
  // ── 1. 单次体验 398元 ──
  {
    id: 1,
    name: '细胞焕能红光养护 · 单次体验',
    description: `细胞焕能红光养护 | 单次体验 30分钟

【核心功效】
1. 给身体充电，让生命活力拉满
   唤醒生命的能量，保持旺盛精力、活力满满。

2. 构筑身体防护网，抵御外邪侵入
   升级身体的防御能力，对付流感、感冒的外敌更省力。

3. 打通气血通路，温和驱除寒湿
   温经通络，气血运行通畅，告别寒湿体质。

4. 给肌肤焕新颜，让年轻看得见
   让胶原蛋白充分释放，让肤色更透亮、肤质更细腻。

5. 舒缓身心，优化睡眠质量
   放松身心，减轻焦虑，助推深度睡眠，晨起更有活力。

6. "燃烧"多余的脂肪，重塑曼妙身材
   减少脂肪囤积，"懒人"、"美食家"也能管理身材。

【服务内容】
专业红光舱单次30分钟养护，全身360°环绕照射，激活细胞活力。

【科学原理】
红光=给身体充能，增活力、促循环、排寒湿、助好眠、养状态！
红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。`,
    price: '398.00',
    imageUrl: CDN.interiorGlow,
    brandId: 1,
    categoryId: 1,
    specification: '单次 · 30分钟',
    stock: 999,
    isActive: 1,
    sortOrder: 1,
  },

  // ── 2. 三次套餐 499元 ──
  {
    id: 2,
    name: '细胞焕能红光养护 · 三次套餐',
    description: `细胞焕能红光养护 | 三次套餐

【核心功效】
1. 给身体充电，让生命活力拉满
   唤醒生命的能量，保持旺盛精力、活力满满。

2. 构筑身体防护网，抵御外邪侵入
   升级身体的防御能力，对付流感、感冒的外敌更省力。

3. 打通气血通路，温和驱除寒湿
   温经通络，气血运行通畅，告别寒湿体质。

4. 给肌肤焕新颜，让年轻看得见
   让胶原蛋白充分释放，让肤色更透亮、肤质更细腻。

5. 舒缓身心，优化睡眠质量
   放松身心，减轻焦虑，助推深度睡眠，晨起更有活力。

6. "燃烧"多余的脂肪，重塑曼妙身材
   减少脂肪囤积，"懒人"、"美食家"也能管理身材。

【服务内容】
专业红光舱3次养护，每次30分钟，全身360°环绕照射，连续养护效果更佳。

【科学原理】
红光=给身体充能，增活力、促循环、排寒湿、助好眠、养状态！
红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。`,
    price: '499.00',
    imageUrl: CDN.hero,
    brandId: 1,
    categoryId: 1,
    specification: '3次 · 每次30分钟',
    stock: 999,
    isActive: 1,
    sortOrder: 2,
  },

  // ── 3. 季卡 2999元 ──
  {
    id: 3,
    name: '细胞焕能红光养护 · 季卡',
    description: `细胞焕能红光养护 | 季卡（3个月）

【核心功效】
1. 给身体充电，让生命活力拉满
   唤醒生命的能量，保持旺盛精力、活力满满。

2. 构筑身体防护网，抵御外邪侵入
   升级身体的防御能力，对付流感、感冒的外敌更省力。

3. 打通气血通路，温和驱除寒湿
   温经通络，气血运行通畅，告别寒湿体质。

4. 给肌肤焕新颜，让年轻看得见
   让胶原蛋白充分释放，让肤色更透亮、肤质更细腻。

5. 舒缓身心，优化睡眠质量
   放松身心，减轻焦虑，助推深度睡眠，晨起更有活力。

6. "燃烧"多余的脂肪，重塑曼妙身材
   减少脂肪囤积，"懒人"、"美食家"也能管理身材。

【服务内容】
3个月内无限次享受专业红光舱养护服务，每次30分钟，持续改善身体状态。

【科学原理】
红光=给身体充能，增活力、促循环、排寒湿、助好眠、养状态！
红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。`,
    price: '2999.00',
    imageUrl: CDN.lifestyleWoman,
    brandId: 1,
    categoryId: 1,
    specification: '季卡 · 3个月无限次',
    stock: 99,
    isActive: 1,
    sortOrder: 3,
  },

  // ── 4. 年卡 10000元 ──
  {
    id: 4,
    name: '细胞焕能红光养护 · 年卡',
    description: `细胞焕能红光养护 | 年卡（一年内无限次）

【核心功效】
1. 给身体充电，让生命活力拉满
   唤醒生命的能量，保持旺盛精力、活力满满。

2. 构筑身体防护网，抵御外邪侵入
   升级身体的防御能力，对付流感、感冒的外敌更省力。

3. 打通气血通路，温和驱除寒湿
   温经通络，气血运行通畅，告别寒湿体质。

4. 给肌肤焕新颜，让年轻看得见
   让胶原蛋白充分释放，让肤色更透亮、肤质更细腻。

5. 舒缓身心，优化睡眠质量
   放松身心，减轻焦虑，助推深度睡眠，晨起更有活力。

6. "燃烧"多余的脂肪，重塑曼妙身材
   减少脂肪囤积，"懒人"、"美食家"也能管理身材。

【服务内容】
一年内无限次享受专业红光舱养护服务，每次30分钟，全年陪伴您的健康之旅。

【科学原理】
红光=给身体充能，增活力、促循环、排寒湿、助好眠、养状态！
红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。`,
    price: '10000.00',
    imageUrl: CDN.lifestyle,
    brandId: 1,
    categoryId: 1,
    specification: '年卡 · 一年内无限次',
    stock: 99,
    isActive: 1,
    sortOrder: 4,
  },

  // ── 5. 元气焕活年度私定养护 30000元 ──
  {
    id: 5,
    name: '元气焕活年度私定养护',
    description: `元气焕活年度私定养护 | 顶级私人定制

清·通·补三步自然养护，给身体一场温柔的焕新之旅。

【核心功效】
1. 给身体充电，让生命活力拉满
   唤醒生命的能量，保持旺盛精力、活力满满。

2. 构筑身体防护网，抵御外邪侵入
   升级身体的防御能力，对付流感、感冒的外敌更省力。

3. 打通气血通路，温和驱除寒湿
   温经通络，气血运行通畅，告别寒湿体质。

4. 给肌肤焕新颜，让年轻看得见
   让胶原蛋白充分释放，让肤色更透亮、肤质更细腻。

5. 舒缓身心，优化睡眠质量
   放松身心，减轻焦虑，助推深度睡眠，晨起更有活力。

6. "燃烧"多余的脂肪，重塑曼妙身材
   减少脂肪囤积，"懒人"、"美食家"也能管理身材。

【服务理念】
遵循中国传统养生智慧，结合现代科技，为您量身定制专属养护方案。
"清"——清除身体积累的浊气与湿邪
"通"——疏通经络，促进气血顺畅运行
"补"——补充身体所需能量，恢复元气

【服务内容】
一年内任意次私定养护服务，包含：
· 专属健康档案建立与跟踪
· 个性化养护方案定制
· 专业养护师一对一服务
· 全套综合养护项目（含红光、经络、芳疗等）
· 定期健康回访与方案调整

【适合人群】
追求高品质生活，注重全方位身心健康管理的贵宾客户。`,
    price: '30000.00',
    imageUrl: CDN.yuanqiCover,
    brandId: 1,
    categoryId: 1,
    specification: '年度私定 · 一年内任意次',
    stock: 10,
    isActive: 1,
    sortOrder: 5,
  },
];

export const FALLBACK_BRANDS = [
  {
    id: 1,
    name: '奢贝美容院',
    description: '专注高端健康养护，为您提供专业、私密、个性化的养护服务',
    logoUrl: null,
    isActive: 1,
    sortOrder: 0,
  },
];
