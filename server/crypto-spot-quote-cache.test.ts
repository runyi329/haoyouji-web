import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Any accidental dependency on these modules must fail without touching DB/services.
vi.mock('./db', () => { throw new Error('provider must not import DB'); });
vi.mock('./price-scanner', () => { throw new Error('provider must not import scanner'); });
vi.mock('./crypto-portfolio-quotes', () => { throw new Error('provider must not import legacy quotes'); });

const NOW = Date.parse('2026-11-27T12:00:00Z');
const gatePair = (base: string, patch: Record<string, unknown> = {}) => ({ id: `${base}_USDT`, base,
  base_name: base === 'BTC' ? 'Bitcoin' : base, quote: 'USDT', type: 'normal', trade_status: 'tradable', ...patch });
const htxPair = (base: string, patch: Record<string, unknown> = {}) => ({ 'base-currency': base.toLowerCase(),
  'quote-currency': 'usdt', symbol: `${base.toLowerCase()}usdt`, state: 'online',
  'api-trading': 'enabled', 'leverage-ratio': 5, ...patch });
const htxTick = (base: string, patch: Record<string, unknown> = {}) => ({ status: 'ok',
  ch: `market.${base.toLowerCase()}usdt.detail.merged`, ts: Date.now(), tick: { close: 77 }, ...patch });
const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => data });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let api: typeof import('./crypto-spot-quote-cache');
let network: ReturnType<typeof vi.fn>;
let gateCatalog: unknown[];
let htxCatalog: unknown[];
let gateDirectoryError: boolean;
let htxDirectoryError: boolean;
let handler: (url: URL, signal?: AbortSignal) => unknown | Promise<unknown>;
const priceCalls = () => network.mock.calls.filter(([url]) => /\/tickers\?|\/market\/detail\/merged\?/.test(String(url)));
const gateCalls = () => priceCalls().filter(([url]) => String(url).includes('api.gateio.ws'));
const htxCalls = () => priceCalls().filter(([url]) => String(url).includes('api.huobi.pro'));
const directoryCalls = () => network.mock.calls.filter(([url]) => /\/currency_pairs$|\/v1\/common\/symbols$/.test(String(url)));

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  gateCatalog = ['BTC', 'ETH', 'B2'].map(base => gatePair(base));
  htxCatalog = [];
  gateDirectoryError = false;
  htxDirectoryError = false;
  handler = () => { throw new Error('price offline'); };
  network = vi.fn(async (input: string, options?: { signal?: AbortSignal }) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/currency_pairs')) {
      if (gateDirectoryError) throw new Error('Gate directory offline');
      return response(gateCatalog);
    }
    if (url.pathname === '/v1/common/symbols') {
      if (htxDirectoryError) throw new Error('HTX directory offline');
      return response({ status: 'ok', data: htxCatalog });
    }
    return response(await handler(url, options?.signal));
  });
  vi.stubGlobal('fetch', network);
  api = await import('./crypto-spot-quote-cache');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function goodGate(url: URL, price: unknown = '123') {
  return [{ currency_pair: url.searchParams.get('currency_pair'), last: price, mark_price: 99999 }];
}

