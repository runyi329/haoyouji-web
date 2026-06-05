import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronDown, Plus, Pencil, Trash2, User, TrendingUp, ChevronLeft as CalLeft, ChevronRight as CalRight, Users2, X } from "lucide-react";
import { toast } from "sonner";
import { PageTag } from "@/components/PageTag";

// 币种选项
const COIN_OPTIONS = ['BTC', 'ETH', 'SOL', 'USDT', 'CNY', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ', 'NFLX', 'ORCL', 'TSM', 'AMD', 'CL', 'NG'] as const;
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
  USDT: '#26A17B',
  CNY: '#DE2910',
  TSLA: '#CC0000',
  NVDA: '#76B900',
  AAPL: '#555555',
  MSFT: '#00A4EF',
  GOOGL: '#4285F4',
  META: '#0866FF',
  AMZN: '#FF9900',
  SPY: '#1A56DB',
  QQQ: '#7C3AED',
  NFLX: '#E50914',
  ORCL: '#F80000',
  TSM: '#0070C0',
  AMD: '#ED1C24',
  CL: '#8B4513',
  NG: '#4A90D9',
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

// ===== 订单公开备注组件 =====
interface NoteItem { text: string; time: string; userId?: number; userName?: string; userAvatar?: string; }
function parseNotes(raw: string): NoteItem[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p as NoteItem[]; } catch {}
  return [{ text: raw, time: '' }];
}
function formatNoteTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function NoteAvatar({ name, avatar }: { name?: string; avatar?: string }) {
  if (avatar) return <img src={avatar} alt={name || ''} className="w-5 h-5 rounded-full object-cover shrink-0" style={{ border: '1px solid #E0E7FF' }} />;
  if (!name) return <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: '#E5E7EB' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>;
  const initials = name.slice(0, 1).toUpperCase();
  const colors = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
  const color = colors[name.charCodeAt(0) % colors.length] || '#6366F1';
  return <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: color }}>{initials}</div>;
}
function FunderNoteRow({ orderId, ledgerId, initialNote, onSaved, currentUser, isAdmin, membersData }: { orderId: number; ledgerId: number; initialNote: string; onSaved: (note: string) => void; currentUser?: { id: number; name?: string; username?: string; avatar?: string }; isAdmin?: boolean; membersData?: any[] }) {
  const [notes, setNotes] = useState<NoteItem[]>(() => parseNotes(initialNote));
  const [expanded, setExpanded] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const updateNote = trpc.ledger.funderUpdatePublicNote.useMutation();
  const canEdit = (note: NoteItem) => isAdmin || (currentUser && note.userId === currentUser.id) || !note.userId;
  const saveNotes = async (newNotes: NoteItem[]) => {
    setSaving(true);
    try {
      const raw = JSON.stringify(newNotes);
      await updateNote.mutateAsync({ id: orderId, ledgerId, publicNote: raw });
      setNotes(newNotes);
      onSaved(raw);
    } finally { setSaving(false); }
  };
  const handleSaveEdit = async (idx: number) => {
    if (!editValue.trim()) return;
    await saveNotes(notes.map((n, i) => i === idx ? { ...n, text: editValue.trim(), time: new Date().toISOString() } : n));
    setEditingIdx(null);
  };
  const handleAddNote = () => {
    const newNotes = [...notes, { text: '', time: new Date().toISOString(), userId: currentUser?.id, userName: currentUser?.name || currentUser?.username, userAvatar: currentUser?.avatar || undefined }];
    setNotes(newNotes); setEditingIdx(newNotes.length - 1); setEditValue(''); setExpanded(true);
  };
  const handleSaveNew = async (idx: number) => {
    if (!editValue.trim()) { setNotes(notes.filter((_, i) => i !== idx)); setEditingIdx(null); return; }
    await saveNotes(notes.map((n, i) => i === idx ? { ...n, text: editValue.trim(), time: new Date().toISOString() } : n));
    setEditingIdx(null);
  };
  const handleDelete = async (idx: number) => {
    await saveNotes(notes.filter((_, i) => i !== idx));
  };
  return (
    <div className="px-3 py-2 text-xs mt-2 rounded-xl" style={{ backgroundColor: '#F8FBFF', border: '1px solid #DBEAFE' }} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-xs font-bold" style={{ color: '#6B7280' }}>公开备注</span>
          {notes.length > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}>{notes.length}</span>}
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      {expanded && (
        <div className="mt-1.5">
          {notes.length === 0 && <div style={{ color: '#C0C8D8' }} className="py-1">暂无备注</div>}
          {notes.map((note, idx) => (
            <div key={idx}>
              {idx > 0 && <div style={{ borderTop: '1px solid #E8EFFF' }} className="my-1" />}
              {editingIdx === idx ? (
                <div className="flex items-center gap-1 py-0.5">
                  <input autoFocus className="flex-1 text-xs border rounded px-1.5 py-0.5 outline-none" style={{ borderColor: '#C7D7FF', color: '#1A2340', minWidth: 0 }} value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { note.text ? handleSaveEdit(idx) : handleSaveNew(idx); } if (e.key === 'Escape') { setEditingIdx(null); if (!note.text) setNotes(notes.filter((_, i) => i !== idx)); } }} placeholder="输入备注..." maxLength={200} />
                  <button onClick={() => note.text ? handleSaveEdit(idx) : handleSaveNew(idx)} disabled={saving} className="shrink-0 text-xs px-2 py-0.5 rounded" style={{ background: '#3B82F6', color: '#fff' }}>{saving ? '...' : '保存'}</button>
                  <button onClick={() => { setEditingIdx(null); if (!note.text) setNotes(notes.filter((_, i) => i !== idx)); }} className="shrink-0 text-xs px-1.5 py-0.5 rounded" style={{ background: '#F3F4F6', color: '#6B7280' }}>取消</button>
                </div>
              ) : (
                <div className="py-0.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <NoteAvatar name={note.userName} avatar={note.userAvatar || (note.userId ? (membersData as any[])?.find((m: any) => m.userId === note.userId)?.avatar || undefined : undefined)} />
                    {note.userName && <span className="text-[10px] font-medium" style={{ color: '#6B7280' }}>{note.userName}</span>}
                    {note.time && <span className="text-[10px]" style={{ color: '#C0C8D8' }}>{formatNoteTime(note.time)}</span>}
                    {canEdit(note) && (
                      <div className="ml-auto flex items-center gap-1">
                        <button onClick={() => { setEditingIdx(idx); setEditValue(note.text); }} className="p-0.5" title="编辑">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onClick={() => handleDelete(idx)} className="p-0.5" title="删除">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="pl-6 break-all" style={{ color: '#4B5563' }}>{note.text}</div>
                </div>
              )}
            </div>
          ))}
          <div style={{ borderTop: notes.length > 0 ? '1px solid #E8EFFF' : 'none' }} className="mt-1 pt-1">
            <button type="button" onClick={handleAddNote} className="flex items-center gap-1" style={{ color: '#9CA3AF' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span style={{ fontSize: '11px' }}>添加备注</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
// ===== END FunderNoteRow =====

interface FunderManagementProps {
  ledgerIdProp?: number;
  hideHeader?: boolean;
}

export default function FunderManagement({ ledgerIdProp, hideHeader }: FunderManagementProps = {}) {
  const [, params] = useRoute("/ledger/:id/funder-management");
  const [, routeParams2] = useRoute("/ledger/:id/finance-unified");
  const [, setLocation] = useLocation();
  const ledgerId = ledgerIdProp || (params?.id ? parseInt(params.id) : (routeParams2?.id ? parseInt(routeParams2.id) : 0));
  const trpcUtils = trpc.useUtils();

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [userSearchText, setUserSearchText] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showInterestDatePicker, setShowInterestDatePicker] = useState(false);
  // 多视角订单参与方相关 state
  const [showParticipantsPanel, setShowParticipantsPanel] = useState<number | null>(null); // 当前展开参与方面板的订单id
  type ParticipantRole = 'funder' | 'borrower' | 'broker';
  type ParticipantItem = { userId: number; displayName: string; role: ParticipantRole; sortOrder: number };
  type LedgerMember = { userId: number; displayName: string; memberRole: string };
  const [participantsList, setParticipantsList] = useState<ParticipantItem[]>([]);
  const [ledgerMembers, setLedgerMembers] = useState<LedgerMember[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const ROLE_OPTIONS: { value: ParticipantRole; label: string; color: string; defaultRateLabel: string }[] = [
    { value: 'funder', label: '资金方', color: '#1A56DB', defaultRateLabel: '年化利率' },
    { value: 'borrower', label: '借款人', color: '#D97706', defaultRateLabel: '综合利率' },
    { value: 'broker', label: '中间人', color: '#059669', defaultRateLabel: '介绍费' },
  ];
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
    // 受邀订单佣金配置
    commissionRate: '',
    commissionBase: '',
    commissionStartDate: '',
    assetType: '' as '' | 'stock' | 'crypto',
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
    marginRate: true,
    profitShare: true,
    commissionShare: true,
    aiIcon: false,
    assetType: true,
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

  // 员工名字筛选
  const [employeeNameFilter, setEmployeeNameFilter] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // 担保价值（在 assetOrdersData 定义后使用）——放到这里是为了先定义类型，实际计算在下方的 derivedCollateral 中
  const { data: funderUsers, isLoading: usersLoading } = trpc.ledger.funderGetFunderUsers.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0 }
  );

  // 当前登录用户信息（用于备注权限控制）
  const { data: currentUser } = trpc.auth.me.useQuery();
  const { data: ledgerData } = trpc.ledger.getLedger.useQuery({ id: ledgerId }, { enabled: ledgerId > 0 });
  const isAdminUser = (ledgerData as any)?.userRole === 'owner' || (ledgerData as any)?.userRole === 'admin';

  const { data: assetOrdersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId, ...(selectedUserId ? { userId: selectedUserId } : {}) },
    { enabled: ledgerId > 0, staleTime: 10000, refetchInterval: 10000 }
  );
  // funderGetAssetOrders 返回 { orders, livePrices }，取 orders 数组
  const assetOrders = (assetOrdersData as any)?.orders ?? assetOrdersData ?? [];
  const formLivePrices: Record<string, number> = (assetOrdersData as any)?.livePrices ?? {};
  // 全量订单（不带 userId 过滤），专用于下拉框统计每个用户的订单数量
  const { data: allOrdersData } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0, staleTime: 30000 }
  );
  const allOrders: any[] = (allOrdersData as any)?.orders ?? allOrdersData ?? [];

  // 强制转成数字，避免 MySQL 返回字符串导致 tRPC z.number() 校验失败
  const editingOrderId: number | null = editingOrder?.id ? Number(editingOrder.id) : null;
  // 编辑面板专用：查询当前编辑订单的结息记录列表
  // enabled 只依赖 editingOrderId，不加 participantInfo 限制，确保管理员编辑任何订单都能查到
  const { data: editingOrderPayments, refetch: refetchEditingPayments } = trpc.ledger.funderGetInterestPayments.useQuery(
    { ledgerId, orderId: editingOrderId! },
    { enabled: !!editingOrderId && ledgerId > 0, staleTime: 0 }
  );
  // 直接从 editingOrderPayments 前端计算已结利息总额和最新币种
  // 受邀订单（participantInfo）的已结佣金不走此逻辑，显示为 0
  const previewPaidInterest: number = editingOrder?.participantInfo
    ? 0
    : (Array.isArray(editingOrderPayments) && (editingOrderPayments as any[]).length > 0
        ? (editingOrderPayments as any[]).reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0)
        : 0);
  const previewPaidInterestCurrency: string = editingOrder?.participantInfo
    ? 'U'
    : (Array.isArray(editingOrderPayments) && (editingOrderPayments as any[]).length > 0
        ? ((editingOrderPayments as any[])[0]?.currency || 'U')
        : 'U');
  // refetchAllPaidSummary 兼容旧引用（mutation onSuccess 中调用）
  const refetchAllPaidSummary = refetchEditingPayments;

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

  // 预览卡片实时待结佣金（受邀订单专用，每秒更新）
  const [previewCommission, setPreviewCommission] = useState<number>(0);
  useEffect(() => {
    const compute = () => {
      const base = parseFloat(formData.commissionBase || '0');
      const rate = parseFloat(formData.commissionRate || '0');
      if (!base || !rate || !formData.commissionStartDate) { setPreviewCommission(0); return; }
      const startTs = new Date(formData.commissionStartDate + 'T00:00:00').getTime();
      if (isNaN(startTs)) { setPreviewCommission(0); return; }
      const elapsedSeconds = Math.max(0, (Date.now() - startTs) / 1000);
      const perSecond = (base * rate / 100) / (365 * 24 * 3600);
      setPreviewCommission(perSecond * elapsedSeconds);
    };
    compute();
    const timer = setInterval(compute, 1000);
    return () => clearInterval(timer);
  }, [formData.commissionBase, formData.commissionRate, formData.commissionStartDate]);

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
      // 使 LedgerDetail 中的担保缺口数据同步更新
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.ledger.funderUpdateAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('更新成功');
      setShowForm(false);
      setEditingOrder(null);
      refetchOrders();
      // 使 LedgerDetail 中的担保缺口数据同步更新
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.ledger.funderDeleteAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('删除成功');
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  // 参与方相关
  const updateParticipantConfigMutation = trpc.ledger.funderUpdateParticipantConfig.useMutation({
    onSuccess: () => {
      toast.success('佣金配置已保存');
      setShowForm(false);
      setEditingOrder(null);
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const saveParticipantsMutation = trpc.ledger.funderSaveOrderParticipants.useMutation({
    onSuccess: async (_, variables) => {
      toast.success('参与方配置已保存');
      // 保存成功后重新加载参与方列表，刷新面板显示
      try {
        const result = await trpcUtils.ledger.funderGetOrderParticipants.fetch({ orderId: variables.orderId, ledgerId });
        const mapped = (result.participants || []).map((p: any) => ({
          userId: p.user_id,
          displayName: p.nickname || p.userName || p.username || `用户${p.user_id}`,
          role: p.role as ParticipantRole,
          sortOrder: p.sort_order || 0,
        }));
        setParticipantsList(mapped);
      } catch {}
    },
    onError: (err) => toast.error(err.message),
  });
  const [currentOrderAmount, setCurrentOrderAmount] = useState('');
  const handleOpenParticipants = async (orderId: number, orderInterestBase: string) => {
    if (showParticipantsPanel === orderId) {
      setShowParticipantsPanel(null);
      return;
    }
    setShowParticipantsPanel(orderId);
    setCurrentOrderAmount(orderInterestBase || '');
    setParticipantsLoading(true);
    try {
      const result = await trpcUtils.ledger.funderGetOrderParticipants.fetch({ orderId, ledgerId });
      const mapped = (result.participants || []).map((p: any) => ({
        userId: p.user_id,
        displayName: p.nickname || p.userName || p.username || `用户${p.user_id}`,
        role: p.role as ParticipantRole,
        sortOrder: p.sort_order || 0,
      }));
      setParticipantsList(mapped);
      const mappedMembers = (result.members || []).map((m: any) => ({
        userId: m.userId,
        displayName: m.nickname || m.userName || m.username || `用户${m.userId}`,
        memberRole: m.memberRole,
      }));
      setLedgerMembers(mappedMembers);
    } catch (e) {
      toast.error('加载参与方失败');
      setParticipantsList([]);
    } finally {
      setParticipantsLoading(false);
    }
  };
  const handleAddParticipant = (role: ParticipantRole) => {
    setParticipantsList(list => {
      const usedIds = list.map(p => p.userId);
      const firstAvail = ledgerMembers.find(m => !usedIds.includes(m.userId));
      return [...list, {
        userId: firstAvail?.userId ?? 0,
        displayName: firstAvail?.displayName ?? '',
        role,
        sortOrder: list.length,
      }];
    });
  };
  const handleSaveParticipants = (orderId: number) => {
    const valid = participantsList.filter(p => p.userId > 0);
    saveParticipantsMutation.mutate({
      orderId,
      ledgerId,
      participants: valid.map((p, i) => ({
        userId: p.userId,
        role: p.role,
        sortOrder: i,
      })),
    });
  };

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
      refetchEditingPayments();
      refetchAllPaidSummary();
    },
    onError: (err) => toast.error(err.message),
  });
  const updatePaymentMutation = trpc.ledger.funderUpdateInterestPayment.useMutation({
    onSuccess: () => {
      toast.success('结息记录已更新');
      setEditingPaymentId(null);
      setPaymentForm({ amount: '', currency: 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' });
      refetchPayments();
      refetchEditingPayments();
      refetchAllPaidSummary();
    },
    onError: (err) => toast.error(err.message),
  });
  const deletePaymentMutation = trpc.ledger.funderDeleteInterestPayment.useMutation({
    onSuccess: () => {
      toast.success('结息记录已删除');
      refetchPayments();
      refetchEditingPayments();
      refetchAllPaidSummary();
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
      originalAmount: '',
      commissionRate: '',
      commissionBase: '',
      commissionStartDate: '',
      assetType: '' as '' | 'stock' | 'crypto',
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
      interestBaseCurrency: (['CNY', 'RMB', 'cny', 'rmb', '人民币'].includes(order.interest_base_currency || '') ? 'CNY' : 'USDT') as 'USDT' | 'CNY',
      interestRateCurrency: (order.interest_rate_currency || 'USDT') as 'USDT' | 'CNY',
      interestStartDate: order.interest_start_date ? String(order.interest_start_date).slice(0, 10) : '',
      showProfitShare: order.show_profit_share !== 0 && order.show_profit_share !== false,
      commissionShare: order.commission_share || '',
      originalAmount: order.amount || '',
      commissionRate: order.participantInfo?.commissionRate ? String(order.participantInfo.commissionRate) : '',
      commissionBase: order.participantInfo?.commissionBase ? String(order.participantInfo.commissionBase) : '',
      commissionStartDate: order.participantInfo?.commissionStartDate ? String(order.participantInfo.commissionStartDate).slice(0, 10) : '',
      assetType: (order.asset_type || '') as '' | 'stock' | 'crypto',
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
    // 受邀订单：仅保存佣金配置
    if (editingOrder?.participantInfo) {
      const participantUserId = editingOrder.participantInfo.userId ?? editingOrder.participantInfo.user_id;
      if (!participantUserId) {
        toast.error('无法确定参与方用户ID');
        return;
      }
      updateParticipantConfigMutation.mutate({
        orderId: editingOrder.id,
        ledgerId,
        userId: participantUserId,
        commissionRate: formData.commissionRate || undefined,
        commissionBase: formData.commissionBase || undefined,
        commissionStartDate: formData.commissionStartDate || undefined,
      });
      return;
    }
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
      // 编辑模式：始终传 collateralAssets（空数组表示清空），新建模式：为空时传 undefined
      collateralAssets: editingOrder
        ? collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)))
        : collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty))).length > 0
          ? collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)))
          : undefined,
      // 提交前确保 displayConfig 所有値都是 boolean
      displayConfig: Object.fromEntries(
        Object.entries(displayConfig).filter(([, v]) => typeof v === 'boolean')
      ) as Record<string, boolean>,
      assetType: formData.assetType || undefined,
    };
    if (editingOrder) {
      updateMutation.mutate({ id: editingOrder.id, status: formData.status, ...payload });
    } else {
      createMutation.mutate({ userId: formData.userId, ...payload });
    }
  };

  const handleDelete = (orderId: number) => {
    setConfirmDeleteId(orderId);
  };
  const handleConfirmDelete = () => {
    if (confirmDeleteId === null) return;
    deleteMutation.mutate({ id: confirmDeleteId, ledgerId });
    setConfirmDeleteId(null);
  };

  const getPaymentLabel = (val: string) => INTEREST_PAYMENT_OPTIONS.find(o => o.value === val)?.label || val;

  return (
    <div className={hideHeader ? '' : 'min-h-screen'} style={{ backgroundColor: '#F0F4FF' }}>
      {!hideHeader && <PageTag code="P096" />}
      {/* 顶部导航 */}
      {!hideHeader && (
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1 -ml-2">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-lg font-semibold text-white">资方管理</h1>
      </div>
      )}

      <div className="px-4 py-4">
        {/* 用户选择下拉框 + 添加订单按钮（同一行） */}
        <div className="flex items-center gap-2 mb-4">
          {/* 下拉框 */}
          <div className="relative flex-1">
            <button
              onClick={() => { setShowUserDropdown(!showUserDropdown); setUserSearchText(''); }}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-full text-sm font-medium bg-white border border-gray-200 shadow-sm"
              style={{ color: '#374151' }}
            >
              <span>
                {selectedUserId === null
                  ? '全部资金方'
                  : (funderUsers as any[])?.find((u: any) => u.userId === selectedUserId)
                    ? ((funderUsers as any[]).find((u: any) => u.userId === selectedUserId)?.nickname ||
                       (funderUsers as any[]).find((u: any) => u.userId === selectedUserId)?.name ||
                       (funderUsers as any[]).find((u: any) => u.userId === selectedUserId)?.username)
                    : '选择资金方'}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400 ml-1 shrink-0" />
            </button>
            {showUserDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-2xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                {(funderUsers as any[])?.length > 10 && (
                  <div className="px-3 pt-2 pb-1">
                    <input
                      type="text"
                      value={userSearchText}
                      onChange={e => setUserSearchText(e.target.value)}
                      placeholder="搜索资金方..."
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none"
                      autoFocus
                    />
                  </div>
                )}
                <div className="max-h-52 overflow-y-auto">
                  <button
                    onClick={() => { setSelectedUserId(null); setShowUserDropdown(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
                    style={{ color: selectedUserId === null ? '#1A56DB' : '#374151', fontWeight: selectedUserId === null ? 600 : 400 }}
                  >全部资金方</button>
                  {(funderUsers as any[])?.filter((u: any) => {
                    if (!userSearchText) return true;
                    const name = u.nickname || u.name || u.username || '';
                    return name.includes(userSearchText);
                  }).map((u: any) => {
                    const userOrders = allOrders.filter((o: any) => o.userId === u.userId || o.user_id === u.userId);
                    const activeCount = userOrders.filter((o: any) => o.status === 'active').length;
                    const settledCount = userOrders.filter((o: any) => o.status === 'settled' || o.status === 'cancelled').length;
                    return (
                    <button
                      key={u.userId}
                      onClick={() => { setSelectedUserId(u.userId); setShowUserDropdown(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between"
                      style={{ color: selectedUserId === u.userId ? '#1A56DB' : '#374151', fontWeight: selectedUserId === u.userId ? 600 : 400 }}
                    >
                      <span>{u.nickname || u.name || u.username}</span>
                      <span className="text-xs ml-2 shrink-0" style={{ color: '#9CA3AF', fontWeight: 400 }}>
                        {activeCount > 0 && <span style={{ color: '#22C55E' }}>进行中 {activeCount}</span>}
                        {activeCount > 0 && settledCount > 0 && <span style={{ color: '#D1D5DB' }}> / </span>}
                        {settledCount > 0 && <span style={{ color: '#9CA3AF' }}>已结束 {settledCount}</span>}
                        {activeCount === 0 && settledCount === 0 && <span>暂无订单</span>}
                      </span>
                    </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* 添加订单按钮 */}
          <button
            onClick={() => selectedUserId ? handleOpenCreate(selectedUserId) : setShowUserDropdown(true)}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white text-sm font-medium shadow-md"
            style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
          >
            <Plus className="w-4 h-4" />
            添加订单
          </button>
        </div>

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
          ) : (() => {
            const filteredOrders = assetOrders as any[];
            return filteredOrders.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-2xl shadow-sm">
                <div className="text-gray-400 text-sm">暂无订单</div>
              </div>
            ) : (
            <div className="space-y-3">
              {filteredOrders.map((order: any) => {
                const statusLabel = STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status;
                const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
                const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';
                const isInvited = !!order.participantInfo;
                const isSettled = String(order.admin_note || '').includes('[已结清]');
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl overflow-hidden relative"
                    style={isInvited
                      ? { border: '1px solid #86EFAC', boxShadow: '0 1px 6px rgba(34,197,94,0.08)' }
                      : { border: '1px solid #E8EDFF', boxShadow: '0 1px 4px rgba(26,35,64,0.05)' }}
                  >
                    {isSettled && (
                      <div className="absolute bottom-4 left-4 pointer-events-none select-none" style={{ transform: 'rotate(-30deg)', zIndex: 10 }}>
                        <div style={{ border: '2px solid rgba(220,38,38,0.5)', color: 'rgba(220,38,38,0.5)', borderRadius: '4px', padding: '2px 8px', fontSize: '13px', fontWeight: 700, letterSpacing: '3px', lineHeight: '1.4', whiteSpace: 'nowrap' }}>已结清</div>
                      </div>
                    )}
                    {/* 卡片顶部：标签行 + 操作按钮 */}
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: isInvited ? '#F0FDF4' : '#FAFBFF' }}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: coinColor }}>
                          {order.coin}
                        </span>
                        {order.asset_type && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: order.asset_type === 'stock' ? '#FEF3C7' : '#EFF6FF', color: order.asset_type === 'stock' ? '#92400E' : '#1D4ED8' }}>
                            {order.asset_type === 'stock' ? '股票' : '数字币'}
                          </span>
                        )}
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
                          {statusLabel}
                        </span>
                        {isInvited && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>
                            受邀
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        {!isInvited && (
                          <button
                            onClick={() => handleOpenParticipants(order.id, order.interest_base || '')}
                            className="px-2 py-1 text-xs rounded-lg font-medium transition-colors"
                            style={{ backgroundColor: showParticipantsPanel === order.id ? '#059669' : '#ECFDF5', color: showParticipantsPanel === order.id ? '#fff' : '#059669' }}
                          >
                            参与方
                          </button>
                        )}
                        <button
                          onClick={() => { setShowPaymentPanel(showPaymentPanel === order.id ? null : order.id); setPaymentForm({ amount: '', currency: 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' }); }}
                          className="px-2 py-1 text-xs rounded-lg font-medium transition-colors"
                          style={{ backgroundColor: showPaymentPanel === order.id ? '#1A56DB' : '#EEF4FF', color: showPaymentPanel === order.id ? '#fff' : '#1A56DB' }}
                        >
                          {isInvited ? '结佣' : '结息'}
                        </button>
                        <button
                          title={isSettled ? '取消已结清标记' : '标记已结清'}
                          onClick={() => {
                            const note = String(order.admin_note || '');
                            const newNote = isSettled ? note.replace('[已结清]', '').trim() : (note ? note + ' [已结清]' : '[已结清]');
                            updateMutation.mutate({ id: order.id, ledgerId, adminNote: newNote });
                          }}
                          className="px-2 py-1 text-xs rounded-lg font-medium transition-colors"
                          style={{ backgroundColor: isSettled ? '#FEE2E2' : '#F3F4F6', color: isSettled ? '#DC2626' : '#9CA3AF' }}
                        >
                          结清
                        </button>
                        <button onClick={() => handleOpenEdit(order)} className="p-1.5 ml-1 text-gray-300 hover:text-blue-500 rounded-lg hover:bg-blue-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(order.id)} className="p-1.5 ml-2 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 卡片主体 */}
                    <div className="px-4 pt-3 pb-3">
                      {/* 核心金额 + 年化利率 */}
                      <div className="flex items-end justify-between mb-3">
                        <div>
                          <div className="text-xs text-gray-400 mb-0.5">{isInvited ? '计佣基数' : '计息基数'}</div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-bold" style={{ color: '#1A2340', letterSpacing: '-0.5px' }}>
                              {order.interest_base ? parseFloat(order.interest_base).toLocaleString() : parseFloat(order.amount).toLocaleString()}
                            </span>
                            <span className="text-xs text-gray-400">
                              {(['CNY', 'RMB', 'cny', 'rmb', '人民币'].includes(order.interest_base_currency || '')) ? '元' : 'USDT'}
                            </span>
                          </div>
                        </div>
                        {(order.interest_rate_annual || isInvited && order.participantInfo?.commissionRate) && (
                          <div className="text-right">
                            <div className="text-xs text-gray-400 mb-0.5">年化</div>
                            <div className="text-lg font-bold" style={{ color: isInvited ? '#059669' : '#1A56DB' }}>
                              {isInvited ? `${order.participantInfo.commissionRate}%` : `${order.interest_rate_annual}%`}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 详细字段：两列网格 */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                        {order.buy_price && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">买入价</span>
                            <span className="font-medium text-gray-700">{order.buy_price} U</span>
                          </div>
                        )}
                        {order.buy_quantity && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">持币量</span>
                            <span className="font-medium text-gray-700">{parseFloat(parseFloat(order.buy_quantity).toFixed(8)).toString()} {order.coin}</span>
                          </div>
                        )}
                        {order.buy_date && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">买入日</span>
                            <span className="font-medium text-gray-700">{order.buy_date}</span>
                          </div>
                        )}
                        {order.interest_payment_type && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">付息方式</span>
                            <span className="font-medium text-gray-700">{getPaymentLabel(order.interest_payment_type)}</span>
                          </div>
                        )}
                        {order.storage_account && (
                          <div className="flex items-center justify-between col-span-2">
                            <span className="text-gray-400">存放账号</span>
                            <span className="font-medium text-gray-700 truncate ml-2">{order.storage_account}</span>
                          </div>
                        )}
                        {(assetOrdersData as any)?.livePrices?.[order.coin] && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">今日币价</span>
                            <span className="font-medium text-gray-700">{(assetOrdersData as any).livePrices[order.coin].toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                          </div>
                        )}
                        {order.buy_date && (() => {
                          const elapsed = Date.now() - new Date(order.buy_date + 'T00:00:00').getTime();
                          if (elapsed <= 0) return null;
                          const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
                          const hours = Math.floor((elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                          return (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-400">持有时长</span>
                              <span className="font-medium text-gray-700">{days > 0 ? `${days}天 ${hours}h` : `${hours}小时`}</span>
                            </div>
                          );
                        })()}
                        {isInvited && order.participantInfo?.commissionBase && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">计佣基数</span>
                            <span className="font-medium" style={{ color: '#059669' }}>{parseFloat(order.participantInfo.commissionBase).toLocaleString()} USDT</span>
                          </div>
                        )}
                        {isInvited && order.participantInfo?.commissionStartDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">计佣日期</span>
                            <span className="font-medium" style={{ color: '#059669' }}>{String(order.participantInfo.commissionStartDate).slice(0, 10)}</span>
                          </div>
                        )}
                        {/* 担保货币 */}
                        {order.collateral_assets && (() => {
                          try {
                            const assets = JSON.parse(order.collateral_assets);
                            if (!Array.isArray(assets) || assets.length === 0) return null;
                            const valid = assets.filter((a: any) => a.coin && a.qty !== '');
                            if (valid.length === 0) return null;
                            return valid.map((a: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between">
                                <span className="text-gray-400">{valid.length > 1 ? `担保${idx + 1}` : '担保货币'}</span>
                                <span className="font-medium text-gray-700">{a.qty} {a.coin}</span>
                              </div>
                            ));
                          } catch { return null; }
                        })()}
                      </div>

                      {/* 已结利息/已结佣金 */}
                      {(order as any).paidTotal && parseFloat((order as any).paidTotal.amount) > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                          <span className="text-gray-400">{isInvited ? '已结佣金' : '已结利息'}</span>
                          <span className="font-semibold" style={{ color: '#16A34A' }}>
                            {parseFloat((order as any).paidTotal.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {(order as any).paidTotal.currency === 'CNY' ? '元' : 'U'}
                          </span>
                        </div>
                      )}

                      {order.admin_note && (
                        <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                          内部备注：{order.admin_note}
                        </div>
                      )}

                      {/* 公开备注区域 */}
                      <FunderNoteRow
                        orderId={order.id}
                        ledgerId={ledgerId}
                        initialNote={order.public_note || ''}
                        onSaved={(raw) => { order.public_note = raw; }}
                        currentUser={currentUser ? { id: (currentUser as any).id, name: (currentUser as any).name, username: (currentUser as any).username, avatar: (currentUser as any).avatar || (funderUsers as any[])?.find((u: any) => u.userId === (currentUser as any).id)?.avatar || undefined } : undefined}
                        isAdmin={isAdminUser}
                        membersData={funderUsers as any[]}
                      />

                      {/* 参与方配置面板 */}
                    {showParticipantsPanel === order.id && (
                      <div className="mt-3 pt-3 border-t border-green-100">
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-xs font-semibold text-green-700 flex items-center gap-1">
                            <Users2 className="w-3.5 h-3.5" />
                            多视角订单参与方
                          </div>
                          <div className="flex gap-1">
                            {ROLE_OPTIONS.map(r => (
                              <button
                                key={r.value}
                                onClick={() => handleAddParticipant(r.value)}
                                className="px-2 py-0.5 text-xs rounded-full font-medium border"
                                style={{ borderColor: r.color, color: r.color, backgroundColor: `${r.color}10` }}
                              >
                                +{r.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        {participantsLoading ? (
                          <div className="text-center py-3 text-xs text-gray-400">加载中...</div>
                        ) : participantsList.length === 0 ? (
                          <div className="text-center py-3 text-xs text-gray-400 bg-gray-50 rounded-xl">
                            暂无参与方配置，点击上方按钮添加
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {participantsList.map((p, idx) => {
                              const roleOpt = ROLE_OPTIONS.find(r => r.value === p.role)!;
                              return (
                                <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: roleOpt.color }}>
                                      {roleOpt.label}
                                    </span>
                                    <button
                                      onClick={() => setParticipantsList(list => list.filter((_, i) => i !== idx))}
                                      className="p-0.5 text-gray-300 hover:text-red-400"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {/* 成员选择下拉 */}
                                  <div>
                                    <div className="text-xs text-gray-400 mb-0.5">选择账本成员 *</div>
                                    <select
                                      value={p.userId}
                                      onChange={e => {
                                        const uid = Number(e.target.value);
                                        const member = ledgerMembers.find(m => m.userId === uid);
                                        setParticipantsList(list => list.map((item, i) => i === idx ? { ...item, userId: uid, displayName: member?.displayName || '' } : item));
                                      }}
                                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
                                    >
                                      <option value={0}>-- 请选择成员 --</option>
                                      {ledgerMembers.map(m => (
                                        <option key={m.userId} value={m.userId}>{m.displayName}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="text-xs text-gray-400 mt-1">配置（佣金率、计佣基数等）请在该成员的订单编辑页设置</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <button
                          onClick={() => handleSaveParticipants(order.id)}
                          disabled={saveParticipantsMutation.isPending}
                          className="mt-3 w-full py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}
                        >
                          {saveParticipantsMutation.isPending ? '保存中...' : '保存参与方配置'}
                        </button>
                        <div className="mt-2 text-xs text-gray-400 text-center">
                          💡 添加成员后，在该成员的订单编辑页配置佣金率等详细信息
                        </div>
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
                    </div>{/* end card body */}
                  </div>
                );
              })}
            </div>
            );
          })()}
        </div>
      </div>

      {/* 创建/编辑弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl max-h-[92vh] flex flex-col overflow-x-hidden" style={{ overscrollBehavior: 'contain' }}>
            <div className="flex-shrink-0 bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl" style={{ zIndex: 10 }}>
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>
                {editingOrder?.participantInfo ? '受邀订单配置' : editingOrder ? '编辑订单' : '添加订单'}
              </h3>
              <button
                onClick={() => { setShowForm(false); setEditingOrder(null); setShowDatePicker(false); }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-5" style={{ overscrollBehavior: 'contain' }}>
              {/* 受邀订单：只读提示 */}
              {editingOrder?.participantInfo && (
                <div className="rounded-xl px-4 py-3 flex items-start gap-2" style={{ backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                  <span className="text-green-600 mt-0.5">✓</span>
                  <div>
                    <div className="text-sm font-medium text-green-800">受邀订单</div>
                    <div className="text-xs text-green-600 mt-0.5">订单基础信息为只读，仅可配置佣金相关参数</div>
                  </div>
                </div>
              )}
              {/* 类型 */}
              {!editingOrder?.participantInfo && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">类型<span className="ml-1.5 text-xs text-gray-400 font-normal">可选，单选</span></label>
                  <div className="flex gap-2">
                    {([{ value: 'stock', label: '股票' }, { value: 'crypto', label: '数字币' }] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(d => ({ ...d, assetType: d.assetType === opt.value ? '' : opt.value }))}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={
                          formData.assetType === opt.value
                            ? { background: 'linear-gradient(135deg, #1A56DB, #3B82F6)', color: '#fff' }
                            : { backgroundColor: '#F3F4F6', color: '#6B7280' }
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 币种 */}
              <div style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
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
              <div style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
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
              <div style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
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
              <div style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
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
              <div style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
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
              <div style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
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

              {/* 受邀订单专属：佣金配置区 */}
              {editingOrder?.participantInfo && (
                <div className="rounded-2xl p-4 space-y-4" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                  <div className="text-sm font-semibold text-green-800 mb-1">佣金配置</div>
                  {/* 佣金率 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">佣金率（%/年）</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={formData.commissionRate ?? ''}
                        onChange={e => setFormData(d => ({ ...d, commissionRate: e.target.value }))}
                        className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-green-200"
                        placeholder="如：1"
                        style={{ display: 'block', boxSizing: 'border-box' }}
                      />
                      <span className="text-base font-medium text-gray-500 shrink-0">% / 年</span>
                    </div>
                  </div>
                  {/* 计佣基数 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      计佣基数（USDT）
                      <span className="text-xs text-gray-400 ml-1">默认=计息基数</span>
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={formData.commissionBase ?? ''}
                      onChange={e => setFormData(d => ({ ...d, commissionBase: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-green-200"
                      placeholder={formData.interestBase ? `默认：${formData.interestBase}` : '默认=计息基数'}
                      style={{ display: 'block', boxSizing: 'border-box' }}
                    />
                  </div>
                  {/* 计佣开始日期 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      计佣开始日期
                      <span className="text-xs text-gray-400 ml-1">默认=计息开始日</span>
                    </label>
                    <input
                      type="date"
                      value={formData.commissionStartDate ?? ''}
                      onChange={e => setFormData(d => ({ ...d, commissionStartDate: e.target.value }))}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-green-200"
                      style={{ display: 'block', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              )}

              {/* 计息开始日期 */}
              <div style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
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
              <div style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
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
              <div style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
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

              {/* 分隔线：担保货币 - 受邀订单隐藏 */}
              {!editingOrder?.participantInfo && <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">担保货币</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>}

              {/* 担保货币列表 - 受邀订单隐藏 */}
              {!editingOrder?.participantInfo && (
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
              )}

              {/* 分隔线：佣金分成 - 受邀订单隐藏 */}
              {!editingOrder?.participantInfo && <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">佣金分成</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>}

              {/* 佣金分成输入 - 受邀订单隐藏 */}
              {!editingOrder?.participantInfo && <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">佣金分成说明</label>
                <input
                  type="text"
                  value={formData.commissionShare}
                  onChange={e => setFormData(d => ({ ...d, commissionShare: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="例如：年化收益的 20%"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>}

              {/* 分隔线：备注 - 受邀订单隐藏 */}
              {!editingOrder?.participantInfo && <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 shrink-0">备注</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>}

              {/* 公开备注（资金方可见） - 受邀订单隐藏 */}
              {!editingOrder?.participantInfo && <div>
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
              </div>}

              {/* 内部备注（资金方不可见） - 受邀订单隐藏 */}
              {!editingOrder?.participantInfo && <div>
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
              </div>}

              {/* 状态（编辑时） - 受邀订单隐藏 */}
              {editingOrder && !editingOrder.participantInfo && (
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
                      { key: 'buyDate', label: '开仓时间' },
                      { key: 'todayPrice', label: '今日币价' },
                      // 当前价值已移至持有资产括号显示，不再单独作为开关
                      { key: 'holdDuration', label: '持有时长' },
                      { key: 'orderNo', label: '订单编号' },
                      { key: 'aiIcon', label: 'AI图标（持有资产右上角）' },
                      { key: 'assetType', label: '资产类型（股票/数字币）' },
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
                      { key: 'marginRate', label: '保证金率' },
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

              {/* 实时预览卡片 - 两栏大数字样式（与前端订单卡片一致） */}
              <div>
                <div className="text-xs font-medium text-gray-400 mb-2">实时预览</div>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E8EFFF', background: '#FFFFFF' }}>
                  {/* 顶部色条 */}
                  <div className="h-1" style={{ background: `linear-gradient(90deg, ${COIN_COLORS[formData.coin] || '#3B82F6'}, ${(COIN_COLORS[formData.coin] || '#3B82F6')}55)` }} />
                  {/* 两栏主体 */}
                  <div className="flex" style={{ minHeight: '100px' }}>
                    {/* 左栏：持有资产 */}
                    <div className="flex-1 p-3 pr-2">
                      <div className="h-4 flex items-center" style={{ color: '#3B82F6' }}>
                        <span className="text-xs font-medium">持有资产</span>
                      </div>
                      <div className="min-h-7 flex flex-col justify-center mt-0.5">
                        <div className="flex items-baseline gap-1 flex-wrap">
                          <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                            {formData.buyQuantity ? parseFloat(parseFloat(formData.buyQuantity).toFixed(6)).toString() : '—'}
                          </span>
                          <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{formData.coin}</span>
                        </div>
                        {formLivePrices[formData.coin] && formData.buyQuantity && (
                          <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>
                            ≈{(formLivePrices[formData.coin] * parseFloat(formData.buyQuantity)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 text-xs mt-1">
                        {displayConfig.buyPrice && formData.buyPrice && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">买入币价</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(formData.buyPrice).toLocaleString()} U</span>
                          </div>
                        )}
                        {displayConfig.buyValue && computedAmount && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">买入价值</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(computedAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                          </div>
                        )}
                        {displayConfig.interestBase && formData.interestBase && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">计息基数</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(formData.interestBase).toLocaleString(undefined, { maximumFractionDigits: 2 })} {formData.interestBaseCurrency === 'CNY' ? '元' : 'U'}</span>
                          </div>
                        )}
                        {displayConfig.todayPrice && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">当前币价</span>
                            <span className="font-medium" style={{ color: (() => { const lp = formLivePrices[formData.coin]; const bp = formData.buyPrice ? parseFloat(formData.buyPrice) : null; if (lp && bp) { return lp > bp ? '#DC2626' : lp < bp ? '#16A34A' : '#4B5563'; } return '#4B5563'; })() }}>
                              {formLivePrices[formData.coin] ? formLivePrices[formData.coin].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' U' : '获取中...'}
                            </span>
                          </div>
                        )}
                        {displayConfig.buyDate && formData.buyDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">开仓时间</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{formData.buyDate}</span>
                          </div>
                        )}
                        {displayConfig.holdDuration && formData.buyDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">持有时长</span>
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
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">订单编号</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{editingOrder.order_no}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 中间分隔线 */}
                    <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />
                    {/* 右栏：待结利息 */}
                    <div className="w-40 p-3 pl-2 flex flex-col">
                      {displayConfig.accruedInterest && formData.interestRateAnnual && formData.interestBase && formData.interestStartDate ? (
                        <div>
                          <div className="h-4 flex items-center" style={{ color: '#F59E0B' }}>
                            <span className="text-xs font-medium">待结利息（年化 {parseFloat(formData.interestRateAnnual).toFixed(0)}%）</span>
                          </div>
                          <div className="min-h-7 flex flex-col justify-center mt-0.5">
                            <div className="flex items-baseline gap-0.5 flex-wrap">
                              <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                                {(() => {
                                  const base = parseFloat(formData.interestBase);
                                  const rate = Math.abs(parseFloat(formData.interestRateAnnual)) / 100;
                                  const start = new Date(formData.interestStartDate + 'T00:00:00');
                                  const days = Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
                                  return (base * rate / 365 * days).toLocaleString(undefined, { maximumFractionDigits: 2 });
                                })()}
                              </span>
                              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{formData.interestBaseCurrency === 'CNY' ? '元' : 'USDT'}</span>
                            </div>
                          </div>
                          <div className="space-y-0.5 text-xs mt-1">
                            {displayConfig.paidInterest && previewPaidInterest > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 shrink-0">已结利息</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{previewPaidInterest.toLocaleString(undefined, { maximumFractionDigits: 2 })} {previewPaidInterestCurrency === 'CNY' ? '元' : 'U'}</span>
                              </div>
                            )}
                            {displayConfig.interestStartDate && formData.interestStartDate && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 shrink-0">计息日期</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>
                                  {formData.interestStartDate.replace(/^\d{4}-(\d{2})-(\d{2})$/, (_: string, m: string, d: string) => `${parseInt(m)}月${parseInt(d)}日`)}
                                </span>
                              </div>
                            )}
                            {displayConfig.collateralCoin && collateralAssets.filter(a => a.coin && a.qty !== '').length > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 shrink-0">担保货币</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>
                                  {collateralAssets.filter(a => a.coin && a.qty !== '').map(a => `${a.qty} ${a.coin}`).join(', ')}
                                </span>
                              </div>
                            )}
                            {displayConfig.collateralValue && computedCollateralValue !== null && collateralAssets.filter(a => a.coin && a.qty !== '').length > 0 && (
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400 shrink-0"></span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>≈ {computedCollateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400 shrink-0">担保价值</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{computedCollateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                                </div>
                              </div>
                            )}
                            {displayConfig.collateral && computedCollateralValue !== null && computedAmount && parseFloat(computedAmount) > 0 && (
                              <div className="flex items-center justify-between border-t pt-1" style={{ borderColor: '#E8EFFF' }}>
                                <span className="text-gray-400 shrink-0">担保缺口</span>
                                <span className="font-medium" style={{ color: (computedCollateralValue / parseFloat(computedAmount)) >= 1 ? '#16A34A' : '#DC2626' }}>
                                  {(computedCollateralValue / parseFloat(computedAmount)) >= 1 ? '超过100%' : `${(computedCollateralValue / parseFloat(computedAmount) * 100).toFixed(0)}%`}
                                </span>
                              </div>
                            )}
                            {displayConfig.marginRate && computedCollateralValue !== null && computedAmount && parseFloat(computedAmount) > 0 && (
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 shrink-0">保证金率</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>
                                  {(computedCollateralValue / parseFloat(computedAmount) * 100).toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <span className="text-gray-300 text-xs">填写利息信息后显示</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* 收益分成区 */}
                  {displayConfig.profitShare && formData.showProfitShare && (
                    <div className="border-t px-3 py-2" style={{ borderColor: '#E8EFFF' }}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">收益分成</span>
                        <span className="font-medium" style={{ color: '#3B82F6' }}>已开启</span>
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

      {/* 删除二次确认弹窗 */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-base font-semibold text-gray-800 mb-1">确认删除订单？</div>
              <div className="text-sm text-gray-400">删除后无法恢复，请谨慎操作</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-3 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#F3F4F6', color: '#374151' }}
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#EF4444' }}
              >
                {deleteMutation.isPending ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
