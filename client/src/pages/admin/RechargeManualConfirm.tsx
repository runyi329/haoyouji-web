import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, AlertCircle, Search, ExternalLink } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

export default function RechargeManualConfirm() {
  const [, setLocation] = useLocation();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [txnHash, setTxnHash] = useState("");
  const [actualAmount, setActualAmount] = useState("");

  const utils = trpc.useUtils();

  // 获取所有待处理订单（pending + submitted）
  const pendingOrdersQuery = trpc.recharge.adminGetPendingOrders.useQuery();
  const allOrdersQuery = trpc.recharge.adminGetAllOrders.useQuery({ limit: 50 });

  // 合并pending和submitted状态的订单
  const ordersToConfirm = [
    ...(pendingOrdersQuery.data || []),
    ...(allOrdersQuery.data || []).filter((o: any) => o.status === 'submitted')
  ].filter((order: any, index: number, self: any[]) => 
    // 去重
    index === self.findIndex((o: any) => o.id === order.id)
  ).sort((a: any, b: any) => 
    // 按创建时间倒序
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // 手动确认充值
  const confirmMutation = trpc.recharge.adminConfirmRecharge.useMutation({
    onSuccess: (data) => {
      toast.success(`充值确认成功！用户ID ${data.userId} 已到账 ${data.amount} USDT`);
      setSelectedOrder(null);
      setTxnHash("");
      setActualAmount("");
      utils.recharge.adminGetPendingOrders.invalidate();
      utils.recharge.adminGetAllOrders.invalidate();
      utils.recharge.adminGetSystemStats.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "确认失败");
    },
  });

  const handleConfirm = () => {
    if (!selectedOrder) return;
    if (!txnHash.trim()) {
      toast.error("请输入交易哈希");
      return;
    }
    if (!actualAmount || parseFloat(actualAmount) <= 0) {
      toast.error("请输入实际到账金额");
      return;
    }

    confirmMutation.mutate({
      orderId: selectedOrder.id,
      txnHash: txnHash.trim(),
      actualAmount: parseFloat(actualAmount),
    });
  };

  const handleSelectOrder = (order: any) => {
    setSelectedOrder(order);
    setActualAmount(order.amount);
    setTxnHash("");
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
    pending: { label: '待支付', color: 'text-orange-700', bgColor: 'bg-orange-100' },
    submitted: { label: '确认中', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation("/admin/recharge-monitor")} className="mr-3">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">手动确认充值</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 提示信息 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <p className="font-medium mb-1">使用说明：</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>选择需要确认的订单</li>
            <li>到区块链浏览器查询交易哈希</li>
            <li>填写交易哈希和实际到账金额</li>
            <li>点击"确认充值"完成操作</li>
          </ol>
        </div>

        {/* 待确认订单列表 */}
        <div className="bg-white rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">待确认订单 ({ordersToConfirm.length})</h2>
          </div>

          {ordersToConfirm.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p>暂无待确认订单</p>
            </div>
          ) : (
            <div className="divide-y">
              {ordersToConfirm.map((order: any) => {
                const config = statusConfig[order.status] || statusConfig.pending;
                const isSelected = selectedOrder?.id === order.id;
                
                return (
                  <div
                    key={order.id}
                    onClick={() => handleSelectOrder(order)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{order.amount} USDT</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{order.network}</span>
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>订单号: {order.orderNo}</div>
                      <div>用户ID: {order.userId}</div>
                      <div>创建时间: {formatDate(order.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 确认表单 */}
        {selectedOrder && (
          <div className="bg-white rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="font-semibold text-gray-900">确认订单</h3>
              <button
                onClick={() => {
                  setSelectedOrder(null);
                  setTxnHash("");
                  setActualAmount("");
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                取消
              </button>
            </div>

            {/* 订单信息 */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">订单号</span>
                <span className="font-mono text-xs">{selectedOrder.orderNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">订单金额</span>
                <span className="font-medium">{selectedOrder.amount} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">用户ID</span>
                <span className="font-medium">{selectedOrder.userId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">网络</span>
                <span className="font-medium">{selectedOrder.network}</span>
              </div>
            </div>

            {/* 区块链浏览器链接 */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start">
                <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
                <div className="flex-1 text-sm text-yellow-800">
                  <p className="font-medium mb-1">查询交易记录</p>
                  <a
                    href={`https://tronscan.org/#/address/TTHZ7NvpKSMCyU3JNLLN6zZNruysy5emQJ`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-blue-600 hover:underline"
                  >
                    在 TronScan 查看收款地址
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                </div>
              </div>
            </div>

            {/* 交易哈希 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                交易哈希 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={txnHash}
                onChange={(e) => setTxnHash(e.target.value)}
                placeholder="粘贴区块链交易哈希"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
              />
            </div>

            {/* 实际到账金额 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                实际到账金额 (USDT) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.0001"
                value={actualAmount}
                onChange={(e) => setActualAmount(e.target.value)}
                placeholder="输入实际到账金额"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                如果金额与订单金额不同（如扣除了手续费），请填写实际到账金额
              </p>
            </div>

            {/* 确认按钮 */}
            <button
              onClick={handleConfirm}
              disabled={confirmMutation.isPending}
              className="w-full py-3 bg-[#D32F2F] text-white rounded-lg font-medium hover:bg-[#B71C1C] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {confirmMutation.isPending ? "处理中..." : "确认充值"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
