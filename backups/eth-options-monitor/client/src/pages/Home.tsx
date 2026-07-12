/**
 * ETH期权监控工具
 * 设计风格：专业金融终端，深色背景，数据密度高，移动端优先
 * 核心功能：实时监控三个到期日的ETH Call期权，计算年化权利金占比与痛苦区
 * 数据来源：Deribit WebSocket API（浏览器端直连）
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, ReferenceArea, Scatter, CartesianGrid } from "recharts";

// ─── 到期日配置 ───────────────────────────────────────────────
const EXPIRIES = [
  { label: "2026/09/25", code: "25SEP26" },
  { label: "2026/12/25", code: "25DEC26" },
  { label: "2027/03/26", code: "26MAR27" },
  { label: "2027/06/25", code: "25JUN27" },
];

// ─── 详情弹窗数据结构 ────────────────────────────────────────
interface OptionDetail {
  gamma: number | null;
  vega: number | null;
  theta: number | null;
  bidPrice: number | null;
  bidSize: number | null;
  askSize: number | null;
  openInterest: number | null;
  volume24h: number | null;
  ivHistory: { time: string; iv: number }[];
  loading: boolean;
  error: string | null;
}

interface OptionRow {
  strike: number;
  instrumentName: string;
  markPrice: number | null;
  markPriceUsd: number | null;
  askPrice: number | null;
  askPriceUsd: number | null;
  bidPriceUsd: number | null;
  iv: number | null;
  delta: number | null;
  annualizedRate: number | null;
  breakeven: number | null;
  trueBreakeven: number | null;
  painZoneStart: number | null;
  painZoneEnd: number | null;
}

interface ExpiryData {
  code: string;
  label: string;
  daysLeft: number;
  rows: OptionRow[];
  loading: boolean;
  error: string | null;
}

// ─── 计算剩余天数 ──────────────────────────────────────────────
function calcDaysLeft(expiryCode: string): number {
  const map: Record<string, string> = {
    "25SEP26": "2026-09-25",
    "25DEC26": "2026-12-25",
    "26MAR27": "2027-03-26",
    "25JUN27": "2027-06-25",
  };
  const dateStr = map[expiryCode];
  if (!dateStr) return 365;
  const expiry = new Date(dateStr);
  const today = new Date();
  const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(diff, 1);
}

// 真实盈亏平衡点
// 逻辑：你的期权净收益 = (期权内在价值 - 权利金) - 分润给B
//   = (P - K - C) - share × (P - S) = 0
// 解：P = [K + C - share×S + share×(K+C)] / (1) → 化简后：
//   当 share=0.5：P = 2×(K+C) - S
//   通用版：P = (K + C - share×S) / (1 - share)
function calcTrueBreakeven(strike: number, premium: number, ethPrice: number, profitShare: number): number {
  if (profitShare >= 1) return Infinity;
  // 公式：期权净收益 = (P - K) - C，分润后净收益 = (P - K) - C - share×(P - S) = 0
  // 化简：P×(1 - share) = K + C - share×S → P = (K + C - share×S) / (1 - share)
  return (strike + premium - profitShare * ethPrice) / (1 - profitShare);
}

// ─── Deribit WebSocket Hook ────────────────────────────────────
// WebSocket 连接状态类型
export type WsStatus = "connecting" | "connected" | "reconnecting" | "error";

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

function useDeribitOptions(ethPrice: number): { data: ExpiryData[]; wsStatus: WsStatus } {
  const [expiryData, setExpiryData] = useState<ExpiryData[]>(
    EXPIRIES.map(e => ({
      code: e.code,
      label: e.label,
      daysLeft: calcDaysLeft(e.code),
      rows: [],
      loading: true,
      error: null,
    }))
  );
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const pendingRef = useRef<Map<string, { expiryCode: string; strike: number; instrumentName: string }>>(new Map());
  const ethPriceRef = useRef(ethPrice);
  ethPriceRef.current = ethPrice;
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (ethPrice <= 0) return;
    destroyedRef.current = false;

    function connect() {
      if (destroyedRef.current) return;
      setWsStatus(retryCountRef.current === 0 ? "connecting" : "reconnecting");

      const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
      wsRef.current = ws;
      let msgId = 1;

      ws.onopen = () => {
        if (destroyedRef.current) { ws.close(); return; }
        retryCountRef.current = 0;
        setWsStatus("connected");
        pendingRef.current.clear();
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          id: msgId++,
          method: "public/get_instruments",
          params: { currency: "ETH", kind: "option", expired: false }
        }));
      };

      ws.onmessage = (event) => {
        if (destroyedRef.current) return;
        const msg = JSON.parse(event.data);

        if (msg.result && Array.isArray(msg.result)) {
          const instruments: any[] = msg.result;
          const currentEth = ethPriceRef.current;
          const minStrike = currentEth * 0.85;
          const maxStrike = currentEth * 2.3;

          for (const expiry of EXPIRIES) {
            const calls = instruments.filter(
              (inst: any) =>
                inst.instrument_name?.includes(expiry.code) &&
                inst.instrument_name?.endsWith("-C")
            );

            for (const call of calls) {
              const strike = call.strike;
              if (strike < minStrike || strike > maxStrike) continue;
              if (strike % 100 !== 0) continue;

              const key = call.instrument_name;
              pendingRef.current.set(key, {
                expiryCode: expiry.code,
                strike,
                instrumentName: key,
              });

              ws.send(JSON.stringify({
                jsonrpc: "2.0",
                id: msgId++,
                method: "public/subscribe",
                params: { channels: [`ticker.${key}.100ms`] }
              }));
            }
          }
        } else if (msg.params?.channel?.startsWith("ticker.")) {
          const data = msg.params.data;
          const name = data.instrument_name;
          const pending = pendingRef.current.get(name);
          if (!pending) return;

          const currentEth = ethPriceRef.current;
          const daysLeft = calcDaysLeft(pending.expiryCode);
          const T = daysLeft / 365;

          const markEth = data.mark_price ?? null;
          const markUsd = markEth != null ? markEth * currentEth : null;
          const askEth = data.best_ask_price ?? null;
          const askUsd = askEth != null ? askEth * currentEth : null;
          const bidEth = data.best_bid_price ?? null;
          const bidUsd = bidEth != null ? bidEth * currentEth : null;

          const annualizedRate = markUsd != null ? (markUsd / currentEth) / T : null;
          const strike = pending.strike;
          const breakeven = markUsd != null ? strike + markUsd : null;

          const row: OptionRow = {
            strike,
            instrumentName: name,
            markPrice: markEth,
            markPriceUsd: markUsd,
            askPrice: askEth,
            askPriceUsd: askUsd,
            bidPriceUsd: bidUsd,
            iv: data.mark_iv ?? null,
            delta: data.greeks?.delta ?? null,
            annualizedRate,
            breakeven,
            trueBreakeven: null,
            painZoneStart: strike,
            painZoneEnd: null,
          };

          setExpiryData(prev =>
            prev.map(ed => {
              if (ed.code !== pending.expiryCode) return ed;
              const existingRows = ed.rows.filter(r => r.instrumentName !== name);
              const newRows = [...existingRows, row].sort((a, b) => a.strike - b.strike);
              return { ...ed, rows: newRows, loading: false, error: null };
            })
          );
        }
      };

      ws.onerror = () => {
        // onerror 后会触发 onclose，在 onclose 里处理重连
      };

      ws.onclose = (evt) => {
        if (destroyedRef.current) return;
        if (evt.code === 1000 || evt.code === 1001) return; // 正常关闭
        retryCountRef.current += 1;
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, retryCountRef.current - 1),
          MAX_RECONNECT_DELAY
        );
        setWsStatus("reconnecting");
        setExpiryData(prev => prev.map(ed => ({ ...ed, loading: true, error: null })));
        retryTimerRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      destroyedRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (wsRef.current) wsRef.current.close(1000, "unmount");
      retryCountRef.current = 0;
    };
  }, [ethPrice]);

  return { data: expiryData, wsStatus };
}

// ─── ETH价格Hook ──────────────────────────────────────────────
function useEthPrice() {
  const [price, setPrice] = useState(0);
  const [lastUpdate, setLastUpdate] = useState("");

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        const data = await res.json();
        setPrice(data.ethereum.usd);
        setLastUpdate(new Date().toLocaleTimeString("zh-CN"));
      } catch {
        setPrice(1785);
        setLastUpdate("备用价格");
      }
    };
    fetchPrice();
    const timer = setInterval(fetchPrice, 60000);
    return () => clearInterval(timer);
  }, []);

  return { price, lastUpdate };
}

// ─── 格式化 ───────────────────────────────────────────────────
function fmt(n: number | null, decimals = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

// ─── 颜色判断（依赖滑块阈值） ─────────────────────────────────
function rateColor(rate: number | null, threshold: number): string {
  if (rate == null) return "text-gray-400";
  if (rate <= threshold * 0.75) return "text-emerald-400 font-bold";
  if (rate <= threshold) return "text-green-400 font-semibold";
  if (rate <= threshold * 1.25) return "text-yellow-400";
  return "text-red-400";
}

function isGood(rate: number | null, threshold: number): boolean {
  return rate != null && rate <= threshold;
}

// ─── 年化成本推导弹窗 ─────────────────────────────────────
function RateCalcModal({
  row,
  ethPrice,
  onClose,
}: {
  row: OptionRow;
  ethPrice: number;
  onClose: () => void;
}) {
  // 找到对应的到期日配置
  const expiry = EXPIRIES.find(e => row.instrumentName.includes(e.code));
  const daysLeft = expiry ? calcDaysLeft(expiry.code) : 365;
  const premium = row.markPriceUsd ?? 0;
  const rawRate = premium / ethPrice; // 权利金占现价比例
  const annualizedRate = rawRate * (365 / daysLeft); // 年化

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="text-white font-semibold text-sm">年化成本推导</div>
          <button onClick={onClose} className="text-gray-400 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors">×</button>
        </div>

        <div className="px-4 py-4 space-y-3 text-xs">
          {/* 公式说明 */}
          <div className="text-gray-500">
            年化成本 = (权利金 ÷ ETH现价) × (365 ÷ 剩余天数)
          </div>

          {/* 展开计算 */}
          <div className="bg-gray-800 rounded-xl px-3 py-3 space-y-2 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">权利金（标记价USD）</span>
              <span className="text-gray-300">{fmt(premium)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">ETH 现价</span>
              <span className="text-gray-300">{fmt(ethPrice)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-700 pt-2">
              <span className="text-gray-500">占现价比例</span>
              <span className="text-sky-300">{fmt(premium)} ÷ {fmt(ethPrice)} = {(rawRate * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">年化倍数</span>
              <span className="text-sky-300">365 ÷ {daysLeft}天 = {(365 / daysLeft).toFixed(2)}倍</span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-700 pt-2">
              <span className="text-gray-400 font-semibold">年化成本</span>
              <span className="text-yellow-300 font-bold text-base">{(rawRate * 100).toFixed(2)}% × {(365 / daysLeft).toFixed(2)} = <span className="text-lg">{(annualizedRate * 100).toFixed(1)}%</span></span>
            </div>
          </div>

          {/* 直观解读 */}
          <div className="bg-sky-950/30 border border-sky-900/40 rounded-xl px-3 py-2.5 text-gray-400 leading-relaxed">
            客户出了 <span className="text-gray-300 font-mono">{fmt(premium)}</span>，
            占现价 <span className="text-sky-300 font-mono">{(rawRate * 100).toFixed(2)}%</span>，
            持有 <span className="text-gray-300 font-mono">{daysLeft}</span> 天。
            折算年化相当于每年花 <span className="text-yellow-300 font-mono font-semibold">{(annualizedRate * 100).toFixed(1)}%</span>。
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 真实平衡点推导弹窗 ─────────────────────────────────────
function CalcModal({
  row,
  ethPrice,
  profitShare,
  trueBreakeven,
  onClose,
}: {
  row: OptionRow;
  ethPrice: number;
  profitShare: number;
  trueBreakeven: number;
  onClose: () => void;
}) {
  const premium = row.markPriceUsd ?? 0;
  const rhs = row.strike + premium - profitShare * ethPrice;
  const lhsCoeff = 1 - profitShare;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="text-white font-semibold text-sm">真实平衡点推导</div>
          <button onClick={onClose} className="text-gray-400 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors">×</button>
        </div>

        <div className="px-4 py-4 space-y-3 text-xs">
          {/* 条件说明 */}
          <div className="text-gray-500">
            当 ETH 到期价格达到 <span className="text-orange-300 font-mono font-bold">{fmt(trueBreakeven)}</span> 时，你的净收益 = 0：
          </div>

          {/* 逐行减法展示 */}
          <div className="bg-gray-800 rounded-xl px-3 py-3 space-y-2 font-mono">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">期权总收益（到期价−行权价）</span>
              <span className="text-sky-300">{fmt(trueBreakeven)} − {fmt(row.strike)} = <span className="font-bold">{fmt(trueBreakeven - row.strike)}</span></span>
            </div>
            <div className="flex justify-between items-center text-gray-500">
              <span className="text-gray-600 text-xs pl-2">└ 其中属于你的部分</span>
              <span className="text-gray-500 text-xs">{fmt(trueBreakeven - row.strike)} − 分润给B的部分</span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-700 pt-2">
              <span className="text-red-400">减：分给 B ({Math.round(profitShare * 100)}% × 涨幅)</span>
              <span className="text-red-300">− {Math.round(profitShare * 100)}% × ({fmt(trueBreakeven)} − {fmt(ethPrice)}) = <span className="font-bold">−{fmt((trueBreakeven - ethPrice) * profitShare)}</span></span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-700 pt-2">
              <span className="text-gray-300 font-semibold">你的净收益</span>
              <span className="text-orange-300 font-bold">{fmt(trueBreakeven - row.strike)} − {fmt((trueBreakeven - ethPrice) * profitShare)} = <span className="text-lg">0 ✓</span></span>
            </div>
          </div>

          {/* 公式源 */}
          <div className="bg-gray-800 rounded-xl px-3 py-3 space-y-1 font-mono">
            <div className="text-gray-600 text-xs mb-1">公式源：令 (P−K) = share×(P−S)，解 P</div>
            <div className="text-gray-500 text-xs">P − {fmt(row.strike)} = {profitShare.toFixed(2)} × (P − {fmt(ethPrice)})</div>
            <div className="text-gray-500 text-xs">P × {(1 - profitShare).toFixed(2)} = {fmt(row.strike)} − {profitShare.toFixed(2)} × {fmt(ethPrice)}</div>
            <div className="text-gray-500 text-xs">P × {(1 - profitShare).toFixed(2)} = {fmt(row.strike - profitShare * ethPrice, 1)}</div>
            <div className="flex items-center gap-2 pt-1 border-t border-gray-700">
              <span className="text-gray-400 text-xs">P = </span>
              <span className="text-orange-300 font-bold text-lg">{fmt(trueBreakeven)}</span>
            </div>
          </div>

          {/* 直观解读 */}
          <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-xl px-3 py-2.5 text-gray-400 leading-relaxed">
            ETH 需从现价 <span className="text-gray-300 font-mono">{fmt(ethPrice)}</span> 再涨 
            <span className="text-emerald-400 font-mono font-semibold">{fmt(trueBreakeven - ethPrice)}</span> (
            <span className="text-emerald-400 font-mono">{((trueBreakeven - ethPrice) / ethPrice * 100).toFixed(1)}%</span>)，
            超过此价之后你和 B 真正各占 {Math.round(profitShare * 100)}%。
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 详情弹窗 ────────────────────────────────────────────────
function DetailModal({
  row,
  ethPrice,
  profitShare,
  onClose,
  onRecordBuy,
}: {
  row: OptionRow;
  ethPrice: number;
  profitShare: number;
  onClose: () => void;
  onRecordBuy: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [recorded, setRecorded] = useState(false);
  const [detail, setDetail] = useState<OptionDetail>({
    gamma: null, vega: null, theta: null,
    bidPrice: null, bidSize: null, askSize: null,
    openInterest: null, volume24h: null,
    ivHistory: [], loading: true, error: null,
  });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
    let msgId = 1;

    ws.onopen = () => {
      // 拉取订单簿（含完整Greeks）
      ws.send(JSON.stringify({
        jsonrpc: "2.0", id: msgId++,
        method: "public/get_order_book",
        params: { instrument_name: row.instrumentName, depth: 5 }
      }));
      // 拉取ETH波动率指数历史（过去15天，1小时粒度）
      const now = Date.now();
      const start = now - 15 * 24 * 3600 * 1000;
      ws.send(JSON.stringify({
        jsonrpc: "2.0", id: msgId++,
        method: "public/get_volatility_index_data",
        params: { currency: "ETH", start_timestamp: start, end_timestamp: now, resolution: "3600" }
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.result) return;

      // 订单簿数据（含Greeks）
      if (msg.result.instrument_name) {
        const r = msg.result;
        const greeks = r.greeks || {};
        setDetail(prev => ({
          ...prev,
          gamma: greeks.gamma ?? null,
          vega: greeks.vega ?? null,
          theta: greeks.theta ?? null,
          bidPrice: r.best_bid_price != null ? r.best_bid_price * ethPrice : null,
          bidSize: r.best_bid_amount ?? null,
          askSize: r.best_ask_amount ?? null,
          openInterest: r.open_interest ?? null,
          volume24h: r.stats?.volume ?? null,
          loading: false,
        }));
      }

      // 波动率指数历史
      if (msg.result.data && Array.isArray(msg.result.data)) {
        const raw: number[][] = msg.result.data;
        const ivHistory = raw.slice(-15 * 24).filter((_: number[], i: number) => i % 6 === 0).map((item: number[]) => ({
          time: new Date(item[0]).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
          iv: Math.round(item[1]),
        }));
        setDetail(prev => ({ ...prev, ivHistory, loading: false }));
      }
    };

    ws.onerror = () => {
      setDetail(prev => ({ ...prev, loading: false, error: "数据加载失败" }));
    };

    return () => ws.close();
  }, [row.instrumentName]); // 快照：只在打开时拉一次，不随ethPrice实时刷新

  const premium = row.markPriceUsd ?? 0;
  const trueBreakeven = calcTrueBreakeven(row.strike, premium, ethPrice, profitShare);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-lg bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-700 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
          <div>
            <div className="text-white font-bold font-mono">{row.instrumentName}</div>
            <div className="text-gray-400 text-xs">ETH Call 期权 · 行权价 {fmt(row.strike)}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors"
          >×</button>
        </div>

        {/* 可滚动内容 */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">

          {/* 关键指标 */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "标记价", value: fmt(row.markPriceUsd), sub: row.markPrice != null ? `${row.markPrice.toFixed(4)} ETH` : undefined },
              { label: "年化成本", value: fmtPct(row.annualizedRate), sub: "权利金年化" },
              { label: "期权平衡点", value: fmt(row.breakeven), sub: "行权价+权利金" },
              { label: "真实平衡点", value: fmt(isFinite(trueBreakeven) ? trueBreakeven : null), sub: `含${Math.round(profitShare * 100)}%分润` },
            ].map(item => (
              <div key={item.label} className="bg-gray-800 rounded-lg px-3 py-2">
                <div className="text-gray-500 text-xs">{item.label}</div>
                <div className="text-white font-mono font-semibold text-sm mt-0.5">{item.value}</div>
                {item.sub && <div className="text-gray-600 text-xs">{item.sub}</div>}
              </div>
            ))}
          </div>

          {/* ETH波动率指数历史图 */}
          <div>
            <div className="text-xs text-gray-400 mb-2 flex items-center justify-between">
              <span>ETH 隐含波动率指数（过去15天）</span>
              {row.iv != null && <span className="text-sky-400 font-mono">当前IV: {row.iv.toFixed(1)}%</span>}
            </div>
            {detail.ivHistory.length > 0 ? (
              <div className="h-36 bg-gray-800 rounded-lg p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={detail.ivHistory}>
                    <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={v => `${v}%`} width={36} />
                    <Tooltip
                      contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "#9ca3af" }}
                      formatter={(v: unknown) => [`${v}%`, "IV指数"]}
                    />
                    {row.iv != null && <ReferenceLine y={row.iv} stroke="#38bdf8" strokeDasharray="3 3" />}
                    <Line type="monotone" dataKey="iv" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#a78bfa" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-36 bg-gray-800 rounded-lg flex items-center justify-center">
                <span className="text-gray-500 text-sm animate-pulse">{detail.loading ? "加载波动率数据..." : "暂无历史数据"}</span>
              </div>
            )}
          </div>

          {/* Greeks */}
          <div>
            <div className="text-xs text-gray-400 mb-2">Greeks</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Delta δ", value: row.delta != null ? row.delta.toFixed(4) : "—", desc: "价格敏感度" },
                { label: "Gamma γ", value: detail.gamma != null ? detail.gamma.toFixed(5) : "—", desc: "加速度" },
                { label: "Vega ν", value: detail.vega != null ? detail.vega.toFixed(4) : "—", desc: "IV敏感度" },
                { label: "Theta θ", value: detail.theta != null ? detail.theta.toFixed(4) : "—", desc: "时间损耗" },
              ].map(g => (
                <div key={g.label} className="bg-gray-800 rounded-lg px-2 py-2 text-center">
                  <div className="text-gray-500 text-xs">{g.label}</div>
                  <div className="text-white font-mono text-sm font-semibold mt-0.5">{g.value}</div>
                  <div className="text-gray-600 text-xs">{g.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 市场深度 */}
          <div>
            <div className="text-xs text-gray-400 mb-2">市场深度</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "买一价", value: detail.bidPrice != null ? fmt(detail.bidPrice) : "—", sub: detail.bidSize != null ? `数量: ${detail.bidSize}` : undefined, color: "text-emerald-400" },
                { label: "卖一价", value: row.askPriceUsd != null ? fmt(row.askPriceUsd) : "—", sub: detail.askSize != null ? `数量: ${detail.askSize}` : undefined, color: "text-red-400" },
                { label: "持仓量(OI)", value: detail.openInterest != null ? `${detail.openInterest.toFixed(1)} ETH` : "—", sub: "当前未平仓位" },
                { label: "24h成交量", value: detail.volume24h != null ? `${detail.volume24h.toFixed(1)} ETH` : "—", sub: "成交流动性" },
              ].map(item => (
                <div key={item.label} className="bg-gray-800 rounded-lg px-3 py-2">
                  <div className="text-gray-500 text-xs">{item.label}</div>
                  <div className={`font-mono font-semibold text-sm mt-0.5 ${'color' in item ? (item as {color: string}).color : "text-white"}`}>{item.value}</div>
                  {item.sub && <div className="text-gray-600 text-xs">{item.sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* 痛苦区警告 */}
          {isFinite(trueBreakeven) && trueBreakeven > row.strike && (
            <div className="bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2 text-xs">
              <div className="text-red-400 font-semibold mb-1">痛苦区警告</div>
              <div className="text-gray-400">
                ETH 在 <span className="text-red-300 font-mono">{fmt(row.breakeven)} ~ {fmt(trueBreakeven)}</span> 区间内到期：
              </div>
              <div className="text-gray-400 mt-0.5">
                期权有内在价值但不足以覆盖 {Math.round(profitShare * 100)}% 分润，需自行补贴差额。
              </div>
            </div>
          )}

          {/* 真实平衡点推导 */}
          {isFinite(trueBreakeven) && row.markPriceUsd != null && (
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 text-xs space-y-2">
              <div className="text-gray-300 font-semibold text-sm flex items-center gap-1.5">
                <span className="text-orange-400">ℹ️</span> 真实平衡点推导
              </div>

              {/* 条件设定 */}
              <div className="text-gray-500 leading-relaxed">
                令到期 ETH 价格为 <span className="text-orange-300 font-mono font-semibold">Ｐ</span>，求你的净收益 = 0
              </div>

              {/* 公式展开 */}
              <div className="space-y-1.5 border-l-2 border-gray-700 pl-3">
                <div className="flex justify-between items-start">
                  <span className="text-gray-500">期权内在价值</span>
                  <span className="text-gray-300 font-mono">P − {fmt(row.strike)}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-gray-500">减去权利金成本</span>
                  <span className="text-red-400 font-mono">− {fmt(row.markPriceUsd)}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-gray-500">减去分润给 B</span>
                  <span className="text-red-400 font-mono">− {Math.round(profitShare * 100)}% × (P − {fmt(ethPrice)})</span>
                </div>
                <div className="border-t border-gray-700 pt-1.5 flex justify-between items-start">
                  <span className="text-gray-400">净收益 = 0</span>
                  <span className="text-gray-300 font-mono text-xs">解出 P ↓</span>
                </div>
              </div>

              {/* 解方程过程 */}
              <div className="space-y-1 bg-gray-900/60 rounded-lg px-3 py-2">
                <div className="text-gray-500">
                  (P − {fmt(row.strike)} − {fmt(row.markPriceUsd)}) − {Math.round(profitShare * 100)}% × (P − {fmt(ethPrice)}) = 0
                </div>
                <div className="text-gray-500">
                  P × (1 − {profitShare.toFixed(2)}) = {fmt(row.strike)} + {fmt(row.markPriceUsd)} − {profitShare.toFixed(2)} × {fmt(ethPrice)}
                </div>
                <div className="text-gray-500">
                  P × {(1 - profitShare).toFixed(2)} = {fmt(row.strike + (row.markPriceUsd ?? 0) - profitShare * ethPrice, 1)}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-gray-400">P =</span>
                  <span className="text-orange-300 font-mono font-bold text-base">{fmt(trueBreakeven)}</span>
                  <span className="text-gray-600">← 真实平衡点</span>
                </div>
              </div>

              {/* 直观解读 */}
              <div className="text-gray-600 leading-relaxed border-t border-gray-700 pt-2">
                ETH 需从现价 <span className="text-gray-400 font-mono">{fmt(ethPrice)}</span> 再涨 
                <span className="text-emerald-400 font-mono font-semibold">{fmt(trueBreakeven - ethPrice)}</span>（
                <span className="text-emerald-400 font-mono">{((trueBreakeven - ethPrice) / ethPrice * 100).toFixed(1)}%</span>），
                期权净收益才能完全覆盖 {Math.round(profitShare * 100)}% 分润。
              </div>
            </div>
          )}

        </div>

        {/* 记录买入区域 */}
        <div className="shrink-0 px-4 py-3 border-t border-gray-800 bg-gray-900/80">
          {recorded ? (
            <div className="flex items-center justify-center gap-2 py-2 text-emerald-400 text-sm">
              <span>✓</span>
              <span>已记录到持仓记录本</span>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="备注（可留空），如：已下单 0.5 ETH"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-600 transition-colors"
              />
              <button
                onClick={() => {
                  onRecordBuy(note);
                  setRecorded(true);
                }}
                className="w-full bg-emerald-700 hover:bg-emerald-600 active:scale-[0.98] text-white font-semibold text-sm py-2.5 rounded-xl transition-all duration-150"
              >
                记录买入
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 单行期权数据 ──────────────────────────────────────────────────
function OptionRowItem({
  row,
  ethPrice,
  threshold,
  profitShare,
  onRecordBuy,
}: {
  row: OptionRow;
  ethPrice: number;
  threshold: number;
  profitShare: number;
  onRecordBuy: (note: string) => void;
}) {
  // 动态计算真实平衡点和痛苦区
  // 公式：(K + C - share×S) / (1 - share)，其中 C=权利金USD、S=ETH现价
  const premium = row.markPriceUsd ?? 0;
  const trueBreakeven = calcTrueBreakeven(row.strike, premium, ethPrice, profitShare);
  const painZoneStart = ethPrice; // 痛苦区从 ETH 现价开始：现价一涨客户就认为有分润
  const painZoneEnd = isFinite(trueBreakeven) ? trueBreakeven : null;
  const diffFromCurrent = row.strike - ethPrice;
  const diffPct = (diffFromCurrent / ethPrice * 100).toFixed(0);
  const isAboveAtm = row.strike > ethPrice;
  const good = isGood(row.annualizedRate, threshold);
  // 快照：点击时固定当时的 row 和 ethPrice，弹窗内不再跟随实时更新
  const [detailSnapshot, setDetailSnapshot] = useState<{ row: OptionRow; ethPrice: number } | null>(null);
  const [showCalc, setShowCalc] = useState(false);
  const [showRateCalc, setShowRateCalc] = useState(false);

  return (
    <>
      {detailSnapshot && (
        <DetailModal
          row={detailSnapshot.row}
          ethPrice={detailSnapshot.ethPrice}
          profitShare={profitShare}
          onClose={() => setDetailSnapshot(null)}
          onRecordBuy={(note) => onRecordBuy(note)}
        />
      )}
      {showCalc && (
        <CalcModal
          row={row}
          ethPrice={ethPrice}
          profitShare={profitShare}
          trueBreakeven={trueBreakeven}
          onClose={() => setShowCalc(false)}
        />
      )}
      {showRateCalc && (
        <RateCalcModal
          row={row}
          ethPrice={ethPrice}
          onClose={() => setShowRateCalc(false)}
        />
      )}
    <div className={`border-b border-gray-800 px-3 py-2.5 transition-colors duration-300 ${good ? "bg-emerald-950/30" : ""}`}>
      {/* 行权价 + 年化占比 */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-mono font-bold text-base">
            K={fmt(row.strike)}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${isAboveAtm ? "bg-orange-900/50 text-orange-300" : "bg-blue-900/50 text-blue-300"}`}>
            {isAboveAtm ? `+${diffPct}%虚值` : `${diffPct}%实值`}
          </span>
          {good && (
            <span className="text-xs bg-emerald-800/60 text-emerald-300 px-1.5 py-0.5 rounded">
              可买入
            </span>
          )}
        </div>
        <div className="text-right ml-2 shrink-0">
          <span className={`text-lg font-mono font-bold ${rateColor(row.annualizedRate, threshold)}`}>
            {fmtPct(row.annualizedRate)}
          </span>
          <button
            onClick={() => setShowRateCalc(true)}
            className="text-xs text-gray-500 hover:text-sky-300 underline underline-offset-2 decoration-dotted transition-colors duration-150"
          >年化成本</button>
        </div>
      </div>

      {/* 权利金 + 盈亏平衡 */}
      <div className="grid grid-cols-3 gap-1 text-xs">
        <div>
          <div className="text-gray-500">标记价</div>
          <div className="text-gray-200 font-mono">{fmt(row.markPriceUsd, 0)}</div>
          <div className="text-gray-600">{row.markPrice != null ? `${row.markPrice.toFixed(4)} ETH` : "—"}</div>
        </div>
        <div>
          <div className="text-gray-500">期权平衡点</div>
          <div className="text-yellow-300 font-mono font-semibold">{fmt(row.breakeven)}</div>
          <div className="text-gray-600">行权价+权利金</div>
        </div>
        <div>
          <button
            onClick={() => setShowCalc(true)}
            className="text-gray-400 hover:text-orange-300 underline underline-offset-2 decoration-dotted transition-colors duration-150 text-xs text-left"
          >真实平衡点</button>
          <div className="text-orange-300 font-mono font-semibold">{fmt(isFinite(trueBreakeven) ? trueBreakeven : null)}</div>
          <div className="text-gray-600">含{Math.round(profitShare * 100)}%分润</div>
        </div>
      </div>

      {/* 痛苦区 */}
      {painZoneEnd != null && painZoneStart != null && painZoneEnd > painZoneStart && (
        <div className="mt-1.5 text-xs">
          <span className="text-gray-500">痛苦区：</span>
          <span className="text-red-400 font-mono">
            {fmt(painZoneStart)} ~ {fmt(painZoneEnd)}
          </span>
          <span className="text-gray-600 ml-1">（客户认为有利润要分，但你还在补贴中）</span>
        </div>
      )}

      {/* IV + Delta + 详情按钮 */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex gap-3 text-xs text-gray-600">
          {row.iv != null && <span>IV: <span className="text-gray-400">{row.iv.toFixed(1)}%</span></span>}
          {row.delta != null && <span>Δ: <span className="text-gray-400">{row.delta.toFixed(3)}</span></span>}
        </div>
        <button
          onClick={() => setDetailSnapshot({ row, ethPrice })}
          className="text-xs text-sky-400 hover:text-sky-300 px-2 py-0.5 rounded border border-sky-900/50 hover:border-sky-700 transition-colors duration-150"
        >
          详情
        </button>
      </div>
    </div>
    </>
  );
}

// ─── 到期日面板 ───────────────────────────────────────────────
// ─── 双指标图表弹窗 ──────────────────────────────────────────
function ChartModal({
  data,
  ethPrice,
  threshold,
  profitShare,
  onClose,
}: {
  data: ExpiryData;
  ethPrice: number;
  threshold: number;
  profitShare: number;
  onClose: () => void;
}) {
  // 构建图表数据
  const daysLeft = data.daysLeft > 0 ? data.daysLeft : 1;
  const annFactor = 365 / daysLeft; // 年化系数
  const calcAnn = (priceUsd: number | null) =>
    priceUsd != null && priceUsd > 0 ? (priceUsd / ethPrice) * annFactor * 100 : null;
  const calcMon = (annPct: number | null) =>
    annPct != null ? annPct / 12 : null;

  const allChartData = data.rows.map(row => {
    const premium = row.markPriceUsd ?? 0;
    const annPct = row.annualizedRate != null ? row.annualizedRate * 100 : null;
    // painWidth = 行权价K − ETH现价（不含权利金，反映ETH还需涨多少才到行权价）
    const painWidth = row.strike - ethPrice;
    const trueBreakevenPrice = row.strike; // 仅用于显示，等于行权价
    const bothGood = annPct != null && annPct <= threshold * 100 && painWidth <= 0;
    const markPriceUsd = row.markPriceUsd ?? 0;
    // 三档年化/月化
    const bidAnn = calcAnn(row.bidPriceUsd);
    const markAnn = calcAnn(row.markPriceUsd);
    const askAnn = calcAnn(row.askPriceUsd);
    return {
      strike: row.strike, annPct, trueBreakevenPrice, painWidth, bothGood, markPriceUsd,
      bidPriceUsd: row.bidPriceUsd, askPriceUsd: row.askPriceUsd,
      bidAnn, markAnn, askAnn,
      bidMon: calcMon(bidAnn), markMon: calcMon(markAnn), askMon: calcMon(askAnn),
      label: `K=${row.strike}`, focusRank: null as number | null
    };
  });

  // 给边界点前后各2档标记focusRank（-2/-1/0/+1/+2）
  const boundaryIdxAll = (() => {
    let idx = -1;
    for (let i = 0; i < allChartData.length; i++) {
      if (allChartData[i].annPct != null && allChartData[i].annPct! <= threshold * 100) { idx = i; break; }
    }
    return idx;
  })();
  if (boundaryIdxAll >= 0) {
    for (let offset = -2; offset <= 2; offset++) {
      const i = boundaryIdxAll + offset;
      if (i >= 0 && i < allChartData.length) allChartData[i].focusRank = offset;
    }
  }

  const thresholdPct = threshold * 100;

  // 找到年化阈値边界附近的关键档位：取阈値左右各 4 档共 9 档，如果不够就全部显示
  const boundaryIdx = (() => {
    // 找年化成本最接近阈値且未超过的那一档（左边界）
    let idx = -1;
    for (let i = 0; i < allChartData.length; i++) {
      const d = allChartData[i];
      if (d.annPct != null && d.annPct <= thresholdPct) { idx = i; break; }
    }
    return idx;
  })();

  const chartData = (() => {
    if (boundaryIdx < 0) return allChartData;
    // 左侧：边界点左 2 档，右侧：边界点右 2 档（共 5 档）
    const start = Math.max(0, boundaryIdx - 2);
    const end = Math.min(allChartData.length - 1, boundaryIdx + 2);
    const sliced = allChartData.slice(start, end + 1);
    // 确保 K=1800 始终包含（如果存在但不在范围内，追加进去）
    const has1800 = sliced.some(d => d.strike === 1800);
    if (!has1800) {
      const pt1800 = allChartData.find(d => d.strike === 1800);
      if (pt1800) return [...sliced, pt1800].sort((a, b) => (a.strike as number) - (b.strike as number));
    }
    return sliced;
  })();

  // 边界点：年化成本最接近阈値且未超过的那一档（在截取后的数据里找）
  const boundaryStrike = (() => {
    const d = chartData.find(d => d.annPct != null && d.annPct <= thresholdPct);
    return d ? d.strike : null;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-gray-900 rounded-t-2xl border-t border-gray-700 shadow-2xl"
        style={{ maxHeight: "85vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 sticky top-0">
          <div>
            <div className="text-white font-semibold text-sm">{data.label} 建仓分析图</div>
            <div className="text-gray-500 text-xs">年化成本 ≤ {thresholdPct.toFixed(0)}% 且痛苦区为负（现在就在赚）→ 建仓甜蜂点</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors">×</button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* 建仓分析图：聚焦年化阈値边界附近的关键档位 */}
          <div>
            {/* 标题说明 */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-400">
                展示年化阈値（{thresholdPct.toFixed(0)}%）左右各 4 档共 {chartData.length} 个关键价位
              </div>
              {boundaryStrike && (
                <div className="text-xs font-semibold" style={{ color: "#fbbf24" }}>
                  左边界 K={boundaryStrike} ← 年化刚达标
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="sweetZoneGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="strike"
                  tick={(props: any) => {
                    const { x, y, payload } = props;
                    const isBoundary = payload.value === boundaryStrike;
                    return (
                      <text
                        x={x} y={y + 12}
                        textAnchor="middle"
                        fill={isBoundary ? "#fbbf24" : "#6b7280"}
                        fontSize={isBoundary ? 11 : 9}
                        fontWeight={isBoundary ? "bold" : "normal"}
                      >
                        {payload.value}
                      </text>
                    );
                  }}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                  tickFormatter={v => {
                    const prefix = v > 0 ? "+" : "";
                    return Math.abs(v) >= 1000 ? `${prefix}${(v/1000).toFixed(1)}k` : `${prefix}${v.toFixed(0)}`;
                  }}
                  width={44}
                />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number, _name: string) => [
                    `${v >= 0 ? "+" : ""}$${v.toFixed(0)}`,
                    v < 0 ? "平衡点偏差 (现在就在赚)" : "平衡点偏差 (还需ETH再涨)"
                  ]}
                  labelFormatter={(l, payload) => {
                    if (!payload || !payload[0]) return `K=${l}`;
                    const d = payload[0].payload;
                    const annStr = d.annPct != null ? ` | 年化${d.annPct.toFixed(1)}%` : "";
                    const tag = d.strike === boundaryStrike ? " [左边界]" : d.bothGood ? " [甜蜂区]" : "";
                    return `行权价 K=${l}${annStr}${tag}`;
                  }}
                />
                {/* 年化达标区域：绿色背景 */}
                {(() => {
                  const qualified = chartData.filter(d => d.annPct != null && d.annPct <= thresholdPct);
                  if (qualified.length === 0) return null;
                  return (
                    <ReferenceArea
                      x1={qualified[0].strike}
                      x2={qualified[qualified.length - 1].strike}
                      fill="rgba(52,211,153,0.18)"
                      stroke="rgba(52,211,153,0.6)"
                      strokeWidth={1.5}
                      label={{ value: `年化≤${thresholdPct}%`, fill: "#34d399", fontSize: 9, position: "insideTopLeft" }}
                    />
                  );
                })()}
                {/* 甜蜂区：绿色高亮 */}
                {(() => {
                  const sweet = chartData.filter(d => d.bothGood);
                  if (sweet.length === 0) return null;
                  return (
                    <ReferenceArea
                      x1={sweet[0].strike}
                      x2={sweet[sweet.length - 1].strike}
                      fill="url(#sweetZoneGrad2)"
                      stroke="rgba(52,211,153,0.5)"
                      strokeDasharray="4 3"
                      label={{ value: `甜蜂区`, fill: "#34d399", fontSize: 9, position: "insideTop" }}
                    />
                  );
                })()}
                {/* y=0 分界线 */}
                <ReferenceLine
                  y={0}
                  stroke="#34d399"
                  strokeDasharray="5 3"
                  strokeWidth={1.5}
                  label={{ value: "平衡点=现价", fill: "#34d399", fontSize: 9, position: "insideBottomRight" }}
                />
                {/* 左边界线：年化刚达标的行权价，黄色竖向线强调，label放在图表区外右侧避免挡线 */}
                {boundaryStrike && (
                  <ReferenceLine
                    x={boundaryStrike}
                    stroke="#fbbf24"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                )}
                {/* 橙线：平衡点偏差，5个关键点用不同颜色 */}
                <Line
                  type="monotone"
                  dataKey="painWidth"
                  stroke="#f97316"
                  strokeWidth={2}
                  strokeOpacity={0.5}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (payload.painWidth == null) return <g key={`dp-${cx}`} />;
                    const rank = payload.focusRank; // -2/-1/0/+1/+2
                    if (rank == null) return (
                      <circle key={`dp-${cx}`} cx={cx} cy={cy} r={2.5} fill="#f97316" opacity={0.35} />
                    );
                    // 5种颜色：-2蓝 -1青 0黄(边界) +1橙 +2红
                    const DOT_COLORS: Record<number, string> = {
                      [-2]: "#60a5fa",
                      [-1]: "#34d399",
                      [0]:  "#fbbf24",
                      [1]:  "#fb923c",
                      [2]:  "#f87171",
                    };
                    const color = DOT_COLORS[rank] ?? "#f97316";
                    const r = rank === 0 ? 5 : 4;
                    return (
                      <g key={`dp-${cx}-${cy}`}>
                        {rank === 0 && <circle cx={cx} cy={cy} r={9} fill="rgba(251,191,36,0.12)" />}
                        <circle cx={cx} cy={cy} r={r} fill={color} stroke="#111827" strokeWidth={1.5} />
                        {/* 边界点内显示★，其余只有颜色 */}
                        {rank === 0 && (
                          <text x={cx} y={cy + 3} textAnchor="middle" fill="#111827" fontSize={6} fontWeight="bold">★</text>
                        )}
                      </g>
                    );
                  }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
            {/* 5档对比表格 */}
            {(() => {
              const COL_COLORS: Record<number, string> = {
                [-5]: "#a78bfa", [-4]: "#818cf8", [-3]: "#38bdf8",
                [-2]: "#60a5fa", [-1]: "#34d399", [0]: "#fbbf24", [1]: "#fb923c", [2]: "#f87171",
              };
              const focusPoints = chartData
                .filter(d => d.focusRank != null)
                .sort((a, b) => (a.focusRank ?? 0) - (b.focusRank ?? 0));
              if (focusPoints.length === 0) return null;
              const fmtPct = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
              const fmtUsd = (v: number | null) => v != null ? `$${v.toFixed(0)}` : "—";
              const fmtGap = (v: number | null) => {
                if (v == null) return { text: "—", cls: "text-gray-500" };
                return v <= 0
                  ? { text: `-$${Math.abs(v).toFixed(0)}`, cls: "text-emerald-400 font-semibold" }
                  : { text: `+$${v.toFixed(0)}`, cls: "text-orange-400 font-semibold" };
              };
              // 表格行定义
              type RowDef = { label: string; sub?: string; render: (pt: typeof focusPoints[0]) => { text: string; cls?: string } };
              const rows: RowDef[] = [
                { label: "行权价", render: pt => ({ text: `K=${pt.strike}`, cls: "font-bold" }) },
                { label: "买一价", render: pt => ({ text: fmtUsd(pt.bidPriceUsd), cls: "text-emerald-300" }) },
                { label: "  年化", render: pt => ({ text: fmtPct(pt.bidAnn), cls: "text-emerald-400" }) },
                { label: "  月化", render: pt => ({ text: fmtPct(pt.bidMon), cls: "text-emerald-400/70" }) },
                { label: "标记价", render: pt => ({ text: fmtUsd(pt.markPriceUsd), cls: "text-gray-200" }) },
                { label: "  年化", render: pt => ({ text: fmtPct(pt.markAnn), cls: "text-gray-300" }) },
                { label: "  月化", render: pt => ({ text: fmtPct(pt.markMon), cls: "text-gray-400" }) },
                { label: "卖一价", render: pt => ({ text: fmtUsd(pt.askPriceUsd), cls: "text-red-300" }) },
                { label: "  年化", render: pt => ({ text: fmtPct(pt.askAnn), cls: "text-red-400" }) },
                { label: "  月化", render: pt => ({ text: fmtPct(pt.askMon), cls: "text-red-400/70" }) },
                { label: "距平衡点", render: pt => fmtGap(pt.painWidth) },
              ];
              return (
                <div className="mt-3 mb-1 overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-white/5">
                        <th className="text-left px-2 py-1.5 text-gray-500 font-normal w-16 sticky left-0 bg-[#0f172a]">指标</th>
                        {focusPoints.map(pt => (
                          <th key={pt.strike} className="px-2 py-1.5 text-center font-semibold" style={{ color: COL_COLORS[pt.focusRank ?? 0] }}>
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COL_COLORS[pt.focusRank ?? 0] }} />
                              {pt.focusRank === 0 ? "★" : pt.focusRank! > 0 ? `+${pt.focusRank}` : `${pt.focusRank}`}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((rowDef, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? "bg-white/[0.02]" : ""}>
                          <td className="px-2 py-1 text-gray-500 sticky left-0 bg-inherit whitespace-nowrap">{rowDef.label}</td>
                          {focusPoints.map(pt => {
                            const { text, cls } = rowDef.render(pt);
                            return (
                              <td key={pt.strike} className={`px-2 py-1 text-center font-mono ${cls ?? "text-gray-300"}`}>{text}</td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            {/* 图例 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-2">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
                <span className="text-yellow-400">左边界：年化刚达标（最关键价位）</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <span className="text-emerald-400">甜蜂区：年化达标且平衡点已低于现价</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-400"></span>
                <span className="text-gray-400">平衡点偏差（负=现在就在赚）</span>
              </span>
            </div>
          </div>

          {/* 建仓甜蜂点列表 */}
          {(() => {
            const sweet = chartData.filter(d => d.bothGood);
            return sweet.length > 0 ? (
              <div className="bg-emerald-950/40 border border-emerald-900/50 rounded-xl px-3 py-3">
                <div className="text-emerald-400 font-semibold text-xs mb-2">建仓甜蜂点（年化 ≤ {thresholdPct.toFixed(0)}% 且现在就在赚）</div>
                <div className="flex flex-wrap gap-2">
                  {sweet.map(d => (
                    <span key={d.strike} className="bg-emerald-900/60 text-emerald-300 font-mono text-xs px-2 py-1 rounded">
                      K={d.strike} · 年化{d.annPct?.toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl px-3 py-3 text-gray-500 text-xs text-center">
                当前暂无同时满足两个条件的档位，可调低年化阈值或等待 ETH 价格变动
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── 多到期日合并图弹窗 ──────────────────────────────────────
function MultiExpiryChartModal({
  expiryData,
  ethPrice,
  threshold,
  profitShare,
  onClose,
}: {
  expiryData: ExpiryData[];
  ethPrice: number;
  threshold: number;
  profitShare: number;
  onClose: () => void;
}) {
  // 三条线颜色（与单个图表的 DOT_COLORS 一致）
  const EXPIRY_COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#fb923c"];
  const thresholdPct = threshold * 100;

  // 为每个到期日构建曲线数据（包含 bid/mark/ask 三档年化月化）
  const seriesData = expiryData.map((ed, idx) => {
    const daysLeft = ed.daysLeft > 0 ? ed.daysLeft : 1;
    const annFactor = 365 / daysLeft;
    const calcAnn = (priceUsd: number | null) =>
      priceUsd != null && priceUsd > 0 ? (priceUsd / ethPrice) * annFactor * 100 : null;
    const calcMon = (annPct: number | null) => annPct != null ? annPct / 12 : null;
    return {
      label: ed.label,
      color: EXPIRY_COLORS[idx] ?? "#aaa",
      points: ed.rows.map(row => {
        const markUsd = row.markPriceUsd ?? 0;
        const annPct = row.annualizedRate != null ? row.annualizedRate * 100 : (markUsd > 0 ? (markUsd / ethPrice) * annFactor * 100 : null);
        // painWidth = 行权价K − ETH现价（不含权利金）
        const painWidth = row.strike - ethPrice;
        const bidAnn = calcAnn(row.bidPriceUsd);
        const markAnn = calcAnn(row.markPriceUsd);
        const askAnn = calcAnn(row.askPriceUsd);
        return {
          strike: row.strike, annPct, painWidth,
          bidPriceUsd: row.bidPriceUsd, markPriceUsd: row.markPriceUsd, askPriceUsd: row.askPriceUsd,
          bidAnn, markAnn, askAnn,
          bidMon: calcMon(bidAnn), markMon: calcMon(markAnn), askMon: calcMon(askAnn),
        };
      }),
    };
  });

  // 合并所有行权价，取并集并排序
  const allStrikes = Array.from(
    new Set(seriesData.flatMap(s => s.points.map(p => p.strike)))
  ).sort((a, b) => a - b);

  // 构建合并 chartData
  const chartData = allStrikes.map(strike => {
    const row: Record<string, number | null> = { strike };
    seriesData.forEach((s, idx) => {
      const pt = s.points.find(p => p.strike === strike);
      row[`painWidth_${idx}`] = pt?.painWidth ?? null;
      row[`annPct_${idx}`] = pt?.annPct ?? null;
      row[`markMon_${idx}`] = pt?.markMon ?? null;
    });
    return row;
  });

  // 为每条线找边界点前后各2档，标记 focusRank
  // focusRank 格式： `${expiryIdx}_${offset}` ，边界点自身是 offset=0
  const focusMap = new Map<number, { expiryIdx: number; offset: number }[]>();
  seriesData.forEach((s, expiryIdx) => {
    const boundaryPt = s.points.find(p => p.annPct != null && p.annPct <= thresholdPct);
    if (!boundaryPt) return;
    const bIdx = allStrikes.indexOf(boundaryPt.strike);
    for (let offset = -2; offset <= 2; offset++) {
      const i = bIdx + offset;
      if (i < 0 || i >= allStrikes.length) continue;
      const strike = allStrikes[i];
      if (!focusMap.has(strike)) focusMap.set(strike, []);
      focusMap.get(strike)!.push({ expiryIdx, offset });
    }
  });

    // 裁剪显示范围：各到期日边界点中最小的左5档，最大的右2档
  const focusArr = Array.from(focusMap.keys()).sort((a, b) => a - b);
  const displayStrikes = (() => {
    if (focusArr.length === 0) return allStrikes;
    // 找各到期日边界点中最小的行权价
    const minBoundaryStrike = Math.min(
      ...seriesData
        .map(s => s.points.find(p => p.annPct != null && p.annPct <= thresholdPct)?.strike)
        .filter((s): s is number => s != null)
    );
    // 找各到期日边界点中最大的行权价
    const maxBoundaryStrike = Math.max(
      ...seriesData
        .map(s => s.points.find(p => p.annPct != null && p.annPct <= thresholdPct)?.strike)
        .filter((s): s is number => s != null)
    );
    const minIdx = Math.max(0, allStrikes.indexOf(minBoundaryStrike) - 2);
    const maxIdx = Math.min(allStrikes.length - 1, allStrikes.indexOf(maxBoundaryStrike) + 2);
    const sliced = allStrikes.slice(minIdx, maxIdx + 1);
    // 确保 K=1800 始终包含
    if (!sliced.includes(1800) && allStrikes.includes(1800)) {
      return [...sliced, 1800].sort((a, b) => a - b);
    }
    return sliced;
  })();
  const displayData = chartData.filter(d => displayStrikes.includes(d.strike as number));

  // 各到期日的边界点
  const boundaryStrikes = seriesData.map(s => {
    const pt = s.points.find(p => p.annPct != null && p.annPct <= thresholdPct);
    return pt?.strike ?? null;
  });

  // 5色表格颜色（与单个图表完全一致）
  const DOT_COLORS: Record<number, string> = {
    [-2]: "#60a5fa", [-1]: "#34d399", [0]: "#fbbf24", [1]: "#fb923c", [2]: "#f87171",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-gray-900 rounded-t-2xl border-t border-gray-700 shadow-2xl"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 sticky top-0">
          <div>
            <div className="text-white font-semibold text-sm">三到期日合并分析图</div>
            <div className="text-gray-500 text-xs">Y轴：月化成本（标记价）— 越低越划算</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors">×</button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* 到期日图例 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {seriesData.map((s, idx) => (
              <span key={idx} className="flex items-center gap-1.5">
                <span className="inline-block w-5 h-1.5 rounded-full" style={{ background: s.color }} />
                <span style={{ color: s.color }}>{s.label}</span>
                {boundaryStrikes[idx] && (
                  <span className="text-yellow-400 font-mono">★K={boundaryStrikes[idx]}</span>
                )}
              </span>
            ))}
          </div>

          {/* 合并折线图 */}
          <div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={displayData} margin={{ top: 16, right: 16, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="sweetZoneGradMulti" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="strike"
                  tick={(props: any) => {
                    const { x, y, payload } = props;
                    const isBoundary = boundaryStrikes.includes(payload.value);
                    return (
                      <text x={x} y={y + 12} textAnchor="middle"
                        fill={isBoundary ? "#fbbf24" : "#6b7280"}
                        fontSize={isBoundary ? 11 : 9}
                        fontWeight={isBoundary ? "bold" : "normal"}
                      >{payload.value}</text>
                    );
                  }}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 10 }}
                  tickFormatter={v => `${v.toFixed(1)}%`}
                  width={44}
                />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any, name: string) => {
                    if (v == null) return ["-", name];
                    const idx = parseInt(name.split("_")[1]);
                    const label = seriesData[idx]?.label ?? name;
                    const val = Number(v);
                    return [`${val.toFixed(2)}% / 月`, label];
                  }}
                  labelFormatter={v => `行权价 K=${v}`}
                />
                {/* 各到期日年化达标区域箱体（3个，颜色与线一致） */}
                {seriesData.map((s, idx) => {
                  const qualified = displayData.filter(d => {
                    const ann = d[`annPct_${idx}`] as number | null;
                    return ann != null && ann <= thresholdPct;
                  });
                  if (qualified.length === 0) return null;
                  const x1 = qualified[0].strike as number;
                  const x2 = qualified[qualified.length - 1].strike as number;
                  // 每个箱体颜色用对应线的颜色，半透明
                  const hex = s.color;
                  return (
                    <ReferenceArea
                      key={`qa-${idx}`}
                      x1={x1}
                      x2={x2}
                      fill={hex}
                      fillOpacity={0.10}
                      stroke={hex}
                      strokeOpacity={0.45}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      label={{ value: `${s.label.slice(5)} ≤${thresholdPct}%`, fill: hex, fontSize: 8, position: idx === 0 ? "insideTopLeft" : idx === 1 ? "insideTop" : "insideTopRight" }}
                    />
                  );
                })}
                {/* 年化阈值对应的月化参考线 */}
                <ReferenceLine y={thresholdPct / 12} stroke="#fbbf24" strokeDasharray="5 3" strokeWidth={1.5}
                  label={{ value: `月化${(thresholdPct/12).toFixed(1)}%（阈值）`, fill: "#fbbf24", fontSize: 9, position: "insideBottomRight" }}
                />
                {/* 各到期日边界点黄色竖线 */}
                {boundaryStrikes.map((bs, idx) => bs != null && (
                  <ReferenceLine key={idx} x={bs} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 2" strokeOpacity={0.6} />
                ))}
                {/* 三条曲线：Y轴显示月化成本% */}
                {seriesData.map((s, idx) => (
                  <Line
                    key={idx}
                    type="monotone"
                    dataKey={`markMon_${idx}`}
                    stroke={s.color}
                    strokeWidth={2}
                    strokeOpacity={0.7}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      const val = payload[`markMon_${idx}`];
                      if (val == null) return <g key={`ml-${cx}-${idx}`} />;
                      const focusEntries = focusMap.get(payload.strike);
                      const myEntry = focusEntries?.find(e => e.expiryIdx === idx);
                      if (!myEntry) return <circle key={`ml-${cx}-${idx}`} cx={cx} cy={cy} r={2} fill={s.color} opacity={0.35} />;
                      const rank = myEntry.offset;
                      const color = DOT_COLORS[rank] ?? s.color;
                      const r = rank === 0 ? 5 : 4;
                      return (
                        <g key={`mf-${cx}-${idx}`}>
                          {rank === 0 && <circle cx={cx} cy={cy} r={9} fill="rgba(251,191,36,0.12)" />}
                          <circle cx={cx} cy={cy} r={r} fill={color} stroke="#111827" strokeWidth={1.5} />
                          {rank === 0 && <text x={cx} y={cy + 3} textAnchor="middle" fill="#111827" fontSize={6} fontWeight="bold">★</text>}
                        </g>
                      );
                    }}
                    connectNulls={false}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>

            {/* 各到期日 5档对比表格 */}
            {seriesData.map((s, expiryIdx) => {
              const boundaryPt = s.points.find(p => p.annPct != null && p.annPct <= thresholdPct);
              if (!boundaryPt) return null;
              const bIdx = s.points.findIndex(p => p.strike === boundaryPt.strike);
              const slicedFocus = s.points.slice(Math.max(0, bIdx - 2), Math.min(s.points.length, bIdx + 3));
              // 确保 K=1800 始终出现在表格中
              const focusPoints = (() => {
                if (!slicedFocus.some(p => p.strike === 1800)) {
                  const pt1800 = s.points.find(p => p.strike === 1800);
                  if (pt1800) return [...slicedFocus, pt1800].sort((a, b) => a.strike - b.strike);
                }
                return slicedFocus;
              })();
              const COL_COLORS: Record<number, string> = {
                [-5]: "#a78bfa", [-4]: "#818cf8", [-3]: "#38bdf8",
                [-2]: "#60a5fa", [-1]: "#34d399", [0]: "#fbbf24", [1]: "#fb923c", [2]: "#f87171",
              };
              const fmtPct = (v: number | null) => v != null ? `${v.toFixed(1)}%` : "—";
              const fmtUsd = (v: number | null) => v != null ? `$${v.toFixed(0)}` : "—";
              const fmtGap = (v: number | null) => {
                if (v == null) return { text: "—", cls: "text-gray-500" };
                return v <= 0
                  ? { text: `-$${Math.abs(v).toFixed(0)}`, cls: "text-emerald-400 font-semibold" }
                  : { text: `+$${v.toFixed(0)}`, cls: "text-orange-400 font-semibold" };
              };
              type RowDef = { label: string; render: (pt: typeof focusPoints[0]) => { text: string; cls?: string } };
              const rows: RowDef[] = [
                { label: "行权价", render: pt => ({ text: `K=${pt.strike}`, cls: "font-bold" }) },
                { label: "买一价", render: pt => ({ text: fmtUsd(pt.bidPriceUsd), cls: "text-emerald-300" }) },
                { label: "  年化", render: pt => ({ text: fmtPct(pt.bidAnn), cls: "text-emerald-400" }) },
                { label: "  月化", render: pt => ({ text: fmtPct(pt.bidMon), cls: "text-emerald-400/70" }) },
                { label: "标记价", render: pt => ({ text: fmtUsd(pt.markPriceUsd), cls: "text-gray-200" }) },
                { label: "  年化", render: pt => ({ text: fmtPct(pt.markAnn), cls: "text-gray-300" }) },
                { label: "  月化", render: pt => ({ text: fmtPct(pt.markMon), cls: "text-gray-400" }) },
                { label: "卖一价", render: pt => ({ text: fmtUsd(pt.askPriceUsd), cls: "text-red-300" }) },
                { label: "  年化", render: pt => ({ text: fmtPct(pt.askAnn), cls: "text-red-400" }) },
                { label: "  月化", render: pt => ({ text: fmtPct(pt.askMon), cls: "text-red-400/70" }) },
                { label: "距平衡点", render: pt => fmtGap(pt.painWidth) },
              ];
              return (
                <div key={expiryIdx} className="mt-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    <span className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</span>
                    <span className="text-xs text-gray-500">边界 K={boundaryPt.strike} | 年化{(boundaryPt.annPct ?? 0).toFixed(1)}%</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-white/10">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-white/5">
                          <th className="text-left px-2 py-1.5 text-gray-500 font-normal w-16 sticky left-0 bg-[#0f172a]">指标</th>
                          {focusPoints.map((pt, fi) => {
                            const offset = fi - (bIdx - Math.max(0, bIdx - 2));
                            const colColor = COL_COLORS[offset] ?? "#9ca3af";
                            return (
                              <th key={pt.strike} className="px-2 py-1.5 text-center font-semibold" style={{ color: colColor }}>
                                <span className="inline-flex items-center gap-1">
                                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: colColor }} />
                                  {offset === 0 ? "★" : offset > 0 ? `+${offset}` : `${offset}`}
                                </span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((rowDef, ri) => (
                          <tr key={ri} className={ri % 2 === 0 ? "bg-white/[0.02]" : ""}>
                            <td className="px-2 py-1 text-gray-500 sticky left-0 bg-inherit whitespace-nowrap">{rowDef.label}</td>
                            {focusPoints.map(pt => {
                              const { text, cls } = rowDef.render(pt);
                              return (
                                <td key={pt.strike} className={`px-2 py-1 text-center font-mono ${cls ?? "text-gray-300"}`}>{text}</td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            {/* ── 按行权价维度的转置对比表格 ── */}
            {(() => {
              // 收集所有显示中的行权价（displayStrikes 已包含强制追加的 K=1800）
              const fmtPct = (v: number | null | undefined) => v != null ? `${v.toFixed(1)}%` : "—";
              const fmtUsd = (v: number | null | undefined) => v != null ? `$${v.toFixed(0)}` : "—";
              const fmtGap = (v: number | null | undefined) => {
                if (v == null) return { text: "—", cls: "text-gray-500" };
                return v <= 0
                  ? { text: `-$${Math.abs(v).toFixed(0)}`, cls: "text-emerald-400 font-semibold" }
                  : { text: `+$${v.toFixed(0)}`, cls: "text-orange-400 font-semibold" };
              };
              return (
                <div className="mt-5">
                  <div className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-2">
                    <span className="inline-block w-1 h-3 rounded-full bg-purple-400" />
                    按行权价横向对比（同一行权价 × 不同到期日）
                  </div>
                  {displayStrikes.map(strike => {
                    // 每个到期日在该行权价的数据
                    const cols = seriesData.map((s, idx) => {
                      const daysLeft = s.label === "2026/09/25" ? 77 :
                        s.label === "2026/12/25" ? 168 :
                        s.label === "2027/03/26" ? 259 : 350;
                      const annFactor = 365 / (daysLeft > 0 ? daysLeft : 1);
                      const calcAnn = (p: number | null | undefined) =>
                        p != null && p > 0 ? (p / ethPrice) * annFactor * 100 : null;
                      const calcMon = (a: number | null) => a != null ? a / 12 : null;
                      const pt = s.points.find(p => p.strike === strike);
                      if (!pt) return { label: s.label, color: EXPIRY_COLORS[idx] ?? "#aaa", bidAnn: null, bidMon: null, markAnn: null, markMon: null, askAnn: null, askMon: null, painWidth: null, bidPriceUsd: null, markPriceUsd: null, askPriceUsd: null };
                      const bidAnn = calcAnn(pt.bidPriceUsd);
                      const markAnn = calcAnn(pt.markPriceUsd);
                      const askAnn = calcAnn(pt.askPriceUsd);
                      return {
                        label: s.label, color: EXPIRY_COLORS[idx] ?? "#aaa",
                        bidPriceUsd: pt.bidPriceUsd, markPriceUsd: pt.markPriceUsd, askPriceUsd: pt.askPriceUsd,
                        bidAnn, bidMon: calcMon(bidAnn),
                        markAnn, markMon: calcMon(markAnn),
                        askAnn, askMon: calcMon(askAnn),
                        painWidth: pt.painWidth,
                      };
                    });
                    const hasData = cols.some(c => c.markPriceUsd != null);
                    if (!hasData) return null;
                    const isAtm = Math.abs(strike - ethPrice) < 50;
                    return (
                      <div key={strike} className="mt-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-xs font-bold font-mono ${isAtm ? "text-yellow-400" : "text-gray-300"}`}>
                            K = {strike} {isAtm ? "★" : ""}
                          </span>
                          {isAtm && <span className="text-xs text-yellow-500/70">接近平价</span>}
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-white/10">
                          <table className="w-full text-[11px] border-collapse">
                            <thead>
                              <tr className="bg-white/5">
                                <th className="text-left px-2 py-1.5 text-gray-500 font-normal w-16 sticky left-0 bg-[#0f172a]">指标</th>
                                {cols.map((c, ci) => (
                                  <th key={ci} className="px-2 py-1.5 text-center font-semibold" style={{ color: c.color }}>
                                    {c.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                { label: "买一价", render: (c: typeof cols[0]) => ({ text: fmtUsd(c.bidPriceUsd), cls: "text-emerald-300" }) },
                                { label: "  年化", render: (c: typeof cols[0]) => ({ text: fmtPct(c.bidAnn), cls: "text-emerald-400" }) },
                                { label: "  月化", render: (c: typeof cols[0]) => ({ text: fmtPct(c.bidMon), cls: "text-emerald-400/70" }) },
                                { label: "标记价", render: (c: typeof cols[0]) => ({ text: fmtUsd(c.markPriceUsd), cls: "text-gray-200" }) },
                                { label: "  年化", render: (c: typeof cols[0]) => ({ text: fmtPct(c.markAnn), cls: "text-gray-300" }) },
                                { label: "  月化", render: (c: typeof cols[0]) => ({ text: fmtPct(c.markMon), cls: "text-gray-400" }) },
                                { label: "卖一价", render: (c: typeof cols[0]) => ({ text: fmtUsd(c.askPriceUsd), cls: "text-red-300" }) },
                                { label: "  年化", render: (c: typeof cols[0]) => ({ text: fmtPct(c.askAnn), cls: "text-red-400" }) },
                                { label: "  月化", render: (c: typeof cols[0]) => ({ text: fmtPct(c.askMon), cls: "text-red-400/70" }) },
                                { label: "距平衡点", render: (c: typeof cols[0]) => fmtGap(c.painWidth) },
                              ].map((rowDef, ri) => (
                                <tr key={ri} className={ri % 2 === 0 ? "bg-white/[0.02]" : ""}>
                                  <td className="px-2 py-1 text-gray-500 sticky left-0 bg-inherit whitespace-nowrap">{rowDef.label}</td>
                                  {cols.map((c, ci) => {
                                    const { text, cls } = rowDef.render(c);
                                    return <td key={ci} className={`px-2 py-1 text-center font-mono ${cls ?? "text-gray-300"}`}>{text}</td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* 图例 */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-3">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <span className="text-yellow-400">★ 年化刚达标边界点</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <span className="text-emerald-400">平衡点已低于现价</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-400" />
                <span className="text-gray-400">平衡点偏差（负=现在就在赚）</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpiryPanel({
  data,
  ethPrice,
  threshold,
  profitShare,
  onRecordBuy,
}: {
  data: ExpiryData;
  ethPrice: number;
  threshold: number;
  profitShare: number;
  onRecordBuy: (row: OptionRow, note: string) => void;
}) {
  const goodCount = data.rows.filter(r => isGood(r.annualizedRate, threshold)).length;
  // 快照：点击时固定当时的 data 和 ethPrice
  const [chartSnapshot, setChartSnapshot] = useState<{ data: ExpiryData; ethPrice: number } | null>(null);

  return (
    <>
      {chartSnapshot && (
        <ChartModal
          data={chartSnapshot.data}
          ethPrice={chartSnapshot.ethPrice}
          threshold={threshold}
          profitShare={profitShare}
          onClose={() => setChartSnapshot(null)}
        />
      )}
    <div className="bg-gray-900 rounded-xl overflow-hidden mb-4 border border-gray-800">
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-white font-bold text-base">{data.label} 到期</div>
          <div className="text-gray-400 text-xs">
            剩余 {data.daysLeft} 天 · {(data.daysLeft / 365 * 12).toFixed(1)} 个月
          </div>
        </div>
        <div className="text-right">
          {goodCount > 0 ? (
            <button
              onClick={() => setChartSnapshot({ data, ethPrice })}
              className="text-emerald-400 font-bold text-sm hover:text-emerald-300 underline underline-offset-2 decoration-dotted transition-colors"
            >{goodCount} 档可买 ↗</button>
          ) : (
            <button
              onClick={() => setChartSnapshot({ data, ethPrice })}
              className="text-gray-500 text-sm hover:text-gray-300 underline underline-offset-2 decoration-dotted transition-colors"
            >暂无合适档位 ↗</button>
          )}
          <div className="text-gray-500 text-xs">年化 ≤ {(threshold * 100).toFixed(0)}%</div>
        </div>
      </div>

      {data.loading ? (
        <div className="px-4 py-8 text-center text-gray-500 animate-pulse">
          正在连接 Deribit 实时数据...
        </div>
      ) : data.error ? (
        <div className="px-4 py-6 text-center text-red-400 text-sm">{data.error}</div>
      ) : data.rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-gray-500 text-sm">暂无数据，等待推送...</div>
      ) : (
        <div>
          {data.rows.map(row => (
            <OptionRowItem
              key={row.instrumentName}
              row={row}
              ethPrice={ethPrice}
              threshold={threshold}
              profitShare={profitShare}
              onRecordBuy={(note) => onRecordBuy(row, note)}
            />
          ))}
        </div>
      )}
    </div>
    </>
  );
}

// ─── 分润比例滑块 ─────────────────────────────────────────────
function ProfitShareSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);

  return (
    <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">分润比例（给对方的利润占比）</span>
        <span className="text-lg font-mono font-bold text-sky-400">{pct}%</span>
      </div>

      <div className="relative">
        <input
          type="range"
          min={10}
          max={90}
          step={5}
          value={pct}
          onChange={e => onChange(Number(e.target.value) / 100)}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #38bdf8 0%, #38bdf8 ${((pct - 10) / 80) * 100}%, #374151 ${((pct - 10) / 80) * 100}%, #374151 100%)`,
            accentColor: "#38bdf8",
          }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-600 mt-1 px-0.5">
        <span>10%</span>
        <span>25%</span>
        <span>40%</span>
        <span>50%</span>
        <span>60%</span>
        <span>75%</span>
        <span>90%</span>
      </div>

      {/* 快捷按钮 */}
      <div className="flex gap-2 mt-2">
        {[20, 30, 40, 50, 60].map(v => (
          <button
            key={v}
            onClick={() => onChange(v / 100)}
            className={`flex-1 text-xs py-1 rounded transition-colors duration-150 ${
              pct === v
                ? "bg-sky-700 text-white font-semibold"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {v}%
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 年化上限滑块 ─────────────────────────────────────────────
function ThresholdSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const pct = Math.round(value * 100);

  // 颜色随阈值变化
  const trackColor =
    pct <= 12 ? "#10b981" :
    pct <= 18 ? "#22c55e" :
    pct <= 25 ? "#eab308" :
    "#f87171";

  return (
    <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">年化上限（绿色高亮阈值）</span>
        <span
          className="text-lg font-mono font-bold transition-colors duration-200"
          style={{ color: trackColor }}
        >
          {pct}%
        </span>
      </div>

      {/* 滑块 */}
      <div className="relative">
        <input
          type="range"
          min={5}
          max={40}
          step={1}
          value={pct}
          onChange={e => onChange(Number(e.target.value) / 100)}
          className="w-full h-2 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${trackColor} 0%, ${trackColor} ${((pct - 5) / 35) * 100}%, #374151 ${((pct - 5) / 35) * 100}%, #374151 100%)`,
            accentColor: trackColor,
          }}
        />
      </div>

      {/* 刻度标签 */}
      <div className="flex justify-between text-xs text-gray-600 mt-1 px-0.5">
        <span>5%</span>
        <span>10%</span>
        <span>15%</span>
        <span>20%</span>
        <span>25%</span>
        <span>30%</span>
        <span>35%</span>
        <span>40%</span>
      </div>

      {/* 快捷按钮 */}
      <div className="flex gap-2 mt-2">
        {[10, 15, 20, 25, 30].map(v => (
          <button
            key={v}
            onClick={() => onChange(v / 100)}
            className={`flex-1 text-xs py-1 rounded transition-colors duration-150 ${
              pct === v
                ? "bg-emerald-700 text-white font-semibold"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {v}%
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 买入记录类型 ────────────────────────────────────────────
interface BuyRecord {
  id: string;
  instrumentName: string;
  strike: number;
  expiryLabel: string;
  annualizedRate: number | null;
  markPriceUsd: number | null;
  ethPriceAtBuy: number;
  trueBreakeven: number | null;
  note: string;
  createdAt: Date | number; // 数据库返回 Date，本地兼容 number
}

/** 获取或生成匿名 clientId，持久化到 localStorage */
function getClientId(): string {
  const KEY = "eth-options-client-id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ─── 持仓记录抽屉 ─────────────────────────────────────────────
function RecordDrawer({
  records,
  onDelete,
  onClose,
  isLoading,
}: {
  records: BuyRecord[];
  onDelete: (id: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-gray-900 rounded-t-2xl border border-gray-700 overflow-hidden flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 shrink-0">
          <div>
            <div className="text-white font-bold text-sm">持仓记录</div>
            <div className="text-gray-500 text-xs">{records.length} 条记录 · 永久存储于云端数据库</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors"
          >×</button>
        </div>

        {/* 记录列表 */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="text-gray-500 text-sm animate-pulse">加载中...</div>
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-gray-600 text-4xl mb-3">📋</div>
              <div className="text-gray-500 text-sm">暂无买入记录</div>
              <div className="text-gray-600 text-xs mt-1">在详情弹窗中点击「记录买入」即可保存</div>
            </div>
          ) : (
            records
              .slice()
              .sort((a, b) => {
                const ta = (rec: BuyRecord) => rec.createdAt instanceof Date ? rec.createdAt.getTime() : (rec.createdAt as number);
                return ta(b) - ta(a);
              })
              .map(rec => {
                const dateStr = new Date(rec.createdAt).toLocaleString("zh-CN", {
                  month: "numeric", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                });
                const annPct = rec.annualizedRate != null ? (rec.annualizedRate * 100).toFixed(1) : "—";
                const pnlPct = rec.trueBreakeven != null
                  ? (((rec.trueBreakeven - rec.ethPriceAtBuy) / rec.ethPriceAtBuy) * 100).toFixed(1)
                  : null;
                return (
                  <div key={rec.id} className="bg-gray-800 rounded-xl px-3 py-3 border border-gray-700">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-white font-mono font-bold text-sm">{rec.instrumentName}</div>
                        <div className="text-gray-500 text-xs mt-0.5">{dateStr} 买入</div>
                      </div>
                      <button
                        onClick={() => onDelete(rec.id)}
                        className="text-gray-600 hover:text-red-400 text-xs px-2 py-0.5 rounded hover:bg-red-950/30 transition-colors"
                      >删除</button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2.5 text-xs">
                      <div className="bg-gray-900 rounded-lg px-2 py-1.5">
                        <div className="text-gray-500">行权价</div>
                        <div className="text-white font-mono font-semibold">{fmt(rec.strike)}</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg px-2 py-1.5">
                        <div className="text-gray-500">年化成本</div>
                        <div className="text-sky-400 font-mono font-semibold">{annPct}%</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg px-2 py-1.5">
                        <div className="text-gray-500">买入时ETH</div>
                        <div className="text-gray-200 font-mono font-semibold">{fmt(rec.ethPriceAtBuy)}</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg px-2 py-1.5">
                        <div className="text-gray-500">权利金</div>
                        <div className="text-gray-200 font-mono">{rec.markPriceUsd != null ? fmt(rec.markPriceUsd) : "—"}</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg px-2 py-1.5">
                        <div className="text-gray-500">真实平衡点</div>
                        <div className="text-orange-300 font-mono">{rec.trueBreakeven != null ? fmt(rec.trueBreakeven) : "—"}</div>
                      </div>
                      <div className="bg-gray-900 rounded-lg px-2 py-1.5">
                        <div className="text-gray-500">需涨幅</div>
                        <div className={`font-mono ${pnlPct != null && parseFloat(pnlPct) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {pnlPct != null ? `+${pnlPct}%` : "—"}
                        </div>
                      </div>
                    </div>
                    {rec.note && (
                      <div className="mt-2 text-xs text-gray-500 bg-gray-900/60 rounded-lg px-2 py-1.5">
                        备注：{rec.note}
                      </div>
                    )}
                  </div>
                );
              })
          )}
        </div>

        {/* 底部说明 */}
        {records.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-800 text-xs text-gray-600 shrink-0">
            记录已永久存储于云端数据库，换设备或清除缓存后仍可读取
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────
export default function Home() {
  const { price: ethPrice, lastUpdate } = useEthPrice();
  const { data: expiryData, wsStatus } = useDeribitOptions(ethPrice);
  const [threshold, setThreshold] = useState(0.24);
  const [profitShare, setProfitShare] = useState(0.50);
  const [activeTab, setActiveTab] = useState(0); // 当前选中的到期日索引
  const [showRecords, setShowRecords] = useState(false);
  const [showMultiChart, setShowMultiChart] = useState(false);

  // ─── 匿名 clientId（首次生成后永久存于 localStorage）────────
  const clientId = useMemo(() => getClientId(), []);

  // ─── 持仓记录：从数据库读取 ──────────────────────────────────
  const utils = trpc.useUtils();
  const { data: dbRecords, isLoading: recordsLoading } = trpc.records.list.useQuery(
    { clientId },
    { enabled: !!clientId }
  );
  const records: BuyRecord[] = (dbRecords ?? []) as BuyRecord[];

  const addRecordMutation = trpc.records.add.useMutation({
    onSuccess: () => utils.records.list.invalidate({ clientId }),
  });
  const deleteRecordMutation = trpc.records.delete.useMutation({
    onSuccess: () => utils.records.list.invalidate({ clientId }),
  });

  const handleRecordBuy = (row: OptionRow, expiryLabel: string, note: string) => {
    const premium = row.markPriceUsd ?? 0;
    const trueBreakeven = calcTrueBreakeven(row.strike, premium, ethPrice, profitShare);
    addRecordMutation.mutate({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      clientId,
      instrumentName: row.instrumentName,
      strike: row.strike,
      expiryLabel,
      annualizedRate: row.annualizedRate,
      markPriceUsd: row.markPriceUsd,
      ethPriceAtBuy: ethPrice,
      trueBreakeven: isFinite(trueBreakeven) ? trueBreakeven : null,
      note,
    });
  };

  const handleDeleteRecord = (id: string) => {
    deleteRecordMutation.mutate({ id, clientId });
  };

  const totalGood = expiryData.reduce(
    (sum, ed) => sum + ed.rows.filter(r => isGood(r.annualizedRate, threshold)).length,
    0
  );

  return (
    <div className="min-h-screen text-white" style={{ background: '#0D1117' }}>
      {/* 多到期日合并图弹窗 */}
      {showMultiChart && (
        <MultiExpiryChartModal
          expiryData={expiryData}
          ethPrice={ethPrice}
          threshold={threshold}
          profitShare={profitShare}
          onClose={() => setShowMultiChart(false)}
        />
      )}

      {/* 持仓记录抽屉 */}
      {showRecords && (
        <RecordDrawer
          records={records}
          onDelete={handleDeleteRecord}
          onClose={() => setShowRecords(false)}
          isLoading={recordsLoading}
        />
      )}

      {/* 顶部状态栏 */}
      <div className="sticky top-0 z-10 border-b" style={{ background: '#161B22', borderColor: '#21262D' }}>
        {/* 连接状态条（非已连接时显示） */}
        {wsStatus !== "connected" && (
          <div className={`flex items-center gap-2 px-4 py-1 text-[10px] font-mono ${
            wsStatus === "reconnecting"
              ? "border-b text-yellow-300"
              : "border-b text-red-300"
          }`} style={{ background: wsStatus === 'reconnecting' ? 'rgba(120,80,0,0.3)' : 'rgba(120,0,0,0.3)', borderColor: '#21262D' }}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              wsStatus === "reconnecting"
                ? "bg-yellow-400 animate-pulse"
                : "bg-red-500 animate-pulse"
            }`} />
            {wsStatus === "connecting" && "CONNECTING TO DERIBIT..."}
            {wsStatus === "reconnecting" && "RECONNECTING..."}
            {wsStatus === "error" && "CONNECTION ERROR"}
          </div>
        )}

        {/* 第一行：返回首页 + ETH现价 + 状态 */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1.5">
          <div className="flex items-center gap-3">
            <a href="/" className="text-[10px] font-mono tracking-wider text-[#0ECB81] hover:text-white transition-colors duration-150 border border-[#0ECB81]/40 hover:border-white/40 rounded px-2 py-0.5">← 首页</a>
            <div>
              <div className="text-[9px] font-mono text-[#6E7681] tracking-wider">ETH / USD</div>
              <div className="text-xl font-sans font-bold text-[#E6EDF3] leading-tight">
                {ethPrice > 0 ? `$${ethPrice.toLocaleString()}` : "—"}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-500 ${
                wsStatus === "connected"
                  ? "bg-[#0ECB81]"
                  : wsStatus === "reconnecting"
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-red-500 animate-pulse"
              }`} />
              <span className={`text-[10px] font-mono ${
                wsStatus === "connected" ? "text-[#0ECB81]" :
                wsStatus === "reconnecting" ? "text-yellow-400" : "text-red-400"
              }`}>
                {wsStatus === "connected" ? "已连接" :
                 wsStatus === "reconnecting" ? "重连中" : "已断开"}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-mono text-[#6E7681] tracking-wider">QUALIFIED</div>
            {totalGood > 0 ? (
              <div className="text-[#0ECB81] font-sans font-bold text-lg leading-tight">{totalGood}</div>
            ) : (
              <div className="text-[#6E7681] text-sm leading-tight font-mono">—</div>
            )}
            <div className="text-[9px] font-mono text-[#8B949E]">{lastUpdate}</div>
          </div>
        </div>

        {/* 第二行：功能导航按钮（纯文字，无图标） */}
        <div className="flex items-stretch gap-0 border-t" style={{ borderColor: '#21262D' }}>
          <button
            onClick={() => setShowMultiChart(true)}
            className="flex-1 flex items-center justify-center py-2 text-[10px] font-mono tracking-wider text-[#8B949E] hover:text-[#E6EDF3] hover:bg-white/5 active:bg-white/10 transition-colors duration-150 border-r" style={{ borderColor: '#21262D' }}
          >
            CHART
          </button>

          <button
            onClick={() => setShowRecords(true)}
            className="relative flex-1 flex items-center justify-center py-2 text-[10px] font-mono tracking-wider text-[#8B949E] hover:text-[#E6EDF3] hover:bg-white/5 active:bg-white/10 transition-colors duration-150 border-r" style={{ borderColor: '#21262D' }}
          >
            POSITIONS
            {records.length > 0 && (
              <span className="absolute top-1 right-2 font-mono font-bold rounded-full flex items-center justify-center" style={{ fontSize: 8, width: 14, height: 14, background: '#0ECB81', color: '#0D1117' }}>
                {records.length > 9 ? "9+" : records.length}
              </span>
            )}
          </button>

          <a
            href="/history"
            className="flex-1 flex items-center justify-center py-2 text-[10px] font-mono tracking-wider text-[#8B949E] hover:text-[#E6EDF3] hover:bg-white/5 active:bg-white/10 transition-colors duration-150 border-r" style={{ borderColor: '#21262D' }}
          >
            HISTORY
          </a>

          <a
            href="/product-design"
            className="flex-1 flex items-center justify-center py-2 text-[10px] font-mono tracking-wider text-[#8B949E] hover:text-[#E6EDF3] hover:bg-white/5 active:bg-white/10 transition-colors duration-150"
          >
            PRODUCT
          </a>
        </div>
      </div>

      {/* 年化上限滑块 */}
      <ThresholdSlider value={threshold} onChange={setThreshold} />

      {/* 分润比例滑块 */}
      <ProfitShareSlider value={profitShare} onChange={setProfitShare} />

      {/* 说明栏 */}
      <div className="px-4 py-2 border-b text-[10px] font-mono" style={{ background: '#0D1117', borderColor: '#21262D', color: '#6E7681' }}>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span><span style={{ color: '#0ECB81' }}>深绿</span> ≤{(threshold * 75).toFixed(0)}%</span>
          <span><span style={{ color: '#26a65b' }}>绿色</span> ≤{(threshold * 100).toFixed(0)}%</span>
          <span><span style={{ color: '#F0B90B' }}>黄色</span> ≤{(threshold * 125).toFixed(0)}%</span>
          <span><span style={{ color: '#F6465D' }}>红色</span> &gt;{(threshold * 125).toFixed(0)}%</span>
        </div>
        <div className="mt-0.5" style={{ color: '#8B949E' }}>
          <span style={{ color: '#F0B90B' }}>真实平衡点</span> = ETH需涨至此价，期权净收益才能覆盖 {Math.round(profitShare * 100)}% 分润
        </div>
      </div>

      {/* Tab 切换栏 */}
      <div className="flex border-b" style={{ background: '#161B22', borderColor: '#21262D' }}>
        {expiryData.map((ed, i) => {
          const goodCount = ed.rows.filter(r => isGood(r.annualizedRate, threshold)).length;
          const isActive = activeTab === i;
          return (
            <button
              key={ed.code}
              onClick={() => setActiveTab(i)}
              className="flex-1 py-2.5 px-2 text-center transition-colors duration-150 relative"
              style={isActive ? { color: '#E6EDF3', borderBottom: '2px solid #F0B90B' } : { color: '#6E7681' }}
            >
              <div className="text-[11px] font-mono tracking-wider font-semibold">{ed.label}</div>
              <div className="text-[10px] mt-0.5 font-mono">
                {ed.loading ? (
                  <span style={{ color: '#3D444D' }}>加载中</span>
                ) : goodCount > 0 ? (
                  <span style={{ color: isActive ? '#0ECB81' : '#1a6644' }}>{goodCount}</span>
                ) : (
                  <span style={{ color: '#3D444D' }}>—</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 当前 Tab 的期权面板 */}
      <div className="px-4 py-4">
        {expiryData[activeTab] && (
          <ExpiryPanel
            key={expiryData[activeTab].code}
            data={expiryData[activeTab]}
            ethPrice={ethPrice}
            threshold={threshold}
            profitShare={profitShare}
            onRecordBuy={(row, note) => handleRecordBuy(row, expiryData[activeTab].label, note)}
          />
        )}
      </div>

      {/* 底部说明 */}
      <div className="px-4 pb-8 text-[9px] font-mono space-y-0.5 pt-3" style={{ color: '#3D444D' }}>
        <div>数据来源：Deribit 实时 WebSocket</div>
        <div>年化成本 = 标记价(USD) / ETH现价 / 剩余年数</div>
        <div>真实平衡点 = (行权价 + 权利金 − 分润% × ETH) / (1 − 分润%)</div>
        <div>痛苦区 = 行权价 至 真实平衡点</div>
      </div>
    </div>
  );
}
