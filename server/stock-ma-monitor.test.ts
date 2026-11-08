import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  getStockMAMonitor,
  getStockMAMonitorChartBase,
} from "./stock-ma-monitor";
import type { StockComparisonDb } from "./stock-comparison";
import { STOCK_MA_MONITOR_PRESETS } from "../shared/stock-ma-monitor";
import type {
  StockMAMonitorChartInput,
  StockMAMonitorInput,
  StockMAMonitorMarket,
  StockMAMonitorPeriod,
} from "../shared/stock-ma-monitor";

// Deterministic numeric fixtures only; never import DB boot, router, collector,
// external HTTP or browser. No production connection or source writes.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T08:00:00Z"));
});
afterEach(() => vi.useRealTimers());
const input: StockMAMonitorInput = {
  market: "all",
  periods: [5, 10, 20],
  page: 1,
  pageSize: 100,
  sort: "code",
};
type Quote = Record<string, unknown> & { trade_date: string };
type Stock = {
  ts_code: string;
  name: string;
  list_status: string;
  rows: Quote[];
};
function dates(n = 100, end = "2026-11-06"): string[] {
  const found: string[] = [],
    d = new Date(`${end}T00:00:00Z`);
  while (found.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)
      found.unshift(d.toISOString().slice(0, 10).replace(/-/g, ""));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return found;
}
function stock(code = "600001.SH", n = 100): Stock {
  return {
    ts_code: code,
    name: `测试${code}`,
    list_status: "L",
    rows: dates(n).map((trade_date, i) => {
      const close = 10 + i / 10;
      return {
        trade_date,
        open: close - 0.01,
        high: close + 1,
        low: close - 1,
        close,
        pre_close: i ? 10 + (i - 1) / 10 : 9.9,
        vol: 100,
        amount: (close - 0.05) * 10,
        pct_chg: "3.1234",
      };
    }),
  };
}
function flat(s: Stock, close = 10): Stock {
  s.rows = s.rows.map(q => ({
    ...q,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    pre_close: close,
    vol: 100,
    amount: close * 10,
  }));
  return s;
}
function trendAfterFlat(code: string, days: number, history = 100): Stock {
  const s = flat(stock(code, history));
  s.rows.forEach((q, i) => {
    if (i < s.rows.length - days) return;
    const close = 10 + (i - (s.rows.length - days) + 1) / 10;
    Object.assign(q, {
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      pre_close: close - 0.1,
      amount: (close - 0.05) * 10,
    });
  });
  return s;
}
function mockDb(
  stocks: Stock[],
  sourceDates?: string[],
  timestamp: unknown = "2026-11-06T08:12:34Z",
  direct = false
) {
  const versionState = {
    dailyEpoch: "2026-11-06T07:00:00Z" as string | null,
    basicEpoch: "2026-11-06T06:00:00Z" as string | null,
    timestamp,
    failMetadata: false,
  };
  const execute = vi.fn(
    async (sql: string, params: any[] = []): Promise<unknown> => {
      let result: unknown;
      if (sql.includes("information_schema.TABLES")) {
        if (versionState.failMetadata) throw new Error("version probe failed");
        result = [
          { table_name: "ts_daily", table_updated_at: versionState.dailyEpoch },
          {
            table_name: "ts_stock_basic",
            table_updated_at: versionState.basicEpoch,
          },
        ];
      } else if (sql.includes("AS row_count")) {
        const selected = new Set(
          params.filter(p => typeof p === "string" && /^\d{8}$/.test(p))
        );
        const grouped = new Map<
          string,
          { count: number; sum: bigint; xor: bigint }
        >();
        for (const sample of stocks)
          for (const q of sample.rows) {
            if (!selected.has(q.trade_date)) continue;
            const group = grouped.get(q.trade_date) ?? {
              count: 0,
              sum: 0n,
              xor: 0n,
            };
            // Fixture-only checksum; production uses actual MySQL CRC32 aggregates.
            const digest = BigInt(
              "0x" +
                createHash("sha256")
                  .update(JSON.stringify([sample.ts_code, q]))
                  .digest("hex")
                  .slice(0, 8)
            );
            group.count++;
            group.sum += digest;
            group.xor ^= digest;
            grouped.set(q.trade_date, group);
          }
        // sourceDates model other market stocks, not a fabricated candle for
        // the tested single stock which may be suspended on this market day.
        for (const date of sourceDates ?? []) {
          if (selected.has(date) && !grouped.has(date))
            grouped.set(date, { count: 1, sum: 1n, xor: 1n });
        }
        result = [...grouped]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([trade_date, g]) => ({
            trade_date,
            row_count: g.count,
            data_updated_at: versionState.timestamp,
            data_checksum: g.sum.toString(),
            data_xor: g.xor.toString(),
          }));
      } else if (sql.includes("AS data_updated_at"))
        result = [{ data_updated_at: versionState.timestamp }];
      else if (sql.includes("SELECT DISTINCT")) {
        const all =
          sourceDates ?? stocks.flatMap(s => s.rows.map(q => q.trade_date));
        result = Array.from(new Set(all))
          .filter(d => d <= params[0])
          .sort()
          .reverse()
          .slice(0, Number(sql.match(/LIMIT\s+(\d+)/i)![1]))
          .map(trade_date => ({ trade_date }));
      } else if (sql.includes("SELECT b.ts_code")) {
        result = stocks.map(({ rows: _rows, ...s }) => s).reverse();
      } else if (sql.includes("SELECT d.ts_code")) {
        const [start, end, ...exact] = params;
        result = stocks
          .flatMap(s =>
            s.rows
              .filter(
                q =>
                  q.trade_date >= start &&
                  q.trade_date <= end &&
                  exact.includes(q.trade_date)
              )
              .map(q => ({ ...q, ts_code: s.ts_code }))
          )
          .reverse();
      } else throw new Error("Unexpected query");
      return direct ? result : [result, []];
    }
  );
  return { execute, versionState };
}

function rawCalls(db: { execute: ReturnType<typeof vi.fn> }) {
  return db.execute.mock.calls.filter(([sql]) =>
    String(sql).includes("SELECT d.ts_code")
  );
}
function dateCalls(db: { execute: ReturnType<typeof vi.fn> }) {
  return db.execute.mock.calls.filter(([sql]) =>
    String(sql).includes("SELECT DISTINCT")
  );
}
function iso(date: string) {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
}

// Independent oracle: actual sum(amount)/sum(volume), not mean of day prices
// or any production calculation helper.
function oracle(rows: Quote[], period: number) {
  const recent = rows.slice(-period);
  return (
    (10 * recent.reduce((a, q) => a + Number(q.amount), 0)) /
    recent.reduce((v, q) => v + Number(q.vol), 0)
  );
}

