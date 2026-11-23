import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/** 只接入受限数字接口；不读取交易详情，不提交备注、附件、转账或成员参数。 */
export default function Ledger37CalendarNumberDialog({ categoryId, date, onClose, onSaved }: {
  categoryId: number;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amountText, setAmountText] = useState('');
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [error, setError] = useState('');
  const scope = { ledgerId: 37 as const, categoryId, date };
  const query = trpc.ledger.getCalendarNumber.useQuery(scope, {
    retry: false, staleTime: 0, gcTime: 0, placeholderData: undefined,
    refetchOnMount: 'always', refetchOnWindowFocus: false,
  });
  const save = trpc.ledger.saveCalendarNumber.useMutation({
    onSuccess: () => { onSaved(); onClose(); },
    onError: (failure) => setError(failure.message || '登记失败，请重试'),
  });
  useEffect(() => {
    if (!query.isFetchedAfterMount || query.error || !query.data) return;
    setAmountText(query.data.amount === null ? '' : String(query.data.amount));
    setOverwriteExisting(false);
  }, [query.data, query.isFetchedAfterMount, query.error]);
  const ready = query.isFetchedAfterMount && !query.error && Boolean(query.data);
  const validNumber = /^\d+(?:\.\d{1,2})?$/.test(amountText) && Number.isFinite(Number(amountText))
    && Number(amountText) <= 99999999.99;
  const canSave = ready && validNumber && !save.isPending && (!query.data?.exists || overwriteExisting);
  // 手机第二次 pointerup 打开弹窗后仍会产生兼容 click；不能让它命中遮罩后立即关闭。
  // 只接受新发起、直接落在遮罩上的主指针按下，弹窗内部和保存期间均不关闭。
  return <div className="fixed inset-0 z-[530] flex items-center justify-center bg-black/50 px-4" onPointerDown={(event) => {
    if (event.target === event.currentTarget && event.button === 0 && !save.isPending) onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="calendar-number-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between gap-3">
        <div><h2 id="calendar-number-title" className="text-base font-semibold text-[#222222]">登记数字</h2><p className="mt-1 text-xs text-[#757575]">{date}</p></div>
        <button type="button" aria-label="关闭数字登记" disabled={save.isPending} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F5F5] text-[#757575]"><X size={18} /></button>
      </header>
      {!ready ? <p role={query.error ? 'alert' : 'status'} className="py-5 text-sm text-[#757575]">{query.error ? '不能登记此日期或标签，请返回后重试' : '正在读取当日数字…'}</p> : <form onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        setError('');
        save.mutate({ ...scope, amount: Number(amountText), overwriteExisting });
      }}>
        <label htmlFor="calendar-number-amount" className="mt-5 block text-xs text-[#757575]">数字</label>
        <input id="calendar-number-amount" aria-label="日历数字" type="text" inputMode="decimal" autoFocus value={amountText} disabled={save.isPending} onChange={(event) => {
          const value = event.target.value;
          if (/^\d*(?:\.\d{0,2})?$/.test(value)) { setAmountText(value); setError(''); }
        }} className="mt-2 w-full rounded-xl border border-[#E0E0E0] px-3 py-3 text-xl tabular-nums text-[#222222] outline-none focus:border-[#D32F2F]" />
        {query.data?.exists && <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#757575]"><input type="checkbox" checked={overwriteExisting} disabled={save.isPending} onChange={(event) => setOverwriteExisting(event.target.checked)} className="mt-1 accent-[#D32F2F]" /><span>确认替换当日已登记数字</span></label>}
        {error && <p role="alert" className="mt-3 text-xs text-[#D32F2F]">{error}</p>}
        <button type="submit" disabled={!canSave} className="mt-5 w-full rounded-xl bg-[#D32F2F] py-3 text-sm font-semibold text-white disabled:opacity-40">{save.isPending ? '保存中…' : '保存'}</button>
      </form>}
    </section>
  </div>;
}
