import { describe, expect, it } from "vitest";
import { groupMibanCartItems, splitMibanPaymentDeductionsByTotals } from "../shared/miban-cart-checkout";
import type { MibanPaymentDeduction } from "../shared/miban-wallet-payment";

// Pure shared imports only: no router/service/DB, real wallets or quote signing.
// Independent decimal + largest-remainder oracle: never use production parsers,
// price conversion helpers, floating arithmetic or a production split as expected.
const SCALE = 10n ** 18n;
const CENT = 10n ** 16n;
const abs = (value: bigint) => value < 0n ? -value : value;
function units(text: string): bigint {
  if (!/^-?\d+(?:\.\d{1,18})?$/.test(text)) throw new Error(`Bad oracle decimal: ${text}`);
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const value = BigInt(whole) * SCALE + BigInt(fraction.padEnd(18, "0"));
  return negative ? -value : value;
}
function text(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const fraction = (absolute % SCALE).toString().padStart(18, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / SCALE}${fraction ? `.${fraction}` : ""}`;
}
function step(code: string): bigint { return code === "CNY" ? CENT : code === "USDT" ? 10n ** 10n : 1n; }
function deduction(assetCode: string, amount: string, priceCny = "1", priceUsdt = "1"): MibanPaymentDeduction {
  return { assetCode, amount, priceCny, priceUsdt, cnyValue: text(units(amount) * units(priceCny) / SCALE) };
}
function ceilAmount(target: bigint, price: bigint, quantum: bigint): string {
  const denominator = price * quantum;
  return text((target * SCALE + denominator - 1n) / denominator * quantum);
}
function oracleShares(amount: string, assetCode: string, totals: string[]): string[] {
  const atoms = units(amount) / step(assetCode);
  const targets = totals.map(units);
  const sum = targets.reduce((value, target) => value + target, 0n);
  const count = targets.map(target => atoms * target / sum);
  const ranks = targets.map((target, index) => ({ index, remainder: atoms * target % sum }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  let left = atoms - count.reduce((value, share) => value + share, 0n);
  for (const rank of ranks) {
    if (left <= 0n) break;
    count[rank.index]++;
    left--;
  }
  return count.map(value => text(value * step(assetCode)));
}
function verify(original: MibanPaymentDeduction[], totals: string[], result: MibanPaymentDeduction[][]) {
  expect(result).toHaveLength(totals.length);
  const merchandise = totals.reduce((sum, total) => sum + units(total), 0n);
  const originalValue = original.reduce((sum, row) => sum + units(row.cnyValue), 0n);
  expect(originalValue).toBeGreaterThanOrEqual(merchandise);
  expect(originalValue - merchandise).toBeLessThanOrEqual(CENT);
  const refundTotals = new Map<string, bigint>();
  for (let i = 0; i < result.length; i++) {
    let groupValue = 0n;
    let exactNumerator = 0n;
    const seen = new Set<string>();
    const ordered = result[i].map(row => original.findIndex(item => item.assetCode === row.assetCode));
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
    for (const row of result[i]) {
      const source = original.find(item => item.assetCode === row.assetCode)!;
      expect(source).toBeDefined();
      expect(seen.has(row.assetCode)).toBe(false);
      seen.add(row.assetCode);
      expect(row.priceCny).toBe(source.priceCny);
      expect(row.priceUsdt).toBe(source.priceUsdt);
      expect(units(row.amount)).toBeGreaterThan(0n);
      expect(units(row.amount) % step(row.assetCode)).toBe(0n);
      const expectedValue = units(row.amount) * units(row.priceCny) / SCALE;
      expect(units(row.cnyValue)).toBe(expectedValue);
      groupValue += expectedValue;
      exactNumerator += units(row.amount) * units(row.priceCny);
      // A cancellation refunds ONLY its snapshot amount, never a repriced U proxy.
      refundTotals.set(row.assetCode, (refundTotals.get(row.assetCode) ?? 0n) + units(row.amount));
    }
    expect(abs(groupValue - units(totals[i]))).toBeLessThan(CENT);
    expect(abs(exactNumerator - units(totals[i]) * SCALE)).toBeLessThan(CENT * SCALE);
  }
  for (const row of original) expect(refundTotals.get(row.assetCode)).toBe(units(row.amount));
  expect([...refundTotals.keys()].sort()).toEqual(original.map(row => row.assetCode).sort());
}
function expectWeighted(original: MibanPaymentDeduction[], totals: string[], result: MibanPaymentDeduction[][]) {
  for (const source of original) {
    const shares = oracleShares(source.amount, source.assetCode, totals);
    expect(result.map(rows => rows.find(row => row.assetCode === source.assetCode)?.amount ?? "0")).toEqual(shares);
  }
}
const cartRow = (checkoutGroupKey = "a", groupLabel = "甲", priceCny = 0.1, quantity = 1) =>
  ({ checkoutGroupKey, groupLabel, priceCny, quantity, productId: `${checkoutGroupKey}-${quantity}` });

describe("groupMibanCartItems: exact cents and storage boundary", () => {
  it("preserves first group appearance, row reference/order, quantities and unequal totals", () => {
    const items = [cartRow("b", "乙", 0.1, 3), cartRow("a", "甲", 228, 2), cartRow("b", "乙", 0.2, 2)];
    const groups = groupMibanCartItems(items);
    expect(groups).toEqual([
      { checkoutGroupKey: "b", groupLabel: "乙", items: [items[0], items[2]], totalCny: 0.7, itemCount: 5 },
      { checkoutGroupKey: "a", groupLabel: "甲", items: [items[1]], totalCny: 456, itemCount: 2 },
    ]);
    expect(groups[0].items[0]).toBe(items[0]);
    expect(groups[0].items[1]).toBe(items[2]);
    expect(items.map(row => row.checkoutGroupKey)).toEqual(["b", "a", "b"]);
  });
  it("computes 0.10 × 3 as exactly 0.30 instead of binary floating subtotal", () => {
    expect(groupMibanCartItems([cartRow("a", "甲", 0.1, 3)])[0].totalCny).toBe(0.3);
    expect(groupMibanCartItems([cartRow("a", "甲", 1e-2, 7)])[0].totalCny).toBe(0.07);
  });
  it("returns empty groups for an empty UI cart", () => expect(groupMibanCartItems([])).toEqual([]));
  it("uses Map safely for prototype-like valid keys", () => {
    expect(groupMibanCartItems([cartRow("__proto__", "原型"), cartRow("constructor", "构造")])
      .map(row => row.checkoutGroupKey)).toEqual(["__proto__", "constructor"]);
  });
  it.each([undefined, null, "", " ", " a", "a ", 12, "a\u0000b"])("rejects malformed legacy group key %s, never coalesces it", key => {
    const row = { ...cartRow(), checkoutGroupKey: key };
    expect(() => groupMibanCartItems([row, row] as any)).toThrow(/分组/);
  });
  it("rejects a legacy row missing its key even next to a current row", () => {
    const { checkoutGroupKey: _key, ...legacy } = cartRow();
    expect(() => groupMibanCartItems([cartRow(), legacy] as any)).toThrow(/分组/);
  });
  it.each([undefined, null, "", " ", 3])("rejects invalid group label %s", label => {
    expect(() => groupMibanCartItems([{ ...cartRow(), groupLabel: label }] as any)).toThrow(/名称/);
  });
  it("rejects conflicting labels for the same key", () => {
    expect(() => groupMibanCartItems([cartRow(), cartRow("a", "乙")])).toThrow(/不一致/);
  });
  it.each([0, -1, 0.001, 0.30000000000000004, NaN, Infinity, "0.10", undefined])("rejects invalid/native-subcent price %s", price => {
    expect(() => groupMibanCartItems([{ ...cartRow(), priceCny: price }] as any)).toThrow();
  });
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "2", undefined])("rejects invalid quantity %s", quantity => {
    expect(() => groupMibanCartItems([{ ...cartRow(), quantity }] as any)).toThrow();
  });
  it("rejects safe-count/safe-cent overflow and a total that cannot roundtrip the mandated number boundary", () => {
    expect(() => groupMibanCartItems([cartRow("a", "甲", 1, Number.MAX_SAFE_INTEGER)])).toThrow(/安全范围/);
    expect(() => groupMibanCartItems([cartRow("a", "甲", 0.01, Number.MAX_SAFE_INTEGER), cartRow()])).toThrow(/安全范围/);
    expect(() => groupMibanCartItems([cartRow("a", "甲", 0.01, Number.MAX_SAFE_INTEGER)])).toThrow(/安全范围/);
  });
  it.each([null, undefined, {}])("rejects non-array input %s", items => {
    expect(() => groupMibanCartItems(items as any)).toThrow();
  });
});

describe("splitMibanPaymentDeductionsByTotals: independent weighted native oracle", () => {
  it("preserves an unequal pure CNY split, not equal period splitting", () => {
    const original = [deduction("CNY", "287")];
    const totals = ["228", "59"];
    const result = splitMibanPaymentDeductionsByTotals(original, totals);
    expect(result.map(rows => rows[0].amount)).toEqual(["228", "59"]);
    verify(original, totals, result);
  });
  it.each([["228", "59"], ["228", "59", "13"], ["0.01", "0.02", "0.04"], ["59", "228"]])(
    "accepts one-ceil pure USDT payment for ordinary unequal group totals %j", (...totals) => {
      const sum = totals.reduce((value, target) => value + units(target), 0n);
      const original = [deduction("USDT", ceilAmount(sum, units("7"), step("USDT")), "7", "1")];
      const result = splitMibanPaymentDeductionsByTotals(original, totals);
      verify(original, totals, result);
      expectWeighted(original, totals, result);
      expect(result.flat().every(row => row.assetCode === "USDT")).toBe(true);
    },
  );
  it("explicitly permits honest sub-cent under-allocation instead of adding an extra U atom", () => {
    const original = [deduction("USDT", "41", "7", "1")];
    const result = splitMibanPaymentDeductionsByTotals(original, ["228", "59"]);
    expect(result[0][0]).toEqual(deduction("USDT", "32.57142857", "7", "1"));
    expect(result[1][0]).toEqual(deduction("USDT", "8.42857143", "7", "1"));
    expect(result[0][0].cnyValue).toBe("227.99999999");
    expect(result[1][0].cnyValue).toBe("59.00000001");
    // Independent separate-ceil oracle needs one more atom, but actual unified debit remains 41.
    const separate = ["228", "59"].map(total => units(ceilAmount(units(total), units("7"), step("USDT"))));
    expect(separate[0] + separate[1]).toBe(units("41") + step("USDT"));
    verify(original, ["228", "59"], result);
  });
  it.each([["CNY", "101.03"], ["USDT", "14.43285715"], ["ETH", "0.004810952380952381"], ["SOL", "0.144328571428571429"]])(
    "matches largest-remainder atoms for %s including the last share", (code, amount) => {
      const prices: Record<string, string> = { CNY: "1", USDT: "7", ETH: "21000", SOL: "700" };
      const original = [deduction(code, amount, prices[code])];
      const totals = ["13.01", "59", "29.02"];
      const result = splitMibanPaymentDeductionsByTotals(original, totals);
      expectWeighted(original, totals, result);
      verify(original, totals, result);
    },
  );
  it("keeps four mixed currencies/snapshots and full grouped refund sum exactly equal to the unified debit", () => {
    const original = [deduction("CNY", "1.23", "1", "0.142857142857142857"), deduction("USDT", "2.00000001", "7", "1"),
      deduction("ETH", "0.001", "21000", "3000"), deduction("SOL", "0.02", "700", "100")];
    const totals = ["0.01", "3.99", "27.23", "19"];
    const before = JSON.stringify(original);
    const result = splitMibanPaymentDeductionsByTotals(original, totals);
    verify(original, totals, result);
    expectWeighted(original, totals, result);
    expect(JSON.stringify(original)).toBe(before);
    expect(result.flat().filter(row => ["ETH", "SOL"].includes(row.assetCode)).every(row => row.assetCode !== "USDT")).toBe(true);
  });
  it("splits tiny 18-place ETH/SOL lots without rounding to Number or erasing refund quantity", () => {
    const original = [deduction("ETH", "0.000000000000000003", "21000", "3000"),
      deduction("SOL", "0.000000000000000011", "700", "100")];
    const total = original.reduce((sum, row) => sum + units(row.cnyValue), 0n);
    const totals = [text(total / 7n), text(total / 3n), text(total - total / 7n - total / 3n)];
    const result = splitMibanPaymentDeductionsByTotals(original, totals);
    verify(original, totals, result);
    expectWeighted(original, totals, result);
    expect(result.flat().some(row => row.amount === "0.000000000000000001")).toBe(true);
  });
  it("keeps tiny fractional-price snapshots honest at 18-place precision", () => {
    const original = [deduction("ETH", "0.000000000000000005", "0.5", "0.1")];
    const totals = ["0.000000000000000001", "0.000000000000000001"];
    const result = splitMibanPaymentDeductionsByTotals(original, totals);
    verify(original, totals, result);
    expect(result.map(rows => rows[0].cnyValue)).toEqual(["0.000000000000000001", "0.000000000000000001"]);
  });
  it("retains a refundable atom whose honest cnyValue rounds to zero, never invents a positive value", () => {
    const original = [deduction("ETH", "0.000000000000000003", "0.5", "0.1"),
      deduction("SOL", "0.000000000000000001")];
    const totals = ["0.000000000000000001", "0.000000000000000001"];
    const result = splitMibanPaymentDeductionsByTotals(original, totals);
    expect(result[1]).toEqual([{ ...original[0], amount: "0.000000000000000001", cnyValue: "0" }]);
    verify(original, totals, result);
    expectWeighted(original, totals, result);
  });
  it("uses stable first-group tie breaking and omits zero amount rows", () => {
    const original = [deduction("ETH", "0.000000000000000001", "3")];
    const result = splitMibanPaymentDeductionsByTotals(original, ["0.000000000000000001", "0.000000000000000001", "0.000000000000000001"]);
    expect(result).toEqual([[original[0]], [], []]);
    verify(original, ["0.000000000000000001", "0.000000000000000001", "0.000000000000000001"], result);
  });
  it("returns original one-group deductions unchanged, preserving source snapshot representation", () => {
    const source = { ...deduction("ETH", "1", "21000", "3000"), amount: "1.000000000000000000", priceCny: "2.1e4", priceUsdt: "3e3" };
    const original = [source];
    const result = splitMibanPaymentDeductionsByTotals(original, ["21000"]);
    expect(result).toEqual([original]);
    expect(result[0]).toBe(original);
    expect(result[0][0]).toBe(source);
  });
  it("keeps original scientific signed price strings for multi-group snapshots", () => {
    const original = [{ ...deduction("ETH", "0.01", "21000", "3000"), priceCny: "2.1e4", priceUsdt: "3e3" }];
    const result = splitMibanPaymentDeductionsByTotals(original, ["59", "151"]);
    expect(result.map(rows => rows[0].priceCny)).toEqual(["2.1e4", "2.1e4"]);
    expect(result.map(rows => rows[0].priceUsdt)).toEqual(["3e3", "3e3"]);
    const amounts = oracleShares("0.01", "ETH", ["59", "151"]);
    expect(result.map(rows => rows[0].amount)).toEqual(amounts);
    expect(result.map(rows => rows[0].cnyValue)).toEqual(amounts.map(amount => text(units(amount) * units("21000") / SCALE)));
  });
  it("repairs a whole-cent multi-coin largest-remainder collision with a verified sequential candidate", () => {
    // Two coarse cents would both win the first group by independent LR tie break.
    const original = [deduction("CNY", "0.01"), deduction("USDT", "0.00000001", "1000000")];
    const totals = ["0.01", "0.01"];
    const result = splitMibanPaymentDeductionsByTotals(original, totals);
    expect(result).toEqual([[original[0]], [original[1]]]);
    verify(original, totals, result);
  });
  it("rejects indivisible rare extreme with at least one group's difference >= a cent", () => {
    const original = [deduction("ETH", "0.000000000000000001", "30000000000000000")];
    expect(() => splitMibanPaymentDeductionsByTotals(original, ["0.01", "0.02"])).toThrow(/最小记账单位/);
  });
  it("accepts aggregate one-cent tolerance only for original single group; multi-group remains strictly sub-cent", () => {
    const original = [deduction("CNY", "0.03")];
    expect(splitMibanPaymentDeductionsByTotals(original, ["0.02"])).toEqual([original]);
    expect(() => splitMibanPaymentDeductionsByTotals(original, ["0.01", "0.01"])).toThrow(/小于一分钱/);
  });
  it("never hides original exact-value overpay behind per-asset 18-place floor", () => {
    const original = [deduction("ETH", "0.000000000000000003", "10000000000000000.5")];
    expect(() => splitMibanPaymentDeductionsByTotals(original, ["0.01", "0.01"])).toThrow(/超过应付/);
  });
  it("accepts exact number/string/scientific target amounts, preserving target order", () => {
    const original = [deduction("CNY", "287")];
    expect(splitMibanPaymentDeductionsByTotals(original, [228, "5.9e1"])).toEqual([[deduction("CNY", "228")], [deduction("CNY", "59")]]);
  });
  it("does not silently truncate sub-wei positive or negative totals", () => {
    for (const total of ["0.0000000000000000001", "-0.0000000000000000001", "1.0000000000000000001"]) {
      expect(() => splitMibanPaymentDeductionsByTotals([deduction("CNY", "1")], [total])).toThrow(/精度/);
    }
  });
  it.each([0, -1, "0", "-0.01", NaN, Infinity, "", "abc", "0x10", "1/2", "1,000", null, undefined, {}, "1e101"])(
    "rejects invalid/nonpositive group target %s", total => {
      expect(() => splitMibanPaymentDeductionsByTotals([deduction("CNY", "1")], [total] as any)).toThrow();
    },
  );
  it.each([[], null, undefined, {}])("rejects empty/non-array group totals %s", totals => {
    expect(() => splitMibanPaymentDeductionsByTotals([deduction("CNY", "1")], totals as any)).toThrow();
  });
  it("rejects one bad group among good groups rather than allowing negative offsets", () => {
    expect(() => splitMibanPaymentDeductionsByTotals([deduction("CNY", "2")], ["1", "-1", "2"])).toThrow(/大于零/);
  });
  it("rejects overall shortage and overpayment before returning any split", () => {
    expect(() => splitMibanPaymentDeductionsByTotals([deduction("CNY", "1")], ["1", "0.01"])).toThrow(/不足/);
    expect(() => splitMibanPaymentDeductionsByTotals([deduction("CNY", "2")], ["0.5", "0.5"])).toThrow(/超过应付/);
  });
  it.each([
    [deduction("ETH", "1", "1"), deduction("ETH", "1", "1")],
    [deduction("CNY", "0.001")], [deduction("USDT", "0.000000001")],
    [deduction("ETH", "-1")], [deduction("ETH", "0")],
    [{ ...deduction("ETH", "1"), cnyValue: "2" }],
    [{ ...deduction("ETH", "1"), priceCny: "0" }],
    [{ ...deduction("ETH", "1"), priceUsdt: "0" }],
    [{ ...deduction("ETH", "1"), assetCode: "eth" }],
    [{ ...deduction("ETH", "1"), assetCode: "GOLD" }],
    [{ ...deduction("ETH", "1"), amount: "1e0" }],
    [{ ...deduction("ETH", "1"), priceCny: "1.0000000000000000001" }],
  ])("fails closed on malformed unvalidated deductions %j", (...original) => {
    expect(() => splitMibanPaymentDeductionsByTotals(original as MibanPaymentDeduction[], ["0.5", "0.5"])).toThrow();
  });
  it.each([[], null, undefined, {}])("rejects missing debit inventory %s", original => {
    expect(() => splitMibanPaymentDeductionsByTotals(original as any, ["1"])).toThrow();
  });
  it("runs 120 deterministic unequal native lots against the independent oracle", () => {
    for (let seed = 1n; seed <= 120n; seed++) {
      const totalCents = 200n + seed * 23n;
      const first = 1n + seed;
      const second = 17n + seed * 3n;
      const totals = [text(first * CENT), text(second * CENT), text((totalCents - first - second) * CENT)];
      const code = seed % 2n === 0n ? "USDT" : "ETH";
      const price = code === "USDT" ? "7.123456789123456789" : "21000.123456789123456789";
      const original = [deduction(code, ceilAmount(totalCents * CENT, units(price), step(code)), price)];
      const result = splitMibanPaymentDeductionsByTotals(original, totals);
      verify(original, totals, result);
      expectWeighted(original, totals, result);
    }
  });
  it("runs 80 deterministic four-coin mixed carts with three unequal merchandise totals", () => {
    for (let seed = 1n; seed <= 80n; seed++) {
      const original = [deduction("CNY", text((seed + 1n) * CENT)),
        deduction("USDT", text((seed + 3n) * SCALE / 100n), "7"),
        deduction("ETH", text((seed + 7n) * 10n ** 12n), "21000"),
        deduction("SOL", text((seed + 11n) * 10n ** 13n), "700")];
      const total = original.reduce((sum, row) => sum + units(row.cnyValue), 0n);
      const first = total / CENT / 7n * CENT;
      const second = total / CENT / 3n * CENT;
      const totals = [text(first), text(second), text(total - first - second)];
      const result = splitMibanPaymentDeductionsByTotals(original, totals);
      verify(original, totals, result);
      expectWeighted(original, totals, result);
    }
  });
});
