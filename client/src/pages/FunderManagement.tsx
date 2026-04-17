import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, Pencil, Trash2, User, TrendingUp, ChevronLeft as CalLeft, ChevronRight as CalRight } from "lucide-react";
import { toast } from "sonner";

// 币种选项
const COIN_OPTIONS = ['BTC', 'ETH', 'SOL'] as const;
type CoinType = typeof COIN_OPTIONS[number];

const STATUS_OPTIONS = [
  { value: 'active', label: '持有中' },
  { value: 'settled', label: '已结算' },
  { value: 'cancelled', label: '已取消' },
];

const INTEREST_PAYMENT_OPTIONS = [
  { value: 'monthly_pre', label: '月付先付' },
  { value: 'monthly_post', label: '月付后付' },
  { value: 'semi_pre', label: '半年付先付' },
  { value: 'semi_post', label: '半年付后付' },
  { value: 'annual_pre', label: '年付先付' },
  { value: 'annual_post', label: '年付后付' },
  { value: 'end_post', label: '结束后付' },
];

const COIN_COLORS: Record<CoinType, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
};

// 简单日历选择器组件
function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const selected = value ? new Date(value + 'T00:00:00') : null;

  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDay = (d: number) => {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    onChange(`${viewYear}-${mm}-${dd}`);
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSelected = (d: number) => {
    if (!selected) return false;
    return selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d;
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden" style={{ backgroundColor: '#FAFBFF' }}>
      {/* 月份导航 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-100">
          <CalLeft className="w-4 h-4 text-gray-400" />
        </button>
        <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>
          {viewYear}年 {monthNames[viewMonth]}
        </span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-100">
          <CalRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      {/* 星期头 */}
      <div className="grid grid-cols-7 text-center py-1">
        {['日', '一', '二', '三', '四', '五', '六'].map(d => (
          <div key={d} className="text-[10px] text-gray-400 py-0.5">{d}</div>
        ))}
      </div>
      {/* 日期格子 */}
      <div className="grid grid-cols-7 text-center pb-2 px-1">
        {cells.map((d, i) => (
          <div key={i} className="py-0.5">
            {d !== null ? (
              <button
                onClick={() => handleDay(d)}
                className="w-7 h-7 mx-auto flex items-center justify-center rounded-full text-xs font-medium"
                style={isSelected(d)
                  ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                  : { color: '#374151' }}
              >
                {d}
              </button>
            ) : <div className="w-7 h-7" />}
          </div>
        ))}
      </div>
      {/* 已选日期显示 */}
      {value && (
        <div className="px-3 pb-2 text-center text-xs text-blue-500 font-medium">
          已选：{value}
        </div>
      )}
    </div>
  );
}

