import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, RefreshCw, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";

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

const CONTRACTS = [
  { symbol: "CLUSDT", name: "WTI原油", shortName: "WTI", unit: "USD/桶", binanceUrl: "https://www.binance.com/zh-CN/futures/CLUSDT", color: "#60a5fa" },
  { symbol: "BZUSDT", name: "布伦特原油", shortName: "BRENT", unit: "USD/桶", binanceUrl: "https://www.binance.com/zh-CN/futures/BZUSDT", color: "#fb923c" },
  { symbol: "NATGASUSDT", name: "天然气", shortName: "NATGAS", unit: "USD/MMBtu", binanceUrl: "https://www.binance.com/zh-CN/futures/NATGASUSDT", color: "#4ade80" },
];

function formatPrice(price: number, symbol: string) {
  if (symbol === "NATGASUSDT") return price.toFixed(3);
  return price.toFixed(2);
}

function Countdown({ nextFundingTime }: { nextFundingTime: number }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = nextFundingTime - Date.now();
      if (diff <= 0) { setRemaining("00:00"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 0) setRemaining(`${h}h${String(m).padStart(2, "0")}m`);
      else setRemaining(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [nextFundingTime]);
  return <span className="font-mono text-amber-400 text-[10px]">{remaining}</span>;
}

// 三合约合并折线图（SVG）
function CombinedFundingChart({ grouped }: { grouped: Record<string, any[]> }) {
  const W = 320;
  const H = 130;
  // 右边留足够空间避免最后一个X轴标签被裁切
  const PAD = { top: 12, bottom: 22, left: 40, right: 28 };

  const allTimes = useMemo(() => {
    const set = new Set<number>();
    for (const sym of Object.keys(grouped)) {
      for (const row of grouped[sym]) set.add(Number(row.funding_time));
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [grouped]);

  if (allTimes.length < 2) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-600 text-xs">
        暂无数据
      </div>
    );
  }

  const seriesMap: Record<string, Map<number, number>> = {};
  for (const sym of Object.keys(grouped)) {
    seriesMap[sym] = new Map();
    for (const row of grouped[sym]) {
      seriesMap[sym].set(Number(row.funding_time), parseFloat(row.funding_rate) * 100);
    }
  }

  let globalMin = 0;
  let globalMax = 0;
  for (const sym of Object.keys(seriesMap)) {
    for (const v of seriesMap[sym].values()) {
      if (v < globalMin) globalMin = v;
      if (v > globalMax) globalMax = v;
    }
  }
  const pad = Math.max(Math.abs(globalMax - globalMin) * 0.15, 0.002);
  globalMin -= pad;
  globalMax += pad;
  const range = globalMax - globalMin;

  const toX = (i: number) => PAD.left + (i / Math.max(allTimes.length - 1, 1)) * (W - PAD.left - PAD.right);
  const toY = (v: number) => PAD.top + ((globalMax - v) / range) * (H - PAD.top - PAD.bottom);
  const zeroY = toY(0);

  // 生成每条线的 points，同时找峰谷
  const lines = CONTRACTS.map(c => {
    const map = seriesMap[c.symbol];
    if (!map) return null;
    const validTimes = allTimes.filter(t => map.has(t));
    const pts = validTimes
      .map(t => `${toX(allTimes.indexOf(t))},${toY(map.get(t)!)}`)
      .join(" ");

    // 找峰谷（局部极值）
    const peakLabels: { x: number; y: number; val: number; isMax: boolean }[] = [];
    const vals = validTimes.map(t => ({ t, v: map.get(t)! }));
    // 全局最大值和最小值
    let maxV = -Infinity, minV = Infinity;
    let maxIdx = -1, minIdx = -1;
    vals.forEach((item, i) => {
      if (item.v > maxV) { maxV = item.v; maxIdx = i; }
      if (item.v < minV) { minV = item.v; minIdx = i; }
    });
    if (maxIdx >= 0) {
      const t = vals[maxIdx].t;
      peakLabels.push({ x: toX(allTimes.indexOf(t)), y: toY(maxV), val: maxV, isMax: true });
    }
    if (minIdx >= 0 && minIdx !== maxIdx) {
      const t = vals[minIdx].t;
      peakLabels.push({ x: toX(allTimes.indexOf(t)), y: toY(minV), val: minV, isMax: false });
    }

    return { ...c, pts, peakLabels };
  }).filter(Boolean);

  // X轴标签：均匀分布，最多5个，确保首尾都显示
  const maxLabels = Math.min(5, allTimes.length);
  const labelIdxs: number[] = [];
  for (let i = 0; i < maxLabels; i++) {
    labelIdxs.push(Math.round(i * (allTimes.length - 1) / (maxLabels - 1)));
  }
  const labels = [...new Set(labelIdxs)].map(i => {
    const d = new Date(allTimes[i]);
    return {
      x: toX(i),
      label: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`,
      isLast: i === allTimes.length - 1,
    };
  });

  // Y轴刻度
  const yTicks = [
    { v: globalMax - pad * 0.5, label: `${(globalMax - pad * 0.5).toFixed(3)}%` },
    { v: 0, label: "0" },
    { v: globalMin + pad * 0.5, label: `${(globalMin + pad * 0.5).toFixed(3)}%` },
  ];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", overflow: "visible" }}>
      {/* 背景正区域 */}
      <rect
        x={PAD.left} y={PAD.top}
        width={W - PAD.left - PAD.right}
        height={Math.max(0, zeroY - PAD.top)}
        fill="rgba(34,197,94,0.04)"
      />
      {/* 背景负区域 */}
      <rect
        x={PAD.left} y={zeroY}
        width={W - PAD.left - PAD.right}
        height={Math.max(0, H - PAD.bottom - zeroY)}
        fill="rgba(239,68,68,0.04)"
      />

      {/* 零轴 */}
      <line
        x1={PAD.left} y1={zeroY}
        x2={W - PAD.right} y2={zeroY}
        stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" strokeDasharray="3,3"
      />

      {/* Y轴刻度文字 */}
      {yTicks.map((t, i) => (
        <text
          key={i}
          x={PAD.left - 3} y={toY(t.v) + 3}
          textAnchor="end"
          fontSize="6"
          fill={t.v === 0 ? "rgba(255,255,255,0.4)" : t.v > 0 ? "#4ade80" : "#f87171"}
        >
          {t.label}
        </text>
      ))}

      {/* X轴时间标签 */}
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.isLast ? l.x - 2 : l.x}
          y={H - 5}
          textAnchor={l.isLast ? "end" : i === 0 ? "start" : "middle"}
          fontSize="6"
          fill="rgba(255,255,255,0.35)"
        >
          {l.label}
        </text>
      ))}

      {/* 三条折线 */}
      {lines.map(l => l && (
        <polyline
          key={l.symbol}
          points={l.pts}
          fill="none"
          stroke={l.color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* 最新值端点 */}
      {lines.map(l => {
        if (!l) return null;
        const map = seriesMap[l.symbol];
        const lastTime = allTimes.filter(t => map.has(t)).slice(-1)[0];
        if (!lastTime) return null;
        const lastVal = map.get(lastTime)!;
        const cx = toX(allTimes.indexOf(lastTime));
        const cy = toY(lastVal);
        return (
          <circle key={l.symbol + "_dot"} cx={cx} cy={cy} r="2.5" fill={l.color} />
        );
      })}

      {/* 峰谷标注（每条线的全局最高/最低点） */}
      {lines.map(l => {
        if (!l) return null;
        return l.peakLabels.map((pk, pi) => {
          const labelY = pk.isMax ? pk.y - 4 : pk.y + 9;
          const labelText = (pk.val >= 0 ? "+" : "") + pk.val.toFixed(3) + "%";
          return (
            <text
              key={l.symbol + "_pk_" + pi}
              x={pk.x}
              y={labelY}
              textAnchor="middle"
              fontSize="5.5"
              fontWeight="bold"
              fill={l.color}
              style={{ opacity: 0.85 }}
            >
              {labelText}
            </text>
          );
        });
      })}
    </svg>
  );
}

export default function OilBusinessPage() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const ledgerId = params.id;
  const [activeTab, setActiveTab] = useState<string>("CLUSDT");

  // 行情数据
  const { data: marketRows, isLoading: marketLoading, error: marketError, refetch: refetchMarket } = trpc.energy.getMarketData.useQuery(undefined, {
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // 三合约合并资金费率历史
  const { data: allFunding } = trpc.energy.getAllFundingHistory.useQuery({ limit: 35 }, { staleTime: 120000 });

  const contracts: ContractData[] = (marketRows || []).map((row: any) => {
    const info = CONTRACTS.find(c => c.symbol === row.symbol)!;
    return {
      symbol: row.symbol,
      name: info?.name || row.symbol_name,
      unit: info?.unit || "USD",
      markPrice: parseFloat(row.mark_price) || parseFloat(row.last_price) || 0,
      lastFundingRate: parseFloat(row.funding_rate) || 0,
      nextFundingTime: Number(row.next_funding_time) || 0,
      priceChangePercent: parseFloat(row.price_change_percent) || 0,
      highPrice: parseFloat(row.high_price) || 0,
      lowPrice: parseFloat(row.low_price) || 0,
      volume: parseFloat(row.volume) || 0,
      openInterest: parseFloat(row.open_interest) || 0,
    };
  });

  const loading = marketLoading;
  const error = marketError ? "数据加载失败：" + marketError.message : null;
  const lastUpdated = marketRows && marketRows.length > 0 ? new Date((marketRows[0] as any).updated_at) : null;

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
          <button onClick={refetchMarket} className="text-gray-400 hover:text-white transition-colors">
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
        <div className="p-3">
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 rounded animate-pulse" style={{ backgroundColor: "#141920" }} />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="p-6 text-center">
          <div className="text-red-400 text-sm mb-3">{error}</div>
          <button onClick={refetchMarket} className="text-xs text-blue-400 border border-blue-800 px-3 py-1.5 rounded">
            重试
          </button>
        </div>
      ) : (
        <div className="pb-8">
          {/* 三大合约横向卡片 */}
          <div className="px-2 pt-3 pb-2">
            <div className="grid grid-cols-3 gap-1.5">
              {contracts.map((c) => {
                const info = CONTRACTS.find(x => x.symbol === c.symbol)!;
                const isActive = activeTab === c.symbol;
                return (
                  <div
                    key={c.symbol}
                    className="rounded-lg cursor-pointer transition-all"
                    style={{
                      backgroundColor: isActive ? "#141f2e" : "#111620",
                      border: `1px solid ${isActive ? "#2a4a7f" : "#1e2530"}`,
                      padding: "8px 6px",
                    }}
                    onClick={() => setActiveTab(c.symbol)}
                  >
                    {/* 标题行：居中 */}
                    <div className="flex items-center justify-center gap-1 mb-2 flex-wrap">
                      <span
                        className="text-[10px] font-bold tracking-wider px-1 py-0.5 rounded leading-none shrink-0"
                        style={{ backgroundColor: "#1e2d40", color: info.color }}
                      >
                        {info.shortName}
                      </span>
                      <span className="text-[10px] text-gray-400 leading-none truncate">{c.name}</span>
                    </div>

                    {/* 价格（大字，居中，Nunito字体） */}
                    <div className="flex justify-center mb-2">
                      <div
                        className="text-center leading-none"
                        style={{
                          fontFamily: "'Nunito', sans-serif",
                          fontWeight: 900,
                          color: "#f0f6ff",
                          fontSize: "clamp(15px, 5.5vw, 24px)",
                          width: "70%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatPrice(c.markPrice, c.symbol)}
                      </div>
                    </div>

                    {/* 24h高低左右并排，居中 */}
                    <div className="flex justify-center gap-2">
                      <div className="text-center">
                        <div className="text-[9px] text-gray-600 leading-none mb-0.5">24h高</div>
                        <div className="text-[10px] font-mono text-green-400 leading-tight">{formatPrice(c.highPrice, c.symbol)}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[9px] text-gray-600 leading-none mb-0.5">24h低</div>
                        <div className="text-[10px] font-mono text-red-400 leading-tight">{formatPrice(c.lowPrice, c.symbol)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 资金费率合并折线图 */}
          <div className="mx-2 rounded-lg p-3" style={{ backgroundColor: "#111620", border: "1px solid #1e2530" }}>
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="text-xs text-gray-400 font-semibold">资金费率走势</div>
                  <button
                    onClick={() => setLocation(`/ledger/${ledgerId}/oil/funding-history`)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
                    title="查看历史明细"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </button>
                </div>
              </div>
              {/* 图例 */}
              <div className="flex gap-2">
                {CONTRACTS.map(c => (
                  <div key={c.symbol} className="flex items-center gap-0.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-[9px]" style={{ color: c.color }}>{c.shortName}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 正负说明 */}
            <div className="flex gap-3 mb-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-1 rounded" style={{ backgroundColor: "rgba(34,197,94,0.3)" }} />
                <span className="text-[9px] text-green-600">多头付费（正费率）</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-1 rounded" style={{ backgroundColor: "rgba(239,68,68,0.3)" }} />
                <span className="text-[9px] text-red-600">空头付费（负费率）</span>
              </div>
            </div>

            {/* 折线图 */}
            <div style={{ width: "100%", height: 130, overflow: "visible" }}>
              {allFunding ? (
                <CombinedFundingChart grouped={allFunding as Record<string, any[]>} />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-600 text-xs">加载中...</div>
              )}
            </div>

            {/* 当前费率一览（只显示3个，不重复） */}
            <div className="mt-2 grid grid-cols-3 gap-1">
              {CONTRACTS.map(c => {
                const contract = contracts.find(x => x.symbol === c.symbol);
                if (!contract) return null;
                const rate = contract.lastFundingRate * 100;
                const isPos = rate >= 0;
                return (
                  <div key={c.symbol} className="text-center py-1 rounded" style={{ backgroundColor: "#0d1117" }}>
                    <div className="text-[9px] mb-0.5" style={{ color: c.color }}>{c.shortName}</div>
                    <div className={`text-[11px] font-bold font-mono ${isPos ? "text-green-400" : "text-red-400"}`}>
                      {isPos ? "+" : ""}{rate.toFixed(4)}%
                    </div>
                    <div className="text-[9px] text-gray-600">
                      <Countdown nextFundingTime={contract.nextFundingTime} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 快速跳转 */}
          <div className="mx-2 mt-3 rounded-lg p-4" style={{ backgroundColor: "#111620", border: "1px solid #1e2530" }}>
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

          <div className="mx-2 mt-3 text-center">
            <div className="text-xs text-gray-700">数据来源：Binance Futures · 每4小时同步</div>
          </div>
        </div>
      )}
    </div>
  );
}
