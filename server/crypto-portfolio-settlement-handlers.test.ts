import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as instruments from '../shared/portfolio-instruments';
import * as policy from '../shared/crypto-portfolio-policy';
import * as sessions from '../shared/stock-market-session';
import { mergeCryptoPortfolioCalendarSnapshots } from './shared/crypto-portfolio-calendar-integration';
import { cryptoPortfolioStockAnchor, pendingCryptoCalendarSnapshot } from './shared/crypto-portfolio-calendar';

const mocks = vi.hoisted(() => ({ conn: null as any, get: vi.fn(), tx: vi.fn(), crypto: vi.fn(), fx: vi.fn(), dirty: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: mocks.get, getDbTransactionConnection: mocks.tx }));
vi.mock('./crypto-portfolio-quotes', () => ({ fetchCryptoPortfolioCloseQuotes: mocks.crypto, fetchCryptoPortfolioQuotes: vi.fn() }));
vi.mock('./crypto-portfolio-fx', () => ({ fetchCryptoUsdtCnyAtClose: mocks.fx }));
vi.mock('./stock-usd-cny-rate', () => ({ fetchStockUsdCnyAtClose: vi.fn(async () => null) }));
vi.mock('./stock-unified-close-quotes', async original => ({ ...(await original<any>()), fetchOvernightUnifiedCloseQuotes: vi.fn(async () => ({})), fetchUnifiedCloseQuotes: vi.fn(async () => ({})) }));
vi.mock('./stock-calendar-result-cache', () => ({ decodeStockCalendarResult: (value: string) => JSON.parse(value), markStockCalendarResultDirty: mocks.dirty }));
import { publishCryptoPortfolioSnapshots, readCryptoPortfolioCalendar, getCryptoPortfolioActivationDate } from './crypto-portfolio-settlement';

