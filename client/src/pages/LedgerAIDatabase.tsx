/**
 * LedgerAIDatabase.tsx
 * A股全景仪表盘 — 单页展开模式
 * 路径: /ledger/:id/ai-database
 * 风格与 LedgerDetailAA 一致：顶部 #D32F2F，页面背景 #FAF3ED，卡片白色
 */
import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell, Area, AreaChart, Legend
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
type Market = "all" | "SH" | "SZ" | "GEM" | "STAR" | "DELISTED";
const MARKET_KEYS: { key: Market; label: string }[] = [
  { key: "all", label: "全市场" },
  { key: "SH", label: "沪市" },
  { key: "SZ", label: "深市" },
  { key: "GEM", label: "创业板" },
  { key: "STAR", label: "科创板" },
  { key: "DELISTED", label: "退市" },
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
      <div className="w-1 rounded-full mt-1 flex-shrink-0" style={{ height: '32px', background: GRAD_UP }} />
      <div className="flex-1 min-w-0">
        {/* 标题行：标题左对齐 + 截止时间右对齐，同一行 */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-base font-bold flex-shrink-0" style={{ color: TEXT }}>{title}</p>
          {extra && <div className="flex-shrink-0">{extra}</div>}
        </div>
        {/* 副标题行 */}
        <p className="text-[12px] mt-0.5" style={{ color: MUTED }}>{sub}</p>
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
// // 静态备用数据已删除，全部改为从后端 ts_daily 实时计算;

// ─── 年份横向柱状图（自定义CSS动效） ──────────────────────────────────────
const STOCK_GREEN = "#00B050"; // A股标准股票绿
const STOCK_GREEN_GRAD = "linear-gradient(90deg, #00B050 0%, #00C853 100%)";

function EraBarChart({
  data,
  animated,
  transitioning,
}: {
  data: { name: string; 低于首日: number; total: number }[];
  animated: boolean;
  transitioning: boolean;
}) {
  // 每根柱子的实时百分比（用于滚动数字和宽度展开）
  const [displayPcts, setDisplayPcts] = useState<number[]>([]);

  useEffect(() => {
    setDisplayPcts(new Array(data.length).fill(0));
  }, [data.length, transitioning]);

  useEffect(() => {
    if (!animated || data.length === 0) return;
     const duration = 1080; // ms（延长20%）
    const start = performance.now();
    const targets = data.map(d => d["低于首日"]);
    const frame = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart: 开始快、到终点前明显减速
      const ease = 1 - Math.pow(1 - progress, 4);
      setDisplayPcts(targets.map(t => parseFloat((ease * t).toFixed(1))));
      if (progress < 1) requestAnimationFrame(frame);
    };
    const raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [animated, data]);

  if (data.length === 0) return null;

  const ROW_H = 14; // 每行高度px（再缩小一半）
  const ROW_GAP = 0; // 行间距再缩小一半（去除）
  const BAR_H = 11;  // 柱子高度px（增加约5%）
  const LABEL_W = 32; // 左侧年份标签宽度
  const PCT_W = 36;  // 右侧百分比宽度

  return (
    <div style={{ width: '100%' }}>
      {/* X轴刻度行 */}
      <div className="flex mb-1" style={{ paddingLeft: LABEL_W }}>
        {[0, 25, 50, 75, 100].map(v => (
          <div key={v} className="flex-1 text-center" style={{ fontSize: 8, color: MUTED, lineHeight: 1 }}>
            {v === 0 ? '' : `${v}%`}
          </div>
        ))}
      </div>
      {/* 柱子行 */}
      {data.map((row, i) => {
        const curPct = displayPcts[i] ?? 0;
        // 防止数字超出轨道右边界：当进度接近100%时数字改为显示在柱子内部
        const nearEnd = curPct > 82;
        return (
          <div
            key={row.name}
            className="flex items-center"
            style={{ height: ROW_H + ROW_GAP, marginBottom: 0 }}
          >
            {/* 年份标签 */}
            <div
              className="flex-shrink-0 text-right pr-1.5"
              style={{ width: LABEL_W, fontSize: 9, color: MUTED, lineHeight: `${ROW_H}px` }}
            >
              {row.name}
            </div>
            {/* 柱子轨道区（包含跟随数字） */}
            <div
              className="relative flex-1"
              style={{ height: BAR_H, borderRadius: 2, background: '#E8E0D8' }}
            >
              {/* 50% 参考线 */}
              <div
                className="absolute top-0 bottom-0"
                style={{ left: '50%', width: 1, background: '#bbb', opacity: 0.6 }}
              />
              {/* 动效柱子 */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: transitioning ? '0%' : `${curPct}%`,
                  background: STOCK_GREEN_GRAD,
                  borderRadius: '2px 3px 3px 2px',
                  transition: transitioning ? 'none' : undefined,
                  boxShadow: '0 1px 3px rgba(0,176,80,0.25)',
                }}
              />
              {/* 百分比数字：内置在柱子内部靠右端，白色 */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  right: transitioning ? '100%' : `${100 - curPct}%`,
                  paddingRight: 3,
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                  fontSize: 9,
                  fontWeight: 700,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                  transition: transitioning ? 'none' : undefined,
                  pointerEvents: 'none',
                  opacity: curPct < 8 ? 0 : 1, // 进度太短时隐藏数字避免拥挤
                }}
              >
                {transitioning ? '' : `${curPct.toFixed(1)}%`}
              </div>
            </div>
          </div>
        );
      })}
      {/* X轴底线 */}
      <div style={{ marginLeft: LABEL_W, height: 1, background: BORDER, marginTop: 2 }} />
    </div>
  );
}

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
  const [transitioning, setTransitioning] = useState(false); // true时禁用transition，让宽度瞬间归零

  // 全部从后端 ts_daily 实时计算，无静态备用数据
  const { data: liveData, isLoading: survivalLoading } = trpc.aiDashboardSurvival.useQuery({ market });

  // 趋势折线图
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const { data: trendData, isLoading: trendLoading } = trpc.aiDashboardTrend.useQuery({ granularity: trendGranularity, market });
  const displayData = liveData ?? { total: 0, above: 0, below: 0, equal: 0, byEra: {}, byYear: {} };

  // 年份数据：补全 1990 年到当前年份所有年份，没有数据的显示为 0
  const byYearSrc = (liveData as any)?.byYear ?? {};
  const currentYear = new Date().getFullYear();
  const allYears: string[] = [];
  for (let y = 1990; y <= currentYear; y++) allYears.push(String(y));
  // 按年份降序排列（最新年在上方）
  const eraData = [...allYears].reverse().map(y => ({
    name: y,
    低于首日: byYearSrc[y] ? parseFloat(pct(byYearSrc[y].below, byYearSrc[y].total)) : 0,
    total: byYearSrc[y]?.total ?? 0,
  }));

  const abovePct = parseFloat(pct(displayData.above, displayData.total));
  const belowPct = parseFloat(pct(displayData.below, displayData.total));

  // 切换 Tab 时重播动画：先禁用transition让宽度瞬间归零，再延迟触发展开
  useEffect(() => {
    setAnimated(false);
    setTransitioning(true); // 禁用transition，宽度即刻归零
    const t1 = setTimeout(() => {
      setTransitioning(false); // 恢复transition
      const t2 = setTimeout(() => setAnimated(true), 30); // 再触发展开
      return () => clearTimeout(t2);
    }, 50);
    return () => clearTimeout(t1);
  }, [market]);

  // 数字滚动计数（与色条展开同步，0.85s）
  const countAbove = useCountUp(displayData.above, 850, animated);
  const countBelow = useCountUp(displayData.below, 850, animated);
  const countEqual = useCountUp(displayData.equal, 850, animated);
  const pctAbove = useCountUp(Math.round(abovePct * 10), 850, animated) / 10;
  const pctBelow = useCountUp(Math.round(belowPct * 10), 850, animated) / 10;

  // 直接使用后端返回的实时股票数量
  const displayCounts: Record<Market, number> = {
    all: counts.all || 0,
    SH: counts.SH || 0,
    SZ: counts.SZ || 0,
    GEM: counts.GEM || 0,
    STAR: counts.STAR || 0,
    DELISTED: (counts as any).DELISTED || 0,
  };

  return (
    <div>
      <SectionTitle
        title="全生命周期"
        sub="上市首日至今现价相对首日开盘价的盈亏分布"
        extra={
          <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
            {survivalLoading ? '数据加载中...' : liveData ? `数据截至 ${(liveData as any).latestDate || ''}` : '数据加载中...'}
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
              transition: transitioning ? "none" : "width 0.85s cubic-bezier(0.4,0,0.2,1)",
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
              transition: transitioning ? "none" : "width 0.85s cubic-bezier(0.4,0,0.2,1)",
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

        {/* 趋势折线图 */}
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold" style={{ color: TEXT }}>高于/低于首日开盘价趋势</p>
            <div className="flex gap-1">
              {(['day', 'week', 'month', 'year'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setTrendGranularity(g)}
                  className="px-2 py-0.5 rounded text-[12px] transition-colors"
                  style={{
                    background: trendGranularity === g ? RED : 'transparent',
                    color: trendGranularity === g ? '#fff' : MUTED,
                    border: `1px solid ${trendGranularity === g ? RED : BORDER}`,
                  }}
                >
                  {g === 'day' ? '日' : g === 'week' ? '周' : g === 'month' ? '月' : '年'}
                </button>
              ))}
            </div>
          </div>
          {trendLoading ? (
            <div className="flex items-center justify-center" style={{ height: 120 }}>
              <span className="text-[12px]" style={{ color: MUTED }}>加载中...</span>
            </div>
          ) : !trendData?.points?.length ? (
            <div className="flex items-center justify-center" style={{ height: 120 }}>
              <span className="text-[12px]" style={{ color: MUTED }}>暂无数据</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={trendData.points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradAbove" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_UP} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={CHART_UP} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradBelow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_DOWN} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={CHART_DOWN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9, fill: MUTED }}
                  tickLine={false}
                  axisLine={{ stroke: BORDER }}
                  interval="preserveStartEnd"
                  tickFormatter={(v: string) => {
                    if (trendGranularity === 'day') return v.slice(5); // MM-DD
                    if (trendGranularity === 'week') return v.slice(5); // W##
                    if (trendGranularity === 'month') return v.slice(2); // YY-MM
                    return v; // YYYY
                  }}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: MUTED }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 8px' }}
                  labelStyle={{ color: TEXT, fontWeight: 600, marginBottom: 2 }}
                  formatter={(value: number, name: string) => [
                    value.toLocaleString(),
                    name === 'above' ? '高于首日开盘价' : name === 'below' ? '低于首日开盘价' : '持平'
                  ]}
                />
                <Area type="monotone" dataKey="above" stroke={CHART_UP} strokeWidth={1.5} fill="url(#gradAbove)" dot={false} />
                <Area type="monotone" dataKey="equal" stroke="#9E9E9E" strokeWidth={1} fill="none" dot={false} strokeDasharray="3 3" />
                <Area type="monotone" dataKey="below" stroke={CHART_DOWN} strokeWidth={1.5} fill="url(#gradBelow)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
          {/* 图例 */}
          <div className="flex items-center justify-center gap-4 pt-1">
            {[
              { color: CHART_UP, label: '高于首日开盘价', dash: false },
              { color: '#9E9E9E', label: '持平', dash: true },
              { color: CHART_DOWN, label: '低于首日开盘价', dash: false },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                <svg width="16" height="8">
                  {item.dash
                    ? <line x1="0" y1="4" x2="16" y2="4" stroke={item.color} strokeWidth="1.5" strokeDasharray="3 3" />
                    : <line x1="0" y1="4" x2="16" y2="4" stroke={item.color} strokeWidth="2" />}
                </svg>
                <span className="text-[11px]" style={{ color: MUTED }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 分隔线2 */}
        <div className="mx-3 mb-1" style={{ height: '1px', background: BORDER }} />

        {/* 按年份横向柱状图（自定义CSS动效版） */}
        <div className="px-3 pt-3 pb-3">
          <p className="text-sm font-semibold mb-2" style={{ color: TEXT }}>按上市年份（最新价低于首日开盘价占比）</p>
          <EraBarChart data={eraData} animated={animated} transitioning={transitioning} />
        </div>
      </div>
    </div>
  );
}

// ─── 涨停聚集效应 ─────────────────────────────────────────────
function BunchingEffectSection() {
  const [market, setMarket] = useState<"all" | "SH" | "SZ" | "GEM" | "STAR">("all");
  const { data, isLoading, error } = trpc.aiDashboardBunchingEffect.useQuery({ market });

  const MARKET_TABS = [
    { key: "all" as const, label: "全市场" },
    { key: "SH" as const, label: "沪市" },
    { key: "SZ" as const, label: "深市" },
    { key: "GEM" as const, label: "创业板" },
    { key: "STAR" as const, label: "科创板" },
  ];

  const upRatio = data?.upBunchRatio ?? 0;
  const downRatio = data?.downBunchRatio ?? 0;
  const avgRatio = (upRatio + downRatio) / 2;
  const manipulationLevel = avgRatio >= 8 ? "极高" : avgRatio >= 5 ? "高" : avgRatio >= 3 ? "中等" : "较低";
  const manipulationColor = avgRatio >= 8 ? RED : avgRatio >= 5 ? "#F57C00" : avgRatio >= 3 ? "#FBC02D" : GREEN;

  return (
    <div>
      <SectionTitle title="涨停聚集效应" sub="全历史涨幅分布 · 涨跌停制度截断效应分析"
        extra={
          <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
            {isLoading ? '数据加载中...' : data?.latestDate ? `数据截至 ${data.latestDate}` : ''}
          </p>
        }
      />
      <div className="mx-4 rounded-xl overflow-hidden" style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}` }}>
        <div className="flex border-b" style={{ borderColor: BORDER }}>
          {MARKET_TABS.map((m, idx) => {
            const active = market === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMarket(m.key)}
                className="flex-1 flex flex-col items-center justify-center py-2.5 transition-colors duration-150 relative"
                style={{
                  background: active ? "#F5EDED" : "transparent",
                  borderRight: idx < MARKET_TABS.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                {active && <span className="absolute bottom-0 left-0 right-0" style={{ height: '2px', background: RED }} />}
                <span className="text-[13px] font-semibold" style={{ color: active ? RED : "#555" }}>{m.label}</span>
              </button>
            );
          })}
        </div>
        <div className="p-3">
          {isLoading ? (
            <><Skeleton /><Skeleton /></>
          ) : error ? (
            <EmptyState label={`加载失败: ${error.message.slice(0, 40)}`} />
          ) : !data || data.totalCount === 0 ? (
            <EmptyState label="历史数据建设中，首次运行需等待历史数据回填完成" />
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 rounded-lg p-2.5 text-center" style={{ background: "#FFF5F5", border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] mb-0.5" style={{ color: MUTED }}>涨停聚集倍数</p>
                  <p className="text-lg font-bold" style={{ color: RED }}>{upRatio}x</p>
                  <p className="text-[10px]" style={{ color: DIM }}>+10% vs +9%</p>
                </div>
                <div className="flex-1 rounded-lg p-2.5 text-center" style={{ background: "#F5FFF5", border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] mb-0.5" style={{ color: MUTED }}>跌停聚集倍数</p>
                  <p className="text-lg font-bold" style={{ color: GREEN }}>{downRatio}x</p>
                  <p className="text-[10px]" style={{ color: DIM }}>-10% vs -9%</p>
                </div>
                <div className="flex-1 rounded-lg p-2.5 text-center" style={{ background: "#FAFAFA", border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] mb-0.5" style={{ color: MUTED }}>聚集强度</p>
                  <p className="text-lg font-bold" style={{ color: manipulationColor }}>{manipulationLevel}</p>
                  <p className="text-[10px]" style={{ color: DIM }}>综合评估</p>
                </div>
              </div>
              <p className="text-[11px] mb-2" style={{ color: DIM }}>
                X轴：日涨幅区间（每格1%）· Y轴：历史出现次数 · 竖线：±10%/±20%涨跌停边界
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.buckets} margin={{ top: 10, right: 4, left: -20, bottom: 0 }} barCategoryGap="2%">
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fill: MUTED, fontSize: 8 }}
                    axisLine={{ stroke: BORDER }}
                    tickLine={false}
                    tickFormatter={(v) => v % 2 === 0 ? `${v}%` : ''}
                    interval={0}
                  />
                  <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                  <Tooltip
                    formatter={(value: any) => [`${Number(value).toLocaleString('zh-CN')} 次`, '出现次数']}
                    labelFormatter={(label) => `涨幅 ${label}%`}
                    contentStyle={{ fontSize: 11, background: CARD, border: `1px solid ${BORDER}` }}
                  />
                  <Bar dataKey="count" name="count" radius={[1, 1, 0, 0]}>
                    {data.buckets.map((entry, i) => {
                      const isAt10 = entry.bucket === 10;
                      const isAtMinus10 = entry.bucket === -10;
                      const isAt20 = entry.bucket === 20;
                      const isAtMinus20 = entry.bucket === -20;
                      const isHighlight = isAt10 || isAtMinus10 || isAt20 || isAtMinus20;
                      const color = isAt10 || isAt20 ? RED : isAtMinus10 || isAtMinus20 ? GREEN : entry.bucket > 0 ? "#EF9A9A" : entry.bucket < 0 ? "#A5D6A7" : "#BDBDBD";
                      return <Cell key={i} fill={color} opacity={isHighlight ? 1 : 0.75} />;
                    })}
                  </Bar>
                  <ReferenceLine x={10} stroke={RED} strokeDasharray="4 3" strokeWidth={1.5}
                    label={{ value: '+10%', position: 'insideTopLeft', fill: RED, fontSize: 9, fontWeight: 'bold' }} />
                  <ReferenceLine x={-10} stroke={GREEN} strokeDasharray="4 3" strokeWidth={1.5}
                    label={{ value: '-10%', position: 'insideTopRight', fill: GREEN, fontSize: 9, fontWeight: 'bold' }} />
                  <ReferenceLine x={20} stroke={RED} strokeDasharray="4 3" strokeWidth={1}
                    label={{ value: '+20%', position: 'insideTopLeft', fill: RED, fontSize: 8 }} />
                  <ReferenceLine x={-20} stroke={GREEN} strokeDasharray="4 3" strokeWidth={1}
                    label={{ value: '-20%', position: 'insideTopRight', fill: GREEN, fontSize: 8 }} />
                  <ReferenceLine x={0} stroke="#9E9E9E" strokeDasharray="3 3" strokeWidth={1} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap items-center gap-3 mt-2 mb-1 px-1">
                <div className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#EF9A9A" }} />
                  <span className="text-[10px]" style={{ color: DIM }}>上涨</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#A5D6A7" }} />
                  <span className="text-[10px]" style={{ color: DIM }}>下跌</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: RED }} />
                  <span className="text-[10px]" style={{ color: DIM }}>+10%涨停峰</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: GREEN }} />
                  <span className="text-[10px]" style={{ color: DIM }}>-10%跌停峰</span>
                </div>
              </div>
              <div className="mt-2 px-2 py-2 rounded-lg" style={{ background: "#FAFAFA", border: `1px solid ${BORDER}` }}>
                <p className="text-[11px] leading-relaxed" style={{ color: DIM }}>
                  {`涨停聚集倍数 ${upRatio}x：+10%涨停出现次数是相邻区间(+9%)的 ${upRatio} 倍。`}
                  {upRatio >= 5
                    ? `这一显著聚集主要反映涨停板制度的截断效应：价格在接近涨停时被制度强制停止，导致大量交易堆积在 +10% 边界。`
                    : upRatio >= 3
                    ? `存在一定聚集效应，反映涨停板制度对价格分布有明显截断作用。`
                    : `聚集效应较弱，价格分布相对自然。`}
                  {` 跌停聚集倍数 ${downRatio}x，综合聚集强度评估为「${manipulationLevel}」。`}
                </p>
              </div>
              <div className="mt-2 px-2 py-1.5 rounded-lg" style={{ background: "#F5F5F5", border: `1px solid ${BORDER}` }}>
                <span className="text-[10px]" style={{ color: MUTED }}>样本：全历史 {fmt(data.totalCount)} 条日涨跌幅记录（涨幅 -20%~+20%）</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 涨天率正态分布 ──────────────────────────────────────────
function UpRateDistSection() {
  const [market, setMarket] = useState<"all" | "SH" | "SZ" | "GEM" | "STAR">("all");
  const { data, isLoading, error } = trpc.aiDashboardUpRateDist.useQuery({ market });
  // 调试日志
  if (error) console.error('[UpRateDistSection] 请求失败:', market, error.message);

  // 正态曲线叠加数据（桶宽2%）
  const chartData = (data?.buckets ?? []).map((b: any) => {
    const x = b.min + 1; // 桶中心值（桶宽2%，中心在+1处）
    const mean = data?.mean ?? 50;
    const std = data?.stdDev ?? 5;
    const normalY = std > 0
      ? Math.round((data?.totalCount ?? 0) * 2 / (std * Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * Math.pow((x - mean) / std, 2)))
      : 0;
    return { ...b, normalY };
  });

  const MARKET_TABS = [
    { key: "all" as const, label: "全市场" },
    { key: "SH" as const, label: "沪市" },
    { key: "SZ" as const, label: "深市" },
    { key: "GEM" as const, label: "创业板" },
    { key: "STAR" as const, label: "科创板" },
  ];

  return (
    <div>
      <SectionTitle title="涨天率分布" sub="全市场在市股票历史涨天率正态分布"
        extra={
          <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
            {isLoading ? '数据加载中...' : data?.latestDate ? `数据截至 ${data.latestDate}` : ''}
          </p>
        }
      />
      <div className="mx-4 rounded-xl overflow-hidden" style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}` }}>
        {/* Tab */}
        <div className="flex border-b" style={{ borderColor: BORDER }}>
          {MARKET_TABS.map((m, idx) => {
            const active = market === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMarket(m.key)}
                className="flex-1 flex flex-col items-center justify-center py-2.5 transition-colors duration-150 relative"
                style={{
                  background: active ? "#F5EDED" : "transparent",
                  borderRight: idx < MARKET_TABS.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                {active && <span className="absolute bottom-0 left-0 right-0" style={{ height: '2px', background: RED }} />}
                <span className="text-[13px] font-semibold" style={{ color: active ? RED : "#555" }}>{m.label}</span>
              </button>
            );
          })}
        </div>
        {/* 内容 */}
        <div className="p-3">
          {isLoading ? (
            <><Skeleton /><Skeleton /></>
          ) : error ? (
            <EmptyState label={`加载失败: ${error.message.slice(0, 40)}`} />
          ) : !data ? (
            <EmptyState label="暂无数据" />
          ) : (
            <>
              {/* 统计摘要 */}
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1 rounded-lg p-2.5 text-center" style={{ background: "#FFF5F5", border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] mb-0.5" style={{ color: MUTED }}>样本股票数</p>
                  <p className="text-lg font-bold" style={{ color: RED }}>{fmt(data.totalCount)}</p>
                </div>
                <div className="flex-1 rounded-lg p-2.5 text-center" style={{ background: "#FFF5F5", border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] mb-0.5" style={{ color: MUTED }}>平均涨天率</p>
                  <p className="text-lg font-bold" style={{ color: RED }}>{data.mean}%</p>
                </div>
                <div className="flex-1 rounded-lg p-2.5 text-center" style={{ background: "#F5F5F5", border: `1px solid ${BORDER}` }}>
                  <p className="text-[11px] mb-0.5" style={{ color: MUTED }}>标准差</p>
                  <p className="text-lg font-bold" style={{ color: TEXT }}>±{data.stdDev}%</p>
                </div>
              </div>
              {/* 说明文字 */}
              <p className="text-[11px] mb-2" style={{ color: DIM }}>
                X轴：涨天率区间（30%~70%，每格2%）· Y轴：股票数量 · 红线：正态曲线拟合
              </p>
              {/* 柱状图 + 正态曲线 */}
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={chartData} margin={{ top: 24, right: 4, left: -20, bottom: 0 }} barCategoryGap="8%">
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis
                    dataKey="min"
                    tick={{ fill: MUTED, fontSize: 9 }}
                    axisLine={{ stroke: BORDER }}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    interval={1}
                  />
                  <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value: any, name: string) => [
                      name === 'count' ? `${value} 只` : `${value} 只（拟合）`,
                      name === 'count' ? '实际数量' : '正态拟合'
                    ]}
                    labelFormatter={(label) => `涨天率 ${label}%-${Number(label)+2}%`}
                    contentStyle={{ fontSize: 11, background: CARD, border: `1px solid ${BORDER}` }}
                  />
                  <Bar dataKey="count" name="count" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry: any, i: number) => {
                      // 涨天率 ≥ 50% → 红色（偏涨），< 50% → 绿色（偏跌）
                      // 均值所在桶加深色加粗边框标注
                      const isMean = data.mean >= entry.min && data.mean < entry.max;
                      const isUp = entry.min >= 50;
                      const baseColor = isUp ? "#EF9A9A" : "#A5D6A7";
                      const deepColor = isUp ? RED : "#388E3C";
                      return (
                        <Cell
                          key={i}
                          fill={isMean ? deepColor : baseColor}
                          opacity={isMean ? 1 : 0.8}
                          stroke={isMean ? deepColor : "none"}
                          strokeWidth={isMean ? 2 : 0}
                        />
                      );
                    })}
                  </Bar>
                  <Line
                    type="monotone"
                    dataKey="normalY"
                    stroke={RED}
                    strokeWidth={2}
                    dot={false}
                    name="normalY"
                  />
                  <ReferenceLine
                    x={Math.floor((data.mean - 30) / 2) * 2 + 30}
                    stroke={RED}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: `均值${data.mean}%`, position: 'insideTopLeft', offset: 4, fill: RED, fontSize: 10, fontWeight: 'bold' }}
                  />
                  <ReferenceLine
                    x={50}
                    stroke="#9E9E9E"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{ value: '50%', position: 'insideTopRight', fill: MUTED, fontSize: 9 }}
                  />
                </BarChart>
              </ResponsiveContainer>
              {/* 颜色图例 */}
              <div className="flex items-center gap-3 mt-2 mb-1 px-1">
                <div className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#A5D6A7" }} />
                  <span className="text-[10px]" style={{ color: DIM }}>涨天率 &lt; 50%（偏空）</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "#EF9A9A" }} />
                  <span className="text-[10px]" style={{ color: DIM }}>涨天率 ≥ 50%（偏多）</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: RED }} />
                  <span className="text-[10px]" style={{ color: DIM }}>均值所在桶</span>
                </div>
              </div>
              {/* 分布解读 */}
              <div className="mt-1 px-2 py-2 rounded-lg" style={{ background: "#FAFAFA", border: `1px solid ${BORDER}` }}>
                <p className="text-[11px] leading-relaxed" style={{ color: DIM }}>
                  {data.mean > 50
                    ? `全市场平均涨天率 ${data.mean}%，高于50%基准，说明A股整体偏多头市场结构。`
                    : data.mean < 50
                    ? `全市场平均涨天率 ${data.mean}%，低于50%基准，说明A股整体偏空头市场结构。`
                    : `全市场平均涨天率接近50%，多空力量基本均衡。`
                  }
                  {` 标准差 ${data.stdDev}%，分布${data.stdDev < 5 ? '集中' : data.stdDev < 8 ? '适中' : '分散'}，个股涨天率差异${data.stdDev < 5 ? '较小' : data.stdDev < 8 ? '适中' : '较大'}。`}
                </p>
              </div>
              {/* 排除说明 */}
              <div className="mt-2 px-2 py-1.5 rounded-lg flex flex-wrap gap-x-4 gap-y-1" style={{ background: "#F5F5F5", border: `1px solid ${BORDER}` }}>
                <span className="text-[10px]" style={{ color: MUTED }}>样本说明：共统计 {fmt(data.totalCount)} 只在市股（上市满60天）</span>
                <span className="text-[10px]" style={{ color: MUTED }}>已排除退市股 {fmt(data.delistedCount)} 只</span>
                <span className="text-[10px]" style={{ color: MUTED }}>已排除新股（上市不足60天）{fmt(data.newStockCount)} 只</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 估值分布和涨跌统计专用 Tab（不含退市）
