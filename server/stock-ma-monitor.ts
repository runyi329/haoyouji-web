import { createHash } from "node:crypto";
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
const MAX_RANKED_COMBINATIONS = 6; // Three presets + three legacy short-line pairs.
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
// Numeric period keys (5..250) allocate large sparse V8 element stores. Keep
// seven packed doubles per day in ONE buffer per stock, not per-day objects or
// typed-array views. NaN denotes unavailable data and never escapes publicly.
// Page/chart copies alone use the numeric period-key contract.
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
type Day = {
  close: Float64Array;
  pct: Float64Array;
  averages: CompactAverages;
  candles: SourceCandle[];
};
type Stock = { code: string; name: string; board: Board; days: Day };
type Source = {
  cutoff: string;
  dates: string[];
  stocks: Stock[];
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
};
type Cache = {
  source?: {
    value: Source;
    version: string;
    probe: Probe;
    fingerprintAt: number;
  };
  sourceInFlight: Map<string, Promise<Source>>;
  ranked: Map<string, { value: Ranked; source: Source }>;
  nextProbeAt: number;
  epochReliable: boolean;
  candidate?: { version: string; probe: Probe; firstObservedAt: number };
};
// A stable executor identifies a DB. One heavy source + at most six period
// combinations per DB; no market/page/ledger cache multiplication or connection close.
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
      ranked: new Map(),
      nextProbeAt: 0,
      epochReliable: true,
    };
    caches.set(db, cache);
  }
  return cache;
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
): Day {
  const days: Day = {
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
  // Positive-only segment sums: O(H + H*P*log H), with H <= 350 and P = 7.
  // Every queried node lies wholly INSIDE its window: never subtract a huge
  // historical prefix or rolling accumulator to recover tiny recent volumes.
  // Pairwise tree addition also bounds summation error without relaxing the
  // strict-order ULP guard. These scratch trees are discarded after this stock.
  let base = 1;
  while (base < raw.length) base *= 2;
  const amounts = new Float64Array(base * 2);
  const volumes = new Float64Array(base * 2);
  if (!poisoned) {
    raw.forEach((sample, i) => {
      if (!sample) return;
      amounts[base + i] = sample.amount;
      volumes[base + i] = sample.vol;
    });
    for (let i = base - 1; i > 0; i--) {
      amounts[i] = amounts[i * 2] + amounts[i * 2 + 1];
      volumes[i] = volumes[i * 2] + volumes[i * 2 + 1];
    }
  }
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
        let amount = 0,
          vol = 0,
          left = base + start,
          right = base + i + 1;
        while (left < right) {
          if (left % 2) {
            amount += amounts[left];
            vol += volumes[left++];
          }
          if (right % 2) {
            amount += amounts[--right];
            vol += volumes[right];
          }
          left = Math.floor(left / 2);
          right = Math.floor(right / 2);
        }
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
        averages: days.averages,
        averageOffset,
      });
  }
  return days;
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
  if (!dates.length || !basics.some(row => boardOf(row.ts_code as string)))
    throw new Error("No cached stock MA source available");
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
  };
}

async function querySource(
  db: StockComparisonDb,
  cutoff: string,
  dates: string[],
  fingerprint: Fingerprint
): Promise<Source> {
  const identities: { code: string; name: string; board: Board }[] = [];
  for (const row of fingerprint.basics) {
    const code = row.ts_code as string;
    const board = boardOf(code);
    if (row.list_status !== "L" || !board) continue;
    identities.push({ code, name: row.name as string, board });
  }
  const stocks: Stock[] = [];
  const ordinals = new Map(dates.map((date, i) => [date, i]));
  // Each serial batch reads all the same discovered dates, without row LIMITs
  // or shortened warm-up. uk_code_date prevents a full-market scan per batch.
  for (
    let offset = 0;
    offset < identities.length;
    offset += SOURCE_BATCH_STOCKS
  ) {
    const batch = identities.slice(offset, offset + SOURCE_BATCH_STOCKS);
    const byCode = new Map(
      batch.map(identity => [
        identity.code,
        {
          ...identity,
          raw: Array<Daily | null>(dates.length).fill(null),
          seen: new Set<number>(),
          poisoned: false,
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
          continue;
        }
        stock.seen.add(index);
        stock.raw[index] = dailyOf(row);
      }
      // Release mysql2's full batch row array before constructing cached Days.
      rows.length = 0;
    }
    for (const [code, stock] of byCode) {
      stocks.push({
        code,
        name: stock.name,
        board: stock.board,
        days: computedDays(stock.raw, dates, stock.poisoned),
      });
      // Drop raw OHLC/volume/amount and duplicate guards stock by stock.
      byCode.delete(code);
    }
  }
  const source: Source = {
    cutoff,
    dates,
    stocks,
    fetchedAt: new Date().toISOString(),
    dataUpdatedAt: fingerprint.dataUpdatedAt,
  };
  sourceVersions.set(source, fingerprint.version);
  return source;
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

  const value = await querySource(db, cutoff, probe.dates, fingerprint);
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
    cache.candidate = undefined;
    return previousSource(cache, UPDATING_WARNING);
  }
  cache.source = {
    value,
    version: fingerprint.version,
    probe: afterSource,
    fingerprintAt: Date.now(),
  };
  cache.candidate = undefined;
  cache.ranked.clear();
  return value;
}

async function getSource(
  db: StockComparisonDb,
  cache: Cache,
  cutoff: string
): Promise<Source> {
  for (;;) {
    const pending = cache.sourceInFlight.get(cutoff);
    if (pending) return pending;
    if (!cache.sourceInFlight.size) break;
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
    .catch(error => {
      if (!(error instanceof SourceVersionPendingError))
        cache.candidate = undefined;
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
  return pending;
}

function judgment(
  day: Day,
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

function rankSource(source: Source, periods: StockMAMonitorPeriod[]): Ranked {
  const ranked: Ranked = { items: [], eligible: counts(), excluded: counts() };
  for (const stock of source.stocks) {
    const day = stock.days;
    const last = day.close.length - 1;
    const current = last >= 0 ? judgment(day, last, periods) : null;
    const counter = current === null ? ranked.excluded : ranked.eligible;
    counter.all++;
    counter[stock.board]++;
    if (current !== true) continue;
    let consecutiveDays = 0,
      lowerBound = true;
    for (let i = last; i >= 0; i--) {
      const qualifies = judgment(day, i, periods);
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
      close: day.close[last],
      changePercent: Number.isNaN(day.pct[last]) ? null : day.pct[last],
      averages: day.averages,
      averageOffset: last * ALL_PERIODS.length,
      consecutiveDays,
      consecutiveIsLowerBound: lowerBound,
      qualifiedSince: formatStockComparisonDate(
        source.dates[last - consecutiveDays + 1]
      )!,
      // Do not duplicate 30 candles per stock for every cached combination.
      // Source candles are read-only here; selected-period copying happens only
      // for the requested page when returning the response.
      candles: day.candles,
    });
  }
  return ranked;
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
 * All-market first, shared WeakMap DB/version snapshot and six DB/periods
 * projections, then board filtering, stable sort and pagination. Cold errors
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
  const entry = cache.ranked.get(key);
  let ranked = entry?.source.stocks === source.stocks ? entry.value : undefined;
  if (!ranked) {
    ranked = rankSource(source, snapshot.periods);
    cache.ranked.set(key, { value: ranked, source });
    while (cache.ranked.size > MAX_RANKED_COMBINATIONS)
      cache.ranked.delete(cache.ranked.keys().next().value!);
  }
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
