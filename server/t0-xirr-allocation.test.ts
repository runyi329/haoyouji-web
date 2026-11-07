import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateT0AllocationTargetTopUp,
  calculateT0AllocationXirr,
  type T0AllocationCashFlow,
} from "../shared/t0-xirr-allocation";

const initial: T0AllocationCashFlow = { occurredOn: "2025-01-01", amount: -100 };
const terminal: T0AllocationCashFlow = { occurredOn: "2025-12-31", amount: 110, atEndOfBeijingDay: true };
const endDate = "2025-12-31";
const dayMs = 24 * 60 * 60 * 1000;

afterEach(() => vi.useRealTimers());

describe("allocation XIRR: original dated investor cash-flow semantics", () => {
  it("has 10% XIRR after exactly 365 days and needs 10 to reach 20%", () => {
    expect(calculateT0AllocationXirr([initial, terminal])).toBeCloseTo(0.1, 8);
    expect(calculateT0AllocationTargetTopUp([initial], 110, 0.2, endDate)).toBeCloseTo(10, 10);
  });

  it("adapts positive ledger directions while retaining already signed flows", () => {
    const flows: T0AllocationCashFlow[] = [
      { ...initial, amount: 100, direction: "deposit" },
      { ...terminal, direction: "withdrawal" },
    ];
    expect(calculateT0AllocationXirr(flows)).toBe(calculateT0AllocationXirr([initial, terminal]));
    expect(calculateT0AllocationTargetTopUp([flows[0]], 110, 0.2, endDate)).toBeCloseTo(10, 10);
  });

  it("compounds each withdrawal and later investment from its actual date", () => {
    const flows: T0AllocationCashFlow[] = [
      initial,
      { occurredOn: "2025-03-01", amount: 20, direction: "withdrawal" },
      { occurredOn: "2025-06-01", amount: 50, direction: "deposit" },
      { occurredOn: "2025-09-01", amount: 10, direction: "withdrawal", atEndOfBeijingDay: true },
    ];
    const terminalTimestamp = Date.UTC(2026, 0, 1);
    const required = flows.reduce((sum, flow) => {
      const amount = flow.direction === "deposit" ? -Math.abs(flow.amount) : flow.amount;
      const timestamp = Date.parse(`${flow.occurredOn}T00:00:00Z`) + (flow.atEndOfBeijingDay ? dayMs : 0);
      return sum - amount * Math.pow(1.2, (terminalTimestamp - timestamp) / (365 * dayMs));
    }, 0);
    expect(calculateT0AllocationTargetTopUp(flows, 90, 0.2, endDate)).toBeCloseTo(required - 90, 10);
    expect(calculateT0AllocationXirr([...flows, { ...terminal, amount: required }])).toBeCloseTo(0.2, 8);
    expect(calculateT0AllocationXirr([...flows].reverse().concat({ ...terminal, amount: required }))).toBeCloseTo(0.2, 8);
  });

  it("counts same-day terminal day end as one day, not zero days", () => {
    const flows: T0AllocationCashFlow[] = [initial, { ...initial, amount: 100.01, atEndOfBeijingDay: true }];
    expect(calculateT0AllocationXirr(flows)).toBeCloseTo(Math.pow(1.0001, 365) - 1, 5);
    expect(calculateT0AllocationXirr(flows.map(flow => ({ ...flow, atEndOfBeijingDay: false })))).toBeNull();
    expect(calculateT0AllocationTargetTopUp([initial], 100, 0.2, "2025-01-01"))
      .toBeCloseTo(100 * (Math.pow(1.2, 1 / 365) - 1), 10);
  });

  it("groups equal effective timestamps and cancels zero-net flows", () => {
    const extra: T0AllocationCashFlow[] = [
      { occurredOn: "2024-12-31", amount: -25, atEndOfBeijingDay: true },
      { occurredOn: "2025-01-01", amount: 25 },
    ];
    expect(calculateT0AllocationXirr([...extra, initial, terminal])).toBe(calculateT0AllocationXirr([initial, terminal]));
  });

  it("returns null without mixed signs, sufficient valid flows, or a finite solution", () => {
    for (const flows of [[], [initial], [terminal], [{ ...initial, amount: 100 }, terminal], [initial, { ...terminal, amount: -110 }]]) {
      expect(calculateT0AllocationXirr(flows)).toBeNull();
    }
    expect(calculateT0AllocationXirr([{ ...initial, amount: -1e308 }, { ...terminal, amount: 1e308 }])).toBeNull();
  });

  it("drops missing/impossible dates and nonfinite amounts rather than inventing cash flows", () => {
    const invalid: T0AllocationCashFlow[] = [
      { occurredOn: "", amount: -1000 },
      { occurredOn: "2025-02-30", amount: -1000 },
      { occurredOn: "2025-01-01T00:00:00Z", amount: -1000 },
      { occurredOn: undefined as unknown as string, amount: -1000 },
      { occurredOn: "2025-01-01", amount: Infinity },
      { occurredOn: "2025-01-01", amount: NaN },
    ];
    expect(calculateT0AllocationXirr([...invalid, initial, terminal])).toBe(calculateT0AllocationXirr([initial, terminal]));
    expect(calculateT0AllocationTargetTopUp([...invalid, initial], 110, 0.2, endDate)).toBeCloseTo(10, 10);
    expect(calculateT0AllocationTargetTopUp(invalid, 110, 0.2, endDate)).toBeNull();
  });
});

