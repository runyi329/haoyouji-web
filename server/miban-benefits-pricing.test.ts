import { describe, expect, it } from "vitest";
import {
  calculateBenefits,
  calculate,
  flattenCatalog,
  status,
  beijingDate,
  type Rule,
  type BenefitPricingLine,
} from "../shared/miban-benefits";
const now = Date.parse("2026-11-27T10:00:00+08:00");
const rule = (patch: Partial<Rule> = {}): Rule => ({
  id: "r",
  userId: "7",
  kind: "rate",
  name: "专属",
  scope: "all",
  targets: [],
  value: 7.9,
  threshold: 0,
  starts: "2026-11-27",
  ends: "",
  unlimited: true,
  maxUses: 0,
  uses: 0,
  state: "active",
  note: "内部",
  created: "",
  version: 1,
  ...patch,
});
const line = (patch: Partial<BenefitPricingLine> = {}): BenefitPricingLine => ({
  productKey: "rice",
  skuId: "s",
  quantity: 1,
  priceCny: 100,
  activityPriceCny: 80,
  category: "大米",
  series: "米大娘精选",
  ...patch,
});
describe("miban benefits integer non-stacking pricing", () => {
  it("takes best normal/activity/rate/price without stacking", () => {
    const result = calculateBenefits(
      [rule(), rule({ id: "p", kind: "price", value: 78 })],
      [line()],
      now
    );
    expect(result.totalCents).toBe(7800);
    expect(result.consumedRuleIds).toEqual(["p"]);
  });
  it("activity tie never consumes a right", () => {
    expect(
      calculateBenefits([rule({ value: 8 })], [line()], now).consumedRuleIds
    ).toEqual([]);
  });
  it("coupon scope recomputes from normal prices, outside lines keep rights", () => {
    const result = calculateBenefits(
      [
        rule(),
        rule({
          id: "coupon",
          kind: "cash",
          scope: "category",
          targets: ["大米"],
          value: 30,
          maxUses: 1,
          unlimited: false,
        }),
      ],
      [
        line(),
        line({
          productKey: "fruit",
          skuId: "f",
          category: "水果",
          priceCny: 60,
          activityPriceCny: 60,
        }),
      ],
      now
    );
    expect(result.totalCents).toBe(11740);
    expect(result.couponId).toBe("coupon");
    expect(result.consumedRuleIds).toEqual(["coupon", "r"]);
    expect(result.lines.find(l => l.productKey === "rice")?.ruleId).toBe(
      "coupon"
    );
  });
  it("covered rights do not consume and coupon equal to base is not consumed", () => {
    const equal = calculateBenefits(
      [rule(), rule({ id: "c", kind: "cash", value: 21, maxUses: 1 })],
      [line()],
      now
    );
    expect(equal.couponId).toBeUndefined();
    expect(equal.consumedRuleIds).toEqual(["r"]);
    const better = calculateBenefits(
      [rule(), rule({ id: "c", kind: "cash", value: 30, maxUses: 1 })],
      [line()],
      now
    );
    expect(better.consumedRuleIds).toEqual(["c"]);
  });
  it("threshold is based only on covered normal subtotal", () => {
    const r = rule({
      id: "c",
      kind: "threshold",
      scope: "category",
      targets: ["大米"],
      threshold: 100,
      value: 30,
      maxUses: 1,
    });
    expect(calculateBenefits([r], [line()], now).totalCents).toBe(7000);
    expect(
      calculateBenefits(
        [{ ...r, threshold: 101 }],
        [line(), line({ productKey: "f", skuId: "f", category: "水果" })],
        now
      ).couponId
    ).toBeUndefined();
  });
  it("never chooses zero-cent coupon plans or outputs a zero-cent line", () => {
    expect(
      calculateBenefits(
        [rule({ id: "c", kind: "cash", value: 100 })],
        [line()],
        now
      ).totalCents
    ).toBe(8000);
    const result = calculateBenefits(
      [rule({ id: "c", kind: "cash", value: 99.99 })],
      [
        line(),
        line({
          productKey: "a",
          skuId: "x",
          priceCny: 0.01,
          activityPriceCny: 0.01,
        }),
      ],
      now
    );
    expect(result.lines.every(l => l.totalCents >= 1)).toBe(true);
    expect(result.totalCents).toBe(2);
  });
  it("allocates exact deterministic cents independently of cart/rule order", () => {
    const lines = [
      line({ productKey: "z", priceCny: 1.01, activityPriceCny: 1.01 }),
      line({ productKey: "a", priceCny: 2.02, activityPriceCny: 2.02 }),
      line({ productKey: "b", priceCny: 3.03, activityPriceCny: 3.03 }),
    ];
    const rules = [
      rule({ id: "z", kind: "cash", value: 1.01 }),
      rule({ id: "a", kind: "cash", value: 1.01 }),
    ];
    const a = calculateBenefits(rules, lines, now),
      b = calculateBenefits([...rules].reverse(), [...lines].reverse(), now);
    expect(a).toEqual(b);
    expect(a.totalCents).toBe(505);
    expect(a.lines.reduce((s, l) => s + l.totalCents, 0)).toBe(505);
    expect(a.couponId).toBe("a");
  });
  it("largest remainder cannot make a one-cent line cost more than normal", () => {
    const result = calculateBenefits(
      [rule({ kind: "cash", value: 0.01 })],
      [
        line({ productKey: "small", priceCny: 0.01, activityPriceCny: 0.01 }),
        line({ productKey: "big1", priceCny: 1, activityPriceCny: 1 }),
        line({ productKey: "big2", priceCny: 1, activityPriceCny: 1 }),
      ],
      now
    );
    expect(result.totalCents).toBe(200);
    expect(
      result.lines.every(
        l => l.totalCents <= l.originalCents && l.totalCents >= 1
      )
    ).toBe(true);
  });
  it("counts a rule only once for a whole cart", () => {
    const result = calculateBenefits(
      [rule()],
      [line(), line({ productKey: "a" })],
      now
    );
    expect(result.consumedRuleIds).toEqual(["r"]);
  });
  it("uses live Beijing date, includes end-day 23:59:59 and respects maxUses even long term", () => {
    expect(beijingDate(Date.parse("2026-11-27T16:01:00Z"))).toBe("2026-11-28");
    expect(
      status(
        rule({ ends: "2026-11-27" }),
        Date.parse("2026-11-27T23:59:59+08:00")
      )
    ).toBe("生效中");
    expect(
      status(
        rule({ ends: "2026-11-27" }),
        Date.parse("2026-11-28T00:00:00+08:00")
      )
    ).toBe("已过期");
    expect(status(rule({ unlimited: true, maxUses: 1, uses: 1 }), now)).toBe(
      "次数用尽"
    );
  });
  it("rejects malformed/overflow/zero prices", () => {
    expect(() => calculateBenefits([], [line({ quantity: 0 })], now)).toThrow();
    expect(() => calculateBenefits([], [line({ priceCny: 0 })], now)).toThrow();
    expect(() =>
      calculateBenefits([], [line({ priceCny: Number.MAX_SAFE_INTEGER })], now)
    ).toThrow();
  });
  it("prototype adapter binds sorted output to actual matching SKU, not input index", () => {
    const skus = flattenCatalog([
      {
        id: "limited:z",
        productKey: "z",
        name: "Z商品",
        category: "c",
        series: "s",
        skus: [
          {
            id: "limited:z:one",
            skuId: "one",
            name: "Z规格",
            price: 10,
            activity: 10,
          },
        ],
      },
      {
        id: "limited:a",
        productKey: "a",
        name: "A商品",
        category: "c",
        series: "s",
        skus: [
          {
            id: "limited:a:two",
            skuId: "two",
            name: "A规格",
            price: 20,
            activity: 20,
          },
        ],
      },
    ]);
    const result = calculate(
      [],
      [
        { skuId: "limited:z:one", qty: 3 },
        { skuId: "limited:a:two", qty: 2 },
      ],
      skus
    );
    expect(result.bestLines[0].line).toMatchObject({
      skuId: "limited:a:two",
      qty: 2,
      sku: { name: "A规格" },
    });
    expect(result.bestLines[0].best.amount).toBe(4000);
  });
  it("property-style repeated allocations always exact and positive", () => {
    for (let n = 2; n < 30; n++) {
      const lines = Array.from({ length: n }, (_, i) =>
        line({
          productKey: `p${i}`,
          priceCny: (i + 1) / 100,
          activityPriceCny: (i + 1) / 100,
        })
      );
      const original = (n * (n + 1)) / 2;
      const result = calculateBenefits(
        [rule({ kind: "cash", value: (original - n) / 100 })],
        lines,
        now
      );
      expect(result.totalCents).toBe(n);
      expect(result.lines.every(l => l.totalCents === 1)).toBe(true);
    }
  });
});
