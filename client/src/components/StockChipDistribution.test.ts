import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StockChipDistributionResult, StockMAMonitorChartInput } from "@shared/stock-ma-monitor";
import StockChipDistribution, { buildStockChipDistribution, chipDate, matchingChipDistribution, validChipDistribution,
  chipDistributionOverlayPlacement, chipDistributionOverlaySpace, chipDistributionPriceAtPointer, findStockChipReferenceBin } from "./StockChipDistribution";

// 确定性单元输入只检验映射，绝不注入实际页面或传输真实接口。
const input: StockMAMonitorChartInput = { tsCode: "000001.SZ", periods: [5, 10, 20], asOf: "2026-01-07", sourceVersion: "unit-v1" };
function distribution(overrides: Partial<StockChipDistributionResult> = {}): StockChipDistributionResult {
  return { tsCode: input.tsCode, sourceVersion: input.sourceVersion, asOf: "2026-01-06", source: "Tushare cyq_chips",
    estimated: true, status: "ready", points: [{ price: 8, percent: 10 }, { price: 10, percent: 30 }, { price: 12, percent: 60 }],
    weightAvg: 10.5, latestChipCost: { value: 11, asOf: input.asOf, source: "Tushare cyq_perf.weight_avg", estimated: true,
      status: "current", fetchedAt: "2026-01-07T08:00:00Z" }, fetchedAt: "2026-01-07T08:00:00Z", note: "", ...overrides };
}
function markup(result?: StockChipDistributionResult, loading = false) {
  return renderToStaticMarkup(createElement(StockChipDistribution, { name: "几何单元输入", result, loading }));
}

function stateMarkup(emptyState: "idle" | "missing" | "error", result?: StockChipDistributionResult, loading = false,
  onRetry?: () => void, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(StockChipDistribution, { name: "状态测试", result, loading, emptyState, onRetry, ...extra }));
}

