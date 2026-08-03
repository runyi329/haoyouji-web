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
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { Link } from "wouter";
import { toast } from "sonner";

// ─── 到期日配置 ────────────────────────────────────────────────
interface ExpiryConfig { code: string; label: string; fullLabel: string; expireDate: string; year: number; }

// 静态兜底（首次渲染前使用）
const DEFAULT_EXPIRIES: ExpiryConfig[] = [
  { code: "25SEP26", label: "9/25",  fullLabel: "2026/9/25",  expireDate: "2026-09-25", year: 2026 },
  { code: "25DEC26", label: "12/25", fullLabel: "2026/12/25", expireDate: "2026-12-25", year: 2026 },
  { code: "26MAR27", label: "3/26",  fullLabel: "2027/3/26",  expireDate: "2027-03-26", year: 2027 },
  { code: "25JUN27", label: "6/25",  fullLabel: "2027/6/25",  expireDate: "2027-06-25", year: 2027 },
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
  // Deribit 期权到期时间固定为 UTC 08:00（北京时间 16:00）
  const expire = new Date(`${expireDate}T08:00:00Z`);
  const daysLeft = Math.ceil((expire.getTime() - now.getTime()) / 86400000);
  // 统一显示为 月/日 格式，直观清晰
  const label = `${monthNum}/${dayNum}`;
  const fullLabel = `${year}/${monthNum}/${dayNum}`;
  return { code, label, fullLabel, expireDate, year };
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
  // Deribit 期权到期时间固定为 UTC 08:00（北京时间 16:00）
  const exp = new Date(`${expireDate}T08:00:00Z`);
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

// ─── Black-Scholes 期权价格计算 ───────────────────────────────────────────
/** 计算 Black-Scholes 期权价格（USD） */
function bsPrice(S: number, K: number, T: number, iv: number, r: number, isCall: boolean): number {
  if (T <= 0 || iv <= 0 || S <= 0) {
    // 到期时：CALL = max(S-K,0)，PUT = max(K-S,0)
    return isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  }
  const d1 = (Math.log(S / K) + (r + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
  const d2 = d1 - iv * Math.sqrt(T);
  if (isCall) {
    return S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2);
  } else {
    return K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1);
  }
}

// ─── 价值分解历史 Hook ─────────────────────────────────────────────────────
interface VdcPoint {
  dateLabel: string;
  tMs: number;
  total: number;
  intrinsic: number;
  tv: number;
  isFuture: boolean;
}

function useValueDecompositionHistory(
  instrumentName: string,
  expireDate: string,
  strike: number,
  isCall: boolean,
  iv: number | null,
  ethPrice: number,
  daysLeft: number,
) {
  const [points, setPoints] = useState<VdcPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!instrumentName || ethPrice <= 0) return;
    setLoading(true);
    setError(false);

    const ws = new WebSocket('wss://www.deribit.com/ws/api/v2');
    const results: Record<number, { ticks: number[]; close: number[] }> = {};
    let listingTs = 0;

    ws.onopen = () => {
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 8001,
        method: 'public/get_instrument',
        params: { instrument_name: instrumentName }
      }));
    };

    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);

        if (d.id === 8001) {
          const now = Date.now();
          listingTs = d.result?.creation_timestamp ?? (now - 365 * 24 * 3600 * 1000);
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: 8002,
            method: 'public/get_tradingview_chart_data',
            params: { instrument_name: instrumentName, start_timestamp: listingTs, end_timestamp: now, resolution: '1D' }
          }));
          ws.send(JSON.stringify({ jsonrpc: '2.0', id: 8003,
            method: 'public/get_tradingview_chart_data',
            params: { instrument_name: 'ETH-PERPETUAL', start_timestamp: listingTs, end_timestamp: now, resolution: '1D' }
          }));
          return;
        }

        if (d.id === 8002 || d.id === 8003) {
          results[d.id] = d.result || { ticks: [], close: [] };
          if (!results[8002] || !results[8003]) return;

          const optData = results[8002];
          const ethData = results[8003];
          const expMs = new Date(expireDate).getTime();
          const nowMs = Date.now();

          // 构建 ETH 历史价格映射（按天对齐）
          const ethMap = new Map<number, number>();
          (ethData.ticks || []).forEach((t: number, i: number) => {
            const tMs = t < 10_000_000_000 ? t * 1000 : t;
            const dayKey = Math.floor(tMs / 86400000) * 86400000;
            ethMap.set(dayKey, (ethData.close || [])[i]);
          });

          // ── 历史段：用真实数据 ──
          const histPoints: VdcPoint[] = [];
          (optData.ticks || []).forEach((t: number, i: number) => {
            const tMs = t < 10_000_000_000 ? t * 1000 : t;
            const dayKey = Math.floor(tMs / 86400000) * 86400000;
            const optMarkEth = (optData.close || [])[i];
            if (!optMarkEth || optMarkEth <= 0) return;

            const S = ethMap.get(dayKey)
              ?? ethMap.get(dayKey - 86400000)
              ?? ethMap.get(dayKey + 86400000)
              ?? 0;
            if (S <= 0) return;

            const totalUsd = optMarkEth * S;
            const intrinsicUsd = isCall
              ? Math.max(0, S - strike)
              : Math.max(0, strike - S);
            const tvUsd = Math.max(0, totalUsd - intrinsicUsd);

            const d2 = new Date(tMs);
            histPoints.push({
              dateLabel: `${d2.getMonth() + 1}/${d2.getDate()}`,
              tMs,
              total: totalUsd,
              intrinsic: intrinsicUsd,
              tv: tvUsd,
              isFuture: false,
            });
          });

          // ── 未来段：BS 估算（固定当前 IV 和 ETH 价格）──
          const futurePoints: VdcPoint[] = [];
          if (iv !== null && iv > 0 && daysLeft > 0) {
            const r = 0.05;
            const step = daysLeft <= 60 ? 1 : daysLeft <= 180 ? 2 : 3;
            for (let daysAhead = 1; daysAhead <= daysLeft; daysAhead += step) {
              const tMs = nowMs + daysAhead * 86400000;
              const dteRemaining = Math.max(0, daysLeft - daysAhead);
              const T = dteRemaining / 365;
              const totalUsd = bsPrice(ethPrice, strike, T, iv, r, isCall);
              const intrinsicUsd = isCall
                ? Math.max(0, ethPrice - strike)
                : Math.max(0, strike - ethPrice);
              const tvUsd = Math.max(0, totalUsd - intrinsicUsd);
              const d2 = new Date(tMs);
              futurePoints.push({
                dateLabel: `${d2.getMonth() + 1}/${d2.getDate()}`,
                tMs,
                total: totalUsd,
                intrinsic: intrinsicUsd,
                tv: tvUsd,
                isFuture: true,
              });
            }
            futurePoints.push({
              dateLabel: '到期',
              tMs: expMs,
              total: isCall ? Math.max(0, ethPrice - strike) : Math.max(0, strike - ethPrice),
              intrinsic: isCall ? Math.max(0, ethPrice - strike) : Math.max(0, strike - ethPrice),
              tv: 0,
              isFuture: true,
            });
          }

          setPoints([...histPoints, ...futurePoints]);
          setLoading(false);
          ws.close();
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => { setError(true); setLoading(false); };
    return () => { try { ws.close(); } catch { /* ignore */ } };
  }, [instrumentName, expireDate, strike, isCall, iv, ethPrice, daysLeft]);

  return { points, loading, error };
}

/**
 * 价值分解曲线图（动态版）
 * 历史段：真实标记价 × 当日 ETH 价格 → 真实内在价值 + 时间价值（实线）
 * 未来段：BS 估算，假设价格/IV 不变（虚线）
 */
