import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AI_WALLET_SETTLEMENT_ASSETS, AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS } from '../shared/ai-wallet-assets';
import { getWalletFlowCategory, getWalletFundingCurrency } from '../client/src/lib/walletFlowPresentation';

// 仅 import 无副作用展示工具；页面/路由/DB不加载。真实生产AST回调在VM执行，
// 所有刷新、缓存、toast、资金mutation均为离线spy，无网络、浏览器或实际账务请求。
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
  visit(root);
  return found;
}
function initializer(name: string) {
  return required(nodes(ast, ts.isVariableDeclaration).find(node => ts.isIdentifier(node.name)
    && node.name.text === name)?.initializer, name);
}
function evaluate<T>(source: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(source, { fileName: 'offline.tsx', compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
  } });
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
function expression<T>(name: string, bindings: Record<string, unknown> = {}): T {
  return evaluate<T>(`(${initializer(name).getText(ast)});`, bindings);
}
type MutationName = 'adjMutation' | 'multiAssetAdjMutation';
type Variables = { userId: number | string; currency?: string; assetCode?: string; [field: string]: unknown };
type MutationCallbacks = { onSuccess: (result: unknown, variables: Variables) => void; onError: (error: { message?: string }) => void };
function successHarness(name: MutationName) {
  const state: Record<string, unknown> = {
    adjFlowTab: 'balances', adjUserHistoryTab: 'cny', adjCurrency: 'SOL', adjDirection: 'sub',
    adjAmount: '新草稿金额', adjNote: '新草稿备注', adjSelectedCommonNote: '常用备注',
    adjUserFlowKeyword: '旧关键词', adjUserFlowDatePreset: 'custom',
    adjUserFlowCustomStart: '2026-10-01', adjUserFlowCustomEnd: '2026-10-31',
    adjAssetFlowScope: { userId: 28, assetCode: 'ETH', page: 7 }, adjLogPage: 5,
    adjBalanceSearch: '保留搜索', adjGlobalFlowKeyword: '保留全局关键词',
  };
  const setters = Object.fromEntries(Object.keys(state).map(key => [
    `set${key[0].toUpperCase()}${key.slice(1)}`, vi.fn((value: unknown) => {
      state[key] = typeof value === 'function' ? value(state[key]) : value;
    }),
  ])) as Record<string, ReturnType<typeof vi.fn>>;
  const invalidations = Object.fromEntries(['list', 'walletSnapshot', 'walletGlobalHistory', 'walletBalanceTrend',
    'multiAssetWalletHistory', 'multiAssetWalletHistoryPage', 'afGetMyRechargeHistory']
    .map(key => [key, vi.fn(async () => undefined)]));
  const selectedRef = { current: 28 };
  const toast = { success: vi.fn(), error: vi.fn() };
  const remember = vi.fn();
  const refetchHistory = vi.fn();
  const refetchGlobal = vi.fn();
  const forbidden = vi.fn(() => { throw new Error('Forbidden funds/network side effect'); });
  const bindings: Record<string, unknown> = {
    ...state, ...setters, AI_WALLET_SETTLEMENT_ASSETS, getWalletFlowCategory, getWalletFundingCurrency,
    adjSelectedUserIdRef: selectedRef, adjSelectedUser: { id: 28 },
    toast, rememberRecentAdjUser: remember,
    adjUtils: {
      adminUser: Object.fromEntries(Object.entries(invalidations)
        .filter(([key]) => key !== 'afGetMyRechargeHistory').map(([key, invalidate]) => [key, { invalidate }])),
      ledger: { afGetMyRechargeHistory: { invalidate: invalidations.afGetMyRechargeHistory } },
    },
    refetchAdjHistory: refetchHistory, refetchAdjGlobal: refetchGlobal,
    fetch: forbidden, window: undefined,
    adjMutation: { mutate: forbidden }, multiAssetAdjMutation: { mutate: forbidden },
  };
  bindings.showAdjSubmittedCurrency = expression('showAdjSubmittedCurrency', bindings);
  const realRefresh = expression<(userId: number) => Promise<void>>('refreshAdjWalletAfterChange', bindings);
  const completions: Promise<void>[] = [];
  const refresh = vi.fn((userId: number) => {
    const completion = realRefresh(userId);
    completions.push(completion);
    return completion;
  });
  bindings.refreshAdjWalletAfterChange = refresh;
  // 执行完整真实useMutation初始化表达式，仅替换useMutation边界并捕获原options。
  const useMutation = vi.fn((options: MutationCallbacks) => options);
  bindings.mtrpc = { adminUser: {
    walletAdjust: { useMutation }, multiAssetWalletAdjust: { useMutation },
  } };
  const callbacks = expression<MutationCallbacks>(name, bindings);
  expect(useMutation).toHaveBeenCalledOnce();
  return { state, setters, selectedRef, toast, remember, invalidations, refetchHistory, refetchGlobal,
    forbidden, callbacks, refresh, completions };
}
async function expectRefresh(test: ReturnType<typeof successHarness>, sameUser = true) {
  expect(test.refresh.mock.calls).toEqual([[28]]);
  const forced = { cancelRefetch: true, throwOnError: true };
  expect(test.invalidations.walletSnapshot.mock.calls).toEqual([[{ userId: 28 }, undefined, forced]]);
  expect(test.invalidations.multiAssetWalletHistoryPage.mock.calls).toEqual([[{ userId: 28 }, undefined, forced]]);
  expect(test.invalidations.afGetMyRechargeHistory.mock.calls).toEqual([[{ viewAsUserId: 28 }, undefined, forced]]);
  for (const key of ['list', 'walletGlobalHistory', 'walletBalanceTrend', 'multiAssetWalletHistory'])
    expect(test.invalidations[key], key).not.toHaveBeenCalled();
  await Promise.all(test.completions);
  for (const [key, invalidate] of Object.entries(test.invalidations)) {
    if (['walletSnapshot', 'multiAssetWalletHistoryPage', 'afGetMyRechargeHistory'].includes(key)) continue;
    expect(invalidate.mock.calls, key).toEqual(key === 'multiAssetWalletHistory' ? [[{ userId: 28 }]] : [[]]);
  }
  expect(test.refetchHistory).not.toHaveBeenCalled();
  expect(test.refetchGlobal).not.toHaveBeenCalled();
  expect(test.setters.setAdjLogPage.mock.calls).toEqual(sameUser ? [[1]] : []);
  expect(test.forbidden).not.toHaveBeenCalled();
}

