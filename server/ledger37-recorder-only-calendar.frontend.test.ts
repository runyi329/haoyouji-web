import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { canRecordLedger37Calendar, isLedger37FullManager } from '../shared/ledger37-permissions';
const read = (path: string) => readFileSync(new URL(`../client/src/${path}`, import.meta.url), 'utf8');
const aa = read('pages/LedgerDetailAA.tsx');
const add = read('pages/AddTransaction.tsx');
const home = read('components/Ledger37AiHome.tsx');
const dialog = read('components/Ledger37CalendarNumberDialog.tsx');
const calendar = read('components/Ledger37CalendarRecorder.tsx');
const managementGate = read('components/Ledger37ManagementRouteGate.tsx');
function actual(source: string, name: string, bindings: Record<string, any>) {
  const ast = ts.createSourceFile('actual.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer!.getText(ast);
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node.getText(ast).replace(/^export\s+(?:default\s+)?/, '');
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!expression) throw new Error(`Missing production expression: ${name}`);
  const code = ts.transpileModule(`const actual = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None } }).outputText;
  return new Function('React', ...Object.keys(bindings), `${code};return actual;`)(React, ...Object.values(bindings));
}
function find(tree: any, type: string): any {
  if (!tree || typeof tree !== 'object') return undefined;
  if (tree.type === type) return tree;
  for (const child of React.Children.toArray(tree.props?.children)) { const value = find(child, type); if (value) return value; }
}

function calendarSaveHarness(overrides: Record<string, any> = {}) {
  const bindings = {
    operation: { current: false },
    canSave: true,
    checkReady: vi.fn(() => true),
    snapshot: { amount: 1, exists: true, categoryName: '余额', version: 'snapshot-version', images: [] },
    setError: vi.fn(),
    scope: actual(dialog, 'scope', { categoryId: 7, date: '2026-11-01' }),
    amountText: '55.5',
    overwriteExisting: true,
    images: [{ imageUrl: 'existing-image.jpg' }, { imageUrl: 'uploaded-image.jpg', uploadToken: 'test-upload-token' }],
    save: { mutateAsync: vi.fn().mockResolvedValue({ success: true }) },
    onSaved: vi.fn(),
    onClose: vi.fn(),
    setConflict: vi.fn(),
    safeMessage: actual(dialog, 'safeMessage', {}),
    ...overrides,
  };
  return { bindings, handleSave: actual(dialog, 'handleSave', bindings) };
}

describe('普通管理员与普通用户同版，只多单击日历余额与照片登记：真实前端执行', () => {
  it.each(['admin', 'member', 'owner', 'super_admin'])('非账本owner即使角色%s，首页不开放管理能力', (userRole) => {
    const permission = { ledgerId: 37, userId: 510025, ownerId: 870413, memberRole: userRole };
    const canManageLedger37 = actual(aa, 'canManageLedger37', { isLedger37FullManager, ledger37Permission: permission });
    expect(canManageLedger37).toBe(false);
    expect(actual(aa, 'canEdit', { ledgerId: 37, canManageLedger37, userRole })).toBe(false);
    expect(actual(aa, 'canSwitchView', { ledgerId: 37, canManageLedger37, userRole })).toBe(false);
    expect(actual(aa, 'canManageDividends', { ledgerId: 37, canManageLedger37, canEdit: false })).toBe(false);
    expect(actual(aa, 'canRecordCalendarNumber', { canRecordLedger37Calendar, ledger37Permission: permission })).toBe(userRole === 'admin');
  });
  it('37号唯一owner保留管理，但代看时失去管理与登记能力', () => {
    expect(isLedger37FullManager({ ledgerId: 37, userId: 870413, ownerId: 870413 })).toBe(true);
    expect(isLedger37FullManager({ ledgerId: 37, userId: 870413, ownerId: 870413, isViewingAs: true })).toBe(false);
    expect(aa).toContain("isViewingAs: Boolean(viewAsUserIdFromUrl || storedViewAsUserId)");
  });
  it.each([36, 52, 59])('非37账本%s仍保留原admin编辑权限', (ledgerId) => {
    expect(actual(aa, 'canEdit', { ledgerId, canManageLedger37: false, userRole: 'admin' })).toBe(true);
  });
  it('单击录入只打开余额与照片登记页，不打开股票管理或通用add', () => {
    const setCalendarNumberEditor = vi.fn();
    const setCalendarDateDetail = vi.fn();
    const setShowImagePreview = vi.fn();
    const base = { getDateStr: () => '2020-01-01', canRecordCalendarNumber: true, selectedTagId: 7, isSelectedStockPortfolio: false, setCalendarDateDetail, setShowImagePreview, setCalendarNumberEditor };
    actual(aa, 'openCalendarNumberEditor', base)(1);
    const update = setCalendarNumberEditor.mock.calls[0][0];
    const current = { categoryId: 7, date: '2020-01-01' };
    expect(update(null)).toEqual(current);
    expect(update(current)).toBe(current);
    expect(setCalendarDateDetail).toHaveBeenCalledWith(null);
    expect(setShowImagePreview).toHaveBeenCalledWith(false);
    for (const patch of [{ canRecordCalendarNumber: false }, { selectedTagId: null }, { isSelectedStockPortfolio: true }, { getDateStr: () => '2999-01-01' }]) {
      setCalendarNumberEditor.mockClear(); actual(aa, 'openCalendarNumberEditor', { ...base, ...patch })(1); expect(setCalendarNumberEditor).not.toHaveBeenCalled();
    }
  });
  it('普通管理员不能绕过单击调用旧完整编辑入口', () => {
    const setCalendarDateDetail = vi.fn();
    actual(aa, 'openCalendarRecordEditor', { ledgerId: 37, canManageLedger37: false, setCalendarDateDetail })('2026-11-01');
    expect(setCalendarDateDetail).not.toHaveBeenCalled();
  });
  it.each([false, true])('普通管理员AI=%s时通用add深链都不挂载管理表单', (aiEnabled) => {
    const component = actual(add, 'Ledger37AddTransactionEntry', { useAuth: () => ({ user: { id: 510025 } }), useSearch: () => '', useLedger37PresentationContext: () => ({ context: { aiEnabled, canManage: false, canRecordCalendar: true } }), Ledger37PresentationGate: 'gate', AddTransaction: 'manager-form' });
    const tree = component(); expect(tree.type).toBe('gate'); expect(find(tree, 'manager-form')).toBeUndefined();
  });
  it('owner深链保留原完整表单', () => {
    const component = actual(add, 'Ledger37AddTransactionEntry', { useAuth: () => ({ user: { id: 870413 } }), useSearch: () => '', useLedger37PresentationContext: () => ({ context: { canManage: true } }), Ledger37PresentationGate: 'gate', AddTransaction: 'manager-form' });
    expect(find(component(), 'manager-form')).toBeTruthy();
  });
  it.each([false, true])('AI用户登记能力%s不改变AI-only模式，只传日历登记权限', (canRecordCalendar) => {
    const component = actual(home, 'Ledger37PresentationGate', { Ledger37AiHome: 'ai-home', Ledger37PresentationPending: 'pending' });
    const tree = component({ ledgerId: 37, presentation: { context: { canManage: false, aiEnabled: true, canRecordCalendar }, viewerUserId: 510025, knownSelfAIgate: true }, children: React.createElement('raw-manager'), onBack: vi.fn() });
    expect(tree.type).toBe('ai-home'); expect(tree.props.canRecordCalendar).toBe(canRecordCalendar); expect(find(tree, 'raw-manager')).toBeUndefined();
  });
  it('真实余额照片提交仅包含受限字段和快照版本，成功后刷新并关闭', async () => {
    const { bindings, handleSave } = calendarSaveHarness();
    await handleSave();
    expect(bindings.save.mutateAsync).toHaveBeenCalledTimes(1);
    const payload = bindings.save.mutateAsync.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['ledgerId', 'categoryId', 'date', 'amount', 'overwriteExisting', 'version', 'images'].sort());
    expect(payload).toEqual({
      ledgerId: 37, categoryId: 7, date: '2026-11-01', amount: 55.5,
      overwriteExisting: true, version: 'snapshot-version',
      images: [{ imageUrl: 'existing-image.jpg' }, { imageUrl: 'uploaded-image.jpg', uploadToken: 'test-upload-token' }],
    });
    expect(bindings.checkReady).toHaveBeenCalledTimes(1);
    expect(bindings.onSaved).toHaveBeenCalledTimes(1);
    expect(bindings.onClose).toHaveBeenCalledTimes(1);
    expect(bindings.onSaved.mock.invocationCallOrder[0]).toBeLessThan(bindings.onClose.mock.invocationCallOrder[0]);
    expect(bindings.setConflict).not.toHaveBeenCalled();
    expect(bindings.operation.current).toBe(false);
  });
  it.each([
    ['canSave不满足', { canSave: false }],
    ['已有操作进行中', { operation: { current: true } }],
    ['读取检查失败', { checkReady: () => false }],
    ['缺少快照', { snapshot: null }],
  ])('%s时真实保存函数不提交', async (_reason, overrides) => {
    const { bindings, handleSave } = calendarSaveHarness(overrides as Record<string, any>);
    await handleSave();
    expect(bindings.save.mutateAsync).not.toHaveBeenCalled();
    expect(bindings.onSaved).not.toHaveBeenCalled();
    expect(bindings.onClose).not.toHaveBeenCalled();
    expect(bindings.setError).not.toHaveBeenCalled();
  });
  it('CONFLICT保留登记页并禁止再次保存，必须返回刷新', async () => {
    const { bindings, handleSave } = calendarSaveHarness();
    bindings.save.mutateAsync.mockRejectedValueOnce({ data: { code: 'CONFLICT' } });
    await handleSave();
    expect(bindings.setConflict).toHaveBeenCalledTimes(1);
    expect(bindings.setConflict).toHaveBeenCalledWith(true);
    expect(bindings.setError).toHaveBeenLastCalledWith('记录已变化，请返回日历刷新后核对，再重新打开登记');
    expect(bindings.onSaved).not.toHaveBeenCalled();
    expect(bindings.onClose).not.toHaveBeenCalled();
    expect(bindings.operation.current).toBe(false);
    const canSave = actual(dialog, 'canSave', {
      ready: true, validNumber: true, images: bindings.images, busy: false, pending: [],
      conflict: bindings.setConflict.mock.calls[0][0], snapshot: bindings.snapshot, overwriteExisting: true,
    });
    expect(canSave).toBe(false);
    await actual(dialog, 'handleSave', { ...bindings, canSave })();
    expect(bindings.save.mutateAsync).toHaveBeenCalledTimes(1);
  });
  it('保存结果未成功时不触发刷新或关闭', async () => {
    const { bindings, handleSave } = calendarSaveHarness();
    bindings.save.mutateAsync.mockResolvedValueOnce({ success: false });
    await handleSave();
    expect(bindings.onSaved).not.toHaveBeenCalled();
    expect(bindings.onClose).not.toHaveBeenCalled();
    expect(bindings.operation.current).toBe(false);
  });
  it('单击打开余额登记，普通用户只预览已有照片且无照片不响应', () => {
    expect(aa).toContain('onClick={() => {');
    expect(aa).toContain('if (canRecordCalendarCell && selectedTagId) {');
    expect(aa).toContain('openCalendarNumberEditor(day);');
    expect(aa).toContain('if (ledgerId === 37 && canRecordCalendarNumber && !isSelectedStockPortfolio) return;');
    expect(aa).toContain('const hasImages = dayMap.get(date)?.records?.some');
    expect(aa).toContain('if (hasImages) openCalendarDayAttachments(date);');
    expect(aa).not.toContain('onDoubleClick=');
    expect(aa).not.toContain('consumeLedgerCalendarDoubleTap');
    expect(calendar).toContain('onClick={() => { if (enabled) openNumber(dayDate); }}');
    expect(calendar).not.toContain('onDoubleClick');
    expect(calendar).not.toContain('consumeLedgerCalendarDoubleTap');
    expect(calendar).not.toContain('beginLedgerCalendarTouch');
    expect(calendar).not.toContain('cancelLedgerCalendarTapOnScroll');
    expect(calendar).toContain("touchAction: 'manipulation'");
    expect(calendar).not.toMatch(/getTransactions|getTransactionDetail|getCalendarData|StockTagPortfolio|adminGetAllInitialBalances|Settings/);
    expect(dialog).toContain('trpc.ledger.getCalendarEntry.useQuery');
    expect(dialog).toContain('trpc.ledger.saveCalendarEntry.useMutation');
    expect(dialog).toContain('trpc.ledger.uploadCalendarEntryImage.useMutation');
    expect(dialog).not.toMatch(/getTransactionDetail|addTransaction|updateTransaction|stockCodes|memberId|recordId/);
  });
  it('全屏登记不靠背景关闭，拦截打开来源的兼容click', () => {
    const rootHandlers = dialog.slice(dialog.indexOf('return createPortal('), dialog.indexOf('<section role="dialog"'));
    expect(rootHandlers).toContain('fixed inset-0');
    expect(dialog).toContain('h-[100dvh]');
    expect(rootHandlers).toContain('onPointerDown={event => event.stopPropagation()}');
    expect(rootHandlers).toContain('onClick={event => event.stopPropagation()}');
    expect(rootHandlers).not.toContain('onClose');
    expect(rootHandlers).toContain('if (event.button === 0) freshPointer.current = true;');
    expect(rootHandlers).toContain('if (!freshPointer.current && event.detail > 0)');
    expect(rootHandlers).toContain('event.preventDefault(); event.stopPropagation();');
  });
  it('37号所有设置和管理深链集中保护，但本人钱包/正常页面及非37不受影响', () => {
    const MANAGEMENT_PAGES = actual(managementGate, 'MANAGEMENT_PAGES', {});
    const check = actual(managementGate, 'isLedger37ManagementPath', { MANAGEMENT_PAGES });
    for (const page of MANAGEMENT_PAGES) {
      expect(check(`/ledger/37/${page}`)).toBe(true);
      expect(check(`/ledger/037/${page}`)).toBe(true);
      expect(check(`/ledger/52/${page}`)).toBe(false);
    }
    for (const path of ['/ledger/37', '/ledger/37/wallet', '/ledger/37/report', '/ledger/37/calendar', '/ledger/37/edit-nickname', '/ledger/52/settings', '/parent/profile']) expect(check(path)).toBe(false);
  });
  it.each([false, true])('管理路由canManage=%s决定原管理树能否挂载', (canManage) => {
    const component = actual(managementGate, 'Ledger37OwnerPage', { useLocation: () => ['/ledger/37/settings', vi.fn()], useSearch: () => '', useAuth: () => ({ user: { id: 510025 } }), useLedger37PresentationContext: () => ({ context: { canManage } }), Ledger37PresentationGate: 'presentation-gate' });
    const tree = component({ children: React.createElement('management-tree') });
    expect(Boolean(find(tree, 'management-tree'))).toBe(canManage);
  });
});