const BTC = 'CRYPTO:BTC-USDT', ACTIVATED = '2026-11-14';
const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('real-handlers.ts', source, ts.ScriptTarget.Latest, true);
// Execute entire unmodified function bodies, not mirrored implementations. Imports/application init never run.
function actualFunctions(names: string[], deps: Record<string, any>) {
  const text = names.map(name => {
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    if (!node) throw new Error(`missing handler: ${name}`);
    return node.getText(ast).replace(/^export\s+/, '');
  }).join('\n');
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(deps), `${js}\nreturn {${names.join(',')}};`)(...Object.values(deps));
}
const common = () => ({ ...instruments, ...policy, ...sessions, EPSILON: 1e-7, STOCK_LEDGER_ID: 37, STOCK_TRADE_FEE_RATE: 0.001,
  ensureStockCalendarResultTable: vi.fn(), ensureLedgerStockPortfolioTables: vi.fn(), markStockCalendarResultDirty: mocks.dirty,
  invalidateMemberStockReadCaches: vi.fn(), queueStockCalendarResultRebuild: vi.fn(),
  assertStockTagAccess: vi.fn(async (ledgerId: number, categoryId: number) => {
    if (ledgerId !== 37 || categoryId !== 81) throw new Error('denied scope');
    return { ledgerId, categoryId };
  }), getDbConnection: mocks.get, getDbTransactionConnection: mocks.tx,
});
function fx(d: string) {
  const anchor = cryptoPortfolioStockAnchor(d)!.A;
  return { snapshotDate: d, usdtCnyRate: 7.19, pair: 'USDT/CNY', source: 'bridge_coinbase_usdt_usd_spot_close_1505_x_yahoo_usdcny_5m',
    asOf: `${anchor}T15:04:00+08:00`, lockedAt: `${d}T15:05:00+08:00`, carried: anchor !== d, forexSnapshotDate: anchor,
    usdCnyRate: 7.19 / 0.999355, usdCnyAsOf: `${anchor}T15:04:00+08:00`, usdCnySource: 'yahoo_usdcny_5m',
    usdtUsdRate: 0.999355, usdtUsdAsOf: `${d}T15:05:00+08:00`, usdtUsdSource: 'coinbase_usdt_usd_spot_close_1505', observedAt: `${d}T15:05:04+08:00` };
}
function db(symbol = BTC, securities = false) {
  const saved = new Map<string, string>(), staged = new Map<string, string>(), sqls: Array<{ sql: string; params: any[] }> = [];
  const event: any = { id: 91, event_type: 'sell', status: 'active', quantity: 1, symbol,
    actual_traded_at: '2026-11-14 16:00:00', server_registered_at: '2026-11-14 16:00:01', settlement_effective_date: '2026-11-15' };
  let openingActive = true, activeTx = false, failDirty = false;
  const conn: any = {
    beginTransaction: vi.fn(async () => { activeTx = true; staged.clear(); }),
    commit: vi.fn(async () => { for (const [k, v] of staged) saved.set(k, v); staged.clear(); activeTx = false; }),
    rollback: vi.fn(async () => { staged.clear(); activeTx = false; }), release: vi.fn(() => { activeTx = false; }),
    execute: vi.fn(async (sql: string, params: any[] = []) => {
      sqls.push({ sql, params });
      if (sql.startsWith('CREATE TABLE')) return [{ affectedRows: 0 }];
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('SELECT DISTINCT category.id')) {
        const eligible = openingActive && instruments.isCryptoPortfolioSymbol(symbol) || sql.includes('OR EXISTS') && saved.size > 0;
        return [eligible && (params.length === 2 || params[2] === 81) ? [{ id: 81 }] : []];
      }
      if (sql.includes('MIN(e.settlement_effective_date)')) return [[{ activation_date: params[1] === 81 && openingActive && instruments.isCryptoPortfolioSymbol(symbol) ? ACTIVATED : null }]];
      if (sql.includes('MIN(activation_date)')) return [params[1] === 81 && saved.size ? [{ ledger_id: 37, category_id: 81,
        policy_version: policy.CRYPTO_PORTFOLIO_POLICY_VERSION, activation_date: ACTIVATED,
        snapshot_date: [...saved.keys()].map(k => k.slice(k.indexOf(':') + 1)).sort()[0] }] : []];
      if (sql.startsWith('SELECT payload FROM ledger_crypto')) {
        if (sql.includes('snapshot_date=?')) { const value = saved.get(`${params[1]}:${params[2]}`) ?? staged.get(`${params[1]}:${params[2]}`); return [value ? [{ payload: value }] : []]; }
        return [[...saved.entries()].filter(([key]) => key.startsWith(`${params[1]}:`)).map(([, payload]) => ({ payload }))];
      }
      if (sql.includes('SELECT id, event_type, status, quantity, symbol')) return [params[1] === 37 && params[2] === 81 ? [{ ...event }] : []];
      if (sql.includes('SELECT id, event_type, status FROM ledger_stock_events')) return [[{ id: 10, event_type: 'buy', status: openingActive ? 'active' : 'voided' }]];
      if (sql.includes('SELECT lot_id, SUM(quantity)')) return [[{ lot_id: 1, quantity: 1 }]];
      if (sql.includes('SELECT DATE_FORMAT(opened_at')) return [[{ opened_at: '2026-11-14 14:00:00' }]];
      if (sql.includes('SELECT COUNT(*) AS count')) return [[{ count: 0 }]];
      if (sql.includes("SET status = 'voided'")) { openingActive = false; return [{ affectedRows: 1 }]; }
      if (sql.includes('UPDATE ledger_stock_events')) {
        const crypto = sql.includes('server_registered_at = ?');
        Object.assign(event, { execution_price: params[0], transaction_fee: params[1], actual_traded_at: params[2], settlement_effective_date: params[4] });
        if (crypto) event.server_registered_at = params[5];
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM ledger_stock_sale_profit_allocations') || sql.startsWith('UPDATE ledger_stock_participation_closures')) return [{ affectedRows: 1 }];
      if (sql.includes('FROM ledger_stock_lots l INNER JOIN ledger_stock_events e')) return [[...(openingActive ? [{ id: 1, symbol, initial_quantity: 2, unit_cost: 100, opening_fee: 0.2,
        actual_traded_at: '2026-11-14 14:00:00', registered_at: '2026-11-14 14:00:01', effective_date: ACTIVATED }] : []),
        ...(securities ? [{ id: 2, symbol: '600519.SH', initial_quantity: 2, unit_cost: 100, opening_fee: 0,
          actual_traded_at: '2026-11-13 14:00:00', registered_at: '2026-11-13 14:00:01', effective_date: null }] : [])]];
      if (sql.includes('FROM ledger_stock_event_lot_allocations a INNER JOIN ledger_stock_events e')) return [openingActive ? [{ lot_id: 1, symbol, quantity: 1, execution_price: event.execution_price ?? 120,
        transaction_fee: event.transaction_fee ?? 0.12, event_quantity: 1, actual_traded_at: event.actual_traded_at,
        registered_at: event.server_registered_at, effective_date: event.settlement_effective_date }] : []];
      if (sql.includes('FROM ledger_stock_lot_participations p INNER JOIN')) return [securities ? [{ id: 12, lot_id: 2, user_id: 28,
        allocated_quantity: 1, remaining_quantity: 1, entry_price: 100, start_date: '2026-11-13', pause_date: null,
        assigned_at: '2026-11-13 12:00:00', updated_at: '2026-11-13 12:00:00' }] : []];
      if (sql.includes('FROM ledger_stock_lot_observations o INNER JOIN')) return [securities ? [{ lot_id: 2, user_id: 99,
        quantity: 3, entry_price: 100, start_date: '2026-11-13', pause_date: null,
        assigned_at: '2026-11-13 12:00:00', updated_at: '2026-11-13 12:00:00' }] : []];
      if (sql.includes('FROM ledger_stock_unified_close_prices')) return [securities ? [{ symbol: '600519.SH', price: 110, currency: 'CNY',
        source: 'unified_close_tushare', price_date: '2026-11-13', captured_at: '2026-11-13 15:01:00' }] : []];
      if (sql.includes('SELECT p.id FROM ledger_stock_lot_participations')) return [securities && params[1] === 81 && params[2] === 28 ? [{ id: 12 }] : []];
      if (sql.includes('FROM ledger_stock_lot_participations') || sql.includes('FROM ledger_stock_participation_closures') || sql.includes('FROM ledger_stock_lot_observations')
        || sql.includes('FROM ledger_stock_unified_close_prices') || sql.includes('FROM ledger_stock_unified_close_fx') || sql.includes('FROM ledger_stock_calendar_results')) return [[]];
      if (sql.startsWith('INSERT IGNORE INTO ledger_crypto')) {
        const key = `${params[1]}:${params[2]}`; if (saved.has(key)) return [{ affectedRows: 0 }];
        staged.set(key, params[5]); return [{ affectedRows: 1 }];
      }
      throw new Error(`unexpected offline SQL: ${sql}`);
    }),
  };
  mocks.conn = conn;
  mocks.get.mockImplementation(async () => { if (activeTx) throw new Error('extra connection while holding transaction'); return conn; });
  mocks.tx.mockImplementation(async () => conn);
  mocks.dirty.mockImplementation(async () => { if (failDirty) throw new Error('dirty failed'); });
  return { conn, event, saved, sqls, opening: () => openingActive, failDirty: () => { failDirty = true; } };
}
function edit() {
  return actualFunctions(['updateStockTagSale', 'parsePortfolioActualTime', 'toIso', 'toBeijingWallClockIso', 'toMysqlBeijingDateTime', 'numberValue', 'normalizeStoredDate', 'validateCryptoQuantity'],
    { ...common(), saveStockSaleProfitAllocations: vi.fn() }).updateStockTagSale;
}
const editInput = { ledgerId: 37, categoryId: 81, eventId: 91, userId: 28, executionPrice: 125, actualTradedAt: '2026-11-14 16:00:00' };
function overview(state: ReturnType<typeof db>, old: any[]) {
  return actualFunctions(['buildPortfolio', 'readLiveUsdCnyRate'], { ...common(), stockCurrency: instruments.portfolioCurrency, stockMarket: instruments.portfolioMarket,
    getActiveLots: vi.fn(async () => state.opening() ? [{ symbol: BTC, remainingQuantity: 0 }] : []),
    getLatestReferenceQuotes: async () => ({}), getLatestQuotes: async () => ({}), getLatestIntradayQuotes: async () => ({}), getUsStockExchangeMap: async () => ({}),
    getLiveCryptoQuotes: async () => ({}), readLiveUsdtCnyRate: async () => null, mergeLivePortfolioQuoteMaps: () => ({}), getSoldLots: async () => [],
    getLiveStockUsdCnyQuote: async () => ({ rate: 7, pair: 'USD/CNY', stale: false, source: 'sina_usdcny', asOf: new Date().toISOString() }),
    getRealizedPnl: async () => 0, summarizePositionsByCurrency: () => [], summarizePositionsInCny: () => ({ costValue: 0, marketValue: 0, floatingPnl: 0, unpricedPositionCount: 0, fxUnavailable: false }),
    getLatestDailySnapshots: async () => old, getCryptoPortfolioActivationDate, readCryptoPortfolioCalendar, mergeCryptoPortfolioCalendarSnapshots,
  }).buildPortfolio;
}
function voidOpening() {
  return actualFunctions(['voidStockTagEvent'], common()).voidStockTagEvent({ ledgerId: 37, categoryId: 81, eventId: 10, userId: 28, reason: 'offline regression' });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-14T15:06:00+08:00')); vi.clearAllMocks();
  mocks.crypto.mockImplementation(async (symbols: string[], d: string) => Object.fromEntries(symbols.map(symbol => [symbol, { symbol, price: 110, currency: 'USDT', source: 'crypto_close_gate_1505',
    priceDate: d, updatedAt: `${d}T15:05:03+08:00`, cutoffAt: `${d}T15:05:00+08:00` }])));
  mocks.fx.mockImplementation(async (d: string) => fx(d));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('真实crypto结算处理器修复回归（SQL/行情全部隔离）', () => {
  it('跨日仅改卖价同步登记证据，后续真实publisher严格复算成功，已固定payload字节不变', async () => {
    const state = db(); expect(await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED })).toMatchObject({ published: 1 });
    const frozen = state.saved.get(`81:${ACTIVATED}`)!;
    vi.setSystemTime(new Date('2026-11-16T15:06:00+08:00')); await edit()(editInput);
    expect(state.event.actual_traded_at).toBe(editInput.actualTradedAt);
    expect(state.event.server_registered_at).toBe('2026-11-16 15:06:00'); expect(state.event.settlement_effective_date).toBe('2026-11-17');
    vi.setSystemTime(new Date('2026-11-17T15:06:00+08:00'));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: '2026-11-17', categoryId: 81 })).toMatchObject({ published: 1, skipped: 0 });
    const next = JSON.parse(state.saved.get('81:2026-11-17')!); expect(next.total.realizedPnl).toBeCloseTo((25 - 0.125 - 0.1) * 7.19);
    expect(state.saved.get(`81:${ACTIVATED}`)).toBe(frozen);
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED })).toMatchObject({ alreadyPublished: 1 }); expect(state.saved.get(`81:${ACTIVATED}`)).toBe(frozen);
    const q = state.sqls.find(q => q.sql.includes('UPDATE ledger_stock_events'))!;
    expect(q.sql).toContain('WHERE id = ? AND ledger_id = ? AND category_id = ?'); expect(q.params.slice(-3)).toEqual([91, 37, 81]);
  });
  it.each(['2026-11-16T15:04:59+08:00', '2026-11-16T15:05:00+08:00'])('编辑边界 %s 持久证据严格对应effective日', async now => {
    const state = db(); vi.setSystemTime(new Date(now)); await edit()(editInput);
    expect(state.event.settlement_effective_date).toBe(policy.getCryptoPortfolioEffectiveDate(state.event.actual_traded_at, state.event.server_registered_at));
  });
  it('连续编辑不倒退生效日，保留原真实成交时刻', async () => {
    const state = db(); const run = edit();
    vi.setSystemTime(new Date('2026-11-16T15:06:00+08:00')); await run(editInput);
    vi.setSystemTime(new Date('2026-11-17T15:06:00+08:00')); await run({ ...editInput, executionPrice: 126 });
    expect(state.event.settlement_effective_date).toBe('2026-11-18'); expect(state.event.actual_traded_at).toBe(editInput.actualTradedAt);
    expect(state.event.settlement_effective_date).toBe(policy.getCryptoPortfolioEffectiveDate(state.event.actual_traded_at, state.event.server_registered_at));
  });
  it('股票卖单保留原登记、不引入数字币登记字段和effective', async () => {
    const state = db('AAPL'); vi.setSystemTime(new Date('2026-11-16T15:06:00+08:00')); await edit()(editInput);
    expect(state.event.server_registered_at).toBe('2026-11-14 16:00:01'); expect(state.event.settlement_effective_date).toBeNull();
    expect(state.sqls.find(q => q.sql.includes('UPDATE ledger_stock_events'))!.sql).not.toContain('server_registered_at = ?');
  });
  it('跨账本及跨标签拒绝在任何SQL之前', async () => {
    const state = db(); await expect(edit()({ ...editInput, ledgerId: 38 })).rejects.toThrow('denied scope');
    await expect(edit()({ ...editInput, categoryId: 82 })).rejects.toThrow('denied scope'); expect(state.conn.execute).not.toHaveBeenCalled();
  });
  it('未来卖出时间拒绝并回滚释放，日结payload未变', async () => {
    const state = db(); const event = JSON.stringify(state.event);
    await expect(edit()({ ...editInput, actualTradedAt: '2026-11-20 16:00:00' })).rejects.toThrow('实际成交时间不能晚于服务器登记时间');
    expect(JSON.stringify(state.event)).toBe(event); expect(state.conn.rollback).toHaveBeenCalled(); expect(state.conn.release).toHaveBeenCalled(); expect(state.saved.size).toBe(0);
  });
  it('真实作废最后币买入后概览继续读crypto固定历史，不退旧999，复用同一读取连接', async () => {
    const state = db(); await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED }); const frozen = state.saved.get(`81:${ACTIVATED}`)!;
    const old = [{ snapshotDate: ACTIVATED, totalPnl: 999 }, { snapshotDate: '2026-11-13', totalPnl: 50 }];
    const build = overview(state, old); expect((await build(81)).summary.latestSnapshot.totalPnl).toBeCloseTo(143.8);
    await voidOpening(); expect(state.opening()).toBe(false); const start = state.sqls.length, gets = mocks.get.mock.calls.length;
    const after = await build(81); expect(after.summary.latestSnapshot.totalPnl).toBeCloseTo(143.8); expect(after.summary.priorSnapshot.totalPnl).toBe(50);
    expect(mocks.get.mock.calls.length - gets).toBe(1); expect(state.sqls.slice(start).every(q => q.sql.startsWith('SELECT'))).toBe(true);
    expect(state.saved.get(`81:${ACTIVATED}`)).toBe(frozen); expect(old[0].totalPnl).toBe(999);
  });
  it('已激活但下一日未发布显示pending，不能使用旧股票当日999', async () => {
    const state = db(); await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED }); await voidOpening();
    vi.setSystemTime(new Date('2026-11-15T15:06:00+08:00'));
    const result = await overview(state, [{ snapshotDate: '2026-11-15', totalPnl: 999 }])(81);
    expect(result.summary.latestSnapshot).toMatchObject({ snapshotDate: '2026-11-15', ready: false, totalPnl: null });
  });
  it('无数字币无持久activation的纯股票概览保持旧对象数字和每日差值', async () => {
    const state = db('AAPL'); const old = [{ snapshotDate: ACTIVATED, totalPnl: 999, costValue: 1000 }, { snapshotDate: '2026-11-13', totalPnl: 50, costValue: 1000 }];
    const result = await overview(state, old)(81); expect(result.summary.latestSnapshot).toBe(old[0]); expect(result.summary.dailyChange).toBe(949);
    expect(state.sqls.some(q => q.sql.startsWith('SELECT payload'))).toBe(false);
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED })).toMatchObject({ categories: 0, published: 0 });
  });
  it('独立publisher仍枚举已激活无币标签、同日重试命中immutable短路，不读源历史行情', async () => {
    const state = db(); await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED }); await voidOpening(); const start = state.sqls.length, prices = mocks.crypto.mock.calls.length;
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED, categoryId: 81 })).toMatchObject({ categories: 1, alreadyPublished: 1, published: 0 });
    expect(mocks.crypto.mock.calls.length).toBe(prices); expect(state.sqls.slice(start).some(q => q.sql.includes('MIN(e.settlement_effective_date)'))).toBe(false);
    const enumeration = state.sqls.slice(start).find(q => q.sql.includes('SELECT DISTINCT category.id'))!;
    expect(enumeration.params).toEqual([37, policy.CRYPTO_PORTFOLIO_POLICY_VERSION, 81]);
    for (const clause of ['category.parentId IS NULL', "category.accounting_mode='stock_portfolio'", 'opening.ledger_id=l.ledger_id', 'opening.category_id=l.category_id',
      'saved.ledger_id=category.ledgerId', 'saved.category_id=category.id', 'saved.policy_version=?']) expect(enumeration.sql).toContain(clause);
  });
  it('持久activation读取限定现存37顶级组合类别和当前policy，查询only SELECT', async () => {
    const state = db(); await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED }); await voidOpening(); const start = state.sqls.length;
    expect(await getCryptoPortfolioActivationDate(81, state.conn)).toBe(ACTIVATED); expect(await getCryptoPortfolioActivationDate(82, state.conn)).toBeNull();
    const reads = state.sqls.slice(start); expect(reads.every(q => q.sql.startsWith('SELECT'))).toBe(true);
    const saved = reads.find(q => q.sql.includes('MIN(activation_date)'))!; expect(saved.params).toEqual([37, 81, policy.CRYPTO_PORTFOLIO_POLICY_VERSION]);
    expect(saved.sql).toContain('category.ledgerId=saved.ledger_id'); expect(saved.sql).toContain('category.parentId IS NULL');
  });
  it('真实作废最后币买入后空账户继续自然日日结，已有payload字节不变且复用事务连接', async () => {
    const state = db(); await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED }); await voidOpening();
    const frozen = state.saved.get(`81:${ACTIVATED}`)!, start = state.sqls.length, prices = mocks.crypto.mock.calls.length;
    const gets = mocks.get.mock.calls.length, transactions = mocks.tx.mock.calls.length;
    vi.setSystemTime(new Date('2026-11-15T15:06:00+08:00'));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: '2026-11-15' })).toMatchObject({ categories: 1, published: 1, skipped: 0 });
    const next = JSON.parse(state.saved.get('81:2026-11-15')!);
    expect(next).toMatchObject({ ledgerId: 37, categoryId: 81, activationDate: ACTIVATED, policyVersion: policy.CRYPTO_PORTFOLIO_POLICY_VERSION,
      total: { snapshotDate: '2026-11-15', ready: true, positionCount: 0, totalPnl: 0, marketValue: 0, dailyPnlReady: true }, members: {}, observations: {}, quotes: [], fx: { usdt: null, usd: null } });
    expect(next.total.dailyPnl).toBeCloseTo(-JSON.parse(frozen).total.totalPnl);
    expect(state.saved.get(`81:${ACTIVATED}`)).toBe(frozen); expect(mocks.crypto.mock.calls.length).toBe(prices);
    expect(mocks.get.mock.calls.length - gets).toBe(1); expect(mocks.tx.mock.calls.length - transactions).toBe(1);
    const saved = state.sqls.slice(start).find(q => q.sql.includes('MIN(activation_date)'))!;
    expect(saved.params).toEqual([37, 81, policy.CRYPTO_PORTFOLIO_POLICY_VERSION]);
    expect(saved.sql).toContain('category.ledgerId=saved.ledger_id'); expect(saved.sql).toContain("category.accounting_mode='stock_portfolio'");
    vi.setSystemTime(new Date('2026-11-16T15:06:00+08:00'));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: '2026-11-16' })).toMatchObject({ published: 1, skipped: 0 });
    expect(JSON.parse(state.saved.get('81:2026-11-16')!).total).toMatchObject({ ready: true, dailyPnlReady: true, dailyPnl: 0 });
    expect(state.saved.get(`81:${ACTIVATED}`)).toBe(frozen);
  });
  it('作废最后币买入但证券成员观察仍存时继续周日自然日，不混scope、不退旧引擎、不改固定payload', async () => {
    const state = db(BTC, true); expect(await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED })).toMatchObject({ published: 1 });
    const frozen = state.saved.get(`81:${ACTIVATED}`)!; await voidOpening();
    const prices = mocks.crypto.mock.calls.length, fxCalls = mocks.fx.mock.calls.length, gets = mocks.get.mock.calls.length;
    vi.setSystemTime(new Date('2026-11-15T15:06:00+08:00'));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: '2026-11-15', categoryId: 81 })).toMatchObject({ categories: 1, published: 1, skipped: 0 });
    const next = JSON.parse(state.saved.get('81:2026-11-15')!);
    expect(next).toMatchObject({ activationDate: ACTIVATED, snapshotDate: '2026-11-15', policyVersion: policy.CRYPTO_PORTFOLIO_POLICY_VERSION });
    expect(next.total).toMatchObject({ scope: 'tag-total', ready: true, totalPnl: 20, positionCount: 1,
      sourceDates: { A: '2026-11-13', US: '2026-11-12', CRYPTO: '2026-11-15' } });
    expect(next.total.dailyPnl).toBeCloseTo(20 - JSON.parse(frozen).total.totalPnl);
    expect(next.members['28']).toMatchObject({ ready: true, totalPnl: -10, dailyPnl: 0 });
    expect(next.observations['99']).toMatchObject({ ready: true, totalPnl: -30, dailyPnl: 0 });
    expect(Object.keys(next.members)).toEqual(['28']); expect(Object.keys(next.observations)).toEqual(['99']);
    expect(mocks.crypto.mock.calls.length).toBe(prices); expect(mocks.fx.mock.calls.length).toBe(fxCalls);
    expect(mocks.get.mock.calls.length - gets).toBe(1); expect(state.saved.get(`81:${ACTIVATED}`)).toBe(frozen);
    expect((await readCryptoPortfolioCalendar(81, 28, new Date('2026-11-15T15:06:00+08:00'), state.conn))[0].totalPnl).toBe(-10);
    expect(await readCryptoPortfolioCalendar(81, 99, new Date('2026-11-15T15:06:00+08:00'), state.conn)).toEqual([]);
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: '2026-11-15', categoryId: 82 })).toMatchObject({ categories: 0, published: 0 });
    expect(state.saved.has('82:2026-11-15')).toBe(false);
  });
  it.each([
    ['missing', null], ['ledger', { ledger_id: 38 }], ['category', { category_id: 82 }],
    ['policy', { policy_version: 'old-policy' }], ['invalid date', { activation_date: '2026-02-30' }],
    ['future proof', { snapshot_date: '2026-11-16' }],
  ])('无有效币批次且持久SQL证据%s不可信时拒绝发布，不改原payload', async (_name, patch) => {
    const state = db(); await publishCryptoPortfolioSnapshots({ snapshotDate: ACTIVATED }); await voidOpening();
    const frozen = state.saved.get(`81:${ACTIVATED}`)!, execute = state.conn.execute;
    state.conn.execute = vi.fn(async (sql: string, params: any[]) => {
      const result = await execute(sql, params);
      return sql.includes('MIN(activation_date)') ? [patch === null ? [] : [{ ...result[0][0], ...patch }]] : result;
    });
    mocks.dirty.mockClear(); mocks.crypto.mockClear(); mocks.fx.mockClear();
    vi.setSystemTime(new Date('2026-11-15T15:06:00+08:00'));
    expect(await publishCryptoPortfolioSnapshots({ snapshotDate: '2026-11-15' })).toMatchObject({ categories: 1, published: 0, skipped: 1 });
    expect(state.saved.size).toBe(1); expect(state.saved.get(`81:${ACTIVATED}`)).toBe(frozen);
    expect(mocks.dirty).not.toHaveBeenCalled(); expect(mocks.crypto).not.toHaveBeenCalled(); expect(mocks.fx).not.toHaveBeenCalled();
    expect(state.conn.rollback).toHaveBeenCalled();
  });
});

