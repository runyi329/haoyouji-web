/**
 * CryptoPrediction.tsx
 * 布局：
 *   顶部导航栏（返回 + 币种名）
 *   K 线图区域（固定，不随 Tab 切换）
 *   三 Tab 切换：无损合约 / 无损现货 / 行情评估（含竞猜）
 */
import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, RefreshCw, TrendingUp, TrendingDown, Bitcoin,
  AlertCircle, WifiOff, CheckCircle2, Circle, Loader2, Users,
} from "lucide-react";
import { toast } from "sonner";

// ─── 币种配置 ──────────────────────────────────────────────────
const COIN_CONFIG: Record<string, {
  symbol: string; name: string; fullName: string; color: string; imgUrl: string;
}> = {
  BTC: {
    symbol: "BTCUSDT", name: "BTC", fullName: "比特币", color: "#F7931A",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/bitcoin.webp",
  },
  ETH: {
    symbol: "ETHUSDT", name: "ETH", fullName: "以太坊", color: "#627EEA",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ethereum.webp",
  },
  SOL: {
    symbol: "SOLUSDT", name: "SOL", fullName: "索拉纳", color: "#9945FF",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/solana.webp",
  },
};

const INTERVALS = [
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

interface KlineBar {
  openTime: number; open: number; high: number; low: number; close: number; volume: number;
}

// ─── Canvas K 线图 ─────────────────────────────────────────────
function KlineChart({ bars, coinColor }: { bars: KlineBar[]; coinColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const prices = bars.flatMap((b) => [b.high, b.low]);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const padL = 4, padR = 4, padT = 8, padB = 8;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const barW = Math.max(1, chartW / bars.length);
    const gap = Math.max(0.5, barW * 0.15);
    const bodyW = Math.max(1, barW - gap * 2);
    const toY = (p: number) => padT + chartH - ((p - minP) / range) * chartH;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      const y = padT + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }
    bars.forEach((bar, i) => {
      const x = padL + i * barW;
      const isUp = bar.close >= bar.open;
      const color = isUp ? "#26a69a" : "#ef5350";
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + barW / 2, toY(bar.high)); ctx.lineTo(x + barW / 2, toY(bar.low)); ctx.stroke();
      ctx.fillStyle = color;
      const bodyTop = Math.min(toY(bar.open), toY(bar.close));
      const bodyH = Math.max(1, Math.abs(toY(bar.open) - toY(bar.close)));
      ctx.fillRect(x + gap, bodyTop, bodyW, bodyH);
    });
    const last = bars[bars.length - 1];
    const lastY = toY(last.close);
    ctx.strokeStyle = last.close >= last.open ? "#26a69a" : "#ef5350";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, lastY); ctx.lineTo(W - padR, lastY); ctx.stroke();
    ctx.setLineDash([]);
  }, [bars, coinColor]);
  return <canvas ref={canvasRef} width={360} height={160} className="w-full" style={{ height: 160 }} />;
}

// ─── 工具函数 ──────────────────────────────────────────────────
function formatPrice(p: string | number | undefined) {
  if (p === undefined || p === null) return "--";
  const n = typeof p === "string" ? parseFloat(p) : p;
  if (isNaN(n)) return "--";
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 100) return n.toFixed(2);
  return n.toFixed(4);
}
function formatVol(v: string | undefined) {
  if (!v) return "--";
  const n = parseFloat(v);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}
