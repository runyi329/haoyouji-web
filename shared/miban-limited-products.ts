/**
 * 米伴静态限时商品目录。
 *
 * 仅用于一次性上架、不提供运营后台编辑的商品。前后端共同使用：
 * - 前端仅展示公开商品内容；
 * - 服务端按此配置核验 SKU、数量和价格，绝不信任浏览器传入的金额。
 */
import { HERBALIFE_THEME } from "./herbalife-theme";

export type LimitedProductSku = {
  id: string;
  name: string;
  subtitle: string;
  priceCny: number;
  marketPriceCny?: number;
  featured?: boolean;
  quantityPerOrder: number;
  unitLabel: "盒" | "瓶" | "套";
  netContentText: string;
  maxPurchaseQty: number;
  active: boolean;
  /** 多口味商品在选择规格后展示对应包装图。 */
  image?: string;
  /** 详情页首屏使用的独立轮播视觉，未设置时沿用包装图。 */
  heroImages?: string[];
  /** 选择此规格后在图文详情区展示的官方包装或详情海报。 */
  detailImage?: string;
  /** 选择此规格后按官方页面顺序纵向展示的全部商品图片。 */
  detailImages?: string[];
};

export type LimitedProduct = {
  key: string;
  status: "draft" | "on_sale" | "off_sale";
  brand: string;
  category: string;
  card: {
    badge: string;
    title: string;
    subtitle: string;
    highlights: string[];
    image: string;
    theme: { accent: string; background: string };
  };
  detail: {
    title: string;
    subtitle: string;
    tags: string[];
    heroImages: string[];
    detailImage?: string;
    detailImages?: string[];
    consumerNoticeImage?: string;
    productImage: string;
    description?: string;
    usage?: string;
    warning?: string;
    isOverseas?: boolean;
    logistics: Array<{ title: string; description: string }>;
    notices: Array<{ label: string; text: string }>;
  };
  skus: LimitedProductSku[];
  orderPolicy: {
    commissionEligible: boolean;
    allowAddressBook: boolean;
    allowFavorite: boolean;
    enableReview: boolean;
  };
};

const RED_GINSENG_COS_BASE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/herbalife-red-ginseng/v1";
const RED_GINSENG_MOBILE_IMAGE = `${RED_GINSENG_COS_BASE}/product-pack-mobile.png`;
const HERBALIFE_COS_BASE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/herbalife/v1";
const herbalifeImage = (product: string, file: string) =>
  `${HERBALIFE_COS_BASE}/${product}/${file}`;
const youthProteinMobileDetailImage = (file: string) =>
  herbalifeImage("youth-protein-portable/mobile-detail", file);
const youthProteinMobileHeroImage = (file: string) =>
  herbalifeImage("youth-protein-portable/mobile-hero", file);

const domesticLogistics: LimitedProduct["detail"]["logistics"] = [
  {
    title: "正品来源",
    description: "商品信息依据康宝莱官网公开资料整理，实际包装以到货实物为准。",
  },
  {
    title: "订单处理",
    description: "付款后由工作人员核对订单并安排后续发货。",
  },
  {
    title: "售后咨询",
    description: "如有订单、物流或售后问题，请通过米伴订单页提交申请。",
  },
  {
    title: "适用提示",
    description:
      "请按商品包装及页面说明使用；如有特殊健康情况，请先咨询专业人士。",
  },
];

const domesticOrderPolicy: LimitedProduct["orderPolicy"] = {
  commissionEligible: false,
  allowAddressBook: true,
  allowFavorite: true,
  enableReview: false,
};

