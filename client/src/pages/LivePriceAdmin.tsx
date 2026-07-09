/**
 * LivePriceAdmin.tsx — 实时价格管理页面
 *
 * 架构：全部走服务器 tRPC（服务器在香港，可直连 Gate.io/火币/OKX）
 * 前端不直连任何外部 API，国内网络完全正常
 * 自定义币种存数据库，所有设备全局生效
 */

import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, RefreshCw, Search, Plus, Trash2, CheckCircle2, XCircle, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// 内置币种列表（与 price-scanner.ts 保持一致）
const BUILTIN_COINS = [
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { symbol: 'SOL', name: 'Solana', type: 'crypto' },
  { symbol: 'AAVE', name: 'Aave', type: 'crypto' },
  { symbol: 'SUI', name: 'Sui', type: 'crypto' },
  { symbol: 'ONDO', name: 'Ondo Finance', type: 'crypto' },
  { symbol: 'ASTER', name: 'Aster', type: 'crypto' },
  { symbol: 'LDO', name: 'Lido DAO', type: 'crypto' },
  { symbol: 'ENA', name: 'Ethena', type: 'crypto' },
  { symbol: 'ARKM', name: 'Arkham', type: 'crypto' },
  { symbol: 'SEI', name: 'Sei', type: 'crypto' },
  { symbol: 'PLUME', name: 'Plume', type: 'crypto' },
  { symbol: 'TSLA', name: 'Tesla', type: 'stock' },
  { symbol: 'NVDA', name: 'NVIDIA', type: 'stock' },
  { symbol: 'AAPL', name: 'Apple', type: 'stock' },
  { symbol: 'MSFT', name: 'Microsoft', type: 'stock' },
  { symbol: 'GOOGL', name: 'Alphabet', type: 'stock' },
  { symbol: 'META', name: 'Meta', type: 'stock' },
  { symbol: 'AMZN', name: 'Amazon', type: 'stock' },
  { symbol: 'MSTR', name: 'MicroStrategy', type: 'stock' },
  { symbol: 'CRCL', name: 'Circle', type: 'stock' },
];

