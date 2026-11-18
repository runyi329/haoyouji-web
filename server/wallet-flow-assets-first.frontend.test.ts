import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AI_WALLET_SETTLEMENT_ASSETS } from '../shared/ai-wallet-assets';
import { getWalletFlowCategory, getWalletFundingCurrency } from '../client/src/lib/walletFlowPresentation';

// 离线前端回归：只读页面文本，从生产 AST 抽取真实表达式、effect、JSX 和回调。
// 不 import 页面/路由/DB，不加载浏览器，不执行资金提交；查询、缓存、toast 仅为 spy。
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
  return required(nodes(ast, ts.isVariableDeclaration).find(node => ts.isIdentifier(node.name)
    && node.name.text === name)?.initializer, name);
}
function evaluate<T>(source: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(source, { fileName: 'offline-assets-first.tsx', compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
  } });
  // VM 无 require、process 或生产 API；超时避免意外执行无限循环。
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
function expression<T>(name: string, bindings: Record<string, unknown> = {}): T {
  return evaluate<T>(`(${initializer(name).getText(ast)});`, bindings);
}
function contains(outer: ts.Node, inner: ts.Node) { return outer.pos <= inner.pos && outer.end >= inner.end; }
function attribute(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string) {
  const properties = ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
  return properties.find((value): value is ts.JsxAttribute => ts.isJsxAttribute(value) && value.name.getText(ast) === name);
}
function smallestElement(root: ts.Node, predicate: (node: ts.JsxElement) => boolean, label: string) {
  return required(nodes(root, ts.isJsxElement).filter(predicate)
    .sort((a, b) => (a.end - a.pos) - (b.end - b.pos))[0], label);
}
function gate(value: string) {
  return required(nodes(ast, ts.isJsxExpression).find(node => node.expression && ts.isBinaryExpression(node.expression)
    && node.expression.left.getText(ast) === `adjFlowTab === "${value}"`)?.expression, `${value} flow gate`);
}
function callback(root: ts.Node, name: string) {
  const attr = required(nodes(root, ts.isJsxAttribute).find(node => node.name.getText(ast) === name)?.initializer, name);
  if (!ts.isJsxExpression(attr) || !attr.expression) throw new Error(`Missing JSX callback: ${name}`);
  return attr.expression;
}
const summary = required(nodes(ast, ts.isJsxElement).find(node =>
  attribute(node, 'ref')?.initializer?.getText(ast) === '{adjSelectedUserExportRef}'), 'selected user asset card');
const userGate = gate('user');
const fundingPanel = smallestElement(userGate, node => attribute(node, 'role')?.initializer?.getText(ast) === '"tabpanel"'
  && node.getText(ast).includes('adjFilteredHistory'), 'funding flow panel');
const digitalPanel = smallestElement(userGate, node => attribute(node, 'id')?.initializer?.getText(ast) === '"adj-digital-history-panel"', 'digital flow panel');
type VNode = { type: unknown; props: Record<string, unknown>; children: unknown[] };
const React = { Fragment: 'Fragment', createElement: (type: unknown, props: Record<string, unknown> | null,
  ...children: unknown[]): VNode => ({ type, props: props ?? {}, children }) };
function isVNode(value: unknown): value is VNode {
  return !!value && typeof value === 'object' && 'children' in value && 'type' in value;
}
function treeNodes(tree: unknown): VNode[] {
  if (Array.isArray(tree)) return tree.flatMap(treeNodes);
  if (!isVNode(tree)) return [];
  return [tree, ...tree.children.flatMap(treeNodes)];
}
function text(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (isVNode(tree)) return tree.children.map(text).join('');
  return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
}
function effectUsing(identifier: string) {
  return nodes(ast, ts.isCallExpression).filter(call => ts.isIdentifier(call.expression)
    && call.expression.text === 'useEffect' && nodes(call.arguments[0], ts.isIdentifier).some(node => node.text === identifier));
}
function applyEffect(call: ts.CallExpression, bindings: Record<string, unknown>) {
  return evaluate<() => void>(`(${call.arguments[0].getText(ast)});`, bindings)();
}
function balanceRuntime(user: Record<string, unknown>, snapshot?: Record<string, unknown>, prices: Record<string, number> = { ETH: 10 }, rate = 7) {
  const getFundingBalanceBreakdown = expression<(user: unknown, code: string) => Record<string, number>>('getFundingBalanceBreakdown');
  const getMultiAssetBreakdown = expression<(asset: unknown) => Record<string, number>>('getMultiAssetBreakdown');
  const adjSelectedWalletUser = expression<Record<string, unknown>>('adjSelectedWalletUser', {
    adjSelectedUser: user, adjWalletSnapshotQuery: { data: snapshot }, adjAssetFlowUserId: Number(user.id),
  });
  const bindings = { adjSelectedWalletUser, getFundingBalanceBreakdown, getMultiAssetBreakdown };
  const adjSelectedUsdtBalance = expression<Record<string, number>>('adjSelectedUsdtBalance', bindings);
  const adjSelectedCnyBalance = expression<Record<string, number>>('adjSelectedCnyBalance', bindings);
  const adjWalletPricesQuery = { data: { prices, usdtCnyRate: rate }, isLoading: false };
  const adjSelectedWalletValuation = expression<Record<string, any>>('adjSelectedWalletValuation', {
    ...bindings, adjSelectedUsdtBalance, adjSelectedCnyBalance, adjWalletPricesQuery,
  });
  return { ...bindings, adjSelectedUsdtBalance, adjSelectedCnyBalance, adjWalletPricesQuery, adjSelectedWalletValuation,
    formatWalletAmount: expression('formatWalletAmount') };
}

