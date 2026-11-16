import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AI_WALLET_SETTLEMENT_ASSETS } from '../shared/ai-wallet-assets';

// 离线执行生产 AST 片段：不 import React 页面、路由、DB 或行情模块，不启动服务。
// 所有 refetch / mutation / JSX factory 都是测试边界；不会连接网络或真实浏览器。
const ast = ts.createSourceFile('AfRechargeManage.tsx',
  readFileSync(new URL('../client/src/pages/AfRechargeManage.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return result;
}
function initializer(name: string) {
  return required(nodes(ast, ts.isVariableDeclaration)
    .find(node => ts.isIdentifier(node.name) && node.name.text === name)?.initializer, name);
}
function evaluate<T>(source: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(source, {
    fileName: 'isolated.tsx', compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
    },
  });
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
function expression<T>(name: string, bindings: Record<string, unknown> = {}): T {
  return evaluate<T>(`(${initializer(name).getText(ast)});`, bindings);
}
function stateInitial<T>(name: string): T {
  const binding = required(nodes(ast, ts.isVariableDeclaration).find(node => ts.isArrayBindingPattern(node.name)
    && node.name.elements[0]?.getText(ast) === name), name);
  return evaluate<T>(`(${required(binding.initializer, name).getText(ast)});`, {
    useState: (initial: T) => initial,
  });
}
const baseReads = ['refetchAdjUsers', 'refetchAdjGlobal', 'refetchAdjRecentHistory',
  'ordersQuery', 'pendingOrdersQuery', 'statsQuery', 'heartbeatQuery', 'unmatchedQuery'] as const;
const userReads = ['refetchAdjHistory', 'refetchAdjMultiAssetHistory'] as const;
const allReads = [...baseReads, ...userReads, 'adjUserTrendQuery', 'adjGlobalTrendQuery', 'adjWalletPricesQuery'] as const;
type ReadName = typeof allReads[number];
type FlowTab = 'user' | 'global' | 'balances';
const options = { cancelRefetch: true, throwOnError: true };
const preserved = {
  adjSearch: 'Ocean', adjCurrency: 'ETH', adjDirection: 'sub', adjAmount: '0.12345678',
  adjNote: '保留备注', adjSelectedCommonNote: '保留备注', adjUserHistoryTab: 'funding',
  adjAssetFlowScope: { userId: 28, assetCode: 'SOL', page: 7 }, adjLogPage: 9,
  adjBalanceSearch: 'Ocean', adjHideZeroAssetUsers: false, adjHideZeroAssetTypes: false,
  adjUserFlowKeyword: '退款', adjUserFlowDatePreset: 'custom',
  adjUserFlowCustomStart: '2026-10-01', adjUserFlowCustomEnd: '2026-10-31',
  adjGlobalFlowKeyword: '转账', adjGlobalFlowDatePreset: 'last_month',
  adjGlobalFlowCustomStart: '2026-09-01', adjGlobalFlowCustomEnd: '2026-09-30',
  adjUserTrendDays: 7, adjGlobalTrendDays: 60,
};
function refreshHarness(selected: boolean, flow: FlowTab, implementations: Partial<Record<ReadName, () => unknown>> = {}) {
  const reads = Object.fromEntries(allReads.map(name => [name,
    vi.fn(implementations[name] ?? (() => Promise.resolve({ data: name }))) ])) as Record<ReadName, ReturnType<typeof vi.fn>>;
  const setters = Object.fromEntries(nodes(ast, ts.isVariableDeclaration)
    .filter(node => ts.isArrayBindingPattern(node.name) && node.name.elements.length === 2)
    .map(node => [(node.name as ts.ArrayBindingPattern).elements[1].getText(ast), vi.fn()]));
  const sideEffect = vi.fn(() => { throw new Error('Forbidden refresh side effect'); });
  const poison: unknown = new Proxy(sideEffect, { get: () => poison });
  const mutationBindings = Object.fromEntries(nodes(ast, ts.isVariableDeclaration)
    .filter(node => ts.isIdentifier(node.name) && /Mutation$/.test(node.name.text))
    .map(node => [node.name.getText(ast), poison]));
  const lock = { current: false };
  const toast = { success: vi.fn(), error: vi.fn() };
  const bindings: Record<string, unknown> = {
    ...preserved, ...setters, ...mutationBindings, adjPageRefreshInFlightRef: lock,
    adjSelectedUser: selected ? { id: 28, name: 'Ocean' } : null,
    adjFlowTab: flow, mainTab: 'adjust', toast, window: poison, document: poison,
    location: poison, history: poison, trpc: poison, mtrpc: poison, adjUtils: poison,
    handleAdjSubmit: poison,
    ...Object.fromEntries(allReads.map(name => [name, name.startsWith('refetch') ? reads[name] : { refetch: reads[name] }])),
  };
  const refresh = expression<() => Promise<void>>('handleAdjPageRefresh', bindings);
  return { refresh, reads, setters, lock, toast, sideEffect, bindings };
}
function expectReads(reads: ReturnType<typeof refreshHarness>['reads'], expected: readonly ReadName[]) {
  for (const name of allReads) {
    expect(reads[name].mock.calls, name).toEqual(expected.includes(name) ? [[options]] : []);
  }
}
function deferred() {
  let resolve!: (value?: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function microtasks() { for (let i = 0; i < 5; i++) await Promise.resolve(); }

describe('整页更新：执行真实 handler 的请求门控、锁和失败恢复', () => {
  it.each([
    { selected: false, flow: 'user' as const, extra: [] },
    { selected: false, flow: 'global' as const, extra: [] },
    { selected: false, flow: 'balances' as const, extra: ['adjWalletPricesQuery', 'adjGlobalTrendQuery'] },
    { selected: true, flow: 'user' as const, extra: [...userReads, 'adjUserTrendQuery', 'adjWalletPricesQuery'] },
    { selected: true, flow: 'global' as const, extra: [...userReads, 'adjWalletPricesQuery'] },
    { selected: true, flow: 'balances' as const, extra: [...userReads, 'adjWalletPricesQuery', 'adjGlobalTrendQuery'] },
  ])('selected=$selected / $flow：全部相关 refetch 强制取消旧请求并传播失败', async ({ selected, flow, extra }) => {
    const test = refreshHarness(selected, flow);
    await test.refresh();
    expectReads(test.reads, [...baseReads, ...extra] as ReadName[]);
    const calls = Object.values(test.reads).flatMap(read => read.mock.calls);
    expect(calls.every(call => call[0] === calls[0][0])).toBe(true);
    expect(test.toast.success.mock.calls).toEqual([['页面数据已更新']]);
    expect(test.toast.error).not.toHaveBeenCalled();
    expect(test.setters.setAdjPageRefreshing.mock.calls).toEqual([[true], [false]]);
    expect(test.lock.current).toBe(false);
  });

  it('同步 ref 锁在 React 重渲染前已生效，等待期间快速重复调用不重入', async () => {
    const pending = deferred();
    const test = refreshHarness(true, 'user', { refetchAdjUsers: () => pending.promise });
    const first = test.refresh();
    expect(test.lock.current).toBe(true);
    await test.refresh();
    await test.refresh();
    expectReads(test.reads, [...baseReads, ...userReads, 'adjUserTrendQuery', 'adjWalletPricesQuery']);
    expect(test.setters.setAdjPageRefreshing.mock.calls).toEqual([[true]]);
    expect(test.toast.success).not.toHaveBeenCalled();
    pending.resolve();
    await first;
    expect(test.lock.current).toBe(false);
  });

  it('allSettled：一项拒绝后其余请求仍须逐项完成，期间不 toast、不释放锁', async () => {
    const pending = Object.fromEntries(allReads.map(name => [name, deferred()])) as Record<ReadName, ReturnType<typeof deferred>>;
    const test = refreshHarness(true, 'balances', Object.fromEntries(allReads.map(name => [name, () => pending[name].promise])));
    let finished = false;
    const running = test.refresh().then(() => { finished = true; });
    const requested = [...baseReads, ...userReads, 'adjWalletPricesQuery', 'adjGlobalTrendQuery'] as ReadName[];
    expectReads(test.reads, requested);
    pending.refetchAdjUsers.reject(new Error('offline directory fetch failure'));
    await microtasks();
    for (const name of requested.filter(name => name !== 'refetchAdjUsers')) {
      expect(finished).toBe(false);
      expect(test.lock.current).toBe(true);
      expect(test.toast.error).not.toHaveBeenCalled();
      expect(test.toast.success).not.toHaveBeenCalled();
      pending[name].resolve();
      await microtasks();
    }
    await running;
    expect(finished).toBe(true);
    expect(test.toast.error.mock.calls).toEqual([['部分数据更新失败，请再点更新重试']]);
    expect(test.toast.success).not.toHaveBeenCalled();
    expect(test.setters.setAdjPageRefreshing.mock.calls).toEqual([[true], [false]]);
    expect(test.lock.current).toBe(false);
  });

  it('失败释放锁并允许同一 handler 重试，第二轮重新请求全部数据而非复用失败结果', async () => {
    const test = refreshHarness(true, 'user');
    test.reads.refetchAdjHistory.mockRejectedValueOnce(new Error('offline failure'));
    await test.refresh();
    expect(test.toast.error.mock.calls).toEqual([['部分数据更新失败，请再点更新重试']]);
    expect(test.lock.current).toBe(false);
    await test.refresh();
    const requested = [...baseReads, ...userReads, 'adjUserTrendQuery', 'adjWalletPricesQuery'];
    for (const name of allReads) expect(test.reads[name].mock.calls).toEqual(requested.includes(name) ? [[options], [options]] : []);
    expect(test.toast.success.mock.calls).toEqual([['页面数据已更新']]);
    expect(test.setters.setAdjPageRefreshing.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('成功和失败更新均不触发 mutation、重载、清空表单/筛选/币种/页码等 setter', async () => {
    const test = refreshHarness(true, 'user');
    const before = JSON.stringify(Object.fromEntries(Object.keys(preserved).map(key => [key, test.bindings[key]])));
    await test.refresh();
    test.reads.refetchAdjMultiAssetHistory.mockRejectedValueOnce(new Error('offline failure'));
    await test.refresh();
    expect(test.sideEffect).not.toHaveBeenCalled();
    for (const [name, setter] of Object.entries(test.setters)) {
      if (name !== 'setAdjPageRefreshing') expect(setter, name).not.toHaveBeenCalled();
    }
    expect(JSON.stringify(Object.fromEntries(Object.keys(preserved).map(key => [key, test.bindings[key]])))).toBe(before);
    const accesses = nodes(initializer('handleAdjPageRefresh'), ts.isPropertyAccessExpression).map(node => node.name.text);
    expect(accesses.filter(name => ['useMutation', 'mutate', 'mutateAsync', 'reload', 'assign', 'replace', 'invalidate'].includes(name))).toEqual([]);
  });

  it('启用趋势和行情的真实 useQuery 门控与刷新分支一致（包括 global 不刷趋势）', () => {
    for (const flow of ['user', 'global', 'balances'] as const) {
      for (const selected of [false, true]) {
        const bindings = { adjFlowTab: flow, adjSelectedUser: selected ? { id: 28 } : null,
          mainTab: 'adjust', adjUserTrendDays: 7, adjGlobalTrendDays: 60 };
        for (const name of ['adjUserTrendQuery', 'adjGlobalTrendQuery', 'adjWalletPricesQuery']) {
          const query = initializer(name);
          if (!ts.isCallExpression(query)) throw new Error(`Expected useQuery: ${name}`);
          const enabled = evaluate<{ enabled: boolean }>(`(${query.arguments[1].getText(ast)});`, bindings).enabled;
          expect(enabled).toBe(name === 'adjUserTrendQuery' ? flow === 'user' && selected
            : name === 'adjGlobalTrendQuery' ? flow === 'balances' : selected || flow === 'balances');
        }
      }
    }
  });
});

const syncEffect = required(nodes(ast, ts.isCallExpression).find(node => ts.isIdentifier(node.expression)
  && node.expression.text === 'useEffect'
  && nodes(node.arguments[0], ts.isIdentifier).some(id => id.text === 'setAdjSelectedUser')), 'same-ID directory effect');
type User = { id: number | string; [key: string]: unknown };
function directoryEffect(list: User[]) {
  let update!: (current: User | null) => User | null;
  const callback = evaluate<() => void>(`(${syncEffect.arguments[0].getText(ast)});`, {
    adjUserList: list, setAdjSelectedUser: (next: typeof update) => { update = next; },
  });
  callback();
  return update;
}
describe('目录刷新：真实函数式 same-ID effect 余额/担保投影与切人竞争', () => {
  it('同 ID（含字符串ID）用整条新目录对象同步 USDT/CNY 与数字币担保', () => {
    const fresh: User = { id: '28', name: 'Ocean', usdtBalance: 20686.37, usdtFrozen: 20000,
      cnyBalance: 1862, cnyFrozen: 200, multiAssetBalances: [
        { assetCode: 'ETH', totalBalance: 20, availableBalance: 18, frozenBalance: 2 },
        { assetCode: 'SOL', totalBalance: 211, availableBalance: 0, frozenBalance: 211 },
      ] };
    const selected = directoryEffect([{ id: 29 }, fresh])({ id: 28, usdtBalance: 1 });
    expect(selected).toBe(fresh);
    const funding = expression<(user: User, code: string) => unknown>('getFundingBalanceBreakdown');
    expect(funding(selected!, 'USDT')).toMatchObject({ total: 20686.37, frozen: 20000 });
    expect((funding(selected!, 'USDT') as { available: number }).available).toBeCloseTo(686.37, 8);
    expect(funding(selected!, 'CNY')).toEqual({ total: 1862, available: 1662, frozen: 200 });
    const digital = expression<(asset: unknown) => unknown>('getMultiAssetBreakdown');
    expect((fresh.multiAssetBalances as unknown[]).map(digital)).toEqual([
      { total: 20, available: 18, frozen: 2 }, { total: 211, available: 0, frozen: 211 },
    ]);
    expect(evaluate(`(${syncEffect.arguments[1].getText(ast)});`, { adjUserList: [fresh] })).toEqual([[fresh]]);
  });

  it('旧用户目录 effect 排队后切人，只按执行时 current.id 匹配；缺失/取消选择保持原值', () => {
    const old = { id: 28, usdtBalance: 111 };
    const newUser = { id: 29, usdtBalance: 222 };
    const pendingOldEffect = directoryEffect([old]);
    expect(pendingOldEffect(newUser)).toBe(newUser);
    expect(pendingOldEffect(null)).toBeNull();
    const newRow = { id: '29', usdtBalance: 333, usdtFrozen: 20 };
    expect(directoryEffect([old, newRow])(newUser)).toBe(newRow);
    expect(directoryEffect([])(newUser)).toBe(newUser);
    // 依赖仅目录，不依赖捕获的 selectedUser；同ID目录刷新不会重置分页scope。
    expect(nodes(syncEffect, ts.isIdentifier).map(node => node.text)).not.toContain('adjSelectedUser');
    expect(nodes(syncEffect, ts.isIdentifier).map(node => node.text)).not.toContain('setAdjAssetFlowScope');
  });
});

type Element = { type: unknown; props: Record<string, unknown>; children: unknown[] };
const React = { Fragment: 'Fragment', createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element =>
  ({ type, props: props ?? {}, children }) };
function isElement(value: unknown): value is Element {
  return !!value && typeof value === 'object' && 'type' in value && 'children' in value;
}
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  return isElement(value) ? [value, ...value.children.flatMap(elements)] : [];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('');
  if (isElement(value)) return value.children.map(text).join('');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}
const userSection = required(nodes(ast, ts.isJsxExpression).find(node => node.expression
  && ts.isBinaryExpression(node.expression) && node.expression.left.getText(ast) === 'adjFlowTab === "user"'
  && nodes(node.expression, ts.isJsxAttribute).some(attr => attr.name.getText(ast) === 'id'
    && attr.initializer && ts.isStringLiteral(attr.initializer) && attr.initializer.text === 'adj-digital-history-panel'))?.expression,
'user history section including outer gate');
const fundingRows = [
  { id: 'manual_1', currency: 'USDT', sourceType: 'manual', amount: '12.34', balanceAfter: '100.00', note: 'USDT保留流水', createdAt: '2026-10-12T08:00:00Z' },
  { id: 'manual_2', currency: 'CNY', sourceType: 'manual', amount: '-50', balanceAfter: '1862', note: '[CNY]人民币保留流水', createdAt: '2026-10-13T08:00:00Z' },
  { id: 'hold_3', currency: 'CNY', sourceType: 'wallet_hold', type: 'principal_hold', amount: '-200', note: '担保记录', createdAt: '2026-10-14T08:00:00Z' },
];
function historyHarness() {
  const tabSetter = vi.fn((tab: string) => { bindings.adjUserHistoryTab = tab; });
  const scopeSetter = vi.fn((scope: unknown) => { bindings.adjAssetFlowScope = scope; });
  const bindings: Record<string, unknown> = {
    React, AI_WALLET_SETTLEMENT_ASSETS, PrevIcon: 'PrevIcon', NextIcon: 'NextIcon',
    WalletBalanceTrendChart: 'WalletBalanceTrendChart', LedgerFlowFilters: 'LedgerFlowFilters',
    adjFlowTab: 'user', adjSelectedUser: { id: 28, name: 'Ocean' },
    adjUserHistoryTab: stateInitial('adjUserHistoryTab'), adjCurrency: 'USDT',
    adjAssetFlowScope: { userId: 28, assetCode: 'ETH', page: 7 },
    adjUserTrendQuery: {}, adjUserTrendDays: 30, setAdjUserTrendDays: vi.fn(),
    adjHistoryQuery: { data: fundingRows }, adjMultiAssetHistoryQuery: { data: {
      items: [{ id: 101, assetCode: 'ETH', amount: '1.234567', eventType: 'transfer_in', note: '数字币保留流水', createdAt: '2026-10-12T08:00:00Z' }],
      page: 7, total: 123, totalPages: 13,
    } },
    adjUserFlowKeyword: '', adjUserFlowDatePreset: 'all', adjUserFlowCustomStart: '', adjUserFlowCustomEnd: '',
    setAdjUserFlowKeyword: vi.fn(), setAdjUserFlowDatePreset: vi.fn(),
    setAdjUserFlowCustomStart: vi.fn(), setAdjUserFlowCustomEnd: vi.fn(),
    setAdjUserHistoryTab: tabSetter, setAdjAssetFlowScope: scopeSetter,
    refetchAdjMultiAssetHistory: vi.fn(), openMultiAssetRevoke: vi.fn(), openMultiAssetNoteEditor: vi.fn(),
    setRevokeTarget: vi.fn(), setShowRevokeDialog: vi.fn(), setNoteTarget: vi.fn(),
    setNoteContent: vi.fn(), setNoteSelectedCommonNote: vi.fn(), setShowNoteDialog: vi.fn(), adjCommonNotes: [],
    cleanAdjustmentNote: expression('cleanAdjustmentNote'),
    isReversibleMultiAssetAdjustment: expression('isReversibleMultiAssetAdjustment'),
    formatLedgerDate: expression('formatLedgerDate'),
  };
  bindings.getLedgerDateRange = expression('getLedgerDateRange', bindings);
  const render = () => {
    for (const name of ['adjAssetFlowUserId', 'adjAssetFlowPage', 'adjAssetFlowCurrency',
      'adjVisibleMultiAssetHistory', 'adjAssetFlowTotal', 'adjAssetFlowTotalPages', 'adjAssetFlowDisplayedPage',
      'adjHistory', 'adjUserDateRange', 'adjUserKeyword', 'adjFilteredHistory']) bindings[name] = expression(name, bindings);
    return evaluate<Element>(`(${userSection.getText(ast)});`, bindings);
  };
  return { bindings, render, tabSetter, scopeSetter };
}
function byText(tree: unknown, label: string) {
  return required(elements(tree).find(node => node.type === 'button' && text(node) === label), label);
}
function click(node: Element) { (node.props.onClick as () => void)(); }

describe('用户流水 Tab：执行真实 JSX、分页回调及提交币种边界', () => {
  it('默认数字币；每次只有对应 panel，aria 关联正确；未选人/非用户视图不展示任何 panel', () => {
    const test = historyHarness();
    expect(test.bindings.adjUserHistoryTab).toBe('digital');
    for (const [tab, label] of [['digital', '数字币'], ['funding', '人民币 / USDT']] as const) {
      test.bindings.adjUserHistoryTab = tab;
      const tree = test.render();
      const panels = elements(tree).filter(node => node.props.role === 'tabpanel');
      expect(panels).toHaveLength(1);
      expect(panels[0].props.id).toBe(`adj-${tab}-history-panel`);
      expect(panels[0].props['aria-labelledby']).toBe(`adj-${tab}-history-tab`);
      const tabs = elements(tree).filter(node => node.props.role === 'tab');
      expect(tabs).toHaveLength(2);
      expect(tabs.filter(node => node.props['aria-selected'])).toEqual([byText(tree, label)]);
      expect(byText(tree, label).props['aria-controls']).toBe(panels[0].props.id);
      expect(tabs.every(node => node.props.type === 'button')).toBe(true);
      expect(elements(tree).filter(node => node.props.role === 'tablist')).toHaveLength(1);
    }
    for (const flow of ['global', 'balances']) {
      test.bindings.adjFlowTab = flow;
      expect(elements(test.render()).filter(node => ['tab', 'tabpanel'].includes(String(node.props.role)))).toEqual([]);
    }
    test.bindings.adjFlowTab = 'user';
    test.bindings.adjSelectedUser = null;
    expect(text(test.render())).toContain('请先在上方选择用户');
    expect(elements(test.render()).some(node => node.props.role === 'tabpanel')).toBe(false);
  });

  it('Tab 往返不改数字币筛选/页码、调账币种及人民币/USDT原列表和关键字日期过滤', () => {
    const test = historyHarness();
    const scope = test.bindings.adjAssetFlowScope;
    const first = test.render();
    expect(text(first)).toContain('数字币保留流水');
    click(byText(first, '人民币 / USDT'));
    const funding = test.render();
    const panel = required(elements(funding).find(node => node.props.role === 'tabpanel'), 'funding panel');
    expect(elements(panel).filter(node => node.props.key != null).map(node => node.props.key)).toEqual(fundingRows.map(row => row.id));
    expect(text(panel)).toContain('USDT保留流水');
    expect(text(panel)).toContain('人民币保留流水');
    expect(text(panel)).toContain('业务冻结');
    expect(test.bindings.adjHistory).toBe(fundingRows);
    expect(test.bindings.adjFilteredHistory).toEqual(fundingRows);
    test.bindings.adjUserFlowKeyword = '人民币';
    test.bindings.adjUserFlowDatePreset = 'custom';
    test.bindings.adjUserFlowCustomStart = '2026-10-13';
    test.bindings.adjUserFlowCustomEnd = '2026-10-13';
    test.render();
    expect(test.bindings.adjFilteredHistory).toEqual([fundingRows[1]]);
    click(byText(funding, '数字币'));
    expect(text(test.render())).toContain('7 / 13 页');
    expect(test.bindings.adjAssetFlowScope).toBe(scope);
    expect(test.bindings.adjCurrency).toBe('USDT');
    expect(test.bindings.adjUserFlowKeyword).toBe('人民币');
    expect(test.scopeSetter).not.toHaveBeenCalled();
    expect(test.tabSetter.mock.calls).toEqual([['funding'], ['digital']]);
  });

  it('数字币 select 与上下页执行原 scope 回调：保留当前用户、币种，改币种回到第一页', () => {
    const test = historyHarness();
    const tree = test.render();
    const select = required(elements(tree).find(node => node.type === 'select'), 'digital select');
    expect(select.props.value).toBe('ETH');
    expect(elements(select).filter(node => node.type === 'option').map(node => node.props.value)).toEqual(['all', ...AI_WALLET_SETTLEMENT_ASSETS]);
    click(byText(tree, '上一页'));
    expect(test.scopeSetter).toHaveBeenLastCalledWith({ userId: 28, assetCode: 'ETH', page: 6 });
    click(byText(tree, '下一页'));
    expect(test.scopeSetter).toHaveBeenLastCalledWith({ userId: 28, assetCode: 'ETH', page: 8 });
    (select.props.onChange as (event: unknown) => void)({ target: { value: 'SOL' } });
    expect(test.scopeSetter).toHaveBeenLastCalledWith({ userId: 28, assetCode: 'SOL', page: 1 });
    expect(test.bindings.adjCurrency).toBe('USDT');
    expect(test.tabSetter).not.toHaveBeenCalled();
  });

  it('菜单 digital/funding 与流水币种筛选不进入实际调账 payload（只调用离线 mutation spy）', () => {
    const test = historyHarness();
    const fundingMutation = { mutate: vi.fn() };
    const digitalMutation = { mutate: vi.fn() };
    Object.assign(test.bindings, { adjAmount: '2.50', adjDirection: 'sub', adjNote: ' 调账备注 ',
      adjMutation: fundingMutation, multiAssetAdjMutation: digitalMutation,
      toast: { error: vi.fn() }, crypto: { randomUUID: () => 'offline-request-id' } });
    for (const currency of ['USDT', 'CNY', 'ETH']) {
      for (const tab of ['digital', 'funding']) {
        test.bindings.adjCurrency = currency;
        test.bindings.adjUserHistoryTab = tab;
        expression<() => void>('handleAdjSubmit', test.bindings)();
        if (currency === 'ETH') expect(digitalMutation.mutate).toHaveBeenLastCalledWith({
          userId: 28, assetCode: 'ETH', amount: '-2.50', note: '调账备注', requestId: 'offlinerequestid',
        });
        else expect(fundingMutation.mutate).toHaveBeenLastCalledWith({ userId: 28, currency, amount: -2.5, note: '调账备注' });
      }
    }
    expect(fundingMutation.mutate).toHaveBeenCalledTimes(4);
    expect(digitalMutation.mutate).toHaveBeenCalledTimes(2);
  });
});

const refreshButton = required(nodes(ast, ts.isJsxElement).find(node => node.openingElement.tagName.getText(ast) === 'button'
  && nodes(node, ts.isIdentifier).some(id => id.text === 'handleAdjPageRefresh')), 'page refresh button');
describe('整页更新按钮：真实 JSX 可访问状态与纯文字操作', () => {
  it.each([false, true])('refreshing=%s：type=button、仅“更新”文字且 busy/disabled 跟随状态', busy => {
    const handler = vi.fn(async () => undefined);
    const tree = evaluate<Element>(`(${refreshButton.getText(ast)});`, { React, adjPageRefreshing: busy, handleAdjPageRefresh: handler });
    expect(tree.type).toBe('button');
    expect(tree.props.type).toBe('button');
    expect(tree.props.disabled).toBe(busy);
    expect(tree.props['aria-busy']).toBe(busy);
    expect(tree.props['aria-label']).toBe('更新整页钱包数据');
    expect(tree.children).toEqual(['更新']);
    expect(elements(tree)).toHaveLength(1);
    click(tree);
    expect(handler).toHaveBeenCalledOnce();
  });
});
