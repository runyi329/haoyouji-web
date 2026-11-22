import { describe, expect, it } from "vitest";
import {
  AI_WALLET_CRYPTO_MARKET_ASSETS,
  AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS,
} from "../shared/ai-wallet-assets";
import {
  MIBAN_PAYMENT_ASSETS,
  MIBAN_PAYMENT_QUOTE_TTL_MS,
  PAYMENT_SCALE,
  buildMibanPaymentPlan,
  formatMibanPaymentSummary,
  normalizeMibanPaymentAssets,
  paymentAssetDecimals,
  paymentDecimalUnits,
  paymentUnitsText,
  splitMibanPaymentDeductions,
  validateMibanPaymentDeductions,
  type MibanPaymentAsset,
  type MibanPaymentAssetInput,
  type MibanPaymentDeduction,
  type MibanWalletPaymentQuote,
} from "../shared/miban-wallet-payment";

// Only pure shared modules are imported. All balances/prices below are unit fixtures;
// this suite does not import a router, initialize a database, or mock production code.
const SCALE = 10n ** 18n;
const CENT = 10n ** 16n;
const USDT_STEP = 10n ** 10n;
const NOW = Date.parse("2026-11-22T04:00:00.000Z");

// Independent test oracles: decimal expectations never pass through Number or
// paymentDecimalUnits/paymentUnitsText, so a shared-parser bug cannot mask itself.
function exactUnits(text: string): bigint {
  if (!/^-?\d+(?:\.\d{1,18})?$/.test(text)) throw new Error(`Invalid test decimal: ${text}`);
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const absolute = BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, "0"));
  return negative ? -absolute : absolute;
}

