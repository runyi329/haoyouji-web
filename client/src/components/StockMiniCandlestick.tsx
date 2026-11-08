import type { StockMAMonitorCandle, StockMAMonitorPeriod } from "@shared/stock-ma-monitor";

const VIEWBOX_WIDTH = 240;
const VIEWBOX_HEIGHT = 100;
const PLOT_LEFT = 4;
const PLOT_RIGHT = 205;
const PLOT_TOP = 6;
const PLOT_BOTTOM = 82;
const MAX_CANDLES = 40;

// 保留旧导出供其他消费者使用；本监控图不再绘制周期线。
export const STOCK_MINI_AVERAGE_COLORS: Record<StockMAMonitorPeriod, string> = {
  5: "#169BA5", 10: "#D2A143", 20: "#997DD7", 30: "#D17B4F",
  60: "#3C87C7", 120: "#AE5CA0", 250: "#627F36",
};
export function stockMiniAverageColor(period: StockMAMonitorPeriod): string {
  return STOCK_MINI_AVERAGE_COLORS[period];
}

export const STOCK_MINI_REFERENCE_LINES = [
  { key: "compositeAverage", label: "综合均价", color: "#169BA5" },
  { key: "chipAverageCost", label: "筹码平均成本", color: "#B28B3E" },
] as const;
export type StockMiniReferenceKey = typeof STOCK_MINI_REFERENCE_LINES[number]["key"];

export interface StockMiniChartPoint { x: number; y: number }
export interface StockMiniChartCandleGeometry {
  candle: StockMAMonitorCandle;
  x: number;
  openY: number;
  highY: number;
  lowY: number;
  closeY: number;
  bodyTop: number;
  bodyHeight: number;
  bodyWidth: number;
}
export interface StockMiniChartReferenceSegment {
  key: StockMiniReferenceKey;
  points: StockMiniChartPoint[];
}
export interface StockMiniChartModel {
  candles: StockMAMonitorCandle[];
  candleGeometry: StockMiniChartCandleGeometry[];
  referenceSegments: StockMiniChartReferenceSegment[];
  min: number;
  max: number;
  hasData: boolean;
}

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function validCandle(candle: StockMAMonitorCandle): boolean {
  return finitePositive(candle.open) && finitePositive(candle.high)
    && finitePositive(candle.low) && finitePositive(candle.close)
    && candle.high >= Math.max(candle.open, candle.close)
    && candle.low <= Math.min(candle.open, candle.close) && candle.high >= candle.low;
}

/** 仅对后端返回的真实OHLC及展示参考值建几何，不合成行情、不计算均价。 */
export function buildStockMiniChart(
  candles: StockMAMonitorCandle[],
  _periods?: readonly StockMAMonitorPeriod[],
): StockMiniChartModel {
  const unique = new Map<string, StockMAMonitorCandle>();
  for (const candle of candles) {
    if (typeof candle.date === "string" && candle.date && !unique.has(candle.date)) {
      unique.set(candle.date, candle);
    }
  }
  // 不按参考线可用性过滤日期，否则null会被跨越连线；无效OHLC只跳过K柱。
  const ordered = Array.from(unique.values())
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_CANDLES);
  const values = ordered.flatMap(candle => [
    ...(validCandle(candle) ? [candle.high, candle.low] : []),
    ...STOCK_MINI_REFERENCE_LINES.flatMap(({ key }) => {
      const value = candle[key];
      return finitePositive(value) ? [value] : [];
    }),
  ]);
  if (values.length === 0) {
    return { candles: ordered, candleGeometry: [], referenceSegments: [], min: 0, max: 0, hasData: false };
  }

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin;
  const padding = span > 0 ? span * 0.08 : Math.max(rawMax * 0.02, 0.01);
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const scaleY = (value: number) => PLOT_TOP + ((max - value) / (max - min)) * (PLOT_BOTTOM - PLOT_TOP);
  const step = ordered.length > 1 ? (PLOT_RIGHT - PLOT_LEFT) / (ordered.length - 1) : 0;
  const bodyWidth = Math.max(1.8, Math.min(6, step * 0.58 || 4));
  const xAt = (index: number) => ordered.length === 1 ? (PLOT_LEFT + PLOT_RIGHT) / 2 : PLOT_LEFT + index * step;
  const candleGeometry = ordered.flatMap((candle, index) => {
    if (!validCandle(candle)) return [];
    const openY = scaleY(candle.open);
    const closeY = scaleY(candle.close);
    return [{ candle, x: xAt(index), openY, highY: scaleY(candle.high), lowY: scaleY(candle.low), closeY,
      bodyTop: Math.min(openY, closeY), bodyHeight: Math.max(Math.abs(closeY - openY), 0.9), bodyWidth }];
  });

  const referenceSegments: StockMiniChartReferenceSegment[] = [];
  for (const { key } of STOCK_MINI_REFERENCE_LINES) {
    let points: StockMiniChartPoint[] = [];
    const flush = () => {
      if (points.length > 0) referenceSegments.push({ key, points });
      points = [];
    };
    ordered.forEach((candle, index) => {
      const value = candle[key];
      if (!finitePositive(value)) { flush(); return; }
      points.push({ x: xAt(index), y: scaleY(value) });
    });
    flush();
  }
  return { candles: ordered, candleGeometry, referenceSegments, min, max, hasData: true };
}