describe("供应商成本分布真实几何", () => {
  it("宽度精确与percent成正比，高价在上；线性价位不是旋转K图", () => {
    const model = buildStockChipDistribution(distribution());
    expect(model.bars.map(bar => bar.price)).toEqual([8, 10, 12]);
    const [low, middle, high] = model.bars;
    expect(low.x).toBe(middle.x);
    expect(middle.width / low.width).toBeCloseTo(3, 12);
    expect(high.width / low.width).toBeCloseTo(6, 12);
    expect(low.y).toBeGreaterThan(middle.y);
    expect(middle.y).toBeGreaterThan(high.y);
    expect(low.y - middle.y).toBeCloseTo(middle.y - high.y, 12);
    expect(model.weightAvgY).toBeLessThan(middle.y);
    expect(model.weightAvgY).toBeGreaterThan(high.y);
    const html = markup(distribution());
    expect(html.match(/data-stock-chip-price=/g)).toHaveLength(3);
    expect(html).toContain("元/股");
    expect(html).toContain("60.00%");
    expect(html).toContain('height="76"');
    expect(html).not.toContain("rotate");
    expect(html).not.toContain("data-stock-mini-candle");
  });

  it("103个密集价位全部保留，质量不丢样本、不凭空归一化或合成峰", () => {
    const points = Array.from({ length: 103 }, (_, index) => ({ price: (1000 + index) / 100, percent: index === 51 ? 49 : 0.5 }));
    const model = buildStockChipDistribution(distribution({ points, weightAvg: null }));
    expect(model.bars).toHaveLength(103);
    expect(model.bars.map(({ price, percent }) => ({ price, percent }))).toEqual(points);
    expect(model.bars.reduce((sum, bar) => sum + bar.percent, 0)).toBe(100);
    expect(model.bars.every(bar => bar.height > 0 && bar.height < 0.7)).toBe(true);
    expect(markup(distribution({ points, weightAvg: null })).match(/data-stock-chip-price=/g)).toHaveLength(103);
  });

  it("无效分布整组拒绝，不偷偷去重或过滤坏占比后冒充真实分布", () => {
    for (const points of [[], [{ price: 8, percent: -1 }], [{ price: 8, percent: 101 }], [{ price: 8, percent: Number.NaN }],
      [{ price: Number.POSITIVE_INFINITY, percent: 1 }], [{ price: 0, percent: 1 }], [{ price: 8, percent: 0 }],
      [{ price: 8, percent: 30 }, { price: 8, percent: 70 }]]) {
      const result = distribution({ points });
      expect(validChipDistribution(result)).toBe(false);
      expect(buildStockChipDistribution(result).bars).toEqual([]);
      expect(markup(result)).toContain("筹码分布暂无数据");
      expect(markup(result)).not.toContain("<rect");
    }
    for (const result of [distribution({ asOf: null }), distribution({ asOf: "2026-02-30" }), distribution({ fetchedAt: "invalid" }),
      distribution({ status: "missing" }), distribution({ status: "unavailable" }), distribution({ weightAvg: Number.NaN })]) {
      expect(validChipDistribution(result)).toBe(false);
    }
  });

  it("最新报价不决定分布均值marker，marker仅映射对应分布日的weightAvg", () => {
    const original = distribution();
    const changedQuote = distribution({ latestChipCost: { ...original.latestChipCost, value: 999 } });
    expect(buildStockChipDistribution(original)).toEqual(buildStockChipDistribution(changedQuote));
    expect(markup(original)).toContain('data-stock-chip-marker="supplier-weight-avg"');
    expect(markup(original)).toContain("2026-01-06对应供应商平均成本10.50元/股");
    expect(markup(distribution({ weightAvg: null }))).not.toContain("data-stock-chip-marker");
    expect(markup(original)).not.toContain("获利");
    expect(markup(original)).not.toContain("#d84a4a");
    expect(markup(original)).not.toContain("#2e9b69");
  });

  it("空或请求中不制造横条/波峰；无分布请求中明确提示且不显示待核实", () => {
    expect(markup()).toContain("筹码分布暂无数据");
    expect(markup()).not.toContain("<rect");
    expect(markup(undefined, true)).toContain('aria-busy="true"');
    expect(markup(undefined, true)).toContain('data-stock-chip-loading="true"');
    expect(markup(undefined, true)).toContain("正在读取筹码分布");
    expect(markup(undefined, true)).not.toContain("筹码分布暂无数据");
    expect(markup(undefined, true)).not.toContain("待核实");
    expect(markup(undefined, true)).not.toContain("<rect");
    const single = buildStockChipDistribution(distribution({ points: [{ price: 8, percent: 100 }], weightAvg: null }));
    expect(single.bars).toHaveLength(1);
    expect(Number.isFinite(single.bars[0].y)).toBe(true);
    expect(markup(distribution())).toContain("价位8.00元/股，占比10.00%");
  });

  it("区分 idle/missing/error，加载中提示且不覆盖已有数据", () => {
    expect(stateMarkup("idle")).toContain('data-state="idle"');
    expect(stateMarkup("idle")).not.toContain("筹码分布暂无数据");
    expect(stateMarkup("missing")).toContain("筹码分布暂无记录");
    expect(stateMarkup("missing")).not.toContain("筹码分布加载失败");
    expect(stateMarkup("error")).toContain("筹码分布加载失败");
    expect(stateMarkup("error")).not.toContain('data-stock-chip-retry="true"');
    expect(stateMarkup("error", undefined, false, () => {})).toContain('data-stock-chip-retry="true"');
    expect(stateMarkup("error", undefined, false, () => {})).toContain(">重试</button>");
    expect(stateMarkup("error", undefined, true, () => {})).toContain('data-state="loading"');
    expect(stateMarkup("error", undefined, true, () => {})).toContain("正在读取筹码分布");
    expect(stateMarkup("error", undefined, true, () => {})).not.toContain("筹码分布加载失败");
    const withData = stateMarkup("error", distribution(), true, () => {});
    expect(withData).toContain('data-stock-chip-price=');
    expect(withData).not.toContain('data-stock-chip-loading="true"');
    expect(withData).not.toContain("筹码分布加载失败");
    expect(withData).not.toContain('data-stock-chip-retry="true"');
    const failedWithData = stateMarkup("error", distribution(), false, () => {});
    expect(failedWithData).toContain("更新失败 · 重试");
  });

  it("空态以绘图区中点定位，集中窗口固定190且不清空原始数据", () => {
    const html = stateMarkup("missing", undefined, false, undefined, { focusBinCount: 10, plotTop: 80, plotBottom: 160 });
    expect(html).toContain('viewBox="0 0 240 190"');
    expect(html).toContain('y="120"');
    const result = distribution();
    const before = JSON.stringify(result);
    const focused = stateMarkup("error", result, false, () => {}, { focusBinCount: 10, plotTop: 80, plotBottom: 160 });
    expect(focused).toContain('viewBox="0 0 240 190"');
    expect(focused.match(/data-stock-chip-price=/g)).toHaveLength(3);
    expect(JSON.stringify(result)).toBe(before);
  });
});

