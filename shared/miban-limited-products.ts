/**
 * 米伴静态限时商品目录。
 *
 * 仅用于一次性上架、不提供运营后台编辑的商品。前后端共同使用：
 * - 前端仅展示公开商品内容；
 * - 服务端按此配置核验 SKU、数量和价格，绝不信任浏览器传入的金额。
 */
import { HERBALIFE_THEME } from "./herbalife-theme";
import {
  LINGCHUANG_THEME,
  MAJIAYOU_THEME,
  TUOQUETANG_THEME,
  majiayouImage,
  tuoquetangImage,
} from "./miban-limited-brand-config";

export type LimitedProductSku = {
  id: string;
  name: string;
  subtitle: string;
  priceCny: number;
  marketPriceCny?: number;
  featured?: boolean;
  quantityPerOrder: number;
  unitLabel: "盒" | "瓶" | "套" | "箱";
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
  /** 可在正式前台展示资料页，但仍保持draft，绝不初始化库存或开放购买。 */
  publicPreview?: boolean;
  brand: string;
  /** 同一键下的商品可加入同一张限时订单；未配置时仅允许本商品自身合单。 */
  checkoutGroupKey?: string;
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
    /** 多SKU商品在前台选择区的称呼；食品口味、箱装规格与价格可分别准确表述。 */
    skuSelectionLabel?: "口味" | "规格" | "价格";
    heroImages: string[];
    /** 首屏使用真实透明产品图时，可单独提供背景层，避免重绘包装。 */
    heroBackgroundImage?: string;
    detailImage?: string;
    detailImages?: string[];
    /** 商品详情图区域的来源说明；未设置时沿用官方资料的通用说明。 */
    detailImagesCaption?: string;
    /** 无缝衔接的手机端商品故事海报分段，用于承载产地、时令、风味等图文资料。 */
    storySections?: Array<{
      eyebrow: string;
      title: string;
      body: string;
      image: string;
      facts?: string[];
      align?: "left" | "right";
    }>;
    /** 置于产品简介内的说明图片，例如使用方法或成分说明。 */
    introImage?: string;
    introImageAlt?: string;
    consumerNoticeImage?: string;
    productImage: string;
    /** 商品资料来源说明；未设置时使用品牌公开资料的通用提示。 */
    sourceNote?: string;
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
const herbalifeTeaLemonDetailImage = (file: string) =>
  herbalifeImage("herbal-tea-lemon/user-detail-v2", file);
const herbalifeAloeDetailImage = (file: string) =>
  herbalifeImage("aloe-nutrition/user-detail-v2", file);
const herbalifeNingyouranDetailImage = (file: string) =>
  herbalifeImage("ningyouran-sleep-5in1/user-detail-v3", file);
const LINGCHUANG_PREVIEW_ASSET_BASE = "/miban-lingchuang-preview/v2";
const lingchuangPreviewImage = (file: string) =>
  `${LINGCHUANG_PREVIEW_ASSET_BASE}/${file}`;
const LINGCHUANG_IMMERSIVE_ASSET_BASE = "/miban-lingchuang-preview/v4";
const lingchuangImmersiveImage = (file: string) =>
  `${LINGCHUANG_IMMERSIVE_ASSET_BASE}/${file}`;
const LINGCHUANG_DETAIL_POSTER_ASSET_BASE = "/miban-lingchuang-preview/v5";
const lingchuangDetailPosterImage = (file: string) =>
  `${LINGCHUANG_DETAIL_POSTER_ASSET_BASE}/${file}`;
const NINGYOURAN_DETAIL_IMAGES = [
  herbalifeNingyouranDetailImage("detail-01.jpg"),
  herbalifeNingyouranDetailImage("detail-02.jpg"),
  herbalifeNingyouranDetailImage("detail-03.jpg"),
  herbalifeNingyouranDetailImage("detail-04.jpg"),
  herbalifeNingyouranDetailImage("detail-05.jpg"),
  herbalifeNingyouranDetailImage("detail-06.jpg"),
  herbalifeNingyouranDetailImage("detail-07.jpg"),
  herbalifeNingyouranDetailImage("detail-08.jpg"),
  herbalifeNingyouranDetailImage("detail-09.jpg"),
  herbalifeNingyouranDetailImage("detail-10.jpg"),
  herbalifeNingyouranDetailImage("detail-11.jpg"),
];
const herbalifeRedBeanShakeDetailImage = (file: string) =>
  herbalifeImage("shake-red-bean/user-detail-v2", file);
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

const tuoquetangLogistics: LimitedProduct["detail"]["logistics"] = [
  {
    title: "商品信息",
    description: "商品图片与资料由供货方提供，实际包装以到货实物为准。",
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
    title: "使用提示",
    description: "请按商品实物包装及随附说明使用。",
  },
];

const majiayouLogistics: LimitedProduct["detail"]["logistics"] = [
  {
    title: "产区资料",
    description:
      "商品资料参照江西上饶广丰马家柚公开报道整理；实际发货鲜果以当季实物为准。",
  },
  {
    title: "订单处理",
    description: "付款后由工作人员核对订单并安排后续发货。",
  },
  {
    title: "鲜果收货",
    description:
      "鲜果在运输中会有自然成熟度差异，请签收时检查外箱和果品状态；如有问题请通过米伴订单页提交申请。",
  },
  {
    title: "售后咨询",
    description: "如有订单、物流或售后问题，请通过米伴订单页提交申请。",
  },
];

const domesticOrderPolicy: LimitedProduct["orderPolicy"] = {
  commissionEligible: false,
  allowAddressBook: true,
  allowFavorite: true,
  enableReview: false,
};
const lingchuangLogistics: LimitedProduct["detail"]["logistics"] = [
  {
    title: "包装信息",
    description: "页面依据用户提供的真实商品包装整理，实际到货包装以实物为准。",
  },
  {
    title: "订单处理",
    description: "商品正式上架后，付款订单将由工作人员核对并安排后续发货。",
  },
  {
    title: "售后咨询",
    description: "如有订单、物流或售后问题，请通过米伴订单页提交申请。",
  },
  {
    title: "食用提示",
    description: "请按商品销售包装标注的食用方法、食用量及注意事项使用。",
  },
];
export const mibanLimitedProducts: LimitedProduct[] = [
  {
    key: "herbalife-red-ginseng",
    status: "on_sale",
    brand: "康宝莱",
    checkoutGroupKey: "herbalife-limited",
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
    checkoutGroupKey: "herbalife-limited",
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
      heroImages: [
        herbalifeTeaLemonDetailImage("detail-01-lifestyle-lemon.jpg"),
      ],
      detailImages: [
        herbalifeTeaLemonDetailImage("detail-01-lifestyle-lemon.jpg"),
        herbalifeTeaLemonDetailImage("detail-02-portable-pack.jpg"),
        herbalifeTeaLemonDetailImage("detail-03-botanical-ingredients.jpg"),
        herbalifeTeaLemonDetailImage("detail-04-calorie-comparison.png"),
        herbalifeTeaLemonDetailImage("detail-05-quality-assurance.webp"),
        herbalifeTeaLemonDetailImage("detail-06-life-scenarios.jpg"),
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
        heroImages: [
          herbalifeTeaLemonDetailImage("detail-01-lifestyle-lemon.jpg"),
        ],
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "herbalife-aloe-nutrition",
    status: "on_sale",
    brand: "康宝莱",
    checkoutGroupKey: "herbalife-limited",
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
        herbalifeAloeDetailImage("detail-01-pocket-nutrition.jpg"),
        herbalifeAloeDetailImage("detail-02-portable-pack.jpg"),
        herbalifeAloeDetailImage("detail-03-lifestyle-concerns.jpg"),
        herbalifeAloeDetailImage("detail-04-nutrition-support.jpg"),
        herbalifeAloeDetailImage("detail-05-product-pack.jpg"),
        herbalifeAloeDetailImage("detail-06-material-formula-taste.jpg"),
        herbalifeAloeDetailImage("detail-07-usage-and-lifestyles.jpg"),
      ],
      introImage: herbalifeAloeDetailImage("intro-usage-guide-crop.jpg"),
      introImageAlt: "芦荟营养粉易享装食用方法：每次一条，每日一次",
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
    checkoutGroupKey: "herbalife-limited",
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
          herbalifeRedBeanShakeDetailImage(
            "detail-01-product-info-scenarios.jpg"
          ),
          herbalifeRedBeanShakeDetailImage("detail-02-calorie-comparison.jpg"),
          herbalifeRedBeanShakeDetailImage("detail-03-nutrition-features.jpg"),
          herbalifeRedBeanShakeDetailImage("detail-04-two-step-usage.jpg"),
          herbalifeRedBeanShakeDetailImage("detail-05-shake-lifestyle.jpg"),
          herbalifeRedBeanShakeDetailImage("detail-06-product-visual.jpg"),
          herbalifeRedBeanShakeDetailImage("detail-07-brand-story.jpg"),
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
    checkoutGroupKey: "herbalife-limited",
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
      detailImages: NINGYOURAN_DETAIL_IMAGES,
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
        detailImages: NINGYOURAN_DETAIL_IMAGES,
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "herbalife-youth-protein-portable",
    status: "on_sale",
    brand: "康宝莱",
    checkoutGroupKey: "herbalife-limited",
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
  {
    key: "tuoquetang-blue-cloth-herbal-toothpaste",
    status: "on_sale",
    brand: "佗鹊堂",
    checkoutGroupKey: "tuoquetang-limited",
    category: "口腔清洁",
    card: {
      badge: "10支组合装",
      title: "蓝布正植物牙膏",
      subtitle: "10支组合装 · 日常刷牙清洁",
      highlights: ["10支组合装", "草本植物牙膏", "日常清洁"],
      image: tuoquetangImage("card-visuals", "toothpaste-mobile-card.webp"),
      theme: {
        accent: TUOQUETANG_THEME.primary,
        background: TUOQUETANG_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "佗鹊堂蓝布正植物牙膏",
      subtitle: "10支组合装 · 商品信息以实物包装标签为准",
      tags: ["10支组合装", "草本植物牙膏", "日常口腔清洁"],
      heroImages: [
        tuoquetangImage("hero-visuals", "toothpaste-square-hero.webp"),
      ],
      detailImages: [
        tuoquetangImage("toothpaste", "detail-01-foam.jpg"),
        tuoquetangImage("toothpaste", "detail-02-plant-care.jpg"),
      ],
      detailImagesCaption: "以下图文根据供货方提供的商品资料展示",
      productImage: tuoquetangImage("toothpaste", "detail-01-foam.jpg"),
      sourceNote: "商品图片与资料由供货方提供，包装以到货实物为准。",
      description:
        "蓝布正植物牙膏为10支组合装，适用于日常刷牙清洁。成分、使用方法、注意事项及生产信息请以实物销售包装标签为准。",
      usage: "请按实物包装标注的使用方法使用。",
      warning:
        "请按实物包装或说明书指引使用；如出现口腔不适，请及时咨询牙科专业人士。",
      logistics: tuoquetangLogistics,
      notices: [
        {
          label: "商品说明",
          text: "本次上架为10支组合装；单支净含量及商品标签以到货实物为准。",
        },
      ],
    },
    skus: [
      {
        id: "blue-cloth-herbal-toothpaste-10-pack",
        name: "10支组合装",
        subtitle: "日常刷牙清洁 · 单支规格以实物包装为准",
        priceCny: 199,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "套",
        netContentText: "10支组合装",
        maxPurchaseQty: 10,
        active: true,
        image: tuoquetangImage("toothpaste", "detail-01-foam.jpg"),
        heroImages: [
          tuoquetangImage("hero-visuals", "toothpaste-square-hero.webp"),
        ],
        detailImages: [
          tuoquetangImage("toothpaste", "detail-01-foam.jpg"),
          tuoquetangImage("toothpaste", "detail-02-plant-care.jpg"),
        ],
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "tuoquetang-revigor-one",
    status: "on_sale",
    brand: "佗鹊堂",
    checkoutGroupKey: "tuoquetang-limited",
    category: "品牌精选",
    card: {
      badge: "单瓶装",
      title: "复生1号",
      subtitle: "单瓶装 · ¥980/瓶",
      highlights: ["单瓶装", "¥980/瓶", "详情以实物包装为准"],
      image: tuoquetangImage("card-visuals", "revigor-mobile-card.webp"),
      theme: {
        accent: TUOQUETANG_THEME.primary,
        background: TUOQUETANG_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "佗鹊堂复生1号",
      subtitle: "单瓶装 · 商品信息以实物包装标签为准",
      tags: ["单瓶装", "品牌精选", "商品信息以实物包装为准"],
      heroImages: [
        tuoquetangImage("hero-visuals", "revigor-authentic-bottle-cutout.webp"),
      ],
      heroBackgroundImage: tuoquetangImage(
        "hero-visuals",
        "revigor-authentic-hero-background.webp"
      ),
      detailImages: [
        tuoquetangImage("revigor-one", "detail-01-origin.jpg"),
        tuoquetangImage("revigor-one", "detail-02-research.jpg"),
      ],
      detailImagesCaption: "以下图文根据供货方提供的商品资料展示",
      productImage: tuoquetangImage("revigor-one", "product-bottle-focus.jpg"),
      sourceNote: "商品图片与资料由供货方提供，包装以到货实物为准。",
      description:
        "佗鹊堂复生1号为单瓶装。净含量、配料或成分、生产信息、产品类别及使用说明均以实物销售包装和随附说明为准。",
      warning:
        "请按实物包装或随附说明使用；如有特殊健康情况，请先咨询专业人士。",
      logistics: tuoquetangLogistics,
      notices: [
        {
          label: "商品说明",
          text: "本次上架为单瓶装，商品包装、标签和说明以到货实物为准。",
        },
      ],
    },
    skus: [
      {
        id: "revigor-one-single-unit",
        name: "单瓶装",
        subtitle: "¥980/瓶 · 规格以实物包装为准",
        priceCny: 980,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "瓶",
        netContentText: "单瓶装",
        maxPurchaseQty: 10,
        active: true,
        image: tuoquetangImage("revigor-one", "product-bottle-focus.jpg"),
        heroImages: [
          tuoquetangImage(
            "hero-visuals",
            "revigor-authentic-bottle-cutout.webp"
          ),
        ],
        detailImages: [
          tuoquetangImage("revigor-one", "detail-01-origin.jpg"),
          tuoquetangImage("revigor-one", "detail-02-research.jpg"),
        ],
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "lingchuang-amino-sugar-hyaluronate",
    status: "draft",
    publicPreview: true,
    brand: "凌创生物",
    checkoutGroupKey: "lingchuang-limited",
    category: "营养固体饮料",
    card: {
      badge: "资料核验中",
      title: "氨糖透明质酸钠营养固体饮料",
      subtitle: "10g × 30袋 · 盒装独立条包",
      highlights: ["净含量300g", "温开水冲调", "10g × 30袋"],
      image: lingchuangPreviewImage("product-card-v2.jpg"),
      theme: {
        accent: LINGCHUANG_THEME.primary,
        background: LINGCHUANG_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "凌创®氨糖透明质酸钠营养固体饮料",
      subtitle: "10g × 30袋 · 净含量300g",
      tags: ["营养固体饮料", "独立袋装", "温开水冲调"],
      heroImages: [lingchuangImmersiveImage("hero-accepted.jpg")],
      detailImagesCaption:
        "以下为二次创作的沉浸式产品故事海报；顶部主视觉保留真实产品外观，页面信息以销售包装标签为准。",
      storySections: [
        {
          eyebrow: "BRAND & RESEARCH",
          title: "品牌资料中的研发信息",
          body: "用户提供的包装与品牌资料标示，本品由国际欧亚科学院凌沛院士团队研发；品牌资料聚焦透明质酸系列产品的研发与应用探索。",
          image: lingchuangDetailPosterImage("01-research-team.jpg"),
          facts: ["研发信息来自包装与品牌资料", "以正式资料为准"],
        },
        {
          eyebrow: "FORMULA MATERIAL",
          title: "透明质酸钠配方资料",
          body: "销售包装配料表列有透明质酸钠、壳寡糖、N-乙酰氨基葡萄糖、全脂乳粉及鳕鱼胶原蛋白肽等，完整配料以销售包装标签为准。",
          image: lingchuangDetailPosterImage("02-ingredients-water.jpg"),
          facts: ["透明质酸钠", "壳寡糖", "N-乙酰氨基葡萄糖"],
        },
        {
          eyebrow: "DAILY MOMENT",
          title: "一袋，融入日常节奏",
          body: "本品为10g独立袋装营养固体饮料，每盒30袋，净含量300g。日常食用请结合自身饮食习惯，并以销售包装说明为准。",
          image: lingchuangDetailPosterImage("03-daily-drinking.jpg"),
          facts: ["10g × 30袋", "净含量300g"],
        },
        {
          eyebrow: "HOW TO PREPARE",
          title: "温开水冲调，按标签食用",
          body: "销售包装建议每日食用1袋，用温开水冲调后饮用。请勿超过包装标注的建议食用量。",
          image: lingchuangDetailPosterImage("04-warm-water-prep.jpg"),
          facts: ["每日1袋", "温开水冲调"],
        },
        {
          eyebrow: "DAILY ROUTINE",
          title: "为日常营养留出一份从容",
          body: "请密封置于阴凉、干燥、通风处。产品含有鱼、大豆、乳、鸡蛋成分；婴幼儿、孕妇和哺乳期妇女不宜食用。",
          image: lingchuangDetailPosterImage("05-active-daily.jpg"),
          facts: ["保质期24个月", "以包装提示为准"],
        },
      ],
      productImage: lingchuangPreviewImage("product-card-v2.jpg"),
      sourceNote:
        "顶部主视觉以用户提供的真实包装素材为参考；商品信息依据包装标签与用户提供资料整理，配料、生产信息及包装内容以实际销售包装为准。",
      description:
        "本品为盒装营养固体饮料，每盒30袋，每袋10g，净含量300g。详情图文依据用户提供的包装与品牌资料整理。",
      usage: "建议每日食用1袋，用温开水冲调后饮用。",
      warning:
        "本品含有鱼、大豆、乳、鸡蛋成分；婴幼儿、孕妇和哺乳期妇女不宜食用。请密封置于阴凉、干燥、通风处。",
      logistics: lingchuangLogistics,
      notices: [
        {
          label: "保质期",
          text: "24个月。",
        },
        {
          label: "执行标准",
          text: "GB/T 29602。",
        },
        {
          label: "生产许可证编号",
          text: "SC11337132913465。",
        },
        {
          label: "特别提示",
          text: "本品为营养固体饮料，不能代替特殊医学用途配方食品、婴幼儿配方食品、保健食品等特殊食品。",
        },
      ],
    },
    skus: [
      {
        id: "lingchuang-10g-30",
        name: "10g × 30袋/盒",
        subtitle: "净含量300g · ¥1,198/盒",
        priceCny: 1198,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "盒",
        netContentText: "10g × 30袋（300g）",
        maxPurchaseQty: 10,
        active: true,
        image: lingchuangPreviewImage("product-card-v2.jpg"),
        heroImages: [lingchuangImmersiveImage("hero-accepted.jpg")],
      },
    ],
    orderPolicy: domesticOrderPolicy,
  },
  {
    key: "guangfeng-majiayou",
    status: "on_sale",
    brand: "四季水果精选",
    checkoutGroupKey: "seasonal-fruits",
    category: "产地鲜果",
    card: {
      badge: "产地鲜果",
      title: "广丰马家柚",
      subtitle: "江西上饶广丰 · 玫红果肉特色鲜果",
      highlights: ["5种箱装规格", "玫红果肉", "当季供应"],
      image: majiayouImage("majiayou-hero.webp"),
      theme: {
        accent: MAJIAYOU_THEME.primary,
        background: MAJIAYOU_THEME.surfaceMuted,
      },
    },
    detail: {
      title: "广丰马家柚",
      subtitle: "江西上饶广丰 · 厚皮玫红果肉的当季鲜果",
      tags: ["产地鲜果", "玫红果肉", "多规格箱装"],
      skuSelectionLabel: "价格",
      heroImages: [
        majiayouImage("majiayou-hero.webp"),
        majiayouImage("majiayou-flesh-detail.webp"),
      ],
      detailImages: [majiayouImage("majiayou-mobile-story.webp")],
      detailImagesCaption:
        "连续长图从整果、果肉、果园到鲜食场景自然衔接；果形、果皮与果肉状态以当季收到的鲜果为准。",
      storySections: [
        {
          eyebrow: "产地与地标",
          title: "长在江西上饶广丰的风土里",
          body: "马家柚是广丰地方优良品种。公开报道显示，广丰马家柚已获得国家地理标志保护产品和农产品地理标志保护双重认定。",
          image: majiayouImage("story-v2/origin-orchard.webp"),
          facts: ["江西上饶广丰", "地方优良品种", "地理标志保护"],
        },
        {
          eyebrow: "打开一颗柚子",
          title: "厚白果瓤，玫红果肉",
          body: "黄绿至金黄的果皮、较厚的白色果瓤层、玫红果肉与可见籽粒，是马家柚常见的实物特征。每一颗果实会随自然成熟度呈现不同状态。",
          image: majiayouImage("story-v2/flesh-anatomy.webp"),
          facts: ["黄绿果皮", "玫红果肉", "籽粒可见"],
          align: "right",
        },
        {
          eyebrow: "秋冬时令",
          title: "等到成熟，才有清甜微酸的平衡",
          body: "公开报道显示，广丰马家柚通常在11月中旬后陆续采摘上市。日照、降水和成熟度都会影响每一批鲜果的色泽、甜感与酸感，实际口感以收到的当季果实为准。",
          image: majiayouImage("story-v2/autumn-harvest.webp"),
          facts: ["秋冬成熟", "按批次上市", "自然风味差异"],
        },
        {
          eyebrow: "日常鲜食",
          title: "把一份清爽，放进日常餐桌",
          body: "新鲜水果是平衡膳食的一部分。可将马家柚作为日常鲜果，与多样化的蔬菜、全谷物和奶类搭配；它不是药品，也不能替代正常膳食或专业健康建议。",
          image: majiayouImage("story-v2/fresh-serving.webp"),
          facts: ["鲜果为宜", "搭配多样膳食", "不替代正餐"],
          align: "right",
        },
      ],
      productImage: majiayouImage("majiayou-hero.webp"),
      sourceNote:
        "商品资料参照广丰马家柚公开报道整理，规格、果重及外观以实际到货鲜果为准。",
      description:
        "广丰马家柚为江西上饶市广丰区地方优良品种。其黄绿果皮、较厚白色果瓤层与玫红果肉是常见外观特点；公开报道将其概括为肉质脆嫩、酸甜适中、清脆爽口。鲜果会随自然成熟度呈现不同的果形、色泽、籽粒和口感。",
      usage:
        "鲜果收到后可先置于阴凉通风处短暂静置；食用前清洗果皮外表，剥开后取果肉食用。",
      warning:
        "天然鲜果的单果重量、果皮颜色、果肉深浅、籽粒数量及口感存在合理差异。规格标示为整箱参考范围，请以实际到货为准。",
      logistics: majiayouLogistics,
      notices: [
        {
          label: "规格说明",
          text: "各规格按整箱销售，页面重量为整箱参考范围，不承诺每个果实重量完全一致。",
        },
        {
          label: "鲜果特点",
          text: "马家柚果皮和白色果瓤层较厚，玫红果肉及可见籽粒均以实际鲜果状态为准。",
        },
        {
          label: "商品图片",
          text: "页面为原创视觉及资料图文展示，不代表每一箱鲜果的果形、色泽完全一致。",
        },
      ],
    },
    skus: [
      {
        id: "majiayou-large-6",
        name: "大果 6个装",
        subtitle: "约17.5–18斤/箱",
        priceCny: 188,
        featured: true,
        quantityPerOrder: 1,
        unitLabel: "箱",
        netContentText: "6个装 · 约17.5–18斤/箱",
        maxPurchaseQty: 10,
        active: true,
        image: majiayouImage("majiayou-hero.webp"),
      },
      {
        id: "majiayou-small-4",
        name: "小果 4个装",
        subtitle: "约8.5–9.5斤/箱",
        priceCny: 66,
        quantityPerOrder: 1,
        unitLabel: "箱",
        netContentText: "4个装 · 约8.5–9.5斤/箱",
        maxPurchaseQty: 10,
        active: true,
        image: majiayouImage("majiayou-hero.webp"),
      },
      {
        id: "majiayou-medium-2",
        name: "中果 2个装",
        subtitle: "约5.0–5.5斤/箱",
        priceCny: 49,
        quantityPerOrder: 1,
        unitLabel: "箱",
        netContentText: "2个装 · 约5.0–5.5斤/箱",
        maxPurchaseQty: 10,
        active: true,
        image: majiayouImage("majiayou-hero.webp"),
      },
      {
        id: "majiayou-small-2",
        name: "小果 2个装",
        subtitle: "约3.6–4斤/箱",
        priceCny: 19.9,
        quantityPerOrder: 1,
        unitLabel: "箱",
        netContentText: "2个装 · 约3.6–4斤/箱",
        maxPurchaseQty: 10,
        active: true,
        image: majiayouImage("majiayou-hero.webp"),
      },
      {
        id: "majiayou-large-2",
        name: "大果 2个装",
        subtitle: "约6.8–7.5斤/箱",
        priceCny: 76,
        quantityPerOrder: 1,
        unitLabel: "箱",
        netContentText: "2个装 · 约6.8–7.5斤/箱",
        maxPurchaseQty: 10,
        active: true,
        image: majiayouImage("majiayou-hero.webp"),
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
