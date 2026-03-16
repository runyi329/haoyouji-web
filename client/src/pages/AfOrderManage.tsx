import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// 综合状态标签（买入状态 + 卖出状态）
const getStatusDisplay = (order: any) => {
  if (order.sellStatus === 'sold') return { label: '已卖出', color: 'text-gray-500' };
  if (order.sellStatus === 'selling') return { label: '委卖中', color: 'text-red-500' };
  if (order.status === 'completed') return { label: '持仓中', color: 'text-green-500' };
  if (order.status === 'cancelled') return { label: '已撤单', color: 'text-gray-400' };
  return { label: '委买中', color: 'text-yellow-500' };
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
  limitPrice: string;      // 买入委托价
  actualSellPrice: string; // 管理员输入的实际卖出价
  amount: string;
  quantity: string;
  status: "pending" | "completed" | "cancelled";
  sellStatus: string | null; // selling / sold / sell_cancelled / null
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
  managementFee: number;
  actualRefund: number;
  holdDays: number;
  dailyFee: number;
}

export default function AfOrderManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  const utils = trpc.useUtils();
  const { data: stats } = trpc.ledger.afAdminGetStats.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const { data: orders, isLoading } = trpc.ledger.afAdminGetOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 查询当前编辑订单的扣档记录（直接用订单ID，不再需要sourceOrderId）
  const editingOrder = orders?.find((o: any) => o.id === editingId);
  const { data: tierHistoryData } = trpc.ledger.afAdminGetTierHistory.useQuery(
    { ledgerId, orderId: editingId! },
    { enabled: !!ledgerId && !!editingId && editingOrder?.status === 'completed' }
  );
  const tierHistory = tierHistoryData?.list;
  const lowestScan = tierHistoryData?.lowestScan;

  const updateMutation = trpc.ledger.afAdminUpdateOrder.useMutation({
    onSuccess: () => {
      toast.success("订单已更新");
      setEditingId(null);
      setEditState(null);
      utils.ledger.afAdminGetOrders.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("更新失败：" + e.message),
  });

  // 计算卖出的实时利润（从同一订单取买入信息）
  const calculateProfit = (order: any, actualSellPrice: string): ProfitCalculation | null => {
    const sellPrice = parseFloat(actualSellPrice);
    const buyPrice = parseFloat(order.limitPrice || '0');
    const coinQuantity = parseFloat(order.quantity || '0');
    const principal = parseFloat(order.amount || '0');
    const equityTier = order.equityTier || 0;

    if (isNaN(sellPrice) || sellPrice <= 0 || isNaN(buyPrice) || buyPrice <= 0 || isNaN(coinQuantity) || coinQuantity <= 0) {
      return null;
    }

    // 根据权益折扣档位计算有效币数
    const discountRate = EQUITY_DISCOUNT_RATES[equityTier] || 1.0;
    const effectiveQuantity = coinQuantity * discountRate;

    const unitProfit = sellPrice - buyPrice;
    const totalProfit = effectiveQuantity * unitProfit;
    const totalRefund = principal + Math.max(0, totalProfit);

    // 管理费计算
    const isGiftOrder = order.isGift === true || order.isGift === 1;
    const tradeValue = isGiftOrder ? principal : principal * 5.25;
    const dailyFee = tradeValue / 0.75 * 0.12 / 365;
    const confirmedDate = order.updatedAt ? new Date(order.updatedAt) : new Date(order.createdAt);
    const confirmedDay = new Date(confirmedDate.getFullYear(), confirmedDate.getMonth(), confirmedDate.getDate());
    const todayDay = new Date();
    todayDay.setHours(0, 0, 0, 0);
    const holdDays = Math.max(1, Math.floor((todayDay.getTime() - confirmedDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const managementFee = dailyFee * holdDays;
    const actualRefund = Math.max(0, totalRefund - managementFee);

    return {
      coinQuantity, buyPrice, sellPrice, unitProfit, totalProfit, totalRefund,
      principal, equityTier, effectiveQuantity, managementFee, actualRefund, holdDays, dailyFee,
    };
  };

  const startEdit = (order: any) => {
    setEditingId(order.id);
    setEditState({
      orderId: order.id,
      limitPrice: order.limitPrice?.toString() ?? "",
      actualSellPrice: order.sellPrice?.toString() ?? "",
      amount: order.amount?.toString() ?? "",
      quantity: order.quantity?.toString() ?? "",
      status: order.status as "pending" | "completed" | "cancelled",
      sellStatus: order.sellStatus || null,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  const saveEdit = () => {
    if (!editState) return;
    
    // 如果要确认卖出成交，必须输入实际卖出价
    const isConfirmingSellComplete = editState.sellStatus === 'sold';
    if (isConfirmingSellComplete && !editState.actualSellPrice) {
      toast.error("请输入实际卖出价格");
      return;
    }
    
    // 买单：金额(amount)固定不变，数量根据新价格自动重算
    const price = parseFloat(editState.limitPrice);
    const amount = parseFloat(editState.amount);
    let finalQuantity = editState.quantity;
    if (!isNaN(price) && !isNaN(amount) && price > 0 && amount > 0) {
      finalQuantity = (amount * 5.25 / price).toFixed(8);
    }

    updateMutation.mutate({
      ledgerId,
      orderId: editState.orderId,
      limitPrice: editState.limitPrice,
      amount: editState.amount,
      quantity: finalQuantity,
      status: editState.status,
      // 卖出相关
      sellStatus: editState.sellStatus || undefined,
      sellPrice: isConfirmingSellComplete ? editState.actualSellPrice : undefined,
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
        {/* 统计容器 */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-100">
              <p className="text-xs text-gray-400 mb-2">累计订单</p>
              <p className="text-2xl font-bold text-gray-800">{stats.orders.totalCount}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">普通订单</span>
                  <span className="font-medium text-blue-600">{stats.orders.normalCount} 笔</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">赠送订单</span>
                  <span className="font-medium text-red-500">{stats.orders.giftCount} 笔</span>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-purple-100">
              <p className="text-xs text-gray-400 mb-2">管理费</p>
              <p className="text-2xl font-bold text-purple-700">{stats.fees.totalFee.toFixed(2)}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">进行中</span>
                  <span className="font-medium text-orange-500">{stats.fees.ongoingFee.toFixed(2)} U</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">已结清</span>
                  <span className="font-medium text-green-600">{stats.fees.settledFee.toFixed(2)} U</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无订单记录</div>
        ) : (
          <div className="space-y-3">
            {(orders as any[]).map((order) => {
              const isEditing = editingId === order.id;
              const statusDisplay = getStatusDisplay(order);
              // 计算编辑时的实时数量
              let previewQuantity = editState?.quantity ?? "";
              if (isEditing && editState) {
                const p = parseFloat(editState.limitPrice);
                const a = parseFloat(editState.amount);
                if (!isNaN(p) && !isNaN(a) && p > 0 && a > 0) {
                  previewQuantity = (a * 5.25 / p).toFixed(8);
                }
              }

              // 生成订单编号
              const orderDate = new Date(order.createdAt);
              const yy = String(orderDate.getFullYear()).slice(2);
              const mm = String(orderDate.getMonth() + 1).padStart(2, '0');
              const dd = String(orderDate.getDate()).padStart(2, '0');
              const orderNo = `AF${yy}${mm}${dd}${String(order.id).padStart(6, '0')}`;

              return (
                <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm">
                  {/* 订单编号行 */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono text-gray-400 tracking-wide">{orderNo}</span>
                    <span className="text-[11px] text-gray-400">{formatDate(order.createdAt)}</span>
                  </div>
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
                    {/* 状态（综合买入+卖出状态） */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">状态</span>
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <select
                            value={editState!.status}
                            onChange={(e) => setEditState({ ...editState!, status: e.target.value as any })}
                            className="border border-gray-300 rounded px-2 py-0.5 text-xs"
                          >
                            <option value="pending">委买中</option>
                            <option value="completed">买入成交</option>
                            <option value="cancelled">已撤单</option>
                          </select>
                          {editState!.status === 'completed' && (
                            <select
                              value={editState!.sellStatus || ''}
                              onChange={(e) => setEditState({ ...editState!, sellStatus: e.target.value || null })}
                              className="border border-gray-300 rounded px-2 py-0.5 text-xs"
                            >
                              <option value="">持仓中</option>
                              <option value="selling">委卖中</option>
                              <option value="sold">已卖出</option>
                            </select>
                          )}
                        </div>
                      ) : (
                        <span className={`font-medium ${statusDisplay.color}`}>{statusDisplay.label}</span>
                      )}
                    </div>
                    {/* 买入委托价 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">买入价</span>
                      {isEditing && editState!.status === 'pending' ? (
                        <input
                          type="number"
                          value={editState!.limitPrice}
                          onChange={(e) => setEditState({ ...editState!, limitPrice: e.target.value })}
                          className="border border-gray-300 rounded px-2 py-0.5 text-sm w-24"
                        />
                      ) : (
                        <span className="font-medium text-gray-900">
                          {parseFloat(isEditing ? editState!.limitPrice : order.limitPrice).toLocaleString()} USDT
                        </span>
                      )}
                    </div>
                    {/* 数量 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">数量</span>
                      <span className="font-medium text-gray-900">
                        {(() => {
                          const raw = isEditing ? (previewQuantity || editState!.quantity) : order.quantity;
                          const num = parseFloat(raw);
                          const trimmed = isNaN(num) ? raw : num.toFixed(8).replace(/\.?0+$/, '');
                          return `${trimmed} ${order.coin}`;
                        })()}
                      </span>
                    </div>
                    {/* 实际金额 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 text-xs w-10">实际金额</span>
                      <span>{parseFloat(order.amount).toFixed(2)} USDT</span>
                    </div>
                    {/* 订单价值 */}
                    {(() => {
                      const amount = parseFloat(order.amount);
                      const tradeValue = order.isGift ? amount : amount * 5.25;
                      return (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs w-10">订单价值</span>
                          <span className="text-blue-600 font-medium">{tradeValue.toFixed(2)} USDT</span>
                        </div>
                      );
                    })()}
                    {/* 卖出价格（委卖中或已卖出时显示） */}
                    {(order.sellStatus === 'selling' || order.sellStatus === 'sold') && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs w-10">卖出价</span>
                        <span className="font-medium text-red-500">
                          {parseFloat(order.sellPrice).toLocaleString()} USDT
                        </span>
                      </div>
                    )}
                    {/* 卖出时间（已卖出时显示） */}
                    {order.sellStatus === 'sold' && order.sellConfirmedAt && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs w-10">卖出时间</span>
                        <span className="text-xs text-gray-500">{formatDate(order.sellConfirmedAt)}</span>
                      </div>
                    )}
                    {/* 当前权益 */}
                    {order.status === 'completed' && (() => {
                      const rate = EQUITY_DISCOUNT_RATES[order.equityTier] || 1.0;
                      const pct = (rate * 100).toFixed(2);
                      const tierLabel = order.equityTier === 0 ? 'D0档' : `D${order.equityTier}档`;
                      return (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs w-10">当前权益</span>
                          <span className="text-amber-600 font-medium">{pct}% <span className="text-xs text-gray-400">({tierLabel})</span></span>
                        </div>
                      );
                    })()}
                    {/* 累计管理费 */}
                    {order.status === 'completed' && (() => {
                      const amount = parseFloat(order.amount);
                      const tradeValue = order.isGift ? amount : amount * 5.25;
                      const dailyFee = tradeValue / 0.75 * 0.12 / 365;
                      const confirmedDate = new Date(order.updatedAt || order.createdAt);
                      const confirmedDay = new Date(confirmedDate.getFullYear(), confirmedDate.getMonth(), confirmedDate.getDate());
                      const todayDay = new Date(); todayDay.setHours(0,0,0,0);
                      const holdDays = Math.max(1, Math.floor((todayDay.getTime() - confirmedDay.getTime()) / (1000*60*60*24)) + 1);
                      const totalFee = dailyFee * holdDays;
                      return (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400 text-xs w-10">累计管理费</span>
                          <span className="text-purple-600 font-medium">{totalFee.toFixed(4)} USDT <span className="text-xs text-gray-400">({holdDays}天 · {dailyFee.toFixed(4)}/天)</span></span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 赠送订单来源信息 */}
                  {order.isGift && order.sourceUsername && (
                    <div className={`mt-2 text-xs rounded-lg px-3 py-1.5 border ${order.giftMultiplier === '1.0' ? 'text-amber-500 bg-amber-50 border-amber-100' : 'text-red-400 bg-red-50 border-red-100'}`}>
                      {order.giftMultiplier === '1.0' ? '间接推荐奖励订单 (1.0倍)' : '推荐人奖励订单 (1.5倍)'} · 来自 <span className={`font-medium ${order.giftMultiplier === '1.0' ? 'text-amber-600' : 'text-red-500'}`}>{order.sourceUsername}</span>
                    </div>
                  )}

                  {/* 编辑时：确认卖出成交 → 输入实际卖出价 + 实时利润计算 */}
                  {isEditing && editState?.sellStatus === 'sold' && (
                    <div className="mt-3 space-y-3">
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <p className="text-xs text-orange-600 font-medium mb-2">确认卖出成交，请输入实际卖出价格</p>
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

                      {/* 实时利润计算 */}
                      {editState!.actualSellPrice && calculateProfit(order, editState!.actualSellPrice) && (() => {
                        const calc = calculateProfit(order, editState!.actualSellPrice)!;
                        return (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                            <p className="text-xs font-medium text-blue-600">实时利润计算</p>
                            <div className="space-y-1.5 text-xs">
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
                                    const tierName = calc.equityTier === 0 ? 'D0档（基准档）' : `D${calc.equityTier}档（跌${calc.equityTier * 10}%）`;
                                    return `${(rate * 100).toFixed(2)}% · ${tierName}`;
                                  })()}
                                </span>
                              </div>
                              {/* 扣档历史记录 + 历史最低扫描价 */}
                              <div className="bg-amber-50 border border-amber-200 rounded p-2 mt-1">
                                <p className="text-[10px] text-amber-600 font-medium mb-1">扣档触发记录</p>
                                {tierHistory && tierHistory.length > 0 ? (
                                  tierHistory.map((t: any) => {
                                    const dt = new Date(t.triggeredAt);
                                    const dateStr = `${dt.getMonth()+1}月${dt.getDate()}日 ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`;
                                    return (
                                      <div key={t.tier} className="flex justify-between text-[10px] text-amber-700 py-0.5">
                                        <span>D{t.tier}档触发 · 第{t.scanCount}次扫描 · {dateStr}</span>
                                        <span className="font-medium">{parseFloat(t.triggerPrice).toLocaleString()} USDT</span>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-[10px] text-amber-500 py-0.5">未触发任何扣档，当前为D0基准档</div>
                                )}
                                {lowestScan ? (
                                  <div className="mt-1.5 pt-1.5 border-t border-amber-200">
                                    <div className="flex justify-between text-[10px] text-gray-500 py-0.5">
                                      <span>历史最低扫描价 · 第{lowestScan.scanCount}次扫描 · {(() => { const dt = new Date(lowestScan.scannedAt); return `${dt.getMonth()+1}月${dt.getDate()}日 ${dt.getHours().toString().padStart(2,'0')}:${dt.getMinutes().toString().padStart(2,'0')}`; })()}</span>
                                      <span className="font-semibold text-gray-700">{parseFloat(lowestScan.price).toLocaleString()} USDT</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-1.5 pt-1.5 border-t border-amber-200 text-[10px] text-gray-400">暂无扫描记录</div>
                                )}
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
                              <div className="border-t border-blue-200 pt-2 mt-1 flex justify-between">
                                <span className="text-gray-600 font-medium">总收益</span>
                                <span className={`font-bold text-base ${calc.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {calc.totalProfit >= 0 ? '+' : ''}{calc.totalProfit.toFixed(4)} USDT
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">本金+收益小计</span>
                                <span className="font-medium text-gray-800">{calc.totalRefund.toFixed(4)} USDT</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-red-500">管理费扣除 ({calc.holdDays}天)</span>
                                <span className="font-medium text-red-500">- {calc.managementFee.toFixed(4)} USDT</span>
                              </div>
                              <div className="text-[10px] text-red-400">
                                {(() => {
                                  const startDate = new Date(order.updatedAt || order.createdAt);
                                  const endDate = new Date();
                                  const fmt = (d: Date) => `${d.getMonth()+1}月${d.getDate()}日`;
                                  return `计费区间：${fmt(startDate)} → ${fmt(endDate)}（共${calc.holdDays}天，${calc.dailyFee.toFixed(4)} USDT/天）`;
                                })()}
                              </div>
                              <div className="flex justify-between bg-green-50 rounded px-2 py-1.5 border border-green-200">
                                <span className="text-green-700 font-bold">实际到账</span>
                                <span className="font-bold text-green-600 text-base">{calc.actualRefund.toFixed(4)} USDT</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-blue-500 mt-2">
                              本金 + 收益 - 管理费 = {calc.principal.toFixed(2)} + {Math.max(0, calc.totalProfit).toFixed(4)} - {calc.managementFee.toFixed(4)} = {calc.actualRefund.toFixed(4)} USDT
                            </p>
                          </div>
                        );
                      })()}

                      <p className="text-[10px] text-orange-400">系统将根据此价格计算收益并返还本金+收益到用户余额</p>
                    </div>
                  )}
                  
                  {/* 编辑时的操作说明 */}
                  {isEditing && (
                    <div className="mt-3 text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                      <p>· 修改买入状态为「已撤单」：将退回已扣余额</p>
                      <p>· 数量 = 实际投入 × 5.25 / 价格（自动计算）</p>
                      {editState?.sellStatus === 'selling' && <p>· 当前为委卖中状态，可改为「已卖出」确认成交</p>}
                      {editState?.sellStatus === 'sold' && <p>· 确认卖出成交：返还本金 + 实际收益到用户余额</p>}
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
