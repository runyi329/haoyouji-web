import { createHash } from "node:crypto";
import { isValidAShareTradeDate } from "../shared/a-share-completed-days";
import type {
  StockLatestChipCost,
  StockMAMonitorChartInput,
  StockMAMonitorChartResult,
  StockMAMonitorDisplayCandle,
  StockMonitorChipStatus,
} from "../shared/stock-ma-monitor";
import type { StockComparisonDb } from "./stock-comparison";
import { getStockMAMonitorChartBase } from "./stock-ma-monitor";
import {
  StockChartReadQueue,
  StockReadQueueError,
  waitForStockRead,
  type StockReadOptions,
} from "./stock-chart-read-queue";
import {
  readChipEvidence,
  resolveCheckedChipPoint,
} from "./stock-chip-evidence";

export type StockChartBase = Awaited<
  ReturnType<typeof getStockMAMonitorChartBase>
>;
type Api = "adj_factor" | "cyq_perf" | "cyq_chips";
type Row = Record<string, unknown>;
type Failure = { ready: false; note: string; fetchedAt: string };
type FactorOutcome =
  | { ready: true; factors: Map<string, number>; fetchedAt: string }
  | Failure;
export type StockChipCostWindow =
  | {
      ready: true;
      records: Map<
        string,
        { weightAvg: number | null; winnerRate: number | null }
      >;
      latestChipCost: StockLatestChipCost;
      fetchedAt: string;
    }
  | (Failure & { latestChipCost: StockLatestChipCost });

const ENDPOINT = "https://api.tushare.pro";
const API_FIELDS: Record<Api, string> = {
  adj_factor: "ts_code,trade_date,adj_factor",
  cyq_perf: "ts_code,trade_date,weight_avg,winner_rate",
  cyq_chips: "ts_code,trade_date,price,percent",
};
const SUCCESS_TTL_MS = 30 * 60_000;
const FAILURE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 200;
// A single budget and singleflight pool for factors, quotes and distributions.
const windows = new Map<
  string,
  { outcome: unknown; cachedAt: number; expiresAt: number }
>();
const singleflight = new Map<string, Promise<unknown>>();
const objectIds = new WeakMap<object, number>();
const rememberedCosts = new Map<
  string,
  Map<string, { value: number; fetchedAt: string }>
>();
let lastObjectId = 0;
const readQueue = new StockChartReadQueue();

