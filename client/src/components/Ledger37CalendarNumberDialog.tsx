import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ImageIcon, X, ZoomIn } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { autoCompressImage } from '@/utils/imageUtils';
import { getLedgerRecordDateError } from '@shared/ledger-record-date';

type Props = { categoryId: number; date: string; onClose: () => void; onSaved: () => void };
type EntryImage = { imageUrl: string; uploadToken?: string };
type Snapshot = { amount: number | null; exists: boolean; categoryName: string; images: EntryImage[]; version: string | null };
type PendingImage = { file: File; url: string };
function safeMessage(failure: unknown, fallback: string): string {
  const message = failure instanceof Error ? failure.message : '';
  return message.length <= 180 && /[\u4e00-\u9fff]/.test(message)
    && !/[\n\r{}]|https?:|mysql|sql|cos|secret|token|password|credential|stack|\/home\//i.test(message) ? message : fallback;
}

export default function Ledger37CalendarNumberDialog(props: Props) {
  // 调用方通常已设置 key；这里也隔离 scope，防止换标签时沿用上一份快照。
  return <CalendarEntryPage key={`${props.categoryId}:${props.date}`} {...props} />;
}
function CalendarEntryPage({ categoryId, date, onClose, onSaved }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [amountText, setAmountText] = useState('');
  const [images, setImages] = useState<EntryImage[]>([]);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<PendingImage[]>([]);
  const [pendingIndex, setPendingIndex] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const operation = useRef(false);
  const freshPointer = useRef(false);
  const scope = { ledgerId: 37 as const, categoryId, date };
  const dateError = getLedgerRecordDateError(37, date);
  const query = trpc.ledger.getCalendarEntry.useQuery(scope, {
    enabled: !dateError, retry: false, staleTime: 0, gcTime: 0, placeholderData: undefined,
    refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const upload = trpc.ledger.uploadCalendarEntryImage.useMutation({ retry: false });
  const save = trpc.ledger.saveCalendarEntry.useMutation({ retry: false });
  const busy = uploading || save.isPending;
  const ready = snapshot !== null && !dateError;
  const validNumber = /^\d+(?:\.\d{1,2})?$/.test(amountText) && Number.isFinite(Number(amountText))
    && Number(amountText) >= 0 && Number(amountText) <= 99999999.99;
  const canSave = ready && validNumber && images.length <= 10 && !busy && !pending.length && !conflict && (!snapshot.exists || overwriteExisting);
  useEffect(() => {
    if (snapshot || !query.isFetchedAfterMount || query.isFetching || query.error || !query.data) return;
    const initial = { ...query.data, images: query.data.images.map(image => ({ imageUrl: image.imageUrl })) };
    setSnapshot(initial);
    setAmountText(initial.amount === null ? '' : String(initial.amount));
    setImages(initial.images);
  }, [snapshot, query.data, query.isFetchedAfterMount, query.isFetching, query.error]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; objectUrls.current.forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  const clearPending = () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current = [];
    setPending([]);
  };
  const checkReady = () => {
    const invalidDate = getLedgerRecordDateError(37, date);
    if (!snapshot || invalidDate) { setError(invalidDate || '请等待读取完成后重试'); return false; }
    return true;
  };
  const chooseFiles = (files: File[]) => {
    if (operation.current || busy || pending.length || !checkReady() || !files.length) return;
    if (files.length + images.length > 10) { setError('最多只能添加10张图片'); return; }
    if (files.some(file => !file.type.startsWith('image/') || file.size === 0 || file.size > 20 * 1024 * 1024)) {
      setError('请选择有效图片，每张原图不能超过20MB'); return;
    }
    const selected = files.map(file => ({ file, url: URL.createObjectURL(file) }));
    objectUrls.current = selected.map(item => item.url);
    setPending(selected); setPendingIndex(0); setError('');
  };
  const confirmUpload = async () => {
    if (operation.current || busy || !pending.length || !checkReady()) return;
    if (images.length + pending.length > 10) { setError('最多只能添加10张图片'); return; }
    operation.current = true; setUploading(true); setError('');
    try {
      for (const item of pending) {
        const compressed = await autoCompressImage(item.file, 'receipt');
        if (compressed.size > 10 * 1024 * 1024) throw new Error('压缩后图片不能超过10MB，请选择较小图片');
        if (!checkReady()) break;
        const result = await upload.mutateAsync({ ...scope, imageData: compressed.base64 });
        // 每张成功立即保留 URL/token；后续失败不会丢掉已上传图片。
        setImages(current => [...current, { imageUrl: result.imageUrl, uploadToken: result.uploadToken }]);
      }
    } catch (failure) { setError(safeMessage(failure, '图片上传失败，请重试；已上传图片已保留')); }
    finally { clearPending(); setUploading(false); operation.current = false; }
  };
  const handleSave = async () => {
    if (operation.current || !canSave || !checkReady() || !snapshot) return;
    operation.current = true; setError('');
    try {
      const result = await save.mutateAsync({ ...scope, amount: Number(amountText), overwriteExisting, version: snapshot.version, images });
      if (result.success) { onSaved(); onClose(); }
    } catch (failure) {
      const code = (failure as { data?: { code?: string } })?.data?.code;
      if (code === 'CONFLICT') { setConflict(true); setError('记录已变化，请返回日历刷新后核对，再重新打开登记'); }
      else setError(safeMessage(failure, '保存失败，请重试'));
    } finally { operation.current = false; }
  };
  const card = 'mx-3 mt-3 rounded-2xl border border-[#F0E8E0] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.07)]';
  const smallLabel = 'mb-3 text-xs font-medium tracking-widest text-gray-400';
  return createPortal(<div className="fixed inset-0 z-[530] bg-[#FAF3ED]" onPointerDownCapture={event => {
    if (event.button === 0) freshPointer.current = true;
  }} onClickCapture={event => {
    // pointerup 打开后产生的来源兼容 click 没有本页 pointerdown，不能落到返回/删除/保存。
    if (!freshPointer.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
  }} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-labelledby="calendar-entry-title" className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col bg-[#FAF3ED]">
      <header className="flex shrink-0 items-center justify-between bg-[#D32F2F] p-3 text-white">
        <button type="button" aria-label="返回日历" disabled={busy} onClick={() => { if (!operation.current) onClose(); }} className="flex h-8 w-8 items-center justify-center disabled:opacity-40"><ChevronLeft size={20} /></button>
        <h1 id="calendar-entry-title" className="text-base font-semibold">{snapshot?.exists ? '修改账目' : '添加账目'}</h1><div className="w-8" />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto pb-4">
        {!snapshot ? <div className="px-5 py-8 text-sm text-gray-500">
          <p role={dateError || query.error ? 'alert' : 'status'}>{dateError || (query.error ? safeMessage(query.error, '读取失败，请检查网络后重试') : '正在读取当日账目…')}</p>
          {query.error && !dateError && <button type="button" disabled={query.isFetching} onClick={() => { void query.refetch(); }} className="mt-4 rounded-xl border border-[#D32F2F] px-4 py-2 text-[#D32F2F] disabled:opacity-40">{query.isFetching ? '重试中…' : '重试'}</button>}
        </div> : <>
          <div className={`${card} overflow-hidden`}>
            <div className="border-b border-[#F5F5F5] px-5 pb-4 pt-5">
              <label htmlFor="calendar-entry-amount" className={`${smallLabel} block`}>余额记录</label>
              <div className="inline-flex w-full items-end">
                <input id="calendar-entry-amount" aria-label="余额记录金额" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amountText} disabled={busy} onChange={event => {
                  if (/^\d*(?:\.\d{0,2})?$/.test(event.target.value)) { setAmountText(event.target.value); if (!conflict) setError(''); }
                }} className="w-0 flex-1 border-none bg-transparent text-5xl font-light tabular-nums text-[#222222] outline-none placeholder:text-gray-200" />
                <span className="mb-1.5 ml-2 shrink-0 text-base font-medium text-gray-400">元</span>
              </div>
              <p className="mt-3 text-[11px] text-gray-400">0–99,999,999.99，最多两位小数</p>
            </div>
            <div className="border-b border-[#F5F5F5] px-5 py-4"><div className={smallLabel}>分类</div><span className="inline-block rounded-xl bg-[#D32F2F] px-4 py-2.5 text-sm font-medium text-white">{snapshot.categoryName}</span></div>
            <div className="flex items-center justify-between px-5 py-4"><span className="flex items-center gap-2.5 text-sm font-medium text-gray-500"><Calendar size={20} className="text-[#D32F2F]" />日期</span><span className="text-base font-semibold text-[#222222]">{date}</span></div>
          </div>
          <div className={`${card} px-5 py-4`}><div className={smallLabel}>图片（选填）</div>
            <input ref={fileInput} type="file" accept="image/*" multiple disabled={!ready || busy || Boolean(pending.length)} className="hidden" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; chooseFiles(files); }} />
            <div className="flex flex-wrap gap-2">
              {images.map((image, index) => <div key={`${image.imageUrl}:${index}`} className="relative h-20 w-20">
                <img src={image.imageUrl} alt={`图片${index + 1}`} className="h-full w-full rounded-xl object-cover" />
                <button type="button" aria-label={`删除图片${index + 1}`} disabled={busy} onClick={() => { if (!operation.current) setImages(current => current.filter((_, i) => i !== index)); }} className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#D32F2F] text-white disabled:opacity-40"><X size={14} /></button>
                <button type="button" aria-label={`预览图片${index + 1}`} disabled={busy} onClick={() => setPreview(image.imageUrl)} className="absolute bottom-0.5 right-0.5 flex h-6 w-6 items-center justify-center rounded bg-black/50 text-white"><ZoomIn size={14} /></button>
              </div>)}
              {images.length < 10 && <button type="button" disabled={!ready || busy || Boolean(pending.length)} onClick={() => { if (!operation.current) fileInput.current?.click(); }} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 disabled:opacity-40"><ImageIcon size={24} /><span className="text-xs">{images.length ? `${images.length}/10` : '添加图片'}</span></button>}
            </div><p className="mt-3 text-[11px] text-gray-400">最多10张，选择后预览确认上传</p>
          </div>
          {snapshot.exists && <label className="mx-5 mt-4 flex items-start gap-2 text-xs leading-5 text-gray-500"><input type="checkbox" checked={overwriteExisting} disabled={busy} onChange={event => setOverwriteExisting(event.target.checked)} className="mt-1 accent-[#D32F2F]" /><span>确认覆盖当日已登记账目及图片关联</span></label>}
        </>}
        {(error || (snapshot && dateError)) && <p role="alert" className="mx-5 mt-4 text-sm text-[#D32F2F]">{dateError || error}</p>}
      </main>
      <footer className="shrink-0 border-t border-[#F0E8E0] bg-white p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}><button type="button" disabled={!canSave} onClick={() => { void handleSave(); }} className="w-full rounded-2xl bg-[#D32F2F] py-4 text-base font-semibold text-white shadow-sm disabled:opacity-50">{uploading ? '图片上传中…' : save.isPending ? '保存中…' : '保存'}</button></footer>
    </section>
    {pending.length > 0 && <div role="dialog" aria-modal="true" aria-label="确认上传图片" className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-full w-full max-w-[448px] flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-4">
        <h2 className="text-base font-semibold">预览确认 · {pending.length}张图片</h2>
        <img src={pending[pendingIndex]?.url} alt="待上传图片预览" className="max-h-[45dvh] w-full rounded-xl object-contain" />
        <div className="flex gap-2 overflow-x-auto">{pending.map((item, index) => <button type="button" key={item.url} disabled={busy} aria-label={`查看待上传图片${index + 1}`} onClick={() => setPendingIndex(index)} className={`shrink-0 rounded-lg border-2 ${index === pendingIndex ? 'border-[#D32F2F]' : 'border-transparent'}`}><img src={item.url} alt={`待上传图片${index + 1}`} className="h-12 w-12 rounded-md object-cover" /></button>)}</div>
        <div className="flex gap-3"><button type="button" disabled={busy} onClick={() => { if (!operation.current) clearPending(); }} className="flex-1 rounded-xl border py-3 text-gray-500 disabled:opacity-40">取消</button><button type="button" disabled={busy || !ready} onClick={() => { void confirmUpload(); }} className="flex-1 rounded-xl bg-[#D32F2F] py-3 text-white disabled:opacity-40">{uploading ? '上传中…' : '确认上传'}</button></div>
      </div>
    </div>}
    {preview && <div role="dialog" aria-modal="true" aria-label="图片预览" className="absolute inset-0 flex items-center justify-center bg-black/90 p-4">
      <img src={preview} alt="图片大图预览" className="max-h-full max-w-full object-contain" />
      <button type="button" aria-label="关闭图片预览" disabled={busy} onClick={() => { if (!operation.current) setPreview(null); }} className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"><X size={24} /></button>
    </div>}
  </div>, document.body);
}
