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

// 权益折扣率映射表（相对于52.5的百分比）
const EQUITY_DISCOUNT_RATES: Record<number, number> = {
  0: 1.0,      // 第0档：100%
  1: 0.6667,   // 第1档：66.67%
  2: 0.4444,   // 第2档：44.44%
  3: 0.3333,   // 第3档：33.33%
  4: 0.2667,   // 第4档：26.67%
  5: 0.2222,   // 第5档：22.22%
  6: 0.1905,   // 第6档：19.05%
  7: 0.1667,   // 第7档：16.67%
  8: 0.1481,   // 第8档：14.81%
  9: 0.1333,   // 第9档：13.33%
};

interface EditState {
  orderId: number;
  limitPrice: string;
  actualSellPrice: string; // 卖单实际成交价（管理员输入）
  amount: string;
  quantity: string;
  status: "pending" | "completed" | "cancelled";
  side: "buy" | "sell"; // 订单方向，用于判断是否显示实际卖出价输入框
}

interface ProfitCalculation {
  coinQuantity: number;
  buyPrice: number;
  sellPrice: number;
  unitProfit: number;
  totalProfit: number;
  totalRefund: number;
  principal: number;
  equityTier: number;
  effectiveQuantity: number;
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

  // 计算卖单的实时利润
  const calculateProfit = (order: any, actualSellPrice: string): ProfitCalculation | null => {
    // 只对卖单计算
    if (order.side !== 'sell' || !order.sourceOrderId) {
      return null;
    }

    const sellPrice = parseFloat(actualSellPrice);
    const buyPrice = parseFloat(order.sourceBuyPrice || '0');
    const coinQuantity = parseFloat(order.sourceQuantity || '0');
    const principal = parseFloat(order.sourcePrincipal || '0');
    const equityTier = order.equityTier || 0;

    if (isNaN(sellPrice) || sellPrice <= 0 || isNaN(buyPrice) || buyPrice <= 0 || isNaN(coinQuantity) || coinQuantity <= 0) {
      return null;
    }

    // 根据权益折扣档位计算有效币数
    // 有效币数 = 原始币数 × 折扣率
    const discountRate = EQUITY_DISCOUNT_RATES[equityTier] || 1.0;
    const effectiveQuantity = coinQuantity * discountRate;

    const unitProfit = sellPrice - buyPrice;
    const totalProfit = effectiveQuantity * unitProfit;
    const totalRefund = principal + Math.max(0, totalProfit);

    return {
      coinQuantity,
      buyPrice,
      sellPrice,
      unitProfit,
      totalProfit,
      totalRefund,
      principal,
      equityTier,
      effectiveQuantity,
    };
  };