export class ChartReadError extends Error {
  constructor(readonly publicNote: string) {
    super("Stock chart external read unavailable");
  }
}
function idOf(value: object): number {
  let id = objectIds.get(value);
  if (id === undefined) {
    id = ++lastObjectId;
    objectIds.set(value, id);
  }
  return id;
}
export function stockChartPositive(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" ||
      !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function percentage(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100
    ? number
    : null;
}
function compact(date: string): string {
  return date.replace(/-/g, "");
}
function iso(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
}
export function stockChartFailure(error: unknown): Failure {
  // Do not expose provider response bodies, credentials or raw error messages.
  return {
    ready: false,
    fetchedAt: new Date().toISOString(),
    note:
      error instanceof ChartReadError
        ? error.publicNote
        : error instanceof StockReadQueueError
          ? error.reason === "timeout"
            ? "单股外部接口超时（15秒），未重试。"
            : error.reason === "busy"
              ? "单股外部请求队列繁忙，请稍后手动重试。"
              : error.reason === "waiting"
                ? "单股外部请求排队超时（25秒），已移除，未重试。"
                : "单股筹码请求期限已到，未启动的读取已取消，未重试。"
          : "单股外部接口请求失败，未重试；供应商原始响应未公开。",
  };
}

/** Whitelist-only, on-demand, globally serialized reads shared by both views.
 * The 15s bound covers fetch AND JSON decoding, including injected adapters.
 * No retries, logs, scheduler, collector or DB operations. */
export async function readApi(
  api: Api,
  tsCode: string,
  start: string,
  end: string,
  token: string,
  fetchImpl: typeof fetch,
  options: StockReadOptions = {}
): Promise<Row[]> {
  if (!Object.prototype.hasOwnProperty.call(API_FIELDS, api))
    throw new TypeError("Unsupported chart API");
  if (api === "cyq_chips" && (start !== end || !isValidAShareTradeDate(start)))
    throw new TypeError("Chip distribution requires one valid trade_date");
  const pending = readQueue.enqueue(async signal => {
    const data: unknown = await (async () => {
      const response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          api_name: api,
          token,
          params: {
            ts_code: tsCode,
            start_date: start,
            end_date: end,
            ...(api === "cyq_chips" ? { trade_date: start } : {}),
          },
          fields: API_FIELDS[api],
        }),
      });
      if (!response.ok)
        throw new ChartReadError(
          "单股外部接口请求失败；供应商原始响应未公开。"
        );
      return await response.json();
    })();
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new ChartReadError("单股外部响应格式无效，拒绝混用。");
    const envelope = data as Record<string, unknown>;
    if (
      envelope.code !== 0 ||
      !envelope.data ||
      typeof envelope.data !== "object" ||
      Array.isArray(envelope.data)
    )
      throw new ChartReadError(
        "单股外部接口不可用或无权限；供应商原始响应未公开。"
      );
    const payload = envelope.data as Record<string, unknown>;
    const required = API_FIELDS[api].split(",");
    // winner_rate supports historical evidence only; missing that optional
    // field must not suppress the independent native weight_avg quote.
    const mandatory =
      api === "cyq_perf"
        ? required.filter(field => field !== "winner_rate")
        : required;
    if (
      !Array.isArray(payload.fields) ||
      !Array.isArray(payload.items) ||
      payload.fields.some(field => typeof field !== "string") ||
      new Set(payload.fields).size !== payload.fields.length ||
      mandatory.some(field => !(payload.fields as unknown[]).includes(field)) ||
      payload.items.length >
        (api === "adj_factor" ? 350 : api === "cyq_chips" ? 6000 : 30)
    )
      throw new ChartReadError("单股外部字段或窗口大小无效，拒绝混用。");
    const fields = payload.fields as string[];
    return payload.items.map(item => {
      if (!Array.isArray(item) || item.length !== fields.length)
        throw new ChartReadError("单股外部记录格式无效，拒绝混用。");
      return Object.fromEntries(
        required.map(field => [field, item[fields.indexOf(field)]])
      );
    });
  }, options);
  // Shared loaders own the read; caller deadlines wrap their subscription, not
  // the active provider promise, so other callers may still use its outcome.
  return pending;
}

/** No period in the key: every preset reuses the same validated stock window. */
export function stockChartCacheKey(
  db: StockComparisonDb,
  base: StockChartBase,
  token: string,
  fetchImpl: typeof fetch,
  kind: string,
  start: string,
  end: string
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        idOf(db),
        idOf(fetchImpl),
        createHash("sha256").update(token).digest("hex"),
        base.sourceVersion,
        base.tsCode,
        kind,
        start,
        end,
      ])
    )
    .digest("hex");
}
export async function stockChartCached<T>(
  key: string,
  load: () => Promise<T>,
  successful: (value: T) => boolean,
  busy: () => T,
  readOptions: StockReadOptions & { successTtlMs?: (value: T) => number } = {}
): Promise<T> {
  const now = Date.now();
  for (const [entryKey, entry] of windows)
    if (now >= entry.expiresAt) windows.delete(entryKey);
  const cached = windows.get(key);
  if (cached && readOptions.successTtlMs && successful(cached.outcome as T)) {
    cached.expiresAt = Math.min(
      cached.expiresAt,
      cached.cachedAt + readOptions.successTtlMs(cached.outcome as T)
    );
    if (now >= cached.expiresAt) windows.delete(key);
  }
  if (cached && windows.has(key)) {
    windows.delete(key);
    windows.set(key, cached);
    return cached.outcome as T;
  }
  const running = singleflight.get(key);
  if (running) {
    readQueue.retain(key, readOptions);
    return running as Promise<T>;
  }
  if (singleflight.size >= MAX_CACHE_ENTRIES) return busy();
  const pending = load()
    .then(outcome => {
      const cachedAt = Date.now();
      windows.set(key, {
        outcome,
        cachedAt,
        expiresAt:
          cachedAt +
          (successful(outcome)
            ? Math.min(
                SUCCESS_TTL_MS,
                readOptions.successTtlMs?.(outcome) ?? SUCCESS_TTL_MS
              )
            : FAILURE_TTL_MS),
      });
      while (windows.size > MAX_CACHE_ENTRIES)
        windows.delete(windows.keys().next().value!);
      return outcome;
    })
    .finally(() => singleflight.delete(key));
  singleflight.set(key, pending);
  return pending;
}

