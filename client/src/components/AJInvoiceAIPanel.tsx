import { useId, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, FileSearch, Loader2, LockKeyhole } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { AJInvoiceAIState } from "@shared/aj-invoice-ai";

export interface AJInvoiceAIPanelProps {
  ledgerId: number;
  recordId: number;
  onChanged?: () => void;
  readOnly?: boolean;
  compact?: boolean;
}

const stateLabels: Record<AJInvoiceAIState["state"], string> = {
  not_analyzed: "尚未识别", ready: "已有核对结果", stale: "结果已过期", error: "识别未完成",
};
const sourceLabels: Record<AJInvoiceAIState["source"], string> = {
  none: "未确认", ai: "AI 分类", manual: "人工确认", legacy_manual: "历史人工确认",
};
const classificationLabels: Record<AJInvoiceAIState["classification"]["status"], string> = {
  auto: "高可信明确单已自动归类", suggested: "候选建议，待人工确认",
  manual_required: "待人工归类", locked: "人工分类已锁定",
};
const reviewLabels: Record<string, string> = {
  pending: "申请中", approved: "已批准", rejected: "拒绝退回",
  support_needed: "待补充材料", deleted: "已删除", withdrawn: "已撤回", not_required: "无需审批",
};

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as any)?.message || "请求失败，请稍后重试");
  // FAST_PREVIEW 的 POST 403 必须留在原面板，不换协议、不绕过或静默重试。
  if (/只读|热预览|preview|403|FORBIDDEN/i.test(message)) {
    return `当前请求未获写入授权；只读热预览不会识别、保存或修改数据。${message}`;
  }
  return `${message}。如当前为只读热预览，识别和保存 POST 会被拦截；请仅查看缓存，不会绕过或自动重试。`;
}

function compareInvoiceText(actual: string | null, expected: string, taxNo = false): string {
  if (!actual?.trim() || !expected?.trim()) return "信息不全，待人工核对";
  const normalize = (value: string) => {
    const text = value.normalize("NFKC").replace(/\s+/g, "");
    return taxNo ? text.toUpperCase() : text;
  };
  return normalize(actual) === normalize(expected) ? "文字一致（不代表真伪核验）" : "文字不一致，请人工核对";
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 text-xs">
    <dt className="text-slate-500">{label}</dt>
    <dd className="min-w-0 whitespace-pre-wrap break-words text-[#1A2B4A]">{value || "未识别 / 未填写"}</dd>
  </div>;
}

