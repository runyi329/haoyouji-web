import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshAdminWalletSnapshot } from '../client/src/lib/adminWalletSnapshotRefresh';

// 严格离线：真实 TanStack 缓存/observer + 真实无副作用 helper；页面只读取 AST。
// queryFn 是内存 deferred 读取，不加载页面/router/DB/tRPC 客户端或执行网络/资金写入。
// 明确限定首次请求无 data 的竞态；已有 data 的 refetch 另有旧 invalidate 正常工作的对照。
type Snapshot = {
  id: number | string; usdtBalance: number; usdtFrozen: number; cnyBalance: number; cnyFrozen: number;
  multiAssetBalances: { assetCode: string; availableBalance: string; frozenBalance: string; totalBalance: string }[];
};
const oldSnapshot: Snapshot = { id: 28, usdtBalance: 100, usdtFrozen: 20, cnyBalance: 700, cnyFrozen: 70,
  multiAssetBalances: [{ assetCode: 'ETH', availableBalance: '3', frozenBalance: '2', totalBalance: '5' }] };
const freshSnapshot: Snapshot = { id: 28, usdtBalance: 150, usdtFrozen: 35, cnyBalance: 980, cnyFrozen: 140,
  multiAssetBalances: [{ assetCode: 'ETH', availableBalance: '7', frozenBalance: '1', totalBalance: '8' }] };
const otherSnapshot: Snapshot = { id: 29, usdtBalance: 900, usdtFrozen: 9, cnyBalance: 70, cnyFrozen: 7,
  multiAssetBalances: [{ assetCode: 'ETH', availableBalance: '1', frozenBalance: '0', totalBalance: '1' }] };
