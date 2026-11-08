import {
  STOCK_MA_MONITOR_PERIODS,
  STOCK_MA_MONITOR_PRESETS,
} from "../shared/stock-ma-monitor";
import type { StockMAMonitorPeriod } from "../shared/stock-ma-monitor";

/** Window-relative pairwise summation replaces position-dependent segment
 * queries. Full bootstrap, append and repair MUST share this engine version. */
export const STOCK_MA_ALGORITHM_VERSION = "raw-vwap-window-pairwise-v1";
export const MA_HISTORY_DAYS = 350;
export const MA_COMBINATIONS: readonly (readonly StockMAMonitorPeriod[])[] = [
  ...Object.values(STOCK_MA_MONITOR_PRESETS).map(p => p.periods),
  [5, 10],
  [5, 20],
  [10, 20],
];
export type MADaily = {
  open: number;
  high: number;
  low: number;
  close: number;
  preClose: number;
  vol: number;
  amount: number;
  pct: number | null;
};
export type MACompactStock = {
  code: string;
  /** Owning buffers; 8 raw Float64s/date. No historical averages. */
  values: Float64Array;
  /** 0 missing, 1 invalid, 2 valid, 3 duplicate. */
  flags: Uint8Array;
  /** Six three-state conditions/date, two bits each: 0 unknown, 1 false, 2 true. */
  states: Uint8Array;
  poisoned: boolean;
};
export type MADateMetadata = (string | null)[][];
export type MADateDelta = {
  bootstrap: boolean;
  newDates: string[];
  changedDates: string[];
};

export function compareMADates(
  oldDates: string[],
  dates: string[],
  oldMeta: MADateMetadata,
  meta: MADateMetadata
): MADateDelta {
  const oldSet = new Set(oldDates),
    currentSet = new Set(dates);
  const overlap = dates.filter(d => oldSet.has(d));
  const newDates = dates.filter(d => !oldSet.has(d));
  // Only a suffix append plus a prefix expiry is incremental. Any interior
  // insertion/deletion, time reversal, or no overlap reorders market ordinals.
  const bootstrap =
    !overlap.length ||
    newDates.some(d => d <= oldDates.at(-1)!) ||
    oldDates.filter(d => currentSet.has(d)).join() !== overlap.join() ||
    oldDates.filter(d => !currentSet.has(d)).some(d => d >= overlap[0]) ||
    dates.slice(0, overlap.length).join() !== overlap.join() ||
    [...oldDates, ...newDates].slice(-MA_HISTORY_DAYS).join() !== dates.join();
  const byDate = new Map(oldMeta.map(m => [m[0], JSON.stringify(m)]));
  return {
    bootstrap,
    newDates,
    changedDates: overlap.filter(
      d => byDate.get(d) !== JSON.stringify(meta[dates.indexOf(d)])
    ),
  };
}

/** Fixed relative-window binary tree, positive leaves only. Padding on the
 * right is always relative to this window, never to its 350-day position. */
export function canonicalPositiveSum(
  raw: (MADaily | null)[],
  start: number,
  size: number,
  field: "amount" | "vol"
): number {
  const sum = (offset: number, width: number): number => {
    if (offset >= size) return 0;
    if (width === 1) return raw[start + offset]![field];
    const half = width / 2;
    return sum(offset, half) + sum(offset + half, half);
  };
  let width = 1;
  while (width < size) width *= 2;
  return sum(0, width);
}
/** Temporary bootstrap acceleration: dyadic blocks for EVERY starting index,
 * not a globally anchored segment tree. Its query evaluates exactly the same
 * padded relative-window tree as canonicalPositiveSum, bit for bit. */
