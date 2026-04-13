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

// 计算条件概率：给定当前连涨/连跌方向和天数，统计全量历史中下一天涨/跌/平的概率
function calcNextDayProb(
  allSorted: { pct: number }[],
  curDir: 'up' | 'down',
  curLen: number
): { upPct: number; downPct: number; flatPct: number; total: number } {
  let upCnt = 0, downCnt = 0, flatCnt = 0;
  // 遍历历史，找所有「连续 curDir 方向 curLen 天」后的下一天
  let streak = 0;
  let dir: 'up' | 'down' | null = null;
  for (let i = 0; i < allSorted.length; i++) {
    const d = allSorted[i].pct > 0 ? 'up' : allSorted[i].pct < 0 ? 'down' : null;
    if (d === null) { streak = 0; dir = null; continue; }
    if (d === dir) {
      streak++;
    } else {
      streak = 1;
      dir = d;
    }
    // 当前已连续 curDir 方向 curLen 天，看下一天
    if (dir === curDir && streak === curLen && i + 1 < allSorted.length) {
      const next = allSorted[i + 1].pct;
      if (next > 0) upCnt++;
      else if (next < 0) downCnt++;
      else flatCnt++;
    }
  }
  const total = upCnt + downCnt + flatCnt;
  if (total === 0) return { upPct: 0, downPct: 0, flatPct: 0, total: 0 };
  return {
    upPct: Math.round((upCnt / total) * 100),
    downPct: Math.round((downCnt / total) * 100),
    flatPct: Math.round((flatCnt / total) * 100),
    total,
  };
}

