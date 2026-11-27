export type MoutaiYear = {
  year: number;
  priceCny: number | null;
  sourceName?: string;
  sourceUrl?: string;
  condition?: string;
};

export const PRICE_CHECKED_AT = '2026-11-27';
export const MOUTAI_POSTER = 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/guizhou/feitian/v1/feitian-long-poster-v2-88caf30dc78a.jpg';
export const MOUTAI_THUMB = 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/guizhou/feitian/v1/feitian-01-origin-v2-8fa2bd173f96.png';
export const MOUTAI_HERO = 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/guizhou/feitian/v1/feitian-hero-purchase-v3-65a7c3dfe3fe.jpg';
export const MOUTAI_STORY = 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/guizhou/feitian/v1/feitian-story-purchase-v3-fc7321aeeced.jpg';
export const OFFICIAL_SOURCE = 'https://www.moutaichina.com/mtgf/2023-10/31/article_2023103117423682414.html';

// Reference-only values: production checkout stays disabled until an operator
// sets selling prices and stock. Never fall back to a different year's price.
export const MOUTAI_YEARS: MoutaiYear[] = [
  { year: 2026, priceCny: null },
  {
    year: 2025,
    priceCny: 1850,
    sourceName: '识货 · 京东渠道比价',
    sourceUrl: 'https://m.shihuo.cn/page/supplierList/1642889761?sku_id=1642889761&id=7355912',
    condition: '公开页为识货 App 专享优惠价，未展示具体店铺。不是本站售价或库存承诺。',
  },
  {
    year: 2024,
    priceCny: 2729,
    sourceName: '苏宁 · 和兴佳润酒类旗舰店',
    sourceUrl: 'https://m.suning.com/product/0070849775/12432676170.html',
    condition: '2024年产53度500mL单瓶商品页标价。页面未明确内销/出口版本，地区库存与结算价待核实；仅作该商家标价参考，不视为同版本已确认售价。',
  },
  { year: 2023, priceCny: null },
  { year: 2022, priceCny: null },
  { year: 2021, priceCny: null },
  { year: 2020, priceCny: null },
];

export const BOTTLE_QUANTITIES = [1, 2, 3, 4, 5, 6] as const;

export function getMoutaiQuote(year: number, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 6) {
    throw new RangeError('每单只能选择1—6瓶，超过6瓶请分两单。');
  }
  const sku = MOUTAI_YEARS.find(item => item.year === year);
  if (!sku) throw new RangeError('请选择已列出的生产年份。');
  return {
    sku,
    quantity,
    totalCny: sku.priceCny === null ? null : (Math.round(sku.priceCny * 100) * quantity) / 100,
  };
}

export const money = (value: number) => new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(value);