export const mibanLimitedProducts: LimitedProduct[] = [
  {
    key: "herbalife-red-ginseng",
    status: "on_sale",
    brand: "康宝莱",
    category: "营养健康",
    card: {
      badge: "精选",
      title: "康宝莱红参饮",
      subtitle: "韩国原装 · 红参浓缩液饮品",
      highlights: ["10g × 30条", "一盒装", "海外购"],
      image: RED_GINSENG_MOBILE_IMAGE,
      theme: {
        accent: HERBALIFE_THEME.primary,
        background: HERBALIFE_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "康宝莱红参饮",
      subtitle: "韩国原装 · 10g × 30条（300g）",
      tags: ["海外购", "韩国原装", "红参浓缩液饮品"],
      heroImages: [
        RED_GINSENG_MOBILE_IMAGE,
        `${RED_GINSENG_COS_BASE}/hero.jpg`,
      ],
      detailImage: `${RED_GINSENG_COS_BASE}/detail.png`,
      consumerNoticeImage: `${RED_GINSENG_COS_BASE}/consumer-notice.jpg`,
      productImage: RED_GINSENG_MOBILE_IMAGE,
      isOverseas: true,
      logistics: [
        {
          title: "正品来源",
          description: "按订单安排供货，请以实际发货商品与包装标识为准。",
        },
        {
          title: "订单处理",
          description: "付款后由工作人员核对订单并安排后续发货。",
        },
        {
          title: "售后咨询",
          description: "如有订单、物流或售后问题，请通过米伴订单页提交申请。",
        },
        {
          title: "海外购提示",
          description: "跨境商品税费、清关与到货时间以实际订单处理为准。",
        },
      ],
      notices: [
        {
          label: "食用提示",
          text: "请按商品包装及消费者告知书指引食用；如有特殊健康情况，请先咨询专业人士。",
        },
        {
          label: "图片说明",
          text: "页面图片及图文介绍以商品方公开资料为依据；实际包装以到货实物为准。",
        },
      ],
    },
    skus: [
      {
        id: "red-ginseng-10g-30",
        name: "红参饮 10g × 30条",
        subtitle: "300g · 1盒装",
        priceCny: 859,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "盒",
        netContentText: "10g × 30条（300g）",
        maxPurchaseQty: 10,
        active: true,
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "herbalife-herbal-tea-lemon",
    status: "on_sale",
    brand: "康宝莱",
    category: "草本茶饮",
    card: {
      badge: "条装易享",
      title: "草本浓缩速溶茶饮",
      subtitle: "柠檬口味 · 口袋里的草本茶饮",
      highlights: ["3.4g × 14条", "柠檬口味", "冲泡饮用"],
      image: herbalifeImage("herbal-tea-lemon", "product-main.png"),
      theme: {
        accent: HERBALIFE_THEME.primary,
        background: HERBALIFE_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "草本浓缩速溶茶饮易享装",
      subtitle: "柠檬口味 · 3.4g × 14条/盒",
      tags: ["条装易享", "柠檬口味", "含咖啡因"],
      heroImages: [herbalifeImage("herbal-tea-lemon", "product-main.png")],
      detailImages: [
        herbalifeImage("herbal-tea-lemon", "product-main.png"),
        herbalifeImage("herbal-tea-lemon", "product-legacy.png"),
      ],
      productImage: herbalifeImage("herbal-tea-lemon", "product-main.png"),
      description:
        "本品由草本植物精制而成，是一款可用热水或冷水冲泡的草本饮品。",
      usage:
        "将半条（1.7g）或一条（3.4g）加入250ml或500ml热水或冷水中，搅拌均匀后饮用。",
      warning:
        "本品含咖啡因；不建议儿童、孕妇、哺乳期妇女及对咖啡因敏感人群食用。",
      logistics: domesticLogistics,
      notices: [
        {
          label: "商品说明",
          text: "当前上架的是条装易享装柠檬口味；瓶装及其他口味不在本次商品页内。",
        },
      ],
    },
    skus: [
      {
        id: "herbal-tea-lemon-3-4g-14",
        name: "柠檬口味",
        subtitle: "3.4g × 14条/盒",
        priceCny: 230,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "盒",
        netContentText: "3.4g × 14条/盒",
        maxPurchaseQty: 10,
        active: true,
        image: herbalifeImage("herbal-tea-lemon", "product-main.png"),
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "herbalife-aloe-nutrition",
    status: "on_sale",
    brand: "康宝莱",
    category: "营养健康",
    card: {
      badge: "条装易享",
      title: "芦荟营养粉",
      subtitle: "库拉索芦荟凝胶粉 · 富含膳食纤维",
      highlights: ["4g × 14条", "易享装", "芦荟营养"],
      image: herbalifeImage("aloe-nutrition", "product-main.png"),
      theme: {
        accent: HERBALIFE_THEME.primary,
        background: HERBALIFE_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "芦荟营养粉易享装",
      subtitle: "4g × 14条/盒 · 条装芦荟营养饮品",
      tags: ["条装易享", "芦荟凝胶粉", "膳食纤维"],
      heroImages: [herbalifeImage("aloe-nutrition", "product-main.png")],
      detailImages: [
        herbalifeImage("aloe-nutrition", "product-main.png"),
        herbalifeImage("aloe-nutrition", "product-legacy.png"),
      ],
      productImage: herbalifeImage("aloe-nutrition", "product-main.png"),
      description:
        "本品以库拉索芦荟凝胶粉及益生元为主要原料精制而成，富含膳食纤维。",
      usage: "将一条（4g）溶于240ml水、茶饮、果汁或营养奶昔中。",
      warning: "本品添加芦荟，孕妇与婴幼儿慎用；每日食用不宜超过4g。含乳制品。",
      logistics: domesticLogistics,
      notices: [
        {
          label: "商品说明",
          text: "当前上架的是4g × 14条的易享装，并非罐装芦荟营养粉。",
        },
      ],
    },
    skus: [
      {
        id: "aloe-nutrition-4g-14",
        name: "易享装",
        subtitle: "4g × 14条/盒",
        priceCny: 143,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "盒",
        netContentText: "4g × 14条/盒",
        maxPurchaseQty: 10,
        active: true,
        image: herbalifeImage("aloe-nutrition", "product-main.png"),
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "herbalife-protein-shake-portable",
    status: "on_sale",
    brand: "康宝莱",
    category: "营养奶昔",
    card: {
      badge: "三味可选",
      title: "蛋白营养奶昔（随享装）",
      subtitle: "39g × 7袋 · 三种口味可选",
      highlights: ["三种口味", "红豆薏苡仁", "芒果", "奶油曲奇"],
      image: herbalifeImage("shake-red-bean", "product-legacy.png"),
      theme: {
        accent: HERBALIFE_THEME.primary,
        background: HERBALIFE_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "蛋白营养奶昔（随享装）",
      subtitle: "39g × 7袋/盒 · 三种口味任选",
      tags: ["随享装", "三种口味", "蛋白营养奶昔"],
      heroImages: [herbalifeImage("shake-red-bean", "product-legacy.png")],
      productImage: herbalifeImage("shake-red-bean", "product-legacy.png"),
      description:
        "本品由大豆分离蛋白和乳清蛋白等原料精制而成，添加膳食纤维、维生素和矿物质；袋内含摇摇珠，便于摇匀。",
      usage:
        "撑开袋子底部并打开盖子，加入牛奶、豆浆或水至瓶口下方；扭紧瓶口后摇晃约1分钟即可饮用。",
      warning: "本品含菊粉，每天食用不宜超过250克；婴幼儿不宜食用。",
      logistics: domesticLogistics,
      notices: [
        {
          label: "口味选择",
          text: "请在本商品详情页选择红豆薏苡仁、芒果或奶油曲奇口味；价格与规格一致。",
        },
      ],
    },
    skus: [
      {
        id: "portable-shake-red-bean",
        name: "红豆薏苡仁口味",
        subtitle: "39g × 7袋/盒 · 产品编号 L866",
        priceCny: 175,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "盒",
        netContentText: "39g × 7袋/盒",
        maxPurchaseQty: 10,
        active: true,
        image: herbalifeImage("shake-red-bean", "product-legacy.png"),
        detailImages: [
          herbalifeImage("shake-red-bean", "product-main.jpg"),
          herbalifeImage("shake-red-bean", "product-hero.jpg"),
          herbalifeImage("shake-red-bean", "product-legacy.png"),
          herbalifeImage("shake-red-bean", "shake-bead.jpg"),
          herbalifeImage("shake-red-bean", "product-icon.jpg"),
        ],
      },
      {
        id: "portable-shake-mango",
        name: "芒果口味",
        subtitle: "39g × 7袋/盒 · 产品编号 L867",
        priceCny: 175,
        quantityPerOrder: 1,
        unitLabel: "盒",
        netContentText: "39g × 7袋/盒",
        maxPurchaseQty: 10,
        active: true,
        image: herbalifeImage("shake-mango", "product-legacy.png"),
        detailImages: [
          herbalifeImage("shake-mango", "product-main.jpg"),
          herbalifeImage("shake-mango", "product-hero.jpg"),
          herbalifeImage("shake-mango", "product-legacy.png"),
          herbalifeImage("shake-mango", "shake-bead.jpg"),
          herbalifeImage("shake-mango", "product-icon.jpg"),
        ],
      },
      {
        id: "portable-shake-cookie",
        name: "奶油曲奇口味",
        subtitle: "39g × 7袋/盒 · 产品编号 L870",
        priceCny: 175,
        quantityPerOrder: 1,
        unitLabel: "盒",
        netContentText: "39g × 7袋/盒",
        maxPurchaseQty: 10,
        active: true,
        image: herbalifeImage("shake-cookie", "product-legacy.png"),
        detailImages: [
          herbalifeImage("shake-cookie", "product-main.jpg"),
          herbalifeImage("shake-cookie", "product-hero.jpg"),
          herbalifeImage("shake-cookie", "product-legacy.png"),
          herbalifeImage("shake-cookie", "product-carousel.jpg"),
          herbalifeImage("shake-cookie", "product-icon.jpg"),
        ],
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "herbalife-ningyouran-sleep-5in1",
    status: "on_sale",
    brand: "康宝莱",
    category: "睡眠营养",
    card: {
      badge: "每日一条",
      title: "宁悠然恬梦™五合饮",
      subtitle: "低糖0脂肪 · 1.5g × 30条",
      highlights: ["PQQ、GABA等五合一", "每日一条", "睡前食用"],
      image: herbalifeImage("ningyouran-sleep-5in1", "product-main.png"),
      theme: {
        accent: HERBALIFE_THEME.primary,
        background: HERBALIFE_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "宁悠然恬梦™五合饮",
      subtitle: "1.5g × 30条/盒 · 低糖0脂肪",
      tags: ["每日一条", "五合一科学复配", "睡前食用"],
      heroImages: [herbalifeImage("ningyouran-sleep-5in1", "product-main.png")],
      detailImages: [
        herbalifeImage("ningyouran-sleep-5in1", "product-main.png"),
      ],
      productImage: herbalifeImage("ningyouran-sleep-5in1", "product-main.png"),
      description:
        "本品采用 PQQ、GABA（γ-氨基丁酸）、茶叶茶氨酸、酸枣仁粉及葡萄糖酸镁五重科学复配，支持身心舒缓与安享宁静时光。",
      usage: "每日一条，可溶于500ml水中饮用或直接倒入口中食用，推荐睡前食用。",
      warning:
        "本品中添加吡咯并喹啉醌二钠盐、γ-氨基丁酸及茶叶茶氨酸，每天食用不宜超过一条；婴幼儿、孕妇和哺乳期妇女不宜食用。",
      logistics: domesticLogistics,
      notices: [
        {
          label: "商品说明",
          text: "商品资料整理自品牌公开信息，包装以到货实物为准。",
        },
      ],
    },
    skus: [
      {
        id: "ningyouran-sleep-5in1-1-5g-30",
        name: "1.5g × 30条/盒",
        subtitle: "产品编号 L930",
        priceCny: 350,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "盒",
        netContentText: "1.5g × 30条/盒",
        maxPurchaseQty: 10,
        active: true,
        image: herbalifeImage("ningyouran-sleep-5in1", "product-main.png"),
        detailImages: [
          herbalifeImage("ningyouran-sleep-5in1", "product-main.png"),
        ],
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "herbalife-youth-protein-portable",
    status: "on_sale",
    brand: "康宝莱",
    category: "儿童青少年营养",
    card: {
      badge: "易享装",
      title: "智满星®蛋白营养粉",
      subtitle: "儿童及青少年营养 · 25g × 20袋",
      highlights: ["动植物双蛋白", "10种维生素", "4种矿物质"],
      image: herbalifeImage("youth-protein-portable", "product-legacy.png"),
      theme: {
        accent: HERBALIFE_THEME.primary,
        background: HERBALIFE_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "智满星®蛋白营养粉（易享装）",
      subtitle: "500g（25g × 20袋） · 动植物双蛋白",
      tags: ["儿童及青少年营养", "易享装", "不额外添加蔗糖"],
      heroImages: [
        youthProteinMobileHeroImage("01-main-visual.jpg"),
        youthProteinMobileHeroImage("02-portable-formula.jpg"),
        youthProteinMobileHeroImage("03-growth-nutrients.jpg"),
        youthProteinMobileHeroImage("04-multiple-nutrients.jpg"),
      ],
      detailImages: [
        youthProteinMobileDetailImage("01-hero-poster.jpg"),
        youthProteinMobileDetailImage("02-core-benefits.jpg"),
        youthProteinMobileDetailImage("03-multi-nutrients.jpg"),
        youthProteinMobileDetailImage("04-growth-nutrients.jpg"),
        youthProteinMobileDetailImage("05-product-and-flavor.jpg"),
        youthProteinMobileDetailImage("06-daily-scenarios.jpg"),
        youthProteinMobileDetailImage("07-product-information.jpg"),
        youthProteinMobileDetailImage("08-questions-and-answers.jpg"),
      ],
      productImage: herbalifeImage(
        "youth-protein-portable",
        "product-legacy.png"
      ),
      description:
        "本品以浓缩牛奶蛋白和大豆分离蛋白为主要原料，添加膳食纤维、维生素及矿物质，特别添加叶黄素酯和钙。",
      usage:
        "将25克（一包）蛋白营养粉与240毫升水、牛奶或豆浆等充分摇匀后即可享用。",
      warning: "本品含大豆制品和乳制品；每天食用不宜超过一包；婴幼儿不宜食用。",
      logistics: domesticLogistics,
      notices: [
        {
          label: "商品说明",
          text: "商品资料整理自品牌公开信息，包装以到货实物为准。",
        },
      ],
    },
    skus: [
      {
        id: "youth-protein-portable-25g-20",
        name: "25g × 20袋/盒",
        subtitle: "产品编号 L864 · 500g",
        priceCny: 410,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "盒",
        netContentText: "500g（25g × 20袋）",
        maxPurchaseQty: 10,
        active: true,
        image: herbalifeImage("youth-protein-portable", "product-legacy.png"),
        heroImages: [
          youthProteinMobileHeroImage("01-main-visual.jpg"),
          youthProteinMobileHeroImage("02-portable-formula.jpg"),
          youthProteinMobileHeroImage("03-growth-nutrients.jpg"),
          youthProteinMobileHeroImage("04-multiple-nutrients.jpg"),
        ],
        detailImages: [
          youthProteinMobileDetailImage("01-hero-poster.jpg"),
          youthProteinMobileDetailImage("02-core-benefits.jpg"),
          youthProteinMobileDetailImage("03-multi-nutrients.jpg"),
          youthProteinMobileDetailImage("04-growth-nutrients.jpg"),
          youthProteinMobileDetailImage("05-product-and-flavor.jpg"),
          youthProteinMobileDetailImage("06-daily-scenarios.jpg"),
          youthProteinMobileDetailImage("07-product-information.jpg"),
          youthProteinMobileDetailImage("08-questions-and-answers.jpg"),
        ],
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
];

export function getMibanLimitedProduct(
  key: string
): LimitedProduct | undefined {
  return mibanLimitedProducts.find(product => product.key === key);
}

export function getMibanLimitedProductSku(
  product: LimitedProduct,
  skuId: string
): LimitedProductSku | undefined {
  return product.skus.find(sku => sku.id === skuId && sku.active);
}