function alignedRows(
  rows: Row[],
  base: StockChartBase,
  start: string
): Map<string, Row> {
  const end = compact(base.asOf);
  const sourceDates = new Set(base.warmupDates);
  const byDate = new Map<string, Row>();
  for (const row of rows) {
    if (
      row.ts_code !== base.tsCode ||
      !isValidAShareTradeDate(row.trade_date) ||
      row.trade_date < start ||
      row.trade_date > end ||
      !sourceDates.has(row.trade_date) ||
      byDate.has(row.trade_date)
    )
      throw new ChartReadError(
        "单股外部数据存在错股、非法/重复日期或越界日期，拒绝混用。"
      );
    byDate.set(row.trade_date, row);
  }
  return byDate;
}
function missingCost(
  fetchedAt = new Date().toISOString()
): StockLatestChipCost {
  return {
    value: null,
    asOf: null,
    source: "Tushare cyq_perf.weight_avg",
    estimated: true,
    status: "missing",
    fetchedAt,
  };
}
function costScope(
  db: StockComparisonDb,
  base: StockChartBase,
  token: string,
  fetchImpl: typeof fetch
): string {
  // Only previously read real records can survive a failed new window; never
  // fill historical candles. Credentials/DB/stock remain isolated across versions.
  return createHash("sha256")
    .update(
      JSON.stringify([
        idOf(db),
        idOf(fetchImpl),
        createHash("sha256").update(token).digest("hex"),
        base.tsCode,
      ])
    )
    .digest("hex");
}
function previousCost(
  scope: string,
  asOf: string,
  fetchedAt: string
): StockLatestChipCost {
  const records = rememberedCosts.get(scope);
  const date =
    records &&
    [...records.keys()]
      .filter(date => date <= asOf)
      .sort()
      .at(-1);
  if (!date || !records) return missingCost(fetchedAt);
  const record = records.get(date)!;
  return {
    ...missingCost(record.fetchedAt),
    value: record.value,
    asOf: date,
    status: "cached",
  };
}
function rememberCosts(
  scope: string,
  records: Extract<StockChipCostWindow, { ready: true }>["records"],
  fetchedAt: string
): void {
  const saved =
    rememberedCosts.get(scope) ??
    new Map<string, { value: number; fetchedAt: string }>();
  for (const [date, record] of records)
    if (record.weightAvg !== null)
      saved.set(date, { value: record.weightAvg, fetchedAt });
  if (!saved.size) return;
  for (const date of [...saved.keys()]
    .sort()
    .slice(0, Math.max(0, saved.size - 30)))
    saved.delete(date);
  rememberedCosts.delete(scope);
  rememberedCosts.set(scope, saved);
  while (rememberedCosts.size > MAX_CACHE_ENTRIES)
    rememberedCosts.delete(rememberedCosts.keys().next().value!);
}

/** Internal supply for both endpoints. Caller must obtain base from
 * getStockMAMonitorChartBase first. No factor/evidence/screening dependency. */
