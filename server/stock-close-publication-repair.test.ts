import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { getOvernightUsSessionDate, isStockMarketSession } from '../shared/stock-market-session';
import { getUnifiedStockCloseSnapshotDate, getUnifiedStockCloseVersion, isUnifiedStockCloseReady, isUnifiedStockCloseQuoteForDate } from '../shared/stock-unified-close-policy';
import { marketSessionDateFromBeijingTradeTimestamp, type UnifiedCloseQuote } from './stock-unified-close-quotes';
import { isTrustedMemberCalendarClose } from './shared/stock-member-calendar';

const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const schedulerSource = readFileSync(new URL('./manual-stock-close-scheduler.ts', import.meta.url), 'utf8');
const snapshotDate = '2026-11-10';
const now = new Date('2026-11-10T16:00:00+08:00');

// Execute the current production declarations, not a second implementation of the publisher.
// Only external effects/DDL are injected; price/date/FX validation and transaction branches are real.
function declaration(name: string, text = source): string {
  const ast = ts.createSourceFile('production.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name
    || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === name));
  if (!node) throw new Error(`Missing production declaration: ${name}`);
  return node.getText(ast);
}
function loadFunctions(names: string[], dependencies: Record<string, unknown>, text = source): any {
  const code = ts.transpileModule(names.map(name => declaration(name, text)).join('\n')
    + '\nglobalThis.subject = {' + names.filter(name => ts.isFunctionDeclaration(
      ts.createSourceFile('one.ts', declaration(name, text), ts.ScriptTarget.Latest, true).statements[0])).join(',') + '};',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context: any = { ...dependencies, exports: {}, Date, Intl, console: { error: vi.fn(), log: vi.fn() } };
  runInNewContext(code, context, { timeout: 1000 });
  return context.subject;
}
const globals = ['STOCK_LEDGER_ID', 'STOCK_TRADE_FEE_RATE', 'STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION', 'EPSILON'];
const helpers = ['stockCurrency', 'stockMarket', 'numberValue', 'normalizeStoredDate', 'toIso', 'toBeijingWallClockIso', 'toMysqlBeijingDateTime'];
const publicationTable = 'ledger_stock_unified_close_category_publications';
const fundsWrite = /\b(?:INSERT(?:\s+IGNORE)?\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:users|balance_history|recharge_orders|af_manual_balances|ledger_stock_daily_snapshots|ledger_stock_events|ledger_stock_lots|ledger_stock_lot_participations|ledger_stock_participation_closures|ledger_stock_event_lot_allocations)\b/i;
const writes = (calls: any[][]) => calls.filter(([sql]) => /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP)\b/i.test(sql));
function assertNoFundsOrPublicationWrites(calls: any[][]) {
  for (const [sql] of calls) expect(sql).not.toMatch(fundsWrite);
  expect(writes(calls).filter(([sql]) => sql.includes(publicationTable))).toEqual([]);
}
function close(symbol: string): UnifiedCloseQuote {
  const usd = !symbol.includes('.');
  return { price: usd ? 50 : 12, currency: usd ? 'USD' : 'CNY', source: 'unified_close_yahoo',
    priceDate: usd ? '2026-11-09' : snapshotDate, updatedAt: '2026-11-10T15:06:00+08:00' };
}
const fx = Object.freeze({ usd_cny_rate: 6.7, source: 'yahoo_usdcny_5m',
  quote_as_of: '2026-11-10 15:00:00', locked_at: '2026-11-10 15:05:00' });
