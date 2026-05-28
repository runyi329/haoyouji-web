import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Pencil, Check, X, ChevronRight } from "lucide-react";
// AfFeeDetail 页面通过路由跳转，已删除内嵌 FeeDetailModal
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// 综合状态标签（买入状态 + 卖出状态）
const getStatusDisplay = (order: any) => {
  if (order.sellStatus === 'sold') return { label: '已卖出', color: 'text-blue-600' };
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

// 管理费明细弹窗组件
function FeeDetailModal({ orders, onClose }: { orders: any[], onClose: () => void }) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const feeItems = orders
    .filter((o: any) => o.side === 'buy' && o.status === 'completed')
    .map((o: any) => {
      const amount = parseFloat(o.amount || '0');
      const tradeValue = o.isGift ? amount : amount * 5.25;
      const dailyFee = tradeValue / 0.75 * 0.12 / 365;
      // 管理费从下单时间（created_at）开始计算，修改价格等操作不影响管理费
      const confirmedDate = new Date(o.createdAt);
      const confirmedDay = new Date(confirmedDate.getFullYear(), confirmedDate.getMonth(), confirmedDate.getDate());
      let holdDays: number;
      let feeType: string;
      if (o.sellStatus === 'sold' && o.sellConfirmedAt) {
        const sellDate = new Date(o.sellConfirmedAt);
        const sellDay = new Date(sellDate.getFullYear(), sellDate.getMonth(), sellDate.getDate());
        holdDays = Math.max(1, Math.floor((sellDay.getTime() - confirmedDay.getTime()) / (1000*60*60*24)) + 1);
        feeType = '已结清';
      } else {
        holdDays = Math.max(1, Math.floor((todayStart.getTime() - confirmedDay.getTime()) / (1000*60*60*24)) + 1);
        feeType = '进行中';
      }
      const totalFee = dailyFee * holdDays;
      const orderDate = new Date(o.createdAt);
      const yy = String(orderDate.getFullYear()).slice(2);
      const mm = String(orderDate.getMonth()+1).padStart(2,'0');
      const dd = String(orderDate.getDate()).padStart(2,'0');
      const orderNo = `AF${yy}${mm}${dd}${String(o.id).padStart(6,'0')}`;
      return { ...o, orderNo, holdDays, dailyFee, totalFee, feeType, tradeValue };
    })
    .sort((a: any, b: any) => b.totalFee - a.totalFee);

  const totalOngoing = feeItems.filter((f: any) => f.feeType === '进行中').reduce((s: number, f: any) => s + f.totalFee, 0);
  const totalSettled = feeItems.filter((f: any) => f.feeType === '已结清').reduce((s: number, f: any) => s + f.totalFee, 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
      <div className="bg-white w-full rounded-t-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-base font-semibold">管理费明细</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 py-3 bg-purple-50 border-b">
          <div className="text-center">
            <p className="text-xs text-gray-400">合计</p>
            <p className="text-sm font-bold text-purple-700">{(totalOngoing + totalSettled).toFixed(2)} U</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">进行中</p>
            <p className="text-sm font-bold text-orange-500">{totalOngoing.toFixed(2)} U</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">已结清</p>
            <p className="text-sm font-bold text-green-600">{totalSettled.toFixed(2)} U</p>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-2 space-y-2">
          {feeItems.map((item: any) => (
            <div key={item.id} className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-mono text-gray-400">{item.orderNo}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  item.feeType === '已结清' ? 'bg-gray-100 text-gray-500' : 'bg-orange-50 text-orange-500'
                }`}>{item.feeType}</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-600 font-medium">{item.nickname || item.username}</span>
                  {item.isGift && <span className="ml-1 text-[10px] text-red-400">赠</span>}
                </div>
                <span className="text-base font-bold text-purple-700">{item.totalFee.toFixed(4)} U</span>
              </div>
              <div className="grid grid-cols-3 gap-1 mt-2">
                <div className="text-center bg-white rounded-lg py-1">
                  <p className="text-[10px] text-gray-400">订单价值</p>
                  <p className="text-xs font-medium">{item.tradeValue.toFixed(2)}</p>
                </div>
                <div className="text-center bg-white rounded-lg py-1">
                  <p className="text-[10px] text-gray-400">持有天数</p>
                  <p className="text-xs font-medium">{item.holdDays} 天</p>
                </div>
                <div className="text-center bg-white rounded-lg py-1">
                  <p className="text-[10px] text-gray-400">日费率</p>
                  <p className="text-xs font-medium">{item.dailyFee.toFixed(4)}</p>
                </div>
              </div>
            </div>
          ))}
          {feeItems.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">暂无管理费记录</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AfOrderManage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  // 状态筛选：all / pending(委买中) / holding(持仓中) / selling(委卖中) / sold(已卖出)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'holding' | 'selling' | 'sold'>('all');
  // 赠予订单折叠展开状态：key = 委买订单ID
  const [expandedGiftOrders, setExpandedGiftOrders] = useState<Record<number, boolean>>({});
  const toggleGiftOrders = (orderId: number) => setExpandedGiftOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  // 管理费明细：跳转到独立页面

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

  const backfillMutation = trpc.ledger.afAdminBackfillGiftOrders.useMutation({
    onSuccess: (data) => {
      toast.success(`补生成完成：共扫描 ${data.total} 笔委买订单，新建 ${data.created} 笔赠予订单`);
      utils.ledger.afAdminGetOrders.invalidate({ ledgerId });
    },
    onError: (e) => toast.error('补生成失败：' + e.message),
  });

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

    // 管理费计算：从下单时间（createdAt）开始，修改价格等操作不影响管理费
    const isGiftOrder = order.isGift === true || order.isGift === 1;
    const tradeValue = isGiftOrder ? principal : principal * 5.25;
    const dailyFee = tradeValue / 0.75 * 0.12 / 365;
    // 开始日期：从下单时间（createdAt）算起，撤单则作废，成交后累计不重置
    const confirmedDate = new Date(order.createdAt);
    const confirmedDay = new Date(confirmedDate.getFullYear(), confirmedDate.getMonth(), confirmedDate.getDate());
    // 结束日期：已卖出用 sellConfirmedAt，其他状态用今天
    let endDay: Date;
    if (order.sellStatus === 'sold' && order.sellConfirmedAt) {
      const sellDate = new Date(order.sellConfirmedAt);
      endDay = new Date(sellDate.getFullYear(), sellDate.getMonth(), sellDate.getDate());
    } else {
      endDay = new Date();
      endDay.setHours(0, 0, 0, 0);
    }
    const holdDays = Math.max(1, Math.floor((endDay.getTime() - confirmedDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
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

  // 根据筛选条件过滤订单
  const filteredOrders = (orders as any[] | undefined)?.filter((order: any) => {
    // 赠予订单在 pending 状态时不单独展示（只在对应委买订单卡片的折叠区块里显示）
    const isGift = order.isGift === true || order.isGift === 1;
    if (statusFilter === 'all') return !(isGift && order.status === 'pending');
    if (statusFilter === 'pending') return order.status === 'pending' && !isGift;
    if (statusFilter === 'holding') return order.status === 'completed' && !order.sellStatus && !isGift;
    if (statusFilter === 'selling') return order.sellStatus === 'selling' && !isGift;
    if (statusFilter === 'sold') return order.sellStatus === 'sold' && !isGift;
    return true;
  }) ?? [];

  const formatDate = (d: any) => {
    if (!d) return "-";
    // 后端已返回北京时间字符串（如 "2026-04-14 06:30:00"），直接截取显示
    const s = typeof d === 'string' ? d : new Date(d).toISOString();
    // 取 MM-DD HH:mm 格式
    const parts = s.replace('T', ' ').substring(0, 16); // "2026-04-14 06:30"
    const [datePart, timePart] = parts.split(' ');
    const [, mm, dd] = (datePart || '').split('-');
    return `${mm || ''}-${dd || ''} ${timePart || ''}`;
  };

  return (
    <div className="min-h-screen pb-10" style={{ background: '#f5f7fa' }}>

      {/* ── 顶部蓝色区域 ── */}
      <div style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)' }}>
        {/* 导航栏 */}
        <div className="flex items-center px-4 pt-5 pb-1">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="w-8 h-8 flex items-center justify-center rounded-full mr-3"
            style={{ background: 'rgba(255,255,255,0.18)' }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <span className="text-white font-semibold text-base">订单管理</span>
        </div>

        {/* 统计汇总 */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 px-4 pb-5 pt-3">
            {/* 累计订单 */}
            <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
              <p className="text-white/55 text-xs mb-1">累计订单</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-white">{stats.orders.totalCount}</span>
                <span className="text-xs text-white/50">笔</span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/50">普通</span>
                  <span className="text-white/80 font-medium">{stats.orders.normalCount} 笔</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/50">赠送</span>
                  <span className="text-amber-300 font-medium">{stats.orders.giftCount} 笔</span>
                </div>
              </div>
            </div>
            {/* 管理费 → 跳转 */}
            <button
              className="rounded-2xl px-4 py-3 text-left active:opacity-75"
              style={{ background: 'rgba(255,255,255,0.14)' }}
              onClick={() => setLocation(`/ledger/${ledgerId}/af-fee-detail`)}
            >
              <div className="flex items-center justify-between">
                <p className="text-white/55 text-xs mb-1">管理费</p>
                <ChevronRight className="w-3.5 h-3.5 text-white/30 -mt-1" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-white">{stats.fees.totalFee.toFixed(2)}</span>
                <span className="text-xs text-white/50">U</span>
              </div>
              <div className="mt-1.5 space-y-0.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/50">进行中</span>
                  <span className="text-amber-300 font-medium">{stats.fees.ongoingFee.toFixed(2)} U</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/50">已结清</span>
                  <span className="text-emerald-300 font-medium">{stats.fees.settledFee.toFixed(2)} U</span>
                </div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* ── 补生成赠予订单按鈕 ── */}
      <div className="px-4 pt-3 pb-1">
        <button
          onClick={() => {
            if (backfillMutation.isPending) return;
            backfillMutation.mutate({ ledgerId });
          }}
          disabled={backfillMutation.isPending}
          className="w-full py-2 rounded-xl text-xs font-medium border border-purple-200 text-purple-600 bg-purple-50 active:opacity-70 disabled:opacity-50"
        >
          {backfillMutation.isPending ? '补生成中...' : '补生成当前委买订单的赠予订单'}
        </button>
      </div>

      {/* ── 状态筛选Tab ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex">
          {([
            { key: 'all' as const, label: '全部', count: (orders as any[])?.filter((o: any) => { const g = o.isGift === true || o.isGift === 1; return !(g && o.status === 'pending'); }).length ?? 0 },
            { key: 'pending' as const, label: '委买中', count: (orders as any[])?.filter((o: any) => o.status === 'pending' && o.isGift !== true && o.isGift !== 1).length ?? 0 },
            { key: 'holding' as const, label: '持仓中', count: (orders as any[])?.filter((o: any) => o.status === 'completed' && !o.sellStatus && o.isGift !== true && o.isGift !== 1).length ?? 0 },
            { key: 'selling' as const, label: '委卖中', count: (orders as any[])?.filter((o: any) => o.sellStatus === 'selling' && o.isGift !== true && o.isGift !== 1).length ?? 0 },
            { key: 'sold' as const, label: '已卖出', count: (orders as any[])?.filter((o: any) => o.sellStatus === 'sold' && o.isGift !== true && o.isGift !== 1).length ?? 0 },
          ]).map((tab, idx, arr) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className="flex-1 py-2.5 text-xs font-medium transition-all relative"
              style={statusFilter === tab.key
                ? { color: '#2563eb', borderBottom: '2px solid #2563eb' }
                : { color: '#6b7280', borderBottom: '2px solid transparent' }}
            >
              {idx > 0 && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-3 w-px bg-gray-200" />}
              {tab.label}
              {tab.count > 0 && <span className="ml-0.5 text-[10px] opacity-60">{tab.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pt-3">

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无订单记录</div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">该状态下暂无订单</div>
        ) : (
          <div className="space-y-2.5 pb-6">
            {filteredOrders.map((order: any) => {
              const isEditing = editingId === order.id;
              const statusDisplay = getStatusDisplay(order);
              // 计算编辑时的实时数量（始终用数据库原始买入价 order.limitPrice，避免被卖出价误覆盖）
              let previewQuantity = editState?.quantity ?? "";
              if (isEditing && editState) {
                const p = parseFloat(order.limitPrice); // 用 order.limitPrice 而非 editState.limitPrice
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
                <div key={order.id} className="bg-white rounded-2xl p-4 shadow-sm">
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
                        <span
                          className="inline-flex items-center justify-center font-black select-none"
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            fontSize: 11,
                            letterSpacing: 0,
                            color: '#FFD700',
                            background: 'radial-gradient(circle at 35% 30%, #5a1a1a 0%, #1a0a00 55%, #3d0000 100%)',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,200,50,0.35), inset 0 -1px 2px rgba(0,0,0,0.6)',
                            border: '1.5px solid #8B4513',
                            textShadow: '0 1px 3px rgba(255,180,0,0.8), 0 0 6px rgba(255,100,0,0.5)',
                            flexShrink: 0,
                          }}
                        >
                          赠
                        </span>
                      )}
                    </div>
                    {!isEditing ? (
                      <button
                        onClick={() => startEdit(order)}
                        className="flex items-center gap-1 text-xs text-gray-700 border border-gray-300 rounded-lg px-2 py-1"
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
                          {parseFloat(order.limitPrice).toLocaleString()} USDT
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
                          <span className="text-gray-900 font-medium">{tradeValue.toFixed(2)} USDT</span>
                        </div>
                      );
                    })()}
                    {/* 卖出价格（委卖中或已卖出时显示） */}
                    {(order.sellStatus === 'selling' || order.sellStatus === 'sold') && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs w-10">卖出价</span>
                        <span className="font-medium text-gray-900">
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
                          <span className={`font-medium ${rate >= 1.0 ? 'text-gray-900' : 'text-orange-500'}`}>{pct}% <span className="text-xs text-gray-400">({tierLabel})</span></span>
                        </div>
                      );
                    })()}
                    {/* 累计管理费：从下单时间（createdAt）开始算，撤单则作废，成交/委卖/持仓均累计 */}
                    {(order.status === 'completed' || order.status === 'pending') && !order.isGift && (() => {
                      const amount = parseFloat(order.amount);
                      const tradeValue = amount * 5.25;
                      const dailyFee = tradeValue / 0.75 * 0.12 / 365;
                      // 开始日期：从下单时间（createdAt）算起，修改价格等操作不影响管理费
                      const startDate = new Date(order.createdAt);
                      const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                      // 结束日期：已卖出用 sellConfirmedAt，其他状态用今天
                      let endDay: Date;
                      if (order.sellStatus === 'sold' && order.sellConfirmedAt) {
                        const sellDate = new Date(order.sellConfirmedAt);
                        endDay = new Date(sellDate.getFullYear(), sellDate.getMonth(), sellDate.getDate());
                      } else {
                        endDay = new Date(); endDay.setHours(0,0,0,0);
                      }
                      const holdDays = Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / (1000*60*60*24)) + 1);
                      const totalFee = dailyFee * holdDays;
                      const isPending = order.status === 'pending';
                      return (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400 text-xs w-10">累计管理费</span>
                          <span className={`font-medium ${isPending ? 'text-gray-400' : 'text-gray-900'}`}>
                            {totalFee.toFixed(4)} USDT
                            <span className="text-xs text-gray-400 ml-1">({holdDays}天 · {dailyFee.toFixed(4)}/天)</span>
                            {isPending && <span className="text-xs text-yellow-500 ml-1">撤单则作废</span>}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* 赠送订单来源信息 */}
                  {order.isGift && order.sourceUsername && (
                    <div className="mt-2 text-xs rounded-lg px-3 py-1.5 border text-gray-500 bg-gray-50 border-gray-100">
                      {order.giftMultiplier === '1.0' ? '间接推荐奖励订单 (1.0倍)' : '推荐人奖励订单 (1.5倍)'} · 来自 <span className="font-medium text-gray-700">{order.sourceUsername}</span>
                    </div>
                  )}

                  {/* 赠予订单折叠区块（仅对非赠予的委买订单显示） */}
                  {!order.isGift && (() => {
                    const giftOrders: any[] = (order as any).giftOrders || [];
                    if (giftOrders.length === 0) return null;
                    const isExpanded = !!expandedGiftOrders[order.id];
                    const totalQty = giftOrders.reduce((s: number, g: any) => s + parseFloat(g.quantity || '0'), 0);
                    return (
                      <div className="mt-2">
                        {/* 折叠头部：汇总行 */}
                        <button
                          onClick={() => toggleGiftOrders(order.id)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-purple-50 border border-purple-100 text-xs text-purple-700 hover:bg-purple-100 transition-colors"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-200 text-purple-800 font-bold text-[10px]">赠</span>
                            <span className="font-medium">已触发赠予订单</span>
                            <span className="text-purple-500">共 {giftOrders.length} 笔 · 合计 {totalQty.toFixed(4)} {order.coin}</span>
                          </div>
                          <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                        </button>
                        {/* 展开内容 */}
                        {isExpanded && (
                          <div className="mt-1 border border-purple-100 rounded-lg overflow-hidden">
                            {giftOrders.map((g: any, idx: number) => {
                              const giftQty = parseFloat(g.quantity || '0');
                              const giftAmt = parseFloat(g.amount || '0');
                              const giftTier = g.equityTier || 0;
                              const giftRate = EQUITY_DISCOUNT_RATES[giftTier] || 1.0;
                              const effectiveQty = giftQty * giftRate;
                              const ratioLabel = parseFloat(g.giftMultiplier || '0') > 0
                                ? `${(parseFloat(g.giftMultiplier) * 100).toFixed(0)}%拨比`
                                : '';
                              // 状态显示
                              let statusLabel = '委买中';
                              let statusColor = 'text-yellow-500';
                              if (g.sellStatus === 'sold') { statusLabel = '已卖出'; statusColor = 'text-blue-500'; }
                              else if (g.sellStatus === 'selling') { statusLabel = '委卖中'; statusColor = 'text-red-500'; }
                              else if (g.status === 'completed') { statusLabel = '持仓中'; statusColor = 'text-green-500'; }
                              else if (g.status === 'cancelled') { statusLabel = '已撤单'; statusColor = 'text-gray-400'; }
                              const giftPrice = parseFloat(g.limitPrice || '0');
                              const orderValue = giftQty * giftPrice;
                              return (
                                <div key={g.id} className={`px-3 py-2.5 text-xs ${idx > 0 ? 'border-t border-purple-50' : ''} bg-white`}>
                                  {/* 第一行：受益人 + 拨比 + 状态 */}
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-gray-800">{g.nickname || g.username}</span>
                                      {ratioLabel && <span className="text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded">{ratioLabel}</span>}
                                    </div>
                                    <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
                                  </div>
                                  {/* 第二行：订单编号 */}
                                  {g.orderNo && (
                                    <div className="mb-1 text-gray-400">
                                      订单号 <span className="text-gray-600 font-mono">{g.orderNo}</span>
                                      <span className="ml-2 text-gray-500">币种 <span className="text-gray-700 font-medium">{g.coin}</span></span>
                                    </div>
                                  )}
                                  {/* 第三行：买入价 + 赠予数量 + 订单价值 */}
                                  <div className="grid grid-cols-3 gap-1 text-gray-500 mb-1">
                                    <div>买入价<br/><span className="text-gray-700 font-medium">{giftPrice > 0 ? giftPrice.toFixed(0) : '-'} USDT</span></div>
                                    <div>赠予数量<br/><span className="text-gray-700 font-medium">{giftQty.toFixed(4)} {g.coin}</span></div>
                                    <div>订单价值<br/><span className="text-gray-700 font-medium">{orderValue > 0 ? orderValue.toFixed(2) : giftAmt.toFixed(2)} USDT</span></div>
                                  </div>
                                  {/* 第四行：权益档位信息 */}
                                  <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                      giftTier === 0 ? 'bg-green-50 text-green-600' :
                                      giftTier <= 3 ? 'bg-blue-50 text-blue-600' :
                                      giftTier <= 6 ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
                                    }`}>
                                      D{giftTier}档 · 权益{(giftRate * 100).toFixed(1)}%
                                    </span>
                                    <span className="text-gray-400">实际有效数量</span>
                                    <span className={`font-medium ${giftTier > 0 ? 'text-orange-500' : 'text-gray-700'}`}>
                                      {effectiveQty.toFixed(4)} {g.coin}
                                    </span>
                                    {giftTier > 0 && <span className="text-gray-400 text-[10px]">(已折扣{((1 - giftRate) * 100).toFixed(1)}%)</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

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
                                  const startDate = new Date(order.createdAt);
                                  // 已卖出用 sellConfirmedAt，其他用今天
                                  const endDate = (order.sellStatus === 'sold' && order.sellConfirmedAt)
                                    ? new Date(order.sellConfirmedAt)
                                    : new Date();
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
