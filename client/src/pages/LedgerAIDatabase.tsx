/**
 * LedgerAIDatabase.tsx
 * A股全景仪表盘
 * 路径: /ledger/:id/ai-database
 * 风格与 LedgerDetailAA 一致：顶部 #D32F2F，页面背景 #FAF3ED，卡片白色
 */
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, ChevronRight, RefreshCw, TrendingUp, BarChart2, Activity, Globe } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell
} from "recharts";

// ─── 配色（与首页一致） ────────────────────────────────────
const RED = "#D32F2F";
const BG = "#FAF3ED";
const CARD = "#FFFFFF";
const BORDER = "#E0E0E0";
const TEXT = "#222222";
const MUTED = "#757575";
const DIM = "#9E9E9E";
const GREEN = "#4CAF50";
const CHART_UP = "#D32F2F";
const CHART_DOWN = "#4CAF50";

// ─── 市场 Tab ──────────────────────────────────────────────
type Market = "all" | "SH" | "SZ" | "GEM" | "STAR";
const MARKETS: { key: Market; label: string }[] = [
  { key: "all", label: "全市场" },
  { key: "SH", label: "沪市" },
  { key: "SZ", label: "深市" },
  { key: "GEM", label: "创业板" },
  { key: "STAR", label: "科创板" },
];

// ─── 主题定义 ──────────────────────────────────────────────
type ThemeKey = "survival" | "valuation" | "risefall" | "macro";
const THEMES: { key: ThemeKey; label: string; sub: string; icon: typeof TrendingUp }[] = [
  { key: "survival", label: "生存分析", sub: "上市至今盈亏全景", icon: TrendingUp },
  { key: "valuation", label: "估值分布", sub: "PE / PB / 市值结构", icon: BarChart2 },
  { key: "risefall", label: "涨跌统计", sub: "今日及近期涨跌分布", icon: Activity },
  { key: "macro", label: "宏观数据", sub: "M2 / CPI / LPR / 北向", icon: Globe },
];

// ─── 工具函数 ──────────────────────────────────────────────
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

