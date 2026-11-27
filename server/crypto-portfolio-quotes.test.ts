import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_WALLET_ASSET_CATALOG, AI_WALLET_CRYPTO_MARKET_ASSETS } from '../shared/ai-wallet-assets';

const scanner = vi.hoisted(() => ({ prices: {} as Record<string, any>, health: {} as Record<string, any>,
  getAllLatestPrices: vi.fn(), getMarketPriceHealth: vi.fn(), getLatestPrice: vi.fn(() => { throw new Error('fixed stablecoin forbidden'); }) }));
vi.mock('./price-scanner', () => ({
  getAllLatestPrices: scanner.getAllLatestPrices,
  getMarketPriceHealth: scanner.getMarketPriceHealth,
  getLatestPrice: scanner.getLatestPrice,
}));
vi.mock('./db', () => ({ getDb: () => { throw new Error('DB forbidden'); }, getDbConnection: () => { throw new Error('DB forbidden'); } }));

const REQUIRED = ['AAVE', 'ADA', 'ARKM', 'ASTER', 'AVAX', 'B2', 'BNB', 'BTC', 'CRV', 'DOGE', 'EIGEN', 'ENA', 'ETH', 'FET', 'HYPE', 'INJ', 'LDO', 'LINK', 'NEAR', 'ONDO', 'PENDLE', 'PENGU', 'PEPE', 'PLUME', 'POL', 'SEI', 'SOL', 'STRK', 'SUI', 'TAO', 'TIA', 'TRUMP', 'UNI', 'WLD', 'WLFI', 'XLM', 'XPL', 'ZRO'];
const NOW = Date.parse('2026-11-15T08:00:00Z');
const OPEN = Date.parse('2026-11-15T15:04:00+08:00') / 1000;
const symbol = (base: string) => `CRYPTO:${base}-USDT`;
const pair = (base: string, patch = {}) => ({ id: `${base}_USDT`, base, base_name: base === 'BTC' ? 'Bitcoin' : base,
  quote: 'USDT', type: 'normal', trade_status: 'tradable', ...patch });
const htxPair = (base: string, patch = {}) => ({ 'base-currency': base.toLowerCase(), 'quote-currency': 'usdt',
  symbol: `${base.toLowerCase()}usdt`, state: 'online', 'api-trading': 'enabled', 'leverage-ratio': 5, ...patch });
const candle = (time = OPEN, price: unknown = '88', closed: unknown = 'true') => [String(time), '100', price, '100', '70', '80', '1', closed];
const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => data });
let api: typeof import('./crypto-portfolio-quotes');
let provider: typeof import('./crypto-spot-quote-cache');
let network: ReturnType<typeof vi.fn>;
let catalog: any[];
let htxCatalog: any[];
let handler: (url: URL) => unknown | Promise<unknown>;

function freshScanner(base: string, price = 100, source = 'Gate.io', time = NOW) {
  const updatedAt = new Date(time).toISOString();
  scanner.prices[base] = { price, updatedAt };
  scanner.health[base] = { source, lastSuccessAt: updatedAt, stale: false, consecutiveFailures: 0 };
}

// Prewarm the real shared cache through valid HTTP fixtures, never inject cache entries.
async function warmProvider(bases: string[], price = 100) {
  const previous = handler;
  handler = url => url.hostname === 'api.gateio.ws'
    ? [{ currency_pair: url.searchParams.get('currency_pair'), last: String(price) }]
    : { status: 'ok', ch: `market.${url.searchParams.get('symbol')}.detail.merged`, ts: Date.now(), tick: { close: price } };
  try {
    const quotes = await provider.getUnifiedCryptoSpotQuotes(bases, { force: true });
    expect(Object.keys(quotes).sort()).toEqual([...new Set(bases)].sort());
    return quotes;
  } finally { handler = previous; }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  scanner.prices = {}; scanner.health = {};
  scanner.getAllLatestPrices.mockClear();
  scanner.getMarketPriceHealth.mockClear();
  scanner.getAllLatestPrices.mockImplementation(() => scanner.prices);
  scanner.getMarketPriceHealth.mockImplementation(() => scanner.health);
  scanner.getLatestPrice.mockClear();
  catalog = REQUIRED.map((base) => pair(base));
  htxCatalog = [];
  handler = () => { throw new Error('source unavailable'); };
  network = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/currency_pairs')) return response(catalog);
    if (url.pathname === '/v1/common/symbols') return response({ status: 'ok', data: htxCatalog });
    return response(await handler(url));
  });
  vi.stubGlobal('fetch', network);
  api = await import('./crypto-portfolio-quotes');
  provider = await import('./crypto-spot-quote-cache');
});
afterEach(() => {
  try {
    expect(scanner.getAllLatestPrices).not.toHaveBeenCalled();
    expect(scanner.getMarketPriceHealth).not.toHaveBeenCalled();
    expect(scanner.getLatestPrice).not.toHaveBeenCalled();
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); }
});

const tickerCalls = () => network.mock.calls.filter(([url]) => String(url).includes('/tickers'));
const priceCalls = () => network.mock.calls.filter(([url]) => /\/tickers\?|\/market\/detail\/merged\?/.test(String(url)));
const directoryCalls = () => network.mock.calls.filter(([url]) => /\/currency_pairs$|\/v1\/common\/symbols$/.test(String(url)));
const metadataName = (base: string) => AI_WALLET_ASSET_CATALOG.find(asset => asset.code === base)!.name;
const unavailableMetadata = (base: string) => expect.objectContaining({ symbol: symbol(base), name: metadataName(base),
  market: 'CRYPTO', currency: 'USDT', available: false, latestPrice: null, source: null, updatedAt: null });

