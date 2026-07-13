/**
 * AnnualizedChain — 年化矩阵热力表
 * 纵轴：行权价  横轴：4个到期日
 * 每格只显示年化%（颜色编码），点击弹出详情
 * 手机优先：5列紧凑布局
 *
 * 每个到期日独立一个 WebSocket 连接（共4个），避免超出 Deribit 100频道上限
 * 区分两种空状态：「—」= 加载中，「此处无」= 该行权价无合约
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

// ─── 到期日配置 ────────────────────────────────────────────────
interface ExpiryConfig { code: string; label: string; fullLabel: string; expireDate: string; }

// 静态兜底（首次渲染前使用）
const DEFAULT_EXPIRIES: ExpiryConfig[] = [
  { code: "25SEP26", label: "9月",  fullLabel: "2026/9/25",  expireDate: "2026-09-25" },
  { code: "25DEC26", label: "12月", fullLabel: "2026/12/25", expireDate: "2026-12-25" },
  { code: "26MAR27", label: "3月",  fullLabel: "2027/3/26",  expireDate: "2027-03-26" },
  { code: "25JUN27", label: "6月",  fullLabel: "2027/6/25",  expireDate: "2027-06-25" },
];

// 解析 Deribit 到期日 code（如 "25SEP26"）→ ExpiryConfig
const MONTH_MAP: Record<string, string> = {
  JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
  JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'
};
function parseExpiryCode(code: string): ExpiryConfig | null {
  // code 格式：DDMMMYY，如 25SEP26
  const m = code.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const [, dd, mon, yy] = m;
  const mm = MONTH_MAP[mon];
  if (!mm) return null;
  const year = 2000 + parseInt(yy);
  const expireDate = `${year}-${mm}-${dd.padStart(2,'0')}`;
  const monthNum = parseInt(mm);
  const dayNum = parseInt(dd);
  const now = new Date();
  const expire = new Date(expireDate);
  const daysLeft = Math.ceil((expire.getTime() - now.getTime()) / 86400000);
  // 30天以内：显示 月/日（精确到日）；否则：显示 年后2位/月
  const label = daysLeft <= 30
    ? `${monthNum}/${dayNum}`
    : `${String(year).slice(2)}/${monthNum}月`;
  const fullLabel = `${year}/${monthNum}/${dayNum}`;
  return { code, label, fullLabel, expireDate };
}

const MAX_STRIKE = 5000;

// ─── 维度选择器配置 ─────────────────────────────────────────────
export type DimKey = 'ann' | 'ivr' | 'iv' | 'bid' | 'ask' | 'spread' | 'bidEth' | 'askEth' | 'delta' | 'theta' | 'oi';
export const ALL_DIMS: DimKey[] = ['ann','ivr','iv','bid','ask','spread','bidEth','askEth','delta','theta','oi'];
export const DIM_LABELS: Record<DimKey, { zh: string; en: string }> = {
  ann:    { zh: '年化',  en: 'Ann.'    },
  ivr:    { zh: 'IVR',  en: 'IV Rank' },
  iv:     { zh: 'IV',   en: 'Impl.Vol'},
  bid:    { zh: '买价',  en: 'Bid'     },
  ask:    { zh: '卖价',  en: 'Ask'     },
  spread: { zh: '价差',  en: 'Spread'  },
  bidEth: { zh: '买ETH', en: 'Bid.E'  },
  askEth: { zh: '卖ETH', en: 'Ask.E'  },
  delta:  { zh: 'Delta', en: '方向性'  },
  theta:  { zh: 'Theta', en: '日损耗'  },
  oi:     { zh: 'OI',   en: '未平仓'  },
};

function calcDaysLeft(expireDate: string): number {
  const now = new Date();
  const exp = new Date(expireDate);
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86400000));
}

// ─── Black-Scholes Theta 计算 ──────────────────────────────────────────
function normCDF(x: number): number {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x/2);
  return 0.5 * (1 + sign * y);
}
function normPDF(x: number): number { return Math.exp(-0.5*x*x) / Math.sqrt(2*Math.PI); }

/** 计算 Black-Scholes Theta（每日，USD），正值 = 每日损耗绝对值 */
function bsTheta(S: number, K: number, T: number, iv: number, r: number, isCall: boolean): number {
  if (T <= 0 || iv <= 0 || S <= 0) return 0;
  const d1 = (Math.log(S/K) + (r + 0.5*iv*iv)*T) / (iv*Math.sqrt(T));
  const d2 = d1 - iv*Math.sqrt(T);
  const theta = isCall
    ? (-S*normPDF(d1)*iv/(2*Math.sqrt(T)) - r*K*Math.exp(-r*T)*normCDF(d2)) / 365
    : (-S*normPDF(d1)*iv/(2*Math.sqrt(T)) + r*K*Math.exp(-r*T)*normCDF(-d2)) / 365;
  return Math.abs(theta);
}

/** 生成从上市日到到期日每天的 Theta 序列（USD/天） */
/**
 * 根据到期日推算 Deribit 合约上市日：
 * - 季度合约（每年 3/6/9/12 月最后一个周五）：上一个季度到期日后第二天为上市日
 * - 周到期（每周五）：上市日 = 到期日前 7 天
 * - 月到期：上市日 = 到期日前 30 天
 */
/**
 * 根据到期日和当前剩余天数推算 Deribit 合约上市日：
 * - 周合约（daysLeft <= 14）：上市日 = 到期日前 7 天
 * - 月合约（daysLeft <= 45）：上市日 = 到期日前 30 天
 * - 季度合约（daysLeft <= 120）：上市日 = 到期日前 91 天
 * - 半年合约（daysLeft <= 210）：上市日 = 到期日前 182 天
 * - 年合约（daysLeft <= 400）：上市日 = 到期日前 365 天
 * - 超长期合约：上市日 = 到期日前 548 天（18 个月）
 */
function estimateListingDate(expireDate: string, daysLeft: number): Date {
  const expMs = new Date(expireDate).getTime();
  let contractDays: number;
  if (daysLeft <= 14) {
    contractDays = 7;
  } else if (daysLeft <= 45) {
    contractDays = 30;
  } else if (daysLeft <= 120) {
    contractDays = 91;
  } else if (daysLeft <= 210) {
    contractDays = 182;
  } else if (daysLeft <= 400) {
    contractDays = 365;
  } else {
    contractDays = 548;
  }
  return new Date(expMs - contractDays * 86400000);
}

function buildThetaSeries(
  strike: number, expireDate: string, iv: number, ethPrice: number, isCall: boolean, contractDays: number
): { date: Date; dte: number; theta: number }[] {
  const expMs = new Date(expireDate).getTime();
  const r = 0.05; // 无风险利率
  const result: { date: Date; dte: number; theta: number }[] = [];
  for (let d = contractDays; d >= 0; d--) {
    const dateMs = expMs - d * 86400000;
    const T = d / 365;
    const theta = bsTheta(ethPrice, strike, T, iv, r, isCall);
    result.push({ date: new Date(dateMs), dte: d, theta });
  }
  return result;
}

/** Theta 衰减曲线 SVG 组件 */
function ThetaDecayCurve({ strike, expireDate, iv, ethPrice, daysLeft, totalDays, isCall }: {
  strike: number; expireDate: string; iv: number; ethPrice: number; daysLeft: number; totalDays: number; isCall: boolean;
}) {
  const series = useMemo(
    () => buildThetaSeries(strike, expireDate, iv, ethPrice, isCall, totalDays),
    [strike, expireDate, iv, ethPrice, isCall, totalDays]
  );
  if (series.length < 2) return null;

  const W = 320, H = 110, PL = 36, PR = 8, PT = 8, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;

  const maxTheta = Math.max(...series.map((p: { date: Date; dte: number; theta: number }) => p.theta), 0.01);
  // 找最接近 daysLeft 的点（避免精确匹配失败）
  const todayIdx = series.reduce((best, p, i) => {
    const prev = series[best];
    return Math.abs(p.dte - daysLeft) < Math.abs(prev.dte - daysLeft) ? i : best;
  }, 0);
  const todayX = (todayIdx / (series.length - 1)) * cW;

  const toX = (i: number) => PL + (i / (series.length - 1)) * cW;
  const toY = (theta: number) => PT + cH - (theta / maxTheta) * cH;

  // 历史段（上市日→今天）
  const histPts = series.slice(0, todayIdx + 1);
  // 预测段（今天→到期日）
  const futurePts = series.slice(todayIdx);

  type ThetaPoint = { date: Date; dte: number; theta: number };
  const polyline = (pts: ThetaPoint[], offset: number) =>
    pts.map((p: ThetaPoint, i: number) => `${toX(i + offset)},${toY(p.theta)}`).join(' ');

  // Y轴刻度
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(r => ({
    y: PT + cH - r * cH,
    label: r === 0 ? '0' : `$${(r * maxTheta).toFixed(0)}`
  }));

  // X轴刻度（上市日、今天、到期日）
  const xLabels = [
    { x: PL, label: '上市' },
    { x: PL + todayX, label: '今' },
    { x: PL + cW, label: '到期' },
  ];

  const pastDays = totalDays - daysLeft;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[var(--ac-text-secondary)] font-sans tracking-widest uppercase">Theta 衰减曲线（$USD/天）</span>
        <span className="text-[10px] font-sans" style={{ color: '#fb7185' }}>
          已过 {pastDays}天 · 剩余 {daysLeft}天
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        {/* 网格线 */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PL} y1={t.y} x2={PL+cW} y2={t.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {/* Y轴标签 */}
        {yTicks.map((t, i) => (
          <text key={i} x={PL-3} y={t.y+3} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="monospace">{t.label}</text>
        ))}
        {/* 历史段实线（玫瑰红） */}
        {histPts.length > 1 && (
          <polyline points={polyline(histPts, 0)} fill="none" stroke="#fb7185" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* 预测段虚线（灰色） */}
        {futurePts.length > 1 && (
          <polyline points={polyline(futurePts, todayIdx)} fill="none" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* 今日竖线 */}
        <line x1={PL+todayX} y1={PT} x2={PL+todayX} y2={PT+cH} stroke="#fbbf24" strokeWidth="1" strokeDasharray="2 2" />
        {/* 今日圆点 */}
        {todayIdx >= 0 && (
          <circle cx={PL+todayX} cy={toY(series[todayIdx].theta)} r="3" fill="#fbbf24" />
        )}
        {/* X轴标签 */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={H-4} textAnchor={i===0?'start':i===2?'end':'middle'} fontSize="8" fill="rgba(255,255,255,0.35)" fontFamily="sans-serif">{l.label}</text>
        ))}
      </svg>
    </div>
  );
}

// ─── 颜色编码（半透明 rgba，在深色背景上有明显色调区分）──────────────
function annualizedColor(v: number | null): string {
  if (v === null) return "bg-[var(--ac-bg-cell-empty)] text-[var(--ac-text-muted)]";
  // 用内联 style 的颜色通过 className 无法直接用 rgba，改用 data 属性方案
  // 这里返回一个特殊标记，实际渲染时用 style 覆盖
  if (v <= 0.10) return "__ann_0";
  if (v <= 0.20) return "__ann_1";
  if (v <= 0.30) return "__ann_2";
  if (v <= 0.40) return "__ann_3";
  if (v <= 0.50) return "__ann_4";
  if (v <= 0.70) return "__ann_5";
  return "__ann_6";
}
// ═══════════════════════════════════════════════════════════════
// 热力矩阵配色系统 — 四套方案
// 方案A/B：亮底色 + 深色文字（清晰可读）
// 方案C/D：深底色 + 高饱和亮色文字（终端风）
// ═══════════════════════════════════════════════════════════════

// 方案 A 「海平线」（SEP 9月）—— 亮底 + 深字
// 浅蓝绿 → 浅金 → 浅橙 → 浅红，文字统一深色
const ANN_BG_A: Record<string, string> = {
  "__ann_0": "#b7e4c7",  // 0-10%   浅薄草绿
  "__ann_1": "#74c69d",  // 10-20%  中绿
  "__ann_2": "#52b788",  // 20-30%  标准绿
  "__ann_3": "#f4d35e",  // 30-40%  亮金黄
  "__ann_4": "#f4a261",  // 40-50%  浅橙
  "__ann_5": "#e76f51",  // 50-70%  浅红橙
  "__ann_6": "#c1121f",  // 70%+    标准红
};

// 方案 B 「日落」（DEC 12月）—— 亮底 + 深字
// 浅蓝 → 浅紫 → 浅橙 → 深红，文字统一深色
const ANN_BG_B: Record<string, string> = {
  "__ann_0": "#bde0fe",  // 0-10%   浅天蓝
  "__ann_1": "#90c2e8",  // 10-20%  中蓝
  "__ann_2": "#c77dff",  // 20-30%  浅紫
  "__ann_3": "#ffb347",  // 30-40%  浅橙黄
  "__ann_4": "#ff7b54",  // 40-50%  浅橙红
  "__ann_5": "#e63946",  // 50-70%  标准红
  "__ann_6": "#9d0208",  // 70%+    深红
};

// 方案 C 「终端」（MAR 3月）—— 深底 + 高饱和亮字
// Bloomberg 风：深黑 + 亮绿文字，高年化用亮黄/红文字
const ANN_BG_C: Record<string, string> = {
  "__ann_0": "#0d1117",  // 0-10%   极深黑
  "__ann_1": "#0d1117",  // 10-20%  极深黑
  "__ann_2": "#0d1117",  // 20-30%  极深黑
  "__ann_3": "#0d1117",  // 30-40%  极深黑
  "__ann_4": "#0d1117",  // 40-50%  极深黑
  "__ann_5": "#0d1117",  // 50-70%  极深黑
  "__ann_6": "#0d1117",  // 70%+    极深黑
};
// 方案C 文字颜色（高饱和，按年化区间）
const ANN_TEXT_C: Record<string, string> = {
  "__ann_0": "#00ff88",  // 0-10%   霸光绿
  "__ann_1": "#00e676",  // 10-20%  亮绿
  "__ann_2": "#69f0ae",  // 20-30%  浅绿
  "__ann_3": "#ffeb3b",  // 30-40%  亮黄
  "__ann_4": "#ff9800",  // 40-50%  亮橙
  "__ann_5": "#ff5252",  // 50-70%  亮红
  "__ann_6": "#ff1744",  // 70%+    霸光红
};

// 方案 D 「暗金」（JUN 6月）—— 深底 + 高饱和亮字
// 深灰蓝底 + 品牌金色文字渐变
const ANN_BG_D: Record<string, string> = {
  "__ann_0": "#0d1b2a",  // 0-10%   深灰蓝
  "__ann_1": "#0d1b2a",  // 10-20%  深灰蓝
  "__ann_2": "#0d1b2a",  // 20-30%  深灰蓝
  "__ann_3": "#0d1b2a",  // 30-40%  深灰蓝
  "__ann_4": "#0d1b2a",  // 40-50%  深灰蓝
  "__ann_5": "#0d1b2a",  // 50-70%  深灰蓝
  "__ann_6": "#0d1b2a",  // 70%+    深灰蓝
};
// 方案D 文字颜色（品牌金色渐变）
const ANN_TEXT_D: Record<string, string> = {
  "__ann_0": "#4fc3f7",  // 0-10%   冰蓝
  "__ann_1": "#81d4fa",  // 10-20%  浅蓝
  "__ann_2": "#aed581",  // 20-30%  黄绿
  "__ann_3": "#cba471",  // 30-40%  品牌金
  "__ann_4": "#ffb74d",  // 40-50%  亮金橙
  "__ann_5": "#ff8a65",  // 50-70%  浅橙红
  "__ann_6": "#ef5350",  // 70%+    亮红
};

// 文字颜色：根据底色亮度返回高对比色
function annTextColor(bg: string): string {
  const r = parseInt(bg.slice(1,3), 16);
  const g = parseInt(bg.slice(3,5), 16);
  const b = parseInt(bg.slice(5,7), 16);
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum > 128 ? '#111111' : '#ffffff';
}

function getAnnBg(expiryCode: string, key: string): string {
  if (expiryCode.startsWith('SEP')) return ANN_BG_A[key] ?? 'var(--ac-bg-cell-empty)';
  if (expiryCode.startsWith('DEC')) return ANN_BG_B[key] ?? 'var(--ac-bg-cell-empty)';
  if (expiryCode.startsWith('MAR')) return ANN_BG_C[key] ?? '#0d1117';
  return ANN_BG_D[key] ?? '#0d1b2a'; // JUN
}

// 获取文字颜色：方案C/D 用高饱和亮色，方案A/B 用自动亮度判断
function getAnnText(expiryCode: string, key: string): string {
  if (expiryCode.startsWith('MAR')) return ANN_TEXT_C[key] ?? '#ffffff';
  if (!expiryCode.startsWith('SEP') && !expiryCode.startsWith('DEC')) return ANN_TEXT_D[key] ?? '#ffffff'; // JUN
  return annTextColor(getAnnBg(expiryCode, key)); // SEP/DEC 自动判断
}

// 兼容旧代码引用
const ANN_BG = ANN_BG_A;
const ANN_BORDER: Record<string, string> = {};
function annualizedBorder(v: number | null): string {
  return "border-[var(--ac-border)]/30";
}

// ─── 类型 ──────────────────────────────────────────────────────
type WsStatus = "connecting" | "connected" | "reconnecting" | "error";

interface CellData {
  markUsd: number | null;
  bidUsd: number | null;
  askUsd: number | null;
  iv: number | null;       // mark_iv
  bidIv: number | null;   // bid_iv
  askIv: number | null;   // ask_iv
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  openInterest: number | null;
  volume: number | null;
  lastPrice: number | null;
  annualized: number | null;
  prevAnnualized: number | null; // 上一秒的年化，用于显示箭头
  instrumentName: string;
  ivRank: number | null; // IVR 百分位（全量历史预计算）
}

type MatrixData = Map<string, CellData>;
// 记录某个到期日实际存在的行权价集合
type ExistMap = Map<string, Set<number>>; // key: expiryCode

interface DetailCell {
  strike: number;
  expiry: ExpiryConfig;
  data: CellData;
  ethPrice: number;
}

// ─── 历史年化折线图 ────────────────────────────────────────────
interface HistPoint { date: string; ann: number; }
interface IVPoint { date: string; mark: number; bid: number | null; ask: number | null; }

