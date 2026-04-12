/**
 * LedgerAIDatabase.tsx
 * A股全景仪表盘 — 专业金融分析页面
 * 路径: /ledger/:id/ai-database
 */
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft, RefreshCw, TrendingUp, BarChart2, Activity, Globe, ChevronRight
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell
} from "recharts";

// ─── 颜色常量 ───────────────────────────────────────────────
const C = {
  up: "#ef4444",
  down: "#22c55e",
  flat: "#94a3b8",
  accent: "#f59e0b",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  bg: "#0f172a",
  card: "#1e293b",
  border: "#334155",
  text: "#f1f5f9",
  muted: "#94a3b8",
  dim: "#475569",
};

type Market = "all" | "SH" | "SZ" | "GEM" | "STAR";
const MARKETS: { key: Market; label: string }[] = [
  { key: "all", label: "全市场" },
  { key: "SH", label: "沪市" },
  { key: "SZ", label: "深市" },
  { key: "GEM", label: "创业板" },
  { key: "STAR", label: "科创板" },
];

type ThemeKey = "survival" | "valuation" | "risefall" | "macro";
const THEMES: { key: ThemeKey; label: string; sub: string; icon: typeof TrendingUp; color: string }[] = [
  { key: "survival", label: "生存分析", sub: "上市至今盈亏全景", icon: TrendingUp, color: C.up },
  { key: "valuation", label: "估值分布", sub: "PE / PB / 市值结构", icon: BarChart2, color: C.accent },
  { key: "risefall", label: "涨跌统计", sub: "今日及近期涨跌分布", icon: Activity, color: C.blue },
  { key: "macro", label: "宏观数据", sub: "M2 / CPI / LPR / 北向", icon: Globe, color: C.purple },
];

function pct(n: number, total: number) {
  if (!total) return "0.0";
  return ((n / total) * 100).toFixed(1);
}
function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("zh-CN");
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function Skeleton({ h = "h-4", w = "w-full" }: { h?: string; w?: string }) {
  return <div className={`${h} ${w} rounded animate-pulse`} style={{ background: "#334155" }} />;
}

function BarLabel({ x, y, width, value }: any) {
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} fill={C.muted} fontSize={9} textAnchor="middle">
      {value}
    </text>
  );
}

