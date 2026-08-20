import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Pencil, Check, X, ChevronRight, ChevronDown, Trash2, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  tierMode: 'step' | 'linear'; // 档位计算模式
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

// 北京时间辅助函数（MySQL存储的是北京时间，服务端String()后UTC值即为北京时间值）
// 获取北京时间的日期零点（用于天数计算）
const getBJDateOnly = (d: any): Date => {
  if (!d) return new Date(0);
  const dt = new Date(d);
  // 统一转换为北京时间取年月日，不依赖服务端时区假设
  const bj = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return new Date(Date.UTC(bj.getFullYear(), bj.getMonth(), bj.getDate()));
};
const getTodayBJDateOnly = (): Date => {
  const bjNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return new Date(Date.UTC(bjNow.getFullYear(), bjNow.getMonth(), bjNow.getDate()));
};

// 管理费明细弹窗组件
function FeeDetailModal({ orders, onClose }: { orders: any[], onClose: () => void }) {
  const todayStart = getTodayBJDateOnly();

  const feeItems = orders
    .filter((o: any) => o.side === 'buy' && o.status === 'completed')
    .map((o: any) => {
      const amount = parseFloat(o.amount || '0');
      const tradeValue = o.isGift ? amount : amount * 5.25;
      const dailyFee = tradeValue / 0.75 * 0.12 / 365;
      // 管理费从下单时间（created_at）开始计算，修改价格等操作不影响管理费
      const confirmedDay = getBJDateOnly(o.createdAt);
      let holdDays: number;
      let feeType: string;
      if (o.sellStatus === 'sold' && o.sellConfirmedAt) {
        const sellDay = getBJDateOnly(o.sellConfirmedAt);
        holdDays = Math.max(1, Math.floor((sellDay.getTime() - confirmedDay.getTime()) / (1000*60*60*24)) + 1);
        feeType = '已结清';
      } else {
        holdDays = Math.max(1, Math.floor((todayStart.getTime() - confirmedDay.getTime()) / (1000*60*60*24)) + 1);
        feeType = '进行中';
      }
      const totalFee = dailyFee * holdDays;
      const orderDate = new Date(o.createdAt);
      const yy = String(orderDate.getUTCFullYear()).slice(2);
      const mm = String(orderDate.getUTCMonth()+1).padStart(2,'0');
      const dd = String(orderDate.getUTCDate()).padStart(2,'0');
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
                  <span className="text-xs text-gray-600 font-medium">{item.username && item.nickname && item.username !== item.nickname ? `${item.username}/${item.nickname}` : item.nickname || item.username}</span>
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

// 订单详情管理费行（独立子组件，避免在IIFE中使用Hooks）
function FeeRow({ order, ledgerId, viewAsUserId }: { order: any; ledgerId: number; viewAsUserId?: number }) {
  const [feeExpanded, setFeeExpanded] = useState(false);
  const { data: prepaidLogs } = trpc.ledger.afGetPrepaidFeeLogs.useQuery(
    { ledgerId: order.ledgerId || ledgerId, orderId: order.id, viewAsUserId: viewAsUserId || undefined },
    { enabled: feeExpanded }
  );
  const amount = parseFloat(order.amount);
  const tradeValue = order.isGift ? amount : amount * 5.25;
  const dailyFee = tradeValue / 0.75 * 0.12 / 365;
  const startDay = getBJDateOnly(order.createdAt);
  const endDay = (order.sellStatus === 'sold' && order.sellConfirmedAt)
    ? getBJDateOnly(order.sellConfirmedAt)
    : getTodayBJDateOnly();
  const holdDays = Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / (1000*60*60*24)) + 1);
  const totalFee = dailyFee * holdDays;
  const isPending = order.status === 'pending';
  const isSold = order.sellStatus === 'sold';
  // fmtDay: UTC日期即为北京时间日期
  const fmtDay = (d: Date) => `${d.getUTCMonth()+1}/${d.getUTCDate()}`;
  const prepaidFee = order.prepaidFee || 0;
  const remainingFee = Math.max(0, totalFee - prepaidFee);
  return (
    <div className="col-span-2">
      <div className="flex items-center gap-1">
        <span className="text-gray-400 w-16 shrink-0">待付管理费</span>
        <span className={`font-medium ${isPending ? 'text-gray-400' : isSold ? 'text-gray-500' : 'text-orange-500'}`}>
          {remainingFee.toFixed(4)} <span className="text-gray-400">u</span>
        </span>
        <span className="text-gray-400 ml-1 text-[10px]">({fmtDay(startDay)}→{fmtDay(endDay)} {holdDays}天{isPending ? ' 撤单则作废' : ''}{isSold ? ' ✓已停计' : ''})</span>
      </div>
      <div className="mt-2 bg-gray-50 rounded-xl p-3 text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-gray-500">实际管理费</span>
          <span className="font-medium text-gray-700">{totalFee.toFixed(4)} u
            <span className="text-gray-400 ml-1">({dailyFee.toFixed(4)}/天×{holdDays}天)</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">已付管理费</span>
          <span className="font-medium text-green-600">{prepaidFee.toFixed(4)} u</span>
        </div>
        <div className="flex justify-between border-t border-gray-200 pt-1.5">
          <span className="text-gray-500">待付管理费</span>
          <span className="font-bold text-orange-500">{remainingFee.toFixed(4)} u</span>
        </div>
        {prepaidLogs && prepaidLogs.logs.length > 0 && (
          <div className="mt-2 border-t border-gray-200 pt-2">
            <div className="text-gray-400 mb-1">已付记录</div>
            {prepaidLogs.logs.map((log: any, i: number) => (
              <div key={i} className="flex justify-between text-[10px] py-0.5">
                <span className="text-gray-400">{log.createdAt?.slice(0,10)}</span>
                <span className="text-green-600 font-medium">+{log.amount.toFixed(4)} u</span>
                {log.note && <span className="text-gray-400 ml-1 truncate max-w-[80px]">{log.note}</span>}
              </div>
            ))}
          </div>
        )}
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
  // 搜索关键词
  const [searchQuery, setSearchQuery] = useState('');
  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteScope, setDeleteScope] = useState<'all' | 'mainOnly' | 'selected'>('all');
  const [selectedGiftIds, setSelectedGiftIds] = useState<number[]>([]);
  const [refundChecked, setRefundChecked] = useState(false);
  // 状态筛选：all / pending(委买中) / holding(持仓中) / selling(委卖中) / sold(已卖出)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'holding' | 'selling' | 'sold' | 'cancelled'>('all');
  // 分组维度：时间 / 人员
  const [groupMode, setGroupMode] = useState<'time' | 'person' | 'coin' | 'price' | 'sellPrice'>('time');
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
  // 走服务器tRPC获取币价（price-scanner缓存，3秒刷新）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 3000, staleTime: 2000 });
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

  const deleteMutation = trpc.ledger.afAdminDeleteOrder.useMutation({
    onSuccess: () => {
      toast.success("订单已删除");
      setDeleteTarget(null);
      utils.ledger.afAdminGetOrders.invalidate({ ledgerId });
      utils.ledger.afAdminGetStats.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("删除失败：" + e.message),
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
    // 赠单不含本金，只享受纯收益；正单含本金
    const isGiftOrder = order.isGift === true || order.isGift === 1;
    const totalRefund = isGiftOrder ? Math.max(0, totalProfit) : principal + Math.max(0, totalProfit);

    // 管理费计算：从下单时间（createdAt）开始，修改价格等操作不影响管理费
    const tradeValue = isGiftOrder ? principal : principal * 5.25;
    const dailyFee = tradeValue / 0.75 * 0.12 / 365;
    // 开始日期：从下单时间（createdAt）算起，撤单则作废，成交后累计不重置
    const confirmedDay = getBJDateOnly(order.createdAt);
    // 结束日期：已卖出用 sellConfirmedAt，其他状态用北京时间今天
    const endDay = (order.sellStatus === 'sold' && order.sellConfirmedAt)
      ? getBJDateOnly(order.sellConfirmedAt)
      : getTodayBJDateOnly();
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
      tierMode: (order.tierMode || 'step') as 'step' | 'linear',
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
      tierMode: editState.tierMode,
    });
  };

  // 根据筛选条件过滤订单
  // 互斥分类规则（四Tab加起来 = 全部）：
  //   全部    = 排除 cancelled + 排除赠单pending
  //   委买中  = status=pending 且 非赠单
  //   委卖中  = sellStatus=selling（优先级高于持仓中）
  //   已卖出  = sellStatus=sold
  //   持仓中  = completed 且 sellStatus 不是 sold/selling（即 null 或 sell_cancelled）
  const filteredOrders = (orders as any[] | undefined)?.filter((order: any) => {
    const isGift = order.isGift === true || order.isGift === 1;
    // 已撤销订单在所有Tab中均不显示
    if (statusFilter === 'cancelled') return order.status === 'cancelled';
    if (order.status === 'cancelled') return false;
    // 赠单按自身状态独立过滤，不再嵌套在主单下
    // 全部Tab不含已撤单（已撤单单独一个Tab）
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return order.status === 'pending' && !isGift;
    if (statusFilter === 'selling') return order.sellStatus === 'selling';
    if (statusFilter === 'sold') return order.sellStatus === 'sold';
    if (statusFilter === 'holding') {
      // 持仓中：completed 且 sellStatus 不是 sold 也不是 selling（含正单+赠单）
      return order.status === 'completed' && order.sellStatus !== 'sold' && order.sellStatus !== 'selling';
    }
    return true;
  }) ?? [];

  // 搜索过滤（支持订单号、币种、用户名、昵称）
  const searchedOrders = searchQuery.trim()
    ? filteredOrders.filter((order: any) => {
        const q = searchQuery.trim().toLowerCase();
        const orderNo = (order.orderNo || '').toLowerCase();
        const coin = (order.coin || '').toLowerCase();
        const nickname = (order.nickname || '').toLowerCase();
        const username = (order.username || '').toLowerCase();
        return orderNo.includes(q) || coin.includes(q) || nickname.includes(q) || username.includes(q);
      })
    : filteredOrders;

  // 日期格式化：完整时间（用于气泡）
  const formatDateFull = (d: any) => {
    if (!d) return "-";
    const s = typeof d === 'string' ? d : new Date(d).toISOString();
    return s.replace('T', ' ').substring(0, 19);
  };
  // 日期格式化：显示 YY-MM-DD HH:mm:ss（北京时间）
  // MySQL存的是北京时间，服务端UTC环境String()后UTC值=北京时间值，直接用UTC方法即可
  const formatDate = (d: any) => {
    if (!d) return "-";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "-";
    // 统一转换为北京时间显示，不依赖服务端时区假设
    const bj = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const yy = String(bj.getFullYear()).slice(2);
    const mm = String(bj.getMonth() + 1).padStart(2, '0');
    const dd = String(bj.getDate()).padStart(2, '0');
    const hh = String(bj.getHours()).padStart(2, '0');
    const min = String(bj.getMinutes()).padStart(2, '0');
    const ss = String(bj.getSeconds()).padStart(2, '0');
    return `${yy}-${mm}-${dd} ${hh}:${min}:${ss}`;
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
          <span className="text-white font-semibold text-base flex-1">订单管理</span>
          {/* 右上角：管理费明细 Tab 快捷入口 */}
          <div className="flex rounded-full p-0.5 mr-2" style={{ background: 'rgba(255,255,255,0.14)' }}>
            {([
              { key: 'gujian', label: '谷底增筹' },
              { key: 'finance', label: '融资付息' },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setLocation(`/ledger/${ledgerId}/af-fee-detail?tab=${t.key}`)}
                className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                style={{ background: 'transparent', color: 'rgba(255,255,255,0.75)' }}
              >
                {t.label}
              </button>
            ))}
          </div>

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
              const todayStart = getTodayBJDateOnly();
              holdingOrders.forEach((o: any) => {
                if (!o.coin) return;
                const qty = parseFloat(o.quantity) || 0;
                rawQty[o.coin] = (rawQty[o.coin] || 0) + qty;
                let rate: number;
                if (o.tierMode === 'linear') {
                  const buyPrice = parseFloat(o.limitPrice) || 0;
                  const lowPrice = parseFloat(o.allTimeLowPrice) || buyPrice;
                  const dropPct = buyPrice > 0 ? Math.max(0, (buyPrice - lowPrice) / buyPrice) : 0;
                  rate = Math.max(0, 1 - dropPct);
                } else {
                  rate = EQUITY_DISCOUNT_RATES[o.equityTier || 0] ?? 1.0;
                }
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
                  const createdDay = getBJDateOnly(o.createdAt);
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
              const COIN_COLOR: Record<string, string> = { ETH: 'text-blue-300', BTC: 'text-orange-300', SOL: 'text-purple-300' };
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
                  {/* 盈利预测入口 */}
                  <button
                    onClick={() => setLocation(`/ledger/${ledgerId}/af-profit-forecast`)}
                    className="mt-2 pt-2 border-t border-gray-100 w-full flex justify-between items-center active:opacity-70"
                  >
                    <span className="text-gray-400 text-xs">盈利预测</span>
                    <span className="text-blue-500 text-xs">模拟目标价 →</span>
                  </button>
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
        interface UserDetail { name: string; rawQty: number; effQty: number; orderCount: number; isGift: boolean; equityTier: number; rate: number; isLinear?: boolean }
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
          const isLinear = o.tierMode === 'linear';
          let rate: number;
          let eqTier: number;
          if (isLinear) {
            const buyPrice = parseFloat(o.limitPrice) || 0;
            const lowPrice = parseFloat(o.allTimeLowPrice) || buyPrice;
            const dropPct = buyPrice > 0 ? Math.max(0, (buyPrice - lowPrice) / buyPrice) : 0;
            rate = Math.max(0, 1 - dropPct);
            eqTier = 0;
          } else {
            eqTier = o.equityTier || 0;
            rate = EQUITY_DISCOUNT_RATES[eqTier] ?? 1.0;
          }
          tier.rawQty += qty;
          tier.effQty += qty * rate;
          tier.orderCount += 1;
          const isGift = o.isGift === true || o.isGift === 1;
          if (isGift) tier.giftCount += 1;
          const name = o.nickname || o.username || `用户${o.userId}`;
          const userKey = `${name}_${isGift ? 'gift' : 'normal'}_${isLinear ? 'L' : eqTier}`;
          if (!tier.users[userKey]) {
            tier.users[userKey] = { name, rawQty: 0, effQty: 0, orderCount: 0, isGift, equityTier: eqTier, rate, isLinear };
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
                              {u.isLinear
                                ? <span className="text-blue-500">{(u.rate * 100).toFixed(2)}%<span className="text-[9px] ml-0.5">L</span></span>
                                : <span className="text-gray-400">{Math.round(u.rate * 100)}%</span>
                              }
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
        {/* 搜索框 */}
        <div className="px-4 pt-2 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索订单号、币种、用户名..."
              className="w-full pl-9 pr-8 py-2 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-blue-400"
              style={{ background: '#f9fafb' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>
        {/* 第一行：状态筛选（胶囊按钮样式） */}
        <div className="px-3 pt-2 pb-1">
          <div className="flex rounded p-0.5 gap-0.5" style={{ background: '#f3f4f6' }}>
            {([
              { key: 'all' as const, label: `全部(${(orders as any[])?.filter((o: any) => o.status !== 'cancelled').length ?? 0})` },
              { key: 'pending' as const, label: `委买(${(orders as any[])?.filter((o: any) => { const g = o.isGift === true || o.isGift === 1; return o.status === 'pending' && !g; }).length ?? 0})` },
              { key: 'holding' as const, label: `持仓(${(orders as any[])?.filter((o: any) => o.status === 'completed' && o.sellStatus !== 'sold' && o.sellStatus !== 'selling').length ?? 0})` },
              { key: 'selling' as const, label: `委卖(${(orders as any[])?.filter((o: any) => o.sellStatus === 'selling').length ?? 0})` },
              { key: 'sold' as const, label: `卖出(${(orders as any[])?.filter((o: any) => o.sellStatus === 'sold').length ?? 0})` },
              { key: 'cancelled' as const, label: `撤单(${(orders as any[])?.filter((o: any) => o.status === 'cancelled').length ?? 0})` },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className="flex-1 py-1.5 rounded text-xs font-medium transition-all"
                style={statusFilter === tab.key
                  ? { background: '#2563eb', color: '#fff' }
                  : { background: 'transparent', color: '#6b7280' }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {/* 第二行：分组维度切换（胶囊按钮样式） */}
        <div className="px-3 pb-2">
          <div className="flex rounded p-0.5 gap-0.5" style={{ background: '#f3f4f6' }}>
            {([
              { key: 'time' as const, label: '时间' },
              { key: 'person' as const, label: '人员' },
              { key: 'coin' as const, label: '币种' },
              { key: 'price' as const, label: '价格' },
              { key: 'sellPrice' as const, label: '卖出价' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setGroupMode(tab.key)}
                className="flex-1 py-1.5 rounded text-xs font-medium transition-all"
                style={groupMode === tab.key
                  ? { background: '#2563eb', color: '#fff' }
                  : { background: 'transparent', color: '#6b7280' }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 pt-3">

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">加载中...</div>
        ) : !orders || orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">暂无订单记录</div>
        ) : searchedOrders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">该状态下暂无订单</div>
        ) : groupMode === 'person' ? (
          /* ── 人员维度分组 ── */
          <div className="space-y-2 pb-6">
            {(() => {
              // 按人员分组
              const personMap = new Map<string, { uid: string; name: string; orders: any[] }>();
              (searchedOrders || []).forEach((order: any) => {
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
                // 计算每人的持仓币数量（排除已卖出）
                const personCoinQty: Record<string, number> = {};
                const personCoinEff: Record<string, number> = {};
                activeOrders.forEach((o: any) => {
                  if (o.sellStatus !== 'sold' && o.coin) {
                    const qty = parseFloat(o.quantity) || 0;
                    personCoinQty[o.coin] = (personCoinQty[o.coin] || 0) + qty;
                    let rate: number;
                    if (o.tierMode === 'linear') {
                      const buyPrice = parseFloat(o.limitPrice) || 0;
                      const lowPrice = parseFloat(o.allTimeLowPrice) || buyPrice;
                      const dropPct = buyPrice > 0 ? Math.max(0, (buyPrice - lowPrice) / buyPrice) : 0;
                      rate = Math.max(0, 1 - dropPct);
                    } else {
                      rate = EQUITY_DISCOUNT_RATES[o.equityTier || 0] ?? 1.0;
                    }
                    personCoinEff[o.coin] = (personCoinEff[o.coin] || 0) + qty * rate;
                  }
                  const gifts: any[] = (o.giftOrders as any[]) || [];
                  gifts.forEach((g: any) => {
                    if (g.sellStatus === 'sold') return;
                    if (g.coin) {
                      const gQty = parseFloat(g.quantity) || 0;
                      personCoinQty[g.coin] = (personCoinQty[g.coin] || 0) + gQty;
                      let gRate: number;
                      if (g.tierMode === 'linear') {
                        const gBuyPrice = parseFloat(g.limitPrice) || 0;
                        const gLowPrice = parseFloat(g.allTimeLowPrice) || gBuyPrice;
                        const gDropPct = gBuyPrice > 0 ? Math.max(0, (gBuyPrice - gLowPrice) / gBuyPrice) : 0;
                        gRate = Math.max(0, 1 - gDropPct);
                      } else {
                        gRate = EQUITY_DISCOUNT_RATES[g.equityTier || 0] ?? 1.0;
                      }
                      personCoinEff[g.coin] = (personCoinEff[g.coin] || 0) + gQty * gRate;
                    }
                  });
                });
                const COIN_ORDER_P = ['ETH', 'BTC', 'SOL'];
                const COIN_SHORT: Record<string, string> = { ETH: 'E', BTC: 'B', SOL: 'S' };
                const COIN_DEC: Record<string, number> = { SOL: 1, BTC: 4, ETH: 2 };
                const personCoinParts = Object.entries(personCoinQty)
                  .sort(([a], [b]) => {
                    const ai = COIN_ORDER_P.indexOf(a);
                    const bi = COIN_ORDER_P.indexOf(b);
                    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
                  })
                  .map(([c, q]) => {
                    const qStr = q.toFixed(COIN_DEC[c] ?? 4);
                    const effNum = personCoinEff[c] ?? q;
                    const hasDiscount = Math.abs(effNum - q) > 0.00005;
                    const effStr = hasDiscount ? effNum.toFixed(COIN_DEC[c] ?? 4) : null;
                    return { short: COIN_SHORT[c] || c, qStr, effStr };
                  });
                // 展开后的筛选
                const pFilter = getPersonFilter(group.uid);
                // 展平所有订单（正单+嵌套赠单+孤儿赠单）并按时间从近到远排序
                // 赠单已在顶层 orders 里，直接展平，不再从 giftOrders 重复展开
                const flatOrders: any[] = group.orders.map((o: any) => ({
                  ...o,
                  _isGift: o.isGift === true || o.isGift === 1,
                }));
                flatOrders.sort((a, b) => {
                  const ta = new Date(a.createdAt || a.confirmedAt || 0).getTime();
                  const tb = new Date(b.createdAt || b.confirmedAt || 0).getTime();
                  return tb - ta;
                });
                // 根据勾选筛选
                const visibleOrders = flatOrders.filter((o: any) => {
                  // 委卖中/已卖出状态优先于赠单筛选，确保赠单在委卖中/已卖出Tab下正常显示
                  if (o.sellStatus === 'selling') return pFilter.has('selling');
                  if (o.sellStatus === 'sold') return pFilter.has('sold');
                  if (o._isGift) return pFilter.has('gift');
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
                      <div className="shrink-0 mr-2">
                        <span className="text-sm font-bold text-gray-800">{group.name}</span>
                        {(() => {
                          const firstOrder = group.orders[0];
                          const bal = firstOrder?.userBalance;
                          if (bal != null) {
                            return <div className="text-[10px] text-gray-400 mt-0.5">{parseFloat(bal).toFixed(2)} U</div>;
                          }
                          return null;
                        })()}
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0 overflow-hidden">
                        {/* 第一行：单数/赠数/金额 */}
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="text-[11px] text-blue-500">{normalCount}单</span>
                          {giftCount > 0 && <span className="text-[11px] text-orange-400">{giftCount}赠</span>}
                          <span className="text-[11px] text-gray-600">{totalAmount >= 10000 ? (totalAmount/10000).toFixed(1)+'万' : totalAmount.toFixed(0)}U</span>
                        </div>
                        {/* 第二行：币种持仓数量 + 折后 */}
                        {personCoinParts.length > 0 && (
                          <div className="flex items-center gap-1.5 justify-end flex-wrap">
                            {personCoinParts.map(({ short, qStr, effStr }) => (
                              <span key={short} className="text-[11px] text-gray-500">
                                {short}:{qStr}
                                {effStr && <span className="text-green-600">({effStr})</span>}
                              </span>
                            ))}
                          </div>
                        )}
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
                        {/* 订单列表：完整卡片 */}
                        <div className="pt-2">
                          {visibleOrders.length === 0 ? (
                            <div className="text-center py-3 text-[11px] text-gray-400">无匹配订单</div>
                          ) : visibleOrders.map((order: any) => {
                            const isEditing = editingId === order.id;
                            const statusDisplay = getStatusDisplay(order);
                            let previewQuantity = editState?.quantity ?? "";
                            if (isEditing && editState) {
                              const p = parseFloat(order.limitPrice);
                              const a = parseFloat(editState.amount);
                              if (!isNaN(p) && !isNaN(a) && p > 0 && a > 0) {
                                previewQuantity = (a * 5.25 / p).toFixed(8);
                              }
                            }
                            const orderDate = new Date(order.createdAt);
                            const yy = String(orderDate.getUTCFullYear()).slice(2);
                            const mm2 = String(orderDate.getUTCMonth() + 1).padStart(2, '0');
                            const dd2 = String(orderDate.getUTCDate()).padStart(2, '0');
                            const orderNo = `AF${yy}${mm2}${dd2}${String(order.id).padStart(6, '0')}`;
                            return (
                              <div key={order.id} className="rounded-2xl p-4 shadow-sm mb-3 bg-white">
                                <div className="flex items-start justify-between mb-3 gap-3">
                                  <div className="flex flex-col gap-1 min-w-0">
                                    <span className="text-[11px] font-mono text-gray-400 tracking-wide">{orderNo}</span>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-medium text-gray-700 shrink-0">
                                        {order.username && order.nickname && order.username !== order.nickname ? `${order.username}/${order.nickname}` : order.nickname || order.username || `用户${order.userId}`}
                                      </span>
                                      {order.isGift && (<span className="inline-flex items-center justify-center font-black select-none shrink-0" style={{width:18,height:18,borderRadius:'50%',fontSize:10,color:'#FFD700',background:'radial-gradient(circle at 35% 30%, #5a1a1a 0%, #1a0a00 55%, #3d0000 100%)',boxShadow:'0 1px 4px rgba(0,0,0,0.4)',border:'1.5px solid #8B4513',textShadow:'0 1px 2px rgba(255,180,0,0.8)'}}>赠</span>)}
                                      {order.status === 'completed' && (order.tierMode === 'linear' ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{backgroundColor:'#EFF6FF',color:'#3B82F6',border:'1px solid #BFDBFE'}}>线性</span> : <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{backgroundColor:'#FFF7ED',color:'#D97706',border:'1px solid #FED7AA'}}>阶梯</span>)}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="text-[10px] text-gray-400"><span className="text-gray-300 mr-1">开仓</span>{formatDate(order.createdAt)}</span>
                                      {order.confirmedAt && <span className="text-[10px] text-blue-400"><span className="text-blue-300 mr-1">登记</span>{formatDate(order.confirmedAt)}</span>}
                                      {order.sellStatus==='selling'&&order.sellAt&&<span className="text-[10px] text-orange-400"><span className="text-orange-300 mr-1">委卖</span>{formatDate(order.sellAt)}</span>}
                                      {order.sellStatus==='sold'&&order.sellConfirmedAt&&<span className="text-[10px] text-green-500"><span className="text-green-400 mr-1">确认</span>{formatDate(order.sellConfirmedAt)}</span>}
                                    </div>
                                    {!isEditing ? (
                                      <div className="flex items-center gap-1.5">
                                        <button onClick={() => startEdit(order)} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"><Pencil className="w-3 h-3" /> 编辑</button>
                                        <button onClick={() => { setDeleteTarget(order); const ig = order.isGift===true||order.isGift===1; setDeleteScope('all'); setSelectedGiftIds([]); setRefundChecked(order.status==='pending'&&!ig); }} className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg px-2.5 py-1 transition-colors"><Trash2 className="w-3 h-3" /> 删除</button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1.5">
                                        <button onClick={saveEdit} disabled={updateMutation.isPending} className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"><Check className="w-3 h-3" /> 保存</button>
                                        <button onClick={cancelEdit} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"><X className="w-3 h-3" /> 取消</button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-xs">
                                  <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">币种</span><span className="font-medium">{order.coin}</span></div>
                                  <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">状态</span>{isEditing ? (<div className="flex flex-col gap-1"><select value={editState!.status} onChange={(e)=>setEditState({...editState!,status:e.target.value as any})} className="border border-gray-300 rounded px-2 py-0.5 text-xs"><option value="pending">委买中</option><option value="completed">买入成交</option><option value="cancelled">已撤单</option></select><select value={editState!.sellStatus||''} onChange={(e)=>{const nextSellStatus=e.target.value||null;setEditState({...editState!,sellStatus:nextSellStatus,status:nextSellStatus?'completed':editState!.status});}} className="border border-gray-300 rounded px-2 py-0.5 text-xs"><option value="">持仓中</option><option value="selling">委卖中</option><option value="sold">已卖出</option></select></div>) : (<span className={`font-medium ${statusDisplay.color}`}>{statusDisplay.label}</span>)}</div>
                                  {isEditing&&editState!.status==='completed'&&<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">档位模式</span><div className="flex rounded overflow-hidden border border-gray-300 text-xs"><button type="button" onClick={()=>setEditState({...editState!,tierMode:'step'})} className={`px-2 py-0.5 transition-colors ${editState!.tierMode==='step'?'bg-blue-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>阶梯</button><button type="button" onClick={()=>setEditState({...editState!,tierMode:'linear'})} className={`px-2 py-0.5 transition-colors ${editState!.tierMode==='linear'?'bg-blue-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>线性</button></div></div>}
                                  <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">买入价</span>{isEditing&&editState!.status==='pending'?<input type="number" value={editState!.limitPrice} onChange={(e)=>setEditState({...editState!,limitPrice:e.target.value})} className="border border-gray-300 rounded px-2 py-0.5 text-sm w-24" />:<span className="font-medium text-gray-900">{parseFloat(order.limitPrice).toLocaleString()} <span className="text-gray-400">u</span></span>}</div>
                                  <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">数量</span><span className="font-medium text-gray-900">{(()=>{const raw=isEditing?(previewQuantity||editState!.quantity):order.quantity;const num=parseFloat(raw);const trimmed=isNaN(num)?raw:num.toFixed(8).replace(/\.?0+$/,'');return `${trimmed} ${order.coin}`;})()}</span></div>
                                  {order.status==='completed'&&(()=>{const raw=order.quantity;const num=parseFloat(raw);let rate:number;if(order.tierMode==='linear'){const buyP=parseFloat(order.limitPrice||'0');const allLow=order.allTimeLowPrice?parseFloat(String(order.allTimeLowPrice)):0;rate=(buyP>0&&allLow>0)?Math.max(0,1-(buyP-allLow)/buyP):1.0;}else{rate=EQUITY_DISCOUNT_RATES[order.equityTier]||1.0;}if(rate>=1.0)return null;const effectiveNum=num*rate;const pct=(rate*100).toFixed(2);return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">实际持仓</span><span className="text-xs text-orange-500">{effectiveNum.toFixed(8).replace(/\.?0+$/,'')} {order.coin} ({pct}%)</span></div>);})()}
                                  {(()=>{const srcAmt=parseFloat(order.sourceAmount||'0');const selfAmt=parseFloat(order.amount||'0');const investAmt=order.isGift?srcAmt:selfAmt;return(<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">实际投入</span><span className="font-medium text-gray-900">{investAmt.toFixed(2)} <span className="text-gray-400">u</span></span></div>);})()}
                                  {(()=>{const amount=parseFloat(order.amount);const tradeValue=order.isGift?amount:amount*5.25;return(<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">订单价値</span><span className="text-gray-900 font-medium">{tradeValue.toFixed(2)} <span className="text-gray-400">u</span></span></div>);})()}
                                  {order.isGift&&(()=>{const srcAmt=parseFloat(order.sourceAmount||'0');const giftAmt=parseFloat(order.amount||'0');const ratio=srcAmt>0?(giftAmt/srcAmt):0;return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">赠送市値</span><span className="font-medium text-gray-900">{giftAmt.toFixed(2)} <span className="text-gray-400">u</span>{ratio>0&&<span className="font-normal text-gray-400 ml-1">({ratio.toFixed(4)}倍)</span>}</span></div>);})()}
                                  {(order.sellStatus==='selling'||order.sellStatus==='sold')&&<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">卖出价</span><span className="font-medium text-gray-900">{parseFloat(order.sellPrice).toLocaleString()} <span className="text-gray-400">u</span></span></div>}
                                  {order.sellStatus==='sold'&&order.sellConfirmedAt&&<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">卖出时间</span><span className="text-gray-500">{formatDate(order.sellConfirmedAt)}</span></div>}
                                  {order.status==='completed'&&(()=>{let rate:number;let tierLabel:string;if(order.tierMode==='linear'){const buyP=parseFloat(order.limitPrice||'0');const allLow=order.allTimeLowPrice?parseFloat(String(order.allTimeLowPrice)):0;rate=(buyP>0&&allLow>0)?Math.max(0,1-(buyP-allLow)/buyP):1.0;tierLabel='L';}else{rate=EQUITY_DISCOUNT_RATES[order.equityTier]||1.0;tierLabel=order.equityTier===0?'D0档':`D${order.equityTier}档`;}const pct=(rate*100).toFixed(2);return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">当前权益</span><span className={`font-medium ${rate>=1.0?'text-gray-900':'text-orange-500'}`}>{pct}% <span className="text-gray-400">({tierLabel})</span></span></div>);})()}
                                  {(order.status==='completed'||order.status==='pending')&&<FeeRow order={order} ledgerId={ledgerId} />}
                                </div>
                                {(order.isGift===true||order.isGift===1)&&(()=>{const parentOrder=order.sourceOrderId?(orders as any[]||[]).find((o:any)=>o.id===order.sourceOrderId):null;const parentStatus=parentOrder?(parentOrder.sellStatus==='sold'?'已卖出':parentOrder.sellStatus==='selling'?'委卖中':parentOrder.status==='completed'?'持仓中':parentOrder.status==='cancelled'?'已撤单':'委买中'):null;const parentStatusColor=parentOrder?(parentOrder.sellStatus==='sold'?'text-blue-500':parentOrder.sellStatus==='selling'?'text-red-500':parentOrder.status==='completed'?'text-green-500':'text-gray-400'):'text-gray-400';const parentOrderNo=parentOrder?(()=>{const d=new Date(parentOrder.createdAt);return `AF${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(parentOrder.id).padStart(6,'0')}`;})():null;return(<div className="mt-2 text-xs rounded-lg px-3 py-2 border border-purple-100 bg-purple-50"><div className="flex items-center justify-between"><span className="text-purple-600 font-medium">推荐人奖励赠单</span>{order.sourceUsername&&<span className="text-gray-500">来自 <span className="font-medium text-gray-700">{order.sourceUsername}</span></span>}</div>{parentOrder&&<div className="mt-1 flex items-center gap-1.5 text-gray-500"><span>关联正单</span>{parentOrderNo&&<span className="font-mono text-gray-600">{parentOrderNo}</span>}<span className={`font-medium ${parentStatusColor}`}>{parentStatus}</span></div>}</div>);})()}
                                {!(order.isGift===true||order.isGift===1)&&(()=>{const giftOrders:any[]=(order as any).giftOrders||[];if(giftOrders.length===0)return null;const soldCount=giftOrders.filter((g:any)=>g.sellStatus==='sold').length;const sellingCount=giftOrders.filter((g:any)=>g.sellStatus==='selling').length;const holdingCount=giftOrders.length-soldCount-sellingCount;return(<div className="mt-2 text-xs rounded-lg px-3 py-1.5 border border-purple-100 bg-purple-50 flex items-center gap-2 flex-wrap"><span className="text-purple-600 font-medium">关联赠单 {giftOrders.length}笔</span>{soldCount>0&&<span className="text-blue-500">已卖出 {soldCount}</span>}{sellingCount>0&&<span className="text-red-500">委卖中 {sellingCount}</span>}{holdingCount>0&&<span className="text-green-500">持仓中 {holdingCount}</span>}</div>);})()}
                                {isEditing && editState?.sellStatus === 'sold' && (<div className="mt-3 space-y-3"><div className="bg-orange-50 border border-orange-200 rounded-lg p-3"><p className="text-xs text-orange-600 font-medium mb-2">确认卖出成交，请输入实际卖出价格</p><div className="flex items-center gap-2"><span className="text-xs text-gray-500 whitespace-nowrap">实际卖出价</span><input type="number" placeholder="输入实际成交价格" value={editState!.actualSellPrice} onChange={(e) => setEditState({ ...editState!, actualSellPrice: e.target.value })} className="border border-orange-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-orange-500" /><span className="text-xs text-gray-400 whitespace-nowrap">USDT</span></div></div>{editState!.actualSellPrice && calculateProfit(order, editState!.actualSellPrice) && (() => { const calc = calculateProfit(order, editState!.actualSellPrice)!; return (<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2"><p className="text-xs font-medium text-blue-600">实时利润计算</p><div className="space-y-1.5 text-xs"><div className="flex justify-between"><span className="text-gray-600">持币数量</span><span className="font-medium text-gray-800">{calc.coinQuantity.toFixed(6)} {order.coin}</span></div><div className="flex justify-between"><span className="text-gray-600">买入价</span><span className="font-medium text-gray-800">{calc.buyPrice.toLocaleString()} USDT</span></div><div className="flex justify-between"><span className="text-gray-600">卖出价</span><span className="font-medium text-gray-800">{calc.sellPrice.toLocaleString()} USDT</span></div></div></div>); })()}</div>)}
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
              const COIN_COLORS: Record<string, string> = { ETH: '#3b82f6', BTC: '#f59e0b', SOL: '#a855f7' };
              // 按币种分组
              const coinMap = new Map<string, any[]>();
              (searchedOrders || []).forEach((order: any) => {
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
                // 计算总币数（正单+嵌套赠单+孤儿赠单合计）和折后权益
                let allQty = 0;
                let allEffQty = 0;
                const orphanGiftIds = new Set<number>(); // 记录孤儿赠单ID避免重复计算
                coinOrders.forEach((o: any) => {
                  const isGift = o.isGift === true || o.isGift === 1;
                  if (isGift) orphanGiftIds.add(o.id); // 这是孤儿赠单（已通过filteredOrders筛选进来）
                  const qty = parseFloat(o.quantity) || 0;
                  const rate = EQUITY_DISCOUNT_RATES[o.equityTier || 0] ?? 1.0;
                  allQty += qty;
                  allEffQty += qty * rate;
                  if (!isGift) {
                    ((o.giftOrders as any[]) || []).forEach((g: any) => {
                      if (orphanGiftIds.has(g.id)) return; // 已作为孤儿赠单统计，跳过
                      const gQty = parseFloat(g.quantity) || 0;
                      const gRate = EQUITY_DISCOUNT_RATES[g.equityTier || 0] ?? 1.0;
                      allQty += gQty;
                      allEffQty += gQty * gRate;
                    });
                  }
                });
                const discountPct = allQty > 0 ? (allEffQty / allQty * 100) : 100;
                // 展平订单按时间从近到远
                const flatOrders: any[] = [];
                coinOrders.forEach((o: any) => {
                  const isGift = o.isGift === true || o.isGift === 1;
                  flatOrders.push({ ...o, _isGift: isGift });
                  if (!isGift) {
                    ((o.giftOrders as any[]) || []).forEach((g: any) => {
                      if (orphanGiftIds.has(g.id)) return; // 已作为独立行显示
                      flatOrders.push({ ...g, _isGift: true, _parentCoin: o.coin });
                    });
                  }
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
                        <span className="text-[11px] text-gray-700 font-mono">{allQty.toFixed(COIN_DECIMALS[coin] ?? 4)}</span>
                        <span className="text-[11px] text-purple-500">→{allEffQty.toFixed(COIN_DECIMALS[coin] ?? 4)}</span>
                        <span className="text-[11px] text-gray-500">{discountPct.toFixed(0)}%</span>
                      </div>
                      <span className={`transition-transform duration-200 shrink-0 ml-1 text-gray-400 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {isOpen && (
                      <div className="mt-1 mb-2 pt-2">
                        {flatOrders.map((order: any) => {
                          const isEditing = editingId === order.id;
                          const statusDisplay = getStatusDisplay(order);
                          let previewQuantity = editState?.quantity ?? "";
                          if (isEditing && editState) { const p = parseFloat(order.limitPrice); const a = parseFloat(editState.amount); if (!isNaN(p) && !isNaN(a) && p > 0 && a > 0) { previewQuantity = (a * 5.25 / p).toFixed(8); } }
                          const orderDate = new Date(order.createdAt);
                          const yy = String(orderDate.getUTCFullYear()).slice(2);
                          const mm2 = String(orderDate.getUTCMonth() + 1).padStart(2, '0');
                          const dd2 = String(orderDate.getUTCDate()).padStart(2, '0');
                          const orderNo = `AF${yy}${mm2}${dd2}${String(order.id).padStart(6, '0')}`;
                          return (
                            <div key={order.id} className="rounded-2xl p-4 shadow-sm mb-3 bg-white">
                              <div className="flex items-start justify-between mb-3 gap-3">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <span className="text-[11px] font-mono text-gray-400 tracking-wide">{orderNo}</span>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-medium text-gray-700 shrink-0">{order.username && order.nickname && order.username !== order.nickname ? `${order.username}/${order.nickname}` : order.nickname || order.username || `用户${order.userId}`}</span>
                                    {order.isGift && (<span className="inline-flex items-center justify-center font-black select-none shrink-0" style={{width:18,height:18,borderRadius:'50%',fontSize:10,color:'#FFD700',background:'radial-gradient(circle at 35% 30%, #5a1a1a 0%, #1a0a00 55%, #3d0000 100%)',boxShadow:'0 1px 4px rgba(0,0,0,0.4)',border:'1.5px solid #8B4513',textShadow:'0 1px 2px rgba(255,180,0,0.8)'}}>赠</span>)}
                                    {order.status === 'completed' && (order.tierMode === 'linear' ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{backgroundColor:'#EFF6FF',color:'#3B82F6',border:'1px solid #BFDBFE'}}>线性</span> : <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{backgroundColor:'#FFF7ED',color:'#D97706',border:'1px solid #FED7AA'}}>阶梯</span>)}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-[10px] text-gray-400"><span className="text-gray-300 mr-1">开仓</span>{formatDate(order.createdAt)}</span>
                                    {order.confirmedAt && <span className="text-[10px] text-blue-400"><span className="text-blue-300 mr-1">登记</span>{formatDate(order.confirmedAt)}</span>}
                                    {order.sellStatus==='selling'&&order.sellAt&&<span className="text-[10px] text-orange-400"><span className="text-orange-300 mr-1">委卖</span>{formatDate(order.sellAt)}</span>}
                                    {order.sellStatus==='sold'&&order.sellConfirmedAt&&<span className="text-[10px] text-green-500"><span className="text-green-400 mr-1">确认</span>{formatDate(order.sellConfirmedAt)}</span>}
                                  </div>
                                  {!isEditing ? (<div className="flex items-center gap-1.5"><button onClick={() => startEdit(order)} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"><Pencil className="w-3 h-3" /> 编辑</button><button onClick={() => { setDeleteTarget(order); const ig = order.isGift===true||order.isGift===1; setDeleteScope('all'); setSelectedGiftIds([]); setRefundChecked(order.status==='pending'&&!ig); }} className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg px-2.5 py-1 transition-colors"><Trash2 className="w-3 h-3" /> 删除</button></div>) : (<div className="flex items-center gap-1.5"><button onClick={saveEdit} disabled={updateMutation.isPending} className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"><Check className="w-3 h-3" /> 保存</button><button onClick={cancelEdit} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"><X className="w-3 h-3" /> 取消</button></div>)}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-xs">
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">币种</span><span className="font-medium">{order.coin}</span></div>
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">状态</span>{isEditing ? (<div className="flex flex-col gap-1"><select value={editState!.status} onChange={(e)=>setEditState({...editState!,status:e.target.value as any})} className="border border-gray-300 rounded px-2 py-0.5 text-xs"><option value="pending">委买中</option><option value="completed">买入成交</option><option value="cancelled">已撤单</option></select><select value={editState!.sellStatus||''} onChange={(e)=>{const nextSellStatus=e.target.value||null;setEditState({...editState!,sellStatus:nextSellStatus,status:nextSellStatus?'completed':editState!.status});}} className="border border-gray-300 rounded px-2 py-0.5 text-xs"><option value="">持仓中</option><option value="selling">委卖中</option><option value="sold">已卖出</option></select></div>) : (<span className={`font-medium ${statusDisplay.color}`}>{statusDisplay.label}</span>)}</div>
                                {isEditing&&editState!.status==='completed'&&<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">档位模式</span><div className="flex rounded overflow-hidden border border-gray-300 text-xs"><button type="button" onClick={()=>setEditState({...editState!,tierMode:'step'})} className={`px-2 py-0.5 transition-colors ${editState!.tierMode==='step'?'bg-blue-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>阶梯</button><button type="button" onClick={()=>setEditState({...editState!,tierMode:'linear'})} className={`px-2 py-0.5 transition-colors ${editState!.tierMode==='linear'?'bg-blue-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>线性</button></div></div>}
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">买入价</span>{isEditing&&editState!.status==='pending'?<input type="number" value={editState!.limitPrice} onChange={(e)=>setEditState({...editState!,limitPrice:e.target.value})} className="border border-gray-300 rounded px-2 py-0.5 text-sm w-24" />:<span className="font-medium text-gray-900">{parseFloat(order.limitPrice).toLocaleString()} <span className="text-gray-400">u</span></span>}</div>
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">数量</span><span className="font-medium text-gray-900">{(()=>{const raw=isEditing?(previewQuantity||editState!.quantity):order.quantity;const num=parseFloat(raw);const trimmed=isNaN(num)?raw:num.toFixed(8).replace(/\.?0+$/,'');return `${trimmed} ${order.coin}`;})()}</span></div>
                                {order.status==='completed'&&(()=>{const raw=order.quantity;const num=parseFloat(raw);let rate:number;if(order.tierMode==='linear'){const buyP=parseFloat(order.limitPrice||'0');const allLow=order.allTimeLowPrice?parseFloat(String(order.allTimeLowPrice)):0;rate=(buyP>0&&allLow>0)?Math.max(0,1-(buyP-allLow)/buyP):1.0;}else{rate=EQUITY_DISCOUNT_RATES[order.equityTier]||1.0;}if(rate>=1.0)return null;const effectiveNum=num*rate;const pct=(rate*100).toFixed(2);return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">实际持仓</span><span className="text-xs text-orange-500">{effectiveNum.toFixed(8).replace(/\.?0+$/,'')} {order.coin} ({pct}%)</span></div>);})()}
                                {(()=>{const srcAmt=parseFloat(order.sourceAmount||'0');const selfAmt=parseFloat(order.amount||'0');const investAmt=order.isGift?srcAmt:selfAmt;return(<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">实际投入</span><span className="font-medium text-gray-900">{investAmt.toFixed(2)} <span className="text-gray-400">u</span></span></div>);})()}
                                {(()=>{const amount=parseFloat(order.amount);const tradeValue=order.isGift?amount:amount*5.25;return(<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">订单价値</span><span className="text-gray-900 font-medium">{tradeValue.toFixed(2)} <span className="text-gray-400">u</span></span></div>);})()}
                                {order.isGift&&(()=>{const srcAmt=parseFloat(order.sourceAmount||'0');const giftAmt=parseFloat(order.amount||'0');const ratio=srcAmt>0?(giftAmt/srcAmt):0;return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">赠送市値</span><span className="font-medium text-gray-900">{giftAmt.toFixed(2)} <span className="text-gray-400">u</span>{ratio>0&&<span className="font-normal text-gray-400 ml-1">({ratio.toFixed(4)}倍)</span>}</span></div>);})()}
                                {(order.sellStatus==='selling'||order.sellStatus==='sold')&&<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">卖出价</span><span className="font-medium text-gray-900">{parseFloat(order.sellPrice).toLocaleString()} <span className="text-gray-400">u</span></span></div>}
                                {order.sellStatus==='sold'&&order.sellConfirmedAt&&<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">卖出时间</span><span className="text-gray-500">{formatDate(order.sellConfirmedAt)}</span></div>}
                                {order.status==='completed'&&(()=>{let rate:number;let tierLabel:string;if(order.tierMode==='linear'){const buyP=parseFloat(order.limitPrice||'0');const allLow=order.allTimeLowPrice?parseFloat(String(order.allTimeLowPrice)):0;rate=(buyP>0&&allLow>0)?Math.max(0,1-(buyP-allLow)/buyP):1.0;tierLabel='L';}else{rate=EQUITY_DISCOUNT_RATES[order.equityTier]||1.0;tierLabel=order.equityTier===0?'D0档':`D${order.equityTier}档`;}const pct=(rate*100).toFixed(2);return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">当前权益</span><span className={`font-medium ${rate>=1.0?'text-gray-900':'text-orange-500'}`}>{pct}% <span className="text-gray-400">({tierLabel})</span></span></div>);})()}
                                {(order.status==='completed'||order.status==='pending')&&<FeeRow order={order} ledgerId={ledgerId} />}
                              </div>
                              {(order.isGift===true||order.isGift===1)&&(()=>{const parentOrder=order.sourceOrderId?(orders as any[]||[]).find((o:any)=>o.id===order.sourceOrderId):null;const parentStatus=parentOrder?(parentOrder.sellStatus==='sold'?'已卖出':parentOrder.sellStatus==='selling'?'委卖中':parentOrder.status==='completed'?'持仓中':parentOrder.status==='cancelled'?'已撤单':'委买中'):null;const parentStatusColor=parentOrder?(parentOrder.sellStatus==='sold'?'text-blue-500':parentOrder.sellStatus==='selling'?'text-red-500':parentOrder.status==='completed'?'text-green-500':'text-gray-400'):'text-gray-400';const parentOrderNo=parentOrder?(()=>{const d=new Date(parentOrder.createdAt);return `AF${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(parentOrder.id).padStart(6,'0')}`;})():null;return(<div className="mt-2 text-xs rounded-lg px-3 py-2 border border-purple-100 bg-purple-50"><div className="flex items-center justify-between"><span className="text-purple-600 font-medium">推荐人奖励赠单</span>{order.sourceUsername&&<span className="text-gray-500">来自 <span className="font-medium text-gray-700">{order.sourceUsername}</span></span>}</div>{parentOrder&&<div className="mt-1 flex items-center gap-1.5 text-gray-500"><span>关联正单</span>{parentOrderNo&&<span className="font-mono text-gray-600">{parentOrderNo}</span>}<span className={`font-medium ${parentStatusColor}`}>{parentStatus}</span></div>}</div>);})()}
                              {!(order.isGift===true||order.isGift===1)&&(()=>{const giftOrders:any[]=(order as any).giftOrders||[];if(giftOrders.length===0)return null;const soldCount=giftOrders.filter((g:any)=>g.sellStatus==='sold').length;const sellingCount=giftOrders.filter((g:any)=>g.sellStatus==='selling').length;const holdingCount=giftOrders.length-soldCount-sellingCount;return(<div className="mt-2 text-xs rounded-lg px-3 py-1.5 border border-purple-100 bg-purple-50 flex items-center gap-2 flex-wrap"><span className="text-purple-600 font-medium">关联赠单 {giftOrders.length}笔</span>{soldCount>0&&<span className="text-blue-500">已卖出 {soldCount}</span>}{sellingCount>0&&<span className="text-red-500">委卖中 {sellingCount}</span>}{holdingCount>0&&<span className="text-green-500">持仓中 {holdingCount}</span>}</div>);})()}
                              {isEditing && editState?.sellStatus === 'sold' && (<div className="mt-3 space-y-3"><div className="bg-orange-50 border border-orange-200 rounded-lg p-3"><p className="text-xs text-orange-600 font-medium mb-2">确认卖出成交，请输入实际卖出价格</p><div className="flex items-center gap-2"><span className="text-xs text-gray-500 whitespace-nowrap">实际卖出价</span><input type="number" placeholder="输入实际成交价格" value={editState!.actualSellPrice} onChange={(e) => setEditState({ ...editState!, actualSellPrice: e.target.value })} className="border border-orange-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-orange-500" /><span className="text-xs text-gray-400 whitespace-nowrap">USDT</span></div></div>{editState!.actualSellPrice && calculateProfit(order, editState!.actualSellPrice) && (() => { const calc = calculateProfit(order, editState!.actualSellPrice)!; return (<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2"><p className="text-xs font-medium text-blue-600">实时利润计算</p><div className="space-y-1.5 text-xs"><div className="flex justify-between"><span className="text-gray-600">持币数量</span><span className="font-medium text-gray-800">{calc.coinQuantity.toFixed(6)} {order.coin}</span></div><div className="flex justify-between"><span className="text-gray-600">买入价</span><span className="font-medium text-gray-800">{calc.buyPrice.toLocaleString()} USDT</span></div><div className="flex justify-between"><span className="text-gray-600">卖出价</span><span className="font-medium text-gray-800">{calc.sellPrice.toLocaleString()} USDT</span></div></div></div>); })()}</div>)}
                            </div>
                          );
                        })}
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
              const orphanGiftIdsP = new Set<number>(); // 孤儿赠单ID
              (searchedOrders || []).filter((order: any) => order.status !== 'cancelled').forEach((order: any) => {
                const isGift = order.isGift === true || order.isGift === 1;
                if (isGift) orphanGiftIdsP.add(order.id);
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
                // 实际持仓中数量：只统计已成交且未卖出的订单
                let holdingRawQty = 0;  // 持仓中正单原始数量（不折扣）
                let holdingEffQty = 0;  // 持仓中正单折后数量
                let holdingGiftQty = 0; // 持仓中赠单数量
                let orderCount = 0;
                let giftCount = 0;
                let hasDiscount = false; // 是否有折扣档位
                group.orders.forEach((o: any) => {
                  const isGift = o.isGift === true || o.isGift === 1;
                  const qty = parseFloat(o.quantity) || 0;
                  const tier = o.equityTier || 0;
                  let rate: number;
                  if (o.tierMode === 'linear') {
                    const buyPrice = parseFloat(o.limitPrice) || 0;
                    const lowPrice = parseFloat(o.allTimeLowPrice) || buyPrice;
                    const dropPct = buyPrice > 0 ? Math.max(0, (buyPrice - lowPrice) / buyPrice) : 0;
                    rate = Math.max(0, 1 - dropPct);
                  } else {
                    rate = EQUITY_DISCOUNT_RATES[tier] ?? 1.0;
                  }
                  const effQty = qty * rate;
                  const isCompleted = o.status === 'completed';
                  const isSold = o.sellStatus === 'sold';
                  orderCount++;
                  if (isGift) {
                    if (isCompleted && !isSold) holdingGiftQty += qty;
                    giftCount++;
                  } else {
                    if (isCompleted && !isSold) {
                      holdingRawQty += qty;
                      holdingEffQty += effQty;
                      const isLinearDiscount = o.tierMode === 'linear' && Math.abs(rate - 1) > 0.00005;
                      if ((tier > 0 || isLinearDiscount) && Math.abs(effQty - qty) > 0.00005) hasDiscount = true;
                    }
                    // 嵌套赠单
                    ((o.giftOrders as any[]) || []).forEach((g: any) => {
                      if (orphanGiftIdsP.has(g.id)) return;
                      const gQty = parseFloat(g.quantity) || 0;
                      const gCompleted = g.status === 'completed';
                      const gSold = g.sellStatus === 'sold';
                      if (gCompleted && !gSold) holdingGiftQty += gQty;
                      giftCount++;
                    });
                  }
                });
                const totalHolding = holdingRawQty + holdingGiftQty;
                // 展平
                const flatOrders: any[] = [];
                group.orders.forEach((o: any) => {
                  const isGift = o.isGift === true || o.isGift === 1;
                  flatOrders.push({ ...o, _isGift: isGift });
                  if (!isGift) {
                    ((o.giftOrders as any[]) || []).forEach((g: any) => {
                      if (orphanGiftIdsP.has(g.id)) return;
                      flatOrders.push({ ...g, _isGift: true, _parentCoin: o.coin });
                    });
                  }
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
                        {totalHolding > 0 ? (() => {
                          const dec = COIN_DECIMALS[group.coin] ?? 4;
                          // 总数量 = 正单原始 + 赠单（赠单无折扣）
                          const totalRaw = holdingRawQty + holdingGiftQty;
                          // 折后有效数量 = 正单折后 + 赠单
                          const totalEff = holdingEffQty + holdingGiftQty;
                          const showEff = hasDiscount && Math.abs(totalEff - totalRaw) > 0.00005;
                          return (
                            <span className="text-[11px] text-gray-500">
                              {totalRaw.toFixed(dec)}
                              {showEff && <span className="text-green-600">({totalEff.toFixed(dec)})</span>}
                            </span>
                          );
                        })() : (
                          <span className="text-[11px] text-gray-400">无持仓</span>
                        )}
                        <span className="text-[11px] text-blue-500">{orderCount}单</span>
                        {giftCount > 0 && <span className="text-[11px] text-orange-400">{giftCount}赠</span>}
                      </div>
                      <span className={`transition-transform duration-200 shrink-0 ml-1 text-gray-400 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {isOpen && (
                      <div className="mt-1 mb-2 pt-2">
                        {flatOrders.map((order: any) => {
                          const isEditing = editingId === order.id;
                          const statusDisplay = getStatusDisplay(order);
                          let previewQuantity = editState?.quantity ?? "";
                          if (isEditing && editState) { const p = parseFloat(order.limitPrice); const a = parseFloat(editState.amount); if (!isNaN(p) && !isNaN(a) && p > 0 && a > 0) { previewQuantity = (a * 5.25 / p).toFixed(8); } }
                          const orderDate = new Date(order.createdAt);
                          const yy = String(orderDate.getUTCFullYear()).slice(2);
                          const mm2 = String(orderDate.getUTCMonth() + 1).padStart(2, '0');
                          const dd2 = String(orderDate.getUTCDate()).padStart(2, '0');
                          const orderNo = `AF${yy}${mm2}${dd2}${String(order.id).padStart(6, '0')}`;
                          return (
                            <div key={order.id} className="rounded-2xl p-4 shadow-sm mb-3 bg-white">
                              <div className="flex items-start justify-between mb-3 gap-3">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <span className="text-[11px] font-mono text-gray-400 tracking-wide">{orderNo}</span>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-medium text-gray-700 shrink-0">{order.username && order.nickname && order.username !== order.nickname ? `${order.username}/${order.nickname}` : order.nickname || order.username || `用户${order.userId}`}</span>
                                    {order.isGift && (<span className="inline-flex items-center justify-center font-black select-none shrink-0" style={{width:18,height:18,borderRadius:'50%',fontSize:10,color:'#FFD700',background:'radial-gradient(circle at 35% 30%, #5a1a1a 0%, #1a0a00 55%, #3d0000 100%)',boxShadow:'0 1px 4px rgba(0,0,0,0.4)',border:'1.5px solid #8B4513',textShadow:'0 1px 2px rgba(255,180,0,0.8)'}}>赠</span>)}
                                    {order.status === 'completed' && (order.tierMode === 'linear' ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{backgroundColor:'#EFF6FF',color:'#3B82F6',border:'1px solid #BFDBFE'}}>线性</span> : <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{backgroundColor:'#FFF7ED',color:'#D97706',border:'1px solid #FED7AA'}}>阶梯</span>)}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-[10px] text-gray-400"><span className="text-gray-300 mr-1">开仓</span>{formatDate(order.createdAt)}</span>
                                    {order.confirmedAt && <span className="text-[10px] text-blue-400"><span className="text-blue-300 mr-1">登记</span>{formatDate(order.confirmedAt)}</span>}
                                    {order.sellStatus==='selling'&&order.sellAt&&<span className="text-[10px] text-orange-400"><span className="text-orange-300 mr-1">委卖</span>{formatDate(order.sellAt)}</span>}
                                    {order.sellStatus==='sold'&&order.sellConfirmedAt&&<span className="text-[10px] text-green-500"><span className="text-green-400 mr-1">确认</span>{formatDate(order.sellConfirmedAt)}</span>}
                                  </div>
                                  {!isEditing ? (<div className="flex items-center gap-1.5"><button onClick={() => startEdit(order)} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"><Pencil className="w-3 h-3" /> 编辑</button><button onClick={() => { setDeleteTarget(order); const ig = order.isGift===true||order.isGift===1; setDeleteScope('all'); setSelectedGiftIds([]); setRefundChecked(order.status==='pending'&&!ig); }} className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg px-2.5 py-1 transition-colors"><Trash2 className="w-3 h-3" /> 删除</button></div>) : (<div className="flex items-center gap-1.5"><button onClick={saveEdit} disabled={updateMutation.isPending} className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"><Check className="w-3 h-3" /> 保存</button><button onClick={cancelEdit} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"><X className="w-3 h-3" /> 取消</button></div>)}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-xs">
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">币种</span><span className="font-medium">{order.coin}</span></div>
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">状态</span>{isEditing ? (<div className="flex flex-col gap-1"><select value={editState!.status} onChange={(e)=>setEditState({...editState!,status:e.target.value as any})} className="border border-gray-300 rounded px-2 py-0.5 text-xs"><option value="pending">委买中</option><option value="completed">买入成交</option><option value="cancelled">已撤单</option></select><select value={editState!.sellStatus||''} onChange={(e)=>{const nextSellStatus=e.target.value||null;setEditState({...editState!,sellStatus:nextSellStatus,status:nextSellStatus?'completed':editState!.status});}} className="border border-gray-300 rounded px-2 py-0.5 text-xs"><option value="">持仓中</option><option value="selling">委卖中</option><option value="sold">已卖出</option></select></div>) : (<span className={`font-medium ${statusDisplay.color}`}>{statusDisplay.label}</span>)}</div>
                                {isEditing&&editState!.status==='completed'&&<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">档位模式</span><div className="flex rounded overflow-hidden border border-gray-300 text-xs"><button type="button" onClick={()=>setEditState({...editState!,tierMode:'step'})} className={`px-2 py-0.5 transition-colors ${editState!.tierMode==='step'?'bg-blue-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>阶梯</button><button type="button" onClick={()=>setEditState({...editState!,tierMode:'linear'})} className={`px-2 py-0.5 transition-colors ${editState!.tierMode==='linear'?'bg-blue-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>线性</button></div></div>}
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">买入价</span>{isEditing&&editState!.status==='pending'?<input type="number" value={editState!.limitPrice} onChange={(e)=>setEditState({...editState!,limitPrice:e.target.value})} className="border border-gray-300 rounded px-2 py-0.5 text-sm w-24" />:<span className="font-medium text-gray-900">{parseFloat(order.limitPrice).toLocaleString()} <span className="text-gray-400">u</span></span>}</div>
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">数量</span><span className="font-medium text-gray-900">{(()=>{const raw=isEditing?(previewQuantity||editState!.quantity):order.quantity;const num=parseFloat(raw);const trimmed=isNaN(num)?raw:num.toFixed(8).replace(/\.?0+$/,'');return `${trimmed} ${order.coin}`;})()}</span></div>
                                {order.status==='completed'&&(()=>{const raw=order.quantity;const num=parseFloat(raw);let rate:number;if(order.tierMode==='linear'){const buyP=parseFloat(order.limitPrice||'0');const allLow=order.allTimeLowPrice?parseFloat(String(order.allTimeLowPrice)):0;rate=(buyP>0&&allLow>0)?Math.max(0,1-(buyP-allLow)/buyP):1.0;}else{rate=EQUITY_DISCOUNT_RATES[order.equityTier]||1.0;}if(rate>=1.0)return null;const effectiveNum=num*rate;const pct=(rate*100).toFixed(2);return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">实际持仓</span><span className="text-xs text-orange-500">{effectiveNum.toFixed(8).replace(/\.?0+$/,'')} {order.coin} ({pct}%)</span></div>);})()}
                                {(()=>{const srcAmt=parseFloat(order.sourceAmount||'0');const selfAmt=parseFloat(order.amount||'0');const investAmt=order.isGift?srcAmt:selfAmt;return(<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">实际投入</span><span className="font-medium text-gray-900">{investAmt.toFixed(2)} <span className="text-gray-400">u</span></span></div>);})()}
                                {(()=>{const amount=parseFloat(order.amount);const tradeValue=order.isGift?amount:amount*5.25;return(<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">订单价値</span><span className="text-gray-900 font-medium">{tradeValue.toFixed(2)} <span className="text-gray-400">u</span></span></div>);})()}
                                {order.isGift&&(()=>{const srcAmt=parseFloat(order.sourceAmount||'0');const giftAmt=parseFloat(order.amount||'0');const ratio=srcAmt>0?(giftAmt/srcAmt):0;return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">赠送市値</span><span className="font-medium text-gray-900">{giftAmt.toFixed(2)} <span className="text-gray-400">u</span>{ratio>0&&<span className="font-normal text-gray-400 ml-1">({ratio.toFixed(4)}倍)</span>}</span></div>);})()}
                                {(order.sellStatus==='selling'||order.sellStatus==='sold')&&<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">卖出价</span><span className="font-medium text-gray-900">{parseFloat(order.sellPrice).toLocaleString()} <span className="text-gray-400">u</span></span></div>}
                                {order.sellStatus==='sold'&&order.sellConfirmedAt&&<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">卖出时间</span><span className="text-gray-500">{formatDate(order.sellConfirmedAt)}</span></div>}
                                {order.status==='completed'&&(()=>{let rate:number;let tierLabel:string;if(order.tierMode==='linear'){const buyP=parseFloat(order.limitPrice||'0');const allLow=order.allTimeLowPrice?parseFloat(String(order.allTimeLowPrice)):0;rate=(buyP>0&&allLow>0)?Math.max(0,1-(buyP-allLow)/buyP):1.0;tierLabel='L';}else{rate=EQUITY_DISCOUNT_RATES[order.equityTier]||1.0;tierLabel=order.equityTier===0?'D0档':`D${order.equityTier}档`;}const pct=(rate*100).toFixed(2);return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">当前权益</span><span className={`font-medium ${rate>=1.0?'text-gray-900':'text-orange-500'}`}>{pct}% <span className="text-gray-400">({tierLabel})</span></span></div>);})()}
                                {(order.status==='completed'||order.status==='pending')&&<FeeRow order={order} ledgerId={ledgerId} />}
                              </div>
                              {(order.isGift===true||order.isGift===1)&&(()=>{const parentOrder=order.sourceOrderId?(orders as any[]||[]).find((o:any)=>o.id===order.sourceOrderId):null;const parentStatus=parentOrder?(parentOrder.sellStatus==='sold'?'已卖出':parentOrder.sellStatus==='selling'?'委卖中':parentOrder.status==='completed'?'持仓中':parentOrder.status==='cancelled'?'已撤单':'委买中'):null;const parentStatusColor=parentOrder?(parentOrder.sellStatus==='sold'?'text-blue-500':parentOrder.sellStatus==='selling'?'text-red-500':parentOrder.status==='completed'?'text-green-500':'text-gray-400'):'text-gray-400';const parentOrderNo=parentOrder?(()=>{const d=new Date(parentOrder.createdAt);return `AF${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(parentOrder.id).padStart(6,'0')}`;})():null;return(<div className="mt-2 text-xs rounded-lg px-3 py-2 border border-purple-100 bg-purple-50"><div className="flex items-center justify-between"><span className="text-purple-600 font-medium">推荐人奖励赠单</span>{order.sourceUsername&&<span className="text-gray-500">来自 <span className="font-medium text-gray-700">{order.sourceUsername}</span></span>}</div>{parentOrder&&<div className="mt-1 flex items-center gap-1.5 text-gray-500"><span>关联正单</span>{parentOrderNo&&<span className="font-mono text-gray-600">{parentOrderNo}</span>}<span className={`font-medium ${parentStatusColor}`}>{parentStatus}</span></div>}</div>);})()}
                              {!(order.isGift===true||order.isGift===1)&&(()=>{const giftOrders:any[]=(order as any).giftOrders||[];if(giftOrders.length===0)return null;const soldCount=giftOrders.filter((g:any)=>g.sellStatus==='sold').length;const sellingCount=giftOrders.filter((g:any)=>g.sellStatus==='selling').length;const holdingCount=giftOrders.length-soldCount-sellingCount;return(<div className="mt-2 text-xs rounded-lg px-3 py-1.5 border border-purple-100 bg-purple-50 flex items-center gap-2 flex-wrap"><span className="text-purple-600 font-medium">关联赠单 {giftOrders.length}笔</span>{soldCount>0&&<span className="text-blue-500">已卖出 {soldCount}</span>}{sellingCount>0&&<span className="text-red-500">委卖中 {sellingCount}</span>}{holdingCount>0&&<span className="text-green-500">持仓中 {holdingCount}</span>}</div>);})()}
                              {isEditing && editState?.sellStatus === 'sold' && (<div className="mt-3 space-y-3"><div className="bg-orange-50 border border-orange-200 rounded-lg p-3"><p className="text-xs text-orange-600 font-medium mb-2">确认卖出成交，请输入实际卖出价格</p><div className="flex items-center gap-2"><span className="text-xs text-gray-500 whitespace-nowrap">实际卖出价</span><input type="number" placeholder="输入实际成交价格" value={editState!.actualSellPrice} onChange={(e) => setEditState({ ...editState!, actualSellPrice: e.target.value })} className="border border-orange-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-orange-500" /><span className="text-xs text-gray-400 whitespace-nowrap">USDT</span></div></div>{editState!.actualSellPrice && calculateProfit(order, editState!.actualSellPrice) && (() => { const calc = calculateProfit(order, editState!.actualSellPrice)!; return (<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2"><p className="text-xs font-medium text-blue-600">实时利润计算</p><div className="space-y-1.5 text-xs"><div className="flex justify-between"><span className="text-gray-600">持币数量</span><span className="font-medium text-gray-800">{calc.coinQuantity.toFixed(6)} {order.coin}</span></div><div className="flex justify-between"><span className="text-gray-600">买入价</span><span className="font-medium text-gray-800">{calc.buyPrice.toLocaleString()} USDT</span></div><div className="flex justify-between"><span className="text-gray-600">卖出价</span><span className="font-medium text-gray-800">{calc.sellPrice.toLocaleString()} USDT</span></div></div></div>); })()}</div>)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        ) : groupMode === 'sellPrice' ? (
          /* ── 卖出价维度分组 ── */
          <div className="space-y-2 pb-6">
            {(() => {
              const COIN_DECIMALS: Record<string, number> = { SOL: 1, BTC: 4, ETH: 2 };
              // 按卖出价格分组（同一卖出价归为一组），只包含有卖出价的订单
              const sellPriceMap = new Map<string, { price: number; coin: string; orders: any[] }>();
              const orphanGiftIdsSP = new Set<number>();
              (searchedOrders || []).filter((order: any) => order.status !== 'cancelled' && order.sellPrice).forEach((order: any) => {
                const isGift = order.isGift === true || order.isGift === 1;
                if (isGift) orphanGiftIdsSP.add(order.id);
                const price = parseFloat(order.sellPrice || '0');
                if (price <= 0) return;
                const coin = order.coin || '未知';
                const key = `${coin}_sp_${price.toFixed(2)}`;
                if (!sellPriceMap.has(key)) sellPriceMap.set(key, { price, coin, orders: [] });
                sellPriceMap.get(key)!.orders.push(order);
              });
              const sellPriceGroups = Array.from(sellPriceMap.values()).sort((a, b) => {
                if (a.coin !== b.coin) return a.coin.localeCompare(b.coin);
                return a.price - b.price;
              });
              return sellPriceGroups.map(group => {
                const gKey = `sellPrice_${group.coin}_${group.price}`;
                const isOpen = expandedPersons[gKey] ?? false;
                let holdingRawQty = 0;
                let holdingEffQty = 0;
                let holdingGiftQty = 0;
                let orderCount = 0;
                let giftCount = 0;
                let hasDiscount = false;
                group.orders.forEach((o: any) => {
                  const isGift = o.isGift === true || o.isGift === 1;
                  const qty = parseFloat(o.quantity) || 0;
                  const tier = o.equityTier || 0;
                  let rate: number;
                  if (o.tierMode === 'linear') {
                    const buyPrice = parseFloat(o.limitPrice) || 0;
                    const lowPrice = parseFloat(o.allTimeLowPrice) || buyPrice;
                    const dropPct = buyPrice > 0 ? Math.max(0, (buyPrice - lowPrice) / buyPrice) : 0;
                    rate = Math.max(0, 1 - dropPct);
                  } else {
                    rate = EQUITY_DISCOUNT_RATES[tier] ?? 1.0;
                  }
                  const effQty = qty * rate;
                  const isCompleted = o.status === 'completed';
                  const isSold = o.sellStatus === 'sold';
                  orderCount++;
                  if (isGift) {
                    if (isCompleted && !isSold) holdingGiftQty += qty;
                    giftCount++;
                  } else {
                    if (isCompleted && !isSold) {
                      holdingRawQty += qty;
                      holdingEffQty += effQty;
                      const isLinearDiscount = o.tierMode === 'linear' && Math.abs(rate - 1) > 0.00005;
                      if ((tier > 0 || isLinearDiscount) && Math.abs(effQty - qty) > 0.00005) hasDiscount = true;
                    }
                    ((o.giftOrders as any[]) || []).forEach((g: any) => {
                      if (orphanGiftIdsSP.has(g.id)) return;
                      const gQty = parseFloat(g.quantity) || 0;
                      const gCompleted = g.status === 'completed';
                      const gSold = g.sellStatus === 'sold';
                      if (gCompleted && !gSold) holdingGiftQty += gQty;
                      giftCount++;
                    });
                  }
                });
                const totalHolding = holdingRawQty + holdingGiftQty;
                const flatOrders: any[] = [];
                group.orders.forEach((o: any) => {
                  const isGift = o.isGift === true || o.isGift === 1;
                  flatOrders.push({ ...o, _isGift: isGift });
                  if (!isGift) {
                    ((o.giftOrders as any[]) || []).forEach((g: any) => {
                      if (orphanGiftIdsSP.has(g.id)) return;
                      flatOrders.push({ ...g, _isGift: true, _parentCoin: o.coin });
                    });
                  }
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
                        <span className="text-xs text-red-500">卖${group.price.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 justify-end">
                        {totalHolding > 0 ? (() => {
                          const dec = COIN_DECIMALS[group.coin] ?? 4;
                          const totalRaw = holdingRawQty + holdingGiftQty;
                          const totalEff = holdingEffQty + holdingGiftQty;
                          const showEff = hasDiscount && Math.abs(totalEff - totalRaw) > 0.00005;
                          return (
                            <span className="text-[11px] text-gray-500">
                              {totalRaw.toFixed(dec)}
                              {showEff && <span className="text-green-600">({totalEff.toFixed(dec)})</span>}
                            </span>
                          );
                        })() : (
                          <span className="text-[11px] text-gray-400">无持仓</span>
                        )}
                        <span className="text-[11px] text-blue-500">{orderCount}单</span>
                        {giftCount > 0 && <span className="text-[11px] text-orange-400">{giftCount}赠</span>}
                      </div>
                      <span className={`transition-transform duration-200 shrink-0 ml-1 text-gray-400 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {isOpen && (
                      <div className="mt-1 mb-2 pt-2">
                        {flatOrders.map((order: any) => {
                          const isEditing = editingId === order.id;
                          const statusDisplay = getStatusDisplay(order);
                          let previewQuantity = editState?.quantity ?? "";
                          if (isEditing && editState) { const p = parseFloat(order.limitPrice); const a = parseFloat(editState.amount); if (!isNaN(p) && !isNaN(a) && p > 0 && a > 0) { previewQuantity = (a * 5.25 / p).toFixed(8); } }
                          const orderDate = new Date(order.createdAt);
                          const bjDate = new Date(orderDate.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
                          const yy = String(bjDate.getFullYear()).slice(2);
                          const mm2 = String(bjDate.getMonth() + 1).padStart(2, '0');
                          const dd2 = String(bjDate.getDate()).padStart(2, '0');
                          const orderNo = `AF${yy}${mm2}${dd2}${String(order.id).padStart(6, '0')}`;
                          return (
                            <div key={order.id} className="rounded-2xl p-4 shadow-sm mb-3 bg-white">
                              <div className="flex items-start justify-between mb-3 gap-3">
                                <div className="flex flex-col gap-1 min-w-0">
                                  <span className="text-[11px] font-mono text-gray-400 tracking-wide">{orderNo}</span>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-medium text-gray-700 shrink-0">{order.username && order.nickname && order.username !== order.nickname ? `${order.username}/${order.nickname}` : order.nickname || order.username || `用户${order.userId}`}</span>
                                    {order.isGift && (<span className="inline-flex items-center justify-center font-black select-none shrink-0" style={{width:18,height:18,borderRadius:'50%',fontSize:10,color:'#FFD700',background:'radial-gradient(circle at 35% 30%, #5a1a1a 0%, #1a0a00 55%, #3d0000 100%)',boxShadow:'0 1px 4px rgba(0,0,0,0.4)',border:'1.5px solid #8B4513',textShadow:'0 1px 2px rgba(255,180,0,0.8)'}}>赠</span>)}
                                    {order.status === 'completed' && (order.tierMode === 'linear' ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{backgroundColor:'#EFF6FF',color:'#3B82F6',border:'1px solid #BFDBFE'}}>线性</span> : <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{backgroundColor:'#FFF7ED',color:'#D97706',border:'1px solid #FED7AA'}}>阶梯</span>)}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="text-[10px] text-gray-400"><span className="text-gray-300 mr-1">开仓</span>{formatDate(order.createdAt)}</span>
                                    {order.confirmedAt && <span className="text-[10px] text-blue-400"><span className="text-blue-300 mr-1">登记</span>{formatDate(order.confirmedAt)}</span>}
                                    {order.sellStatus==='selling'&&order.sellAt&&<span className="text-[10px] text-orange-400"><span className="text-orange-300 mr-1">委卖</span>{formatDate(order.sellAt)}</span>}
                                    {order.sellStatus==='sold'&&order.sellConfirmedAt&&<span className="text-[10px] text-green-500"><span className="text-green-400 mr-1">确认</span>{formatDate(order.sellConfirmedAt)}</span>}
                                  </div>
                                  {!isEditing ? (<div className="flex items-center gap-1.5"><button onClick={() => startEdit(order)} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"><Pencil className="w-3 h-3" /> 编辑</button><button onClick={() => { setDeleteTarget(order); const ig = order.isGift===true||order.isGift===1; setDeleteScope('all'); setSelectedGiftIds([]); setRefundChecked(order.status==='pending'&&!ig); }} className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg px-2.5 py-1 transition-colors"><Trash2 className="w-3 h-3" /> 删除</button></div>) : (<div className="flex items-center gap-1.5"><button onClick={saveEdit} disabled={updateMutation.isPending} className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"><Check className="w-3 h-3" /> 保存</button><button onClick={cancelEdit} className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"><X className="w-3 h-3" /> 取消</button></div>)}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-y-2 gap-x-2 text-xs">
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">币种</span><span className="font-medium">{order.coin}</span></div>
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">状态</span>{isEditing ? (<div className="flex flex-col gap-1"><select value={editState!.status} onChange={(e)=>setEditState({...editState!,status:e.target.value as any})} className="border border-gray-300 rounded px-2 py-0.5 text-xs"><option value="pending">委买中</option><option value="completed">买入成交</option><option value="cancelled">已撤单</option></select><select value={editState!.sellStatus||''} onChange={(e)=>{const nextSellStatus=e.target.value||null;setEditState({...editState!,sellStatus:nextSellStatus,status:nextSellStatus?'completed':editState!.status});}} className="border border-gray-300 rounded px-2 py-0.5 text-xs"><option value="">持仓中</option><option value="selling">委卖中</option><option value="sold">已卖出</option></select></div>) : (<span className={`font-medium ${statusDisplay.color}`}>{statusDisplay.label}</span>)}</div>
                                {isEditing&&editState!.status==='completed'&&<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">档位模式</span><div className="flex rounded overflow-hidden border border-gray-300 text-xs"><button type="button" onClick={()=>setEditState({...editState!,tierMode:'step'})} className={`px-2 py-0.5 transition-colors ${editState!.tierMode==='step'?'bg-blue-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>阶梯</button><button type="button" onClick={()=>setEditState({...editState!,tierMode:'linear'})} className={`px-2 py-0.5 transition-colors ${editState!.tierMode==='linear'?'bg-blue-500 text-white':'bg-white text-gray-600 hover:bg-gray-50'}`}>线性</button></div></div>}
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">买入价</span>{isEditing&&editState!.status==='pending'?<input type="number" value={editState!.limitPrice} onChange={(e)=>setEditState({...editState!,limitPrice:e.target.value})} className="border border-gray-300 rounded px-2 py-0.5 text-sm w-24" />:<span className="font-medium text-gray-900">{parseFloat(order.limitPrice).toLocaleString()} <span className="text-gray-400">u</span></span>}</div>
                                <div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">数量</span><span className="font-medium text-gray-900">{(()=>{const raw=isEditing?(previewQuantity||editState!.quantity):order.quantity;const num=parseFloat(raw);const trimmed=isNaN(num)?raw:num.toFixed(8).replace(/\.?0+$/,'');return `${trimmed} ${order.coin}`;})()}</span></div>
                                {order.status==='completed'&&(()=>{const raw=order.quantity;const num=parseFloat(raw);let rate:number;if(order.tierMode==='linear'){const buyP=parseFloat(order.limitPrice||'0');const allLow=order.allTimeLowPrice?parseFloat(String(order.allTimeLowPrice)):0;rate=(buyP>0&&allLow>0)?Math.max(0,1-(buyP-allLow)/buyP):1.0;}else{rate=EQUITY_DISCOUNT_RATES[order.equityTier]||1.0;}if(rate>=1.0)return null;const effectiveNum=num*rate;const pct=(rate*100).toFixed(2);return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">实际持仓</span><span className="text-xs text-orange-500">{effectiveNum.toFixed(8).replace(/\.?0+$/,'')} {order.coin} ({pct}%)</span></div>);})()}
                                {(()=>{const srcAmt=parseFloat(order.sourceAmount||'0');const selfAmt=parseFloat(order.amount||'0');const investAmt=order.isGift?srcAmt:selfAmt;return(<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">实际投入</span><span className="font-medium text-gray-900">{investAmt.toFixed(2)} <span className="text-gray-400">u</span></span></div>);})()}
                                {(()=>{const amount=parseFloat(order.amount);const tradeValue=order.isGift?amount:amount*5.25;return(<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">订单价値</span><span className="text-gray-900 font-medium">{tradeValue.toFixed(2)} <span className="text-gray-400">u</span></span></div>);})()}
                                {order.isGift&&(()=>{const srcAmt=parseFloat(order.sourceAmount||'0');const giftAmt=parseFloat(order.amount||'0');const ratio=srcAmt>0?(giftAmt/srcAmt):0;return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">赠送市値</span><span className="font-medium text-gray-900">{giftAmt.toFixed(2)} <span className="text-gray-400">u</span>{ratio>0&&<span className="font-normal text-gray-400 ml-1">({ratio.toFixed(4)}倍)</span>}</span></div>);})()}
                                {(order.sellStatus==='selling'||order.sellStatus==='sold')&&<div className="flex items-center gap-1"><span className="text-gray-400 w-12 shrink-0">卖出价</span><span className="font-medium text-gray-900">{parseFloat(order.sellPrice).toLocaleString()} <span className="text-gray-400">u</span></span></div>}
                                {order.sellStatus==='sold'&&order.sellConfirmedAt&&<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">卖出时间</span><span className="text-gray-500">{formatDate(order.sellConfirmedAt)}</span></div>}
                                {order.status==='completed'&&(()=>{let rate:number;let tierLabel:string;if(order.tierMode==='linear'){const buyP=parseFloat(order.limitPrice||'0');const allLow=order.allTimeLowPrice?parseFloat(String(order.allTimeLowPrice)):0;rate=(buyP>0&&allLow>0)?Math.max(0,1-(buyP-allLow)/buyP):1.0;tierLabel='L';}else{rate=EQUITY_DISCOUNT_RATES[order.equityTier]||1.0;tierLabel=order.equityTier===0?'D0档':`D${order.equityTier}档`;}const pct=(rate*100).toFixed(2);return(<div className="flex items-center gap-1 col-span-2"><span className="text-gray-400 w-12 shrink-0">当前权益</span><span className={`font-medium ${rate>=1.0?'text-gray-900':'text-orange-500'}`}>{pct}% <span className="text-gray-400">({tierLabel})</span></span></div>);})()}
                                {(order.status==='completed'||order.status==='pending')&&<FeeRow order={order} ledgerId={ledgerId} />}
                              </div>
                              {(order.isGift===true||order.isGift===1)&&(()=>{const parentOrder=order.sourceOrderId?(orders as any[]||[]).find((o:any)=>o.id===order.sourceOrderId):null;const parentStatus=parentOrder?(parentOrder.sellStatus==='sold'?'已卖出':parentOrder.sellStatus==='selling'?'委卖中':parentOrder.status==='completed'?'持仓中':parentOrder.status==='cancelled'?'已撤单':'委买中'):null;const parentStatusColor=parentOrder?(parentOrder.sellStatus==='sold'?'text-blue-500':parentOrder.sellStatus==='selling'?'text-red-500':parentOrder.status==='completed'?'text-green-500':'text-gray-400'):'text-gray-400';const parentOrderNo=parentOrder?(()=>{const d=new Date(parentOrder.createdAt);const bjd=new Date(d.toLocaleString('en-US',{timeZone:'Asia/Shanghai'}));return `AF${String(bjd.getFullYear()).slice(2)}${String(bjd.getMonth()+1).padStart(2,'0')}${String(bjd.getDate()).padStart(2,'0')}${String(parentOrder.id).padStart(6,'0')}`;})():null;return(<div className="mt-2 text-xs rounded-lg px-3 py-2 border border-purple-100 bg-purple-50"><div className="flex items-center justify-between"><span className="text-purple-600 font-medium">推荐人奖励赠单</span>{order.sourceUsername&&<span className="text-gray-500">来自 <span className="font-medium text-gray-700">{order.sourceUsername}</span></span>}</div>{parentOrder&&<div className="mt-1 flex items-center gap-1.5 text-gray-500"><span>关联正单</span>{parentOrderNo&&<span className="font-mono text-gray-600">{parentOrderNo}</span>}<span className={`font-medium ${parentStatusColor}`}>{parentStatus}</span></div>}</div>);})()}
                              {!(order.isGift===true||order.isGift===1)&&(()=>{const giftOrders:any[]=(order as any).giftOrders||[];if(giftOrders.length===0)return null;const soldCount=giftOrders.filter((g:any)=>g.sellStatus==='sold').length;const sellingCount=giftOrders.filter((g:any)=>g.sellStatus==='selling').length;const holdingCount=giftOrders.length-soldCount-sellingCount;return(<div className="mt-2 text-xs rounded-lg px-3 py-1.5 border border-purple-100 bg-purple-50 flex items-center gap-2 flex-wrap"><span className="text-purple-600 font-medium">关联赠单 {giftOrders.length}笔</span>{soldCount>0&&<span className="text-blue-500">已卖出 {soldCount}</span>}{sellingCount>0&&<span className="text-red-500">委卖中 {sellingCount}</span>}{holdingCount>0&&<span className="text-green-500">持仓中 {holdingCount}</span>}</div>);})()}
                              {isEditing && editState?.sellStatus === 'sold' && (<div className="mt-3 space-y-3"><div className="bg-orange-50 border border-orange-200 rounded-lg p-3"><p className="text-xs text-orange-600 font-medium mb-2">确认卖出成交，请输入实际卖出价格</p><div className="flex items-center gap-2"><span className="text-xs text-gray-500 whitespace-nowrap">实际卖出价</span><input type="number" placeholder="输入实际成交价格" value={editState!.actualSellPrice} onChange={(e) => setEditState({ ...editState!, actualSellPrice: e.target.value })} className="border border-orange-300 rounded px-2 py-1 text-sm w-full focus:outline-none focus:border-orange-500" /><span className="text-xs text-gray-400 whitespace-nowrap">USDT</span></div></div>{editState!.actualSellPrice && calculateProfit(order, editState!.actualSellPrice) && (() => { const calc = calculateProfit(order, editState!.actualSellPrice)!; return (<div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2"><p className="text-xs font-medium text-blue-600">实时利润计算</p><div className="space-y-1.5 text-xs"><div className="flex justify-between"><span className="text-gray-600">持币数量</span><span className="font-medium text-gray-800">{calc.coinQuantity.toFixed(6)} {order.coin}</span></div><div className="flex justify-between"><span className="text-gray-600">买入价</span><span className="font-medium text-gray-800">{calc.buyPrice.toLocaleString()} USDT</span></div><div className="flex justify-between"><span className="text-gray-600">卖出价</span><span className="font-medium text-gray-800">{calc.sellPrice.toLocaleString()} USDT</span></div></div></div>); })()}</div>)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div className="pb-6">
            {/* 表头 */}
            <div
              className="grid items-center bg-gray-100 border border-gray-300 text-[11px] font-semibold text-gray-600"
              style={{ gridTemplateColumns: '80px 1fr 56px' }}
            >
              <div className="px-1 py-1.5 text-center border-r border-gray-300">日期</div>
              <div className="px-2 py-1.5 border-r border-gray-300">持仓明细</div>
              <div className="px-1 py-1.5 text-center">展开</div>
            </div>
            {(() => {
              // 分组逻辑：
              // - 持仓中（status=completed）：按登记时间 confirmedAt 分组
              // - 委托中（status=pending）：按开仓时间 createdAt 分组
              // 注：赠单嵌套在正单的 giftOrders 里，不单独分组
              // 北京时间日期分组key（直接用UTC方法，因为MySQL存的就是北京时间）
              const toDateKey = (d: Date | null) => d
                ? `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
                : '未知日期';
              const getOrderDateKey = (order: any): string => {
                // 已卖出：优先用卖出时间 sellConfirmedAt 分组（让今天卖出的订单出现在今天日期组）
                if (order.sellStatus === 'sold' && order.sellConfirmedAt) {
                  return toDateKey(new Date(order.sellConfirmedAt));
                }
                // 持仓中（completed）：用登记时间 confirmedAt
                if (order.status === 'completed' && order.confirmedAt) {
                  return toDateKey(new Date(order.confirmedAt));
                }
                // 委托中（pending）或无登记时间：用开仓时间 createdAt
                return toDateKey(order.createdAt ? new Date(order.createdAt) : null);
              };
              const dateGroups: Record<string, any[]> = {};
              (searchedOrders || []).forEach((order: any) => {
                // 所有订单（正单+赠单）都作为独立行加入日期分组
                const dateKey = getOrderDateKey(order);
                if (!dateGroups[dateKey]) dateGroups[dateKey] = [];
                dateGroups[dateKey].push(order);
              });
              const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a));
              return sortedDates.map(dateKey => {
                const groupOrders = dateGroups[dateKey];
                // 已撤单 Tab 下只显示撤单；其他 Tab 下跳过全是撤销单的日期组
                if (statusFilter === 'cancelled') {
                  const hasCancelled = groupOrders.some((o: any) => o.status === 'cancelled');
                  if (!hasCancelled) return null;
                } else {
                  const hasActiveOrders = groupOrders.some((o: any) => o.status !== 'cancelled');
                  if (!hasActiveOrders) return null;
                }
                const isOpen = expandedDates[dateKey] ?? false;
                // 是否该日期所有正单（含其嵌套赠与单）已全部卖出
                // 在「卖出」 Tab 下所有订单本就是已卖出的，不需要用灰色标注
                const allSold = statusFilter !== 'sold' && groupOrders.every((o: any) => o.sellStatus === 'sold');
                // 统计：投入总额、各币种持仓数量（过滤掉已撤单）
                const activeOrders = groupOrders.filter((o: any) => o.status !== 'cancelled');
                const totalAmount = activeOrders.reduce((s: number, o: any) => s + (parseFloat(o.amount) || 0), 0);
                const coinQty: Record<string, number> = {};
                const coinQtyEffective: Record<string, number> = {}; // 折后数量
                activeOrders.forEach((o: any) => {
                  // 赠单和正单均已作为独立行，直接统计本身（排除已卖出的）
                  if (o.sellStatus !== 'sold' && o.coin) {
                    const qty = parseFloat(o.quantity) || 0;
                    coinQty[o.coin] = (coinQty[o.coin] || 0) + qty;
                    let rate: number;
                    if (o.tierMode === 'linear') {
                      const buyPrice = parseFloat(o.limitPrice) || 0;
                      const lowPrice = parseFloat(o.allTimeLowPrice) || buyPrice;
                      const dropPct = buyPrice > 0 ? Math.max(0, (buyPrice - lowPrice) / buyPrice) : 0;
                      rate = Math.max(0, 1 - dropPct);
                    } else {
                      rate = EQUITY_DISCOUNT_RATES[o.equityTier || 0] ?? 1.0;
                    }
                    coinQtyEffective[o.coin] = (coinQtyEffective[o.coin] || 0) + qty * rate;
                  }
                });
                const qtyStr = Object.entries(coinQty).map(([c, q]) => `${q.toFixed(4)} ${c}`).join(' / ');
                return (
                  <div key={dateKey}>
                    {/* 日期分组标题行 */}
                    {(() => {
                      // 日期格式：「6月X日」（月份中文，日期数字）
                      const dateParts = dateKey.split('-'); // ["2026","05","28"]
                      const shortDate = dateParts.length === 3
                        ? `${parseInt(dateParts[1], 10)}月${parseInt(dateParts[2], 10)}日`
                        : dateKey;
                      // 正单数量（排除赠单）
                      const normalCount = activeOrders.filter((o: any) => !(o.isGift === true || o.isGift === 1)).length;
                      // 赠单数量（赠单已作为独立行，直接统计）
                      const giftCount = activeOrders.filter((o: any) => o.isGift === true || o.isGift === 1).length;
                      // 各币种简写和颜色：ETH→E(蓝色) BTC→B(橙色) SOL→S(紫色)
                      const COIN_CONFIG: Record<string, { short: string; color: string }> = {
                        ETH: { short: 'E', color: '#3b82f6' },
                        BTC: { short: 'B', color: '#f59e0b' },
                        SOL: { short: 'S', color: '#a855f7' },
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
                          const cfg = COIN_CONFIG[c] || { short: c, color: '#6b7280' };
                          const qNum = q as number;
                          const qStr = fmtCoinQty(c, qNum);
                          const effNum = coinQtyEffective[c] ?? qNum;
                          // 只有折后数量与原始数量不同时才显示括号（精度到4位小数比较）
                          const hasDiscount = Math.abs(effNum - qNum) > 0.00005;
                          const effStr = hasDiscount ? fmtCoinQty(c, effNum) : null;
                          // 判断该币种是否有线性模式订单（正单或赠单）
                          const hasLinear = activeOrders.some((o: any) =>
                            o.tierMode === 'linear' && o.coin === c && o.sellStatus !== 'sold'
                          );
                          // 线性模式保留两位小数，阶梯模式取整数
                          const pctStr = hasDiscount
                            ? (hasLinear ? `${((effNum / qNum) * 100).toFixed(2)}%` : `${Math.round((effNum / qNum) * 100)}%`)
                            : null;
                          return { short: cfg.short, color: cfg.color, qStr, effStr, pctStr };
                        });
                      return (
                        <button
                          onClick={() => toggleDate(dateKey)}
                          className={`w-full grid items-stretch text-left transition-colors border-x border-b border-gray-300 hover:bg-gray-50 ${
                            allSold ? 'bg-gray-50' : 'bg-white'
                          }`}
                          style={{ gridTemplateColumns: '80px 1fr 56px' }}
                        >
                          {/* 列一：日期 */}
                          <div className={`flex items-center justify-center px-1 py-2 border-r border-gray-300 text-sm font-bold ${allSold ? 'text-gray-400' : 'text-gray-900'}`}>
                            {shortDate}
                          </div>
                          {/* 列二：持仓币种 + 金额/单数 两行 */}
                          <div className="flex flex-col justify-center px-2 py-1.5 border-r border-gray-300 min-w-0 overflow-hidden">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[11px] shrink-0 ${allSold ? 'text-gray-400' : 'text-gray-700'}`}>{normalCount}单</span>
                              {giftCount > 0 && <span className="text-[11px] shrink-0" style={{ color: allSold ? '#9ca3af' : '#f59e0b' }}>{giftCount}赠</span>}
                              <span className={`text-[11px] shrink-0 font-medium ${allSold ? 'text-gray-400' : 'text-gray-900'}`}>{totalAmount >= 10000 ? (totalAmount/10000).toFixed(1)+'万' : totalAmount.toFixed(0)}U</span>
                            </div>
                            {sortedCoinParts.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                                {sortedCoinParts.map(({ short, color, qStr, effStr, pctStr }) => (
                                  <span key={short} className="text-[11px] shrink-0" style={{ color: allSold ? '#9ca3af' : color }}>
                                    {short}:{qStr}
                                    {effStr && (
                                      <span>
                                        (<span className="font-bold" style={{ color: allSold ? '#9ca3af' : color }}>{effStr}</span><span className="text-gray-400 ml-0.5">{pctStr}</span>)
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* 列三：展开箭头 */}
                          <div className="flex items-center justify-center px-1 py-2">
                            <span className={`transition-transform duration-200 text-gray-900 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                          </div>
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

              // 生成订单编号（用UTC方法，因为MySQL存的北京时间在UTC环境下UTC值=北京时间值）
              const orderDate = new Date(order.createdAt);
              const yy = String(orderDate.getUTCFullYear()).slice(2);
              const mm = String(orderDate.getUTCMonth() + 1).padStart(2, '0');
              const dd = String(orderDate.getUTCDate()).padStart(2, '0');
              const orderNo = `AF${yy}${mm}${dd}${String(order.id).padStart(6, '0')}`;

              return (
                <div key={order.id} className="rounded-2xl p-4 shadow-sm mb-3 bg-white">
                  {/* 卡片头部：左信息 + 右时间按钮 */}
                  <div className="flex items-start justify-between mb-3 gap-3">
                    {/* 左侧：订单号 + 用户名 + 标签 */}
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[11px] font-mono text-gray-400 tracking-wide">{orderNo}</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-gray-700 shrink-0">
                          {order.username && order.nickname && order.username !== order.nickname
                            ? `${order.username}/${order.nickname}`
                            : order.nickname || order.username || `用户${order.userId}`}
                        </span>
                        {order.isGift && (
                          <span
                            className="inline-flex items-center justify-center font-black select-none shrink-0"
                            style={{
                              width: 18, height: 18, borderRadius: '50%', fontSize: 10,
                              color: '#FFD700',
                              background: 'radial-gradient(circle at 35% 30%, #5a1a1a 0%, #1a0a00 55%, #3d0000 100%)',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                              border: '1.5px solid #8B4513',
                              textShadow: '0 1px 2px rgba(255,180,0,0.8)',
                            }}
                          >赠</span>
                        )}
                        {order.status === 'completed' && (
                          order.tierMode === 'linear'
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: '#EFF6FF', color: '#3B82F6', border: '1px solid #BFDBFE' }}>线性</span>
                            : <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: '#FFF7ED', color: '#D97706', border: '1px solid #FED7AA' }}>阶梯</span>
                        )}
                      </div>
                    </div>
                    {/* 右侧：时间 + 按钮 */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[10px] text-gray-400">
                          <span className="text-gray-300 mr-1">开仓</span>{formatDate(order.createdAt)}
                        </span>
                        {order.confirmedAt && (
                          <span className="text-[10px] text-blue-400">
                            <span className="text-blue-300 mr-1">登记</span>{formatDate(order.confirmedAt)}
                          </span>
                        )}
                        {order.sellStatus==='selling'&&order.sellAt&&<span className="text-[10px] text-orange-400"><span className="text-orange-300 mr-1">委卖</span>{formatDate(order.sellAt)}</span>}
                        {order.sellStatus==='sold'&&order.sellConfirmedAt&&<span className="text-[10px] text-green-500"><span className="text-green-400 mr-1">确认</span>{formatDate(order.sellConfirmedAt)}</span>}
                      </div>
                      {!isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => startEdit(order)}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> 编辑
                          </button>
                          <button
                            onClick={() => {
                              setDeleteTarget(order);
                              const isGift = order.isGift === true || order.isGift === 1;
                              setDeleteScope(isGift ? 'all' : 'all');
                              setSelectedGiftIds([]);
                              setRefundChecked(order.status === 'pending' && !isGift);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg px-2.5 py-1 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" /> 删除
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={saveEdit}
                            disabled={updateMutation.isPending}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-white bg-green-500 hover:bg-green-600 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" /> 保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg px-2.5 py-1 transition-colors"
                          >
                            <X className="w-3 h-3" /> 取消
                          </button>
                        </div>
                      )}
                    </div>
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
                          <select
                            value={editState!.sellStatus || ''}
                            onChange={(e) => {
                              const nextSellStatus = e.target.value || null;
                              setEditState({
                                ...editState!,
                                sellStatus: nextSellStatus,
                                // 选择委卖或已卖出时，自动将订单设为买入成交，确保所有订单类型均可录入实际卖出价。
                                status: nextSellStatus ? 'completed' : editState!.status,
                              });
                            }}
                            className="border border-gray-300 rounded px-2 py-0.5 text-xs"
                          >
                            <option value="">持仓中</option>
                            <option value="selling">委卖中</option>
                            <option value="sold">已卖出</option>
                          </select>
                        </div>
                      ) : (
                        <span className={`font-medium ${statusDisplay.color}`}>{statusDisplay.label}</span>
                      )}
                    </div>
                    {/* 档位计算方式（仅已成交订单显示） */}
                    {isEditing && editState!.status === 'completed' && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 w-12 shrink-0">档位模式</span>
                        <div className="flex rounded overflow-hidden border border-gray-300 text-xs">
                          <button
                            type="button"
                            onClick={() => setEditState({ ...editState!, tierMode: 'step' })}
                            className={`px-2 py-0.5 transition-colors ${
                              editState!.tierMode === 'step'
                                ? 'bg-blue-500 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >阶梯</button>
                          <button
                            type="button"
                            onClick={() => setEditState({ ...editState!, tierMode: 'linear' })}
                            className={`px-2 py-0.5 transition-colors ${
                              editState!.tierMode === 'linear'
                                ? 'bg-blue-500 text-white'
                                : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                          >线性</button>
                        </div>
                      </div>
                    )}
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
                          {parseFloat(order.limitPrice).toLocaleString()} <span className="text-gray-400">u</span>
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
                    {order.status === 'completed' && (() => {
                      const raw = order.quantity;
                      const num = parseFloat(raw);
                      let rate: number;
                      if (order.tierMode === 'linear') {
                        const buyP = parseFloat(order.limitPrice || '0');
                        const allLow = order.allTimeLowPrice ? parseFloat(String(order.allTimeLowPrice)) : 0;
                        rate = (buyP > 0 && allLow > 0) ? Math.max(0, 1 - (buyP - allLow) / buyP) : 1.0;
                      } else {
                        rate = EQUITY_DISCOUNT_RATES[order.equityTier] || 1.0;
                      }
                      if (rate >= 1.0) return null;
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
                    {/* 实际投入（左列） */}
                    {(() => {
                      const srcAmt = parseFloat(order.sourceAmount || '0');
                      const selfAmt = parseFloat(order.amount || '0');
                      const investAmt = order.isGift ? srcAmt : selfAmt;
                      return (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 w-12 shrink-0">实际投入</span>
                          <span className="font-medium text-gray-900">{investAmt.toFixed(2)} <span className="text-gray-400">u</span></span>
                        </div>
                      );
                    })()}
                    {/* 订单价值（右列） */}
                    {(() => {
                      const amount = parseFloat(order.amount);
                      const tradeValue = order.isGift ? amount : amount * 5.25;
                      return (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 w-12 shrink-0">订单价值</span>
                          <span className="text-gray-900 font-medium">{tradeValue.toFixed(2)} <span className="text-gray-400">u</span></span>
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
                            {giftAmt.toFixed(2)} <span className="text-gray-400">u</span>
                            {ratio > 0 && <span className="font-normal text-gray-400 ml-1">({ratio.toFixed(4)}倍)</span>}
                          </span>
                        </div>
                      );
                    })()}
                    {/* 卖出价格（委卖中或已卖出时显示） */}
                    {(order.sellStatus === 'selling' || order.sellStatus === 'sold') && (
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 w-12 shrink-0">卖出价</span>
                        <span className="font-medium text-gray-900">
                          {parseFloat(order.sellPrice).toLocaleString()} <span className="text-gray-400">u</span>
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
                    {/* 已卖出结算详情展示块 */}
                    {order.sellStatus === 'sold' && order.sellPrice && (() => {
                      const calc = calculateProfit(order, order.sellPrice);
                      if (!calc) return null;
                      const isGift = order.isGift === true || order.isGift === 1;
                      const startDate = new Date(order.createdAt);
                      const endDate = new Date(order.sellConfirmedAt);
                      const fmtD = (d: Date) => `${d.getUTCMonth()+1}月${d.getUTCDate()}日`;
                      return (
                        <div className="col-span-2 mt-1">
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1.5 text-xs">
                            <p className="text-xs font-semibold text-blue-600 mb-2">结算明细</p>
                            {/* 买卖价格 */}
                            <div className="flex justify-between">
                              <span className="text-gray-500">持币数量</span>
                              <span className="font-medium text-gray-800">{calc.coinQuantity.toFixed(6)} {order.coin}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">买入价</span>
                              <span className="font-medium text-gray-800">{calc.buyPrice.toLocaleString()} USDT</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">卖出价</span>
                              <span className="font-medium text-gray-800">{calc.sellPrice.toLocaleString()} USDT</span>
                            </div>
                            {/* 权益档位 */}
                            <div className="flex justify-between">
                              <span className="text-gray-500">权益档位</span>
                              <span className="font-medium text-amber-600">
                                {(() => {
                                  const rate = EQUITY_DISCOUNT_RATES[calc.equityTier] || 1.0;
                                  const tierName = calc.equityTier === 0 ? 'D0档（基准档）' : `D${calc.equityTier}档（跌${calc.equityTier * 10}%）`;
                                  return `${(rate * 100).toFixed(2)}% · ${tierName}`;
                                })()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">有效币数</span>
                              <span className="font-medium text-gray-800">{calc.effectiveQuantity.toFixed(6)} {order.coin}</span>
                            </div>
                            {/* 收益计算 */}
                            <div className="flex justify-between">
                              <span className="text-gray-500">单位收益</span>
                              <span className={`font-medium ${calc.unitProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {calc.unitProfit >= 0 ? '+' : ''}{calc.unitProfit.toFixed(2)} USDT
                              </span>
                            </div>
                            <div className="border-t border-blue-200 pt-1.5 mt-0.5 flex justify-between">
                              <span className="text-gray-600 font-medium">总收益</span>
                              <span className={`font-bold text-base ${calc.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {calc.totalProfit >= 0 ? '+' : ''}{calc.totalProfit.toFixed(4)} USDT
                              </span>
                            </div>
                            <div className="flex justify-between">
                              {isGift ? (
                                <span className="text-amber-600 font-medium">纯收益小计 <span className="text-[10px] font-normal text-amber-400">（赠单不含本金）</span></span>
                              ) : (
                                <span className="text-gray-600">本金+收益小计</span>
                              )}
                              <span className="font-medium text-gray-800">{calc.totalRefund.toFixed(4)} USDT</span>
                            </div>
                            {/* 管理费 */}
                            <div className="flex justify-between">
                              <span className="text-red-500">管理费扣除</span>
                              <span className="font-medium text-red-500">- {calc.managementFee.toFixed(4)} USDT</span>
                            </div>
                            <div className="text-[10px] text-red-400">
                              计费区间：{fmtD(startDate)} → {fmtD(endDate)}（共{calc.holdDays}天，{calc.dailyFee.toFixed(4)} USDT/天）
                            </div>
                            {/* 实际到账 */}
                            <div className="flex justify-between bg-green-50 rounded-lg px-2 py-1.5 border border-green-200 mt-1">
                              <span className="text-green-700 font-bold">实际到账</span>
                              <span className="font-bold text-green-600 text-base">{calc.actualRefund.toFixed(4)} USDT</span>
                            </div>
                            <p className="text-[10px] text-blue-500 mt-1">
                              {isGift
                                ? `纯收益 - 管理费 = ${Math.max(0, calc.totalProfit).toFixed(4)} - ${calc.managementFee.toFixed(4)} = ${calc.actualRefund.toFixed(4)} USDT（赠单不含本金）`
                                : `本金 + 收益 - 管理费 = ${calc.principal.toFixed(2)} + ${Math.max(0, calc.totalProfit).toFixed(4)} - ${calc.managementFee.toFixed(4)} = ${calc.actualRefund.toFixed(4)} USDT`
                              }
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 当前权益 */}
                    {order.status === 'completed' && (() => {
                      let rate: number;
                      let tierLabel: string;
                      if (order.tierMode === 'linear') {
                        const buyP = parseFloat(order.limitPrice || '0');
                        const allLow = order.allTimeLowPrice ? parseFloat(String(order.allTimeLowPrice)) : 0;
                        rate = (buyP > 0 && allLow > 0) ? Math.max(0, 1 - (buyP - allLow) / buyP) : 1.0;
                        tierLabel = 'L';
                      } else {
                        rate = EQUITY_DISCOUNT_RATES[order.equityTier] || 1.0;
                        tierLabel = order.equityTier === 0 ? 'D0档' : `D${order.equityTier}档`;
                      }
                      const pct = (rate * 100).toFixed(2);
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
                      const fmtLow = lowDate ? (() => {
                        // MySQL存的北京时间，直接用UTC方法即可，不需要+8小时
                        const mo = lowDate.getUTCMonth() + 1;
                        const da = lowDate.getUTCDate();
                        const hh = String(lowDate.getUTCHours()).padStart(2, '0');
                        const mi = String(lowDate.getUTCMinutes()).padStart(2, '0');
                        const sc = String(lowDate.getUTCSeconds()).padStart(2, '0');
                        return `${mo}/${da} ${hh}:${mi}:${sc}`;
                      })() : '';
                      return (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400 w-12 shrink-0">最低扫描</span>
                          <span className="font-medium text-blue-600">
                            {lowPrice.toLocaleString()} <span className="text-gray-400">u</span>
                            {fmtLow && <span className="text-gray-400 ml-1">({fmtLow})</span>}
                          </span>
                        </div>
                      );
                    })()}
                    {/* 累计管理费：待付管理费（已扣预收部分） */}
                    {(order.status === 'completed' || order.status === 'pending') && (
                      <FeeRow order={order} ledgerId={ledgerId} />
                    )}
                  </div>

                  {/* 赠单来源信息 + 关联正单状态 */}
                  {(order.isGift === true || order.isGift === 1) && (() => {
                    const srcAmt = parseFloat(order.sourceAmount || '0');
                    const giftAmt = parseFloat(order.amount || '0');
                    // 在 orders 中找到关联正单
                    const parentOrder = order.sourceOrderId
                      ? (orders as any[] || []).find((o: any) => o.id === order.sourceOrderId)
                      : null;
                    const parentStatus = parentOrder
                      ? (parentOrder.sellStatus === 'sold' ? '已卖出' :
                         parentOrder.sellStatus === 'selling' ? '委卖中' :
                         parentOrder.status === 'completed' ? '持仓中' :
                         parentOrder.status === 'cancelled' ? '已撤单' : '委买中')
                      : null;
                    const parentStatusColor = parentOrder
                      ? (parentOrder.sellStatus === 'sold' ? 'text-blue-500' :
                         parentOrder.sellStatus === 'selling' ? 'text-red-500' :
                         parentOrder.status === 'completed' ? 'text-green-500' : 'text-gray-400')
                      : 'text-gray-400';
                    const parentOrderNo = parentOrder ? (() => {
                      const d = new Date(parentOrder.createdAt);
                      return `AF${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}${String(parentOrder.id).padStart(6,'0')}`;
                    })() : null;
                    return (
                      <div className="mt-2 text-xs rounded-lg px-3 py-2 border border-purple-100 bg-purple-50">
                        <div className="flex items-center justify-between">
                          <span className="text-purple-600 font-medium">推荐人奖励赠单</span>
                          {order.sourceUsername && (
                            <span className="text-gray-500">来自 <span className="font-medium text-gray-700">{order.sourceUsername}</span></span>
                          )}
                        </div>
                        {parentOrder && (
                          <div className="mt-1 flex items-center gap-1.5 text-gray-500">
                            <span>关联正单</span>
                            {parentOrderNo && <span className="font-mono text-gray-600">{parentOrderNo}</span>}
                            <span className={`font-medium ${parentStatusColor}`}>{parentStatus}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 正单关联赠单状态标注 */}
                  {!(order.isGift === true || order.isGift === 1) && (() => {
                    const giftOrders: any[] = (order as any).giftOrders || [];
                    if (giftOrders.length === 0) return null;
                    const soldCount = giftOrders.filter((g: any) => g.sellStatus === 'sold').length;
                    const sellingCount = giftOrders.filter((g: any) => g.sellStatus === 'selling').length;
                    const holdingCount = giftOrders.length - soldCount - sellingCount;
                    return (
                      <div className="mt-2 text-xs rounded-lg px-3 py-1.5 border border-purple-100 bg-purple-50 flex items-center gap-2 flex-wrap">
                        <span className="text-purple-600 font-medium">关联赠单 {giftOrders.length}笔</span>
                        {soldCount > 0 && <span className="text-blue-500">已卖出 {soldCount}</span>}
                        {sellingCount > 0 && <span className="text-red-500">委卖中 {sellingCount}</span>}
                        {holdingCount > 0 && <span className="text-green-500">持仓中 {holdingCount}</span>}
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
                                    // 直接用UTC方法，MySQL存的北京时间在UTC环境下UTC值=北京时间值
                                    const dateStr = `${dt.getUTCMonth()+1}月${dt.getUTCDate()}日 ${dt.getUTCHours().toString().padStart(2,'0')}:${dt.getUTCMinutes().toString().padStart(2,'0')}`;
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
                                      <span>历史最低扫描价 · 第{lowestScan.scanCount}次扫描 · {(() => { const dt = new Date(lowestScan.scannedAt); return `${dt.getUTCMonth()+1}月${dt.getUTCDate()}日 ${dt.getUTCHours().toString().padStart(2,'0')}:${dt.getUTCMinutes().toString().padStart(2,'0')}`; })()}</span>
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
                                {order.isGift ? (
                                  <span className="text-amber-600 font-medium">纯收益小计 <span className="text-[10px] font-normal text-amber-400">（赠单不含本金返还）</span></span>
                                ) : (
                                  <span className="text-gray-600">本金+收益小计</span>
                                )}
                                <span className="font-medium text-gray-800">{calc.totalRefund.toFixed(4)} USDT</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-red-500">管理费扣除 ({calc.holdDays}天)</span>
                                <span className="font-medium text-red-500">- {calc.managementFee.toFixed(4)} USDT</span>
                              </div>
                              <div className="text-[10px] text-red-400">
                                {(() => {
                                  // 直接用UTC方法，MySQL存的北京时间在UTC环境下UTC值=北京时间值
                                  const startDate = new Date(order.createdAt);
                                  const endDate = (order.sellStatus === 'sold' && order.sellConfirmedAt)
                                    ? new Date(order.sellConfirmedAt)
                                    : new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
                                  const fmt = (d: Date) => `${d.getUTCMonth()+1}月${d.getUTCDate()}日`;
                                  return `计费区间：${fmt(startDate)} → ${fmt(endDate)}（共${calc.holdDays}天，${calc.dailyFee.toFixed(4)} USDT/天）`;
                                })()}
                              </div>
                              <div className="flex justify-between bg-green-50 rounded px-2 py-1.5 border border-green-200">
                                <span className="text-green-700 font-bold">实际到账</span>
                                <span className="font-bold text-green-600 text-base">{calc.actualRefund.toFixed(4)} USDT</span>
                              </div>
                            </div>
                            <p className="text-[10px] text-blue-500 mt-2">
                              {order.isGift
                                ? `纯收益 - 管理费 = ${Math.max(0, calc.totalProfit).toFixed(4)} - ${calc.managementFee.toFixed(4)} = ${calc.actualRefund.toFixed(4)} USDT（赠单不含本金）`
                                : `本金 + 收益 - 管理费 = ${calc.principal.toFixed(2)} + ${Math.max(0, calc.totalProfit).toFixed(4)} - ${calc.managementFee.toFixed(4)} = ${calc.actualRefund.toFixed(4)} USDT`
                              }
                            </p>
                          </div>
                        );
                      })()}

                      <p className="text-[10px] text-orange-400">
                        {order.isGift ? '系统将根据此价格计算纯收益到用户余额（赠单不返还本金）' : '系统将根据此价格计算收益并返还本金+收益到用户余额'}
                      </p>
                    </div>
                  )}
                  
                  {/* 编辑时的操作说明 */}
                  {isEditing && (
                    <div className="mt-3 text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
                      <p>· 修改买入状态为「已撤单」：将退回已扣余额</p>
                      <p>· 数量 = 实际投入 × 5.25 / 价格（自动计算）</p>
                      {editState?.sellStatus === 'selling' && <p>· 当前为委卖中状态，可改为「已卖出」确认成交</p>}
                      {editState?.sellStatus === 'sold' && <p>· 确认卖出成交：{order.isGift ? '返还纯收益到用户余额（赠单不含本金）' : '返还本金 + 实际收益到用户余额'}</p>}
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

      {/* 删除确认弹窗 */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="mx-4 rounded-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-gray-600">
                <p>删除订单 <span className="font-medium text-gray-800">#{deleteTarget?.id}</span>（{deleteTarget?.coin} {parseFloat(deleteTarget?.quantity || '0').toFixed(4)}）后无法恢复。</p>

                {/* 如果是赠单，直接删除，不显示范围选择 */}
                {(deleteTarget?.isGift === true || deleteTarget?.isGift === 1) ? (
                  <p className="text-orange-600">该订单为赠单，将直接删除。</p>
                ) : (
                  <>
                    {/* 删除范围选择 */}
                    {((deleteTarget?.giftOrders as any[]) || []).length > 0 && (
                      <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                        <p className="font-medium text-gray-700 text-xs">删除范围（该正单关联 {((deleteTarget?.giftOrders as any[]) || []).length} 笔赠单）</p>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="deleteScope" checked={deleteScope === 'all'} onChange={() => setDeleteScope('all')} className="accent-red-500" />
                          <span>删除正单 + 全部赠单</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="deleteScope" checked={deleteScope === 'mainOnly'} onChange={() => setDeleteScope('mainOnly')} className="accent-red-500" />
                          <span>仅删除正单（保留所有赠单）</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="deleteScope" checked={deleteScope === 'selected'} onChange={() => setDeleteScope('selected')} className="accent-red-500" />
                          <span>删除正单 + 勾选的赠单</span>
                        </label>
                        {/* 勾选赠单列表 */}
                        {deleteScope === 'selected' && (
                          <div className="ml-5 space-y-1 border-l-2 border-purple-200 pl-3">
                            {((deleteTarget?.giftOrders as any[]) || []).map((g: any) => (
                              <label key={g.id} className="flex items-center gap-2 cursor-pointer text-xs">
                                <input
                                  type="checkbox"
                                  checked={selectedGiftIds.includes(g.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedGiftIds([...selectedGiftIds, g.id]);
                                    } else {
                                      setSelectedGiftIds(selectedGiftIds.filter(id => id !== g.id));
                                    }
                                  }}
                                  className="accent-red-500"
                                />
                                <span className="text-gray-700">
                                  #{g.id} {g.coin} {parseFloat(g.quantity || '0').toFixed(4)} ({g.username && g.nickname && g.username !== g.nickname ? `${g.username}/${g.nickname}` : g.nickname || g.username})
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 退款选项 */}
                    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                      <p className="font-medium text-gray-700 text-xs">退款设置</p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={refundChecked}
                          onChange={(e) => setRefundChecked(e.target.checked)}
                          className="accent-green-500 w-4 h-4"
                        />
                        <span>同时退还投入金额到用户账户</span>
                      </label>
                      {refundChecked && (
                        <p className="text-xs text-green-600 ml-6">将退回 {parseFloat(deleteTarget?.amount || '0').toFixed(2)} USDT 到用户 {deleteTarget?.username && deleteTarget?.nickname && deleteTarget?.username !== deleteTarget?.nickname ? `${deleteTarget?.username}/${deleteTarget?.nickname}` : deleteTarget?.nickname || deleteTarget?.username} 的账户</p>
                      )}
                      {deleteTarget?.status === 'pending' && (
                        <p className="text-xs text-yellow-600 ml-6">委买中的订单建议退款（资金已冻结）</p>
                      )}
                      {(deleteTarget?.status === 'completed' && deleteTarget?.sellStatus !== 'sold') && (
                        <p className="text-xs text-gray-400 ml-6">持仓中的订单，请根据实际情况决定是否退款</p>
                      )}
                      {deleteTarget?.sellStatus === 'sold' && (
                        <p className="text-xs text-gray-400 ml-6">已卖出的订单已经结算，通常无需退款</p>
                      )}
                      {deleteTarget?.status === 'cancelled' && (
                        <p className="text-xs text-gray-400 ml-6">已撤单的订单已退过款，通常无需再次退款</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">取消</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate({
                  ledgerId,
                  orderId: deleteTarget.id,
                  deleteScope,
                  selectedGiftIds: deleteScope === 'selected' ? selectedGiftIds : undefined,
                  refund: refundChecked,
                });
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

 
