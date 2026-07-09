/**
 * LivePriceAdmin.tsx — 实时价格管理页面
 *
 * 功能：
 * 1. 展示当前所有已配置的数字币（含实时价格、数据源、涨跌幅）
 * 2. 查询新币种：输入代码 → 自动试三个数据源 → 查到了一键添加
 * 3. 添加后存入数据库，全局所有设备立即生效
 * 4. 展示数据源规则说明
 *
 * 架构铁律：本页面仅管理配置，不做全局价格轮询
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Search, Info, Zap, Globe, Shield } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ===== 内置币种（与 useLivePrice.ts 保持同步）=====
const BUILTIN_COINS = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'BNB', name: 'BNB' },
  { symbol: 'AAVE', name: 'Aave' },
  { symbol: 'SUI', name: 'Sui' },
  { symbol: 'ONDO', name: 'Ondo Finance' },
  { symbol: 'LDO', name: 'Lido DAO' },
  { symbol: 'ENA', name: 'Ethena' },
  { symbol: 'ARKM', name: 'Arkham' },
  { symbol: 'SEI', name: 'Sei Network' },
  { symbol: 'PLUME', name: 'Plume' },
  { symbol: 'ASTER', name: 'Aster' },
  { symbol: 'DRAM', name: 'DRAM' },
  { symbol: 'MU', name: 'MU' },
  { symbol: 'USDT', name: 'USDT/USDC' },
];

interface PriceResult {
  price: number;
  changePercent: number;
  source: 'binance' | 'okx' | 'coingecko' | 'none';
  error?: string;
}

// ===== 价格测试（三重兜底）=====
async function testCoinPrice(symbol: string): Promise<PriceResult & { binance: string; okx: string; coingecko: string }> {
  const upper = symbol.toUpperCase();
  const binanceSymbol = `${upper}USDT`;
  const okxSymbol = `${upper}-USDT`;

  // 尝试币安
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const d = await res.json();
      const price = parseFloat(d.lastPrice) || 0;
      const changePercent = parseFloat(d.priceChangePercent) || 0;
      if (price > 0) return { price, changePercent, source: 'binance', binance: binanceSymbol, okx: okxSymbol, coingecko: '' };
    }
  } catch { /* 继续 */ }

  // 尝试 OKX
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${okxSymbol}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const d = await res.json();
      const ticker = d?.data?.[0];
      if (ticker) {
        const price = parseFloat(ticker.last) || 0;
        const open = parseFloat(ticker.open24h) || 0;
        const changePercent = open > 0 ? ((price - open) / open * 100) : 0;
        if (price > 0) return { price, changePercent, source: 'okx', binance: binanceSymbol, okx: okxSymbol, coingecko: '' };
      }
    }
  } catch { /* 继续 */ }

  // 尝试 CoinGecko（用 search 接口找 id）
  try {
    const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${upper}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const coin = searchData?.coins?.[0];
      if (coin?.id) {
        const priceRes = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coin.id}&vs_currencies=usd&include_24hr_change=true`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          const price = priceData?.[coin.id]?.usd || 0;
          const changePercent = priceData?.[coin.id]?.usd_24h_change || 0;
          if (price > 0) return { price, changePercent, source: 'coingecko', binance: binanceSymbol, okx: okxSymbol, coingecko: coin.id };
        }
      }
    }
  } catch { /* 继续 */ }

  return { price: 0, changePercent: 0, source: 'none', binance: binanceSymbol, okx: okxSymbol, coingecko: '', error: '三个数据源均无法获取价格，请确认代码是否正确' };
}

// ===== 获取单个已知币种价格 =====
async function fetchKnownCoinPrice(binance: string, okx: string, coingecko: string): Promise<PriceResult> {
  if (binance) {
    try {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binance}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const d = await res.json();
        const price = parseFloat(d.lastPrice) || 0;
        if (price > 0) return { price, changePercent: parseFloat(d.priceChangePercent) || 0, source: 'binance' };
      }
    } catch { /* 继续 */ }
  }
  if (okx) {
    try {
      const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${okx}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const d = await res.json();
        const ticker = d?.data?.[0];
        if (ticker) {
          const price = parseFloat(ticker.last) || 0;
          const open = parseFloat(ticker.open24h) || 0;
          if (price > 0) return { price, changePercent: open > 0 ? ((price - open) / open * 100) : 0, source: 'okx' };
        }
      }
    } catch { /* 继续 */ }
  }
  if (coingecko) {
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coingecko}&vs_currencies=usd&include_24hr_change=true`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const d = await res.json();
        const price = d?.[coingecko]?.usd || 0;
        if (price > 0) return { price, changePercent: d?.[coingecko]?.usd_24h_change || 0, source: 'coingecko' };
      }
    } catch { /* 继续 */ }
  }
  return { price: 0, changePercent: 0, source: 'none' };
}

