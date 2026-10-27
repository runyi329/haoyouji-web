import { HERBALIFE_THEME } from "./herbalife-theme";

export const TUOQUETANG_THEME = {
  primary: "#0E5A50",
  price: "#0F8A73",
  navy: "#123B37",
  canvas: "#F7F6F0",
  surface: "#FFFFFF",
  surfaceMuted: "#EDF5F1",
  border: "#DCEBE5",
  text: "#163B36",
  muted: "#58736D",
  subtle: "#8BA19A",
} as const;

export const TUOQUETANG_COS_BASE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/tuoquetang/v1";

export const tuoquetangImage = (product: string, file: string) =>
  `${TUOQUETANG_COS_BASE}/${product}/${file}`;

export const mibanLimitedBrands = [
  {
    slug: "herbalife",
    brand: "康宝莱",
    eyebrow: "HERBALIFE",
    title: "康宝莱系列",
    description: "营养补充、体重管理与日常健康支持",
    status: "on_sale" as const,
    theme: HERBALIFE_THEME,
  },
  {
    slug: "tuoquetang",
    brand: "佗鹊堂",
    eyebrow: "草本日用",
    title: "佗鹊堂精选",
    description: "两件商品资料预览，等待包装与渠道资料核验",
    status: "review" as const,
    theme: TUOQUETANG_THEME,
  },
] as const;

export type MibanLimitedBrand = (typeof mibanLimitedBrands)[number];

export function getMibanLimitedBrandBySlug(
  slug: string
): MibanLimitedBrand | undefined {
  return mibanLimitedBrands.find(brand => brand.slug === slug);
}

export function getMibanLimitedBrandByName(
  name: string
): MibanLimitedBrand | undefined {
  return mibanLimitedBrands.find(brand => brand.brand === name);
}
