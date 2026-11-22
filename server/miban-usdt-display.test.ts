import { describe, expect, it } from "vitest";
import { AI_WALLET_CRYPTO_MARKET_ASSETS } from "../shared/ai-wallet-assets";
import {
  buildMibanPaymentPlan,
  formatMibanPaymentSummary,
  formatMibanUsdtAmount,
  getMibanOrderWalletPaymentSummary,
  normalizeMibanPaymentAssets,
  paymentAssetDecimals,
  splitMibanPaymentDeductions,
  validateMibanPaymentDeductions,
  type MibanWalletPaymentQuote,
} from "../shared/miban-wallet-payment";

// Pure shared-module fixtures only: no router imports, database, or live wallet calls.
describe("miban USDT display: two decimals without changing real native amounts", () => {
  it.each([
    ["594.9506102699997", "594.95"],
    [594.9506102699997, "594.95"],
    ["68.35147046", "68.35"],
    ["34.17573523", "34.18"],
    ["1", "1.00"],
    [1, "1.00"],
    ["0", "0.00"],
    [0, "0.00"],
    [-0, "0.00"],
    ["-0.00000000", "0.00"],
    [null, "--"],
    ["1.004999999999999999999", "1.00"],
    ["1.005", "1.01"],
    ["9.99999999", "10.00"],
    ["-34.17573523", "-34.18"],
    ["-1.005", "-1.01"],
    ["0.005", "0.01"],
    ["-0.005", "-0.01"],
    [" 1.00 ", "1.00"],
  ] as const)("formats %s as %s", (value, expected) => {
    expect(formatMibanUsdtAmount(value)).toBe(expected);
  });

  it.each([
    ["9007199254740993.12345678", "9007199254740993.12"],
    ["999999999999999999.99999999", "1000000000000000000.00"],
    ["123456789012345678901234567890.17573523", "123456789012345678901234567890.18"],
    ["-999999999999999999.99999999", "-1000000000000000000.00"],
    ["1e100", `1${"0".repeat(100)}.00`],
  ] as const)("does not lose large decimal digits for %s", (value, expected) => {
    expect(formatMibanUsdtAmount(value)).toBe(expected);
  });

  it.each([
    ["0.00000001", "<0.01"],
    ["0.004999999999999999999", "<0.01"],
    [1e-8, "<0.01"],
    ["1e-100", "<0.01"],
    ["0.00000000000000000000000000000000000001", "<0.01"],
    ["-0.00000001", "-<0.01"],
    [-1e-8, "-<0.01"],
    ["-1e-100", "-<0.01"],
  ] as const)("never presents nonzero %s as an actual zero deduction", (value, expected) => {
    expect(formatMibanUsdtAmount(value)).toBe(expected);
    expect(formatMibanUsdtAmount(value)).not.toBe("0.00");
    expect(formatMibanUsdtAmount(value)).not.toBe("-0.00");
  });

  it.each(["NaN", "Infinity", "", "1e101", NaN, Infinity, -Infinity])("rejects invalid amount %s instead of fabricating zero", (value) => {
    expect(() => formatMibanUsdtAmount(value)).toThrow();
  });

  it("formats payment/confirmation/order snapshots without mutating eight-place USDT inputs", () => {
    const inputs = [{ assetCode: "USDT", amount: "68.35147046" }];
    const before = JSON.stringify(inputs);
    expect(formatMibanPaymentSummary(inputs)).toBe("68.35 U");
    expect(getMibanOrderWalletPaymentSummary({ walletPayments: inputs })).toBe("68.35 U");
    expect(normalizeMibanPaymentAssets(inputs)).toEqual(inputs);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(paymentAssetDecimals("USDT")).toBe(8);
  });

  it("keeps the plan, funding request, settlement and split at original eight-place quantities", () => {
    const now = Date.parse("2026-11-22T04:00:00.000Z");
    const quote: MibanWalletPaymentQuote = {
      quoteToken: "pure-unit-fixture",
      quotedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
      usdtCnyRate: "1",
      assets: [{
        assetCode: "USDT", assetName: "USDT", available: "594.9506102699997",
        frozen: "0", priceCny: "1", priceUsdt: "1", priceUpdatedAt: new Date(now).toISOString(),
      }],
    };
    const quoteBefore = JSON.stringify(quote);
    const plan = buildMibanPaymentPlan("68.35147046", quote, ["USDT"], undefined, now);
    const before = JSON.stringify(plan);
    expect(plan.canPay).toBe(true);
    expect(plan.paymentAssets).toEqual([{ assetCode: "USDT", amount: "68.35147046" }]);
    expect(plan.deductions[0].amount).toBe("68.35147046");
    expect(plan.totalValueCny).toBe("68.35147046");
    expect(formatMibanPaymentSummary(plan.deductions)).toBe("68.35 U");
    expect(formatMibanPaymentSummary(plan.paymentAssets)).toBe("68.35 U");
    expect(validateMibanPaymentDeductions("68.35147046", plan.paymentAssets, quote.assets)).toEqual(plan.deductions);
    const split = splitMibanPaymentDeductions(plan.deductions, 2);
    expect(split.map(rows => rows[0].amount)).toEqual(["34.17573523", "34.17573523"]);
    expect(split.map(formatMibanPaymentSummary)).toEqual(["34.18 U", "34.18 U"]);
    expect(JSON.stringify(plan)).toBe(before);
    expect(JSON.stringify(quote)).toBe(quoteBefore);
  });

  it("preserves existing CNY formatting and USDT nonzero dust in summaries and order records", () => {
    const inputs = [
      { assetCode: "CNY", amount: "1.2" },
      { assetCode: "USDT", amount: "0.00000001" },
      { assetCode: "ETH", amount: "0.000000000000000001" },
    ];
    expect(formatMibanPaymentSummary(inputs)).toBe("¥1.20 + <0.01 U + 0.000000000000000001 ETH");
    expect(getMibanOrderWalletPaymentSummary({ walletPayments: inputs })).toBe("¥1.20 + <0.01 U + 0.000000000000000001 ETH");
    expect(formatMibanPaymentSummary([{ assetCode: "CNY", amount: "1.005" }])).toBe("¥1.01");
  });

  it.each(AI_WALLET_CRYPTO_MARKET_ASSETS)("keeps %s micro-amount display verbatim at 18 places", (assetCode) => {
    const amount = "0.000000000000000001";
    const inputs = [{ assetCode, amount }];
    expect(paymentAssetDecimals(assetCode)).toBe(18);
    expect(formatMibanPaymentSummary(inputs)).toBe(`${amount} ${assetCode}`);
    expect(getMibanOrderWalletPaymentSummary({ walletPayments: inputs })).toBe(`${amount} ${assetCode}`);
    expect(normalizeMibanPaymentAssets(inputs)).toEqual(inputs);
  });
});
