import { createHash } from "node:crypto";
import { serialize, deserialize } from "node:v8";
import {
  STOCK_MA_ALGORITHM_VERSION,
  canonicalWindowSums,
  compareMADates,
  packMAStates,
  unpackMAStates,
  decodeMARaw,
  sameMANormalizedDay,
  maTail,
  advanceMAStates,
  type MACompactStock,
  type MADateMetadata,
} from "./stock-ma-incremental";
import type {
  StockMACheckpointStore,
  StockMAStoredGeneration,
  StockMAWriteTransaction,
} from "./stock-ma-checkpoint-store";
import {
  getAShareCompletedCutoff,
  isValidAShareTradeDate,
} from "../shared/a-share-completed-days";
import {
  STOCK_MA_MONITOR_PERIODS,
  STOCK_MA_MONITOR_PRESETS,
} from "../shared/stock-ma-monitor";
import type {
  StockMAMonitorCandle,
  StockMAMonitorChartInput,
  StockMAMonitorInput,
  StockMAMonitorBoard,
  StockMAMonitorItem,
  StockMAMonitorMarket,
  StockMAMonitorPeriod,
  StockMAMonitorResult,
} from "../shared/stock-ma-monitor";
import {
  formatStockComparisonDate,
  type StockComparisonDb,
} from "./stock-comparison";

const HISTORY_DAYS = 350; // 250-day warm-up leaves 101 judgeable cached market days.
const CANDLE_DAYS = 30;
const SOURCE_BATCH_STOCKS = 64;
const PROBE_INTERVAL_MS = 60_000;
const FINGERPRINT_INTERVAL_MS = 30 * 60_000;
const STABILITY_MS = 60_000;
const ALL_PERIODS = STOCK_MA_MONITOR_PERIODS;
const COMBINATIONS: readonly (readonly StockMAMonitorPeriod[])[] = [
  ...Object.values(STOCK_MA_MONITOR_PRESETS).map(preset => preset.periods),
  [5, 10],
  [5, 20],
  [10, 20],
];
const COMBINATION_INDEX = new Map(
  COMBINATIONS.map((periods, index) => [JSON.stringify(periods), index])
);
const BOARDS: readonly StockMAMonitorBoard[] = ["SH", "SZ", "GEM", "STAR"];
const MARKETS = new Set(["all", "SH", "SZ", "GEM", "STAR"]);
const SORTS = new Set(["newest", "longest", "code"]);
const COVERAGE_NOTE =
  "仅上市的沪深主板、创业板、科创板；以北京时间15点收盘截止内真实已缓存、版本稳定的最新市场日为截止，不提供盘中报价。短线5/10/20、中线20/30/60、长线60/120/250；每条均价均从周期内真实源日线派生：VWAP=10×成交额(千元)之和/成交量(手)之和，使用原始未复权同口径OHLC/量额，不是收盘价普通MA、每日均价的算术平均或厂商直接返回的均价。缺日、停牌、重复、无效数据及除权参考价断点排除受影响窗口；连续段遇未知或350个缓存市场日左边界标记为已知下限（≥），qualifiedSince仅表示已知连续段最早日期，不代表真实首次符合日期。250日暖机后最多101日可连续判断。日K仅展示本次350个市场日缓存窗口中最近30根有效原始记录及所选周期的有效均价，不填补停牌日。交易日来自缓存日线，未独立核验交易日历，也不保证全市场缓存完整；没有采集完成manifest，版本稳定不代表采集完成确认。同一数据版本持续复用快照，每60秒按需探测版本，每30分钟复核内容指纹（表版本不可用时每次探测复核），不因自然日或周末重扫。";
const UPDATING_WARNING =
  "行情版本更新中，本次仍返回先前已缓存的版本稳定快照，未确认新版本采集完成。";
const CHECK_FAILED_WARNING =
  "行情版本检查失败，本次仍返回先前已缓存快照，当前版本稳定性尚未重新确认。";
type Row = Record<string, unknown>;
type Board = Exclude<StockMAMonitorMarket, "all">;
type Daily = {
  open: number;
  high: number;
  low: number;
  close: number;
  preClose: number;
  vol: number;
  amount: number;
  pct: number | null;
};
// Numeric period keys (5..250) allocate large sparse V8 element stores. Only
// scratch holds all 350 days; a cached stock owns seven latest doubles plus an
// independent, packed buffer for at most 30 real candles, never a scratch view.
// NaN is private; page/chart copies alone use the numeric period-key contract.
type CompactAverages = Float64Array;
const PERIOD_INDEX: Record<StockMAMonitorPeriod, number> = {
  5: 0,
  10: 1,
  20: 2,
  30: 3,
  60: 4,
  120: 5,
  250: 6,
};
type SourceCandle = Omit<StockMAMonitorCandle, "averages"> & {
  averages: CompactAverages;
  averageOffset: number;
};
type ScratchDay = {
  close: Float64Array;
  pct: Float64Array;
  averages: CompactAverages;
  candles: Omit<SourceCandle, "averages">[];
};
type Day = {
  close: number;
  pct: number | null;
  averages: CompactAverages;
  candles: SourceCandle[];
};
type Stock = { code: string; name: string; board: Board; days: Day };
type Source = {
  cutoff: string;
  dates: string[];
  stocks: Stock[];
  ranked: Ranked[];
  fetchedAt: string;
  dataUpdatedAt: string | null;
  warning?: string;
};
type RankedItem = Omit<StockMAMonitorItem, "averages" | "candles"> & {
  board: Board;
  averages: CompactAverages;
  averageOffset: number;
  candles: SourceCandle[];
};
type Ranked = {
  items: RankedItem[];
  eligible: Record<StockMAMonitorMarket, number>;
  excluded: Record<StockMAMonitorMarket, number>;
};
type Probe = {
  dates: string[];
  epochs: [string | null, string | null];
  basics?: Row[];
  basicsKey?: string;
  observedAt: number;
};
type Fingerprint = {
  version: string;
  basics: Row[];
  dataUpdatedAt: string | null;
  newestUpdateAt: number | null;
  metadata: MADateMetadata;
};
type CheckpointMetadata = {
  engine: string;
  version: string;
  probe: Probe;
  fingerprintAt: number;
  epochReliable: boolean;
  fingerprint: Omit<Fingerprint, "basics">;
  shards: { name: string; codes: string[] }[];
};
type Persistence = {
  root: string;
  sourceIdentity: string;
  store: Promise<StockMACheckpointStore>;
  restored?: Promise<void>;
  head?: StockMAStoredGeneration;
  metadata?: CheckpointMetadata;
};
type Cache = {
  source?: {
    value: Source;
    version: string;
    probe: Probe;
    fingerprintAt: number;
  };
  sourceInFlight: Map<string, Promise<Source>>;
  nextProbeAt: number;
  epochReliable: boolean;
  candidate?: { version: string; probe: Probe; firstObservedAt: number };
  persistence?: Persistence;
};
// A stable executor identifies a DB. One lightweight source + six final period
// rankings per DB; no market/page/ledger cache multiplication or connection close.
const caches = new WeakMap<StockComparisonDb, Cache>();
// Bind a fingerprint to the actual source identity, not the mutable cache head.
// Warning wrappers retain the old snapshot's version even during a refresh.
const sourceVersions = new WeakMap<Source, string>();

function sourceCopy(source: Source, warning?: string): Source {
  const copy = { ...source, warning };
  sourceVersions.set(copy, sourceVersionOf(source));
  return copy;
}

function sourceVersionOf(source: Source): string {
  const version = sourceVersions.get(source);
  if (!version) throw new Error("Missing stock MA snapshot version");
  return version;
}

function getCache(db: StockComparisonDb): Cache {
  let cache = caches.get(db);
  if (!cache) {
    cache = {
      sourceInFlight: new Map(),
      nextProbeAt: 0,
      epochReliable: true,
    };
    caches.set(db, cache);
  }
  return cache;
}

