import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AI_WALLET_SETTLEMENT_ASSETS, AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS } from '../shared/ai-wallet-assets';
import { normalizeWalletAssetCode, getWalletAssetCategory, matchesWalletAssetFilter,
  getWalletAssetFilterLabel, getWalletAssetFilterCodes, type WalletAssetFilterCategory } from '../shared/wallet-asset-filters';

// 严格离线：只 import 生产纯函数，页面仅作为文本读取并抽取真实 AST。
// 不 import 整页/router/DB/tRPC；VM 无 process/require，查询仅只读 spy，禁止资金提交。
const ast = ts.createSourceFile('AfRechargeManage.tsx',
  readFileSync(new URL('../client/src/pages/AfRechargeManage.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root); return found;
}
function initializer(name: string, root: ts.Node = ast) {
  return required(nodes(root, ts.isVariableDeclaration).find(node => ts.isIdentifier(node.name)
    && node.name.text === name)?.initializer, name);
}
const compiled = new Map<string, string>();
function evaluate<T = any>(source: string, bindings: Record<string, unknown> = {}): T {
  let js = compiled.get(source);
  if (!js) {
    js = ts.transpileModule(source, { fileName: 'offline-global-filters.tsx', compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
    } }).outputText;
    compiled.set(source, js);
  }
  return runInNewContext(js, bindings, { timeout: 1_000 }) as T;
}
function expression<T = any>(name: string, bindings: Record<string, unknown> = {}, root: ts.Node = ast): T {
  return evaluate<T>(`(${initializer(name, root).getText(ast)});`, bindings);
}
function component(name: string) {
  return required(ast.statements.filter(ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
}
const helpers = { normalizeWalletAssetCode, getWalletAssetCategory, matchesWalletAssetFilter,
  getWalletAssetFilterLabel, getWalletAssetFilterCodes, AI_WALLET_SETTLEMENT_ASSETS };
type Filter = { category: WalletAssetFilterCategory; assetCode: string };
const all: Filter = { category: 'all', assetCode: 'all' };
function stateInitial(name: string) {
  const node = required(nodes(ast, ts.isVariableDeclaration).find(node => ts.isArrayBindingPattern(node.name)
    && node.name.elements[0]?.getText(ast) === name), name);
  return evaluate(`(${required(node.initializer, name).getText(ast)});`, { useState: (initial: unknown) => initial });
}
type VNode = { type: unknown; props: Record<string, any>; children: unknown[] };
const React = { Fragment: 'Fragment', createElement: (type: unknown, props: Record<string, any> | null,
  ...children: unknown[]): VNode => ({ type, props: props ?? {}, children }) };
function isVNode(value: unknown): value is VNode {
  return !!value && typeof value === 'object' && 'type' in value && 'children' in value;
}
function elements(tree: unknown): VNode[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return isVNode(tree) ? [tree, ...tree.children.flatMap(elements)] : [];
}
function text(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (isVNode(tree)) return tree.children.map(text).join('');
  return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
}
function gate(tab: string) {
  return required(nodes(ast, ts.isJsxExpression).find(node => node.expression && ts.isBinaryExpression(node.expression)
    && node.expression.left.getText(ast) === `adjFlowTab === "${tab}"`)?.expression, `${tab} gate`);
}
function attr(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string) {
  const properties = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
  return required(properties.find((value): value is ts.JsxAttribute => ts.isJsxAttribute(value)
    && value.name.getText(ast) === name), name);
}
function attrExpression(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string) {
  const value = required(attr(node, name).initializer, name);
  if (!ts.isJsxExpression(value) || !value.expression) throw new Error(`Not JSX expression: ${name}`);
  return value.expression;
}
const globalGate = gate('global');
const balanceGate = gate('balances');
function filterInstance(id: string) {
  return required(nodes(ast, ts.isJsxSelfClosingElement).find(node => node.tagName.getText(ast) === 'WalletAssetFilters'
    && attr(node, 'id').initializer?.getText(ast) === `"${id}"`), id);
}
function renderFilters(filter: Filter, codes: readonly string[] = getWalletAssetFilterCodes(['NEWCOIN'])) {
  const onChange = vi.fn();
  const render = evaluate<(props: unknown) => VNode>(`(${component('WalletAssetFilters').getText(ast)});`, { React, ...helpers });
  const tree = render({ id: 'adj-global-flow', filter, assetCodes: codes, onChange });
  return { tree, onChange, select: required(elements(tree).find(node => node.type === 'select'), 'currency select') };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}
const users = deepFreeze([
  { id: 28, name: 'Ocean', username: 'ocean', usdtBalance: '100', usdtFrozen: '20', cnyBalance: '70', cnyFrozen: '14',
    multiAssetBalances: [
      { assetCode: ' eth ', availableBalance: '2', frozenBalance: '1', totalBalance: '3' },
      { assetCode: 'SOL', availableBalance: '-2', frozenBalance: '0', totalBalance: '-2' },
      { assetCode: 'BTC', availableBalance: '0', frozenBalance: '5', totalBalance: '5' },
      { assetCode: 'NEWCOIN', availableBalance: '0', frozenBalance: '4', totalBalance: '4' },
      { assetCode: 'ODD', availableBalance: '-2', frozenBalance: '2', totalBalance: '0' },
      { assetCode: 'MSTR', availableBalance: '-0.5', frozenBalance: '0', totalBalance: '-0.5' },
      ...['USDT', 'U', 'CNY', 'RMB', '人民币'].map(assetCode => ({ assetCode,
        availableBalance: '1000', frozenBalance: '100', totalBalance: '1100' })),
    ] },
  { id: 29, name: '人民币用户', username: 'cny-only', usdtBalance: '0', cnyBalance: '140', multiAssetBalances: [] },
  { id: 30, name: '稳定用户', username: 'stable-only', usdtBalance: '-5', cnyBalance: '0', multiAssetBalances: [] },
  { id: 31, name: '冻结用户', username: 'frozen-only', usdtBalance: '0', cnyBalance: '0',
    multiAssetBalances: [{ assetCode: 'ETH', availableBalance: '0', frozenBalance: '2', totalBalance: '2' }] },
  { id: 32, name: '零用户', username: 'zero', usdtBalance: '0', cnyBalance: '0', multiAssetBalances: [] },
]);
const prices = deepFreeze({ ETH: 10, SOL: 3, BTC: 2, MSTR: 20, USDT: 1, CNY: 1 });
const userAllU = 100 + 70 / 7 + 3 * 10 + (-2) * 3 + 5 * 2 + (-0.5) * 20;
function balances(filter: Filter = all, options: { search?: string; hideUsers?: boolean; hideTypes?: boolean;
  users?: readonly any[]; rate?: number; prices?: Record<string, number> } = {}) {
  const bindings: Record<string, any> = { React, ...helpers,
    adjUserList: options.users ?? users, adjLogItems: [], adjGlobalAssetFilter: all,
    adjBalanceAssetFilter: filter, adjBalanceSearch: options.search ?? '',
    adjHideZeroAssetUsers: options.hideUsers ?? true, adjHideZeroAssetTypes: options.hideTypes ?? true,
    adjWalletPricesQuery: { data: { prices: options.prices ?? prices, usdtCnyRate: options.rate ?? 7 }, isLoading: false },
  };
  for (const name of ['formatWalletAmount', 'getFundingBalanceBreakdown', 'getMultiAssetBreakdown',
    'adjBalanceQuery', 'adjWalletAssetFilterCodes', 'adjBalanceFilterLabel', 'adjBalanceTotals',
    'adjMultiAssetTotals', 'adjMultiAssetFrozenTotals', 'adjBalancePrices', 'adjBalanceUsdtCnyRate', 'adjBalanceHasRate',
    'adjMultiAssetValuations', 'adjBalanceUnpricedAssets', 'adjBalanceDigitalValueU', 'adjAllWalletValuation',
    'getUserWalletAssetRows', 'getUserWalletTotalValuation', 'userHasAnyWalletAsset', 'adjFilteredBalanceUsers',
    'adjUserWalletValuations', 'adjSortedBalanceUsers']) bindings[name] = expression(name, bindings);
  return bindings;
}
const rowInitializer = initializer('assetRows', balanceGate);
function selectedRows(runtime: Record<string, any>, user = users[0]) {
  return evaluate<any[]>(`(${rowInitializer.getText(ast)});`, { ...runtime, user });
}
function renderBalances(runtime: Record<string, any>) {
  return evaluate<VNode>(`(${balanceGate.getText(ast)});`, { ...runtime,
    adjFlowTab: 'balances', Search: 'Search', X: 'X', Copy: 'Copy', WalletAssetFilters: 'WalletAssetFilters',
    WalletTotalAssetTrendChart: 'WalletTotalAssetTrendChart', adjGlobalTrendQuery: {}, adjGlobalTrendDays: 30,
    setAdjGlobalTrendDays: vi.fn(), setAdjBalanceAssetFilter: vi.fn(), setAdjBalanceSearch: vi.fn(),
    setAdjHideZeroAssetUsers: vi.fn(), setAdjHideZeroAssetTypes: vi.fn(), copyUserTransferCode: vi.fn(),
  });
}
function renderGlobal(overrides: Record<string, unknown> = {}) {
  const bindings: Record<string, any> = { React, ...helpers,
    adjFlowTab: 'global', WalletAssetFilters: 'WalletAssetFilters', LedgerFlowFilters: 'LedgerFlowFilters',
    PrevIcon: 'PrevIcon', NextIcon: 'NextIcon', adjGlobalAssetFilter: all, adjBalanceAssetFilter: all,
    adjWalletAssetFilterCodes: getWalletAssetFilterCodes(), adjLogTotal: 0, adjLogItems: [], adjLogPage: 1,
    adjLogTotalPages: 1, adjGlobalFlowKeyword: '', adjGlobalFlowDatePreset: 'all',
    adjGlobalFlowCustomStart: '', adjGlobalFlowCustomEnd: '', adjGlobalLogLoading: false,
    adjGlobalLogFetching: false, adjGlobalLogError: null, cleanAdjustmentNote: expression('cleanAdjustmentNote'),
    adjCommonNotes: [], ...overrides,
  };
  for (const name of ['setAdjGlobalAssetFilter', 'setAdjLogPage', 'setAdjGlobalFlowKeyword', 'setAdjGlobalFlowDatePreset',
    'setAdjGlobalFlowCustomStart', 'setAdjGlobalFlowCustomEnd', 'refetchAdjGlobal']) bindings[name] ??= vi.fn();
  return { tree: evaluate<VNode>(`(${globalGate.getText(ast)});`, bindings), bindings };
}

function chartRuntime(filter?: Filter, trend = deepFreeze({
  current: { usdt: 100, cny: 70, multiAssets: { ETH: 3, SOL: 2, BTC: 5, NEWCOIN: 4 } },
  series: [{ date: '2026-11-22', usdt: 50, cny: 35, multiAssets: { ETH: 1, SOL: 1, BTC: 2, NEWCOIN: 4 } }],
})) {
  const fn = component('WalletTotalAssetTrendChart');
  const params = { trend, isLoading: false, days: 30, onDaysChange: vi.fn(), usdtCnyRate: 7,
    assetPrices: prices, fallbackMultiAssets: { ETH: 3, SOL: 2, BTC: 5 }, ...(filter ? { assetFilter: filter } : {}) };
  const chartNames = ['ResponsiveContainer', 'BarChart', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip', 'Bar'];
  const bindings = { React, ...helpers, ...Object.fromEntries(chartNames.map(name => [name, name])) };
  const render = evaluate<(props: unknown) => VNode>(`(${fn.getText(ast)});`, bindings);
  // 原函数参数与 return 前的全部真实语句，不重写计算公式；暴露真实数值便于精确断言。
  const body = required(fn.body, 'trend function body');
  const prefix = body.statements.slice(0, body.statements.findIndex(ts.isReturnStatement)).map(node => node.getText(ast)).join('\n');
  const inspect = evaluate<(props: unknown) => any>(`(function(${fn.parameters.map(p => p.getText(ast)).join(',')}) {
    ${prefix}\nreturn {series, currentUsdt, currentEthU, currentSolU, currentOtherAssetsU, currentTotalAssetU, periodChange}; });`, bindings);
  return { values: inspect(params), tree: render(params), params, render };
}

describe('共享资产筛选：仅规范展示代码，保持原账务输入及既有证券商品', () => {
  it.each([
    [' u ', 'USDT', 'stable'], [' usdt ', 'USDT', 'stable'], [undefined, 'USDT', 'stable'],
    [' RMB ', 'CNY', 'cny'], ['人民币', 'CNY', 'cny'], [' cny ', 'CNY', 'cny'],
    [' eth ', 'ETH', 'digital'], ['NEWCOIN', 'NEWCOIN', 'digital'],
  ] as const)('%s 归一化为 %s / %s', (input, code, category) => {
    expect(normalizeWalletAssetCode(input)).toBe(code);
    expect(getWalletAssetCategory(input)).toBe(category);
    expect(matchesWalletAssetFilter(input, category, code)).toBe(true);
    expect(matchesWalletAssetFilter(input, category, 'all')).toBe(true);
    expect(matchesWalletAssetFilter(input, 'all', 'NOT-THE-CODE')).toBe(false);
  });
  it('分类与单币严格 AND，证券商品不转成稳定币，未知币只加入真实选项且输入不变', () => {
    expect(matchesWalletAssetFilter('ETH')).toBe(true);
    expect(matchesWalletAssetFilter('ETH', 'stable', 'ETH')).toBe(false);
    expect(matchesWalletAssetFilter('RMB', 'cny', 'CNY')).toBe(true);
    for (const code of AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS) expect(getWalletAssetCategory(code)).toBe('digital');
    const extra = deepFreeze([' eth ', 'U', '人民币', '', null, 'NEWCOIN', 'newcoin']);
    const before = JSON.stringify(extra);
    const codes = getWalletAssetFilterCodes(extra);
    expect(codes).toEqual(['USDT', 'CNY', ...AI_WALLET_SETTLEMENT_ASSETS, 'NEWCOIN']);
    expect(new Set(codes).size).toBe(codes.length);
    expect(JSON.stringify(extra)).toBe(before);
    expect(getWalletAssetFilterLabel('digital', 'NEWCOIN')).toBe('NEWCOIN');
    expect(getWalletAssetFilterLabel('cny', 'RMB')).toBe('人民币');
  });
});

describe('真实全局筛选组件：四分类、移动布局、aria与只读回调', () => {
  it.each(['all', 'digital', 'stable', 'cny'] as const)('%s 分类仅给出匹配选项，切分类清单币、选单币保留分类', category => {
    const filter = deepFreeze({ category, assetCode: category === 'digital' ? 'ETH' : 'all' });
    const before = JSON.stringify(filter);
    const test = renderFilters(filter);
    const buttons = elements(test.tree).filter(node => node.type === 'button');
    expect(buttons.map(text)).toEqual(['全部', '数字币', '稳定币', '人民币']);
    expect(buttons.map(node => node.props['aria-pressed'])).toEqual(['all', 'digital', 'stable', 'cny'].map(code => code === category));
    expect(buttons.every(node => node.props.type === 'button' && node.props.className.includes('min-w-0'))).toBe(true);
    const group = required(elements(test.tree).find(node => node.props.role === 'group'), 'four category group');
    expect(group.props.className).toContain('grid-cols-4');
    expect(group.props['aria-label']).toBe('全局流水资产分类');
    expect(test.select.props.value).toBe(filter.assetCode);
    expect(test.select.props.className).toContain('min-w-0');
    const label = required(elements(test.tree).find(node => node.type === 'label'), 'currency label');
    expect(label.props.htmlFor).toBe(test.select.props.id);
    const codes = getWalletAssetFilterCodes(['NEWCOIN']);
    expect(elements(test.select).filter(node => node.type === 'option').map(node => node.props.value))
      .toEqual(['all', ...codes.filter(code => matchesWalletAssetFilter(code, category))]);
    buttons.forEach((button, index) => {
      button.props.onClick();
      expect(test.onChange).toHaveBeenLastCalledWith({ category: ['all', 'digital', 'stable', 'cny'][index], assetCode: 'all' });
    });
    const chosen = category === 'stable' ? 'USDT' : category === 'cny' ? 'CNY' : 'NEWCOIN';
    test.select.props.onChange({ target: { value: chosen } });
    expect(test.onChange).toHaveBeenLastCalledWith({ category, assetCode: chosen });
    expect(JSON.stringify(filter)).toBe(before);
  });
  it('空目录仍只有规范 all 选项；当前选中的历史未知币空响应后仍保留', () => {
    const empty = renderFilters(all, []);
    expect(elements(empty.select).filter(node => node.type === 'option').map(node => node.props.value)).toEqual(['all']);
    empty.select.props.onChange({ target: { value: 'all' } });
    expect(empty.onChange).toHaveBeenCalledWith(all);
    const bindings = { ...helpers, adjUserList: [], adjLogItems: [],
      adjGlobalAssetFilter: { category: 'digital', assetCode: 'HISTORICAL' },
      adjBalanceAssetFilter: { category: 'digital', assetCode: 'HELD-UNKNOWN' } };
    const codes = expression<string[]>('adjWalletAssetFilterCodes', bindings);
    expect(codes).toContain('HISTORICAL'); expect(codes).toContain('HELD-UNKNOWN');
    expect(elements(renderFilters(bindings.adjGlobalAssetFilter as Filter, codes).select)
      .filter(node => node.type === 'option').map(node => node.props.value)).toContain('HISTORICAL');
    const actual = expression<string[]>('adjWalletAssetFilterCodes', { ...bindings,
      adjUserList: [{ multiAssetBalances: [{ assetCode: 'HELD' }] }], adjLogItems: [{ currency: 'FLOW' }] });
    expect(actual).toContain('HELD'); expect(actual).toContain('FLOW');
    expect(actual).not.toContain('PHANTOM');
  });
  it('global/balances两个state默认all且独立；global回page1，不触及草稿/已选人/用户流水/余额筛选/资金', () => {
    expect(stateInitial('adjGlobalAssetFilter')).toEqual(all);
    expect(stateInitial('adjBalanceAssetFilter')).toEqual(all);
    const setterNames = nodes(ast, ts.isVariableDeclaration).filter(node => ts.isArrayBindingPattern(node.name))
      .map(node => (node.name as ts.ArrayBindingPattern).elements[1]?.getText(ast)).filter(Boolean) as string[];
    const setters = Object.fromEntries(setterNames.map(name => [name, vi.fn()]));
    const global = filterInstance('adj-global-flow');
    const balance = filterInstance('adj-global-balance');
    const selected = deepFreeze({ id: 28 });
    const input = deepFreeze({ category: 'digital', assetCode: 'ETH' });
    const forbidden = vi.fn(() => { throw Error('Forbidden funds/network operation'); });
    const poison: unknown = new Proxy(forbidden, { get: () => poison });
    const mutationNames = nodes(ast, ts.isVariableDeclaration).filter(node => ts.isIdentifier(node.name)
      && /Mutation$/.test(node.name.text)).map(node => node.name.getText(ast));
    const bindings = { ...setters, adjSelectedUser: selected, adjCurrency: 'CNY', adjAmount: '0.00000001',
      adjNote: '草稿', adjUserHistoryTab: 'cny', adjAssetFlowScope: { userId: 28, assetCode: 'SOL', page: 7 },
      adjBalanceAssetFilter: { category: 'cny', assetCode: 'CNY' }, ...Object.fromEntries(mutationNames.map(name => [name, poison])),
      handleAdjSubmit: poison, fetch: poison, mtrpc: poison, window: poison };
    evaluate<(filter: unknown) => void>(`(${attrExpression(global, 'onChange').getText(ast)});`, bindings)(input);
    expect(setters.setAdjGlobalAssetFilter).toHaveBeenCalledWith(input);
    expect(setters.setAdjLogPage).toHaveBeenCalledWith(1);
    for (const [name, setter] of Object.entries(setters)) if (!['setAdjGlobalAssetFilter', 'setAdjLogPage'].includes(name))
      expect(setter, name).not.toHaveBeenCalled();
    expect(forbidden).not.toHaveBeenCalled();
    expect(selected).toEqual({ id: 28 }); expect(input).toEqual({ category: 'digital', assetCode: 'ETH' });
    expect(attrExpression(balance, 'onChange').getText(ast)).toBe('setAdjBalanceAssetFilter');
  });
});

describe('全局流水生产useQuery接线、最近用户隔离和真实JSX状态', () => {
  const queries = nodes(ast, ts.isCallExpression).filter(node => node.expression.getText(ast) === 'mtrpc.adminUser.walletGlobalHistory.useQuery');
  const globalQuery = required(queries.find(node => node.arguments[0].getText(ast).includes('page: adjLogPage')), 'global query');
  const recentQuery = required(queries.find(node => node.arguments[0].getText(ast).includes('pageSize: 50')), 'recent query');
  it.each([
    all, { category: 'digital', assetCode: 'all' }, { category: 'stable', assetCode: 'USDT' },
    { category: 'cny', assetCode: 'all' }, { category: 'all', assetCode: 'ETH' },
    { category: 'digital', assetCode: 'NEWCOIN' },
  ] as Filter[])('$category/$assetCode 精确传分类单币，保留日期关键词20条/统一余额/全事件和门控', filter => {
    const useQuery = vi.fn(() => ({}));
    for (const mainTab of ['adjust', 'records', 'monitor']) for (const flow of ['user', 'global', 'balances']) {
      const bindings = { mtrpc: { adminUser: { walletGlobalHistory: { useQuery } } }, adjGlobalAssetFilter: filter,
        mainTab, adjFlowTab: flow, adjLogPage: 7, ADJ_PAGE_SIZE: expression('ADJ_PAGE_SIZE'),
        adjGlobalFlowKeyword: '  退款  ', adjGlobalDateRange: { startDate: '2026-10-01', endDate: '2026-10-31' } };
      evaluate(`(${globalQuery.getText(ast)});`, bindings);
      expect(useQuery).toHaveBeenLastCalledWith({ page: 7, pageSize: 20, includeUnifiedBalance: true,
        includeAllWalletEvents: true, keyword: '退款', startDate: '2026-10-01', endDate: '2026-10-31',
        ...(filter.category !== 'all' ? { assetCategory: filter.category } : {}),
        ...(filter.assetCode !== 'all' ? { assetCode: filter.assetCode } : {}) },
      { enabled: mainTab === 'adjust' && flow === 'global', staleTime: 30_000, refetchOnWindowFocus: false });
      evaluate(`(${recentQuery.getText(ast)});`, bindings);
      expect(useQuery).toHaveBeenLastCalledWith({ page: 1, pageSize: 50, includeAllWalletEvents: true },
        { enabled: mainTab === 'adjust', staleTime: 30_000, refetchOnWindowFocus: false });
    }
  });
  it('空关键词日期/all不额外发送过滤字段；日期/关键字/分类只影响全局，不重写当前用户查询', () => {
    const useQuery = vi.fn((..._args: unknown[]) => ({}));
    evaluate(`(${globalQuery.getText(ast)});`, { mtrpc: { adminUser: { walletGlobalHistory: { useQuery } } },
      mainTab: 'adjust', adjFlowTab: 'global', adjLogPage: 1, ADJ_PAGE_SIZE: 20,
      adjGlobalAssetFilter: all, adjGlobalFlowKeyword: '   ', adjGlobalDateRange: {} });
    expect(useQuery.mock.calls[0][0]).toEqual({ page: 1, pageSize: 20, includeUnifiedBalance: true, includeAllWalletEvents: true });
    for (const name of ['adjMultiAssetHistoryQuery', 'adjUserTrendQuery', 'adjFundingFlowKey']) {
      const ids = nodes(initializer(name), ts.isIdentifier).map(node => node.text);
      expect(ids).not.toContain('adjGlobalAssetFilter'); expect(ids).not.toContain('adjBalanceAssetFilter');
    }
    expect(nodes(recentQuery, ts.isIdentifier).map(node => node.text)).not.toContain('adjGlobalAssetFilter');
  });
  it('真实清除回调同时清币种、关键词、日期并page1；非本视图state不动', () => {
    const test = renderGlobal();
    const filters = required(elements(test.tree).find(node => node.type === 'LedgerFlowFilters'), 'global date/keyword filters');
    filters.props.onClear();
    expect(test.bindings.setAdjGlobalAssetFilter).toHaveBeenCalledWith(all);
    expect(test.bindings.setAdjGlobalFlowKeyword).toHaveBeenCalledWith('');
    expect(test.bindings.setAdjGlobalFlowDatePreset).toHaveBeenCalledWith('all');
    expect(test.bindings.setAdjGlobalFlowCustomStart).toHaveBeenCalledWith('');
    expect(test.bindings.setAdjGlobalFlowCustomEnd).toHaveBeenCalledWith('');
    expect(test.bindings.setAdjLogPage).toHaveBeenCalledWith(1);
  });
  it('失败/读取中/原始空/筛选空提示保留；重试仅只读refetch，分页维持边界', () => {
    expect(text(renderGlobal().tree)).toContain('暂无钱包资金流水');
    for (const overrides of [{ adjGlobalAssetFilter: { category: 'digital', assetCode: 'all' } },
      { adjGlobalAssetFilter: { category: 'all', assetCode: 'ETH' } }, { adjGlobalFlowKeyword: '退款' },
      { adjGlobalFlowDatePreset: 'custom' }]) expect(text(renderGlobal(overrides).tree)).toContain('未找到符合条件的流水');
    expect(text(renderGlobal({ adjGlobalLogLoading: true }).tree)).toContain('全局流水加载中');
    const failed = renderGlobal({ adjGlobalLogError: new Error('offline'), adjLogTotalPages: 3, adjLogPage: 1 });
    expect(text(failed.tree)).toContain('流水暂时加载失败');
    const retry = required(elements(failed.tree).find(node => node.type === 'button' && text(node) === '重新加载'), 'readonly retry');
    retry.props.onClick(); expect(failed.bindings.refetchAdjGlobal).toHaveBeenCalledOnce();
    expect(failed.bindings.setAdjGlobalAssetFilter).not.toHaveBeenCalled();
    const previous = required(elements(failed.tree).find(node => node.type === 'button' && text(node) === '上一页'), 'previous');
    const next = required(elements(failed.tree).find(node => node.type === 'button' && text(node) === '下一页'), 'next');
    expect(previous.props.disabled).toBe(true); expect(next.props.disabled).toBe(false);
    next.props.onClick();
    expect(failed.bindings.setAdjLogPage.mock.calls[0][0](1)).toBe(2);
  });
});

describe('真实余额行/隐藏零用户/估值/全球汇总：分类与搜索AND，冻结不扣总持有', () => {
  it.each([
    { filter: all, codes: ['USDT', 'CNY', 'ETH', 'SOL', 'BTC', 'MSTR', 'NEWCOIN', 'ODD'], u: userAllU, ids: [28, 29, 30, 31] },
    { filter: { category: 'digital', assetCode: 'all' } as Filter, codes: ['ETH', 'SOL', 'BTC', 'MSTR', 'NEWCOIN', 'ODD'],
      u: 3 * 10 + (-2) * 3 + 5 * 2 + (-0.5) * 20, ids: [28, 31] },
    { filter: { category: 'stable', assetCode: 'all' } as Filter, codes: ['USDT'], u: 100, ids: [28, 30] },
    { filter: { category: 'cny', assetCode: 'all' } as Filter, codes: ['CNY'], u: 70 / 7, ids: [28, 29] },
    { filter: { category: 'digital', assetCode: 'ETH' } as Filter, codes: ['ETH'], u: 3 * 10, ids: [28, 31] },
    { filter: { category: 'all', assetCode: 'NEWCOIN' } as Filter, codes: ['NEWCOIN'], u: 0, ids: [28] },
    { filter: { category: 'digital', assetCode: 'ODD' } as Filter, codes: ['ODD'], u: 0, ids: [28] },
    { filter: { category: 'digital', assetCode: 'MSTR' } as Filter, codes: ['MSTR'], u: (-0.5) * 20, ids: [28] },
  ])('$filter.category/$filter.assetCode仅所选真实行和估值，冻结only/负值/未知币不丢且源值不变', ({ filter, codes, u, ids }) => {
    const before = JSON.stringify(users);
    const runtime = balances(filter);
    const rows = selectedRows(runtime);
    expect(rows.map(row => row.assetCode).sort()).toEqual([...codes].sort());
    expect(runtime.getUserWalletTotalValuation(users[0]).totalU).toBeCloseTo(u, 10);
    expect(runtime.getUserWalletTotalValuation(users[0]).totalCny).toBeCloseTo(u * 7, 10);
    expect(runtime.adjFilteredBalanceUsers.map((user: any) => user.id)).toEqual(ids);
    expect(runtime.adjAllWalletValuation.totalU).toBeCloseTo(users.reduce((sum, user) => sum + runtime.getUserWalletTotalValuation(user).totalU, 0), 10);
    const tree = renderBalances(runtime);
    expect(elements(tree).filter(node => typeof node.props.key === 'number').map(node => node.props.key).sort()).toEqual([...ids].sort());
    const card = required(elements(tree).find(node => node.props.key === 28), 'Ocean user card');
    expect(elements(card).filter(node => typeof node.props.key === 'string').map(node => node.props.key).sort()).toEqual([...codes].sort());
    const expectedText = runtime.formatWalletAmount(u, 2);
    expect(text(card)).toContain(`≈ ${expectedText}`);
    expect(JSON.stringify(users)).toBe(before);
  });
  it('冻结-only BTC/ETH及0总额但有冻结的ODD仍持有，兼容USDT/CNY行不双计，无币种幻造余额', () => {
    const runtime = balances();
    expect(runtime.getFundingBalanceBreakdown(users[0], 'USDT')).toEqual({ total: 100, available: 80, frozen: 20 });
    expect(runtime.getFundingBalanceBreakdown(users[0], 'CNY')).toEqual({ total: 70, available: 56, frozen: 14 });
    const rows = selectedRows(runtime);
    expect(rows.find(row => row.assetCode === 'ETH')).toMatchObject({ total: 3, frozen: 1 });
    expect(rows.find(row => row.assetCode === 'BTC')).toMatchObject({ total: 5, frozen: 5 });
    expect(rows.find(row => row.assetCode === 'ODD')).toMatchObject({ total: 0, frozen: 2 });
    expect(rows.filter(row => row.assetCode === 'USDT')).toHaveLength(1);
    expect(rows.filter(row => row.assetCode === 'CNY')).toHaveLength(1);
    expect(runtime.adjMultiAssetTotals).not.toHaveProperty('USDT');
    expect(runtime.adjMultiAssetTotals).not.toHaveProperty('CNY');
    expect(runtime.adjBalanceTotals).toEqual({ userCount: users.length, usdt: 100 + (-5), cny: 70 + 140 });
    expect(runtime.getUserWalletTotalValuation(users[0]).totalU).toBeCloseTo(userAllU, 10);
    const noHoldings = balances({ category: 'digital', assetCode: 'NEWCOIN' }, { users: [users[1]], hideUsers: false });
    expect(selectedRows(noHoldings, users[1])).toEqual([]);
  });
  it('用户搜索与所选币种AND；昵称/用户名/ID可搜，其他币有余额不能保留当前0资产用户', () => {
    const eth: Filter = { category: 'digital', assetCode: 'ETH' };
    for (const search of ['Ocean', ' OCEAN ', '28']) expect(balances(eth, { search }).adjFilteredBalanceUsers.map((u: any) => u.id)).toEqual([28]);
    for (const search of ['人民币', 'cny-only', '29', 'stable-only']) expect(balances(eth, { search }).adjFilteredBalanceUsers).toEqual([]);
    expect(balances(eth, { search: 'cny-only', hideUsers: false }).adjFilteredBalanceUsers.map((u: any) => u.id)).toEqual([29]);
    const cny = balances({ category: 'cny', assetCode: 'all' }, { search: 'Ocean' });
    expect(cny.adjFilteredBalanceUsers.map((u: any) => u.id)).toEqual([28]);
    expect(cny.adjAllWalletValuation.totalU).toBe((70 + 140) / 7);
    expect(cny.getUserWalletTotalValuation(users[0]).totalU).toBe(70 / 7);
  });
  it('搜索仅影响用户列表，不能把全部用户汇总悄悄降成部分总额；未知非行情币提示严格按筛选', () => {
    for (const filter of [all, { category: 'digital', assetCode: 'ETH' } as Filter, { category: 'stable', assetCode: 'all' } as Filter]) {
      const full = balances(filter);
      const searched = balances(filter, { search: 'Ocean' });
      expect(searched.adjAllWalletValuation).toEqual(full.adjAllWalletValuation);
      expect(searched.adjBalanceTotals).toEqual(full.adjBalanceTotals);
      expect(searched.adjMultiAssetValuations).toEqual(full.adjMultiAssetValuations);
      expect(searched.adjMultiAssetFrozenTotals).toEqual(full.adjMultiAssetFrozenTotals);
      expect(searched.adjFilteredBalanceUsers).toHaveLength(1);
    }
    const unknown = balances({ category: 'digital', assetCode: 'NEWCOIN' });
    expect(unknown.getUserWalletTotalValuation(users[0]).unpricedAssets).toEqual(['NEWCOIN']);
    expect(unknown.adjAllWalletValuation.unpricedAssets).toEqual(['NEWCOIN']);
    expect(unknown.adjMultiAssetValuations).toEqual([{ assetCode: 'NEWCOIN', total: 4, frozen: 4, priceU: null, valueU: null }]);
    expect(text(renderBalances(unknown))).toContain('未计入总估值：NEWCOIN');
    expect(text(renderBalances(unknown))).toContain('未取得行情，暂未计入：NEWCOIN');
    expect(text(renderBalances(unknown))).toContain('担保冻结 4');
    const eth = balances({ category: 'digital', assetCode: 'ETH' });
    expect(eth.adjAllWalletValuation.unpricedAssets).toEqual([]);
    expect(eth.adjMultiAssetValuations).toEqual([{ assetCode: 'ETH', total: 3 + 2, frozen: 1 + 2, priceU: 10, valueU: (3 + 2) * 10 }]);
    expect(text(renderBalances(eth))).not.toContain('NEWCOIN');
    const stableTree = renderBalances(balances({ category: 'stable', assetCode: 'all' }));
    expect(text(stableTree)).toContain('全部用户 USDT 总余额');
    expect(text(stableTree)).not.toContain('全部用户 CNY 总余额');
    expect(text(stableTree)).not.toContain('独立数字资产总持有');
  });
  it('隐藏0币种关闭仍只显示当前分类；无匹配/无非零持仓/无行情及汇率提示保留', () => {
    const allDigital = balances({ category: 'digital', assetCode: 'all' }, { hideTypes: false });
    expect(selectedRows(allDigital).map(row => row.assetCode)).not.toContain('USDT');
    expect(selectedRows(allDigital).map(row => row.assetCode)).not.toContain('CNY');
    expect(selectedRows(allDigital).length).toBeGreaterThan(selectedRows(balances({ category: 'digital', assetCode: 'all' })).length);
    expect(text(renderBalances(balances(all, { search: 'no-such-user' })))).toContain('未找到匹配用户');
    expect(text(renderBalances(balances(all, { users: [] })))).toContain('用户余额加载中');
    expect(text(renderBalances(balances({ category: 'digital', assetCode: 'NEWCOIN' }, { users: [users[1]], hideUsers: false })))).toContain('暂无非零资产');
    expect(text(renderBalances(balances(all, { rate: 0, prices: {} })))).toContain('行情或 USDT 汇率暂未就绪');
    const trend = required(elements(renderBalances(balances({ category: 'digital', assetCode: 'ETH' })))
      .find(node => node.type === 'WalletTotalAssetTrendChart'), 'global trend filter wiring');
    expect(trend.props.assetFilter).toEqual({ category: 'digital', assetCode: 'ETH' });
  });
});

describe('真实总资产走势图：current及series相同筛选，不能混入其他币', () => {
  it.each([
    { filter: all, current: 100 + 70 / 7 + 3 * 10 + 2 * 3 + 5 * 2, first: 50 + 35 / 7 + 1 * 10 + 1 * 3 + 2 * 2 },
    { filter: { category: 'digital', assetCode: 'all' } as Filter, current: 3 * 10 + 2 * 3 + 5 * 2, first: 1 * 10 + 1 * 3 + 2 * 2 },
    { filter: { category: 'stable', assetCode: 'all' } as Filter, current: 100, first: 50 },
    { filter: { category: 'cny', assetCode: 'all' } as Filter, current: 70 / 7, first: 35 / 7 },
    { filter: { category: 'digital', assetCode: 'ETH' } as Filter, current: 3 * 10, first: 1 * 10 },
    { filter: { category: 'all', assetCode: 'BTC' } as Filter, current: 5 * 2, first: 2 * 2 },
    { filter: { category: 'digital', assetCode: 'NEWCOIN' } as Filter, current: 0, first: 0 },
  ])('$filter.category/$filter.assetCode current与每个生产柱高和所选估值一致，输入不变', ({ filter, current, first }) => {
    const test = chartRuntime(filter);
    const before = JSON.stringify(test.params);
    expect(test.values.currentTotalAssetU).toBeCloseTo(current, 10);
    expect(test.values.series[0].totalAssetU).toBeCloseTo(first, 10);
    expect(test.values.periodChange).toBeCloseTo(current - first, 10);
    const bar = required(elements(test.tree).find(node => node.type === 'BarChart'), 'production series');
    expect(bar.props.data).toEqual(test.values.series);
    expect(text(test.tree)).toContain(`≈ ${Number(current).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (!matchesWalletAssetFilter('USDT', filter.category, filter.assetCode)) {
      expect(test.values.currentUsdt).toBe(0); expect(test.values.series[0].actualUsdt).toBe(0);
      expect(text(test.tree)).not.toContain('实际 USDT');
    }
    if (!matchesWalletAssetFilter('ETH', filter.category, filter.assetCode)) {
      expect(test.values.currentEthU).toBe(0); expect(test.values.series[0].ethU).toBe(0);
    }
    if (!matchesWalletAssetFilter('SOL', filter.category, filter.assetCode)) {
      expect(test.values.currentSolU).toBe(0); expect(test.values.series[0].solU).toBe(0);
    }
    test.render(test.params);
    expect(JSON.stringify(test.params)).toBe(before);
  });
  it('assetFilter可选默认all；缺少multiAssets使用真实fallback仍只计所选币', () => {
    const full = chartRuntime(); expect(full.values.currentTotalAssetU).toBe(chartRuntime(all).values.currentTotalAssetU);
    const trend = deepFreeze({ current: { usdt: 100, cny: 70 }, series: [{ date: '2026-11-22', usdt: 50, cny: 35 }] });
    const test = chartRuntime({ category: 'digital', assetCode: 'ETH' }, trend as any);
    expect(test.values.currentTotalAssetU).toBe(3 * 10);
    expect(test.values.series[0].totalAssetU).toBe(3 * 10);
    expect(test.values.currentUsdt).toBe(0); expect(test.values.currentSolU).toBe(0);
    expect(test.values.currentOtherAssetsU).toBe(0);
  });
  it('已报价非ETH/SOL负持仓的current与series不能钳制成0，必须与所选余额估值一致', () => {
    const filter: Filter = { category: 'digital', assetCode: 'MSTR' };
    const balance = balances(filter, { users: [users[0]] });
    const trend = deepFreeze({ current: { usdt: 100, cny: 70, multiAssets: { MSTR: -0.5, ETH: 3 } },
      series: [{ date: '2026-11-22', usdt: 50, cny: 35, multiAssets: { MSTR: -1, ETH: 1 } }] });
    const test = chartRuntime(filter, trend as any);
    expect(test.values.currentTotalAssetU).toBe(balance.adjAllWalletValuation.totalU);
    expect(test.values.series[0].totalAssetU).toBe((-1) * prices.MSTR);
    expect(test.values.currentEthU).toBe(0);
  });
  it.each(['all', 'stable', 'cny'] as const)('%s 走势multiAssets基础币兼容行不得重复计入已独立展示的USDT/CNY', category => {
    const trend = deepFreeze({ current: { usdt: 100, cny: 70, multiAssets: { USDT: 1100, CNY: 1100, ETH: 3 } },
      series: [{ date: '2026-11-22', usdt: 50, cny: 35, multiAssets: { USDT: 1100, CNY: 1100, ETH: 1 } }] });
    const test = chartRuntime({ category, assetCode: 'all' }, trend as any);
    const current = category === 'stable' ? 100 : category === 'cny' ? 70 / 7 : 100 + 70 / 7 + 3 * prices.ETH;
    const first = category === 'stable' ? 50 : category === 'cny' ? 35 / 7 : 50 + 35 / 7 + prices.ETH;
    expect(test.values.currentTotalAssetU).toBe(current);
    expect(test.values.series[0].totalAssetU).toBe(first);
  });
  it('空走势仍保留明确empty提示，不假造series', () => {
    const test = chartRuntime(all, { current: { usdt: 0, cny: 0, multiAssets: {} }, series: [] } as any);
    expect(test.values.series).toEqual([]);
    expect(text(test.tree)).toContain('暂无可用于计算走势的资金记录');
    expect(elements(test.tree).some(node => node.type === 'BarChart')).toBe(false);
  });
});