function ValueDecompositionChart({
  instrumentName, expireDate, strike, isCall, iv, ethPrice, daysLeft, markUsd,
}: {
  instrumentName: string; expireDate: string; strike: number; isCall: boolean;
  iv: number | null; ethPrice: number; daysLeft: number; markUsd: number;
}) {
  const { points, loading, error } = useValueDecompositionHistory(
    instrumentName, expireDate, strike, isCall, iv, ethPrice, daysLeft
  );

  // ── 单位切换（必须在所有条件 return 之前声明，遵守 React Hooks 规则）──
  const [unit, setUnit] = useState<'usd' | 'eth'>('usd');
  const isEth = unit === 'eth';
  const divisor = isEth && ethPrice > 0 ? ethPrice : 1;
  const fmtVal = (v: number) => isEth
    ? `${(v / divisor).toFixed(4)} Ξ`
    : `$${v.toFixed(0)}`;
  const fmtShort = (v: number) => isEth
    ? `${(v / divisor).toFixed(3)}Ξ`
    : `$${v.toFixed(0)}`;
  const conv = (v: number) => v / divisor;

  if (loading) return (
    <div className="flex items-center justify-center py-6 gap-2 text-[var(--ac-text-muted)] text-xs">
      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
      </svg>
      正在加载真实历史数据...
    </div>
  );
  if (error || points.length < 2) return (
    <div className="text-center text-[var(--ac-text-muted)] text-xs py-4">暂无历史数据</div>
  );

  const histPts = points.filter(p => !p.isFuture);
  const futurePts = points.filter(p => p.isFuture);
  const totalCount = points.length;
  const histCount = histPts.length;

  const W = 320, H = 140, PL = 46, PR = 10, PT = 10, PB = 30;
  const cW = W - PL - PR, cH = H - PT - PB;

  const maxVal = Math.max(...points.map(p => conv(p.total)), conv(markUsd) * 1.05, 0.001);

  const toX = (i: number) => PL + (i / Math.max(1, totalCount - 1)) * cW;
  const toY = (v: number) => PT + cH - Math.min(1, Math.max(0, conv(v) / maxVal)) * cH;

  const todayX = histCount > 0 ? toX(histCount - 1) : PL;
  const todayPt = histPts[histCount - 1];

  const makeArea = (
    pts: VdcPoint[], startIdx: number,
    getTop: (p: VdcPoint) => number,
    getBase: (p: VdcPoint) => number
  ) => {
    if (pts.length < 2) return '';
    const top = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i + startIdx).toFixed(1)},${toY(getTop(p)).toFixed(1)}`).join(' ');
    const bottom = [...pts].reverse().map((p, i, arr) =>
      `L ${toX(startIdx + arr.length - 1 - i).toFixed(1)},${toY(getBase(p)).toFixed(1)}`
    ).join(' ');
    return `${top} ${bottom} Z`;
  };

  const yTicks = [0, 0.33, 0.67, 1.0].map(r => ({
    y: PT + cH - r * cH,
    label: isEth
      ? `${(r * maxVal).toFixed(3)}Ξ`
      : `$${(r * maxVal).toFixed(0)}`,
  }));

  const xStep = Math.max(1, Math.floor(totalCount / 4));
  const xLabels = points
    .map((p, i) => ({ i, label: p.dateLabel, isFuture: p.isFuture }))
    .filter((_, i) => i % xStep === 0 || i === totalCount - 1 || i === histCount - 1);

  const markY = toY(markUsd);

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-[var(--ac-text-secondary)] font-sans tracking-widest uppercase">
          价值分解 · 真实历史
        </span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* 单位切换按钮 */}
          <div className="flex rounded overflow-hidden border border-[var(--ac-border)]/60 text-[9px] font-mono">
            <button
              onClick={() => setUnit('usd')}
              className="px-1.5 py-0.5 transition-colors"
              style={{
                background: !isEth ? 'rgba(251,191,36,0.18)' : 'transparent',
                color: !isEth ? '#fbbf24' : 'rgba(255,255,255,0.35)',
              }}
            >$ USD</button>
            <button
              onClick={() => setUnit('eth')}
              className="px-1.5 py-0.5 border-l border-[var(--ac-border)]/60 transition-colors"
              style={{
                background: isEth ? 'rgba(96,165,250,0.18)' : 'transparent',
                color: isEth ? '#60a5fa' : 'rgba(255,255,255,0.35)',
              }}
            >Ξ ETH</button>
          </div>
          <span className="flex items-center gap-1 text-[9px] font-sans" style={{ color: '#60a5fa' }}>
            <span style={{ display:'inline-block', width:8, height:8, background:'rgba(96,165,250,0.5)', borderRadius:1 }} />
            内在价值
          </span>
          <span className="flex items-center gap-1 text-[9px] font-sans" style={{ color: '#fb923c' }}>
            <span style={{ display:'inline-block', width:8, height:8, background:'rgba(251,146,60,0.5)', borderRadius:1 }} />
            时间价值
          </span>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="vdc2-iv-hist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.60" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="vdc2-tv-hist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0.20" />
          </linearGradient>
          <linearGradient id="vdc2-iv-fut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="vdc2-tv-fut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0.06" />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <line key={i} x1={PL} y1={t.y} x2={PL + cW} y2={t.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {yTicks.map((t, i) => (
          <text key={i} x={PL - 3} y={t.y + 3} textAnchor="end" fontSize="8" fill="rgba(255,255,255,0.3)" fontFamily="monospace">{t.label}</text>
        ))}
        {histPts.length > 1 && <>
          <path d={makeArea(histPts, 0, p => p.intrinsic, () => 0)} fill="url(#vdc2-iv-hist)" />
          <path d={makeArea(histPts, 0, p => p.total, p => p.intrinsic)} fill="url(#vdc2-tv-hist)" />
          <polyline points={histPts.map((p, i) => `${toX(i).toFixed(1)},${toY(p.intrinsic).toFixed(1)}`).join(' ')}
            fill="none" stroke="#60a5fa" strokeWidth="1" strokeOpacity="0.7" />
          <polyline points={histPts.map((p, i) => `${toX(i).toFixed(1)},${toY(p.total).toFixed(1)}`).join(' ')}
            fill="none" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>}
        {futurePts.length > 1 && <>
          <path d={makeArea(futurePts, histCount - 1, p => p.intrinsic, () => 0)} fill="url(#vdc2-iv-fut)" />
          <path d={makeArea(futurePts, histCount - 1, p => p.total, p => p.intrinsic)} fill="url(#vdc2-tv-fut)" />
          <polyline points={futurePts.map((p, i) => `${toX(i + histCount - 1).toFixed(1)},${toY(p.intrinsic).toFixed(1)}`).join(' ')}
            fill="none" stroke="#60a5fa" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3 3" />
          <polyline points={futurePts.map((p, i) => `${toX(i + histCount - 1).toFixed(1)},${toY(p.total).toFixed(1)}`).join(' ')}
            fill="none" stroke="#fb923c" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.55" />
        </>}
        <line x1={PL} y1={markY} x2={PL + cW} y2={markY} stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 2" strokeOpacity="0.55" />
        <text x={PL + cW + 2} y={markY + 3} fontSize="7" fill="#fbbf24" fontFamily="monospace" opacity="0.65">Mark</text>
        <line x1={todayX} y1={PT} x2={todayX} y2={PT + cH} stroke="#fbbf24" strokeWidth="1" strokeDasharray="2 2" />
        {todayPt && <>
          <circle cx={todayX} cy={toY(todayPt.total)} r="3" fill="#fb923c" />
          {todayPt.intrinsic > 0 && <circle cx={todayX} cy={toY(todayPt.intrinsic)} r="2.5" fill="#60a5fa" />}
          <text x={todayX + 4} y={toY(todayPt.total) - 3} fontSize="8" fill="#fb923c" fontFamily="monospace">{fmtShort(todayPt.total)}</text>
          {todayPt.intrinsic > 1 && (
            <text x={todayX + 4} y={toY(todayPt.intrinsic) + 9} fontSize="8" fill="#60a5fa" fontFamily="monospace">IV {fmtShort(todayPt.intrinsic)}</text>
          )}
          {todayPt.tv > 1 && (
            <text x={todayX + 4} y={toY(todayPt.intrinsic + todayPt.tv / 2)} fontSize="7" fill="#fb923c" fontFamily="monospace" opacity="0.8">TV {fmtShort(todayPt.tv)}</text>
          )}
        </>}
        {xLabels.map(({ i, label, isFuture }) => (
          <text key={i} x={toX(i)} y={H - 14} textAnchor="middle" fontSize="7.5"
            fill={i === histCount - 1 ? '#fbbf24' : isFuture ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.4)'}
            fontFamily="sans-serif">{label}</text>
        ))}
        <text x={todayX} y={H - 4} textAnchor="middle" fontSize="7.5" fill="#fbbf24" fontFamily="sans-serif">今</text>
        {futurePts.length > 1 && (
          <text x={toX(histCount - 1 + Math.floor(futurePts.length * 0.45))} y={H - 4}
            textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.22)" fontFamily="sans-serif" fontStyle="italic">
            虚线=BS估算(价格/IV不变)
          </text>
        )}
      </svg>
      {/* 今日数值文字摘要（切换单位时同步更新） */}
      {todayPt && (
        <div className="flex items-center gap-3 mt-1 px-1 text-[9px] font-mono">
          <span style={{ color: '#fb923c' }}>总 {fmtVal(todayPt.total)}</span>
          <span style={{ color: '#60a5fa' }}>内在 {fmtVal(todayPt.intrinsic)}</span>
          <span style={{ color: '#fb923c', opacity: 0.75 }}>时间 {fmtVal(todayPt.tv)}</span>
        </div>
      )}
    </div>
  );
}

/** Theta 衰减曲线 SVG 组件 */
function ThetaDecayCurve({ strike, expireDate, iv, ethPrice, daysLeft, totalDays, isCall }: {
  strike: number; expireDate: string; iv: number; ethPrice: number; daysLeft: number; totalDays: number; isCall: boolean;
}) {
  const series = useMemo(
    () => buildThetaSeries(strike, expireDate, iv, ethPrice, isCall, totalDays),
    [strike, expireDate, iv, ethPrice, isCall, totalDays]
  );

  // ── 单位切换（必须在所有条件 return 之前声明，遵守 React Hooks 规则）──
  const [unit, setUnit] = useState<'usd' | 'eth'>('usd');
  const isEth = unit === 'eth';
  const divisor = isEth && ethPrice > 0 ? ethPrice : 1;
  const convTheta = (v: number) => v / divisor;
  const fmtTheta = (v: number) => isEth
    ? `${convTheta(v).toFixed(5)}Ξ`
    : `$${v.toFixed(2)}`;

  if (series.length < 2) return null;

  const W = 320, H = 110, PL = 42, PR = 8, PT = 8, PB = 24;
  const cW = W - PL - PR, cH = H - PT - PB;

  const maxTheta = Math.max(...series.map((p: { date: Date; dte: number; theta: number }) => convTheta(p.theta)), 0.0001);
  // 找最接近 daysLeft 的点（避免精确匹配失败）
  const todayIdx = series.reduce((best, p, i) => {
    const prev = series[best];
    return Math.abs(p.dte - daysLeft) < Math.abs(prev.dte - daysLeft) ? i : best;
  }, 0);
  const todayX = (todayIdx / (series.length - 1)) * cW;

  const toX = (i: number) => PL + (i / (series.length - 1)) * cW;
  const toY = (theta: number) => PT + cH - Math.min(1, Math.max(0, convTheta(theta) / maxTheta)) * cH;

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
    label: r === 0 ? '0' : isEth
      ? `${(r * maxTheta).toFixed(4)}Ξ`
      : `$${(r * maxTheta).toFixed(1)}`
  }));

  // X轴刻度（上市日、今天、到期日）
  const xLabels = [
    { x: PL, label: '上市' },
    { x: PL + todayX, label: '今' },
    { x: PL + cW, label: '到期' },
  ];

  const pastDays = totalDays - daysLeft;
  const todayTheta = series[todayIdx]?.theta ?? 0;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[var(--ac-text-secondary)] font-sans tracking-widest uppercase">
          Theta 衰减曲线（{isEth ? 'Ξ ETH' : '$ USD'}/天）
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-sans" style={{ color: '#fb7185' }}>
            已过 {pastDays}天 · 剩余 {daysLeft}天
          </span>
          {/* 单位切换按钮 */}
          <div className="flex rounded overflow-hidden border border-[var(--ac-border)]/60 text-[9px] font-mono">
            <button
              onClick={() => setUnit('usd')}
              className="px-1.5 py-0.5 transition-colors"
              style={{
                background: !isEth ? 'rgba(251,191,36,0.18)' : 'transparent',
                color: !isEth ? '#fbbf24' : 'rgba(255,255,255,0.35)',
              }}
            >$ USD</button>
            <button
              onClick={() => setUnit('eth')}
              className="px-1.5 py-0.5 border-l border-[var(--ac-border)]/60 transition-colors"
              style={{
                background: isEth ? 'rgba(96,165,250,0.18)' : 'transparent',
                color: isEth ? '#60a5fa' : 'rgba(255,255,255,0.35)',
              }}
            >Ξ ETH</button>
          </div>
        </div>
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
        {/* 今日 Theta 数值标注 */}
        {todayTheta > 0 && (
          <text x={PL + todayX + 4} y={toY(todayTheta) - 3} fontSize="8" fill="#fbbf24" fontFamily="monospace">
            {fmtTheta(todayTheta)}
          </text>
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
  const W = 280, H = 160, PL = 32, PR = 8, PT = 16, PB = 24;
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

// ─── Greeks 迷你走势图（嵌入 Greeks 网格按钮内）────────────────────────
// 一次性拉取所有 Greeks 历史数据，供 6 个迷你图共享
type MiniSeriesMap = Partial<Record<GreekKey, number[]>>;

function useGreeksMiniData(instrumentName: string, strike: number, expireDate: string, optionType: 'C' | 'P') {
  const [seriesMap, setSeriesMap] = useState<MiniSeriesMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!instrumentName) return;
    const ws = new WebSocket('wss://www.deribit.com/ws/api/v2');
    const results: Record<number, { ticks: number[]; close: number[] }> = {};
    ws.onopen = () => {
      const now = Date.now();
      const start = now - 60 * 24 * 3600 * 1000; // 最近 60 天
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 9901,
        method: 'public/get_tradingview_chart_data',
        params: { instrument_name: instrumentName, start_timestamp: start, end_timestamp: now, resolution: '1D' }
      }));
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 9902,
        method: 'public/get_tradingview_chart_data',
        params: { instrument_name: 'ETH-PERPETUAL', start_timestamp: start, end_timestamp: now, resolution: '1D' }
      }));
    };
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.id === 9901 || d.id === 9902) {
          results[d.id] = d.result || {};
          if (results[9901] && results[9902]) {
            const opt = results[9901]; const eth = results[9902];
            const expireMs = new Date(expireDate).getTime();
            const K = strike;
            const toMs = (t: number) => t < 10_000_000_000 ? t * 1000 : t;
            const ethMap = new Map<number, number>();
            (eth.ticks || []).forEach((t: number, i: number) => ethMap.set(toMs(t), (eth.close || [])[i]));
            const isPutOpt = optionType === 'P';
            const map: MiniSeriesMap = { iv: [], delta: [], gamma: [], theta: [], vega: [], rho: [] };
            (opt.ticks || []).forEach((t: number, i: number) => {
              const tMs = toMs(t);
              const S = ethMap.get(tMs) ?? 0;
              if (S <= 0) return;
              const optPriceUsd = ((opt.close || [])[i] ?? 0) * S;
              const T = Math.max(0.001, (expireMs - tMs) / (365 * 24 * 3600 * 1000));
              const sigma = isPutOpt ? impliedVolPut(optPriceUsd, S, K, T) : impliedVol(optPriceUsd, S, K, T);
              if (!sigma) return;
              const sqrtT = Math.sqrt(T);
              const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
              const d2v = d1 - sigma * sqrtT;
              const nd1 = normCdf(d1);
              const phi_d1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
              map.iv!.push(sigma * 100);
              map.delta!.push(isPutOpt ? nd1 - 1 : nd1);
              map.gamma!.push(phi_d1 / (S * sigma * sqrtT));
              map.theta!.push(-(S * phi_d1 * sigma) / (2 * sqrtT) / 365);
              map.vega!.push(S * phi_d1 * sqrtT / 100);
              map.rho!.push(isPutOpt ? -K * T * normCdf(-d2v) / 100 : K * T * normCdf(d2v) / 100);
            });
            setSeriesMap(map);
            setLoaded(true);
            ws.close();
          }
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => { setLoaded(true); };
    return () => { try { ws.close(); } catch { /* ignore */ } };
  }, [instrumentName, strike, expireDate, optionType]);

  return { seriesMap, loaded };
}

/** 极小的 SVG 折线迷你图，宽 44px × 高 14px */
function GreeksMiniChart({ values, color }: { values: number[]; color: string }) {
  if (!values || values.length < 2) return <div className="h-3.5" />;
  const W2 = 44, H2 = 14;
  const minV = Math.min(...values), maxV = Math.max(...values);
  const range = maxV - minV || 1;
  const toX2 = (i: number) => (i / (values.length - 1)) * W2;
  const toY2 = (v: number) => H2 - ((v - minV) / range) * (H2 - 1) - 0.5;
  const pts = values.map((v, i) => `${toX2(i).toFixed(1)},${toY2(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const trend = last >= prev ? 1 : -1;
  const dotColor = trend >= 0 ? '#4ade80' : '#f87171';
  return (
    <svg width={W2} height={H2} viewBox={`0 0 ${W2} ${H2}`} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1" strokeOpacity="0.7"
        strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={toX2(values.length - 1).toFixed(1)} cy={toY2(last).toFixed(1)} r="1.5" fill={dotColor} />
    </svg>
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
  // 内在价値（ETH单位）= max(0, 内在价値USD) / ethPrice
  // CALL内在价値USD = max(0, ethPrice - strike)
  // PUT内在价値USD = max(0, strike - ethPrice)
  const intrinsicEth = ethPrice > 0 && cell.markUsd !== null
    ? Math.max(0, optionType === 'C' ? (ethPrice - strike) : (strike - ethPrice)) / ethPrice
    : null;
  const markEth = cell.markUsd;
  // 时间价値 = 权利金 - 内在价値，两者之和正好等于权利金
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
              {optionType === 'C' ? 'CALL' : 'PUT'} · 行权价 ${strike.toLocaleString()} · {expiry.year}年{parseInt(expiry.expireDate.slice(5,7))}月{parseInt(expiry.expireDate.slice(8,10))}日到期
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
          {/* 当前状态：两行布局 */}
          {/* 第一行：生命周期三格 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-2">
              <div className="text-[10px] text-[var(--ac-text-secondary)] font-sans">总天数</div>
              <div className="text-[var(--ac-text-primary)] font-bold text-sm">{totalDays}D</div>
            </div>
            <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-2">
              <div className="text-[10px] text-[var(--ac-text-secondary)] font-sans">已过</div>
              <div className="text-[var(--ac-text-primary)] font-bold text-sm">{consumedDays}D</div>
            </div>
            <div className="bg-[var(--ac-bg-cell-empty)]/80 rounded px-2 py-2">
              <div className="text-[10px] text-[var(--ac-text-secondary)] font-sans">剩余</div>
              <div className="text-white font-bold text-sm">{daysLeft}D</div>
            </div>
          </div>
          {/* 生命周期进度条 */}
          {totalDays > 0 && (
            <div>
              <div className="relative h-4 rounded overflow-hidden bg-[var(--ac-bg-cell-empty)]">
                {/* 已过部分 */}
                <div
                  className="absolute left-0 top-0 h-full"
                  style={{
                    width: `${Math.min((consumedDays / totalDays) * 100, 100)}%`,
                    background: daysLeft < 30
                      ? 'linear-gradient(90deg, #374151, #6b7280)'
                      : 'linear-gradient(90deg, #1e3a5f, #2563eb44)'
                  }}
                />
                {/* 剩余部分 */}
                <div
                  className="absolute top-0 h-full"
                  style={{
                    left: `${Math.min((consumedDays / totalDays) * 100, 100)}%`,
                    width: `${Math.max((daysLeft / totalDays) * 100, 0)}%`,
                    background: daysLeft < 30
                      ? 'linear-gradient(90deg, #f43f5e, #fb923c)'
                      : daysLeft < 60
                      ? 'linear-gradient(90deg, #fb7185, #fda4af)'
                      : 'linear-gradient(90deg, #22d3ee55, #06b6d4aa)'
                  }}
                />
                {/* 当前位置分割线 */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-white/70"
                  style={{ left: `${Math.min((consumedDays / totalDays) * 100, 100)}%` }}
                />
                {/* 当前位置小三角指针 */}
                <div
                  className="absolute top-0 h-full flex items-center justify-center"
                  style={{ left: `calc(${Math.min((consumedDays / totalDays) * 100, 100)}% - 5px)`, width: 10 }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <polygon points="4,1 7,7 1,7" fill="white" opacity="0.9"/>
                  </svg>
                </div>
              </div>
            </div>
          )}
          {/* 第二行：价值两格 */}
          <div className="grid grid-cols-2 gap-2">
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
                {/* 当前位置小三角指针 */}
                <div
                  className="absolute top-0 h-full flex items-center justify-center"
                  style={{ left: `calc(${(1 - tvRatioNow) * 100}% - 5px)`, width: 10 }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <polygon points="4,1 7,7 1,7" fill="white" opacity="0.9"/>
                  </svg>
                </div>
              </div>
              {/* 堆叠进度条：内在价值 + 时间价值 = 总价値 */}
              {(() => {
                const intrinsicUsd = intrinsicEth !== null && ethPrice > 0 ? intrinsicEth * ethPrice : 0;
                const totalUsd = markEth !== null && ethPrice > 0 ? markEth * ethPrice : null;
                const tvUsd = timeValueUsd ?? 0;
                const maxVal = totalUsd && totalUsd > 0 ? totalUsd : 1;
                const intrinsicPct = Math.min((intrinsicUsd / maxVal) * 100, 100);
                const tvPct = Math.min((tvUsd / maxVal) * 100, 100 - intrinsicPct);
                return (
                  <div className="mt-2">
                    {/* 标签行 */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-sm" style={{ background: '#64748b' }} />
                          <span className="text-[9px] text-[var(--ac-text-muted)] font-sans">内在 ${intrinsicUsd.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-sm" style={{ background: '#fb7185' }} />
                          <span className="text-[9px] text-[var(--ac-text-muted)] font-sans">时间 ${tvUsd.toFixed(1)}</span>
                        </div>
                      </div>
                      <span className="text-[9px] text-[var(--ac-text-secondary)] font-sans">总 ${totalUsd !== null ? totalUsd.toFixed(1) : '—'}</span>
                    </div>
                    {/* 堆叠条 */}
                    <div className="relative h-4 rounded overflow-hidden bg-[var(--ac-bg-cell-empty)]">
                      {/* 内在价值段：深灰蓝 */}
                      <div
                        className="absolute left-0 top-0 h-full"
                        style={{
                          width: `${intrinsicPct}%`,
                          background: 'linear-gradient(90deg, #1e293b, #64748b)',
                          transition: 'width 0.4s cubic-bezier(0.23,1,0.32,1)'
                        }}
                      />
                      {/* 时间价値段：玫瑰红 */}
                      <div
                        className="absolute top-0 h-full"
                        style={{
                          left: `${intrinsicPct}%`,
                          width: `${tvPct}%`,
                          background: 'linear-gradient(90deg, #fb7185, #fda4af)',
                          transition: 'left 0.4s cubic-bezier(0.23,1,0.32,1), width 0.4s cubic-bezier(0.23,1,0.32,1)'
                        }}
                      />
                      {/* 内在/时间分界线 */}
                      {intrinsicPct > 0 && intrinsicPct < 100 && (
                        <div className="absolute top-0 h-full w-px bg-white/50" style={{ left: `${intrinsicPct}%` }} />
                      )}
                      {/* 小三角指针（时间价値结束处） */}
                      <div
                        className="absolute top-0 h-full flex items-center justify-center"
                        style={{ left: `calc(${intrinsicPct + tvPct}% - 5px)`, width: 10 }}
                      >
                        <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                          <polygon points="4,1 7,7 1,7" fill="white" opacity="0.85"/>
                        </svg>
                      </div>
                      {/* 百分比标注 */}
                      <div className="absolute inset-0 flex items-center px-1.5 gap-1 pointer-events-none">
                        {intrinsicPct > 8 && (
                          <span className="text-[8px] text-white/70 font-sans" style={{ width: `${intrinsicPct}%`, textAlign: 'center' }}>
                            {intrinsicPct.toFixed(0)}%
                          </span>
                        )}
                        {tvPct > 8 && (
                          <span className="text-[8px] text-white/80 font-sans" style={{ width: `${tvPct}%`, textAlign: 'center' }}>
                            {tvPct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
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
          {/* Delta 中性对冲 */}
          {cell.delta !== null && (
            <div className="pt-2 border-t border-[var(--ac-border)]/20">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[var(--ac-text-secondary)] font-sans tracking-wide">Δ 中性对冲</span>
                <span className="text-[10px] text-[var(--ac-text-muted)] font-sans">卖出 1 手期权</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* 对冲数量 */}
                <div className="bg-[var(--ac-bg-cell-empty)] rounded px-2.5 py-2">
                  <div className="text-[9px] text-[var(--ac-text-muted)] font-sans mb-0.5">需买入 ETH</div>
                  <div className="text-sm font-semibold font-sans" style={{ color: '#60a5fa' }}>
                    {Math.abs(cell.delta).toFixed(4)}
                    <span className="text-[10px] text-[var(--ac-text-muted)] ml-1">ETH</span>
                  </div>
                  <div className="text-[9px] text-[var(--ac-text-muted)] font-sans mt-0.5">
                    ≈ ${(Math.abs(cell.delta) * ethPrice).toFixed(0)} USD
                  </div>
                </div>
                {/* Delta 值与方向 */}
                <div className="bg-[var(--ac-bg-cell-empty)] rounded px-2.5 py-2">
                  <div className="text-[9px] text-[var(--ac-text-muted)] font-sans mb-0.5">当前 Delta</div>
                  <div className="text-sm font-semibold font-sans" style={{ color: cell.delta > 0 ? '#34d399' : '#f87171' }}>
                    {cell.delta > 0 ? '+' : ''}{cell.delta.toFixed(4)}
                  </div>
                  <div className="text-[9px] font-sans mt-0.5" style={{ color: cell.delta > 0 ? '#34d399' : '#f87171' }}>
                    {optionType === 'C'
                      ? (cell.delta >= 0.5 ? '深度实值' : cell.delta >= 0.3 ? '轻度实值' : cell.delta >= 0.1 ? '虚值' : '深度虚值')
                      : (cell.delta <= -0.5 ? '深度实值' : cell.delta <= -0.3 ? '轻度实值' : cell.delta <= -0.1 ? '虚值' : '深度虚值')
                    }
                  </div>
                </div>
              </div>
              <div className="text-[9px] text-[var(--ac-text-muted)] font-sans mt-1.5">
                对冲后持仓 Delta ≈ 0 · ETH 现价 ${ethPrice.toFixed(0)} · 随价格变动需动态调整
              </div>
            </div>
          )}
          {/* Gamma 对冲频率 */}
          {cell.gamma !== null && cell.gamma !== 0 && (() => {
            // Deribit gamma 单位：每 1 ETH 价格变动时的 delta 变化量
            // ETH 涨跌 1% 时 delta 变化 = gamma × (ethPrice × 0.01)
            const gammaDeltaChange = Math.abs(cell.gamma) * ethPrice * 0.01;
            const gammaDeltaUsd = gammaDeltaChange * ethPrice;
            // Gamma 强度分级
            const gammaLevel = gammaDeltaChange > 0.05 ? 'high' : gammaDeltaChange > 0.02 ? 'mid' : 'low';
            const gammaColor = gammaLevel === 'high' ? '#f87171' : gammaLevel === 'mid' ? '#fbbf24' : '#34d399';
            const gammaLabel = gammaLevel === 'high' ? '高频调仓' : gammaLevel === 'mid' ? '中频调仓' : '低频调仓';
            return (
              <div className="pt-2 border-t border-[var(--ac-border)]/20">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[var(--ac-text-secondary)] font-sans tracking-wide">Γ 动态对冲频率</span>
                  <span className="text-[10px] font-sans" style={{ color: gammaColor }}>{gammaLabel}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {/* 每 1% 需调整 ETH */}
                  <div className="bg-[var(--ac-bg-cell-empty)] rounded px-2.5 py-2">
                    <div className="text-[9px] text-[var(--ac-text-muted)] font-sans mb-0.5">每涨跌 1% 调整</div>
                    <div className="text-sm font-semibold font-sans" style={{ color: gammaColor }}>
                      {gammaDeltaChange.toFixed(4)}
                      <span className="text-[10px] text-[var(--ac-text-muted)] ml-1">ETH</span>
                    </div>
                    <div className="text-[9px] text-[var(--ac-text-muted)] font-sans mt-0.5">
                      ≈ ${gammaDeltaUsd.toFixed(0)} USD
                    </div>
                  </div>
                  {/* Gamma 原始值 */}
                  <div className="bg-[var(--ac-bg-cell-empty)] rounded px-2.5 py-2">
                    <div className="text-[9px] text-[var(--ac-text-muted)] font-sans mb-0.5">Gamma 值</div>
                    <div className="text-sm font-semibold font-sans" style={{ color: gammaColor }}>
                      {cell.gamma.toFixed(6)}
                    </div>
                    <div className="text-[9px] text-[var(--ac-text-muted)] font-sans mt-0.5">
                      Δ/ETH 变动
                    </div>
                  </div>
                </div>
                <div className="text-[9px] text-[var(--ac-text-muted)] font-sans mt-1.5">
                  Gamma 越大对冲频率越高 · 调仓产生滑点与手续费 · 近 ATM 及临近到期时 Gamma 最大
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── 详情弹窗 ──────────────────────────────────────────────────
function DetailModal({ cell, onClose, optionType, onSwitchType, allStrikes, onStrikeChange, allExpiries, onExpiryChange }: {
  cell: DetailCell;
  onClose: () => void;
  optionType: 'C' | 'P';
  onSwitchType?: () => void;
  allStrikes?: number[];
  onStrikeChange?: (newStrike: number) => void;
  allExpiries?: ExpiryConfig[];
  onExpiryChange?: (newExpiry: ExpiryConfig) => void;
}) {
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

  // Greeks 迷你走势图数据（一次性拉取，共享给 6 个按钮）
  const { seriesMap: miniSeries } = useGreeksMiniData(
    data.instrumentName, strike, expiry.expireDate, optionType
  );

  // 切换行权价 / 到期日时的淡入淡出动画
  const [fadeIn, setFadeIn] = useState(true);
  const prevCellKey = useRef(`${strike}-${expiry.code}`);
  useEffect(() => {
    const key = `${strike}-${expiry.code}`;
    if (key !== prevCellKey.current) {
      prevCellKey.current = key;
      setFadeIn(false);
      const t = setTimeout(() => setFadeIn(true), 80);
      return () => clearTimeout(t);
    }
  }, [strike, expiry.code]);

  // ── 派生指标 ──
  const markUsdDollar = data.markUsd !== null && ethPrice > 0 ? data.markUsd * ethPrice : null;
  // λ Lambda = delta × (ETH现价 / 标记价USD)
  const lambda = data.delta !== null && markUsdDollar !== null && markUsdDollar > 0
    ? data.delta * (ethPrice / markUsdDollar) : null;
  // Break-even = 行权价 ± 标记价USD
  const breakEven = markUsdDollar !== null
    ? (optionType === 'C' ? strike + markUsdDollar : strike - markUsdDollar) : null;
  // Theta/日 USD（Deribit API 返回的是年化值，除以365得日化，再×ETH现价得USD/天）
  const thetaDaily = data.theta !== null ? data.theta / 365 : null; // Deribit theta 已是日化値，不需除 365
  const thetaUsd = thetaDaily !== null && ethPrice > 0 ? thetaDaily * ethPrice : null;
  // Vega/1%IV USD（Deribit Vega 已是 IV 变动 1% 的敏感度，×ETH现价得USD）
  const vegaUsd = data.vega !== null && ethPrice > 0 ? data.vega * ethPrice : null;
  // 权利金占行权价比例
  const premiumRatio = markUsdDollar !== null && strike > 0
    ? (markUsdDollar / strike) * 100 : null;

  // ── 时间进度 ──
  const _listingDate = estimateListingDate(expiry.expireDate, daysLeft);
  const _expireMs = new Date(`${expiry.expireDate}T08:00:00Z`).getTime();
  const _totalDays = Math.round((_expireMs - _listingDate.getTime()) / 86400000);
  const _consumedDays = Math.max(0, _totalDays - daysLeft);
  const _elapsedPct = _totalDays > 0 ? Math.min(100, (_consumedDays / _totalDays) * 100) : 0;
  const _remainPct = _totalDays > 0 ? Math.max(0, (daysLeft / _totalDays) * 100) : 0;

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

        {/* 内容区域淡入淡出动画包裹层 */}
        <div style={{ opacity: fadeIn ? 1 : 0, transition: fadeIn ? 'opacity 160ms cubic-bezier(0.23,1,0.32,1)' : 'none' }}>

        {/* ── 顶部 Header：合约身份 + 关键快览 ── */}
        <div className="border-b border-[var(--ac-border-subtle)]">
          {/* 第一行：合约名 + 关闭按钮 */}
          <div className="flex items-start justify-between px-4 pt-3 pb-1">
            <div className="flex-1 min-w-0">
              {/* 合约全名（最显眼） */}
              <div className="text-[length:var(--ac-fs-xs)] font-mono text-[var(--ac-text-muted)] tracking-wider truncate mb-0.5">
                {data.instrumentName || '—'}
              </div>
              {/* 行权价 + 类型 + 到期 */}
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-white font-bold font-sans" style={{ fontSize: 'clamp(17px,4.5vw,22px)' }}>
                  ${strike.toLocaleString()}
                </span>
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded font-sans"
                  style={{
                    background: optionType === 'C' ? 'rgba(52,211,153,0.15)' : 'rgba(251,113,133,0.15)',
                    color: optionType === 'C' ? '#34D399' : '#FB7185',
                    border: `1px solid ${optionType === 'C' ? 'rgba(52,211,153,0.4)' : 'rgba(251,113,133,0.4)'}`,
                  }}
                >
                  {optionType === 'C' ? 'CALL' : 'PUT'}
                </span>
                <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans">
                  {expiry.year}年{parseInt(expiry.expireDate.slice(5,7))}月{parseInt(expiry.expireDate.slice(8,10))}日
                </span>
                <span className="text-[length:var(--ac-fs-xs)] font-mono px-1 py-0.5 rounded bg-[var(--ac-bg-cell-empty)] text-amber-400 border border-amber-500/30">
                  {daysLeft}D
                </span>
                {daysLeft < 30 && (
                  <span className="text-[length:var(--ac-fs-xs)] font-sans px-1 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-500/30">⚡临期</span>
                )}
              </div>
              {/* ── 时间进度条 ── */}
              {_totalDays > 0 && (
                <div className="mt-2 mb-0.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-sans text-[var(--ac-text-muted)]">上市</span>
                    <span className="text-[9px] font-sans text-[var(--ac-text-muted)]">
                      已流失&nbsp;<span className={`font-semibold ${_elapsedPct >= 80 ? "text-red-400" : _elapsedPct >= 50 ? "text-amber-400" : "text-emerald-400"}`}>{_elapsedPct.toFixed(1)}%</span>
                      &nbsp;·&nbsp;剩余&nbsp;<span className="text-[var(--ac-text-secondary)]">{daysLeft}D</span>
                    </span>
                    <span className="text-[9px] font-sans text-[var(--ac-text-muted)]">到期</span>
                  </div>
                  <div className="relative h-2 rounded-full overflow-hidden bg-[var(--ac-bg-cell-empty)]">
                    <div
                      className="absolute left-0 top-0 h-full"
                      style={{
                        width: `${_elapsedPct}%`,
                        background: _elapsedPct >= 80
                          ? "linear-gradient(90deg,#374151,#6b7280)"
                          : "linear-gradient(90deg,#1e3a5f,#3b82f6aa)",
                      }}
                    />
                    <div
                      className="absolute top-0 h-full"
                      style={{
                        left: `${_elapsedPct}%`,
                        width: `${_remainPct}%`,
                        background: _elapsedPct >= 80
                          ? "linear-gradient(90deg,#ef4444aa,#ef4444)"
                          : daysLeft <= 30
                            ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
                            : "linear-gradient(90deg,#10b981,#34d399)",
                      }}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-white/70"
                      style={{ left: `${_elapsedPct}%`, transform: "translateX(-50%)" }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              {/* 左右到期日切换 */}
              {allExpiries && allExpiries.length > 1 && onExpiryChange && (() => {
                const idx = allExpiries.findIndex(e => e.code === expiry.code);
                const prevExpiry = idx > 0 ? allExpiries[idx - 1] : null;
                const nextExpiry = idx < allExpiries.length - 1 ? allExpiries[idx + 1] : null;
                return (
                  <div className="flex items-center rounded overflow-hidden border border-[var(--ac-border)]/60">
                    <button
                      onClick={() => prevExpiry && onExpiryChange(prevExpiry)}
                      disabled={prevExpiry === null}
                      className="w-6 h-6 flex items-center justify-center text-[var(--ac-text-secondary)] hover:text-white hover:bg-[var(--ac-bg-cell-empty)] disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
                      title={prevExpiry ? `上一到期日 ${prevExpiry.label}` : undefined}
                    >←</button>
                    <span className="px-1 text-[10px] font-mono text-[var(--ac-text-muted)] border-l border-r border-[var(--ac-border)]/60 leading-6 select-none">
                      {idx + 1}/{allExpiries.length}
                    </span>
                    <button
                      onClick={() => nextExpiry && onExpiryChange(nextExpiry)}
                      disabled={nextExpiry === null}
                      className="w-6 h-6 flex items-center justify-center text-[var(--ac-text-secondary)] hover:text-white hover:bg-[var(--ac-bg-cell-empty)] disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
                      title={nextExpiry ? `下一到期日 ${nextExpiry.label}` : undefined}
                    >→</button>
                  </div>
                );
              })()}
              {/* 上下行权价切换 */}
              {allStrikes && allStrikes.length > 1 && onStrikeChange && (() => {
                const idx = allStrikes.indexOf(strike);
                const prevStrike = idx > 0 ? allStrikes[idx - 1] : null;
                const nextStrike = idx < allStrikes.length - 1 ? allStrikes[idx + 1] : null;
                return (
                  <div className="flex rounded overflow-hidden border border-[var(--ac-border)]/60">
                    <button
                      onClick={() => prevStrike !== null && onStrikeChange(prevStrike)}
                      disabled={prevStrike === null}
                      className="w-6 h-6 flex items-center justify-center text-[var(--ac-text-secondary)] hover:text-white hover:bg-[var(--ac-bg-cell-empty)] disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
                      title={prevStrike !== null ? `上一档 $${prevStrike.toLocaleString()}` : undefined}
                    >↑</button>
                    <button
                      onClick={() => nextStrike !== null && onStrikeChange(nextStrike)}
                      disabled={nextStrike === null}
                      className="w-6 h-6 flex items-center justify-center text-[var(--ac-text-secondary)] hover:text-white hover:bg-[var(--ac-bg-cell-empty)] disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors border-l border-[var(--ac-border)]/60"
                      title={nextStrike !== null ? `下一档 $${nextStrike.toLocaleString()}` : undefined}
                    >↓</button>
                  </div>
                );
              })()}
              {/* C/P 切换 */}
              {onSwitchType && (
                <button
                  onClick={onSwitchType}
                  className="flex items-center gap-0.5 px-2 py-1 rounded text-[length:var(--ac-fs-xs)] font-bold font-sans transition-colors duration-150 border"
                  style={{
                    background: optionType === 'C' ? 'rgba(251,113,133,0.12)' : 'rgba(52,211,153,0.12)',
                    color: optionType === 'C' ? '#FB7185' : '#34D399',
                    borderColor: optionType === 'C' ? 'rgba(251,113,133,0.35)' : 'rgba(52,211,153,0.35)',
                  }}
                  title={`切换到 ${optionType === 'C' ? 'PUT' : 'CALL'}`}
                >
                  ⇄ {optionType === 'C' ? 'PUT' : 'CALL'}
                </button>
              )}
              <button onClick={onClose} className="text-[var(--ac-text-secondary)] hover:text-white w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--ac-bg-cell-empty)] text-base leading-none">×</button>
            </div>
          </div>

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
            {/* 持仓量 / 24h成交量 / 盈亏平衡 */}
            <div className="grid grid-cols-3 divide-x divide-[var(--ac-border)]/40 border-t border-[var(--ac-border)]/60">
              <div className="px-3 py-2 text-center">
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans mb-0.5">持仓量 OI</div>
                <div className="text-[var(--ac-text-primary)] font-mono font-semibold" style={{ fontSize: 'clamp(10px,2.8vw,13px)' }}>
                  {data.openInterest !== null ? data.openInterest.toLocaleString() : '—'}
                </div>
              </div>
              <div className="px-3 py-2 text-center">
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans mb-0.5">24h 成交量</div>
                <div className="text-[var(--ac-text-primary)] font-mono font-semibold" style={{ fontSize: 'clamp(10px,2.8vw,13px)' }}>
                  {data.volume !== null ? data.volume.toLocaleString() : '—'}
                </div>
              </div>
              <div className="px-3 py-2 text-center">
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans mb-0.5">盈亏平衡</div>
                <div className="text-amber-300 font-mono font-semibold" style={{ fontSize: 'clamp(10px,2.8vw,13px)' }}>
                  {breakEven !== null ? `$${breakEven.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
                </div>
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
                {miniSeries.iv && <GreeksMiniChart values={miniSeries.iv} color="#22d3ee" />}
              </button>
              {/* 2. Delta */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'delta' ? 'bg-blue-900/40 ring-1 ring-blue-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('delta')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">δ Delta</div>
                <div className="text-blue-400 font-sans font-medium text-xs">{fmt(data.delta, 4)}</div>
                {miniSeries.delta && <GreeksMiniChart values={miniSeries.delta} color="#60a5fa" />}
              </button>
              {/* 3. Gamma */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'gamma' ? 'bg-violet-900/40 ring-1 ring-violet-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('gamma')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">γ Gamma</div>
                <div className="text-violet-400 font-sans font-medium text-xs">{data.gamma !== null ? data.gamma.toFixed(6) : '—'}</div>
                {miniSeries.gamma && <GreeksMiniChart values={miniSeries.gamma} color="#a78bfa" />}
              </button>
              {/* 4. Theta */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'theta' ? 'bg-rose-900/40 ring-1 ring-rose-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('theta')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">θ Theta</div>
                <div className="text-rose-400 font-sans font-medium text-xs">{thetaDaily !== null ? thetaDaily.toFixed(6) : '—'}</div>
                {miniSeries.theta && <GreeksMiniChart values={miniSeries.theta.map(v => Math.abs(v))} color="#fb7185" />}
              </button>
              {/* 5. Vega */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'vega' ? 'bg-emerald-900/40 ring-1 ring-emerald-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('vega')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">ν Vega</div>
                <div className="text-emerald-400 font-sans font-medium text-xs">{data.vega !== null ? data.vega.toFixed(6) : '—'}</div>
                {miniSeries.vega && <GreeksMiniChart values={miniSeries.vega} color="#34d399" />}
              </button>
              {/* 6. Rho */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'rho' ? 'bg-amber-900/40 ring-1 ring-amber-500/40' : 'hover:bg-[var(--ac-border-subtle)]/40' }`}
                onClick={() => toggleMetric('rho')}
              >
                <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">ρ Rho</div>
                <div className="text-amber-400 font-sans font-medium text-xs">{data.rho !== null ? data.rho.toFixed(5) : '—'}</div>
                {miniSeries.rho && <GreeksMiniChart values={miniSeries.rho} color="#fbbf24" />}
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

          {/* ===== 价值分解曲线图 ===== */}
          {data.iv !== null && ethPrice > 0 && data.markUsd !== null && (() => {
            const markUsdDollarVal = data.markUsd * ethPrice;
            return (
              <div className="bg-[var(--ac-bg-cell-empty)] rounded-[1.5px] border border-[var(--ac-border)] overflow-hidden">
                <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-[var(--ac-border)]/40">
                  <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans tracking-widest uppercase">价值分解</span>
                  <div className="flex items-center gap-3 text-[length:var(--ac-fs-xs)] font-sans">
                    <span style={{ color: '#60a5fa' }}>
                      内在 ${Math.max(0, optionType === 'C' ? ethPrice - strike : strike - ethPrice).toFixed(0)}
                    </span>
                    <span style={{ color: '#fb923c' }}>
                      时间 ${Math.max(0, markUsdDollarVal - Math.max(0, optionType === 'C' ? ethPrice - strike : strike - ethPrice)).toFixed(0)}
                    </span>
                  </div>
                </div>
                <div className="px-2 pb-2">
                  <ValueDecompositionChart
                    instrumentName={data.instrumentName}
                    expireDate={expiry.expireDate}
                    strike={strike}
                    isCall={optionType === 'C'}
                    iv={data.iv}
                    ethPrice={ethPrice}
                    daysLeft={daysLeft}
                    markUsd={markUsdDollarVal}
                  />
                </div>
              </div>
            );
          })()}

          {markUsdDollar !== null && (
            <div className="bg-[var(--ac-bg-cell-empty)] rounded-[1.5px] border border-[var(--ac-border)] overflow-hidden">
              <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-[var(--ac-border)]/40">
                <span className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans tracking-widest uppercase">四方向到期损益对比</span>
                <span className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-muted)] font-sans">买卖 × CALL/PUT | 上方 = 盈利</span>
              </div>
              <PayoffChart
                strike={strike}
                premium={markUsdDollar}
                ethPrice={ethPrice}
                optionType={optionType}
              />
            </div>
          )}

          {/* ===== Theta 衰减曲线 ===== */}
          {data.iv !== null && ethPrice > 0 && (() => {
            const totalDays = (() => {
              const candidates = [30, 60, 90, 120, 180, 270, 365, 450, 540];
              return candidates.find(c => c >= daysLeft) ?? daysLeft;
            })();
            return (
              <div className="bg-[var(--ac-bg-cell-empty)] rounded-[1.5px] border border-[var(--ac-border)] overflow-hidden">
                <div className="px-3 pt-2 pb-0.5">
                  <ThetaDecayCurve
                    strike={strike}
                    expireDate={expiry.expireDate}
                    iv={data.iv}
                    ethPrice={ethPrice}
                    daysLeft={daysLeft}
                    totalDays={totalDays}
                    isCall={optionType === 'C'}
                  />
                </div>
              </div>
            );
          })()}

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
        </div>{/* /fade wrapper */}
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
  optionType: 'C' | 'P',
  _refreshKey?: number
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
  }, [expiryCode, optionType, _refreshKey]);

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
import { saveProductPref } from "@/App";

const LS_KEY = 'eth-ann-matrix-cache-v2';
const LS_KEY_IVR = 'eth-ann-ivr-cache-v1';
const LS_KEY_PREFS = 'eth-ann-filter-prefs-v1';

interface FilterPrefs {
  selectedMatrixExpiries: string[];
  activeDims: string[];
  viewMode?: 'matrix' | 'byStrike' | 'byExpiry';
  optionType?: 'C' | 'P';
  payoffDisplayMode?: 'usd' | 'pct';
}
function loadFilterPrefs(): FilterPrefs | null {
  try {
    const raw = localStorage.getItem(LS_KEY_PREFS);
    if (!raw) return null;
    return JSON.parse(raw) as FilterPrefs;
  } catch { return null; }
}
function saveFilterPrefs(prefs: FilterPrefs) {
  try { localStorage.setItem(LS_KEY_PREFS, JSON.stringify(prefs)); } catch { /* ignore */ }
}

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
  // 提前加载偏好，为后续多个 state 初始化提供数据
  const _earlyPrefs = loadFilterPrefs();
  const [optionType, setOptionType] = useState<'C' | 'P'>(_earlyPrefs?.optionType ?? 'C');
  // 下拉刷新：通过递增 refreshKey 触发 useExpiryWs 重连
  const [refreshKey, setRefreshKey] = useState(0);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showProductMenu, setShowProductMenu] = useState(false);

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
  // 矩阵视图已选中的到期日（默认最近4个，优先从 localStorage 恢复）
  const _savedPrefs = loadFilterPrefs();
  // 三视图切换——优先从 localStorage 恢复
  const [viewMode, setViewMode] = useState<'matrix' | 'byStrike' | 'byExpiry'>(
    _savedPrefs?.viewMode ?? 'matrix'
  );
  const [selectedMatrixExpiries, setSelectedMatrixExpiries] = useState<Set<string>>(
    _savedPrefs?.selectedMatrixExpiries?.length
      ? new Set(_savedPrefs.selectedMatrixExpiries)
      : new Set(DEFAULT_EXPIRIES.slice(-4).map(e => e.code))
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
  // 维度选择器：控制各视图显示哪些字段（优先从 localStorage 恢复）
  const ALL_DIM_KEYS: DimKey[] = ['ann','ivr','theta','delta','iv','oi'];
  const [activeDims, setActiveDims] = useState<Set<DimKey>>(
    _savedPrefs?.activeDims?.length
      ? new Set(_savedPrefs.activeDims.filter((d): d is DimKey => ALL_DIM_KEYS.includes(d as DimKey)))
      : new Set<DimKey>(['ann','ivr','theta','delta','iv','oi'])
  );
  const toggleDim = (d: DimKey) => setActiveDims(prev => {
    const next = new Set(prev);
    if (next.has(d)) { if (next.size > 1) next.delete(d); } // 至少保留1个
    else next.add(d);
    return next;
  });
  // 全量模式下折叠面板：到期日面板 & 指标面板
  const [showExpiryPanel, setShowExpiryPanel] = useState(false);
  const [showDimPanel, setShowDimPanel] = useState(false);
  // 面板向下滑动收起手势
  const panelSwipeStartY = useRef(0);
  const panelSwipeDelta = useRef(0);
  const PANEL_SWIPE_THRESHOLD = 40; // 向下滑动超过 40px 收起
  function makePanelSwipeHandlers(onDismiss: () => void) {
    return {
      onTouchStart: (e: React.TouchEvent) => {
        panelSwipeStartY.current = e.touches[0].clientY;
        panelSwipeDelta.current = 0;
      },
      onTouchMove: (e: React.TouchEvent) => {
        const dy = e.touches[0].clientY - panelSwipeStartY.current;
        panelSwipeDelta.current = dy;
        // 向下滑动时阻止页面滚动
        if (dy > 8) e.stopPropagation();
      },
      onTouchEnd: () => {
        if (panelSwipeDelta.current >= PANEL_SWIPE_THRESHOLD) {
          onDismiss();
        }
        panelSwipeDelta.current = 0;
      },
    };
  }

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
    // 保证金年化 = mark_price(ETH) × ETH现价 / 行权价(USD) / yearsLeft
    // 即：权利金占行权价的比例 ÷ 剩余年数
    // 分母统一为行权价（保证金占用），远月年化低于近月，符合实际投资逻辑
    const annualized = markEth !== null && markEth > 0 && yearsLeft > 0 && ep > 0 && strike > 0
      ? (markEth * ep / strike) / yearsLeft
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

  // 筛选偏好变化时实时写入 localStorage
  useEffect(() => {
    saveFilterPrefs({
      selectedMatrixExpiries: Array.from(selectedMatrixExpiries),
      activeDims: Array.from(activeDims),
      viewMode,
      optionType,
    });
  }, [selectedMatrixExpiries, activeDims, viewMode, optionType]);

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

  // 下拉刷新回调：清空矩阵并重连所有 WebSocket
  const handleRefresh = useCallback(() => {
    setMatrix(new Map());
    setExistMap(new Map());
    setAllStrikes([]);
    setLoadedExpiries(new Set());
    setDetail(null);
    setRefreshKey(k => k + 1);
  }, []);
  const { pullState, pullDistance, progress } = usePullToRefresh({ onRefresh: handleRefresh });
  // 4个独立 WebSocket，每个到期日一个
  const statusA = useExpiryWs("25SEP26", ethPriceRef, onEthPrice, updateCell, onInstrumentsLoaded, optionType, refreshKey);
  const statusB = useExpiryWs("25DEC26", ethPriceRef, null, updateCell, onInstrumentsLoaded, optionType, refreshKey);
  const statusC = useExpiryWs("26MAR27", ethPriceRef, null, updateCell, onInstrumentsLoaded, optionType, refreshKey);
  const statusD = useExpiryWs("25JUN27", ethPriceRef, null, updateCell, onInstrumentsLoaded, optionType, refreshKey);

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
  // 记录用户当前在以太坊页面
  useEffect(() => { saveProductPref('eth'); }, []);
  // 存储所有行权价和到期日的当前数据，供触摸滑动时快速查找
  const matrixDataRef = useRef<{ allStrikes: number[]; matrix: MatrixData; ethPrice: number }>({ allStrikes: [], matrix: new Map(), ethPrice: 0 });

  // ATM 行自动滚动到视口中心
  const atmRowRef = useRef<HTMLTableRowElement | null>(null);
  // 记录上一次自动居中时的 ATM 行权价，用于检测 ATM 切换
  const lastScrolledAtmRef = useRef<number | null>(null);
  // 防抖定时器
  const atmScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 触发条件：所有选中到期日都已完成合约列表加载，且 ATM 已确定 ──
  const allSelectedLoaded = selectedMatrixExpiries.size > 0 &&
    Array.from(selectedMatrixExpiries).every(code => loadedExpiries.has(code));

  useEffect(() => {
    // 必须：数据真正加载完成 + ATM 已确定 + 行元素已挂载
    if (!allSelectedLoaded || atmStrike === null) return;
    // ATM 未变化时不重复滚动
    if (lastScrolledAtmRef.current !== null && lastScrolledAtmRef.current === atmStrike) return;
    if (atmScrollTimerRef.current) clearTimeout(atmScrollTimerRef.current);
    // 数据刚加载完：等待 React 渲染完毕（两帧 + 100ms 余量）
    const delay = lastScrolledAtmRef.current === null ? 150 : 1500;
    atmScrollTimerRef.current = setTimeout(() => {
      if (!atmRowRef.current) return;
      lastScrolledAtmRef.current = atmStrike;
      const rect = atmRowRef.current.getBoundingClientRect();
      const rowCenter = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      const scrollTarget = window.scrollY + rowCenter - viewportCenter;
      window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    }, delay);
    return () => {
      if (atmScrollTimerRef.current) clearTimeout(atmScrollTimerRef.current);
    };
  }, [allSelectedLoaded, atmStrike]);

  // 切换 CALL/PUT 或下拉刷新时重置，下次加载完成后重新定位
  useEffect(() => {
    lastScrolledAtmRef.current = null;
  }, [optionType, refreshKey]);

  // ATM 行是否远离视口（超过半屏高度），用于触发悬浮按鈕脉冲动画
  const [atmFar, setAtmFar] = useState(false);
  useEffect(() => {
    if (viewMode !== 'matrix') { setAtmFar(false); return; }
    const THRESHOLD = window.innerHeight * 0.5;
    const check = () => {
      if (!atmRowRef.current) { setAtmFar(false); return; }
      const rect = atmRowRef.current.getBoundingClientRect();
      const rowCenter = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      setAtmFar(Math.abs(rowCenter - viewportCenter) > THRESHOLD);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [viewMode, atmStrike]);

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
            {/* 品种切换下拉：ETH / A股 */}
            <div className="relative">
              <button
                className="flex items-center gap-0.5 text-[length:var(--ac-fs-md)] font-sans font-semibold text-[var(--ac-text-primary)] tracking-widest hover:text-[var(--ac-text-bright)] transition-colors"
                onClick={() => setShowProductMenu(v => !v)}
              >
                ETH ▾
              </button>
              {showProductMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowProductMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-[var(--ac-bg-card)] border border-[var(--ac-border)] rounded-[1.5px] overflow-hidden shadow-xl min-w-[120px]">
                    <button
                      className="block w-full px-4 py-2 text-left text-[length:var(--ac-fs-md)] font-sans tracking-widest bg-[var(--ac-text-primary)]/10 text-[var(--ac-text-primary)] cursor-default"
                    >
                      以太坊
                    </button>
                    <button
                      className="block w-full px-4 py-2 text-left text-[length:var(--ac-fs-md)] font-sans tracking-widest text-[var(--ac-text-secondary)] hover:bg-[var(--ac-bg-cell-empty)] hover:text-[var(--ac-text-bright)] transition-colors"
                      onClick={() => { setShowProductMenu(false); saveProductPref('stock'); window.location.href = '/stock-risk'; }}
                    >
                      A 股风控
                    </button>
                  </div>
                </>
              )}
            </div>
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
          {/* 右：以太坊 + ETH价格 + 状态指示 */}
          <div className="flex items-center gap-3">
            <span className="text-[length:var(--ac-fs-md)] font-sans font-semibold text-[var(--ac-text-secondary)]">以太坊</span>
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
        {/* 第三行：视图切换3按钮 + 全量模式下的到期/指标折叠按钮 */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--ac-border-subtle)]/40">
          {(['matrix', 'byStrike', 'byExpiry'] as const).map(mode => {
            const label = mode === 'matrix' ? '全量' : mode === 'byStrike' ? '按价位' : '按到期日';
            const active = viewMode === mode;
            return (
              <button key={mode} onClick={() => {
                setViewMode(mode);
                if (mode !== 'matrix') { setShowExpiryPanel(false); setShowDimPanel(false); }
              }}
                className={`text-[length:var(--ac-fs-sm)] font-sans px-3 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 ${
                  active
                    ? 'bg-amber-400/20 border-amber-400/60 text-amber-300 font-semibold'
                    : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-secondary)] hover:border-[var(--ac-border)] hover:text-[var(--ac-text-primary)]'
                }`}>
                {label}
              </button>
            );
          })}
          {viewMode === 'matrix' && (() => {
            // 到期日：非全选（默认4个）时显示角标
            const totalExpiries = allExpiries.length;
            const selectedExpiryCount = selectedMatrixExpiries.size;
            // 默认选中4个，若总数<=4则全选为默认；若总数>4则4个为默认
            const defaultExpiryCount = Math.min(4, totalExpiries);
            const expiryBadge = !showExpiryPanel && selectedExpiryCount !== defaultExpiryCount;
            // 指标：非全选（默认6个全选）时显示角标
            const totalDims = 6;
            const selectedDimCount = activeDims.size;
            const dimBadge = !showDimPanel && selectedDimCount !== totalDims;
            return (
              <>
                <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-xs)] mx-0.5">|</span>
                <button
                  onClick={() => { setShowExpiryPanel(v => !v); setShowDimPanel(false); }}
                  className={`relative text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 flex items-center gap-0.5 ${
                    showExpiryPanel
                      ? 'bg-cyan-400/20 border-cyan-400/60 text-cyan-300'
                      : expiryBadge
                        ? 'bg-transparent border-red-400/60 text-[var(--ac-text-dim)]'
                        : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                  }`}>
                  到期 <span style={{ fontSize: '8px', opacity: 0.7 }}>{showExpiryPanel ? '▲' : '▼'}</span>
                  {expiryBadge && (
                    <span className="ac-badge-pop absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white rounded-full flex items-center justify-center font-sans font-bold" style={{ fontSize: '9px', lineHeight: 1, padding: '0 2px' }}>
                      {selectedExpiryCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => { setShowDimPanel(v => !v); setShowExpiryPanel(false); }}
                  className={`relative text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 flex items-center gap-0.5 ${
                    showDimPanel
                      ? 'bg-emerald-400/20 border-emerald-400/60 text-emerald-300'
                      : dimBadge
                        ? 'bg-transparent border-red-400/60 text-[var(--ac-text-dim)]'
                        : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                  }`}>
                  指标 <span style={{ fontSize: '8px', opacity: 0.7 }}>{showDimPanel ? '▲' : '▼'}</span>
                  {dimBadge && (
                    <span className="ac-badge-pop absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white rounded-full flex items-center justify-center font-sans font-bold" style={{ fontSize: '9px', lineHeight: 1, padding: '0 2px' }}>
                      {selectedDimCount}
                    </span>
                  )}
                </button>
              </>
            );
          })()}
        </div>
        {/* 第四行：全量模式下的折叠面板 */}
        {viewMode === 'matrix' && (
          <div>
            {showExpiryPanel && (
              <div className="ac-panel-enter flex items-center gap-0 px-3 py-1.5 border-b border-[var(--ac-border-subtle)]/30 overflow-x-auto" style={{ scrollbarWidth: 'none' }} {...makePanelSwipeHandlers(() => setShowExpiryPanel(false))}>
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
                      className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 mr-1 flex items-center gap-0.5 ${
                        active
                          ? 'bg-cyan-500/25 border-cyan-400/70 text-cyan-200 font-semibold shadow-[0_0_6px_rgba(34,211,238,0.2)]'
                          : 'bg-transparent border-[var(--ac-border-subtle)]/40 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                      }`}>
                      {active && <span style={{ fontSize: '8px', lineHeight: 1 }}>✓</span>}
                      {ex.label}
                    </button>
                  );
                })}
              </div>
            )}
            {showDimPanel && (
              <div className="ac-panel-enter flex items-center gap-1.5 px-3 py-1.5 flex-wrap border-b border-[var(--ac-border-subtle)]/30" {...makePanelSwipeHandlers(() => setShowDimPanel(false))}>
                <span className="text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-dim)] shrink-0">格内显示</span>
                <button
                  onClick={() => setActiveDims(new Set<DimKey>(['ann','ivr','theta','delta','iv','oi']))}
                  className="text-[length:var(--ac-fs-xs)] font-sans px-1.5 py-0.5 rounded-[2px] border border-[var(--ac-border-subtle)]/40 text-[var(--ac-text-dim)] hover:border-emerald-400/50 hover:text-emerald-300 transition-all duration-150 shrink-0">
                  全选
                </button>
                <button
                  onClick={() => {
                    // 清空时保留年化（至少一个）
                    setActiveDims(new Set<DimKey>(['ann']));
                  }}
                  className="text-[length:var(--ac-fs-xs)] font-sans px-1.5 py-0.5 rounded-[2px] border border-[var(--ac-border-subtle)]/40 text-[var(--ac-text-dim)] hover:border-red-400/50 hover:text-red-300 transition-all duration-150 shrink-0">
                  清空
                </button>
                <span className="flex-1" />
                {(['ann', 'ivr', 'theta', 'delta', 'iv', 'oi'] as DimKey[]).map(d => {
                  const active = activeDims.has(d);
                  return (
                    <button key={d} onClick={() => toggleDim(d)}
                      className={`text-[length:var(--ac-fs-xs)] font-sans px-2 py-0.5 rounded-[2px] border transition-all duration-150 shrink-0 flex items-center gap-0.5 ${
                        active
                          ? 'bg-emerald-500/25 border-emerald-400/70 text-emerald-200 font-semibold shadow-[0_0_6px_rgba(52,211,153,0.2)]'
                          : 'bg-transparent border-[var(--ac-border-subtle)]/40 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                      }`}>
                      {active && <span style={{ fontSize: '8px', lineHeight: 1 }}>✓</span>}
                      {DIM_LABELS[d].zh}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
                {viewMode === 'byStrike' && (
          /* 按价位模式：价位Tag行 + 字段Tag行 */
          <div>
            <div className="px-3 py-1.5 border-b border-[var(--ac-border-subtle)]/20">
              <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))' }}>
                {allStrikes.map(s => {
                  const active = selectedStrikes.has(s);
                  const isAtm = atmStrike === s;
                  return (
                    <button key={s} onClick={() => toggleStrike(s)}
                      className={`text-[length:var(--ac-fs-xs)] font-sans py-1 rounded-[3px] border transition-all duration-150 text-center leading-tight ${
                        active
                          ? isAtm ? 'bg-orange-400/20 border-orange-400 text-orange-300' : 'bg-blue-400/15 border-blue-400/50 text-blue-300'
                          : isAtm ? 'bg-orange-400/10 border-orange-400/70 text-orange-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                      }`}
                      title={isAtm ? `ATM · 最接近 ETH $${ethPrice}` : undefined}>
                      <div className="font-semibold">{s >= 1000 ? (s / 1000).toFixed(1) + 'K' : s}</div>
                      {isAtm && <div className="text-[9px] font-bold text-orange-400 leading-none mt-0.5">ATM</div>}
                    </button>
                  );
                })}
              </div>
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
          /* 按到期日模式：到期日Tag行（等宽网格）+ 字段Tag行 */
          <div>
            <div className="px-3 py-1.5 border-b border-[var(--ac-border-subtle)]/20">
              <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))' }}>
                {allExpiries.map(ex => {
                  const active = selectedExpiries.has(ex.code);
                  return (
                    <button key={ex.code} onClick={() => toggleExpiry(ex.code)}
                      className={`text-[length:var(--ac-fs-xs)] font-sans py-1 rounded-[3px] border transition-all duration-150 text-center leading-tight ${
                        active ? 'bg-amber-400/15 border-amber-400/50 text-amber-300' : 'bg-transparent border-[var(--ac-border-subtle)]/50 text-[var(--ac-text-dim)] hover:border-[var(--ac-border)]/80 hover:text-[var(--ac-text-secondary)]'
                      }`}>
                      <div className="font-semibold">{ex.label}</div>
                      <div className="text-[10px] opacity-60">{ex.year}年</div>
                    </button>
                  );
                })}
              </div>
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
      {/* ── 下拉刷新指示器 ── */}
      {pullState !== 'idle' && (
        <div
          className="fixed left-0 z-40 flex items-center justify-center pointer-events-none"
          style={{
            top: headerHeight || 120,
            width: '100vw',
            height: Math.max(pullDistance, pullState === 'refreshing' ? 38 : 0),
            transition: pullState === 'refreshing' ? 'height 0.25s cubic-bezier(0.23,1,0.32,1)' : 'none',
            background: 'var(--ac-bg-base)',
          }}
        >
          <div
            className="flex flex-col items-center gap-1"
            style={{
              opacity: Math.min(progress * 2, 1),
              transform: `scale(${0.7 + progress * 0.3})`,
              transition: pullState === 'refreshing' ? 'opacity 0.2s' : 'none',
            }}
          >
            {pullState === 'refreshing' ? (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="9" stroke="var(--ac-border)" strokeWidth="2" />
                <path d="M11 2 A9 9 0 0 1 20 11" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 11 11" to="360 11 11" dur="0.7s" repeatCount="indefinite" />
                </path>
              </svg>
            ) : (
              <svg
                width="20" height="20" viewBox="0 0 20 20" fill="none"
                style={{
                  transform: pullState === 'ready' ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s cubic-bezier(0.23,1,0.32,1)',
                }}
              >
                <path d="M10 3 L10 14 M5 10 L10 15 L15 10" stroke={pullState === 'ready' ? '#f59e0b' : 'var(--ac-text-muted)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            <span
              className="text-[10px] font-sans"
              style={{ color: pullState === 'ready' ? '#f59e0b' : 'var(--ac-text-muted)' }}
            >
              {pullState === 'refreshing' ? '刷新中...' : pullState === 'ready' ? '松开刷新' : '下拉刷新'}
            </span>
          </div>
        </div>
      )}

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
                                {isAtm && <span className="text-[length:var(--ac-fs-xs)] font-sans px-1 rounded-[2px] bg-orange-400/20 text-orange-400">ATM</span>}
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

      {/* ── 矩阵表列头固定覆盖层（fixed）── */}
      {viewMode === 'matrix' && headerHeight > 0 && (
        <div
          style={{
            position: 'fixed',
            top: headerHeight,
            left: 0,
            right: 0,
            zIndex: 25,
            background: 'var(--ac-bg-base)',
            borderBottom: '1px solid var(--ac-border-subtle)',
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
            <tbody>
              <tr>
                <td className="text-[length:var(--ac-fs-sm)] text-[var(--ac-text-secondary)] font-sans py-1 px-1 text-left tracking-wider">行权价</td>
                {activeMatrixExpiries.map(e => {
                  const days = calcDaysLeft(e.expireDate);
                  return (
                    <td key={e.code} className="text-center py-1 px-0.5">
                      <div className="text-[length:var(--ac-fs-sm)] font-semibold text-[var(--ac-text-bright)]">{e.label}</div>
                      <div className="text-[8px] text-[var(--ac-text-muted)] font-sans leading-none">{String(e.year).slice(2)}年</div>
                      <div className="text-[length:var(--ac-fs-xs)] text-[var(--ac-text-secondary)] font-sans">{days}D</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

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
          {/* thead 作为占位擑开列头高度，内容透明（真实列头由 fixed 覆盖层渲染） */}
          <thead style={{ visibility: 'hidden' }}>
            <tr>
              <th className="py-1 px-1">行权价</th>
              {activeMatrixExpiries.map(e => {
                const days = calcDaysLeft(e.expireDate);
                return (
                  <th key={e.code} className="text-center py-1 px-0.5">
                    <div className="text-[length:var(--ac-fs-sm)]">{e.label}</div>
                    <div className="text-[8px]">{String(e.year).slice(2)}年</div>
                    <div className="text-[length:var(--ac-fs-xs)]">{days}D</div>
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
                  className={`border-b border-[var(--ac-border-subtle)]/50 ${isAtm ? 'bg-orange-400/[0.08] ring-1 ring-inset ring-orange-400/30' : ''}`}
                  style={isAtm ? { boxShadow: 'inset 3px 0 0 0 rgba(251,146,60,0.9)' } : undefined}
                >
                    <td
                      className="py-0.5 px-1 text-center"
                      style={activeMatrixExpiries.length > 4 ? { position: 'sticky', left: 0, zIndex: 5, background: isAtm ? 'rgba(251,146,60,0.08)' : 'var(--ac-bg-base)' } : {}}
                    >
                    {isAtm ? (
                      <div className="flex flex-col items-center gap-0">
                        <div className="text-[length:var(--ac-fs-sm)] font-sans font-bold text-orange-300 leading-tight">
                          {strike.toLocaleString()}
                        </div>
                        <div className="text-[length:var(--ac-fs-xs)] font-sans font-bold text-orange-400 leading-tight tracking-widest">ATM</div>
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



      {detail && <DetailModal
        cell={detail}
        onClose={() => setDetail(null)}
        optionType={optionType}
        allStrikes={allStrikes}
        onStrikeChange={(newStrike) => {
          const key = `${newStrike}-${detail.expiry.code}`;
          const newCell = matrix.get(key) ?? null;
          if (newCell) {
            setDetail({ strike: newStrike, expiry: detail.expiry, data: newCell, ethPrice: detail.ethPrice });
          }
        }}
        allExpiries={allExpiries}
        onExpiryChange={(newExpiry) => {
          const key = `${detail.strike}-${newExpiry.code}`;
          const newCell = matrix.get(key) ?? null;
          if (newCell) {
            setDetail({ strike: detail.strike, expiry: newExpiry, data: newCell, ethPrice: detail.ethPrice });
          }
        }}
        onSwitchType={() => {
          const newType: 'C' | 'P' = optionType === 'C' ? 'P' : 'C';
          const altCache = loadCache(newType);
          const altMatrix: MatrixData = altCache ? new Map(altCache.matrix) : new Map();
          const key = `${detail.strike}-${detail.expiry.code}`;
          const altCell = altMatrix.get(key) ?? null;
          if (altCell) {
            setDetail({ strike: detail.strike, expiry: detail.expiry, data: altCell, ethPrice: detail.ethPrice });
          }
          setOptionType(newType);
        }}
      />}
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

      {/* 回到 ATM 悬浮按鈕：矩阵视图且 ATM 已确定时显示，详情弹窗打开时隐藏 */}
      {viewMode === 'matrix' && atmStrike !== null && !detail && (
        <button
          onClick={() => {
            if (!atmRowRef.current) return;
            const rect = atmRowRef.current.getBoundingClientRect();
            const rowCenter = rect.top + rect.height / 2;
            const viewportCenter = window.innerHeight / 2;
            const scrollTarget = window.scrollY + rowCenter - viewportCenter;
            window.scrollTo({ top: scrollTarget, behavior: 'smooth' });
          }}
          className={`fixed z-50 flex flex-col items-center justify-center shadow-lg transition-all duration-200 active:scale-95 ${atmFar ? 'atm-fab-pulse' : ''}`}
          style={{
            bottom: '24px',
            right: '16px',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            background: atmFar ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.15)',
            border: atmFar ? '1px solid rgba(245,158,11,0.8)' : '1px solid rgba(245,158,11,0.5)',
            color: '#F59E0B',
            backdropFilter: 'blur(8px)',
            boxShadow: atmFar ? '0 0 12px rgba(245,158,11,0.35)' : undefined,
          }}
          aria-label="回到 ATM"
        >
          {/* 靶心图标 */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
            <line x1="7" y1="1" x2="7" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="7" y1="11" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="1" y1="7" x2="3" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="11" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontSize: '8px', lineHeight: 1, marginTop: '2px', fontWeight: 600, letterSpacing: '0.02em' }}>ATM</span>
        </button>
      )}
    </div>
  );
}// ─── Payoff 图（四象限：买卖 × CALL/PUT，SVG 实现）──────────────
function SinglePayoffChart({
  strike, premium, ethPrice, optionType, isBuyer, displayMode = 'usd', xRange = 0.30
}: {
  strike: number;
  premium: number;
  ethPrice: number;
  optionType: 'C' | 'P';
  isBuyer: boolean;
  displayMode?: 'usd' | 'pct';
  xRange?: number;
}) {
  const W = 300, H = 120, PAD = { t: 46, r: 8, b: 22, l: 40 }; // t=46 为三行标注框留出空间
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const xMin = strike * (1 - xRange);
  const xMax = strike * (1 + xRange);

  const payoff = (s: number) => {
    if (isBuyer) {
      return optionType === 'C'
        ? Math.max(0, s - strike) - premium
        : Math.max(0, strike - s) - premium;
    } else {
      return optionType === 'C'
        ? premium - Math.max(0, s - strike)
        : premium - Math.max(0, strike - s);
    }
  };

  const N = 80;
  const xs = Array.from({ length: N }, (_, i) => xMin + (xMax - xMin) * i / (N - 1));
  const ys = xs.map(payoff);

  const rawYMin = Math.min(...ys);
  const rawYMax = Math.max(...ys);
  const yPad = (rawYMax - rawYMin) * 0.15 || premium * 0.1;
  const yMin = rawYMin - yPad;
  const yMax = rawYMax + yPad;

  const toX = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * chartW;
  const toY = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin)) * chartH;

  const bePrice = optionType === 'C' ? strike + premium : strike - premium;
  const beInRange = bePrice >= xMin && bePrice <= xMax;

  const pts = xs.map((x, i) => `${toX(x).toFixed(1)},${toY(ys[i]).toFixed(1)}`).join(' ');

  const buildArea = (positive: boolean) => {
    const zeroY = toY(0);
    const segments: string[] = [];
    let inSeg = false;
    let segPts: string[] = [];
    const flush = () => {
      if (segPts.length > 1) {
        const first = segPts[0].split(',');
        const last = segPts[segPts.length - 1].split(',');
        segments.push(`M ${segPts.join(' L ')} L ${last[0]},${zeroY.toFixed(1)} L ${first[0]},${zeroY.toFixed(1)} Z`);
      }
      segPts = []; inSeg = false;
    };
    xs.forEach((x, i) => {
      const y = ys[i];
      const isPos = positive ? y >= 0 : y < 0;
      if (isPos) { if (!inSeg) inSeg = true; segPts.push(`${toX(x).toFixed(1)},${toY(y).toFixed(1)}`); }
      else if (inSeg) flush();
    });
    if (inSeg) flush();
    return segments.join(' ');
  };

  const yTicks = (() => {
    const range = yMax - yMin;
    const step = range > 2000 ? 1000 : range > 500 ? 200 : range > 100 ? 50 : 20;
    const ticks: number[] = [];
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v <= yMax; v += step) ticks.push(v);
    return ticks;
  })();

  const fmtUsd = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);

  // 极值点坐标（最大盈利 / 最大亏损）
  const maxProfitIdx = ys.indexOf(rawYMax);
  const maxLossIdx = ys.indexOf(rawYMin);
  const maxProfitX = toX(xs[maxProfitIdx]);
  const maxProfitY = toY(rawYMax);
  const maxLossX = toX(xs[maxLossIdx]);
  const maxLossY = toY(rawYMin);

  // 根据 displayMode 格式化 Y 轴和标注
  const fmtVal = (v: number) => {
    if (displayMode === 'pct') {
      const pct = premium > 0 ? (v / premium) * 100 : 0;
      return (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
    }
    return (v >= 0 ? '' : '') + fmtUsd(v);
  };
  const fmtValLabel = (v: number) => {
    if (displayMode === 'pct') {
      const pct = premium > 0 ? (v / premium) * 100 : 0;
      return (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
    }
    return (v >= 0 ? '+' : '') + fmtUsd(v) + ' USD';
  };
  const lineColor = isBuyer ? '#34d399' : '#60a5fa';

  // 悬停交互状态
  const [hoverX, setHoverX] = useState<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    if (svgX < PAD.l || svgX > W - PAD.r) { setHoverX(null); return; }
    setHoverX(svgX);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const touch = e.touches[0];
    const svgX = ((touch.clientX - rect.left) / rect.width) * W;
    if (svgX < PAD.l || svgX > W - PAD.r) { setHoverX(null); return; }
    setHoverX(svgX);
    e.stopPropagation();
  };

  // 根据 hoverX 计算对应的 ETH 价格和损益
  const hoverData = hoverX !== null ? (() => {
    const hoverPrice = xMin + ((hoverX - PAD.l) / chartW) * (xMax - xMin);
    const hoverPnl = payoff(hoverPrice);
    const hoverY = toY(hoverPnl);
    // 标注框位置：防止超出边界
    const labelX = hoverX > W * 0.65 ? hoverX - 52 : hoverX + 4;
    const labelY = Math.max(PAD.t + 14, Math.min(H - PAD.b - 4, hoverY - 8));
    return { hoverPrice, hoverPnl, hoverY, labelX, labelY };
  })() : null;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', cursor: 'crosshair', overflow: 'visible' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverX(null)}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setHoverX(null)}
    >
      {/* ITM/OTM 区间背景色：CALL=行权价右侧ITM绿/左侧OTM红；PUT=行权价左侧ITM绿/右侧OTM红 */}
      {(() => {
        const sx = Math.max(PAD.l, Math.min(W - PAD.r, toX(strike)));
        const chartTop = PAD.t;
        const chartBot = H - PAD.b;
        const chartH2 = chartBot - chartTop;
        // 标注文字展示条件：区间宽度足够时才显示
        const otmW = optionType === 'C' ? sx - PAD.l : W - PAD.r - sx;
        const itmW = optionType === 'C' ? W - PAD.r - sx : sx - PAD.l;
        const showOtmLabel = otmW > 18;
        const showItmLabel = itmW > 18;
        // 文字位置：各区内居中，靠近底部
        const textY = chartBot - 3;
        if (optionType === 'C') {
          const otmCx = PAD.l + (sx - PAD.l) / 2;
          const itmCx = sx + (W - PAD.r - sx) / 2;
          return (
            <g>
              {/* OTM 区（行权价左侧）极淡红 */}
              <rect x={PAD.l} y={chartTop} width={sx - PAD.l} height={chartH2}
                fill="rgba(248,113,113,0.06)" />
              {showOtmLabel && <text x={otmCx} y={textY} fontSize="4.5" fill="rgba(156,163,175,0.7)" textAnchor="middle" fontWeight="500">OTM</text>}
              {/* ITM 区（行权价右侧）极淡绿 */}
              <rect x={sx} y={chartTop} width={W - PAD.r - sx} height={chartH2}
                fill="rgba(74,222,128,0.06)" />
              {showItmLabel && <text x={itmCx} y={textY} fontSize="4.5" fill="rgba(156,163,175,0.7)" textAnchor="middle" fontWeight="500">ITM</text>}
            </g>
          );
        } else {
          const itmCx = PAD.l + (sx - PAD.l) / 2;
          const otmCx = sx + (W - PAD.r - sx) / 2;
          return (
            <g>
              {/* ITM 区（行权价左侧）极淡绿 */}
              <rect x={PAD.l} y={chartTop} width={sx - PAD.l} height={chartH2}
                fill="rgba(74,222,128,0.06)" />
              {showItmLabel && <text x={itmCx} y={textY} fontSize="4.5" fill="rgba(156,163,175,0.7)" textAnchor="middle" fontWeight="500">ITM</text>}
              {/* OTM 区（行权价右侧）极淡红 */}
              <rect x={sx} y={chartTop} width={W - PAD.r - sx} height={chartH2}
                fill="rgba(248,113,113,0.06)" />
              {showOtmLabel && <text x={otmCx} y={textY} fontSize="4.5" fill="rgba(156,163,175,0.7)" textAnchor="middle" fontWeight="500">OTM</text>}
            </g>
          );
        }
      })()}
      <line x1={PAD.l} y1={toY(0)} x2={W - PAD.r} y2={toY(0)} stroke="#374151" strokeWidth="0.8" strokeDasharray="3,3" />
      <path d={buildArea(true)} fill="rgba(74,222,128,0.12)" />
      <path d={buildArea(false)} fill="rgba(248,113,113,0.12)" />
      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* ===== 垂直线标注：三条线固定分配不同 Y 行，单行显示标签+价格 ===== */}
      {(() => {
        const LH = 10;   // 框高
        const GAP = 2;   // 框与线的水平间距
        const ROW0 = PAD.t - LH - 2;   // 第 1 行 Y
        const ROW1 = PAD.t - LH * 2 - 5; // 第 2 行 Y

        // 格式化价格：直接写完整整数
        const fmtPx = (v: number) => Math.round(v).toLocaleString('en-US');
        // 计算标注框宽度
        const calcBw = (text: string) => Math.max(28, text.length * 4 + 6);

        const strikeInRange = strike >= xMin && strike <= xMax;
        const ethInRange = ethPrice >= xMin && ethPrice <= xMax;
        const sx = strikeInRange ? toX(strike) : null;
        const ex = ethInRange ? toX(ethPrice) : null;

        // 判断行权价和现价是否靠近（两线间距 < 40px）
        const CLOSE_THRESH = 40;
        const bothClose = sx !== null && ex !== null && Math.abs(sx - ex) < CLOSE_THRESH;

        // 计算现价盈亏数据
        const payoffAtEth = ethInRange ? (() => {
          const idx = Math.round((ethPrice - xMin) / (xMax - xMin) * (N - 1));
          if (idx < 0 || idx >= ys.length) return 0;
          return ys[idx];
        })() : 0;
        const isProfit = payoffAtEth >= 0;

        // 计算行权价和现价标注框的 X 位置
        // 靠近时：左侧的线标注框向左展开，右侧的向右展开
        // 远离时：各自靠近自己的线展开
        const getStrikeBox = () => {
          if (!sx) return null;
          const label = `行权价 ${fmtPx(strike)}`;
          const bw = calcBw(label);
          if (bothClose && ex !== null) {
            // 行权价在右侧（或左侧），展开方向取决于与现价的相对位置
            if (sx >= ex) {
              // 行权价在右，向右展开
              const rx = Math.min(sx + GAP, W - PAD.r - bw);
              return { rx, bw, row: ROW0 };
            } else {
              // 行权价在左，向左展开
              const rx = Math.max(PAD.l, sx - bw - GAP);
              return { rx, bw, row: ROW0 };
            }
          } else {
            // 远离：线右侧优先
            const rx = sx + GAP + bw > W - PAD.r ? sx - bw - GAP : sx + GAP;
            return { rx, bw, row: ROW0 };
          }
        };

        const getEthBox = () => {
          if (!ex) return null;
          const label = `现价 ${fmtPx(ethPrice)}`;
          const bw = calcBw(label);
          if (bothClose && sx !== null) {
            if (ex <= sx) {
              // 现价在左，向左展开
              const rx = Math.max(PAD.l, ex - bw - GAP);
              return { rx, bw, row: ROW0 }; // 同行
            } else {
              // 现价在右，向右展开
              const rx = Math.min(ex + GAP, W - PAD.r - bw);
              return { rx, bw, row: ROW0 };
            }
          } else {
            // 远离：线右侧优先
            const rx = ex + GAP + bw > W - PAD.r ? ex - bw - GAP : ex + GAP;
            // 如果行权价也在范围内，现价用第 2 行；否则用第 1 行
            return { rx, bw, row: strikeInRange ? ROW1 : ROW0 };
          }
        };

        const strikeBox = getStrikeBox();
        const ethBox = getEthBox();

        // BE 标注框：如果行权价和现价同行，则 BE 用第 2 行；否则用第 2 行
        const beRowY = ROW1;

        return (
          <g>
            {/* 行权价线 */}
            {strikeInRange && sx !== null && (() => {
              return (
                <g>
                  <line x1={sx} y1={PAD.t} x2={sx} y2={H - PAD.b} stroke="#6b7280" strokeWidth="0.8" strokeDasharray="4,3" />
                  {strikeBox && (
                    <>
                      <rect x={strikeBox.rx} y={strikeBox.row} width={strikeBox.bw} height={LH} rx="1.5" fill="rgba(55,65,81,0.92)" stroke="#6b7280" strokeWidth="0.5" />
                      <text x={strikeBox.rx + strikeBox.bw/2} y={strikeBox.row + LH*0.72} fontSize="5" fill="#d1d5db" fontWeight="600" textAnchor="middle">行权价 {fmtPx(strike)}</text>
                    </>
                  )}
                </g>
              );
            })()}
            {/* 现价线 */}
            {ethInRange && ex !== null && (() => {
              return (
                <g>
                  <line x1={ex} y1={PAD.t} x2={ex} y2={H - PAD.b} stroke="rgba(245,158,11,0.15)" strokeWidth="4" />
                  <line x1={ex} y1={PAD.t} x2={ex} y2={H - PAD.b} stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="3,2" />
                  <circle cx={ex} cy={toY(payoffAtEth)} r="2.5" fill={isProfit ? '#4ade80' : '#f87171'} stroke="#f59e0b" strokeWidth="0.8" />
                  {/* 盈亏标注 */}
                  {(() => {
                    const pnlVal = displayMode === 'pct'
                      ? `${payoffAtEth >= 0 ? '+' : ''}${((payoffAtEth / premium) * 100).toFixed(0)}%`
                      : `${payoffAtEth >= 0 ? '+' : ''}${Math.round(payoffAtEth)}`;
                    const cy = toY(payoffAtEth);
                    const above = cy > PAD.t + 18;
                    const ry = above ? cy - 14 : cy + 4;
                    const prx = ex + GAP + 4;
                    const clampedRx = Math.max(PAD.l, Math.min(W - PAD.r - 22, prx));
                    return (
                      <g>
                        <rect x={clampedRx} y={ry} width="22" height="10" rx="1.5"
                          fill={isProfit ? 'rgba(20,83,45,0.85)' : 'rgba(127,29,29,0.85)'}
                          stroke={isProfit ? '#4ade80' : '#f87171'} strokeWidth="0.5" />
                        <text x={clampedRx + 11} y={ry + 7} fontSize="5.5"
                          fill={isProfit ? '#4ade80' : '#f87171'} fontWeight="bold" textAnchor="middle">{pnlVal}</text>
                      </g>
                    );
                  })()}
                  {ethBox && (
                    <>
                      <rect x={ethBox.rx} y={ethBox.row} width={ethBox.bw} height={LH} rx="1.5" fill="rgba(180,83,9,0.92)" stroke="#f59e0b" strokeWidth="0.5" />
                      <text x={ethBox.rx + ethBox.bw/2} y={ethBox.row + LH*0.72} fontSize="5" fill="#fde68a" fontWeight="600" textAnchor="middle">现价 {fmtPx(ethPrice)}</text>
                    </>
                  )}
                </g>
              );
            })()}
            {/* BE 线 */}
            {beInRange && (() => {
              const lx = toX(bePrice);
              const beLabel = displayMode === 'pct' ? 'BE 0%' : `BE ${fmtPx(bePrice)}`;
              const bw = calcBw(beLabel);
              const rx = lx + GAP + bw > W - PAD.r ? lx - bw - GAP : lx + GAP;
              return (
                <g>
                  <line x1={lx} y1={PAD.t} x2={lx} y2={H - PAD.b} stroke="#c4b5fd" strokeWidth="1.2" strokeDasharray="3,2" />
                  <circle cx={lx} cy={toY(0)} r="2.8" fill="#7c3aed" stroke="#c4b5fd" strokeWidth="1" />
                  <rect x={rx} y={beRowY} width={bw} height={LH} rx="1.5" fill="rgba(109,40,217,0.85)" stroke="#c4b5fd" strokeWidth="0.5" />
                  <text x={rx + bw/2} y={beRowY + LH*0.72} fontSize="5" fill="#e9d5ff" fontWeight="600" textAnchor="middle">{beLabel}</text>
                </g>
              );
            })()}
          </g>
        );
      })()}

      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.l - 2} y1={toY(v)} x2={PAD.l} y2={toY(v)} stroke="#374151" strokeWidth="0.5" />
          <text x={PAD.l - 3} y={toY(v) + 3} fontSize="6" fill={v >= 0 ? '#4ade80' : '#f87171'} textAnchor="end">{fmtVal(v)}</text>
        </g>
      ))}
      {/* X 轴关键价格刻度：xMin、BE（若在范围内）、行权价、现价（若在范围内）、xMax */}
      {(() => {
        const fmtPrice = (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0);
        // 收集候选刻度，去重后按价格排序
        const candidates: { v: number; color: string; anchor: 'start'|'middle'|'end' }[] = [];
        const seen = new Set<number>();
        const add = (v: number, color: string) => {
          const rounded = Math.round(v);
          if (!seen.has(rounded) && v >= xMin && v <= xMax) {
            seen.add(rounded);
            candidates.push({ v, color, anchor: 'middle' });
          }
        };
        add(xMin, '#6b7280');
        if (beInRange) add(bePrice, '#a78bfa');
        add(strike, '#9ca3af');
        if (ethPrice >= xMin && ethPrice <= xMax) add(ethPrice, '#f59e0b');
        add(xMax, '#6b7280');
        // 按价格排序，两端改为 start/end 对齐
        candidates.sort((a, b) => a.v - b.v);
        if (candidates.length > 0) candidates[0].anchor = 'start';
        if (candidates.length > 1) candidates[candidates.length - 1].anchor = 'end';
        // 过滤掉 X 轴位置过近的刻度（最小间距 20px），保留重要标注
        const filtered: typeof candidates = [];
        for (const c of candidates) {
          const cx = toX(c.v);
          const tooClose = filtered.some(f => Math.abs(toX(f.v) - cx) < 20);
          if (!tooClose) filtered.push(c);
        }
        return filtered.map((c, i) => (
          <g key={i}>
            <line x1={toX(c.v)} y1={H - PAD.b} x2={toX(c.v)} y2={H - PAD.b + 2} stroke={c.color} strokeWidth="0.5" />
            <text x={toX(c.v)} y={H - PAD.b + 8} fontSize="6" fill={c.color} textAnchor={c.anchor}>
              {fmtPrice(c.v)}
            </text>
          </g>
        ));
      })()}
      {/* 极值点标注 */}
      {rawYMax > 0 && (() => {
        const label = displayMode === 'pct'
          ? `+${((rawYMax / premium) * 100).toFixed(0)}%`
          : `+${fmtUsd(rawYMax)}`;
        const lx = maxProfitX > W * 0.7 ? maxProfitX - 26 : maxProfitX + 3;
        const ly = Math.max(PAD.t + 2, maxProfitY - 2);
        return (
          <g>
            <circle cx={maxProfitX} cy={maxProfitY} r="2" fill="#4ade80" opacity="0.9" />
            <text x={lx} y={ly + 5} fontSize="5.5" fill="#4ade80" fontWeight="bold">{label}</text>
          </g>
        );
      })()}
      {rawYMin < 0 && (() => {
        const label = displayMode === 'pct'
          ? `${((rawYMin / premium) * 100).toFixed(0)}%`
          : `${fmtUsd(rawYMin)}`;
        const lx = maxLossX > W * 0.7 ? maxLossX - 26 : maxLossX + 3;
        const ly = Math.min(H - PAD.b - 8, maxLossY + 2);
        return (
          <g>
            <circle cx={maxLossX} cy={maxLossY} r="2" fill="#f87171" opacity="0.9" />
            <text x={lx} y={ly + 5} fontSize="5.5" fill="#f87171" fontWeight="bold">{label}</text>
          </g>
        );
      })()}
      {/* 买方无限盈利方向箭头 */}
      {isBuyer && (() => {
        // 买入CALL：右端无限涨；买入PUT：左端无限跌
        const arrowX = optionType === 'C' ? W - PAD.r : PAD.l;
        const arrowY = PAD.t + 4;
        // 箭头朝右（CALL）或朝左（PUT）
        const arrowPath = optionType === 'C'
          ? `M ${arrowX - 8},${arrowY} L ${arrowX},${arrowY} L ${arrowX - 3},${arrowY - 2.5} M ${arrowX},${arrowY} L ${arrowX - 3},${arrowY + 2.5}`
          : `M ${arrowX + 8},${arrowY} L ${arrowX},${arrowY} L ${arrowX + 3},${arrowY - 2.5} M ${arrowX},${arrowY} L ${arrowX + 3},${arrowY + 2.5}`;
        const textX = optionType === 'C' ? arrowX - 18 : arrowX + 3;
        return (
          <g opacity="0.85">
            <path d={arrowPath} stroke="#4ade80" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <text x={textX} y={arrowY + 4} fontSize="7" fill="#4ade80" fontWeight="bold">∞</text>
          </g>
        );
      })()}
      {/* 卖方有限盈利标签 */}
      {!isBuyer && rawYMax > 0 && (() => {
        // 卖出 CALL：最大盈利在左端（价格越低盈利越大）；卖出 PUT：最大盈利在右端
        const lx = optionType === 'C' ? PAD.l + 2 : W - PAD.r - 28;
        const ly = PAD.t + 2;
        return (
          <g opacity="0.8">
            <rect x={lx - 1} y={ly} width="30" height="10" rx="1.5"
              fill="rgba(251,191,36,0.12)" stroke="rgba(251,191,36,0.4)" strokeWidth="0.5" />
            <text x={lx + 1} y={ly + 7} fontSize="5" fill="#fbbf24" fontWeight="bold">有限盈利</text>
          </g>
        );
      })()}
      {/* 卖方无限亏损方向箭头 */}
      {!isBuyer && (() => {
        // 卖出 CALL：右端无限涨亏损；卖出 PUT：左端无限跌亏损
        const arrowX = optionType === 'C' ? W - PAD.r : PAD.l;
        const arrowY = H - PAD.b - 4;
        const arrowPath = optionType === 'C'
          ? `M ${arrowX - 8},${arrowY} L ${arrowX},${arrowY} L ${arrowX - 3},${arrowY - 2.5} M ${arrowX},${arrowY} L ${arrowX - 3},${arrowY + 2.5}`
          : `M ${arrowX + 8},${arrowY} L ${arrowX},${arrowY} L ${arrowX + 3},${arrowY - 2.5} M ${arrowX},${arrowY} L ${arrowX + 3},${arrowY + 2.5}`;
        const textX = optionType === 'C' ? arrowX - 18 : arrowX + 3;
        return (
          <g opacity="0.85">
            <path d={arrowPath} stroke="#f87171" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <text x={textX} y={arrowY + 4} fontSize="7" fill="#f87171" fontWeight="bold">−∞</text>
          </g>
        );
      })()}
      {/* 悬停交互层 */}
      {hoverData && hoverX !== null && (
        <g>
          {/* 垂直导线 */}
          <line x1={hoverX} y1={PAD.t} x2={hoverX} y2={H - PAD.b}
            stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" strokeDasharray="2,2" />
          {/* 曲线上的圆点 */}
          <circle cx={hoverX} cy={hoverData.hoverY} r="2.5"
            fill={lineColor} stroke="#0d1117" strokeWidth="1" />
          {/* 标注框 */}
          <rect x={hoverData.labelX} y={hoverData.labelY - 10} width="48" height="18"
            rx="2" fill="rgba(13,17,23,0.88)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          <text x={hoverData.labelX + 4} y={hoverData.labelY - 2} fontSize="5.5" fill="#9ca3af">
            ETH {hoverData.hoverPrice >= 1000 ? `${(hoverData.hoverPrice/1000).toFixed(2)}k` : hoverData.hoverPrice.toFixed(0)}
          </text>
          <text x={hoverData.labelX + 4} y={hoverData.labelY + 6} fontSize="6" fontWeight="bold"
            fill={hoverData.hoverPnl >= 0 ? '#4ade80' : '#f87171'}>
            {fmtValLabel(hoverData.hoverPnl)}
          </text>
        </g>
      )}
      {/* 透明截取层，确保整个图表区域可以响应鼠标事件 */}
      <rect x={PAD.l} y={PAD.t} width={chartW} height={chartH} fill="transparent" />
    </svg>
  );
}

// 四象限 Payoff 图组合
function PayoffChart({
  strike, premium, ethPrice, optionType
}: {
  strike: number;
  premium: number;
  ethPrice: number;
  optionType: 'C' | 'P';
}) {
  const [displayMode, setDisplayMode] = useState<'usd' | 'pct'>(() => {
    try { const p = localStorage.getItem('eth-ann-filter-prefs-v1'); if (p) { const v = JSON.parse(p)?.payoffDisplayMode; if (v === 'usd' || v === 'pct') return v; } } catch { /* ignore */ }
    return 'usd';
  });
  const [xRange, setXRange] = useState<number>(() => {
    try { const p = localStorage.getItem('eth-ann-filter-prefs-v1'); if (p) { const v = JSON.parse(p)?.payoffXRange; if (v === 0.20 || v === 0.30 || v === 0.40) return v; } } catch { /* ignore */ }
    return 0.30;
  });
  // payoffDisplayMode / xRange 变化时写入 localStorage
  useEffect(() => {
    try { const p = localStorage.getItem('eth-ann-filter-prefs-v1'); const obj = p ? JSON.parse(p) : {}; obj.payoffDisplayMode = displayMode; obj.payoffXRange = xRange; localStorage.setItem('eth-ann-filter-prefs-v1', JSON.stringify(obj)); } catch { /* ignore */ }
  }, [displayMode, xRange]);
  const otherType = optionType === 'C' ? 'P' : 'C';
  const quadrants = [
    { label: `买入 ${optionType === 'C' ? 'CALL' : 'PUT'}`, isBuyer: true,  ot: optionType as 'C'|'P', color: '#34d399', desc: optionType === 'C' ? '涨幅盈利无限' : '跌幅盈利无限' },
    { label: `卖出 ${optionType === 'C' ? 'CALL' : 'PUT'}`, isBuyer: false, ot: optionType as 'C'|'P', color: '#60a5fa', desc: optionType === 'C' ? '涨幅亏损无限' : '跌幅亏损无限' },
    { label: `买入 ${optionType === 'C' ? 'PUT' : 'CALL'}`,  isBuyer: true,  ot: otherType as 'C'|'P', color: '#34d399', desc: optionType === 'C' ? '跌幅盈利无限' : '涨幅盈利无限' },
    { label: `卖出 ${optionType === 'C' ? 'PUT' : 'CALL'}`,  isBuyer: false, ot: otherType as 'C'|'P', color: '#60a5fa', desc: optionType === 'C' ? '跌幅亏损无限' : '涨幅亏损无限' },
  ];

  return (
    <div className="px-2 py-2">
      {/* 顶部切换按钮 */}
      <div className="flex items-center justify-between mb-1.5">
        {/* 价格范围切换 */}
        <div className="flex rounded-[2px] overflow-hidden border border-[var(--ac-border)]/60 text-[length:var(--ac-fs-xs)] font-sans">
          {([0.20, 0.30, 0.40] as const).map(r => (
            <button key={r}
              onClick={() => setXRange(r)}
              className={`px-2 py-0.5 transition-colors duration-150 ${xRange === r ? 'bg-[#0e7490] text-white' : 'bg-transparent text-[var(--ac-text-muted)] hover:text-[var(--ac-text-secondary)]'}`}
            >±{(r * 100).toFixed(0)}%</button>
          ))}
        </div>
        {/* 数据维度切换 */}
        <div className="flex rounded-[2px] overflow-hidden border border-[var(--ac-border)]/60 text-[length:var(--ac-fs-xs)] font-sans">
          <button
            onClick={() => setDisplayMode('usd')}
            className={`px-2 py-0.5 transition-colors duration-150 ${displayMode === 'usd' ? 'bg-[#3b82f6] text-white' : 'bg-transparent text-[var(--ac-text-muted)] hover:text-[var(--ac-text-secondary)]'}`}
          >$ USD</button>
          <button
            onClick={() => setDisplayMode('pct')}
            className={`px-2 py-0.5 transition-colors duration-150 ${displayMode === 'pct' ? 'bg-[#8b5cf6] text-white' : 'bg-transparent text-[var(--ac-text-muted)] hover:text-[var(--ac-text-secondary)]'}`}
          >% 收益率</button>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {quadrants.map((q) => (
          <div key={q.label} className="rounded-[1.5px] border border-[var(--ac-border)]/40 bg-[var(--ac-bg-base)] overflow-hidden">
            <div className="flex items-center justify-between px-1.5 pt-1 pb-0.5">
              <span className="text-[length:var(--ac-fs-xs)] font-sans font-semibold" style={{ color: q.color }}>{q.label}</span>
              <span className="text-[8px] font-sans text-[var(--ac-text-muted)] leading-tight text-right">{q.desc}</span>
            </div>
            <SinglePayoffChart
              strike={strike}
              premium={premium}
              ethPrice={ethPrice}
              optionType={q.ot}
              isBuyer={q.isBuyer}
              displayMode={displayMode}
              xRange={xRange}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 px-1 mt-1 text-[length:var(--ac-fs-xs)] font-sans text-[var(--ac-text-muted)]">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#34d399]" />买方损益</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#60a5fa]" />卖方损益</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#f59e0b]" />现价</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#a78bfa]" />BE</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed border-[#6b7280]" />行权价</span>
      </div>
    </div>
  );
}