const selected = Object.freeze({ id: 28, name: '资产用户', username: 'wallet-user', usdtBalance: 100,
  usdtFrozen: 20, cnyBalance: 70, cnyFrozen: 14,
  multiAssetBalances: Object.freeze([
    Object.freeze({ assetCode: 'ETH', availableBalance: '2', frozenBalance: '1', totalBalance: '3' }),
    Object.freeze({ assetCode: 'NEWCOIN', availableBalance: '0', frozenBalance: '4', totalBalance: '4' }),
  ]) });

describe('完整资产卡先于调账参数，余额走势独立置于当前用户流水及分页之后', () => {
  it('唯一完整资产卡位于用户选择之后、币种/金额/备注/确认按钮之前，不属于任何流水tab', () => {
    expect(nodes(ast, ts.isJsxElement).filter(node => attribute(node, 'ref')?.initializer?.getText(ast)
      === '{adjSelectedUserExportRef}')).toHaveLength(1);
    const currency = required(nodes(ast, ts.isJsxElement).find(node => node.openingElement.tagName.getText(ast) === 'select'
      && attribute(node, 'value')?.initializer?.getText(ast) === '{adjCurrency}'), 'manual currency select');
    const amount = required(nodes(ast, ts.isJsxSelfClosingElement).find(node => attribute(node, 'value')?.initializer?.getText(ast)
      === '{adjAmount}'), 'manual amount input');
    const note = required(nodes(ast, ts.isJsxSelfClosingElement).find(node => attribute(node, 'value')?.initializer?.getText(ast)
      === '{adjNote}'), 'manual note input');
    const submit = required(nodes(ast, ts.isJsxElement).find(node => attribute(node, 'onClick')?.initializer?.getText(ast)
      === '{handleAdjSubmit}'), 'manual submit');
    const form = smallestElement(ast, node => contains(node, submit) && contains(node, currency), 'manual form');
    const userLabel = required(nodes(form, ts.isJsxText).find(value => value.text.trim() === '调账用户'), 'user selector label');
    expect(userLabel.end).toBeLessThan(summary.pos);
    expect(attribute(summary, 'data-wallet-selected-assets')?.initializer?.getText(ast)).toBe('"true"');
    for (const control of [currency, amount, note, submit]) expect(summary.end).toBeLessThan(control.pos);
    for (const tab of ['user', 'global', 'balances']) expect(contains(gate(tab), summary)).toBe(false);
    const guards = nodes(ast, ts.isJsxExpression).filter(node => contains(node, summary)).map(node => node.getText(ast));
    expect(guards.some(value => /adjSelectedUser\s*(?:&&|\?)/.test(value))).toBe(true);
  });

  it('用户走势不在资产卡内，仍受当前用户tab及选择用户门控，置于两个流水panel（含分页）之后', () => {
    const charts = nodes(ast, ts.isJsxSelfClosingElement).filter(node => node.tagName.getText(ast) === 'WalletBalanceTrendChart');
    expect(charts).toHaveLength(1);
    const trend = charts[0];
    expect(contains(summary, trend)).toBe(false);
    expect(contains(userGate, trend)).toBe(true);
    for (const panel of [digitalPanel, fundingPanel]) {
      expect(panel.end).toBeLessThan(trend.pos);
      expect(panel.getText(ast)).toContain('上一页');
      expect(panel.getText(ast)).toContain('下一页');
    }
    expect(trend.getText(ast)).toContain('trend={adjUserTrendQuery.data}');
    expect(trend.getText(ast)).toContain('onDaysChange={setAdjUserTrendDays}');
    const onRetry = evaluate<() => void>(`(${callback(trend, 'onRetry').getText(ast)});`,
      { adjUserTrendQuery: { refetch: vi.fn() } });
    expect(onRetry).toBeTypeOf('function');
  });

  it('真实资产卡展示全部已持有数字币（含冻结-only未知币）、USDT/CNY总额及可用/冻结和统一总估值', () => {
    const runtime = balanceRuntime(selected);
    const before = JSON.stringify(selected);
    const tree = evaluate<VNode>(`(${summary.getText(ast)});`, { React, ...runtime, adjSelectedUser: selected,
      adjSelectedUserExportRef: { current: null }, OrderCardImageDownload: 'OrderCardImageDownload',
      clearAdjUser: vi.fn(), adjWalletSnapshotQuery: { isFetching: false, isError: false } });
    const content = text(tree);
    for (const label of ['已持有数字资产', 'ETH', 'NEWCOIN', '可用', '冻结', '约合 USDT', '约合人民币', '资产总价值'])
      expect(content).toContain(label);
    expect(content).toContain('100.00');
    expect(content).toContain('80.00');
    expect(content).toContain('20.00');
    expect(content).toContain('140.00');
    expect(content).toContain('980.00');
    expect(content).toMatch(/约合人民币≈\s*980\.00\s*元/);
    expect(content).toContain('暂未计入：NEWCOIN');
    expect(treeNodes(tree).filter(node => node.props.key != null).map(node => node.props.key)).toEqual(['ETH', 'NEWCOIN']);
    const download = required(treeNodes(tree).find(node => node.type === 'OrderCardImageDownload'), 'asset card image export');
    expect(download.props.targetRef).toEqual({ current: null });
    expect(download.props.captureFullContent).toBe(true);
    expect(JSON.stringify(selected)).toBe(before);
  });

  it('后台同步不显示闪烁提示，实际失败仍保留警告与已有资产，不伪装为无余额', () => {
    const tree = evaluate<VNode>(`(${summary.getText(ast)});`, { React, ...balanceRuntime(selected), adjSelectedUser: selected,
      adjSelectedUserExportRef: {}, OrderCardImageDownload: 'OrderCardImageDownload', clearAdjUser: vi.fn(),
      adjWalletSnapshotQuery: { isFetching: true, isError: true } });
    expect(text(tree)).not.toContain('余额与担保同步中');
    expect(text(tree)).toContain('更新失败，暂保留已显示数据');
    expect(text(tree)).toContain('NEWCOIN');
    expect(text(tree)).toContain('100.00');
  });

  it('相同数据的后台轮询开始或结束不增删节点，资产卡高度和内容不因isFetching跳动', () => {
    const bindings = { React, ...balanceRuntime(selected), adjSelectedUser: selected,
      adjSelectedUserExportRef: { current: null }, OrderCardImageDownload: 'OrderCardImageDownload', clearAdjUser: vi.fn() };
    const render = (isFetching: boolean) => evaluate<VNode>(`(${summary.getText(ast)});`, {
      ...bindings, adjWalletSnapshotQuery: { isFetching, isError: false },
    });
    const idle = render(false);
    expect(render(true)).toEqual(idle);
    expect(render(false)).toEqual(idle);
    expect(summary.getText(ast)).not.toContain('adjWalletSnapshotQuery.isFetching');
    const query = initializer('adjWalletSnapshotQuery') as ts.CallExpression;
    expect(query.arguments[1].getText(ast)).toContain('refetchInterval: 15_000');
  });

  it('同页当前用户、全局总额和用户汇总均采用数字后置人民币单位，不改货币余额或估值算法', () => {
    const valuations = nodes(ast, ts.isJsxExpression);
    for (const name of ['adjSelectedWalletValuation', 'adjAllWalletValuation']) {
      const value = required(valuations.find(node => node.expression?.getText(ast) === `formatWalletAmount(${name}.totalCny, 2)`), `${name} CNY display`);
      const parent = smallestElement(ast, node => contains(node, value), `${name} amount line`);
      expect(text(evaluate<VNode>(`(${parent.getText(ast)});`, { React, formatWalletAmount: (amount: number) => amount.toFixed(2),
        [name]: { totalCny: 980 } }))).toMatch(/^≈\s*980\.00\s*元$/);
    }
    expect(ast.text).toContain('`≈ ${formatWalletAmount(walletValuation.totalCny, 2)} 元`');
    expect(ast.text).toContain('¥{formatWalletAmount(adjSelectedCnyBalance.total, 2)}');
  });
});

