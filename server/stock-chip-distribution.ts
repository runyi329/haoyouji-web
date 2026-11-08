import { isValidAShareTradeDate } from "../shared/a-share-completed-days";
import type {
  StockChipDistributionResult,
  StockLatestChipCost,
  StockMAMonitorChartInput,
} from "../shared/stock-ma-monitor";
import type { StockComparisonDb } from "./stock-comparison";
import { getStockMAMonitorChartBase } from "./stock-ma-monitor";
import {
  ChartReadError,
  getStockChipCostWindow,
  readApi,
  stockChartCacheKey,
  stockChartFailure,
  stockChartPositive,
  type StockChartBase,
} from "./stock-monitor-chart";
import {
  StockReadQueueError,
  waitForStockRead,
} from "./stock-chart-read-queue";

export const STOCK_DISTRIBUTION_DEADLINE_MS = 25_000;
export const STOCK_DISTRIBUTION_CURRENT_TTL_MS = 6 * 60 * 60_000;
export const STOCK_DISTRIBUTION_PREVIOUS_TTL_MS = 60_000;
const FAILURE_TTL_MS = 30_000;
const MAX_ENTRIES = 200;
type Distribution = Omit<StockChipDistributionResult, "latestChipCost">;
type Flight = {
  pending: Promise<StockChipDistributionResult>;
  controller: AbortController;
  subscribers: Map<symbol, number>;
  latestChipCost: StockLatestChipCost;
};
// Only fully validated results. Successful keys include the ACTUAL cyq_chips
// request date, not the cost window or an assumed "today". Nothing is persisted.
const complete = new Map<
  string,
  { result: StockChipDistributionResult; expiresAt: number }
>();
const failures = new Map<
  string,
  { result: StockChipDistributionResult; expiresAt: number }
>();
const flights = new Map<string, Flight>();

function empty(
  base: StockChartBase,
  status: "missing" | "unavailable",
  note: string,
  fetchedAt = new Date().toISOString()
): Distribution {
  return {
    tsCode: base.tsCode,
    sourceVersion: base.sourceVersion,
    asOf: null,
    source: "Tushare cyq_chips",
    estimated: true,
    status,
    points: [],
    weightAvg: null,
    fetchedAt,
    note,
  };
}
function missingCost(): StockLatestChipCost {
  return {
    value: null,
    asOf: null,
    source: "Tushare cyq_perf.weight_avg",
    estimated: true,
    status: "missing",
    fetchedAt: new Date().toISOString(),
  };
}
function percent(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" ||
      !/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100
    ? number
    : null;
}
function validatePoints(
  rows: Record<string, unknown>[],
  tsCode: string,
  tradeDate: string
): StockChipDistributionResult["points"] {
  const prices = new Set<number>();
  let total = 0;
  const points = rows.map(row => {
    const price = stockChartPositive(row.price),
      share = percent(row.percent);
    if (
      row.ts_code !== tsCode ||
      !isValidAShareTradeDate(row.trade_date) ||
      row.trade_date !== tradeDate ||
      price === null ||
      share === null ||
      prices.has(price)
    )
      throw new ChartReadError(
        "筹码分布存在错股、非法/非单日日期、重复价位或无效价位/占比，拒绝展示；未归一化或合成数据。"
      );
    prices.add(price);
    total += share;
    return { price, percent: share };
  });
  // Tiny tolerance only protects floating-point addition at the exact boundary.
  if (points.length && Math.abs(total - 100) > 1 + 1e-9)
    throw new ChartReadError(
      "筹码分布总占比不在100±1范围，拒绝展示；未归一化或合成数据。"
    );
  return points.sort((a, b) => a.price - b.price);
}
function copyResult(
  value: Distribution,
  latestChipCost: StockLatestChipCost
): StockChipDistributionResult {
  return {
    ...value,
    points: value.points.map(point => ({ ...point })),
    latestChipCost: { ...latestChipCost },
  };
}
function prune(cache: typeof complete): void {
  for (const [key, entry] of cache)
    if (Date.now() >= entry.expiresAt) cache.delete(key);
}
function save(
  cache: typeof complete,
  key: string,
  result: StockChipDistributionResult,
  ttl: number
): void {
  cache.delete(key);
  cache.set(key, {
    result: copyResult(result, result.latestChipCost),
    expiresAt: Date.now() + ttl,
  });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}

