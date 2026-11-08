import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  StockMAMonitorCandle,
  StockMAMonitorChartInput,
  StockMAMonitorPeriod,
} from "../shared/stock-ma-monitor";
import type { StockComparisonDb } from "./stock-comparison";
import type { getStockMAMonitorChart as ChartFunction } from "./stock-monitor-chart";

// Isolated pure fixtures; never DB boot, real HTTP, collector, router or writes.
const { chartBase } = vi.hoisted(() => ({ chartBase: vi.fn() }));
vi.mock("./stock-ma-monitor", () => ({
  getStockMAMonitorChartBase: chartBase,
}));
let getChart: typeof ChartFunction;
let db: StockComparisonDb;
const input: StockMAMonitorChartInput = {
  ledgerId: 37,
  tsCode: "600001.SH",
  periods: [5, 10, 20],
  asOf: "2026-11-06",
  sourceVersion: "a".repeat(64),
};
function fixtureCandles(): StockMAMonitorCandle[] {
  const dates: string[] = [];
  const date = new Date("2026-11-06T00:00:00Z");
  while (dates.length < 350) {
    if (![0, 6].includes(date.getUTCDay()))
      dates.unshift(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return dates.map(date => ({
    date,
    open: 12,
    high: 14,
    low: 10,
    close: 13,
    averages: { 5: 12, 10: 11, 20: 10 },
    compositeAverage: 11.3,
  }));
}
let candles: StockMAMonitorCandle[];
let warmupDates: string[];
type Payload = { fields: string[]; items: unknown[][] };
function payload(api: string, code = input.tsCode, rows = candles): Payload {
  return api === "adj_factor"
    ? {
        // Deliberately different field ordering; align by names and dates.
        fields: ["adj_factor", "trade_date", "ts_code"],
        items: warmupDates.map(date => [2, date, code]).reverse(),
      }
    : {
        fields: ["weight_avg", "ts_code", "trade_date", "winner_rate"],
        items: rows
          .map(c => [10.5, code, c.date.replace(/-/g, ""), 50])
          .reverse(),
      };
}
function fakeFetch(
  transform?: (data: Payload, api: string, request: Record<string, any>) => void
) {
  return vi.fn(async (_url: any, init: any) => {
    const request = JSON.parse(init.body);
    const data = payload(request.api_name, request.params.ts_code);
    transform?.(data, request.api_name, request);
    // previewFetch-compatible: intentionally no text(), no response body stream.
    return { ok: true, json: async () => ({ code: 0, data }) } as Response;
  });
}
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T08:00:00Z"));
  vi.stubEnv("TUSHARE_TOKEN", "");
  vi.stubEnv("TS_TOKEN", "");
  vi.stubEnv("TUSHARE_CHIP_EVIDENCE_FILE", "");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Real HTTP forbidden");
    })
  );
  db = {
    execute: vi.fn(() => {
      throw new Error("Real DB forbidden");
    }),
  };
  const history = fixtureCandles();
  warmupDates = history.map(candle => candle.date.replace(/-/g, ""));
  candles = history.slice(-30);
  chartBase
    .mockReset()
    .mockImplementation(
      async (_db: unknown, request: StockMAMonitorChartInput) => ({
        tsCode: request.tsCode,
        periods: request.periods.slice().sort((a, b) => a - b),
        asOf: request.asOf,
        sourceVersion: request.sourceVersion,
        candles: candles.map(c => ({ ...c, averages: { ...c.averages } })),
        warmupDates: warmupDates.slice(),
      })
    );
  getChart = (await import("./stock-monitor-chart")).getStockMAMonitorChart;
});
afterEach(() => {
  expect(db.execute).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("单股前复权OHLC与G映射，不公开私有三线", () => {
  it("F(t)/F(A)按真实日期对齐；固定最后日锚点且请求仅两白名单接口", async () => {
    const starts: number[] = [];
    const fetchImpl = fakeFetch((data, api) => {
      starts.push(Date.now());
      if (api === "adj_factor")
        data.items.forEach(row => {
          row[0] = String(row[1]) < candles[15].date.replace(/-/g, "") ? 1 : 2;
        });
    });
    const result = await settle(
      getChart(db, input, { token: "offline-test-token", fetchImpl })
    );
    expect(result).toMatchObject({
      chartStatus: "ready",
      priceBasis: "qfq",
      anchorDate: input.asOf,
      sourceVersion: input.sourceVersion,
      chipStatus: "unknown_basis",
      chipAsOf: null,
      chipAverageCost: null,
    });
    expect(result.candles).toHaveLength(30);
    expect(result.candles[0]).toMatchObject({
      open: 6,
      high: 7,
      low: 5,
      close: 6.5,
      compositeAverage: 5.65,
      averages: {},
    });
    expect(result.candles[14].compositeAverage).toBe(5.65);
    expect(result.candles[15]).toMatchObject({
      open: 12,
      high: 14,
      low: 10,
      close: 13,
      compositeAverage: null,
    });
    expect(result.candles.at(-1)!.close).toBe(13);
    expect(
      result.candles.every(
        c =>
          c.date <= input.asOf &&
          c.chipAverageCost === null &&
          Object.keys(c.averages).length === 0
      )
    ).toBe(true);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(2200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toBe("https://api.tushare.pro");
      const body = JSON.parse(init.body);
      expect(["adj_factor", "cyq_perf"]).toContain(body.api_name);
      expect(body.params).toEqual({
        ts_code: input.tsCode,
        start_date:
          body.api_name === "adj_factor"
            ? warmupDates[0]
            : candles[0].date.replace(/-/g, ""),
        end_date: "20261106",
      });
      expect(body.fields).toContain("ts_code,trade_date");
    }
    expect(result.note).toContain("UNKNOWN_BASIS");
    expect(result.note).toContain("没有有效可比日期");
  });

  it("可见因子全部不变且有效raw G受既有断点保护时映射；原null绝不补数", async () => {
    candles[0].compositeAverage = null;
    candles[1].compositeAverage = undefined;
    const fetchImpl = fakeFetch();
    const result = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(result.candles[0].compositeAverage).toBeNull();
    expect(result.candles[1].compositeAverage).toBeNull();
    expect(result.candles[2].compositeAverage).toBe(11.3);
    expect(result.compositeAverage).toBe(11.3);
    expect(
      result.candles.every(
        c => c.averages && Object.keys(c.averages).length === 0
      )
    ).toBe(true);
  });

  it("窗口变因子仅在受影响G留空；20个干净可见因子之后可恢复", async () => {
    const fetchImpl = fakeFetch((data, api) => {
      if (api === "adj_factor")
        data.items.forEach(row => {
          row[0] = String(row[1]) < candles[5].date.replace(/-/g, "") ? 1 : 2;
        });
    });
    const result = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(result.candles[5].compositeAverage).toBeNull();
    expect(result.candles[23].compositeAverage).toBeNull();
    expect(result.candles[24].compositeAverage).toBe(11.3);
    expect(result.candles.at(-1)!.compositeAverage).toBe(11.3);
  });

  it("cyq数据存在仍unknown_basis且K全null；缺点或空响应标missing", async () => {
    const fetchImpl = fakeFetch((data, api) => {
      if (api === "cyq_perf") data.items = [data.items[0]];
    });
    const result = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(result.chipStatus).toBe("unknown_basis");
    expect(result.candles[0].chipStatus).toBe("missing");
    expect(result.candles.at(-1)!.chipStatus).toBe("unknown_basis");
    expect(result.chipAsOf).toBeNull();
    expect(result.candles.every(c => c.chipAverageCost === null)).toBe(true);
    const emptyFetch = fakeFetch((data, api) => {
      if (api === "cyq_perf") data.items = [];
    });
    const empty = await settle(
      getChart(db, input, { token: "offline", fetchImpl: emptyFetch })
    );
    expect(empty).toMatchObject({
      chartStatus: "ready",
      chipStatus: "missing",
      chipAverageCost: null,
      chipAsOf: null,
    });
  });

  it("非正筹码成本只是missing，不把数值当作已批准基准", async () => {
    const fetchImpl = fakeFetch((data, api) => {
      if (api === "cyq_perf")
        data.items.forEach(row => {
          row[0] = "0";
        });
    });
    const result = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(result.chipStatus).toBe("missing");
    expect(
      result.candles.every(
        c => c.chipStatus === "missing" && c.chipAverageCost === null
      )
    ).toBe(true);
  });

  it.each(["missing", "zero", "changed"])(
    "不可见暖机因子%s不得仅凭30日恒定批准120/250 G",
    async mode => {
      candles.forEach(candle => {
        candle.averages = { 60: 12, 120: 11, 250: 10 };
      });
      // Index 150 is invisible but within every displayed date's 250-day window;
      // the 30 visible factors and all 60/120-day factors remain constant at 2.
      const historicalDate = warmupDates[150];
      const fetchImpl = fakeFetch((data, api) => {
        if (api !== "adj_factor") return;
        if (mode === "missing")
          data.items = data.items.filter(row => row[1] !== historicalDate);
        else
          data.items.forEach(row => {
            if (row[1] === historicalDate) row[0] = mode === "zero" ? 0 : 1;
          });
      });
      const result = await settle(
        getChart(
          db,
          { ...input, periods: [60, 120, 250] },
          { token: "offline", fetchImpl }
        )
      );
      expect(result.chartStatus).toBe("ready");
      expect(
        result.candles.every(c => c.open === 12 && c.compositeAverage === null)
      ).toBe(true);
      expect(result.compositeAverage).toBeNull();
      expect("warmupDates" in result).toBe(false);
    }
  );

  it("三条完整长周期因子和raw平均均有效才能恢复G，缺任一raw平均保持null", async () => {
    candles.forEach(candle => {
      candle.averages = { 60: 12, 120: 11, 250: 10 };
    });
    delete candles[0].averages[250];
    const fetchImpl = fakeFetch();
    const result = await settle(
      getChart(
        db,
        { ...input, periods: [60, 120, 250] },
        { token: "offline", fetchImpl }
      )
    );
    expect(result.candles[0].compositeAverage).toBeNull();
    expect(
      result.candles.slice(1).every(c => c.compositeAverage === 11.3)
    ).toBe(true);
    expect(result.compositeAverage).toBe(11.3);
  });

  it("不足完整市场日暖机不能借用供应商隐藏历史或raw G补足", async () => {
    warmupDates = warmupDates.slice(-30);
    candles.forEach(candle => {
      candle.averages = { 20: 12, 30: 11, 60: 10 };
    });
    const fetchImpl = fakeFetch();
    const result = await settle(
      getChart(
        db,
        { ...input, periods: [20, 30, 60] },
        { token: "offline", fetchImpl }
      )
    );
    expect(result.chartStatus).toBe("ready");
    expect(result.candles.every(c => c.compositeAverage === null)).toBe(true);
  });
});

describe("因子完整性、错误身份和失败显式降级", () => {
  it.each([
    "wrong-stock",
    "duplicate",
    "future",
    "before-window",
    "invalid-date",
    "missing-anchor",
    "missing-point",
    "zero-factor",
    "nan-factor",
  ])("adj_factor %s拒绝qfq，绝不拿1补", async mode => {
    const fetchImpl = fakeFetch((data, api) => {
      if (api !== "adj_factor") return;
      if (mode === "wrong-stock") data.items[0][2] = "000001.SZ";
      if (mode === "duplicate") data.items.push([...data.items[0]]);
      if (mode === "future") data.items[0][1] = "20261109";
      if (mode === "before-window") data.items[0][1] = "20200101";
      if (mode === "invalid-date") data.items[0][1] = "20260230";
      if (mode === "missing-anchor") data.items.shift();
      if (mode === "missing-point") data.items.splice(10, 1);
      if (mode === "zero-factor") data.items[0][0] = 0;
      if (mode === "nan-factor") data.items[0][0] = "NaN";
    });
    const result = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      chartStatus: "unavailable",
      priceBasis: "unadjusted",
      candles: [],
      anchorDate: null,
      compositeAverage: null,
      chipAverageCost: null,
    });
    expect(result.note).toMatch(/拒绝|错股|无效/);
    expect(result.latestChipCost).toMatchObject({
      value: 10.5,
      asOf: input.asOf,
      status: "current",
    });
    // Factor failure must not suppress the independent real supplier quote.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each(["wrong-stock", "duplicate", "future"])(
    "cyq_perf %s不与该股图表混用",
    async mode => {
      const fetchImpl = fakeFetch((data, api) => {
        if (api !== "cyq_perf") return;
        if (mode === "wrong-stock") data.items[0][1] = "000001.SZ";
        if (mode === "duplicate") data.items.push([...data.items[0]]);
        if (mode === "future") data.items[0][2] = "20261109";
      });
      const result = await settle(
        getChart(db, input, { token: "offline", fetchImpl })
      );
      // Valid factors still supply OHLC/G, never mix invalid costs into them.
      expect(result.chartStatus).toBe("ready");
      expect(result.candles).toHaveLength(30);
      expect(result.candles.every(c => c.chipAverageCost === null)).toBe(true);
      expect(result.latestChipCost).toMatchObject({
        value: null,
        asOf: null,
        status: "missing",
      });
      expect(result.note).toMatch(/错股|重复|无效/);
    }
  );

  it("无token不发HTTP，环境token可用且不返回秘密或原始响应", async () => {
    const fetchImpl = fakeFetch();
    const noToken = await getChart(db, input, { fetchImpl });
    expect(noToken).toMatchObject({
      chartStatus: "unavailable",
      priceBasis: "unadjusted",
      candles: [],
    });
    expect(noToken.note).toContain("未配置");
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.stubEnv("TUSHARE_TOKEN", "offline-environment-secret");
    const configured = await settle(getChart(db, input, { fetchImpl }));
    expect(configured.chartStatus).toBe("ready");
    expect(JSON.stringify(configured)).not.toContain(
      "offline-environment-secret"
    );
    expect(configured.latestChipCost?.source).toBe(
      "Tushare cyq_perf.weight_avg"
    );
    expect(Object.keys(configured)).not.toContain("fields");
    expect(Object.keys(configured)).not.toContain("items");
  });

  it("无最后日真实股票K锚点不请求因子，但独立保留旧真实报价", async () => {
    candles.pop();
    const fetchImpl = fakeFetch();
    const result = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(result.chartStatus).toBe("unavailable");
    expect(result.note).toContain("锚点");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).api_name).toBe(
      "cyq_perf"
    );
    expect(result.latestChipCost).toMatchObject({
      value: 10.5,
      asOf: "2026-11-05",
      status: "previous",
    });
  });

  it("snapshot sourceVersion/asOf校验失败在HTTP前传播，不缓存错误base", async () => {
    chartBase.mockRejectedValueOnce(
      new RangeError("sourceVersion/asOf mismatch")
    );
    const fetchImpl = fakeFetch();
    await expect(
      getChart(
        db,
        { ...input, sourceVersion: "b".repeat(64) },
        { token: "offline", fetchImpl }
      )
    ).rejects.toThrow("sourceVersion/asOf");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(
      (await settle(getChart(db, input, { token: "offline", fetchImpl })))
        .chartStatus
    ).toBe("ready");
  });

  it.each([
    "http",
    "vendor-code",
    "json",
    "network",
    "missing-fields",
    "duplicate-fields",
  ])("%s失败有安全note，无重试、不泄露供应商错误", async mode => {
    const fetchImpl = vi.fn(async () => {
      if (mode === "network") throw new Error("secret-raw-vendor-token");
      return {
        ok: mode !== "http",
        json: async () => {
          if (mode === "json") throw new Error("secret-raw-vendor-token");
          const data = payload("adj_factor");
          if (mode === "missing-fields") data.fields[0] = "unknown";
          if (mode === "duplicate-fields") data.fields[0] = data.fields[1];
          return {
            code: mode === "vendor-code" ? -2001 : 0,
            msg: "secret-raw-vendor-token",
            data,
          };
        },
      } as Response;
    });
    const result = await settle(
      getChart(db, input, { token: "secret-raw-vendor-token", fetchImpl })
    );
    expect(result).toMatchObject({
      chartStatus: "unavailable",
      priceBasis: "unadjusted",
      candles: [],
    });
    expect(JSON.stringify(result)).not.toContain("secret-raw-vendor-token");
    expect(result.latestChipCost).toMatchObject({
      value: null,
      status: "missing",
    });
    // Exactly one request per independent API, never a retry.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each(["fetch", "json"])(
    "15秒限制覆盖不配合Abort的%s，无重试",
    async stage => {
      let signal: AbortSignal | undefined;
      const fetchImpl = vi.fn(async (_url: any, init: any) => {
        signal = init.signal;
        if (stage === "fetch") return new Promise<Response>(() => {});
        return { ok: true, json: () => new Promise(() => {}) } as Response;
      });
      const result = await settle(
        getChart(db, input, { token: "offline", fetchImpl })
      );
      expect(result.chartStatus).toBe("unavailable");
      expect(result.note).toContain("超时");
      expect(signal!.aborted).toBe(true);
      expect(result.latestChipCost).toMatchObject({
        value: null,
        status: "missing",
      });
      // An adapter ignoring abort still owns the exclusive actual-IO slot.
      // The cost waiting behind it expires instead of overlapping or backfilling.
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(result.note).toContain("排队超时");
    }
  );
});

