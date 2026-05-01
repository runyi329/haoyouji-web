import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ChevronLeft, Package, Truck, CheckCircle, XCircle, Clock, ShoppingBag } from "lucide-react";

type StatusFilter = "all" | "pending" | "shipped" | "completed" | "cancelled";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "待发货", color: "text-amber-600 bg-amber-50", icon: Clock },
  shipped: { label: "已发货", color: "text-blue-600 bg-blue-50", icon: Truck },
  completed: { label: "已完成", color: "text-green-600 bg-green-50", icon: CheckCircle },
  cancelled: { label: "已取消", color: "text-gray-500 bg-gray-100", icon: XCircle },
};

export default function MyRedeemOrders() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: ordersData, isLoading } = trpc.merchant.getMyRedeemOrders.useQuery({
    status: statusFilter,
  });
  const orders = ordersData?.orders ?? [];

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
    { key: "all", label: "全部" },
    { key: "pending", label: "待发货" },
    { key: "shipped", label: "已发货" },
    { key: "completed", label: "已完成" },
    { key: "cancelled", label: "已取消" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 flex items-center h-12 px-3">
        <button
          onClick={() => navigate("/profile")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="flex-1 text-center text-sm font-semibold text-gray-800 pr-9">我的兑换订单</h1>
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
            <ShoppingBag className="w-16 h-16 text-gray-200 mb-3" />
            <p className="text-gray-400 text-sm">暂无兑换订单</p>
            <button
              onClick={() => navigate("/home?tab=shop")}
              className="mt-4 text-[#A80000] text-sm underline"
            >
              去积分商城逛逛
            </button>
          </div>
        ) : (
          orders.map((order: any) => {
            const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.pending;
            const StatusIcon = statusInfo.icon;
            return (
              <div key={order.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                {/* 订单头部 */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                  <span className="text-xs text-gray-400">订单号：{order.orderNo}</span>
                  <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                  </span>
                </div>

                {/* 商品信息 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {order.productImage ? (
                    <img src={order.productImage} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-7 h-7 text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{order.productName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">x{order.quantity}</p>
                    <p className="text-sm font-bold text-[#A80000] mt-1">{order.pointsSpent.toLocaleString()} 积分</p>
                  </div>
                </div>

                {/* 收货信息 */}
                <div className="px-4 py-2 bg-gray-50 mx-4 rounded-xl mb-3 text-xs text-gray-500 space-y-1">
                  <div className="flex gap-1">
                    <span className="text-gray-400 flex-shrink-0">收货人：</span>
                    <span className="text-gray-700">{order.recipientName} {order.recipientPhone}</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="text-gray-400 flex-shrink-0">地址：</span>
                    <span className="text-gray-700 break-all">
                      {[order.province, order.city, order.district, order.detailedAddress].filter(Boolean).join(" ")}
                    </span>
                  </div>
                </div>

                {/* 物流信息（已发货时显示） */}
                {order.status === "shipped" && order.trackingNo && (
                  <div className="px-4 py-2 bg-blue-50 mx-4 rounded-xl mb-3 text-xs">
                    <div className="flex items-center gap-1 text-blue-700">
                      <Truck className="w-3.5 h-3.5" />
                      <span className="font-medium">快递信息</span>
                    </div>
                    <div className="mt-1 text-blue-600">
                      {order.trackingCompany && <span>{order.trackingCompany}：</span>}
                      <span className="font-mono">{order.trackingNo}</span>
                    </div>
                  </div>
                )}

                {/* 订单底部 */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
                  <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
                  {order.remark && (
                    <span className="text-xs text-gray-400 truncate max-w-[60%]">备注：{order.remark}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
