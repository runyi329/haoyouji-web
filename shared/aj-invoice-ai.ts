export type AJAIWarning = { code: string; label: string; detail: string };
export type AJAIExtractedInvoice = {
  invoiceNumber: string | null; invoiceCode: string | null;
  buyerName: string | null; buyerTaxNo: string | null;
  sellerName: string | null; sellerTaxNo: string | null;
  totalAmount: string | null; invoiceDate: string | null;
  items: string[]; confidence: number; uncertainFields: string[];
};
export type AJAICandidate = {
  categoryKey: string; itemKey: string; categoryLabel: string; itemLabel: string;
  accountingCode: string | null; confidence: number; reason: string;
};
export type AJAIDuplicate = {
  recordId: number; status: string; invoiceNumber: string; invoiceCode: string | null;
  companyName: string; recordDate: string;
};
export type AJInvoiceAIState = {
  recordId: number; ledgerId: number; state: 'not_analyzed' | 'ready' | 'stale' | 'error';
  analysisId: number | null; analyzedAt: string | null; snapshotKey: string;
  extraction: { invoices: AJAIExtractedInvoice[]; notes: string[] } | null;
  checks: AJAIWarning[]; duplicates: AJAIDuplicate[];
  classification: { status: 'auto' | 'suggested' | 'manual_required' | 'locked'; candidates: AJAICandidate[]; reason: string };
  current: { taxCategory: string; accountingCode: string; expenseReason: string };
  source: 'none' | 'ai' | 'manual' | 'legacy_manual'; manualLocked: boolean;
  company: { id: number | null; name: string; taxNo: string; configVersion: string };
  coverage: string; canAnalyze: boolean; canApply: boolean; canConfirm: boolean;
};

export type AJBatchCheck = { id: number; fingerprint: string };
export type AJBatchCheckRow = { id: number; reviewFingerprint: string; reviewWarnings: AJAIWarning[] };
export type AJBatchSelection = { recordIds: number[]; reviewedRisks: AJBatchCheck[]; expectedChecks: AJBatchCheck[] };

export function isAJBatchCheckRow(row: AJBatchCheckRow): boolean {
  return Number.isSafeInteger(row?.id) && row.id > 0
    && typeof row.reviewFingerprint === 'string' && /^[a-f0-9]{64}$/.test(row.reviewFingerprint)
    && Array.isArray(row.reviewWarnings);
}

/** 最终点击时再次核对当前清单，不依赖 effect 的异步清空或服务器兜底。 */
export function isAJBatchSnapshotCurrent(selection: AJBatchSelection, rows: AJBatchCheckRow[]): boolean {
  if (!selection.recordIds.length || !rows.every(isAJBatchCheckRow)) return false;
  const byId = new Map(rows.map(row => [row.id, row]));
  const expected = new Map(selection.expectedChecks.map(check => [check.id, check.fingerprint]));
  const reviewed = new Map(selection.reviewedRisks.map(check => [check.id, check.fingerprint]));
  if (byId.size !== rows.length || new Set(selection.recordIds).size !== selection.recordIds.length
    || expected.size !== selection.recordIds.length || expected.size !== selection.expectedChecks.length
    || reviewed.size !== selection.reviewedRisks.length) return false;
  return selection.recordIds.every(id => {
    const row = byId.get(id);
    return !!row && expected.get(id) === row.reviewFingerprint
      && !row.reviewWarnings.some(warning => ['invalid_amount', 'invalid_date'].includes(warning.code))
      && (!row.reviewWarnings.length || reviewed.get(id) === row.reviewFingerprint);
  }) && selection.reviewedRisks.every(check => selection.recordIds.includes(check.id));
}

export type AJBatchApproveResult = {
  approved: number; totalAmount: number; totalBonus: number; skipped: number;
  failed?: { id: number; message: string }[];
  remaining?: number;
};

/** 已完成的写入与失败分开呈现，绝不宣称失败意味着整批回滚。 */
export function describeAJBatchApproveResult(result: AJBatchApproveResult) {
  const failed = Array.isArray(result.failed) ? result.failed : [];
  const summary = failed.length
    ? `部分通过${result.approved}笔，失败${failed.length}笔，未处理仍待审核`
    : `批量审核完成：${result.approved} 笔已通过`;
  const totals = `共 ${Number(result.totalAmount).toFixed(2)} 元，共发放津贴 ${Number(result.totalBonus).toFixed(4)} USDT`;
  const skipped = result.skipped > 0 ? `；${result.skipped} 笔状态已变化，已跳过，请刷新核对` : '';
  const remaining = Number(result.remaining) > 0 ? `；另有 ${result.remaining} 笔尚未处理，请按最新清单重新选择` : '';
  return {
    hasFailures: failed.length > 0,
    message: `${summary}，${totals}${skipped}${remaining}`,
    details: failed.map(item => `#${item.id}：${item.message}`).join('\n'),
  };
}