export function canonicalWindowSums(
  raw: (MADaily | null)[],
  field: "amount" | "vol"
): (start: number, size: number) => number {
  const n = raw.length,
    levels = 9;
  const blocks = new Float64Array(n * levels);
  raw.forEach((d, i) => {
    blocks[i] = d?.[field] ?? 0;
  });
  for (let level = 1, width = 2; level < levels; level++, width *= 2) {
    const previous = (level - 1) * n;
    for (let start = 0; start + width <= n; start++)
      blocks[level * n + start] =
        blocks[previous + start] + blocks[previous + start + width / 2];
  }
  return (start, size) => {
    let level = 0,
      width = 1;
    while (width < size) {
      width *= 2;
      level++;
    }
    const sum = (offset: number, span: number, l: number): number => {
      if (offset >= size) return 0;
      if (offset + span <= size) return blocks[l * n + start + offset];
      return (
        sum(offset, span / 2, l - 1) + sum(offset + span / 2, span / 2, l - 1)
      );
    };
    return sum(0, width, level);
  };
}
export function canonicalWindow(
  raw: (MADaily | null)[],
  index: number,
  period: StockMAMonitorPeriod,
  poisoned = false
): number {
  const start = index - period + 1;
  if (poisoned || start < 0) return NaN;
  for (let i = start; i <= index; i++) {
    const d = raw[i];
    if (
      !d ||
      (i > 0 &&
        raw[i - 1] &&
        Math.abs(d.preClose - raw[i - 1]!.close) > 0.0010000001)
    )
      return NaN;
  }
  const value =
    (10 * canonicalPositiveSum(raw, start, period, "amount")) /
    canonicalPositiveSum(raw, start, period, "vol");
  return Number.isFinite(value) && value > 0 ? value : NaN;
}
export function canonicalAverages(
  raw: (MADaily | null)[],
  index: number,
  poisoned = false
): Float64Array {
  return Float64Array.from(STOCK_MA_MONITOR_PERIODS, p =>
    canonicalWindow(raw, index, p, poisoned)
  );
}
export function maState(
  close: number,
  averages: Float64Array,
  periods: readonly StockMAMonitorPeriod[]
): number {
  if (
    !Number.isFinite(close) ||
    periods.some(
      p => !Number.isFinite(averages[STOCK_MA_MONITOR_PERIODS.indexOf(p)])
    )
  )
    return 0;
  let previous = close;
  for (const p of periods) {
    const average = averages[STOCK_MA_MONITOR_PERIODS.indexOf(p)];
    if (
      previous - average <=
      32 * Number.EPSILON * Math.max(Math.abs(previous), Math.abs(average))
    )
      return 1;
    previous = average;
  }
  return 2;
}
export function packMAStates(states: Uint8Array): Uint8Array {
  const packed = new Uint8Array(Math.ceil(states.length / 4));
  states.forEach((state, i) => {
    packed[i >> 2] |= state << ((i % 4) * 2);
  });
  return packed;
}
export function unpackMAStates(
  packed: Uint8Array,
  dateCount: number
): Uint8Array {
  const states = new Uint8Array(dateCount * MA_COMBINATIONS.length);
  states.forEach((_, i) => {
    states[i] = (packed[i >> 2] >> ((i % 4) * 2)) & 3;
  });
  if (states.some(s => s > 2))
    throw new TypeError("Invalid stock MA checkpoint state");
  return states;
}
export function decodeMARaw(
  stock: MACompactStock,
  dateCount: number
): (MADaily | null)[] {
  if (
    !(stock.values instanceof Float64Array) ||
    stock.values.length !== dateCount * 8 ||
    !(stock.flags instanceof Uint8Array) ||
    stock.flags.length !== dateCount ||
    !(stock.states instanceof Uint8Array) ||
    stock.states.length !== Math.ceil((dateCount * 6) / 4) ||
    stock.flags.some(f => f > 3) ||
    typeof stock.poisoned !== "boolean"
  )
    throw new TypeError("Invalid stock MA compact shard");
  return Array.from(stock.flags, (flag, i) => {
    if (flag !== 2) return null;
    const p = i * 8,
      v = stock.values;
    if (
      !Array.from(v.subarray(p, p + 7)).every(x => Number.isFinite(x) && x > 0)
    )
      throw new TypeError("Invalid stock MA checkpoint daily");
    return {
      open: v[p],
      high: v[p + 1],
      low: v[p + 2],
      close: v[p + 3],
      preClose: v[p + 4],
      vol: v[p + 5],
      amount: v[p + 6],
      pct: Number.isNaN(v[p + 7]) ? null : v[p + 7],
    };
  });
}
export function sameMANormalizedDay(
  a: MACompactStock,
  ai: number,
  b: MACompactStock,
  bi: number
): boolean {
  if (a.flags[ai] !== b.flags[bi]) return false;
  for (let p = 0; p < 8; p++)
    if (!Object.is(a.values[ai * 8 + p], b.values[bi * 8 + p])) return false;
  return true;
}
export function maTail(
  states: Uint8Array,
  dates: string[],
  combination: number
): {
  state: number;
  consecutiveDays: number;
  lowerBound: boolean;
  since?: string;
} {
  const last = dates.length - 1;
  const state = states[last * 6 + combination] ?? 0;
  let consecutiveDays = 0,
    lowerBound = true;
  if (state === 2)
    for (let i = last; i >= 0; i--) {
      const s = states[i * 6 + combination];
      if (s === 0) break;
      if (s === 1) {
        lowerBound = false;
        break;
      }
      consecutiveDays++;
    }
  return {
    state,
    consecutiveDays,
    lowerBound,
    since: consecutiveDays ? dates[last - consecutiveDays + 1] : undefined,
  };
}
/** Advance one source market day, including missing rows. At most seven
 * boundary dates are reevaluated; old states are masked before tail counting. */
export function advanceMAStates(
  oldStates: Uint8Array,
  raw: (MADaily | null)[],
  dropped: boolean
): {
  states: Uint8Array;
  corrections: Map<number, Float64Array>;
  latest: Float64Array;
} {
  const n = raw.length,
    states = new Uint8Array(n * 6);
  states.set(oldStates.subarray(dropped ? 6 : 0), 0);
  const corrections = new Map<number, Float64Array>();
  if (dropped)
    for (const p of STOCK_MA_MONITOR_PERIODS) {
      const index = p - 1;
      if (index < n - 1 && !corrections.has(index))
        corrections.set(index, canonicalAverages(raw, index));
    }
  for (let c = 0; c < 6; c++) {
    const periods = MA_COMBINATIONS[c],
      warmup = Math.max(...periods) - 1;
    for (let i = 0; i < Math.min(warmup, n); i++) states[i * 6 + c] = 0;
  }
  for (const [index, averages] of Array.from(corrections))
    for (let c = 0; c < 6; c++)
      states[index * 6 + c] = maState(
        raw[index]?.close ?? NaN,
        averages,
        MA_COMBINATIONS[c]
      );
  const latest = canonicalAverages(raw, n - 1);
  for (let c = 0; c < 6; c++)
    states[(n - 1) * 6 + c] = maState(
      raw[n - 1]?.close ?? NaN,
      latest,
      MA_COMBINATIONS[c]
    );
  return { states, corrections, latest };
}