/** Explicit opt-in only. No filesystem/store module is loaded for fixtures or
 * legacy callers. Changing identity intentionally discards this executor cache. */
export function configureStockMAMonitorPersistence(
  db: StockComparisonDb,
  options: { root: string; sourceIdentity: string } | null
): void {
  const old = caches.get(db)?.persistence;
  if (
    (!options && !old) ||
    (options &&
      old?.root === options.root &&
      old.sourceIdentity === options.sourceIdentity)
  )
    return;
  if (caches.get(db)?.sourceInFlight.size)
    throw new Error("Cannot reconfigure stock MA persistence during refresh");
  if (options && (!options.root.startsWith("/") || !options.sourceIdentity))
    throw new TypeError("Invalid stock MA persistence configuration");
  caches.delete(db);
  if (!options) return;
  const copied = { ...options };
  const store = import("./stock-ma-checkpoint-store").then(module =>
    module.openStockMACheckpointStore({
      ...copied,
      algorithmVersion: STOCK_MA_ALGORITHM_VERSION,
    })
  );
  // A configuration error is surfaced on the first request, not as an
  // unhandled background rejection between configuration and that request.
  void store.catch(() => undefined);
  getCache(db).persistence = { ...copied, store };
}

async function selectRows(
  db: StockComparisonDb,
  sql: string,
  params: any[] = []
): Promise<Row[]> {
  if (
    !/^\s*SELECT\s/i.test(sql) ||
    /\bFOR\s+UPDATE\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/i.test(sql)
  ) {
    throw new TypeError("Stock MA monitor requires non-locking SELECT");
  }
  const result = await db.execute(sql, params);
  const rows =
    Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  if (
    !Array.isArray(rows) ||
    !rows.every(
      row => row !== null && typeof row === "object" && !Array.isArray(row)
    )
  ) {
    throw new TypeError("Unexpected stock MA monitor SELECT result");
  }
  return rows as Row[];
}

