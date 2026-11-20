import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Switch as ActualSwitch } from '../client/src/components/ui/switch';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';
import * as instruments from '../shared/portfolio-instruments';

// Execute actual frontend AST and React elements with inert spies. Never import routers/DB or perform HTTP.
const source = readFileSync(new URL('../client/src/pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.Expression>();
const effects: ts.CallExpression[] = [];
const calls: ts.CallExpression[] = [];
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer) declarations.set(node.name.getText(ast), node.initializer);
  if (ts.isCallExpression(node)) {
    calls.push(node);
    if (node.expression.getText(ast) === 'useEffect') effects.push(node);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
function code(value: string, scope: Record<string, any>): any {
  const js = ts.transpileModule(`const execute = ${value};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function('React', ...Object.keys(scope), `${js}; return execute;`)(React, ...Object.values(scope));
}
function expression(name: string, scope: Record<string, any>): any {
  const value = declarations.get(name);
  if (!value) throw new Error(`Missing actual frontend expression: ${name}`);
  return code(value.getText(ast), scope);
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
  const data = { members: [{ userId: 901, name: '成员甲' }, { userId: 902, name: '成员乙' }, { userId: 903, name: '无分配成员' }],
    balancesMap: { 901: { R1: 100, R1__ratio: 20, R1__margins: '[{"id":"deposit","coin":"CNY","amount":"90"}]', otherJson: { keep: 1 } }, 902: { other: 77 }, 903: {} }, otherMeta: { keep: true } };
  queryClient.setQueryData(queryKey, data);
  const storage = new Map<string, string>();
  const scope: Record<string, any> = {
    ...instruments, LEDGER37_AI_DISPLAY_KEY, Fragment: React.Fragment,
    ledgerId: 37, user: { id: 1, role: 'parent' }, ledgerData: { userRole: 'owner' }, canAccess: true, canManageLedger37Ai: true, canPreviewLedger37Ai: false, isLocalHotPreview: false, queryClient,
    window: { location: { search: '' }, sessionStorage: { getItem: (name: string) => storage.get(name) ?? null, setItem: vi.fn(), removeItem: vi.fn() } },
    categories: [{ id: 90250, name: 'R1', accountingMode: 'stock_portfolio' }, { id: 90251, name: 'R2', accountingMode: 'stock_portfolio' }],
    activeStockParticipationCategoryId: 90250, stockAllocationFocus: undefined,
    stockParticipationMatrix: { canEdit: true, members: data.members, lots: [fixtureLot(11), fixtureLot(22), fixtureLot(33, 'closed')] },
    stockParticipationError: null, usdCnyRate: 7, usdtCnyRate: 7,
    expandedStockLots: new Set([11, 22, 33]), editingStockLots: new Set([11, 22]), savingStockLots: new Set(), stockLotMemberEditOrders: {},
    stockParticipationDrafts: { '11:901': { percentage: '30', amount: '300', entryPrice: '10', startDate: '2026-11-12', pauseDate: '' } },
    stockObservationDrafts: { '22:902': { enabled: true, quantity: '2', entryPrice: '10', startDate: '2026-11-12', pauseDate: '' } },
    editState: { 901: { R1: { amount: 'draft amount', ratio: '30', margins: [{ id: 'new-deposit', amount: '123' }], visible: true }, R2: { amount: 'other stock draft', ratio: '40', margins: [], visible: true } } },
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
  for (const name of ['isLedger37AiReadonlyView', 'ledger37AiDisplayScope', 'updateLedger37AiDisplayOverrides', 'getLedger37AiDisplayEnabled', 'renderLedger37AiBadge', 'stripLedger37AiDisplayKeys', 'getStockLotSavedMemberOrder', 'discardStockLotDrafts', 'finishStockLotEditing']) {
    scope[name] = (...args: any[]) => expression(name, scope)(...args);
  }
  const refreshPermissions = () => {
    scope.canAccess = expression('canAccess', scope);
    scope.canManageLedger37Ai = expression('canManageLedger37Ai', scope);
    scope.canPreviewLedger37Ai = expression('canPreviewLedger37Ai', scope);
  };
  const save = (userId = 901, enabled = true) => { refreshPermissions(); return expression('saveLedger37AiDisplay', scope)(userId, enabled); };
  scope.saveLedger37AiDisplay = vi.fn(save);
  const preview = (userId = 901, enabled = true) => { refreshPermissions(); return expression('previewLedger37AiDisplay', scope)(userId, enabled); };
  scope.previewLedger37AiDisplay = vi.fn(preview);
  const unsubscribe = runEffect('queryClient.getQueryCache().subscribe', scope);
  const renderToggle = (member: any) => { refreshPermissions(); return expression('renderLedger37AiToggle', scope)(member); };
  const render = () => scope.ledgerId === 37 ? data.members.map(renderToggle) : null;
  const renderLots = () => expression('renderStockParticipationEditor', scope)({ selectedUserId: 0, accentColor: '#2F6F85' });
  const ai = (userId = 901) => nodes(renderToggle(data.members.find(member => member.userId === userId))).find(node => node.type === 'Switch');
  const serverRead = async (balancesMap: any) => {
    await queryClient.fetchQuery({ queryKey, queryFn: async () => ({ ...data, balancesMap }), staleTime: 0 });
    scope.allBalancesData = queryClient.getQueryData(queryKey);
  };
  const noFinancialWrites = () => {
    for (const name of ['setMutation', 'visibilityMutation', 'setStockParticipationMutation', 'setStockObservationMutation', 'freezeWalletMarginMutation', 'releaseWalletMarginMutation']) {
      for (const spy of Object.values(scope[name])) if (typeof spy === 'function') expect(spy).not.toHaveBeenCalled();
    }
    for (const name of ['refetch', 'refetchStockParticipationMatrix', 'onStockAllocationSaved', 'setStockParticipationDraft', 'setStockObservationDraft', 'setEditState', 'setDirtyUsers']) expect(scope[name]).not.toHaveBeenCalled();
  };
  return { scope, queryClient, storage, render, renderLots, ai, save, preview, serverRead, noFinancialWrites, unsubscribe, allBalancesUtils };
}

describe('ledger37每用户唯一全局AI：实际前端AST/React renderer/spy离线回归', () => {
  it('新独立mutation、scope不含category/lot，保存器不触碰财务/观察/草稿', () => {
    expect(declarations.get('ledger37AiDisplayMutation')!.getText(ast)).toBe('trpc.ledger.setLedger37AiDisplay.useMutation()');
    const handler = declarations.get('saveLedger37AiDisplay')!.getText(ast);
    for (const forbidden of ['categoryId', 'lotId', 'stockParticipationMatrix', 'setMutation.', 'visibilityMutation.', 'setStockObservationMutation.', 'setStockParticipationMutation.', 'updateEntry(', 'setEditState(', 'setDirtyUsers(', 'discardStockLotDrafts(', 'onStockAllocationSaved', 'refetch()']) expect(handler).not.toContain(forbidden);
    const h = harness(); expect(h.scope.ledger37AiDisplayScope(37, 901)).toBe('37:901'); h.unsubscribe();
  });
  it('真实AST只在原用户视角成员折叠头部调用唯一Toggle，没有独立section或lot入口', () => {
    const toggles = calls.filter(call => call.expression.getText(ast) === 'renderLedger37AiToggle');
    expect(toggles).toHaveLength(1);
    expect(toggles[0].arguments[0].getText(ast)).toBe('member');
    let ancestor: ts.Node | undefined = toggles[0];
    const ancestors: ts.Node[] = [];
    while (ancestor) { ancestors.push(ancestor); ancestor = ancestor.parent; }
    expect(ancestors.some(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'members.map')).toBe(true);
    expect(ancestors.some(node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(ast) === 'onClick' && prop.initializer?.getText(ast) === '{toggleUserExpand}'))).toBe(true);
    const userMode = ancestors.find(node => ts.isConditionalExpression(node) && node.condition.getText(ast) === 'viewMode === "tag"') as ts.ConditionalExpression;
    expect(userMode).toBeTruthy(); expect(userMode.whenFalse.getText(ast)).toContain('renderLedger37AiToggle(member)');
    expect(userMode.whenTrue.getText(ast)).not.toContain('renderLedger37AiToggle');
    expect(declarations.has('renderLedger37AiSettings')).toBe(false);
    expect(source).not.toContain('ledger37AiSettingsExpanded');
    const h = harness();
    const switches = nodes(h.render()).filter(node => node.type === 'Switch');
    expect(switches).toHaveLength(3); expect(new Set(switches.map(node => node.props['aria-label'])).size).toBe(3);
    const markup = renderToStaticMarkup(React.createElement(ActualSwitch, h.ai().props));
    for (const toggle of switches) {
      expect(toggle.props.thumbLabel).toBe('AI'); expect(toggle.props.children).toBeUndefined();
      const actual = ActualSwitch(toggle.props);
      const thumb = nodes(actual).find(node => node.props?.['data-slot'] === 'switch-thumb');
      expect(thumb.props.children.props.children).toBe('AI');
      expect(actual.props).not.toHaveProperty('thumbLabel');
    }
    expect(nodes(h.render()).some(node => node.type === 'span' && text(node) === 'AI')).toBe(false);
    expect(nodes(h.render()).some(node => node.type === 'button' || node.type === 'Bot')).toBe(false);
    expect(markup).toContain('role="switch"'); expect(h.ai().props['aria-label']).toBe('成员甲的全局AI视角');
    expect(markup).toContain('shrink-0');
    expect(nodes(h.render()).some(node => node.type === 'section')).toBe(false); h.unsubscribe();
  });
  it('Toggle不依赖独立展开状态；所有成员可见，数据未读取时禁用且不保存', async () => {
    const h = harness();
    expect(h.ai(903)).toBeTruthy(); expect(h.ai(903).props.checked).toBe(false);
    h.scope.allBalancesData = undefined;
    expect(h.ai(903).props.disabled).toBe(true); expect(await h.save(903)).toBe(false);
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('两个不同tag与全部active/closed lot行都没有AI按钮或旧title，不保有各自AI状态', async () => {
    const h = harness();
    for (const categoryId of [90250, 90251]) {
      h.scope.activeStockParticipationCategoryId = categoryId;
      expect(nodes(h.renderLots()).filter(node => node.type === 'button' && text(node) === 'AI')).toHaveLength(0);
      expect(nodes(h.renderLots()).some(node => node.props?.title?.includes('AI展示模式'))).toBe(false);
    }
    await h.save(); h.scope.activeStockParticipationCategoryId = 90250; expect(h.ai().props.checked).toBe(true);
    h.scope.activeStockParticipationCategoryId = 90251; expect(h.ai().props.checked).toBe(true);
    expect(Object.keys(h.scope.ledger37AiDisplayOverrides)).toEqual(['37:901']); h.noFinancialWrites(); h.unsubscribe();
  });
  it('仅number1为on；missing/string1/true为off，全部legacy逐标签flag均不生效', () => {
    const h = harness();
    for (const value of [undefined, 0, '1', true, null]) {
      h.scope.allBalancesData = { ...h.scope.allBalancesData, balancesMap: { 901: { [key]: value, __stockAiDisplay_category_90250: 1, __stockAiDisplay_category_90251: 1 } } };
      expect(h.ai().props.checked).toBe(false);
    }
    h.scope.allBalancesData.balancesMap[901][key] = 1;
    expect(h.ai().props.checked).toBe(true); expect(h.ai(902).props.checked).toBe(false); h.unsubscribe();
  });
  it('无R1/无matrix/无activeStockCategory/无lot/无标签也能控制未分配成员，载荷仅ledger+user+bool', async () => {
    const h = harness(); h.scope.categories = []; h.scope.stockParticipationMatrix = undefined; h.scope.activeStockParticipationCategoryId = null;
    expect(h.ai(903).props.disabled).toBe(false);
    h.ai(903).props.onCheckedChange(true); await vi.waitFor(() => expect(h.scope.ledger37AiSavingScopes.size).toBe(0));
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).toHaveBeenCalledWith({ ledgerId: 37, targetUserId: 903, enabled: true });
    expect(Object.keys(h.scope.allBalancesData.balancesMap[903])).toEqual([key]); h.noFinancialWrites(); h.unsubscribe();
  });
  it('matrix.canEdit不是全局管理必要guard；非37无入口/拒绝保存', async () => {
    const h = harness(); h.scope.stockParticipationMatrix.canEdit = false;
    expect(h.ai().props.disabled).toBe(false); expect(await h.save()).toBe(true);
    h.scope.ledgerId = 38; expect(h.render()).toBeNull(); expect(await h.save()).toBe(false);
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).toHaveBeenCalledTimes(1); h.unsubscribe();
  });
  it('仅实际owner/admin或系统admin/super_admin可写，普通成员不能利用matrix权限', async () => {
    const h = harness();
    for (const role of ['member', 'viewer', 'funder']) {
      h.scope.ledgerData.userRole = role; expect(h.ai().props.disabled).toBe(true); expect(await h.save()).toBe(false);
    }
    for (const [ledgerRole, systemRole] of [['owner', 'parent'], ['admin', 'parent'], ['member', 'admin'], ['viewer', 'super_admin']]) {
      h.scope.ledgerData.userRole = ledgerRole; h.scope.user.role = systemRole;
      expect(h.ai().props.disabled).toBe(false); expect(await h.save(901, false)).toBe(true);
    }
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).toHaveBeenCalledTimes(4); h.unsubscribe();
  });
  it('代看URL/sessionStorage/只读热链拒绝保存，即使代看角色为owner或systemadmin', async () => {
    const h = harness(); h.scope.user.role = 'super_admin';
    for (const search of ['?viewAs=901', '?viewAs=1', '?readonly=1', '?readonly=true']) {
      h.scope.window.location.search = search; expect(h.ai().props.disabled).toBe(true); expect(await h.save()).toBe(false);
    }
    h.scope.window.location.search = ''; h.storage.set('view-as-user-id', '901');
    expect(h.ai().props.disabled).toBe(true); expect(await h.save()).toBe(false);
    h.storage.clear(); h.scope.isLocalHotPreview = true; expect(h.ai().props.disabled).toBe(false); expect(await h.save()).toBe(false);
    expect(h.scope.canManageLedger37Ai).toBe(false); expect(h.scope.canPreviewLedger37Ai).toBe(true);
    h.scope.isLocalHotPreview = false; expect(await h.save(999)).toBe(false);
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('预览器只有独立本地draft setter与明确toast，不调用正式保存/缓存/存储/其他setter', () => {
    const handler = declarations.get('previewLedger37AiDisplay')!;
    const setters: string[] = [];
    const inspect = (node: ts.Node) => {
      if (ts.isCallExpression(node) && /^set[A-Z]/.test(node.expression.getText(ast))) setters.push(node.expression.getText(ast));
      ts.forEachChild(node, inspect);
    };
    inspect(handler); expect(setters).toEqual(['setLedger37AiPreviewDrafts']);
    for (const forbidden of ['saveLedger37AiDisplay', 'Mutation', 'queryClient', 'queryUtils', 'invalidate', 'sessionStorage', 'SQL', 'setLedger37AiDisplayOverrides', 'updateLedger37AiDisplayOverrides']) expect(handler.getText(ast)).not.toContain(forbidden);
    const useState = vi.fn(value => [value, vi.fn()]);
    const initial = expression('[ledger37AiPreviewDrafts, setLedger37AiPreviewDrafts]', { useState });
    expect(initial[0]).toEqual({}); expect(useState).toHaveBeenCalledWith({});
  });
  it('热预览实际Switch false→true→false，Badge跟随且未保存明确；缓存/金额/观察不变，正式save与所有mutation为0', async () => {
    const h = harness(); h.scope.isLocalHotPreview = true;
    const before = h.queryClient.getQueryData(queryKey), snapshot = JSON.stringify(before);
    const edit = h.scope.editState, real = h.scope.stockParticipationDrafts, obs = h.scope.stockObservationDrafts, dirty = h.scope.dirtyUsers;
    const invalidate = vi.spyOn(h.queryClient, 'invalidateQueries');
    const setQueryData = vi.spyOn(h.queryClient, 'setQueryData');
    expect(h.ai().props.disabled).toBe(false); expect(h.ai().props.checked).toBe(false);
    expect(h.scope.renderLedger37AiBadge(901)).toBeNull();
    expect(nodes(h.render()).some(node => node.props?.['data-ledger37-ai-preview'] === 901)).toBe(false);
    for (const enabled of [true, false]) {
      expect(h.ai().props.onCheckedChange(enabled)).toBe(true);
      expect(h.ai().props.checked).toBe(enabled);
      expect(renderToStaticMarkup(React.createElement(ActualSwitch, h.ai().props))).toContain(`aria-checked="${enabled}"`);
      expect(h.ai().props.thumbLabel).toBe('AI');
      const thumb = nodes(ActualSwitch(h.ai().props)).find(node => node.props?.['data-slot'] === 'switch-thumb');
      expect(thumb.props.children.props.children).toBe('AI');
      expect(Boolean(h.scope.renderLedger37AiBadge(901))).toBe(enabled); expect(h.ai(902).props.checked).toBe(false);
      const unsaved = nodes(h.render()).find(node => node.props?.['data-ledger37-ai-preview'] === 901);
      expect(unsaved).toBeTruthy(); expect(text(unsaved)).toBe('未保存');
      expect(h.queryClient.getQueryData(queryKey)).toBe(before); expect(JSON.stringify(before)).toBe(snapshot);
      expect(h.scope.ledger37AiDisplayOverrides).toEqual({}); expect(h.scope.ledger37AiDisplayOverridesRef.current).toEqual({});
      expect(h.scope.editState).toBe(edit); expect(h.scope.stockParticipationDrafts).toBe(real); expect(h.scope.stockObservationDrafts).toBe(obs); expect(h.scope.dirtyUsers).toBe(dirty);
    }
    expect(h.scope.setLedger37AiPreviewDrafts).toHaveBeenCalledTimes(2);
    expect(h.scope.toast.info).toHaveBeenCalledTimes(2); expect(h.scope.toast.info).toHaveBeenLastCalledWith('仅预览，AI设置未保存');
    expect(h.scope.saveLedger37AiDisplay).not.toHaveBeenCalled(); expect(await h.save()).toBe(false);
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled();
    expect(setQueryData).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled();
    for (const name of ['setData', 'getData', 'invalidate']) expect(h.allBalancesUtils[name as keyof typeof h.allBalancesUtils]).not.toHaveBeenCalled();
    for (const name of ['setLedger37AiDisplayOverrides', 'setLedger37AiSavingScopes', 'setEditingStockLots', 'setStockLotMemberEditOrders']) expect(h.scope[name]).not.toHaveBeenCalled();
    expect(h.scope.window.sessionStorage.setItem).not.toHaveBeenCalled(); expect(h.scope.window.sessionStorage.removeItem).not.toHaveBeenCalled();
    h.noFinancialWrites(); h.unsubscribe();
  });
  it('热预览draft优先正式override且自动权威刷新不抹掉；false草稿同样覆盖真实true', async () => {
    const h = harness(); h.scope.isLocalHotPreview = true;
    h.scope.ledger37AiDisplayOverrides = { '37:901': { enabled: false, viewScope: '37:1:self' } };
    expect(h.preview()).toBe(true); expect(h.ai().props.checked).toBe(true);
    const draft = h.scope.ledger37AiPreviewDrafts;
    await h.serverRead({ 901: { [key]: 0 }, 902: {}, 903: {} });
    expect(h.scope.ledger37AiPreviewDrafts).toBe(draft); expect(h.ai().props.checked).toBe(true);
    expect(h.preview(901, false)).toBe(true);
    await h.serverRead({ 901: { [key]: 1 }, 902: {}, 903: {} });
    expect(h.ai().props.checked).toBe(false); expect(h.scope.renderLedger37AiBadge(901)).toBeNull();
    expect(h.scope.allBalancesData.balancesMap[901][key]).toBe(1);
    expect(nodes(h.render()).some(node => node.props?.['data-ledger37-ai-preview'] === 901 && text(node) === '未保存')).toBe(true);
    expect(h.scope.setLedger37AiPreviewDrafts).toHaveBeenCalledTimes(2);
    expect(h.scope.saveLedger37AiDisplay).not.toHaveBeenCalled(); expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled();
    expect(h.allBalancesUtils.setData).not.toHaveBeenCalled(); expect(h.allBalancesUtils.invalidate).not.toHaveBeenCalled(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('切换actor/ledger/readonly/代看或退出热预览不泄露draft；只读与未授权仍禁用', () => {
    const h = harness(); h.scope.isLocalHotPreview = true; expect(h.preview()).toBe(true);
    const hidden = () => {
      expect(h.ai().props.checked).toBe(false); expect(h.scope.renderLedger37AiBadge(901)).toBeNull();
      expect(nodes(h.render()).some(node => node.props?.['data-ledger37-ai-preview'] === 901)).toBe(false);
    };
    h.scope.user.id = 2; h.scope.ledger37AiViewScopeRef.current = '37:2:self'; hidden();
    h.scope.ledgerId = 38; h.scope.ledger37AiViewScopeRef.current = '38:2:self'; expect(h.render()).toBeNull(); expect(h.preview()).toBe(false);
    h.scope.ledgerId = 37; h.scope.user.id = 1; h.scope.ledger37AiViewScopeRef.current = '37:1:self';
    for (const search of ['?viewAs=901', '?readonly=1', '?readonly=true']) {
      h.scope.window.location.search = search; hidden(); expect(h.ai().props.disabled).toBe(true); expect(h.preview()).toBe(false);
    }
    h.scope.window.location.search = ''; h.storage.set('view-as-user-id', '901'); hidden(); expect(h.ai().props.disabled).toBe(true); expect(h.preview()).toBe(false);
    h.storage.clear(); h.scope.isLocalHotPreview = false; hidden(); expect(h.preview()).toBe(false);
    h.scope.isLocalHotPreview = true; h.scope.canAccess = false; h.scope.ledgerData.userRole = 'member'; hidden(); expect(h.ai().props.disabled).toBe(true); expect(h.preview()).toBe(false);
    h.scope.ledgerData.userRole = 'owner'; h.scope.user = undefined; hidden(); expect(h.ai().props.disabled).toBe(true); expect(h.preview()).toBe(false);
    expect(h.scope.setLedger37AiPreviewDrafts).toHaveBeenCalledTimes(1); expect(h.scope.saveLedger37AiDisplay).not.toHaveBeenCalled();
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('预览非法成员/错误book/无数据/非boolean失败false，busy仅同member互斥', () => {
    const h = harness(); h.scope.isLocalHotPreview = true;
    for (const userId of [999, 0, -1, NaN, Infinity, 901.5, '901']) expect(h.preview(userId as any)).toBe(false);
    for (const enabled of [undefined, null, 1, 'true']) expect(expression('previewLedger37AiDisplay', h.scope)(901, enabled)).toBe(false);
    h.scope.ledgerId = 38; expect(h.preview()).toBe(false); h.scope.ledgerId = 37;
    const data = h.scope.allBalancesData; h.scope.allBalancesData = undefined; expect(h.ai().props.disabled).toBe(true); expect(h.preview()).toBe(false); h.scope.allBalancesData = data;
    h.scope.ledger37AiViewScopeRef.current = '37:2:self'; expect(h.preview()).toBe(false); h.scope.ledger37AiViewScopeRef.current = '37:1:self';
    h.scope.ledger37AiSavingScopes.add('38:901'); expect(h.ai().props.disabled).toBe(false);
    h.scope.ledger37AiSavingScopes.add('37:901'); expect(h.ai().props.disabled).toBe(true); expect(h.ai().props['aria-busy']).toBe(true); expect(h.preview()).toBe(false);
    expect(h.ai(902).props.disabled).toBe(false); expect(h.preview(902)).toBe(true);
    expect(h.scope.ledger37AiPreviewDrafts['37:901']).toBeUndefined(); expect(h.scope.ledger37AiPreviewDrafts['37:902'].enabled).toBe(true);
    expect(h.scope.setLedger37AiPreviewDrafts).toHaveBeenCalledTimes(1); expect(h.scope.saveLedger37AiDisplay).not.toHaveBeenCalled();
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('旧render捕获的preview callback切actor/ledger后不能写新scope；新callback只写新actor', () => {
    const h = harness(); h.scope.isLocalHotPreview = true; h.ai();
    const oldPreview = expression('previewLedger37AiDisplay', h.scope);
    h.scope.user = { id: 2, role: 'parent' }; h.scope.ledger37AiViewScopeRef.current = '37:2:self';
    expect(oldPreview(901, true)).toBe(false); expect(h.scope.setLedger37AiPreviewDrafts).not.toHaveBeenCalled();
    expect(h.preview()).toBe(true); expect(h.scope.ledger37AiPreviewDrafts['37:901'].viewScope).toBe('37:2:self');
    h.scope.ledgerId = 38; h.scope.ledger37AiViewScopeRef.current = '38:2:self';
    expect(oldPreview(901, false)).toBe(false); expect(h.scope.setLedger37AiPreviewDrafts).toHaveBeenCalledTimes(1);
    expect(h.scope.saveLedger37AiDisplay).not.toHaveBeenCalled(); expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('退出hotpreview后隐藏未保存draft，实际Switch仍走原正式保存器而不是preview', async () => {
    const h = harness(); h.scope.isLocalHotPreview = true; expect(h.preview()).toBe(true);
    const draft = h.scope.ledger37AiPreviewDrafts;
    h.scope.isLocalHotPreview = false;
    expect(h.ai().props.checked).toBe(false); expect(h.ai().props.disabled).toBe(false);
    expect(nodes(h.render()).some(node => node.props?.['data-ledger37-ai-preview'] === 901)).toBe(false);
    h.ai().props.onCheckedChange(true);
    await vi.waitFor(() => expect(h.scope.ledger37AiSavingScopes.size).toBe(0));
    expect(h.scope.saveLedger37AiDisplay).toHaveBeenCalledTimes(1); expect(h.scope.saveLedger37AiDisplay).toHaveBeenCalledWith(901, true);
    expect(h.scope.previewLedger37AiDisplay).not.toHaveBeenCalled();
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).toHaveBeenCalledWith({ ledgerId: 37, targetUserId: 901, enabled: true });
    expect(h.scope.allBalancesData.balancesMap[901][key]).toBe(1); expect(h.ai().props.checked).toBe(true);
    expect(h.scope.ledger37AiPreviewDrafts).toBe(draft); expect(h.scope.setLedger37AiPreviewDrafts).toHaveBeenCalledTimes(1);
    h.noFinancialWrites(); h.unsubscribe();
  });
  it('同tick双击只发一次、目标成员busy，其他成员可独立并发且标签切换不分裂状态', async () => {
    const h = harness(), a = deferred(), b = deferred();
    h.scope.ledger37AiDisplayMutation.mutateAsync.mockImplementation((payload: any) => payload.targetUserId === 901 ? a.promise : b.promise);
    const first = h.save(); expect(h.ai().props.checked).toBe(true); expect(h.ai().props['aria-busy']).toBe(true); expect(h.ai().props.disabled).toBe(true);
    h.scope.activeStockParticipationCategoryId = 90251; expect(h.ai().props['aria-busy']).toBe(true); expect(await h.save(901, false)).toBe(false);
    expect(h.ai(902).props.disabled).toBe(false); const other = h.save(902);
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).toHaveBeenCalledTimes(2);
    a.resolve(); b.resolve(); await Promise.all([first, other]); expect(h.ai().props['aria-busy']).toBe(false); h.noFinancialWrites(); h.unsubscribe();
  });
  it('成功只patch目标globalkey，其他成员/metadata/旧flag/JSON/金额/押金/观察草稿不动', async () => {
    const h = harness(), before = h.scope.allBalancesData, edit = h.scope.editState, real = h.scope.stockParticipationDrafts, obs = h.scope.stockObservationDrafts;
    expect(await h.save()).toBe(true);
    expect(h.scope.allBalancesData.balancesMap[901]).toEqual({ ...before.balancesMap[901], [key]: 1 });
    expect(h.scope.allBalancesData.balancesMap[902]).toBe(before.balancesMap[902]); expect(h.scope.allBalancesData.otherMeta).toBe(before.otherMeta);
    expect(h.scope.editState).toBe(edit); expect(h.scope.stockParticipationDrafts).toBe(real); expect(h.scope.stockObservationDrafts).toBe(obs);
    expect(h.allBalancesUtils.invalidate).toHaveBeenCalledWith({ ledgerId: 37 }, { refetchType: 'none' });
    runEffect('const initial: Record<number, Record<string, TagEntry>>', h.scope);
    h.noFinancialWrites(); h.unsubscribe();
  });
  it('新context/overview和旧context/safeportfolio全37精确失效，其他ledger及财务query不动', async () => {
    const h = harness();
    const makeKey = (name: string, ledgerId = 37, categoryId?: number) => [['ledger', name], { input: { ledgerId, ...(categoryId ? { categoryId } : {}) }, type: 'query' }];
    const affected = [makeKey('getLedger37PresentationContext'), makeKey('getMyLedger37AiOverview'), makeKey('getR1StockPresentationContext', 37, 90250), makeKey('getMyR1AiParticipationPortfolio', 37, 90250), makeKey('getR1StockPresentationContext', 37, 90251)];
    const untouched = [makeKey('getLedger37PresentationContext', 38), makeKey('getMyLedger37AiOverview', 36), makeKey('getStockLotParticipationMatrix', 37, 90250), makeKey('getLedger37WalletMarginContext')];
    for (const k of [...affected, ...untouched]) h.queryClient.setQueryData(k, {});
    await h.save();
    for (const k of affected) expect(h.queryClient.getQueryState(k)?.isInvalidated).toBe(true);
    for (const k of untouched) expect(h.queryClient.getQueryState(k)?.isInvalidated).toBe(false);
    h.noFinancialWrites(); h.unsubscribe();
  });
  it('失败仅回退目标AI，另成员成功和全部草稿保留，不关编辑器/不清dirty', async () => {
    const h = harness(), failure = deferred();
    h.scope.ledger37AiDisplayMutation.mutateAsync.mockImplementation((payload: any) => payload.targetUserId === 901 ? failure.promise : Promise.resolve({}));
    const pending = h.save(); await h.save(902); failure.reject(new Error('没有权限')); expect(await pending).toBe(false);
    expect(h.ai().props.checked).toBe(false); expect(h.ai(902).props.checked).toBe(true); expect(h.scope.ledger37AiSavingScopes.size).toBe(0);
    expect(h.scope.editingStockLots.has(11)).toBe(true); expect(h.scope.dirtyUsers.has(901)).toBe(true); h.noFinancialWrites(); h.unsubscribe();
  });
  it('旧ledger/actor异步成功不patch当前缓存，不污染新成员scope或新actor覆盖层', async () => {
    const h = harness(), pending = deferred(); h.scope.ledger37AiDisplayMutation.mutateAsync.mockReturnValue(pending.promise);
    const saving = h.save(); h.scope.ledgerId = 38; h.scope.ledger37AiViewScopeRef.current = '38:2:self';
    h.scope.ledger37AiDisplayOverridesRef.current['38:902'] = { enabled: true, requestId: 99, status: 'saved', afterReadVersion: 0, viewScope: '38:2:self' };
    pending.resolve(); expect(await saving).toBe(false);
    expect(h.allBalancesUtils.setData).not.toHaveBeenCalled(); expect(h.scope.ledger37AiDisplayOverrides['38:902'].enabled).toBe(true);
    expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); expect(h.scope.toast.success).not.toHaveBeenCalled(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('同ledger切换actor后不借用旧actor覆盖层，旧失败不能恢复当前actor设置', async () => {
    const h = harness(), pending = deferred(); h.scope.ledger37AiDisplayMutation.mutateAsync.mockReturnValue(pending.promise);
    const saving = h.save(); h.scope.user.id = 2; h.scope.ledger37AiViewScopeRef.current = '37:2:self';
    expect(h.ai().props.checked).toBe(false); pending.reject(new Error('旧保存失败')); expect(await saving).toBe(false);
    expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); expect(h.scope.toast.error).not.toHaveBeenCalled(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('pending期间切到代看即使尚未重新render，也不能patch/提示成功', async () => {
    const h = harness(), pending = deferred(); h.scope.ledger37AiDisplayMutation.mutateAsync.mockReturnValue(pending.promise);
    const saving = h.save(); h.scope.window.location.search = '?viewAs=901'; pending.resolve(); expect(await saving).toBe(false);
    expect(h.allBalancesUtils.setData).not.toHaveBeenCalled(); expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('manual cache不是服务器确认；后续真实读取无论同值或别管理员改值都撤覆盖层', async () => {
    const h = harness(); await h.save(); expect(h.scope.ledger37AiDisplayOverrides['37:901'].status).toBe('saved');
    await h.serverRead({ 901: { [key]: 1 } }); expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); expect(h.ai().props.checked).toBe(true);
    await h.save(); await h.serverRead({ 901: { [key]: 0 } }); expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); expect(h.ai().props.checked).toBe(false); h.unsubscribe();
  });
  it('保存前旧inflight读取/读取失败不撤成功层；再次保存失败恢复之前已保存AI', async () => {
    const h = harness(), oldRead = deferred();
    const fetching = h.queryClient.fetchQuery({ queryKey, queryFn: () => oldRead.promise, staleTime: 0 });
    await h.save(); oldRead.resolve({ members: h.scope.allBalancesData.members, balancesMap: { 901: {} } }); await fetching;
    h.scope.allBalancesData = h.queryClient.getQueryData(queryKey); expect(h.ai().props.checked).toBe(true);
    await expect(h.queryClient.fetchQuery({ queryKey, queryFn: async () => { throw new Error('offline'); } })).rejects.toThrow('offline');
    expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeTruthy();
    h.scope.ledger37AiDisplayMutation.mutateAsync.mockRejectedValueOnce(new Error('拒绝修改'));
    expect(await h.save(901, false)).toBe(false); expect(h.ai().props.checked).toBe(true); expect(h.scope.ledger37AiDisplayOverrides['37:901'].status).toBe('saved');
    await h.serverRead({ 901: { [key]: 1 } }); expect(h.scope.ledger37AiDisplayOverrides['37:901']).toBeUndefined(); h.noFinancialWrites(); h.unsubscribe();
  });
  it('全37必要真实读取仍保护两个不同stock tag金额/押金dirty草稿与lot观察草稿', async () => {
    const h = harness(), r1 = h.scope.editState[901].R1, r2 = h.scope.editState[901].R2, real = h.scope.stockParticipationDrafts, obs = h.scope.stockObservationDrafts;
    await h.save(); await h.serverRead({ 901: { R1: 100, R1__ratio: 20, R2: 90, [key]: 1 }, 902: {}, 903: {} });
    runEffect('const initial: Record<number, Record<string, TagEntry>>', h.scope);
    expect(h.scope.editState[901].R1).toBe(r1); expect(h.scope.editState[901].R2).toBe(r2); expect(h.scope.dirtyUsers.has(901)).toBe(true);
    expect(h.scope.stockParticipationDrafts).toBe(real); expect(h.scope.stockObservationDrafts).toBe(obs); h.unsubscribe();
  });
  it('通用余额保存过滤新/旧AI保留键，保持普通余额字段，真实handler载荷接线使用过滤器', () => {
    const h = harness();
    const retained = { [key]: 1, __stockAiDisplay_category_90250: 1, __stockAiDisplay_category_90251: 0, R1: 100, R1__margins: '[{"amount":90}]', normalKey: 'retain' };
    expect(h.scope.stripLedger37AiDisplayKeys(retained)).toEqual({ R1: 100, R1__margins: '[{"amount":90}]', normalKey: 'retain' });
    const handler = declarations.get('handleSaveMember')!.getText(ast);
    expect(handler).toContain('balances: stripLedger37AiDisplayKeys(balances)');
    h.unsubscribe();
  });
  it('真实通用成员保存mutation spy不回传缓存全份中的global/legacy flags，也不调用AI mutation', async () => {
    const h = harness();
    h.scope.categories = [{ id: 123, name: 'Cash', accountingMode: 'ordinary' }];
    h.scope.allBalancesData.balancesMap[901] = { Cash: 100, Cash__ratio: 20, [key]: 1, __stockAiDisplay_category_90250: 1 };
    h.scope.editState[901] = { Cash: { amount: '100', ratio: '20', targetAmount: '20', visible: true, margins: [], pauseHistory: [], legacyMarginNoteIds: [] } };
    Object.assign(h.scope, {
      isOrdinaryClearMemberBusy: () => false, ordinaryPendingClearsRef: { current: {} }, ordinaryTagIsDirty: () => false,
      pauseWalletPlans: {}, pauseWalletHandlingDraft: null, ordinaryEffectiveObservation: () => ({ enabled: false }),
      savingUsers: new Set(), hideAcknowledgements: {}, hideAcknowledgementKey: () => '', normalizeMarginCoin: (coin: string) => coin,
      setSavingUsers: vi.fn(), setPauseWalletPlans: vi.fn(), setPauseWalletHandlingDraft: vi.fn(),
    });
    for (const name of ['allocationValueChanged', 'getChangedAllocationError', 'materializeMemberPausePlans', 'defaultEntry']) {
      h.scope[name] = (...args: any[]) => expression(name, h.scope)(...args);
    }
    expect(await expression('handleSaveMember', h.scope)(901)).toBe(true);
    expect(h.scope.setMutation.mutateAsync).toHaveBeenCalledTimes(1);
    const payload = h.scope.setMutation.mutateAsync.mock.calls[0][0];
    expect(payload.ledgerId).toBe(37); expect(payload.targetUserId).toBe(901);
    expect(payload.balances.Cash).toBe(100); expect(payload.balances.Cash__ratio).toBe(20);
    expect(payload.balances).not.toHaveProperty(key); expect(payload.balances).not.toHaveProperty('__stockAiDisplay_category_90250');
    expect(h.scope.ledger37AiDisplayMutation.mutateAsync).not.toHaveBeenCalled(); h.unsubscribe();
  });
  it('单lot取消仍只清该lot草稿，不关全局AI、不清其他lot观察草稿', async () => {
    const h = harness(); await h.save(); h.scope.finishStockLotEditing(11, true);
    expect(h.scope.stockParticipationDrafts['11:901']).toBeUndefined(); expect(h.scope.stockObservationDrafts['22:902']).toBeTruthy();
    expect(h.ai().props.checked).toBe(true); h.unsubscribe();
  });
});
