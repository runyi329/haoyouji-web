import officialProductData from "./miban-official-products-data.json";

export const mibanOfficialBrands = [
  {
    slug: "nuskin", brand: "如新", title: "如新美肤精选", eyebrow: "NU SKIN",
    description: "科技美肤，净肤与日常养护。",
    logo: "/miban-nuskin/nuskin-official-logo.png",
    theme: { primary: "#198E9E", navy: "#243D4A", canvas: "#F3F8F9", muted: "#607581", border: "#DCE9EC", surfaceMuted: "#E8F3F5" },
  },
  {
    slug: "marykay", brand: "玫琳凯", title: "玫琳凯美肤精选", eyebrow: "MARY KAY",
    description: "细致呵护，绽放光采。",
    logo: "/miban-marykay/marykay-official-logo.png",
    theme: { primary: "#9C5867", navy: "#35282E", canvas: "#FBF5F5", muted: "#8B6872", border: "#EFDFE2", surfaceMuted: "#F6E8EC" },
  },
  {
    slug: "amway", brand: "安利", title: "安利日用精选", eyebrow: "AMWAY",
    description: "洁净日常，舒适相伴。",
    logo: "/miban-amway/amway-official-logo.png",
    theme: { primary: "#38539A", navy: "#243B72", canvas: "#F4F6FB", muted: "#637390", border: "#DFE6F2", surfaceMuted: "#EAF0FA" },
  },
] as const;

export type MibanOfficialBrand = (typeof mibanOfficialBrands)[number];
export type MibanOfficialBrandSlug = MibanOfficialBrand["slug"];
export type MibanOfficialProductImage = { url: string; caption: string; kind: string; sourceUrl?: string; width?: number; height?: number };
export type MibanOfficialStudyHighlight = {
  value: string;
  label: string;
  description: string;
  original: string;
  kind: "self-report" | "evaluation";
  primary?: boolean;
};
export type MibanOfficialMobilePosterPart = {
  id: string;
  kind: "image" | "info";
  layout?: "note" | "study" | "certificate" | "usage" | "product" | "ingredients" | "feature";
  image?: MibanOfficialProductImage;
  title?: string;
  eyebrow?: string;
  paragraphs?: string[];
  footnotes?: string[];
  bullets?: string[];
  steps?: string[];
  specs?: Array<{ label: string; value: string }>;
  photos?: MibanOfficialProductImage[];
  sourceUrl?: string;
  sourceRange?: [number, number];
  sourceTextLocation?: string;
  studyHighlights?: MibanOfficialStudyHighlight[];
  studyNote?: string;
  usageFacts?: Array<{ label: string; value: string }>;
};
export type MibanOfficialMobilePoster = {
  background: string;
  accent: string;
  sourcePosterCount: number;
  substantialSections: number;
  parts: MibanOfficialMobilePosterPart[];
};
export type MibanOfficialProduct = {
  key: string;
  brand: string;
  brandSlug: MibanOfficialBrandSlug;
  name: string;
  officialUrl: string;
  category: string;
  specification: string;
  summary: string;
  features: string[];
  usage: string;
  ingredients: string;
  warnings: string[];
  /** 官网参考价不是米伴售价；本资料目录不会进入交易或库存系统。 */
  officialPriceCny: number | null;
  officialPriceSourceUrl?: string;
  officialPriceCheckedDate?: string;
  priceNote: string;
  priceSourceNotice?: string;
  heroImageUrl: string;
  heroSourceUrl?: string;
  heroLayout?: "poster" | "packaging";
  heroImageSize?: { width: number; height: number };
  cardImageUrl?: string;
  gallery: MibanOfficialProductImage[];
  mobilePoster?: MibanOfficialMobilePoster;
  detailStatus?: "complete" | "pending_materials";
  materialsNotice?: string;
  evidence: Array<{ url: string; supports: string }>;
  limitations: string;
};

// 资料与销售目录分离：没有 priceCny、skus 或 orderPolicy，不触发库存初始化或付款。
export const mibanOfficialProducts = (officialProductData as MibanOfficialProduct[]).map(product => ({
  ...product,
  status: "information_only" as const,
  sellable: false as const,
}));

export const getMibanOfficialBrand = (slug: string) => mibanOfficialBrands.find(brand => brand.slug === slug);
export const getMibanOfficialProduct = (key: string) => mibanOfficialProducts.find(product => product.key === key);
export const mibanOfficialBrandPath = (slug: string) => `/p/proj_hzxm2t/limited/${slug}`;
export const mibanOfficialProductPath = (key: string) => `/p/proj_hzxm2t/limited/official/${key}`;
