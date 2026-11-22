import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  ACCOUNTING_OPTIONS, EXPENSE_CATEGORIES, getDefaultExpenseConfig,
  getEnabledExpenseItems, normalizeExpenseConfig,
} from '../../../shared/aj-expense-config';
import {
  describeAJBatchApproveResult, isAJBatchCheckRow, isAJBatchSnapshotCurrent,
  type AJBatchCheckRow, type AJBatchSelection,
} from '../../../shared/aj-invoice-ai';

// 仅结构输入测试：不 mock 接口、用户、发票、金额历史或数据库，不导入产品组件。
const root = path.resolve(import.meta.dirname, '../..');
const source = (relative: string) => readFileSync(path.join(root, relative), 'utf8');
const add = source('src/pages/AddTransaction.tsx');
const batch = source('src/components/AJBatchReview.tsx');
const owner = source('src/components/AJOwnerPanel.tsx');
const panel = source('src/components/AJInvoiceAIPanel.tsx');
const configPanel = source('src/components/AJExpenseConfigPanel.tsx');
const manager = source('src/pages/AJCompanyManager.tsx');
const detail = source('src/pages/TransactionDetail.tsx');
const fingerprint = 'a'.repeat(64);
const changedFingerprint = 'b'.repeat(64);
const row = (warnings: string[] = [], key = fingerprint): AJBatchCheckRow => ({
  id: 1, reviewFingerprint: key,
  reviewWarnings: warnings.map(code => ({ code, label: '', detail: '' })),
});
const selection = (reviewed = false): AJBatchSelection => ({
  recordIds: [1], expectedChecks: [{ id: 1, fingerprint }],
  reviewedRisks: reviewed ? [{ id: 1, fingerprint }] : [],
});

