/**
 * AnnualizedChain — 年化矩阵热力表
 * 纵轴：行权价  横轴：4个到期日
 * 每格只显示年化%（颜色编码），点击弹出详情
 * 手机优先：5列紧凑布局
 *
 * 每个到期日独立一个 WebSocket 连接（共4个），避免超出 Deribit 100频道上限
 * 区分两种空状态：「—」= 加载中，「此处无」= 该行权价无合约
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";

// ─── 到期日配置 ────────────────────────────────────────────────
const EXPIRIES = [
  { code: "25SEP26", label: "9月",  fullLabel: "2026/9/25",  expireDate: "2026-09-25" },
  { code: "25DEC26", label: "12月", fullLabel: "2026/12/25", expireDate: "2026-12-25" },
  { code: "26MAR27", label: "3月",  fullLabel: "2027/3/26",  expireDate: "2027-03-26" },
  { code: "25JUN27", label: "6月",  fullLabel: "2027/6/25",  expireDate: "2027-06-25" },
];

const MAX_STRIKE = 5000;

function calcDaysLeft(expireDate: string): number {
  const now = new Date();
  const exp = new Date(expireDate);
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86400000));
}

// ─── 颜色编码（半透明 rgba，在深色背景上有明显色调区分）──────────────
function annualizedColor(v: number | null): string {
  if (v === null) return "bg-[#1C2128] text-[#6E7681]";
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
const ANN_BG: Record<string, string> = {
  "__ann_0": "rgba(14,203,129,0.28)",   // 0-10%  绿
  "__ann_1": "rgba(14,203,129,0.22)",   // 10-20%
  "__ann_2": "rgba(240,185,11,0.28)",   // 20-30%  黄绿过渡
  "__ann_3": "rgba(240,185,11,0.36)",   // 30-40%  黄
  "__ann_4": "rgba(246,70,93,0.30)",    // 40-50%  橙红
  "__ann_5": "rgba(246,70,93,0.40)",    // 50-70%
  "__ann_6": "rgba(246,70,93,0.55)",    // 70%+  深红
};

const ANN_BORDER: Record<string, string> = {
  "__ann_0": "rgba(14,203,129,0.28)",
  "__ann_1": "rgba(14,203,129,0.22)",
  "__ann_2": "rgba(240,185,11,0.28)",
  "__ann_3": "rgba(240,185,11,0.36)",
  "__ann_4": "rgba(246,70,93,0.28)",
  "__ann_5": "rgba(246,70,93,0.40)",
  "__ann_6": "rgba(246,70,93,0.55)",
};
function annualizedBorder(v: number | null): string {
  return "border-[#30363D]/30";
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
  expiry: typeof EXPIRIES[0];
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

  if (loading) return <div className="text-center text-[#8B949E] text-xs py-6">加载历史数据...</div>;
  if (error || points.length === 0) return <div className="text-center text-[#6E7681] text-xs py-4">暂无历史数据</div>;
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
        <div className="text-[8px] text-[#8B949E] font-mono mb-1">
          {dateRange.startDate} — {dateRange.endDate} · 共 {dateRange.days} 天
        </div>
      )}
      {/* HTML图例行：三个数字靠右紧凑排列，用CSS控制 */}
      <div className="flex justify-end items-center gap-3 mb-1 pr-0.5">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ff6b35' }} />
          <span className="text-[11px] font-semibold" style={{ color: '#ff6b35' }}>H {maxV.toFixed(2)}%</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00d4aa' }} />
          <span className="text-[11px] font-semibold" style={{ color: '#00d4aa' }}>L {minV.toFixed(2)}%</span>
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

  if (loading) return <div className="text-center text-[#8B949E] text-xs py-6">加载IV历史...</div>;
  if (error || points.length === 0) return <div className="text-center text-[#6E7681] text-xs py-4">暂无IV历史数据</div>;

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
          <span className="text-[11px] font-semibold" style={{ color: '#ff6b35' }}>H {maxMark.toFixed(1)}%</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#00d4aa' }} />
          <span className="text-[11px] font-semibold" style={{ color: '#00d4aa' }}>L {minMark.toFixed(1)}%</span>
        </span>
        <span className="text-[10px] text-[#6E7681]">--- Bid/Ask</span>
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

  if (loading) return <div className="text-center text-[#8B949E] text-xs py-4">加载历史...</div>;
  if (error || points.length === 0) return <div className="text-center text-[#6E7681] text-xs py-3">暂无历史数据</div>;

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
        <span className="text-[10px] font-semibold" style={{ color: '#ffffff' }}>现 {fmtV(curV)}{metric === 'iv' ? '%' : ''}</span>
        <span className="text-[9px]" style={{ color: '#ff6b35' }}>H {fmtV(maxV)}</span>
        <span className="text-[9px]" style={{ color: '#00d4aa' }}>L {fmtV(minV)}</span>
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
      <div className="flex items-center gap-3 px-1 mt-0.5 text-[9px] font-sans text-[#6E7681]">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#60a5fa]" />损益</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#f59e0b]" />现价</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#a78bfa]" />盈亏平衡</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#6b7280]" />行权价</span>
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
        className="w-full max-w-md bg-[#161B22] border border-[#30363D] rounded-[1.5px]-2xl pb-safe"
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
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#21262D] sticky top-0 bg-[#161B22]/95 backdrop-blur">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-bold text-base font-sans">${strike.toLocaleString()}</span>
              <span className="text-[10px] font-sans text-[#8B949E]">{optionType === 'C' ? 'CALL' : 'PUT'}</span>
            </div>
            <div className="text-[#8B949E] text-[11px] font-sans mt-0.5">{expiry.fullLabel} · {daysLeft}D</div>
          </div>
          <button onClick={onClose} className="text-[#8B949E] hover:text-white w-7 h-7 flex items-center justify-center rounded-[1.5px] hover:bg-[#1C2128] text-base leading-none">×</button>
        </div>
        <div className="px-4 py-4 space-y-3">
          {/* ===== 价格卡片（最顶部，重点展示）===== */}
          <div className="bg-[#1C2128] rounded-[1.5px] border border-[#30363D] overflow-hidden">
            {/* 标题行 */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-[#30363D]/40">
              <span className="text-[10px] text-[#8B949E] font-sans tracking-widest uppercase">价格</span>
              {ethPrice > 0 && <span className="text-[10px] text-[#6E7681] font-sans">ETH {ethPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>}
            </div>
            {/* 三格并排：买入 / 卖出 / 最新成交 */}
            <div className="grid grid-cols-3 divide-x divide-gray-700/60">
              <div className="px-3 py-3">
                <div className="text-[10px] text-[#8B949E] mb-1">买入价 Ask</div>
                <div className="text-emerald-400 font-sans font-bold text-base leading-tight">
                  {data.askUsd !== null ? `${data.askUsd.toFixed(4)}` : '—'}
                </div>
                <div className="text-[10px] text-[#8B949E] font-sans mt-0.5">
                  {data.askUsd !== null && ethPrice > 0 ? `$${(data.askUsd * ethPrice).toFixed(0)}` : ''}
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="text-[10px] text-[#8B949E] mb-1">卖出价 Bid</div>
                <div className="text-rose-400 font-sans font-bold text-base leading-tight">
                  {data.bidUsd !== null ? `${data.bidUsd.toFixed(4)}` : '—'}
                </div>
                <div className="text-[10px] text-[#8B949E] font-sans mt-0.5">
                  {data.bidUsd !== null && ethPrice > 0 ? `$${(data.bidUsd * ethPrice).toFixed(0)}` : ''}
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="text-[10px] text-[#8B949E] mb-1">最新成交</div>
                <div className="text-sky-300 font-sans font-bold text-base leading-tight">
                  {data.lastPrice !== null ? `${data.lastPrice.toFixed(4)}` : '—'}
                </div>
                <div className="text-[10px] text-[#8B949E] font-sans mt-0.5">
                  {data.lastPrice !== null && ethPrice > 0 ? `$${(data.lastPrice * ethPrice).toFixed(0)}` : ''}
                </div>
              </div>
            </div>
            {/* 标记价单独一行 */}
            <div className="flex items-center justify-between px-3 py-2 border-t border-[#30363D]/60 bg-[#161B22]/30">
              <span className="text-[11px] text-[#8B949E]">标记价（Mark）</span>
              <div className="text-right">
                <span className="text-white font-sans font-semibold text-sm">
                  {data.markUsd !== null ? `${data.markUsd.toFixed(4)} ETH` : '—'}
                </span>
                {data.markUsd !== null && ethPrice > 0 && (
                  <span className="text-[10px] text-[#8B949E] font-sans ml-2">≈ ${(data.markUsd * ethPrice).toFixed(2)}</span>
                )}
              </div>
            </div>
          </div>

          {/* 年化数字 + 历史走势图 合并卡片 */}
          <div className={`rounded-[1.5px] border overflow-hidden ${annualizedBorder(data.annualized)} ${annualizedColor(data.annualized)}`}>
            {/* 顶部信息行：左侧标签 + 右侧年化数字 */}
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
              <div>
                <div className="text-[10px] font-sans tracking-widest text-[#8B949E] uppercase">
                  {optionType === 'P' ? '权利金/行权价 年化 · 全量历史' : '年化占比 · 全量历史'}
                </div>
              </div>
              <span className="text-base font-bold leading-none">{data.annualized !== null ? `${(data.annualized * 100).toFixed(2)}%` : "—"}</span>
            </div>
            {/* 历史走势图 */}
            <div className="px-2 pb-2">
              {data.instrumentName
                ? <HistoryChart instrumentName={data.instrumentName} expireDate={expiry.expireDate} onRange={(r) => setAnnHistRange(r)} optionType={optionType} strike={strike} />
                : <div className="text-[10px] opacity-40 py-4 text-center">暂无合约</div>
              }
            </div>
          </div>
          {/* ===== Greeks + IV 合并区块 ===== */}
          <div className="rounded-[1.5px] border border-[#30363D]/50 overflow-hidden">
            <div className="bg-[#1C2128]/60 px-3 py-1.5 flex items-center justify-between">
              <span className="text-[10px] text-[#8B949E] font-sans tracking-widest uppercase">Greeks</span>
            </div>
            {/* 历史图展示区（点击格子后出现） */}
            {activeMetric && data.instrumentName && (() => {
              const metaMap: Record<GreekKey, { label: string; color: string; refLine?: number }> = {
                iv:    { label: 'IV 隐含波动率', color: '#22d3ee' },
                delta: { label: 'δ Delta',       color: '#60a5fa', refLine: 0.5 },
                gamma: { label: 'γ Gamma',       color: '#a78bfa' },
                theta: { label: 'θ Theta',       color: '#fb7185' },
                vega:  { label: 'ν Vega',        color: '#34d399' },
                rho:   { label: 'ρ Rho',         color: '#fbbf24' },
              };
              const meta = metaMap[activeMetric];

              // —— Theta：剩余时间价值 ——
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
                <div className="bg-[#161B22]/60 px-3 pt-2 pb-1 border-b border-[#30363D]/40">
                  <div className="flex items-start justify-between mb-1 gap-2">
                    <div className="text-left">
                      <div className="text-[10px] font-semibold" style={{ color: meta.color }}>{meta.label} · 全量历史</div>
                      {historyRange && (
                        <div className="text-[8px] text-[#8B949E] font-sans mt-0.5">
                          {historyRange.startDate} — {historyRange.endDate} · 共 {historyRange.days} 天
                        </div>
                      )}
                    </div>
                    {/* —— IV：IVR 分位 + 均值偏离度 —— */}
                    {activeMetric === 'iv' && data.iv !== null && (
                      <div className="text-right">
                        <div className="text-[8px] text-[#8B949E] font-sans leading-tight space-y-0.5">
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
                          <span className="text-[9px] text-[#8B949E]">IVR 分位</span>
                          {ivRank !== null ? (
                            <span className="text-[10px] font-sans font-semibold" style={{
                              color: ivRank >= 70 ? '#f87171' : ivRank >= 30 ? '#fbbf24' : '#34d399'
                            }}>
                              {ivRank}%
                            </span>
                          ) : (
                            <span className="text-[9px] text-[#6E7681]">计算中...</span>
                          )}
                          {ivRank !== null && (
                            <span className="text-[9px] font-sans text-[#8B949E]">
                              {ivRank >= 70 ? '高位区' : ivRank >= 30 ? '中位区' : '低位区'}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* —— Theta 剩余时间价值 —— */}
                    {activeMetric === 'theta' && timeValueEth !== null && markEth !== null && intrinsicEth !== null && (
                      <div className="text-right">
                        <div className="text-[8px] text-[#8B949E] font-sans leading-tight space-y-0.5">
                          <div>标记价 {markEth.toFixed(4)} ETH
                            {ethPrice > 0 && <span className="text-[#6E7681]"> ≈ ${(markEth * ethPrice).toLocaleString('en-US', { maximumFractionDigits: 0 })} U</span>}
                          </div>
                          <div>内在价值 {intrinsicEth.toFixed(4)} ETH
                            {ethPrice > 0 && <span className="text-[#6E7681]"> ≈ ${(intrinsicEth * ethPrice).toLocaleString('en-US', { maximumFractionDigits: 0 })} U</span>}
                          </div>
                        </div>
                        {/* θ/ν 比值 */}
                        {thetaVegaRatio !== null && (
                          <div className="text-[8px] font-sans mt-0.5 space-y-0.5">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-[#8B949E]">θ/ν =</span>
                              <span className="font-semibold" style={{ color: thetaVegaRatio > 0.1 ? '#f87171' : thetaVegaRatio > 0.05 ? '#fbbf24' : '#34d399' }}>
                                {thetaVegaRatio.toFixed(4)}
                              </span>
                            </div>
                            {thetaVegaLabel && <div className="text-[#6E7681] text-right">{thetaVegaLabel}</div>}
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[9px] text-[#8B949E]">剩余时间价值</span>
                          <span className="text-[10px] font-sans font-semibold" style={{ color: '#fb7185' }}>
                            {timeValueEth.toFixed(4)} ETH
                          </span>
                          {timeValueUsd !== null && (
                            <span className="text-[9px] font-sans text-[#8B949E]">
                              ≈ ${timeValueUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })} U
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* —— Delta 等效持仓 —— */}
                    {activeMetric === 'delta' && data.delta !== null && deltaEquivUsd !== null && (
                      <div className="text-right">
                        <div className="text-[8px] text-[#8B949E] font-sans leading-tight space-y-0.5">
                          <div>等效持有 {data.delta.toFixed(4)} ETH
                            <span className="text-[#6E7681]"> ≈ ${deltaEquivUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })} U</span>
                          </div>
                          {deltaMove1pct !== null && (
                            <div>ETH 涨 1%，期权 +{deltaMove1pct.toFixed(2)} U</div>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[9px] text-[#8B949E]">当前 Delta</span>
                          <span className="text-[10px] font-sans font-semibold" style={{ color: '#60a5fa' }}>
                            {data.delta.toFixed(4)}
                          </span>
                          <span className="text-[9px] font-sans text-[#8B949E]">
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
                        <div className="text-[8px] text-[#8B949E] font-sans leading-tight space-y-0.5">
                          <div>ETH 涨 1%，Delta +{gammaDelta1pct.toFixed(4)}</div>
                          {gammaOptionMove1pct !== null && (
                            <div>期权额外涨 ≈ +${gammaOptionMove1pct.toFixed(2)} U</div>
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[9px] text-[#8B949E]">当前 Gamma</span>
                          <span className="text-[10px] font-sans font-semibold" style={{ color: '#a78bfa' }}>
                            {data.gamma.toFixed(6)}
                          </span>
                        </div>
                      </div>
                    )}
                    {/* —— Vega：IV 涨 1% 期权涨多少 U —— */}
                    {activeMetric === 'vega' && data.vega !== null && vegaMove1pctUsd !== null && (
                      <div className="text-right">
                        <div className="text-[8px] text-[#8B949E] font-sans leading-tight space-y-0.5">
                          <div>IV 涨 1%，期权 +{vegaMove1pctUsd.toFixed(2)} U</div>
                          {vegaMove5pctUsd !== null && (
                            <div>IV 涨 5%，期权 +{vegaMove5pctUsd.toFixed(2)} U</div>
                          )}
                        </div>
                        {/* θ/ν 比值 */}
                        {thetaVegaRatio !== null && (
                          <div className="text-[8px] font-sans mt-0.5 space-y-0.5">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-[#8B949E]">θ/ν =</span>
                              <span className="font-semibold" style={{ color: thetaVegaRatio > 0.1 ? '#f87171' : thetaVegaRatio > 0.05 ? '#fbbf24' : '#34d399' }}>
                                {thetaVegaRatio.toFixed(4)}
                              </span>
                            </div>
                            {thetaVegaLabel && <div className="text-[#6E7681] text-right">{thetaVegaLabel}</div>}
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[9px] text-[#8B949E]">当前 Vega</span>
                          <span className="text-[10px] font-sans font-semibold" style={{ color: '#34d399' }}>
                            {data.vega.toFixed(6)}
                          </span>
                        </div>
                      </div>
                    )}
                    {/* —— Rho：利率涨 1% 期权涨多少 U —— */}
                    {activeMetric === 'rho' && data.rho !== null && rhoMove1pctUsd !== null && (
                      <div className="text-right">
                        <div className="text-[8px] text-[#8B949E] font-sans leading-tight space-y-0.5">
                          <div>利率涨 1%，期权 {rhoMove1pctUsd >= 0 ? '+' : ''}{rhoMove1pctUsd.toFixed(2)} U</div>
                          <div className="text-[#6E7681]">{rhoDirection}</div>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 mt-0.5">
                          <span className="text-[9px] text-[#8B949E]">当前 Rho</span>
                          <span className="text-[10px] font-sans font-semibold" style={{ color: '#fbbf24' }}>
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
            <div className="bg-[#1C2128]/80 px-3 py-2 grid grid-cols-3 gap-x-2 gap-y-2">
              {/* 1. IV */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'iv' ? 'bg-cyan-900/40 ring-1 ring-cyan-500/40' : 'hover:bg-[#21262D]/40' }`}
                onClick={() => toggleMetric('iv')}
              >
                <div className="text-[9px] text-[#8B949E] font-sans">σ IV{ivRank !== null ? ` · IVR ${ivRank}%` : ''}</div>
                <div className="text-cyan-400 font-sans font-medium text-xs">{data.iv !== null ? `${(data.iv * 100).toFixed(1)}%` : '—'}</div>
              </button>
              {/* 2. Delta */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'delta' ? 'bg-blue-900/40 ring-1 ring-blue-500/40' : 'hover:bg-[#21262D]/40' }`}
                onClick={() => toggleMetric('delta')}
              >
                <div className="text-[9px] text-[#8B949E] font-sans">δ Delta</div>
                <div className="text-blue-400 font-sans font-medium text-xs">{fmt(data.delta, 4)}</div>
              </button>
              {/* 3. Gamma */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'gamma' ? 'bg-violet-900/40 ring-1 ring-violet-500/40' : 'hover:bg-[#21262D]/40' }`}
                onClick={() => toggleMetric('gamma')}
              >
                <div className="text-[9px] text-[#8B949E] font-sans">γ Gamma</div>
                <div className="text-violet-400 font-sans font-medium text-xs">{data.gamma !== null ? data.gamma.toFixed(6) : '—'}</div>
              </button>
              {/* 4. Theta */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'theta' ? 'bg-rose-900/40 ring-1 ring-rose-500/40' : 'hover:bg-[#21262D]/40' }`}
                onClick={() => toggleMetric('theta')}
              >
                <div className="text-[9px] text-[#8B949E] font-sans">θ Theta</div>
                <div className="text-rose-400 font-sans font-medium text-xs">{thetaDaily !== null ? thetaDaily.toFixed(6) : '—'}</div>
              </button>
              {/* 5. Vega */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'vega' ? 'bg-emerald-900/40 ring-1 ring-emerald-500/40' : 'hover:bg-[#21262D]/40' }`}
                onClick={() => toggleMetric('vega')}
              >
                <div className="text-[9px] text-[#8B949E] font-sans">ν Vega</div>
                <div className="text-emerald-400 font-sans font-medium text-xs">{data.vega !== null ? data.vega.toFixed(6) : '—'}</div>
              </button>
              {/* 6. Rho */}
              <button
                className={`text-left rounded-[1.5px] px-1.5 py-1 transition-colors ${ activeMetric === 'rho' ? 'bg-amber-900/40 ring-1 ring-amber-500/40' : 'hover:bg-[#21262D]/40' }`}
                onClick={() => toggleMetric('rho')}
              >
                <div className="text-[9px] text-[#8B949E] font-sans">ρ Rho</div>
                <div className="text-amber-400 font-sans font-medium text-xs">{data.rho !== null ? data.rho.toFixed(5) : '—'}</div>
              </button>
              {/* 7. OI */}
              <div className="px-1.5 py-1"><div className="text-[9px] text-[#8B949E] font-sans">持仓量 OI</div><div className="text-[#C9D1D9] font-sans text-xs">{data.openInterest !== null ? data.openInterest.toLocaleString() : '—'}</div></div>
              {/* 8. Lambda */}
              {lambda !== null && <div className="px-1.5 py-1"><div className="text-[9px] text-[#8B949E] font-sans">λ Lambda</div><div className="text-yellow-300 font-sans font-semibold text-xs">{lambda.toFixed(1)}x</div></div>}
              {/* 9. Break-even */}
              {breakEven !== null && <div className="px-1.5 py-1"><div className="text-[9px] text-[#8B949E] font-sans">Break-even</div><div className="text-white font-sans font-semibold text-xs">${breakEven.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>}
              {/* 10. θ/日 U */}
              {thetaUsd !== null && <div className="px-1.5 py-1"><div className="text-[9px] text-[#8B949E] font-sans">θ/日 U</div><div className="text-rose-300 font-sans font-medium text-xs">{thetaUsd >= 0 ? '+' : ''}{thetaUsd.toFixed(2)}</div></div>}
              {/* 11. ν/1%IV U */}
              {vegaUsd !== null && <div className="px-1.5 py-1"><div className="text-[9px] text-[#8B949E] font-sans">ν/1%IV U</div><div className="text-emerald-300 font-sans font-medium text-xs">{vegaUsd >= 0 ? '+' : ''}{vegaUsd.toFixed(2)}</div></div>}
              {/* 12. 权利金占比 */}
              {premiumRatio !== null && <div className="px-1.5 py-1"><div className="text-[9px] text-[#8B949E] font-sans">权利金占行权价</div><div className="text-[#C9D1D9] font-sans font-medium text-xs">{premiumRatio.toFixed(3)}%</div></div>}
            </div>
          </div>

          {/* ===== Payoff 图（卖方视角）===== */}
          {markUsdDollar !== null && (
            <div className="bg-[#1C2128] rounded-[1.5px] border border-[#30363D] overflow-hidden">
              <div className="flex items-center justify-between px-3 pt-2 pb-1.5 border-b border-[#30363D]/40">
                <span className="text-[10px] text-[#8B949E] font-sans tracking-widest uppercase">Payoff 图（卖方到期损益）</span>
                <span className="text-[9px] text-[#6E7681] font-sans">收入 = 权利金 | 上方 = 盈利</span>
              </div>
              <PayoffChart
                strike={strike}
                premium={markUsdDollar}
                ethPrice={ethPrice}
                optionType={optionType}
              />
            </div>
          )}

          <div className="rounded-[1.5px] p-3 border border-[#21262D]/60">
            <div className="text-[10px] text-[#8B949E] font-sans tracking-widest uppercase mb-1.5">合约信息</div>
            <div className="text-[11px] text-[#8B949E] font-mono">{data.instrumentName || "—"}</div>
            <div className="flex justify-between text-[10px] text-[#6E7681] font-sans mt-2">
              <span>SETTLE</span><span>ETH-MARGINED</span>
            </div>
            <div className="flex justify-between text-[10px] text-[#6E7681] font-sans mt-1">
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
  const [colorMode, setColorMode] = useState<'heatmap' | 'mono'>('heatmap');
  // 触摸预览气泡：手指按下时显示，括开手指或点击后关闭
  const [touchPreview, setTouchPreview] = useState<{
    strike: number;
    expiry: typeof EXPIRIES[0];
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
  const [allStrikes, setAllStrikes] = useState<number[]>(initCache?.allStrikes ?? []);
  // 记录哪些到期日已经完成合约列表加载
  const [loadedExpiries, setLoadedExpiries] = useState<Set<string>>(new Set());
  const [ivrReady, setIvrReady] = useState(false); // IVR加载完成标记（保留供后续使用）

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
    const lastPrice = typeof data.last_price === "number" ? data.last_price : null;
    const expiry = EXPIRIES.find(e => e.code === expiryCode);
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
        openInterest, lastPrice,
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
    const expiry = EXPIRIES.find(e => e.code === expiryCode);
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
    // 已经对这个行权价滞动过，不重复滞动
    if (lastScrolledAtmRef.current === atmStrike) return;

    // 清除上一个待执行的延迟
    if (atmScrollTimerRef.current) clearTimeout(atmScrollTimerRef.current);

    // 首次加载（lastScrolledAtmRef 为 null）延迟 200ms；后续 ATM 切换延迟 1.5s（防抖）
    const delay = lastScrolledAtmRef.current === null ? 200 : 1500;
    atmScrollTimerRef.current = setTimeout(() => {
      if (!atmRowRef.current) return;
      lastScrolledAtmRef.current = atmStrike;
      atmRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const expiry = EXPIRIES.find(e => e.code === expiryCode);
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
    <div className="min-h-screen bg-[#0D1117] text-white" >

      {/* ── 顶部栏 ── */}
      <div className="sticky top-0 z-30 bg-[#0D1117]/95 backdrop-blur border-b border-[#21262D]">
        {/* 第一行：品牌 + ETH价格 + 状态 */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
          {/* 左：品种 + CALL/PUT 切换 */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-mono font-semibold text-[#C9D1D9] tracking-widest">ETH</span>
            <span className="text-[#6E7681]">/</span>
            <div className="relative">
              <button
                className="flex items-center gap-0.5 text-[13px] font-mono font-semibold text-amber-400 tracking-widest hover:text-amber-300 transition-colors"
                onClick={() => setShowTypeMenu(v => !v)}
              >
                {optionType === 'C' ? 'CALL' : 'PUT'} ▾
              </button>
              {showTypeMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowTypeMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-[#161B22] border border-[#30363D] rounded-[1.5px] overflow-hidden shadow-xl">
                    {(['C', 'P'] as const).map(t => (
                      <button
                        key={t}
                        className={`block w-full px-4 py-2 text-left text-[13px] font-mono tracking-widest transition-colors ${
                          optionType === t
                            ? 'bg-amber-400/10 text-amber-400'
                            : 'text-[#8B949E] hover:bg-[#1C2128] hover:text-[#E6EDF3]'
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
            <span className="text-[#6E7681] text-[12px]">·</span>
            <span className="text-[12px] font-mono text-[#8B949E]">DERIBIT</span>
          </div>
          {/* 右：ETH价格 + 状态指示 */}
          <div className="flex items-center gap-3">
            {ethPrice > 0 && (
              <span className="text-[13px] font-sans font-semibold text-[#E6EDF3]">
                {ethPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-[11px] font-normal text-[#8B949E] ml-1">USD</span>
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusColor === 'text-green-400' ? 'bg-green-400' : 'bg-yellow-400'}`} />
              <span className={`text-[12px] font-mono ${statusColor}`}>{statusText}</span>
            </div>
          </div>
        </div>
        {/* 第二行：导航链接 + 时间戳 */}
        <div className="flex items-center justify-between px-4 pb-1 gap-2 border-b border-[#21262D]/40">
          <div className="flex items-center gap-0">
            <a href="/legacy" className="px-2 py-0.5 text-[13px] font-sans text-[#8B949E] hover:text-[#E6EDF3] transition-colors duration-150">分析</a>
            <span className="text-[#2D333B] text-[12px]">|</span>
            <a href="/history" className="px-2 py-0.5 text-[13px] font-sans text-[#8B949E] hover:text-[#E6EDF3] transition-colors duration-150">历史</a>
            <span className="text-[#2D333B] text-[12px]">|</span>
            <a href="/product-design" className="px-2 py-0.5 text-[13px] font-sans text-[#8B949E] hover:text-[#E6EDF3] transition-colors duration-150">谷底增筹</a>
            <span className="text-[#2D333B] text-[12px]">|</span>
            <a href="/iv-smile" className="px-2 py-0.5 text-[13px] font-sans text-amber-400/80 hover:text-amber-300 transition-colors duration-150">IV Smile</a>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* 颜色模式切换 */}
            <button
              onClick={() => setColorMode(m => m === 'heatmap' ? 'mono' : 'heatmap')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-[1.5px] text-[9px] font-sans font-medium border transition-all duration-150 ${
                colorMode === 'heatmap'
                  ? 'bg-[#21262D] text-amber-300 border-amber-400/30'
                  : 'bg-[#21262D] text-[#8B949E] border-[#30363D]'
              }`}
              title={colorMode === 'heatmap' ? '切换为单色模式' : '切换为热力图模式'}
            >
              {colorMode === 'heatmap' ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="0" y="0" width="4" height="4" rx="0.5" fill="#4ade80" />
                  <rect x="6" y="0" width="4" height="4" rx="0.5" fill="#facc15" />
                  <rect x="0" y="6" width="4" height="4" rx="0.5" fill="#fb923c" />
                  <rect x="6" y="6" width="4" height="4" rx="0.5" fill="#f87171" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <rect x="0" y="0" width="4" height="4" rx="0.5" fill="#374151" />
                  <rect x="6" y="0" width="4" height="4" rx="0.5" fill="#4B5563" />
                  <rect x="0" y="6" width="4" height="4" rx="0.5" fill="#374151" />
                  <rect x="6" y="6" width="4" height="4" rx="0.5" fill="#4B5563" />
                </svg>
              )}
              {colorMode === 'heatmap' ? '热力' : '单色'}
            </button>
            <div className="text-[9px] font-sans text-[#4B5563]">{lastUpdate}</div>
          </div>
        </div>
        {/* 第三行：年化区间筛选器 */}
        <div className="flex items-center gap-1 px-3 py-1.5 overflow-x-auto scrollbar-none">
          <span className="text-[9px] font-sans text-[#4B5563] shrink-0 mr-1">筛选</span>
          {([
            { label: '全部', range: null },
            { label: '<10%', range: [0, 0.10] as [number,number] },
            { label: '10-20%', range: [0.10, 0.20] as [number,number] },
            { label: '20-30%', range: [0.20, 0.30] as [number,number] },
            { label: '30-50%', range: [0.30, 0.50] as [number,number] },
            { label: '>50%', range: [0.50, Infinity] as [number,number] },
          ] as const).map(({ label, range }) => {
            const isActive = range === null
              ? annFilter === null
              : annFilter !== null && annFilter[0] === range[0] && annFilter[1] === range[1];
            return (
              <button
                key={label}
                onClick={() => setAnnFilter(range)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-sans font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                    : 'text-[#6E7681] border border-[#21262D] hover:text-[#C9D1D9] hover:border-[#30363D]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 矩阵表 ── */}
      <div
        ref={tableContainerRef}
        className="overflow-x-auto"
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
        <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "64px" }} />
            {EXPIRIES.map(e => <col key={e.code} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-[#21262D]">
              <th className="text-[10px] text-[#8B949E] font-mono py-1 px-1 text-left tracking-wider">行权价</th>
              {EXPIRIES.map(e => {
                const days = calcDaysLeft(e.expireDate);
                return (
                  <th key={e.code} className="text-center py-1 px-0.5">
                    <div className="text-[11px] font-semibold text-[#E6EDF3]">{e.label}</div>
                    <div className="text-[9px] text-[#8B949E] font-mono">{days}D</div>
                    <div className="text-[8px] text-[#6E7681] mt-0.5 font-mono">
                      <span className="text-amber-600">Ann.</span>
                      <span className="text-[#6E7681] mx-0.5">/</span>
                      <span className="text-cyan-700">IVR</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {allStrikes.length === 0 ? (
              <>
                {Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={i} className="border-b border-[#21262D]/50">
                    {/* 行权价列 */}
                      <td className="py-0.5 px-1">
                      <div
                        className="h-3 rounded-[1.5px] bg-[#1C2128] animate-pulse"
                        style={{ width: i % 3 === 0 ? 36 : i % 3 === 1 ? 28 : 32, animationDelay: `${i * 40}ms` }}
                      />
                    </td>
                    {/* 各到期日列 */}
                    {EXPIRIES.map((e, j) => (
                        <td key={e.code} className="py-0.5 px-0.5">
                          <div
                            className="w-full rounded-[1.5px] py-1 flex flex-col items-center gap-1 bg-[#1C2128]/60 animate-pulse"
                          style={{ animationDelay: `${i * 40 + j * 60}ms` }}
                        >
                          <div className="h-2.5 rounded-[1.5px] bg-[#21262D]" style={{ width: '60%' }} />
                          <div className="h-1.5 rounded-[1.5px] bg-[#21262D]/60" style={{ width: '40%' }} />
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
                  className={`border-b border-[#21262D]/50 ${isAtm ? "bg-amber-500/[0.07] ring-1 ring-inset ring-amber-500/20" : ""}`}
                >
                    <td className="py-0.5 px-1 text-center">
                    {isAtm ? (
                      <div className="flex flex-col items-center gap-0">
                        <div className="text-[11px] font-sans font-semibold text-amber-400 leading-tight">
                          {strike.toLocaleString()}
                        </div>
                        <div className="text-[8px] font-sans font-bold text-amber-400 leading-tight tracking-widest">ATM</div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0">
                        <div className="text-[11px] font-sans text-[#C9D1D9] leading-tight">
                          {strike.toLocaleString()}
                        </div>
                        {ethPrice > 0 && (
                          <div className={`text-[8px] font-sans leading-tight ${
                            strike > ethPrice ? 'text-rose-400/70' : 'text-emerald-400/70'
                          }`}>
                            {strike > ethPrice ? '+' : ''}{(((strike - ethPrice) / ethPrice) * 100).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  {EXPIRIES.map((expiry, expiryIdx) => {
                    const key = `${strike}-${expiry.code}`;
                    const cell = matrix.get(key) ?? null;
                    const ann = cell?.annualized ?? null;
                    const ivr = cell ? ivrCacheRef.current.get(cell.instrumentName)?.ivr ?? null : null;
                    const expiryLoaded = loadedExpiries.has(expiry.code);
                    const contractExists = existMap.get(expiry.code)?.has(strike) ?? false;
                    const delay = strikeIdx * 30;

                    // 无合约：留空深色格子（与有数据格子等高：py-2 + 双行占位）
                    if (expiryLoaded && !contractExists) {
                      return (
                        <td key={expiry.code} className="py-0.5 px-0.5">
                          <div className="w-full rounded-[1.5px] py-1 text-center text-[11px] font-semibold border bg-[#161B22]/40 border-[#21262D]/30 flex flex-col items-center justify-center gap-0.5">
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                              <circle cx="6" cy="6" r="5" stroke="#374151" strokeWidth="1"/>
                              <line x1="4" y1="4" x2="8" y2="8" stroke="#4B5563" strokeWidth="1" strokeLinecap="round"/>
                              <line x1="8" y1="4" x2="4" y2="8" stroke="#4B5563" strokeWidth="1" strokeLinecap="round"/>
                            </svg>
                            {/* 占位行，与有数据格子的 IVR 行等高 */}
                            <div className="text-[9px] leading-tight" style={{ visibility: 'hidden' }}>—</div>
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
                      let numColor = colorMode === 'heatmap' ? '#0D1117' : 'inherit';
                      if (prev !== null && Math.abs(ann - prev) > 0.00001) {
                        arrowChar = ann > prev ? '▲' : '▼';
                        // 涨了显红（成本上升），跌了显绿（成本下降）
                        arrowColor = ann > prev ? '#dc2626' : '#16a34a';
                        if (colorMode === 'heatmap') numColor = ann > prev ? '#7f1d1d' : '#14532d';
                      }
                      return <>
                        <span style={{ display: 'inline-block', width: '0.75em', textAlign: 'center', color: arrowColor, fontSize: '0.65em', marginRight: '2px', verticalAlign: 'middle' }}>{arrowChar}</span>
                        <span style={{ color: numColor }}>{(ann * 100).toFixed(2)}%</span>
                      </>;
                    })();

                    const ivrContent = (() => {
                      if (ivr === null) return <span className="text-[#6E7681]">—</span>;
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
                          className={`w-full rounded-[1.5px] text-center text-[11px] font-sans font-semibold border transition-all duration-200 active:scale-95 active:opacity-70 text-white ${annualizedBorder(ann)} ${flashClass}`}
                          style={{
                            backgroundColor: ann !== null
                              ? (colorMode === 'heatmap' ? ANN_BG[annualizedColor(ann)] : 'rgba(33,38,45,0.9)')
                              : '#1C2128',
                            borderColor: ann !== null
                              ? (colorMode === 'heatmap' ? ANN_BORDER[annualizedColor(ann)] : 'rgba(48,54,61,0.5)')
                              : 'rgba(48,54,61,0.3)',
                            color: ann !== null ? 'white' : '#6E7681',
                            opacity: inFilterRange ? 1 : 0.18,
                            transform: inFilterRange ? 'scale(1)' : 'scale(0.97)',
                            // 增大点击热区：内边距加大，让手指更容易触到
                            padding: '6px 3px',
                            minHeight: '36px',
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
                          {/* 上行：年化 Ann. */}
                          <div className="leading-tight">{annContent}</div>
                          {/* 下行：IVR（小字，颜色独立） */}
                          <div className="text-[10px] font-normal leading-tight mt-0.5 opacity-80">{ivrContent}</div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-4 px-3 py-2.5 text-[10px] font-sans border-t border-[#21262D]/60">
        {optionType === 'P' ? (
          <>
            <span className="text-emerald-500">≤10%</span>
            <span className="text-green-400">≤20%</span>
            <span className="text-yellow-400">≤30%</span>
            <span className="text-red-400">&gt;30%</span>
            <span className="text-[#6E7681] ml-1 text-[9px]">权利金/行权价年化</span>
          </>
        ) : (
          <>
            <span className="text-emerald-500">≤18%</span>
            <span className="text-green-400">≤24%</span>
            <span className="text-yellow-400">≤30%</span>
            <span className="text-red-400">&gt;30%</span>
          </>
        )}
        <span className="text-[#6E7681] ml-auto">N/A</span>
      </div>



      {detail && <DetailModal cell={detail} onClose={() => setDetail(null)} optionType={optionType} />}

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
        const annColor = ann === null ? '#6E7681'
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
            <div className="bg-[#1C2128]/95 backdrop-blur-xl border border-[#30363D] rounded-[1.5px] shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)' }}>
              {/* 标题行 */}
              <div className="px-3 pt-2.5 pb-1.5 border-b border-[#21262D]/60 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold font-sans text-[#E6EDF3]">{strike.toLocaleString()}</span>
                  <span className="text-[9px] font-sans px-1 py-0.5 rounded-[1.5px]" style={{ background: optionType === 'C' ? 'rgba(34,197,94,0.2)' : 'rgba(248,113,113,0.2)', color: optionType === 'C' ? '#4ade80' : '#f87171' }}>{optionType === 'C' ? 'CALL' : 'PUT'}</span>
                </div>
                <span className="text-[9px] font-sans text-[#8B949E]">{expiry.label} {daysLeft}D</span>
              </div>
              {/* 数据网格：内容切换时淡入 */}
              <div key={contentKey} className="grid grid-cols-2 gap-0 divide-x divide-[#21262D]/40 bubble-content-fade">
                <div className="px-3 py-2">
                  <div className="text-[8px] font-sans text-[#6E7681] mb-0.5">{optionType === 'C' ? '年化收益' : 'PUT 年化'}</div>
                  <div className="text-[16px] font-bold font-sans leading-tight" style={{ color: annColor }}>{annPct}</div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[8px] font-sans text-[#6E7681] mb-0.5">IVR 百分位</div>
                  <div className={`text-[14px] font-bold font-sans leading-tight ${
                    ivr !== null && ivr >= 70 ? 'text-orange-300' : ivr !== null && ivr <= 30 ? 'text-emerald-300' : 'text-cyan-300'
                  }`}>{ivrStr}</div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[8px] font-sans text-[#6E7681] mb-0.5">Mark 价格</div>
                  <div className="text-[12px] font-semibold font-sans text-[#C9D1D9]">{markStr}</div>
                </div>
                <div className="px-3 py-2">
                  <div className="text-[8px] font-sans text-[#6E7681] mb-0.5">Delta</div>
                  <div className="text-[12px] font-semibold font-sans text-[#C9D1D9]">{delta !== null ? delta.toFixed(3) : '—'}</div>
                </div>
              </div>
              {/* 底部提示 */}
              <div className="px-3 py-1.5 border-t border-[#21262D]/40">
                <div className="text-[8px] font-sans text-[#4B5563] text-center">点击查看完整详情</div>
              </div>
            </div>
            {/* 尖角指向格子 */}
            <div className="flex justify-center">
              <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #30363D' }} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
