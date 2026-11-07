import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStockReturnRanking,
  type StockReturnRankingInput,
  type StockReturnRankingMarket,
  type StockReturnRankingPeriod,
} from "./stock-return-ranking";
import { type StockComparisonDb } from "./stock-comparison";

// Synthetic fixtures are unit-test-only. No actual DB, collector, network,
// browser, router, lifecycle history, migration, or application boot imports.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T06:59:59Z")); // Beijing 14:59:59
});
afterEach(() => vi.useRealTimers());

const input: StockReturnRankingInput = {
  days: 1,
  topN: 100,
  direction: "up",
  market: "all",
};
type Quote = { tradeDate: string; close: unknown; preClose: unknown };
type Stock = {
  ts_code: string;
  name: string;
  list_status: string;
  list_date?: unknown;
  rows: Quote[];
};
function weekdayDates(n: number): string[] {
  const dates: string[] = [],
    date = new Date("2026-11-04T00:00:00Z");
  while (dates.length < n) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6)
      dates.unshift(date.toISOString().slice(0, 10).replace(/-/g, ""));
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return dates;
}
function stock(
  ts_code: string,
  pairs: [unknown, unknown][] = [[11, 10]],
  overrides: Partial<Stock> = {}
): Stock {
  return {
    ts_code,
    name: `样本${ts_code}`,
    list_status: "L",
    rows: pairs.map(([close, preClose], i) => ({
      tradeDate: weekdayDates(pairs.length)[i],
      close,
      preClose,
    })),
    ...overrides,
  };
}
function decimal(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))
  )
    return null;
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}
// Independent product oracle, deliberately NOT sum(log) or production helpers.
// Fixtures include impossible DECIMAL input as SQL unknown to test exclusion.
function aggregate(s: Stock, start: string, end: string, exactDates: string[]) {
  const rows = s.rows.filter(
    row =>
      row.tradeDate >= start &&
      row.tradeDate <= end &&
      exactDates.includes(row.tradeDate)
  );
  const valid = rows.filter(
    row => decimal(row.close) !== null && decimal(row.preClose) !== null
  );
  const product = valid.reduce(
    (factor, row) => factor * (decimal(row.close)! / decimal(row.preClose)!),
    1
  );
  return {
    ts_code: s.ts_code,
    name: s.name,
    list_status: s.list_status,
    list_date: s.list_date,
    row_days: rows.length ? String(rows.length) : null,
    distinct_days: rows.length
      ? String(new Set(rows.map(row => row.tradeDate)).size)
      : null,
    sample_days: rows.length ? String(valid.length) : null,
    log_return: valid.length ? String(Math.log(product)) : null,
    first_trade_date: rows.length
      ? rows.map(row => row.tradeDate).sort()[0]
      : null,
    last_trade_date: rows.length
      ? rows
          .map(row => row.tradeDate)
          .sort()
          .at(-1)
      : null,
    first_pre_close:
      rows.slice().sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))[0]
        ?.preClose ?? null,
    last_close:
      rows.slice().sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))[0]
        ?.close ?? null,
  };
}
function sampleDb(
  stocks: Stock[],
  extraSourceDates: string[] = [],
  dataUpdatedAt: unknown = "2026-11-04T08:00:00Z"
) {
  const execute = vi.fn(
    async (sql: string, params: any[] = []): Promise<unknown> => {
      if (sql.includes("AS data_updated_at"))
        return [[{ data_updated_at: dataUpdatedAt }], []];
      const sourceDates = Array.from(
        new Set([
          ...stocks.flatMap(s => s.rows.map(row => row.tradeDate)),
          ...extraSourceDates,
        ])
      )
        .sort()
        .reverse();
      if (sql.includes("AS as_of"))
        return [
          [
            {
              as_of: sourceDates.find(date => date <= params[0]) ?? null,
            },
          ],
          [],
        ];
      if (sql.includes("ORDER BY d.trade_date DESC")) {
        const limit = sql.match(/LIMIT (\d+)/)?.[1];
        const dates = Array.from(
          new Set([
            ...stocks.flatMap(s => s.rows.map(row => row.tradeDate)),
            ...extraSourceDates,
          ])
        )
          .filter(date =>
            params.length === 2
              ? date >= params[0] && date <= params[1]
              : date <= params[0]
          )
          .sort()
          .reverse()
          .slice(0, limit === undefined ? undefined : Number(limit));
        return [dates.map(trade_date => ({ trade_date })), []];
      }
      const periodMode = sql.includes("MAX_EXECUTION_TIME");
      const [first, last] = params;
      const [start, end] = periodMode ? params : params.slice(2);
      if (!periodMode) expect([first, last]).toEqual([start, end]);
      const dateCount = sql
        .match(/d\.trade_date IN \(([^)]+)\)/)![1]
        .split(",").length;
      const exactDates = params.slice(
        periodMode ? 2 : 4,
        (periodMode ? 2 : 4) + dateCount
      );
      const [status, pattern] = params.slice(4 + dateCount);
      const keyword =
        pattern === undefined
          ? ""
          : String(pattern)
              .slice(1, -1)
              .replace(/!([!%_])/g, "$1");
      const selected = stocks
        .filter(s => {
          if (periodMode) return s.list_status === "L" || s.list_status === "D";
          if (s.list_status !== status) return false;
          if (sql.includes("AND b.ts_code LIKE '688%'"))
            return s.ts_code.startsWith("688");
          if (sql.includes("b.ts_code LIKE '6%'"))
            return s.ts_code.startsWith("6") && !s.ts_code.startsWith("688");
          if (sql.includes("b.ts_code LIKE '0%'"))
            return s.ts_code.startsWith("0");
          if (sql.includes("b.ts_code LIKE '300%'"))
            return s.ts_code.startsWith("300") || s.ts_code.startsWith("301");
          return true;
        })
        .filter(
          s =>
            periodMode ||
            !keyword ||
            s.ts_code.includes(keyword) ||
            s.name.includes(keyword)
        );
      // Aggregated rows only, no raw price rows returned to the production service.
      return [
        selected.map(s => aggregate(s, start, end, exactDates)).reverse(),
        [],
      ];
    }
  );
  return { execute };
}
const validSummary = {
  ts_code: "600001.SH",
  name: "样本",
  list_status: "L",
  row_days: "1",
  distinct_days: "1",
  sample_days: "1",
  log_return: String(Math.log(1.1)),
  first_trade_date: "20261104",
  last_trade_date: "20261104",
  first_pre_close: "10",
  last_close: "11",
};
function rawDb(
  rows: Record<string, unknown>[] = [validSummary],
  tradeDates = ["20261104"],
  direct = false,
  timestamp: unknown = null
) {
  const execute = vi.fn(
    async (sql: string, _params?: any[]): Promise<unknown> => {
      const result = sql.includes("AS data_updated_at")
        ? [{ data_updated_at: timestamp }]
        : sql.includes("AS as_of")
          ? [{ as_of: tradeDates[0] ?? null }]
          : sql.includes("ORDER BY d.trade_date DESC")
            ? tradeDates.map(trade_date => ({ trade_date }))
            : rows;
      return direct ? result : [result, []];
    }
  );
  return { execute };
}

