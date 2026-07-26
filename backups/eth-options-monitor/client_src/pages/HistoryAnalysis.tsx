/**
 * 历史分析页面
 * 设计风格：深色仪表盘，与主页一致
 * 功能：展示期权年化成本 + 距平衡点的双轴时间序列图
 * 高亮"甜蜜窗口"：年化≤24% 且 距平衡点≤100 同时满足的时段
 */

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

// ─── 模拟数据生成 ───────────────────────────────────────────────────────────
// 模拟 ETH-25DEC2026-2000-C 从 2025-01-01 到 2026-07-10 的每周数据
function generateMockData() {
  const data: {
    date: string;
    ethPrice: number;
    markPriceUsd: number;
    annualCost: number;
    monthlyCost: number;
    distToStrike: number; // K - ETH现价，正=虚值，负=实值
    daysLeft: number;
    isSweetSpot: boolean;
  }[] = [];

  // ETH价格走势模拟（2025-01 ~ 2026-07）
  const ethPrices: [string, number][] = [
    ["2025-01-06", 3350],
    ["2025-01-13", 3100],
    ["2025-01-20", 3400],
    ["2025-01-27", 3200],
    ["2025-02-03", 2800],
    ["2025-02-10", 2600],
    ["2025-02-17", 2750],
    ["2025-02-24", 2400],
    ["2025-03-03", 2200],
    ["2025-03-10", 2050],
    ["2025-03-17", 1950],
    ["2025-03-24", 1850],
    ["2025-03-31", 1800],
    ["2025-04-07", 1650],
    ["2025-04-14", 1600],
    ["2025-04-21", 1750],
    ["2025-04-28", 1900],
    ["2025-05-05", 2100],
    ["2025-05-12", 2300],
    ["2025-05-19", 2500],
    ["2025-05-26", 2600],
    ["2025-06-02", 2750],
    ["2025-06-09", 2900],
    ["2025-06-16", 2700],
    ["2025-06-23", 2500],
    ["2025-06-30", 2400],
    ["2025-07-07", 2600],
    ["2025-07-14", 2800],
    ["2025-07-21", 3000],
    ["2025-07-28", 3200],
    ["2025-08-04", 3100],
    ["2025-08-11", 2900],
    ["2025-08-18", 2700],
    ["2025-08-25", 2500],
    ["2025-09-01", 2400],
    ["2025-09-08", 2300],
    ["2025-09-15", 2200],
    ["2025-09-22", 2100],
    ["2025-09-29", 2000],
    ["2025-10-06", 2050],
    ["2025-10-13", 2150],
    ["2025-10-20", 2300],
    ["2025-10-27", 2500],
    ["2025-11-03", 2700],
    ["2025-11-10", 2900],
    ["2025-11-17", 3100],
    ["2025-11-24", 3300],
    ["2025-12-01", 3500],
    ["2025-12-08", 3700],
    ["2025-12-15", 3600],
    ["2025-12-22", 3400],
    ["2025-12-29", 3200],
    ["2026-01-05", 3000],
    ["2026-01-12", 2800],
    ["2026-01-19", 2600],
    ["2026-01-26", 2400],
    ["2026-02-02", 2200],
    ["2026-02-09", 2100],
    ["2026-02-16", 2000],
    ["2026-02-23", 1950],
    ["2026-03-02", 1900],
    ["2026-03-09", 1850],
    ["2026-03-16", 1800],
    ["2026-03-23", 1750],
    ["2026-03-30", 1700],
    ["2026-04-06", 1750],
    ["2026-04-13", 1800],
    ["2026-04-20", 1850],
    ["2026-04-27", 1900],
    ["2026-05-04", 1950],
    ["2026-05-11", 2000],
    ["2026-05-18", 2050],
    ["2026-05-25", 2100],
    ["2026-06-01", 2050],
    ["2026-06-08", 1980],
    ["2026-06-15", 1900],
    ["2026-06-22", 1850],
    ["2026-06-29", 1800],
    ["2026-07-06", 1785],
    ["2026-07-10", 1785],
  ];

  // 期权上市日期：假设2025年初上市，到期2026-12-25
  const expiryDate = new Date("2026-12-25");
  const STRIKE = 2000;
  const IV = 0.58; // 隐含波动率约58%

  ethPrices.forEach(([dateStr, ethPrice]) => {
    const date = new Date(dateStr);
    const daysLeft = Math.max(1, Math.round((expiryDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)));
    const T = daysLeft / 365;

    // 用简化的Black-Scholes近似计算期权价格
    // 对于虚值Call: 近似 = ethPrice * N(d1) - STRIKE * e^(-r*T) * N(d2)
    // 简化：用时间价值近似
    const moneyness = ethPrice / STRIKE;
    const intrinsic = Math.max(0, ethPrice - STRIKE);
    // 时间价值近似：ATM时最大，深度虚值/实值时减小
    const atmTimeValue = ethPrice * IV * Math.sqrt(T) * 0.4;
    const timeValueFactor = Math.exp(-Math.pow(Math.log(moneyness) / (IV * Math.sqrt(T)), 2) / 2);
    const timeValue = atmTimeValue * timeValueFactor;
    const markPriceUsd = intrinsic + timeValue;

    const annualCost = (markPriceUsd / ethPrice) * (365 / daysLeft) * 100;
    const monthlyCost = annualCost / 12;
    const distToStrike = STRIKE - ethPrice;

    const isSweetSpot = annualCost <= 26 && distToStrike <= 100 && distToStrike >= -200;

    data.push({
      date: dateStr,
      ethPrice,
      markPriceUsd: Math.round(markPriceUsd * 10) / 10,
      annualCost: Math.round(annualCost * 10) / 10,
      monthlyCost: Math.round(monthlyCost * 100) / 100,
      distToStrike: Math.round(distToStrike),
      daysLeft,
      isSweetSpot,
    });
  });

  return data;
}