  const startEdit = (order: any) => {
    setEditingId(order.id);
    setEditState({
      orderId: order.id,
      limitPrice: order.limitPrice?.toString() ?? "",
      actualSellPrice: "", // 管理员需要输入实际卖出价
      amount: order.amount?.toString() ?? "",
      quantity: order.quantity?.toString() ?? "",
      status: order.status as "pending" | "completed" | "cancelled",
      side: order.side as "buy" | "sell",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  const saveEdit = () => {
    if (!editState) return;
    
    // 如果是卖单且要确认成交，必须输入实际卖出价
    const isConfirmingSell = editState.side === 'sell' && editState.status === 'completed';
    if (isConfirmingSell && !editState.actualSellPrice) {
      toast.error("请输入实际卖出价格");
      return;
    }
    
    // 卖单成交时，用实际卖出价作为 limitPrice（后端用此计算收益）
    const finalLimitPrice = isConfirmingSell ? editState.actualSellPrice : editState.limitPrice;
    
    // 买单：金额(amount)固定不变，数量根据新价格自动重算
    // 卖单：数量是买入时的实际持仓，不重算，直接使用原始数量
    const price = parseFloat(finalLimitPrice);
    const amount = parseFloat(editState.amount);
    let finalQuantity = editState.quantity;
    if (editState.side === 'buy' && !isNaN(price) && !isNaN(amount) && price > 0 && amount > 0) {
      finalQuantity = (amount * 5.25 / price).toFixed(8);
    }
    // 卖单不传 quantity，让后端保持原始持仓量不变
    const submitQuantity = editState.side === 'sell' ? undefined : finalQuantity;
    updateMutation.mutate({
      ledgerId,
      orderId: editState.orderId,
      limitPrice: finalLimitPrice,
      amount: editState.amount,
      quantity: submitQuantity, // 卖单不传quantity，保持原始持仓量
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
              // 计算编辑时的实时数量
              // 买单：amount 是用户实际花费，成交价值 = amount × 5.25，quantity = 成交价值 / 新价格
              // 卖单：数量是买入时的实际持仓，不重算
              let previewQuantity = editState?.quantity ?? "";
              if (isEditing && editState && editState.side === 'buy') {
                const p = parseFloat(editState.limitPrice);
                const a = parseFloat(editState.amount);
                if (!isNaN(p) && !isNaN(a) && p > 0 && a > 0) {
                  previewQuantity = (a * 5.25 / p).toFixed(8);
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
                      {order.isGift && (
                        <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-bold border border-red-200 animate-pulse">
                          赠
                        </span>
                      )}
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
                    {/* 数量（自动重算） */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">数量</span>
                      {isEditing ? (
                        <span className="text-orange-500 font-medium">
                          {previewQuantity || editState!.quantity}
                          <span className="text-xs text-gray-400 ml-1">（自动计算）</span>
                        </span>
                      ) : (
                        <span>{parseFloat(order.quantity).toFixed(6)}</span>
                      )}
                    </div>
                    {/* 金额（固定不变） */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">金额</span>
                      <span>{parseFloat(order.amount).toFixed(2)} USDT</span>
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

                  {/* 赠送订单来源信息 */}
                  {order.isGift && order.sourceUsername && (
                    <div className={`mt-2 text-xs rounded-lg px-3 py-1.5 border ${order.giftMultiplier === '1.0' ? 'text-amber-500 bg-amber-50 border-amber-100' : 'text-red-400 bg-red-50 border-red-100'}`}>
                      {order.giftMultiplier === '1.0' ? '间接推荐奖励订单 (1.0倍)' : '推荐人奖励订单 (1.5倍)'} · 来自 <span className={`font-medium ${order.giftMultiplier === '1.0' ? 'text-amber-600' : 'text-red-500'}`}>{order.sourceUsername}</span>
                    </div>
                  )}
                  
                  {/* 卖单确认成交时：实际卖出价格输入框 + 实时利润计算 */}
                  {isEditing && editState?.side === 'sell' && editState?.status === 'completed' && (
                    <div className="mt-3 space-y-3">
                      {/* 实际卖出价输入框 */}
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <p className="text-xs text-orange-600 font-medium mb-2">★ 确认卖单成交，请输入实际卖出价格</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 whitespace-nowrap">实际卖出价</span>
                          <input
                            type="number"
                            placeholder="输入实际成交价格"
                            value={editState!.actualSellPrice}
                            onChange={(e) => setEditState({ ...editState!, actualSellPrice: e.target.value })}
                            className="border border-orange-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-orange-500"
                          />
                          <span className="text-xs text-gray-400 whitespace-nowrap">USDT</span>
                        </div>
                      </div>

                      {/* 实时利润计算显示 */}
                      {editState!.actualSellPrice && calculateProfit(order, editState!.actualSellPrice) && (() => {
                        const calc = calculateProfit(order, editState!.actualSellPrice)!;
                        return (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                            <p className="text-xs font-medium text-blue-600">实时利润计算</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-gray-600">持币数量</span>
                                <span className="font-medium text-gray-800">{calc.coinQuantity.toFixed(6)} {order.coin}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">买入价</span>
                                <span className="font-medium text-gray-800">{calc.buyPrice.toLocaleString()} USDT</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">卖出价</span>
                                <span className="font-medium text-gray-800">{calc.sellPrice.toLocaleString()} USDT</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">权益折扣档位</span>
                                <span className="font-medium text-amber-600">
                                  {(() => {
                                    const rate = EQUITY_DISCOUNT_RATES[calc.equityTier] || 1.0;
                                    return `${(rate * 100).toFixed(2)}%（第${calc.equityTier}档）`;
                                  })()}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">有效币数</span>
                                <span className="font-medium text-gray-800">{calc.effectiveQuantity.toFixed(6)} {order.coin}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">单位收益</span>
                                <span className={`font-medium ${calc.unitProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {calc.unitProfit >= 0 ? '+' : ''}{calc.unitProfit.toFixed(2)} USDT
                                </span>
                              </div>
                              <div className="col-span-2 border-t border-blue-200 pt-2 mt-1 flex justify-between">
                                <span className="text-gray-600 font-medium">总收益</span>
                                <span className={`font-bold text-base ${calc.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {calc.totalProfit >= 0 ? '+' : ''}{calc.totalProfit.toFixed(4)} USDT
                                </span>
                              </div>
                              <div className="col-span-2 flex justify-between bg-white rounded px-2 py-1.5">
                                <span className="text-gray-700 font-medium">返还金额</span>
                                <span className="font-bold text-green-600 text-base">{calc.totalRefund.toFixed(2)} USDT</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-blue-500 mt-2">
                              本金 + 收益 = {calc.principal.toFixed(2)} + {Math.max(0, calc.totalProfit).toFixed(4)} = {calc.totalRefund.toFixed(2)} USDT
                            </p>
                          </div>
                        );
                      })()}

                      <p className="text-[10px] text-orange-400">系统将根据此价格计算收益并返还本金+收益到用户余额</p>
                    </div>
                  )}
                  
                  {/* 编辑时的余额说明 */}
                  {isEditing && (
                    <div className="mt-3 text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                      {order.side === 'sell' ? (
                        <>
                          <p>· 卖单确认成交：返还本金 + 实际收益到用户余额</p>
                          <p>· 卖单撤单：不动余额（提交时未扣除）</p>
                        </>
                      ) : (
                        <>
                          <p>· 修改状态为「已撤单」：将退回已扣余额</p>
                          <p>· 数量 = 实际投入 × 5.25 / 价格（自动计算）</p>
                        </>
                      )}
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
