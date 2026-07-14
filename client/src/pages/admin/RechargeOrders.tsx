import { useLocation } from "wouter";
import { ArrowLeft, Clock, CheckCircle2, XCircle, RefreshCw, ExternalLink, Trash2 } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

export default function RechargeOrders() {
  const [, setLocation] = useLocation();
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const ordersQuery = trpc.recharge.adminGetAllOrders.useQuery({ limit: 100 }, {
    refetchInterval: 30000,
  });

  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const [showBulkClearConfirm, setShowBulkClearConfirm] = useState(false);

  const bulkClearMutation = trpc.recharge.adminBulkClearOrders.useMutation({
    onSuccess: (res) => {
      toast.success(`已清除 ${res.count} 条记录`);
      setShowBulkClearConfirm(false);
      ordersQuery.refetch();
    },
    onError: (e) => toast.error(e.message || "清除失败"),
  });

  const cancelMutation = trpc.recharge.adminCancelOrder.useMutation({
    onSuccess: () => {
      toast.success("订单已取消");
      setShowCancelConfirm(false);
      setCancelTarget(null);
      ordersQuery.refetch();
    },
    onError: (e) => toast.error(e.message || "取消失败"),
  });

  const orders = ordersQuery.data || [];

  // 按状态筛选
  const filteredOrders = filterStatus === "all" 
    ? orders 
    : orders.filter((o: any) => o.status === filterStatus);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
    pending: { label: '待支付', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: Clock },
    submitted: { label: '确认中', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
    completed: { label: '已完成', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
    expired: { label: '已过期', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: XCircle },
    cancelled: { label: '已取消', color: 'text-red-600', bgColor: 'bg-red-100', icon: XCircle },
  };

  // 统计各状态数量
  const statusCounts = orders.reduce((acc: any, order: any) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button onClick={() => window.history.back()} className="mr-3">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold">所有订单</h1>
          </div>
          <button
            onClick={() => ordersQuery.refetch()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${ordersQuery.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 状态筛选 */}
        <div className="bg-white rounded-lg p-3">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === "all"
                  ? "bg-[#D32F2F] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              全部 ({orders.length})
            </button>
            {Object.entries(statusConfig).map(([status, config]) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-2 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterStatus === status
                    ? "bg-[#D32F2F] text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {config.label} ({statusCounts[status] || 0})
              </button>
            ))}
          </div>
        </div>

        {/* 一键清除按钮（已过期/已取消时显示） */}
        {(filterStatus === 'expired' || filterStatus === 'cancelled') && filteredOrders.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={() => setShowBulkClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              一键清除 ({filteredOrders.length} 条)
            </button>
          </div>
        )}

        {/* 订单列表 */}
        <div className="bg-white rounded-lg overflow-hidden">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p>暂无订单</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredOrders.map((order: any) => {
                const config = statusConfig[order.status] || statusConfig.pending;
                const StatusIcon = config.icon;

                return (
                  <div key={order.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{Number(order.amount).toFixed(4)} USDT</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {config.label}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{order.network}</span>
                    </div>

                    <div className="space-y-0.5 text-xs text-gray-500">
                      <div className="flex justify-between">
                        <span>订单号</span>
                        <span className="font-mono">{order.orderNo}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>用户ID</span>
                        <span>{order.userId}</span>
                      </div>
                      {order.walletAddress && (
                        <div className="flex justify-between items-center">
                          <span>收款地址</span>
                          <span className="font-mono text-gray-700">{order.walletAddress.slice(0, 8)}...{order.walletAddress.slice(-6)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>创建时间</span>
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                      {order.completedAt && (
                        <div className="flex justify-between">
                          <span>完成时间</span>
                          <span>{formatDate(order.completedAt)}</span>
                        </div>
                      )}
                      {order.txnHash && (
                        <div className="flex justify-between items-center">
                          <span>交易哈希</span>
                          <a
                            href={`https://tronscan.org/#/transaction/${order.txnHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-blue-600 hover:underline flex items-center"
                          >
                            {order.txnHash.slice(0, 8)}...{order.txnHash.slice(-6)}
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* 待确认/确认中订单操作按钮 */}
                    {(order.status === 'pending' || order.status === 'submitted') && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => setLocation("/admin/recharge/manual-confirm")}
                          className="flex-1 py-1.5 text-xs text-[#D32F2F] border border-[#D32F2F] rounded-lg hover:bg-red-50 transition-colors"
                        >
                          手动确认
                        </button>
                        <button
                          onClick={() => { setCancelTarget(order); setShowCancelConfirm(true); }}
                          className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          取消订单
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 批量清除确认弹窗 */}
      {showBulkClearConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认一键清除</h3>
            <p className="text-sm text-gray-500 mb-4">
              将删除所有「{filterStatus === 'expired' ? '已过期' : '已取消'}」订单，共 {filteredOrders.length} 条，操作不可恢复。
            </p>
            <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-4">删除后数据将永久移除，请确认。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkClearConfirm(false)}
                className="flex-1 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-xl"
              >
                取消
              </button>
              <button
                onClick={() => bulkClearMutation.mutate({ status: filterStatus })}
                disabled={bulkClearMutation.isPending}
                className="flex-1 py-2.5 text-sm text-white bg-red-600 rounded-xl disabled:opacity-50"
              >
                {bulkClearMutation.isPending ? "清除中..." : "确认清除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 取消订单确认弹窗 */}
      {showCancelConfirm && cancelTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认取消订单</h3>
            <p className="text-sm text-gray-500 mb-1">订单号：{cancelTarget.orderNo}</p>
            <p className="text-sm text-gray-500 mb-4">金额：{cancelTarget.amount} USDT</p>
            <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-4">取消后订单状态将变为"已取消"，无法恢复，请确认。</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelTarget(null); }}
                className="flex-1 py-2.5 text-sm text-gray-700 border border-gray-300 rounded-xl"
              >
                不取消
              </button>
              <button
                onClick={() => cancelMutation.mutate({ id: cancelTarget.id })}
                disabled={cancelMutation.isPending}
                className="flex-1 py-2.5 text-sm text-white bg-red-600 rounded-xl disabled:opacity-50"
              >
                {cancelMutation.isPending ? "取消中..." : "确认取消"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