describe('demand-only crypto boundary and fresh directory evidence', () => {
  it('import, peek and diagnostics do not start I/O, DB, scanner or timers', () => {
    expect(network).not.toHaveBeenCalled();
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    expect(api.peekUnifiedCryptoSpotInstrument('BTC')).toBeNull();
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC')).toMatchObject({ stale: true, directoryVerified: false, lastSuccessAt: null });
    expect(api.getUnifiedCryptoSpotQuoteCacheStatus().activeRequests).toBe(0);
    expect(network).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('empty/invalid/pair/security symbol/USDT/BTY input never causes network activity', async () => {
    expect(await api.getUnifiedCryptoSpotQuotes([])).toEqual({});
    expect(await api.getUnifiedCryptoSpotQuotes(['', 'USDT', 'bty', 'CRYPTO:ETH-USDT', 'US:ETH',
      'BTC-USDT', 'ETH/USDT', 'ETH_PERP!', 'x'.repeat(100)])).toEqual({});
    expect(network).not.toHaveBeenCalled();
  });

  it('bare ETH at this explicitly crypto-only API is ETH spot, not a US security', async () => {
    handler = url => goodGate(url, 321);
    const quotes = await api.getUnifiedCryptoSpotQuotes([' eth ', 'ETH']);
    expect(quotes).toEqual({ ETH: { code: 'ETH', price: 321, currency: 'USDT', source: 'Gate.io', updatedAt: new Date(NOW).toISOString() } });
    expect(gateCalls()).toHaveLength(1);
    expect(String(gateCalls()[0][0])).toContain('currency_pair=ETH_USDT');
  });

  it('directory enumeration supports generic verified identity without requesting any prices', async () => {
    gateCatalog = [gatePair('BTC'), gatePair('NOVEL', { base_name: 'New protocol' }), gatePair('BTY')];
    htxCatalog = [htxPair('BTC'), htxPair('HTXONLY'), htxPair('BTY')];
    const directory = await api.getUnifiedCryptoSpotDirectory();
    expect(directory).toHaveLength(3);
    expect(directory.find(row => row.code === 'BTC')).toMatchObject({ code: 'BTC', name: 'Bitcoin',
      gatePair: 'BTC_USDT', htxPair: 'btcusdt', gateDelistingAt: null, sources: ['Gate.io', 'HTX'] });
    expect(directory.find(row => row.code === 'NOVEL')?.name).toBe('New protocol');
    expect(directory.find(row => row.code === 'HTXONLY')).toMatchObject({ htxPair: 'htxonlyusdt', sources: ['HTX'] });
    directory[0].sources.length = 0;
    expect(api.peekUnifiedCryptoSpotInstrument('BTC')?.sources).toEqual(['Gate.io', 'HTX']);
    expect(network).toHaveBeenCalledTimes(2);
    expect(priceCalls()).toHaveLength(0);
  });

  it('only explicitly requested currency_pair is fetched, never the full tickers list or unused coins', async () => {
    gateCatalog = Array.from({ length: 2200 }, (_, i) => gatePair(`COIN${i}`));
    handler = url => goodGate(url);
    await api.getUnifiedCryptoSpotQuotes(['COIN2']);
    await api.getUnifiedCryptoSpotQuotes([]);
    await api.getUnifiedCryptoSpotDirectory();
    vi.setSystemTime(NOW + 100_000);
    expect(priceCalls()).toHaveLength(1);
    expect(new URL(String(priceCalls()[0][0])).searchParams.get('currency_pair')).toBe('COIN2_USDT');
    expect(vi.getTimerCount()).toBe(0);
    expect(api.getUnifiedCryptoSpotQuoteCacheStatus().activeRequests).toBe(0);
  });

  it('static/unknown code is insufficient if neither directory proves it', async () => {
    handler = url => goodGate(url);
    expect(await api.getUnifiedCryptoSpotQuotes(['AAPL', 'NOTLISTED'])).toEqual({});
    expect(priceCalls()).toHaveLength(0);
    expect(api.getUnifiedCryptoSpotQuoteHealth('AAPL')).toMatchObject({ stale: true, directoryVerified: false });
  });

  it('each directory has independent retry/TTL: Gate failure permits HTX and retry never reloads fresh HTX', async () => {
    gateDirectoryError = true;
    htxCatalog = [htxPair('BTC')];
    handler = () => htxTick('BTC');
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.source).toBe('HTX');
    expect(gateCalls()).toHaveLength(0);
    expect(directoryCalls()).toHaveLength(2);
    expect(api.getUnifiedCryptoSpotQuoteCacheStatus().directory).toMatchObject({ gate: { stale: true }, htx: { stale: false } });
    gateDirectoryError = false;
    await api.getUnifiedCryptoSpotDirectory();
    expect(directoryCalls()).toHaveLength(2);
    vi.setSystemTime(NOW + 15_001);
    await api.getUnifiedCryptoSpotDirectory();
    expect(directoryCalls()).toHaveLength(3);
    expect(api.peekUnifiedCryptoSpotInstrument('BTC')?.sources).toEqual(['Gate.io', 'HTX']);
  });

  it('HTX directory failure never prevents valid Gate quotes', async () => {
    htxDirectoryError = true;
    handler = url => goodGate(url);
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.source).toBe('Gate.io');
    expect(htxCalls()).toHaveLength(0);
  });

  it('directories expire after ten minutes; both failed reloads fail closed even under force', async () => {
    handler = url => goodGate(url);
    const before = (await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC;
    vi.setSystemTime(NOW + 600_000);
    expect(api.peekUnifiedCryptoSpotInstrument('BTC')).toBeNull();
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    gateDirectoryError = true; htxDirectoryError = true;
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'], { force: true })).toEqual({});
    const calls = network.mock.calls.length;
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'], { force: true })).toEqual({});
    expect(network).toHaveBeenCalledTimes(calls);
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC')).toMatchObject({ stale: true, directoryVerified: false, lastSuccessAt: before.updatedAt });
    expect(priceCalls()).toHaveLength(1);
  });

  it('malformed and valid empty directories do not fabricate spot eligibility', async () => {
    network.mockResolvedValue(response({ status: 'error', data: [htxPair('BTC')] }));
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'])).toEqual({});
    expect(await api.getUnifiedCryptoSpotDirectory()).toEqual([]);
    expect(priceCalls()).toHaveLength(0);
  });

  it('source eligibility is not inherited on reload; HTX replaces Gate if only HTX reload succeeds', async () => {
    htxCatalog = [htxPair('BTC')];
    handler = url => url.hostname === 'api.gateio.ws' ? goodGate(url) : htxTick('BTC');
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.source).toBe('Gate.io');
    vi.setSystemTime(NOW + 600_001);
    gateDirectoryError = true;
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.source).toBe('HTX');
    expect(api.peekUnifiedCryptoSpotInstrument('BTC')?.sources).toEqual(['HTX']);
    expect(gateCalls()).toHaveLength(1);
  });
});