function HistoryChart({ instrumentName, expireDate, onRange, optionType, strike }: { instrumentName: string; expireDate: string; onRange?: (range: { startDate: string; endDate: string; days: number }) => void; optionType?: 'C' | 'P'; strike?: number }) {
  const [points, setPoints] = useState<HistPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string; days: number } | null>(null);
  const onRangeRef = useRef(onRange);
  useEffect(() => { onRangeRef.current = onRange; });

  useEffect(() => {
    if (!instrumentName) return;
    setLoading(true);
    setError(false);
    const isPut = optionType === 'P' && strike && strike > 0;
    const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
    const results: Record<number, { ticks: number[]; close: number[] }> = {};
    ws.onopen = () => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: 9998,
        method: "public/get_instrument",
        params: { instrument_name: instrumentName }
      }));
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.id === 9998) {
          const now = Date.now();
          const start = (d.result?.creation_timestamp) ?? (now - 365 * 24 * 3600 * 1000);
          ws.send(JSON.stringify({
            jsonrpc: "2.0", id: 9999,
            method: "public/get_tradingview_chart_data",
            params: { instrument_name: instrumentName, start_timestamp: start, end_timestamp: now, resolution: "1D" }
          }));
          if (isPut) {
            // PUT 年化需要 ETH 历史价格
            ws.send(JSON.stringify({
              jsonrpc: "2.0", id: 9997,
              method: "public/get_tradingview_chart_data",
              params: { instrument_name: "ETH-PERPETUAL", start_timestamp: start, end_timestamp: now, resolution: "1D" }
            }));
          }
          return;
        }
        if (d.id === 9999 || d.id === 9997) {
          results[d.id] = d.result || {};
          // CALL 只需等 9999；PUT 需等 9999 + 9997
          if (!results[9999]) return;
          if (isPut && !results[9997]) return;

          const r = results[9999];
          const ticks: number[] = r.ticks || [];
          const ticksMs: number[] = ticks.map((t: number) => t < 10_000_000_000 ? t * 1000 : t);
          const closes: number[] = r.close || [];
          const expMs = new Date(expireDate).getTime();

          // 构建 ETH 历史价格映射（PUT 年化用）
          const ethHistMap = new Map<number, number>();
          if (isPut && results[9997]) {
            const eth = results[9997];
            (eth.ticks || []).forEach((t: number, i: number) => {
              const tMs = t < 10_000_000_000 ? t * 1000 : t;
              ethHistMap.set(tMs, (eth.close || [])[i]);
            });
          }

          const pts: HistPoint[] = ticksMs.map((tMs: number, i: number) => {
            const daysLeft = Math.max(1, (expMs - tMs) / 86400000);
            const yearsLeft = daysLeft / 365;
            let ann = 0;
            if (isPut) {
              const S = ethHistMap.get(tMs) ?? 0;
              // PUT 年化 = mark_price(ETH) × S / strike / yearsLeft
              ann = closes[i] > 0 && S > 0 && strike > 0 ? (closes[i] * S / strike) / yearsLeft : 0;
            } else {
              ann = closes[i] > 0 ? closes[i] / yearsLeft : 0;
            }
            const d2 = new Date(tMs);
            const label = `${d2.getMonth() + 1}/${d2.getDate()}`;
            return { date: label, ann: Math.round(ann * 10000) / 100 };
          }).filter((p: HistPoint) => p.ann > 0);
          setPoints(pts);
          setLoading(false);
          ws.close();
          if (pts.length > 0 && ticksMs.length > 0) {
            const fmtDate = (ts: number) => {
              const d2 = new Date(ts);
              return `${d2.getFullYear()}/${String(d2.getMonth()+1).padStart(2,'0')}/${String(d2.getDate()).padStart(2,'0')}`;
            };
            const days = Math.round((ticksMs[ticksMs.length-1] - ticksMs[0]) / 86400000) + 1;
            const rangeObj = { startDate: fmtDate(ticksMs[0]), endDate: fmtDate(ticksMs[ticksMs.length-1]), days };
            setDateRange(rangeObj);
            if (onRangeRef.current) onRangeRef.current(rangeObj);
          }
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => { setError(true); setLoading(false); };
    return () => { try { ws.close(); } catch { /* ignore */ } };
  }, [instrumentName, expireDate, optionType, strike]);

  if (loading) return <div className="text-center text-[var(--ac-text-secondary)] text-xs py-6">加载历史数据...</div>;
  if (error || points.length === 0) return <div className="text-center text-[var(--ac-text-muted)] text-xs py-4">暂无历史数据</div>;
  // dateRange 在组件内部渲染，不依赖父组件 state

  // 手动绘制 SVG 折线图（不依赖额外库）
  const W = 280, H = 80, PL = 32, PR = 8, PT = 8, PB = 20;
  const cw = W - PL - PR, ch = H - PT - PB;
  const vals = points.map(p => p.ann);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const toX = (i: number) => PL + (i / (points.length - 1)) * cw;
  const toY = (v: number) => PT + ch - ((v - minV) / range) * ch;
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.ann).toFixed(1)}`).join(" ");
  // 甜蜜窗口线 y=24
  const sweetY = toY(24);
  // 标注点：最新、最高、最低
  const lastIdx = points.length - 1;
  // 显示的x轴刻度（最多5个）
  const step = Math.max(1, Math.floor(points.length / 4));
  const xLabels = points.filter((_, i) => i % step === 0 || i === lastIdx);

  const curV = points[lastIdx].ann;
  const maxIdx = vals.indexOf(maxV);
  const minIdx = vals.indexOf(minV);

  return (
    <div className="mt-1">
      {/* 起止日期和天数 */}
      {dateRange && (
        <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans mb-1">
          {dateRange.startDate} — {dateRange.endDate} · 共 {dateRange.days} 天
        </div>
      )}
      {/* HTML图例行：三个数字靠右紧凑排列，用CSS控制 */}
      <div className="flex justify-end items-center gap-3 mb-1 pr-0.5">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ff6b35' }} />
          <span className="text-[length:var(--ac-fs-sm)] font-semibold" style={{ color: '#ff6b35' }}>H {maxV.toFixed(2)}%</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00d4aa' }} />
          <span className="text-[length:var(--ac-fs-sm)] font-semibold" style={{ color: '#00d4aa' }}>L {minV.toFixed(2)}%</span>
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        {/* 甜蜜窗口参考线 */}
        {sweetY >= PT && sweetY <= PT + ch && (
          <line x1={PL} y1={sweetY} x2={W - PR} y2={sweetY} stroke="#22c55e" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.6" />
        )}
        {/* Y轴轴线 */}
        <line x1={PL} y1={PT} x2={PL} y2={PT + ch} stroke="#374151" strokeWidth="0.5" />
        {/* Y轴自适应刻度：根据数据范围自动选档 */}
        {(() => {
          // 根据 maxV 选择合适的步长，保证Y轴标签4~8个
          const span = maxV - minV;
          let step = 5;
          if (span > 200) step = 50;
          else if (span > 100) step = 25;
          else if (span > 50) step = 10;
          else if (span > 20) step = 5;
          else step = 2;
          const ticks: number[] = [];
          const start = Math.ceil(minV / step) * step;
          for (let v = start; v <= maxV + step * 0.1; v += step) ticks.push(Math.round(v * 100) / 100);
          return ticks.map(v => {
            const y = toY(v);
            if (y < PT - 2 || y > PT + ch + 2) return null;
            return (
              <g key={v}>
                <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#1f2937" strokeWidth="0.5" />
                <text x={PL - 3} y={y + 3} fontSize="7" fill="#6b7280" textAnchor="end">{v}%</text>
              </g>
            );
          });
        })()}
        {/* 折线 */}
        <path d={pathD} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round" />



        {/* 最高点：橙红 */}
        <circle cx={toX(maxIdx)} cy={toY(maxV)} r="2.5" fill="#ff6b35" />
        <text x={toX(maxIdx) > W/2 ? toX(maxIdx)-4 : toX(maxIdx)+4} y={toY(maxV)-4} fontSize="7" fill="#ff6b35" textAnchor={toX(maxIdx) > W/2 ? 'end' : 'start'}>H</text>
        {/* 最低点：青绿 */}
        <circle cx={toX(minIdx)} cy={toY(minV)} r="2.5" fill="#00d4aa" />
        <text x={toX(minIdx) > W/2 ? toX(minIdx)-4 : toX(minIdx)+4} y={toY(minV)+10} fontSize="7" fill="#00d4aa" textAnchor={toX(minIdx) > W/2 ? 'end' : 'start'}>L</text>
        {/* 当前点：白色 */}
        <circle cx={toX(lastIdx)} cy={toY(curV)} r="3" fill="#ffffff" stroke="#60a5fa" strokeWidth="1.5" />
        <text
          x={toX(lastIdx) > W / 2 ? toX(lastIdx) - 5 : toX(lastIdx) + 6}
          y={toY(curV) - 4}
          fontSize="8" fill="#ffffff" fontWeight="600"
          textAnchor={toX(lastIdx) > W / 2 ? "end" : "start"}
        >{curV.toFixed(2)}%</text>
        {/* X轴日期 */}
        {xLabels.map((p, i) => {
          const origIdx = points.indexOf(p);
          return <text key={i} x={toX(origIdx)} y={H - 2} fontSize="7" fill="#6b7280" textAnchor="middle">{p.date}</text>;
        })}
      </svg>
    </div>
  );
}


// ─── Black-Scholes 反推 IV 工具函数 ───────────────────────────────────
function erfApprox(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const res = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? res : -res;
}
function normCdf(x: number): number { return 0.5 * (1 + erfApprox(x / Math.SQRT2)); }
function bsCallPrice(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, S - K);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  return S * normCdf(d1) - K * normCdf(d1 - sigma * Math.sqrt(T));
}
function bsPutPrice(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, K - S);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  return K * normCdf(-(d1 - sigma * Math.sqrt(T))) - S * normCdf(-d1);
}
function impliedVolPut(priceUsd: number, S: number, K: number, T: number): number | null {
  if (priceUsd <= 0 || T <= 0 || S <= 0) return null;
  let sigma = 0.8;
  for (let i = 0; i < 100; i++) {
    const p = bsPutPrice(S, K, T, sigma);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
    const vega = S * normCdf(d1) * Math.sqrt(T); // vega 对 call 和 put 相同
    if (vega < 1e-10) break;
    const diff = p - priceUsd;
    if (Math.abs(diff) < 1e-5) break;
    sigma -= diff / vega;
    if (sigma <= 0) sigma = 0.001;
  }
  return (sigma > 0.01 && sigma < 20) ? sigma : null;
}
function impliedVol(priceUsd: number, S: number, K: number, T: number): number | null {
  if (priceUsd <= 0 || T <= 0 || S <= 0) return null;
  let sigma = 0.8;
  for (let i = 0; i < 100; i++) {
    const p = bsCallPrice(S, K, T, sigma);
    const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
    const vega = S * normCdf(d1) * Math.sqrt(T);
    if (vega < 1e-10) break;
    const diff = p - priceUsd;
    if (Math.abs(diff) < 1e-5) break;
    sigma -= diff / vega;
    if (sigma <= 0) sigma = 0.001;
  }
  return (sigma > 0.01 && sigma < 20) ? sigma : null;
}

// ─── IV 历史走势图（BS反推） ──────────────────────────────────────────
function IVHistoryChart({ instrumentName, strike, expireDate, onIVR }: { instrumentName: string; strike: number; expireDate: string; onIVR?: (ivr: number) => void }) {
  const [points, setPoints] = useState<IVPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!instrumentName) return;
    setLoading(true);
    setError(false);
    const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
    const results: Record<number, { ticks: number[]; close: number[] }> = {};
    ws.onopen = () => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: 8880,
        method: "public/get_instrument",
        params: { instrument_name: instrumentName }
      }));
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.id === 8880) {
          const now = Date.now();
          const start = (d.result?.creation_timestamp) ?? (now - 365 * 24 * 3600 * 1000);
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: 8881,
            method: "public/get_tradingview_chart_data",
            params: { instrument_name: instrumentName, start_timestamp: start, end_timestamp: now, resolution: "1D" }
          }));
          ws.send(JSON.stringify({ jsonrpc: "2.0", id: 8882,
            method: "public/get_tradingview_chart_data",
            params: { instrument_name: "ETH-PERPETUAL", start_timestamp: start, end_timestamp: now, resolution: "1D" }
          }));
          return;
        }
        if (d.id === 8881 || d.id === 8882) {
          results[d.id] = d.result || {};
          if (results[8881] && results[8882]) {
            const opt = results[8881];
            const eth = results[8882];
            const expireMs = new Date(expireDate).getTime();
            const K = strike;
            const ethMap = new Map<number, number>();
            (eth.ticks || []).forEach((t: number, i: number) => ethMap.set(t, (eth.close || [])[i]));
            const pts: IVPoint[] = (opt.ticks || []).map((t: number, i: number) => {
              const S = ethMap.get(t) ?? 0;
              const optPriceUsd = ((opt.close || [])[i] ?? 0) * S;
              const T = Math.max(0.001, (expireMs - t) / (365 * 24 * 3600 * 1000));
              const iv = S > 0 ? impliedVol(optPriceUsd, S, K, T) : null;
              const d2 = new Date(t);
              return { date: `${d2.getMonth() + 1}/${d2.getDate()}`, mark: iv !== null ? iv * 100 : 0, bid: null, ask: null };
            }).filter((p: IVPoint) => p.mark > 0);
            setPoints(pts);
            setLoading(false);
            ws.close();
            // 计算 IVR：当前 IV 在 60 天历史中的百分位
            if (pts.length > 1 && onIVR) {
              const ivVals = pts.map(p => p.mark);
              const curIV = ivVals[ivVals.length - 1];
              const below = ivVals.slice(0, -1).filter(v => v < curIV).length;
              const ivr = Math.round((below / (ivVals.length - 1)) * 100);
              onIVR(ivr);
            }
          }
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => { setError(true); setLoading(false); };
    return () => { try { ws.close(); } catch { /* ignore */ } };
  }, [instrumentName, strike, expireDate]);

  if (loading) return <div className="text-center text-[var(--ac-text-secondary)] text-xs py-6">加载IV历史...</div>;
  if (error || points.length === 0) return <div className="text-center text-[var(--ac-text-muted)] text-xs py-4">暂无IV历史数据</div>;

  const W = 280, H = 80, PL = 32, PR = 8, PT = 8, PB = 20;
  const cw = W - PL - PR, ch = H - PT - PB;
  const markVals = points.map(p => p.mark);
  const allVals = [
    ...markVals,
    ...points.map(p => p.bid).filter((v): v is number => v !== null),
    ...points.map(p => p.ask).filter((v): v is number => v !== null),
  ];
  const minV = Math.min(...allVals), maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const toX = (i: number) => PL + (i / (points.length - 1)) * cw;
  const toY = (v: number) => PT + ch - ((v - minV) / range) * ch;

  const markPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.mark).toFixed(1)}`).join(" ");
  const bidPath = points.filter(p => p.bid !== null).map((p, i) => {
    const origIdx = points.indexOf(p);
    return `${i === 0 ? "M" : "L"} ${toX(origIdx).toFixed(1)} ${toY(p.bid!).toFixed(1)}`;
  }).join(" ");
  const askPath = points.filter(p => p.ask !== null).map((p, i) => {
    const origIdx = points.indexOf(p);
    return `${i === 0 ? "M" : "L"} ${toX(origIdx).toFixed(1)} ${toY(p.ask!).toFixed(1)}`;
  }).join(" ");

  const lastIdx = points.length - 1;
  const curMark = points[lastIdx].mark;
  const maxMark = Math.max(...markVals);
  const minMark = Math.min(...markVals);
  const maxMarkIdx = markVals.indexOf(maxMark);
  const minMarkIdx = markVals.indexOf(minMark);
  const xStep = Math.max(1, Math.floor(points.length / 4));
  const xLabels = points.filter((_, i) => i % xStep === 0 || i === lastIdx);

  const span = maxV - minV;
  let yStep = 5;
  if (span > 200) yStep = 50;
  else if (span > 100) yStep = 25;
  else if (span > 50) yStep = 10;
  else if (span > 20) yStep = 5;
  else yStep = 2;
  const yTicks: number[] = [];
  const yStart = Math.ceil(minV / yStep) * yStep;
  for (let v = yStart; v <= maxV + yStep * 0.1; v += yStep) yTicks.push(Math.round(v));

  return (
    <div className="mt-1">
      <div className="flex justify-end items-center gap-3 mb-1 pr-0.5">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ff6b35' }} />
          <span className="text-[length:var(--ac-fs-sm)] font-semibold" style={{ color: '#ff6b35' }}>H {maxMark.toFixed(1)}%</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00d4aa' }} />
          <span className="text-[length:var(--ac-fs-sm)] font-semibold" style={{ color: '#00d4aa' }}>L {minMark.toFixed(1)}%</span>
        </span>
        <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-muted)]">--- Bid/Ask</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        <line x1={PL} y1={PT} x2={PL} y2={PT + ch} stroke="#374151" strokeWidth="0.5" />
        {yTicks.map(v => {
          const y = toY(v);
          if (y < PT - 2 || y > PT + ch + 2) return null;
          return (
            <g key={v}>
              <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#1f2937" strokeWidth="0.5" />
              <text x={PL - 3} y={y + 3} fontSize="7" fill="#6b7280" textAnchor="end">{v}%</text>
            </g>
          );
        })}
        {bidPath && <path d={bidPath} fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.45" />}
        {askPath && <path d={askPath} fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.45" />}
        <path d={markPath} fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinejoin="round" />
        {/* 最高点：橙红 */}
        <circle cx={toX(maxMarkIdx)} cy={toY(maxMark)} r="2.5" fill="#ff6b35" />
        <text x={toX(maxMarkIdx) > W/2 ? toX(maxMarkIdx)-4 : toX(maxMarkIdx)+4} y={toY(maxMark)-4} fontSize="7" fill="#ff6b35" textAnchor={toX(maxMarkIdx) > W/2 ? 'end' : 'start'}>H</text>
        {/* 最低点：青绿 */}
        <circle cx={toX(minMarkIdx)} cy={toY(minMark)} r="2.5" fill="#00d4aa" />
        <text x={toX(minMarkIdx) > W/2 ? toX(minMarkIdx)-4 : toX(minMarkIdx)+4} y={toY(minMark)+10} fontSize="7" fill="#00d4aa" textAnchor={toX(minMarkIdx) > W/2 ? 'end' : 'start'}>L</text>
        {/* 当前点：白色 */}
        <circle cx={toX(lastIdx)} cy={toY(curMark)} r="3" fill="#ffffff" stroke="#22d3ee" strokeWidth="1.5" />
        <text
          x={toX(lastIdx) > W / 2 ? toX(lastIdx) - 5 : toX(lastIdx) + 6}
          y={toY(curMark) - 4}
          fontSize="8" fill="#ffffff" fontWeight="600"
          textAnchor={toX(lastIdx) > W / 2 ? "end" : "start"}
        >{curMark.toFixed(1)}%</text>
        {xLabels.map((p, i) => {
          const origIdx = points.indexOf(p);
          return <text key={i} x={toX(origIdx)} y={H - 2} fontSize="7" fill="#6b7280" textAnchor="middle">{p.date}</text>;
        })}
      </svg>
    </div>
  );
}

// ─── Greeks/IV 历史走势图（BS反推全量） ──────────────────────────────
type GreekKey = 'iv' | 'delta' | 'gamma' | 'theta' | 'vega' | 'rho';
interface GreekPoint { date: string; value: number; }

