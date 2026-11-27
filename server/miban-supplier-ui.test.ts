import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mibanLimitedProducts } from "../shared/miban-limited-products";
import { mibanImageAssets } from "../shared/miban-image-assets";
const page = (name: string) => readFileSync(new URL(`../client/src/pages/miban/${name}.tsx`, import.meta.url), "utf8");

describe("supplier UI keeps narrow authority and mobile image loading", () => {
  it("loads the independent supplier center lazily behind the existing identity gate", () => {
    const source = page("MibanApp");
    expect(source).toContain('lazy(() => import("./SupplierCenter"))');
    expect(source).toContain('path={`${BASE}/supplier`} component={SupplierCenter}');
    expect(source).toContain("prepareMibanPersonalQueries");
    expect(source).toContain('Array.isArray(route) && (route[0] === "supplier" || route[0] === "benefits")');
    expect(source).toContain("cancelQueries({ predicate: isSupplierQuery })");
    expect(source).toContain("removeQueries({ predicate: isSupplierQuery })");
  });
  it("uses only the actual root supplier namespace and a verified current identity", () => {
    for (const name of ["SupplierAdminPanel", "SupplierCenter"]) {
      const source = page(name);
      expect(source).toContain("trpc.supplier");
      expect(source).not.toContain("trpc.miban.supplier");
      expect(source).not.toContain("as any");
      expect(source).not.toContain("870413");
      expect(source).not.toContain('"jiang"');
      expect(source).toContain("me.isSuccess");
    }
  });
  it("does not expose platform-wide order, wallet, refund or user-role operations", () => {
    const source = page("SupplierCenter");
    for (const forbidden of ["order.allOrders", "order.updateStatus", "adminCancel", "adminDelete", "setUserRole", "wallet.adjust", "commission.settle"])
      expect(source).not.toContain(forbidden);
    for (const allowed of ["supplierApi.workspace", "FulfillmentPanel", "supplierApi.exportOrders"])
      expect(source).toContain(allowed);
    const fulfillment = page("FulfillmentPanel");
    expect(fulfillment).toContain("trpc.supplier.fulfillmentPreview.useMutation()");
    expect(fulfillment).toContain("trpc.supplier.fulfillmentApply.useMutation()");
    expect(fulfillment).not.toContain("trpc.order.allOrders");
    expect(source).not.toContain("supplierApi.ship");
    expect(source).not.toContain("supplierApi.batchShip");
  });
  it("administrator review starts read-only and CSV requires an explicit confirmation", () => {
    const source = page("SupplierCenter");
    expect(source).toContain("[readonlyReview, setReadonlyReview] = useState(true)");
    expect(source).toContain("const readonly = isAdmin ? readonlyReview : !supplier.active");
    const fulfillment = page("FulfillmentPanel");
    expect(fulfillment).toContain("parseFulfillmentCsv");
    expect(fulfillment).toContain("previewMutation.mutateAsync");
    expect(fulfillment).toContain("applyMutation.mutateAsync");
    expect(fulfillment).toContain("!ready || !confirmed");
    expect(fulfillment).toContain("已取得服务端版本，等待核对确认");
  });
  it("keeps administrator notes separate from status and fulfillment changes", () => {
    const source = page("UnifiedAdmin");
    expect(source).toContain("mtrpc.order.updateAdminNote.useMutation");
    const save = source.slice(source.indexOf("function saveAdminNote("), source.indexOf("function toggleSelect("));
    expect(save).toContain("noteMutation.mutate({ id: orderId, adminNote: note })");
    expect(save).not.toContain("updateMutation");
    expect(save).not.toContain("status:");
    expect(save).not.toContain("trackingNo");
  });
  it("small product cards use optimized thumbnails and no raw img tags", () => {
    const source = page("SupplierCenter");
    expect(source).toMatch(/<MibanImage\s+src=\{product\.image\}\s+variant="thumbnail"/);
    expect(source).not.toMatch(/<img\b/);
    expect(source).not.toContain('loading="eager"');
  });
  it("both Midaniang product images already have real 400px COS thumbnails", () => {
    const products = mibanLimitedProducts.filter(product => product.brand === "米大娘");
    expect(products).toHaveLength(2);
    for (const product of products) {
      const thumbnail = mibanImageAssets[product.detail.productImage]?.variants.thumbnail;
      expect(thumbnail).toBeDefined();
      expect(thumbnail?.src).toContain("optimized-images");
      expect(thumbnail?.width).toBeLessThanOrEqual(400);
    }
  });
});
