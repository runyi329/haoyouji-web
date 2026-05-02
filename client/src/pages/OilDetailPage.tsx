/*
 * 石油详情页（WTI + Brent 并列显示）
 * - 顶部头部：WTI 和 Brent 实时行情并列对比
 * - 数据分析 Tab：涨跌统计并列对比
 * - 日线历史 Tab：保留 WTI/Brent 切换按钮
 * 路由：/oil-detail
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

// ── 颜色常量 ──────────────────────────────────────────────────────────────────
const RED = "#D32F2F";
const GREEN_A = "#388E3C";
const MUTED = "#888";
const BG = "#f5f5f5";

// ── WTI 图标：黑底白色油滴 ────────────────────────────────────────────────────
const WtiIcon = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="wtiCircleGrad" cx="40%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#333333"/>
        <stop offset="100%" stopColor="#000000"/>
      </radialGradient>
      <radialGradient id="wtiDropGrad" cx="38%" cy="28%" r="70%">
        <stop offset="0%" stopColor="#ffffff"/>
        <stop offset="60%" stopColor="#e8e8e8"/>
        <stop offset="100%" stopColor="#cccccc"/>
      </radialGradient>
      <radialGradient id="wtiHighlight" cx="35%" cy="25%" r="40%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.4)"/>
        <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    {/* 黑色圆形背景 */}
    <circle cx="16" cy="16" r="16" fill="url(#wtiCircleGrad)"/>
    {/* 白色油滴 */}
    <path d="M16 5 C16 5 9.5 14 9.5 18.5 C9.5 22.1 12.4 25.5 16 25.5 C19.6 25.5 22.5 22.1 22.5 18.5 C22.5 14 16 5 16 5 Z" fill="url(#wtiDropGrad)"/>
    {/* 高光 */}
    <path d="M16 5 C16 5 9.5 14 9.5 18.5 C9.5 22.1 12.4 25.5 16 25.5 C19.6 25.5 22.5 22.1 22.5 18.5 C22.5 14 16 5 16 5 Z" fill="url(#wtiHighlight)"/>
  </svg>
);

// ── Brent 图标：白底黑色油滴（与首页银盘一致） ───────────────────────────────
const BrentIcon = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="brentCircleGrad" cx="40%" cy="35%" r="65%">
        <stop offset="0%" stopColor="#f8f8f8"/>
        <stop offset="100%" stopColor="#d0d0d0"/>
      </radialGradient>
      <radialGradient id="brentDropGrad" cx="38%" cy="28%" r="70%">
        <stop offset="0%" stopColor="#555555"/>
        <stop offset="40%" stopColor="#1a1a1a"/>
        <stop offset="100%" stopColor="#000000"/>
      </radialGradient>
      <radialGradient id="brentHighlight" cx="35%" cy="25%" r="40%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.55)"/>
        <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    {/* 白色圆形背景 */}
    <circle cx="16" cy="16" r="16" fill="url(#brentCircleGrad)" stroke="#c8c8c8" strokeWidth="0.8"/>
    {/* 黑色油滴 */}
    <path d="M16 5 C16 5 9.5 14 9.5 18.5 C9.5 22.1 12.4 25.5 16 25.5 C19.6 25.5 22.5 22.1 22.5 18.5 C22.5 14 16 5 16 5 Z" fill="url(#brentDropGrad)"/>
    {/* 高光 */}
    <path d="M16 5 C16 5 9.5 14 9.5 18.5 C9.5 22.1 12.4 25.5 16 25.5 C19.6 25.5 22.5 22.1 22.5 18.5 C22.5 14 16 5 16 5 Z" fill="url(#brentHighlight)"/>
  </svg>
);

