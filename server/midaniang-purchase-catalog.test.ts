import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  getMibanLimitedProduct,
  getMibanLimitedProductSku,
  mibanLimitedProducts,
} from "../shared/miban-limited-products";
import { midaniangSelectionAssets } from "../shared/midaniang-selection-assets";
import { midaniangSelectionCatalog } from "../shared/midaniang-selection-catalog";

const riceGiftCases = [
  {
    selectionKey: "classic-rice-gift",
    productKey: "midaniang-classic-rice-gift",
    skuId: "classic-500g-6",
    title: "经典大米礼盒",
    packagingText: "500g × 6包",
    netContentText: "500g × 6包 · 3000g（6斤）",
    image: midaniangSelectionAssets.grid["classic-rice-gift"],
    posters: [
      midaniangSelectionAssets.posters.classicHero,
      midaniangSelectionAssets.posters.organicStory,
      midaniangSelectionAssets.posters.classicPackaging,
      midaniangSelectionAssets.posters.classicGift,
      midaniangSelectionAssets.posters.cookingStory,
    ],
  },
  {
    selectionKey: "family-rice-gift",
    productKey: "midaniang-family-rice-gift",
    skuId: "family-300g-9",
    title: "给孩子的一份礼物",
    packagingText: "300g × 9包",
    netContentText: "300g × 9包 · 2700g（5.4斤）",
    image: midaniangSelectionAssets.grid["family-rice-gift"],
    posters: [
      midaniangSelectionAssets.posters.familyHero,
      midaniangSelectionAssets.posters.organicStory,
      midaniangSelectionAssets.posters.familyPackaging,
      midaniangSelectionAssets.posters.familyMeal,
      midaniangSelectionAssets.posters.cookingStory,
    ],
  },
];

// 接入前工作区中的完整商品配置指纹，包含已替换的芦荟详情图片。
// 本次只追加米大娘商品，任何既有商品字段变化都应先被单独审查。
const existingProductFingerprints: Record<string, string> = {
  "herbalife-red-ginseng": "801d4e566e92195c84a05b258d4e80915ebbd76d236780425ea82319bcfd3d16",
  "herbalife-herbal-tea-lemon": "4c917a3822b00abca6b4ffa8e077978e11d16959f76f238f65dabfd0b4b975ac",
  "herbalife-aloe-nutrition": "d4c609e11c2f39d775efa84383ecbd1492319aed18213444361e68f2d67c63e6",
  "herbalife-protein-shake-portable": "9fce7220e8a19d2b3d92c7b44df35cc24b6a5eda80f1b6399a7bc8b27f2ca7a3",
  "herbalife-ningyouran-sleep-5in1": "52248da483adcd1f4af3d5836dae06910f65d29ba2e5c7dd6f2d6fd27ff74077",
  "herbalife-youth-protein-portable": "5ae22a44cb04707a961b625ed0749d9108607d6102b45f69339dfd088f120444",
  "tuoquetang-blue-cloth-herbal-toothpaste": "11d7fe2c8cfa3a29ea3aaf0bdd55849d3d836aad7d0a934041835c8eb6a02a48",
  "tuoquetang-revigor-one": "93fc8519f1a89b55bc613eb5beb228596a5474d22b601429cc4d15537ec0ec77",
  "lingchuang-amino-sugar-hyaluronate": "b516438b234ac10f7827dd84de85d862178e5296a58d511e4d96e5be00599b4c",
  "lingchuang-pqq-sodium-hyaluronate-brightening": "d9af77bfa014b044277aac851ef9aec321caa2b144add59e227ed37d383a50b1",
  "guangfeng-majiayou": "da843f5eeb7b2a4192f053e35469f923775178baae6917369b16086787e8510d",
};

