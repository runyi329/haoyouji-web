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
    const duration = 900; // ms
    const start = performance.now();
    const targets = data.map(d => d["低于首日"]);

    const frame = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic: 到终点前明显减速
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplayPcts(targets.map(t => parseFloat((ease * t).toFixed(1))));
      if (progress < 1) requestAnimationFrame(frame);
    };
    const raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [animated, data]);

  if (data.length === 0) return null;

  const ROW_H = 20; // 每行高度px
  const ROW_GAP = 4; // 行间距
  const BAR_H = 10;  // 柱子高度px
  const LABEL_W = 32; // 左侧年份标签宽度
  const PCT_W = 36;  // 右侧百分比宽度

  return (
    <div style={{ width: '100%' }}>
      {/* X轴刻度行 */}
      <div className="flex mb-1" style={{ paddingLeft: LABEL_W, paddingRight: PCT_W }}>
        {[0, 25, 50, 75, 100].map(v => (
          <div key={v} className="flex-1 text-center" style={{ fontSize: 8, color: MUTED, lineHeight: 1 }}>
            {v === 0 ? '' : `${v}%`}
          </div>
        ))}
      </div>
      {/* 柱子行 */}
      {data.map((row, i) => {
        const targetPct = row["低于首日"];
        const curPct = displayPcts[i] ?? 0;
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
            {/* 柱子轨道区 */}
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
            </div>
            {/* 百分比数字 */}
            <div
              className="flex-shrink-0 text-right"
              style={{
                width: PCT_W,
                fontSize: 9,
                fontWeight: 600,
                color: curPct > 0 ? STOCK_GREEN : MUTED,
                lineHeight: `${ROW_H}px`,
                paddingLeft: 4,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {transitioning ? '0.0' : curPct.toFixed(1)}%
            </div>
          </div>
        );
      })}
      {/* X轴底线 */}
      <div style={{ marginLeft: LABEL_W, marginRight: PCT_W, height: 1, background: BORDER, marginTop: 2 }} />
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
  const displayData = liveData ?? { total: 0, above: 0, below: 0, equal: 0, byEra: {}, byYear: {} };

  // 年份数据：直接使用接口返回的 byYear
  const byYearSrc = (liveData as any)?.byYear ?? {};
  const years = Object.keys(byYearSrc).sort();
  // 按年份降序排列（最新年在上方）
  const eraData = [...years].reverse().map(y => ({
    name: y,
    低于首日: parseFloat(pct(byYearSrc[y].below, byYearSrc[y].total)),
    total: byYearSrc[y].total,
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

        {/* 按年份横向柱状图（自定义CSS动效版） */}
        <div className="px-3 pt-3 pb-3">
          <p className="text-sm font-semibold mb-2" style={{ color: TEXT }}>按上市年份（最新价低于首日开盘价占比）</p>
          <EraBarChart data={eraData} animated={animated} transitioning={transitioning} />
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
      <SectionTitle title="估值分布" sub="PE / PB / 市值结构" />
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
      <SectionTitle title="涨跌统计" sub="今日及近期涨跌分布" />
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
    DELISTED: (countData as any)?.DELISTED ?? 0,
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
