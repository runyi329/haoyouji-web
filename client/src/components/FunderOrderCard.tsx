// ===== FunderOrderCard 共享组件 =====
// @refresh reset
// 此文件由 FunderManagement.tsx 抽取，前后端统一使用此组件
// 禁止在此文件外重复定义 FunderOrderCard 组件
// @since FV0245（2026-06-25）之后的新订单使用此组件
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronDown, Plus, Pencil, Trash2, User, TrendingUp, ChevronLeft as CalLeft, ChevronRight as CalRight, Users2, X } from "lucide-react";
import { toast } from "sonner";

// 币种选项
export const COIN_OPTIONS = ['BTC', 'ETH', 'SOL', 'USDT', 'CNY', 'MSTR', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ', 'NFLX', 'ORCL', 'TSM', 'AMD', 'CL', 'NG', 'CRCL', 'DRAM', 'MU', 'PLUME'] as const;
export type CoinType = typeof COIN_OPTIONS[number];

export const STATUS_OPTIONS = [
  { value: 'active', label: '持有中' },
  { value: 'settled', label: '已结算' },
  { value: 'cancelled', label: '已取消' },
];

export const INTEREST_PAYMENT_OPTIONS = [
  { value: 'monthly_pre', label: '月付先付' },
  { value: 'monthly_post', label: '月付后付' },
  { value: 'semi_pre', label: '半年付先付' },
  { value: 'semi_post', label: '半年付后付' },
  { value: 'annual_pre', label: '年付先付' },
  { value: 'annual_post', label: '年付后付' },
  { value: 'end_post', label: '结束后付' },
];

export const COIN_COLORS: Record<CoinType, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
  USDT: '#26A17B',
  CNY: '#DE2910',
  MSTR: '#F7931A',
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
  DRAM: '#E040FB',
  MU: '#0097A7',
  PLUME: '#7B5EA7',
};

