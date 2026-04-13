/**
 * StockDetail.tsx
 * 个股详情页 - 基本信息 + 珠盘路（方格横排+近期/历史对比）+ 全生命周期统计
 * 路径: /stock/:tsCode
 */
import { useParams } from "wouter";
import { ChevronLeft, Calendar, Building2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useEffect } from "react";

// ─── 配色 ────────────────────────────────────────────────
const RED = "#D32F2F";
const BG = "#F2EAE0";
const CARD = "#FFFFFF";
const BORDER = "#E8E0D8";
const TEXT = "#1A1A1A";
const MUTED = "#888888";
const GREEN_A = "#00B050";
const CARD_SHADOW = "0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

// ─── 工具函数 ────────────────────────────────────────────
function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}
function exchangeLabel(exchange: string) {
  if (exchange === "SSE") return "上交所";
  if (exchange === "SZSE") return "深交所";
  return exchange || "-";
}
function marketLabel(tsCode: string) {
  if (tsCode.startsWith("688")) return "科创板";
  if (tsCode.startsWith("6")) return "沪市主板";
  if (tsCode.startsWith("3")) return "创业板";
  if (tsCode.startsWith("0")) return "深市主板";
  return "其他";
}
function listStatusLabel(status: string) {
  if (status === "L") return { text: "上市", color: GREEN_A };
  if (status === "D") return { text: "退市", color: MUTED };
  if (status === "P") return { text: "暂停", color: "#FF9800" };
  return { text: status, color: MUTED };
}
// 将 YYYYMMDD 转为 M/D 简写
function shortDate(dateStr: string): string {
  if (dateStr.length === 8) {
    const m = parseInt(dateStr.slice(4, 6));
    const d = parseInt(dateStr.slice(6, 8));
    return `${m}/${d}`;
  }
  return dateStr;
}

// ─── 珠路图滚动区域子组件（默认右对齐，右边留1/3空白）────────────