const ast = ts.createSourceFile('AfRechargeManage.tsx',
  readFileSync(new URL('../client/src/pages/AfRechargeManage.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root); return found;
}
function initializer(name: string) {
  const value = nodes(ast, ts.isVariableDeclaration).find(node => ts.isIdentifier(node.name) && node.name.text === name)?.initializer;
  if (!value) throw new Error(`Missing production AST: ${name}`);
  return value;
}
function evaluate<T>(code: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(code, { fileName: 'offline.tsx', compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
  } });
  return runInNewContext(outputText, { process: undefined, fetch: undefined, window: undefined, ...bindings }, { timeout: 1_000 }) as T;
}
function expression<T = any>(name: string, bindings: Record<string, unknown> = {}): T {
  return evaluate<T>(`(${initializer(name).getText(ast)});`, bindings);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function microtasks() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
const cleanup: (() => void)[] = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); });
function cacheHarness(initial = oldSnapshot) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  cleanup.push(() => client.clear());
  const committed = new Map<number, Snapshot>([[28, initial], [29, otherSnapshot]]);
  const requests: { userId: number; captured: Snapshot; pending: ReturnType<typeof deferred<Snapshot>> }[] = [];
  // 与 tRPC v11 utility 一致的 key/filter/QueryClient 调用边界；仅传输 queryFn 用内存替代。
  const key = (userId: number) => [['adminUser', 'walletSnapshot'], { input: { userId }, type: 'query' }] as const;
  const read = vi.fn((userId: number) => {
    const pending = deferred<Snapshot>();
    requests.push({ userId, captured: committed.get(userId)!, pending });
    // 故意不消费 AbortSignal：真实底层 transport 即使仍响应，取消的 retryer 也不能回填旧快照。
    return pending.promise;
  });
  const options = (userId: number) => ({ queryKey: key(userId), queryFn: () => read(userId), staleTime: 10_000 });
  const observe = (userId: number) => {
    const observer = new QueryObserver(client, options(userId));
    const listener = vi.fn();
    const unsubscribe = observer.subscribe(listener);
    cleanup.push(() => { unsubscribe(); observer.destroy(); });
    return { observer, listener };
  };
  const utils = {
    cancel: vi.fn((input: { userId: number }) => client.cancelQueries({ queryKey: key(input.userId) })),
    invalidate: vi.fn((input: { userId: number }, filters?: { refetchType?: 'none' }, opts?: { cancelRefetch?: boolean; throwOnError?: boolean }) =>
      client.invalidateQueries({ ...filters, queryKey: key(input.userId) }, opts)),
    fetch: vi.fn((input: { userId: number }, opts: { staleTime: number }) => client.fetchQuery({ ...options(input.userId), ...opts })),
  };
  const resolve = (index: number, value = requests[index].captured) => requests[index].pending.resolve(value);
  return { client, committed, requests, key, read, options, observe, utils, resolve };
}
function project(data: unknown, selected: Snapshot = oldSnapshot) {
  const bindings: Record<string, any> = { adjSelectedUser: selected, adjAssetFlowUserId: Number(selected.id),
    adjWalletSnapshotQuery: { data }, adjWalletPricesQuery: { data: { usdtCnyRate: 7, prices: { ETH: 100 } } },
    getFundingBalanceBreakdown: expression('getFundingBalanceBreakdown'), getMultiAssetBreakdown: expression('getMultiAssetBreakdown') };
  for (const name of ['adjSelectedWalletUser', 'adjSelectedUsdtBalance', 'adjSelectedCnyBalance', 'adjSelectedWalletValuation'])
    bindings[name] = expression(name, bindings);
  return { user: bindings.adjSelectedWalletUser, usdt: bindings.adjSelectedUsdtBalance,
    cny: bindings.adjSelectedCnyBalance, eth: bindings.getMultiAssetBreakdown(bindings.adjSelectedWalletUser.multiAssetBalances[0]),
    valuation: bindings.adjSelectedWalletValuation };
}
function expectFreshHeader(data: unknown) {
  const header = project(data);
  expect(header.user).toEqual(freshSnapshot);
  expect(header.usdt).toEqual({ total: 150, available: 150 - 35, frozen: 35 });
  expect(header.cny).toEqual({ total: 980, available: 980 - 140, frozen: 140 });
  expect(header.eth).toEqual({ total: 8, available: 7, frozen: 1 });
  expect(header.valuation).toMatchObject({ totalU: 150 + 980 / 7 + 8 * 100,
    availableU: (150 - 35) + (980 - 140) / 7 + 7 * 100, frozenU: 35 + 140 / 7 + 100 });
}
function pageRefresh(h: ReturnType<typeof cacheHarness>) {
  const funding = vi.fn(async () => undefined), digital = vi.fn(async () => undefined);
  const background = vi.fn(async () => undefined), mutation = vi.fn(() => { throw new Error('Forbidden funds replay'); });
  const toast = { success: vi.fn(), error: vi.fn() };
  const refresh = expression<(userId: number) => Promise<void>>('refreshAdjWalletAfterChange', {
    refreshAdminWalletSnapshot, toast, adjUtils: { adminUser: { walletSnapshot: h.utils,
      multiAssetWalletHistoryPage: { invalidate: digital }, list: { invalidate: background },
      walletGlobalHistory: { invalidate: background }, walletBalanceTrend: { invalidate: background },
      multiAssetWalletHistory: { invalidate: background } }, ledger: { afGetMyRechargeHistory: { invalidate: funding } } },
    adjMutation: { mutate: mutation, mutateAsync: mutation }, multiAssetAdjMutation: { mutate: mutation, mutateAsync: mutation },
  });
  return { refresh, funding, digital, background, mutation, toast };
}