describe('资产来源与后台快照同步维持原口径和用户隔离', () => {
  it('同ID新快照立即用于完整资产卡，不等待目录effect；不同用户旧快照不覆盖当前用户', () => {
    const fresh = { ...selected, id: '28', usdtBalance: 150, usdtFrozen: 30 };
    const same = balanceRuntime(selected, fresh);
    expect(same.adjSelectedUsdtBalance).toEqual({ total: 150, frozen: 30, available: 120 });
    const other = { ...fresh, id: 29, usdtBalance: 99999 };
    const isolated = balanceRuntime(selected, other);
    expect(isolated.adjSelectedWalletUser).toBe(selected);
    expect(isolated.adjSelectedUsdtBalance.total).toBe(100);
  });

  it('冻结不从总持有或USDT/CNY总估值扣除，未知/冻结-only资产仍提示未计入且不修改输入', () => {
    const runtime = balanceRuntime(selected);
    expect(runtime.adjSelectedUsdtBalance).toEqual({ total: 100, frozen: 20, available: 80 });
    expect(runtime.adjSelectedCnyBalance).toEqual({ total: 70, frozen: 14, available: 56 });
    expect(runtime.adjSelectedWalletValuation).toMatchObject({ totalU: 140, totalCny: 980, availableU: 108,
      frozenU: 32, unpricedAssets: ['NEWCOIN'] });
    expect(runtime.adjSelectedWalletValuation.availablePercent + runtime.adjSelectedWalletValuation.frozenPercent).toBe(100);
    expect(runtime.getMultiAssetBreakdown({ availableBalance: '2', frozenBalance: '1' })).toEqual({ available: 2, frozen: 1, total: 3 });
  });

  it('真实快照effect仅同ID更新目录对应行，不接受旧用户响应或清空目录', () => {
    const effect = required(effectUsing('freshUser')[0], 'snapshot sync effect');
    const before = [selected, { id: 29, usdtBalance: 77 }];
    const fresh = { ...selected, id: '28', usdtBalance: 150 };
    const setData = vi.fn((_key: unknown, update: (rows: unknown[] | undefined) => unknown) => {
      const after = update(before) as unknown[];
      expect(after).toEqual([fresh, before[1]]);
      expect(after[1]).toBe(before[1]);
      expect(update(undefined)).toBeUndefined();
    });
    const bindings = { adjAssetFlowUserId: 28, adjUtils: { adminUser: { list: { setData } } } };
    applyEffect(effect, { ...bindings, adjWalletSnapshotQuery: { data: fresh } });
    expect(setData).toHaveBeenCalledOnce();
    setData.mockClear();
    for (const data of [undefined, { ...fresh, id: 29 }]) applyEffect(effect, { ...bindings, adjWalletSnapshotQuery: { data } });
    expect(setData).not.toHaveBeenCalled();
    expect(before[0]).toBe(selected);
  });

  it('目录同步effect使用当前state用户ID，旧用户目录刷新不会换回当前已选用户', () => {
    const effect = required(effectUsing('setAdjSelectedUser').find(call => call.getText(ast).includes('adjUserList.find')), 'selected user sync effect');
    let current: unknown = { id: 29, usdtBalance: 88 };
    const second = current;
    const setAdjSelectedUser = vi.fn((update: (value: unknown) => unknown) => { current = update(current); });
    applyEffect(effect, { setAdjSelectedUser, adjUserList: [selected] });
    expect(current).toBe(second);
    const freshSecond = { id: '29', usdtBalance: 99 };
    applyEffect(effect, { setAdjSelectedUser, adjUserList: [selected, freshSecond] });
    expect(current).toBe(freshSecond);
    current = null;
    applyEffect(effect, { setAdjSelectedUser, adjUserList: [selected] });
    expect(current).toBeNull();
  });
});

