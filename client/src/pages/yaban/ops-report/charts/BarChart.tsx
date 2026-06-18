/**
 * BarChart - 日营收柱状图（React + SVG，无动画依赖问题）
 * 包含：历史柱、今日柱、未来预测柱、资金线、AI预测线、盈亏平衡线
 */

import { useRef, useEffect, useState } from "react";
import { mockDailyRevenue, BREAKEVEN_VALUE } from "../../mockData";

interface BarChartProps {
  onDateRangeChange?: (range: string) => void;
}

const CHART_H = 195;
const BAR_W = 22;
const BAR_GAP = 10;
const COL_W = BAR_W + BAR_GAP;
const PADDING_LEFT = 36;
const PADDING_RIGHT = 8;

export default function BarChart({ onDateRangeChange }: BarChartProps) {
  const data = mockDailyRevenue;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateScrollRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: data.length - 1 });

  const maxVal = Math.max(...data.map((d) => d.value)) * 1.15;
  const totalW = data.length * COL_W;

  // Y轴刻度
  const yTicks = 4;
  const yStep = maxVal / yTicks;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => +(yStep * i).toFixed(1));

  function toY(val: number) {
    return CHART_H - (val / maxVal) * CHART_H;
  }

  // 资金线折点
  const fundLinePoints = data
    .filter((d) => !d.isFuture)
    .map((d, i) => `${PADDING_LEFT + i * COL_W + BAR_W / 2},${toY(d.value)}`)
    .join(" ");

  // AI预测线折点（未来部分）
  const lastHistIdx = data.findIndex((d) => d.isFuture) - 1;
  const aiLinePoints = data
    .map((d, i) => `${PADDING_LEFT + i * COL_W + BAR_W / 2},${toY(d.value)}`)
    .slice(lastHistIdx >= 0 ? lastHistIdx : 0)
    .join(" ");

  // 盈亏平衡线Y坐标
  const beY = toY(BREAKEVEN_VALUE);
  const beLabel = `¥${BREAKEVEN_VALUE.toFixed(2)}万`;

  // 同步日期滚动
  function handleScroll() {
    if (scrollRef.current && dateScrollRef.current) {
      dateScrollRef.current.scrollLeft = scrollRef.current.scrollLeft;
      // 更新可见范围
      const sl = scrollRef.current.scrollLeft;
      const cw = scrollRef.current.clientWidth - PADDING_LEFT;
      const startIdx = Math.floor(sl / COL_W);
      const endIdx = Math.min(data.length - 1, Math.ceil((sl + cw) / COL_W));
      setVisibleRange({ start: startIdx, end: endIdx });
      if (onDateRangeChange) {
        const s = data[startIdx]?.date ?? "";
        const e = data[endIdx]?.date ?? "";
        onDateRangeChange(`${s} - ${e}`);
      }
    }
  }

  useEffect(() => {
    // 初始滚动到今日附近
    if (scrollRef.current) {
      const todayIdx = data.findIndex((d) => d.isToday);
      if (todayIdx > 0) {
        const targetScroll = Math.max(0, (todayIdx - 3) * COL_W);
        scrollRef.current.scrollLeft = targetScroll;
      }
    }
    handleScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  void visibleRange;

  return (
    <div>
      {/* Y轴 + 图表滚动区 */}
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {/* Y轴标签 */}
        <div
          style={{
            width: PADDING_LEFT,
            flexShrink: 0,
            height: CHART_H,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingBottom: 0,
          }}
        >
          {[...yLabels].reverse().map((v, i) => (
            <span key={i} style={{ fontSize: 9, color: "#9CA3AF", lineHeight: 1 }}>
              {v === 0 ? "0.0" : v}
            </span>
          ))}
        </div>

        {/* 滚动图表 */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowX: "auto",
            overflowY: "hidden",
            scrollbarWidth: "none",
            height: CHART_H,
            position: "relative",
          }}
        >
          <svg
            width={totalW + PADDING_RIGHT}
            height={CHART_H}
            style={{ display: "block", overflow: "visible" }}
          >
            {/* 横向网格线 */}
            {yLabels.map((_, i) => (
              <line
                key={i}
                x1={0}
                y1={toY(yLabels[i])}
                x2={totalW + PADDING_RIGHT}
                y2={toY(yLabels[i])}
                stroke="#F3F4F6"
                strokeWidth={1}
              />
            ))}

            {/* 柱子 */}
            {data.map((d, i) => {
              const x = i * COL_W;
              const barH = Math.max(3, (d.value / maxVal) * CHART_H);
              const y = CHART_H - barH;
              const isToday = d.isToday;
              const isFuture = d.isFuture;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={BAR_W}
                    height={barH}
                    rx={4}
                    fill={
                      isToday
                        ? "#1E88D6"
                        : isFuture
                        ? "rgba(30,136,214,0.25)"
                        : "rgba(30,136,214,0.75)"
                    }
                  />
                  {/* 数值标签 */}
                  <text
                    x={x + BAR_W / 2}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize={8}
                    fill={isToday ? "#1E88D6" : isFuture ? "#9CA3AF" : "#6B7280"}
                    fontWeight={isToday ? 700 : 400}
                  >
                    {d.value.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* 资金线 */}
            {fundLinePoints && (
              <polyline
                points={fundLinePoints}
                fill="none"
                stroke="#FF6B35"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* AI预测线（虚线） */}
            {lastHistIdx >= 0 && (
              <polyline
                points={aiLinePoints}
                fill="none"
                stroke="#9C27B0"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* 盈亏平衡线 */}
            <line
              x1={0}
              y1={beY}
              x2={totalW + PADDING_RIGHT}
              y2={beY}
              stroke="#4CAF50"
              strokeWidth={0.9}
              strokeDasharray="5 3"
            />
            {/* 盈亏平衡线标注：金额在上，文字在下 */}
            <text
              x={totalW - 2}
              y={beY - 5}
              textAnchor="end"
              fontSize={9}
              fill="#4CAF50"
              fontWeight={600}
            >
              {beLabel}
            </text>
            <text
              x={totalW - 2}
              y={beY + 12}
              textAnchor="end"
              fontSize={8}
              fill="#4CAF50"
            >
              AI盈亏平衡线
            </text>
          </svg>
        </div>
      </div>

      {/* 日期行 */}
      <div style={{ display: "flex" }}>
        <div style={{ width: PADDING_LEFT, flexShrink: 0 }} />
        <div
          ref={dateScrollRef}
          style={{
            flex: 1,
            overflowX: "hidden",
            scrollbarWidth: "none",
          }}
        >
          <div style={{ width: totalW + PADDING_RIGHT, display: "flex" }}>
            {data.map((d, i) => (
              <div
                key={i}
                style={{
                  width: COL_W,
                  flexShrink: 0,
                  textAlign: "center",
                  fontSize: 9,
                  color: d.isToday ? "#1E88D6" : "#9CA3AF",
                  fontWeight: d.isToday ? 700 : 400,
                  paddingTop: 4,
                }}
              >
                {d.date}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 图例 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 12px",
          marginTop: 10,
          fontSize: 10,
          color: "#6B7280",
        }}
      >
        {[
          { color: "rgba(30,136,214,0.75)", label: "日营收" },
          { color: "#1E88D6", label: "今日" },
          { color: "#FF6B35", label: "资金线" },
          { color: "rgba(30,136,214,0.25)", label: "未来" },
          { color: "#9C27B0", label: "AI预测", dashed: true },
        ].map((item) => (
          <span key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {item.dashed ? (
              <svg width="16" height="8">
                <line
                  x1="0"
                  y1="4"
                  x2="16"
                  y2="4"
                  stroke={item.color}
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />
              </svg>
            ) : (
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: item.color,
                }}
              />
            )}
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