type MarketNoDelisted = "all" | "SH" | "SZ" | "GEM" | "STAR";
const MARKET_KEYS_NO_DELISTED: { key: MarketNoDelisted; label: string }[] = [
  { key: "all", label: "全市场" },
  { key: "SH", label: "沪市" },
  { key: "SZ", label: "深市" },
  { key: "GEM", label: "创业板" },
  { key: "STAR", label: "科创板" },
];

// ─── 估値分布 ──────────────────────────────────────────────
function ValuationSection({ counts }: { counts: Record<Market, number> }) {
  const [market, setMarket] = useState<MarketNoDelisted>("all");
  const [subTab, setSubTab] = useState<"pe" | "pb" | "mv">("pe");
  const { data, isLoading } = trpc.aiDashboardValuation.useQuery({ market });
  const COLORS = [RED, "#F57C00", "#1976D2", "#388E3C", "#7B1FA2", "#00838F"];

  const chartData = data ? (subTab === "pe" ? data.peDistribution : subTab === "pb" ? data.pbDistribution : data.mvDistribution) : [];

  return (
    <div>
      <SectionTitle title="估值分布" sub="PE / PB / 市值结构"
        extra={
          <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
            {isLoading ? '数据加载中...' : data?.latestDate ? `数据截至 ${data.latestDate}` : ''}
          </p>
        }
      />
      {/* 合并卡片：Tab + 内容 */}
      <div className="mx-4 rounded-xl overflow-hidden" style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}` }}>
        {/* 顶部内嵌 Tab */}
        <div className="flex border-b" style={{ borderColor: BORDER }}>
          {MARKET_KEYS_NO_DELISTED.map((m, idx) => {
            const cnt = counts[m.key];
            const active = market === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMarket(m.key)}
                className="flex-1 flex flex-col items-center justify-center py-2.5 transition-colors duration-150 relative"
                style={{
                  background: active ? "#F5EDED" : "transparent",
                  borderRight: idx < MARKET_KEYS_NO_DELISTED.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                {active && (
                  <span className="absolute bottom-0 left-0 right-0" style={{ height: '2px', background: RED }} />
                )}
                <span className="text-[13px] font-semibold leading-tight" style={{ color: active ? RED : "#555" }}>{m.label}</span>
                {cnt > 0 && (
                  <span className="text-[11px] leading-tight mt-0.5" style={{ color: active ? RED : "#999" }}>{cnt.toLocaleString()}</span>
                )}
              </button>
            );
          })}
        </div>
        {/* 内容区 */}
        <div className="p-3 space-y-3">
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
            <div className="rounded-xl p-4" style={{ background: "#FAFAFA", border: `1px solid ${BORDER}` }}>
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
    </div>
  );
}

// ─── 涨跌统计 ──────────────────────────────────────────────
function RisefallSection({ counts }: { counts: Record<Market, number> }) {
  const [market, setMarket] = useState<MarketNoDelisted>("all");
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
      <SectionTitle title="涨跌统计" sub="今日及近期涨跌分布"
        extra={
          <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
            {isLoading ? '数据加载中...' : data?.latestDate ? `数据截至 ${data.latestDate}` : ''}
          </p>
        }
      />
      {/* 合并卡片：Tab + 内容 */}
      <div className="mx-4 rounded-xl overflow-hidden" style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}` }}>
        {/* 顶部内嵌 Tab */}
        <div className="flex border-b" style={{ borderColor: BORDER }}>
          {MARKET_KEYS_NO_DELISTED.map((m, idx) => {
            const cnt = counts[m.key];
            const active = market === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMarket(m.key)}
                className="flex-1 flex flex-col items-center justify-center py-2.5 transition-colors duration-150 relative"
                style={{
                  background: active ? "#F5EDED" : "transparent",
                  borderRight: idx < MARKET_KEYS_NO_DELISTED.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                {active && (
                  <span className="absolute bottom-0 left-0 right-0" style={{ height: '2px', background: RED }} />
                )}
                <span className="text-[13px] font-semibold leading-tight" style={{ color: active ? RED : "#555" }}>{m.label}</span>
                {cnt > 0 && (
                  <span className="text-[11px] leading-tight mt-0.5" style={{ color: active ? RED : "#999" }}>{cnt.toLocaleString()}</span>
                )}
              </button>
            );
          })}
        </div>
        {/* 内容区 */}
        <div className="p-3 space-y-3">
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
                  <div className="grid grid-cols-2 gap-x-2 gap-y-3 pt-3 border-t" style={{ borderColor: BORDER }}>
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(200,0,0,0.05)' }}>
                      <span className="text-[12px]" style={{ color: DIM }}>涨停</span>
                      <span className="text-sm font-bold" style={{ color: CHART_UP }}>{fmt(limitUp)}</span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(200,0,0,0.05)' }}>
                      <span className="text-[12px]" style={{ color: DIM }}>最大涨幅</span>
                      <span className="text-sm font-bold" style={{ color: CHART_UP }}>
                        {t?.max_rise != null ? `+${Number(t.max_rise).toFixed(2)}%` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(0,150,0,0.05)' }}>
                      <span className="text-[12px]" style={{ color: DIM }}>跌停</span>
                      <span className="text-sm font-bold" style={{ color: CHART_DOWN }}>{fmt(limitDown)}</span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(0,150,0,0.05)' }}>
                      <span className="text-[12px]" style={{ color: DIM }}>最大跌幅</span>
                      <span className="text-sm font-bold" style={{ color: CHART_DOWN }}>
                        {t?.max_fall != null ? `${Number(t.max_fall).toFixed(2)}%` : "—"}
                      </span>
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
      <SectionTitle title="宏观数据" sub="M2 / CPI / LPR / 北向"
        extra={
          <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
            {isLoading ? '数据加载中...' : latestNorth?.trade_date ? `数据截至 ${latestNorth.trade_date}` : ''}
          </p>
        }
      />
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
                <button key={t.key} onClick={() => handleTabChange(t.key)}
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

// ─── 交易成本 Section ────────────────────────────────────────
const TRADING_COST_DATA = [
  { year: 1990, turnover: 10,        stamp: 0.3,    handling: 0.0,  transfer: 0.0,  supervision: 0.0,  commission: 0.4,   total: 0.7 },
  { year: 1991, turnover: 43,        stamp: 2.0,    handling: 0.0,  transfer: 0.0,  supervision: 0.0,  commission: 2.3,   total: 4.3 },
  { year: 1992, turnover: 680,       stamp: 3.35,   handling: 0.4,  transfer: 0.4,  supervision: 0.1,  commission: 4.8,   total: 9.05 },
  { year: 1993, turnover: 3627,      stamp: 21.0,   handling: 2.2,  transfer: 2.2,  supervision: 0.3,  commission: 25.4,  total: 51.1 },
  { year: 1994, turnover: 8128,      stamp: 45.24,  handling: 4.9,  transfer: 4.9,  supervision: 0.7,  commission: 56.9,  total: 112.64 },
  { year: 1995, turnover: 4036,      stamp: 25.72,  handling: 2.4,  transfer: 2.4,  supervision: 0.3,  commission: 28.3,  total: 59.12 },
  { year: 1996, turnover: 21332,     stamp: 121.66, handling: 12.8, transfer: 12.8, supervision: 1.7,  commission: 149.3, total: 298.26 },
  { year: 1997, turnover: 30722,     stamp: 237.27, handling: 18.4, transfer: 18.4, supervision: 2.5,  commission: 215.1, total: 491.67 },
  { year: 1998, turnover: 23544,     stamp: 235.0,  handling: 14.1, transfer: 14.1, supervision: 1.9,  commission: 164.8, total: 429.9 },
  { year: 1999, turnover: 31320,     stamp: 313.0,  handling: 18.8, transfer: 18.8, supervision: 2.5,  commission: 219.2, total: 572.3 },
  { year: 2000, turnover: 60826,     stamp: 478.0,  handling: 36.5, transfer: 36.5, supervision: 4.9,  commission: 425.8, total: 981.7 },
  { year: 2001, turnover: 38305,     stamp: 383.0,  handling: 23.0, transfer: 23.0, supervision: 3.1,  commission: 268.1, total: 700.2 },
  { year: 2002, turnover: 27990,     stamp: 280.0,  handling: 16.8, transfer: 16.8, supervision: 2.2,  commission: 195.9, total: 511.7 },
  { year: 2003, turnover: 32115,     stamp: 321.0,  handling: 5.6,  transfer: 19.3, supervision: 2.6,  commission: 96.3,  total: 444.8 },
  { year: 2004, turnover: 42334,     stamp: 423.0,  handling: 7.4,  transfer: 25.4, supervision: 3.4,  commission: 127.0, total: 586.2 },
  { year: 2005, turnover: 31665,     stamp: 179.0,  handling: 5.5,  transfer: 19.0, supervision: 2.5,  commission: 95.0,  total: 301.0 },
  { year: 2006, turnover: 90469,     stamp: 452.0,  handling: 15.7, transfer: 54.3, supervision: 7.2,  commission: 271.4, total: 800.6 },
  { year: 2007, turnover: 460556,    stamp: 2005.0, handling: 80.1, transfer: 276.3,supervision: 36.8, commission: 1381.7,total: 3779.9 },
  { year: 2008, turnover: 267485,    stamp: 778.0,  handling: 46.5, transfer: 53.5, supervision: 21.4, commission: 802.5, total: 1701.9 },
  { year: 2009, turnover: 534546,    stamp: 534.0,  handling: 93.0, transfer: 106.9,supervision: 42.8, commission: 1603.6,total: 2380.3 },
  { year: 2010, turnover: 545634,    stamp: 545.0,  handling: 94.9, transfer: 109.1,supervision: 43.7, commission: 1636.9,total: 2429.6 },
  { year: 2011, turnover: 421644,    stamp: 1053.0, handling: 73.4, transfer: 84.3, supervision: 33.7, commission: 1264.9,total: 2509.3 },
  { year: 2012, turnover: 314583,    stamp: 984.0,  handling: 54.7, transfer: 62.9, supervision: 25.2, commission: 943.7, total: 2070.5 },
  { year: 2013, turnover: 468072,    stamp: 1233.0, handling: 81.4, transfer: 93.6, supervision: 37.4, commission: 748.9, total: 2194.3 },
  { year: 2014, turnover: 742385,    stamp: 1467.0, handling: 129.2,transfer: 148.5,supervision: 59.4, commission: 1187.8,total: 2991.9 },
  { year: 2015, turnover: 2550538,   stamp: 2476.15,handling: 443.8,transfer: 510.1,supervision: 204.0,commission: 4080.9,total: 7714.95 },
  { year: 2016, turnover: 1273845,   stamp: 2209.0, handling: 124.1,transfer: 51.0, supervision: 51.0, commission: 2038.2,total: 4473.3 },
  { year: 2017, turnover: 1124625,   stamp: 2206.0, handling: 109.5,transfer: 45.0, supervision: 45.0, commission: 1799.4,total: 4204.9 },
  { year: 2018, turnover: 901739,    stamp: 2199.0, handling: 87.8, transfer: 36.1, supervision: 36.1, commission: 1442.8,total: 3801.8 },
  { year: 2019, turnover: 1274159,   stamp: 2463.0, handling: 124.1,transfer: 51.0, supervision: 51.0, commission: 1019.3,total: 3708.4 },
  { year: 2020, turnover: 2068253,   stamp: 3087.0, handling: 201.4,transfer: 82.7, supervision: 82.7, commission: 1654.6,total: 5108.4 },
  { year: 2021, turnover: 2579735,   stamp: 2478.02,handling: 251.3,transfer: 103.2,supervision: 103.2,commission: 2063.8,total: 4999.52 },
  { year: 2022, turnover: 2245093,   stamp: 2759.33,handling: 218.7,transfer: 89.8, supervision: 89.8, commission: 1796.1,total: 4953.73 },
  { year: 2023, turnover: 2122109,   stamp: 1800.6, handling: 206.7,transfer: 84.9, supervision: 84.9, commission: 1273.3,total: 3450.4 },
  { year: 2024, turnover: 2547858,   stamp: 1290.0, handling: 173.8,transfer: 51.0, supervision: 101.9,commission: 1528.7,total: 3145.4 },
  { year: 2025, turnover: 4141037,   stamp: 2035.0, handling: 282.4,transfer: 82.8, supervision: 165.6,commission: 2484.6,total: 5050.4 },
];

// 牛市年份（印花税突破2000亿）
const BULL_YEARS = new Set([2007, 2015, 2020, 2021, 2022, 2025]);

// 交易成本进度条行组件
// 参照全生命周期 EraBarChart 布局：年份靠左，行高紧凑，无多余间距
const TC_LABEL_W = 32; // 左侧年份标签宽度（px），与 EraBarChart 一致
const TC_ROW_H = 14;   // 每行总高度（px）
const TC_BAR_H = 11;   // 条形高度（px）

function TradingCostBar({
  label, value, maxValue, color, delay = 0, animated, formatValue, rowData
}: {
  label: string | number;
  value: number;
  maxValue: number;
  color: string;
  delay?: number;
  animated: boolean;
  formatValue: (v: number, d?: any) => string;
  rowData?: any;
}) {
  const pctWidth = maxValue > 0 ? (value / maxValue) * 100 : 0;
  // 截至日期（仅2026年有）
  const dateLabel = rowData?.isPartial && rowData?.tradeDate
    ? `截至${String(parseInt(rowData.tradeDate.slice(5,7)))}月${String(parseInt(rowData.tradeDate.slice(8,10)))}日`
    : null;
  // 纯数值（不含日期）
  const numLabel = formatValue(value);
  return (
    <div className="flex items-center" style={{ height: TC_ROW_H, marginBottom: 0 }}>
      {/* 年份标签：靠左固定宽度，右对齐 */}
      <div
        className="flex-shrink-0 text-right pr-1.5"
        style={{ width: TC_LABEL_W, fontSize: 9, color: MUTED, lineHeight: `${TC_ROW_H}px` }}
      >
        {label}
      </div>
      {/* 条形轨道 */}
      <div
        className="relative flex-1"
        style={{ height: TC_BAR_H, borderRadius: 2, background: '#E8E0D8' }}
      >
        {/* 动效条形 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: animated ? `${Math.max(pctWidth, 0.5)}%` : '0%',
            background: color,
            borderRadius: '2px 3px 3px 2px',
            transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${delay}ms`,
            boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
        />
        {/* 数值标签（纯数字，不含日期） */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            ...(pctWidth >= 20
              ? { right: `${100 - Math.max(pctWidth, 0.5)}%`, paddingRight: 4, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }
              : { left: `${Math.max(pctWidth, 0.5)}%`, paddingLeft: 3, color: TEXT }
            ),
            fontSize: 8,
            fontWeight: pctWidth >= 20 ? 700 : 600,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            transition: `left 0.75s cubic-bezier(0.4,0,0.2,1) ${delay}ms, right 0.75s cubic-bezier(0.4,0,0.2,1) ${delay}ms`,
            pointerEvents: 'none',
            opacity: animated ? 1 : 0,
          }}
        >
          {numLabel}
        </div>
      </div>
      {/* 截至日期：仅2026年，显示在整行最右侧（轨道外），不影响进度条宽度 */}
      {dateLabel && (
        <div
          className="flex-shrink-0 pl-1.5"
          style={{
            fontSize: 8,
            color: MUTED,
            lineHeight: `${TC_ROW_H}px`,
            whiteSpace: 'nowrap',
            opacity: animated ? 1 : 0,
            transition: `opacity 0.5s ease ${delay + 800}ms`,
          }}
        >
          {dateLabel}
        </div>
      )}
    </div>
  );
}

