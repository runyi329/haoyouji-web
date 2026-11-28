/**
 * 平台 /wine 原有三款西班牙红酒，迁入米伴统一精选目录。
 * 定价依据旧详情页实际售价（非划线价）；U价由页面/服务端统一汇率换算。
 * 新商业场景依据真实包装二次设计，不代表酒庄实拍或新的认证。
 * 不复用旧页硬编码库存、销量、包邮和现货文案，不新增分佣。
 */
import type { LimitedProduct } from "./miban-limited-products";
import { SPAIN_THEME } from "./miban-limited-brand-config";

const COS = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com";
const asset = (file: string) => `${COS}/assets/${file}`;
const originalWineImage = (file: string) => `${COS}/wine-products/${file}`;
const originalMainImage = (wine: string) => `/miban-spain/products/${wine}-main.webp`;
const wineVisual = (wine: string, type: "list" | "hero" | "detail") => `/miban-spain/products/v2/${wine}-${type}.webp`;

const wineLogistics: LimitedProduct["detail"]["logistics"] = [
  { title: "商品资料", description: "商品资料沿用原红酒介绍，场景为视觉设计；包装及批次以实物酒标为准。" },
  { title: "单瓶规格", description: "每瓶750ml，按所选瓶数下单；请核对收货信息。" },
  { title: "配送安排", description: "配送范围与发货安排以订单确认及客服说明为准。" },
  { title: "签收与售后", description: "签收时请检查包装与瓶身，如遇破损或漏液请保留照片并联系客服。" },
];
const wineNotices: LimitedProduct["detail"]["notices"] = [
  { label: "年份与批次", text: "年份信息沿用原商品资料；实际年份、酒精度及包装以订单确认与实物酒标为准，如需指定年份请下单前确认。" },
  { label: "价格说明", text: "人民币售价沿用原商品价格；U/USDT展示价按平台汇率折算，最终扣款金额以支付确认页的有效报价为准。" },
  { label: "理性饮酒", text: "未成年人不得购买或饮用酒类。孕期、哺乳期及不宜饮酒者请勿饮用；饮酒后请勿驾驶。" },
];

type WineSource = {
  id: string;
  title: string;
  englishName: string;
  region: string;
  winery: string;
  year: string;
  alcohol: string;
  grape: string;
  grade: string;
  ageing?: string;
  priceCny: number;
  description: string;
  pairing: string;
  highlights: string[];
  heroImages: string[];
};

function createWineProduct(wine: WineSource): LimitedProduct {
  const key = `spain-${wine.id}`;
  const image = wineVisual(wine.id, "list");
  const heroImages = [wineVisual(wine.id, "hero"), originalMainImage(wine.id), ...wine.heroImages];
  return {
    key,
    status: "on_sale",
    brand: "西班牙",
    checkoutGroupKey: "spain-wines",
    category: "红葡萄酒",
    card: {
      badge: "西班牙红酒",
      title: wine.title,
      subtitle: `${wine.englishName} · ${wine.region}`,
      highlights: wine.highlights,
      image,
      theme: { accent: SPAIN_THEME.primary, background: SPAIN_THEME.surfaceMuted },
    },
    detail: {
      title: wine.title,
      subtitle: `${wine.englishName} · ${wine.region}`,
      tags: ["西班牙原产", "干红葡萄酒", "750ml单瓶"],
      skuSelectionLabel: "规格",
      heroImages,
      productImage: image,
      sourceNote: "以平台真实商品包装为参考的场景设计演绎，并非酒庄实拍；酒款资料沿用原介绍，年份及批次以实物酒标和订单确认为准。",
      description: wine.description,
      usage: `配餐建议：${wine.pairing}。饮用和保存可参考下方通用建议，实物酒标说明优先。`,
      warning: "未成年人不得购买或饮用酒类，请适量饮酒。饮酒后请勿驾驶；孕期、哺乳期及不宜饮酒者请勿饮用。",
      detailImages: [wineVisual(wine.id, "detail")],
      detailImagesCaption: "依据原商品资料与真实包装重新设计；葡萄园、酒窖与配餐场景为视觉演绎，并非酒庄实拍。",
      factSheet: {
        title: "酒款档案",
        items: [
          { label: "原产国", value: "西班牙" },
          { label: "产区", value: wine.region },
          { label: "酒庄", value: wine.winery },
          { label: "葡萄品种", value: wine.grape },
          { label: "原资料年份", value: wine.year },
          { label: "酒精度", value: wine.alcohol },
          { label: "净含量", value: "750ml/瓶" },
          { label: "等级（原资料）", value: wine.grade },
          ...(wine.ageing ? [{ label: "陈酿", value: wine.ageing }] : []),
        ],
      },
      servingGuide: {
        title: "品鉴与保存",
        note: "以下为红葡萄酒通用建议，并非本款酒庄的固定参数；实际酒标说明优先。",
        items: [
          { title: "饮用温度", description: "饱满型红葡萄酒可参考15–18°C饮用，避免酒液过热；可结合个人口味调整。" },
          { title: "适度醒酒", description: "开瓶后先少量品尝，再根据酒的状态与个人口味决定是否适度醒酒，不必长时间放置。" },
          { title: "餐桌搭配", description: wine.pairing },
          { title: "避光保存", description: "未开瓶置于阴凉、避光且温度稳定处，远离热源；开瓶后及时封口冷藏并尽早饮用。" },
        ],
      },
      logistics: wineLogistics,
      notices: wineNotices,
    },
    skus: [
      {
        id: `${key}-750ml`,
        name: "750ml 单瓶装",
        subtitle: `原资料年份${wine.year} · ${wine.alcohol}`,
        priceCny: wine.priceCny,
        quantityPerOrder: 1,
        unitLabel: "瓶",
        netContentText: "750ml/瓶",
        // 仅为沿用精选系列的单次购买上限，不代表库存数量。
        maxPurchaseQty: 10,
        active: true,
        image,
        heroImages,
      },
    ],
    orderPolicy: {
      commissionEligible: false,
      allowAddressBook: true,
      allowFavorite: true,
      enableReview: false,
    },
  };
}