describe('首次钱包快照无 data 时的真实 TanStack 竞态与提交后头部', () => {
  it('旧 invalidate(cancelRefetch:true) 无缓存 data 时复用旧 retryer promise，提交后仍拿到提交前快照', async () => {
    const h = cacheHarness(), { observer } = h.observe(28);
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(observer.getCurrentResult().fetchStatus).toBe('fetching');
    const query = h.client.getQueryCache().find({ queryKey: h.key(28) })!;
    const firstPromise = query.promise;
    h.committed.set(28, freshSnapshot);
    const oldRefresh = h.utils.invalidate({ userId: 28 }, undefined, { cancelRefetch: true, throwOnError: true });
    expect(query.promise).toBe(firstPromise);
    expect(h.read).toHaveBeenCalledTimes(1);
    h.resolve(0); await oldRefresh;
    expect(observer.getCurrentResult().data).toEqual(oldSnapshot);
    expect(h.client.getQueryData(h.key(28))).toEqual(oldSnapshot);
    expect(project(observer.getCurrentResult().data).eth).toEqual({ total: 5, available: 3, frozen: 2 });
    expect(h.utils.cancel).not.toHaveBeenCalled();
  });

  it('真实 helper 先取消首次旧读取，再 invalidate(none)+fetch(staleTime:0)，完整新 data 驱动真实头部 AST', async () => {
    const h = cacheHarness(), { observer, listener } = h.observe(28);
    const firstPromise = h.client.getQueryCache().find({ queryKey: h.key(28) })!.promise;
    expect(observer.getCurrentResult().data).toBeUndefined();
    h.committed.set(28, freshSnapshot);
    const running = refreshAdminWalletSnapshot(h.utils, 28);
    expect(h.utils.cancel.mock.calls).toEqual([[{ userId: 28 }]]);
    expect(h.utils.invalidate).not.toHaveBeenCalled();
    expect(h.utils.fetch).not.toHaveBeenCalled();
    await microtasks();
    expect(h.utils.invalidate.mock.calls).toEqual([[{ userId: 28 }, { refetchType: 'none' }]]);
    expect(h.utils.fetch.mock.calls).toEqual([[{ userId: 28 }, { staleTime: 0 }]]);
    expect(h.utils.cancel.mock.invocationCallOrder[0]).toBeLessThan(h.utils.invalidate.mock.invocationCallOrder[0]);
    expect(h.utils.invalidate.mock.invocationCallOrder[0]).toBeLessThan(h.utils.fetch.mock.invocationCallOrder[0]);
    expect(h.read.mock.calls).toEqual([[28], [28]]);
    expect(h.client.getQueryCache().find({ queryKey: h.key(28) })!.promise).not.toBe(firstPromise);
    h.resolve(1); await expect(running).resolves.toEqual(freshSnapshot);
    expectFreshHeader(observer.getCurrentResult().data);
    expect(h.client.getQueryData(h.key(28))).toEqual(freshSnapshot);
    const updates = listener.mock.calls.length;
    h.resolve(0); await microtasks();
    expectFreshHeader(observer.getCurrentResult().data);
    expect(listener.mock.calls).toHaveLength(updates); // 迟到的旧 transport 不能再写 cache 或头部。
  });

  it('对照：已有缓存 data 的慢 refetch，旧 invalidate 本来就会取消并启动新读取，不泛称所有轮询失效', async () => {
    const h = cacheHarness(); h.client.setQueryData(h.key(28), oldSnapshot);
    const { observer } = h.observe(28);
    const polling = observer.refetch();
    expect(h.read).toHaveBeenCalledTimes(1);
    h.committed.set(28, freshSnapshot);
    const refreshing = h.utils.invalidate({ userId: 28 }, undefined, { cancelRefetch: true, throwOnError: true });
    expect(h.read).toHaveBeenCalledTimes(2);
    h.resolve(1); await refreshing; await polling;
    h.resolve(0); await microtasks();
    expectFreshHeader(observer.getCurrentResult().data);
  });

  it('缓存仍处于10秒fresh窗口也只发一次提交后读取，invalidate none 不额外触发 observer refetch', async () => {
    const h = cacheHarness(); h.client.setQueryData(h.key(28), oldSnapshot);
    const { observer } = h.observe(28);
    expect(h.read).not.toHaveBeenCalled();
    h.committed.set(28, freshSnapshot);
    const running = refreshAdminWalletSnapshot(h.utils, 28); await microtasks();
    expect(h.read).toHaveBeenCalledTimes(1);
    h.resolve(0); await running;
    expectFreshHeader(observer.getCurrentResult().data);
  });

  it.each(['adjMutation', 'multiAssetAdjMutation'])('%s 真实成功 AST 不读 mutation 返回余额、不估算、不重放写入，只刷新 variables ID', async name => {
    const h = cacheHarness(), { observer } = h.observe(28), page = pageRefresh(h);
    const completions: Promise<void>[] = [];
    const refresh = vi.fn((userId: number) => { const p = page.refresh(userId); completions.push(p); return p; });
    const setters = Object.fromEntries(['setAdjAmount', 'setAdjNote', 'setAdjLogPage'].map(key => [key, vi.fn()]));
    const query = initializer(name);
    if (!ts.isCallExpression(query)) throw new Error('Expected real useMutation');
    const callbacks = evaluate<{ onSuccess: (result: unknown, vars: unknown) => unknown }>(`(${query.arguments[0].getText(ast)});`, {
      ...setters, toast: page.toast, rememberRecentAdjUser: vi.fn(), showAdjSubmittedCurrency: vi.fn(() => true), refreshAdjWalletAfterChange: refresh,
    });
    const result = new Proxy({ id: 999, balanceAfter: 999999, frozenBalance: 999999 }, { get: () => { throw new Error('Mutation result must not drive header'); } });
    h.committed.set(28, freshSnapshot);
    expect(callbacks.onSuccess(result, { userId: '28', currency: 'USDT', assetCode: 'ETH', amount: '999999' })).toBeUndefined();
    expect(refresh.mock.calls).toEqual([[28]]);
    expect(page.funding.mock.calls).toEqual([[{ viewAsUserId: 28 }, undefined, { cancelRefetch: true, throwOnError: true }]]);
    expect(page.digital.mock.calls).toEqual([[{ userId: 28 }, undefined, { cancelRefetch: true, throwOnError: true }]]);
    expect(page.background).not.toHaveBeenCalled();
    expect(h.client.getQueryData(h.key(28))).toBeUndefined(); // 没有按提交数量乐观估算金额。
    await microtasks(); h.resolve(1); await Promise.all(completions);
    expectFreshHeader(observer.getCurrentResult().data);
    expect(page.mutation).not.toHaveBeenCalled(); expect(page.toast.error).not.toHaveBeenCalled();
    expect(page.background).toHaveBeenCalledTimes(4);
    h.resolve(0); await microtasks(); expectFreshHeader(observer.getCurrentResult().data);
  });

  it('取消仅目标用户：切到29时其首次读取与promise不受影响，28迟到快照不混入29头部', async () => {
    const h = cacheHarness(), a = h.observe(28), b = h.observe(29);
    const otherPromise = h.client.getQueryCache().find({ queryKey: h.key(29) })!.promise;
    h.committed.set(28, freshSnapshot);
    const running = refreshAdminWalletSnapshot(h.utils, 28); await microtasks();
    expect(h.read.mock.calls).toEqual([[28], [29], [28]]);
    expect(h.client.getQueryCache().find({ queryKey: h.key(29) })!.promise).toBe(otherPromise);
    expect(b.observer.getCurrentResult().fetchStatus).toBe('fetching');
    h.resolve(2); await running;
    expect(project(a.observer.getCurrentResult().data, otherSnapshot).user).toBe(otherSnapshot);
    h.resolve(1); await microtasks();
    expect(h.client.getQueryData(h.key(29))).toEqual(otherSnapshot);
    expect(project(b.observer.getCurrentResult().data, otherSnapshot).user).toEqual(otherSnapshot);
    h.resolve(0); await microtasks();
    expectFreshHeader(a.observer.getCurrentResult().data);
    expect(b.observer.getCurrentResult().data).toEqual(otherSnapshot);
  });

  it('提交后读取失败不恢复取消的首次旧快照，真实页面只提示已保存不可重复添加、不再mutation', async () => {
    const h = cacheHarness(), { observer } = h.observe(28), page = pageRefresh(h);
    h.committed.set(28, freshSnapshot);
    const running = page.refresh(28); await microtasks();
    h.requests[1].pending.reject(new Error('offline read failure'));
    await expect(running).resolves.toBeUndefined();
    expect(page.toast.error.mock.calls).toEqual([['账目已保存，部分余额或流水更新失败，请点更新重试；不要重复添加']]);
    expect(observer.getCurrentResult().status).toBe('error');
    expect(observer.getCurrentResult().data).toBeUndefined();
    h.resolve(0); await microtasks();
    expect(h.client.getQueryData(h.key(28))).toBeUndefined();
    expect(page.mutation).not.toHaveBeenCalled();
    expect(h.read).toHaveBeenCalledTimes(2); // retry=false 的离线边界，无资金自动重放。
  });

  it('失败后显式只读重试能更新真实快照，不需要再次提交资金mutation', async () => {
    const h = cacheHarness(), { observer } = h.observe(28);
    h.committed.set(28, freshSnapshot);
    const failure = refreshAdminWalletSnapshot(h.utils, 28);
    const assertion = expect(failure).rejects.toThrow('offline read failure');
    await microtasks(); h.requests[1].pending.reject(new Error('offline read failure')); await assertion;
    const retry = refreshAdminWalletSnapshot(h.utils, 28); await microtasks();
    expect(h.read).toHaveBeenCalledTimes(3); h.resolve(2); await retry;
    expectFreshHeader(observer.getCurrentResult().data);
    h.resolve(0); await microtasks(); expectFreshHeader(observer.getCurrentResult().data);
  });

  it('整张快照显式0冻结必须覆盖旧冻结，USDT/CNY/ETH可用与总持有同步归一', async () => {
    const h = cacheHarness(), { observer } = h.observe(28);
    const zero: Snapshot = { ...freshSnapshot, usdtFrozen: 0, cnyFrozen: 0,
      multiAssetBalances: [{ assetCode: 'ETH', availableBalance: '8', frozenBalance: '0', totalBalance: '8' }] };
    h.committed.set(28, zero);
    const running = refreshAdminWalletSnapshot(h.utils, 28); await microtasks(); h.resolve(1); await running;
    const header = project(observer.getCurrentResult().data);
    expect(header.usdt).toEqual({ total: 150, available: 150, frozen: 0 });
    expect(header.cny).toEqual({ total: 980, available: 980, frozen: 0 });
    expect(header.eth).toEqual({ total: 8, available: 8, frozen: 0 });
    expect(header.valuation.frozenU).toBe(0); expect(header.valuation.frozenPercent).toBe(0);
    expect(header.valuation.availableU).toBe(header.valuation.totalU);
    h.resolve(0); await microtasks(); expect(project(observer.getCurrentResult().data).usdt.frozen).toBe(0);
  });

  it('快照ID不匹配被真实helper拒绝，真实投影/effect守卫不污染所选用户或目录缓存', async () => {
    const h = cacheHarness(), { observer } = h.observe(28), page = pageRefresh(h);
    const helper = vi.fn(refreshAdminWalletSnapshot);
    const running = helper(h.utils, 28), assertion = expect(running).rejects.toThrow('钱包刷新结果与目标用户不一致');
    await microtasks(); h.resolve(1, otherSnapshot); await assertion;
    // QueryClient先存响应，helper随后验ID；真正头部与list effect还必须有自身身份守卫。
    expect(observer.getCurrentResult().data).toEqual(otherSnapshot);
    expect(project(observer.getCurrentResult().data).user).toBe(oldSnapshot);
    const effect = nodes(ast, ts.isCallExpression).find(node => ts.isIdentifier(node.expression) && node.expression.text === 'useEffect'
      && nodes(node.arguments[0], ts.isPropertyAccessExpression).some(access => access.name.text === 'setData'));
    if (!effect) throw new Error('Missing snapshot projection effect');
    const setData = vi.fn();
    evaluate<() => void>(`(${effect.arguments[0].getText(ast)});`, { adjWalletSnapshotQuery: { data: observer.getCurrentResult().data },
      adjAssetFlowUserId: 28, adjUtils: { adminUser: { list: { setData } } } })();
    expect(setData).not.toHaveBeenCalled();
    const pageRunning = page.refresh(28); await microtasks(); h.resolve(2, otherSnapshot); await pageRunning;
    expect(page.toast.error).toHaveBeenCalledWith('账目已保存，部分余额或流水更新失败，请点更新重试；不要重复添加');
    expect(page.mutation).not.toHaveBeenCalled(); h.resolve(0); await microtasks();
  });

  it('服务端字符串ID兼容数字目标，仍读取全部资产并进入真实querycache投影', async () => {
    const h = cacheHarness(), { observer } = h.observe(28);
    h.committed.set(28, { ...freshSnapshot, id: '28' });
    const running = refreshAdminWalletSnapshot(h.utils, 28); await microtasks(); h.resolve(1); await running;
    expect(project(observer.getCurrentResult().data).usdt.total).toBe(150);
    expect(project(observer.getCurrentResult().data).eth.frozen).toBe(1);
    h.resolve(0); await microtasks(); expect(project(observer.getCurrentResult().data).user.id).toBe('28');
  });

  it('非法目标在cancel/invalidate/fetch前失败，不触发全用户查询范围', async () => {
    const h = cacheHarness();
    for (const userId of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      await expect(refreshAdminWalletSnapshot(h.utils, userId)).rejects.toThrow('钱包刷新用户无效');
    expect(h.utils.cancel).not.toHaveBeenCalled(); expect(h.utils.invalidate).not.toHaveBeenCalled();
    expect(h.utils.fetch).not.toHaveBeenCalled(); expect(h.read).not.toHaveBeenCalled();
  });
});