/** Lazy single-stock native supplier distribution. Every call validates base
 * before consulting full-result caches or HTTP. One <=30-day cost window plus
 * at most two single-day chips reads; ONLY an empty response allows fallback.
 * Each subscriber has 25s total after base validation. Once all subscribers
 * expire, queued work is removed and no further chips read can be started.
 * Already active shared reads may finish for other callers; no retry or IO
 * overlap is created by timeouts. All original price/percent guards remain. */
export async function getStockChipDistribution(
  db: StockComparisonDb,
  input: StockMAMonitorChartInput,
  options: { token?: string; fetchImpl?: typeof fetch } = {}
): Promise<StockChipDistributionResult> {
  const base = await getStockMAMonitorChartBase(db, input);
  const deadlineAt = Date.now() + STOCK_DISTRIBUTION_DEADLINE_MS;
  const token = String(
    options.token ?? (process.env.TUSHARE_TOKEN || process.env.TS_TOKEN || "")
  ).trim();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const end = base.asOf.replace(/-/g, "");
  const dates = base.warmupDates.filter(date => date <= end).slice(-30);
  const scope = stockChartCacheKey(
    db,
    base,
    token,
    fetchImpl,
    "distribution-call",
    dates[0] ?? end,
    end
  );
  const dateKey = (date: string) =>
    stockChartCacheKey(
      db,
      base,
      token,
      fetchImpl,
      `complete_cyq_chips:${base.asOf}`,
      date,
      date
    );
  prune(complete);
  prune(failures);
  // No getCost before this lookup: complete current-day publications survive
  // the independent cost cache's 30m TTL and reuse the original dated quote.
  for (const date of [...dates].reverse()) {
    const cached = complete.get(dateKey(date));
    if (!cached) continue;
    complete.delete(dateKey(date));
    complete.set(dateKey(date), cached);
    return copyResult(cached.result, cached.result.latestChipCost);
  }
  const failed = failures.get(scope);
  if (failed) return copyResult(failed.result, failed.result.latestChipCost);
  let flight = flights.get(scope);
  if (flight?.controller.signal.aborted) flight = undefined;
  if (!flight) {
    if (flights.size >= MAX_ENTRIES)
      return copyResult(
        empty(base, "unavailable", "单股筹码分布请求繁忙，请稍后手动重试。"),
        missingCost()
      );
    flight = {
      controller: new AbortController(),
      subscribers: new Map(),
      latestChipCost: missingCost(),
      pending: undefined as unknown as Promise<StockChipDistributionResult>,
    };
    const owner = flight;
    const readOptions = {
      priority: "high" as const,
      signal: owner.controller.signal,
      canStart: () =>
        [...owner.subscribers.values()].some(deadline => Date.now() < deadline),
    };
    const checkActive = () => {
      if (readOptions.signal.aborted || !readOptions.canStart()) {
        owner.controller.abort();
        throw new StockReadQueueError("deadline");
      }
    };
    // Defer loader until first subscriber is registered below.
    owner.pending = Promise.resolve()
      .then(async () => {
        try {
          checkActive();
          const cost = await getStockChipCostWindow(db, base, {
            token,
            fetchImpl,
            ...readOptions,
            previousTtlMs: STOCK_DISTRIBUTION_PREVIOUS_TTL_MS,
          });
          owner.latestChipCost = { ...cost.latestChipCost };
          checkActive();
          if (!cost.ready)
            return copyResult(
              empty(base, "unavailable", cost.note, cost.fetchedAt),
              cost.latestChipCost
            );
          const costDates = [...cost.records.keys()]
            .sort()
            .reverse()
            .slice(0, 2);
          if (!costDates.length)
            return copyResult(
              empty(
                base,
                "missing",
                "最近最多30个缓存市场日没有真实cyq_perf记录，筹码分布留空；未合成数据。",
                cost.fetchedAt
              ),
              cost.latestChipCost
            );
          for (let i = 0; i < costDates.length; i++) {
            checkActive();
            const date = costDates[i],
              tradeDate = date.replace(/-/g, "");
            const rows = await waitForStockRead(
              readApi(
                "cyq_chips",
                base.tsCode,
                tradeDate,
                tradeDate,
                token,
                fetchImpl,
                readOptions
              ),
              readOptions
            );
            checkActive();
            const points = validatePoints(rows, base.tsCode, tradeDate);
            if (!points.length) continue;
            const result = copyResult(
              {
                tsCode: base.tsCode,
                sourceVersion: base.sourceVersion,
                asOf: date,
                source: "Tushare cyq_chips",
                estimated: true,
                status: "ready",
                points,
                // Never use the latest quote's value on a prior distribution date.
                weightAvg: cost.records.get(date)!.weightAvg,
                fetchedAt: new Date().toISOString(),
                note:
                  (i
                    ? "最近分布缺失，使用前一个真实cyq_perf日的单日分布，日期独立保留。"
                    : "使用最近真实cyq_perf日的单日筹码分布。") +
                  "供应商原生price/percent模型估算分布，未归一化或合成；不叠收盘价、不计算获利损失、不赋予复权口径。weightAvg仅取分布对应日期；latestChipCost独立保留最近已发布原始报价及真实日期。仅本次可见单股按需读取，无后台扫描、自动重试或全市场请求。" +
                  (date === base.asOf
                    ? "该快照截止日已完整发布的分布按版本/DB/凭证/股票/真实请求日缓存最多6小时。"
                    : "此前真实日分布仅缓存60秒，不作为当日已发布值。"),
              },
              cost.latestChipCost
            );
            save(
              complete,
              dateKey(tradeDate),
              result,
              date === base.asOf
                ? STOCK_DISTRIBUTION_CURRENT_TTL_MS
                : STOCK_DISTRIBUTION_PREVIOUS_TTL_MS
            );
            return result;
          }
          return copyResult(
            empty(
              base,
              "missing",
              "最新及至多前一个真实cyq_perf日没有筹码分布，留空；未归一化、补点或合成数据。"
            ),
            cost.latestChipCost
          );
        } catch (error) {
          const failure = stockChartFailure(error);
          return copyResult(
            empty(base, "unavailable", failure.note, failure.fetchedAt),
            owner.latestChipCost
          );
        }
      })
      .then(result => {
        // Subscriber cancellation must not poison a future manual request.
        if (result.status !== "ready" && !owner.controller.signal.aborted)
          save(failures, scope, result, FAILURE_TTL_MS);
        return result;
      })
      .finally(() => {
        if (flights.get(scope) === owner) flights.delete(scope);
      });
    flights.set(scope, owner);
  }
  const subscriber = Symbol();
  flight.subscribers.set(subscriber, deadlineAt);
  try {
    const result = await waitForStockRead(flight.pending, { deadlineAt });
    if (Date.now() >= deadlineAt) throw new StockReadQueueError("deadline");
    return copyResult(result, result.latestChipCost);
  } catch (error) {
    const failure = stockChartFailure(error);
    return copyResult(
      empty(base, "unavailable", failure.note, failure.fetchedAt),
      flight.latestChipCost
    );
  } finally {
    flight.subscribers.delete(subscriber);
    if (!flight.subscribers.size) flight.controller.abort();
  }
}
