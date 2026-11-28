import type { LimitedProduct } from "./miban-limited-products";
import { SPAIN_THEME } from "./miban-limited-brand-config";

const visual = (file: string) => `/miban-spain/ham/v1/${file}.webp`;

/** 用户确认的一件商品两规格；保留两种实物包装，不推导同厂或同等级。 */
export const mibanSpanishHamProduct: LimitedProduct = {
  key: "spain-iberian-ham",
  status: "on_sale",
  brand: "西班牙",
  checkoutGroupKey: "spain-ham",
  category: "西班牙火腿",
  card: {
    badge: "西班牙火腿",
    title: "西班牙火腿",
    subtitle: "整只与切片单包 · 两种规格",
    highlights: ["整只现切 · 单包摆盘", "干腌熟成", "薄切品鉴"],
    image: visual("list"),
    theme: { accent: SPAIN_THEME.primary, background: SPAIN_THEME.surfaceMuted },
  },
  detail: {
    title: "西班牙火腿",
    subtitle: "从伊比利亚猪，到餐桌上的薄片",
    tags: ["西班牙原产", "整只与切片", "两种规格"],
    skuSelectionLabel: "规格",
    heroImages: [visual("sliced-hero"), visual("whole-hero")],
    productImage: visual("list"),
    sourceNote: "整只与切片为两种规格，按所选规格和数量下单。",
    detailImages: Array.from({ length: 9 }, (_, i) => visual(`story-${String(i + 1).padStart(2, "0")}`)),
    posterPresentation: {
      background: "#F4EAD8",
      connectorImage: visual("connector"),
    },
    logistics: [],
    notices: [],
  },
  skus: [
    {
      id: "spain-ham-sliced-single",
      name: "切片单包",
      subtitle: "轻松摆盘 · 单包享用",
      priceCny: 60,
      featured: true,
      quantityPerOrder: 1,
      unitLabel: "包",
      netContentText: "切片单包，净含量以实物包装为准",
      maxPurchaseQty: 10,
      active: true,
      image: visual("sliced-hero"),
      heroImages: [visual("sliced-hero")],
    },
    {
      id: "spain-ham-whole-leg",
      name: "整只火腿",
      subtitle: "现切分享 · 整只装",
      priceCny: 2400,
      quantityPerOrder: 1,
      unitLabel: "只",
      netContentText: "整只装，实际重量以实物标签为准",
      maxPurchaseQty: 10,
      active: true,
      image: visual("whole-hero"),
      heroImages: [visual("whole-hero")],
    },
  ],
  orderPolicy: {
    commissionEligible: false,
    allowAddressBook: true,
    allowFavorite: true,
    enableReview: false,
  },
};