describe("midaniang production purchase catalog", () => {
  it("appends exactly two uniquely keyed production products", () => {
    const products = mibanLimitedProducts.filter((product) => product.brand === "米大娘");
    expect(products.map((product) => product.key)).toEqual(riceGiftCases.map((item) => item.productKey));
    expect(new Set(mibanLimitedProducts.map((product) => product.key)).size).toBe(mibanLimitedProducts.length);
    expect(new Set(products.flatMap((product) => product.skus.map((sku) => sku.id))).size).toBe(2);
  });

  for (const item of riceGiftCases) {
    describe(item.productKey, () => {
      it("maps the selection item to a live, correctly branded production product", () => {
        const selectionItem = midaniangSelectionCatalog.find((entry) => entry.key === item.selectionKey);
        const product = getMibanLimitedProduct(item.productKey);
        expect(selectionItem).toBeDefined();
        expect(item.productKey).toBe(`midaniang-${selectionItem!.key}`);
        expect(product).toMatchObject({
          key: item.productKey,
          status: "on_sale",
          brand: "米大娘",
          checkoutGroupKey: "midaniang-limited",
          category: "大米礼盒",
          card: { title: item.title },
          detail: { title: item.title, subtitle: item.netContentText, skuSelectionLabel: "规格" },
        });
        expect(product!.card.title).toBe(selectionItem!.title);
        expect(product!.publicPreview).not.toBe(true);
      });

      it("looks up the real active SKU at CNY 228 per box with the confirmed specification", () => {
        const product = getMibanLimitedProduct(item.productKey)!;
        const sku = getMibanLimitedProductSku(product, item.skuId);
        const selectionItem = midaniangSelectionCatalog.find((entry) => entry.key === item.selectionKey)!;
        expect(product.skus).toHaveLength(1);
        expect(sku).toBe(product.skus[0]);
        expect(sku).toMatchObject({
          id: item.skuId,
          name: item.packagingText,
          subtitle: `${item.netContentText} · 1盒装`,
          priceCny: 228,
          quantityPerOrder: 1,
          unitLabel: "盒",
          netContentText: item.netContentText,
          active: true,
          featured: true,
          maxPurchaseQty: 10,
        });
        expect(sku!.priceCny).toBe(selectionItem.priceCny);
        expect(sku!.maxPurchaseQty).toBe(getMibanLimitedProduct("herbalife-aloe-nutrition")!.skus[0].maxPurchaseQty);
        expect(sku).not.toHaveProperty("marketPriceCny");
        expect(sku).not.toHaveProperty("priceUsdt");
        expect(sku).not.toHaveProperty("fruitCountPerUnit");
        expect(sku).not.toHaveProperty("stockQty");
        expect(getMibanLimitedProductSku(product, "unknown-sku")).toBeUndefined();
        expect(getMibanLimitedProductSku(product, item.selectionKey)).toBeUndefined();
        const otherSkuId = riceGiftCases.find((entry) => entry.productKey !== item.productKey)!.skuId;
        expect(getMibanLimitedProductSku(product, otherSkuId)).toBeUndefined();
        expect(getMibanLimitedProductSku({ ...product, skus: [{ ...sku!, active: false }] }, item.skuId)).toBeUndefined();
      });

      it("uses the existing COS grid and five posters in the correct order", () => {
        const product = getMibanLimitedProduct(item.productKey)!;
        const sku = getMibanLimitedProductSku(product, item.skuId)!;
        expect(product.card.image).toBe(item.image);
        expect(product.detail.productImage).toBe(item.image);
        expect(sku.image).toBe(item.image);
        expect(product.detail.heroImages).toEqual([item.posters[0]]);
        expect(sku.heroImages).toEqual([item.posters[0]]);
        expect(product.detail.detailImages).toEqual(item.posters);
        expect(sku.detailImages).toEqual(item.posters);
        expect(item.posters).toHaveLength(5);
        const images = [item.image, ...item.posters];
        expect(images.every((image) => image.startsWith("https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/"))).toBe(true);
      });

      it("keeps the standard address/favorite policy and only existing fulfillment wording", () => {
        const product = getMibanLimitedProduct(item.productKey)!;
        expect(product.orderPolicy).toEqual({
          commissionEligible: false,
          allowAddressBook: true,
          allowFavorite: true,
          enableReview: false,
        });
        expect(product.detail.logistics).toEqual([
          { title: "订单处理", description: "付款后由工作人员核对订单并安排后续发货。" },
          { title: "售后咨询", description: "如有订单、物流或售后问题，请通过米伴订单页提交申请。" },
        ]);
      });

      it("states merchant-confirmed organic certification and design-image limitations without preview or invented verification claims", () => {
        const product = getMibanLimitedProduct(item.productKey)!;
        const content = JSON.stringify(product);
        expect(product.card.badge).toBe("有机认证");
        expect(product.detail.tags).toContain("有机认证");
        expect(product.detail.sourceNote).toContain("商家已确认获有机认证");
        expect(product.detail.detailImagesCaption).toBe("页面图片为设计展示，实际商品包装以到货实物为准。");
        expect(product.detail.notices).toContainEqual({ label: "图片说明", text: "页面图片为设计展示，实际商品包装以到货实物为准。" });
        for (const phrase of ["资料预览", "未开放购买", "暂不开放购买", "证书编号", "检测机构", "平台已核验", "平台已独立核验", "包邮", "次日达"]) {
          expect(content).not.toContain(phrase);
        }
      });
    });
  }

  it("does not change any existing product, SKU, fruit count or prior aloe asset replacement", () => {
    // The subsequently approved Spain wine/ham releases have their own full catalog tests.
    // Keep every original product fingerprint unchanged, rather than rebaseline the catalog.
    const existingProducts = mibanLimitedProducts.filter((product) => product.brand !== "西班牙" && !riceGiftCases.some((item) => item.productKey === product.key));
    expect(existingProducts.map((product) => product.key)).toEqual(Object.keys(existingProductFingerprints));
    for (const product of existingProducts) {
      const fingerprint = createHash("sha256").update(JSON.stringify(product)).digest("hex");
      expect(fingerprint, product.key).toBe(existingProductFingerprints[product.key]);
    }
    expect(getMibanLimitedProduct("unknown-product")).toBeUndefined();
  });
});