describe("共享singleflight、短失败TTL、有限缓存与版本隔离", () => {
  it("同窗口短中长并发复用两请求，结果复制不污染缓存，base依然每次校验", async () => {
    const fetchImpl = fakeFetch();
    const presets: StockMAMonitorPeriod[][] = [
      [5, 10, 20],
      [20, 30, 60],
      [60, 120, 250],
    ];
    const results = await settle(
      Promise.all(
        presets.map(periods =>
          getChart(db, { ...input, periods }, { token: "offline", fetchImpl })
        )
      )
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(results.map(result => result.periods)).toEqual(presets);
    expect(results[1].candles.every(c => c.compositeAverage === null)).toBe(
      true
    );
    expect(results[2].candles.every(c => c.compositeAverage === null)).toBe(
      true
    );
    results[0].candles[0].open = -99;
    results[0].candles[0].averages[5] = -99;
    results[0].periods.pop();
    const again = await getChart(db, input, { token: "offline", fetchImpl });
    expect(again.candles[0].open).toBe(12);
    expect(again.candles[0].averages).toEqual({});
    expect(again.periods).toEqual([5, 10, 20]);
    expect(again.fetchedAt).toBe(results[1].fetchedAt);
    expect(chartBase).toHaveBeenCalledTimes(4);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("30分钟成功TTL按需复核，不自行启动外部工作", async () => {
    const fetchImpl = fakeFetch();
    await settle(getChart(db, input, { token: "offline", fetchImpl }));
    // Factor completed 2200ms before the cost: each independent TTL starts
    // at its own successful read, rather than stretching the older factor TTL.
    await vi.advanceTimersByTimeAsync(30 * 60_000 - 2200 - 1);
    await getChart(db, input, { token: "offline", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2202);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await settle(getChart(db, input, { token: "offline", fetchImpl }));
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("失败30秒内共享缓存，之后手动新调用恢复，不自动重试", async () => {
    let fail = true;
    const fetchImpl = fakeFetch(() => {
      if (fail) throw new Error("fixture failure");
    });
    const first = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    fail = false;
    expect(
      (await getChart(db, input, { token: "offline", fetchImpl })).chartStatus
    ).toBe("unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const recovered = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(first.chartStatus).toBe("unavailable");
    expect(recovered.chartStatus).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("同股同日期不同源版本不混外部窗口；不同股票与DB也隔离", async () => {
    let factor = 1;
    const fetchImpl = fakeFetch((data, api) => {
      if (api === "adj_factor")
        data.items.forEach(row => {
          row[0] = row[1] === "20261106" ? 2 : factor;
        });
    });
    const first = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    factor = 2;
    const secondInput = { ...input, sourceVersion: "b".repeat(64) };
    const second = await settle(
      getChart(db, secondInput, { token: "offline", fetchImpl })
    );
    expect(first.candles[0].close).toBe(6.5);
    expect(second.candles[0].close).toBe(13);
    expect(second.sourceVersion).toBe(secondInput.sourceVersion);
    const old = await getChart(db, input, { token: "offline", fetchImpl });
    expect(old.candles[0].close).toBe(6.5);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    await settle(
      getChart(
        db,
        { ...input, tsCode: "000001.SZ" },
        { token: "offline", fetchImpl }
      )
    );
    const otherDb = {
      execute: vi.fn(() => {
        throw new Error("forbidden DB");
      }),
    };
    await settle(getChart(otherDb, input, { token: "offline", fetchImpl }));
    expect(otherDb.execute).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(8);
  });

  it("不同股票也全局串行，调用完成到下一开始至少2200ms", async () => {
    let active = 0,
      maxActive = 0;
    const starts: number[] = [],
      ends: number[] = [];
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      active++;
      maxActive = Math.max(maxActive, active);
      starts.push(Date.now());
      await new Promise(resolve => setTimeout(resolve, 500));
      const body = JSON.parse(init.body);
      active--;
      ends.push(Date.now());
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: payload(body.api_name, body.params.ts_code),
        }),
      } as Response;
    });
    await settle(
      Promise.all(
        [input, { ...input, tsCode: "000001.SZ" }].map(request =>
          getChart(db, request, { token: "offline", fetchImpl })
        )
      )
    );
    expect(maxActive).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i] - ends[i - 1]).toBeGreaterThanOrEqual(2200);
  });

  it("缓存上限200，超出后淘汰旧窗口且不保存token全文", async () => {
    const fetchImpl = fakeFetch();
    for (let i = 0; i < 201; i++) {
      await settle(
        getChart(
          db,
          { ...input, sourceVersion: i.toString(16).padStart(64, "0") },
          { token: "offline", fetchImpl }
        )
      );
    }
    expect(fetchImpl).toHaveBeenCalledTimes(402);
    await settle(
      getChart(
        db,
        { ...input, sourceVersion: "0".repeat(64) },
        { token: "offline", fetchImpl }
      )
    );
    expect(fetchImpl).toHaveBeenCalledTimes(404);
  });
});

describe("latestChipCost与历史筹码复权、因子独立", () => {
  it("今日缺失使用此前最近正成本真实日期，winner_rate无效和未知复权不门控原值", async () => {
    vi.setSystemTime(new Date("2026-11-08T08:00:00Z"));
    const fetchImpl = fakeFetch((data, api) => {
      if (api === "cyq_perf") {
        data.items[0][0] = 0;
        data.items.forEach(row => (row[3] = null));
        data.items[1][0] = 9.8;
      }
    });
    const result = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      chartStatus: "ready",
      chipStatus: "unknown_basis",
      chipAsOf: null,
      chipAverageCost: null,
      latestChipCost: {
        value: 9.8,
        asOf: "2026-11-05",
        source: "Tushare cyq_perf.weight_avg",
        estimated: true,
        status: "previous",
      },
    });
    expect(result.candles.every(c => c.chipAverageCost === null)).toBe(true);
    expect(result.latestChipCost?.asOf).not.toBe("2026-11-08");
  });

  it("因子HTTP失败也继续一次成本请求，报价仍真实current而chart unavailable", async () => {
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      const request = JSON.parse(init.body);
      if (request.api_name === "adj_factor")
        throw new Error("private-factor-error");
      return {
        ok: true,
        json: async () => ({ code: 0, data: payload("cyq_perf") }),
      } as Response;
    });
    const result = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      chartStatus: "unavailable",
      candles: [],
      latestChipCost: { value: 10.5, asOf: input.asOf, status: "current" },
    });
    expect(
      fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).api_name)
    ).toEqual(["adj_factor", "cyq_perf"]);
    expect(JSON.stringify(result)).not.toContain("private-factor-error");
  });

  it("成本请求失败保留最近成功原值与fetchedAt，但不可倒填historic K或伪装成本请求成功", async () => {
    let fail = false;
    const fetchImpl = fakeFetch((_data, api) => {
      if (api === "cyq_perf" && fail) throw new Error("private-cost-error");
    });
    const first = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    fail = true;
    const secondInput = { ...input, sourceVersion: "b".repeat(64) };
    const second = await settle(
      getChart(db, secondInput, { token: "offline", fetchImpl })
    );
    expect(second).toMatchObject({
      chartStatus: "ready",
      sourceVersion: secondInput.sourceVersion,
      chipStatus: "missing",
      chipAsOf: null,
      chipAverageCost: null,
      latestChipCost: {
        value: 10.5,
        asOf: input.asOf,
        status: "cached",
        fetchedAt: first.latestChipCost?.fetchedAt,
      },
    });
    expect(second.candles.every(c => c.chipAverageCost === null)).toBe(true);
    expect(second.note).toContain("请求失败");
    second.latestChipCost!.value = -99;
    const again = await getChart(db, secondInput, {
      token: "offline",
      fetchImpl,
    });
    expect(again.latestChipCost!.value).toBe(10.5);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    const otherCredential = await settle(
      getChart(db, secondInput, { token: "another-credential", fetchImpl })
    );
    expect(otherCredential.latestChipCost).toMatchObject({
      value: null,
      asOf: null,
      status: "missing",
    });
  });

  it("成本失败缓存严格日期<=asOf，不使用未来已读报价；找不到真实记录就null", async () => {
    let fail = false;
    const fetchImpl = fakeFetch((data, api) => {
      if (api === "cyq_perf") {
        if (fail) throw new Error("private");
        data.items = [data.items[0]];
      }
    });
    await settle(getChart(db, input, { token: "offline", fetchImpl }));
    fail = true;
    candles.pop();
    warmupDates.pop();
    const past = await settle(
      getChart(
        db,
        { ...input, asOf: "2026-11-05", sourceVersion: "b".repeat(64) },
        { token: "offline", fetchImpl }
      )
    );
    expect(past.latestChipCost).toMatchObject({
      value: null,
      asOf: null,
      status: "missing",
    });
    expect(past.note).toContain("请求失败");
  });

  it("单股报价范围固定最近30个缓存市场日而非股票缺K日数", async () => {
    candles = candles.slice(-5);
    const fetchImpl = fakeFetch();
    await settle(getChart(db, input, { token: "offline", fetchImpl }));
    const request = fetchImpl.mock.calls
      .map(([, init]) => JSON.parse(init.body))
      .find(body => body.api_name === "cyq_perf");
    expect(request.params).toEqual({
      ts_code: input.tsCode,
      start_date: warmupDates.at(-30),
      end_date: "20261106",
    });
  });

  it("singleflight总上限200，繁忙结果不可用且没有无限排队", async () => {
    const { getStockChipCostWindow } = await import("./stock-monitor-chart");
    const fetchImpl = fakeFetch();
    const base = await chartBase(db, input);
    const requests = Array.from({ length: 201 }, (_, index) =>
      getStockChipCostWindow(
        db,
        { ...base, sourceVersion: index.toString(16).padStart(64, "0") },
        { token: "offline", fetchImpl }
      )
    );
    const busy = await requests[200];
    expect(busy).toMatchObject({
      ready: false,
      latestChipCost: { value: null, status: "missing" },
    });
    expect(busy.ready ? "" : busy.note).toContain("繁忙");
    const completed = await settle(Promise.all(requests));
    // Instant reads can start only at t=0,2200,...,24200 before 25s expires.
    expect(completed.filter(outcome => outcome.ready)).toHaveLength(12);
    expect(completed.filter(outcome => !outcome.ready)).toHaveLength(189);
    expect(fetchImpl).toHaveBeenCalledTimes(12);
    expect(completed[12].ready ? "" : completed[12].note).toContain("排队超时");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(12);
  });
});

describe("原始报价字段独立性", () => {
  it("供应商缺winner_rate字段不影响真实weight_avg单值，历史证据仍未知且不补线", async () => {
    const fetchImpl = fakeFetch((data, api) => {
      if (api !== "cyq_perf") return;
      data.fields.pop();
      data.items.forEach(row => row.pop());
    });
    const result = await settle(
      getChart(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      chartStatus: "ready",
      chipStatus: "unknown_basis",
      latestChipCost: { value: 10.5, asOf: input.asOf, status: "current" },
    });
    expect(result.candles.every(c => c.chipAverageCost === null)).toBe(true);
  });
});
