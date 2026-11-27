import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getMibanOrderBenefitDisplay } from "../client/src/pages/miban/MibanOrderBenefitsDetails";

const line = (originalCny: number, paidCny: number, ruleName = "专属折扣") => ({
  benefitSnapshot: { storefront: "miban-limited", originalCny, paidCny, ruleName, summary: "全年已省¥100.01" },
});
describe("immutable order benefit display", () => {
  it("shows each order's actual saving, not a whole-checkout/annual summary", () => {
    expect(getMibanOrderBenefitDisplay({ ingredients: JSON.stringify([line(456, 447.67)]), totalPrice: "447.67" }))
      .toEqual({ originalCents: 45600, paidCents: 44767, savedCents: 833, names: ["专属折扣"] });
  });
  it("aggregates line cents and deduplicates rule names", () => {
    expect(getMibanOrderBenefitDisplay({ ingredients: [line(100, 80), line(60, 50)], totalPrice: 130 }))
      .toEqual({ originalCents: 16000, paidCents: 13000, savedCents: 3000, names: ["专属折扣"] });
  });
  it("hides old orders without snapshots and malformed, cross-storefront or mismatched totals", () => {
    for (const ingredients of [null, "[]", "malformed", [{ name: "历史商品" }], [{ benefitSnapshot: { storefront: "other", originalCny: 100, paidCny: 80 } }]]) {
      expect(getMibanOrderBenefitDisplay({ ingredients, totalPrice: 80 })).toBeNull();
    }
    expect(getMibanOrderBenefitDisplay({ ingredients: [line(100, 80)], totalPrice: 100 })).toBeNull();
    expect(getMibanOrderBenefitDisplay({ ingredients: [line(100, 100)], totalPrice: 100 })).toBeNull();
    expect(getMibanOrderBenefitDisplay({ ingredients: [line(100, -1)], totalPrice: -1 })).toBeNull();
  });
});

describe("refund and historical benefit boundaries", () => {
  const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
  it("checks benefit associations inside the owner-locked deletion transaction", () => {
    const start = source.indexOf("  adminDelete: mibanAdminProcedure");
    const operation = source.slice(start, source.indexOf("  // 导出订单CSV", start));
    expect(operation).toContain("withGlobalWalletTransaction(order.userId, async transaction");
    expect(operation).toContain("LIMIT 1 FOR UPDATE");
    expect(operation.indexOf("assertMibanBenefitOrderCanDelete")).toBeLessThan(operation.indexOf("txDb.delete(mibanOrders)"));
  });
  it("prevents shipped/delivered orders reverting to pre-shipment statuses", () => {
    const start = source.indexOf("async function updateOrderStatus(");
    const operation = source.slice(start, source.indexOf("async function getAllCommissionConfigs", start));
    expect(operation).toContain('["pending", "confirmed", "packing"].includes(status)');
    expect(operation).toContain("NOT IN ('shipped', 'delivered')");
    expect(operation).toContain("<> 'cancelled'");
  });
});