describe('所有展示流水每页20条；数字资产与全局流水维持服务端分页接线', () => {
  it('展示分页常量严格20，数字币真实useQuery携带当前用户/页/币种及20，不使用旧100条截断', () => {
    const ADJ_PAGE_SIZE = expression<number>('ADJ_PAGE_SIZE');
    expect(ADJ_PAGE_SIZE).toBe(20);
    const useQuery = vi.fn(() => ({}));
    for (const assetCode of ['all', 'ETH', 'MSTR']) {
      expression('adjMultiAssetHistoryQuery', { mtrpc: { adminUser: { multiAssetWalletHistoryPage: { useQuery } } },
        adjAssetFlowUserId: 28, adjAssetFlowPage: 7, adjAssetFlowCurrency: assetCode, ADJ_PAGE_SIZE,
        adjSelectedUser: selected, mainTab: 'adjust' });
      expect(useQuery).toHaveBeenLastCalledWith({ userId: 28, page: 7, pageSize: 20,
        ...(assetCode === 'all' ? {} : { assetCode }) }, {
        enabled: true, staleTime: 0, refetchInterval: 15_000, refetchOnWindowFocus: true,
      });
    }
    const items = Object.freeze(Array.from({ length: 20 }, (_, id) => Object.freeze({ id })));
    expect(expression('adjVisibleMultiAssetHistory', { adjMultiAssetHistoryQuery: { data: { items } } })).toBe(items);
    expect(nodes(initializer('adjVisibleMultiAssetHistory'), ts.isCallExpression)).toHaveLength(0);
    expect(digitalPanel.getText(ast)).toContain('adjVisibleMultiAssetHistory.map');
    expect(digitalPanel.getText(ast)).not.toContain('.slice(');
  });

  it('全局真实useQuery每页20，保留钱包统一余额/全事件/关键词日期及主tab门控', () => {
    const query = required(nodes(ast, ts.isCallExpression).find(call => ts.isPropertyAccessExpression(call.expression)
      && call.expression.getText(ast) === 'mtrpc.adminUser.walletGlobalHistory.useQuery'
      && call.arguments[0].getText(ast).includes('page: adjLogPage')), 'global history query');
    const useQuery = vi.fn(() => ({}));
    for (const mainTab of ['adjust', 'records']) for (const adjFlowTab of ['user', 'global', 'balances']) {
      evaluate(`(${query.getText(ast)});`, { mtrpc: { adminUser: { walletGlobalHistory: { useQuery } } },
        mainTab, adjFlowTab, adjLogPage: 4, ADJ_PAGE_SIZE: expression('ADJ_PAGE_SIZE'),
        adjGlobalFlowKeyword: '  退款  ', adjGlobalDateRange: { startDate: '2026-10-01', endDate: '2026-10-31' } });
      expect(useQuery).toHaveBeenLastCalledWith({ page: 4, pageSize: 20, includeUnifiedBalance: true,
        includeAllWalletEvents: true, keyword: '退款', startDate: '2026-10-01', endDate: '2026-10-31' }, {
        enabled: mainTab === 'adjust' && adjFlowTab === 'global', staleTime: 30_000, refetchOnWindowFocus: false,
      });
    }
    for (const [total, pages] of [[0, 1], [20, 1], [21, 2], [41, 3]])
      expect(expression('adjLogTotalPages', { adjLogTotal: total, ADJ_PAGE_SIZE: 20 })).toBe(pages);
  });

  it('切用户首帧数字资产请求立即回page1/all，无需等待effect且同ID保留scope', () => {
    const adjAssetFlowScope = { userId: 28, assetCode: 'ETH', page: 7 };
    for (const [id, page, coin] of [[28, 7, 'ETH'], [29, 1, 'all'], [0, 1, 'all']] as const) {
      const adjAssetFlowUserId = expression<number>('adjAssetFlowUserId', { adjSelectedUser: id ? { id: String(id) } : null });
      expect(expression('adjAssetFlowPage', { adjAssetFlowScope, adjAssetFlowUserId })).toBe(page);
      expect(expression('adjAssetFlowCurrency', { adjAssetFlowScope, adjAssetFlowUserId })).toBe(coin);
    }
    const reset = required(effectUsing('setAdjAssetFlowScope').find(call => !call.getText(ast).includes('resolvedPage')), 'digital user reset');
    let scope = adjAssetFlowScope;
    const setter = vi.fn((update: (current: typeof scope) => typeof scope) => { scope = update(scope); });
    applyEffect(reset, { setAdjAssetFlowScope: setter, adjAssetFlowUserId: 29 });
    expect(scope).toEqual({ userId: 29, assetCode: 'all', page: 1 });
    const same = scope;
    applyEffect(reset, { setAdjAssetFlowScope: setter, adjAssetFlowUserId: 29 });
    expect(scope).toBe(same);
  });

  it('服务端页码校正只应用捕获的用户/币种/旧页，旧响应不覆盖新用户或新币种/页', () => {
    const correction = required(effectUsing('setAdjAssetFlowScope').find(call => call.getText(ast).includes('resolvedPage')), 'digital corrected page');
    const before = { userId: 28, assetCode: 'ETH', page: 7 };
    for (const next of [before, { ...before, userId: 29 }, { ...before, assetCode: 'SOL' }, { ...before, page: 3 }]) {
      let current = next;
      applyEffect(correction, { adjMultiAssetHistoryQuery: { data: { page: 6 } }, adjAssetFlowUserId: 28,
        adjAssetFlowCurrency: 'ETH', adjAssetFlowPage: 7,
        setAdjAssetFlowScope: (update: (value: typeof current) => typeof current) => { current = update(current); } });
      expect(current).toEqual(next === before ? { ...before, page: 6 } : next);
      if (next !== before) expect(current).toBe(next);
    }
  });

  it('数字币下拉继续全部既有币种且真实onChange重置本用户page1，不更改手动货币', () => {
    const select = required(nodes(digitalPanel, ts.isJsxElement).find(node => node.openingElement.tagName.getText(ast) === 'select'), 'digital coin select');
    const setAdjAssetFlowScope = vi.fn();
    const setAdjCurrency = vi.fn();
    const tree = evaluate<VNode>(`(${select.getText(ast)});`, { React, AI_WALLET_SETTLEMENT_ASSETS,
      adjAssetFlowCurrency: 'ETH', adjAssetFlowUserId: 29, setAdjAssetFlowScope, setAdjCurrency });
    expect(treeNodes(tree).filter(node => node.type === 'option').map(node => node.props.value))
      .toEqual(['all', ...AI_WALLET_SETTLEMENT_ASSETS]);
    (tree.props.onChange as (event: unknown) => void)({ target: { value: 'SOL' } });
    expect(setAdjAssetFlowScope).toHaveBeenCalledWith({ userId: 29, assetCode: 'SOL', page: 1 });
    expect(setAdjCurrency).not.toHaveBeenCalled();
  });
});