describe("区间逐日前收盘参考复合收益", () => {
  it.each([1, 20, 100])(
    "N=%s发现最近N个实际交易日，仅聚合这些日期，不续上窗口外历史",
    async days => {
      const dates = weekdayDates(days + 5);
      const s = stock("600001.SH", [], {
        rows: dates.map(tradeDate => ({
          tradeDate,
          close: 101,
          preClose: 100,
        })),
      });
      const db = sampleDb([s]);
      const result = await getStockReturnRanking(db, { ...input, days });
      expect(result).toMatchObject({
        days,
        topN: 100,
        direction: "up",
        market: "all",
        asOf: "2026-11-04",
        windowStart: `${dates[5].slice(0, 4)}-${dates[5].slice(4, 6)}-${dates[5].slice(6)}`,
        windowTradingDays: days,
        completeWindow: true,
        eligibleCount: 1,
        excludedCount: 0,
        method: "daily-reference-compound",
        dataUpdatedAt: "2026-11-04T08:00:00Z",
        fetchedAt: "2026-11-05T06:59:59.000Z",
      });
      expect(result.items[0].sampleDays).toBe(days);
      expect(result.items[0].returnPercent).toBeCloseTo(
        (Math.pow(1.01, days) - 1) * 100,
        9
      );
      expect(result.items[0]).toMatchObject({
        firstPreClose: 100,
        lastClose: 101,
        firstTradeDate: result.windowStart,
        lastTradeDate: result.asOf,
      });
      expect(db.execute).toHaveBeenCalledTimes(3);
      expect(db.execute.mock.calls[0][0]).toContain(`LIMIT ${days}`);
      expect(db.execute.mock.calls[1][1]).toEqual([
        dates[5],
        dates.at(-1),
        dates[5],
        dates.at(-1),
        ...dates.slice(5).reverse(),
        "L",
      ]);
    }
  );

  it("+10%后-10%是-1%，不是简单求和0，也不是末close/初close", async () => {
    const db = sampleDb([
      stock("600001.SH", [
        [110, 100],
        [99, 110],
      ]),
    ]);
    const down = await getStockReturnRanking(db, {
      ...input,
      days: 2,
      direction: "down",
    });
    expect(down.items).toHaveLength(1);
    expect(down.items[0].returnPercent).toBeCloseTo(-1, 12);
    expect(down.items[0]).toMatchObject({
      firstPreClose: 100,
      lastClose: 99,
      sampleDays: 2,
    });
    expect(
      (await getStockReturnRanking(db, { ...input, days: 2 })).items
    ).toEqual([]);
  });

  it("前收盘调整不与上一日close强行连接，沿用Tushare pre_close；不冒充现金分红总收益", async () => {
    const db = sampleDb([
      stock("600001.SH", [
        [110, 100],
        [55, 50],
      ]),
    ]);
    const result = await getStockReturnRanking(db, { ...input, days: 2 });
    expect(result.items[0].returnPercent).toBeCloseTo(21, 12);
    expect(result.items[0]).toMatchObject({
      firstPreClose: 100,
      lastClose: 55,
    });
    expect(result.method).toBe("daily-reference-compound");
  });

  it("N=1直接close/pre_close，不能用已四舍五入pct_chg替代", async () => {
    const result = await getStockReturnRanking(
      sampleDb([stock("000001.SZ", [["11.810", "11.640"]])]),
      input
    );
    expect(result.items[0].returnPercent).toBeCloseTo(
      (11.81 / 11.64 - 1) * 100,
      12
    );
    expect(result.items[0].returnPercent).not.toBe(1.4605);
  });

  it("短全市场窗口不出榜，不拼自然日/停牌日或窗口前样本成N天", async () => {
    const db = sampleDb([
      stock("600001.SH", [
        [11, 10],
        [11, 10],
      ]),
    ]);
    const result = await getStockReturnRanking(db, { ...input, days: 20 });
    expect(result).toMatchObject({
      windowTradingDays: 2,
      completeWindow: false,
      asOf: "2026-11-04",
      windowStart: "2026-11-03",
      eligibleCount: 0,
      excludedCount: 1,
      items: [],
    });
    expect(result.dataUpdatedAt).toBe("2026-11-04T08:00:00Z");
  });

  it("有效完整N日门槛：缺日/未知/无窗口样本/重复日期均排除，但有效平盘计入样本", async () => {
    const dates = weekdayDates(3);
    const good = stock("600001.SH", [
      [11, 10],
      [10, 10],
      [9, 10],
    ]);
    const missing = stock("600002.SH", [], {
      rows: [good.rows[0], good.rows[2]],
    });
    const invalid = stock("600003.SH", [
      [11, 10],
      [null, 10],
      [11, 10],
    ]);
    const absent = stock("600004.SH", [], { rows: [] });
    const duplicate = stock("600005.SH", [], {
      rows: [good.rows[0], good.rows[0], good.rows[2]],
    });
    const result = await getStockReturnRanking(
      sampleDb([good, missing, invalid, absent, duplicate]),
      { ...input, days: 3, direction: "down" }
    );
    expect(result).toMatchObject({
      windowTradingDays: 3,
      completeWindow: true,
      eligibleCount: 1,
      excludedCount: 4,
    });
    expect(result.items.map(item => item.tsCode)).toEqual(["600001.SH"]);
    expect(result.items[0]).toMatchObject({
      sampleDays: 3,
      firstTradeDate: `${dates[0].slice(0, 4)}-${dates[0].slice(4, 6)}-${dates[0].slice(6)}`,
    });
    expect(result.items[0].returnPercent).toBeCloseTo(-1, 12);
  });

  it.each([
    null,
    undefined,
    "",
    " ",
    "garbage",
    "NaN",
    "Infinity",
    NaN,
    Infinity,
    -Infinity,
    true,
    {},
    "0x10",
    0,
    -1,
  ])("无效价格%j，无论close或pre_close均不能凑足N日", async bad => {
    const db = sampleDb([
      stock("600001.SH", [
        [11, 10],
        [bad, 10],
        [11, 10],
      ]),
      stock("600002.SH", [
        [11, 10],
        [11, bad],
        [11, 10],
      ]),
    ]);
    expect(
      await getStockReturnRanking(db, { ...input, days: 3 })
    ).toMatchObject({
      completeWindow: true,
      eligibleCount: 0,
      excludedCount: 2,
      items: [],
    });
  });

  it("聚合无效/溢出收益或首末价格无效也排除，不输出NaN/Infinity", async () => {
    const rows = [
      { ...validSummary, ts_code: "600001.SH", log_return: "Infinity" },
      { ...validSummary, ts_code: "600002.SH", log_return: "1000" },
      { ...validSummary, ts_code: "600003.SH", first_pre_close: null },
      { ...validSummary, ts_code: "600004.SH", last_close: "0" },
      { ...validSummary, ts_code: "600005.SH", first_trade_date: "20261103" },
      { ...validSummary, ts_code: "600006.SH", last_trade_date: "20261105" },
    ];
    expect(await getStockReturnRanking(rawDb(rows), input)).toMatchObject({
      eligibleCount: 0,
      excludedCount: 6,
      items: [],
    });
  });
});