export async function getStockChipCostWindow(
  db: StockComparisonDb,
  base: StockChartBase,
  options: {
    token?: string;
    fetchImpl?: typeof fetch;
    previousTtlMs?: number;
  } & StockReadOptions = {}
): Promise<StockChipCostWindow> {
  const token = String(
    options.token ?? (process.env.TUSHARE_TOKEN || process.env.TS_TOKEN || "")
  ).trim();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const scope = costScope(db, base, token, fetchImpl);
  const fail = (
    note: string,
    fetchedAt = new Date().toISOString()
  ): StockChipCostWindow => ({
    ready: false,
    note,
    fetchedAt,
    latestChipCost: previousCost(scope, base.asOf, fetchedAt),
  });
  if (!token) return fail("未配置Tushare token，原始筹码报价不可用。");
  const dates = base.warmupDates
    .filter(date => date <= compact(base.asOf))
    .slice(-30);
  if (!dates.length)
    return fail("快照没有有效缓存市场日，原始筹码报价不可用。");
  const start = dates[0],
    end = compact(base.asOf);
  const key = stockChartCacheKey(
    db,
    base,
    token,
    fetchImpl,
    "cyq_perf",
    start,
    end
  );
  const readOptions = {
    ...options,
    queueKey: key,
    successTtlMs: (value: StockChipCostWindow) =>
      value.ready && !value.records.has(base.asOf)
        ? (options.previousTtlMs ?? SUCCESS_TTL_MS)
        : SUCCESS_TTL_MS,
  };
  const pending = stockChartCached(
    key,
    async (): Promise<StockChipCostWindow> => {
      try {
        const rows = alignedRows(
          await readApi(
            "cyq_perf",
            base.tsCode,
            start,
            end,
            token,
            fetchImpl,
            readOptions
          ),
          base,
          start
        );
        const records = new Map<
          string,
          { weightAvg: number | null; winnerRate: number | null }
        >();
        for (const [date, row] of rows)
          records.set(iso(date), {
            weightAvg: stockChartPositive(row.weight_avg),
            winnerRate: percentage(row.winner_rate),
          });
        const fetchedAt = new Date().toISOString();
        rememberCosts(scope, records, fetchedAt);
        const date = [...records.keys()]
          .filter(date => records.get(date)!.weightAvg !== null)
          .sort()
          .at(-1);
        const latestChipCost: StockLatestChipCost = date
          ? {
              ...missingCost(fetchedAt),
              value: records.get(date)!.weightAvg,
              asOf: date,
              status: date === base.asOf ? "current" : "previous",
            }
          : missingCost(fetchedAt);
        return { ready: true, records, fetchedAt, latestChipCost };
      } catch (error) {
        const failure = stockChartFailure(error);
        return fail(failure.note, failure.fetchedAt);
      }
    },
    outcome => outcome.ready,
    () => fail("单股筹码请求繁忙，请稍后手动重试。"),
    readOptions
  );
  try {
    return await waitForStockRead(pending, options);
  } catch (error) {
    const failure = stockChartFailure(error);
    return fail(failure.note, failure.fetchedAt);
  }
}

async function factorWindow(
  base: StockChartBase,
  db: StockComparisonDb,
  token: string,
  fetchImpl: typeof fetch
): Promise<FactorOutcome> {
  const start = base.warmupDates[0],
    end = compact(base.asOf);
  const key = stockChartCacheKey(
    db,
    base,
    token,
    fetchImpl,
    "adj_factor",
    start,
    end
  );
  return stockChartCached(
    key,
    async (): Promise<FactorOutcome> => {
      try {
        const rows = alignedRows(
          await readApi(
            "adj_factor",
            base.tsCode,
            start,
            end,
            token,
            fetchImpl
          ),
          base,
          start
        );
        const factors = new Map<string, number>();
        for (const [date, row] of rows) {
          const factor = stockChartPositive(row.adj_factor);
          if (factor !== null) factors.set(iso(date), factor);
        }
        if (base.candles.some(candle => !factors.has(candle.date)))
          throw new ChartReadError(
            "单股复权因子缺失或无效（含锚点或可见K线日期）；拒绝以1填补。"
          );
        return { ready: true, factors, fetchedAt: new Date().toISOString() };
      } catch (error) {
        return stockChartFailure(error);
      }
    },
    outcome => outcome.ready,
    () =>
      stockChartFailure(
        new ChartReadError("单股图表请求繁忙，请稍后手动重试。")
      )
  );
}

