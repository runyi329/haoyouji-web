/**
 * 产品方案页 — 谷底增筹（单页滚动版）
 * 设计语言：与 AnnualizedChain 保持一致
 * - 背景：#0D1117 / #161B22 / #1C2128
 * - 字体：DM Sans (font-sans)，数值用 tabular-nums
 * - 强调色：琥珀 #F0B429 / 蓝 #F0883E / 绿 #3FB950 / 红 #F85149
 * 叙事逻辑：以客户视角为主——客户能赚多少、最坏亏多少、适合什么场景
 * 布局：单页滚动，能并排的区块A/B左右对比，内容多的区块用A/B切换按钮
 */

import { useState, useRef, useEffect, useCallback } from "react";

// ─── 公式核心 ──────────────────────────────────────────────────
function calcRatio(n: number): number {
  if (n === 0) return 1;
  return Math.min(1, 1 / 0.75 / (n + 1));
}

const STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// 根据分润比例计算颜色：33(最小)→绿，87(最大)→红
function pctColor(pct: number): string {
  const MIN = 33, MAX = 87;
  const t = Math.max(0, Math.min(1, (pct - MIN) / (MAX - MIN)));
  if (t < 0.5) {
    const u = t / 0.5;
    const r = Math.round(0x3F + (0xF0 - 0x3F) * u);
    const g = Math.round(0xB9 + (0x88 - 0xB9) * u);
    const b = Math.round(0x50 + (0x3E - 0x50) * u);
    return `rgb(${r},${g},${b})`;
  } else {
    const u = (t - 0.5) / 0.5;
    const r = Math.round(0xF0 + (0xF8 - 0xF0) * u);
    const g = Math.round(0x88 + (0x51 - 0x88) * u);
    const b = Math.round(0x3E + (0x49 - 0x3E) * u);
    return `rgb(${r},${g},${b})`;
  }
}

const NOTIONAL = 1000;
const MONTHS = 11.7;