function ZhuLuScrollArea({
  cells,
  totalCols,
  CELL,
  GAP,
  FIXED_ROWS,
  getColorAndText,
  nextDayProb,
}: {
  cells: { col: number; row: number; pct: number; date: string }[];
  totalCols: number;
  CELL: number;
  GAP: number;
  FIXED_ROWS: number;
  getColorAndText: (pct: number) => { bg: string; fg: string; label: string };
  nextDayProb?: { upPct: number; downPct: number; flatPct: number; total: number; curDir: 'up' | 'down'; curLen: number; totalDays: number } | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 右侧空白列数：初始默认 4 列，第一帧根据容器宽度计算实际列数
  const [emptyCols, setEmptyCols] = useState(4);
  const [showProbDetail, setShowProbDetail] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const containerW = el.clientWidth;
      // 右侧留白 = 1/3 容器宽，计算需要几列空白格子
      const cols = Math.max(2, Math.round((containerW / 3) / (CELL + GAP)));
      setEmptyCols(cols);
      setTimeout(() => {
        const el2 = scrollRef.current;
        if (el2) el2.scrollLeft = el2.scrollWidth;
      }, 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [totalCols, CELL, GAP]);

  // 计算概率格子的位置：同向延续在最后一个数据格子的下一格（同列下一行），反向在右侧第一列第一格
  const lastCell = cells.length > 0 ? cells[cells.length - 1] : null;
  let probSamePos: { col: number; row: number } | null = null;
  let probReversePos: { col: number; row: number } | null = null;
  if (lastCell && nextDayProb && nextDayProb.total > 0) {
    // 同向：最后格子的下一行（如果还有空间）
    if (lastCell.row + 1 < FIXED_ROWS) {
      probSamePos = { col: lastCell.col, row: lastCell.row + 1 };
    } else {
      // 最后格子已在底部（借位行），同向概率放在右侧第一列底部
      probSamePos = { col: totalCols, row: FIXED_ROWS - 1 };
    }
    // 反向：右侧第一列第一格（如果同向占了该位置则往下一格）
    const reverseCol = totalCols + (probSamePos && probSamePos.col === totalCols ? 1 : 0);
    probReversePos = { col: reverseCol, row: 0 };
  }

  const totalH = FIXED_ROWS * (CELL + GAP);
  const allCols = totalCols + emptyCols + 1; // +1 for prob cells overflow

  return (<>
    <div
      ref={scrollRef}
      className="px-2 overflow-x-auto"
      style={{ paddingTop: 8 }}
    >
      <div
        style={{
          position: "relative",
          width: allCols * (CELL + GAP),
          height: totalH,
          flexShrink: 0,
        }}
      >
        {/* 背景网格：所有列的空白格子 */}
        {Array.from({ length: allCols }).map((_, ci) =>
          Array.from({ length: FIXED_ROWS }).map((_, ri) => (
            <div
              key={`bg-${ci}-${ri}`}
              style={{
                position: "absolute",
                left: ci * (CELL + GAP),
                top: ri * (CELL + GAP),
                width: CELL,
                height: CELL,
                borderRadius: 2,
                background: "transparent",
                border: "1px solid #E0E0E0",
              }}
            />
          ))
        )}
        {/* 数据格子（覆盖背景网格） */}
        {cells.map((cell, idx) => {
          const { bg, fg, label } = getColorAndText(cell.pct);
          return (
            <div
              key={idx}
              title={`${cell.date} ${cell.pct > 0 ? '+' : ''}${cell.pct.toFixed(2)}%`}
              style={{
                position: "absolute",
                left: cell.col * (CELL + GAP),
                top: cell.row * (CELL + GAP),
                width: CELL,
                height: CELL,
                borderRadius: 2,
                background: bg,
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
        {/* 同向延续概率格子（金黄色，可点击） */}
        {probSamePos && nextDayProb && (() => {
          const samePct = nextDayProb.curDir === 'up' ? nextDayProb.upPct : nextDayProb.downPct;
          return (
            <div
              onClick={() => setShowProbDetail(true)}
              title="点击查看统计详情"
              style={{
                position: "absolute",
                left: probSamePos.col * (CELL + GAP),
                top: probSamePos.row * (CELL + GAP),
                width: CELL, height: CELL, borderRadius: 2,
                background: "#FFF3CD", border: "1.5px solid #F59E0B",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 7, fontWeight: 700, color: "#B45309", lineHeight: 1,
                cursor: "pointer", zIndex: 2,
              }}
            >
              {samePct}%
            </div>
          );
        })()}
        {/* 反向换列概率格子（金黄色，可点击） */}
        {probReversePos && nextDayProb && (() => {
          const reversePct = nextDayProb.curDir === 'up' ? nextDayProb.downPct : nextDayProb.upPct;
          return (
            <div
              onClick={() => setShowProbDetail(true)}
              title="点击查看统计详情"
              style={{
                position: "absolute",
                left: probReversePos.col * (CELL + GAP),
                top: probReversePos.row * (CELL + GAP),
                width: CELL, height: CELL, borderRadius: 2,
                background: "#FFF3CD", border: "1.5px solid #F59E0B",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 7, fontWeight: 700, color: "#B45309", lineHeight: 1,
                cursor: "pointer", zIndex: 2,
              }}
            >
              {reversePct}%
            </div>
          );
        })()}
      </div>
    </div>

    {/* 条件概率详情弹出框 */}
    {showProbDetail && nextDayProb && (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}
        onClick={() => setShowProbDetail(false)}
      >
        <div
          style={{
            background: "#fff", borderRadius: "16px 16px 0 0",
            padding: "20px 20px 32px", width: "100%", maxWidth: 480,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.12)",
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* 标题 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>次日涨跌历史统计概率</div>
            <div onClick={() => setShowProbDetail(false)} style={{ fontSize: 20, color: "#999", cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</div>
          </div>

          {/* 数据概要行 */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 1, background: "#E8E8E8", border: "1px solid #E8E8E8",
            borderRadius: 8, overflow: "hidden", marginBottom: 16,
          }}>
            {[
              { label: "全量历史交易日", value: `${nextDayProb.totalDays} 天`, sub: "" },
              { label: "当前状态", value: `连${nextDayProb.curDir === 'up' ? '涨' : '跌'} ${nextDayProb.curLen} 天`, sub: "" },
              { label: "有效样本数", value: `${nextDayProb.total} 次`, sub: "" },
            ].map((item, i) => (
              <div key={i} style={{ background: "#FAFAFA", padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* 统计结果表格 */}
          <div style={{
            border: "1px solid #E0E0E0", borderRadius: 8, overflow: "hidden", marginBottom: 16,
          }}>
            {/* 表头 */}
            <div style={{
              display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr",
              background: "#F5F5F5", borderBottom: "1px solid #E0E0E0",
            }}>
              {["结果", "次数", "概率", "说明"].map((h, i) => (
                <div key={i} style={{ padding: "8px 6px", fontSize: 11, fontWeight: 600, color: "#555", textAlign: i === 0 ? "left" : "center" }}>{h}</div>
              ))}
            </div>
            {/* 涨 */}
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", borderBottom: "1px solid #F0F0F0" }}>
              <div style={{ padding: "10px 6px", fontSize: 13, fontWeight: 700, color: "#C62828" }}>涨</div>
              <div style={{ padding: "10px 6px", fontSize: 13, color: "#333", textAlign: "center" }}>{Math.round(nextDayProb.total * nextDayProb.upPct / 100)}</div>
              <div style={{ padding: "10px 6px", fontSize: 14, fontWeight: 700, color: "#C62828", textAlign: "center" }}>{nextDayProb.upPct}%</div>
              <div style={{ padding: "10px 6px", fontSize: 11, color: "#888", textAlign: "center" }}>转向或延续</div>
            </div>
            {/* 平 */}
            {nextDayProb.flatPct > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", borderBottom: "1px solid #F0F0F0" }}>
                <div style={{ padding: "10px 6px", fontSize: 13, fontWeight: 700, color: "#888" }}>平</div>
                <div style={{ padding: "10px 6px", fontSize: 13, color: "#333", textAlign: "center" }}>{Math.round(nextDayProb.total * nextDayProb.flatPct / 100)}</div>
                <div style={{ padding: "10px 6px", fontSize: 14, fontWeight: 700, color: "#888", textAlign: "center" }}>{nextDayProb.flatPct}%</div>
                <div style={{ padding: "10px 6px", fontSize: 11, color: "#888", textAlign: "center" }}>平盘</div>
              </div>
            )}
            {/* 跌 */}
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr" }}>
              <div style={{ padding: "10px 6px", fontSize: 13, fontWeight: 700, color: "#2E7D32" }}>跌</div>
              <div style={{ padding: "10px 6px", fontSize: 13, color: "#333", textAlign: "center" }}>{Math.round(nextDayProb.total * nextDayProb.downPct / 100)}</div>
              <div style={{ padding: "10px 6px", fontSize: 14, fontWeight: 700, color: "#2E7D32", textAlign: "center" }}>{nextDayProb.downPct}%</div>
              <div style={{ padding: "10px 6px", fontSize: 11, color: "#888", textAlign: "center" }}>转向或延续</div>
            </div>
          </div>

          {/* 统计方法说明 */}
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.8, marginBottom: 12, background: "#F8F8F8", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}>统计方法</div>
            <div>全量历史日线共 <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{nextDayProb.totalDays}</span> 个交易日，遍历全部日线，找出所有「连续{nextDayProb.curDir === 'up' ? '上涨' : '下跌'} {nextDayProb.curLen} 天」的时间节点，共找到 <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{nextDayProb.total}</span> 次。记录每次后一个交易日的涨跌情况，汇总得出上表概率分布。</div>
            <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 11, color: "#666" }}>
              P(结果) = 该结果出现次数 / 样本总数 ({nextDayProb.total})
            </div>
          </div>

          {/* 免责声明 */}
          <div style={{ fontSize: 11, color: "#999", lineHeight: 1.6, borderTop: "1px solid #F0F0F0", paddingTop: 10 }}>
            本统计仅反映该股票历史价格规律，不构成投资建议。市场未来走势受多种因素影响，存在重大不确定性。
          </div>
        </div>
      </div>
    )}
  </>);
}

// ─── 珠路图组件（百家乐大路风格）────────────────────────────
type CondProbEntry = { up: number; down: number; flat: number; total: number };
type StreakStats = { upStreakMap: Record<number, number>; downStreakMap: Record<number, number>; maxUpStreak: number; maxDownStreak: number; totalDays: number; condProbTable?: Record<string, Record<number, CondProbEntry>> } | undefined;

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

  // 构建二维坐标格子（百家乐大路图借位规则）
  // - 同向继续：row++；列满（row >= FIXED_ROWS）时向右借位：col++，row 保持在 FIXED_ROWS-1
  // - 换向：col++，row 从 0 开始
  const _FIXED_ROWS = 6; // 临时常量，后面会统一定义
  const cells: { col: number; row: number; pct: number; date: string }[] = [];
  let curCol = 0;
  let curRow = -1;
  let curCellDir: 'up' | 'down' | 'flat' | null = null;
  let borrowing = false; // 是否处于借位横向延伸状态

  for (const item of sorted) {
    const dir = item.pct > 0 ? 'up' : item.pct < 0 ? 'down' : 'flat';
    if (cells.length === 0) {
      // 第一个格子
      curCol = 0; curRow = 0; curCellDir = dir; borrowing = false;
    } else if (dir === curCellDir || (dir === 'flat')) {
      // 同向或平天：继续当前方向
      if (!borrowing && curRow + 1 < _FIXED_ROWS) {
        // 正常向下
        curRow++;
      } else {
        // 列满或已在借位行：向右借位，row 保持在 FIXED_ROWS-1
        curCol++;
        curRow = _FIXED_ROWS - 1;
        borrowing = true;
      }
      if (dir !== 'flat') curCellDir = dir; // 平天不改变方向
    } else {
      // 换向：新列从第一行开始
      curCol++;
      curRow = 0;
      curCellDir = dir;
      borrowing = false;
    }
    cells.push({ col: curCol, row: curRow, pct: item.pct, date: item.tradeDate });
  }
  const totalCols = cells.length > 0 ? cells[cells.length - 1].col + 1 : 0;

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

  // 计算当前最后一段连涨/连跌的方向和天数
  const lastProb = (() => {
    if (allSorted.length === 0) return null;
    // 计算当前最后一段连涨/连跌的方向和天数
    let curLen = 0;
    let curDir: 'up' | 'down' | null = null;
    for (let i = allSorted.length - 1; i >= 0; i--) {
      const pct = allSorted[i].pct;
      if (pct === 0) break; // 平盘打断
      const d = pct > 0 ? 'up' : 'down';
      if (curDir === null) { curDir = d; curLen = 1; }
      else if (d === curDir) { curLen++; }
      else break;
    }
    if (!curDir || curLen === 0) return null;
    // 从后端 condProbTable 查表（基于全量历史数据）
    const condProbTable = streakStats?.condProbTable;
    const entry = condProbTable?.[curDir]?.[curLen];
    if (entry && entry.total > 0) {
      return {
        upPct: Math.round((entry.up / entry.total) * 100),
        downPct: Math.round((entry.down / entry.total) * 100),
        flatPct: Math.round((entry.flat / entry.total) * 100),
        total: entry.total,
        upCnt: entry.up,
        downCnt: entry.down,
        flatCnt: entry.flat,
        curDir,
        curLen,
        totalDays: streakStats?.totalDays ?? allSorted.length,
      };
    }
    // 后端数据未就绪时回落到前端计算
    const prob = calcNextDayProb(allSorted, curDir, curLen);
    if (prob.total === 0) return null;
    return { ...prob, curDir, curLen, totalDays: streakStats?.totalDays ?? allSorted.length };
  })();

  return (
    <div style={{ background: CARD, paddingBottom: 12 }}>
      <ZhuLuScrollArea
        cells={cells}
        totalCols={totalCols}
        CELL={CELL}
        GAP={GAP}
        FIXED_ROWS={FIXED_ROWS}
        getColorAndText={getColorAndText}
        nextDayProb={lastProb}
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

      {/* 涨跌天数统计：筛选区间 + 全量合并为一个容器 */}
      <div className="px-4 py-3" style={{ background: CARD }}>
        {/* 表头 */}
        <div className="grid grid-cols-4 gap-1.5 text-center mb-1.5">
          {["涨", "跌", "平", "总"].map((label, i) => (
            <div key={i} className="text-xs" style={{ color: MUTED }}>{label}</div>
          ))}
        </div>
        {/* 筛选区间行 */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="text-xs flex-shrink-0 w-10" style={{ color: MUTED }}>近{tab}天</div>
          <div className="flex-1 grid grid-cols-4 gap-1.5 text-center">
            {[
              { val: upItems.length, rate: recentUpRate, color: RED },
              { val: downItems.length, rate: recentDownRate, color: GREEN_A },
              { val: flatItems.length, rate: displayed.length > 0 ? (flatItems.length / displayed.length) * 100 : 0, color: MUTED },
              { val: displayed.length, rate: displayed.length > 0 ? ((upItems.length + downItems.length + flatItems.length) / displayed.length) * 100 : 0, color: "#7B1FA2" },
            ].map((item, i) => (
              <div key={i} className="rounded-lg py-2" style={{ background: "#F8F8F8" }}>
                <div className="text-sm font-bold leading-tight" style={{ color: item.color }}>
                  {`${item.rate.toFixed(1)}%`}
                </div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>{item.val}天</div>
              </div>
            ))}
          </div>
        </div>
        {/* 分隔线 */}
        <div className="my-1.5" style={{ height: 1, background: BORDER }} />
        {/* 全量行 */}
        <div className="flex items-center gap-1.5">
          <div className="text-xs flex-shrink-0 w-10" style={{ color: MUTED }}>全量</div>
          <div className="flex-1 grid grid-cols-4 gap-1.5 text-center">
            {[
              { val: lifetimeUpDays, rate: lifetimeUpRate, color: RED },
              { val: lifetimeDownDays, rate: lifetimeDownRate, color: GREEN_A },
              { val: lifetimeFlatDays, rate: lifetimeTotalDays > 0 ? (lifetimeFlatDays / lifetimeTotalDays) * 100 : 0, color: MUTED },
              { val: lifetimeTotalDays, rate: lifetimeTotalDays > 0 ? ((lifetimeUpDays + lifetimeDownDays + lifetimeFlatDays) / lifetimeTotalDays) * 100 : 0, color: "#7B1FA2" },
            ].map((item, i) => (
              <div key={i} className="rounded-lg py-2" style={{ background: "#F8F8F8" }}>
                <div className="text-sm font-bold leading-tight" style={{ color: item.color }}>
                  {`${item.rate.toFixed(1)}%`}
                </div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>{item.val}天</div>
              </div>
            ))}
          </div>
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

        {/* 基本信息卡片 - 股票档案样式，与珠盘路容器一致（两边无边界，上下有间隙）*/}
        <div className="mt-3" style={{ background: CARD }}>
          <div className="px-4 pt-4 pb-3">
            <div className="text-xs font-semibold mb-3" style={{ color: RED }}>股票档案</div>

            {/* 主区域：左侧价格大字，右侧次要信息 */}
            <div className="flex items-start gap-4">
              {/* 左侧：最新价格 */}
              <div className="flex-shrink-0">
                {(() => {
                  const latestItem = dailyData?.items?.[dailyData.items.length - 1];
                  const pct = latestItem?.pct ?? null;
                  const isUp = pct !== null && pct > 0;
                  const isDown = pct !== null && pct < 0;
                  const priceColor = isUp ? RED : isDown ? GREEN_A : TEXT;
                  const tradeDate = latestItem?.tradeDate;
                  return (
                    <div>
                      {/* 涨跌幅大字 */}
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold" style={{ color: priceColor }}>
                          {pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : '--'}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                        {tradeDate ? `${tradeDate.slice(0,4)}-${tradeDate.slice(4,6)}-${tradeDate.slice(6,8)} 收盘` : '最新涨跌幅'}
                      </div>
                      {/* 涨/跌标签 */}
                      {pct !== null && (
                        <div
                          className="inline-block mt-1.5 px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            background: isUp ? 'rgba(211,47,47,0.08)' : isDown ? 'rgba(0,176,80,0.08)' : 'rgba(0,0,0,0.05)',
                            color: priceColor
                          }}
                        >
                          {isUp ? '上涨' : isDown ? '下跌' : '平盘'}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 分隔线 */}
              <div className="w-px self-stretch" style={{ background: BORDER }} />

              {/* 右侧：次要信息网格 */}
              <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>股票代码</div>
                  <div className="text-xs font-medium" style={{ color: TEXT }}>{displayData.tsCode}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>板块</div>
                  <div className="text-xs font-medium" style={{ color: TEXT }}>{marketLabel(displayData.tsCode)}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>上市日期</div>
                  <div className="text-xs font-medium" style={{ color: TEXT }}>{formatDate(displayData.listDate)}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>上市年数</div>
                  <div className="text-xs font-medium" style={{ color: TEXT }}>{listYears !== null ? `${listYears} 年` : '-'}</div>
                </div>
                {displayData.industry && (
                  <div className="col-span-2">
                    <div className="text-xs" style={{ color: MUTED }}>所属行业</div>
                    <div className="text-xs font-medium" style={{ color: TEXT }}>{displayData.industry}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>交易所</div>
                  <div className="text-xs font-medium" style={{ color: TEXT }}>{exchangeLabel(displayData.exchange)}</div>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>状态</div>
                  <div className="text-xs font-medium" style={{ color: statusInfo.color ?? TEXT }}>{statusInfo.text}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ height: 8, background: BG }} />
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
