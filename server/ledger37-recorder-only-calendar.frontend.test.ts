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

describe('普通管理员与普通用户同版，只多双击日历数字登记：真实前端执行', () => {
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
  it('双击录入只打开数字弹窗，不打开股票管理或通用add', () => {
    const setCalendarNumberEditor = vi.fn();
    const setCalendarDateDetail = vi.fn();
    const base = { getDateStr: () => '2020-01-01', canRecordCalendarNumber: true, selectedTagId: 7, isSelectedStockPortfolio: false, calendarNumberTapRef: { current: {} }, setCalendarDateDetail, setCalendarNumberEditor };
    actual(aa, 'openCalendarNumberEditor', base)(1);
    expect(setCalendarNumberEditor).toHaveBeenCalledWith({ categoryId: 7, date: '2020-01-01' });
    expect(setCalendarDateDetail).toHaveBeenCalledWith(null);
    for (const patch of [{ canRecordCalendarNumber: false }, { selectedTagId: null }, { isSelectedStockPortfolio: true }, { getDateStr: () => '2999-01-01' }]) {
      setCalendarNumberEditor.mockClear(); actual(aa, 'openCalendarNumberEditor', { ...base, ...patch })(1); expect(setCalendarNumberEditor).not.toHaveBeenCalled();
    }
  });
  it('普通管理员不能绕过双击调用旧完整编辑入口', () => {
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
  it.each([false, true])('AI用户登记能力%s不改变AI-only模式，只传单一数字权限', (canRecordCalendar) => {
    const component = actual(home, 'Ledger37PresentationGate', { Ledger37AiHome: 'ai-home', Ledger37PresentationPending: 'pending' });
    const tree = component({ ledgerId: 37, presentation: { context: { canManage: false, aiEnabled: true, canRecordCalendar }, viewerUserId: 510025, knownSelfAIgate: true }, children: React.createElement('raw-manager'), onBack: vi.fn() });
    expect(tree.type).toBe('ai-home'); expect(tree.props.canRecordCalendar).toBe(canRecordCalendar); expect(find(tree, 'raw-manager')).toBeUndefined();
  });
  it('真实数字提交只有受限字段，不包含备注、图片、成员、转账或原记录ID', () => {
    let index = 0; const states = ['55.5', true, '']; const mutate = vi.fn();
    const component = actual(dialog, 'Ledger37CalendarNumberDialog', { useState: () => [states[index++], vi.fn()], useEffect: vi.fn(), X: 'icon', trpc: { ledger: {
      getCalendarNumber: { useQuery: () => ({ isFetchedAfterMount: true, data: { amount: 1, exists: true } }) },
      saveCalendarNumber: { useMutation: () => ({ isPending: false, mutate }) },
    } } });
    const tree = component({ categoryId: 7, date: '2026-11-01', onClose: vi.fn(), onSaved: vi.fn() });
    find(tree, 'form').props.onSubmit({ preventDefault: vi.fn() });
    expect(mutate).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 7, date: '2026-11-01', amount: 55.5, overwriteExisting: true });
  });
  it('手机双点和桌面双击都存在，不把数字日历变成顶部设置或维护按钮', () => {
    expect(aa).toContain('onDoubleClick={() => { if (canRecordCalendarCell) openCalendarNumberEditor(day); }}');
    expect(aa).toContain("event.pointerType !== 'touch'");
    expect(calendar).toContain("touchAction: 'manipulation'");
    expect(calendar).not.toMatch(/getTransactions|getTransactionDetail|getCalendarData|StockTagPortfolio|adminGetAllInitialBalances|Settings/);
    expect(dialog).not.toMatch(/getTransactionDetail|addTransaction|updateTransaction|stockCodes|images|memberId|recordId/);
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