// ─── 实时 ETH 价格 Hook ─────────────────────────────────────────
function useEthPrice() {
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(2000);

  const connect = useCallback(() => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
    wsRef.current = ws;

    ws.onopen = () => {
      delayRef.current = 2000;
      ws.send(JSON.stringify({
        jsonrpc: "2.0", id: 9999, method: "public/subscribe",
        params: { channels: ["ticker.ETH-PERPETUAL.100ms"] }
      }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.method === "subscription" && msg.params?.channel?.startsWith("ticker.ETH-PERPETUAL")) {
          const p = msg.params.data?.mark_price;
          if (p) setEthPrice(p);
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {};
    ws.onclose = () => {
      timerRef.current = setTimeout(() => {
        delayRef.current = Math.min(delayRef.current * 1.5, 30000);
        connect();
      }, delayRef.current);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [connect]);

  return ethPrice;
}

// ─── 迷你 SVG 柱状图 ──────────────────────────────────────────
function MiniBarChart({ data, colorA, labelA }: { data: { label: string; a: number }[]; colorA: string; labelA: string }) {
  const maxVal = 100;
  const W = 300;
  const H = 150;
  const n = data.length;
  const barW = Math.max(8, Math.floor((W - 32) / n - 4));
  const groupW = barW + Math.max(2, Math.floor((W - 32 - barW * n) / Math.max(n - 1, 1)));
  const padL = 28;
  const padT = 8;
  const xLabelH = 14;
  const legendH = 14;
  const chartH = H - padT - xLabelH - legendH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
      {[0, 25, 50, 75, 100].map(v => {
        const y = padT + chartH * (1 - v / maxVal);
        return (
          <g key={v}>
            <line x1={padL} y1={y} x2={W - 4} y2={y} stroke="#30363D" strokeWidth={0.5} />
            <text x={padL - 4} y={y + 3} textAnchor="end" fill="#6E7681" fontSize={7}>{v}%</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = padL + i * groupW;
        const hA = (d.a / maxVal) * chartH;
        const xLabelY = padT + chartH + xLabelH - 2;
        return (
          <g key={d.label}>
            <rect x={x} y={padT + chartH - hA} width={barW} height={hA} fill={colorA} rx={2} opacity={0.85} />
            <text x={x + barW / 2} y={xLabelY} textAnchor="middle" fill="#6E7681" fontSize={6.5}>{d.label}%</text>
          </g>
        );
      })}
      <rect x={padL} y={H - legendH + 3} width={6} height={6} fill={colorA} rx={1} />
      <text x={padL + 8} y={H - legendH + 9} fill="#8B949E" fontSize={7}>{labelA}</text>
    </svg>
  );
}

// ─── 指标卡片 ──────────────────────────────────────────────────
function MetricCard({ label, value, sub, color = "#F0B429" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border rounded-xl p-4 flex flex-col gap-1 relative overflow-hidden" style={{ background: "#161B22", borderColor: "#21262D" }}>
      <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none" style={{ background: `linear-gradient(to top, ${color}12, transparent)` }} />
      <div className="text-[11px] text-[#6E7681] font-sans tracking-wide whitespace-nowrap">{label}</div>
      <div className="font-sans font-bold tabular-nums leading-none whitespace-nowrap" style={{ color, fontSize: 'clamp(14px, 4.5vw, 22px)' }}>{value}</div>
      {sub && <div className="text-[11px] font-sans" style={{ color: `${color}99` }}>{sub}</div>}
    </div>
  );
}

// ─── 信息行 ──────────────────────────────────────────────────
function InfoRow({ label, value, highlight, color }: { label: string; value: string; highlight?: boolean; color?: string }) {
  const accentColor = color || "#F0B429";
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#21262D] last:border-0 pl-4 pr-4 relative" style={highlight ? { background: `${accentColor}08` } : {}}>
      {highlight && <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r" style={{ background: accentColor }} />}
      <span className="text-[#8B949E] text-[13px] font-sans shrink-0 mr-3">{label}</span>
      <span className="text-[13px] font-sans font-semibold tabular-nums text-right whitespace-nowrap" style={{ color: highlight ? accentColor : "#E6EDF3" }}>{value}</span>
    </div>
  );
}

// ─── 场景评分星星 ──────────────────────────────────────────────
function Stars({ count, max = 5, color }: { count: number; max?: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className="w-2 h-2 rounded-full" style={{ background: i < count ? color : "#30363D" }} />
      ))}
    </div>
  );
}

// ─── 谷底增筹A 收益曲线图 ──────────────────────────────────────
function ProductAPayoffChart({ ethEntry }: { ethEntry: number }) {
  const W = 320; const H = 200; const padL = 44; const padR = 16; const padT = 16; const padB = 32;
  const chartW = W - padL - padR; const chartH = H - padT - padB;

  const dataPoints = Array.from({ length: 21 }, (_, i) => {
    const pct = i * 5;
    const n = Math.floor(pct / 10);
    const ratio = calcRatio(n);
    const clientPct = 1 - ratio;
    const gain = (ethEntry * pct / 100) * (NOTIONAL / ethEntry);
    const fee = NOTIONAL * 0.025 * MONTHS;
    const clientNet = gain * clientPct - fee;
    return { pct, clientNet };
  });

  const minNet = Math.min(...dataPoints.map(d => d.clientNet));
  const maxNet = Math.max(...dataPoints.map(d => d.clientNet));
  const netRange = maxNet - minNet;
  const yPad = netRange * 0.1;
  const yMin = minNet - yPad; const yMax = maxNet + yPad;

  const toX = (pct: number) => padL + (pct / 100) * chartW;
  const toY = (net: number) => padT + chartH * (1 - (net - yMin) / (yMax - yMin));

  const breakEvenPct = (() => {
    for (let i = 0; i < dataPoints.length - 1; i++) {
      const a = dataPoints[i]; const b = dataPoints[i + 1];
      if (a.clientNet <= 0 && b.clientNet >= 0) {
        const t = -a.clientNet / (b.clientNet - a.clientNet);
        return a.pct + t * (b.pct - a.pct);
      }
    }
    return null;
  })();

  const zeroY = toY(0);
  const linePath = dataPoints.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(d.pct)} ${toY(d.clientNet)}`).join(' ');
  const profitPoints = dataPoints.filter(d => d.clientNet >= 0);
  const profitAreaPath = profitPoints.length > 1 ? [`M ${toX(profitPoints[0].pct)} ${zeroY}`, ...profitPoints.map(d => `L ${toX(d.pct)} ${toY(d.clientNet)}`), `L ${toX(profitPoints[profitPoints.length - 1].pct)} ${zeroY}`, 'Z'].join(' ') : '';
  const lossPoints = dataPoints.filter(d => d.clientNet <= 0);
  const lossAreaPath = lossPoints.length > 1 ? [`M ${toX(lossPoints[0].pct)} ${zeroY}`, ...lossPoints.map(d => `L ${toX(d.pct)} ${toY(d.clientNet)}`), `L ${toX(lossPoints[lossPoints.length - 1].pct)} ${zeroY}`, 'Z'].join(' ') : '';
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((yMin + (yMax - yMin) * (i / 4)) / 10) * 10);
  const xTicks = [0, 20, 40, 60, 80, 100];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }}>
        <defs>
          <linearGradient id="profitGradA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3FB950" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3FB950" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="lossGradA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F85149" stopOpacity={0.02} />
            <stop offset="100%" stopColor="#F85149" stopOpacity={0.25} />
          </linearGradient>
        </defs>
        {yTicks.map(v => {
          const y = toY(v);
          if (y < padT - 2 || y > padT + chartH + 2) return null;
          return (
            <g key={v}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#21262D" strokeWidth={0.8} />
              <text x={padL - 4} y={y + 3.5} textAnchor="end" fill="#6E7681" fontSize={7.5}>{v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`}</text>
            </g>
          );
        })}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#484F58" strokeWidth={1} strokeDasharray="4 3" />
        {lossAreaPath && <path d={lossAreaPath} fill="url(#lossGradA)" />}
        {profitAreaPath && <path d={profitAreaPath} fill="url(#profitGradA)" />}
        <path d={linePath} fill="none" stroke="#F0883E" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {breakEvenPct !== null && (
          <g>
            <line x1={toX(breakEvenPct)} y1={padT} x2={toX(breakEvenPct)} y2={padT + chartH} stroke="#F0B429" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
            <circle cx={toX(breakEvenPct)} cy={zeroY} r={4} fill="#F0B429" stroke="#0D1117" strokeWidth={1.5} />
            <rect x={toX(breakEvenPct) - 14} y={padT + 2} width={28} height={13} rx={3} fill="#F0B42920" stroke="#F0B42940" />
            <text x={toX(breakEvenPct)} y={padT + 11} textAnchor="middle" fill="#F0B429" fontSize={7.5} fontWeight="600">+{breakEvenPct.toFixed(0)}%</text>
          </g>
        )}
        {dataPoints.filter(d => d.pct % 20 === 0 && d.pct > 0).map(d => (
          <g key={d.pct}>
            <circle cx={toX(d.pct)} cy={toY(d.clientNet)} r={3} fill={d.clientNet >= 0 ? "#3FB950" : "#F85149"} stroke="#0D1117" strokeWidth={1.2} />
            <text x={toX(d.pct)} y={toY(d.clientNet) - 6} textAnchor="middle" fill={d.clientNet >= 0 ? "#3FB950" : "#F85149"} fontSize={7} fontWeight="600">{d.clientNet >= 0 ? '+' : ''}${d.clientNet.toFixed(0)}</text>
          </g>
        ))}
        <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#30363D" strokeWidth={1} />
        {xTicks.map(v => (
          <g key={v}>
            <line x1={toX(v)} y1={padT + chartH} x2={toX(v)} y2={padT + chartH + 3} stroke="#30363D" strokeWidth={1} />
            <text x={toX(v)} y={padT + chartH + 12} textAnchor="middle" fill="#6E7681" fontSize={8}>+{v}%</text>
          </g>
        ))}
        <text x={padL + 4} y={padT + chartH - 6} fill="#F85149" fontSize={7} opacity={0.7}>亏损区</text>
        <text x={W - padR - 4} y={padT + 10} textAnchor="end" fill="#3FB950" fontSize={7} opacity={0.7}>盈利区</text>
      </svg>
      <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ background: "#F0883E" }} />
          <span className="text-[13px] text-[#6E7681]">客户净收益</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: "#F0B429" }} />
          <span className="text-[13px] text-[#6E7681]">盈亏平衡点</span>
        </div>
      </div>
    </div>
  );
}

