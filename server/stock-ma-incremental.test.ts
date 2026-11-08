import { describe, expect, it } from "vitest";
import {
  canonicalWindow,
  canonicalWindowSums,
  canonicalPositiveSum,
  canonicalAverages,
  advanceMAStates,
  maState,
  MA_COMBINATIONS,
  packMAStates,
  unpackMAStates,
  maTail,
  compareMADates,
  type MADaily,
} from "./stock-ma-incremental";
const periods = [5, 10, 20, 30, 60, 120, 250] as const;
function raw(n: number): MADaily[] {
  return Array.from({ length: n }, (_, i) => ({
    open: 10 + i / 10,
    high: 11 + i / 10,
    low: 9 + i / 10,
    close: 10 + i / 10,
    preClose: 9.9 + i / 10,
    amount: (9.95 + i / 10) * (10 + (i % 9)),
    vol: 100 + (i % 9) * 10,
    pct: 1,
  }));
}
function fullStates(rows: (MADaily | null)[]): Uint8Array {
  const states = new Uint8Array(rows.length * 6);
  rows.forEach((d, i) => {
    const avg = canonicalAverages(rows, i);
    MA_COMBINATIONS.forEach((p, c) => {
      states[i * 6 + c] = maState(d?.close ?? NaN, avg, p);
    });
  });
  return states;
}
describe("window-relative canonical pairwise v1", () => {
  it("bootstrap accelerated positive dyadic blocks are bit-identical to direct relative window tree", () => {
    const r = raw(350);
    r.forEach((d, i) => {
      d.amount *= 10 ** ((i % 19) - 8);
      d.vol *= 10 ** ((i % 19) - 8);
    });
    for (const field of ["amount", "vol"] as const) {
      const sum = canonicalWindowSums(r, field);
      for (const p of periods)
        for (let i = p - 1; i < r.length; i++)
          expect(
            Object.is(
              sum(i - p + 1, p),
              canonicalPositiveSum(r, i - p + 1, p, field)
            )
          ).toBe(true);
    }
  });
  it("surviving windows remain bit-identical when their 350-day position changes", () => {
    const r = raw(351);
    r.forEach((d, i) => {
      const v = 10 ** ((i % 17) - 3);
      d.amount *= v;
      d.vol *= v;
    });
    for (const p of periods)
      expect(
        Object.is(
          canonicalWindow(r, 349, p),
          canonicalWindow(r.slice(1), 348, p)
        )
      ).toBe(true);
  });
  it("huge ancient data cannot cancel tiny recent windows and equal prices never become strict", () => {
    const r = raw(350);
    r.forEach(d => {
      d.open = d.close = d.preClose = 10;
      d.low = 9;
      d.high = 11;
      d.vol = 1e200;
      d.amount = 1e200;
    });
    r.slice(-20).forEach(d => {
      d.vol = 1e-200;
      d.amount = 1e-200;
    });
    expect(canonicalWindow(r, 349, 5)).toBe(10);
    expect(maState(10, canonicalAverages(r, 349), [5, 10, 20])).toBe(1);
  });
  it("one append equals full canonical states; long tail never exceeds 101 and short never exceeds 331", () => {
    const r = raw(351),
      old = r.slice(0, 350),
      latest = r.slice(1);
    const incremental = advanceMAStates(fullStates(old), latest, true);
    expect(incremental.states).toEqual(fullStates(latest));
    expect(incremental.corrections.size).toBeLessThanOrEqual(7);
    const dates = Array.from({ length: 350 }, (_, i) => String(i));
    expect(maTail(incremental.states, dates, 2).consecutiveDays).toBe(101);
    expect(maTail(incremental.states, dates, 0).consecutiveDays).toBe(331);
  });
  it("old second-day reference break disappears at the left boundary and exactly-first windows recover", () => {
    const r = raw(351);
    r[1].preClose -= 1;
    const old = fullStates(r.slice(0, 350));
    const updated = advanceMAStates(old, r.slice(1), true);
    expect(updated.states).toEqual(fullStates(r.slice(1)));
    for (const p of periods)
      expect(
        updated.corrections.get(p - 1)?.[periods.indexOf(p)]
      ).toBeGreaterThan(0);
    expect(updated.states[19 * 6]).toBe(2);
  });
  it("missing day advances unknown, packed states round-trip and false/unknown produce distinct tails", () => {
    const r: (MADaily | null)[] = raw(100);
    r[75] = null;
    const old = fullStates(r),
      updated = advanceMAStates(old, [...r, null], false);
    expect(updated.states).toEqual(fullStates([...r, null]));
    expect(unpackMAStates(packMAStates(old), r.length)).toEqual(old);
    expect(
      maTail(
        old,
        r.map((_, i) => String(i)),
        0
      )
    ).toMatchObject({ consecutiveDays: 5, lowerBound: true });
    const bad = packMAStates(old);
    bad[0] |= 3;
    expect(() => unpackMAStates(bad, r.length)).toThrow("Invalid");
  });
});
describe("overlap date metadata classification", () => {
  const meta = (dates: string[]) => dates.map(d => [d, "1", null, "5", "5"]);
  it("new/expired dates do not count as historical revisions, existing changed date does", () => {
    const old = ["1", "2", "3"],
      now = ["1", "2", "3", "4", "5"],
      m = meta(now);
    m[1][3] = "6";
    expect(compareMADates(old, now, meta(old), m)).toEqual({
      bootstrap: false,
      newDates: ["4", "5"],
      changedDates: ["2"],
    });
  });
  it.each(
    [
      ["1", "2", "2a", "3"],
      ["1", "3"],
      ["4", "5"],
      ["0", "1", "2", "3"],
    ].map(value => [value])
  )("date reorder/insert/delete/no-overlap uses global exception: %j", now => {
    expect(
      compareMADates(["1", "2", "3"], now, meta(["1", "2", "3"]), meta(now))
        .bootstrap
    ).toBe(true);
  });
});