/** 只读取服务器原单缓存；所有写入/付费识别均由明确按钮触发。 */
export default function AJInvoiceAIPanel({ ledgerId, recordId, onChanged, readOnly = false, compact = false }: AJInvoiceAIPanelProps) {
  const formId = useId();
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(!compact);
  const [panelError, setPanelError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [requestedAnalysis, setRequestedAnalysis] = useState<{ key: string; force: boolean } | null>(null);
  const [attemptedRecord, setAttemptedRecord] = useState("");
  const [selection, setSelection] = useState<{ resultKey: string; categoryKey: string; itemKey: string } | null>(null);
  const [manualDraft, setManualDraft] = useState<{
    resultKey: string; taxCategory: string; accountingCode: string; expenseReason: string;
  } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const recordKey = `${ledgerId}:${recordId}`;
  const cacheQuery = (trpc as any).ledger.ajGetInvoiceAIResult.useQuery(
    { ledgerId, recordId },
    { enabled: ledgerId > 0 && recordId > 0, retry: false, refetchOnMount: "always" }
  );
  const state = cacheQuery.data as AJInvoiceAIState | undefined;
  const hasState = !!state && state.ledgerId === ledgerId && state.recordId === recordId;
  const resultKey = hasState ? JSON.stringify([recordKey, state.analysisId, state.snapshotKey, state.source, state.manualLocked, state.company.configVersion, state.current]) : recordKey;
  const currentState = hasState ? state : undefined;
  const stale = currentState?.state === "stale";
  const queryFailed = !!cacheQuery.error;
  const writeDisabled = readOnly || busy || cacheQuery.isFetching || queryFailed || !currentState;
  const canAnalyze = !writeDisabled && currentState?.canAnalyze === true;
  const canApply = !writeDisabled && !stale && currentState?.state === "ready" && currentState.canApply === true && currentState.analysisId !== null;
  const canConfirm = !writeDisabled && currentState?.canConfirm === true;
  const hasAnalysis = !!currentState && (currentState.analysisId !== null || !!currentState.analyzedAt || attemptedRecord === recordKey);
  const selectedCandidate = selection?.resultKey === resultKey
    ? currentState?.classification.candidates.find(candidate => candidate.categoryKey === selection.categoryKey && candidate.itemKey === selection.itemKey)
    : undefined;
  const draft = manualDraft?.resultKey === resultKey ? manualDraft : null;
  const analyzeMutation = (trpc as any).ledger.ajAnalyzeInvoice.useMutation({ retry: false });
  const applyMutation = (trpc as any).ledger.ajApplyInvoiceRecommendation.useMutation({ retry: false });
  const confirmMutation = (trpc as any).ledger.ajConfirmInvoiceClassification.useMutation({ retry: false });

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    if (actionLock.current || writeDisabled) return;
    actionLock.current = true;
    setBusy(true);
    setPanelError("");
    setSuccessMessage("");
    try {
      await action();
      setSelection(null);
      setRequestedAnalysis(null);
      setManualDraft(null);
      setAcknowledged(false);
      // 整个 ledger 查询缓存失效：涵盖所有详情、列表、pending、企业/员工统计。
      // 这里只刷新 GET 缓存，不调用其他 mutation 或触发再次识别。
      const refresh = await Promise.allSettled([
        (utils as any).ledger.invalidate(),
        cacheQuery.refetch().then((result: { error?: unknown }) => {
          if (result.error) throw result.error;
        }),
      ]);
      try { onChanged?.(); } catch { /* 父组件刷新异常不伪装成原单写入失败。 */ }
      setSuccessMessage(message);
      if (refresh.some(result => result.status === "rejected")) {
        setPanelError("操作已成功，但部分只读数据刷新失败；请刷新缓存后查看最新原单，不要重复提交。");
      }
    } catch (error) {
      setPanelError(errorText(error));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const confirmAnalysis = () => {
    if (!canAnalyze || requestedAnalysis?.key !== recordKey) return;
    const force = requestedAnalysis.force;
    setRequestedAnalysis(null);
    setAttemptedRecord(recordKey);
    void runAction(() => analyzeMutation.mutateAsync({ ledgerId, recordId, ...(force ? { force: true } : {}), autoApply: true }), "原单识别核对完成，请查看风险与分类结果；审核状态未改变。");
  };

  const applyCandidate = () => {
    if (!canApply || !currentState || !selectedCandidate || !selectedCandidate.accountingCode || selection?.resultKey !== resultKey) return;
    void runAction(() => applyMutation.mutateAsync({
      ledgerId, recordId, analysisId: currentState.analysisId, snapshotKey: currentState.snapshotKey,
      categoryKey: selectedCandidate.categoryKey, itemKey: selectedCandidate.itemKey,
    }), "候选类别与企业映射科目已人工确认并锁定；未执行审批或付款。");
  };

  const confirmManual = () => {
    if (!canConfirm || !draft || !acknowledged) return;
    void runAction(() => confirmMutation.mutateAsync({
      ledgerId, recordId, taxCategory: draft.taxCategory.trim(), accountingCode: draft.accountingCode.trim(), expenseReason: draft.expenseReason.trim(),
    }), "报销事由、类目与科目已原子保存并人工锁定；未执行审批或付款。");
  };

  return <section className="min-w-0 rounded-lg border border-slate-200 bg-white text-[#1A2B4A] shadow-sm">
    <button type="button" aria-expanded={expanded} aria-controls={`${formId}-body`} onClick={() => setExpanded(value => !value)} className="flex w-full items-center justify-between gap-2 rounded-t-lg bg-[#1A2B4A] px-3 py-3 text-left text-white">
      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><FileSearch className="h-4 w-4 shrink-0" />原单照片核对 / 自动归类</span>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button>
    <div className="px-3 py-2 text-xs">
      <span className={stale ? "font-bold text-red-700" : "text-slate-600"}>{currentState ? stateLabels[currentState.state] : cacheQuery.isLoading ? "只读缓存加载中…" : "暂无可读取结果"}</span>
      {readOnly && <span className="ml-2 text-slate-500">只读，不可识别或确认</span>}
      {currentState?.manualLocked && <span className="ml-2 inline-flex items-center gap-1 font-medium"><LockKeyhole className="h-3 w-3" />人工锁定 · {sourceLabels[currentState.source]}</span>}
    </div>
    {stale && <div role="alert" className="mx-3 mb-3 rounded-md border-2 border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-800">结果已过期：图片、用途或企业配置等原单材料已变化。下方仅为历史结果，禁止应用旧建议；需要明确重新识别。</div>}
    {(panelError || cacheQuery.error) && <div role="alert" className="mx-3 mb-3 whitespace-pre-wrap break-words rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">{panelError || errorText(cacheQuery.error)}</div>}
    {successMessage && <p role="status" className="px-3 pb-3 text-xs text-green-800">{successMessage}</p>}
    {expanded && <div id={`${formId}-body`} className="space-y-3 border-t border-slate-100 p-3">
      <p className="text-xs leading-relaxed text-slate-600">仅分析已保存服务器原单的照片和实际用途，不分析当前未保存草稿或任意链接。点击识别会消耗 AI 额度；仅高可信、明确且有企业科目映射的单据可自动填入类目和科目，不覆盖人工锁定。不会审批、发钱，也不代表核验发票真伪。</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!canAnalyze} onClick={() => { setPanelError(""); setSuccessMessage(""); setRequestedAnalysis({ key: recordKey, force: hasAnalysis }); }} className="min-h-10 rounded-md bg-[#1A2B4A] px-3 py-2 text-xs font-medium text-white disabled:opacity-40">
          {busy ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />处理中…</span> : hasAnalysis ? "重新识别" : "识别并核对"}
        </button>
        <button type="button" disabled={busy || cacheQuery.isFetching} onClick={() => { setPanelError(""); void cacheQuery.refetch(); }} className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-xs disabled:opacity-40">刷新只读缓存（不识别）</button>
      </div>
      {!readOnly && currentState && !currentState.canAnalyze && <p className="text-xs text-slate-500">服务器未授予本原单识别权限；仍可查看已有结果。</p>}
      {requestedAnalysis?.key === recordKey && !readOnly && <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <p>{requestedAnalysis.force ? "重新识别" : "首次识别"}会消耗 AI 额度，只核对服务器已保存原单。是否明确继续？</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!canAnalyze} onClick={confirmAnalysis} className="min-h-10 rounded-md bg-[#1A2B4A] px-3 py-2 font-medium text-white disabled:opacity-40">确认消耗 AI 额度并{requestedAnalysis.force ? "重新识别" : "识别"}</button>
          <button type="button" onClick={() => setRequestedAnalysis(null)} className="min-h-10 rounded-md border border-amber-300 px-3 py-2">取消</button>
        </div>
      </div>}
      {currentState && <>
        <dl className="space-y-2 rounded-md bg-slate-50 p-3">
          <Field label="原单所选企业" value={currentState.company.name} />
          <Field label="企业税号" value={currentState.company.taxNo} />
          <Field label="识别时间" value={currentState.analyzedAt} />
          <Field label="核对覆盖范围" value={currentState.coverage} />
        </dl>
        <p className="text-xs font-medium">购买方抬头 / 税号与原单所选企业对照；销售方不是企业对照对象。</p>
        {currentState.extraction?.invoices.map((invoice, index) => <div key={index} className="space-y-2 rounded-md border border-slate-200 p-3">
          <h3 className="text-xs font-semibold">识别发票 {index + 1}{stale ? "（历史结果）" : ""}</h3>
          <dl className="space-y-2">
            <Field label="购买方抬头" value={invoice.buyerName} />
            <Field label="对照企业抬头" value={currentState.company.name} />
            <Field label="抬头文字对照" value={compareInvoiceText(invoice.buyerName, currentState.company.name)} />
            <Field label="购买方税号" value={invoice.buyerTaxNo} />
            <Field label="对照企业税号" value={currentState.company.taxNo} />
            <Field label="税号文字对照" value={compareInvoiceText(invoice.buyerTaxNo, currentState.company.taxNo, true)} />
            <Field label="销售方（非对照）" value={invoice.sellerName} />
            <Field label="销售方税号" value={invoice.sellerTaxNo} />
            <Field label="发票日期" value={invoice.invoiceDate} />
            <Field label="价税合计" value={invoice.totalAmount} />
            <Field label="发票项目" value={invoice.items.join("；")} />
            <Field label="发票号码" value={invoice.invoiceNumber} />
            <Field label="发票代码" value={invoice.invoiceCode} />
          </dl>
          {invoice.uncertainFields.length > 0 && <p className="break-words text-xs text-amber-800">不确定字段：{invoice.uncertainFields.join("、")}</p>}
        </div>)}
        {!currentState.extraction?.invoices.length && <p className="text-xs text-slate-500">尚无已识别发票字段，不以申请日期或申请金额冒充识别结果。</p>}
        {currentState.extraction?.notes.map((note, index) => <p key={index} className="whitespace-pre-wrap break-words text-xs text-slate-600">{note}</p>)}
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
          <h3 className="flex items-center gap-1 text-xs font-semibold text-amber-900"><AlertTriangle className="h-3 w-3" />风险与号码重复</h3>
          <p className="break-words text-xs text-amber-800">服务端覆盖范围：{currentState.coverage || "未提供"}。未发现提示不代表全面核验通过或发票真实。</p>
          {currentState.checks.map((warning, index) => <div key={`${warning.code}:${index}`} className="text-xs text-amber-900"><p className="font-semibold">{warning.label}</p><p className="whitespace-pre-wrap break-words">{warning.detail}</p></div>)}
          {currentState.duplicates.map((duplicate, index) => <div key={`${duplicate.recordId}:${index}`} className="space-y-1 break-words border-t border-amber-200 pt-2 text-xs text-amber-900">
            <p>号码重复关联原单 #{duplicate.recordId} · {reviewLabels[duplicate.status] || duplicate.status || "状态未知"}</p>
            <p>号码：{duplicate.invoiceNumber}；代码：{duplicate.invoiceCode || "未识别"}</p>
            <p>{duplicate.companyName || "企业未提供"} · {duplicate.recordDate || "日期未提供"}</p>
          </div>)}
          {!currentState.checks.length && !currentState.duplicates.length && <p className="text-xs text-amber-800">当前缓存没有风险 / 重复提示；请结合实际覆盖范围人工核对。</p>}
        </div>
        <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <h3 className="text-xs font-semibold">{classificationLabels[currentState.classification.status]}</h3>
          <p className="whitespace-pre-wrap break-words text-xs text-slate-600">{currentState.classification.reason}</p>
          <dl className="space-y-2">
            <Field label="确认来源" value={`${sourceLabels[currentState.source]}${currentState.manualLocked ? "（已人工锁定）" : ""}`} />
            <Field label="原单报销事由" value={currentState.current.expenseReason} />
            <Field label="原单类目" value={currentState.current.taxCategory} />
            <Field label="原单会计科目" value={currentState.current.accountingCode} />
          </dl>
          <p className="pt-1 text-xs font-medium">分类候选：先选择，再人工确认锁定</p>
          {currentState.classification.candidates.map((candidate, index) => {
            const selected = selectedCandidate === candidate;
            return <button type="button" key={`${candidate.categoryKey}:${candidate.itemKey}:${index}`} aria-pressed={selected} disabled={!canApply || !candidate.accountingCode} onClick={() => { setSelection({ resultKey, categoryKey: candidate.categoryKey, itemKey: candidate.itemKey }); setPanelError(""); }} className={`block w-full space-y-1 rounded-md border p-3 text-left text-xs disabled:opacity-60 ${selected ? "border-[#1A2B4A] bg-blue-50 ring-1 ring-[#1A2B4A]" : "border-slate-200"}`}>
              <span className="block font-semibold">{candidate.categoryLabel} / {candidate.itemLabel}{selected ? " · 已选中，尚未确认" : ""}</span>
              <span className="block">{candidate.accountingCode ? `企业映射科目：${candidate.accountingCode}` : "企业未配置科目映射，待人工"}</span>
              <span className="block whitespace-pre-wrap break-words text-slate-600">{candidate.reason}</span>
            </button>;
          })}
          {!currentState.classification.candidates.length && <p className="text-xs text-slate-500">暂无真实分类候选，请由有权限的人员手工确认。</p>}
          {selectedCandidate && <>
            <p className="text-xs text-slate-600">确认后采用所选候选和企业映射科目，并人工锁定；AI 不再自动覆盖。</p>
            <button type="button" disabled={!canApply || !selectedCandidate.accountingCode} onClick={applyCandidate} className="min-h-10 w-full rounded-md bg-[#1A2B4A] px-3 py-2 text-xs text-white disabled:opacity-40">人工确认所选候选并锁定</button>
          </>}
        </div>
        {!readOnly && <div className="space-y-2 rounded-md border border-slate-200 p-3">
          <button type="button" disabled={!canConfirm} onClick={() => { setManualDraft({ resultKey, ...currentState.current }); setAcknowledged(false); setPanelError(""); }} className="min-h-10 rounded-md border border-[#1A2B4A] px-3 py-2 text-xs disabled:opacity-40">手工编辑事由 / 类目 / 科目</button>
          {!currentState.canConfirm && <p className="text-xs text-slate-500">服务器未授予人工确认权限。</p>}
          {draft && <div className="space-y-3">
            <p className="text-xs text-slate-600">仅填真实用途与企业实际类目、科目；未知保持空白，不编造。确认将同时保存三个字段并人工锁定。</p>
            <label htmlFor={`${formId}-reason`} className="block text-xs">实际报销用途 / 事由
              <textarea id={`${formId}-reason`} disabled={!canConfirm} value={draft.expenseReason} onChange={event => { setManualDraft({ ...draft, expenseReason: event.target.value }); setAcknowledged(false); }} className="mt-1 min-h-20 w-full rounded-md border border-slate-300 p-2 text-sm" placeholder="填写实际用途，未知可留空" />
            </label>
            <label htmlFor={`${formId}-category`} className="block text-xs">实际报销类目
              <input id={`${formId}-category`} disabled={!canConfirm} value={draft.taxCategory} onChange={event => { setManualDraft({ ...draft, taxCategory: event.target.value }); setAcknowledged(false); }} className="mt-1 min-h-10 w-full rounded-md border border-slate-300 p-2 text-sm" placeholder="按企业实际类目填写" />
            </label>
            <label htmlFor={`${formId}-code`} className="block text-xs">企业会计科目
              <input id={`${formId}-code`} disabled={!canConfirm} value={draft.accountingCode} onChange={event => { setManualDraft({ ...draft, accountingCode: event.target.value }); setAcknowledged(false); }} className="mt-1 min-h-10 w-full rounded-md border border-slate-300 p-2 text-sm" placeholder="按企业实际会计科目填写" />
            </label>
            <label className="flex min-h-10 items-start gap-2 text-xs leading-relaxed"><input type="checkbox" disabled={!canConfirm} checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />我已人工核对上述真实用途、类目与科目，确认保存并锁定；不执行审批或付款。</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!canConfirm || !acknowledged} onClick={confirmManual} className="min-h-10 rounded-md bg-[#1A2B4A] px-3 py-2 text-xs text-white disabled:opacity-40">人工确认保存并锁定</button>
              <button type="button" disabled={busy} onClick={() => { setManualDraft(null); setAcknowledged(false); }} className="min-h-10 rounded-md border border-slate-300 px-3 py-2 text-xs">取消编辑</button>
            </div>
          </div>}
        </div>}
      </>}
    </div>}
  </section>;
}