describe("对数长度与高图真实映射", () => {
  it("log1p增强小占比，零严格为零，全部真实价位和占比原样保留", () => {
    const points = [{ price: 8, percent: 0 }, { price: 8.1, percent: 0.01 }, { price: 10, percent: 0.5 }, { price: 12, percent: 80 }];
    const result = distribution({ points, weightAvg: null });
    const before = JSON.stringify(result);
    const model = buildStockChipDistribution(result, { height: 260, amplitudeScale: "log" });
    const linear = buildStockChipDistribution(result, { height: 260 });
    expect(model.bars.map(({ price, percent }) => ({ price, percent }))).toEqual(points);
    expect(model.bars[0].width).toBe(0);
    expect(model.bars.at(-1)?.width).toBe(189);
    for (const bar of model.bars) expect(bar.width).toBeCloseTo(Math.log1p(bar.percent / 0.01) / Math.log1p(80 / 0.01) * 189, 12);
    expect(model.bars[1].width).toBeGreaterThan(linear.bars[1].width);
    expect(model.bars.map(bar => bar.y)).toEqual(linear.bars.map(bar => bar.y));
    expect(JSON.stringify(result)).toBe(before);
  });

  it("260px viewBox与价位端点、中间tick同步，百分比tick为对数反函数的真实读数", () => {
    const result = distribution();
    const model = buildStockChipDistribution(result, { height: 260, amplitudeScale: "log" });
    expect(buildStockChipDistribution(result).height).toBe(100);
    expect(buildStockChipDistribution(result).plotBottom).toBe(80);
    expect(model.height).toBe(260);
    expect(model.plotBottom).toBe(240);
    for (const bar of model.bars) expect(bar.y).toBeCloseTo(14 + (model.maxPrice - bar.price) / (model.maxPrice - model.minPrice) * 226, 12);
    expect(model.percentTicks.map(tick => tick.fraction)).toEqual([0, 0.5, 1]);
    for (const tick of model.percentTicks) {
      expect(tick.percent).toBeCloseTo(Math.expm1(tick.fraction * Math.log1p(60 / 0.01)) * 0.01, 12);
      expect(Math.log1p(tick.percent / 0.01) / Math.log1p(60 / 0.01)).toBeCloseTo(tick.fraction, 12);
    }
    const html = renderToStaticMarkup(createElement(StockChipDistribution, { result, name: "高度测试", height: 260, amplitudeScale: "log" }));
    expect(html).toContain('viewBox="0 0 240 260"');
    expect(html).toContain('height="260"');
    expect(html).toContain('data-stock-chip-scale="log"');
    expect(html).toContain("占比·对数");
    expect(html).toContain("横条长度为对数映射，读数是真实占比");
    expect(html).not.toContain("成正比");
    expect(html).toContain(`>${model.percentTicks[1].percent.toFixed(2)}%</text>`);
    expect(html).toContain(`>${model.maxPrice.toFixed(2)}</text>`);
    expect(html).toContain(`>${((model.maxPrice + model.minPrice) / 2).toFixed(2)}</text>`);
    expect(html).toContain(`>${model.minPrice.toFixed(2)}</text>`);
    expect(html).toContain('y="256"');
  });

  it("260高度触摸准确选中顶部、中心、底部原价位，支持显示尺寸缩放", () => {
    const model = buildStockChipDistribution(distribution(), { height: 260, amplitudeScale: "log" });
    for (const boundsHeight of [260, 130, 520]) {
      for (const bar of model.bars) expect(chipDistributionPriceAtPointer(model, 32 + bar.y / 260 * boundsHeight, 32, boundsHeight)).toBe(bar.price);
      expect(chipDistributionPriceAtPointer(model, 32, 32, boundsHeight)).toBe(12);
      expect(chipDistributionPriceAtPointer(model, 32 + boundsHeight, 32, boundsHeight)).toBe(8);
    }
    expect(chipDistributionPriceAtPointer(model, 20, 0, 0)).toBeNull();
    expect(chipDistributionPriceAtPointer(buildStockChipDistribution(undefined), 20, 0, 260)).toBeNull();
  });

  it("按真实percent的95%核心范围选择较大上下空带，不受最新报价影响、不改输入", () => {
    const bottomHeavy = distribution({ points: [{ price: 8, percent: 98 }, { price: 10, percent: 1 }, { price: 12, percent: 1 }], weightAvg: null });
    const topHeavy = distribution({ points: [{ price: 8, percent: 1 }, { price: 10, percent: 1 }, { price: 12, percent: 98 }], weightAvg: null });
    const before = JSON.stringify([bottomHeavy, topHeavy]);
    expect(chipDistributionOverlayPlacement(bottomHeavy)).toBe("top");
    expect(chipDistributionOverlayPlacement(topHeavy)).toBe("bottom");
    expect(chipDistributionOverlaySpace(bottomHeavy)).toBeGreaterThan(90);
    expect(chipDistributionOverlaySpace(topHeavy)).toBeCloseTo(chipDistributionOverlaySpace(bottomHeavy), 12);
    expect(chipDistributionOverlaySpace(bottomHeavy, 100) / chipDistributionOverlaySpace(bottomHeavy, 260)).toBeCloseTo(66 / 226, 12);
    expect(chipDistributionOverlayPlacement({ ...topHeavy, latestChipCost: { ...topHeavy.latestChipCost, value: 999 } })).toBe("bottom");
    expect(chipDistributionOverlayPlacement(undefined)).toBe("top");
    expect(chipDistributionOverlayPlacement(distribution({ points: [] }))).toBe("top");
    expect(chipDistributionOverlaySpace(undefined)).toBe(0);
    expect(buildStockChipDistribution(bottomHeavy, { amplitudeScale: "log" }).bars).toHaveLength(3);
    expect(JSON.stringify([bottomHeavy, topHeavy])).toBe(before);
  });
});

