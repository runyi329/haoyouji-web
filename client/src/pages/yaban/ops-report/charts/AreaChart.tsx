/**
 * AreaChart - 营收趋势面积图（月度）
 */

import { genTrendData } from "../../mockData";

const CHART_H = 160;
const CHART_W = 320;
const PAD_L = 36;
const PAD_B = 24;

export default function AreaChart() {
  const data = genTrendData();
  const maxVal = Math.max(...data.map((d) => Math.max(d.actual, d.ai))) * 1.1;
  const innerW = CHART_W - PAD_L;
  const innerH = CHART_H - PAD_B;
  const n = data.length;

  function toX(i: number) {
    return PAD_L + (i / (n - 1)) * innerW;
  }
  function toY(v: number) {
    return innerH - (v / maxVal) * innerH;
  }

  const actualPoints = data.map((d, i) => `${toX(i)},${toY(d.actual)}`).join(" ");
  const aiPoints = data.map((d, i) => `${toX(i)},${toY(d.ai)}`).join(" ");

  // 面积路径
  const actualArea =
    `M${toX(0)},${toY(data[0].actual)} ` +
    data.slice(1).map((d, i) => `L${toX(i + 1)},${toY(d.actual)}`).join(" ") +
    ` L${toX(n - 1)},${innerH} L${toX(0)},${innerH} Z`;

  const aiArea =
    `M${toX(0)},${toY(data[0].ai)} ` +
    data.slice(1).map((d, i) => `L${toX(i + 1)},${toY(d.ai)}`).join(" ") +
    ` L${toX(n - 1)},${innerH} L${toX(0)},${innerH} Z`;

  // Y轴刻度
  const yTicks = [0, 25, 50, 75, 100].map((pct) => (maxVal * pct) / 100);

  return (
    <div style={{ overflowX: "auto", scrollbarWidth: "none" }}>
      <svg width={CHART_W} height={CHART_H} style={{ display: "block", minWidth: CHART_W }}>
        <defs>
          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E88D6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#1E88D6" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="aiGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9C27B0" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#9C27B0" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* 网格线 */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              y1={toY(v)}
              x2={CHART_W}
              y2={toY(v)}
              stroke="#F3F4F6"
              strokeWidth={1}
            />
            <text x={PAD_L - 4} y={toY(v) + 3} textAnchor="end" fontSize={8} fill="#9CA3AF">
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* AI面积 */}
        <path d={aiArea} fill="url(#aiGrad)" />
        {/* 实际面积 */}
        <path d={actualArea} fill="url(#actualGrad)" />

        {/* AI折线 */}
        <polyline
          points={aiPoints}
          fill="none"
          stroke="#9C27B0"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 实际折线 */}
        <polyline
          points={actualPoints}
          fill="none"
          stroke="#1E88D6"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 数据点 */}
        {data.map((d, i) => (
          <circle key={i} cx={toX(i)} cy={toY(d.actual)} r={3} fill="#1E88D6" />
        ))}

        {/* X轴标签 */}
        {data.map((d, i) => (
          <text key={i} x={toX(i)} y={CHART_H - 4} textAnchor="middle" fontSize={9} fill="#9CA3AF">
            {d.date}
          </text>
        ))}
      </svg>

      {/* 图例 */}
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 10, color: "#6B7280" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 16, height: 2, background: "#1E88D6", borderRadius: 1 }} />
          实际营收
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="8">
            <line x1="0" y1="4" x2="16" y2="4" stroke="#9C27B0" strokeWidth="1.5" strokeDasharray="4 2" />
          </svg>
          AI预测
        </span>
      </div>
    </div>
  );
}