// ─── 生存分析 ──────────────────────────────────────────────
function SurvivalPanel({ market }: { market: Market }) {
  const { data, isLoading } = trpc.aiDashboardSurvival.useQuery({ market });

  if (isLoading) return (
    <div className="space-y-4 p-4">
      <Skeleton h="h-32" /><Skeleton h="h-48" /><Skeleton h="h-32" />
    </div>
  );
  if (!data || data.total === 0) return (
    <div className="flex flex-col items-center justify-center py-16" style={{ color: C.dim }}>
      <BarChart2 className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm">数据同步中，请稍后刷新</p>
    </div>
  );

  const abovePct = parseFloat(pct(data.above, data.total));
  const belowPct = parseFloat(pct(data.below, data.total));
  const eraOrder = ["2000年前", "2000-2009", "2010-2014", "2015-2019", "2020至今"];
  const eraData = eraOrder.filter(e => data.byEra[e]).map(e => {
    const d = data.byEra[e];
    return { name: e.replace("2000年前", "<2000"), 胜率: parseFloat(pct(d.above, d.total)), 上涨: d.above, 下跌: d.below, total: d.total };
  });

  return (
    <div className="space-y-4 px-4 pb-6 pt-3">
      <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: "#1e293b" }}>
        <p className="text-xs mb-3" style={{ color: C.muted }}>
          统计范围：全部在市 A 股（共 <span className="font-semibold" style={{ color: C.text }}>{fmt(data.total)}</span> 只）
        </p>
        <div className="flex rounded-full overflow-hidden h-5 mb-2">
          <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${abovePct}%`, background: C.up }}>
            {abovePct > 8 ? `${abovePct}%` : ""}
          </div>
          <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${belowPct}%`, background: C.down }}>
            {belowPct > 8 ? `${belowPct}%` : ""}
          </div>
          <div className="flex-1" style={{ background: C.dim }} />
        </div>
        <div className="flex justify-between text-xs mt-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: C.up }} />
            <span style={{ color: C.muted }}>高于上市首日</span>
            <span className="font-bold ml-1" style={{ color: "#f87171" }}>{fmt(data.above)} 只</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: C.down }} />
            <span style={{ color: C.muted }}>低于上市首日</span>
            <span className="font-bold ml-1" style={{ color: "#4ade80" }}>{fmt(data.below)} 只</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "历史胜率", value: `${abovePct}%`, color: C.up },
          { label: "历史败率", value: `${belowPct}%`, color: C.down },
          { label: "持平", value: `${pct(data.equal, data.total)}%`, color: C.flat },
        ].map(item => (
          <div key={item.label} className="rounded-lg border p-3 text-center" style={{ borderColor: C.border, background: "#1e293b" }}>
            <p className="text-[10px] mb-1" style={{ color: C.muted }}>{item.label}</p>
            <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: "#1e293b" }}>
        <p className="text-xs mb-3 font-medium" style={{ color: C.muted }}>按上市年代 — 历史胜率（%）</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={eraData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 9 }} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} labelStyle={{ color: C.text }} formatter={(v: any) => [`${v}%`, "胜率"]} />
            <ReferenceLine y={50} stroke={C.flat} strokeDasharray="4 2" />
            <Bar dataKey="胜率" radius={[3, 3, 0, 0]} label={<BarLabel />}>
              {eraData.map((entry, i) => <Cell key={i} fill={entry.胜率 >= 50 ? C.up : C.down} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="grid grid-cols-4 text-[10px] px-3 py-2 border-b" style={{ color: C.muted, borderColor: C.border, background: "#0f172a" }}>
          <span>年代</span><span className="text-center">总数</span>
          <span className="text-center" style={{ color: "#f87171" }}>上涨</span>
          <span className="text-center" style={{ color: "#4ade80" }}>下跌</span>
        </div>
        {eraData.map((row, i) => (
          <div key={i} className="grid grid-cols-4 text-xs px-3 py-2 border-b last:border-0" style={{ borderColor: C.border, background: "#1e293b" }}>
            <span style={{ color: C.muted }}>{row.name}</span>
            <span className="text-center" style={{ color: C.text }}>{row.total}</span>
            <span className="text-center" style={{ color: "#f87171" }}>{row.上涨}</span>
            <span className="text-center" style={{ color: "#4ade80" }}>{row.下跌}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 估值分布 ──────────────────────────────────────────────
function ValuationPanel({ market }: { market: Market }) {
  const { data, isLoading } = trpc.aiDashboardValuation.useQuery({ market });
  const [subTab, setSubTab] = useState<"pe" | "pb" | "mv">("pe");

  if (isLoading) return <div className="space-y-4 p-4"><Skeleton h="h-16" /><Skeleton h="h-48" /><Skeleton h="h-32" /></div>;
  if (!data || !data.latestDate) return (
    <div className="flex flex-col items-center justify-center py-16" style={{ color: C.dim }}>
      <BarChart2 className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm">数据同步中，请稍后刷新</p>
    </div>
  );

  const chartData = subTab === "pe" ? data.peDistribution : subTab === "pb" ? data.pbDistribution : data.mvDistribution;
  const COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#c084fc", "#e879f9"];

  return (
    <div className="space-y-4 px-4 pb-6 pt-3">
      <p className="text-[10px]" style={{ color: C.dim }}>数据截至 {fmtDate(data.latestDate)} · 共 {fmt(data.totalCount)} 只</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border p-3" style={{ borderColor: C.border, background: "#1e293b" }}>
          <p className="text-[10px] mb-1" style={{ color: C.muted }}>负PE（亏损）</p>
          <p className="text-xl font-bold" style={{ color: C.accent }}>{fmt(data.negPeCount)}</p>
          <p className="text-[10px] mt-0.5" style={{ color: C.dim }}>占比 {pct(data.negPeCount, data.totalCount)}%</p>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: C.border, background: "#1e293b" }}>
          <p className="text-[10px] mb-1" style={{ color: C.muted }}>破净股（PB&lt;1）</p>
          <p className="text-xl font-bold" style={{ color: C.blue }}>{fmt(data.breakNetCount)}</p>
          <p className="text-[10px] mt-0.5" style={{ color: C.dim }}>占比 {pct(data.breakNetCount, data.totalCount)}%</p>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg p-1" style={{ background: "#0f172a" }}>
        {(["pe", "pb", "mv"] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={{ background: subTab === t ? C.card : "transparent", color: subTab === t ? C.text : C.muted }}>
            {t === "pe" ? "PE分布" : t === "pb" ? "PB分布" : "市值分布"}
          </button>
        ))}
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: "#1e293b" }}>
        <p className="text-xs mb-3 font-medium" style={{ color: C.muted }}>
          {subTab === "pe" ? "市盈率（TTM）分布" : subTab === "pb" ? "市净率（PB）分布" : "总市值分布"}
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData as any[]} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 9 }} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} labelStyle={{ color: C.text }} formatter={(v: any) => [fmt(v), "只数"]} />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} label={<BarLabel />}>
              {(chartData as any[]).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div className="grid grid-cols-3 text-[10px] px-3 py-2 border-b" style={{ color: C.muted, borderColor: C.border, background: "#0f172a" }}>
          <span>区间</span><span className="text-center">只数</span><span className="text-right">占比</span>
        </div>
        {(chartData as any[]).map((row: any, i: number) => (
          <div key={i} className="grid grid-cols-3 text-xs px-3 py-2 border-b last:border-0" style={{ borderColor: C.border, background: "#1e293b" }}>
            <span style={{ color: C.muted }}>{row.label}</span>
            <span className="text-center font-medium" style={{ color: C.text }}>{fmt(row.count)}</span>
            <span className="text-right" style={{ color: C.dim }}>{pct(row.count, data.totalCount)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 涨跌统计 ──────────────────────────────────────────────
function RisefallPanel({ market }: { market: Market }) {
  const { data, isLoading } = trpc.aiDashboardRisefall.useQuery({ market });
  const [periodIdx, setPeriodIdx] = useState(0);

  if (isLoading) return <div className="space-y-4 p-4"><Skeleton h="h-24" /><Skeleton h="h-48" /></div>;
  if (!data || !data.latestDate) return (
    <div className="flex flex-col items-center justify-center py-16" style={{ color: C.dim }}>
      <Activity className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm">数据同步中，请稍后刷新</p>
    </div>
  );

  const t = data.today;
  const total = Number(t?.total ?? 0);
  const up = Number(t?.up ?? 0);
  const down = Number(t?.down ?? 0);
  const flat = Number(t?.flat ?? 0);
  const limitUp = Number(t?.limit_up ?? 0);
  const limitDown = Number(t?.limit_down ?? 0);
  const period = data.periods[periodIdx];

  return (
    <div className="space-y-4 px-4 pb-6 pt-3">
      <p className="text-[10px]" style={{ color: C.dim }}>最新交易日 {fmtDate(data.latestDate)}</p>

      <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: "#1e293b" }}>
        <p className="text-xs mb-3 font-medium" style={{ color: C.muted }}>今日涨跌分布</p>
        {total > 0 ? (
          <>
            <div className="flex rounded-full overflow-hidden h-6 mb-3">
              <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${pct(up, total)}%`, background: C.up }}>
                {parseFloat(pct(up, total)) > 8 ? `${pct(up, total)}%` : ""}
              </div>
              <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${pct(flat, total)}%`, background: C.dim }}>
                {parseFloat(pct(flat, total)) > 5 ? `${pct(flat, total)}%` : ""}
              </div>
              <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${pct(down, total)}%`, background: C.down }}>
                {parseFloat(pct(down, total)) > 8 ? `${pct(down, total)}%` : ""}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[{ label: "上涨", value: up, color: C.up }, { label: "平盘", value: flat, color: C.flat }, { label: "下跌", value: down, color: C.down }].map(item => (
                <div key={item.label} className="text-center">
                  <p className="text-base font-bold" style={{ color: item.color }}>{fmt(item.value)}</p>
                  <p className="text-[10px]" style={{ color: C.dim }}>{item.label}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: "#f87171" }}>{fmt(limitUp)}</p>
                <p className="text-[10px]" style={{ color: C.dim }}>涨停</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: "#f87171" }}>{t?.max_rise != null ? `+${Number(t.max_rise).toFixed(2)}%` : "—"}</p>
                <p className="text-[10px]" style={{ color: C.dim }}>最大涨幅</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: "#4ade80" }}>{t?.max_fall != null ? `${Number(t.max_fall).toFixed(2)}%` : "—"}</p>
                <p className="text-[10px]" style={{ color: C.dim }}>最大跌幅</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: "#4ade80" }}>{fmt(limitDown)}</p>
                <p className="text-[10px]" style={{ color: C.dim }}>跌停</p>
              </div>
            </div>
          </>
        ) : <p className="text-xs text-center py-4" style={{ color: C.dim }}>今日无数据（非交易日）</p>}
      </div>

      {data.periods.length > 0 && (
        <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: "#1e293b" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium" style={{ color: C.muted }}>区间涨跌分布</p>
            <div className="flex gap-1">
              {data.periods.map((p, i) => (
                <button key={i} onClick={() => setPeriodIdx(i)}
                  className="px-2 py-0.5 rounded text-[10px] transition-colors"
                  style={{ background: periodIdx === i ? C.blue : C.card, color: periodIdx === i ? "#fff" : C.muted }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {period && (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={period.distribution} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 8 }} axisLine={{ stroke: C.border }} tickLine={false} />
                  <YAxis tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [fmt(v), "只数"]} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]} label={<BarLabel />}>
                    {period.distribution.map((entry: any, i: number) => <Cell key={i} fill={i < 3 ? C.down : C.up} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-center mt-2" style={{ color: C.dim }}>统计 {fmt(period.total)} 只股票 · {period.label}区间涨跌幅</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 宏观数据 ──────────────────────────────────────────────
function MacroPanel() {
  const { data, isLoading } = trpc.aiDashboardMacro.useQuery();
  const [subTab, setSubTab] = useState<"north" | "hs300" | "m2" | "cpi" | "lpr">("north");

  if (isLoading) return <div className="space-y-4 p-4"><Skeleton h="h-16" /><Skeleton h="h-48" /></div>;
  if (!data) return (
    <div className="flex flex-col items-center justify-center py-16" style={{ color: C.dim }}>
      <Globe className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm">数据同步中，请稍后刷新</p>
    </div>
  );

  const SUBTABS = [
    { key: "north" as const, label: "北向资金" },
    { key: "hs300" as const, label: "沪深300" },
    { key: "m2" as const, label: "M2" },
    { key: "cpi" as const, label: "CPI" },
    { key: "lpr" as const, label: "LPR" },
  ];

  const latestNorth = data.northMoney[data.northMoney.length - 1];
  const latestLpr = data.lpr[0];
  const latestM2 = data.m2[data.m2.length - 1];
  const latestCpi = data.cpi[data.cpi.length - 1];

  return (
    <div className="space-y-4 px-4 pb-6 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border p-3" style={{ borderColor: C.border, background: "#1e293b" }}>
          <p className="text-[10px] mb-1" style={{ color: C.muted }}>北向净流入（最新）</p>
          {latestNorth ? (
            <>
              <p className="text-lg font-bold" style={{ color: Number(latestNorth.north_money) >= 0 ? "#f87171" : "#4ade80" }}>
                {Number(latestNorth.north_money) >= 0 ? "+" : ""}{(Number(latestNorth.north_money) / 100).toFixed(1)}亿
              </p>
              <p className="text-[10px]" style={{ color: C.dim }}>{fmtDate(latestNorth.trade_date)}</p>
            </>
          ) : <p className="text-sm" style={{ color: C.dim }}>—</p>}
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: C.border, background: "#1e293b" }}>
          <p className="text-[10px] mb-1" style={{ color: C.muted }}>LPR（5年期）</p>
          {latestLpr ? (
            <>
              <p className="text-lg font-bold" style={{ color: C.accent }}>{latestLpr.y5}%</p>
              <p className="text-[10px]" style={{ color: C.dim }}>{fmtDate(latestLpr.date)}</p>
            </>
          ) : <p className="text-sm" style={{ color: C.dim }}>—</p>}
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: C.border, background: "#1e293b" }}>
          <p className="text-[10px] mb-1" style={{ color: C.muted }}>M2同比增速（最新）</p>
          {latestM2 ? (
            <>
              <p className="text-lg font-bold" style={{ color: C.blue }}>{latestM2.m2_yoy}%</p>
              <p className="text-[10px]" style={{ color: C.dim }}>{latestM2.month}</p>
            </>
          ) : <p className="text-sm" style={{ color: C.dim }}>—</p>}
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: C.border, background: "#1e293b" }}>
          <p className="text-[10px] mb-1" style={{ color: C.muted }}>CPI同比（最新）</p>
          {latestCpi ? (
            <>
              <p className="text-lg font-bold" style={{ color: Number(latestCpi.nt_yoy) > 0 ? "#f87171" : "#4ade80" }}>
                {Number(latestCpi.nt_yoy) > 0 ? "+" : ""}{latestCpi.nt_yoy}%
              </p>
              <p className="text-[10px]" style={{ color: C.dim }}>{latestCpi.month}</p>
            </>
          ) : <p className="text-sm" style={{ color: C.dim }}>—</p>}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {SUBTABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: subTab === t.key ? C.card : "transparent", color: subTab === t.key ? C.text : C.muted, border: `1px solid ${subTab === t.key ? C.border : "transparent"}` }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: C.border, background: "#1e293b" }}>
        {subTab === "north" && (
          <>
            <p className="text-xs mb-3 font-medium" style={{ color: C.muted }}>北向资金净流入（近60日，亿元）</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.northMoney.map((d: any) => ({ ...d, val: (Number(d.north_money) / 100).toFixed(1) }))} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="trade_date" tick={false} axisLine={{ stroke: C.border }} />
                <YAxis tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [`${v}亿`, "北向净流入"]} labelFormatter={(l) => fmtDate(l)} />
                <ReferenceLine y={0} stroke={C.flat} />
                <Bar dataKey="val">
                  {data.northMoney.map((d: any, i: number) => <Cell key={i} fill={Number(d.north_money) >= 0 ? C.up : C.down} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
        {subTab === "hs300" && (
          <>
            <p className="text-xs mb-3 font-medium" style={{ color: C.muted }}>沪深300 收盘价走势（近60日）</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data.hs300} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="trade_date" tick={false} axisLine={{ stroke: C.border }} />
                <YAxis tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [Number(v).toFixed(2), "收盘"]} labelFormatter={(l) => fmtDate(l)} />
                <Line type="monotone" dataKey="close" stroke={C.accent} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
        {subTab === "m2" && (
          <>
            <p className="text-xs mb-3 font-medium" style={{ color: C.muted }}>M2同比增速（%）</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data.m2} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="month" tick={false} axisLine={{ stroke: C.border }} />
                <YAxis tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [`${v}%`, "M2同比"]} />
                <Line type="monotone" dataKey="m2_yoy" stroke={C.blue} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
        {subTab === "cpi" && (
          <>
            <p className="text-xs mb-3 font-medium" style={{ color: C.muted }}>CPI同比（%）</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data.cpi} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="month" tick={false} axisLine={{ stroke: C.border }} />
                <YAxis tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={(v: any) => [`${v}%`, "CPI同比"]} />
                <ReferenceLine y={0} stroke={C.flat} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="nt_yoy" stroke={C.accent} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
        {subTab === "lpr" && (
          <>
            <p className="text-xs mb-3 font-medium" style={{ color: C.muted }}>LPR 利率（%）</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data.lpr} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="date" tick={false} axisLine={{ stroke: C.border }} />
                <YAxis tick={{ fill: C.muted, fontSize: 9 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }} formatter={(v: any, name: any) => [`${v}%`, name === "y1" ? "1年期" : "5年期"]} labelFormatter={(l) => fmtDate(l)} />
                <Line type="stepAfter" dataKey="y1" stroke={C.blue} strokeWidth={2} dot={false} name="y1" />
                <Line type="stepAfter" dataKey="y5" stroke={C.accent} strokeWidth={2} dot={false} name="y5" />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center mt-2">
              <span className="flex items-center gap-1 text-[10px]" style={{ color: C.muted }}>
                <span className="w-3 h-0.5 inline-block rounded" style={{ background: C.blue }} />1年期
              </span>
              <span className="flex items-center gap-1 text-[10px]" style={{ color: C.muted }}>
                <span className="w-3 h-0.5 inline-block rounded" style={{ background: C.accent }} />5年期
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────
export default function LedgerAIDatabase() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;
  const [activeTheme, setActiveTheme] = useState<ThemeKey | null>(null);
  const [market, setMarket] = useState<Market>("all");

  const activeThemeInfo = THEMES.find(t => t.key === activeTheme);

  if (activeTheme) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: C.bg, color: C.text }}>
        <div className="sticky top-0 z-10 border-b" style={{ background: C.bg, borderColor: C.border }}>
          <div className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => setActiveTheme(null)} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: C.card }}>
              <ChevronLeft className="w-5 h-5" style={{ color: C.muted }} />
            </button>
            <div className="flex items-center gap-2 flex-1">
              {activeThemeInfo && <activeThemeInfo.icon className="w-4 h-4" style={{ color: activeThemeInfo.color }} />}
              <span className="font-semibold text-sm">{activeThemeInfo?.label}</span>
            </div>
          </div>
          {activeTheme !== "macro" && (
            <div className="flex gap-1 px-4 pb-3 overflow-x-auto">
              {MARKETS.map(m => (
                <button key={m.key} onClick={() => setMarket(m.key)}
                  className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  style={{ background: market === m.key ? activeThemeInfo?.color : C.card, color: market === m.key ? "#fff" : C.muted }}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {activeTheme === "survival" && <SurvivalPanel market={market} />}
          {activeTheme === "valuation" && <ValuationPanel market={market} />}
          {activeTheme === "risefall" && <RisefallPanel market={market} />}
          {activeTheme === "macro" && <MacroPanel />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg, color: C.text }}>
      <div className="sticky top-0 z-10 border-b px-4 py-3 flex items-center gap-3" style={{ background: C.bg, borderColor: C.border }}>
        <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: C.card }}>
          <ChevronLeft className="w-5 h-5" style={{ color: C.muted }} />
        </button>
        <div className="flex-1">
          <p className="font-bold text-sm tracking-wide">A股全景仪表盘</p>
          <p className="text-[10px]" style={{ color: C.muted }}>基于全市场数据的横截面分析</p>
        </div>
        <RefreshCw className="w-4 h-4" style={{ color: C.dim }} />
      </div>

      <div className="mx-4 mt-4 rounded-xl border px-4 py-3" style={{ borderColor: C.border, background: C.card }}>
        <p className="text-xs leading-relaxed" style={{ color: C.muted }}>
          以 A 股全部在市股票为分析对象，从生存率、估值结构、涨跌分布、宏观环境四个维度提供全景视图。数据每日收盘后自动更新。
        </p>
      </div>

      <div className="px-4 mt-4 space-y-3 pb-8">
        {THEMES.map(theme => (
          <button key={theme.key} onClick={() => setActiveTheme(theme.key)}
            className="w-full rounded-xl border p-4 flex items-center gap-4 text-left active:opacity-70 transition-opacity"
            style={{ background: C.card, borderColor: C.border }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${theme.color}20` }}>
              <theme.icon className="w-5 h-5" style={{ color: theme.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: C.text }}>{theme.label}</p>
              <p className="text-xs mt-0.5" style={{ color: C.muted }}>{theme.sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: C.dim }} />
          </button>
        ))}

        <div className="rounded-xl border border-dashed p-4 flex items-center gap-4 opacity-40" style={{ borderColor: C.border }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: C.card }}>
            <BarChart2 className="w-5 h-5" style={{ color: C.dim }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: C.dim }}>更多分析主题</p>
            <p className="text-xs mt-0.5" style={{ color: C.dim }}>持续扩展中…</p>
          </div>
        </div>
      </div>
    </div>
  );
}