describe('Gate普通USDT现货目录和身份', () => {
  it('无输入下拉按钱包/52号顺序覆盖216币，零目录和报价HTTP请求', async () => {
    const list = await api.searchCryptoPortfolio('*');
    expect(list.results).toHaveLength(216);
    expect(list.results.slice(0, 4).map(row => row.displaySymbol)).toEqual(['BTC', 'ETH', 'SOL', 'BNB']);
    expect(list.results.map(row => row.symbol)).toEqual(AI_WALLET_CRYPTO_MARKET_ASSETS.map(symbol));
    expect(REQUIRED.every(base => list.results.some(row => row.symbol === symbol(base)))).toBe(true);
    expect(list.results.every(row => row.currency === 'USDT' && row.latestPrice === null && row.source === null
      && row.updatedAt === null && row.available === false)).toBe(true);
    expect(network).not.toHaveBeenCalled();
    expect(directoryCalls()).toHaveLength(0); expect(tickerCalls()).toHaveLength(0);
  });
  it('已下架/暂停/杠杆品种仍可搜metadata，但不冒充有效现货或可保存报价', async () => {
    catalog = catalog.filter(row => !['BTC', 'ETH', 'SOL'].includes(row.base));
    catalog.push(pair('BTC', { trade_status: 'untradable' }), pair('ETH', { type: 'leveraged' }));
    freshScanner('BTC'); freshScanner('ETH'); freshScanner('SOL');
    handler = url => url.pathname.endsWith('/candlesticks') ? [candle()]
      : [{ currency_pair: url.searchParams.get('currency_pair'), last: '999' }];
    const list = await api.searchCryptoPortfolio('*');
    expect(list.results.filter(row => ['BTC', 'ETH', 'SOL'].includes(row.displaySymbol!)))
      .toEqual(['BTC', 'ETH', 'SOL'].map(unavailableMetadata));
    expect(network).not.toHaveBeenCalled();
    for (const base of ['BTC', 'ETH', 'SOL']) {
      expect((await api.searchCryptoPortfolio(base)).results[0]).toEqual(unavailableMetadata(base));
      expect(api.getCachedCryptoPortfolioQuote(symbol(base))).toBeNull();
      expect(provider.peekUnifiedCryptoSpotInstrument(base)).toBeNull();
    }
    expect(await api.fetchCryptoPortfolioQuotes(['BTC', 'ETH', 'SOL'].map(symbol))).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes(['BTC', 'ETH', 'SOL'].map(symbol), '2026-11-15')).toEqual({});
    expect(directoryCalls()).toHaveLength(2);
    expect(priceCalls()).toHaveLength(0);
    expect(network).toHaveBeenCalledTimes(2);
    expect(tickerCalls()).toHaveLength(0);
  });
  it('38种全覆盖，真实预热shared Gate/HTX provider后37/search/peek不重复请求', async () => {
    htxCatalog = REQUIRED.map(base => htxPair(base));
    handler = url => {
      const base = url.hostname === 'api.gateio.ws' ? url.searchParams.get('currency_pair')!.slice(0, -5)
        : url.searchParams.get('symbol')!.slice(0, -4).toUpperCase();
      const index = REQUIRED.indexOf(base);
      return url.hostname === 'api.gateio.ws' ? (index % 2 ? [] : [{ currency_pair: `${base}_USDT`, last: String(index + 1) }])
        : { status: 'ok', ch: `market.${base.toLowerCase()}usdt.detail.merged`, ts: NOW, tick: { close: index + 1 } };
    };
    const prewarmed = await provider.getUnifiedCryptoSpotQuotes(REQUIRED);
    expect(Object.keys(prewarmed)).toHaveLength(38);
    const calls = network.mock.calls.length;
    expect(directoryCalls()).toHaveLength(2);
    expect(tickerCalls()).toHaveLength(38);
    expect(priceCalls().filter(([url]) => String(url).includes('huobi'))).toHaveLength(19);
    const quotes = await api.fetchCryptoPortfolioQuotes(REQUIRED.map(symbol));
    expect(Object.keys(quotes)).toHaveLength(38);
    for (const base of REQUIRED) {
      expect(quotes[symbol(base)]).toMatchObject({ symbol: symbol(base), price: prewarmed[base].price,
        source: prewarmed[base].source, currency: 'USDT', updatedAt: prewarmed[base].updatedAt, priceDate: '2026-11-15' });
      expect(api.getCachedCryptoPortfolioQuote(symbol(base))?.price).toBe(prewarmed[base].price);
      const search = await api.searchCryptoPortfolio(base);
      expect(search.results[0].symbol).toBe(symbol(base));
      expect(search.results[0].available).toBe(true);
    }
    expect(await provider.getUnifiedCryptoSpotQuotes(REQUIRED)).toEqual(prewarmed);
    expect(network).toHaveBeenCalledTimes(calls);
    expect(scanner.getLatestPrice).not.toHaveBeenCalled();
  });

  it('有效新目录FIL可搜，不局限旧38币；明确pair身份但裸代码报价不猜数字币', async () => {
    catalog.push(pair('FIL', { base_name: 'Filecoin' }), pair('NEWCOIN', { base_name: 'Novel protocol' }));
    handler = (url) => [{ currency_pair: url.searchParams.get('currency_pair'), last: '0.123' }];
    const byName = await api.searchCryptoPortfolio('Filecoin');
    expect(byName.results).toEqual([expect.objectContaining({ symbol: symbol('FIL'), name: 'Filecoin(IPFS)', market: 'CRYPTO', currency: 'USDT', latestPrice: null, displaySymbol: 'FIL/USDT', available: false })]);
    expect(network).not.toHaveBeenCalled();
    expect(priceCalls()).toHaveLength(0);
    for (const query of ['FIL/USDT', 'FIL_USDT', 'crypto:fil-usdt']) {
      expect((await api.searchCryptoPortfolio(query)).results[0]).toMatchObject({ symbol: symbol('FIL'), latestPrice: 0.123, source: 'Gate.io', available: true });
    }
    expect(tickerCalls()).toHaveLength(1);
    expect(provider.peekUnifiedCryptoSpotInstrument('FIL')).toMatchObject({ gatePair: 'FIL_USDT', sources: ['Gate.io'] });
    expect((await api.searchCryptoPortfolio('Novel')).results).toEqual([]);
    expect(await api.fetchCryptoPortfolioQuotes(['ETH', 'USDT', 'ETH_PERP', 'BTC-USDT', 'AAPL', 'CRYPTO:NOTLISTED-USDT'])).toEqual({});
  });

  it('模糊World只读静态metadata+peek，不发HTTP、不续租所有命中；已有shared价可展示', async () => {
    catalog = [pair('WLD'), pair('WLFI')];
    const demand = await import('./crypto-quote-demand');
    const beforeLeaseCount = demand.getCryptoQuoteDemandDiagnostics().leaseCount;
    const cold = await api.searchCryptoPortfolio('World');
    expect(cold.results.map(row => row.symbol)).toEqual([symbol('WLD'), symbol('WLFI')]);
    expect(cold.results.every(row => row.latestPrice === null && row.available === false)).toBe(true);
    expect(network).not.toHaveBeenCalled();
    expect(priceCalls()).toHaveLength(0);
    await warmProvider(['WLD'], 7);
    const calls = network.mock.calls.length;
    expect((await api.searchCryptoPortfolio('World')).results).toEqual([
      expect.objectContaining({ symbol: symbol('WLD'), latestPrice: 7, available: true }),
      unavailableMetadata('WLFI'),
    ]);
    expect(network).toHaveBeenCalledTimes(calls);
    expect(demand.getCryptoQuoteDemandDiagnostics().leaseCount).toBe(beforeLeaseCount);
  });

  it('exact FIL只拉该币一笔ticker，上游同名FET不污染静态metadata或激活；pair重复检索共用缓存', async () => {
    catalog = [pair('FIL', { base_name: 'Filecoin' }), pair('FET', { base_name: 'Filecoin ecosystem' })];
    handler = url => [{ currency_pair: url.searchParams.get('currency_pair'), last: '8' }];
    const demand = await import('./crypto-quote-demand');
    expect((await api.searchCryptoPortfolio('FIL')).results).toEqual([
      expect.objectContaining({ symbol: symbol('FIL'), latestPrice: 8, available: true }),
    ]);
    expect(priceCalls()).toHaveLength(1);
    expect(new URL(String(tickerCalls()[0][0])).searchParams.get('currency_pair')).toBe('FIL_USDT');
    expect(demand.getCryptoQuoteDemandDiagnostics().leaseCount).toBe(1);
    expect(provider.peekUnifiedCryptoSpotQuote('FET')).toBeNull();
    await api.searchCryptoPortfolio('CRYPTO:FIL-USDT');
    expect(priceCalls()).toHaveLength(1);
  });

  it('统一216静态目录按目录顺序下拉，含BTY metadata但不声称Gate/HTX报价资格', async () => {
    expect(AI_WALLET_CRYPTO_MARKET_ASSETS).toHaveLength(216);
    catalog = [...AI_WALLET_CRYPTO_MARKET_ASSETS.map(base => pair(base)), pair('NEWCOIN')];
    const list = await api.searchCryptoPortfolio('*');
    expect(list.results.map(row => row.symbol)).toEqual(AI_WALLET_CRYPTO_MARKET_ASSETS.map(symbol));
    expect(list.results.every(row => row.latestPrice === null && row.available === false)).toBe(true);
    expect(list.results.find(row => row.symbol === symbol('BTY'))).toEqual(unavailableMetadata('BTY'));
    expect(network).not.toHaveBeenCalled();
    htxCatalog = [htxPair('BTY')];
    freshScanner('BTY', 999, 'Gate.io');
    handler = url => url.pathname.endsWith('/candlesticks') ? [candle()]
      : [{ currency_pair: url.searchParams.get('currency_pair'), last: '999' }];
    expect((await api.searchCryptoPortfolio('BTY')).results).toEqual([unavailableMetadata('BTY')]);
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTY')])).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTY')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTY'))).toBeNull();
    expect(provider.peekUnifiedCryptoSpotInstrument('BTY')).toBeNull();
    expect(provider.peekUnifiedCryptoSpotQuote('BTY')).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
    expect(priceCalls()).toHaveLength(0);
  });

  it('钱包中文名称始终可检索metadata，目录过期时不沿用旧价或发HTTP复活', async () => {
    await warmProvider(['BTC', 'ETH', 'DOGE']);
    const calls = network.mock.calls.length;
    for (const [name, base] of [['比特币', 'BTC'], ['以太坊', 'ETH'], ['狗狗币', 'DOGE']]) {
      expect((await api.searchCryptoPortfolio(name)).results[0]).toMatchObject({ symbol: symbol(base), currency: 'USDT', latestPrice: 100 });
    }
    expect((await api.searchCryptoPortfolio('人民币')).results).toEqual([]);
    expect((await api.searchCryptoPortfolio('泰达币')).results).toEqual([]);
    expect(network).toHaveBeenCalledTimes(calls);
    vi.setSystemTime(NOW + 600_001);
    catalog = [];
    expect((await api.searchCryptoPortfolio('比特币')).results).toEqual([unavailableMetadata('BTC')]);
    expect(network).toHaveBeenCalledTimes(calls);
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
  });

  it('排除USDT本身、非normal、非活动、杠杆、错pair和未来上市；B2不误拦', async () => {
    catalog = [pair('B2'), pair('USDT'), pair('BTC3L'), pair('ETH5S'), pair('SOL3X'),
      pair('LONGTOKEN', { base_name: 'Leveraged long token' }), pair('NAV', { base_name: 'Some ETF' }),
      pair('PRE', { type: 'premarket' }), pair('HALT', { trade_status: 'buyable' }),
      pair('WRONG', { id: 'BTC_USDT' }), pair('BTC', { quote: 'USD' }),
      pair('FUTURE', { buy_start: NOW / 1000 + 1 }), pair('DELIST', { delisting_time: NOW / 1000 - 1 }),
      pair('FLAG', { is_leveraged: true }), pair('UNKNOWN', { type: undefined })];
    const quotes = await api.fetchCryptoPortfolioQuotes(catalog.map((row) => symbol(row.base)));
    expect(quotes).toEqual({}); // B2没有真实行情，也不得编价。
    const b2 = await api.searchCryptoPortfolio('B2');
    expect(b2.results).toEqual([expect.objectContaining({ symbol: symbol('B2'), available: false, latestPrice: null })]);
    expect(tickerCalls()).toHaveLength(1);
    for (const query of ['3L', '5S', 'PRE', 'HALT', 'ETF']) {
      // 静态名称的合法模糊命中（如GRAM的prev.）不是上游PRE身份。
      expect((await api.searchCryptoPortfolio(query)).results.every(row => !['BTC3L', 'ETH5S', 'PRE', 'HALT', 'NAV'].map(symbol).includes(row.symbol))).toBe(true);
    }
    for (const row of catalog.filter(row => row.base !== 'B2')) {
      expect(provider.peekUnifiedCryptoSpotInstrument(row.base)).toBeNull();
      expect(api.getCachedCryptoPortfolioQuote(symbol(row.base))).toBeNull();
    }
    expect(await api.fetchCryptoPortfolioCloseQuotes(catalog.map(row => symbol(row.base)), '2026-11-15')).toEqual({});
    expect((await api.searchCryptoPortfolio('USDT')).results.every((row) => row.symbol !== symbol('USDT'))).toBe(true);
  });

  it('目录缓存single-flight，TTL后重读；失败不复用过期目录或过期行情', async () => {
    handler = (url) => [{ currency_pair: url.searchParams.get('currency_pair'), last: '123' }];
    const concurrent = await Promise.all(Array.from({ length: 12 }, () => api.searchCryptoPortfolio('BTC')));
    expect(concurrent[0].results[0].latestPrice).toBe(123);
    expect(network).toHaveBeenCalledTimes(3);
    vi.setSystemTime(NOW + 10 * 60_000 + 1);
    network.mockImplementation(async () => { throw new Error('offline'); });
    expect((await api.searchCryptoPortfolio('BTC')).results).toEqual([unavailableMetadata('BTC')]);
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(network).toHaveBeenCalledTimes(5); // 两家失败退避不反复打目录。
    vi.setSystemTime(NOW + 10 * 60_000 + 16_000);
    network.mockImplementation(async (input) => {
      const url = new URL(input);
      return response(url.pathname.endsWith('/currency_pairs') ? catalog : [{ currency_pair: 'BTC_USDT', last: '124' }]);
    });
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].price).toBe(124);
  });

  it('空/畸形目录仍返回metadata但无可用报价；无效查询和标的不发请求', async () => {
    expect(await api.searchCryptoPortfolio('')).toEqual({ results: [] });
    expect(await api.searchCryptoPortfolio('x'.repeat(81))).toEqual({ results: [] });
    expect(await api.fetchCryptoPortfolioQuotes(['ETH', 'CRYPTO:USDT-USDT'])).toEqual({});
    expect(network).not.toHaveBeenCalled();
    network.mockResolvedValue(response({ error: 'bad directory' }));
    expect((await api.searchCryptoPortfolio('BTC')).results).toEqual([unavailableMetadata('BTC')]);
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('目录更新下架或预设下架时间到达后不得返回缓存', async () => {
    catalog = [pair('BTC', { delisting_time: NOW / 1000 + 10 })];
    await warmProvider(['BTC']);
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].price).toBe(100);
    vi.setSystemTime(NOW + 10_000);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(tickerCalls()).toHaveLength(1);
  });
});