function exactText(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const fraction = (absolute % SCALE).toString().padStart(18, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / SCALE}${fraction ? `.${fraction}` : ""}`;
}

function nativeStep(code: string): bigint {
  return code === "CNY" ? CENT : code === "USDT" ? USDT_STEP : 1n;
}

function ceilPayment(totalUnits: bigint, priceUnits: bigint, step: bigint): bigint {
  const denominator = priceUnits * step;
  return ((totalUnits * SCALE + denominator - 1n) / denominator) * step;
}

function asset(assetCode: string, overrides: Partial<MibanPaymentAsset> = {}): MibanPaymentAsset {
  const defaultPrices: Record<string, [string, string]> = {
    CNY: ["1", "0.142857142857142857"],
    USDT: ["7", "1"],
    ETH: ["21000", "3000"],
    SOL: ["700", "100"],
    BTC: ["700000", "100000"],
  };
  const [priceCny, priceUsdt] = defaultPrices[assetCode] ?? ["1", "0.142857142857142857"];
  return {
    assetCode,
    assetName: assetCode,
    available: "10",
    frozen: "0",
    priceCny,
    priceUsdt,
    priceUpdatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function quote(assets: MibanPaymentAsset[], overrides: Partial<MibanWalletPaymentQuote> = {}): MibanWalletPaymentQuote {
  return {
    quoteToken: "unit-test-signed-quote-placeholder",
    quotedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 60_000).toISOString(),
    usdtCnyRate: "7",
    assets,
    ...overrides,
  };
}

function deduction(code: string, amount: string, priceCny = "1", priceUsdt = "0.142857142857142857"): MibanPaymentDeduction {
  return {
    assetCode: code,
    amount,
    priceCny,
    priceUsdt,
    cnyValue: exactText(exactUnits(amount) * exactUnits(priceCny) / SCALE),
  };
}

function expectBlocked(total: string, row: MibanPaymentAsset): void {
  // A malformed price may throw; either throwing or returning a non-payable empty
  // plan is fail-closed. A canPay=true result must never be swallowed by this helper.
  let plan: ReturnType<typeof buildMibanPaymentPlan> | undefined;
  try {
    plan = buildMibanPaymentPlan(total, quote([row]), [row.assetCode], undefined, NOW);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return;
  }
  expect(plan.canPay).toBe(false);
  expect(plan.deductions).toEqual([]);
  expect(plan.remainingCny).toBe(exactText(exactUnits(total)));
}

describe("miban payment decimal units: independent 18-digit BigInt oracle", () => {
  it("exports an exact 18-place scale and 60-second quote lifetime", () => {
    expect(PAYMENT_SCALE).toBe(SCALE);
    expect(MIBAN_PAYMENT_QUOTE_TTL_MS).toBe(60_000);
  });

  it.each([
    "0", "1", "0.01", "0.00000001", "0.000000000000000001",
    "0.123456789012345678", "1.000000000000000001", "-0.000000000000000001",
    "-123.450000000000000000", "9007199254740991.123456789012345678",
    "9007199254740993.999999999999999999", "999999999999999999.999999999999999999",
  ])("parses and renders %s without Number precision loss", (text) => {
    const expected = exactUnits(text);
    expect(paymentDecimalUnits(text)).toBe(expected);
    expect(paymentUnitsText(expected)).toBe(exactText(expected));
    expect(paymentDecimalUnits(paymentUnitsText(expected))).toBe(expected);
  });

  it.each([
    ["7e0", 7n * SCALE],
    ["2.1e4", 21_000n * SCALE],
    ["7E+5", 700_000n * SCALE],
    ["1e-8", USDT_STEP],
    ["1e-18", 1n],
    ["1e-19", 0n],
    ["9.999999999999999999e-1", 999_999_999_999_999_999n],
    ["1.2345678901234567899", 1_234_567_890_123_456_789n],
    ["0.0000000000000000019", 1n],
    ["-0.0000000000000000019", -1n],
    ["1e100", 10n ** 118n],
    ["1e-100", 0n],
  ] as const)("supports quote scientific notation and floors sub-18-place %s", (text, expected) => {
    expect(paymentDecimalUnits(text)).toBe(expected);
  });

  it.each(["", " ", "NaN", "Infinity", "0x10", "1,000", "1/2", "1_000", "+1", ".5", "1.", "1e101", "1e-101", "1e9007199254740992"])("rejects invalid or out-of-range quote %s", (text) => {
    expect(() => paymentDecimalUnits(text)).toThrow();
  });

  it.each([NaN, Infinity, -Infinity])("rejects non-finite numeric quote %s", (value) => {
    expect(() => paymentDecimalUnits(value)).toThrow();
  });

  it("accepts numeric scientific market quotes while preserving exact tiny units", () => {
    expect(paymentDecimalUnits(1e-8)).toBe(USDT_STEP);
    expect(paymentDecimalUnits(1e-18)).toBe(1n);
    expect(paymentDecimalUnits(" 7.00e0 ")).toBe(7n * SCALE);
  });
});

describe("miban payment asset whitelist and funding request normalization", () => {
  it("contains exactly CNY + USDT + independent-wallet crypto, without duplicates", () => {
    expect(MIBAN_PAYMENT_ASSETS).toEqual(["CNY", "USDT", ...AI_WALLET_CRYPTO_MARKET_ASSETS]);
    expect(new Set(MIBAN_PAYMENT_ASSETS).size).toBe(MIBAN_PAYMENT_ASSETS.length);
  });

  it.each(AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS)("rejects security/commodity %s even when a price fixture exists", (code) => {
    expect(MIBAN_PAYMENT_ASSETS as readonly string[]).not.toContain(code);
    expect(() => normalizeMibanPaymentAssets([{ assetCode: code, amount: "1" }])).toThrow(/不支持/);
    expect(() => buildMibanPaymentPlan("1", quote([asset(code)]), [code], undefined, NOW)).toThrow(/不支持/);
    expect(() => validateMibanPaymentDeductions("1", [{ assetCode: code, amount: "1" }], [asset(code)])).toThrow(/不支持/);
  });

  it.each(AI_WALLET_CRYPTO_MARKET_ASSETS)("allows the independent-wallet 18th decimal place for %s", (code) => {
    expect(paymentAssetDecimals(code)).toBe(18);
    expect(normalizeMibanPaymentAssets([{ assetCode: code, amount: "0.000000000000000001" }])).toEqual([
      { assetCode: code, amount: exactText(1n) },
    ]);
  });

  it("normalizes whitespace/case only on codes and removes insignificant amount zeroes", () => {
    expect(normalizeMibanPaymentAssets([
      { assetCode: " cNy ", amount: "1.230000000000000000" },
      { assetCode: " usdt ", amount: "0.123456780000000000" },
      { assetCode: " eth ", amount: "0.100000000000000000" },
    ])).toEqual([
      { assetCode: "CNY", amount: exactText(123n * CENT) },
      { assetCode: "USDT", amount: exactText(12_345_678n * USDT_STEP) },
      { assetCode: "ETH", amount: exactText(SCALE / 10n) },
    ]);
    expect(paymentAssetDecimals("CNY")).toBe(2);
    expect(paymentAssetDecimals("USDT")).toBe(8);
  });

  it.each([
    ["CNY", "0.001"], ["CNY", "1.000000000000000001"],
    ["USDT", "0.000000001"], ["USDT", "1.000000000000000001"],
    ["ETH", "0.0000000000000000001"], ["SOL", "1.1234567890123456789"],
    ["BTC", "9999999999999999999"], ["ETH", "1000000000000000000.1"],
  ])("rejects %s %s beyond native precision or 18-digit boundaries", (assetCode, amount) => {
    expect(() => normalizeMibanPaymentAssets([{ assetCode, amount }])).toThrow();
  });

  it.each([
    "", "0", "0.000000000000000000", "-1", "+1", "01", "00.1", ".1", "1.",
    " 1", "1 ", "1e0", "1E+2", "1e-18", "0x10", "0b10", "1_000", "1,000", "NaN", "Infinity", "1/2",
  ])("rejects non-native/non-positive funding request %s", (amount) => {
    expect(() => normalizeMibanPaymentAssets([{ assetCode: "ETH", amount }])).toThrow();
    expect(() => validateMibanPaymentDeductions("1", [{ assetCode: "ETH", amount }], [asset("ETH")])).toThrow();
  });

  it.each([1, 1e-18, null, undefined, {}, []].map(amount => ({ amount })))("requires funding amount to be a string: %j", ({ amount }) => {
    expect(() => normalizeMibanPaymentAssets([{ assetCode: "ETH", amount } as unknown as MibanPaymentAssetInput])).toThrow();
  });

  it.each(["NOT_A_COIN", "USD", "EUR", "", "USDC"])("rejects unknown asset %s", (assetCode) => {
    expect(() => normalizeMibanPaymentAssets([{ assetCode, amount: "1" }])).toThrow(/不支持/);
  });

  it("rejects duplicate assets after code normalization", () => {
    expect(() => normalizeMibanPaymentAssets([
      { assetCode: "ETH", amount: "1" }, { assetCode: " eth ", amount: "1" },
    ])).toThrow(/不可重复/);
    expect(() => buildMibanPaymentPlan("1", quote([asset("ETH")]), ["ETH", " eth "], undefined, NOW)).toThrow(/不可重复/);
  });

  it("rejects empty, non-array and excessively large request baskets", () => {
    expect(() => normalizeMibanPaymentAssets([])).toThrow();
    expect(() => normalizeMibanPaymentAssets(null as unknown as MibanPaymentAssetInput[])).toThrow();
    expect(() => normalizeMibanPaymentAssets(Array.from({ length: MIBAN_PAYMENT_ASSETS.length + 1 }, () => ({ assetCode: "ETH", amount: "1" })))).toThrow();
  });

  it("accepts the maximum 18-integer + 18-fraction digit crypto request without truncation", () => {
    const amount = "999999999999999999.999999999999999999";
    expect(normalizeMibanPaymentAssets([{ assetCode: "BTC", amount }])).toEqual([{ assetCode: "BTC", amount }]);
    expect(paymentDecimalUnits(amount)).toBe(10n ** 36n - 1n);
  });
});

describe("miban automatic allocation: native units, available balances and quote validity", () => {
  it.each([
    ["ETH", "21000", "3000"], ["SOL", "700", "100"], ["BTC", "700000", "100000"],
  ])("pays a CNY order using only %s with exact ceil-to-wei deduction", (code, priceCny, priceUsdt) => {
    const total = "123.45";
    const price = exactUnits(priceCny);
    const expectedAmount = ceilPayment(exactUnits(total), price, 1n);
    const expectedValue = expectedAmount * price / SCALE;
    const row = asset(code, { priceCny, priceUsdt });
    const plan = buildMibanPaymentPlan(total, quote([row]), [code], undefined, NOW);
    expect(plan).toEqual({
      deductions: [{ assetCode: code, amount: exactText(expectedAmount), priceCny, priceUsdt, cnyValue: exactText(expectedValue) }],
      paymentAssets: [{ assetCode: code, amount: exactText(expectedAmount) }],
      totalValueCny: exactText(expectedValue), remainingCny: "0", canPay: true,
    });
    expect((expectedAmount - 1n) * price / SCALE).toBeLessThan(exactUnits(total));
    expect(validateMibanPaymentDeductions(total, plan.paymentAssets, [row])).toEqual(plan.deductions);
  });

  it("uses only the user's CNY cap, then automatically fills the exact remainder with U", () => {
    const rows = [asset("CNY", { available: "500" }), asset("USDT", { available: "100" })];
    const cny = 2_023n * CENT;
    const usdt = ceilPayment(20_000n * CENT - cny, 7n * SCALE, USDT_STEP);
    const value = cny + usdt * 7n;
    const plan = buildMibanPaymentPlan("200", quote(rows), ["CNY", "USDT"], "20.23", NOW);
    expect(plan.paymentAssets).toEqual([
      { assetCode: "CNY", amount: exactText(cny) }, { assetCode: "USDT", amount: exactText(usdt) },
    ]);
    expect(plan.totalValueCny).toBe(exactText(value));
    expect(plan.remainingCny).toBe("0");
    expect(plan.canPay).toBe(true);
  });

  it("fills CNY + U + ETH + SOL + BTC in priority order with independent balances", () => {
    const rows = [
      asset("CNY", { available: "100" }), asset("USDT", { available: "3" }),
      asset("ETH", { available: "0.002" }), asset("SOL", { available: "0.01" }), asset("BTC", { available: "1" }),
    ];
    const allocations = [
      ["CNY", 2_023n * CENT, SCALE],
      ["USDT", 3n * SCALE, 7n * SCALE],
      ["ETH", 2n * 10n ** 15n, 21_000n * SCALE],
      ["SOL", SCALE / 100n, 700n * SCALE],
    ] as const;
    const usedValue = allocations.reduce((sum, [, amount, price]) => sum + amount * price / SCALE, 0n);
    const btc = ceilPayment(200n * SCALE - usedValue, 700_000n * SCALE, 1n);
    const expectedInputs: MibanPaymentAssetInput[] = allocations.map(([assetCode, amount]) => ({ assetCode, amount: exactText(amount) }));
    expectedInputs.push({ assetCode: "BTC", amount: exactText(btc) });
    const before = JSON.stringify(rows);
    const plan = buildMibanPaymentPlan("200", quote(rows), ["CNY", "USDT", "ETH", "SOL", "BTC"], "20.23", NOW);
    expect(plan.paymentAssets).toEqual(expectedInputs);
    expect(plan.totalValueCny).toBe(exactText(usedValue + btc * 700_000n));
    expect(plan.canPay).toBe(true);
    expect(plan.remainingCny).toBe("0");
    expect(JSON.stringify(rows)).toBe(before);
    expect(validateMibanPaymentDeductions("200", plan.paymentAssets, rows)).toEqual(plan.deductions);
  });

  it("leaves an exact unpaid remainder when all native balances are exhausted", () => {
    const rows = [asset("CNY", { available: "0.01" }), asset("USDT", { available: "0.00000001" }), asset("ETH", { available: "0.000000000000000001" })];
    const covered = CENT + USDT_STEP * 7n + 21_000n;
    const plan = buildMibanPaymentPlan("1", quote(rows), ["CNY", "USDT", "ETH"], undefined, NOW);
    expect(plan.totalValueCny).toBe(exactText(covered));
    expect(plan.remainingCny).toBe(exactText(SCALE - covered));
    expect(plan.canPay).toBe(false);
    expect(plan.paymentAssets).toHaveLength(3);
  });

  it.each(["CNY", "USDT", "ETH", "SOL", "BTC"])("uses %s available directly and never subtracts frozen a second time", (code) => {
    const row = asset(code, { available: "1", frozen: "1000" });
    const plan = buildMibanPaymentPlan(row.priceCny!, quote([row]), [code], undefined, NOW);
    expect(plan.canPay).toBe(true);
    expect(plan.paymentAssets).toEqual([{ assetCode: code, amount: "1" }]);
  });

  it.each(["CNY", "USDT", "ETH", "SOL", "BTC"])("does not spend fully frozen %s whose available balance is zero", (code) => {
    expectBlocked("1", asset(code, { available: "0", frozen: "1000" }));
  });

  it("does not use assets omitted from payment priority and allows zero CNY cap", () => {
    const rows = [asset("CNY", { available: "1000" }), asset("ETH", { available: "1" })];
    const onlyEth = buildMibanPaymentPlan("21", quote(rows), ["ETH"], undefined, NOW);
    const zeroCny = buildMibanPaymentPlan("21", quote(rows), ["CNY", "ETH"], "0", NOW);
    expect(onlyEth.paymentAssets).toEqual([{ assetCode: "ETH", amount: exactText(SCALE / 1_000n) }]);
    expect(zeroCny.paymentAssets).toEqual(onlyEth.paymentAssets);
  });

  it.each([
    ["CNY", "1.239", 123n * CENT],
    ["USDT", "0.000000019", USDT_STEP],
    ["ETH", "0.000000000000000001", 1n],
  ] as const)("never allocates beyond %s available native-unit floor", (code, available, expectedAmount) => {
    const row = asset(code, { available, priceCny: "1", priceUsdt: "1" });
    const plan = buildMibanPaymentPlan("2", quote([row]), [code], undefined, NOW);
    expect(plan.paymentAssets).toEqual([{ assetCode: code, amount: exactText(expectedAmount) }]);
    expect(plan.remainingCny).toBe(exactText(2n * SCALE - expectedAmount));
    expect(plan.canPay).toBe(false);
  });

  it.each([
    { priceCny: null }, { priceUsdt: null }, { priceCny: "0" }, { priceCny: "-1" },
    { priceCny: "NaN" }, { unavailableReason: "行情记录已失效" }, { unavailableReason: "行情超时" },
  ] satisfies Partial<MibanPaymentAsset>[])("blocks absent, nonpositive or invalidated server row %j", (overrides) => {
    expectBlocked("1", asset("ETH", overrides));
  });

  // Regression checks: priceUsdt is also part of the signed snapshot; a row with
  // an invalid USDT quote must not produce a plan that server validation rejects.
  it.each(["0", "-1", "NaN", "not-a-price"])("blocks an unusable priceUsdt snapshot %s during allocation", (priceUsdt) => {
    expectBlocked("1", asset("ETH", { priceUsdt }));
  });

  it("skips an invalidated crypto row and fills using the next valid asset", () => {
    const rows = [asset("ETH", { unavailableReason: "失效price row" }), asset("SOL")];
    const amount = ceilPayment(SCALE, 700n * SCALE, 1n);
    const plan = buildMibanPaymentPlan("1", quote(rows), ["ETH", "SOL"], undefined, NOW);
    expect(plan.paymentAssets).toEqual([{ assetCode: "SOL", amount: exactText(amount) }]);
    expect(plan.canPay).toBe(true);
  });

  it("cannot pay from a selected asset missing from the server quote", () => {
    const plan = buildMibanPaymentPlan("1", quote([]), ["ETH"], undefined, NOW);
    expect(plan.paymentAssets).toEqual([]);
    expect(plan.canPay).toBe(false);
    expect(plan.remainingCny).toBe("1");
  });

  it.each([
    [0, true], [59_999, true], [60_000, false], [60_001, false],
  ] as const)("applies the 60-second expiry boundary at offset %s ms", (offset, canPay) => {
    const plan = buildMibanPaymentPlan("1", quote([asset("CNY")]), ["CNY"], undefined, NOW + offset);
    expect(plan.canPay).toBe(canPay);
    expect(plan.paymentAssets).toEqual(canPay ? [{ assetCode: "CNY", amount: "1" }] : []);
    expect(plan.remainingCny).toBe(canPay ? "0" : "1");
  });

  it.each(["", "not-a-date", new Date(NOW - 1).toISOString()])("fails closed for invalid or expired expiresAt %s", (expiresAt) => {
    const plan = buildMibanPaymentPlan("1", quote([asset("ETH")], { expiresAt }), ["ETH"], undefined, NOW);
    expect(plan.canPay).toBe(false);
    expect(plan.paymentAssets).toEqual([]);
  });

  it.each(["0", "-1"])("blocks nonpositive USDT/CNY conversion rate %s", (usdtCnyRate) => {
    const plan = buildMibanPaymentPlan("1", quote([asset("CNY")], { usdtCnyRate }), ["CNY"], undefined, NOW);
    expect(plan.canPay).toBe(false);
    expect(plan.paymentAssets).toEqual([]);
  });

  it("accepts scientific market price strings, but the resulting request stays plain decimal", () => {
    const row = asset("ETH", { priceCny: "2.1e4", priceUsdt: "3e3" });
    const expected = ceilPayment(123n * CENT, 21_000n * SCALE, 1n);
    const plan = buildMibanPaymentPlan("1.23", quote([row], { usdtCnyRate: "7e0" }), ["ETH"], undefined, NOW);
    expect(plan.paymentAssets).toEqual([{ assetCode: "ETH", amount: exactText(expected) }]);
    expect(plan.deductions[0].priceCny).toBe("2.1e4");
    expect(plan.deductions[0].priceUsdt).toBe("3e3");
    expect(validateMibanPaymentDeductions("1.23", plan.paymentAssets, [row])).toEqual(plan.deductions);
    expect(() => normalizeMibanPaymentAssets([{ assetCode: "ETH", amount: "1e-18" }])).toThrow();
  });

  it("keeps quantities beyond Number safe integer boundary intact in allocation and validation", () => {
    const amount = "9007199254740993.123456789012345678";
    const row = asset("ETH", { available: amount, priceCny: "1", priceUsdt: "1" });
    const plan = buildMibanPaymentPlan(amount, quote([row]), ["ETH"], undefined, NOW);
    expect(plan.paymentAssets).toEqual([{ assetCode: "ETH", amount }]);
    expect(plan.totalValueCny).toBe(amount);
    expect(plan.canPay).toBe(true);
    expect(validateMibanPaymentDeductions(amount, plan.paymentAssets, [row])[0].amount).toBe(amount);
  });

  it("floors sub-18-digit market price instead of crediting a rounded-up wei", () => {
    const row = asset("ETH", { available: "1", priceCny: "1.0000000000000000009", priceUsdt: "1.0000000000000000009" });
    const plan = buildMibanPaymentPlan("1.000000000000000001", quote([row]), ["ETH"], undefined, NOW);
    expect(plan.paymentAssets).toEqual([{ assetCode: "ETH", amount: "1" }]);
    expect(plan.totalValueCny).toBe("1");
    expect(plan.remainingCny).toBe(exactText(1n));
    expect(plan.canPay).toBe(false);
    expect(() => validateMibanPaymentDeductions("1.000000000000000001", plan.paymentAssets, [row])).toThrow(/不足/);
  });

  it("refuses ceil rounding when a single native quantum overpays by more than one cent", () => {
    const row = asset("USDT", { priceCny: "2000000", priceUsdt: "1" });
    const amount = ceilPayment(1n, 2_000_000n * SCALE, USDT_STEP);
    const plan = buildMibanPaymentPlan("0.000000000000000001", quote([row]), ["USDT"], undefined, NOW);
    expect(amount).toBe(USDT_STEP);
    expect(plan.paymentAssets).toEqual([{ assetCode: "USDT", amount: exactText(amount) }]);
    expect(plan.totalValueCny).toBe(exactText(2n * CENT));
    expect(plan.canPay).toBe(false);
    expect(() => validateMibanPaymentDeductions("0.000000000000000001", plan.paymentAssets, [row])).toThrow(/超过应付/);
  });

  it("does not mark a zero-value order payable and rejects negative totals", () => {
    expect(buildMibanPaymentPlan("0", quote([asset("CNY")]), ["CNY"], undefined, NOW).canPay).toBe(false);
    expect(() => buildMibanPaymentPlan("-0.01", quote([asset("CNY")]), ["CNY"], undefined, NOW)).toThrow(/不可为负/);
  });
});

describe("miban server deduction validation: never trust client prices or values", () => {
  it("discards forged client priceCny/priceUsdt/cnyValue and uses serverPrices only", () => {
    const clientInput = {
      assetCode: "ETH", amount: "0.01", priceCny: "999999999999999999", priceUsdt: "999999999999999999", cnyValue: "999999999999999999",
    };
    const row = asset("ETH");
    expect(validateMibanPaymentDeductions("210", [clientInput], [row])).toEqual([
      { assetCode: "ETH", amount: "0.01", priceCny: "21000", priceUsdt: "3000", cnyValue: exactText(21_000n * SCALE / 100n) },
    ]);
    expect(() => validateMibanPaymentDeductions("211", [clientInput], [row])).toThrow(/不足/);
    expect(clientInput.priceCny).toBe("999999999999999999");
  });

  it("cannot use embedded client prices if serverPrices has no matching coin", () => {
    const client = { assetCode: "ETH", amount: "1", priceCny: "21000", priceUsdt: "3000", cnyValue: "21000" };
    expect(() => validateMibanPaymentDeductions("21000", [client], [])).toThrow(/行情暂不可用/);
    expect(() => validateMibanPaymentDeductions("21000", [client], [asset("SOL")])).toThrow(/行情暂不可用/);
  });

  it.each([
    { priceCny: null }, { priceUsdt: null }, { priceCny: "0" }, { priceCny: "-1" },
    { priceUsdt: "0" }, { priceUsdt: "-1" }, { priceCny: "NaN" }, { priceUsdt: "NaN" },
  ] satisfies Partial<MibanPaymentAsset>[])("rejects invalid signed server snapshot %j", (overrides) => {
    expect(() => validateMibanPaymentDeductions("1", [{ assetCode: "ETH", amount: "1" }], [asset("ETH", overrides)])).toThrow();
  });

  it.each([
    ["ETH", "21000", "0.01"], ["SOL", "700", "0.01"], ["BTC", "700000", "0.01"],
  ])("rejects %s payment one wei below the required quantity", (code, priceCny, required) => {
    const requiredUnits = exactUnits(required);
    const totalUnits = requiredUnits * exactUnits(priceCny) / SCALE;
    const row = asset(code);
    const amount = exactText(requiredUnits - 1n);
    expect(() => validateMibanPaymentDeductions(exactText(totalUnits), [{ assetCode: code, amount }], [row])).toThrow(/不足/);
    expect(validateMibanPaymentDeductions(exactText(totalUnits), [{ assetCode: code, amount: required }], [row])[0].cnyValue).toBe(exactText(totalUnits));
  });

  it("rejects an aggregate CNY value short by exactly one 18-place unit", () => {
    const row = asset("ETH", { priceCny: "1", priceUsdt: "1" });
    expect(() => validateMibanPaymentDeductions("1", [{ assetCode: "ETH", amount: exactText(SCALE - 1n) }], [row])).toThrow(/不足/);
  });

  it.each([0n, CENT - 1n, CENT])("accepts overpayment only through the exact inclusive one-cent boundary (%s units)", (excess) => {
    const amount = exactText(SCALE + excess);
    const row = asset("ETH", { priceCny: "1", priceUsdt: "1" });
    expect(validateMibanPaymentDeductions("1", [{ assetCode: "ETH", amount }], [row])[0].cnyValue).toBe(amount);
  });

  it.each([CENT + 1n, 2n * CENT])("rejects overpayment above one cent (%s units)", (excess) => {
    const row = asset("ETH", { priceCny: "1", priceUsdt: "1" });
    expect(() => validateMibanPaymentDeductions("1", [{ assetCode: "ETH", amount: exactText(SCALE + excess) }], [row])).toThrow(/超过应付/);
  });

  it("checks the combined basket, not the per-asset overpayment allowance", () => {
    const inputs = [{ assetCode: "ETH", amount: "0.506" }, { assetCode: "SOL", amount: "0.506" }];
    const prices = [asset("ETH", { priceCny: "1", priceUsdt: "1" }), asset("SOL", { priceCny: "1", priceUsdt: "1" })];
    expect(() => validateMibanPaymentDeductions("1", inputs, prices)).toThrow(/超过应付/);
  });

  it("floors each asset valuation independently before summing, never rounding fractions upward", () => {
    const inputs = [{ assetCode: "ETH", amount: "0.5" }, { assetCode: "SOL", amount: "0.5" }];
    const priceCny = "1.000000000000000001";
    const prices = [asset("ETH", { priceCny, priceUsdt: "1" }), asset("SOL", { priceCny, priceUsdt: "1" })];
    const oneValue = (SCALE / 2n) * (SCALE + 1n) / SCALE;
    const result = validateMibanPaymentDeductions(exactText(2n * oneValue), inputs, prices);
    expect(result.map(row => row.cnyValue)).toEqual([exactText(oneValue), exactText(oneValue)]);
    expect(() => validateMibanPaymentDeductions(exactText(2n * oneValue + 1n), inputs, prices)).toThrow(/不足/);
  });

  it("rejects price/quantity products below the 18-place settlement floor", () => {
    const row = asset("ETH", { priceCny: "0.5", priceUsdt: "0.1" });
    expect(() => validateMibanPaymentDeductions("0.000000000000000001", [{ assetCode: "ETH", amount: exactText(1n) }], [row])).toThrow(/有效结算精度/);
  });

  it.each(["0", "-1"])("rejects a nonpositive order total %s", (total) => {
    expect(() => validateMibanPaymentDeductions(total, [{ assetCode: "CNY", amount: "1" }], [asset("CNY")])).toThrow(/必须大于零/);
  });
});

describe("miban subscription split: 3/6/12 periods retain every native unit and signed snapshot", () => {
  it.each([3, 6, 12])("preserves exact per-asset sums and native precision across %s periods", (periods) => {
    const deductions = [
      deduction("CNY", "100.01", "1", "0.142857142857142857"),
      deduction("USDT", "1.00000001", "7", "1"),
      deduction("ETH", "1.123456789012345678", "21000.123456789012345678", "3000.000000000000000001"),
      deduction("SOL", "4.000000000000000001", "700", "100"),
      deduction("BTC", "0.123456789012345679", "700000", "100000"),
    ];
    const before = JSON.stringify(deductions);
    deductions.forEach(Object.freeze);
    Object.freeze(deductions);
    const split = splitMibanPaymentDeductions(deductions, periods);
    expect(split).toHaveLength(periods);
    for (const original of deductions) {
      const originalUnits = exactUnits(original.amount);
      const step = nativeStep(original.assetCode);
      const base = originalUnits / step / BigInt(periods) * step;
      let sum = 0n;
      let cnySum = 0n;
      for (let index = 0; index < periods; index++) {
        const row = split[index].find(item => item.assetCode === original.assetCode);
        const expected = index === periods - 1 ? originalUnits - base * BigInt(periods - 1) : base;
        expect(row).toBeDefined();
        expect(row!.amount).toBe(exactText(expected));
        expect(exactUnits(row!.amount) % step).toBe(0n);
        expect(exactUnits(row!.amount)).toBeGreaterThan(0n);
        expect(row!.priceCny).toBe(original.priceCny);
        expect(row!.priceUsdt).toBe(original.priceUsdt);
        expect(row!.cnyValue).toBe(exactText(expected * exactUnits(original.priceCny) / SCALE));
        sum += exactUnits(row!.amount);
        cnySum += exactUnits(row!.cnyValue);
      }
      expect(sum).toBe(originalUnits);
      const originalValue = originalUnits * exactUnits(original.priceCny) / SCALE;
      expect(cnySum).toBeLessThanOrEqual(originalValue);
      expect(originalValue - cnySum).toBeLessThan(BigInt(periods));
    }
    expect(JSON.stringify(deductions)).toBe(before);
  });

  it.each([3, 6, 12])("puts sub-period native dust only in the final of %s periods, never negative", (periods) => {
    const deductions = [deduction("CNY", exactText(CENT)), deduction("USDT", exactText(USDT_STEP)), deduction("ETH", exactText(1n)), deduction("SOL", exactText(2n))];
    const split = splitMibanPaymentDeductions(deductions, periods);
    expect(split.slice(0, periods - 1)).toEqual(Array.from({ length: periods - 1 }, () => []));
    expect(split[periods - 1]).toEqual(deductions);
    expect(split.flat().every(row => exactUnits(row.amount) > 0n)).toBe(true);
  });

  it("splits a huge precise crypto amount without Number conversion", () => {
    const amount = "9007199254740993.123456789012345678";
    const original = deduction("ETH", amount, "1", "1");
    const split = splitMibanPaymentDeductions([original], 12);
    const base = exactUnits(amount) / 12n;
    expect(split.slice(0, 11).every(rows => rows[0].amount === exactText(base))).toBe(true);
    expect(split[11][0].amount).toBe(exactText(exactUnits(amount) - base * 11n));
    expect(split.flat().reduce((sum, row) => sum + exactUnits(row.amount), 0n)).toBe(exactUnits(amount));
  });

  it("preserves scientific snapshot text verbatim during subscription splitting", () => {
    const original: MibanPaymentDeduction = { assetCode: "ETH", amount: "1", priceCny: "2.1e4", priceUsdt: "3e3", cnyValue: "21000" };
    const split = splitMibanPaymentDeductions([original], 3);
    for (const row of split.flat()) {
      expect(row.priceCny).toBe("2.1e4");
      expect(row.priceUsdt).toBe("3e3");
      expect(row.cnyValue).toBe(exactText(exactUnits(row.amount) * 21_000n));
    }
    expect(split.flat().reduce((sum, row) => sum + exactUnits(row.amount), 0n)).toBe(SCALE);
  });

  it("supports one period and an empty basket without fabricating zero or negative rows", () => {
    const original = deduction("ETH", "0.000000000000000001");
    expect(splitMibanPaymentDeductions([original], 1)).toEqual([[original]]);
    expect(splitMibanPaymentDeductions([], 12)).toEqual(Array.from({ length: 12 }, () => []));
  });

  it.each([0, -1, 13, 1.5, NaN, Infinity])("rejects invalid subscription period count %s", (periods) => {
    expect(() => splitMibanPaymentDeductions([deduction("ETH", "1")], periods)).toThrow(/期数无效/);
  });
});

describe("miban human payment summary: native amounts stay in complete decimal text", () => {
  it("labels CNY, U and independent crypto in payment order", () => {
    expect(formatMibanPaymentSummary([
      { assetCode: "CNY", amount: "1.2" }, { assetCode: "USDT", amount: "0.00000001" },
      { assetCode: "ETH", amount: "0.000000000000000001" }, { assetCode: "SOL", amount: "0.123456789012345678" },
      { assetCode: "BTC", amount: "9007199254740993.123456789012345678" },
    ])).toBe("¥1.20 + <0.01 U + 0.000000000000000001 ETH + 0.123456789012345678 SOL + 9007199254740993.123456789012345678 BTC");
    expect(formatMibanPaymentSummary([])).toBe("");
  });

  it.each(["9007199254740991.01", "9007199254740993.12", "999999999999999999.99"])("does not lose digits while formatting a large CNY amount %s", (amount) => {
    const cents = exactUnits(amount) / CENT;
    const expected = `¥${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
    expect(formatMibanPaymentSummary([{ assetCode: "CNY", amount }])).toBe(expected);
  });
});