// 获取北京时间（UTC+8）今天，返回 YYYY-MM-DD
export function getBeijingToday(): string {
  const now = new Date();
  // 当前 UTC 毫秒 + 8小时，取 UTC 各部件即为北京时间
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = beijing.getUTCFullYear();
  const m = String(beijing.getUTCMonth() + 1).padStart(2, '0');
  const d = String(beijing.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 简单日历选择器组件
export function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
export function parseNotes(raw: string): NoteItem[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p as NoteItem[]; } catch {}
  return [{ text: raw, time: '' }];
}
export function formatNoteTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export function NoteAvatar({ name, avatar }: { name?: string; avatar?: string }) {
  if (avatar) return <img src={avatar} alt={name || ''} className="w-5 h-5 rounded-full object-cover shrink-0" style={{ border: '1px solid #E0E7FF' }} />;
  if (!name) return <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: '#E5E7EB' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>;
  const initials = name.slice(0, 1).toUpperCase();
  const colors = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
  const color = colors[name.charCodeAt(0) % colors.length] || '#6366F1';
  return <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: color }}>{initials}</div>;
}
export function FunderNoteRow({ orderId, ledgerId, initialNote, onSaved, currentUser, isAdmin, membersData }: { orderId: number; ledgerId: number; initialNote: string; onSaved: (note: string) => void; currentUser?: { id: number; name?: string; username?: string; avatar?: string }; isAdmin?: boolean; membersData?: any[] }) {
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
export function formatCoinQtyFunder(qty: string | number | null | undefined, coin: string): string {
  if (qty === null || qty === undefined || qty === '') return '0';
  const num = typeof qty === 'string' ? parseFloat(qty) : qty;
  if (num === 0) return '0';
  if (isNaN(num)) return String(qty);
  if (INTEGER_COINS_FUNDER.has(coin)) return Math.round(num).toLocaleString('en-US');
  return parseFloat(num.toFixed(6)).toString();
}

// ===== Helper: useAccruedInterest =====
export function useAccruedInterestFunder(interestBase: string | null, interestRateAnnual: string | null, interestStartDate: string | null, settledAt?: string | null) {
  const [accrued, setAccrued] = useState<number>(0);
  const computeAccrued = useCallback(() => {
    const base = parseFloat(interestBase || '0');
    const rate = Math.abs(parseFloat(interestRateAnnual || '0'));
    if (!base || !rate || !interestStartDate) return 0;
    const startTs = new Date(interestStartDate + 'T00:00:00').getTime();
    if (isNaN(startTs)) return 0;
    const endTs = settledAt ? new Date(settledAt).getTime() : Date.now();
    // 按北京时间自然日计天：开始日期当天算1天，每过零点+1天
    const startDateStr = new Date(startTs + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const endDateStr = new Date(endTs + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const startDay = new Date(startDateStr + 'T00:00:00+08:00').getTime();
    const endDay = new Date(endDateStr + 'T00:00:00+08:00').getTime();
    const elapsedDays = Math.max(0, Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1);
    const perDay = (base * rate / 100) / 365;
    return perDay * elapsedDays;
  }, [interestBase, interestRateAnnual, interestStartDate, settledAt]);
  useEffect(() => {
    setAccrued(computeAccrued());
    if (settledAt) return;
    // 每分钟检查一次（天数变化时才会更新，不再每秒跳动）
    const timer = setInterval(() => setAccrued(computeAccrued()), 60000);
    return () => clearInterval(timer);
  }, [computeAccrued, settledAt]);
  return accrued;
}

// ===== FunderOrderCard 子组件（左右两栏布局，与 FinanceOrderCard 一致）=====
export interface FunderOrderCardProps {
  order: any;
  livePrices: Record<string, number>;
  priceDirection: Record<string, 'up' | 'down' | 'same'>;
  currentUser: any;
  isAdmin: boolean;
  membersData: any[];
  ledgerId: number;
  showPaymentPanel?: number | null;
  setShowPaymentPanel?: (v: number | null) => void;
  paymentForm?: { amount: string; currency: 'CNY' | 'U'; exchangeRate: string; payDate: string; note: string };
  setPaymentForm?: (fn: (f: any) => any) => void;
  editingPaymentId?: number | null;
  setEditingPaymentId?: (v: number | null) => void;
  showPaymentDatePicker?: boolean;
  setShowPaymentDatePicker?: (v: boolean | ((v: boolean) => boolean)) => void;
  addPaymentMutation?: any;
  updatePaymentMutation?: any;
  deletePaymentMutation?: any;
  interestPayments?: any[] | undefined;
  updateMutation?: any;
  handleOpenEdit?: (order: any) => void;
  handleDelete?: (orderId: number) => void;
  handleOpenParticipants?: (orderId: number, interestBase: string) => void;
  showParticipantsPanel?: number | null;
  getPaymentLabel?: (val: string) => string;
  isInvited?: boolean;
  participantsList?: { userId: number; displayName: string; role: string; sortOrder: number; rate: string }[];
  setParticipantsList?: (fn: (list: any[]) => any[]) => void;
  ledgerMembers?: { userId: number; displayName: string; memberRole?: string }[];
  participantsLoading?: boolean;
  roleOptions?: { value: string; label: string; color: string; defaultRateLabel: string }[];
  handleAddParticipant?: (role: any) => void;
  handleSaveParticipants?: (orderId: number) => void;
  saveParticipantsMutation?: any;
  participantsEditMode?: boolean;
  setParticipantsEditMode?: (v: boolean) => void;
  onConfirmSettle?: (id: number) => void;
  viewMode?: 'default' | 'large' | 'small';
  onExposureGapChange?: (orderId: number, gap: number) => void;
  sharedGapMap?: Record<number, number>;
}

export function FunderOrderCard({
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
  onConfirmSettle,
  viewMode = 'default',
  onExposureGapChange,
  sharedGapMap,
}: FunderOrderCardProps) {
  // ===== 内部 fallback：当父组件未传入对应 props 时，组件自己管理 state 和 mutation =====
  const trpcUtils = trpc.useUtils();
  // 结息面板
  const [_intShowPayment, _intSetShowPayment] = useState<number | null>(null);
  const [_intPaymentForm, _intSetPaymentForm] = useState({ amount: '', currency: 'U' as 'CNY' | 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' });
  const [_intEditingPaymentId, _intSetEditingPaymentId] = useState<number | null>(null);
  const [_intShowPaymentDatePicker, _intSetShowPaymentDatePicker] = useState(false);
  // 参与方面板
  const [_intShowParticipants, _intSetShowParticipants] = useState<number | null>(null);
  const [_intParticipantsList, _intSetParticipantsList] = useState<{ userId: number; displayName: string; role: string; sortOrder: number; rate: string }[]>([]);
  const [_intLedgerMembers, _intSetLedgerMembers] = useState<{ userId: number; displayName: string; memberRole?: string }[]>([]);
  const [_intParticipantsLoading, _intSetParticipantsLoading] = useState(false);
  const [_intParticipantsEditMode, _intSetParticipantsEditMode] = useState(false);
  // 结清确认
  const [_intConfirmSettleId, _intSetConfirmSettleId] = useState<number | null>(null);
  // 内部 mutations
  const _intUpdateMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: () => { toast.success('更新成功'); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  const _intDeleteMutation = trpc.ledger.funderDeleteAssetOrder.useMutation({
    onSuccess: () => { toast.success('已移入回收站'); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  const _intSaveParticipantsMutation = trpc.ledger.funderSaveOrderParticipants.useMutation({
    onSuccess: () => { toast.success('参与方配置已保存'); _intSetShowParticipants(null); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  // 内部结息查询（仅当未传入 interestPayments 时启用）
  const _activeShowPaymentPanelForQuery = showPaymentPanel !== undefined ? showPaymentPanel : _intShowPayment;
  const { data: _intInterestPayments, refetch: _intRefetchPayments } = trpc.ledger.funderGetInterestPayments.useQuery(
    { ledgerId, orderId: _activeShowPaymentPanelForQuery! },
    { enabled: interestPayments === undefined && _activeShowPaymentPanelForQuery === order.id }
  );
  const _intAddPaymentMutation = trpc.ledger.funderAddInterestPayment.useMutation({
    onSuccess: () => { toast.success('结息记录已添加'); _intSetPaymentForm({ amount: '', currency: 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' }); _intRefetchPayments(); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  const _intDeletePaymentMutation = trpc.ledger.funderDeleteInterestPayment.useMutation({
    onSuccess: () => { toast.success('结息记录已删除'); _intRefetchPayments(); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  // 内部 handleOpenParticipants
  const _intHandleOpenParticipants = async (orderId: number, _orderInterestBase: string) => {
    if (_intShowParticipants === orderId) { _intSetShowParticipants(null); return; }
    _intSetShowParticipants(orderId);
    _intSetParticipantsLoading(true);
    try {
      const result = await trpcUtils.ledger.funderGetOrderParticipants.fetch({ orderId, ledgerId });
      const mapped = (result.participants || []).map((p: any) => ({ userId: p.user_id, displayName: p.username || p.nickname || p.userName || `用户${p.user_id}`, role: p.role, sortOrder: p.sort_order || 0, rate: (p.commission_rate != null && p.commission_rate !== '') ? String(p.commission_rate) : (p.rate != null ? String(p.rate) : '') }));
      _intSetParticipantsList(mapped);
      _intSetParticipantsEditMode(mapped.length === 0);
      const mappedMembers = (result.members || []).map((m: any) => ({ userId: m.userId, displayName: m.username || m.nickname || m.userName || `用户${m.userId}`, memberRole: m.memberRole }));
      _intSetLedgerMembers(mappedMembers);
    } catch { toast.error('加载参与方失败'); _intSetParticipantsList([]); _intSetParticipantsEditMode(true); }
    finally { _intSetParticipantsLoading(false); }
  };
  // 内部 handleAddParticipant
  const _intHandleAddParticipant = (role: any) => {
    _intSetParticipantsList(list => { const usedIds = list.map(p => p.userId); const firstAvail = _intLedgerMembers.find(m => !usedIds.includes(m.userId)); return [...list, { userId: firstAvail?.userId ?? 0, displayName: firstAvail?.displayName ?? '', role, sortOrder: list.length, rate: '' }]; });
  };
  // 内部 handleSaveParticipants
  const _intHandleSaveParticipants = (orderId: number) => {
    const valid = _intParticipantsList.filter(p => p.userId > 0);
    _intSaveParticipantsMutation.mutate({ orderId, ledgerId, participants: valid.map((p, i) => ({ userId: p.userId, role: p.role, sortOrder: i, rate: (p.rate ?? '').toString().trim() || undefined })) });
  };
  // 合并后的活跃值（父组件传入优先，否则用内部 fallback）
  const $showPaymentPanel = showPaymentPanel !== undefined ? showPaymentPanel : _intShowPayment;
  const $setShowPaymentPanel = setShowPaymentPanel !== undefined ? setShowPaymentPanel : _intSetShowPayment;
  const $paymentForm = paymentForm !== undefined ? paymentForm : _intPaymentForm;
  const $setPaymentForm = setPaymentForm !== undefined ? setPaymentForm : _intSetPaymentForm;
  const $editingPaymentId = editingPaymentId !== undefined ? editingPaymentId : _intEditingPaymentId;
  const $setEditingPaymentId = setEditingPaymentId !== undefined ? setEditingPaymentId : _intSetEditingPaymentId;
  const $showPaymentDatePicker = showPaymentDatePicker !== undefined ? showPaymentDatePicker : _intShowPaymentDatePicker;
  const $setShowPaymentDatePicker = setShowPaymentDatePicker !== undefined ? setShowPaymentDatePicker : _intSetShowPaymentDatePicker;
  const $addPaymentMutation = addPaymentMutation !== undefined ? addPaymentMutation : _intAddPaymentMutation;
  const $deletePaymentMutation = deletePaymentMutation !== undefined ? deletePaymentMutation : _intDeletePaymentMutation;
  const $interestPayments = interestPayments !== undefined ? interestPayments : (_intInterestPayments as any[] | undefined);
  const $updateMutation = updateMutation !== undefined ? updateMutation : _intUpdateMutation;
  const $showParticipantsPanel = showParticipantsPanel !== undefined ? showParticipantsPanel : _intShowParticipants;
  const $participantsList = participantsList !== undefined ? participantsList : _intParticipantsList;
  const $setParticipantsList = setParticipantsList !== undefined ? setParticipantsList : _intSetParticipantsList;
  const $ledgerMembers = ledgerMembers !== undefined ? ledgerMembers : _intLedgerMembers;
  const $participantsLoading = participantsLoading !== undefined ? participantsLoading : _intParticipantsLoading;
  const $participantsEditMode = participantsEditMode !== undefined ? participantsEditMode : _intParticipantsEditMode;
  const $setParticipantsEditMode = setParticipantsEditMode !== undefined ? setParticipantsEditMode : _intSetParticipantsEditMode;
  const $saveParticipantsMutation = saveParticipantsMutation !== undefined ? saveParticipantsMutation : _intSaveParticipantsMutation;
  const $handleOpenParticipants = handleOpenParticipants !== undefined ? handleOpenParticipants : _intHandleOpenParticipants;
  const $handleAddParticipant = handleAddParticipant !== undefined ? handleAddParticipant : _intHandleAddParticipant;
  const $handleSaveParticipants = handleSaveParticipants !== undefined ? handleSaveParticipants : _intHandleSaveParticipants;
  const $handleDelete = handleDelete !== undefined ? handleDelete : (orderId: number) => _intDeleteMutation.mutate({ id: orderId, ledgerId });
  const $handleOpenEdit = handleOpenEdit !== undefined ? handleOpenEdit : (_order: any) => {};
  const $onConfirmSettle = onConfirmSettle !== undefined ? onConfirmSettle : _intSetConfirmSettleId;
  const $getPaymentLabel = getPaymentLabel !== undefined ? getPaymentLabel : (val: string) => INTEREST_PAYMENT_OPTIONS.find(o => o.value === val)?.label || val;
  const $roleOptions = roleOptions !== undefined ? roleOptions : [
    { value: 'funder', label: '资方', color: '#3B82F6', defaultRateLabel: '利率' },
    { value: 'broker', label: '中间方', color: '#8B5CF6', defaultRateLabel: '佣金率' },
    { value: 'borrower', label: '借方', color: '#F59E0B', defaultRateLabel: '利率' },
  ];
  // ===== END 内部 fallback =====
  const { data: _cnyRateData } = trpc.exchange.getRate.useQuery({ fromcoin: "USD", tocoin: "CNY", money: 1 }, { staleTime: 3000, refetchInterval: 3000 });
  const cnyRate = parseFloat((_cnyRateData as any)?.money ?? "7.2") || 7.2;
  // 共享担保池查询（仅当订单开启了本人订单共享时才查询）
  const orderShareMode = (order as any).collateral_share_mode;
  const { data: sharedPoolInfo } = trpc.ledger.funderGetSharedCollateralPool.useQuery(
    { ledgerId, userId: Number(order.user_id) },
    { enabled: ledgerId > 0 && orderShareMode === 'self', staleTime: 0, refetchInterval: 3000 }
  );
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
  // 共享担保模式下，担保缺口 = 本金浮动亏损（亏了多少）+ 待结利息（没付的利息）
  // 即：每张订单单独计算，不使用共享池 totalGap
  const isSharedMode = orderShareMode === 'self';
  const sharedPoolLoading = isSharedMode && !sharedPoolInfo;
  // 本金浮动亏损：亏损时取绝对值，盈利时为 0（盈利不算缺口）
  const principalLoss = floatPnl !== null ? Math.max(0, -floatPnl) : 0; // 保留备用
  // 共享担保缺口 = floatPnl - accrued（可正可负）
  // 盈利订单：缺口为正（盈余，可抵消其他订单亏损）
  // 亏损订单：缺口为负（需要担保物覆盖）
  const sharedExposureGap = floatPnl !== null ? floatPnl - accrued : -accrued;
  // 共享模式：effectiveExposure 直接用 sharedExposureGap（正=充足/盈余，负=缺口）
  // 非共享模式：使用原有 exposure 逻辑
  const effectiveExposure = isSharedMode ? sharedExposureGap : exposure;
  const isSufficient = effectiveExposure >= 0;
  // 共享模式下缺口计算不再依赖 sharedPoolInfo，不需要显示「计算中...」
  // sharedPoolLoading 仅用于弹窗内共享池汇总区域的加载状态
  const showExposureLoading = false; // 缺口数字不再等待接口
  // 每次 sharedExposureGap 变化时上报给父组件，供弹窗第①部分实时读取
  useEffect(() => {
    if (isSharedMode && onExposureGapChange) {
      onExposureGapChange(order.id, sharedExposureGap);
    }
  }, [sharedExposureGap, isSharedMode, order.id]);

  return (
    <>
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
          {!isInvited && isAdmin && (
            <button
              onClick={() => $handleOpenParticipants(order.id, order.interest_base || '')}
              className="px-2 py-1 text-xs rounded-lg font-medium transition-colors"
              style={{ backgroundColor: $showParticipantsPanel === order.id ? '#059669' : '#ECFDF5', color: $showParticipantsPanel === order.id ? '#fff' : '#059669' }}
            >
              参与方{order.participantCount > 0 ? ` ${order.participantCount}` : ''}
            </button>
          )}
          {!isInvited && isAdmin && (
            <button onClick={() => $handleOpenEdit(order)} className="p-1.5 ml-1 text-gray-300 hover:text-blue-500 rounded-lg hover:bg-blue-50 transition-colors">
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {!isInvited && isAdmin && !isSettled && (
            <button
              onClick={() => $onConfirmSettle?.(order.id)}
              className="px-2 py-1 text-xs rounded-lg font-medium transition-colors"
              style={{ backgroundColor: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
              title="标记为已结清"
            >
              结清
            </button>
          )}
          {!isInvited && isAdmin && (
            <button
              onClick={() => {
                if (!window.confirm('确认删除这张订单？')) return;
                if (!window.confirm('再次确认：订单将移入回收站，可随时恢复。确定删除？')) return;
                $handleDelete(order.id);
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
                <span className="font-medium" style={{ color: '#4B5563' }}>{$getPaymentLabel(order.interest_payment_type)}</span>
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
              // 当前日期（北京时间 YYYY-MM-DD）
              const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
              const _tipEndTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
              // 按北京时间自然日计算天数：开始日期当天算1天，每过零点+1天
              const _endDateStr = new Date(_tipEndTs + 8 * 3600 * 1000).toISOString().slice(0, 10);
              const _startD = startDate ? new Date(startDate + 'T00:00:00+08:00').getTime() : 0;
              const _endD = startDate ? new Date(_endDateStr + 'T00:00:00+08:00').getTime() : 0;
              const elapsedDays = startDate ? Math.floor((_endD - _startD) / (1000 * 60 * 60 * 24)) + 1 : 0;
              const elapsedSecs = Math.floor((_tipEndTs - (startDate ? new Date(startDate + 'T00:00:00').getTime() : _tipEndTs)) / 1000);
              const elapsedLabel = `${elapsedDays}天`;
              const base = order.interest_base ? parseFloat(order.interest_base) : 0;
              const rate = order.interest_rate_annual ? Math.abs(parseFloat(order.interest_rate_annual)) : 0;
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
                        <div>计息基数 × 年化利率 ÷ 365天 × 已过天数</div>
                        <div className="mt-1 font-mono">
                          <span style={{ color: '#3B82F6' }}>{base.toLocaleString()}{baseCurLabel} × {rate}% ÷ 365天 × {elapsedDays}天</span>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>③ 计息结果</div>
                        <div className="font-mono flex items-baseline gap-1">
                          <span style={{ color: '#DC2626', fontSize: '1.5em', fontWeight: 700 }}>= {displayAccrued.toFixed(2)} {interestUnit}</span>
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
              orderShareMode === 'self'
                ? (
                  // 开启了共享担保：标题改为红色“共享担保”
                  collateralAssets.length === 0
                    ? (
                      <div className="flex items-center justify-between text-xs mt-0.5">
                        <span className="font-semibold" style={{ color: '#DC2626' }}>共享担保</span>
                        <span className="text-xs" style={{ color: '#DC2626' }}>共享担保物</span>
                      </div>
                    )
                    : collateralAssets.map((a, idx) => (
                      <div key={idx}>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="font-semibold" style={{ color: '#DC2626' }}>{collateralAssets.length > 1 ? `共享担保${idx + 1}` : '共享担保'}</span>
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
                )
                : (
                  // 未开启共享：原有逻辑
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
                )
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
                      {/* 共享担保订单：新版三段式汇总版式 */}
                      {orderShareMode === 'self' ? (
                        <>
                          {/* ① 所有共享订单的缺口汇总 */}
                          <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                            <div className="font-semibold mb-1.5" style={{ color: '#374151' }}>① 共享订单缺口汇总</div>
                            <div className="mb-1" style={{ color: '#9CA3AF' }}>每张订单缺口 = 本金亏损 + 待结利息</div>
                            {sharedPoolInfo ? (
                              <>
                                <div className="space-y-1.5">
                                  {((sharedPoolInfo as any).orders ?? []).map((o: any) => {
                                    // 与卡片公式完全一致：gap = floatPnl - accrued（可正可负）
                                    // 盈利订单缺口为正（盈余），亏损订单缺口为负
                                    const oQty = Number(o.quantity ?? 0);
                                    const oPrincipal = Number(o.principal ?? 0);
                                    const oCoin = (o.coin || '').toUpperCase();
                                    const oLiveP = livePrices[oCoin] ?? (o.currentPrice !== null && o.currentPrice !== undefined ? Number(o.currentPrice) : null);
                                    const oCurrentValue = oLiveP !== null ? oLiveP * oQty : null;
                                    const oFloatPnl = oCurrentValue !== null ? oCurrentValue - oPrincipal : null;
                                    const oPendingInterest = Number(o.pendingInterest ?? 0);
                                    const gap = oFloatPnl !== null ? oFloatPnl - oPendingInterest : null;
                                    return (
                                      <div key={o.orderId} className="flex justify-between items-center">
                                        <div>
                                          <span className="font-mono font-medium" style={{ color: '#374151' }}>{o.orderNo}</span>
                                          <span className="ml-1.5" style={{ color: '#9CA3AF' }}>{o.coin}</span>
                                          {o.quantity ? <span className="ml-1" style={{ color: '#9CA3AF' }}>× {oCoin === 'BTC' ? oQty.toFixed(2) : oQty}</span> : null}
                                        </div>
                                        <div className="text-right">
                                          {gap !== null
                                            ? <span className="font-mono font-semibold" style={{ color: gap >= 0 ? '#DC2626' : '#16A34A' }}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)} U</span>
                                            : <span className="font-mono" style={{ color: '#9CA3AF' }}>计算中...</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {(() => {
                                  // 合计用 livePrices 重算，与各行完全一致
                                  const orders = (sharedPoolInfo as any).orders ?? [];
                                  let totalGapLive = 0;
                                  let allKnown = true;
                                  for (const o of orders) {
                                    const oQty = Number(o.quantity ?? 0);
                                    const oPrincipal = Number(o.principal ?? 0);
                                    const oCoin = (o.coin || '').toUpperCase();
                                    const oLiveP = livePrices[oCoin] ?? (o.currentPrice !== null && o.currentPrice !== undefined ? Number(o.currentPrice) : null);
                                    if (oLiveP === null) { allKnown = false; continue; }
                                    const oFloatPnlT = oLiveP * oQty - oPrincipal;
                                    totalGapLive += oFloatPnlT - Number(o.pendingInterest ?? 0);
                                  }
                                  return (
                                    <div className="mt-2 pt-1.5 flex justify-between font-semibold" style={{ borderTop: '1px solid #E5E7EB' }}>
                                      <span style={{ color: '#374151' }}>合计缺口需求</span>
                                      {allKnown
                                        ? <span className="font-mono" style={{ color: totalGapLive >= 0 ? '#DC2626' : '#16A34A' }}>{totalGapLive >= 0 ? '+' : ''}{totalGapLive.toFixed(2)} U</span>
                                        : <span className="font-mono" style={{ color: '#9CA3AF' }}>计算中...</span>}
                                    </div>
                                  );
                                })()}
                              </>
                            ) : (
                              <div className="text-gray-400">加载中...</div>
                            )}
                          </div>

                          {/* ② 所有担保物汇总 */}
                          <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                            <div className="font-semibold mb-1.5" style={{ color: '#374151' }}>② 共享担保物汇总</div>
                            {sharedPoolInfo ? (
                              <>
                                <div className="space-y-1.5">
                                  {((sharedPoolInfo as any).orders ?? []).map((o: any) => (
                                    <div key={o.orderId}>
                                      {(o.collateralAssets ?? []).length === 0 ? (
                                        <div className="flex justify-between items-center">
                                          <span className="font-mono" style={{ color: '#374151' }}>{o.orderNo}</span>
                                          <span style={{ color: '#9CA3AF' }}>无担保物</span>
                                        </div>
                                      ) : (
                                        <div className="flex justify-between items-center">
                                          <span className="font-mono" style={{ color: '#374151' }}>{o.orderNo}</span>
                                          <span className="font-mono font-semibold" style={{ color: '#DC2626' }}>
                                            {o.collateralValue > 0 ? `+${o.collateralValue.toFixed(2)} U` : '+--- U'}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 pt-1.5 flex justify-between font-semibold" style={{ borderTop: '1px solid #E5E7EB' }}>
                                  <span style={{ color: '#374151' }}>合计担保物价值</span>
                                  <span className="font-mono" style={{ color: '#DC2626' }}>+{((sharedPoolInfo as any).totalCollateralValue ?? 0).toFixed(2)} U</span>
                                </div>
                              </>
                            ) : (
                              <div className="text-gray-400">加载中...</div>
                            )}
                          </div>

                          {/* ③ 差值：担保物 - 缺口需求 */}
                          {sharedPoolInfo && (() => {
                            // totalRequired 用 livePrices 重算，与第①部分完全一致
                            const orders = (sharedPoolInfo as any).orders ?? [];
                            let totalRequired = 0;
                            let allHaveGap = true;
                            for (const o of orders) {
                              const oQty = Number(o.quantity ?? 0);
                              const oPrincipal = Number(o.principal ?? 0);
                              const oCoin = (o.coin || '').toUpperCase();
                              const oLiveP = livePrices[oCoin] ?? (o.currentPrice !== null && o.currentPrice !== undefined ? Number(o.currentPrice) : null);
                              if (oLiveP === null) { allHaveGap = false; continue; }
                              const oFloatPnlR = oLiveP * oQty - oPrincipal;
                              totalRequired += oFloatPnlR - Number(o.pendingInterest ?? 0);
                            }
                            const totalColl = (sharedPoolInfo as any).totalCollateralValue ?? 0;
                            const diff = totalColl + totalRequired; // totalRequired 已带符号（负=缺口，正=盈余）
                            const totalBuyValue = (sharedPoolInfo as any).totalBuyValue ?? 0;
                            const marginRatio = totalBuyValue > 0 ? (diff / totalBuyValue) * 100 : null;
                            // 负数（担保不足）显绿色，正数（担保充足）显红色
                            const diffColor = diff < 0 ? '#16A34A' : '#DC2626';
                            const ratioColor = marginRatio === null ? '#9CA3AF' : (marginRatio < 0 ? '#16A34A' : '#DC2626');
                            return (
                              <>
                                <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                  <div className="font-semibold mb-1" style={{ color: '#374151' }}>③ 总计风险敞口</div>
                                  <div className="font-mono text-xs mb-1.5" style={{ color: '#6B7280' }}>担保物合计 + 净缺口合计</div>
                                  <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>
                                    {allHaveGap
                                      ? <>{totalColl.toFixed(2)} + ({totalRequired >= 0 ? '+' : ''}{totalRequired.toFixed(2)}) = <span className="font-bold text-sm" style={{ color: diffColor }}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} U</span></>
                                      : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                  </div>
                                </div>
                                <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                  <div className="font-semibold mb-1" style={{ color: '#374151' }}>④ 保证金比例</div>
                                  <div className="font-mono text-xs mb-1.5" style={{ color: '#6B7280' }}>风险敞口 ÷ 总订单买入价値</div>
                                  <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>
                                    {allHaveGap
                                      ? <>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} ÷ {totalBuyValue.toFixed(2)} = <span className="font-bold text-sm" style={{ color: ratioColor }}>{marginRatio !== null ? `${marginRatio >= 0 ? '+' : ''}${marginRatio.toFixed(2)}%` : '--'}</span></>
                                      : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                  </div>
                                  <div className="text-xs" style={{ color: '#9CA3AF' }}>总买入价値 {totalBuyValue.toFixed(2)} U（各订单买入价 × 数量之和，不随币价变动）</div>
                                </div>
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        /* 非共享订单：保留原有三段式计算说明 */
                        <>
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
                                  {collateralAssets.map((a: any, idx: number) => {
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
                            <div className="font-semibold mb-1" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>③ 风险敎口</div>
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
                        </>
                      )}
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
                {showExposureLoading
                  ? <span className="text-xs" style={{ color: '#9CA3AF' }}>计算中...</span>
                  : <span className="font-medium" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>
                      {isSufficient ? `+${effectiveExposure.toLocaleString(undefined, { maximumFractionDigits: 2 })} U` : `-${(Math.abs(effectiveExposure)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U`}
                    </span>
                }
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
      {$showParticipantsPanel === order.id && (
        <div className="px-4 pt-3 pb-3 border-t border-green-100">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold text-green-700 flex items-center gap-1">
              <Users2 className="w-3.5 h-3.5" />
              多视角订单参与方
            </div>
            {$participantsEditMode ? (
              <div className="flex gap-1">
                {$roleOptions.map(r => (
                  <button
                    key={r.value}
                    onClick={() => $handleAddParticipant(r.value)}
                    className="px-2 py-0.5 text-xs rounded-full font-medium border"
                    style={{ borderColor: r.color, color: r.color, backgroundColor: `${r.color}10` }}
                  >
                    +{r.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                onClick={() => $setParticipantsEditMode(true)}
                className="px-2.5 py-0.5 text-xs rounded-full font-medium border flex items-center gap-1"
                style={{ borderColor: '#059669', color: '#059669', backgroundColor: '#ECFDF5' }}
              >
                <Pencil className="w-3 h-3" />编辑
              </button>
            )}
          </div>
          {$participantsLoading ? (
            <div className="text-center py-3 text-xs text-gray-400">加载中...</div>
          ) : !$participantsEditMode ? (
            /* 只读态：展示已保存的参与方（成员、角色、利率%、收/付） */
            $participantsList.length === 0 ? (
              <div className="text-center py-3 text-xs text-gray-400 bg-gray-50 rounded-xl">暂无参与方配置</div>
            ) : (
              <div className="space-y-2">
                {$participantsList.map((p, idx) => {
                  const roleOpt = $roleOptions.find(r => r.value === p.role);
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
          ) : $participantsList.length === 0 ? (
            <div className="text-center py-3 text-xs text-gray-400 bg-gray-50 rounded-xl">
              暂无参与方配置，点击上方按钮添加
            </div>
          ) : (
            <div className="space-y-2">
              {$participantsList.map((p, idx) => {
                const roleOpt = $roleOptions.find(r => r.value === p.role)!;
                const rateNum = parseFloat(p.rate || '');
                const isNeg = isFinite(rateNum) && rateNum < 0;
                const absVal = isFinite(rateNum) ? Math.abs(rateNum) : '';
                const setRate = (nextAbs: string, neg: boolean) => {
                  const v = nextAbs.toString().trim();
                  if (v === '') {
                    $setParticipantsList(list => list.map((item, i) => i === idx ? { ...item, rate: '' } : item));
                    return;
                  }
                  const num = Math.abs(parseFloat(v) || 0);
                  const signed = neg ? -num : num;
                  $setParticipantsList(list => list.map((item, i) => i === idx ? { ...item, rate: String(signed) } : item));
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
                        const member = $ledgerMembers.find(m => m.userId === uid);
                        $setParticipantsList(list => list.map((item, i) => i === idx ? { ...item, userId: uid, displayName: member?.displayName || '' } : item));
                      }}
                      className="min-w-0 flex-1 px-1.5 py-1 text-xs border border-gray-200 rounded-md bg-white"
                    >
                      <option value={0}>选成员</option>
                      {$ledgerMembers.map(m => (
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
                      onClick={() => $setParticipantsList(list => list.filter((_, i) => i !== idx))}
                      className="p-0.5 text-gray-300 hover:text-red-400 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {$participantsEditMode && (
            <button
              onClick={() => $handleSaveParticipants(order.id)}
              disabled={$saveParticipantsMutation.isPending}
              className="mt-3 w-full py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}
            >
              {$saveParticipantsMutation.isPending ? '保存中...' : '保存参与方配置'}
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
          {isAdmin && (
          <button
            onClick={() => { $setShowPaymentPanel($showPaymentPanel === order.id ? null : order.id); $setPaymentForm(() => ({ amount: '', currency: 'U', exchangeRate: '7.0', payDate: new Date().toISOString().slice(0, 10), note: '' })); }}
            className="text-xs px-3 py-1 rounded-full font-medium"
            style={{ backgroundColor: '#EEF4FF', color: '#1A56DB' }}
          >
            {$showPaymentPanel === order.id ? '收起' : '+ 记录结息'}
          </button>
          )}
        </div>

        {$showPaymentPanel === order.id && (
          <div className="bg-blue-50 rounded-xl p-3 mb-3 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息金额 ({interestUnit})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={$paymentForm.amount}
                  onChange={e => $setPaymentForm((f: any) => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="如：500"
                  style={{ display: 'block', boxSizing: 'border-box' }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息日期</label>
                <div className="relative">
                  <button
                    onClick={() => $setShowPaymentDatePicker((v: boolean) => !v)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-left focus:outline-none"
                    style={{ backgroundColor: '#fff', color: $paymentForm.payDate ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                  >
                    {$paymentForm.payDate || '选择日期'}
                  </button>
                  {$showPaymentDatePicker && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => $setShowPaymentDatePicker(false)}>
                      <div className="bg-white rounded-xl shadow-2xl mx-4 w-full" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
                        <DatePicker value={$paymentForm.payDate} onChange={v => { $setPaymentForm((f: any) => ({ ...f, payDate: v })); $setShowPaymentDatePicker(false); }} />
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
                value={$paymentForm.note}
                onChange={e => $setPaymentForm((f: any) => ({ ...f, note: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="结息说明"
                style={{ display: 'block', boxSizing: 'border-box' }}
              />
            </div>
            <button
              onClick={() => {
                if (!$paymentForm.amount || parseFloat($paymentForm.amount) <= 0) { toast.error('请填写结息金额'); return; }
                $addPaymentMutation.mutate({ ledgerId, orderId: order.id, amount: parseFloat($paymentForm.amount), currency: $paymentForm.currency || 'U', exchangeRate: parseFloat($paymentForm.exchangeRate || '7.0'), payDate: $paymentForm.payDate || new Date().toISOString().slice(0, 10), note: $paymentForm.note || undefined });
              }}
              disabled={$addPaymentMutation.isPending}
              className="w-full py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
            >
              {$addPaymentMutation.isPending ? '提交中...' : '确认记录'}
            </button>
          </div>
        )}

        {$showPaymentPanel === order.id && Array.isArray($interestPayments) && $interestPayments.length > 0 && (
          <div className="space-y-1.5">
            {$interestPayments.map((p: any) => (
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
                        $deletePaymentMutation.mutate({ ledgerId, paymentId: p.id });
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
                  $updateMutation.mutate({ id: order.id, ledgerId, status: 'active' });
                  setShowStatusSheet(false);
                }}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: order.status === 'active' ? '#DCFCE7' : '#F3F4F6', color: order.status === 'active' ? '#16A34A' : '#374151' }}
              >
                持有中{order.status === 'active' ? '（当前）' : ''}
              </button>
              <button
                onClick={() => {
                  $updateMutation.mutate({ id: order.id, ledgerId, status: 'settled' });
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
                    $handleDelete(order.id);
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
    {/* 内部结清确认弹窗（仅当父组件未传入 onConfirmSettle 时使用） */}
    {onConfirmSettle === undefined && _intConfirmSettleId !== null && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => _intSetConfirmSettleId(null)}>
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative bg-white rounded-2xl p-6 mx-4 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
          <h3 className="text-base font-semibold text-gray-900 mb-2">确认结清订单</h3>
          <p className="text-sm text-gray-500 mb-1">结清后该订单利息将停止计算，状态变为「已结清」。</p>
          <p className="text-sm font-medium text-red-600 mb-5">此操作不可撤销，确定继续？</p>
          <div className="flex gap-3">
            <button onClick={() => _intSetConfirmSettleId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600">取消</button>
            <button
              onClick={() => {
                $updateMutation.mutate({ id: _intConfirmSettleId, ledgerId, status: 'settled' });
                _intSetConfirmSettleId(null);
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white"
            >确认结清</button>
          </div>
        </div>
      </div>
    )}
  </>);
}
// ===== END FunderOrderCard =====
