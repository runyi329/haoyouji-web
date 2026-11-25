import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import Ledger37CalendarNumberDialog from '@/components/Ledger37CalendarNumberDialog';
import { consumeLedgerCalendarDoubleTap, type LedgerCalendarTap } from '@shared/ledger-calendar-double-tap';

/** AI管理员的唯一额外工具：只列可登记标签和日期；不读取任何原始交易/资金/配置。 */
export default function Ledger37CalendarRecorder({ viewerUserId }: { viewerUserId: number }) {
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const lastTap = useRef<LedgerCalendarTap | null>(null);
  const query = trpc.ledger.getCalendarNumberCategories.useQuery({ ledgerId: 37 }, {
    retry: false, staleTime: 0, gcTime: 0, placeholderData: undefined,
    refetchOnMount: 'always', refetchOnWindowFocus: false,
  });
  const categories = query.isFetchedAfterMount && !query.error ? query.data ?? [] : [];
  const selectedId = categories.some((item) => item.categoryId === categoryId) ? categoryId : categories[0]?.categoryId ?? null;
  useEffect(() => { lastTap.current = null; }, [month, selectedId, viewerUserId]);
  if (categories.length === 0) return null;
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const moveMonth = (step: number) => {
    const next = new Date(Date.UTC(year, monthNumber - 1 + step, 1)).toISOString().slice(0, 7);
    if (next <= today.slice(0, 7)) { setMonth(next); lastTap.current = null; }
  };
  const openNumber = (dayDate: string) => {
    if (!selectedId || dayDate > today) return;
    lastTap.current = null;
    setDate(dayDate);
  };
  return <section aria-label="日历数字登记" className="mx-auto mt-4 w-[calc(100%-24px)] max-w-[456px] rounded-2xl border border-[#DCE7F0] bg-white p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-[#142A3F]">日历</h2><select aria-label="登记标签" value={selectedId ?? ''} onChange={(event) => { setCategoryId(Number(event.target.value)); setDate(null); lastTap.current = null; }} className="max-w-[60%] rounded-lg border border-[#DCE7F0] bg-white px-2 py-1 text-xs text-[#61758A]">{categories.map((item) => <option key={item.categoryId} value={item.categoryId}>{item.name}</option>)}</select></div>
    <div className="mt-3 flex items-center justify-between text-xs text-[#61758A]"><button type="button" aria-label="上个月" onClick={() => moveMonth(-1)} className="flex h-8 w-8 items-center justify-center"><ChevronLeft size={16} /></button><span>{month}</span><button type="button" aria-label="下个月" disabled={month >= today.slice(0, 7)} onClick={() => moveMonth(1)} className="flex h-8 w-8 items-center justify-center disabled:opacity-30"><ChevronRight size={16} /></button></div>
    <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs"><>{['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day} className="py-1 text-[#61758A]">{day}</span>)}{Array.from({ length: firstDay }, (_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: days }, (_, index) => {
      const dayDate = `${month}-${String(index + 1).padStart(2, '0')}`;
      const enabled = Boolean(selectedId) && dayDate <= today;
      return <button key={dayDate} type="button" disabled={!enabled} onDoubleClick={() => { if (enabled) openNumber(dayDate); }} onClick={() => {
        if (!enabled) return;
        if (consumeLedgerCalendarDoubleTap(lastTap, `${viewerUserId}:${selectedId}:${dayDate}`)) openNumber(dayDate);
      }} onPointerCancel={() => { lastTap.current = null; }} onTouchMove={() => { lastTap.current = null; }} className={`h-10 rounded-lg text-xs disabled:opacity-30 ${dayDate === today ? 'bg-[#E4F4F6] font-semibold text-[#087987]' : 'bg-[#F2F6FA] text-[#142A3F]'}`} style={{ touchAction: 'manipulation' }}>{index + 1}</button>;
    })}</></div>
    <p className="mt-3 text-center text-[11px] text-[#61758A]">双击日期登记，在放大镜中查看照片</p>
    {date && selectedId && <Ledger37CalendarNumberDialog key={`${viewerUserId}:${selectedId}:${date}`} categoryId={selectedId} date={date} onClose={() => setDate(null)} onSaved={() => {}} />}
  </section>;
}