// ===== 内置币种的数据源映射 =====
const BUILTIN_SOURCES: Record<string, { binance: string; okx: string; coingecko: string }> = {
  BTC: { binance: 'BTCUSDT', okx: 'BTC-USDT', coingecko: 'bitcoin' },
  ETH: { binance: 'ETHUSDT', okx: 'ETH-USDT', coingecko: 'ethereum' },
  SOL: { binance: 'SOLUSDT', okx: 'SOL-USDT', coingecko: 'solana' },
  BNB: { binance: 'BNBUSDT', okx: 'BNB-USDT', coingecko: 'binancecoin' },
  AAVE: { binance: 'AAVEUSDT', okx: 'AAVE-USDT', coingecko: 'aave' },
  SUI: { binance: 'SUIUSDT', okx: 'SUI-USDT', coingecko: 'sui' },
  ONDO: { binance: 'ONDOUSDT', okx: 'ONDO-USDT', coingecko: 'ondo-finance' },
  LDO: { binance: 'LDOUSDT', okx: 'LDO-USDT', coingecko: 'lido-dao' },
  ENA: { binance: 'ENAUSDT', okx: 'ENA-USDT', coingecko: 'ethena' },
  ARKM: { binance: 'ARKMUSDT', okx: 'ARKM-USDT', coingecko: 'arkham' },
  SEI: { binance: 'SEIUSDT', okx: 'SEI-USDT', coingecko: 'sei-network' },
  PLUME: { binance: 'PLUMEUSDT', okx: 'PLUME-USDT', coingecko: '' },
  ASTER: { binance: 'ASTERUSDT', okx: 'ASTER-USDT', coingecko: '' },
  DRAM: { binance: 'DRAMUSDT', okx: 'DRAM-USDT', coingecko: '' },
  MU: { binance: 'MUUSDT', okx: 'MU-USDT', coingecko: '' },
  USDT: { binance: 'USDCUSDT', okx: '', coingecko: '' },
};

const sourceColor = (source?: string) => {
  if (source === 'binance') return '#F0B90B';
  if (source === 'okx') return '#1A56DB';
  if (source === 'coingecko') return '#8DC63F';
  return '#9CA3AF';
};
const sourceLabel = (source?: string) => {
  if (source === 'binance') return '币安';
  if (source === 'okx') return 'OKX';
  if (source === 'coingecko') return 'CoinGecko';
  return '—';
};

