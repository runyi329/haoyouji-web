import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { selectFunderWalletCollateralDisplay } from '../shared/funder-wallet-collateral-display';
// 只执行生产纯展示及AST提取的回调；测试fixture不进入产品，网络/DB/资金写入一律禁止。
const parse = (path: string) => ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const card = parse('../client/src/components/FunderOrderCard.tsx');
const management = parse('../client/src/pages/FunderManagement.tsx');
function nodes<T extends ts.Node>(root: ts.Node, guard: (n: ts.Node) => n is T): T[] {
  const found: T[] = []; const visit = (n: ts.Node) => { if (guard(n)) found.push(n); ts.forEachChild(n, visit); }; visit(root); return found;
}
function required<T>(value: T | undefined, name: string): T { if (value === undefined) throw Error(`Missing production AST: ${name}`); return value; }
const fn = (name: string) => required(nodes(card, ts.isFunctionDeclaration).find(n => n.name?.text === name), name).getText().replace(/^export /, '');
const init = (root: ts.Node, name: string) => required(nodes(root, ts.isVariableDeclaration).find(n => n.name.getText() === name)?.initializer, name).getText();
const createElement = (tag: unknown, props: any, ...children: any[]) => ({ tag, props: props ?? {}, children });
const text = (tree: any): string => Array.isArray(tree) ? tree.map(text).join('') : tree?.children ? text(tree.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
function run(source: string, bindings: Record<string, any> = {}): any {
  const forbidden = () => { throw Error('Network/DB/mutation forbidden'); };
  const context = createContext({ selectFunderWalletCollateralDisplay, ledgerId: 52, fetch: forbidden, trpc: new Proxy({}, { get: forbidden }), React: { createElement, Fragment: 'fragment' }, ...bindings });
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Script(output).runInContext(context, { timeout: 1000 });
}
function harness(failKey = '') {
  const reads = new Map<string, ReturnType<typeof vi.fn>>();
  const utils = new Proxy({}, { get: (_target, family: string) => new Proxy({}, { get: (_value, key: string) => ({
    invalidate: (...args: unknown[]) => { const path = `${family}.${key}`; if (!reads.has(path)) reads.set(path, vi.fn()); reads.get(path)!(...args); return path === failKey ? Promise.reject(Error('offline refresh failure')) : Promise.resolve(); },
    mutate: () => { throw Error('Funding mutation replay forbidden'); },
  }) }) });
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
  const refresh = run(`${fn('refreshFunderSettlementQueries')}; refreshFunderSettlementQueries`, { toast });
  return { utils, reads, toast, refresh };
}
const manual = { coin: 'USDT', qty: '250', source: 'manual' };
const mirror = { coin: 'ETH', qty: '18', source: 'wallet', note: '钱包担保冻结' };
const assets = [manual, mirror];
describe('当前冻结与历史原登记', () => {
  it('两个修改TSX语法正确', () => { for (const ast of [card, management]) expect((ast as any).parseDiagnostics).toEqual([]); });
  it('真实已加载空数组：当前无18 ETH，手工登记不丢，历史镜像不改', () => {
    const before = JSON.stringify(assets);
    const selected = selectFunderWalletCollateralDisplay({ wallet_collateral_contributors: [] }, assets);
    expect(selected.state).toBe('loaded'); expect(selected.currentWalletAssets).toEqual([]);
    expect(selected.currentAssets).toEqual([manual]); expect(selected.registeredWalletAssets).toEqual([mirror]); expect(JSON.stringify(assets)).toBe(before);
    expect(run(`${fn('mergeOrderWalletCollateralAssets')}; mergeOrderWalletCollateralAssets(order, assets)`, { order: { wallet_collateral_contributors: [] }, assets, isSettlementFinal: false })).toEqual([manual]);
  });
  it('非52不受钱包当前冻结投影影响，保留历史担保', () => {
    expect(run(`${fn('mergeOrderWalletCollateralAssets')}; mergeOrderWalletCollateralAssets(order, assets)`, { ledgerId: 37, order: { wallet_collateral_contributors: [] }, assets, isSettlementFinal: false })).toEqual(assets);
  });
  it('共享担保未知总值不以null转0；明细和合计都明确待确认', () => {
    expect(card.getText()).toContain('readConfirmedExposureGap((sharedPoolInfo as any).totalCollateralValue) ?? Number.NaN');
    expect(card.getText()).toContain("o.collateralValue == null ? '待确认'");
    expect(card.getText()).toContain("(sharedPoolInfo as any).totalCollateralValue == null ? '待确认'");
    expect(card.getText()).not.toContain('totalCollateralValue ?? 0');
  });
  it.each([undefined, null, 'broken'])('未加载/失败 %s 不以历史镜像当真实冻结', raw => {
    const selected = selectFunderWalletCollateralDisplay({ wallet_collateral_contributors: raw }, assets);
    expect(selected.state).toBe('not_loaded'); expect(selected.currentWalletAssets).toEqual([]); expect(selected.registeredWalletAssets).toEqual([mirror]);
  });
  it.each([{ wallet_collateral_contributors_loaded: false }, { wallet_collateral_contributors_status: 'error' }])('显式失败覆盖陈旧空数组 %s', flags => {
    expect(selectFunderWalletCollateralDisplay({ wallet_collateral_contributors: [], ...flags }, assets).state).toBe('unavailable');
  });
  it('已结束卡保留18 ETH原登记，不借用另一用户今天的冻结', () => {
    const order = { wallet_collateral_contributors: [{ userId: 2, assets: [{ coin: 'ETH', qty: '2' }] }] };
    expect(run(`${fn('mergeOrderWalletCollateralAssets')}; mergeOrderWalletCollateralAssets(order, assets)`, { order, assets, isSettlementFinal: true })).toEqual(assets);
    expect(selectFunderWalletCollateralDisplay(order, assets).currentWalletAssets[0].qty).toBe('2');
  });
  it('历史快捷编辑保留原登记；活跃empty/未知不把原登记重新填成冻结', () => {
    for (const isSettlementFinal of [false, true]) for (const raw of [[], undefined]) {
      expect(run(`(${init(card, 'initialWalletItems')})`, { order: { wallet_collateral_contributors: raw }, isSettlementFinal, mirrorWalletItems: [mirror], lockedWalletItems: [] })).toEqual(isSettlementFinal ? [mirror] : []);
    }
  });
  it('只取本段原币数量，不编造总币或混入其他段', () => {
    const selected = selectFunderWalletCollateralDisplay({ joint_segment_id: 'second', wallet_collateral_contributors: [{ userId: 1, name: '甲', assets: [{ coin: 'ETH', qty: '18' }, { coin: 'SOL', qty: '3.125', jointSegmentId: 'second' }] }] }, assets);
    expect(selected.currentWalletAssets.map(a => [a.coin, a.qty])).toEqual([['SOL', '3.125']]);
  });
  it('真实TSX提示：empty才已解除，失败未知，历史不表示现金已付；窄屏文字可换行', () => {
    const banner = required(nodes(card, ts.isJsxElement).find(n => n.openingElement.attributes.getText().includes('data-wallet-collateral-state')), 'wallet banner');
    for (const state of ['loaded', 'unavailable', 'not_loaded']) {
      const value = text(run(`(${banner.getText()})`, { walletCollateralDisplay: { state, currentWalletAssets: [] }, isSettlementFinal: true }));
      expect(value).toContain(state === 'loaded' ? '当前钱包冻结已解除' : '当前钱包冻结尚未确认');
      if (state !== 'loaded') expect(value).not.toContain('已解除');
      expect(value).toContain('历史原登记'); expect(value).toContain('不代表现金已支付');
    }
    expect(banner.getText()).toContain('break-words');
  });
  it('未知台账的估值不假装为0，历史估值仍按结清快照', () => {
    expect(run(`(${init(card, 'collateralValueKnown')})`, { ledgerId: 52, isSettlementFinal: false, walletCollateralDisplay: { state: 'not_loaded' } })).toBe(false);
    expect(run(`(${init(card, 'collateralValueKnown')})`, { ledgerId: 52, isSettlementFinal: true, walletCollateralDisplay: { state: 'not_loaded' } })).toBe(true);
  });
});
describe('真实缓存刷新与mutation成功/失败分离', () => {
  it('刷新余额/冻结清单/全局流水/管理员快照所有真实query family并传播刷新错误', async () => {
    const h = harness(); await h.refresh(h.utils, 52, 4860);
    for (const key of ['ledger.funderGetAssetOrders', 'ledger.funderAdminGetOrderViews', 'ledger.financeGetOrders', 'ledger.funderGetOrderParticipants', 'ledger.financeGetOrderLogs', 'ledger.funderGetSharedCollateralPool', 'ledger.funderGetWalletCollateralBalances', 'ledger.funderGetOrderWalletCollateralContributors', 'ledger.afGetMyRechargeHistory', 'recharge.getMultiAssetBalances', 'recharge.getMultiAssetHistory', 'recharge.getBalance', 'recharge.getUsdtBalanceSummary', 'recharge.getCnyBalance', 'recharge.getCnyBalanceSummary', 'recharge.getCnyHistory', 'recharge.getCnyHistoryPage', 'recharge.getBalanceHistory', 'recharge.getMyManualBalances', 'adminUser.walletSnapshot', 'adminUser.walletHistory', 'adminUser.walletGlobalHistory', 'adminUser.walletBalanceTrend', 'adminUser.multiAssetWalletHistoryPage', 'adminUser.walletManualFreezeState', 'adminUser.list']) expect(h.reads.has(key), key).toBe(true);
    expect(h.reads.get('recharge.getMultiAssetBalances')!.mock.calls).toEqual([[undefined, undefined, { cancelRefetch: true, throwOnError: true }]]);
    expect(h.reads.get('ledger.funderGetOrderWalletCollateralContributors')!.mock.calls[0][0]).toEqual({ ledgerId: 52, orderId: 4860 });
    expect(h.toast.warning).not.toHaveBeenCalled();
  });
  it('缓存失败不抛成mutation失败，不重放mutation；其他查询均继续', async () => {
    const h = harness('recharge.getMultiAssetBalances'); await expect(h.refresh(h.utils, 52, 4860)).resolves.toBeUndefined();
    expect(h.toast.warning).toHaveBeenCalledWith(expect.stringContaining('结清记录已保存')); expect(h.toast.warning).toHaveBeenCalledWith(expect.stringContaining('不要重复结清'));
    expect(h.toast.error).not.toHaveBeenCalled(); expect(h.reads.has('adminUser.walletSnapshot')).toBe(true);
  });
  it('37不触发52全局钱包失效，T0/AJ无新增资金请求', async () => {
    const h = harness(); await h.refresh(h.utils, 37, 1); expect([...h.reads.keys()].every(k => k.startsWith('ledger.'))).toBe(true);
  });
  it.each(['settleIndividualMutation', 'settleJointSegmentsMutation', '_intUpdateMutation'])('%s仅事务成功触发只读刷新，失败不改状态', name => {
    const ast = name === '_intUpdateMutation' ? card : management;
    const h = harness(); const refresh = vi.fn();
    const config = run(`(${init(ast, name)})`, { trpc: { ledger: new Proxy({}, { get: () => ({ useMutation: (config: any) => config }) }) }, toast: h.toast, refreshFunderSettlementQueries: refresh, trpcUtils: h.utils });
    config.onError(Error('事务已回滚')); expect(refresh).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled(); expect(h.reads.size).toBe(0);
    config.onSuccess({ userIds: [1], settledSegmentIds: ['second'], releasedCollateralCount: 1 }, { ledgerId: 52, orderId: 4860, id: 4860, status: 'settled' });
    expect(refresh).toHaveBeenCalledOnce(); expect(refresh.mock.calls[0][0]).toBe(h.utils); expect(refresh.mock.calls[0].slice(1)).toEqual([52, 4860]); expect(h.toast.success).toHaveBeenCalledWith(expect.stringContaining('结清记录已保存'));
  });
  it('整单成功走同一刷新；普通保存错误提示不冒充结清失败', async () => {
    const h = harness(); const refresh = vi.fn().mockResolvedValue(undefined);
    const config = run(`(${init(management, 'updateMutation')})`, { trpc: { ledger: { financeUpdateOrder: { useMutation: (config: any) => config } } }, toast: h.toast, refreshFunderSettlementQueries: refresh, trpcUtils: h.utils, ledgerId: 52,
      participants: [], existingParticipantsData: null, setShowForm: vi.fn(), setEditingOrder: vi.fn(), editorRootOrderRef: { current: null }, setParticipants: vi.fn(), setJointOrderSegments: vi.fn(), participantsLoadedRef: { current: null } });
    config.onError(Error('事务失败')); expect(refresh).not.toHaveBeenCalled();
    await config.onSuccess({}, { status: 'settled', ledgerId: 52, id: 4860 }); expect(refresh).toHaveBeenCalledOnce(); expect(refresh.mock.calls[0][0]).toBe(h.utils); expect(refresh.mock.calls[0].slice(1)).toEqual([52, 4860]);
  });
  it('多人全选仍为个人接口，不改为统一整单；页面不再声称无钱包流水', () => {
    expect(management.getText()).toContain('const isWholeOrderSettlement = !hasOtherCollaborators');
    expect(management.getText()).toContain('userIds: selectedIds');
    for (const ast of [card, management]) {
      const confirmation = required(nodes(ast, ts.isJsxElement).find(n => n.openingElement.tagName.getText() === 'p' && n.getText().includes('结清将')), 'settlement disclaimer');
      expect(confirmation.getText()).not.toContain('不会产生任何钱包流水');
      expect(confirmation.getText()).toContain('不代表本金或利息现金已支付');
    }
  });
});
