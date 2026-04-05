import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, RefreshCw, ExternalLink, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ContractData {
  symbol: string;
  name: string;
  unit: string;
  markPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  openInterest: number;
}

interface FundingHistory {
  fundingTime: number;
  fundingRate: number;
}

const CONTRACTS = [
  { symbol: "CLUSDT", name: "WTI原油", shortName: "WTI", unit: "USD/桶", binanceUrl: "https://www.binance.com/zh-CN/futures/CLUSDT" },
  { symbol: "BZUSDT", name: "布伦特原油", shortName: "BRENT", unit: "USD/桶", binanceUrl: "https://www.binance.com/zh-CN/futures/BZUSDT" },
  { symbol: "NATGASUSDT", name: "天然气", shortName: "NATGAS", unit: "USD/MMBtu", binanceUrl: "https://www.binance.com/zh-CN/futures/NATGASUSDT" },
];

function formatRate(rate: number) {
  return (rate * 100).toFixed(4) + "%";
}

function formatPrice(price: number, symbol: string) {
  if (symbol === "NATGASUSDT") return price.toFixed(3);
  return price.toFixed(2);
}

function formatVolume(vol: number) {
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + "M";
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + "K";
  return vol.toFixed(0);
}

function Countdown({ nextFundingTime }: { nextFundingTime: number }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = nextFundingTime - Date.now();
      if (diff <= 0) { setRemaining("00:00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [nextFundingTime]);

  return <span className="font-mono text-amber-400">{remaining}</span>;
}

function MiniChart({ data, symbol }: { data: FundingHistory[]; symbol: string }) {
  if (!data || data.length < 2) return <div className="h-16 flex items-center justify-center text-gray-600 text-xs">暂无数据</div>;

  const rates = data.map(d => d.fundingRate * 100);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = max - min || 0.001;
  const w = 280;
  const h = 60;
  const pts = rates.map((r, i) => {
    const x = (i / (rates.length - 1)) * w;
    const y = h - ((r - min) / range) * (h - 8) - 4;
    return `${x},${y}`;
  }).join(" ");

  const lastRate = rates[rates.length - 1];
  const color = lastRate >= 0 ? "#22c55e" : "#ef4444";

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-16">
      <defs>
        <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
      <line x1="0" y1={h - ((0 - min) / range) * (h - 8) - 4} x2={w} y2={h - ((0 - min) / range) * (h - 8) - 4}
        stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" strokeDasharray="3,3" />
    </svg>
  );
}

export default function OilBusinessPage() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const ledgerId = params.id;

  const [contracts, setContracts] = useState<ContractData[]>([]);
  const [fundingHistory, setFundingHistory] = useState<Record<string, FundingHistory[]>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<string>("CLUSDT");

  const fetchData = useCallback(async () => {
    try {
      const results: ContractData[] = [];
      for (const c of CONTRACTS) {
        const [premRes, tickerRes, oiRes] = await Promise.all([
          fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${c.symbol}`),
          fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${c.symbol}`),
          fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${c.symbol}`),
        ]);
        const prem = await premRes.json();
        const ticker = await tickerRes.json();
        const oi = await oiRes.json();
        results.push({
          symbol: c.symbol,
          name: c.name,
          unit: c.unit,
          markPrice: parseFloat(prem.markPrice),
          lastFundingRate: parseFloat(prem.lastFundingRate),
          nextFundingTime: prem.nextFundingTime,
          priceChangePercent: parseFloat(ticker.priceChangePercent),
          highPrice: parseFloat(ticker.highPrice),
          lowPrice: parseFloat(ticker.lowPrice),
          volume: parseFloat(ticker.volume),
          openInterest: parseFloat(oi.openInterest),
        });
      }
      setContracts(results);

      // 获取资金费率历史
      const histMap: Record<string, FundingHistory[]> = {};
      for (const c of CONTRACTS) {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${c.symbol}&limit=32`);
        const data = await res.json();
        histMap[c.symbol] = data.map((d: any) => ({
          fundingTime: d.fundingTime,
          fundingRate: parseFloat(d.fundingRate),
        }));
      }
      setFundingHistory(histMap);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("数据获取失败", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData]);

  const activeContract = contracts.find(c => c.symbol === activeTab);
  const activeContractInfo = CONTRACTS.find(c => c.symbol === activeTab);

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: "#0a0c10", fontFamily: "'SF Mono', 'Consolas', monospace" }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-20 border-b" style={{ backgroundColor: "#0d1117", borderColor: "#1e2530" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">返回</span>
          </button>
          <div className="text-center">
            <div className="text-sm font-semibold tracking-widest text-amber-400 uppercase">Energy Markets</div>
            <div className="text-xs text-gray-500">Binance Perpetual Futures</div>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {lastUpdated && (
          <div className="px-4 pb-1.5 text-right text-xs text-gray-600">
            更新于 {lastUpdated.toLocaleTimeString("zh-CN")}
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded animate-pulse" style={{ backgroundColor: "#141920" }} />
          ))}
        </div>
      ) : (
        <div className="pb-8">
          {/* 三大合约价格卡片 */}
          <div className="p-4 space-y-3">
            {contracts.map((c) => {
              const info = CONTRACTS.find(x => x.symbol === c.symbol)!;
              const isUp = c.priceChangePercent >= 0;
              const rateColor = c.lastFundingRate >= 0 ? "#22c55e" : "#ef4444";
              return (
                <div
                  key={c.symbol}
                  className="rounded-lg p-4 cursor-pointer transition-all"
                  style={{
                    backgroundColor: activeTab === c.symbol ? "#141f2e" : "#111620",
                    border: `1px solid ${activeTab === c.symbol ? "#2a4a7f" : "#1e2530"}`,
                  }}
                  onClick={() => setActiveTab(c.symbol)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold tracking-widest px-1.5 py-0.5 rounded" style={{ backgroundColor: "#1e2d40", color: "#60a5fa" }}>
                          {info.shortName}
                        </span>
                        <span className="text-sm text-gray-300">{c.name}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{info.unit}</div>
                    </div>
                    <a
                      href={info.binanceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-gray-600 hover:text-blue-400 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-bold tracking-tight" style={{ fontFamily: "monospace" }}>
                        {formatPrice(c.markPrice, c.symbol)}
                      </div>
                      <div className={`flex items-center gap-1 text-sm mt-0.5 ${isUp ? "text-green-400" : "text-red-400"}`}>
                        {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {isUp ? "+" : ""}{c.priceChangePercent.toFixed(2)}% 24h
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500 mb-0.5">资金费率</div>
                      <div className="text-base font-bold" style={{ color: rateColor }}>
                        {formatRate(c.lastFundingRate)}
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        结算 <Countdown nextFundingTime={c.nextFundingTime} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: "1px solid #1e2530" }}>
                    <div>
                      <div className="text-xs text-gray-600">24h高</div>
                      <div className="text-xs text-green-400 font-mono">{formatPrice(c.highPrice, c.symbol)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">24h低</div>
                      <div className="text-xs text-red-400 font-mono">{formatPrice(c.lowPrice, c.symbol)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">未平仓量</div>
                      <div className="text-xs text-gray-300 font-mono">{formatVolume(c.openInterest)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 资金费率历史图表 */}
          <div className="mx-4 rounded-lg p-4" style={{ backgroundColor: "#111620", border: "1px solid #1e2530" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-widest">Funding Rate History</div>
                <div className="text-xs text-gray-600 mt-0.5">
                  {CONTRACTS.find(c => c.symbol === activeTab)?.name} · 近5天 · 每4小时
                </div>
              </div>
              <div className="flex gap-1">
                {CONTRACTS.map(c => (
                  <button
                    key={c.symbol}
                    onClick={() => setActiveTab(c.symbol)}
                    className="text-xs px-2 py-0.5 rounded transition-colors"
                    style={{
                      backgroundColor: activeTab === c.symbol ? "#2a4a7f" : "#1a2030",
                      color: activeTab === c.symbol ? "#60a5fa" : "#6b7280",
                    }}
                  >
                    {c.shortName}
                  </button>
                ))}
              </div>
            </div>

            <MiniChart data={fundingHistory[activeTab] || []} symbol={activeTab} />

            {/* 历史费率列表 */}
            <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
              {(fundingHistory[activeTab] || []).slice().reverse().map((d, i) => {
                const rate = d.fundingRate * 100;
                const isPos = rate >= 0;
                const t = new Date(d.fundingTime);
                return (
                  <div key={i} className="flex items-center justify-between py-1" style={{ borderBottom: "1px solid #1a2030" }}>
                    <span className="text-xs text-gray-500 font-mono">
                      {t.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })} {t.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`text-xs font-mono font-bold ${isPos ? "text-green-400" : "text-red-400"}`}>
                      {isPos ? "+" : ""}{rate.toFixed(4)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 市场快捷入口 */}
          <div className="mx-4 mt-3 rounded-lg p-4" style={{ backgroundColor: "#111620", border: "1px solid #1e2530" }}>
            <div className="text-xs text-gray-400 uppercase tracking-widest mb-3">Quick Access · Binance</div>
            <div className="grid grid-cols-3 gap-2">
              {CONTRACTS.map(c => (
                <a
                  key={c.symbol}
                  href={c.binanceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 py-3 rounded transition-colors"
                  style={{ backgroundColor: "#1a2030", border: "1px solid #1e2530" }}
                >
                  <ExternalLink className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-gray-300">{c.shortName}</span>
                  <span className="text-xs text-gray-600">{c.symbol}</span>
                </a>
              ))}
            </div>
          </div>

          {/* 底部说明 */}
          <div className="mx-4 mt-3 text-center">
            <div className="text-xs text-gray-700">数据来源：Binance Futures API · 每30秒自动刷新</div>
          </div>
        </div>
      )}
    </div>
  );
}