describe("量额VWAP、严格排列和完整样本", () => {
  it("千元/手转元/股；当前和每根K的5/10/20均由实际量额之和计算", async () => {
    const s = stock();
    const r = await getStockMAMonitor(mockDb([s]), input);
    expect(r).toMatchObject({
      asOf: "2026-11-06",
      eligibleCount: 1,
      excludedCount: 0,
      total: 1,
      method: "amount-volume-weighted",
      mode: "close-confirmed",
      dataUpdatedAt: "2026-11-06T08:12:34Z",
    });
    const item = r.items[0];
    expect(item.close).toBe(Number(s.rows.at(-1)!.close));
    expect(item.changePercent).toBe(3.1234);
    expect(item.candles).toHaveLength(30);
    expect(item.candles[0].date).toBe(iso(s.rows[70].trade_date));
    expect(item.candles.at(-1)!.date).toBe(r.asOf);
    for (const period of [5, 10, 20] as const) {
      expect(item.averages[period]).toBeCloseTo(oracle(s.rows, period), 10);
      expect(item.candles[0].averages[period]).toBeCloseTo(
        oracle(s.rows.slice(0, 71), period),
        10
      );
    }
    expect(item.averages[5]).not.toBeCloseTo(
      s.rows.slice(-5).reduce((sum, q) => sum + Number(q.close), 0) / 5,
      5
    );
  });

  it("非每日均价平均：不均量下用SUM(amount)/SUM(vol)，不使用close加权", async () => {
    const s = stock("600001.SH", 20);
    s.rows.forEach((q, i) => {
      const price = i < 10 ? 4 : i < 15 ? 5 : i < 19 ? 40 : 10;
      const vol = i < 10 ? 100 : i < 15 ? 100 : i < 19 ? 1 : 1000;
      Object.assign(q, {
        open: 50,
        high: 60,
        low: 1,
        close: 50,
        pre_close: 50,
        vol,
        amount: (price * vol) / 10,
      });
    });
    const r = await getStockMAMonitor(mockDb([s]), input);
    expect(r.total).toBe(1);
    for (const p of [5, 10, 20] as const)
      expect(r.items[0].averages[p]).toBeCloseTo(oracle(s.rows, p), 10);
    expect(r.items[0].averages[5]).not.toBeCloseTo(34, 5); // (40*4+10)/5
    expect(r.items[0].averages[5]).not.toBe(50); // all closing prices are 50
    expect(r.items[0].consecutiveIsLowerBound).toBe(true);
  });

  it("等号不符合，不能用显示四舍五入或浮点误差制造严格大于", async () => {
    const s = flat(stock());
    expect(await getStockMAMonitor(mockDb([s]), input)).toMatchObject({
      eligibleCount: 1,
      total: 0,
      excludedCount: 0,
    });
    const equalClose = stock();
    equalClose.rows.slice(-5).forEach(q => {
      q.amount = Number(equalClose.rows.at(-1)!.close) * 10;
    });
    expect((await getStockMAMonitor(mockDb([equalClose]), input)).total).toBe(
      0
    );
  });

  it("5/20组合不强制10档参与；输入顺序归一且不改变调用方数组", async () => {
    const s = flat(stock());
    s.rows.slice(-20).forEach((q, i) => {
      q.low = 1;
      q.high = 30;
      q.amount = (i < 10 ? 1 : i < 15 ? 15 : 8) * 10;
    });
    const db = mockDb([s]);
    const periods = [20, 5] as (5 | 20)[];
    const r = await getStockMAMonitor(db, { ...input, periods });
    expect(r.periods).toEqual([5, 20]);
    expect(periods).toEqual([20, 5]);
    expect(r.total).toBe(1);
    expect((await getStockMAMonitor(db, input)).total).toBe(0);
    expect(
      (await getStockMAMonitor(db, { ...input, periods: [5, 10] })).total
    ).toBe(0);
    expect(rawCalls(db)).toHaveLength(1);
  });

  it("上市无日线、最新日缺失、窗口缺日、零量停牌、重复日期均排除", async () => {
    const good = stock("600001.SH");
    const absent = stock("600002.SH");
    absent.rows = [];
    const stale = stock("600003.SH");
    stale.rows.pop();
    const gap = stock("600004.SH");
    gap.rows.splice(97, 1);
    const stopped = stock("600005.SH");
    stopped.rows[99].vol = 0;
    stopped.rows[99].amount = 0;
    const duplicate = stock("600006.SH");
    duplicate.rows.push({ ...duplicate.rows[94] });
    const r = await getStockMAMonitor(
      mockDb([good, absent, stale, gap, stopped, duplicate], dates()),
      input
    );
    expect(r).toMatchObject({ eligibleCount: 1, excludedCount: 5, total: 1 });
    expect(r.items[0].tsCode).toBe(good.ts_code);
  });

  it("真实缓存20261104样本缺口不被跳过补成20日", async () => {
    const good = stock("600001.SH"),
      missing = stock("600002.SH");
    missing.rows = missing.rows.filter(q => q.trade_date !== "20261104");
    const r = await getStockMAMonitor(mockDb([good, missing]), input);
    expect(r).toMatchObject({
      asOf: "2026-11-06",
      eligibleCount: 1,
      excludedCount: 1,
      total: 1,
    });
  });

  it.each(["open", "high", "low", "close", "pre_close", "vol", "amount"])(
    "缺失/非正/无穷%s拒绝受影响窗口",
    async field => {
      for (const value of [
        undefined,
        null,
        "",
        " ",
        "bad",
        "0x10",
        NaN,
        Infinity,
        true,
        0,
        -1,
      ]) {
        const s = stock();
        s.rows[93][field] = value;
        expect(await getStockMAMonitor(mockDb([s]), input)).toMatchObject({
          eligibleCount: 0,
          excludedCount: 1,
          total: 0,
        });
      }
    }
  );

  it.each([
    { high: 1 },
    { low: 99 },
    { open: 99 },
    { close: 99 },
    { amount: 1 },
    { amount: 999999 },
  ])("异常OHLC/量额价格口径%j不能符合", async patch => {
    const s = stock();
    Object.assign(s.rows[99], patch);
    expect(await getStockMAMonitor(mockDb([s]), input)).toMatchObject({
      eligibleCount: 0,
      excludedCount: 1,
      total: 0,
    });
  });

  it("DECIMAL字符串合法，负/零pct_chg来自源；缺失涨跌幅保留null不捏造", async () => {
    for (const pct of ["-1.2345", "0.0000", null]) {
      const s = stock();
      s.rows.forEach(q => {
        for (const f of [
          "open",
          "high",
          "low",
          "close",
          "pre_close",
          "vol",
          "amount",
        ])
          q[f] = String(q[f]);
      });
      s.rows[99].pct_chg = pct;
      expect(
        (await getStockMAMonitor(mockDb([s]), input)).items[0].changePercent
      ).toBe(pct === null ? null : Number(pct));
    }
  });

  it("窗口不足仅未知，K线只给真实有效记录和已可计算部分", async () => {
    const s = stock("600001.SH", 12);
    expect(await getStockMAMonitor(mockDb([s]), input)).toMatchObject({
      eligibleCount: 0,
      excludedCount: 1,
      total: 0,
    });
    const r = await getStockMAMonitor(mockDb([s]), {
      ...input,
      periods: [5, 10],
    });
    expect(r.items[0].candles).toHaveLength(12);
    expect(r.items[0].candles[0].averages).toEqual({});
    expect(r.items[0].candles[4].averages[5]).toBeDefined();
    expect(r.items[0].averages[20]).toBeUndefined();
  });
});

