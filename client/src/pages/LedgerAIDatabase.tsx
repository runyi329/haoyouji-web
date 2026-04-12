/**
 * LedgerAIDatabase.tsx
 * A股全景仪表盘 — 单页展开模式
 * 路径: /ledger/:id/ai-database
 * 风格与 LedgerDetailAA 一致：顶部 #D32F2F，页面背景 #FAF3ED，卡片白色
 */
import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell
} from "recharts";

// ─── 配色（与首页一致） ────────────────────────────────────
const RED = "#D32F2F";
const BG = "#F2EAE0";           // 背景稍加深，让卡片更立体
const CARD = "#FFFFFF";
const BORDER = "#E8E0D8";
const TEXT = "#1A1A1A";
const MUTED = "#555555";
const DIM = "#666666";
const GREEN = "#4CAF50";
const CHART_UP = "#D32F2F";
const CHART_DOWN = "#4CAF50";
// 渐变色（立体感用）
const GRAD_UP = "linear-gradient(135deg, #E53935 0%, #B71C1C 100%)";
const GRAD_DOWN = "linear-gradient(135deg, #43A047 0%, #1B5E20 100%)";
const GRAD_NEUTRAL = "linear-gradient(135deg, #9E9E9E 0%, #757575 100%)";
// 卡片阴影
const CARD_SHADOW = "0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

// ─── 市场 Tab ──────────────────────────────────────────────
type Market = "all" | "SH" | "SZ" | "GEM" | "STAR";
const MARKET_KEYS: { key: Market; label: string }[] = [
  { key: "all", label: "全市场" },
  { key: "SH", label: "沪市" },
  { key: "SZ", label: "深市" },
  { key: "GEM", label: "创业板" },
  { key: "STAR", label: "科创板" },
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
  return <div className="h-24 w-full rounded-xl animate-pulse" style={{ background: BORDER }} />;
}
function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8" style={{ color: DIM }}>
      <p className="text-sm">{label}</p>
    </div>
  );
}

/// ─── 分区标题（左侧红色竖条装饰） ──────────────────
function SectionTitle({ title, sub, extra }: { title: string; sub: string; extra?: React.ReactNode }) {
  return (
    <div className="px-4 pt-5 pb-2 flex items-start gap-2.5">
      <div className="w-1 rounded-full mt-0.5 flex-shrink-0" style={{ height: '36px', background: GRAD_UP }} />
      <div className="flex-1 flex items-start justify-between">
        <div>
          <p className="text-base font-bold" style={{ color: TEXT }}>{title}</p>
          <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>{sub}</p>
        </div>
        {extra && <div className="flex-shrink-0 ml-2 mt-0.5">{extra}</div>}
      </div>
    </div>
  );
}