function parsed(text: string) {
  return ts.createSourceFile('frontend.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function effectBodies(text: string): string[] {
  const result: string[] = [];
  const tree = parsed(text);
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect') {
      result.push(node.arguments[0]?.getText(tree) || '');
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return result;
}

describe('AJ 企业配置纯函数防丢与禁用事项', () => {
  it('默认目录兼容旧配置，但从不凭空创建科目映射', () => {
    const defaults = getDefaultExpenseConfig();
    expect(Object.keys(defaults)).toEqual(EXPENSE_CATEGORIES.map(category => category.key));
    expect(getEnabledExpenseItems(undefined)).toHaveLength(EXPENSE_CATEGORIES.flatMap(category => category.items).length);
    expect(getEnabledExpenseItems(undefined).every(item => item.accountingCode === null)).toBe(true);
  });
  it('旧布尔事项关闭与合法映射保存不互相覆盖且不修改入参', () => {
    const category = EXPENSE_CATEGORIES[0];
    const key = category.items[0].key;
    const input = { [category.key]: { enabled: false, items: { [key]: false }, accountingMap: { [key]: ACCOUNTING_OPTIONS[0] } } };
    const before = JSON.stringify(input);
    const normalized = normalizeExpenseConfig(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(normalized[category.key].accountingMap?.[key]).toBe(ACCOUNTING_OPTIONS[0]);
    expect(normalized[category.key].items[key]).toBe(false);
    expect(getEnabledExpenseItems(normalized).some(item => item.categoryKey === category.key)).toBe(false);
    normalized[category.key].enabled = true;
    expect(getEnabledExpenseItems(normalized).some(item => item.itemKey === key && item.categoryKey === category.key)).toBe(false);
    normalized[category.key].items[key] = true;
    expect(getEnabledExpenseItems(normalized).find(item => item.categoryKey === category.key && item.itemKey === key)?.accountingCode).toBe(ACCOUNTING_OPTIONS[0]);
  });
  it('未知合法旧类目/事项/映射保留，但不加入 AI 候选目录', () => {
    const unknownKey = '__offline_unknown_directory__';
    const normalized = normalizeExpenseConfig({ [unknownKey]: { enabled: false, items: { old: false }, accountingMap: { old: ACCOUNTING_OPTIONS[0] } } });
    expect(normalized[unknownKey]).toEqual({ enabled: false, items: { old: false }, accountingMap: { old: ACCOUNTING_OPTIONS[0] } });
    expect(getEnabledExpenseItems(normalized).some(item => item.categoryKey === unknownKey)).toBe(false);
    expect(normalizeExpenseConfig(normalized)).toEqual(normalized);
  });
  it('非法科目和原型污染字段被剔除，合法旧值不丢', () => {
    const input = JSON.parse('{"__proto__":{"enabled":true,"items":{"polluted":true}},"travel":{"enabled":true,"items":{"__proto__":true,"flight":false},"accountingMap":{"constructor":"银行存款","flight":"不存在科目"}}}');
    const normalized = normalizeExpenseConfig(input);
    expect(Object.hasOwn(normalized, '__proto__')).toBe(false);
    expect(Object.hasOwn(normalized.travel.items, '__proto__')).toBe(false);
    expect(normalized.travel.accountingMap).toEqual({});
    expect(normalized.travel.items.flight).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it.each([null, [], '', 0, true])('非对象输入 %j 使用旧目录默认而非编造科目', input => {
    expect(normalizeExpenseConfig(input)).toEqual(getDefaultExpenseConfig());
  });
});

describe('AJ 批审快照与风险默认确认纯函数', () => {
  it('严格指纹格式就绪，禁止空/无效 ID 与指纹', () => {
    expect(isAJBatchCheckRow(row())).toBe(true);
    expect(isAJBatchCheckRow(row([], ''))).toBe(false);
    expect(isAJBatchCheckRow({ ...row(), id: 0 })).toBe(false);
  });
  it('同额风险默认未确认不得提交', () => {
    expect(isAJBatchSnapshotCurrent(selection(), [row(['same_amount'])])).toBe(false);
    expect(isAJBatchSnapshotCurrent(selection(true), [row(['same_amount'])])).toBe(true);
  });
  it.each(['duplicate', 'invoice_number_unknown', 'missing_images', 'malformed_images', 'buyer_mismatch', 'classification_context_stale'])('%s 必须按当前指纹人工核对', code => {
    expect(isAJBatchSnapshotCurrent(selection(), [row([code])])).toBe(false);
    expect(isAJBatchSnapshotCurrent(selection(true), [row([code])])).toBe(true);
  });
  it.each(['invalid_amount', 'invalid_date'])('%s 即使核对也须先修正', code => {
    expect(isAJBatchSnapshotCurrent(selection(true), [row([code])])).toBe(false);
  });
  it('确认后金额/图片/号码/企业配置导致指纹变更即失效', () => {
    expect(isAJBatchSnapshotCurrent(selection(true), [row(['same_amount'], changedFingerprint)])).toBe(false);
    expect(isAJBatchSnapshotCurrent(selection(), [row([], changedFingerprint)])).toBe(false);
  });
  it('消失的单、重复 ID、空选择、缺少 expectedChecks 不得审批', () => {
    expect(isAJBatchSnapshotCurrent(selection(), [])).toBe(false);
    expect(isAJBatchSnapshotCurrent({ ...selection(), recordIds: [1, 1] }, [row()])).toBe(false);
    expect(isAJBatchSnapshotCurrent(selection(), [row(), row()])).toBe(false);
    expect(isAJBatchSnapshotCurrent({ ...selection(), recordIds: [] }, [row()])).toBe(false);
    expect(isAJBatchSnapshotCurrent({ ...selection(), expectedChecks: [] }, [row()])).toBe(false);
  });
});

describe('批审已完成写入和部分失败反馈', () => {
  it('全部完成显示真实金额/津贴/状态变化跳过', () => {
    const result = describeAJBatchApproveResult({ approved: 2, totalAmount: 10, totalBonus: 0.2, skipped: 1, failed: [], remaining: 0 });
    expect(result.hasFailures).toBe(false);
    expect(result.message).toContain('2 笔已通过');
    expect(result.message).toContain('10.00 元');
    expect(result.message).toContain('0.2000 USDT');
    expect(result.message).toContain('1 笔状态已变化');
  });
  it('失败停止后明确部分通过与 remaining，不宣称整批回滚', () => {
    const result = describeAJBatchApproveResult({ approved: 1, totalAmount: 10, totalBonus: 0.1, skipped: 0, failed: [{ id: 2, message: '指纹已变更' }], remaining: 3 });
    expect(result.hasFailures).toBe(true);
    expect(result.message).toContain('部分通过1笔，失败1笔，未处理仍待审核');
    expect(result.message).toContain('3 笔尚未处理');
    expect(result.details).toBe('#2：指纹已变更');
    expect(result.message).not.toContain('尚未批准任何申请');
    expect(result.message).not.toContain('全部成功');
  });
  it('兼容没有 failed 数组的旧成功返回', () => {
    expect(describeAJBatchApproveResult({ approved: 0, totalAmount: 0, totalBonus: 0, skipped: 0 }).hasFailures).toBe(false);
  });
});

describe('AJ UI 源码接线离线回归', () => {
  it('冲突逐块解决并保留最新 37 门控与 AJ 面板', () => {
    expect(add).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
    expect(add).toContain('import { Ledger37PresentationGate, useLedger37PresentationContext }');
    expect(add).toContain('return Number(id) === 37 ? <Ledger37AddTransactionEntry /> : <AddTransaction />');
    expect(add).toContain('presentation.context?.canManage === true ? <AddTransaction />');
    expect(add).toContain('export default AddTransactionPresentationEntry');
    expect(add).toContain('<StockTagPortfolio');
    expect(add).toContain('<AJInvoiceAIPanel');
  });
  it('所有受审前端 TSX 均可单独解析，无需启动后端或全库 build', () => {
    for (const [name, text] of Object.entries({ add, batch, owner, panel, configPanel, manager, detail })) {
      const tree = parsed(text) as ts.SourceFile & { parseDiagnostics: ts.Diagnostic[] };
      expect(tree.parseDiagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), name).toEqual([]);
    }
  });
  it('挂载、列表加载或 effect 不自动触发付费 AI/mutation', () => {
    for (const text of [add, batch, owner, panel, configPanel, manager, detail]) {
      for (const effect of effectBodies(text)) {
        expect(effect).not.toMatch(/(?:analyzeMutation|applyMutation|confirmMutation)\.mutate(?:Async)?\(/);
      }
    }
    expect(panel).toContain('确认消耗 AI 额度并');
    expect(panel).toContain('requestedAnalysis?.key !== recordKey');
    expect(batch).toContain('onClick={() => void analyzeCurrent()}');
    expect(batch).toContain('.slice(0, 10)');
    expect(panel).toContain('刷新只读缓存（不识别）');
  });
  it('人工锁定与过期建议禁止自动覆盖，按钮使用服务端权限', () => {
    expect(panel).toContain('currentState?.manualLocked');
    expect(panel).toContain('!stale && currentState?.state === "ready"');
    expect(panel).toContain('currentState.canApply === true');
    expect(panel).toContain('currentState?.canConfirm === true');
    expect(panel).toContain('analysisId: currentState.analysisId, snapshotKey: currentState.snapshotKey');
    expect(panel).toContain('!selectedCandidate.accountingCode');
    expect(panel).toContain('人工确认保存并锁定');
    expect(panel).toContain('actionLock.current');
    expect(panel).toContain('POST 403');
    expect(panel).toContain('retry: false');
  });
  it('AJ 原编号 update 后 resubmit 串联且不重置状态，不回写不可见的旧分类', () => {
    const saveBody = add.slice(add.indexOf('const saveAJOriginal'), add.indexOf('const handleConfirmOverwrite'));
    expect(saveBody.indexOf('updateTransactionMutation.mutateAsync')).toBeLessThan(saveBody.indexOf('ajResubmitMutation.mutateAsync'));
    expect(saveBody).toContain('recordId: editTransactionId');
    expect(saveBody).toContain('transactionId: editTransactionId');
    expect(saveBody).not.toContain('addTransactionMutation');
    expect(saveBody).toContain('修改已保存，但再次提交失败');
    expect(add).toContain('delete payload.reimbursementStatus');
    expect(add).toContain('delete payload.categoryId');
    expect(add).toContain('ajCurrentMaterialRef.current !== originalKey');
    expect(add).toContain('initializedEditRef.current === editKey');
    expect(add).toContain('readOnly={isAJEditBlocked || isSaving || ajHasUnsavedChanges}');
  });
  it('上传全过程与新增保存有同步锁，部分上传失败仍保留凭证', () => {
    expect(add).toContain('ajUploadLock.current || ajSaveLock.current');
    expect(add).toContain('(isCustomAJ && ajUploadBusy)');
    expect(add).toContain('if (isCustomAJ) ajNewSubmitLock.current = true');
    expect(add).toContain('图片上传未完成，已保留');
    expect(add).toContain('if (uploadedUrls.length > 0) setUploadedImages(prev => [...prev, ...uploadedUrls])');
    expect(add).toContain('请输入有效的正数报销金额');
  });
  it('预览不是 AI/审批结果，不编造用途、审批签名或会计默认值', () => {
    expect(add).toContain('本预览不代表 AI 结果或审核通过');
    expect(add).not.toContain('AI财会助理</strong> 自动生成预览');
    expect(add).not.toContain('const expenseReasonLabel');
    expect(add).not.toContain('const surnames');
    expect(add).toContain('payload.description = note');
    expect(panel).toContain('不代表核验发票真伪');
    expect(panel).toContain('不以申请日期或申请金额冒充识别结果');
  });
  it('最终快照即时校验，不仅依赖 useEffect；风险单默认不选', () => {
    expect(batch).toContain('isAJBatchSnapshotCurrent(confirmation.payload, rows)');
    expect(batch).toContain('disabled={!confirmationCurrent}');
    expect(batch).toContain('row.reviewWarnings.length === 0');
    expect(batch).toContain('setConfirmation(null); setSelectedIds(new Set()); setReviewed({}); onRefresh()');
    expect(owner).toContain('!isAJBatchSnapshotCurrent(selection, pendingList)');
    expect(owner).toContain('batchApprovalLock.current = true');
    expect(owner).toContain('key={`${ledgerId}:${selectedCompanyId}:${selectedEmployee}:${period}`}');
  });
  it('批审 partial 与网络失败采用持久反馈并刷新实际数据，不误报回滚', () => {
    expect(owner).toContain('describeAJBatchApproveResult(result)');
    expect(owner).toContain('if (feedback.hasFailures) toast.error(feedback.message)');
    expect(owner).toContain('batchFeedback.details');
    expect(owner).toContain('请刷新实际清单核对已通过单');
    expect(owner).not.toContain('本次尚未批准任何申请');
    expect(owner).toContain('retry: false');
  });
  it('企业配置按企业重挂载；查询失败不能用默认值覆盖；更新令 AI 和批审缓存失效', () => {
    expect(configPanel).toContain('key={`${props.ledgerId}:${props.company.id}`}');
    expect(configPanel).toContain('query.isSuccess && !query.isError && !query.isFetching');
    expect(configPanel).toContain('const accountingMap = { ...category.accountingMap }');
    expect(configPanel).toContain('(utils as any).ledger.invalidate()');
    expect(configPanel).toContain('当前编辑内容已保留');
    expect(manager).toContain('<AJExpenseConfigPanel');
    expect(manager).toContain('目录与默认配置统一由 shared');
  });
  it('移动端滚动安全区和长文本回归接线', () => {
    expect(batch).toContain('max-w-[480px]');
    expect(batch).toContain('min-h-0 flex-1 overflow-y-auto');
    expect(batch).toContain('safe-area-inset-bottom');
    expect(configPanel).toContain('max-h-[92dvh]');
    expect(panel).toContain('whitespace-pre-wrap break-words');
    expect(add).toContain('className="min-w-0 text-3xl');
  });
});
