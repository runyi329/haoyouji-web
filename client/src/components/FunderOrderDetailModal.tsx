/**
 * FunderOrderDetailModal.tsx
 * 资金方订单详情弹窗
 * 包含：基本信息、跳动利息计数器、利息约定、收益权扫描统计、公开备注
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";

const COIN_COLORS: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
};

const PAYMENT_TYPE_MAP: Record<string, string> = {
  monthly_pre: '月付先付',
  monthly_post: '月付后付',
  semi_pre: '半年付先付',
  semi_post: '半年付后付',
  annual_pre: '年付先付',
  annual_post: '年付后付',
  end_post: '结束后付',
};

// 精确到秒的利息计数器 Hook
function useAccruedInterest(interestBase: string | null, interestRateAnnual: string | null, interestStartDate: string | null) {
  const [accrued, setAccrued] = useState<number>(0);
  const computeAccrued = useCallback(() => {
    const base = parseFloat(interestBase || '0');
    const rate = parseFloat(interestRateAnnual || '0');
    if (!base || !rate || !interestStartDate) return 0;
    const startTs = new Date(interestStartDate + 'T00:00:00').getTime();
    if (isNaN(startTs)) return 0;
    const nowTs = Date.now();
    const elapsedSeconds = Math.max(0, (nowTs - startTs) / 1000);
    const perSecond = (base * rate / 100) / (365 * 24 * 3600);
    return perSecond * elapsedSeconds;
  }, [interestBase, interestRateAnnual, interestStartDate]);
  useEffect(() => {
    setAccrued(computeAccrued());
    const timer = setInterval(() => setAccrued(computeAccrued()), 1000);
    return () => clearInterval(timer);
  }, [computeAccrued]);
  return accrued;
}

function ScanStatsSection({ orderId, ledgerId, coin, buyQuantity }: {
  orderId: number;
  ledgerId: number;
  coin: string;
  buyQuantity: string | null;
}) {
  const { data: stats, isLoading } = trpc.ledger.funderGetOrderScanStats.useQuery(
    { orderId, ledgerId },
    { refetchOnWindowFocus: false }
  );
  const coinColor = COIN_COLORS[coin] || '#6B7280';

  if (isLoading) {
    return (
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">收益权监控</div>
        <div className="bg-gray-50 rounded-2xl px-4 py-4 text-center text-sm text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">收益权监控</div>
        <div className="bg-gray-50 rounded-2xl px-4 py-4 text-center text-sm text-gray-400">
          暂无扫描数据，新订单将在下次整点自动扫描
        </div>
      </div>
    );
  }

  const formatDate = (d: any) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return '—'; }
  };

  const qty = parseFloat(buyQuantity || '0');

  return (
    <div>
      <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">收益权监控</div>

      {/* 收益权核心卡片 */}
      <div
        className="rounded-2xl p-4 mb-3"
        style={{ background: `linear-gradient(135deg, ${coinColor}22 0%, ${coinColor}11 100%)`, border: `1px solid ${coinColor}33` }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium" style={{ color: coinColor }}>当前收益权</div>
          <div className="text-xs text-gray-400">每降1% → +0.5%收益权</div>
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-3xl font-bold tabular-nums" style={{ color: coinColor }}>
            {stats.profitRightPct > 0 ? stats.profitRightPct.toFixed(4) : '0.0000'}
          </span>
          <span className="text-base font-semibold" style={{ color: coinColor }}>%</span>
        </div>
        {qty > 0 && stats.profitRightPct > 0 && (
          <div className="text-sm text-gray-600 mt-1">
            相当于 <span className="font-bold" style={{ color: coinColor }}>
              {(qty * stats.profitRightPct / 100).toFixed(8)} {coin}
            </span> 的收益权
          </div>
        )}
        {stats.dropPct > 0 && (
          <div className="text-xs text-gray-400 mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${coinColor}22` }}>
            历史最低较买入价已跌 <span className="font-semibold" style={{ color: coinColor }}>{stats.dropPct.toFixed(2)}%</span>
          </div>
        )}
        {stats.dropPct === 0 && stats.scanCount > 0 && (
          <div className="text-xs text-gray-400 mt-1">当前价格高于买入价，暂无收益权积累</div>
        )}
      </div>

      {/* 扫描统计明细 */}
      <div className="bg-gray-50 rounded-2xl overflow-hidden">
        {[
          { label: '累计扫描次数', value: `${stats.scanCount} 次` },
          { label: '上次扫描时间', value: formatDate(stats.lastScanAt) },
          { label: '历史最低价', value: stats.allTimeLow ? `${parseFloat(stats.allTimeLow).toLocaleString()} USDT` : '—' },
          { label: '历史最低出现时间', value: formatDate(stats.allTimeLowAt) },
        ].map((item, idx, arr) => (
          <div
            key={item.label}
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: idx < arr.length - 1 ? '1px solid #F3F4F6' : 'none' }}
          >
            <span className="text-sm text-gray-400">{item.label}</span>
            <span className="text-sm font-medium" style={{ color: '#1A2340' }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  order: any;
  ledgerId: number;
  onClose: () => void;
}

export default function FunderOrderDetailModal({ order, ledgerId, onClose }: Props) {
  const coinColor = COIN_COLORS[order.coin] || '#6B7280';
  const qty = parseFloat(order.buy_quantity || '0');
  const price = parseFloat(order.buy_price || '0');
  const totalU = qty > 0 && price > 0 ? qty * price : parseFloat(order.amount || '0');

  const hasInterest = order.interest_base && order.interest_rate_annual && order.interest_start_date;
  const accrued = useAccruedInterest(
    hasInterest ? order.interest_base : null,
    hasInterest ? order.interest_rate_annual : null,
    hasInterest ? order.interest_start_date : null
  );

  // 每秒利息
  const perSecond = hasInterest
    ? (parseFloat(order.interest_base) * parseFloat(order.interest_rate_annual) / 100) / (365 * 24 * 3600)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] overflow-y-auto">
        {/* 弹窗头部 */}
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl z-10">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold px-3 py-1 rounded-full text-white" style={{ backgroundColor: coinColor }}>
              {order.coin}
            </span>
            <span className="text-base font-semibold" style={{ color: '#1A2340' }}>订单详情</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* 持仓核心卡片：突出币数 */}
          <div
            className="rounded-2xl p-4"
            style={{ background: `linear-gradient(135deg, ${coinColor} 0%, ${coinColor}BB 100%)` }}
          >
            <div className="text-xs text-white/70 mb-1">持仓数量</div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-4xl font-bold text-white tabular-nums">
                {qty > 0 ? qty : '—'}
              </span>
              <span className="text-xl font-semibold text-white/80">{order.coin}</span>
            </div>
            {price > 0 && (
              <div className="text-sm text-white/70 mb-2">
                买入价 {price.toLocaleString()} USDT
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="text-sm text-white/60">
                折算 {totalU.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDT
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white">
                {order.status === 'active' ? '持有中' : order.status === 'settled' ? '已结算' : '已取消'}
              </span>
            </div>
          </div>

          {/* 待结利息跳动计数器（仅持有中且有利息设置时显示） */}
          {hasInterest && order.status === 'active' && (
            <div
              className="rounded-2xl p-4"
              style={{ background: 'linear-gradient(135deg, #EEF4FF 0%, #F0F7FF 100%)', border: '1px solid #C7D9FF' }}
            >
              <div className="text-xs text-gray-400 mb-1">待结利息（精确到秒）</div>
              <div className="flex items-baseline gap-1 mb-1">
                <span
                  className="text-3xl font-bold tabular-nums"
                  style={{ color: '#1A56DB', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
                >
                  {accrued.toFixed(6)}
                </span>
                <span className="text-base font-medium text-blue-400">USDT</span>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>基数 {parseFloat(order.interest_base).toLocaleString()} USDT × {order.interest_rate_annual}% / 年</span>
                <span>≈ {perSecond.toFixed(8)} U/秒</span>
              </div>
              {order.interest_start_date && (
                <div className="text-xs text-gray-400 mt-1">
                  计息开始：{order.interest_start_date}
                </div>
              )}
            </div>
          )}

          {/* 基本信息 */}
          <div>
            <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">持仓信息</div>
            <div className="bg-gray-50 rounded-2xl overflow-hidden">
              {[
                { label: '币种', value: order.coin },
                { label: '买入价格', value: price > 0 ? `${price.toLocaleString()} USDT` : null },
                { label: '买入数量', value: qty > 0 ? `${qty} ${order.coin}` : null },
                { label: '买入日期', value: order.buy_date || null },
                { label: '存放账号', value: order.storage_account || null },
              ].filter(item => item.value !== null).map((item, idx, arr) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: idx < arr.length - 1 ? '1px solid #F3F4F6' : 'none' }}
                >
                  <span className="text-sm text-gray-400">{item.label}</span>
                  <span className="text-sm font-medium" style={{ color: '#1A2340' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 利息约定 */}
          {(order.interest_rate_annual || order.interest_payment_type || order.interest_base) && (
            <div>
              <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">利息约定</div>
              <div className="bg-gray-50 rounded-2xl overflow-hidden">
                {[
                  { label: '约定年化利息', value: order.interest_rate_annual ? `${order.interest_rate_annual}% / 年` : null },
                  { label: '计息基数', value: order.interest_base ? `${parseFloat(order.interest_base).toLocaleString()} USDT` : null },
                  { label: '计息开始日期', value: order.interest_start_date || null },
                  { label: '支付方式', value: order.interest_payment_type ? PAYMENT_TYPE_MAP[order.interest_payment_type] || order.interest_payment_type : null },
                ].filter(item => item.value !== null).map((item, idx, arr) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: idx < arr.length - 1 ? '1px solid #F3F4F6' : 'none' }}
                  >
                    <span className="text-sm text-gray-400">{item.label}</span>
                    <span className="text-sm font-semibold" style={{ color: '#1A56DB' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 收益权监控（仅持有中的订单显示） */}
          {order.status === 'active' && (
            <ScanStatsSection
              orderId={order.id}
              ledgerId={ledgerId}
              coin={order.coin}
              buyQuantity={order.buy_quantity}
            />
          )}

          {/* 公开备注（资金方可见） */}
          {order.public_note && (
            <div>
              <div className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">备注</div>
              <div className="bg-gray-50 rounded-2xl px-4 py-3">
                <p className="text-sm text-gray-700 leading-relaxed">{order.public_note}</p>
              </div>
            </div>
          )}

          {/* 订单编号 */}
          <div className="text-center text-xs text-gray-300 pb-2">
            订单编号 #{order.id}
          </div>
        </div>
      </div>
    </div>
  );
}
