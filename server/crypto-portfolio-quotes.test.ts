import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
let network: ReturnType<typeof vi.fn>;
let catalog: any[];
let htxCatalog: any[];
let handler: (url: URL) => unknown | Promise<unknown>;

function freshScanner(base: string, price = 100, source = 'Gate.io', time = NOW) {
  const updatedAt = new Date(time).toISOString();
  scanner.prices[base] = { price, updatedAt };
  scanner.health[base] = { source, lastSuccessAt: updatedAt, stale: false, consecutiveFailures: 0 };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  scanner.prices = {}; scanner.health = {};
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
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const tickerCalls = () => network.mock.calls.filter(([url]) => String(url).includes('/tickers'));

describe('Gate普通USDT现货目录和身份', () => {
  it('无输入下拉按钱包/52号顺序覆盖38币，仅加载活动目录，不请求38个报价', async () => {
    const list = await api.searchCryptoPortfolio('*');
    expect(list.results).toHaveLength(38);
    expect(list.results.slice(0, 4).map(row => row.displaySymbol)).toEqual(['BTC', 'ETH', 'SOL', 'BNB']);
    expect(new Set(list.results.map(row => row.symbol))).toEqual(new Set(REQUIRED.map(symbol)));
    expect(list.results.every(row => row.currency === 'USDT' && row.latestPrice === null && row.source === null)).toBe(true);
    expect(network).toHaveBeenCalledTimes(2); expect(tickerCalls()).toHaveLength(0);
  });
  it('下拉不会把钱包静态代码冒充有效现货；已下架/暂停/杠杆品种不列入', async () => {
    catalog = catalog.filter(row => !['BTC', 'ETH', 'SOL'].includes(row.base));
    catalog.push(pair('BTC', { trade_status: 'untradable' }), pair('ETH', { type: 'leveraged' }));
    const list = await api.searchCryptoPortfolio('*');
    expect(list.results.some(row => ['BTC', 'ETH', 'SOL'].includes(row.displaySymbol!))).toBe(false);
    expect(tickerCalls()).toHaveLength(0);
  });
  it('38种全覆盖且优先复用fresh Gate/HTX scanner，不用稳定币固定价接口', async () => {
    htxCatalog = REQUIRED.map(base => htxPair(base));
    REQUIRED.forEach((base, i) => freshScanner(base, i + 1, i % 2 ? 'HTX' : 'Gate.io'));
    const quotes = await api.fetchCryptoPortfolioQuotes(REQUIRED.map(symbol));
    expect(Object.keys(quotes)).toHaveLength(38);
    for (const base of REQUIRED) {
      expect(quotes[symbol(base)]).toMatchObject({ symbol: symbol(base), currency: 'USDT', updatedAt: new Date(NOW).toISOString(), priceDate: '2026-11-15' });
      const search = await api.searchCryptoPortfolio(base);
      expect(search.results[0].symbol).toBe(symbol(base));
      expect(search.results[0].available).toBe(true);
    }
    expect(network).toHaveBeenCalledTimes(2);
    expect(scanner.getLatestPrice).not.toHaveBeenCalled();
  });

  it('广泛名称/代码搜索不局限38币；明确pair身份但裸代码报价不猜数字币', async () => {
    catalog.push(pair('NEWCOIN', { base_name: 'Novel protocol' }));
    handler = (url) => [{ currency_pair: url.searchParams.get('currency_pair'), last: '0.123' }];
    const byName = await api.searchCryptoPortfolio('novel');
    expect(byName.results).toEqual([expect.objectContaining({ symbol: symbol('NEWCOIN'), name: 'Novel protocol', market: 'CRYPTO', currency: 'USDT', latestPrice: 0.123, displaySymbol: 'NEWCOIN/USDT' })]);
    for (const query of ['NEWCOIN/USDT', 'NEWCOIN_USDT', 'crypto:newcoin-usdt']) {
      expect((await api.searchCryptoPortfolio(query)).results[0].symbol).toBe(symbol('NEWCOIN'));
    }
    expect(await api.fetchCryptoPortfolioQuotes(['ETH', 'USDT', 'ETH_PERP', 'BTC-USDT', 'AAPL', 'CRYPTO:NOTLISTED-USDT'])).toEqual({});
  });

  it('复用钱包中文名称检索，但没有真实现货目录时不得仅凭钱包名称造结果', async () => {
    freshScanner('BTC'); freshScanner('ETH'); freshScanner('DOGE');
    for (const [name, base] of [['比特币', 'BTC'], ['以太坊', 'ETH'], ['狗狗币', 'DOGE']]) {
      expect((await api.searchCryptoPortfolio(name)).results[0]).toMatchObject({ symbol: symbol(base), currency: 'USDT', latestPrice: 100 });
    }
    expect((await api.searchCryptoPortfolio('人民币')).results).toEqual([]);
    expect((await api.searchCryptoPortfolio('泰达币')).results).toEqual([]);
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
    for (const query of ['3L', '5S', 'PRE', 'HALT', 'ETF']) expect((await api.searchCryptoPortfolio(query)).results).toEqual([]);
    expect((await api.searchCryptoPortfolio('USDT')).results.every((row) => row.symbol !== symbol('USDT'))).toBe(true);
  });

  it('目录缓存single-flight，TTL后重读；失败不复用过期目录或过期行情', async () => {
    handler = (url) => [{ currency_pair: url.searchParams.get('currency_pair'), last: '123' }];
    const concurrent = await Promise.all(Array.from({ length: 12 }, () => api.searchCryptoPortfolio('BTC')));
    expect(concurrent[0].results[0].latestPrice).toBe(123);
    expect(network).toHaveBeenCalledTimes(3);
    vi.setSystemTime(NOW + 10 * 60_000 + 1);
    network.mockImplementation(async () => { throw new Error('offline'); });
    expect(await api.searchCryptoPortfolio('BTC')).toEqual({ results: [] });
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(network).toHaveBeenCalledTimes(5); // 两家失败退避不反复打目录。
    vi.setSystemTime(NOW + 10 * 60_000 + 16_000);
    network.mockImplementation(async (input) => {
      const url = new URL(input);
      return response(url.pathname.endsWith('/currency_pairs') ? catalog : [{ currency_pair: 'BTC_USDT', last: '124' }]);
    });
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].price).toBe(124);
  });

  it('空/畸形目录失败返回空结果；无效查询和标的不发请求', async () => {
    expect(await api.searchCryptoPortfolio('')).toEqual({ results: [] });
    expect(await api.searchCryptoPortfolio('x'.repeat(81))).toEqual({ results: [] });
    expect(await api.fetchCryptoPortfolioQuotes(['ETH', 'CRYPTO:USDT-USDT'])).toEqual({});
    expect(network).not.toHaveBeenCalled();
    network.mockResolvedValue(response({ error: 'bad directory' }));
    expect(await api.searchCryptoPortfolio('BTC')).toEqual({ results: [] });
  });

  it('目录更新下架或预设下架时间到达后不得返回缓存', async () => {
    catalog = [pair('BTC', { delisting_time: NOW / 1000 + 10 })];
    freshScanner('BTC');
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].price).toBe(100);
    vi.setSystemTime(NOW + 10_000);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
  });
});

