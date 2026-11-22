import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getMibanOrderWalletPaymentSummary } from "../shared/miban-wallet-payment";

const source = (name: string) => readFileSync(new URL(`../client/src/pages/${name}`, import.meta.url), "utf8");

describe("miban native payment history presentation", () => {
  it("preserves actual coin quantities without a current-market conversion", () => {
    expect(getMibanOrderWalletPaymentSummary({ walletPayments: [
      { assetCode: "ETH", amount: "0.012345678901234567" },
      { assetCode: "SOL", amount: "2.000000000000000001" },
    ] })).toBe("0.012345678901234567 ETH + 2.000000000000000001 SOL");
  });
  it("formats large CNY directly from exact decimal units", () => {
    expect(getMibanOrderWalletPaymentSummary({ walletPayments: [
      { assetCode: "CNY", amount: "9999999999999999.99" },
    ] })).toBe("¥9999999999999999.99");
  });
  it("leaves legacy orders with no side-table payment on the existing display path", () => {
    expect(getMibanOrderWalletPaymentSummary({ walletDeductUsdt: "20" })).toBeNull();
    expect(getMibanOrderWalletPaymentSummary({ walletPayments: [] })).toBeNull();
  });
  it("prioritizes actual coin snapshots in user orders, retaining screenshot/export card reuse", () => {
    const text = source("miban/MyOrders.tsx");
    expect(text).toContain("getMibanOrderWalletPaymentSummary(order)");
    expect(text).toContain("originalAssetPayment ??");
    expect(text).toContain("ref={getOrderCardRef(order.id)}");
    expect(text).toContain("walletPaymentSummary");
  });
  it.each(["miban/UnifiedAdmin.tsx", "miban/LimitedProductsPanel.tsx"])("uses native payments and actual refund quantities in %s", name => {
    const text = source(name);
    expect(text).toContain("getMibanOrderWalletPaymentSummary(order)");
    expect(text).toContain("refundAssets");
    expect(text).toMatch(/formatMibanPaymentSummary\((?:res|result)\.refundAssets\)/);
  });
  it("labels independent coin debit/refund events distinctly from freeze/unfreeze", () => {
    const text = source("Wallet.tsx");
    expect(text).toContain('case "miban_payment":');
    expect(text).toContain('label: "米伴订单扣款"');
    expect(text).toContain('case "miban_refund":');
    expect(text).toContain('label: "米伴原币退款"');
    expect(text).toContain('case "collateral_lock":');
    expect(text).toContain('case "collateral_release":');
  });
});
