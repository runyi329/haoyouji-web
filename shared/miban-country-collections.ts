/** 已确认的国别精选入口；无货源，仅接入专区，不创建商品、SKU或售价。 */
export const mibanCountryCollections = [
  { slug: "france", title: "法国精选", description: "红葡萄酒、法国奶酪与香槟", accent: "#831C25", background: "#F7EFE3", ctaWidth: "32%" },
  { slug: "germany", title: "德国精选", description: "德国啤酒、方形巧克力与牛奶", accent: "#173F2B", background: "#F7EFE3", ctaWidth: "32%" },
  { slug: "belgium", title: "比利时精选", description: "贝壳巧克力、特色啤酒与焦糖饼干", accent: "#81451E", background: "#F7EFE3", ctaWidth: "36%" },
  { slug: "netherlands", title: "荷兰精选", description: "牛奶、奶粉与豪达奶酪", accent: "#173E71", background: "#F7F6F2", ctaWidth: "32%" },
  { slug: "italy", title: "意大利精选", description: "意式咖啡、意大利面与榛果巧克力", accent: "#AD3F1C", background: "#F7EFE3", ctaWidth: "35%" },
  { slug: "switzerland", title: "瑞士精选", description: "瑞士巧克力与黄油薄脆饼干", accent: "#AA1E28", background: "#F7EFE3", ctaWidth: "34%" },
  { slug: "norway", title: "挪威精选", description: "三文鱼为主，搭配特色棕奶酪", accent: "#143C6B", background: "#F1F4F5", ctaWidth: "33%" },
] as const;

export type MibanCountryCollection = (typeof mibanCountryCollections)[number];
export type MibanCountryCollectionSlug = MibanCountryCollection["slug"];

export function getMibanCountryCollection(slug: string): MibanCountryCollection | undefined {
  return mibanCountryCollections.find(collection => collection.slug === slug);
}

export function getMibanCountryCardImage(slug: MibanCountryCollectionSlug): string {
  return `/miban-countries/${slug}-card-v1.webp`;
}
