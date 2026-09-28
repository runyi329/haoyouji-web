// ===== FunderOrderCard 共享组件 =====
// @refresh reset
// 此文件由 FunderManagement.tsx 抽取，前后端统一使用此组件
// 禁止在此文件外重复定义 FunderOrderCard 组件
// @since FV0245（2026-06-25）之后的新订单使用此组件
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useOptionGreeks } from "@/hooks/useOptionGreeks";
import { RightMarginDetail } from "@/components/RightMarginDetail";
import { RightInterestDetail } from "@/components/RightInterestDetail";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, ChevronDown, Plus, Pencil, Trash2, User, TrendingUp, ChevronLeft as CalLeft, ChevronRight as CalRight, Users2, X, Copy } from "lucide-react";
import { toast } from "sonner";
import { formatFunderAnnualRate } from "@/lib/funderAnnualRate";
import { OrderCardImageDownload } from "@/components/OrderCardImageDownload";

// 以 SVG viewBox 的中心放置文本；无论父圆标缩放到何种尺寸，37 都保持几何居中。
function Linked37BadgeText() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="pointer-events-none absolute inset-0 h-full w-full">
      <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="700" letterSpacing="-0.65" fill="currentColor">37</text>
    </svg>
  );
}

// 所有说明类 ! / ? 与 37 标记使用同一套可缩放的中心定位，避免字体基线造成偏移。
function HelpMarkerText({ symbol }: { symbol: '!' | '?' }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className="pointer-events-none absolute inset-0 h-full w-full">
      <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="700" fill="currentColor">{symbol}</text>
    </svg>
  );
}

// 说明标记保持可辨识的蓝色字形，但使用很浅的底色，避免在订单数值之间抢占视觉焦点。
const SOFT_BLUE_INDICATOR_STYLE = {
  backgroundColor: '#EFF6FF',
  color: '#2563EB',
  border: '1px solid #DBEAFE',
} as const;

// 币种选项。数字币均由服务器行情扫描器实时拉取 USDT 现货报价。
export const COIN_OPTIONS = ['BTC', 'ETH', 'SOL', 'BNB', 'USDT', 'CNY', 'HYPE', 'TRUMP', 'PENGU', 'XPL', 'WLFI', 'AVAX', 'DOGE', 'XLM', 'TIA', 'EIGEN', 'FET', 'ADA', 'ZRO', 'WLD', 'LINK', 'POL', 'CRV', 'PLUME', 'PEPE', 'B2', 'MSTR', 'COIN', 'AAOI', 'HOOD', 'SLV', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'SPY', 'QQQ', 'NFLX', 'ORCL', 'TSM', 'AMD', 'CL', 'NG', 'CRCL', 'DRAM', 'MU', 'SKHYNIX', 'SEI', 'ASTER', 'SUI', 'AAVE', 'ONDO', 'LDO', 'ENA', 'ARKM', 'UNI', 'BZ'] as const;
export type CoinType = typeof COIN_OPTIONS[number];

export const STATUS_OPTIONS = [
  { value: 'active', label: '持有中' },
  { value: 'settled', label: '已结算' },
  { value: 'cancelled', label: '已取消' },
];