describe("真实价格分桶与温和对数", () => {
  it("只聚合有原始点的半开桶，边界10.0进入10.0–10.5；总份额守恒且不改输入", () => {
    const points = [{ price: 10.5, percent: 0.01 }, { price: 9.99, percent: 0.1 }, { price: 10, percent: 20 },
      { price: 10.2, percent: 0.1 }, { price: 10.4, percent: 0.01 }, { price: 12, percent: 3 }];
    const result = distribution({ points, weightAvg: 10.3 });
    const before = JSON.stringify(result);
    const model = buildStockChipDistribution(result, { height: 260, priceBinSize: 0.5, amplitudeScale: "soft-log" });
    expect(model.binSize).toBe(0.5);
    expect(model.bars.map(bar => bar.priceLow)).toEqual([9.5, 10, 10.5, 12]);
    expect(model.bars[1]).toMatchObject({ price: 10.25, priceLow: 10, priceHigh: 10.5, sourceCount: 3 });
    expect(model.bars[1].percent).toBeCloseTo(20.11, 12);
    expect(model.bars.reduce((sum, bar) => sum + bar.percent, 0)).toBeCloseTo(points.reduce((sum, point) => sum + point.percent, 0), 12);
    expect(model.bars.reduce((sum, bar) => sum + bar.sourceCount!, 0)).toBe(points.length);
    expect(model.minPrice).toBeLessThan(9.5);
    expect(model.maxPrice).toBeGreaterThan(12.5);
    expect(model.weightAvgY).toBeCloseTo(14 + (model.maxPrice - 10.3) / (model.maxPrice - model.minPrice) * 226, 12);
    expect(JSON.stringify(result)).toBe(before);
    expect(buildStockChipDistribution(result).bars.map(bar => bar.price)).toEqual([...points].sort((a, b) => a.price - b.price).map(point => point.price));
    expect(buildStockChipDistribution(result).binSize).toBeUndefined();
  });

  it("最小半元档，宽范围自动漂亮步长并显示有效档宽；约40档条厚清晰", () => {
    for (const [range, expected] of [[40, 1], [80, 2], [200, 5], [400, 10], [800, 20], [2000, 50], [4000, 100]]) {
      const result = distribution({ points: [{ price: 10, percent: 2 }, { price: 10 + range, percent: 98 }], weightAvg: null });
      const model = buildStockChipDistribution(result, { height: 260, priceBinSize: 0.5, amplitudeScale: "soft-log" });
      expect(model.binSize).toBe(expected);
      expect(range / model.binSize!).toBeLessThanOrEqual(60);
      const html = renderToStaticMarkup(createElement(StockChipDistribution, { result, name: "档宽", height: 260, priceBinSize: 0.5, amplitudeScale: "soft-log" }));
      expect(html).toContain(`${expected.toFixed(2)}元/档 · 温和对数`);
      expect(html).toContain(`data-stock-chip-bin-size="${expected}"`);
    }
    const points = Array.from({ length: 103 }, (_, index) => ({ price: (1000 + index * 20) / 100, percent: index % 2 ? 0.01 : 0.1 }));
    const result = distribution({ points, weightAvg: null });
    const model = buildStockChipDistribution(result, { height: 260, priceBinSize: 0.1 });
    expect(model.binSize).toBe(0.5);
    expect(model.bars).toHaveLength(41);
    expect(model.bars.every(bar => bar.height > 3 && bar.height <= 7)).toBe(true);
    for (const bar of model.bars) expect(bar.height).toBeCloseTo(Math.min(7, 0.5 / (model.maxPrice - model.minPrice) * 226 * 0.7), 12);
    expect(model.bars.reduce((sum, bar) => sum + bar.percent, 0)).toBeCloseTo(points.reduce((sum, point) => sum + point.percent, 0), 12);
  });

  it("温和log以5个百分点为固定单位，尾部明显小于强log，零和最高条长不变且同值同长", () => {
    const result = distribution({ points: [{ price: 8, percent: 0 }, { price: 9, percent: 0.01 }, { price: 10, percent: 0.1 },
      { price: 11, percent: 0.1 }, { price: 12, percent: 80 }], weightAvg: null });
    const soft = buildStockChipDistribution(result, { amplitudeScale: "soft-log" });
    const strong = buildStockChipDistribution(result, { amplitudeScale: "log" });
    expect(soft.bars[0].width).toBe(0);
    expect(soft.bars.at(-1)?.width).toBe(189);
    expect(soft.bars[2].width).toBe(soft.bars[3].width);
    for (const bar of soft.bars) expect(bar.width).toBeCloseTo(Math.log1p(bar.percent / 5) / Math.log1p(80 / 5) * 189, 12);
    for (const index of [1, 2, 3]) expect(soft.bars[index].width).toBeLessThan(strong.bars[index].width / 10);
    for (const tick of soft.percentTicks) {
      expect(tick.percent).toBeCloseTo(Math.expm1(tick.fraction * Math.log1p(80 / 5)) * 5, 12);
      expect(Math.log1p(tick.percent / 5) / Math.log1p(80 / 5)).toBeCloseTo(tick.fraction, 12);
    }
  });

  it("浅尾部阈值仅视觉弱化、份额不减值；区间ARIA和查验属性均为合计", () => {
    const result = distribution({ points: [{ price: 10, percent: 0.01 }, { price: 10.2, percent: 0.1 }, { price: 11, percent: 1 },
      { price: 12, percent: 20 }], weightAvg: null });
    const model = buildStockChipDistribution(result, { height: 260, priceBinSize: 0.5, amplitudeScale: "soft-log" });
    expect(model.bars[0].lowDensity).toBe(true);
    expect(model.bars[0].percent).toBeCloseTo(0.11, 12);
    expect(model.bars[1].lowDensity).toBe(false); // 恰好5%不属于低密度。
    const html = renderToStaticMarkup(createElement(StockChipDistribution, { result, name: "区间", height: 260, priceBinSize: 0.5, amplitudeScale: "soft-log" }));
    expect(html).toContain('data-stock-chip-bin-low="10"');
    expect(html).toContain('data-stock-chip-bin-high="10.5"');
    expect(html).toContain('data-stock-chip-bin-count="2"');
    expect(html).toContain('data-stock-chip-bin-percent="0.11"');
    expect(html).toContain('fill="#A5D9DE" fill-opacity="0.65"');
    expect(html).toContain('aria-label="10.00–10.50元/股（不含上界）·合计 0.11%"');
    expect(html).toContain('<title>10.00–10.50元/股（不含上界）·合计 0.11%</title>');
    expect(html).toContain("视觉弱化，不修改份额");
    expect(html).toContain(`>${model.percentTicks[1].percent.toFixed(2)}%</text>`);
  });

  it("缩放触摸按半开区间选合计桶，边界归下一档并保留上下端点选择", () => {
    const model = buildStockChipDistribution(distribution({ points: [{ price: 10, percent: 10 }, { price: 10.2, percent: 20 },
      { price: 10.5, percent: 30 }, { price: 11, percent: 40 }], weightAvg: null }), { height: 260, priceBinSize: 0.5 });
    for (const boundsHeight of [130, 260, 520]) {
      const atPrice = (price: number) => {
        const y = model.plotTop + (model.maxPrice - price) / (model.maxPrice - model.minPrice) * (model.plotBottom - model.plotTop);
        return chipDistributionPriceAtPointer(model, 32 + y / 260 * boundsHeight, 32, boundsHeight);
      };
      expect(atPrice(10)).toBe(10.25);
      expect(atPrice(10.4999)).toBe(10.25);
      expect(atPrice(10.5)).toBe(10.75);
      expect(atPrice(10.9999)).toBe(10.75);
      expect(atPrice(11)).toBe(11.25);
      expect(chipDistributionPriceAtPointer(model, 32, 32, boundsHeight)).toBe(11.25);
      expect(chipDistributionPriceAtPointer(model, 32 + boundsHeight, 32, boundsHeight)).toBe(10.25);
    }
  });
});

