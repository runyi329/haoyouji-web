/**
 * DXY 美元指数详情页
 * 与 BeDataPage（美股/数字币）风格完全一致：
 *   - 蓝色渐变头部 + 左右分栏信息卡片 + AI 三段式分析
 *   - Tab1: 数据分析（六种成分货币权重图 + AI分析 + 连涨连跌统计 + 频率分布）
 *   - Tab2: 日线历史（两位年份、固定宽度、每页100条）
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList, ReferenceLine
} from "recharts";

// ── 颜色常量 ──────────────────────────────────────────────────────────────────
const RED = "#D32F2F";
const GREEN_A = "#388E3C";
const MUTED = "#888";
const CARD = "#fff";
const BG = "#f5f5f5";

// ── DXY 六种成分货币权重 ──────────────────────────────────────────────────────
const DXY_COMPONENTS = [
  { name: "欧元 EUR",       weight: 57.6, color: "#1565C0" },
  { name: "日元 JPY",       weight: 13.6, color: "#0288D1" },
  { name: "英镑 GBP",       weight: 11.9, color: "#0097A7" },
  { name: "加元 CAD",       weight:  9.1, color: "#00838F" },
  { name: "瑞典克朗 SEK",   weight:  4.2, color: "#006064" },
  { name: "瑞士法郎 CHF",   weight:  3.6, color: "#004D40" },
];

const PAGE_SIZE = 100;
const TABS = [
  { key: "analysis", label: "数据分析" },
  { key: "data",     label: "日线历史" },
];

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function formatPrice(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toFixed(3);
}

function formatPct(val: number | null | undefined): string {
  if (val == null) return "-";
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

// ── 连涨连跌统计 ──────────────────────────────────────────────────────────────
function calcStreakFromItems(data: { changePct: number | null }[]): {
  upStreakMap: Record<number, number>;
  downStreakMap: Record<number, number>;
  maxUpStreak: number;
  maxDownStreak: number;
} {
  const upMap: Record<number, number> = {};
  const downMap: Record<number, number> = {};
  let streak = 0;
  let dir: "up" | "down" | "flat" | null = null;
  for (const item of data) {
    const pct = item.changePct;
    if (pct == null) continue;
    const d = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    if (d === dir) {
      streak++;
    } else {
      if (dir !== null && streak > 0) {
        if (dir === "up") upMap[streak] = (upMap[streak] || 0) + 1;
        else if (dir === "down") downMap[streak] = (downMap[streak] || 0) + 1;
      }
      streak = 1;
      dir = d;
    }
  }
  if (dir !== null && streak > 0) {
    if (dir === "up") upMap[streak] = (upMap[streak] || 0) + 1;
    else if (dir === "down") downMap[streak] = (downMap[streak] || 0) + 1;
  }
  const maxUp = Math.max(0, ...Object.keys(upMap).map(Number));
  const maxDown = Math.max(0, ...Object.keys(downMap).map(Number));
  return { upStreakMap: upMap, downStreakMap: downMap, maxUpStreak: maxUp, maxDownStreak: maxDown };
}

// ── 连涨连跌统计面板 ──────────────────────────────────────────────────────────
function StreakStatsPanel({ allData }: { allData: { date: string; changePct: number | null }[] }) {
  const [streakTab, setStreakTab] = useState<30 | 60 | 90 | 180 | "all">(60);
  const allSorted = allData;
  const recentData30  = useMemo(() => calcStreakFromItems(allSorted.slice(-30)),  [allSorted]);
  const recentData60  = useMemo(() => calcStreakFromItems(allSorted.slice(-60)),  [allSorted]);
  const recentData90  = useMemo(() => calcStreakFromItems(allSorted.slice(-90)),  [allSorted]);
  const recentData180 = useMemo(() => calcStreakFromItems(allSorted.slice(-180)), [allSorted]);
  const allStreakData  = useMemo(() => calcStreakFromItems(allSorted),             [allSorted]);

  const curData = streakTab === "all" ? allStreakData
    : streakTab === 30  ? recentData30
    : streakTab === 60  ? recentData60
    : streakTab === 90  ? recentData90
    : recentData180;

  const { upStreakMap, downStreakMap, maxUpStreak, maxDownStreak } = curData;
  const maxStreak = Math.max(maxUpStreak, maxDownStreak);

  return (
    <div style={{ background: CARD, borderTop: `8px solid ${BG}` }}>
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: MUTED }}>连涨 / 连跌统计</span>
        <div className="flex items-center gap-1">
          {([30, 60, 90, 180, "all"] as const).map(n => (
            <button
              key={n}
              onClick={() => setStreakTab(n)}
              className="text-xs px-2 py-0.5"
              style={{
                background: streakTab === n ? RED : "#F0F0F0",
                color: streakTab === n ? "#fff" : MUTED,
                fontWeight: streakTab === n ? 700 : 400,
                borderRadius: 2,
              }}
            >{n === "all" ? "全量" : `${n}天`}</button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-1" style={{ display: "grid", gridTemplateColumns: "1fr 36px 1fr", gap: 0 }}>
        <span className="text-xs font-medium text-right pr-2" style={{ color: RED }}>连涨次数</span>
        <span className="text-xs font-medium text-center" style={{ color: MUTED }}>天数</span>
        <span className="text-xs font-medium text-left pl-2" style={{ color: GREEN_A }}>连跌次数</span>
      </div>
      {Array.from({ length: maxStreak }, (_, i) => i + 1).map(n => {
        const upCnt   = upStreakMap[n]   || 0;
        const downCnt = downStreakMap[n] || 0;
        const maxCnt  = Math.max(...Array.from({ length: maxStreak }, (_, i) => Math.max(upStreakMap[i+1]||0, downStreakMap[i+1]||0)), 1);
        const BAR_MAX = 80;
        const upW   = upCnt   > 0 ? Math.max(Math.round((upCnt   / maxCnt) * BAR_MAX), 4) : 0;
        const downW = downCnt > 0 ? Math.max(Math.round((downCnt / maxCnt) * BAR_MAX), 4) : 0;
        return (
          <div key={n} style={{ display: "grid", gridTemplateColumns: "1fr 36px 1fr", gap: 0, borderTop: `1px solid ${BG}`, padding: "5px 16px", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              <span className="text-xs font-bold" style={{ color: upCnt > 0 ? RED : MUTED, minWidth: 28, textAlign: "right" }}>
                {upCnt > 0 ? `${upCnt}次` : "-"}
              </span>
              <div style={{ width: upW, height: 8, background: RED, borderRadius: "2px 0 0 2px", opacity: 0.85, flexShrink: 0 }} />
            </div>
            <span className="text-xs font-semibold text-center" style={{ color: MUTED }}>{n}天</span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 4 }}>
              <div style={{ width: downW, height: 8, background: GREEN_A, borderRadius: "0 2px 2px 0", opacity: 0.85, flexShrink: 0 }} />
              <span className="text-xs font-bold" style={{ color: downCnt > 0 ? GREEN_A : MUTED, minWidth: 28 }}>
                {downCnt > 0 ? `${downCnt}次` : "-"}
              </span>
            </div>
          </div>
        );
      })}
      {maxStreak === 0 && <div className="px-4 py-3 text-xs" style={{ color: MUTED }}>暂无连涨/连跌数据</div>}
      {maxStreak > 0 && (
        <div className="px-4 py-2 text-xs" style={{ color: MUTED }}>
          最长连涨{maxUpStreak}天 · 最长连跌{maxDownStreak}天
          {streakTab === "all"
            ? <span style={{ marginLeft: 6 }}>（全历史 {allSorted.length} 天）</span>
            : <span style={{ marginLeft: 6 }}>（近{streakTab}天）</span>
          }
        </div>
      )}
    </div>
  );
}

// ── 涨跌幅频率分布图 ──────────────────────────────────────────────────────────
function ChangePctDistChart({ allData }: { allData: { date: string; changePct: number | null }[] }) {
  const distData = useMemo(() => {
    const bucketMap: Record<number, number> = {};
    for (const item of allData) {
      const pct = item.changePct;
      if (pct == null) continue;
      const bucket = pct >= 0 ? Math.floor(pct) : Math.ceil(pct) - 1;
      const clamped = Math.max(-10, Math.min(10, bucket));
      bucketMap[clamped] = (bucketMap[clamped] || 0) + 1;
    }
    const keys = Object.keys(bucketMap).map(Number);
    if (keys.length === 0) return [];
    const minB = Math.min(-1, ...keys);
    const maxB = Math.max(0, ...keys);
    const result = [];
    for (let b = minB; b <= maxB; b++) {
      const cnt = bucketMap[b] || 0;
      const label = b === 0 ? "0%" : b > 0 ? `+${b}%` : `${b}%`;
      result.push({ bucket: b, label, count: cnt, isUp: b >= 0, isDown: b < 0 });
    }
    return result;
  }, [allData]);

  const totalDays = allData.filter(d => d.changePct != null).length;
  const upDays    = allData.filter(d => d.changePct != null && d.changePct > 0).length;
  const downDays  = allData.filter(d => d.changePct != null && d.changePct < 0).length;

  return (
    <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-700">涨跌幅频率分布</span>
          <span className="text-xs text-gray-400 ml-2">每1%一个区间 · 共{totalDays}天</span>
        </div>
        <div className="flex gap-3 text-xs">
          <span style={{ color: RED }}>↑{upDays}天</span>
          <span style={{ color: GREEN_A }}>↓{downDays}天</span>
        </div>
      </div>
      <div style={{ height: 180, padding: "8px 4px 4px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#9CA3AF" }} interval={0} />
            <YAxis tick={{ fontSize: 8, fill: "#9CA3AF" }} />
            <Tooltip
              formatter={(val: number) => [`${val}天`, "出现次数"]}
              contentStyle={{ fontSize: 11 }}
            />
            <ReferenceLine x="0%" stroke="#9CA3AF" strokeDasharray="3 3" />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {distData.map((entry, idx) => (
                <Cell key={idx} fill={entry.isUp ? RED : GREEN_A} opacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 成分货币权重图 ─────────────────────────────────────────────────────────────
function ComponentWeightChart() {
  const RADIAN = Math.PI / 180;
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (percent < 0.05) return null;
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700}>
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    );
  };

  return (
    <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">成分货币权重</span>
        <span className="text-xs text-gray-400 ml-2">ICE 官方权重（固定）</span>
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={DXY_COMPONENTS}
              dataKey="weight"
              nameKey="name"
              cx="45%"
              cy="50%"
              outerRadius={80}
              innerRadius={36}
              labelLine={false}
              label={renderCustomLabel}
            >
              {DXY_COMPONENTS.map((entry, idx) => (
                <Cell key={idx} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val: number) => [`${val}%`, "权重"]}
              contentStyle={{ fontSize: 11 }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              iconType="circle"
              iconSize={8}
              formatter={(value) => <span style={{ fontSize: 10, color: "#374151" }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* 权重明细表 */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-1">
          {DXY_COMPONENTS.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 py-1">
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 9, color: "#374151", fontWeight: 600 }}>{c.name.split(" ")[1]}</div>
                <div style={{ fontSize: 9, color: "#9CA3AF" }}>{c.weight}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 主页面组件 ────────────────────────────────────────────────────────────────