export default function LivePriceAdmin() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const ledgerId = params?.id ? parseInt(params.id) : 52;

  const [querySymbol, setQuerySymbol] = useState('');
  const [queryResult, setQueryResult] = useState<{ price: number; source: string; supported: boolean; symbol: string } | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 从服务器拉取全量实时价格（price-scanner 内存缓存，每3秒更新）
  const { data: priceData, refetch: refetchPrices, isFetching } = trpc.getCryptoPrices.useQuery(undefined, {
    staleTime: 3000,
    refetchInterval: 10000,
  });

  // 自定义币种列表（数据库）
  const { data: customCoins = [], refetch: refetchCustom } = trpc.cryptoData.getCustomCoins.useQuery(undefined, {
    staleTime: 30000,
  });

  // 测试新币种（服务器端，服务器在香港可直连）
  const testMutation = trpc.cryptoData.testCoinPrice.useMutation();

  // 添加自定义币种
  const addMutation = trpc.cryptoData.addCustomCoin.useMutation({
    onSuccess: () => { refetchCustom(); },
  });

  // 删除自定义币种
  const deleteMutation = trpc.cryptoData.deleteCustomCoin.useMutation({
    onSuccess: () => { refetchCustom(); },
  });

  const prices = priceData?.prices ?? {};
  const changes = priceData?.changes ?? {};

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await refetchPrices();
    setIsRefreshing(false);
  };

  const handleQuery = async () => {
    const sym = querySymbol.trim().toUpperCase();
    if (!sym) return;
    setIsQuerying(true);
    setQueryResult(null);
    try {
      const result = await testMutation.mutateAsync({ symbol: sym });
      setQueryResult({ ...result, symbol: sym });
    } catch {
      setQueryResult({ price: 0, source: 'error', supported: false, symbol: sym });
    }
    setIsQuerying(false);
  };

  const handleAdd = async () => {
    if (!queryResult?.supported || !queryResult.symbol) return;
    try {
      await addMutation.mutateAsync({
        symbol: queryResult.symbol,
        binance: `${queryResult.symbol}USDT`,
        okx: `${queryResult.symbol}-USDT`,
      });
      toast.success(`${queryResult.symbol} 已添加，全局所有设备立即生效`);
      setQueryResult(null);
      setQuerySymbol('');
    } catch (e: any) {
      toast.error(e?.message || '添加失败');
    }
  };

  const formatPrice = (p: number | undefined) => {
    if (!p) return null;
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(6);
  };

  const allCoins = [
    ...BUILTIN_COINS,
    ...customCoins.map((c: any) => ({ symbol: c.symbol, name: `自定义`, type: 'custom' })),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-base font-semibold text-gray-900 flex-1">实时价格管理</h1>
        <button
          onClick={handleRefreshAll}
          disabled={isRefreshing || isFetching}
          className="flex items-center gap-1.5 text-[13px] text-blue-600 font-medium"
        >
          <RefreshCw size={14} className={isRefreshing || isFetching ? 'animate-spin' : ''} />
          刷新全部
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* 查询新币种 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Search size={15} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-900">查询新币种</span>
          </div>
          <p className="text-[12px] text-gray-400 mb-3">查询由服务器（香港）执行，不受国内网络限制</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={querySymbol}
              onChange={e => { setQuerySymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setQueryResult(null); }}
              onKeyDown={e => e.key === 'Enter' && handleQuery()}
              placeholder="输入代码，如 PEPE"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] font-mono outline-none focus:border-blue-400"
            />
            <button
              onClick={handleQuery}
              disabled={isQuerying || !querySymbol.trim()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-semibold disabled:opacity-40 shrink-0 flex items-center gap-1.5"
            >
              {isQuerying && <Loader2 size={13} className="animate-spin" />}
              {isQuerying ? '查询中' : '查询'}
            </button>
          </div>

          {/* 查询结果 */}
          {queryResult && (
            <div className={`mt-3 rounded-xl p-3 ${queryResult.supported ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {queryResult.supported
                    ? <CheckCircle2 size={15} className="text-green-500" />
                    : <XCircle size={15} className="text-red-500" />
                  }
                  <span className="text-[14px] font-semibold text-gray-900">{queryResult.symbol}</span>
                  {queryResult.supported && (
                    <span className="text-[12px] text-gray-400">via {queryResult.source}</span>
                  )}
                </div>
                {queryResult.supported && (
                  <span className="text-[15px] font-bold text-gray-900">${formatPrice(queryResult.price)}</span>
                )}
              </div>
              {queryResult.supported ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={handleAdd}
                    disabled={addMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[13px] font-medium"
                  >
                    <Plus size={13} />
                    {addMutation.isPending ? '添加中...' : '添加到列表'}
                  </button>
                  <span className="text-[11px] text-gray-400">添加后所有设备立即生效</span>
                </div>
              ) : (
                <p className="mt-1.5 text-[12px] text-red-600">
                  Gate.io / 火币 / OKX 均未找到该币种，请确认代码是否正确
                </p>
              )}
            </div>
          )}
        </div>

        {/* 已配置币种列表 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">已配置币种</span>
            <span className="ml-2 text-[12px] text-gray-400">
              内置 {BUILTIN_COINS.length} 个{customCoins.length > 0 ? ` + 自定义 ${customCoins.length} 个` : ''}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {allCoins.map(coin => {
              const price = prices[coin.symbol];
              const change = changes[coin.symbol];
              const isCustom = coin.type === 'custom';
              const isStock = coin.type === 'stock';
              return (
                <div key={coin.symbol} className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                    isStock ? 'bg-purple-100 text-purple-700' :
                    isCustom ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {coin.symbol.slice(0, 4)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-semibold text-gray-900">{coin.symbol}</span>
                      {isCustom && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">自定义</span>}
                      {isStock && <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">股票</span>}
                    </div>
                    <span className="text-[12px] text-gray-400">{coin.name}</span>
                  </div>
                  <div className="text-right">
                    {price ? (
                      <>
                        <div className="text-[14px] font-semibold text-gray-900">${formatPrice(price)}</div>
                        {change !== undefined && (
                          <div className={`text-[12px] font-medium ${change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-[12px] text-gray-300">加载中</span>
                    )}
                  </div>
                  {isCustom && (
                    <button
                      onClick={() => {
                        if (window.confirm(`确认删除 ${coin.symbol}？`)) {
                          deleteMutation.mutate({ symbol: coin.symbol });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 数据源说明 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Info size={15} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-900">数据源架构说明</span>
          </div>
          <div className="space-y-3 text-[13px] text-gray-600 leading-relaxed">
            <div>
              <p className="font-semibold text-gray-800 mb-1">通道一：数字币（加密货币）</p>
              <p>服务器（腾讯云香港）每 3 秒拉取，三重兜底：</p>
              <p className="font-mono text-[12px] bg-gray-50 rounded-lg px-3 py-2 mt-1">Gate.io → 火币 → OKX</p>
              <p className="mt-1 text-[12px] text-red-500 font-medium">⚠️ 前端直连在国内网络下不可用，必须走服务器中转</p>
            </div>
            <div>
              <p className="font-semibold text-gray-800 mb-1">通道二：美股 / 港股 / 黄金 / 石油</p>
              <p className="font-mono text-[12px] bg-gray-50 rounded-lg px-3 py-2">OKX SWAP → 新浪财经 / Yahoo Finance → 新浪财经</p>
            </div>
            <div>
              <p className="font-semibold text-gray-800 mb-1">架构铁律</p>
              <p>价格数据在父组件顶层统一拉取一次，通过 <span className="font-mono bg-gray-100 px-1 rounded text-[11px]">livePrices</span> props 传给所有卡片。无论账本里有多少张订单，对外永远只有 1 个请求。严禁在每个卡片实例里独立调用价格 hook。</p>
            </div>
            <div>
              <p className="font-semibold text-gray-800 mb-1">自定义币种</p>
              <p>存储在数据库，所有设备全局生效。添加后下次部署时 price-scanner 会自动包含该币种。</p>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-300 pb-4">实时价格管理 · 仅账本管理员可见</p>
      </div>
    </div>
  );
}
