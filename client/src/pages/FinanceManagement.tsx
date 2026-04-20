import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Plus, Pencil, Trash2, TrendingUp, ChevronLeft as CalLeft, ChevronRight as CalRight } from "lucide-react";
import { toast } from "sonner";

const COIN_OPTIONS = ['BTC', 'ETH', 'SOL', 'AAVE', 'SUI', 'ONDO', 'ASTER', 'LDO', 'ENA', 'ARKM', 'USDT'] as const;
type CoinType = typeof COIN_OPTIONS[number];

// 整数型币种（单价较低，通常以整数计量）
const INTEGER_COINS = new Set(['SUI', 'ONDO', 'LDO', 'ENA', 'ARKM', 'AAVE']);

// 根据币种格式化数量：整数型去掉小数，BTC/ETH/SOL 保留最多6位有效小数
function formatCoinQty(qty: string | number | null | undefined, coin: string): string {
  if (!qty) return '';
  const num = typeof qty === 'string' ? parseFloat(qty) : qty;
  if (isNaN(num)) return String(qty);
  if (INTEGER_COINS.has(coin)) return Math.round(num).toLocaleString('en-US');
  // 去掉末尾多余的0，最多6位小数
  return parseFloat(num.toFixed(6)).toString();
}

// 担保价值实时显示小组件
function CollateralValueDisplay({ coin, qty, ledgerId }: { coin: string; qty: string; ledgerId: number }) {
  const { data: summary } = trpc.ledger.financeGetAssetSummary.useQuery(
    { ledgerId },
    { enabled: !!ledgerId && !!qty && parseFloat(qty) > 0, staleTime: 60000, refetchInterval: 60000 }
  );
  const livePrices: Record<string, number> = (summary as any)?.livePrices ?? {};
  const price = livePrices[coin];
  const qtyNum = parseFloat(qty);
  if (!qty || isNaN(qtyNum) || qtyNum <= 0) return null;
  return (
    <div className="px-4 py-3 border-t border-gray-100 bg-blue-50">
      <div className="flex items-center justify-between">
        <span className="text-xs text-blue-500">实时担保价值</span>
        {price ? (
          <span className="text-sm font-bold text-blue-700">
            ≈ ${(price * qtyNum).toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT
          </span>
        ) : (
          <span className="text-xs text-gray-400">获取中...</span>
        )}
      </div>
      {price && (
        <div className="text-xs text-blue-400 mt-0.5">
          {coin} 单价 ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })} × {qtyNum}
        </div>
      )}
    </div>
  );
}

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
  AAVE: '#B6509E',
  SUI: '#4DA2FF',
  ONDO: '#1A1A2E',
  ASTER: '#E84142',
  LDO: '#00C896',
  ENA: '#1A1A1A',
  ARKM: '#FF6B35',
  USDT: '#26A17B',
};

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const selected = value ? new Date(value + 'T00:00:00') : null;
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const handleDay = (d: number) => { const mm = String(viewMonth + 1).padStart(2, '0'); const dd = String(d).padStart(2, '0'); onChange(`${viewYear}-${mm}-${dd}`); };
  const isSelected = (d: number) => selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d;
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden" style={{ backgroundColor: '#FAFBFF' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <button onClick={prevMonth} className="p-1 rounded-lg hover:bg-gray-100">
          <CalLeft className="w-4 h-4 text-gray-400" />
        </button>
        <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>{viewYear}年 {monthNames[viewMonth]}</span>
        <button onClick={nextMonth} className="p-1 rounded-lg hover:bg-gray-100">
          <CalRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center py-1">
        {['日','一','二','三','四','五','六'].map(d => (
          <div key={d} className="text-[10px] text-gray-400 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center pb-2 px-1">
        {cells.map((d, i) => (
          <div key={i} className="py-0.5">
            {d !== null ? (
              <button
                onClick={() => handleDay(d)}
                className="w-7 h-7 mx-auto flex items-center justify-center rounded-full text-xs font-medium"
                style={isSelected(d) ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' } : { color: '#374151' }}
              >
                {d}
              </button>
            ) : <div className="w-7 h-7" />}
          </div>
        ))}
      </div>
      {value && (
        <div className="px-3 pb-2 text-center text-xs text-blue-500 font-medium">已选：{value}</div>
      )}
    </div>
  );
}

const emptyForm = {
  coin: 'BTC' as CoinType,
  amount: '',
  buyPrice: '',
  buyDate: '',
  buyQuantity: '',
  storageAccount: '',
  counterparty: '',
  interestBase: '',
  interestBaseCurrency: 'USDT' as 'USDT' | 'CNY',
  interestStartDate: '',
  interestRateAnnual: '',
  interestRateSign: '+' as '+' | '-',
  interestPaymentType: '',
  publicNote: '',
  adminNote: '',
  status: 'active',
  collateralCoin: 'BTC' as CoinType,
  collateralQty: '',
  financeType: '保本分成' as '保本分成' | '自负盈亏',
};

export default function FinanceManagement() {
  const [, params] = useRoute("/ledger/:id/finance-management");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;
  // 观察视角：从 URL ?viewAs=xxx 读取
  const urlSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const viewAsUserId = urlSearchParams.get('viewAs') ? parseInt(urlSearchParams.get('viewAs')!) : undefined;

  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [formData, setFormData] = useState({ ...emptyForm });

  // 用户选择
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userSearchText, setUserSearchText] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // 日期选择器
  const [showBuyDatePicker, setShowBuyDatePicker] = useState(false);
  const [showInterestDatePicker, setShowInterestDatePicker] = useState(false);

  // 结息记录
  const [showPaymentPanel, setShowPaymentPanel] = useState<number | null>(null);
  const [paymentForm, setPaymentForm] = useState({ amount: '', payDate: new Date().toISOString().slice(0, 10), note: '' });
  const [showPaymentDatePicker, setShowPaymentDatePicker] = useState(false);

  // 查询
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.ledger.financeGetOrders.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId }
  );
  const orders = Array.isArray((ordersData as any)?.orders) ? (ordersData as any).orders : (Array.isArray(ordersData) ? ordersData : []);
  const { data: members } = trpc.ledger.getMembers.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const orderIds = orders.map((o: any) => o.id).filter(Boolean);
  const { data: interestPaymentSummary } = trpc.ledger.financeGetInterestPaymentSummary.useQuery(
    { ledgerId, orderIds },
    { enabled: !!ledgerId && orderIds.length > 0 }
  );

  const createMutation = trpc.ledger.financeCreateOrder.useMutation({
    onSuccess: () => { toast.success('订单已创建'); refetchOrders(); closeForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: () => { toast.success('订单已更新'); refetchOrders(); closeForm(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.ledger.financeDeleteOrder.useMutation({
    onSuccess: () => { toast.success('订单已删除'); refetchOrders(); },
    onError: (e) => toast.error(e.message),
  });
  const addPaymentMutation = trpc.ledger.financeAddInterestPayment.useMutation({
    onSuccess: () => { toast.success('结息记录已添加'); refetchOrders(); setShowPaymentPanel(null); },
    onError: (e) => toast.error(e.message),
  });

  const realMembers = (members as any[] || []).filter((m: any) => !m.isAiClone);

  const filteredMembers = realMembers.filter((m: any) => {
    const name = (m.nickname || m.username || '').toLowerCase();
    return name.includes(userSearchText.toLowerCase());
  });

  const selectedUser = realMembers.find((m: any) => m.userId === selectedUserId);

  function closeForm() {
    setShowForm(false);
    setEditingOrder(null);
    setFormData({ ...emptyForm });
    setSelectedUserId(null);
    setUserSearchText('');
    setShowBuyDatePicker(false);
    setShowInterestDatePicker(false);
  }

  function openCreate() {
    setEditingOrder(null);
    setFormData({ ...emptyForm });
    setSelectedUserId(null);
    setUserSearchText('');
    setShowForm(true);
  }

  function openEdit(order: any) {
    const rateStr = String(order.interest_rate_annual || '');
    const isNeg = rateStr.startsWith('-');
    setFormData({
      coin: order.coin || 'BTC',
      amount: order.amount || '',
      buyPrice: order.buy_price || '',
      buyDate: order.buy_date || '',
      buyQuantity: order.buy_quantity || '',
      storageAccount: order.storage_account || '',
      counterparty: order.counterparty || '',
      interestBase: order.interest_base || '',
      interestBaseCurrency: (order.interest_base_currency || 'USDT') as 'USDT' | 'CNY',
      interestStartDate: order.interest_start_date || '',
      interestRateAnnual: isNeg ? rateStr.slice(1) : rateStr,
      interestRateSign: isNeg ? '-' : '+',
      interestPaymentType: order.interest_payment_type || '',
      publicNote: order.public_note || '',
      adminNote: order.admin_note || '',
      status: order.status || 'active',
      collateralCoin: (order.collateral_coin || 'BTC') as CoinType,
      collateralQty: order.collateral_qty ? String(parseFloat(order.collateral_qty)) : '',
      financeType: (order.finance_type || '保本分成') as '保本分成' | '自负盈亏',
    });
    setSelectedUserId(order.user_id || null);
    const u = realMembers.find((m: any) => m.userId === order.user_id);
    setUserSearchText(u ? (u.nickname || u.username || '') : '');
    setEditingOrder(order);
    setShowForm(true);
  }

  function handleSubmit() {
    if (!selectedUserId) { toast.error('请先选择要为哪位用户添加订单'); return; }
    if (!formData.coin) { toast.error('请选择币种'); return; }
    if (!formData.amount) { toast.error('请填写融资金额'); return; }
    const rateVal = formData.interestRateAnnual
      ? (formData.interestRateSign === '-' ? '-' : '') + formData.interestRateAnnual
      : '';
    if (editingOrder) {
      updateMutation.mutate({
        id: editingOrder.id,
        ledgerId,
        userId: selectedUserId,
        coin: formData.coin,
        amount: formData.amount,
        buyPrice: formData.buyPrice,
        buyDate: formData.buyDate,
        buyQuantity: formData.buyQuantity,
        storageAccount: formData.storageAccount,
        counterparty: formData.counterparty,
        interestBase: formData.interestBase,
        interestBaseCurrency: formData.interestBaseCurrency,
        interestStartDate: formData.interestStartDate,
        interestRateAnnual: rateVal,
        interestPaymentType: formData.interestPaymentType,
        publicNote: formData.publicNote,
        adminNote: formData.adminNote,
        status: formData.status,
        collateralCoin: formData.collateralCoin || undefined,
        collateralQty: formData.collateralQty || undefined,
        financeType: formData.financeType,
      });
    } else {
      createMutation.mutate({
        ledgerId,
        userId: selectedUserId,
        coin: formData.coin,
        amount: formData.amount,
        buyPrice: formData.buyPrice,
        buyDate: formData.buyDate,
        buyQuantity: formData.buyQuantity,
        storageAccount: formData.storageAccount,
        counterparty: formData.counterparty,
        interestBase: formData.interestBase,
        interestBaseCurrency: formData.interestBaseCurrency,
        interestStartDate: formData.interestStartDate,
        interestRateAnnual: rateVal,
        interestPaymentType: formData.interestPaymentType,
        publicNote: formData.publicNote,
        adminNote: formData.adminNote,
        collateralCoin: formData.collateralCoin || undefined,
        collateralQty: formData.collateralQty || undefined,
        financeType: formData.financeType,
      });
    }
  }

  function handleAddPayment(orderId: number) {
    if (!paymentForm.amount) { toast.error('请填写结息金额'); return; }
    addPaymentMutation.mutate({
      orderId,
      ledgerId,
      amount: parseFloat(paymentForm.amount),
      paymentDate: paymentForm.payDate,
      note: paymentForm.note,
    });
  }

  // 展开结息记录时，按orderId单独查询
  const { data: openedPayments } = trpc.ledger.financeGetInterestPayments.useQuery(
    { ledgerId, orderId: showPaymentPanel! },
    { enabled: !!showPaymentPanel && !!ledgerId }
  );
  const openedPaymentList = Array.isArray(openedPayments) ? openedPayments : [];

  const getPaymentLabel = (val: string) => INTEREST_PAYMENT_OPTIONS.find(o => o.value === val)?.label || val;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F0F4FF' }}>
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)} className="p-1 -ml-2">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-lg font-semibold text-white">融资付息订单管理</h1>
      </div>

      <div className="px-4 py-4">
        <div className="mb-4">
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-medium shadow-md"
            style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
          >
            <Plus className="w-4 h-4" />
            添加融资订单
          </button>
        </div>

        <div>
          <h2 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
            融资订单列表 {orders.length > 0 ? `· ${orders.length} 笔` : ''}
          </h2>
          {ordersLoading ? (
            <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl shadow-sm">
              <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <div className="text-gray-400 text-sm">暂无融资订单</div>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order: any) => {
                const totalPaid = (interestPaymentSummary as any)?.[order.id] ?? 0;
                const rateStr = String(order.interest_rate_annual || '');
                const isNegRate = rateStr.startsWith('-');
                const rateAbs = isNegRate ? rateStr.slice(1) : rateStr;
                const rateColor = isNegRate ? '#EF4444' : '#1A56DB';
                const rateSign = isNegRate ? '-' : '+';
                const memberName = realMembers.find((m: any) => m.userId === order.user_id);
                const displayName = memberName ? (memberName.nickname || memberName.username || `用户${order.user_id}`) : `用户${order.user_id}`;
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden relative"
                    style={{ border: '1px solid #E8EDFF' }}
                  >
                    {String(order.admin_note || '').includes('[已卖出]') && (
                      <div
                        className="absolute bottom-4 left-4 pointer-events-none select-none"
                        style={{ transform: 'rotate(-30deg)', zIndex: 10 }}
                      >
                        <div
                          style={{
                            border: '2px solid rgba(220,38,38,0.5)',
                            color: 'rgba(220,38,38,0.5)',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            letterSpacing: '3px',
                            lineHeight: '1.4',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          已卖出
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: COIN_COLORS[order.coin as CoinType] || '#999' }}
                        />
                        <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>
                          {order.coin} · {order.amount} USDT
                        </span>
                        <span className="text-xs text-gray-400">#{order.order_no}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-1">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={
                              order.status === 'active'
                                ? { backgroundColor: '#EEF4FF', color: '#1A56DB' }
                                : order.status === 'settled'
                                ? { backgroundColor: '#F0FDF4', color: '#16A34A' }
                                : { backgroundColor: '#F9FAFB', color: '#9CA3AF' }
                            }
                          >
                            {STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status}
                          </span>
                        </div>
                        <button
                          title={String(order.admin_note || '').includes('[已卖出]') ? '取消已卖出标记' : '标记已卖出'}
                          onClick={() => {
                            const note = String(order.admin_note || '');
                            const isSold = note.includes('[已卖出]');
                            const newNote = isSold
                              ? note.replace('[已卖出]', '').trim()
                              : (note ? note + ' [已卖出]' : '[已卖出]');
                            updateMutation.mutate({ id: order.id, ledgerId, adminNote: newNote });
                          }}
                          className="p-1.5 rounded-lg hover:bg-orange-50"
                        >
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: String(order.admin_note || '').includes('[已卖出]') ? '#DC2626' : '#9CA3AF',
                            letterSpacing: '0px',
                            lineHeight: 1,
                          }}>卖</span>
                        </button>
                        <button
                          onClick={() => openEdit(order)}
                          className="p-1.5 rounded-lg hover:bg-blue-50"
                        >
                          <Pencil className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                        <button
                          onClick={() => { if (confirm('确认删除此订单？')) deleteMutation.mutate({ id: order.id, ledgerId }); }}
                          className="p-1.5 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-xs text-gray-400">归属用户：</span>
                        <span className="text-xs font-medium" style={{ color: '#1A2340' }}>{displayName}</span>

                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        {order.buy_price && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">买入价</span>
                            <span className="font-medium" style={{ color: '#1A2340' }}>${parseFloat(order.buy_price).toLocaleString()}</span>
                          </div>
                        )}
                        {order.buy_quantity && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">持币量</span>
                            <span className="font-medium" style={{ color: '#1A2340' }}>{formatCoinQty(order.buy_quantity, order.coin)} {order.coin}</span>
                          </div>
                        )}
                        {order.buy_date && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">买入日</span>
                            <span className="font-medium" style={{ color: '#1A2340' }}>{order.buy_date}</span>
                          </div>
                        )}
                        {order.storage_account && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">存放账号</span>
                            <span className="font-medium truncate" style={{ color: '#1A2340' }}>{order.storage_account}</span>
                          </div>
                        )}
                        {rateAbs && (
                          <div className="flex items-center gap-1 col-span-2">
                            <span className="text-gray-400">年化利率</span>
                            <span className="font-semibold" style={{ color: rateColor }}>{rateSign}{rateAbs}%</span>
                            {order.interest_payment_type && (
                              <span className="text-gray-400 ml-1">· {getPaymentLabel(order.interest_payment_type)}</span>
                            )}
                          </div>
                        )}
                        {order.interest_base && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">计息基数</span>
                            <span className="font-medium" style={{ color: '#1A2340' }}>
                              {order.interest_base_currency === 'CNY'
                                ? `人民币 ${parseFloat(order.interest_base).toLocaleString()} 元`
                                : `${parseFloat(order.interest_base).toLocaleString()} USDT`}
                            </span>
                          </div>
                        )}
                        {order.interest_start_date && (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">计息开始</span>
                            <span className="font-medium" style={{ color: '#1A2340' }}>{order.interest_start_date}</span>
                          </div>
                        )}
                      </div>

                      {order.collateral_coin && order.collateral_qty && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">担保利息</span>
                            <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>
                              {parseFloat(order.collateral_qty)} {order.collateral_coin}
                            </span>
                          </div>
                          <CollateralValueDisplay coin={order.collateral_coin} qty={String(parseFloat(order.collateral_qty))} ledgerId={ledgerId} />
                        </div>
                      )}

                      {order.public_note && (
                        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                          备注：{order.public_note}
                        </div>
                      )}

                      <div className="mt-3 pt-3 border-t border-blue-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium" style={{ color: '#1A2340' }}>
                            已结利息：<span style={{ color: '#16A34A' }}>{totalPaid.toFixed(2)} USDT</span>
                          </span>
                          <button
                            onClick={() => { setShowPaymentPanel(showPaymentPanel === order.id ? null : order.id); setPaymentForm({ amount: '', payDate: new Date().toISOString().slice(0, 10), note: '' }); }}
                            className="text-xs px-3 py-1 rounded-full font-medium"
                            style={{ backgroundColor: '#EEF4FF', color: '#1A56DB' }}
                          >
                            {showPaymentPanel === order.id ? '收起' : '+ 记录结息'}
                          </button>
                        </div>

                        {showPaymentPanel === order.id && (
                          <div className="bg-blue-50 rounded-xl p-3 mb-3 space-y-2">
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">结息金额 (USDT)</label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={paymentForm.amount}
                                  onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                  placeholder="如：500"
                                  style={{ display: 'block', boxSizing: 'border-box' }}
                                />
                              </div>
                              <div className="flex-1">
                                <label className="block text-xs text-gray-500 mb-1">结息日期</label>
                                <div className="relative">
                                  <button
                                    onClick={() => setShowPaymentDatePicker(v => !v)}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-left focus:outline-none"
                                    style={{ backgroundColor: '#fff', color: paymentForm.payDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                                  >
                                    {paymentForm.payDate || '选择日期'}
                                  </button>
                                  {showPaymentDatePicker && (
                                    <div className="absolute top-full left-0 z-50 mt-1 bg-white rounded-xl shadow-lg" style={{ minWidth: 260 }}>
                                      <DatePicker value={paymentForm.payDate} onChange={v => { setPaymentForm(f => ({ ...f, payDate: v })); setShowPaymentDatePicker(false); }} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">备注（可选）</label>
                              <input
                                type="text"
                                value={paymentForm.note}
                                onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="结息说明"
                                style={{ display: 'block', boxSizing: 'border-box' }}
                              />
                            </div>
                            <button
                              onClick={() => handleAddPayment(order.id)}
                              disabled={addPaymentMutation.isPending}
                              className="w-full py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
                              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                            >
                              {addPaymentMutation.isPending ? '提交中...' : '确认记录'}
                            </button>
                          </div>
                        )}

                        {showPaymentPanel === order.id && openedPaymentList.length > 0 && (
                          <div className="space-y-1.5">
                            {openedPaymentList.map((p: any) => (
                              <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                                <div>
                                  <span className="font-medium" style={{ color: '#16A34A' }}>+{parseFloat(p.amount).toFixed(2)} USDT</span>
                                  {p.note && <span className="text-gray-400 ml-2">{p.note}</span>}
                                </div>
                                <span className="text-gray-400">{p.payment_date}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl">
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>
                {editingOrder ? '编辑融资订单' : '添加融资订单'}
              </h3>
              <button
                onClick={closeForm}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-5 overflow-y-auto overflow-x-hidden flex-1">

              {/* 选择用户 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  {editingOrder ? '订单归属用户' : '为哪位用户添加'} <span className="text-red-400 ml-0.5">*</span>
                </label>
                <div className="relative">
                  {selectedUser ? (
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-blue-300 bg-blue-50 cursor-pointer"
                      onClick={() => { setShowUserDropdown(true); setUserSearchText(''); }}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                      >
                        {(selectedUser.nickname || selectedUser.username || '?')[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium flex-1" style={{ color: '#1A2340' }}>
                        {selectedUser.nickname || selectedUser.username}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedUserId(null); setUserSearchText(''); }}
                        className="text-gray-400 hover:text-gray-600 text-base leading-none px-1"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={userSearchText}
                      onChange={e => { setUserSearchText(e.target.value); setShowUserDropdown(true); }}
                      onFocus={() => setShowUserDropdown(true)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="搜索或选择用户..."
                      style={{ display: 'block', boxSizing: 'border-box' }}
                    />
                  )}
                  {showUserDropdown && !selectedUser && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowUserDropdown(false)}
                      />
                      <div
                        className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
                        style={{ maxHeight: 200, overflowY: 'auto' }}
                      >
                        {filteredMembers.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-400 text-center">无匹配用户</div>
                        ) : filteredMembers.map((m: any) => (
                          <button
                            key={m.userId}
                            onClick={() => { setSelectedUserId(m.userId); setUserSearchText(m.nickname || m.username || ''); setShowUserDropdown(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left"
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                            >
                              {(m.nickname || m.username || '?')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: '#1A2340' }}>
                                {m.nickname || m.username}
                              </div>
                              <div className="text-xs text-gray-400">{m.role}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 对手方 */}
              {/* 币种 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">币种 <span className="text-red-400 ml-0.5">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {COIN_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setFormData(d => ({ ...d, coin: c }))}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                      style={
                        formData.coin === c
                          ? { backgroundColor: COIN_COLORS[c], color: '#fff' }
                          : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* 融资金额 / 买入价格 / 买入数量 三字段联动 */}
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-4 pt-3 pb-1">
                  <span className="text-xs text-gray-400">输入任意两个，第三个自动计算 · 融资金额 = 买入价格 × 币数</span>
                </div>
                {/* 融资金额 */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">融资金额 (USDT)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.amount}
                    onChange={e => setFormData(d => ({ ...d, amount: e.target.value }))}
                    onBlur={e => {
                      const amount = e.target.value;
                      setFormData(d => {
                        const price = parseFloat(d.buyPrice);
                        const qty = parseFloat(d.buyQuantity);
                        const amt = parseFloat(amount);
                        if (!amount || isNaN(amt) || amt <= 0) return d;
                        // 如果买入价已有，自动计算币数
                        if (!isNaN(price) && price > 0 && !d.buyQuantity) {
                          const calcQty = amt / price;
                          return { ...d, buyQuantity: INTEGER_COINS.has(d.coin) ? String(Math.round(calcQty)) : parseFloat(calcQty.toFixed(6)).toString() };
                        }
                        // 如果币数已有，自动计算买入价
                        if (!isNaN(qty) && qty > 0 && !d.buyPrice) {
                          return { ...d, buyPrice: (amt / qty).toFixed(2) };
                        }
                        return d;
                      });
                    }}
                    className="w-full bg-transparent text-base focus:outline-none"
                    placeholder="如：100000"
                  />
                </div>
                {/* 买入价格 */}
                <div className="px-4 py-3 border-b border-gray-100">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">买入价格 (USD/枚)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.buyPrice}
                    onChange={e => setFormData(d => ({ ...d, buyPrice: e.target.value }))}
                    onBlur={e => {
                      const price = e.target.value;
                      setFormData(d => {
                        const qty = parseFloat(d.buyQuantity);
                        const amt = parseFloat(d.amount);
                        const p = parseFloat(price);
                        if (!price || isNaN(p) || p <= 0) return d;
                        // 如果币数已有，自动计算融资金额
                        if (!isNaN(qty) && qty > 0 && !d.amount) {
                          return { ...d, amount: (p * qty).toFixed(2) };
                        }
                        // 如果融资金额已有，自动计算币数
                        if (!isNaN(amt) && amt > 0 && !d.buyQuantity) {
                          const calcQty = amt / p;
                          return { ...d, buyQuantity: INTEGER_COINS.has(d.coin) ? String(Math.round(calcQty)) : parseFloat(calcQty.toFixed(6)).toString() };
                        }
                        return d;
                      });
                    }}
                    className="w-full bg-transparent text-base focus:outline-none"
                    placeholder="如：95000"
                    step="any"
                  />
                </div>

                {/* 币数 */}
                <div className="px-4 py-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">币数 ({formData.coin})</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.buyQuantity}
                    onChange={e => setFormData(d => ({ ...d, buyQuantity: e.target.value }))}
                    onBlur={e => {
                      const qty = e.target.value;
                      setFormData(d => {
                        const price = parseFloat(d.buyPrice);
                        const amt = parseFloat(d.amount);
                        const q = parseFloat(qty);
                        if (!qty || isNaN(q) || q <= 0) return d;
                        // 如果买入价已有，自动计算融资金额
                        if (!isNaN(price) && price > 0 && !d.amount) {
                          return { ...d, amount: (price * q).toFixed(2) };
                        }
                        // 如果融资金额已有，自动计算买入价（保留 6 位小数减少精度丢失）
                        if (!isNaN(amt) && amt > 0 && !d.buyPrice) {
                          return { ...d, buyPrice: (amt / q).toFixed(6) };
                        }
                        return d;
                      });
                    }}
                    className="w-full bg-transparent text-base focus:outline-none"
                    placeholder="如：1.05"
                  />
                </div>
              </div>

              {/* 买入日期 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">买入日期</label>
                <button
                  onClick={() => setShowBuyDatePicker(v => !v)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-left focus:outline-none"
                  style={{ backgroundColor: '#fff', color: formData.buyDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                >
                  {formData.buyDate || '点击选择买入日期'}
                </button>
                {showBuyDatePicker && (
                  <div className="mt-2">
                    <DatePicker value={formData.buyDate} onChange={v => { setFormData(d => ({ ...d, buyDate: v })); setShowBuyDatePicker(false); }} />
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

              {/* 融资类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">融资类型</label>
                <div className="flex gap-3">
                  {(['保本分成', '自负盈亏'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFormData(d => ({ ...d, financeType: type }))}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        formData.financeType === type
                          ? type === '保本分成'
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-white border-gray-200 text-gray-500'
                      }`}
                    >
                      {type === '保本分成' ? '保本分成（50%）' : '自负盈亏（100%）'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 担保利息 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">担保利息</label>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  {/* 币种选择 */}
                  <div className="px-4 pt-3 pb-2">
                    <span className="text-xs text-gray-400 block mb-2">担保币种</span>
                    <div className="flex flex-wrap gap-1.5">
                      {COIN_OPTIONS.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setFormData(d => ({ ...d, collateralCoin: c }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            formData.collateralCoin === c
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >{c}</button>
                      ))}
                    </div>
                  </div>
                  {/* 数量输入 */}
                  <div className="px-4 py-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400 block mb-1.5">担保数量 ({formData.collateralCoin})</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={formData.collateralQty}
                      onChange={e => setFormData(d => ({ ...d, collateralQty: e.target.value }))}
                      className="w-full bg-transparent text-base focus:outline-none"
                      placeholder="如：12"
                    />
                  </div>
                  {/* 实时担保价值显示 */}
                  <CollateralValueDisplay coin={formData.collateralCoin} qty={formData.collateralQty} ledgerId={ledgerId} />
                </div>
              </div>

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
                <div className="flex gap-2">
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
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder={formData.interestBaseCurrency === 'CNY' ? '如：800000' : '如：120000'}
                    style={{ display: 'block', boxSizing: 'border-box' }}
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
                    <DatePicker value={formData.interestStartDate} onChange={v => { setFormData(d => ({ ...d, interestStartDate: v })); setShowInterestDatePicker(false); }} />
                  </div>
                )}
              </div>

              {/* 约定年化利息 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">约定年化利息（%）</label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFormData(d => ({ ...d, interestRateSign: d.interestRateSign === '+' ? '-' : '+' }))}
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold flex-shrink-0 transition-all"
                    style={
                      formData.interestRateSign === '-'
                        ? { backgroundColor: '#FEE2E2', color: '#EF4444', border: '2px solid #EF4444' }
                        : { backgroundColor: '#DCFCE7', color: '#16A34A', border: '2px solid #16A34A' }
                    }
                  >
                    {formData.interestRateSign}
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.interestRateAnnual}
                    onChange={e => setFormData(d => ({ ...d, interestRateAnnual: e.target.value }))}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="如：8.5"
                    style={{ display: 'block', boxSizing: 'border-box' }}
                  />
                </div>
                <div
                  className="mt-1.5 text-xs"
                  style={{ color: formData.interestRateSign === '-' ? '#EF4444' : '#16A34A' }}
                >
                  {formData.interestRateSign === '-' ? '负值：用户需付出利息（融资成本）' : '正值：用户可收取利息（融资收益）'}
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

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">备注</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* 公开备注 */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  公开备注
                  <span className="ml-1.5 text-xs text-green-500 font-normal">对外可见</span>
                </label>
                <textarea
                  value={formData.publicNote}
                  onChange={e => setFormData(d => ({ ...d, publicNote: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  rows={2}
                  placeholder="填写对外可见的说明或备注"
                  style={{ display: 'block', boxSizing: 'border-box', resize: 'none' }}
                />
              </div>

              {/* 内部备注 */}
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
                  placeholder="内部管理备注"
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

            </div>

            <div className="sticky bottom-0 bg-white px-5 py-4 border-t border-gray-100">
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
