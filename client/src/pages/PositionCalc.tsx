/**
 * PositionCalc.tsx
 * ETH 持仓计算页面
 * - 每50元一档，从1000到3500
 * - 每档显示：价格、预计仓位、实际仓位（进度条形式）
 * - 顶部汇总：总持仓量、加权均价、当前价格、总盈亏
 */
import React, { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, TrendingUp, TrendingDown, RefreshCw, Edit2, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

// 生成价格档位：从 minPrice 到 maxPrice，每 step 一档，降序排列（高价在上）
const MIN_PRICE = 1000;
const MAX_PRICE = 3500;
const STEP = 50;

function generatePriceLevels(): number[] {
  const levels: number[] = [];
  for (let p = MAX_PRICE; p >= MIN_PRICE; p -= STEP) {
    levels.push(p);
  }
  return levels;
}

const PRICE_LEVELS = generatePriceLevels(); // 50档，从3500降到1000

// 模拟数据：预计仓位（每档计划买多少ETH）
function getDefaultPlanned(): Record<number, number> {
  const result: Record<number, number> = {};
  PRICE_LEVELS.forEach(p => {
    // 模拟：价格越低，计划买越多
    if (p <= 1500) result[p] = 2;
    else if (p <= 2000) result[p] = 1;
    else if (p <= 2500) result[p] = 0.5;
    else result[p] = 0;
  });
  return result;
}

// 模拟数据：实际仓位（已买多少ETH）
function getDefaultActual(): Record<number, number> {
  const result: Record<number, number> = {};
  PRICE_LEVELS.forEach(p => {
    if (p === 1800) result[p] = 1;
    else if (p === 1750) result[p] = 0.8;
    else if (p === 1700) result[p] = 1.2;
    else if (p === 1650) result[p] = 0.5;
    else if (p === 1600) result[p] = 0;
    else result[p] = 0;
  });
  return result;
}

interface RowEditState {
  price: number;
  field: 'planned' | 'actual';
  value: string;
}

export default function PositionCalc() {
  const [, params] = useRoute("/ledger/:id/position-calc");
  const [, setLocation] = useLocation();
  const ledgerId = params ? parseInt(params.id) : 0;

  const [planned, setPlanned] = useState<Record<number, number>>(getDefaultPlanned);
  const [actual, setActual] = useState<Record<number, number>>(getDefaultActual);
  const [editState, setEditState] = useState<RowEditState | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  // 拉取 ETH 实时价格
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 30000,
    staleTime: 15000,
  });

  useEffect(() => {
    if (cryptoPricesRaw && (cryptoPricesRaw as any)?.ETH) {
      setCurrentPrice((cryptoPricesRaw as any).ETH);
    }
  }, [cryptoPricesRaw]);

  // 计算汇总数据
  const summary = useMemo(() => {
    let totalQty = 0;
    let totalCost = 0;
    PRICE_LEVELS.forEach(p => {
      const qty = actual[p] || 0;
      if (qty > 0) {
        totalQty += qty;
        totalCost += qty * p;
      }
    });
    const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
    const curPrice = currentPrice || 0;
    const totalValue = totalQty * curPrice;
    const totalPnl = totalQty > 0 && curPrice > 0 ? (curPrice - avgPrice) * totalQty : 0;
    const pnlPct = avgPrice > 0 && curPrice > 0 ? ((curPrice - avgPrice) / avgPrice) * 100 : 0;
    const totalPlanned = PRICE_LEVELS.reduce((s, p) => s + (planned[p] || 0), 0);
    return { totalQty, avgPrice, totalValue, totalPnl, pnlPct, totalPlanned };
  }, [actual, planned, currentPrice]);

  // 开始编辑
  const startEdit = (price: number, field: 'planned' | 'actual') => {
    const val = field === 'planned' ? (planned[price] || 0) : (actual[price] || 0);
    setEditState({ price, field, value: val > 0 ? String(val) : '' });
  };

  // 确认编辑
  const confirmEdit = () => {
    if (!editState) return;
    const num = parseFloat(editState.value);
    const val = isNaN(num) || num < 0 ? 0 : num;
    if (editState.field === 'planned') {
      setPlanned(prev => ({ ...prev, [editState.price]: val }));
    } else {
      setActual(prev => ({ ...prev, [editState.price]: val }));
    }
    setEditState(null);
  };

  const cancelEdit = () => setEditState(null);

  // 判断某档是否有数据（有计划或有实际）
  const hasData = (p: number) => (planned[p] || 0) > 0 || (actual[p] || 0) > 0;

  // 只显示有数据的档位，或者当前价格附近的档位（±500）
  const visibleLevels = useMemo(() => {
    const nearPrice = currentPrice || 1800;
    return PRICE_LEVELS.filter(p =>
      hasData(p) || (p >= nearPrice - 500 && p <= nearPrice + 500)
    );
  }, [planned, actual, currentPrice]);

  const isPnlPositive = summary.totalPnl >= 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative">
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="w-8 h-8 rounded-full flex items-center justify-center mr-3"
          style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <div className="text-white font-semibold text-base">ETH 持仓计算</div>
          <div className="text-white/70 text-xs">以太坊 · 每50元一档</div>
        </div>
        <img
          src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/eth-official.png"
          alt="ETH"
          className="w-8 h-8 rounded-full object-contain"
        />
      </div>

      {/* 汇总卡片 */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ border: '1px solid #E0E8FF' }}>
          <div className="grid grid-cols-2 gap-3">
            {/* 总持仓 */}
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">总持仓量</div>
              <div className="text-xl font-bold" style={{ color: '#1A56DB' }}>
                {summary.totalQty.toFixed(4)}
                <span className="text-sm font-normal text-gray-400 ml-1">ETH</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                计划 {summary.totalPlanned.toFixed(2)} ETH
              </div>
            </div>
            {/* 加权均价 */}
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">加权均价</div>
              <div className="text-xl font-bold text-gray-800">
                ${summary.avgPrice > 0 ? summary.avgPrice.toFixed(0) : '--'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                现价 {currentPrice ? `$${currentPrice.toFixed(0)}` : '加载中...'}
              </div>
            </div>
            {/* 总市值 */}
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">当前市值</div>
              <div className="text-xl font-bold text-gray-800">
                {summary.totalValue > 0 ? `$${summary.totalValue.toFixed(0)}` : '--'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                成本 ${summary.avgPrice > 0 ? (summary.avgPrice * summary.totalQty).toFixed(0) : '--'}
              </div>
            </div>
            {/* 总盈亏 */}
            <div className={`rounded-xl p-3 ${isPnlPositive ? 'bg-red-50' : 'bg-green-50'}`}>
              <div className="text-xs text-gray-500 mb-1">总浮盈亏</div>
              <div className={`text-xl font-bold flex items-center gap-1 ${isPnlPositive ? 'text-red-500' : 'text-green-600'}`}>
                {isPnlPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {summary.totalPnl !== 0 ? `${isPnlPositive ? '+' : ''}$${summary.totalPnl.toFixed(0)}` : '--'}
              </div>
              <div className={`text-xs mt-0.5 ${isPnlPositive ? 'text-red-400' : 'text-green-500'}`}>
                {summary.pnlPct !== 0 ? `${isPnlPositive ? '+' : ''}${summary.pnlPct.toFixed(2)}%` : '--'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 说明栏 */}
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="text-xs text-gray-400">点击数字可编辑 · 仅显示有数据及当前价格附近档位</div>
        <button
          onClick={() => {
            setPlanned(getDefaultPlanned());
            setActual(getDefaultActual());
          }}
          className="text-xs text-blue-500 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />重置
        </button>
      </div>

      {/* 列标题 */}
      <div className="px-4 mb-1">
        <div className="flex items-center gap-2 text-xs text-gray-400 px-3">
          <div className="w-16 text-center">价格($)</div>
          <div className="flex-1">
            <div className="flex justify-between">
              <span className="text-blue-400">实际持仓</span>
              <span className="text-gray-300">预计目标</span>
            </div>
          </div>
          <div className="w-20 text-right">ETH数量</div>
        </div>
      </div>

      {/* 档位列表 */}
      <div className="px-4 space-y-2">
        {visibleLevels.map(price => {
          const planQty = planned[price] || 0;
          const actualQty = actual[price] || 0;
          const maxQty = Math.max(planQty, actualQty, 0.01);
          // 已买占计划的百分比（计划为满格100%，已买逐步填充）
          const actualPct = planQty > 0 ? Math.min((actualQty / planQty) * 100, 100) : (actualQty > 0 ? 100 : 0);
          const planPct = 100; // 计划始终是满格
          const isNearCurrent = currentPrice && Math.abs(price - currentPrice) <= 25;
          const isBelowCurrent = currentPrice ? price < currentPrice : false;
          const isEditing = editState?.price === price;

          return (
            <div
              key={price}
              className={`bg-white rounded-xl px-3 py-2.5 shadow-sm ${isNearCurrent ? 'ring-2 ring-blue-400' : ''}`}
              style={{ border: isNearCurrent ? 'none' : '1px solid #F0F0F0' }}
            >
              <div className="flex items-center gap-2">
                {/* 价格标签 */}
                <div className="w-16 flex-shrink-0 text-center">
                  <div className={`text-sm font-bold tabular-nums ${isBelowCurrent ? 'text-gray-700' : 'text-gray-400'}`}>
                    {price.toLocaleString()}
                  </div>
                  {isNearCurrent && (
                    <div className="text-xs text-blue-500 font-medium">↑当前</div>
                  )}
                </div>

                {/* 进度条区域：单条双色，计划=灰底，已买=蓝色填充 */}
                <div className="flex-1">
                  <div className="relative h-4 rounded-full overflow-hidden" style={{ background: planQty > 0 ? '#E5E7EB' : '#F3F4F6' }}>
                    {/* 已买部分（蓝色，从左向右填充） */}
                    {actualQty > 0 && (
                      <div
                        className="absolute left-0 top-0 h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${actualPct}%`,
                          background: 'linear-gradient(90deg, #1A56DB, #3B82F6)',
                          minWidth: '4px',
                        }}
                      />
                    )}
                    {/* 计划目标刻度线（右端） */}
                    {planQty > 0 && actualPct < 98 && (
                      <div
                        className="absolute top-0 h-full w-0.5"
                        style={{ right: '0', background: 'rgba(107,114,128,0.4)' }}
                      />
                    )}
                  </div>
                  {/* 进度文字：已买/计划 */}
                  {(planQty > 0 || actualQty > 0) && (
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] font-medium" style={{ color: '#3B82F6' }}>
                        {actualQty > 0 ? `已买 ${actualQty.toFixed(2)}` : '未买入'}
                      </span>
                      {planQty > 0 && (
                        <span className="text-[10px] text-gray-400">
                          计划 {planQty.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 数量编辑区 */}
                <div className="w-20 flex-shrink-0 text-right space-y-0.5">
                  {/* 实际仓位 */}
                  {isEditing && editState?.field === 'actual' ? (
                    <div className="flex items-center gap-1 justify-end">
                      <input
                        autoFocus
                        type="number"
                        value={editState.value}
                        onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                        className="w-14 text-right text-xs border border-blue-400 rounded px-1 py-0.5 outline-none"
                        step="0.01"
                        min="0"
                      />
                      <button onClick={confirmEdit} className="text-blue-500"><Check className="w-3 h-3" /></button>
                      <button onClick={cancelEdit} className="text-gray-400"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(price, 'actual')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 tabular-nums flex items-center gap-0.5 justify-end w-full"
                    >
                      {actualQty > 0 ? actualQty.toFixed(2) : <span className="text-gray-300">--</span>}
                      <Edit2 className="w-2.5 h-2.5 text-gray-300" />
                    </button>
                  )}
                  {/* 预计仓位 */}
                  {isEditing && editState?.field === 'planned' ? (
                    <div className="flex items-center gap-1 justify-end">
                      <input
                        autoFocus
                        type="number"
                        value={editState.value}
                        onChange={e => setEditState(prev => prev ? { ...prev, value: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit(); }}
                        className="w-14 text-right text-xs border border-gray-400 rounded px-1 py-0.5 outline-none"
                        step="0.01"
                        min="0"
                      />
                      <button onClick={confirmEdit} className="text-blue-500"><Check className="w-3 h-3" /></button>
                      <button onClick={cancelEdit} className="text-gray-400"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(price, 'planned')}
                      className="text-xs text-gray-400 hover:text-gray-600 tabular-nums flex items-center gap-0.5 justify-end w-full"
                    >
                      {planQty > 0 ? planQty.toFixed(2) : <span className="text-gray-200">--</span>}
                      <Edit2 className="w-2.5 h-2.5 text-gray-200" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部提示 */}
      <div className="px-4 pt-4 pb-2 text-center text-xs text-gray-300">
        价格范围 $1,000 ~ $3,500 · 每50元一档 · 共50档
      </div>
    </div>
  );
}