type FundingRow = { id: string; currency?: string | null; amount: string; balanceAfter: string;
  createdAt: string; note: string; type: string; sourceType: string };
type FundingScope = { key: string; page: number };
const fundingRows: readonly FundingRow[] = Object.freeze(Array.from({ length: 123 }, (_, index) => [
  Object.freeze({ id: `opening_u_${index}`, currency: [undefined, 'USDT', 'U'][index % 3],
    amount: '0.00000001', balanceAfter: '123456789.12345678', createdAt: index % 2 ? '2026-10-15T12:00:00' : '2026-11-15T12:00:00',
    note: index % 3 ? `普通记录 ${index}` : `SEARCH-KEY ${index}`, type: 'recharge', sourceType: 'opening' }),
  Object.freeze({ id: `opening_c_${index}`, currency: ['CNY', 'RMB', '人民币'][index % 3],
    amount: '-7.12345678', balanceAfter: '987654321.12345678', createdAt: index % 2 ? '2026-10-15T12:00:00' : '2026-11-15T12:00:00',
    note: index % 3 ? `普通记录 ${index}` : `SEARCH-KEY ${index}`, type: 'refund', sourceType: 'opening' }),
]).flat());
function funding(options: { category?: string; userId?: number; keyword?: string; preset?: string;
  start?: string; end?: string; page?: number; scope?: FundingScope; rows?: readonly FundingRow[] } = {}) {
  const bindings: Record<string, any> = {
    getWalletFlowCategory, getWalletFundingCurrency,
    formatLedgerDate: expression('formatLedgerDate'), getLedgerDateRange: expression('getLedgerDateRange', {
      formatLedgerDate: expression('formatLedgerDate'),
    }),
    adjAssetFlowUserId: options.userId ?? 28, adjUserHistoryTab: options.category ?? 'stable',
    adjUserFlowKeyword: options.keyword ?? '', adjUserFlowDatePreset: options.preset ?? 'all',
    adjUserFlowCustomStart: options.start ?? '', adjUserFlowCustomEnd: options.end ?? '',
    adjHistory: options.rows ?? fundingRows, ADJ_PAGE_SIZE: expression('ADJ_PAGE_SIZE'),
  };
  for (const name of ['adjUserDateRange', 'adjUserKeyword', 'adjCategoryHistory', 'adjFilteredHistory',
    'adjFundingFlowKey', 'adjFundingFlowTotalPages']) bindings[name] = expression(name, bindings);
  bindings.adjFundingFlowScope = options.scope ?? { key: bindings.adjFundingFlowKey, page: options.page ?? 1 };
  for (const name of ['adjFundingFlowPage', 'adjPagedHistory']) bindings[name] = expression(name, bindings);
  return bindings as Record<string, any> & { adjFundingFlowKey: string; adjFundingFlowPage: number;
    adjFundingFlowTotalPages: number; adjCategoryHistory: FundingRow[]; adjFilteredHistory: FundingRow[]; adjPagedHistory: FundingRow[] };
}
function renderFunding(options: Parameters<typeof funding>[0] = {}, state: { loading?: boolean; fetching?: boolean; error?: boolean } = {}) {
  const runtime = funding(options);
  const setAdjFundingFlowScope = vi.fn();
  const refetchAdjHistory = vi.fn();
  const tree = evaluate<VNode>(`(${fundingPanel.getText(ast)});`, {
    React, ...runtime, adjSelectedUser: selected,
    adjHistoryQuery: { data: state.loading ? undefined : runtime.adjHistory, isFetching: !!state.fetching, isError: !!state.error },
    PrevIcon: 'PrevIcon', NextIcon: 'NextIcon', LedgerFlowFilters: 'LedgerFlowFilters',
    setAdjFundingFlowScope, refetchAdjHistory,
    setAdjUserFlowKeyword: vi.fn(), setAdjUserFlowDatePreset: vi.fn(), setAdjUserFlowCustomStart: vi.fn(), setAdjUserFlowCustomEnd: vi.fn(),
    cleanAdjustmentNote: expression('cleanAdjustmentNote'), adjCommonNotes: [],
    setRevokeTarget: vi.fn(), setShowRevokeDialog: vi.fn(), setNoteTarget: vi.fn(), setNoteContent: vi.fn(),
    setNoteSelectedCommonNote: vi.fn(), setShowNoteDialog: vi.fn(),
  });
  const buttons = treeNodes(tree).filter(node => node.type === 'button');
  return { ...runtime, tree, setAdjFundingFlowScope, refetchAdjHistory,
    previous: required(buttons.find(node => text(node).includes('上一页')), 'funding previous'),
    next: required(buttons.find(node => text(node).includes('下一页')), 'funding next') };
}

