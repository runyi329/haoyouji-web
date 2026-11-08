import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StockChipDistributionResult, StockLatestChipCost, StockMAMonitorChartInput, StockMAMonitorChartResult, StockMAMonitorItem } from "@shared/stock-ma-monitor";
import { alignedChipReferencePrice, chipDistributionEnabled, chipDistributionEmptyState, chipDistributionCacheMs, latestPublishedChipCost, matchingChipCostChart, matchingQfqChart, monitorDisplayCandles, MonitorCard } from "./StockMAMonitor";

// 隔离传输与初始本卡状态；仅确定性单元fixture，不启动页面、浏览器或真实API。
const transport = vi.hoisted(() => ({ query: vi.fn(), distribution: vi.fn(), visible: false, mode: "average" as "average" | "chip-cost", stateIndex: 0 }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  aiStockMAMonitorChart: { useQuery: transport.query }, aiStockChipDistribution: { useQuery: transport.distribution },
} }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: <T,>(initial: T | (() => T)) => {
    // MonitorCard前两个state分别为可见性/本卡模式；其他组件state保留React行为。
    const index = transport.stateIndex++;
    return actual.useState(index === 0 && initial === false ? transport.visible
      : index === 1 && initial === "average" ? transport.mode : initial);
  } };
});

const input: StockMAMonitorChartInput = { ledgerId: 37, tsCode: "000001.SZ", periods: [5, 10, 20], asOf: "2026-01-07", sourceVersion: "fixture-v1" };
const stock: StockMAMonitorItem = {
  tsCode: input.tsCode, name: "单元测试股票", close: 12, changePercent: 1.2, consecutiveDays: 4,
  consecutiveIsLowerBound: true, qualifiedSince: "2026-01-02", averages: { 5: 11, 10: 10, 20: 9 },
  candles: [{ date: input.asOf, open: 11, high: 13, low: 10, close: 12,
    averages: { 5: 11, 10: 10, 20: 9 }, compositeAverage: 10.7, chipAverageCost: 10.9 }],
};
function quote(overrides: Partial<StockLatestChipCost> = {}): StockLatestChipCost {
  return { value: 11.13, asOf: input.asOf, source: "Tushare cyq_perf.weight_avg", estimated: true,
    status: "current", fetchedAt: "2026-01-07T08:00:00Z", ...overrides };
}
function chart(overrides: Partial<StockMAMonitorChartResult> = {}): StockMAMonitorChartResult {
  return { tsCode: input.tsCode, periods: [...input.periods], asOf: input.asOf, sourceVersion: input.sourceVersion,
    priceBasis: "qfq", anchorDate: input.asOf, chartStatus: "ready", chipStatus: "ready", chipAsOf: input.asOf,
    compositeAverage: 7.7, chipAverageCost: 7.9, latestChipCost: quote(), fetchedAt: "2026-01-07T08:00:00Z", note: "",
    candles: [{ date: input.asOf, open: 8, high: 10, low: 7, close: 9, averages: {},
      compositeAverage: 7.7, chipAverageCost: 7.9, chipStatus: "ready" }], ...overrides };
}
function distribution(overrides: Partial<StockChipDistributionResult> = {}): StockChipDistributionResult {
  return { tsCode: input.tsCode, sourceVersion: input.sourceVersion, asOf: "2026-01-06", source: "Tushare cyq_chips",
    estimated: true, status: "ready", points: [{ price: 8, percent: 20 }, { price: 10, percent: 80 }],
    weightAvg: 9.6, latestChipCost: quote(), fetchedAt: "2026-01-07T08:00:00Z", note: "", ...overrides };
}
function cardMarkup(overrides: Partial<Parameters<typeof MonitorCard>[0]> = {}) {
  transport.stateIndex = 0;
  return renderToStaticMarkup(createElement(MonitorCard, { stock, periods: [...input.periods], ledgerId: 37,
    asOf: input.asOf, sourceVersion: input.sourceVersion, isFavorite: true, canFavorite: true, onFavorite: () => {}, ...overrides }));
}
beforeEach(() => {
  transport.query.mockReset(); transport.distribution.mockReset(); transport.visible = false; transport.mode = "average";
  transport.query.mockReturnValue({ data: undefined, error: null, isPlaceholderData: false });
  transport.distribution.mockReturnValue({ data: undefined, error: null, isPlaceholderData: false, isFetching: false });
});