function finite(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boardOf(code: string): Board | null {
  if (/^688\d{3}\.SH$/.test(code)) return "STAR";
  if (/^6\d{5}\.SH$/.test(code)) return "SH";
  if (/^0\d{5}\.SZ$/.test(code)) return "SZ";
  if (/^30[01]\d{3}\.SZ$/.test(code)) return "GEM";
  return null;
}

function dailyOf(row: Row): Daily | null {
  const open = finite(row.open),
    high = finite(row.high),
    low = finite(row.low),
    close = finite(row.close);
  const preClose = finite(row.pre_close),
    vol = finite(row.vol),
    amount = finite(row.amount);
  if (
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    preClose === null ||
    vol === null ||
    amount === null ||
    Math.min(open, high, low, close, preClose, vol, amount) <= 0 ||
    low > high ||
    open < low ||
    open > high ||
    close < low ||
    close > high
  )
    return null;
  const dailyPrice = (10 * amount) / vol;
  // DECIMAL prices .001, amount .001 kCNY, volume .01 lots. Allow only
  // the maximum storage-rounding error, not a percentage-sized adjustment.
  const tolerance = 0.001 + (0.005 + high * 0.005) / vol;
  if (
    !Number.isFinite(dailyPrice) ||
    dailyPrice < low - tolerance ||
    dailyPrice > high + tolerance
  )
    return null;
  return {
    open,
    high,
    low,
    close,
    preClose,
    vol,
    amount,
    pct: finite(row.pct_chg),
  };
}

function computedDays(
  raw: (Daily | null)[],
  dates: string[],
  poisoned: boolean
): ScratchDay {
  const days: ScratchDay = {
    close: new Float64Array(raw.length).fill(NaN),
    pct: new Float64Array(raw.length).fill(NaN),
    averages: new Float64Array(raw.length * ALL_PERIODS.length).fill(NaN),
    candles: [],
  };
  let candleStart = raw.length;
  let candleCount = 0;
  for (let i = raw.length - 1; i >= 0; i--) {
    if (raw[i]) {
      candleStart = i;
      if (++candleCount === CANDLE_DAYS) break;
    }
  }
  // Versioned, positive pairwise sums use window-relative indices, so shifting
  // the 350-day left boundary never changes a surviving window's sum order.
  // No historical prefix subtraction or infinite rolling accumulator.
  const amountSum = canonicalWindowSums(raw, "amount");
  const volumeSum = canonicalWindowSums(raw, "vol");
  const breaks = raw.map((d, i) =>
    d && i > 0 && raw[i - 1]
      ? Math.abs(d.preClose - raw[i - 1]!.close) > 0.0010000001
      : false
  );
  let lastInvalid = -1;
  for (let i = 0; i < raw.length; i++) {
    const d = raw[i];
    const averageOffset = i * ALL_PERIODS.length;
    // Including the first window date's reference-price break remains invalid.
    if (!d || breaks[i]) lastInvalid = i;
    if (!poisoned)
      for (const period of ALL_PERIODS) {
        const start = i - period + 1;
        if (start < 0 || start <= lastInvalid) continue;
        const amount = amountSum(start, period);
        const vol = volumeSum(start, period);
        const avg = (10 * amount) / vol;
        if (Number.isFinite(avg) && avg > 0)
          days.averages[averageOffset + PERIOD_INDEX[period]] = avg;
      }
    days.close[i] = d?.close ?? NaN;
    days.pct[i] = d?.pct ?? NaN;
    if (d && !poisoned && i >= candleStart)
      days.candles.push({
        date: formatStockComparisonDate(dates[i])!,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        averageOffset,
      });
  }
  return days;
}

function projectedDays(scratch: ScratchDay): Day {
  const last = scratch.close.length - 1;
  const averages = new Float64Array(ALL_PERIODS.length).fill(NaN);
  if (last >= 0)
    for (let p = 0; p < ALL_PERIODS.length; p++)
      averages[p] = scratch.averages[last * ALL_PERIODS.length + p];
  // Explicit owning allocation/copy: subarray would retain the full 350x7
  // scratch ArrayBuffer through every source candle and cached ranking.
  const candleAverages = new Float64Array(
    scratch.candles.length * ALL_PERIODS.length
  );
  const candles = scratch.candles.map((candle, i) => {
    const averageOffset = i * ALL_PERIODS.length;
    for (let p = 0; p < ALL_PERIODS.length; p++)
      candleAverages[averageOffset + p] =
        scratch.averages[candle.averageOffset + p];
    return { ...candle, averages: candleAverages, averageOffset };
  });
  return {
    close: last >= 0 ? scratch.close[last] : NaN,
    pct:
      last >= 0 && !Number.isNaN(scratch.pct[last]) ? scratch.pct[last] : null,
    averages,
    candles,
  };
}

function averageOf(
  averages: CompactAverages,
  offset: number,
  period: StockMAMonitorPeriod
): number | undefined {
  const value = averages[offset + PERIOD_INDEX[period]];
  return Number.isNaN(value) ? undefined : value;
}

async function discoverDates(
  db: StockComparisonDb,
  cutoff: string
): Promise<string[]> {
  // No functions on the indexed varchar date. Discover the real market dates
  // globally, not a board's last available date or the requested calendar date.
  const found = await selectRows(
    db,
    `
    SELECT DISTINCT d.trade_date
    FROM ts_daily AS d FORCE INDEX (idx_trade_date)
    WHERE d.trade_date <= ?
    ORDER BY d.trade_date DESC
    LIMIT ${HISTORY_DAYS}
  `,
    [cutoff]
  );
  const descending = found.map(row => {
    if (!isValidAShareTradeDate(row.trade_date) || row.trade_date > cutoff)
      throw new TypeError("Invalid stock MA source date");
    return row.trade_date;
  });
  if (
    descending.length > HISTORY_DAYS ||
    descending.some((date, i) => i > 0 && date >= descending[i - 1])
  ) {
    throw new TypeError("Invalid stock MA source date ordering/size");
  }
  return descending.reverse();
}

async function queryBasics(db: StockComparisonDb): Promise<Row[]> {
  const basics = await selectRows(
    db,
    `
    SELECT b.ts_code, b.name, b.list_status
    FROM ts_stock_basic AS b
    WHERE b.list_status = 'L'
      AND (b.ts_code LIKE '6%' OR b.ts_code LIKE '0%'
           OR b.ts_code LIKE '300%' OR b.ts_code LIKE '301%')
    ORDER BY b.ts_code ASC
  `
  );
  const seenCodes = new Set<string>();
  for (const row of basics) {
    if (
      typeof row.ts_code !== "string" ||
      typeof row.name !== "string" ||
      typeof row.list_status !== "string" ||
      seenCodes.has(row.ts_code)
    ) {
      throw new TypeError("Invalid stock MA basic identity");
    }
    seenCodes.add(row.ts_code);
  }
  return basics;
}

function basicIdentities(basics: Row[]): string[][] {
  return basics
    .map(row => [
      row.ts_code as string,
      row.name as string,
      row.list_status as string,
    ])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function utcTimestamp(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value.replace("Z", ".000Z")
  ) {
    throw new TypeError("Invalid stock MA source timestamp");
  }
  return value;
}

function unsignedInteger(value: unknown): string {
  if (
    (typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "bigint") ||
    !/^\d+$/.test(String(value)) ||
    (typeof value === "number" && !Number.isSafeInteger(value))
  ) {
    throw new TypeError("Invalid stock MA fingerprint integer");
  }
  // Preserve the full SUM(CRC32) precision; do not round via Number.
  return BigInt(value).toString();
}

async function queryProbe(
  db: StockComparisonDb,
  cutoff: string
): Promise<Probe> {
  const tables = await selectRows(
    db,
    `
    SELECT t.TABLE_NAME AS table_name,
           DATE_FORMAT(
             DATE_SUB(t.UPDATE_TIME, INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND),
             '%Y-%m-%dT%H:%i:%sZ'
           ) AS table_updated_at
    FROM information_schema.TABLES AS t
    WHERE t.TABLE_SCHEMA = DATABASE()
      AND t.TABLE_NAME IN ('ts_daily', 'ts_stock_basic')
    ORDER BY t.TABLE_NAME ASC
  `
  );
  const epochs: Probe["epochs"] = [null, null];
  const seen = new Set<string>();
  for (const row of tables) {
    const name = row.table_name;
    if ((name !== "ts_daily" && name !== "ts_stock_basic") || seen.has(name)) {
      throw new TypeError("Invalid stock MA table version result");
    }
    seen.add(name);
    epochs[name === "ts_daily" ? 0 : 1] = utcTimestamp(row.table_updated_at);
  }
  // InnoDB may expose NULL UPDATE_TIME for the small stock-basic table. Fall
  // back only that table to a small identity hash, not the 500k daily checksum.
  const basics = epochs[1] === null ? await queryBasics(db) : undefined;
  return {
    dates: await discoverDates(db, cutoff),
    epochs,
    ...(basics
      ? {
          basics,
          basicsKey: createHash("sha256")
            .update(JSON.stringify(basicIdentities(basics)))
            .digest("hex"),
        }
      : {}),
    observedAt: Date.now(),
  };
}

function sameDates(a: Probe, b: Probe): boolean {
  return (
    a.dates.length === b.dates.length &&
    a.dates.every((date, i) => date === b.dates[i])
  );
}

function sameProbe(a: Probe, b: Probe): boolean {
  return (
    sameDates(a, b) &&
    a.epochs.every((epoch, i) => epoch === b.epochs[i]) &&
    a.basicsKey === b.basicsKey
  );
}

function reliableEpoch(cache: Cache, probe: Probe): boolean {
  return (
    cache.epochReliable &&
    probe.epochs[0] !== null &&
    probe.epochs.every(
      epoch => epoch === null || Date.parse(epoch) <= probe.observedAt
    )
  );
}

async function queryFingerprint(
  db: StockComparisonDb,
  dates: string[],
  discoveredBasics?: Row[]
): Promise<Fingerprint> {
  const basics = discoveredBasics ?? (await queryBasics(db));
  if (!dates.length) throw new Error("No cached stock MA source available");
  // Only one aggregate row per market date crosses the DB boundary. Include
  // every raw field and updated_at, including invalid/duplicate daily records.
  const checksum = `CRC32(JSON_ARRAY(d.ts_code, d.open, d.high, d.low, d.close,
    d.pre_close, d.pct_chg, d.vol, d.amount, d.updated_at))`;
  const rows = await selectRows(
    db,
    `
    SELECT d.trade_date, COUNT(*) AS row_count,
           DATE_FORMAT(
             DATE_SUB(MAX(d.updated_at), INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND),
             '%Y-%m-%dT%H:%i:%sZ'
           ) AS data_updated_at,
           SUM(${checksum}) AS data_checksum,
           BIT_XOR(${checksum}) AS data_xor
    FROM ts_daily AS d FORCE INDEX (idx_trade_date)
    WHERE d.trade_date IN (${dates.map(() => "?").join(", ")})
    GROUP BY d.trade_date
    ORDER BY d.trade_date ASC
  `,
    dates
  );
  if (rows.length !== dates.length)
    throw new TypeError("Invalid stock MA fingerprint date coverage");
  let newestUpdateAt: number | null = null;
  const metadata = rows.map((row, i) => {
    if (!isValidAShareTradeDate(row.trade_date) || row.trade_date !== dates[i])
      throw new TypeError("Invalid stock MA fingerprint date ordering");
    const count = unsignedInteger(row.row_count);
    if (count === "0") throw new TypeError("Empty stock MA fingerprint date");
    const stamp = utcTimestamp(row.data_updated_at);
    if (stamp !== null)
      newestUpdateAt = Math.max(newestUpdateAt ?? -Infinity, Date.parse(stamp));
    return [
      row.trade_date,
      count,
      stamp,
      unsignedInteger(row.data_checksum),
      unsignedInteger(row.data_xor),
    ];
  });
  return {
    version: createHash("sha256")
      .update(JSON.stringify([dates, metadata, basicIdentities(basics)]))
      .digest("hex"),
    basics,
    dataUpdatedAt: metadata.at(-1)![2] as string | null,
    newestUpdateAt,
    metadata,
  };
}

async function querySource(
  db: StockComparisonDb,
  cutoff: string,
  dates: string[],
  fingerprint: Fingerprint,
  transaction?: StockMAWriteTransaction,
  shardIdentities?: CheckpointMetadata["shards"]
): Promise<Source> {
  const identities: { code: string; name: string; board: Board }[] = [];
  for (const row of fingerprint.basics) {
    const code = row.ts_code as string;
    const board = boardOf(code);
    if (row.list_status !== "L" || !board) continue;
    identities.push({ code, name: row.name as string, board });
  }
  const stocks: Stock[] = [];
  const ranked: Ranked[] = COMBINATIONS.map(() => ({
    items: [],
    eligible: counts(),
    excluded: counts(),
  }));
  const ordinals = new Map(dates.map((date, i) => [date, i]));
  // Each serial batch reads all the same discovered dates, without row LIMITs
  // or shortened warm-up. uk_code_date prevents a full-market scan per batch.
  for (
    let offset = 0;
    offset < identities.length;
    offset += SOURCE_BATCH_STOCKS
  ) {
    const batch = identities.slice(offset, offset + SOURCE_BATCH_STOCKS);
    const compact: MACompactStock[] = [];
    const byCode = new Map(
      batch.map(identity => [
        identity.code,
        {
          ...identity,
          raw: Array<Daily | null>(dates.length).fill(null),
          seen: new Set<number>(),
          poisoned: false,
          normalized: transaction
            ? emptyCompact(identity.code, dates.length)
            : undefined,
        },
      ])
    );
    if (dates.length) {
      const start = dates[0],
        end = dates[dates.length - 1];
      const rows = await selectRows(
        db,
        `
        SELECT d.ts_code, d.trade_date, d.open, d.high, d.low, d.close,
               d.pre_close, d.pct_chg, d.vol, d.amount
        FROM ts_daily AS d FORCE INDEX (uk_code_date)
        INNER JOIN ts_stock_basic AS b ON b.ts_code = d.ts_code
        WHERE d.trade_date >= ? AND d.trade_date <= ?
          AND d.trade_date IN (${dates.map(() => "?").join(", ")})
          AND d.ts_code IN (${batch.map(() => "?").join(", ")})
          AND b.list_status = 'L'
          AND (b.ts_code LIKE '6%' OR b.ts_code LIKE '0%'
               OR b.ts_code LIKE '300%' OR b.ts_code LIKE '301%')
      `,
        [start, end, ...dates, ...batch.map(identity => identity.code)]
      );
      for (const row of rows) {
        if (typeof row.ts_code !== "string")
          throw new TypeError("Invalid stock MA daily identity");
        const stock = byCode.get(row.ts_code);
        if (!stock) continue;
        const index = isValidAShareTradeDate(row.trade_date)
          ? ordinals.get(row.trade_date)
          : undefined;
        // An unlocatable corrupt date cannot reliably be assigned a window;
        // exclude this stock conservatively rather than silently discarding it.
        if (index === undefined) {
          stock.poisoned = true;
          continue;
        }
        if (stock.seen.has(index)) {
          stock.raw[index] = null;
          if (stock.normalized) {
            stock.normalized.flags[index] = 3;
            stock.normalized.values.fill(NaN, index * 8, index * 8 + 8);
          }
          continue;
        }
        stock.seen.add(index);
        stock.raw[index] = dailyOf(row);
        if (stock.normalized) normalizeInto(stock.normalized, index, row);
      }
      // Release mysql2's full batch row array before constructing cached Days.
      rows.length = 0;
    }
    for (const [code, stock] of Array.from(byCode)) {
      stocks.push(
        computedStock(
          { code, name: stock.name, board: stock.board },
          stock.raw,
          dates,
          stock.poisoned,
          ranked,
          stock.normalized
            ? states => {
                stock.normalized!.states = packMAStates(states);
              }
            : undefined
        )
      );
      if (stock.normalized) {
        stock.normalized.poisoned = stock.poisoned;
        compact.push(stock.normalized);
      }
      // Drop raw OHLC/volume/amount and duplicate guards stock by stock.
      byCode.delete(code);
    }
    if (transaction) {
      const name = shardName(offset / SOURCE_BATCH_STOCKS);
      await transaction.writeShard(name, serialize(compact));
      shardIdentities!.push({ name, codes: batch.map(s => s.code) });
    }
  }
  const source: Source = {
    cutoff,
    dates,
    stocks,
    ranked,
    fetchedAt: new Date().toISOString(),
    dataUpdatedAt: fingerprint.dataUpdatedAt,
  };
  sourceVersions.set(source, fingerprint.version);
  return source;
}

function shardName(index: number): string {
  return `shard-${String(index).padStart(6, "0")}`;
}
function emptyCompact(code: string, n: number): MACompactStock {
  return {
    code,
    values: new Float64Array(n * 8).fill(NaN),
    flags: new Uint8Array(n),
    states: new Uint8Array(Math.ceil((n * 6) / 4)),
    poisoned: false,
  };
}
function normalizeInto(stock: MACompactStock, index: number, row: Row): void {
  stock.flags[index] = dailyOf(row) ? 2 : 1;
  const fields = [
    "open",
    "high",
    "low",
    "close",
    "pre_close",
    "vol",
    "amount",
    "pct_chg",
  ];
  fields.forEach((field, p) => {
    stock.values[index * 8 + p] = finite(row[field]) ?? NaN;
  });
}
async function queryCompact(
  db: StockComparisonDb,
  codes: string[],
  dates: string[]
): Promise<Map<string, MACompactStock>> {
  const found = new Map(
    codes.map(code => [code, emptyCompact(code, dates.length)])
  );
  if (!codes.length || !dates.length) return found;
  const ordinals = new Map(dates.map((d, i) => [d, i]));
  const rows = await selectRows(
    db,
    `
    SELECT d.ts_code, d.trade_date, d.open, d.high, d.low, d.close,
           d.pre_close, d.pct_chg, d.vol, d.amount
    FROM ts_daily AS d FORCE INDEX (uk_code_date)
    INNER JOIN ts_stock_basic AS b ON b.ts_code = d.ts_code
    WHERE d.trade_date >= ? AND d.trade_date <= ?
      AND d.trade_date IN (${dates.map(() => "?").join(", ")})
      AND d.ts_code IN (${codes.map(() => "?").join(", ")})
      AND b.list_status = 'L'
      AND (b.ts_code LIKE '6%' OR b.ts_code LIKE '0%'
           OR b.ts_code LIKE '300%' OR b.ts_code LIKE '301%')
  `,
    [dates[0], dates.at(-1), ...dates, ...codes]
  );
  for (const row of rows) {
    if (typeof row.ts_code !== "string")
      throw new TypeError("Invalid stock MA daily identity");
    const stock = found.get(row.ts_code);
    if (!stock) continue;
    const index = isValidAShareTradeDate(row.trade_date)
      ? ordinals.get(row.trade_date)
      : undefined;
    if (index === undefined) {
      stock.poisoned = true;
      continue;
    }
    if (stock.flags[index]) {
      stock.flags[index] = 3;
      stock.values.fill(NaN, index * 8, index * 8 + 8);
    } else normalizeInto(stock, index, row);
  }
  rows.length = 0;
  return found;
}
function identityOf(row: Row): Omit<Stock, "days"> | null {
  const code = row.ts_code as string,
    board = boardOf(code);
  return row.list_status === "L" && board
    ? { code, name: row.name as string, board }
    : null;
}
function appendRankings(
  stock: Stock,
  states: Uint8Array,
  dates: string[],
  rankings: Ranked[]
): void {
  for (let c = 0; c < COMBINATIONS.length; c++) {
    const tail = maTail(states, dates, c),
      ranked = rankings[c];
    const counter = tail.state === 0 ? ranked.excluded : ranked.eligible;
    counter.all++;
    counter[stock.board]++;
    if (tail.state !== 2) continue;
    ranked.items.push({
      board: stock.board,
      tsCode: stock.code,
      name: stock.name,
      close: stock.days.close,
      changePercent: stock.days.pct,
      averages: stock.days.averages,
      averageOffset: 0,
      candles: stock.days.candles,
      consecutiveDays: tail.consecutiveDays,
      consecutiveIsLowerBound: tail.lowerBound,
      qualifiedSince: formatStockComparisonDate(tail.since)!,
    });
  }
}
function ownCandles(candles: SourceCandle[]): SourceCandle[] {
  const averages = new Float64Array(candles.length * ALL_PERIODS.length).fill(
    NaN
  );
  return candles.map((candle, i) => {
    for (let p = 0; p < ALL_PERIODS.length; p++)
      averages[i * ALL_PERIODS.length + p] =
        candle.averages[candle.averageOffset + p];
    return { ...candle, averages, averageOffset: i * ALL_PERIODS.length };
  });
}
function bootstrapCompact(
  identity: Omit<Stock, "days">,
  compact: MACompactStock,
  dates: string[],
  rankings: Ranked[]
): Stock {
  return computedStock(
    identity,
    decodeMARaw(compact, dates.length),
    dates,
    compact.poisoned,
    rankings,
    states => {
      compact.states = packMAStates(states);
    }
  );
}
function advanceCompact(
  identity: Omit<Stock, "days">,
  compact: MACompactStock,
  oldStock: Stock,
  oldDates: string[],
  newDates: string[],
  appended: MACompactStock | undefined,
  rankings: Ranked[]
): Stock {
  let raw = decodeMARaw(compact, oldDates.length),
    states = unpackMAStates(compact.states, oldDates.length);
  let dates = oldDates.slice(),
    flags = Array.from(compact.flags),
    values = Array.from(compact.values);
  const newRaw = appended ? decodeMARaw(appended, newDates.length) : [];
  let days = oldStock.days;
  for (const [j, date] of Array.from(newDates.entries())) {
    raw.push(newRaw[j] ?? null);
    flags.push(appended?.flags[j] ?? 0);
    for (let p = 0; p < 8; p++) values.push(appended?.values[j * 8 + p] ?? NaN);
    dates.push(date);
    const dropped = dates.length > HISTORY_DAYS;
    if (dropped) {
      dates.shift();
      raw.shift();
      flags.shift();
      values.splice(0, 8);
    }
    const update = advanceMAStates(states, raw, dropped);
    states = update.states;
    let candles = ownCandles(
      days.candles.filter(c => c.date.replace(/-/g, "") >= dates[0])
    );
    const byDate = new Map(
      dates.map((d, i) => [formatStockComparisonDate(d)!, i])
    );
    for (const candle of candles) {
      const i = byDate.get(candle.date)!;
      for (let p = 0; p < ALL_PERIODS.length; p++) {
        if (i < ALL_PERIODS[p] - 1)
          candle.averages[candle.averageOffset + p] = NaN;
        else if (update.corrections.has(i))
          candle.averages[candle.averageOffset + p] =
            update.corrections.get(i)![p];
      }
    }
    const latest = raw.at(-1);
    if (latest)
      candles.push({
        date: formatStockComparisonDate(date)!,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        averages: update.latest,
        averageOffset: 0,
      });
    candles = ownCandles(candles.slice(-CANDLE_DAYS));
    days = {
      close: latest?.close ?? NaN,
      pct: latest?.pct ?? null,
      averages: update.latest,
      candles,
    };
  }
  compact.values = Float64Array.from(values);
  compact.flags = Uint8Array.from(flags);
  compact.states = packMAStates(states);
  const stock = { ...identity, days };
  appendRankings(stock, states, dates, rankings);
  return stock;
}
async function queryIncrementalSource(
  db: StockComparisonDb,
  cutoff: string,
  dates: string[],
  fingerprint: Fingerprint,
  current: NonNullable<Cache["source"]>,
  persistence: Persistence,
  transaction: StockMAWriteTransaction,
  shards: CheckpointMetadata["shards"],
  diagnostics: {
    mode: string;
    newDays: number;
    repairedStocks: number;
    initializedStocks: number;
  }
): Promise<Source> {
  const head = persistence.head!,
    metadata = persistence.metadata!;
  const delta = compareMADates(
    current.value.dates,
    dates,
    metadata.fingerprint.metadata,
    fingerprint.metadata
  );
  if (delta.bootstrap)
    return querySource(db, cutoff, dates, fingerprint, transaction, shards);
  diagnostics.mode = "metadata";
  diagnostics.newDays = delta.newDates.length;
  const store = await persistence.store;
  const identities = new Map(
    fingerprint.basics
      .map(identityOf)
      .filter((x): x is Omit<Stock, "days"> => !!x)
      .map(x => [x.code, x])
  );
  const oldStocks = new Map(
    current.value.stocks.map(stock => [stock.code, stock])
  );
  const stocks: Stock[] = [],
    ranked: Ranked[] = COMBINATIONS.map(() => ({
      items: [],
      eligible: counts(),
      excluded: counts(),
    }));
  const processed = new Set<string>();
  let shardIndex = 0;
  for (const prior of metadata.shards) {
    const decoded: unknown = deserialize(
      Buffer.from(await store.readShard(head.generation, prior.name))
    );
    if (
      !Array.isArray(decoded) ||
      decoded.length > SOURCE_BATCH_STOCKS ||
      decoded.map(s => s?.code).join() !== prior.codes.join()
    )
      throw new TypeError("Invalid stock MA shard identities");
    const batch = (decoded as MACompactStock[]).filter(s =>
      identities.has(s.code)
    );
    if (!batch.length) continue;
    const codes = batch.map(s => s.code);
    const revisions = delta.changedDates.length
      ? await queryCompact(db, codes, delta.changedDates)
      : undefined;
    const additions = delta.newDates.length
      ? await queryCompact(db, codes, delta.newDates)
      : undefined;
    const repair = batch.filter(s => {
      // Unlocatable corruption is retried conservatively, never permanent poison.
      if (
        s.poisoned ||
        revisions?.get(s.code)?.poisoned ||
        additions?.get(s.code)?.poisoned
      )
        return true;
      return delta.changedDates.some(
        (date, i) =>
          !sameMANormalizedDay(
            s,
            current.value.dates.indexOf(date),
            revisions!.get(s.code)!,
            i
          )
      );
    });
    diagnostics.repairedStocks += repair.length;
    const repaired = repair.length
      ? await queryCompact(
          db,
          repair.map(s => s.code),
          dates
        )
      : new Map<string, MACompactStock>();
    for (let i = 0; i < batch.length; i++) {
      const compact = batch[i],
        identity = identities.get(compact.code)!;
      decodeMARaw(compact, current.value.dates.length); // validate even metadata-only reuse
      const replacement = repaired.get(compact.code);
      if (replacement) {
        batch[i] = replacement;
        stocks.push(bootstrapCompact(identity, replacement, dates, ranked));
      } else
        stocks.push(
          advanceCompact(
            identity,
            compact,
            oldStocks.get(compact.code)!,
            current.value.dates,
            delta.newDates,
            additions?.get(compact.code),
            ranked
          )
        );
      processed.add(compact.code);
    }
    const name = shardName(shardIndex++);
    await transaction.writeShard(name, serialize(batch));
    shards.push({ name, codes });
  }
  const newcomers = Array.from(identities.values()).filter(
    s => !processed.has(s.code)
  );
  diagnostics.initializedStocks = newcomers.length;
  for (
    let offset = 0;
    offset < newcomers.length;
    offset += SOURCE_BATCH_STOCKS
  ) {
    const batch = newcomers.slice(offset, offset + SOURCE_BATCH_STOCKS),
      codes = batch.map(s => s.code);
    const raw = await queryCompact(db, codes, dates);
    for (const identity of batch)
      stocks.push(
        bootstrapCompact(identity, raw.get(identity.code)!, dates, ranked)
      );
    const name = shardName(shardIndex++);
    await transaction.writeShard(name, serialize(Array.from(raw.values())));
    shards.push({ name, codes });
  }
  diagnostics.mode = diagnostics.repairedStocks
    ? "repair"
    : diagnostics.newDays
      ? "increment"
      : diagnostics.initializedStocks
        ? "stock-init"
        : "metadata";
  const source: Source = {
    cutoff,
    dates,
    stocks,
    ranked,
    fetchedAt: new Date().toISOString(),
    dataUpdatedAt: fingerprint.dataUpdatedAt,
  };
  sourceVersions.set(source, fingerprint.version);
  return source;
}
async function restoreCheckpoint(cache: Cache, cutoff: string): Promise<void> {
  const persistence = cache.persistence;
  if (!persistence) return;
  if (!persistence.restored)
    persistence.restored = (async () => {
      const head = await (await persistence.store).read();
      if (!head) return;
      const meta = head.metadata as CheckpointMetadata;
      const source = deserialize(Buffer.from(head.light)) as Source;
      if (
        !meta ||
        meta.engine !== STOCK_MA_ALGORITHM_VERSION ||
        !/^[a-f0-9]{64}$/.test(meta.version) ||
        !meta.probe ||
        !Array.isArray(meta.probe.dates) ||
        !Array.isArray(meta.shards) ||
        !meta.fingerprint ||
        !Array.isArray(meta.fingerprint.metadata) ||
        meta.fingerprint.version !== meta.version ||
        !source ||
        !Array.isArray(source.dates) ||
        !source.dates.length ||
        source.dates.length > HISTORY_DAYS ||
        source.dates.some(
          (d, i) =>
            !isValidAShareTradeDate(d) || (i > 0 && d <= source.dates[i - 1])
        ) ||
        source.dates.join() !== meta.probe.dates.join() ||
        !Number.isFinite(Date.parse(source.fetchedAt)) ||
        !Array.isArray(source.stocks) ||
        !Array.isArray(source.ranked) ||
        source.ranked.length !== COMBINATIONS.length
      )
        throw new TypeError("Invalid stock MA lightweight checkpoint");
      if (
        !Number.isFinite(meta.fingerprintAt) ||
        meta.fingerprintAt < 0 ||
        !Number.isFinite(meta.probe.observedAt) ||
        !Array.isArray(meta.probe.epochs) ||
        meta.probe.epochs.length !== 2 ||
        meta.probe.epochs.some(
          epoch => epoch !== null && utcTimestamp(epoch) !== epoch
        ) ||
        meta.fingerprint.metadata.length !== source.dates.length ||
        meta.fingerprint.metadata.some(
          (row, i) =>
            !Array.isArray(row) ||
            row.length !== 5 ||
            row[0] !== source.dates[i] ||
            unsignedInteger(row[1]) === "0" ||
            utcTimestamp(row[2]) !== row[2] ||
            unsignedInteger(row[3]) !== row[3] ||
            unsignedInteger(row[4]) !== row[4]
        )
      )
        throw new TypeError("Invalid stock MA checkpoint metadata");
      if (source.dates.some(date => date > cutoff))
        throw new RangeError(
          "Cached stock MA source exceeds current close cutoff"
        );
      const codes = meta.shards.flatMap(s => s.codes);
      if (
        codes.length !== new Set(codes).size ||
        codes.length !== source.stocks.length ||
        meta.shards.some(
          s =>
            !head.shardNames.includes(s.name) ||
            s.codes.length > SOURCE_BATCH_STOCKS
        ) ||
        source.stocks.some(
          s =>
            !codes.includes(s.code) ||
            s.days?.averages?.length !== 7 ||
            s.days.candles.length > CANDLE_DAYS ||
            s.days.candles.some(c => c.averages.length > CANDLE_DAYS * 7)
        )
      )
        throw new TypeError("Invalid stock MA checkpoint light identities");
      // v8.deserialize can give typed views into its input blob. Re-own every
      // light buffer, then reconnect shared ranking references to those owners.
      source.stocks = source.stocks.map(stock => ({
        ...stock,
        days: {
          ...stock.days,
          averages: Float64Array.from(stock.days.averages),
          candles: ownCandles(stock.days.candles),
        },
      }));
      const stocks = new Map(source.stocks.map(stock => [stock.code, stock]));
      source.ranked = source.ranked.map(ranked => ({
        ...ranked,
        items: ranked.items.map(item => {
          const stock = stocks.get(item.tsCode);
          if (!stock)
            throw new TypeError("Invalid stock MA checkpoint ranking identity");
          return {
            ...item,
            averages: stock.days.averages,
            averageOffset: 0,
            candles: stock.days.candles,
          };
        }),
      }));
      source.warning = undefined;
      sourceVersions.set(source, meta.version);
      persistence.head = { ...head, light: new Uint8Array(0) };
      persistence.metadata = meta;
      cache.source = {
        value: source,
        version: meta.version,
        probe: meta.probe,
        fingerprintAt: meta.fingerprintAt,
      };
      cache.epochReliable = meta.epochReliable === true;
      cache.nextProbeAt = 0;
      console.info("[StockMA] checkpoint restored", {
        asOf: formatStockComparisonDate(source.dates.at(-1)),
      });
    })();
  await persistence.restored;
}

class SourceVersionPendingError extends Error {
  constructor() {
    super("Stock MA source version is not yet stable");
  }
}

function previousSource(cache: Cache, warning: string): Source {
  if (!cache.source) throw new SourceVersionPendingError();
  return sourceCopy(cache.source.value, warning);
}

async function refreshSource(
  db: StockComparisonDb,
  cache: Cache,
  cutoff: string
): Promise<Source> {
  const probe = await queryProbe(db, cutoff);
  const current = cache.source;
  if (
    current &&
    probe.epochs.some((epoch, i) => {
      const previous = current.probe.epochs[i];
      return epoch !== null && previous !== null && epoch < previous;
    })
  ) {
    cache.epochReliable = false;
  }
  if (
    current &&
    reliableEpoch(cache, probe) &&
    sameProbe(current.probe, probe) &&
    probe.observedAt - current.fingerprintAt < FINGERPRINT_INTERVAL_MS
  ) {
    current.probe = probe;
    cache.candidate = undefined;
    return sourceCopy(current.value);
  }

  const fingerprint = await queryFingerprint(db, probe.dates, probe.basics);
  const afterFingerprint = await queryProbe(db, cutoff);
  if (!sameProbe(probe, afterFingerprint)) {
    cache.candidate = undefined;
    return previousSource(cache, UPDATING_WARNING);
  }
  if (current && fingerprint.version === current.version) {
    // A global table epoch may change for a date outside our 350-day source.
    // Refresh the gate, not OHLC/computed days/rankings or genuine fetchedAt.
    current.probe = afterFingerprint;
    current.fingerprintAt = Date.now();
    cache.candidate = undefined;
    return sourceCopy(current.value);
  }
  if (current && sameProbe(current.probe, probe)) {
    // We observed a content revision which UPDATE_TIME did not expose.
    // Permanently fall back to fingerprints for this executor's lifetime.
    cache.epochReliable = false;
  }

  const candidate = cache.candidate;
  const stableCandidate =
    candidate &&
    candidate.version === fingerprint.version &&
    sameProbe(candidate.probe, probe);
  if (!stableCandidate) {
    cache.candidate = {
      version: fingerprint.version,
      probe: afterFingerprint,
      firstObservedAt: afterFingerprint.observedAt,
    };
  }
  const observedStable =
    stableCandidate &&
    afterFingerprint.observedAt - candidate.firstObservedAt >= STABILITY_MS;
  // Cold start can use already quiet existing data, but elapsed close time is
  // never a publication/collector-completion signal. Prefer table epochs;
  // without them, use daily update age plus the before/after fingerprints.
  const quietSince = reliableEpoch(cache, probe)
    ? Math.max(
        ...probe.epochs
          .filter(epoch => epoch !== null)
          .map(epoch => Date.parse(epoch!))
      )
    : fingerprint.newestUpdateAt;
  const coldQuiet =
    !current &&
    quietSince !== null &&
    probe.observedAt - quietSince >= STABILITY_MS;
  if (!observedStable && !coldQuiet)
    return previousSource(cache, UPDATING_WARNING);

  const persistence = cache.persistence;
  const transaction = persistence
    ? await (
        await persistence.store
      ).begin(persistence.head?.generation ?? null)
    : undefined;
  const shards: CheckpointMetadata["shards"] = [];
  const diagnostics = {
    mode: "bootstrap",
    newDays: 0,
    repairedStocks: 0,
    initializedStocks: 0,
  };
  try {
    const value =
      transaction && persistence?.head && persistence.metadata && current
        ? await queryIncrementalSource(
            db,
            cutoff,
            probe.dates,
            fingerprint,
            current,
            persistence,
            transaction,
            shards,
            diagnostics
          )
        : await querySource(
            db,
            cutoff,
            probe.dates,
            fingerprint,
            transaction,
            shards
          );
    // Verify content on BOTH sides of the heavy read, even with non-null epochs:
    // updated_at and UPDATE_TIME only have seconds precision, and no manifest
    // exists. An unstable or failed read must never replace a successful source.
    const verified = await queryFingerprint(db, probe.dates);
    const afterSource = await queryProbe(db, cutoff);
    if (
      verified.version !== fingerprint.version ||
      !sameProbe(afterFingerprint, afterSource)
    ) {
      if (
        verified.version !== fingerprint.version &&
        sameProbe(afterFingerprint, afterSource)
      ) {
        cache.epochReliable = false;
      }
      await transaction?.abort();
      cache.candidate = undefined;
      return previousSource(cache, UPDATING_WARNING);
    }
    const fingerprintAt = Date.now();
    if (transaction && persistence) {
      const { basics: _basics, ...compactFingerprint } = fingerprint;
      const { basics: _probeBasics, ...compactProbe } = afterSource;
      const metadata: CheckpointMetadata = {
        engine: STOCK_MA_ALGORITHM_VERSION,
        version: fingerprint.version,
        probe: compactProbe,
        fingerprintAt,
        epochReliable: cache.epochReliable,
        fingerprint: compactFingerprint,
        shards,
      };
      await transaction.writeLight(serialize(value));
      // The before/after DB checks above precede the ONLY atomic publication.
      const previousGeneration = persistence.head?.generation;
      const head = await transaction.commit(metadata);
      persistence.head = { ...head, light: new Uint8Array(0) };
      persistence.metadata = metadata;
      if (previousGeneration && previousGeneration !== head.generation)
        (await persistence.store).release(previousGeneration);
      console.info("[StockMA] checkpoint committed", {
        asOf: formatStockComparisonDate(value.dates.at(-1)),
        ...diagnostics,
      });
    }
    cache.source = {
      value,
      version: fingerprint.version,
      probe: afterSource,
      fingerprintAt,
    };
    cache.candidate = undefined;
    return value;
  } catch (error) {
    await transaction?.abort().catch(() => undefined);
    throw error;
  }
}

async function getSource(
  db: StockComparisonDb,
  cache: Cache,
  cutoff: string
): Promise<Source> {
  await restoreCheckpoint(cache, cutoff);
  if (cache.source?.value.dates.some(date => date > cutoff))
    throw new RangeError("Cached stock MA source exceeds current close cutoff");
  for (;;) {
    const pending = cache.sourceInFlight.get(cutoff);
    if (pending)
      return cache.persistence && cache.source ? cache.source.value : pending;
    if (!cache.sourceInFlight.size) break;
    if (cache.persistence && cache.source) return cache.source.value;
    // Also serialize different cutoffs, never queue parallel heavy DB scans.
    await Promise.race(
      Array.from(cache.sourceInFlight.values(), p =>
        p.then(
          () => undefined,
          () => undefined
        )
      )
    );
  }
  if (!cache.source && cache.candidate && Date.now() < cache.nextProbeAt)
    throw new SourceVersionPendingError();
  // No cutoff key in the reusable source. A changed cutoff only discovers
  // actual dates on the next on-demand probe, never expires a market version.
  if (
    cache.source &&
    cache.source.value.dates.every(date => date <= cutoff) &&
    Date.now() < cache.nextProbeAt
  ) {
    return cache.source.value;
  }
  const pending = refreshSource(db, cache, cutoff)
    .then(value => {
      if (value.dates.some(date => date > cutoff))
        throw new Error("Cached stock MA source exceeds current close cutoff");
      if (cache.source) cache.source.value.warning = value.warning;
      return value;
    })
    .catch(async error => {
      if (!(error instanceof SourceVersionPendingError))
        cache.candidate = undefined;
      if (
        cache.persistence &&
        cache.source &&
        /WRITER_BUSY|CAS_MISMATCH/.test(String(error?.message))
      ) {
        cache.persistence.restored = undefined;
        await restoreCheckpoint(cache, cutoff).catch(() => undefined);
      }
      if (!cache.source || cache.source.value.dates.some(date => date > cutoff))
        throw error;
      cache.source.value.warning = CHECK_FAILED_WARNING;
      return previousSource(cache, CHECK_FAILED_WARNING);
    })
    .finally(() => {
      cache.nextProbeAt = Date.now() + PROBE_INTERVAL_MS;
      cache.sourceInFlight.delete(cutoff);
    });
  cache.sourceInFlight.set(cutoff, pending);
  if (cache.persistence && cache.source) {
    // Requests discover versions on demand; this is NOT a daily collector or
    // timer. Always handle asynchronous refresh rejection (shutdown/reconfigure).
    void pending.catch(() => undefined);
    return cache.source.value;
  }
  return pending;
}

function judgment(
  day: ScratchDay,
  index: number,
  periods: readonly StockMAMonitorPeriod[]
): boolean | null {
  const offset = index * ALL_PERIODS.length;
  if (
    Number.isNaN(day.close[index]) ||
    periods.some(p => averageOf(day.averages, offset, p) === undefined)
  )
    return null;
  let previous = day.close[index];
  for (const period of periods) {
    const average = averageOf(day.averages, offset, period)!;
    // Do not let floating-point summation turn mathematically equal prices
    // into a strict ordering. No display-rounding is used for screening.
    const ulps =
      32 * Number.EPSILON * Math.max(Math.abs(previous), Math.abs(average));
    if (previous - average <= ulps) return false;
    previous = average;
  }
  return true;
}

function counts(): Record<StockMAMonitorMarket, number> {
  return { all: 0, SH: 0, SZ: 0, GEM: 0, STAR: 0 };
}
function selectedAverages(
  averages: CompactAverages,
  offset: number,
  periods: readonly StockMAMonitorPeriod[]
): StockMAMonitorCandle["averages"] {
  const selected: StockMAMonitorCandle["averages"] = {};
  for (const period of periods) {
    const value = averageOf(averages, offset, period);
    if (value !== undefined) selected[period] = value;
  }
  return selected;
}
function compositeAverage(
  averages: CompactAverages,
  offset: number,
  periods: readonly StockMAMonitorPeriod[]
): number | null {
  if (periods.length !== 3) return null;
  const values = periods.map(period => averageOf(averages, offset, period));
  if (
    values.some(
      value => value === undefined || !Number.isFinite(value) || value <= 0
    )
  )
    return null;
  const value = 0.5 * values[0]! + 0.3 * values[1]! + 0.2 * values[2]!;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function displayRawCandle(
  candle: SourceCandle,
  periods: readonly StockMAMonitorPeriod[]
): StockMAMonitorCandle {
  const { averageOffset, averages, ...ohlc } = candle;
  return {
    ...ohlc,
    averages: selectedAverages(averages, averageOffset, periods),
    compositeAverage: compositeAverage(averages, averageOffset, periods),
  };
}

function computedStock(
  identity: Omit<Stock, "days">,
  raw: (Daily | null)[],
  dates: string[],
  poisoned: boolean,
  rankings: Ranked[],
  captureStates?: (states: Uint8Array) => void
): Stock {
  // This scope owns all full-history columns. Finish ALL legal combinations
  // before returning; neither the Stock nor any RankedItem retains scratch.
  const scratch = computedDays(raw, dates, poisoned);
  if (captureStates) {
    const states = new Uint8Array(dates.length * COMBINATIONS.length);
    for (let i = 0; i < dates.length; i++)
      for (let c = 0; c < COMBINATIONS.length; c++) {
        const value = judgment(scratch, i, COMBINATIONS[c]);
        states[i * COMBINATIONS.length + c] =
          value === null ? 0 : value ? 2 : 1;
      }
    captureStates(states);
  }
  const stock: Stock = { ...identity, days: projectedDays(scratch) };
  const last = scratch.close.length - 1;
  COMBINATIONS.forEach((periods, index) => {
    const ranked = rankings[index];
    const current = last >= 0 ? judgment(scratch, last, periods) : null;
    const counter = current === null ? ranked.excluded : ranked.eligible;
    counter.all++;
    counter[stock.board]++;
    if (current !== true) return;
    let consecutiveDays = 0,
      lowerBound = true;
    for (let i = last; i >= 0; i--) {
      const qualifies = judgment(scratch, i, periods);
      if (qualifies === null) break;
      if (!qualifies) {
        lowerBound = false;
        break;
      }
      consecutiveDays++;
    }
    ranked.items.push({
      board: stock.board,
      tsCode: stock.code,
      name: stock.name,
      close: stock.days.close,
      changePercent: stock.days.pct,
      averages: stock.days.averages,
      averageOffset: 0,
      consecutiveDays,
      consecutiveIsLowerBound: lowerBound,
      qualifiedSince: formatStockComparisonDate(
        dates[last - consecutiveDays + 1]
      )!,
      // Every combination shares the owning small candle/average buffers.
      // Numeric-period object copies happen only for a requested page/chart.
      candles: stock.days.candles,
    });
  });
  return stock;
}

function validatedInput(input: StockMAMonitorInput): StockMAMonitorInput {
  if (
    !input ||
    typeof input !== "object" ||
    !MARKETS.has(input.market) ||
    !SORTS.has(input.sort)
  )
    throw new RangeError("Unsupported stock MA market/sort");
  if (
    !Array.isArray(input.periods) ||
    input.periods.length < 2 ||
    input.periods.length > 3 ||
    Array.from(input.periods).some(p => !ALL_PERIODS.includes(p)) ||
    new Set(input.periods).size !== input.periods.length
  ) {
    throw new RangeError(
      "Stock MA requires a fixed short/medium/long preset or a legacy 5/10/20 pair"
    );
  }
  const periods = input.periods.slice().sort((a, b) => a - b);
  const preset = Object.values(STOCK_MA_MONITOR_PRESETS).some(
    preset =>
      periods.length === preset.periods.length &&
      periods.every((period, i) => period === preset.periods[i])
  );
  const legacyPair =
    periods.length === 2 &&
    periods.every(period =>
      STOCK_MA_MONITOR_PRESETS.short.periods.includes(period)
    );
  if (!preset && !legacyPair)
    throw new RangeError("Unsupported stock MA period combination");
  if (
    !Number.isSafeInteger(input.page) ||
    input.page < 1 ||
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > 100 ||
    !Number.isSafeInteger((input.page - 1) * input.pageSize)
  )
    throw new RangeError("Invalid stock MA pagination (pageSize 1..100)");
  if (
    input.ledgerId !== undefined &&
    (!Number.isSafeInteger(input.ledgerId) || input.ledgerId <= 0)
  )
    throw new RangeError("Invalid stock MA ledgerId");
  if (
    input.markets !== undefined &&
    (input.market !== "all" ||
      !Array.isArray(input.markets) ||
      input.markets.length < 1 ||
      input.markets.length > BOARDS.length ||
      input.markets.some(board => !BOARDS.includes(board)) ||
      new Set(input.markets).size !== input.markets.length)
  )
    throw new RangeError(
      "Stock MA markets requires 1..4 distinct boards with market=all"
    );
  // Copy before any await; ascending canonical periods govern both comparisons
  // and shared cache keys. ledgerId is not a predicate on global Tushare data.
  return {
    market: input.market,
    ...(input.markets === undefined
      ? {}
      : { markets: BOARDS.filter(board => input.markets!.includes(board)) }),
    sort: input.sort,
    periods,
    page: input.page,
    pageSize: input.pageSize,
    ledgerId: input.ledgerId,
  };
}

/** Read-only, cached close-version screening. Stable injected adapter only:
 * no HTTP, collector, DB boot, connection close, writes or locked reads.
 * All-market first, shared WeakMap DB/version lightweight snapshot and six
 * final rankings, then board filtering, stable sort and pagination. Cold errors
 * propagate; refresh failures retain the last success with a warning, never an
 * error-derived empty ranking. Returned data is copied so callers
 * cannot mutate the shared successful snapshot or its genuine fetchedAt.
 */
export async function getStockMAMonitor(
  db: StockComparisonDb,
  input: StockMAMonitorInput
): Promise<StockMAMonitorResult> {
  const snapshot = validatedInput(input);
  const cutoff = getAShareCompletedCutoff();
  const cache = getCache(db);
  const source = await getSource(db, cache, cutoff);
  const key = JSON.stringify(snapshot.periods);
  const ranked = source.ranked[COMBINATION_INDEX.get(key)!];
  const selectedBoards = snapshot.markets;
  const items = ranked.items.filter(item =>
    selectedBoards
      ? selectedBoards.includes(item.board)
      : snapshot.market === "all" || item.board === snapshot.market
  );
  items.sort(
    (a, b) =>
      (snapshot.sort === "newest"
        ? a.consecutiveDays - b.consecutiveDays
        : snapshot.sort === "longest"
          ? b.consecutiveDays - a.consecutiveDays
          : 0) || (a.tsCode < b.tsCode ? -1 : a.tsCode > b.tsCode ? 1 : 0)
  );
  const offset = (snapshot.page - 1) * snapshot.pageSize;
  return {
    market: snapshot.market,
    ...(selectedBoards ? { markets: selectedBoards } : {}),
    periods: snapshot.periods,
    page: snapshot.page,
    pageSize: snapshot.pageSize,
    sort: snapshot.sort,
    asOf: formatStockComparisonDate(source.dates.at(-1)),
    dataUpdatedAt: source.dataUpdatedAt,
    fetchedAt: source.fetchedAt,
    sourceVersion: sourceVersionOf(source),
    eligibleCount: selectedBoards
      ? selectedBoards.reduce(
          (total, board) => total + ranked!.eligible[board],
          0
        )
      : ranked.eligible[snapshot.market],
    excludedCount: selectedBoards
      ? selectedBoards.reduce(
          (total, board) => total + ranked!.excluded[board],
          0
        )
      : ranked.excluded[snapshot.market],
    total: items.length,
    items: items
      .slice(offset, offset + snapshot.pageSize)
      .map(({ board: _board, averageOffset, ...item }) => ({
        ...item,
        averages: selectedAverages(
          item.averages,
          averageOffset,
          snapshot.periods
        ),
        candles: item.candles.map(c => displayRawCandle(c, snapshot.periods)),
      })),
    method: "amount-volume-weighted",
    mode: "close-confirmed",
    coverageNote: source.warning
      ? `${COVERAGE_NOTE}${source.warning}`
      : COVERAGE_NOTE,
  };
}

/** Uses the identical shared source, never ranks/recomputes the market or runs
 * a per-stock SQL query. Only copied real, unadjusted source candles escape. */
export async function getStockMAMonitorChartBase(
  db: StockComparisonDb,
  input: StockMAMonitorChartInput
): Promise<{
  tsCode: string;
  periods: StockMAMonitorPeriod[];
  asOf: string;
  sourceVersion: string;
  candles: StockMAMonitorCandle[];
  /** Private compact market dates, at most 350; never forwarded publicly. */
  warmupDates: string[];
}> {
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.tsCode !== "string" ||
    !boardOf(input.tsCode)
  )
    throw new RangeError("Invalid stock MA chart tsCode");
  if (
    typeof input.asOf !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.asOf) ||
    !isValidAShareTradeDate(input.asOf.replace(/-/g, ""))
  )
    throw new RangeError("Invalid stock MA chart asOf");
  if (
    typeof input.sourceVersion !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.sourceVersion)
  )
    throw new RangeError("Invalid stock MA chart sourceVersion");
  const snapshot = validatedInput({
    ledgerId: input.ledgerId,
    periods: input.periods,
    market: "all",
    sort: "code",
    page: 1,
    pageSize: 1,
  });
  const tsCode = input.tsCode,
    asOf = input.asOf,
    sourceVersion = input.sourceVersion;
  const cutoff = getAShareCompletedCutoff();
  if (asOf.replace(/-/g, "") > cutoff)
    throw new RangeError("Stock MA chart asOf exceeds completed cutoff");
  const source = await getSource(db, getCache(db), cutoff);
  if (
    asOf !== formatStockComparisonDate(source.dates.at(-1)) ||
    sourceVersion !== sourceVersionOf(source)
  )
    throw new RangeError(
      "Stock MA chart sourceVersion/asOf mismatch; refresh monitor"
    );
  const stock = source.stocks.find(stock => stock.code === tsCode);
  if (!stock)
    throw new RangeError("Stock MA chart stock is not in the source snapshot");
  const candles = stock.days.candles
    .filter(candle => candle.date <= asOf)
    .slice(-CANDLE_DAYS)
    .map(candle => displayRawCandle(candle, snapshot.periods));
  return {
    tsCode,
    periods: snapshot.periods,
    asOf,
    sourceVersion,
    candles,
    warmupDates: source.dates.slice(),
  };
}
