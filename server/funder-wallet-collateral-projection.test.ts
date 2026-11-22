import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { selectFunderWalletCollateralDisplay } from '../shared/funder-wallet-collateral-display';

// 只提取生产查询回调；不import routers、不加载DB/行情模块、不允许网络或任何资金写入。
const source = ts.createSourceFile('routers.ts', readFileSync(new URL('./routers.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function nodes<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (guard(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root); return result;
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw Error(`Missing production AST: ${label}`); return value;
}
const entryNames = ['funderAdminGetOrderViews', 'funderGetAssetOrders', 'funderGetSharedCollateralPool'] as const;
type EntryName = typeof entryNames[number];
function callback(name: EntryName): ts.ArrowFunction {
  const property = required(nodes(source, ts.isPropertyAssignment).find(node => node.name.getText(source) === name), name);
  const query = required(nodes(property.initializer, ts.isCallExpression).find(node => ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'query'), `${name}.query`);
  const arrow = query.arguments[0];
  if (!ts.isArrowFunction(arrow) || !ts.isBlock(arrow.body)) throw Error('Expected query arrow/block');
  return arrow;
}
const callbacks = new Map(entryNames.map(name => [name, callback(name)]));
function queryText(name: EntryName): string {
  const arrow = callbacks.get(name)!;
  if (name !== 'funderGetAssetOrders') return arrow.getText(source);
  // 资产列表前半段涉及其他历史业务：仅执行真实 paid/contributors 查询及最终订单投影尾部。
  const statements = (arrow.body as ts.Block).statements;
  const start = statements.findIndex(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'paidTotalMap'));
  if (start < 0) throw Error('Missing asset order projection');
  return `async ({ctx, input}) => { ${statements.slice(start).map(statement => statement.getText(source)).join('\n')} }`;
}
function compile(text: string, bindings: Record<string, any>) {
  const forbidden = () => { throw Error('Network/DB import/mutation forbidden in offline projection test'); };
  // 动态import通过TS AST改成显式假模块；不做字符串替换或加载真实服务器代码。
  const output = ts.transpileModule(`const query = ${text}; query;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    transformers: { before: [context => root => {
      const visit: ts.Visitor = node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? ts.factory.createCallExpression(ts.factory.createIdentifier('offlineImport'), undefined, node.arguments)
        : ts.visitEachChild(node, visit, context);
      return ts.visitNode(root, visit) as ts.SourceFile;
    }] },
  }).outputText;
  return new Script(output).runInContext(createContext({ Buffer, fetch: forbidden, require: forbidden, ...bindings }), { timeout: 1000 });
}
const manual = { coin: 'USDT', qty: '250', source: 'manual' };
const historic = { coin: 'ETH', qty: '18', source: 'wallet', note: '钱包担保冻结 · 原登记' };
const lock = { order_id: 130, user_id: 1, asset_code: 'ETH', amount: '2', display_name: '甲' };
const hold = { tag_name: '52号融资订单 #130 钱包担保', user_id: 2, asset_code: 'USDT', amount: '40', display_name: '乙' };
const parseJson = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
function makeOrder(extra: Record<string, any> = {}) {
  return {
    id: 130, ledger_id: 52, user_id: 1, order_no: 'OFFLINE-130', owner_member_role: 'admin', status: 'active',
    collateral_assets: JSON.stringify([manual, historic]), collateral_share_mode: 'self', order_perspective: 'self',
    amount: '1000', interest_base: '1000', interest_base_currency: 'USDT', interest_rate_annual: '0',
    coin: 'ETH', buy_quantity: '1', buy_price: '1000', display_config: '{}', collateral_source: null,
    wallet_collateral_contributors: [], wallet_collateral_contributors_loaded: true, wallet_collateral_contributors_status: 'loaded',
    ...extra,
  };
}
type Fixture = { ledgerId?: number; connNull?: boolean; connError?: boolean; locks?: any; holds?: any; orders?: any[] };
function harness(name: EntryName, fixture: Fixture = {}) {
  const ledgerId = fixture.ledgerId ?? 52;
  const orders = fixture.orders ?? [makeOrder({ ledger_id: ledgerId })];
  const before = JSON.stringify(orders);
  const trace: Array<{ sql: string; params: any[] }> = [];
  const execute = async (query: string, params: any[] = []) => {
    const text = String(query).replace(/\s+/g, ' ').trim();
    if (!text.startsWith('SELECT')) throw Error(`Write/DDL forbidden: ${text}`);
    trace.push({ sql: text, params });
    const result = (key: 'locks' | 'holds') => {
      const value = key in fixture ? fixture[key] : [[], []];
      if (value instanceof Error) throw value;
      return structuredClone(value);
    };
    if (text.includes('FROM ai_wallet_asset_collateral_locks')) return result('locks');
    if (text.includes('FROM ai_wallet_project_holds')) return result('holds');
    if (text.includes('SELECT role FROM ledger_members')) return [[{ role: 'admin' }], []];
    if (text.includes('FROM ledger_order_payments')) return [[], []];
    if (text.includes('SELECT order_id, user_id, role FROM ledger_order_participants')) return [[], []];
    if (text.includes('FROM ledger_order_participants')) return [[], []];
    if (text.includes('FROM ledger_orders')) return [structuredClone(orders), []];
    throw Error(`Unsupported offline SELECT: ${text}`);
  };
  const conn = fixture.connNull ? null : { execute };
  const getDbConnection = async () => { if (fixture.connError) throw Error('offline connection unavailable'); return conn; };
  const sql: any = (strings: TemplateStringsArray, ...values: any[]) => strings.reduce((text, part, i) => text + part + (i < values.length ? String(values[i]) : ''), '');
  sql.raw = (value: any) => value;
  class TRPCError extends Error { constructor(options: { message: string }) { super(options.message); } }
  const identity = (value: any) => value;
  const price = (coin: string) => ({ ETH: 1000, USDT: 1, CNY: 1 / 7 } as Record<string, number>)[coin] ?? null;
  const bindings: Record<string, any> = {
    TRPCError, sql, conn, console: { error: () => {}, warn: () => {}, log: () => {} },
    getDbConnection, getLedgerDb: async () => ({ execute }),
    ordersWithParticipantView: structuredClone(orders), targetUserId: null, isManager: true, participantOrderIds: [],
    participantQueryUserId: 1, participantQueryUserIdEarly: 1, livePrices: {},
    parseFunderParticipantSnapshot: parseJson, parseFunderDisplayConfig: (value: any) => parseJson(value) ?? {}, parseFunderJsonArray: (value: any) => parseJson(value) ?? [],
    restoreLegacyPersonalAssetCoin: identity, syncFunderParticipantCollateralSnapshot: identity,
    syncFunderParticipantOwnerGroupInterestSnapshot: identity, resolveFunderOwnerVisibilitySnapshot: identity,
    resolveFunderPublicNoteForView: (order: any) => order.public_note ?? null,
    getFunderOwnerGroupInterestScopes: () => ({ paid: 'separate' }),
    getFunderCollateralRiskFormula: (_lent: any, config: any) => (parseJson(config) ?? {}).collateralRiskFormula ?? 'principal_coverage',
    normalizeFunderPrincipalLentOut: (value: any) => value, calculateFunderInterestDays: () => 0,
    resolveFunderInterestEndDate: () => null,
    offlineImport: async (module: string) => {
      if (module === './price-scanner') return { getLatestPrice: price, getMarketPriceHealth: () => ({}), refreshUsdtCnyRate: async () => 7 };
      throw Error(`Real module import forbidden: ${module}`);
    },
  };
  const query = compile(queryText(name), bindings);
  return {
    call: () => query({ ctx: { user: { id: 99 } }, input: { ledgerId, userId: 1 } }), orders, trace,
    assertUnchanged: () => expect(JSON.stringify(orders)).toBe(before),
  };
}
function projections(name: EntryName, result: any): any[] {
  return name === 'funderGetSharedCollateralPool' ? [...result.sharedOrderCardSources, ...result.nonSharedOrderCardSources] : result.orders;
}
describe('真实三入口钱包冻结 loaded 合约（离线 AST/VM）', () => {
  it('routers TS语法合法；查询回调存在；测试仅允许SELECT假fixture', () => {
    expect((source as any).parseDiagnostics).toEqual([]);
    for (const name of entryNames) expect(queryText(name)).toContain('walletCollateralContributorsLoaded');
  });
  for (const name of entryNames) describe(name, () => {
    it.each([
      { label: 'mysql tuple', locks: [[], []], holds: [[], []] },
      { label: 'existing [rows] mock', locks: [[]], holds: [[]] },
      { label: 'direct rows mock', locks: [], holds: [] },
    ])('$label真实empty=loaded，不把18 ETH历史登记当current', async fixture => {
      const h = harness(name, fixture); const result = await h.call();
      const order = projections(name, result)[0];
      expect(order.wallet_collateral_contributors_loaded).toBe(true);
      expect(order.wallet_collateral_contributors_status).toBe('loaded');
      expect(order.wallet_collateral_contributors).toEqual([]);
      expect(JSON.parse(order.collateral_assets)).toEqual([manual, historic]);
      expect(selectFunderWalletCollateralDisplay(order, [manual, historic]).currentAssets).toEqual([manual]);
      if (name === 'funderGetSharedCollateralPool') {
        expect(result.orders[0].collateralAssets).toEqual([manual]);
        expect(result.orders[0].collateralValue).toBe(250); expect(result.totalCollateralValue).toBe(250);
        expect(result.totalGap).toBe(result.totalCollateralRequired + 250);
      }
      expect(h.trace.filter(t => /FROM ai_wallet_(asset_collateral_locks|project_holds)/.test(t.sql))).toHaveLength(2);
      h.assertUnchanged();
    });
    it.each([
      { label: 'market failure/funding success', locks: new Error('offline market failed'), holds: [[hold], []] },
      { label: 'market success/funding failure', locks: [[lock], []], holds: new Error('offline funding failed') },
      { label: 'both failure', locks: new Error('offline market failed'), holds: new Error('offline funding failed') },
      { label: 'null market', locks: null, holds: [[], []] },
      { label: 'object result header', locks: { affectedRows: 0 }, holds: [[], []] },
      { label: 'array result header', locks: [{ affectedRows: 0 }], holds: [[], []] },
      { label: 'scalar', locks: 42, holds: [[], []] },
      { label: 'null row', locks: [[null], []], holds: [[], []] },
      { label: 'invalid tuple fields', locks: [[], false], holds: [[], []] },
      { label: 'corrupt funding rows', locks: [[lock], []], holds: [['bad'], []] },
    ])('$label显式false覆盖快照陈旧[]/true并传播unknown', async fixture => {
      const h = harness(name, fixture); const result = await h.call();
      const order = projections(name, result)[0];
      expect(order.wallet_collateral_contributors_loaded).toBe(false);
      expect(order.wallet_collateral_contributors_status).toBe('error');
      expect(order.wallet_collateral_contributors).toEqual([]); // 不将部分成功包装成完整冻结。
      const display = selectFunderWalletCollateralDisplay(order, [manual, historic]);
      expect(display.state).toBe('unavailable'); expect(display.currentWalletAssets).toEqual([]);
      expect(display.registeredWalletAssets).toEqual([historic]);
      expect(JSON.parse(order.collateral_assets)).toEqual([manual, historic]);
      if (name === 'funderGetSharedCollateralPool') {
        const detail = result.orders[0];
        expect(detail.collateralAssets).toEqual([manual]);
        expect(detail.manualWalletCollateralValue).toBeNull(); expect(detail.collateralValue).toBeNull(); expect(detail.collateralGap).toBeNull();
        expect(result.totalCollateralValue).toBeNull(); expect(result.totalGap).toBeNull();
        expect(result.wallet_collateral_contributors_loaded).toBe(false); expect(detail.wallet_collateral_contributors_loaded).toBe(false);
      }
      h.assertUnchanged();
    });
    it('market+funding都合法成功才合并当前冻结、保留历史登记', async () => {
      const h = harness(name, { locks: [[lock], []], holds: [hold] }); const result = await h.call();
      const order = projections(name, result)[0];
      expect(order.wallet_collateral_contributors_loaded).toBe(true);
      const current = selectFunderWalletCollateralDisplay(order, [manual, historic]).currentWalletAssets;
      expect(current.map(asset => [asset.coin, asset.qty])).toEqual([['ETH', '2'], ['USDT', '40']]);
      expect(JSON.parse(order.collateral_assets)).toEqual([manual, historic]);
      if (name === 'funderGetSharedCollateralPool') expect(result.totalCollateralValue).toBe(2290);
      h.assertUnchanged();
    });
    it('conn null不报告已解除；能返回列表时明确loaded=false', async () => {
      const h = harness(name, { connNull: true });
      if (name === 'funderGetSharedCollateralPool') await expect(h.call()).rejects.toThrow('数据库连接失败'); // 不绕过共享池授权/连接前置条件。
      else {
        const order = projections(name, await h.call())[0];
        expect(order.wallet_collateral_contributors_loaded).toBe(false);
        expect(selectFunderWalletCollateralDisplay(order, [manual, historic]).state).toBe('unavailable');
      }
      expect(h.trace.filter(t => /ai_wallet_/.test(t.sql))).toHaveLength(0); h.assertUnchanged();
    });
    it('非52保留原投影/历史钱包估值，不执行52冻结查询', async () => {
      const original = makeOrder({ ledger_id: 37 });
      const h = harness(name, { ledgerId: 37, orders: [original] }); const result = await h.call();
      const order = projections(name, result)[0];
      expect(order.wallet_collateral_contributors).toEqual(original.wallet_collateral_contributors);
      expect(order.wallet_collateral_contributors_loaded).toBe(original.wallet_collateral_contributors_loaded);
      expect(JSON.parse(order.collateral_assets)).toEqual([manual, historic]);
      if (name === 'funderGetSharedCollateralPool') {
        expect(result.orders[0].collateralAssets).toEqual([manual, historic]); expect(result.totalCollateralValue).toBe(18250);
      }
      expect(h.trace.filter(t => /ai_wallet_/.test(t.sql))).toHaveLength(0); h.assertUnchanged();
    });
  });
  it('管理员连接获取reject降级loaded=false，不保留快照true', async () => {
    const h = harness('funderAdminGetOrderViews', { connError: true });
    const result = await h.call(); expect(result.orders[0].wallet_collateral_contributors_loaded).toBe(false);
  });
  it('管理员共同拥有者及_rootOrder都覆盖陈旧loaded，不改变登记证据', async () => {
    const name = 'funderAdminGetOrderViews';
    const text = queryText(name);
    expect(text).toContain('view._rootOrder =');
    // _rootOrder直接执行真实投影尾部，避免引入不相关参与者业务fixture。
    const statements = (callbacks.get(name)!.body as ts.Block).statements;
    const start = statements.findIndex(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'walletCollateralContributorsMap'));
    const end = statements.findIndex(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'priceCoins'));
    const views = [{ ...makeOrder(), _rootOrder: makeOrder() }];
    const fn = compile(`async ({input}) => { ${statements.slice(start, end).map(s => s.getText(source)).join('\n')} return orderViews; }`, { orderViews: views, getDbConnection: async () => null });
    const result = await fn({ input: { ledgerId: 52 } });
    expect(result[0].wallet_collateral_contributors_loaded).toBe(false); expect(result[0]._rootOrder.wallet_collateral_contributors_loaded).toBe(false);
    expect(JSON.parse(result[0]._rootOrder.collateral_assets)).toEqual([manual, historic]);
  });
  it('共享池联合段当前冻结不串段，失败unknown覆盖共享/非共享来源', async () => {
    const extraSegment = { id: 'second', owner_user_id: 1, collateral_share_mode: 'none', collateral_assets: JSON.stringify([manual, historic]) };
    const snapshot = { joint_order_segments: [extraSegment], joint_order_primary_collateral_share_mode: 'self' };
    const order = makeOrder({ _shared_pool_order_snapshot: JSON.stringify(snapshot) });
    const h = harness('funderGetSharedCollateralPool', { orders: [order], locks: [[{ ...lock, joint_segment_id: 'second' }], []], holds: [[]] });
    const result = await h.call();
    expect(result.orders[0].collateralValue).toBe(250); expect(result.nonSharedOrders[0].collateralValue).toBe(2250);
    expect(result.sharedOrderCardSources[0].wallet_collateral_contributors).toEqual([]);
    expect(result.nonSharedOrderCardSources[0].wallet_collateral_contributors[0].assets[0].jointSegmentId).toBe('second');
    const failed = await harness('funderGetSharedCollateralPool', { orders: [order], locks: new Error('offline'), holds: [[]] }).call();
    for (const detail of [...failed.orders, ...failed.nonSharedOrders]) expect(detail.collateralGap).toBeNull();
    for (const projected of [...failed.sharedOrderCardSources, ...failed.nonSharedOrderCardSources]) expect(projected.wallet_collateral_contributors_loaded).toBe(false);
    expect(failed.totalGap).toBeNull(); h.assertUnchanged();
  });
});