describe("allocation target top-up: period terminal shortfall, not realized-profit subtraction", () => {
  it("treats a zero target explicitly and supports negative terminal values", () => {
    expect(calculateT0AllocationTargetTopUp([initial], 80, 0, endDate)).toBe(20);
    expect(calculateT0AllocationTargetTopUp([initial], -10, 0, endDate)).toBe(110);
    expect(calculateT0AllocationTargetTopUp([initial], 110, 0, endDate)).toBe(0);
    expect(calculateT0AllocationTargetTopUp([initial], 80, -0.1, endDate)).toBeCloseTo(10, 10);
  });

  it("rejects invalid finite targets, terminal values, dates and missing investments", () => {
    for (const rate of [-1, -2, NaN, Infinity, -Infinity]) {
      expect(calculateT0AllocationTargetTopUp([initial], 110, rate, endDate)).toBeNull();
    }
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(calculateT0AllocationTargetTopUp([initial], value, 0.2, endDate)).toBeNull();
    }
    expect(calculateT0AllocationTargetTopUp([initial], 110, 0.2, "2025-02-30")).toBeNull();
    expect(calculateT0AllocationTargetTopUp([{ ...initial, amount: 100 }], 110, 0.2, endDate)).toBeNull();
    expect(calculateT0AllocationTargetTopUp([initial], 0, Number.MAX_VALUE, "2027-12-31")).toBeNull();
  });

  it("ignores flows strictly beyond terminal day end", () => {
    const future: T0AllocationCashFlow = { occurredOn: "2026-01-02", amount: -9999 };
    expect(calculateT0AllocationTargetTopUp([initial, future], 110, 0.2, endDate)).toBeCloseTo(10, 10);
    expect(calculateT0AllocationTargetTopUp([future], 110, 0.2, endDate)).toBeNull();
  });

  it("defaults to Beijing today even across the UTC date boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-30T16:30:00Z"));
    expect(calculateT0AllocationTargetTopUp([initial], 110, 0.2)).toBeCloseTo(10, 10);
  });

  it("does not mutate cash flows or apply cents rounding/budget caps", () => {
    const flows = Object.freeze([Object.freeze({ ...initial })]) as unknown as T0AllocationCashFlow[];
    expect(calculateT0AllocationTargetTopUp(flows, 110.001, 0.2, endDate)).toBeCloseTo(9.999, 10);
    const xirrFlows = Object.freeze([Object.freeze({ ...initial }), Object.freeze({ ...terminal })]) as unknown as T0AllocationCashFlow[];
    expect(calculateT0AllocationXirr(xirrFlows)).toBeCloseTo(0.1, 8);
  });
});
