import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StockMAMonitorChartInput } from "../shared/stock-ma-monitor";
import type { StockComparisonDb } from "./stock-comparison";
import type { getStockChipDistribution as DistributionFunction } from "./stock-chip-distribution";
import type { getStockMAMonitorChart as ChartFunction } from "./stock-monitor-chart";

const { chartBase } = vi.hoisted(() => ({ chartBase: vi.fn() }));
vi.mock("./stock-ma-monitor", () => ({
  getStockMAMonitorChartBase: chartBase,
}));
let getDistribution: typeof DistributionFunction;
let getChart: typeof ChartFunction;
let db: StockComparisonDb;
const input: StockMAMonitorChartInput = {
  ledgerId: 37,
  tsCode: "600001.SH",
  periods: [5, 10, 20],
  asOf: "2026-11-06",
  sourceVersion: "a".repeat(64),
};
let dates: string[];
type Payload = { fields: string[]; items: unknown[][] };
function payload(request: any): Payload {
  const code = request.params.ts_code;
  if (request.api_name === "adj_factor")
    return {
      fields: ["ts_code", "trade_date", "adj_factor"],
      items: dates.map(date => [code, date, 2]),
    };
  if (request.api_name === "cyq_perf")
    return {
      fields: ["ts_code", "trade_date", "weight_avg", "winner_rate"],
      items: [
        [code, "20261105", 9.8, null],
        [code, "20261106", 10.5, null],
      ],
    };
  return {
    // Deliberately reversed sorting and reordered fields; zero retained.
    fields: ["percent", "trade_date", "price", "ts_code"],
    items: [
      [60, request.params.trade_date, "12", code],
      [0, request.params.trade_date, 9, code],
      [40, request.params.trade_date, 10, code],
    ],
  };
}
function fakeFetch(transform?: (data: Payload, request: any) => void) {
  return vi.fn(async (_url: any, init: any) => {
    const request = JSON.parse(init.body);
    const data = payload(request);
    transform?.(data, request);
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
  // Actual runtime is later than snapshot: do not substitute today.
  vi.setSystemTime(new Date("2026-11-08T08:00:00Z"));
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
  const day = new Date("2026-11-06T00:00:00Z");
  dates = [];
  while (dates.length < 350) {
    if (![0, 6].includes(day.getUTCDay()))
      dates.unshift(day.toISOString().slice(0, 10).replace(/-/g, ""));
    day.setUTCDate(day.getUTCDate() - 1);
  }
  chartBase.mockReset().mockImplementation(async (_db, request) => ({
    tsCode: request.tsCode,
    periods: request.periods.slice(),
    asOf: request.asOf,
    sourceVersion: request.sourceVersion,
    warmupDates: dates.slice(),
    candles: dates.slice(-30).map(date => ({
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`,
      open: 12,
      high: 14,
      low: 10,
      close: 13,
      averages: { 5: 12, 10: 11, 20: 10 },
      compositeAverage: 11.3,
    })),
  }));
  getDistribution = (await import("./stock-chip-distribution"))
    .getStockChipDistribution;
  getChart = (await import("./stock-monitor-chart")).getStockMAMonitorChart;
});
afterEach(() => {
  expect(db.execute).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("单股供应商原生筹码分布", () => {
  it("仅30个缓存市场日成本窗口+单日分布；真实快照日、升序、保留零且无复权/价差/盈亏", async () => {
    const fetchImpl = fakeFetch();
    const result = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      status: "ready",
      source: "Tushare cyq_chips",
      estimated: true,
      tsCode: input.tsCode,
      sourceVersion: input.sourceVersion,
      asOf: "2026-11-06",
      weightAvg: 10.5,
      latestChipCost: {
        value: 10.5,
        asOf: "2026-11-06",
        status: "current",
        estimated: true,
      },
      points: [
        { price: 9, percent: 0 },
        { price: 10, percent: 40 },
        { price: 12, percent: 60 },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const requests = fetchImpl.mock.calls.map(([, init]) =>
      JSON.parse(init.body)
    );
    expect(requests[0]).toMatchObject({
      api_name: "cyq_perf",
      params: {
        ts_code: input.tsCode,
        start_date: dates.at(-30),
        end_date: "20261106",
      },
    });
    expect(requests[1]).toMatchObject({
      api_name: "cyq_chips",
      params: {
        ts_code: input.tsCode,
        trade_date: "20261106",
        start_date: "20261106",
        end_date: "20261106",
      },
      fields: "ts_code,trade_date,price,percent",
    });
    expect(Object.keys(result)).not.toContain("priceBasis");
    expect(Object.keys(result)).not.toContain("rawClose");
    expect(Object.keys(result)).not.toContain("profit");
    expect(JSON.stringify(result)).not.toContain("offline");
  });

  it("缺当日成本用此前真实记录，无winner_rate或复权认证也展示；禁止使用今天", async () => {
    const fetchImpl = fakeFetch((data, request) => {
      if (request.api_name === "cyq_perf") data.items.pop();
    });
    const result = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      status: "ready",
      asOf: "2026-11-05",
      weightAvg: 9.8,
      latestChipCost: { value: 9.8, asOf: "2026-11-05", status: "previous" },
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).params.trade_date).toBe(
      "20261105"
    );
  });

  it("最新分布空仅回退前一真实日一次，weightAvg按分布日而最新报价独立", async () => {
    const fetchImpl = fakeFetch((data, request) => {
      if (
        request.api_name === "cyq_chips" &&
        request.params.trade_date === "20261106"
      )
        data.items = [];
    });
    const result = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      status: "ready",
      asOf: "2026-11-05",
      weightAvg: 9.8,
      latestChipCost: { value: 10.5, asOf: "2026-11-06", status: "current" },
    });
    expect(result.note).toContain("前一个真实");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("两日分布都空不得第三次回退或造图；报价仍真实", async () => {
    const fetchImpl = fakeFetch((data, request) => {
      if (request.api_name === "cyq_chips") data.items = [];
    });
    const result = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      status: "missing",
      asOf: null,
      weightAvg: null,
      points: [],
      latestChipCost: { value: 10.5, asOf: "2026-11-06" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("没有任何真实成本记录只请求一次且null；没有正成本但有真实日期可原生分布", async () => {
    const fetchImpl = fakeFetch((data, request) => {
      if (request.api_name === "cyq_perf") data.items = [];
    });
    const result = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      status: "missing",
      points: [],
      latestChipCost: { value: null, asOf: null, status: "missing" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const zeroFetch = fakeFetch((data, request) => {
      if (request.api_name === "cyq_perf")
        data.items.forEach(row => (row[2] = 0));
    });
    const native = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl: zeroFetch })
    );
    expect(native).toMatchObject({
      status: "ready",
      asOf: "2026-11-06",
      weightAvg: null,
      latestChipCost: { value: null, asOf: null },
    });
  });

  it.each([
    "wrong-stock",
    "wrong-day",
    "future",
    "invalid-day",
    "duplicate-price",
    "zero-price",
    "nan-price",
    "negative-percent",
    "over-percent",
    "invalid-percent",
    "total",
    "too-many",
    "missing-fields",
    "duplicate-fields",
  ])("%s拒绝展示且不回退掩盖错误", async mode => {
    const fetchImpl = fakeFetch((data, request) => {
      if (request.api_name !== "cyq_chips") return;
      if (mode === "wrong-stock") data.items[0][3] = "000001.SZ";
      if (mode === "wrong-day") data.items[0][1] = "20261105";
      if (mode === "future") data.items[0][1] = "20261109";
      if (mode === "invalid-day") data.items[0][1] = "20260230";
      if (mode === "duplicate-price") data.items[1][2] = "12.0";
      if (mode === "zero-price") data.items[0][2] = 0;
      if (mode === "nan-price") data.items[0][2] = "NaN";
      if (mode === "negative-percent") data.items[0][0] = -1;
      if (mode === "over-percent") data.items[0][0] = 101;
      if (mode === "invalid-percent") data.items[0][0] = "60%";
      if (mode === "total") data.items[0][0] = 58.9;
      if (mode === "too-many")
        data.items = Array.from({ length: 6001 }, () => [...data.items[0]]);
      if (mode === "missing-fields") data.fields[0] = "unknown";
      if (mode === "duplicate-fields") data.fields[0] = data.fields[1];
    });
    const result = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(result).toMatchObject({
      status: "unavailable",
      points: [],
      asOf: null,
      weightAvg: null,
      latestChipCost: { value: 10.5, asOf: "2026-11-06" },
    });
    expect(result.note).toMatch(/拒绝|无效/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([99, 101])("总占比边界%s保留原始百分数不归一化", async total => {
    const fetchImpl = fakeFetch((data, request) => {
      if (request.api_name === "cyq_chips") data.items[0][0] = total - 40;
    });
    const result = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(result.status).toBe("ready");
    expect(result.points.reduce((sum, point) => sum + point.percent, 0)).toBe(
      total
    );
  });

  it.each([
    "network",
    "http",
    "vendor",
    "json",
    "fetch-timeout",
    "json-timeout",
  ])(
    "分布%s失败明确unavailable，15秒fetch/json，无retry或错误泄漏",
    async mode => {
      const fetchImpl = vi.fn(async (_url: any, init: any) => {
        const request = JSON.parse(init.body);
        if (request.api_name === "cyq_perf")
          return {
            ok: true,
            json: async () => ({ code: 0, data: payload(request) }),
          } as Response;
        if (mode === "network") throw new Error("private-provider-response");
        if (mode === "fetch-timeout") return new Promise<Response>(() => {});
        return {
          ok: mode !== "http",
          json: async () => {
            if (mode === "json") throw new Error("private-provider-response");
            if (mode === "json-timeout") return new Promise(() => {});
            return {
              code: mode === "vendor" ? -2001 : 0,
              msg: "private-provider-response",
              data: payload(request),
            };
          },
        } as Response;
      });
      const result = await settle(
        getDistribution(db, input, { token: "offline", fetchImpl })
      );
      expect(result).toMatchObject({
        status: "unavailable",
        points: [],
        latestChipCost: { value: 10.5 },
      });
      expect(JSON.stringify(result)).not.toContain("private-provider-response");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      if (mode.includes("timeout"))
        expect(fetchImpl.mock.calls[1][1].signal.aborted).toBe(true);
    }
  );

  it("base校验失败HTTP前传播，无token不请求且原值null", async () => {
    const fetchImpl = fakeFetch();
    chartBase.mockRejectedValueOnce(new RangeError("snapshot mismatch"));
    await expect(
      getDistribution(db, input, { token: "offline", fetchImpl })
    ).rejects.toThrow("snapshot mismatch");
    expect(fetchImpl).not.toHaveBeenCalled();
    const missing = await getDistribution(db, input, { fetchImpl });
    expect(missing).toMatchObject({
      status: "unavailable",
      points: [],
      latestChipCost: { value: null },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("与图表共享限速、缓存和凭证隔离", () => {
  it("图表/分布/不同周期并发仅一次cyq_perf且全局完成后2200ms串行", async () => {
    let active = 0,
      maximum = 0;
    const starts: number[] = [],
      ends: number[] = [],
      apis: string[] = [];
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      active++;
      maximum = Math.max(active, maximum);
      starts.push(Date.now());
      const request = JSON.parse(init.body);
      apis.push(request.api_name);
      await new Promise(resolve => setTimeout(resolve, 500));
      return {
        ok: true,
        json: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          active--;
          ends.push(Date.now());
          return { code: 0, data: payload(request) };
        },
      } as Response;
    });
    const results = await settle(
      Promise.all([
        getChart(db, input, { token: "offline", fetchImpl }),
        getDistribution(db, input, { token: "offline", fetchImpl }),
        getDistribution(
          db,
          { ...input, periods: [60, 120, 250] },
          { token: "offline", fetchImpl }
        ),
      ])
    );
    expect(
      results.map(result =>
        "status" in result ? result.status : result.chartStatus
      )
    ).toEqual(["ready", "ready", "ready"]);
    expect(maximum).toBe(1);
    expect(apis).toEqual(["adj_factor", "cyq_perf", "cyq_chips"]);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i] - ends[i - 1]).toBeGreaterThanOrEqual(2200);
    results[1].latestChipCost.value = -99;
    const distribution = results[1] as Awaited<
      ReturnType<typeof DistributionFunction>
    >;
    distribution.points[0].price = -99;
    const again = await getDistribution(db, input, {
      token: "offline",
      fetchImpl,
    });
    expect(again.points[0].price).toBe(9);
    expect(again.latestChipCost.value).toBe(10.5);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(chartBase).toHaveBeenCalledTimes(4);
  });

  it("成本请求失败保留此前真实缓存原值，分布仍不可用，隔离token/DB/stock且不取未来成本", async () => {
    let fail = false;
    const fetchImpl = fakeFetch((data, request) => {
      if (request.api_name === "cyq_perf" && fail) throw new Error("private");
    });
    const first = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    fail = true;
    const failed = await settle(
      getDistribution(
        db,
        { ...input, sourceVersion: "b".repeat(64) },
        { token: "offline", fetchImpl }
      )
    );
    expect(failed).toMatchObject({
      status: "unavailable",
      points: [],
      latestChipCost: {
        value: 10.5,
        asOf: "2026-11-06",
        status: "cached",
        fetchedAt: first.latestChipCost.fetchedAt,
      },
    });
    const prior = await settle(
      getDistribution(
        db,
        { ...input, asOf: "2026-11-05", sourceVersion: "c".repeat(64) },
        { token: "offline", fetchImpl }
      )
    );
    expect(prior.latestChipCost).toMatchObject({
      value: 9.8,
      asOf: "2026-11-05",
      status: "cached",
    });
    for (const [otherDb, request, token] of [
      [db, input, "other-secret"],
      [
        {
          execute: vi.fn(() => {
            throw new Error("forbidden DB");
          }),
        },
        input,
        "offline",
      ],
      [db, { ...input, tsCode: "000001.SZ" }, "offline"],
    ] as const) {
      const isolated = await settle(
        getDistribution(otherDb, request, { token, fetchImpl })
      );
      expect(isolated.latestChipCost).toMatchObject({
        value: null,
        asOf: null,
        status: "missing",
      });
      expect(otherDb.execute).not.toHaveBeenCalled();
    }
  });

  it("当日成功6小时且cache-before-cost；失败30秒按需复核，没有后台请求", async () => {
    let fail = false;
    const fetchImpl = fakeFetch((_data, request) => {
      if (request.api_name === "cyq_chips" && fail) throw new Error("private");
    });
    const first = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    const again = await getDistribution(db, input, {
      token: "offline",
      fetchImpl,
    });
    expect(again.fetchedAt).toBe(first.fetchedAt);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30 * 60_000 + 1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    fail = true;
    // The cost window is already expired, yet the complete publication hits
    // without either an extra cost read or a chips read.
    expect(
      (await getDistribution(db, input, { token: "offline", fetchImpl }))
        .fetchedAt
    ).toBe(first.fetchedAt);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6 * 60 * 60_000 - 30 * 60_000 - 2);
    expect(
      (await getDistribution(db, input, { token: "offline", fetchImpl })).status
    ).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2);
    const unavailable = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(unavailable.status).toBe("unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    fail = false;
    expect(
      (await getDistribution(db, input, { token: "offline", fetchImpl })).status
    ).toBe("unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(30_001);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(
      (
        await settle(
          getDistribution(db, input, { token: "offline", fetchImpl })
        )
      ).status
    ).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("不同股票的分布和图表也共用一个全局队列", async () => {
    const starts: number[] = [],
      ends: number[] = [];
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      starts.push(Date.now());
      await new Promise(resolve => setTimeout(resolve, 200));
      const request = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => {
          ends.push(Date.now());
          return { code: 0, data: payload(request) };
        },
      } as Response;
    });
    await settle(
      Promise.all([
        getDistribution(db, input, { token: "offline", fetchImpl }),
        getChart(
          db,
          { ...input, tsCode: "000001.SZ" },
          { token: "offline", fetchImpl }
        ),
      ])
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i] - ends[i - 1]).toBeGreaterThanOrEqual(2200);
  });
});

describe("分布优先级、整体期限和完整发布缓存", () => {
  it("普通chart同股cyq_perf已经排队时点击提升共享任务，不重复HTTP并优先chips", async () => {
    const { readApi } = await import("./stock-monitor-chart");
    const fetchImpl = fakeFetch();
    // Establish the completion-to-next-start gap before any chart loaders.
    await settle(
      readApi(
        "cyq_perf",
        input.tsCode,
        dates.at(-30)!,
        "20261106",
        "offline",
        fetchImpl
      )
    );
    const background = getChart(
      db,
      { ...input, tsCode: "000001.SZ" },
      { token: "offline", fetchImpl }
    );
    const target = getChart(db, input, { token: "offline", fetchImpl });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const clicked = getDistribution(db, input, { token: "offline", fetchImpl });
    const results = await settle(Promise.all([background, target, clicked]));
    expect(results[2].status).toBe("ready");
    const requests = fetchImpl.mock.calls.map(([, init]) =>
      JSON.parse(init.body)
    );
    expect(
      requests
        .slice(1, 3)
        .map(request => [request.api_name, request.params.ts_code])
    ).toEqual([
      ["cyq_perf", input.tsCode],
      ["cyq_chips", input.tsCode],
    ]);
    expect(
      requests.filter(
        request =>
          request.api_name === "cyq_perf" &&
          request.params.ts_code === input.tsCode
      )
    ).toHaveLength(2); // seed + ONE shared cost
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("从已校验base起25秒返回unavailable；后来共享cost完成不能为过期点击发chips", async () => {
    let release!: () => void;
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      const request = JSON.parse(init.body);
      if (request.api_name === "adj_factor")
        await new Promise<void>(resolve => {
          release = resolve;
        });
      return {
        ok: true,
        json: async () => ({ code: 0, data: payload(request) }),
      } as Response;
    });
    const chart = getChart(db, input, { token: "offline", fetchImpl });
    await vi.advanceTimersByTimeAsync(0);
    // Start click after the normal cost read has already queued; its absolute
    // queue limit expires at t=25s, but this click has its own t=26s deadline.
    await vi.advanceTimersByTimeAsync(1000);
    const clicked = getDistribution(db, input, { token: "offline", fetchImpl });
    await vi.advanceTimersByTimeAsync(23_000);
    release();
    await vi.advanceTimersByTimeAsync(2000);
    const result = await clicked;
    expect(result.status).toBe("unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("offline");
    await vi.runAllTimersAsync();
    await chart;
    expect(
      fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).api_name)
    ).toEqual(["adj_factor"]);
  });

  it("25秒整体deadline取消排队chips；已发出的共享cost仍能供普通调用成功", async () => {
    const { readApi, getStockChipCostWindow } = await import(
      "./stock-monitor-chart"
    );
    let releaseBlock!: () => void;
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      const request = JSON.parse(init.body);
      if (request.api_name === "cyq_perf")
        await new Promise(resolve => setTimeout(resolve, 14_000));
      if (request.api_name === "adj_factor")
        await new Promise<void>(resolve => {
          releaseBlock = resolve;
        });
      return {
        ok: true,
        json: async () => ({ code: 0, data: payload(request) }),
      } as Response;
    });
    const clicked = getDistribution(db, input, { token: "offline", fetchImpl });
    await vi.advanceTimersByTimeAsync(13_000);
    // Queued before cost finishes, so this high-priority read is ahead of chips.
    const blocker = readApi(
      "adj_factor",
      "000001.SZ",
      dates[0],
      "20261106",
      "offline",
      fetchImpl,
      { priority: "high" }
    ).catch(error => error);
    await vi.advanceTimersByTimeAsync(3200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(8800);
    const expired = await clicked;
    expect(expired.status).toBe("unavailable");
    expect(expired.note).toContain("期限");
    // Release blocker after the click expired: its queued chips must be gone.
    releaseBlock();
    await vi.runAllTimersAsync();
    await blocker;
    expect(
      fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).api_name)
    ).toEqual(["cyq_perf", "adj_factor"]);
    const base = await chartBase(db, input);
    expect(
      (await getStockChipCostWindow(db, base, { token: "offline", fetchImpl }))
        .ready
    ).toBe(true);
  });

  it("cost+chips耗尽25秒时返回安全unavailable，活动chips可完成但不能再发fallback", async () => {
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      const request = JSON.parse(init.body);
      await new Promise(resolve => setTimeout(resolve, 14_000));
      const data = payload(request);
      if (request.api_name === "cyq_chips") data.items = [];
      return { ok: true, json: async () => ({ code: 0, data }) } as Response;
    });
    const start = Date.now();
    const clicked = getDistribution(db, input, { token: "offline", fetchImpl });
    await vi.advanceTimersByTimeAsync(25_000);
    const expired = await clicked;
    expect(Date.now() - start).toBe(25_000);
    expect(expired).toMatchObject({
      status: "unavailable",
      points: [],
      asOf: null,
      latestChipCost: { value: 10.5, asOf: input.asOf },
    });
    expect(expired.note).toContain("期限");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].signal.aborted).toBe(false); // Active shared read not cancelled.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("只有分布订阅的cost排队耗尽整体期限即移除，之后不得补跑", async () => {
    const { readApi } = await import("./stock-monitor-chart");
    let release!: () => void;
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      const request = JSON.parse(init.body);
      if (request.api_name === "adj_factor")
        await new Promise<void>(resolve => {
          release = resolve;
        });
      return {
        ok: true,
        json: async () => ({ code: 0, data: payload(request) }),
      } as Response;
    });
    const blocking = readApi(
      "adj_factor",
      "000001.SZ",
      dates[0],
      "20261106",
      "offline",
      fetchImpl
    ).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    const clicked = getDistribution(db, input, { token: "offline", fetchImpl });
    await vi.advanceTimersByTimeAsync(25_000);
    expect((await clicked).status).toBe("unavailable");
    release();
    await vi.runAllTimersAsync();
    await blocking;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("前日fallback成功最多60秒，随后重新按需查询当日发布，缓存不能伪装为当日", async () => {
    let published = false;
    const fetchImpl = fakeFetch((data, request) => {
      if (
        request.api_name === "cyq_chips" &&
        request.params.trade_date === "20261106" &&
        !published
      )
        data.items = [];
    });
    const first = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(first.asOf).toBe("2026-11-05");
    expect(first.weightAvg).toBe(9.8);
    published = true;
    await vi.advanceTimersByTimeAsync(59_999);
    const stillPrevious = await getDistribution(db, input, {
      token: "offline",
      fetchImpl,
    });
    expect(stillPrevious.asOf).toBe("2026-11-05");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const current = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(current).toMatchObject({
      status: "ready",
      asOf: input.asOf,
      weightAvg: 10.5,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4); // Cost already current and reused.
  });

  it("缺当日cyq_perf时此前完整结果只短缓存，60秒后复核成本即可读新发布日", async () => {
    let published = false;
    const fetchImpl = fakeFetch((data, request) => {
      if (request.api_name === "cyq_perf" && !published) data.items.pop();
    });
    const first = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(first.asOf).toBe("2026-11-05");
    published = true;
    await vi.advanceTimersByTimeAsync(60_001);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const current = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(current).toMatchObject({
      status: "ready",
      asOf: input.asOf,
      latestChipCost: { value: 10.5, asOf: input.asOf, status: "current" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("完整成功cache在cost过期后复制points/quote，仍每次base校验，校验失败绝不返回缓存", async () => {
    const fetchImpl = fakeFetch();
    const first = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    const fetchedAt = first.latestChipCost.fetchedAt;
    first.points[0].price = -1;
    first.latestChipCost.value = -1;
    await vi.advanceTimersByTimeAsync(31 * 60_000);
    const again = await getDistribution(db, input, {
      token: "offline",
      fetchImpl,
    });
    expect(again.points[0].price).toBe(9);
    expect(again.latestChipCost).toMatchObject({
      value: 10.5,
      asOf: input.asOf,
      source: "Tushare cyq_perf.weight_avg",
      estimated: true,
      fetchedAt,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(chartBase).toHaveBeenCalledTimes(2);
    chartBase.mockRejectedValueOnce(new RangeError("version mismatch"));
    await expect(
      getDistribution(db, input, { token: "offline", fetchImpl })
    ).rejects.toThrow("version mismatch");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("完整成功按sourceVersion/DB/fetch/token/stock/请求日期隔离，错版本失败不拿旧成功遮盖", async () => {
    let fail = false;
    const fetchImpl = fakeFetch((_data, request) => {
      if (request.api_name === "cyq_perf" && fail) throw new Error("secret");
    });
    await settle(getDistribution(db, input, { token: "offline", fetchImpl }));
    fail = true;
    const otherDb = {
      execute: vi.fn(() => {
        throw new Error("forbidden DB");
      }),
    };
    const otherFetch = fakeFetch((_data, request) => {
      if (request.api_name === "cyq_perf") throw new Error("secret");
    });
    for (const [database, request, token, adapter] of [
      [db, { ...input, sourceVersion: "b".repeat(64) }, "offline", fetchImpl],
      [otherDb, input, "offline", fetchImpl],
      [db, input, "other-token", fetchImpl],
      [db, { ...input, tsCode: "000001.SZ" }, "offline", fetchImpl],
      [db, input, "offline", otherFetch],
      [
        db,
        { ...input, asOf: "2026-11-05", sourceVersion: "c".repeat(64) },
        "offline",
        fetchImpl,
      ],
    ] as const) {
      const result = await settle(
        getDistribution(database, request, { token, fetchImpl: adapter })
      );
      expect(result).toMatchObject({
        status: "unavailable",
        points: [],
        asOf: null,
      });
    }
    expect(otherDb.execute).not.toHaveBeenCalled();
    expect(
      (await getDistribution(db, input, { token: "offline", fetchImpl })).status
    ).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledTimes(7);
    expect(otherFetch).toHaveBeenCalledTimes(1);
  });

  it("两日空分布只有30秒失败TTL，不用成功6小时TTL或后台补读", async () => {
    let published = false;
    const fetchImpl = fakeFetch((data, request) => {
      if (request.api_name === "cyq_chips" && !published) data.items = [];
    });
    expect(
      (
        await settle(
          getDistribution(db, input, { token: "offline", fetchImpl })
        )
      ).status
    ).toBe("missing");
    published = true;
    await vi.advanceTimersByTimeAsync(29_999);
    expect(
      (await getDistribution(db, input, { token: "offline", fetchImpl })).status
    ).toBe("missing");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(
      (
        await settle(
          getDistribution(db, input, { token: "offline", fetchImpl })
        )
      ).status
    ).toBe("ready");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe("共享分布订阅期限彼此独立", () => {
  it("首个点击25秒超期不取消较晚点击；仅一次cost/chips且共享成功可缓存", async () => {
    const fetchImpl = vi.fn(async (_url: any, init: any) => {
      const request = JSON.parse(init.body);
      await new Promise(resolve => setTimeout(resolve, 14_000));
      return {
        ok: true,
        json: async () => ({ code: 0, data: payload(request) }),
      } as Response;
    });
    const start = Date.now();
    const early = getDistribution(db, input, { token: "offline", fetchImpl });
    await vi.advanceTimersByTimeAsync(10_000);
    const late = getDistribution(db, input, { token: "offline", fetchImpl });
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await early).status).toBe("unavailable");
    expect(Date.now() - start).toBe(25_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(5200);
    const successful = await late;
    expect(successful).toMatchObject({ status: "ready", asOf: input.asOf });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      (await getDistribution(db, input, { token: "offline", fetchImpl }))
        .fetchedAt
    ).toBe(successful.fetchedAt);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(chartBase).toHaveBeenCalledTimes(3);
  });
});

describe("完整缓存真实请求日与已校验截止日隔离", () => {
  it("同sourceVersion的此前请求不能拿到另一截止日fallback缓存携带的未来latest报价", async () => {
    const fetchImpl = fakeFetch((data, request) => {
      if (
        request.api_name === "cyq_perf" &&
        request.params.end_date === "20261105"
      )
        data.items.pop();
      if (
        request.api_name === "cyq_chips" &&
        request.params.trade_date === "20261106"
      )
        data.items = [];
    });
    const fallback = await settle(
      getDistribution(db, input, { token: "offline", fetchImpl })
    );
    expect(fallback).toMatchObject({
      asOf: "2026-11-05",
      latestChipCost: { asOf: "2026-11-06", value: 10.5 },
    });
    const previous = await settle(
      getDistribution(
        db,
        { ...input, asOf: "2026-11-05" },
        { token: "offline", fetchImpl }
      )
    );
    expect(previous).toMatchObject({
      asOf: "2026-11-05",
      weightAvg: 9.8,
      latestChipCost: { asOf: "2026-11-05", value: 9.8, status: "current" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(JSON.parse(fetchImpl.mock.calls[4][1].body).params.trade_date).toBe(
      "20261105"
    );
  });
});