describe('ordinary active USDT spot filters', () => {
  it.each([
    { quote: 'USD' }, { id: 'ETH_USDT' }, { type: undefined }, { type: 'leveraged' },
    { type: 'premarket' }, { trade_status: 'untradable' }, { trade_status: 'buyable' },
    { buy_start: NOW / 1000 + 1 }, { sell_start: NOW / 1000 + 1 }, { buy_start: 'bad' },
    { delisting_time: NOW / 1000 }, { delisting_time: 'bad' }, { delisting_time: -1 },
    { base_name: 'Leveraged token' }, { base_name: 'Bitcoin ETF' }, { is_leveraged: true },
  ])('rejects Gate invalid directory row %j before requesting a price', async patch => {
    gateCatalog = [gatePair('BTC', patch)];
    handler = url => goodGate(url);
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'])).toEqual({});
    expect(priceCalls()).toHaveLength(0);
  });

  it.each([
    { state: undefined }, { state: 'suspend' }, { state: 'offline' }, { state: 'pre-online' },
    { 'quote-currency': 'usd' }, { symbol: 'ethusdt' }, { 'base-currency': 'BTC' },
    { 'api-trading': 'disabled' }, { 'api-trading': undefined }, { 'ca-state': 'ca_1' },
    { tags: 'activities,etp,nav' }, { tags: 'etf' }, { underlying: 'ethusdt' },
    { 'mgmt-fee-rate': 0 }, { 'charge-time': 0 }, { 'rebal-time': 0 },
    { 'rebal-threshold': 0 }, { 'init-nav': 0 }, { leveraged: true },
  ])('rejects HTX invalid directory row %j before requesting a price', async patch => {
    gateCatalog = [];
    htxCatalog = [htxPair('BTC', patch)];
    handler = () => htxTick('BTC');
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'])).toEqual({});
    expect(priceCalls()).toHaveLength(0);
  });

  it('excludes malformed/USDT/BTY/leverage suffixes but allows B2 and ordinary margin leverage-ratio', async () => {
    gateCatalog = [null, gatePair('USDT'), gatePair('BTY'), gatePair('BTC3L'), gatePair('ETH5S'), gatePair('SOL3X'), gatePair('B2')];
    htxCatalog = [null, htxPair('BTC'), htxPair('B2'), htxPair('USDT'), htxPair('BTC3L'), htxPair('BAD!')];
    handler = url => url.hostname === 'api.gateio.ws' ? goodGate(url) : htxTick('BTC');
    const quotes = await api.getUnifiedCryptoSpotQuotes(['USDT', 'BTY', 'BTC3L', 'ETH5S', 'SOL3X', 'B2', 'BTC', 'BAD!']);
    expect(Object.keys(quotes).sort()).toEqual(['B2', 'BTC']);
    expect(quotes.BTC.source).toBe('HTX');
    expect(priceCalls()).toHaveLength(2);
  });

  it('scheduled Gate delisting revokes cached source instantly and falls back to online HTX', async () => {
    gateCatalog = [gatePair('BTC', { delisting_time: NOW / 1000 + 1 })];
    htxCatalog = [htxPair('BTC')];
    handler = url => url.hostname === 'api.gateio.ws' ? goodGate(url) : htxTick('BTC');
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.source).toBe('Gate.io');
    vi.setSystemTime(NOW + 1000);
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.source).toBe('HTX');
    expect(gateCalls()).toHaveLength(1);
    expect(api.peekUnifiedCryptoSpotInstrument('BTC')?.sources).toEqual(['HTX']);
  });
});