describe("已对齐现价的中性单档定位", () => {
  const result = distribution({ points: [{ price: 10, percent: 80 }, { price: 11.5, percent: 0.01 },
    { price: 11.81, percent: 0.1 }, { price: 12, percent: 19.89 }], weightAvg: 10.5 });
  const options = { height: 260, priceBinSize: 0.5, amplitudeScale: "soft-log" as const };
  const render = (referencePrice?: number | null, data = result) => renderToStaticMarkup(createElement(StockChipDistribution,
    { ...options, result: data, name: "对齐定位", referencePrice }));
  const rects = (html: string) => html.match(/<rect\b[^>]*>/g) ?? [];

  it("11.81只匹配11.50–12.00，11.5与12半开边界各归正确桶", () => {
    const model = buildStockChipDistribution(result, options);
    const target = model.bars.find(bar => bar.priceLow === 11.5)!;
    expect(findStockChipReferenceBin(model, 11.81)).toBe(target);
    expect(findStockChipReferenceBin(model, 11.5)).toBe(target);
    expect(findStockChipReferenceBin(model, 11.9999)).toBe(target);
    expect(findStockChipReferenceBin(model, 12)).toBe(model.bars.find(bar => bar.priceLow === 12));
    expect(findStockChipReferenceBin(model, 12 - Number.EPSILON * 12)?.priceLow).toBe(12);
    for (const price of [11.5, 11.81, 12]) {
      const highlighted = rects(render(price)).filter(rect => rect.includes('data-stock-chip-current-bin="true"'));
      expect(highlighted).toHaveLength(1);
      expect(highlighted[0]).toContain(`data-stock-chip-bin-low="${price === 12 ? 12 : 11.5}"`);
    }
  });

  it("undefined/null/NaN/zero/负数/无穷/范围外/缺桶均不吸附，无分桶和缺分布不高亮", () => {
    const model = buildStockChipDistribution(result, options);
    for (const price of [undefined, null, Number.NaN, 0, -1, Infinity, -Infinity, 9, 12.5, 999, 11]) {
      expect(findStockChipReferenceBin(model, price)).toBeNull();
      expect(render(price)).not.toContain("data-stock-chip-current-bin");
      expect(render(price)).not.toContain("data-stock-chip-current-price");
      expect(render(price)).not.toContain("#D49A32");
      expect(render(price)).not.toContain("现价所在档");
    }
    expect(findStockChipReferenceBin(buildStockChipDistribution(result), 11.81)).toBeNull();
    expect(findStockChipReferenceBin(buildStockChipDistribution(undefined, options), 11.81)).toBeNull();
    expect(render(11.81, distribution({ status: "missing", points: [] }))).not.toContain("data-stock-chip-current-bin");
    const unbinned = renderToStaticMarkup(createElement(StockChipDistribution, { result, name: "原价位", referencePrice: 11.81 }));
    expect(unbinned).not.toContain("data-stock-chip-current-bin");
  });

  it("定位只用amber neutral填充和细描边，尾部opacity变1但SUM、条宽/高/占比和260px均不变", () => {
    const before = JSON.stringify(result);
    const model = buildStockChipDistribution(result, options);
    const normal = rects(render());
    const highlighted = rects(render(11.81));
    expect(highlighted).toHaveLength(normal.length);
    expect(model.bars.reduce((sum, bar) => sum + bar.percent, 0)).toBeCloseTo(100, 12);
    expect(model.bars.find(bar => bar.priceLow === 11.5)).toMatchObject({ sourceCount: 2, lowDensity: true });
    expect(model.bars.find(bar => bar.priceLow === 11.5)?.percent).toBeCloseTo(0.11, 12);
    for (let index = 0; index < normal.length; index++) {
      for (const attr of ["x", "y", "width", "height", "data-stock-chip-percent", "data-stock-chip-bin-percent", "data-stock-chip-bin-count"]) {
        expect(highlighted[index].match(new RegExp(` ${attr}="[^"]*"`))?.[0]).toBe(normal[index].match(new RegExp(` ${attr}="[^"]*"`))?.[0]);
      }
      if (!highlighted[index].includes('data-stock-chip-current-bin="true"')) expect(highlighted[index]).toBe(normal[index]);
    }
    const current = highlighted.find(rect => rect.includes('data-stock-chip-current-bin="true"'))!;
    expect(current).toContain('data-stock-chip-current-price="11.81"');
    expect(current).toContain('fill="#D49A32" fill-opacity="1" stroke="#AA6B13" stroke-width="0.8"');
    expect(current).toContain('aria-label="11.50–12.00元/股（不含上界）·合计 0.11%；现价所在档（已对齐分布价位口径）"');
    expect(render(11.81)).toContain('<title>11.50–12.00元/股（不含上界）·合计 0.11%；现价所在档（已对齐分布价位口径）</title>');
    expect(render(11.81)).toContain('viewBox="0 0 240 260"');
    expect(JSON.stringify(result)).toBe(before);
    const zero = distribution({ points: [{ price: 11.5, percent: 0 }, { price: 12, percent: 100 }], weightAvg: null });
    expect(rects(render(11.81, zero)).find(rect => rect.includes('data-stock-chip-current-bin="true"'))).toContain('width="0"');
  });

  it("现价不改变平均成本虚线原值、原色及identity，不表达盈亏或买卖", () => {
    const marker = (html: string) => html.match(/<line data-stock-chip-marker="supplier-weight-avg"[^>]*>[\s\S]*?<\/line>/)?.[0];
    expect(marker(render(11.81))).toBe(marker(render()));
    expect(marker(render(12))).toBe(marker(render()));
    expect(marker(render(11.81))).toContain('stroke="#169BA5"');
    expect(marker(render(11.81))).toContain('stroke-dasharray="3 2"');
    expect(marker(render(11.81))).toContain("2026-01-06对应供应商平均成本10.50元/股");
    for (const text of ["获利", "买入", "卖出", "#d84a4a", "#2e9b69", "P/K"]) expect(render(11.81)).not.toContain(text);
  });
});

