import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { AI_WALLET_SETTLEMENT_ASSETS } from '../shared/ai-wallet-assets';
import { getWalletFlowCategory, getWalletFundingCurrency } from '../client/src/lib/walletFlowPresentation';
import { refreshAdminWalletSnapshot } from '../client/src/lib/adminWalletSnapshotRefresh';

// 精准离线回归：只读取生产源码并执行 AST 片段，不 import 页面/router/DB/行情。
// JSX factory、tRPC cache、资金 mutation、基础设施初始化和 SQL 连接都是离线边界。
// 不运行旧测试、不连接生产库/网络/浏览器，也不把 mock 延迟解释为数据库性能实测。
function source(path: string, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, kind);
}
const page = source('../client/src/pages/AfRechargeManage.tsx', ts.ScriptKind.TSX);
const requests = source('../client/src/lib/adminWalletRequests.ts');
const miban = source('./miban.ts');
const assets = source('./db-multi-asset-wallet.ts');
const routers = source('./routers.ts');
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
function declaration(ast: ts.SourceFile, name: string) {
  return required(nodes(ast, ts.isVariableDeclaration).find(node =>
    ts.isIdentifier(node.name) ? node.name.text === name
      : nodes(node.name, ts.isIdentifier).some(id => id.text === name)), name);
}
function initializer(ast: ts.SourceFile, name: string) {
  return required(declaration(ast, name).initializer, name);
}
function fn(ast: ts.SourceFile, name: string) {
  return required(nodes(ast, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
}
function evaluate<T>(code: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(code, { fileName: 'offline.tsx', compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
  } });
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
function expression<T>(name: string, bindings: Record<string, unknown> = {}, ast = page): T {
  return evaluate<T>(`(${initializer(ast, name).getText(ast)});`, bindings);
}
function realFunction<T>(ast: ts.SourceFile, name: string, bindings: Record<string, unknown> = {}): T {
  return evaluate<T>(`(${fn(ast, name).getText(ast).replace(/^export\s+/, '')});`, bindings);
}
function deferred() {
  let resolve!: (value?: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function microtasks() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

const requestMatch = realFunction<(path: string) => boolean>(requests, 'isAdminWalletRequest');
const pageMatch = realFunction<(path: string) => boolean>(requests, 'isAdminRechargeManagementPage');
describe('管理员独立请求：执行真实路径匹配函数，不扩大普通请求域', () => {
  it.each(['adminUser.list', 'adminUser.walletSnapshot', 'adminUser.walletAdjust',
    'adminUser.walletGlobalHistory', 'adminUser.walletBalanceTrend', 'adminUser.walletHistory',
    'adminUser.multiAssetWalletAdjust', 'adminUser.multiAssetWalletHistoryPage',
    'adminUser.multiAssetWalletUpdateAdjustmentNote', 'adminUser.multiAssetWalletRevokeAdjustment',
    'ledger.afGetMyRechargeHistory'])('%s 走管理员钱包独立请求域', path => {
    expect(requestMatch(path)).toBe(true);
  });
  it.each(['', 'adminUser', 'adminUser.list.extra', 'adminUser.setRole', 'adminUser.adminList',
    'adminUser.getWallet', 'adminUserX.walletSnapshot', 'x.adminUser.walletAdjust',
    'ledger.afGetMyRechargeHistory.extra', 'ledger.afGetMyRechargeHistory2', 'ledger.list',
    'recharge.adminGetAllOrders', 'recharge.adminGetSystemStats', 'getCryptoPrices',
    'wallet.walletSnapshot', 'AdminUser.walletAdjust'])('%s 保留普通请求行为', path => {
    expect(requestMatch(path)).toBe(false);
  });
  it.each(['/ledger/37/af-recharge-manage', '/ledger/52/af-recharge-manage',
    '/ledger/37/af-recharge-manage/', '/ledger/52/af-recharge-manage/?tab=adjust',
    '/ledger/52/af-recharge-manage?tab=records'])('%s 仅在充值管理页排除全量轮询', path => {
    expect(pageMatch(path)).toBe(true);
  });
  it.each(['/ledger/1/af-recharge-manage', '/ledger/53/af-recharge-manage',
    '/ledger/052/af-recharge-manage', '/ledger/137/af-recharge-manage',
    '/ledger/52/finance', '/ledger/37/finance', '/ledger/52/af-t0', '/ledger/37/af-t0',
    '/ledger/52/t0', '/ledger/52/af-recharge-manage/extra', '/ledger/52/af-recharge-manage-other',
    '/ledger/52', '/finance', '/t0', '/x/ledger/52/af-recharge-manage', ''])('%s 不改变 T0/finance/其他账本的轮询', path => {
    expect(pageMatch(path)).toBe(false);
  });
});

const coreNames = ['snapshot', 'funding', 'digitalPage'] as const;
// 快照 helper 先 await cancel/invalidate；两项流水仍在同一 tick 并行启动。
const coreOrder = ['funding', 'digitalPage', 'snapshot'] as const;
const backgroundNames = ['list', 'global', 'trend', 'digitalLegacy'] as const;
const readNames = [...coreOrder, ...backgroundNames] as const;
type ReadName = typeof readNames[number];
const forced = { cancelRefetch: true, throwOnError: true };
function refreshHarness(implementations: Partial<Record<ReadName, () => unknown>> = {}) {
  const order: ReadName[] = [];
  const reads = Object.fromEntries(readNames.map(name => [name, vi.fn((input?: { userId: number }) => {
    order.push(name);
    return implementations[name]?.() ?? Promise.resolve(name === 'snapshot' ? { id: input?.userId } : name);
  })])) as Record<ReadName, ReturnType<typeof vi.fn>>;
  const forbidden = vi.fn(() => { throw new Error('Forbidden offline mutation/network/browser'); });
  const mutator = { mutate: forbidden, mutateAsync: forbidden };
  const poison: unknown = new Proxy(forbidden, { get: () => poison });
  const toast = { error: vi.fn(), success: vi.fn() };
  const snapshot = { cancel: vi.fn(async () => undefined), invalidate: vi.fn(async () => undefined), fetch: reads.snapshot };
  const bindings = { toast, refreshAdminWalletSnapshot, adjUtils: { adminUser: {
    walletSnapshot: snapshot, list: { invalidate: reads.list },
    multiAssetWalletHistoryPage: { invalidate: reads.digitalPage },
    multiAssetWalletHistory: { invalidate: reads.digitalLegacy },
    walletGlobalHistory: { invalidate: reads.global }, walletBalanceTrend: { invalidate: reads.trend },
  }, ledger: { afGetMyRechargeHistory: { invalidate: reads.funding } } },
  adjMutation: mutator, multiAssetAdjMutation: mutator, handleAdjSubmit: forbidden,
  mtrpc: poison, trpc: poison, window: poison, document: poison, fetch: forbidden };
  return { refresh: expression<(userId: number) => Promise<void>>('refreshAdjWalletAfterChange', bindings),
    reads, order, forbidden, toast, snapshot };
}
function expectCore(test: ReturnType<typeof refreshHarness>, userId: number) {
  expect(test.snapshot.cancel.mock.calls).toEqual([[{ userId }]]);
  expect(test.snapshot.invalidate.mock.calls).toEqual([[{ userId }, { refetchType: 'none' }]]);
  expect(test.reads.snapshot.mock.calls).toEqual([[{ userId }, { staleTime: 0 }]]);
  expect(test.reads.funding.mock.calls).toEqual([[{ viewAsUserId: userId }, undefined, forced]]);
  // 部分键 {userId} 定向覆盖该用户所有币种/页码，不将其他用户拉进刷新。
  expect(test.reads.digitalPage.mock.calls).toEqual([[{ userId }, undefined, forced]]);
  const options = ['funding', 'digitalPage'].map(name => test.reads[name as ReadName].mock.calls[0][2]);
  expect(options.every(option => option === options[0])).toBe(true);
}
describe('真实 refreshAdjWalletAfterChange：核心完成后才后台刷新，不重提资金 mutation', () => {
  it('仅目标 ID 的快照新读取与两项流水并行；核心 promise 完成前列表/全局/走势绝不启动', async () => {
    const pending = Object.fromEntries(readNames.map(name => [name, deferred()])) as Record<ReadName, ReturnType<typeof deferred>>;
    const test = refreshHarness(Object.fromEntries(readNames.map(name => [name, () => pending[name].promise])));
    let finished = false;
    const running = test.refresh(28).then(() => { finished = true; });
    expect(test.order).toEqual(['funding', 'digitalPage']);
    await microtasks();
    expectCore(test, 28);
    expect(test.order).toEqual(coreOrder);
    for (const name of coreNames.slice(0, 2)) {
      pending[name].resolve(name === 'snapshot' ? { id: 28 } : undefined); await microtasks();
      expect(test.order).toEqual(coreOrder);
      expect(finished).toBe(false);
    }
    pending.digitalPage.resolve();
    await running;
    expect(finished).toBe(true); // 所有后台 promise 仍未完成，保存后刷新不等它们。
    expect(test.order).toEqual(readNames);
    for (const name of ['list', 'global', 'trend'] as const) expect(test.reads[name].mock.calls).toEqual([[]]);
    expect(test.reads.digitalLegacy.mock.calls).toEqual([[{ userId: 28 }]]);
    for (const name of backgroundNames) pending[name].resolve();
    await microtasks();
    expect(test.forbidden).not.toHaveBeenCalled();
    expect(test.toast.error).not.toHaveBeenCalled();
  });
  it.each(coreNames)('%s 拒绝仍等待另外两项完成；明确“已保存、不可重复添加”，绝不自动 mutation', async failed => {
    const pending = Object.fromEntries(coreNames.map(name => [name, deferred()])) as Record<typeof coreNames[number], ReturnType<typeof deferred>>;
    const test = refreshHarness(Object.fromEntries(coreNames.map(name => [name, () => pending[name].promise])));
    let finished = false;
    const running = test.refresh(29).then(() => { finished = true; });
    await microtasks();
    expectCore(test, 29);
    pending[failed].reject(new Error('offline read failure'));
    await microtasks();
    expect(finished).toBe(false);
    expect(test.toast.error).not.toHaveBeenCalled();
    expect(test.order).toEqual(coreOrder);
    const others = coreNames.filter(name => name !== failed);
    pending[others[0]].resolve(others[0] === 'snapshot' ? { id: 29 } : undefined); await microtasks();
    expect(test.toast.error).not.toHaveBeenCalled();
    expect(test.order).toEqual(coreOrder);
    pending[others[1]].resolve(others[1] === 'snapshot' ? { id: 29 } : undefined); await running;
    expect(test.toast.error.mock.calls).toEqual([['账目已保存，部分余额或流水更新失败，请点更新重试；不要重复添加']]);
    expect(test.toast.success).not.toHaveBeenCalled();
    expect(test.order).toEqual(readNames);
    expect(test.forbidden).not.toHaveBeenCalled();
  });
  it('后台拒绝不变成保存失败、不额外 toast，也不自动重试资金写入', async () => {
    const test = refreshHarness(Object.fromEntries(backgroundNames.map(name => [name, () => Promise.reject(new Error(name))])));
    await test.refresh(28); await microtasks();
    expect(test.order).toEqual(readNames);
    expect(test.toast.error).not.toHaveBeenCalled();
    expect(test.forbidden).not.toHaveBeenCalled();
    expect(nodes(initializer(page, 'refreshAdjWalletAfterChange'), ts.isPropertyAccessExpression)
      .map(node => node.name.text).filter(name => ['mutate', 'mutateAsync', 'reload', 'assign'].includes(name))).toEqual([]);
  });
});

function successHarness(name: 'adjMutation' | 'multiAssetAdjMutation', selectedId: number | null, refresh?: (id: number) => unknown) {
  const query = initializer(page, name);
  if (!ts.isCallExpression(query)) throw new Error(`Expected useMutation: ${name}`);
  const bindings: Record<string, any> = { adjSelectedUser: selectedId == null ? null : { id: selectedId },
    adjSelectedUserIdRef: { current: selectedId ?? 0 }, AI_WALLET_SETTLEMENT_ASSETS, getWalletFlowCategory,
    adjAmount: '新用户金额', adjNote: '新用户备注', adjUserHistoryTab: 'cny', adjFlowTab: 'balances',
    adjUserFlowKeyword: '旧关键词', adjUserFlowDatePreset: 'custom',
    adjUserFlowCustomStart: '2026-10-01', adjUserFlowCustomEnd: '2026-10-31',
    adjAssetFlowScope: { userId: selectedId ?? 0, assetCode: 'SOL', page: 7 },
    adjFundingFlowScope: { key: 'old-funding-filter-key', page: 7 },
    toast: { success: vi.fn(), error: vi.fn() }, rememberRecentAdjUser: vi.fn(),
    refreshAdjWalletAfterChange: vi.fn(refresh ?? (() => Promise.resolve())), setAdjLogPage: vi.fn() };
  for (const [setter, key] of [['setAdjAmount', 'adjAmount'], ['setAdjNote', 'adjNote'],
    ['setAdjUserHistoryTab', 'adjUserHistoryTab'], ['setAdjAssetFlowScope', 'adjAssetFlowScope'],
    ['setAdjFlowTab', 'adjFlowTab'], ['setAdjUserFlowKeyword', 'adjUserFlowKeyword'],
    ['setAdjUserFlowDatePreset', 'adjUserFlowDatePreset'], ['setAdjUserFlowCustomStart', 'adjUserFlowCustomStart'],
    ['setAdjUserFlowCustomEnd', 'adjUserFlowCustomEnd'], ['setAdjFundingFlowScope', 'adjFundingFlowScope']]) {
    bindings[setter] = vi.fn((value: unknown) => { bindings[key] = typeof value === 'function' ? value(bindings[key]) : value; });
  }
  bindings.showAdjSubmittedCurrency = expression('showAdjSubmittedCurrency', bindings);
  const options = evaluate<{ onSuccess: (result: unknown, vars: { userId: number | string; currency?: string; assetCode?: string }) => unknown }>(
    `(${query.arguments[0].getText(page)});`, bindings);
  return { bindings, onSuccess: options.onSuccess };
}
describe('两个真实 onSuccess：variables.userId 绑定、保存 pending 与切用户竞争', () => {
  it.each(['adjMutation', 'multiAssetAdjMutation'] as const)('%s 不返回/await 慢刷新 promise，保存 pending 可立即结束', async name => {
    const slow = deferred();
    const test = successHarness(name, 28, () => slow.promise);
    let pending = true;
    const result = test.onSuccess({ userId: 999 }, { userId: '28', currency: 'USDT', assetCode: 'ETH' });
    expect(result).toBeUndefined();
    await Promise.resolve(result).then(() => { pending = false; });
    expect(pending).toBe(false);
    expect(test.bindings.refreshAdjWalletAfterChange.mock.calls).toEqual([[28]]);
    expect(test.bindings.rememberRecentAdjUser.mock.calls).toEqual([[28]]);
    expect(test.bindings.adjAmount).toBe('');
    expect(test.bindings.adjNote).toBe('');
    expect(test.bindings.adjUserHistoryTab).toBe(name === 'adjMutation' ? 'stable' : 'digital');
    expect(test.bindings.adjFlowTab).toBe('user');
    expect(test.bindings.adjUserFlowKeyword).toBe('');
    expect(test.bindings.adjUserFlowDatePreset).toBe('all');
    expect(test.bindings.adjUserFlowCustomStart).toBe('');
    expect(test.bindings.adjUserFlowCustomEnd).toBe('');
    expect(test.bindings.adjFundingFlowScope).toEqual({ key: '', page: 1 });
    expect(test.bindings.setAdjLogPage.mock.calls).toEqual([[1]]);
    slow.resolve(); await microtasks();
  });
  it.each(['adjMutation', 'multiAssetAdjMutation'] as const)('%s 保存旧用户后切到新用户：不清表单/Tab/scope，仍刷新旧 variables ID', name => {
    for (const selectedId of [29, null]) {
      const test = successHarness(name, 28);
      // 捕获旧 selectedUser=28，仅更改 render ref，不能用闭包旧值代替真正竞态保护。
      test.bindings.adjSelectedUserIdRef.current = selectedId ?? 0;
      const beforeScope = test.bindings.adjAssetFlowScope;
      const beforeFundingScope = test.bindings.adjFundingFlowScope;
      test.onSuccess({ userId: 29 }, { userId: 28, currency: 'USDT', assetCode: 'ETH' });
      expect(test.bindings.refreshAdjWalletAfterChange.mock.calls).toEqual([[28]]);
      expect(test.bindings.rememberRecentAdjUser.mock.calls).toEqual([[28]]);
      expect(test.bindings.adjAmount).toBe('新用户金额');
      expect(test.bindings.adjNote).toBe('新用户备注');
      expect(test.bindings.adjAssetFlowScope).toBe(beforeScope);
      expect(test.bindings.adjFundingFlowScope).toBe(beforeFundingScope);
      expect(test.bindings.adjUserHistoryTab).toBe('cny');
      expect(test.bindings.adjFlowTab).toBe('balances');
      for (const setter of ['setAdjAmount', 'setAdjNote', 'setAdjUserHistoryTab', 'setAdjAssetFlowScope',
        'setAdjFlowTab', 'setAdjUserFlowKeyword', 'setAdjUserFlowDatePreset', 'setAdjUserFlowCustomStart',
        'setAdjUserFlowCustomEnd', 'setAdjLogPage', 'setAdjFundingFlowScope']) expect(test.bindings[setter], setter).not.toHaveBeenCalled();
    }
  });
  it.each(['all', 'SOL', 'ETH'].flatMap(previousAssetCode =>
    ['ETH', 'MSTR', 'SLV'].map(submittedAssetCode => ({ previousAssetCode, submittedAssetCode }))))
  ('数字币成功旧筛选=$previousAssetCode，提交=$submittedAssetCode：自动显示本笔币种第一页', ({ previousAssetCode, submittedAssetCode }) => {
    const test = successHarness('multiAssetAdjMutation', 28);
    test.bindings.adjAssetFlowScope = { userId: 28, assetCode: previousAssetCode, page: 7 };
    test.onSuccess({ userId: 29, assetCode: 'SOL' }, { userId: 28, assetCode: submittedAssetCode });
    expect(test.bindings.adjAssetFlowScope).toEqual({ userId: 28, page: 1, assetCode: submittedAssetCode });
    expect(test.bindings.adjUserHistoryTab).toBe('digital');
  });
  it('人民币成功使用 variables.currency 分类，不使用响应币种或旧 cny 草稿，仍立即结束 pending', () => {
    const test = successHarness('adjMutation', 28);
    test.bindings.adjUserHistoryTab = 'stable';
    expect(test.onSuccess({ currency: 'USDT' }, { userId: '28', currency: 'CNY' })).toBeUndefined();
    expect(test.bindings.adjUserHistoryTab).toBe('cny');
    expect(test.bindings.refreshAdjWalletAfterChange.mock.calls).toEqual([[28]]);
  });
  it('数字币 scope 函数式更新排队后切人：执行时新用户 scope 不能被清掉', () => {
    const test = successHarness('multiAssetAdjMutation', 28);
    test.bindings.setAdjAssetFlowScope.mockImplementation(() => undefined);
    test.onSuccess(null, { userId: 28, assetCode: 'ETH' });
    const update = test.bindings.setAdjAssetFlowScope.mock.calls[0][0];
    expect(update).toBeTypeOf('function');
    const newScope = { userId: 29, assetCode: 'SOL', page: 9 };
    expect(update(newScope)).toBe(newScope);
  });

  it.each([29, 0])('数字币 scope updater 排队后 ref=%s：即使 current 仍属提交用户，也返回 current 原引用', selectedId => {
    const test = successHarness('multiAssetAdjMutation', 28);
    const current = Object.freeze({ userId: 28, assetCode: 'all', page: 7 });
    test.bindings.adjAssetFlowScope = current;
    test.bindings.setAdjAssetFlowScope.mockImplementation(() => undefined);
    test.onSuccess(null, { userId: 28, assetCode: 'MSTR' });
    expect(test.bindings.setAdjAssetFlowScope).toHaveBeenCalledOnce();
    const update = test.bindings.setAdjAssetFlowScope.mock.calls[0][0];
    expect(update).toBeTypeOf('function');
    // 成功回调时 ref=28 已通过外层守卫；React 排队执行前才切人或取消选择。
    test.bindings.adjSelectedUserIdRef.current = selectedId;
    expect(update(current)).toBe(current);
    expect(current).toEqual({ userId: 28, assetCode: 'all', page: 7 });
    expect(test.bindings.adjAssetFlowScope).toBe(current);
    expect(test.bindings.refreshAdjWalletAfterChange.mock.calls).toEqual([[28]]);
    expect(test.bindings.rememberRecentAdjUser.mock.calls).toEqual([[28]]);
  });
});

describe('单用户快照：同 ID 金额/担保投影，旧 ID 数据绝不混入新用户', () => {
  it.each([28, '28'])('快照 ID=%s 覆盖旧目录金额+担保，数字资产总持有/可用/冻结来自快照', id => {
    const fresh = { id, usdtBalance: 123, usdtFrozen: 23, cnyBalance: 700, cnyFrozen: 70,
      multiAssetBalances: [{ assetCode: 'ETH', availableBalance: '3', frozenBalance: '2', totalBalance: '5' }] };
    const bindings: Record<string, unknown> = { adjSelectedUser: { id: 28, name: '保留名称', usdtBalance: 1 },
      adjWalletSnapshotQuery: { data: fresh }, adjAssetFlowUserId: 28,
      adjWalletPricesQuery: { data: { usdtCnyRate: 7, prices: { ETH: 100 } } },
      getFundingBalanceBreakdown: expression('getFundingBalanceBreakdown'),
      getMultiAssetBreakdown: expression('getMultiAssetBreakdown') };
    for (const name of ['adjSelectedWalletUser', 'adjSelectedUsdtBalance', 'adjSelectedCnyBalance', 'adjSelectedWalletValuation'])
      bindings[name] = expression(name, bindings);
    expect(bindings.adjSelectedWalletUser).toMatchObject({ ...fresh, name: '保留名称' });
    expect(bindings.adjSelectedUsdtBalance).toEqual({ total: 123, frozen: 23, available: 123 - 23 });
    expect(bindings.adjSelectedCnyBalance).toEqual({ total: 700, frozen: 70, available: 700 - 70 });
    expect(bindings.adjSelectedWalletValuation).toMatchObject({
      totalU: 123 + 700 / 7 + 5 * 100, availableU: (123 - 23) + (700 - 70) / 7 + 3 * 100,
      frozenU: 23 + 70 / 7 + 2 * 100,
    });
  });
  it.each([undefined, { id: 28, usdtBalance: 999, usdtFrozen: 999,
    multiAssetBalances: [{ assetCode: 'ETH', frozenBalance: 999 }] }])('空/旧 ID 快照保持新用户完整原值，不能混入任何旧担保', data => {
    const selected = { id: 29, usdtBalance: 40, usdtFrozen: 4, multiAssetBalances: [] };
    expect(expression('adjSelectedWalletUser', { adjSelectedUser: selected,
      adjAssetFlowUserId: 29, adjWalletSnapshotQuery: { data } })).toBe(selected);
  });
  it('真实快照 effect 只更新缓存中同 ID 行；切人后的旧快照不触发任何 setData', () => {
    const effect = required(nodes(page, ts.isCallExpression).find(node =>
      ts.isIdentifier(node.expression) && node.expression.text === 'useEffect'
      && nodes(node.arguments[0], ts.isPropertyAccessExpression).some(access => access.name.text === 'setData')),
    'snapshot cache effect');
    const fresh = { id: '28', usdtBalance: 200, usdtFrozen: 30 };
    const setData = vi.fn();
    const callback = (selectedId: number) => evaluate<() => void>(`(${effect.arguments[0].getText(page)});`, {
      adjWalletSnapshotQuery: { data: fresh }, adjAssetFlowUserId: selectedId,
      adjUtils: { adminUser: { list: { setData } } },
    });
    callback(29)(); expect(setData).not.toHaveBeenCalled();
    callback(28)(); expect(setData).toHaveBeenCalledOnce();
    expect(setData.mock.calls[0][0]).toBeUndefined();
    const update = setData.mock.calls[0][1];
    const other = { id: 29, usdtBalance: 300 };
    expect(update([{ id: 28 }, other])).toEqual([fresh, other]);
    expect(update([{ id: 29 }])).toEqual([{ id: 29 }]);
    expect(update(undefined)).toBeUndefined();
  });
});

type Element = { type: unknown; props: Record<string, any>; children: unknown[] };
const React = { Fragment: 'Fragment', createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element =>
  ({ type, props: props ?? {}, children }) };
function isElement(value: unknown): value is Element { return !!value && typeof value === 'object' && 'type' in value && 'children' in value; }
function elements(value: unknown): Element[] { return Array.isArray(value) ? value.flatMap(elements)
  : isElement(value) ? [value, ...value.children.flatMap(elements)] : []; }
function text(value: unknown): string { return Array.isArray(value) ? value.map(text).join('')
  : isElement(value) ? value.children.map(text).join('')
    : typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
function jsxPanel(id: string) {
  return required(nodes(page, ts.isJsxElement).find(node => node.openingElement.attributes.properties.some(attr =>
    ts.isJsxAttribute(attr) && attr.name.getText(page) === 'id'
    && attr.initializer && (ts.isStringLiteral(attr.initializer) ? attr.initializer.text === id
      : id !== 'adj-digital-history-panel' && attr.initializer.getText(page) === '{`adj-${adjUserHistoryTab}-history-panel`}'))), id);
}
const userTrendJsx = required(nodes(page, ts.isJsxSelfClosingElement).find(node =>
  node.tagName.getText(page) === 'WalletBalanceTrendChart'
  && nodes(node, ts.isIdentifier).some(id => id.text === 'adjUserTrendQuery')), 'user trend JSX');
const chart = realFunction<(props: Record<string, unknown>) => Element>(page, 'WalletBalanceTrendChart', {
  React, useState: () => ['USDT', vi.fn()],
  ...Object.fromEntries(['ResponsiveContainer', 'BarChart', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip', 'Bar'].map(name => [name, name])),
});
function renderTrend(query: Record<string, unknown>) {
  const call = evaluate<Element>(`(${userTrendJsx.getText(page)});`, { React,
    WalletBalanceTrendChart: 'WalletBalanceTrendChart', adjUserTrendQuery: { refetch: vi.fn(), ...query },
    adjSelectedUser: { id: 28, name: 'Ocean' }, adjUserTrendDays: 30, setAdjUserTrendDays: vi.fn() });
  return { call, tree: chart(call.props) };
}
function renderHistory(tab: 'stable' | 'cny' | 'digital', query: Record<string, unknown>) {
  const bindings: Record<string, unknown> = { React, AI_WALLET_SETTLEMENT_ASSETS,
    adjSelectedUser: { id: 28, name: 'Ocean' }, adjHistoryQuery: query, adjMultiAssetHistoryQuery: query,
    adjUserHistoryTab: tab, getWalletFlowCategory, getWalletFundingCurrency, adjCommonNotes: [],
    adjAssetFlowCurrency: 'all', adjAssetFlowUserId: 28, adjAssetFlowDisplayedPage: 1, adjAssetFlowTotalPages: 1,
    adjUserFlowKeyword: '', adjUserFlowDatePreset: 'all', adjUserFlowCustomStart: '', adjUserFlowCustomEnd: '',
    adjFundingFlowScope: { key: '', page: 1 }, ADJ_PAGE_SIZE: 20,
    PrevIcon: 'PrevIcon', NextIcon: 'NextIcon', LedgerFlowFilters: 'LedgerFlowFilters',
    cleanAdjustmentNote: expression('cleanAdjustmentNote'), isReversibleMultiAssetAdjustment: expression('isReversibleMultiAssetAdjustment') };
  for (const name of ['setAdjUserFlowKeyword', 'setAdjUserFlowDatePreset', 'setAdjUserFlowCustomStart',
    'setAdjUserFlowCustomEnd', 'setAdjAssetFlowScope', 'refetchAdjHistory', 'refetchAdjMultiAssetHistory',
    'openMultiAssetRevoke', 'openMultiAssetNoteEditor', 'setRevokeTarget', 'setShowRevokeDialog',
    'setNoteTarget', 'setNoteContent', 'setNoteSelectedCommonNote', 'setShowNoteDialog', 'setAdjFundingFlowScope']) bindings[name] = vi.fn();
  bindings.getLedgerDateRange = expression('getLedgerDateRange', { formatLedgerDate: expression('formatLedgerDate') });
  bindings.formatLedgerDate = expression('formatLedgerDate');
  for (const name of ['adjHistory', 'adjUserDateRange', 'adjUserKeyword', 'adjCategoryHistory', 'adjFilteredHistory',
    'adjFundingFlowKey', 'adjFundingFlowTotalPages', 'adjFundingFlowPage', 'adjPagedHistory',
    'adjVisibleMultiAssetHistory', 'adjAssetFlowTotal']) bindings[name] = expression(name, bindings);
  return evaluate<Element>(`(${jsxPanel(`adj-${tab}-history-panel`).getText(page)});`, bindings);
}
describe('真实 JSX：走势缓存不隐藏、未返回或失败不展示假零/空流水', () => {
  it.each([false, true])('缓存走势后台 isFetching，isError=%s 仍保留柱图和金额', isError => {
    const data = { current: { usdt: 123 }, change: { usdt: 5 }, series: [{ date: '2026-11-16', usdt: 123 }] };
    const rendered = renderTrend({ data, isLoading: false, isFetching: true, isError });
    expect(rendered.call.props.isLoading).toBe(false);
    expect(text(rendered.tree)).toContain('123.00');
    expect(elements(rendered.tree).some(node => node.type === 'BarChart')).toBe(true);
    expect(text(rendered.tree)).not.toContain('资金走势加载中');
    if (isError) expect(text(rendered.tree)).toContain('走势更新失败');
  });
  it.each([false, true])('走势没有 data，isError=%s 只显示加载/错误及占位，不显示 0 或无流水', isError => {
    const rendered = renderTrend({ data: undefined, isLoading: !isError, isFetching: !isError, isError });
    expect(text(rendered.tree)).not.toContain('0.00');
    expect(text(rendered.tree)).not.toContain('暂无可用于计算走势');
    expect(elements(rendered.tree).some(node => node.type === 'BarChart')).toBe(false);
    expect(text(rendered.tree)).toContain('—');
    expect(text(rendered.tree)).toContain(isError ? '走势更新失败' : '资金走势加载中');
  });
  it('走势尚未返回且暂停/未开始 fetching：不可将缺失数据当成无资金记录', () => {
    const rendered = renderTrend({ data: undefined, isLoading: false, isFetching: false, isError: false });
    expect(text(rendered.tree)).toContain('—');
    expect(text(rendered.tree)).not.toContain('0.00');
    expect(text(rendered.tree)).not.toContain('暂无可用于计算走势');
    expect(elements(rendered.tree).some(node => node.type === 'BarChart')).toBe(false);
  });
  it.each(['stable', 'cny', 'digital'] as const)('%s 未返回数据不显示“0 条/暂无流水”', tab => {
    const tree = renderHistory(tab, { data: undefined, isLoading: true, isFetching: true, isError: false });
    expect(text(tree)).not.toMatch(/共 0 条|暂无.*流水/);
    expect(text(tree)).toContain('加载中');
  });
  it.each(['stable', 'cny', 'digital'] as const)('%s 读取失败不伪装成“0 条/暂无流水”，保留手动重读入口', tab => {
    const tree = renderHistory(tab, { data: undefined, isLoading: false, isFetching: false, isError: true });
    expect(text(tree)).not.toMatch(/共 0 条|暂无.*流水/);
    expect(text(tree)).toContain('失败');
    expect(elements(tree).some(node => node.type === 'button' && text(node).includes('重新加载'))).toBe(true);
  });
  it.each([['stable', 'USDT'], ['cny', 'CNY']] as const)('%s 旧缓存重读失败仍保留原明细，不清成空流水', (tab, currency) => {
    const tree = renderHistory(tab, { data: [{ id: 'manual_8', amount: '12', currency,
      sourceType: 'manual', note: '缓存资金事实', createdAt: '2026-11-16T08:00:00Z' }], isError: true });
    expect(text(tree)).toContain('缓存资金事实');
    expect(text(tree)).toContain('流水更新失败');
    expect(text(tree)).toContain('共 1 条');
    expect(text(tree)).not.toMatch(/暂无.*流水/);
  });
  it.each([['stable', 'USDT'], ['cny', 'CNY']] as const)('%s 已有缓存在后台 loading/fetching 时仍展示原明细与分类总数', (tab, currency) => {
    const tree = renderHistory(tab, { data: [{ id: 'manual_9', amount: '12', currency,
      sourceType: 'manual', note: '加载中保留事实', createdAt: '2026-11-16T08:00:00Z' }],
      isLoading: true, isFetching: true, isError: false });
    expect(text(tree)).toContain('加载中保留事实');
    expect(text(tree)).toContain('共 1 条');
    expect(text(tree)).not.toMatch(/明细加载中|暂无.*流水/);
  });
});

function queryOptions(name: string, bindings: Record<string, unknown>) {
  const call = initializer(page, name);
  if (!ts.isCallExpression(call)) throw new Error(`Expected useQuery: ${name}`);
  return evaluate<Record<string, unknown>>(`(${call.arguments[1].getText(page)});`, bindings);
}
describe('真实 useQuery 门控：隐藏监控/全局禁用，当前用户三种数据 15 秒定向轮询', () => {
  it.each(['ordersQuery', 'pendingOrdersQuery', 'statsQuery', 'heartbeatQuery', 'unmatchedQuery',
    'adjGlobalLog', 'adjGlobalTrendQuery'])('%s 在 adjust/user 页禁用隐藏查询', name => {
    expect(queryOptions(name, { mainTab: 'adjust', adjFlowTab: 'user' }).enabled).toBe(false);
  });
  it.each(['adjWalletSnapshotQuery', 'adjHistoryQuery', 'adjMultiAssetHistoryQuery'])('%s 只对当前用户 15 秒轮询且焦点重读', name => {
    for (const mainTab of ['adjust', 'records', 'monitor']) for (const selected of [false, true]) {
      const bindings = { mainTab, adjSelectedUser: selected ? { id: 28 } : null, adjAssetFlowUserId: selected ? 28 : 0 };
      const options = queryOptions(name, bindings);
      expect(options.enabled).toBe(mainTab === 'adjust' && selected);
      expect(options.refetchInterval).toBe(15_000);
      expect(options.refetchOnWindowFocus).toBe(true);
    }
    const call = initializer(page, name) as ts.CallExpression;
    const inputs = evaluate<Record<string, unknown>>(`(${call.arguments[0].getText(page)});`, {
      adjAssetFlowUserId: 29, adjSelectedUser: { id: '29' }, adjAssetFlowPage: 3,
      adjAssetFlowCurrency: 'ETH', ADJ_PAGE_SIZE: 10,
    });
    expect(inputs).toEqual(name === 'adjHistoryQuery' ? { viewAsUserId: 29 }
      : name === 'adjWalletSnapshotQuery' ? { userId: 29 }
        : { userId: 29, page: 3, pageSize: 10, assetCode: 'ETH' });
  });
  it('全局流水/总资产走势仅真实对应 Tab 启用，用户趋势只在选中用户时启用', () => {
    for (const adjFlowTab of ['user', 'global', 'balances']) {
      const bindings = { mainTab: 'adjust', adjFlowTab, adjSelectedUser: { id: 28 } };
      expect(queryOptions('adjGlobalLog', bindings).enabled).toBe(adjFlowTab === 'global');
      expect(queryOptions('adjGlobalTrendQuery', bindings).enabled).toBe(adjFlowTab === 'balances');
      expect(queryOptions('adjUserTrendQuery', bindings).enabled).toBe(adjFlowTab === 'user');
    }
    expect(queryOptions('adjUserTrendQuery', { mainTab: 'adjust', adjFlowTab: 'user', adjSelectedUser: null }).enabled).toBe(false);
  });
});

function usersHarness(options: { failAt?: number; noConnection?: boolean; connectionError?: Error; assetInitError?: Error; empty?: boolean } = {}) {
  const failure = new Error('offline isolated SELECT failure');
  const calls: { sql: string; params: number[] }[] = [];
  let ids = [28, 29];
  const conn = { execute: vi.fn(async (sql: string, params: number[]) => {
    calls.push({ sql, params: [...params] });
    // 只读 SELECT 断言：若真实 AST 意外包含写入，在 mock 边界立即失败。
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error('Forbidden non-SELECT in isolated wallet snapshot');
    if (calls.length === options.failAt) throw failure;
    if (calls.length === 1) {
      ids = /WHERE u\.id = \?/.test(sql) ? [params[0]] : [28, 29];
      return [options.empty ? [] : ids.map(id => ({ id, name: `user-${id}`, balance: '10' }))];
    }
    if (/COUNT\(\*\)/.test(sql)) return [ids.map(userId => ({ userId, orderCount: '3' }))];
    if (/AS usdtBalance/.test(sql)) return [ids.map(userId => ({ userId, usdtBalance: '123' }))];
    if (/AS cnyBalance/.test(sql)) return [ids.map(userId => ({ userId, cnyBalance: '700' }))];
    if (/FROM ai_wallet_project_holds/.test(sql)) return [ids.flatMap(userId => [
      { userId, assetCode: 'USDT', frozen: '23' }, { userId, assetCode: 'CNY', frozen: '70' },
    ])];
    if (/FROM ai_wallet_asset_balances/.test(sql)) return [ids.map(user_id => ({
      user_id, asset_code: 'ETH', available_balance: '3', frozen_balance: '2', total_balance: '5', updated_at: 'offline',
    }))];
    throw new Error(`Unrecognized isolated SELECT: ${sql}`);
  }) };
  const getDbConnection = vi.fn(async () => {
    if (options.connectionError) throw options.connectionError;
    return options.noConnection ? null : conn;
  });
  const ensureMultiAssetWalletInfrastructure = vi.fn(async () => {
    if (options.assetInitError) throw options.assetInitError;
  });
  // 执行真实数字资产批量函数，形成第六轮真实 SELECT；仅初始化与格式化工具为边界。
  const getMultiAssetBalancesForUsers = realFunction<(ids: number[]) => Promise<Map<number, unknown>>>(assets,
    'getMultiAssetBalancesForUsers', { getDbConnection, ensureMultiAssetWalletInfrastructure,
      asRows: (rows: unknown) => Array.isArray(rows) ? rows : [],
      normalizeMultiAssetWalletAsset: (code: string) => code, getAssetName: (code: string) => code });
  const getAllUsers = realFunction<(targetUserId?: number) => Promise<Record<string, any>[]>>(miban, 'getAllUsers', {
    getDbConnection, getMultiAssetBalancesForUsers, console: { warn: vi.fn(), error: vi.fn() },
  });
  return { getAllUsers, failure, calls, conn, getDbConnection, ensureMultiAssetWalletInfrastructure };
}
describe('真实 getAllUsers(targetUserId?) + 数字资产函数：六轮 SELECT 参数范围与错误传播', () => {
  it('target 模式六轮 SELECT 全部只绑定目标 ID，并返回真实金额/担保/数字资产总持有', async () => {
    const test = usersHarness();
    const users = await test.getAllUsers(28);
    expect(test.calls).toHaveLength(6);
    expect(test.calls.map(call => call.params)).toEqual([[28], [28], [28, 28], [28, 28], [28], [28]]);
    expect(test.calls[0].sql).toContain('WHERE u.id = ?');
    expect(test.calls.every(call => call.params.every(id => id === 28))).toBe(true);
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ id: 28, orderCount: 3, usdtBalance: 123, cnyBalance: 700,
      usdtFrozen: 23, cnyFrozen: 70, multiAssetBalances: [{ assetCode: 'ETH', availableBalance: '3', frozenBalance: '2', totalBalance: '5' }] });
    expect(test.ensureMultiAssetWalletInfrastructure).toHaveBeenCalledOnce();
  });
  it('全局 list 保留六轮批量聚合及原用户范围：基本查询无 WHERE，后续参数涵盖全部用户', async () => {
    const test = usersHarness();
    const users = await test.getAllUsers();
    expect(test.calls).toHaveLength(6);
    expect(test.calls[0].sql).not.toContain('WHERE u.id = ?');
    expect(test.calls.map(call => call.params)).toEqual([[], [28, 29], [28, 29, 28, 29], [28, 29, 28, 29], [28, 29], [28, 29]]);
    expect(users.map(user => user.id)).toEqual([28, 29]);
  });
  it.each([1, 2, 3, 4, 5, 6])('target 第 %s 轮查询失败直接抛同一错误，绝不返回假零', async failAt => {
    const test = usersHarness({ failAt });
    await expect(test.getAllUsers(28)).rejects.toBe(test.failure);
    expect(test.calls).toHaveLength(failAt);
  });
  it.each([1, 2, 3, 4, 5, 6])('全局第 %s 轮失败保留已有兼容：首轮空列表，后续局部默认不破坏其他数据', async failAt => {
    const test = usersHarness({ failAt });
    const users = await test.getAllUsers();
    if (failAt === 1) { expect(users).toEqual([]); return; }
    expect(test.calls).toHaveLength(6);
    expect(users.map(user => user.id)).toEqual([28, 29]);
    expect(users[0]).toMatchObject({ orderCount: failAt === 2 ? 0 : 3,
      usdtBalance: failAt === 3 ? 10 : 123, cnyBalance: failAt === 4 ? 0 : 700,
      usdtFrozen: failAt === 5 ? 0 : 23, cnyFrozen: failAt === 5 ? 0 : 70 });
    expect(users[0].multiAssetBalances).toHaveLength(failAt === 6 ? 0 : 1);
  });
  it('连接为 null：target 明确失败，旧全局 list 仍空数组兼容', async () => {
    const test = usersHarness({ noConnection: true });
    await expect(test.getAllUsers(28)).rejects.toThrow('数据库不可用');
    await expect(test.getAllUsers()).resolves.toEqual([]);
    expect(test.calls).toEqual([]);
  });
  it('连接异常与资产基础设施异常 target 都抛原错误；不偷偷伪造零资产', async () => {
    const error = new Error('offline unavailable');
    await expect(usersHarness({ connectionError: error }).getAllUsers(28)).rejects.toBe(error);
    await expect(usersHarness({ assetInitError: error }).getAllUsers(28)).rejects.toBe(error);
    const global = await usersHarness({ assetInitError: error }).getAllUsers();
    expect(global[0]).toMatchObject({ usdtBalance: 123, cnyBalance: 700, multiAssetBalances: [] });
  });
  it('目标用户不存在只执行第一轮 SELECT，留给快照接口 NOT_FOUND', async () => {
    const test = usersHarness({ empty: true });
    await expect(test.getAllUsers(28)).resolves.toEqual([]);
    expect(test.calls).toHaveLength(1);
  });
});

const snapshotProperty = required(nodes(miban, ts.isPropertyAssignment).find(node =>
  node.name.getText(miban) === 'walletSnapshot'), 'walletSnapshot route');
function snapshotHarness(getAllUsers: (id?: number) => Promise<unknown[]>) {
  const middleware = evaluate<(args: { ctx: { user: { role: string } }; next: ReturnType<typeof vi.fn> }) => Promise<unknown>>(
    `(${(initializer(miban, 'mibanAdminProcedure') as ts.CallExpression).arguments[0].getText(miban)});`, { TRPCError });
  const chain = { input: vi.fn((schema: unknown) => { result.schema = schema; return chain; }),
    query: vi.fn((handler: unknown) => { result.handler = handler; return chain; }) };
  const result: { schema?: any; handler?: any } = {};
  evaluate(`(${snapshotProperty.initializer.getText(miban)});`, { mibanAdminProcedure: chain, z, getAllUsers, TRPCError });
  return { middleware, chain, schema: result.schema, handler: result.handler };
}
describe('真实 walletSnapshot 输入/中间件/NOT_FOUND：服务端管理员授权不可被前端代替', () => {
  it('快照权限链明确基于 mibanAdminProcedure；只接受正整数 userId', () => {
    expect(nodes(snapshotProperty.initializer, ts.isIdentifier).map(id => id.text)).toContain('mibanAdminProcedure');
    expect(nodes(snapshotProperty.initializer, ts.isIdentifier).map(id => id.text)).not.toContain('publicProcedure');
    const test = snapshotHarness(vi.fn(async () => []));
    expect(test.schema.parse({ userId: 28 })).toEqual({ userId: 28 });
    for (const userId of [0, -1, 1.5, '28', undefined, NaN, Infinity])
      expect(test.schema.safeParse({ userId }).success).toBe(false);
  });
  it.each(['admin', 'user', 'baby', 'parent', ''])('role=%s 不可读取管理员钱包快照，next 未调用', async role => {
    const test = snapshotHarness(vi.fn(async () => []));
    const next = vi.fn();
    await expect(test.middleware({ ctx: { user: { role } }, next })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(next).not.toHaveBeenCalled();
  });
  it('super_admin 通过真实中间件，并按输入 userId 返回快照对象本身', async () => {
    const user = { id: 28, usdtBalance: 123, usdtFrozen: 23 };
    const read = vi.fn(async () => [user]);
    const test = snapshotHarness(read);
    const ctx = { user: { role: 'super_admin' } };
    const next = vi.fn(async () => 'allowed');
    await expect(test.middleware({ ctx, next })).resolves.toBe('allowed');
    expect(next.mock.calls).toEqual([[{ ctx }]]);
    await expect(test.handler({ input: { userId: 28 } })).resolves.toBe(user);
    expect(read.mock.calls).toEqual([[28]]);
  });
  it('真实 query 缺用户报 NOT_FOUND；DB 读取错误原样传播，不变成假零或 NOT_FOUND', async () => {
    await expect(snapshotHarness(vi.fn(async () => [])).handler({ input: { userId: 28 } }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    const error = new Error('offline DB read failed');
    await expect(snapshotHarness(vi.fn(async () => { throw error; })).handler({ input: { userId: 28 } }))
      .rejects.toBe(error);
  });
});

// 只抽取 afGetMyRechargeHistory 内真正的三个 catch，不求值整个 router/SQL/tagged template。
const historyRoute = required(nodes(routers, ts.isPropertyAssignment).find(node =>
  node.name.getText(routers) === 'afGetMyRechargeHistory'), 'afGetMyRechargeHistory');
const historyCatches = nodes(historyRoute, ts.isCatchClause);
function runCatch(index: number, error: unknown) {
  const clause = required(historyCatches[index], `history catch ${index}`);
  const name = required(clause.variableDeclaration, 'catch binding').name.getText(routers);
  const handler = evaluate<(error: unknown) => unknown>(`(function(${name}) ${clause.block.getText(routers)});`);
  return handler(error);
}
describe('afGetMyRechargeHistory 三个真实 catch：只允许 optional 缺表兼容，绝不吞读失败', () => {
  it('AST 仅有手动台账/本金冻结/balance_history 三个 catch 且顺序与真实 SQL 一致', () => {
    expect(historyCatches).toHaveLength(3);
    expect(historyCatches.map(clause => clause.parent.getText(routers))).toEqual([
      expect.stringContaining('FROM af_manual_balances'), expect.stringContaining('FROM ai_wallet_project_holds'),
      expect.stringContaining('FROM balance_history'),
    ]);
  });
  it.each([0, 1])('optional catch=%s 仅 ER_NO_SUCH_TABLE（含 cause.code）允许兼容', index => {
    expect(() => runCatch(index, Object.assign(new Error('missing optional table'), { code: 'ER_NO_SUCH_TABLE' }))).not.toThrow();
    expect(() => runCatch(index, Object.assign(new Error('wrapped missing table'), { cause: { code: 'ER_NO_SUCH_TABLE' } }))).not.toThrow();
  });
  it.each([0, 1, 2])('catch=%s 连接/超时/权限/SQL/未知错误原对象重新抛出', index => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'ER_LOCK_WAIT_TIMEOUT', 'ER_ACCESS_DENIED_ERROR', 'ER_PARSE_ERROR', undefined]) {
      const error = Object.assign(new Error(`offline ${code}`), { code });
      let caught: unknown;
      try { runCatch(index, error); } catch (value) { caught = value; }
      expect(caught, `catch=${index} code=${code}`).toBe(error);
    }
    const wrapped = Object.assign(new Error('wrapped network error'), { cause: { code: 'ECONNRESET' } });
    let caught: unknown;
    try { runCatch(index, wrapped); } catch (value) { caught = value; }
    expect(caught).toBe(wrapped);
  });
  it('balance_history 缺表也必须抛错，当前写入台账不能被当作 optional', () => {
    for (const error of [Object.assign(new Error('missing history'), { code: 'ER_NO_SUCH_TABLE' }),
      Object.assign(new Error('wrapped missing history'), { cause: { code: 'ER_NO_SUCH_TABLE' } })]) {
      let caught: unknown;
      try { runCatch(2, error); } catch (value) { caught = value; }
      expect(caught).toBe(error);
    }
  });
  it.each([0, 1])('optional catch=%s 优先直接 code：不能用 cause 缺表掩盖真实连接错误', index => {
    const error = Object.assign(new Error('network error'), { code: 'ECONNRESET', cause: { code: 'ER_NO_SUCH_TABLE' } });
    let caught: unknown;
    try { runCatch(index, error); } catch (value) { caught = value; }
    expect(caught).toBe(error);
  });
});