// ===== 主组件 =====
export default function LivePriceAdmin() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const ledgerId = params?.id ? parseInt(params.id) : 52;

  const [priceCache, setPriceCache] = useState<Record<string, PriceResult & { loading?: boolean }>>({});

  // 查询区
  const [querySymbol, setQuerySymbol] = useState('');
  const [querying, setQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<(PriceResult & { binance: string; okx: string; coingecko: string }) | null>(null);

  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ===== tRPC 接口 =====
  const { data: customCoins = [], refetch: refetchCustomCoins } = trpc.cryptoData.getCustomCoins.useQuery(undefined, {
    staleTime: 30000,
  });

  const addCustomCoinMutation = trpc.cryptoData.addCustomCoin.useMutation({
    onSuccess: () => {
      refetchCustomCoins();
    },
  });

  const deleteCustomCoinMutation = trpc.cryptoData.deleteCustomCoin.useMutation({
    onSuccess: () => {
      refetchCustomCoins();
    },
  });

  // 刷新单个币种价格
  const refreshPrice = useCallback(async (symbol: string) => {
    const src = BUILTIN_SOURCES[symbol];
    const custom = customCoins.find((c: any) => c.symbol === symbol);
    const binance = src?.binance || custom?.binance || `${symbol}USDT`;
    const okx = src?.okx || custom?.okx || `${symbol}-USDT`;
    const coingecko = src?.coingecko || custom?.coingecko || '';
    setPriceCache(prev => ({ ...prev, [symbol]: { ...prev[symbol], loading: true, price: prev[symbol]?.price || 0, changePercent: prev[symbol]?.changePercent || 0, source: prev[symbol]?.source || 'none' } }));
    const result = await fetchKnownCoinPrice(binance, okx, coingecko);
    setPriceCache(prev => ({ ...prev, [symbol]: { ...result, loading: false } }));
  }, [customCoins]);

  // 刷新所有
  const refreshAll = useCallback(async () => {
    const allSymbols = [...BUILTIN_COINS.map(c => c.symbol), ...customCoins.map((c: any) => c.symbol)];
    await Promise.all(allSymbols.map(s => refreshPrice(s)));
  }, [customCoins, refreshPrice]);

  useEffect(() => {
    refreshAll();
  }, [customCoins.length]);

  // 查询新币种
  const handleQuery = async () => {
    const sym = querySymbol.trim().toUpperCase();
    if (!sym) { toast.error('请输入币种代码'); return; }
    setQuerying(true);
    setQueryResult(null);
    const result = await testCoinPrice(sym);
    setQueryResult(result);
    setQuerying(false);
  };

  // 一键添加（存数据库）
  const handleAdd = async () => {
    if (!queryResult || queryResult.source === 'none') return;
    const sym = querySymbol.trim().toUpperCase();
    const existsBuiltin = BUILTIN_COINS.find(c => c.symbol === sym);
    const existsCustom = customCoins.find((c: any) => c.symbol === sym);
    if (existsBuiltin || existsCustom) { toast.error(`${sym} 已存在`); return; }
    try {
      await addCustomCoinMutation.mutateAsync({
        symbol: sym,
        binance: queryResult.binance || undefined,
        okx: queryResult.okx || undefined,
        coingecko: queryResult.coingecko || undefined,
      });
      toast.success(`${sym} 已添加，全局所有设备立即生效`);
      setQuerySymbol('');
      setQueryResult(null);
    } catch (e: any) {
      toast.error(e?.message || '添加失败');
    }
  };

  // 删除自定义币种
  const handleDelete = async (symbol: string) => {
    try {
      await deleteCustomCoinMutation.mutateAsync({ symbol });
      toast.success(`${symbol} 已删除`);
      setDeleteConfirm(null);
    } catch (e: any) {
      toast.error(e?.message || '删除失败');
    }
  };

  const allCoins = [
    ...BUILTIN_COINS.map(c => ({ ...c, isCustom: false })),
    ...customCoins.map((c: any) => ({ symbol: c.symbol, name: c.symbol, isCustom: true })),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-base font-semibold text-gray-900 flex-1">实时价格管理</h1>
        <button onClick={refreshAll} className="flex items-center gap-1 text-[13px] text-blue-600 font-medium">
          <RefreshCw className="w-4 h-4" />
          刷新全部
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* 查询新币种 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-900">查询新币种</span>
          </div>
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
              disabled={querying || !querySymbol}
              className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-[13px] font-semibold disabled:opacity-40 shrink-0"
            >
              {querying ? '查询中…' : '查询'}
            </button>
          </div>

          {/* 查询结果 */}
          {queryResult && (
            <div className={`mt-3 rounded-xl p-3 ${queryResult.source !== 'none' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {queryResult.source !== 'none' ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-green-900">
                          ${queryResult.price < 0.0001 ? queryResult.price.toFixed(8) : queryResult.price < 0.01 ? queryResult.price.toFixed(6) : queryResult.price < 1 ? queryResult.price.toFixed(4) : queryResult.price.toFixed(2)}
                        </span>
                        <span className={`text-[12px] font-medium ${queryResult.changePercent >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {queryResult.changePercent >= 0 ? '+' : ''}{queryResult.changePercent.toFixed(2)}%
                        </span>
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: sourceColor(queryResult.source) }}>
                          {sourceLabel(queryResult.source)}
                        </span>
                      </div>
                      <p className="text-[11px] text-green-700 mt-0.5">查询成功，添加后全局生效</p>
                    </div>
                  </div>
                  <button
                    onClick={handleAdd}
                    disabled={addCustomCoinMutation.isPending}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl bg-green-600 text-white text-[12px] font-semibold shrink-0 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {addCustomCoinMutation.isPending ? '添加中…' : '添加'}
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[12px] font-semibold text-red-700">查询失败</p>
                    <p className="text-[11px] text-red-600 mt-0.5">{queryResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 币种列表 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">
              已配置币种
              <span className="ml-1.5 text-[12px] font-normal text-gray-400">
                内置 {BUILTIN_COINS.length} 个{customCoins.length > 0 && `，自定义 ${customCoins.length} 个`}
              </span>
            </span>
          </div>

          {allCoins.map((coin, idx) => {
            const pr = priceCache[coin.symbol];
            return (
              <div key={coin.symbol} className={`px-4 py-3 flex items-center gap-3 ${idx < allCoins.length - 1 ? 'border-b border-gray-50' : ''}`}>
                {/* 币种标识 */}
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-gray-700">{coin.symbol.slice(0, 5)}</span>
                </div>
                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-gray-900">{coin.symbol}</span>
                    {coin.isCustom && (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">自定义</span>
                    )}
                    {pr?.source && pr.source !== 'none' && !pr.loading && (
                      <span className="inline-block px-1 py-0.5 rounded text-[9px] font-bold text-white" style={{ background: sourceColor(pr.source) }}>
                        {sourceLabel(pr.source)}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400">{coin.name}</span>
                </div>
                {/* 价格 */}
                <div className="text-right shrink-0 min-w-[70px]">
                  {pr?.loading ? (
                    <div className="text-[12px] text-gray-300">…</div>
                  ) : pr?.price && pr.price > 0 ? (
                    <>
                      <div className="text-[13px] font-semibold text-gray-900">
                        ${pr.price < 0.0001 ? pr.price.toFixed(8) : pr.price < 0.01 ? pr.price.toFixed(6) : pr.price < 1 ? pr.price.toFixed(4) : pr.price.toFixed(2)}
                      </div>
                      <div className={`text-[11px] font-medium ${(pr.changePercent || 0) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {(pr.changePercent || 0) >= 0 ? '+' : ''}{(pr.changePercent || 0).toFixed(2)}%
                      </div>
                    </>
                  ) : (
                    <div className="text-[12px] text-gray-300">—</div>
                  )}
                </div>
                {/* 操作 */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => refreshPrice(coin.symbol)} className="p-1.5 rounded-lg hover:bg-gray-100">
                    <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                  {coin.isCustom && (
                    <button onClick={() => setDeleteConfirm(coin.symbol)} className="p-1.5 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 数据源规则说明 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-900">数据源规则（规则 G）</span>
          </div>
          <div className="space-y-2.5">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[12px] font-semibold text-gray-800">通道一：数字币 → 前端直连（三重兜底）</span>
              </div>
              <div className="space-y-1">
                {[
                  { label: '主', color: '#F0B90B', name: '币安', url: 'api.binance.com' },
                  { label: '备', color: '#1A56DB', name: 'OKX', url: 'okx.com/api/v5' },
                  { label: '底', color: '#8DC63F', name: 'CoinGecko', url: 'api.coingecko.com' },
                ].map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="w-8 text-[11px] text-gray-400">{s.label}</span>
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: s.color }}>{s.name}</span>
                    <span className="text-[11px] text-gray-400 font-mono truncate">{s.url}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[12px] font-semibold text-gray-800">通道二：美股/港股/黄金/石油/汇率 → 服务器 tRPC</span>
              </div>
              <p className="text-[11px] text-gray-500">通过服务器端 Yahoo Finance / 新浪财经接口获取。</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Shield className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[12px] font-semibold text-amber-800">架构铁律</span>
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">价格数据在<strong>父组件顶层</strong>统一拉取一次（每 3 秒），通过 props 传给所有子卡片。严禁在每张卡片内独立调用，否则 N 张卡片 = N 个并发请求，移动端会崩溃。</p>
            </div>
            <div className="flex items-center justify-between text-[12px] px-1">
              <span className="text-gray-500">数字币轮询间隔</span>
              <span className="font-semibold text-gray-800">每 3 秒</span>
            </div>
            <div className="flex items-center justify-between text-[12px] px-1">
              <span className="text-gray-500">USD/CNY 汇率轮询</span>
              <span className="font-semibold text-gray-800">每 60 秒</span>
            </div>
            <div className="flex items-center justify-between text-[12px] px-1">
              <span className="text-gray-500">自定义币种存储</span>
              <span className="font-semibold text-gray-800">数据库（全局生效）</span>
            </div>
          </div>
        </div>

      </div>

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-2">删除 {deleteConfirm}？</h3>
            <p className="text-[13px] text-gray-500 mb-4">删除后，该币种将从所有设备的自定义列表中移除，订单卡片中将不再显示其实时价格。</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] text-gray-600">取消</button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleteCustomCoinMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-semibold disabled:opacity-50"
              >
                {deleteCustomCoinMutation.isPending ? '删除中…' : '删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