function fmtProb(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return "0%";
  return `${(num * 100).toFixed(1)}%`;
}
function fmtEndDate(dateStr: string | null): string {
  if (!dateStr) return "长期";
  const d = new Date(dateStr);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "已截止";
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "今天截止";
  if (days < 30) return `${days}天后截止`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月后截止`;
  return `${Math.floor(months / 12)}年后截止`;
}

// ─── 竞猜骨架屏 ───────────────────────────────────────────────
function EventCardSkeleton() {
  return (
    <div className="bg-[#1C2127] rounded-2xl overflow-hidden mb-3 p-4">
      <div className="h-4 bg-[#2A2E39] rounded-full w-full animate-pulse mb-2" />
      <div className="h-4 bg-[#2A2E39] rounded-full w-3/4 animate-pulse mb-3" />
      <div className="h-12 bg-[#2A2E39] rounded-xl animate-pulse mb-2" />
      <div className="h-12 bg-[#2A2E39] rounded-xl animate-pulse" />
    </div>
  );
}

// ─── 竞猜卡片 ─────────────────────────────────────────────────
interface PredictionEvent {
  id: number; question: string; outcomes: string[]; outcomePrices: string[];
  volume: string | null; endDate: string | null; imageUrl: string | null;
  myPrediction: { selectedOutcome: string; selectedIndex: number } | null;
}

function EventCard({ event, ledgerId, onPredicted }: {
  event: PredictionEvent; ledgerId: number; onPredicted: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(
    event.myPrediction ? event.myPrediction.selectedIndex : null
  );
  const [expanded, setExpanded] = useState(false);
  const submitMutation = trpc.prediction.submitPrediction.useMutation({
    onSuccess: () => { toast.success("预测已提交", { description: "你的观点已记录" }); onPredicted(); },
    onError: (e) => toast.error("提交失败", { description: e.message }),
  });
  const { data: statsData } = trpc.prediction.getEventStats.useQuery(
    { ledgerId, eventId: event.id }, { enabled: expanded }
  );
  function handleSelect(idx: number) {
    if (submitMutation.isPending) return;
    setSelected(idx);
    submitMutation.mutate({ ledgerId, eventId: event.id, selectedOutcome: event.outcomes[idx], selectedIndex: idx });
  }
  return (
    <div className="bg-[#1C2127] rounded-2xl overflow-hidden mb-3 relative">
      <div className="px-4 pt-4 pb-3">
        <p className="text-sm font-medium text-white leading-relaxed">{event.question}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          {event.volume && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />{formatVol(event.volume)} 交易量
            </span>
          )}
          <span>{fmtEndDate(event.endDate)}</span>
        </div>
      </div>
      <div className="px-4 pb-3 space-y-2">
        {event.outcomes.map((outcome, idx) => {
          const prob = event.outcomePrices[idx];
          const probNum = parseFloat(prob || "0");
          const isSelected = selected === idx;
          const isYes = idx === 0;
          return (
            <button key={idx} onClick={() => handleSelect(idx)} disabled={submitMutation.isPending}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                isSelected
                  ? isYes ? "bg-[#26a69a]/20 border-[#26a69a]" : "bg-[#ef5350]/20 border-[#ef5350]"
                  : "bg-[#131722] border-[#2A2E39]"
              }`}>
              <div className="flex items-center gap-2">
                {submitMutation.isPending && isSelected
                  ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  : isSelected
                    ? <CheckCircle2 className={`w-4 h-4 ${isYes ? "text-[#26a69a]" : "text-[#ef5350]"}`} />
                    : <Circle className="w-4 h-4 text-gray-600" />}
                <span className={`text-sm font-medium ${isSelected ? (isYes ? "text-[#26a69a]" : "text-[#ef5350]") : "text-gray-300"}`}>
                  {outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 rounded-full w-16 bg-[#2A2E39] overflow-hidden">
                  <div className={`h-full rounded-full ${isYes ? "bg-[#26a69a]" : "bg-[#ef5350]"}`}
                    style={{ width: `${Math.round(probNum * 100)}%` }} />
                </div>
                <span className={`text-xs font-semibold w-10 text-right ${isYes ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                  {fmtProb(prob)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className="border-t border-[#2A2E39]">
          <button onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-500">
            <Users className="w-3.5 h-3.5" />
            {expanded ? "收起成员预测" : "查看成员预测分布"}
          </button>
          {expanded && statsData && (
            <div className="px-4 pb-3">
              <div className="text-xs text-gray-500 mb-2">共 {statsData.total} 人预测</div>
              {event.outcomes.map((outcome, idx) => {
                const displayName = outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome;
                const count = statsData.distribution[outcome] || 0;
                const pct = statsData.total > 0 ? Math.round((count / statsData.total) * 100) : 0;
                return (
                  <div key={idx} className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{displayName}</span>
                      <span className="text-gray-500">{count}人 ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-[#2A2E39] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${idx === 0 ? "bg-[#D32F2F]" : "bg-gray-500"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {submitMutation.isPending && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────
export default function CryptoPrediction() {
  const [, params] = useRoute("/ledger/:id/crypto-prediction");
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(params?.id || "0");

  const urlParams = new URLSearchParams(window.location.search);
  const initialCoin = (urlParams.get("coin") || "BTC").toUpperCase();
  const coinKey = COIN_CONFIG[initialCoin] ? initialCoin : "BTC";
  const coin = COIN_CONFIG[coinKey];

  const [interval, setIntervalVal] = useState("1h");
  const [tab, setTab] = useState<"contract" | "spot" | "market">("contract");

  // 委托交易面板状态
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderAmount, setOrderAmount] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [sliderPct, setSliderPct] = useState(0);

  // 可用余额（账本总资产）
  const { data: assetData } = trpc.ledger.afGetMyTotalAsset.useQuery(
    { ledgerId },
    { enabled: !!ledgerId, staleTime: 30000 }
  );
  const availableUsdt = (assetData as any)?.total ?? 0;

  // Binance 行情（后端代理）
  const { data: tickerData, isLoading: tickerLoading, refetch: refetchTicker } =
    trpc.ledger.getBinanceTicker.useQuery({ symbol: coin.symbol }, { staleTime: 30000, refetchInterval: 30000 });
  const { data: klinesData, isLoading: klinesLoading, refetch: refetchKlines } =
    trpc.ledger.getBinanceKlines.useQuery({ symbol: coin.symbol, interval, limit: 60 }, { staleTime: 30000 });

  const bars: KlineBar[] = (klinesData as KlineBar[] | undefined) || [];
  const ticker = tickerData as any;
  const priceChange = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const isUp = priceChange >= 0;

  // 竞猜（行情评估 Tab）
  const predCoin = (coinKey === "SOL" ? "BTC" : coinKey) as "BTC" | "ETH";
  const { data: predData, isLoading: predLoading, error: predError, refetch: refetchPred, isFetching: predFetching } =
    trpc.prediction.listEvents.useQuery(
      { ledgerId, coin: predCoin, limit: 30 },
      { enabled: tab === "market" && !!ledgerId, staleTime: 5 * 60 * 1000, retry: 1 }
    );
  const events: PredictionEvent[] = ((predData as any)?.events || []) as PredictionEvent[];

  // 技术指标
  const analysis = (() => {
    if (bars.length < 20) return null;
    const closes = bars.map((b) => b.close);
    const last = closes[closes.length - 1];
    const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const n = 14;
    const gains: number[] = [], losses: number[] = [];
    for (let i = closes.length - n; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains.push(diff); else losses.push(Math.abs(diff));
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / n;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / n;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    const variance = closes.slice(-20).reduce((a, b) => a + Math.pow(b - ma20, 2), 0) / 20;
    const volatility = (Math.sqrt(variance) / ma20) * 100;
    let score = 50;
    if (last > ma5) score += 10;
    if (last > ma20) score += 10;
    if (ma5 > ma20) score += 10;
    if (rsi < 30) score += 15;
    if (rsi > 70) score -= 15;
    if (volatility < 2) score += 5;
    score = Math.min(95, Math.max(5, score));
    const sentiment = score >= 70 ? "偏多" : score >= 50 ? "中性偏多" : score >= 35 ? "中性偏空" : "偏空";
    return { ma5, ma20, rsi, volatility, score, sentiment, last };
  })();

  return (
    <div className="min-h-screen bg-[#0B0E11] text-white pb-20">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 px-4 pt-3 pb-2 flex items-center justify-between bg-[#D32F2F]">
        <div className="flex items-center gap-2">
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-1">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <img src={coin.imgUrl} alt={coin.name} className="w-6 h-6 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span className="text-base font-semibold">{coin.fullName}（{coin.name}）</span>
        </div>
        <button onClick={() => { refetchTicker(); refetchKlines(); }}
          disabled={klinesLoading || tickerLoading}
          className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20">
          <RefreshCw className={`w-3.5 h-3.5 text-white ${(klinesLoading || tickerLoading) ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* K 线图区域（固定，不随 Tab 切换） */}
      <div className="bg-[#131722]">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                {formatPrice(ticker?.lastPrice)}
              </span>
              <span className="text-xs text-gray-400">USDT</span>
            </div>
            <div className={`flex items-center gap-1 text-sm mt-0.5 ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
              {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {isUp ? "+" : ""}{priceChange.toFixed(2)}%
            </div>
          </div>
          <div className="text-right text-xs text-gray-400 space-y-1">
            <div>24H高 <span className="text-white">{formatPrice(ticker?.highPrice)}</span></div>
            <div>24H低 <span className="text-white">{formatPrice(ticker?.lowPrice)}</span></div>
            <div>成交量 <span className="text-white">{formatVol(ticker?.volume)}</span></div>
          </div>
        </div>
        <div className="flex gap-1 px-4 pb-2">
          {INTERVALS.map((iv) => (
            <button key={iv.value} onClick={() => setIntervalVal(iv.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${interval === iv.value ? "bg-[#2A2E39] text-white" : "text-gray-500"}`}>
              {iv.label}
            </button>
          ))}
        </div>
        <div className="px-2 pb-3" style={{ minHeight: 168 }}>
          {klinesLoading && bars.length === 0 ? (
            <div className="flex items-center justify-center" style={{ height: 160 }}>
              <span className="text-gray-500 text-sm">加载行情数据...</span>
            </div>
          ) : bars.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2" style={{ height: 160 }}>
              <span className="text-gray-500 text-sm">行情数据加载失败</span>
              <button onClick={() => refetchKlines()} className="text-xs text-blue-400">点击重试</button>
            </div>
          ) : (
            <KlineChart bars={bars} coinColor={coin.color} />
          )}
        </div>
      </div>

      {/* 三 Tab 切换 */}
      <div className="px-4 pt-3">
        <div className="flex bg-[#1C2127] rounded-xl p-1 gap-1">
          {[
            { key: "contract", label: "无损合约" },
            { key: "spot", label: "无损现货" },
            { key: "market", label: "行情评估" },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-[#D32F2F] text-white" : "text-gray-400"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="px-4 pt-3">

        {/* 无损合约 */}
        {tab === "contract" && (
          <div className="space-y-3 pb-4">
            {/* 委买 / 委卖 切换 */}
            <div className="flex rounded-xl overflow-hidden border border-[#2A2E39]">
              <button
                onClick={() => { setOrderSide("buy"); setOrderAmount(""); setSliderPct(0); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  orderSide === "buy" ? "bg-[#26a69a] text-white" : "bg-[#1C2127] text-gray-400"
                }`}>
                委买
              </button>
              <button
                onClick={() => { setOrderSide("sell"); setOrderAmount(""); setSliderPct(0); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  orderSide === "sell" ? "bg-[#ef5350] text-white" : "bg-[#1C2127] text-gray-400"
                }`}>
                委卖
              </button>
            </div>

            {/* 限价委托价格输入框 */}
            <div className="bg-[#1C2127] rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-sm text-gray-400 w-14">限价委托</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="输入价格"
                value={orderPrice}
                onChange={(e) => setOrderPrice(e.target.value)}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-600"
              />
              <span className="text-sm text-white opacity-50">USDT</span>
            </div>
            {/* 金额输入框 */}
            <div className="bg-[#1C2127] rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-sm text-gray-400 w-14">金额</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={orderAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  setOrderAmount(val);
                  const num = parseFloat(val);
                  if (!isNaN(num) && availableUsdt > 0) {
                    setSliderPct(Math.min(100, Math.round((num / availableUsdt) * 100)));
                  } else {
                    setSliderPct(0);
                  }
                }}
                className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-600"
              />
              <span className="text-sm text-white opacity-50">USDT</span>
            </div>

            {/* 5档进度条 */}
            <div className="px-0">
              <div className="relative h-7 flex items-center">
                {/* 底部轨道 */}
                <div className="absolute left-0 right-0 h-0.5 bg-[#2A2E39] rounded-full" />
                {/* 已选轨道 */}
                <div
                  className="absolute left-0 h-0.5 rounded-full"
                  style={{
                    width: sliderPct === 0 ? '0%' : `${sliderPct}%`,
                    backgroundColor: orderSide === "buy" ? "#26a69a" : "#ef5350"
                  }}
                />
                {/* 透明 range input 支持拖动 */}
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={sliderPct}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setSliderPct(val);
                    const amt = availableUsdt > 0 ? (availableUsdt * val / 100) : 0;
                    setOrderAmount(amt > 0 ? amt.toFixed(2) : "");
                  }}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer z-20"
                />
                {/* 5个档位点 - 第一个靠左端，最后一个靠右端 */}
                {[0, 25, 50, 75, 100].map((pct, idx) => {
                  let leftStyle: string;
                  if (idx === 0) leftStyle = '0px';
                  else if (idx === 4) leftStyle = 'calc(100% - 14px)';
                  else leftStyle = `calc(${pct}% - 7px)`;
                  return (
                    <button
                      key={pct}
                      onClick={() => {
                        setSliderPct(pct);
                        const amt = availableUsdt > 0 ? (availableUsdt * pct / 100) : 0;
                        setOrderAmount(amt > 0 ? amt.toFixed(2) : "");
                      }}
                      className="absolute z-10"
                      style={{ left: leftStyle }}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                          sliderPct >= pct
                            ? orderSide === "buy"
                              ? "bg-[#26a69a] border-[#26a69a]"
                              : "bg-[#ef5350] border-[#ef5350]"
                            : "bg-[#0B0E11] border-[#2A2E39]"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              {/* 百分比标签 */}
              <div className="flex justify-between mt-1">
                {["0%", "25%", "50%", "75%", "100%"].map((label) => (
                  <span key={label} className="text-xs text-gray-600">{label}</span>
                ))}
              </div>
            </div>

            {/* 可用金额 + 充值按钮 */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-gray-500">可用</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">
                  {availableUsdt > 0 ? availableUsdt.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--"} USDT
                </span>
                <button
                  onClick={() => setLocation(`/recharge?ledgerId=${ledgerId}`)}
                  className="w-5 h-5 rounded-full bg-[#2A2E39] flex items-center justify-center text-gray-400 hover:bg-[#3A3E49] transition-colors"
                  title="充值"
                >
                  <span className="text-xs leading-none">+</span>
                </button>
              </div>
            </div>

            {/* 可买数量 */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-gray-500">可{orderSide === "buy" ? "买" : "卖"}</span>
              <span className="text-xs text-gray-300">
                {(() => {
                  const amt = parseFloat(orderAmount);
                  const price = parseFloat(orderPrice) || parseFloat(ticker?.lastPrice || "0");
                  if (!isNaN(amt) && amt > 0 && price > 0) {
                    const qty = amt / price;
                    return `${qty.toFixed(8)} ${coin.name}`;
                  }
                  return `-- ${coin.name}`;
                })()}
              </span>
            </div>

            {/* 确认按钮 */}
            <button
              onClick={() => {
                const amt = parseFloat(orderAmount);
                const price = parseFloat(orderPrice);
                if (!price || price <= 0) { toast.error("请输入委托价格"); return; }
                if (!amt || amt <= 0) { toast.error("请输入金额"); return; }
                if (amt > availableUsdt) { toast.error("金额超过可用余额"); return; }
                const qty = (amt / price).toFixed(8);
                toast.success(`委${orderSide === "buy" ? "买" : "卖"} ${coin.name} 委托已提交`, {
                  description: `价格：${price} USDT · 金额：${amt.toFixed(2)} USDT · 数量：${qty} ${coin.name}`
                });
              }}
              className={`w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-opacity ${
                orderSide === "buy" ? "bg-[#26a69a]" : "bg-[#ef5350]"
              } ${(!orderAmount || parseFloat(orderAmount) <= 0) ? "opacity-50" : "opacity-100"}`}
            >
              {orderSide === "buy" ? `买入 ${coin.name}` : `卖出 ${coin.name}`}
            </button>
          </div>
        )}

        {/* 无损现货 */}
        {tab === "spot" && (
          <div className="space-y-3">
            <div className="bg-[#131722] rounded-2xl p-4">
              <div className="text-sm font-semibold text-white mb-2">无损现货策略</div>
              <div className="text-xs text-gray-400 leading-relaxed">
                通过网格交易与定投结合，在现货市场中分批建仓，利用价格波动自动低买高卖，降低持仓成本，实现无损增持。
              </div>
            </div>
            <div className="bg-[#131722] rounded-2xl p-4">
              <div className="text-xs text-gray-400 mb-3">实时行情</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">当前价</div>
                  <div className={`text-base font-bold ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>{formatPrice(ticker?.lastPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">24H涨跌</div>
                  <div className={`text-base font-bold ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>{isUp ? "+" : ""}{priceChange.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">24H最高</div>
                  <div className="text-sm text-white">{formatPrice(ticker?.highPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">24H最低</div>
                  <div className="text-sm text-white">{formatPrice(ticker?.lowPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">成交量</div>
                  <div className="text-sm text-white">{formatVol(ticker?.volume)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">加权均价</div>
                  <div className="text-sm text-white">{formatPrice(ticker?.weightedAvgPrice)}</div>
                </div>
              </div>
            </div>
            {analysis && (
              <div className="bg-[#131722] rounded-2xl p-4">
                <div className="text-xs text-gray-400 mb-3">综合评分</div>
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="#2A2E39" strokeWidth="6" />
                      <circle cx="32" cy="32" r="26" fill="none"
                        stroke={analysis.score >= 60 ? "#26a69a" : analysis.score >= 40 ? "#FFA000" : "#ef5350"}
                        strokeWidth="6"
                        strokeDasharray={`${(analysis.score / 100) * 163.4} 163.4`}
                        strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">{Math.round(analysis.score)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">{analysis.sentiment}</div>
                    <div className="text-xs text-gray-400 mt-1">波动率 {analysis.volatility.toFixed(2)}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 行情评估（竞猜） */}
        {tab === "market" && (
          <div>
            <div className="bg-[#1C2127] border border-[#2A2E39] rounded-xl px-3 py-2 flex items-start gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400 leading-relaxed">
                竞猜数据来自 <span className="font-semibold text-white">Polymarket</span> 预测市场，概率为实时市场价格，仅供参考，不构成投资建议。
              </p>
            </div>
            {predLoading ? (
              <><EventCardSkeleton /><EventCardSkeleton /><EventCardSkeleton /></>
            ) : predError ? (
              <div className="bg-[#1C2127] rounded-2xl px-5 py-8 flex flex-col items-center gap-3 text-center">
                <WifiOff className="w-10 h-10 text-gray-600" />
                <p className="text-sm font-medium text-gray-300">数据加载失败</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {predError.message || "无法连接到 Polymarket，请检查网络后重试"}
                </p>
                <button onClick={() => refetchPred()} disabled={predFetching}
                  className="mt-1 flex items-center gap-2 bg-[#D32F2F] text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
                  <RefreshCw className={`w-4 h-4 ${predFetching ? "animate-spin" : ""}`} />
                  重新加载
                </button>
              </div>
            ) : events.length === 0 ? (
              <div className="bg-[#1C2127] rounded-2xl px-5 py-8 flex flex-col items-center gap-3 text-center">
                <Bitcoin className="w-12 h-12 text-gray-600" />
                <p className="text-sm font-medium text-gray-300">暂无 {coin.name} 竞猜事件</p>
                <p className="text-xs text-gray-500">Polymarket 当前没有活跃的预测市场，请稍后再试</p>
                <button onClick={() => refetchPred()} disabled={predFetching}
                  className="mt-1 flex items-center gap-2 bg-[#2A2E39] text-gray-300 px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
                  <RefreshCw className={`w-4 h-4 ${predFetching ? "animate-spin" : ""}`} />
                  重新加载
                </button>
              </div>
            ) : (
              events.map((event) => (
                <EventCard key={event.id} event={event} ledgerId={ledgerId} onPredicted={() => refetchPred()} />
              ))
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-2 pb-4">
        <p className="text-xs text-gray-600 leading-relaxed text-center">
          行情数据来源：Binance · 仅供参考，不构成投资建议
        </p>
      </div>
    </div>
  );
}
