import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { splitMibanBenefitPeriodCents, mibanBenefitLineSnapshot } from "./miban-benefits-order";
import type { BenefitResult } from "../shared/miban-benefits";

const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const result: BenefitResult = {
  originalCents: 10000, totalCents: 7999, savedCents: 2001,
  lines: [{ productKey: "p", skuId: "s", quantity: 1, originalCents: 10000, totalCents: 7999, ruleId: "rule-1", ruleName: "专属优惠" }],
  consumedRuleIds: ["rule-1"], summary: "专属优惠",
};

describe("formal benefits integer order allocation", () => {
  it("apportions annual cents exactly and deterministically without zero child orders", () => {
    for (const total of [12, 13, 101, 7999, 22800 * 12 - 12345]) {
      const parts = splitMibanBenefitPeriodCents(total, 12);
      expect(parts).toHaveLength(12);
      expect(parts.reduce((sum, n) => sum + n, 0)).toBe(total);
      expect(parts.every(n => Number.isSafeInteger(n) && n > 0)).toBe(true);
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      expect(splitMibanBenefitPeriodCents(total, 12)).toEqual(parts);
    }
  });
  it("retains existing annual totals exactly when there is no user discount", () => {
    expect(splitMibanBenefitPeriodCents(22800 * 12, 12)).toEqual(Array(12).fill(22800));
  });
  it("fails closed for zero/insufficient/fractional/unsafe amounts", () => {
    for (const total of [0, 11, -1, 12.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => splitMibanBenefitPeriodCents(total, 12)).toThrow();
    }
    expect(() => splitMibanBenefitPeriodCents(12, 0)).toThrow();
  });
  it("freezes original, paid and saved amounts without internal management notes", () => {
    const snapshot = mibanBenefitLineSnapshot(result, "p", "s");
    expect(snapshot).toMatchObject({ storefront: "miban-limited", originalCny: 100, paidCny: 79.99, savedCny: 20.01, ruleId: "rule-1" });
    expect(snapshot).not.toHaveProperty("note");
    expect(() => mibanBenefitLineSnapshot(result, "removed", "s")).toThrow();
    expect(() => mibanBenefitLineSnapshot(result, "p", "s", 0)).toThrow();
  });
});

describe("formal benefits production checkout wiring", () => {
  const limited = source.slice(source.indexOf("export const mibanLimitedProductRouter"), source.indexOf("export const mibanAftersaleRouter"));
  for (const name of ["createAnnualOrder", "createOrder", "createCartOrder"]) {
    it(`${name} validates signed benefits in the wallet transaction and consumes them after payment`, () => {
      const start = limited.indexOf(`  ${name}: protectedProcedure`);
      const end = limited.indexOf("    }),", start);
      const procedure = limited.slice(start, end);
      expect(procedure).toContain("benefitsQuoteToken:");
      expect(procedure).toContain("getMibanBenefitQuote(");
      expect(procedure).toContain("benefitQuote.result.totalCents / 100");
      expect(procedure).toContain("withGlobalWalletTransaction(userId, async transaction =>");
      const transaction = procedure.slice(procedure.indexOf("withGlobalWalletTransaction(userId"));
      expect(transaction.indexOf("assertMibanBenefitQuote(")).toBeLessThan(transaction.indexOf("await createOrder("));
      expect(transaction.indexOf("recordMibanBenefitUse(")).toBeGreaterThan(transaction.indexOf("debitMiban"));
      expect(transaction).toContain("input.benefitsQuoteToken ?? benefitQuote.quoteToken, benefitQuote.result");
      expect(procedure).toContain("benefitSnapshot:");
    });
  }
  it("keeps ordinary rice/DIY checkout outside the limited-storefront benefits module", () => {
    const ordinary = source.slice(source.indexOf("export const mibanOrderRouter"), source.indexOf("export const mibanLimitedProductRouter"));
    const create = ordinary.slice(ordinary.indexOf("create:"), ordinary.indexOf("list:"));
    expect(create).not.toContain("getMibanBenefitQuote");
    expect(routeSource).toContain("benefits: mibanBenefitsRouter");
  });
  it("restores benefits in the same cancellation transaction, including cancelled replays", () => {
    const start = source.indexOf("  adminCancel: mibanAdminProcedure");
    const procedure = source.slice(start, source.indexOf("  adminDelete:", start));
    expect(procedure).toContain("await ensureMibanBenefitsInfrastructure()");
    expect(procedure).toContain("withGlobalWalletTransaction(owner.userId, async transaction =>");
    expect(procedure).toContain("await restoreMibanBenefitsForCancelledOrder(transaction");
    expect(procedure.indexOf("cancelMibanOrderWithWalletRefund")).toBeLessThan(procedure.indexOf("restoreMibanBenefitsForCancelledOrder"));
  });
  it("preserves the original commission contract while storing actual discounted order totals", () => {
    expect(limited).toContain("commissionBaseCny: originalTotalCny");
    expect(limited).toContain("commissionBaseCny: line.originalLineTotalCny");
    expect(limited).toContain("totalPrice: (periodTotals[index] / 100).toFixed(2)");
    expect(limited).toContain("splitMibanPaymentDeductionsByTotals(payment.deductions, periodTotals.map");
  });
});