const THEME = {
  WTI: {
    gradient: "linear-gradient(160deg, #1B5E20 0%, #2E7D32 50%, #1A4A1E 100%)",
    accent: "#4CAF50",
    accentLight: "#A5D6A7",
    name: "WTI 西德克萨斯轻质原油",
    shortName: "WTI",
    exchange: "NYMEX",
    unit: "美元/桶",
    // 黑底白字卡片
    cardBg: "rgba(0,0,0,0.55)",
    cardBorder: "rgba(255,255,255,0.2)",
    decimals: 2,
    headerColor: "rgba(0,0,0,0.45)",
    IconComp: WtiIcon,
  },
  BRENT: {
    gradient: "linear-gradient(160deg, #004D40 0%, #00695C 50%, #003330 100%)",
    accent: "#26A69A",
    accentLight: "#80CBC4",
    name: "Brent 布伦特原油",
    shortName: "Brent",
    exchange: "ICE",
    unit: "美元/桶",
    // 白底黑字卡片
    cardBg: "rgba(255,255,255,0.88)",
    cardBorder: "rgba(0,0,0,0.12)",
    decimals: 2,
    headerColor: "rgba(255,255,255,0.82)",
    IconComp: BrentIcon,
  },
};

const PAGE_SIZE = 100;

// ── 工具函数 ──────────────────────────────────────────────────────────────────
function formatPrice(val: number | null | undefined, decimals = 2): string {
  if (val == null) return "—";
  return val.toFixed(decimals);
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
  const [streakTab, setStreakTab] = useState<30 | 60 | 90 | 180 | "all">("all");

  const allSorted = useMemo(() => [...allData].sort((a, b) => a.date.localeCompare(b.date)), [allData]);
  const recentData30  = useMemo(() => calcStreakFromItems(allSorted.slice(-30)),  [allSorted]);
  const recentData60  = useMemo(() => calcStreakFromItems(allSorted.slice(-60)),  [allSorted]);
  const recentData90  = useMemo(() => calcStreakFromItems(allSorted.slice(-90)),  [allSorted]);
  const recentData180 = useMemo(() => calcStreakFromItems(allSorted.slice(-180)), [allSorted]);
  const allStreakData  = useMemo(() => calcStreakFromItems(allSorted),            [allSorted]);

  const curData = streakTab === "all" ? allStreakData
    : streakTab === 30  ? recentData30
    : streakTab === 60  ? recentData60
    : streakTab === 90  ? recentData90
    : recentData180;

  const { upStreakMap, downStreakMap, maxUpStreak, maxDownStreak } = curData;
  const maxStreak = Math.max(maxUpStreak, maxDownStreak);

  return (
    <div style={{ background: "#fff", borderTop: `8px solid ${BG}` }}>
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
function ChangePctDistChart({ allData, label, labelIcon }: { allData: { date: string; changePct: number | null }[]; label: string; labelIcon?: React.ReactNode }) {
  const distData = useMemo(() => {
    const bucketMap: Record<number, number> = {};
    for (const item of allData) {
      const pct = item.changePct;
      if (pct == null) continue;
      const bucket = pct >= 0 ? Math.floor(pct) : Math.ceil(pct) - 1;
      const clamped = Math.max(-15, Math.min(15, bucket));
      bucketMap[clamped] = (bucketMap[clamped] || 0) + 1;
    }
    const keys = Object.keys(bucketMap).map(Number);
    if (keys.length === 0) return [];
    const minB = Math.min(-1, ...keys);
    const maxB = Math.max(0, ...keys);
    const result = [];
    for (let b = minB; b <= maxB; b++) {
      result.push({ label: `${b >= 0 ? "+" : ""}${b}%`, count: bucketMap[b] || 0, isUp: b >= 0 });
    }
    return result;
  }, [allData]);

  const upDays   = allData.filter(d => (d.changePct ?? 0) > 0).length;
  const downDays = allData.filter(d => (d.changePct ?? 0) < 0).length;

  return (
    <div style={{ background: "#fff", borderTop: `8px solid ${BG}` }}>
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: MUTED, display: "flex", alignItems: "center", gap: 4 }}>{labelIcon}{label} 涨跌幅频率分布</span>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: RED }}>↑{upDays}天</span>
          <span className="text-xs" style={{ color: GREEN_A }}>↓{downDays}天</span>
        </div>
      </div>
      <div style={{ height: 160, padding: "8px 4px 4px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 8, fill: "#9CA3AF" }} interval={1} />
            <YAxis tick={{ fontSize: 8, fill: "#9CA3AF" }} />
            <Tooltip formatter={(val: number) => [`${val}天`, "出现次数"]} contentStyle={{ fontSize: 11 }} />
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

// ── 单品种行情卡片（用于头部并列） ────────────────────────────────────────────
function OilQuoteCard({
  symbol, theme, klinesData, klinesLoading, statsData, statsLoading, metaData, metaLoading
}: {
  symbol: "WTI" | "BRENT";
  theme: typeof THEME.WTI;
  klinesData: any;
  klinesLoading: boolean;
  statsData: any;
  statsLoading: boolean;
  metaData: any;
  metaLoading: boolean;
}) {
  const latestClose     = klinesData?.rows?.[0]?.close ?? null;
  const latestChangePct = klinesData?.rows?.[0]?.changePct ?? null;
  const total           = metaData?.total ?? 0;
  const oldestDate      = metaData?.oldestDate ?? "";

  // WTI: 黑底白字 / Brent: 白底黑字
  const isWti = symbol === "WTI";
  const textMain    = isWti ? "#ffffff" : "#111111";
  const textSub     = isWti ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";
  const skeletonBg  = isWti ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)";
  const upColor     = isWti ? "#FF8A80" : "#D32F2F";
  const downColor   = isWti ? "#69F0AE" : "#2E7D32";
  const IconComp    = theme.IconComp;

  return (
    <div style={{
      borderRadius: 10,
      padding: "8px 10px",
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      flex: 1,
    }}>
      {/* 品种标题 */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <IconComp size={22} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: textMain, lineHeight: 1.2 }}>{theme.shortName}</div>
          <div style={{ fontSize: 9, color: textSub, lineHeight: 1.2 }}>{theme.exchange}</div>
        </div>
      </div>

      {/* 最新收盘价 */}
      <div style={{ marginBottom: 4 }}>
        {klinesLoading
          ? <div style={{ width: 70, height: 18, borderRadius: 4, background: skeletonBg }} />
          : <span style={{ fontSize: 18, fontWeight: 900, color: textMain, letterSpacing: -0.5 }}>
              ${formatPrice(latestClose, theme.decimals)}
            </span>
        }
      </div>

      {/* 涨跌幅 */}
      <div style={{ marginBottom: 6 }}>
        {klinesLoading
          ? <div style={{ width: 48, height: 13, borderRadius: 4, background: skeletonBg }} />
          : <span style={{ fontSize: 13, fontWeight: 700, color: (latestChangePct ?? 0) >= 0 ? upColor : downColor }}>
              {formatPct(latestChangePct)}
            </span>
        }
      </div>

      {/* 小字统计 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {[
          ["涨跌天数", statsLoading ? null : (statsData ? `↑${statsData.upDays} / ↓${statsData.downDays}` : "—")],
          ["涨跌比",   statsLoading ? null : (statsData ? `${statsData.upPct}% / ${statsData.downPct}%` : "—")],
          ["数据条数", metaLoading  ? null : `${total.toLocaleString()}条`],
          ["起始日期", metaLoading  ? null : oldestDate],
        ].map(([label, val], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 16 }}>
            <span style={{ fontSize: 9, color: textSub }}>{label}</span>
            {val == null
              ? <div style={{ width: 44, height: 9, borderRadius: 3, background: skeletonBg }} />
              : <span style={{ fontSize: 10, fontWeight: 600, color: textMain }}>{val}</span>
            }
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 主页面组件 ────────────────────────────────────────────────────────────────
export default function OilDetailPage() {
  const [, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState("analysis");
  const [historyType, setHistoryType] = useState<"WTI" | "BRENT">("WTI");
  const [page, setPage] = useState(1);
  const [aiExpanded, setAiExpanded] = useState(false);

  // ── WTI 数据查询 ────────────────────────────────────────────────────────────
  const { data: wtiMeta,    isLoading: wtiMetaLoading }    = trpc.cryptoData.getMeta.useQuery({ symbol: "WTI" });
  const { data: wtiStats,   isLoading: wtiStatsLoading }   = trpc.cryptoData.getStats.useQuery({ symbol: "WTI" });
  const { data: wtiKlines,  isLoading: wtiKlinesLoading }  = trpc.cryptoData.getKlines.useQuery(
    { symbol: "WTI", page: 1, pageSize: 1 }, {}
  );
  const { data: wtiAllPcts, isLoading: wtiPctsLoading }    = trpc.cryptoData.getAllChangePcts.useQuery({ symbol: "WTI" });

  // ── Brent 数据查询 ──────────────────────────────────────────────────────────
  const { data: brentMeta,    isLoading: brentMetaLoading }    = trpc.cryptoData.getMeta.useQuery({ symbol: "BRENT" });
  const { data: brentStats,   isLoading: brentStatsLoading }   = trpc.cryptoData.getStats.useQuery({ symbol: "BRENT" });
  const { data: brentKlines,  isLoading: brentKlinesLoading }  = trpc.cryptoData.getKlines.useQuery(
    { symbol: "BRENT", page: 1, pageSize: 1 }, {}
  );
  const { data: brentAllPcts, isLoading: brentPctsLoading }    = trpc.cryptoData.getAllChangePcts.useQuery({ symbol: "BRENT" });

  // ── 日线历史（切换品种） ────────────────────────────────────────────────────
  const { data: historyKlines, isLoading: historyLoading, isFetching } = trpc.cryptoData.getKlines.useQuery(
    { symbol: historyType, page, pageSize: PAGE_SIZE },
    { keepPreviousData: true } as any
  );
  const historyMeta = historyType === "WTI" ? wtiMeta : brentMeta;
  const historyRows  = historyKlines?.rows ?? [];
  const historyTotal = historyKlines?.total ?? 0;
  const historyPages = Math.ceil(historyTotal / PAGE_SIZE);
  const historyTheme = THEME[historyType];

  // ── AI 分析（WTI） ──────────────────────────────────────────────────────────
  const wtiLatestClose     = wtiKlines?.rows?.[0]?.close ?? null;
  const wtiLatestChangePct = wtiKlines?.rows?.[0]?.changePct ?? null;
  const { data: aiData, isLoading: aiLoading } = trpc.cryptoData.getAIAnalysis.useQuery(
    {
      symbol: "WTI",
      stockName: "原油市场（WTI & Brent）",
      latestClose:     wtiLatestClose     ?? undefined,
      latestChangePct: wtiLatestChangePct ?? undefined,
      total:           wtiMeta?.total ?? 0,
      oldestDate:      wtiMeta?.oldestDate ?? "",
      latestDate:      wtiMeta?.latestDate ?? "",
    },
    {
      enabled: !wtiMetaLoading && !wtiKlinesLoading,
      staleTime: 10 * 60 * 1000,
    }
  );

  // 渐变背景（两种颜色融合）
  const headerBg = "linear-gradient(160deg, #1B5E20 0%, #1A4A3A 50%, #003330 100%)";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#EEF2F8" }}>

      {/* ── 头部 ── */}
      <div style={{
        background: headerBg,
        padding: "10px 14px 12px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>

        {/* 第一行：返回 + 标题 + 更新 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => setLocation(-1 as any)}
            style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.18)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <ChevronLeft style={{ width: 16, height: 16, color: "#fff" }} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 6 }}>
              <WtiIcon size={18} /> 原油行情
            </p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.3 }}>
              WTI（NYMEX）& Brent（ICE）· 美元/桶
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
          >
            更新
          </button>
        </div>

        {/* 第二行：WTI + Brent 并列行情卡片 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <OilQuoteCard
            symbol="WTI"
            theme={THEME.WTI}
            klinesData={wtiKlines}
            klinesLoading={wtiKlinesLoading}
            statsData={wtiStats}
            statsLoading={wtiStatsLoading}
            metaData={wtiMeta}
            metaLoading={wtiMetaLoading}
          />
          <OilQuoteCard
            symbol="BRENT"
            theme={THEME.BRENT}
            klinesData={brentKlines}
            klinesLoading={brentKlinesLoading}
            statsData={brentStats}
            statsLoading={brentStatsLoading}
            metaData={brentMeta}
            metaLoading={brentMetaLoading}
          />
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
                ✨ AI × 原油市场分析
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
        {[
          { key: "analysis", label: "数据分析" },
          { key: "data",     label: `日线历史${(wtiMeta?.total ?? 0) > 0 ? `（WTI ${wtiMeta!.total}条）` : ""}` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 500,
              color: activeTab === t.key ? "#2E7D32" : "#9CA3AF",
              borderBottom: activeTab === t.key ? "2px solid #2E7D32" : "2px solid transparent",
              background: "none", border: "none",
              cursor: "pointer", transition: "color 0.2s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 数据分析 Tab ── */}
      {activeTab === "analysis" && (
        <div className="flex-1 overflow-auto pb-6">
          <div className="pt-3 space-y-0">

            {/* WTI vs Brent 涨跌天数并列对比 */}
            <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">涨跌天数对比</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                {/* WTI */}
                <div style={{ borderRight: "1px solid #F3F4F6", padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 4 }}>
                    <WtiIcon size={16} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>WTI</span>
                  </div>
                  {wtiStatsLoading ? (
                    <div className="flex items-center justify-center py-4 text-gray-300 text-xs">加载中...</div>
                  ) : wtiStats ? (
                    <>
                      <div className="grid grid-cols-3 divide-x divide-gray-100">
                        <div className="flex flex-col items-center py-2">
                          <span className="text-xl font-bold text-red-500">{wtiStats.upDays}</span>
                          <span className="text-xs text-gray-400">上涨</span>
                          <span className="text-xs text-red-400">{wtiStats.upPct}%</span>
                        </div>
                        <div className="flex flex-col items-center py-2">
                          <span className="text-xl font-bold text-green-600">{wtiStats.downDays}</span>
                          <span className="text-xs text-gray-400">下跌</span>
                          <span className="text-xs text-green-500">{wtiStats.downPct}%</span>
                        </div>
                        <div className="flex flex-col items-center py-2">
                          <span className="text-xl font-bold text-gray-400">{wtiStats.flatDays}</span>
                          <span className="text-xs text-gray-400">平盘</span>
                          <span className="text-xs text-gray-400">{wtiStats.total > 0 ? (wtiStats.flatDays / wtiStats.total * 100).toFixed(1) : 0}%</span>
                        </div>
                      </div>
                      <div className="mx-3 mt-1 mb-2 h-1.5 rounded-full overflow-hidden flex">
                        <div className="bg-red-400" style={{ width: `${wtiStats.upPct}%` }} />
                        <div className="bg-gray-200" style={{ width: `${(wtiStats.flatDays / wtiStats.total * 100).toFixed(1)}%` }} />
                        <div className="bg-green-500 flex-1" />
                      </div>
                      <div className="text-center text-xs text-gray-400 pb-1">共 {wtiStats.total} 天</div>
                    </>
                  ) : <div className="text-center text-xs text-gray-300 py-4">暂无数据</div>}
                </div>
                {/* Brent */}
                <div style={{ padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 4 }}>
                    <BrentIcon size={16} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>Brent</span>
                  </div>
                  {brentStatsLoading ? (
                    <div className="flex items-center justify-center py-4 text-gray-300 text-xs">加载中...</div>
                  ) : brentStats ? (
                    <>
                      <div className="grid grid-cols-3 divide-x divide-gray-100">
                        <div className="flex flex-col items-center py-2">
                          <span className="text-xl font-bold text-red-500">{brentStats.upDays}</span>
                          <span className="text-xs text-gray-400">上涨</span>
                          <span className="text-xs text-red-400">{brentStats.upPct}%</span>
                        </div>
                        <div className="flex flex-col items-center py-2">
                          <span className="text-xl font-bold text-green-600">{brentStats.downDays}</span>
                          <span className="text-xs text-gray-400">下跌</span>
                          <span className="text-xs text-green-500">{brentStats.downPct}%</span>
                        </div>
                        <div className="flex flex-col items-center py-2">
                          <span className="text-xl font-bold text-gray-400">{brentStats.flatDays}</span>
                          <span className="text-xs text-gray-400">平盘</span>
                          <span className="text-xs text-gray-400">{brentStats.total > 0 ? (brentStats.flatDays / brentStats.total * 100).toFixed(1) : 0}%</span>
                        </div>
                      </div>
                      <div className="mx-3 mt-1 mb-2 h-1.5 rounded-full overflow-hidden flex">
                        <div className="bg-red-400" style={{ width: `${brentStats.upPct}%` }} />
                        <div className="bg-gray-200" style={{ width: `${(brentStats.flatDays / brentStats.total * 100).toFixed(1)}%` }} />
                        <div className="bg-green-500 flex-1" />
                      </div>
                      <div className="text-center text-xs text-gray-400 pb-1">共 {brentStats.total} 天</div>
                    </>
                  ) : <div className="text-center text-xs text-gray-300 py-4">暂无数据</div>}
                </div>
              </div>
            </div>

            {/* 最长连涨/连跌 并列 */}
            <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">最长连涨 / 连跌</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                {/* WTI */}
                <div style={{ borderRight: "1px solid #F3F4F6", padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 4 }}>
                    <WtiIcon size={16} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>WTI</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-gray-100">
                    <div className="flex flex-col items-center py-2">
                      <span className="text-2xl font-bold text-red-500">{wtiStats?.maxConsecUp ?? "—"}</span>
                      <span className="text-xs text-gray-400 mt-0.5">连涨天</span>
                    </div>
                    <div className="flex flex-col items-center py-2">
                      <span className="text-2xl font-bold text-green-600">{wtiStats?.maxConsecDown ?? "—"}</span>
                      <span className="text-xs text-gray-400 mt-0.5">连跌天</span>
                    </div>
                  </div>
                </div>
                {/* Brent */}
                <div style={{ padding: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 4 }}>
                    <BrentIcon size={16} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>Brent</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-gray-100">
                    <div className="flex flex-col items-center py-2">
                      <span className="text-2xl font-bold text-red-500">{brentStats?.maxConsecUp ?? "—"}</span>
                      <span className="text-xs text-gray-400 mt-0.5">连涨天</span>
                    </div>
                    <div className="flex flex-col items-center py-2">
                      <span className="text-2xl font-bold text-green-600">{brentStats?.maxConsecDown ?? "—"}</span>
                      <span className="text-xs text-gray-400 mt-0.5">连跌天</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 连涨/连跌统计（WTI，全历史） */}
            {wtiAllPcts && wtiAllPcts.length > 0 && (
              <div className="bg-white border border-gray-200 mx-3 rounded-xl overflow-hidden mb-3">
                <div className="px-4 py-2 border-b border-gray-100">
                  <span className="text-xs font-semibold text-gray-500" style={{ display: "flex", alignItems: "center", gap: 4 }}><WtiIcon size={14} /> WTI 连涨/连跌统计</span>
                </div>
                <StreakStatsPanel allData={wtiAllPcts} />
              </div>
            )}

            {/* 涨跌幅频率分布（WTI） */}
            {wtiAllPcts && wtiAllPcts.length > 0 && (
              <div className="bg-white border border-gray-200 mx-3 rounded-xl overflow-hidden mb-3">
                <ChangePctDistChart allData={wtiAllPcts} label="WTI" labelIcon={<WtiIcon size={14} />} />
              </div>
            )}

            {/* 涨跌幅频率分布（Brent） */}
            {brentAllPcts && brentAllPcts.length > 0 && (
              <div className="bg-white border border-gray-200 mx-3 rounded-xl overflow-hidden mb-3">
                <ChangePctDistChart allData={brentAllPcts} label="Brent" labelIcon={<BrentIcon size={14} />} />
              </div>
            )}

            {/* WTI vs Brent 品种对比说明 */}
            <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">WTI vs Brent 品种对比</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                <div className="grid grid-cols-3 gap-2 pb-1 border-b border-gray-100">
                  <span className="text-xs text-gray-400 font-medium">项目</span>
                  <span className="text-xs font-bold text-gray-700 text-center" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}><WtiIcon size={14} /> WTI</span>
                  <span className="text-xs font-bold text-gray-700 text-center" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}><BrentIcon size={14} /> Brent</span>
                </div>
                {[
                  { item: "产地",     wti: "美国德克萨斯",   brent: "北海（英/挪）" },
                  { item: "交易所",   wti: "NYMEX（纽约）",  brent: "ICE（伦敦）" },
                  { item: "交割地",   wti: "库欣（陆上）",   brent: "北海（海上）" },
                  { item: "硫含量",   wti: "极低（甜质）",   brent: "低（甜质）" },
                  { item: "价差",     wti: "通常低于Brent",  brent: "通常高于WTI" },
                  { item: "影响范围", wti: "美洲市场基准",   brent: "全球市场基准" },
                ].map((row, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 py-1 border-b border-gray-50 last:border-0">
                    <span className="text-xs text-gray-400">{row.item}</span>
                    <span className="text-xs font-medium text-gray-600 text-center">{row.wti}</span>
                    <span className="text-xs font-medium text-gray-600 text-center">{row.brent}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 与主要资产相关性 */}
            <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">与主要资产相关性</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {[
                  { asset: "美元指数 DXY",  corr: "-0.55", desc: "中负相关：原油以美元计价", color: "#1565C0" },
                  { asset: "黄金 XAU/USD",  corr: "+0.42", desc: "弱正相关：同为大宗商品",  color: "#F57F17" },
                  { asset: "美股 S&P500",   corr: "+0.38", desc: "弱正相关：经济景气度",    color: "#D32F2F" },
                  { asset: "人民币 CNY",    corr: "+0.35", desc: "弱正相关：能源进口影响",  color: "#E65100" },
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
        </div>
      )}

      {/* ── 日线历史 Tab ── */}
      {activeTab === "data" && (
        <>
          {/* 品种切换 */}
          <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", padding: "8px 14px", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: "#9CA3AF", marginRight: 4 }}>品种：</span>
            {(["WTI", "BRENT"] as const).map(t => (
              <button
                key={t}
                onClick={() => { setHistoryType(t); setPage(1); }}
                style={{
                  padding: "4px 14px",
                  fontSize: 12,
                  fontWeight: historyType === t ? 700 : 400,
                  background: historyType === t ? (t === "WTI" ? "#2E7D32" : "#00695C") : "#F3F4F6",
                  color: historyType === t ? "#fff" : "#6B7280",
                  border: "none",
                  borderRadius: 20,
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {t === "BRENT" ? <BrentIcon size={14} /> : <WtiIcon size={14} />}
                  {t === "BRENT" ? "Brent" : "WTI"}
                </span>
              </button>
            ))}
            <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: "auto" }}>
              {historyMeta?.total ? `共 ${historyMeta.total} 条` : ""}
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
            ) : historyRows.length === 0 ? (
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
                  {historyRows.map((row, idx) => {
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
                        <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color: "#374151", fontFamily: "monospace", fontSize: 10 }}>{formatPrice(row.open, historyTheme.decimals)}</td>
                        <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color, fontFamily: "monospace", fontSize: 10, fontWeight: 600 }}>{formatPrice(row.close, historyTheme.decimals)}</td>
                        <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color: "#4B5563", fontFamily: "monospace", fontSize: 10 }}>{formatPrice(row.high, historyTheme.decimals)}</td>
                        <td style={{ border: "1px solid #E5E7EB", padding: "4px 0", textAlign: "center", color: "#4B5563", fontFamily: "monospace", fontSize: 10 }}>{formatPrice(row.low, historyTheme.decimals)}</td>
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

          {/* 分页 */}
          {historyPages > 1 && (
            <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-xs text-gray-400">
                第 {page} / {historyPages} 页 · 共 {historyTotal} 条
              </span>
              <button
                onClick={() => setPage(p => Math.min(historyPages, p + 1))}
                disabled={page >= historyPages || isFetching}
                className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

    </div>
  );
}
