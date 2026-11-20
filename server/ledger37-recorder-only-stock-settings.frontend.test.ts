import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { isLedger37FullManager } from '../shared/ledger37-permissions';

// Execute actual frontend AST with inert tRPC/hooks. No routers, DB, HTTP or real writes.
const stockSource = readFileSync(new URL('../client/src/pages/StockTagPortfolio.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../client/src/pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
function parse(source: string) { return ts.createSourceFile('actual.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
const stock = parse(stockSource), settings = parse(settingsSource);
function find(file: ts.SourceFile, predicate: (node: ts.Node) => boolean) {
  const found: ts.Node[] = [];
  function visit(node: ts.Node) { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }
  visit(file); return found;
}
const jsCache = new Map<string, string>();
function execute(value: string, scope: Record<string, any> = {}) {
  const js = jsCache.get(value) ?? ts.transpileModule(`const actual = ${value.replace(/^export\s+(default\s+)?/, '').replaceAll('import.meta.env.DEV', 'false')};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  jsCache.set(value, js);
  return new Function('React', ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
}
function fn(file: ts.SourceFile, name: string, scope: Record<string, any>) {
  const found = find(file, n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  expect(found).toHaveLength(1); return execute(found[0].getText(file), scope);
}
const expressionCache = new Map<string, string>();
function expression(file: ts.SourceFile, name: string, scope: Record<string, any>) {
  const key = `${file === stock ? 'stock' : 'settings'}:${name}`;
  if (expressionCache.has(key)) return execute(expressionCache.get(key)!, scope);
  const found = find(file, n => ts.isVariableDeclaration(n) && n.name.getText(file) === name) as ts.VariableDeclaration[];
  expect(found).toHaveLength(1);
  const value = found[0].initializer!.getText(file); expressionCache.set(key, value);
  return execute(value, scope);
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
const owner = 870413;
function permissionHarness({ ledgerId = 37, userId = owner, ledgerRole = 'owner', systemRole = 'parent', ownerId = owner,
  search = '', stored = null, storageError = false, authLoading = false, authError = null,
  fetched = true, queryError = null, returnedLedgerId = ledgerId, missingLedger = false, missingOwner = false }:
  { ledgerId?: number; userId?: number; ledgerRole?: string; systemRole?: string; ownerId?: any; search?: string; stored?: string | null; storageError?: boolean;
    authLoading?: boolean; authError?: any; fetched?: boolean; queryError?: any; returnedLedgerId?: number; missingLedger?: boolean; missingOwner?: boolean } = {}) {
  const query = { data: missingLedger ? undefined : { id: returnedLedgerId, ownerId: missingOwner ? undefined : ownerId, userRole: ledgerRole }, error: queryError, isFetchedAfterMount: fetched };
  const getById = vi.fn(() => query);
  const scope: Record<string, any> = {
    ledgerId, authLoading, authError, user: userId ? { id: userId, role: systemRole } : null, isLedger37FullManager,
    window: { location: { search }, sessionStorage: { getItem: vi.fn(() => { if (storageError) throw new Error('storage unavailable'); return stored; }) } },
    trpc: { ledger: { getById: { useQuery: getById } } },
  };
  scope.isLedger37AiReadonlyView = expression(settings, 'isLedger37AiReadonlyView', scope);
  scope.ledgerQuery = expression(settings, 'ledgerQuery', scope);
  scope.ledgerData = expression(settings, 'ledgerData', scope);
  scope.canAccess = expression(settings, 'canAccess', scope);
  scope.managementQueriesEnabled = expression(settings, 'managementQueriesEnabled', scope);
  return { scope, getById };
}
const managedQueryNames = ['getCategories', 'adminGetAllInitialBalances', 'getLedger37WalletMarginContext', 'getStockLotParticipationMatrix', 'getStockTagPortfolio',
  'getTagConfig', 'getTagSummary', 'adminGetMemberTagHideImpact', 'adminGetLedger37MemberWalletSnapshot', 'getCryptoPrices', 'getRate'];
const queryOptionsCache = new Map<string, string>();
function queryOptions(name: string, scope: Record<string, any>) {
  if (!queryOptionsCache.has(name)) {
    const found = find(settings, n => ts.isCallExpression(n) && n.expression.getText(settings).endsWith(`.${name}.useQuery`)) as ts.CallExpression[];
    expect(found).toHaveLength(1); queryOptionsCache.set(name, found[0].arguments[1].getText(settings));
  }
  return execute(queryOptionsCache.get(name)!, {
    ...scope, stockAllocationFocus: undefined, activeStockParticipationCategoryId: 90251, selectedTagName: 'R2',
    walletMarginContextTargetUserId: 901, walletSnapshotUser: { id: 901 }, hideConfirmation: { userId: 901, tagName: 'R2' },
    canViewLedger37WalletSnapshot: expression(settings, 'canViewLedger37WalletSnapshot', scope),
  });
}

function stockWrapper({ categoryId = 90250, aiEnabled = false, canManage = false, pending = false, participantView = false } = {}) {
  const props = { ledgerId: 37, categoryId, categoryName: '原持仓名称', onBack: vi.fn(), participantView, effectiveUserId: 901 };
  const context = pending ? undefined : { ledgerId: 37, viewerUserId: 901, canManage, canRecordCalendar: true, aiEnabled };
  const scope = {
    useAuth: () => ({ user: { id: 901, role: 'super_admin' } }), useSearch: () => '',
    useLedger37PresentationContext: vi.fn(() => ({ context, viewerUserId: 901, knownSelfAIgate: !!context?.aiEnabled && !context.canManage })),
    Ledger37PresentationPending: 'pending', Ledger37AiStockParticipationView: 'safe-ai', R1StockPresentationTabs: 'tabs', LegacyStockTagPortfolio: 'legacy',
    isR1StockPresentationScope: (ledgerId: number, categoryId: number) => ledgerId === 37 && categoryId === 90250,
  };
  return fn(stock, 'R1StockPresentation', scope)(props);
}

describe('账本37普通admin仅日历数字登记：股票/初始保证金前端离线契约', () => {
  it.each(['admin', 'super_admin', 'parent', 'user'])('系统role=%s、成员admin或伪owner都不能超越真实ownerId', systemRole => {
    for (const ledgerRole of ['admin', 'owner', 'member', 'viewer']) {
      const h = permissionHarness({ userId: 901, ledgerRole, systemRole });
      expect(h.scope.canAccess).toBe(false); expect(h.scope.managementQueriesEnabled).toBe(false);
      for (const name of managedQueryNames) expect(queryOptions(name, h.scope).enabled, name).toBe(false);
    }
  });
  it.each(['admin', 'owner', 'member', 'viewer'])('真实owner本人不靠成员role=%s豁免，权威回包后才能查询', ledgerRole => {
    const h = permissionHarness({ ledgerRole, systemRole: 'user' });
    expect(h.scope.canAccess).toBe(true);
    for (const name of managedQueryNames) expect(queryOptions(name, h.scope).enabled, name).toBe(true);
    expect(h.getById).toHaveBeenCalledWith({ ledgerId: 37 }, expect.objectContaining({ placeholderData: undefined, staleTime: 0, refetchOnMount: 'always', retry: false }));
  });
  it.each([null, undefined, 0, -1, NaN, 'bad', 1.2])('ownerId=%s缺失或非法时拒绝，即使userRole=owner/systemadmin', ownerId => {
    const h = permissionHarness({ ownerId, missingOwner: ownerId === undefined, systemRole: 'super_admin' });
    expect(h.scope.canAccess).toBe(false); expect(queryOptions('adminGetAllInitialBalances', h.scope).enabled).toBe(false);
  });
  it.each([{ fetched: false }, { queryError: new Error('offline') }, { authLoading: true }, { authError: new Error('expired') },
    { missingLedger: true }, { returnedLedgerId: 52 }, { userId: 0 }])('直URL缓存/加载/错误/错账本/无有效user先禁用全部管理查询：%j', patch => {
    const h = permissionHarness(patch);
    expect(h.scope.canAccess).toBe(false);
    for (const name of managedQueryNames) expect(queryOptions(name, h.scope).enabled, name).toBe(false);
  });
  it.each(['?viewAs=901', `?viewAs=${owner}`, '?viewAs=', '?viewAs=bad', '?viewAs=0', '?readonly=true', '?readonly=1'])('URL=%s真实owner也不能进入管理读取/AI保存或热预览', search => {
    const h = permissionHarness({ search });
    expect(h.scope.canAccess).toBe(false);
    expect(queryOptions('adminGetAllInitialBalances', h.scope).enabled).toBe(false);
    for (const isLocalHotPreview of [false, true]) {
      const scope = { ...h.scope, isLocalHotPreview };
      expect(expression(settings, 'canManageLedger37Ai', scope)).toBe(false);
      expect(expression(settings, 'canPreviewLedger37Ai', scope)).toBe(false);
    }
  });
  it.each(['901', String(owner), '', '0', 'invalid'])('sessionStorage代看=%s同样fail-closed，不从系统角色恢复', stored => {
    const h = permissionHarness({ stored, systemRole: 'super_admin' });
    expect(h.scope.canAccess).toBe(false);
    for (const name of managedQueryNames) expect(queryOptions(name, h.scope).enabled, name).toBe(false);
  });
  it('无法读取sessionStorage或SSR时关闭权限，不假定为本人', () => {
    expect(permissionHarness({ storageError: true }).scope.canAccess).toBe(false);
    expect(expression(settings, 'isLedger37AiReadonlyView', { window: undefined })()).toBe(true);
  });
  it('身份和viewAs切换重挂原编辑器，旧getById缓存必须重新权威确认', () => {
    let id = owner, search = '', stored: string | null = null;
    const component = fn(settings, 'LedgerAAInitialBalanceContent', {
      useParams: () => ({ id: '37' }), useAuth: () => ({ user: { id } }), useSearch: () => search,
      window: { sessionStorage: { getItem: () => stored } }, LedgerAAInitialBalanceEditor: 'original-editor',
    });
    const initial = component({ stockAllocationFocus: { categoryId: 90251, lotId: 22 } });
    expect(initial.props.stockAllocationFocus).toEqual({ categoryId: 90251, lotId: 22 });
    id = 901; expect(component({}).key).not.toBe(initial.key);
    id = owner; search = '?viewAs=901'; expect(component({}).key).not.toBe(initial.key);
    search = ''; stored = '901'; expect(component({}).key).not.toBe(initial.key);
    expect(permissionHarness({ fetched: false }).scope.canAccess).toBe(false);
  });
  it.each(['owner', 'admin', 'member', 'viewer'])('其他账本仍按原成员role=%s访问且不改变查询enabled', ledgerRole => {
    const h = permissionHarness({ ledgerId: 52, userId: 901, ledgerRole, systemRole: 'super_admin', fetched: false, search: '?viewAs=901' });
    expect(h.scope.canAccess).toBe(['owner', 'admin'].includes(ledgerRole));
    expect(queryOptions('adminGetAllInitialBalances', h.scope).enabled).toBe(true);
    expect(queryOptions('getCategories', h.scope).enabled).toBe(true);
    expect(queryOptions('getTagConfig', h.scope).enabled).toBe(true);
  });
  it.each([90250, 90251, 123])('股票category=%s普通admin开AI走safe树，关AI只能用户树，忽略父admin props', categoryId => {
    const ai = stockWrapper({ categoryId, aiEnabled: true, participantView: false });
    expect(ai.type).toBe('safe-ai'); expect(ai.props).not.toHaveProperty('adminPreview');
    const user = stockWrapper({ categoryId, aiEnabled: false, participantView: false });
    if (categoryId !== 90250) { expect(user.type).toBe('legacy'); expect(user.props.participantView).toBe(true); expect(user.props.identityScoped).toBe(true); }
    else {
      expect(user.type).toBe('tabs');
      const tree = fn(stock, 'R1StockPresentationTabs', { useState: (value: any) => [value, vi.fn()], LegacyStockTagPortfolio: 'legacy', Ledger37AiHome: 'safe' })(user.props);
      expect(nodes(tree).filter(n => n.props?.role === 'tab')).toHaveLength(0);
      expect(nodes(tree).find(n => n.type === 'legacy').props).toMatchObject({ participantView: true, presentationMode: 'user' });
    }
  });
  it('股票权限未确认时仅pending树，不能先挂组合/matrix/交易或分配子组件', () => {
    for (const categoryId of [90250, 90251]) expect(stockWrapper({ categoryId, pending: true }).type).toBe('pending');
  });
  it('真实owner仍保留原三tab与非R1混合持仓，不复制或回滚样式', () => {
    const wrapper = stockWrapper({ canManage: true });
    const tree = fn(stock, 'R1StockPresentationTabs', { useState: (value: any) => [value, vi.fn()], LegacyStockTagPortfolio: 'legacy', Ledger37AiHome: 'safe' })(wrapper.props);
    expect(nodes(tree).filter(n => n.props?.role === 'tab').map(text)).toEqual(['用户', '管理员', 'AI']);
    expect(nodes(tree).find(n => n.type === 'legacy').props.participantView).toBe(false);
    expect(stockWrapper({ categoryId: 90251, canManage: true, participantView: false }).props.participantView).toBe(false);
    expect(stockSource).toContain('default: module.LedgerAAInitialBalanceContent');
    expect(settingsSource).toContain('return <LedgerAAInitialBalanceContent />;');
  });
  it('普通admin强制participantView后原global/snapshot/matrix管理query全禁用，canEdit=false，买卖分配handler拒绝', () => {
    const scope: Record<string, any> = { participantView: true, categoryId: 90251, ledgerId: 37, data: { canEdit: true }, canEdit: false,
      showActionDialog: true, correctingEvent: {}, eventType: 'buy', symbolQuery: 'AAPL', correctionStockMarket: 'US', selectedStock: null };
    for (const name of ['getStockTagPortfolio', 'getStockTagDailySnapshots', 'getStockLotParticipationMatrix']) {
      const calls = find(stock, n => ts.isCallExpression(n) && n.expression.getText(stock).endsWith(`.${name}.useQuery`)) as ts.CallExpression[];
      expect(calls).toHaveLength(1); expect(execute(calls[0].arguments[1].getText(stock), scope).enabled).toBe(false);
    }
    expect(expression(stock, 'canEdit', scope)).toBe(false);
    const setters = { setStockAllocationTarget: vi.fn(), setEditingSale: vi.fn(), setTradeType: vi.fn(), setPreselectedSellLotId: vi.fn(), setShowTradeDialog: vi.fn() };
    for (const [name, args] of [['openStockAllocation', [22]], ['openTrade', ['buy']], ['openSoldSaleEdit', [{}]]] as const) expression(stock, name, { ...scope, ...setters })(...args);
    for (const spy of Object.values(setters)) expect(spy).not.toHaveBeenCalled();
  });
});