function TradingCostSection() {
  const [subTab, setSubTab] = useState<"stamp" | "turnover" | "compare" | "ratio">("stamp");
  const [animated, setAnimated] = useState(false);

  // 获取2026年实时累计数据
  const { data: data2026 } = trpc.aiDashboardTradingCost2026.useQuery();

  // 合并2026年数据到静态数据末尾
  const allData = useMemo(() => {
    if (!data2026) return TRADING_COST_DATA;
    return [
      ...TRADING_COST_DATA,
      {
        year: 2026,
        turnover: data2026.turnover,
        stamp: data2026.stamp,
        commission: data2026.commission,
        handling: data2026.handling,
        transfer: data2026.transfer,
        supervision: data2026.supervision,
        total: data2026.total,
        isPartial: true,
        tradeDate: data2026.tradeDate,
      } as any,
    ];
  }, [data2026]);

  // 切换 Tab 时重播动画
  const handleTabChange = (key: typeof subTab) => {
    setAnimated(false);
    setSubTab(key);
    setTimeout(() => setAnimated(true), 60);
  };

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  const SUBTABS = [
    { key: "stamp" as const,    label: "印花税" },
    { key: "turnover" as const, label: "成交额" },
    { key: "compare" as const,  label: "税费对比" },
    { key: "ratio" as const,    label: "费率趋势" },
  ];

  // 费率趋势数据（2000年起有意义）
  const ratioData = allData.filter(d => d.year >= 2000).map(d => ({
    year: d.year,
    stampRatio: d.turnover > 0 ? +((d.stamp / d.turnover) * 1000).toFixed(3) : 0,
    commRatio:  d.turnover > 0 ? +((d.commission / d.turnover) * 1000).toFixed(3) : 0,
    totalRatio: d.turnover > 0 ? +((d.total / d.turnover) * 1000).toFixed(3) : 0,
    isPartial: (d as any).isPartial,
    tradeDate: (d as any).tradeDate,
  }));

  // 最新年份摘要（用2025年固定数据，2026年另外展示）
  const latest = TRADING_COST_DATA[TRADING_COST_DATA.length - 1];
  const prev   = TRADING_COST_DATA[TRADING_COST_DATA.length - 2];
  const stampChg = latest.stamp - prev.stamp;

  return (
    <div>
      <SectionTitle
        title="交易成本"
        sub="印花税 / 券商佣金 / 总税费 · 1990-2026年"
        extra={
          <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
            数据来源：财政部 / 交易所
          </p>
        }
      />
      <div className="px-4">
        {/* 整体容器 */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: CARD, border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW }}>

        {/* 摘要卡片 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-3" style={{ background: BG }}>
            <p className="text-[12px] mb-1" style={{ color: MUTED }}>2025年印花税</p>
            <p className="text-lg font-bold" style={{ color: RED }}>{latest.stamp.toLocaleString()}亿</p>
            <p className="text-[12px]" style={{ color: stampChg >= 0 ? RED : GREEN }}>
              {stampChg >= 0 ? "▲" : "▼"}{Math.abs(stampChg).toFixed(0)}亿 vs 2024
            </p>
          </div>
          <div className="rounded-lg p-3" style={{ background: BG }}>
            <p className="text-[12px] mb-1" style={{ color: MUTED }}>2025年总税费</p>
            <p className="text-lg font-bold" style={{ color: "#F57C00" }}>{latest.total.toLocaleString()}亿</p>
            <p className="text-[12px]" style={{ color: DIM }}>成交额 {(latest.turnover/10000).toFixed(0)}万亿</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: BG }}>
            <p className="text-[12px] mb-1" style={{ color: MUTED }}>2025年券商佣金</p>
            <p className="text-lg font-bold" style={{ color: "#1976D2" }}>{latest.commission.toLocaleString()}亿</p>
            <p className="text-[12px]" style={{ color: DIM }}>历史峰值 2015年 4081亿</p>
          </div>
          <div className="rounded-lg p-3" style={{ background: BG }}>
            <p className="text-[12px] mb-1" style={{ color: MUTED }}>2025年综合费率</p>
            <p className="text-lg font-bold" style={{ color: "#7B1FA2" }}>
              {(latest.total / latest.turnover * 1000).toFixed(2)}‰
            </p>
            <p className="text-[12px]" style={{ color: DIM }}>2000年约 16‰</p>
          </div>
        </div>

        {/* 2026年实时数据摘要（动态加载） */}
        {data2026 && (
          <div className="rounded-lg p-3" style={{ background: "#FFF8E1", border: "1px solid #FFE082" }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[12px] font-medium" style={{ color: "#E65100" }}>2026年实时累计</p>
              <p className="text-[10px]" style={{ color: MUTED }}>截至{data2026.tradeDate.slice(5,7)}月{data2026.tradeDate.slice(8,10)}日（{data2026.tradeDays}个交易日）</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px]" style={{ color: MUTED }}>印花税</p>
                <p className="text-[13px] font-bold" style={{ color: RED }}>{data2026.stamp.toFixed(1)}亿</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: MUTED }}>券商佣金</p>
                <p className="text-[13px] font-bold" style={{ color: "#1976D2" }}>{data2026.commission.toFixed(1)}亿</p>
              </div>
              <div>
                <p className="text-[10px]" style={{ color: MUTED }}>成交额</p>
                <p className="text-[13px] font-bold" style={{ color: "#2E7D32" }}>{(data2026.turnover/10000).toFixed(1)}万亿</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex gap-1.5 overflow-x-auto">
          {SUBTABS.map(t => (
            <button key={t.key} onClick={() => handleTabChange(t.key)}
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

        {/* 图表区域（无额外卡片，直接在容器内） */}
        <div>

          {/* Tab1：印花税历年收入（CSS进度条动效） */}
          {subTab === "stamp" && (
            <>
              <p className="text-sm font-medium mb-2" style={{ color: TEXT }}>历年证券交易印花税收入（亿元）</p>
              <div className="flex gap-3 mb-3">
                <span className="flex items-center gap-1 text-[11px]" style={{ color: MUTED }}>
                  <span className="w-3 h-2 inline-block rounded-sm" style={{ background: RED }} />牛市年份
                </span>
                <span className="flex items-center gap-1 text-[11px]" style={{ color: MUTED }}>
                  <span className="w-3 h-2 inline-block rounded-sm" style={{ background: "#90CAF9" }} />普通年份
                </span>
              </div>
              {[...allData].reverse().map((d, i) => (
                <TradingCostBar
                  key={d.year}
                  label={d.year}
                  value={d.stamp}
                  maxValue={Math.max(...allData.map(x => x.stamp))}
                  color={BULL_YEARS.has(d.year)
                    ? `linear-gradient(90deg, ${RED} 0%, #FF6B6B 100%)`
                    : "linear-gradient(90deg, #64B5F6 0%, #90CAF9 100%)"}
                  delay={i * 18}
                  animated={animated}
                  rowData={d}
                  formatValue={(v, rd) => {
                    const base = `${v}亿`;
                    if (rd?.isPartial && rd?.tradeDate) {
                      const m = String(parseInt(rd.tradeDate.slice(5,7)));
                      const day = String(parseInt(rd.tradeDate.slice(8,10)));
                      return `${base}（截至${m}月${day}日）`;
                    }
                    return base;
                  }}
                />
              ))}
            </>
          )}

          {/* Tab2：全市场成交额（CSS进度条动效） */}
          {subTab === "turnover" && (
            <>
              <p className="text-sm font-medium mb-2" style={{ color: TEXT }}>历年A股全市场成交额（亿元）</p>
              {[...allData].reverse().map((d, i) => (
                <TradingCostBar
                  key={d.year}
                  label={d.year}
                  value={d.turnover}
                  maxValue={Math.max(...allData.map(x => x.turnover))}
                  color="linear-gradient(90deg, #2E7D32 0%, #66BB6A 100%)"
                  delay={i * 18}
                  animated={animated}
                  rowData={d}
                  formatValue={(v, rd) => {
                    const base = v >= 10000 ? `${(v/10000).toFixed(1)}万亿` : `${v}亿`;
                    if (rd?.isPartial && rd?.tradeDate) {
                      const m = String(parseInt(rd.tradeDate.slice(5,7)));
                      const day = String(parseInt(rd.tradeDate.slice(8,10)));
                      return `${base}（截至${m}月${day}日）`;
                    }
                    return base;
                  }}
                />
              ))}
            </>
          )}

          {/* Tab3：各项税费对比（分段堆叠CSS进度条） */}
          {subTab === "compare" && (
            <>
              <p className="text-sm font-medium mb-2" style={{ color: TEXT }}>历年各项税费对比（1990-2026年，亿元）</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                {[
                  { color: RED,       label: "印花税" },
                  { color: "#1976D2", label: "券商佣金" },
                  { color: "#F57C00", label: "经手费" },
                  { color: "#7B1FA2", label: "过户费" },
                  { color: "#795548", label: "监管费" },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1 text-[11px]" style={{ color: MUTED }}>
                    <span className="w-3 h-2 inline-block rounded-sm" style={{ background: color }} />{label}
                  </span>
                ))}
              </div>
              {[...allData].reverse().map((d, i) => {
                const maxTotal = Math.max(...allData.map(x => x.total));
                const segments = [
                  { value: d.stamp,      color: RED },
                  { value: d.commission, color: "#1976D2" },
                  { value: d.handling,   color: "#F57C00" },
                  { value: d.transfer,   color: "#7B1FA2" },
                  { value: d.supervision,color: "#795548" },
                ];
                const totalVal = segments.reduce((s, x) => s + x.value, 0);
                const pctW = (totalVal / maxTotal) * 100;
                return (
                  <div key={d.year} className="flex items-center" style={{ height: TC_ROW_H, marginBottom: 0 }}>
                    <div className="flex-shrink-0 text-right pr-1.5" style={{ width: TC_LABEL_W, fontSize: 9, color: MUTED, lineHeight: `${TC_ROW_H}px` }}>{d.year}</div>
                    <div className="relative flex-1" style={{ height: TC_BAR_H, borderRadius: 2, background: '#E8E0D8' }}>
                      <div
                        className="absolute top-0 left-0 h-full flex overflow-hidden"
                        style={{
                          width: animated ? `${pctW}%` : "0%",
                          borderRadius: '2px 3px 3px 2px',
                          transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${i * 18}ms`,
                        }}
                      >
                        {segments.map((seg, si) => (
                          <div key={si} style={{ width: `${(seg.value / totalVal) * 100}%`, background: seg.color, opacity: 0.88 }} />
                        ))}
                      </div>
                      {totalVal > 0 && (
                        <div
                          style={{
                            position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                            // 条形足够长（≥20%）：内置靠右白色；条形短：紧贴右侧深色
                            ...(pctW >= 20
                              ? { right: `${100 - Math.max(pctW, 0.5)}%`, paddingRight: 4, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }
                              : { left: `${Math.max(pctW, 0.5)}%`, paddingLeft: 3, color: TEXT }
                            ),
                            fontSize: 8, fontWeight: 700, whiteSpace: 'nowrap',
                            opacity: animated ? 1 : 0,
                            transition: `left 0.75s cubic-bezier(0.4,0,0.2,1) ${i * 18}ms, right 0.75s cubic-bezier(0.4,0,0.2,1) ${i * 18}ms, opacity 0.3s ease ${i * 18 + 400}ms`,
                            pointerEvents: 'none',
                          }}
                        >
                          {totalVal >= 10000 ? `${(totalVal/10000).toFixed(1)}万亿` : `${totalVal.toFixed(0)}亿`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Tab4：费率趋势（CSS进度条，三条并排） */}
          {subTab === "ratio" && (
            <>
              <p className="text-sm font-medium mb-2" style={{ color: TEXT }}>各项税费占成交额比例（2000-2025年，‰）</p>
              <div className="flex gap-3 mb-3">
                {[
                  { color: RED,       label: "印花税‰" },
                  { color: "#1976D2", label: "佣金‰" },
                  { color: "#43A047", label: "总税费‰" },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1 text-[11px]" style={{ color: MUTED }}>
                    <span className="w-3 h-2 inline-block rounded-sm" style={{ background: color }} />{label}
                  </span>
                ))}
              </div>
              {[...ratioData].reverse().map((d, i) => {
                const maxRatio = Math.max(...ratioData.map(x => x.totalRatio));
                const bars = [
                  { val: d.totalRatio, color: "#43A047", label: `${d.totalRatio}‰` },
                  { val: d.stampRatio, color: RED,       label: `${d.stampRatio}‰` },
                  { val: d.commRatio,  color: "#1976D2", label: `${d.commRatio}‰` },
                ];
                return (
                  <div key={d.year}>
                    {bars.map((bar, bi) => (
                      <div key={bi} className="flex items-center" style={{ height: 12, marginBottom: 0 }}>
                        {/* 年份标签：只在每年第1条显示，其余用空白占位 */}
                        <div
                          className="flex-shrink-0 text-right pr-1.5"
                          style={{ width: TC_LABEL_W, fontSize: 9, color: bi === 0 ? MUTED : 'transparent', lineHeight: '12px' }}
                        >
                          {d.year}
                        </div>
                        <div className="relative flex-1" style={{ height: 9, borderRadius: 2, background: '#E8E0D8' }}>
                          <div
                            style={{
                              position: 'absolute', top: 0, left: 0, height: '100%',
                              width: animated ? `${(bar.val / maxRatio) * 100}%` : '0%',
                              background: bar.color,
                              opacity: 0.85,
                              borderRadius: '2px 3px 3px 2px',
                              transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${i * 25 + bi * 80}ms`,
                              boxShadow: 'inset 0 -1px 3px rgba(0,0,0,0.12)',
                            }}
                          />
                        </div>
                        <span className="text-[8px] flex-shrink-0" style={{ width: 32, paddingLeft: 3, color: MUTED }}>{bar.label}</span>
                      </div>
                    ))}
                    <div style={{ height: 3 }} />{/* 年份间小间距 */}
                  </div>
                );
              })}
            </>
          )}
        </div>
        </div>{/* end 整体容器 */}
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────
export function LedgerAIDatabaseContent({ homeMode = false }: { homeMode?: boolean }) {
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
    DELISTED: (countData as any)?.DELISTED ?? 0,
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部红色导航 */}
      <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ background: RED, color: "#fff" }}>
        <button
          onClick={() => homeMode ? setLocation('/') : setLocation(`/ledger/${ledgerId}`)}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-lg">A股AI实时追踪</p>
        </div>
        {/* 散户入口：仅在账本模式下显示 */}
        {!homeMode && (
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/retail-investor`)}
            className="flex items-center justify-center px-3 h-7 rounded-full text-xs font-bold"
            style={{
              backgroundColor: "#FFD600",
              color: "#B71C1C",
              border: "none",
              minWidth: "52px",
            }}
          >
            散户入口
          </button>
        )}
        <button
          onClick={() => homeMode ? setLocation('/stock-tracker/stock-lifecycle') : setLocation(`/ledger/${ledgerId}/stock-lifecycle`)}
          className="flex items-center justify-center px-3 h-7 rounded-full text-sm font-medium"
          style={{
            backgroundColor: "rgba(255,255,255,0.9)",
            color: "#D32F2F",
            border: "1px solid rgba(255,255,255,0.4)",
            minWidth: "44px",
          }}
        >
          个股
        </button>
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
        <BunchingEffectSection />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <UpRateDistSection />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <RisefallSection counts={counts} />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <ValuationSection counts={counts} />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <TradingCostSection />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <MacroSection />
      </div>
    </div>
  );
}

// 默认导出：账本模式（保持原有路由兼容）
export default function LedgerAIDatabase() {
  return <LedgerAIDatabaseContent homeMode={false} />;
}

// 首页模式：返回首页，去掉散户入口
export function StockTrackerHome() {
  return <LedgerAIDatabaseContent homeMode={true} />;
}
