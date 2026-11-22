import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronLeft, RefreshCw, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import AJInvoiceAIPanel from '@/components/AJInvoiceAIPanel';
import { isAJBatchCheckRow, isAJBatchSnapshotCurrent, type AJBatchSelection } from '@shared/aj-invoice-ai';

type Warning = { code: string; label: string; detail: string };
type Peer = { id: number; amount: number; employeeName: string; companyName: string; recordDate: string; status: string };
type Invoice = Peer & {
  images: string[];
  description?: string;
  expenseReason?: string;
  taxCategory?: string;
  reviewWarnings: Warning[];
  sameAmountInvoices: Peer[];
  reviewFingerprint: string;
};
export type AJBatchReviewSelection = AJBatchSelection;
type Filter = 'all' | 'same_amount' | 'missing_images' | 'invoice_number' | 'identity' | 'classification' | 'other';

function displayDate(value: unknown) {
  const text = String(value || '');
  const date = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (date) return `${date[1]}-${date[2]}-${date[3]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '日期未填写' : parsed.toLocaleDateString('zh-CN');
}
function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : '金额异常';
}

function needsCorrection(row: Invoice) {
  return (row.reviewWarnings || []).some(warning => ['invalid_amount', 'invalid_date'].includes(warning.code));
}

export default function AJBatchReview({
  ledgerId, title, items, loading, refreshing, error, approving, onRefresh, onClose, onApprove,
}: {
  ledgerId: number;
  title: string;
  items?: Invoice[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string;
  approving: boolean;
  onRefresh: () => void;
  onClose: () => void;
  onApprove: (selection: AJBatchReviewSelection) => void;
}) {
  const rows = Array.isArray(items) ? items : [];
  const ready = Array.isArray(items) && !loading && !error && rows.every(isAJBatchCheckRow);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [reviewed, setReviewed] = useState<Record<number, string>>({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ rows: Invoice[]; payload: AJBatchReviewSelection } | null>(null);
  const [aiInvoiceId, setAIInvoiceId] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const mounted = useRef(true);
  const analysisLock = useRef(false);
  const analyzeMutation = (trpc as any).ledger.ajAnalyzeInvoice.useMutation({ retry: false });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // 每次最新清单到达，保留仍有效的核对结果，新增无提示单默认勾选；异常单不自动勾选。
  useEffect(() => {
    if (!items) return;
    const valid = items.filter(isAJBatchCheckRow);
    setReviewed(prev => Object.fromEntries(valid.filter(row => prev[row.id] === row.reviewFingerprint).map(row => [row.id, row.reviewFingerprint])));
    setSelectedIds(new Set(valid.filter(row => row.reviewWarnings.length === 0).map(row => row.id)));
    setConfirmation(null);
  }, [items]);

  const riskRows = rows.filter(row => (row.reviewWarnings || []).length > 0);
  const amountRows = rows.filter(row => (row.reviewWarnings || []).some(warning => warning.code === 'same_amount'));
  const noImageRows = rows.filter(row => (row.reviewWarnings || []).some(warning => ['missing_images', 'malformed_images'].includes(warning.code)));
  const otherRows = rows.filter(row => (row.reviewWarnings || []).some(warning => !['same_amount', 'missing_images', 'malformed_images'].includes(warning.code)));
  const numberRows = rows.filter(row => (row.reviewWarnings || []).some(warning => /duplicate|invoice_number/.test(warning.code)));
  const identityRows = rows.filter(row => (row.reviewWarnings || []).some(warning => /buyer|tax_no|amount_mismatch|invoice_date/.test(warning.code)));
  const classificationRows = rows.filter(row => (row.reviewWarnings || []).some(warning => /classif|not_analy|stale|mapping|purpose/.test(warning.code)));
  const displayedRows = filter === 'same_amount' ? amountRows : filter === 'missing_images' ? noImageRows
    : filter === 'invoice_number' ? numberRows : filter === 'identity' ? identityRows
    : filter === 'classification' ? classificationRows : filter === 'other' ? otherRows : rows;
  const analysisTargets = displayedRows.filter(row => row.images?.length > 0
    && (row.reviewWarnings || []).some(warning => /not_analy|stale/.test(warning.code))).slice(0, 10);
  const selectedRows = rows.filter(row => selectedIds.has(row.id));
  const selectedAmount = selectedRows.reduce((sum, row) => sum + (Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0), 0);
  const unreviewedSelected = selectedRows.some(row => (row.reviewWarnings || []).length > 0 && reviewed[row.id] !== row.reviewFingerprint);
  const canConfirm = ready && selectedRows.length > 0 && !unreviewedSelected && !selectedRows.some(needsCorrection) && !refreshing && !approving && !analyzing;
  const confirmationCurrent = !!confirmation && ready && !refreshing && !approving && !analyzing
    && isAJBatchSnapshotCurrent(confirmation.payload, rows);

  const analyzeCurrent = async () => {
    if (analysisLock.current || approving || refreshing || !ready || !analysisTargets.length) return;
    const targets = [...analysisTargets];
    analysisLock.current = true;
    setAnalyzing(true); setAnalysisError(''); setConfirmation(null);
    setSelectedIds(new Set()); setReviewed({});
    let completed = 0;
    try {
      for (const row of targets) {
        if (!mounted.current) break;
        setAnalysisMessage(`正在识别 #${row.id} · ${completed}/${targets.length}`);
        // 明确点击才识别；有限串行，已有有效缓存由服务器复用，不审批也不发津贴。
        await analyzeMutation.mutateAsync({ ledgerId, recordId: row.id, autoApply: true });
        completed += 1;
      }
      if (mounted.current) setAnalysisMessage(`已完成 ${completed} 笔照片核对，请按最新提示重新选择审核单。`);
    } catch (error: any) {
      if (mounted.current) {
        setAnalysisError(error.message || '照片核对失败，请稍后重试或人工处理');
        setAnalysisMessage(`已完成 ${completed} 笔；剩余未识别，仍保留待审核。`);
      }
    } finally {
      analysisLock.current = false;
      if (mounted.current) { setAnalyzing(false); onRefresh(); }
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, { amount: string; current: Invoice[]; peers: Map<number, Peer> }>();
    for (const row of amountRows) {
      const key = money(row.amount);
      if (!map.has(key)) map.set(key, { amount: key, current: [], peers: new Map() });
      const group = map.get(key)!;
      group.current.push(row);
      for (const peer of row.sameAmountInvoices || []) group.peers.set(peer.id, peer);
      group.peers.set(row.id, row);
    }
    return Array.from(map.values()).sort((a, b) => Number(b.amount) - Number(a.amount));
  }, [items]);

  const toggleSelected = (row: Invoice) => {
    if (!ready || approving || refreshing || analyzing || needsCorrection(row) || ((row.reviewWarnings || []).length > 0 && reviewed[row.id] !== row.reviewFingerprint)) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
      return next;
    });
  };
  const acknowledge = (row: Invoice) => {
    if (approving || refreshing || analyzing || !ready || needsCorrection(row)) return;
    const wasReviewed = reviewed[row.id] === row.reviewFingerprint;
    setReviewed(prev => {
      const next = { ...prev };
      if (wasReviewed) delete next[row.id]; else next[row.id] = row.reviewFingerprint;
      return next;
    });
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (wasReviewed) next.delete(row.id); else next.add(row.id);
      return next;
    });
  };
  const invoiceRow = (row: Invoice) => {
    const warnings = row.reviewWarnings || [];
    const hasWarning = warnings.length > 0;
    const checked = reviewed[row.id] === row.reviewFingerprint;
    const correctionRequired = needsCorrection(row);
    return <div key={row.id} className={`border-b border-slate-100 px-4 py-3 ${hasWarning ? 'bg-amber-50/60' : 'bg-white'}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" aria-label={`选择申请单${row.id}`} checked={selectedIds.has(row.id)}
          disabled={!ready || approving || refreshing || analyzing || correctionRequired || (hasWarning && !checked)} onChange={() => toggleSelected(row)}
          className="mt-1 h-4 w-4 shrink-0 accent-[#1A2B4A]" />
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2 text-xs">
            <span className="font-semibold text-[#1A2B4A]">{row.employeeName || '申请人未填写'} · #{row.id}</span>
            <span className="shrink-0 font-bold text-[#1A2B4A]">¥{money(row.amount)}</span>
          </div>
          <div className="mt-1 break-words text-[10px] text-slate-500">{row.companyName || '未绑定企业'} · {displayDate(row.recordDate)}</div>
          {(row.expenseReason || row.description) && <div className="mt-1 whitespace-pre-wrap break-words text-[11px] text-slate-600">{row.expenseReason || row.description}</div>}
          {warnings.length > 0 && <div className="mt-2 space-y-1">
            {warnings.map(warning => <div key={warning.code} className="text-[11px] leading-relaxed text-amber-800">
              <span className="mr-1 rounded bg-amber-100 px-1 py-0.5 font-medium">{warning.label}</span>{warning.detail}
            </div>)}
          </div>}
          {Array.isArray(row.images) && row.images.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto">
            {row.images.map((url, index) => <button key={`${url}-${index}`} type="button" onClick={() => setPreviewImage(url)} className="shrink-0">
              <img src={url} alt={`申请单${row.id}凭证${index + 1}`} className="h-12 w-12 rounded border border-slate-200 object-cover" />
            </button>)}
          </div>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <a href={`/ledger/${ledgerId}/transaction/${row.id}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-700">查看原单</a>
            {hasWarning && <button type="button" disabled={!ready || approving || refreshing || analyzing || correctionRequired} onClick={() => acknowledge(row)}
              className={`rounded-md border px-3 py-1.5 text-[11px] font-medium ${checked ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-300 bg-white text-amber-800'}`}>
              {correctionRequired ? '请先修正原单或退回' : checked ? '已核对 · 本次选入' : '已核对，选入本次审核'}
            </button>}
          </div>
          <button type="button" disabled={approving || analyzing} onClick={() => setAIInvoiceId(prev => prev === row.id ? null : row.id)}
            className="mt-2 text-[11px] font-medium text-[#1A2B4A]">{aiInvoiceId === row.id ? '收起照片核对与归类' : '查看照片核对与归类'}</button>
          {aiInvoiceId === row.id && <div className="mt-2"><AJInvoiceAIPanel ledgerId={ledgerId} recordId={row.id} compact
            readOnly={approving || analyzing || refreshing || !ready} onChanged={() => { setConfirmation(null); setSelectedIds(new Set()); setReviewed({}); onRefresh(); }} /></div>}
        </div>
      </div>
    </div>;
  };

  return <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/55" onClick={() => { if (!approving && !analyzing) onClose(); }}>
    <div className="flex max-h-[88vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={event => event.stopPropagation()}>
      <div className="shrink-0 border-b border-slate-100 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-bold text-[#1A2B4A]">{confirmation ? '最终确认审核' : '审核前辅助核对'}</div>
            <div className="mt-1 text-[11px] text-slate-500">{title} · {rows.length} 笔待审</div>
          </div>
          <div className="flex gap-3">
            {!confirmation && <button aria-label="更新查重结果" disabled={refreshing || approving || analyzing} onClick={onRefresh} className="text-slate-500"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>}
            <button aria-label="关闭审核核对" disabled={approving || analyzing} onClick={onClose} className="text-slate-500"><X className="h-5 w-5" /></button>
          </div>
        </div>
        {!confirmation && <>
          <div className="mt-3 rounded-md bg-slate-50 p-3 text-[11px] text-slate-600">
            <div className="flex items-center gap-1.5 font-medium text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />发现需核对 {riskRows.length} 笔</div>
            <div className="mt-1 leading-relaxed">同额申请 {amountRows.length} 笔 · 无有效凭证 {noImageRows.length} 笔 · 其他提示 {otherRows.length} 笔</div>
            <div className="mt-1 leading-relaxed">同金额不等于重复发票。提示单默认不选，管理员核对后可选入；未选的单仍保留待审核，不会自动退回。</div>
          </div>
          <div className="mt-2 rounded-md border border-blue-100 bg-blue-50 p-2.5 text-[11px] text-[#1A2B4A]">
            <button type="button" disabled={!ready || loading || refreshing || approving || analyzing || !analysisTargets.length}
              onClick={() => void analyzeCurrent()} className="rounded-md bg-[#1A2B4A] px-3 py-2 font-medium text-white disabled:opacity-40">
              {analyzing ? '照片核对中...' : `识别当前筛选照片 ${analysisTargets.length} 笔`}
            </button>
            <div className="mt-1.5 leading-relaxed">每次最多10笔未识别或已过期申请，消耗AI额度。仅核对与填写明确归类，不批准、不发钱；未识别历史不能保证无重复。</div>
            {analysisMessage && <div className="mt-1 leading-relaxed">{analysisMessage}</div>}
            {analysisError && <div className="mt-1 whitespace-pre-wrap break-words text-red-600">{analysisError}</div>}
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {([['all', '全部待审', rows.length], ['same_amount', '同额核对', amountRows.length], ['invoice_number', '号码查重', numberRows.length], ['identity', '抬头税号', identityRows.length], ['classification', '归类待确认', classificationRows.length], ['missing_images', '无凭证', noImageRows.length], ['other', '其他提示', otherRows.length]] as const).map(([key, label, count]) =>
              <button key={key} onClick={() => setFilter(key)} className={`shrink-0 rounded-md px-3 py-2 text-[11px] font-medium ${filter === key ? 'bg-[#1A2B4A] text-white' : 'bg-slate-50 text-slate-500'}`}>{label} {count}</button>)}
          </div>
        </>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {confirmation ? <div className="space-y-4 p-4">
          <div className="rounded-md bg-green-50 p-4 text-sm leading-relaxed text-[#1A2B4A]">
            仅审核本次选中的 <b>{confirmation.rows.length} 笔</b>，共 <b>¥{money(confirmation.rows.reduce((sum, row) => sum + Number(row.amount), 0))}</b>。
            <div className="mt-2 text-xs text-slate-500">其中 {(confirmation.rows.filter(row => row.reviewWarnings.length > 0)).length} 笔提示单已由管理员核对。未选中的申请继续待审核。</div>
          </div>
          <div className="text-xs text-slate-600">选中单号：{confirmation.payload.recordIds.map(id => `#${id}`).join('、')}</div>
          <div className="text-xs leading-relaxed text-amber-800">审核通过后沿用现有报销和津贴规则；申请内容或查重结果发生变化时，须刷新后重新核对。</div>
        </div> : loading || (!items && refreshing) ? <div className="p-8 text-center text-xs text-slate-400">正在读取待审清单和辅助核对信息...</div>
          : error ? <div className="p-6 text-center text-xs text-red-600">加载失败：{error}，请点右上角更新。</div>
          : !ready ? <div className="p-6 text-center text-xs text-slate-500">辅助核对数据尚未就绪，请稍后点右上角更新。</div>
          : rows.length === 0 ? <div className="p-8 text-center text-xs text-slate-400">暂无待审申请</div>
          : displayedRows.length === 0 ? <div className="p-8 text-center text-xs text-slate-400">当前筛选下没有此类提示</div>
          : filter === 'same_amount' ? groups.map(group => <div key={group.amount}>
            <div className="border-y border-amber-100 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900">同额 ¥{group.amount} · 共 {group.peers.size} 笔需区分</div>
            {group.current.map(invoiceRow)}
            {Array.from(group.peers.values()).filter(peer => !group.current.some(row => row.id === peer.id)).map(peer => <div key={`peer-${peer.id}`} className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
              <div className="flex justify-between gap-2"><span>对照 #{peer.id} · {peer.employeeName || '未知申请人'}</span><span>{peer.status === 'approved' ? '已通过' : '待审核 · 本次范围外'}</span></div>
              <div className="mt-1">{peer.companyName || '未绑定企业'} · {displayDate(peer.recordDate)} · ¥{money(peer.amount)}</div>
              <a href={`/ledger/${ledgerId}/transaction/${peer.id}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-blue-700">查看对照原单</a>
            </div>)}
          </div>) : displayedRows.map(invoiceRow)}
      </div>
      <div className="shrink-0 border-t border-slate-100 p-4">
        {confirmation ? <div className="flex gap-3">
          <button disabled={approving} onClick={() => setConfirmation(null)} className="flex items-center justify-center gap-1 rounded-md border border-slate-200 px-4 py-3 text-xs text-slate-600"><ChevronLeft className="h-4 w-4" />返回核对</button>
          <button disabled={!confirmationCurrent} onClick={() => { if (confirmationCurrent) onApprove(confirmation.payload); }} className="flex-1 rounded-md bg-[#1A2B4A] py-3 text-sm font-semibold text-white disabled:opacity-40">{approving ? '审核中...' : !confirmationCurrent ? '快照已更新，请返回核对' : `确认通过 ${confirmation.rows.length} 笔`}</button>
        </div> : <>
          <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>本次已选 <b className="text-[#1A2B4A]">{selectedRows.length}</b> 笔 · ¥{money(selectedAmount)}</span>
            <button disabled={!ready || approving || refreshing || analyzing} onClick={() => { setReviewed({}); setSelectedIds(new Set(rows.filter(row => row.reviewWarnings.length === 0).map(row => row.id))); }} className="flex items-center gap-1 text-blue-700"><CheckCircle className="h-3 w-3" />仅选无提示单</button>
          </div>
          <button disabled={!canConfirm} onClick={() => {
            if (!canConfirm) return;
            const checks = selectedRows.map(row => ({ id: row.id, fingerprint: row.reviewFingerprint }));
            setConfirmation({ rows: selectedRows, payload: { recordIds: selectedRows.map(row => row.id), expectedChecks: checks, reviewedRisks: selectedRows.filter(row => row.reviewWarnings.length > 0).map(row => ({ id: row.id, fingerprint: row.reviewFingerprint })) } });
          }} className="w-full rounded-md bg-[#1A2B4A] py-3 text-sm font-semibold text-white disabled:opacity-40">{refreshing ? '正在更新核对信息...' : `核对完成，确认所选 ${selectedRows.length} 笔`}</button>
        </>}
      </div>
    </div>
    {previewImage && <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/90 p-4" onClick={event => { event.stopPropagation(); setPreviewImage(null); }}>
      <button aria-label="关闭凭证预览" className="absolute top-4 right-4 text-white"><X className="h-6 w-6" /></button>
      <img src={previewImage} alt="报销申请凭证预览" className="max-h-[88vh] max-w-full object-contain" />
    </div>}
  </div>;
}