describe('USDT/CNY按真实币种/关键词/日期本地过滤，再每页20条，无重漏或金额字段变更', () => {
  it.each(['stable', 'cny'])('%s 分类123条跨7页覆盖全部记录，每页20条且末页3条，保持源顺序与精度字符串', category => {
    const before = JSON.stringify(fundingRows);
    const expected = fundingRows.filter(row => getWalletFlowCategory(getWalletFundingCurrency(row.currency)) === category);
    expect(expected).toHaveLength(123);
    const all: FundingRow[] = [];
    for (let page = 1; page <= 7; page++) {
      const test = funding({ category, page });
      expect(test.adjFundingFlowTotalPages).toBe(7);
      expect(test.adjFundingFlowPage).toBe(page);
      expect(test.adjPagedHistory).toEqual(expected.slice((page - 1) * 20, page * 20));
      expect(test.adjPagedHistory).toHaveLength(page === 7 ? 3 : 20);
      for (const row of test.adjPagedHistory) expect(row).toBe(expected.find(source => source.id === row.id));
      all.push(...test.adjPagedHistory);
    }
    expect(all.map(row => row.id)).toEqual(expected.map(row => row.id));
    expect(new Set(all.map(row => row.id)).size).toBe(expected.length);
    expect(JSON.stringify(fundingRows)).toBe(before);
  });

  it.each(['stable', 'cny'])('%s 关键词及自定义日期在分页前筛选，命中跨页仍完整覆盖而非只搜当前20条', category => {
    const expected = fundingRows.filter(row => getWalletFlowCategory(getWalletFundingCurrency(row.currency)) === category
      && row.note.includes('SEARCH-KEY') && row.createdAt.startsWith('2026-10'));
    const first = funding({ category, keyword: '  search-key  ', preset: 'custom', start: '2026-10-01', end: '2026-10-31' });
    expect(first.adjFilteredHistory).toEqual(expected);
    expect(first.adjFundingFlowTotalPages).toBe(Math.max(1, Math.ceil(expected.length / 20)));
    expect(first.adjPagedHistory).toEqual(expected.slice(0, 20));
    const categoryInitializer = initializer('adjCategoryHistory').getText(ast);
    expect(categoryInitializer).not.toContain('adjPagedHistory');
    const filteredInitializer = initializer('adjFilteredHistory').getText(ast);
    expect(filteredInitializer).toContain('adjCategoryHistory.filter');
    expect(filteredInitializer).not.toContain('.slice(');
    expect(initializer('adjPagedHistory').getText(ast)).toContain('adjFilteredHistory.slice');
  });

  it('关键词保留备注/描述/类型/来源/状态/币种/金额/逐笔余额可搜字段，不改账务字段', () => {
    for (const field of ['note', 'description', 'type', 'sourceType', 'status', 'currency', 'amount', 'balanceAfter']) {
      const row = Object.freeze({ id: 'opening_search', currency: 'USDT', amount: '1', balanceAfter: '2',
        createdAt: '2026-10-15', note: '', type: '', sourceType: 'opening', [field]: 'needle' });
      const result = funding({ rows: [row], keyword: 'NEEDLE' });
      expect(result.adjPagedHistory).toEqual([row]);
      expect(result.adjPagedHistory[0]).toBe(row);
    }
  });

  it('空分类或筛选无命中稳定page1/1，删除末页后实时钳制到新末页，不出现空白页', () => {
    for (const options of [{ rows: [] }, { keyword: 'no-such-row' }]) {
      const result = funding({ ...options, page: 99 });
      expect(result.adjFundingFlowPage).toBe(1);
      expect(result.adjFundingFlowTotalPages).toBe(1);
      expect(result.adjPagedHistory).toEqual([]);
    }
    const last = funding({ page: 7 });
    const deleted = new Set(last.adjPagedHistory.map(row => row.id));
    const after = funding({ page: 7, rows: fundingRows.filter(row => !deleted.has(row.id)) });
    expect(after.adjFundingFlowPage).toBe(6);
    expect(after.adjFundingFlowTotalPages).toBe(6);
    expect(after.adjPagedHistory).toHaveLength(20);
    expect(after.adjPagedHistory.some(row => deleted.has(row.id))).toBe(false);
  });

  it('切用户/分类/关键词/日期首帧立刻page1，大小写/空格规范化相同关键词及余额刷新保留当前页', () => {
    const old = funding({ page: 4, keyword: '普通' });
    const scope = { key: old.adjFundingFlowKey, page: 4 };
    for (const changed of [{ userId: 29 }, { category: 'cny' }, { keyword: 'SEARCH-KEY' }, { preset: 'custom' },
      { start: '2026-10-01' }, { end: '2026-10-31' }]) {
      const result = funding({ keyword: '普通', ...changed, scope });
      expect(result.adjFundingFlowKey).not.toBe(scope.key);
      expect(result.adjFundingFlowPage).toBe(1);
    }
    expect(funding({ keyword: '  普通  ', scope }).adjFundingFlowPage).toBe(4);
    const english = funding({ keyword: 'search-key', page: 2 });
    expect(funding({ keyword: ' SEARCH-KEY ', scope: { key: english.adjFundingFlowKey, page: 2 } }).adjFundingFlowPage).toBe(2);
    expect(funding({ keyword: '普通', rows: [...fundingRows], scope }).adjFundingFlowPage).toBe(4);
  });

  it('真实本地分页effect按筛选key与钳制页同步，值相同返回原scope，依赖不包含调账草稿', () => {
    const effect = required(effectUsing('setAdjFundingFlowScope')[0], 'funding scope sync');
    const runtime = funding({ page: 99 });
    let current = { key: runtime.adjFundingFlowKey, page: 99 };
    const setAdjFundingFlowScope = vi.fn((update: (value: FundingScope) => FundingScope) => { current = update(current); });
    applyEffect(effect, { ...runtime, setAdjFundingFlowScope });
    expect(current).toEqual({ key: runtime.adjFundingFlowKey, page: 7 });
    const same = current;
    applyEffect(effect, { ...runtime, setAdjFundingFlowScope });
    expect(current).toBe(same);
    expect(evaluate(`(${effect.arguments[1].getText(ast)});`, runtime)).toEqual([runtime.adjFundingFlowKey, 7]);
    const names = nodes(initializer('adjFundingFlowKey'), ts.isIdentifier).map(node => node.text);
    for (const draft of ['adjCurrency', 'adjAmount', 'adjNote', 'adjDirection']) expect(names).not.toContain(draft);
  });

  it.each([{ page: 1, previous: true, next: false }, { page: 4, previous: false, next: false },
    { page: 7, previous: false, next: true }])('真实JSX第$page页只map分页后记录，边界及上一页/下一页携带完整筛选key', options => {
    const test = renderFunding({ page: options.page });
    expect(test.previous.props.disabled).toBe(options.previous);
    expect(test.next.props.disabled).toBe(options.next);
    expect(text(test.tree)).toContain(`${options.page} / 7 页`);
    expect(text(test.tree)).toContain('每页 20 条');
    const keys = treeNodes(test.tree).filter(node => typeof node.props.key === 'string').map(node => node.props.key);
    expect(keys).toEqual(test.adjPagedHistory.map(row => row.id));
    (test.previous.props.onClick as () => void)();
    expect(test.setAdjFundingFlowScope).toHaveBeenLastCalledWith({ key: test.adjFundingFlowKey, page: Math.max(1, options.page - 1) });
    (test.next.props.onClick as () => void)();
    expect(test.setAdjFundingFlowScope).toHaveBeenLastCalledWith({ key: test.adjFundingFlowKey, page: Math.min(7, options.page + 1) });
    expect(fundingPanel.getText(ast)).toContain('adjPagedHistory.map');
    expect(fundingPanel.getText(ast)).not.toContain('adjFilteredHistory.map');
  });

  it('请求中本地分页禁用；失败保留已显示20条且真实重试只调用只读refetch', () => {
    const loading = renderFunding({ page: 4 }, { fetching: true });
    expect(loading.previous.props.disabled).toBe(true);
    expect(loading.next.props.disabled).toBe(true);
    const failed = renderFunding({ page: 4 }, { error: true });
    expect(text(failed.tree)).toContain('更新失败，已显示的记录仍保留');
    expect(treeNodes(failed.tree).filter(node => typeof node.props.key === 'string')).toHaveLength(20);
    const retry = required(treeNodes(failed.tree).find(node => node.type === 'button' && text(node) === '重新加载'), 'funding retry');
    (retry.props.onClick as () => void)();
    expect(failed.refetchAdjHistory).toHaveBeenCalledOnce();
    expect(failed.setAdjFundingFlowScope).not.toHaveBeenCalled();
  });
});