export const INTEREST_PAYMENT_OPTIONS = [
  { value: 'profit_post', label: '盈利后付' },
  { value: 'daily_post', label: '日付' },
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
  BNB: '#F3BA2F',
  HYPE: '#5C6BC0',
  TRUMP: '#D71920',
  PENGU: '#66C5E0',
  XPL: '#6B5CFF',
  WLFI: '#1F2937',
  AVAX: '#E84142',
  DOGE: '#C2A633',
  XLM: '#14B8A6',
  TIA: '#7C3AED',
  EIGEN: '#8B5CF6',
  FET: '#1A73E8',
  ADA: '#0033AD',
  ZRO: '#111111',
  WLD: '#111111',
  LINK: '#2A5ADA',
  POL: '#8247E5',
  CRV: '#406C9A',
  PEPE: '#479F53',
  B2: '#F59E0B',
  USDT: '#26A17B',
  CNY: '#DE2910',
  MSTR: '#F7931A',
  COIN: '#1652F0',
  AAOI: '#6D28D9',
  HOOD: '#00C805',
  SLV: '#8B95A5',
  TSLA: '#CC0000',
  NVDA: '#76B900',
  AAPL: '#555555',
  MSFT: '#00A4EF',
  SKHYNIX: '#EB1C24',
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
  SEI: '#9C1FFF',
  ASTER: '#00D4AA',
  SUI: '#4DA2FF',
  AAVE: '#B6509E',
  ONDO: '#1A1A2E',
  LDO: '#F68B1E',
  ENA: '#00C4B4',
  ARKM: '#FF6B00',
  UNI: '#FF007A',
  BZ: '#8B4513',
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

// 日期格式化：YYYY-MM-DD → YY.MM.DD（如 2026-07-06 → 26.07.06）
export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  const s = String(dateStr).slice(0, 10); // 取 YYYY-MM-DD 部分
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[0].slice(2)}.${parts[1]}.${parts[2]}`;
}

// 已结订单统一按北京时间显示结清时分秒，供卡片模式和订单模式共用。
export function formatSettledTimestamp(settledAt?: string | Date | null): string {
  if (!settledAt) return '';
  const date = new Date(settledAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '.');
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
export async function copyFunderNoteText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!copied) throw new Error('复制失败');
    }
    toast.success('备注已复制');
  } catch {
    toast.error('复制失败，请长按备注复制');
  }
}
export function NoteAvatar({ name, avatar }: { name?: string; avatar?: string }) {
  if (avatar) return <img src={avatar} alt={name || ''} className="w-5 h-5 rounded-full object-cover shrink-0" style={{ border: '1px solid #E0E7FF' }} />;
  if (!name) return <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center" style={{ backgroundColor: '#E5E7EB' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>;
  const initials = name.slice(0, 1).toUpperCase();
  const colors = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
  const color = colors[name.charCodeAt(0) % colors.length] || '#6366F1';
  return <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: color }}>{initials}</div>;
}
export function FunderNoteRow({ orderId, ledgerId, initialNote, onSaved, currentUser, isAdmin, membersData, participantUserId, isSettled = false }: { orderId: number; ledgerId: number; initialNote: string; onSaved: (note: string) => void; currentUser?: { id: number; name?: string; username?: string; avatar?: string }; isAdmin?: boolean; membersData?: any[]; participantUserId?: number; isSettled?: boolean }) {
  const [notes, setNotes] = useState<NoteItem[]>(() => parseNotes(initialNote));
  const [expanded, setExpanded] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setNotes(parseNotes(initialNote));
    setEditingIdx(null);
    setEditValue('');
  }, [initialNote, participantUserId]);
  const updateNote = trpc.ledger.funderUpdatePublicNote.useMutation();
  const canEdit = (note: NoteItem) => isAdmin || (currentUser && note.userId && note.userId === currentUser.id);
  const saveNotes = async (newNotes: NoteItem[]) => {
    setSaving(true);
    try {
      const raw = JSON.stringify(newNotes);
      await updateNote.mutateAsync({ id: orderId, ledgerId, publicNote: raw, participantUserId });
      setNotes(newNotes);
      onSaved(raw);
    } finally { setSaving(false); }
  };
  const handleSaveEdit = async (idx: number) => {
    if (isSettled || !editValue.trim()) return;
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
    if (isSettled) return;
    await saveNotes(notes.filter((_, i) => i !== idx));
  };
  return (
    <div className="text-xs" onClick={e => e.stopPropagation()}>
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
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => copyFunderNoteText(note.text)} className="p-0.5" title="复制备注">
                          <Copy className="w-[11px] h-[11px]" style={{ color: '#9CA3AF' }} />
                        </button>
                        {!isSettled && canEdit(note) && (
                          <>
                            <button onClick={() => { setEditingIdx(idx); setEditValue(note.text); }} className="p-0.5" title="编辑">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button onClick={() => handleDelete(idx)} className="p-0.5" title="删除">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          </>
                        )}
                      </div>
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
export const INTEGER_COINS_FUNDER = new Set(['SUI', 'ONDO', 'LDO', 'ENA', 'ARKM', 'AAVE']);
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
    // 统一使用北京时间（+08:00），避免服务器时区差异
    const startDay = new Date(interestStartDate + 'T00:00:00+08:00').getTime();
    if (isNaN(startDay)) return 0;
    const endTs = settledAt ? new Date(settledAt).getTime() : Date.now();
    // 按北京时间自然日计天：开始日期当天算1天，每过零点+1天
    const endDateStr = new Date(endTs + 8 * 3600 * 1000).toISOString().slice(0, 10);
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

/** 共同拥有者才会看到的协作信息入口；详情严格由服务端按该拥有者的可见范围裁剪。 */
export function OwnerCollaborationInfoButton({ order, ledgerId }: { order: any; ledgerId: number }) {
  const [open, setOpen] = useState(false);
  const ownerView = (order as any)?.participantInfo?.role === 'owner';
  const viewerUserId = Number((order as any)?.participantInfo?.userId || (order as any)?.participantInfo?.user_id || 0);
  const orderId = Number(order?.id || 0);
  const infoQuery = trpc.ledger.funderGetOwnerCollaborationInfo.useQuery(
    { orderId, ledgerId, ...(viewerUserId > 0 ? { viewerUserId } : {}) },
    { enabled: open && ownerView && orderId > 0 && ledgerId > 0, staleTime: 0 }
  );
  if (!ownerView || orderId <= 0) return null;
  const data: any = infoQuery.data;
  const modeLabel: Record<string, string> = {
    self: '仅本人金额', total: '订单总额', breakdown: '总额及拥有者明细', partners: '指定合作人',
  };
  return <>
    <button type="button" onClick={(event) => { event.stopPropagation(); setOpen(true); }} aria-label="查看订单其他信息"
      className="relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full font-bold"
      style={{ color: '#fff', background: '#3B82F6' }}><HelpMarkerText symbol="!" /></button>
    {open && (
      <div className="fixed inset-0 z-[650] flex items-end justify-center bg-black/45 sm:items-center" onClick={() => setOpen(false)}>
        <div className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl" onClick={event => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><h3 className="text-base font-semibold text-gray-900">订单其他信息</h3><p className="mt-0.5 text-xs text-gray-400">仅按当前拥有者的授权范围显示</p></div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-gray-100 p-2 text-gray-500" aria-label="关闭"><X className="h-4 w-4" /></button>
          </div>
          {infoQuery.isLoading ? <div className="py-10 text-center text-sm text-gray-400">加载中…</div>
            : !data?.configured ? <div className="rounded-xl bg-gray-50 px-3 py-5 text-center text-sm text-gray-500">暂未配置共同拥有者视图。</div>
            : <div className="space-y-3">
              <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3 text-xs"><span className="text-violet-700">可见范围</span><span className="font-medium text-violet-800">{modeLabel[data.mode] || '仅本人金额'}</span></div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs"><span className="text-violet-700">共同拥有者</span><span className="font-medium text-violet-800">{data.ownerCount} 人</span></div>
              </div>
              {(data.totalByCurrency || []).length > 0 && data.mode !== 'self' && <div className="rounded-xl border border-gray-100 px-3 py-2.5"><div className="mb-1.5 text-xs font-medium text-gray-500">订单总体本金</div><div className="flex flex-wrap gap-x-4 gap-y-1">{data.totalByCurrency.map((total: any) => <span key={total.currency} className="text-sm font-semibold tabular-nums text-gray-800">{Number(total.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {total.currency === 'CNY' ? '元' : 'U'}</span>)}</div></div>}
              {data.mode === 'self' && <div className="rounded-xl border border-gray-100 px-3 py-3 text-sm text-gray-500">当前设置仅显示本人独立订单数据；其他拥有者的金额不会显示。</div>}
              {(data.visibleOwners || []).length > 0 && <div className="rounded-xl border border-gray-100 px-3 py-2.5"><div className="mb-2 text-xs font-medium text-gray-500">获授权可见的拥有者</div><div className="space-y-2">{data.visibleOwners.map((owner: any) => <div key={owner.userId} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-gray-700">{owner.name}{owner.userId === viewerUserId ? '（本人）' : ''}</span><span className="shrink-0 font-semibold tabular-nums text-gray-800">{Number(owner.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {owner.amountCurrency === 'CNY' ? '元' : 'U'}</span></div>)}</div></div>}
              <p className="px-1 text-[11px] leading-5 text-gray-400">不展示其他拥有者的备注、担保物、钱包及结息流水。结算后，本订单仍保留完整历史记录。</p>
            </div>}
        </div>
      </div>
    )}
  </>;
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
  handleOpenEdit?: (order: any, scrollTo?: string) => void;
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
  // 弹窗状态（提升到父组件，防止子组件重渲染时 state 被重置）
  showCollateralInfo?: boolean;
  setShowCollateralInfo?: (v: boolean) => void;
  showInterestTip?: boolean;
  setShowInterestTip?: (v: boolean) => void;
  showMarginInfo?: boolean;
  setShowMarginInfo?: (v: boolean) => void;
  /** 预览模式：隐藏底部操作栏、公开备注区、状态操作弹窗 */
  previewMode?: boolean;
  /** 共享担保弹窗点击订单号时，用于查找完整订单数据 */
  allOrders?: any[];
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
  showCollateralInfo: _propShowCollateralInfo,
  setShowCollateralInfo: _propSetShowCollateralInfo,
  showInterestTip: _propShowInterestTip,
  setShowInterestTip: _propSetShowInterestTip,
  showMarginInfo: _propShowMarginInfo,
  setShowMarginInfo: _propSetShowMarginInfo,
  previewMode = false,
  allOrders,
}: FunderOrderCardProps) {
  const cardExportRef = useRef<HTMLDivElement>(null);
  // 共享担保弹窗：点击订单号弹出第二层订单详情
  const [clickedOrderNo, setClickedOrderNo] = useState<string | null>(null);
  // clickedOrder: 延迟计算，在 sharedPoolInfo 声明之后（见下方 clickedOrderResolved）
  // ===== 内部 fallback：当父组件未传入对应 props 时，组件自己管理 state 和 mutation =====
  const trpcUtils = trpc.useUtils();
  // 结息面板
  const [_intShowPayment, _intSetShowPayment] = useState<number | null>(null);
  const [_intPaymentForm, _intSetPaymentForm] = useState({ amount: '', currency: 'U' as 'CNY' | 'U', exchangeRate: '6.75', payDate: new Date().toISOString().slice(0, 10), note: '' });
  const [_intEditingPaymentId, _intSetEditingPaymentId] = useState<number | null>(null);
  const [_intShowPaymentDatePicker, _intSetShowPaymentDatePicker] = useState(false);
  const [showPeriodStartPicker, setShowPeriodStartPicker] = useState(false);
  const [showPeriodEndPicker, setShowPeriodEndPicker] = useState(false);
  // 参与方面板
  const [_intShowParticipants, _intSetShowParticipants] = useState<number | null>(null);
  const [_intParticipantsList, _intSetParticipantsList] = useState<{ userId: number; displayName: string; role: string; sortOrder: number; rate: string }[]>([]);
  const [_intLedgerMembers, _intSetLedgerMembers] = useState<{ userId: number; displayName: string; memberRole?: string }[]>([]);
  const [_intParticipantsLoading, _intSetParticipantsLoading] = useState(false);
  const [_intParticipantsEditMode, _intSetParticipantsEditMode] = useState(false);
  // 结清确认
  const [_intConfirmSettleId, _intSetConfirmSettleId] = useState<number | null>(null);
  const [_intSettleInterestEndDate, _intSetSettleInterestEndDate] = useState('');
  // 结息面板：利息约等于快捷配置
  const [interestApproxConfig, setInterestApproxConfig] = useState<{ approxInterest: string; approxPaid: string }>({ approxInterest: 'U', approxPaid: 'U' });
  const _intSaveInterestApproxMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: () => { toast.success('显示设置已保存'); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  const _intSaveParticipantDisplayMutation = trpc.ledger.funderUpdateParticipantOrder.useMutation({
    onSuccess: () => { toast.success('参与者显示设置已保存'); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  // 已结利息历史浮层
  const [showInterestHistory, setShowInterestHistory] = useState(false);
  const [linkedInterestDetailKind, setLinkedInterestDetailKind] = useState<'pending' | 'paid' | null>(null);
  const [showManualStockPnlDetail, setShowManualStockPnlDetail] = useState(false);
  // 共同拥有者会带 participantInfo 以支持独立快照，但主订单拥有者仍是主单的管理视角。
  // 结息与担保保存的参与者作用域只用于“非主拥有者”的协作视角：共同拥有者、历史参与者都独立；
  // 主拥有者自动补齐的 owner 关系仍沿用主订单流水，避免保存后被查到另一个空作用域。
  const _collaboratorRole = String((order as any).participantInfo?.role || '');
  const _collaboratorUserId = Number((order as any).participantInfo?.userId || (order as any).participantInfo?.user_id || 0);
  const _parentOwnerUserId = Number((order as any).user_id || 0);
  const _hasCollaboratorView = !!(order as any).participantInfo || !!(order as any)._isParticipant || !!(order as any)._fromFunder;
  const _isParticipantOrder = _hasCollaboratorView
    && _collaboratorUserId > 0
    && (_collaboratorUserId !== _parentOwnerUserId || _collaboratorRole !== 'owner');
  const _participantUserId = _isParticipantOrder ? _collaboratorUserId : undefined;
  const interestHistoryQuery = trpc.ledger.funderGetInterestPayments.useQuery(
    { ledgerId, orderId: order.id as number, participantUserId: _participantUserId },
    { enabled: showInterestHistory, staleTime: 0 }
  );
  // 内部 mutations
  const _intUpdateMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: (result, vars) => {
      const syncedCount = Number((result as any)?.participantCount || 0);
      if (vars.status === 'settled') {
        toast.success(syncedCount > 0 ? `主订单及 ${syncedCount} 位参与者已同步结清` : '订单已结清');
      } else if (vars.status === 'active') {
        toast.success(syncedCount > 0 ? `主订单及 ${syncedCount} 位参与者已同步恢复` : '订单已恢复为持有中');
      } else {
        toast.success('更新成功');
      }
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
    },
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
    { ledgerId, orderId: _activeShowPaymentPanelForQuery!, participantUserId: _participantUserId },
    { enabled: _activeShowPaymentPanelForQuery === order.id && (_participantUserId !== undefined || interestPayments === undefined) }
  );
  const _intAddPaymentMutation = trpc.ledger.funderAddInterestPayment.useMutation({
    onSuccess: () => { toast.success('结息记录已添加'); _intSetPaymentForm({ amount: '', currency: 'U', exchangeRate: String(cnyRate || 6.75), payDate: new Date().toISOString().slice(0, 10), note: '' }); _intRefetchPayments(); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  const _intDeletePaymentMutation = trpc.ledger.funderDeleteInterestPayment.useMutation({
    onSuccess: () => { toast.success('结息记录已删除'); _intRefetchPayments(); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  const _intUpdatePaymentMutation = trpc.ledger.funderUpdateInterestPayment.useMutation({
    onSuccess: () => { toast.success('结息记录已更新'); setEditPaymentId(null); _intRefetchPayments(); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  // 编辑结息记录的内联表单状态
  const [editPaymentId, setEditPaymentId] = useState<number | null>(null);
  const [editPaymentForm, setEditPaymentForm] = useState<{ amount: string; currency: 'CNY' | 'U'; exchangeRate: string; payDate: string; note: string; periodStart: string; periodEnd: string }>({ amount: '', currency: 'U', exchangeRate: '6.75', payDate: '', note: '', periodStart: '', periodEnd: '' });
  const [showEditStartPicker, setShowEditStartPicker] = useState(false);
  const [showEditEndPicker, setShowEditEndPicker] = useState(false);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  // 结息操作日志
  const [showInterestLog, setShowInterestLog] = useState(false);
  const interestLogQuery = trpc.ledger.financeGetOrderLogs.useQuery(
    { ledgerId, orderId: order.id, actionTypes: ['interest_update', 'interest_delete', 'interest_add'] },
    { enabled: showInterestLog }
  );
  // 内部 handleOpenParticipants
  const _intHandleOpenParticipants = async (orderId: number, _orderInterestBase: string) => {
    if (_intShowParticipants === orderId) { _intSetShowParticipants(null); return; }
    _intSetShowParticipants(orderId);
    _intSetParticipantsLoading(true);
    try {
      const result = await trpcUtils.ledger.funderGetOrderParticipants.fetch({ orderId, ledgerId });
      const mapped = (result.participants || []).map((p: any) => ({ userId: p.user_id, displayName: p.nickname || p.user_nickname || p.username || p.userName || `用户${p.user_id}`, role: p.role, sortOrder: p.sort_order || 0, rate: (p.commission_rate != null && p.commission_rate !== '') ? String(p.commission_rate) : (p.rate != null ? String(p.rate) : '') }));
      _intSetParticipantsList(mapped);
      _intSetParticipantsEditMode(mapped.length === 0);
      const mappedMembers = (result.members || []).map((m: any) => ({ userId: m.userId, displayName: m.nickname || m.user_nickname || m.username || m.userName || `用户${m.userId}`, memberRole: m.memberRole }));
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
  const { data: _cnyRateData } = trpc.exchange.getRate.useQuery(
    { fromcoin: "USD", tocoin: "CNY", money: 1 },
    { staleTime: 30000, refetchInterval: 30000, refetchIntervalInBackground: false }
  );
  const cnyRate = parseFloat((_cnyRateData as any)?.money ?? "6.8") || 6.8;
  // 共享担保池按当前视角用户隔离：参与者使用参与者自己的池，拥有者使用主订单拥有者的池。
  const orderShareMode = (order as any).collateral_share_mode;
  const sharedCollateralViewUserId = _participantUserId ?? Number(order.user_id);
  const { data: sharedPoolInfo } = trpc.ledger.funderGetSharedCollateralPool.useQuery(
    { ledgerId, userId: sharedCollateralViewUserId },
    {
      enabled: ledgerId > 0 && orderShareMode === 'self',
      staleTime: 5000,
      refetchInterval: 15000,
      refetchIntervalInBackground: false,
    }
  );
  // 订单模式共享担保弹窗：点击订单号后打开订单详情（先从 allOrders 找，找不到则从 sharedPoolInfo 构造）
  const clickedOrder = clickedOrderNo ? (
    (allOrders ?? []).find((o: any) => o.order_no === clickedOrderNo)
    || (() => {
      const poolOrder = ((sharedPoolInfo as any)?.orders ?? []).find((o: any) => o.orderNo === clickedOrderNo);
      if (!poolOrder) return null;
      return {
        id: poolOrder.orderId,
        order_no: poolOrder.orderNo,
        coin: poolOrder.coin,
        amount: poolOrder.principal,
        buy_price: poolOrder.buyPrice,
        buy_quantity: poolOrder.quantity,
        interest_base: poolOrder.principal,
        interest_rate_annual: 0,
        collateral_assets: JSON.stringify(poolOrder.collateralAssets ?? []),
        collateral_share_mode: poolOrder.shareMode || 'self',
        principal_lent_out: poolOrder.principalLentOut ? 1 : 0,
        asset_type: poolOrder.assetType || 'crypto',
        status: 'active',
        user_id: sharedCollateralViewUserId,
        ledger_id: ledgerId,
      };
    })()
  ) : null;
  // 解析37号数据来源。盈亏、担保、待结利息、已结利息标签均可分别选择；旧订单只存tagName时兼容回退。
  const _parsedCollateralSource = useMemo(() => {
    try {
      const cs = (order as any).collateral_source;
      if (!cs) return null;
      const parsed = typeof cs === 'string' ? JSON.parse(cs) : cs;
      if (parsed && parsed.tagName && (parsed.ledgerId || parsed.stockPnlSource === 'manual_positions')) return parsed as {
        ledgerId: number; tagName: string; floatingPnlTagName?: string;
        floatingPnlCalculationMode?: 'raw_net_pnl' | 'initial_minus_latest' | 'leveraged_net_pnl'; collateralTagName?: string;
        pendingInterestTagName?: string; paidInterestTagName?: string; interestTagName?: string;
        useFloatingPnl?: boolean; useCollateral?: boolean; usePendingInterest?: boolean; usePaidInterest?: boolean; useInterest?: boolean;
        stockPnlSource?: 'manual_positions'; stockPnlCalculationMode?: 'position_cost' | 'total_capital'; stockTotalCapital?: string | number; stockCapitalCurrency?: 'CNY' | 'USD'; stockPnlCoefficient?: number; stockPositions?: Array<{ name?: string; symbol?: string; buyPrice?: string; sellPrice?: string; quantity?: string; latestPrice?: string; latestPriceDate?: string; latestPriceUpdatedAt?: string; initialPrice?: string; initialPriceDate?: string }>;
      };
    } catch {}
    return null;
  }, [(order as any).collateral_source]);
  const sourceIsLedger37 = Number(_parsedCollateralSource?.ledgerId) === 37;
  const linkedPnlTagName = _parsedCollateralSource?.floatingPnlTagName
    || (sourceIsLedger37 && _parsedCollateralSource?.useFloatingPnl !== false ? _parsedCollateralSource?.tagName : '');
  // 未配置时按新版默认的“今日余额 − 初始金额”处理；倍数后的净值盈亏仅在管理员显式选择后使用。
  const floatingPnlCalculationMode = _parsedCollateralSource?.floatingPnlCalculationMode === 'leveraged_net_pnl'
    ? 'leveraged_net_pnl'
    : 'raw_net_pnl';
  const linkedCollateralTagName = _parsedCollateralSource?.collateralTagName
    || (sourceIsLedger37 && _parsedCollateralSource?.useCollateral !== false ? _parsedCollateralSource?.tagName : '');
  // 待结、已结利息必须显式选择。旧 interestTagName/useInterest 仅兼容为“已结引用”，
  // 不会在升级后被误解为待结利息来源。
  const linkedPendingInterestTagName = _parsedCollateralSource?.pendingInterestTagName
    || (sourceIsLedger37 && _parsedCollateralSource?.usePendingInterest === true ? _parsedCollateralSource?.tagName : '');
  const linkedPaidInterestTagName = _parsedCollateralSource?.paidInterestTagName
    || _parsedCollateralSource?.interestTagName
    || (sourceIsLedger37 && (_parsedCollateralSource?.usePaidInterest === true || _parsedCollateralSource?.useInterest === true) ? _parsedCollateralSource?.tagName : '');
  const hasExternalPendingInterest = Number(_parsedCollateralSource?.ledgerId) === 37 && !!linkedPendingInterestTagName;
  const hasExternalPaidInterest = Number(_parsedCollateralSource?.ledgerId) === 37 && !!linkedPaidInterestTagName;
  const hasExternalInterest = hasExternalPendingInterest || hasExternalPaidInterest;
  const hasExternalDataSource = !!(linkedPnlTagName || linkedCollateralTagName || linkedPendingInterestTagName || linkedPaidInterestTagName);
  const hasExternalCollateral = !!linkedCollateralTagName;
  const manualStockPnlCalculationMode = _parsedCollateralSource?.stockPnlCalculationMode === 'total_capital'
    ? 'total_capital'
    : 'position_cost';
  const manualStockTotalCapital = Number(_parsedCollateralSource?.stockTotalCapital);
  const manualStockCapitalCurrency = String(_parsedCollateralSource?.stockCapitalCurrency || '').toUpperCase() === 'USD' ? 'USD' : 'CNY';
  const hasManualStockTotalCapital = Number.isFinite(manualStockTotalCapital) && manualStockTotalCapital > 0;
  const manualStockPositions = useMemo(() => Array.isArray(_parsedCollateralSource?.stockPositions)
    ? _parsedCollateralSource.stockPositions
      .map((position) => ({
        name: String(position?.name || '').trim().slice(0, 48),
        symbol: String(position?.symbol || '').trim().toUpperCase(),
        buyPrice: Number(position?.buyPrice),
        sellPrice: position?.sellPrice === '' || position?.sellPrice === null || position?.sellPrice === undefined ? null : Number(position.sellPrice),
        quantity: Number(position?.quantity),
        // 兼容刚上线阶段已存的 initialPrice：仅作为没有盘尾快照前的首笔最新价兜底。
        latestPrice: Number(position?.latestPrice ?? position?.initialPrice),
        latestPriceDate: String(position?.latestPriceDate || position?.initialPriceDate || ''),
        latestPriceUpdatedAt: String(position?.latestPriceUpdatedAt || ''),
      }))
      .filter((position) => /^[A-Z][A-Z0-9.\-]{0,14}$|^\d{6}\.(?:SH|SZ|BJ)$/.test(position.symbol))
      .filter((position) => (manualStockPnlCalculationMode === 'total_capital' || (Number.isFinite(position.buyPrice) && position.buyPrice > 0)) && (position.sellPrice === null || (Number.isFinite(position.sellPrice) && position.sellPrice > 0)) && Number.isFinite(position.quantity) && position.quantity > 0)
    : [], [_parsedCollateralSource, manualStockPnlCalculationMode]);
  const isManualStockPnlSource = (order as any).asset_type === 'stock'
    && _parsedCollateralSource?.stockPnlSource === 'manual_positions'
    && manualStockPositions.length > 0
    && (manualStockPnlCalculationMode !== 'total_capital' || hasManualStockTotalCapital);
  // 系数作用于组合的原始盈亏合计，而非逐只股票；缺省/历史订单始终按 1 倍兼容。
  const manualStockPnlCoefficient = useMemo(() => {
    const coefficient = Number(_parsedCollateralSource?.stockPnlCoefficient);
    return Number.isFinite(coefficient) && coefficient > 0 && coefficient <= 100000 ? coefficient : 1;
  }, [_parsedCollateralSource]);
  const manualStockSymbols = useMemo(() => manualStockPositions.map((position) => position.symbol), [manualStockPositions]);
  const manualStockCloseQuery = (trpc as any).getManualStockCloseSnapshots.useQuery(
    { symbols: manualStockSymbols },
    { enabled: isManualStockPnlSource && manualStockSymbols.length > 0, staleTime: 60_000, refetchInterval: 60_000, refetchIntervalInBackground: false },
  );

  // 两个标签独立查询：盈亏只读净值，担保只读逐笔保证金；若选了同一标签，数据口径仍相同。
  const { data: _pnlTagConfig } = trpc.ledger.getTagConfig.useQuery(
    { ledgerId: _parsedCollateralSource?.ledgerId ?? 0, tagName: linkedPnlTagName || '' },
    { enabled: !!linkedPnlTagName, staleTime: 3000 }
  );
  const { data: _pnlTagSummary } = (trpc.ledger as any).getTagSummary.useQuery(
    { ledgerId: _parsedCollateralSource?.ledgerId ?? 0, tagName: linkedPnlTagName || '' },
    { enabled: !!linkedPnlTagName, staleTime: 3000 }
  );
  const { data: _collateralTagConfig } = trpc.ledger.getTagConfig.useQuery(
    { ledgerId: _parsedCollateralSource?.ledgerId ?? 0, tagName: linkedCollateralTagName || '' },
    { enabled: !!linkedCollateralTagName, staleTime: 3000 }
  );
  const { data: _collateralTagSummary } = (trpc.ledger as any).getTagSummary.useQuery(
    { ledgerId: _parsedCollateralSource?.ledgerId ?? 0, tagName: linkedCollateralTagName || '' },
    { enabled: !!linkedCollateralTagName, staleTime: 3000 }
  );
  // 与 RightInterestDetail 共用同一份标签分段；待结、已结分别拉取，允许引用不同标签。
  const { data: _linkedPendingInterestPeriods } = (trpc.ledger as any).getTagInterestPeriods.useQuery(
    { ledgerId: _parsedCollateralSource?.ledgerId ?? 0, tagName: linkedPendingInterestTagName },
    { enabled: hasExternalPendingInterest, staleTime: 3000 }
  );
  const { data: _linkedPaidInterestPeriods } = (trpc.ledger as any).getTagInterestPeriods.useQuery(
    { ledgerId: _parsedCollateralSource?.ledgerId ?? 0, tagName: linkedPaidInterestTagName },
    { enabled: hasExternalPaidInterest, staleTime: 3000 }
  );
  const { data: _pendingInterestTagConfig } = trpc.ledger.getTagConfig.useQuery(
    { ledgerId: _parsedCollateralSource?.ledgerId ?? 0, tagName: linkedPendingInterestTagName || '' },
    { enabled: hasExternalPendingInterest, staleTime: 3000 }
  );
  const { data: _extCryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    enabled: hasExternalDataSource, refetchInterval: 3000, staleTime: 0,
  });
  // 读取两份独立数据：担保标签的逐笔保证金总值、盈亏标签的净值盈亏。
  // 52订单的利息和借出本金不属于37号标签，仍在风险公式中另行处理。
  const { extCollateralValueU: extTagCollateralValueU, extFloatingPnlU: extTagFloatingPnlU } = useMemo(() => {
    const _cnyR = (_extCryptoPricesRaw as any)?.usdtCnyRate ?? 7.0;
    const _pricesMap = (_extCryptoPricesRaw as any)?.prices ?? {};
    const _prices: Record<string, number> = {};
    for (const [k, v] of Object.entries(_pricesMap)) { _prices[k] = Number(v) * _cnyR; }
    _prices['USDT'] = _cnyR;
    _prices['CNY'] = 1;
    const _toCNY = (m: string | number, coin: string) => {
      const n = typeof m === 'number' ? m : parseFloat(m as string);
      if (isNaN(n) || n === 0) return 0;
      const normalizedCoin = String(coin || 'CNY').trim().toUpperCase();
      if (['CNY', 'RMB', '人民币', '元'].includes(normalizedCoin)) return n;
      return n * (_prices[normalizedCoin] ?? 0);
    };
    const marginTotalCny = (() => {
      if (!linkedCollateralTagName || !_collateralTagConfig || _cnyR <= 0) return null;
      try {
        const summaryMargins = (_collateralTagSummary as any)?.marginByCoin;
        const configuredMargins = typeof (_collateralTagConfig as any).margin_by_coin === 'string'
          ? JSON.parse((_collateralTagConfig as any).margin_by_coin)
          : (_collateralTagConfig as any).margin_by_coin;
        const hasConfiguredMargins = Array.isArray(configuredMargins)
          ? configuredMargins.length > 0
          : !!configuredMargins && typeof configuredMargins === 'object' && Object.keys(configuredMargins).length > 0;
        const rawMargins = hasConfiguredMargins ? configuredMargins : summaryMargins;
        const items = Array.isArray(rawMargins)
          ? rawMargins.map((e: any) => ({ coin: e.coin || '元', amount: Number(e.amount) }))
          : Object.entries(rawMargins ?? {}).map(([coin, amount]) => ({ coin, amount: Number(amount) }));
        return items.reduce((sum: number, item: any) => sum + _toCNY(item.amount, item.coin), 0);
      } catch { return null; }
    })();
    const floatingPnlCny = (() => {
      if (!linkedPnlTagName || !_pnlTagConfig || _cnyR <= 0) return null;
      const latestBalance = (_pnlTagSummary as any)?.latestBalance?.balance;
      const balanceNum = latestBalance === undefined || latestBalance === null || latestBalance === '' ? null : Number(latestBalance);
      if (balanceNum === null || !Number.isFinite(balanceNum)) return null;
      const initialNum = Number((_pnlTagConfig as any).initial_amount || 0) || 0;
      const multiplierNum = Number((_pnlTagConfig as any).account_multiplier || 1) || 1;
      return floatingPnlCalculationMode === 'leveraged_net_pnl'
        ? (balanceNum - initialNum) * multiplierNum
        : balanceNum - initialNum;
    })();
    return {
      extCollateralValueU: marginTotalCny === null ? null : marginTotalCny / _cnyR,
      extFloatingPnlU: floatingPnlCny === null ? null : floatingPnlCny / _cnyR,
    };
  }, [linkedPnlTagName, linkedCollateralTagName, floatingPnlCalculationMode, _pnlTagConfig, _pnlTagSummary, _collateralTagConfig, _collateralTagSummary, _extCryptoPricesRaw]);

  // 绑定 37 号账本标签时，担保物必须以该标签内逐笔保证金为唯一来源。
  // 这里与 RightMarginDetail 的展示口径一致：保留各币种净额，再按当前汇率汇总为 U / 人民币；
  // 不把订单上的历史手填 collateral_assets 与第三方标签重复相加。
  const externalCollateralSummary = useMemo(() => {
    const empty = { entries: [] as Array<{ coin: string; amount: number }>, totalCny: null as number | null, totalU: null as number | null, currencyLabel: '' };
    if (!hasExternalCollateral || !_collateralTagConfig) return empty;
    let entries: Array<{ coin: string; amount: number }> = [];
    try {
      // 与37标签详情/剩余保证金同口径：逐笔标签配置优先，成员汇总仅兼容老标签。
      const summaryMargins = (_collateralTagSummary as any)?.marginByCoin;
      const configuredMargins = (typeof (_collateralTagConfig as any).margin_by_coin === 'string')
        ? JSON.parse((_collateralTagConfig as any).margin_by_coin)
        : (_collateralTagConfig as any).margin_by_coin;
      const hasConfiguredMargins = Array.isArray(configuredMargins)
        ? configuredMargins.length > 0
        : !!configuredMargins && typeof configuredMargins === 'object' && Object.keys(configuredMargins).length > 0;
      const raw = hasConfiguredMargins
        ? configuredMargins
        : summaryMargins;
      entries = Array.isArray(raw)
        ? raw.map((item: any) => ({ coin: String(item?.coin ?? '元').trim() || '元', amount: Number(item?.amount) }))
        : Object.entries(raw ?? {}).map(([coin, amount]) => ({ coin: String(coin).trim() || '元', amount: Number(amount) }));
      entries = entries.filter(item => Number.isFinite(item.amount) && item.amount !== 0);
    } catch {
      return empty;
    }
    const rate = Number((_extCryptoPricesRaw as any)?.usdtCnyRate ?? cnyRate) || cnyRate;
    const prices = (_extCryptoPricesRaw as any)?.prices ?? {};
    const toCny = (coin: string, amount: number) => {
      const normalized = coin.toUpperCase();
      if (['元', '人民币', 'CNY', 'RMB'].includes(normalized)) return amount;
      if (['USDT', 'USDC', 'BUSD', 'DAI', 'U'].includes(normalized)) return amount * rate;
      const priceU = Number(prices[normalized] ?? prices[coin] ?? 0);
      return priceU > 0 ? amount * priceU * rate : null;
    };
    let totalCny = 0;
    let allKnown = true;
    for (const entry of entries) {
      const value = toCny(entry.coin, entry.amount);
      if (value === null) allKnown = false;
      else totalCny += value;
    }
    const netByCoin = entries.reduce((acc, item) => {
      const label = ['CNY', 'RMB', '人民币'].includes(item.coin.toUpperCase()) ? '元' : item.coin.toUpperCase();
      acc[label] = (acc[label] ?? 0) + item.amount;
      return acc;
    }, {} as Record<string, number>);
    const currencyLabel = Object.entries(netByCoin)
      .filter(([, amount]) => Math.abs(amount) > 0.0000001)
      .map(([coin, amount]) => `${amount >= 0 ? '+' : ''}${amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${coin}`)
      .join(' · ');
    return { entries, totalCny: allKnown ? totalCny : null, totalU: allKnown && rate > 0 ? totalCny / rate : null, currencyLabel };
  }, [hasExternalCollateral, _collateralTagConfig, _collateralTagSummary, _extCryptoPricesRaw, cnyRate]);

  // 37号标签同时记录“应收”和“已付”：普通自动分段与手工加息都属于待结，
  // 只有负数手工分段（37页的“计入已付”）才是52号订单可引用的已结利息。
  // 两者均不读取37号页面的净欠息/上欠，避免把已付后的余额错显示成任一独立字段。
  const linked37PendingInterestCny = useMemo(() => {
    if (!hasExternalPendingInterest) return null;
    if (!Array.isArray(_linkedPendingInterestPeriods)) return null;
    const pauseDate = (_pendingInterestTagConfig as any)?.pause_date || null;
    const calcPeriodDays = (startDate: unknown, endDate: unknown) => {
      const startText = String(startDate || '').slice(0, 10);
      const beijingToday = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const endText = String(endDate || pauseDate || beijingToday).slice(0, 10);
      const [sy, sm, sd] = startText.split('-').map(Number);
      const [ey, em, ed] = endText.split('-').map(Number);
      const start = new Date(sy, sm - 1, sd).getTime();
      const end = new Date(ey, em - 1, ed).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 86_400_000) + 1 : 0;
    };
    return (_linkedPendingInterestPeriods as any[])
      .filter((period: any) => period?.tag_name === linkedPendingInterestTagName)
      .reduce((sum: number, period: any) => {
        const principal = Number(period?.principal || 0);
        const isManual = period?.is_manual === 1 || period?.is_manual === '1' || period?.is_manual === true;
        if (isManual) return principal > 0 ? sum + principal : sum;
        const annualRate = Number(period?.annual_rate || 0);
        const days = calcPeriodDays(period?.start_date, period?.end_date || null);
        return principal > 0 && annualRate > 0 && days > 0 ? sum + principal * (annualRate / 100 / 365) * days : sum;
      }, 0);
  }, [hasExternalPendingInterest, _linkedPendingInterestPeriods, _pendingInterestTagConfig, linkedPendingInterestTagName]);
  const linked37PaidInterestCny = useMemo(() => {
    if (!hasExternalPaidInterest) return null;
    if (!Array.isArray(_linkedPaidInterestPeriods)) return null;
    return (_linkedPaidInterestPeriods as any[])
      .filter((period: any) => {
        const isManual = period?.is_manual === 1 || period?.is_manual === '1' || period?.is_manual === true;
        return period?.tag_name === linkedPaidInterestTagName && isManual && Number(period?.principal || 0) < 0;
      })
      .reduce((sum: number, period: any) => {
        const principal = Number(period?.principal || 0);
        return sum + Math.abs(principal);
      }, 0);
  }, [hasExternalPaidInterest, _linkedPaidInterestPeriods, linkedPaidInterestTagName]);

  // 弹窗状态：优先使用父组件传入的 props，否则 fallback 到内部 state
  // （父组件提升状态可防止数据刷新导致弹窗自动关闭）
  const [_intShowInterestTip, _intSetShowInterestTip] = useState(false);
  const [_intShowCollateralInfo, _intSetShowCollateralInfo] = useState(false);
  // 37号担保货币详情与52订单担保缺口公式是两份不同内容，不能共用同一个弹窗状态。
  const [showCollateralGapFormulaInfo, setShowCollateralGapFormulaInfo] = useState(false);
  const [_intShowMarginInfo, _intSetShowMarginInfo] = useState(false);
  const showInterestTip = _propShowInterestTip !== undefined ? _propShowInterestTip : _intShowInterestTip;
  const setShowInterestTip = _propSetShowInterestTip ?? _intSetShowInterestTip;
  const showCollateralInfo = _propShowCollateralInfo !== undefined ? _propShowCollateralInfo : _intShowCollateralInfo;
  const setShowCollateralInfo = _propSetShowCollateralInfo ?? _intSetShowCollateralInfo;
  const closeCollateralInfoDialog = () => {
    setShowCollateralGapFormulaInfo(false);
    setShowCollateralInfo(false);
  };
  const showMarginInfo = _propShowMarginInfo !== undefined ? _propShowMarginInfo : _intShowMarginInfo;
  const setShowMarginInfo = _propSetShowMarginInfo ?? _intSetShowMarginInfo;
  // ===== 担保物快捷编辑面板 =====
  type QuickCollateralItem = { coin: string; qty: string; note?: string; source?: 'wallet' };
  const isQuickWalletCollateral = (asset: Partial<QuickCollateralItem> | null | undefined) =>
    asset?.source === 'wallet' || asset?.note === '钱包担保冻结';
  const [showCollateralPanel, setShowCollateralPanel] = useState(false);
  // 手工与钱包担保分别编辑、分别保存。仅在展示/通用保存时合并，避免手工删除误解除钱包冻结。
  const [collateralEditItems, setCollateralEditItems] = useState<QuickCollateralItem[]>([]);
  const [walletCollateralEditItems, setWalletCollateralEditItems] = useState<QuickCollateralItem[]>([]);
  const [initialCollateralSignature, setInitialCollateralSignature] = useState('[]');
  // 每条担保物独立的约等于显示配置：{ "0": "U", "1": "hidden", ... }
  const [collateralItemApprox, setCollateralItemApprox] = useState<Record<string, string>>({});
  // 多笔担保总值的独立约等于显示配置
  const [collateralTotalApprox, setCollateralTotalApprox] = useState<string>('U');
  // 快捷面板须与完整订单编辑保持相同的担保显示开关，不能只保存估值单位而遗漏字段可见性。
  const [collateralVisibility, setCollateralVisibility] = useState({
    collateralCoin: true,
    collateralValue: true,
    collateral: true,
    marginRate: true,
  });
  const [quickStockManualCollateralValueDisplay, setQuickStockManualCollateralValueDisplay] = useState<'U' | 'CNY'>('CNY');
  const [quickExternalCollateralValueDisplay, setQuickExternalCollateralValueDisplay] = useState<'CRYPTO' | 'U' | 'CNY'>('CNY');
  const [quickExternalCollateralGapDisplay, setQuickExternalCollateralGapDisplay] = useState<'U' | 'CNY'>('CNY');
  const [collateralMarginAlertThreshold, setCollateralMarginAlertThreshold] = useState('');
  const _intSaveCollateralMutation = trpc.ledger.financeUpdateOrder.useMutation({
    onSuccess: () => { toast.success('担保已保存'); trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId }); },
    onError: (err) => toast.error(err.message),
  });
  // 有 participantInfo 表示当前卡片已经是某位共同拥有者或参与者的独立订单视图。
  // 快捷保存必须写入该人的快照，不能回写主订单后再被个人快照覆盖。
  const quickViewParticipantUserId = Number((order as any).participantInfo?.userId ?? (order as any).participantInfo?.user_id ?? 0) || null;
  const quickWalletCollateralUserId = quickViewParticipantUserId || Number((order as any).user_id || 0);
  const quickWalletCollateralBalancesQuery = trpc.ledger.funderGetWalletCollateralBalances.useQuery(
    { ledgerId: 52, userId: Math.max(1, quickWalletCollateralUserId) },
    {
      enabled: showCollateralPanel && ledgerId === 52 && quickWalletCollateralUserId > 0,
      staleTime: 0,
    },
  );
  const _intSaveWalletCollateralMutation = trpc.ledger.funderSaveWalletCollateral.useMutation({
    onSuccess: () => {
      toast.success('钱包担保已冻结保存');
      trpcUtils.ledger.funderGetAssetOrders.invalidate({ ledgerId });
      quickWalletCollateralBalancesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const normalizeQuickCollateralAssets = (assets: QuickCollateralItem[]) => assets
    .filter(asset => asset.coin && asset.qty !== '' && !isNaN(parseFloat(asset.qty)))
    .map(asset => ({
      coin: String(asset.coin),
      qty: String(asset.qty),
      note: asset.note || '',
      ...(asset.source === 'wallet' ? { source: 'wallet' as const } : {}),
    }));
  const handleOpenCollateralPanel = () => {
    if (showCollateralPanel) { setShowCollateralPanel(false); return; }
    // 初始化：手工担保与钱包冻结担保必须分开加载，两个区域各自只操作自己的条目。
    let allItems: QuickCollateralItem[] = [];
    try {
      const raw = order.collateral_assets;
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          allItems = parsed.map((a: any) => ({
            coin: a.coin || 'BTC',
            qty: String(a.qty ?? ''),
            note: a.note || '',
            ...(isQuickWalletCollateral(a) ? { source: 'wallet' as const } : {}),
          }));
        }
      }
    } catch {}
    const initialManualItems = allItems.filter((item) => !isQuickWalletCollateral(item));
    const initialWalletItems = allItems.filter(isQuickWalletCollateral)
      .map((item) => ({ ...item, source: 'wallet' as const, note: '钱包担保冻结' }));
    setCollateralEditItems(initialManualItems);
    setWalletCollateralEditItems(initialWalletItems);
    setInitialCollateralSignature(JSON.stringify(normalizeQuickCollateralAssets(initialManualItems)));
    // 初始化担保物约等于配置（从 display_config 加载）
    try {
      const rawDC = order.display_config;
      const parsedDC = rawDC ? (typeof rawDC === 'string' ? JSON.parse(rawDC) : rawDC) : {};
      // approxCollateralItem 支持对象格式（每条独立）和字符串格式（全局）
      const aci = parsedDC.approxCollateralItem;
      if (aci && typeof aci === 'object' && !Array.isArray(aci)) {
        setCollateralItemApprox(aci);
      } else if (typeof aci === 'string') {
        // 将旧的全局字符串格式转换为每条独立
        const initMap: Record<string, string> = {};
        initialManualItems.forEach((_, i) => { initMap[String(i)] = aci; });
        setCollateralItemApprox(initMap);
      } else {
        setCollateralItemApprox({});
      }
      const savedTotalApprox = parsedDC.approxCollateralTotal;
      setCollateralTotalApprox(['hidden', 'U', 'CNY'].includes(savedTotalApprox)
        ? savedTotalApprox
        : parsedDC.approxCollateralValue === 'CNY' ? 'CNY' : 'U');
      setCollateralVisibility({
        collateralCoin: parsedDC.collateralCoin !== false,
        collateralValue: parsedDC.collateralValue !== false,
        collateral: parsedDC.collateral !== false,
        marginRate: parsedDC.marginRate !== false,
      });
      setQuickStockManualCollateralValueDisplay(parsedDC.stockManualCollateralValueDisplay === 'U' ? 'U' : 'CNY');
      setQuickExternalCollateralValueDisplay(
        parsedDC.externalCollateralValueDisplay === 'CRYPTO'
          ? 'CRYPTO'
          : parsedDC.externalCollateralValueDisplay === 'U' ? 'U' : 'CNY',
      );
      setQuickExternalCollateralGapDisplay(parsedDC.externalCollateralGapDisplay === 'U' ? 'U' : 'CNY');
      setCollateralMarginAlertThreshold(
        parsedDC.marginAlertThreshold === null || parsedDC.marginAlertThreshold === undefined
          ? ''
          : String(parsedDC.marginAlertThreshold),
      );
    } catch {
      setCollateralItemApprox({});
      setCollateralTotalApprox('U');
      setCollateralVisibility({ collateralCoin: true, collateralValue: true, collateral: true, marginRate: true });
      setQuickStockManualCollateralValueDisplay('CNY');
      setQuickExternalCollateralValueDisplay('CNY');
      setQuickExternalCollateralGapDisplay('CNY');
      setCollateralMarginAlertThreshold('');
    }
    setShowCollateralPanel(true);
  };
  const handleSaveCollateral = () => {
    const validManual = normalizeQuickCollateralAssets(collateralEditItems);
    const validWallet = normalizeQuickCollateralAssets(walletCollateralEditItems)
      .map((asset) => ({ ...asset, source: 'wallet' as const, note: '钱包担保冻结' }));
    // 通用订单更新需携带两类担保，才能保证手工保存不覆盖已冻结的钱包条目；
    // 钱包余额本身只由下方“保存并冻结钱包担保”原子接口变更。
    const valid = [...validManual, ...validWallet];
    // 构建新的 display_config：在现有基础上只更新担保相关字段
    let newDC: Record<string, any> = {};
    try {
      const rawDC = order.display_config;
      newDC = rawDC ? (typeof rawDC === 'string' ? JSON.parse(rawDC) : { ...rawDC }) : {};
    } catch {}
    newDC.approxCollateralItem = collateralItemApprox;
    newDC.approxCollateralTotal = collateralTotalApprox;
    newDC.collateralCoin = collateralVisibility.collateralCoin;
    newDC.collateralValue = collateralVisibility.collateralValue;
    newDC.collateral = collateralVisibility.collateral;
    newDC.marginRate = collateralVisibility.marginRate;
    newDC.stockManualCollateralValueDisplay = quickStockManualCollateralValueDisplay;
    newDC.externalCollateralValueDisplay = quickExternalCollateralValueDisplay;
    newDC.externalCollateralGapDisplay = quickExternalCollateralGapDisplay;
    const alertThreshold = Number(collateralMarginAlertThreshold);
    if (collateralMarginAlertThreshold.trim() && (!Number.isFinite(alertThreshold) || alertThreshold < 0 || alertThreshold > 200)) {
      toast.error('保证金率预警阈值应为 0–200');
      return;
    }
    if (collateralMarginAlertThreshold.trim()) {
      newDC.marginAlertThreshold = alertThreshold;
    } else {
      delete newDC.marginAlertThreshold;
    }
    const collateralAssetsChanged = JSON.stringify(validManual) !== initialCollateralSignature;
    if (quickViewParticipantUserId) {
      // 显示控制永远属于当前个人视图；只有实际改动担保物时才将其标记为个人担保覆盖。
      const snapshot: Record<string, any> = { display_config: newDC };
      if (collateralAssetsChanged) {
        snapshot.collateral_assets = valid;
        snapshot.participant_collateral_override = true;
      }
      _intSaveParticipantDisplayMutation.mutate({
        orderId: Number(order.id),
        ledgerId,
        userId: quickViewParticipantUserId,
        snapshot,
      });
      return;
    }
    _intSaveCollateralMutation.mutate({ id: Number(order.id), ledgerId, collateralAssets: valid, displayConfig: newDC });
  };
  const handleSaveWalletCollateral = () => {
    if (ledgerId !== 52 || quickWalletCollateralUserId <= 0) {
      toast.error('未找到该订单拥有者，无法读取钱包担保资产');
      return;
    }
    const assets = walletCollateralEditItems
      .filter((asset) => asset.coin && asset.qty.trim() !== '')
      .map((asset) => ({ coin: asset.coin, qty: asset.qty.trim() }));
    if (assets.some((asset) => !/^([1-9]\d{0,17})(?:\.\d{1,18})?$/.test(asset.qty))) {
      toast.error('钱包担保数量必须大于 0，且最多支持 18 位小数');
      return;
    }
    _intSaveWalletCollateralMutation.mutate({
      ledgerId: 52,
      orderId: Number(order.id),
      userId: quickWalletCollateralUserId,
      assets: assets as any,
    });
  };
  // ===== END 担保物快捷编辑面板 =====
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const tipBtnRef = useRef<HTMLButtonElement>(null);
  const [tipPos, setTipPos] = useState<{ bottom: number; right: number }>({ bottom: 0, right: 0 });
  // 已结订单优先使用管理员保存的结息截止日；老订单回退至实际结清时点，绝不继续算至今天。
  const interestEndAt = (order as any).interest_end_date || order.settled_at || null;
  const accrued = useAccruedInterestFunder(
    (order.status === 'active' || interestEndAt) ? order.interest_base : null,
    (order.status === 'active' || interestEndAt) ? order.interest_rate_annual : null,
    (order.status === 'active' || interestEndAt) ? order.interest_start_date : null,
    interestEndAt
  );

  const statusLabel = STATUS_OPTIONS.find(s => s.value === order.status)?.label || order.status;
  const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
  const coinColor = COIN_COLORS[order.coin as CoinType] || '#6B7280';
  const isSettled = order.status === 'settled' || order.status === 'completed';
  const settledTimestamp = formatSettledTimestamp(order.settled_at);
  // “本人 / 他人”只决定列表归属；绿色主题只由真实参与关系决定。
  // order_perspective 不能作为颜色条件，避免“他人订单”被误标为参与订单。
  const collaboratorUserId = Number((order as any).participantInfo?.userId || (order as any).participantInfo?.user_id || 0);
  const isPrimaryOwnerProjection = _collaboratorRole === 'owner'
    && collaboratorUserId > 0
    && collaboratorUserId === Number(order.user_id || 0);
  // 主拥有者自动加入协作组只是为了统一保存成员配置，不应显示为“其他拥有者”视图。
  const isOwnerView = _collaboratorRole === 'owner' && !isPrimaryOwnerProjection;
  const isParticipantVisual = _isParticipantOrder && !isOwnerView;
  // 管理员列表接口返回 _participantCount，旧接口可能返回 participantCount，统一兼容。
  const participantCount = Number((order as any).participantCount ?? (order as any)._participantCount ?? 0);
  const rateStr = String(order.interest_rate_annual || '');
  const isNegRate = rateStr.startsWith('-');
  const rateAbs = formatFunderAnnualRate(rateStr);
  const rateSign = isNegRate ? '-' : '+';

  // 左栏数值
  const qty = parseFloat(order.buy_quantity || '0');
  const price = parseFloat(order.buy_price || '0');
  // 股票类型：大数字直接用 amount（融资金额，单位 CNY），不走 qty×price 折算
  const isStockOrder = order.asset_type === 'stock';
  const isOptionOrder = order.asset_type === 'crypto_option';
  // 股票没有可用的第三方行情报价时，已绑定的37号标签承担实时盈亏数据源。
  // 默认显示今日余额 − 初始金额；余额低于初始金额时应为负数，表示亏损。
  // 管理员也可显式切换为37号倍率后的净值盈亏。
  const isExternalStockPnlSource = isStockOrder
    && Number(_parsedCollateralSource?.ledgerId) === 37
    && !!linkedPnlTagName;
  const externalStockFloatPnlCny = useMemo(() => {
    if (!isExternalStockPnlSource || !_pnlTagConfig) return null;
    const rawBalance = (_pnlTagSummary as any)?.latestBalance?.balance;
    if (rawBalance === undefined || rawBalance === null || rawBalance === '') return null;
    const latestBalance = Number(rawBalance);
    if (!Number.isFinite(latestBalance)) return null;
    const initialAmount = Number((_pnlTagConfig as any).initial_amount ?? 0) || 0;
    const accountMultiplier = Number((_pnlTagConfig as any).account_multiplier ?? 1) || 1;
    return floatingPnlCalculationMode === 'leveraged_net_pnl'
      ? (latestBalance - initialAmount) * accountMultiplier
      : latestBalance - initialAmount;
  }, [isExternalStockPnlSource, floatingPnlCalculationMode, _pnlTagConfig, _pnlTagSummary]);
  const manualStockPnlDetail = useMemo(() => {
    const quotes = (manualStockCloseQuery.data as any)?.quotes ?? {};
    return manualStockPositions.map((position) => {
      const quote = quotes[position.symbol];
      const snapshotPrice = Number(quote?.price);
      const storedLatestPrice = Number(position.latestPrice);
      // 新增当日先用选股时带入的最新价；有已保存盘尾快照后，总是以盘尾价覆盖。
      const currentPrice = Number.isFinite(snapshotPrice) && snapshotPrice > 0
        ? snapshotPrice
        : (Number.isFinite(storedLatestPrice) && storedLatestPrice > 0 ? storedLatestPrice : null);
      const currency = String(quote?.currency || 'CNY').toUpperCase() === 'CNY' ? 'CNY' : 'USD';
      // “账户初始总额度”模式只使用第三方盘尾价和持股数量，不允许单只卖出价改变整体市值口径。
      const valuationPrice = manualStockPnlCalculationMode === 'total_capital'
        ? currentPrice
        : position.sellPrice ?? currentPrice;
      const marketValueCny = valuationPrice !== null
        ? valuationPrice * position.quantity * (currency === 'CNY' ? 1 : cnyRate)
        : null;
      const pnlCny = manualStockPnlCalculationMode === 'position_cost' && valuationPrice !== null
        ? (valuationPrice - position.buyPrice) * position.quantity * (currency === 'CNY' ? 1 : cnyRate)
        : null;
      return {
        ...position,
        currentPrice,
        valuationPrice,
        currency,
        marketValueCny,
        pnlCny,
        priceDate: String(quote?.priceDate || position.latestPriceDate || ''),
        updatedAt: String(quote?.updatedAt || position.latestPriceUpdatedAt || ''),
        isCloseSnapshot: Number.isFinite(snapshotPrice) && snapshotPrice > 0,
      };
    });
  }, [manualStockPositions, manualStockCloseQuery.data, cnyRate, manualStockPnlCalculationMode]);
  const manualStockMarketValueCny = manualStockPnlDetail.every((position) => position.marketValueCny !== null)
    ? manualStockPnlDetail.reduce((sum, position) => sum + (position.marketValueCny ?? 0), 0)
    : null;
  const manualStockTotalCapitalCny = hasManualStockTotalCapital
    ? manualStockTotalCapital * (manualStockCapitalCurrency === 'CNY' ? 1 : cnyRate)
    : null;
  const manualStockRawFloatPnlCny = manualStockPnlCalculationMode === 'total_capital'
    ? (manualStockMarketValueCny !== null && manualStockTotalCapitalCny !== null
      ? manualStockMarketValueCny - manualStockTotalCapitalCny
      : null)
    : (manualStockPnlDetail.every((position) => position.pnlCny !== null)
      ? manualStockPnlDetail.reduce((sum, position) => sum + (position.pnlCny ?? 0), 0)
      : null);
  const manualStockFloatPnlCny = manualStockRawFloatPnlCny === null
    ? null
    // 账户总额度模式：先清楚展示「市值合计 − 初始总额度」的差值，
    // 再将该差值乘以管理员配置的计算系数。
    // 逐只买入价模式同样保持“原始盈亏合计 × 系数”的既有口径。
    : manualStockPnlCalculationMode === 'total_capital'
      ? manualStockRawFloatPnlCny * manualStockPnlCoefficient
      : manualStockRawFloatPnlCny * manualStockPnlCoefficient;
  // 账户总额度模式沿用股票列表的视觉语义：市值低于初始额度为绿色，高于为红色。
  const manualStockMarketValueColor = manualStockMarketValueCny !== null && manualStockTotalCapitalCny !== null
    ? (manualStockMarketValueCny < manualStockTotalCapitalCny ? '#16A34A' : manualStockMarketValueCny > manualStockTotalCapitalCny ? '#DC2626' : '#374151')
    : '#1A2340';
  const manualStockDifferenceColor = manualStockRawFloatPnlCny === null
    ? '#6B7280'
    : manualStockRawFloatPnlCny < 0 ? '#16A34A' : manualStockRawFloatPnlCny > 0 ? '#DC2626' : '#374151';
  const manualStockAccountPnlColor = manualStockFloatPnlCny === null
    ? '#6B7280'
    : manualStockFloatPnlCny < 0 ? '#16A34A' : manualStockFloatPnlCny > 0 ? '#DC2626' : '#374151';
  const configuredStockFloatPnlCny = isManualStockPnlSource ? manualStockFloatPnlCny : externalStockFloatPnlCny;
  const isConfiguredStockPnlSource = isExternalStockPnlSource || isManualStockPnlSource;
  // 此值仅用于订单模式“浮动盈亏”一行及担保缺口；手工组合使用每天盘尾快照。
  // 解析期权信息
  const optionInfo = (() => {
    try {
      const oi = (order as any).option_info;
      if (!oi) return null;
      return typeof oi === 'string' ? JSON.parse(oi) : oi;
    } catch { return null; }
  })();
  // Greeks 仅支持 Deribit 的 BTC/ETH；其他期权标的保留手动参数，不发起无效查询。
  const optionGreeksSupported = optionInfo?.coin === 'BTC' || optionInfo?.coin === 'ETH';
  const optionGreeksCurrency = (optionInfo?.coin === 'ETH' ? 'ETH' : 'BTC') as 'BTC' | 'ETH';
  const optionPremiumUnit = optionInfo?.denomination === 'B'
    ? (optionInfo?.coin || 'BTC')
    : optionInfo?.denomination === 'U'
      ? 'USDT'
      : (optionInfo?.denomination || 'USDT');
  // 期权报价以USDT显示时统一采用项目内的小写u；其他实际计价币种保持原样。
  const optionPremiumDisplayUnit = optionPremiumUnit === 'USDT' ? 'u' : optionPremiumUnit;
  const greeksResult = useOptionGreeks({
    currency: optionGreeksCurrency,
    exerciseDate: optionInfo?.exerciseDate || '',
    strikePrice: optionInfo?.strikePrice ? Number(optionInfo.strikePrice) : 0,
    direction: (optionInfo?.direction || 'long_call') as 'long_call' | 'long_put' | 'short_call' | 'short_put',
    enabled: isOptionOrder && optionGreeksSupported && !!optionInfo?.exerciseDate && !!optionInfo?.strikePrice,
  });
  // 融资金额统一以 order.amount 的 USDT 基准值保存；amount_currency 表示买入价格和融资金额的计价币种。
  const storedAmount = parseFloat(order.amount || '0');
  const rawAmountCurrency = String(order.amount_currency || (isStockOrder ? 'CNY' : 'USDT')).toUpperCase();
  const amountCurrency = rawAmountCurrency === 'U' ? 'USDT' : rawAmountCurrency;
  const amountCurrencyPrice = livePrices[amountCurrency];
  const quotedPriceUsdt = amountCurrency === 'CNY'
    ? price / cnyRate
    : amountCurrency === 'USDT'
      ? price
      : (amountCurrencyPrice && amountCurrencyPrice > 0 ? price * amountCurrencyPrice : price);
  const stockAmountUsdt = isStockOrder && storedAmount > 0
    ? amountCurrency === 'CNY'
      ? storedAmount / cnyRate
      : amountCurrency === 'USDT'
        ? storedAmount
        : (amountCurrencyPrice && amountCurrencyPrice > 0 ? storedAmount * amountCurrencyPrice : storedAmount)
    : 0;
  const totalU = isStockOrder
    ? stockAmountUsdt
    : (storedAmount > 0 ? storedAmount : (qty > 0 && quotedPriceUsdt > 0 ? qty * quotedPriceUsdt : 0));
  // 借出资产必须显示融资金额/融资币种，不能误用购买币种和 buy_quantity。
  const financingAmountUsdt = totalU;
  const financingDisplayConfig: Record<string, boolean | string | number> | null = (() => {
    try {
      const raw = order.display_config;
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return null; }
  })();
  // 仅用于前端资产标题旁的展示标签，不影响订单、利息或担保计算。
  // 旧订单的 selfFundedAsset 继续视为“自有资产”。
  const assetFundingType = financingDisplayConfig?.assetFundingType === 'financing'
    ? 'financing'
    : financingDisplayConfig?.assetFundingType === 'self' || financingDisplayConfig?.selfFundedAsset === true || financingDisplayConfig?.selfFundedAsset === 'true'
      ? 'self'
      : null;
  const calculatedFinancingDisplayAmount = amountCurrency === 'USDT'
    ? financingAmountUsdt
    : amountCurrency === 'CNY'
      ? financingAmountUsdt * cnyRate
      : (amountCurrencyPrice && amountCurrencyPrice > 0 ? financingAmountUsdt / amountCurrencyPrice : financingAmountUsdt);
  const savedFinancingInputAmount = Number(financingDisplayConfig?.financingInputAmount);
  const savedFinancingInputCurrencyRaw = String(financingDisplayConfig?.financingInputCurrency || '').toUpperCase();
  const savedFinancingInputCurrency = savedFinancingInputCurrencyRaw === 'U' ? 'USDT' : savedFinancingInputCurrencyRaw === 'RMB' ? 'CNY' : savedFinancingInputCurrencyRaw;
  const linkedFinancingAmount = qty > 0 && price > 0 ? qty * price : 0;
  const legacyInterestBase = Number(order.interest_base || 0);
  const legacyInterestBaseCurrencyRaw = String(order.interest_base_currency || '').toUpperCase();
  const legacyInterestBaseCurrency = legacyInterestBaseCurrencyRaw === 'U' ? 'USDT' : legacyInterestBaseCurrencyRaw === 'RMB' ? 'CNY' : legacyInterestBaseCurrencyRaw;
  const financingDisplayAmount = savedFinancingInputAmount > 0 && savedFinancingInputCurrency === amountCurrency
    ? savedFinancingInputAmount
    : linkedFinancingAmount > 0
      ? linkedFinancingAmount
      : legacyInterestBase > 0 && legacyInterestBaseCurrency === amountCurrency
        ? legacyInterestBase
        : calculatedFinancingDisplayAmount;
  const financingDisplayUnit = amountCurrency === 'USDT' ? 'u' : amountCurrency === 'CNY' ? '元' : amountCurrency;
  const principalLentOut = order.principal_lent_out === 1 || order.principal_lent_out === true;
  // 借出本金时允许管理员决定左上角主展示：默认展示借出本金，也可保留标的币种数量。
  // 该配置纯属展示，不参与计息、担保缺口或任何资金计算。
  const principalLentOutPrimary = financingDisplayConfig?.principalLentOutPrimary === 'quantity'
    ? 'quantity'
    : 'principal';
  const displayFinancingAsPrimary = principalLentOut
    ? principalLentOutPrimary !== 'quantity'
    : isStockOrder || amountCurrency === 'CNY';
  const buyQuoteUnit = amountCurrency === 'CNY' ? '元' : amountCurrency === 'USDT' ? 'u' : amountCurrency;
  const quotedBuyValue = qty > 0 && price > 0 ? qty * price : financingDisplayAmount;
  // 利息货币逻辑与 LedgerDetail FunderOrderCardRight 完全一致。
  // 计息基数和利息展示币种可以不同，必须分别标准化后再计算和标注单位。
  const normalizeFunderCurrency = (value: unknown): 'CNY' | 'USDT' => {
    const currency = String(value || '').trim().toUpperCase();
    return ['CNY', 'RMB', '人民币'].includes(currency) ? 'CNY' : 'USDT';
  };
  const baseCur = normalizeFunderCurrency(order.interest_base_currency); // 计息基数货币
  const rateCur = normalizeFunderCurrency(order.interest_rate_currency); // 约定利息货币（决定主显示单位）
  const baseUnit = baseCur === 'CNY' ? '元' : 'u';
  const interestUnit = rateCur === 'CNY' ? '元' : 'u';
  const altUnit = rateCur === 'CNY' ? 'u' : '元';
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
  // 37号待结/已结是两个可独立启用的人民币口径来源；未启用的一边继续沿用52号订单自身计算。
  const displayedAccruedValue = hasExternalPendingInterest ? linked37PendingInterestCny : displayAccrued;
  const displayedAccruedUnit = hasExternalPendingInterest ? '元' : interestUnit;
  const displayedAccruedAltValue = hasExternalPendingInterest && linked37PendingInterestCny !== null
    ? linked37PendingInterestCny / cnyRate
    : altAccrued;
  // 调用37号利息时，只以37号“计入已付”的手工调息累计作为本订单已结利息，固定人民币口径。
  // 37号待结/欠息不进入这里；待结引用是否启用由另一条独立配置决定。
  const displayedPaidValue = hasExternalPaidInterest ? linked37PaidInterestCny : displayPaid;
  const displayedPaidUnit = hasExternalPaidInterest ? '元' : interestUnit;
  const displayedPaidAltValue = hasExternalPaidInterest && linked37PaidInterestCny !== null
    ? linked37PaidInterestCny / cnyRate
    : altPaid;

  // 持有时长——已结清订单冻结在 settled_at 时刻；无数据或未到开仓日均显示 0小时
  const holdDurationLabel = (() => {
    if (!order.buy_date) return '0小时';
    if (order.status !== 'active' && !order.settled_at) return '0小时';
    const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
    const elapsed = endTs - new Date(order.buy_date + 'T00:00:00').getTime();
    if (elapsed <= 0) return '0小时';
    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
  })();

  // 读取 display_config（与 LedgerDetail show() 函数一致：默认全部显示，除非明确设为 false）
  const dc = financingDisplayConfig;
  const show = (key: string) => dc ? (dc[key] !== false) : true;
  // 担保总值独立于逐笔担保货币的约等于配置。历史订单未保存新字段时，
  // 保留旧配置为“元”的明确选择；其他历史情形默认显示 USD，避免总值被隐藏。
  const approxCollateralTotal = dc?.approxCollateralTotal === 'hidden'
    || dc?.approxCollateralTotal === 'U'
    || dc?.approxCollateralTotal === 'CNY'
    ? dc.approxCollateralTotal
    : dc?.approxCollateralValue === 'CNY' ? 'CNY' : 'U';
  // 仅明确引用37号担保货币的股票订单，担保货币行展示标签汇总担保价值。
  // 手工担保必须逐笔按实际录入内容展示，不能被股票默认人民币总值覆盖。
  const externalCollateralValueDisplay = isStockOrder && hasExternalCollateral
    && (dc?.externalCollateralValueDisplay === 'CRYPTO' || dc?.externalCollateralValueDisplay === 'U' || dc?.externalCollateralValueDisplay === 'CNY')
    ? dc.externalCollateralValueDisplay
    : (isStockOrder && hasExternalCollateral ? 'CNY' : 'U');
  const externalCollateralGapDisplay = isStockOrder
    && (dc?.externalCollateralGapDisplay === 'U' || dc?.externalCollateralGapDisplay === 'CNY')
    ? dc.externalCollateralGapDisplay
    : (isStockOrder ? 'CNY' : 'U');
  // 股票手工担保的多笔合计默认按人民币显示，且可独立切换为U；
  // 不读取历史订单的通用 approxCollateralTotal 默认值，避免旧默认U覆盖股票人民币默认。
  const stockManualCollateralValueDisplay = isStockOrder && !hasExternalCollateral
    && (dc?.stockManualCollateralValueDisplay === 'U' || dc?.stockManualCollateralValueDisplay === 'CNY')
    ? dc.stockManualCollateralValueDisplay
    : 'CNY';
  // 资金属性仅用于展示标签。对未明确手动关闭的旧期权订单，保持其既有Greeks可见，避免标签保存误触配置默认值。
  const shouldShowOptionGreeks = isOptionOrder && optionInfo && (
    show('showGreeks')
    || (assetFundingType !== null && financingDisplayConfig?.showGreeksManualOverride !== true)
  );
  // 管理端必须能识别期权订单归属和类型；用户端仍遵循逐单字段显示开关。
  const forceAdminOptionHeader = isAdmin && isOptionOrder;
  const allowImageDownload = isAdmin || dc?.allowUserImageDownload !== false;
  const [headerTagsExpanded, setHeaderTagsExpanded] = useState(false);
  const headerMember = (membersData as any[])?.find((m: any) => Number(m.userId) === Number(order.user_id));
  const normalHeaderOwner = headerMember?.nickname || (order as any).nickname || headerMember?.username || (order as any).owner_label || null;
  const headerOwnerLabel = isParticipantVisual
    ? ((order as any).order_owner_name || (order as any).nickname || (order as any).username || normalHeaderOwner)
    : normalHeaderOwner;
  const headerCollaboratorLabel = (isParticipantVisual || isOwnerView)
    ? ((order as any).participant_name || (order as any).owner_label || null)
    : null;
  // 个人业务页眉由管理员配置在协作人独立快照内；真实拥有者/参与者姓名仍由服务端派生。
  const personalHeaderLabel = typeof (order as any).personal_header_label === 'string'
    ? (order as any).personal_header_label.trim().slice(0, 32)
    : '';
  const manualHeaderTags: string[] = (() => {
    try {
      const raw = (order as any).tags;
      const parsed = Array.isArray(raw) ? raw : (typeof raw === 'string' && raw ? JSON.parse(raw) : []);
      return Array.isArray(parsed) ? parsed.filter((tag: unknown) => typeof tag === 'string' && tag.trim().length > 0) : [];
    } catch {
      return [];
    }
  })();
  const headerTagCount = ((show('showOwnerName') || forceAdminOptionHeader) ? Number(Boolean(headerOwnerLabel)) + Number(Boolean(headerCollaboratorLabel)) : 0)
    + Number(Boolean(personalHeaderLabel))
    + Number(Boolean(order.asset_type && (show('assetType') || forceAdminOptionHeader)))
    + manualHeaderTags.length;
  const headerTagsRef = useRef<HTMLDivElement>(null);
  const [hasHeaderTagOverflow, setHasHeaderTagOverflow] = useState(false);
  useEffect(() => {
    const node = headerTagsRef.current;
    if (!node || headerTagsExpanded) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const childClipped = Array.from(node.querySelectorAll<HTMLElement>('[data-header-tag]'))
          .some(tag => tag.scrollWidth > tag.clientWidth + 1);
        setHasHeaderTagOverflow(node.scrollWidth > node.clientWidth + 1 || childClipped);
      });
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [headerTagsExpanded, headerTagCount, headerOwnerLabel, headerCollaboratorLabel, order.asset_type, manualHeaderTags.join('\u0001')]);
  // 52号账本：手续费仅在订单控制区明确开启后，才在订单模式向前端展示。
  const isLedger52 = Number(ledgerId ?? (order as any).ledger_id) === 52;
  const showTradingFee = isLedger52 && dc?.tradingFee === true;
  const tradingFeeRatePerMille = (() => {
    const value = Number((order as any).trading_fee_rate_per_mille ?? 2);
    return Number.isFinite(value) && value >= 0 ? value : 2;
  })();
  const tradingFeeStatus = (['unpaid', 'half_paid', 'paid'].includes((order as any).trading_fee_status)
    ? (order as any).trading_fee_status
    : 'unpaid') as 'unpaid' | 'half_paid' | 'paid';
  const tradingFeeStatusLabel = ({ unpaid: '已付0%', half_paid: '已付50%', paid: '已付100%' } as const)[tradingFeeStatus];

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
  // 期权订单：担保缺口基数按方向区分
  // 卖出(short_call/short_put) → 用计息基数（保证金）
  // 买入(long_call/long_put) → 用行权价 × 张数
  const optionDirection = isOptionOrder ? (optionInfo?.direction || '') : '';
  const isShortOptionForExposure = optionDirection === 'short_call' || optionDirection === 'short_put';
  const optionStrikePrice = isOptionOrder && optionInfo?.strikePrice ? Number(optionInfo.strikePrice) : 0;
  const optionBuyQty = isOptionOrder && optionInfo?.buyQty ? Number(optionInfo.buyQty) : 0;
  const interestBaseNum = isOptionOrder
    ? (isShortOptionForExposure
        ? (order.interest_base ? Number(order.interest_base) : totalU)
        : (optionStrikePrice > 0 && optionBuyQty > 0 ? optionStrikePrice * optionBuyQty : totalU))
    : (order.interest_base ? Number(order.interest_base) : totalU);
  // 与卡片模式一致：按计息基数优先、订单金额兜底，展示参考手续费全额及支付进度。
  const feeBase = Number(order.interest_base || totalU || 0);
  const referenceTradingFee = showTradingFee ? feeBase * tradingFeeRatePerMille / 1000 : 0;
  const liveP = livePrices[order.coin] ?? null;
  // 期权成本以权利金×张数为准，优先用订单保存的总投入（USDT基准）兼容历史记录。
  const optionContractQty = isOptionOrder ? Number(optionInfo?.buyQty || 0) : qty;
  const optionPremiumRaw = optionInfo?.premium != null ? Number(optionInfo.premium) : null;
  const optionPremiumUnitPrice = livePrices[optionPremiumUnit as CoinType];
  const optionPremiumUsdt = optionPremiumRaw === null || !Number.isFinite(optionPremiumRaw)
    ? null
    : optionPremiumUnit === 'CNY'
      ? optionPremiumRaw / cnyRate
      : optionPremiumUnit === 'USDT'
        ? optionPremiumRaw
        : (optionPremiumUnitPrice && optionPremiumUnitPrice > 0 ? optionPremiumRaw * optionPremiumUnitPrice : null);
  const optionPremiumTotalFromUnit = optionPremiumUsdt !== null && optionContractQty > 0
    ? optionPremiumUsdt * optionContractQty
    : null;
  const optionPremiumTotal = isOptionOrder
    ? (storedAmount > 0 ? storedAmount : optionPremiumTotalFromUnit)
    : null;
  // deribitGetGreeks 已将主备来源的合约 markPrice 统一折算为 USDT/张。
  const optionMarkPrice = greeksResult.data?.markPrice ?? null;
  const optionCurrentValue = optionMarkPrice !== null && optionContractQty > 0
    ? optionMarkPrice * optionContractQty
    : null;
  const isShortOption = optionInfo?.direction === 'short_call' || optionInfo?.direction === 'short_put';
  // 期权浮盈只允许使用“合约标记价 × 张数”与“权利金/张 × 张数”的差额；
  // 行权价仅用于到期收益和风险敞口，标的现货价只用于非期权订单。
  const optionFloatPnl = isOptionOrder && optionCurrentValue !== null && optionPremiumTotal !== null && optionPremiumTotal > 0
    ? (isShortOption ? optionPremiumTotal - optionCurrentValue : optionCurrentValue - optionPremiumTotal)
    : null;
  const currentValue = isOptionOrder ? optionCurrentValue : (liveP !== null ? liveP * qty : null);
  const isShort = isOptionOrder ? isShortOption : (order as any).trade_direction === 'short';
  // 数字币现货使用资产市值与买入价值比较；期权使用独立的合约标记价差额。
  const spotBuyValueUsdt = qty > 0 && quotedPriceUsdt > 0 ? qty * quotedPriceUsdt : totalU;
  const floatPnlBase = isOptionOrder ? optionPremiumTotal : (!isStockOrder ? spotBuyValueUsdt : interestBaseNum);
  const floatPnl = isOptionOrder
    ? optionFloatPnl
    : (currentValue !== null && floatPnlBase !== null && floatPnlBase > 0
      ? (isShort ? floatPnlBase - currentValue : currentValue - floatPnlBase)
      : null);
  // 内部担保和风险敞口统一以U计算。股票订单的本金/利息通常以人民币录入，
  // 必须先折为U，不能把“元”直接标为“u”。展示时再依所选单位反向换算。
  const stockRiskUsesCny = isStockOrder && baseCur === 'CNY';
  const automaticAccruedForRisk = stockRiskUsesCny ? accrued / cnyRate : accrued;
  const linkedPendingInterestForRisk = hasExternalPendingInterest
    ? (linked37PendingInterestCny === null ? null : linked37PendingInterestCny / cnyRate)
    : automaticAccruedForRisk;
  const accruedForRisk = linkedPendingInterestForRisk ?? 0;
  const totalPaidForRisk = stockRiskUsesCny ? totalPaid / cnyRate : totalPaid;
  // 37号利息分段全部以人民币存储。风险敞口内部统一为U，避免把人民币直接当成U。
  // null 表示查询尚未返回，前端此时显示“加载中”而不是用0错误替代。
  const linkedPaidInterestForRisk = hasExternalPaidInterest
    ? (linked37PaidInterestCny === null ? null : linked37PaidInterestCny / cnyRate)
    : totalPaidForRisk;
  const paidInterestForRisk = linkedPaidInterestForRisk ?? 0;
  const interestBaseForRisk = stockRiskUsesCny ? interestBaseNum / cnyRate : interestBaseNum;
  const floatPnlForRisk = isStockOrder && floatPnl !== null ? floatPnl / cnyRate : floatPnl;
  const exposure = floatPnlForRisk !== null
    ? collateralValue + floatPnlForRisk - accruedForRisk + paidInterestForRisk - (principalLentOut ? interestBaseForRisk : 0)
    : collateralValue - accruedForRisk + paidInterestForRisk - (principalLentOut ? interestBaseForRisk : 0);
  // 37号盈亏标签、担保标签均可独立使用；担保物也可完全手工录入。
  // 利息和借出本金属于52订单本身，始终按普通订单的风险公式处理。
  const linkedCollateralValueU = hasExternalCollateral
    ? extTagCollateralValueU
    : (collateralValueKnown ? collateralValue : null);
  const linkedFloatingPnlU = isExternalStockPnlSource
    ? extTagFloatingPnlU
    : isManualStockPnlSource
      ? (manualStockFloatPnlCny === null ? null : manualStockFloatPnlCny / cnyRate)
      : 0;
  const usesConfiguredStockRiskData = hasExternalCollateral || isConfiguredStockPnlSource;
  const externalNonSharedGapU = usesConfiguredStockRiskData
    && linkedCollateralValueU !== null
    && linkedFloatingPnlU !== null
    && linkedPendingInterestForRisk !== null
    && linkedPaidInterestForRisk !== null
    ? linkedCollateralValueU + linkedFloatingPnlU - accruedForRisk + paidInterestForRisk - (principalLentOut ? interestBaseForRisk : 0)
    : null;
  // 共享担保模式分为两层口径：
  // 1) 卡片行内的「本订单担保缺口/余量」必须计入本订单实际选定的担保物；
  // 2) 共享池弹窗才把同一人的全部订单、担保物统一汇总。
  // 过去第 1 层只计算了持仓盈亏与利息，漏掉本订单的手工/37号担保物，
  // 会让已有充足担保物的订单错误显示为大额缺口。
  const isSharedMode = orderShareMode === 'self';
  const sharedPoolLoading = isSharedMode && !sharedPoolInfo;
  // 本金浮动亏损：亏损时取绝对值，盈利时为 0（保留给风险提示扩展使用）。
  const principalLoss = floatPnl !== null ? Math.max(0, -floatPnl) : 0;
  // 共享池服务端已按当前市价计算每张订单的实际担保物价值；优先采用它，
  // 以便37号担保物、人民币担保物和本地手工担保物使用一致口径。
  const sharedOrderPoolDetail = isSharedMode
    ? ((sharedPoolInfo as any)?.orders ?? []).find((poolOrder: any) => Number(poolOrder.orderId) === Number(order.id))
    : null;
  const sharedOrderCollateralValueU = (() => {
    const serverValue = Number(sharedOrderPoolDetail?.collateralValue);
    if (Number.isFinite(serverValue)) return serverValue;
    if (hasExternalCollateral) return linkedCollateralValueU;
    return collateralValueKnown ? collateralValue : null;
  })();
  // 37号标签订单在共享池中由服务端返回标签净值盈亏/已结利息；
  // 行内展示也复用这一口径，避免与池总计出现不同的股票风险数值。
  const sharedOrderFloatingPnlU = (() => {
    const hasLinkedTag = Boolean(sharedOrderPoolDetail?.linked37PnlTagName || sharedOrderPoolDetail?.linked37TagName);
    const serverValue = Number(sharedOrderPoolDetail?.linked37FloatingPnl);
    if (hasLinkedTag && Number.isFinite(serverValue)) return serverValue;
    return floatPnlForRisk;
  })();
  const sharedOrderPendingInterestU = (() => {
    const serverCny = sharedOrderPoolDetail?.linked37PendingInterestCny;
    if (serverCny !== null && serverCny !== undefined && Number.isFinite(Number(serverCny))) return Number(serverCny) / cnyRate;
    return accruedForRisk;
  })();
  const sharedOrderPaidInterestU = (() => {
    const serverCny = sharedOrderPoolDetail?.linked37PaidInterestCny;
    if (serverCny !== null && serverCny !== undefined && Number.isFinite(Number(serverCny))) return Number(serverCny) / cnyRate;
    return paidInterestForRisk;
  })();
  // 行内「担保缺口/余量」与非共享订单使用完全相同的单订单公式。
  // 共享只改变担保物可以在池内共同覆盖的总计判断，不能抹掉该订单本身的担保物。
  const sharedOrderExposure = sharedOrderCollateralValueU !== null
    ? (sharedOrderFloatingPnlU !== null
      ? sharedOrderCollateralValueU + sharedOrderFloatingPnlU - sharedOrderPendingInterestU + sharedOrderPaidInterestU - (principalLentOut ? interestBaseForRisk : 0)
      : sharedOrderCollateralValueU - sharedOrderPendingInterestU + sharedOrderPaidInterestU - (principalLentOut ? interestBaseForRisk : 0))
    : null;
  // 共享池中的37标签订单使用服务端回传的标签净值盈亏，不能再按股票行情价推算。
  // 同一标签的担保物与净值盈亏都只计一次；各订单的待结利息/借出本金仍分别计入。
  const sharedPoolRemainingU = (() => {
    if (!isSharedMode || !sharedPoolInfo) return null;
    const poolOrders = (sharedPoolInfo as any).orders;
    const totalCollateral = Number((sharedPoolInfo as any).totalCollateralValue);
    if (!Array.isArray(poolOrders) || !Number.isFinite(totalCollateral)) return null;
    const counted37Tags = new Set<string>();
    const counted37PendingInterestTags = new Set<string>();
    const counted37PaidInterestTags = new Set<string>();
    let remaining = totalCollateral;
    for (const poolOrder of poolOrders) {
      const interestCurrency = String(poolOrder.interestBaseCurrency || 'USDT').trim().toUpperCase();
      const isInterestCny = ['CNY', 'RMB', '人民币'].includes(interestCurrency);
      const principalU = isInterestCny ? Number(poolOrder.principal ?? 0) / cnyRate : Number(poolOrder.principal ?? 0);
      const accruedInterestRaw = Number(poolOrder.accruedInterest ?? ((Number(poolOrder.pendingInterest ?? 0)) + (Number(poolOrder.paidInterest ?? 0))));
      const paidInterestRaw = Number(poolOrder.paidInterest ?? 0);
      const linkedPendingInterestCny = poolOrder.linked37PendingInterestCny;
      const linkedPaidInterestCny = poolOrder.linked37PaidInterestCny;
      const linkedPendingInterestTag = typeof poolOrder.linked37PendingInterestTagName === 'string' ? poolOrder.linked37PendingInterestTagName : '';
      const linkedPaidInterestTag = typeof poolOrder.linked37PaidInterestTagName === 'string'
        ? poolOrder.linked37PaidInterestTagName
        : (typeof poolOrder.linked37InterestTagName === 'string' ? poolOrder.linked37InterestTagName : '');
      let accruedInterestU = isInterestCny ? accruedInterestRaw / cnyRate : accruedInterestRaw;
      if (linkedPendingInterestCny !== null && linkedPendingInterestCny !== undefined) {
        if (linkedPendingInterestTag && counted37PendingInterestTags.has(linkedPendingInterestTag)) {
          accruedInterestU = 0;
        } else {
          if (linkedPendingInterestTag) counted37PendingInterestTags.add(linkedPendingInterestTag);
          accruedInterestU = Number(linkedPendingInterestCny) / cnyRate;
        }
      }
      let paidInterestU = isInterestCny ? paidInterestRaw / cnyRate : paidInterestRaw;
      if (linkedPaidInterestCny !== null && linkedPaidInterestCny !== undefined) {
        if (linkedPaidInterestTag && counted37PaidInterestTags.has(linkedPaidInterestTag)) {
          paidInterestU = 0;
        } else {
          if (linkedPaidInterestTag) counted37PaidInterestTags.add(linkedPaidInterestTag);
          paidInterestU = Number(linkedPaidInterestCny) / cnyRate;
        }
      }
      const principalDeductU = poolOrder.principalLentOut === true || poolOrder.principalLentOut === 1 ? principalU : 0;
      // 新订单把37号担保物、37号浮盈来源分开返回；旧接口仍回退原字段。
      const linkedTag = typeof poolOrder.linked37PnlTagName === 'string'
        ? poolOrder.linked37PnlTagName
        : (typeof poolOrder.linked37TagName === 'string' ? poolOrder.linked37TagName : '');
      let floatingPnlU: number | null = null;
      if (linkedTag) {
        if (!counted37Tags.has(linkedTag)) {
          counted37Tags.add(linkedTag);
          const value = Number(poolOrder.linked37FloatingPnl);
          if (!Number.isFinite(value)) return null;
          floatingPnlU = value;
        } else {
          floatingPnlU = 0;
        }
      } else if (poolOrder.assetType === 'crypto_option' || (Number(poolOrder.quantity ?? 0) === 0 && (poolOrder.principalLentOut === true || poolOrder.principalLentOut === 1))) {
        floatingPnlU = 0;
      } else {
        const coin = String(poolOrder.coin || '').toUpperCase();
        const quantity = Number(poolOrder.quantity ?? 0);
        const price = livePrices[coin] ?? (poolOrder.currentPrice !== null && poolOrder.currentPrice !== undefined ? Number(poolOrder.currentPrice) : null);
        const currentValue = coin === 'CNY' ? quantity / cnyRate : (price !== null ? Number(price) * quantity : null);
        if (currentValue === null || !Number.isFinite(currentValue)) return null;
        const buyValue = Number(poolOrder.buyValue ?? 0);
        const buyCurrency = String(poolOrder.buyValueCurrency || 'USDT').trim().toUpperCase();
        const buyValueU = ['CNY', 'RMB', '人民币'].includes(buyCurrency) ? buyValue / cnyRate : buyValue;
        const costBaseU = buyValueU > 0 ? buyValueU : principalU;
        floatingPnlU = currentValue - costBaseU;
      }
      remaining += floatingPnlU - accruedInterestU + paidInterestU - principalDeductU;
    }
    return remaining;
  })();
  const externalCollateralValueU = isSharedMode
    ? (sharedPoolInfo ? Number((sharedPoolInfo as any).totalCollateralValue) : null)
    : (hasExternalCollateral ? externalCollateralSummary.totalU : (collateralValueKnown ? collateralValue : null));
  const externalCollateralValueCny = externalCollateralValueU !== null && Number.isFinite(externalCollateralValueU)
    ? externalCollateralValueU * cnyRate
    : null;
  // 共享模式：优先显示本订单含担保物的余量/缺口；担保物价格未就绪时保持加载状态，
  // 不再退回成漏算担保物的数值。
  // 非共享的37号标签订单用含利息的外部担保公式，其他订单沿用原有 exposure 逻辑。
  const effectiveExposure = isSharedMode ? (sharedOrderExposure ?? 0) : (externalNonSharedGapU ?? exposure);
  const isSufficient = effectiveExposure >= 0;
  // 共享模式下缺口计算不再依赖 sharedPoolInfo，不需要显示「计算中...」
  // sharedPoolLoading 仅用于弹窗内共享池汇总区域的加载状态
  const showExposureLoading = (hasExternalPendingInterest && linkedPendingInterestForRisk === null)
    || (hasExternalPaidInterest && linkedPaidInterestForRisk === null)
    || (isSharedMode && sharedOrderExposure === null);
  // 每次共享订单行内余量变化时上报给父组件，供扩展风险视图读取。
  useEffect(() => {
    if (isSharedMode && onExposureGapChange) {
      onExposureGapChange(order.id, sharedOrderExposure ?? 0);
    }
  }, [sharedOrderExposure, isSharedMode, order.id]);

  return (
    <>
    <div
      ref={cardExportRef}
      className="rounded-lg overflow-hidden relative"
      style={{
        background: isParticipantVisual ? '#F0FDF4' : '#ffffff',
        border: isParticipantVisual ? '1px solid #86EFAC' : '1px solid #E8EDFF',
        boxShadow: isParticipantVisual ? '0 1px 5px rgba(5,150,105,0.12)' : '0 1px 4px rgba(26,35,64,0.05)',
      }}
    >
      {isSettled && (
        <div className="absolute inset-0 pointer-events-none select-none flex items-center justify-center" style={{ backgroundColor: 'rgba(220,38,38,0.06)', zIndex: 10 }}>
          <div style={{ border: '3px solid rgba(220,38,38,0.35)', color: 'rgba(220,38,38,0.35)', borderRadius: '8px', padding: '8px 24px', fontSize: '28px', fontWeight: 800, letterSpacing: '6px', lineHeight: '1.4', whiteSpace: 'nowrap', transform: 'rotate(-15deg)', textAlign: 'center' }}>
            <div>已结清</div>
            {settledTimestamp && <div style={{ marginTop: '2px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.6px', lineHeight: 1.25 }}>结清 {settledTimestamp}</div>}
          </div>
        </div>
      )}

      {/* 帽子：标签行 + 操作按钮 */}
      <div
        className="flex items-start gap-2 px-4 py-2"
        style={{
          borderBottom: isParticipantVisual ? '1px solid #BBF7D0' : '1px solid #E4E8F5',
          backgroundColor: isParticipantVisual ? '#DCFCE7' : '#D0D6EE',
        }}
      >

        {/* 状态：仅非持有中时显示（圆点 + 文字） */}
        {order.status !== 'active' && (
          isAdmin && !isInvited ? (
            <button
              onClick={() => setShowStatusSheet(true)}
              className="flex items-center gap-1 transition-opacity hover:opacity-60 shrink-0"
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
              <span className="text-[11px] font-medium" style={{ color: statusColor }}>{statusLabel}</span>
            </button>
          ) : (
            <span className="flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
              <span className="text-[11px] font-medium" style={{ color: statusColor }}>{statusLabel}</span>
            </span>
          )
        )}
        {/* 标签区：默认仅显示一行，展开后显示全部；自动标签与手动标签均计数 */}
        <div ref={headerTagsRef} className={`relative flex items-center gap-1 flex-1 min-w-0 ${headerTagsExpanded ? 'flex-wrap' : 'flex-nowrap overflow-hidden h-6'}`}>
          {(show('showOwnerName') || forceAdminOptionHeader) && headerOwnerLabel && (
            <span data-header-tag className="text-[11px] font-medium px-1.5 py-0.5 rounded truncate max-w-[130px] shrink-0" style={{ backgroundColor: '#EDEEF5', color: '#4B5563' }}>
              {isParticipantVisual ? `拥有者 ${headerOwnerLabel}` : headerOwnerLabel}
            </span>
          )}
          {(show('showOwnerName') || forceAdminOptionHeader) && (isParticipantVisual || isOwnerView) && headerCollaboratorLabel && (
            <span data-header-tag className="text-[11px] font-medium px-1.5 py-0.5 rounded truncate max-w-[130px] shrink-0" style={isParticipantVisual ? { backgroundColor: '#DCFCE7', color: '#15803D' } : { backgroundColor: '#F3E8FF', color: '#6D28D9' }}>
              {isOwnerView ? '共同拥有者' : '参与者'} {headerCollaboratorLabel}
            </span>
          )}
          {personalHeaderLabel && (
            <span data-header-tag className="text-[11px] font-semibold px-1.5 py-0.5 rounded truncate max-w-[150px] shrink-0" style={isParticipantVisual ? { backgroundColor: '#BBF7D0', color: '#166534' } : { backgroundColor: '#EDE9FE', color: '#6D28D9' }} title={personalHeaderLabel}>
              {personalHeaderLabel}
            </span>
          )}
          {isOwnerView && (
            <span data-header-tag className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium shrink-0" style={{ backgroundColor: '#F3E8FF', color: '#6D28D9' }}>
              订单信息 <OwnerCollaborationInfoButton order={order} ledgerId={ledgerId} />
            </span>
          )}
          {order.asset_type && (show('assetType') || forceAdminOptionHeader) && (
            <span
              data-header-tag
              className="text-[11px] font-medium px-1.5 py-0.5 rounded shrink-0"
              style={order.asset_type === 'crypto_option'
                ? { backgroundColor: '#F3E8FF', color: '#7C3AED' }
                : { backgroundColor: '#EDEEF5', color: '#4B5563' }
              }
            >
              {order.asset_type === 'stock' ? '股票' : order.asset_type === 'crypto_option' ? '期权' : '数字币'}
            </span>
          )}
          {manualHeaderTags.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              data-header-tag
              className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${headerTagsExpanded ? 'shrink-0 max-w-full whitespace-normal break-all' : 'shrink min-w-[54px] max-w-[220px] truncate'}`}
              style={{ backgroundColor: '#EDEEF5', color: '#4B5563' }}
            >
              {tag}
            </span>
          ))}
          {!headerTagsExpanded && hasHeaderTagOverflow && (
            <span
              className="absolute right-0 top-0 h-6 w-8 pointer-events-none flex items-center justify-end pr-0.5 text-[12px]"
              style={{
                color: '#9CA3AF',
                background: isParticipantVisual
                  ? 'linear-gradient(90deg, rgba(220,252,231,0), #DCFCE7 58%)'
                  : 'linear-gradient(90deg, rgba(208,214,238,0), #D0D6EE 58%)',
              }}
            >
              …
            </span>
          )}
        </div>
        {hasHeaderTagOverflow && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setHeaderTagsExpanded(v => !v); }}
            className="flex items-center gap-0.5 shrink-0 h-6 px-1 rounded-md"
            style={{ color: '#9CA3AF' }}
            aria-label={headerTagsExpanded ? `收起${headerTagCount}个标签` : `展开${headerTagCount}个标签`}
          >
            <span className="text-[11px] font-semibold tabular-nums">{headerTagCount}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${headerTagsExpanded ? 'rotate-180' : ''}`} />
          </button>
        )}
        {allowImageDownload && (
          <OrderCardImageDownload
            targetRef={cardExportRef}
            currentUser={currentUser}
            orderNo={order.order_no || order.id}
            color="#64748B"
          />
        )}
      </div>

      {/* 主体：左右两栏布局 */}
      <div className="flex">

        {/* 左栏：持有资产 */}
        <div className="w-1/2 p-4 pr-3">
          <div className="flex items-center gap-0.5 mb-0.5">
            <span className="text-[10px] font-medium" style={{ color: '#3B82F6' }}>
              {principalLentOut
                ? `借出本金 (${amountCurrency})`
                : '持有资产'}
            </span>
            {(order as any).order_fill_status === 'pending' && (
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5" style={{ borderRadius: '4px', color: '#fff', backgroundColor: '#F97316' }}>挂单中</span>
            )}
            {isParticipantVisual && (
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0" style={{ borderRadius: '4px', color: '#16A34A', backgroundColor: '#fff', border: '1px solid #16A34A' }}>参与</span>
            )}
            {assetFundingType && (
              <span
                className="ml-1 text-[10px] font-bold px-1.5 py-0"
                style={assetFundingType === 'self'
                  ? { borderRadius: '4px', color: '#047857', backgroundColor: '#ECFDF5', border: '1px solid #6EE7B7' }
                  : { borderRadius: '4px', color: '#1D4ED8', backgroundColor: '#EFF6FF', border: '1px solid #93C5FD' }}
              >
                {assetFundingType === 'self' ? '自有资产' : '融资付息'}
              </span>
            )}
            {order.asset_type === 'crypto' && show('showTradeDirection') && (order as any).trade_direction === 'long' && (
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0" style={{ borderRadius: '4px', color: '#fff', backgroundColor: '#DC2626', border: '1px solid #DC2626' }}>多</span>
            )}
            {order.asset_type === 'crypto' && show('showTradeDirection') && (order as any).trade_direction === 'short' && (
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0" style={{ borderRadius: '4px', color: '#fff', backgroundColor: '#16A34A', border: '1px solid #16A34A' }}>空</span>
            )}
          </div>
          <div className="min-h-9 flex flex-col justify-center">
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: '#1A2340' }}>
                {displayFinancingAsPrimary
                  ? financingDisplayAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })
                  : order.asset_type === 'stock'
                    ? (order.amount !== null && order.amount !== undefined && order.amount !== '' ? totalU.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0')
                    : isOptionOrder
                      ? (optionInfo?.buyQty ? String(optionInfo.buyQty) : '---')
                      : (order.buy_quantity !== null && order.buy_quantity !== undefined && order.buy_quantity !== '' ? formatCoinQtyFunder(qty, order.coin) : '0')}
              </span>
              <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>
                {displayFinancingAsPrimary ? financingDisplayUnit : isOptionOrder ? '张' : (order.coin === 'CNY' ? '元' : order.coin)}
              </span>
{(() => {
                const approxHolding = dc?.approxHolding ?? 'U';
                if (approxHolding === 'hidden') return null;
                if (displayFinancingAsPrimary) {
                  if (!(financingAmountUsdt > 0)) return null;
                  if (amountCurrency === 'CNY') return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{financingAmountUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} u</span>;
                  if (amountCurrency === 'USDT') return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(financingAmountUsdt * cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 元</span>;
                  if (approxHolding === 'U') return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{financingAmountUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} u</span>;
                  return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(financingAmountUsdt * cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 元</span>;
                }
                if (order.asset_type === 'stock') {
                  if (!(totalU > 0 && order.coin === 'CNY')) return null;
                  if (approxHolding === 'U') return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(totalU / cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} u</span>;
                  return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{totalU.toLocaleString(undefined, { maximumFractionDigits: 0 })} 元</span>;
                }
                // 期权持仓的近似价值只能使用实时合约标记价 × 张数，不能使用标的现货价或行权价。
                if (isOptionOrder) {
                  if (optionCurrentValue === null) return null;
                  if (approxHolding === 'U') return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{optionCurrentValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} u</span>;
                  return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(optionCurrentValue * cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 元</span>;
                }
                if (!liveP || !(qty > 0)) return null;
                const valU = qty * liveP;
                if (approxHolding === 'U') return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{valU.toLocaleString(undefined, { maximumFractionDigits: 2 })} u</span>;
                return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{(valU * cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 元</span>;
              })()}
            </div>
          </div>

          <div className="space-y-0.5 text-xs">
            {/* 期权专属：标的/方向/到期/行权价/权利金 */}
            {isOptionOrder && optionInfo && (
              <>
                {optionInfo.coin && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 shrink-0">标的</span>
                    <span className="font-medium" style={{ color: '#1A2340' }}>{optionInfo.coin}</span>
                  </div>
                )}
                {optionInfo.direction && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 shrink-0">方向</span>
                    <span className="font-medium" style={{ color: '#1A2340' }}>{
                      optionInfo.direction === 'long_call' ? '买入看涨' :
                      optionInfo.direction === 'long_put' ? '买入看跌' :
                      optionInfo.direction === 'short_call' ? '卖出看涨' :
                      optionInfo.direction === 'short_put' ? '卖出看跌' : optionInfo.direction
                    }</span>
                  </div>
                )}
                {optionInfo.exerciseDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 shrink-0">到期日</span>
                    <span className="font-medium" style={{ color: '#1A2340' }}>{optionInfo.exerciseDate}</span>
                  </div>
                )}
                {optionInfo.strikePrice && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 shrink-0">行权价</span>
                    <span className="font-medium" style={{ color: '#1A2340' }}>{Number(optionInfo.strikePrice).toLocaleString()} u</span>
                  </div>
                )}
                {optionInfo.premium && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 shrink-0">权利金</span>
                    <span className="font-medium" style={{ color: '#1A2340' }}>{parseFloat(optionInfo.premium).toFixed(2)} {optionPremiumDisplayUnit}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 shrink-0">期权价格</span>
                  <span className="font-medium" style={{ color: '#1A2340' }}>
                    {greeksResult.loading && !greeksResult.data ? '加载中...' : greeksResult.data?.markPrice != null ? `${greeksResult.data.markPrice.toFixed(2)} u` : '--'}
                  </span>
                </div>
              </>
            )}
            {show('buyPrice') && price > 0 && !isStockOrder && !isOptionOrder && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{price.toLocaleString()} {buyQuoteUnit}</span>
              </div>
            )}
            {show('buyValue') && quotedBuyValue > 0 && !isStockOrder && !isOptionOrder && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">买入价值</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{quotedBuyValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {buyQuoteUnit}</span>
              </div>
            )}
            {/* 计息基数已移至右侧（已结利息与计息日期之间） */}
            {show('openPrice') && order.buy_price && parseFloat(order.buy_price) > 0 && order.coin !== 'CNY' && order.coin !== 'USDT' && !isStockOrder && !isOptionOrder && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">开仓币价</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(order.buy_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {buyQuoteUnit}</span>
              </div>
            )}
            {show('todayPrice') && order.coin !== 'CNY' && order.coin !== 'USDT' && !isOptionOrder && liveP != null && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">当前币价</span>
                {(() => {
                  const buyPrice = order.buy_price ? quotedPriceUsdt : null;
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
                      {liveP != null ? liveP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' u' : '---'}
                    </span>
                  );
                })()}
              </div>
            )}
            {show('todayPrice') && order.coin !== 'CNY' && order.coin !== 'USDT' && !isOptionOrder && ((order as any).currentPriceUpdatedAt || (order as any).currentPriceStale) && (
              <div className="flex items-center justify-between text-[10px] -mt-1">
                <span className="text-gray-400 shrink-0">行情状态</span>
                <span style={{ color: (order as any).currentPriceStale ? '#D97706' : '#9CA3AF' }}>
                  {(order as any).currentPriceStale
                    ? '更新延迟，请以行情源为准'
                    : `${(order as any).currentPriceSource || '行情源'} · ${new Date((order as any).currentPriceUpdatedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`}
                </span>
              </div>
            )}
            {show('floatPnl') && (isOptionOrder || isConfiguredStockPnlSource || floatPnl !== null) && (order as any).order_fill_status !== 'pending' && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0 inline-flex items-center gap-1">浮动盈亏
                  {isManualStockPnlSource && <button type="button" onClick={() => setShowManualStockPnlDetail(true)} className="relative w-3.5 h-3.5 rounded-full inline-flex items-center justify-center flex-shrink-0 font-bold leading-none" style={SOFT_BLUE_INDICATOR_STYLE} title="查看股票组合盘尾价与浮动盈亏"><HelpMarkerText symbol="!" /></button>}
                </span>
                {isConfiguredStockPnlSource ? (
                  configuredStockFloatPnlCny !== null ? (
                    <span className="font-medium tabular-nums whitespace-nowrap" style={{ color: configuredStockFloatPnlCny >= 0 ? '#DC2626' : '#16A34A' }}>
                      {configuredStockFloatPnlCny >= 0 ? '+' : ''}{configuredStockFloatPnlCny.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元
                    </span>
                  ) : (
                    <span className="font-medium text-gray-400">{isManualStockPnlSource ? (manualStockCloseQuery.isLoading ? '读取盘尾价...' : '等待盘尾价格') : (_pnlTagSummary ? '暂无37号数据' : '加载37号数据...')}</span>
                  )
                ) : floatPnl !== null ? (
                  <span className="font-medium tabular-nums whitespace-nowrap" style={{ color: floatPnl >= 0 ? '#DC2626' : '#16A34A' }}>
                    {floatPnl >= 0 ? '+' : ''}{floatPnl.toLocaleString(undefined, { maximumFractionDigits: 2 })} u
                  </span>
                ) : (
                  <span className="font-medium text-gray-400">{greeksResult.loading ? '加载中...' : '暂无合约报价'}</span>
                )}
              </div>
            )}
            {showManualStockPnlDetail && isManualStockPnlSource && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowManualStockPnlDetail(false)}>
                <div className="mx-4 w-full max-w-sm overflow-y-auto rounded-2xl bg-white" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '85vh' }} onClick={event => event.stopPropagation()}>
                  <div className="flex items-center justify-between px-5 pb-2 pt-4">
                    <span className="text-sm font-bold" style={{ color: '#1A2340' }}>股票浮动盈亏明细</span>
                    <button onClick={() => setShowManualStockPnlDetail(false)} className="text-lg leading-none text-gray-400">×</button>
                  </div>
                  <div className="mx-4 mb-3 rounded-lg bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-700">
                    {manualStockPnlCalculationMode === 'total_capital'
                      ? `新增股票时先带入一笔最新价；每日盘尾 15:05 固定以盘尾价更新。差值 = 最新持仓市值合计 − 账户初始总额度；账户盈亏 = 差值 × 计算系数 ${manualStockPnlCoefficient}。美元股票按当日系统汇率折算为人民币。`
                      : `每日盘尾 15:05 固定更新。未填卖出价：原始盈亏 =（盘尾价 − 买入价）× 股数；填写卖出价后按卖出价锁定计算。所有股票原始盈亏先合计，再乘计算系数 ${manualStockPnlCoefficient}。美元股票按当日系统汇率折算为人民币。`}
                  </div>
                  <div className="px-4 pb-4">
                    {manualStockPnlDetail.map((position) => (
                      <div key={position.symbol} className="border-b border-gray-100 py-3 last:border-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-sm" style={{ color: '#1A2340' }}>{position.name ? `${position.name} · ` : ''}{position.symbol}</span>
                          <span className="text-sm font-semibold tabular-nums" style={{ color: manualStockPnlCalculationMode === 'total_capital' ? '#1A2340' : (position.pnlCny ?? 0) >= 0 ? '#DC2626' : '#16A34A' }}>
                            {manualStockPnlCalculationMode === 'total_capital'
                              ? (position.marketValueCny === null ? '暂未取得最新价' : `市值 ${position.marketValueCny.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元`)
                              : (position.pnlCny === null ? '等待盘尾价' : `${position.pnlCny >= 0 ? '+' : ''}${position.pnlCny.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元`)}
                          </span>
                        </div>
                        {manualStockPnlCalculationMode === 'total_capital' ? (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                            <span>更新于：{position.updatedAt ? new Date(position.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : position.priceDate || '选股时'}</span>
                            <span>{position.isCloseSnapshot ? '盘尾价' : '最新价'}：{position.currentPrice === null ? '暂未取得' : `${position.currentPrice.toLocaleString()} ${position.currency === 'CNY' ? '元' : 'USD'}`}</span>
                            <span>股数：{position.quantity.toLocaleString()}</span>
                          </div>
                        ) : (
                          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                            <span>买入价：{position.buyPrice.toLocaleString()} {position.currency === 'CNY' ? '元' : 'USD'}</span>
                            <span>{position.isCloseSnapshot ? '最新盘尾价' : '最新价'}：{position.currentPrice === null ? '暂未取得' : `${position.currentPrice.toLocaleString()} ${position.currency === 'CNY' ? '元' : 'USD'}`}</span>
                            <span>卖出价：{position.sellPrice === null ? '未填写' : `${position.sellPrice.toLocaleString()} ${position.currency === 'CNY' ? '元' : 'USD'}`}</span>
                            <span>{position.sellPrice === null ? '计算价：盘尾价' : `计算价：${position.valuationPrice?.toLocaleString()} ${position.currency === 'CNY' ? '元' : 'USD'}`}</span>
                            <span>股数：{position.quantity.toLocaleString()}</span>
                            <span>更新于：{position.updatedAt ? new Date(position.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '待首次盘尾更新'}</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {manualStockPnlCalculationMode === 'total_capital' ? (
                      <div className="mt-3 space-y-2.5 border-t border-gray-100 pt-3 text-xs">
                        <div className="rounded-xl border border-gray-100 bg-slate-50 px-3 py-2.5">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-semibold text-gray-700">最新持仓市值合计 · {manualStockPnlDetail.length} 只股票</span>
                            <span className="text-base font-bold tabular-nums" style={{ color: manualStockMarketValueColor }}>
                              {manualStockMarketValueCny === null ? '暂未取得最新价' : `${manualStockMarketValueCny.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元`}
                            </span>
                          </div>
                          <div className="mt-1 text-[10px] text-gray-400">{manualStockPnlDetail.find((position) => position.priceDate)?.priceDate ? `价格日期：${manualStockPnlDetail.find((position) => position.priceDate)?.priceDate}` : '价格日期：选股后自动带入'}</div>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                          <span className="text-gray-500">账户初始总额度</span>
                          <span className="font-semibold tabular-nums text-gray-800">− {manualStockTotalCapital.toLocaleString(undefined, { maximumFractionDigits: 2 })} {manualStockCapitalCurrency === 'CNY' ? '元' : 'USD'}{manualStockCapitalCurrency === 'USD' && manualStockTotalCapitalCny !== null ? `（约 ${manualStockTotalCapitalCny.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元）` : ''}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-lg bg-gray-50 px-2.5 py-2">
                          <span className="text-[10px] leading-4 text-gray-500">差值 = 最新持仓市值合计 − 账户初始总额度</span>
                          <span className="text-sm font-bold tabular-nums" style={{ color: manualStockDifferenceColor }}>
                            {manualStockRawFloatPnlCny === null ? '暂未取得' : `${manualStockRawFloatPnlCny >= 0 ? '+' : ''}${manualStockRawFloatPnlCny.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元`}
                          </span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-violet-600">
                          <span>计算系数</span>
                          <span className="font-semibold tabular-nums">× {manualStockPnlCoefficient}</span>
                        </div>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-dashed border-gray-200 pt-2">
                          <span className="text-[10px] leading-4 text-gray-600">账户盈亏 = 差值 × 计算系数</span>
                          <span className="text-base font-bold tabular-nums" style={{ color: manualStockAccountPnlColor }}>
                            {manualStockFloatPnlCny === null ? '暂未取得最新价' : `${manualStockFloatPnlCny >= 0 ? '+' : ''}${manualStockFloatPnlCny.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元`}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1 space-y-2 border-t border-gray-100 pt-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">原始盈亏合计</span>
                          <span className="font-semibold tabular-nums" style={{ color: (manualStockRawFloatPnlCny ?? 0) >= 0 ? '#DC2626' : '#16A34A' }}>
                            {manualStockRawFloatPnlCny === null ? '等待盘尾价' : `${manualStockRawFloatPnlCny >= 0 ? '+' : ''}${manualStockRawFloatPnlCny.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-violet-600">
                          <span>计算系数</span>
                          <span className="font-semibold tabular-nums">× {manualStockPnlCoefficient}</span>
                        </div>
                        <div className="flex items-center justify-between pt-0.5">
                          <span className="font-semibold text-gray-600">股票组合浮动盈亏</span>
                          <span className="font-bold tabular-nums" style={{ color: (manualStockFloatPnlCny ?? 0) >= 0 ? '#DC2626' : '#16A34A' }}>
                            {manualStockFloatPnlCny === null ? '等待盘尾价' : `${manualStockFloatPnlCny >= 0 ? '+' : ''}${manualStockFloatPnlCny.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {show('buyDate') && order.buy_date && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">开仓时间</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{fmtDate(order.buy_date)}</span>
              </div>
            )}
            {show('holdDuration') && (
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
            {/* 付息方式已移至右侧（计息时长下面） */}
            {order.storage_account && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">存放账号</span>
                <span className="font-medium truncate ml-2" style={{ color: '#4B5563' }}>{order.storage_account}</span>
              </div>
            )}
            {order.asset_type === 'stock' && show('brokerName') && order.broker_name && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">证券公司</span>
                <span className="font-medium truncate ml-2" style={{ color: '#4B5563' }}>{order.broker_name}</span>
              </div>
            )}
            {order.asset_type === 'stock' && show('brokerAccount') && order.broker_account && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 shrink-0">证券账号</span>
                <span className="font-mono truncate ml-2" style={{ color: '#4B5563' }}>{order.broker_account}</span>
              </div>
            )}
          </div>
        </div>

        {/* 中间分隔线：右栏有任何内容时才显示 */}
        {(show('accruedInterest') || show('paidInterest') || show('interestBase') || show('interestStartDate') || show('interestDuration') || show('interestPaymentType') || show('collateralCoin') || show('collateralValue') || show('collateral')) && (
          <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />
        )}

        {/* 右栏：待结利息 */}
        <div className="w-1/2 p-4 pl-3 flex flex-col">
          {show('accruedInterest') && <div className="flex items-center gap-1 mb-0.5 relative" style={{ height: '16px' }}>
            <span className="text-[10px]" style={{ color: '#3B82F6' }}>待结利息</span>
            {rateAbs && <span className="text-[10px] text-gray-400">(年化 {rateAbs}%)</span>}
            <button
              ref={tipBtnRef}
              type="button"
              onClick={() => {
                if (hasExternalPendingInterest) {
                  setLinkedInterestDetailKind('pending');
                  return;
                }
                if (!showInterestTip && tipBtnRef.current) {
                  const rect = tipBtnRef.current.getBoundingClientRect();
                  setTipPos({ bottom: window.innerHeight - rect.top + 6, right: window.innerWidth - rect.right });
                }
                setShowInterestTip(v => !v);
              }}
              className="relative w-3.5 h-3.5 rounded-full inline-flex items-center justify-center font-bold leading-none flex-shrink-0"
              style={SOFT_BLUE_INDICATOR_STYLE}
              title={hasExternalPendingInterest ? '查看37号账本待结利息明细' : '查看52号账本待结利息计算说明'}
            >{hasExternalPendingInterest ? <Linked37BadgeText /> : <HelpMarkerText symbol="?" />}</button>
            {/* 已结利息历史浮层 */}
            {showInterestHistory && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowInterestHistory(false)}>
                <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold" style={{ color: '#1A2340' }}>已结利息记录</span>
                    <button onClick={() => setShowInterestHistory(false)} className="text-gray-400 text-lg leading-none">×</button>
                  </div>
                  {interestHistoryQuery.isLoading && <div className="text-xs text-gray-400 text-center py-4">加载中…</div>}
                  {interestHistoryQuery.data && (interestHistoryQuery.data as any[]).length === 0 && (
                    <div className="text-xs text-gray-400 text-center py-4">暂无结息记录</div>
                  )}
                  {interestHistoryQuery.data && (interestHistoryQuery.data as any[]).length > 0 && (
                    <div>
                      {(interestHistoryQuery.data as any[]).map((p: any, i: number) => {
                        const cur = (p.currency || 'U') === 'CNY' ? '元' : 'u';
                        const fmtD = (s: string) => { const d = s ? String(s).slice(0, 10) : ''; return d ? `${d.slice(2,4)}.${d.slice(5,7)}.${d.slice(8,10)}` : ''; };
                        const payDateFmt = fmtD(p.pay_date);
                        const ps = p.period_start ? fmtD(p.period_start) : '';
                        const pe = p.period_end ? fmtD(p.period_end) : '';
                        const periodLabel = ps && pe ? `${ps} → ${pe}` : ps ? `${ps} 起` : pe ? `至 ${pe}` : '';
                        const amtStr = `${parseFloat(p.amount || '0').toLocaleString(undefined, { maximumFractionDigits: 4 })} ${cur}`;
                        // 尝试一行：结算周期 + 金额；若无周期则结息日期 + 金额
                        const mainLeft = periodLabel ? `结算周期 ${periodLabel}` : `${payDateFmt} 结息`;
                        // 是否需要第二行（有周期时还需显示结息日期，或有备注）
                        const needSecondLine = !!(periodLabel && payDateFmt) || !!p.note;
                        return (
                          <div key={p.id || i} className="py-2.5" style={{ borderBottom: '1px solid #F0F0F5' }}>
                            {/* 第一行：左侧主信息 + 右侧金额 */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs" style={{ color: '#4B5563' }}>{mainLeft}</span>
                              <span className="text-xs font-semibold shrink-0" style={{ color: '#1A2340' }}>{amtStr}</span>
                            </div>
                            {/* 第二行（如有）：结息日期 + 备注 */}
                            {needSecondLine && (
                              <div className="flex items-center gap-2 mt-0.5">
                                {periodLabel && payDateFmt && <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{payDateFmt} 结息</span>}
                                {p.note && <span className="text-[11px] text-gray-400 truncate">{p.note}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400">共结息 {(interestHistoryQuery.data as any[]).length} 笔</span>
                        <span className="text-xs font-bold" style={{ color: '#3B82F6' }}>
                          {(() => {
                            const rows = interestHistoryQuery.data as any[];
                            const uTotal = rows.filter(r => (r.currency || 'U') !== 'CNY').reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
                            const cnyTotal = rows.filter(r => (r.currency || 'U') === 'CNY').reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
                            const parts = [];
                            if (uTotal > 0) parts.push(`${uTotal.toLocaleString(undefined, { maximumFractionDigits: 4 })} u`);
                            if (cnyTotal > 0) parts.push(`${cnyTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元`);
                            return parts.join(' + ') || '0 u';
                          })()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {linkedInterestDetailKind && _parsedCollateralSource && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setLinkedInterestDetailKind(null)}>
                <div className="rounded-2xl mx-4 w-full max-w-sm overflow-y-auto" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <span className="text-sm font-bold" style={{ color: '#1A2340' }}>37号账本{linkedInterestDetailKind === 'pending' ? '待结' : '已结'}利息明细</span>
                    <button onClick={() => setLinkedInterestDetailKind(null)} className="text-gray-400 text-lg leading-none">×</button>
                  </div>
                  <div className="mx-4 mb-2 rounded-lg bg-blue-50 px-3 py-2 text-[11px] leading-4 text-blue-700">
                    {linkedInterestDetailKind === 'pending'
                      ? '本订单只引用自动计息与手工加息；“计入已付”的手工减息不从待结中扣除。'
                      : '本订单只引用“计入已付”的手工减息绝对值；自动计息、手工加息与欠息/上欠均不计入已结。'}
                  </div>
                  <div className="px-2 pb-4">
                    <RightInterestDetail
                      ledgerId={_parsedCollateralSource.ledgerId}
                      tagName={linkedInterestDetailKind === 'pending' ? linkedPendingInterestTagName : linkedPaidInterestTagName}
                    />
                  </div>
                </div>
              </div>
            )}
            {showInterestTip && (() => {
              const startDate = (isInvited ? order.participantInfo?.commissionStartDate : order.interest_start_date) ? String(isInvited ? order.participantInfo.commissionStartDate : order.interest_start_date).slice(0, 10) : null;
              // 已结订单显示冻结的结息日期；进行中订单显示当前北京日期。
              const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
              const interestEndDate = (order as any).interest_end_date || order.settled_at || null;
              const _tipEndTs = interestEndDate ? new Date(interestEndDate).getTime() : Date.now();
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
              const baseCurLabel = baseCur === 'CNY' ? '元' : 'u';
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
                          <div className="flex justify-between"><span>开始日期</span><span className="font-mono font-medium">{fmtDate(startDate)}</span></div>
                          <div className="flex justify-between"><span>{interestEndDate ? '结息截止日' : '当前日期'}</span><span className="font-mono font-medium">{fmtDate(interestEndDate ? String(interestEndDate).slice(0, 10) : todayStr)}</span></div>
                          <div className="flex justify-between"><span>已过时间</span><span className="font-mono font-medium">{elapsedLabel}</span></div>
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                        <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 计算公式</div>
                        <div>计息基数 × 年化利率 ÷ 365天 × 已过天数</div>
                        <div className="mt-1 font-mono">
                          <span style={{ color: '#3B82F6' }}>{base.toLocaleString()}{baseCurLabel} × {formatFunderAnnualRate(rate)}% ÷ 365天 × {elapsedDays}天</span>
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
          </div>}
          {show('accruedInterest') && (
          <div className="flex items-baseline gap-0.5 flex-wrap mb-1">
                <span className="text-2xl font-bold tabular-nums leading-tight" style={{ color: displayedAccruedValue === 0 ? '#1A2340' : (isNegRate ? '#059669' : '#DC2626'), fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                  {displayedAccruedValue === null ? '加载中' : <>{displayedAccruedValue === 0 ? '' : (isNegRate ? '-' : '+')}{displayedAccruedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>}
                </span>
                <span className="text-xs font-semibold" style={{ color: '#1A2340' }}>{displayedAccruedUnit}</span>
                {(() => {
                  const approxInterest = dc?.approxInterest ?? 'U';
                  if (approxInterest === 'hidden' || displayedAccruedValue === null) return null;
                  const showU = approxInterest === 'U';
                  const val = hasExternalPendingInterest
                    ? (showU ? displayedAccruedAltValue : displayedAccruedValue)
                    : (showU ? (rateCur === 'CNY' ? displayAccrued / cnyRate : displayAccrued) : (rateCur === 'CNY' ? displayAccrued : displayAccrued * cnyRate));
                  const unit = showU ? 'u' : '元';
                  return <span className="text-xs font-medium leading-tight" style={{ color: '#4B5563' }}>≈{val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unit}</span>;
                })()}
          </div>
          )}
          <div className="space-y-0.5 text-xs">
            {show('paidInterest') && (
            <>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <span className="whitespace-nowrap">已结利息</span>
                <button
                  type="button"
                  onClick={() => hasExternalPaidInterest ? setLinkedInterestDetailKind('paid') : setShowInterestHistory(v => !v)}
                  className="relative w-3.5 h-3.5 rounded-full inline-flex items-center justify-center font-bold leading-none flex-shrink-0"
                  style={SOFT_BLUE_INDICATOR_STYLE}
                  title={hasExternalPaidInterest ? '查看37号账本已结利息明细' : '已结利息记录'}
                >{hasExternalPaidInterest ? <Linked37BadgeText /> : <HelpMarkerText symbol="!" />}</button>
              </span>
              <span className="font-medium" style={{ color: '#4B5563' }}>
                {displayedPaidValue === null
                  ? <span className="text-xs text-gray-400">加载37号利息...</span>
                  : <>{displayedPaidValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayedPaidUnit}</>}
              </span>
            </div>
            {(() => {
              const approxPaid = (dc as any)?.approxPaid ?? 'U';
              if (approxPaid === 'hidden' || displayedPaidValue === null) return null;
              const showU = approxPaid === 'U';
              const approxPaidVal = hasExternalPaidInterest
                ? (showU ? displayedPaidAltValue : displayedPaidValue)
                : (showU
                  ? (interestUnit === 'u' ? displayPaid : (displayPaid / cnyRate))
                  : (interestUnit === 'u' ? (displayPaid * cnyRate) : displayPaid));
              const approxPaidUnit = showU ? 'u' : '元';
              return (
                <div className="flex justify-end">
                  <span className="text-gray-400">≈{approxPaidVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {approxPaidUnit}</span>
                </div>
              );
            })()}
            </>
            )}
            {showTradingFee && (
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-gray-400 whitespace-nowrap">
                  <span>手续费</span>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap" style={{
                    background: tradingFeeStatus === 'paid' ? '#DCFCE7' : tradingFeeStatus === 'half_paid' ? '#FEF3C7' : '#FEE2E2',
                    color: tradingFeeStatus === 'paid' ? '#15803D' : tradingFeeStatus === 'half_paid' ? '#B45309' : '#B91C1C',
                  }}>{tradingFeeStatusLabel}</span>
                </span>
                <span className="font-medium whitespace-nowrap text-right" style={{ color: '#4B5563' }}>
                  {referenceTradingFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {interestUnit}
                </span>
              </div>
            )}
            {show('interestBase') && order.interest_base && parseFloat(order.interest_base) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 whitespace-nowrap">计息基数</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {parseFloat(order.interest_base).toLocaleString(undefined, { maximumFractionDigits: 2 })} {baseUnit}
                </span>
              </div>
            )}
            {show('interestStartDate') && order.interest_start_date && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">计息日期</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>
                  {fmtDate(String(order.interest_start_date))}
                </span>
              </div>
            )}
            {show('interestDuration') && (() => {
              if (!order.interest_start_date || (order.status !== 'active' && !interestEndAt)) {
                return (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">计息时长</span>
                    <span className="font-medium" style={{ color: '#4B5563' }}>0小时</span>
                  </div>
                );
              }
              const endTs = interestEndAt ? new Date(interestEndAt).getTime() : Date.now();
              const elapsed = endTs - new Date(String(order.interest_start_date).slice(0, 10) + 'T00:00:00+08:00').getTime();
              const label = elapsed <= 0 ? '0小时' : (() => {
                const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
                const days = Math.floor(totalHours / 24);
                const hours = totalHours % 24;
                return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
              })();
              return (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">计息时长</span>
                  <span className="font-medium" style={{ color: '#4B5563' }}>{label}</span>
                </div>
              );
            })()}
            {order.interest_payment_type && show('interestPaymentType') && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400 whitespace-nowrap">付息方式</span>
                <span className="font-medium" style={{ color: '#4B5563' }}>{$getPaymentLabel(order.interest_payment_type)}</span>
              </div>
            )}
            {/* 担保货币（与 LedgerDetail 前端完全一致：受 display_config 开关控制） */}
            {show('collateralCoin') && hasExternalCollateral && (
              <div className="flex items-start justify-between gap-1 text-xs mt-0.5">
                <span className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                  <span className="text-gray-400 whitespace-nowrap">担保货币</span>
                  <button
                    type="button"
                    className="relative w-3.5 h-3.5 rounded-full inline-flex items-center justify-center font-bold leading-none flex-shrink-0"
                    style={SOFT_BLUE_INDICATOR_STYLE}
                    onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                  ><Linked37BadgeText /></button>
                </span>
                {externalCollateralValueU !== null && Number.isFinite(externalCollateralValueU) ? (
                  <span className="min-w-0 font-medium tabular-nums text-right whitespace-nowrap" style={{ color: '#1A2340' }}>
                    {externalCollateralValueDisplay === 'CRYPTO'
                      ? (isSharedMode ? '共享担保（按池合计）' : (externalCollateralSummary.currencyLabel || '0'))
                      : <>{isSharedMode ? '共享合计 ' : ''}{externalCollateralValueDisplay === 'CNY' && externalCollateralValueCny !== null
                      ? `${externalCollateralValueCny.toLocaleString(undefined, { maximumFractionDigits: 0 })} 元`
                      : `${externalCollateralValueU.toLocaleString(undefined, { maximumFractionDigits: 2 })} u`}</>}
                  </span>
                ) : <span style={{ color: '#9CA3AF' }}>{isSharedMode ? '共享担保加载中...' : '加载中...'}</span>}
              </div>
            )}
            {show('collateralCoin') && !hasExternalCollateral && (
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
                          <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(a.qty).toLocaleString()} {a.coin === 'CNY' ? '元' : a.coin}</span>
                        </div>
                        {collateralItemValues[idx] !== null && collateralItemValues[idx] !== undefined && (() => {
                          // 支持对象格式（每条独立）和字符串格式（全局兼容）
                          const aciRaw = dc?.approxCollateralItem;
                          const approxCI = aciRaw && typeof aciRaw === 'object' && !Array.isArray(aciRaw)
                            ? ((aciRaw as Record<string,string>)[String(idx)] ?? 'U')
                            : (typeof aciRaw === 'string' ? aciRaw : 'U');
                          if (approxCI === 'hidden') return null;
                          const ciVal = collateralItemValues[idx] as number;
                          const ciDisplay = approxCI === 'U' ? `${ciVal.toLocaleString(undefined, { maximumFractionDigits: 2 })} u` : `${(ciVal * cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 元`;
                          return <div className="flex items-center justify-between mt-0.5"><span></span><span className="font-medium" style={{ color: '#4B5563' }}>≈ {ciDisplay}</span></div>;
                        })()}
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
                          <span className="flex items-center gap-1">
                            <span className="text-gray-400">{collateralAssets.length > 1 ? `担保货币${idx + 1}` : '担保货币'}</span>
                            {hasExternalCollateral && idx === 0 && (
                              <button
                                type="button"
                                className="relative w-3.5 h-3.5 rounded-full inline-flex items-center justify-center font-bold leading-none flex-shrink-0"
                                style={SOFT_BLUE_INDICATOR_STYLE}
                                onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                              ><HelpMarkerText symbol="!" /></button>
                            )}
                          </span>
                          <span className="font-medium" style={{ color: '#4B5563' }}>{parseFloat(a.qty).toLocaleString()} {a.coin === 'CNY' ? '元' : a.coin}</span>
                        </div>
                        {collateralItemValues[idx] !== null && collateralItemValues[idx] !== undefined && (() => {
                          const aciRaw = dc?.approxCollateralItem;
                          const approxCI = aciRaw && typeof aciRaw === 'object' && !Array.isArray(aciRaw)
                            ? ((aciRaw as Record<string,string>)[String(idx)] ?? 'U')
                            : (typeof aciRaw === 'string' ? aciRaw : 'U');
                          if (approxCI === 'hidden') return null;
                          const ciVal = collateralItemValues[idx] as number;
                          const ciDisplay = approxCI === 'U' ? `${ciVal.toLocaleString(undefined, { maximumFractionDigits: 2 })} u` : `${(ciVal * cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 元`;
                          return <div className="flex items-center justify-between mt-0.5"><span></span><span className="font-medium" style={{ color: '#4B5563' }}>≈ {ciDisplay}</span></div>;
                        })()}
                      </div>
                    ))
                )
            )}
            {(isSharedMode && !hasExternalCollateral
              // 共享池只影响担保缺口统算；本订单的担保价值始终展示本订单实际录入的担保物。
              // 即使本订单未录入担保物，也应明确显示 0，而不能把共享池合计代入此处。
              ? show('collateralValue')
              : (isStockOrder && !hasExternalCollateral
                ? (collateralAssets.length > 0 && show('collateralValue'))
                : (collateralAssets.length > 1 ? approxCollateralTotal !== 'hidden' : show('collateralValue')))) && (() => {
              if (hasExternalCollateral) {
                // 37标签订单的担保价值已紧随“担保货币”展示，避免同一保证金总值重复两次。
                return null;
              }
              const approxCV = dc?.approxCollateralValue ?? 'U';
              const isManualSharedCollateral = isSharedMode && !hasExternalCollateral;
              const orderCollateralValueU = collateralValueKnown ? collateralValue : null;
              const localValueDisplay = isStockOrder
                ? stockManualCollateralValueDisplay
                : (approxCollateralTotal === 'CNY' ? 'CNY' : 'U');
              const cvDisplay = isStockOrder || isManualSharedCollateral
                ? (orderCollateralValueU !== null && Number.isFinite(orderCollateralValueU)
                  ? (localValueDisplay === 'CNY'
                    ? `≈ ${(orderCollateralValueU * cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 元`
                    : `≈ ${orderCollateralValueU.toLocaleString(undefined, { maximumFractionDigits: 2 })} u`)
                  : '实时价加载中...')
                : collateralAssets.length > 1
                ? (collateralValueKnown
                  ? (approxCollateralTotal === 'CNY'
                    ? `≈ ${(collateralValue * cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 元`
                    : `≈ ${collateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} u`)
                  : '实时价加载中...')
                : approxCV === 'hidden' ? null
                  : approxCV === 'U' ? `${collateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} u`
                  : `${(collateralValue * cnyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })} 元`;
              return (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">{(isStockOrder || isManualSharedCollateral) ? '担保价值' : (collateralAssets.length > 1 ? '担保总值' : '担保价值')}</span>
                  <span className="font-medium" style={{ color: '#4B5563' }}>{cvDisplay ?? '---'}</span>
                </div>
              );
            })()}
            {(show('collateral') || hasExternalCollateral || isConfiguredStockPnlSource) && (
              <>
              {(showCollateralInfo || showCollateralGapFormulaInfo) && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={closeCollateralInfoDialog}>
                  <div className="rounded-2xl mx-4 w-full max-w-sm overflow-y-auto" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
                    {hasExternalCollateral && _parsedCollateralSource && !showCollateralGapFormulaInfo ? (
                      <>
                        <div className="flex items-center justify-between px-5 pt-4 pb-2">
                          <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保资产详情</span>
                          <button onClick={closeCollateralInfoDialog} className="text-gray-400 text-lg leading-none">×</button>
                        </div>
                        <div className="px-2 pb-4">
                          <RightMarginDetail ledgerId={_parsedCollateralSource.ledgerId} tagName={linkedCollateralTagName} />
                        </div>
                      </>
                    ) : (
                    <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
                      <button onClick={closeCollateralInfoDialog} className="text-gray-400 text-lg leading-none">×</button>
                    </div>
                    <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                      {/* 共享担保订单：新版三段式汇总版式 */}
                      {isConfiguredStockPnlSource && !isSharedMode ? (
                        (() => {
                          const showCny = externalCollateralGapDisplay === 'CNY';
                          const factor = showCny ? cnyRate : 1;
                          const unit = showCny ? '元' : 'u';
                          const formatValue = (value: number) => `${value >= 0 ? '+' : ''}${(value * factor).toLocaleString(undefined, { maximumFractionDigits: showCny ? 0 : 2 })} ${unit}`;
                          const collateralU = linkedCollateralValueU;
                          const floatingPnlU = linkedFloatingPnlU;
                          const pendingInterestU = accruedForRisk;
                          const paidInterestU = paidInterestForRisk;
                          const lentPrincipalU = principalLentOut ? interestBaseForRisk : 0;
                          const gapU = externalNonSharedGapU;
                          const valueColor = (value: number) => value >= 0 ? '#DC2626' : '#16A34A';
                          return (
                            <>
                              <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① {isManualStockPnlSource ? '股票组合浮动盈亏' : '37号浮动盈亏'}</div>
                                <div>{isManualStockPnlSource
                                  ? '每只股票的（每日盘尾价 − 买入价）× 股数之和'
                                  : floatingPnlCalculationMode === 'leveraged_net_pnl'
                                    ? '37标签最新余额 − 初始金额，按账号倍率计算（37号净值盈亏）'
                                    : '37标签今日最新余额 − 初始金额（不使用账号倍率；负数为亏损）'}</div>
                                <div className="mt-1 font-mono">
                                  {floatingPnlU !== null
                                    ? <strong style={{ color: valueColor(floatingPnlU) }}>{formatValue(floatingPnlU)}</strong>
                                    : <span className="text-gray-400">{isManualStockPnlSource ? '盘尾价格加载中...' : '37号标签净值加载中...'}</span>}
                                </div>
                              </div>
                              <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② {hasExternalCollateral ? '37号担保货币' : '手工担保货币'}</div>
                                <div>{hasExternalCollateral ? '37标签所有逐笔保证金按当前价折算的总值' : '本订单手工录入的担保物按当前价折算的总值'}</div>
                                <div className="mt-1 font-mono">
                                  {collateralU !== null
                                    ? <strong style={{ color: '#3B82F6' }}>{formatValue(collateralU)}</strong>
                                    : <span className="text-gray-400">担保物实时价加载中...</span>}
                                </div>
                              </div>
                              <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>③ 订单利息</div>
                                <div className="mt-1 flex justify-between font-mono"><span>待结利息（扣除）</span><span style={{ color: '#16A34A' }}>−{(pendingInterestU * factor).toLocaleString(undefined, { maximumFractionDigits: showCny ? 0 : 2 })} {unit}</span></div>
                                <div className="mt-1 flex justify-between font-mono"><span>已结利息（加回）</span><span style={{ color: '#DC2626' }}>+{(paidInterestU * factor).toLocaleString(undefined, { maximumFractionDigits: showCny ? 0 : 2 })} {unit}</span></div>
                                {principalLentOut && <div className="mt-1 flex justify-between font-mono"><span>借出本金（扣除）</span><span style={{ color: '#16A34A' }}>−{(lentPrincipalU * factor).toLocaleString(undefined, { maximumFractionDigits: showCny ? 0 : 2 })} {unit}</span></div>}
                              </div>
                              <div className="p-2.5 rounded-lg" style={{ background: gapU !== null && gapU >= 0 ? '#FFF1F1' : '#F0FDF4' }}>
                                <div className="font-semibold mb-1" style={{ color: gapU !== null && gapU >= 0 ? '#DC2626' : '#16A34A' }}>④ 担保缺口</div>
                                <div>{hasExternalCollateral ? '37号担保货币' : '手工担保货币'} + 浮动盈亏 − 待结利息 + 已结利息{principalLentOut ? ' − 借出本金' : ''}</div>
                                <div className="mt-1 font-mono">
                                  {gapU !== null && collateralU !== null && floatingPnlU !== null
                                    ? <span style={{ color: '#3B82F6' }}>= {formatValue(collateralU)} + ({formatValue(floatingPnlU)}) − {(pendingInterestU * factor).toLocaleString(undefined, { maximumFractionDigits: showCny ? 0 : 2 })} {unit} + {(paidInterestU * factor).toLocaleString(undefined, { maximumFractionDigits: showCny ? 0 : 2 })} {unit}{principalLentOut ? ` − ${(lentPrincipalU * factor).toLocaleString(undefined, { maximumFractionDigits: showCny ? 0 : 2 })} ${unit}` : ''} = <strong style={{ color: valueColor(gapU) }}>{formatValue(gapU)}</strong></span>
                                    : <span className="text-gray-400">{isManualStockPnlSource ? '盘尾价格数据加载中...' : '37号标签数据加载中...'}</span>}
                                </div>
                                {gapU !== null && <div className="mt-1.5" style={{ color: valueColor(gapU) }}>{gapU >= 0 ? `担保充足，尚有 ${formatValue(gapU)} 的余量` : `担保不足，还需补充 ${formatValue(Math.abs(gapU))} 才能覆盖风险`}</div>}
                              </div>
                            </>
                          );
                        })()
                      ) : orderShareMode === 'self' ? (
                        <>
                          {/* ①② 总计风险敎口 + 保证金比例（移到最上面） */}
                          {sharedPoolInfo && (() => {
                            const orders = (sharedPoolInfo as any).orders ?? [];
                            const totalColl = (sharedPoolInfo as any).totalCollateralValue ?? 0;
                            const allHaveGap = sharedPoolRemainingU !== null;
                            const diff = sharedPoolRemainingU ?? 0;
                            const totalRequired = diff - totalColl;
                            // 总买入价值统一为U后再计算保证金比例，避免人民币计价订单直接以人民币数额混入U分母。
                            const totalBuyValue = orders.reduce((sum: number, o: any) => {
                              const buyValue = Number(o.buyValue ?? 0);
                              const buyValueCurrency = String(o.buyValueCurrency || 'USDT').trim().toUpperCase();
                              return sum + (['CNY', 'RMB', '人民币'].includes(buyValueCurrency) ? buyValue / cnyRate : buyValue);
                            }, 0);
                            const marginRatio = totalBuyValue > 0 ? (diff / totalBuyValue) * 100 : null;
                            const diffColor = diff < 0 ? '#16A34A' : '#DC2626';
                            const ratioColor = marginRatio === null ? '#9CA3AF' : (marginRatio < 0 ? '#16A34A' : '#DC2626');
                            return (
                              <>
                                <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                  <div className="font-semibold mb-1" style={{ color: '#374151' }}>① 总计风险敎口</div>
                                  <div className="font-mono text-xs mb-1.5" style={{ color: '#6B7280' }}>担保物合计 + 净缺口合计</div>
                                  <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>
                                    {allHaveGap
                                      ? <>{totalColl.toFixed(2)} + ({totalRequired >= 0 ? '+' : ''}{totalRequired.toFixed(2)}) = <span className="font-bold text-sm" style={{ color: diffColor }}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} u</span></>
                                      : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                  </div>
                                </div>
                                <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                  <div className="font-semibold mb-1" style={{ color: '#374151' }}>② 保证金比例</div>
                                  <div className="font-mono text-xs mb-1.5" style={{ color: '#6B7280' }}>风险敎口 ÷ 总订单买入价値</div>
                                  <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>
                                    {allHaveGap
                                      ? <>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} ÷ {totalBuyValue.toFixed(2)} = <span className="font-bold text-sm" style={{ color: ratioColor }}>{marginRatio !== null ? `${marginRatio >= 0 ? '+' : ''}${marginRatio.toFixed(2)}%` : '--'}</span></>
                                      : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                  </div>
                                  <div className="text-xs" style={{ color: '#9CA3AF' }}>总买入价値 {totalBuyValue.toFixed(2)} u（各订单买入价 × 数量之和，不随币价变动）</div>
                                </div>
                              </>
                            );
                          })()}

                          {/* ③ 所有共享订单的净风险变动（不含担保物；担保物在第④项一次性汇总） */}
                          <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                            <div className="font-semibold mb-1.5" style={{ color: '#374151' }}>③ 共享订单净风险变动</div>
                            <div className="mb-1" style={{ color: '#9CA3AF' }}>此处不含担保物；卡片行内的担保缺口已计入本订单担保物</div>
                            {sharedPoolInfo ? (
                              <>
                                <div className="space-y-1.5">
                                  {((sharedPoolInfo as any).orders ?? []).map((o: any) => {
                                    // gap = floatPnl - pendingInterest - principalDeduct
                                    // pendingInterest 后端已是净待付（totalInterest - paidInterest），不需要再加 paidInterest
                                    // 盈利订单缺口为正（盈余），亏损订单缺口为负
                                    const oQty = Number(o.quantity ?? 0);
                                    const oPrincipal = Number(o.principal ?? 0);
                                    const oCoin = (o.coin || '').toUpperCase();
                                    const oLiveP = livePrices[oCoin] ?? (o.currentPrice !== null && o.currentPrice !== undefined ? Number(o.currentPrice) : null);
                                    // 标的为CNY仅影响市值；计息基数和待结利息必须按各自币种换算为U。
                                    const isCNY = oCoin === 'CNY';
                                    const oInterestBaseCurrency = String(o.interestBaseCurrency || 'USDT').trim().toUpperCase();
                                    const oInterestBaseIsCNY = ['CNY', 'RMB', '人民币'].includes(oInterestBaseCurrency);
                                    const oAutoAccruedInterestRaw = Number(o.accruedInterest ?? ((Number(o.pendingInterest ?? 0)) + (Number(o.paidInterest ?? 0))));
                                    const oLinkedPendingInterestCny = o.linked37PendingInterestCny;
                                    const oAccruedInterestRaw = oLinkedPendingInterestCny !== null && oLinkedPendingInterestCny !== undefined
                                      ? Number(oLinkedPendingInterestCny)
                                      : oAutoAccruedInterestRaw;
                                    const oPaidInterestRaw = Number(o.paidInterest ?? 0);
                                    const oAccruedInterest = oLinkedPendingInterestCny !== null && oLinkedPendingInterestCny !== undefined
                                      ? oAccruedInterestRaw / cnyRate
                                      : (oInterestBaseIsCNY ? oAccruedInterestRaw / cnyRate : oAccruedInterestRaw);
                                    const oLinkedPaidInterestCny = o.linked37PaidInterestCny;
                                    const oPaidInterest = oLinkedPaidInterestCny !== null && oLinkedPaidInterestCny !== undefined
                                      ? Number(oLinkedPaidInterestCny) / cnyRate
                                      : (oInterestBaseIsCNY ? oPaidInterestRaw / cnyRate : oPaidInterestRaw);
                                    // 期权订单且 quantity=0：无法计算浮动盈亏
                                    // 缺口 = −待结利息 + 已结利息 −（借出开关开时的计息基数）
                                    const isOptionNoQty = o.assetType === 'crypto_option' || (oQty === 0 && o.principalLentOut);
                                    if (isOptionNoQty) {
                                      const oPrincipalLentOutOpt = o.principalLentOut === true || o.principalLentOut === 1;
                                      const oPrincipalU_opt = isCNY ? oPrincipal / cnyRate : oPrincipal;
                                      const oPrincipalDeductOpt = oPrincipalLentOutOpt ? oPrincipalU_opt : 0;
                                      const gap = -oAccruedInterest + oPaidInterest - oPrincipalDeductOpt;
                                      return (
                                        <div key={o.orderId} className="flex justify-between items-center">
                                          <div>
                                            <button type="button" onClick={() => setClickedOrderNo(o.orderNo)} className="font-mono font-medium underline underline-offset-2 cursor-pointer" style={{ color: '#1A56DB', background: 'none', border: 'none', padding: 0 }}>{o.orderNo}</button>
                                            <span className="ml-1.5" style={{ color: '#9CA3AF' }}>{o.coin}</span>
                                          </div>
                                          <div className="text-right">
                                            <span className="font-mono font-semibold" style={{ color: gap >= 0 ? '#DC2626' : '#16A34A' }}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)} u</span>
                                          </div>
                                        </div>
                                      );
                                    }
                                    const oCurrentValue = isCNY ? oQty / cnyRate : (oLiveP !== null ? oLiveP * oQty : null);
                                    const oPrincipalU = oInterestBaseIsCNY ? oPrincipal / cnyRate : oPrincipal;
                                    // 与订单详情保持一致：数字币浮盈 = 实时市值 − 买入价 × 数量，不能用计息基数代替买入成本。
                                    // 股票沿用详情页的计息基数成本口径；历史订单缺少买入值时安全回退计息基数。
                                    const oBuyValue = Number(o.buyValue ?? 0);
                                    const oBuyValueCurrency = String(o.buyValueCurrency || 'USDT').trim().toUpperCase();
                                    const oBuyValueU = ['CNY', 'RMB', '人民币'].includes(oBuyValueCurrency) ? oBuyValue / cnyRate : oBuyValue;
                                    const oFloatBaseU = o.assetType === 'stock' ? oPrincipalU : (oBuyValueU > 0 ? oBuyValueU : oPrincipalU);
                                    // 绑定37标签的股票订单以标签净值盈亏为准，不使用股票行情推算。
                                    const linked37PnlTag = o.linked37PnlTagName ?? o.linked37TagName;
                                    const linked37Pnl = linked37PnlTag ? Number(o.linked37FloatingPnl) : null;
                                    const oFloatPnl = linked37Pnl !== null && Number.isFinite(linked37Pnl)
                                      ? linked37Pnl
                                      : (oCurrentValue !== null ? oCurrentValue - oFloatBaseU : null);
                                    // 借出本金：若勾选了「借出本金」，需从缺口中扣除本金（CNY 订单折算成 U）
                                    const oPrincipalLentOut = o.principalLentOut === true || o.principalLentOut === 1;
                                    const oPrincipalDeduct = oPrincipalLentOut ? oPrincipalU : 0;
                                    const gap = oFloatPnl !== null ? oFloatPnl - oAccruedInterest + oPaidInterest - oPrincipalDeduct : null;
                                    return (
                                      <div key={o.orderId} className="flex justify-between items-center">
                                        <div>
                                          <button type="button" onClick={() => setClickedOrderNo(o.orderNo)} className="font-mono font-medium underline underline-offset-2 cursor-pointer" style={{ color: '#1A56DB', background: 'none', border: 'none', padding: 0 }}>{o.orderNo}</button>
                                          <span className="ml-1.5" style={{ color: '#9CA3AF' }}>{o.coin}</span>
                                          {o.quantity ? <span className="ml-1" style={{ color: '#9CA3AF' }}>× {oCoin === 'BTC' ? oQty.toFixed(2) : oQty}</span> : null}
                                        </div>
                                        <div className="text-right">
                                          {gap !== null
                                            ? <span className="font-mono font-semibold" style={{ color: gap >= 0 ? '#DC2626' : '#16A34A' }}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)} u</span>
                                            : <span className="font-mono" style={{ color: '#9CA3AF' }}>计算中...</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {(() => {
                                  // 共享总计沿用上方已去重的37标签计算：总剩余保证金 − 共享担保物总值。
                                  const totalCollateral = Number((sharedPoolInfo as any).totalCollateralValue ?? 0);
                                  const allKnown = sharedPoolRemainingU !== null;
                                  const totalGapLive = allKnown ? sharedPoolRemainingU! - totalCollateral : 0;
                                  return (
                                    <div className="mt-2 pt-1.5 flex justify-between font-semibold" style={{ borderTop: '1px solid #E5E7EB' }}>
                                  <span style={{ color: '#374151' }}>合计净风险变动</span>
                                      {allKnown
                                        ? <span className="font-mono" style={{ color: totalGapLive >= 0 ? '#DC2626' : '#16A34A' }}>{totalGapLive >= 0 ? '+' : ''}{totalGapLive.toFixed(2)} u</span>
                                        : <span className="font-mono" style={{ color: '#9CA3AF' }}>计算中...</span>}
                                    </div>
                                  );
                                })()}
                              </>
                            ) : (
                              <div className="text-gray-400">加载中...</div>
                            )}
                          </div>

                          {/* ④ 所有担保物汇总 */}
                          <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                            <div className="font-semibold mb-1.5" style={{ color: '#374151' }}>④ 共享担保物汇总</div>
                            {sharedPoolInfo ? (
                              <>
                                <div className="space-y-1.5">
                                  {((sharedPoolInfo as any).orders ?? []).map((o: any) => (
                                    <div key={o.orderId}>
                                      {(o.collateralAssets ?? []).length === 0 ? (
                                        <div className="flex justify-between items-center">
                                          <button type="button" onClick={() => setClickedOrderNo(o.orderNo)} className="font-mono underline underline-offset-2 cursor-pointer" style={{ color: '#1A56DB', background: 'none', border: 'none', padding: 0 }}>{o.orderNo}</button>
                                          <span style={{ color: '#9CA3AF' }}>无担保物</span>
                                        </div>
                                      ) : (
                                        <div className="flex justify-between items-center">
                                          <button type="button" onClick={() => setClickedOrderNo(o.orderNo)} className="font-mono underline underline-offset-2 cursor-pointer" style={{ color: '#1A56DB', background: 'none', border: 'none', padding: 0 }}>{o.orderNo}</button>
                                          <span className="font-mono font-semibold" style={{ color: '#DC2626' }}>
                                            {o.collateralValue > 0 ? `+${o.collateralValue.toFixed(2)} u` : '+--- u'}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 pt-1.5 flex justify-between font-semibold" style={{ borderTop: '1px solid #E5E7EB' }}>
                                  <span style={{ color: '#374151' }}>合计担保物价值</span>
                                  <span className="font-mono" style={{ color: '#DC2626' }}>+{((sharedPoolInfo as any).totalCollateralValue ?? 0).toFixed(2)} u</span>
                                </div>
                              </>
                            ) : (
                              <div className="text-gray-400">加载中...</div>
                            )}
                          </div>

                          {/* 共享担保计算说明 */}
                          <div className="mt-2 p-2.5 rounded-lg text-[10px] space-y-1.5" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#6B7280' }}>
                            <div className="font-semibold text-[11px]" style={{ color: '#374151' }}>计算说明</div>
                            <div>• <strong>卡片行内担保缺口/余量</strong> = 本订单担保物 + 浮动盈亏 − 待结利息 + 已结利息（借出本金订单再减本金）</div>
                            <div>• <strong>本项净风险变动</strong> = 浮动盈亏 − 待结利息 + 已结利息（借出本金订单再减本金）；不含担保物，避免第④项重复相加</div>
                            <div>• <strong>总计风险敎口</strong> = 共享担保物合计 + 各订单净风险变动合计（正数表示担保充足，负数表示担保不足）</div>
                            <div>• <strong>保证金比例</strong> = 风险敎口 ÷ 全部订单买入价值，负数表示担保不足需补仓</div>
                            <div>• <strong>期权订单缺口</strong>：开启「借出本金」开关→ 缺口 = 计息基数 + 待结利息；未开启→ 缺口 = 只有待结利息</div>
                          </div>

                        </>
                      ) : (
                        /* 非共享订单：保留原有三段式计算说明 */
                        <>
                          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 浮动盈亏</div>
                            <div>= 当前市值 - 买入价值（正数为浮盈，负数为亏损）</div>
                            <div className="mt-1 font-mono">
                              {floatPnl !== null
                                ? <><span style={{ color: '#3B82F6' }}>= {currentValue!.toFixed(2)} - {(floatPnlBase ?? 0).toFixed(2)} = </span><strong style={{ color: floatPnl >= 0 ? '#DC2626' : '#16A34A' }}>{floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)} u{floatPnl >= 0 ? '（浮盈）' : '（亏损）'}</strong></>
                                : <span className="text-gray-400">当前市值暂无实时价格，暂无法计算浮动盈亏</span>
                              }
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保价值</div>
                            {collateralAssets.length === 0
                              ? <div className="font-mono mt-1" style={{ color: '#9CA3AF' }}>0.00 u（无担保物）</div>
                              : <>
                                  {collateralAssets.map((a: any, idx: number) => {
                                    const itemVal = collateralItemValues[idx];
                                    return (
                                      <div key={idx} className="mt-1 flex justify-between">
                                        <span className="font-mono" style={{ color: '#6B7280' }}>{a.qty} {a.coin}</span>
                                        {itemVal !== null
                                          ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{itemVal.toFixed(2)} u</span>
                                          : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                                        }
                                      </div>
                                    );
                                  })}
                                  {collateralAssets.length > 1 && (
                                    <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                                      合计 {collateralValue.toFixed(2)} u
                                    </div>
                                  )}
                                </>
                            }
                          </div>
                          <div className="p-2.5 rounded-lg" style={{ background: isSufficient ? '#FFF1F1' : '#F0FDF4' }}>
                            <div className="font-semibold mb-1" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{principalLentOut ? '④' : '③'} 风险敞口</div>
                            <div>担保物 + 浮动盈亏 − 待结利息 + 已结利息{principalLentOut ? ' − 本金（已借出）' : ''}（正数充足，负数缺口）</div>
                            <div className="mt-1 font-mono">
                              {floatPnl !== null
                                ? <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ({floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)}) − {accrued.toFixed(2)} + {paidInterestForRisk.toFixed(2)}{principalLentOut ? ` − ${interestBaseNum.toFixed(2)}（本金）` : ''} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} u</strong></span>
                                : <span style={{ color: '#3B82F6' }}>= {collateralValue.toFixed(2)} + ---（暂无实时价） − {accrued.toFixed(2)} + {paidInterestForRisk.toFixed(2)}{principalLentOut ? ` − ${interestBaseNum.toFixed(2)}（本金）` : ''} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} u</strong></span>
                              }
                            </div>
                            <div className="mt-1.5" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>
                              {isSufficient
                                ? `担保物充足，还有 ${exposure.toFixed(2)} u 的余量空间`
                                : `担保物不足，还需补充 ${Math.abs(exposure).toFixed(2)} u 才能覆盖风险`
                              }
                            </div>
                          </div>
                        </>
                      )}
                      {/* 计算说明注释 */}
                      <div className="mt-3 p-2.5 rounded-lg text-[10px] space-y-1.5" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#6B7280' }}>
                        <div className="font-semibold text-[11px]" style={{ color: '#374151' }}>计算说明</div>
                        {isConfiguredStockPnlSource && !isSharedMode ? (
                          <>
                          <div>• <strong>担保缺口</strong> = {hasExternalCollateral ? '37号担保货币' : '手工担保货币'} + 37号浮动盈亏 − 待结利息 + 已结利息（开启借出本金时再减去计息基数）</div>
                          <div>• <strong>37号浮动盈亏</strong> = {floatingPnlCalculationMode === 'leveraged_net_pnl'
                            ? '（37号标签最新余额 − 初始金额）× 账号倍率，即37号“净值盈亏”数值。'
                            : '37号标签今日最新余额 − 初始金额，不使用账号倍率；结果为负数表示亏损。'}</div>
                          </>
                        ) : (
                          <>
                            <div>• <strong>担保缺口</strong> = 担保物市值 + 浮动盈亏 − 待结利息 + 已结利息（开启借出本金时再减去计息基数）</div>
                            <div>• <strong>浮动盈亏</strong> = 当前市值 − 计息基数（资产上涨为盈，下跌为亏）</div>
                            {isOptionOrder && (
                              <div>• <strong>期权订单</strong>：开启「借出本金」开关→ 担保缺口基数 = 计息基数 + 待结利息；未开启→ 担保缺口 = 只有待结利息。买入期权用行权价×张数作为基数</div>
                            )}
                          </>
                        )}
                        <div>• <strong>正数表示担保充足</strong>（担保物覆盖了所有风险），负数表示担保不足（需要补充担保物）</div>
                      </div>
                    </div>
                    </div>
                    )}
                  </div>
                </div>
              )}
              {/* 第二层弹窗：点击订单号弹出订单详情 */}
              {clickedOrderNo && clickedOrder && (
                <div className="fixed inset-0 z-[220] flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setClickedOrderNo(null)}>
                  <div className="w-full max-w-lg bg-white rounded-t-2xl overflow-y-auto" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-4 pt-4 pb-2">
                      <span className="text-sm font-bold" style={{ color: '#1A2340' }}>{clickedOrderNo} 订单详情</span>
                      <button onClick={() => setClickedOrderNo(null)} className="text-gray-400 text-xl leading-none">×</button>
                    </div>
                    <div className="pb-4">
                      <FunderOrderCard
                        order={clickedOrder}
                        livePrices={livePrices}
                        priceDirection={priceDirection}
                        currentUser={currentUser}
                        isAdmin={isAdmin}
                        membersData={membersData}
                        ledgerId={ledgerId}
                        previewMode={true}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-0.5">
                  <span className="text-gray-400">担保缺口</span>
                  <button
                    onClick={e => { e.stopPropagation(); setShowCollateralGapFormulaInfo(true); }}
                    className="relative w-3.5 h-3.5 rounded-full inline-flex items-center justify-center flex-shrink-0 font-bold leading-none"
                    style={{ ...SOFT_BLUE_INDICATOR_STYLE, cursor: 'pointer' }}
                  ><HelpMarkerText symbol="!" /></button>
                </div>
                {isConfiguredStockPnlSource ? (
                  (isSharedMode ? (showExposureLoading ? null : effectiveExposure) : externalNonSharedGapU) !== null
                    ? (() => {
                        // 卡片行始终显示本订单的担保缺口/余量；共享池总计仅在说明弹窗中展示。
                        const remainingU = isSharedMode ? effectiveExposure : externalNonSharedGapU!;
                        const remaining = externalCollateralGapDisplay === 'CNY' ? remainingU * cnyRate : remainingU;
                        const unit = externalCollateralGapDisplay === 'CNY' ? '元' : 'u';
                        return <span className="font-medium tabular-nums" style={{ color: remaining >= 0 ? '#DC2626' : '#16A34A' }}>
                          {remaining >= 0 ? '+' : ''}{remaining.toLocaleString(undefined, { maximumFractionDigits: externalCollateralGapDisplay === 'CNY' ? 0 : 2 })} {unit}
                        </span>;
                      })()
                    : <span className="text-xs" style={{ color: '#9CA3AF' }}>{isSharedMode ? '担保物估值中...' : '加载中...'}</span>
                ) : (
                  showExposureLoading
                    ? <span className="text-xs" style={{ color: '#9CA3AF' }}>计算中...</span>
                    : (() => {
                        const showCny = isStockOrder && externalCollateralGapDisplay === 'CNY';
                        const displayGap = showCny ? effectiveExposure * cnyRate : effectiveExposure;
                        const unit = showCny ? '元' : 'u';
                        return <span className="font-medium tabular-nums" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>
                          {displayGap >= 0 ? '+' : ''}{displayGap.toLocaleString(undefined, { maximumFractionDigits: showCny ? 0 : 2 })} {unit}
                        </span>;
                      })()
                )}
              </div>
              {/* 保证金率：(担保物市值 + 浮动盈亏 - 应付利息 + 已付利息) ÷ 计息基数 × 100% */}
              {show('marginRate') && !hasExternalCollateral && collateralValueKnown && collateralAssets.length > 0 && interestBaseNum > 0 && (() => {
                const effectiveCollateral = floatPnlForRisk !== null
                  ? collateralValue + floatPnlForRisk - accruedForRisk + paidInterestForRisk
                  : collateralValue - accruedForRisk + paidInterestForRisk;
                const marginRatio = interestBaseForRisk > 0 ? effectiveCollateral / interestBaseForRisk : 0;
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
                          className="relative w-3.5 h-3.5 rounded-full inline-flex items-center justify-center flex-shrink-0 font-bold leading-none"
                          style={{ ...SOFT_BLUE_INDICATOR_STYLE, cursor: 'pointer' }}
                        ><HelpMarkerText symbol="?" /></button>
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
                                      ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{(itemVal as number).toFixed(2)} u</span>
                                      : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                                    }
                                  </div>
                                );
                              })}
                              {collateralAssets.length > 1 && (
                                <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                                  合计 {collateralValue.toFixed(2)} u
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

            {/* 期权 Greeks 面板 */}
            {shouldShowOptionGreeks && (
              <div className="border-t mt-1 pt-1" style={{ borderColor: '#E8EFFF' }}>
                <div className="h-4 flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: '#7C3AED' }}>Greeks</span>
                  {greeksResult.loading && <span className="text-[10px]" style={{ color: '#9CA3AF' }}>刷新中...</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {greeksResult.loading && !greeksResult.data && <div className="text-xs text-gray-400">加载中...</div>}
                  {greeksResult.error && !greeksResult.data && <div className="text-xs" style={{ color: '#DC2626' }}>获取失败: {greeksResult.error}</div>}
                  {(() => {
                    const d = greeksResult.data;
                    if (!d) return null;
                    const hasData = d.delta != null || d.gamma != null || d.markPrice != null;
                    const fmtN = (v: any, dp = 4) => v != null && !isNaN(Number(v)) ? Number(v).toFixed(dp) : '---';
                    if (!hasData) return (
                      <div className="text-xs" style={{ color: '#9CA3AF' }}>
                        {d.instrumentName ? `合约 ${d.instrumentName} 暂无行情数据` : '暂无数据'}
                        {d.error && <span className="ml-1" style={{ color: '#DC2626' }}>({d.error})</span>}
                      </div>
                    );
                    return (
                      <>
                        {d.instrumentName && (
                          <div className="text-[10px] mb-0.5" style={{ color: '#9CA3AF' }}>
                            {d.instrumentName}
                          </div>
                        )}
                        <div className="flex items-center justify-between"><span className="text-gray-400">Delta</span><span className="font-medium" style={{ color: '#4B5563' }}>{fmtN(d.delta)}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-400">Gamma</span><span className="font-medium" style={{ color: '#4B5563' }}>{fmtN(d.gamma)}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-400">Vega</span><span className="font-medium" style={{ color: '#4B5563' }}>{fmtN(d.vega)}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-400">Theta</span><span className="font-medium" style={{ color: '#4B5563' }}>{fmtN(d.theta)}</span></div>
                        {d.iv != null && <div className="flex items-center justify-between"><span className="text-gray-400">IV</span><span className="font-medium" style={{ color: '#4B5563' }}>{(Number(d.iv) * 100).toFixed(1)}%</span></div>}
                        {d.markPrice != null && <div className="flex items-center justify-between"><span className="text-gray-400">期权价格</span><span className="font-medium" style={{ color: '#4B5563' }}>{fmtN(d.markPrice, 2)} u</span></div>}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
            {/* 收益分成（受 display_config.profitShare 开关控制；解析 commission_share 文本拿类型与比例） */}
            {show('profitShare') && order.show_profit_share && order.commission_share && (() => {
              const cs = String(order.commission_share);
              const isCoin = cs.includes('币种收益') || cs.includes('利润分成');
              const typeLabel = isCoin ? '利润分成' : '利息分成';
              const ratioMatch = cs.match(/(\d+(?:\.\d+)?)/);
              const ratioNum = ratioMatch ? parseFloat(ratioMatch[1]) : 0;
              const ratio = ratioNum / 100;
              // 利息分成 = 计息基数×比例；利润分成 = 已实现的实时浮盈×比例。
              // 期权必须使用“实时合约标记价 − 权利金”的专属浮盈，不能使用标的现货或行权价。
              let shareAmt: number | null = null;
              if (!isCoin) {
                if (interestBaseNum > 0 && ratio > 0) shareAmt = interestBaseNum * ratio;
              } else if (isOptionOrder) {
                if (floatPnl !== null && ratio > 0) {
                  // 分成只从正利润中计提；亏损或持平时待分利润为0。
                  shareAmt = Math.max(0, floatPnl) * ratio;
                }
              } else if (liveP != null && price > 0 && qty > 0 && ratio > 0) {
                shareAmt = Math.max(0, (liveP - price) * qty) * ratio;
              }
              const shareAmountLabel = isCoin ? '待分利润' : '待分金额';
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
                    <span className="text-gray-400 shrink-0">{shareAmountLabel}</span>
                    <span className="font-medium tabular-nums" style={{ color: isCoin ? '#DC2626' : '#4B5563' }}>{shareAmt != null ? `≈ ${shareAmt.toLocaleString(undefined, { maximumFractionDigits: 2 })} u` : '---'}</span>
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

      {/* 底部操作栏：仅管理员可见 */}
      {!previewMode && isAdmin && (
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-t overflow-x-auto" style={{ borderColor: '#F3F4F6', backgroundColor: '#FAFBFF', flexWrap: 'nowrap' }}>
          {!isInvited && <button
            onClick={() => handleOpenEdit && handleOpenEdit(order, 'participants')}
            className="px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
            style={{ backgroundColor: '#EDEEF5', color: '#4B5563' }}
          >
            {participantCount > 0 ? `拥有者/参与者 ${participantCount}` : '添加拥有者/参与者'}
          </button>}
          <button
            type="button"
            disabled={hasExternalPaidInterest}
            onClick={() => {
              const isOpening = $showPaymentPanel !== order.id;
              $setShowPaymentPanel(isOpening ? order.id : null);
              $setPaymentForm(() => ({ amount: '', currency: rateCur === 'CNY' ? 'CNY' : 'U', exchangeRate: String(cnyRate || 7.0), payDate: new Date().toISOString().slice(0, 10), note: '' }));
              if (isOpening) {
                // 初始化利息约等于配置
                try {
                  const rawDC = order.display_config;
                  const parsedDC = rawDC ? (typeof rawDC === 'string' ? JSON.parse(rawDC) : rawDC) : {};
                  setInterestApproxConfig({ approxInterest: parsedDC.approxInterest ?? 'U', approxPaid: parsedDC.approxPaid ?? 'U' });
                } catch { setInterestApproxConfig({ approxInterest: 'U', approxPaid: 'U' }); }
              }
            }}
            title={hasExternalPaidInterest ? '已引用37号账本已结利息，不能手工记录结息' : '记录手工结息'}
            className="px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors whitespace-nowrap shrink-0 disabled:cursor-not-allowed"
            style={hasExternalPaidInterest ? { backgroundColor: '#E5E7EB', color: '#9CA3AF' } : { backgroundColor: $showPaymentPanel === order.id ? '#1A2340' : '#EDEEF5', color: $showPaymentPanel === order.id ? '#fff' : '#4B5563' }}
          >
            {hasExternalPaidInterest ? '37号已结已引用' : ($showPaymentPanel === order.id ? '收起' : '记录结息')}
          </button>
          {!isInvited && <button
            onClick={handleOpenCollateralPanel}
            className="px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
            style={{ backgroundColor: showCollateralPanel ? '#1A2340' : '#EDEEF5', color: showCollateralPanel ? '#fff' : '#4B5563' }}
          >
            {showCollateralPanel ? '收起' : '担保'}
          </button>}
          <div className="flex-1" />
          <button
            onClick={() => $handleOpenEdit(order)}
            className="px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
            style={{ backgroundColor: '#EDEEF5', color: '#4B5563' }}
          >
            编辑
          </button>
          {!isInvited && !isSettled && (
            <button
              onClick={() => $onConfirmSettle?.(order.id)}
              className="px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
              style={{ backgroundColor: '#EDEEF5', color: '#4B5563' }}
            >
              结清
            </button>
          )}
          {!isInvited && <button
            onClick={() => {
              if (handleDelete !== undefined) {
                $handleDelete(order.id);
                return;
              }
              if (!window.confirm('确认删除这张订单？')) return;
              if (!window.confirm('再次确认：订单将移入回收站，可随时恢复。确定删除？')) return;
              $handleDelete(order.id);
            }}
            className="px-2.5 py-1.5 text-xs rounded-lg font-medium transition-colors whitespace-nowrap shrink-0"
            style={{ backgroundColor: '#EDEEF5', color: '#4B5563' }}
          >
            删除
          </button>}
        </div>
      )}

      {/* 担保物快捷编辑面板 */}
      {!previewMode && !isInvited && isAdmin && showCollateralPanel && (
        <div className="px-4 pt-3 pb-4 border-t space-y-2" style={{ borderColor: '#E5E7EB', backgroundColor: '#FAFBFF' }}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-xs font-medium" style={{ color: '#1A2340' }}>担保编辑</div>
            <div className="text-[10px] text-gray-400">保存后与完整订单编辑同步</div>
          </div>
          {/* 与完整订单编辑相同的担保字段可见性。历史订单未配置时默认显示，避免快捷保存误隐藏。 */}
          <div className="rounded-xl border border-blue-100 bg-white px-3 py-2.5 space-y-2">
            <div className="text-xs font-medium text-blue-600">担保项目显示</div>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { key: 'collateralCoin', label: '担保货币' },
                { key: 'collateralValue', label: isStockOrder && !hasExternalCollateral ? '担保价值' : '担保总值' },
                { key: 'collateral', label: '担保缺口' },
                { key: 'marginRate', label: '保证金率' },
              ] as { key: keyof typeof collateralVisibility; label: string }[]).map(({ key, label }) => {
                const active = collateralVisibility[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCollateralVisibility(prev => ({ ...prev, [key]: !prev[key] }))}
                    className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-xs transition-colors ${active ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
                  >
                    <span>{label}</span><span className="text-[10px] font-semibold">{active ? '显示' : '隐藏'}</span>
                  </button>
                );
              })}
            </div>
            {collateralVisibility.marginRate && (
              <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
                <span className="shrink-0 text-[11px] text-gray-500">保证金率低于</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="200"
                  value={collateralMarginAlertThreshold}
                  onChange={e => setCollateralMarginAlertThreshold(e.target.value)}
                  placeholder="不预警"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400"
                />
                <span className="shrink-0 text-[11px] text-gray-500">% 时预警</span>
              </div>
            )}
          </div>
          {ledgerId === 52 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="text-xs font-semibold text-slate-600">当前担保汇总（两类担保均计入总值）</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {collateralEditItems.filter((asset) => asset.coin && asset.qty !== '').map((asset, index) => (
                  <span key={`quick-manual-${index}`} className="rounded-md bg-blue-100 px-2 py-1 text-[11px] font-medium text-blue-700">手工 · {asset.qty} {asset.coin}</span>
                ))}
                {walletCollateralEditItems.filter((asset) => asset.coin && asset.qty !== '').map((asset, index) => (
                  <span key={`quick-wallet-${index}`} className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">钱包冻结 · {asset.qty} {asset.coin}</span>
                ))}
                {collateralEditItems.filter((asset) => asset.coin && asset.qty !== '').length === 0 && walletCollateralEditItems.filter((asset) => asset.coin && asset.qty !== '').length === 0 && (
                  <span className="text-[11px] text-slate-400">暂无担保物</span>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 px-0.5">
            <div className="h-px flex-1 bg-blue-100" />
            <span className="text-[11px] font-semibold text-blue-700">手工担保物</span>
            <div className="h-px flex-1 bg-blue-100" />
          </div>
          {ledgerId === 52 && <div className="rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] leading-4 text-blue-700">本区仅管理手工条目；删除或保存不会解除下方的钱包冻结资产。</div>}
          {collateralEditItems.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-gray-200 bg-white p-2.5 space-y-1.5">
              <div className="flex gap-2 items-center">
                <select
                  value={item.coin}
                  onChange={e => setCollateralEditItems(prev => prev.map((a, i) => i === idx ? { ...a, coin: e.target.value } : a))}
                  className="px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-blue-200 appearance-none"
                  style={{ width: '44%', backgroundColor: '#fff', color: (COIN_COLORS as any)[item.coin] || '#1A2340' }}
                >
                  {['CNY', ...COIN_OPTIONS.filter(c => c !== 'CNY')].map(c => (
                    <option key={c} value={c}>{c === 'CNY' ? '元(CNY)' : c}</option>
                  ))}
                </select>
                <input
                  type="number"
                  inputMode="decimal"
                  value={item.qty}
                  onChange={e => setCollateralEditItems(prev => prev.map((a, i) => i === idx ? { ...a, qty: e.target.value } : a))}
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-200"
                  placeholder="数量"
                />
                <button
                  type="button"
                  onClick={() => setCollateralEditItems(prev => prev.filter((_, i) => i !== idx))}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-red-50 text-red-400 text-sm shrink-0"
                >×</button>
              </div>
              <input
                type="text"
                value={item.note || ''}
                onChange={e => setCollateralEditItems(prev => prev.map((a, i) => i === idx ? { ...a, note: e.target.value } : a))}
                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-1 focus:ring-blue-200"
                placeholder="备注（选填）"
              />
              {/* 每条担保独立的约等于显示控制 */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400 shrink-0">约等于：</span>
                {(['hidden', 'U', 'CNY'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setCollateralItemApprox(prev => ({ ...prev, [String(idx)]: opt }));
                      if (opt !== 'hidden') setCollateralVisibility(prev => ({ ...prev, collateralCoin: true }));
                    }}
                    className="flex-1 py-1 text-xs rounded-lg border transition-colors"
                    style={{
                      backgroundColor: (collateralItemApprox[String(idx)] ?? 'U') === opt ? '#3B82F6' : '#fff',
                      color: (collateralItemApprox[String(idx)] ?? 'U') === opt ? '#fff' : '#6B7280',
                      borderColor: (collateralItemApprox[String(idx)] ?? 'U') === opt ? '#3B82F6' : '#E5E7EB'
                    }}
                  >{opt === 'hidden' ? '不显示' : opt === 'U' ? '≈ u' : '≈ 元'}</button>
                ))}
              </div>
            </div>
          ))}
          {/* 担保价值 / 担保总值显示控制：与完整编辑中的不同资产类型规则一致。 */}
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 space-y-2">
            {isStockOrder && hasExternalCollateral ? (
              <>
                <div className="text-xs text-gray-500">37号担保货币主显示</div>
                <div className="flex gap-2">
                  {(['CRYPTO', 'U', 'CNY'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setQuickExternalCollateralValueDisplay(opt);
                        setCollateralVisibility(prev => ({ ...prev, collateralCoin: true }));
                      }}
                      className="flex-1 py-1 text-xs rounded-lg border transition-colors"
                      style={{
                        backgroundColor: quickExternalCollateralValueDisplay === opt ? '#3B82F6' : '#fff',
                        color: quickExternalCollateralValueDisplay === opt ? '#fff' : '#6B7280',
                        borderColor: quickExternalCollateralValueDisplay === opt ? '#3B82F6' : '#E5E7EB',
                      }}
                    >{opt === 'CRYPTO' ? '数字币' : opt === 'U' ? '≈ u' : '≈ 元'}</button>
                  ))}
                </div>
              </>
            ) : isStockOrder ? (
              <>
                <div className="text-xs text-gray-500">担保价值约等于</div>
                <div className="flex gap-2">
                  {(['hidden', 'U', 'CNY'] as const).map(opt => {
                    const selected = !collateralVisibility.collateralValue ? 'hidden' : quickStockManualCollateralValueDisplay;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          if (opt === 'hidden') setCollateralVisibility(prev => ({ ...prev, collateralValue: false }));
                          else {
                            setQuickStockManualCollateralValueDisplay(opt);
                            setCollateralVisibility(prev => ({ ...prev, collateralValue: true }));
                          }
                        }}
                        className="flex-1 py-1 text-xs rounded-lg border transition-colors"
                        style={{
                          backgroundColor: selected === opt ? '#3B82F6' : '#fff',
                          color: selected === opt ? '#fff' : '#6B7280',
                          borderColor: selected === opt ? '#3B82F6' : '#E5E7EB',
                        }}
                      >{opt === 'hidden' ? '不显示' : opt === 'U' ? '≈ u' : '≈ 元'}</button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-gray-500">担保总值约等于</div>
                <div className="flex gap-2">
                  {(['hidden', 'U', 'CNY'] as const).map(opt => {
                    const selected = !collateralVisibility.collateralValue ? 'hidden' : collateralTotalApprox;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          setCollateralTotalApprox(opt);
                          setCollateralVisibility(prev => ({ ...prev, collateralValue: opt !== 'hidden' }));
                        }}
                        className="flex-1 py-1 text-xs rounded-lg border transition-colors"
                        style={{
                          backgroundColor: selected === opt ? '#3B82F6' : '#fff',
                          color: selected === opt ? '#fff' : '#6B7280',
                          borderColor: selected === opt ? '#3B82F6' : '#E5E7EB',
                        }}
                      >{opt === 'hidden' ? '不显示' : opt === 'U' ? '≈ u' : '≈ 元'}</button>
                    );
                  })}
                </div>
              </>
            )}
            {isStockOrder && (
              <>
                <div className="border-t border-gray-100 pt-2 text-xs text-gray-500">担保缺口主显示</div>
                <div className="flex gap-2">
                  {(['U', 'CNY'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setQuickExternalCollateralGapDisplay(opt);
                        setCollateralVisibility(prev => ({ ...prev, collateral: true }));
                      }}
                      className="flex-1 py-1 text-xs rounded-lg border transition-colors"
                      style={{
                        backgroundColor: quickExternalCollateralGapDisplay === opt && collateralVisibility.collateral ? '#3B82F6' : '#fff',
                        color: quickExternalCollateralGapDisplay === opt && collateralVisibility.collateral ? '#fff' : '#6B7280',
                        borderColor: quickExternalCollateralGapDisplay === opt && collateralVisibility.collateral ? '#3B82F6' : '#E5E7EB',
                      }}
                    >{opt === 'U' ? '≈ u' : '≈ 元'}</button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setCollateralEditItems(prev => [...prev, { coin: 'BTC', qty: '', note: '' }])}
            className="w-full py-2 rounded-xl border border-dashed border-blue-300 text-xs text-blue-500 font-medium flex items-center justify-center gap-1"
          ><span className="text-sm leading-none">+</span> 添加担保</button>
          {ledgerId === 52 && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div>
                <div className="text-sm font-semibold text-amber-800">钱包担保物（可与手工担保并行）</div>
                <p className="mt-1 text-[11px] leading-4 text-amber-700">从订单拥有者的钱包冻结数字资产作为担保。总持币不变，但冻结部分不能提现、转账或再次担保；订单结清或移入回收站时自动恢复。此处移除只会解除钱包冻结，不影响上方手工担保。</p>
              </div>
              {quickWalletCollateralUserId <= 0 ? (
                <div className="rounded-lg border border-amber-200 bg-white px-3 py-3 text-center text-xs text-amber-700">未识别订单拥有者，暂不能读取钱包资产。</div>
              ) : quickWalletCollateralBalancesQuery.isLoading ? (
                <div className="rounded-lg bg-white px-3 py-4 text-center text-xs text-gray-400">正在读取钱包可用余额…</div>
              ) : quickWalletCollateralBalancesQuery.isError ? (
                <div className="rounded-lg border border-red-200 bg-white px-3 py-3 text-center text-xs text-red-500">钱包资产读取失败，请刷新后重试。</div>
              ) : (quickWalletCollateralBalancesQuery.data ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-amber-300 bg-white px-3 py-4 text-center text-xs text-amber-700">该用户暂无可用于担保的数字资产。</div>
              ) : (
                <div className="space-y-2">
                  {(quickWalletCollateralBalancesQuery.data ?? []).map((asset: any) => {
                    const assetCode = String(asset.assetCode || '').toUpperCase();
                    const selected = walletCollateralEditItems.find((item) => item.coin === assetCode);
                    const available = Number(asset.availableBalance ?? 0);
                    const frozen = Number(asset.frozenBalance ?? 0);
                    // 已为本订单选定的数量允许回填；其它订单冻结部分绝不被当作可用额度。
                    const maximum = Math.max(0, available + Number(selected?.qty ?? 0));
                    return (
                      <div key={assetCode} className="rounded-lg border border-amber-100 bg-white px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-800">{assetCode}</div>
                            <div className="mt-0.5 text-[11px] text-gray-500">可用 {available.toLocaleString('zh-CN', { maximumFractionDigits: 8 })} · 已冻结 {frozen.toLocaleString('zh-CN', { maximumFractionDigits: 8 })}</div>
                          </div>
                          {selected ? (
                            <button
                              type="button"
                              onClick={() => setWalletCollateralEditItems((previous) => previous.filter((item) => item.coin !== assetCode))}
                              className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-500"
                            >移除</button>
                          ) : (
                            <button
                              type="button"
                              disabled={available <= 0}
                              onClick={() => setWalletCollateralEditItems((previous) => [...previous, { coin: assetCode, qty: '', note: '钱包担保冻结', source: 'wallet' }])}
                              className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
                            >选择</button>
                          )}
                        </div>
                        {selected && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              max={maximum > 0 ? maximum : undefined}
                              step="0.00000001"
                              value={selected.qty}
                              onChange={(event) => setWalletCollateralEditItems((previous) => previous.map((item) => item.coin === assetCode ? { ...item, qty: event.target.value, note: '钱包担保冻结', source: 'wallet' } : item))}
                              placeholder={`最多 ${maximum.toLocaleString('zh-CN', { maximumFractionDigits: 8 })}`}
                              className="min-w-0 flex-1 rounded-lg border border-amber-200 px-3 py-2 text-sm font-semibold outline-none focus:border-amber-500"
                            />
                            <span className="text-xs font-semibold text-amber-700">{assetCode}</span>
                            <button type="button" onClick={() => setWalletCollateralEditItems((previous) => previous.map((item) => item.coin === assetCode ? { ...item, qty: String(maximum), note: '钱包担保冻结', source: 'wallet' } : item))} className="text-xs font-semibold text-amber-700">全部</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={handleSaveWalletCollateral}
                disabled={_intSaveWalletCollateralMutation.isPending || quickWalletCollateralUserId <= 0}
                className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >{_intSaveWalletCollateralMutation.isPending ? '冻结保存中…' : '保存并冻结钱包担保'}</button>
            </div>
          )}
          <button
            type="button"
            onClick={handleSaveCollateral}
            disabled={_intSaveCollateralMutation.isPending || _intSaveParticipantDisplayMutation.isPending}
            className="w-full py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
          >{(_intSaveCollateralMutation.isPending || _intSaveParticipantDisplayMutation.isPending) ? '保存中…' : ledgerId === 52 ? '保存手工担保与显示设置' : '保存担保'}</button>
          {/* 操作日志区 */}
          <CollateralLogSection orderId={Number(order.id)} ledgerId={ledgerId} refreshKey={_intSaveCollateralMutation.isSuccess || _intSaveParticipantDisplayMutation.isSuccess} />
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
      <div
        className={`px-4 pt-3 pb-3 border-t ${isParticipantVisual ? 'border-green-200' : 'border-blue-100'}`}
        style={{ backgroundColor: isParticipantVisual ? '#DCFCE7' : '#D0D6EE' }}
      >

        {$showPaymentPanel === order.id && !hasExternalPaidInterest && (
          <div className="bg-blue-50 rounded-xl p-3 mb-3 space-y-2">
            <div className="flex gap-2 mb-1">
              <span className="text-xs text-gray-500 self-center">结息币种：</span>
              <button
                onClick={() => $setPaymentForm((f: any) => ({ ...f, currency: 'U', exchangeRate: String(cnyRate || 7.0) }))}
                className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                style={{ backgroundColor: $paymentForm.currency === 'U' ? '#1A2340' : '#fff', color: $paymentForm.currency === 'U' ? '#fff' : '#6B7280', borderColor: $paymentForm.currency === 'U' ? '#1A2340' : '#D1D5DB' }}
              >U</button>
              <button
                onClick={() => $setPaymentForm((f: any) => ({ ...f, currency: 'CNY', exchangeRate: String(cnyRate || 7.0) }))}
                className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                style={{ backgroundColor: $paymentForm.currency === 'CNY' ? '#1A2340' : '#fff', color: $paymentForm.currency === 'CNY' ? '#fff' : '#6B7280', borderColor: $paymentForm.currency === 'CNY' ? '#1A2340' : '#D1D5DB' }}
              >元</button>
              {$paymentForm.currency === 'CNY' && cnyRate && (
                <span className="text-[10px] self-center" style={{ color: '#94a3b8' }}>汇率 {cnyRate.toFixed(4)}</span>
              )}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">结息金额 ({$paymentForm.currency === 'CNY' ? '元' : 'u'})</label>
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
            {/* 结算起止日期 */}
            <div className="flex gap-2">
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-gray-500 mb-1">起算日（可选）</label>
                <div className="relative">
                  <button
                    onClick={() => setShowPeriodStartPicker(v => !v)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-left focus:outline-none"
                    style={{ backgroundColor: '#fff', color: ($paymentForm as any).periodStart ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                  >
                    {($paymentForm as any).periodStart || '起算日'}
                  </button>
                  {showPeriodStartPicker && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowPeriodStartPicker(false)}>
                      <div className="bg-white rounded-xl shadow-2xl mx-4 w-full" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
                        <DatePicker value={($paymentForm as any).periodStart || ''} onChange={v => { $setPaymentForm((f: any) => ({ ...f, periodStart: v })); setShowPeriodStartPicker(false); }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-gray-500 mb-1">截止日（可选）</label>
                <div className="relative">
                  <button
                    onClick={() => setShowPeriodEndPicker(v => !v)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-left focus:outline-none"
                    style={{ backgroundColor: '#fff', color: ($paymentForm as any).periodEnd ? '#1A2340' : '#9CA3AF', display: 'block', boxSizing: 'border-box' }}
                  >
                    {($paymentForm as any).periodEnd || '截止日'}
                  </button>
                  {showPeriodEndPicker && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowPeriodEndPicker(false)}>
                      <div className="bg-white rounded-xl shadow-2xl mx-4 w-full" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
                        <DatePicker value={($paymentForm as any).periodEnd || ''} onChange={v => { $setPaymentForm((f: any) => ({ ...f, periodEnd: v })); setShowPeriodEndPicker(false); }} />
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
                $addPaymentMutation.mutate({ ledgerId, orderId: order.id, amount: parseFloat($paymentForm.amount), currency: $paymentForm.currency || 'U', exchangeRate: parseFloat($paymentForm.exchangeRate || String(cnyRate || 6.75)), payDate: $paymentForm.payDate || new Date().toISOString().slice(0, 10), note: $paymentForm.note || undefined, periodStart: ($paymentForm as any).periodStart || undefined, periodEnd: ($paymentForm as any).periodEnd || undefined, participantUserId: _participantUserId });
              }}
              disabled={$addPaymentMutation.isPending}
              className="w-full py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
            >
              {$addPaymentMutation.isPending ? '提交中...' : '确认记录'}
            </button>
          </div>
        )}

        {/* 利息约等于快捷配置（结息面板展开时显示） */}
        {$showPaymentPanel === order.id && !hasExternalPaidInterest && (
          <div className="mt-2 mb-2 rounded-xl p-3 space-y-2" style={{ background: '#F0F4FF' }}>
            <div className="text-xs font-medium mb-1" style={{ color: '#3B82F6' }}>利息约等于显示</div>
            {([
              { key: 'approxInterest' as const, label: '待结利息约等于' },
              { key: 'approxPaid' as const, label: '已结利息约等于' },
            ]).map(({ key, label }) => (
              <div key={key}>
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className="flex gap-1.5">
                  {(['hidden', 'U', 'CNY'] as const).map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setInterestApproxConfig(c => ({ ...c, [key]: opt }))}
                      className="flex-1 py-1 text-xs rounded-lg border transition-colors"
                      style={{
                        background: interestApproxConfig[key] === opt ? '#3B82F6' : '#fff',
                        color: interestApproxConfig[key] === opt ? '#fff' : '#6B7280',
                        borderColor: interestApproxConfig[key] === opt ? '#3B82F6' : '#E5E7EB',
                      }}
                    >
                      {opt === 'hidden' ? '不显示' : opt === 'U' ? '≈ u' : '≈ 元'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                let newDC: Record<string, any> = {};
                try { const rawDC = order.display_config; newDC = rawDC ? (typeof rawDC === 'string' ? JSON.parse(rawDC) : { ...rawDC }) : {}; } catch {}
                newDC.approxInterest = interestApproxConfig.approxInterest;
                newDC.approxPaid = interestApproxConfig.approxPaid;
                if (_participantUserId) {
                  _intSaveParticipantDisplayMutation.mutate({
                    orderId: Number(order.id), ledgerId, userId: Number(_participantUserId),
                    snapshot: { display_config: JSON.stringify(newDC) },
                  });
                } else {
                  _intSaveInterestApproxMutation.mutate({ id: Number(order.id), ledgerId, displayConfig: newDC });
                }
              }}
              disabled={_intSaveInterestApproxMutation.isPending || _intSaveParticipantDisplayMutation.isPending}
              className="w-full py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-50"
              style={{ background: '#3B82F6' }}
            >
              {(_intSaveInterestApproxMutation.isPending || _intSaveParticipantDisplayMutation.isPending) ? '保存中...' : '保存显示设置'}
            </button>
          </div>
        )}

        {$showPaymentPanel === order.id && !hasExternalPaidInterest && Array.isArray($interestPayments) && $interestPayments.length > 0 && (
          <div className="space-y-1.5">
            {$interestPayments.map((p: any) => (
              <div key={p.id}>
                {editPaymentId === p.id ? (
                  /* 内联编辑表单 */
                  <div className="bg-blue-50 rounded-xl p-3 space-y-2 border border-blue-100">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">金额</label>
                        <input type="number" value={editPaymentForm.amount} onChange={e => setEditPaymentForm(f => ({ ...f, amount: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none" style={{ boxSizing: 'border-box' }} />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">币种</label>
                        <select value={editPaymentForm.currency} onChange={e => setEditPaymentForm(f => ({ ...f, currency: e.target.value as 'CNY'|'U' }))} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none" style={{ boxSizing: 'border-box' }}>
                          <option value="U">u (USDT)</option>
                          <option value="CNY">元 (CNY)</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 min-w-0">
                        <label className="block text-xs text-gray-500 mb-1">结息日期</label>
                        <div className="relative">
                          <button onClick={() => setShowEditDatePicker(v => !v)} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-left focus:outline-none" style={{ backgroundColor: '#fff', color: editPaymentForm.payDate ? '#1A2340' : '#9CA3AF', boxSizing: 'border-box' }}>{editPaymentForm.payDate || '选择日期'}</button>
                          {showEditDatePicker && (<div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowEditDatePicker(false)}><div className="bg-white rounded-xl shadow-2xl mx-4 w-full" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}><DatePicker value={editPaymentForm.payDate} onChange={v => { setEditPaymentForm(f => ({ ...f, payDate: v })); setShowEditDatePicker(false); }} /></div></div>)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 min-w-0">
                        <label className="block text-xs text-gray-500 mb-1">起算日</label>
                        <div className="relative">
                          <button onClick={() => setShowEditStartPicker(v => !v)} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-left focus:outline-none" style={{ backgroundColor: '#fff', color: editPaymentForm.periodStart ? '#1A2340' : '#9CA3AF', boxSizing: 'border-box' }}>{editPaymentForm.periodStart || '起算日'}</button>
                          {showEditStartPicker && (<div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowEditStartPicker(false)}><div className="bg-white rounded-xl shadow-2xl mx-4 w-full" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}><DatePicker value={editPaymentForm.periodStart} onChange={v => { setEditPaymentForm(f => ({ ...f, periodStart: v })); setShowEditStartPicker(false); }} /></div></div>)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="block text-xs text-gray-500 mb-1">截止日</label>
                        <div className="relative">
                          <button onClick={() => setShowEditEndPicker(v => !v)} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-left focus:outline-none" style={{ backgroundColor: '#fff', color: editPaymentForm.periodEnd ? '#1A2340' : '#9CA3AF', boxSizing: 'border-box' }}>{editPaymentForm.periodEnd || '截止日'}</button>
                          {showEditEndPicker && (<div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowEditEndPicker(false)}><div className="bg-white rounded-xl shadow-2xl mx-4 w-full" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}><DatePicker value={editPaymentForm.periodEnd} onChange={v => { setEditPaymentForm(f => ({ ...f, periodEnd: v })); setShowEditEndPicker(false); }} /></div></div>)}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">备注</label>
                      <input type="text" value={editPaymentForm.note} onChange={e => setEditPaymentForm(f => ({ ...f, note: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none" placeholder="结息说明" style={{ boxSizing: 'border-box' }} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditPaymentId(null)} className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500">取消</button>
                      <button
                        onClick={() => {
                          if (!editPaymentForm.amount || parseFloat(editPaymentForm.amount) <= 0) { toast.error('请填写金额'); return; }
                          _intUpdatePaymentMutation.mutate({ ledgerId, paymentId: p.id, orderId: order.id, amount: parseFloat(editPaymentForm.amount), currency: editPaymentForm.currency, exchangeRate: parseFloat(editPaymentForm.exchangeRate || String(cnyRate || 6.75)), payDate: editPaymentForm.payDate, note: editPaymentForm.note || undefined, periodStart: editPaymentForm.periodStart || undefined, periodEnd: editPaymentForm.periodEnd || undefined });
                        }}
                        disabled={_intUpdatePaymentMutation.isPending}
                        className="flex-1 py-1.5 rounded-lg text-white text-xs font-medium disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #1A56DB, #3B82F6)' }}
                      >{_intUpdatePaymentMutation.isPending ? '保存中...' : '保存'}</button>
                    </div>
                  </div>
                ) : (
                  /* 展示行 */
                  <div className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium" style={{ color: '#16A34A' }}>+{parseFloat(p.amount).toFixed(2)} {(p.currency || 'U') === 'CNY' ? '元' : 'u'}</span>
                        {(p.pay_date || p.payment_date) && <span className="text-gray-400">{fmtDate(p.pay_date || p.payment_date)}</span>}
                      </div>
                      {(p.period_start || p.period_end) && <div className="text-[10px] text-gray-400 mt-0.5">{p.period_start ? fmtDate(p.period_start) : ''}{p.period_start && p.period_end ? ' → ' : ''}{p.period_end ? fmtDate(p.period_end) : ''}</div>}
                      {p.note && <div className="text-[10px] text-gray-400 mt-0.5 truncate">{p.note}</div>}
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => { setEditPaymentId(p.id); setEditPaymentForm({ amount: String(p.amount), currency: (p.currency || 'U') as 'CNY'|'U', exchangeRate: String(p.exchange_rate || 7.0), payDate: p.pay_date ? String(p.pay_date).slice(0,10) : '', note: p.note || '', periodStart: p.period_start ? String(p.period_start).slice(0,10) : '', periodEnd: p.period_end ? String(p.period_end).slice(0,10) : '' }); }}
                        className="p-1 rounded hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors"
                        title="编辑"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button
                        onClick={() => { if (window.confirm('确认删除这条结息记录？')) { $deletePaymentMutation.mutate({ ledgerId, paymentId: p.id, orderId: order.id }); } }}
                        className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                        title="删除"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 结息操作日志 */}
        {$showPaymentPanel === order.id && isAdmin && (
          <div className="mt-1">
            <button
              onClick={() => { setShowInterestLog(v => !v); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              操作日志
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showInterestLog ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showInterestLog && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-1.5">
                {interestLogQuery.isLoading && <div className="text-xs text-gray-400 text-center py-2">加载中...</div>}
                {!interestLogQuery.isLoading && (!interestLogQuery.data?.logs || interestLogQuery.data.logs.length === 0) && (
                  <div className="text-xs text-gray-400 text-center py-2">暂无操作记录</div>
                )}
                {interestLogQuery.data?.logs?.map((log: any) => {
                  const actionLabel: Record<string, string> = { interest_add: '新增结息', interest_update: '编辑结息', interest_delete: '删除结息', collateral_update: '编辑担保' };
                  const dt = log.createdAt ? new Date(log.createdAt) : null;
                  const dtStr = dt ? `${String(dt.getFullYear()).slice(2)}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}` : '';
                  return (
                    <div key={log.id} className="text-xs border-b border-gray-100 last:border-0 pb-1.5 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium" style={{ color: '#1A2340' }}>{actionLabel[log.action] || log.action}</span>
                        <span className="text-gray-400">{dtStr}</span>
                      </div>
                      {log.summary && <div className="text-gray-500 mt-0.5 leading-relaxed">{log.summary}</div>}
                      {log.operatorName && <div className="text-gray-400 mt-0.5">操作人：{log.operatorName}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 公开备注区域 */}
        {!previewMode && <FunderNoteRow
          orderId={order.id}
          ledgerId={ledgerId}
          initialNote={order.public_note || ''}
          onSaved={(raw) => { order.public_note = raw; }}
          currentUser={currentUser ? { id: (currentUser as any).id, name: (currentUser as any).name, username: (currentUser as any).username, avatar: (currentUser as any).avatar || (membersData as any[])?.find((u: any) => u.userId === (currentUser as any).id)?.avatar || undefined } : undefined}
          isAdmin={isAdmin}
          membersData={membersData as any[]}
          participantUserId={_participantUserId}
          isSettled={isSettled}
        />}
      </div>

      {/* 状态操作底部弹窗 */}
      {!previewMode && showStatusSheet && (
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
                  $onConfirmSettle?.(order.id);
                  setShowStatusSheet(false);
                }}
                className="w-full py-3 rounded-xl text-sm font-medium transition-colors"
                style={{ backgroundColor: order.status === 'settled' ? '#DBEAFE' : '#F3F4F6', color: order.status === 'settled' ? '#1D4ED8' : '#374151' }}
              >
                已结清{order.status === 'settled' ? '（当前）' : ''}（利息停止计算）
              </button>
              <button
                onClick={() => {
                  if (handleDelete !== undefined) {
                    $handleDelete(order.id);
                    setShowStatusSheet(false);
                    return;
                  }
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
    {onConfirmSettle === undefined && _intConfirmSettleId !== null && (() => {
      const participantCount = Number((order as any).participantCount ?? (order as any)._participantCount ?? (order as any)._participantUserIds?.length ?? 0);
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => { _intSetConfirmSettleId(null); _intSetSettleInterestEndDate(''); }}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认统一结清</h3>
            {participantCount > 0 ? (
              <p className="text-sm text-indigo-600 mb-2">该主订单关联 <span className="font-semibold">{participantCount}</span> 位共同拥有者或参与者。确认后，主订单与全部独立订单视图将使用同一时间一起结清，并影响其各自的利息结算。</p>
            ) : (
              <p className="text-sm text-gray-600 mb-2">结清后该订单利息将停止计算，状态变为「已结清」。</p>
            )}
            <p className="text-sm text-gray-600 mb-3">本功能只改变融资付息的记账状态和页面显示，<span className="font-semibold text-gray-800">不会产生任何钱包流水</span>。</p>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 mb-3">
              <div className="text-sm font-semibold text-amber-900">利息结算截止日</div>
              <p className="text-xs text-amber-800 mt-1">按北京时间自然日计息至该日；默认当天，可按实际约定日期修改。</p>
              <input
                type="date"
                value={_intSettleInterestEndDate || getBeijingToday()}
                min={order.interest_start_date ? String(order.interest_start_date).slice(0, 10) : undefined}
                max={getBeijingToday()}
                onChange={(e) => _intSetSettleInterestEndDate(e.target.value)}
                className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none focus:border-amber-500"
              />
            </div>
            <p className="text-sm font-medium text-red-600 mb-5">统一结清后不能单独保留某位共同拥有者或参与者为持有中，确定继续？</p>
            <div className="flex gap-3">
              <button onClick={() => { _intSetConfirmSettleId(null); _intSetSettleInterestEndDate(''); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600">取消</button>
              <button
                onClick={() => {
                  $updateMutation.mutate({ id: _intConfirmSettleId, ledgerId, status: 'settled', interestEndDate: _intSettleInterestEndDate || getBeijingToday() });
                  _intSetConfirmSettleId(null);
                  _intSetSettleInterestEndDate('');
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white"
              >{participantCount > 0 ? '全部结清' : '确认结清'}</button>
            </div>
          </div>
        </div>
      );
    })()}
  </>);
}
// ===== END FunderOrderCard =====

// 担保操作日志子组件
function CollateralLogSection({ orderId, ledgerId, refreshKey }: { orderId: number; ledgerId: number; refreshKey: boolean }) {
  const [open, setOpen] = useState(false);
  const logsQuery = trpc.ledger.financeGetOrderLogs.useQuery(
    { orderId, ledgerId },
    { enabled: open, staleTime: 0 }
  );
  // refreshKey 变化时重新获取
  React.useEffect(() => {
    if (open) logsQuery.refetch();
  }, [refreshKey]);

  const actionLabel = (action: string) => {
    if (action === 'collateral_update') return '担保变更';
    return action;
  };

  const fmtTime = (dt: any) => {
    if (!dt) return '';
    const d = new Date(dt);
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yy}.${mm}.${dd} ${hh}:${mi}`;
  };

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <span>操作日志{logsQuery.data ? ` (${logsQuery.data.logs.length})` : ''}</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-1.5 mt-1">
          {logsQuery.isLoading && <div className="text-xs text-gray-400 text-center py-2">加载中…</div>}
          {logsQuery.data?.logs.length === 0 && <div className="text-xs text-gray-400 text-center py-2">暂无日志</div>}
          {logsQuery.data?.logs.map(log => (
            <div key={log.id} className="rounded-lg bg-gray-50 border border-gray-100 px-2.5 py-2 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: '#1A2340' }}>{actionLabel(log.action)}</span>
                <span className="text-[10px] text-gray-400">{fmtTime(log.createdAt)}</span>
              </div>
              <div className="text-[11px] text-gray-500">{log.summary}</div>
              <div className="text-[10px] text-gray-400">操作人: {log.operatorName}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
