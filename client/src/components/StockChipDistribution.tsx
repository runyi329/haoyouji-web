import { useState, type PointerEvent } from "react";
import type { StockChipDistributionResult, StockMAMonitorChartInput } from "@shared/stock-ma-monitor";

const WIDTH = 240;
const HEIGHT = 100;
const LEFT = 46;
const RIGHT = 235;
const TOP = 14;
const COLOR = "#169BA5";
const LOG_UNIT = 0.01;
const SOFT_LOG_UNIT = 5; // 单位为百分比百分点，不是比例。
const LOW_DENSITY_COLOR = "#A5D9DE";
const REFERENCE_COLOR = "#D49A32";
const REFERENCE_STROKE = "#AA6B13";
const REFERENCE_LABEL = "现价所在档（已对齐分布价位口径）";

/** 仅接受供应商实际日期；不使用请求时间或当前日期补日期。 */
export function chipDate(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(value);
  if (!match) return null;
  const normalized = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === normalized ? normalized : null;
}

/** 无分布时仍可携带供应商成本报价，故允许asOf为null。 */
export function matchingChipDistribution(result: StockChipDistributionResult | undefined, input: StockMAMonitorChartInput): boolean {
  const limit = chipDate(input.asOf);
  return Boolean(result && input.sourceVersion && limit
    && result.tsCode === input.tsCode && result.sourceVersion === input.sourceVersion
    && result.source === "Tushare cyq_chips" && result.estimated === true
    && (result.asOf === null || (chipDate(result.asOf) && chipDate(result.asOf)! <= limit)));
}

export function validChipDistribution(result: StockChipDistributionResult | undefined): result is StockChipDistributionResult {
  if (!result || result.status !== "ready" || result.source !== "Tushare cyq_chips" || result.estimated !== true
    || !chipDate(result.asOf) || !result.tsCode || !result.sourceVersion
    || !Number.isFinite(Date.parse(result.fetchedAt)) || !Array.isArray(result.points) || result.points.length === 0
    || !(result.weightAvg === null || (Number.isFinite(result.weightAvg) && result.weightAvg > 0))) return false;
  const seen = new Set<number>();
  for (const point of result.points) {
    if (!point || !Number.isFinite(point.price) || point.price <= 0 || !Number.isFinite(point.percent)
      || point.percent < 0 || point.percent > 100 || seen.has(point.price)) return false;
    seen.add(point.price);
  }
  return result.points.some(point => point.percent > 0);
}

