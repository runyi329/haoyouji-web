/**
 * 奢贝美容院 - 商品兜底数据
 * 当数据库表不存在或查询失败时，前端使用这些数据展示商品
 */

export const FALLBACK_PRODUCTS = [
  {
    id: 1,
    name: '红立方光焕能舱',
    description: `红立方光焕能舱 | 给身体充能

【产品亮点】
精准黄金波长 · 超大能量密度 · 网络远程监控 · 智能恒温保护
定时时间控制 · 两档速度选择 · 智能语音提示 · 独立新风系统

【六大核心功效】
1. 焕活身体活力，提升精气神——温和唤醒身体能量，让人更有精神、不易疲惫
2. 促进身体循环，周身舒畅——助力气血顺畅运行，改善身体发沉、手脚易凉的状态
3. 温和排浊，身体更轻松——微微出汗，帮助代谢多余湿气与浊物，体感轻盈舒适
4. 舒缓身心，提升睡眠质量——放松神经，帮助睡得更安稳，晨起更有活力
5. 焕亮肌肤状态，透出好气色——温和养护肌肤，让肤色更透亮、肤质更细腻
6. 调理身体状态，体质更稳定——长期坚持，帮助身体保持良好状态，日常更有活力

【科学原理】
红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。

【产品规格】
型号：RQ-22 | 品牌：IDEALIGHT | 生产商：上海佰时特健康科技有限公司
检测标准：GB 4706.1-2005 | 检测结论：合格品 | 报告编号：W02414500335

【认证资质】CMA计量认证 · CNAS实验室认证 · 国际互认资质`,
    price: '30000.00',
    imageUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/redcube-hero_f052e330.jpg',
    brandId: 1,
    categoryId: 1,
    specification: '型号 RQ-22',
    stock: 99,
    isActive: 1,
    sortOrder: 0,
  },
];

export const FALLBACK_BRANDS = [
  {
    id: 1,
    name: '爱达光 IDEALIGHT',
    description: '专业红光疗法设备制造商',
    logoUrl: null,
    isActive: 1,
    sortOrder: 0,
  },
];