function unavailable(
  base: StockChartBase,
  note: string,
  fetchedAt = new Date().toISOString(),
  latestChipCost = missingCost(fetchedAt)
): StockMAMonitorChartResult {
  return {
    tsCode: base.tsCode,
    periods: base.periods.slice(),
    asOf: base.asOf,
    sourceVersion: base.sourceVersion,
    priceBasis: "unadjusted",
    anchorDate: null,
    chartStatus: "unavailable",
    candles: [],
    chipStatus: "missing",
    chipAsOf: null,
    compositeAverage: null,
    chipAverageCost: null,
    latestChipCost: { ...latestChipCost },
    fetchedAt,
    note:
      note +
      "继续使用原始未复权图表；原始筹码报价独立保留其真实日期，不参与叠线或价差计算。",
  };
}

/** Single visible stock only. Snapshot errors propagate before any HTTP;
 * factor and cost failures are independent and remain explicit. */
export async function getStockMAMonitorChart(
  db: StockComparisonDb,
  input: StockMAMonitorChartInput,
  options: { token?: string; fetchImpl?: typeof fetch } = {}
): Promise<StockMAMonitorChartResult> {
  const token = String(
    options.token ?? (process.env.TUSHARE_TOKEN || process.env.TS_TOKEN || "")
  ).trim();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const base = await getStockMAMonitorChartBase(db, input);
  if (!token)
    return unavailable(
      base,
      "未配置Tushare token，单股前复权图表不可用；不把原始图标为前复权。"
    );
  if (!base.candles.length || base.candles.at(-1)!.date !== base.asOf) {
    const cost = await getStockChipCostWindow(db, base, { token, fetchImpl });
    return unavailable(
      base,
      "该股票在请求截止日没有真实有效K线锚点，不能生成前复权图表。" +
        (cost.ready ? "" : cost.note),
      cost.fetchedAt,
      cost.latestChipCost
    );
  }
  // Queue stays globally serial even though these independent reads are started
  // together. A failed factor must never suppress the original supplier quote.
  const [external, cost] = await Promise.all([
    factorWindow(base, db, token, fetchImpl),
    getStockChipCostWindow(db, base, { token, fetchImpl }),
  ]);
  if (!external.ready)
    return unavailable(
      base,
      external.note + (cost.ready ? "" : cost.note),
      external.fetchedAt,
      cost.latestChipCost
    );
  const { factors, fetchedAt } = external;
  // Failed costs do not borrow remembered records for historical evidence.
  const chips = cost.ready ? cost.records : new Map();
  const evidence = readChipEvidence();
  const anchor = factors.get(base.asOf)!;
  const marketDates = base.warmupDates.map(iso);
  const ordinals = new Map(marketDates.map((date, index) => [date, index]));
  const candles: StockMAMonitorDisplayCandle[] = [];
  for (let i = 0; i < base.candles.length; i++) {
    const candle = base.candles[i],
      factor = factors.get(candle.date)!;
    const ratio = factor / anchor;
    // Only map protected raw G after each complete market-date period is proven
    // to have constant positive factors, including invisible 120/250 warm-up.
    const ordinal = ordinals.get(candle.date);
    const unchanged =
      base.periods.length === 3 &&
      ordinal !== undefined &&
      base.periods.every(period => {
        const average = stockChartPositive(candle.averages[period]);
        const start = ordinal - period + 1;
        return (
          average !== null &&
          start >= 0 &&
          marketDates
            .slice(start, ordinal + 1)
            .every(date => factors.get(date) === factor)
        );
      });
    const rawG = candle.compositeAverage;
    const mappedG =
      unchanged && rawG !== null && rawG !== undefined ? rawG * ratio : null;
    const chip = chips.get(candle.date);
    const checked =
      !chip || chip.weightAvg === null
        ? { status: "missing" as StockMonitorChipStatus, value: null }
        : chip.winnerRate === null
          ? { status: "unknown_basis" as StockMonitorChipStatus, value: null }
          : resolveCheckedChipPoint(evidence, {
              tsCode: base.tsCode,
              date: candle.date,
              rawClose: candle.close,
              rawAdjFactor: factor,
              weightAvg: chip.weightAvg,
              winnerRate: chip.winnerRate,
              anchorDate: base.asOf,
              anchorFactor: anchor,
            });
    const display = {
      date: candle.date,
      open: candle.open * ratio,
      high: candle.high * ratio,
      low: candle.low * ratio,
      close: candle.close * ratio,
      averages: {},
      compositeAverage: mappedG,
      chipAverageCost: checked.value,
      chipStatus: checked.status,
    } satisfies StockMAMonitorDisplayCandle;
    if (
      !Number.isFinite(ratio) ||
      ratio <= 0 ||
      [display.open, display.high, display.low, display.close].some(
        value => !Number.isFinite(value) || value <= 0
      ) ||
      (mappedG !== null && (!Number.isFinite(mappedG) || mappedG <= 0))
    )
      return unavailable(
        base,
        "复权倍率产生无效数值，拒绝展示。",
        fetchedAt,
        cost.latestChipCost
      );
    candles.push(display);
  }
  const checkedCandles = candles.filter(
    c => c.chipStatus === "ready" && c.chipAverageCost !== null
  );
  const chipStatus = checkedCandles.length
    ? "ready"
    : [...chips.values()].some(chip => chip.weightAvg !== null)
      ? "unknown_basis"
      : "missing";
  return {
    tsCode: base.tsCode,
    periods: base.periods.slice(),
    asOf: base.asOf,
    sourceVersion: base.sourceVersion,
    priceBasis: "qfq",
    anchorDate: base.asOf,
    chartStatus: "ready",
    candles,
    chipStatus,
    chipAsOf: checkedCandles.at(-1)?.date ?? null,
    compositeAverage: candles.at(-1)!.compositeAverage,
    chipAverageCost: candles.at(-1)!.chipAverageCost,
    ...(checkedCandles.length ? { chipVerification: "sample" as const } : {}),
    latestChipCost: { ...cost.latestChipCost },
    fetchedAt,
    note:
      "仅本股票最近最多30根真实日K；复权因子仅请求本快照最多350个缓存市场日的单股暖机范围，原始筹码报价仅请求最近最多30个缓存市场日。前复权OHLC=原始OHLC×F(t)/F(asOf)，锚点为本次快照真实截止日，不随未来日期转换。G=0.5M1+0.3M2+0.2M3，仅原算法三条均价有效且各自完整市场日窗口因子均覆盖、正数且与当日因子相等时按同系数映射；任一窗口因子缺失或变化即留空，不重新计算复权VWAP，不推断缺失历史因子。原三条均价及暖机日期不公开，筛选与连续天数仍使用原始量额口径。" +
      (checkedCandles.length
        ? "历史筹码证据仅保留当前股票/日期/价格/成本/获利比/因子/锚点全部匹配的自动检查样本点，不代表供应商全局复权规则确认；其余日期留空，不沿用或填充。"
        : chipStatus === "unknown_basis"
          ? "cyq_perf存在数据但UNKNOWN_BASIS：没有匹配的有效检查结果，历史K成本留空；chipAsOf=null表示没有有效可比日期。"
          : "cyq_perf暂无有效历史筹码证据，历史K成本留空；没有有效可比日期。") +
      (cost.ready ? "" : cost.note) +
      "latestChipCost独立显示供应商最近已发布的原始模型单值及真实日期（可为前一日或失败前缓存），不受历史复权认证影响，不叠加历史筹码线，不自动计算价差。外部数据按快照版本/DB/凭证/单股/窗口缓存最多30分钟后按需复核，失败只缓存30秒；无后台采集或自动重试。",
  };
}