export interface StockChipDistributionBar {
  price: number;
  percent: number;
  priceLow?: number;
  priceHigh?: number;
  sourceCount?: number;
  /** 相对最高档小于5%，仅影响视觉强调，不改变真实占比或条长。 */
  lowDensity?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface StockChipDistributionOptions {
  height?: number;
  amplitudeScale?: "linear" | "log" | "soft-log";
  /** undefined保持原始逐价位；启用后最小0.50元，宽范围自动调整漂亮步长。 */
  priceBinSize?: number;
  /** 连续等宽价格档的最大SUM窗口；undefined保持旧全量。 */
  focusBinCount?: number;
  plotTop?: number;
  plotBottom?: number;
  referencePrice?: number | null;
  /** 仅改变价格坐标窗，保持focus布局和高度。 */
  fullRange?: boolean;
}
export interface StockChipDistributionModel {
  hasData: boolean;
  bars: StockChipDistributionBar[];
  allBars: StockChipDistributionBar[];
  totalPercent: number;
  visiblePercent: number;
  omittedLowPercent: number;
  omittedHighPercent: number;
  displayLow: number;
  displayHigh: number;
  focused: boolean;
  referenceOffscreen: boolean;
  weightAvgOffscreen: boolean;
  minPrice: number;
  maxPrice: number;
  maxPercent: number;
  weightAvgY: number | null;
  height: number;
  plotTop: number;
  plotBottom: number;
  amplitudeScale: "linear" | "log" | "soft-log";
  binSize?: number;
  percentTicks: { fraction: number; percent: number }[];
}

function binIndex(price: number, size: number): number {
  const quotient = price / size;
  const nearest = Math.round(quotient);
  // 仅消除十进制边界的浮点误差，不把真实邻近价位移动到下一档。
  return Math.floor(Math.abs(quotient - nearest) <= Number.EPSILON * Math.max(1, Math.abs(quotient)) * 4 ? nearest : quotient);
}

/** 仅定位父组件已校验、已对齐到供应商原生价位的价格；缺桶或范围外绝不吸附。 */
export function findStockChipReferenceBin(model: StockChipDistributionModel, price: number | null | undefined): StockChipDistributionBar | null {
  const size = model.binSize;
  if (!model.hasData || typeof price !== "number" || !Number.isFinite(price) || price <= 0
    || size === undefined || !Number.isFinite(size) || size <= 0) return null;
  const index = binIndex(price, size);
  return model.bars.find(bar => bar.priceLow !== undefined && bar.priceHigh !== undefined
    && Number.isFinite(bar.priceLow) && Number.isFinite(bar.priceHigh) && bar.priceLow < bar.priceHigh
    && binIndex(bar.priceLow, size) <= index && index < binIndex(bar.priceHigh, size)) ?? null;
}

function effectiveBinSize(requested: number, low: number, high: number): number {
  let size = Math.max(0.5, requested);
  if ((high - low) / size <= 60) return size;
  const required = (high - low) / 60;
  const power = 10 ** Math.floor(Math.log10(required));
  size = [1, 2, 5, 10].map(value => value * power).find(value => value >= required)!;
  return Math.max(0.5, size);
}

function barReadout(bar: StockChipDistributionBar): string {
  return bar.priceLow !== undefined && bar.priceHigh !== undefined
    ? `${bar.priceLow.toFixed(2)}–${bar.priceHigh.toFixed(2)}元/股（不含上界）·合计 ${bar.percent.toFixed(2)}%`
    : `${bar.price.toFixed(2)}元/股 · ${bar.percent.toFixed(2)}%`;
}

/** 默认保留原始价位；可选分桶只做真实份额SUM，绝不归一化、插值或平滑。 */
export function buildStockChipDistribution(result: StockChipDistributionResult | undefined, options: StockChipDistributionOptions = {}): StockChipDistributionModel {
  const focusCount = Number.isFinite(options.focusBinCount) && options.focusBinCount! >= 1
    ? Math.floor(options.focusBinCount!) : undefined;
  const height = Number.isFinite(options.height) && options.height! > TOP + 20 ? options.height! : focusCount ? 190 : HEIGHT;
  const defaultTop = focusCount ? Math.min(80, height - 40) : TOP;
  const plotTop = Number.isFinite(options.plotTop) ? Math.max(0, Math.min(height - 21, options.plotTop!)) : defaultTop;
  const defaultBottom = focusCount ? height - 30 : height - 20;
  const plotBottom = Math.max(plotTop + 1, Math.min(height - (focusCount ? 20 : 1),
    Number.isFinite(options.plotBottom) ? options.plotBottom! : defaultBottom));
  const amplitudeScale = options.amplitudeScale === "log" || options.amplitudeScale === "soft-log" ? options.amplitudeScale : "linear";
  const empty: StockChipDistributionModel = { hasData: false, bars: [], minPrice: 0, maxPrice: 0, maxPercent: 0, weightAvgY: null,
    allBars: [], totalPercent: 0, visiblePercent: 0, omittedLowPercent: 0, omittedHighPercent: 0,
    displayLow: 0, displayHigh: 0, focused: false, referenceOffscreen: false, weightAvgOffscreen: false,
    height, plotTop, plotBottom, amplitudeScale, percentTicks: [] };
  if (!validChipDistribution(result)) return empty;
  const points = [...result.points].sort((a, b) => a.price - b.price);
  const values = points.map(point => point.price);
  // 标记只使用分布实际日期对应的供应商weightAvg，不使用最新报价或原始收盘价。
  if (result.weightAvg !== null) values.push(result.weightAvg);
  let low = Math.min(...values);
  let high = Math.max(...values);
  const requestedBinSize = Number.isFinite(options.priceBinSize) && options.priceBinSize! > 0 ? options.priceBinSize! : focusCount ? 0.5 : undefined;
  const binSize = requestedBinSize !== undefined ? effectiveBinSize(requestedBinSize, low, high) : undefined;
  type Point = Pick<StockChipDistributionBar, "price" | "percent" | "priceLow" | "priceHigh" | "sourceCount">;
  let plotted: Point[] = points;
  if (binSize !== undefined) {
    const buckets = new Map<number, Point>();
    for (const point of points) {
      const index = binIndex(point.price, binSize);
      let bucket = buckets.get(index);
      if (!bucket) {
        const priceLow = Number((index * binSize).toPrecision(15));
        const priceHigh = Number(((index + 1) * binSize).toPrecision(15));
        bucket = { price: (priceLow + priceHigh) / 2, priceLow, priceHigh, percent: 0, sourceCount: 0 };
        buckets.set(index, bucket);
      }
      bucket.percent += point.percent;
      bucket.sourceCount! += 1;
    }
    plotted = [...buckets.values()]; // points已排序；只创建真正含原始点的桶。
    low = Math.min(low, plotted[0].priceLow!);
    high = Math.max(high, plotted[plotted.length - 1].priceHigh!);
  }
  const allPoints = plotted;
  const totalPercent = allPoints.reduce((sum, point) => sum + point.percent, 0);
  let referenceOffscreen = false;
  let weightAvgOffscreen = false;
  const focused = focusCount !== undefined && !options.fullRange;
  if (focused && binSize !== undefined) {
    const first = binIndex(allPoints[0].price, binSize);
    const last = binIndex(allPoints[allPoints.length - 1].price, binSize);
    const count = Math.min(focusCount!, last - first + 1);
    let start = first;
    let bestMass = -1;
    // 空桶参与窗口宽度但不创建横条；严格低价起点优先打破SUM相同的平局。
    for (let candidate = first; candidate <= Math.max(first, last - count + 1); candidate++) {
      const mass = allPoints.reduce((sum, point) => {
        const index = binIndex(point.price, binSize);
        return sum + (index >= candidate && index < candidate + count ? point.percent : 0);
      }, 0);
      if (mass > bestMass) { bestMass = mass; start = candidate; }
    }
    let end = start + count - 1;
    // 核心窗口先确定；近邻真实参考档可扩至最多2倍档数，远峰不强迫挤入小图。
    const realIndex = (price: number | null | undefined) => typeof price === "number" && Number.isFinite(price) && price > 0
      && allPoints.some(point => binIndex(point.price, binSize) === binIndex(price, binSize)) ? binIndex(price, binSize) : null;
    for (const price of [options.referencePrice, result.weightAvg]) {
      const index = realIndex(price);
      if (index !== null && Math.max(end, index) - Math.min(start, index) + 1 <= count * 2) {
        start = Math.min(start, index);
        end = Math.max(end, index);
      }
    }
    low = Number((start * binSize).toPrecision(15));
    high = Number(((end + 1) * binSize).toPrecision(15));
    plotted = allPoints.filter(point => point.price >= low && point.price < high);
    const referenceIndex = realIndex(options.referencePrice);
    referenceOffscreen = referenceIndex !== null && (referenceIndex < start || referenceIndex > end);
    weightAvgOffscreen = result.weightAvg !== null && (result.weightAvg < low || result.weightAvg > high);
  }
  const visiblePercent = plotted.reduce((sum, point) => sum + point.percent, 0);
  const omittedLowPercent = focused ? allPoints.reduce((sum, point) => sum + (point.price < low ? point.percent : 0), 0) : 0;
  const omittedHighPercent = focused ? allPoints.reduce((sum, point) => sum + (point.price >= high ? point.percent : 0), 0) : 0;
  const padding = high > low ? (high - low) * 0.02 : Math.max(high * 0.01, 0.01);
  const minPrice = Math.max(0, low - padding);
  const maxPrice = high + padding;
  const scaleY = (price: number) => plotTop + (maxPrice - price) / (maxPrice - minPrice) * (plotBottom - plotTop);
  const maxPercent = Math.max(...allPoints.map(point => point.percent));
  const logUnit = amplitudeScale === "soft-log" ? SOFT_LOG_UNIT : LOG_UNIT;
  const logMax = Math.log1p(maxPercent / logUnit);
  const scaleWidth = (percent: number) => (amplitudeScale !== "linear" ? Math.log1p(percent / logUnit) / logMax : percent / maxPercent) * (RIGHT - LEFT);
  const gaps = points.slice(1).map((point, index) => Math.abs(scaleY(point.price) - scaleY(points[index].price)));
  const barHeight = binSize !== undefined ? Math.min(7, binSize / (maxPrice - minPrice) * (plotBottom - plotTop) * 0.7)
    : Math.min(4, gaps.length ? Math.min(...gaps) * 0.78 : 4);
  const toBar = (point: Point): StockChipDistributionBar => ({ ...point, x: LEFT, y: scaleY(point.price),
    width: scaleWidth(point.percent), height: barHeight, lowDensity: point.percent / maxPercent < 0.05 });
  return {
    ...empty, hasData: true, minPrice, maxPrice, maxPercent, binSize,
    allBars: allPoints.map(toBar), bars: plotted.map(toBar), totalPercent, visiblePercent, omittedLowPercent, omittedHighPercent,
    displayLow: low, displayHigh: high, focused, referenceOffscreen, weightAvgOffscreen,
    weightAvgY: result.weightAvg === null || weightAvgOffscreen ? null : scaleY(result.weightAvg),
    percentTicks: [0, 0.5, 1].map(fraction => ({ fraction,
      percent: amplitudeScale !== "linear" ? Math.expm1(fraction * logMax) * logUnit : maxPercent * fraction })),
  };
}

/** 按真实占比取等尾累计95%区间；只判定上下留白，不裁剪尾部或改写原数据。 */
function overlaySpaces(result?: StockChipDistributionResult, height?: number): { top: number; bottom: number } {
  const model = buildStockChipDistribution(result, { height });
  if (!model.hasData) return { top: 0, bottom: 0 };
  const total = model.bars.reduce((sum, bar) => sum + bar.percent, 0);
  let cumulative = 0;
  let low: number | undefined;
  let high = model.bars[model.bars.length - 1].price;
  for (const bar of model.bars) {
    cumulative += bar.percent;
    if (low === undefined && cumulative >= total * 0.025) low = bar.price;
    if (cumulative >= total * 0.975) { high = bar.price; break; }
  }
  const pixelsPerPrice = (model.plotBottom - model.plotTop) / (model.maxPrice - model.minPrice);
  return { top: (model.maxPrice - high) * pixelsPerPrice, bottom: ((low ?? model.minPrice) - model.minPrice) * pixelsPerPrice };
}

export function chipDistributionOverlayPlacement(result?: StockChipDistributionResult): "top" | "bottom" {
  const spaces = overlaySpaces(result);
  return spaces.top >= spaces.bottom ? "top" : "bottom";
}

/** 所选侧在绘图区内、95%核心范围以外的空带像素；仍完整绘制尾部。 */
export function chipDistributionOverlaySpace(result?: StockChipDistributionResult, height = 260): number {
  const spaces = overlaySpaces(result, height);
  return Math.max(spaces.top, spaces.bottom);
}

/** 与SVG实际viewBox一致；分桶时按[low,high)选中真实桶，否则选最近原始价位。 */
export function chipDistributionPriceAtPointer(model: StockChipDistributionModel, clientY: number, boundsTop: number, boundsHeight: number): number | null {
  if (!model.hasData || boundsHeight <= 0 || ![clientY, boundsTop, boundsHeight].every(Number.isFinite)) return null;
  const y = (clientY - boundsTop) / boundsHeight * model.height;
  if ((model.focused || model.plotTop !== TOP) && (y < model.plotTop || y > model.plotBottom)) return null;
  if (model.binSize !== undefined) {
    const price = model.maxPrice - (y - model.plotTop) / (model.plotBottom - model.plotTop) * (model.maxPrice - model.minPrice);
    const index = binIndex(price, model.binSize);
    const bucket = model.bars.find(bar => binIndex(bar.price, model.binSize!) === index);
    if (bucket) return bucket.price;
  }
  return model.bars.reduce((previous, bar) => Math.abs(bar.y - y) < Math.abs(previous.y - y) ? bar : previous).price;
}

export default function StockChipDistribution({ result, name, loading = false, height, amplitudeScale = "linear", priceBinSize,
  referencePrice, focusBinCount, plotTop, plotBottom, fullRange: initialFullRange = false, emptyState, onRetry }: {
  result?: StockChipDistributionResult;
  name: string;
  loading?: boolean;
  emptyState?: "idle" | "missing" | "error";
  onRetry?: () => void;
  height?: number;
  amplitudeScale?: "linear" | "log" | "soft-log";
  priceBinSize?: number;
  focusBinCount?: number;
  plotTop?: number;
  plotBottom?: number;
  /** 初始全范围，可用于静态预览；按钮内部切换不改变高度。 */
  fullRange?: boolean;
  /** 仅接受经过证据校验并换算到供应商分布原生价位口径的现价；未对齐时不传。 */
  referencePrice?: number | null;
}) {
  const [fullRange, setFullRange] = useState(initialFullRange);
  const focusEnabled = Number.isFinite(focusBinCount) && focusBinCount! >= 1;
  const model = buildStockChipDistribution(result, { height, amplitudeScale, priceBinSize, referencePrice,
    focusBinCount, plotTop, plotBottom, fullRange });
  const displayState = loading ? "loading" : emptyState === "error" ? "error" : model.hasData ? "ready" : emptyState ?? "idle";
  const emptyMessage = displayState === "missing" ? "筹码分布暂无记录" : displayState === "error" ? "筹码分布加载失败" : "筹码分布暂无数据";
  const showEmptyMessage = !model.hasData && !loading && (emptyState !== "idle" || emptyState === undefined);
  const rangeText = `${Number(model.displayLow.toFixed(2))}–${Number(model.displayHigh.toFixed(2))}元`;
  const rangeToggleText = fullRange ? "全范围 · 收起" : `集中${model.visiblePercent.toFixed(2)}% · 全部`;
  // 只压缩显示标签，不改变模型范围/份额；长价位范围也按整行可用宽度适配。
  const footerTextUnits = Array.from(rangeText + rangeToggleText).reduce((sum, char) => sum
    + (/\d/.test(char) ? 0.58 : char === "." ? 0.3 : char === "%" ? 0.86 : /\s/.test(char) ? 0.22 : char === "·" ? 0.45 : char === "–" ? 0.6 : 1), 0);
  const emptyY = (model.plotTop + model.plotBottom) / 2;
  const referenceBin = findStockChipReferenceBin(model, referencePrice);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const selected = model.bars.find(bar => bar.price === selectedPrice);
  const lengthLabel = amplitudeScale === "soft-log" ? "横条长度为温和对数映射，读数是真实占比（%）；浅色仅表示相对最高档低于5%的视觉弱化，不修改份额"
    : amplitudeScale === "log" ? "横条长度为对数映射，读数是真实占比（%）" : "横条长度与真实占比（%）成正比";
  const label = `${name}的供应商模型筹码成本分布，纵轴价位（元/股），高价在上；${lengthLabel}，不是账户真实持仓`;
  const inspect = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setSelectedPrice(chipDistributionPriceAtPointer(model, event.clientY, bounds.top, bounds.height));
  };
  return (
    <div className="relative min-w-0" style={{ width: "100%", maxWidth: 360, containerType: "inline-size", ...(focusEnabled ? { height: model.height } : {}) }} aria-busy={loading} data-state={displayState} data-stock-chip-distribution="true">
      <svg viewBox={`0 0 ${WIDTH} ${model.height}`} width="100%" height={height === undefined && !focusEnabled ? 76 : model.height} role="img" aria-label={label}
        preserveAspectRatio="none" style={{ display: "block" }} onPointerMove={inspect} onPointerDown={inspect}
        onPointerLeave={event => { if (event.pointerType === "mouse") setSelectedPrice(null); }}>
        <title>{`${label}${model.hasData ? `；实际分布日期：${chipDate(result?.asOf)}；来源Tushare cyq_chips（estimated）` : ""}`}</title>
        {model.hasData ? <>
          <text x="1" y={focusEnabled ? Math.max(7, model.plotTop - 7) : 7} fill="#6C7A89" fontSize="7">元/股</text>
          <text data-stock-chip-scale={model.amplitudeScale} data-stock-chip-bin-size={model.binSize} x={RIGHT} y={focusEnabled ? Math.max(7, model.plotTop - 7) : 7} textAnchor="end" fill="#6C7A89" fontSize="7">
            {model.binSize !== undefined ? `${model.binSize.toFixed(2)}元/档 · ` : "占比·"}{model.amplitudeScale === "soft-log" ? "温和对数" : model.amplitudeScale === "log" ? "对数" : "线性"}
          </text>
          {[0, 0.5, 1].map(fraction => {
            const y = model.plotTop + (model.plotBottom - model.plotTop) * fraction;
            return <g key={fraction}>
              <line x1={LEFT} x2={RIGHT} y1={y} y2={y} stroke="#dfe5ea" strokeWidth="0.7" />
              <text data-stock-chip-axis="price" x={LEFT - 4} y={y + 2} textAnchor="end" fill="#6C7A89" fontSize="7">{(model.maxPrice - (model.maxPrice - model.minPrice) * fraction).toFixed(2)}</text>
            </g>;
          })}
          {model.bars.map(bar => <rect key={bar.price} data-stock-chip-price={bar.price} data-stock-chip-percent={bar.percent}
            data-stock-chip-bin-low={bar.priceLow} data-stock-chip-bin-high={bar.priceHigh}
            data-stock-chip-bin-count={bar.sourceCount} data-stock-chip-bin-percent={bar.priceLow !== undefined ? bar.percent : undefined}
            data-stock-chip-low-density={bar.lowDensity}
            data-stock-chip-current-bin={bar === referenceBin ? "true" : undefined}
            data-stock-chip-current-price={bar === referenceBin ? referencePrice : undefined}
            x={bar.x} y={bar.y - bar.height / 2} width={bar.width} height={bar.height}
            fill={bar === referenceBin ? REFERENCE_COLOR : bar.lowDensity ? LOW_DENSITY_COLOR : COLOR}
            fillOpacity={bar === referenceBin ? 1 : bar.lowDensity ? 0.65 : 1}
            stroke={bar === referenceBin ? REFERENCE_STROKE : undefined} strokeWidth={bar === referenceBin ? 0.8 : undefined}
            tabIndex={0} aria-label={`${bar.priceLow !== undefined ? barReadout(bar) : `价位${bar.price.toFixed(2)}元/股，占比${bar.percent.toFixed(2)}%`}${bar === referenceBin ? `；${REFERENCE_LABEL}` : ""}`}
            onFocus={() => setSelectedPrice(bar.price)} onBlur={() => setSelectedPrice(null)}>
            <title>{`${barReadout(bar)}${bar === referenceBin ? `；${REFERENCE_LABEL}` : ""}`}</title>
          </rect>)}
          {model.weightAvgY !== null && <line data-stock-chip-marker="supplier-weight-avg" x1={LEFT} x2={RIGHT}
            y1={model.weightAvgY} y2={model.weightAvgY} stroke={COLOR} strokeWidth="0.8" strokeDasharray="3 2">
            <title>{`分布日期${chipDate(result?.asOf)}对应供应商平均成本${result?.weightAvg?.toFixed(2)}元/股`}</title>
          </line>}
          {!focusEnabled && <line x1={LEFT} x2={RIGHT} y1={model.plotBottom + 4} y2={model.plotBottom + 4} stroke="#a8c3c8" strokeWidth="0.6" />}
          {!focusEnabled && model.percentTicks.map(({ fraction, percent }) => <text key={fraction} data-stock-chip-axis="percent" x={LEFT + (RIGHT - LEFT) * fraction}
            y={model.height - 4} textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"} fill="#6C7A89" fontSize="7">{percent.toFixed(2)}%</text>)}
        </> : loading ? <text data-stock-chip-loading="true" x={WIDTH / 2} y={emptyY} textAnchor="middle" fill="#6C7A89" fontSize="10">
          正在读取筹码分布<tspan className="animate-pulse">…</tspan>
        </text> : showEmptyMessage ? <text x={WIDTH / 2} y={emptyY} textAnchor="middle" fill="#6C7A89" fontSize="10">{emptyMessage}</text> : null}
      </svg>
      {!loading && displayState === "error" && onRetry && <button type="button" data-stock-chip-retry="true"
        className="absolute left-1/2 -translate-x-1/2 text-[9px] text-[#087987]" style={model.hasData
          ? { bottom: 16, height: 14, lineHeight: "14px", padding: 0 }
          : { top: emptyY + 12, height: 14, lineHeight: "14px", padding: 0 }}
        onClick={onRetry}>{model.hasData ? "更新失败 · 重试" : "重试"}</button>}
      {focusEnabled && model.hasData && <div data-stock-chip-footer="true" data-stock-chip-focused={model.focused}
        data-stock-chip-reference-offscreen={model.referenceOffscreen} data-stock-chip-weight-avg-offscreen={model.weightAvgOffscreen}
        className="absolute left-1 right-1 flex flex-nowrap items-center justify-between gap-0.5 whitespace-nowrap text-[#6C7A89]"
        style={{ bottom: 2, height: 14, lineHeight: "14px", fontSize: `clamp(6px,calc((100cqw - 12px) / ${Math.max(footerTextUnits, 1)}),9px)` }}
        title={`${model.displayLow.toFixed(2)}–${model.displayHigh.toFixed(2)}元/股；低尾${model.omittedLowPercent.toFixed(2)}%，高尾${model.omittedHighPercent.toFixed(2)}%${model.referenceOffscreen ? "；现价档在集中区外，未绘制" : ""}${model.weightAvgOffscreen ? "；平均成本在集中区外，未绘制" : ""}`}>
        <span className="shrink-0 whitespace-nowrap" data-stock-chip-range-label="true">{rangeText}</span>
        <button type="button" data-stock-chip-range-toggle="true" aria-expanded={fullRange}
          className="whitespace-nowrap" style={{ height: 14, lineHeight: "14px", padding: 0, flexShrink: 0, fontSize: "inherit" }}
          onClick={() => { setFullRange(value => !value); setSelectedPrice(null); }}>
          {rangeToggleText}
        </button>
      </div>}
      {selected && <p role="status" style={focusEnabled ? { top: model.plotTop, margin: 0 } : undefined} className="pointer-events-none absolute left-1 right-1 top-0 rounded bg-white/95 px-1 py-0.5 text-center text-[10px] leading-4 tabular-nums text-[#087987]">
        {barReadout(selected)}
      </p>}
    </div>
  );
}