describe("真实连续收盘符合与未知下限、除权防护", () => {
  it("回溯找到前日确实不符合才精确，qualifiedSince用真实交易日期", async () => {
    const s = trendAfterFlat("600001.SH", 7);
    const r = await getStockMAMonitor(mockDb([s]), input);
    expect(r.items[0]).toMatchObject({
      consecutiveDays: 7,
      consecutiveIsLowerBound: false,
      qualifiedSince: iso(s.rows[93].trade_date),
    });
  });

  it("100真实源日20日前置，有81个可判断日仍符合仅为下限而非上线首日", async () => {
    const s = stock();
    expect(
      (await getStockMAMonitor(mockDb([s]), input)).items[0]
    ).toMatchObject({
      consecutiveDays: 81,
      consecutiveIsLowerBound: true,
      qualifiedSince: iso(s.rows[19].trade_date),
    });
  });

  it("更长历史也只用最新350日，不能编造超过已知窗口的连续天数", async () => {
    const s = stock("600001.SH", 390);
    const db = mockDb([s]);
    const r = await getStockMAMonitor(db, input);
    expect(r.items[0]).toMatchObject({
      consecutiveDays: 331,
      consecutiveIsLowerBound: true,
      qualifiedSince: iso(s.rows[59].trade_date),
    });
    expect(rawCalls(db)[0][1]![0]).toBe(s.rows[40].trade_date);
  });

  it.each(["missing", "invalid", "duplicate"])(
    "较早%s截断连续判断，绝不跳过或把未知当不符合",
    async mode => {
      const s = stock();
      if (mode === "missing") s.rows.splice(50, 1);
      else if (mode === "invalid") s.rows[50].amount = null;
      else s.rows.push({ ...s.rows[50] });
      const r = await getStockMAMonitor(mockDb([s], dates()), input);
      expect(r.items[0]).toMatchObject({
        consecutiveDays: 30,
        consecutiveIsLowerBound: true,
        qualifiedSince: iso(dates()[70]),
      });
      expect(r.items[0].candles).toHaveLength(30);
    }
  );

  it("最近30根实际日K绕开无效记录但不为其伪造均价，近20日仍完整才出榜", async () => {
    const s = stock();
    const gapDate = s.rows[75].trade_date;
    s.rows.splice(75, 1);
    const r = await getStockMAMonitor(mockDb([s], dates()), input);
    expect(r.items[0]).toMatchObject({
      consecutiveDays: 5,
      consecutiveIsLowerBound: true,
      qualifiedSince: iso(dates()[95]),
    });
    expect(r.items[0].candles).toHaveLength(30);
    expect(r.items[0].candles[0].date).toBe(iso(dates()[69]));
    expect(r.items[0].candles.some(c => c.date === iso(gapDate))).toBe(false);
    expect(
      r.items[0].candles.find(c => c.date === iso(dates()[80]))!.averages[20]
    ).toBeUndefined();
    expect(r.items[0].candles.at(-1)!.averages[20]).toBeDefined();
  });

  it.each(
    (
      [
        [5, 10],
        [5, 20],
        [10, 20],
        [5, 10, 20],
      ] as (5 | 10 | 20)[][]
    ).map(value => [value])
  )(
    "周期组合%j的回溯下限取真实可判断日数",
    async (selected: (5 | 10 | 20)[]) => {
      const r = await getStockMAMonitor(mockDb([stock()]), {
        ...input,
        periods: selected,
      });
      const count = 101 - Math.max(...selected);
      expect(r.items[0]).toMatchObject({
        consecutiveDays: count,
        consecutiveIsLowerBound: true,
        qualifiedSince: iso(dates()[100 - count]),
      });
    }
  );

  it("本窗口除权参考价断点排除；较早断点只保留已知下限而不混原价格", async () => {
    const latest = stock();
    latest.rows[93].pre_close = Number(latest.rows[92].close) / 2;
    expect(await getStockMAMonitor(mockDb([latest]), input)).toMatchObject({
      eligibleCount: 0,
      excludedCount: 1,
      total: 0,
    });
    const earlier = stock();
    earlier.rows[50].pre_close = Number(earlier.rows[49].close) - 1;
    expect(
      (await getStockMAMonitor(mockDb([earlier]), input)).items[0]
    ).toMatchObject({
      consecutiveDays: 30,
      consecutiveIsLowerBound: true,
      qualifiedSince: iso(earlier.rows[70].trade_date),
    });
  });

  it("价格存储0.001舍入误差可容忍，明显超过则未知", async () => {
    const rounded = stock();
    rounded.rows[95].pre_close = Number(rounded.rows[94].close) + 0.001;
    expect((await getStockMAMonitor(mockDb([rounded]), input)).total).toBe(1);
    const changed = stock();
    changed.rows[95].pre_close = Number(changed.rows[94].close) + 0.002;
    expect((await getStockMAMonitor(mockDb([changed]), input)).total).toBe(0);
  });

  it("除权后只有干净的20日才重新可判断，连续起点仍不是首次符合", async () => {
    const s = stock();
    s.rows.forEach((q, i) => {
      if (i < 70) return;
      for (const f of ["open", "high", "low", "close", "pre_close", "amount"])
        q[f] = Number(q[f]) / 2;
    });
    const r = await getStockMAMonitor(mockDb([s]), input);
    expect(r.items[0]).toMatchObject({
      consecutiveDays: 10,
      consecutiveIsLowerBound: true,
      qualifiedSince: iso(s.rows[90].trade_date),
    });
  });
});

describe("四个A股板块和先筛选稳定排序后分页", () => {
  const codes = [
    "600001.SH",
    "689001.SH",
    "000001.SZ",
    "002001.SZ",
    "300001.SZ",
    "301001.SZ",
    "688001.SH",
    "920001.BJ",
    "302001.SZ",
    "600003.BJ",
    "600004.SZ",
    "6000000.SH",
  ];
  it.each([
    [
      "all",
      [
        "000001.SZ",
        "002001.SZ",
        "300001.SZ",
        "301001.SZ",
        "600001.SH",
        "688001.SH",
        "689001.SH",
      ],
    ],
    ["SH", ["600001.SH", "689001.SH"]],
    ["SZ", ["000001.SZ", "002001.SZ"]],
    ["GEM", ["300001.SZ", "301001.SZ"]],
    ["STAR", ["688001.SH"]],
  ] as [StockMAMonitorMarket, string[]][])(
    "%s仅四板L，不含北交/退市/错误后缀",
    async (market, expected) => {
      const samples = codes.map(c => stock(c));
      const delisted = stock("600002.SH");
      delisted.list_status = "D";
      const paused = stock("688002.SH");
      paused.list_status = "P";
      const r = await getStockMAMonitor(
        mockDb([...samples, delisted, paused]),
        { ...input, market }
      );
      expect(r.items.map(s => s.tsCode)).toEqual(expected);
      expect(r.eligibleCount).toBe(expected.length);
      expect(r.excludedCount).toBe(0);
    }
  );

  it("newest天数升序/longest降序/code升序，同天数用稳定代码次序，分页共享全榜", async () => {
    const db = mockDb([
      trendAfterFlat("600004.SH", 10),
      trendAfterFlat("600003.SH", 4),
      trendAfterFlat("600002.SH", 4),
      trendAfterFlat("000001.SZ", 7),
    ]);
    const newest = await getStockMAMonitor(db, {
      ...input,
      sort: "newest",
      pageSize: 2,
    });
    expect(newest).toMatchObject({ total: 4, eligibleCount: 4 });
    expect(newest.items.map(s => s.tsCode)).toEqual(["600002.SH", "600003.SH"]);
    const second = await getStockMAMonitor(db, {
      ...input,
      sort: "newest",
      pageSize: 2,
      page: 2,
    });
    expect(second.items.map(s => s.tsCode)).toEqual(["000001.SZ", "600004.SH"]);
    expect(
      (await getStockMAMonitor(db, { ...input, sort: "longest" })).items.map(
        s => s.tsCode
      )
    ).toEqual(["600004.SH", "000001.SZ", "600002.SH", "600003.SH"]);
    expect(
      (await getStockMAMonitor(db, input)).items.map(s => s.tsCode)
    ).toEqual(["000001.SZ", "600002.SH", "600003.SH", "600004.SH"]);
    expect((await getStockMAMonitor(db, { ...input, page: 10 })).items).toEqual(
      []
    );
    expect(
      (
        await getStockMAMonitor(db, {
          ...input,
          market: "SH",
          sort: "longest",
          pageSize: 1,
        })
      ).total
    ).toBe(3);
    expect(rawCalls(db)).toHaveLength(1);
  });
});

