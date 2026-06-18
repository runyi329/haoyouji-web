import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronDown, Plus, Pencil, Trash2, User, TrendingUp, ChevronLeft as CalLeft, ChevronRight as CalRight, Users2, X } from "lucide-react";
import { toast } from "sonner";
import { PageTag } from "@/components/PageTag";

// 币种选项
const COIN_OPTIONS = ['BTC', 'ETH', 'SOL', 'USDT', 'CNY', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ', 'NFLX', 'ORCL', 'TSM', 'AMD', 'CL', 'NG', 'CRCL'] as const;
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
  CRCL: '#1E88D6',
};

// 获取北京时间（UTC+8）今天，返回 YYYY-MM-DD
function getBeijingToday(): string {
  const now = new Date();
  // 当前 UTC 毫秒 + 8小时，取 UTC 各部件即为北京时间
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = beijing.getUTCFullYear();
  const m = String(beijing.getUTCMonth() + 1).padStart(2, '0');
  const d = String(beijing.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 简单日历选择器组件
function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // 初始视图月份：优先跟随已选值，否则定位北京时间当月
  const initBase = value ? value : getBeijingToday();
  const [initY, initM] = initBase.split('-').map(Number);
  const [viewYear, setViewYear] = useState(initY);
  const [viewMonth, setViewMonth] = useState((initM || 1) - 1); // 0-indexed

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
  const canEdit = (note: NoteItem) => isAdmin || (currentUser && note.userId && note.userId === currentUser.id);
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
    const newNotes = [...notes, { text: '', time: new Date().toISOString(), userId: currentUser?.id, userName: currentUser?.username || currentUser?.name, userAvatar: currentUser?.avatar || undefined }];
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
                <div className="flex gap-2 py-0.5">
                  {/* 左侧头像，占两行高度 */}
                  <div className="shrink-0 self-start mt-0.5">
                    {(() => {
                      const avatarUrl = note.userAvatar || (note.userId ? (membersData as any[])?.find((m: any) => m.userId === note.userId)?.avatar : null);
                      // 旧备注（无 userId）：使用 owner 头像
                      const ownerMember = !note.userId ? (membersData as any[])?.find((m: any) => m.role === 'owner') : null;
                      const fallbackAvatar = ownerMember?.avatar || currentUser?.avatar;
                      const finalAvatar = avatarUrl || (!note.userId ? fallbackAvatar : null);
                      if (finalAvatar) return <img src={finalAvatar} alt="" className="w-7 h-7 rounded-full object-cover" style={{ border: '1px solid #E0E7FF' }} />;
                      const name = note.userName || (!note.userId ? (ownerMember?.username || ownerMember?.nickname || currentUser?.username || currentUser?.name || '') : '');
                      if (!name) return <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E5E7EB' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>;
                      const initials = name.slice(0, 1).toUpperCase();
                      const colors = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
                      const color = colors[name.charCodeAt(0) % colors.length] || '#6366F1';
                      return <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: color }}>{initials}</div>;
                    })()}
                  </div>
                  {/* 右侧内容 */}
                  <div className="flex-1 min-w-0">
                    {/* 第一行：日期 + 编辑/删除按钮 */}
                    <div className="flex items-center gap-1">
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
                    {/* 第二行：备注内容 */}
                    <div className="text-xs break-all mt-0.5" style={{ color: '#4B5563' }}>{note.text}</div>
                  </div>
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

// ===== Helper: formatCoinQty =====
const INTEGER_COINS_FUNDER = new Set(['SUI', 'ONDO', 'LDO', 'ENA', 'ARKM', 'AAVE']);
function formatCoinQtyFunder(qty: string | number | null | undefined, coin: string): string {
  if (qty === null || qty === undefined || qty === '') return '0';
  const num = typeof qty === 'string' ? parseFloat(qty) : qty;
  if (num === 0) return '0';
  if (isNaN(num)) return String(qty);
  if (INTEGER_COINS_FUNDER.has(coin)) return Math.round(num).toLocaleString('en-US');
  return parseFloat(num.toFixed(6)).toString();
}

// ===== Helper: useAccruedInterest =====
function useAccruedInterestFunder(interestBase: string | null, interestRateAnnual: string | null, interestStartDate: string | null, settledAt?: string | null) {
  const [accrued, setAccrued] = useState<number>(0);
  const computeAccrued = useCallback(() => {
    const base = parseFloat(interestBase || '0');
    const rate = Math.abs(parseFloat(interestRateAnnual || '0'));
    if (!base || !rate || !interestStartDate) return 0;
    const startTs = new Date(interestStartDate + 'T00:00:00').getTime();
    if (isNaN(startTs)) return 0;
    const endTs = settledAt ? new Date(settledAt).getTime() : Date.now();
    const elapsedSeconds = Math.max(0, (endTs - startTs) / 1000);
    const perSecond = (base * rate / 100) / (365 * 24 * 3600);
    return perSecond * elapsedSeconds;
  }, [interestBase, interestRateAnnual, interestStartDate, settledAt]);
  useEffect(() => {
    setAccrued(computeAccrued());
    if (settledAt) return;
    const timer = setInterval(() => setAccrued(computeAccrued()), 1000);
    return () => clearInterval(timer);
  }, [computeAccrued, settledAt]);
  return accrued;
}

// ===== FunderOrderCard 子组件（左右两栏布局，与 FinanceOrderCard 一致）=====
interface FunderOrderCardProps {
  order: any;
  livePrices: Record<string, number>;
  priceDirection: Record<string, 'up' | 'down' | 'same'>;
  currentUser: any;
  isAdmin: boolean;
  membersData: any[];
  ledgerId: number;
  showPaymentPanel: number | null;
  setShowPaymentPanel: (v: number | null) => void;
  paymentForm: { amount: string; currency: 'CNY' | 'U'; exchangeRate: string; payDate: string; note: string };
  setPaymentForm: (fn: (f: any) => any) => void;
  editingPaymentId: number | null;
  setEditingPaymentId: (v: number | null) => void;
  showPaymentDatePicker: boolean;
  setShowPaymentDatePicker: (v: boolean | ((v: boolean) => boolean)) => void;
  addPaymentMutation: any;
  updatePaymentMutation: any;
  deletePaymentMutation: any;
  interestPayments: any[] | undefined;
  updateMutation: any;
  handleOpenEdit: (order: any) => void;
  handleDelete: (orderId: number) => void;
  handleOpenParticipants: (orderId: number, interestBase: string) => void;
  showParticipantsPanel: number | null;
  getPaymentLabel: (val: string) => string;
  isInvited: boolean;
  participantsList: { userId: number; displayName: string; role: string; sortOrder: number; rate: string }[];
  setParticipantsList: (fn: (list: any[]) => any[]) => void;
  ledgerMembers: { userId: number; displayName: string; memberRole?: string }[];
  participantsLoading: boolean;
  roleOptions: { value: string; label: string; color: string; defaultRateLabel: string }[];
  handleAddParticipant: (role: any) => void;
  handleSaveParticipants: (orderId: number) => void;
  saveParticipantsMutation: any;
  participantsEditMode: boolean;
  setParticipantsEditMode: (v: boolean) => void;
}

