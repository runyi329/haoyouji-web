import { describe, expect, it } from "vitest";
import {
  filterMidaniangSelection,
  midaniangSelectionCatalog,
  type MidaniangSelectionFilters,
} from "../shared/midaniang-selection-catalog";
import {
  getMibanLimitedProduct,
  getMibanLimitedProductSku,
} from "../shared/miban-limited-products";

const allFilters: MidaniangSelectionFilters = {
  category: "all",
  packaging: "all",
  sort: "recommended",
  query: "",
};

describe("midaniang selection catalog", () => {
  it("contains only the two first-batch rice products", () => {
    expect(midaniangSelectionCatalog).toHaveLength(2);
    expect(midaniangSelectionCatalog.map(item => item.key)).toEqual([
      "classic-rice-gift",
      "family-rice-gift",
    ]);
    expect(
      midaniangSelectionCatalog.every(item => item.category === "rice")
    ).toBe(true);
  });

  it("maps both purchasable entries to explicit official products and SKUs", () => {
    expect(
      midaniangSelectionCatalog.map(
        ({ key, purchasable, productKey, skuId }) => ({
          key,
          purchasable,
          productKey,
          skuId,
        })
      )
    ).toEqual([
      {
        key: "classic-rice-gift",
        purchasable: true,
        productKey: "midaniang-classic-rice-gift",
        skuId: "classic-500g-6",
      },
      {
        key: "family-rice-gift",
        purchasable: true,
        productKey: "midaniang-family-rice-gift",
        skuId: "family-300g-9",
      },
    ]);
  });

  it.each(midaniangSelectionCatalog)(
    "resolves $key against the real on-sale catalog, without inventing a SKU",
    item => {
      const product = getMibanLimitedProduct(item.productKey);
      expect(product).toBeDefined();
      expect(product?.status).toBe("on_sale");
      expect(product?.checkoutGroupKey).toBe("midaniang-limited");
      const sku = getMibanLimitedProductSku(product!, item.skuId);
      expect(sku).toBeDefined();
      expect(sku?.id).toBe(item.skuId);
      expect(sku?.priceCny).toBe(item.priceCny);
      expect(sku?.unitLabel).toBe("盒");
    }
  );

  it("preserves the confirmed classic specification", () => {
    const item = midaniangSelectionCatalog[0];
    expect(item.priceCny).toBe(228);
    expect(item.specification).toBe("500g×6包 · 净含量3000g（6斤）");
    expect(item.specification).toContain("500g×6");
    expect(item.specification).toContain("3000g");
    expect(item.tags).toEqual(
      expect.arrayContaining(["500g×6", "3000g", "6斤"])
    );
    expect(item.specificationConfirmed).toBe(true);
  });

  it("preserves the confirmed family net weight", () => {
    const item = midaniangSelectionCatalog[1];
    expect(item.specification).toBe("300g×9包 · 净含量2700g（5.4斤）");
    expect(item.specificationConfirmed).toBe(true);
    expect(item.tags).toEqual(
      expect.arrayContaining(["300g×9", "2700g", "5.4斤"])
    );
    expect(item.specification).toContain("300g×9");
    expect(item.specification).toContain("2700g");
    expect(item.specification).toContain("5.4斤");
    expect(item.specification).not.toContain("3000g");
    expect(item.tags).not.toContain("净含量待确认");
  });

  it.each([
    {
      key: "classic-rice-gift",
      gramsPerPack: 500,
      packCount: 6,
      netGrams: 3000,
      weightJin: 6,
    },
    {
      key: "family-rice-gift",
      gramsPerPack: 300,
      packCount: 9,
      netGrams: 2700,
      weightJin: 5.4,
    },
  ])(
    "$key keeps explicit pack count, net grams and jin consistent with its official SKU",
    ({ key, gramsPerPack, packCount, netGrams, weightJin }) => {
      const item = midaniangSelectionCatalog.find(item => item.key === key)!;
      const product = getMibanLimitedProduct(item.productKey)!;
      const sku = getMibanLimitedProductSku(product, item.skuId)!;
      const specification = item.specification.match(
        /^(\d+)g×(\d+)包 · 净含量(\d+)g（(\d+(?:\.\d+)?)斤）$/
      );
      const officialContent = sku.netContentText.replace(/\s/g, "");
      const officialSpecification = officialContent.match(
        /^(\d+)g×(\d+)包·(\d+)g（(\d+(?:\.\d+)?)斤）$/
      );
      expect(specification).not.toBeNull();
      expect(officialSpecification).not.toBeNull();
      expect(specification?.slice(1).map(Number)).toEqual([
        gramsPerPack,
        packCount,
        netGrams,
        weightJin,
      ]);
      expect(officialSpecification?.slice(1)).toEqual(specification?.slice(1));
      expect(item.specification.replace(/\s|净含量/g, "")).toBe(officialContent);
      expect(Number(specification?.[1]) * Number(specification?.[2])).toBe(
        Number(specification?.[3])
      );
      expect(Number(specification?.[3]) / 500).toBe(
        Number(specification?.[4])
      );
      expect(item.specification).not.toContain("3800");
      expect(sku.netContentText).not.toContain("3800");
    }
  );

  it("returns all products for the all filter", () => {
    expect(filterMidaniangSelection(allFilters).map(item => item.key)).toEqual([
      "classic-rice-gift",
      "family-rice-gift",
    ]);
  });

  it("returns no products for oil and ricecake categories", () => {
    expect(
      filterMidaniangSelection({ ...allFilters, category: "oil" })
    ).toEqual([]);
    expect(
      filterMidaniangSelection({ ...allFilters, category: "ricecake" })
    ).toEqual([]);
  });

  it("filters classic packaging", () => {
    expect(
      filterMidaniangSelection({ ...allFilters, packaging: "classic" }).map(
        item => item.key
      )
    ).toEqual(["classic-rice-gift"]);
  });

  it("filters family packaging", () => {
    expect(
      filterMidaniangSelection({ ...allFilters, packaging: "family" }).map(
        item => item.key
      )
    ).toEqual(["family-rice-gift"]);
  });

  it("normalizes query case and whitespace and searches title/details/tags", () => {
    expect(
      filterMidaniangSelection({ ...allFilters, query: "  500G×6  " }).map(
        item => item.key
      )
    ).toEqual(["classic-rice-gift"]);
    expect(
      filterMidaniangSelection({ ...allFilters, query: "  300G×9 " }).map(
        item => item.key
      )
    ).toEqual(["family-rice-gift"]);
    expect(filterMidaniangSelection({ ...allFilters, query: "礼 物" })).toEqual(
      []
    );
  });

  it("applies category and packaging as AND filters", () => {
    expect(
      filterMidaniangSelection({
        ...allFilters,
        category: "rice",
        packaging: "family",
      }).map(item => item.key)
    ).toEqual(["family-rice-gift"]);
    expect(
      filterMidaniangSelection({
        ...allFilters,
        category: "oil",
        packaging: "family",
      })
    ).toEqual([]);
  });

  it("keeps equal-price products stable for both price sorts", () => {
    expect(
      filterMidaniangSelection({ ...allFilters, sort: "price-asc" }).map(
        item => item.rank
      )
    ).toEqual([0, 1]);
    expect(
      filterMidaniangSelection({ ...allFilters, sort: "price-desc" }).map(
        item => item.rank
      )
    ).toEqual([0, 1]);
  });

  it("combines search, packaging, and sort without mutation", () => {
    const before = JSON.stringify(midaniangSelectionCatalog);
    const result = filterMidaniangSelection({
      category: "rice",
      packaging: "family",
      sort: "price-desc",
      query: "  大米 ",
    });
    expect(result.map(item => item.key)).toEqual(["family-rice-gift"]);
    expect(JSON.stringify(midaniangSelectionCatalog)).toBe(before);
  });

  it("does not mutate the catalog or filters when sorting a result", () => {
    const filters: MidaniangSelectionFilters = {
      ...allFilters,
      sort: "price-asc",
    };
    const filtersBefore = { ...filters };
    const catalogBefore = [...midaniangSelectionCatalog];
    const result = filterMidaniangSelection(filters);
    result.reverse();
    expect(filters).toEqual(filtersBefore);
    expect(midaniangSelectionCatalog).toEqual(catalogBefore);
  });
});