describe('真实旧股票publisher策略门槛', () => {
  function legacy(activation: string | null, lots: any[]) {
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT id FROM ledger_categories')) return [[{ id: 81 }]];
      if (sql.includes('FROM ledger_stock_lots l')) return [lots];
      if (sql.includes('FROM ledger_stock_events e')) return [[]];
      throw new Error(`unexpected legacy mock SQL: ${sql}`);
    });
    const conn = { execute }; const get = vi.fn(async () => conn), tx = vi.fn(async () => null), activationRead = vi.fn(async (_category: number, read: any) => {
      expect(read).toBe(conn); return activation;
    });
    const run = actualFunctions(['refreshLedgerStockTagCloseSnapshots'], { ...common(), closeRefreshInProgress: false,
      getDbConnection: get, getDbTransactionConnection: tx, getCryptoPortfolioActivationDate: activationRead,
      getUnifiedStockCloseSnapshotDate: () => '2026-11-16', getUnifiedStockCloseVersion: () => 'cn-day-us-overnight-1505-v1',
      getOvernightUsSessionDate: sessions.getOvernightUsSessionDate, isUnifiedStockCloseReady: () => true,
      stockCurrency: instruments.portfolioCurrency, stockMarket: instruments.portfolioMarket, numberValue: Number,
      marketSessionDateFromBeijingTradeTimestamp: () => null, console: { error: vi.fn() },
    }).refreshLedgerStockTagCloseSnapshots;
    return { run, execute, get, tx, activationRead };
  }
  it.each([[], [{ id: 2, symbol: 'AAPL' }]])('已保存激活标签不因当前批次 %j 重返旧publisher，退出前复用现有connection', async lots => {
    const state = legacy(ACTIVATED, lots); const result = await state.run({ snapshotDate: '2026-11-16' });
    expect(result.publishedCategories).toBe(0); expect(state.execute).toHaveBeenCalledTimes(1); expect(state.tx).not.toHaveBeenCalled(); expect(state.get).toHaveBeenCalledTimes(1);
  });
  it('纯股票无持久激活仍走原history校验分支', async () => {
    const state = legacy(null, [{ id: 2, symbol: 'AAPL', initial_quantity: 1, unit_cost: 100 }]);
    const result = await state.run({ snapshotDate: '2026-11-16' }); expect(result.failures?.[0].reason).toBe('missing_actual_trade_date');
    expect(state.execute).toHaveBeenCalledTimes(3); expect(state.tx).not.toHaveBeenCalled();
  });
});
