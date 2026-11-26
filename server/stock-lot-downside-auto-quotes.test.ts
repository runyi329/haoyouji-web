import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { isStockMarketSession, isStockSessionDate } from '../shared/stock-market-session';
import { parsePortfolioInstrument } from '../shared/portfolio-instruments';
import { createStockLotDownsideVersion, isStockLotDownsideAutoWaiting } from '../shared/stock-lot-downside';

// Never load live application modules, even if a future edit accidentally adds an import.
vi.mock('./db', () => { throw new Error('Forbidden real DB import'); });
vi.mock('./ledger-stock-portfolio', () => { throw new Error('Forbidden full portfolio import'); });
vi.mock('./routers', () => { throw new Error('Forbidden router import'); });
vi.mock('./_core/index', () => { throw new Error('Forbidden startup import'); });
vi.mock('./price-scanner', () => { throw new Error('Forbidden live scanner import'); });
const tree = (file: string) => ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const scanner = tree('./price-scanner.ts'), portfolio = tree('./ledger-stock-portfolio.ts'), trigger = tree('./stock-lot-downside-auto-trigger.ts');
function extract(name: string, bindings: Record<string, unknown>, ast = scanner): any {
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!fn) throw new Error(`Missing extracted function ${name}`);
  const text = fn.getText(ast).replace(/^export\s+/, '');
  const code = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(bindings), `${code}\nreturn ${name};`)(...Object.values(bindings));
}
const now = Date.parse('2026-11-25T15:30:00Z');
const nowIso = () => new Date().toISOString();
const valid = (price: number) => Number.isFinite(price) && price > 0;
const dateNY = extract('newYorkTradingDate', {});
const parseSinaAutoQuoteObservedAt = extract('parseSinaAutoQuoteObservedAt', { isStockSessionDate });
const stockAutoQuoteEvidence = extract('stockAutoQuoteEvidence', { isStockMarketSession });
const quoteBindings = { isValidPrice: valid, nowIso, parseSinaAutoQuoteObservedAt, stockAutoQuoteEvidence, newYorkTradingDate: dateNY };
const instant = (value: unknown) => value instanceof Date ? value.getTime()
  : typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const localClock = extract('localClock', {}, trigger);
const quoteValid = extract('isStockLotDownsideAutoQuoteValid', { instant, localClock, parsePortfolioInstrument, isStockMarketSession, isStockSessionDate }, trigger);
const canTrigger = extract('canTrigger', { instant, isStockLotDownsideAutoWaiting }, trigger);
const armedRule = (symbol: string, armedAt: string) => createStockLotDownsideVersion({
  ledgerId: 37, categoryId: 90250, lotId: 1, userId: 7, currency: symbol.includes('.') ? 'CNY' : 'USD',
  enabled: true, activationMode: 'auto_drop', autoDropPercent: 10, autoEntryPrice: 100, expectedVersion: 0,
  effectiveAt: armedAt, currentRawPrice: NaN,
}, null);
const asAutoQuote = (quote: any, symbol = 'AAPL') => ({ ledgerId: 37, categoryId: 90250, symbol,
  price: quote.price, currency: quote.currency, priceDate: quote.autoTriggerPriceDate,
  observedAt: quote.autoTriggerObservedAt, source: quote.source });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(now));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Forbidden real network call'); }));
  vi.stubGlobal('WebSocket', vi.fn(() => { throw new Error('Forbidden live stream'); }));
});
afterEach(() => { expect(globalThis.fetch).not.toHaveBeenCalled(); expect(globalThis.WebSocket).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function yahoo(regularMarketTime: unknown) {
  const fetchJson = vi.fn(async () => ({ chart: { result: [{ meta: { regularMarketPrice: 80, regularMarketTime } }] } }));
  const quote = await extract('fetchYahooIntradayStockQuote', { ...quoteBindings, fetchJson })('AAPL');
  expect(fetchJson).toHaveBeenCalledOnce();
  return quote;
}
function aParts(overrides: Record<number, string> = {}) {
  const parts = Array<string>(33).fill('0');
  Object.assign(parts, { 0: 'TEST', 1: '100', 2: '80', 3: '70', 30: '2026-11-25', 31: '13:59:59' }, overrides);
  return parts;
}
function usParts(overrides: Record<number, string> = {}) {
  const parts = Array<string>(35).fill('0');
  Object.assign(parts, { 0: 'TEST', 1: '70', 3: '2026-11-25 23:29:59', 24: 'Nov 25 07:59PM EST', 25: 'Nov 25 10:29AM EST', 29: '2026' }, overrides);
  return parts;
}
async function sina(parts: string[], symbol = '600000.SH', variable?: string) {
  const aShare = /^(\d{6})\.(SH|SZ|BJ)$/.exec(symbol);
  const code = variable ?? (aShare ? `${aShare[2].toLowerCase()}${aShare[1]}` : `gb_${symbol.toLowerCase()}`);
  const fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(`var hq_str_${code}="${parts.join(',')}";`).buffer }));
  const quote = await extract('fetchSinaOnDemandStockQuote', { ...quoteBindings, fetch, REQUEST_TIMEOUT_MS: 5000 })(symbol);
  expect(fetch).toHaveBeenCalledOnce();
  return quote;
}