describe('静态可搜不等于可报价或可保存', () => {
  it('多个静态模糊命中时exact W只拉W，其他候选不激活或续租', async () => {
    catalog.push(pair('W'));
    handler = url => [{ currency_pair: url.searchParams.get('currency_pair'), last: '5' }];
    const demand = await import('./crypto-quote-demand');
    const found = await api.searchCryptoPortfolio('W');
    const metadataMatches = AI_WALLET_CRYPTO_MARKET_ASSETS.filter(base => base.includes('W') || metadataName(base).toUpperCase().includes('W'));
    expect(found.results).toHaveLength(Math.min(20, metadataMatches.length));
    expect(found.results.length).toBeGreaterThan(1);
    expect(found.results[0]).toMatchObject({ symbol: symbol('W'), latestPrice: 5, source: 'Gate.io', available: true });
    expect(found.results.slice(1).every(row => row.available === false && row.latestPrice === null
      && row.source === null && row.updatedAt === null)).toBe(true);
    expect(priceCalls()).toHaveLength(1);
    expect(new URL(String(priceCalls()[0][0])).searchParams.get('currency_pair')).toBe('W_USDT');
    expect(demand.getCryptoQuoteDemandDiagnostics().leaseCount).toBe(1);
    for (const row of found.results.slice(1)) expect(api.getCachedCryptoPortfolioQuote(row.symbol)).toBeNull();
    const calls = network.mock.calls.length;
    expect((await api.searchCryptoPortfolio('CRYPTO:W-USDT')).results[0].latestPrice).toBe(5);
    expect(network).toHaveBeenCalledTimes(calls);
  });

  it.each(['gate-paused', 'gate-leveraged', 'htx-paused', 'htx-api-disabled'])('新币FIL %s无来源资格仍可搜metadata，但实时/历史/peek拒绝且不扫描复活', async reason => {
    catalog = [pair('BTC')];
    if (reason.startsWith('gate')) catalog.push(pair('FIL', reason === 'gate-paused'
      ? { trade_status: 'untradable' } : { type: 'leveraged' }));
    if (reason.startsWith('htx')) htxCatalog = [htxPair('FIL', reason === 'htx-paused'
      ? { state: 'suspend' } : { 'api-trading': 'disabled' })];
    freshScanner('FIL', 999, reason.startsWith('gate') ? 'Gate.io' : 'HTX');
    handler = url => url.hostname === 'api.gateio.ws'
      ? url.pathname.endsWith('/candlesticks') ? [candle(OPEN, '999')]
        : [{ currency_pair: 'FIL_USDT', last: '999' }]
      : url.pathname.endsWith('/kline')
        ? { status: 'ok', ch: 'market.filusdt.kline.1min', ts: Date.now(), data: [{ id: OPEN, close: 999 }] }
        : { status: 'ok', ch: 'market.filusdt.detail.merged', ts: Date.now(), tick: { close: 999 } };
    expect((await api.searchCryptoPortfolio('Filecoin')).results).toEqual([unavailableMetadata('FIL')]);
    expect(network).not.toHaveBeenCalled();
    expect((await api.searchCryptoPortfolio('FIL')).results).toEqual([unavailableMetadata('FIL')]);
    expect(await api.fetchCryptoPortfolioQuotes([symbol('FIL')])).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('FIL')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('FIL'))).toBeNull();
    expect(provider.peekUnifiedCryptoSpotInstrument('FIL')).toBeNull();
    expect(provider.peekUnifiedCryptoSpotQuote('FIL')).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
    expect(priceCalls()).toHaveLength(0);
  });

  it('冷目录4.5秒完成可取得合格报价，目录12000预算与单ticker3000预算独立', async () => {
    const budgets: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      budgets.push(ms);
      return new AbortController().signal;
    });
    network.mockImplementation(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/currency_pairs') || url.pathname === '/v1/common/symbols') {
        await new Promise(resolve => setTimeout(resolve, 4_500));
        return response(url.pathname.endsWith('/currency_pairs') ? catalog : { status: 'ok', data: htxCatalog });
      }
      return response([{ currency_pair: 'BTC_USDT', last: '7' }]);
    });
    const pending = api.searchCryptoPortfolio('BTC');
    await vi.advanceTimersByTimeAsync(3_001);
    expect(priceCalls()).toHaveLength(0);
    expect(provider.getUnifiedCryptoSpotQuoteCacheStatus().directory.gate.inFlight).toBe(true);
    await vi.advanceTimersByTimeAsync(1_499);
    expect((await pending).results[0]).toMatchObject({ symbol: symbol('BTC'), latestPrice: 7, available: true,
      source: 'Gate.io', updatedAt: new Date(NOW + 4_500).toISOString() });
    expect(budgets).toEqual([12_000, 12_000, 3_000]);
    expect(network).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('两家目录12000毫秒超时后仅metadata可搜，实时/历史空且不请求ticker或复用scanner', async () => {
    freshScanner('BTC', 999, 'Gate.io');
    const budgets: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      budgets.push(ms);
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error('directory timeout')), ms);
      return controller.signal;
    });
    network.mockImplementation(async (_input: string, options: { signal: AbortSignal }) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    expect((await api.searchCryptoPortfolio('*')).results).toHaveLength(216);
    expect((await api.searchCryptoPortfolio('比特币')).results).toEqual([unavailableMetadata('BTC')]);
    expect(network).not.toHaveBeenCalled();
    const pending = api.searchCryptoPortfolio('BTC');
    await vi.advanceTimersByTimeAsync(11_999);
    expect(provider.getUnifiedCryptoSpotQuoteCacheStatus().directory.gate.inFlight).toBe(true);
    expect(priceCalls()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).results).toEqual([unavailableMetadata('BTC')]);
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(provider.peekUnifiedCryptoSpotInstrument('BTC')).toBeNull();
    expect(budgets).toEqual([12_000, 12_000]);
    expect(network).toHaveBeenCalledTimes(2);
    expect(priceCalls()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('正数现货与有界按需缓存', () => {
  it.each(['Gate.io', 'HTX', 'OKX', '本地持久化缓存', 'Gate.io ETH/USDT 永续标记价', 'HTX ETH/USDT 永续标记价'])('不复用旧scanner的%s独立缓存', async (source) => {
    freshScanner('ETH', 900, source);
    handler = () => [{ currency_pair: 'ETH_USDT', last: '123', mark_price: '888' }];
    expect((await api.fetchCryptoPortfolioQuotes([symbol('ETH')]))[symbol('ETH')].price).toBe(123);
    expect(tickerCalls()).toHaveLength(1);
    expect(provider.peekUnifiedCryptoSpotQuote('ETH')?.price).toBe(123);
  });

  it.each(['stale', 'old', 'future', 'mismatch', 'zero'])('拒绝scanner的%s证据', async (reason) => {
    freshScanner('BTC', reason === 'zero' ? 0 : 999, 'Gate.io', reason === 'old' ? NOW - 120_001 : reason === 'future' ? NOW + 1 : NOW);
    if (reason === 'stale') scanner.health.BTC.stale = true;
    if (reason === 'mismatch') scanner.health.BTC.lastSuccessAt = '2026-11-15T07:59:00Z';
    handler = () => [{ currency_pair: 'BTC_USDT', last: '12' }];
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].price).toBe(12);
    expect(tickerCalls()).toHaveLength(1);
  });

  it('Gate必须匹配完整pair；HTX必须匹配channel和时间，不取永续标记价', async () => {
    htxCatalog = [htxPair('BTC')];
    handler = (url) => url.hostname === 'api.gateio.ws'
      ? [{ currency_pair: 'ETH_USDT', last: '900', mark_price: '1000' }]
      : { status: 'ok', ch: 'market.btcusdt.detail.merged', ts: Date.now(), tick: { close: 80 } };
    const quotes = await api.fetchCryptoPortfolioQuotes([symbol('BTC')]);
    expect(quotes[symbol('BTC')]).toMatchObject({ price: 80, source: 'HTX' });
    expect(network.mock.calls.every(([url]) => !/okx|futures|hbdm/i.test(String(url)))).toBe(true);
  });

  it.each([0, -1, '', null, 'NaN', 'Infinity', true])('拒绝非正有效last=%s，并标available false', async (last) => {
    htxCatalog = [htxPair('BTC')];
    handler = (url) => url.hostname === 'api.gateio.ws' ? [{ currency_pair: 'BTC_USDT', last, mark_price: 100 }]
      : { status: 'ok', ch: 'market.ethusdt.detail.merged', ts: Date.now(), tick: { close: 100 } };
    expect((await api.searchCryptoPortfolio('BTC')).results[0]).toMatchObject({ latestPrice: null, updatedAt: null, source: null, available: false });
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
  });

  it('HTX过期/未来响应不得以当前采样时刻刷新旧行情', async () => {
    htxCatalog = [htxPair('BTC')];
    handler = (url) => url.hostname === 'api.gateio.ws' ? []
      : { status: 'ok', ch: 'market.btcusdt.detail.merged', ts: NOW - 120_001, tick: { close: 100 } };
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    vi.setSystemTime(NOW + 15_001);
    handler = (url) => url.hostname === 'api.gateio.ws' ? []
      : { status: 'ok', ch: 'market.btcusdt.detail.merged', ts: Date.now() + 1, tick: { close: 100 } };
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
  });

  it('2.5秒请求TTL、120秒peek、single-flight、失败清价/退避与拷贝隔离', async () => {
    handler = () => [{ currency_pair: 'BTC_USDT', last: '9' }];
    const batches = await Promise.all(Array.from({ length: 10 }, () => api.fetchCryptoPortfolioQuotes([symbol('BTC')])));
    expect(tickerCalls()).toHaveLength(1);
    batches[0][symbol('BTC')].price = 555;
    expect(batches[1][symbol('BTC')].price).toBe(9);
    const cached = api.getCachedCryptoPortfolioQuote(symbol('BTC'))!;
    cached.price = 666;
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.price).toBe(9);
    provider.peekUnifiedCryptoSpotQuote('BTC')!.price = 777;
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.price).toBe(9);
    vi.setSystemTime(NOW + 2_499);
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].updatedAt).toBe(new Date(NOW).toISOString());
    expect(tickerCalls()).toHaveLength(1);
    vi.setSystemTime(NOW + 2_500);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.updatedAt).toBe(new Date(NOW).toISOString());
    handler = () => { throw new Error('offline'); };
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(provider.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    const calls = network.mock.calls.length;
    expect(tickerCalls()).toHaveLength(2);
    vi.setSystemTime(NOW + 4_999);
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(network).toHaveBeenCalledTimes(calls);
    vi.setSystemTime(NOW + 5_000);
    handler = () => [{ currency_pair: 'BTC_USDT', last: '10' }];
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')]).toMatchObject({ price: 10, updatedAt: new Date(NOW + 5_000).toISOString() });
    expect(tickerCalls()).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0); // 没有2200币三秒定时扫描。
  });

  it('shared采样时间旧于120秒或未来时peek拒绝，读缓存不刷新时刻或发网', async () => {
    await warmProvider(['BTC'], 9);
    const calls = network.mock.calls.length;
    vi.setSystemTime(NOW - 1);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    vi.setSystemTime(NOW + 120_000);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))?.updatedAt).toBe(new Date(NOW).toISOString());
    vi.setSystemTime(NOW + 120_001);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(provider.peekUnifiedCryptoSpotQuote('BTC')).toBeNull();
    expect(network).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('37保留HTX真实ts和北京采样日期，不把请求当前时间冒充新采样', async () => {
    const midnight = Date.parse('2026-11-15T16:00:00Z');
    vi.setSystemTime(midnight + 1_000);
    catalog = []; htxCatalog = [htxPair('BTC')];
    handler = () => ({ status: 'ok', ch: 'market.btcusdt.detail.merged', ts: midnight - 1_000, tick: { close: 11 } });
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')]).toMatchObject({
      price: 11, source: 'HTX', updatedAt: new Date(midnight - 1_000).toISOString(), priceDate: '2026-11-15',
    });
    vi.setSystemTime(midnight + 119_001);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(priceCalls()).toHaveLength(1);
  });

  it('37+provider并发冷启动与强刷共用目录和每币singleflight，结果copy隔离', async () => {
    catalog = [pair('FIL', { base_name: 'Filecoin' }), pair('BTC')];
    const waiting = deferred<unknown>();
    handler = async url => {
      await waiting.promise;
      return [{ currency_pair: url.searchParams.get('currency_pair'), last: '23' }];
    };
    const portfolio = Array.from({ length: 8 }, () => api.fetchCryptoPortfolioQuotes([symbol('FIL'), symbol('BTC')]));
    const shared = Array.from({ length: 8 }, (_, i) => provider.getUnifiedCryptoSpotQuotes(['FIL', 'BTC'], { force: i % 2 === 0 }));
    const exact = api.searchCryptoPortfolio('FIL');
    await vi.waitFor(() => expect(tickerCalls()).toHaveLength(2));
    expect(directoryCalls()).toHaveLength(2);
    expect(provider.getUnifiedCryptoSpotQuoteCacheStatus()).toMatchObject({ quoteFlights: 2, activeRequests: 2 });
    waiting.resolve(null);
    const [quotes, providerQuotes, search] = await Promise.all([Promise.all(portfolio), Promise.all(shared), exact]);
    expect(quotes.every(result => result[symbol('FIL')].price === 23 && result[symbol('BTC')].price === 23)).toBe(true);
    expect(providerQuotes.every(result => result.FIL.price === 23 && result.BTC.price === 23)).toBe(true);
    expect(search.results[0]).toMatchObject({ symbol: symbol('FIL'), latestPrice: 23, available: true });
    quotes[0][symbol('FIL')].price = 99;
    providerQuotes[0].FIL.price = 88;
    expect(quotes[1][symbol('FIL')].price).toBe(23);
    expect(api.getCachedCryptoPortfolioQuote(symbol('FIL'))?.price).toBe(23);
    expect(provider.peekUnifiedCryptoSpotQuote('FIL')?.price).toBe(23);
    expect(priceCalls()).toHaveLength(2);
    expect(provider.getUnifiedCryptoSpotQuoteCacheStatus()).toMatchObject({ quoteFlights: 0, activeRequests: 0, pendingRequests: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('priceDate按北京采样日期，不依服务器UTC日期', async () => {
    vi.setSystemTime(Date.parse('2026-11-15T17:00:00Z'));
    handler = () => [{ currency_pair: 'BTC_USDT', last: '9' }];
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].priceDate).toBe('2026-11-16');
  });

  it('2200币live目录不污染静态模糊搜索，前20不发HTTP；每次/全局最多216 flights、HTTP最多8并发', async () => {
    catalog = [...AI_WALLET_CRYPTO_MARKET_ASSETS.map(base => pair(base, { base_name: 'Catalog token' })),
      ...Array.from({ length: 2200 }, (_, i) => pair(`COIN${i}`, { base_name: 'Catalog token' }))];
    let active = 0; let peak = 0;
    const previous = network.getMockImplementation()!;
    network.mockImplementation(async (input: string) => {
      active += 1; peak = Math.max(peak, active);
      try { await Promise.resolve(); await Promise.resolve(); return await previous(input); }
      finally { active -= 1; }
    });
    const waiting = deferred<unknown>();
    handler = async url => {
      await waiting.promise;
      return [{ currency_pair: url.searchParams.get('currency_pair'), last: '3' }];
    };
    expect((await api.searchCryptoPortfolio('Catalog')).results).toEqual([]);
    const fuzzy = await api.searchCryptoPortfolio('USDT');
    expect(fuzzy.results).toHaveLength(20);
    expect(fuzzy.results.every(row => AI_WALLET_CRYPTO_MARKET_ASSETS.includes(row.displaySymbol!.split('/')[0] as any))).toBe(true);
    expect(fuzzy.results.every(row => row.available === false && row.latestPrice === null && row.source === null && row.updatedAt === null)).toBe(true);
    expect(network).not.toHaveBeenCalled();
    expect(priceCalls()).toHaveLength(0);
    const first = api.fetchCryptoPortfolioQuotes(Array.from({ length: 2200 }, (_, i) => symbol(`COIN${i}`)));
    await vi.waitFor(() => expect(provider.getUnifiedCryptoSpotQuoteCacheStatus().quoteFlights).toBe(216));
    expect(provider.getUnifiedCryptoSpotQuoteCacheStatus()).toMatchObject({ activeRequests: 8, pendingRequests: 208,
      limits: { maxCodes: 216, maxConcurrentRequests: 8, maxPendingRequests: 216 } });
    const same = provider.getUnifiedCryptoSpotQuotes(Array.from({ length: 216 }, (_, i) => `COIN${i}`), { force: true });
    const overflow = await api.fetchCryptoPortfolioQuotes(Array.from({ length: 216 }, (_, i) => symbol(`COIN${i + 216}`)));
    expect(overflow).toEqual({}); // Shared flight bound cannot be bypassed by another caller.
    waiting.resolve(null);
    expect(Object.keys(await first)).toHaveLength(216);
    expect(Object.keys(await same)).toHaveLength(216);
    expect(peak).toBe(8);
    expect(tickerCalls()).toHaveLength(216);
    expect(provider.getUnifiedCryptoSpotQuoteCacheStatus()).toMatchObject({ quoteFlights: 0, activeRequests: 0, pendingRequests: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('新增币shared缓存最多216项，超容量淘汰最老项', async () => {
    catalog = Array.from({ length: 300 }, (_, i) => pair(`Z${i}`));
    handler = (url) => [{ currency_pair: url.searchParams.get('currency_pair'), last: '4' }];
    for (let i = 0; i < 300; i += 100) await api.fetchCryptoPortfolioQuotes(Array.from({ length: 100 }, (_, j) => symbol(`Z${i + j}`)));
    expect(api.getCachedCryptoPortfolioQuote(symbol('Z0'))).toBeNull();
    expect(api.getCachedCryptoPortfolioQuote(symbol('Z83'))).toBeNull();
    expect(api.getCachedCryptoPortfolioQuote(symbol('Z84'))!.price).toBe(4);
    expect(api.getCachedCryptoPortfolioQuote(symbol('Z299'))!.price).toBe(4);
    expect(provider.getUnifiedCryptoSpotQuoteCacheStatus().cachedQuotes).toBe(216);
    expect(tickerCalls()).toHaveLength(300);
  });
});

describe('15:05北京固定快照的真实15:04完成分钟线', () => {
  it('Gate精确请求symbol/1m/from/to且不用limit；过滤之后/之前行，保留真实取数时刻', async () => {
    handler = (url) => {
      expect(url.pathname).toContain('/spot/candlesticks');
      expect(Object.fromEntries(url.searchParams)).toEqual({ currency_pair: 'BTC_USDT', interval: '1m', from: String(OPEN), to: String(OPEN + 59) });
      return [candle(OPEN + 60, '999'), candle(OPEN - 60, '1'), candle()];
    };
    const quote = (await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15'))[symbol('BTC')];
    expect(quote).toEqual({ symbol: symbol('BTC'), price: 88, currency: 'USDT', source: 'crypto_close_gate_1505',
      updatedAt: new Date(NOW).toISOString(), priceDate: '2026-11-15', cutoffAt: '2026-11-15T07:05:00.000Z' });
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull(); // 历史不冒充实时价。
  });

  it.each(['false', false, undefined])('Gate未完成或缺关闭证据%s拒绝，不能用fresh实时缓存补过去', async (closed) => {
    await warmProvider(['BTC'], 999);
    const row = candle();
    row[7] = closed;
    handler = (url) => url.hostname === 'api.gateio.ws' ? [row] : { status: 'error' };
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.price).toBe(999);
    expect(tickerCalls()).toHaveLength(1);
  });

  it('HTX备用严格channel、秒级id和完整分钟截止；不假设from/to支持', async () => {
    htxCatalog = [htxPair('BTC')];
    handler = (url) => {
      if (url.hostname === 'api.gateio.ws') throw new Error('Gate offline');
      expect(url.pathname).toBe('/market/history/kline');
      expect(url.searchParams.get('symbol')).toBe('btcusdt');
      expect(url.searchParams.get('period')).toBe('1min');
      expect(Number(url.searchParams.get('size'))).toBeLessThanOrEqual(2000);
      expect(url.searchParams.has('from')).toBe(false);
      return { status: 'ok', ch: 'market.btcusdt.kline.1min', ts: Date.now(), data: [
        { id: OPEN + 60, close: 999 }, { id: OPEN, close: 77 }, { id: OPEN - 60, close: 1 },
      ] };
    };
    expect((await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15'))[symbol('BTC')]).toMatchObject({ price: 77, source: 'crypto_close_htx_1505' });
  });

  it.each(['wrong-channel', 'future-row', 'old-row', 'millisecond-id', 'before-cutoff-response', 'incomplete', 'duplicate', 'zero'])('HTX %s无证据返回缺项', async (reason) => {
    htxCatalog = [htxPair('BTC')];
    handler = (url) => {
      if (url.hostname === 'api.gateio.ws') return [];
      const row: any = { id: reason === 'future-row' ? OPEN + 60 : reason === 'old-row' ? OPEN - 60 : reason === 'millisecond-id' ? OPEN * 1000 : OPEN,
        close: reason === 'zero' ? 0 : 77 };
      if (reason === 'incomplete') row.closed = false;
      return { status: 'ok', ch: reason === 'wrong-channel' ? 'market.ethusdt.kline.1min' : 'market.btcusdt.kline.1min',
        ts: reason === 'before-cutoff-response' ? (OPEN + 59) * 1000 : Date.now(), data: reason === 'duplicate' ? [row, row] : [row] };
    };
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
  });

  it('Gate重复分钟行不接受；没有15:04确证不取最近15:03或15:05', async () => {
    handler = (url) => url.hostname === 'api.gateio.ws' ? [candle(), candle()] : { status: 'error' };
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
  });

  it('未来或无效日期/裸代码不发网；15:05前不能使用完成状态声明', async () => {
    for (const date of ['2026-11-16', '2026-02-30', 'invalid', '2026-1-2']) {
      expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], date)).toEqual({});
    }
    expect(await api.fetchCryptoPortfolioCloseQuotes(['BTC', 'ETH_PERP'], '2026-11-15')).toEqual({});
    vi.setSystemTime((OPEN + 59) * 1000);
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(network).not.toHaveBeenCalled();
  });

  it('晚执行可补真实Gate历史，超HTX2000分钟覆盖范围不猜历史', async () => {
    vi.setSystemTime(NOW + 4 * 86_400_000);
    htxCatalog = [htxPair('ETH')];
    handler = () => [candle()];
    expect((await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15'))[symbol('BTC')].price).toBe(88);
    handler = () => [];
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('ETH')], '2026-11-15')).toEqual({});
    expect(network.mock.calls.some(([url]) => String(url).includes('/market/history/kline'))).toBe(false);
  });

  it('历史single-flight和缓存不受实时更新影响；失败仅缺项且重试退避', async () => {
    handler = (url) => url.hostname === 'api.gateio.ws' && url.searchParams.get('currency_pair') === 'BTC_USDT' ? [candle()] : [];
    const all = await Promise.all(Array.from({ length: 8 }, () => api.fetchCryptoPortfolioCloseQuotes([symbol('BTC'), symbol('ETH')], '2026-11-15')));
    expect(Object.keys(all[0])).toEqual([symbol('BTC')]);
    expect(network.mock.calls.filter(([url]) => String(url).includes('candlesticks'))).toHaveLength(2);
    all[0][symbol('BTC')].price = 999;
    expect(all[1][symbol('BTC')].price).toBe(88);
    await warmProvider(['BTC'], 777);
    const later = await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC'), symbol('ETH')], '2026-11-15');
    expect(later[symbol('BTC')].price).toBe(88);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.price).toBe(777);
    expect(network.mock.calls.filter(([url]) => String(url).includes('candlesticks'))).toHaveLength(2);
    later[symbol('BTC')].price = 1;
    vi.setSystemTime(NOW + 15_000);
    expect((await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC'), symbol('ETH')], '2026-11-15'))[symbol('BTC')].price).toBe(88);
    expect(network.mock.calls.filter(([url]) => String(url).includes('candlesticks'))).toHaveLength(3);
  });
});


describe('官方HTX目录备用与供应商资格容错', () => {
  const htxTick = (base: string, close = 77) => ({ status: 'ok', ch: `market.${base.toLowerCase()}usdt.detail.merged`, ts: Date.now(), tick: { close } });
  const htxClose = (base: string, close = 66) => ({ status: 'ok', ch: `market.${base.toLowerCase()}usdt.kline.1min`, ts: Date.now(), data: [{ id: OPEN, close }] });
  const failGateDirectory = () => network.mockImplementation(async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/currency_pairs')) throw new Error('Gate directory offline');
    if (url.pathname === '/v1/common/symbols') return response({ status: 'ok', data: htxCatalog });
    return response(await handler(url));
  });

  it('Gate目录失败也能选BTC/ETH并广搜HTX独有币；实时和15:04历史只请求HTX', async () => {
    htxCatalog = [htxPair('BTC'), htxPair('ETH'), htxPair('FIL')];
    failGateDirectory();
    handler = url => url.pathname.endsWith('/kline') ? htxClose(url.searchParams.get('symbol')!.slice(0, -4))
      : htxTick(url.searchParams.get('symbol')!.slice(0, -4));
    const list = await api.searchCryptoPortfolio('*');
    expect(list.results.map(row => row.symbol)).toEqual(AI_WALLET_CRYPTO_MARKET_ASSETS.map(symbol));
    expect(list.results.every(row => row.available === false && row.latestPrice === null)).toBe(true);
    expect(network).not.toHaveBeenCalled();
    expect((await api.searchCryptoPortfolio('FIL')).results[0]).toMatchObject({ symbol: symbol('FIL'), latestPrice: 77, source: 'HTX' });
    for (const base of ['BTC', 'ETH']) {
      expect((await api.searchCryptoPortfolio(base)).results[0]).toMatchObject({ latestPrice: 77, source: 'HTX', available: true });
      expect((await api.fetchCryptoPortfolioCloseQuotes([symbol(base)], '2026-11-15'))[symbol(base)])
        .toMatchObject({ price: 66, source: 'crypto_close_htx_1505', priceDate: '2026-11-15', cutoffAt: '2026-11-15T07:05:00.000Z' });
    }
    expect(network.mock.calls.filter(([url]) => String(url).includes('gateio'))).toHaveLength(1);
    expect(scanner.getLatestPrice).not.toHaveBeenCalled();
  });

  it('HTX目录失败不影响Gate38币和广搜，Gate报价仍优先', async () => {
    catalog.push(pair('FIL', { base_name: 'Filecoin' }));
    network.mockImplementation(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/currency_pairs')) return response(catalog);
      if (url.hostname === 'api.huobi.pro') throw new Error('HTX offline');
      return response([{ currency_pair: url.searchParams.get('currency_pair'), last: '88' }]);
    });
    expect((await api.searchCryptoPortfolio('*')).results).toHaveLength(216);
    expect((await api.searchCryptoPortfolio('Filecoin')).results[0]).toMatchObject({ latestPrice: null, source: null, available: false });
    expect(network).not.toHaveBeenCalled();
    expect(tickerCalls()).toHaveLength(0);
    expect((await api.searchCryptoPortfolio('FIL')).results[0]).toMatchObject({ latestPrice: 88, source: 'Gate.io' });
    expect(network.mock.calls.filter(([url]) => String(url).includes('huobi'))).toHaveLength(1);
  });

  it('同次live目录合并已核验来源并优先Gate价格，搜索保留静态中文名称及HTX独有币metadata', async () => {
    catalog = [pair('BTC'), pair('ETH')];
    htxCatalog = [htxPair('BTC'), htxPair('FIL')];
    handler = url => url.hostname === 'api.gateio.ws'
      ? [{ currency_pair: url.searchParams.get('currency_pair'), last: '88' }] : htxTick('FIL');
    expect((await api.searchCryptoPortfolio('比特币')).results[0]).toEqual(unavailableMetadata('BTC'));
    expect(network).not.toHaveBeenCalled();
    expect(priceCalls()).toHaveLength(0);
    expect((await api.searchCryptoPortfolio('BTC')).results[0]).toMatchObject({ name: '比特币', latestPrice: 88, source: 'Gate.io' });
    const calls = network.mock.calls.length;
    expect((await api.searchCryptoPortfolio('比特币')).results[0]).toMatchObject({ name: '比特币', latestPrice: 88, source: 'Gate.io' });
    expect(network).toHaveBeenCalledTimes(calls);
    expect((await api.searchCryptoPortfolio('FIL')).results[0]).toMatchObject({ latestPrice: 77, source: 'HTX' });
    expect(provider.peekUnifiedCryptoSpotInstrument('BTC')).toMatchObject({ name: 'Bitcoin', sources: ['Gate.io', 'HTX'] });
    expect(network.mock.calls.some(([url]) => String(url).includes('FIL_USDT') && String(url).includes('gateio'))).toBe(false);
    expect(network.mock.calls.some(([url]) => String(url).includes('/market/detail/merged?symbol=btcusdt'))).toBe(false);
  });

  it.each(['online-missing', 'suspend', 'offline', 'pre-online', 'wrong-base', 'wrong-quote', 'wrong-symbol', 'api-disabled', 'api-missing', 'etp-tag', 'etp-underlying', 'etp-fee', 'auction', 'leveraged-flag'])('HTX %s未核验时不接受同名实时/scanner/历史', async reason => {
    const patch: Record<string, unknown> = {
      'online-missing': { state: undefined }, suspend: { state: 'suspend' }, offline: { state: 'offline' }, 'pre-online': { state: 'pre-online' },
      'wrong-base': { 'base-currency': 'eth' }, 'wrong-quote': { 'quote-currency': 'usd' }, 'wrong-symbol': { symbol: 'ethusdt' },
      'api-disabled': { 'api-trading': 'disabled' }, 'api-missing': { 'api-trading': undefined }, 'etp-tag': { tags: 'activities,etp,nav' },
      'etp-underlying': { underlying: 'ethusdt' }, 'etp-fee': { 'mgmt-fee-rate': 0 }, auction: { 'ca-state': 'ca_1' }, 'leveraged-flag': { leveraged: true },
    }[reason];
    catalog = [pair('BTC')]; htxCatalog = [htxPair('BTC', patch)];
    freshScanner('BTC', 999, 'HTX');
    handler = url => url.hostname === 'api.gateio.ws' ? [] : url.pathname.endsWith('/kline') ? htxClose('BTC') : htxTick('BTC');
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(network.mock.calls.filter(([url]) => String(url).includes('huobi'))).toHaveLength(1);
  });

  it('HTX严格排除畸形/USDT/杠杆资产；普通BTC保证金资格和B2并不误拦', async () => {
    catalog = [];
    htxCatalog = [htxPair('BTC'), htxPair('B2'), htxPair('USDT'), htxPair('BTC3L'), htxPair('ETH5S'), htxPair('SOL3X'),
      htxPair('BAD!', { symbol: 'bad!usdt' }), htxPair('UPPER', { 'base-currency': 'UPPER' }), htxPair('NAV', { 'init-nav': 0 }), null];
    handler = url => htxTick(url.searchParams.get('symbol')!.slice(0, -4));
    expect((await api.searchCryptoPortfolio('*')).results.map(row => row.symbol)).toEqual(AI_WALLET_CRYPTO_MARKET_ASSETS.map(symbol));
    expect(network).not.toHaveBeenCalled();
    expect(Object.keys(await api.fetchCryptoPortfolioQuotes(htxCatalog.filter(Boolean).map(row => symbol(row['base-currency'].toUpperCase())))))
      .toEqual([symbol('BTC'), symbol('B2')]);
    expect((await provider.getUnifiedCryptoSpotDirectory()).map(row => row.code)).toEqual(['BTC', 'B2']);
    for (const base of ['USDT', 'BTC3L', 'ETH5S', 'SOL3X', 'BAD!', 'UPPER', 'NAV']) {
      expect(provider.peekUnifiedCryptoSpotInstrument(base)).toBeNull();
      expect(api.getCachedCryptoPortfolioQuote(symbol(base))).toBeNull();
    }
  });

  it('仅HTX核验不得复用Gate scanner或请求Gate历史', async () => {
    catalog = []; htxCatalog = [htxPair('BTC')];
    freshScanner('BTC', 999, 'Gate.io');
    handler = url => url.pathname.endsWith('/kline') ? htxClose('BTC') : htxTick('BTC');
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')]).toMatchObject({ price: 77, source: 'HTX' });
    expect((await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15'))[symbol('BTC')]).toMatchObject({ price: 66, source: 'crypto_close_htx_1505' });
    expect(tickerCalls()).toHaveLength(0);
    expect(network.mock.calls.some(([url]) => String(url).includes('/spot/candlesticks'))).toBe(false);
  });

  it('Gate预定下架只撤销Gate资格；HTX仍online则保留标的并切换报价', async () => {
    catalog = [pair('BTC', { delisting_time: NOW / 1000 + 10 })]; htxCatalog = [htxPair('BTC')];
    handler = url => url.hostname === 'api.gateio.ws' ? [{ currency_pair: 'BTC_USDT', last: '88' }] : htxTick('BTC');
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].source).toBe('Gate.io');
    vi.setSystemTime(NOW + 10_000);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].source).toBe('HTX');
    expect(tickerCalls()).toHaveLength(1);
  });

  it('目录刷新失去HTX资格后不复用HTX scanner、实时缓存或24小时历史缓存', async () => {
    catalog = []; htxCatalog = [htxPair('BTC')];
    handler = url => url.pathname.endsWith('/kline') ? htxClose('BTC') : htxTick('BTC');
    const before = (await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15'))[symbol('BTC')];
    expect(before.source).toBe('crypto_close_htx_1505');
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].source).toBe('HTX');
    vi.setSystemTime(NOW + 10 * 60_000 + 1);
    catalog = [pair('BTC')]; htxCatalog = [htxPair('BTC', { state: 'offline' })];
    freshScanner('BTC', 999, 'HTX', Date.now());
    handler = url => url.hostname === 'api.gateio.ws' ? [] : htxClose('BTC');
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
  });

  it('两家目录畸形或失败返回缺项，退避有界，不能用钱包或scanner证明可交易', async () => {
    freshScanner('BTC');
    network.mockResolvedValue(response({ status: 'error', data: [htxPair('BTC')] }));
    const list = await api.searchCryptoPortfolio('*');
    expect(list.results.map(row => row.symbol)).toEqual(AI_WALLET_CRYPTO_MARKET_ASSETS.map(symbol));
    expect(list.results.every(row => row.available === false && row.latestPrice === null && row.source === null && row.updatedAt === null)).toBe(true);
    expect((await api.searchCryptoPortfolio('比特币')).results).toEqual([unavailableMetadata('BTC')]);
    expect(network).not.toHaveBeenCalled();
    expect((await api.searchCryptoPortfolio('BTC')).results).toEqual([unavailableMetadata('BTC')]);
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('3秒Gate超时后接受2秒HTX备价，37共享provider single-flight且保留真实ts', async () => {
    htxCatalog = [htxPair('BTC')];
    const budgets: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      budgets.push(ms);
      const controller = new AbortController();
      // 本case目录fixture立即完成；只为未完成的ticker模拟可观察的超时。
      if (ms === 3_000) setTimeout(() => controller.abort(new Error('timeout')), ms);
      return controller.signal;
    });
    network.mockImplementation(async (input: string, options: { signal: AbortSignal }) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/currency_pairs')) return response(catalog);
      if (url.pathname === '/v1/common/symbols') return response({ status: 'ok', data: htxCatalog });
      if (url.hostname === 'api.gateio.ws') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(response({ ...htxTick('BTC'), ts: Date.now() - 1_000 })), 2_000);
        options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(options.signal.reason); }, { once: true });
      });
    });
    const all = Promise.all(Array.from({ length: 8 }, () => api.fetchCryptoPortfolioQuotes([symbol('BTC')])));
    await vi.advanceTimersByTimeAsync(6_000);
    const quotes = await all;
    expect(quotes.every(result => result[symbol('BTC')]?.source === 'HTX')).toBe(true);
    expect(budgets).toEqual([12_000, 12_000, 3_000, 3_000]);
    expect(network).toHaveBeenCalledTimes(4);
    const sampledAt = quotes[0][symbol('BTC')].updatedAt;
    expect(sampledAt).toBe(new Date(NOW + 4_000).toISOString());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.updatedAt).toBe(sampledAt);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('两家报价均3秒超时只返回缺价，已有缓存清除不编新时刻且2.5秒内不重试', async () => {
    htxCatalog = [htxPair('BTC')];
    handler = () => [{ currency_pair: 'BTC_USDT', last: '88' }];
    const before = (await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')];
    vi.setSystemTime(NOW + 2_500);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))?.updatedAt).toBe(before.updatedAt);
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error('timeout')), ms);
      return controller.signal;
    });
    const previous = network.getMockImplementation()!;
    network.mockImplementation(async (_input: string, options: { signal: AbortSignal }) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const pending = api.fetchCryptoPortfolioQuotes([symbol('BTC')]);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await pending).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    const calls = network.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2_499);
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(network).toHaveBeenCalledTimes(calls);
    expect(before.updatedAt).toBe(new Date(NOW).toISOString());
    expect(provider.getUnifiedCryptoSpotQuoteHealth('BTC')).toMatchObject({ stale: true, lastSuccessAt: before.updatedAt, consecutiveFailures: 1 });
    await vi.advanceTimersByTimeAsync(1);
    timeout.mockRestore();
    network.mockImplementation(previous);
    handler = () => [{ currency_pair: 'BTC_USDT', last: '89' }];
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].price).toBe(89);
    expect(priceCalls()).toHaveLength(4); // Initial Gate, both timeout sources, then recovered Gate.
    expect(vi.getTimerCount()).toBe(0);
  });
});
