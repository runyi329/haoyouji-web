import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: "委托中", color: "text-yellow-500" },
  completed: { label: "已成交", color: "text-green-500" },
  cancelled: { label: "已撤单", color: "text-gray-400" },
};

interface EditState {
  orderId: number;
  limitPrice: string;
  amount: string;
  quantity: string;
  status: "pending" | "completed" | "cancelled";
}

export default function AfOrderManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  const utils = trpc.useUtils();
  const { data: orders, isLoading } = trpc.ledger.afAdminGetOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  const updateMutation = trpc.ledger.afAdminUpdateOrder.useMutation({
    onSuccess: () => {
      toast.success("订单已更新");
      setEditingId(null);
      setEditState(null);
      utils.ledger.afAdminGetOrders.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("更新失败：" + e.message),
  });

  const startEdit = (order: any) => {
    setEditingId(order.id);
    setEditState({
      orderId: order.id,
      limitPrice: order.limitPrice?.toString() ?? "",
      amount: order.amount?.toString() ?? "",
      quantity: order.quantity?.toString() ?? "",
      status: order.status as "pending" | "completed" | "cancelled",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  const saveEdit = () => {
    if (!editState) return;
    // 自动重算金额（价格 × 数量）
    const price = parseFloat(editState.limitPrice);
    const qty = parseFloat(editState.quantity);
    let finalAmount = editState.amount;
    if (!isNaN(price) && !isNaN(qty) && price > 0 && qty > 0) {
      finalAmount = (price * qty).toFixed(2);
    }
    updateMutation.mutate({
      ledgerId,
      orderId: editState.orderId,
      limitPrice: editState.limitPrice,
      amount: finalAmount,
      quantity: editState.quantity,
      status: editState.status,
    });
  };

  const formatDate = (d: any) => {
    if (!d) return "-";
    const dt = new Date(d);
    return `${(dt.getMonth() + 1).toString().padStart(2, "0")}-${dt.getDate().toString().padStart(2, "0")} ${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="mr-3">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="text-lg font-semibold">订单管理</h1>
        </div>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无订单记录</div>
        ) : (
          <div className="space-y-3">
            {(orders as any[]).map((order) => {
              const isEditing = editingId === order.id;
              const statusInfo = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
              // 计算编辑时的实时金额
              let previewAmount = editState?.amount ?? "";
              if (isEditing && editState) {
                const p = parseFloat(editState.limitPrice);
                const q = parseFloat(editState.quantity);
                if (!isNaN(p) && !isNaN(q) && p > 0 && q > 0) {
                  previewAmount = (p * q).toFixed(2);
                }
              }

              return (
                <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm">
                  {/* 用户信息行 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {order.nickname || order.username || `用户${order.userId}`}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(order.createdAt)}</span>
                    </div>
                    {!isEditing ? (
                      <button
                        onClick={() => startEdit(order)}
                        className="flex items-center gap-1 text-xs text-blue-500 border border-blue-200 rounded-lg px-2 py-1"
                      >
                        <Pencil className="w-3 h-3" /> 编辑
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={updateMutation.isPending}
                          className="flex items-center gap-1 text-xs text-white bg-green-500 rounded-lg px-2 py-1"
                        >
                          <Check className="w-3 h-3" /> 保存
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="flex items-center gap-1 text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1"
                        >
                          <X className="w-3 h-3" /> 取消
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 订单信息 */}
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                    {/* 币种 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">币种</span>
                      <span className="font-medium">{order.coin}</span>
                    </div>
                    {/* 方向 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">方向</span>
                      <span className={order.side === "buy" ? "text-green-500 font-medium" : "text-red-500 font-medium"}>
                        {order.side === "buy" ? "委买" : "委卖"}
                      </span>
                    </div>
                    {/* 价格 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">价格</span>
                      {isEditing ? (
                        <input
                          type="number"
                          value={editState!.limitPrice}
                          onChange={(e) => setEditState({ ...editState!, limitPrice: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-0.5 text-sm w-28"
                        />
                      ) : (
                        <span>{parseFloat(order.limitPrice).toLocaleString()}</span>
                      )}
                    </div>
                    {/* 数量 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">数量</span>
                      {isEditing ? (
                        <input
                          type="number"
                          value={editState!.quantity}
                          onChange={(e) => setEditState({ ...editState!, quantity: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-0.5 text-sm w-28"
                        />
                      ) : (
                        <span>{parseFloat(order.quantity).toFixed(6)}</span>
                      )}
                    </div>
                    {/* 金额 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">金额</span>
                      {isEditing ? (
                        <span className="text-orange-500 font-medium">
                          {previewAmount || editState!.amount} USDT
                          <span className="text-xs text-gray-400 ml-1">（自动计算）</span>
                        </span>
                      ) : (
                        <span>{parseFloat(order.amount).toFixed(2)} USDT</span>
                      )}
                    </div>
                    {/* 状态 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">状态</span>
                      {isEditing ? (
                        <select
                          value={editState!.status}
                          onChange={(e) => setEditState({ ...editState!, status: e.target.value as any })}
                          className="border border-gray-300 rounded px-2 py-0.5 text-sm"
                        >
                          <option value="pending">委托中</option>
                          <option value="completed">已成交</option>
                          <option value="cancelled">已撤单</option>
                        </select>
                      ) : (
                        <span className={`font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                      )}
                    </div>
                  </div>

                  {/* 编辑时的余额说明 */}
                  {isEditing && (
                    <div className="mt-3 text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                      <p>· 修改状态为「已撤单」：{order.side === "buy" ? "将退回已扣余额" : "将扣回已加余额"}</p>
                      <p>· 修改金额参数：差额将以「调剂」记录体现在充值明细中</p>
                      <p>· 金额 = 价格 × 数量（自动计算）</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
