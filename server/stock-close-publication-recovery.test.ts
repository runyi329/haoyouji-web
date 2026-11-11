import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { getOvernightUsSessionDate, isStockMarketSession } from '../shared/stock-market-session';
import { getUnifiedStockCloseSnapshotDate, getUnifiedStockCloseVersion, isUnifiedStockCloseReady, isUnifiedStockCloseQuoteForDate } from '../shared/stock-unified-close-policy';
import { marketSessionDateFromBeijingTradeTimestamp, type UnifiedCloseQuote } from './stock-unified-close-quotes';
import { isTrustedMemberCalendarClose } from './shared/stock-member-calendar';

const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const snapshotDate = '2026-11-10';
const now = new Date('2026-11-10T16:00:00+08:00');
const priceTable = 'ledger_stock_unified_close_prices';
const fxTable = 'ledger_stock_unified_close_fx';
const publicationTable = 'ledger_stock_unified_close_category_publications';
const fundsWrite = /\b(?:INSERT(?:\s+IGNORE)?\s+INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:users|balance_history|recharge_orders|af_manual_balances|ledger_stock_daily_snapshots|ledger_stock_events|ledger_stock_lots|ledger_stock_lot_participations|ledger_stock_participation_closures|ledger_stock_event_lot_allocations)\b/i;
function declaration(name: string): string {
  const ast = ts.createSourceFile('production.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name
    || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === name));
  if (!node) throw new Error(`Missing production declaration: ${name}`);
  return node.getText(ast);
}
function close(symbol: string, override: Partial<UnifiedCloseQuote> = {}): UnifiedCloseQuote {
  const usd = !/\d{6}\.(SH|SZ|BJ)$/.test(symbol);
  return { price: usd ? 50 : 12, currency: usd ? 'USD' : 'CNY', source: 'unified_close_yahoo',
    priceDate: usd ? '2026-11-09' : snapshotDate, updatedAt: '2026-11-10T15:06:00+08:00', ...override };
}
const validFx = { usdCnyRate: 6.7, source: 'yahoo_usdcny_5m',
  asOf: '2026-11-10T07:00:00.000Z', lockedAt: '2026-11-10T07:05:00.000Z' };
const archivedFx = { usd_cny_rate: 6.7, source: 'yahoo_usdcny_5m',
  quote_as_of: '2026-11-10 15:00:00', locked_at: '2026-11-10 15:05:00' };