export function StockMiniChartLegend({ chipAvailable }: { chipAvailable: boolean }) {
  return (
    <div aria-label="图表参考线图例" className="mt-1 flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[10px] leading-4" style={{ color: "#6C7A89" }}>
      {STOCK_MINI_REFERENCE_LINES.map(({ key, label, color }) => {
        const unavailable = key === "chipAverageCost" && !chipAvailable;
        return (
          <span key={key} data-stock-monitor-average-legend={key} data-reference-available={!unavailable} className="inline-flex min-w-0 items-center gap-1">
            <span aria-hidden="true" className="w-3 shrink-0" style={{ borderTop: `2px ${unavailable ? "dashed" : "solid"} ${color}`, opacity: unavailable ? 0.45 : 1 }} />
            {label}{unavailable ? " —" : ""}
          </span>
        );
      })}
    </div>
  );
}

export interface StockMiniCandlestickProps {
  candles: StockMAMonitorCandle[];
  /** 兼容旧调用；不参与展示计算或周期线绘制。 */
  periods?: StockMAMonitorPeriod[];
  name: string;
}
function dateLabel(date: string): string { return date.length >= 10 ? date.slice(5, 10) : date; }
function axisLabel(value: number): string { return value.toFixed(value >= 1000 ? 0 : 2); }

export default function StockMiniCandlestick({ candles, name }: StockMiniCandlestickProps) {
  const model = buildStockMiniChart(candles);
  const hasChip = model.referenceSegments.some(segment => segment.key === "chipAverageCost");
  const label = `${name}的最近日K线与综合均价${hasChip ? "、筹码平均成本" : ""}`;
  const firstDate = model.candles[0]?.date;
  const lastDate = model.candles[model.candles.length - 1]?.date;
  return (
    <div style={{ width: "100%", maxWidth: 360, minWidth: 0 }}>
      <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} width="100%" height="76" role="img" aria-label={label}
        data-stock-mini-references={hasChip ? "compositeAverage,chipAverageCost" : "compositeAverage"} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <title>{label}</title>
        {[0, 0.5, 1].map(fraction => {
          const y = PLOT_TOP + (PLOT_BOTTOM - PLOT_TOP) * fraction;
          return <g key={fraction}>
            <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y} y2={y} stroke="#dfe5ea" strokeWidth="0.7" />
            {model.hasData && <text data-stock-mini-axis="price" x={VIEWBOX_WIDTH - 1} y={y + 2} textAnchor="end" fill="#87919a" fontSize="6.5">{axisLabel(model.max - (model.max - model.min) * fraction)}</text>}
          </g>;
        })}
        {model.candleGeometry.length === 0 && <text x={PLOT_RIGHT / 2} y={46} textAnchor="middle" fill="#87919a" fontSize="9">日K暂不可用</text>}
        {model.candleGeometry.map(item => {
          const color = item.candle.close >= item.candle.open ? "#d84a4a" : "#2e9b69";
          return <g key={item.candle.date} data-stock-mini-candle={item.candle.date}>
            <line x1={item.x} x2={item.x} y1={item.highY} y2={item.lowY} stroke={color} strokeWidth="0.9" />
            <rect x={item.x - item.bodyWidth / 2} y={item.bodyTop} width={item.bodyWidth} height={item.bodyHeight}
              fill={item.candle.close === item.candle.open ? "none" : color} stroke={color} strokeWidth="0.8" />
          </g>;
        })}
        {model.referenceSegments.map((segment, index) => {
          const color = STOCK_MINI_REFERENCE_LINES.find(line => line.key === segment.key)!.color;
          return segment.points.length === 1
            ? <circle key={`${segment.key}-${index}`} data-stock-mini-reference={segment.key} cx={segment.points[0].x} cy={segment.points[0].y} r="1.1" fill={color} />
            : <polyline key={`${segment.key}-${index}`} data-stock-mini-reference={segment.key}
              points={segment.points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke={color}
              strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />;
        })}
        {firstDate && <text x={PLOT_LEFT} y={96} fill="#9aa3ab" fontSize="7" textAnchor="start">{dateLabel(firstDate)}</text>}
        {lastDate && lastDate !== firstDate && <text x={PLOT_RIGHT} y={96} fill="#9aa3ab" fontSize="7" textAnchor="end">{dateLabel(lastDate)}</text>}
      </svg>
    </div>
  );
}