describe('添加成功后的分页重置与排队回调隔离：只执行展示回调，不提交资金', () => {
  it.each(['USDT', 'CNY', 'ETH', 'MSTR'])('%s 成功展示使用本次提交币种，并排队资金分页page1；切用户后旧updater保持新scope', code => {
    const selectedRef = { current: 28 };
    const setters = Object.fromEntries(['AdjFlowTab', 'AdjUserHistoryTab', 'AdjUserFlowKeyword', 'AdjUserFlowDatePreset',
      'AdjUserFlowCustomStart', 'AdjUserFlowCustomEnd', 'AdjFundingFlowScope', 'AdjAssetFlowScope']
      .map(name => [`set${name}`, vi.fn()]));
    const show = expression<(id: number, code: string) => boolean>('showAdjSubmittedCurrency', {
      ...setters, adjSelectedUserIdRef: selectedRef, AI_WALLET_SETTLEMENT_ASSETS, getWalletFlowCategory,
    });
    expect(show(28, code)).toBe(true);
    expect(setters.setAdjFlowTab).toHaveBeenCalledWith('user');
    expect(setters.setAdjUserHistoryTab).toHaveBeenCalledWith(getWalletFlowCategory(code));
    const fundingUpdate = setters.setAdjFundingFlowScope.mock.calls[0][0] as (scope: FundingScope) => FundingScope;
    expect(fundingUpdate({ key: 'old-user-filters', page: 7 })).toEqual({ key: '', page: 1 });
    const nextScope = { key: 'new-user-filters', page: 5 };
    for (const nextId of [29, 0]) {
      selectedRef.current = nextId;
      expect(fundingUpdate(nextScope)).toBe(nextScope);
      const before = Object.fromEntries(Object.entries(setters).map(([key, setter]) => [key, setter.mock.calls.length]));
      expect(show(28, code)).toBe(false);
      for (const [name, setter] of Object.entries(setters)) expect(setter.mock.calls.length).toBe(before[name]);
    }
    if (getWalletFlowCategory(code) === 'digital') {
      const digitalUpdate = setters.setAdjAssetFlowScope.mock.calls[0][0] as (scope: unknown) => unknown;
      const next = { userId: 29, assetCode: 'SOL', page: 4 };
      expect(digitalUpdate(next)).toBe(next);
    } else expect(setters.setAdjAssetFlowScope).not.toHaveBeenCalled();
  });

  it('成功页重置空key能在清筛选后的首帧立即page1，后续15秒同用户同筛选刷新不跳页', () => {
    const old = funding({ page: 5, keyword: '普通' });
    const after = funding({ scope: { key: '', page: 1 } });
    expect(after.adjFundingFlowPage).toBe(1);
    const later = funding({ page: 4 });
    const refreshed = funding({ scope: { key: later.adjFundingFlowKey, page: 4 }, rows: [...fundingRows] });
    expect(refreshed.adjFundingFlowPage).toBe(4);
    expect(old.adjFundingFlowPage).toBe(5);
    expect(nodes(initializer('adjFundingFlowKey'), ts.isIdentifier).map(node => node.text)).not.toContain('adjWalletSnapshotQuery');
  });
});