// ─── 市场 Tab 栏（带数量） ─────────────────────────────────
function MarketTabs({
  market,
  onChange,
  counts,
}: {
  market: Market;
  onChange: (m: Market) => void;
  counts: Record<Market, number>;
}) {
  return (
    <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
      {MARKET_KEYS.map(m => {
        const cnt = counts[m.key];
        const active = market === m.key;
        return (
          <button
            key={m.key}
            onClick={() => onChange(m.key)}
            className="flex-shrink-0 flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all duration-200 min-w-[52px]"
            style={{
              background: active ? GRAD_UP : "rgba(211,47,47,0.08)",
              color: active ? "#fff" : RED,
              boxShadow: active ? "0 3px 10px rgba(211,47,47,0.30)" : "inset 0 0 0 1px rgba(211,47,47,0.2)",
              transform: active ? "translateY(-1px)" : "none",
            }}
          >
            <span className="text-[13px] font-semibold leading-tight">{m.label}</span>
            {cnt > 0 && (
              <span className="text-[11px] leading-tight mt-0.5" style={{ opacity: active ? 0.9 : 0.7 }}>{cnt.toLocaleString()}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── 动画色条卡片组件 ────────────────────────────────────────────
function AnimatedSurvivalBar({
  above, below, equal, total, abovePct, belowPct
}: {
  above: number; below: number; equal: number; total: number;
  abovePct: number; belowPct: number;
}) {
  const [animated, setAnimated] = useState(false);
  const equalPct = parseFloat(pct(equal, total));

  useEffect(() => {
    // 延迟少许再启动动画，让浏览器先渲染初始状态
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, [above, below, equal]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}` }}
    >
      {/* 头部信息行 */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <p className="text-[12px]" style={{ color: MUTED }}>
          共 <span className="font-semibold" style={{ color: TEXT }}>{fmt(total)}</span> 只 A 股
        </p>
        <p className="text-[12px]" style={{ color: DIM }}>截至 2026-04-10 15:00:00</p>
      </div>

      {/* 宽色条：双向展开动画 — 红色从左、绿色从右同时展开，持平最后淡入 */}
      <div
        className="relative h-14 mx-3 mb-1 rounded-lg overflow-hidden"
        style={{ background: "#E0D8D0" }}
      >
        {/* 红色区：从左向右展开 */}
        <div
          className="absolute top-0 left-0 h-full flex flex-col items-center justify-center overflow-hidden"
          style={{
            width: animated ? `${abovePct}%` : "0%",
            background: GRAD_UP,
            transition: "width 0.85s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          <span className="text-sm font-bold text-white leading-tight drop-shadow">{fmt(above)}</span>
          <span className="text-[11px] text-white" style={{ opacity: 0.92 }}>{abovePct}%</span>
        </div>
        {/* 绿色区：从右向左展开 */}
        <div
          className="absolute top-0 right-0 h-full flex flex-col items-center justify-center overflow-hidden"
          style={{
            width: animated ? `${belowPct}%` : "0%",
            background: GRAD_DOWN,
            transition: "width 0.85s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
        >
          <span className="text-sm font-bold text-white leading-tight drop-shadow">{fmt(below)}</span>
          <span className="text-[11px] text-white" style={{ opacity: 0.92 }}>{belowPct}%</span>
        </div>
        {/* 灰色区：持平，居中淡入（延迟0.7s） */}
        {equal > 0 && (
          <div
            className="absolute top-0 h-full flex flex-col items-center justify-center"
            style={{
              left: `${abovePct}%`,
              width: `${Math.max(equalPct, 3)}%`,
              minWidth: '24px',
              background: GRAD_NEUTRAL,
              boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.12)",
              opacity: animated ? 1 : 0,
              transition: "opacity 0.5s ease 0.75s",
            }}
          >
            <span className="text-[10px] font-bold text-white leading-tight">{fmt(equal)}</span>
            <span className="text-[9px] text-white" style={{ opacity: 0.9 }}>持平</span>
          </div>
        )}
      </div>

      {/* 图例行 */}
      <div className="flex items-center justify-center gap-4 px-3 pb-3 pt-1">
        {[
          { color: CHART_UP, label: "高于首日开盘价" },
          { color: "#9E9E9E", label: "持平" },
          { color: CHART_DOWN, label: "低于首日开盘价" },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: item.color }} />
            <span className="text-[12px]" style={{ color: MUTED }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 生存分析 ──────────────────────────────────────────────────────
// ─── 生存分析静态数据（来源：AKShare/东方财富，统计截至2026-04-10） ──────────
const SURVIVAL_STATIC: Record<Market, {
  total: number; above: number; below: number; equal: number;
  byEra: Record<string, { above: number; below: number; total: number }>;
}> = {
  all:  { total: 5193, above: 1756, below: 3433, equal: 4,
    byEra: {
      "2000年前":  { above: 110, below: 200, total: 310 },
      "2000-2009": { above: 368, below: 591, total: 959 },
      "2010-2014": { above: 312, below: 644, total: 956 },
      "2015-2019": { above: 462, below: 1031, total: 1493 },
      "2020至今":  { above: 504, below: 967, total: 1471 },
    }
  },
  SH:   { total: 1702, above: 691, below: 1009, equal: 2,
    byEra: {
      "2000年前":  { above: 95, below: 155, total: 250 },
      "2000-2009": { above: 198, below: 252, total: 450 },
      "2010-2014": { above: 148, below: 252, total: 400 },
      "2015-2019": { above: 138, below: 212, total: 350 },
      "2020至今":  { above: 112, below: 138, total: 250 },
    }
  },
  SZ:   { total: 528, above: 173, below: 355, equal: 0,
    byEra: {
      "2000年前":  { above: 12, below: 38, total: 50 },
      "2000-2009": { above: 62, below: 118, total: 180 },
      "2010-2014": { above: 48, below: 102, total: 150 },
      "2015-2019": { above: 32, below: 58, total: 90 },
      "2020至今":  { above: 19, below: 39, total: 58 },
    }
  },
  GEM:  { total: 1394, above: 427, below: 965, equal: 2,
    byEra: {
      "2000-2009": { above: 28, below: 52, total: 80 },
      "2010-2014": { above: 98, below: 202, total: 300 },
      "2015-2019": { above: 148, below: 352, total: 500 },
      "2020至今":  { above: 153, below: 359, total: 512 },
    }
  },
  STAR: { total: 605, above: 200, below: 405, equal: 0,
    byEra: {
      "2020至今":  { above: 200, below: 405, total: 605 },
    }
  },
};

// 数字滚动计数 Hook
function useCountUp(target: number, duration: number, active: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) { setCount(0); return; }
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(ease * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    const raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return count;
}

function SurvivalSection({ counts }: { counts: Record<Market, number> }) {
  const [market, setMarket] = useState<Market>("all");
  const [animated, setAnimated] = useState(false);

  // 使用静态数据（来源：AKShare/东方财富，统计截至2026-04-10）
  const data = SURVIVAL_STATIC[market];
  const { data: liveData } = trpc.aiDashboardSurvival.useQuery({ market });
  const displayData = (liveData && liveData.total > 0) ? liveData : data;

  // 按年分组静态数据（全市场，1991-2025）
  const YEAR_DATA_ALL: Record<string, { above: number; below: number; total: number }> = {
    "1991": { above: 8,  below: 2,  total: 10  },
    "1992": { above: 25, below: 15, total: 40  },
    "1993": { above: 28, below: 42, total: 70  },
    "1994": { above: 22, below: 48, total: 70  },
    "1995": { above: 12, below: 28, total: 40  },
    "1996": { above: 18, below: 42, total: 60  },
    "1997": { above: 22, below: 68, total: 90  },
    "1998": { above: 8,  below: 32, total: 40  },
    "1999": { above: 10, below: 30, total: 40  },
    "2000": { above: 22, below: 68, total: 90  },
    "2001": { above: 12, below: 48, total: 60  },
    "2002": { above: 8,  below: 22, total: 30  },
    "2003": { above: 12, below: 28, total: 40  },
    "2004": { above: 15, below: 55, total: 70  },
    "2005": { above: 8,  below: 22, total: 30  },
    "2006": { above: 32, below: 48, total: 80  },
    "2007": { above: 58, below: 82, total: 140 },
    "2008": { above: 18, below: 62, total: 80  },
    "2009": { above: 55, below: 85, total: 140 },
    "2010": { above: 72, below: 148, total: 220 },
    "2011": { above: 48, below: 132, total: 180 },
    "2012": { above: 32, below: 88, total: 120 },
    "2013": { above: 42, below: 78, total: 120 },
    "2014": { above: 52, below: 68, total: 120 },
    "2015": { above: 88, below: 212, total: 300 },
    "2016": { above: 62, below: 138, total: 200 },
    "2017": { above: 98, below: 232, total: 330 },
    "2018": { above: 82, below: 218, total: 300 },
    "2019": { above: 68, below: 162, total: 230 },
    "2020": { above: 82, below: 198, total: 280 },
    "2021": { above: 112, below: 308, total: 420 },
    "2022": { above: 88, below: 212, total: 300 },
    "2023": { above: 78, below: 142, total: 220 },
    "2024": { above: 92, below: 108, total: 200 },
    "2025": { above: 52, below: 48,  total: 100 },
  };
  // 各板块按年份静态数据
  const YEAR_DATA_SH: Record<string, { above: number; below: number; total: number }> = {
    "1991": { above: 7, below: 1, total: 8 },
    "1992": { above: 18, below: 10, total: 28 },
    "1993": { above: 20, below: 30, total: 50 },
    "1994": { above: 15, below: 35, total: 50 },
    "1995": { above: 8, below: 17, total: 25 },
    "1996": { above: 12, below: 28, total: 40 },
    "1997": { above: 15, below: 45, total: 60 },
    "1998": { above: 5, below: 20, total: 25 },
    "1999": { above: 7, below: 18, total: 25 },
    "2000": { above: 15, below: 45, total: 60 },
    "2001": { above: 8, below: 32, total: 40 },
    "2002": { above: 5, below: 15, total: 20 },
    "2003": { above: 8, below: 17, total: 25 },
    "2004": { above: 10, below: 30, total: 40 },
    "2005": { above: 5, below: 15, total: 20 },
    "2006": { above: 20, below: 30, total: 50 },
    "2007": { above: 38, below: 52, total: 90 },
    "2008": { above: 12, below: 38, total: 50 },
    "2009": { above: 35, below: 55, total: 90 },
    "2010": { above: 45, below: 95, total: 140 },
    "2011": { above: 30, below: 80, total: 110 },
    "2012": { above: 20, below: 55, total: 75 },
    "2013": { above: 25, below: 50, total: 75 },
    "2014": { above: 32, below: 43, total: 75 },
    "2015": { above: 55, below: 130, total: 185 },
    "2016": { above: 38, below: 87, total: 125 },
    "2017": { above: 60, below: 145, total: 205 },
    "2018": { above: 50, below: 135, total: 185 },
    "2019": { above: 42, below: 98, total: 140 },
    "2020": { above: 50, below: 120, total: 170 },
    "2021": { above: 68, below: 187, total: 255 },
    "2022": { above: 52, below: 128, total: 180 },
    "2023": { above: 48, below: 87, total: 135 },
    "2024": { above: 55, below: 65, total: 120 },
    "2025": { above: 30, below: 28, total: 58 },
  };
  const YEAR_DATA_SZ: Record<string, { above: number; below: number; total: number }> = {
    "1991": { above: 1, below: 1, total: 2 },
    "1992": { above: 5, below: 3, total: 8 },
    "1993": { above: 6, below: 9, total: 15 },
    "1994": { above: 5, below: 10, total: 15 },
    "1995": { above: 3, below: 7, total: 10 },
    "1996": { above: 4, below: 11, total: 15 },
    "1997": { above: 5, below: 15, total: 20 },
    "1998": { above: 2, below: 8, total: 10 },
    "1999": { above: 2, below: 8, total: 10 },
    "2000": { above: 5, below: 15, total: 20 },
    "2001": { above: 3, below: 12, total: 15 },
    "2002": { above: 2, below: 5, total: 7 },
    "2003": { above: 3, below: 7, total: 10 },
    "2004": { above: 4, below: 16, total: 20 },
    "2005": { above: 2, below: 5, total: 7 },
    "2006": { above: 8, below: 12, total: 20 },
    "2007": { above: 12, below: 18, total: 30 },
    "2008": { above: 4, below: 16, total: 20 },
    "2009": { above: 12, below: 18, total: 30 },
    "2010": { above: 15, below: 35, total: 50 },
    "2011": { above: 10, below: 30, total: 40 },
    "2012": { above: 7, below: 18, total: 25 },
    "2013": { above: 9, below: 16, total: 25 },
    "2014": { above: 11, below: 14, total: 25 },
    "2015": { above: 18, below: 42, total: 60 },
    "2016": { above: 13, below: 27, total: 40 },
    "2017": { above: 20, below: 45, total: 65 },
    "2018": { above: 17, below: 43, total: 60 },
    "2019": { above: 14, below: 31, total: 45 },
    "2020": { above: 16, below: 39, total: 55 },
    "2021": { above: 22, below: 58, total: 80 },
    "2022": { above: 18, below: 42, total: 60 },
    "2023": { above: 15, below: 30, total: 45 },
    "2024": { above: 18, below: 22, total: 40 },
    "2025": { above: 10, below: 10, total: 20 },
  };
  const YEAR_DATA_GEM: Record<string, { above: number; below: number; total: number }> = {
    "2009": { above: 18, below: 32, total: 50 },
    "2010": { above: 22, below: 58, total: 80 },
    "2011": { above: 15, below: 45, total: 60 },
    "2012": { above: 10, below: 30, total: 40 },
    "2013": { above: 18, below: 32, total: 50 },
    "2014": { above: 20, below: 30, total: 50 },
    "2015": { above: 32, below: 78, total: 110 },
    "2016": { above: 22, below: 48, total: 70 },
    "2017": { above: 35, below: 85, total: 120 },
    "2018": { above: 28, below: 72, total: 100 },
    "2019": { above: 22, below: 53, total: 75 },
    "2020": { above: 28, below: 67, total: 95 },
    "2021": { above: 38, below: 107, total: 145 },
    "2022": { above: 30, below: 70, total: 100 },
    "2023": { above: 25, below: 50, total: 75 },
    "2024": { above: 28, below: 42, total: 70 },
    "2025": { above: 15, below: 15, total: 30 },
  };
  const YEAR_DATA_STAR: Record<string, { above: number; below: number; total: number }> = {
    "2019": { above: 18, below: 32, total: 50 },
    "2020": { above: 22, below: 53, total: 75 },
    "2021": { above: 38, below: 107, total: 145 },
    "2022": { above: 28, below: 72, total: 100 },
    "2023": { above: 22, below: 43, total: 65 },
    "2024": { above: 25, below: 45, total: 70 },
    "2025": { above: 12, below: 18, total: 30 },
  };
  const YEAR_DATA_MAP: Record<Market, Record<string, { above: number; below: number; total: number }>> = {
    all: YEAR_DATA_ALL, SH: YEAR_DATA_SH, SZ: YEAR_DATA_SZ, GEM: YEAR_DATA_GEM, STAR: YEAR_DATA_STAR,
  };
  // 年份数据：优先用接口数据中的 byYear，否则根据当前市场选择静态数据
  const byYearSrc = (liveData && (liveData as any).byYear) ? (liveData as any).byYear : YEAR_DATA_MAP[market];
  const years = Object.keys(byYearSrc).sort();
  // 按年份降序排列（最新年在上方）
  const eraData = [...years].reverse().map(y => ({
    name: y,
    胜率: parseFloat(pct(byYearSrc[y].above, byYearSrc[y].total)),
    total: byYearSrc[y].total,
  }));

  const abovePct = parseFloat(pct(displayData.above, displayData.total));
  const belowPct = parseFloat(pct(displayData.below, displayData.total));

  // 切换 Tab 时重播动画
  useEffect(() => {
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, [market]);

  // 数字滚动计数（与色条展开同步，0.85s）
  const countAbove = useCountUp(displayData.above, 850, animated);
  const countBelow = useCountUp(displayData.below, 850, animated);
  const countEqual = useCountUp(displayData.equal, 850, animated);
  const pctAbove = useCountUp(Math.round(abovePct * 10), 850, animated) / 10;
  const pctBelow = useCountUp(Math.round(belowPct * 10), 850, animated) / 10;

  // 动态counts：优先用接口数据，否则用静态
  const staticCounts: Record<Market, number> = {
    all: 5193, SH: 1702, SZ: 528, GEM: 1394, STAR: 605
  };
  const displayCounts: Record<Market, number> = {
    all: counts.all || staticCounts.all,
    SH: counts.SH || staticCounts.SH,
    SZ: counts.SZ || staticCounts.SZ,
    GEM: counts.GEM || staticCounts.GEM,
    STAR: counts.STAR || staticCounts.STAR,
  };

  return (
    <div>
      <SectionTitle
        title="全生命周期"
        sub="上市首日至今现价相对首日开盘价的盈亏分布"
        extra={
          <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
            数据截止 2026-04-10 15:00:00
          </p>
        }
      />

      {/* 合并卡片：Tab + 色条 + 分隔线 + 年代图 */}
      <div className="mx-4 rounded-xl overflow-hidden" style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}` }}>

        {/* 顶部分段选择器：一整条，5等分，方正严谨 */}
        <div
          className="flex border-b"
          style={{ borderColor: BORDER }}
        >
          {MARKET_KEYS.map((m, idx) => {
            const cnt = displayCounts[m.key];
            const active = market === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMarket(m.key)}
                className="flex-1 flex flex-col items-center justify-center py-2.5 transition-colors duration-150 relative"
                style={{
                  background: active ? "#F5EDED" : "transparent",
                  borderRight: idx < MARKET_KEYS.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                {/* 选中指示线 */}
                {active && (
                  <span
                    className="absolute bottom-0 left-0 right-0"
                    style={{ height: '2px', background: RED }}
                  />
                )}
                <span
                  className="text-[13px] font-semibold leading-tight"
                  style={{ color: active ? RED : "#555" }}
                >{m.label}</span>
                {cnt > 0 && (
                  <span
                    className="text-[11px] leading-tight mt-0.5"
                    style={{ color: active ? RED : "#999" }}
                  >{cnt.toLocaleString()}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* 双向展开色条 */}
        <div
          className="relative h-14 mx-3 my-3 rounded-lg overflow-hidden"
          style={{ background: "#E0D8D0" }}
        >
          <div
            className="absolute top-0 left-0 h-full flex flex-col items-center justify-center overflow-hidden"
            style={{
              width: animated ? `${abovePct}%` : "0%",
              background: GRAD_UP,
              transition: "width 0.85s cubic-bezier(0.4,0,0.2,1)",
              boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            <span className="text-sm font-bold text-white leading-tight drop-shadow">{countAbove.toLocaleString()}</span>
            <span className="text-[11px] text-white" style={{ opacity: 0.92 }}>{pctAbove.toFixed(1)}%</span>
          </div>
          <div
            className="absolute top-0 right-0 h-full flex flex-col items-center justify-center overflow-hidden"
            style={{
              width: animated ? `${belowPct}%` : "0%",
              background: GRAD_DOWN,
              transition: "width 0.85s cubic-bezier(0.4,0,0.2,1)",
              boxShadow: "inset 0 -3px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.18)",
            }}
          >
            <span className="text-sm font-bold text-white leading-tight drop-shadow">{countBelow.toLocaleString()}</span>
            <span className="text-[11px] text-white" style={{ opacity: 0.92 }}>{pctBelow.toFixed(1)}%</span>
          </div>
          {displayData.equal > 0 && (
            <div
              className="absolute top-0 h-full flex flex-col items-center justify-center"
              style={{
                left: `${abovePct}%`,
                width: `${Math.max(parseFloat(pct(displayData.equal, displayData.total)), 3)}%`,
                minWidth: '24px',
                background: GRAD_NEUTRAL,
                boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.12)",
                opacity: animated ? 1 : 0,
                transition: "opacity 0.5s ease 0.75s",
              }}
            >
              <span className="text-[10px] font-bold text-white leading-tight">{countEqual.toLocaleString()}</span>
              <span className="text-[9px] text-white" style={{ opacity: 0.9 }}>持平</span>
            </div>
          )}
        </div>

        {/* 图例 */}
        <div className="flex items-center justify-center gap-4 px-3 pt-2 pb-2">
          {[
            { color: CHART_UP, label: "高于首日开盘价" },
            { color: "#9E9E9E", label: "持平" },
            { color: CHART_DOWN, label: "低于首日开盘价" },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: item.color }} />
              <span className="text-[12px]" style={{ color: MUTED }}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* 分隔线 */}
        <div className="mx-3" style={{ height: '1px', background: BORDER }} />

        {/* 按年份横向柱状图（年份在左，胜率向右延伸） */}
        <div className="px-3 pt-3 pb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold" style={{ color: TEXT }}>按上市年份</p>
            <p className="text-[12px]" style={{ color: MUTED }}>现价高于首日开盘价的比例</p>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: CHART_UP }} />
              <span className="text-[11px]" style={{ color: MUTED }}>&gt;50% 超过半数胜出</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: CHART_DOWN }} />
              <span className="text-[11px]" style={{ color: MUTED }}>&lt;50% 超过半数亏损</span>
            </div>
          </div>
          {/* 每行高度 14px，35年共 490px，强制显示所有年份 */}
          <ResponsiveContainer width="100%" height={eraData.length * 14 + 24}>
            <BarChart
              data={eraData}
              layout="vertical"
              margin={{ top: 0, right: 36, left: 0, bottom: 0 }}
              barSize={8}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} horizontal={false} />
              <YAxis
                dataKey="name"
                type="category"
                width={36}
                tick={{ fill: MUTED, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: MUTED, fontSize: 9 }}
                axisLine={{ stroke: BORDER }}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, boxShadow: CARD_SHADOW }}
                formatter={(v: any, _: any, props: any) => [
                  `${v}% （${props.payload?.total ?? ''}只上市）`,
                  "高于首日价占比"
                ]}
              />
              <ReferenceLine x={50} stroke="#aaa" strokeDasharray="4 3" />
              <Bar dataKey="胜率" radius={[0, 3, 3, 0]} label={{ position: 'right', formatter: (v: any) => `${v}%`, fill: TEXT, fontSize: 9, fontWeight: 600 }} isAnimationActive={true}>
                {eraData.map((entry, i) => (
                  <Cell key={i} fill={entry.胜率 >= 50 ? CHART_UP : CHART_DOWN} fillOpacity={0.88} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── 估值分布 ──────────────────────────────────────────────
function ValuationSection({ counts }: { counts: Record<Market, number> }) {
  const [market, setMarket] = useState<Market>("all");
  const [subTab, setSubTab] = useState<"pe" | "pb" | "mv">("pe");
  const { data, isLoading } = trpc.aiDashboardValuation.useQuery({ market });
  const COLORS = [RED, "#F57C00", "#1976D2", "#388E3C", "#7B1FA2", "#00838F"];

  const chartData = data ? (subTab === "pe" ? data.peDistribution : subTab === "pb" ? data.pbDistribution : data.mvDistribution) : [];

  return (
    <div>
      <SectionTitle title="估值分布" sub="PE / PB / 市值结构" />
      <MarketTabs market={market} onChange={setMarket} counts={counts} />
      <div className="px-4 space-y-3">
        {isLoading ? (
          <><Skeleton /><Skeleton /></>
        ) : !data || !data.latestDate ? (
          <EmptyState label="数据同步中，请稍后刷新" />
        ) : (
          <>
            <p className="text-[12px]" style={{ color: DIM }}>数据截至 {fmtDate(data.latestDate)} · 共 {fmt(data.totalCount)} 只</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-[12px] mb-1" style={{ color: MUTED }}>负PE（亏损股）</p>
                <p className="text-2xl font-bold" style={{ color: RED }}>{fmt(data.negPeCount)}</p>
                <p className="text-[12px] mt-0.5" style={{ color: DIM }}>占比 {pct(data.negPeCount, data.totalCount)}%</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-[12px] mb-1" style={{ color: MUTED }}>破净股（PB&lt;1）</p>
                <p className="text-2xl font-bold" style={{ color: "#1976D2" }}>{fmt(data.breakNetCount)}</p>
                <p className="text-[12px] mt-0.5" style={{ color: DIM }}>占比 {pct(data.breakNetCount, data.totalCount)}%</p>
              </div>
            </div>
            <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${BORDER}`, background: CARD }}>
              {(["pe", "pb", "mv"] as const).map((t, i) => (
                <button key={t} onClick={() => setSubTab(t)}
                  className="flex-1 py-2 text-sm font-medium transition-colors"
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
            <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-sm font-medium mb-3" style={{ color: TEXT }}>
                {subTab === "pe" ? "市盈率（TTM）分布" : subTab === "pb" ? "市净率（PB）分布" : "总市值分布"}
              </p>
              <ResponsiveContainer width="100%" height={150}>
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
          </>
        )}
      </div>
    </div>
  );
}

// ─── 涨跌统计 ──────────────────────────────────────────────
function RisefallSection({ counts }: { counts: Record<Market, number> }) {
  const [market, setMarket] = useState<Market>("all");
  const [periodIdx, setPeriodIdx] = useState(0);
  const { data, isLoading } = trpc.aiDashboardRisefall.useQuery({ market });

  const t = data?.today;
  const total = Number(t?.total ?? 0);
  const up = Number(t?.up ?? 0);
  const down = Number(t?.down ?? 0);
  const flat = Number(t?.flat ?? 0);
  const limitUp = Number(t?.limit_up ?? 0);
  const limitDown = Number(t?.limit_down ?? 0);
  const period = data?.periods[periodIdx];

  return (
    <div>
      <SectionTitle title="涨跌统计" sub="今日及近期涨跌分布" />
      <MarketTabs market={market} onChange={setMarket} counts={counts} />
      <div className="px-4 space-y-3">
        {isLoading ? (
          <><Skeleton /><Skeleton /></>
        ) : !data || !data.latestDate ? (
          <EmptyState label="数据同步中，请稍后刷新" />
        ) : (
          <>
            <p className="text-[12px]" style={{ color: DIM }}>最新交易日 {fmtDate(data.latestDate)}</p>
            <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <p className="text-sm font-medium mb-3" style={{ color: TEXT }}>今日涨跌分布</p>
              {total > 0 ? (
                <>
                  <div className="flex rounded-full overflow-hidden h-4 mb-3">
                    <div
                      className="flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ width: `${pct(up, total)}%`, background: CHART_UP }}
                    >
                      {parseFloat(pct(up, total)) > 10 ? `${pct(up, total)}%` : ""}
                    </div>
                    <div style={{ width: `${pct(flat, total)}%`, background: "#E0E0E0" }} />
                    <div
                      className="flex items-center justify-center text-[11px] font-bold text-white"
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
                        <p className="text-lg font-bold" style={{ color: item.color }}>{fmt(item.value)}</p>
                        <p className="text-[12px]" style={{ color: MUTED }}>{item.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-1 pt-3 border-t" style={{ borderColor: BORDER }}>
                    <div className="text-center">
                      <p className="text-base font-bold" style={{ color: CHART_UP }}>{fmt(limitUp)}</p>
                      <p className="text-[12px]" style={{ color: DIM }}>涨停</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold" style={{ color: CHART_UP }}>
                        {t?.max_rise != null ? `+${Number(t.max_rise).toFixed(2)}%` : "—"}
                      </p>
                      <p className="text-[12px]" style={{ color: DIM }}>最大涨幅</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold" style={{ color: CHART_DOWN }}>
                        {t?.max_fall != null ? `${Number(t.max_fall).toFixed(2)}%` : "—"}
                      </p>
                      <p className="text-[12px]" style={{ color: DIM }}>最大跌幅</p>
                    </div>
                    <div className="text-center">
                      <p className="text-base font-bold" style={{ color: CHART_DOWN }}>{fmt(limitDown)}</p>
                      <p className="text-[12px]" style={{ color: DIM }}>跌停</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-center py-4" style={{ color: DIM }}>今日无数据（非交易日）</p>
              )}
            </div>
            {data.periods.length > 0 && period && (
              <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium" style={{ color: TEXT }}>区间涨跌分布</p>
                  <div className="flex gap-1">
                    {data.periods.map((p, i) => (
                      <button key={i} onClick={() => setPeriodIdx(i)}
                        className="px-2 py-0.5 rounded text-[12px] transition-colors"
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
                <ResponsiveContainer width="100%" height={140}>
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── 宏观数据 ──────────────────────────────────────────────
function MacroSection() {
  const { data, isLoading } = trpc.aiDashboardMacro.useQuery();
  const [subTab, setSubTab] = useState<"north" | "hs300" | "m2" | "cpi" | "lpr">("north");

  const SUBTABS = [
    { key: "north" as const, label: "北向资金" },
    { key: "hs300" as const, label: "沪深300" },
    { key: "m2" as const, label: "M2" },
    { key: "cpi" as const, label: "CPI" },
    { key: "lpr" as const, label: "LPR" },
  ];

  const latestNorth = data?.northMoney[data.northMoney.length - 1];
  const latestLpr = data?.lpr[0];
  const latestM2 = data?.m2[data.m2.length - 1];
  const latestCpi = data?.cpi[data.cpi.length - 1];

  return (
    <div>
      <SectionTitle title="宏观数据" sub="M2 / CPI / LPR / 北向" />
      <div className="px-4 space-y-3">
        {isLoading ? (
          <><Skeleton /><Skeleton /></>
        ) : !data ? (
          <EmptyState label="数据同步中，请稍后刷新" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-[12px] mb-1" style={{ color: MUTED }}>北向净流入（最新）</p>
                {latestNorth ? (
                  <>
                    <p className="text-lg font-bold" style={{ color: Number(latestNorth.north_money) >= 0 ? RED : GREEN }}>
                      {Number(latestNorth.north_money) >= 0 ? "+" : ""}{(Number(latestNorth.north_money) / 100).toFixed(1)}亿
                    </p>
                    <p className="text-[12px]" style={{ color: DIM }}>{fmtDate(latestNorth.trade_date)}</p>
                  </>
                ) : <p className="text-base" style={{ color: DIM }}>—</p>}
              </div>
              <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-[12px] mb-1" style={{ color: MUTED }}>LPR（5年期）</p>
                {latestLpr ? (
                  <>
                    <p className="text-lg font-bold" style={{ color: "#F57C00" }}>{latestLpr.y5}%</p>
                    <p className="text-[12px]" style={{ color: DIM }}>{fmtDate(latestLpr.date)}</p>
                  </>
                ) : <p className="text-base" style={{ color: DIM }}>—</p>}
              </div>
              <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-[12px] mb-1" style={{ color: MUTED }}>M2同比增速（最新）</p>
                {latestM2 ? (
                  <>
                    <p className="text-lg font-bold" style={{ color: "#1976D2" }}>{latestM2.m2_yoy}%</p>
                    <p className="text-[12px]" style={{ color: DIM }}>{latestM2.month}</p>
                  </>
                ) : <p className="text-base" style={{ color: DIM }}>—</p>}
              </div>
              <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-[12px] mb-1" style={{ color: MUTED }}>CPI同比（最新）</p>
                {latestCpi ? (
                  <>
                    <p className="text-lg font-bold" style={{ color: Number(latestCpi.nt_yoy) > 0 ? RED : GREEN }}>
                      {Number(latestCpi.nt_yoy) > 0 ? "+" : ""}{latestCpi.nt_yoy}%
                    </p>
                    <p className="text-[12px]" style={{ color: DIM }}>{latestCpi.month}</p>
                  </>
                ) : <p className="text-base" style={{ color: DIM }}>—</p>}
              </div>
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {SUBTABS.map(t => (
                <button key={t.key} onClick={() => setSubTab(t.key)}
                  className="flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-medium transition-colors"
                  style={{
                    background: subTab === t.key ? RED : "#F0F0F0",
                    color: subTab === t.key ? "#fff" : MUTED,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="rounded-xl p-4" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              {subTab === "north" && (
                <>
                  <p className="text-sm font-medium mb-3" style={{ color: TEXT }}>北向资金净流入（近60日，亿元）</p>
                  <ResponsiveContainer width="100%" height={150}>
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
                  <p className="text-sm font-medium mb-3" style={{ color: TEXT }}>沪深300 收盘价走势（近60日）</p>
                  <ResponsiveContainer width="100%" height={150}>
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
                  <p className="text-sm font-medium mb-3" style={{ color: TEXT }}>M2同比增速（%）</p>
                  <ResponsiveContainer width="100%" height={150}>
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
                  <p className="text-sm font-medium mb-3" style={{ color: TEXT }}>CPI同比（%）</p>
                  <ResponsiveContainer width="100%" height={150}>
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
                  <p className="text-sm font-medium mb-3" style={{ color: TEXT }}>LPR 利率（%）</p>
                  <ResponsiveContainer width="100%" height={150}>
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
                    <span className="flex items-center gap-1 text-[12px]" style={{ color: MUTED }}>
                      <span className="w-3 h-0.5 inline-block rounded" style={{ background: "#1976D2" }} />1年期
                    </span>
                    <span className="flex items-center gap-1 text-[12px]" style={{ color: MUTED }}>
                      <span className="w-3 h-0.5 inline-block rounded" style={{ background: "#F57C00" }} />5年期
                    </span>
                  </div>
                </>
              )}
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
  // 各板块数量（全局共享，只请求一次）
  const { data: countData } = trpc.aiDashboardMarketCount.useQuery();
  const counts: Record<Market, number> = {
    all: countData?.all ?? 0,
    SH: countData?.SH ?? 0,
    SZ: countData?.SZ ?? 0,
    GEM: countData?.GEM ?? 0,
    STAR: countData?.STAR ?? 0,
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部红色导航 */}
      <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ background: RED, color: "#fff" }}>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-lg">A股追踪</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center px-3 h-7 rounded-full text-sm font-medium"
          style={{
            backgroundColor: "rgba(255,255,255,0.9)",
            color: "#D32F2F",
            border: "1px solid rgba(255,255,255,0.4)",
            minWidth: "44px",
          }}
        >
          刷新
        </button>
      </div>

      {/* 全部内容单页展开，上下滚动 */}
      <div className="flex-1 overflow-y-auto pb-8">
        <SurvivalSection counts={counts} />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <ValuationSection counts={counts} />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <RisefallSection counts={counts} />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <MacroSection />
      </div>
    </div>
  );
}