describe("日K独立展示与无历史筹码", () => {
  it("仅同股票、周期、日期、源版本且ready/qfq接受日K；周期顺序不改变身份", () => {
    expect(matchingQfqChart(chart(), input)).toBe(true);
    expect(matchingQfqChart(chart({ periods: [20, 5, 10] }), input)).toBe(true);
    for (const changed of [{ tsCode: "600000.SH" }, { periods: [20, 30, 60] }, { asOf: "2026-01-06" }, { sourceVersion: "fixture-v0" },
      { chartStatus: "unavailable" as const }, { priceBasis: "unadjusted" as const }, { candles: [] }]) expect(matchingQfqChart(chart(changed), input)).toBe(false);
    expect(matchingQfqChart(undefined, input)).toBe(false);
    expect(matchingQfqChart(chart(), { ...input, asOf: "" })).toBe(false);
  });
  it("原始及qfq图所有历史筹码点统一null，不改OHLC和后端G、不算筹码", () => {
    const raw = monitorDisplayCandles(stock.candles);
    expect(raw[0]).toEqual({ ...stock.candles[0], chipAverageCost: null });
    expect(stock.candles[0].chipAverageCost).toBe(10.9);
    const result = chart();
    result.candles.push({ ...result.candles[0], date: "2026-01-06", chipStatus: "unknown_basis", chipAverageCost: 999 });
    const display = monitorDisplayCandles(stock.candles, result);
    expect(display.every(candle => candle.chipAverageCost === null)).toBe(true);
    expect(display[0].compositeAverage).toBe(7.7);
    transport.query.mockReturnValue({ data: result, error: null, isPlaceholderData: false });
    const html = cardMarkup();
    expect(html).toContain('data-stock-mini-reference="compositeAverage"');
    expect(html).not.toContain('data-stock-mini-reference="chipAverageCost"');
    expect(html).not.toContain("筹码平均成本");
    expect(html).not.toContain("筹码：样本校验");
    expect(html).not.toContain("待核实");
    expect(html).not.toContain("暂不可比");
  });
  it("unavailable、placeholder、raw或错误响应不切日K基准", () => {
    for (const response of [{ data: chart(), error: new Error("unit"), isPlaceholderData: false },
      { data: chart({ chartStatus: "unavailable" }), error: null, isPlaceholderData: false },
      { data: chart({ priceBasis: "unadjusted" }), error: null, isPlaceholderData: false },
      { data: chart(), error: null, isPlaceholderData: true }]) {
      transport.query.mockReturnValue(response);
      expect(cardMarkup()).toContain("原始日K");
      expect(cardMarkup()).not.toContain("前复权日K");
    }
  });
});

