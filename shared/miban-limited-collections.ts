import { mibanLimitedBrands, getMibanLimitedBrandByName } from "./miban-limited-brand-config";
import { mibanCountryCollections } from "./miban-country-collections";

/** 精选分类开关独立于商品/SKU开关；以后无货源的新分类将 defaultActive 设为 false。 */
export const mibanLimitedCollections: ReadonlyArray<{
  slug: string;
  title: string;
  defaultActive: boolean;
}> = [
  ...mibanLimitedBrands.map(brand => ({
    slug: brand.slug,
    title: brand.title,
    defaultActive: brand.status === "on_sale",
  })),
  { slug: "guizhou", title: "贵州精选", defaultActive: true },
  { slug: "amway", title: "安利日用精选", defaultActive: true },
  { slug: "marykay", title: "玫琳凯美肤精选", defaultActive: true },
  { slug: "nuskin", title: "如新美肤精选", defaultActive: true },
  { slug: "jianghai", title: "江海鲜选", defaultActive: true },
  ...mibanCountryCollections.map(collection => ({
    slug: collection.slug,
    title: collection.title,
    defaultActive: false,
  })),
];

export function getMibanLimitedCollection(slug: string) {
  return mibanLimitedCollections.find(collection => collection.slug === slug);
}

export function getMibanLimitedProductCollectionSlug(product: { brand: string } | undefined): string | undefined {
  return product ? getMibanLimitedBrandByName(product.brand)?.slug : undefined;
}

/** 统一覆盖品牌页、商品页、购买页、米大娘子页与旧水果/贵州链接。 */
export function getMibanLimitedCollectionSlugForPath(
  path: string,
  productByKey: (key: string) => { brand: string } | undefined,
): string | undefined {
  const cleanPath = path.split("?")[0].replace(/\/$/, "");
  const base = "/p/proj_hzxm2t";
  if (cleanPath === `${base}/pear/tiangui`) return "fruits";
  if (!cleanPath.startsWith(`${base}/limited/`)) return undefined;
  const [key, officialKey] = cleanPath.slice(`${base}/limited/`.length).split("/");
  // 官方资料目录使用品牌前缀编号；直接按路径归属，不把完整海报资料下载到每个入口。
  if (key === "official") {
    return /^(amway|marykay|nuskin)-official-\d+$/.exec(officialKey ?? "")?.[1];
  }
  if (key === "moutai-feitian") return "guizhou";
  if (getMibanLimitedCollection(key)) return key;
  return getMibanLimitedProductCollectionSlug(productByKey(key));
}