function Skeleton() {
  return <div className="h-32 w-full rounded-xl animate-pulse" style={{ background: BORDER }} />;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16" style={{ color: DIM }}>
      <BarChart2 className="w-8 h-8 mb-2 opacity-30" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

// ─── 市场 Tab 栏 ───────────────────────────────────────────
function MarketTabs({ market, onChange }: { market: Market; onChange: (m: Market) => void }) {
  return (
    <div className="flex gap-1.5 px-4 py-2 overflow-x-auto border-b" style={{ borderColor: BORDER, background: CARD }}>
      {MARKETS.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
          style={{
            background: market === m.key ? RED : "#F5F5F5",
            color: market === m.key ? "#fff" : MUTED,
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ─── 生存分析 ──────────────────────────────────────────────
function SurvivalPanel({ market }: { market: Market }) {
  const { data, isLoading } = trpc.aiDashboardSurvival.useQuery({ market });

  if (isLoading) return <div className="p-4 space-y-3"><Skeleton /><Skeleton /></div>;
  if (!data || data.total === 0) return <EmptyState label="数据同步中，请稍后刷新" />;

  const abovePct = parseFloat(pct(data.above, data.total));
  const belowPct = parseFloat(pct(data.below, data.total));

  const eraOrder = ["2000年前", "2000-2009", "2010-2014", "2015-2019", "2020至今"];
  const eraData = eraOrder.filter(e => data.byEra[e]).map(e => {
    const d = data.byEra[e];
    return {
      name: e.replace("2000年前", "<2000"),
      胜率: parseFloat(pct(d.above, d.total)),
      上涨: d.above,
      下跌: d.below,
      total: d.total,
    };
  });

  return (
    <div className="p-4 space-y-3" style={{ background: BG }}>
      {/* 总览卡片 */}
      <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <p className="text-xs mb-3" style={{ color: MUTED }}>
          统计范围：全部在市 A 股（共 <span className="font-semibold" style={{ color: TEXT }}>{fmt(data.total)}</span> 只）
        </p>
        {/* 进度条 */}
        <div className="flex rounded-full overflow-hidden h-4 mb-3">
          <div
            className="flex items-center justify-center text-[9px] font-bold text-white"
            style={{ width: `${abovePct}%`, background: CHART_UP }}
          >
            {abovePct > 10 ? `${abovePct}%` : ""}
          </div>
          <div
            className="flex items-center justify-center text-[9px] font-bold text-white"
            style={{ width: `${belowPct}%`, background: CHART_DOWN }}
          >
            {belowPct > 10 ? `${belowPct}%` : ""}
          </div>
          <div className="flex-1" style={{ background: "#E0E0E0" }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "高于上市首日", value: fmt(data.above), pctVal: `${abovePct}%`, color: CHART_UP },
            { label: "低于上市首日", value: fmt(data.below), pctVal: `${belowPct}%`, color: CHART_DOWN },
            { label: "持平", value: fmt(data.equal), pctVal: `${pct(data.equal, data.total)}%`, color: DIM },
          ].map(item => (
            <div key={item.label} className="text-center">
              <p className="text-base font-bold" style={{ color: item.color }}>{item.value}</p>
              <p className="text-[10px]" style={{ color: DIM }}>{item.pctVal}</p>
              <p className="text-[10px]" style={{ color: MUTED }}>{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 年代胜率柱状图 */}
      <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <p className="text-xs font-medium mb-3" style={{ color: TEXT }}>按上市年代 — 历史胜率（%）</p>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={eraData} margin={{ top: 14, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: BORDER }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
              formatter={(v: any) => [`${v}%`, "胜率"]}
            />
            <ReferenceLine y={50} stroke={DIM} strokeDasharray="4 2" />
            <Bar dataKey="胜率" radius={[3, 3, 0, 0]}>
              {eraData.map((entry, i) => (
                <Cell key={i} fill={entry.胜率 >= 50 ? CHART_UP : CHART_DOWN} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 明细表 */}
      <div className="rounded-xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-4 text-[10px] px-3 py-2 border-b" style={{ color: MUTED, borderColor: BORDER, background: "#F9F9F9" }}>
          <span>年代</span>
          <span className="text-center">总数</span>
          <span className="text-center" style={{ color: CHART_UP }}>上涨</span>
          <span className="text-center" style={{ color: CHART_DOWN }}>下跌</span>
        </div>
        {eraData.map((row, i) => (
          <div key={i} className="grid grid-cols-4 text-xs px-3 py-2 border-b last:border-0" style={{ borderColor: BORDER }}>
            <span style={{ color: MUTED }}>{row.name}</span>
            <span className="text-center" style={{ color: TEXT }}>{row.total}</span>
            <span className="text-center font-medium" style={{ color: CHART_UP }}>{row.上涨}</span>
            <span className="text-center font-medium" style={{ color: CHART_DOWN }}>{row.下跌}</span>
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

  if (isLoading) return <div className="p-4 space-y-3"><Skeleton /><Skeleton /></div>;
  if (!data || !data.latestDate) return <EmptyState label="数据同步中，请稍后刷新" />;

  const chartData = subTab === "pe" ? data.peDistribution : subTab === "pb" ? data.pbDistribution : data.mvDistribution;
  const COLORS = [RED, "#F57C00", "#1976D2", "#388E3C", "#7B1FA2", "#00838F"];

  return (
    <div className="p-4 space-y-3" style={{ background: BG }}>
      <p className="text-[10px]" style={{ color: DIM }}>数据截至 {fmtDate(data.latestDate)} · 共 {fmt(data.totalCount)} 只</p>

      {/* 关键指标 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[10px] mb-1" style={{ color: MUTED }}>负PE（亏损股）</p>
          <p className="text-xl font-bold" style={{ color: RED }}>{fmt(data.negPeCount)}</p>
          <p className="text-[10px] mt-0.5" style={{ color: DIM }}>占比 {pct(data.negPeCount, data.totalCount)}%</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[10px] mb-1" style={{ color: MUTED }}>破净股（PB&lt;1）</p>
          <p className="text-xl font-bold" style={{ color: "#1976D2" }}>{fmt(data.breakNetCount)}</p>
          <p className="text-[10px] mt-0.5" style={{ color: DIM }}>占比 {pct(data.breakNetCount, data.totalCount)}%</p>
        </div>
      </div>

      {/* 子Tab */}
      <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD }}>
        {(["pe", "pb", "mv"] as const).map((t, i) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className="flex-1 py-2 text-xs font-medium transition-colors"
            style={{
              background: subTab === t ? RED : CARD,
              color: subTab === t ? "#fff" : MUTED,
              borderRight: i < 2 ? `1px solid ${BORDER}` : "none",
            }}
          >
            {t === "pe" ? "PE分布" : t === "pb" ? "PB分布" : "市值分布"}
          </button>
        ))}
      </div>

      {/* 柱状图 */}
      <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <p className="text-xs font-medium mb-3" style={{ color: TEXT }}>
          {subTab === "pe" ? "市盈率（TTM）分布" : subTab === "pb" ? "市净率（PB）分布" : "总市值分布"}
        </p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData as any[]} margin={{ top: 14, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: BORDER }} tickLine={false} />
            <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
              formatter={(v: any) => [fmt(v), "只数"]}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {(chartData as any[]).map((_: any, i: number) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 明细表 */}
      <div className="rounded-xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <div className="grid grid-cols-3 text-[10px] px-3 py-2 border-b" style={{ color: MUTED, borderColor: BORDER, background: "#F9F9F9" }}>
          <span>区间</span><span className="text-center">只数</span><span className="text-right">占比</span>
        </div>
        {(chartData as any[]).map((row: any, i: number) => (
          <div key={i} className="grid grid-cols-3 text-xs px-3 py-2 border-b last:border-0" style={{ borderColor: BORDER }}>
            <span style={{ color: MUTED }}>{row.label}</span>
            <span className="text-center font-medium" style={{ color: TEXT }}>{fmt(row.count)}</span>
            <span className="text-right" style={{ color: DIM }}>{pct(row.count, data.totalCount)}%</span>
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

  if (isLoading) return <div className="p-4 space-y-3"><Skeleton /><Skeleton /></div>;
  if (!data || !data.latestDate) return <EmptyState label="数据同步中，请稍后刷新" />;

  const t = data.today;
  const total = Number(t?.total ?? 0);
  const up = Number(t?.up ?? 0);
  const down = Number(t?.down ?? 0);
  const flat = Number(t?.flat ?? 0);
  const limitUp = Number(t?.limit_up ?? 0);
  const limitDown = Number(t?.limit_down ?? 0);
  const period = data.periods[periodIdx];

  return (
    <div className="p-4 space-y-3" style={{ background: BG }}>
      <p className="text-[10px]" style={{ color: DIM }}>最新交易日 {fmtDate(data.latestDate)}</p>

      {/* 今日涨跌 */}
      <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        <p className="text-xs font-medium mb-3" style={{ color: TEXT }}>今日涨跌分布</p>
        {total > 0 ? (
          <>
            <div className="flex rounded-full overflow-hidden h-4 mb-3">
              <div
                className="flex items-center justify-center text-[9px] font-bold text-white"
                style={{ width: `${pct(up, total)}%`, background: CHART_UP }}
              >
                {parseFloat(pct(up, total)) > 10 ? `${pct(up, total)}%` : ""}
              </div>
              <div
                style={{ width: `${pct(flat, total)}%`, background: "#E0E0E0" }}
              />
              <div
                className="flex items-center justify-center text-[9px] font-bold text-white"
                style={{ width: `${pct(down, total)}%`, background: CHART_DOWN }}
              >
                {parseFloat(pct(down, total)) > 10 ? `${pct(down, total)}%` : ""}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "上涨", value: up, color: CHART_UP },
                { label: "平盘", value: flat, color: DIM },
                { label: "下跌", value: down, color: CHART_DOWN },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <p className="text-base font-bold" style={{ color: item.color }}>{fmt(item.value)}</p>
                  <p className="text-[10px]" style={{ color: MUTED }}>{item.label}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-1 pt-3 border-t" style={{ borderColor: BORDER }}>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: CHART_UP }}>{fmt(limitUp)}</p>
                <p className="text-[10px]" style={{ color: DIM }}>涨停</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: CHART_UP }}>
                  {t?.max_rise != null ? `+${Number(t.max_rise).toFixed(2)}%` : "—"}
                </p>
                <p className="text-[10px]" style={{ color: DIM }}>最大涨幅</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: CHART_DOWN }}>
                  {t?.max_fall != null ? `${Number(t.max_fall).toFixed(2)}%` : "—"}
                </p>
                <p className="text-[10px]" style={{ color: DIM }}>最大跌幅</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold" style={{ color: CHART_DOWN }}>{fmt(limitDown)}</p>
                <p className="text-[10px]" style={{ color: DIM }}>跌停</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-center py-4" style={{ color: DIM }}>今日无数据（非交易日）</p>
        )}
      </div>

      {/* 区间分布 */}
      {data.periods.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium" style={{ color: TEXT }}>区间涨跌分布</p>
            <div className="flex gap-1">
              {data.periods.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setPeriodIdx(i)}
                  className="px-2 py-0.5 rounded text-[10px] transition-colors"
                  style={{
                    background: periodIdx === i ? RED : "#F5F5F5",
                    color: periodIdx === i ? "#fff" : MUTED,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {period && (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={period.distribution} margin={{ top: 14, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 8 }} axisLine={{ stroke: BORDER }} tickLine={false} />
                  <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: any) => [fmt(v), "只数"]}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {period.distribution.map((entry: any, i: number) => (
                      <Cell key={i} fill={i < 3 ? CHART_DOWN : CHART_UP} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-center mt-2" style={{ color: DIM }}>
                统计 {fmt(period.total)} 只 · {period.label}区间涨跌幅
              </p>
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

  if (isLoading) return <div className="p-4 space-y-3"><Skeleton /><Skeleton /></div>;
  if (!data) return <EmptyState label="数据同步中，请稍后刷新" />;

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
    <div className="p-4 space-y-3" style={{ background: BG }}>
      {/* 关键数字 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[10px] mb-1" style={{ color: MUTED }}>北向净流入（最新）</p>
          {latestNorth ? (
            <>
              <p className="text-lg font-bold" style={{ color: Number(latestNorth.north_money) >= 0 ? RED : GREEN }}>
                {Number(latestNorth.north_money) >= 0 ? "+" : ""}{(Number(latestNorth.north_money) / 100).toFixed(1)}亿
              </p>
              <p className="text-[10px]" style={{ color: DIM }}>{fmtDate(latestNorth.trade_date)}</p>
            </>
          ) : <p className="text-sm" style={{ color: DIM }}>—</p>}
        </div>
        <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[10px] mb-1" style={{ color: MUTED }}>LPR（5年期）</p>
          {latestLpr ? (
            <>
              <p className="text-lg font-bold" style={{ color: "#F57C00" }}>{latestLpr.y5}%</p>
              <p className="text-[10px]" style={{ color: DIM }}>{fmtDate(latestLpr.date)}</p>
            </>
          ) : <p className="text-sm" style={{ color: DIM }}>—</p>}
        </div>
        <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[10px] mb-1" style={{ color: MUTED }}>M2同比增速（最新）</p>
          {latestM2 ? (
            <>
              <p className="text-lg font-bold" style={{ color: "#1976D2" }}>{latestM2.m2_yoy}%</p>
              <p className="text-[10px]" style={{ color: DIM }}>{latestM2.month}</p>
            </>
          ) : <p className="text-sm" style={{ color: DIM }}>—</p>}
        </div>
        <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
          <p className="text-[10px] mb-1" style={{ color: MUTED }}>CPI同比（最新）</p>
          {latestCpi ? (
            <>
              <p className="text-lg font-bold" style={{ color: Number(latestCpi.nt_yoy) > 0 ? RED : GREEN }}>
                {Number(latestCpi.nt_yoy) > 0 ? "+" : ""}{latestCpi.nt_yoy}%
              </p>
              <p className="text-[10px]" style={{ color: DIM }}>{latestCpi.month}</p>
            </>
          ) : <p className="text-sm" style={{ color: DIM }}>—</p>}
        </div>
      </div>

      {/* 子Tab */}
      <div className="flex gap-1.5 overflow-x-auto">
        {SUBTABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
            style={{
              background: subTab === t.key ? RED : "#F5F5F5",
              color: subTab === t.key ? "#fff" : MUTED,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 图表 */}
      <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
        {subTab === "north" && (
          <>
            <p className="text-xs font-medium mb-3" style={{ color: TEXT }}>北向资金净流入（近60日，亿元）</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={data.northMoney.map((d: any) => ({ ...d, val: (Number(d.north_money) / 100).toFixed(1) }))}
                margin={{ top: 8, right: 4, left: -24, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis dataKey="trade_date" tick={false} axisLine={{ stroke: BORDER }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [`${v}亿`, "北向净流入"]}
                  labelFormatter={(l) => fmtDate(l)}
                />
                <ReferenceLine y={0} stroke={BORDER} />
                <Bar dataKey="val">
                  {data.northMoney.map((d: any, i: number) => (
                    <Cell key={i} fill={Number(d.north_money) >= 0 ? CHART_UP : CHART_DOWN} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
        {subTab === "hs300" && (
          <>
            <p className="text-xs font-medium mb-3" style={{ color: TEXT }}>沪深300 收盘价走势（近60日）</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.hs300} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis dataKey="trade_date" tick={false} axisLine={{ stroke: BORDER }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [Number(v).toFixed(2), "收盘"]}
                  labelFormatter={(l) => fmtDate(l)}
                />
                <Line type="monotone" dataKey="close" stroke={RED} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
        {subTab === "m2" && (
          <>
            <p className="text-xs font-medium mb-3" style={{ color: TEXT }}>M2同比增速（%）</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.m2} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis dataKey="month" tick={false} axisLine={{ stroke: BORDER }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [`${v}%`, "M2同比"]}
                />
                <Line type="monotone" dataKey="m2_yoy" stroke="#1976D2" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
        {subTab === "cpi" && (
          <>
            <p className="text-xs font-medium mb-3" style={{ color: TEXT }}>CPI同比（%）</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.cpi} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis dataKey="month" tick={false} axisLine={{ stroke: BORDER }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => [`${v}%`, "CPI同比"]}
                />
                <ReferenceLine y={0} stroke={BORDER} strokeDasharray="4 2" />
                <Line type="monotone" dataKey="nt_yoy" stroke="#F57C00" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
        {subTab === "lpr" && (
          <>
            <p className="text-xs font-medium mb-3" style={{ color: TEXT }}>LPR 利率（%）</p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.lpr} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis dataKey="date" tick={false} axisLine={{ stroke: BORDER }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any, name: any) => [`${v}%`, name === "y1" ? "1年期" : "5年期"]}
                  labelFormatter={(l) => fmtDate(l)}
                />
                <Line type="stepAfter" dataKey="y1" stroke="#1976D2" strokeWidth={2} dot={false} name="y1" />
                <Line type="stepAfter" dataKey="y5" stroke="#F57C00" strokeWidth={2} dot={false} name="y5" />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 justify-center mt-2">
              <span className="flex items-center gap-1 text-[10px]" style={{ color: MUTED }}>
                <span className="w-3 h-0.5 inline-block rounded" style={{ background: "#1976D2" }} />1年期
              </span>
              <span className="flex items-center gap-1 text-[10px]" style={{ color: MUTED }}>
                <span className="w-3 h-0.5 inline-block rounded" style={{ background: "#F57C00" }} />5年期
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

  // ── 详情页 ──
  if (activeTheme) {
    return (
      <div className="h-screen flex flex-col" style={{ background: BG }}>
        {/* 顶部红色导航 */}
        <div style={{ background: RED, color: "#fff" }}>
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setActiveTheme(null)}
              className="w-7 h-7 flex items-center justify-center rounded-full"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
            <div className="flex items-center gap-2 flex-1">
              {activeThemeInfo && <activeThemeInfo.icon className="w-4 h-4 text-white opacity-90" />}
              <span className="font-semibold text-sm">{activeThemeInfo?.label}</span>
            </div>
          </div>
          {/* 市场 Tab（宏观不需要） */}
          {activeTheme !== "macro" && (
            <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
              {MARKETS.map(m => (
                <button
                  key={m.key}
                  onClick={() => setMarket(m.key)}
                  className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: market === m.key ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)",
                    color: market === m.key ? RED : "#fff",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {activeTheme === "survival" && <SurvivalPanel market={market} />}
          {activeTheme === "valuation" && <ValuationPanel market={market} />}
          {activeTheme === "risefall" && <RisefallPanel market={market} />}
          {activeTheme === "macro" && <MacroPanel />}
        </div>
      </div>
    );
  }

  // ── 主题列表页 ──
  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部红色导航 */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ background: RED, color: "#fff" }}>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-sm">A股全景仪表盘</p>
          <p className="text-[10px] opacity-75">基于全市场数据的横截面分析</p>
        </div>
        <RefreshCw className="w-4 h-4 opacity-70" />
      </div>

      {/* 主题卡片列表 */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 space-y-3">
        {THEMES.map(theme => (
          <button
            key={theme.key}
            onClick={() => { setActiveTheme(theme.key); setMarket("all"); }}
            className="w-full rounded-xl p-4 flex items-center gap-4 text-left active:opacity-70 transition-opacity"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "#FFEBEE" }}
            >
              <theme.icon className="w-5 h-5" style={{ color: RED }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: TEXT }}>{theme.label}</p>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>{theme.sub}</p>
            </div>
            <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: DIM }} />
          </button>
        ))}

        {/* 扩展占位 */}
        <div
          className="rounded-xl p-4 flex items-center gap-4 opacity-40"
          style={{ background: CARD, border: `1px dashed ${BORDER}` }}
        >
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#F5F5F5" }}>
            <BarChart2 className="w-5 h-5" style={{ color: DIM }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium" style={{ color: DIM }}>更多分析主题</p>
            <p className="text-xs mt-0.5" style={{ color: DIM }}>持续扩展中</p>
          </div>
        </div>
      </div>
    </div>
  );
}
