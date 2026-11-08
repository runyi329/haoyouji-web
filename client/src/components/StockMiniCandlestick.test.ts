import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StockMAMonitorCandle } from "@shared/stock-ma-monitor";
import StockMiniCandlestick, { buildStockMiniChart, StockMiniChartLegend, stockMiniAverageColor } from "./StockMiniCandlestick";

// 固定单元测试输入，仅验证几何，不提供或替代页面真实行情。
function candle(day: number, overrides: Partial<StockMAMonitorCandle> = {}): StockMAMonitorCandle {
  return { date: `2026-01-${String(day).padStart(2, "0")}`, open: 10, high: 12, low: 9, close: 11,
    averages: { 5: 9999, 10: 8888, 20: 7777 }, compositeAverage: 10.5, chipAverageCost: 10, ...overrides };
}
function markup(candles: StockMAMonitorCandle[]) {
  return renderToStaticMarkup(createElement(StockMiniCandlestick, { name: "几何测试", candles, periods: [5, 10, 20] }));
}

describe("真实OHLC与后端双线的SVG几何", () => {
  it("只绘制综合均价及筹码平均成本，不使用原周期均价做刻度或计算", () => {
    const model = buildStockMiniChart([candle(1), candle(2)], [5, 10, 20]);
    expect(model.referenceSegments.map(segment => segment.key)).toEqual(["compositeAverage", "chipAverageCost"]);
    expect(model.max).toBeLessThan(20);
    expect(markup([candle(1), candle(2)])).not.toContain("average-period");
    expect(markup([candle(1), candle(2)])).toContain('data-stock-mini-reference="compositeAverage"');
    expect(markup([candle(1), candle(2)])).toContain('data-stock-mini-reference="chipAverageCost"');
    expect(stockMiniAverageColor(5)).toBe("#169BA5");
  });

  it("所有可用参考值进入纵轴范围，包括K线之外的极值", () => {
    const model = buildStockMiniChart([candle(1, { compositeAverage: 2, chipAverageCost: 30 })]);
    expect(model.min).toBeLessThan(2);
    expect(model.max).toBeGreaterThan(30);
    for (const segment of model.referenceSegments) {
      for (const point of segment.points) expect(point.y).toBeGreaterThanOrEqual(6);
      for (const point of segment.points) expect(point.y).toBeLessThanOrEqual(82);
    }
    const svg = markup([candle(1, { compositeAverage: 2, chipAverageCost: 30 })]);
    expect(svg.match(/data-stock-mini-axis="price"/g)).toHaveLength(3);
    expect(svg).toContain(model.max.toFixed(2));
    expect(svg).toContain(model.min.toFixed(2));
  });

  it("null保留日期位置并断开两条线，不跨缺失点连线", () => {
    const model = buildStockMiniChart([
      candle(1), candle(2), candle(3, { compositeAverage: null, chipAverageCost: null }), candle(4), candle(5),
    ]);
    expect(model.candleGeometry).toHaveLength(5);
    for (const key of ["compositeAverage", "chipAverageCost"] as const) {
      const segments = model.referenceSegments.filter(segment => segment.key === key);
      expect(segments.map(segment => segment.points.length)).toEqual([2, 2]);
      expect(segments[0].points.at(-1)!.x).toBeLessThan(model.candleGeometry[2].x);
      expect(segments[1].points[0].x).toBeGreaterThan(model.candleGeometry[2].x);
    }
  });

  it("undefined与非有限值同样断线，不前向填充", () => {
    const model = buildStockMiniChart([
      candle(1), candle(2, { compositeAverage: undefined, chipAverageCost: Number.NaN }),
      candle(3), candle(4, { compositeAverage: 0, chipAverageCost: Number.POSITIVE_INFINITY }), candle(5),
    ]);
    expect(model.referenceSegments.filter(segment => segment.key === "compositeAverage").map(segment => segment.points.length)).toEqual([1, 1, 1]);
    expect(model.referenceSegments.filter(segment => segment.key === "chipAverageCost").map(segment => segment.points.length)).toEqual([1, 1, 1]);
    expect(Number.isFinite(model.min) && Number.isFinite(model.max)).toBe(true);
  });

  it("单个可用点画圆点，缺失筹码不会影响G与真实K线", () => {
    const svg = markup([candle(1, { chipAverageCost: null })]);
    expect(svg).toContain('<circle');
    expect(svg).toContain('data-stock-mini-reference="compositeAverage"');
    expect(svg).not.toContain('data-stock-mini-reference="chipAverageCost"');
    expect(svg.match(/data-stock-mini-candle=/g)).toHaveLength(1);
  });

  it("无效OHLC不伪造K柱，也不移除其null断点", () => {
    const model = buildStockMiniChart([candle(1), candle(2, { open: Number.NaN, compositeAverage: null, chipAverageCost: null }), candle(3)]);
    expect(model.candles).toHaveLength(3);
    expect(model.candleGeometry).toHaveLength(2);
    expect(model.referenceSegments).toHaveLength(4);
    const empty = markup([candle(1, { open: 0, compositeAverage: null, chipAverageCost: null })]);
    expect(empty).toContain("日K暂不可用");
    expect(empty).not.toContain("<rect");
    expect(markup([])).not.toContain("<rect");
  });

  it("按真实日期排序去重，并限制最近40个点", () => {
    const model = buildStockMiniChart([candle(3), candle(1), candle(2), candle(2, { close: 10 })]);
    expect(model.candles.map(item => item.date)).toEqual([candle(1).date, candle(2).date, candle(3).date]);
    const series = Array.from({ length: 45 }, (_, i) => candle(1, { date: `2026-${String(i + 1).padStart(3, "0")}` }));
    expect(buildStockMiniChart(series).candles).toHaveLength(40);
  });

  it("图例始终双项，筹码缺失用淡色虚线与破折号；保留手机流式宽度", () => {
    const legend = renderToStaticMarkup(createElement(StockMiniChartLegend, { chipAvailable: false }));
    expect(legend).toContain("综合均价");
    expect(legend).toContain("筹码平均成本 —");
    expect(legend).toContain('data-reference-available="false"');
    expect(legend).toContain("dashed");
    expect(legend).toContain("opacity:0.45");
    const readyLegend = renderToStaticMarkup(createElement(StockMiniChartLegend, { chipAvailable: true }));
    expect(readyLegend).not.toContain(" —");
    const svg = markup([candle(1)]);
    expect(svg).toContain('width="100%"');
    expect(svg).toContain("min-width:0");
    expect(svg).toContain('height="76"');
  });
  it("监控传入无历史筹码时aria与数据描述仅声明实际绘制的日K和综合均价", () => {
    const svg = markup([candle(1, { chipAverageCost: null })]);
    expect(svg).toContain('aria-label="几何测试的最近日K线与综合均价"');
    expect(svg).toContain('data-stock-mini-references="compositeAverage"');
    expect(svg).not.toContain("筹码平均成本");
  });
});
