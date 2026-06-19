import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  won:       { text: '盈利', color: '#D32F2F' },
  lost:      { text: '亏损', color: '#388E3C' },
  pending:   { text: '待结算', color: '#B8860B' },
  cancelled: { text: '已撤销', color: '#9E9E9E' },
};

const COIN_LABEL: Record<string, string> = {
  BTC: '比特币', ETH: '以太坊',
  AAPL: '苹果', MSFT: '微软', GOOGL: '谷歌',
  AMZN: '亚马逊', NVDA: '英伟达', TSLA: '特斯拉', META: 'Meta',
};

type FilterStatus = 'all' | 'won' | 'lost' | 'pending' | 'cancelled';

export default function AfPredictionStats() {
  const [, params] = useRoute("/ledger/:id/af-prediction-stats");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? Number(params.id) : 0;

  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  const { data, isLoading } = trpc.prediction.getAllBetsStats.useQuery(
    { ledgerId },
    { enabled: !!ledgerId, staleTime: 30 * 1000 }
  );

  const summary = data?.summary;
  const orders = data?.orders ?? [];

  const filteredOrders = filterStatus === 'all'
    ? orders
    : orders.filter(o => o.status === filterStatus);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F5F5' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 flex items-center px-4 py-3 border-b border-gray-100 bg-white">
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/af-invite-tree`)}
          className="flex items-center gap-1.5 text-gray-600 mr-3"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm">返回</span>
        </button>
        <div className="flex-1">
          <div className="text-base font-bold text-gray-900">行情预测汇总</div>
          <div className="text-xs text-gray-400">所有人的竞猜订单</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">加载中...</div>
      ) : (
        <>
          {/* 汇总统计卡片 */}
          {summary && (
            <div className="mx-4 mt-4 rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #EEEEEE' }}>
              <div className="px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-800">汇总统计</span>
                <span className="text-xs text-gray-400 ml-2">（撤销订单不计入流水）</span>
              </div>
              <div className="grid grid-cols-2 gap-0">
                {/* 累计订单 */}
                <div className="px-4 py-3 border-b border-r border-gray-100">
                  <div className="text-xs text-gray-400 mb-0.5">累计订单</div>
                  <div className="text-lg font-bold text-gray-900">{summary.totalOrders}<span className="text-xs font-normal text-gray-400 ml-1">笔</span></div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    <span style={{ color: '#D32F2F' }}>盈{summary.wonCount}</span>
                    <span className="mx-1 text-gray-300">·</span>
                    <span style={{ color: '#388E3C' }}>亏{summary.lostCount}</span>
                    <span className="mx-1 text-gray-300">·</span>
                    <span style={{ color: '#B8860B' }}>待{summary.pendingCount}</span>
                    <span className="mx-1 text-gray-300">·</span>
                    <span style={{ color: '#9E9E9E' }}>撤{summary.cancelledCount}</span>
                  </div>
                </div>
                {/* 累计流水 */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-xs text-gray-400 mb-0.5">累计流水</div>
                  <div className="text-lg font-bold text-gray-900">{summary.totalTurnover.toFixed(0)}<span className="text-xs font-normal text-gray-400 ml-1">U</span></div>
                  <div className="text-xs text-gray-400 mt-0.5">猜中+未中均计入</div>
                </div>
                {/* 盈亏净额 */}
                <div className="px-4 py-3 border-r border-gray-100">
                  <div className="text-xs text-gray-400 mb-0.5">盈亏净额（用户视角）</div>
                  <div className="text-sm font-bold" style={{ color: summary.totalWonAmount - summary.totalLostAmount >= 0 ? '#D32F2F' : '#388E3C' }}>
                    {summary.totalWonAmount - summary.totalLostAmount >= 0 ? '+' : ''}{(summary.totalWonAmount - summary.totalLostAmount).toFixed(2)} U
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    派奖 {summary.totalWonAmount.toFixed(0)}U · 亏损 {summary.totalLostAmount.toFixed(0)}U
                  </div>
                </div>
                {/* 分佣 */}
                <div className="px-4 py-3">
                  <div className="text-xs text-gray-400 mb-0.5">分佣（流水×10%）</div>
                  <div className="text-lg font-bold" style={{ color: '#B8860B' }}>{summary.commission.toFixed(2)}<span className="text-xs font-normal text-gray-400 ml-1">U</span></div>
                  <div className="text-xs text-gray-400 mt-0.5">= {summary.totalTurnover.toFixed(0)} × 10%</div>
                </div>
              </div>
            </div>
          )}

          {/* 筛选 Tab */}
          <div className="mx-4 mt-3 flex gap-2">
            {(['all', 'won', 'lost', 'pending', 'cancelled'] as FilterStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className="text-xs px-3 py-1 rounded-full font-medium transition-all"
                style={{
                  background: filterStatus === s
                    ? (s === 'won' ? '#D32F2F' : s === 'lost' ? '#388E3C' : s === 'pending' ? '#B8860B' : s === 'cancelled' ? '#9E9E9E' : '#374151')
                    : '#E5E7EB',
                  color: filterStatus === s ? '#fff' : '#6B7280',
                }}
              >
                {s === 'all' ? `全部(${orders.length})` : `${STATUS_LABEL[s].text}(${orders.filter(o => o.status === s).length})`}
              </button>
            ))}
          </div>

          {/* 订单列表 */}
          <div className="mx-4 mt-3 mb-6 space-y-2">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">暂无订单</div>
            ) : (
              filteredOrders.map(order => {
                const statusInfo = STATUS_LABEL[order.status] ?? { text: order.status, color: '#888' };
                const isWon = order.status === 'won';
                const isLost = order.status === 'lost';
                const isCancelled = order.status === 'cancelled';
                return (
                  <div key={order.id} className="rounded-xl overflow-hidden bg-white" style={{ border: '1px solid #EEEEEE' }}>
                    {/* 第一行：用户名 + 状态 + 日期 */}
                    <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-semibold text-gray-800 truncate">{order.userName}</span>
                        {order.username && <span className="text-xs text-gray-400">({order.username})</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-bold" style={{ color: statusInfo.color }}>{statusInfo.text}</span>
                        <span className="text-xs text-gray-400">{order.targetDate}</span>
                      </div>
                    </div>
                    {/* 第二行：币种 + 方向 + 区间 + 金额 */}
                    <div className="flex items-center justify-between px-3 pb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold" style={{ color: order.direction === 'up' ? '#D32F2F' : '#388E3C' }}>
                          {order.coin} {order.direction === 'up' ? '↑涨' : '↓跌'}
                        </span>
                        <span className="text-xs text-gray-500">{order.rangeLabel}</span>
                        <span className="text-xs text-gray-400">@{order.odds.toFixed(2)}x</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500">{order.betAmount.toFixed(0)}U</span>
                        {isWon && (
                          <span className="text-xs font-bold" style={{ color: '#D32F2F' }}>+{order.expectedReturn.toFixed(0)}U</span>
                        )}
                        {isLost && (
                          <span className="text-xs font-bold" style={{ color: '#388E3C' }}>-{order.betAmount.toFixed(0)}U</span>
                        )}
                        {isCancelled && (
                          <span className="text-xs text-gray-400">已退款</span>
                        )}
                      </div>
                    </div>
                    {/* 第三行：订单号 + 结算说明 */}
                    <div className="flex items-center justify-between px-3 pb-2">
                      <span className="text-xs text-gray-300 font-mono">#{order.orderNo || order.id}</span>
                      {order.settleNote && (
                        <span className="text-xs text-gray-400 truncate ml-2" style={{ maxWidth: '60%' }}>{order.settleNote}</span>
                      )}
                      {order.actualChangePct != null && !order.settleNote && (
                        <span className="text-xs text-gray-400">实际{order.actualChangePct >= 0 ? '+' : ''}{order.actualChangePct.toFixed(2)}%</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
