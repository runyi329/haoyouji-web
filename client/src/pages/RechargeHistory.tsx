import { useLocation, useSearch } from "wouter";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Wallet, Clock, ArrowDownCircle } from "lucide-react";
import { trpc } from "../lib/trpc";

export default function RechargeHistory() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const fromLedgerId = searchParams.get('ledgerId');
  const ledgerId = fromLedgerId ? parseInt(fromLedgerId) : null;
  const backToRecharge = fromLedgerId
    ? `/recharge?from=ledger&ledgerId=${fromLedgerId}`
    : '/recharge';

  // 如果是从 AF 账本进来，使用合并接口；否则使用普通接口
  const afHistoryQuery = trpc.ledger.afGetMyRechargeHistory.useQuery(
    { ledgerId: ledgerId! },
    { enabled: !!ledgerId }
  );
  const normalOrdersQuery = trpc.recharge.getMyOrders.useQuery(
    { limit: 50 },
    { enabled: !ledgerId }
  );
  const balanceQuery = trpc.recharge.getBalance.useQuery();

  // 格式化时间
  const formatDate = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  // 订单状态配置（普通模式用）
  const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
    pending: { label: '待支付', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: Clock },
    submitted: { label: '确认中', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
    completed: { label: '充值成功', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
    expired: { label: '已过期', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: XCircle },
    cancelled: { label: '已取消', color: 'text-red-600', bgColor: 'bg-red-100', icon: XCircle },
  };

  const isAFMode = !!ledgerId;
  const isLoading = isAFMode ? afHistoryQuery.isLoading : normalOrdersQuery.isLoading;
  const afData = afHistoryQuery.data || [];
  const normalData = normalOrdersQuery.data || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation(backToRecharge)} className="mr-3">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">充值记录</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 当前余额 */}
        <div className="bg-gradient-to-r from-[#D32F2F] to-[#E57373] rounded-lg p-5 text-white">
          <div className="flex items-center mb-1">
            <Wallet className="w-4 h-4 mr-2" />
            <span className="text-sm opacity-90">当前余额</span>
          </div>
          <div className="text-2xl font-bold">
            {balanceQuery.data?.toFixed(2) || '0.00'} USDT
          </div>
        </div>

        {/* AF 模式：合并记录列表 */}
        {isAFMode && (
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-gray-900">充值明细</h2>
              <p className="text-xs text-gray-400 mt-0.5">包含充值到账及系统结算</p>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-gray-500">加载中...</div>
            ) : afData.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">暂无充值记录</p>
                <button
                  onClick={() => setLocation(backToRecharge)}
                  className="mt-4 px-6 py-2 bg-[#D32F2F] text-white rounded-lg text-sm"
                >
                  去充值
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {afData.map((item: any) => {
                  const isRecharge = item.sourceType === 'recharge';
                  return (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          {isRecharge && (
                            <ArrowDownCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          )}
                          <span className="font-medium text-gray-900">
                            +{item.amount.toFixed(2)} USDT
                          </span>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          isRecharge
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          {isRecharge ? '充值到账' : '系统结算'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>{isRecharge ? (item.note || '-') : ''}</span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 普通模式：充值订单列表 */}
        {!isAFMode && (
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h2 className="font-semibold text-gray-900">充值订单</h2>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-gray-500">加载中...</div>
            ) : normalData.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">暂无充值记录</p>
                <button
                  onClick={() => setLocation(backToRecharge)}
                  className="mt-4 px-6 py-2 bg-[#D32F2F] text-white rounded-lg text-sm"
                >
                  去充值
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {normalData.map((order: any) => {
                  const config = statusConfig[order.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <div key={order.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center">
                          <span className="font-medium text-gray-900">{order.amount} USDT</span>
                          <span className="text-xs text-gray-400 ml-2">{order.network}</span>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>订单号: {order.orderNo}</span>
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                      {order.txnHash && (
                        <div className="text-xs text-gray-400 mt-1 truncate">
                          交易哈希: {order.txnHash}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