describe("已完成实际交易日、空窗口和来源时刻", () => {
  it("北京15:00前排除当天/未来日线，15:00后仍仅计实际已发布源日期", async () => {
    const s = stock("600001.SH", [], {
      rows: [
        { tradeDate: "20261104", close: 11, preClose: 10 },
        { tradeDate: "20261105", close: 12, preClose: 10 },
        { tradeDate: "20261106", close: 100, preClose: 10 },
      ],
    });
    const db = sampleDb([s]);
    const before = await getStockReturnRanking(db, input);
    expect(before).toMatchObject({
      asOf: "2026-11-04",
      windowTradingDays: 1,
      completeWindow: true,
    });
    expect(before.items[0].returnPercent).toBeCloseTo(10, 12);
    expect(db.execute.mock.calls[0][1]).toEqual(["20261104"]);
    vi.setSystemTime(new Date("2026-11-05T07:00:00Z"));
    const after = await getStockReturnRanking(db, input);
    expect(after).toMatchObject({ asOf: "2026-11-05", windowTradingDays: 1 });
    expect(after.items[0].returnPercent).toBeCloseTo(20, 12);
    expect(db.execute.mock.calls[3][1]).toEqual(["20261105"]);
    expect((await getStockReturnRanking(rawDb(), input)).asOf).toBe(
      "2026-11-04"
    );
  });

  it("源最新交易日独立于市场/关键词；只有旧记录的板块不可改用自己的旧N日", async () => {
    const db = sampleDb([
      stock("688001.SH", [], {
        rows: [{ tradeDate: "20261030", close: 11, preClose: 10 }],
      }),
      stock("000001.SZ", [], {
        rows: [{ tradeDate: "20261104", close: 11, preClose: 10 }],
      }),
    ]);
    const result = await getStockReturnRanking(db, {
      ...input,
      market: "STAR",
    });
    expect(result).toMatchObject({
      asOf: "2026-11-04",
      windowStart: "2026-11-04",
      eligibleCount: 0,
      excludedCount: 1,
      items: [],
    });
    const noMatch = await getStockReturnRanking(db, {
      ...input,
      keyword: "不存在",
      market: "STAR",
    });
    expect(noMatch).toMatchObject({
      asOf: "2026-11-04",
      windowTradingDays: 1,
      eligibleCount: 0,
      excludedCount: 0,
      items: [],
    });
    expect(db.execute.mock.calls[0][0]).not.toMatch(
      /ts_stock_basic|list_status|LIKE|name/
    );
  });

  it("周末不生成日期，asOf来源真实日线；fetchedAt不替换dataUpdatedAt", async () => {
    vi.setSystemTime(new Date("2026-11-07T08:00:00Z"));
    const db = rawDb(
      [
        {
          ...validSummary,
          first_trade_date: "20261106",
          last_trade_date: "20261106",
        },
      ],
      ["20261106"],
      false,
      "2026-11-06T08:12:34Z"
    );
    const first = await getStockReturnRanking(db, input);
    vi.setSystemTime(new Date("2026-11-08T08:00:00Z"));
    const second = await getStockReturnRanking(db, input);
    expect(first).toMatchObject({
      asOf: "2026-11-06",
      fetchedAt: "2026-11-07T08:00:00.000Z",
      dataUpdatedAt: "2026-11-06T08:12:34Z",
    });
    expect(second).toMatchObject({
      asOf: "2026-11-06",
      fetchedAt: "2026-11-08T08:00:00.000Z",
      dataUpdatedAt: first.dataUpdatedAt,
    });
    expect(db.execute.mock.calls[0][1]).toEqual(["20261107"]);
  });

  it("来源updated_at缺失保留null，fetchedAt是所有SELECT成功完成UTC时刻", async () => {
    const backing = rawDb();
    const db: StockComparisonDb = {
      execute: async (sql, params) => {
        const result = await backing.execute(sql, params);
        if (sql.includes("AS data_updated_at"))
          vi.setSystemTime(new Date("2026-11-05T06:59:59.800Z"));
        return result;
      },
    };
    expect(await getStockReturnRanking(db, input)).toMatchObject({
      fetchedAt: "2026-11-05T06:59:59.800Z",
      dataUpdatedAt: null,
    });
  });

  it("空窗口只一次SELECT，可缓存成功空值但不制造日期、N天或更新时间", async () => {
    const db = rawDb([], []);
    const first = await getStockReturnRanking(db, { ...input, days: 100 });
    expect(first).toEqual({
      days: 100,
      requestedStart: null,
      coverageNote: null,
      topN: 100,
      direction: "up",
      market: "all",
      asOf: null,
      windowStart: null,
      windowTradingDays: 0,
      completeWindow: false,
      eligibleCount: 0,
      excludedCount: 0,
      items: [],
      dataUpdatedAt: null,
      fetchedAt: "2026-11-05T06:59:59.000Z",
      method: "daily-reference-compound",
    });
    expect(await getStockReturnRanking(db, { ...input, days: 100 })).toBe(
      first
    );
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it.each(
    [
      ["20261105"],
      ["20260229"],
      [""],
      ["20261104", "20261104"],
      ["20261103", "20261104"],
      Array(101).fill("20261104"),
    ].map(dates => [dates])
  )("未来/无效/重复/乱序/超长发现窗口拒绝且不缓存：%j", async dates => {
    const db = rawDb([], dates);
    await expect(
      getStockReturnRanking(db, { ...input, days: 100 })
    ).rejects.toThrow(TypeError);
    await expect(
      getStockReturnRanking(db, { ...input, days: 100 })
    ).rejects.toThrow(TypeError);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it.each([
    undefined,
    "",
    "2026-11-04",
    "2026-11-04T16:00:00+08:00",
    "2026-02-30T08:00:00Z",
    "2026-11-04T24:00:00Z",
    new Date("2026-11-04T08:00:00Z"),
  ])("无效来源时间%j不能用抓取时间代替或缓存", async timestamp => {
    const db = rawDb(undefined, undefined, false, timestamp);
    // Explicit undefined must not fall through rawDb's default parameter.
    if (timestamp === undefined)
      db.execute.mockImplementation(async sql =>
        sql.includes("AS data_updated_at")
          ? [[{ data_updated_at: undefined }], []]
          : sql.includes("SELECT DISTINCT")
            ? [[{ trade_date: "20261104" }], []]
            : [[validSummary], []]
      );
    await expect(getStockReturnRanking(db, input)).rejects.toThrow(TypeError);
    await expect(getStockReturnRanking(db, input)).rejects.toThrow(TypeError);
    expect(db.execute).toHaveBeenCalledTimes(6);
  });
});

describe("方向、上限、同分和市场/关键词绑定", () => {
  it("up仅正数降序，down仅负数升序；平盘合格但不入榜，count在方向与上限前计算", async () => {
    const db = sampleDb([
      stock("600004.SH", [[11, 10]]),
      stock("600003.SH", [[12, 10]]),
      stock("600002.SH", [[12, 10]]),
      stock("000003.SZ", [[9, 10]]),
      stock("000002.SZ", [[8, 10]]),
      stock("000001.SZ", [[8, 10]]),
      stock("688001.SH", [[10, 10]]),
    ]);
    const up = await getStockReturnRanking(db, { ...input, topN: 2 });
    const down = await getStockReturnRanking(db, {
      ...input,
      topN: 2,
      direction: "down",
    });
    expect(up.items.map(item => item.tsCode)).toEqual([
      "600002.SH",
      "600003.SH",
    ]);
    expect(down.items.map(item => item.tsCode)).toEqual([
      "000001.SZ",
      "000002.SZ",
    ]);
    expect(up).toMatchObject({ eligibleCount: 7, excludedCount: 0 });
    expect(down).toMatchObject({ eligibleCount: 7, excludedCount: 0 });
    expect(
      (await getStockReturnRanking(db, { ...input, topN: 1 })).items
    ).toHaveLength(1);
    expect((await getStockReturnRanking(db, input)).items).toHaveLength(3);
  });

  it("几千汇总行只Node筛选排序，每个结果至多topN<=100，不返回原始日线", async () => {
    const samples = Array.from({ length: 2100 }, (_, i) =>
      stock(`600${String(2099 - i).padStart(4, "0")}.SH`)
    );
    const result = await getStockReturnRanking(sampleDb(samples), input);
    expect(result.eligibleCount).toBe(2100);
    expect(result.items).toHaveLength(100);
    expect(result.items[0].tsCode).toBe("6000000.SH");
    expect(result.items[99].tsCode).toBe("6000099.SH");
    expect(Object.keys(result.items[0]).sort()).toEqual(
      [
        "tsCode",
        "name",
        "listStatus",
        "returnPercent",
        "sampleDays",
        "firstTradeDate",
        "lastTradeDate",
        "firstPreClose",
        "lastClose",
      ].sort()
    );
  });

  const markets = [
    stock("600001.SH"),
    stock("689001.SH"),
    stock("000001.SZ"),
    stock("002001.SZ"),
    stock("300001.SZ"),
    stock("301001.SZ"),
    stock("302001.SZ"),
    stock("688001.SH"),
    stock("920001.BJ"),
    stock("600002.SH", undefined, { list_status: "D" }),
    stock("688002.SH", undefined, { list_status: "D" }),
    stock("600003.SH", undefined, { list_status: "P" }),
  ];
  it.each([
    [
      "all",
      [
        "000001.SZ",
        "002001.SZ",
        "300001.SZ",
        "301001.SZ",
        "302001.SZ",
        "600001.SH",
        "688001.SH",
        "689001.SH",
        "920001.BJ",
      ],
    ],
    ["SH", ["600001.SH", "689001.SH"]],
    ["SZ", ["000001.SZ", "002001.SZ"]],
    ["GEM", ["300001.SZ", "301001.SZ"]],
    ["STAR", ["688001.SH"]],
    ["DELISTED", ["600002.SH", "688002.SH"]],
  ] as [StockReturnRankingMarket, string[]][])(
    "%s沿用streak前缀，all/板块仅L，DELISTED仅D",
    async (market, codes) => {
      const db = sampleDb(markets);
      const result = await getStockReturnRanking(db, { ...input, market });
      expect(result.items.map(item => item.tsCode)).toEqual(codes);
      expect(
        result.items.every(
          item => item.listStatus === (market === "DELISTED" ? "D" : "L")
        )
      ).toBe(true);
      expect(db.execute.mock.calls[1][1]?.at(-1)).toBe(
        market === "DELISTED" ? "D" : "L"
      );
    }
  );

  it("LIKE %,_,!均转义参数绑定，注入/引号/反斜线保持literal，不进入SQL", async () => {
    const keyword = "a%_!\\' OR 1=1 --";
    const db = sampleDb([
      stock("600001.SH", undefined, { name: `前${keyword}后` }),
      stock("600002.SH", undefined, { name: "aOTHER" }),
    ]);
    const result = await getStockReturnRanking(db, { ...input, keyword });
    expect(result.items.map(item => item.tsCode)).toEqual(["600001.SH"]);
    const [sql, params] = db.execute.mock.calls[1];
    expect(params).toEqual([
      "20261104",
      "20261104",
      "20261104",
      "20261104",
      "20261104",
      "L",
      "%a!%!_!!\\' OR 1=1 --%",
      "%a!%!_!!\\' OR 1=1 --%",
    ]);
    expect(sql).toContain(
      "b.ts_code LIKE ? ESCAPE '!' OR b.name LIKE ? ESCAPE '!'"
    );
    expect(sql).not.toContain(keyword);
    expect(sql).not.toContain("OR 1=1");
  });

  it("代码/名称搜索均可用，trim归一缓存，空白不加LIKE", async () => {
    const db = sampleDb(markets);
    expect(
      (
        await getStockReturnRanking(db, { ...input, keyword: " 301001 " })
      ).items.map(item => item.tsCode)
    ).toEqual(["301001.SZ"]);
    await getStockReturnRanking(db, { ...input, keyword: "301001" });
    expect(db.execute).toHaveBeenCalledTimes(3);
    await getStockReturnRanking(db, { ...input, keyword: "   " });
    await getStockReturnRanking(db, input);
    expect(db.execute).toHaveBeenCalledTimes(6);
    expect(db.execute.mock.calls[4][0]).not.toContain("ESCAPE '!'");
  });

  it("三条SQL仅SELECT、索引限制发现N日期/窗口；只返回汇总行，绝无全历史或逐股票查询", async () => {
    const db = sampleDb([
      stock("600001.SH", [
        [11, 10],
        [12, 11],
      ]),
    ]);
    await getStockReturnRanking(db, { ...input, days: 2, ledgerId: 52 });
    expect(db.execute).toHaveBeenCalledTimes(3);
    for (const [sql, params] of db.execute.mock.calls) {
      expect(sql.trim()).toMatch(/^SELECT\s/);
      expect(sql).not.toMatch(
        /\b(WITH|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE)\b/i
      );
      expect(sql).not.toMatch(
        /ts_stock_lifecycle|ts_daily_basic|list_date|ledger_id|exchange|market\s*=/i
      );
      expect(sql).toContain("FORCE INDEX (idx_trade_date)");
      expect(sql).not.toMatch(
        /(?:DATE|DATE_FORMAT|STR_TO_DATE|CAST)\s*\(\s*d\.trade_date/i
      );
      expect(sql.match(/\?/g)).toHaveLength(params?.length ?? 0);
    }
    const [dateSql] = db.execute.mock.calls[0];
    expect(dateSql).toContain("WHERE d.trade_date <= ?");
    expect(dateSql).toContain("ORDER BY d.trade_date DESC");
    expect(dateSql).toContain("LIMIT 2");
    const [aggregateSql, params] = db.execute.mock.calls[1];
    expect(aggregateSql.match(/FROM ts_daily/g)).toHaveLength(1);
    expect(aggregateSql).toContain(
      "WHERE d.trade_date >= ? AND d.trade_date <= ?"
    );
    expect(aggregateSql).toContain("AND d.trade_date IN (?, ?)");
    expect(aggregateSql).toContain(
      "COUNT(DISTINCT d.trade_date) AS distinct_days"
    );
    expect(aggregateSql).toContain(
      "COUNT(CASE WHEN d.close > 0 AND d.pre_close > 0 THEN 1 ELSE NULL END) AS sample_days"
    );
    expect(aggregateSql).toContain(
      "THEN LN(d.close / (d.pre_close * 1e0)) ELSE NULL END) AS log_return"
    );
    expect(aggregateSql).toContain("GROUP BY d.ts_code");
    expect(aggregateSql).toContain("LEFT JOIN (");
    expect(aggregateSql).not.toMatch(/pct_chg|COALESCE|IFNULL|SELECT\s+d\.\*/);
    expect(params).toEqual([
      "20261103",
      "20261104",
      "20261103",
      "20261104",
      "20261104",
      "20261103",
      "L",
    ]);
    const [timestampSql, timestampParams] = db.execute.mock.calls[2];
    expect(timestampSql).toContain(
      "DATE_SUB(MAX(d.updated_at), INTERVAL TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) SECOND)"
    );
    expect(timestampSql).toContain("'%Y-%m-%dT%H:%i:%sZ'");
    expect(timestampSql).toContain("WHERE d.trade_date = ?");
    expect(timestampSql).not.toMatch(/LIKE|list_status|ts_stock_basic/);
    expect(timestampParams).toEqual(["20261104"]);
  });

  it.each([
    null,
    {},
    { ...input, days: 0 },
    { ...input, days: 101 },
    { ...input, days: -1 },
    { ...input, days: 1.5 },
    { ...input, days: "20" },
    { ...input, days: "1; DROP TABLE ts_daily" },
    { ...input, days: NaN },
    { ...input, days: Infinity },
    { ...input, topN: 0 },
    { ...input, topN: 101 },
    { ...input, topN: -1 },
    { ...input, topN: 1.5 },
    { ...input, topN: "100" },
    { ...input, topN: NaN },
    { ...input, topN: Infinity },
    { ...input, direction: "flat" },
    { ...input, direction: "UP" },
    { ...input, market: "OTHER" },
    { ...input, market: "__proto__" },
    { ...input, market: ["all"] },
    { ...input, market: null },
    { ...input, market: 1 },
    { ...input, keyword: 1 },
    { ...input, keyword: null },
    { ...input, ledgerId: 0 },
    { ...input, ledgerId: -1 },
    { ...input, ledgerId: 1.5 },
    { ...input, ledgerId: "52" },
    { ...input, ledgerId: Infinity },
    { ...input, ledgerId: Number.MAX_SAFE_INTEGER + 1 },
  ])("非法输入查询前拒绝：%j", async invalid => {
    const db = rawDb();
    await expect(
      getStockReturnRanking(db, invalid as StockReturnRankingInput)
    ).rejects.toThrow();
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe("稳定DB身份 scoped TTL90s/LRU/inflight与失败不缓存", () => {
  it("同key并发去重、缓存90s；到期看到新增实际日期且fetchedAt不伪造", async () => {
    vi.setSystemTime(new Date("2026-11-05T07:00:00Z"));
    const s = stock("600001.SH");
    const db = sampleDb([s]);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => getStockReturnRanking(db, input))
    );
    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(results.every(result => result === results[0])).toBe(true);
    s.rows.push({ tradeDate: "20261105", close: 12, preClose: 10 });
    vi.setSystemTime(new Date("2026-11-05T07:01:29.999Z"));
    expect(await getStockReturnRanking(db, input)).toBe(results[0]);
    expect(results[0].fetchedAt).toBe("2026-11-05T07:00:00.000Z");
    vi.setSystemTime(new Date("2026-11-05T07:01:30Z"));
    expect(await getStockReturnRanking(db, input)).toMatchObject({
      asOf: "2026-11-05",
      fetchedAt: "2026-11-05T07:01:30.000Z",
    });
    expect(db.execute).toHaveBeenCalledTimes(6);
  });

  it("DB身份、days/topN/direction/market/keyword/ledgerId独立key，无跨库或跨账本缓存", async () => {
    const first = rawDb(),
      second = rawDb([
        { ...validSummary, ts_code: "000001.SZ", name: "另一DB" },
      ]);
    expect((await getStockReturnRanking(first, input)).items[0].tsCode).toBe(
      "600001.SH"
    );
    expect((await getStockReturnRanking(second, input)).items[0].name).toBe(
      "另一DB"
    );
    for (const change of [
      { days: 20 },
      { topN: 1 },
      { direction: "down" },
      { market: "SH" },
      { keyword: "x" },
      { ledgerId: 52 },
      { ledgerId: 53 },
    ]) {
      await getStockReturnRanking(first, {
        ...input,
        ...change,
      } as StockReturnRankingInput);
    }
    expect(first.execute).toHaveBeenCalledTimes(24);
    expect(second.execute).toHaveBeenCalledTimes(3);
  });

  it("最多12成功key，touch维护LRU并淘汰未触碰最旧项", async () => {
    const db = rawDb([], []);
    for (let i = 0; i < 12; i++)
      await getStockReturnRanking(db, { ...input, keyword: `key${i}` });
    await getStockReturnRanking(db, { ...input, keyword: "key0" });
    expect(db.execute).toHaveBeenCalledTimes(12);
    await getStockReturnRanking(db, { ...input, keyword: "key12" });
    await getStockReturnRanking(db, { ...input, keyword: "key0" });
    expect(db.execute).toHaveBeenCalledTimes(13);
    await getStockReturnRanking(db, { ...input, keyword: "key1" });
    expect(db.execute).toHaveBeenCalledTimes(14);
  });

  it("inflight最多12不同key，第13等待、重复key合并后成功释放", async () => {
    const releases: (() => void)[] = [];
    let active = 0,
      maxActive = 0;
    const execute = vi.fn(async (): Promise<unknown> => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>(resolve => releases.push(resolve));
      active--;
      return [[], []];
    });
    const db = { execute };
    const requests = Array.from({ length: 13 }, (_, i) =>
      getStockReturnRanking(db, { ...input, keyword: `key${i}` })
    );
    const duplicate = getStockReturnRanking(db, { ...input, keyword: "key0" });
    expect(execute).toHaveBeenCalledTimes(12);
    releases.shift()!();
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(13);
    while (releases.length) releases.shift()!();
    const results = await Promise.all([...requests, duplicate]);
    expect(maxActive).toBe(12);
    expect(results[0]).toBe(results[13]);
  });

  it("等待并发名额时调用方修改input，不污染已分配key、方向或SQL参数", async () => {
    const releases: (() => void)[] = [];
    const backing = rawDb();
    const db: StockComparisonDb = {
      execute: vi.fn(async (sql, params) => {
        if (sql.includes("SELECT DISTINCT"))
          await new Promise<void>(resolve => releases.push(resolve));
        return backing.execute(sql, params);
      }),
    };
    const requests = Array.from({ length: 12 }, (_, i) =>
      getStockReturnRanking(db, { ...input, keyword: `key${i}` })
    );
    const mutable: StockReturnRankingInput = {
      ...input,
      keyword: "original",
      ledgerId: 52,
    };
    const waiting = getStockReturnRanking(db, mutable);
    Object.assign(mutable, {
      days: 100,
      topN: 1,
      direction: "down",
      market: "DELISTED",
      keyword: "mutated",
      ledgerId: 53,
    });
    releases.shift()!();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    while (releases.length) releases.shift()!();
    const results = await Promise.all([...requests, waiting]);
    expect(results.at(-1)).toMatchObject({
      days: 1,
      topN: 100,
      direction: "up",
      market: "all",
    });
    expect(
      backing.execute.mock.calls.find(([, params]) =>
        params?.includes("%original%")
      )?.[1]
    ).toEqual([
      "20261104",
      "20261104",
      "20261104",
      "20261104",
      "20261104",
      "L",
      "%original%",
      "%original%",
    ]);
    expect(
      backing.execute.mock.calls.some(
        ([sql, params]) =>
          sql.includes("LIMIT 100") || params?.includes("%mutated%")
      )
    ).toBe(false);
  });

  it.each(["SELECT DISTINCT", "a.row_days", "AS data_updated_at"])(
    "任意SELECT阶段%s失败不缓存，清理inflight可重试",
    async stage => {
      const backing = rawDb();
      let failed = false;
      const execute = vi.fn(async (sql: string, params?: any[]) => {
        if (sql.includes(stage) && !failed) {
          failed = true;
          throw new Error("read failed / missing column");
        }
        return backing.execute(sql, params);
      });
      const db = { execute };
      const first = await Promise.allSettled([
        getStockReturnRanking(db, input),
        getStockReturnRanking(db, input),
      ]);
      expect(first.every(result => result.status === "rejected")).toBe(true);
      expect((await getStockReturnRanking(db, input)).items).toHaveLength(1);
      const count = execute.mock.calls.length;
      await getStockReturnRanking(db, input);
      expect(execute).toHaveBeenCalledTimes(count);
    }
  );

  it("等待的不同key不继承满额队列其他SELECT的失败", async () => {
    const rejectors: ((reason: Error) => void)[] = [];
    let started = 0;
    const db: StockComparisonDb = {
      execute: async () => {
        if (++started > 12) return [[], []];
        return new Promise((_resolve, reject) => rejectors.push(reject));
      },
    };
    const first = Array.from({ length: 12 }, (_, i) =>
      getStockReturnRanking(db, { ...input, keyword: `key${i}` }).then(
        () => "unexpected",
        error => error.message
      )
    );
    const waiting = getStockReturnRanking(db, { ...input, keyword: "waiting" });
    rejectors.forEach(reject => reject(new Error("isolated failure")));
    expect((await waiting).windowTradingDays).toBe(0);
    expect(await Promise.all(first)).toEqual(
      Array(12).fill("isolated failure")
    );
  });

  it("错误execute返回或重复身份拒绝，不返回伪空成功", async () => {
    for (const result of [undefined, { rows: [] }, [null, []]]) {
      await expect(
        getStockReturnRanking({ execute: async () => result }, input)
      ).rejects.toThrow(TypeError);
    }
    for (const rows of [
      [{ ...validSummary, ts_code: "" }],
      [{ ...validSummary, name: null }],
      [{ ...validSummary, list_status: "D" }],
      [validSummary, validSummary],
    ]) {
      await expect(getStockReturnRanking(rawDb(rows), input)).rejects.toThrow(
        TypeError
      );
    }
  });

  it.each([undefined, "", "NaN", -1, 1.5, Infinity, "1.5", true])(
    "错误聚合计数%j抛错并不缓存",
    async value => {
      const db = rawDb([{ ...validSummary, sample_days: value }]);
      await expect(getStockReturnRanking(db, input)).rejects.toThrow(TypeError);
      await expect(getStockReturnRanking(db, input)).rejects.toThrow(TypeError);
      expect(db.execute).toHaveBeenCalledTimes(4);
    }
  );

  it("有效日数不能超过行数；重复导致超额样本不会误满足N", async () => {
    await expect(
      getStockReturnRanking(
        rawDb([{ ...validSummary, sample_days: "2" }]),
        input
      )
    ).rejects.toThrow(TypeError);
    expect(
      await getStockReturnRanking(
        rawDb([{ ...validSummary, row_days: "2", sample_days: "2" }]),
        input
      )
    ).toMatchObject({ eligibleCount: 0, excludedCount: 1, items: [] });
  });

  it("兼容mysql2 [rows,fields]、[rows]、直接rows与bigint计数", async () => {
    expect(
      (await getStockReturnRanking(rawDb(undefined, undefined, true), input))
        .items[0].sampleDays
    ).toBe(1);
    const db: StockComparisonDb = {
      execute: async sql =>
        sql.includes("AS data_updated_at")
          ? [[{ data_updated_at: null }]]
          : sql.includes("SELECT DISTINCT")
            ? [[{ trade_date: "20261104" }]]
            : [
                [
                  {
                    ...validSummary,
                    row_days: 1n,
                    sample_days: 1n,
                    distinct_days: 1n,
                  },
                ],
              ],
    };
    expect((await getStockReturnRanking(db, input)).items[0].sampleDays).toBe(
      1
    );
  });
});

const periodInput = (
  period: StockReturnRankingPeriod = "1m",
  overrides: Partial<StockReturnRankingInput> = {}
): StockReturnRankingInput => ({
  period,
  topN: 100,
  direction: "up",
  market: "all",
  ...overrides,
});
const quotes = (
  dates: string[],
  close: unknown = 11,
  preClose: unknown = 10
): Quote[] => dates.map(tradeDate => ({ tradeDate, close, preClose }));

describe("自然日期周期（含起止边界、月末钳位）", () => {
  it.each([
    ["1w", "20261029"],
    ["1m", "20261004"],
    ["3m", "20260804"],
    ["6m", "20260504"],
    ["1y", "20251104"],
    ["3y", "20231104"],
  ] as [StockReturnRankingPeriod, string][])(
    "%s按实际asOf回退，包含减去日和asOf",
    async (period, start) => {
      const before = new Date(
        `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6)}T00:00:00Z`
      );
      before.setUTCDate(before.getUTCDate() - 1);
      const older = before.toISOString().slice(0, 10).replace(/-/g, "");
      const s = stock("600001.SH", [], {
        rows: quotes([older, start, "20261103", "20261104", "20261105"]),
      });
      const db = sampleDb([s]);
      const result = await getStockReturnRanking(db, periodInput(period));
      expect(result).toMatchObject({
        period,
        days: 3,
        asOf: "2026-11-04",
        windowTradingDays: 3,
        requestedStart: `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6)}`,
        completeWindow: true,
        eligibleCount: 1,
        excludedCount: 0,
      });
      expect(result.items[0].returnPercent).toBeCloseTo(
        (1.1 ** 3 - 1) * 100,
        10
      );
      expect(result.items[0].sampleDays).toBe(result.windowTradingDays);
      expect(db.execute).toHaveBeenCalledTimes(4);
      expect(db.execute.mock.calls[0][0]).toContain(
        "MAX(d.trade_date) AS as_of"
      );
      expect(db.execute.mock.calls[0][1]).toEqual(["20261104"]);
      expect(db.execute.mock.calls[1][1]).toEqual([start, "20261104"]);
      expect(
        db.execute.mock.calls.some(([sql]) => /LIMIT\s+100/.test(sql))
      ).toBe(false);
      expect(result.coverageNote).toContain("未经独立交易日历核验");
    }
  );

  it.each([
    ["1m", "20260331", "20260228"],
    ["1m", "20240331", "20240229"],
    ["3m", "20260531", "20260228"],
    ["6m", "20260831", "20260228"],
    ["1y", "20240229", "20230228"],
    ["3y", "20240229", "20210228"],
  ] as [StockReturnRankingPeriod, string, string][])(
    "%s %s回退月末钳位为%s，不溢出到下月",
    async (period, end, start) => {
      const db = sampleDb([
        stock("600001.SH", [], { rows: quotes([start, end]) }),
      ]);
      const result = await getStockReturnRanking(db, periodInput(period));
      expect(result.requestedStart).toBe(
        `${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6)}`
      );
      expect(result.days).toBe(2);
      expect(result.items[0].sampleDays).toBe(2);
    }
  );

  it("1年是12自然月，能超过100交易日；3年也不截断历史", async () => {
    const dates = weekdayDates(750);
    const db = sampleDb([
      stock("600001.SH", [], { rows: quotes(dates, 101, 100) }),
    ]);
    const year = await getStockReturnRanking(db, periodInput("1y"));
    const threeYears = await getStockReturnRanking(db, periodInput("3y"));
    expect(year.days).toBeGreaterThan(250);
    expect(year.days).toBeLessThan(300);
    expect(threeYears.days).toBe(750);
    expect(threeYears.items[0].sampleDays).toBe(750);
    expect(threeYears.items[0].returnPercent).toBeCloseTo(
      (1.01 ** 750 - 1) * 100,
      6
    );
  });

  it("两者缺省等同1m；旧days任意1..100、topN任意1..100仍兼容", async () => {
    const db = sampleDb([
      stock("600001.SH", [], {
        rows: quotes(["20261003", "20261005", "20261104"]),
      }),
    ]);
    const { period: _period, ...defaultInput } = periodInput();
    const result = await getStockReturnRanking(db, defaultInput);
    expect(result).toMatchObject({
      period: "1m",
      requestedStart: "2026-10-04",
      windowStart: "2026-10-05",
      days: 2,
    });
    expect(await getStockReturnRanking(db, periodInput())).toBe(result);
    expect(db.execute).toHaveBeenCalledTimes(4);
    const old = await getStockReturnRanking(db, { ...input, days: 1, topN: 7 });
    expect(old).toMatchObject({
      days: 1,
      topN: 7,
      requestedStart: null,
      coverageNote: null,
    });
    expect(old.period).toBeUndefined();
  });

  it("日期来自全市场，板块缺日/新股不足/停牌/重复/无效价不能凑完整共同日期集", async () => {
    const good = stock("688001.SH", [], {
      rows: quotes(["20261029", "20261103", "20261104"]),
    });
    const samples = [
      good,
      stock("688002.SH", [], { rows: good.rows.slice(1) }),
      stock("688003.SH", [], { rows: [good.rows[0], good.rows[2]] }),
      stock("688004.SH", [], { rows: [...good.rows, good.rows[1]] }),
      stock("688005.SH", [], {
        rows: [good.rows[0], { ...good.rows[1], close: null }, good.rows[2]],
      }),
      stock("688006.SH", [], { rows: [] }),
      stock("000001.SZ", [], { rows: quotes(["20261102"]) }),
    ];
    const result = await getStockReturnRanking(
      sampleDb(samples),
      periodInput("1w", { market: "STAR" })
    );
    expect(result).toMatchObject({
      windowTradingDays: 4,
      eligibleCount: 0,
      excludedCount: 6,
      items: [],
    });
    const complete = await getStockReturnRanking(
      sampleDb(samples.slice(0, 6)),
      periodInput("1w", { market: "STAR" })
    );
    expect(complete).toMatchObject({ eligibleCount: 1, excludedCount: 5 });
    expect(complete.items[0].sampleDays).toBe(3);
  });

  it("北京15点前后cutoff改变立即绕过5分钟缓存；实际源延迟/周末不制造日期", async () => {
    const s = stock("600001.SH", [], {
      rows: quotes(["20261029", "20261104", "20261105", "20261106"]),
    });
    const db = sampleDb([s]);
    expect((await getStockReturnRanking(db, periodInput("1w"))).asOf).toBe(
      "2026-11-04"
    );
    vi.setSystemTime(new Date("2026-11-05T07:00:00Z"));
    expect((await getStockReturnRanking(db, periodInput("1w"))).asOf).toBe(
      "2026-11-05"
    );
    vi.setSystemTime(new Date("2026-11-07T08:00:00Z"));
    const weekend = await getStockReturnRanking(db, periodInput("1w"));
    expect(weekend).toMatchObject({
      asOf: "2026-11-06",
      requestedStart: "2026-10-31",
      windowTradingDays: 3,
    });
    expect(db.execute).toHaveBeenCalledTimes(12);
  });

  it.each(["1m", "all"] as StockReturnRankingPeriod[])(
    "%s没有真实源日期时不制造asOf或上市完整性",
    async period => {
      const db = sampleDb([]);
      const result = await getStockReturnRanking(db, periodInput(period));
      expect(result).toMatchObject({
        period,
        days: 0,
        requestedStart: null,
        asOf: null,
        windowStart: null,
        windowTradingDays: 0,
        completeWindow: false,
        items: [],
        dataUpdatedAt: null,
      });
      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(await getStockReturnRanking(db, periodInput(period))).toBe(result);
    }
  );

  it.each([
    null,
    "365",
    "1Y",
    "lifetime",
    "__proto__",
    12,
    {},
    "1m; DROP TABLE ts_daily",
  ])("非法period %j查询前拒绝", async period => {
    const db = sampleDb([]);
    await expect(
      getStockReturnRanking(db, {
        ...periodInput(),
        period,
      } as StockReturnRankingInput)
    ).rejects.toThrow();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it.each(["1w", "1m", "all"] as StockReturnRankingPeriod[])(
    "days与period=%s不能同时指定",
    async period => {
      const db = sampleDb([]);
      await expect(
        getStockReturnRanking(db, { ...input, period })
      ).rejects.toThrow(/mutually exclusive/);
      expect(db.execute).not.toHaveBeenCalled();
    }
  );
});

describe("全部：自身上市以来完整缓存日期集，保守排除不完整历史", () => {
  const dates = ["20200102", "20200103", "20261030", "20261103", "20261104"];
  it("不同上市日股票sampleDays各自完整；老股只近几个月不能冒充全生命周期", async () => {
    const samples = [
      stock("600001.SH", [], { list_date: "20200102", rows: quotes(dates) }),
      stock("600002.SH", [], {
        list_date: "2026-10-30",
        rows: quotes(dates.slice(2)),
      }),
      stock("600003.SH", [], {
        list_date: "20200102",
        rows: quotes(dates.slice(2)),
      }),
      stock("600004.SH", [], {
        list_date: "20200102",
        rows: quotes(dates.slice(0, -1)),
      }),
      stock("600005.SH", [], {
        list_date: "20200102",
        rows: quotes([dates[0], ...dates.slice(2)]),
      }),
      stock("600006.SH", [], {
        list_date: "20200102",
        rows: [...quotes(dates), ...quotes([dates[1]])],
      }),
      stock("600007.SH", [], {
        list_date: "20200102",
        rows: quotes(dates).map((r, i) =>
          i === 1 ? { ...r, preClose: 0 } : r
        ),
      }),
      stock("600008.SH", [], { list_date: "20200102", rows: [] }),
    ];
    const db = sampleDb(samples);
    const result = await getStockReturnRanking(db, periodInput("all"));
    expect(result).toMatchObject({
      period: "all",
      days: 5,
      requestedStart: null,
      windowTradingDays: 5,
      windowStart: "2020-01-02",
      asOf: "2026-11-04",
      eligibleCount: 2,
      excludedCount: 6,
    });
    expect(
      result.items.map(s => [
        s.tsCode,
        s.sampleDays,
        s.firstTradeDate,
        s.lastTradeDate,
      ])
    ).toEqual([
      ["600001.SH", 5, "2020-01-02", "2026-11-04"],
      ["600002.SH", 3, "2026-10-30", "2026-11-04"],
    ]);
    expect(result.coverageNote).toContain("历史补全尚未全部完成");
    expect(result.coverageNote).toContain("未经独立交易日历核验");
    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(
      db.execute.mock.calls.filter(([sql]) =>
        sql.includes("ORDER BY d.trade_date DESC")
      )
    ).toHaveLength(1);
  });

  it("退市D截止真实lastTradeDate，上市L必须到global asOf；D不能填平退市后日期", async () => {
    const db = sampleDb([
      stock("600001.SH", [], { list_date: dates[0], rows: quotes(dates) }),
      stock("600002.SH", [], {
        list_status: "D",
        list_date: dates[0],
        rows: quotes(dates.slice(0, 3)),
      }),
      stock("600003.SH", [], {
        list_status: "D",
        list_date: dates[1],
        rows: quotes(dates.slice(1, 4)),
      }),
      stock("600004.SH", [], {
        list_status: "D",
        list_date: dates[0],
        rows: quotes([dates[0], dates[2]]),
      }),
    ]);
    const result = await getStockReturnRanking(
      db,
      periodInput("all", { market: "DELISTED" })
    );
    expect(result).toMatchObject({
      asOf: "2026-11-04",
      windowTradingDays: 5,
      eligibleCount: 2,
      excludedCount: 1,
    });
    expect(
      result.items.map(s => [s.tsCode, s.sampleDays, s.lastTradeDate])
    ).toEqual([
      ["600002.SH", 3, "2026-10-30"],
      ["600003.SH", 3, "2026-11-03"],
    ]);
  });

  it.each([
    undefined,
    null,
    "",
    "unknown",
    "20200230",
    "20200229",
    "20191231",
    "20261105",
    20200102,
    "2020/01/02",
  ])("缺失/无效/不在缓存日期集/错上市起点 %j保守排除", async list_date => {
    const db = sampleDb([
      stock("600001.SH", [], { list_date, rows: quotes(dates) }),
    ]);
    expect(await getStockReturnRanking(db, periodInput("all"))).toMatchObject({
      eligibleCount: 0,
      excludedCount: 1,
      items: [],
    });
  });

  it("所有行即使首日早于上市日也不能混入全生命周期", async () => {
    const db = sampleDb([
      stock("600001.SH", [], { list_date: dates[1], rows: quotes(dates) }),
    ]);
    expect(await getStockReturnRanking(db, periodInput("all"))).toMatchObject({
      eligibleCount: 0,
      excludedCount: 1,
    });
  });

  it("全部仍逐日参考复合，不首末close相除；平盘有效但不入榜", async () => {
    const db = sampleDb([
      stock(
        "600001.SH",
        [
          [110, 100],
          [55, 50],
        ],
        { list_date: "20261103" }
      ),
      stock(
        "600002.SH",
        [
          [110, 100],
          [99, 110],
        ],
        { list_date: "20261103" }
      ),
      stock(
        "600003.SH",
        [
          [10, 10],
          [10, 10],
        ],
        { list_date: "20261103" }
      ),
    ]);
    const up = await getStockReturnRanking(db, periodInput("all"));
    const down = await getStockReturnRanking(
      db,
      periodInput("all", { direction: "down", topN: 7 })
    );
    expect(up.eligibleCount).toBe(3);
    expect(up.items[0].returnPercent).toBeCloseTo(21, 12);
    expect(down.items[0].returnPercent).toBeCloseTo(-1, 12);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });
});

describe("周期重查询共享、串行、5分钟成功缓存和SQL成本边界", () => {
  it("同DB同period重key跨市场/方向/topN/keyword/ledger共享，筛选结果不污染", async () => {
    const keyword = "a%_!\\' OR 1=1 --";
    const db = sampleDb([
      stock("600001.SH", [], {
        list_date: "20261104",
        name: keyword,
        rows: quotes(["20261104"]),
      }),
      stock("688001.SH", [], {
        list_date: "20261104",
        rows: quotes(["20261104"], 9),
      }),
    ]);
    const [all, star, searched, delisted] = await Promise.all([
      getStockReturnRanking(db, periodInput("all")),
      getStockReturnRanking(
        db,
        periodInput("all", {
          market: "STAR",
          direction: "down",
          topN: 7,
          ledgerId: 52,
        })
      ),
      getStockReturnRanking(db, periodInput("all", { keyword, ledgerId: 53 })),
      getStockReturnRanking(db, periodInput("all", { market: "DELISTED" })),
    ]);
    expect(db.execute).toHaveBeenCalledTimes(3);
    expect(all.eligibleCount).toBe(2);
    expect(star.items[0].tsCode).toBe("688001.SH");
    expect(searched.items[0].tsCode).toBe("600001.SH");
    expect(delisted.eligibleCount).toBe(0);
    expect(
      db.execute.mock.calls.every(
        ([sql, params]) => !sql.includes(keyword) && !params?.includes(keyword)
      )
    ).toBe(true);
  });

  it("不同DB不共享heavy source", async () => {
    const first = sampleDb([
      stock("600001.SH", undefined, { list_date: "20261104" }),
    ]);
    const second = sampleDb([
      stock("000001.SZ", undefined, { list_date: "20261104" }),
    ]);
    const [a, b] = await Promise.all([
      getStockReturnRanking(first, periodInput("all")),
      getStockReturnRanking(second, periodInput("all")),
    ]);
    expect(a.items[0].tsCode).toBe("600001.SH");
    expect(b.items[0].tsCode).toBe("000001.SZ");
    expect(first.execute).toHaveBeenCalledTimes(3);
    expect(second.execute).toHaveBeenCalledTimes(3);
  });

  it("同库不同重key严格串行，1m重复请求也共享整个扫描", async () => {
    const releases: (() => void)[] = [];
    const backing = sampleDb([
      stock("600001.SH", undefined, { list_date: "20261104" }),
    ]);
    let active = 0,
      maxActive = 0;
    const execute = vi.fn(async (sql: string, params?: any[]) => {
      active++;
      maxActive = Math.max(maxActive, active);
      if (
        sql.includes("AS as_of") ||
        (sql.includes("ORDER BY d.trade_date DESC") && params?.length === 1)
      )
        await new Promise<void>(resolve => releases.push(resolve));
      const rows = await backing.execute(sql, params);
      active--;
      return rows;
    });
    const db = { execute };
    const requests = [
      getStockReturnRanking(db, periodInput("all")),
      getStockReturnRanking(db, periodInput("1m")),
      getStockReturnRanking(db, periodInput("1m", { direction: "down" })),
      getStockReturnRanking(db, periodInput("3y")),
    ];
    expect(execute).toHaveBeenCalledTimes(1);
    releases.shift()!();
    for (let i = 0; i < 60; i++) await Promise.resolve();
    expect(releases).toHaveLength(1);
    releases.shift()!();
    for (let i = 0; i < 60; i++) await Promise.resolve();
    expect(releases).toHaveLength(1);
    releases.shift()!();
    await Promise.all(requests);
    expect(maxActive).toBe(1);
    expect(execute).toHaveBeenCalledTimes(11);
  });

  it("5分钟内复用source，新增筛选projection不延长source寿命；到期更新实际源与timestamp", async () => {
    vi.setSystemTime(new Date("2026-11-05T07:00:00Z"));
    const s = stock("600001.SH", undefined, { list_date: "20261104" });
    const db = sampleDb([s]);
    const first = await getStockReturnRanking(db, periodInput("all"));
    s.rows.push(...quotes(["20261105"]));
    vi.setSystemTime(new Date("2026-11-05T07:04:59.999Z"));
    const projection = await getStockReturnRanking(
      db,
      periodInput("all", { topN: 7 })
    );
    expect(projection.fetchedAt).toBe(first.fetchedAt);
    expect(projection.asOf).toBe("2026-11-04");
    expect(db.execute).toHaveBeenCalledTimes(3);
    vi.setSystemTime(new Date("2026-11-05T07:05:00Z"));
    const refreshed = await getStockReturnRanking(
      db,
      periodInput("all", { topN: 7 })
    );
    expect(refreshed).toMatchObject({
      asOf: "2026-11-05",
      fetchedAt: "2026-11-05T07:05:00.000Z",
      days: 2,
    });
    expect(db.execute).toHaveBeenCalledTimes(6);
  });

  it.each(["DISTINCT d.trade_date", "a.row_days", "AS data_updated_at"])(
    "全部%s异常不缓存heavy source，重试重新扫描",
    async stage => {
      const backing = sampleDb([
        stock("600001.SH", undefined, { list_date: "20261104" }),
      ]);
      let failed = false;
      const execute = vi.fn(async (sql: string, params?: any[]) => {
        if (sql.includes(stage) && !failed) {
          failed = true;
          throw new Error("read failed");
        }
        return backing.execute(sql, params);
      });
      const db = { execute };
      const first = await Promise.allSettled([
        getStockReturnRanking(db, periodInput("all")),
        getStockReturnRanking(db, periodInput("all", { topN: 7 })),
      ]);
      expect(first.every(result => result.status === "rejected")).toBe(true);
      expect(
        (await getStockReturnRanking(db, periodInput("all"))).eligibleCount
      ).toBe(1);
      expect(
        backing.execute.mock.calls.filter(([sql]) =>
          sql.includes("ORDER BY d.trade_date DESC")
        )
      ).toHaveLength(stage === "DISTINCT d.trade_date" ? 1 : 2);
    }
  );

  it("无效重查询计数/identity/source时间不缓存，排除样本不是伪造平盘", async () => {
    for (const bad of [{ sample_days: "bad" }, { ts_code: "" }]) {
      const db = rawDb([{ ...validSummary, list_date: "20261104", ...bad }]);
      await expect(
        getStockReturnRanking(db, periodInput("all"))
      ).rejects.toThrow(TypeError);
      await expect(
        getStockReturnRanking(db, periodInput("all", { topN: 7 }))
      ).rejects.toThrow(TypeError);
      expect(db.execute).toHaveBeenCalledTimes(4);
    }
    const db = rawDb(
      [{ ...validSummary, list_date: "20261104" }],
      undefined,
      false,
      "bad"
    );
    await expect(getStockReturnRanking(db, periodInput("all"))).rejects.toThrow(
      TypeError
    );
    await expect(getStockReturnRanking(db, periodInput("all"))).rejects.toThrow(
      TypeError
    );
    expect(db.execute).toHaveBeenCalledTimes(6);
  });

  it.each(["1m", "3m", "3y", "all"] as StockReturnRankingPeriod[])(
    "%s仅SELECT/idx_trade_date、90s hint、汇总价和日期，不返回raw历史",
    async period => {
      const db = sampleDb([
        stock("600001.SH", undefined, { list_date: "20261104" }),
      ]);
      await getStockReturnRanking(db, periodInput(period));
      for (const [sql, params] of db.execute.mock.calls) {
        expect(sql.trim()).toMatch(/^SELECT\s/);
        expect(sql).toContain("MAX_EXECUTION_TIME(90000)");
        expect(sql).toContain("FORCE INDEX (idx_trade_date)");
        expect(sql.match(/\?/g)).toHaveLength(params?.length ?? 0);
        expect(sql).not.toMatch(
          /\b(INSERT|UPDATE|DELETE|CREATE|REPLACE|TRUNCATE)\b/i
        );
        expect(sql).not.toMatch(
          /ts_stock_lifecycle|ts_trade_cal|information_schema|SELECT\s+d\.\*|LIMIT\s+100/i
        );
      }
      const [aggregateSql] = db.execute.mock.calls.find(([sql]) =>
        sql.includes("a.row_days")
      )!;
      expect(aggregateSql.match(/FROM ts_daily/g)).toHaveLength(1);
      expect(aggregateSql).toContain("COUNT(DISTINCT d.trade_date)");
      expect(aggregateSql).toContain("LN(d.close / (d.pre_close * 1e0))");
      expect(aggregateSql).toContain(
        "SUBSTRING_INDEX(MIN(CONCAT(d.trade_date, ':', d.pre_close))"
      );
      expect(aggregateSql).not.toMatch(
        /pct_chg|COALESCE|GROUP_CONCAT|ROW_NUMBER/
      );
      expect(aggregateSql.includes("b.list_date")).toBe(period === "all");
    }
  );
});