describe('钱包展示分类：真实纯函数，不扩展资金币种或改变账务字段', () => {
  it.each([
    ['USDT', 'stable'], [' usdt ', 'stable'], ['U', 'stable'], [' u ', 'stable'],
    ['CNY', 'cny'], [' cny ', 'cny'], ['RMB', 'cny'], [' rmb ', 'cny'], ['人民币', 'cny'],
    ['ETH', 'digital'], ['BTC', 'digital'], ['SOL', 'digital'], ['USD', 'digital'], ['', 'digital'],
  ])('%s 仅分类为 %s', (code, category) => {
    expect(getWalletFlowCategory(code)).toBe(category);
  });

  it('所有既有市场资产（包括证券商品）继续数字资产分类，不隐藏或改资产代码', () => {
    expect(AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS.length).toBeGreaterThan(0);
    for (const assetCode of AI_WALLET_SETTLEMENT_ASSETS) expect(getWalletFlowCategory(assetCode)).toBe('digital');
    expect(AI_WALLET_SETTLEMENT_ASSETS).not.toContain('USD');
  });

  it('旧无币种/USDT/U流水保留USDT口径，CNY/RMB/人民币单独归人民币', () => {
    for (const currency of [undefined, null, '', 'USDT', 'usdt', 'U']) expect(getWalletFundingCurrency(currency)).toBe('USDT');
    for (const currency of ['CNY', 'cny', 'RMB', 'rmb', '人民币']) expect(getWalletFundingCurrency(currency)).toBe('CNY');
  });
});