// ─── 谷底增筹B 多曲线收益图 ──────────────────────────────────────
function ProductBPayoffChart({ ethEntry }: { ethEntry: number }) {
  const W = 320; const H = 210; const padL = 44; const padR = 16; const padT = 16; const padB = 32;
  const chartW = W - padL - padR; const chartH = H - padT - padB;

  const drawdownScenarios = [
    { drawdowns: 0, color: "#3FB950", label: "0次回撤" },
    { drawdowns: 1, color: "#F0B429", label: "1次回撤" },
    { drawdowns: 2, color: "#58A6FF", label: "2次回撤" },
    { drawdowns: 3, color: "#F85149", label: "3次回撤" },
  ];

  const feeB = NOTIONAL * 0.015 * MONTHS;
  const allData = drawdownScenarios.map(s => ({
    ...s,
    points: Array.from({ length: 21 }, (_, i) => {
      const pct = i * 5;
      const gain = (ethEntry * pct / 100) * (NOTIONAL / ethEntry);
      const ratioB = calcRatio(s.drawdowns);
      const clientNet = gain * ratioB - feeB;
      return { pct, clientNet };
    }),
  }));

  const allNets = allData.flatMap(s => s.points.map(p => p.clientNet));
  const minNet = Math.min(...allNets); const maxNet = Math.max(...allNets);
  const netRange = maxNet - minNet; const yPad = netRange * 0.08;
  const yMin = minNet - yPad; const yMax = maxNet + yPad;

  const toX = (pct: number) => padL + (pct / 100) * chartW;
  const toY = (net: number) => padT + chartH * (1 - (net - yMin) / (yMax - yMin));
  const zeroY = toY(0);
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((yMin + (yMax - yMin) * (i / 4)) / 10) * 10);
  const xTicks = [0, 20, 40, 60, 80, 100];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 230 }}>
        {yTicks.map(v => {
          const y = toY(v);
          if (y < padT - 2 || y > padT + chartH + 2) return null;
          return (
            <g key={v}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#21262D" strokeWidth={0.8} />
              <text x={padL - 4} y={y + 3.5} textAnchor="end" fill="#6E7681" fontSize={7.5}>{v >= 0 ? `+$${v}` : `-$${Math.abs(v)}`}</text>
            </g>
          );
        })}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#484F58" strokeWidth={1} strokeDasharray="4 3" />
        {allData.map(s => {
          const path = s.points.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(d.pct)} ${toY(d.clientNet)}`).join(' ');
          return (
            <path key={s.drawdowns} d={path} fill="none" stroke={s.color} strokeWidth={s.drawdowns === 0 ? 2.2 : 1.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.drawdowns >= 2 ? (s.drawdowns === 2 ? "5 3" : "3 3") : undefined} opacity={s.drawdowns === 0 ? 1 : 0.85} />
          );
        })}
        {allData.map(s => {
          const last = s.points[s.points.length - 1];
          return <text key={s.drawdowns} x={toX(last.pct) + 3} y={toY(last.clientNet) + 3.5} fill={s.color} fontSize={7} fontWeight="600">${last.clientNet.toFixed(0)}</text>;
        })}
        <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#30363D" strokeWidth={1} />
        {xTicks.map(v => (
          <g key={v}>
            <line x1={toX(v)} y1={padT + chartH} x2={toX(v)} y2={padT + chartH + 3} stroke="#30363D" strokeWidth={1} />
            <text x={toX(v)} y={padT + chartH + 12} textAnchor="middle" fill="#6E7681" fontSize={8}>+{v}%</text>
          </g>
        ))}
        <text x={padL + 4} y={padT + chartH - 6} fill="#F85149" fontSize={7} opacity={0.7}>亏损区</text>
      </svg>
      <div className="flex items-center gap-3 mt-2 px-1 flex-wrap">
        {drawdownScenarios.map(s => (
          <div key={s.drawdowns} className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded" style={{ background: s.color }} />
            <span className="text-[13px] text-[#6E7681]">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── A/B 融合对比收益图（带回撤滑块）──────────────────────────────
function CombinedPayoffChart({ ethEntry, drawdownPct, notional }: { ethEntry: number; drawdownPct: number; notional: number }) {
  const W = 320; const H = 220; const padL = 46; const padR = 16; const padT = 16; const padB = 32;
  const chartW = W - padL - padR; const chartH = H - padT - padB;

  const nDrawdown = Math.round(drawdownPct / 11);
  const feeA = notional * 0.025 * MONTHS;
  const feeB = notional * 0.015 * MONTHS;
  const ratioA = calcRatio(nDrawdown); // A: 回撤稀释分润
  const ratioB = calcRatio(0);          // B: 下跌不影响收益权，始终0次回撤

  const dataA = Array.from({ length: 21 }, (_, i) => {
    const pct = i * 5;
    const gain = (ethEntry * pct / 100) * (notional / ethEntry);
    return { pct, net: gain * (1 - ratioA) - feeA };
  });
  const dataB = Array.from({ length: 21 }, (_, i) => {
    const pct = i * 5;
    const gain = (ethEntry * pct / 100) * (notional / ethEntry);
    return { pct, net: gain * ratioB - feeB };
  });

  const allNets = [...dataA.map(d => d.net), ...dataB.map(d => d.net)];
  const minNet = Math.min(...allNets); const maxNet = Math.max(...allNets);
  const pad = (maxNet - minNet) * 0.1;
  const yMin = minNet - pad; const yMax = maxNet + pad;

  const toX = (pct: number) => padL + (pct / 100) * chartW;
  const toY = (net: number) => padT + chartH * (1 - (net - yMin) / (yMax - yMin));
  const zeroY = toY(0);

  const pathA = dataA.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(d.pct)} ${toY(d.net)}`).join(' ');
  const pathB = dataB.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(d.pct)} ${toY(d.net)}`).join(' ');

  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((yMin + (yMax - yMin) * (i / 4)) / 10) * 10);
  const xTicks = [0, 20, 40, 60, 80, 100];

  // 盈亏平衡点
  const breakA = (() => { for (let i = 0; i < dataA.length - 1; i++) { const a = dataA[i], b = dataA[i+1]; if (a.net <= 0 && b.net >= 0) { const t = -a.net/(b.net-a.net); return a.pct + t*(b.pct-a.pct); } } return null; })();
  const breakB = (() => { for (let i = 0; i < dataB.length - 1; i++) { const a = dataB[i], b = dataB[i+1]; if (a.net <= 0 && b.net >= 0) { const t = -a.net/(b.net-a.net); return a.pct + t*(b.pct-a.pct); } } return null; })();

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
        <defs>
          <linearGradient id="cgA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#58A6FF" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#58A6FF" stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="cgB" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F0883E" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#F0883E" stopOpacity={0.01} />
          </linearGradient>
        </defs>
        {yTicks.map(v => { const y = toY(v); if (y < padT-2 || y > padT+chartH+2) return null; return (<g key={v}><line x1={padL} y1={y} x2={W-padR} y2={y} stroke="#21262D" strokeWidth={0.8}/><text x={padL-4} y={y+3.5} textAnchor="end" fill="#6E7681" fontSize={7.5}>{v>=0?`+$${v}`:`-$${Math.abs(v)}`}</text></g>); })}
        <line x1={padL} y1={zeroY} x2={W-padR} y2={zeroY} stroke="#484F58" strokeWidth={1} strokeDasharray="4 3"/>
        {/* 面积填充 */}
        <path d={[`M ${toX(0)} ${zeroY}`, ...dataA.filter(d=>d.net>=0).map(d=>`L ${toX(d.pct)} ${toY(d.net)}`), dataA.filter(d=>d.net>=0).length>0?`L ${toX(dataA.filter(d=>d.net>=0).slice(-1)[0].pct)} ${zeroY}`:'',' Z'].join(' ')} fill="url(#cgA)"/>
        <path d={[`M ${toX(0)} ${zeroY}`, ...dataB.filter(d=>d.net>=0).map(d=>`L ${toX(d.pct)} ${toY(d.net)}`), dataB.filter(d=>d.net>=0).length>0?`L ${toX(dataB.filter(d=>d.net>=0).slice(-1)[0].pct)} ${zeroY}`:'',' Z'].join(' ')} fill="url(#cgB)"/>
        {/* 曲线 */}
        <path d={pathA} fill="none" stroke="#58A6FF" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
        <path d={pathB} fill="none" stroke="#F0883E" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 3"/>
        {/* 盈亏平衡点 */}
        {breakA!==null && <g><circle cx={toX(breakA)} cy={zeroY} r={3.5} fill="#58A6FF" stroke="#0D1117" strokeWidth={1.5}/><text x={toX(breakA)} y={zeroY-7} textAnchor="middle" fill="#58A6FF" fontSize={7} fontWeight="600">+{breakA.toFixed(0)}%</text></g>}
        {breakB!==null && <g><circle cx={toX(breakB)} cy={zeroY} r={3.5} fill="#F0883E" stroke="#0D1117" strokeWidth={1.5}/><text x={toX(breakB)} y={zeroY+14} textAnchor="middle" fill="#F0883E" fontSize={7} fontWeight="600">+{breakB.toFixed(0)}%</text></g>}
        {/* 终点标注 */}
        {(() => { const last = dataA[dataA.length-1]; return <text x={toX(last.pct)+3} y={toY(last.net)+3.5} fill="#58A6FF" fontSize={7} fontWeight="600">{last.net>=0?'+':''}{last.net.toFixed(0)}</text>; })()}
        {(() => { const last = dataB[dataB.length-1]; return <text x={toX(last.pct)+3} y={toY(last.net)+3.5} fill="#F0883E" fontSize={7} fontWeight="600">{last.net>=0?'+':''}{last.net.toFixed(0)}</text>; })()}
        <line x1={padL} y1={padT+chartH} x2={W-padR} y2={padT+chartH} stroke="#30363D" strokeWidth={1}/>
        {xTicks.map(v => (<g key={v}><line x1={toX(v)} y1={padT+chartH} x2={toX(v)} y2={padT+chartH+3} stroke="#30363D" strokeWidth={1}/><text x={toX(v)} y={padT+chartH+12} textAnchor="middle" fill="#6E7681" fontSize={8}>+{v}%</text></g>))}
        <text x={padL+4} y={padT+chartH-6} fill="#F85149" fontSize={7} opacity={0.7}>亏损区</text>
      </svg>
      <div className="flex items-center gap-4 mt-2 px-1 flex-wrap">
        <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 rounded" style={{background:"#58A6FF"}}/><span className="text-[13px] text-[#6E7681]">增筹A（回撤{drawdownPct}%）</span></div>
        <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 rounded" style={{background:"#F0883E",borderTop:"1px dashed #F0883E"}}/><span className="text-[13px] text-[#6E7681]">增筹B（不受回撤影响）</span></div>
      </div>
    </div>
  );
}

// ─── 收益权稀释折线图 ──────────────────────────────────────────
function DrawdownLineChart() {
  const W = 320; const H = 180; const padL = 36; const padR = 12; const padT = 12; const padB = 28;
  const chartW = W - padL - padR; const chartH = H - padT - padB;
  const xTicks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const yTicks = [0, 25, 50, 75, 100];
  const toX = (n: number) => padL + (n / 9) * chartW;
  const toY = (pct: number) => padT + chartH * (1 - pct / 100);
  function getRatioAfterN(n: number): number { return calcRatio(n) * 100; }
  const points = xTicks.map(n => ({ x: toX(n), y: toY(getRatioAfterN(n)) }));
  const polyline = points.map(p => `${p.x},${p.y}`).join(" ");
  const areaPath = [`M ${points[0].x} ${toY(0)}`, ...points.map(p => `L ${p.x} ${p.y}`), `L ${points[points.length - 1].x} ${toY(0)}`, "Z"].join(" ");
  const dangerX = toX(2);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        <defs>
          <linearGradient id="dilutionGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#58A6FF" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#58A6FF" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <rect x={dangerX} y={padT} width={W - padR - dangerX} height={chartH} fill="#F8514908" />
        {yTicks.map(v => {
          const y = toY(v);
          return (
            <g key={v}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#21262D" strokeWidth={0.8} />
              <text x={padL - 5} y={y + 3.5} textAnchor="end" fill="#6E7681" fontSize={8}>{v}%</text>
            </g>
          );
        })}
        <line x1={padL} y1={toY(50)} x2={W - padR} y2={toY(50)} stroke="#F85149" strokeWidth={0.8} strokeDasharray="3 3" opacity={0.6} />
        <text x={W - padR + 2} y={toY(50) + 3.5} fill="#F85149" fontSize={7} opacity={0.8}>50%</text>
        <path d={areaPath} fill="url(#dilutionGrad)" />
        <polyline points={polyline} fill="none" stroke="#58A6FF" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => {
          const ratio = getRatioAfterN(i);
          const isDanger = ratio < 50;
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3.5} fill={isDanger ? "#F85149" : "#58A6FF"} stroke="#0D1117" strokeWidth={1.5} />
              {i % 2 === 0 && <text x={p.x} y={p.y - 7} textAnchor="middle" fill={isDanger ? "#F85149" : "#58A6FF"} fontSize={7.5} fontWeight="600">{ratio.toFixed(1)}%</text>}
            </g>
          );
        })}
        <line x1={padL} y1={toY(0)} x2={W - padR} y2={toY(0)} stroke="#30363D" strokeWidth={1} />
        {xTicks.map(n => (
          <g key={n}>
            <line x1={toX(n)} y1={toY(0)} x2={toX(n)} y2={toY(0) + 3} stroke="#30363D" strokeWidth={1} />
            <text x={toX(n)} y={toY(0) + 12} textAnchor="middle" fill="#6E7681" fontSize={8}>{n}次</text>
          </g>
        ))}
        <text x={dangerX + 4} y={padT + 10} fill="#F85149" fontSize={7} opacity={0.7}>危险区 &lt;50%</text>
      </svg>
      <div className="flex items-center gap-4 mt-2 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded" style={{ background: "#58A6FF" }} />
          <span className="text-[13px] text-[#6E7681]">客户分润%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: "#F85149" }} />
          <span className="text-[13px] text-[#6E7681]">危险区（&lt;50%）</span>
        </div>
      </div>
    </div>
  );
}

// ─── 收益模拟器 ──────────────────────────────────────────────
// ─── A/B 融合对比图区块（带回撤滑块）──────────────────────────────
function CombinedChartSection({ ethEntry, notional }: { ethEntry: number; notional: number }) {
  const [drawdownPct, setDrawdownPct] = useState(0);
  const DDSTEPS = [0, 11, 22, 33, 44, 55, 66, 77, 88];
  return (
    <section>
      <SectionTitle text="A vs B 对比：回撤对收益的影响" />
      <div className="rounded-xl border p-4 space-y-4" style={{ background: "#161B22", borderColor: "#30363D" }}>
        <CombinedPayoffChart ethEntry={ethEntry} drawdownPct={drawdownPct} notional={notional} />
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#8B949E]">增筹A 回撤幅度</span>
            <span className="font-bold text-lg tabular-nums" style={{ color: drawdownPct === 0 ? "#3FB950" : drawdownPct <= 33 ? "#F0B429" : "#F85149" }}>{drawdownPct === 0 ? "无回撤" : `−${drawdownPct}%`}</span>
          </div>
          <input type="range" min={0} max={88} step={11} value={drawdownPct} onChange={e => setDrawdownPct(Number(e.target.value))} className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #58A6FF ${drawdownPct / 88 * 100}%, #30363D ${drawdownPct / 88 * 100}%)` }} />
          <div className="flex justify-between text-[11px] text-[#484F58] mt-1.5">
            {DDSTEPS.map(v => <span key={v}>{v === 0 ? "无" : `-${v}%`}</span>)}
          </div>
        </div>
        <div className="text-[13px] text-[#6E7681] leading-relaxed">
          {drawdownPct === 0
            ? <>增筹A 无回撤时，涨幅 100% 归你，收益高于增筹B。增筹B 利息较低但收益权永不稀释。</>
            : drawdownPct <= 33
            ? <>回撤 {drawdownPct}% 后，增筹A 分润开始被稀释，增筹B 收益曲线不受影响。</>
            : <>回撤达 {drawdownPct}%，增筹A 分润已大幅稀释，增筹B 依然按原比例分润。</>
          }
        </div>
      </div>
    </section>
  );
}

