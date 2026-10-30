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

export const MAJIAYOU_THEME = {
  primary: "#566C2D",
  price: "#C65A42",
  navy: "#33461F",
  canvas: "#FAF9F5",
  surface: "#FFFFFF",
  surfaceMuted: "#F2F4E8",
  border: "#DCE5C7",
  text: "#33461F",
  muted: "#707B5C",
  subtle: "#A2AB91",
} as const;

export const LINGCHUANG_THEME = {
  primary: "#3E52B8",
  price: "#4055C7",
  navy: "#1F2E72",
  canvas: "#F4F7FF",
  surface: "#FFFFFF",
  surfaceMuted: "#EDF2FF",
  border: "#D9E3FF",
  text: "#1B2B69",
  muted: "#5E6D9A",
  subtle: "#96A2C3",
} as const;

export const TUOQUETANG_COS_BASE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/tuoquetang/v1";

export const MAJIAYOU_COS_BASE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/guangfeng-majiayou/v1";

export const tuoquetangImage = (product: string, file: string) =>
  `${TUOQUETANG_COS_BASE}/${product}/${file}`;

export const majiayouImage = (file: string) => `${MAJIAYOU_COS_BASE}/${file}`;

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
    description: "蓝布正植物牙膏与复生1号",
    status: "on_sale" as const,
    theme: TUOQUETANG_THEME,
  },
  {
    slug: "lingchuang",
    brand: "凌创生物",
    eyebrow: "LINGCHUANG BIO",
    title: "凌创生物精选",
    description: "营养固体饮料精选",
    // 品牌入口可公开浏览；具体商品仍由商品自身draft状态控制，不开放交易。
    status: "on_sale" as const,
    theme: LINGCHUANG_THEME,
  },
  {
    slug: "fruits",
    brand: "四季水果精选",
    eyebrow: "江西上饶广丰",
    title: "四季水果精选",
    description: "随季更新，从产地到餐桌的好水果",
    status: "on_sale" as const,
    theme: MAJIAYOU_THEME,
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