describe('正数现货与有界按需缓存', () => {
  it.each(['OKX', '本地持久化缓存', 'Gate.io ETH/USDT 永续标记价', 'HTX ETH/USDT 永续标记价'])('不复用%s缓存', async (source) => {
    freshScanner('ETH', 900, source);
    handler = () => [{ currency_pair: 'ETH_USDT', last: '123', mark_price: '888' }];
    expect((await api.fetchCryptoPortfolioQuotes([symbol('ETH')]))[symbol('ETH')].price).toBe(123);
  });

  it.each(['stale', 'old', 'future', 'mismatch', 'zero'])('拒绝scanner的%s证据', async (reason) => {
    freshScanner('BTC', reason === 'zero' ? 0 : 999, 'Gate.io', reason === 'old' ? NOW - 120_001 : reason === 'future' ? NOW + 1 : NOW);
    if (reason === 'stale') scanner.health.BTC.stale = true;
    if (reason === 'mismatch') scanner.health.BTC.lastSuccessAt = '2026-11-15T07:59:00Z';
    handler = () => [{ currency_pair: 'BTC_USDT', last: '12' }];
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].price).toBe(12);
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

  it('报价TTL、single-flight、失败退避与拷贝隔离；过期不编价', async () => {
    handler = () => [{ currency_pair: 'BTC_USDT', last: '9' }];
    await Promise.all(Array.from({ length: 10 }, () => api.fetchCryptoPortfolioQuotes([symbol('BTC')])));
    expect(tickerCalls()).toHaveLength(1);
    const cached = api.getCachedCryptoPortfolioQuote(symbol('BTC'))!;
    cached.price = 666;
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.price).toBe(9);
    vi.setSystemTime(NOW + 15_001);
    handler = () => { throw new Error('offline'); };
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    const calls = network.mock.calls.length;
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(network).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0); // 没有2200币三秒定时扫描。
  });

  it('priceDate按北京采样日期，不依服务器UTC日期', async () => {
    vi.setSystemTime(Date.parse('2026-11-15T17:00:00Z'));
    handler = () => [{ currency_pair: 'BTC_USDT', last: '9' }];
    expect((await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')].priceDate).toBe('2026-11-16');
  });

  it('2200币目录只查询前20结果，每次报价最多100，跨调用全局最多4并发', async () => {
    catalog = Array.from({ length: 2200 }, (_, i) => pair(`COIN${i}`, { base_name: 'Catalog token' }));
    let active = 0; let peak = 0;
    handler = async (url) => {
      active += 1; peak = Math.max(peak, active);
      await Promise.resolve(); await Promise.resolve();
      active -= 1;
      return [{ currency_pair: url.searchParams.get('currency_pair'), last: '3' }];
    };
    expect((await api.searchCryptoPortfolio('Catalog')).results).toHaveLength(20);
    expect(tickerCalls()).toHaveLength(20);
    await Promise.all([
      api.fetchCryptoPortfolioQuotes(Array.from({ length: 2200 }, (_, i) => symbol(`COIN${i}`))),
      api.fetchCryptoPortfolioQuotes(Array.from({ length: 100 }, (_, i) => symbol(`COIN${i + 100}`))),
    ]);
    expect(peak).toBeLessThanOrEqual(4);
    expect(tickerCalls().length).toBeLessThanOrEqual(220);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('新增币缓存最多256项，超容量淘汰最老项', async () => {
    catalog = Array.from({ length: 300 }, (_, i) => pair(`Z${i}`));
    handler = (url) => [{ currency_pair: url.searchParams.get('currency_pair'), last: '4' }];
    for (let i = 0; i < 300; i += 100) await api.fetchCryptoPortfolioQuotes(Array.from({ length: 100 }, (_, j) => symbol(`Z${i + j}`)));
    expect(api.getCachedCryptoPortfolioQuote(symbol('Z0'))).toBeNull();
    expect(api.getCachedCryptoPortfolioQuote(symbol('Z299'))!.price).toBe(4);
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
    freshScanner('BTC', 999);
    const row = candle();
    row[7] = closed;
    handler = (url) => url.hostname === 'api.gateio.ws' ? [row] : { status: 'error' };
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.price).toBe(999);
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
    freshScanner('BTC', 777);
    const later = await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC'), symbol('ETH')], '2026-11-15');
    expect(later[symbol('BTC')].price).toBe(88);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.price).toBe(777);
    expect(network.mock.calls.filter(([url]) => String(url).includes('candlesticks'))).toHaveLength(2);
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
    htxCatalog = [htxPair('BTC'), htxPair('ETH'), htxPair('NOVEL')];
    failGateDirectory();
    handler = url => url.pathname.endsWith('/kline') ? htxClose(url.searchParams.get('symbol')!.slice(0, -4))
      : htxTick(url.searchParams.get('symbol')!.slice(0, -4));
    const list = await api.searchCryptoPortfolio('*');
    expect(list.results.map(row => row.symbol)).toEqual([symbol('BTC'), symbol('ETH')]);
    expect(list.results.every(row => row.available === false && row.latestPrice === null)).toBe(true);
    expect((await api.searchCryptoPortfolio('NOVEL')).results[0]).toMatchObject({ symbol: symbol('NOVEL'), latestPrice: 77, source: 'HTX' });
    for (const base of ['BTC', 'ETH']) {
      expect((await api.searchCryptoPortfolio(base)).results[0]).toMatchObject({ latestPrice: 77, source: 'HTX', available: true });
      expect((await api.fetchCryptoPortfolioCloseQuotes([symbol(base)], '2026-11-15'))[symbol(base)])
        .toMatchObject({ price: 66, source: 'crypto_close_htx_1505', priceDate: '2026-11-15', cutoffAt: '2026-11-15T07:05:00.000Z' });
    }
    expect(network.mock.calls.filter(([url]) => String(url).includes('gateio'))).toHaveLength(1);
    expect(scanner.getLatestPrice).not.toHaveBeenCalled();
  });

  it('HTX目录失败不影响Gate38币和广搜，Gate报价仍优先', async () => {
    catalog.push(pair('NEW', { base_name: 'New protocol' }));
    network.mockImplementation(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/currency_pairs')) return response(catalog);
      if (url.hostname === 'api.huobi.pro') throw new Error('HTX offline');
      return response([{ currency_pair: url.searchParams.get('currency_pair'), last: '88' }]);
    });
    expect((await api.searchCryptoPortfolio('*')).results).toHaveLength(38);
    expect((await api.searchCryptoPortfolio('New protocol')).results[0]).toMatchObject({ latestPrice: 88, source: 'Gate.io' });
    expect(network.mock.calls.filter(([url]) => String(url).includes('huobi'))).toHaveLength(1);
  });

  it('同次目录合并已核验来源，保留Gate名称并优先Gate价格，包含HTX独有币', async () => {
    catalog = [pair('BTC'), pair('GATEONLY')];
    htxCatalog = [htxPair('BTC'), htxPair('HTXONLY')];
    handler = url => url.hostname === 'api.gateio.ws'
      ? [{ currency_pair: url.searchParams.get('currency_pair'), last: '88' }] : htxTick('HTXONLY');
    expect((await api.searchCryptoPortfolio('Bitcoin')).results[0]).toMatchObject({ name: 'Bitcoin', latestPrice: 88, source: 'Gate.io' });
    expect((await api.searchCryptoPortfolio('HTXONLY')).results[0]).toMatchObject({ latestPrice: 77, source: 'HTX' });
    expect(network.mock.calls.some(([url]) => String(url).includes('htxonly') && String(url).includes('gateio'))).toBe(false);
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
    expect((await api.searchCryptoPortfolio('*')).results.map(row => row.symbol)).toEqual([symbol('BTC'), symbol('B2')]);
    expect(Object.keys(await api.fetchCryptoPortfolioQuotes(htxCatalog.filter(Boolean).map(row => symbol(row['base-currency'].toUpperCase())))))
      .toEqual([symbol('BTC'), symbol('B2')]);
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
    expect(await api.searchCryptoPortfolio('*')).toEqual({ results: [] });
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(await api.fetchCryptoPortfolioCloseQuotes([symbol('BTC')], '2026-11-15')).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('6秒主请求超时后接受5秒HTX备价，共用single-flight，不无限等待/重试', async () => {
    htxCatalog = [htxPair('BTC')];
    const budgets: number[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      budgets.push(ms);
      const controller = new AbortController();
      if (ms === 6_000) setTimeout(() => controller.abort(new Error('timeout')), ms);
      return controller.signal;
    });
    network.mockImplementation(async (input: string, options: { signal: AbortSignal }) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/currency_pairs')) return response(catalog);
      if (url.pathname === '/v1/common/symbols') return response({ status: 'ok', data: htxCatalog });
      if (url.hostname === 'api.gateio.ws') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
      return new Promise(resolve => setTimeout(() => resolve(response(htxTick('BTC'))), 5_000));
    });
    const all = Promise.all(Array.from({ length: 8 }, () => api.fetchCryptoPortfolioQuotes([symbol('BTC')])));
    await vi.advanceTimersByTimeAsync(11_000);
    const quotes = await all;
    expect(quotes.every(result => result[symbol('BTC')]?.source === 'HTX')).toBe(true);
    expect(budgets).toEqual([12_000, 12_000, 6_000, 6_000]);
    expect(network).toHaveBeenCalledTimes(4);
    const sampledAt = quotes[0][symbol('BTC')].updatedAt;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))!.updatedAt).toBe(sampledAt);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('两家报价均6秒超时只返回缺价，已有缓存不编新时刻且15秒内不重试', async () => {
    htxCatalog = [htxPair('BTC')];
    handler = () => [{ currency_pair: 'BTC_USDT', last: '88' }];
    const before = (await api.fetchCryptoPortfolioQuotes([symbol('BTC')]))[symbol('BTC')];
    vi.setSystemTime(NOW + 15_001);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error('timeout')), ms);
      return controller.signal;
    });
    network.mockImplementation(async (_input: string, options: { signal: AbortSignal }) => new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const pending = api.fetchCryptoPortfolioQuotes([symbol('BTC')]);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await pending).toEqual({});
    expect(api.getCachedCryptoPortfolioQuote(symbol('BTC'))).toBeNull();
    const calls = network.mock.calls.length;
    expect(await api.fetchCryptoPortfolioQuotes([symbol('BTC')])).toEqual({});
    expect(network).toHaveBeenCalledTimes(calls);
    expect(before.updatedAt).toBe(new Date(NOW).toISOString());
    expect(vi.getTimerCount()).toBe(0);
  });
});
