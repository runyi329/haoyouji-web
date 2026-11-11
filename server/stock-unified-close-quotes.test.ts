import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUnifiedCloseQuotes, isUnifiedMarketCloseCompleted, marketSessionDateFromBeijingTradeTimestamp, parseSinaSessionClose, parseYahooSessionClose } from './stock-unified-close-quotes';
import { isTrustedMemberCalendarClose } from './shared/stock-member-calendar';

const now = new Date('2026-11-11T15:32:00+08:00');

// Offline envelopes with the observed field indices/values; never call live sources in these tests.
function sinaA(overrides: Record<number, string> = {}, variable = 'sh600785'): string {
  const parts = Array<string>(33).fill('0');
  Object.assign(parts, { 0: '新华百货', 2: '10.000', 3: '11.750', 30: '2026-11-11', 31: '15:31:31' }, overrides);
  return `var hq_str_${variable}="${parts.join(',')}";`;
}
function sinaUs(overrides: Record<number, string> = {}, variable = 'gb_aaoi'): string {
  const parts = Array<string>(35).fill('0');
  Object.assign(parts, { 0: 'Applied Optoelectronics', 1: '48.3200', 21: '49.5000', 24: 'Nov 10 07:59PM EST', 25: 'Nov 10 04:00PM EST', 29: '2026' }, overrides);
  return `var hq_str_${variable}="${parts.join(',')}";`;
}
function yahooUs(date: string, price = 48.32) {
  return { chart: { result: [{ meta: { currency: 'USD' }, timestamp: [Date.parse(`${date}T14:30:00Z`) / 1000], indicators: { quote: [{ close: [price] }], adjclose: [{ adjclose: [1] }] } }] } };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('market-specific raw close evidence (offline)', () => {
  it('A raw close is available D15:00, US only NY16:00 in summer and winter', () => {
    expect(isUnifiedMarketCloseCompleted('2026-11-10', 'A', new Date('2026-11-10T15:00:00+08:00'))).toBe(true);
    expect(isUnifiedMarketCloseCompleted('2026-11-10', 'A', new Date('2026-11-10T14:59:59+08:00'))).toBe(false);
    expect(isUnifiedMarketCloseCompleted('2026-11-09', 'US', new Date('2026-11-10T05:00:00+08:00'))).toBe(true);
    expect(isUnifiedMarketCloseCompleted('2026-11-10', 'US', new Date('2026-11-10T15:05:00+08:00'))).toBe(false);
    expect(isUnifiedMarketCloseCompleted('2026-06-18', 'US', new Date('2026-06-19T04:00:00+08:00'))).toBe(true);
    expect(isUnifiedMarketCloseCompleted('2026-06-18', 'US', new Date('2026-06-19T03:59:59+08:00'))).toBe(false);
    expect(isUnifiedMarketCloseCompleted('2026-06-19', 'US', new Date('2026-06-22T16:00:00+08:00'))).toBe(false);
  });
  it('true BJ wall timestamps convert to NY date; date-only and malformed cannot infer rollover', () => {
    expect(marketSessionDateFromBeijingTradeTimestamp('2026-11-10 01:00:00', 'US')).toBe('2026-11-09');
    expect(marketSessionDateFromBeijingTradeTimestamp('2026-11-10 23:00:00', 'US')).toBe('2026-11-10');
    expect(marketSessionDateFromBeijingTradeTimestamp('2026-11-10 01:00:00', 'A')).toBe('2026-11-10');
    expect(marketSessionDateFromBeijingTradeTimestamp('2026-11-10', 'US')).toBeNull();
    expect(marketSessionDateFromBeijingTradeTimestamp(null, 'US')).toBeNull();
    expect(marketSessionDateFromBeijingTradeTimestamp('2026-11-31 01:00:00', 'US')).toBeNull();
  });
  it('Yahoo uses real NY date, raw close rather than adjclose, never borrows neighboring day', () => {
    const payload = yahooUs('2026-11-09', 59.27);
    expect(parseYahooSessionClose(payload, 'US', '2026-11-09')).toMatchObject({ price: 59.27, priceDate: '2026-11-09', currency: 'USD', source: 'unified_close_yahoo' });
    expect(parseYahooSessionClose(payload, 'US', '2026-11-10')).toBeNull();
    expect(parseYahooSessionClose(payload, 'A', '2026-11-09')).toBeNull();
  });
});

describe('strict Sina A regular close (offline)', () => {
  it('uses exact A exchange date and [3] price with CNY currency', () => {
    expect(parseSinaSessionClose(sinaA(), '600785.SH', '2026-11-11', now)).toEqual({
      price: 11.75, currency: 'CNY', source: 'unified_close_sina', priceDate: '2026-11-11', updatedAt: now.toISOString(),
    });
  });
  it.each(['SH', 'SZ', 'BJ'])('strictly maps the %s suffix to its Sina variable', suffix => {
    const variable = `${suffix.toLowerCase()}600785`;
    expect(parseSinaSessionClose(sinaA({}, variable), `600785.${suffix}`, '2026-11-11', now)?.currency).toBe('CNY');
  });
  it('accepts byte payloads without depending on the Chinese stock name', () => {
    expect(parseSinaSessionClose(new TextEncoder().encode(sinaA()), '600785.SH', '2026-11-11', now)?.price).toBe(11.75);
  });
  it.each(['sh600786', 'sz600785', 'gb_aaoi'])('rejects wrong symbol variable %s', variable => {
    expect(parseSinaSessionClose(sinaA({}, variable), '600785.SH', '2026-11-11', now)).toBeNull();
  });
  it.each(['0', '-1', '', 'NaN', 'Infinity', '11.75x', '0x10'])('rejects malformed/zero [3]=%s; never uses previous close', price => {
    expect(parseSinaSessionClose(sinaA({ 3: price }), '600785.SH', '2026-11-11', now)).toBeNull();
  });
  it.each(['14:59:59', '09:30:00', '15:32:01', '25:00:00', '15:99:00', '15:00', ''])('rejects intraday, future or malformed quote time %s', time => {
    expect(parseSinaSessionClose(sinaA({ 31: time }), '600785.SH', '2026-11-11', now)).toBeNull();
  });
  it('requires a completed target and a real session; accepts exactly 15:00', () => {
    expect(parseSinaSessionClose(sinaA({ 31: '15:00:00' }), '600785.SH', '2026-11-11', new Date('2026-11-11T15:00:00+08:00'))?.price).toBe(11.75);
    expect(parseSinaSessionClose(sinaA({ 31: '15:00:00' }), '600785.SH', '2026-11-11', new Date('2026-11-11T14:59:59+08:00'))).toBeNull();
    expect(parseSinaSessionClose(sinaA({ 30: '2026-11-08' }), '600785.SH', '2026-11-08', now)).toBeNull();
    expect(parseSinaSessionClose(sinaA({ 30: '2026-10-01' }), '600785.SH', '2026-10-01', now)).toBeNull();
    expect(parseSinaSessionClose(sinaA({ 30: '2026-11-31' }), '600785.SH', '2026-11-31', now)).toBeNull();
  });
  it('never relabels the current price as another historical/next date', () => {
    expect(parseSinaSessionClose(sinaA(), '600785.SH', '2026-11-10', now)).toBeNull();
    expect(parseSinaSessionClose(sinaA({ 30: '2026-11-10' }), '600785.SH', '2026-11-11', now)).toBeNull();
    expect(parseSinaSessionClose(sinaA(), '600785.SH', '2026-11-12', now)).toBeNull();
  });
});

describe('strict Sina US regular close (offline)', () => {
  it.each([
    ['AAOI', '48.3200', 48.32], ['CRCL', '64.9800', 64.98], ['MSTR', '121.0700', 121.07],
  ])('%s uses [1] regular close, matches Yahoo raw precision and ignores afterhours [21]/[24]', (symbol, raw, price) => {
    const quote = parseSinaSessionClose(sinaUs({ 1: raw }, `gb_${symbol.toLowerCase()}`), symbol, '2026-11-10', now);
    expect(quote).toEqual({ price, currency: 'USD', source: 'unified_close_sina', priceDate: '2026-11-10', updatedAt: now.toISOString() });
    expect(quote?.price).toBe(parseYahooSessionClose(yahooUs('2026-11-10', price), 'US', '2026-11-10')?.price);
  });
  it('does not use afterhours as time or price evidence, even if it has the desired date', () => {
    expect(parseSinaSessionClose(sinaUs({ 25: '', 24: 'Nov 10 04:00PM EST' }), 'AAOI', '2026-11-10', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs({ 25: 'Nov 09 04:00PM EST', 24: 'Nov 10 04:00PM EST' }), 'AAOI', '2026-11-10', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs({ 1: '0', 21: '49.5000' }), 'AAOI', '2026-11-10', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs({ 21: '999999', 24: 'garbage' }), 'AAOI', '2026-11-10', now)?.price).toBe(48.32);
  });
  it.each(['Nov 10 03:59PM EST', 'Nov 10 09:30AM EST', 'Nov 10 07:59PM EST', 'Nov 10 01:00PM EST', 'Nov 10 04:01PM EST', 'Nov 10 04:00PM', 'Nov 10 04:00PM UTC', 'Nov 10 04:00PM EDT', 'Nov 31 04:00PM EST'])('rejects non-regular/malformed/incorrect DST timestamp %s', timestamp => {
    expect(parseSinaSessionClose(sinaUs({ 25: timestamp }), 'AAOI', '2026-11-10', now)).toBeNull();
  });
  it.each(['', '26', '2026x', '2025', '0000', '2026.0'])('requires valid explicit year [29]=%s', year => {
    expect(parseSinaSessionClose(sinaUs({ 29: year }), 'AAOI', '2026-11-10', now)).toBeNull();
  });
  it('validates EDT in summer and EST in winter through Intl New York', () => {
    const summer = new Date('2026-06-19T04:00:00+08:00');
    expect(parseSinaSessionClose(sinaUs({ 25: 'Jun 18 04:00PM EDT' }), 'AAOI', '2026-06-18', summer)?.price).toBe(48.32);
    expect(parseSinaSessionClose(sinaUs({ 25: 'Jun 18 04:00PM EST' }), 'AAOI', '2026-06-18', new Date('2026-06-20T00:00:00Z'))).toBeNull();
    expect(parseSinaSessionClose(sinaUs({ 25: 'Jun 18 04:00PM EDT' }), 'AAOI', '2026-06-18', new Date('2026-06-19T03:59:59+08:00'))).toBeNull();
  });
  it('accepts winter regular close exactly when complete, not earlier', () => {
    expect(parseSinaSessionClose(sinaUs(), 'AAOI', '2026-11-10', new Date('2026-11-11T05:00:00+08:00'))?.price).toBe(48.32);
    expect(parseSinaSessionClose(sinaUs(), 'AAOI', '2026-11-10', new Date('2026-11-11T04:59:59+08:00'))).toBeNull();
  });
  it('rejects 13:00 early-close evidence fail-closed until shared closing-hours support exists', () => {
    expect(parseSinaSessionClose(sinaUs({ 25: 'Nov 27 01:00PM EST' }), 'AAOI', '2026-11-27', new Date('2026-11-28T00:00:00Z'))).toBeNull();
  });
  it('never guesses NY date from Beijing, a neighboring session or afterhours', () => {
    expect(parseSinaSessionClose(sinaUs(), 'AAOI', '2026-11-11', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs(), 'AAOI', '2026-11-09', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs({ 25: 'Nov 11 04:00PM EST' }), 'AAOI', '2026-11-11', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs({ 25: 'Jun 19 04:00PM EDT' }), 'AAOI', '2026-06-19', now)).toBeNull();
  });
  it('strictly verifies US variable identity and refuses guessed class-symbol escaping', () => {
    expect(parseSinaSessionClose(sinaUs({}, 'gb_crcl'), 'AAOI', '2026-11-10', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs({}, 'gb_AAOI'), 'AAOI', '2026-11-10', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs({}, 'gb_brk_b'), 'BRK.B', '2026-11-10', now)).toBeNull();
  });
});

describe('Sina payload and source trust boundaries (offline)', () => {
  it.each([null, undefined, {}, 123, '', 'var hq_str_gb_aaoi="";', 'var hq_str_gb_aaoi="name,48.32";', 'var hq_str_gb_aaoi="unterminated;'])('rejects malformed payload %s', payload => {
    expect(parseSinaSessionClose(payload, 'AAOI', '2026-11-10', now)).toBeNull();
  });
  it('rejects duplicate variables, injected content, invalid now, symbol and date', () => {
    expect(parseSinaSessionClose(sinaUs() + sinaUs(), 'AAOI', '2026-11-10', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs() + 'alert(1)', 'AAOI', '2026-11-10', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs(), 'AAOI', '2026-11-10', new Date('invalid'))).toBeNull();
    expect(parseSinaSessionClose(sinaUs(), 'AAOI;bad', '2026-11-10', now)).toBeNull();
    expect(parseSinaSessionClose(sinaUs(), 'AAOI', '2026-02-30', now)).toBeNull();
  });
  it.each([['600785.SH', '2026-11-11', sinaA()], ['AAOI', '2026-11-10', sinaUs()]])('allows strict parsed %s close in member-calendar trust without changing calculations', (symbol, priceDate, payload) => {
    const quote = parseSinaSessionClose(payload, symbol, priceDate, now)!;
    expect(isTrustedMemberCalendarClose({ symbol, price: quote.price, priceDate, capturedAt: quote.updatedAt, source: quote.source })).toBe(true);
  });
  it('new source retains existing capture-time and session trust gates', () => {
    const quote = { symbol: 'AAOI', price: 48.32, priceDate: '2026-11-10', capturedAt: '2026-11-11T04:59:59+08:00', source: 'unified_close_sina' };
    expect(isTrustedMemberCalendarClose(quote)).toBe(false);
    expect(isTrustedMemberCalendarClose({ ...quote, capturedAt: now.toISOString(), source: 'sina_live' })).toBe(false);
    expect(isTrustedMemberCalendarClose({ ...quote, priceDate: '2026-11-08', capturedAt: now.toISOString() })).toBe(false);
    expect(isTrustedMemberCalendarClose({ ...quote, symbol: '600785.SH', priceDate: '2026-11-11', capturedAt: '2026-11-11T14:59:59+08:00' })).toBe(false);
  });
});

describe('bounded source orchestration (offline fetch mocks)', () => {
  function freeze(at = now) {
    vi.useFakeTimers();
    vi.setSystemTime(at);
    vi.stubEnv('TUSHARE_TOKEN', '');
    vi.stubEnv('TS_TOKEN', '');
  }
  it('at 15:05 domestic Sina goes first for today A and already-complete overnight US', async () => {
    freeze(new Date('2026-11-11T15:05:00+08:00'));
    const mock = vi.fn(async (input: string | URL | Request) => new Response(String(input).includes('sh600785') ? sinaA({ 31: '15:00:00' }) : sinaUs()));
    vi.stubGlobal('fetch', mock);
    const quotes = await fetchUnifiedCloseQuotes(['600785.SH', 'AAOI'], { A: '2026-11-11', US: '2026-11-10' });
    expect(quotes['600785.SH']).toMatchObject({ price: 11.75, currency: 'CNY', source: 'unified_close_sina', priceDate: '2026-11-11' });
    expect(quotes.AAOI).toMatchObject({ price: 48.32, source: 'unified_close_sina', priceDate: '2026-11-10' });
    expect(mock).toHaveBeenCalledTimes(2);
    for (const [url, options] of mock.mock.calls as unknown as [string, RequestInit][]) {
      expect(url).toContain('https://hq.sinajs.cn/');
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it('rejects malformed Sina, preserves Tushare and retries both Yahoo hosts', async () => {
    freeze();
    vi.stubEnv('TUSHARE_TOKEN', 'offline-test-token');
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response(sinaUs({}, 'gb_crcl')))
      .mockRejectedValueOnce(new Error('tushare unavailable'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ chart: { result: null } })))
      .mockResolvedValueOnce(new Response(JSON.stringify(yahooUs('2026-11-10'))));
    vi.stubGlobal('fetch', mock);
    expect((await fetchUnifiedCloseQuotes(['AAOI'], '2026-11-10')).AAOI?.source).toBe('unified_close_yahoo');
    const urls = mock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain('hq.sinajs.cn');
    expect(urls[1]).toBe('https://api.tushare.pro');
    expect(urls[2]).toContain('query1.finance.yahoo.com');
    expect(urls[3]).toContain('query2.finance.yahoo.com');
  });
  it('retains Tushare exact-date daily close after unavailable Sina', async () => {
    freeze();
    vi.stubEnv('TUSHARE_TOKEN', 'offline-test-token');
    const mock = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { fields: ['ts_code', 'trade_date', 'close'], items: [['600785.SH', '20261111', 11.75]] } })));
    vi.stubGlobal('fetch', mock);
    expect((await fetchUnifiedCloseQuotes(['600785.SH'], '2026-11-11'))['600785.SH']?.source).toBe('unified_close_tushare');
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it('historical targets prefer daily providers and never fill gaps with recent Sina', async () => {
    freeze();
    vi.stubEnv('TUSHARE_TOKEN', 'offline-test-token');
    const mock = vi.fn().mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response(JSON.stringify(yahooUs('2026-11-10'))))
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response(sinaUs()));
    vi.stubGlobal('fetch', mock);
    expect(await fetchUnifiedCloseQuotes(['AAOI'], '2026-11-09')).toEqual({});
    const urls = mock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toBe('https://api.tushare.pro');
    expect(urls[1]).toContain('query1.finance.yahoo.com');
    expect(urls[2]).toContain('query2.finance.yahoo.com');
    expect(urls[3]).toContain('hq.sinajs.cn');
  });
  it('historical Yahoo proof returns immediately without consulting current Sina', async () => {
    freeze();
    const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(yahooUs('2026-11-09'))));
    vi.stubGlobal('fetch', mock);
    expect((await fetchUnifiedCloseQuotes(['AAOI'], '2026-11-09')).AAOI?.priceDate).toBe('2026-11-09');
    expect(mock).toHaveBeenCalledTimes(1);
    expect(String(mock.mock.calls[0][0])).toContain('query1.finance.yahoo.com');
  });
  it('will not request an uncompleted current NY session despite same Beijing day', async () => {
    freeze();
    const mock = vi.fn();
    vi.stubGlobal('fetch', mock);
    await expect(fetchUnifiedCloseQuotes(['AAOI'], '2026-11-11')).rejects.toThrow('尚未收盘');
    expect(mock).not.toHaveBeenCalled();
  });
  it('all source failures return missing evidence rather than throwing or guessing', async () => {
    freeze();
    const mock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', mock);
    expect(await fetchUnifiedCloseQuotes(['600785.SH', 'AAOI'], { A: '2026-11-11', US: '2026-11-10' })).toEqual({});
    expect(mock).toHaveBeenCalledTimes(6);
  });
  it('caps in-flight quote requests at four workers and deduplicates symbols', async () => {
    freeze();
    let active = 0, maxActive = 0;
    const mock = vi.fn(async (input: string | URL | Request) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      // Yield several microtasks so the first four workers all enter before completion.
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      const variable = /list=(gb_[a-z0-9]+)/.exec(String(input))![1];
      active -= 1;
      return new Response(sinaUs({}, variable));
    });
    vi.stubGlobal('fetch', mock);
    const symbols = ['AAOI', 'CRCL', 'MSTR', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMD', 'AAOI'];
    expect(Object.keys(await fetchUnifiedCloseQuotes(symbols, '2026-11-10'))).toHaveLength(8);
    expect(mock).toHaveBeenCalledTimes(8);
    expect(maxActive).toBe(4);
    expect(active).toBe(0);
  });
});
