import { describe, expect, it } from "vitest";
import { getMibanLimitedProduct } from "../shared/miban-limited-products";

describe("herbalife aloe nutrition limited product", () => {
  it("uses the seven original detail images followed by product information and label/QA", () => {
    const product = getMibanLimitedProduct("herbalife-aloe-nutrition");
    expect(product).toBeDefined();

    const detail = product!.detail;
    const expectedOriginalDetailImages = [
      "detail-01-pocket-nutrition.jpg",
      "detail-02-portable-pack.jpg",
      "detail-03-lifestyle-concerns.jpg",
      "detail-04-nutrition-support.jpg",
      "detail-05-product-pack.jpg",
      "detail-06-material-formula-taste.jpg",
      "detail-07-usage-and-lifestyles.jpg",
    ].map(
      (file) =>
        `https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/herbalife/v1/aloe-nutrition/user-detail-v2/${file}`,
    );
    const expectedFinalDetailImages = [
      "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/herbalife/v1/aloe-nutrition/user-detail-v2/detail-08-product-information-b28bbec7fdc5.jpg",
      "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-shebei/herbalife/v1/aloe-nutrition/user-detail-v2/detail-09-product-label-and-qa-61873cd660ba.jpg",
    ];

    expect(detail.detailImages).toHaveLength(9);
    expect(detail.detailImages!.slice(0, 7)).toEqual(expectedOriginalDetailImages);
    expect(detail.detailImages!.slice(7)).toEqual(expectedFinalDetailImages);
    expect(
      detail.detailImages!.filter((image) => image.endsWith("detail-07-usage-and-lifestyles.jpg")),
    ).toHaveLength(1);
    expect(detail.detailImages!.filter((image) => image === expectedFinalDetailImages[0])).toHaveLength(1);
    expect(detail.detailImages!.filter((image) => image === expectedFinalDetailImages[1])).toHaveLength(1);
    expect(detail.introImage).toBeUndefined();
    expect(detail.introImageAlt).toBeUndefined();
    expect(JSON.stringify(product)).not.toContain("intro-usage-guide-crop");

    const aloeCosHost = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/";
    const aloeImages = [
      product!.card.image,
      ...detail.heroImages,
      detail.productImage,
      ...detail.detailImages!,
      ...product!.skus.flatMap((sku) => [sku.image, ...(sku.heroImages ?? [])]),
    ].filter((image): image is string => image !== undefined);
    expect(aloeImages.length).toBeGreaterThan(0);
    expect(aloeImages.every((image) => image.startsWith(aloeCosHost))).toBe(true);

    expect(product!.skus).toHaveLength(1);
    expect(product!.skus[0]).not.toHaveProperty("detailImages");
    expect(product!.skus[0]).not.toHaveProperty("detailImage");
    expect(detail.usage).toBe("将一条（4g）溶于240ml水、茶饮、果汁或营养奶昔中。");
    expect(detail.warning).toBe("本品添加芦荟，孕妇与婴幼儿慎用；每日食用不宜超过4g。含乳制品。");
    expect(product!.status).toBe("on_sale");
    expect(product!.skus[0]).toMatchObject({
      id: "aloe-nutrition-4g-14",
      priceCny: 143,
      quantityPerOrder: 1,
      maxPurchaseQty: 10,
    });
  });
});
