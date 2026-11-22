/**
 * 米大娘精选页面目录。正式成交价格、库存和订单仍由限时商品SKU及服务端核验。
 * 商品页通过明确的productKey/skuId映射接入既有商城，不接受页面自报成交金额。
 */
export type MidaniangCategory = "all" | "rice" | "oil" | "ricecake";
export type MidaniangPackaging = "all" | "classic" | "family";
export type MidaniangSort = "recommended" | "price-asc" | "price-desc";

export type MidaniangSelectionFilters = {
  category: MidaniangCategory;
  packaging: MidaniangPackaging;
  sort: MidaniangSort;
  query: string;
};

export type MidaniangSelectionItem = {
  key: "classic-rice-gift" | "family-rice-gift";
  title: "经典大米礼盒" | "给孩子的一份礼物";
  category: "rice";
  packaging: "classic" | "family";
  description: string;
  specification: string;
  priceCny: 228;
  specificationConfirmed: boolean;
  tags: string[];
  rank: 0 | 1;
  purchasable: true;
  productKey: "midaniang-classic-rice-gift" | "midaniang-family-rice-gift";
  skuId: "classic-500g-6" | "family-300g-9";
};

/** 页面排序与展示规格；成交配置由共享正式商品目录提供。 */
export const midaniangSelectionCatalog: readonly MidaniangSelectionItem[] = [
  {
    key: "classic-rice-gift",
    title: "经典大米礼盒",
    category: "rice",
    packaging: "classic",
    description: "米大娘经典大米礼盒，适合作为日常分享或节日心意。",
    specification: "500g×6 · 净含量3000g（6斤）",
    priceCny: 228,
    specificationConfirmed: true,
    tags: ["大米", "礼盒", "经典", "500g×6", "3000g", "6斤"],
    rank: 0,
    purchasable: true,
    productKey: "midaniang-classic-rice-gift",
    skuId: "classic-500g-6",
  },
  {
    key: "family-rice-gift",
    title: "给孩子的一份礼物",
    category: "rice",
    packaging: "family",
    description: "米大娘给孩子的一份礼物，轻巧分装，适合作为分享心意。",
    specification: "300g×9包 · 净含量2700g（5.4斤）",
    priceCny: 228,
    specificationConfirmed: true,
    tags: ["大米", "礼物", "孩子", "300g×9", "2700g", "5.4斤"],
    rank: 1,
    purchasable: true,
    productKey: "midaniang-family-rice-gift",
    skuId: "family-300g-9",
  },
];

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

const defaultFilters: MidaniangSelectionFilters = {
  category: "all",
  packaging: "all",
  sort: "recommended",
  query: "",
};

/** 纯展示筛选：不修改目录或传入 filters，且油/年糕目前自然返回空结果。 */
export function filterMidaniangSelection(
  filters: MidaniangSelectionFilters,
): MidaniangSelectionItem[] {
  const category = filters.category ?? defaultFilters.category;
  const packaging = filters.packaging ?? defaultFilters.packaging;
  const sort = filters.sort ?? defaultFilters.sort;
  const query = normalized(filters.query ?? defaultFilters.query);

  const result = midaniangSelectionCatalog.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (packaging !== "all" && item.packaging !== packaging) return false;
    if (query) {
      const searchable = normalized([
        item.title,
        item.description,
        item.specification,
        ...item.tags,
      ].join(" "));
      if (!searchable.includes(query)) return false;
    }
    return true;
  });

  return result.sort((left, right) => {
    if (sort === "price-asc") return left.priceCny - right.priceCny || left.rank - right.rank;
    if (sort === "price-desc") return right.priceCny - left.priceCny || left.rank - right.rank;
    return left.rank - right.rank;
  });
}
