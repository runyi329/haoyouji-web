import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Switch as ActualSwitch } from '../client/src/components/ui/switch';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';
import * as instruments from '../shared/portfolio-instruments';

// Only execute the actual frontend AST with inert mutation spies: no router, DB, HTTP or business startup.
const source = readFileSync(new URL('../client/src/pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.Expression>();
const effects: ts.CallExpression[] = [];
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer) declarations.set(node.name.getText(ast), node.initializer);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node);
  ts.forEachChild(node, visit);
}
visit(ast);
function expression(name: string, scope: Record<string, any>): any {
  const initializer = declarations.get(name);
  if (!initializer) throw new Error(`Missing actual frontend expression: ${name}`);
  return code(initializer.getText(ast), scope);
}
function code(value: string, scope: Record<string, any>): any {
  const js = ts.transpileModule(`const execute = ${value};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function('React', ...Object.keys(scope), `${js}; return execute;`)(React, ...Object.values(scope));
}
function runEffect(marker: string, scope: Record<string, any>) {
  const matching = effects.filter(effect => effect.arguments[0]?.getText(ast).includes(marker));
  expect(matching).toHaveLength(1);
  return code(matching[0].arguments[0].getText(ast), scope)();
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
function deferred() {
  let resolve!: (value?: any) => void, reject!: (error: Error) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const key = LEDGER37_AI_DISPLAY_KEY;
const queryKey = [['ledger', 'adminGetAllInitialBalances'], { input: { ledgerId: 37 }, type: 'query' }] as const;
function fixtureLot(id: number, status = 'active') {
  return { id, symbol: '000001.SZ', stockName: `持仓${id}`, status, initialQuantity: 100, currentQuantity: status === 'closed' ? 0 : 100,
    unitCost: 10, openedAt: '2026-11-12T00:00:00Z', marketPrice: 11, participations: [], observations: [] };
}
function harness() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const data = { members: [{ userId: 901, name: '成员甲' }, { userId: 902, name: '成员乙' }],
    balancesMap: { 901: { R1: 100, R1__ratio: 20, R1__margins: '[{"id":"deposit","coin":"CNY","amount":"90"}]', otherJson: { keep: 1 } }, 902: { other: 77 } }, otherMeta: { keep: true } };
  queryClient.setQueryData(queryKey, data);
  const scope: Record<string, any> = {
    ...instruments, LEDGER37_AI_DISPLAY_KEY, Fragment: React.Fragment,
    ledgerId: 37, user: { id: 1 }, canAccess: true, canManageLedger37Ai: true, canPreviewLedger37Ai: false, isLocalHotPreview: false, queryClient,
    window: { location: { search: '' }, sessionStorage: { getItem: () => null } },
    categories: [{ id: 90250, name: 'R1', accountingMode: 'stock_portfolio' }],
    activeStockParticipationCategoryId: 90250, stockAllocationFocus: undefined,
    stockParticipationMatrix: { canEdit: true, members: data.members, lots: [fixtureLot(11), fixtureLot(22), fixtureLot(33, 'closed')] },
    stockParticipationError: null, usdCnyRate: 7, usdtCnyRate: 7,
    expandedStockLots: new Set([11, 22, 33]), editingStockLots: new Set([11, 22]), savingStockLots: new Set(), stockLotMemberEditOrders: {},
    stockParticipationDrafts: { '11:901': { percentage: '30', amount: '300', entryPrice: '10', startDate: '2026-11-12', pauseDate: '' } },
    stockObservationDrafts: { '22:902': { enabled: true, quantity: '2', entryPrice: '10', startDate: '2026-11-12', pauseDate: '' } },
    editState: { 901: { R1: { amount: 'draft amount', ratio: '30', margins: [{ id: 'new-deposit', amount: '123' }], visible: true } } },
    dirtyUsers: new Set([901]), dirtyMemberDraftsRef: { current: new Set([901]) }, ordinaryDirtyRef: { current: {} },
    ledger37AiDisplayOverrides: {}, ledger37AiPreviewDrafts: {}, ledger37AiDisplayOverridesRef: { current: {} }, ledger37AiSavingRef: { current: new Set() }, ledger37AiSavingScopes: new Set(),
    ledger37AiRequestIdRef: { current: 0 }, ledger37AiCachePatchRef: { current: null }, ledger37AiServerReadVersionsRef: { current: {} }, ledger37AiViewScopeRef: { current: '37:1:self' },
    visibilityCachePatchRef: { current: null }, ordinaryClearCachePatchRef: { current: null }, ordinaryDetailCachePatchRef: { current: null },
    ordinaryDetailSaveInFlight: { current: new Set() }, ordinaryDetailSavedEntriesRef: { current: {} }, ordinaryActualSaved: {}, ordinaryClearedConfigsRef: { current: {} }, previewVisibilityRef: { current: {} },
    setMutation: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }, visibilityMutation: { mutateAsync: vi.fn() },
    ledger37AiDisplayMutation: { mutateAsync: vi.fn().mockResolvedValue({ success: true, aiEnabled: true }) },
    setStockParticipationMutation: { mutateAsync: vi.fn() }, setStockObservationMutation: { mutateAsync: vi.fn() },
    freezeWalletMarginMutation: { mutateAsync: vi.fn() }, releaseWalletMarginMutation: { mutateAsync: vi.fn() },
    toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() }, refetch: vi.fn(), refetchStockParticipationMatrix: vi.fn(),
    onStockAllocationSaved: vi.fn(), startStockLotEditing: vi.fn(), toggleStockLotExpanded: vi.fn(), saveStockTagVisibility: vi.fn(),
    getSavedTagVisible: () => true, isStockPortfolioTag: (category: any) => category?.accountingMode === 'stock_portfolio' || category?.accounting_mode === 'stock_portfolio',
    readTagVisible: (balances: any, tagName: string) => balances?.[`${tagName}__visible`] === 1,
    readMarginEntries: (_: any, tagName: string) => [{ id: `server-${tagName}`, amount: '90' }],
    setStockParticipationDraft: vi.fn(), setStockObservationDraft: vi.fn(),
  };
  for (const name of ['Switch', 'Bot', 'Eye', 'EyeOff', 'Minus', 'Plus', 'X', 'ChevronDown', 'Save', 'Users', 'UserAvatar']) scope[name] = name;
  for (const name of ['ledger37AiDisplayOverrides', 'ledger37AiPreviewDrafts', 'ledger37AiSavingScopes', 'stockParticipationDrafts', 'stockObservationDrafts', 'editingStockLots', 'stockLotMemberEditOrders', 'editState', 'dirtyUsers']) {
    scope[`set${name[0].toUpperCase()}${name.slice(1)}`] = vi.fn(updater => { scope[name] = typeof updater === 'function' ? updater(scope[name]) : updater; });
  }
  const allBalancesUtils = {
    setData: vi.fn((_input, update) => { queryClient.setQueryData(queryKey, update); scope.allBalancesData = queryClient.getQueryData(queryKey); }),
    getData: vi.fn(() => queryClient.getQueryData(queryKey)),
    invalidate: vi.fn((_input, options) => queryClient.invalidateQueries({ queryKey, ...options })),
  };
  scope.queryUtils = { ledger: { adminGetAllInitialBalances: allBalancesUtils } };
  scope.allBalancesData = queryClient.getQueryData(queryKey);
  for (const name of ['isLedger37AiReadonlyView', 'ledger37AiDisplayScope', 'updateLedger37AiDisplayOverrides', 'getLedger37AiDisplayEnabled', 'renderLedger37AiBadge', 'getStockLotSavedMemberOrder', 'discardStockLotDrafts', 'finishStockLotEditing']) {
    scope[name] = (...args: any[]) => expression(name, scope)(...args);
  }
  scope.saveLedger37AiDisplay = (...args: any[]) => expression('saveLedger37AiDisplay', scope)(...args);
  const unsubscribe = runEffect('queryClient.getQueryCache().subscribe', scope);
  const refreshPermissions = () => {
    scope.canManageLedger37Ai = expression('canManageLedger37Ai', scope);
    scope.canPreviewLedger37Ai = expression('canPreviewLedger37Ai', scope);
  };
  scope.previewLedger37AiDisplay = vi.fn((...args: any[]) => { refreshPermissions(); return expression('previewLedger37AiDisplay', scope)(...args); });
  const renderToggle = (member: any) => { refreshPermissions(); return expression('renderLedger37AiToggle', scope)(member); };
  const render = () => scope.ledgerId === 37 ? data.members.map(renderToggle) : null;
  const renderLots = () => expression('renderStockParticipationEditor', scope)({ selectedUserId: 0, accentColor: '#2F6F85' });
  const row = (userId = 901) => renderToggle(data.members.find(member => member.userId === userId));
  const ai = (userId = 901) => nodes(row(userId)).find(node => node.type === 'Switch');
  const save = (userId = 901, enabled = true) => { refreshPermissions(); return scope.saveLedger37AiDisplay(userId, enabled); };
  const serverRead = async (balancesMap: any) => {
    await queryClient.fetchQuery({ queryKey, queryFn: async () => ({ ...data, balancesMap }), staleTime: 0 });
    scope.allBalancesData = queryClient.getQueryData(queryKey);
  };
  const noFinancialWrites = () => {
    for (const name of ['setMutation', 'visibilityMutation', 'setStockParticipationMutation', 'setStockObservationMutation', 'freezeWalletMarginMutation', 'releaseWalletMarginMutation']) {
      for (const spy of Object.values(scope[name])) if (typeof spy === 'function') expect(spy).not.toHaveBeenCalled();
    }
    expect(scope.refetch).not.toHaveBeenCalled();
    expect(scope.refetchStockParticipationMatrix).not.toHaveBeenCalled();
    expect(scope.onStockAllocationSaved).not.toHaveBeenCalled();
    expect(scope.setStockParticipationDraft).not.toHaveBeenCalled();
    expect(scope.setStockObservationDraft).not.toHaveBeenCalled();
    expect(scope.setEditState).not.toHaveBeenCalled();
    expect(scope.setDirtyUsers).not.toHaveBeenCalled();
  };
  return { scope, queryClient, render, renderLots, row, ai, save, serverRead, noFinancialWrites, unsubscribe, allBalancesUtils };
}

describe('原R1保存保护迁移为ledger37全局AI：保留18项AST/渲染器离线回归', () => {
  it('AST接线是独立mutation；AI不进入金额、观察、可见性或传统lot保存器', () => {
    expect(declarations.get('ledger37AiDisplayMutation')?.getText(ast)).toBe('trpc.ledger.setLedger37AiDisplay.useMutation()');
    const handler = declarations.get('saveLedger37AiDisplay')!.getText(ast);
    for (const forbidden of ['setMutation.', 'visibilityMutation.', 'setStockObservationMutation.', 'setStockParticipationMutation.', 'updateEntry(', 'setEditState(', 'setDirtyUsers(', 'discardStockLotDrafts(', 'onStockAllocationSaved']) expect(handler).not.toContain(forbidden);
    expect(handler).not.toContain('lotId');
    expect(handler).not.toContain('释放');
    expect(handler).not.toContain('refetch()');
    expect(declarations.get('discardStockLotDrafts')!.getText(ast)).not.toContain('ledger37Ai');
  });
  it('真实成员Toggle每人唯一Switch，lot行保留观察→可见性且无旧AI title', () => {
    const h = harness();
    const controls = nodes(h.renderLots()).filter(node => node.props?.['aria-label']);
    const observation = controls.findIndex(node => node.props['aria-label'] === '成员甲的观察配额');
    const eye = controls.findIndex(node => node.props['aria-label'] === '隐藏成员甲的股票标签');
    expect(observation).toBeLessThan(eye);
    expect(controls.some(node => node.props['aria-label'].includes('AI展示模式'))).toBe(false);
    expect(nodes(h.renderLots()).some(node => node.props?.title?.includes('AI展示模式'))).toBe(false);
    const aiSwitches = nodes(h.render()).filter(node => node.type === 'Switch');
    expect(aiSwitches).toHaveLength(2); expect(new Set(aiSwitches.map(node => node.props['aria-label'])).size).toBe(2);
    const markup = renderToStaticMarkup(React.createElement(ActualSwitch, h.ai().props));
    for (const toggle of aiSwitches) {
      expect(toggle.props.thumbLabel).toBe('AI'); expect(toggle.props.children).toBeUndefined();
      const actual = ActualSwitch(toggle.props);
      const thumb = nodes(actual).find(node => node.props?.['data-slot'] === 'switch-thumb');
      expect(thumb.props.children.props.children).toBe('AI');
      expect(actual.props).not.toHaveProperty('thumbLabel');
    }
    expect(nodes(h.render()).some(node => node.type === 'span' && text(node) === 'AI')).toBe(false);
    expect(nodes(h.render()).some(node => node.type === 'button' || node.type === 'Bot')).toBe(false);
    expect(markup).toContain('role="switch"'); expect(h.ai().props['aria-label']).toBe('成员甲的全局AI视角');
    expect(nodes(h.render()).some(node => node.type === 'section')).toBe(false); h.noFinancialWrites();
    expect(markup).toContain('shrink-0');
    h.unsubscribe();
  });
  it('严格仅ledger37，其他标签/ordinary/无R1matrix仍共用原成员头部全局AI', async () => {
    const h = harness(); expect(h.ai()).toBeTruthy();
    h.scope.ledgerId = 36; expect(h.ai()).toBeUndefined(); expect(await h.save()).toBe(false);
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled();
    h.scope.ledgerId = 37;
    for (const [categoryId, mode] of [[90251, 'stock_portfolio'], [90250, 'ordinary']] as const) {
      h.scope.activeStockParticipationCategoryId = categoryId;
      h.scope.categories = [{ id: categoryId, name: 'R1', accountingMode: mode }];
      expect(h.ai()).toBeTruthy(); expect(await h.save()).toBe(true);
    }
    h.scope.categories = []; h.scope.stockParticipationMatrix = undefined; h.scope.activeStockParticipationCategoryId = null;
    expect(await h.save()).toBe(true); h.noFinancialWrites(); h.unsubscribe();
  });
  it('读取只有数字1为on，missing/字符串1/true均off，不借本人context推断全员', () => {
    const h = harness();
    for (const value of [undefined, 0, '1', true, null]) {
      h.scope.allBalancesData = { ...h.scope.allBalancesData, balancesMap: { 901: { [key]: value } } };
      expect(h.ai().props.checked).toBe(false);
    }
    h.scope.allBalancesData = { ...h.scope.allBalancesData, balancesMap: { 901: { [key]: 1 } } };
    expect(h.ai().props.checked).toBe(true); expect(h.ai(902).props.checked).toBe(false); h.unsubscribe();
  });
  it('同user跨tag/lot共用唯一即时状态和成员busy；同tick双击只发一次，别成员可保存', async () => {
    const h = harness(), a = deferred(), b = deferred();
    h.scope.ledger37AiDisplayMutation.mutateAsync.mockImplementation((payload: any) => payload.targetUserId === 901 ? a.promise : b.promise);
    const first = h.save();
    expect(h.ai().props.checked).toBe(true);
    h.scope.activeStockParticipationCategoryId = 90251; expect(h.ai(901).props.checked).toBe(true);
    h.scope.activeStockParticipationCategoryId = 90250; expect(h.ai(901).props.checked).toBe(true); expect(h.ai(901).props.disabled).toBe(true);
    expect(h.ai(902).props.disabled).toBe(false);
    expect(await h.save(901, false)).toBe(false);
    const other = h.save(902); expect(h.scope.ledger37AiDisplayMutation.mutateAsync).toHaveBeenCalledTimes(2);
    a.resolve(); b.resolve(); await Promise.all([first, other]);
    expect(h.ai(901).props.disabled).toBe(false); h.noFinancialWrites(); h.unsubscribe();
  });
  it('已结束lot、已卖出真实份额和非编辑状态不会禁止仅展示开关', async () => {
    const h = harness(); h.scope.editingStockLots = new Set(); h.scope.savingStockLots = new Set([33]);
    h.scope.stockParticipationMatrix.lots[2].participations = [{ userId: 901, remainingQuantity: 0, closedQuantity: 100 }];
    expect(h.ai(901).props.disabled).toBe(false);
    h.ai(901).props.onCheckedChange(true); await vi.waitFor(() => expect(h.scope.ledger37AiSavingScopes.size).toBe(0));
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).toHaveBeenCalledWith({ ledgerId: 37, targetUserId: 901, enabled: true });
    h.noFinancialWrites(); h.unsubscribe();
  });
  it('成功只补目标AIkey，保留其他成员/JSON/金额/押金草稿，且全员缓存不立即refetch', async () => {
    const h = harness(), before = h.scope.allBalancesData;
    const edit = h.scope.editState, real = h.scope.stockParticipationDrafts, obs = h.scope.stockObservationDrafts;
    expect(await h.save()).toBe(true);
    const saved = h.scope.allBalancesData;
    expect(saved.balancesMap[901]).toEqual({ ...before.balancesMap[901], [key]: 1 });
    expect(saved.balancesMap[902]).toBe(before.balancesMap[902]); expect(saved.otherMeta).toBe(before.otherMeta);
    expect(h.scope.editState).toBe(edit); expect(h.scope.stockParticipationDrafts).toBe(real); expect(h.scope.stockObservationDrafts).toBe(obs);
    expect(h.allBalancesUtils.invalidate).toHaveBeenCalledWith({ ledgerId: 37 }, { refetchType: 'none' });
    runEffect('const initial: Record<number, Record<string, TagEntry>>', h.scope);
    h.noFinancialWrites(); h.unsubscribe();
  });
  it('context/safe AI精确失效全37，新context/overview同步，其他账本及资金query不受影响', async () => {
    const h = harness();
    const safe = [['ledger', 'getMyR1AiParticipationPortfolio'], { input: { ledgerId: 37, categoryId: 90250 }, type: 'query' }];
    const context = [['ledger', 'getR1StockPresentationContext'], { input: { ledgerId: 37, categoryId: 90250 }, type: 'query' }];
    const other = [['ledger', 'getR1StockPresentationContext'], { input: { ledgerId: 37, categoryId: 90251 }, type: 'query' }];
    const otherLedger = [['ledger', 'getLedger37PresentationContext'], { input: { ledgerId: 38 }, type: 'query' }];
    const global = [['ledger', 'getLedger37PresentationContext'], { input: { ledgerId: 37 }, type: 'query' }];
    const overview = [['ledger', 'getMyLedger37AiOverview'], { input: { ledgerId: 37 }, type: 'query' }];
    const funds = [['ledger', 'getStockLotParticipationMatrix'], { input: { ledgerId: 37, categoryId: 90250 }, type: 'query' }];
    for (const k of [safe, context, other, funds, otherLedger, global, overview]) h.queryClient.setQueryData(k, {});
    await h.save();
    expect(h.queryClient.getQueryState(safe)?.isInvalidated).toBe(true); expect(h.queryClient.getQueryState(context)?.isInvalidated).toBe(true);
    expect(h.queryClient.getQueryState(other)?.isInvalidated).toBe(true);
    expect(h.queryClient.getQueryState(otherLedger)?.isInvalidated).toBe(false);
    expect(h.queryClient.getQueryState(global)?.isInvalidated).toBe(true); expect(h.queryClient.getQueryState(overview)?.isInvalidated).toBe(true); expect(h.queryClient.getQueryState(funds)?.isInvalidated).toBe(false);
    h.unsubscribe();
  });
  it('权限/只读预览/无成员拒绝，不发送mutation', async () => {
    const h = harness();
    h.scope.canAccess = false; expect(h.ai().props.disabled).toBe(true); expect(await h.save()).toBe(false);
    h.scope.canAccess = true; h.scope.window.location.search = '?viewAs=901'; expect(await h.save()).toBe(false);
    h.scope.window.location.search = ''; h.scope.stockParticipationMatrix.canEdit = false; expect(h.ai().props.disabled).toBe(false);
    h.scope.stockParticipationMatrix.canEdit = true; h.scope.isLocalHotPreview = true; expect(h.ai().props.disabled).toBe(false); expect(await h.save()).toBe(false);
    expect(h.scope.canManageLedger37Ai).toBe(false); expect(h.scope.canPreviewLedger37Ai).toBe(true);
    h.scope.isLocalHotPreview = false; expect(await h.save(999)).toBe(false);
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('失败只回退该成员AI，另一个成员成功状态与所有真实草稿不被覆盖', async () => {
    const h = harness(), failure = deferred();
    h.scope.ledger37AiDisplayMutation.mutateAsync.mockImplementation((payload: any) => payload.targetUserId === 901 ? failure.promise : Promise.resolve({}));
    const pending = h.save(); await h.save(902); failure.reject(new Error('没有权限')); expect(await pending).toBe(false);
    expect(h.ai().props.checked).toBe(false); expect(h.ai(902).props.checked).toBe(true);
    expect(h.scope.toast.error).toHaveBeenCalledWith('没有权限'); expect(h.scope.ledger37AiSavingScopes.size).toBe(0);
    h.noFinancialWrites(); h.unsubscribe();
  });
  it('切换ledger/操作者后旧成功不能写新scope、覆盖别用户或清dirty', async () => {
    const h = harness(), pending = deferred(); h.scope.ledger37AiDisplayMutation.mutateAsync.mockReturnValue(pending.promise);
    const saving = h.save(); h.scope.ledgerId = 38; h.scope.ledger37AiViewScopeRef.current = '38:2:self';
    h.scope.ledger37AiDisplayOverridesRef.current['38:902'] = { enabled: true, viewScope: '38:2:self', requestId: 99, status: 'saved', afterReadVersion: 0 };
    pending.resolve(); expect(await saving).toBe(false);
    expect(h.allBalancesUtils.setData).not.toHaveBeenCalled(); expect(h.scope.ledger37AiDisplayOverrides['38:902'].enabled).toBe(true);
    expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); expect(h.scope.toast.success).not.toHaveBeenCalled();
    h.noFinancialWrites(); h.unsubscribe();
  });
  it('切换标签期间的旧成功仍仅patch原成员globalkey，不产生逐tag状态且不清dirty', async () => {
    const h = harness(), pending = deferred(); h.scope.ledger37AiDisplayMutation.mutateAsync.mockReturnValue(pending.promise);
    const saving = h.save(); h.scope.activeStockParticipationCategoryId = 90251;
    pending.resolve(); await saving;
    expect(h.scope.allBalancesData.balancesMap[901][key]).toBe(1);
    expect(h.scope.allBalancesData.balancesMap[901]['__stockAiDisplay_category_90251']).toBeUndefined();
    expect(h.ai().props.checked).toBe(true); h.noFinancialWrites(); h.unsubscribe();
  });
  it('单lot取消只清该lot草稿，保存的AI跨lot继续on', async () => {
    const h = harness(); await h.save(); h.scope.finishStockLotEditing(11, true);
    expect(h.scope.stockParticipationDrafts['11:901']).toBeUndefined(); expect(h.scope.stockObservationDrafts['22:902']).toBeTruthy();
    expect(h.ai(901).props.checked).toBe(true); expect(h.ai(901).props.checked).toBe(true); h.unsubscribe();
  });
  it('本地manual补丁不当服务器确认；下次真实读取对比后撤掉覆盖层，接受别管理员变更', async () => {
    const h = harness(); await h.save();
    expect(h.scope.ledger37AiDisplayOverrides['37:901'].status).toBe('saved');
    await h.serverRead({ 901: { [key]: 1 }, 902: { [key]: 0 } });
    expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); expect(h.ai().props.checked).toBe(true);
    await h.serverRead({ 901: { [key]: 0 }, 902: { [key]: 1 } });
    expect(h.ai().props.checked).toBe(false); expect(h.ai(902).props.checked).toBe(true); h.unsubscribe();
  });
  it('后续第一份权威读取与成功值不同也撤层，不无限覆盖另一管理员', async () => {
    const h = harness(); await h.save(); await h.serverRead({ 901: { [key]: 0 } });
    expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); expect(h.ai().props.checked).toBe(false); h.unsubscribe();
  });
  it('保存前已开始的旧读取/失败读取不撤成功层；下一成功读取才撤层', async () => {
    const h = harness(), oldRead = deferred();
    const fetching = h.queryClient.fetchQuery({ queryKey, queryFn: () => oldRead.promise, staleTime: 0 });
    await h.save(); oldRead.resolve({ members: h.scope.allBalancesData.members, balancesMap: { 901: {} } }); await fetching;
    h.scope.allBalancesData = h.queryClient.getQueryData(queryKey);
    expect(h.ai().props.checked).toBe(true); expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeTruthy();
    await expect(h.queryClient.fetchQuery({ queryKey, queryFn: async () => { throw new Error('offline'); } })).rejects.toThrow('offline');
    expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeTruthy();
    await h.serverRead({ 901: { [key]: 1 } }); expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); h.unsubscribe();
  });
  it('已有成功覆盖层遭遇旧读取后，再次切换失败恢复先前已保存AI而非陈旧server值', async () => {
    const h = harness(), oldRead = deferred();
    const fetching = h.queryClient.fetchQuery({ queryKey, queryFn: () => oldRead.promise, staleTime: 0 });
    await h.save(); oldRead.resolve({ members: h.scope.allBalancesData.members, balancesMap: { 901: {} } }); await fetching;
    h.scope.allBalancesData = h.queryClient.getQueryData(queryKey);
    h.scope.ledger37AiDisplayMutation.mutateAsync.mockRejectedValueOnce(new Error('拒绝修改'));
    expect(await h.save(901, false)).toBe(false);
    expect(h.ai().props.checked).toBe(true);
    expect(h.scope.ledger37AiDisplayOverrides['37:901'].status).toBe('saved');
    await h.serverRead({ 901: { [key]: 1 } });
    expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('必要真实refetch不覆盖股票金额/押金dirty草稿或观察/真实lot草稿', async () => {
    const h = harness(), edit = h.scope.editState[901].R1, real = h.scope.stockParticipationDrafts, obs = h.scope.stockObservationDrafts;
    await h.save(); await h.serverRead({ 901: { R1: 100, R1__ratio: 20, [key]: 1 }, 902: {} });
    runEffect('const initial: Record<number, Record<string, TagEntry>>', h.scope);
    expect(h.scope.editState[901].R1).toBe(edit); expect(h.scope.dirtyUsers.has(901)).toBe(true);
    expect(h.scope.stockParticipationDrafts).toBe(real); expect(h.scope.stockObservationDrafts).toBe(obs);
    expect(h.scope.setMutation.mutate).not.toHaveBeenCalled(); h.unsubscribe();
  });
});
