/**
 * IVSmile — IV 微笑曲线（CALL 实线 + PUT 虚线同图对比）
 * 横轴：行权价（或 Moneyness = K/S）
 * 纵轴：隐含波动率 IV%
 * 4条到期日颜色，每条颜色下 CALL 实线 + PUT 虚线
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";

// ─── 到期日配置 ────────────────────────────────────────────────
const EXPIRIES = [
  { code: "25SEP26", label: "9月",  fullLabel: "2026/9/25",  expireDate: "2026-09-25", color: "#60a5fa" },
  { code: "25DEC26", label: "12月", fullLabel: "2026/12/25", expireDate: "2026-12-25", color: "#34d399" },
  { code: "26MAR27", label: "3月",  fullLabel: "2027/3/26",  expireDate: "2027-03-26", color: "#f59e0b" },
  { code: "25JUN27", label: "6月",  fullLabel: "2027/6/25",  expireDate: "2027-06-25", color: "#f472b6" },
];

const MAX_STRIKE = 5000;

function calcDaysLeft(expireDate: string): number {
  const now = new Date();
  const exp = new Date(expireDate);
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86400000));
}

// ─── 数据结构 ──────────────────────────────────────────────────
interface IVPoint {
  strike: number;
  iv: number; // 0-1 小数
}

type IVData = Map<string, IVPoint[]>; // expiryCode → sorted IVPoint[]

// ─── 辅助：在排序点集中插值 IV ──────────────────────────────
function interpolateIV(pts: IVPoint[], xVal: number, xMode: "strike" | "moneyness", ethPrice: number): number | null {
  if (pts.length === 0) return null;
  // 将 pts 转换到 x 轴坐标
  const mapped = pts.map(p => ({
    x: xMode === "moneyness" && ethPrice > 0 ? p.strike / ethPrice : p.strike,
    iv: p.iv * 100,
  }));
  // 找最近两个点做线性插值
  let lo = mapped[0], hi = mapped[mapped.length - 1];
  for (const pt of mapped) {
    if (pt.x <= xVal && pt.x >= lo.x) lo = pt;
    if (pt.x >= xVal && pt.x <= hi.x) hi = pt;
  }
  if (lo.x === hi.x) return lo.iv;
  const t = (xVal - lo.x) / (hi.x - lo.x);
  return lo.iv + t * (hi.iv - lo.iv);
}

// ─── IV Smile SVG 图表（CALL 实线 + PUT 虚线）─────────────────
function IVSmileChart({
  ivDataC,
  ivDataP,
  ethPrice,
  xMode,
}: {
  ivDataC: IVData;
  ivDataP: IVData;
  ethPrice: number;
  xMode: "strike" | "moneyness";
}) {
  const W = 340, H = 210;
  const PAD = { t: 14, r: 16, b: 30, l: 44 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  // 悬停状态
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ svgX: number; xVal: number } | null>(null);

  // 共用的坐标计算函数
  const calcSvgX = useCallback((clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const rawX = (clientX - rect.left) * scaleX;
    if (rawX < PAD.l || rawX > W - PAD.r) return null;
    return rawX;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svgX = calcSvgX(e.clientX);
    if (svgX === null) { setHover(null); return; }
    setHover({ svgX, xVal: 0 });
  }, [calcSvgX]);

  const handleMouseLeave = useCallback(() => setHover(null), []);

  // 触摸事件处理
  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault(); // 防止页面滚动
    const touch = e.touches[0];
    if (!touch) return;
    const svgX = calcSvgX(touch.clientX);
    if (svgX === null) { setHover(null); return; }
    setHover({ svgX, xVal: 0 });
  }, [calcSvgX]);

  const handleTouchEnd = useCallback(() => {
    // 触摸结束后延迟 1.5s 再清除，让用户有时间看清 tooltip
    const timer = setTimeout(() => setHover(null), 1500);
    return () => clearTimeout(timer);
  }, []);

  // 收集所有数据点（CALL + PUT 合并计算轴范围）
  const allPoints: { x: number; iv: number }[] = [];
  [ivDataC, ivDataP].forEach(ivData => {
    EXPIRIES.forEach(e => {
      const pts = ivData.get(e.code) ?? [];
      pts.forEach(p => {
        const x = xMode === "moneyness" && ethPrice > 0 ? p.strike / ethPrice : p.strike;
        allPoints.push({ x, iv: p.iv * 100 });
      });
    });
  });

  if (allPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-[210px] text-[#6E7681] text-[11px] font-sans">
        等待数据加载...
      </div>
    );
  }

  // 轴范围
  const xVals = allPoints.map(p => p.x);
  const ivVals = allPoints.map(p => p.iv);
  let xMin = Math.min(...xVals);
  let xMax = Math.max(...xVals);
  let yMin = Math.max(0, Math.min(...ivVals) - 5);
  let yMax = Math.max(...ivVals) + 5;

  if (xMode === "moneyness") {
    xMin = Math.min(xMin, 0.6);
    xMax = Math.max(xMax, 1.4);
  }

  const toX = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin)) * chartW;
  const toY = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin)) * chartH;

  // 生成每条曲线的 polyline points
  const buildLines = (ivData: IVData) =>
    EXPIRIES.map(e => {
      const pts = (ivData.get(e.code) ?? [])
        .map(p => {
          const x = xMode === "moneyness" && ethPrice > 0 ? p.strike / ethPrice : p.strike;
          return `${toX(x).toFixed(1)},${toY(p.iv * 100).toFixed(1)}`;
        })
        .join(" ");
      return { ...e, pts };
    }).filter(e => e.pts.length > 0);

  const callLines = buildLines(ivDataC);
  const putLines  = buildLines(ivDataP);

  // X 轴刻度
  const xTicks = (() => {
    const range = xMax - xMin;
    let step: number;
    if (xMode === "moneyness") {
      step = 0.1;
    } else {
      step = range > 8000 ? 2000 : range > 4000 ? 1000 : range > 2000 ? 500 : 200;
    }
    const ticks: number[] = [];
    const start = Math.ceil(xMin / step) * step;
    for (let v = start; v <= xMax + 0.001; v += step) ticks.push(parseFloat(v.toFixed(4)));
    return ticks.slice(0, 10);
  })();

  // Y 轴刻度
  const yTicks = (() => {
    const range = yMax - yMin;
    const step = range > 100 ? 20 : range > 50 ? 10 : 5;
    const ticks: number[] = [];
    const start = Math.ceil(yMin / step) * step;
    for (let v = start; v <= yMax; v += step) ticks.push(v);
    return ticks;
  })();

  const ethLineX = xMode === "strike" && ethPrice > 0 && ethPrice >= xMin && ethPrice <= xMax
    ? toX(ethPrice) : null;
  const atmLineX = xMode === "moneyness" && 1.0 >= xMin && 1.0 <= xMax
    ? toX(1.0) : null;

  const fmtX = (v: number) => {
    if (xMode === "moneyness") return v.toFixed(1);
    return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0);
  };

  // 将 svgX 反算为 xVal（依赖 xMin/xMax，必须在轴范围计算之后）
  const hoverXVal = hover ? xMin + ((hover.svgX - PAD.l) / chartW) * (xMax - xMin) : null;

  // 为每个到期日插值 CALL/PUT IV
  const hoverIVs = hoverXVal !== null ? EXPIRIES.map(e => ({
    code: e.code,
    label: e.label,
    color: e.color,
    callIV: interpolateIV(ivDataC.get(e.code) ?? [], hoverXVal, xMode, ethPrice),
    putIV:  interpolateIV(ivDataP.get(e.code) ?? [], hoverXVal, xMode, ethPrice),
  })) : [];

  // tooltip 位置：鼠标右侧显示，靠近右边缘时切换到左侧
  const tooltipRight = hover ? hover.svgX > W * 0.6 : false;

  return (
    <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", cursor: "crosshair", touchAction: "none" }}
      onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      onTouchStart={(e) => {
        // 触摸开始时立即显示十字线
        e.preventDefault();
        const touch = e.touches[0];
        if (!touch) return;
        const svgX = calcSvgX(touch.clientX);
        if (svgX !== null) setHover({ svgX, xVal: 0 });
      }}
    >
      {/* 网格线 */}
      {yTicks.map(v => (
        <line key={`gy-${v}`} x1={PAD.l} y1={toY(v)} x2={W - PAD.r} y2={toY(v)}
          stroke="#21262D" strokeWidth="0.5" />
      ))}
      {xTicks.map(v => (
        <line key={`gx-${v}`} x1={toX(v)} y1={PAD.t} x2={toX(v)} y2={H - PAD.b}
          stroke="#21262D" strokeWidth="0.5" />
      ))}

      {/* ATM / 现价竖线 */}
      {(ethLineX ?? atmLineX) !== null && (
        <>
          <line x1={ethLineX ?? atmLineX!} y1={PAD.t} x2={ethLineX ?? atmLineX!} y2={H - PAD.b}
            stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,2" />
          <text x={(ethLineX ?? atmLineX!) + 3} y={PAD.t + 8} fontSize="7" fill="#f59e0b">
            {xMode === "moneyness" ? "ATM" : "现价"}
          </text>
        </>
      )}

      {/* PUT 曲线（虚线，先渲染在底层） */}
      {putLines.map(e => (
        <polyline key={`put-${e.code}`} points={e.pts} fill="none"
          stroke={e.color} strokeWidth="1.5"
          strokeDasharray="5,3"
          strokeLinejoin="round" strokeLinecap="round"
          opacity="0.65" />
      ))}

      {/* CALL 曲线（实线，渲染在上层） */}
      {callLines.map(e => (
        <polyline key={`call-${e.code}`} points={e.pts} fill="none"
          stroke={e.color} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round"
          opacity="0.95" />
      ))}

      {/* CALL 数据点 */}
      {EXPIRIES.map(e => {
        const pts = ivDataC.get(e.code) ?? [];
        return pts.map(p => {
          const x = xMode === "moneyness" && ethPrice > 0 ? p.strike / ethPrice : p.strike;
          return (
            <circle key={`c-${e.code}-${p.strike}`}
              cx={toX(x)} cy={toY(p.iv * 100)} r="1.8"
              fill={e.color} opacity="0.9" />
          );
        });
      })}

      {/* PUT 数据点（空心圆） */}
      {EXPIRIES.map(e => {
        const pts = ivDataP.get(e.code) ?? [];
        return pts.map(p => {
          const x = xMode === "moneyness" && ethPrice > 0 ? p.strike / ethPrice : p.strike;
          return (
            <circle key={`p-${e.code}-${p.strike}`}
              cx={toX(x)} cy={toY(p.iv * 100)} r="2"
              fill="none" stroke={e.color} strokeWidth="1" opacity="0.6" />
          );
        });
      })}

      {/* Y 轴刻度 */}
      {yTicks.map(v => (
        <g key={`yt-${v}`}>
          <line x1={PAD.l - 3} y1={toY(v)} x2={PAD.l} y2={toY(v)} stroke="#374151" strokeWidth="0.5" />
          <text x={PAD.l - 5} y={toY(v) + 3} fontSize="7" fill="#8B949E" textAnchor="end">{v}%</text>
        </g>
      ))}

      {/* X 轴刻度 */}
      {xTicks.map((v, i) => (
        <text key={`xt-${v}`} x={toX(v)} y={H - 4} fontSize="7" fill="#6b7280"
          textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}>
          {fmtX(v)}
        </text>
      ))}

      {/* 轴标签 */}
      <text x={W / 2} y={H - 1} fontSize="7" fill="#4B5563" textAnchor="middle">
        {xMode === "moneyness" ? "Moneyness (K/S)" : "行权价 (USD)"}
      </text>

      {/* 悬停十字线 */}
      {hover && hoverXVal !== null && (
        <g pointerEvents="none">
          {/* 竖线 */}
          <line x1={hover.svgX} y1={PAD.t} x2={hover.svgX} y2={H - PAD.b}
            stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeDasharray="3,2" />
          {/* X 轴标签 */}
          <rect
            x={hover.svgX - (tooltipRight ? 28 : 0)}
            y={H - PAD.b + 2}
            width="28" height="10" rx="2"
            fill="#1C2128" stroke="#374151" strokeWidth="0.5" />
          <text
            x={hover.svgX - (tooltipRight ? 14 : -14)}
            y={H - PAD.b + 9}
            fontSize="6.5" fill="#E6EDF3" textAnchor="middle">
            {xMode === "moneyness"
              ? hoverXVal.toFixed(2)
              : hoverXVal >= 1000 ? `${hoverXVal.toFixed(0)}` : hoverXVal.toFixed(0)}
          </text>

          {/* Tooltip 卡片 */}
          {hoverIVs.length > 0 && (() => {
            const cardW = 90;
            const rowH = 13;
            const cardH = PAD.t + hoverIVs.length * rowH + 6;
            const cx = tooltipRight ? hover.svgX - cardW - 4 : hover.svgX + 4;
            const cy = PAD.t;
            return (
              <g>
                <rect x={cx} y={cy} width={cardW} height={cardH} rx="3"
                  fill="rgba(13,17,23,0.92)" stroke="rgba(48,54,61,0.8)" strokeWidth="0.8" />
                {/* 标题行：行权价 */}
                <text x={cx + cardW / 2} y={cy + 9} fontSize="7.5" fill="#E6EDF3" textAnchor="middle" fontWeight="600">
                  {xMode === "moneyness"
                    ? `M=${hoverXVal.toFixed(2)}`
                    : `$${hoverXVal >= 1000 ? hoverXVal.toFixed(0) : hoverXVal.toFixed(0)}`}
                </text>
                {/* 各到期日行 */}
                {hoverIVs.map((row, i) => {
                  const ry = cy + PAD.t + i * rowH;
                  return (
                    <g key={row.code}>
                      {/* 圆点 */}
                      <circle cx={cx + 6} cy={ry + 4} r="2.5" fill={row.color} />
                      {/* 到期日标签 */}
                      <text x={cx + 11} y={ry + 7} fontSize="6.5" fill={row.color}>{row.label}</text>
                      {/* CALL IV */}
                      <text x={cx + 28} y={ry + 7} fontSize="6.5" fill={row.color}>
                        C:{row.callIV !== null ? `${row.callIV.toFixed(1)}%` : "—"}
                      </text>
                      {/* PUT IV */}
                      <text x={cx + 58} y={ry + 7} fontSize="6.5" fill={row.color} opacity="0.75">
                        P:{row.putIV !== null ? `${row.putIV.toFixed(1)}%` : "—"}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}

// ─── 单个到期日 IV 数据 Hook ───────────────────────────────────
function useIVWs(
  expiryCode: string,
  ethPriceRef: React.MutableRefObject<number>,
  onEthPrice: ((p: number) => void) | null,
  onIVUpdate: (expiryCode: string, strike: number, iv: number, side: "C" | "P") => void,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(2000);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting" | "error">("connecting");
  const instrumentsRef = useRef<{ name: string; strike: number; side: "C" | "P" }[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    setStatus("connecting");
    instrumentsRef.current = [];

    const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      delayRef.current = 2000;
      if (onEthPrice) {
        ws.send(JSON.stringify({
          jsonrpc: "2.0", id: 9999, method: "public/subscribe",
          params: { channels: ["ticker.ETH-PERPETUAL.100ms"] }
        }));
      }
      // 获取该到期日所有合约（CALL + PUT 一起）
      ws.send(JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "public/get_instruments",
        params: { currency: "ETH", kind: "option", expired: false }
      }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);

        if (msg.method === "subscription" && msg.params?.channel?.startsWith("ticker.ETH-PERPETUAL")) {
          const p = msg.params.data?.mark_price;
          if (p && onEthPrice) {
            ethPriceRef.current = p;
            onEthPrice(p);
          }
          return;
        }

        if (msg.id === 1 && msg.result) {
          const instruments: { instrument_name: string; strike: number }[] = msg.result;
          // 同时订阅 CALL 和 PUT
          const filtered = instruments.filter(inst => {
            if (!inst.instrument_name.includes(expiryCode)) return false;
            if (!inst.instrument_name.endsWith("-C") && !inst.instrument_name.endsWith("-P")) return false;
            if (inst.strike > MAX_STRIKE) return false;
            return true;
          });
          instrumentsRef.current = filtered.map(i => ({
            name: i.instrument_name,
            strike: i.strike,
            side: i.instrument_name.endsWith("-C") ? "C" : "P",
          }));

          const channels = filtered.map(i => `ticker.${i.instrument_name}.100ms`);
          for (let i = 0; i < channels.length; i += 20) {
            ws.send(JSON.stringify({
              jsonrpc: "2.0", id: 2 + Math.floor(i / 20),
              method: "public/subscribe",
              params: { channels: channels.slice(i, i + 20) }
            }));
          }
          return;
        }

        if (msg.method === "subscription" && msg.params?.channel?.startsWith("ticker.ETH-")) {
          const data = msg.params.data;
          const name: string = data?.instrument_name ?? "";
          if (!name) return;
          const inst = instrumentsRef.current.find(i => i.name === name);
          if (!inst) return;
          const iv = data?.mark_iv;
          if (iv != null && iv > 0) {
            onIVUpdate(expiryCode, inst.strike, iv / 100, inst.side);
          }
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => {
      setStatus("reconnecting");
      timerRef.current = setTimeout(() => {
        delayRef.current = Math.min(delayRef.current * 1.5, 30000);
        connect();
      }, delayRef.current);
    };
  }, [expiryCode, onEthPrice, onIVUpdate, ethPriceRef]);

  useEffect(() => {
    connect();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [connect]);

  return status;
}

// ─── WebSocket 连接器（无渲染组件）─────────────────────────────
function IVWsConnector({
  expiryCode,
  ethPriceRef,
  onEthPrice,
  onIVUpdate,
}: {
  expiryCode: string;
  ethPriceRef: React.MutableRefObject<number>;
  onEthPrice: ((p: number) => void) | null;
  onIVUpdate: (expiryCode: string, strike: number, iv: number, side: "C" | "P") => void;
}) {
  useIVWs(expiryCode, ethPriceRef, onEthPrice, onIVUpdate);
  return null;
}

// ─── 25-Delta Skew 计算辅助函数 ────────────────────────────────
// 标准正态分布累积分布函数逆函数（Beasley-Springer-Moro 近似）
function normInv(p: number): number {
  const a = [2.50662823884, -18.61500062529, 41.39119773534, -25.44106049637];
  const b = [-8.47351093090, 23.08336743743, -21.06224101826, 3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
             0.0276438810333863, 0.0038405729373609, 0.0003951896511349,
             0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
  if (p <= 0 || p >= 1) return NaN;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.42) {
    const r = q * q;
    return q * (((a[3]*r+a[2])*r+a[1])*r+a[0]) / ((((b[3]*r+b[2])*r+b[1])*r+b[0])*r+1);
  }
  const r = q < 0 ? Math.log(-Math.log(p)) : Math.log(-Math.log(1-p));
  let x = c[0]+r*(c[1]+r*(c[2]+r*(c[3]+r*(c[4]+r*(c[5]+r*(c[6]+r*(c[7]+r*c[8])))))));
  return q < 0 ? -x : x;
}

// 给定 Delta 和 ATM IV 反算行权价
// CALL: delta = N(d1), d1 = ln(S/K)/(sigma*sqrt(T)) + 0.5*sigma*sqrt(T)
// 求解 K: K = S * exp(-normInv(delta)*sigma*sqrt(T) + 0.5*sigma^2*T)
function strikeFromDelta(S: number, delta: number, sigmaAnn: number, T: number): number {
  const sqrtT = Math.sqrt(T);
  return S * Math.exp(-normInv(delta) * sigmaAnn * sqrtT + 0.5 * sigmaAnn * sigmaAnn * T);
}

// 在排序点集中找最近行权价对应的 IV
function ivAtStrike(pts: IVPoint[], targetStrike: number): number | null {
  if (pts.length === 0) return null;
  // 找左右两个最近点做线性插值
  let lo = pts[0], hi = pts[pts.length - 1];
  for (const p of pts) {
    if (p.strike <= targetStrike && p.strike >= lo.strike) lo = p;
    if (p.strike >= targetStrike && p.strike <= hi.strike) hi = p;
  }
  if (lo.strike === hi.strike) return lo.iv * 100;
  const t = (targetStrike - lo.strike) / (hi.strike - lo.strike);
  return (lo.iv + t * (hi.iv - lo.iv)) * 100;
}

// 计算某到期日的 25-Delta Skew
function calc25DeltaSkew(
  ptsC: IVPoint[], ptsP: IVPoint[],
  S: number, T: number, atmIV: number
): { skew: number; putIV: number; callIV: number } | null {
  if (S <= 0 || T <= 0 || atmIV <= 0 || ptsC.length === 0 || ptsP.length === 0) return null;
  const sigma = atmIV / 100;
  // 25-Delta Call 行权价（OTM Call， delta=0.25）
  const K25C = strikeFromDelta(S, 0.25, sigma, T);
  // 25-Delta Put 行权价（OTM Put， delta=-0.25 对应 N(d1)=0.25）
  const K25P = strikeFromDelta(S, 0.75, sigma, T); // put delta=-0.25 → call delta=0.75 对应行权价
  const iv25C = ivAtStrike(ptsC, K25C);
  const iv25P = ivAtStrike(ptsP, K25P);
  if (iv25C === null || iv25P === null) return null;
  return { skew: iv25P - iv25C, putIV: iv25P, callIV: iv25C };
}

// ─── Term Structure 图表（CALL + PUT 双线）────────────────────
function TermStructureChart({
  atmIVsC,
  atmIVsP,
}: {
  atmIVsC: (number | null)[];
  atmIVsP: (number | null)[];
}) {
  const W = 320, H = 110;
  const PAD = { t: 10, r: 16, b: 24, l: 40 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const pairsC = EXPIRIES.map((e, i) => ({ e, iv: atmIVsC[i], days: calcDaysLeft(e.expireDate) }))
    .filter(p => p.iv !== null) as { e: typeof EXPIRIES[0]; iv: number; days: number }[];
  const pairsP = EXPIRIES.map((e, i) => ({ e, iv: atmIVsP[i], days: calcDaysLeft(e.expireDate) }))
    .filter(p => p.iv !== null) as { e: typeof EXPIRIES[0]; iv: number; days: number }[];

  const allPairs = [...pairsC, ...pairsP];
  if (allPairs.length < 2) {
    return (
      <div className="flex items-center justify-center h-[110px] text-[#6E7681] text-[11px] font-sans">
        等待更多数据...
      </div>
    );
  }

  const xVals = allPairs.map(p => p.days);
  const yVals = allPairs.map(p => p.iv);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.max(0, Math.min(...yVals) - 3);
  const yMax = Math.max(...yVals) + 3;

  const toX = (v: number) => PAD.l + ((v - xMin) / (xMax - xMin || 1)) * chartW;
  const toY = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin || 1)) * chartH;

  const ptsC = pairsC.map(p => `${toX(p.days).toFixed(1)},${toY(p.iv).toFixed(1)}`).join(" ");
  const ptsP = pairsP.map(p => `${toX(p.days).toFixed(1)},${toY(p.iv).toFixed(1)}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* PUT 折线（虚线） */}
      {ptsP.length > 0 && (
        <polyline points={ptsP} fill="none" stroke="#a78bfa" strokeWidth="1.5"
          strokeDasharray="5,3" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
      )}
      {/* CALL 折线（实线） */}
      {ptsC.length > 0 && (
        <polyline points={ptsC} fill="none" stroke="#a78bfa" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {/* CALL 数据点 */}
      {pairsC.map(p => (
        <g key={`c-${p.e.code}`}>
          <circle cx={toX(p.days)} cy={toY(p.iv)} r="3" fill={p.e.color} />
          <text x={toX(p.days)} y={toY(p.iv) - 5} fontSize="7" fill={p.e.color} textAnchor="middle">
            {p.iv.toFixed(1)}%
          </text>
          <text x={toX(p.days)} y={H - 4} fontSize="7" fill="#6b7280" textAnchor="middle">
            {p.e.label}
          </text>
        </g>
      ))}
      {/* PUT 数据点（空心圆） */}
      {pairsP.map(p => (
        <g key={`p-${p.e.code}`}>
          <circle cx={toX(p.days)} cy={toY(p.iv)} r="3" fill="none" stroke={p.e.color} strokeWidth="1.2" />
          <text x={toX(p.days)} y={toY(p.iv) - 5} fontSize="6" fill={p.e.color} textAnchor="middle" opacity="0.7">
            {p.iv.toFixed(1)}%
          </text>
        </g>
      ))}
      {/* Y 轴 */}
      {[yMin, (yMin + yMax) / 2, yMax].map(v => (
        <text key={v} x={PAD.l - 5} y={toY(v) + 3} fontSize="7" fill="#6b7280" textAnchor="end">
          {v.toFixed(0)}%
        </text>
      ))}
    </svg>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────
export default function IVSmile() {
  const [ethPrice, setEthPrice] = useState(0);
  const [xMode, setXMode] = useState<"strike" | "moneyness">("strike");
  // 分别存储 CALL 和 PUT 的 IV 数据
  const [ivDataC, setIVDataC] = useState<IVData>(new Map());
  const [ivDataP, setIVDataP] = useState<IVData>(new Map());
  const ethPriceRef = useRef(0);

  const handleEthPrice = useCallback((p: number) => {
    ethPriceRef.current = p;
    setEthPrice(p);
  }, []);

  const handleIVUpdate = useCallback((expiryCode: string, strike: number, iv: number, side: "C" | "P") => {
    const setter = side === "C" ? setIVDataC : setIVDataP;
    setter(prev => {
      const next = new Map(prev);
      const pts = [...(next.get(expiryCode) ?? [])];
      const idx = pts.findIndex(p => p.strike === strike);
      if (idx >= 0) {
        pts[idx] = { strike, iv };
      } else {
        pts.push({ strike, iv });
        pts.sort((a, b) => a.strike - b.strike);
      }
      next.set(expiryCode, pts);
      return next;
    });
  }, []);

  // 各到期日数据点计数
  const countsC = EXPIRIES.map(e => (ivDataC.get(e.code) ?? []).length);
  const countsP = EXPIRIES.map(e => (ivDataP.get(e.code) ?? []).length);
  const totalPoints = countsC.reduce((a, b) => a + b, 0) + countsP.reduce((a, b) => a + b, 0);

  // 计算 ATM IV
  const calcAtmIVs = (ivData: IVData) => EXPIRIES.map(e => {
    if (ethPrice <= 0) return null;
    const pts = ivData.get(e.code) ?? [];
    if (pts.length === 0) return null;
    const closest = pts.reduce((best, p) =>
      Math.abs(p.strike - ethPrice) < Math.abs(best.strike - ethPrice) ? p : best
    );
    return closest.iv * 100;
  });

  const atmIVsC = calcAtmIVs(ivDataC);
  const atmIVsP = calcAtmIVs(ivDataP);

  // 计算各到期日的 25-Delta Skew
  const skew25D = EXPIRIES.map((e, i) => {
    const atmIV = atmIVsC[i] ?? atmIVsP[i];
    if (!atmIV || ethPrice <= 0) return null;
    const T = calcDaysLeft(e.expireDate) / 365;
    const ptsC = ivDataC.get(e.code) ?? [];
    const ptsP = ivDataP.get(e.code) ?? [];
    return calc25DeltaSkew(ptsC, ptsP, ethPrice, T, atmIV);
  });

  const hasTermData = atmIVsC.some(v => v !== null) || atmIVsP.some(v => v !== null);

  return (
    <div className="min-h-screen bg-[#0D1117] text-[#E6EDF3]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-30 bg-[var(--ac-bg-base)]/95 backdrop-blur border-b border-[var(--ac-border-subtle)]">
        {/* 第一行：品牌 + ETH价格 + 状态 */}
        <div className="flex items-center justify-between px-4 pt-2.5 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--ac-fs-md)] font-sans font-semibold text-[var(--ac-text-primary)] tracking-widest">ETH</span>
            <span className="text-[var(--ac-text-muted)]">·</span>
            <span className="text-[length:var(--ac-fs-md)] font-sans font-semibold text-amber-400">CALL + PUT</span>
            <span className="text-[var(--ac-text-muted)] text-[length:var(--ac-fs-md)]">·</span>
            <span className="text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)]">IV SMILE</span>
          </div>
          <div className="flex items-center gap-3">
            {ethPrice > 0 && (
              <span className="text-[length:var(--ac-fs-md)] font-sans font-semibold text-[var(--ac-text-bright)]">
                ETH {ethPrice.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${totalPoints > 0 ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} />
              <span className={`text-[length:var(--ac-fs-md)] font-sans ${totalPoints > 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                {totalPoints > 0 ? "已连接" : "连接中"}
              </span>
            </div>
          </div>
        </div>
        {/* 第二行：导航 + X轴模式切换 */}
        <div className="flex items-center justify-between px-4 pb-1 gap-2 border-b border-[var(--ac-border-subtle)]/40">
          <div className="flex items-center gap-0 shrink-0">
            <Link href="/annualized" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)] hover:text-[var(--ac-text-bright)] transition-colors duration-150">分析</Link>
            <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-md)]">|</span>
            <Link href="/history" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)] hover:text-[var(--ac-text-bright)] transition-colors duration-150">历史</Link>
            <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-md)]">|</span>
            <Link href="/iv-smile" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-amber-400 hover:text-amber-300 transition-colors duration-150">IV Smile</Link>
            <span className="text-[var(--ac-divider)] text-[length:var(--ac-fs-md)]">|</span>
            <Link href="/product-design" className="px-2 py-0.5 text-[length:var(--ac-fs-md)] font-sans text-[var(--ac-text-secondary)] hover:text-[var(--ac-text-bright)] transition-colors duration-150">谷底增筹</Link>
          </div>
          {/* X 轴模式 */}
          <div className="flex items-center gap-1">
            {(["strike", "moneyness"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setXMode(mode)}
                className={`px-2 py-0.5 rounded text-[9px] font-sans font-medium transition-all duration-150 ${
                  xMode === mode
                    ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                    : "text-[#6E7681] border border-transparent hover:text-[#C9D1D9] hover:border-[#30363D]"
                }`}
              >
                {mode === "strike" ? "行权价" : "Moneyness"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 主图表区 */}
      <div className="px-3 pt-3 pb-2">
        <div className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden">
          <div className="px-3 pt-2.5 pb-1 border-b border-[#21262D]/60">
            <div className="text-[10px] text-[#8B949E] font-sans tracking-widest uppercase">
              IV Smile — CALL（实线）vs PUT（虚线）· 各到期日隐含波动率
            </div>
          </div>
          <div className="px-2 py-3">
            <IVSmileChart ivDataC={ivDataC} ivDataP={ivDataP} ethPrice={ethPrice} xMode={xMode} />
          </div>
          {/* 图例 */}
          <div className="px-3 pb-1.5">
            {/* 线型说明 */}
            <div className="flex items-center gap-4 mb-1.5 text-[9px] font-sans text-[#6E7681]">
              <span className="flex items-center gap-1.5">
                <svg width="18" height="6" viewBox="0 0 18 6"><line x1="0" y1="3" x2="18" y2="3" stroke="#8B949E" strokeWidth="2" strokeLinecap="round"/></svg>
                CALL 实线
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="18" height="6" viewBox="0 0 18 6"><line x1="0" y1="3" x2="18" y2="3" stroke="#8B949E" strokeWidth="1.5" strokeDasharray="4,2" strokeLinecap="round"/></svg>
                PUT 虚线
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#8B949E"/></svg>
                CALL 数据点
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="none" stroke="#8B949E" strokeWidth="1.2"/></svg>
                PUT 数据点
              </span>
            </div>
            {/* 到期日颜色 */}
            <div className="flex flex-wrap items-center gap-3 text-[9px] font-sans pb-1">
              {EXPIRIES.map((e, i) => (
                <span key={e.code} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: e.color }} />
                  <span style={{ color: e.color }}>{e.label}</span>
                  <span className="text-[#6E7681]">{e.fullLabel}</span>
                  {(countsC[i] > 0 || countsP[i] > 0) && (
                    <span className="text-[#4B5563]">C:{countsC[i]} P:{countsP[i]}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ATM IV 对比卡片（CALL vs PUT） */}
      <div className="px-3 pb-3">
        <div className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden">
          <div className="px-3 pt-2 pb-1 border-b border-[#21262D]/60">
            <div className="text-[10px] text-[#8B949E] font-sans tracking-widest uppercase">ATM 隐含波动率 · CALL vs PUT</div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-[#21262D]">
            {EXPIRIES.map((e, i) => {
              const days = calcDaysLeft(e.expireDate);
              const atmC = atmIVsC[i];
              const atmP = atmIVsP[i];
              const skew = atmC !== null && atmP !== null ? (atmP - atmC).toFixed(1) : null;
              return (
                <div key={e.code} className="px-2 py-2.5 text-center">
                  <div className="text-[9px] font-sans mb-0.5" style={{ color: e.color }}>{e.label}</div>
                  <div className="text-[8px] text-[#6E7681] font-sans mb-1.5">{days}D</div>
                  {/* CALL */}
                  <div className="text-[11px] font-bold font-sans leading-tight" style={{ color: atmC !== null ? e.color : "#4B5563" }}>
                    {atmC !== null ? `${atmC.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-[8px] text-[#6E7681] font-sans leading-tight">CALL</div>
                  {/* PUT */}
                  <div className="text-[11px] font-bold font-sans leading-tight mt-1" style={{ color: atmP !== null ? e.color : "#4B5563", opacity: 0.75 }}>
                    {atmP !== null ? `${atmP.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-[8px] text-[#6E7681] font-sans leading-tight">PUT</div>
                  {/* Skew */}
                  {skew !== null && (
                    <div className={`text-[8px] font-sans leading-tight mt-1 ${parseFloat(skew) > 0 ? "text-rose-400" : parseFloat(skew) < 0 ? "text-emerald-400" : "text-[#6E7681]"}`}>
                      Skew {parseFloat(skew) > 0 ? "+" : ""}{skew}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 25-Delta Skew 卡片 */}
      {skew25D.some(v => v !== null) && (
        <div className="px-3 pb-3">
          <div className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden">
            <div className="px-3 pt-2 pb-1 border-b border-[#21262D]/60 flex items-center justify-between">
              <div className="text-[10px] text-[#8B949E] font-sans tracking-widest uppercase">25-Delta Skew</div>
              <div className="text-[9px] text-[#6E7681] font-sans">IV(25δ Put) − IV(25δ Call)</div>
            </div>
            <div className="grid grid-cols-4 divide-x divide-[#21262D]">
              {EXPIRIES.map((e, i) => {
                const s = skew25D[i];
                const days = calcDaysLeft(e.expireDate);
                const skewVal = s ? s.skew : null;
                const isPositive = skewVal !== null && skewVal > 0;
                const isNegative = skewVal !== null && skewVal < 0;
                return (
                  <div key={e.code} className="px-2 py-3 text-center">
                    <div className="text-[9px] font-sans mb-0.5" style={{ color: e.color }}>{e.label}</div>
                    <div className="text-[8px] text-[#6E7681] font-sans mb-2">{days}D</div>
                    {/* Skew 主数值 */}
                    <div className={`text-[15px] font-bold font-sans leading-tight ${
                      isPositive ? "text-rose-400" : isNegative ? "text-emerald-400" : "text-[#4B5563]"
                    }`}>
                      {skewVal !== null ? `${isPositive ? "+" : ""}${skewVal.toFixed(1)}%` : "—"}
                    </div>
                    {/* 情绪标签 */}
                    <div className={`text-[8px] font-sans mt-0.5 ${
                      isPositive ? "text-rose-400/70" : isNegative ? "text-emerald-400/70" : "text-[#6E7681]"
                    }`}>
                      {isPositive ? "看跌偏斜" : isNegative ? "看涨偏斜" : "—"}
                    </div>
                    {/* 25δ Put IV / Call IV 小字 */}
                    {s && (
                      <div className="mt-1.5 space-y-0.5">
                        <div className="text-[8px] font-sans text-[#6E7681]">
                          <span className="text-[#8B949E]">P:</span> {s.putIV.toFixed(1)}%
                        </div>
                        <div className="text-[8px] font-sans text-[#6E7681]">
                          <span className="text-[#8B949E]">C:</span> {s.callIV.toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 说明 */}
            <div className="px-3 py-2 border-t border-[#21262D]/40 flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-[8px] font-sans text-rose-400/70">{"\u2191 Skew > 0 = 看跌情绪，市场对下行风险溢价"}</span>
              <span className="text-[8px] font-sans text-emerald-400/70">{"\u2193 Skew < 0 = 看涨偏斜，市场对上行动能溢价"}</span>
            </div>
          </div>
        </div>
      )}

      {/* IV Term Structure（CALL + PUT 双线） */}
      {hasTermData && (
        <div className="px-3 pb-3">
          <div className="bg-[#161B22] rounded-xl border border-[#30363D] overflow-hidden">
            <div className="px-3 pt-2 pb-1 border-b border-[#21262D]/60">
              <div className="text-[10px] text-[#8B949E] font-sans tracking-widest uppercase">IV Term Structure — ATM IV vs 到期日</div>
            </div>
            <div className="px-2 py-3">
              <TermStructureChart atmIVsC={atmIVsC} atmIVsP={atmIVsP} />
            </div>
            <div className="flex items-center gap-4 px-3 pb-2 text-[9px] font-sans text-[#6E7681]">
              <span className="flex items-center gap-1.5">
                <svg width="16" height="5" viewBox="0 0 16 5"><line x1="0" y1="2.5" x2="16" y2="2.5" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round"/></svg>
                CALL ATM IV
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="16" height="5" viewBox="0 0 16 5"><line x1="0" y1="2.5" x2="16" y2="2.5" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="4,2" strokeLinecap="round"/></svg>
                PUT ATM IV
              </span>
            </div>
          </div>
        </div>
      )}

      {/* WebSocket 连接器（每个到期日一个，同时订阅 CALL + PUT） */}
      {EXPIRIES.map((e, i) => (
        <IVWsConnector
          key={e.code}
          expiryCode={e.code}
          ethPriceRef={ethPriceRef}
          onEthPrice={i === 0 ? handleEthPrice : null}
          onIVUpdate={handleIVUpdate}
        />
      ))}
    </div>
  );
}