// ─── 自定义Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs shadow-xl min-w-[200px]">
      <div className="text-gray-400 mb-2 font-sans">{label}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">ETH现价</span>
          <span className="text-white font-sans">${d.ethPrice?.toLocaleString()}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">标记价</span>
          <span className="text-blue-300 font-sans">${d.markPriceUsd}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">年化成本</span>
          <span className={`font-sans font-bold ${d.annualCost <= 24 ? "text-green-400" : "text-red-400"}`}>
            {d.annualCost}%
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">月化成本</span>
          <span className="text-yellow-300 font-sans">{d.monthlyCost}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">距平衡点</span>
          <span className={`font-sans ${d.distToStrike <= 0 ? "text-green-400" : d.distToStrike <= 100 ? "text-yellow-400" : "text-gray-400"}`}>
            {d.distToStrike > 0 ? "+" : ""}{d.distToStrike}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">剩余天数</span>
          <span className="text-gray-300 font-sans">{d.daysLeft}天</span>
        </div>
        {d.isSweetSpot && (
          <div className="mt-2 pt-2 border-t border-green-700 text-green-400 font-bold text-center">
            ✦ 甜蜜窗口
          </div>
        )}
      </div>
    </div>
  );
};

// ─── 主组件 ─────────────────────────────────────────────────────────────────
export default function HistoryAnalysis() {
  const [annualThreshold, setAnnualThreshold] = useState(24);
  const [distThreshold, setDistThreshold] = useState(100);

  const data = useMemo(() => generateMockData(), []);

  // 找出甜蜜窗口区间（连续的isSweetSpot段）
  const sweetSpots = useMemo(() => {
    const filtered = data.filter(
      (d) => d.annualCost <= annualThreshold && d.distToStrike <= distThreshold
    );
    return filtered;
  }, [data, annualThreshold, distThreshold]);

  // 找出甜蜜窗口的连续区间用于ReferenceArea
  const sweetRanges = useMemo(() => {
    const ranges: { x1: string; x2: string }[] = [];
    let start: string | null = null;
    for (let i = 0; i < data.length; i++) {
      const isSweetSpot = data[i].annualCost <= annualThreshold && data[i].distToStrike <= distThreshold;
      if (isSweetSpot && !start) {
        start = data[i].date;
      } else if (!isSweetSpot && start) {
        ranges.push({ x1: start, x2: data[i - 1].date });
        start = null;
      }
    }
    if (start) ranges.push({ x1: start, x2: data[data.length - 1].date });
    return ranges;
  }, [data, annualThreshold, distThreshold]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-30 bg-[var(--ac-bg-base)]/95 backdrop-blur border-b border-[var(--ac-border-subtle)]">
        {/* 第一行：品牌 + 状态 */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--ac-fs-md)] font-sans font-semibold text-[var(--ac-text-primary)] tracking-widest">ETH</span>
            <span className="text-[var(--ac-text-muted)] text-[length:var(--ac-fs-md)]">·</span>
            <span className="text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)]">DERIBIT</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
            <span className="text-[length:var(--ac-fs-md)] font-sans text-green-400">历史数据</span>
          </div>
        </div>
        {/* 第二行：导航 */}
        <div className="flex items-center px-4 pb-1 gap-0 border-b border-[var(--ac-border-subtle)]/40">
          <Link href="/annualized" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)] hover:text-[var(--ac-text-bright)] transition-colors duration-150">分析</Link>
          <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-md)]">|</span>
          <Link href="/history" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-amber-400 hover:text-amber-300 transition-colors duration-150">历史</Link>
          <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-md)]">|</span>
          <Link href="/iv-smile" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)] hover:text-[var(--ac-text-bright)] transition-colors duration-150">IV Smile</Link>
          <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-md)]">|</span>
          <Link href="/product-design" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)] hover:text-[var(--ac-text-bright)] transition-colors duration-150">谷底增筹</Link>
        </div>
      </div>

      <div className="px-2 py-4 space-y-4 w-full">
        {/* 说明卡片 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-3 text-sm text-gray-400 leading-relaxed">
          <span className="text-white font-medium">研究目标：</span>
          在 ETH-25DEC2026-2000-C 这条期权链的历史上，什么时候同时满足
          <span className="text-green-400 font-medium mx-1">年化成本 ≤ {annualThreshold}%</span>
          且
          <span className="text-yellow-400 font-medium mx-1">距平衡点 ≤ ${distThreshold}</span>
          ？绿色高亮区域即为"甜蜜窗口"——此时买入成本低且接近平价，是最佳入场时机。
        </div>

        {/* 阈值控制 */}
        <div className="flex flex-wrap gap-4 bg-gray-900 border border-gray-800 rounded-xl px-3 py-3">
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm whitespace-nowrap">年化上限</span>
            <input
              type="range" min={15} max={40} step={1} value={annualThreshold}
              onChange={(e) => setAnnualThreshold(Number(e.target.value))}
              className="w-32 accent-green-500"
            />
            <span className="text-green-400 font-sans font-bold w-12">{annualThreshold}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm whitespace-nowrap">距平衡点上限</span>
            <input
              type="range" min={0} max={500} step={50} value={distThreshold}
              onChange={(e) => setDistThreshold(Number(e.target.value))}
              className="w-32 accent-yellow-500"
            />
            <span className="text-yellow-400 font-sans font-bold w-16">${distThreshold}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-gray-400">甜蜜窗口共</span>
            <span className="text-green-400 font-bold">{sweetSpots.length}</span>
            <span className="text-gray-400">个数据点</span>
          </div>
        </div>

        {/* 主图表：年化成本 + ETH现价 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-1 py-3">
          <div className="text-sm text-gray-400 mb-3 px-2">
            <span className="text-white font-medium">年化成本 vs ETH现价</span>
            <span className="ml-3 text-xs">绿色区域 = 甜蜜窗口（年化≤{annualThreshold}% 且 距平衡点≤${distThreshold}）</span>
          </div>
          <div className="overflow-x-auto -mx-1">
          <div style={{ width: 1400, minWidth: '100%' }}>
          <ComposedChart width={1400} height={280} data={data} margin={{ top: 8, right: 50, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickFormatter={(v) => v.slice(2, 7)}
                interval={7}
              />
              {/* 左轴：年化% */}
              <YAxis
                yAxisId="annual"
                orientation="left"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 80]}
                width={45}
              />
              {/* 右轴：ETH现价 */}
              <YAxis
                yAxisId="eth"
                orientation="right"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickFormatter={(v) => `$${v.toLocaleString()}`}
                domain={[1000, 4500]}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, color: "#9ca3af" }}
              />

              {/* 甜蜜窗口高亮 */}
              {sweetRanges.map((r, i) => (
                <ReferenceArea
                  key={i}
                  yAxisId="annual"
                  x1={r.x1}
                  x2={r.x2}
                  fill="#16a34a"
                  fillOpacity={0.15}
                  stroke="#16a34a"
                  strokeOpacity={0.3}
                />
              ))}

              {/* 24%参考线 */}
              <ReferenceLine
                yAxisId="annual"
                y={annualThreshold}
                stroke="#22c55e"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{ value: `${annualThreshold}%`, fill: "#22c55e", fontSize: 11, position: "insideTopLeft" }}
              />

              {/* K=2000参考线（ETH轴） */}
              <ReferenceLine
                yAxisId="eth"
                y={2000}
                stroke="#f59e0b"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{ value: "K=2000", fill: "#f59e0b", fontSize: 11, position: "insideTopRight" }}
              />

              {/* 年化成本线 */}
              <Line
                yAxisId="annual"
                type="monotone"
                dataKey="annualCost"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                name="年化成本(%)"
                activeDot={{ r: 4, fill: "#22c55e" }}
              />

              {/* ETH现价线 */}
              <Line
                yAxisId="eth"
                type="monotone"
                dataKey="ethPrice"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                name="ETH现价($)"
                activeDot={{ r: 4, fill: "#60a5fa" }}
              />
          </ComposedChart>
          </div>{/* width div */}
          </div>{/* overflow div */}
        </div>{/* card div */}

        {/* 副图表：距平衡点 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl px-1 py-3">
          <div className="text-sm text-gray-400 mb-3 px-2">
            <span className="text-white font-medium">距平衡点（K=2000 − ETH现价）</span>
            <span className="ml-3 text-xs">正值=虚值（需涨），负值=实值（已在价内），黄线=$100</span>
          </div>
          <div className="overflow-x-auto -mx-1">
          <div style={{ width: 1400, minWidth: '100%' }}>
          <ComposedChart width={1400} height={160} data={data} margin={{ top: 8, right: 50, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickFormatter={(v) => v.slice(2, 7)}
                interval={7}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickFormatter={(v) => `$${v}`}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* 甜蜜窗口高亮 */}
              {sweetRanges.map((r, i) => (
                <ReferenceArea
                  key={i}
                  x1={r.x1}
                  x2={r.x2}
                  fill="#16a34a"
                  fillOpacity={0.15}
                  stroke="#16a34a"
                  strokeOpacity={0.3}
                />
              ))}

              {/* 0线（平价） */}
              <ReferenceLine y={0} stroke="#ffffff" strokeDasharray="4 2" strokeOpacity={0.3}
                label={{ value: "平价", fill: "#9ca3af", fontSize: 10, position: "insideTopLeft" }} />

              {/* 阈值线 */}
              <ReferenceLine y={distThreshold} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={1.5}
                label={{ value: `$${distThreshold}`, fill: "#f59e0b", fontSize: 11, position: "insideTopRight" }} />

              <Bar dataKey="distToStrike" name="距平衡点($)"
                fill="#f59e0b" fillOpacity={0.6} radius={[2, 2, 0, 0]} />
          </ComposedChart>
          </div>{/* width div */}
          </div>{/* overflow div */}
        </div>{/* card div */}

        {/* 甜蜜窗口统计 */}
        {sweetSpots.length > 0 && (
          <div className="bg-gray-900 border border-green-900 rounded-xl px-2 py-3">
            <div className="text-sm font-medium text-green-400 mb-3">
              ✦ 甜蜜窗口时段（年化≤{annualThreshold}% 且 距平衡点≤${distThreshold}）
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 pr-4">日期</th>
                    <th className="text-right pr-4">ETH现价</th>
                    <th className="text-right pr-4">标记价</th>
                    <th className="text-right pr-4">年化</th>
                    <th className="text-right pr-4">月化</th>
                    <th className="text-right pr-4">距平衡点</th>
                    <th className="text-right">剩余天数</th>
                  </tr>
                </thead>
                <tbody>
                  {sweetSpots.map((d) => (
                    <tr key={d.date} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-1.5 pr-4 font-sans text-gray-300">{d.date}</td>
                      <td className="text-right pr-4 font-sans text-blue-300">${d.ethPrice.toLocaleString()}</td>
                      <td className="text-right pr-4 font-sans text-gray-300">${d.markPriceUsd}</td>
                      <td className="text-right pr-4 font-sans text-green-400 font-bold">{d.annualCost}%</td>
                      <td className="text-right pr-4 font-sans text-yellow-400">{d.monthlyCost}%</td>
                      <td className={`text-right pr-4 font-sans ${d.distToStrike <= 0 ? "text-green-400" : "text-yellow-400"}`}>
                        {d.distToStrike > 0 ? "+" : ""}{d.distToStrike}
                      </td>
                      <td className="text-right font-sans text-gray-400">{d.daysLeft}天</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-600 text-center pb-4">
          * 当前为模拟数据，用于展示图表样式。接入真实历史数据后图表将自动更新。
        </div>
      </div>
    </div>
  );
}