describe('Gate first, HTX fallback, genuine timestamps and no fake prices', () => {
  it('Gate wins when both valid, reads last only and uses actual successful receipt time', async () => {
    htxCatalog = [htxPair('BTC')];
    handler = url => { vi.setSystemTime(NOW + 50); return goodGate(url, '101'); };
    const quote = (await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC;
    expect(quote).toMatchObject({ price: 101, source: 'Gate.io', updatedAt: new Date(NOW + 50).toISOString() });
    expect(htxCalls()).toHaveLength(0);
    expect(network.mock.calls.every(([url]) => !/binance|okx|swap|futures|hbdm/i.test(String(url)))).toBe(true);
  });

  it.each(['network', 'http', 'wrong-pair', 'duplicate', 'only-mark'])('HTX fallback after Gate %s failure', async failure => {
    htxCatalog = [htxPair('BTC')];
    handler = url => {
      if (url.hostname !== 'api.gateio.ws') return htxTick('BTC', { ts: NOW - 1000 });
      if (failure === 'network') throw new Error('offline');
      if (failure === 'wrong-pair') return [{ currency_pair: 'ETH_USDT', last: 900 }];
      if (failure === 'duplicate') return [...goodGate(url), ...goodGate(url)];
      return [{ currency_pair: 'BTC_USDT', mark_price: 999 }];
    };
    if (failure === 'http') {
      const previous = network.getMockImplementation()!;
      network.mockImplementation((input: string, options?: { signal?: AbortSignal }) => String(input).includes('/tickers?')
        ? Promise.resolve(response(null, false)) : previous(input, options));
    }
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC).toMatchObject({ price: 77, source: 'HTX', updatedAt: new Date(NOW - 1000).toISOString() });
    expect(gateCalls()).toHaveLength(1); expect(htxCalls()).toHaveLength(1);
  });

  it.each([0, -1, '', null, 'NaN', 'Infinity', true, {}, []])('invalid Gate last %j never becomes zero or mark price', async last => {
    handler = url => goodGate(url, last);
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'])).toEqual({});
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC')).toMatchObject({ stale: true, consecutiveFailures: 1, lastSuccessAt: null });
  });

  it.each([
    { ts: NOW - 120_001 }, { ts: NOW + 1 }, { ts: 0 }, { ts: 'bad' },
    { ch: 'market.ethusdt.detail.merged' }, { status: 'error' }, { tick: { close: 0 } },
    { tick: { mark_price: 999 } },
  ])('rejects stale/mismatched/invalid HTX response %j without restamping', async patch => {
    gateCatalog = []; htxCatalog = [htxPair('BTC')];
    handler = () => htxTick('BTC', patch);
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'])).toEqual({});
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC').lastSuccessAt).toBeNull();
  });

  it('HTX cache cannot prolong a validated ts beyond two minutes', async () => {
    gateCatalog = []; htxCatalog = [htxPair('BTC')];
    handler = () => htxTick('BTC', { ts: NOW - 119_999 });
    const quote = (await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC;
    expect(quote.updatedAt).toBe(new Date(NOW - 119_999).toISOString());
    vi.setSystemTime(NOW + 2);
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC').stale).toBe(true);
  });

  it('expiry/failure keeps only diagnostic last success time, never returns old success or fabricated 0', async () => {
    handler = url => goodGate(url, 9);
    const before = (await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC;
    vi.setSystemTime(NOW + 2499);
    expect(api.peekUnifiedCryptoSpotQuote('BTC')?.price).toBe(9);
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.updatedAt).toBe(before.updatedAt);
    vi.setSystemTime(NOW + 2500);
    expect(api.peekUnifiedCryptoSpotQuote('BTC')?.price).toBe(9);
    expect(api.peekUnifiedCryptoSpotQuote('BTC', { maxAgeMs: 2499 })).toBeNull();
    handler = () => { throw new Error('offline'); };
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'])).toEqual({});
    const calls = network.mock.calls.length;
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'])).toEqual({});
    expect(network).toHaveBeenCalledTimes(calls);
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC')).toMatchObject({ stale: true, source: 'Gate.io',
      lastSuccessAt: before.updatedAt, lastAttemptAt: new Date(NOW + 2500).toISOString(), consecutiveFailures: 1 });
    vi.setSystemTime(NOW + 5000);
    handler = url => goodGate(url, 10);
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.price).toBe(10);
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC')).toMatchObject({ stale: false, consecutiveFailures: 0, lastError: null });
  });

  it('a failed forced refresh revokes even unexpired cached quote and preserves diagnostic history', async () => {
    handler = url => goodGate(url);
    const before = (await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC;
    handler = () => { throw new Error('offline'); };
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'], { force: true })).toEqual({});
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC')).toMatchObject({ stale: true, lastSuccessAt: before.updatedAt });
  });

  it('copied result/peek objects cannot mutate shared successful cache', async () => {
    handler = url => goodGate(url, 9);
    const quotes = await api.getUnifiedCryptoSpotQuotes(['BTC']);
    quotes.BTC.price = 800;
    api.peekUnifiedCryptoSpotQuote('BTC')!.price = 900;
    expect(api.peekUnifiedCryptoSpotQuote('BTC')!.price).toBe(9);
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.price).toBe(9);
    expect(gateCalls()).toHaveLength(1);
  });
});

