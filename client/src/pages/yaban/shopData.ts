/**
 * 牙伴齿科商城 - 示例商品数据（第一版前端写死，后续接数据库）
 * 风格：蓝色系，配图后续用 AI 定制后替换 image 字段
 * 商品分两类：
 *   - product  实物商品（牙刷、牙膏等，可加购物车）
 *   - service  诊疗项目（种植牙、拔牙等，下单付定金/到院结算）
 */

export type ShopCategory = {
  id: string;
  name: string;
  /** 分类图标 URL，后续 AI 定制后替换 */
  icon: string;
};

export type ShopProduct = {
  id: string;
  categoryId: string;
  /** 商品类型：实物 / 诊疗服务 */
  kind: "product" | "service";
  name: string;
  /** 副标题 / 卖点 */
  subtitle: string;
  /** 现价（元） */
  price: number;
  /** 原价（元，可选，用于划线价） */
  originalPrice?: number;
  /** 主图 URL，后续 AI 定制后替换 */
  image: string;
  /** 销量（展示用） */
  sales: number;
  /** 标签，如 "热销""定金""到院结算" */
  tags: string[];
  /** 详情描述段落 */
  description: string[];
};

// 分类（图标暂用占位，后续 AI 定制蓝色系 3D 拟物图标后替换）
export const SHOP_CATEGORIES: ShopCategory[] = [
  { id: "all", name: "全部", icon: "" },
  { id: "care", name: "口腔护理", icon: "" },
  { id: "implant", name: "种植牙", icon: "" },
  { id: "ortho", name: "正畸矫正", icon: "" },
  { id: "clean", name: "洁牙美白", icon: "" },
  { id: "surgery", name: "拔牙补牙", icon: "" },
];

// 占位图（统一蓝色系占位，第二步用 AI 定制图替换）
const PH = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/yaban/shop_placeholder.webp";