describe("已完成截止、SQL结构、缓存和失败不缓存", () => {
  it("北京15:00前截止昨天，15点只放开截止，新源日稳定后发布而非仅换时间key", async () => {
    const s = stock();
    vi.setSystemTime(new Date("2026-11-06T06:59:59Z"));
    const db = mockDb([s]);
    db.versionState.dailyEpoch = "2026-11-06T06:00:00Z";
    db.versionState.basicEpoch = "2026-11-06T05:00:00Z";
    const before = await getStockMAMonitor(db, input);
    expect(before.asOf).toBe("2026-11-05");
    expect(dateCalls(db)[0][1]).toEqual(["20261105"]);
    vi.setSystemTime(new Date("2026-11-06T07:00:00Z"));
    expect((await getStockMAMonitor(db, input)).asOf).toBe("2026-11-05");
    vi.setSystemTime(new Date("2026-11-06T07:01:01Z"));
    expect((await getStockMAMonitor(db, input)).asOf).toBe("2026-11-05");
    vi.setSystemTime(new Date("2026-11-06T07:02:02Z"));
    expect((await getStockMAMonitor(db, input)).asOf).toBe("2026-11-06");
    expect(dateCalls(db).at(-1)![1]).toEqual(["20261106"]);
  });

  it("周末休市asOf是真实周五且落后板块不能改用旧板块日期", async () => {
    vi.setSystemTime(new Date("2026-11-08T00:23:15Z"));
    const old = stock("688001.SH");
    old.rows.pop();
    const db = mockDb([old, stock()]);
    const r = await getStockMAMonitor(db, { ...input, market: "STAR" });
    expect(r).toMatchObject({
      asOf: "2026-11-06",
      eligibleCount: 0,
      excludedCount: 1,
      total: 0,
    });
    expect(dateCalls(db)[0][1]).toEqual(["20261107"]);
  });

  it("版本元数据和原始窗口均为非锁定SELECT、固定350日期、无逐股/全历史查询", async () => {
    const db = mockDb([stock("600001.SH", 350)]);
    await getStockMAMonitor(db, { ...input, ledgerId: 37 });
    expect(rawCalls(db)).toHaveLength(1);
    for (const [sql, params] of db.execute.mock.calls) {
      expect(sql.trim()).toMatch(/^SELECT\s/i);
      expect(sql).not.toMatch(
        /\b(WITH|INSERT|UPDATE|DELETE|REPLACE|ALTER|CREATE|DROP|FOR UPDATE|LOCK IN SHARE MODE)\b/i
      );
      expect(sql).not.toMatch(/ledger_id|ts_stock_lifecycle|SELECT\s+d\.\*/i);
      expect(sql.match(/\?/g)?.length ?? 0).toBe(params?.length ?? 0);
      expect(sql).not.toMatch(
        /(?:DATE_FORMAT|CAST|STR_TO_DATE)\s*\(\s*d\.trade_date/i
      );
    }
    expect(dateCalls(db)[0][0]).toContain("LIMIT 350");
    expect(dateCalls(db)[0][0]).not.toMatch(/ts_stock_basic|list_status/);
    const [sql, params] = rawCalls(db)[0];
    expect(sql).toContain("FORCE INDEX (idx_trade_date)");
    expect(sql).toContain("WHERE d.trade_date >= ? AND d.trade_date <= ?");
    expect(sql.match(/FROM ts_daily/g)).toHaveLength(1);
    expect(params).toEqual([dates(350)[0], "20261106", ...dates(350)]);
    expect(
      db.execute.mock.calls.some(([sql]) =>
        String(sql).includes("TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())")
      )
    ).toBe(true);
  });

  it("全市场多页/市场/排序/periods/ledger并发singleflight，共享一次快照，保留fetchedAt", async () => {
    const db = mockDb([stock(), stock("688001.SH"), stock("000001.SZ")]);
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        getStockMAMonitor(db, {
          ...input,
          periods: i % 2 ? [10, 5] : [5, 10, 20],
          market: i % 3 ? "all" : "SH",
          page: (i % 5) + 1,
          pageSize: 1,
          ledgerId: i + 1,
          sort: i % 2 ? "newest" : "longest",
        })
      )
    );
    expect(rawCalls(db)).toHaveLength(1);
    expect(new Set(results.map(r => r.fetchedAt)).size).toBe(1);
    vi.setSystemTime(new Date("2026-11-06T08:04:59.999Z"));
    expect((await getStockMAMonitor(db, input)).fetchedAt).toBe(
      "2026-11-06T08:00:00.000Z"
    );
    expect(rawCalls(db)).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-06T08:05:00Z"));
    expect((await getStockMAMonitor(db, input)).fetchedAt).toBe(
      "2026-11-06T08:00:00.000Z"
    );
    expect(rawCalls(db)).toHaveLength(1);
  });

  it("不同稳定DB不混缓存；结果修改不污染公共快照", async () => {
    const db = mockDb([stock()]),
      db2 = mockDb([stock("000001.SZ")], undefined, null, true);
    const first = await getStockMAMonitor(db, input);
    first.items[0].averages[5] = -999;
    first.items[0].candles[0].averages[5] = -999;
    first.items[0].candles.pop();
    first.periods.pop();
    const second = await getStockMAMonitor(db, input);
    expect(second.items[0].averages[5]).toBeGreaterThan(0);
    expect(second.items[0].candles).toHaveLength(30);
    expect(second.items[0].candles[0].averages[5]).toBeGreaterThan(0);
    expect(second.periods).toEqual([5, 10, 20]);
    expect((await getStockMAMonitor(db2, input)).items[0].tsCode).toBe(
      "000001.SZ"
    );
    expect((await getStockMAMonitor(db2, input)).dataUpdatedAt).toBeNull();
    expect(rawCalls(db)).toHaveLength(1);
    expect(rawCalls(db2)).toHaveLength(1);
  });

  it("多个cutoff并发仍只运行一条重扫描；相同cutoff等待者共享成功快照", async () => {
    const backing = mockDb([stock()]);
    backing.versionState.dailyEpoch = "2026-11-06T06:00:00Z";
    backing.versionState.basicEpoch = "2026-11-06T05:00:00Z";
    let release!: () => void;
    let first = true;
    let active = 0;
    let maxActive = 0;
    const db: StockComparisonDb = {
      execute: async (sql, params) => {
        active++;
        maxActive = Math.max(maxActive, active);
        try {
          if (sql.includes("SELECT DISTINCT") && first) {
            first = false;
            await new Promise<void>(resolve => {
              release = resolve;
            });
          }
          return await backing.execute(sql, params);
        } finally {
          active--;
        }
      },
    };
    vi.setSystemTime(new Date("2026-11-06T06:59:59Z"));
    const before = getStockMAMonitor(db, input);
    vi.setSystemTime(new Date("2026-11-06T07:00:00Z"));
    const after = getStockMAMonitor(db, input);
    const duplicate = getStockMAMonitor(db, { ...input, market: "SH" });
    for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
    release();
    const results = await Promise.all([before, after, duplicate]);
    expect(results.map(r => r.asOf)).toEqual([
      "2026-11-05",
      "2026-11-05",
      "2026-11-05",
    ]);
    vi.setSystemTime(new Date("2026-11-06T07:01:01Z"));
    await getStockMAMonitor(db, input);
    vi.setSystemTime(new Date("2026-11-06T07:02:02Z"));
    expect((await getStockMAMonitor(db, input)).asOf).toBe("2026-11-06");
    expect(rawCalls(backing)).toHaveLength(2);
    expect(maxActive).toBe(1);
  });

  it("稀疏periods数组不被some忽略而准入", async () => {
    const periods = new Array<5 | 10 | 20>(2);
    periods[0] = 5;
    const db = mockDb([stock()]);
    await expect(getStockMAMonitor(db, { ...input, periods })).rejects.toThrow(
      RangeError
    );
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("冷启动源日期为空明确拒绝，之后真数据到来可以恢复，空源不永久缓存", async () => {
    const s = stock();
    s.rows = [];
    const db = mockDb([s]);
    await expect(getStockMAMonitor(db, input)).rejects.toThrow("No cached");
    expect(rawCalls(db)).toHaveLength(0);
    s.rows = stock().rows;
    expect((await getStockMAMonitor(db, input)).total).toBe(1);
  });

  it.each([
    "SELECT DISTINCT",
    "SELECT b.ts_code",
    "SELECT d.ts_code",
    "AS data_updated_at",
  ])("SELECT阶段%s失败并发都拒绝，重试后恢复，不缓存伪空榜", async stage => {
    const backing = mockDb([stock()]);
    let failed = false;
    const db: StockComparisonDb = {
      execute: vi.fn(async (sql, params) => {
        if (sql.includes(stage) && !failed) {
          failed = true;
          throw new Error("read failed");
        }
        return backing.execute(sql, params);
      }),
    };
    const failedResults = await Promise.allSettled([
      getStockMAMonitor(db, input),
      getStockMAMonitor(db, { ...input, market: "SH" }),
    ]);
    expect(failedResults.every(r => r.status === "rejected")).toBe(true);
    expect((await getStockMAMonitor(db, input)).total).toBe(1);
  });

  it.each(
    [
      ["20260230"],
      ["20261107"],
      ["20261106", "20261106"],
      ["20261105", "20261106"],
      Array<string>(351).fill("20261106"),
    ].map(value => [value])
  )(
    "源日期非法/未来/重复/乱序/超长%j拒绝不缓存",
    async (badDates: string[]) => {
      const good = mockDb([stock()]);
      const db = {
        execute: vi.fn(async (sql, params) =>
          sql.includes("SELECT DISTINCT")
            ? [badDates.map(trade_date => ({ trade_date })), []]
            : good.execute(sql, params)
        ),
      };
      await expect(getStockMAMonitor(db, input)).rejects.toThrow(TypeError);
      await expect(getStockMAMonitor(db, input)).rejects.toThrow(TypeError);
      expect(rawCalls(db)).toHaveLength(0);
    }
  );

  it("日线非法日期返回时保守排除其股票，不静默当作完整窗口", async () => {
    const backing = mockDb([stock()]);
    const db: StockComparisonDb = {
      execute: async (sql, params) => {
        const r = (await backing.execute(sql, params)) as any;
        if (sql.includes("SELECT d.ts_code"))
          r[0].push({ ...r[0][0], trade_date: "20260230" });
        return r;
      },
    };
    expect(await getStockMAMonitor(db, input)).toMatchObject({
      eligibleCount: 0,
      excludedCount: 1,
      total: 0,
    });
  });

  it.each([
    "2026-02-30T08:00:00Z",
    "2026-11-06T24:00:00Z",
    "",
    "2026-11-06",
    new Date(),
    "2026-11-06T16:00:00+08:00",
  ])("非法来源更新时间%j拒绝", async bad => {
    await expect(
      getStockMAMonitor(mockDb([stock()], undefined, bad), input)
    ).rejects.toThrow(TypeError);
  });

  it("错误DB响应不能掩盖为成功空榜；重复基本身份拒绝", async () => {
    for (const bad of [undefined, { rows: [] }, [null, []]]) {
      await expect(
        getStockMAMonitor({ execute: async () => bad }, input)
      ).rejects.toThrow(TypeError);
    }
    await expect(
      getStockMAMonitor(mockDb([stock(), stock()]), input)
    ).rejects.toThrow(TypeError);
  });

  it("调用方在await期间改input不污染计算组合或分页", async () => {
    const backing = mockDb([stock()]);
    let release!: () => void;
    let first = true;
    const db: StockComparisonDb = {
      execute: async (sql, params) => {
        if (sql.includes("SELECT DISTINCT") && first) {
          first = false;
          await new Promise<void>(resolve => {
            release = resolve;
          });
        }
        return backing.execute(sql, params);
      },
    };
    const mutable: StockMAMonitorInput = { ...input, periods: [5, 20] };
    const pending = getStockMAMonitor(db, mutable);
    mutable.periods[0] = 20;
    mutable.periods[1] = 10;
    mutable.market = "STAR";
    mutable.page = 5;
    for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
    release();
    const r = await pending;
    expect(r).toMatchObject({
      market: "all",
      periods: [5, 20],
      page: 1,
      total: 1,
    });
  });

  it.each([
    null,
    {},
    { ...input, periods: [] },
    { ...input, periods: [5] },
    { ...input, periods: [5, 5] },
    { ...input, periods: [5, 10, 10] },
    { ...input, periods: [5, 10, 20, 20] },
    { ...input, periods: [5, 30] },
    { ...input, periods: [60, 120] },
    { ...input, periods: [20, 60, 250] },
    { ...input, periods: [20, 30, 120] },
    { ...input, periods: [5, 10, 500] },
    { ...input, periods: ["5", 10] },
    { ...input, periods: [NaN, 10] },
    { ...input, periods: null },
    { ...input, market: "DELISTED" },
    { ...input, market: "OTHER" },
    { ...input, market: "__proto__" },
    { ...input, sort: "random" },
    { ...input, page: 0 },
    { ...input, page: 1.5 },
    { ...input, page: "1" },
    { ...input, page: Number.MAX_SAFE_INTEGER, pageSize: 100 },
    { ...input, pageSize: 0 },
    { ...input, pageSize: 101 },
    { ...input, pageSize: NaN },
    { ...input, pageSize: "20" },
    { ...input, ledgerId: 0 },
    { ...input, ledgerId: 1.5 },
    { ...input, ledgerId: "37" },
  ])("无效periods/市场/排序/分页/账本%j在SELECT前拒绝", async bad => {
    const db = mockDb([stock()]);
    await expect(
      getStockMAMonitor(db, bad as StockMAMonitorInput)
    ).rejects.toThrow();
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe("按已入库内容版本复用收盘快照", () => {
  it("16点至18点、周末、下一交易日盘中版本不变时不再传输原始日线", async () => {
    const db = mockDb([stock()]);
    const first = await getStockMAMonitor(db, input);
    for (const now of [
      "2026-11-06T09:00:00Z",
      "2026-11-06T10:00:00Z",
      "2026-11-07T08:00:00Z",
      "2026-11-08T08:00:00Z",
      "2026-11-09T06:59:59Z",
    ]) {
      vi.setSystemTime(new Date(now));
      const next = await getStockMAMonitor(db, {
        ...input,
        market: "SH",
        pageSize: 20,
      });
      expect(next.asOf).toBe("2026-11-06");
      expect(next.fetchedAt).toBe(first.fetchedAt);
      expect(next.items[0].close).toBe(first.items[0].close);
    }
    expect(rawCalls(db)).toHaveLength(1);
  });

  it("新交易日未入库不因15点自动重算，新日期稳定后才替换快照", async () => {
    const s = stock();
    const db = mockDb([s]);
    const first = await getStockMAMonitor(db, input);
    vi.setSystemTime(new Date("2026-11-09T07:05:00Z"));
    expect((await getStockMAMonitor(db, input)).fetchedAt).toBe(
      first.fetchedAt
    );
    expect(rawCalls(db)).toHaveLength(1);
    s.rows.push({
      ...s.rows.at(-1)!,
      trade_date: "20261109",
      close: 20,
      open: 19.99,
      pre_close: 19.9,
      amount: 199.5,
    });
    db.versionState.dailyEpoch = "2026-11-09T08:00:00Z";
    db.versionState.timestamp = "2026-11-09T08:00:00Z";
    vi.setSystemTime(new Date("2026-11-09T08:10:00Z"));
    await getStockMAMonitor(db, input);
    vi.setSystemTime(new Date("2026-11-09T08:11:01Z"));
    const next = await getStockMAMonitor(db, input);
    expect(next.asOf).toBe("2026-11-09");
    expect(next.items[0].close).toBe(20);
    expect(next.fetchedAt).not.toBe(first.fetchedAt);
    expect(rawCalls(db)).toHaveLength(2);
  });

  it("旧交易日成交额被更正，即使最新日与其更新时间不变也重建均价", async () => {
    const s = stock();
    const db = mockDb([s]);
    const first = await getStockMAMonitor(db, input);
    s.rows[90].amount = Number(s.rows[90].amount) + 0.1;
    db.versionState.dailyEpoch = "2026-11-06T09:00:00Z";
    vi.setSystemTime(new Date("2026-11-06T09:10:00Z"));
    await getStockMAMonitor(db, input);
    vi.setSystemTime(new Date("2026-11-06T09:11:01Z"));
    const next = await getStockMAMonitor(db, input);
    expect(next.asOf).toBe(first.asOf);
    expect(next.dataUpdatedAt).toBe(first.dataUpdatedAt);
    expect(next.items[0].averages[20]).not.toBe(first.items[0].averages[20]);
    expect(rawCalls(db)).toHaveLength(2);
  });

  it("表更新时间同秒未变化时，内容指纹复核仍能识别修订", async () => {
    const s = stock();
    const db = mockDb([s]);
    const first = await getStockMAMonitor(db, input);
    s.rows.at(-1)!.close = 20.1;
    vi.setSystemTime(new Date("2026-11-06T08:31:00Z"));
    await getStockMAMonitor(db, input);
    vi.setSystemTime(new Date("2026-11-06T08:32:01Z"));
    const next = await getStockMAMonitor(db, input);
    expect(next.items[0].close).toBe(20.1);
    expect(next.fetchedAt).not.toBe(first.fetchedAt);
    expect(rawCalls(db)).toHaveLength(2);
  });

  it("基本资料改名也生成不同版本，而不是按数量相同永久误复用", async () => {
    const s = stock();
    const db = mockDb([s]);
    await getStockMAMonitor(db, input);
    s.name = "更正后的股票名";
    db.versionState.basicEpoch = "2026-11-06T09:00:00Z";
    vi.setSystemTime(new Date("2026-11-06T09:10:00Z"));
    await getStockMAMonitor(db, input);
    vi.setSystemTime(new Date("2026-11-06T09:11:01Z"));
    expect((await getStockMAMonitor(db, input)).items[0].name).toBe(s.name);
    expect(rawCalls(db)).toHaveLength(2);
  });

  it("UPDATE_TIME为空时回退到指纹判断，版本相同不重读原始日线", async () => {
    const db = mockDb([stock()]);
    db.versionState.dailyEpoch = null;
    db.versionState.basicEpoch = null;
    db.versionState.timestamp = "2026-11-06T07:00:00Z";
    const first = await getStockMAMonitor(db, input);
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z"));
    const next = await getStockMAMonitor(db, input);
    expect(next.fetchedAt).toBe(first.fetchedAt);
    expect(rawCalls(db)).toHaveLength(1);
  });

  it("已有成功版本时探测失败保留原快照，并明确不是新鲜数据", async () => {
    const db = mockDb([stock()]);
    const first = await getStockMAMonitor(db, input);
    db.versionState.failMetadata = true;
    vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
    const next = await getStockMAMonitor(db, input);
    expect(next.fetchedAt).toBe(first.fetchedAt);
    expect(next.asOf).toBe(first.asOf);
    expect(next.coverageNote).toMatch(/失败|最近成功|保留/);
    expect(rawCalls(db)).toHaveLength(1);
    db.versionState.failMetadata = false;
    vi.setSystemTime(new Date("2026-11-06T09:01:01Z"));
    expect((await getStockMAMonitor(db, input)).fetchedAt).toBe(
      first.fetchedAt
    );
  });

  it("冷启动探测失败明确拒绝，不把失败缓存成没有符合股票", async () => {
    const db = mockDb([stock()]);
    db.versionState.failMetadata = true;
    await expect(getStockMAMonitor(db, input)).rejects.toThrow();
    expect(rawCalls(db)).toHaveLength(0);
    db.versionState.failMetadata = false;
    expect((await getStockMAMonitor(db, input)).total).toBe(1);
  });
});

describe("联合板块筛选", () => {
  it("SH+GEM先联合过滤再全局排序分页，并按板块相加计数", async () => {
    const db = mockDb([
      trendAfterFlat("600002.SH", 4),
      trendAfterFlat("300001.SZ", 2),
      trendAfterFlat("600001.SH", 1),
      stock("300002.SZ", 19),
    ]);
    const first = await getStockMAMonitor(db, {
      ...input,
      markets: ["GEM", "SH"],
      sort: "code",
      pageSize: 2,
    });
    expect(first).toMatchObject({
      market: "all",
      markets: ["SH", "GEM"],
      eligibleCount: 3,
      excludedCount: 1,
      total: 3,
    });
    expect(first.items.map(item => item.tsCode)).toEqual([
      "300001.SZ",
      "600001.SH",
    ]);
    const second = await getStockMAMonitor(db, {
      ...input,
      markets: ["GEM", "SH"],
      sort: "code",
      page: 2,
      pageSize: 2,
    });
    expect(second.items.map(item => item.tsCode)).toEqual(["600002.SH"]);
    expect(second.markets).toEqual(["SH", "GEM"]);
  });

  it("markets在await前复制且拒绝空数组、重复、all和与单市场互斥输入", async () => {
    const backing = mockDb([stock("600001.SH"), stock("300001.SZ")]);
    let release!: () => void;
    let first = true;
    const db: StockComparisonDb = {
      execute: async (sql, params) => {
        if (sql.includes("SELECT DISTINCT") && first) {
          first = false;
          await new Promise<void>(resolve => {
            release = resolve;
          });
        }
        return backing.execute(sql, params);
      },
    };
    const mutable: StockMAMonitorInput = { ...input, markets: ["GEM", "SH"] };
    const pending = getStockMAMonitor(db, mutable);
    mutable.markets![0] = "STAR";
    mutable.markets!.push("SZ");
    for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
    release();
    expect((await pending).markets).toEqual(["SH", "GEM"]);

    for (const markets of [[], ["SH", "SH"], ["all"], ["BJ"]]) {
      const invalidDb = mockDb([stock()]);
      await expect(
        getStockMAMonitor(invalidDb, {
          ...input,
          markets,
        } as StockMAMonitorInput)
      ).rejects.toThrow();
      expect(invalidDb.execute).not.toHaveBeenCalled();
    }
    const mutuallyExclusive = mockDb([stock()]);
    await expect(
      getStockMAMonitor(mutuallyExclusive, {
        ...input,
        market: "SH",
        markets: ["SH"],
      })
    ).rejects.toThrow();
    expect(mutuallyExclusive.execute).not.toHaveBeenCalled();
  });
});

describe("固定短中长方案与350个真实缓存市场日", () => {
  const presets = Object.entries(STOCK_MA_MONITOR_PRESETS);

  it.each(presets)(
    "%s每条均价源自真实量额合计，不是MA/日均价平均/厂商均价",
    async (_name, preset) => {
      const s = stock("600001.SH", 350);
      s.rows.forEach((q, i) => {
        const volume = (i + 1) ** 2;
        Object.assign(q, {
          vol: volume,
          amount: ((Number(q.close) - 0.05) * volume) / 10,
          ma5: 999,
          ma60: 999,
          ma250: 999,
          avg_price: 999,
        });
      });
      const periods = [...preset.periods];
      const r = await getStockMAMonitor(mockDb([s]), { ...input, periods });
      expect(r).toMatchObject({ eligibleCount: 1, excludedCount: 0, total: 1 });
      expect(r.coverageNote).toContain("350个缓存市场日");
      expect(r.coverageNote).toContain("真实源日线派生");
      expect(r.coverageNote).toContain("不是收盘价普通MA");
      const item = r.items[0];
      expect(Object.keys(item.averages)).toEqual(periods.map(String));
      for (const period of periods) {
        const recent = s.rows.slice(-period);
        const meanDailyPrice =
          recent.reduce(
            (sum, q) => sum + (10 * Number(q.amount)) / Number(q.vol),
            0
          ) / period;
        const closeMA =
          recent.reduce((sum, q) => sum + Number(q.close), 0) / period;
        const closeWeighted =
          recent.reduce((sum, q) => sum + Number(q.close) * Number(q.vol), 0) /
          recent.reduce((sum, q) => sum + Number(q.vol), 0);
        expect(item.averages[period]).toBeCloseTo(oracle(s.rows, period), 10);
        expect(item.averages[period]).not.toBeCloseTo(meanDailyPrice, 7);
        expect(item.averages[period]).not.toBeCloseTo(closeMA, 7);
        expect(item.averages[period]).not.toBeCloseTo(closeWeighted, 7);
        expect(item.averages[period]).not.toBe(999);
      }
      expect(item.candles).toHaveLength(30);
      item.candles.forEach((candle, i) => {
        expect(candle.date).toBe(iso(s.rows[320 + i].trade_date));
        expect(Object.keys(candle.averages)).toEqual(periods.map(String));
        for (const period of periods)
          expect(candle.averages[period]).toBeCloseTo(
            oracle(s.rows.slice(0, 321 + i), period),
            10
          );
      });
    }
  );

  it("249源日不足250周期仅排除长线，不能缩短窗口或借用厂商均价", async () => {
    const s = stock("600001.SH", 249);
    s.rows.forEach(q => {
      q.ma250 = 1;
      q.avg_price = 1;
    });
    const db = mockDb([s]);
    expect(
      await getStockMAMonitor(db, {
        ...input,
        periods: [...STOCK_MA_MONITOR_PRESETS.long.periods],
      })
    ).toMatchObject({
      eligibleCount: 0,
      excludedCount: 1,
      total: 0,
      items: [],
    });
    for (const preset of [
      STOCK_MA_MONITOR_PRESETS.short,
      STOCK_MA_MONITOR_PRESETS.medium,
    ])
      expect(
        await getStockMAMonitor(db, { ...input, periods: [...preset.periods] })
      ).toMatchObject({
        eligibleCount: 1,
        excludedCount: 0,
        total: 1,
      });
    expect(rawCalls(db)).toHaveLength(1);
  });

  it("长线250日暖机后101日连续为≥，同数据短线在横盘后重新起算7日", async () => {
    const s = stock("600001.SH", 350);
    s.rows.forEach((q, i) => {
      if (i < 310) return;
      const close = i < 343 ? 41 : 41 + (i - 342) / 10;
      Object.assign(q, {
        open: close,
        high: close + 1,
        low: close - 1,
        close,
        pre_close: Number(s.rows[i - 1].close),
        amount: (close - 0.05) * 10,
      });
    });
    const db = mockDb([s]);
    const long = await getStockMAMonitor(db, {
      ...input,
      periods: [...STOCK_MA_MONITOR_PRESETS.long.periods],
    });
    expect(long.items[0]).toMatchObject({
      consecutiveDays: 101,
      consecutiveIsLowerBound: true,
      qualifiedSince: iso(s.rows[249].trade_date),
    });
    const short = await getStockMAMonitor(db, input);
    expect(short.items[0]).toMatchObject({
      consecutiveDays: 7,
      consecutiveIsLowerBound: false,
      qualifiedSince: iso(s.rows[343].trade_date),
    });
    expect(rawCalls(db)).toHaveLength(1);
  });

  it("长线连续80日且前日确实不符合时必须精确，不能一律标≥", async () => {
    const s = trendAfterFlat("600001.SH", 80, 350);
    const r = await getStockMAMonitor(mockDb([s]), {
      ...input,
      periods: [60, 120, 250],
    });
    expect(r.items[0]).toMatchObject({
      consecutiveDays: 80,
      consecutiveIsLowerBound: false,
      qualifiedSince: iso(s.rows[270].trade_date),
    });
  });

  it("长线曲线仅60/120/250且250暖机前不伪造数值", async () => {
    const s = stock("600001.SH", 260);
    const r = await getStockMAMonitor(mockDb([s]), {
      ...input,
      periods: [250, 60, 120],
    });
    expect(r.periods).toEqual([60, 120, 250]);
    expect(r.items[0]).toMatchObject({
      consecutiveDays: 11,
      consecutiveIsLowerBound: true,
    });
    expect(r.items[0].candles).toHaveLength(30);
    r.items[0].candles.forEach((candle, i) => {
      expect(Object.keys(candle.averages)).toEqual(
        i < 19 ? ["60", "120"] : ["60", "120", "250"]
      );
      for (const period of [60, 120, 250] as const) {
        if (230 + i < period - 1)
          expect(candle.averages[period]).toBeUndefined();
        else
          expect(candle.averages[period]).toBeCloseTo(
            oracle(s.rows.slice(0, 231 + i), period),
            10
          );
      }
    });
  });

  it("同版本并发与反复切换三个方案/三个旧双线，原始数据始终只读一次且投影隔离", async () => {
    const s = stock("600001.SH", 350);
    const db = mockDb([s]);
    const combinations: StockMAMonitorPeriod[][] = [
      ...presets.map(([, preset]) => [...preset.periods]),
      [5, 10],
      [5, 20],
      [10, 20],
    ];
    const results = await Promise.all(
      combinations.map(periods => getStockMAMonitor(db, { ...input, periods }))
    );
    expect(new Set(results.map(r => r.fetchedAt)).size).toBe(1);
    expect(results.map(r => r.items[0].consecutiveDays)).toEqual([
      331, 291, 101, 341, 331, 331,
    ]);
    for (let i = 0; i < combinations.length; i++) {
      const periods = combinations[i];
      expect(Object.keys(results[i].items[0].averages)).toEqual(
        periods.map(String)
      );
      results[i].items[0].averages[periods[0]] = -999;
      results[i].items[0].candles[0].averages[periods[0]] = -999;
    }
    vi.setSystemTime(new Date("2026-11-06T08:01:01Z"));
    for (const periods of [...combinations].reverse()) {
      const again = await getStockMAMonitor(db, {
        ...input,
        periods: [...periods].reverse(),
      });
      expect(again.fetchedAt).toBe(results[0].fetchedAt);
      expect(Object.keys(again.items[0].averages)).toEqual(periods.map(String));
      expect(again.items[0].averages[periods[0]]).toBeCloseTo(
        oracle(s.rows, periods[0]),
        10
      );
      expect(again.items[0].candles[0].averages[periods[0]]).toBeGreaterThan(0);
    }
    expect(rawCalls(db)).toHaveLength(1);
  });

  it.each(presets)(
    "%s跨SH+GEM先联合过滤排序再分页，不纳入未选板块或不足周期股票",
    async (_name, preset) => {
      const db = mockDb([
        stock("600002.SH", 350),
        stock("300001.SZ", 350),
        stock("600001.SH", 350),
        stock("300002.SZ", Math.max(...preset.periods) - 1),
        stock("000001.SZ", 350),
        stock("688001.SH", 350),
      ]);
      const request: StockMAMonitorInput = {
        ...input,
        periods: [...preset.periods],
        markets: ["GEM", "SH"],
        pageSize: 2,
      };
      const first = await getStockMAMonitor(db, request);
      expect(first).toMatchObject({
        markets: ["SH", "GEM"],
        total: 3,
        eligibleCount: 3,
        excludedCount: 1,
      });
      expect(first.items.map(s => s.tsCode)).toEqual([
        "300001.SZ",
        "600001.SH",
      ]);
      const second = await getStockMAMonitor(db, { ...request, page: 2 });
      expect(second.items.map(s => s.tsCode)).toEqual(["600002.SH"]);
      expect(second).toMatchObject({
        total: 3,
        eligibleCount: 3,
        excludedCount: 1,
      });
      expect(rawCalls(db)).toHaveLength(1);
    }
  );

  it.each(["missing", "zero", "duplicate", "reference-break"])(
    "长线窗口%s即使落在最新60日之前也排除250，不放松源保护",
    async mode => {
      const good = stock("600001.SH", 350);
      const bad = stock("600002.SH", 350);
      if (mode === "missing") bad.rows.splice(150, 1);
      else if (mode === "zero")
        Object.assign(bad.rows[150], { vol: 0, amount: 0 });
      else if (mode === "duplicate") bad.rows.push({ ...bad.rows[150] });
      else bad.rows[150].pre_close = Number(bad.rows[149].close) / 2;
      const db = mockDb([good, bad]);
      expect(
        await getStockMAMonitor(db, { ...input, periods: [60, 120, 250] })
      ).toMatchObject({
        eligibleCount: 1,
        excludedCount: 1,
        total: 1,
      });
      expect(await getStockMAMonitor(db, input)).toMatchObject({
        eligibleCount: 2,
        excludedCount: 0,
        total: 2,
      });
    }
  );

  it("长线更早缺日/除权断点仅截断已知连续段，不把未知记作不符合", async () => {
    for (const mode of ["missing", "reference-break"]) {
      const s = stock("600001.SH", 350);
      if (mode === "missing") s.rows.splice(50, 1);
      else s.rows[50].pre_close = Number(s.rows[49].close) / 2;
      const r = await getStockMAMonitor(mockDb([s], dates(350)), {
        ...input,
        periods: [60, 120, 250],
      });
      expect(r.items[0]).toMatchObject({
        consecutiveDays: 50,
        consecutiveIsLowerBound: true,
        qualifiedSince: iso(dates(350)[300]),
      });
    }
  });

  it("长方案无自然日TTL，未来源日未收盘不入快照；旧日修订稳定后才替换", async () => {
    const s = stock("600001.SH", 350);
    const db = mockDb([s]);
    const request: StockMAMonitorInput = { ...input, periods: [60, 120, 250] };
    const first = await getStockMAMonitor(db, request);
    s.rows.push({
      ...s.rows.at(-1)!,
      trade_date: "20261109",
      close: 45,
      pre_close: 44.9,
      open: 44.99,
      amount: 449.5,
    });
    for (const now of [
      "2026-11-07T08:00:00Z",
      "2026-11-08T08:00:00Z",
      "2026-11-09T06:59:59Z",
    ]) {
      vi.setSystemTime(new Date(now));
      const same = await getStockMAMonitor(db, request);
      expect(same.asOf).toBe("2026-11-06");
      expect(same.fetchedAt).toBe(first.fetchedAt);
    }
    expect(rawCalls(db)).toHaveLength(1);
    s.rows.pop();
    // Revision inside 250 but outside 120: it must affect only the long window.
    s.rows[150].amount = Number(s.rows[150].amount) + 0.5;
    db.versionState.dailyEpoch = "2026-11-09T07:00:00Z";
    vi.setSystemTime(new Date("2026-11-09T07:10:00Z"));
    const pending = await getStockMAMonitor(db, request);
    expect(pending.fetchedAt).toBe(first.fetchedAt);
    expect(pending.coverageNote).toContain("版本更新中");
    expect(rawCalls(db)).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-09T07:11:01Z"));
    const revised = await getStockMAMonitor(db, request);
    expect(revised.asOf).toBe(first.asOf);
    expect(revised.items[0].averages[60]).toBe(first.items[0].averages[60]);
    expect(revised.items[0].averages[120]).toBe(first.items[0].averages[120]);
    expect(revised.items[0].averages[250]).not.toBe(
      first.items[0].averages[250]
    );
    expect(revised.items[0].averages[250]).toBeCloseTo(oracle(s.rows, 250), 10);
    expect(rawCalls(db)).toHaveLength(2);
    db.versionState.failMetadata = true;
    vi.setSystemTime(new Date("2026-11-09T07:12:02Z"));
    const failed = await getStockMAMonitor(db, request);
    expect(failed.fetchedAt).toBe(revised.fetchedAt);
    expect(failed.items).toEqual(revised.items);
    expect(failed.coverageNote).toContain("检查失败");
  });

  it.each(presets)(
    "%s极端历史volume不能经前缀消去损坏近期均价或连续天数",
    async (_name, preset) => {
      const s = stock("600001.SH", 350);
      s.rows.forEach((q, i) => {
        const volume = i < 50 ? 1e200 : i % 2 ? 1e-100 : 1e-99;
        q.vol = volume;
        q.amount = ((Number(q.close) - 0.05) * volume) / 10;
      });
      const r = await getStockMAMonitor(mockDb([s]), {
        ...input,
        periods: [...preset.periods],
      });
      expect(r).toMatchObject({ eligibleCount: 1, total: 1, excludedCount: 0 });
      expect(r.items[0]).toMatchObject({ consecutiveIsLowerBound: true });
      for (const period of preset.periods) {
        expect(r.items[0].averages[period]).toBeCloseTo(
          oracle(s.rows, period),
          10
        );
        r.items[0].candles.forEach((candle, i) => {
          expect(candle.averages[period]).toBeCloseTo(
            oracle(s.rows.slice(0, 321 + i), period),
            10
          );
        });
      }
      expect(r.items[0].consecutiveDays).toBe(
        351 - Math.max(...preset.periods)
      );
    }
  );

  it.each(presets)(
    "%s极端volume下相等均价仍不凭浮点误差制造严格排列",
    async (_name, preset) => {
      const s = flat(stock("600001.SH", 350));
      s.rows.forEach((q, i) => {
        q.vol = i < 50 ? 1e200 : i % 2 ? 1e-100 : 1e-99;
        q.amount = Number(q.vol); // close = 10, amount * 10 / vol = 10.
      });
      expect(
        await getStockMAMonitor(mockDb([s]), {
          ...input,
          periods: [...preset.periods],
        })
      ).toMatchObject({
        eligibleCount: 1,
        excludedCount: 0,
        total: 0,
      });
    }
  );
});

describe("图表基底复用实际快照与后端合成G", () => {
  it.each(Object.values(STOCK_MA_MONITOR_PRESETS))(
    "$label G=0.5M1+0.3M2+0.2M3且不改变原私有筛选",
    async preset => {
      const s = stock("600001.SH", 350);
      const db = mockDb([s]);
      const result = await getStockMAMonitor(db, {
        ...input,
        periods: [...preset.periods],
      });
      expect(result.sourceVersion).toMatch(/^[a-f0-9]{64}$/);
      result.items[0].candles.forEach(candle => {
        const [p1, p2, p3] = preset.periods;
        expect(candle.compositeAverage).toBeCloseTo(
          0.5 * candle.averages[p1]! +
            0.3 * candle.averages[p2]! +
            0.2 * candle.averages[p3]!,
          12
        );
      });
      const base = await getStockMAMonitorChartBase(db, {
        tsCode: s.ts_code,
        asOf: result.asOf!,
        sourceVersion: result.sourceVersion!,
        periods: [...preset.periods].reverse(),
        ledgerId: 37,
      });
      expect(base).toMatchObject({
        asOf: result.asOf,
        sourceVersion: result.sourceVersion,
        periods: [...preset.periods],
      });
      expect(base.candles).toEqual(result.items[0].candles);
      expect(base.warmupDates).toEqual(dates(350));
      expect(rawCalls(db)).toHaveLength(1);
      const calls = db.execute.mock.calls.length;
      base.candles[0].averages[preset.periods[0]] = -99;
      base.warmupDates.pop();
      const again = await getStockMAMonitorChartBase(db, {
        tsCode: s.ts_code,
        asOf: result.asOf!,
        sourceVersion: result.sourceVersion!,
        periods: [...preset.periods],
      });
      expect(again.warmupDates).toHaveLength(350);
      expect(again.candles[0].averages[preset.periods[0]]).toBeGreaterThan(0);
      expect(db.execute).toHaveBeenCalledTimes(calls);
    }
  );

  it("legacy双周期G始终null；长线250暖机前G=null不填补", async () => {
    const db = mockDb([stock("600001.SH", 260)]);
    const pair = await getStockMAMonitor(db, { ...input, periods: [5, 20] });
    expect(
      pair.items[0].candles.every(candle => candle.compositeAverage === null)
    ).toBe(true);
    const long = await getStockMAMonitor(db, {
      ...input,
      periods: [60, 120, 250],
    });
    long.items[0].candles.forEach((candle, i) => {
      if (i < 19) expect(candle.compositeAverage).toBeNull();
      else expect(candle.compositeAverage).toBeGreaterThan(0);
    });
  });

  it("允许未出榜合法股票的真实K，停牌不填日期、绝不逐股SQL", async () => {
    const s = flat(stock());
    s.rows.splice(90, 1);
    const db = mockDb([s], dates());
    const result = await getStockMAMonitor(db, input);
    expect(result.total).toBe(0);
    const base = await getStockMAMonitorChartBase(db, {
      tsCode: s.ts_code,
      periods: input.periods,
      asOf: result.asOf!,
      sourceVersion: result.sourceVersion!,
    });
    expect(base.candles).toHaveLength(30);
    expect(base.candles.some(candle => candle.date === iso(dates()[90]))).toBe(
      false
    );
    expect(base.candles.at(-1)!.compositeAverage).toBeNull();
    expect(base.candles.every(candle => candle.date <= base.asOf)).toBe(true);
    expect(rawCalls(db)).toHaveLength(1);
  });

  it("坏股票/asOf/版本/周期在SELECT前拒绝，合法但未知股或快照不符拒绝", async () => {
    const db = mockDb([stock()]);
    const result = await getStockMAMonitor(db, input);
    const valid: StockMAMonitorChartInput = {
      tsCode: "600001.SH",
      periods: [5, 10, 20],
      asOf: result.asOf!,
      sourceVersion: result.sourceVersion!,
    };
    const before = db.execute.mock.calls.length;
    for (const patch of [
      { tsCode: "600001.SZ" },
      { tsCode: "920001.BJ" },
      { tsCode: "600001.SH' OR 1=1" },
      { asOf: "20260230" },
      { asOf: "2026-02-30" },
      { asOf: "2026-11-09" },
      { sourceVersion: "" },
      { sourceVersion: "not-a-version" },
      { periods: [20, 60, 250] },
      { periods: [5, 5] },
      { ledgerId: 0 },
    ])
      await expect(
        getStockMAMonitorChartBase(db, {
          ...valid,
          ...patch,
        } as StockMAMonitorChartInput)
      ).rejects.toThrow();
    expect(db.execute).toHaveBeenCalledTimes(before);
    await expect(
      getStockMAMonitorChartBase(db, {
        ...valid,
        sourceVersion: "f".repeat(64),
      })
    ).rejects.toThrow("mismatch");
    await expect(
      getStockMAMonitorChartBase(db, { ...valid, asOf: "2026-11-05" })
    ).rejects.toThrow("mismatch");
    await expect(
      getStockMAMonitorChartBase(db, { ...valid, tsCode: "600002.SH" })
    ).rejects.toThrow("not in");
    expect(db.execute).toHaveBeenCalledTimes(before);
  });

  it("更新中/探测失败的warning副本仍绑定旧fingerprint；发布新版本才拒旧图表请求", async () => {
    const s = stock();
    const db = mockDb([s]);
    const first = await getStockMAMonitor(db, input);
    const request = {
      tsCode: s.ts_code,
      periods: input.periods,
      asOf: first.asOf!,
      sourceVersion: first.sourceVersion!,
    };
    s.rows[90].amount = Number(s.rows[90].amount) + 0.1;
    db.versionState.dailyEpoch = "2026-11-06T09:00:00Z";
    vi.setSystemTime(new Date("2026-11-06T09:10:00Z"));
    const pending = await getStockMAMonitor(db, input);
    expect(pending.coverageNote).toContain("版本更新中");
    expect(pending.sourceVersion).toBe(first.sourceVersion);
    expect((await getStockMAMonitorChartBase(db, request)).candles).toEqual(
      first.items[0].candles
    );
    db.versionState.failMetadata = true;
    vi.setSystemTime(new Date("2026-11-06T09:11:01Z"));
    const failed = await getStockMAMonitor(db, input);
    expect(failed.coverageNote).toContain("检查失败");
    expect(failed.sourceVersion).toBe(first.sourceVersion);
    expect((await getStockMAMonitorChartBase(db, request)).sourceVersion).toBe(
      first.sourceVersion
    );
    db.versionState.failMetadata = false;
    vi.setSystemTime(new Date("2026-11-06T09:12:02Z"));
    await getStockMAMonitor(db, input);
    vi.setSystemTime(new Date("2026-11-06T09:13:03Z"));
    const revised = await getStockMAMonitor(db, input);
    expect(revised.sourceVersion).not.toBe(first.sourceVersion);
    await expect(getStockMAMonitorChartBase(db, request)).rejects.toThrow(
      "mismatch"
    );
    const newBase = await getStockMAMonitorChartBase(db, {
      ...request,
      sourceVersion: revised.sourceVersion!,
    });
    expect(newBase.candles).toEqual(revised.items[0].candles);
    expect(rawCalls(db)).toHaveLength(2);
  });
});