function FunderOrderCard({
  order,
  livePrices,
  priceDirection,
  currentUser,
  isAdmin,
  membersData,
  ledgerId,
  showPaymentPanel,
  setShowPaymentPanel,
  paymentForm,
  setPaymentForm,
  editingPaymentId,
  setEditingPaymentId,
  showPaymentDatePicker,
  setShowPaymentDatePicker,
  addPaymentMutation,
  updatePaymentMutation,
  deletePaymentMutation,
  interestPayments,
  updateMutation,
  handleOpenEdit,
  handleDelete,
  handleOpenParticipants,
  showParticipantsPanel,
  getPaymentLabel,
  isInvited,
  participantsList,
  setParticipantsList,
  ledgerMembers,
  participantsLoading,
  roleOptions,
  handleAddParticipant,
  handleSaveParticipants,
  saveParticipantsMutation,
  participantsEditMode,
  setParticipantsEditMode,
}: FunderOrderCardProps) {
  const { data: _cnyRateData } = trpc.exchange.getRate.useQuery({ fromcoin: "USD", tocoin: "CNY", money: 1 }, { staleTime: 3000, refetchInterval: 3000 });
  const cnyRate = parseFloat((_cnyRateData as any)?.money ?? "7.2") || 7.2;
  const [showInterestTip, setShowInterestTip] = useState(false);
  const [showCollateralInfo, setShowCollateralInfo] = useState(false);
  const [showMarginInfo, setShowMarginInfo] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const tipBtnRef = useRef<HTMLButtonElement>(null);
  const [tipPos, setTipPos] = useState<{ bottom: number; right: number }>({ bottom: 0, right: 0 });
  const accrued = useAccruedInterestFunder(
    (order.status === 'active' || order.settled_at) ? order.interest_base : null,
    (order.status === 'active' || order.settled_at) ? (isInvited ? order.participantInfo?.commissionRate : order.interest_rate_annual) : null,
    (order.status === 'active' || order.settled_at) ? (isInvited ? order.participantInfo?.commissionStartDate : order.interest_start_date) : null,
    order.settled_at
  );

  const statusLabel = STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status;
  const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
  const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';
  const isSettled = order.status === 'settled';
  const rateStr = String(isInvited ? (order.participantInfo?.commissionRate || '') : (order.interest_rate_annual || ''));
  const isNegRate = rateStr.startsWith('-');
  const rateAbs = isNegRate ? parseFloat(rateStr.slice(1)).toFixed(0) : (rateStr ? parseFloat(rateStr).toFixed(0) : '');
  const rateSign = isNegRate ? '-' : '+';

  // 左栏数值
  const qty = parseFloat(order.buy_quantity || '0');
  const price = parseFloat(order.buy_price || '0');
  const totalU = qty > 0 && price > 0 ? qty * price : parseFloat(order.amount || '0');
  // 利息货币逻辑与 LedgerDetail FunderOrderCardRight 完全一致
  const baseCur = order.interest_base_currency || 'USDT'; // 计息基数货币
  const rateCur = order.interest_rate_currency || 'USDT'; // 约定利息货币（决定主显示单位）
  const interestUnit = rateCur === 'CNY' ? '元' : 'U';
  const altUnit = rateCur === 'CNY' ? 'U' : '元';
  // 折算：计息基数和利息货币不一致时按实时汇率折算
  const convertAccrued = (val: number): number => {
    if (baseCur === rateCur) return val;
    if (baseCur === 'USDT' && rateCur === 'CNY') return val * cnyRate; // U计息基数，元显示
    if (baseCur === 'CNY' && rateCur === 'USDT') return val / cnyRate; // 元计息基数，U显示
    return val;
  };
  const convertAlt = (val: number): number => {
    if (rateCur === 'CNY') return val / cnyRate; // 主显示元，副显示U
    return val * cnyRate; // 主显示U，副显示元
  };

  // 已结利息
  const totalPaid = (order as any).paidTotal ? parseFloat((order as any).paidTotal.amount || '0') : 0;
  const displayAccrued = convertAccrued(accrued);
  const displayPaid = convertAccrued(totalPaid);
  const altAccrued = convertAlt(displayAccrued);
  const altPaid = convertAlt(displayPaid);

  // 持有时长——已结清订单冻结在 settled_at 时刻
  const holdDurationLabel = (() => {
    if (!order.buy_date) return null;
    if (order.status !== 'active' && !order.settled_at) return null;
    const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
    const elapsed = endTs - new Date(order.buy_date + 'T00:00:00').getTime();
    if (elapsed < 0) return null;
    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
  })();

  // 读取 display_config（与 LedgerDetail show() 函数一致：默认全部显示，除非明确设为 false）
  const dc: Record<string, boolean> | null = (() => {
    try {
      const raw = order.display_config;
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return null; }
  })();
  const show = (key: string) => dc ? (dc[key] !== false) : true;

  // 担保物
  let collateralAssets: { coin: string; qty: string; note?: string }[] = [];
  try {
    const rawCA = order.collateral_assets;
    if (rawCA) {
      const parsed = typeof rawCA === 'string' ? JSON.parse(rawCA) : rawCA;
      if (Array.isArray(parsed)) collateralAssets = parsed;
    }
  } catch {}
  let collateralValue = 0;
  let collateralValueKnown = true;
  const collateralItemValues: (number | null)[] = [];
  const collateralItemPrices: (number | null)[] = [];
  for (const item of collateralAssets) {
    const iq = parseFloat(item.qty);
    if (!item.coin || isNaN(iq)) { collateralItemValues.push(null); collateralItemPrices.push(null); collateralValueKnown = false; continue; }
    if (item.coin === 'USDT') { collateralValue += iq; collateralItemValues.push(iq); collateralItemPrices.push(1); }
    else if (item.coin === 'CNY') { const cv = iq / cnyRate; collateralValue += cv; collateralItemValues.push(cv); collateralItemPrices.push(1 / cnyRate); }
    else {
      const p = livePrices[item.coin];
      if (p) { collateralValue += iq * p; collateralItemValues.push(iq * p); collateralItemPrices.push(p); }
      else { collateralItemValues.push(null); collateralItemPrices.push(null); collateralValueKnown = false; }
    }
  }

  // 风险敞口
  const interestBaseNum = isInvited
    ? (order.participantInfo?.commissionBase ? parseFloat(order.participantInfo.commissionBase) : totalU)
    : (order.interest_base ? Number(order.interest_base) : totalU);
  const liveP = livePrices[order.coin] ?? null;
  const currentValue = liveP !== null ? liveP * qty : null;
  const floatPnl = currentValue !== null ? currentValue - interestBaseNum : null;
  const exposure = floatPnl !== null
    ? collateralValue + floatPnl - accrued + totalPaid
    : collateralValue - accrued + totalPaid;
  const isSufficient = exposure >= 0;

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden relative"
      style={isInvited
        ? { border: '1px solid #86EFAC', boxShadow: '0 1px 6px rgba(34,197,94,0.08)' }
        : { border: '1px solid #E8EDFF', boxShadow: '0 1px 4px rgba(26,35,64,0.05)' }}
    >
      {isSettled && (
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center" style={{ backgroundColor: 'rgba(220,38,38,0.06)', zIndex: 10 }}>
          <div style={{ border: '3px solid rgba(220,38,38,0.35)', color: 'rgba(220,38,38,0.35)', borderRadius: '8px', padding: '8px 24px', fontSize: '28px', fontWeight: 800, letterSpacing: '6px', lineHeight: '1.4', whiteSpace: 'nowrap', transform: 'rotate(-15deg)' }}>已结清</div>
        </div>
      )}

      {/* 帽子：标签行 + 操作按钮 */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: isInvited ? '#F0FDF4' : '#FAFBFF' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: coinColor }}>
            {order.coin}
          </span>
          {order.asset_type && show('assetType') && (
            <span className="text-xs px-1.5 py-0.5 font-medium" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
              {order.asset_type === 'stock' ? '股票' : '数字币'}
            </span>
          )}
          {isAdmin ? (
            <button
              onClick={() => setShowStatusSheet(true)}
              className="text-xs px-1.5 py-0.5 rounded-full font-medium transition-opacity hover:opacity-70"
              style={{ backgroundColor: `${statusColor}15`, color: statusColor }}
            >
              {statusLabel}
            </button>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
              {statusLabel}
            </span>
          )}
          {isInvited && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>
              受邀
            </span>
          )}
          {show('showOwnerName') && (() => {
            const label = (order as any).owner_label || (() => {
              const m = (membersData as any[])?.find((m: any) => m.userId === order.user_id);
              return m ? (m.username || m.nickname) : null;
            })();
            if (!label) return null;
            return (
              <span className="text-xs font-medium px-1.5 py-0.5" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                {label}
              </span>
            );
          })()}
          {(() => {
            try {
              const t = (order as any).tags;
              const tags: string[] = Array.isArray(t) ? t : (typeof t === 'string' && t ? JSON.parse(t) : []);
              return tags.map((tag, i) => (
                <span key={i} className="text-xs font-medium px-1.5 py-0.5" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                  {tag}
                </span>
              ));
            } catch { return null; }
          })()}
        </div>
        <div className="flex items-center gap-0.5">
          {!isInvited && (
            <button
              onClick={() => handleOpenParticipants(order.id, order.interest_base || '')}
              className="px-2 py-1 text-xs rounded-lg font-medium transition-colors"
              style={{ backgroundColor: showParticipantsPanel === order.id ? '#059669' : '#ECFDF5', color: showParticipantsPanel === order.id ? '#fff' : '#059669' }}
            >
              参与方{order.participantCount > 0 ? ` ${order.participantCount}` : ''}
            </button>
          )}
          {!isInvited && (
            <button onClick={() => handleOpenEdit(order)} className="p-1.5 ml-1 text-gray-300 hover:text-blue-500 rounded-lg hover:bg-blue-50 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {!isInvited && isAdmin && (
            <button
              onClick={() => {
                if (!window.confirm('确认删除这张订单？')) return;
                if (!window.confirm('再次确认：订单将移入回收站，可随时恢复。确定删除？')) return;
                handleDelete(order.id);
              }}
              className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
              title="删除订单（移入回收站）"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 主体：左右两栏布局 */}
      <div className="flex">

        {/* 左栏：持有资产 */}
        <div className="flex-1 p-4 pr-3">
          <div className="flex items-center gap-0.5 mb-0.5">
            <span className="text-[10px] font-medium" style={{ color: isInvited ? '#16A34A' : '#3B82F6' }}>{isInvited ? '订单资产' : '持有资产'}</span>
          </div>
          <div className="min-h-9 flex flex-col justify-center">
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                {order.asset_type === 'stock' ? (order.amount !== null && order.amount !== undefined && order.amount !== '' ? totalU.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0') : (order.buy_quantity !== null && order.buy_quantity !== undefined && order.buy_quantity !== '' ? formatCoinQtyFunder(qty, order.coin) : '0')}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{order.coin}</span>
            </div>
            {order.asset_type === 'stock' ? (
              totalU > 0 && order.coin === 'CNY' && (
                <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(totalU / 7).toLocaleString(undefined, { maximumFractionDigits: 0 })} U</div>
              )
            ) : (
              liveP && qty > 0 && (
                <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(qty * liveP).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</div>
              )
            )}
          </div>
          <div className="space-y-0.5 text-xs">
            {show('buyPrice') && price > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{price.toLocaleString()} U</span>
              </div>
            )}
            {show('buyValue') && totalU > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入价值</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{totalU.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {show('interestBase') && order.interest_base && parseFloat(order.interest_base) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">{isInvited ? '计佣基数' : '计息基数'}</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {parseFloat(order.interest_base).toLocaleString(undefined, { maximumFractionDigits: 2 })} {interestUnit}
                </span>
              </div>
            )}
            {show('todayPrice') && order.coin !== 'CNY' && order.coin !== 'USDT' && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">当前币价</span>
                {(() => {
                  const buyPrice = order.buy_price ? parseFloat(order.buy_price) : null;
                  let priceColor = '#4B5563';
                  if (liveP != null && buyPrice != null) {
                    if (liveP > buyPrice) priceColor = '#DC2626';
                    else if (liveP < buyPrice) priceColor = '#16A34A';
                  }
                  const dir = priceDirection?.[order.coin] ?? 'same';
                  return (
                    <span className="font-medium flex items-center gap-0.5" style={{ color: priceColor }}>
                      {dir === 'up' && <span className="text-[10px] inline-flex items-center self-center" style={{ color: '#DC2626', animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▲</span>}
                      {dir === 'down' && <span className="text-[10px] inline-flex items-center self-center" style={{ color: '#16A34A', animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▼</span>}
                      {liveP != null ? liveP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' U' : '---'}
                    </span>
                  );
                })()}
              </div>
            )}
            {show('buyDate') && order.buy_date && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">开仓时间</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{order.buy_date}</span>
              </div>
            )}
            {show('holdDuration') && holdDurationLabel && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">持有时长</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{holdDurationLabel}</span>
              </div>
            )}
            {show('orderNo') && order.order_no && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">订单编号</span>
                <span className="font-mono" style={{ color: '#9CA3AF', letterSpacing: '0.05em' }}>{order.order_no}</span>
              </div>
            )}
            {order.interest_payment_type && show('interestPaymentType') && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">付息方式</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{getPaymentLabel(order.interest_payment_type)}</span>
              </div>
            )}
            {order.storage_account && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">存放账号</span>
                <span className="font-medium truncate ml-2" style={{ color: '#4B5563' }}>{order.storage_account}</span>
              </div>
            )}
          </div>
        </div>

        {/* 中间分隔线 */}
        <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />

        {/* 右栏：待结利息 */}
        <div className="p-4 pl-3 flex flex-col shrink-0" style={{ width: 'auto', minWidth: '160px', maxWidth: '200px' }}>
          <div className="flex items-center gap-1 mb-0.5 relative" style={{ height: '16px' }}>
            <span className="text-[10px]" style={{ color: '#3B82F6' }}>{isInvited ? '待结佣金' : '待结利息'}</span>
            {rateAbs && <span className="text-[10px] text-gray-400">(年化 {rateAbs}%)</span>}
            <button
              ref={tipBtnRef}
              type="button"
              onClick={() => {
                if (!showInterestTip && tipBtnRef.current) {
                  const rect = tipBtnRef.current.getBoundingClientRect();
                  setTipPos({ bottom: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right });
                }
                setShowInterestTip(v => !v);
              }}
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold leading-none flex-shrink-0"
              style={{ backgroundColor: '#E5E7EB', color: '#6B7280' }}
            >?</button>
            {showInterestTip && (() => {
              const startDate = (isInvited ? order.participantInfo?.commissionStartDate : order.interest_start_date) ? String(isInvited ? order.participantInfo.commissionStartDate : order.interest_start_date).slice(0, 10) : null;
              const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
              const _tipEndTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
              const elapsedMs = startDate ? Math.max(0, _tipEndTs - new Date(startDate + 'T00:00:00').getTime()) : 0;
              const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
              const elapsedHours = Math.floor((elapsedMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
              const elapsedMins = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
              const elapsedSecs = Math.floor(elapsedMs / 1000);
              const elapsedLabel = elapsedDays > 0
                ? `${elapsedDays}天 ${elapsedHours}小时 ${elapsedMins}分`
                : `${elapsedHours}小时 ${elapsedMins}分`;
              const base = order.interest_base ? parseFloat(order.interest_base) : 0;
              const rate = order.interest_rate_annual ? parseFloat(order.interest_rate_annual) : 0;
              const altAccruedTip = convertAlt(displayAccrued);
              const baseCurLabel = baseCur === 'CNY' ? '元' : 'U';
              return (
                <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowInterestTip(false)}>
                  <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold" style={{ color: '#1A2340' }}>计息说明</span>
                      <button onClick={() => setShowInterestTip(false)} className="text-gray-400 text-lg leading-none">×</button>
                    </div>
                    <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 计息时间</div>
                        <div className="space-y-1">
                          <div className="flex justify-between"><span>开始日期</span><span className="font-mono font-medium">{startDate || '--'}</span></div>
                          <div className="flex justify-between"><span>当前日期</span><span className="font-mono font-medium">{todayStr}</span></div>
                          <div className="flex justify-between"><span>已过时间</span><span className="font-mono font-medium">{elapsedLabel}</span></div>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 计算公式</div>
                        <div>计息基数 × 年化利率 ÷ 365天 ÷ 24小时 ÷ 60分 ÷ 60秒 × 已过秒数</div>
                        <div className="mt-1 font-mono">
                          <span style={{ color: '#3B82F6' }}>{base.toLocaleString()}{baseCurLabel} × {rate}% ÷ 365天 ÷ 24小时 ÷ 60分 ÷ 60秒 × {elapsedSecs.toLocaleString()}秒</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>③ 计息结果</div>
                        <div className="font-mono flex items-baseline gap-1">
                          <span style={{ color: '#DC2626', fontSize: '1.5em', fontWeight: 700 }}>= {displayAccrued.toFixed(6)} {interestUnit}</span>
                        </div>
                        <div className="mt-1 font-mono" style={{ color: '#DC2626', fontSize: '1.5em', fontWeight: 700 }}>≈ {altAccruedTip.toFixed(2)} {altUnit}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="min-h-9 flex flex-col justify-center">
            <div className="flex items-baseline gap-0.5">
              <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: isInvited ? '#1A2340' : (displayAccrued === 0 ? '#1A2340' : (isNegRate ? '#059669' : '#DC2626')), fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                {isInvited ? '' : (displayAccrued === 0 ? '' : (isNegRate ? '-' : '+'))}{displayAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{interestUnit}</span>
            </div>
            <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{altAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {altUnit}</div>
          </div>
          <div className="space-y-0.5 text-xs">
            {show('paidInterest') && (
            <>
            <div className="flex items-center justify-between">
              <span className="text-gray-400 whitespace-nowrap">{isInvited ? '已结佣金' : '已结利息'}</span>
              <span className="font-medium" style={{ color: '#4B5563' }}>
                {displayPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {interestUnit}
              </span>
            </div>
            {displayPaid > 0 && (
              <div className="flex justify-end">
                <span className="text-gray-400">≈{altPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {altUnit}</span>
              </div>
            )}
            </>
            )}
            {show('interestStartDate') && (isInvited ? order.participantInfo?.commissionStartDate : order.interest_start_date) && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{isInvited ? '计佣日期' : '计息日期'}</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {String(isInvited ? order.participantInfo.commissionStartDate : order.interest_start_date).slice(0, 10)}
                </span>
              </div>
            )}
            {show('interestDuration') && order.interest_start_date && (order.status === 'active' || order.settled_at) && (() => {
              const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
              const elapsed = endTs - new Date(String(order.interest_start_date).slice(0, 10) + 'T00:00:00').getTime();
              if (elapsed < 0) return null;
              const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
              const days = Math.floor(totalHours / 24);
              const hours = totalHours % 24;
              const label = days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
              return (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">计息时长</span>
                  <span className="font-medium" style={{ color: '#4B5563' }}>{label}</span>
                </div>
              );
            })()}
            {/* 担保货币（与 LedgerDetail 前端完全一致：受 display_config 开关控制） */}
            {show('collateralCoin') && (
              collateralAssets.length === 0
                ? (
                  <div className="flex items-center justify-between text-xs mt-0.5">
                    <span className="text-gray-400">担保货币</span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>0</span>
                  </div>
                )
                : collateralAssets.map((a, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-gray-400">{collateralAssets.length > 1 ? `担保货币${idx + 1}` : '担保货币'}</span>
                      <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(a.qty).toLocaleString()} {a.coin}</span>
                    </div>
                    {collateralItemValues[idx] !== null && collateralItemValues[idx] !== undefined && (
                      <div className="flex items-center justify-between mt-0.5">
                        <span></span>
                        <span className="font-medium" style={{ color: '#4B5563' }}>≈ {(collateralItemValues[idx] as number).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                      </div>
                    )}
                  </div>
                ))
            )}
            {show('collateralValue') && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{collateralAssets.length > 1 ? '担保总值' : '担保价值'}</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{collateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
              </div>
            )}
            {show('collateral') && (
              <>
              {showCollateralInfo && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowCollateralInfo(false)}>
                  <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
                      <button onClick={() => setShowCollateralInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                    </div>
                    <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 浮动盈亏</div>
                        <div>= 当前市值 - 计息基数（正数为浮盈，负数为亏损）</div>
                        <div className="mt-1 font-mono">
                          {floatPnl !== null
                            ? <><span style={{ color: '#3B82F6' }}>= {currentValue!.toFixed(2)} - {interestBaseNum.toFixed(2)} = </span><strong style={{ color: floatPnl >= 0 ? '#DC2626' : '#16A34A' }}>{floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)} U{floatPnl >= 0 ? '（浮盈）' : '（亏损）'}</strong></>
                            : <span className="text-gray-400">当前市值暂无实时价格，暂无法计算浮动盈亏</span>
                          }
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保价值</div>
                        {collateralAssets.length === 0
                          ? <div className="font-mono mt-1" style={{ color: '#9CA3AF' }}>0.00 U（无担保物）</div>
                          : <>
                              {collateralAssets.map((a, idx) => {
                                const itemVal = collateralItemValues[idx];
                                return (
                                  <div key={idx} className="mt-1 flex justify-between">
                                    <span className="font-mono" style={{ color: '#6B7280' }}>{a.qty} {a.coin}</span>
                                    {itemVal !== null
                                      ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{itemVal.toFixed(2)} U</span>
                                      : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                                    }
                                  </div>
                                );
                              })}
                              {collateralAssets.length > 1 && (
                                <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                                  合计 {collateralValue.toFixed(2)} U
                                </div>
                              )}
                            </>
                        }
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: isSufficient ? '#FFF1F1' : '#F0FDF4' }}>
                        <div className="font-semibold mb-1" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>③ 风险敞口</div>
                        <div>担保物 + 浮动盈亏 − 待结利息 + 已结利息（正数充足，负数缺口）</div>
                        <div className="mt-1 font-mono">
                          {floatPnl !== null
                            ? <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ({floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)}) − {accrued.toFixed(2)} + {totalPaid.toFixed(2)} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} U</strong></span>
                            : <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ---（暂无实时价） − {accrued.toFixed(2)} + {totalPaid.toFixed(2)} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} U</strong></span>
                          }
                        </div>
                        <div className="mt-1.5" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>
                          {isSufficient
                            ? `担保物充足，还有 ${exposure.toFixed(2)} U 的余量空间`
                            : `担保物不足，还需补充 ${Math.abs(exposure).toFixed(2)} U 才能覆盖风险`
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-0.5">
                  <span className="text-gray-400">担保缺口</span>
                  <button
                    onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                    style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                  >?</button>
                </div>
                <span className="font-medium" style={{ color: isSufficient ? '#4B5563' : '#16A34A' }}>
                  {isSufficient ? '100%' : `-${(Math.abs(exposure)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U`}
                </span>
              </div>
              {/* 保证金率：(担保物市值 + 浮动盈亏 - 应付利息 + 已付利息) ÷ 计息基数 × 100% */}
              {show('marginRate') && collateralValueKnown && collateralAssets.length > 0 && interestBaseNum > 0 && (() => {
                const effectiveCollateral = floatPnl !== null
                  ? collateralValue + floatPnl - accrued + totalPaid
                  : collateralValue - accrued + totalPaid;
                const marginRatio = effectiveCollateral / interestBaseNum;
                const marginColor = marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626';
                const alertThreshold = (dc && typeof (dc as any).marginAlertThreshold === 'number') ? (dc as any).marginAlertThreshold as number : null;
                const isAlerting = alertThreshold !== null && (marginRatio * 100) < alertThreshold;
                return (
                  <>
                    <div className="flex items-center justify-between mt-0.5">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">保证金率</span>
                        {isAlerting && (
                          <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[8px] font-bold flex-shrink-0 animate-pulse" style={{ background: '#EF4444', lineHeight: 1 }}>❗</span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowMarginInfo(true); }}
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                          style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                        >?</button>
                      </div>
                      <span className="font-bold" style={{ color: isAlerting ? '#EF4444' : marginColor }}>{(marginRatio * 100).toFixed(1)}%{isAlerting ? ' ⚠' : ''}</span>
                    </div>
                    {showMarginInfo && (
                      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowMarginInfo(false)}>
                        <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold" style={{ color: '#1A2340' }}>保证金率计算说明</span>
                            <button onClick={() => setShowMarginInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                          </div>
                          <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                            <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                              <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 公式</div>
                              <div>保证金率 = (担保物市值 + 浮动盈亏 - 应付利息 + 已付利息) ÷ 计息基数 × 100%</div>
                              <div className="mt-1 font-mono text-[10px]">
                                <span style={{ color: '#3B82F6' }}>= ({collateralValue.toFixed(2)}{floatPnl !== null ? ` + (${floatPnl >= 0 ? '+' : ''}${floatPnl.toFixed(2)})` : ''} − {accrued.toFixed(2)} + {totalPaid.toFixed(2)}) ÷ {interestBaseNum.toFixed(2)} × 100% = </span>
                                <strong style={{ color: marginColor }}>{(marginRatio * 100).toFixed(1)}%</strong>
                              </div>
                            </div>
                            <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                              <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保物当前市值</div>
                              {collateralAssets.map((a, idx) => {
                                const itemVal = collateralItemValues[idx];
                                return (
                                  <div key={idx} className="mt-1 flex justify-between">
                                    <span className="font-mono" style={{ color: '#6B7280' }}>{a.qty} {a.coin}</span>
                                    {itemVal !== null
                                      ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{(itemVal as number).toFixed(2)} U</span>
                                      : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                                    }
                                  </div>
                                );
                              })}
                              {collateralAssets.length > 1 && (
                                <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                                  合计 {collateralValue.toFixed(2)} U
                                </div>
                              )}
                            </div>
                            <div className="p-2.5 rounded-lg" style={{ background: marginRatio >= 1 ? '#F0FDF4' : marginRatio >= 0.5 ? '#FFFBEB' : '#FFF1F1' }}>
                              <div className="font-semibold mb-1" style={{ color: marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626' }}>③ 风险评估</div>
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5"><span style={{ color: '#16A34A' }}>≥ 100%</span><span>担保充足，风险可控</span></div>
                                <div className="flex items-center gap-1.5"><span style={{ color: '#D97706' }}>50% ~ 100%</span><span>担保偏低，建议补充</span></div>
                                <div className="flex items-center gap-1.5"><span style={{ color: '#DC2626' }}>&lt; 50%</span><span>担保严重不足，高风险</span></div>
                              </div>
                              <div className="mt-2 font-semibold" style={{ color: marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626' }}>
                                当前状态：{marginRatio >= 1 ? '担保充足' : marginRatio >= 0.5 ? '担保偏低，建议补充' : '担保严重不足，高风险'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
              </>
            )}
            {/* 收益分成（受 display_config.profitShare 开关控制；解析 commission_share 文本拿类型与比例） */}
            {show('profitShare') && order.show_profit_share && order.commission_share && (() => {
              const cs = String(order.commission_share);
              const isCoin = cs.includes('币种收益') || cs.includes('利润分成');
              const typeLabel = isCoin ? '利润分成' : '利息分成';
              const ratioMatch = cs.match(/(\d+(?:\.\d+)?)/);
              const ratioNum = ratioMatch ? parseFloat(ratioMatch[1]) : 0;
              const ratio = ratioNum / 100;
              // 待分金额：利息分成 = 本金(计息基数)×比例；利润分成 = 浮动利润×比例
              let shareAmt: number | null = null;
              if (!isCoin) {
                if (interestBaseNum > 0 && ratio > 0) shareAmt = interestBaseNum * ratio;
              } else {
                if (liveP != null && price > 0 && qty > 0 && ratio > 0) {
                  shareAmt = Math.max(0, liveP - price) * qty * ratio;
                }
              }
              return (
                <div className="border-t mt-1 pt-1" style={{ borderColor: '#E8EFFF' }}>
                  <div className="h-4 flex items-center" style={{ color: '#3B82F6' }}>
                    <span className="text-xs font-medium">收益分成</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-gray-400 shrink-0">分成类型</span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>{typeLabel}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-gray-400 shrink-0">分成比例</span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>{ratioNum > 0 ? `${ratioNum}%` : '---'}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-gray-400 shrink-0">待分金额</span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>{shareAmt != null ? `≈ ${shareAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })} U` : '---'}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* 内部备注 */}
      {order.admin_note && (
        <div className="px-4 pb-2 text-xs text-gray-400 border-t border-gray-100 pt-2">
          内部备注：{order.admin_note}
        </div>
      )}

      {/* 参与方面板 */}
      {showParticipantsPanel === order.id && (
        <div className="px-4 pt-3 pb-3 border-t border-green-100">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-green-700 flex items-center gap-1">
              <Users2 className="w-3.5 h-3.5" />
              多视角订单参与方
            </div>
            {participantsEditMode ? (
              <div className="flex gap-1">
                {roleOptions.map(r => (
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
            ) : (
              <button
                onClick={() => setParticipantsEditMode(true)}
                className="px-2.5 py-0.5 text-xs rounded-full font-medium border flex items-center gap-1"
                style={{ borderColor: '#059669', color: '#059669', backgroundColor: '#ECFDF5' }}
              >
                <Pencil className="w-3 h-3" />编辑
              </button>
            )}
          </div>
          {participantsLoading ? (
            <div className="text-center py-3 text-xs text-gray-400">加载中...</div>
          ) : !participantsEditMode ? (
            /* 只读态：展示已保存的参与方（成员、角色、利率%、收/付） */
            participantsList.length === 0 ? (
              <div className="text-center py-3 text-xs text-gray-400 bg-gray-50 rounded-xl">暂无参与方配置</div>
            ) : (
              <div className="space-y-2">
                {participantsList.map((p, idx) => {
                  const roleOpt = roleOptions.find(r => r.value === p.role);
                  const rateNum = parseFloat(p.rate || '');
                  const hasRate = isFinite(rateNum);
                  const isNeg = hasRate && rateNum < 0;
                  const absVal = hasRate ? Math.abs(rateNum) : null;
                  return (
                    <div key={idx} className="bg-white border border-gray-100 rounded-xl px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: roleOpt?.color || '#6B7280' }} />
                        <span className="text-xs font-medium text-gray-700 truncate">{p.displayName || `用户${p.userId}`}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: `${roleOpt?.color}18`, color: roleOpt?.color }}>{roleOpt?.label || p.role}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasRate ? (
                          <>
                            <span className="text-xs font-semibold tabular-nums" style={{ color: isNeg ? '#059669' : '#DC2626' }}>{absVal}%</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={isNeg ? { backgroundColor: '#ECFDF5', color: '#059669' } : { backgroundColor: '#FEF2F2', color: '#DC2626' }}>{isNeg ? '付' : '收'}</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-gray-400">未设利率</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : participantsList.length === 0 ? (
            <div className="text-center py-3 text-xs text-gray-400 bg-gray-50 rounded-xl">
              暂无参与方配置，点击上方按钮添加
            </div>
          ) : (
            <div className="space-y-2">
              {participantsList.map((p, idx) => {
                const roleOpt = roleOptions.find(r => r.value === p.role)!;
                const rateNum = parseFloat(p.rate || '');
                const isNeg = isFinite(rateNum) && rateNum < 0;
                const absVal = isFinite(rateNum) ? Math.abs(rateNum) : '';
                const setRate = (nextAbs: string, neg: boolean) => {
                  const v = nextAbs.toString().trim();
                  if (v === '') {
                    setParticipantsList(list => list.map((item, i) => i === idx ? { ...item, rate: '' } : item));
                    return;
                  }
                  const num = Math.abs(parseFloat(v) || 0);
                  const signed = neg ? -num : num;
                  setParticipantsList(list => list.map((item, i) => i === idx ? { ...item, rate: String(signed) } : item));
                };
                return (
                  <div key={idx} className="bg-gray-50 rounded-xl px-2 py-1.5 flex items-center gap-1.5">
                    {/* 角色小点 */}
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: roleOpt?.color || '#6B7280' }} title={roleOpt?.label || p.role} />
                    {/* 成员选择 */}
                    <select
                      value={p.userId}
                      onChange={e => {
                        const uid = Number(e.target.value);
                        const member = ledgerMembers.find(m => m.userId === uid);
                        setParticipantsList(list => list.map((item, i) => i === idx ? { ...item, userId: uid, displayName: member?.displayName || '' } : item));
                      }}
                      className="min-w-0 flex-1 px-1.5 py-1 text-xs border border-gray-200 rounded-md bg-white"
                    >
                      <option value={0}>选成员</option>
                      {ledgerMembers.map(m => (
                        <option key={m.userId} value={m.userId}>{m.displayName}</option>
                      ))}
                    </select>
                    {/* 利率输入 */}
                    <div className="flex items-center w-16 shrink-0 px-1.5 py-1 border border-gray-200 rounded-md bg-white">
                      <input
                        type="number"
                        step="0.01"
                        value={absVal}
                        onChange={e => setRate(e.target.value, isNeg)}
                        placeholder="利率"
                        className="w-full min-w-0 text-xs outline-none bg-transparent"
                      />
                      <span className="text-[10px] text-gray-400 shrink-0">%</span>
                    </div>
                    {/* 收/付息切换 */}
                    <button
                      type="button"
                      onClick={() => setRate(String(absVal || ''), false)}
                      className="px-1.5 py-1 rounded-md text-[11px] font-semibold border shrink-0"
                      style={!isNeg ? { backgroundColor: '#FEF2F2', color: '#DC2626', borderColor: '#FCA5A5' } : { backgroundColor: '#fff', color: '#9CA3AF', borderColor: '#E5E7EB' }}
                    >收</button>
                    <button
                      type="button"
                      onClick={() => setRate(String(absVal || ''), true)}
                      className="px-1.5 py-1 rounded-md text-[11px] font-semibold border shrink-0"
                      style={isNeg ? { backgroundColor: '#ECFDF5', color: '#059669', borderColor: '#6EE7B7' } : { backgroundColor: '#fff', color: '#9CA3AF', borderColor: '#E5E7EB' }}
                    >付</button>
                    {/* 删除 */}
                    <button
                      onClick={() => setParticipantsList(list => list.filter((_, i) => i !== idx))}
                      className="p-0.5 text-gray-300 hover:text-red-400 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {participantsEditMode && (
            <button
              onClick={() => handleSaveParticipants(order.id)}
              disabled={saveParticipantsMutation.isPending}
              className="mt-3 w-full py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}
            >
              {saveParticipantsMutation.isPending ? '保存中...' : '保存参与方配置'}
            </button>
          )}
        </div>
      )}

      {/* 结息面板 + 备注区 */}
      <div className="px-4 pt-3 pb-3 border-t border-blue-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium" style={{ color: '#1A2340' }}>
            {isInvited ? '已结佣金' : '已结利息'}：<span style={{ color: '#16A34A' }}>{displayPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {interestUnit}</span>
          </span>
          <button
            onClick={() => { setShowPaymentPanel(showPaymentPanel === order.id ? null : order.id); setPaymentForm(() => ({ amount: '', currency: 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' })); }}
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
                <label className="block text-xs text-gray-500 mb-1">结息金额 ({interestUnit})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={paymentForm.amount}
                  onChange={e => setPaymentForm((f: any) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="如：500"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息日期</label>
                <div className="relative">
                  <button
                    onClick={() => setShowPaymentDatePicker((v: boolean) => !v)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-left focus:outline-none"
                    style={{ backgroundColor: '#fff', color: paymentForm.payDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                  >
                    {paymentForm.payDate || '选择日期'}
                  </button>
                  {showPaymentDatePicker && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowPaymentDatePicker(false)}>
                      <div className="bg-white rounded-xl shadow-2xl mx-4 w-full" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
                        <DatePicker value={paymentForm.payDate} onChange={v => { setPaymentForm((f: any) => ({ ...f, payDate: v })); setShowPaymentDatePicker(false); }} />
                      </div>
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
                onChange={e => setPaymentForm((f: any) => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="结息说明"
                style={{ display: 'block', boxSizing: 'border-box' }}
              />
            </div>
            <button
              onClick={() => {
                if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) { toast.error('请填写结息金额'); return; }
                addPaymentMutation.mutate({ ledgerId, orderId: order.id, amount: parseFloat(paymentForm.amount), currency: paymentForm.currency || 'U', exchangeRate: parseFloat(paymentForm.exchangeRate || '7.0'), payDate: paymentForm.payDate || new Date().toISOString().slice(0, 10), note: paymentForm.note || undefined });
              }}
              disabled={addPaymentMutation.isPending}
              className="w-full py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
            >
              {addPaymentMutation.isPending ? '提交中...' : '确认记录'}
            </button>
          </div>
        )}

        {showPaymentPanel === order.id && Array.isArray(interestPayments) && interestPayments.length > 0 && (
          <div className="space-y-1.5">
            {interestPayments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="font-medium" style={{ color: '#16A34A' }}>+{parseFloat(p.amount).toFixed(2)} {interestUnit}</span>
                  {p.note && <span className="text-gray-400 ml-1 truncate">{p.note}</span>}
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <span className="text-gray-400">{p.payment_date}</span>
                  <button
                    onClick={() => {
                      if (window.confirm('确认删除这条结息记录？')) {
                        deletePaymentMutation.mutate({ ledgerId, paymentId: p.id });
                      }
                    }}
                    className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                    title="删除"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 公开备注区域 */}
        <FunderNoteRow
          orderId={order.id}
          ledgerId={ledgerId}
          initialNote={order.public_note || ''}
          onSaved={(raw) => { order.public_note = raw; }}
          currentUser={currentUser ? { id: (currentUser as any).id, name: (currentUser as any).name, username: (currentUser as any).username, avatar: (currentUser as any).avatar || (membersData as any[])?.find((u: any) => u.userId === (currentUser as any).id)?.avatar || undefined } : undefined}
          isAdmin={isAdmin}
          membersData={membersData as any[]}
        />
      </div>

      {/* 状态操作底部弹窗 */}
      {showStatusSheet && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onClick={() => setShowStatusSheet(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="text-sm font-semibold text-gray-700 mb-4 text-center">订单操作</div>
            <div className="space-y-2">
              <button
                onClick={() => {
                  updateMutation.mutate({ id: order.id, ledgerId, status: 'active' });
                  setShowStatusSheet(false);
                }}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: order.status === 'active' ? '#DCFCE7' : '#F3F4F6', color: order.status === 'active' ? '#16A34A' : '#374151' }}
              >
                持有中{order.status === 'active' ? '（当前）' : ''}
              </button>
              <button
                onClick={() => {
                  updateMutation.mutate({ id: order.id, ledgerId, status: 'settled' });
                  setShowStatusSheet(false);
                }}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: order.status === 'settled' ? '#DBEAFE' : '#F3F4F6', color: order.status === 'settled' ? '#1D4ED8' : '#374151' }}
              >
                已结清{order.status === 'settled' ? '（当前）' : ''}（利息停止计算）
              </button>
              <button
                onClick={() => {
                  if (window.confirm('确认删除这张订单？订单将移入回收站，可随时恢复。')) {
                    handleDelete(order.id);
                    setShowStatusSheet(false);
                  }
                }}
                className="w-full py-3 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}
              >
                删除订单（移入回收站）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ===== END FunderOrderCard =====


interface FunderManagementProps {
  adminOnly?: boolean;
  ledgerIdProp?: number;
  hideHeader?: boolean;
  onRecycleBinRef?: (openFn: () => void) => void;
}

export default function FunderManagement({ ledgerIdProp, hideHeader, adminOnly, onRecycleBinRef }: FunderManagementProps = {}) {
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
  const [participantsEditMode, setParticipantsEditMode] = useState(false); // 参与方面板是否处于编辑态（已保存默认只读）
  type ParticipantRole = 'funder' | 'borrower' | 'broker';
  type ParticipantItem = { userId: number; displayName: string; role: ParticipantRole; sortOrder: number; rate: string };
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
  const [showRecycleBin, setShowRecycleBin] = useState(false);

  // 将打开回收站的方法暴露给父组件
  useEffect(() => {
    if (onRecycleBinRef) {
      onRecycleBinRef(() => setShowRecycleBin(true));
    }
  }, [onRecycleBinRef]);

  const [formData, setFormData] = useState({
    userId: 0,
    coin: 'BTC' as CoinType,
    amountCurrency: 'USDT' as CoinType, // 融资金额出资币种（独立于标的币种）
    buyPrice: '',
    buyQuantity: '',
    buyDate: getBeijingToday(),
    storageAccount: '',
    status: 'active',
    adminNote: '',
    publicNote: '',
    interestRateAnnual: '',
    interestPaymentType: '',
    interestBase: '',
    interestBaseCurrency: 'USDT' as 'USDT' | 'CNY',
    interestRateCurrency: 'USDT' as 'USDT' | 'CNY',
    interestStartDate: getBeijingToday(),
    showProfitShare: true,
    commissionShare: '',
    profitShareRatio: '', // 收益分成比例（百分数，如 20 表示 20%）
    profitShareType: 'interest' as 'interest' | 'coin', // 分成类型：interest=利息分成，coin=币种收益分成
    originalAmount: '', // 编辑时保存原订单金额，买入价格或数量为空时回退使用
    // 受邀订单佣金配置
    commissionRate: '',
    commissionBase: '',
    commissionStartDate: '',
    assetType: '' as '' | 'stock' | 'crypto',
    ownerLabel: '',
    ownerLabelMode: 'member' as 'member' | 'manual',
    tags: [] as string[],
  });
  // 标签输入状态
  const [tagInput, setTagInput] = useState('');
  // 担保货币列表：[{ coin: 'BTC', qty: '' }, ...]
  const [collateralAssets, setCollateralAssets] = useState<{ coin: string; qty: string; note?: string }[]>([]);
  // 担保货币编辑模式：编辑已有订单时默认只读，点「编辑」才可改；新建订单时恒为可编辑
  const [collateralEditMode, setCollateralEditMode] = useState(false);

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
    showOwnerName: true,
    interestPaymentType: true,
    interestDuration: true,
  };
  const [displayConfig, setDisplayConfig] = useState<Record<string, boolean>>(DEFAULT_DISPLAY_CONFIG);
  const [marginAlertThreshold, setMarginAlertThreshold] = useState<string>(''); // 保证金率预警阈值（%）
  const [showPreviewCollateralInfo, setShowPreviewCollateralInfo] = useState(false); // 预览卡片-担保缺口说明
  const [showPreviewMarginInfo, setShowPreviewMarginInfo] = useState(false); // 预览卡片-保证金率说明
  const COLLATERAL_COINS = ['BTC', 'ETH', 'SOL', 'USDT', 'CNY'];

  // 融资金额输入状态：编辑时用本地值，非编辑时显示计算值
  const [amountEditing, setAmountEditing] = useState(false);
  // 计息基数是否被用户手动改过：手动后不再自动带入融资金额
  const interestBaseTouchedRef = useRef(false);
  const [amountInputValue, setAmountInputValue] = useState('');
  // computedAmount 与同步 useEffect 已下移到 formLivePrices/cnyRate/折算函数定义之后（避免 TDZ）

  // 员工名字筛选
  const [employeeNameFilter, setEmployeeNameFilter] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // 担保价值（在 assetOrdersData 定义后使用）——放到这里是为了先定义类型，实际计算在下方的 derivedCollateral 中
  // 当前登录用户信息（用于备注权限控制）
  const { data: currentUser } = trpc.auth.me.useQuery();
  const { data: ledgerData } = trpc.ledger.getLedger.useQuery({ id: ledgerId }, { enabled: ledgerId > 0 });
  const isAdminUser = (ledgerData as any)?.userRole === 'owner' || (ledgerData as any)?.userRole === 'admin';

  const { data: funderUsers, isLoading: usersLoading } = trpc.ledger.funderGetFunderUsers.useQuery(
    { ledgerId, ...(adminOnly ? { roleFilter: "admin" as const } : {}) },
    { enabled: ledgerId > 0 && isAdminUser }
  );

  const { data: assetOrdersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId, ...(selectedUserId ? { userId: selectedUserId } : {}), ...(adminOnly ? { roleFilter: "admin" as const } : {}) },
    { enabled: ledgerId > 0, staleTime: 3000, refetchInterval: 3000 }
  );
  // funderGetAssetOrders 返回 { orders, livePrices }，取 orders 数组
  const assetOrders = (assetOrdersData as any)?.orders ?? assetOrdersData ?? [];
  const formLivePrices: Record<string, number> = (assetOrdersData as any)?.livePrices ?? {};
  const { data: cnyRateData } = trpc.exchange.getRate.useQuery({ fromcoin: "USD", tocoin: "CNY", money: 1 }, { staleTime: 3000, refetchInterval: 3000 });
  const cnyRate = parseFloat((cnyRateData as any)?.money ?? "7.2") || 7.2;
  // 通用折算：任一币种数额 -> USDT 基准（CNY 用 cnyRate，USDT=1，其余按实时价 USDT/枚）
  const toUsdtBase = (val: number, cur: string): number | null => {
    if (isNaN(val)) return null;
    if (cur === 'USDT') return val;
    if (cur === 'CNY') return val / cnyRate;
    const p = formLivePrices[cur];
    if (!p || p <= 0) return null;
    return val * p;
  };
  // 通用折算：USDT 基准数额 -> 任一币种数额
  const fromUsdtBase = (usdtVal: number, cur: string): number | null => {
    if (isNaN(usdtVal)) return null;
    if (cur === 'USDT') return usdtVal;
    if (cur === 'CNY') return usdtVal * cnyRate;
    const p = formLivePrices[cur];
    if (!p || p <= 0) return null;
    return usdtVal / p;
  };

  // 自动折算总金额（买入价×币数 = USDT 价值）
  const computedAmount = useMemo(() => {
    const price = parseFloat(formData.buyPrice);
    const qty = parseFloat(formData.buyQuantity);
    if (!isNaN(price) && !isNaN(qty) && price > 0 && qty > 0) {
      return (price * qty).toFixed(2);
    }
    return '';
  }, [formData.buyPrice, formData.buyQuantity]);
  // 当 computedAmount 变化且用户未在编辑时，同步到输入框
  // computedAmount = 买入价×币数 = USDT 价值；融资金额输入框按出资币种(amountCurrency)折算显示
  useEffect(() => {
    if (!amountEditing && formData.assetType !== 'stock') {
      if (computedAmount) {
        const usdtVal = parseFloat(computedAmount);
        const converted = fromUsdtBase(usdtVal, formData.amountCurrency);
        if (converted !== null && !isNaN(converted)) {
          setAmountInputValue(parseFloat(converted.toFixed(2)).toString());
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedAmount, amountEditing, formData.assetType, formData.amountCurrency, cnyRate, JSON.stringify(formLivePrices)]);

  // 便捷操作：当融资金额（出资币种为 U/USDT）算出后，默认把计息基数带入该值
  // 仅在用户未手动改过计息基数时生效；用户手动修改后不再覆盖
  useEffect(() => {
    if (interestBaseTouchedRef.current) return;
    if (formData.amountCurrency !== 'USDT') return;
    const usdtVal = parseFloat(computedAmount || '0');
    if (!usdtVal || usdtVal <= 0) return;
    const next = parseFloat(usdtVal.toFixed(2)).toString();
    setFormData(d => (d.interestBase === next && d.interestBaseCurrency === 'USDT')
      ? d
      : { ...d, interestBase: next, interestBaseCurrency: 'USDT' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedAmount, formData.amountCurrency]);

  // 涨跌方向计算：用 localStorage 存储上一次价格（与 LedgerDetail 一致）
  const PREV_PRICE_CACHE_KEY = `funder_prev_prices_p095_${ledgerId}`;
  const [priceDirection, setPriceDirection] = useState<Record<string, 'up' | 'down' | 'same'>>({});
  useEffect(() => {
    if (Object.keys(formLivePrices).length === 0) return;
    let prevPrices: Record<string, number> = {};
    try { prevPrices = JSON.parse(localStorage.getItem(PREV_PRICE_CACHE_KEY) || '{}'); } catch {}
    const newDir: Record<string, 'up' | 'down' | 'same'> = {};
    for (const coin of Object.keys(formLivePrices)) {
      const prev = prevPrices[coin];
      const curr = formLivePrices[coin];
      if (!prev || prev === 0) { newDir[coin] = 'same'; }
      else if (curr > prev) { newDir[coin] = 'up'; }
      else if (curr < prev) { newDir[coin] = 'down'; }
      else { newDir[coin] = 'same'; }
    }
    setPriceDirection(newDir);
    try { localStorage.setItem(PREV_PRICE_CACHE_KEY, JSON.stringify(formLivePrices)); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formLivePrices)]);
  // 全量订单（不带 userId 过滤），专用于下拉框统计每个用户的订单数量
  const { data: allOrdersData } = trpc.ledger.funderGetAssetOrders.useQuery(
    { ledgerId, ...(adminOnly ? { roleFilter: "admin" as const } : {}) },
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
      } else if (item.coin === 'CNY') {
        total += qty / cnyRate;
      } else {
        const price = formLivePrices[item.coin];
        if (price) total += qty * price;
        // 即使没有实时价格，qty=0 时也不影响 total（加 0）
      }
    }
    return hasAny ? total : null;
  }, [collateralAssets, formLivePrices, cnyRate]);

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
  // 借方创建：当所选用户是账本普通成员时，订单归属右侧（借方）
  const financeCreateMutation = trpc.ledger.financeCreateOrder.useMutation({
    onSuccess: () => {
      toast.success('创建成功');
      setShowForm(false);
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.ledger.financeUpdateOrder.useMutation({
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
  // 担保货币独立保存（编辑已有订单时，仅写回 collateral_assets，不动其他字段，不关闭表单）
  const saveCollateralMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: () => {
      toast.success('担保货币已保存');
      setCollateralEditMode(false); // 保存成功后切回只读态
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  // 把当前整组担保货币写回正在编辑的订单（仅更新 collateral_assets 字段）
  const persistCollateral = (assets: { coin: string; qty: string; note?: string }[]) => {
    const oid = editingOrder?.id ? Number(editingOrder.id) : null;
    if (!oid) return; // 新建态无订单 ID，跳过（随订单一起保存）
    saveCollateralMutation.mutate({
      id: oid,
      ledgerId,
      collateralAssets: assets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty))),
    });
  };
  const deleteMutation = trpc.ledger.funderDeleteAssetOrder.useMutation({
    onSuccess: () => {
      toast.success('已移入回收站');
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
      refetchDeletedOrders();
    },
    onError: (err) => toast.error(err.message),
  });
  // 回收站相关
  const { data: deletedOrdersData, refetch: refetchDeletedOrders } = trpc.ledger.funderGetDeletedOrders.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );
  const restoreMutation = trpc.ledger.funderRestoreOrder.useMutation({
    onSuccess: () => {
      toast.success('订单已恢复');
      refetchDeletedOrders();
      refetchOrders();
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const permanentDeleteMutation = trpc.ledger.funderPermanentDeleteOrder.useMutation({
    onSuccess: () => {
      toast.success('已永久删除');
      refetchDeletedOrders();
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
    onSuccess: async () => {
      toast.success('参与方配置已保存');
      // 保存成功后自动收起面板，刷新订单数据
      setShowParticipantsPanel(null);
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
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
        displayName: p.username || p.nickname || p.userName || `用户${p.user_id}`,
        role: p.role as ParticipantRole,
        sortOrder: p.sort_order || 0,
        rate: (p.commission_rate != null && p.commission_rate !== '') ? String(p.commission_rate) : (p.rate != null ? String(p.rate) : ''),
      }));
      setParticipantsList(mapped);
      // 已有保存记录 → 默认只读态；从未配置过 → 直接进编辑态方便首次添加
      setParticipantsEditMode(mapped.length === 0);
      const mappedMembers = (result.members || []).map((m: any) => ({
        userId: m.userId,
        displayName: m.username || m.nickname || m.userName || `用户${m.userId}`,
        memberRole: m.memberRole,
      }));
      setLedgerMembers(mappedMembers);
    } catch (e) {
      toast.error('加载参与方失败');
      setParticipantsList([]);
      setParticipantsEditMode(true);
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
        rate: '',
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
        rate: (p.rate ?? '').toString().trim() || undefined,
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
      refetchOrders();
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
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });
  const deletePaymentMutation = trpc.ledger.funderDeleteInterestPayment.useMutation({
    onSuccess: () => {
      toast.success('结息记录已删除');
      refetchPayments();
      refetchEditingPayments();
      refetchAllPaidSummary();
      refetchOrders();
    },
    onError: (err) => toast.error(err.message),
  });

  // 表单内用户选择相关状态
  const [formUserDropdown, setFormUserDropdown] = useState(false);
  const [formUserSearch, setFormUserSearch] = useState('');

  const handleOpenCreate = () => {
    setFormData({
      userId: 0,
      coin: 'BTC',
      amountCurrency: 'USDT',
      buyPrice: '',
      buyQuantity: '',
      buyDate: getBeijingToday(),
      storageAccount: '',
      status: 'active',
      adminNote: '',
      publicNote: '',
      interestRateAnnual: '',
      interestPaymentType: '',
      interestBase: '',
      interestBaseCurrency: 'USDT' as 'USDT' | 'CNY',
      interestRateCurrency: 'USDT' as 'USDT' | 'CNY',
      interestStartDate: getBeijingToday(),
      showProfitShare: true,
      commissionShare: '',
      originalAmount: '',
      commissionRate: '',
      commissionBase: '',
      commissionStartDate: '',
      assetType: '' as '' | 'stock' | 'crypto',
      ownerLabel: '',
      ownerLabelMode: 'member' as 'member' | 'manual',
      tags: [] as string[],
    });
    setTagInput('');
    interestBaseTouchedRef.current = false; // 新建订单：允许融资金额(U)自动带入计息基数
    setCollateralAssets([]);
    setCollateralEditMode(true); // 新建订单：担保货币恒为可编辑
    setDisplayConfig(DEFAULT_DISPLAY_CONFIG);
    setEditingOrder(null);
    setShowDatePicker(false);
    setShowInterestDatePicker(false);
    setShowForm(true);
  };

  const handleOpenEdit = (order: any) => {
    // amount_currency 为 NULL/空表示老订单，按 USDT 口径兼容（amount 本就是 USDT 价值）
    const editAmountCurrency = (order.amount_currency && String(order.amount_currency).trim()) ? String(order.amount_currency) : 'USDT';
    setFormData({
      userId: order.user_id,
      coin: order.coin as CoinType,
      amountCurrency: editAmountCurrency as CoinType,
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
      profitShareRatio: (() => { const m = String(order.commission_share || '').match(/(\d+(?:\.\d+)?)/); return m ? m[1] : ''; })(),
      profitShareType: (String(order.commission_share || '').includes('币种收益') ? 'coin' : 'interest') as 'interest' | 'coin',
      originalAmount: order.amount || '',
      commissionRate: order.participantInfo?.commissionRate ? String(order.participantInfo.commissionRate) : '',
      commissionBase: order.participantInfo?.commissionBase ? String(order.participantInfo.commissionBase) : '',
      commissionStartDate: order.participantInfo?.commissionStartDate ? String(order.participantInfo.commissionStartDate).slice(0, 10) : '',
      assetType: (order.asset_type || '') as '' | 'stock' | 'crypto',
      ownerLabel: order.owner_label || '',
      ownerLabelMode: (order.owner_label ? 'manual' : 'member') as 'member' | 'manual',
      tags: (() => { try { const t = order.tags; return Array.isArray(t) ? t : (typeof t === 'string' ? JSON.parse(t) : []); } catch { return []; } })(),
    });
    setTagInput('');
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
    // 编辑已有订单：担保货币默认只读态，点「编辑」才可改
    setCollateralEditMode(false);
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
        // 回填保证金率预警阈值（数字字段，不在 safeConfig 中）
        if ((parsed as any).marginAlertThreshold !== undefined && (parsed as any).marginAlertThreshold !== null) {
          setMarginAlertThreshold(String((parsed as any).marginAlertThreshold));
        } else {
          setMarginAlertThreshold('');
        }
      } else {
        setDisplayConfig(DEFAULT_DISPLAY_CONFIG);
        setMarginAlertThreshold('');
      }
    } catch { setDisplayConfig(DEFAULT_DISPLAY_CONFIG); setMarginAlertThreshold(''); }
    // 初始化融资金额输入值：amount 是 USDT 价值，若出资币种非 USDT 则折算到该币种显示
    (() => {
      const amtU = order.amount ? parseFloat(order.amount) : NaN;
      if (isNaN(amtU)) { setAmountInputValue(''); return; }
      if (editAmountCurrency === 'USDT') { setAmountInputValue(String(order.amount)); return; }
      const conv = fromUsdtBase(amtU, editAmountCurrency);
      setAmountInputValue(conv !== null && !isNaN(conv) ? parseFloat(conv.toFixed(2)).toString() : String(order.amount));
    })();
    setAmountEditing(false);
    // 编辑已有订单：若已有计息基数则视为手动值，不被融资金额自动覆盖
    interestBaseTouchedRef.current = !!(order.interest_base && parseFloat(order.interest_base) > 0);
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
    // 新建模式必须选择用户
    if (!editingOrder && !formData.userId) {
      toast.error('请选择用户');
      return;
    }
    // 底层 amount 统一存 USDT 价值（与老订单口径一致，下游计算零改动）；amountCurrency 另存出资币种供展示折算
    // 股票类型：输入框是出资币种口径，需先折回 USDT 再存；非股票用 computedAmount（已是 USDT 价值）
    const stockUsdt = (() => {
      const v = parseFloat(amountInputValue);
      if (isNaN(v)) return '';
      const u = toUsdtBase(v, formData.amountCurrency);
      return u !== null ? u.toFixed(2) : '';
    })();
    const finalAmount = formData.assetType === 'stock'
      ? stockUsdt
      : (computedAmount || (editingOrder ? formData.originalAmount : ''));
    if (!finalAmount || parseFloat(finalAmount) <= 0) {
      toast.error(formData.assetType === 'stock' ? '请填写融资金额' : '请填写买入价格和买入数量以自动计算总金额');
      return;
    }
    const payload = {
      ledgerId,
      coin: formData.coin,
      amount: finalAmount,
      amountCurrency: formData.amountCurrency || undefined,
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
      showProfitShare: displayConfig.profitShare,
      commissionShare: (() => {
        if (!displayConfig.profitShare) return undefined;
        const typeLabel = formData.profitShareType === 'coin' ? '利润分成' : '利息分成';
        const ratio = (formData.profitShareRatio ?? '').toString().trim();
        return ratio ? `${typeLabel} ${ratio}%` : typeLabel;
      })(),
      // 编辑模式：始终传 collateralAssets（空数组表示清空），新建模式：为空时传 undefined
      collateralAssets: editingOrder
        ? collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)))
        : collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty))).length > 0
          ? collateralAssets.filter(a => a.coin && a.qty !== '' && !isNaN(parseFloat(a.qty)))
          : undefined,
      // 提交前确保 displayConfig 所有値都是 boolean
      displayConfig: {
        ...Object.fromEntries(
          Object.entries(displayConfig).filter(([, v]) => typeof v === 'boolean')
        ),
        ...(marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 ? { marginAlertThreshold: parseFloat(marginAlertThreshold) } : {}),
      } as Record<string, boolean | number>,
      assetType: formData.assetType || undefined,
      ownerLabel: formData.ownerLabel || undefined,
      tags: formData.tags.length > 0 ? formData.tags : undefined,
    };
    if (editingOrder) {
      updateMutation.mutate({ id: editingOrder.id, status: formData.status, ...payload });
    } else {
      // 根据所选用户在账本中的角色自动判断归属：
      // 资方/管理员(owner/admin) -> 左侧资方订单；普通成员(member) -> 右侧借方订单
      const allMembers = ((ledgerData as any)?.members || []) as any[];
      const selMember = allMembers.find((m: any) => m.userId === formData.userId);
      const selRole = String(selMember?.role || '').toLowerCase();
      const isFunderSide = selRole === 'owner' || selRole === 'admin';
      if (isFunderSide) {
        createMutation.mutate({ userId: formData.userId, ...payload });
      } else {
        financeCreateMutation.mutate({ userId: formData.userId, ...payload });
      }
    }
  };

  const handleDelete = (orderId: number) => {
    deleteMutation.mutate({ id: orderId, ledgerId });
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
        <h1 className="text-lg font-semibold text-white flex-1">资方管理</h1>
        {isAdminUser && (
          <button onClick={() => setShowRecycleBin(true)} className="p-1" title="回收站">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        )}
      </div>
      )}

      <div className="px-4 py-4">
        {/* 用户选择下拉框 + 添加订单按钮（仅管理员可见） */}
        {isAdminUser && (
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
                  ? '全部成员'
                  : (funderUsers as any[])?.find((u: any) => u.userId === selectedUserId)
                    ? (() => { const _u = (funderUsers as any[]).find((u: any) => u.userId === selectedUserId); return _u?.username + (_u?.name && _u.name !== _u.username ? ` (${_u.name})` : ''); })()
                    : '选择成员'}
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
                      placeholder="搜索成员..."
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
                  >全部成员</button>
                  {(funderUsers as any[])?.filter((u: any) => {
                    const name = u.username || u.nickname || u.name || '';
                    if (userSearchText && !name.includes(userSearchText)) return false;
                    // 过滤掉没有订单的用户
                    const hasOrders = allOrders.some((o: any) => o.userId === u.userId || o.user_id === u.userId || (o._participantUserIds && o._participantUserIds.includes(u.userId)));
                    return hasOrders;
                  }).map((u: any) => {
                    const userOrders = allOrders.filter((o: any) => o.userId === u.userId || o.user_id === u.userId || (o._participantUserIds && o._participantUserIds.includes(u.userId)));
                    const activeCount = userOrders.filter((o: any) => o.status === 'active').length;
                    const settledCount = userOrders.filter((o: any) => o.status === 'settled' || o.status === 'cancelled').length;
                    return (
                    <button
                      key={u.userId}
                      onClick={() => { setSelectedUserId(u.userId); setShowUserDropdown(false); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between"
                      style={{ color: selectedUserId === u.userId ? '#1A56DB' : '#374151', fontWeight: selectedUserId === u.userId ? 600 : 400 }}
                    >
                      <span>{u.username}{u.name && u.name !== u.username ? ` (${u.name})` : ''}</span>
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
            onClick={() => handleOpenCreate()}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white text-sm font-medium shadow-md"
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
          ) : (() => {
            const filteredOrders = [...(assetOrders as any[])].sort((a: any, b: any) => {
              const aSettled = a.status === 'settled' || a.status === 'cancelled' ? 1 : 0;
              const bSettled = b.status === 'settled' || b.status === 'cancelled' ? 1 : 0;
              if (aSettled !== bSettled) return aSettled - bSettled;
              const aTime = new Date(a.created_at || a.createdAt || 0).getTime();
              const bTime = new Date(b.created_at || b.createdAt || 0).getTime();
              return bTime - aTime;
            });
            return filteredOrders.length === 0 ? (
              <div className="text-center py-8 bg-white rounded-2xl shadow-sm">
                <div className="text-gray-400 text-sm">暂无订单</div>
              </div>
            ) : (
            <div className="space-y-3">
              {filteredOrders.map((order: any) => {
                const isInvited = !!order.participantInfo;
                return (
                  <FunderOrderCard
                    key={order.id}
                    order={order}
                    livePrices={(assetOrdersData as any)?.livePrices ?? {}}
                    priceDirection={priceDirection}
                    currentUser={currentUser}
                    isAdmin={isAdminUser}
                    membersData={((ledgerData as any)?.members || funderUsers) as any[]}
                    ledgerId={ledgerId}
                    showPaymentPanel={showPaymentPanel}
                    setShowPaymentPanel={setShowPaymentPanel}
                    paymentForm={paymentForm}
                    setPaymentForm={setPaymentForm}
                    editingPaymentId={editingPaymentId}
                    setEditingPaymentId={setEditingPaymentId}
                    showPaymentDatePicker={showPaymentDatePicker}
                    setShowPaymentDatePicker={setShowPaymentDatePicker}
                    addPaymentMutation={addPaymentMutation}
                    updatePaymentMutation={updatePaymentMutation}
                    deletePaymentMutation={deletePaymentMutation}
                    interestPayments={interestPayments as any[]}
                    updateMutation={updateMutation}
                    handleOpenEdit={handleOpenEdit}
                    handleDelete={handleDelete}
                    handleOpenParticipants={handleOpenParticipants}
                    showParticipantsPanel={showParticipantsPanel}
                    getPaymentLabel={getPaymentLabel}
                    isInvited={isInvited}
                    participantsList={participantsList}
                    setParticipantsList={setParticipantsList}
                    ledgerMembers={ledgerMembers}
                    participantsLoading={participantsLoading}
                    roleOptions={ROLE_OPTIONS}
                    handleAddParticipant={handleAddParticipant}
                    handleSaveParticipants={handleSaveParticipants}
                    saveParticipantsMutation={saveParticipantsMutation}
                    participantsEditMode={participantsEditMode}
                    setParticipantsEditMode={setParticipantsEditMode}
                  />
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
                        onClick={() => {
                          if (editingOrder && !editingOrder.participantInfo) {
                            toast.error('\u5df2\u521b\u5efa\u8ba2\u5355\u7684\u8d44\u4ea7\u7c7b\u578b\u4e0d\u53ef\u4fee\u6539');
                            return;
                          }
                          setFormData(d => {
                          const newType = d.assetType === opt.value ? '' : opt.value;
                          // 股票类型自动锁定币种为 CNY
                          if (newType === 'stock') {
                            return { ...d, assetType: newType, coin: 'CNY' as CoinType };
                          }
                          return { ...d, assetType: newType };
                          });
                        }}
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

              {/* 自定义标签 */}
              {!editingOrder?.participantInfo && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">标签<span className="ml-1.5 text-xs text-gray-400 font-normal">可选，可添加多个</span></label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formData.tags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium" style={{ backgroundColor: '#E8F0FE', color: '#1A56DB' }}>
                        {tag}
                        <button type="button" onClick={() => setFormData(d => ({ ...d, tags: d.tags.filter((_, i) => i !== idx) }))} className="text-blue-400 hover:text-red-500 text-sm leading-none">&times;</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && tagInput.trim()) {
                          e.preventDefault();
                          if (!formData.tags.includes(tagInput.trim())) {
                            setFormData(d => ({ ...d, tags: [...d.tags, tagInput.trim()] }));
                          }
                          setTagInput('');
                        }
                      }}
                      placeholder="输入标签名称，按回车添加"
                      className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
                          setFormData(d => ({ ...d, tags: [...d.tags, tagInput.trim()] }));
                        }
                        setTagInput('');
                      }}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                      style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                    >
                      添加
                    </button>
                  </div>
                </div>
              )}

              {/* 用户选择（从账本所有成员中选）：根据所选用户角色自动判断订单归属左侧(资方)或右侧(借方) */}
              <div className="flex gap-3 items-start">
              {!editingOrder?.participantInfo && (
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    订单拥有者 <span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <div className="relative">
                    {formData.userId > 0 ? (
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-blue-300 bg-blue-50 cursor-pointer"
                        onClick={() => { setFormUserDropdown(true); setFormUserSearch(''); }}
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                        >
                          {(() => {
                            const allMembers = ((ledgerData as any)?.members || []) as any[];
                            const m = allMembers.find((m: any) => m.userId === formData.userId);
                            return (m?.username || m?.nickname || m?.name || '?')[0].toUpperCase();
                          })()}
                        </div>
                        <span className="text-sm font-medium flex-1" style={{ color: '#1A2340' }}>
                          {(() => {
                            const allMembers = ((ledgerData as any)?.members || []) as any[];
                            const m = allMembers.find((m: any) => m.userId === formData.userId);
                            return m?.username || m?.nickname || m?.name || `用户${formData.userId}`;
                          })()}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); setFormData(d => ({ ...d, userId: 0 })); setFormUserSearch(''); }}
                          className="text-gray-400 hover:text-gray-600 text-base leading-none px-1"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={formUserSearch}
                        onChange={e => { setFormUserSearch(e.target.value); setFormUserDropdown(true); }}
                        onFocus={() => setFormUserDropdown(true)}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="搜索或选择用户..."
                        style={{ display: 'block', boxSizing: 'border-box' }}
                      />
                    )}
                    {formUserDropdown && formData.userId === 0 && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setFormUserDropdown(false)}
                        />
                        <div
                          className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
                          style={{ maxHeight: 200, overflowY: 'auto' }}
                        >
                          {(() => {
                            const allMembers = ((ledgerData as any)?.members || []) as any[];
                            const filtered = allMembers.filter((m: any) => {
                              if (!formUserSearch) return true;
                              const name = (m.username || m.nickname || m.name || '').toLowerCase();
                              return name.includes(formUserSearch.toLowerCase());
                            });
                            if (filtered.length === 0) {
                              return <div className="px-4 py-3 text-sm text-gray-400 text-center">无匹配用户</div>;
                            }
                            return filtered.map((m: any) => (
                              <button
                                key={m.userId}
                                onClick={() => { setFormData(d => ({ ...d, userId: m.userId })); setFormUserSearch(m.username || m.nickname || m.name || ''); setFormUserDropdown(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left"
                              >
                                <div
                                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                  style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                                >
                                  {(m.username || m.nickname || m.name || '?')[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate" style={{ color: '#1A2340' }}>
                                    {m.username || m.nickname || m.name}
                                  </div>
                                  <div className="text-xs text-gray-400">{m.role}</div>
                                </div>
                              </button>
                            ));
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
                {/* 开仓日期（与用户同行并排） */}
                <div className="flex-1 min-w-0" style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
                  <label className="block text-sm font-medium text-gray-600 mb-2">开仓日期</label>
                  <div className="relative">
                    <button
                      onClick={() => setShowDatePicker(v => !v)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base text-left focus:outline-none"
                      style={{ backgroundColor: '#fff', color: formData.buyDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                    >
                      {formData.buyDate || '点击选择日期'}
                    </button>
                    {showDatePicker && (
                      <div className="absolute top-full left-0 right-0 z-30 mt-2">
                        <DatePicker
                          value={formData.buyDate}
                          onChange={v => { setFormData(d => ({ ...d, buyDate: v })); setShowDatePicker(false); }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* 购买币种已移至三联最后一行（与币数并排） */}

              {/* 融资金额 / 买入价格 / 购买币种+币数 三字段联动（统一圆角容器框） */}
              <div className="space-y-3" style={{ opacity: editingOrder?.participantInfo ? 0.5 : 1, pointerEvents: editingOrder?.participantInfo ? 'none' : 'auto' }}>
                <span className="block text-xs text-gray-400">
                  {formData.assetType === 'stock' ? '股票类型：只需输入融资金额' : '输入任意两个，第三个自动计算 · 融资金额 = 买入价格 × 币数'}
                </span>
                {/* 融资金额 + 融资币种（同行并排） */}
                <div className="flex items-end gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">融资金额</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={amountInputValue}
                      onFocus={() => setAmountEditing(true)}
                      onChange={e => { setAmountInputValue(e.target.value); }}
                      onBlur={e => {
                        setAmountEditing(false);
                        const amt = parseFloat(e.target.value);
                        if (isNaN(amt) || amt <= 0) return;
                        const usdtVal = toUsdtBase(amt, formData.amountCurrency);
                        if (usdtVal === null) return;
                        setFormData(d => {
                          const price = parseFloat(d.buyPrice);
                          const qty = parseFloat(d.buyQuantity);
                          if (!isNaN(price) && price > 0) {
                            const calcQty = usdtVal / price;
                            return { ...d, buyQuantity: INTEGER_COINS_FUNDER.has(d.coin) ? String(Math.round(calcQty)) : parseFloat(calcQty.toFixed(6)).toString() };
                          }
                          if (!isNaN(qty) && qty > 0) {
                            return { ...d, buyPrice: (usdtVal / qty).toFixed(2) };
                          }
                          return d;
                        });
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="如：100000"
                    />
                  </div>
                  <div style={{ width: '34%' }}>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">融资币种</label>
                    <select
                      value={formData.amountCurrency}
                      onChange={e => setFormData(d => ({ ...d, amountCurrency: e.target.value as CoinType }))}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                      style={{ backgroundColor: '#fff', color: COIN_COLORS[formData.amountCurrency as keyof typeof COIN_COLORS] || '#1A2340' }}
                    >
                      {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {amountInputValue && parseFloat(amountInputValue) > 0 && formData.amountCurrency !== 'USDT' && (() => {
                  const amt = parseFloat(amountInputValue);
                  const usdtEquiv = toUsdtBase(amt, formData.amountCurrency);
                  if (usdtEquiv === null) return null;
                  return (
                    <span className="text-xs text-gray-400 -mt-1 block">
                      ≈ {usdtEquiv.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT
                    </span>
                  );
                })()}
                {/* 买入价格 */}
                <div style={{ opacity: formData.assetType === 'stock' ? 0.4 : 1 }}>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">买入价格</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.buyPrice}
                    onChange={e => setFormData(d => ({ ...d, buyPrice: e.target.value }))}
                    onBlur={e => {
                      const price = e.target.value;
                      setFormData(d => {
                        const qty = parseFloat(d.buyQuantity);
                        const p = parseFloat(price);
                        if (!price || isNaN(p) || p <= 0) return d;
                        if (!isNaN(qty) && qty > 0) return d;
                        return d;
                      });
                    }}
                    disabled={formData.assetType === 'stock'}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:text-gray-300"
                    placeholder="如：95000"
                    step="any"
                  />
                </div>
                {/* 购买币种 + 币数（同行并排） */}
                <div className="flex items-end gap-3" style={{ opacity: formData.assetType === 'stock' ? 0.4 : 1 }}>
                  <div style={{ width: '40%' }}>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">购买币种{editingOrder && !editingOrder.participantInfo && <span className="ml-1 text-xs text-orange-500 font-normal">(不可改)</span>}</label>
                    <select
                      value={formData.coin}
                      onChange={e => {
                        if (editingOrder && !editingOrder.participantInfo) return;
                        setFormData(d => ({ ...d, coin: e.target.value as CoinType }));
                      }}
                      disabled={!!(editingOrder && !editingOrder.participantInfo) || formData.assetType === 'stock'}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none disabled:text-gray-300"
                      style={{ backgroundColor: '#fff', color: COIN_COLORS[formData.coin as keyof typeof COIN_COLORS] || '#1A2340' }}
                    >
                      {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">币数</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={formData.buyQuantity}
                      onChange={e => setFormData(d => ({ ...d, buyQuantity: e.target.value }))}
                      onBlur={e => {
                        const qty = e.target.value;
                        setFormData(d => {
                          const price = parseFloat(d.buyPrice);
                          const q = parseFloat(qty);
                          if (!qty || isNaN(q) || q <= 0) return d;
                          if (!isNaN(price) && price > 0) return d;
                          return d;
                        });
                      }}
                      disabled={formData.assetType === 'stock'}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:text-gray-300"
                      placeholder="如：1.05"
                    />
                  </div>
                </div>
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
                    onChange={e => { interestBaseTouchedRef.current = true; setFormData(d => ({ ...d, interestBase: e.target.value })); }}
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
                {/* 收（红圈+）/ 付（绿圈-） 与利率输入同行 */}
                <div className="flex items-center gap-2">
                  {(() => { const isNeg = formData.interestRateAnnual.startsWith('-'); return (
                  <>
                    <button
                      type="button"
                      title="收"
                      onClick={() => { const raw = formData.interestRateAnnual; if (raw.startsWith('-')) setFormData(d => ({ ...d, interestRateAnnual: raw.slice(1) })); }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold shrink-0 transition-all"
                      style={!isNeg
                        ? { background: '#FEE2E2', color: '#DC2626', border: '2px solid #DC2626' }
                        : { backgroundColor: '#F3F4F6', color: '#9CA3AF', border: '2px solid transparent' }}
                    >+</button>
                    <button
                      type="button"
                      title="付"
                      onClick={() => { const raw = formData.interestRateAnnual; if (!raw.startsWith('-')) setFormData(d => ({ ...d, interestRateAnnual: raw ? '-' + raw : '-' })); }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold shrink-0 transition-all"
                      style={isNeg
                        ? { background: '#DEF7EC', color: '#059669', border: '2px solid #059669' }
                        : { backgroundColor: '#F3F4F6', color: '#9CA3AF', border: '2px solid transparent' }}
                    >−</button>
                  </>
                  ); })()}
                  <input
                    type="number"
                    inputMode="decimal"
                    value={formData.interestRateAnnual.startsWith('-') ? formData.interestRateAnnual.slice(1) : formData.interestRateAnnual}
                    onChange={e => {
                      const val = e.target.value;
                      const isNeg = formData.interestRateAnnual.startsWith('-');
                      setFormData(d => ({ ...d, interestRateAnnual: isNeg ? '-' + val : val }));
                    }}
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
                <select
                  value={formData.interestPaymentType}
                  onChange={e => setFormData(d => ({ ...d, interestPaymentType: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-base focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                  style={{ backgroundColor: '#fff', color: formData.interestPaymentType ? '#1A2340' : '#9CA3AF' }}
                >
                  <option value="">请选择支付方式</option>
                  {INTEREST_PAYMENT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
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
                {/* 只读态：编辑已有订单且未进入编辑模式时 */}
                {editingOrder?.id && !collateralEditMode ? (
                  <>
                    {collateralAssets.filter(a => a.coin && a.qty !== '').length === 0 ? (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">暂无担保货币</div>
                    ) : (
                      collateralAssets.filter(a => a.coin && a.qty !== '').map((item, idx) => (
                        <div key={idx} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold shrink-0" style={{ color: COIN_COLORS[item.coin as keyof typeof COIN_COLORS] || '#1A2340' }}>{item.coin}</span>
                            <span className="text-sm text-gray-700 tabular-nums">{item.qty}</span>
                            {item.note ? <span className="text-xs text-gray-400 truncate">· {item.note}</span> : null}
                          </div>
                        </div>
                      ))
                    )}
                    <button
                      type="button"
                      onClick={() => setCollateralEditMode(true)}
                      className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-medium flex items-center justify-center gap-1 hover:bg-gray-50 transition-colors"
                    >编辑担保货币</button>
                  </>
                ) : (
                <>
                {collateralAssets.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <div className="flex gap-2 items-center">
                      <select
                        value={item.coin}
                        onChange={e => setCollateralAssets(prev => prev.map((a, i) => i === idx ? { ...a, coin: e.target.value } : a))}
                        className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 appearance-none"
                        style={{ width: '50%', backgroundColor: '#fff', color: COIN_COLORS[item.coin as keyof typeof COIN_COLORS] || '#1A2340' }}
                      >
                        {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
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
                        onClick={() => {
                          const next = collateralAssets.filter((_, i) => i !== idx);
                          setCollateralAssets(next);
                          if (editingOrder?.id) persistCollateral(next); // 编辑态：删除立即写回
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-400 text-lg shrink-0"
                      >&times;</button>
                    </div>
                    <input
                      type="text"
                      value={item.note || ''}
                      onChange={e => setCollateralAssets(prev => prev.map((a, i) => i === idx ? { ...a, note: e.target.value } : a))}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="备注（选填）"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCollateralAssets(prev => [...prev, { coin: 'BTC', qty: '', note: '' }])}
                  className="w-full py-2.5 rounded-xl border border-dashed border-blue-300 text-sm text-blue-500 font-medium flex items-center justify-center gap-1"
                >
                  <span className="text-base leading-none">+</span> 添加担保货币
                </button>
                {/* 编辑已有订单时，整组独立保存 */}
                {editingOrder?.id && (
                  <button
                    type="button"
                    onClick={() => persistCollateral(collateralAssets)}
                    disabled={saveCollateralMutation.isPending}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                  >{saveCollateralMutation.isPending ? '保存中…' : '保存担保货币'}</button>
                )}
                </>
                )}

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
                      { key: 'todayPrice', label: '当前币价' },
                      // 当前价值已移至持有资产括号显示，不再单独作为开关
                      { key: 'holdDuration', label: '持有时长' },
                      { key: 'orderNo', label: '订单编号' },
                      { key: 'interestPaymentType', label: '付息方式' },
                      { key: 'aiIcon', label: 'AI图标（持有资产右上角）' },
                      { key: 'assetType', label: '资产类型标签（股票/数字币）' },
                      { key: 'showOwnerName', label: '显示订单所有者名字' },
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
                          { key: 'interestDuration', label: '计息时长' },
                          { key: 'collateralCoin', label: '担保货币' },
                      { key: 'collateralValue', label: '担保价值' },
                      { key: 'collateral', label: '担保缺口' },
                      { key: 'marginRate', label: '保证金率' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <div className="flex items-center justify-between">
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
                        {/* 保证金率预警阈值输入框（仅在保证金率开关打开时显示） */}
                        {key === 'marginRate' && displayConfig.marginRate && (
                          <div className="mt-1.5 flex items-center gap-2 pl-1">
                            <span className="text-xs text-gray-400 shrink-0">低于</span>
                            <input
                              type="number"
                              min="0"
                              max="200"
                              step="1"
                              value={marginAlertThreshold}
                              onChange={e => setMarginAlertThreshold(e.target.value)}
                              placeholder="如：80"
                              className="w-16 text-xs text-center border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-orange-400"
                              style={{ color: '#D97706' }}
                            />
                            <span className="text-xs text-gray-400 shrink-0">% 时预警</span>
                            {marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 && (
                              <span className="text-xs text-orange-500 font-medium">已设置</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mx-4 h-px bg-gray-100 my-2" />
                {/* 右栏下半：收益分成区 */}
                <div className="px-4 pb-3">
                  <div className="text-xs font-medium text-blue-500 mb-2">右栏下半：收益分成区</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">收益分成（开启后显示下半区）</span>
                      <button
                        type="button"
                        onClick={() => setDisplayConfig(c => ({ ...c, profitShare: !c.profitShare }))}
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                          displayConfig.profitShare ? 'bg-blue-500' : 'bg-gray-200'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                          displayConfig.profitShare ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                    {displayConfig.profitShare && (
                      <div className="space-y-2 pt-1">
                        {/* 分成类型选择：利息分成 / 利润分成 */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFormData(d => ({ ...d, profitShareType: 'interest' }))}
                            className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                              formData.profitShareType === 'interest'
                                ? 'border-blue-500 bg-blue-50 text-blue-600'
                                : 'border-gray-200 text-gray-500'
                            }`}
                          >利息分成</button>
                          <button
                            type="button"
                            onClick={() => setFormData(d => ({ ...d, profitShareType: 'coin' }))}
                            className={`px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                              formData.profitShareType === 'coin'
                                ? 'border-blue-500 bg-blue-50 text-blue-600'
                                : 'border-gray-200 text-gray-500'
                            }`}
                          >利润分成</button>
                        </div>
                        {/* 分成比例输入 */}
                        <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
                          <span className="text-sm text-gray-500 shrink-0">分成比例</span>
                          <input
                            type="number"
                            value={formData.profitShareRatio}
                            onChange={e => setFormData(d => ({ ...d, profitShareRatio: e.target.value }))}
                            className="flex-1 min-w-0 text-right text-sm focus:outline-none bg-transparent"
                            placeholder="例如 20"
                          />
                          <span className="text-sm text-gray-500 shrink-0">%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 实时预览卡片 - 两栏大数字样式（与前端订单卡片一致） */}
              <div>
                <div className="text-xs font-medium text-gray-400 mb-2">实时预览</div>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E8EFFF', background: '#FFFFFF' }}>
                  {/* 顶部色条 */}
                  <div className="h-1" style={{ background: `linear-gradient(90deg, ${COIN_COLORS[formData.coin] || '#3B82F6'}, ${(COIN_COLORS[formData.coin] || '#3B82F6')}55)` }} />
                  {/* 帽子区域：资产类型标签 + 所有者名字（受开关控制） */}
                  {(displayConfig.assetType || displayConfig.showOwnerName || (formData.tags && formData.tags.length > 0)) && (
                    <div className="flex items-center gap-1.5 px-4 py-1.5 flex-wrap" style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: '#FAFBFF' }}>
                      {displayConfig.assetType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: formData.assetType === 'stock' ? '#FEF3C7' : '#E0E7FF', color: formData.assetType === 'stock' ? '#92400E' : '#1D4ED8' }}>
                          {formData.assetType === 'stock' ? '股票' : formData.assetType === 'crypto' ? '数字币' : '资产类型'}
                        </span>
                      )}
                      {displayConfig.showOwnerName && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                          {(() => {
                            if (formData.userId > 0) {
                              const allMembers = ((ledgerData as any)?.members || []) as any[];
                              const m = allMembers.find((mm: any) => mm.userId === formData.userId);
                              return m?.username || m?.nickname || m?.name || editingOrder?.userName || `用户${formData.userId}`;
                            }
                            return editingOrder?.userName || '订单所有者';
                          })()}
                        </span>
                      )}
                      {formData.tags && formData.tags.length > 0 && formData.tags.map((tag: string, i: number) => (
                        <span key={i} className="text-[10px] font-medium px-1.5 py-0.5" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                   {/* 两栏主体 */}
                   <div className="flex">
                    {/* 左栏：持有资产 */}
                     <div className="flex-1 p-4 pr-3">
                       <div className="flex items-center gap-0.5 mb-0.5">
                         <span className="text-[10px] font-medium" style={{ color: '#3B82F6' }}>持有资产</span>
                         {displayConfig.aiIcon && <span className="text-[10px] px-1 rounded" style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}>AI</span>}
                       </div>
                      <div className="min-h-7 flex flex-col justify-center mt-0.5">
                        <div className="flex items-baseline gap-1 flex-wrap">
                          <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                            {formData.assetType === 'stock'
                              ? (amountInputValue !== '' && amountInputValue !== undefined ? parseFloat(amountInputValue).toLocaleString() : '0')
                              : (formData.buyQuantity !== '' && formData.buyQuantity !== undefined ? parseFloat(parseFloat(formData.buyQuantity).toFixed(6)).toString() : '0')}
                          </span>
                          <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{formData.coin}</span>
                        </div>
                        {formData.assetType === 'stock' && amountInputValue && parseFloat(amountInputValue) > 0 && formData.coin === 'CNY' && (
                          <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>
                            ≈{(parseFloat(amountInputValue) / 7).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT
                          </div>
                        )}
                        {formData.assetType !== 'stock' && formLivePrices[formData.coin] && formData.buyQuantity && (
                          <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>
                            ≈{(formLivePrices[formData.coin] * parseFloat(formData.buyQuantity)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 text-xs mt-1">
                        {formData.assetType !== 'stock' && displayConfig.buyPrice && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">买入币价</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{formData.buyPrice ? `${parseFloat(formData.buyPrice).toLocaleString()} U` : '---'}</span>
                          </div>
                        )}
                        {displayConfig.buyValue && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">买入价值</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>
                              {computedAmount ? <>{parseFloat(computedAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {formData.coin === 'CNY' ? '元' : 'U'}{formData.coin === 'CNY' && <span className="text-gray-400 ml-1">≈{(parseFloat(computedAmount) / 7).toLocaleString(undefined, { maximumFractionDigits: 0 })} U</span>}</> : '---'}
                            </span>
                          </div>
                        )}
                        {displayConfig.interestBase && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">计息基数</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{formData.interestBase ? `${parseFloat(formData.interestBase).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${formData.interestBaseCurrency === 'CNY' ? '元' : 'U'}` : '---'}</span>
                          </div>
                        )}
                        {displayConfig.todayPrice && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">当前币价</span>
                            {(() => {
                              if (formData.coin === 'CNY') {
                                return <span className="font-medium" style={{ color: '#4B5563' }}>---</span>;
                              }
                              const lp = formLivePrices[formData.coin];
                              const bp = formData.buyPrice ? parseFloat(formData.buyPrice) : null;
                              let priceColor = '#4B5563';
                              if (lp && bp) {
                                if (lp > bp) priceColor = '#DC2626';
                                else if (lp < bp) priceColor = '#16A34A';
                              }
                              const dir = priceDirection?.[formData.coin] ?? 'same';
                              return (
                                <span className="font-medium flex items-center gap-0.5" style={{ color: priceColor }}>
                                  {dir === 'up' && <span className="text-[10px] inline-flex items-center self-center" style={{ color: '#DC2626', animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▲</span>}
                                  {dir === 'down' && <span className="text-[10px] inline-flex items-center self-center" style={{ color: '#16A34A', animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▼</span>}
                                  {lp ? lp.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' U' : '---'}
                                </span>
                              );
                            })()}
                          </div>
                        )}
                        {displayConfig.buyDate && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">开仓时间</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{formData.buyDate || '---'}</span>
                          </div>
                        )}
                        {displayConfig.holdDuration && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">持有时长</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>
                              {formData.buyDate ? (() => {
                                const elapsed = Date.now() - new Date(formData.buyDate + 'T00:00:00').getTime();
                                if (elapsed < 0) return '---';
                                const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
                                const hours = Math.floor((elapsed % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
                              })() : '---'}
                            </span>
                          </div>
                        )}
                        {displayConfig.orderNo && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">订单编号</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{editingOrder?.order_no || '创建后生成'}</span>
                          </div>
                        )}
                        {displayConfig.interestPaymentType && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 shrink-0">付息方式</span>
                            <span className="font-medium" style={{ color: '#4B5563' }}>{formData.interestPaymentType ? (INTEREST_PAYMENT_OPTIONS.find(o => o.value === formData.interestPaymentType)?.label ?? formData.interestPaymentType) : '---'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* 中间分隔线 */}
                    <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />
                     {/* 右栏：待结利息（与 LedgerDetail FunderOrderCardRight 完全一致） */}
                     <div className="p-4 pl-3 flex flex-col shrink-0" style={{ width: 'auto', minWidth: '160px', maxWidth: '200px' }}>
                      {(() => {
                        const hasInterestData = !!(formData.interestRateAnnual && formData.interestBase && formData.interestStartDate);
                        const hasCollateralData = collateralAssets.filter(a => a.coin && a.qty !== '').length > 0;
                        const hasAnyRightContent = displayConfig.accruedInterest || displayConfig.paidInterest || displayConfig.interestStartDate || displayConfig.interestDuration || displayConfig.collateralCoin || displayConfig.collateralValue || displayConfig.collateral || (displayConfig.profitShare && formData.showProfitShare);
                        if (!hasAnyRightContent) {
                          return (
                            <div className="flex items-center justify-center h-full">
                              <span className="text-gray-300 text-xs">填写利息信息后显示</span>
                            </div>
                          );
                        }
                        // 利息货币逻辑与 LedgerDetail / FunderOrderCard 完全一致
                        const prevBaseCur = formData.interestBaseCurrency || 'USDT';
                        const prevRateCur = formData.interestRateCurrency || 'USDT';
                        const prevInterestUnit = prevRateCur === 'CNY' ? '元' : 'U';
                        const prevAltUnit = prevRateCur === 'CNY' ? 'U' : '元';
                        const prevConvertAccrued = (val: number): number => {
                          if (prevBaseCur === prevRateCur) return val;
                          if (prevBaseCur === 'USDT' && prevRateCur === 'CNY') return val * 7;
                          if (prevBaseCur === 'CNY' && prevRateCur === 'USDT') return val / 7;
                          return val;
                        };
                        const prevConvertAlt = (val: number): number => {
                          if (prevRateCur === 'CNY') return val / 7;
                          return val * 7;
                        };
                        // 计算应计利息（按秒，与前端一致）
                        const base = hasInterestData ? parseFloat(formData.interestBase) : 0;
                        const rate = hasInterestData ? Math.abs(parseFloat(formData.interestRateAnnual)) / 100 : 0;
                        const start = hasInterestData ? new Date(formData.interestStartDate + 'T00:00:00') : new Date();
                        const elapsedSecs = hasInterestData ? Math.max(0, (Date.now() - start.getTime()) / 1000) : 0;
                        const rawAccrued = base * rate / 365 / 24 / 3600 * elapsedSecs;
                        const prevDisplayAccrued = prevConvertAccrued(rawAccrued);
                        const prevAltAccrued = prevConvertAlt(prevDisplayAccrued);
                        const prevDisplayPaid = prevConvertAccrued(previewPaidInterest);
                        const prevAltPaid = prevConvertAlt(prevDisplayPaid);
                        return (
                          <div>
                            {displayConfig.accruedInterest && (
                              <>
                                <div className="flex items-center gap-1 mb-0.5" style={{ height: '16px' }}>
                                  <span className="text-[10px]" style={{ color: '#3B82F6' }}>待结利息</span>
                                  {hasInterestData && <span className="text-[10px] text-gray-400">(年化 {Math.abs(parseFloat(formData.interestRateAnnual)).toFixed(0)}%)</span>}
                                </div>
                                <div className="min-h-7 flex flex-col justify-center mt-0.5">
                                  <div className="flex items-baseline gap-0.5">
                                    <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: prevDisplayAccrued === 0 ? '#1A2340' : (formData.interestRateAnnual.startsWith('-') ? '#059669' : '#DC2626'), fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                                      {prevDisplayAccrued === 0 ? '' : (formData.interestRateAnnual.startsWith('-') ? '-' : '+')}{prevDisplayAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{prevInterestUnit}</span>
                                  </div>
                                  <div className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{prevAltAccrued.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prevAltUnit}</div>
                                </div>
                              </>
                            )}
                            <div className="space-y-0.5 text-xs mt-1">
                              {displayConfig.paidInterest && (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-gray-400 whitespace-nowrap">已结利息</span>
                                    <span className="font-medium" style={{ color: '#4B5563' }}>
                                      {prevDisplayPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prevInterestUnit}
                                    </span>
                                  </div>
                                  {prevDisplayPaid > 0 && (
                                    <div className="flex justify-end">
                                      <span className="text-gray-400">≈{prevAltPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prevAltUnit}</span>
                                    </div>
                                  )}
                                </>
                              )}
                              {displayConfig.interestStartDate && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">计息日期</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>
                                    {formData.interestStartDate ? formData.interestStartDate.slice(0, 10) : '---'}
                                  </span>
                                </div>
                              )}
                              {displayConfig.interestDuration && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">计息时长</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>
                                    {formData.interestStartDate ? (() => {
                                      const elapsed = Date.now() - new Date(formData.interestStartDate + 'T00:00:00').getTime();
                                      if (elapsed < 0) return '---';
                                      const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
                                      const days = Math.floor(totalHours / 24);
                                      const hours = totalHours % 24;
                                      return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
                                    })() : '---'}
                                  </span>
                                </div>
                              )}
                              {/* 担保货币逐笔展示 */}
                              {displayConfig.collateralCoin && collateralAssets.filter(a => a.coin && a.qty !== '').map((a, idx) => {
                                const iq = parseFloat(a.qty);
                                const ap = formLivePrices[a.coin] || 0;
                                const av = a.coin === 'USDT' ? iq : iq * ap;
                                return (
                                  <div key={idx}>
                                    <div className="flex items-center justify-between mt-0.5">
                                      <span className="text-gray-400">{collateralAssets.filter(x => x.coin && x.qty !== '').length > 1 ? `担保货币${idx + 1}` : '担保货币'}</span>
                                      <span className="font-medium" style={{ color: '#4B5563' }}>{a.qty} {a.coin}</span>
                                    </div>
                                    {ap > 0 && a.coin !== 'USDT' && (
                                      <div className="flex items-center justify-between">
                                        <span></span>
                                        <span className="font-medium" style={{ color: '#4B5563' }}>≈ {av.toLocaleString(undefined, { maximumFractionDigits: 0 })} U</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {displayConfig.collateralValue && computedCollateralValue !== null && collateralAssets.filter(a => a.coin && a.qty !== '').length > 0 && (
                                <div className="flex items-center justify-between mt-0.5">
                                  <span className="text-gray-400">{collateralAssets.filter(x => x.coin && x.qty !== '').length > 1 ? '担保价值(合计)' : '担保价值'}</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{computedCollateralValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} U</span>
                                </div>
                              )}
                              {displayConfig.collateral && computedCollateralValue !== null && hasInterestData && (() => {
                                // 风险敞口计算与卡片一致
                                const interestBaseNum = parseFloat(formData.interestBase) || 0;
                                const liveP = formLivePrices[formData.coin] ?? null;
                                const coinQty = parseFloat(formData.buyQuantity || '0');
                                const currentVal = liveP !== null && coinQty > 0 ? liveP * coinQty : null;
                                const floatPnl = currentVal !== null ? currentVal - interestBaseNum : null;
                                const exp = floatPnl !== null
                                  ? computedCollateralValue + floatPnl - rawAccrued + previewPaidInterest
                                  : computedCollateralValue - rawAccrued + previewPaidInterest;
                                const sufficient = exp >= 0;
                                return (
                                  <>
                                  <div className="flex items-center justify-between mt-0.5">
                                    <div className="flex items-center gap-0.5">
                                      <span className="text-gray-400">担保缺口</span>
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); setShowPreviewCollateralInfo(true); }}
                                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                                        style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                                      >?</button>
                                    </div>
                                    <span className="font-medium" style={{ color: sufficient ? '#4B5563' : '#EF4444' }}>
                                      {sufficient ? '超过100%' : `${exp.toLocaleString(undefined, { maximumFractionDigits: 0 })} U`}
                                    </span>
                                  </div>
                                  {showPreviewCollateralInfo && (
                                    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowPreviewCollateralInfo(false)}>
                                      <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-3">
                                          <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
                                          <button onClick={() => setShowPreviewCollateralInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                                        </div>
                                        <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                                          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 浮动盈亏</div>
                                            <div>= 当前市值 − 计息基数（正数为浮盈，负数为亏损）</div>
                                            <div className="mt-1 font-mono">
                                              {floatPnl !== null
                                                ? <><span style={{ color: '#3B82F6' }}>= {currentVal!.toFixed(2)} − {interestBaseNum.toFixed(2)} = </span><strong style={{ color: floatPnl >= 0 ? '#DC2626' : '#16A34A' }}>{floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)} U{floatPnl >= 0 ? '（浮盈）' : '（亏损）'}</strong></>
                                                : <span className="text-gray-400">当前市值暂无实时价格，暂无法计算浮动盈亏</span>
                                              }
                                            </div>
                                          </div>
                                          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保价值</div>
                                            <div className="font-mono mt-1" style={{ color: '#3B82F6' }}>{(computedCollateralValue ?? 0).toFixed(2)} U</div>
                                          </div>
                                          <div className="p-2.5 rounded-lg" style={{ background: sufficient ? '#F0FDF4' : '#FFF1F1' }}>
                                            <div className="font-semibold mb-1" style={{ color: sufficient ? '#16A34A' : '#DC2626' }}>③ 风险敞口</div>
                                            <div>担保物 + 浮动盈亏 − 待结利息 + 已结利息（正数充足，负数缺口）</div>
                                            <div className="mt-1 font-mono">
                                              <span style={{ color: '#3B82F6' }}>= {(computedCollateralValue ?? 0).toFixed(2)}{floatPnl !== null ? ` + (${floatPnl >= 0 ? '+' : ''}${floatPnl.toFixed(2)})` : ' + ---（暂无实时价）'} − {rawAccrued.toFixed(2)} + {previewPaidInterest.toFixed(2)} = <strong style={{ color: sufficient ? '#16A34A' : '#DC2626' }}>{exp >= 0 ? '+' : ''}{exp.toFixed(2)} U</strong></span>
                                            </div>
                                            <div className="mt-1.5" style={{ color: sufficient ? '#16A34A' : '#DC2626' }}>
                                              {sufficient ? `担保物充足，还有 ${exp.toFixed(2)} U 的余量空间` : `担保物不足，还需补充 ${Math.abs(exp).toFixed(2)} U 才能覆盖风险`}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  </>
                                );
                              })()}
                              {/* 保证金率：(担保物市值 + 浮动盈亏 - 应付利息 + 已付利息) ÷ 计息基数 × 100% */}
                              {displayConfig.marginRate && computedCollateralValue !== null && computedCollateralValue > 0 && formData.interestBase && parseFloat(formData.interestBase) > 0 && (() => {
                                const base = parseFloat(formData.interestBase);
                                const liveP = formLivePrices[formData.coin] ?? null;
                                const coinQty = parseFloat(formData.buyQuantity || '0');
                                const buyPrice = parseFloat(formData.buyPrice || '0');
                                const marketValue = liveP !== null && coinQty > 0 ? liveP * coinQty : null;
                                const buyValue = coinQty > 0 && buyPrice > 0 ? coinQty * buyPrice : (parseFloat(computedAmount) || 0);
                                const floatPnl = formData.coin === 'USDT' ? 0 : (marketValue !== null ? marketValue - buyValue : null);
                                const effective = floatPnl !== null
                                  ? computedCollateralValue + floatPnl - rawAccrued + previewPaidInterest
                                  : computedCollateralValue - rawAccrued + previewPaidInterest;
                                const marginRatio = effective / base;
                                const marginColor = marginRatio >= 1 ? '#16A34A' : marginRatio >= 0.5 ? '#D97706' : '#DC2626';
                                const previewAlertThreshold = marginAlertThreshold && parseFloat(marginAlertThreshold) > 0 ? parseFloat(marginAlertThreshold) : null;
                                const previewIsAlerting = previewAlertThreshold !== null && (marginRatio * 100) < previewAlertThreshold;
                                return (
                                  <>
                                  <div className="flex items-center justify-between mt-0.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-gray-400 shrink-0">保证金率</span>
                                      {previewIsAlerting && (
                                        <span className="inline-flex items-center justify-center w-3 h-3 rounded-full text-white text-[7px] font-bold flex-shrink-0" style={{ background: '#EF4444', lineHeight: 1 }}>❗</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); setShowPreviewMarginInfo(true); }}
                                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                                        style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                                      >?</button>
                                    </div>
                                    <span className="font-bold" style={{ color: previewIsAlerting ? '#EF4444' : marginColor }}>{(marginRatio * 100).toFixed(1)}%{previewIsAlerting ? ' ⚠' : ''}</span>
                                  </div>
                                  {showPreviewMarginInfo && (
                                    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowPreviewMarginInfo(false)}>
                                      <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-3">
                                          <span className="text-sm font-bold" style={{ color: '#1A2340' }}>保证金率计算说明</span>
                                          <button onClick={() => setShowPreviewMarginInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                                        </div>
                                        <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                                          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 公式</div>
                                            <div>保证金率 = (担保物市值 + 浮动盈亏 − 应付利息 + 已付利息) ÷ 计息基数 × 100%</div>
                                            <div className="mt-1 font-mono text-[10px]">
                                              <span style={{ color: '#3B82F6' }}>= ({(computedCollateralValue ?? 0).toFixed(2)}{floatPnl !== null ? ` + (${floatPnl >= 0 ? '+' : ''}${floatPnl.toFixed(2)})` : ''} − {rawAccrued.toFixed(2)} + {previewPaidInterest.toFixed(2)}) ÷ {base.toFixed(2)} × 100% = </span>
                                              <strong style={{ color: marginColor }}>{(marginRatio * 100).toFixed(1)}%</strong>
                                            </div>
                                          </div>
                                          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保物当前市值</div>
                                            <div className="font-mono mt-1" style={{ color: '#3B82F6' }}>{(computedCollateralValue ?? 0).toFixed(2)} U</div>
                                          </div>
                                          {previewAlertThreshold !== null && (
                                            <div className="p-2.5 rounded-lg" style={{ background: previewIsAlerting ? '#FFF1F1' : '#F0FDF4' }}>
                                              <div className="font-semibold mb-1" style={{ color: previewIsAlerting ? '#DC2626' : '#16A34A' }}>③ 预警阈值</div>
                                              <div>当前设定预警阈值为 {previewAlertThreshold}%，{previewIsAlerting ? '保证金率已低于阈值，触发预警' : '保证金率高于阈值，暂无预警'}</div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  </>
                                );
                              })()}
                              {/* 收益分成区（右栏下半） */}
                              {displayConfig.profitShare && formData.showProfitShare && (
                                <>
                                  <div className="border-t mt-1 pt-1" style={{ borderColor: '#E8EFFF' }}>
                                    {(() => {
                                      const isCoin = formData.profitShareType === 'coin';
                                      const typeLabel = isCoin ? '利润分成' : '利息分成';
                                      const ratioNum = parseFloat(String(formData.profitShareRatio || '').trim());
                                      const ratio = isFinite(ratioNum) && ratioNum > 0 ? ratioNum / 100 : 0;
                                      const bp = parseFloat(formData.buyPrice || '0');
                                      const qy = parseFloat(formData.buyQuantity || '0');
                                      const lp = formLivePrices[formData.coin] ?? null;
                                      // 本金口径：优先计息基数，其次买入价×币数
                                      const interestBaseNum = parseFloat(formData.interestBase || '0');
                                      const principalU = interestBaseNum > 0 ? interestBaseNum : (bp > 0 && qy > 0 ? bp * qy : 0);
                                      let shareAmt: number | null = null;
                                      if (!isCoin) {
                                        if (principalU > 0 && ratio > 0) shareAmt = principalU * ratio;
                                      } else {
                                        if (lp != null && bp > 0 && qy > 0 && ratio > 0) shareAmt = Math.max(0, lp - bp) * qy * ratio;
                                      }
                                      return (
                                        <>
                                          <div className="h-4 flex items-center" style={{ color: '#3B82F6' }}>
                                            <span className="text-xs font-medium">收益分成</span>
                                          </div>
                                          <div className="flex items-center justify-between mt-0.5">
                                            <span className="text-gray-400 shrink-0">分成类型</span>
                                            <span className="font-medium" style={{ color: '#4B5563' }}>{typeLabel}</span>
                                          </div>
                                          <div className="flex items-center justify-between mt-0.5">
                                            <span className="text-gray-400 shrink-0">分成比例</span>
                                            <span className="font-medium" style={{ color: '#4B5563' }}>{isFinite(ratioNum) && ratioNum > 0 ? `${ratioNum}%` : '---'}</span>
                                          </div>
                                          <div className="flex items-center justify-between mt-0.5">
                                            <span className="text-gray-400 shrink-0">待分金额</span>
                                            <span className="font-medium" style={{ color: '#4B5563' }}>{shareAmt != null ? `≈ ${shareAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })} U` : '---'}</span>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
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

      {/* 回收站弹窗 */}
      {showRecycleBin && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowRecycleBin(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-lg bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white px-4 py-3 border-b flex items-center justify-between z-10">
              <h3 className="text-lg font-semibold">回收站</h3>
              <button onClick={() => setShowRecycleBin(false)} className="p-1">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4">
              {(!deletedOrdersData || (deletedOrdersData as any[]).length === 0) ? (
                <p className="text-center text-gray-400 py-8">回收站为空</p>
              ) : (
                <div className="space-y-3">
                  {(deletedOrdersData as any[]).map((order: any) => {
                    const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';
                    const statusLabel = STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status;
                    const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
                    const qty = parseFloat(order.buy_quantity || '0');
                    const price = parseFloat(order.buy_price || '0');
                    const totalU = qty > 0 && price > 0 ? qty * price : parseFloat(order.amount || '0');
                    const baseCur = order.interest_base_currency || 'USDT';
                    const rateCur = order.interest_rate_currency || 'USDT';
                    const interestUnit = rateCur === 'CNY' ? '元' : 'U';
                    const rateStr = order.interest_rate_annual || '';
                    const rateAbs = rateStr ? parseFloat(rateStr).toFixed(0) : '';
                    const dc = (() => { try { const raw = order.display_config; if (!raw) return null; return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; } })();
                    const show = (key: string) => dc ? (dc[key] !== false) : true;
                    return (
                      <div key={order.id} className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E8EDFF', boxShadow: '0 1px 4px rgba(26,35,64,0.05)' }}>
                        {/* 帽子：标签行 */}
                        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: '#FAFBFF' }}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: coinColor }}>
                              {order.coin}
                            </span>
                            {order.asset_type && (
                              <span className="text-xs px-1.5 py-0.5 font-medium" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                                {order.asset_type === 'stock' ? '股票' : '数字币'}
                              </span>
                            )}
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
                              {statusLabel}
                            </span>
                            {(order.owner_label || order.user_display_name || order.username) && (
                              <span className="text-xs font-medium px-1.5 py-0.5" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                                {order.owner_label || order.user_display_name || order.username}
                              </span>
                            )}
                            {(() => {
                              try {
                                const t = order.tags;
                                const tags: string[] = Array.isArray(t) ? t : (typeof t === 'string' && t ? JSON.parse(t) : []);
                                return tags.map((tag: string, i: number) => (
                                  <span key={i} className="text-xs font-medium px-1.5 py-0.5" style={{ border: '1px solid #D1D5DB', borderRadius: '3px', color: '#1A1A1A' }}>
                                    {tag}
                                  </span>
                                ));
                              } catch { return null; }
                            })()}
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {order.deleted_at ? new Date(order.deleted_at).toLocaleDateString('zh-CN') + ' 删除' : ''}
                          </span>
                        </div>

                        {/* 主体：左右两栏 */}
                        <div className="flex" style={{ minHeight: '80px' }}>
                          {/* 左栏：持有资产 */}
                          <div className="flex-1 p-3 pr-2">
                            <div className="text-[10px] font-medium mb-0.5" style={{ color: '#3B82F6' }}>持有资产</div>
                            <div className="flex items-baseline gap-1 flex-wrap mb-1">
                              <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                                {order.amount !== null && order.amount !== undefined && order.amount !== '' ? totalU.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
                              </span>
                              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{baseCur === 'CNY' ? 'CNY' : order.coin}</span>
                            </div>
                            <div className="space-y-0.5 text-xs">
                              {order.interest_base && parseFloat(order.interest_base) > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">计息基数</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(order.interest_base).toLocaleString()} {interestUnit}</span>
                                </div>
                              )}
                              {order.buy_date && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">开仓时间</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{order.buy_date}</span>
                                </div>
                              )}
                              {order.order_no && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">订单编号</span>
                                  <span className="font-mono" style={{ color: '#9CA3AF' }}>{order.order_no}</span>
                                </div>
                              )}
                              {order.interest_payment_type && show('interestPaymentType') && (
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-400">付息方式</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{order.interest_payment_type === 'monthly_prepaid' ? '月付先付' : order.interest_payment_type === 'monthly_postpaid' ? '月付后付' : order.interest_payment_type === 'quarterly' ? '季付' : order.interest_payment_type === 'maturity' ? '到期付' : order.interest_payment_type}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 中间分隔线 */}
                          <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />

                          {/* 右栏：利息信息 */}
                          <div className="w-36 p-3 pl-2 flex flex-col">
                            <div className="text-[10px] mb-0.5" style={{ color: '#3B82F6' }}>待结利息{rateAbs ? ` (年化 ${rateAbs}%)` : ''}</div>
                            {price > 0 && (
                              <div className="flex items-center justify-between text-xs mt-1">
                                <span className="text-gray-400">买入价</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{price.toLocaleString()} U</span>
                              </div>
                            )}
                            {qty > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">数量</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{qty}</span>
                              </div>
                            )}
                            {order.interest_start_date && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">计息日</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{String(order.interest_start_date).slice(5)}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 底部操作按钮 */}
                        <div className="flex gap-2 px-4 pb-3">
                          <button
                            onClick={() => {
                              if (window.confirm('确认恢复该订单？')) {
                                restoreMutation.mutate({ id: order.id, ledgerId });
                              }
                            }}
                            className="flex-1 py-2 rounded-xl text-sm font-medium bg-green-50 text-green-600 border border-green-200"
                          >
                            恢复
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('确认永久删除？此操作不可恢复！')) {
                                permanentDeleteMutation.mutate({ id: order.id, ledgerId });
                              }
                            }}
                            className="flex-1 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-200"
                          >
                            永久删除
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
