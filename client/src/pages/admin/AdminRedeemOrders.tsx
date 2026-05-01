import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ChevronLeft, Package, Truck, CheckCircle, XCircle, Clock, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StatusFilter = "all" | "pending" | "shipped" | "completed" | "cancelled";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "待发货", color: "text-amber-600 bg-amber-50", icon: Clock },
  shipped: { label: "已发货", color: "text-blue-600 bg-blue-50", icon: Truck },
  completed: { label: "已完成", color: "text-green-600 bg-green-50", icon: CheckCircle },
  cancelled: { label: "已取消", color: "text-gray-500 bg-gray-100", icon: XCircle },
};

export default function AdminRedeemOrders() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [searchKeyword, setSearchKeyword] = useState("");

  // 发货弹窗状态
  const [shipOrderId, setShipOrderId] = useState<number | null>(null);
  const [trackingCompany, setTrackingCompany] = useState("");
  const [trackingNo, setTrackingNo] = useState("");

  // 取消弹窗状态
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: ordersData, isLoading, refetch } = trpc.merchant.adminGetRedeemOrders.useQuery({
    status: statusFilter,
    keyword: searchKeyword.trim() || undefined,
  });
  const orders = ordersData?.orders ?? [];

  const shipMutation = trpc.merchant.adminShipOrder.useMutation({
    onSuccess: () => {
      toast.success("发货成功");
      setShipOrderId(null);
      setTrackingCompany("");
      setTrackingNo("");
      refetch();
    },
    onError: (err) => toast.error(err.message || "发货失败"),
  });

  const cancelMutation = trpc.merchant.adminCancelOrder.useMutation({
    onSuccess: () => {
      toast.success("订单已取消，积分已退还");
      setCancelOrderId(null);
      setCancelReason("");
      refetch();
    },
    onError: (err) => toast.error(err.message || "取消失败"),
  });

  const handleShip = () => {
    if (!trackingNo.trim()) { toast.error("请填写快递单号"); return; }
    if (!shipOrderId) return;
    shipMutation.mutate({
      orderId: shipOrderId,
      trackingCompany: trackingCompany.trim() || undefined,
      trackingNo: trackingNo.trim(),
    });
  };

  const handleCancel = () => {
    if (!cancelOrderId) return;
    cancelMutation.mutate({
      orderId: cancelOrderId,
      cancelReason: cancelReason.trim() || undefined,
    });
  };

  const formatDate = (date: any) => {
    if (!date) return "";
    return new Date(date).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: "pending", label: "待发货" },
    { key: "shipped", label: "已发货" },
    { key: "all", label: "全部" },
    { key: "completed", label: "已完成" },
    { key: "cancelled", label: "已取消" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 flex items-center h-12 px-3">
        <button
          onClick={() => navigate("/admin")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="flex-1 text-center text-sm font-semibold text-gray-800 pr-9">积分兑换订单管理</h1>
      </div>

      {/* 搜索框 */}
      <div className="bg-white px-4 py-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索订单号、收货人、手机号..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* 状态筛选 tab */}
      <div className="bg-white border-b border-gray-100 flex overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === tab.key
                ? "border-[#A80000] text-[#A80000]"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 订单列表 */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#A80000] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="w-16 h-16 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">暂无相关订单</p>
          </div>
        ) : (
          orders.map((order: any) => {
            const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.pending;
            const StatusIcon = statusInfo.icon;
            return (
              <div key={order.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {/* 订单头部 */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <div>
                    <span className="text-xs text-gray-400">订单号：{order.orderNo}</span>
                    {order.username && (
                      <span className="text-xs text-gray-400 ml-2">用户：{order.username}</span>
                    )}
                  </div>
                  <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                  </span>
                </div>

                {/* 商品信息 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {order.productImage ? (
                    <img src={order.productImage} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{order.productName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">x{order.quantity}</p>
                    <p className="text-sm font-bold text-[#A80000] mt-1">{order.pointsSpent.toLocaleString()} 积分</p>
                  </div>
                </div>

                {/* 收货信息 */}
                <div className="px-4 py-2 bg-gray-50 mx-4 rounded-xl mb-3 text-xs text-gray-600 space-y-1">
                  <div className="flex gap-1">
                    <span className="text-gray-400 flex-shrink-0">收货人：</span>
                    <span className="font-medium">{order.recipientName}</span>
                    <span className="ml-1">{order.recipientPhone}</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="text-gray-400 flex-shrink-0">地址：</span>
                    <span className="break-all">
                      {[order.province, order.city, order.district, order.detailedAddress].filter(Boolean).join(" ")}
                    </span>
                  </div>
                  {order.remark && (
                    <div className="flex gap-1">
                      <span className="text-gray-400 flex-shrink-0">备注：</span>
                      <span>{order.remark}</span>
                    </div>
                  )}
                </div>

                {/* 物流信息（已发货时显示） */}
                {order.status === "shipped" && order.trackingNo && (
                  <div className="px-4 py-2 bg-blue-50 mx-4 rounded-xl mb-3 text-xs">
                    <div className="flex items-center gap-1 text-blue-700 font-medium">
                      <Truck className="w-3.5 h-3.5" />
                      {order.trackingCompany && <span>{order.trackingCompany}：</span>}
                      <span className="font-mono">{order.trackingNo}</span>
                    </div>
                    {order.shippedAt && (
                      <p className="text-blue-500 mt-0.5">发货时间：{formatDate(order.shippedAt)}</p>
                    )}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
                  <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
                  <div className="flex gap-2">
                    {order.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-8 text-red-500 border-red-200 hover:bg-red-50"
                          onClick={() => { setCancelOrderId(order.id); setCancelReason(""); }}
                        >
                          取消订单
                        </Button>
                        <Button
                          size="sm"
                          className="text-xs h-8 bg-[#A80000] hover:bg-[#8a0000] text-white"
                          onClick={() => { setShipOrderId(order.id); setTrackingCompany(""); setTrackingNo(""); }}
                        >
                          <Send className="w-3 h-3 mr-1" />
                          发货
                        </Button>
                      </>
                    )}
                    {order.status === "shipped" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8 text-red-500 border-red-200 hover:bg-red-50"
                        onClick={() => { setCancelOrderId(order.id); setCancelReason(""); }}
                      >
                        取消订单
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 发货弹窗 */}
      {shipOrderId !== null && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShipOrderId(null)} />
          <div className="relative bg-white rounded-t-2xl w-full px-4 pt-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">填写快递信息</h3>
              <button onClick={() => setShipOrderId(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <Input
                placeholder="快递公司（如：顺丰、圆通）"
                value={trackingCompany}
                onChange={e => setTrackingCompany(e.target.value)}
              />
              <Input
                placeholder="快递单号 *"
                value={trackingNo}
                onChange={e => setTrackingNo(e.target.value)}
              />
            </div>
            <Button
              className="w-full mt-4 bg-[#A80000] hover:bg-[#8a0000] text-white h-12"
              onClick={handleShip}
              disabled={shipMutation.isPending}
            >
              {shipMutation.isPending ? "提交中..." : "确认发货"}
            </Button>
          </div>
        </div>
      )}

      {/* 取消订单弹窗 */}
      {cancelOrderId !== null && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCancelOrderId(null)} />
          <div className="relative bg-white rounded-t-2xl w-full px-4 pt-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">取消订单</h3>
              <button onClick={() => setCancelOrderId(null)} className="text-gray-400 text-xl">×</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">取消后积分将自动退还给用户</p>
            <Input
              placeholder="取消原因（选填）"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setCancelOrderId(null)}>
                再想想
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? "处理中..." : "确认取消"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