describe('ticker statistics and independent request/display freshness', () => {
  it('maps real Gate rolling-24h fields without extra candle requests', async () => {
    handler = () => [{ currency_pair: 'BTC_USDT', last: '110', change_percentage: '10', high_24h: '120',
      low_24h: '90', base_volume: '5', quote_volume: '550' }];
    const quote = (await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC;
    expect(quote.patch).toEqual({ todayOpen: 110 / 1.1, changePercent: 10, high24h: 120, low24h: 90, volume24h: 5, quoteVolume24h: 550 });
    expect(priceCalls()).toHaveLength(1);
    expect(network.mock.calls.some(([url]) => /candlestick|kline/.test(String(url)))).toBe(false);
    quote.patch!.high24h = 999;
    api.peekUnifiedCryptoSpotQuote('BTC')!.patch!.high24h = 888;
    expect(api.peekUnifiedCryptoSpotQuote('BTC')!.patch!.high24h).toBe(120);
  });

  it('maps HTX close/open/high/low/amount/vol directly and keeps response ts', async () => {
    gateCatalog = []; htxCatalog = [htxPair('BTC')];
    handler = () => htxTick('BTC', { ts: NOW - 2000,
      tick: { close: 110, open: 100, high: 120, low: 90, amount: 5, vol: 550 } });
    const quote = (await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC;
    expect(quote.patch).toMatchObject({ todayOpen: 100, high24h: 120, low24h: 90, volume24h: 5, quoteVolume24h: 550 });
    expect(quote.patch?.changePercent).toBeCloseTo(10);
    expect(quote.updatedAt).toBe(new Date(NOW - 2000).toISOString());
    expect(priceCalls()).toHaveLength(1);
  });

  it('omits absent/invalid statistics, retaining valid zero volume without fake values', async () => {
    handler = () => [{ currency_pair: 'BTC_USDT', last: 1, change_percentage: -100, high_24h: 'bad',
      low_24h: -1, base_volume: 0, quote_volume: '0' }];
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.patch).toEqual({ volume24h: 0, quoteVolume24h: 0 });
  });

  it('default peek lasts 120 seconds but get refreshes at 2.5 seconds without resetting cached timestamps', async () => {
    handler = url => goodGate(url);
    const before = (await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC;
    vi.setSystemTime(NOW + 2500);
    expect(api.peekUnifiedCryptoSpotQuote('BTC')?.updatedAt).toBe(before.updatedAt);
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC').stale).toBe(false);
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC.updatedAt).toBe(new Date(NOW + 2500).toISOString());
    expect(gateCalls()).toHaveLength(2);
    vi.setSystemTime(NOW + 122_500);
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).not.toBeNull();
    vi.setSystemTime(NOW + 122_501);
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    expect(api.peekUnifiedCryptoSpotQuote('BTC', { maxAgeMs: 999999 })).toBeNull();
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC').stale).toBe(true);
    expect(priceCalls()).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('invalid maxAge never yields a stale quote', async () => {
    handler = url => goodGate(url);
    await api.getUnifiedCryptoSpotQuotes(['BTC']);
    for (const maxAgeMs of [-1, NaN, Infinity]) expect(api.peekUnifiedCryptoSpotQuote('BTC', { maxAgeMs })).toBeNull();
    expect(api.peekUnifiedCryptoSpotQuote('BTC', { maxAgeMs: 0 })).not.toBeNull();
  });

  it('force bypasses a quote miss cooldown but does not refresh unexpired directories', async () => {
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'])).toEqual({});
    expect(gateCalls()).toHaveLength(1);
    handler = url => goodGate(url);
    expect(await api.getUnifiedCryptoSpotQuotes(['BTC'])).toEqual({});
    expect((await api.getUnifiedCryptoSpotQuotes(['BTC'], { force: true })).BTC.price).toBe(123);
    expect(gateCalls()).toHaveLength(2);
    expect(directoryCalls()).toHaveLength(2);
  });
});

describe('single-flight, timeout and globally bounded resources', () => {
  it('concurrent normal/forced calls share one directory pair and one quote request per coin', async () => {
    handler = async url => { await Promise.resolve(); await Promise.resolve(); return goodGate(url); };
    const calls = await Promise.all(Array.from({ length: 20 }, (_, i) => api.getUnifiedCryptoSpotQuotes(['BTC', 'ETH'], { force: i % 2 === 0 })));
    expect(calls.every(result => result.BTC.price === 123 && result.ETH.price === 123)).toBe(true);
    expect(directoryCalls()).toHaveLength(2);
    expect(gateCalls()).toHaveLength(2);
    expect(api.getUnifiedCryptoSpotQuoteCacheStatus()).toMatchObject({ activeRequests: 0, pendingRequests: 0, quoteFlights: 0 });
  });

  it('force bypasses success cache but not an existing flight; normal calls join force flight', async () => {
    handler = url => goodGate(url, 1);
    await api.getUnifiedCryptoSpotQuotes(['BTC']);
    const waiting = deferred<unknown>();
    handler = () => waiting.promise;
    const forced = api.getUnifiedCryptoSpotQuotes(['BTC'], { force: true });
    await vi.waitFor(() => expect(gateCalls()).toHaveLength(2));
    const followers = [api.getUnifiedCryptoSpotQuotes(['BTC']), api.getUnifiedCryptoSpotQuotes(['BTC'], { force: true })];
    await Promise.resolve(); await Promise.resolve();
    waiting.resolve([{ currency_pair: 'BTC_USDT', last: 2 }]);
    const results = await Promise.all([forced, ...followers]);
    expect(results.every(result => result.BTC.price === 2)).toBe(true);
    expect(gateCalls()).toHaveLength(2);
  });

  it('bounds each batch, shared flights, queue and global HTTP concurrency including both directory sources', async () => {
    gateCatalog = Array.from({ length: 1000 }, (_, i) => gatePair(`C${i}`));
    let active = 0; let peak = 0;
    const previous = network.getMockImplementation()!;
    network.mockImplementation(async (input: string, options?: { signal?: AbortSignal }) => {
      active += 1; peak = Math.max(peak, active);
      try { await Promise.resolve(); await Promise.resolve(); return await previous(input, options); }
      finally { active -= 1; }
    });
    const waiting = deferred<unknown>();
    handler = async url => { await waiting.promise; return goodGate(url); };
    const first = api.getUnifiedCryptoSpotQuotes(Array.from({ length: 1000 }, (_, i) => `C${i}`), { force: true });
    await vi.waitFor(() => expect(api.getUnifiedCryptoSpotQuoteCacheStatus().quoteFlights).toBe(216));
    const status = api.getUnifiedCryptoSpotQuoteCacheStatus();
    expect(status.activeRequests).toBe(8);
    expect(status.pendingRequests).toBe(208);
    const overflow = api.getUnifiedCryptoSpotQuotes(Array.from({ length: 216 }, (_, i) => `C${i + 216}`), { force: true });
    expect(await overflow).toEqual({});
    expect(api.getUnifiedCryptoSpotQuoteCacheStatus().quoteFlights).toBe(216);
    waiting.resolve(null);
    expect(Object.keys(await first)).toHaveLength(216);
    expect(peak).toBeLessThanOrEqual(8);
    expect(gateCalls()).toHaveLength(216);
    expect(api.getUnifiedCryptoSpotQuoteCacheStatus()).toMatchObject({ activeRequests: 0, pendingRequests: 0, quoteFlights: 0, cachedQuotes: 216 });
  });

  it('success/health maps remain capped after more than 216 sequential unique demands', async () => {
    gateCatalog = Array.from({ length: 300 }, (_, i) => gatePair(`C${i}`));
    handler = url => goodGate(url);
    await api.getUnifiedCryptoSpotQuotes(Array.from({ length: 216 }, (_, i) => `C${i}`));
    await api.getUnifiedCryptoSpotQuotes(Array.from({ length: 84 }, (_, i) => `C${i + 216}`));
    expect(api.getUnifiedCryptoSpotQuoteCacheStatus().cachedQuotes).toBe(216);
    expect(api.peekUnifiedCryptoSpotQuote('C0')).toBeNull();
    expect(api.peekUnifiedCryptoSpotQuote('C299')?.price).toBe(123);
  });

  it('three-second quote timeout falls back to HTX and shares the timeout across force callers', async () => {
    htxCatalog = [htxPair('BTC')];
    const budgets: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      budgets.push(ms);
      const controller = new AbortController();
      if (ms === 3000) setTimeout(() => controller.abort(new Error('timeout')), ms);
      return controller.signal;
    });
    handler = (url, signal) => {
      if (url.hostname === 'api.gateio.ws') return new Promise((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
      return htxTick('BTC');
    };
    const all = Promise.all(Array.from({ length: 10 }, () => api.getUnifiedCryptoSpotQuotes(['BTC'], { force: true })));
    await vi.advanceTimersByTimeAsync(3000);
    expect((await all).every(result => result.BTC?.source === 'HTX')).toBe(true);
    expect(budgets).toEqual([12000, 12000, 3000, 3000]);
    expect(priceCalls()).toHaveLength(2);
    expect(api.getUnifiedCryptoSpotQuoteCacheStatus().activeRequests).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('two timed-out sources return missing quote and retain diagnostic success only', async () => {
    htxCatalog = [htxPair('BTC')];
    handler = url => goodGate(url);
    const before = (await api.getUnifiedCryptoSpotQuotes(['BTC'])).BTC;
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error('timeout')), ms);
      return controller.signal;
    });
    handler = (_url, signal) => new Promise((_, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
    const pending = api.getUnifiedCryptoSpotQuotes(['BTC'], { force: true });
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toEqual({});
    expect(api.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    expect(api.getUnifiedCryptoSpotQuoteHealth('BTC')).toMatchObject({ stale: true, lastSuccessAt: before.updatedAt, consecutiveFailures: 1 });
    expect(api.getUnifiedCryptoSpotQuoteCacheStatus()).toMatchObject({ activeRequests: 0, pendingRequests: 0, quoteFlights: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });
});