function GreeksHistoryChart({ instrumentName, strike, expireDate, metric, color, refLine, onIVR, onRange, optionType }: {
  instrumentName: string; strike: number; expireDate: string;
  metric: GreekKey; color: string; refLine?: number; onIVR?: (ivr: number, mean?: number) => void;
  onRange?: (range: { startDate: string; endDate: string; days: number }) => void;
  optionType?: 'C' | 'P';
}) {
  const [points, setPoints] = useState<GreekPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!instrumentName) return;
    setLoading(true); setError(false);
    const ws = new WebSocket('wss://www.deribit.com/ws/api/v2');
    const results: Record<number, { ticks: number[]; close: number[] }> = {};
    let creationTimestamp: number | null = null;
    ws.onopen = () => {
      // 先查合约信息，获取上市时间（creation_timestamp），再拉全量历史
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 7770,
        method: 'public/get_instrument',
        params: { instrument_name: instrumentName }
      }));
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.id === 7770) {
          // 合约信息返回，获取上市时间
          const info = d.result || {};
          creationTimestamp = info.creation_timestamp ?? null;
          const now = Date.now();
          // 如果没有上市时间，回退到合约到期前1年
          const start = creationTimestamp ?? (now - 365 * 24 * 3600 * 1000);
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: 7771,
            method: 'public/get_tradingview_chart_data',
            params: { instrument_name: instrumentName, start_timestamp: start, end_timestamp: now, resolution: '1D' }
          }));
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: 7772,
            method: 'public/get_tradingview_chart_data',
            params: { instrument_name: 'ETH-PERPETUAL', start_timestamp: start, end_timestamp: now, resolution: '1D' }
          }));
          return;
        }
        if (d.id === 7771 || d.id === 7772) {
          results[d.id] = d.result || {};
          if (results[7771] && results[7772]) {
            const opt = results[7771]; const eth = results[7772];
            const expireMs = new Date(expireDate).getTime();
            const K = strike;
            // Deribit ticks 是秒，转为毫秒
            const toMs = (t: number) => t < 10_000_000_000 ? t * 1000 : t;
            const ethMap = new Map<number, number>();
            (eth.ticks || []).forEach((t: number, i: number) => ethMap.set(toMs(t), (eth.close || [])[i]));
            const pts: GreekPoint[] = (opt.ticks || []).map((t: number, i: number) => {
              const tMs = toMs(t);
              const S = ethMap.get(tMs) ?? 0;
              if (S <= 0) return null;
              const optPriceUsd = ((opt.close || [])[i] ?? 0) * S;
              const T = Math.max(0.001, (expireMs - tMs) / (365 * 24 * 3600 * 1000));
              const isPutOpt = optionType === 'P';
              const sigma = isPutOpt
                ? impliedVolPut(optPriceUsd, S, K, T)
                : impliedVol(optPriceUsd, S, K, T);
              if (!sigma) return null;
              const sqrtT = Math.sqrt(T);
              const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
              const d2v = d1 - sigma * sqrtT;
              const nd1 = normCdf(d1);
              const phi_d1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
              let value = 0;
              if (metric === 'iv') value = sigma * 100;
              else if (metric === 'delta') value = isPutOpt ? nd1 - 1 : nd1;
              else if (metric === 'gamma') value = phi_d1 / (S * sigma * sqrtT);
              else if (metric === 'theta') value = -(S * phi_d1 * sigma) / (2 * sqrtT) / 365;
              else if (metric === 'vega') value = S * phi_d1 * sqrtT / 100;
              else if (metric === 'rho') value = isPutOpt
                ? -K * T * normCdf(-d2v) / 100
                : K * T * normCdf(d2v) / 100;
              const label = new Date(tMs);
              return { date: `${label.getMonth() + 1}/${label.getDate()}`, value };
            }).filter((p): p is GreekPoint => p !== null && isFinite(p.value));
            setPoints(pts); setLoading(false); ws.close();
            // 传递起止日期和天数
            if (pts.length > 0 && onRange) {
              const ticks = opt.ticks || [];
              const firstTickMs = toMs(ticks[0]);
              const lastTickMs = toMs(ticks[ticks.length - 1]);
              if (firstTickMs && lastTickMs) {
                const fmtDate = (ts: number) => {
                  const d = new Date(ts);
                  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
                };
                const days = Math.round((lastTickMs - firstTickMs) / 86400000) + 1;
                onRange({ startDate: fmtDate(firstTickMs), endDate: fmtDate(lastTickMs), days });
              }
            }
            // 如果是 IV 指标，计算 IVR 百分位
            if (metric === 'iv' && pts.length > 1 && onIVR) {
              const ivVals = pts.map(p => p.value);
              const curIV = ivVals[ivVals.length - 1];
              const below = ivVals.slice(0, -1).filter(v => v < curIV).length;
              const ivr = Math.round((below / (ivVals.length - 1)) * 100);
              const mean = ivVals.reduce((a, b) => a + b, 0) / ivVals.length;
              onIVR(ivr, parseFloat(mean.toFixed(2)));
            }
          }
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => { setError(true); setLoading(false); };
    return () => { try { ws.close(); } catch { /* ignore */ } };
  }, [instrumentName, strike, expireDate, metric, optionType]);

  if (loading) return <div className="text-center text-[var(--ac-text-secondary)] text-xs py-4">加载历史...</div>;
  if (error || points.length === 0) return <div className="text-center text-[var(--ac-text-muted)] text-xs py-3">暂无历史数据</div>;

  const W = 280, H = 72, PL = 34, PR = 8, PT = 6, PB = 18;
  const cw = W - PL - PR, ch = H - PT - PB;
  const vals = points.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const toX = (i: number) => PL + (i / (points.length - 1)) * cw;
  const toY = (v: number) => PT + ch - ((v - minV) / range) * ch;
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.value).toFixed(1)}`).join(' ');
  const lastIdx = points.length - 1;
  const curV = points[lastIdx].value;
  const maxIdx = vals.indexOf(maxV); const minIdx = vals.indexOf(minV);
  const xStep = Math.max(1, Math.floor(points.length / 4));
  const xLabels = points.filter((_, i) => i % xStep === 0 || i === lastIdx);
  // Y轴刻度
  const span = maxV - minV;
  // 智能计算 Y 轴步长：目标显示 3~5 个刻度
  const targetTicks = 4;
  const rawStep = span / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
  const niceStep = [1, 2, 2.5, 5, 10].map(f => f * magnitude).find(s => span / s <= targetTicks + 1) ?? magnitude;
  const yTicks: number[] = [];
  const yStart = Math.ceil((minV - niceStep * 0.01) / niceStep) * niceStep;
  for (let v = yStart; v <= maxV + niceStep * 0.1; v += niceStep) yTicks.push(parseFloat(v.toFixed(10)));
  // 智能格式化：根据数值量级自动选择小数位
  const fmtV = (v: number) => {
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    if (a >= 0.1) return v.toFixed(3);
    if (a >= 0.01) return v.toFixed(4);
    if (a >= 0.001) return v.toFixed(5);
    return v.toFixed(6);
  };

  return (
    <div className="mt-1">
      {/* 三个标注点颜色：最高点橙红、最低点青绿、当前点白色，和任何标题颜色都形成对比 */}
      <div className="flex justify-end items-center gap-3 mb-0.5 pr-0.5">
        <span className="text-[length:var(--ac-fs-sm)] font-semibold" style={{ color: '#ffffff' }}>现 {fmtV(curV)}{metric === 'iv' ? '%' : ''}</span>
        <span className="text-[length:var(--ac-fs-xs)]" style={{ color: '#ff6b35' }}>H {fmtV(maxV)}</span>
        <span className="text-[length:var(--ac-fs-xs)]" style={{ color: '#00d4aa' }}>L {fmtV(minV)}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <line x1={PL} y1={PT} x2={PL} y2={PT + ch} stroke="#374151" strokeWidth="0.5" />
        {yTicks.map(v => {
          const y = toY(v); if (y < PT - 2 || y > PT + ch + 2) return null;
          return (<g key={v}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#1f2937" strokeWidth="0.5" />
            <text x={PL - 3} y={y + 3} fontSize="7" fill="#6b7280" textAnchor="end">{fmtV(v)}</text>
          </g>);
        })}
        {refLine !== undefined && refLine >= minV && refLine <= maxV && (
          <line x1={PL} y1={toY(refLine)} x2={W - PR} y2={toY(refLine)} stroke="#6b7280" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.6" />
        )}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
        {/* 最高点：橙红 */}
        <circle cx={toX(maxIdx)} cy={toY(maxV)} r="2.5" fill="#ff6b35" />
        <text x={toX(maxIdx) > W/2 ? toX(maxIdx)-4 : toX(maxIdx)+4} y={toY(maxV)-4}
          fontSize="7" fill="#ff6b35" textAnchor={toX(maxIdx) > W/2 ? 'end' : 'start'}>H</text>
        {/* 最低点：青绿 */}
        <circle cx={toX(minIdx)} cy={toY(minV)} r="2.5" fill="#00d4aa" />
        <text x={toX(minIdx) > W/2 ? toX(minIdx)-4 : toX(minIdx)+4} y={toY(minV)+10}
          fontSize="7" fill="#00d4aa" textAnchor={toX(minIdx) > W/2 ? 'end' : 'start'}>L</text>
        {/* 当前点：白色，和所有标题颜色形成对比 */}
        <circle cx={toX(lastIdx)} cy={toY(curV)} r="3" fill="#ffffff" stroke={color} strokeWidth="1.5" />
        <text x={toX(lastIdx) > W/2 ? toX(lastIdx)-5 : toX(lastIdx)+6} y={toY(curV)-4}
          fontSize="8" fill="#ffffff" fontWeight="600"
          textAnchor={toX(lastIdx) > W/2 ? 'end' : 'start'}>{fmtV(curV)}{metric==='iv'?'%':''}</text>
        {xLabels.map((p, i) => {
          const origIdx = points.indexOf(p);
          return <text key={i} x={toX(origIdx)} y={H-2} fontSize="7" fill="#6b7280" textAnchor="middle">{p.date}</text>;
        })}
      </svg>
    </div>
  );
}

// ─── Payoff 图（卖方视角，SVG 实现）──────────────────────────
function PayoffChart({
  strike, premium, ethPrice, optionType
}: {
  strike: number;
  premium: number;    // USD
  ethPrice: number;  // 当前 ETH 现价
  optionType: 'C' | 'P';
}) {
  const W = 320, H = 110, PAD = { t: 10, r: 12, b: 22, l: 44 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  // X 轴范围：行权价 ±30%
  const xMin = strike * 0.70;
  const xMax = strike * 1.30;

  // 卖方到期损益函数（USD）
  // CALL 卖方：收权利金，ETH > K 时亏损无限
  // PUT  卖方：收权利金，ETH < K 时亏损（最大亏损 = K - premium）
  const payoff = (s: number) =>
    optionType === 'C'
      ? premium - Math.max(0, s - strike)   // 卖 CALL
      : premium - Math.max(0, strike - s);  // 卖 PUT

  // 采样 80 个点
  const N = 80;
  const xs = Array.from({ length: N }, (_, i) => xMin + (xMax - xMin) * i / (N - 1));
  const ys = xs.map(payoff);

  // Y 轴范围
  const yMin = Math.min(...ys) * 1.15;
  const yMax = Math.max(...ys) * 1.15 + premium * 0.05;

  const toX = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * chartW;
  const toY = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin)) * chartH;

  // 盈亏平衡点
  const bePrice = optionType === 'C' ? strike + premium : strike - premium;
  const beInRange = bePrice >= xMin && bePrice <= xMax;

  // 构建折线 polyline points
  const pts = xs.map((x, i) => `${toX(x).toFixed(1)},${toY(ys[i]).toFixed(1)}`).join(' ');

  // 构建填充区域（分盈利段绿色、亏损段红色）
  const buildArea = (positive: boolean) => {
    const zeroY = toY(0);
    const segments: string[] = [];
    let inSeg = false;
    let segPts: string[] = [];

    const flush = () => {
      if (segPts.length > 1) {
        // 闭合到 y=0 线
        const first = segPts[0].split(',');
        const last = segPts[segPts.length - 1].split(',');
        segments.push(`M ${segPts.join(' L ')} L ${last[0]},${zeroY.toFixed(1)} L ${first[0]},${zeroY.toFixed(1)} Z`);
      }
      segPts = [];
      inSeg = false;
    };

    xs.forEach((x, i) => {
      const y = ys[i];
      const isPos = positive ? y >= 0 : y < 0;
      if (isPos) {
        if (!inSeg) inSeg = true;
        segPts.push(`${toX(x).toFixed(1)},${toY(y).toFixed(1)}`);
      } else if (inSeg) {
        flush();
      }
    });
    if (inSeg) flush();
    return segments.join(' ');
  };

  // Y 轴刻度
  const yTicks = (() => {
    const range = yMax - yMin;
    const step = range > 2000 ? 1000 : range > 500 ? 200 : range > 100 ? 50 : 20;
    const ticks: number[] = [];
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v <= yMax; v += step) ticks.push(v);
    return ticks;
  })();

  const fmtUsd = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return v.toFixed(0);
  };

  return (
    <div className="px-2 py-2">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* 零线 */}
        <line x1={PAD.l} y1={toY(0)} x2={W - PAD.r} y2={toY(0)}
          stroke="#374151" strokeWidth="1" strokeDasharray="3,3" />
        {/* 盈利区域（绿色填充） */}
        <path d={buildArea(true)} fill="rgba(74,222,128,0.12)" />
        {/* 亏损区域（红色填充） */}
        <path d={buildArea(false)} fill="rgba(248,113,113,0.12)" />
        {/* 折线 */}
        <polyline points={pts} fill="none" stroke="#60a5fa" strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* 当前 ETH 价格竖线 */}
        {ethPrice >= xMin && ethPrice <= xMax && (
          <>
            <line x1={toX(ethPrice)} y1={PAD.t} x2={toX(ethPrice)} y2={H - PAD.b}
              stroke="#f59e0b" strokeWidth="1" strokeDasharray="2,2" />
            <text x={toX(ethPrice) + 3} y={PAD.t + 8} fontSize="7" fill="#f59e0b">现价</text>
          </>
        )}
        {/* 盈亏平衡线 */}
        {beInRange && (
          <>
            <line x1={toX(bePrice)} y1={PAD.t} x2={toX(bePrice)} y2={H - PAD.b}
              stroke="#a78bfa" strokeWidth="1" strokeDasharray="2,2" />
            <text x={toX(bePrice) + 3} y={PAD.t + 16} fontSize="7" fill="#a78bfa">BE</text>
          </>
        )}
        {/* 行权价竖线 */}
        <line x1={toX(strike)} y1={PAD.t} x2={toX(strike)} y2={H - PAD.b}
          stroke="#6b7280" strokeWidth="1" strokeDasharray="2,2" />
        {/* Y 轴刻度 */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={PAD.l - 3} y1={toY(v)} x2={PAD.l} y2={toY(v)} stroke="#374151" strokeWidth="0.5" />
            <text x={PAD.l - 5} y={toY(v) + 3} fontSize="7" fill={v >= 0 ? '#4ade80' : '#f87171'}
              textAnchor="end">{fmtUsd(v)}</text>
          </g>
        ))}
        {/* X 轴标签：左中右 */}
        {[xMin, strike, xMax].map((v, i) => (
          <text key={i} x={toX(v)} y={H - 4} fontSize="7" fill="#6b7280"
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
            {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0)}
          </text>
        ))}
        {/* 权利金标注 */}
        <text x={W - PAD.r} y={toY(premium) - 3} fontSize="7" fill="#4ade80"
          textAnchor="end">+{premium.toFixed(0)}</text>
      </svg>
      {/* 图例 */}
      <div className="flex items-center gap-3 px-1 mt-0.5 text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)]">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#60a5fa]" />损益</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#f59e0b]" />现价</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#a78bfa]" />盈亏平衡</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#6b7280]" />行权价</span>
      </div>
    </div>
  );
}

// ─── Theta 分析弹窗 ──────────────────────────────────────────────────
interface ThetaPopupCell {
  strike: number;
  expiry: ExpiryConfig;
  cell: CellData;
  ethPrice: number;
}

function ThetaPopupModal({ info, onClose, optionType }: { info: ThetaPopupCell; onClose: () => void; optionType: 'C' | 'P' }) {
  const { strike, expiry, cell, ethPrice } = info;
  const daysLeft = calcDaysLeft(expiry.expireDate);

  // ── 基础数据 ──
  const intrinsicEth = ethPrice > 0 && cell.markUsd !== null
    ? Math.max(0, optionType === 'C' ? (ethPrice - strike) / ethPrice : (strike - ethPrice) / ethPrice)
    : null;
  const markEth = cell.markUsd;
  const timeValueEth = markEth !== null && intrinsicEth !== null ? Math.max(0, markEth - intrinsicEth) : null;
  const timeValueUsd = timeValueEth !== null && ethPrice > 0 ? timeValueEth * ethPrice : null;
  const thetaDayUsd = cell.theta !== null && ethPrice > 0 ? Math.abs(cell.theta / 365 * ethPrice) : null;

  // ── 合约总天数：根据到期日推算上市日 ──
  const totalDays = (() => {
    const exp = new Date(expiry.expireDate);
    const expMonth = exp.getMonth() + 1; // 1-12
    const expYear = exp.getFullYear();
    const isQuarterly = [3, 6, 9, 12].includes(expMonth);
    if (isQuarterly) {
      // 季度合约：Deribit 提前一年上市
      // 上市日 = 前一年同季度到期日（最后一个周五）+ 1 天
      const prevYearExpMonth = expMonth;
      const prevYearExpYear = expYear - 1;
      // 找前一年同月最后一个周五
      const lastDayOfPrevYear = new Date(prevYearExpYear, prevYearExpMonth, 0);
      const dow = lastDayOfPrevYear.getDay();
      const daysBack = dow >= 5 ? dow - 5 : dow + 2; // 周五=5，周六=1，周日=2
      const prevYearExpiry = new Date(lastDayOfPrevYear);
      prevYearExpiry.setDate(lastDayOfPrevYear.getDate() - daysBack);
      // 上市日 = 前一年同季度到期日 + 1 天
      const listingDate = new Date(prevYearExpiry);
      listingDate.setDate(prevYearExpiry.getDate() + 1);
      const contractDays = Math.round((exp.getTime() - listingDate.getTime()) / 86400000);
      return Math.max(contractDays, daysLeft + 1);
    } else {
      // 非季度合约：用 candidates 备选列表估算
      const candidates = [7, 14, 30, 60, 90, 120, 180];
      return candidates.find(c => c >= daysLeft) ?? daysLeft;
    }
  })();
  const consumedDays = Math.max(0, totalDays - daysLeft);
  const tvRatioNow = totalDays > 0 ? Math.sqrt(daysLeft / totalDays) : 0;

  // ── 关键节点预估 ──
  const nodes: { label: string; dte: number; tvUsd: number | null; tvRatio: number }[] = [];
  if (timeValueUsd !== null && daysLeft > 0) {
    const steps = daysLeft <= 30 ? 3 : daysLeft <= 90 ? 7 : 14;
    for (let d = daysLeft - steps; d >= 0; d -= steps) {
      const ratio = totalDays > 0 ? Math.sqrt(d / totalDays) : 0;
      const tv = tvRatioNow > 0 ? timeValueUsd * (ratio / tvRatioNow) : 0;
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + (daysLeft - d));
      const label = d === 0 ? '到期日' : `${targetDate.getMonth()+1}/${targetDate.getDate()}`;
      nodes.push({ label, dte: d, tvUsd: tv, tvRatio: ratio });
      if (nodes.length >= 8) break;
    }
  }

  // ── θ/ν 比值 ──
  const thetaVegaRatio = cell.theta !== null && cell.vega !== null && cell.vega !== 0
    ? Math.abs(cell.theta / 365) / Math.abs(cell.vega) : null;
  const thetaVegaLabel = thetaVegaRatio !== null
    ? thetaVegaRatio > 0.1 ? '时间消耗快，不利买方'
    : thetaVegaRatio > 0.05 ? '中等性价比'
    : '波动率收益优先，适合买方'
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[80vh] overflow-y-auto rounded-t-xl border-t border-[var(--ac-border)] bg-[#0d1117] shadow-2xl"
        style={{ animation: 'slideUp 220ms cubic-bezier(0.23,1,0.32,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: '#fb7185' }}>θ Theta · 时间价值消耗分析</span>
              {daysLeft < 30 && (
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500/40">⚡ 加速消耗</span>
              )}
            </div>
            <div className="text-xs text-[var(--ac-text-muted)] font-sans mt-0.5">
              {optionType === 'C' ? 'CALL' : 'PUT'} · 行权价 ${strike.toLocaleString()} · {expiry.fullLabel} 到期
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--ac-text-muted)] hover:text-[var(--ac-text-secondary)] p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="px-4 pb-6 space-y-4">
          {/* 当前状态：4格并排 */}
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-2">
              <div className="text-[10px] text-[var(--ac-text-secondary)] font-sans">剩余天数</div>
              <div className="text-white font-bold text-sm">{daysLeft}D</div>
            </div>
            <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-2">
              <div className="text-[10px] text-[var(--ac-text-secondary)] font-sans">已消耗</div>
              <div className="text-[var(--ac-text-primary)] font-bold text-sm">{consumedDays}D</div>
            </div>
            <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-2">
              <div className="text-[10px] text-[var(--ac-text-secondary)] font-sans">时间价值</div>
              <div className="font-bold text-sm" style={{ color: '#fb7185' }}>
                {timeValueUsd !== null ? `$${timeValueUsd.toFixed(0)}` : '—'}
              </div>
            </div>
            <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-2">
              <div className="text-[10px] text-[var(--ac-text-secondary)] font-sans">θ/日 U</div>
              <div className="font-bold text-sm" style={{ color: '#fda4af' }}>
                {thetaDayUsd !== null ? `-$${thetaDayUsd.toFixed(2)}` : '—'}
              </div>
            </div>
          </div>

          {/* 消耗进度条 */}
          {timeValueUsd !== null && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-[var(--ac-text-secondary)] font-sans">时间价值剩余比例（√DTE 非线性）</span>
                <span className="text-xs font-semibold" style={{ color: '#fb7185' }}>{(tvRatioNow * 100).toFixed(1)}%</span>
              </div>
              <div className="relative h-6 rounded overflow-hidden bg-[var(--ac-bg-cell-empty)]">
                <div className="absolute left-0 top-0 h-full bg-[#374151]" style={{ width: `${(1 - tvRatioNow) * 100}%` }} />
                <div
                  className="absolute top-0 h-full"
                  style={{
                    left: `${(1 - tvRatioNow) * 100}%`,
                    width: `${tvRatioNow * 100}%`,
                    background: daysLeft < 30
                      ? 'linear-gradient(90deg, #f43f5e, #fb923c)'
                      : daysLeft < 60
                      ? 'linear-gradient(90deg, #fb7185, #fda4af)'
                      : 'linear-gradient(90deg, #fb7185aa, #fda4af)'
                  }}
                />
                <div className="absolute top-0 h-full w-0.5 bg-white/60" style={{ left: `${(1 - tvRatioNow) * 100}%` }} />
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  <span className="text-[10px] text-[var(--ac-text-muted)] font-sans">已消耗</span>
                  <span className="text-[10px] text-[var(--ac-text-secondary)] font-sans">剩余</span>
                </div>
              </div>
              <div className="text-[10px] text-[var(--ac-text-muted)] font-sans mt-1">基于 √(剩余DTE/总DTE) · 前段消耗慢，临近到期加速</div>
              {/* Theta 衰减曲线 */}
              {cell.iv !== null && ethPrice > 0 && (
                <ThetaDecayCurve
                  strike={strike}
                  expireDate={expiry.expireDate}
                  iv={cell.iv}
                  ethPrice={ethPrice}
                  daysLeft={daysLeft}
                  totalDays={totalDays}
                  isCall={optionType === 'C'}
                />
              )}
            </div>
          )}

          {/* 关键节点预估表 */}
          {nodes.length > 0 && timeValueUsd !== null && (
            <div>
              <div className="text-[10px] text-[var(--ac-text-secondary)] font-sans mb-2 tracking-widest uppercase">未来关键节点预估</div>
              <div className="rounded overflow-hidden border border-[var(--ac-border)]/40">
                <div className="grid grid-cols-4 bg-[var(--ac-bg-cell-empty)] px-3 py-1.5">
                  <span className="text-[10px] text-[var(--ac-text-muted)] font-sans">日期</span>
                  <span className="text-[10px] text-[var(--ac-text-muted)] font-sans text-center">剩余DTE</span>
                  <span className="text-[10px] text-[var(--ac-text-muted)] font-sans text-center">剩余比例</span>
                  <span className="text-[10px] text-[var(--ac-text-muted)] font-sans text-right">预估时间价值</span>
                </div>
                {/* 当前行 */}
                <div className="grid grid-cols-4 px-3 py-2 border-t border-[var(--ac-border)]/30 bg-rose-900/20">
                  <span className="text-xs font-semibold" style={{ color: '#fb7185' }}>现在</span>
                  <span className="text-xs text-center text-white">{daysLeft}D</span>
                  <span className="text-xs text-center" style={{ color: '#fb7185' }}>{(tvRatioNow * 100).toFixed(1)}%</span>
                  <span className="text-xs text-right font-semibold" style={{ color: '#fb7185' }}>${timeValueUsd.toFixed(0)}</span>
                </div>
                {nodes.map((n, i) => {
                  const isExpiry = n.dte === 0;
                  const isAccel = n.dte > 0 && n.dte <= 30;
                  return (
                    <div key={i} className={`grid grid-cols-4 px-3 py-2 border-t border-[var(--ac-border)]/20 ${
                      isExpiry ? 'bg-gray-800/60' : isAccel ? 'bg-orange-900/10' : ''
                    }`}>
                      <span className={`text-xs font-sans ${
                        isExpiry ? 'text-[var(--ac-text-secondary)]' : isAccel ? 'text-orange-300' : 'text-[var(--ac-text-secondary)]'
                      }`}>{n.label}</span>
                      <span className="text-xs text-center text-[var(--ac-text-secondary)]">{n.dte}D</span>
                      <span className={`text-xs text-center ${
                        isExpiry ? 'text-[var(--ac-text-muted)]' : isAccel ? 'text-orange-300' : 'text-[var(--ac-text-secondary)]'
                      }`}>{(n.tvRatio * 100).toFixed(1)}%</span>
                      <span className={`text-xs text-right ${
                        isExpiry ? 'text-[var(--ac-text-muted)]' : isAccel ? 'text-orange-300 font-semibold' : 'text-[var(--ac-text-primary)]'
                      }`}>{isExpiry ? '$0' : n.tvUsd !== null ? `$${n.tvUsd.toFixed(0)}` : '—'}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] text-[var(--ac-text-muted)] font-sans mt-1">橙色行 = DTE≤30 加速消耗阶段 · 预估值基于当前时间价值等比推算</div>
            </div>
          )}

          {/* θ/ν 比值 */}
          {thetaVegaRatio !== null && (
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--ac-border)]/20">
              <span className="text-xs text-[var(--ac-text-secondary)] font-sans">θ/ν 比值</span>
              <span className="text-sm font-semibold" style={{ color: thetaVegaRatio > 0.1 ? '#f87171' : thetaVegaRatio > 0.05 ? '#fbbf24' : '#34d399' }}>
                {thetaVegaRatio.toFixed(4)}
              </span>
              {thetaVegaLabel && <span className="text-xs text-[var(--ac-text-muted)] font-sans">· {thetaVegaLabel}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 详情弹窗 ──────────────────────────────────────────────────
function DetailModal({ cell, onClose, optionType }: { cell: DetailCell; onClose: () => void; optionType: 'C' | 'P' }) {
  const { strike, expiry, data, ethPrice } = cell;
  const daysLeft = calcDaysLeft(expiry.expireDate);
  const yearsLeft = daysLeft / 365;
  const fmt = (v: number | null, digits = 2, prefix = "") =>
    v !== null ? `${prefix}${v.toFixed(digits)}` : "—";

  const [activeMetric, setActiveMetric] = useState<GreekKey | null>(null);
  const [ivRank, setIvRank] = useState<number | null>(null);
  const [ivMean, setIvMean] = useState<number | null>(null); // IV 历史均値（%）
  const [historyRange, setHistoryRange] = useState<{ startDate: string; endDate: string; days: number } | null>(null);
  const [annHistRange, setAnnHistRange] = useState<{ startDate: string; endDate: string; days: number } | null>(null);

  // 向下滑动关闭手势
  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef(0);
  const isDragging = useRef(false);
  const CLOSE_THRESHOLD = 120; // 下拉超过 120px 则关闭

  // 点击同一个指标再次点击则关闭图表
  const toggleMetric = (m: GreekKey) => setActiveMetric(prev => prev === m ? null : m);

  // ── 派生指标 ──
  const markUsdDollar = data.markUsd !== null && ethPrice > 0 ? data.markUsd * ethPrice : null;
  // λ Lambda = delta × (ETH现价 / 标记价USD)
  const lambda = data.delta !== null && markUsdDollar !== null && markUsdDollar > 0
    ? data.delta * (ethPrice / markUsdDollar) : null;
  // Break-even = 行权价 ± 标记价USD
  const breakEven = markUsdDollar !== null
    ? (optionType === 'C' ? strike + markUsdDollar : strike - markUsdDollar) : null;
  // Theta/日 USD（Deribit API 返回的是年化值，除以365得日化，再×ETH现价得USD/天）
  const thetaDaily = data.theta !== null ? data.theta / 365 : null;
  const thetaUsd = thetaDaily !== null && ethPrice > 0 ? thetaDaily * ethPrice : null;
  // Vega/1%IV USD（Deribit Vega 已是 IV 变动 1% 的敏感度，×ETH现价得USD）
  const vegaUsd = data.vega !== null && ethPrice > 0 ? data.vega * ethPrice : null;
  // 权利金占行权价比例
  const premiumRatio = markUsdDollar !== null && strike > 0
    ? (markUsdDollar / strike) * 100 : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[var(--ac-bg-card)] border border-[var(--ac-border)] rounded-[1.5px]-2xl pb-safe"
        style={{
          maxHeight: "80vh",
          overflowY: dragY > 0 ? "hidden" : "auto",
          transform: `translateY(${Math.max(0, dragY)}px)`,
          transition: isDragging.current ? "none" : "transform 300ms cubic-bezier(0.23,1,0.32,1)",
          opacity: dragY > 0 ? Math.max(0.4, 1 - dragY / 300) : 1,
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={(e) => {
          dragStartY.current = e.touches[0].clientY;
          isDragging.current = false;
          setDragY(0);
        }}
        onTouchMove={(e) => {
          const dy = e.touches[0].clientY - dragStartY.current;
          if (dy > 8) {
            isDragging.current = true;
            setDragY(dy);
            e.stopPropagation();
          }
        }}
        onTouchEnd={() => {
          if (dragY >= CLOSE_THRESHOLD) {
            onClose();
          } else {
            isDragging.current = false;
            setDragY(0);
          }
        }}
      >
        {/* 顶部拖拽指示条 */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div
            className="rounded-full bg-[#484F58] transition-all duration-200"
            style={{ width: dragY > 20 ? 48 : 36, height: 4, opacity: dragY > 0 ? 1 : 0.5 }}
          />
        </div>
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ac-border-subtle)] sticky top-0 bg-[var(--ac-bg-card)]/95 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-base font-sans">${strike.toLocaleString()}</span>
              <span className="text-[length:var(--ac-fs-sm)] font-sans text-[var(--ac-text-secondary)]">{optionType === 'C' ? 'CALL' : 'PUT'}</span>
            </div>
            <div className="text-[var(--ac-text-secondary)] text-[length:var(--ac-fs-sm)] font-sans mt-0.5">{expiry.fullLabel} · {daysLeft}D</div>
          </div>
          <button onClick={onClose} className="text-[var(--ac-text-secondary)] hover:text-white w-7 h-7 flex items-center justify-center rounded-[1.5px] hover:bg-[var(--ac-bg-cell-empty)] text-base leading-none">×</button>
        </div>
        <div className="px-4 py-4 space-y-3">
          {/* ===== 价格卡片（最顶部，重点展示）===== */}
          <div className="bg-[var(--ac-bg-cell-empty)] rounded-[1.5px] border border-[var(--ac-border)] overflow-hidden">
            {/* 标题行 */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-[var(--ac-border)]/40">
              <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans tracking-widest uppercase">价格</span>
              {ethPrice > 0 && <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-muted)] font-sans">ETH {ethPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>}
            </div>
            {/* 三格并排：买入 / 卖出 / 最新成交 */}
            <div className="grid grid-cols-3 divide-x divide-gray-700/60">
              <div className="px-3 py-3">
                <div className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] mb-1">买入价 Ask</div>
                <div className="text-emerald-400 font-sans font-bold text-base leading-tight">
                  {data.askUsd !== null ? `${data.askUsd.toFixed(4)}` : '—'}
                </div>
                <div className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans mt-0.5">
                  {data.askUsd !== null && ethPrice > 0 ? `$${(data.askUsd * ethPrice).toFixed(0)}` : ''}
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] mb-1">卖出价 Bid</div>
                <div className="text-rose-400 font-sans font-bold text-base leading-tight">
                  {data.bidUsd !== null ? `${data.bidUsd.toFixed(4)}` : '—'}
                </div>
                <div className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans mt-0.5">
                  {data.bidUsd !== null && ethPrice > 0 ? `$${(data.bidUsd * ethPrice).toFixed(0)}` : ''}
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] mb-1">最新成交</div>
                <div className="text-sky-300 font-sans font-bold text-base leading-tight">
                  {data.lastPrice !== null ? `${data.lastPrice.toFixed(4)}` : '—'}
                </div>
                <div className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans mt-0.5">
                  {data.lastPrice !== null && ethPrice > 0 ? `$${(data.lastPrice * ethPrice).toFixed(0)}` : ''}
                </div>
              </div>
            </div>
            {/* 标记价单独一行 */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--ac-border)]/60 bg-[var(--ac-bg-card)]/30">
              <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)]">标记价（Mark）</span>
              <div className="text-right">
                <span className="text-white font-sans font-semibold text-sm">
                  {data.markUsd !== null ? `${data.markUsd.toFixed(4)} ETH` : '—'}
                </span>
                {data.markUsd !== null && ethPrice > 0 && (
                  <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans ml-2">≈ ${(data.markUsd * ethPrice).toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>

          {/* 年化数字 + 历史走势图 合并卡片 */}
          <div className={`rounded-[1.5px] border overflow-hidden ${annualizedBorder(data.annualized)} ${annualizedColor(data.annualized)}`}>
            {/* 顶部信息行：左侧标签 + 右侧年化数字 */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
              <div>
                <div className="text-[length:var(--ac-fs-sm)] font-sans tracking-widest text-[var(--ac-text-secondary)] uppercase">
                  {optionType === 'P' ? '权利金/行权价 年化 · 全量历史' : '年化占比 · 全量历史'}
                </div>
              </div>
              <span className="text-base font-bold leading-none">{data.annualized !== null ? `${(data.annualized * 100).toFixed(2)}%` : "—"}</span>
            </div>
            {/* 历史走势图 */}
            <div className="px-2 pb-2">
              {data.instrumentName
                ? <HistoryChart instrumentName={data.instrumentName} expireDate={expiry.expireDate} onRange={(r) => setAnnHistRange(r)} optionType={optionType} strike={strike} />
                : <div className="text-[length:var(--ac-fs-sm)] opacity-40 py-4 text-center">暂无合约</div>
              }
            </div>
          </div>
          {/* ===== Greeks + IV 合并区块 ===== */}
          <div className="rounded-[1.5px] border border-[var(--ac-border)]/50 overflow-hidden">
            <div className="bg-[var(--ac-bg-cell-empty)]/60 px-3 py-1.5 flex items-center justify-between">
              <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans tracking-widest uppercase">Greeks</span>
            </div>
            {/* 历史图展示区（点击格子后出现） */}
            {/* ── Theta 专属分析展开区 ── */}
            {activeMetric === 'theta' && (() => {
              // ── 基础数据 ──
              const intrinsicEth = ethPrice > 0 && data.markUsd !== null
                ? Math.max(0, optionType === 'C' ? (ethPrice - strike) / ethPrice : (strike - ethPrice) / ethPrice)
                : null;
              const markEth = data.markUsd;
              const timeValueEth = markEth !== null && intrinsicEth !== null
                ? Math.max(0, markEth - intrinsicEth) : null;
              const timeValueUsd = timeValueEth !== null && ethPrice > 0 ? timeValueEth * ethPrice : null;
              // ── DTE 计算 ──
              const totalDays = (() => {
                // 用合约名推算发行日（取到期前约180天作为基准，若无法推算则用180）
                // 实际用 daysLeft 与一个估算总天数
                // 简化：Deribit 季度期权通常是 90/180/270/365 天，取最近一个大于 daysLeft 的值
                const candidates = [30, 60, 90, 120, 180, 270, 365, 450, 540];
                return candidates.find(c => c >= daysLeft) ?? daysLeft;
              })();
              const consumedDays = Math.max(0, totalDays - daysLeft);
              // ── √DTE 时间价值衰减公式 ──
              // 剩余时间价值比例 ≈ √(DTE剩余/DTE总)
              const tvRatioNow = totalDays > 0 ? Math.sqrt(daysLeft / totalDays) : 0;
              // ── 关键节点预估 ──
              // 未来每隔 7 天一个节点，直到到期
              const nodes: { label: string; dte: number; tvUsd: number | null; tvRatio: number }[] = [];
              if (timeValueUsd !== null && daysLeft > 0) {
                // 当前节点
                const steps = daysLeft <= 30 ? 3 : daysLeft <= 90 ? 7 : 14;
                for (let d = daysLeft - steps; d >= 0; d -= steps) {
                  const ratio = totalDays > 0 ? Math.sqrt(d / totalDays) : 0;
                  const tv = tvRatioNow > 0 ? timeValueUsd * (ratio / tvRatioNow) : 0;
                  const targetDate = new Date();
                  targetDate.setDate(targetDate.getDate() + (daysLeft - d));
                  const label = d === 0 ? '到期日' : `${targetDate.getMonth()+1}/${targetDate.getDate()}`;
                  nodes.push({ label, dte: d, tvUsd: tv, tvRatio: ratio });
                  if (nodes.length >= 8) break;
                }
              }
              // ── θ/ν 比值 ──
              const thetaVegaRatio = data.theta !== null && data.vega !== null && data.vega !== 0
                ? Math.abs(data.theta / 365) / Math.abs(data.vega) : null;
              const thetaVegaLabel = thetaVegaRatio !== null
                ? thetaVegaRatio > 0.1 ? '时间消耗快，不利买方'
                : thetaVegaRatio > 0.05 ? '中等性价比'
                : '波动率收益优先，适合买方'
                : null;

              return (
                <div className="bg-[var(--ac-bg-card)]/60 px-3 pt-3 pb-3 border-b border-[var(--ac-border)]/40 space-y-3">
                  {/* 标题行 */}
                  <div className="flex items-center justify-between">
                    <span className="text-[length:var(--ac-fs-sm)] font-semibold" style={{ color: '#fb7185' }}>θ Theta · 时间价值消耗分析</span>
                    {daysLeft < 30 && (
                      <span className="text-[length:var(--ac-fs-xs)] font-sans font-semibold px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-500/40">⚡ 加速消耗阶段</span>
                    )}
                  </div>

                  {/* 当前状态：3格并排 */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-1.5">
                      <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">剩余天数</div>
                      <div className="text-white font-sans font-bold text-sm">{daysLeft}D</div>
                    </div>
                    <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-1.5">
                      <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">已消耗天数</div>
                      <div className="text-[var(--ac-text-primary)] font-sans font-bold text-sm">{consumedDays}D</div>
                    </div>
                    <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-1.5">
                      <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">当前时间价值</div>
                      <div className="font-sans font-bold text-sm" style={{ color: '#fb7185' }}>
                        {timeValueUsd !== null ? `$${timeValueUsd.toFixed(0)}` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* 消耗进度条 */}
                  {timeValueUsd !== null && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">时间价值剩余比例（√DTE 非线性）</span>
                        <span className="text-[length:var(--ac-fs-xs)] font-sans font-semibold" style={{ color: '#fb7185' }}>{(tvRatioNow * 100).toFixed(1)}%</span>
                      </div>
                      {/* 进度条容器 */}
                      <div className="relative h-5 rounded overflow-hidden bg-[var(--ac-bg-cell-empty)]">
                        {/* 已消耗（灰色） */}
                        <div
                          className="absolute left-0 top-0 h-full bg-[#374151]"
                          style={{ width: `${(1 - tvRatioNow) * 100}%` }}
                        />
                        {/* 剩余（玫瑰渐变） */}
                        <div
                          className="absolute top-0 h-full"
                          style={{
                            left: `${(1 - tvRatioNow) * 100}%`,
                            width: `${tvRatioNow * 100}%`,
                            background: daysLeft < 30
                              ? 'linear-gradient(90deg, #f43f5e, #fb923c)'
                              : daysLeft < 60
                              ? 'linear-gradient(90deg, #fb7185, #fda4af)'
                              : 'linear-gradient(90deg, #fb7185aa, #fda4af)'
                          }}
                        />
                        {/* 当前位置标记 */}
                        <div
                          className="absolute top-0 h-full w-0.5 bg-white/60"
                          style={{ left: `${(1 - tvRatioNow) * 100}%` }}
                        />
                        {/* 标注 */}
                        <div className="absolute inset-0 flex items-center justify-between px-1.5">
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans">已消耗</span>
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">剩余</span>
                        </div>
                      </div>
                      {/* 加速说明 */}
                      <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans mt-1">
                        基于 √(剩余DTE/总DTE) 公式 · 前段消耗慢，临近到期加速
                      </div>
                    </div>
                  )}

                  {/* 关键节点预估表 */}
                  {nodes.length > 0 && timeValueUsd !== null && (
                    <div>
                      <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans mb-1.5 tracking-widest uppercase">未来关键节点预估</div>
                      <div className="rounded overflow-hidden border border-[var(--ac-border)]/40">
                        {/* 表头 */}
                        <div className="grid grid-cols-4 bg-[var(--ac-bg-cell-empty)] px-2 py-1">
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans">日期</span>
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans text-center">剩余DTE</span>
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans text-center">剩余比例</span>
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans text-right">预估时间价值</span>
                        </div>
                        {/* 当前行 */}
                        <div className="grid grid-cols-4 px-2 py-1.5 border-t border-[var(--ac-border)]/30 bg-rose-900/20">
                          <span className="text-[length:var(--ac-fs-xs)] font-sans font-semibold" style={{ color: '#fb7185' }}>现在</span>
                          <span className="text-[length:var(--ac-fs-xs)] font-sans text-center text-white">{daysLeft}D</span>
                          <span className="text-[length:var(--ac-fs-xs)] font-sans text-center" style={{ color: '#fb7185' }}>{(tvRatioNow * 100).toFixed(1)}%</span>
                          <span className="text-[length:var(--ac-fs-xs)] font-sans text-right font-semibold" style={{ color: '#fb7185' }}>${timeValueUsd.toFixed(0)}</span>
                        </div>
                        {/* 未来节点 */}
                        {nodes.map((n, i) => {
                          const isExpiry = n.dte === 0;
                          const isAccel = n.dte > 0 && n.dte <= 30;
                          return (
                            <div key={i} className={`grid grid-cols-4 px-2 py-1.5 border-t border-[var(--ac-border)]/20 ${
                              isExpiry ? 'bg-gray-800/60' : isAccel ? 'bg-orange-900/10' : ''
                            }`}>
                              <span className={`text-[length:var(--ac-fs-xs)] font-sans ${
                                isExpiry ? 'text-[var(--ac-text-secondary)]' : isAccel ? 'text-orange-300' : 'text-[var(--ac-text-secondary)]'
                              }`}>{n.label}</span>
                              <span className="text-[length:var(--ac-fs-xs)] font-sans text-center text-[var(--ac-text-secondary)]">{n.dte}D</span>
                              <span className={`text-[length:var(--ac-fs-xs)] font-sans text-center ${
                                isExpiry ? 'text-[var(--ac-text-muted)]' : isAccel ? 'text-orange-300' : 'text-[var(--ac-text-secondary)]'
                              }`}>{(n.tvRatio * 100).toFixed(1)}%</span>
                              <span className={`text-[length:var(--ac-fs-xs)] font-sans text-right ${
                                isExpiry ? 'text-[var(--ac-text-muted)]' : isAccel ? 'text-orange-300 font-semibold' : 'text-[var(--ac-text-primary)]'
                              }`}>{isExpiry ? '$0' : n.tvUsd !== null ? `$${n.tvUsd.toFixed(0)}` : '—'}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans mt-1">橙色行 = DTE≤30 加速消耗阶段 · 预估值基于当前时间价值等比推算</div>
                    </div>
                  )}

                  {/* θ/ν 比值 */}
                  {thetaVegaRatio !== null && (
                    <div className="flex items-center gap-2 pt-1 border-t border-[var(--ac-border)]/20">
                      <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">θ/ν 比值</span>
                      <span className="text-[length:var(--ac-fs-sm)] font-sans font-semibold" style={{ color: thetaVegaRatio > 0.1 ? '#f87171' : thetaVegaRatio > 0.05 ? '#fbbf24' : '#34d399' }}>
                        {thetaVegaRatio.toFixed(4)}
                      </span>
                      {thetaVegaLabel && <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans">· {thetaVegaLabel}</span>}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 其他 Greeks 历史走势图展开区 ── */}
            {activeMetric && activeMetric !== 'theta' && data.instrumentName && (() => {
              const metaMap: Record<GreekKey, { label: string; color: string; refLine?: number }> = {
                iv:    { label: 'IV 隐含波动率', color: '#22d3ee' },
                delta: { label: 'δ Delta',       color: '#60a5fa', refLine: 0.5 },
                gamma: { label: 'γ Gamma',       color: '#a78bfa' },
                theta: { label: 'θ Theta',       color: '#fb7185' },
                vega:  { label: 'ν Vega',        color: '#34d399' },
                rho:   { label: 'ρ Rho',         color: '#fbbf24' },
              };
              const meta = metaMap[activeMetric];

              // —— Theta：剩余时间价值（此分支不含 theta，但保留变量供其他分支使用）——
              const intrinsicEth = ethPrice > 0 && data.markUsd !== null
                ? Math.max(0, optionType === 'C' ? (ethPrice - strike) / ethPrice : (strike - ethPrice) / ethPrice)
                : null;
              const markEth = data.markUsd;
              const timeValueEth = markEth !== null && intrinsicEth !== null
                ? Math.max(0, markEth - intrinsicEth) : null;
              const timeValueUsd = timeValueEth !== null && ethPrice > 0 ? timeValueEth * ethPrice : null;

              // —— Delta：等效持仓 ——
              // 等效持仓(ETH) = Delta，折合 U = Delta × ETH现价
              const deltaEquivUsd = data.delta !== null && ethPrice > 0
                ? data.delta * ethPrice : null;
              // ETH 涨 1% 时期权价变动 = Delta × ETH现价 × 1%
              const deltaMove1pct = data.delta !== null && ethPrice > 0
                ? data.delta * ethPrice * 0.01 : null;

              // —— Gamma： ETH 涨 1% 时 Delta 变化量 ——
              // Gamma 单位：每 $1 ETH 变动对应的 Delta 变化
              // ETH 涨 1% = ETH现价 × 1%，对应 Delta 变化 = Gamma × (ETH现价 × 0.01)
              const gammaDelta1pct = data.gamma !== null && ethPrice > 0
                ? data.gamma * ethPrice * 0.01 : null;
              // Delta 变化对应期权价变化 = gammaDelta1pct × ETH现价
              const gammaOptionMove1pct = gammaDelta1pct !== null && ethPrice > 0
                ? gammaDelta1pct * ethPrice : null;

              // —— Vega：IV 涨 1% 期权涨多少 U ——
              // Deribit Vega 已是 IV 变动 1% 的敏感度（ETH单位）
              const vegaMove1pctUsd = data.vega !== null && ethPrice > 0
                ? data.vega * ethPrice : null;
              // IV 涨 5% 的影响
              const vegaMove5pctUsd = vegaMove1pctUsd !== null ? vegaMove1pctUsd * 5 : null;

              // —— Rho：利率涨 1% 期权涨多少 U ——
              // Deribit Rho 单位：利率变动 1%（即 100bp）对应的期权价格变化（ETH单位）
              const rhoMove1pctUsd = data.rho !== null && ethPrice > 0
                ? data.rho * ethPrice : null;
              // 利率变动对 CALL/PUT 的方向说明
              const rhoDirection = optionType === 'C' ? '利率涨对 CALL 利好' : '利率涨对 PUT 利空';

              // —— θ/ν 比值：时间损耗 vs 波动率收益性价比 ——
              // 公式：|日化Theta| / Vega（两者都是 ETH 单位）
              // 比值越高 → 时间在快速消耗而波动率收益跟不上，不利买方
              // 比值越低 → 等待行情爆发的性价比越高
              const thetaVegaRatio = data.theta !== null && data.vega !== null && data.vega !== 0
                ? Math.abs(data.theta / 365) / Math.abs(data.vega) : null;
              // 语义标注：比值高于 0.1 认为偏高，低于 0.02 认为偏低
              const thetaVegaLabel = thetaVegaRatio !== null
                ? thetaVegaRatio > 0.1 ? '时间消耗快，不利买方'
                : thetaVegaRatio > 0.05 ? '中等性价比'
                : '波动率收益优先，适合买方'
                : null;

              return (
                <div className="bg-[var(--ac-bg-card)]/60 px-3 pt-2 pb-1 border-b border-[var(--ac-border)]/40">
                  <div className="flex items-start justify-between mb-1 gap-2">
                    <div className="text-left">
                      <div className="text-[length:var(--ac-fs-sm)] font-semibold" style={{ color: meta.color }}>{meta.label} · 全量历史</div>
                      {historyRange && (
                        <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans mt-0.5">
                          {historyRange.startDate} — {historyRange.endDate} · 共 {historyRange.days} 天
                        </div>
                      )}
                    </div>
                    {/* —— IV：IVR 分位 + 均值偏离度 —— */}
                    {activeMetric === 'iv' && data.iv !== null && (
                      <div className="text-right">
                        <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans leading-tight space-y-0.5">
                          <div>当前 IV
                            <span className="font-semibold text-cyan-400"> {(data.iv * 100).toFixed(1)}%</span>
                          </div>
                          {ivMean !== null && (
                            <div>历史均值 {ivMean.toFixed(1)}%
                              <span className={`ml-1 font-semibold ${
                                data.iv * 100 > ivMean ? 'text-orange-400' : 'text-green-400'
                              }`}>
                                {data.iv * 100 > ivMean ? '+' : ''}{(data.iv * 100 - ivMean).toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)]">IVR 分位</span>
                          {ivRank !== null ? (
                            <span className="text-[length:var(--ac-fs-sm)] font-sans font-semibold" style={{
                              color: ivRank >= 70 ? '#f87171' : ivRank >= 30 ? '#fbbf24' : '#34d399'
                            }}>
                              {ivRank}%
                            </span>
                          ) : (
                            <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)]">计算中...</span>
                          )}
                          {ivRank !== null && (
                            <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-secondary)]">
                              {ivRank >= 70 ? '高位区' : ivRank >= 30 ? '中位区' : '低位区'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* —— Theta 分支已移至独立展开区，此处不再渲染 —— */}
                    {/* —— Delta 等效持仓 —— */}
                    {activeMetric === 'delta' && data.delta !== null && deltaEquivUsd !== null && (
                      <div className="text-right">
                        <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans leading-tight space-y-0.5">
                          <div>等效持有 {data.delta.toFixed(4)} ETH
                            <span className="text-[var(--ac-text-muted)]"> ≈ ${deltaEquivUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })} U</span>
                          </div>
                          {deltaMove1pct !== null && (
                            <div>ETH 涨 1%，期权 +{deltaMove1pct.toFixed(2)} U</div>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)]">当前 Delta</span>
                          <span className="text-[length:var(--ac-fs-sm)] font-sans font-semibold" style={{ color: '#60a5fa' }}>
                            {data.delta.toFixed(4)}
                          </span>
                          <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-secondary)]">
                            {optionType === 'P'
                              ? (data.delta <= -0.5 ? '深度虚内' : data.delta <= -0.3 ? '中性偏空' : '轻度虚外')
                              : (data.delta >= 0.5 ? '偏多' : data.delta >= 0.3 ? '中性' : '偏空')}
                          </span>
                        </div>
                      </div>
                    )}
                    {/* —— Gamma ETH 涨 1% 时 Delta 变化 —— */}
                    {activeMetric === 'gamma' && data.gamma !== null && gammaDelta1pct !== null && (
                      <div className="text-right">
                        <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans leading-tight space-y-0.5">
                          <div>ETH 涨 1%，Delta +{gammaDelta1pct.toFixed(4)}</div>
                          {gammaOptionMove1pct !== null && (
                            <div>期权额外涨 ≈ +${gammaOptionMove1pct.toFixed(2)} U</div>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)]">当前 Gamma</span>
                          <span className="text-[length:var(--ac-fs-sm)] font-sans font-semibold" style={{ color: '#a78bfa' }}>
                            {data.gamma.toFixed(6)}
                          </span>
                        </div>
                      </div>
                    )}
                    {/* —— Vega：IV 涨 1% 期权涨多少 U —— */}
                    {activeMetric === 'vega' && data.vega !== null && vegaMove1pctUsd !== null && (
                      <div className="text-right">
                        <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans leading-tight space-y-0.5">
                          <div>IV 涨 1%，期权 +{vegaMove1pctUsd.toFixed(2)} U</div>
                          {vegaMove5pctUsd !== null && (
                            <div>IV 涨 5%，期权 +{vegaMove5pctUsd.toFixed(2)} U</div>
                          )}
                        </div>
                        {/* θ/ν 比值 */}
                        {thetaVegaRatio !== null && (
                          <div className="text-[length:var(--ac-fs-xs)] font-sans mt-0.5 space-y-0.5">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-[var(--ac-text-secondary)]">θ/ν =</span>
                              <span className="font-semibold" style={{ color: thetaVegaRatio > 0.1 ? '#f87171' : thetaVegaRatio > 0.05 ? '#fbbf24' : '#34d399' }}>
                                {thetaVegaRatio.toFixed(4)}
                              </span>
                            </div>
                            {thetaVegaLabel && <div className="text-[var(--ac-text-muted)] text-right">{thetaVegaLabel}</div>}
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)]">当前 Vega</span>
                          <span className="text-[length:var(--ac-fs-sm)] font-sans font-semibold" style={{ color: '#34d399' }}>
                            {data.vega.toFixed(6)}
                          </span>
                        </div>
                      </div>
                    )}
                    {/* —— Rho：利率涨 1% 期权涨多少 U —— */}
                    {activeMetric === 'rho' && data.rho !== null && rhoMove1pctUsd !== null && (
                      <div className="text-right">
                        <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans leading-tight space-y-0.5">
                          <div>利率涨 1%，期权 {rhoMove1pctUsd >= 0 ? '+' : ''}{rhoMove1pctUsd.toFixed(2)} U</div>
                          <div className="text-[var(--ac-text-muted)]">{rhoDirection}</div>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)]">当前 Rho</span>
                          <span className="text-[length:var(--ac-fs-sm)] font-sans font-semibold" style={{ color: '#fbbf24' }}>
                            {data.rho !== null ? data.rho.toFixed(5) : '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <GreeksHistoryChart
                  instrumentName={data.instrumentName}
                  strike={strike}
                  expireDate={expiry.expireDate}
                  metric={activeMetric}
                  color={meta.color}
                  refLine={meta.refLine}
                  onIVR={(ivr, mean) => { setIvRank(ivr); if (mean !== undefined) setIvMean(mean); }}
                  onRange={(r) => setHistoryRange(r)}
                  optionType={optionType}
                    
                  />
                </div>
              );
            })()}
            {/* Greeks 网格：IV 排第一，其余顺延，3×4=12格 */}
            <div className="bg-[var(--ac-bg-cell-empty)]/80 px-3 py-2 grid grid-cols-3 gap-x-2 gap-y-2">
              {/* 1. IV */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'iv' ? 'bg-cyan-900/40 ring-1 ring-cyan-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('iv')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">σ IV{ivRank !== null ? ` · IVR ${ivRank}%` : ''}</div>
                <div className="text-cyan-400 font-sans font-medium text-xs">{data.iv !== null ? `${(data.iv * 100).toFixed(1)}%` : '—'}</div>
              </button>
              {/* 2. Delta */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'delta' ? 'bg-blue-900/40 ring-1 ring-blue-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('delta')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">δ Delta</div>
                <div className="text-blue-400 font-sans font-medium text-xs">{fmt(data.delta, 4)}</div>
              </button>
              {/* 3. Gamma */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'gamma' ? 'bg-violet-900/40 ring-1 ring-violet-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('gamma')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">γ Gamma</div>
                <div className="text-violet-400 font-sans font-medium text-xs">{data.gamma !== null ? data.gamma.toFixed(6) : '—'}</div>
              </button>
              {/* 4. Theta */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'theta' ? 'bg-rose-900/40 ring-1 ring-rose-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('theta')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">θ Theta</div>
                <div className="text-rose-400 font-sans font-medium text-xs">{thetaDaily !== null ? thetaDaily.toFixed(6) : '—'}</div>
              </button>
              {/* 5. Vega */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'vega' ? 'bg-emerald-900/40 ring-1 ring-emerald-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('vega')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">ν Vega</div>
                <div className="text-emerald-400 font-sans font-medium text-xs">{data.vega !== null ? data.vega.toFixed(6) : '—'}</div>
              </button>
              {/* 6. Rho */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'rho' ? 'bg-amber-900/40 ring-1 ring-amber-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('rho')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">ρ Rho</div>
                <div className="text-amber-400 font-sans font-medium text-xs">{data.rho !== null ? data.rho.toFixed(5) : '—'}</div>
              </button>
              {/* 7. OI */}
              <div className="px-1.5 py-1"><div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">持仓量 OI</div><div className="text-[var(--ac-text-primary)] font-sans text-xs">{data.openInterest !== null ? data.openInterest.toLocaleString() : '—'}</div></div>
              {/* 8. Lambda */}
              {lambda !== null && <div className="px-1.5 py-1"><div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">λ Lambda</div><div className="text-yellow-300 font-sans font-semibold text-xs">{lambda.toFixed(1)}x</div></div>}
              {/* 9. Break-even */}
              {breakEven !== null && <div className="px-1.5 py-1"><div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">Break-even</div><div className="text-white font-sans font-semibold text-xs">${breakEven.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>}
              {/* 10. θ/日 U */}
              {thetaUsd !== null && <div className="px-1.5 py-1"><div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">θ/日 U</div><div className="text-rose-300 font-sans font-medium text-xs">{thetaUsd >= 0 ? '+' : ''}{thetaUsd.toFixed(2)}</div></div>}
              {/* 11. ν/1%IV U */}
              {vegaUsd !== null && <div className="px-1.5 py-1"><div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">ν/1%IV U</div><div className="text-emerald-300 font-sans font-medium text-xs">{vegaUsd >= 0 ? '+' : ''}{vegaUsd.toFixed(2)}</div></div>}
              {/* 12. 权利金占比 */}
              {premiumRatio !== null && <div className="px-1.5 py-1"><div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">权利金占行权价</div><div className="text-[var(--ac-text-primary)] font-sans font-medium text-xs">{premiumRatio.toFixed(3)}%</div></div>}
            </div>
          </div>

          {/* ===== Payoff 图（卖方视角）===== */}
          {markUsdDollar !== null && (
            <div className="bg-[var(--ac-bg-cell-empty)] rounded-[1.5px] border border-[var(--ac-border)] overflow-hidden">
              <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-[var(--ac-border)]/40">
                <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans tracking-widest uppercase">Payoff 图（卖方到期损益）</span>
                <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans">收入 = 权利金 | 上方 = 盈利</span>
              </div>
              <PayoffChart
                strike={strike}
                premium={markUsdDollar}
                ethPrice={ethPrice}
                optionType={optionType}
              />
            </div>
          )}

          <div className="rounded-[1.5px] p-3 border border-[var(--ac-border-subtle)]/60">
            <div className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans tracking-widest uppercase mb-1.5">合约信息</div>
            <div className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans">{data.instrumentName || "—"}</div>
            <div className="flex justify-between text-[length:var(--ac-fs-sm)] text-[var(--ac-text-muted)] font-sans mt-2">
              <span>SETTLE</span><span>ETH-MARGINED</span>
            </div>
            <div className="flex justify-between text-[length:var(--ac-fs-sm)] text-[var(--ac-text-muted)] font-sans mt-1">
              <span>TTM</span><span>{yearsLeft.toFixed(3)} YR</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 单个到期日的 WebSocket Hook ───────────────────────────────
function useExpiryWs(
  expiryCode: string,
  ethPriceRef: React.MutableRefObject<number>,
  onEthPrice: ((p: number) => void) | null,
  onCellUpdate: (strike: number, expiryCode: string, name: string, data: Record<string, unknown>, ep: number) => void,
  onInstrumentsLoaded: (expiryCode: string, strikes: number[], instrumentNames: string[]) => void,
  optionType: 'C' | 'P'
) {
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(2000);
  const [status, setStatus] = useState<WsStatus>("connecting");

  const connect = useCallback(() => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    setStatus("connecting");

    const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      delayRef.current = 2000;

      if (onEthPrice) {
        ws.send(JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "public/subscribe",
          params: { channels: ["deribit_price_index.eth_usd"] }
        }));
      }

      ws.send(JSON.stringify({
        jsonrpc: "2.0", id: 100,
        method: "public/get_instruments",
        params: { currency: "ETH", kind: "option", expired: false }
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      // ETH现价
      if (msg.method === "subscription" && msg.params?.channel?.includes("deribit_price_index")) {
        const price = msg.params.data?.price;
        if (price && onEthPrice) { onEthPrice(price); ethPriceRef.current = price; }
        return;
      }

      // 合约列表 → 只处理本到期日
      if (msg.id === 100 && msg.result) {
        const filterType = optionType === 'C' ? 'call' : 'put';
        const calls = (msg.result as Array<{ instrument_name?: string; option_type?: string; strike?: number }>)
          .filter(i =>
            i.instrument_name?.includes(expiryCode) &&
            i.option_type === filterType &&
            i.strike !== undefined &&
            i.strike <= MAX_STRIKE
          );

        const targets = calls.map(c => c.instrument_name!);
        const strikes = calls.map(c => c.strike!);
        onInstrumentsLoaded(expiryCode, strikes, targets);

        // 快照请求（id 2000+）
        targets.forEach((name, idx) => {
          ws.send(JSON.stringify({
            jsonrpc: "2.0", id: 2000 + idx,
            method: "public/get_order_book",
            params: { instrument_name: name, depth: 1 }
          }));
        });

        // 订阅实时推送（分批20个）
        for (let i = 0; i < targets.length; i += 20) {
          ws.send(JSON.stringify({
            jsonrpc: "2.0", id: 1000 + Math.floor(i / 20),
            method: "public/subscribe",
            params: { channels: targets.slice(i, i + 20).map(n => `ticker.${n}.100ms`) }
          }));
        }
        return;
      }

      // 快照响应
      if (typeof msg.id === "number" && msg.id >= 2000 && msg.result) {
        const r = msg.result;
        const name: string = r.instrument_name;
        if (!name) return;
        const parts = name.split("-");
        if (parts.length < 4 || parts[1] !== expiryCode) return;
        const strike = parseInt(parts[2]);
        onCellUpdate(strike, expiryCode, name, r, ethPriceRef.current);
        return;
      }

      // ticker 实时推送
      if (msg.method === "subscription" && msg.params?.channel?.startsWith("ticker.")) {
        const d = msg.params.data;
        const name: string = d.instrument_name;
        if (!name) return;
        const parts = name.split("-");
        if (parts.length < 4 || parts[1] !== expiryCode) return;
        const strike = parseInt(parts[2]);
        onCellUpdate(strike, expiryCode, name, d, ethPriceRef.current);
        return;
      }
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => {
      setStatus("reconnecting");
      timerRef.current = setTimeout(() => {
        delayRef.current = Math.min(delayRef.current * 1.5, 30000);
        connect();
      }, delayRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiryCode, optionType]);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [connect]);

  return status;
}

// ─── localStorage 缓存工具 ────────────────────────────────────
const LS_KEY = 'eth-ann-matrix-cache-v2';
const LS_KEY_IVR = 'eth-ann-ivr-cache-v1';

interface IvrEntry { ivr: number; savedAt: number; }
function loadIvrCache(): Map<string, IvrEntry> {
  try {
    const raw = localStorage.getItem(LS_KEY_IVR);
    if (!raw) return new Map();
    const obj: Record<string, IvrEntry> = JSON.parse(raw);
    const now = Date.now();
    const map = new Map<string, IvrEntry>();
    for (const [k, v] of Object.entries(obj)) {
      // 24小时内有效
      if (now - v.savedAt < 24 * 60 * 60 * 1000) map.set(k, v);
    }
    return map;
  } catch { return new Map(); }
}
function saveIvrEntry(name: string, ivr: number) {
  try {
    const raw = localStorage.getItem(LS_KEY_IVR);
    const obj: Record<string, IvrEntry> = raw ? JSON.parse(raw) : {};
    obj[name] = { ivr, savedAt: Date.now() };
    localStorage.setItem(LS_KEY_IVR, JSON.stringify(obj));
  } catch { /* ignore */ }
}
interface CacheSnapshot {
  matrix: [string, CellData][];
  existMap: [string, number[]][];
  allStrikes: number[];
  lastUpdate: string;
  optionType: 'C' | 'P';
  savedAt: number;
}
function loadCache(optType: 'C' | 'P'): CacheSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const snap: CacheSnapshot = JSON.parse(raw);
    if (snap.optionType !== optType) return null;
    // 超过2小时的缓存不用
    if (Date.now() - snap.savedAt > 2 * 60 * 60 * 1000) return null;
    return snap;
  } catch { return null; }
}
function saveCache(snap: CacheSnapshot) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch { /* ignore */ }
}

// ─── 主组件 ────────────────────────────────────────────────────
export default function AnnualizedChain() {
  const [ethPrice, setEthPrice] = useState(0); // 币本位年化不需要，但弹窗折算USD需要
  const [optionType, setOptionType] = useState<'C' | 'P'>('C');
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  // 年化区间筛选：null = 全部显示
  const [annFilter, setAnnFilter] = useState<[number, number] | null>(null);
  const colorMode = 'mono'; // 热力图功能已移除
  const isDark = true; // 固定夜间模式
  // 触摸预览气泡：手指按下时显示，括开手指或点击后关闭
  const [touchPreview, setTouchPreview] = useState<{
    strike: number;
    expiry: ExpiryConfig;
    cell: CellData;
    ethPrice: number;
    x: number;
    y: number;
  } | null>(null);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 气泡入场动画 key：每次气泡从无到有时递增，触发 bubble-enter
  const [bubbleKey, setBubbleKey] = useState(0);
  // 内容切换 key：每次命中新格子时递增，触发 bubble-content-fade
  const [contentKey, setContentKey] = useState(0);
  // 气泡淡出状态：true 时播放 bubble-exit 动画，动画结束后真正隐藏
  const [bubbleExiting, setBubbleExiting] = useState(false);
  const bubbleExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化时从 localStorage 读取缓存
  const initCache = loadCache('C');
  const [matrix, setMatrix] = useState<MatrixData>(
    initCache ? new Map(initCache.matrix) : new Map()
  );
  const [existMap, setExistMap] = useState<ExistMap>(
    initCache ? new Map(initCache.existMap.map(([k, v]) => [k, new Set(v)] as [string, Set<number>])) : new Map()
  );
  const [lastUpdate, setLastUpdate] = useState(initCache?.lastUpdate ?? '—');
  const [detail, setDetail] = useState<DetailCell | null>(null);
  const [thetaPopup, setThetaPopup] = useState<ThetaPopupCell | null>(null);
  const [allStrikes, setAllStrikes] = useState<number[]>(initCache?.allStrikes ?? []);
  // 记录哪些到期日已经完成合约列表加载
  const [loadedExpiries, setLoadedExpiries] = useState<Set<string>>(new Set());
  const [ivrReady, setIvrReady] = useState(false); // IVR加载完成标记（保留供后续使用）
  // 三视图切换：matrix=全量矩阵, byStrike=按价位卡片, byExpiry=按到期日卡片
  const [viewMode, setViewMode] = useState<'matrix' | 'byStrike' | 'byExpiry'>('matrix');
  // 按价位：多选行权价（Set）
  const [selectedStrikes, setSelectedStrikes] = useState<Set<number>>(new Set());
  const toggleStrike = (s: number) => setSelectedStrikes(prev => {
    const next = new Set(prev);
    if (next.has(s)) { if (next.size > 1) next.delete(s); }
    else next.add(s);
    return next;
  });
  // 全量到期日列表（从 Deribit 动态拉取，远期在前）
  const [allExpiries, setAllExpiries] = useState<ExpiryConfig[]>(DEFAULT_EXPIRIES);
  // 矩阵视图已选中的到期日（默认最近4个）
  const [selectedMatrixExpiries, setSelectedMatrixExpiries] = useState<Set<string>>(
    new Set(DEFAULT_EXPIRIES.slice(-4).map(e => e.code))
  );
  const toggleMatrixExpiry = (code: string) => setSelectedMatrixExpiries(prev => {
    const next = new Set(prev);
    if (next.has(code)) { if (next.size > 1) next.delete(code); }
    else next.add(code);
    return next;
  });
  // 按到期日：多选到期日（Set）
  const [selectedExpiries, setSelectedExpiries] = useState<Set<string>>(new Set(DEFAULT_EXPIRIES.map(e => e.code)));
  const toggleExpiry = (code: string) => setSelectedExpiries(prev => {
    const next = new Set(prev);
    if (next.has(code)) { if (next.size > 1) next.delete(code); }
    else next.add(code);
    return next;
  });
  // 维度选择器：控制各视图显示哪些字段
  const [activeDims, setActiveDims] = useState<Set<DimKey>>(new Set<DimKey>(['ann','ivr','theta','delta','iv','oi']));
  const toggleDim = (d: DimKey) => setActiveDims(prev => {
    const next = new Set(prev);
    if (next.has(d)) { if (next.size > 1) next.delete(d); } // 至少保留1个
    else next.add(d);
    return next;
  });

  const ethPriceRef = useRef(0);
  // IVR 全量历史缓存：key=instrumentName, value={ivr, points}
  // 初始化时从 localStorage 读取已有 IVR 缓存
  const ivrCacheRef = useRef<Map<string, { ivr: number; points: IVPoint[] }>>(
    (() => {
      const persisted = loadIvrCache();
      const m = new Map<string, { ivr: number; points: IVPoint[] }>();
      persisted.forEach((v, k) => m.set(k, { ivr: v.ivr, points: [] }));
      return m;
    })()
  );
  // 用于触发矩阵重渲染（IVR填入后）
  const [ivrVersion, setIvrVersion] = useState(0);

  const updateCell = useCallback((
    strike: number,
    expiryCode: string,
    instrumentName: string,
    data: Record<string, unknown>,
    _ep: number
  ) => {
    // 币本位：mark_price 本身就是 ETH 单位
    const markEth = typeof data.mark_price === "number" ? data.mark_price : null;
    const markUsd = markEth; // 保留字段名兼容详情弹窗，实际存的是 ETH 单位值
    const bidEth = typeof data.best_bid_price === "number" ? data.best_bid_price : null;
    const bidUsd = bidEth;
    const askEth = typeof data.best_ask_price === "number" ? data.best_ask_price : null;
    const askUsd = askEth;
    const iv = typeof data.mark_iv === "number" ? data.mark_iv / 100 : null;
    const bidIv = typeof data.bid_iv === "number" ? data.bid_iv / 100 : null;
    const askIv = typeof data.ask_iv === "number" ? data.ask_iv / 100 : null;
    const greeks = data.greeks as Record<string, number> | null;
    const delta = greeks?.delta ?? null;
    const gamma = greeks?.gamma ?? null;
    const theta = greeks?.theta ?? null;
    const vega = greeks?.vega ?? null;
    const rho = greeks?.rho ?? null;
    const openInterest = typeof data.open_interest === "number" ? data.open_interest : null;
    const dataAny = data as Record<string, unknown>;
    const statsAny = dataAny.stats as Record<string, unknown> | null | undefined;
    const volume = typeof statsAny?.volume === "number" ? statsAny.volume : (typeof dataAny.volume === "number" ? dataAny.volume as number : null);
    const lastPrice = typeof data.last_price === "number" ? data.last_price : null;
    const expiry = parseExpiryCode(expiryCode);
    const daysLeft = expiry ? calcDaysLeft(expiry.expireDate) : 0;
    const yearsLeft = daysLeft / 365;
    const ep = ethPriceRef.current;
    // CALL 年化 = mark_price(ETH) / yearsLeft（币本位，ETH 现价约掉）
    // PUT  年化 = mark_price(ETH) × ETH现价 / 行权价(USD) / yearsLeft（权利金占行权价年化）
    const annualized = markEth !== null && markEth > 0 && yearsLeft > 0
      ? (optionType === 'P' && ep > 0 && strike > 0
          ? (markEth * ep / strike) / yearsLeft
          : markEth / yearsLeft)
      : null;

    const key = `${strike}-${expiryCode}`;
    setMatrix(prev => {
      const next = new Map(prev);
      const existing = prev.get(key);
      next.set(key, {
        markUsd, bidUsd, askUsd,
        iv, bidIv, askIv,
        delta, gamma, theta, vega, rho,
        openInterest, volume, lastPrice,
        annualized,
        prevAnnualized: existing?.annualized ?? null,
        instrumentName,
        ivRank: ivrCacheRef.current.get(instrumentName)?.ivr ?? null
      });
      return next;
    });
    setLastUpdate(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  }, [optionType]);

  const onInstrumentsLoaded = useCallback((expiryCode: string, strikes: number[], instrumentNames: string[]) => {
    // 后台批量预计算 IVR（全量历史）
    const expiry = parseExpiryCode(expiryCode);
    if (expiry && instrumentNames.length > 0) {
      const expireDate = expiry.expireDate;
      // 先拉 ETH 永续历史（复用），再并发拉每个合约
      const fetchIVR = async () => {
        try {
          // 拉 ETH 永续全量历史
          const ethData = await new Promise<{ ticks: number[]; close: number[] }>((resolve) => {
            const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
            ws.onopen = () => ws.send(JSON.stringify({
              jsonrpc: "2.0", id: 1,
              method: "public/get_tradingview_chart_data",
              params: { instrument_name: "ETH-PERPETUAL", start_timestamp: 0, end_timestamp: Date.now(), resolution: "1D" }
            }));
            ws.onmessage = (e) => {
              try {
                const d = JSON.parse(e.data);
                if (d.id === 1) { resolve(d.result || {}); ws.close(); }
              } catch { /* ignore */ }
            };
            ws.onerror = () => resolve({ ticks: [], close: [] });
          });
          const ethMap = new Map<number, number>();
          (ethData.ticks || []).forEach((t: number, i: number) => ethMap.set(t, (ethData.close || [])[i]));

          // 并发批量拉期权历史（每批8个）
          const BATCH = 8;
          for (let i = 0; i < instrumentNames.length; i += BATCH) {
            const batch = instrumentNames.slice(i, i + BATCH);
            await Promise.all(batch.map(async (name) => {
              if (ivrCacheRef.current.has(name)) return; // 已有缓存跳过
              try {
                const optData = await new Promise<{ ticks: number[]; close: number[] }>((resolve) => {
                  const ws2 = new WebSocket("wss://www.deribit.com/ws/api/v2");
                  ws2.onopen = () => ws2.send(JSON.stringify({
                    jsonrpc: "2.0", id: 2,
                    method: "public/get_tradingview_chart_data",
                    params: { instrument_name: name, start_timestamp: 0, end_timestamp: Date.now(), resolution: "1D" }
                  }));
                  ws2.onmessage = (e2) => {
                    try {
                      const d2 = JSON.parse(e2.data);
                      if (d2.id === 2) { resolve(d2.result || {}); ws2.close(); }
                    } catch { /* ignore */ }
                  };
                  ws2.onerror = () => resolve({ ticks: [], close: [] });
                });
                const parts = name.split("-");
                const K = parseInt(parts[2]);
                const expireMs = new Date(expireDate).getTime();
                const pts: IVPoint[] = (optData.ticks || []).map((t: number, idx: number) => {
                  const S = ethMap.get(t) ?? 0;
                  const optPriceUsd = ((optData.close || [])[idx] ?? 0) * S;
                  const T = Math.max(0.001, (expireMs - t) / (365 * 24 * 3600 * 1000));
                  const iv = S > 0 ? impliedVol(optPriceUsd, S, K, T) : null;
                  const d3 = new Date(t);
                  return { date: `${d3.getMonth() + 1}/${d3.getDate()}`, mark: iv !== null ? iv * 100 : 0, bid: null, ask: null };
                }).filter((p: IVPoint) => p.mark > 0);
                if (pts.length > 1) {
                  const ivVals = pts.map(p => p.mark);
                  const curIV = ivVals[ivVals.length - 1];
                  const below = ivVals.slice(0, -1).filter(v => v < curIV).length;
                  const ivr = Math.round((below / (ivVals.length - 1)) * 100);
                  ivrCacheRef.current.set(name, { ivr, points: pts });
                  // 立刻持久化到 localStorage
                  saveIvrEntry(name, ivr);
                  // 触发矩阵重渲染
                  setIvrVersion(v => v + 1);
                }
              } catch { /* ignore */ }
            }));
          }
        } catch { /* ignore */ }
        setIvrReady(true);
      };
      fetchIVR();
    }
    // 更新该到期日的实际行权价集合
    setExistMap(prev => {
      const next = new Map(prev);
      const s = new Set<number>();
      strikes.forEach(v => s.add(v));
      next.set(expiryCode, s);
      return next;
    });
    // 合并所有行权价到纵轴
    setAllStrikes(prev => {
      const merged = new Set<number>(prev);
      strikes.forEach(v => merged.add(v));
      return Array.from(merged).sort((a, b) => a - b);
    });
    setLoadedExpiries(prev => {
      const next = new Set(prev);
      next.add(expiryCode);
      return next;
    });
  }, []);

  // 切换期权类型时，清空矩阵和存在映射
  useEffect(() => {
    setMatrix(new Map());
    setExistMap(new Map());
    setAllStrikes([]);
    setLoadedExpiries(new Set());
    setDetail(null);
  }, [optionType]);

  // 矩阵数据变化后 3 秒内写入 localStorage（防抖缩短到3秒，避免刚加载完关页面丢数据）
  useEffect(() => {
    if (matrix.size === 0) return;
    const timer = setTimeout(() => {
      saveCache({
        matrix: Array.from(matrix.entries()),
        existMap: Array.from(existMap.entries()).map(([k, v]) => [k, Array.from(v)]),
        allStrikes,
        lastUpdate,
        optionType,
        savedAt: Date.now(),
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [matrix, existMap, allStrikes, lastUpdate, optionType]);

  // 矩阵视图当前激活的到期日列表（按 allExpiries 顺序过滤）
  const activeMatrixExpiries = allExpiries.filter(e => selectedMatrixExpiries.has(e.code));

  // 从 Deribit 拉取全量 ETH 期权到期日（只拉一次）
  const allExpiriesFetchedRef = useRef(false);
  useEffect(() => {
    if (allExpiriesFetchedRef.current) return;
    allExpiriesFetchedRef.current = true;
    const ws = new WebSocket('wss://www.deribit.com/ws/api/v2');
    ws.onopen = () => ws.send(JSON.stringify({
      jsonrpc: '2.0', id: 999,
      method: 'public/get_instruments',
      params: { currency: 'ETH', kind: 'option', expired: false }
    }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id === 999 && msg.result) {
          // 提取所有不重复的到期日 code
          const codeSet = new Set<string>();
          (msg.result as Array<{ instrument_name?: string }>).forEach(i => {
            const parts = i.instrument_name?.split('-');
            if (parts && parts.length >= 3) codeSet.add(parts[1]);
          });
          // 解析并排序（远期在前）
          const parsed: ExpiryConfig[] = [];
          codeSet.forEach(code => {
            const cfg = parseExpiryCode(code);
            if (cfg) parsed.push(cfg);
          });
          parsed.sort((a, b) => new Date(b.expireDate).getTime() - new Date(a.expireDate).getTime());
          if (parsed.length > 0) {
            setAllExpiries(parsed);
            // 默认选中固定的4个季度合约（若存在），否则取最近4个
            const defaultCodes = ['25SEP26', '25DEC26', '26MAR27', '25JUN27'];
            const parsedCodes = new Set(parsed.map(e => e.code));
            const matched = defaultCodes.filter(c => parsedCodes.has(c));
            const nearest4 = matched.length > 0 ? matched : parsed.slice(-4).map(e => e.code);
            setSelectedMatrixExpiries(new Set(nearest4));
            setSelectedExpiries(new Set(parsed.map(e => e.code)));
          }
          ws.close();
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => ws.close();
    return () => { ws.onclose = null; ws.close(); };
  }, []);

  // 第一个连接顺带订阅 ETH 现价，其余不订阅
  const onEthPrice = useCallback((p: number) => {
    ethPriceRef.current = p;
    setEthPrice(p);
  }, []);

  // 4个独立 WebSocket，每个到期日一个
  const statusA = useExpiryWs("25SEP26", ethPriceRef, onEthPrice, updateCell, onInstrumentsLoaded, optionType);
  const statusB = useExpiryWs("25DEC26", ethPriceRef, null, updateCell, onInstrumentsLoaded, optionType);
  const statusC = useExpiryWs("26MAR27", ethPriceRef, null, updateCell, onInstrumentsLoaded, optionType);
  const statusD = useExpiryWs("25JUN27", ethPriceRef, null, updateCell, onInstrumentsLoaded, optionType);

  const statuses = [statusA, statusB, statusC, statusD];
  const allConnected = statuses.every(s => s === "connected");
  const anyReconnecting = statuses.some(s => s === "reconnecting");
  const statusColor = allConnected ? "text-green-400" : anyReconnecting ? "text-yellow-400" : "text-yellow-400";
  const statusText = allConnected ? "已连接" : anyReconnecting ? "重连中" : "已断开";

  let sweetCount = 0;
  matrix.forEach(cell => { if (cell.annualized !== null && cell.annualized <= 0.24) sweetCount++; });

  // ATM：找到距离 ETH 现价最近的那一行（唯一精确匹配）
  const atmStrike = ethPrice > 0 && allStrikes.length > 0
    ? allStrikes.reduce((closest, s) =>
        Math.abs(s - ethPrice) < Math.abs(closest - ethPrice) ? s : closest
      )
    : null;

  // 矩阵表格容器 ref，用于触摸滑动命中检测
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  // 顶部导航栏 ref，用于测量高度
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setHeaderHeight(e.contentRect.height);
    });
    ro.observe(headerRef.current);
    setHeaderHeight(headerRef.current.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);
  // 存储所有行权价和到期日的当前数据，供触摸滑动时快速查找
  const matrixDataRef = useRef<{ allStrikes: number[]; matrix: MatrixData; ethPrice: number }>({ allStrikes: [], matrix: new Map(), ethPrice: 0 });

  // ATM 行自动滚动到视口中心
  const atmRowRef = useRef<HTMLTableRowElement | null>(null);
  // 记录上一次滞动定位时的 ATM 行权价，用于检测 ATM 切换
  const lastScrolledAtmRef = useRef<number | null>(null);
  // 防抖定时器：ATM 切换后延迟滞动，避免价格微小波动时频繁触发
  const atmScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (atmStrike === null || !atmRowRef.current) return;
    // 已经对这个行权价滞动过，不重复滞动（但首次加载 lastScrolledAtmRef 为 null 时强制执行）
    if (lastScrolledAtmRef.current !== null && lastScrolledAtmRef.current === atmStrike) return;

    // 清除上一个待执行的延迟
    if (atmScrollTimerRef.current) clearTimeout(atmScrollTimerRef.current);

    // 首次加载（lastScrolledAtmRef 为 null）延迟 400ms 等待渲染完成；后续 ATM 切换延迟 1.5s（防抖）
    const delay = lastScrolledAtmRef.current === null ? 400 : 1500;
    atmScrollTimerRef.current = setTimeout(() => {
      if (!atmRowRef.current) return;
      lastScrolledAtmRef.current = atmStrike;
      // 手动计算 ATM 行相对页面的位置，用 window.scrollTo 确保居中显示
      const rect = atmRowRef.current.getBoundingClientRect();
      const rowCenter = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      const scrollTarget = window.scrollY + rowCenter - viewportCenter;
      window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    }, delay);

    return () => {
      if (atmScrollTimerRef.current) clearTimeout(atmScrollTimerRef.current);
    };
  }, [atmStrike]);

  // 切换 CALL/PUT 时重置滞动记录，下次数据加载完成后再次自动定位
  useEffect(() => {
    lastScrolledAtmRef.current = null;
  }, [optionType]);

  // 动态骨架屏行数：根据屏幕可用高度计算，每行约 40px，最少 8 行
  const skeletonRows = Math.max(8, Math.floor((window.innerHeight - 120) / 40));

  // 同步最新数据到 ref，供触摸滑动时快速查找（不触发重渲染）
  matrixDataRef.current = { allStrikes, matrix, ethPrice };

  // 触摸滑动命中函数：根据触摸点坐标找到对应的行权价和到期日
  const hitCellFromTouch = useCallback((clientX: number, clientY: number) => {
    const container = tableContainerRef.current;
    if (!container) return null;
    // 找到触摸点下方的元素
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    // 向上找到最近的 button（格子）
    const btn = el.closest('button[data-strike][data-expiry]') as HTMLElement | null;
    if (!btn) return null;
    const strike = parseInt(btn.dataset.strike ?? '', 10);
    const expiryCode = btn.dataset.expiry ?? '';
    if (isNaN(strike) || !expiryCode) return null;
    const expiry = parseExpiryCode(expiryCode);
    if (!expiry) return null;
    const key = `${strike}-${expiryCode}`;
    const cell = matrixDataRef.current.matrix.get(key) ?? null;
    if (!cell) return null;
    const rect = btn.getBoundingClientRect();
    return { strike, expiry, cell, ethPrice: matrixDataRef.current.ethPrice, x: clientX, y: rect.top };
  }, []);

  // 气泡淡出关闭：先播放淡出动画，180ms 后真正隐藏
  const dismissBubble = useCallback(() => {
    if (bubbleExitTimerRef.current) clearTimeout(bubbleExitTimerRef.current);
    setBubbleExiting(true);
    bubbleExitTimerRef.current = setTimeout(() => {
      setTouchPreview(null);
      setBubbleExiting(false);
    }, 180);
  }, []);

  return (
    <div className="min-h-screen text-[var(--ac-text-primary)]" data-theme={isDark ? 'dark' : 'light'} style={{ background: 'var(--ac-bg-base)' }}>

      {/* ── 顶部栏 ── fixed 定位，始终锁在视口顶部，不随页面横向滚动 */}
      <div ref={headerRef} className="fixed top-0 left-0 z-30 bg-[var(--ac-bg-base)]/95 backdrop-blur border-b border-[var(--ac-border-subtle)]" style={{ width: '100vw' }}>
        {/* 第一行：品牌 + ETH价格 + 状态 */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
          {/* 左：品种 + CALL/PUT 切换 */}
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--ac-fs-md)] font-sans font-semibold text-[var(--ac-text-primary)] tracking-widest">ETH</span>
            <span className="text-[var(--ac-text-muted)]">/</span>
            <div className="relative">
              <button
                className="flex items-center gap-0.5 text-[length:var(--ac-fs-md)] font-sans font-semibold text-amber-400 tracking-widest hover:text-amber-300 transition-colors"
                onClick={() => setShowTypeMenu(v => !v)}
              >
                {optionType === 'C' ? 'CALL' : 'PUT'} ▾
              </button>
              {showTypeMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowTypeMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-[var(--ac-bg-card)] border border-[var(--ac-border)] rounded-[1.5px] overflow-hidden shadow-xl">
                    {(['C', 'P'] as const).map(t => (
                      <button
                        key={t}
                        className={`block w-full px-4 py-2 text-left text-[length:var(--ac-fs-md)] font-sans tracking-widest transition-colors ${
                          optionType === t
                            ? 'bg-amber-400/10 text-amber-400'
                            : 'text-[var(--ac-text-secondary)] hover:bg-[var(--ac-bg-cell-empty)] hover:text-[var(--ac-text-bright)]'
                        }`}
                        onClick={() => { setOptionType(t); setShowTypeMenu(false); }}
                      >
                        {t === 'C' ? 'CALL' : 'PUT'}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <span className="text-[var(--ac-text-muted)] text-[length:var(--ac-fs-md)]">·</span>
            <span className="text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)]">DERIBIT</span>
          </div>
          {/* 右：ETH价格 + 状态指示 */}
          <div className="flex items-center gap-3">
            {ethPrice > 0 && (
              <span className="text-[length:var(--ac-fs-md)] font-sans font-semibold text-[var(--ac-text-bright)]">
                ETH {ethPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusColor === 'text-green-400' ? 'bg-green-400' : 'bg-yellow-400'}`} />
              <span className={`text-[length:var(--ac-fs-md)] font-sans ${statusColor}`}>{statusText}</span>
            </div>
          </div>
        </div>
        {/* 第二行：导航链接 + 时间戳 */}
        <div className="flex items-center justify-between px-4 pb-1 gap-2 border-b border-[var(--ac-border-subtle)]/40">
          <div className="flex items-center gap-0">
            <a href="/annualized" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-amber-400 hover:text-amber-300 transition-colors duration-150">分析</a>
            <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-md)]">|</span>
            <a href="/history" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)] hover:text-[var(--ac-text-bright)] transition-colors duration-150">历史</a>
            <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-md)]">|</span>
            <a href="/iv-smile" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)] hover:text-[var(--ac-text-bright)] transition-colors duration-150">IV Smile</a>
            <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-md)]">|</span>
            <a href="/product-design" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)] hover:text-[var(--ac-text-bright)] transition-colors duration-150">谷底增筹</a>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)]">{lastUpdate}</div>
          </div>
        </div>
        {/* 第三行：视图切换3按钮（固定） */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--ac-border-subtle)]/40">
          {(['matrix', 'byStrike', 'byExpiry'] as const).map(mode => {
            const label = mode === 'matrix' ? '全量' : mode === 'byStrike' ? '按价位' : '按到期日';
            const active = viewMode === mode;
            return (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`text-[length:var(--ac-fs-sm)] font-sans px-3 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 ${
                  active
                    ? 'bg-amber-400/20 border-amber-400/60 text-amber-300 font-semibold'
                    : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-secondary)] hover:border-[var(--ac-border)] hover:text-[var(--ac-text-primary)]'
                }`}>
                {label}
              </button>
            );
          })}
        </div>
        {/* 第四行：随视图变化的筛选栏 */}
        {viewMode === 'matrix' && (
          /* 全量模式：到期日选择器 + 维度选择 */
          <div>
            {/* 到期日选择器：横向滚动，远期在前，默认选最近4个 */}
            <div className="flex items-center gap-0 px-3 py-1.5 border-b border-[var(--ac-border-subtle)]/30 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] shrink-0 mr-2">到期</span>
              {allExpiries.map(ex => {
                const active = selectedMatrixExpiries.has(ex.code);
                return (
                  <button
                    key={ex.code}
                    onClick={() => {
                      setSelectedMatrixExpiries(prev => {
                        const next = new Set(prev);
                        if (next.has(ex.code)) {
                          if (next.size > 1) next.delete(ex.code);
                        } else {
                          if (next.size >= 4) {
                            toast.warning('最多同时选择 4 个到期日');
                            return prev;
                          }
                          next.add(ex.code);
                        }
                        return next;
                      });
                    }}
                    className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 mr-1 ${
                      active ? 'bg-cyan-400/15 border-cyan-400/50 text-cyan-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                    }`}>
                    {ex.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
            <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] shrink-0">格内显示</span>
            {(['ann', 'ivr', 'theta', 'delta', 'iv', 'oi'] as DimKey[]).map(d => {
              const active = activeDims.has(d);
              return (
                <button key={d} onClick={() => toggleDim(d)}
                  className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 ${
                    active ? 'bg-emerald-400/15 border-emerald-400/50 text-emerald-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                  }`}>
                  {DIM_LABELS[d].zh}
                </button>
              );
            })}
            </div>
          </div>
        )}
        {viewMode === 'byStrike' && (
          /* 按价位模式：价位Tag行 + 字段Tag行 */
          <div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap border-b border-[var(--ac-border-subtle)]/20">
              <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] shrink-0 w-6">价位</span>
              {allStrikes.map(s => {
                const active = selectedStrikes.has(s);
                return (
                  <button key={s} onClick={() => toggleStrike(s)}
                    className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 ${
                      active ? 'bg-blue-400/15 border-blue-400/50 text-blue-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                    }`}>
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
              <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] shrink-0 w-6">字段</span>
              {ALL_DIMS.map(d => {
                const active = activeDims.has(d);
                return (
                  <button key={d} onClick={() => toggleDim(d)}
                    className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 ${
                      active ? 'bg-amber-400/15 border-amber-400/50 text-amber-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                    }`}>
                    {DIM_LABELS[d].zh}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {viewMode === 'byExpiry' && (
          /* 按到期日模式：到期日Tag行 + 字段Tag行 */
          <div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap border-b border-[var(--ac-border-subtle)]/20">
              <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] shrink-0 w-6">到期</span>
              {allExpiries.map(ex => {
                const active = selectedExpiries.has(ex.code);
                return (
                  <button key={ex.code} onClick={() => toggleExpiry(ex.code)}
                    className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 ${
                      active ? 'bg-amber-400/15 border-amber-400/50 text-amber-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                    }`}>
                    {ex.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
              <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] shrink-0 w-6">字段</span>
              {ALL_DIMS.map(d => {
                const active = activeDims.has(d);
                return (
                  <button key={d} onClick={() => toggleDim(d)}
                    className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 ${
                      active ? 'bg-amber-400/15 border-amber-400/50 text-amber-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                    }`}>
                    {DIM_LABELS[d].zh}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── 顶部栏占位，防止 fixed 导航栏遮住内容 ── */}
      <div style={{ height: headerHeight || 120 }} />

      {/* ── 按价位列表视图 ── */}
      {viewMode === 'byStrike' && (() => {
        // 如果还没有行权价数据，显示加载中
        if (allStrikes.length === 0) return <div className="px-4 py-8 text-center text-[var(--ac-text-muted)] text-sm">数据加载中...</div>;
        // 当前已选中的行权价（如果为空则默认选第一个）
        const activeStrikes = allStrikes.filter(s => selectedStrikes.has(s));
        const strikeList = activeStrikes.length > 0 ? activeStrikes : [allStrikes[0]];
        // 定义字段行（含 dim 键）
        type ColData = { strike: number; expiry: ExpiryConfig; cell: CellData | undefined; daysLeft: number; ann: number | null | undefined; annPct: string; annColor: string; ivr: number | null; bid: number | null; ask: number | null; bidEth: number | null; askEth: number | null; spread: number | null; delta: number | null; thetaDayUsd: number | null; oi: number | null; iv: number | null; };
        // 列：每个行权价对应一列（每列内包含四个到期日的数据）
        // 表格结构：字段行 × (4到期日 × N行权价) 列
        // 实际列：每个到期日为一列，多个行权价用分组分隔
        const buildColData = (strike: number): ColData[] => allExpiries.map(expiry => {
          const key = `${strike}-${expiry.code}`;
          const cell = matrix.get(key);
          const daysLeft = calcDaysLeft(expiry.expireDate);
          const ann = cell?.annualized;
          const annPct = ann != null ? (ann * 100).toFixed(2) + '%' : '—';
          const annColor = ann == null ? 'var(--ac-text-muted)' : ann <= 0.10 ? '#4ade80' : ann <= 0.20 ? '#22c55e' : ann <= 0.30 ? '#facc15' : ann <= 0.40 ? '#fb923c' : '#f87171';
          const ivr = cell?.ivRank ?? null;
          const bid = cell?.bidUsd != null && ethPrice > 0 ? Math.round(cell.bidUsd * ethPrice) : null;
          const ask = cell?.askUsd != null && ethPrice > 0 ? Math.round(cell.askUsd * ethPrice) : null;
          const bidEth = cell?.bidUsd ?? null;
          const askEth = cell?.askUsd ?? null;
          const spread = bid != null && ask != null ? ask - bid : null;
          const delta = cell?.delta ?? null;
          const theta = cell?.theta ?? null;
          const thetaDayUsd = theta != null && ethPrice > 0 ? Math.abs(theta / 365 * ethPrice) : null;
          const oi = cell?.openInterest ?? null;
          const iv = cell?.iv ?? null;
          return { strike, expiry, cell, daysLeft, ann, annPct, annColor, ivr, bid, ask, bidEth, askEth, spread, delta, thetaDayUsd, oi, iv };
        });
        const allRows: { dim: DimKey; zh: string; en: string; render: (c: ColData) => React.ReactNode }[] = [
          { dim: 'ann',    zh: '年化',  en: 'Ann.',    render: c => <span className="text-[length:var(--ac-fs-lg)] font-bold font-sans" style={{ color: c.annColor }}>{c.annPct}</span> },
          { dim: 'ivr',    zh: 'IVR',  en: 'IV Rank', render: c => c.ivr != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: c.ivr >= 70 ? '#f97316' : c.ivr >= 30 ? '#facc15' : '#4ade80' }}>{c.ivr.toFixed(0)}%</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'iv',     zh: 'IV',   en: 'Impl.Vol', render: c => c.iv != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#38bdf8' }}>{(c.iv * 100).toFixed(1)}%</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'bid',    zh: '买价',  en: 'Bid',     render: c => c.bid != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#6ee7b7' }}>{c.bid}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'ask',    zh: '卖价',  en: 'Ask',     render: c => c.ask != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#fca5a5' }}>{c.ask}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'spread', zh: '价差',  en: 'Spread',  render: c => c.spread != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans text-[var(--ac-text-secondary)]">{c.spread}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'bidEth', zh: '买ETH', en: 'Bid.E',  render: c => c.bidEth != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#6ee7b7' }}>{c.bidEth.toFixed(3)}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'askEth', zh: '卖ETH', en: 'Ask.E',  render: c => c.askEth != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#fca5a5' }}>{c.askEth.toFixed(3)}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'delta',  zh: 'Delta', en: '方向性',  render: c => c.delta != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans text-blue-400">{c.delta.toFixed(3)}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'theta',  zh: 'Theta', en: '日损耗',  render: c => c.thetaDayUsd != null ? <button className="text-[length:var(--ac-fs-lg)] font-sans text-rose-400 cursor-pointer" onClick={e => { e.stopPropagation(); if (c.cell) setThetaPopup({ strike: c.strike, expiry: c.expiry, cell: c.cell, ethPrice }); }}><span className="underline decoration-dotted underline-offset-2">θ</span>-${c.thetaDayUsd.toFixed(2)}</button> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'oi',     zh: 'OI',   en: '未平仓',  render: c => c.oi != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans text-[var(--ac-text-secondary)]">{c.oi.toLocaleString()}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
        ];
        const rows = allRows.filter(r => activeDims.has(r.dim));
        return (
          <div>
            {/* 行权价多选 Tag */}
            <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap border-b border-[var(--ac-border-subtle)]/40">
              <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] shrink-0 mr-0.5">价位</span>
              {allStrikes.map(s => {
                const active = strikeList.includes(s);
                return (
                  <button key={s} onClick={() => toggleStrike(s)}
                    className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 ${
                      active ? 'bg-blue-400/15 border-blue-400/50 text-blue-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                    }`}>
                    {s}
                  </button>
                );
              })}
            </div>
            {/* 对比表格：(N行权价 × 4到期日) 行 × 字段列 */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
                <thead>
                  <tr className="border-y border-[var(--ac-border)]">
                    {/* 行权价列 + 到期日列 */}
                    <th className="text-left py-2 pl-3 pr-2 whitespace-nowrap bg-[var(--ac-bg-card)]/40 text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)]">
                      <div>价位</div>
                      <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)]">到期日</div>
                    </th>
                    {rows.map(row => (
                      <th key={row.dim} className="text-center py-1.5 px-2 border-l border-[var(--ac-border-subtle)]/60 bg-[var(--ac-bg-card)]/40 whitespace-nowrap">
                        <div className="text-[length:var(--ac-fs-sm)] font-semibold text-[var(--ac-text-primary)]">{row.zh}</div>
                        <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)]">{row.en}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {strikeList.map(s => (
                    allExpiries.map((ex, ei) => {
                      const colData = buildColData(s);
                      const c = colData.find(d => d.expiry.code === ex.code)!;
                      const isFirstExpiry = ei === 0;
                      const isAtm = atmStrike === s;
                      return (
                        <tr key={`${s}-${ex.code}`}
                          className={`border-b border-[var(--ac-border-subtle)]/30 cursor-pointer active:bg-[var(--ac-bg-cell-empty)] ${
                            isFirstExpiry ? 'border-t border-t-[var(--ac-border-subtle)]/60' : ''
                          }`}
                          onClick={() => c.cell && setDetail({ strike: s, expiry: ex, data: c.cell, ethPrice })}>
                          {/* 行头：价位 + 到期日 */}
                          <td className="py-1.5 pl-3 pr-2 whitespace-nowrap bg-[var(--ac-bg-card)]/20">
                            {isFirstExpiry && (
                              <div className="flex items-center gap-1">
                                <span className="text-[length:var(--ac-fs-md)] font-bold font-sans text-blue-300">{s.toLocaleString()}</span>
                                {isAtm && <span className="text-[length:var(--ac-fs-xs)] font-sans px-1 rounded-[2px] bg-amber-400/20 text-amber-400">ATM</span>}
                              </div>
                            )}
                            <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)] whitespace-nowrap">{ex.label} {c.daysLeft}D</div>
                          </td>
                          {/* 字段数据列 */}
                          {rows.map(row => (
                            <td key={row.dim} className="text-center py-1.5 px-2 border-l border-[var(--ac-border-subtle)]/60">
                              {row.render(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── 按到期日列表视图 ── */}
      {viewMode === 'byExpiry' && (() => {
        // 已选中的到期日（默认全选）
        const activeExpiries = allExpiries.filter(e => selectedExpiries.has(e.code));
        const expiryList = activeExpiries.length > 0 ? activeExpiries : allExpiries;
        // 所有到期日的行权价并集
        const allStrikeSet = new Set<number>();
        expiryList.forEach(ex => {
          const s = existMap.get(ex.code);
          if (s) s.forEach(v => allStrikeSet.add(v));
          else allStrikes.forEach(v => allStrikeSet.add(v));
        });
        const strikes = allStrikes.filter(s => allStrikeSet.has(s));
        if (strikes.length === 0) return <div className="px-4 py-8 text-center text-[var(--ac-text-muted)] text-sm">数据加载中...</div>;
        // 定义字段行
        type EColData = { strike: number; expiry: ExpiryConfig; cell: CellData | undefined; daysLeft: number; ann: number | null | undefined; annPct: string; annColor: string; ivr: number | null; bid: number | null; ask: number | null; bidEth: number | null; askEth: number | null; spread: number | null; delta: number | null; thetaDayUsd: number | null; oi: number | null; iv: number | null; };
        const buildEColData = (strike: number): EColData[] => expiryList.map(expiry => {
          const key = `${strike}-${expiry.code}`;
          const cell = matrix.get(key);
          const daysLeft = calcDaysLeft(expiry.expireDate);
          const ann = cell?.annualized;
          const annPct = ann != null ? (ann * 100).toFixed(2) + '%' : '—';
          const annColor = ann == null ? 'var(--ac-text-muted)' : ann <= 0.10 ? '#4ade80' : ann <= 0.20 ? '#22c55e' : ann <= 0.30 ? '#facc15' : ann <= 0.40 ? '#fb923c' : '#f87171';
          const ivr = cell?.ivRank ?? null;
          const bid = cell?.bidUsd != null && ethPrice > 0 ? Math.round(cell.bidUsd * ethPrice) : null;
          const ask = cell?.askUsd != null && ethPrice > 0 ? Math.round(cell.askUsd * ethPrice) : null;
          const bidEth = cell?.bidUsd ?? null;
          const askEth = cell?.askUsd ?? null;
          const spread = bid != null && ask != null ? ask - bid : null;
          const delta = cell?.delta ?? null;
          const theta = cell?.theta ?? null;
          const thetaDayUsd = theta != null && ethPrice > 0 ? Math.abs(theta / 365 * ethPrice) : null;
          const oi = cell?.openInterest ?? null;
          const iv = cell?.iv ?? null;
          return { strike, expiry, cell, daysLeft, ann, annPct, annColor, ivr, bid, ask, bidEth, askEth, spread, delta, thetaDayUsd, oi, iv };
        });
        const eAllRows: { dim: DimKey; zh: string; en: string; render: (c: EColData) => React.ReactNode }[] = [
          { dim: 'ann',    zh: '年化',  en: 'Ann.',    render: c => <span className="text-[length:var(--ac-fs-lg)] font-bold font-sans" style={{ color: c.annColor }}>{c.annPct}</span> },
          { dim: 'ivr',    zh: 'IVR',  en: 'IV Rank', render: c => c.ivr != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: c.ivr >= 70 ? '#f97316' : c.ivr >= 30 ? '#facc15' : '#4ade80' }}>{c.ivr.toFixed(0)}%</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'iv',     zh: 'IV',   en: 'Impl.Vol', render: c => c.iv != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#38bdf8' }}>{(c.iv * 100).toFixed(1)}%</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'bid',    zh: '买价',  en: 'Bid',     render: c => c.bid != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#6ee7b7' }}>{c.bid}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'ask',    zh: '卖价',  en: 'Ask',     render: c => c.ask != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#fca5a5' }}>{c.ask}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'spread', zh: '价差',  en: 'Spread',  render: c => c.spread != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans text-[var(--ac-text-secondary)]">{c.spread}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'bidEth', zh: '买ETH', en: 'Bid.E',  render: c => c.bidEth != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#6ee7b7' }}>{c.bidEth.toFixed(3)}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'askEth', zh: '卖ETH', en: 'Ask.E',  render: c => c.askEth != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans" style={{ color: '#fca5a5' }}>{c.askEth.toFixed(3)}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'delta',  zh: 'Delta', en: '方向性',  render: c => c.delta != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans text-blue-400">{c.delta.toFixed(3)}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'theta',  zh: 'Theta', en: '日损耗',  render: c => c.thetaDayUsd != null ? <button className="text-[length:var(--ac-fs-lg)] font-sans text-rose-400 cursor-pointer" onClick={e => { e.stopPropagation(); if (c.cell) setThetaPopup({ strike: c.strike, expiry: c.expiry, cell: c.cell, ethPrice }); }}><span className="underline decoration-dotted underline-offset-2">θ</span>-${c.thetaDayUsd.toFixed(2)}</button> : <span className="text-[var(--ac-text-muted)]">-</span> },
          { dim: 'oi',     zh: 'OI',   en: '未平仓',  render: c => c.oi != null ? <span className="text-[length:var(--ac-fs-lg)] font-sans text-[var(--ac-text-secondary)]">{c.oi.toLocaleString()}</span> : <span className="text-[var(--ac-text-muted)]">-</span> },
        ];
        const eRows = eAllRows.filter(r => activeDims.has(r.dim));
        return (
          <div>
            {/* 到期日多选 Tag */}
            <div className="flex items-center gap-1.5 px-3 py-2 flex-wrap border-b border-[var(--ac-border-subtle)]/40">
              <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] shrink-0 mr-0.5">到期日</span>
              {allExpiries.map(ex => {
                const active = selectedExpiries.has(ex.code);
                return (
                  <button key={ex.code} onClick={() => toggleExpiry(ex.code)}
                    className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 ${
                      active ? 'bg-amber-400/15 border-amber-400/50 text-amber-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                    }`}>
                    {ex.label}
                  </button>
                );
              })}
            </div>
            {/* 对比表格：字段行 × (N到期日 × M行权价) 列 */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ tableLayout: 'auto' }}>
                <thead>
                  <tr className="border-y border-[var(--ac-border)]">
                    <th className="text-left py-2 pl-3 pr-2 whitespace-nowrap bg-[var(--ac-bg-card)]/40"></th>
                    {strikes.map(s => (
                      expiryList.map(ex => (
                        <th key={`${s}-${ex.code}`} className="text-center py-1.5 px-2 border-l border-[var(--ac-border-subtle)]/60 bg-[var(--ac-bg-card)]/40">
                          <div className="text-[length:var(--ac-fs-sm)] font-semibold text-amber-300 whitespace-nowrap">{s}</div>
                          <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)] whitespace-nowrap">{ex.label} {calcDaysLeft(ex.expireDate)}D</div>
                        </th>
                      ))
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eRows.map((row, ri) => (
                    <tr key={row.zh} className={`border-b border-[var(--ac-border-subtle)]/30 ${ri % 2 !== 0 ? 'bg-[var(--ac-bg-card)]/20' : ''}`}>
                      <td className="py-2 pl-3 pr-3 whitespace-nowrap">
                        <div className="text-[length:var(--ac-fs-md)] font-sans font-semibold text-[var(--ac-text-primary)] leading-tight">{row.zh}</div>
                        <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)] leading-tight">{row.en}</div>
                      </td>
                      {strikes.map(s => {
                        const colData = buildEColData(s);
                        return expiryList.map(ex => {
                          const c = colData.find(d => d.expiry.code === ex.code)!;
                          return (
                            <td key={`${s}-${ex.code}`} className="text-center py-2 px-2 border-l border-[var(--ac-border-subtle)]/60 cursor-pointer active:bg-[var(--ac-bg-cell-empty)]"
                              onClick={() => c.cell && setDetail({ strike: s, expiry: ex, data: c.cell, ethPrice })}>
                              {row.render(c)}
                            </td>
                          );
                        });
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── 矩阵表 ── */}
      {viewMode === 'matrix' && <div
        ref={tableContainerRef}
        className="w-full"
        onTouchMove={(e) => {
          // 手指在矩阵上滑动时，只有气泡已显示时才切换格子（长按后才激活）
          if (!touchPreview) return;
          const touch = e.touches[0];
          if (!touch) return;
          const hit = hitCellFromTouch(touch.clientX, touch.clientY);
          if (!hit) return;
          // 如果命中的格子与当前预览相同，不重复更新
          if (
            touchPreview &&
            touchPreview.strike === hit.strike &&
            touchPreview.expiry.code === hit.expiry.code
          ) return;
          if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
          // 气泡已显示时只递增内容 key（淡入切换）；气泡未显示时同时递增入场 key
          if (!touchPreview) setBubbleKey(k => k + 1);
          setContentKey(k => k + 1);
          setTouchPreview(hit);
          touchTimerRef.current = setTimeout(() => dismissBubble(), 2000);
        }}
      >
        <table
          className="border-collapse"
          style={{
            tableLayout: 'fixed',
            width: activeMatrixExpiries.length > 4 ? `${40 + activeMatrixExpiries.length * 155}px` : '100%',
          }}
        >
          <colgroup>
            <col style={{ width: '44px' }} />
            {activeMatrixExpiries.map((_, i) => <col key={i} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--ac-border-subtle)]">
              <th
                className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans py-1 px-1 text-left tracking-wider"
              >行权价</th>
              {activeMatrixExpiries.map(e => {
                const days = calcDaysLeft(e.expireDate);
                return (
                  <th key={e.code} className="text-center py-1 px-0.5">
                    <div className="text-[length:var(--ac-fs-sm)] font-semibold text-[var(--ac-text-bright)]">{e.label}</div>
                    <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">{days}D</div>

                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allStrikes.length === 0 ? (
              <>
                {Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={i} className="border-b border-[var(--ac-border-subtle)]/50">
                    {/* 行权价列 */}
                      <td className="py-0.5 px-1">
                      <div
                        className="h-3 rounded-[1.5px] bg-[var(--ac-bg-cell-empty)] animate-pulse"
                        style={{ width: i % 3 === 0 ? 36 : i % 3 === 1 ? 28 : 32, animationDelay: `${i * 40}ms` }}
                      />
                    </td>
                    {/* 各到期日列 */}
                    {activeMatrixExpiries.map((e, j) => (
                        <td key={e.code} className="py-0.5 px-0.5">
                          <div
                            className="w-full rounded-[1.5px] py-1 flex flex-col items-center gap-1 bg-[var(--ac-bg-cell-empty)]/60 animate-pulse"
                          style={{ animationDelay: `${i * 40 + j * 60}ms` }}
                        >
                          <div className="h-2.5 rounded-[1.5px] bg-[var(--ac-border-subtle)]" style={{ width: '60%' }} />
                          <div className="h-1.5 rounded-[1.5px] bg-[var(--ac-border-subtle)]/60" style={{ width: '40%' }} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ) : allStrikes.map((strike, strikeIdx) => {
              const isAtm = atmStrike !== null && strike === atmStrike;
              return (
                <tr
                  key={strike}
                  ref={isAtm ? atmRowRef : undefined}
                  className={`border-b border-[var(--ac-border-subtle)]/50 ${isAtm ? "bg-amber-500/[0.07] ring-1 ring-inset ring-amber-500/20" : ""}`}
                >
                    <td
                      className="py-0.5 px-1 text-center"
                      style={activeMatrixExpiries.length > 4 ? { position: 'sticky', left: 0, zIndex: 5, background: isAtm ? 'rgba(245,158,11,0.07)' : 'var(--ac-bg-base)' } : {}}
                    >
                    {isAtm ? (
                      <div className="flex flex-col items-center gap-0">
                        <div className="text-[length:var(--ac-fs-sm)] font-sans font-bold text-amber-400 leading-tight">
                          {strike.toLocaleString()}
                        </div>
                        <div className="text-[length:var(--ac-fs-xs)] font-sans font-bold text-amber-400 leading-tight tracking-widest">ATM</div>
                        {ethPrice > 0 && (
                          <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)] leading-tight tabular-nums">
                            {Math.round(ethPrice).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0">
                        <div className="text-[length:var(--ac-fs-sm)] font-sans font-bold text-[var(--ac-text-primary)] leading-tight">
                          {strike.toLocaleString()}
                        </div>
                        {ethPrice > 0 && (
                          <div className={`text-[length:var(--ac-fs-xs)] font-sans leading-tight ${
                            strike > ethPrice ? 'text-rose-400/70' : 'text-emerald-400/70'
                          }`}>
                            {strike > ethPrice ? '+' : ''}{(((strike - ethPrice) / ethPrice) * 100).toFixed(1)}%
                          </div>
                        )}
                        {ethPrice > 0 && (
                          <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)] leading-tight tabular-nums">
                            {Math.round(ethPrice).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  {activeMatrixExpiries.map((expiry, expiryIdx) => {
                    const key = `${strike}-${expiry.code}`;
                    const cell = matrix.get(key) ?? null;
                    const ann = cell?.annualized ?? null;
                    const ivr = cell ? ivrCacheRef.current.get(cell.instrumentName)?.ivr ?? null : null;
                    const expiryLoaded = loadedExpiries.has(expiry.code);
                    const contractExists = existMap.get(expiry.code)?.has(strike) ?? false;
                    const delay = strikeIdx * 30;

                    // 无合约：留空深色格子（与有数据格子完全等高）
                    if (expiryLoaded && !contractExists) {
                      return (
                        <td key={expiry.code} className="py-0.5 px-0.5" style={{ height: '1px' }}>
                          <div
                            className="w-full rounded-[1.5px] border flex items-center justify-center"
                            style={{ padding: '3px 2px', minHeight: '30px', height: '100%', backgroundColor: '#1f2937', borderColor: '#374151' }}
                          >
                            <span style={{ fontSize: '0.6em', color: '#6b7280', letterSpacing: '0.05em', fontFamily: 'Trebuchet MS, sans-serif' }}>无此合约</span>
                          </div>
                        </td>
                      );
                    }

                    const prev = cell?.prevAnnualized ?? null;
                    const flashDir = prev !== null && Math.abs(ann ?? 0 - prev) > 0.00001
                      ? (ann !== null && ann > prev ? 'up' : 'down')
                      : null;

                    const annContent = (() => {
                      if (ann === null) return <span>—</span>;
                      let arrowChar = '';
                      let arrowColor = '';
                      let numColor = 'inherit';
                      if (prev !== null && Math.abs(ann - prev) > 0.00001) {
                        arrowChar = ann > prev ? '▲' : '▼';
                        arrowColor = ann > prev ? '#dc2626' : '#16a34a';
                      }
                      return <>
                        <span style={{ fontSize: '0.65em', color: '#ffffff', letterSpacing: '0.05em', marginRight: '3px' }}>ANN</span>
                        <span style={{ color: numColor }}>{(ann * 100).toFixed(2)}%</span>
                        {arrowChar && <span style={{ color: arrowColor, fontSize: '0.65em', marginLeft: '2px' }}>{arrowChar}</span>}
                      </>;
                    })();

                    const ivrContent = (() => {
                      if (ivr === null) return <span className="text-[var(--ac-text-muted)]">—</span>;
                      const color = ivr >= 70 ? 'text-orange-300' : ivr <= 30 ? 'text-emerald-300' : 'text-cyan-300';
                      return <span className={color}>{ivr.toFixed(2)}%</span>;
                    })();

                    // 双行布局：上 Ann. 下 IVR（所有列统一）
                    // flashKey 在每次 prevAnnualized 变化时更新，强制 React 重新挂载 button 触发动画
                    const flashKey = `${key}-${cell?.prevAnnualized ?? 'null'}`;
                    const flashClass = flashDir === 'up' ? 'cell-flash-up' : flashDir === 'down' ? 'cell-flash-down' : '';
                    // 年化筛选：判断当前格子是否在筛选区间内
                    const inFilterRange = annFilter === null
                      ? true
                      : ann !== null && ann >= annFilter[0] && ann < annFilter[1];
                    return (
                      <td key={expiry.code} className="py-0.5 px-0.5">
                        <button
                          key={flashKey}
                          data-strike={strike}
                          data-expiry={expiry.code}
                          className={`w-full rounded-[1.5px] text-center text-[length:var(--ac-fs-sm)] font-sans font-semibold border transition-all duration-200 active:scale-95 active:opacity-70 text-white ${annualizedBorder(ann)} ${flashClass}`}
                          style={{
                            backgroundColor: ann !== null ? 'rgba(33,38,45,0.9)' : 'var(--ac-bg-cell-empty)',
                            borderColor: ann !== null ? 'rgba(48,54,61,0.5)' : 'rgba(48,54,61,0.3)',
                            color: ann !== null ? 'white' : 'var(--ac-text-muted)',
                            textShadow: 'none',
                            opacity: inFilterRange ? 1 : 0.18,
                            transform: inFilterRange ? 'scale(1)' : 'scale(0.97)',
                            // 增大点击热区：内边距加大，让手指更容易触到
                            padding: '3px 2px',
                            minHeight: '30px',
                          }}
                          onClick={() => {
                            if (touchTimerRef.current) {
                              clearTimeout(touchTimerRef.current);
                              touchTimerRef.current = null;
                            }
                            // 点击时直接关闭气泡（无需淡出）并打开详情弹窗
                            setTouchPreview(null);
                            setBubbleExiting(false);
                            if (cell) setDetail({ strike, expiry, data: cell, ethPrice });
                          }}
                          onTouchStart={(e) => {
                            if (!cell) return;
                            const touch = e.touches[0];
                            const rect = e.currentTarget.getBoundingClientRect();
                            const bubbleX = touch.clientX;
                            const bubbleY = rect.top;
                            // 清除上一次定时器
                            if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
                            // 长按 500ms 后才显示气泡
                            touchTimerRef.current = setTimeout(() => {
                              // 触觉反馈：轻微震动 30ms（Android 支持，iOS 忽略）
                              if (navigator.vibrate) navigator.vibrate(30);
                              setBubbleKey(k => k + 1);
                              setContentKey(k => k + 1);
                              setTouchPreview({ strike, expiry, cell, ethPrice, x: bubbleX, y: bubbleY });
                              // 2.5s 后自动消除
                              touchTimerRef.current = setTimeout(() => dismissBubble(), 2500);
                            }, 500);
                          }}
                          onTouchEnd={() => {
                            // 手指括开：若气泡尚未出现（长按计时器还在），取消它；若已显示，延迟消除
                            if (touchTimerRef.current) {
                              clearTimeout(touchTimerRef.current);
                              touchTimerRef.current = null;
                            }
                            if (touchPreview) {
                              touchTimerRef.current = setTimeout(() => dismissBubble(), 1000);
                            }
                          }}
                        >
                          <div style={{ fontFamily: "'Trebuchet MS', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%', width: '100%', gap: '1px', padding: '0 1px' }}>
                          {/* ANN 年化行 */}
                          {activeDims.has('ann') && (
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', lineHeight: 1.1, width: '100%' }}>
                              <span style={{ color: '#ffffff', fontSize: 'var(--ac-fs-xs)', letterSpacing: '0.04em', flexShrink: 0 }}>ANN</span>
                              <span style={{ display: 'flex', alignItems: 'baseline', gap: '1px' }}>
                                {(() => { const prev = cell?.prevAnnualized ?? null; if (prev !== null && ann !== null && Math.abs(ann - prev) > 0.00001) { const up = ann > prev; return <span style={{ color: up ? '#dc2626' : '#16a34a', fontSize: '0.6em', display: 'inline-block', width: '0.7em', textAlign: 'center' }}>{up ? '▲' : '▼'}</span>; } return <span style={{ display: 'inline-block', width: '0.7em' }} />; })()}
                                <span style={{ color: 'inherit', fontSize: '1em', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{ann !== null ? (ann * 100).toFixed(2) + '%' : '—'}</span>
                              </span>
                            </div>
                          )}
                          {/* IV + R 行 */}
                          {(activeDims.has('iv') || activeDims.has('ivr')) && (() => {
                            const showBoth = activeDims.has('iv') && activeDims.has('ivr') && cell?.iv != null && ivr !== null;
                            const ivStr = cell?.iv != null ? (cell.iv * 100).toFixed(showBoth ? 0 : 1) + '%' : null;
                            const ivrStr = ivr !== null ? ivr.toFixed(2) + '%' : null;
                            return (
                              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', lineHeight: 1.1, fontSize: 'var(--ac-fs-xs)', width: '100%' }}>
                                {activeDims.has('iv') && ivStr ? (
                                  <span><span style={{ color: '#ffffff' }}>IV</span><span style={{ color: '#60a5fa', fontFamily: "'JetBrains Mono', monospace" }}>{ivStr}</span></span>
                                ) : <span />}
                                {activeDims.has('ivr') && ivrStr ? (
                                  <span><span style={{ color: '#ffffff' }}>IVR</span><span style={{ color: '#facc15', fontFamily: "'JetBrains Mono', monospace" }}>{ivrStr}</span></span>
                                ) : <span />}
                              </div>
                            );
                          })()}
                          {/* δ + θ 行 */}
                          {(activeDims.has('delta') || activeDims.has('theta')) && (
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', lineHeight: 1.1, fontSize: 'var(--ac-fs-xs)', width: '100%' }}>
                              {activeDims.has('delta') && cell?.delta != null ? (
                                <span><span style={{ color: '#ffffff' }}>δ</span><span style={{ color: '#c084fc', fontFamily: "'JetBrains Mono', monospace" }}>{cell.delta.toFixed(3)}</span></span>
                              ) : <span />}
                              {activeDims.has('theta') && cell?.theta != null && ethPrice > 0 ? (
                                <button
                                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}
                                  onClick={e => { e.stopPropagation(); setThetaPopup({ strike, expiry, cell, ethPrice }); }}
                                >
                                  <span style={{ color: '#ffffff', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '1px' }}>θ</span>
                                  <span style={{ color: '#f472b6', fontFamily: "'JetBrains Mono', monospace" }}>{(cell.theta / 365 * ethPrice).toFixed(2)}</span>
                                </button>
                              ) : <span />}
                            </div>
                          )}
                          {/* OI + V 行 */}
                          {activeDims.has('oi') && (cell?.openInterest != null || cell?.volume != null) && (
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', lineHeight: 1.1, fontSize: 'var(--ac-fs-xs)', width: '100%' }}>
                              {cell?.openInterest != null ? (
                                <span><span style={{ color: '#ffffff' }}>OI</span><span style={{ color: '#fb923c', fontFamily: "'JetBrains Mono', monospace" }}>{cell.openInterest >= 1000 ? (cell.openInterest / 1000).toFixed(1) + 'k' : cell.openInterest}</span></span>
                              ) : <span />}
                              {cell?.volume != null ? (
                                <span><span style={{ color: '#ffffff' }}>Vol</span><span style={{ color: '#34d399', fontFamily: "'JetBrains Mono', monospace" }}>{cell.volume >= 1000 ? (cell.volume / 1000).toFixed(1) + 'k' : cell.volume}</span></span>
                              ) : <span />}
                            </div>
                          )}
                          {/* 报价行：B (spread) A */}
                          {ethPrice > 0 && cell?.bidUsd != null && cell?.askUsd != null && (() => {
                            const askDollar = parseFloat((cell.askUsd * ethPrice).toFixed(2));
                            const intrinsicDollar = parseFloat(Math.max(ethPrice - strike, 0).toFixed(2));
                            const tvDollar = parseFloat((askDollar - intrinsicDollar).toFixed(2));
                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', lineHeight: 1.1, fontSize: 'var(--ac-fs-xs)', width: '100%' }}>
                                  <span><span style={{ color: '#ffffff' }}>B</span><span style={{ color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(cell.bidUsd * ethPrice)}</span></span>
                                  {cell.markUsd != null ? <span><span style={{ color: '#ffffff' }}>M</span><span style={{ color: '#22d3ee', fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(cell.markUsd * ethPrice)}</span></span> : <span />}
                                  <span><span style={{ color: '#ffffff' }}>A</span><span style={{ color: '#f87171', fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(cell.askUsd * ethPrice)}</span></span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', lineHeight: 1.1, fontSize: 'var(--ac-fs-xs)', width: '100%' }}>
                                  <span><span style={{ color: '#ffffff' }}>Sp</span><span style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}>{Math.round((cell.askUsd - cell.bidUsd) * ethPrice)}</span></span>
                                  <span><span style={{ color: '#ffffff' }}>In</span><span style={{ color: '#818cf8', fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(intrinsicDollar)}</span></span>
                                  <span><span style={{ color: '#ffffff' }}>Ex</span><span style={{ color: '#fbbf24', fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(tvDollar)}</span></span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', lineHeight: 1.1, fontSize: 'var(--ac-fs-xs)', width: '100%' }}>
                                  <span><span style={{ color: '#ffffff' }}>B</span><span style={{ color: '#4ade80', fontFamily: "'JetBrains Mono', monospace" }}>{cell.bidUsd.toFixed(2)}</span></span>
                                  {cell.markUsd != null && cell.markUsd > 0 ? <span style={{ color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}>{((cell.askUsd - cell.bidUsd) / cell.markUsd * 100).toFixed(1)}%</span> : <span />}
                                  <span><span style={{ color: '#ffffff' }}>A</span><span style={{ color: '#f87171', fontFamily: "'JetBrains Mono', monospace" }}>{cell.askUsd.toFixed(2)}</span></span>
                                </div>
                              </>
                            );
                          })()}
                          </div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}

      {/* 图例：全量模式下隐藏 */}
      {viewMode !== 'matrix' && <div className="flex items-center gap-4 px-3 py-2.5 text-[length:var(--ac-fs-sm)] font-sans border-t border-[var(--ac-border-subtle)]/60">
        {optionType === 'P' ? (
          <>
            <span className="text-emerald-500">≤10%</span>
            <span className="text-green-400">≤20%</span>
            <span className="text-yellow-400">≤30%</span>
            <span className="text-red-400">&gt;30%</span>
            <span className="text-[var(--ac-text-muted)] ml-1 text-[length:var(--ac-fs-xs)]">权利金/行权价年化</span>
          </>
        ) : (
          <>
            <span className="text-emerald-500">≤18%</span>
            <span className="text-green-400">≤24%</span>
            <span className="text-yellow-400">≤30%</span>
            <span className="text-red-400">&gt;30%</span>
          </>
        )}
        <span className="text-[var(--ac-text-muted)] ml-auto">N/A</span>
      </div>}



      {detail && <DetailModal cell={detail} onClose={() => setDetail(null)} optionType={optionType} />}
      {thetaPopup && <ThetaPopupModal info={thetaPopup} onClose={() => setThetaPopup(null)} optionType={optionType} />}

      {/* 触摸预览气泡 */}
      {touchPreview && (() => {
        const { strike, expiry, cell, ethPrice: ep, x, y } = touchPreview;
        const ann = cell.annualized;
        const annPct = ann !== null ? (ann * 100).toFixed(1) + '%' : '—';
        const ivr = cell.ivRank;
        const ivrStr = ivr !== null ? ivr.toFixed(1) + '%' : '—';
        const delta = cell.delta;
        const daysLeft = calcDaysLeft(expiry.expireDate);
        const markUsd = cell.markUsd;
        const markStr = markUsd !== null ? '$' + markUsd.toFixed(2) : '—';
        // 气泡宽度
        const BW = 200;
        // 气泡左边界：尽量居中触摸点，但不超出屏幕
        const leftPx = Math.max(8, Math.min(x - BW / 2, window.innerWidth - BW - 8));
        // 气泡显示在触摸点上方 12px，高度约 140px
        const topPx = Math.max(60, y - 148);
        const annColor = ann === null ? 'var(--ac-text-muted)'
          : ann <= 0.10 ? '#4ade80'
          : ann <= 0.20 ? '#22c55e'
          : ann <= 0.30 ? '#facc15'
          : ann <= 0.40 ? '#fb923c'
          : '#f87171';
        return (
          <div
            key={bubbleKey}
            className={`fixed z-50 pointer-events-none ${bubbleExiting ? 'bubble-exit' : 'bubble-enter'}`}
            style={{ left: leftPx, top: topPx, width: BW }}
          >
            <div className="bg-[var(--ac-bg-cell-empty)]/95 backdrop-blur-xl border border-[var(--ac-border)] rounded-[1.5px] shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)' }}>
              {/* 标题行 */}
              <div className="px-3 pt-2.5 pb-1.5 border-b border-[var(--ac-border-subtle)]/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[length:var(--ac-fs-sm)] font-bold font-sans text-[var(--ac-text-bright)]">{strike.toLocaleString()}</span>
                  <span className="text-[length:var(--ac-fs-xs)] font-sans px-1 py-0.5 rounded-[1.5px]" style={{ background: optionType === 'C' ? 'rgba(34,197,94,0.2)' : 'rgba(248,113,113,0.2)', color: optionType === 'C' ? '#4ade80' : '#f87171' }}>{optionType === 'C' ? 'CALL' : 'PUT'}</span>
                </div>
                <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-secondary)]">{expiry.label} {daysLeft}D</span>
              </div>
              {/* 数据网格：内容切换时淡入 */}
              <div key={contentKey} className="grid grid-cols-2 gap-0 divide-x divide-[var(--ac-border-subtle)]/40 bubble-content-fade">
                <div className="px-3 py-2">
                  <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)] mb-0.5">{optionType === 'C' ? '年化收益' : 'PUT 年化'}</div>
                  <div className="text-[length:var(--ac-fs-xl)] font-bold font-sans leading-tight" style={{ color: annColor }}>{annPct}</div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)] mb-0.5">IVR 百分位</div>
                  <div className={`text-[length:var(--ac-fs-lg)] font-bold font-sans leading-tight ${
                    ivr !== null && ivr >= 70 ? 'text-orange-300' : ivr !== null && ivr <= 30 ? 'text-emerald-300' : 'text-cyan-300'
                  }`}>{ivrStr}</div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)] mb-0.5">Mark 价格</div>
                  <div className="text-[length:var(--ac-fs-md)] font-semibold font-sans text-[var(--ac-text-primary)]">{markStr}</div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)] mb-0.5">Delta</div>
                  <div className="text-[length:var(--ac-fs-md)] font-semibold font-sans text-[var(--ac-text-primary)]">{delta !== null ? delta.toFixed(3) : '—'}</div>
                </div>
              </div>
              {/* 底部提示 */}
              <div className="px-3 py-1.5 border-t border-[var(--ac-border-subtle)]/40">
                <div className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] text-center">点击查看完整详情</div>
              </div>
            </div>
            {/* 尖角指向格子 */}
            <div className="flex justify-center">
              <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid var(--ac-border)' }} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