export default function FunderManagement() {
  const [, params] = useRoute("/ledger/:id/funder-management");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showInterestDatePicker, setShowInterestDatePicker] = useState(false);
  // 结息记录相关 state
  const [showPaymentPanel, setShowPaymentPanel] = useState<number | null>(null); // 当前展开结息面板的订单id
  const [paymentForm, setPaymentForm] = useState({ amount: '', currency: 'U' as 'CNY' | 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' });
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null); // 正在编辑的结息记录id
  const [showPaymentDatePicker, setShowPaymentDatePicker] = useState(false);

  const [formData, setFormData] = useState({
    userId: 0,
    coin: 'BTC' as CoinType,
    buyPrice: '',
    buyQuantity: '',
    buyDate: '',
    storageAccount: '',
    status: 'active',
    adminNote: '',
    publicNote: '',
    interestRateAnnual: '',
    interestPaymentType: '',
    interestBase: '',
    interestBaseCurrency: 'USDT' as 'USDT' | 'CNY',
    interestRateCurrency: 'USDT' as 'USDT' | 'CNY',
    interestStartDate: '',
    showProfitShare: true,
    commissionShare: '',
    originalAmount: '', // 编辑时保存原订单金额，买入价格或数量为空时回退使用
  });

  // 担保货币列表：[{ coin: 'BTC', qty: '' }, ...]
  const [collateralAssets, setCollateralAssets] = useState<{ coin: string; qty: string }[]>([]);

  // 字段展示配置（控制订单卡片各字段的显示/隐藏）
  const DEFAULT_DISPLAY_CONFIG: Record<string, boolean> = {
    buyPrice: true,
    buyValue: true,
    interestBase: true,
    buyDate: true,
    todayPrice: true,
    currentValue: true,
    holdDuration: true,
    orderNo: true,
    accruedInterest: true,
    paidInterest: true,
    interestStartDate: true,
    collateralCoin: true,
    collateralValue: true,
    collateral: true,
    profitShare: true,
    commissionShare: true,
  };
  const [displayConfig, setDisplayConfig] = useState<Record<string, boolean>>(DEFAULT_DISPLAY_CONFIG);
  const COLLATERAL_COINS = ['BTC', 'ETH', 'SOL', 'USDT'];

  // 自动折算总金额
  const computedAmount = useMemo(() => {
    const price = parseFloat(formData.buyPrice);
    const qty = parseFloat(formData.buyQuantity);
    if (!isNaN(price) && !isNaN(qty) && price > 0 && qty > 0) {
      return (price * qty).toFixed(2);
    }
    return '';
  }, [formData.buyPrice, formData.buyQuantity]);

  // 担保价值（在 assetOrdersData 定义后使用）——放到这里是为了先定义类型，实际计算在下方的 derivedCollateral 中
  const { data: funderUsers, isLoading: usersLoading } = trpc.ledger.funderGetFunderUsers.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  const { data: assetOrdersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId, ...(selectedUserId ? { userId: selectedUserId } : {}) },
    { enabled: ledgerId > 0 }
  );
  // funderGetAssetOrders 返回 { orders, livePrices }，取 orders 数组
  const assetOrders = (assetOrdersData as any)?.orders ?? assetOrdersData ?? [];
  const formLivePrices: Record<string, number> = (assetOrdersData as any)?.livePrices ?? {};

  // 编辑订单时实时查询已结利息
  const editingOrderId = editingOrder?.id ?? null;
  const { data: editingPaidSummary } = trpc.ledger.funderGetInterestPaymentSummary.useQuery(
    { ledgerId, orderIds: editingOrderId ? [editingOrderId] : [] },
    { enabled: !!editingOrderId && ledgerId > 0 }
  );
  const previewPaidInterest = editingOrderId && editingPaidSummary
    ? ((editingPaidSummary as any)[editingOrderId] ?? 0)
    : 0;

  // 担保价值（所有担保货币折算为 USDT 的总值）
  const computedCollateralValue = useMemo(() => {
    if (collateralAssets.length === 0) return null;
    let total = 0;
    let hasAny = false;
    for (const item of collateralAssets) {
      if (!item.coin) continue;
      const qty = parseFloat(item.qty);
      // qty 为空字符串时跳过，其他情况（包括 0）都算有效
      if (item.qty === '' || isNaN(qty)) continue;
      hasAny = true; // qty=0 也算有效填写
      if (item.coin === 'USDT') {
        total += qty;
      } else {
        const price = formLivePrices[item.coin];
        if (price) total += qty * price;
        // 即使没有实时价格，qty=0 时也不影响 total（加 0）
      }
    }
    return hasAny ? total : null;
  }, [collateralAssets, formLivePrices]);

  // 担保缺口 = 订单总金额 - 担保价值
  const computedCollateralGap = useMemo(() => {
    if (computedCollateralValue === null) return null;
    const orderAmt = parseFloat(computedAmount || '0');
    if (orderAmt <= 0) return null;
    return orderAmt - computedCollateralValue;
  }, [computedCollateralValue, computedAmount]);

  // 预览卡片实时待结利息（每秒更新）
  const [previewAccrued, setPreviewAccrued] = useState<number>(0);
  useEffect(() => {
    const compute = () => {
      const base = parseFloat(formData.interestBase || '0');
      const rate = parseFloat(formData.interestRateAnnual || '0');
      if (!base || !rate || !formData.interestStartDate) { setPreviewAccrued(0); return; }
      const startTs = new Date(formData.interestStartDate + 'T00:00:00').getTime();
      if (isNaN(startTs)) { setPreviewAccrued(0); return; }
      const elapsedSeconds = Math.max(0, (Date.now() - startTs) / 1000);
      const perSecond = (base * rate / 100) / (365 * 24 * 3600);
      setPreviewAccrued(perSecond * elapsedSeconds);
    };
    compute();
    const timer = setInterval(compute, 1000);
    return () => clearInterval(timer);
  }, [formData.interestBase, formData.interestRateAnnual, formData.interestStartDate]);

  // 预览卡片实时风险敎口
  const previewExposure = useMemo(() => {
    if (computedCollateralValue === null) return null;
    const liveP = formLivePrices[formData.coin];
    const buyQty = parseFloat(formData.buyQuantity || '0');
    const buyPriceNum = parseFloat(formData.buyPrice || '0');
    const buyValue = buyPriceNum * buyQty;
    const currentValue = liveP ? liveP * buyQty : null;
    const floatPnl = currentValue !== null ? currentValue - buyValue : null;
    return floatPnl !== null
      ? computedCollateralValue + floatPnl - previewAccrued
      : computedCollateralValue - previewAccrued;
  }, [computedCollateralValue, formLivePrices, formData.coin, formData.buyQuantity, formData.buyPrice, previewAccrued]);

  const createMutation = trpc.ledger.funderCreateAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('创建成功');
      setShowForm(false);
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.ledger.funderUpdateAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('更新成功');
      setShowForm(false);
      setEditingOrder(null);
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.ledger.funderDeleteAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('删除成功');
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  // 结息记录相关
  const { data: interestPayments, refetch: refetchPayments } = trpc.ledger.funderGetInterestPayments.useQuery(
    { ledgerId, orderId: showPaymentPanel! },
    { enabled: showPaymentPanel !== null }
  );

  const addPaymentMutation = trpc.ledger.funderAddInterestPayment.useMutation({
    onSuccess: () => {
      toast.success('结息记录已添加');
      setPaymentForm({ amount: '', currency: 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' });
      refetchPayments();
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePaymentMutation = trpc.ledger.funderUpdateInterestPayment.useMutation({
    onSuccess: () => {
      toast.success('结息记录已更新');
      setEditingPaymentId(null);
      setPaymentForm({ amount: '', currency: 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' });
      refetchPayments();
    },
    onError: (err) => toast.error(err.message),
  });

  const deletePaymentMutation = trpc.ledger.funderDeleteInterestPayment.useMutation({
    onSuccess: () => {
      toast.success('结息记录已删除');
      refetchPayments();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleOpenCreate = (userId: number) => {
    setFormData({
      userId,
      coin: 'BTC',
      buyPrice: '',
      buyQuantity: '',
      buyDate: '',
      storageAccount: '',
      status: 'active',
      adminNote: '',
      publicNote: '',
      interestRateAnnual: '',
      interestPaymentType: '',
      interestBase: '',
      interestBaseCurrency: 'USDT' as 'USDT' | 'CNY',
      interestRateCurrency: 'USDT' as 'USDT' | 'CNY',
      interestStartDate: '',
      showProfitShare: true,
      commissionShare: '',
    });
    setCollateralAssets([]);
    setDisplayConfig(DEFAULT_DISPLAY_CONFIG);
    setEditingOrder(null);
    setShowDatePicker(false);
    setShowInterestDatePicker(false);
    setShowForm(true);
  };

  const handleOpenEdit = (order: any) => {
    setFormData({
      userId: order.user_id,
      coin: order.coin as CoinType,
      buyPrice: order.buy_price || '',
      buyQuantity: order.buy_quantity || '',
      buyDate: order.buy_date || '',
      storageAccount: order.storage_account || '',
      status: order.status,
      adminNote: order.admin_note || '',
      publicNote: order.public_note || '',
      interestRateAnnual: order.interest_rate_annual || '',
      interestPaymentType: order.interest_payment_type || '',
      interestBase: order.interest_base || '',
      interestBaseCurrency: (order.interest_base_currency || 'USDT') as 'USDT' | 'CNY',
      interestRateCurrency: (order.interest_rate_currency || 'USDT') as 'USDT' | 'CNY',
      interestStartDate: order.interest_start_date ? String(order.interest_start_date).slice(0, 10) : '',
      showProfitShare: order.show_profit_share !== 0 && order.show_profit_share !== false,
      commissionShare: order.commission_share || '',
      originalAmount: order.amount || '',
    });
    // 加载担保货币
    try {
      const ca = order.collateral_assets;
      if (ca) {
        const parsed = typeof ca === 'string' ? JSON.parse(ca) : ca;
        setCollateralAssets(Array.isArray(parsed) ? parsed : []);
      } else {
        setCollateralAssets([]);
      }
    } catch { setCollateralAssets([]); }
    // 加载字段展示配置
    try {
      const dc = order.display_config;
      if (dc) {
        const parsed = typeof dc === 'string' ? JSON.parse(dc) : dc;
        // 过滤掉非 boolean 值，防止旧数据污染导致后端校验失败
        const safeConfig: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'boolean') safeConfig[k] = v;
        }
        setDisplayConfig({ ...DEFAULT_DISPLAY_CONFIG, ...safeConfig });
      } else {
        setDisplayConfig(DEFAULT_DISPLAY_CONFIG);
      }
    } catch { setDisplayConfig(DEFAULT_DISPLAY_CONFIG); }
    setEditingOrder(order);
    setShowDatePicker(false);
    setShowInterestDatePicker(false);
    setShowForm(true);
  };

  const handleSubmit = () => {
    // 编辑模式下，如果买入价/数量为空，使用原订单金额；新建模式必须填
    const finalAmount = computedAmount || (editingOrder ? formData.originalAmount : '');
    if (!finalAmount || parseFloat(finalAmount) <= 0) {
      toast.error('请填写买入价格和买入数量以自动计算总金额');
      return;
    }
    const payload = {
      ledgerId,
      coin: formData.coin,
      amount: finalAmount,
      buyPrice: formData.buyPrice || undefined,
      buyDate: formData.buyDate || undefined,
      buyQuantity: formData.buyQuantity || undefined,
      storageAccount: formData.storageAccount || undefined,
      adminNote: formData.adminNote || undefined,
      publicNote: formData.publicNote || undefined,
      interestRateAnnual: formData.interestRateAnnual || undefined,
      interestPaymentType: formData.interestPaymentType || undefined,
      interestBase: formData.interestBase || undefined,
      interestBaseCurrency: formData.interestBaseCurrency,
      interestRateCurrency: formData.interestRateCurrency,
      interestStartDate: formData.interestStartDate || undefined,
      showProfitShare: formData.showProfitShare,
      commissionShare: formData.commissionShare || undefined,
      collateralAssets: collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty))).length > 0
        ? collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)))
        : undefined,
      // 提交前确保 displayConfig 所有值都是 boolean
      displayConfig: Object.fromEntries(
        Object.entries(displayConfig).filter(([, v]) => typeof v === 'boolean')
      ) as Record<string, boolean>,
    };
    if (editingOrder) {
      updateMutation.mutate({ id: editingOrder.id, status: formData.status, ...payload });
    } else {
      createMutation.mutate({ userId: formData.userId, ...payload });
    }
  };

  const handleDelete = (orderId: number) => {
    if (!confirm('确定要删除这笔订单吗？')) return;
    deleteMutation.mutate({ id: orderId, ledgerId });
  };

  const getPaymentLabel = (val: string) => INTEREST_PAYMENT_OPTIONS.find(o => o.value === val)?.label || val;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F0F4FF' }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1 -ml-2">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-lg font-semibold text-white">资方管理</h1>
      </div>

      <div className="px-4 py-4">
        {/* 资金方用户列表 */}
        <div className="mb-4">
          <h2 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">选择资金方</h2>
          {usersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : !funderUsers || (funderUsers as any[]).length === 0 ? (
            <div className="text-center py-8 bg-white rounded-2xl shadow-sm">
              <User className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无资金方用户</div>
              <div className="text-gray-300 text-xs mt-1">请先在成员管理中将用户设为资金方角色</div>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedUserId(null)}
                className="shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all"
                style={selectedUserId === null
                  ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                  : { backgroundColor: '#fff', color: '#6B7280', border: '1px solid #E5E7EB' }}
              >
                全部
              </button>
              {(funderUsers as any[]).map((u: any) => (
                <button
                  key={u.userId}
                  onClick={() => setSelectedUserId(u.userId)}
                  className="shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all"
                  style={selectedUserId === u.userId
                    ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                    : { backgroundColor: '#fff', color: '#6B7280', border: '1px solid #E5E7EB' }}
                >
                  {u.nickname || u.name || u.username}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 新增订单按钮 */}
        {selectedUserId && (
          <div className="mb-4">
            <button
              onClick={() => handleOpenCreate(selectedUserId)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-medium shadow-md"
              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
            >
              <Plus className="w-4 h-4" />
              添加订单
            </button>
          </div>
        )}

        {/* 订单列表 */}
        <div>
          <h2 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
            订单列表 {assetOrders ? `· ${(assetOrders as any[]).length} 笔` : ''}
          </h2>
          {ordersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : !assetOrders || (assetOrders as any[]).length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无订单</div>
            </div>
          ) : (
            <div className="space-y-3">
              {(assetOrders as any[]).map((order: any) => {
                const statusLabel = STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status;
                const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
                const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl p-4 shadow-sm"
                    style={{ border: '1px solid #E5EDFF' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold px-2.5 py-0.5 rounded-full text-white" style={{ backgroundColor: coinColor }}>
                          {order.coin}
                        </span>
                        <span className="text-sm font-medium text-gray-700">
                          {order.userName || order.username}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setShowPaymentPanel(showPaymentPanel === order.id ? null : order.id); setPaymentForm({ amount: '', payDate: new Date().toISOString().slice(0, 10), note: '' }); }}
                          className="px-2 py-1 text-xs rounded-lg font-medium"
                          style={{ backgroundColor: showPaymentPanel === order.id ? '#1A56DB' : '#EFF6FF', color: showPaymentPanel === order.id ? '#fff' : '#1A56DB' }}
                        >
                          记录结息
                        </button>
                        <button onClick={() => handleOpenEdit(order)} className="p-1.5 text-gray-300 hover:text-blue-500 rounded-lg hover:bg-blue-50">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(order.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 总金额 */}
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-xl font-bold" style={{ color: '#1A2340' }}>
                        {parseFloat(order.amount).toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400">USDT 总价</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      {order.buy_price && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">买入价</span>
                          <span className="font-medium text-gray-700">{order.buy_price} U</span>
                        </div>
                      )}
                      {order.buy_quantity && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">买入数量</span>
                          <span className="font-medium text-gray-700">{order.buy_quantity ? parseFloat(parseFloat(order.buy_quantity).toFixed(8)).toString() : order.buy_quantity} {order.coin}</span>
                        </div>
                      )}
                      {order.buy_date && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">买入日期</span>
                          <span className="font-medium text-gray-700">{order.buy_date}</span>
                        </div>
                      )}
                      {order.storage_account && (
                        <div className="flex items-center gap-1 col-span-2">
                          <span className="text-gray-400">存放账号</span>
                          <span className="font-medium text-gray-700 truncate">{order.storage_account}</span>
                        </div>
                      )}
                      {order.interest_rate_annual && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">年化利息</span>
                          <span className="font-medium text-gray-700">{order.interest_rate_annual}%</span>
                        </div>
                      )}
                      {order.interest_payment_type && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">支付方式</span>
                          <span className="font-medium text-gray-700">{getPaymentLabel(order.interest_payment_type)}</span>
                        </div>
                      )}
                      {order.interest_base && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">计息基数</span>
                          <span className="font-medium text-gray-700">
                            {order.interest_base_currency === 'CNY'
                              ? `人民币 ${parseFloat(order.interest_base).toLocaleString()} 元`
                              : `${parseFloat(order.interest_base).toLocaleString()} USDT`}
                          </span>
                        </div>
                      )}
                    </div>

                    {order.admin_note && (
                      <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                        内部备注：{order.admin_note}
                      </div>
                    )}

                    {/* 结息记录面板 */}
                    {showPaymentPanel === order.id && (
                      <div className="mt-3 pt-3 border-t border-blue-100">
                        <div className="text-xs font-semibold text-blue-600 mb-2">结息记录</div>

                        {/* 新增/编辑表单 */}
                        <div className="bg-blue-50 rounded-xl p-3 mb-3 space-y-2">
                          {/* 币种选择 + 汇率 */}
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <div className="text-xs text-gray-400 mb-1">币种</div>
                              <div className="flex rounded-lg overflow-hidden border border-blue-200">
                                {(['U', 'CNY'] as const).map(c => (
                                  <button key={c}
                                    onClick={() => setPaymentForm(f => ({ ...f, currency: c }))}
                                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${paymentForm.currency === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`}
                                  >{c === 'U' ? 'U (USDT)' : '人民币'}</button>
                                ))}
                              </div>
                            </div>
                            <div className="w-24">
                              <div className="text-xs text-gray-400 mb-1">汇率 (CNY/U)</div>
                              <input
                                type="number"
                                value={paymentForm.exchangeRate}
                                onChange={e => setPaymentForm(f => ({ ...f, exchangeRate: e.target.value }))}
                                className="w-full px-2 py-1.5 text-sm border border-blue-200 rounded-lg bg-white"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <div className="text-xs text-gray-400 mb-1">结息金额（{paymentForm.currency === 'U' ? 'U' : '元'}）</div>
                              <input
                                type="number"
                                placeholder="请输入金额"
                                value={paymentForm.amount}
                                onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                                className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg bg-white"
                              />
                              {paymentForm.amount && !isNaN(parseFloat(paymentForm.amount)) && (
                                <div className="text-xs text-gray-400 mt-0.5">
                                  ≈ {paymentForm.currency === 'U'
                                    ? `${(parseFloat(paymentForm.amount) * parseFloat(paymentForm.exchangeRate || '7')).toFixed(2)} 元`
                                    : `${(parseFloat(paymentForm.amount) / parseFloat(paymentForm.exchangeRate || '7')).toFixed(4)} U`
                                  }
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="text-xs text-gray-400 mb-1">结息日期</div>
                              <div className="relative">
                                <input
                                  type="text"
                                  readOnly
                                  value={paymentForm.payDate}
                                  onClick={() => setShowPaymentDatePicker(v => !v)}
                                  className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg bg-white cursor-pointer"
                                />
                                {showPaymentDatePicker && (
                                  <div className="absolute top-full left-0 z-50 mt-1 bg-white rounded-xl shadow-lg border border-blue-100">
                                    <DatePicker value={paymentForm.payDate} onChange={v => { setPaymentForm(f => ({ ...f, payDate: v })); setShowPaymentDatePicker(false); }} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-400 mb-1">备注（可空）</div>
                            <input
                              type="text"
                              placeholder="如：3月利息"
                              value={paymentForm.note}
                              onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))}
                              className="w-full px-3 py-1.5 text-sm border border-blue-200 rounded-lg bg-white"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              disabled={!paymentForm.amount || (editingPaymentId ? updatePaymentMutation.isPending : addPaymentMutation.isPending)}
                              onClick={() => {
                                const amt = parseFloat(paymentForm.amount);
                                const rate = parseFloat(paymentForm.exchangeRate || '7');
                                if (editingPaymentId) {
                                  updatePaymentMutation.mutate({ ledgerId, paymentId: editingPaymentId, amount: amt, currency: paymentForm.currency, exchangeRate: rate, payDate: paymentForm.payDate, note: paymentForm.note });
                                } else {
                                  addPaymentMutation.mutate({ ledgerId, orderId: order.id, amount: amt, currency: paymentForm.currency, exchangeRate: rate, payDate: paymentForm.payDate, note: paymentForm.note });
                                }
                              }}
                              className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                              style={{ backgroundColor: '#1A56DB' }}
                            >
                              {(editingPaymentId ? updatePaymentMutation.isPending : addPaymentMutation.isPending) ? '提交中...' : (editingPaymentId ? '确认修改' : '确认添加')}
                            </button>
                            {editingPaymentId && (
                              <button
                                onClick={() => { setEditingPaymentId(null); setPaymentForm({ amount: '', currency: 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' }); }}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100"
                              >取消</button>
                            )}
                          </div>
                        </div>

                        {/* 历史记录 */}
                        {interestPayments && (interestPayments as any[]).length > 0 ? (
                          <div className="space-y-1.5">
                            <div className="text-xs text-gray-400 mb-1">历史结息记录</div>
                            {(interestPayments as any[]).map((p: any) => {
                              const isCNY = (p.currency || 'U') === 'CNY';
                              const rate = parseFloat(p.exchange_rate || '7');
                              const amt = parseFloat(p.amount);
                              const primaryAmt = amt.toFixed(2);
                              const primaryUnit = isCNY ? '元' : 'U';
                              const secondaryAmt = isCNY ? (amt / rate).toFixed(4) : (amt * rate).toFixed(2);
                              const secondaryUnit = isCNY ? 'U' : '元';
                              return (
                                <div key={p.id} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="text-xs font-medium text-gray-700">{p.pay_date?.slice(0, 10)}</span>
                                      {p.note && <span className="ml-2 text-xs text-gray-400">{p.note}</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="text-right">
                                        <div className="text-xs font-semibold" style={{ color: '#1A56DB' }}>+{primaryAmt} {primaryUnit}</div>
                                        <div className="text-xs text-gray-400">≈ {secondaryAmt} {secondaryUnit}</div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setEditingPaymentId(p.id);
                                          setPaymentForm({ amount: String(amt), currency: (p.currency || 'U') as 'CNY' | 'U', exchangeRate: String(rate), payDate: p.pay_date?.slice(0, 10) || new Date().toISOString().slice(0, 10), note: p.note || '' });
                                        }}
                                        className="text-blue-500 hover:text-blue-700 p-1"
                                        title="编辑"
                                      >✏️</button>
                                      <button
                                        onClick={() => { if (window.confirm('确认删除这笔结息记录？')) deletePaymentMutation.mutate({ ledgerId, paymentId: p.id }); }}
                                        className="text-red-400 hover:text-red-600 p-1"
                                        title="删除"
                                      >🗑️</button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400 text-center py-2">暂无结息记录</div>
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

      {/* 创建/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)', touchAction: 'none' }} onTouchMove={e => e.preventDefault()}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] flex flex-col" style={{ overscrollBehavior: 'contain' }}>
            <div className="flex-shrink-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl" style={{ zIndex: 10 }}>
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>
                {editingOrder ? '编辑订单' : '添加订单'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditingOrder(null); setShowDatePicker(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ overscrollBehavior: 'contain' }}>
              {/* 币种 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">币种</label>
                <div className="flex gap-2">
                  {COIN_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setFormData(d => ({ ...d, coin: c }))}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={
                        formData.coin === c
                          ? { backgroundColor: COIN_COLORS[c], color: '#fff', boxShadow: `0 4px 12px ${COIN_COLORS[c]}40` }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* 买入价格 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  买入价格（USDT）<span className="text-red-400 ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={formData.buyPrice}
                  onChange={e => setFormData(d => ({ ...d, buyPrice: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="如：65000"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 买入数量 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  买入数量（{formData.coin}）<span className="text-red-400 ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={formData.buyQuantity}
                  onChange={e => setFormData(d => ({ ...d, buyQuantity: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="如：0.5"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 自动折算总金额 */}
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#EEF4FF', border: '1px solid #C7D9FF' }}>
                <div className="text-xs text-gray-400 mb-0.5">自动折算总金额（USDT）</div>
                <div className="text-xl font-bold" style={{ color: '#1A56DB' }}>
                  {computedAmount ? parseFloat(computedAmount).toLocaleString() : '—'}
                  {computedAmount && <span className="text-sm font-normal text-blue-400 ml-1">USDT</span>}
                </div>
                {computedAmount && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formData.buyQuantity} {formData.coin} × {formData.buyPrice} USDT
                  </div>
                )}
              </div>

              {/* 买入日期 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">买入日期</label>
                <button
                  onClick={() => setShowDatePicker(v => !v)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-left focus:outline-none"
                  style={{ backgroundColor: '#fff', color: formData.buyDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                >
                  {formData.buyDate || '点击选择日期'}
                </button>
                {showDatePicker && (
                  <div className="mt-2">
                    <DatePicker
                      value={formData.buyDate}
                      onChange={v => { setFormData(d => ({ ...d, buyDate: v })); setShowDatePicker(false); }}
                    />
                  </div>
                )}
              </div>

              {/* 存放账号 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">存放账号</label>
                <input
                  type="text"
                  value={formData.storageAccount}
                  onChange={e => setFormData(d => ({ ...d, storageAccount: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="填写存放的交易所或钱包账号"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 分隔线：利息约定 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">利息约定</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 计息基数 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  计息基数
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">利息计算的本金基数</span>
                </label>
                <div className="flex gap-2 w-full min-w-0">
                  <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, interestBaseCurrency: 'USDT' }))}
                      className={`px-3 py-3 text-sm font-medium transition-colors ${
                        formData.interestBaseCurrency === 'USDT'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-500'
                      }`}
                    >USDT</button>
                    <button
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, interestBaseCurrency: 'CNY' }))}
                      className={`px-3 py-3 text-sm font-medium transition-colors ${
                        formData.interestBaseCurrency === 'CNY'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-500'
                      }`}
                    >人民币</button>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.interestBase}
                    onChange={e => setFormData(d => ({ ...d, interestBase: e.target.value }))}
                    className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder={formData.interestBaseCurrency === 'CNY' ? '如：800000' : '如：120000'}
                    style={{ display: 'block', boxSizing: 'border-box', width: '0' }}
                  />
                </div>
              </div>

              {/* 计息开始日期 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  计息开始日期
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">利息从此日开始累计</span>
                </label>
                <button
                  onClick={() => setShowInterestDatePicker(v => !v)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-left focus:outline-none"
                  style={{ backgroundColor: '#fff', color: formData.interestStartDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                >
                  {formData.interestStartDate || '点击选择开始日期'}
                </button>
                {showInterestDatePicker && (
                  <div className="mt-2">
                    <DatePicker
                      value={formData.interestStartDate}
                      onChange={v => { setFormData(d => ({ ...d, interestStartDate: v })); setShowInterestDatePicker(false); }}
                    />
                  </div>
                )}
              </div>

              {/* 约定年化利息 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">约定年化利息（%）</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.interestRateAnnual}
                    onChange={e => setFormData(d => ({ ...d, interestRateAnnual: e.target.value }))}
                    className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="如：8.5"
                    style={{ display: 'block', boxSizing: 'border-box' }}
                  />
                  <span className="text-base font-medium text-gray-500 shrink-0">% / 年</span>
                </div>
                {/* 利息计价货币选择 */}
                <div className="flex gap-2 mt-2">
                  {(['USDT', 'CNY'] as const).map(cur => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, interestRateCurrency: cur }))}
                      className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                      style={
                        formData.interestRateCurrency === cur
                          ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {cur === 'USDT' ? 'U（USDT）' : '人民币（元）'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 利息支付方式 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">利息支付方式</label>
                <div className="grid grid-cols-2 gap-2">
                  {INTEREST_PAYMENT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFormData(d => ({ ...d, interestPaymentType: d.interestPaymentType === opt.value ? '' : opt.value }))}
                      className="py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={
                        formData.interestPaymentType === opt.value
                          ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 分隔线：担保货币 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">担保货币</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 担保货币列表 */}
              <div className="space-y-3">
                {collateralAssets.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0">
                      {COLLATERAL_COINS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCollateralAssets(prev => prev.map((a, i) => i === idx ? { ...a, coin: c } : a))}
                          className={`px-2.5 py-2.5 text-xs font-medium transition-colors ${
                            item.coin === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'
                          }`}
                        >{c}</button>
                      ))}
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={item.qty}
                      onChange={e => setCollateralAssets(prev => prev.map((a, i) => i === idx ? { ...a, qty: e.target.value } : a))}
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="数量"
                      style={{ width: '0' }}
                    />
                    <button
                      type="button"
                      onClick={() => setCollateralAssets(prev => prev.filter((_, i) => i !== idx))}
                      className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-400 text-lg shrink-0"
                    >&times;</button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCollateralAssets(prev => [...prev, { coin: 'BTC', qty: '' }])}
                  className="w-full py-2.5 rounded-xl border border-dashed border-blue-300 text-sm text-blue-500 font-medium flex items-center justify-center gap-1"
                >
                  <span className="text-base leading-none">+</span> 添加担保货币
                </button>

                {/* 担保价值和担保缺口实时预览 */}
                {computedCollateralValue !== null && (
                  <div className="bg-blue-50 rounded-xl px-4 py-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">担保价值</span>
                      <span className="font-semibold text-blue-700">{computedCollateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                    </div>
                    {computedCollateralGap !== null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">担保缺口</span>
                        <span className={`font-semibold ${
                          computedCollateralGap > 0 ? 'text-red-500' : 'text-green-600'
                        }`}>
                          {computedCollateralGap > 0 ? '+' : ''}{computedCollateralGap.toLocaleString(undefined, { maximumFractionDigits: 2 })} U
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 分隔线：佣金分成 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">佣金分成</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 佣金分成输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">佣金分成说明</label>
                <input
                  type="text"
                  value={formData.commissionShare}
                  onChange={e => setFormData(d => ({ ...d, commissionShare: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="例如：年化收益的 20%"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>

              {/* 分隔线：备注 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">备注</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 公开备注（资金方可见） */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  公开备注
                  <span className="ml-1.5 text-xs text-green-500 font-normal">资金方可见</span>
                </label>
                <textarea
                  value={formData.publicNote}
                  onChange={e => setFormData(d => ({ ...d, publicNote: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={2}
                  placeholder="填写资金方可见的说明或备注"
                  style={{ display: 'block', boxSizing: 'border-box', resize: 'none' }}
                />
              </div>

              {/* 内部备注（资金方不可见） */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  内部备注
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">仅管理员可见</span>
                </label>
                <textarea
                  value={formData.adminNote}
                  onChange={e => setFormData(d => ({ ...d, adminNote: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={2}
                  placeholder="内部管理备注（资金方不可见）"
                  style={{ display: 'block', boxSizing: 'border-box', resize: 'none' }}
                />
              </div>

              {/* 状态（编辑时） */}
              {editingOrder && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">订单状态</label>
                  <div className="flex gap-2">
                    {STATUS_OPTIONS.map(s => (
                      <button
                        key={s.value}
                        onClick={() => setFormData(d => ({ ...d, status: s.value }))}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={
                          formData.status === s.value
                            ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                        }
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 分隔线：字段展示控制 */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">字段展示控制</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 字段开关面板 */}
              <div className="rounded-xl border border-gray-100 overflow-hidden" style={{ backgroundColor: '#FAFBFF' }}>
                {/* 左栏字段 */}
                <div className="px-4 pt-3 pb-1">
                  <div className="text-xs font-medium text-blue-500 mb-2">左栏：持有资产</div>
                  <div className="space-y-2">
                    {[
                      { key: 'buyPrice', label: '买入币价' },
                      { key: 'buyValue', label: '买入价值' },
                      { key: 'interestBase', label: '计息基数' },
                      { key: 'buyDate', label: '买入时间' },
                      { key: 'todayPrice', label: '今日币价' },
                      // 当前价值已移至持有资产括号显示，不再单独作为开关
                      { key: 'holdDuration', label: '持有时长' },
                      { key: 'orderNo', label: '订单编号' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{label}</span>
                        <button
                          type="button"
                          onClick={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                          className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                            displayConfig[key] ? 'bg-blue-500' : 'bg-gray-200'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            displayConfig[key] ? 'translate-x-5' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* 右栏上半：待结利息区 */}
                <div className="px-4 pb-2">
                  <div className="text-xs font-medium text-blue-500 mb-2">右栏上半：待结利息区</div>
                  <div className="space-y-2">
                    {[
                      { key: 'accruedInterest', label: '待结利息（标题+大数字）' },
                      { key: 'paidInterest', label: '已结利息' },
                      { key: 'interestStartDate', label: '计息日期' },
                      { key: 'collateralCoin', label: '担保货币' },
                      { key: 'collateralValue', label: '担保价值' },
                      { key: 'collateral', label: '担保缺口' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{label}</span>
                        <button
                          type="button"
                          onClick={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                          className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                            displayConfig[key] ? 'bg-blue-500' : 'bg-gray-200'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            displayConfig[key] ? 'translate-x-5' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* 右栏下半：收益分成区 */}
                <div className="px-4 pb-3">
                  <div className="text-xs font-medium text-blue-500 mb-2">右栏下半：收益分成区</div>
                  <div className="space-y-2">
                    {[
                      { key: 'profitShare', label: '收益分成（开启后显示下半区）' },
                      { key: 'commissionShare', label: '佣金分成' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{label}</span>
                        <button
                          type="button"
                          onClick={() => setDisplayConfig(c => ({ ...c, [key]: !c[key] }))}
                          className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                            displayConfig[key] ? 'bg-blue-500' : 'bg-gray-200'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                            displayConfig[key] ? 'translate-x-5' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 实时预览卡片 */}
              <div>
                <div className="text-xs font-medium text-gray-400 mb-2">实时预览（订单卡片展示效果）</div>
                <div className="rounded-2xl shadow-sm" style={{ border: '1px solid #E0E8FF', backgroundColor: '#FFFFFF', overflow: 'visible' }}>
                  {/* 顶部色条 */}
                  <div className="h-1" style={{ background: `linear-gradient(90deg, ${COIN_COLORS[formData.coin] || '#6B7280'}, ${COIN_COLORS[formData.coin] || '#6B7280'}55)` }} />
                  {/* 主体：左右两栏 */}
                  <div className="flex" style={{ minHeight: '100px' }}>
                    {/* 左栏 */}
                    <div className="flex-1 p-4 pr-3">
                      <div className="h-5 flex items-center text-xs font-medium" style={{ color: '#3B82F6' }}>持有资产</div>
                      <div className="h-7 flex items-baseline gap-1 flex-wrap">
                        <span className="text-lg font-bold tabular-nums" style={{ color: '#1A2340' }}>
                          {formData.buyQuantity ? parseFloat(parseFloat(formData.buyQuantity).toFixed(8)).toString() : '—'}
                        </span>
                        <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{formData.coin}</span>
                        {formLivePrices[formData.coin] && formData.buyQuantity ? (
                          <span className="text-xs" style={{ color: '#6B7280' }}>({(formLivePrices[formData.coin] * parseFloat(formData.buyQuantity)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U)</span>
                        ) : null}
                      </div>
                      <div className="space-y-0.5">
                        {displayConfig.buyPrice && formData.buyPrice && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">买入币价</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(formData.buyPrice).toLocaleString()} U</span>
                          </div>
                        )}
                        {displayConfig.buyValue && computedAmount && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">买入价值</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(computedAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                          </div>
                        )}
                        {displayConfig.buyDate && formData.buyDate && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">买入时间</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{formData.buyDate}</span>
                          </div>
                        )}
                        {displayConfig.todayPrice && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">今日币价</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>
                              {formLivePrices[formData.coin] ? formLivePrices[formData.coin].toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '---'}
                            </span>
                          </div>
                        )}
                        {/* 当前价值已移至持有资产大数字旁括号显示，此行已移除 */}
                        {displayConfig.holdDuration && formData.buyDate && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">持有时长</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>
                              {(() => {
                                const elapsed = Date.now() - new Date(formData.buyDate + 'T00:00:00').getTime();
                                if (elapsed < 0) return '---';
                                const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
                                const hours = Math.floor((elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
                              })()}
                            </span>
                          </div>
                        )}
                        {displayConfig.orderNo && editingOrder?.order_no && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">订单编号</span>
                            <span className="font-mono" style={{ color: '#9CA3AF' }}>{editingOrder.order_no}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 中间分隔线 */}
                    <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />
                    {/* 右栏 */}
                    <div className="w-44 p-4 pl-3 flex flex-col">
                      {/* 上半：待结利息区 */}
                      {displayConfig.accruedInterest && formData.interestBase && formData.interestRateAnnual && formData.interestStartDate ? (
                        <div className="flex-1">
                          {/* 待结利息标题 */}
                          <div className="h-5 flex items-center gap-1">
                            <span className="text-xs font-medium" style={{ color: '#3B82F6' }}>待结利息</span>
                            <span className="text-[10px] text-gray-400">
                              (年化 {parseFloat(formData.interestRateAnnual).toFixed(0)}%)
                            </span>
                          </div>
                          {/* 待结利息大数字 */}
                          <div className="h-7 flex items-baseline gap-0.5 whitespace-nowrap overflow-hidden">
                            <span className="text-lg font-bold tabular-nums" style={{ color: '#1A2340' }}>
                              {previewAccrued > 0 ? previewAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                            </span>
                            <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>
                              {formData.interestBaseCurrency === 'CNY' ? '元' : 'U'}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              ({formData.interestBaseCurrency === 'CNY'
                                ? (previewAccrued / 7).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'U'
                                : (previewAccrued * 7).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '元'})
                            </span>
                          </div>
                          {/* 明细行 */}
                          <div className="space-y-0.5">
                            {displayConfig.paidInterest && (
                              <div className="text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">已结利息</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>
                                    {(() => {
                                      const val = previewPaidInterest > 0 ? previewPaidInterest : 0;
                                      const mainUnit = formData.interestBaseCurrency === 'CNY' ? ' 元' : ' U';
                                      return <>{val.toLocaleString(undefined, { maximumFractionDigits: 2 })}{mainUnit}</>;
                                    })()}
                                  </span>
                                </div>
                                {(() => {
                                  const val = previewPaidInterest > 0 ? previewPaidInterest : 0;
                                  if (val <= 0) return null;
                                  const altVal = formData.interestBaseCurrency === 'CNY' ? val / 7 : val * 7;
                                  const altUnit = formData.interestBaseCurrency === 'CNY' ? 'U' : '元';
                                  return <div className="text-[10px] text-gray-400 mt-0.5">≈ {altVal.toLocaleString(undefined, { maximumFractionDigits: 2 })} {altUnit}</div>;
                                })()}
                              </div>
                            )}
                            {displayConfig.interestStartDate && formData.interestStartDate && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">计息日期</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>
                                  {formData.interestStartDate.replace(/^\d{4}-(\d{2})-(\d{2})$/, (_: string, m: string, d: string) => `${parseInt(m)}月${parseInt(d)}日`)}
                                </span>
                              </div>
                            )}
                            {displayConfig.collateralCoin && (() => {
                              const validAssets = collateralAssets.filter(a => a.coin && a.qty !== '');
                              if (validAssets.length === 0) return null;
                              return validAssets.map((a, idx) => (
                                <div key={idx} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-400">{validAssets.length > 1 ? `担保货币${idx + 1}` : '担保货币'}</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>
                                    {a.qty} {a.coin}
                                  </span>
                                </div>
                              ));
                            })()}
                            {displayConfig.collateralValue && collateralAssets.filter(a => a.coin && a.qty !== '').length > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">{collateralAssets.filter(a => a.coin && a.qty !== '').length > 1 ? '担保总值' : '担保价值'}</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>
                                  {computedCollateralValue !== null
                                    ? computedCollateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U'
                                    : '--- U'}
                                </span>
                              </div>
                            )}
                            {displayConfig.collateral && collateralAssets.filter(a => a.coin && a.qty !== '').length > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">担保缺口</span>
                                <span className="text-xs font-medium" style={{
                                  color: previewExposure !== null && previewExposure >= 0 ? '#4B5563' : '#16A34A'
                                }}>
                                  {previewExposure === null
                                    ? '---'
                                    : previewExposure >= 0
                                      ? '100%'
                                      : `-${Math.abs(previewExposure).toLocaleString(undefined, { maximumFractionDigits: 2 })} U`}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col justify-center h-full gap-0.5">
                          <div className="flex items-center justify-center">
                            <span className="text-xs text-gray-300">未配置利息</span>
                          </div>
                          {displayConfig.interestStartDate && formData.interestStartDate && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">计息日期</span>
                              <span className="font-medium" style={{ color: '#4B5563' }}>
                                {formData.interestStartDate.replace(/^\d{4}-(\d{2})-(\d{2})$/, (_: string, m: string, d: string) => `${parseInt(m)}月${parseInt(d)}日`)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* 中间分隔线：只在收益分成开启时显示 */}
                      {displayConfig.profitShare && displayConfig.accruedInterest && (
                        <div className="h-px my-2" style={{ backgroundColor: '#E8EFFF' }} />
                      )}
                      {/* 下半：收益分成区 */}
                      {displayConfig.profitShare && (
                        <div className="flex-1">
                          <div className="h-5 flex items-center">
                            <span className="text-xs font-medium" style={{ color: '#3B82F6' }}>收益分成</span>
                          </div>
                          <div className="h-7 flex items-baseline gap-0.5">
                            <span className="text-lg font-bold tabular-nums" style={{ color: '#1A2340' }}>---</span>
                            <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>U</span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">分成比例</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>---</span>
                          </div>
                          {displayConfig.commissionShare && formData.commissionShare && (
                            <div className="flex items-center justify-between text-xs mt-0.5">
                              <span className="text-gray-400">佣金分成</span>
                              <span className="font-medium" style={{ color: '#4B5563' }}>{formData.commissionShare}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {/* 备注行 */}
                  <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ borderTop: '1px solid #E8EFFF' }}>
                    <span className="shrink-0 mr-3" style={{ color: '#9CA3AF' }}>备注</span>
                    <span style={{ color: '#C0C8D8' }}>点击添加备注</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 提交按钮 */}
            <div className="flex-shrink-0 bg-white px-5 py-4 border-t border-gray-100">
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="w-full py-3.5 rounded-xl text-white font-semibold text-base disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
              >
                {(createMutation.isPending || updateMutation.isPending) ? '提交中...' : (editingOrder ? '保存修改' : '确认添加')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