describe('真实调账成功回调：本笔variables币种/用户、草稿隔离与趋势刷新', () => {
  it.each([
    { name: 'adjMutation' as const, code: 'USDT', category: 'stable' },
    { name: 'adjMutation' as const, code: 'CNY', category: 'cny' },
    { name: 'multiAssetAdjMutation' as const, code: 'ETH', category: 'digital' },
    { name: 'multiAssetAdjMutation' as const, code: 'MSTR', category: 'digital' },
    { name: 'multiAssetAdjMutation' as const, code: 'SLV', category: 'digital' },
  ])('$name/$code：提交成功后展示本笔分类，非当前表单SOL或响应伪币种', async ({ name, code, category }) => {
    const test = successHarness(name);
    const scope = test.state.adjAssetFlowScope;
    const variables = Object.freeze({ userId: '28', [name === 'adjMutation' ? 'currency' : 'assetCode']: code,
      amount: '0.00000001', note: '已提交备注' });
    const before = JSON.stringify(variables);
    expect(test.callbacks.onSuccess({ currency: 'CNY', assetCode: 'SOL', userId: 29 }, variables)).toBeUndefined();
    expect(test.state.adjFlowTab).toBe('user');
    expect(test.state.adjUserHistoryTab).toBe(category);
    expect(test.state.adjUserFlowKeyword).toBe('');
    expect(test.state.adjUserFlowDatePreset).toBe('all');
    expect(test.state.adjUserFlowCustomStart).toBe('');
    expect(test.state.adjUserFlowCustomEnd).toBe('');
    expect(test.state.adjAmount).toBe('');
    expect(test.state.adjNote).toBe('');
    expect(test.state.adjCurrency).toBe('SOL');
    expect(test.state.adjDirection).toBe('sub');
    expect(test.state.adjSelectedCommonNote).toBe('常用备注');
    expect(test.state.adjBalanceSearch).toBe('保留搜索');
    expect(test.state.adjGlobalFlowKeyword).toBe('保留全局关键词');
    if (name === 'multiAssetAdjMutation') expect(test.state.adjAssetFlowScope)
      .toEqual({ userId: 28, assetCode: code, page: 1 });
    else {
      expect(test.state.adjAssetFlowScope).toBe(scope);
      expect(test.setters.setAdjAssetFlowScope).not.toHaveBeenCalled();
    }
    expect(test.remember).toHaveBeenCalledWith(28);
    expect(test.toast.success).toHaveBeenCalledOnce();
    expect(test.toast.error).not.toHaveBeenCalled();
    expect(JSON.stringify(variables)).toBe(before);
    await expectRefresh(test);
  });

  it.each(['adjMutation', 'multiAssetAdjMutation'] as const)('%s：等待期间切至新用户/取消选择，旧响应不碰新草稿/分类/scope', async name => {
    for (const currentUser of [29, 0]) {
      const test = successHarness(name);
      // 保持初始化时捕获的selectedUser=28，只更新render时ref，验证真实竞态守卫。
      test.selectedRef.current = currentUser;
      const before = { ...test.state };
      test.callbacks.onSuccess({}, { userId: 28, currency: 'USDT', assetCode: 'ETH' });
      expect(test.state).toEqual(before);
      for (const [key, setter] of Object.entries(test.setters)) {
        expect(setter, key).not.toHaveBeenCalled();
      }
      expect(test.remember).toHaveBeenCalledWith(28);
      await expectRefresh(test, false);
    }
  });

  it.each(['adjMutation', 'multiAssetAdjMutation'] as const)('%s：真实onError只提示，不切面板、清草稿或刷新成功数据', name => {
    for (const message of ['离线失败', undefined]) {
      const test = successHarness(name);
      const before = { ...test.state };
      test.callbacks.onError({ message });
      expect(test.state).toEqual(before);
      for (const setter of Object.values(test.setters)) expect(setter).not.toHaveBeenCalled();
      for (const invalidate of Object.values(test.invalidations)) expect(invalidate).not.toHaveBeenCalled();
      expect(test.toast.error).toHaveBeenCalledWith(message || (name === 'adjMutation' ? '调账失败' : '52号市场资产调账失败'));
      expect(test.toast.success).not.toHaveBeenCalled();
      expect(test.remember).not.toHaveBeenCalled();
      expect(test.refetchHistory).not.toHaveBeenCalled();
      expect(test.refetchGlobal).not.toHaveBeenCalled();
      expect(test.refresh).not.toHaveBeenCalled();
      expect(test.forbidden).not.toHaveBeenCalled();
    }
  });

  it('selected ref在真实render中同步数字ID，回调不读取可变表单币种或捕获旧selectedUser', () => {
    const assignment = required(nodes(ast, ts.isBinaryExpression).find(node => node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && node.left.getText(ast) === 'adjSelectedUserIdRef.current'), 'selected user ref assignment');
    for (const selected of [{ id: '29' }, null]) {
      const ref = { current: 28 };
      evaluate(`${assignment.getText(ast)};`, { adjSelectedUserIdRef: ref, adjSelectedUser: selected });
      expect(ref.current).toBe(selected ? 29 : 0);
    }
    for (const name of ['showAdjSubmittedCurrency', 'adjMutation', 'multiAssetAdjMutation']) {
      const identifiers = nodes(initializer(name), ts.isIdentifier).map(node => node.text);
      expect(identifiers).not.toContain('adjCurrency');
      expect(identifiers).not.toContain('adjSelectedUser');
    }
  });

  it('原市场提交字段与高精度字符串不变，证券商品仍走原mutation，分类仅展示', () => {
    const fundingMutation = { mutate: vi.fn() };
    const digitalMutation = { mutate: vi.fn() };
    for (const assetCode of ['ETH', 'MSTR', 'SLV']) {
      for (const adjUserHistoryTab of ['digital', 'stable', 'cny']) {
        expression<() => void>('handleAdjSubmit', {
          AI_WALLET_SETTLEMENT_ASSETS, adjSelectedUser: { id: '28' }, adjCurrency: assetCode,
          adjUserHistoryTab, adjAmount: '0.00000001', adjDirection: 'sub', adjNote: '  审计备注  ',
          adjMutation: fundingMutation, multiAssetAdjMutation: digitalMutation,
          toast: { error: vi.fn(), info: vi.fn() }, crypto: { randomUUID: () => 'offline-request-id' },
        })();
        expect(digitalMutation.mutate).toHaveBeenLastCalledWith({ userId: 28, assetCode, amount: '-0.00000001',
          note: '审计备注', requestId: 'offlinerequestid' });
      }
    }
    expect(digitalMutation.mutate).toHaveBeenCalledTimes(9);
    expect(fundingMutation.mutate).not.toHaveBeenCalled();
  });
});

