/**
 * PositionCalc.tsx
 * ETH 持仓计算页面
 * - 每50元一档，从1000到3500
 * - 每档是一条进度条，价格文字融入条内
 * - 点击档位弹出 modal，选择修改计划量或已买量
 */
import React, { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, TrendingUp, TrendingDown, RefreshCw, X, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";

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

const PRICE_LEVELS = generatePriceLevels();

function getDefaultPlanned(): Record<number, number> {
  const result: Record<number, number> = {};
  PRICE_LEVELS.forEach(p => {
    if (p <= 1500) result[p] = 2;
    else if (p <= 2000) result[p] = 1;
    else if (p <= 2500) result[p] = 0.5;
    else result[p] = 0;
  });
  return result;
}

function getDefaultActual(): Record<number, number> {
  const result: Record<number, number> = {};
  PRICE_LEVELS.forEach(p => {
    if (p === 1800) result[p] = 1;
    else if (p === 1750) result[p] = 0.8;
    else if (p === 1700) result[p] = 1.2;
    else if (p === 1650) result[p] = 0.5;
    else result[p] = 0;
  });
  return result;
}

// 弹窗状态
interface ModalState {
  price: number;
  mode: 'choose' | 'editPlanned' | 'editActual';
  inputValue: string;
}

export default function PositionCalc() {
  const [, params] = useRoute("/ledger/:id/position-calc");
  const [, setLocation] = useLocation();
  const ledgerId = params ? parseInt(params.id) : 0;

  const [planned, setPlanned] = useState<Record<number, number>>(getDefaultPlanned);
  const [actual, setActual] = useState<Record<number, number>>(getDefaultActual);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 30000,
    staleTime: 15000,
  });

  useEffect(() => {
    if (cryptoPricesRaw && (cryptoPricesRaw as any)?.ETH) {
      setCurrentPrice((cryptoPricesRaw as any).ETH);
    }
  }, [cryptoPricesRaw]);

  const summary = useMemo(() => {
    let totalQty = 0;
    let totalCost = 0;
    PRICE_LEVELS.forEach(p => {
      const qty = actual[p] || 0;
      if (qty > 0) { totalQty += qty; totalCost += qty * p; }
    });
    const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
    const curPrice = currentPrice || 0;
    const totalValue = totalQty * curPrice;
    const totalPnl = totalQty > 0 && curPrice > 0 ? (curPrice - avgPrice) * totalQty : 0;
    const pnlPct = avgPrice > 0 && curPrice > 0 ? ((curPrice - avgPrice) / avgPrice) * 100 : 0;
    const totalPlanned = PRICE_LEVELS.reduce((s, p) => s + (planned[p] || 0), 0);
    return { totalQty, avgPrice, totalValue, totalPnl, pnlPct, totalPlanned };
  }, [actual, planned, currentPrice]);

  const hasData = (p: number) => (planned[p] || 0) > 0 || (actual[p] || 0) > 0;

  const visibleLevels = useMemo(() => {
    const nearPrice = currentPrice || 1800;
    return PRICE_LEVELS.filter(p =>
      hasData(p) || (p >= nearPrice - 500 && p <= nearPrice + 500)
    );
  }, [planned, actual, currentPrice]);

  // 打开弹窗
  const openModal = (price: number) => {
    setModal({ price, mode: 'choose', inputValue: '' });
  };

  // 弹窗确认
  const confirmModal = () => {
    if (!modal) return;
    const num = parseFloat(modal.inputValue);
    const val = isNaN(num) || num < 0 ? 0 : num;
    if (modal.mode === 'editPlanned') {
      setPlanned(prev => ({ ...prev, [modal.price]: val }));
    } else if (modal.mode === 'editActual') {
      setActual(prev => ({ ...prev, [modal.price]: val }));
    }
    setModal(null);
  };

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
          <div className="text-white/70 text-xs">以太坊 · 每50元一档 · 点击档位可编辑</div>
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
            <div className="bg-blue-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">总持仓量</div>
              <div className="text-xl font-bold" style={{ color: '#1A56DB' }}>
                {summary.totalQty.toFixed(4)}
                <span className="text-sm font-normal text-gray-400 ml-1">ETH</span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5">计划 {summary.totalPlanned.toFixed(2)} ETH</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">加权均价</div>
              <div className="text-xl font-bold text-gray-800">
                ${summary.avgPrice > 0 ? summary.avgPrice.toFixed(0) : '--'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                现价 {currentPrice ? `$${currentPrice.toFixed(0)}` : '加载中...'}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-1">当前市值</div>
              <div className="text-xl font-bold text-gray-800">
                {summary.totalValue > 0 ? `$${summary.totalValue.toFixed(0)}` : '--'}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                成本 ${summary.avgPrice > 0 ? (summary.avgPrice * summary.totalQty).toFixed(0) : '--'}
              </div>
            </div>
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
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'linear-gradient(90deg,#1A56DB,#3B82F6)' }} />
            已买
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm bg-gray-200" />
            计划
          </span>
        </div>
        <button
          onClick={() => { setPlanned(getDefaultPlanned()); setActual(getDefaultActual()); }}
          className="text-xs text-blue-500 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />重置
        </button>
      </div>

      {/* 档位列表：每档一条进度条 */}
      <div className="px-4 space-y-1.5">
        {visibleLevels.map(price => {
          const planQty = planned[price] || 0;
          const actualQty = actual[price] || 0;
          // 已买占计划的百分比；若无计划但有实际，显示满格
          const actualPct = planQty > 0
            ? Math.min((actualQty / planQty) * 100, 100)
            : (actualQty > 0 ? 100 : 0);
          const isNearCurrent = currentPrice && Math.abs(price - currentPrice) <= 25;
          const isBelowCurrent = currentPrice ? price <= currentPrice : false;
          const isFullyBought = planQty > 0 && actualQty >= planQty;

          return (
            <button
              key={price}
              onClick={() => openModal(price)}
              className="w-full block"
            >
              {/* 进度条容器 */}
              <div
                className="relative h-8 rounded-lg overflow-hidden transition-all duration-200 active:scale-[0.98]"
                style={{
                  background: planQty > 0 ? '#E5E7EB' : '#F3F4F6',
                  boxShadow: isNearCurrent ? '0 0 0 2px #3B82F6' : 'none',
                }}
              >
                {/* 已买填充（蓝色） */}
                {actualQty > 0 && (
                  <div
                    className="absolute left-0 top-0 h-full transition-all duration-300"
                    style={{
                      width: `${actualPct}%`,
                      background: isFullyBought
                        ? 'linear-gradient(90deg, #059669, #10B981)'  // 满仓绿色
                        : 'linear-gradient(90deg, #1A56DB, #3B82F6)',
                      minWidth: '4px',
                    }}
                  />
                )}

                {/* 价格文字（叠加在进度条上，始终可见） */}
                <div className="absolute inset-0 flex items-center px-3 pointer-events-none">
                  <span
                    className="text-xs font-bold tabular-nums"
                    style={{
                      color: actualPct > 30
                        ? 'rgba(255,255,255,0.95)'
                        : (isBelowCurrent ? '#374151' : '#9CA3AF'),
                      textShadow: actualPct > 30 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
                    }}
                  >
                    ${price.toLocaleString()}
                  </span>
                  {isNearCurrent && (
                    <span
                      className="ml-1.5 text-[10px] font-semibold px-1 py-0.5 rounded"
                      style={{
                        background: 'rgba(59,130,246,0.15)',
                        color: actualPct > 30 ? 'rgba(255,255,255,0.9)' : '#3B82F6',
                      }}
                    >
                      ↑当前
                    </span>
                  )}
                </div>

                {/* 右侧数量标注 */}
                {(planQty > 0 || actualQty > 0) && (
                  <div className="absolute right-3 top-0 h-full flex items-center pointer-events-none">
                    <span
                      className="text-[11px] font-medium tabular-nums"
                      style={{
                        color: actualPct > 70
                          ? 'rgba(255,255,255,0.9)'
                          : '#6B7280',
                        textShadow: actualPct > 70 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
                      }}
                    >
                      {actualQty > 0 ? actualQty.toFixed(2) : ''}
                      {planQty > 0 && actualQty > 0 ? <span style={{ opacity: 0.6 }}>/</span> : ''}
                      {planQty > 0 && <span style={{ opacity: actualQty > 0 ? 0.6 : 1 }}>{planQty.toFixed(2)}</span>}
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 底部提示 */}
      <div className="px-4 pt-4 pb-2 text-center text-xs text-gray-300">
        价格范围 $1,000 ~ $3,500 · 每50元一档 · 共50档
      </div>

      {/* 编辑弹窗 */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
        >
          <div className="bg-white w-full max-w-md rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl">
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base font-semibold text-gray-800">
                  ${modal.price.toLocaleString()} 档位
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  已买 {(actual[modal.price] || 0).toFixed(2)} ETH &nbsp;·&nbsp; 计划 {(planned[modal.price] || 0).toFixed(2)} ETH
                </div>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-full hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {modal.mode === 'choose' && (
              <div className="space-y-3">
                <button
                  onClick={() => setModal({ ...modal, mode: 'editActual', inputValue: String(actual[modal.price] || '') })}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors"
                  style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1A56DB' }}>
                    <span className="text-white text-sm font-bold">买</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: '#1A56DB' }}>修改已买数量</div>
                    <div className="text-xs text-gray-400">当前：{(actual[modal.price] || 0).toFixed(2)} ETH</div>
                  </div>
                </button>
                <button
                  onClick={() => setModal({ ...modal, mode: 'editPlanned', inputValue: String(planned[modal.price] || '') })}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors"
                  style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-400">
                    <span className="text-white text-sm font-bold">划</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-700">修改计划数量</div>
                    <div className="text-xs text-gray-400">当前：{(planned[modal.price] || 0).toFixed(2)} ETH</div>
                  </div>
                </button>
              </div>
            )}

            {(modal.mode === 'editActual' || modal.mode === 'editPlanned') && (
              <div>
                <div className="mb-3 text-sm font-medium text-gray-700">
                  {modal.mode === 'editActual' ? '输入已买数量（ETH）' : '输入计划数量（ETH）'}
                </div>
                <input
                  autoFocus
                  type="number"
                  value={modal.inputValue}
                  onChange={e => setModal(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmModal(); if (e.key === 'Escape') setModal(null); }}
                  placeholder="输入 ETH 数量，如 0.5"
                  className="w-full px-4 py-3 rounded-xl text-base border outline-none"
                  style={{ borderColor: modal.mode === 'editActual' ? '#3B82F6' : '#D1D5DB' }}
                  step="0.01"
                  min="0"
                />
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setModal({ ...modal, mode: 'choose', inputValue: '' })}
                    className="flex-1 py-3 rounded-xl text-sm font-medium text-gray-600 bg-gray-100"
                  >
                    返回
                  </button>
                  <button
                    onClick={confirmModal}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                    style={{ background: modal.mode === 'editActual' ? '#1A56DB' : '#6B7280' }}
                  >
                    确认
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