function ZhuLuScrollArea({
  columns,
  CELL,
  GAP,
  totalH,
  FIXED_ROWS,
  getColorAndText,
}: {
  columns: { pct: number; date: string }[][];
  CELL: number;
  GAP: number;
  totalH: number;
  FIXED_ROWS: number;
  getColorAndText: (pct: number) => { bg: string; fg: string; label: string };
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [rightPad, setRightPad] = useState(80); // 初始默认占位宽度

  useEffect(() => {
    // 第一帧计算容器宽度，设置右侧留白 = 1/3 容器宽
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const containerW = el.clientWidth;
      const pad = Math.round(containerW / 3);
      setRightPad(pad);
      // 内容末尾有了 pad 宽度的空白，滚动到底部即可让最新列停在 2/3 处
      // 用 setTimeout 等 setRightPad 渲染后再滚动
      setTimeout(() => {
        const el2 = scrollRef.current;
        if (el2) el2.scrollLeft = el2.scrollWidth;
      }, 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [columns.length, CELL, GAP]);

  return (
    <div
      ref={scrollRef}
      className="px-2 overflow-x-auto"
      style={{ paddingTop: 8 }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: GAP,
          minWidth: columns.length * (CELL + GAP) + rightPad,
          height: totalH,
          paddingRight: rightPad,
        }}
      >
        {columns.map((col, ci) => (
          <div
            key={ci}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: GAP,
              width: CELL,
              flexShrink: 0,
            }}
          >
            {/* 实际数据格子 */}
            {col.map((cell, ri) => {
              const { bg, fg, label } = getColorAndText(cell.pct);
              return (
                <div
                  key={ri}
                  title={`${cell.date} ${cell.pct > 0 ? '+' : ''}${cell.pct.toFixed(2)}%`}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 2,
                    background: bg,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 600,
                    color: fg,
                    lineHeight: 1,
                    letterSpacing: "-0.3px",
                  }}
                >
                  {label}
                </div>
              );
            })}
            {/* 补充空白格子，确保每列总是6行，显示边框 */}
            {Array.from({ length: Math.max(0, FIXED_ROWS - col.length) }).map((_, ei) => (
              <div
                key={`empty-${ei}`}
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: 2,
                  background: "transparent",
                  border: "1px solid #E0E0E0",
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 珠路图组件（百家乐大路风格）────────────────────────────
type StreakStats = { upStreakMap: Record<number, number>; downStreakMap: Record<number, number>; maxUpStreak: number; maxDownStreak: number; totalDays: number } | undefined;

function calcStreakFromItems(data: { pct: number }[]): { upStreakMap: Record<number, number>; downStreakMap: Record<number, number>; maxUpStreak: number; maxDownStreak: number } {
  const upMap: Record<number, number> = {};
  const downMap: Record<number, number> = {};
  let streak = 0;
  let dir: 'up' | 'down' | null = null;
  for (const item of data) {
    const d = item.pct > 0 ? 'up' : item.pct < 0 ? 'down' : null;
    if (d === null) { streak = 0; dir = null; continue; }
    if (d === dir) {
      streak++;
    } else {
      if (dir !== null && streak > 0) {
        if (dir === 'up') upMap[streak] = (upMap[streak] || 0) + 1;
        else downMap[streak] = (downMap[streak] || 0) + 1;
      }
      streak = 1;
      dir = d;
    }
  }
  if (dir !== null && streak > 0) {
    if (dir === 'up') upMap[streak] = (upMap[streak] || 0) + 1;
    else downMap[streak] = (downMap[streak] || 0) + 1;
  }
  const maxUp = Math.max(0, ...Object.keys(upMap).map(Number));
  const maxDown = Math.max(0, ...Object.keys(downMap).map(Number));
  return { upStreakMap: upMap, downStreakMap: downMap, maxUpStreak: maxUp, maxDownStreak: maxDown };
}

function ZhuLuMap({ items, allItems, streakStats }: { items: { tradeDate: string; pct: number }[]; allItems: { tradeDate: string; pct: number }[]; streakStats?: StreakStats }) {
  const [streakTab, setStreakTab] = useState<30 | 60 | 90 | 180 | 'all'>(60);
  // 按日期正序排列（旧到新）
  const sorted = [...items].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  // 全量数据正序（用于连涨/连跌统计各档位切片）
  const allSorted = [...allItems].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

  // 动态档位：根据该股最大涨跌幅判断
  const maxAbs = Math.max(...sorted.map(d => Math.abs(d.pct)), 1);
  // 最大幅 >10% 则以 4% 一档，否则以 2% 一档，共 5 档
  const STEP = maxAbs > 10 ? 4 : 2;
  // 分档阈値：[STEP, 2*STEP, 3*STEP, 4*STEP, 5*STEP]，超过最后一档算最深
  const THRESHOLDS = [STEP, STEP * 2, STEP * 3, STEP * 4, STEP * 5];
  const LABELS = THRESHOLDS.map((t, i) => i === 0 ? `<${t}%` : `${THRESHOLDS[i-1]}-${t}%`).concat([`>${STEP * 5}%`]);

  const UP_COLORS = [
    "#FFCDD2", // 最浅红
    "#EF9A9A",
    "#E57373",
    "#EF5350",
    "#E53935",
    "#B71C1C", // 最深红
  ];
  const DOWN_COLORS = [
    "#C8E6C9", // 最浅绿
    "#A5D6A7",
    "#66BB6A",
    "#43A047",
    "#2E7D32",
    "#1B5E20", // 最深绿
  ];

  function getColorAndText(pct: number): { bg: string; fg: string; label: string } {
    if (pct === 0) return { bg: "#D0D0D0", fg: "#666", label: "0" };
    const abs = Math.abs(pct);
    const idx = THRESHOLDS.findIndex(t => abs < t);
    const colorIdx = idx === -1 ? 5 : idx;
    const bg = pct > 0 ? UP_COLORS[colorIdx] : DOWN_COLORS[colorIdx];
    // 深色格子用白字，浅色格子用深色字
    const fg = colorIdx >= 3 ? "#fff" : (pct > 0 ? "#8B0000" : "#1B5E20");
    // 数字显示：一位小数，去掉小数点前的负号（用颜色区分涨跌）
    const label = abs.toFixed(1);
    return { bg, fg, label };
  }

  // 构建列结构：同向堆列，换向开新列
  const columns: { pct: number; date: string }[][] = [];
  let curDir: 'up' | 'down' | 'flat' | null = null;
  for (const item of sorted) {
    const dir = item.pct > 0 ? 'up' : item.pct < 0 ? 'down' : 'flat';
    if (dir === 'flat' && columns.length > 0) {
      columns[columns.length - 1].push({ pct: item.pct, date: item.tradeDate });
    } else if (dir !== curDir) {
      columns.push([{ pct: item.pct, date: item.tradeDate }]);
      curDir = dir;
    } else {
      columns[columns.length - 1].push({ pct: item.pct, date: item.tradeDate });
    }
  }

  // 连涨/连跌统计：全量来自后端 streakStats，近期各档前端计算
  const allUpStreakMap: Record<number, number> = streakStats?.upStreakMap ?? {};
  const allDownStreakMap: Record<number, number> = streakStats?.downStreakMap ?? {};
  const allMaxUpStreak = streakStats?.maxUpStreak ?? 0;
  const allMaxDownStreak = streakStats?.maxDownStreak ?? 0;

  // 近期各档前端计算（基于全量数据 allSorted 切片，确保各档位独立正确）
  const recentStreakData30 = calcStreakFromItems(allSorted.slice(-30));
  const recentStreakData60 = calcStreakFromItems(allSorted.slice(-60));
  const recentStreakData90 = calcStreakFromItems(allSorted.slice(-90));
  const recentStreakData180 = calcStreakFromItems(allSorted.slice(-180));

  // 当前 Tab 对应的统计数据
  const curStreakData = streakTab === 'all'
    ? { upStreakMap: allUpStreakMap, downStreakMap: allDownStreakMap, maxUpStreak: allMaxUpStreak, maxDownStreak: allMaxDownStreak }
    : streakTab === 30 ? recentStreakData30
    : streakTab === 60 ? recentStreakData60
    : streakTab === 90 ? recentStreakData90
    : recentStreakData180;

  const upStreakMap = curStreakData.upStreakMap;
  const downStreakMap = curStreakData.downStreakMap;
  const maxUpStreak = curStreakData.maxUpStreak;
  const maxDownStreak = curStreakData.maxDownStreak;
  const maxStreak = Math.max(maxUpStreak, maxDownStreak);

  // 格子放大以内嵌数字
  const CELL = 21; // 28px 缩小 25% = 21px
  const GAP = 1;
  const FIXED_ROWS = 6; // 固定6行，类似百家乐大路图
  const totalH = FIXED_ROWS * (CELL + GAP);

  return (
    <div style={{ background: CARD, paddingBottom: 12 }}>
      <ZhuLuScrollArea
        columns={columns}
        CELL={CELL}
        GAP={GAP}
        totalH={totalH}
        FIXED_ROWS={FIXED_ROWS}
        getColorAndText={getColorAndText}
      />
      {/* 图例 */}
      <div className="px-4 mt-2">
        <div className="flex items-center gap-1 flex-wrap" style={{ color: MUTED }}>
          <span className="text-xs" style={{ marginRight: 2 }}>涨</span>
          {UP_COLORS.map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: 2, background: c }} title={LABELS[i]} />
          ))}
          <span className="text-xs" style={{ margin: "0 4px" }}>平</span>
          <div style={{ width: 14, height: 14, borderRadius: 2, background: "#D0D0D0" }} />
          <span className="text-xs" style={{ margin: "0 4px" }}>跌</span>
          {DOWN_COLORS.map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: 2, background: c }} title={LABELS[i]} />
          ))}
        </div>

      </div>

      {/* 连涨/连跌统计列表 */}
      <div style={{ background: CARD, marginTop: 8, borderTop: `8px solid ${BG}` }}>
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: MUTED }}>连涨 / 连跌统计</span>
            <div className="flex items-center gap-1">
              {([30, 60, 90, 180, 'all'] as const).map(n => (
                <button
                  key={n}
                  onClick={() => setStreakTab(n)}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: streakTab === n ? RED : '#F0F0F0', color: streakTab === n ? '#fff' : MUTED, fontWeight: streakTab === n ? 700 : 400 }}
                >{n === 'all' ? '全量' : `${n}天`}</button>
              ))}
            </div>
          </div>
          {/* 表头 */}
          <div className="px-4 pb-1" style={{ display: 'grid', gridTemplateColumns: '1fr 36px 1fr', gap: 0 }}>
            <span className="text-xs font-medium text-right pr-2" style={{ color: RED }}>连涨次数</span>
            <span className="text-xs font-medium text-center" style={{ color: MUTED }}>天数</span>
            <span className="text-xs font-medium text-left pl-2" style={{ color: GREEN_A }}>连跌次数</span>
          </div>
          {/* 表行 */}
          {Array.from({ length: maxStreak }, (_, i) => i + 1).map(n => {
            const upCnt = upStreakMap[n] || 0;
            const downCnt = downStreakMap[n] || 0;
            if (upCnt === 0 && downCnt === 0) return null;
            const maxCnt = Math.max(
              ...Array.from({ length: maxStreak }, (_, i) => Math.max(upStreakMap[i+1]||0, downStreakMap[i+1]||0)),
              1
            );
            const BAR_MAX = 80; // 最大进度条宽度 px
            const upW = upCnt > 0 ? Math.max(Math.round((upCnt / maxCnt) * BAR_MAX), 4) : 0;
            const downW = downCnt > 0 ? Math.max(Math.round((downCnt / maxCnt) * BAR_MAX), 4) : 0;
            return (
              <div
                key={n}
                style={{ display: 'grid', gridTemplateColumns: '1fr 36px 1fr', gap: 0, borderTop: `1px solid ${BG}`, padding: '5px 16px', alignItems: 'center' }}
              >
                {/* 涨：数字在左，进度条靠右对齐到中间 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <span className="text-xs font-bold" style={{ color: upCnt > 0 ? RED : MUTED, minWidth: 28, textAlign: 'right' }}>
                    {upCnt > 0 ? `${upCnt}次` : '-'}
                  </span>
                  <div style={{ width: upW, height: 8, background: RED, borderRadius: '2px 0 0 2px', opacity: 0.85, flexShrink: 0 }} />
                </div>
                {/* 天数居中 */}
                <span className="text-xs font-semibold text-center" style={{ color: MUTED }}>{n}天</span>
                {/* 跌：进度条靠左对齐到中间，数字在右 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }}>
                  <div style={{ width: downW, height: 8, background: GREEN_A, borderRadius: '0 2px 2px 0', opacity: 0.85, flexShrink: 0 }} />
                  <span className="text-xs font-bold" style={{ color: downCnt > 0 ? GREEN_A : MUTED, minWidth: 28 }}>
                    {downCnt > 0 ? `${downCnt}次` : '-'}
                  </span>
                </div>
              </div>
            );
          })}
          {maxStreak === 0 && (
            <div className="px-4 py-3 text-xs" style={{ color: MUTED }}>暂无连涨/连跌数据</div>
          )}
          {maxStreak > 0 && (
            <div className="px-4 py-2 text-xs" style={{ color: MUTED }}>
              最长连涨{maxUpStreak}天 · 最长连跌{maxDownStreak}天
              {streakTab === 'all' && <span style={{ marginLeft: 6, color: MUTED }}>（全历史）</span>}
              {streakTab !== 'all' && <span style={{ marginLeft: 6, color: MUTED }}>（近{streakTab}天）</span>}
            </div>
          )}
        </div>
    </div>
  );
}

// ─── 珠盘路组件（统计数字主体 + 弹出框明细）────────────────────
function ZhuPanLu({
  items,
  lifetimeUpRate,
  lifetimeUpDays,
  lifetimeDownDays,
  lifetimeFlatDays,
  lifetimeTotalDays,
  streakStats,
}: {
  items: { tradeDate: string; pct: number; solid: boolean }[];
  lifetimeUpRate: number;
  lifetimeUpDays: number;
  lifetimeDownDays: number;
  lifetimeFlatDays: number;
  lifetimeTotalDays: number;
  streakStats?: StreakStats;
}) {
  const [tab, setTab] = useState<30 | 60 | 90 | 180>(60);
  const [showDetail, setShowDetail] = useState(false);

  const displayed = items.slice(-tab);
  const upItems = displayed.filter(d => d.pct > 0);
  const downItems = displayed.filter(d => d.pct < 0);
  const flatItems = displayed.filter(d => d.pct === 0);

  const recentUpRate = displayed.length > 0 ? (upItems.length / displayed.length) * 100 : 0;
  const recentDownRate = displayed.length > 0 ? (downItems.length / displayed.length) * 100 : 0;
  const deviation = recentUpRate - lifetimeUpRate;
  const deviationAbs = Math.abs(deviation);
  const deviationColor = deviationAbs < 3 ? MUTED : deviation < 0 ? GREEN_A : RED;
  const deviationLabel =
    deviationAbs < 3
      ? "与历史调性一致"
      : deviation < 0
      ? `近期偏空 ${deviationAbs.toFixed(1)}%`
      : `近期偏多 ${deviationAbs.toFixed(1)}%`;

  const lifetimeDownRate = lifetimeTotalDays > 0 ? (lifetimeDownDays / lifetimeTotalDays) * 100 : 0;

  // 进度条
  const Bar = ({ val, hist, color }: { val: number; hist: number; color: string }) => (
    <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: "#F0F0F0" }}>
      <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${Math.max(hist, 1)}%`, background: `${color}33` }} />
      <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${Math.max(val, 1)}%`, background: color }} />
      <div className="absolute top-0 h-full" style={{ left: `${Math.max(hist, 1)}%`, width: 2, background: "#fff", opacity: 0.85 }} />
    </div>
  );

  return (
    <div>
      {/* ── 顶部：Tab切换 + 报告图标 ── */}
      <div className="flex items-center gap-1.5 px-4 mb-3">
        {([30, 60, 90, 180] as const).map(n => (
          <button
            key={n}
            onClick={() => setTab(n)}
            className="px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: tab === n ? RED : "#F0F0F0", color: tab === n ? "#fff" : MUTED }}
          >
            {n}天
          </button>
        ))}
        <button
          onClick={() => setShowDetail(true)}
          className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: "#F0F0F0", color: MUTED }}
          title="查看每日明细"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          明细
        </button>
      </div>

      {/* 近期行 */}
      <div className="px-4 py-3" style={{ background: CARD }}>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { val: upItems.length, rate: recentUpRate, color: RED, labelColor: RED, label: "涨" },
            { val: downItems.length, rate: recentDownRate, color: GREEN_A, labelColor: GREEN_A, label: "跌" },
            { val: flatItems.length, rate: displayed.length > 0 ? (flatItems.length / displayed.length) * 100 : 0, color: MUTED, labelColor: MUTED, label: "平" },
            { val: displayed.length, rate: displayed.length > 0 ? ((upItems.length + downItems.length + flatItems.length) / displayed.length) * 100 : 0, color: "#7B1FA2", labelColor: MUTED, label: "总" },
          ].map((item, i) => (
            <div key={i} className="rounded-lg py-2.5" style={{ background: "#F8F8F8" }}>
              <div className="text-lg font-bold leading-tight" style={{ color: item.color }}>
                {`${item.rate.toFixed(1)}%`}
              </div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                {item.val}天<span style={{ color: item.labelColor }}>{item.label}</span>
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* 间隙 */}
      <div style={{ height: 6, background: BG }} />
      {/* 全生命周期行 */}
      <div className="px-4 py-3" style={{ background: CARD }}>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { val: lifetimeUpDays, rate: lifetimeUpRate, color: RED, labelColor: RED, label: "涨" },
            { val: lifetimeDownDays, rate: lifetimeDownRate, color: GREEN_A, labelColor: GREEN_A, label: "跌" },
            { val: lifetimeFlatDays, rate: lifetimeTotalDays > 0 ? (lifetimeFlatDays / lifetimeTotalDays) * 100 : 0, color: MUTED, labelColor: MUTED, label: "平" },
            { val: lifetimeTotalDays, rate: lifetimeTotalDays > 0 ? ((lifetimeUpDays + lifetimeDownDays + lifetimeFlatDays) / lifetimeTotalDays) * 100 : 0, color: "#7B1FA2", labelColor: MUTED, label: "总" },
          ].map((item, i) => (
            <div key={i} className="rounded-lg py-2.5" style={{ background: "#F8F8F8" }}>
              <div className="text-lg font-bold leading-tight" style={{ color: item.color }}>
                {`${item.rate.toFixed(1)}%`}
              </div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                {item.val}天<span style={{ color: item.labelColor }}>{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 间隙 */}
      <div style={{ height: 6, background: BG }} />
      {/* ── 偏离值 ── */}
      <div
        className="p-4"
        style={{ background: CARD }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs" style={{ color: MUTED }}>偏离值（近{tab}天 vs 历史）</div>
            <div className="text-2xl font-bold mt-0.5" style={{ color: deviationColor }}>
              {deviation >= 0 ? "+" : ""}{deviation.toFixed(1)}%
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: deviationColor, color: "#fff" }}>
            {deviationLabel}
          </div>
        </div>
        {deviationAbs >= 3 && (
          <div className="mt-1 text-xs" style={{ color: deviationColor }}>
            {deviation < 0 ? "近期跌天偏多，历史均值回归信号，可关注反弹机会" : "近期涨天偏多，注意高位风险，可关注回调压力"}
          </div>
        )}
        {/* 三段式对比进度条 */}
        <div className="mt-3 space-y-2">
          {/* 近期 */}
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ color: MUTED }}>
              <span>近{tab}天</span>
              <span><span style={{ color: RED }}>{recentUpRate.toFixed(1)}%涨</span> · <span>{(displayed.length > 0 ? flatItems.length / displayed.length * 100 : 0).toFixed(1)}%平</span> · <span style={{ color: GREEN_A }}>{recentDownRate.toFixed(1)}%跌</span></span>
            </div>
            <div className="flex rounded-full overflow-hidden" style={{ height: 8 }}>
              <div style={{ width: `${recentUpRate}%`, background: RED }} />
              <div style={{ width: `${displayed.length > 0 ? flatItems.length / displayed.length * 100 : 0}%`, background: "#D0D0D0" }} />
              <div style={{ flex: 1, background: GREEN_A }} />
            </div>
          </div>
          {/* 历史 */}
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ color: MUTED }}>
              <span>历史全期</span>
              <span><span style={{ color: RED }}>{lifetimeUpRate.toFixed(1)}%涨</span> · <span>{(lifetimeTotalDays > 0 ? lifetimeFlatDays / lifetimeTotalDays * 100 : 0).toFixed(1)}%平</span> · <span style={{ color: GREEN_A }}>{lifetimeDownRate.toFixed(1)}%跌</span></span>
            </div>
            <div className="flex rounded-full overflow-hidden" style={{ height: 8 }}>
              <div style={{ width: `${lifetimeUpRate}%`, background: RED }} />
              <div style={{ width: `${lifetimeTotalDays > 0 ? lifetimeFlatDays / lifetimeTotalDays * 100 : 0}%`, background: "#D0D0D0" }} />
              <div style={{ flex: 1, background: GREEN_A }} />
            </div>
          </div>
        </div>
      </div>

      {/* 间隙 */}
      <div style={{ height: 6, background: BG }} />
      {/* ── 珠路图（百家乐大路风格）── */}
      {/* 珠路图用 displayed（受 ZhuPanLu tab 控制），连涨/连跌统计用全量 items 自行切片 */}
      <ZhuLuMap items={displayed} allItems={items} streakStats={streakStats} />

      {/* 底部收尾 */}
      <div className="pb-4" style={{ background: CARD }} />

      {/* ── 每日明细弹出框 ── */}
      {showDetail && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setShowDetail(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl overflow-hidden"
            style={{ background: CARD, maxHeight: "80vh" }}
            onClick={e => e.stopPropagation()}
          >
            {/* 弹出框标题栏 */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <span className="text-sm font-semibold" style={{ color: TEXT }}>近{tab}天每日涨跌明细</span>
              <button onClick={() => setShowDetail(false)} style={{ color: MUTED, fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            {/* 汇总行 */}
            <div className="flex items-center gap-3 px-4 py-2" style={{ background: "#FFF8F2", borderBottom: `1px solid ${BORDER}` }}>
              <span className="text-xs" style={{ color: MUTED }}>共 {displayed.length} 个交易日</span>
              <span className="text-xs font-semibold" style={{ color: RED }}>涨 {upItems.length} 天（{recentUpRate.toFixed(1)}%）</span>
              <span className="text-xs font-semibold" style={{ color: GREEN_A }}>跌 {downItems.length} 天（{recentDownRate.toFixed(1)}%）</span>
              {flatItems.length > 0 && <span className="text-xs" style={{ color: MUTED }}>平 {flatItems.length} 天</span>}
            </div>
            {/* 明细列表 */}
            <div className="overflow-y-auto" style={{ maxHeight: "calc(80vh - 100px)" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#F8F8F8", borderBottom: `1px solid ${BORDER}` }}>
                    <th className="text-left px-4 py-2" style={{ color: MUTED, fontWeight: 500 }}>日期</th>
                    <th className="text-right px-4 py-2" style={{ color: MUTED, fontWeight: 500 }}>涨跌幅</th>
                    <th className="text-right px-4 py-2" style={{ color: MUTED, fontWeight: 500 }}>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {[...displayed].reverse().map((d, i) => {
                    const isUp = d.pct > 0;
                    const isDown = d.pct < 0;
                    const rowColor = isUp ? RED : isDown ? GREEN_A : MUTED;
                    const rowBg = i % 2 === 0 ? "#FFFFFF" : "#FAFAFA";
                    return (
                      <tr key={i} style={{ background: rowBg, borderBottom: `1px solid #F0F0F0` }}>
                        <td className="px-4 py-2" style={{ color: TEXT }}>
                          {d.tradeDate.length === 8
                            ? `${d.tradeDate.slice(0, 4)}-${d.tradeDate.slice(4, 6)}-${d.tradeDate.slice(6, 8)}`
                            : d.tradeDate}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold" style={{ color: rowColor }}>
                          {d.pct > 0 ? "+" : ""}{d.pct.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-bold"
                            style={{ background: isUp ? "#FFF0F0" : isDown ? "#F0FFF4" : "#F5F5F5", color: rowColor }}
                          >
                            {isUp ? "涨" : isDown ? "跌" : "平"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockDetail() {
  const params = useParams<{ tsCode: string }>();
  const { user } = useAuth();

  // wouter 路由不支持含 . 的参数，跳转时 . 被替换为 -，这里还原
  const tsCode = (params.tsCode || "").replace(/-(?=[A-Z]{2}$)/g, ".");

  const { data, isLoading, error } = trpc.aiStockDetail.useQuery(
    { tsCode },
    { enabled: !!tsCode, staleTime: 0 }
  );

  // 日线数据（珠盘路 + 连涨/连跌统计各档位计算，最多500条）
  const { data: dailyData, isLoading: dailyLoading } = trpc.aiStockDailyData.useQuery(
    { tsCode, limit: 500 },
    { enabled: !!tsCode, staleTime: 0 }
  );

  // 全生命周期连涨/连跌统计（后端拉取全量日线并计算）
  const { data: streakStats } = trpc.aiStockStreakStats.useQuery(
    { tsCode },
    { enabled: !!tsCode, staleTime: 0 }
  );

  // 整页刷新（浏览器级别 F5）
  const handleRefresh = () => window.location.reload();

  // 兜底数据：即使后端报错也能显示页面框架
  const fallback = {
    tsCode,
    name: tsCode,
    listStatus: 'L',
    listDate: null as string | null,
    delistDate: null as string | null,
    exchange: '',
    industry: null as string | null,
    upDays: 0,
    downDays: 0,
    flatDays: 0,
    totalDays: 0,
    upRate: '0.00',
    updatedAt: null as string | null,
  };
  const displayData = data ?? fallback;

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col" style={{ background: BG }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: RED, color: "#fff" }}>
          <button
            onClick={() => window.history.back()}
            className="w-7 h-7 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <p className="font-bold text-base">个股详情</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm" style={{ color: MUTED }}>加载中...</div>
        </div>
      </div>
    );
  }

  const upRate = parseFloat(displayData.upRate || "0");
  const downRate = displayData.totalDays > 0 ? ((displayData.downDays / displayData.totalDays) * 100) : 0;
  const flatRate = displayData.totalDays > 0 ? ((displayData.flatDays / displayData.totalDays) * 100) : 0;
  const statusInfo = listStatusLabel(displayData.listStatus);
  const listYears = (() => {
    if (!displayData.listDate || displayData.listDate.length < 8) return null;
    const y = parseInt(displayData.listDate.slice(0, 4));
    return new Date().getFullYear() - y;
  })();

  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部导航 */}
      <div
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: RED, color: "#fff" }}
      >
        <button
          onClick={() => window.history.back()}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base truncate">{displayData.name}</p>
          <p className="text-xs opacity-70">{displayData.tsCode}</p>
        </div>
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
        >
          {statusInfo.text}
        </span>
        <button
          onClick={handleRefresh}
          className="px-2.5 py-1 rounded-full flex-shrink-0 text-xs font-medium"
          style={{ background: "rgba(255,255,255,0.2)", color: '#fff' }}
        >
          刷新
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto pb-8">

        {/* 基本信息卡片 */}
        <div className="mx-4 mt-4 rounded-xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="text-xs font-semibold mb-3" style={{ color: RED }}>基本信息</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: MUTED }} />
              <div>
                <div className="text-xs" style={{ color: MUTED }}>上市日期</div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>{formatDate(displayData.listDate)}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: MUTED }} />
              <div>
                <div className="text-xs" style={{ color: MUTED }}>交易所</div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>{exchangeLabel(displayData.exchange)}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs" style={{ color: MUTED }}>板</span>
              </div>
              <div>
                <div className="text-xs" style={{ color: MUTED }}>板块</div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>{marketLabel(displayData.tsCode)}</div>
              </div>
            </div>
            {listYears !== null && (
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs" style={{ color: MUTED }}>年</span>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>上市年数</div>
                  <div className="text-sm font-medium" style={{ color: TEXT }}>{listYears} 年</div>
                </div>
              </div>
            )}
            {displayData.industry && (
              <div className="flex items-start gap-2 col-span-2">
                <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs" style={{ color: MUTED }}>行</span>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>所属行业</div>
                  <div className="text-sm font-medium" style={{ color: TEXT }}>{displayData.industry}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        {/* ── 珠盘路卡片 ── */}
        <div className="mt-3" style={{ background: CARD }}>
          <div className="px-4 pt-4 pb-1">
            <div className="text-xs font-semibold" style={{ color: RED }}>珠盘路</div>
          </div>
          {dailyLoading ? (
            <div className="flex items-center justify-center h-16" style={{ color: MUTED }}>
              <span className="text-xs">日线数据加载中...</span>
            </div>
          ) : dailyData?.items?.length ? (
            <ZhuPanLu
              items={dailyData.items}
              lifetimeUpRate={upRate}
              lifetimeUpDays={displayData.upDays}
              lifetimeDownDays={displayData.downDays}
              lifetimeFlatDays={displayData.flatDays}
              lifetimeTotalDays={displayData.totalDays}
              streakStats={streakStats}
            />
          ) : (
            <div className="flex items-center justify-center h-16" style={{ color: MUTED }}>
              <span className="text-xs">暂无日线数据</span>
            </div>
          )}
        </div>
        <div style={{ height: 8, background: BG }} />

        {/* 七条路预告卡片 */}
        <div className="mx-4 mt-3 rounded-xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="text-xs font-semibold mb-2" style={{ color: RED }}>七条路分析</div>
          <div className="text-xs mb-3" style={{ color: MUTED }}>基于全生命周期数据的多维度信号分析</div>
          <div className="space-y-2">
            {[
              { name: "珠盘路", desc: "原始K线胜负记录", done: true },
              { name: "大路", desc: "连续涨跌方向" },
              { name: "量能路", desc: "放量/缩量信号" },
              { name: "强度路", desc: "强弱阳/强弱阴" },
              { name: "形态路", desc: "K线组合信号" },
              { name: "组合路", desc: "规则加权综合信号" },
              { name: "AI翻译路", desc: "深度学习状态分类（6-8色标签）" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: item.done ? "#FFF5F5" : "#F8F4F0", opacity: item.done ? 1 : 0.7 }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: item.done ? RED : MUTED, fontSize: 10 }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium" style={{ color: item.done ? RED : TEXT }}>{item.name}</span>
                </div>
                <span className="text-xs" style={{ color: item.done ? RED : MUTED }}>
                  {item.done ? "已上线" : item.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {displayData.updatedAt && (
          <div className="mx-4 mt-3 mb-4 text-center text-xs" style={{ color: MUTED }}>
            数据更新时间：{displayData.updatedAt?.slice(0, 10)}
          </div>
        )}

        {/* DEBUG 信息（临时，排查问题后删除） */}
        <div className="mx-4 mt-2 mb-4 p-3 rounded-lg text-xs break-all" style={{ background: '#333', color: '#0f0', fontFamily: 'monospace' }}>
          <div>tsCode参数: {tsCode}</div>
          <div>error: {error ? error.message : 'null'}</div>
          <div>data: {data ? 'yes' : 'null'}</div>
          <div>data.name: {data?.name ?? 'N/A'}</div>
          <div>data.listDate: {data?.listDate ?? 'N/A'}</div>
          <div>data.industry: {data?.industry ?? 'N/A'}</div>
          <div>data.totalDays: {data?.totalDays ?? 'N/A'}</div>
          <div>debugMsg: {(data as any)?.debugMsg ?? 'none'}</div>
          <div>dailyItems: {dailyData?.items?.length ?? 'N/A'}</div>
        </div>
      </div>
    </div>
  );
}