type Proof = { symbol: string; session_date: string; price: number; currency: string; source: string; captured_at: string };
function proof(symbol: string, override: Partial<Proof> = {}): Proof {
  const q = close(symbol);
  return { symbol, session_date: q.priceDate, price: q.price, currency: q.currency,
    source: q.source, captured_at: '2026-11-10 15:06:00', ...override };
}
function harness(input: {
  symbols?: string[]; saved?: Proof[]; savedFx?: typeof archivedFx | null;
  fetched?: Record<string, UnifiedCloseQuote>; fetchedFx?: typeof validFx | null;
  quoteError?: boolean; fxError?: boolean; publication?: boolean; lockedFx?: Record<string, unknown>;
  ignoredPrices?: Proof[]; categories?: number[]; badReadCategory?: number; ready?: boolean;
  quoteFetcher?: () => Promise<Record<string, UnifiedCloseQuote>>;
} = {}) {
  const symbols = input.symbols ?? ['600000.SH', '000001.SZ', 'AAOI'];
  const categories = input.categories ?? [301];
  const order: string[] = [];
  let persistedPrices = new Map((input.saved ?? []).map(p => [p.symbol, p]));
  let persistedFx = input.savedFx ?? null;
  let persistedPublication: any = input.publication ? Object.freeze({ old: true, market_value: 123.45, quotes_json: '{"old":true}' }) : null;
  const immutableBefore = JSON.stringify(persistedPublication);
  let draftPrices = new Map(persistedPrices), draftFx: any = persistedFx, draftPublication = persistedPublication;
  let generation = 0, draftGeneration = 0, inTransaction = false;
  const read = vi.fn(async (sql: string, params: any[]) => {
    if (sql.includes('SELECT id FROM ledger_categories')) return [categories.map(id => ({ id }))];
    if (params[1] === input.badReadCategory) throw new Error('upstream secret token=must-not-appear');
    if (sql.includes('FROM ledger_stock_lots l')) return [symbols.map((symbol, index) => ({ id: index + 1, symbol,
      unit_cost: 10, initial_quantity: 2, actual_traded_at: '2026-11-04 22:35:00' }))];
    if (sql.includes('FROM ledger_stock_events e')) return [[]];
    throw new Error(`Unexpected read SQL: ${sql}`);
  });
  const execute = vi.fn(async (sql: string, params: any[] = []) => {
    expect(sql).not.toMatch(fundsWrite);
    if (sql.includes('GET_LOCK')) { order.push('lock'); return [[{ acquired: 1 }]]; }
    if (sql.includes('RELEASE_LOCK')) { order.push('unlock'); return [[{ released: 1 }]]; }
    if (/^\s*SELECT/.test(sql) && sql.includes(publicationTable)) return [persistedPublication ? [persistedPublication] : []];
    if (/^\s*SELECT/.test(sql) && sql.includes(priceTable)) {
      if (sql.includes('FOR UPDATE')) return [[draftPrices.get(params[2])].filter(Boolean)];
      order.push('read_quotes'); return [[...persistedPrices.values()]];
    }
    if (/^\s*SELECT/.test(sql) && sql.includes(fxTable)) {
      order.push(sql.includes('FOR UPDATE') ? 'locked_fx' : 'read_fx');
      const row = sql.includes('FOR UPDATE') ? input.lockedFx ?? draftFx : persistedFx;
      return [row ? [row] : []];
    }
    expect(inTransaction).toBe(true);
    if (/^\s*INSERT IGNORE/.test(sql) && sql.includes(priceTable)) {
      order.push(`insert_quote:${params[2]}`);
      const ignored = input.ignoredPrices?.find(p => p.symbol === params[2]);
      if (ignored) draftPrices.set(params[2], ignored);
      if (draftPrices.has(params[2])) return [{ affectedRows: 0 }];
      draftPrices.set(params[2], proof(params[2], { session_date: params[3], price: params[4], currency: params[5], source: params[6] }));
      return [{ affectedRows: 1 }];
    }
    if (/^\s*INSERT IGNORE/.test(sql) && sql.includes(fxTable)) {
      order.push('insert_fx');
      if (draftFx) return [{ affectedRows: 0 }];
      draftFx = { usd_cny_rate: params[4], source: params[5], quote_as_of: params[6], locked_at: params[7] };
      return [{ affectedRows: 1 }];
    }
    if (/^\s*INSERT INTO/.test(sql) && sql.includes(publicationTable)) {
      order.push('publish');
      expect(draftPublication).toBeNull();
      draftPublication = { market_value: params[4], cost_value: params[5], quotes_json: params[11] };
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const tx = { execute,
    beginTransaction: vi.fn(async () => { order.push('begin'); inTransaction = true;
      draftPrices = new Map(persistedPrices); draftFx = persistedFx; draftPublication = persistedPublication; draftGeneration = generation; }),
    commit: vi.fn(async () => { order.push('commit'); persistedPrices = draftPrices; persistedFx = draftFx;
      persistedPublication = draftPublication; generation = draftGeneration; inTransaction = false; }),
    rollback: vi.fn(async () => { order.push('rollback'); inTransaction = false; }), release: vi.fn(),
  };
  const fetchQuotes = vi.fn(async () => {
    order.push('fetch_quotes');
    if (input.quoteError) throw new Error('https://provider/?token=must-not-appear');
    return input.quoteFetcher ? input.quoteFetcher() : input.fetched ?? Object.fromEntries(symbols.map(s => [s, close(s)]));
  });
  const fetchFx = vi.fn(async () => {
    order.push('fetch_fx');
    if (input.fxError) throw new Error('password=must-not-appear');
    return input.fetchedFx === undefined ? validFx : input.fetchedFx;
  });
  const markDirty = vi.fn(async (_tx, categoryId) => { order.push('dirty'); expect(_tx).toBe(tx);
    expect(inTransaction).toBe(true); expect(categoryId).toBeGreaterThan(0); draftGeneration++; });
  const invalidate = vi.fn();
  const log = vi.fn();
  const names = ['STOCK_LEDGER_ID', 'STOCK_TRADE_FEE_RATE', 'STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION', 'EPSILON',
    'stockCurrency', 'stockMarket', 'numberValue', 'normalizeStoredDate', 'toIso', 'toBeijingWallClockIso', 'toMysqlBeijingDateTime',
    'closeRefreshInProgress', 'refreshLedgerStockTagCloseSnapshots'];
  const code = ts.transpileModule(names.map(declaration).join('\n') + '\nglobalThis.publish = refreshLedgerStockTagCloseSnapshots;',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context: any = { Date, Intl, exports: {}, console: { error: log },
    getDbConnection: async () => ({ execute: read }), getDbTransactionConnection: async () => tx,
    ensureLedgerStockPortfolioTables: vi.fn(), ensureStockCalendarResultTable: vi.fn(),
    getOvernightUsSessionDate, isStockMarketSession, getUnifiedStockCloseSnapshotDate, getUnifiedStockCloseVersion,
    isUnifiedStockCloseReady: (date: string) => input.ready !== false && isUnifiedStockCloseReady(date, now),
    isUnifiedStockCloseQuoteForDate, marketSessionDateFromBeijingTradeTimestamp, isTrustedMemberCalendarClose,
    fetchOvernightUnifiedCloseQuotes: fetchQuotes, fetchStockUsdCnyAtClose: fetchFx,
    markStockCalendarResultDirty: markDirty, invalidateMemberStockReadCaches: invalidate };
  runInNewContext(code, context, { timeout: 1000 });
  return { publish: () => context.publish({ snapshotDate }), read, tx, fetchFx, fetchQuotes, markDirty, invalidate, order, log,
    state: () => ({ prices: [...persistedPrices.values()], fx: persistedFx, publication: persistedPublication, generation }),
    assertOldPublication: () => expect(JSON.stringify(persistedPublication)).toBe(immutableBefore) };
}

describe('close publication partial evidence recovery (production function, offline DB/HTTP mocks)', () => {
  it('one missing close preserves other verified closes and FX, atomically dirties generation, but cannot publish', async () => {
    const h = harness({ fetched: { '600000.SH': close('600000.SH'), AAOI: close('AAOI') } });
    const result = await h.publish();
    expect(result).toMatchObject({ complete: false, updated: 2, skippedCategories: 1, publishedCategories: 0,
      failures: [{ categoryId: 301, snapshotDate, reason: 'not_found', missingSymbols: ['000001.SZ'],
        details: { stage: 'quote', expectedDate: snapshotDate, actualDate: '', source: '', currency: '' } }] });
    expect(h.state().prices.map(p => p.symbol)).toEqual(['600000.SH', 'AAOI']);
    expect(h.state().fx).toEqual(archivedFx); expect(h.state().publication).toBeNull();
    expect(h.state().generation).toBe(1); expect(h.markDirty).toHaveBeenCalledOnce();
    expect(h.order.indexOf('fetch_fx')).toBeLessThan(h.order.indexOf('fetch_quotes'));
    expect(h.order.indexOf('insert_fx')).toBeLessThan(h.order.indexOf('dirty'));
    expect(h.order.indexOf('dirty')).toBeLessThan(h.order.indexOf('commit'));
    expect(h.tx.rollback).not.toHaveBeenCalled(); expect(h.invalidate).toHaveBeenCalledOnce();
  });
  it('FX is fetched and archived even if every stock close is absent', async () => {
    const h = harness({ symbols: ['AAOI'], fetched: {} });
    expect(await h.publish()).toMatchObject({ complete: false, updated: 0, publishedCategories: 0, skippedCategories: 1 });
    expect(h.fetchFx).toHaveBeenCalledOnce(); expect(h.state()).toMatchObject({ prices: [], fx: archivedFx, publication: null, generation: 1 });
    expect(h.markDirty).toHaveBeenCalledOnce(); expect(h.invalidate).toHaveBeenCalledOnce();
  });
  it('FX finishes independently while a slow stock fetch is still pending', async () => {
    let resolveQuotes!: (quotes: Record<string, UnifiedCloseQuote>) => void;
    const quotes = new Promise<Record<string, UnifiedCloseQuote>>(resolve => { resolveQuotes = resolve; });
    const h = harness({ symbols: ['AAOI'], quoteFetcher: () => quotes });
    const pending = h.publish();
    await new Promise(resolve => setImmediate(resolve));
    expect(h.fetchFx).toHaveBeenCalledOnce(); expect(h.fetchQuotes).toHaveBeenCalledOnce();
    expect(h.order.indexOf('fetch_fx')).toBeLessThan(h.order.indexOf('fetch_quotes'));
    resolveQuotes({}); await pending;
    expect(h.state().fx).toEqual(archivedFx);
  });
  it('missing FX cannot throw away valid stock closes', async () => {
    const h = harness({ fetchedFx: null });
    expect(await h.publish()).toMatchObject({ complete: false, updated: 3, skippedCategories: 1,
      failures: [{ reason: 'not_found', details: { stage: 'fx' } }] });
    expect(h.state().prices).toHaveLength(3); expect(h.state()).toMatchObject({ fx: null, publication: null, generation: 1 });
  });
  it.each([
    { asOf: '2026-11-10T07:05:01.000Z' }, { asOf: '2026-11-10T06:34:59.000Z' },
    { lockedAt: '2026-11-10T07:04:59.000Z' }, { asOf: 'not-a-time' },
  ])('bad FX cutoff %j is separate from not_found and does not stop stock evidence', async bad => {
    const h = harness({ fetchedFx: { ...validFx, ...bad } });
    expect(await h.publish()).toMatchObject({ complete: false, failures: [{ reason: 'bad_cutoff', details: { stage: 'fx' } }] });
    expect(h.state().prices).toHaveLength(3); expect(h.state().fx).toBeNull(); expect(h.state().publication).toBeNull();
  });
  it('full verified set commits proof, immutable FX, publication and generation together', async () => {
    const h = harness();
    expect(await h.publish()).toMatchObject({ complete: true, updated: 3, publishedCategories: 1, skippedCategories: 0 });
    expect(h.state().prices).toHaveLength(3); expect(h.state().fx).toEqual(archivedFx);
    expect(h.state().publication).toMatchObject({ market_value: 718, cost_value: 174 });
    expect(h.order.indexOf('locked_fx')).toBeLessThan(h.order.indexOf('publish'));
    expect(h.order.indexOf('publish')).toBeLessThan(h.order.indexOf('dirty'));
    expect(h.tx.commit).toHaveBeenCalledOnce(); expect(h.tx.rollback).not.toHaveBeenCalled();
  });
  it.each([{ usd_cny_rate: 6.8 }, { source: 'sina_usdcny' },
    { quote_as_of: '2026-11-10 15:01:00' }, { locked_at: '2026-11-10 15:04:59' },
  ])('immutable FX conflict %j rolls ALL evidence back without dirty/publication', async conflict => {
    const h = harness({ lockedFx: { ...archivedFx, ...conflict } });
    expect(await h.publish()).toMatchObject({ complete: false, updated: 0, skippedCategories: 1,
      failures: [{ reason: 'publication_error', details: { stage: 'transaction' } }] });
    expect(h.tx.rollback).toHaveBeenCalledOnce(); expect(h.tx.commit).not.toHaveBeenCalled();
    expect(h.markDirty).not.toHaveBeenCalled(); expect(h.invalidate).not.toHaveBeenCalled();
    expect(h.state()).toMatchObject({ prices: [], fx: null, publication: null, generation: 0 });
  });
  it('repeated partial evidence does not increment generation or dirty cache a second time', async () => {
    const h = harness({ fetched: { '600000.SH': close('600000.SH'), AAOI: close('AAOI') } });
    await h.publish(); expect(h.state().generation).toBe(1);
    h.markDirty.mockClear(); h.invalidate.mockClear(); h.fetchFx.mockClear();
    expect(await h.publish()).toMatchObject({ complete: false, skippedCategories: 1 });
    expect(h.state().generation).toBe(1); expect(h.markDirty).not.toHaveBeenCalled();
    expect(h.fetchFx).not.toHaveBeenCalled(); expect(h.invalidate).not.toHaveBeenCalled();
  });
  it('already published amount is never overwritten when new valid evidence is appended', async () => {
    const h = harness({ publication: true, saved: [proof('600000.SH')], savedFx: archivedFx });
    expect(await h.publish()).toMatchObject({ complete: true, publishedCategories: 0, alreadyPublishedCategories: 1 });
    h.assertOldPublication(); expect(h.order).not.toContain('publish'); expect(h.markDirty).toHaveBeenCalledOnce();
    expect(h.fetchFx).not.toHaveBeenCalled();
  });
  it('an already published fully covered archive performs no transaction, network or dirty work', async () => {
    const h = harness({ publication: true, saved: ['600000.SH', '000001.SZ', 'AAOI'].map(s => proof(s)), savedFx: archivedFx });
    expect(await h.publish()).toMatchObject({ complete: true, updated: 0, alreadyPublishedCategories: 1 });
    expect(h.tx.beginTransaction).not.toHaveBeenCalled(); expect(h.fetchQuotes).not.toHaveBeenCalled();
    expect(h.fetchFx).not.toHaveBeenCalled(); expect(h.markDirty).not.toHaveBeenCalled(); h.assertOldPublication();
  });
  it('sina is allowed both for fetched stock closes and saved proof SQL', async () => {
    const sina = close('600000.SH', { source: 'unified_close_sina' });
    const h = harness({ symbols: ['600000.SH'], fetched: { '600000.SH': sina } });
    expect(await h.publish()).toMatchObject({ complete: true, publishedCategories: 1 });
    expect(h.state().prices[0].source).toBe('unified_close_sina');
    expect(h.tx.execute.mock.calls.find(([sql]) => sql.includes(`FROM ${priceTable}`))?.[0])
      .toContain("source IN ('unified_close_yahoo','unified_close_tushare','unified_close_sina')");
    expect(declaration('buildMemberStockPortfolio')).toContain("source IN ('unified_close_yahoo','unified_close_tushare','unified_close_sina')");
    const saved = harness({ symbols: ['600000.SH'], saved: [proof('600000.SH', { source: 'unified_close_sina' })], fetched: {} });
    expect(await saved.publish()).toMatchObject({ complete: true }); expect(saved.fetchQuotes).not.toHaveBeenCalled();
  });
  it.each([
    [{ priceDate: '' }, 'missing_date'], [{ priceDate: '2026-11-09' }, 'bad_price_or_date'],
    [{ currency: 'USD' }, 'bad_currency'], [{ source: 'price_snapshot' }, 'bad_source'],
    [{ updatedAt: '2026-11-10T14:59:59+08:00' }, 'untrusted_close'],
  ] as const)('invalid quote %j identifies the missing symbol/date/currency/source rather than publishing it', async (override, reason) => {
    const h = harness({ symbols: ['600000.SH', 'AAOI'], fetched: { '600000.SH': close('600000.SH', override), AAOI: close('AAOI') } });
    expect(await h.publish()).toMatchObject({ complete: false, failures: [{ reason, missingSymbols: ['600000.SH'],
      details: { symbol: '600000.SH', expectedDate: snapshotDate } }] });
    expect(h.state().prices.map(p => p.symbol)).toEqual(['AAOI']); expect(h.state().fx).toEqual(archivedFx);
    expect(h.state().publication).toBeNull();
  });
  it('rejected stock fetch still archives FX and does not log raw upstream secrets', async () => {
    const h = harness({ symbols: ['AAOI'], quoteError: true });
    expect(await h.publish()).toMatchObject({ complete: false, failures: [{ reason: 'fetch_failed', missingSymbols: ['AAOI'] }] });
    expect(h.state().fx).toEqual(archivedFx); expect(JSON.stringify(h.log.mock.calls)).not.toContain('must-not-appear');
  });
  it('rejected early FX promise is handled while quotes continue and persist', async () => {
    const h = harness({ symbols: ['AAOI'], fxError: true });
    expect(await h.publish()).toMatchObject({ complete: false, failures: [{ reason: 'not_found', details: { stage: 'fx' } }] });
    expect(h.state().prices).toHaveLength(1); expect(h.state().generation).toBe(1);
    expect(JSON.stringify(h.log.mock.calls)).not.toContain('must-not-appear');
  });
  it('an invalid immutable FX archive is not silently refetched or overwritten', async () => {
    const h = harness({ savedFx: { ...archivedFx, locked_at: '2026-11-10 15:04:59' } });
    expect(await h.publish()).toMatchObject({ complete: false, failures: [{ reason: 'bad_cutoff' }] });
    expect(h.fetchFx).not.toHaveBeenCalled(); expect(h.state().fx?.locked_at).toBe('2026-11-10 15:04:59');
    expect(h.state().prices).toHaveLength(3); expect(h.state().publication).toBeNull();
  });
  it('INSERT IGNORE with an untrusted existing immutable row cannot publish an unsaved fetched quote', async () => {
    const h = harness({ symbols: ['600000.SH'], ignoredPrices: [proof('600000.SH', { source: 'intraday' })] });
    expect(await h.publish()).toMatchObject({ complete: false, failures: [{ reason: 'evidence_insert_ignored' }] });
    expect(h.state().publication).toBeNull(); expect(h.markDirty).not.toHaveBeenCalled();
  });
  it('INSERT IGNORE reads a valid immutable winner back and publishes its old price, not new fetch price', async () => {
    const h = harness({ symbols: ['600000.SH'], ignoredPrices: [proof('600000.SH', { price: 13 })] });
    expect(await h.publish()).toMatchObject({ complete: true, publishedCategories: 1 });
    expect(h.state().publication.market_value).toBe(26); expect(h.markDirty).not.toHaveBeenCalled();
  });
  it('unexpected category read error is sanitized and cannot block subsequent tags', async () => {
    const h = harness({ symbols: ['600000.SH'], categories: [301, 302], badReadCategory: 301 });
    expect(await h.publish()).toMatchObject({ complete: false, categories: 2, skippedCategories: 1, publishedCategories: 1,
      failures: [{ categoryId: 301, reason: 'publication_error' }] });
    expect(JSON.stringify(h.log.mock.calls)).not.toContain('must-not-appear');
    expect(h.markDirty.mock.calls[0][1]).toBe(302);
  });
  it('not-ready or future snapshot performs no FX capture, quote fetch or database work', async () => {
    const h = harness({ ready: false });
    expect(await h.publish()).toMatchObject({ complete: false, categories: 0 });
    expect(h.read).not.toHaveBeenCalled(); expect(h.fetchFx).not.toHaveBeenCalled(); expect(h.fetchQuotes).not.toHaveBeenCalled();
  });
});