export const SHOP_PRODUCTS: ShopProduct[] = [
  // —— 口腔护理（实物） ——
  {
    id: "p1001",
    categoryId: "care",
    kind: "product",
    name: "声波电动牙刷",
    subtitle: "高频清洁 · 护龈软毛",
    price: 199,
    originalPrice: 299,
    image: PH,
    sales: 1280,
    tags: ["热销"],
    description: [
      "采用高频声波震动技术，深入清洁牙缝与牙龈沟。",
      "配备护龈软毛刷头，温和不伤牙釉质。",
      "续航约 30 天，IPX7 级防水，可整机水洗。",
    ],
  },
  {
    id: "p1002",
    categoryId: "care",
    kind: "product",
    name: "抗敏感修护牙膏",
    subtitle: "舒缓牙本质敏感",
    price: 39,
    originalPrice: 59,
    image: PH,
    sales: 3560,
    tags: ["热销"],
    description: [
      "含硝酸钾配方，有效缓解冷热酸甜刺激引起的牙齿敏感。",
      "温和清洁，长期使用帮助修护牙釉质。",
      "建议每日早晚使用，每次刷牙不少于两分钟。",
    ],
  },
  {
    id: "p1003",
    categoryId: "care",
    kind: "product",
    name: "牙线棒家庭装",
    subtitle: "细滑不伤龈 · 50 支",
    price: 25,
    image: PH,
    sales: 2100,
    tags: [],
    description: [
      "高强度细滑牙线，轻松清除牙缝食物残渣。",
      "弓形设计便于后牙清洁，单手即可操作。",
      "家庭实惠装，每盒 50 支。",
    ],
  },
  {
    id: "p1004",
    categoryId: "care",
    kind: "product",
    name: "漱口水清新装",
    subtitle: "长效抑菌 · 无酒精",
    price: 49,
    originalPrice: 69,
    image: PH,
    sales: 1640,
    tags: [],
    description: [
      "无酒精温和配方，长效抑制口腔细菌。",
      "持久清新口气，含漱后不刺激口腔黏膜。",
      "建议刷牙后使用，含漱约 30 秒后吐出。",
    ],
  },
  // —— 种植牙（诊疗服务） ——
  {
    id: "s2001",
    categoryId: "implant",
    kind: "service",
    name: "韩国进口种植牙单颗",
    subtitle: "含植体 + 基台 + 牙冠",
    price: 4980,
    originalPrice: 6800,
    image: PH,
    sales: 320,
    tags: ["定金", "到院结算"],
    description: [
      "采用韩国进口种植系统，适合大多数缺牙修复需求。",
      "费用含植体、基台与牙冠，具体方案以面诊为准。",
      "线上支付为预约定金，余款到院结算。",
    ],
  },
  {
    id: "s2002",
    categoryId: "implant",
    kind: "service",
    name: "瑞士进口种植牙单颗",
    subtitle: "高端植体 · 长效稳固",
    price: 8800,
    originalPrice: 12800,
    image: PH,
    sales: 156,
    tags: ["定金", "到院结算"],
    description: [
      "瑞士高端种植系统，骨结合能力强，长期稳固。",
      "适合对种植体品质有较高要求的患者。",
      "线上支付为预约定金，余款到院结算。",
    ],
  },
  // —— 正畸矫正（诊疗服务） ——
  {
    id: "s3001",
    categoryId: "ortho",
    kind: "service",
    name: "隐形矫正全程套餐",
    subtitle: "透明牙套 · 舒适美观",
    price: 19800,
    originalPrice: 25800,
    image: PH,
    sales: 88,
    tags: ["定金", "到院结算"],
    description: [
      "采用透明隐形矫治器，美观舒适，可自行摘戴。",
      "全程包含方案设计、矫治器与定期复诊。",
      "线上支付为预约定金，余款到院结算。",
    ],
  },
  {
    id: "s3002",
    categoryId: "ortho",
    kind: "service",
    name: "金属托槽矫正套餐",
    subtitle: "经济实用 · 矫治高效",
    price: 12800,
    originalPrice: 16800,
    image: PH,
    sales: 110,
    tags: ["定金", "到院结算"],
    description: [
      "传统金属托槽矫正，性价比高，矫治效果稳定。",
      "适合各类牙齿排列不齐、咬合异常的矫治。",
      "线上支付为预约定金，余款到院结算。",
    ],
  },
  // —— 洁牙美白（诊疗服务） ——
  {
    id: "s4001",
    categoryId: "clean",
    kind: "service",
    name: "超声波洁牙",
    subtitle: "去牙结石 · 护牙龈",
    price: 198,
    originalPrice: 298,
    image: PH,
    sales: 680,
    tags: ["到院结算"],
    description: [
      "超声波洁治去除牙结石与牙菌斑，预防牙龈炎。",
      "建议每半年至一年洁牙一次，维护口腔健康。",
      "可线上预约下单，到院完成诊疗。",
    ],
  },
  {
    id: "s4002",
    categoryId: "clean",
    kind: "service",
    name: "冷光美白",
    subtitle: "快速提亮牙齿色阶",
    price: 880,
    originalPrice: 1280,
    image: PH,
    sales: 240,
    tags: ["定金", "到院结算"],
    description: [
      "冷光美白技术快速提亮牙齿色阶，效果自然。",
      "单次诊疗约一小时，由专业医师操作。",
      "线上支付为预约定金，余款到院结算。",
    ],
  },
  // —— 拔牙补牙（诊疗服务） ——
  {
    id: "s5001",
    categoryId: "surgery",
    kind: "service",
    name: "智齿拔除",
    subtitle: "微创操作 · 含麻醉",
    price: 380,
    originalPrice: 580,
    image: PH,
    sales: 520,
    tags: ["到院结算"],
    description: [
      "微创拔牙操作，含局部麻醉，减轻术中不适。",
      "复杂阻生智齿费用以面诊评估为准。",
      "可线上预约下单，到院完成诊疗。",
    ],
  },
  {
    id: "s5002",
    categoryId: "surgery",
    kind: "service",
    name: "树脂补牙",
    subtitle: "美学修复 · 当次完成",
    price: 280,
    originalPrice: 380,
    image: PH,
    sales: 760,
    tags: ["到院结算"],
    description: [
      "采用复合树脂材料修复龋齿，颜色接近天然牙。",
      "多数情况当次就诊即可完成修复。",
      "可线上预约下单，到院完成诊疗。",
    ],
  },
];

export function getProductById(id: string): ShopProduct | undefined {
  return SHOP_PRODUCTS.find((p) => p.id === id);
}