function SimulatorSection({ ethEntry, notional, onNotionalChange }: { ethEntry: number; notional: number; onNotionalChange: (n: number) => void }) {
  const [ethPct, setEthPct] = useState(30);
  const [drawdownPct, setDrawdownPct] = useState(0);

  const NOTIONAL_OPTIONS = [500, 1000, 3000, 5000, 10000];

  const n = Math.floor(drawdownPct / 10);
  const ratioA = calcRatio(n);
  const gain = Math.max(0, (ethEntry * ethPct / 100) * (notional / ethEntry));
  const feeA = notional * 0.025 * MONTHS;
  const clientNetA = gain * (1 - ratioA) - feeA;

  const ratioB = calcRatio(0);
  const feeB = notional * 0.015 * MONTHS;
  const clientNetB = gain * ratioB - feeB;

  const holdEthNet = notional * (ethPct / 100);
  const maxAbs = Math.max(Math.abs(clientNetA), Math.abs(clientNetB), Math.abs(holdEthNet), 1);

  function BarRow({ label, value, color, max }: { label: string; value: number; color: string; max: number }) {
    const pct = Math.abs(value) / max;
    const isPos = value >= 0;
    return (
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[#6E7681] w-14 flex-shrink-0 text-right">{label}</span>
        <div className="flex-1 flex items-center gap-1">
          <div className="flex-1 flex justify-end">
            {!isPos && <div className="h-4 rounded-l-sm transition-all duration-500" style={{ width: `${pct * 100}%`, background: "#F85149", opacity: 0.8 }} />}
          </div>
          <div className="w-px h-5 flex-shrink-0" style={{ background: "#30363D" }} />
          <div className="flex-1">
            {isPos && <div className="h-4 rounded-r-sm transition-all duration-500" style={{ width: `${pct * 100}%`, background: color, opacity: 0.85 }} />}
          </div>
        </div>
        <span className="text-[11px] font-medium tabular-nums w-14 flex-shrink-0 text-right" style={{ color: isPos ? color : "#F85149" }}>
          {isPos ? "+" : ""}{value.toFixed(0)}u
        </span>
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-0.5 h-3.5 rounded-full bg-amber-400/60" />
        <span className="text-sm font-sans font-semibold text-[#C9D1D9]">我能赚多少？收益模拟器</span>
      </div>
      <div className="rounded-xl border p-4 space-y-5" style={{ background: "#161B22", borderColor: "#F0B42940" }}>
        {/* 本金快捷按鈕 */}
        <div>
          <div className="text-sm text-[#8B949E] mb-2">持仓金额（U）</div>
          <div className="flex gap-2 flex-wrap">
            {NOTIONAL_OPTIONS.map(v => (
              <button key={v} onClick={() => onNotionalChange(v)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150"
                style={notional === v
                  ? { background: "#F0B42920", color: "#F0B429", border: "1px solid #F0B42960" }
                  : { background: "#1C2128", color: "#6E7681", border: "1px solid #30363D" }
                }
              >
                {v >= 1000 ? `${v/1000}k` : v}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#8B949E]">ETH 预期涨幅</span>
              <span className="text-[#F0B429] font-bold text-lg tabular-nums">+{ethPct}%</span>
            </div>
            <input type="range" min={0} max={100} step={5} value={ethPct} onChange={e => setEthPct(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #F0B429 ${ethPct}%, #30363D ${ethPct}%)` }} />
            <div className="flex justify-between text-[12px] text-[#484F58] mt-1">
              {[0, 25, 50, 75, 100].map(v => <span key={v}>{v}%</span>)}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#8B949E]">增筹A 回撤幅度</span>
              <span className="text-[#58A6FF] font-bold text-lg tabular-nums whitespace-nowrap">{drawdownPct === 0 ? "无回撤" : `−${drawdownPct}%`}</span>
            </div>
            <input type="range" min={0} max={90} step={10} value={drawdownPct} onChange={e => setDrawdownPct(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #58A6FF ${drawdownPct / 90 * 100}%, #30363D ${drawdownPct / 90 * 100}%)` }} />
            <div className="flex justify-between text-[12px] text-[#484F58] mt-1">
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => <span key={v}>{v}</span>)}
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <div className="text-[11px] text-[#6E7681] uppercase tracking-wider mb-2">净收益对比（{notional.toLocaleString()}U 本金）</div>
          <BarRow label="增筹A" value={clientNetA} color="#58A6FF" max={maxAbs} />
          <BarRow label="增筹B" value={clientNetB} color="#F0883E" max={maxAbs} />
          <BarRow label="直接持币" value={holdEthNet} color="#8B949E" max={maxAbs} />
        </div>
      </div>
    </section>
  );
}

// ─── 区块标题 ──────────────────────────────────────────────────
function SectionTitle({ text, color = "#F0B42999" }: { text: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-0.5 h-3.5 rounded-full" style={{ background: color }} />
      <span className="text-sm font-sans font-semibold text-[#C9D1D9]">{text}</span>
    </div>
  );
}

// ─── A/B 切换按钮 ──────────────────────────────────────────────
function ABToggle({ value, onChange }: { value: "A" | "B"; onChange: (v: "A" | "B") => void }) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: "#1C2128", border: "1px solid #30363D" }}>
      {(["A", "B"] as const).map(k => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className="px-3 py-0.5 rounded text-sm font-semibold transition-all duration-150"
          style={value === k
            ? { background: k === "A" ? "#58A6FF30" : "#F0883E30", color: k === "A" ? "#58A6FF" : "#F0883E", border: `1px solid ${k === "A" ? "#58A6FF60" : "#F0883E60"}` }
            : { background: "transparent", color: "#6E7681", border: "1px solid transparent" }
          }
        >
          增筹{k}
        </button>
      ))}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────
export default function ProductDesign() {
  const ethPrice = useEthPrice();
  const ethEntry = ethPrice ?? 1800;

  // 各个可切换区块的 A/B 状态
  const [tableAB, setTableAB] = useState<"A" | "B">("A");
  const [dilutionAB, setDilutionAB] = useState<"A" | "B">("A");
  const [simNotional, setSimNotional] = useState(1000);

  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen font-sans" style={{ background: "#0D1117", color: "#E6EDF3" }}>

      {/* ── 顶部导航 ── */}
      <div className="sticky top-0 z-40" style={{ background: "#0D1117", backdropFilter: "blur(12px)", borderBottom: "1px solid #21262D" }}>
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-mono font-semibold text-[#C9D1D9] tracking-widest">ETH</span>
            <span className="text-[#6E7681] text-[12px]">·</span>
            <span className="text-[13px] font-mono text-[#8B949E]">DERIBIT</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-mono tabular-nums" style={{ color: ethPrice ? "#3FB950" : "#484F58" }}>
              ETH {ethPrice ? `$${fmt(ethPrice)}` : '--'}
            </span>
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${ethPrice ? 'bg-[#3FB950]' : 'bg-yellow-400 animate-pulse'}`} />
              <span className={`text-[10px] font-mono ${ethPrice ? 'text-[#3FB950]' : 'text-yellow-400'}`}>
                {ethPrice ? '已连接' : '连接中'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center px-4 pb-1.5 gap-0 border-b" style={{ borderColor: "#21262D60" }}>
          <a href="/annualized" className="px-2 py-0.5 text-[13px] font-sans text-[#8B949E] hover:text-[#E6EDF3] transition-colors duration-150">分析</a>
          <span className="text-[#2D333B] text-[12px]">|</span>
          <a href="/history" className="px-2 py-0.5 text-[13px] font-sans text-[#8B949E] hover:text-[#E6EDF3] transition-colors duration-150">历史</a>
          <span className="text-[#2D333B] text-[12px]">|</span>
          <a href="/product-design" className="px-2 py-0.5 text-[13px] font-sans text-amber-400/80 hover:text-amber-300 transition-colors duration-150">谷底增筹</a>
          <span className="text-[#2D333B] text-[12px]">|</span>
          <a href="/iv-smile" className="px-2 py-0.5 text-[13px] font-sans text-[#8B949E] hover:text-[#E6EDF3] transition-colors duration-150">IV Smile</a>
        </div>
      </div>

      {/* ── 内容区（单页滚动）── */}
      <div className="px-4 py-5 space-y-6 max-w-2xl mx-auto">

        {/* ── 1. 什么是谷底增筹 ── */}
        <section>
          <SectionTitle text="什么是谷底增筹？" />
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#21262D" }}>
            <div className="relative h-28 flex items-end justify-center" style={{ background: "linear-gradient(180deg, #0D1117 0%, #161B22 100%)" }}>
              <svg viewBox="0 0 320 80" className="w-full" preserveAspectRatio="none" style={{ height: "100%" }}>
                <defs>
                  <linearGradient id="valleyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F0B429" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#F0B429" stopOpacity="0.03" />
                  </linearGradient>
                </defs>
                <path d="M0,10 Q40,65 80,72 Q120,78 160,75 Q200,72 240,65 Q280,55 320,10 L320,80 L0,80 Z" fill="url(#valleyGrad)" />
                <path d="M0,10 Q40,65 80,72 Q120,78 160,75 Q200,72 240,65 Q280,55 320,10" fill="none" stroke="#F0B429" strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="160" cy="75" r="3" fill="#F0B429" />
                <line x1="160" y1="75" x2="160" y2="30" stroke="#3FB950" strokeWidth="1" strokeDasharray="3,2" />
                <polygon points="156,34 160,24 164,34" fill="#3FB950" />
                <text x="168" y="30" fontSize="7" fill="#3FB950" fontFamily="monospace">涨幅分润</text>
                <text x="130" y="70" fontSize="7" fill="#F0B429" fontFamily="monospace">谷底入场</text>
                <text x="8" y="20" fontSize="7" fill="#6E7681" fontFamily="monospace">ETH 跌</text>
                <text x="278" y="20" fontSize="7" fill="#6E7681" fontFamily="monospace">ETH 涨</text>
              </svg>
            </div>
            <div className="grid grid-cols-3 divide-x divide-[#21262D]" style={{ borderTop: "1px solid #21262D" }}>
              {[
                { title: "谷底入场", desc: "少量资金锁定全额涨幅参与权" },
                { title: "永不爆仓", desc: "最多亏本期利息，无追加风险" },
                { title: "涨幅增筹", desc: "涨幅越大，你拿的比例越高" },
              ].map((item, i) => (
                <div key={i} className="px-3 py-3 text-center" style={{ background: "#0D1117" }}>
                  <div className="text-[13px] font-semibold text-[#E6EDF3] mb-1">{item.title}</div>
                  <div className="text-[13px] text-[#6E7681] leading-relaxed">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 2. 两款产品一眼看懂（融合产品对比 + 市场情景）── */}
        <section>
          <SectionTitle text="两款产品一眼看懂" />
          <div className="rounded-xl border overflow-hidden" style={{ background: "#161B22", borderColor: "#30363D" }}>
            {/* 表头 */}
            <div className="grid border-b" style={{ gridTemplateColumns: "52px 1fr 1fr", borderColor: "#30363D", background: "#1C2128" }}>
              <div className="p-3 text-[13px] text-[#6E7681]">ETH</div>
              <div className="p-3 text-center border-l" style={{ borderColor: "#30363D" }}>
                <div className="text-base text-[#58A6FF] font-bold">增筹A</div>
              </div>
              <div className="p-3 text-center border-l" style={{ borderColor: "#30363D" }}>
                <div className="text-base text-[#F0883E] font-bold">增筹B</div>
              </div>
            </div>
            {/* ETH 跌 */}
            <div className="grid border-b" style={{ gridTemplateColumns: "52px 1fr 1fr", borderColor: "#21262D" }}>
              <div className="px-3 py-2 flex items-center justify-center">
                <span className="text-[#3FB950] font-bold text-base">跌</span>
              </div>
              <div className="px-3 py-2 border-l" style={{ borderColor: "#21262D" }}>
                <div className="text-[#C9D1D9] text-sm">不用补仓 不会爆仓</div>
              </div>
              <div className="px-3 py-2 border-l" style={{ borderColor: "#21262D" }}>
                <div className="text-[#C9D1D9] text-sm">永享100%收益权</div>
              </div>
            </div>
            {/* ETH 涨 */}
            <div className="grid border-b" style={{ gridTemplateColumns: "52px 1fr 1fr", borderColor: "#21262D" }}>
              <div className="px-3 py-2 flex items-center justify-center">
                <span className="text-[#F85149] font-bold text-base">涨</span>
              </div>
              <div className="px-3 py-2 border-l" style={{ borderColor: "#21262D" }}>
                <div className="text-[#C9D1D9] text-sm">最高 5.25 倍收益</div>
              </div>
              <div className="px-3 py-2 border-l" style={{ borderColor: "#21262D" }}>
                <div className="text-[#C9D1D9] text-sm">涨幅越大分润越高</div>
              </div>
            </div>
            {/* 市场情景 */}
            <div className="px-3 py-2 border-b" style={{ borderColor: "#21262D", background: "#1C212890" }}>
              <span className="text-[12px] text-[#6E7681] uppercase tracking-wider">不同市场情景下的表现</span>
            </div>
            {[
              { scene: "单边上涨", a: 5, b: 3, noteA: "A 完胜", noteB: "B 也有分润" },
              { scene: "先跌后涨", a: 1, b: 3, noteA: "A 收益被稀释", noteB: "B 不受影响" },
              { scene: "震荡横盘", a: 2, b: 2, noteA: "A 分润下降", noteB: "B 收益稳定" },
              { scene: "单边大跌", a: 2, b: 2, noteA: "A 不用补仓", noteB: "B 永不爆仓" },
            ].map(({ scene, a, b, noteA, noteB }) => (
              <div key={scene} className="grid border-b last:border-0 hover:bg-[#1C2128] transition-colors" style={{ gridTemplateColumns: "1fr 1fr 1fr", borderColor: "#21262D" }}>
                <div className="p-3 text-[#C9D1D9] text-[13px]">{scene}</div>
                <div className="p-3 border-l flex flex-col items-center gap-1" style={{ borderColor: "#21262D" }}>
                  <Stars count={a} color="#58A6FF" />
                  <span className="text-[11px] text-[#6E7681]">{noteA}</span>
                </div>
                <div className="p-3 border-l flex flex-col items-center gap-1" style={{ borderColor: "#21262D" }}>
                  <Stars count={b} color="#F0883E" />
                  <span className="text-[11px] text-[#6E7681]">{noteB}</span>
                </div>
              </div>
            ))}
          </div>
        </section>



        {/* ── 5. 分润/回撤表（A/B 切换）── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle text={tableAB === "B" ? "客户分润比例" : "回撤如何影响我的收益？"} />
            <ABToggle value={tableAB} onChange={setTableAB} />
          </div>

          {tableAB === "B" ? (
            <div className="rounded-xl border overflow-hidden" style={{ background: "#161B22", borderColor: "#30363D" }}>
              <div>
                <div className="flex items-center justify-between px-4 py-2 text-[13px] text-[#6E7681] uppercase tracking-wider border-b border-[#21262D]">
                  <span>ETH 涨幅<span className="text-[#F0B429] ml-1 normal-case font-normal">（现价 {ethEntry ? `${fmt(ethEntry)}u` : "连接中…"}）</span></span>
                  <span className="text-[#3FB950]">客户分润%</span>
                </div>
                {STEPS.map((pct, i) => {
                  const n = i + 1;
                  const ratio = calcRatio(n);
                  const clientPct = (1 - ratio) * 100;
                  const targetPriceA = ethEntry * (1 + pct / 100);
                  const isHighest = i === STEPS.length - 1;
                  return (
                    <div key={pct} className="px-4 py-1.5 border-b border-[#21262D] last:border-0 hover:bg-[#1C2128] transition-colors" style={isHighest ? { background: "#F0883E08" } : {}}>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="relative h-6 rounded-sm overflow-hidden" style={{ background: "#21262D" }}>
                            <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.round(20 + Math.pow(Math.max(0, (clientPct - 33.3) / 54.6), 2) * 75)}%`, background: clientPct < 50 ? "linear-gradient(90deg, #1a4a2a, #3FB950)" : clientPct < 65 ? "linear-gradient(90deg, #2a3a0a, #8BC34A)" : clientPct < 75 ? "linear-gradient(90deg, #4a3a0a, #F0B429)" : clientPct < 82 ? "linear-gradient(90deg, #4a2a0a, #E8922A)" : "linear-gradient(90deg, #4a1a0a, #F85149)", transition: "width 0.4s ease" }} />
                            <div className="absolute inset-0 flex items-center px-2 gap-1">
                              <span className="text-white text-[13px] font-medium tabular-nums whitespace-nowrap relative z-10">涨{pct}%</span>
                              <span className="text-white text-[13px] tabular-nums whitespace-nowrap relative z-10">涨到{fmt(targetPriceA)}u</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          <span className="font-bold text-xl tabular-nums leading-none" style={{ color: pctColor(clientPct) }}>{clientPct.toFixed(0)}%</span>
                          {isHighest && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "#F0883E20", color: "#F0883E" }}>最高分润</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ background: "#161B22", borderColor: "#30363D" }}>
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#21262D]">
                <span className="text-[13px] text-[#6E7681] uppercase tracking-wider">回撤幅度</span>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[13px] text-[#3FB950] uppercase tracking-wider">收益权剩余比例</span>
                  <span className="text-[11px] text-[#6E7681]">增筹A 下跌会稀释·增筹B 永不稀释</span>
                </div>
              </div>
              {[0, ...STEPS.filter(s => s < 100)].map((pct) => {
                const n = pct / 10;
                const ratio = calcRatio(n);
                const clientPct = ratio * 100;
                const targetPrice = ethEntry * (1 - pct / 100);
                const isDangerous = pct >= 30;
                return (
                  <div key={pct} className="px-4 py-1.5 border-b border-[#21262D] last:border-0 transition-colors hover:bg-[#1C2128]" style={{ background: pct === 0 ? "#3FB95008" : "transparent" }}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="relative h-6 rounded-sm overflow-hidden" style={{ background: "#21262D" }}>
                          <div className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.round(Math.sqrt(clientPct / 100) * 100)}%`, background: pct === 0 ? "linear-gradient(90deg, #1a4a2a, #3FB950)" : pct <= 20 ? "linear-gradient(90deg, #2a4a1a, #8BC34A)" : pct <= 40 ? "linear-gradient(90deg, #4a3a0a, #F0B429)" : pct <= 60 ? "linear-gradient(90deg, #4a2e0a, #E8922A)" : pct <= 70 ? "linear-gradient(90deg, #4a2a0a, #D4722A)" : "linear-gradient(90deg, #4a1a0a, #F85149)", transition: "width 0.4s ease" }} />
                          <div className="absolute inset-0 flex items-center px-2 gap-1">
                            <span className="text-white text-[13px] font-medium tabular-nums whitespace-nowrap relative z-10">{pct === 0 ? "不跌" : `跌${pct}%`}</span>

                            {pct === 0 && <span className="text-[13px] text-white/70 relative z-10">无回撤</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-baseline gap-0.5 shrink-0">
                        <span className="font-bold text-xl tabular-nums leading-none" style={{ color: pct === 0 ? "#3FB950" : pct <= 20 ? "#8BC34A" : pct <= 40 ? "#F0B429" : pct <= 60 ? "#E8922A" : pct <= 70 ? "#D4722A" : "#F85149" }}>{clientPct.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 资金成本对比表 */}
        <section>
          <SectionTitle text="资金成本" />
          <div className="rounded-xl border overflow-hidden" style={{ background: "#161B22", borderColor: "#30363D" }}>
            {/* 表头 */}
            <div className="grid border-b" style={{ gridTemplateColumns: "72px 1fr 1fr", borderColor: "#30363D", background: "#1C2128" }}>
              <div className="p-3 text-[13px] text-[#6E7681] text-center whitespace-nowrap">项目</div>
              <div className="p-3 text-center border-l" style={{ borderColor: "#30363D" }}>
                <div className="text-base text-[#58A6FF] font-bold">增筹A</div>
              </div>
              <div className="p-3 text-center border-l" style={{ borderColor: "#30363D" }}>
                <div className="text-base text-[#F0883E] font-bold">增筹B</div>
              </div>
            </div>
            {/* 首仓金额 */}
            <div className="grid border-b" style={{ gridTemplateColumns: "72px 1fr 1fr", borderColor: "#21262D" }}>
              <div className="px-3 py-3 flex items-center justify-center whitespace-nowrap">
                <span className="text-[#8B949E] text-sm">首仓资金</span>
              </div>
              <div className="px-3 py-3 border-l flex items-center justify-center" style={{ borderColor: "#21262D" }}>
                <span className="text-[#C9D1D9] text-sm font-medium">10%</span>
              </div>
              <div className="px-3 py-3 border-l flex items-center justify-center" style={{ borderColor: "#21262D" }}>
                <span className="text-[#C9D1D9] text-sm font-medium">10%</span>
              </div>
            </div>
            {/* 管理费 */}
            <div className="grid" style={{ gridTemplateColumns: "72px 1fr 1fr" }}>
              <div className="px-3 py-3 flex items-center justify-center whitespace-nowrap">
                <span className="text-[#8B949E] text-sm">管理费用</span>
              </div>
              <div className="px-3 py-3 border-l flex items-center justify-center" style={{ borderColor: "#21262D" }}>
                <span className="text-[#C9D1D9] text-sm font-medium">1.33%</span>
              </div>
              <div className="px-3 py-3 border-l flex items-center justify-center" style={{ borderColor: "#21262D" }}>
                <span className="text-[#C9D1D9] text-sm font-medium">2%</span>
              </div>
            </div>
            <div className="px-4 py-2.5 border-t" style={{ borderColor: "#21262D", background: "#1C212860" }}>
              <span className="text-[12px] text-[#6E7681] leading-relaxed">增筹A 管理费较低，因为回撤会稀释收益权，客户承担了部分市场风险；增筹B 管理费较高，但下跌永不影响收益权，确定性更强。</span>
            </div>
          </div>
        </section>

        {/* ── 11. 推荐结论 ── */}
        <section>
          <SectionTitle text="哪款适合我？" />
          <div className="space-y-3">
            {/* 增筹A 卡片 */}
            <div className="rounded-xl border p-4" style={{ background: "#161B22", borderColor: "#58A6FF40" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#58A6FF" }} />
                <span className="text-[#58A6FF] font-bold text-sm">我适合增筹A，如果……</span>
              </div>
              <div className="space-y-1.5 pl-4">
                <div className="flex items-start gap-2">
                  <span className="text-[#58A6FF] text-xs mt-0.5 flex-shrink-0">·</span>
                  <span className="text-[#C9D1D9] text-sm leading-relaxed">我判断 ETH 短期内会<span className="text-[#58A6FF] font-medium">持续上涨</span>，回撤概率低</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#58A6FF] text-xs mt-0.5 flex-shrink-0">·</span>
                  <span className="text-[#C9D1D9] text-sm leading-relaxed">我希望在<span className="text-[#58A6FF] font-medium">大涨行情</span>下获得最高 5.25 倍收益</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#58A6FF] text-xs mt-0.5 flex-shrink-0">·</span>
                  <span className="text-[#C9D1D9] text-sm leading-relaxed">我能接受市场震荡时分润比例有所下降</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#58A6FF] text-xs mt-0.5 flex-shrink-0">·</span>
                  <span className="text-[#C9D1D9] text-sm leading-relaxed">我希望以<span className="text-[#58A6FF] font-medium">更低的持有成本</span>参与行情</span>
                </div>
              </div>
            </div>
            {/* 增筹B 卡片 */}
            <div className="rounded-xl border p-4" style={{ background: "#161B22", borderColor: "#F0883E40" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#F0883E" }} />
                <span className="text-[#F0883E] font-bold text-sm">我适合增筹B，如果……</span>
              </div>
              <div className="space-y-1.5 pl-4">
                <div className="flex items-start gap-2">
                  <span className="text-[#F0883E] text-xs mt-0.5 flex-shrink-0">·</span>
                  <span className="text-[#C9D1D9] text-sm leading-relaxed">我不确定 ETH 走势，希望<span className="text-[#F0883E] font-medium">无论涨跌都有保障</span></span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#F0883E] text-xs mt-0.5 flex-shrink-0">·</span>
                  <span className="text-[#C9D1D9] text-sm leading-relaxed">我希望<span className="text-[#F0883E] font-medium">下跌时收益权永不被稀释</span>，持仓更安心</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#F0883E] text-xs mt-0.5 flex-shrink-0">·</span>
                  <span className="text-[#C9D1D9] text-sm leading-relaxed">我偏好<span className="text-[#F0883E] font-medium">稳健策略</span>，涨了有分润，跌了不受损</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[#F0883E] text-xs mt-0.5 flex-shrink-0">·</span>
                  <span className="text-[#C9D1D9] text-sm leading-relaxed">我愿意<span className="text-[#F0883E] font-medium">中长期持仓</span>，持得越久分润比例越高，博取更大利润</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="h-8" />
      </div>

      {/* ── 悬浮回到顶部按鈕 ── */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-4 z-50 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 active:scale-95"
        style={{ background: "#21262D", border: "1px solid #30363D", color: "#8B949E" }}
        aria-label="回到顶部"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 11V3M3 7l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