function publisherHarness(input: { symbols?: string[]; saved?: string[]; savedFx?: typeof fx | null; lockedFx?: Record<string, unknown> } = {}) {
  const symbols = input.symbols ?? ['600000.SH', '000001.SZ'];
  const saved = input.saved ?? ['600000.SH'];
  const oldPublication = Object.freeze({ category_id: 301, market_value: '123.45', quotes_json: '{"old":true}' });
  const before = JSON.stringify(oldPublication);
  const proofRows = saved.map(symbol => { const quote = close(symbol); return Object.freeze({ symbol, session_date: quote.priceDate,
    price: quote.price, currency: quote.currency, source: quote.source, captured_at: '2026-11-10 15:06:00' }); });
  const read = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT id FROM ledger_categories')) return [[{ id: 301 }]];
    if (sql.includes('FROM ledger_stock_lots l')) return [symbols.map((symbol, index) => ({ id: index + 1, symbol,
      unit_cost: 10, initial_quantity: 2, actual_traded_at: '2026-11-04 22:35:00' }))];
    if (sql.includes('FROM ledger_stock_events e')) return [[]];
    throw new Error(`Forbidden publisher read SQL: ${sql}`);
  });
  const execute = vi.fn(async (sql: string, _params: any[] = []) => {
    if (fundsWrite.test(sql)) throw new Error(`Forbidden funds mutation: ${sql}`);
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
    if (/^\s*SELECT/.test(sql) && sql.includes(publicationTable)) return [[oldPublication]];
    if (/^\s*SELECT/.test(sql) && sql.includes('FROM ledger_stock_unified_close_prices')) return [proofRows];
    if (/^\s*SELECT/.test(sql) && sql.includes('FROM ledger_stock_unified_close_fx')) {
      // MySQL must return raw Beijing DATETIME strings, regardless of the driver's local TZ.
      expect(sql).toMatch(/DATE_FORMAT\(quote_as_of,'%Y-%m-%d %H:%i:%s'\) AS quote_as_of/);
      expect(sql).toMatch(/DATE_FORMAT\(locked_at,'%Y-%m-%d %H:%i:%s'\) AS locked_at/);
      return [sql.includes('FOR UPDATE') ? [input.lockedFx ?? input.savedFx ?? fx] : input.savedFx === null ? [] : [input.savedFx ?? fx]];
    }
    if (/^\s*INSERT IGNORE INTO ledger_stock_unified_close_(prices|fx)\b/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Forbidden publisher write/SQL: ${sql}`);
  });
  const tx = { execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  const fetchQuotes = vi.fn(async (missing: string[]) => Object.fromEntries(missing.map(symbol => [symbol, close(symbol)])));
  const fetchFx = vi.fn(async () => ({ usdCnyRate: 6.7, source: fx.source,
    asOf: '2026-11-10T07:00:00.000Z', lockedAt: '2026-11-10T07:05:00.000Z' }));
  const markDirty = vi.fn();
  const invalidate = vi.fn();
  const ensure = vi.fn();
  const subject = loadFunctions([...globals, ...helpers, 'closeRefreshInProgress', 'refreshLedgerStockTagCloseSnapshots'], {
    getDbConnection: async () => ({ execute: read }), getDbTransactionConnection: async () => tx,
    ensureLedgerStockPortfolioTables: ensure, ensureStockCalendarResultTable: ensure,
    getOvernightUsSessionDate, isStockMarketSession, getUnifiedStockCloseSnapshotDate, getUnifiedStockCloseVersion,
    isUnifiedStockCloseReady: (date: string) => isUnifiedStockCloseReady(date, now), isUnifiedStockCloseQuoteForDate,
    marketSessionDateFromBeijingTradeTimestamp, isTrustedMemberCalendarClose,
    fetchOvernightUnifiedCloseQuotes: fetchQuotes, fetchStockUsdCnyAtClose: fetchFx,
    markStockCalendarResultDirty: markDirty, invalidateMemberStockReadCaches: invalidate,
  });
  return { publish: () => subject.refreshLedgerStockTagCloseSnapshots({ categoryId: 301, snapshotDate }),
    read, tx, fetchQuotes, fetchFx, markDirty, invalidate, assertImmutable: () => {
      assertNoFundsOrPublicationWrites([...read.mock.calls, ...execute.mock.calls]);
      expect(JSON.stringify(oldPublication)).toBe(before);
    } };
}

describe('published stock close evidence repair (real production functions; offline, no DB/HTTP)', () => {
  it('existing publication with a backdated new symbol fetches only true missing close, inserts evidence and dirties cache without touching old publication', async () => {
    const h = publisherHarness();
    expect(await h.publish()).toMatchObject({ complete: true, updated: 2, publishedCategories: 0, alreadyPublishedCategories: 1 });
    expect(h.fetchQuotes.mock.calls).toEqual([[['000001.SZ'], snapshotDate]]);
    const proofWrites = writes(h.tx.execute.mock.calls);
    expect(proofWrites).toHaveLength(2);
    expect(proofWrites.every(([sql]) => sql.includes('INSERT IGNORE INTO ledger_stock_unified_close_prices'))).toBe(true);
    expect(proofWrites.find(([, params]) => params[2] === '000001.SZ')?.[1]).toEqual([
      37, 301, '000001.SZ', snapshotDate, 12, 'CNY', 'unified_close_yahoo', 'cn-us-regular-close-v1',
    ]);
    expect(h.markDirty.mock.calls).toEqual([[h.tx, 301]]);
    expect(h.tx.commit).toHaveBeenCalledOnce(); expect(h.tx.rollback).not.toHaveBeenCalled();
    expect(h.invalidate).toHaveBeenCalledOnce(); h.assertImmutable();
  });
  it('complete existing publication validates evidence then immediately skips all fetches, transactions and writes', async () => {
    const h = publisherHarness({ saved: ['600000.SH', '000001.SZ'] });
    expect(await h.publish()).toMatchObject({ complete: true, updated: 0, alreadyPublishedCategories: 1 });
    expect(h.fetchQuotes).not.toHaveBeenCalled(); expect(h.fetchFx).not.toHaveBeenCalled();
    expect(writes([...h.read.mock.calls, ...h.tx.execute.mock.calls])).toEqual([]);
    expect(h.tx.beginTransaction).not.toHaveBeenCalled(); expect(h.markDirty).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled(); expect(h.tx.release).toHaveBeenCalledOnce(); h.assertImmutable();
  });
  it('USD repair reuses saved Beijing wall-clock FX: both formatted SELECTs compare equal without driver timezone shifts', async () => {
    const h = publisherHarness({ symbols: ['600000.SH', 'AAOI'], saved: ['600000.SH'], savedFx: fx });
    expect(await h.publish()).toMatchObject({ complete: true, updated: 2 });
    expect(h.fetchQuotes.mock.calls).toEqual([[['AAOI'], snapshotDate]]);
    expect(h.fetchFx).not.toHaveBeenCalled();
    const fxReads = h.tx.execute.mock.calls.filter(([sql]) => /^\s*SELECT/.test(sql) && sql.includes('FROM ledger_stock_unified_close_fx'));
    expect(fxReads).toHaveLength(2); expect(fxReads[1][0]).toContain('FOR UPDATE');
    expect(writes(h.tx.execute.mock.calls).find(([sql]) => sql.includes('close_fx'))?.[1].slice(-2)).toEqual([fx.quote_as_of, fx.locked_at]);
    expect(h.tx.commit).toHaveBeenCalledOnce(); expect(h.tx.rollback).not.toHaveBeenCalled(); h.assertImmutable();
  });
  it('missing FX alone repairs a published USD day and normalizes fetched UTC instants to immutable Beijing DATETIME', async () => {
    const h = publisherHarness({ symbols: ['AAOI'], saved: ['AAOI'], savedFx: null });
    expect(await h.publish()).toMatchObject({ complete: true, updated: 1, alreadyPublishedCategories: 1 });
    expect(h.fetchQuotes).not.toHaveBeenCalled(); expect(h.fetchFx.mock.calls).toEqual([[snapshotDate]]);
    expect(writes(h.tx.execute.mock.calls).find(([sql]) => sql.includes('close_fx'))?.[1].slice(-2)).toEqual([fx.quote_as_of, fx.locked_at]);
    expect(h.markDirty.mock.calls).toEqual([[h.tx, 301]]); expect(h.tx.commit).toHaveBeenCalledOnce(); h.assertImmutable();
  });
  it.each([
    { usd_cny_rate: 6.8 }, { source: 'sina_usdcny' },
    { quote_as_of: '2026-11-10 15:01:00' }, { locked_at: '2026-11-10 15:04:59' },
  ])('immutable locked FX conflict %j blocks publication/cache dirty and rolls the repair back', async conflict => {
    const h = publisherHarness({ symbols: ['AAOI'], saved: [], savedFx: null, lockedFx: { ...fx, ...conflict } });
    expect(await h.publish()).toMatchObject({ complete: false, updated: 0, skippedCategories: 1, publishedCategories: 0, alreadyPublishedCategories: 0 });
    expect(h.tx.beginTransaction).toHaveBeenCalledOnce(); expect(h.tx.rollback).toHaveBeenCalledOnce();
    expect(h.tx.commit).not.toHaveBeenCalled(); expect(h.markDirty).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled(); expect(h.tx.release).toHaveBeenCalledOnce(); h.assertImmutable();
  });
  it('member history FX SELECT also requests wall-clock strings rather than default mysql Date objects', () => {
    const member = declaration('buildMemberStockPortfolio');
    const sql = member.match(/`SELECT DATE_FORMAT\(snapshot_date[^`]*FROM ledger_stock_unified_close_fx[^`]*`/)?.[0];
    expect(sql).toBeDefined();
    expect(sql).toContain("DATE_FORMAT(quote_as_of,'%Y-%m-%d %H:%i:%s') AS quote_as_of");
    expect(sql).toContain("DATE_FORMAT(locked_at,'%Y-%m-%d %H:%i:%s') AS locked_at");
  });
});

describe('background-only pending close repair wiring (real production functions)', () => {
  it('repairs at most 14 due pending dates per tag, oldest first, including dates outside startup window', async () => {
    const pending = Array.from({ length: 20 }, (_, i) => ({ snapshotDate: `2026-09-${String(i + 1).padStart(2, '0')}`, ready: false, dailyPnl: null }));
    const rows = [{ snapshotDate: '2026-08-31', ready: true, dailyPnl: 10 },
      { snapshotDate: '2026-11-11', ready: false, dailyPnl: null }, ...pending.reverse()];
    const publish = vi.fn(); const rebuild = vi.fn(); const read = vi.fn(async () => rows);
    const execute = vi.fn(async (sql: string, params: unknown[]) => {
      expect(sql).toMatch(/^\s*SELECT id FROM ledger_categories/); expect(params).toEqual([37, 301]); return [[{ id: 301 }]];
    });
    const subject = loadFunctions(['STOCK_LEDGER_ID', 'calendarEvidenceRepairInProgress', 'repairPendingStockTagCalendarEvidence'], {
      getDbConnection: async () => ({ execute }), readStockCalendarResult: read,
      isUnifiedStockCloseReady: (date: string) => isUnifiedStockCloseReady(date, now),
      refreshLedgerStockTagCloseSnapshots: publish, rebuildStockTagCalendarResult: rebuild,
    });
    expect(await subject.repairPendingStockTagCalendarEvidence({ categoryId: 301 })).toEqual({ attempted: 14, busy: false });
    const eligible = rows.filter(point => (!point.ready || point.dailyPnl === null) && isUnifiedStockCloseReady(point.snapshotDate, now))
      .map(point => point.snapshotDate).sort();
    expect(eligible.length).toBeGreaterThanOrEqual(14);
    expect(publish.mock.calls.map(([input]) => input)).toEqual(eligible.slice(0, 14).map(snapshotDate => ({ categoryId: 301, snapshotDate })));
    expect(publish.mock.calls.every(([input]) => input.snapshotDate < '2026-10-27')).toBe(true);
    expect(rebuild.mock.calls).toEqual([[{ categoryId: 301 }]]);
    expect(writes(execute.mock.calls)).toEqual([]);
  });
  it('physical-trade queue runs metadata recheck then pending repair; scheduler warms before pending repair', async () => {
    const order: string[] = [];
    const rebuild = vi.fn(async () => { order.push('rebuild'); });
    const repair = vi.fn(async () => { order.push('repair'); });
    const queue = loadFunctions(['queueStockCalendarResultRebuild'], { rebuildStockTagCalendarResult: rebuild, repairPendingStockTagCalendarEvidence: repair });
    expect(queue.queueStockCalendarResultRebuild(301)).toBeUndefined();
    await new Promise(resolve => setImmediate(resolve));
    expect(order).toEqual(['rebuild', 'rebuild', 'repair']); expect(repair.mock.calls).toEqual([[{ categoryId: 301 }]]);
    order.length = 0; repair.mockClear();
    const publisher = vi.fn();
    const scheduler = loadFunctions(['unifiedCloseInProgress', 'refreshUnifiedStockCloseCandidates'], {
      ensureLedgerStockPortfolioTables: vi.fn(), ensureUnifiedClosePublicationTable: vi.fn(),
      getDbConnection: async () => ({ execute: vi.fn(() => { throw new Error('No publication SQL expected for empty candidates'); }) }),
      getUnifiedStockCloseCandidateDates: () => [], refreshLedgerStockTagCloseSnapshots: publisher,
      warmAllStockTagCalendarResults: async () => { order.push('warm'); }, repairPendingStockTagCalendarEvidence: repair,
    }, schedulerSource);
    await scheduler.refreshUnifiedStockCloseCandidates(now);
    expect(order).toEqual(['warm', 'repair']); expect(repair.mock.calls).toEqual([[]]); expect(publisher).not.toHaveBeenCalled();
  });
  it('read route returns cached pending data without publisher, queue, repair, rebuild, quotes, FX or DDL', async () => {
    const pending = [{ snapshotDate: '2026-09-01', ready: false, dailyPnl: null }];
    const forbidden = vi.fn(() => { throw new Error('Read path attempted write/background/network work'); });
    const read = vi.fn(async () => pending);
    const subject = loadFunctions(['getStockTagCalendar'], {
      assertStockTagAccess: vi.fn(async () => ({ categoryId: 301, ledgerId: 37, canEdit: false })),
      isStockCalendarMemberEligible: vi.fn(async () => true), readStockCalendarResult: read,
      refreshLedgerStockTagCloseSnapshots: forbidden, repairPendingStockTagCalendarEvidence: forbidden,
      queueStockCalendarResultRebuild: forbidden, rebuildStockTagCalendarResult: forbidden,
      fetchOvernightUnifiedCloseQuotes: forbidden, fetchStockUsdCnyAtClose: forbidden,
      ensureLedgerStockPortfolioTables: forbidden, ensureStockCalendarResultTable: forbidden, markStockCalendarResultDirty: forbidden,
    });
    expect(await subject.getStockTagCalendar({ ledgerId: 37, categoryId: 301, userId: 5 })).toBe(pending);
    expect(read.mock.calls).toEqual([[301]]); expect(forbidden).not.toHaveBeenCalled();
  });
});