describe("最新供应商成本原值与实际日期", () => {
  it("chart unavailable/unknown_basis仍接受供应商原值，且不叠日K历史线", () => {
    const result = chart({ chartStatus: "unavailable", priceBasis: "unadjusted", chipStatus: "unknown_basis", candles: [] });
    expect(matchingChipCostChart(result, input)).toBe(true);
    transport.query.mockReturnValue({ data: result, error: null, isPlaceholderData: false });
    const html = cardMarkup();
    expect(html).toContain('data-stock-monitor-chip-cost="11.13"');
    expect(html).toContain("11.13");
    expect(html).toContain("元");
    expect(html).toContain("Tushare cyq_perf.weight_avg");
    expect(html).toContain("原始日K");
    expect(html).not.toContain("暂不可比");
    expect(html).not.toContain("待核实");
  });
  it("拒绝错股、旧版本、其他周期及不匹配chartAsOf；未来cost日期无效", () => {
    for (const changed of [{ tsCode: "600000.SH" }, { sourceVersion: "fixture-v0" }, { periods: [20, 30, 60] },
      { asOf: "2026-01-06" }, { asOf: "2026-01-08" }]) {
      const result = chart(changed);
      expect(matchingChipCostChart(result, input)).toBe(false);
      transport.query.mockReturnValue({ data: result, error: null, isPlaceholderData: false });
      expect(cardMarkup()).not.toContain('data-stock-monitor-chip-cost="11.13"');
    }
    transport.query.mockReturnValue({ data: chart({ latestChipCost: quote({ asOf: "2026-01-08" }) }), error: null, isPlaceholderData: false });
    expect(cardMarkup()).toContain('data-stock-monitor-chip-cost="missing"');
  });
  it("此前最近已发布单值保留实际date，不标同日；无任何真实quote只显示筹码成本—", () => {
    transport.query.mockReturnValue({ data: chart({ latestChipCost: quote({ asOf: "2026-01-06", status: "previous" }) }), error: null, isPlaceholderData: false });
    const html = cardMarkup();
    expect(html).toContain("实际成本日期：2026-01-06");
    expect(html).toContain("此前最近已发布记录");
    expect(html).not.toContain("最新行情日已发布记录");
    expect(html).toContain('aria-haspopup="dialog"');
    transport.query.mockReturnValue({ data: chart({ latestChipCost: undefined }), error: null, isPlaceholderData: false });
    expect(cardMarkup()).toContain('data-stock-monitor-chip-cost="missing"');
    expect(cardMarkup()).toContain("筹码成本");
    expect(cardMarkup()).toContain("—");
  });
  it("图表与分布quote择真正最新actualdate，missing分布也可供quote；不依赖分布日均值", () => {
    transport.query.mockReturnValue({ data: chart({ latestChipCost: quote({ asOf: "2026-01-05", status: "previous", value: 8 }) }), error: null, isPlaceholderData: false });
    transport.distribution.mockReturnValue({ data: distribution({ asOf: null, status: "missing", points: [], latestChipCost: quote({ asOf: "2026-01-06", status: "previous", value: 10.25 }) }), error: null, isPlaceholderData: false });
    expect(cardMarkup()).toContain('data-stock-monitor-chip-cost="10.25"');
    expect(cardMarkup()).toContain("实际成本日期：2026-01-06");
    for (const changed of [{ tsCode: "600000.SH" }, { sourceVersion: "fixture-v0" }, { asOf: "2026-01-08" }]) {
      transport.distribution.mockReturnValue({ data: distribution(changed), error: null, isPlaceholderData: false });
      expect(cardMarkup()).toContain('data-stock-monitor-chip-cost="8"');
    }
    transport.distribution.mockReturnValue({ data: distribution(), error: null, isPlaceholderData: true });
    expect(cardMarkup()).toContain('data-stock-monitor-chip-cost="8"');
  });
  it("单值校验拒绝无实际日期、非有限/非正值、missing状态和未来日期，cached真实日期可保留", () => {
    for (const candidate of [quote({ value: null }), quote({ value: Number.NaN }), quote({ value: 0 }), quote({ value: Number.POSITIVE_INFINITY }),
      quote({ asOf: null }), quote({ asOf: "2026-02-30" }), quote({ status: "missing" }), quote({ fetchedAt: "bad" }), quote({ asOf: "2026-01-08" })]) {
      expect(latestPublishedChipCost([candidate], input.asOf)).toBeUndefined();
    }
    const old = quote({ value: 9, asOf: "20260105", status: "cached" });
    const recent = quote({ value: 10, asOf: "2026-01-06", status: "previous" });
    expect(latestPublishedChipCost([old, recent, quote({ asOf: "2026-01-08" })], input.asOf)).toBe(recent);
    expect(latestPublishedChipCost([old], "2026-01-04")).toBeUndefined();
    expect(latestPublishedChipCost([old], "2026-01-05")).toBe(old);
  });
});

