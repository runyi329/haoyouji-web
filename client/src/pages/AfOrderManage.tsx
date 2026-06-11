import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Pencil, Check, X, ChevronRight, ChevronDown } from "lucide-react";
// AfFeeDetail 页面通过路由跳转，已删除内嵌 FeeDetailModal
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageTag } from "@/components/PageTag";

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
  // 分组维度：时间 / 人员
  const [groupMode, setGroupMode] = useState<'time' | 'person' | 'coin' | 'price'>('time');
  // 人员分组展开状态
  const [expandedPersons, setExpandedPersons] = useState<Record<string, boolean>>({});
  const togglePerson = (uid: string) => setExpandedPersons(prev => ({ ...prev, [uid]: !(prev[uid] ?? false) }));
  // 人员维度内部筛选：每个人独立的勾选状态（默认全选）
  const [personFilters, setPersonFilters] = useState<Record<string, Set<string>>>({});
  const getPersonFilter = (uid: string): Set<string> => personFilters[uid] || new Set(['pending', 'holding', 'selling', 'sold', 'gift']);
  const togglePersonFilter = (uid: string, key: string) => {
    setPersonFilters(prev => {
      const current = prev[uid] || new Set(['pending', 'holding', 'selling', 'sold', 'gift']);
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return { ...prev, [uid]: next };
    });
  };
  // 赠予订单折叠展开状态：key = 委买订单ID
  const [expandedGiftOrders, setExpandedGiftOrders] = useState<Record<number, boolean>>({});
  const [expandedDateId, setExpandedDateId] = useState<number | null>(null);
  // 日期分组折叠：key = 日期字符串(YYYY-MM-DD)，value = 是否展开（默认全部折叠）
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const toggleDate = (dateKey: string) => setExpandedDates(prev => ({ ...prev, [dateKey]: !(prev[dateKey] ?? false) }));
  const toggleGiftOrders = (orderId: number) => setExpandedGiftOrders(prev => ({ ...prev, [orderId]: !prev[orderId] }));
  // 持仓人员弹窗
  const [holdersPopup, setHoldersPopup] = useState<string[] | null>(null);
  // 持仓币种档位详情弹窗：存储当前展开的币种名称
  const [coinDetailPopup, setCoinDetailPopup] = useState<string | null>(null);
  // 管理费明细：跳转到独立页面

  const utils = trpc.useUtils();
  const { data: stats, refetch: refetchStats } = trpc.ledger.afAdminGetStats.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const { data: orders, isLoading, refetch: refetchOrders } = trpc.ledger.afAdminGetOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  // 实时币价（每3秒刷新，与全站规范一致）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 0,
    placeholderData: (prev: any) => prev,
  });
  const livePrice: Record<string, number> = (cryptoPricesRaw as any)?.prices ?? {};

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
    if (statusFilter === 'holding') return order.status === 'completed' && !isGift; // 持仓中：显示所有 completed 正单（含委卖中/已卖出），赠单只嵌套在正单里
    if (statusFilter === 'selling') return order.sellStatus === 'selling'; // 委卖中：赠单也显示
    if (statusFilter === 'sold') return order.sellStatus === 'sold'; // 已卖出：赠单也显示
    return true;
  }) ?? [];

  // 日期格式化：完整时间（用于气泡）
  const formatDateFull = (d: any) => {
    if (!d) return "-";
    const s = typeof d === 'string' ? d : new Date(d).toISOString();
    return s.replace('T', ' ').substring(0, 19);
  };
  // 日期格式化：只显示 YY-MM-DD（用于卡片标题）
  const formatDate = (d: any) => {
    if (!d) return "-";
    const s = typeof d === 'string' ? d : new Date(d).toISOString();
    const parts = s.replace('T', ' ').substring(0, 10); // "2026-04-14"
    const [yyyy, mm, dd] = (parts || '').split('-');
    const yy = (yyyy || '').slice(2);
    return `${yy}-${mm || ''}-${dd || ''}`;
  };

  return (
    <div className="min-h-screen pb-10" style={{ background: '#f5f7fa' }}>
      <PageTag code="P050" />

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
          <span className="text-white font-semibold text-base flex-1">订单管理</span>
          <button
            onClick={() => window.location.reload()}
            className="text-xs px-3 py-1 rounded-full active:opacity-70"
            style={{ background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)' }}
          >
            刷新
          </button>
        </div>

        {/* 统计汇总 */}
        {stats && (
          <div className="px-4 pb-5 pt-3 space-y-2">
            {/* 第一行：管理费（单独占满宽） */}
            <button
              className="w-full rounded-2xl px-4 py-3 text-left active:opacity-75"
              style={{ background: 'rgba(255,255,255,0.14)' }}
              onClick={() => setLocation(`/ledger/${ledgerId}/af-fee-detail`)}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/55 text-xs">管理费</p>
                <ChevronRight className="w-3.5 h-3.5 text-white/30" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-white/50">进行中</span>
                  <span className="text-amber-300 font-semibold">{stats.fees.ongoingFee.toFixed(2)} U</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-white/50">已结清</span>
                  <span className="text-emerald-300 font-semibold">{stats.fees.settledFee.toFixed(2)} U</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-white/70">累计</span>
                  <span className="text-white font-bold">{stats.fees.totalFee.toFixed(2)} U</span>
                </div>
              </div>
            </button>
            {/* 第二行：累计订单 + 今日（各占一半） */}
            <div className="grid grid-cols-2 gap-2">
              {/* 累计订单 */}
              <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
                <p className="text-white/55 text-xs mb-2">累计订单</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">普通</span>
                    <span className="text-white/80 font-semibold">{stats.orders.normalCount} 笔</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">赠送</span>
                    <span className="text-amber-300 font-semibold">{stats.orders.giftCount} 笔</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-white/10 pt-1.5">
                    <span className="text-white/70">合计</span>
                    <span className="text-white font-bold">{stats.orders.totalCount} 笔</span>
                  </div>
                </div>
              </div>
              {/* 今日 */}
              <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.14)' }}>
                <p className="text-white/55 text-xs mb-2">今日</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">管理费</span>
                    <span className="text-sky-300 font-semibold">{(stats.fees as any).todayFee?.toFixed(4) ?? '0.0000'} U</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/50">订单数</span>
                    <span className="text-white font-bold">{(stats.fees as any).todayOrderCount ?? 0} 单</span>
                  </div>
                </div>
              </div>
            </div>
            {/* 持仓中各币种数量统计 */}
            {(() => {
              // 持仓中币种：只统计已成交且未卖出的（status=completed，sellStatus != sold）
              const holdingOrders = (orders as any[] || []).filter(
                (o: any) => o.status === 'completed' && o.sellStatus !== 'sold'
              );
              if (holdingOrders.length === 0) return null;
              const COIN_ORDER_S = ['ETH', 'BTC', 'SOL'];
              const COIN_DECIMALS_S: Record<string, number> = { SOL: 1, BTC: 4, ETH: 2 };
              const fmtQ = (coin: string, num: number) => num.toFixed(COIN_DECIMALS_S[coin] ?? 4);
              const rawQty: Record<string, number> = {};
              const effQty: Record<string, number> = {};
              const normalCnt: Record<string, number> = {}; // 正单笔数
              const giftCnt: Record<string, number> = {};   // 赠单笔数
              const coinHolderSets: Record<string, Set<string>> = {}; // 每个币种的持仓人员
              const weightedPriceSum: Record<string, number> = {}; // 加权价格之和（价格×数量）
              const totalFeeUsdt: Record<string, number> = {}; // 每个币种累计管理费（USDT）
              const todayBJ = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
              const todayStart = new Date(todayBJ.getFullYear(), todayBJ.getMonth(), todayBJ.getDate());
              holdingOrders.forEach((o: any) => {
                if (!o.coin) return;
                const qty = parseFloat(o.quantity) || 0;
                rawQty[o.coin] = (rawQty[o.coin] || 0) + qty;
                const rate = EQUITY_DISCOUNT_RATES[o.equityTier || 0] ?? 1.0;
                effQty[o.coin] = (effQty[o.coin] || 0) + qty * rate;
                // 加权均价：使用 limitPrice（买入挂单价）
                const price = parseFloat(o.limitPrice) || 0;
                if (price > 0 && qty > 0) {
                  weightedPriceSum[o.coin] = (weightedPriceSum[o.coin] || 0) + price * qty;
                }
                // 计算该订单实时管理费
                const amount = parseFloat(o.amount) || 0;
                if (amount > 0) {
                  const tradeValue = o.isGift ? amount : amount * 5.25;
                  const dailyFee = tradeValue / 0.75 * 0.12 / 365;
                  const createdDate = o.createdAt ? new Date(o.createdAt) : new Date();
                  const createdDay = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate());
                  const holdDays = Math.max(1, Math.floor((todayStart.getTime() - createdDay.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                  totalFeeUsdt[o.coin] = (totalFeeUsdt[o.coin] || 0) + dailyFee * holdDays;
                }
                // 统计正单/赠单笔数
                if (o.isGift === true || o.isGift === 1) {
                  giftCnt[o.coin] = (giftCnt[o.coin] || 0) + 1;
                } else {
                  normalCnt[o.coin] = (normalCnt[o.coin] || 0) + 1;
                  // 嵌套赠单只统计笔数（币数已在顶层独立赠单行中统计，不重复计算）
                  const gifts: any[] = (o.giftOrders as any[]) || [];
                  gifts.forEach((g: any) => {
                    if (g.sellStatus === 'sold') return;
                    if (g.coin) giftCnt[g.coin] = (giftCnt[g.coin] || 0) + 1;
                  });
                }
                // 统计每个币种的持仓人数（排除赠单）
                if (!o.isGift) {
                  if (!coinHolderSets[o.coin]) coinHolderSets[o.coin] = new Set();
                  const name = o.nickname || o.username || `用户${o.userId}`;
                  coinHolderSets[o.coin].add(name);
                }
              });
              const coins = Object.keys(rawQty).sort((a, b) => {
                const ai = COIN_ORDER_S.indexOf(a); const bi = COIN_ORDER_S.indexOf(b);
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
              });
              if (coins.length === 0) return null;
              const COIN_COLOR: Record<string, string> = { ETH: 'text-blue-300', BTC: 'text-orange-300', SOL: 'text-green-300' };
              // 持仓人员（去重，排除赠单）
              const holderSet = new Set<string>();
              holdingOrders.filter((o: any) => !o.isGift).forEach((o: any) => {
                const name = o.nickname || o.username || `用户${o.userId}`;
                holderSet.add(name);
              });
              const holderNames = Array.from(holderSet);
              return (
                <div className="rounded-2xl px-4 py-3 bg-white">
                  <div className="mb-2">
                    <p className="text-gray-400 text-xs">持仓中币种</p>
                  </div>
                  <div className="space-y-0">
                    {coins.map((coin, coinIdx) => {
                      const raw = rawQty[coin];
                      const eff = effQty[coin];
                      const hasDiscount = Math.abs(eff - raw) > 0.00005;
                      const pct = hasDiscount ? Math.round((eff / raw) * 100) : null;
                      // 布局辅助：左标题 + 虚线 + 右数值
                      const DotRow = ({ label, value }: { label: React.ReactNode; value: React.ReactNode }) => (
                        <div className="flex items-center w-full">
                          <span className="text-gray-700 text-xs whitespace-nowrap">{label}</span>
                          <span className="flex-1 mx-1.5 border-b border-dashed border-gray-200" style={{ marginTop: '1px' }} />
                          <span className="text-gray-700 text-xs whitespace-nowrap text-right">{value}</span>
                        </div>
                      );
                      return (
                        <div key={coin} className={`text-xs ${coinIdx > 0 ? 'pt-2 mt-2 border-t border-gray-100' : ''}`}>
                          <div className="flex items-center w-full">
                            <span className="text-gray-700 text-xs whitespace-nowrap">
                              <span className="font-semibold">{coin} <span className="font-normal text-gray-400 text-[10px]">({hasDiscount ? `折后${fmtQ(coin, eff)} ${pct}% ` : ''}{coinHolderSets[coin] ? `${coinHolderSets[coin].size}人 ` : ''}{normalCnt[coin] ? `${normalCnt[coin]}单` : ''}{giftCnt[coin] ? ` ${giftCnt[coin]}赠` : ''})</span></span>
                            </span>
                            <button
                              className="ml-1 p-0.5 rounded active:bg-gray-100"
                              onClick={() => setCoinDetailPopup(coin)}
                            >
                              <ChevronDown className="w-3 h-3 text-gray-400" />
                            </button>
                            <span className="flex-1 mx-1.5 border-b border-dashed border-gray-200" style={{ marginTop: '1px' }} />
                            <span className="text-gray-700 text-xs whitespace-nowrap text-right font-semibold">{fmtQ(coin, raw)}</span>
                          </div>
                          {weightedPriceSum[coin] && rawQty[coin] ? (() => {
                            const avgPrice = weightedPriceSum[coin] / rawQty[coin];
                            const feePerCoin = totalFeeUsdt[coin] ? totalFeeUsdt[coin] / rawQty[coin] : 0;
                            const breakEven = avgPrice + feePerCoin;
                            const minTakeProfit = breakEven * 1.25;
                            const currentPrice = livePrice[coin] ?? 0;
                            const effQ = effQty[coin] ?? rawQty[coin];
                            const totalFee = totalFeeUsdt[coin] ?? 0;
                            const grossPnl = currentPrice > 0 ? (currentPrice - avgPrice) * effQ : null;
                            const netPnl = grossPnl !== null ? grossPnl - totalFee : null;
                            const pnlColor = netPnl === null ? '' : netPnl >= 0 ? 'text-red-500' : 'text-green-600';
                            return (
                              <>
                                <DotRow
                                  label="盈亏平衡"
                                  value={<span>${avgPrice.toFixed(2)}+{feePerCoin.toFixed(2)}=<span className="font-semibold">${breakEven.toFixed(2)}</span></span>}
                                />
                                {netPnl !== null && (
                                  <DotRow
                                    label="实时盈亏"
                                    value={
                                      <span>
                                        <span className={grossPnl! >= 0 ? 'text-red-400' : 'text-green-500'}>{grossPnl! >= 0 ? '+' : ''}{grossPnl!.toFixed(2)}</span>
                                        <span className="text-gray-300 mx-0.5">-</span>
                                        <span>{totalFee.toFixed(2)}</span>
                                        <span className="text-gray-300 mx-0.5">=</span>
                                        <span className={`font-bold ${pnlColor}`}>{netPnl >= 0 ? '+' : ''}{netPnl.toFixed(2)}U</span>
                                      </span>
                                    }
                                  />
                                )}
                                <DotRow
                                  label="最低止盈价"
                                  value={<span className="font-semibold">${minTakeProfit.toFixed(2)}</span>}
                                />
                              </>
                            );
                          })() : null}
                        </div>
                      );
                    })}
                  </div>
                  {/* 总盈亏汇总 */}
                  {(() => {
                    let totalPnl = 0;
                    let hasPnl = false;
                    coins.forEach(coin => {
                      const cp = livePrice[coin] ?? 0;
                      if (cp > 0 && weightedPriceSum[coin] && rawQty[coin]) {
                        const avgP = weightedPriceSum[coin] / rawQty[coin];
                        const effQ = effQty[coin] ?? rawQty[coin];
                        const fee = totalFeeUsdt[coin] ?? 0;
                        totalPnl += (cp - avgP) * effQ - fee;
                        hasPnl = true;
                      }
                    });
                    if (!hasPnl) return null;
                    const pnlColor = totalPnl >= 0 ? 'text-red-500' : 'text-green-600';
                    return (
                      <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-center">
                        <span className="text-gray-400 text-[10px]">总盈亏</span>
                        <span className={`text-sm font-bold ${pnlColor}`}>
                          {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} U
                        </span>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* 持仓人员弹窗 */}
      {holdersPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setHoldersPopup(null)}
        >
          <div
            className="bg-white rounded-2xl px-5 py-4 mx-6 w-full max-w-xs"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-semibold text-gray-700 mb-3">持仓人员（{holdersPopup.length}人）</p>
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {holdersPopup.map((name, i) => (
                <div key={i} className="text-sm text-gray-600 py-1 border-b border-gray-100 last:border-0">{name}</div>
              ))}
            </div>
            <button
              onClick={() => setHoldersPopup(null)}
              className="mt-4 w-full py-2 rounded-xl text-sm text-white font-medium"
              style={{ background: '#2563eb' }}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 持仓币种档位详情弹窗 */}
      {coinDetailPopup && (() => {
        const targetCoin = coinDetailPopup;
        // 取所有未卖出的 completed 订单（正单+独立赠单）
        const holdingOrders = (orders as any[] || []).filter(
          (o: any) => o.status === 'completed' && o.sellStatus !== 'sold' && o.coin === targetCoin
        );
        // 按 limitPrice 档位分组，每个档位内再按用户分组
        // 注：顶层 orders 已包含独立赠单行（isGift=true），不需要再展开嵌套 giftOrders
        interface UserDetail { name: string; rawQty: number; effQty: number; orderCount: number; isGift: boolean; equityTier: number; rate: number }
        interface TierGroup { price: number; rawQty: number; effQty: number; orderCount: number; giftCount: number; users: Record<string, UserDetail> }
        const tierMap: Record<string, TierGroup> = {};
        holdingOrders.forEach((o: any) => {
          const price = parseFloat(o.limitPrice) || 0;
          const key = price.toFixed(2);
          if (!tierMap[key]) {
            tierMap[key] = { price, rawQty: 0, effQty: 0, orderCount: 0, giftCount: 0, users: {} };
          }
          const tier = tierMap[key];
          const qty = parseFloat(o.quantity) || 0;
          const eqTier = o.equityTier || 0;
          const rate = EQUITY_DISCOUNT_RATES[eqTier] ?? 1.0;
          tier.rawQty += qty;
          tier.effQty += qty * rate;
          tier.orderCount += 1;
          const isGift = o.isGift === true || o.isGift === 1;
          if (isGift) tier.giftCount += 1;
          const name = o.nickname || o.username || `用户${o.userId}`;
          const userKey = `${name}_${isGift ? 'gift' : 'normal'}_${eqTier}`;
          if (!tier.users[userKey]) {
            tier.users[userKey] = { name, rawQty: 0, effQty: 0, orderCount: 0, isGift, equityTier: eqTier, rate };
          }
          tier.users[userKey].rawQty += qty;
          tier.users[userKey].effQty += qty * rate;
          tier.users[userKey].orderCount += 1;
        });
        const tiers = Object.values(tierMap).sort((a, b) => a.price - b.price);
        const COIN_DECIMALS_D: Record<string, number> = { SOL: 1, BTC: 4, ETH: 2 };
        const fmtD = (num: number) => num.toFixed(COIN_DECIMALS_D[targetCoin] ?? 4);
        const totalRaw = tiers.reduce((s, t) => s + t.rawQty, 0);
        const totalEff = tiers.reduce((s, t) => s + t.effQty, 0);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setCoinDetailPopup(null)}
          >
            <div
              className="bg-white rounded-2xl px-5 py-4 mx-4 w-full max-w-sm max-h-[80vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-sm font-semibold text-gray-700 mb-3">{targetCoin} 持仓档位详情（{tiers.length}个档位）</p>
              <div className="space-y-2.5 overflow-y-auto flex-1">
                {tiers.map((tier) => {
                  const userList = Object.values(tier.users).sort((a, b) => b.rawQty - a.rawQty);
                  return (
                    <div key={tier.price} className="bg-gray-50 rounded-xl p-3">
                      {/* 档位汇总行 */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-gray-800">${tier.price.toFixed(2)}</span>
                        <span className="text-gray-500">
                          {tier.orderCount}单{tier.giftCount > 0 ? `(${tier.giftCount}赠)` : ''}
                          <span className="mx-1 text-gray-300">|</span>
                          {fmtD(tier.rawQty)}
                          <span className="mx-1 text-gray-300">/</span>
                          <span className="text-blue-600 font-medium">{fmtD(tier.effQty)}</span>
                        </span>
                      </div>
                      {/* 每个用户一行明细 */}
                      <div className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-0.5">
                        {userList.map((u, ui) => (
                          <div key={ui} className="flex items-center text-[11px] leading-5">
                            <span className="text-gray-700 font-medium truncate max-w-[72px]">{u.name}</span>
                            {u.isGift && <span className="ml-1 text-[9px] text-amber-500">赠</span>}
                            <span className="flex-1 mx-1 border-b border-dotted border-gray-200" />
                            <span className="text-gray-600 whitespace-nowrap">
                              {fmtD(u.rawQty)}
                              <span className="text-gray-300 mx-0.5">x</span>
                              <span className="text-gray-400">{Math.round(u.rate * 100)}%</span>
                              <span className="text-gray-300 mx-0.5">=</span>
                              <span className="text-blue-600 font-medium">{fmtD(u.effQty)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
                <span>合计 {fmtD(totalRaw)} {targetCoin}</span>
                <span>折后 {fmtD(totalEff)}</span>
              </div>
              <button
                onClick={() => setCoinDetailPopup(null)}
                className="mt-3 w-full py-2 rounded-xl text-sm text-white font-medium"
                style={{ background: '#2563eb' }}
              >
                关闭
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── 状态筛选Tab ── */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        {/* 第一行：分组维度切换 */}
        <div className="flex items-center justify-center gap-1 px-4 pt-2 pb-1">
          {([
            { key: 'time' as const, label: '按时间' },
            { key: 'person' as const, label: '按人员' },
            { key: 'coin' as const, label: '按币种' },
            { key: 'price' as const, label: '按价格' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setGroupMode(tab.key)}
              className="px-4 py-1 rounded-full text-xs font-medium transition-all"
              style={groupMode === tab.key
                ? { background: '#2563eb', color: '#fff' }
                : { background: '#F3F4F6', color: '#6b7280' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* 第二行：状态筛选 */}
        <div className="flex">
          {([
            { key: 'all' as const, label: '全部', count: (orders as any[])?.filter((o: any) => { const g = o.isGift === true || o.isGift === 1; return !(g && o.status === 'pending'); }).length ?? 0 },
            { key: 'pending' as const, label: '委买中', count: (orders as any[])?.filter((o: any) => o.status === 'pending' && o.isGift !== true && o.isGift !== 1).length ?? 0 },
            { key: 'holding' as const, label: '持仓中', count: (orders as any[])?.filter((o: any) => o.status === 'completed' && !o.sellStatus).length ?? 0 },
            { key: 'selling' as const, label: '委卖中', count: (orders as any[])?.filter((o: any) => o.sellStatus === 'selling').length ?? 0 },
            { key: 'sold' as const, label: '已卖出', count: (orders as any[])?.filter((o: any) => o.sellStatus === 'sold').length ?? 0 },
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
        ) : groupMode === 'person' ? (
          /* ── 人员维度分组 ── */
          <div className="space-y-2 pb-6">
            {(() => {
              // 按人员分组
              const personMap = new Map<string, { uid: string; name: string; orders: any[] }>();
              (filteredOrders || []).forEach((order: any) => {
                const uid = String(order.userId || 'unknown');
                const name = order.nickname || order.username || `用户${uid}`;
                if (!personMap.has(uid)) {
                  personMap.set(uid, { uid, name, orders: [] });
                }
                personMap.get(uid)!.orders.push(order);
              });
              const personGroups = Array.from(personMap.values()).sort((a, b) => b.orders.length - a.orders.length);
              const COIN_DECIMALS: Record<string, number> = { SOL: 1, BTC: 4, ETH: 2 };
              return personGroups.map(group => {
                const isOpen = expandedPersons[group.uid] ?? false;
                const activeOrders = group.orders.filter((o: any) => o.status !== 'cancelled');
                const normalCount = activeOrders.filter((o: any) => !(o.isGift === true || o.isGift === 1)).length;
                const nestedGiftCount = activeOrders.reduce((s: number, o: any) => s + ((o.giftOrders as any[] || []).length), 0);
                const directGiftCount = activeOrders.filter((o: any) => o.isGift === true || o.isGift === 1).length;
                const giftCount = directGiftCount + nestedGiftCount;
                const totalAmount = activeOrders.reduce((s: number, o: any) => s + (parseFloat(o.amount) || 0), 0);
                // 展开后的筛选
                const pFilter = getPersonFilter(group.uid);
                // 展平所有订单（正单+嵌套赠单）并按时间从近到远排序
                const flatOrders: any[] = [];
                group.orders.forEach((o: any) => {
                  flatOrders.push({ ...o, _isGift: o.isGift === true || o.isGift === 1 });
                  // 嵌套赠单也展平
                  const gifts: any[] = (o.giftOrders as any[]) || [];
                  gifts.forEach((g: any) => {
                    flatOrders.push({ ...g, _isGift: true, _parentCoin: o.coin });
                  });
                });
                flatOrders.sort((a, b) => {
                  const ta = new Date(a.createdAt || a.confirmedAt || 0).getTime();
                  const tb = new Date(b.createdAt || b.confirmedAt || 0).getTime();
                  return tb - ta;
                });
                // 根据勾选筛选
                const visibleOrders = flatOrders.filter((o: any) => {
                  if (o._isGift) return pFilter.has('gift');
                  if (o.sellStatus === 'sold') return pFilter.has('sold');
                  if (o.sellStatus === 'selling') return pFilter.has('selling');
                  if (o.status === 'completed') return pFilter.has('holding');
                  if (o.status === 'pending') return pFilter.has('pending');
                  return true;
                });
                return (
                  <div key={group.uid}>
                    {/* 人员标题行 */}
                    <button
                      onClick={() => togglePerson(group.uid)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
                    >
                      <span className="text-sm font-bold text-gray-800 shrink-0 mr-2">{group.name}</span>
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        <span className="text-[11px] text-blue-500">{normalCount}单</span>
                        {giftCount > 0 && <span className="text-[11px] text-orange-400">{giftCount}赠</span>}
                        <span className="text-[11px] text-gray-600">{totalAmount >= 10000 ? (totalAmount/10000).toFixed(1)+'万' : totalAmount.toFixed(0)}U</span>
                      </div>
                      <span className={`transition-transform duration-200 shrink-0 ml-1 text-gray-400 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {/* 展开后：一个容器 */}
                    {isOpen && (
                      <div className="mt-1 mb-2 rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                        {/* 勾选筛选行 */}
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-gray-50 flex-wrap">
                          {([
                            { key: 'pending', label: '委买', color: 'text-yellow-600' },
                            { key: 'holding', label: '持仓', color: 'text-green-600' },
                            { key: 'selling', label: '委卖', color: 'text-red-500' },
                            { key: 'sold', label: '已卖', color: 'text-blue-600' },
                            { key: 'gift', label: '赠单', color: 'text-orange-500' },
                          ]).map(f => (
                            <label key={f.key} className="flex items-center gap-0.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={pFilter.has(f.key)}
                                onChange={() => togglePersonFilter(group.uid, f.key)}
                                className="w-3 h-3 rounded accent-blue-500"
                              />
                              <span className={`text-[10px] ${pFilter.has(f.key) ? f.color : 'text-gray-400'}`}>{f.label}</span>
                            </label>
                          ))}
                        </div>
                        {/* 订单列表：每行一张订单 */}
                        <div className="divide-y divide-gray-50">
                          {visibleOrders.length === 0 ? (
                            <div className="text-center py-3 text-[11px] text-gray-400">无匹配订单</div>
                          ) : visibleOrders.map((order: any) => {
                            const isGift = order._isGift;
                            const statusDisplay = getStatusDisplay(order);
                            const qty = parseFloat(order.quantity || 0);
                            const coin = order.coin || order._parentCoin || '';
                            const tier = order.equityTier || 0;
                            const rate = EQUITY_DISCOUNT_RATES[tier] ?? 1.0;
                            const effQty = qty * rate;
                            const hasDiscount = Math.abs(effQty - qty) > 0.00005;
                            const amount = parseFloat(order.amount || 0);
                            const dateStr = formatDate(order.confirmedAt || order.createdAt);
                            return (
                              <div
                                key={order.id}
                                className={`flex items-center px-2.5 py-1.5 gap-1 min-h-[28px] ${isGift ? 'bg-amber-50/40' : ''}`}
                              >
                                {/* 币种+赠标记 */}
                                <span className="text-[11px] font-medium text-gray-800 w-8 shrink-0">{coin}</span>
                                {isGift ? (
                                  <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-600 shrink-0">赠</span>
                                ) : (
                                  <span className="text-[9px] px-1 py-0 rounded bg-blue-50 text-blue-500 shrink-0">正</span>
                                )}
                                {/* 数量 */}
                                <span className="text-[11px] text-gray-700 flex-1 text-right font-mono">
                                  {qty.toFixed(COIN_DECIMALS[coin] ?? 4)}
                                </span>
                                {/* 档位+折后 */}
                                {!isGift && tier > 0 && hasDiscount ? (
                                  <span className="text-[9px] text-purple-500 shrink-0 w-16 text-right">
                                    T{tier}→{effQty.toFixed(COIN_DECIMALS[coin] ?? 4)}
                                  </span>
                                ) : (
                                  <span className="w-16 shrink-0" />
                                )}
                                {/* 金额 */}
                                <span className="text-[10px] text-gray-400 w-10 text-right shrink-0">{amount > 0 ? amount.toFixed(0)+'U' : ''}</span>
                                {/* 状态 */}
                                <span className={`text-[9px] w-8 text-center shrink-0 ${statusDisplay.color}`}>{statusDisplay.label}</span>
                                {/* 日期 */}
                                <span className="text-[9px] text-gray-400 w-14 text-right shrink-0">{dateStr}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        ) : groupMode === 'coin' ? (
          /* ── 币种维度分组 ── */
          <div className="space-y-2 pb-6">
            {(() => {
              const COIN_ORDER = ['ETH', 'BTC', 'SOL'];
              const COIN_DECIMALS: Record<string, number> = { SOL: 1, BTC: 4, ETH: 2 };
              const COIN_COLORS: Record<string, string> = { ETH: '#3b82f6', BTC: '#f59e0b', SOL: '#10b981' };
              // 按币种分组
              const coinMap = new Map<string, any[]>();
              (filteredOrders || []).forEach((order: any) => {
                const coin = order.coin || '未知';
                if (!coinMap.has(coin)) coinMap.set(coin, []);
                coinMap.get(coin)!.push(order);
              });
              const coinGroups = Array.from(coinMap.entries()).sort(([a], [b]) => {
                const ai = COIN_ORDER.indexOf(a);
                const bi = COIN_ORDER.indexOf(b);
                return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
              });
              return coinGroups.map(([coin, coinOrders]) => {
                const isOpen = expandedPersons[`coin_${coin}`] ?? false;
                const totalQty = coinOrders.reduce((s: number, o: any) => s + (parseFloat(o.quantity) || 0), 0);
                const nestedGiftQty = coinOrders.reduce((s: number, o: any) => {
                  return s + ((o.giftOrders as any[]) || []).reduce((gs: number, g: any) => gs + (parseFloat(g.quantity) || 0), 0);
                }, 0);
                const totalAmount = coinOrders.reduce((s: number, o: any) => s + (parseFloat(o.amount) || 0), 0);
                const orderCount = coinOrders.length;
                const giftCount = coinOrders.reduce((s: number, o: any) => s + ((o.giftOrders as any[]) || []).length, 0);
                // 展平订单按时间从近到远
                const flatOrders: any[] = [];
                coinOrders.forEach((o: any) => {
                  flatOrders.push({ ...o, _isGift: o.isGift === true || o.isGift === 1 });
                  ((o.giftOrders as any[]) || []).forEach((g: any) => {
                    flatOrders.push({ ...g, _isGift: true, _parentCoin: o.coin });
                  });
                });
                flatOrders.sort((a, b) => {
                  const ta = new Date(a.createdAt || a.confirmedAt || 0).getTime();
                  const tb = new Date(b.createdAt || b.confirmedAt || 0).getTime();
                  return tb - ta;
                });
                return (
                  <div key={coin}>
                    <button
                      onClick={() => togglePerson(`coin_${coin}`)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
                    >
                      <span className="text-sm font-bold shrink-0 mr-2" style={{ color: COIN_COLORS[coin] || '#374151' }}>{coin}</span>
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        <span className="text-[11px] text-gray-700 font-mono">{totalQty.toFixed(COIN_DECIMALS[coin] ?? 4)}</span>
                        {nestedGiftQty > 0 && <span className="text-[11px] text-orange-400">+{nestedGiftQty.toFixed(COIN_DECIMALS[coin] ?? 4)}赠</span>}
                        <span className="text-[11px] text-blue-500">{orderCount}单</span>
                        {giftCount > 0 && <span className="text-[11px] text-orange-400">{giftCount}赠</span>}
                        <span className="text-[11px] text-gray-500">{totalAmount >= 10000 ? (totalAmount/10000).toFixed(1)+'万' : totalAmount.toFixed(0)}U</span>
                      </div>
                      <span className={`transition-transform duration-200 shrink-0 ml-1 text-gray-400 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {isOpen && (
                      <div className="mt-1 mb-2 rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                        <div className="divide-y divide-gray-50">
                          {flatOrders.map((order: any) => {
                            const isGift = order._isGift;
                            const statusDisplay = getStatusDisplay(order);
                            const qty = parseFloat(order.quantity || 0);
                            const oCoin = order.coin || order._parentCoin || coin;
                            const tier = order.equityTier || 0;
                            const rate = EQUITY_DISCOUNT_RATES[tier] ?? 1.0;
                            const effQty = qty * rate;
                            const hasDiscount = Math.abs(effQty - qty) > 0.00005;
                            const amount = parseFloat(order.amount || 0);
                            const price = parseFloat(order.limitPrice || 0);
                            const dateStr = formatDate(order.confirmedAt || order.createdAt);
                            const nickname = order.nickname || order.username || '';
                            return (
                              <div key={order.id} className={`flex items-center px-2.5 py-1.5 gap-1 min-h-[28px] ${isGift ? 'bg-amber-50/40' : ''}`}>
                                {isGift ? (
                                  <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-600 shrink-0">赠</span>
                                ) : (
                                  <span className="text-[9px] px-1 py-0 rounded bg-blue-50 text-blue-500 shrink-0">正</span>
                                )}
                                <span className="text-[11px] text-gray-700 flex-1 text-right font-mono">
                                  {qty.toFixed(COIN_DECIMALS[oCoin] ?? 4)}
                                </span>
                                {!isGift && tier > 0 && hasDiscount ? (
                                  <span className="text-[9px] text-purple-500 shrink-0 w-16 text-right">T{tier}→{effQty.toFixed(COIN_DECIMALS[oCoin] ?? 4)}</span>
                                ) : (
                                  <span className="w-16 shrink-0" />
                                )}
                                {price > 0 && <span className="text-[9px] text-gray-500 shrink-0">${price.toFixed(2)}</span>}
                                <span className="text-[10px] text-gray-400 w-10 text-right shrink-0">{amount > 0 ? amount.toFixed(0)+'U' : ''}</span>
                                <span className={`text-[9px] w-8 text-center shrink-0 ${statusDisplay.color}`}>{statusDisplay.label}</span>
                                <span className="text-[9px] text-gray-400 w-14 text-right shrink-0">{dateStr}</span>
                                {nickname && <span className="text-[9px] text-gray-400 shrink-0 ml-0.5 max-w-[40px] truncate">{nickname}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        ) : groupMode === 'price' ? (
          /* ── 价格维度分组 ── */
          <div className="space-y-2 pb-6">
            {(() => {
              const COIN_DECIMALS: Record<string, number> = { SOL: 1, BTC: 4, ETH: 2 };
              // 按买入价格分组（同一价格归为一组）
              const priceMap = new Map<string, { price: number; coin: string; orders: any[] }>();
              (filteredOrders || []).forEach((order: any) => {
                const price = parseFloat(order.limitPrice || '0');
                if (price <= 0) return;
                const coin = order.coin || '未知';
                const key = `${coin}_${price.toFixed(2)}`;
                if (!priceMap.has(key)) priceMap.set(key, { price, coin, orders: [] });
                priceMap.get(key)!.orders.push(order);
              });
              // 按币种分组后按价格从低到高排序
              const priceGroups = Array.from(priceMap.values()).sort((a, b) => {
                if (a.coin !== b.coin) return a.coin.localeCompare(b.coin);
                return a.price - b.price;
              });
              return priceGroups.map(group => {
                const gKey = `price_${group.coin}_${group.price}`;
                const isOpen = expandedPersons[gKey] ?? false;
                const totalQty = group.orders.reduce((s: number, o: any) => s + (parseFloat(o.quantity) || 0), 0);
                const giftQty = group.orders.reduce((s: number, o: any) => {
                  return s + ((o.giftOrders as any[]) || []).reduce((gs: number, g: any) => gs + (parseFloat(g.quantity) || 0), 0);
                }, 0);
                const orderCount = group.orders.length;
                const giftCount = group.orders.reduce((s: number, o: any) => s + ((o.giftOrders as any[]) || []).length, 0);
                // 展平
                const flatOrders: any[] = [];
                group.orders.forEach((o: any) => {
                  flatOrders.push({ ...o, _isGift: o.isGift === true || o.isGift === 1 });
                  ((o.giftOrders as any[]) || []).forEach((g: any) => {
                    flatOrders.push({ ...g, _isGift: true, _parentCoin: o.coin });
                  });
                });
                flatOrders.sort((a, b) => {
                  const ta = new Date(a.createdAt || a.confirmedAt || 0).getTime();
                  const tb = new Date(b.createdAt || b.confirmedAt || 0).getTime();
                  return tb - ta;
                });
                return (
                  <div key={gKey}>
                    <button
                      onClick={() => togglePerson(gKey)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors bg-white border border-gray-200 hover:bg-gray-50 shadow-sm"
                    >
                      <div className="flex items-center gap-1.5 shrink-0 mr-2">
                        <span className="text-sm font-bold text-gray-800">{group.coin}</span>
                        <span className="text-xs text-gray-500">${group.price.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        <span className="text-[11px] text-gray-700 font-mono">{totalQty.toFixed(COIN_DECIMALS[group.coin] ?? 4)}</span>
                        {giftQty > 0 && <span className="text-[11px] text-orange-400">+{giftQty.toFixed(COIN_DECIMALS[group.coin] ?? 4)}赠</span>}
                        <span className="text-[11px] text-blue-500">{orderCount}单</span>
                        {giftCount > 0 && <span className="text-[11px] text-orange-400">{giftCount}赠</span>}
                      </div>
                      <span className={`transition-transform duration-200 shrink-0 ml-1 text-gray-400 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {isOpen && (
                      <div className="mt-1 mb-2 rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                        <div className="divide-y divide-gray-50">
                          {flatOrders.map((order: any) => {
                            const isGift = order._isGift;
                            const statusDisplay = getStatusDisplay(order);
                            const qty = parseFloat(order.quantity || 0);
                            const oCoin = order.coin || order._parentCoin || group.coin;
                            const tier = order.equityTier || 0;
                            const rate = EQUITY_DISCOUNT_RATES[tier] ?? 1.0;
                            const effQty = qty * rate;
                            const hasDiscount = Math.abs(effQty - qty) > 0.00005;
                            const amount = parseFloat(order.amount || 0);
                            const dateStr = formatDate(order.confirmedAt || order.createdAt);
                            const nickname = order.nickname || order.username || '';
                            return (
                              <div key={order.id} className={`flex items-center px-2.5 py-1.5 gap-1 min-h-[28px] ${isGift ? 'bg-amber-50/40' : ''}`}>
                                {isGift ? (
                                  <span className="text-[9px] px-1 py-0 rounded bg-amber-100 text-amber-600 shrink-0">赠</span>
                                ) : (
                                  <span className="text-[9px] px-1 py-0 rounded bg-blue-50 text-blue-500 shrink-0">正</span>
                                )}
                                <span className="text-[11px] text-gray-700 flex-1 text-right font-mono">
                                  {qty.toFixed(COIN_DECIMALS[oCoin] ?? 4)}
                                </span>
                                {!isGift && tier > 0 && hasDiscount ? (
                                  <span className="text-[9px] text-purple-500 shrink-0 w-16 text-right">T{tier}→{effQty.toFixed(COIN_DECIMALS[oCoin] ?? 4)}</span>
                                ) : (
                                  <span className="w-16 shrink-0" />
                                )}
                                <span className="text-[10px] text-gray-400 w-10 text-right shrink-0">{amount > 0 ? amount.toFixed(0)+'U' : ''}</span>
                                <span className={`text-[9px] w-8 text-center shrink-0 ${statusDisplay.color}`}>{statusDisplay.label}</span>
                                <span className="text-[9px] text-gray-400 w-14 text-right shrink-0">{dateStr}</span>
                                {nickname && <span className="text-[9px] text-gray-400 shrink-0 ml-0.5 max-w-[40px] truncate">{nickname}</span>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="space-y-4 pb-6">
            {(() => {
              // 分组逻辑：
              // - 持仓中（status=completed）：按登记时间 confirmedAt 分组
              // - 委托中（status=pending）：按开仓时间 createdAt 分组
              // 注：赠单嵌套在正单的 giftOrders 里，不单独分组
              const toDateKey = (d: Date | null) => d
                ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                : '未知日期';
              const getOrderDateKey = (order: any): string => {
                // 持仓中（completed）：用登记时间 confirmedAt
                if (order.status === 'completed' && order.confirmedAt) {
                  return toDateKey(new Date(order.confirmedAt));
                }
                // 委托中（pending）或无登记时间：用开仓时间 createdAt
                return toDateKey(order.createdAt ? new Date(order.createdAt) : null);
              };
              const dateGroups: Record<string, any[]> = {};
              (filteredOrders || []).forEach((order: any) => {
                const dateKey = getOrderDateKey(order);
                if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
                dateGroups[dateKey].push(order);
              });
              const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));
              return sortedDates.map(dateKey => {
                const groupOrders = dateGroups[dateKey];
                // 如果该日期下没有任何有效订单（全是撤销单），则不渲染该日期分组
                const hasActiveOrders = groupOrders.some((o: any) => o.status !== 'cancelled');
                if (!hasActiveOrders) return null;
                const isOpen = expandedDates[dateKey] ?? false;
                // 是否该日期所有正单（含其嵌套赠与单）已全部卖出
                const allSold = groupOrders.every((o: any) => {
                  if (o.sellStatus !== 'sold') return false;
                  const gifts: any[] = (o.giftOrders as any[]) || [];
                  return gifts.every((g: any) => g.sellStatus === 'sold');
                });
                // 统计：投入总额、各币种持仓数量（过滤掉已撤单）
                const activeOrders = groupOrders.filter((o: any) => o.status !== 'cancelled');
                const totalAmount = activeOrders.reduce((s: number, o: any) => s + (parseFloat(o.amount) || 0), 0);
                const coinQty: Record<string, number> = {};
                const coinQtyEffective: Record<string, number> = {}; // 折后数量
                activeOrders.forEach((o: any) => {
                  // 正单本身：排除已卖出的，不计入币种持仓统计
                  if (o.sellStatus !== 'sold' && o.coin) {
                    const qty = parseFloat(o.quantity) || 0;
                    coinQty[o.coin] = (coinQty[o.coin] || 0) + qty;
                    const tier = o.equityTier || 0;
                    const rate = EQUITY_DISCOUNT_RATES[tier] ?? 1.0;
                    coinQtyEffective[o.coin] = (coinQtyEffective[o.coin] || 0) + qty * rate;
                  }
                  // 嵌套赠与单：无论正单是否已卖出，都遍历赠单（排除已卖出的赠单）
                  const gifts: any[] = (o.giftOrders as any[]) || [];
                  gifts.forEach((g: any) => {
                    if (g.sellStatus === 'sold') return;
                    if (g.coin) {
                      const gQty = parseFloat(g.quantity) || 0;
                      coinQty[g.coin] = (coinQty[g.coin] || 0) + gQty;
                      const gTier = g.equityTier || 0;
                      const gRate = EQUITY_DISCOUNT_RATES[gTier] ?? 1.0;
                      coinQtyEffective[g.coin] = (coinQtyEffective[g.coin] || 0) + gQty * gRate;
                    }
                  });
                });
                const qtyStr = Object.entries(coinQty).map(([c, q]) => `${q.toFixed(4)} ${c}`).join(' / ');
                return (
                  <div key={dateKey}>
                    {/* 日期分组标题行 */}
                    {(() => {
                      // 月-日简写
                      const shortDate = dateKey.slice(5); // "05-28"
                      // 正单数量（非赠单，过滤掉已撤单）
                      const normalCount = activeOrders.filter((o: any) => !o.isGift).length;
                      // 赠单数量：独立显示的赠单行 + 嵌套在正单giftOrders里的赠单（过滤掉已撤单）
                      const directGiftCount = activeOrders.filter((o: any) => o.isGift === true || o.isGift === 1).length;
                      const nestedGiftCount = activeOrders.reduce((s: number, o: any) => s + ((o.giftOrders as any[] || []).length), 0);
                      const giftCount = directGiftCount + nestedGiftCount;
                      // 各币种简写和颜色：ETH→E(蓝色) BTC→B(橙色) SOL→S(绿色)
                      const COIN_CONFIG: Record<string, { short: string; color: string }> = {
                        ETH: { short: 'E', color: 'text-blue-500' },
                        BTC: { short: 'B', color: 'text-orange-400' },
                        SOL: { short: 'S', color: 'text-green-500' },
                      };
                      // 按 ETH→BTC→SOL 顺序排列
                      const COIN_ORDER = ['ETH', 'BTC', 'SOL'];
                      // 各币种小数位数：SOL 1位、BTC 4位、ETH 2位，其他默认4位
                      const COIN_DECIMALS: Record<string, number> = { SOL: 1, BTC: 4, ETH: 2 };
                      const fmtCoinQty = (coin: string, num: number) => num.toFixed(COIN_DECIMALS[coin] ?? 4);
                      const sortedCoinParts = Object.entries(coinQty)
                        .sort(([a], [b]) => {
                          const ai = COIN_ORDER.indexOf(a);
                          const bi = COIN_ORDER.indexOf(b);
                          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                        })
                        .map(([c, q]) => {
                          const cfg = COIN_CONFIG[c] || { short: c, color: 'text-gray-500' };
                          const qNum = q as number;
                          const qStr = fmtCoinQty(c, qNum);
                          const effNum = coinQtyEffective[c] ?? qNum;
                          // 只有折后数量与原始数量不同时才显示括号（精度到4位小数比较）
                          const hasDiscount = Math.abs(effNum - qNum) > 0.00005;
                          const effStr = hasDiscount ? fmtCoinQty(c, effNum) : null;
                          // 折后占原始的百分比（不带小数）
                          const pctStr = hasDiscount ? `${Math.round((effNum / qNum) * 100)}%` : null;
                          return { short: cfg.short, color: cfg.color, qStr, effStr, pctStr };
                        });
                      return (
                        <button
                          onClick={() => toggleDate(dateKey)}
                          className={`w-full flex items-center justify-between px-3 py-2 mb-1.5 rounded-xl transition-colors ${
                            allSold
                              ? 'bg-gray-100 border border-gray-200 hover:bg-gray-150'
                              : 'bg-blue-50 border border-blue-100 hover:bg-blue-100'
                          }`}
                        >
                          {/* 左侧：日期 */}
                          <span className={`text-sm font-bold shrink-0 mr-2 ${allSold ? 'text-gray-400' : 'text-blue-700'}`}>{shortDate}</span>
                          {/* 右侧：两行内容 */}
                          <div className="flex flex-col gap-0.5 flex-1 min-w-0 overflow-hidden">
                            {/* 第一行：几单 / 赠单 / 金额 */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[11px] shrink-0 ${allSold ? 'text-gray-400' : 'text-blue-400'}`}>{normalCount}单</span>
                              {giftCount > 0 && <span className={`text-[11px] shrink-0 ${allSold ? 'text-gray-400' : 'text-orange-400'}`}>{giftCount}赠</span>}
                              <span className={`text-[11px] shrink-0 ${allSold ? 'text-gray-400' : 'text-gray-600'}`}>{totalAmount >= 10000 ? (totalAmount/10000).toFixed(1)+'万' : totalAmount.toFixed(0)}U</span>
                            </div>
                            {/* 第二行：币种数量 + 折后数量 */}
                            {sortedCoinParts.length > 0 && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {sortedCoinParts.map(({ short, color, qStr, effStr, pctStr }) => (
                                  <span key={short} className={`text-[11px] shrink-0 ${allSold ? 'text-gray-400' : color}`}>
                                    {short}:{qStr}
                                    {effStr && (
                                      <span>
                                        ({effStr}<span className="text-gray-400 ml-0.5">{pctStr}</span>)
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className={`transition-transform duration-200 shrink-0 ml-1 ${allSold ? 'text-gray-400' : 'text-blue-400'} ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                        </button>
                      );
                    })()}
                    {/* 该日期下的订单列表 */}
                    {isOpen && groupOrders.map((order: any) => {
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
                <div key={order.id} className={`rounded-2xl p-4 shadow-sm mb-3 ${allSold ? 'bg-gray-50' : 'bg-white'}`}>
                  {/* 订单编号行 */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono text-gray-400 tracking-wide">{orderNo}</span>
                    {/* 两行时间：开仓时间 + 登记时间 */}
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] text-gray-400">
                        <span className="text-gray-300 mr-1">开仓</span>{formatDate(order.createdAt)}
                      </span>
                      {order.confirmedAt && (
                        <span className="text-[10px] text-blue-400">
                          <span className="text-blue-300 mr-1">登记</span>{formatDate(order.confirmedAt)}
                        </span>
                      )}
                    </div>
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
                  <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-xs">
                    {/* 币种 */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 w-12 shrink-0">币种</span>
                      <span className="font-medium">{order.coin}</span>
                    </div>
                    {/* 状态（综合买入+卖出状态） */}
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 w-12 shrink-0">状态</span>
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
                      <span className="text-gray-400 w-12 shrink-0">买入价</span>
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
                      <span className="text-gray-400 w-12 shrink-0">数量</span>
                      <span className="font-medium text-gray-900">
                        {(() => {
                          const raw = isEditing ? (previewQuantity || editState!.quantity) : order.quantity;
                          const num = parseFloat(raw);
                          const trimmed = isNaN(num) ? raw : num.toFixed(8).replace(/\.?0+$/, '');
                          return `${trimmed} ${order.coin}`;
                        })()}
                      </span>
                    </div>
                    {/* 实际有效持仓（单独一行，仅当权益有折扣档位>0时显示） */}
                    {order.status === 'completed' && order.equityTier > 0 && (() => {
                      const raw = order.quantity;
                      const num = parseFloat(raw);
                      const rate = EQUITY_DISCOUNT_RATES[order.equityTier] || 1.0;
                      const effectiveNum = num * rate;
                      const pct = (rate * 100).toFixed(2);
                      return (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400 w-12 shrink-0">实际持仓</span>
                          <span className="text-xs text-orange-500">
                            {effectiveNum.toFixed(8).replace(/\.?0+$/, '')} {order.coin} ({pct}%)
                          </span>
                        </div>
                      );
                    })()}
                    {/* 实际投入（正单显示自己amount，赠单显示sourceAmount） */}
                    {(() => {
                      const srcAmt = parseFloat(order.sourceAmount || '0');
                      const selfAmt = parseFloat(order.amount || '0');
                      const investAmt = order.isGift ? srcAmt : selfAmt;
                      if (investAmt <= 0) return null;
                      return (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400 w-12 shrink-0">实际投入</span>
                          <span className="font-medium text-gray-900">{investAmt.toFixed(2)} USDT</span>
                        </div>
                      );
                    })()}
                    {/* 赠送市值（赠单专用，含倍数；正单不显示此行） */}
                    {order.isGift && (() => {
                      const srcAmt = parseFloat(order.sourceAmount || '0');
                      const giftAmt = parseFloat(order.amount || '0');
                      const ratio = srcAmt > 0 ? (giftAmt / srcAmt) : 0;
                      return (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400 w-12 shrink-0">赠送市值</span>
                          <span className="font-medium text-gray-900">
                            {giftAmt.toFixed(2)} USDT
                            {ratio > 0 && <span className="font-normal text-gray-400 ml-1">({ratio.toFixed(4)}倍)</span>}
                          </span>
                        </div>
                      );
                    })()}
                    {/* 订单价值 */}
                    {(() => {
                      const amount = parseFloat(order.amount);
                      const tradeValue = order.isGift ? amount : amount * 5.25;
                      return (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400 w-12 shrink-0">订单价值</span>
                          <span className="text-gray-900 font-medium">{tradeValue.toFixed(2)} USDT</span>
                        </div>
                      );
                    })()}
                    {/* 卖出价格（委卖中或已卖出时显示） */}
                    {(order.sellStatus === 'selling' || order.sellStatus === 'sold') && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 w-12 shrink-0">卖出价</span>
                        <span className="font-medium text-gray-900">
                          {parseFloat(order.sellPrice).toLocaleString()} USDT
                        </span>
                      </div>
                    )}
                    {/* 卖出时间（已卖出时显示） */}
                    {order.sellStatus === 'sold' && order.sellConfirmedAt && (
                      <div className="flex items-center gap-1 col-span-2">
                        <span className="text-gray-400 w-12 shrink-0">卖出时间</span>
                        <span className="text-gray-500">{formatDate(order.sellConfirmedAt)}</span>
                      </div>
                    )}
                    {/* 当前权益 */}
                    {order.status === 'completed' && (() => {
                      const rate = EQUITY_DISCOUNT_RATES[order.equityTier] || 1.0;
                      const pct = (rate * 100).toFixed(2);
                      const tierLabel = order.equityTier === 0 ? 'D0档' : `D${order.equityTier}档`;
                      return (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400 w-12 shrink-0">当前权益</span>
                          <span className={`font-medium ${rate >= 1.0 ? 'text-gray-900' : 'text-orange-500'}`}>{pct}% <span className="text-gray-400">({tierLabel})</span></span>
                        </div>
                      );
                    })()}
                    {/* 扫描最低价（持仓中/委卖中显示） */}
                    {order.status === 'completed' && (order as any).allTimeLowPrice && (() => {
                      const lowPrice = parseFloat((order as any).allTimeLowPrice);
                      const lowAt = (order as any).allTimeLowAt;
                      const lowDate = lowAt ? new Date(lowAt) : null;
                      const fmtLow = lowDate ? `${lowDate.getMonth()+1}月${lowDate.getDate()}日` : '';
                      return (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400 w-12 shrink-0">最低扫描</span>
                          <span className="font-medium text-blue-600">
                            {lowPrice.toLocaleString()} USDT
                            {fmtLow && <span className="text-gray-400 ml-1">({fmtLow})</span>}
                          </span>
                        </div>
                      );
                    })()}
                    {/* 累计管理费：从下单时间（createdAt）开始算，撤单则作废，成交/委卖/持仓均累计（含赠单） */}
                    {(order.status === 'completed' || order.status === 'pending') && (() => {
                      const amount = parseFloat(order.amount);
                      // 赠单直接用amount（赠送市值），正单用amount×5.25（订单价值）
                      const tradeValue = order.isGift ? amount : amount * 5.25;
                      const dailyFee = tradeValue / 0.75 * 0.12 / 365;
                      // 开始日期：从下单时间（createdAt）算起，修改价格等操作不影响管理费
                      const startDate = new Date(order.createdAt);
                      const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                      // 结束日期：已卖出用 sellConfirmedAt，其他状态用今天
                      // 北京时间（UTC+8）当天日期
                      const nowBJ = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
                      nowBJ.setHours(0,0,0,0);
                      let endDay: Date;
                      if (order.sellStatus === 'sold' && order.sellConfirmedAt) {
                        const sellDate = new Date(new Date(order.sellConfirmedAt).toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
                        endDay = new Date(sellDate.getFullYear(), sellDate.getMonth(), sellDate.getDate());
                      } else {
                        endDay = nowBJ;
                      }
                      const holdDays = Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / (1000*60*60*24)) + 1);
                      const totalFee = dailyFee * holdDays;
                      const isPending = order.status === 'pending';
                      const isSold = order.sellStatus === 'sold';
                      // 日期格式化函数
                      const fmtDay = (d: Date) => `${d.getMonth()+1}月${d.getDate()}日`;
                      return (
                        <>
                          <div className="flex items-center gap-1 col-span-2">
                            <span className="text-gray-400 w-12 shrink-0">管理费</span>
                            <span className={`font-medium ${isPending ? 'text-gray-400' : isSold ? 'text-gray-500' : 'text-gray-900'}`}>
                              {totalFee.toFixed(4)} USDT
                              {isPending && <span className="text-gray-400 font-normal ml-1">撤单则作废</span>}
                              {isSold && <span className="text-red-400 font-normal ml-1">✓ 已停止计费</span>}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 col-span-2">
                            <span className="text-gray-400 w-12 shrink-0">计费区间</span>
                            <span className="text-gray-500">{fmtDay(startDay)} → {fmtDay(endDay)}（共{holdDays}天，{dailyFee.toFixed(4)}/天）</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* 赠送订单来源信息 */}
                  {order.isGift && order.sourceUsername && (() => {
                    const srcAmt = parseFloat(order.sourceAmount || '0');
                    const giftAmt = parseFloat(order.amount || '0');
                    const ratio = srcAmt > 0 ? (giftAmt / srcAmt) : 0;
                    const ratioStr = ratio > 0 ? `赠送市值${ratio.toFixed(4)}倍` : '';
                    return (
                      <div className="mt-2 text-xs rounded-lg px-3 py-1.5 border text-gray-500 bg-gray-50 border-gray-100">
                        推荐人奖励订单 · 来自 <span className="font-medium text-gray-700">{order.sourceUsername}</span>
                      </div>
                    );
                  })()}

                  {/* 赠予订单折叠区块（仅对持仓中的非赠予正单显示；委卖中不嵌套，每单独立展示） */}
                  {!order.isGift && statusFilter !== 'selling' && (() => {
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
                              // 优先用 payoutRatio（真实拨比%），fallback 不显示
                              const ratioLabel = g.payoutRatio != null
                                ? `${parseFloat(g.payoutRatio).toFixed(1)}%拨比`
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
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