// Run ONLY the AST-extracted parent function with allowlisted in-memory SQL; no portfolio import/DB.
async function refreshWith(quote: any, symbol: string, processor = vi.fn(async (_input: any) => [] as any[])) {
  const execute = vi.fn(async (sql: string) => {
    if (sql.startsWith('SELECT id FROM ledger_categories')) return [[{ id: 90250 }]];
    if (/^INSERT INTO ledger_stock_(quote_history|intraday_quotes)\s/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Forbidden unexpected SQL: ${sql}`);
  });
  const getDbConnection = vi.fn(async () => ({ execute }));
  const fetchIntradayStockQuotes = vi.fn(async () => ({ [symbol]: quote }));
  const invalidateMemberStockReadCaches = vi.fn();
  const refresh = extract('refreshLedgerStockTagIntradaySnapshots', { intradayRefreshInProgress: false,
    ensureLedgerStockPortfolioTables: vi.fn(async () => {}), getDbConnection, STOCK_LEDGER_ID: 37,
    getActiveLots: vi.fn(async () => [{ symbol, remainingQuantity: 1 }]), EPSILON: 1e-8,
    isCryptoPortfolioSymbol: () => false, fetchIntradayStockQuotes,
    beijingDate: () => '2026-11-25', stockCurrency: () => quote.currency,
    processStockLotDownsideAutoQuote: processor, invalidateMemberStockReadCaches,
    console: { log: vi.fn(), warn: vi.fn() },
  }, portfolio);
  expect(await refresh()).toEqual({ categories: 1, symbols: 1, updated: 1 });
  expect(execute).toHaveBeenCalledTimes(3); expect(fetchIntradayStockQuotes).toHaveBeenCalledOnce();
  return { processor, execute, invalidateMemberStockReadCaches };
}

describe('Yahoo actual provider time, not receipt time', () => {
  it.each([now / 1000 - 1, now / 1000 - 120])('fresh explicit Yahoo time %s is retained exactly (120s inclusive)', async regularMarketTime => {
    const quote = await yahoo(regularMarketTime);
    expect(quote).toMatchObject({ price: 80, currency: 'USD', source: 'Yahoo Finance', autoTriggerEligible: true,
      priceDate: '2026-11-25', updatedAt: new Date(now).toISOString(),
      autoTriggerObservedAt: new Date(regularMarketTime * 1000).toISOString(), autoTriggerPriceDate: '2026-11-25' });
  });
  it.each([undefined, null, '123', NaN, Infinity, 0, -1, now / 1000 + 1, now / 1000 - 121, now / 1000 - 86400])('invalid/stale Yahoo time %s still displays without triggering', async regularMarketTime => {
    const quote = await yahoo(regularMarketTime);
    expect(quote).toMatchObject({ price: 80, currency: 'USD', autoTriggerEligible: false,
      priceDate: '2026-11-25', updatedAt: new Date(now).toISOString() });
    const h = await refreshWith(quote, 'AAPL'); expect(h.processor).not.toHaveBeenCalled();
  });
  it('09:29:59 provider time, 09:30:05 armed, 09:30:10 receipt cannot trigger', async () => {
    vi.setSystemTime(new Date('2026-11-25T14:30:10Z'));
    const quote = await yahoo(Date.parse('2026-11-25T14:29:59Z') / 1000);
    expect(quote).toMatchObject({ updatedAt: '2026-11-25T14:30:10.000Z', autoTriggerObservedAt: '2026-11-25T14:29:59.000Z', autoTriggerEligible: false });
    expect(quoteValid(asAutoQuote(quote), new Date())).toBe(false);
    expect(canTrigger(armedRule('AAPL', '2026-11-25T14:30:05.000Z'), asAutoQuote(quote))).toBe(false);
    const h = await refreshWith(quote, 'AAPL'); expect(h.processor).not.toHaveBeenCalled();
  });
  it('09:30:04 valid regular quote still fails 09:30:05 armed despite 09:30:10 receipt', async () => {
    vi.setSystemTime(new Date('2026-11-25T14:30:10Z'));
    const quote = await yahoo(Date.parse('2026-11-25T14:30:04Z') / 1000);
    const rule = armedRule('AAPL', '2026-11-25T14:30:05.000Z');
    const getDbConnection = vi.fn(async () => ({})), getDbTransactionConnection = vi.fn(() => { throw new Error('Forbidden transaction for pre-armed quote'); });
    const processor = extract('processStockLotDownsideAutoQuote', { readOnlyEnvironment: () => false,
      isStockLotDownsideAutoQuoteValid: quoteValid, canTrigger, getDbConnection, getDbTransactionConnection,
      readStockLotDownsideRules: vi.fn(async () => [rule]),
    }, trigger);
    const called = vi.fn((input: any) => processor(input, new Date()));
    expect(quote.autoTriggerEligible).toBe(true);
    const h = await refreshWith(quote, 'AAPL', called);
    expect(h.processor).toHaveBeenCalledWith(asAutoQuote(quote));
    expect(await called.mock.results[0].value).toEqual([]);
    expect(getDbConnection).toHaveBeenCalledOnce(); expect(getDbTransactionConnection).not.toHaveBeenCalled();
  });
  it('valid Yahoo UTC instant is passed unchanged by the real extracted parent hook', async () => {
    const quote = await yahoo(now / 1000 - 1);
    const h = await refreshWith(quote, 'AAPL');
    expect(h.processor).toHaveBeenCalledWith(asAutoQuote(quote));
    expect(h.processor.mock.calls[0][0].observedAt).toBe('2026-11-25T15:29:59.000Z');
    expect(quoteValid(h.processor.mock.calls[0][0], new Date())).toBe(true);
  });
  it('NY presentation date fallback is unchanged when receipt crosses a UTC/Beijing date boundary', async () => {
    vi.setSystemTime(new Date('2026-11-26T00:00:10Z'));
    expect(await yahoo(undefined)).toMatchObject({ priceDate: '2026-11-25', updatedAt: '2026-11-26T00:00:10.000Z', autoTriggerEligible: false });
  });
  it.each([
    ['2026-11-25T14:29:59Z', false], ['2026-11-25T14:30:00Z', true],
    ['2026-11-25T21:00:00Z', false], ['2026-11-26T15:00:00Z', false],
    ['2026-07-03T15:00:00Z', false], ['2026-07-02T13:30:00Z', true],
  ])('fresh Yahoo provider time %s uses actual NY regular session/day', async (at, eligible) => {
    vi.setSystemTime(new Date(at));
    const quote = await yahoo(Date.parse(at) / 1000);
    expect(quote.autoTriggerEligible).toBe(eligible);
    expect(quoteValid(asAutoQuote(quote), new Date())).toBe(eligible);
  });
});

describe('Sina Beijing A-share timestamp evidence', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-11-25T06:00:00Z')));
  it('09:31 old price returned at 14:00 is not eligible; display keeps receipt date/time', async () => {
    const quote = await sina(aParts({ 31: '09:31:00' }));
    expect(quote).toMatchObject({ price: 70, source: '新浪财经', priceDate: '2026-11-25', updatedAt: '2026-11-25T06:00:00.000Z',
      autoTriggerObservedAt: '2026-11-25T01:31:00.000Z', autoTriggerEligible: false });
    const h = await refreshWith(quote, '600000.SH'); expect(h.processor).not.toHaveBeenCalled();
  });
  it.each(['600000.SH', '000001.SZ', '430001.BJ'])('%s valid explicit date+time uses +08:00 and passes exact evidence', async symbol => {
    const quote = await sina(aParts(), symbol);
    expect(quote).toMatchObject({ autoTriggerObservedAt: '2026-11-25T05:59:59.000Z', autoTriggerPriceDate: '2026-11-25', autoTriggerEligible: true });
    const h = await refreshWith(quote, symbol);
    expect(h.processor).toHaveBeenCalledWith(asAutoQuote(quote, symbol));
    expect(quoteValid(h.processor.mock.calls[0][0], new Date())).toBe(true);
  });
  it('previous close preserves 52 valuation without evidence, even with fresh vendor date/time', async () => {
    const quote = await sina(aParts({ 3: '0' }));
    expect(quote).toMatchObject({ price: 80, source: '新浪财经·昨收参考', priceDate: '2026-11-25', updatedAt: '2026-11-25T06:00:00.000Z', autoTriggerEligible: false });
    expect(quote.autoTriggerObservedAt).toBeUndefined();
  });
  it.each([
    { 30: '' }, { 31: '' }, { 31: '13:59' }, { 31: '25:00:00' }, { 31: '14:00:01' },
    { 31: '13:57:59' }, { 30: '2026-11-24' }, { 30: '2026-02-30' },
  ])('missing/bad/stale/future evidence %j cannot trigger and still displays', async overrides => {
    const quote = await sina(aParts(overrides));
    expect(quote).toMatchObject({ price: 70, updatedAt: '2026-11-25T06:00:00.000Z', autoTriggerEligible: false });
  });
  it('display date scanning is preserved, but non-provider field positions are not auto evidence', async () => {
    const quote = await sina(['TEST', '100', '80', '70', '2026-11-25', '13:59:59']);
    expect(quote).toMatchObject({ price: 70, priceDate: '2026-11-25', autoTriggerEligible: false });
    expect(quote.autoTriggerObservedAt).toBeUndefined();
  });
  it('wrong provider symbol cannot furnish automatic evidence', async () => {
    expect(await sina(aParts(), '600000.SH', 'sh600001')).toMatchObject({ price: 70, autoTriggerEligible: false });
  });
  it.each([
    ['2026-11-25', '09:29:59'], ['2026-11-25', '11:30:00'], ['2026-11-25', '12:59:59'],
    ['2026-11-25', '15:00:00'], ['2026-11-22', '14:00:00'], ['2026-10-01', '14:00:00'],
  ])('fresh A evidence outside regular session/day %s %s is rejected', async (date, time) => {
    vi.setSystemTime(new Date(`${date}T${time}+08:00`));
    const quote = await sina(aParts({ 30: date, 31: time }));
    expect(quote.autoTriggerEligible).toBe(false);
  });
  it.each(['13:58:00', '14:00:00'])('A freshness allows exactly 120 seconds and exactly now (%s)', async time => {
    expect(await sina(aParts({ 31: time }))).toMatchObject({ autoTriggerEligible: true });
  });
});

describe('Sina US datetime timezone must be explicit or independently corroborated', () => {
  it('Beijing gb datetime is resolved by existing regular EST evidence; display fields stay unchanged', async () => {
    const quote = await sina(usParts(), 'AAPL');
    expect(quote).toMatchObject({ price: 70, currency: 'USD', source: '新浪财经', priceDate: '2026-11-25',
      updatedAt: '2026-11-25T15:30:00.000Z', autoTriggerObservedAt: '2026-11-25T15:29:59.000Z', autoTriggerPriceDate: '2026-11-25', autoTriggerEligible: true });
    const h = await refreshWith(quote, 'AAPL');
    expect(h.processor).toHaveBeenCalledWith(asAutoQuote(quote)); expect(quoteValid(h.processor.mock.calls[0][0], new Date())).toBe(true);
  });
  it.each(['2026-11-25 10:29:59', '2026-11-25T10:29:59EST', '2026-11-25T10:29:59-05:00', '2026-11-25T15:29:59Z'])('US evidence %s resolves to the same UTC second', async datetime => {
    expect(await sina(usParts({ 3: datetime }), 'AAPL')).toMatchObject({ autoTriggerObservedAt: '2026-11-25T15:29:59.000Z', autoTriggerEligible: true });
  });
  it('EDT regular evidence in summer uses NY DST instead of server timezone', async () => {
    vi.setSystemTime(new Date('2026-07-02T14:30:00Z'));
    expect(await sina(usParts({ 3: '2026-07-02 22:29:59', 25: 'Jul 2 10:29AM EDT', 29: '2026' }), 'AAPL'))
      .toMatchObject({ autoTriggerObservedAt: '2026-07-02T14:29:59.000Z', autoTriggerPriceDate: '2026-07-02', autoTriggerEligible: true });
  });
  it.each([
    { 25: '' }, { 25: 'Nov 25 10:29AM' }, { 25: 'Nov 25 10:29AM EDT' },
    { 25: 'Nov 25 10:28AM EST' }, { 29: '' }, { 3: '2026-11-25' },
    { 3: '2026-11-25 23:29' }, { 3: '2026-11-25 23:29:59 UTC' },
    { 3: '2026-11-25 23:29:59', 25: '', 24: 'Nov 25 10:29AM EST' },
  ])('unknown/missing/mismatched timezone or afterhours-only evidence %j fails closed', async overrides => {
    const quote = await sina(usParts(overrides), 'AAPL');
    expect(quote).toMatchObject({ price: 70, updatedAt: new Date(now).toISOString(), autoTriggerEligible: false });
    expect(quote.autoTriggerObservedAt).toBeUndefined();
  });
  it('US display Beijing date is not silently relabeled to NY; auto date is separate', async () => {
    vi.setSystemTime(new Date('2026-11-25T16:30:00Z'));
    const quote = await sina(usParts({ 3: '2026-11-26 00:29:59', 25: 'Nov 25 11:29AM EST' }), 'AAPL');
    expect(quote).toMatchObject({ priceDate: '2026-11-26', autoTriggerPriceDate: '2026-11-25',
      autoTriggerObservedAt: '2026-11-25T16:29:59.000Z', autoTriggerEligible: true, updatedAt: '2026-11-25T16:30:00.000Z' });
    const h = await refreshWith(quote, 'AAPL'); expect(h.processor).toHaveBeenCalledWith(asAutoQuote(quote));
    expect(h.execute.mock.calls[1][0]).toContain('ledger_stock_quote_history');
  });
  it.each([
    ['2026-11-25 23:28:00', 'Nov 25 10:28AM EST', true],
    ['2026-11-25 23:27:59', 'Nov 25 10:27AM EST', false],
    ['2026-11-25 23:30:01', 'Nov 25 10:30AM EST', false],
  ])('corroborated Sina US timestamp %s must also pass the 120s/no-future gate', async (datetime, regular, eligible) => {
    const quote = await sina(usParts({ 3: datetime, 25: regular }), 'AAPL');
    expect(quote.autoTriggerEligible).toBe(eligible);
  });
});

describe('missing proof is never repaired by display fallback or parent hook', () => {
  it.each([
    {}, { autoTriggerEligible: true }, { autoTriggerEligible: true, autoTriggerObservedAt: '2026-11-25T15:29:59Z' },
    { autoTriggerEligible: true, autoTriggerPriceDate: '2026-11-25' },
  ])('legacy/missing automatic fields %j cannot invoke processor', async metadata => {
    const h = await refreshWith({ price: 80, currency: 'USD', source: 'Yahoo Finance', updatedAt: new Date(now).toISOString(), priceDate: '2026-11-25', ...metadata }, 'AAPL');
    expect(h.processor).not.toHaveBeenCalled();
  });
  it('missing/expired/invalid provider timestamp is rejected by real pure processor guard', () => {
    const quote = { ledgerId: 37, categoryId: 90250, symbol: 'AAPL', price: 80, currency: 'USD', priceDate: '2026-11-25', source: 'Yahoo Finance' };
    for (const observedAt of [undefined, '', '2026-11-25 10:29:59', '2026-11-25T15:27:59Z', '2026-11-25T15:30:01Z']) {
      expect(quoteValid({ ...quote, observedAt }, new Date(now))).toBe(false);
    }
  });
  it('automatic stock/crypto hooks remain background-only and stock never passes display updatedAt', () => {
    const crypto = tree('./crypto-portfolio-settlement.ts');
    for (const [ast, expected] of [[portfolio, 'refreshLedgerStockTagIntradaySnapshots'], [crypto, 'refreshCryptoPortfolioIntradaySnapshots']] as const) {
      const callers = ast.statements.filter(node => ts.isFunctionDeclaration(node)
        && node.getText(ast).includes('await processStockLotDownsideAutoQuote(')).map(node => (node as ts.FunctionDeclaration).name?.text);
      expect(callers).toEqual([expected]);
    }
    const refresh = portfolio.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'refreshLedgerStockTagIntradaySnapshots')!.getText(portfolio);
    expect(refresh).toContain('observedAt: quote.autoTriggerObservedAt');
    expect(refresh).not.toContain('observedAt: quote.updatedAt');
  });
  it('52 intraday Yahoo fallback still displays missing-time quotes with unchanged request budget', async () => {
    const quote = await yahoo(undefined);
    const fetchSinaOnDemandStockQuote = vi.fn(async () => null), fetchYahooIntradayStockQuote = vi.fn(async () => quote);
    const fetchQuotes = extract('fetchIntradayStockQuotes', {
      normalizeOnDemandStockSymbol: extract('normalizeOnDemandStockSymbol', {}), fetchSinaOnDemandStockQuote, fetchYahooIntradayStockQuote,
    });
    expect(await fetchQuotes(['AAPL', 'aapl'])).toEqual({ AAPL: quote });
    expect(fetchSinaOnDemandStockQuote).toHaveBeenCalledOnce(); expect(fetchYahooIntradayStockQuote).toHaveBeenCalledOnce();
    expect(quote).toMatchObject({ price: 80, priceDate: '2026-11-25', updatedAt: new Date(now).toISOString(), autoTriggerEligible: false });
  });
  it('52 manual A suggestion retains legacy last-reference price/date/retrieval time', async () => {
    vi.setSystemTime(new Date('2026-11-25T06:00:00Z'));
    const quote = await sina(aParts({ 3: '0' }));
    const fetchSinaOnDemandStockQuote = vi.fn(async () => quote);
    const hydrate = extract('hydrateManualAshareStockSuggestions', { fetchSinaOnDemandStockQuote });
    const suggestion = { symbol: '600000.SH', code: '600000', name: 'TEST', market: 'A', currency: 'CNY' };
    expect(await hydrate([suggestion])).toEqual([{ ...suggestion, latestPrice: 80,
      latestPriceDate: '2026-11-25', latestPriceUpdatedAt: '2026-11-25T06:00:00.000Z' }]);
    expect(fetchSinaOnDemandStockQuote).toHaveBeenCalledOnce();
  });
});