export default function DXYDetailPage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("analysis");
  const [page, setPage] = useState(1);
  const [aiExpanded, setAiExpanded] = useState(false);

  const SYMBOL = "DXY";

  // ── 数据查询 ────────────────────────────────────────────────────────────────
  const { data: metaData, isLoading: metaLoading } = trpc.cryptoData.getMeta.useQuery({ symbol: SYMBOL });
  const { data: statsData, isLoading: statsLoading } = trpc.cryptoData.getStats.useQuery({ symbol: SYMBOL });
  const { data: klinesData, isLoading: klinesLoading, isFetching } = trpc.cryptoData.getKlines.useQuery(
    { symbol: SYMBOL, page, pageSize: PAGE_SIZE },
    { keepPreviousData: true } as any
  );
  const { data: allChangePcts, isLoading: changePctsLoading } = trpc.cryptoData.getAllChangePcts.useQuery(
    { symbol: SYMBOL }
  );

  // AI 分析
  const latestClose     = klinesData?.rows?.[0]?.close ?? null;
  const latestChangePct = klinesData?.rows?.[0]?.changePct ?? null;
  const total           = metaData?.total ?? 0;
  const oldestDate      = metaData?.oldestDate ?? "";
  const latestDate      = metaData?.latestDate ?? "";

  const { data: aiData, isLoading: aiLoading } = trpc.cryptoData.getAIAnalysis.useQuery(
    {
      symbol: SYMBOL,
      stockName: "美元指数 DXY",
      latestClose:     latestClose     ?? undefined,
      latestChangePct: latestChangePct ?? undefined,
      total,
      oldestDate,
      latestDate,
    },
    {
      enabled: !metaLoading && !klinesLoading,
      staleTime: 10 * 60 * 1000,
    }
  );

  // ── 派生数据 ────────────────────────────────────────────────────────────────
  const rows       = klinesData?.rows ?? [];
  const totalRows  = klinesData?.total ?? 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const stats      = statsData;

  const pctColor = (latestChangePct ?? 0) >= 0 ? "#D32F2F" : "#16A34A";
  const analysisLoading = statsLoading || changePctsLoading;

  // ── 渲染 ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#EEF2F8" }}>

      {/* ── 蓝色渐变头部 ── */}
      <div style={{
        background: "linear-gradient(160deg, #1565C0 0%, #0D47A1 60%, #0A3880 100%)",
        padding: "10px 14px 12px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>

        {/* 第一行：返回 + 标题 + 更新按钮 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => setLocation(-1 as any)}
            style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.18)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <ChevronLeft style={{ width: 16, height: 16, color: "#fff" }} />
          </button>

          {/* DXY 图标（美元符号） */}
          <div style={{
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(255,255,255,0.25)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            fontSize: 14, fontWeight: 800, color: "#fff",
          }}>$</div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0, lineHeight: 1.2 }}>
              美元指数 DXY
            </p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.3 }}>
              ICE · 美元综合强弱指数
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
          >
            更新
          </button>
        </div>

        {/* 第二行：左右分栏信息卡片 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          {/* 左列：静态基本信息 */}
          <div style={{ borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: 0.5, marginBottom: 5, textTransform: "uppercase" }}>基本信息</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                ["数据条数", metaLoading ? null : `${total.toLocaleString()}条`],
                ["起始日期", metaLoading ? null : oldestDate],
                ["最新日期", metaLoading ? null : latestDate],
                ["运营机构", "ICE（洲际交易所）"],
              ].map(([label, val], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 18 }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>{label}</span>
                  {val == null
                    ? <div style={{ width: 52, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                    : <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{val}</span>
                  }
                </div>
              ))}
            </div>
          </div>

          {/* 右列：动态行情 */}
          <div style={{ borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: 0.5, marginBottom: 5, textTransform: "uppercase" }}>最新行情</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {/* 最新收盘 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 18 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>最新收盘</span>
                {klinesLoading
                  ? <div style={{ width: 52, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                  : <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{formatPrice(latestClose)}</span>
                }
              </div>
              {/* 当日涨跌 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 18 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>当日涨跌</span>
                {klinesLoading
                  ? <div style={{ width: 40, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                  : <span style={{ fontSize: 12, fontWeight: 700, color: (latestChangePct ?? 0) >= 0 ? "#FF8A80" : "#69F0AE" }}>
                      {formatPct(latestChangePct)}
                    </span>
                }
              </div>
              {/* 涨跌天数 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 18 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>涨跌天数</span>
                {statsLoading
                  ? <div style={{ width: 52, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
                      {stats
                        ? <span><span style={{ color: "#FF8A80" }}>↑{stats.upDays}</span><span style={{ color: "rgba(255,255,255,0.4)", margin: "0 2px" }}>/</span><span style={{ color: "#69F0AE" }}>↓{stats.downDays}</span></span>
                        : "—"
                      }
                    </span>
                }
              </div>
              {/* 涨跌比 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 18 }}>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>涨跌比</span>
                {statsLoading
                  ? <div style={{ width: 52, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>
                      {stats ? `${stats.upPct}% / ${stats.downPct}%` : "—"}
                    </span>
                }
              </div>
            </div>
          </div>
        </div>

        {/* 第三行：AI 三段式分析（可折叠） */}
        <div
          onClick={() => setAiExpanded(v => !v)}
          style={{
            borderRadius: 12,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.18)",
            padding: "9px 12px",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 0.3 }}>
                ✨ AI × 美元指数 DXY
              </span>
              {aiLoading && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>分析中...</span>}
            </div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{aiExpanded ? "▲ 收起" : "▼ 展开"}</span>
          </div>

          {aiExpanded && (
            <div style={{ marginTop: 10 }}>
              {aiLoading ? (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "8px 0" }}>AI 分析生成中...</div>
              ) : aiData ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "📈 趋势判断", content: aiData.trend },
                    { label: "🎯 关键位置", content: aiData.keyLevel },
                    { label: "💡 投资提示", content: aiData.tip },
                  ].filter(s => s.content).map((section, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>{section.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>{section.content}</div>
                    </div>
                  ))}
                  {!aiData.trend && aiData.analysis && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>{aiData.analysis}</div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "8px 0" }}>暂无分析</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tab 切换 ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #D8E0EC", display: "flex", flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 500,
              color: activeTab === t.key ? "#1565C0" : "#9CA3AF",
              borderBottom: activeTab === t.key ? "2px solid #1565C0" : "2px solid transparent",
              background: "none", border: "none",
              cursor: "pointer", transition: "color 0.2s",
            }}
          >
            {t.key === "data"
              ? `日线历史${total > 0 ? `（${total}条）` : ""}`
              : t.label}
          </button>
        ))}
      </div>

      {/* ── 数据分析 Tab ── */}
      {activeTab === "analysis" && (
        <div className="flex-1 overflow-auto pb-6">
          {analysisLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">计算中...</div>
          ) : !stats ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">暂无数据</div>
          ) : (
            <div className="pt-3 space-y-0">

              {/* 涨跌天数概览 */}
              <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
                <div className="px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">涨跌天数统计</span>
                  <span className="text-xs text-gray-400 ml-2">共 {stats.total} 天</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-gray-100">
                  <div className="flex flex-col items-center py-4">
                    <span className="text-2xl font-bold text-red-500">{stats.upDays}</span>
                    <span className="text-xs text-gray-400 mt-1">上涨天数</span>
                    <span className="text-xs text-red-400 font-medium mt-0.5">{stats.upPct}%</span>
                  </div>
                  <div className="flex flex-col items-center py-4">
                    <span className="text-2xl font-bold text-green-600">{stats.downDays}</span>
                    <span className="text-xs text-gray-400 mt-1">下跌天数</span>
                    <span className="text-xs text-green-500 font-medium mt-0.5">{stats.downPct}%</span>
                  </div>
                  <div className="flex flex-col items-center py-4">
                    <span className="text-2xl font-bold text-gray-400">{stats.flatDays}</span>
                    <span className="text-xs text-gray-400 mt-1">平盘天数</span>
                    <span className="text-xs text-gray-400 font-medium mt-0.5">
                      {stats.total > 0 ? (stats.flatDays / stats.total * 100).toFixed(2) : 0}%
                    </span>
                  </div>
                </div>
                <div className="mx-4 mb-3 h-2 rounded-full overflow-hidden flex">
                  <div className="bg-red-400" style={{ width: `${stats.upPct}%` }} />
                  <div className="bg-gray-200" style={{ width: `${(stats.flatDays / stats.total * 100).toFixed(2)}%` }} />
                  <div className="bg-green-500 flex-1" />
                </div>
              </div>

              {/* 最长连涨/连跌 */}
              <div className="grid grid-cols-2 gap-3 mx-3 mb-3">
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col items-center">
                  <span className="text-xs text-gray-400 mb-1">最长连涨</span>
                  <span className="text-3xl font-bold text-red-500">{stats.maxConsecUp}</span>
                  <span className="text-xs text-gray-400 mt-1">天</span>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col items-center">
                  <span className="text-xs text-gray-400 mb-1">最长连跌</span>
                  <span className="text-3xl font-bold text-green-600">{stats.maxConsecDown}</span>
                  <span className="text-xs text-gray-400 mt-1">天</span>
                </div>
              </div>

              {/* 成分货币权重图 */}
              <ComponentWeightChart />

              {/* 连涨/连跌统计 */}
              {allChangePcts && allChangePcts.length > 0 && (
                <div className="bg-white border border-gray-200 mx-3 rounded-xl overflow-hidden mb-3">
                  <StreakStatsPanel allData={allChangePcts} />
                </div>
              )}

              {/* 涨跌幅频率分布图 */}
              {allChangePcts && allChangePcts.length > 0 && (
                <ChangePctDistChart allData={allChangePcts} />
              )}

              {/* DXY 与主要资产相关性说明 */}
              <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
                <div className="px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">与主要资产相关性</span>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {[
                    { asset: "黄金 XAU/USD", corr: "-0.81", desc: "强负相关：美元强则黄金承压", color: "#D32F2F" },
                    { asset: "美股 S&P500",  corr: "-0.42", desc: "弱负相关：美元强则美股承压", color: "#E65100" },
                    { asset: "原油 WTI",     corr: "-0.55", desc: "中负相关：原油以美元计价", color: "#F57F17" },
                    { asset: "人民币 CNY",   corr: "-0.72", desc: "强负相关：美元强则人民币贬值", color: "#1565C0" },
                    { asset: "比特币 BTC",   corr: "-0.38", desc: "弱负相关：避险情绪驱动", color: "#6A1B9A" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                      <div>
                        <span className="text-xs font-semibold text-gray-700">{item.asset}</span>
                        <span className="text-xs text-gray-400 ml-2">{item.desc}</span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: item.color }}>{item.corr}</span>
                    </div>
                  ))}
                </div>
                <div className="px-4 pb-3 text-xs text-gray-400">注：相关系数为历史统计参考，实际相关性随市场环境变化</div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* ── 日线历史 Tab ── */}
      {activeTab === "data" && (
        <div className="flex-1 overflow-auto">
          {klinesLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-2">
              <span>暂无数据</span>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "15%" }} />
                <col style={{ width: "14.2%" }} />
                <col style={{ width: "14.2%" }} />
                <col style={{ width: "14.2%" }} />
                <col style={{ width: "14.2%" }} />
                <col style={{ width: "14.2%" }} />
                <col style={{ width: "14%" }} />
              </colgroup>
              <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                <tr style={{ background: "#F3F4F6" }}>
                  {["日期","开盘","收盘","最高","最低","涨跌%","振幅%"].map(h => (
                    <th key={h} style={{ border: "1px solid #D1D5DB", padding: "6px 2px", textAlign: "center", color: "#6B7280", fontWeight: 500, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const up    = row.changePct != null && row.changePct > 0;
                  const down  = row.changePct != null && row.changePct < 0;
                  const color = up ? "#EF4444" : down ? "#16A34A" : "#9CA3AF";
                  const rowBg = idx % 2 === 0 ? "#fff" : "#F9FAFB";
                  const shortDate = (() => {
                    const d = row.date || "";
                    const parts = d.replace(/-/g, "/").split("/");
                    if (parts.length === 3) {
                      const yy = parts[0].length === 4 ? parts[0].slice(-2) : parts[0];
                      return `${yy}/${parts[1]}/${parts[2]}`;
                    }
                    return d;
                  })();
                  return (
                    <tr key={row.date} style={{ background: rowBg }}>
                      <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color: "#6B7280", fontFamily: "monospace", fontSize: 10, whiteSpace: "nowrap", overflow: "hidden" }}>{shortDate}</td>
                      <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color: "#374151", fontFamily: "monospace", fontSize: 10 }}>{formatPrice(row.open)}</td>
                      <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color, fontFamily: "monospace", fontSize: 10, fontWeight: 600 }}>{formatPrice(row.close)}</td>
                      <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color: "#4B5563", fontFamily: "monospace", fontSize: 10 }}>{formatPrice(row.high)}</td>
                      <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color: "#4B5563", fontFamily: "monospace", fontSize: 10 }}>{formatPrice(row.low)}</td>
                      <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color, fontFamily: "monospace", fontSize: 10 }}>{formatPct(row.changePct)}</td>
                      <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color: "#6B7280", fontFamily: "monospace", fontSize: 10 }}>
                        {row.amplitudePct != null ? row.amplitudePct.toFixed(2) + "%" : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 分页（仅日线历史 Tab） ── */}
      {activeTab === "data" && totalPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
            className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs text-gray-400">
            第 {page} / {totalPages} 页 · 共 {totalRows} 条
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isFetching}
            className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