describe("本卡底部切换与严格可见懒请求", () => {
  it("默认加权均价，两个按钮放图下面，报价独立点击，不是标题全页切换", () => {
    const html = cardMarkup();
    expect(html).toContain('data-stock-monitor-card-mode="average"');
    expect(html).toContain('data-stock-monitor-card-toggle="average" aria-pressed="true"');
    expect(html).toContain('data-stock-monitor-card-toggle="chip-cost" aria-pressed="false"');
    expect(html.indexOf('data-stock-monitor-card-toggle="average"')).toBeGreaterThan(html.indexOf("</svg>"));
    expect(html.indexOf('data-stock-monitor-chip-quote-row="true"')).toBeLessThan(html.indexOf('data-stock-monitor-latest-quote-row="true"'));
    expect(html.indexOf('data-stock-monitor-latest-quote-row="true"')).toBeLessThan(html.indexOf('data-stock-monitor-kline="true"'));
    expect(html).toContain("grid-cols-2");
    expect(html).not.toContain("data-stock-chip-distribution");
    expect(transport.query.mock.lastCall![0]).toEqual(input);
    expect(transport.distribution.mock.lastCall![0]).toEqual(input);
    expect(transport.query.mock.lastCall![1].enabled).toBe(false);
    expect(transport.distribution.mock.lastCall![1].enabled).toBe(false);
  });
  it("visible且本卡chip-cost时才启用分布，日K可见懒请求不受切换影响，无预取轮询retry", () => {
    transport.visible = true;
    cardMarkup();
    expect(transport.query.mock.lastCall![1].enabled).toBe(true);
    expect(transport.distribution.mock.lastCall![1].enabled).toBe(false);
    transport.mode = "chip-cost";
    transport.distribution.mockReturnValue({ data: distribution(), error: null, isPlaceholderData: false });
    const html = cardMarkup();
    expect(transport.query.mock.lastCall![1].enabled).toBe(true);
    expect(transport.distribution.mock.lastCall![1].enabled).toBe(true);
    expect(html).toContain("data-stock-chip-distribution");
    expect(html).not.toContain("data-stock-mini-candle");
    expect(html).toContain('data-stock-monitor-chip-stage="true"');
    expect(html).toContain('data-stock-chip-scale="soft-log"');
    expect(html).toContain("0.50元/档");
    expect(html).toContain("合计");
    expect(html).toContain('height="130"');
    expect(html).toContain("h-[287px]");
    expect(html).toContain('data-stock-monitor-card-body="true"');
    expect(html).toContain('data-stock-monitor-shared-quote="true"');
    expect(html).not.toContain('data-stock-monitor-chip-info-overlay="true"');
    expect(html.indexOf("</h3>")).toBeLessThan(html.indexOf('data-stock-monitor-chip-stage="true"'));
    expect(html).toContain('data-stock-monitor-card-toggle="chip-cost" aria-pressed="true"');
    for (const options of [transport.query.mock.lastCall![1], transport.distribution.mock.lastCall![1]]) {
      if (typeof options.staleTime === "function") {
        expect(options.staleTime({ state: { data: distribution() } })).toBe(30 * 60_000);
        expect(options.staleTime({ state: { data: distribution({ status: "unavailable", points: [], asOf: null, weightAvg: null }) } })).toBe(0);
      } else expect(options.staleTime).toBe(30 * 60_000);
      expect(options.retry).toBe(false);
      expect(options.refetchInterval).toBe(false);
      expect(options.refetchOnReconnect).toBe(false);
      expect(options.refetchOnWindowFocus).toBe(false);
      expect(options.placeholderData).toBeUndefined();
    }
    transport.visible = false;
    cardMarkup();
    expect(transport.distribution.mock.lastCall![1].enabled).toBe(false);
    expect(chipDistributionEnabled(true, "average", input)).toBe(false);
    expect(chipDistributionEnabled(false, "chip-cost", input)).toBe(false);
    expect(chipDistributionEnabled(true, "chip-cost", { ...input, asOf: "" })).toBe(false);
    expect(chipDistributionEnabled(true, "chip-cost", { ...input, sourceVersion: "" })).toBe(false);
  });
  it("无日期或版本请求禁用，切周期/版本不沿用旧图或旧quote；占位错误不展示", () => {
    transport.visible = true; transport.mode = "chip-cost";
    transport.query.mockReturnValue({ data: chart(), error: null, isPlaceholderData: false });
    transport.distribution.mockReturnValue({ data: distribution(), error: null, isPlaceholderData: false });
    for (const overrides of [{ asOf: null }, { sourceVersion: undefined }, { sourceVersion: "fixture-v2" }]) {
      const html = cardMarkup(overrides);
      expect(html).not.toContain('data-stock-monitor-chip-cost="11.13"');
    }
    // 分布响应不含periods；周期由query key隔离且不沿用placeholder。
    transport.distribution.mockReturnValue({ data: undefined, error: null, isPlaceholderData: false });
    expect(cardMarkup({ periods: [20, 30, 60] })).not.toContain('data-stock-monitor-chip-cost="11.13"');
    expect(transport.distribution.mock.lastCall![0].periods).toEqual([20, 30, 60]);
    cardMarkup({ asOf: null });
    expect(transport.query.mock.lastCall![1].enabled).toBe(false);
    expect(transport.distribution.mock.lastCall![1].enabled).toBe(false);
  });
  it("切换或匹配图不改变实际收盘、涨跌幅、连续下限或收藏", () => {
    transport.query.mockReturnValue({ data: chart(), error: null, isPlaceholderData: false });
    for (const mode of ["average", "chip-cost"] as const) {
      transport.mode = mode;
      const html = cardMarkup();
      expect(html).toContain("12.00");
      expect(html).toContain("+1.20%");
      expect(html).toContain('data-stock-monitor-consecutive="≥4天"');
      expect(html).toContain("不是连续上涨");
      expect(html).toContain('data-stock-favorite="000001.SZ"');
      expect(html).toContain("bg-[#E8F5EF]");
      expect(html).not.toContain("data-stock-mini-average-period");
    }
  });
  it("底部两键26px，只有当前键青蓝白字高亮，另一键浅灰凹感", () => {
    for (const mode of ["average", "chip-cost"] as const) {
      transport.mode = mode;
      const html = cardMarkup();
      for (const tab of ["average", "chip-cost"] as const) {
        const button = html.match(new RegExp(`<button[^>]*data-stock-monitor-card-toggle="${tab}"[^>]*>[\\s\\S]*?<\\/button>`))![0];
        expect(button).toContain("h-[26px]");
        expect(button).toContain(`aria-pressed="${tab === mode}"`);
        if (tab === mode) {
          expect(button).toContain("color:#FFFFFF");
          expect(button).toContain("background:linear-gradient(135deg, #087987, #0A818D)");
          expect(button).toContain("font-weight:600");
        } else {
          expect(button).toContain("background:#DFE9E6");
          expect(button).toContain("box-shadow:inset 0 1px 3px rgba(20,42,63,0.10)");
          expect(button).not.toContain("background:linear-gradient");
        }
      }
      expect(html).toContain("h-[287px]");
    }
  });
  it("切换只改变下方图形，上方名称、小方格和上下两行报价完全相同", () => {
    const top = (html: string) => html.slice(0, html.indexOf('data-stock-monitor-chart-region="true"'));
    transport.mode = "average";
    const average = cardMarkup();
    transport.mode = "chip-cost";
    const chip = cardMarkup();
    expect(top(chip)).toBe(top(average));
    for (const html of [average, chip]) {
      expect(html.match(/data-stock-monitor-quote-block="true"/g)).toHaveLength(1);
      expect(html).toContain("grid-rows-[70px_minmax(0,1fr)]");
      expect(html.indexOf('data-stock-monitor-chip-quote-row="true"')).toBeLessThan(html.indexOf('data-stock-monitor-latest-quote-row="true"'));
      expect(html.indexOf('data-stock-monitor-latest-quote-row="true"')).toBeLessThan(html.indexOf('data-stock-monitor-chart-region="true"'));
    }
  });
  it("连续符合一天一格，放名称下面且两模式同位，不再在报价区放文字徽章", () => {
    for (const mode of ["average", "chip-cost"] as const) {
      transport.mode = mode;
      for (const days of [1, 2, 4, 10]) {
        const html = cardMarkup({ stock: { ...stock, consecutiveDays: days, consecutiveIsLowerBound: false } });
        expect(html.match(/data-stock-monitor-day-square="/g)).toHaveLength(days);
        expect(html).toContain(`data-stock-monitor-consecutive="${days}天"`);
        expect(html.indexOf("</h3>")).toBeLessThan(html.indexOf("data-stock-monitor-consecutive="));
        expect(html.indexOf("data-stock-monitor-consecutive=")).toBeLessThan(html.indexOf('data-stock-monitor-card-body="true"'));
        expect(html).toContain("h-[287px]");
        const quote = html.slice(html.indexOf('data-stock-monitor-quote-block="true"'), html.indexOf('data-stock-monitor-card-mode='));
        expect(quote).not.toContain("data-stock-monitor-consecutive=");
      }
    }
  });
});

describe("只用匹配样本逆换算的现价筹码档定位", () => {
  const checkedChart = () => chart({ chipVerification: "sample", chipAverageCost: 11.13,
    candles: [{ ...stock.candles[0], chipAverageCost: 11.13, chipStatus: "ready" }] });
  const checkedDistribution = () => distribution({ asOf: input.asOf, weightAvg: 11.13,
    points: [{ price: 11, percent: 40 }, { price: 11.6, percent: 40 }, { price: 12.2, percent: 20 }] });
  it("同日已对齐时现价不变，反映射倍率不同时按已检查线性倍率换算", () => {
    const verified = checkedChart(), d = checkedDistribution();
    expect(alignedChipReferencePrice(stock, input, verified, d)).toBe(stock.close);
    const mapped = { ...verified, candles: [{ ...verified.candles[0], chipAverageCost: 5.565 }] };
    expect(alignedChipReferencePrice(stock, input, mapped, d)).toBeCloseTo(stock.close * d.weightAvg! / 5.565, 12);
    expect(alignedChipReferencePrice(stock, input, chart(), d)).toBeUndefined();
  });
  it("分布前一日必须有对应日的有效样本与原成本匹配，日期不伪装为同日", () => {
    const prior = "2026-01-06";
    const verified = checkedChart();
    verified.latestChipCost = quote({ asOf: prior, status: "previous" });
    verified.candles.unshift({ ...verified.candles[0], date: prior, close: 10, chipAverageCost: 7.42 });
    const d = checkedDistribution(); d.asOf = prior;
    expect(alignedChipReferencePrice(stock, input, verified, d)).toBeCloseTo(stock.close * d.weightAvg! / 7.42, 12);
    verified.candles[0].chipStatus = "unknown_basis";
    expect(alignedChipReferencePrice(stock, input, verified, d)).toBeUndefined();
  });
  it("未知、错股、版本、锚点、成本、收盘或重复日期均不定位", () => {
    const good = checkedChart(), d = checkedDistribution();
    for (const changed of [chart(), { ...good, chipVerification: undefined }, { ...good, sourceVersion: "wrong" },
      { ...good, tsCode: "600000.SH" }, { ...good, anchorDate: "2026-01-06" }, { ...good, chartStatus: "unavailable" as const },
      { ...good, latestChipCost: quote({ value: 11.14 }) }, { ...good, latestChipCost: quote({ asOf: "2026-01-06" }) },
      { ...good, candles: [{ ...good.candles[0], close: 9 }] },
      { ...good, candles: [{ ...good.candles[0], chipStatus: "unknown_basis" as const }] },
      { ...good, candles: [good.candles[0], good.candles[0]] }]) {
      expect(alignedChipReferencePrice(stock, input, changed, d)).toBeUndefined();
    }
    for (const changed of [{ ...d, tsCode: "600000.SH" }, { ...d, sourceVersion: "wrong" },
      { ...d, asOf: "2026-01-08" }, { ...d, weightAvg: null }]) {
      expect(alignedChipReferencePrice(stock, input, good, changed)).toBeUndefined();
    }
    expect(alignedChipReferencePrice({ ...stock, close: Number.NaN }, input, good, d)).toBeUndefined();
  });
  it("卡片只给价格口径匹配的分布传定位价，默认未检查不出现高亮", () => {
    transport.mode = "chip-cost";
    transport.query.mockReturnValue({ data: checkedChart(), error: null, isPlaceholderData: false });
    transport.distribution.mockReturnValue({ data: checkedDistribution(), error: null, isPlaceholderData: false });
    const html = cardMarkup();
    expect(html.match(/data-stock-chip-current-bin="true"/g)).toHaveLength(1);
    expect(html).toContain('data-stock-chip-current-price="12"');
    expect(html).toContain("#D49A32");
    transport.query.mockReturnValue({ data: chart(), error: null, isPlaceholderData: false });
    expect(cardMarkup()).not.toContain('data-stock-chip-current-bin="true"');
  });
});

describe("手机布局、筛选与帮助边界", () => {
  const source = readFileSync(new URL("./StockMAMonitor.tsx", import.meta.url), "utf8");
  it("请求失败不是无记录，错股错版本及异常记录不画图；成功才复用30分钟", () => {
    const missing = distribution({ status: "missing", points: [], asOf: null, weightAvg: null });
    expect(chipDistributionEmptyState(undefined, input)).toBe("idle");
    expect(chipDistributionEmptyState(distribution(), input)).toBeUndefined();
    expect(chipDistributionEmptyState(missing, input)).toBe("missing");
    for (const bad of [distribution({ status: "unavailable", points: [], asOf: null, weightAvg: null }),
      distribution({ points: [] }), distribution({ tsCode: "000026.SZ" }), distribution({ sourceVersion: "wrong" }),
      { ...missing, points: [{ price: 8, percent: 100 }] }]) {
      expect(chipDistributionEmptyState(bad, input)).toBe("error");
      expect(chipDistributionCacheMs(bad, input)).toBe(0);
    }
    expect(chipDistributionEmptyState(undefined, input, true)).toBe("error");
    expect(chipDistributionEmptyState(distribution(), input, false, true)).toBe("error");
    expect(chipDistributionCacheMs(distribution(), input)).toBe(30 * 60_000);
    expect(chipDistributionCacheMs(missing, input)).toBe(0);
    expect(chipDistributionCacheMs(undefined, input)).toBe(0);
  });
  it("卡片明确显示加载失败或暂无记录，等待时不伪报无数据，重试只由可见本卡手动触发", () => {
    transport.visible = true; transport.mode = "chip-cost";
    transport.distribution.mockReturnValue({ data: distribution({ status: "unavailable", points: [], asOf: null, weightAvg: null }), error: null, isFetching: false });
    let html = cardMarkup();
    expect(html).toContain("筹码分布加载失败");
    expect(html).toContain('data-stock-chip-retry="true"');
    expect(html).not.toContain("筹码分布暂无数据");
    transport.distribution.mockReturnValue({ data: distribution({ status: "missing", points: [], asOf: null, weightAvg: null }), error: null, isFetching: false });
    html = cardMarkup();
    expect(html).toContain("筹码分布暂无记录");
    expect(html).not.toContain("筹码分布加载失败");
    transport.distribution.mockReturnValue({ data: undefined, error: null, isFetching: true });
    html = cardMarkup();
    expect(html).not.toContain("筹码分布暂无数据");
    expect(html).not.toContain("筹码分布暂无记录");
    expect(html).not.toContain('data-stock-chip-retry="true"');
    expect(source).toContain("distributionQuery.refetch({ throwOnError: false })");
    expect(html).toContain("h-[287px]");
  });
  it("保留480px双列、分页及23px虚线，固定卡高并在筹码留白内适配报价", () => {
    expect(source).toContain("max-w-[480px]");
    expect(source).toContain("grid-cols-[repeat(2,minmax(0,1fr))]");
    expect(source.match(/h-\[23px\]/g)).toHaveLength(3);
    expect(source.match(/1px dashed #4F8F99/g)).toHaveLength(2);
    expect(source).toContain('data-stock-monitor-chip-explanation="true"');
    expect(source).toContain('onChipExplanation={() => setNotice("chip-cost")}');
    expect(source).toContain('aria-label="符合股票分页"');
    expect(source).toContain("max-w-full break-words rounded p-0 text-xl font-bold");
    expect(source).toContain("-mx-2.5 -mb-2.5 mt-2 grid w-[calc(100%+1.25rem)]");
    expect(source.match(/h-\[26px\]/g)).toHaveLength(2);
    expect(source).toContain('onClick={() => setLocalMode("average")}');
    expect(source).toContain('onClick={() => setLocalMode("chip-cost")}');
    const quoteSource = source.slice(source.indexOf('<button type="button" data-stock-monitor-chip-cost'), source.indexOf("</PopoverTrigger>", source.indexOf('<button type="button" data-stock-monitor-chip-cost')));
    const costLabel = source.slice(source.indexOf('<button type="button" data-stock-monitor-chip-explanation'), source.indexOf("</button>", source.indexOf('<button type="button" data-stock-monitor-chip-explanation')));
    expect(costLabel).not.toContain("borderBottom");
    expect(costLabel).toContain("leading-5");
    expect(source).toContain('title="相对上一交易日的收盘涨跌幅" className="shrink-0 whitespace-nowrap text-xs font-semibold leading-5"');
    expect(source).toContain('height={130} plotTop={20} plotBottom={98} focusBinCount={10}');
    expect(source).toContain("h-[287px]");
    expect(source).toContain("grid-rows-[70px_minmax(0,1fr)]");
    expect(source).toContain("containerType: \"inline-size\"");
    expect(source).toContain("quoteNumberSize(stock.close)");
    expect(source).not.toContain("chipNumberSize");
    expect(source).not.toContain("chipInfoHeight + 14");
    expect(source).not.toContain("relative order-first");
    expect(source).toContain("横条采用标注的温和对数尺度");
    expect(source).toContain("占比是区间内原始数据的合计");
    expect(source).toContain("低占比尾部用浅色降低视觉强调");
    expect(source).toContain("不把集中区归一化成100%");
    expect(quoteSource).not.toContain("setLocalMode");
    expect(quoteSource.slice(1)).not.toContain("<button");
    expect(source).not.toContain("<footer");
  });
  it("缺成本、大数字、模式切换均沿用相同固定卡片与主体，不使相邻卡片增长", () => {
    for (const mode of ["average", "chip-cost"] as const) {
      transport.mode = mode;
      transport.query.mockReturnValue({ data: chart({ latestChipCost: quote({ value: 10762.34 }) }), error: null, isPlaceholderData: false });
      const html = cardMarkup({ stock: { ...stock, close: 10812.34 } });
      expect(html).toContain("h-[287px]");
      expect(html).toContain('data-stock-monitor-card-body="true"');
      expect(html).toContain("10762.34");
      expect(html).toContain("10812.34");
      expect(html).toContain('data-stock-monitor-shared-quote="true"');
      expect(html).toContain("font-size:clamp(12px,calc((100cqw - 70px)");
    }
  });
  it("保留可见性rootMargin=0、模式/周期/复选顺序、严格筛选与多选不收起", () => {
    expect(source).toContain('rootMargin: "0px"');
    expect(source).toContain("enabled: visible && Boolean(asOf && sourceVersion)");
    expect(source.indexOf('aria-label="监控模式"')).toBeLessThan(source.indexOf('aria-label="监控周期预设"'));
    expect(source.indexOf('aria-label="监控周期预设"')).toBeLessThan(source.indexOf('aria-label="复选市场板块"'));
    expect(source).toContain('role="checkbox"');
    expect(source.slice(source.indexOf("const selectMarket"), source.indexOf("const selectPage"))).not.toContain("setFilterOpen");
    expect(source).toContain("previous <= average");
    expect(source).toContain("stock.consecutiveDays < 1");
  });
  it("内置独立算法说明，报价真实日期与版本边界保留，正文不放品牌、外链或接口信息", () => {
    for (const text of ["三条真实成交量额均价的展示合成", "此前最近已发布记录", "实际成本日期", "不影响筛选", "不前向填充", "结果日期：", "实际数据更新：", "当前可判断"]) expect(source).toContain(text);
    const algorithm = source.slice(source.indexOf('{notice === "chip-cost" &&'), source.indexOf('{(notice === "average" || notice === "chip-cost")'));
    expect(algorithm).toContain("<ChipCostModelExplanation");
    for (const text of ["Tushare", "weight_avg", "cyq_chips", "href=", "输入参数", "积分", "限量"]) expect(algorithm).not.toContain(text);
    const opening = source.slice(source.indexOf("<DialogDescription"), source.indexOf("</DialogDescription>"));
    expect(opening).toContain("模型估计的存量筹码成本中枢");
    expect(opening).not.toContain("不是个人账户");
    expect(opening).not.toContain("Tushare");
    expect(opening).not.toContain("不等同于");
    for (const text of ["待核实", "暂不可比", "筹码：样本校验", "自动检查仅允许已通过的股票与日期叠线", "图例始终保留", "同基准比较", "P/K", "VWAP_N", "q_s(t)", "50/30/20"]) expect(source).not.toContain(text);
    expect(source).toContain("retainedCost.current?.scope === scope");
    expect(source).toContain("retainedDistribution.current?.scope === scope");
    expect(source).toContain("matchingChipDistribution(retainedDistribution.current.result, chartInput)");
    expect(source).not.toContain("prefetch");
  });
});