export const mibanSpanishWineProducts: LimitedProduct[] = [
  createWineProduct({
    id: "romanico",
    title: "罗马尼克干红葡萄酒",
    englishName: "ROMANICO",
    region: "托罗 Toro",
    winery: "Teso La Monja",
    year: "2020",
    alcohol: "14.5%vol",
    grape: "100% 丹魄 Tinta de Toro",
    grade: "Toro DO",
    ageing: "法国橡木桶陈酿6个月",
    priceCny: 328,
    description: "来自西班牙托罗产区，由Teso La Monja酿造。选用100% Tinta de Toro丹魄葡萄，经法国橡木桶陈酿6个月。浓郁果味与饱满酒体相映，层次丰厚，余味悠长。适合搭配牛排、烤羊腿、硬奶酪或伊比利亚火腿。",
    pairing: "牛排、烤羊腿、硬奶酪与伊比利亚火腿",
    highlights: ["饱满酒体", "浓郁果味", "橡木桶陈酿"],
    heroImages: [asset("romanico-label-closeup-QJ4zBX6VPML4htb6NGWWJM.webp"), originalWineImage("romanico-pairing.webp")],
  }),
  createWineProduct({
    id: "marthu",
    title: "玛莎干红葡萄酒",
    englishName: "MARTHU",
    region: "里奥哈 Rioja",
    winery: "马约尔酒庄 Bodegas Fuenmayor",
    year: "2018",
    alcohol: "14.5%vol",
    grape: "丹魄 Tempranillo",
    grade: "DOC",
    priceCny: 198,
    description: "来自西班牙里奥哈产区，由马约尔酒庄Bodegas Fuenmayor酿造，选用丹魄葡萄。酒色呈石榴红，果香清晰。适中的单宁与均衡酸度，展现平衡的口感。适合搭配奶酪、牛排和日常肉类料理。",
    pairing: "奶酪、牛排与肉类料理",
    highlights: ["石榴红色", "均衡酸度", "适中单宁"],
    heroImages: [originalWineImage("marthu-hero.webp"), originalWineImage("marthu-pairing.webp")],
  }),
  createWineProduct({
    id: "fidencio",
    title: "飞腾珍藏干红葡萄酒",
    englishName: "FIDENCIO RESERVA",
    region: "拉曼恰 La Mancha",
    winery: "圣女酒庄 Virgen de las Viñas",
    year: "2016",
    alcohol: "13.5%vol",
    grape: "丹魄 Tempranillo",
    grade: "DO / RESERVA",
    ageing: "橡木桶陈酿12个月",
    priceCny: 168,
    description: "来自西班牙拉曼恰产区圣女酒庄Virgen de las Viñas。以丹魄葡萄酿造，经橡木桶陈酿12个月。成熟红果与香草气息交织，口感柔顺，酒体饱满。适合搭配牛排、羊排或硬奶酪。",
    pairing: "牛排、羊排与硬奶酪",
    highlights: ["成熟红果", "柔顺饱满", "12个月陈酿"],
    heroImages: [originalWineImage("fidencio-hero.webp"), originalWineImage("fidencio-pairing.webp")],
  }),
];
