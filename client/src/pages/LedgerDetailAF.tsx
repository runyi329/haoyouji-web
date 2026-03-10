/**
 * LedgerDetailAF.tsx - AF 定制账本专用 UI
 * 布局：
 *   顶部导航栏（账本名 + 充值/返回按钮）
 *   币种选择器（BTC / ETH / SOL）
 *   Binance K 线图（调用 Binance API）
 *   三 Tab 切换：无损合约 / 无损现货 / 行情评估
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Settings, ChevronRight, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { UserAvatar } from "@/components/UserAvatar";

interface Props {
  ledgerId: number;
  ledgerData: any;
  user: any;
}

// 币种配置
const COINS = [
  {
    symbol: "BTCUSDT",
    name: "BTC",
    fullName: "比特币",
    color: "#F7931A",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/bitcoin.webp",
  },
  {
    symbol: "ETHUSDT",
    name: "ETH",
    fullName: "以太坊",
    color: "#627EEA",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/ethereum.webp",
  },
  {
    symbol: "SOLUSDT",
    name: "SOL",
    fullName: "索拉纳",
    color: "#9945FF",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/solana.webp",
  },
];

// K 线时间周期
const INTERVALS = [
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

interface KlineBar {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TickerData {
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
}

// 简单 K 线图绘制（Canvas）
function KlineChart({
  bars,
  coinColor,
}: {
  bars: KlineBar[];
  coinColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const prices = bars.flatMap((b) => [b.high, b.low]);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;

    const padLeft = 4;
    const padRight = 4;
    const padTop = 8;
    const padBottom = 8;
    const chartW = W - padLeft - padRight;
    const chartH = H - padTop - padBottom;

    const barW = Math.max(1, chartW / bars.length);
    const gap = Math.max(0.5, barW * 0.15);
    const bodyW = Math.max(1, barW - gap * 2);

    const toY = (price: number) =>
      padTop + chartH - ((price - minP) / range) * chartH;

    // 网格线（3条横线）
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      const y = padTop + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(W - padRight, y);
      ctx.stroke();
    }

    bars.forEach((bar, i) => {
      const x = padLeft + i * barW;
      const isUp = bar.close >= bar.open;
      const color = isUp ? "#26a69a" : "#ef5350";

      const highY = toY(bar.high);
      const lowY = toY(bar.low);
      const openY = toY(bar.open);
      const closeY = toY(bar.close);

      // 影线
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, highY);
      ctx.lineTo(x + barW / 2, lowY);
      ctx.stroke();

      // 实体
      ctx.fillStyle = color;
      const bodyTop = Math.min(openY, closeY);
      const bodyH = Math.max(1, Math.abs(openY - closeY));
      ctx.fillRect(x + gap, bodyTop, bodyW, bodyH);
    });

    // 最后一根蜡烛价格标注
    const lastBar = bars[bars.length - 1];
    const lastY = toY(lastBar.close);
    const isLastUp = lastBar.close >= lastBar.open;
    ctx.strokeStyle = isLastUp ? "#26a69a" : "#ef5350";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padLeft, lastY);
    ctx.lineTo(W - padRight, lastY);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [bars, coinColor]);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={180}
      className="w-full"
      style={{ height: 180 }}
    />
  );
}

export default function LedgerDetailAF({ ledgerId, ledgerData, user }: Props) {
  const [, setLocation] = useLocation();
  const isOwner = ledgerData?.userRole === "owner";
  const isAdmin = ledgerData?.userRole === "admin";

  // 总资产
  const { data: afTotalAsset } = trpc.ledger.afGetMyTotalAsset.useQuery({
    ledgerId,
  });

  // 当前选中币种
  const [coinIdx, setCoinIdx] = useState(0);
  const coin = COINS[coinIdx];

  // 当前 K 线周期
  const [interval, setInterval] = useState("1h");

  // K 线数据
  const [klines, setKlines] = useState<KlineBar[]>([]);
  const [ticker, setTicker] = useState<TickerData | null>(null);
  const [klineLoading, setKlineLoading] = useState(false);
  const [klineError, setKlineError] = useState(false);

  // 当前 Tab
  const [tab, setTab] = useState<"contract" | "spot" | "market">("contract");

  const fetchKline = useCallback(async () => {
    setKlineLoading(true);
    setKlineError(false);
    try {
      const [klinesRes, tickerRes] = await Promise.all([
        fetch(
          `https://api.binance.com/api/v3/klines?symbol=${coin.symbol}&interval=${interval}&limit=60`
        ),
        fetch(
          `https://api.binance.com/api/v3/ticker/24hr?symbol=${coin.symbol}`
        ),
      ]);
      const klinesJson = await klinesRes.json();
      const tickerJson = await tickerRes.json();

      setKlines(
        klinesJson.map((k: any[]) => ({
          openTime: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }))
      );
      setTicker({
        lastPrice: tickerJson.lastPrice,
        priceChangePercent: tickerJson.priceChangePercent,
        highPrice: tickerJson.highPrice,
        lowPrice: tickerJson.lowPrice,
        volume: tickerJson.volume,
      });
    } catch {
      setKlineError(true);
    } finally {
      setKlineLoading(false);
    }
  }, [coin.symbol, interval]);

  useEffect(() => {
    fetchKline();
    // 每 30 秒自动刷新
    const timer = window.setInterval(fetchKline, 30000);
    return () => window.clearInterval(timer);
  }, [fetchKline]);

  const priceChange = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const isUp = priceChange >= 0;

  const formatPrice = (p: string | undefined) => {
    if (!p) return "--";
    const n = parseFloat(p);
    if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (n >= 100) return n.toFixed(2);
    return n.toFixed(4);
  };

  const formatVolume = (v: string | undefined) => {
    if (!v) return "--";
    const n = parseFloat(v);
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return n.toFixed(2);
  };

  return (
    <div className="min-h-screen bg-[#0B0E11] text-white pb-20">
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 px-4 pt-3 pb-2 flex items-center justify-between"
        style={{ backgroundColor: "#D32F2F" }}
      >
        <div className="flex items-center gap-2">
          {user && (
            <UserAvatar
              username={user.username}
              avatar={user.avatar}
              nickname={user.nickname}
              size="md"
            />
          )}
          <span className="text-base font-semibold">{ledgerData?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {(isOwner || isAdmin) && (
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
              onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            >
              <Settings className="w-4 h-4 text-white" />
            </button>
          )}
          <button
            onClick={() => setLocation(`/recharge?from=ledger&ledgerId=${ledgerId}`)}
            className="px-3 py-1 rounded-full text-sm font-medium border border-white/60 text-white"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            充值
          </button>
          <button
            onClick={() => setLocation("/ledger")}
            className="px-3 py-1 rounded-full text-sm font-medium border border-white/60 text-white"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            返回
          </button>
        </div>
      </div>

      {/* 总资产卡片 */}
      <div className="px-4 pt-3 pb-2" style={{ backgroundColor: "#D32F2F" }}>
        <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: "rgba(0,0,0,0.22)" }}>
          <div className="text-xs text-white/70 mb-1">我的总资产估值</div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-white">
              {afTotalAsset ? Number(afTotalAsset.total).toFixed(2) : "0.00"}
            </span>
            <span className="text-sm text-white/60">USDT</span>
          </div>
        </div>
      </div>

      {/* 币种选择器 */}
      <div className="flex gap-2 px-4 pt-4 pb-2">
        {COINS.map((c, i) => (
          <button
            key={c.symbol}
            onClick={() => setCoinIdx(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              coinIdx === i
                ? "text-white"
                : "bg-[#1C2127] text-gray-400"
            }`}
            style={coinIdx === i ? { backgroundColor: c.color } : {}}
          >
            <img src={c.imgUrl} alt={c.name} className="w-4 h-4 object-contain" />
            {c.name}
          </button>
        ))}
        <button
          onClick={fetchKline}
          className="ml-auto w-8 h-8 rounded-full bg-[#1C2127] flex items-center justify-center"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${klineLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* 行情数据区 */}
      <div className="px-4 pb-2">
        <div className="bg-[#131722] rounded-2xl overflow-hidden">
          {/* 价格行 */}
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
              <div>成交量 <span className="text-white">{formatVolume(ticker?.volume)}</span></div>
            </div>
          </div>

          {/* 时间周期选择 */}
          <div className="flex gap-1 px-4 pb-2">
            {INTERVALS.map((iv) => (
              <button
                key={iv.value}
                onClick={() => setInterval(iv.value)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  interval === iv.value
                    ? "bg-[#2A2E39] text-white"
                    : "text-gray-500"
                }`}
              >
                {iv.label}
              </button>
            ))}
          </div>

          {/* K 线图 */}
          <div className="px-2 pb-3" style={{ minHeight: 188 }}>
            {klineLoading && klines.length === 0 ? (
              <div className="flex items-center justify-center" style={{ height: 180 }}>
                <span className="text-gray-500 text-sm">加载中...</span>
              </div>
            ) : klineError ? (
              <div className="flex flex-col items-center justify-center gap-2" style={{ height: 180 }}>
                <span className="text-gray-500 text-sm">行情数据加载失败</span>
                <button onClick={fetchKline} className="text-xs text-blue-400">点击重试</button>
              </div>
            ) : (
              <KlineChart bars={klines} coinColor={coin.color} />
            )}
          </div>
        </div>
      </div>

      {/* 三 Tab 切换 */}
      <div className="px-4 pt-2">
        <div className="flex bg-[#1C2127] rounded-xl p-1 gap-1">
          {[
            { key: "contract", label: "无损合约" },
            { key: "spot", label: "无损现货" },
            { key: "market", label: "行情评估" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-[#D32F2F] text-white"
                  : "text-gray-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容区 */}
      <div className="px-4 pt-3">
        {tab === "contract" && (
          <ContractTab ledgerId={ledgerId} coin={coin} ticker={ticker} />
        )}
        {tab === "spot" && (
          <SpotTab ledgerId={ledgerId} coin={coin} ticker={ticker} />
        )}
        {tab === "market" && (
          <MarketTab coin={coin} klines={klines} ticker={ticker} />
        )}
      </div>
    </div>
  );
}

// ─── 无损合约 Tab ───────────────────────────────────────────────
function ContractTab({
  ledgerId,
  coin,
  ticker,
}: {
  ledgerId: number;
  coin: (typeof COINS)[0];
  ticker: TickerData | null;
}) {
  const [, setLocation] = useLocation();
  const currentPrice = ticker ? parseFloat(ticker.lastPrice) : 0;

  return (
    <div className="space-y-3">
      {/* 说明卡片 */}
      <div className="bg-[#131722] rounded-2xl p-4">
        <div className="text-sm font-semibold text-white mb-2">无损合约策略</div>
        <div className="text-xs text-gray-400 leading-relaxed">
          通过对冲机制，在合约交易中锁定本金安全，利用资金费率和价差获取收益，实现低风险稳健增值。
        </div>
      </div>

      {/* 当前价格参考 */}
      <div className="bg-[#131722] rounded-2xl p-4">
        <div className="text-xs text-gray-400 mb-3">当前参考价格</div>
        <div className="flex items-center gap-3">
          <img src={coin.imgUrl} alt={coin.name} className="w-8 h-8 object-contain" />
          <div>
            <div className="text-base font-bold text-white">
              {currentPrice > 0 ? currentPrice.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--"} USDT
            </div>
            <div className="text-xs text-gray-400">{coin.fullName} ({coin.name})</div>
          </div>
        </div>
      </div>

      {/* 进入竞猜 */}
      <button
        onClick={() => setLocation(`/ledger/${ledgerId}/crypto-prediction?coin=${coin.name}`)}
        className="w-full rounded-2xl p-4 flex items-center justify-between"
        style={{ backgroundColor: coin.color }}
      >
        <div className="text-left">
          <div className="text-white font-semibold text-sm">{coin.name} 行情竞猜</div>
          <div className="text-white/70 text-xs mt-0.5">参与预测，赢取奖励</div>
        </div>
        <ChevronRight className="w-5 h-5 text-white/70" />
      </button>
    </div>
  );
}

// ─── 无损现货 Tab ───────────────────────────────────────────────
function SpotTab({
  ledgerId,
  coin,
  ticker,
}: {
  ledgerId: number;
  coin: (typeof COINS)[0];
  ticker: TickerData | null;
}) {
  const currentPrice = ticker ? parseFloat(ticker.lastPrice) : 0;
  const change = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const isUp = change >= 0;

  return (
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
            <div className={`text-base font-bold ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
              {currentPrice > 0 ? currentPrice.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--"}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">24H涨跌</div>
            <div className={`text-base font-bold ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
              {isUp ? "+" : ""}{change.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">24H最高</div>
            <div className="text-sm text-white">
              {ticker ? parseFloat(ticker.highPrice).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--"}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">24H最低</div>
            <div className="text-sm text-white">
              {ticker ? parseFloat(ticker.lowPrice).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 行情评估 Tab ───────────────────────────────────────────────
function MarketTab({
  coin,
  klines,
  ticker,
}: {
  coin: (typeof COINS)[0];
  klines: KlineBar[];
  ticker: TickerData | null;
}) {
  // 简单技术指标计算
  const analysis = (() => {
    if (klines.length < 20) return null;
    const closes = klines.map((k) => k.close);
    const last = closes[closes.length - 1];

    // MA5 / MA20
    const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;

    // 简单 RSI（14期）
    const n = 14;
    const gains: number[] = [];
    const losses: number[] = [];
    for (let i = closes.length - n; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains.push(diff);
      else losses.push(Math.abs(diff));
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / n;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / n;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    // 波动率（近20根收盘价标准差 / 均值）
    const mean = ma20;
    const variance = closes.slice(-20).reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20;
    const volatility = (Math.sqrt(variance) / mean) * 100;

    // 综合评分
    let score = 50;
    if (last > ma5) score += 10;
    if (last > ma20) score += 10;
    if (ma5 > ma20) score += 10;
    if (rsi < 30) score += 15; // 超卖
    if (rsi > 70) score -= 15; // 超买
    if (volatility < 2) score += 5;
    score = Math.min(95, Math.max(5, score));

    const trend = last > ma20 ? "多头" : "空头";
    const sentiment =
      score >= 70 ? "偏多" : score >= 50 ? "中性偏多" : score >= 35 ? "中性偏空" : "偏空";

    return { ma5, ma20, rsi, volatility, score, trend, sentiment, last };
  })();

  const change = ticker ? parseFloat(ticker.priceChangePercent) : 0;

  return (
    <div className="space-y-3">
      {/* 综合评分 */}
      {analysis && (
        <div className="bg-[#131722] rounded-2xl p-4">
          <div className="text-sm font-semibold text-white mb-3">行情综合评估</div>
          <div className="flex items-center gap-4">
            {/* 评分圆环 */}
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                <circle cx="32" cy="32" r="26" fill="none" stroke="#2A2E39" strokeWidth="6" />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke={analysis.score >= 60 ? "#26a69a" : analysis.score >= 40 ? "#FFA000" : "#ef5350"}
                  strokeWidth="6"
                  strokeDasharray={`${(analysis.score / 100) * 163.4} 163.4`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-white">{Math.round(analysis.score)}</span>
              </div>
            </div>
            <div>
              <div className="text-base font-semibold text-white">{analysis.sentiment}</div>
              <div className="text-xs text-gray-400 mt-1">当前趋势：{analysis.trend}</div>
              <div className="text-xs text-gray-400">24H涨跌：{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div>
            </div>
          </div>
        </div>
      )}

      {/* 技术指标 */}
      {analysis && (
        <div className="bg-[#131722] rounded-2xl p-4">
          <div className="text-sm font-semibold text-white mb-3">技术指标</div>
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">MA5</span>
              <span className={`text-xs font-medium ${analysis.last >= analysis.ma5 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                {analysis.ma5.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">MA20</span>
              <span className={`text-xs font-medium ${analysis.last >= analysis.ma20 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                {analysis.ma20.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">RSI(14)</span>
              <span className={`text-xs font-medium ${analysis.rsi > 70 ? "text-[#ef5350]" : analysis.rsi < 30 ? "text-[#26a69a]" : "text-white"}`}>
                {analysis.rsi.toFixed(1)}
                {analysis.rsi > 70 ? " 超买" : analysis.rsi < 30 ? " 超卖" : ""}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">波动率</span>
              <span className="text-xs font-medium text-white">{analysis.volatility.toFixed(2)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* 免责声明 */}
      <div className="bg-[#1C2127] rounded-xl px-3 py-2">
        <p className="text-xs text-gray-500 leading-relaxed">
          以上分析仅供参考，基于 Binance 实时数据计算，不构成投资建议。加密货币市场波动较大，请谨慎决策。
        </p>
      </div>
    </div>
  );
}