function smallestElement(root: ts.Node, predicate: (node: ts.JsxElement) => boolean, label: string) {
  return required(nodes(root, ts.isJsxElement).filter(predicate).sort((a, b) => (a.end - a.pos) - (b.end - b.pos))[0], label);
}
function contains(outer: ts.Node, inner: ts.Node) { return outer.pos <= inner.pos && outer.end >= inner.end; }
function gate(value: string) {
  return required(nodes(ast, ts.isJsxExpression).find(node => node.expression && ts.isBinaryExpression(node.expression)
    && node.expression.left.getText(ast) === `adjFlowTab === "${value}"`)?.expression, `${value} flow gate`);
}
function chart(root: ts.Node, name: string) {
  return required(nodes(root, ts.isJsxSelfClosingElement).find(node => node.tagName.getText(ast) === name), name);
}

describe('真实JSX布局与全局菜单：只移动汇总，不改表单/flow gate/估值口径', () => {
  it('紧凑用户选择与提交仍在表单；唯一用户余额大卡在流水之后、用户趋势之前', () => {
    const submit = smallestElement(ast, node => node.openingElement.tagName.getText(ast) === 'button'
      && nodes(node, ts.isJsxAttribute).some(attr => attr.name.getText(ast) === 'onClick'
        && attr.initializer?.getText(ast) === '{handleAdjSubmit}'), 'submit button');
    const form = required(nodes(ast, ts.isJsxElement).filter(node => contains(node, submit)
      && nodes(node, ts.isJsxAttribute).some(attr => attr.name.getText(ast) === 'value'
        && attr.initializer?.getText(ast) === '{adjCurrency}')).sort((a, b) => (a.end - a.pos) - (b.end - b.pos))[0], 'adjust form');
    expect(form.getText(ast)).toContain('调账用户');
    expect(form.getText(ast)).toContain('clearAdjUser');
    expect(form.getText(ast)).toContain('adjAmount');
    expect(form.getText(ast)).toContain('adjNote');
    expect(form.getText(ast)).not.toContain('adjSelectedUsdtBalance');
    expect(form.getText(ast)).not.toContain('adjSelectedWalletValuation');
    const summaries = nodes(ast, ts.isJsxElement).filter(node => node.openingElement.attributes.properties.some(attr =>
      ts.isJsxAttribute(attr) && attr.name.getText(ast) === 'ref' && attr.initializer?.getText(ast) === '{adjSelectedUserExportRef}'));
    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    const user = gate('user');
    expect(contains(user, summary)).toBe(true);
    expect(contains(form, summary)).toBe(false);
    const panels = nodes(user, ts.isJsxElement).filter(node => node.openingElement.attributes.properties.some(attr =>
      ts.isJsxAttribute(attr) && attr.name.getText(ast) === 'role' && attr.initializer?.getText(ast) === '"tabpanel"'));
    expect(panels).toHaveLength(2); // digital静态panel + stable/cny共用的动态panel
    for (const panel of panels) expect(panel.end).toBeLessThan(summary.pos);
    expect(summary.end).toBeLessThan(chart(user, 'WalletBalanceTrendChart').pos);
    expect(summary.getText(ast)).toContain('adjSelectedUsdtBalance');
    expect(summary.getText(ast)).toContain('adjSelectedCnyBalance');
    expect(summary.getText(ast)).toContain('adjSelectedWalletValuation');
  });

  it('全局余额列表先展示，资产总汇总随后，最后全局资产走势图；全都保留balances门控', () => {
    const balances = gate('balances');
    const list = smallestElement(balances, node => node.openingElement.tagName.getText(ast) === 'div'
      && nodes(node, ts.isCallExpression).some(call => ts.isPropertyAccessExpression(call.expression)
        && call.expression.getText(ast) === 'adjSortedBalanceUsers.map'), 'global users balance list');
    const summary = smallestElement(balances, node => node.openingElement.tagName.getText(ast) === 'div'
      && nodes(node, ts.isJsxText).some(text => text.text.trim() === '全部用户资产总价值')
      && nodes(node, ts.isIdentifier).some(id => id.text === 'adjAllWalletValuation'), 'global total summary');
    const trend = chart(balances, 'WalletTotalAssetTrendChart');
    expect(list.end).toBeLessThan(summary.pos);
    expect(summary.end).toBeLessThan(trend.pos);
    expect(trend.getText(ast)).toContain('assetPrices={adjBalancePrices}');
    expect(trend.getText(ast)).toContain('fallbackMultiAssets={adjMultiAssetTotals}');
    expect(trend.getText(ast)).toContain('usdtCnyRate={adjBalanceUsdtCnyRate}');
    expect(nodes(ast, ts.isJsxSelfClosingElement).filter(node => node.tagName.getText(ast) === 'WalletTotalAssetTrendChart')).toHaveLength(1);
  });

  it('三个全局按钮保持user/global/balances原回调与标签，全局流水切换仍重置页并刷新', () => {
    for (const [value, label] of [['user', '当前用户流水'], ['global', '全局流水'], ['balances', '全局余额']]) {
      const button = required(nodes(ast, ts.isJsxElement).find(node => node.openingElement.tagName.getText(ast) === 'button'
        && node.children.some(child => ts.isJsxText(child) && child.text.trim() === label)), label);
      const handler = required(nodes(button.openingElement, ts.isJsxAttribute).find(attr => attr.name.getText(ast) === 'onClick')?.initializer, label);
      if (!ts.isJsxExpression(handler) || !handler.expression) throw new Error(`Missing handler: ${label}`);
      const setAdjFlowTab = vi.fn();
      const setAdjLogPage = vi.fn();
      const refetchAdjGlobal = vi.fn();
      evaluate<() => void>(`(${handler.expression.getText(ast)});`, { setAdjFlowTab, setAdjLogPage, refetchAdjGlobal })();
      expect(setAdjFlowTab).toHaveBeenCalledWith(value);
      expect(setAdjLogPage.mock.calls).toEqual(value === 'global' ? [[1]] : []);
      expect(refetchAdjGlobal.mock.calls).toEqual(value === 'global' ? [[]] : []);
    }
  });
});