describe("实际日期与供应商结果身份", () => {
  it("拒绝错股、版本和未来实际日期；missing无分布日期允许报价独立展示", () => {
    expect(matchingChipDistribution(distribution(), input)).toBe(true);
    expect(matchingChipDistribution(distribution({ asOf: "20260107" }), input)).toBe(true);
    for (const result of [distribution({ tsCode: "600000.SH" }), distribution({ sourceVersion: "unit-v0" }),
      distribution({ asOf: "2026-01-08" }), distribution({ asOf: "bad" })]) expect(matchingChipDistribution(result, input)).toBe(false);
    expect(matchingChipDistribution(distribution({ status: "missing", asOf: null, points: [] }), input)).toBe(true);
    expect(matchingChipDistribution(distribution(), { ...input, asOf: "" })).toBe(false);
    expect(chipDate("20260106")).toBe("2026-01-06");
    expect(chipDate("2026-02-30")).toBeNull();
    expect(chipDate("2026-01-06T09:00:00Z")).toBeNull();
  });
});

describe("固定190px集中价格窗口", () => {
  const options = { focusBinCount: 10, priceBinSize: 0.5, amplitudeScale: "soft-log" as const, plotTop: 80, plotBottom: 160 };
  const data = () => distribution({ weightAvg: null, points: Array.from({ length: 30 }, (_, index) => ({
    price: 5 + index * 0.5, percent: index >= 10 && index < 20 ? 9 : 0.5,
  })) });
  it("选最大SUM的连续10档而非topN，保持线性价位、真实占比和两尾守恒", () => {
    const result = data();
    const before = JSON.stringify(result);
    const model = buildStockChipDistribution(result, options);
    expect(model.height).toBe(190);
    expect(model.plotTop).toBe(80);
    expect(model.plotBottom).toBe(160);
    expect(model.focused).toBe(true);
    expect(model.allBars).toHaveLength(30);
    expect(model.bars.map(bar => bar.priceLow)).toEqual(Array.from({ length: 10 }, (_, i) => 10 + i * 0.5));
    expect(model.displayLow).toBe(10);
    expect(model.displayHigh).toBe(15);
    expect(model.visiblePercent).toBe(90);
    expect(model.omittedLowPercent).toBe(5);
    expect(model.omittedHighPercent).toBe(5);
    expect(model.totalPercent).toBe(100);
    expect(model.visiblePercent + model.omittedLowPercent + model.omittedHighPercent).toBe(model.totalPercent);
    for (const bar of model.bars) {
      expect(bar.percent).toBe(9);
      expect(bar.y).toBeCloseTo(80 + (model.maxPrice - bar.price) / (model.maxPrice - model.minPrice) * 80, 12);
      expect(chipDistributionPriceAtPointer(model, bar.y, 0, 190)).toBe(bar.price);
    }
    expect(model.bars[0].y - model.bars[1].y).toBeCloseTo(model.bars[1].y - model.bars[2].y, 12);
    expect(chipDistributionPriceAtPointer(model, 40, 0, 190)).toBeNull();
    expect(JSON.stringify(result)).toBe(before);
  });
  it("空桶计入连续窗宽却不造点，平局确定取低价；非100原始合计不归一化", () => {
    const result = distribution({ weightAvg: null, points: [{ price: 10, percent: 40 }, { price: 11, percent: 1 },
      { price: 15, percent: 40 }, { price: 16, percent: 1 }] });
    const model = buildStockChipDistribution(result, { ...options, focusBinCount: 3 });
    expect(model.displayLow).toBe(10);
    expect(model.displayHigh).toBe(11.5);
    expect(model.bars.map(bar => bar.priceLow)).toEqual([10, 11]);
    expect(model.bars).toHaveLength(2);
    expect(model.visiblePercent).toBe(41);
    expect(model.totalPercent).toBe(82);
    expect(model.visiblePercent + model.omittedLowPercent + model.omittedHighPercent).toBe(82);
  });
  it("附近现价真实桶及供应商成本保留，远峰安全offscreen不绘制或吸附", () => {
    const nearby = buildStockChipDistribution({ ...data(), weightAvg: 15.75 }, { ...options, referencePrice: 9.8 });
    expect(findStockChipReferenceBin(nearby, 9.8)?.priceLow).toBe(9.5);
    expect(nearby.weightAvgY).not.toBeNull();
    expect(nearby.weightAvgY!).toBeGreaterThanOrEqual(80);
    expect(nearby.weightAvgY!).toBeLessThanOrEqual(160);
    const far = distribution({ weightAvg: 24.2, points: [...data().points, { price: 24, percent: 0.01 }] });
    const model = buildStockChipDistribution(far, { ...options, referencePrice: 24.2 });
    expect(model.bars).toHaveLength(10);
    expect(model.referenceOffscreen).toBe(true);
    expect(model.weightAvgOffscreen).toBe(true);
    expect(model.weightAvgY).toBeNull();
    expect(findStockChipReferenceBin(model, 24.2)).toBeNull();
    const html = renderToStaticMarkup(createElement(StockChipDistribution, { ...options, result: far, referencePrice: 24.2, name: "远峰" }));
    expect(html).toContain('data-stock-chip-reference-offscreen="true"');
    expect(html).toContain("现价档在集中区外，未绘制");
    expect(html).not.toContain('data-stock-chip-marker="supplier-weight-avg"');
  });
  it("全范围与集中区相同SVG/外框高度，底栏绝对固定14px且soft-log和amber唯一档不退回", () => {
    const result = data();
    const render = (fullRange: boolean) => renderToStaticMarkup(createElement(StockChipDistribution,
      { ...options, result, fullRange, referencePrice: 12.2, name: "固定高度" }));
    const focused = render(false);
    const full = render(true);
    for (const html of [focused, full]) {
      expect(html).toContain('viewBox="0 0 240 190"');
      expect(html).toContain('height="190"');
      expect(html).toContain('max-width:360px;container-type:inline-size;height:190px');
      expect(html).toContain('data-stock-chip-footer="true"');
      expect(html).toContain('class="absolute left-1 right-1 flex');
      expect(html).toContain('bottom:2px;height:14px;line-height:14px');
      expect(html).toContain('data-stock-chip-scale="soft-log"');
      expect(html).toContain('fill="#D49A32" fill-opacity="1" stroke="#AA6B13"');
      expect(html.match(/data-stock-chip-current-bin="true"/g)).toHaveLength(1);
      expect(html).not.toContain('data-stock-chip-axis="percent"');
    }
    expect(focused).toContain("集中90.00% · 全部");
    expect(focused).toContain('data-stock-chip-range-label="true">10–15元</span>');
    const footer = focused.match(/<div data-stock-chip-footer="true"[\s\S]*?<\/div>/)![0];
    expect(footer).toContain("flex-nowrap");
    expect(footer).toContain("whitespace-nowrap");
    expect(footer).not.toContain("overflow:hidden");
    expect(footer).toContain("font-size:clamp(6px,calc((100cqw - 12px)");
    expect(footer).toContain("10.00–15.00元/股；低尾5.00%，高尾5.00%");
    expect(full).toContain("全范围 · 收起");
    expect(focused.match(/<rect\b/g)).toHaveLength(10);
    expect(full.match(/<rect\b/g)).toHaveLength(30);
    const fullModel = buildStockChipDistribution(result, { ...options, fullRange: true });
    const original = buildStockChipDistribution(result, { priceBinSize: 0.5 });
    expect(fullModel.minPrice).toBe(original.minPrice);
    expect(fullModel.maxPrice).toBe(original.maxPrice);
    expect(fullModel.visiblePercent).toBe(100);
    expect(fullModel.focused).toBe(false);
    expect(fullModel.omittedLowPercent + fullModel.omittedHighPercent).toBe(0);
  });
  it("父传plotTop90时标题83、绘图区90–160；全范围也不在报价留白误选", () => {
    for (const fullRange of [false, true]) {
      const model = buildStockChipDistribution(data(), { ...options, plotTop: 90, fullRange });
      expect(model.bars.every(bar => bar.y - bar.height / 2 >= 90 && bar.y + bar.height / 2 <= 160)).toBe(true);
      expect(chipDistributionPriceAtPointer(model, 50, 0, 190)).toBeNull();
      const html = renderToStaticMarkup(createElement(StockChipDistribution,
        { ...options, plotTop: 90, fullRange, result: data(), name: "顶部报价留白" }));
      expect(html).toContain('x="1" y="83"');
      expect(html).toContain('y1="90" y2="90"');
      expect(html).toContain('y1="160" y2="160"');
    }
    const defaultFocus = buildStockChipDistribution(data(), { focusBinCount: 10 });
    expect(defaultFocus.height).toBe(190);
    expect(defaultFocus.plotTop).toBe(80);
    expect(defaultFocus.plotBottom).toBe(160);
    const legacy = buildStockChipDistribution(distribution());
    expect(legacy.visiblePercent).toBe(100);
    expect(legacy.omittedLowPercent + legacy.omittedHighPercent).toBe(0);
  });
});
