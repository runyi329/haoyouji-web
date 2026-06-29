import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

// 折扣档位系数（与AfOrderManage一致）
const EQUITY_DISCOUNT_RATES: Record<number, number> = {
  0: 1.0,
  1: 0.6667,
  2: 0.4444,
  3: 0.3333,
  4: 0.2667,
  5: 0.2222,
  6: 0.1905,
  7: 0.1667,
  8: 0.1481,
  9: 0.1333,
};

const COIN_DECIMALS: Record<string, number> = { SOL: 1, BTC: 4, ETH: 2 };
const fmtQ = (coin: string, num: number) => num.toFixed(COIN_DECIMALS[coin] ?? 4);
const COIN_COLOR: Record<string, string> = {
  ETH: "text-blue-500",
  BTC: "text-orange-500",
  SOL: "text-purple-500",
};

export default function AfProfitForecast() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedCoin, setSelectedCoin] = useState<string>("");
  const [simulPrice, setSimulPrice] = useState<number | null>(null);

  // 拉取谷底增筹订单（与AfOrderManage/AfFeeDetail相同接口）
  const { data: orders, isLoading } = trpc.ledger.afAdminGetOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 拉取实时价格
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const livePrice: Record<string, number> = (cryptoPricesRaw as any)?.prices ?? {};

  // 只取持仓中订单（completed + 未卖出）
  const holdingOrders = useMemo(() => {
    const arr = (orders as any[] | undefined) ?? [];
    return arr.filter((o: any) => o.status === "completed" && o.sellStatus !== "sold");
  }, [orders]);

  // 获取所有持仓币种
  const coins = useMemo(() => {
    const set = new Set<string>();
    holdingOrders.forEach((o: any) => { if (o.coin) set.add(o.coin); });
    return Array.from(set).sort((a, b) => {
      const order = ["ETH", "BTC", "SOL"];
      return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
    });
  }, [holdingOrders]);

  // 初始化默认选中第一个币种
  const activeCoin = selectedCoin || coins[0] || "";

  // 当前币种的持仓订单
  const coinOrders = useMemo(
    () => holdingOrders.filter((o: any) => o.coin === activeCoin),
    [holdingOrders, activeCoin]
  );

  // 按买入价分组
  const priceGroups = useMemo(() => {
    const groups: Record<string, {
      price: number;
      rawQty: number;
      effQty: number;
      orders: any[];
    }> = {};
    coinOrders.forEach((o: any) => {
      const price = parseFloat(o.limitPrice) || 0;
      const key = price.toString();
      if (!groups[key]) groups[key] = { price, rawQty: 0, effQty: 0, orders: [] };
      const qty = parseFloat(o.quantity) || 0;
      let rate: number;
      if (o.tierMode === 'linear') {
        const buyP = parseFloat(o.limitPrice || '0');
        const allLow = o.allTimeLowPrice ? parseFloat(String(o.allTimeLowPrice)) : 0;
        rate = (buyP > 0 && allLow > 0) ? Math.max(0, 1 - (buyP - allLow) / buyP) : 1.0;
      } else {
        rate = EQUITY_DISCOUNT_RATES[o.equityTier || 0] ?? 1.0;
      }
      groups[key].rawQty += qty;
      groups[key].effQty += qty * rate;
      groups[key].orders.push(o);
    });
    return Object.values(groups).sort((a, b) => a.price - b.price);
  }, [coinOrders]);

  // 加权均价（原始数量）
  const avgCost = useMemo(() => {
    let totalQty = 0, totalWeighted = 0;
    priceGroups.forEach(g => { totalQty += g.rawQty; totalWeighted += g.price * g.rawQty; });
    return totalQty > 0 ? totalWeighted / totalQty : 0;
  }, [priceGroups]);

  // 折后加权均价
  const avgCostEff = useMemo(() => {
    let totalEff = 0, totalWeighted = 0;
    priceGroups.forEach(g => { totalEff += g.effQty; totalWeighted += g.price * g.effQty; });
    return totalEff > 0 ? totalWeighted / totalEff : 0;
  }, [priceGroups]);

  const totalEffQty = useMemo(() => priceGroups.reduce((s, g) => s + g.effQty, 0), [priceGroups]);
  const totalRawQty = useMemo(() => priceGroups.reduce((s, g) => s + g.rawQty, 0), [priceGroups]);

  // 累计管理费（仅当前币种持仓中订单）
  const totalMgmtFee = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return coinOrders
      .filter((o: any) => o.side === 'buy' && o.status === 'completed' && o.sellStatus !== 'sold')
      .reduce((sum: number, o: any) => {
        const amount = parseFloat(o.amount || '0');
        const tradeValue = o.isGift ? amount : amount * 5.25;
        const dailyFee = tradeValue / 0.75 * 0.12 / 365;
        const confirmedDate = new Date(o.createdAt);
        const confirmedDay = new Date(confirmedDate.getFullYear(), confirmedDate.getMonth(), confirmedDate.getDate());
        const holdDays = Math.max(1, Math.floor((todayStart.getTime() - confirmedDay.getTime()) / (1000*60*60*24)) + 1);
        return sum + dailyFee * holdDays;
      }, 0);
  }, [coinOrders]);

  // 含管理费均价 = (折后持仓成本 + 累计管理费) / 折后数量
  const avgCostWithFee = useMemo(() => {
    if (totalEffQty <= 0) return 0;
    const effCost = priceGroups.reduce((s, g) => s + g.price * g.effQty, 0);
    return (effCost + totalMgmtFee) / totalEffQty;
  }, [priceGroups, totalEffQty, totalMgmtFee]);

  // 滑动条范围：最低买入价 * 0.5 ~ 最高买入价 * 2
  const minPrice = useMemo(() => priceGroups.length > 0 ? Math.floor(priceGroups[0].price * 0.5) : 0, [priceGroups]);
  const maxPrice = useMemo(() => priceGroups.length > 0 ? Math.ceil(priceGroups[priceGroups.length - 1].price * 2) : 0, [priceGroups]);

  // 当前模拟价格（默认用实时价格，没有则用折后均价）
  const currentSimulPrice = simulPrice ?? (livePrice[activeCoin] || avgCostEff || 0);

  // 按模拟价格计算总盈亏
  const totalPnl = useMemo(() => {
    if (!currentSimulPrice) return 0;
    return priceGroups.reduce((s, g) => s + (currentSimulPrice - g.price) * g.effQty, 0);
  }, [priceGroups, currentSimulPrice]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <p className="text-gray-400 text-sm">加载中...</p>
      </div>
    );
  }

  if (coins.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-100">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/af-order-manage`)} className="p-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-semibold text-gray-800">盈利预测</h1>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">暂无持仓订单</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-100 sticky top-0 z-10">
        <button onClick={() => setLocation(`/ledger/${ledgerId}/af-order-manage`)} className="p-1">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-base font-semibold text-gray-800">盈利预测</h1>
      </div>

      {/* 币种 Tab */}
      <div className="bg-white px-4 pt-2 pb-0 flex gap-1 border-b border-gray-100">
        {coins.map(coin => (
          <button
            key={coin}
            onClick={() => { setSelectedCoin(coin); setSimulPrice(null); }}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              activeCoin === coin
                ? `border-blue-500 ${COIN_COLOR[coin] || "text-blue-600"}`
                : "border-transparent text-gray-400"
            }`}
          >
            {coin}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-48">
        {/* 汇总卡片 */}
        <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
          {/* 标题行 */}
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs text-gray-400">持仓汇总 · {activeCoin}</span>
            {livePrice[activeCoin] && (
              <span className="text-xs text-gray-400">
                实时 <span className="text-gray-700 font-medium">${livePrice[activeCoin].toLocaleString()}</span>
              </span>
            )}
          </div>
          {/* 左右对比表格 */}
          <div className="grid grid-cols-2 gap-x-4 text-xs">
            {/* 表头 */}
            <div className="text-gray-300 font-medium pb-1 border-b border-gray-100">原始（全额）</div>
            <div className={`font-semibold pb-1 border-b border-gray-100 ${COIN_COLOR[activeCoin] || "text-blue-500"}`}>折后（实际）</div>

            {/* 数量 */}
            <div className="pt-2">
              <div className="text-gray-300 text-[10px] mb-0.5">数量</div>
              <div className="font-medium text-gray-400">{fmtQ(activeCoin, totalRawQty)}</div>
            </div>
            <div className="pt-2">
              <div className="text-gray-300 text-[10px] mb-0.5">数量</div>
              <div className={`font-semibold ${COIN_COLOR[activeCoin] || "text-gray-800"}`}>{fmtQ(activeCoin, totalEffQty)}</div>
            </div>

            {/* 均价 */}
            <div className="pt-2">
              <div className="text-gray-300 text-[10px] mb-0.5">均价</div>
              <div className="font-medium text-gray-400">${avgCost.toFixed(2)}</div>
            </div>
            <div className="pt-2">
              <div className="text-gray-300 text-[10px] mb-0.5">均价</div>
              <div className="font-semibold text-gray-700">${avgCostEff.toFixed(2)}</div>
              {avgCostWithFee > 0 && (
                <div className="text-[10px] text-orange-400 mt-0.5">含管理费 ${avgCostWithFee.toFixed(2)}</div>
              )}
            </div>

            {/* 持仓市値 */}
            <div className="pt-2">
              <div className="text-gray-300 text-[10px] mb-0.5">持仓市値</div>
              <div className="font-medium text-gray-400">
                {livePrice[activeCoin] ? `$${(totalRawQty * livePrice[activeCoin]).toFixed(2)}` : "--"}
              </div>
            </div>
            <div className="pt-2">
              <div className="text-gray-300 text-[10px] mb-0.5">持仓市値</div>
              <div className="font-semibold text-gray-700">
                {livePrice[activeCoin] ? `$${(totalEffQty * livePrice[activeCoin]).toFixed(2)}` : "--"}
              </div>
            </div>

            {/* 当前盈亏 */}
            <div className="pt-2">
              <div className="text-gray-300 text-[10px] mb-0.5">当前盈亏</div>
              {livePrice[activeCoin] && avgCost > 0 ? (() => {
                const rawPnl = (livePrice[activeCoin] - avgCost) * totalRawQty;
                const rawPct = (livePrice[activeCoin] - avgCost) / avgCost * 100;
                return (
                  <div className={`font-medium ${rawPnl >= 0 ? "text-red-300" : "text-green-700"}`}>
                    {rawPnl >= 0 ? "+" : ""}{rawPnl.toFixed(2)}
                    <span className="ml-1 text-[10px]">({rawPct >= 0 ? "+" : ""}{rawPct.toFixed(1)}%)</span>
                  </div>
                );
              })() : <div className="text-gray-300">--</div>}
            </div>
            <div className="pt-2">
              <div className="text-gray-300 text-[10px] mb-0.5">当前盈亏</div>
              {livePrice[activeCoin] && avgCostEff > 0 ? (() => {
                const effPnl = (livePrice[activeCoin] - avgCostEff) * totalEffQty;
                const effPct = (livePrice[activeCoin] - avgCostEff) / avgCostEff * 100;
                const feePnl = avgCostWithFee > 0 ? (livePrice[activeCoin] - avgCostWithFee) * totalEffQty : null;
                const feePct = avgCostWithFee > 0 ? (livePrice[activeCoin] - avgCostWithFee) / avgCostWithFee * 100 : null;
                return (
                  <>
                    <div className={`font-semibold ${effPnl >= 0 ? "text-red-500" : "text-green-700"}`}>
                      {effPnl >= 0 ? "+" : ""}{effPnl.toFixed(2)}
                      <span className="ml-1 text-[10px]">({effPct >= 0 ? "+" : ""}{effPct.toFixed(1)}%)</span>
                    </div>
                    {feePnl !== null && (
                      <div className={`text-[10px] mt-0.5 ${feePnl >= 0 ? "text-red-300" : "text-orange-400"}`}>
                        含管理费 {feePnl >= 0 ? "+" : ""}{feePnl.toFixed(2)}
                        <span className="ml-0.5">({feePct! >= 0 ? "+" : ""}{feePct!.toFixed(1)}%)</span>
                      </div>
                    )}
                  </>
                );
              })() : <div className="text-gray-300">--</div>}
            </div>
          </div>
        </div>

        {/* 各价格档位 */}
        {priceGroups.map(g => {
          const key = g.price.toString();
          const isOpen = expandedGroups.has(key);
          const pnl = currentSimulPrice ? (currentSimulPrice - g.price) * g.effQty : 0;
          const pnlColor = pnl >= 0 ? "text-red-500" : "text-green-700";
          const hasDiscount = Math.abs(g.effQty - g.rawQty) > 0.00005;
          const pnlPct = g.price > 0 ? ((currentSimulPrice - g.price) / g.price * 100) : 0;
          return (
            <div key={key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => toggleGroup(key)}
                className="w-full px-4 py-3 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">${g.price.toLocaleString()}</span>
                    <span className="text-xs text-gray-400">{g.orders.length}单</span>
                    {currentSimulPrice > 0 && (
                      <span className={`text-xs ${pnlColor}`}>
                        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {currentSimulPrice > 0 && (
                      <span className={`text-sm font-bold ${pnlColor}`}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}<span className="text-xs font-normal text-gray-400 ml-0.5">u</span>
                      </span>
                    )}
                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-gray-400">
                  <span>原始 <span className="text-gray-600 font-medium">{fmtQ(activeCoin, g.rawQty)}</span></span>
                  {hasDiscount && (
                    <span>折后 <span className={`font-medium ${COIN_COLOR[activeCoin] || "text-gray-700"}`}>{fmtQ(activeCoin, g.effQty)}</span></span>
                  )}
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {g.orders.map((o: any) => {
                    const qty = parseFloat(o.quantity) || 0;
                    let rate: number;
                    if (o.tierMode === 'linear') {
                      const buyP = parseFloat(o.limitPrice || '0');
                      const allLow = o.allTimeLowPrice ? parseFloat(String(o.allTimeLowPrice)) : 0;
                      rate = (buyP > 0 && allLow > 0) ? Math.max(0, 1 - (buyP - allLow) / buyP) : 1.0;
                    } else {
                      rate = EQUITY_DISCOUNT_RATES[o.equityTier || 0] ?? 1.0;
                    }
                    const effQ = qty * rate;
                    const oPnl = currentSimulPrice ? (currentSimulPrice - g.price) * effQ : 0;
                    const oPnlColor = oPnl >= 0 ? "text-red-400" : "text-green-700";
                    const name = o.nickname || o.username || `用户${o.userId}`;
                    const tierLabel = rate < 1.0 ? `${Math.round(rate * 100)}%` : null;
                    return (
                      <div key={o.id} className="flex items-center px-4 py-2 gap-2 text-xs">
                        <span className="text-gray-700 font-medium w-16 truncate">{name}</span>
                        <span className="text-gray-400 flex-1">
                          {fmtQ(activeCoin, qty)}
                          {tierLabel && <span className="text-gray-300 ml-0.5">×{tierLabel}</span>}
                          {rate < 1 && <span className={`ml-1 ${COIN_COLOR[activeCoin] || "text-gray-600"}`}>={fmtQ(activeCoin, effQ)}</span>}
                        </span>
                        {currentSimulPrice > 0 && (
                          <span className={`font-semibold ${oPnlColor}`}>
                            {oPnl >= 0 ? "+" : ""}{oPnl.toFixed(2)}<span className="text-gray-300 ml-0.5">u</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部模拟价格滑动条 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 pt-3 pb-5 shadow-lg">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400">模拟价格</span>
            <span className="text-sm font-bold text-blue-600">
              ${currentSimulPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">总盈亏</span>
            <span className={`text-base font-bold ${totalPnl >= 0 ? "text-red-500" : "text-green-700"}`}>
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
            </span>
            <span className="text-xs text-gray-400">u</span>
          </div>
        </div>
        {/* 滑动条容器，相对定位以叠加盈亏平衡点标记 */}
        <div className="relative">
          <input
            type="range"
            min={minPrice}
            max={maxPrice}
            step={activeCoin === "BTC" ? 100 : activeCoin === "ETH" ? 10 : 1}
            value={currentSimulPrice}
            onChange={e => setSimulPrice(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          {/* 盈亏平衡点标记（折后均价位置） */}
          {avgCostEff > 0 && maxPrice > minPrice && avgCostEff >= minPrice && avgCostEff <= maxPrice && (() => {
            const pct = (avgCostEff - minPrice) / (maxPrice - minPrice) * 100;
            return (
              <div
                className="absolute top-0 flex flex-col items-center pointer-events-none"
                style={{ left: `calc(${pct}% - 1px)`, top: '-2px' }}
              >
                {/* 小三角标记 */}
                <div className="w-0 h-0" style={{
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '6px solid #9ca3af',
                }} />
              </div>
            );
          })()}
        </div>
        {/* 盈亏平衡点标注 + 两端标签 */}
        <div className="relative mt-1" style={{ height: '16px' }}>
          <span className="absolute left-0 text-xs text-gray-300">${minPrice.toLocaleString()}</span>
          <span className="absolute right-0 text-xs text-gray-300">${maxPrice.toLocaleString()}</span>
          {avgCostEff > 0 && maxPrice > minPrice && avgCostEff >= minPrice && avgCostEff <= maxPrice && (() => {
            const pct = (avgCostEff - minPrice) / (maxPrice - minPrice) * 100;
            const isLeft = pct < 30;
            const isRight = pct > 70;
            return (
              <span
                className="absolute text-[10px] text-gray-400 whitespace-nowrap"
                style={{
                  left: isRight ? 'auto' : isLeft ? `calc(${pct}%)` : `calc(${pct}% - 20px)`,
                  right: isRight ? `calc(${100 - pct}%)` : 'auto',
                  top: 0,
                }}
              >
                ▲平衡 ${avgCostEff.toFixed(0)}
              </span>
            );
          })()}
        </div>
        <div className="flex justify-center mt-1">
          <button
            onClick={() => setSimulPrice(livePrice[activeCoin] ? livePrice[activeCoin] : null)}
            className="text-xs text-blue-400 px-2"
          >
            重置实时价
          </button>
        </div>
      </div>
    </div>
  );
}
