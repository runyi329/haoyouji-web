import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __stockUsdCnyTest,
  captureStockUsdCnyBeforeClose,
  fetchStockUsdCnyAtClose,
  getLiveStockUsdCnyQuote,
  parseStockUsdCnyHistory,
  parseStockUsdCnySina,
} from './stock-usd-cny-rate';

const at = (value: string) => new Date(`${value}+08:00`);
const sinaAt = (date: string, time: string, rate = 6.6673) =>
  `var hq_str_USDCNY="${time},${rate},6.6674,6.6748,47,6.6711,6.6718,6.6671,6.6673,美元人民币,${date}";`;
const sina = sinaAt('2026-11-10', '16:52:00');
const yahoo = (bars: Array<[string, number]>) => ({ chart: { result: [{ meta: { symbol: 'CNY=X', currency: 'CNY', instrumentType: 'CURRENCY', dataGranularity: '5m' }, timestamp: bars.map(([start]) => Math.floor(Date.parse(`${start}+08:00`) / 1000)), indicators: { quote: [{ close: bars.map(([, close]) => close) }] } }] } });
const clock = (time: string) => { vi.useFakeTimers(); vi.setSystemTime(at(time)); };
const historyResponse = (rate = 6.62) => Response.json(yahoo([['2026-11-10T15:00:00', rate]]));
const closePoint = (rate: number, asOf: string, source = 'sina_usdcny') => ({
  snapshotDate: '2026-11-10', usdCnyRate: rate, asOf, source, pair: 'USD/CNY', lockedAt: '2026-11-10T15:05:00+08:00',
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  __stockUsdCnyTest.reset();
});

describe('stock USD/CNY rate (offline)', () => {
  it('parses the real Sina GBK-shaped USDCNY payload', () => {
    expect(parseStockUsdCnySina(sina, at('2026-11-10T16:53:00'))).toEqual({
      rate: 6.6673, asOf: '2026-11-10T08:52:00.000Z', source: 'sina_usdcny', pair: 'USD/CNY', stale: false,
    });
  });
  it('accepts bytes and rejects missing/invalid date, time, or rate', () => {
    expect(parseStockUsdCnySina(new TextEncoder().encode(sina), at('2026-11-10T16:53:00'))?.rate).toBe(6.6673);
    expect(parseStockUsdCnySina(sina.replace('2026-11-10', '2026-02-30'), at('2026-11-10T16:53:00'))).toBeNull();
    expect(parseStockUsdCnySina(sina.replace('16:52:00', '25:52:00'), at('2026-11-10T16:53:00'))).toBeNull();
    expect(parseStockUsdCnySina(sina.replace('6.6673', 'USDT'), at('2026-11-10T16:53:00'))).toBeNull();
    expect(parseStockUsdCnySina(sina.replace('USDCNY', 'USDCNH'), at('2026-11-10T16:53:00'))).toBeNull();
  });
  it('rejects a future Sina quote instead of inventing a default', () => {
    expect(parseStockUsdCnySina(sina, at('2026-11-10T16:51:00'))).toBeNull();
  });
  it('locks the last closed 5m bar at 15:05, whose close is start plus 300 seconds', () => {
    const payload = yahoo([
      ['2026-11-10T14:55:00', 6.61], ['2026-11-10T15:00:00', 6.62], ['2026-11-10T15:05:00', 6.63],
    ]);
    expect(parseStockUsdCnyHistory(payload, ['2026-11-10'], at('2026-11-10T15:05:00'))).toEqual([
      closePoint(6.62, '2026-11-10T07:05:00.000Z', 'yahoo_usdcny_5m'),
    ]);
    expect(parseStockUsdCnyHistory(payload, ['2026-11-10'], at('2026-11-10T15:04:59'))[0]?.usdCnyRate).toBe(6.61);
  });
  it('does not use a bar that closes after the cutoff', () => {
    expect(parseStockUsdCnyHistory(yahoo([['2026-11-10T15:05:00', 6.63]]), ['2026-11-10'], at('2026-11-10T15:10:00'))).toEqual([]);
  });
  it('allows a 14:35 close but not a 14:30 close or non-5m timestamp', () => {
    expect(parseStockUsdCnyHistory(yahoo([['2026-11-10T14:30:00', 6.6]]), ['2026-11-10'], at('2026-11-10T15:05:00'))[0]?.asOf).toBe('2026-11-10T06:35:00.000Z');
    for (const start of ['2026-11-10T14:25:00', '2026-11-10T14:59:59', '2026-11-10T14:30:01']) {
      expect(parseStockUsdCnyHistory(yahoo([[start, 6.6]]), ['2026-11-10'], at('2026-11-10T15:05:00'))).toEqual([]);
    }
  });
  it('rejects future bars and invalid closes', () => {
    expect(parseStockUsdCnyHistory(yahoo([['2026-11-10T14:55:00', 0], ['2026-11-10T14:55:00', 6.61]]), ['2026-11-10'], at('2026-11-10T14:58:00'))).toEqual([]);
    for (const value of [null, '6.6', NaN, Infinity, -1, 100]) {
      const payload = yahoo([['2026-11-10T15:00:00', value as number]]);
      expect(parseStockUsdCnyHistory(payload, ['2026-11-10'], at('2026-11-10T15:06:00'))).toEqual([]);
    }
    const payload = yahoo([['2026-11-10T15:00:00', 6.6]]);
    payload.chart.result[0].timestamp[0] = 9_000_000_000_000;
    expect(parseStockUsdCnyHistory(payload, ['2026-11-10'], at('2026-11-10T15:06:00'))).toEqual([]);
  });
  it('handles multiple A dates independently and ignores invalid dates', () => {
    const result = parseStockUsdCnyHistory(yahoo([
      ['2026-11-09T15:00:00', 6.5], ['2026-11-10T15:00:00', 6.6],
    ]), ['2026-11-09', 'bad', '2026-11-10'], at('2026-11-10T15:06:00'));
    expect(result.map(({ snapshotDate, usdCnyRate }) => [snapshotDate, usdCnyRate])).toEqual([['2026-11-09', 6.5], ['2026-11-10', 6.6]]);
    expect(parseStockUsdCnyHistory(yahoo([['2026-11-09T15:00:00', 6.5]]), ['2026-11-10'], at('2026-11-10T15:06:00'))).toEqual([]);
  });
  it('rejects malformed Yahoo chart data without throwing', () => {
    expect(parseStockUsdCnyHistory({ chart: { result: [] } }, ['2026-11-10'], at('2026-11-10T15:06:00'))).toEqual([]);
    expect(parseStockUsdCnyHistory('{bad json', ['2026-11-10'])).toEqual([]);
    expect(parseStockUsdCnyHistory(yahoo([]), ['2026-13-01'])).toEqual([]);
  });
  it.each([
    ['symbol', 'CNH=X'], ['symbol', 'USDCNY=X'], ['symbol', 'HKDCNY=X'],
    ['currency', 'USD'], ['instrumentType', 'EQUITY'], ['dataGranularity', '1m'], ['dataGranularity', '1d'],
  ])('rejects foreign pair or non-5m metadata: %s=%s', (key, value) => {
    const payload = yahoo([['2026-11-10T15:00:00', 6.6]]);
    Object.assign(payload.chart.result[0].meta, { [key]: value });
    expect(parseStockUsdCnyHistory(payload, ['2026-11-10'], at('2026-11-10T15:06:00'))).toEqual([]);
  });
  it('rejects future/invalid close dates before making any request', async () => {
    clock('2026-11-10T15:04:59');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    for (const date of ['2026-11-10', '2099-01-01', '2026-02-30']) {
      expect(await fetchStockUsdCnyAtClose(date)).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('coalesces concurrent Sina requests and caches for 30 seconds', async () => {
    clock('2026-11-10T16:53:00');
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(pending);
    const first = getLiveStockUsdCnyQuote();
    const second = getLiveStockUsdCnyQuote();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response(new TextEncoder().encode(sina), { status: 200 }));
    expect(await Promise.all([first, second])).toHaveLength(2);
    expect(await getLiveStockUsdCnyQuote()).toEqual(await first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('keeps the live API compatible and allows optional forceFresh', async () => {
    clock('2026-11-10T16:53:00');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sina))
      .mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '16:53:00', 6.68)));
    expect((await getLiveStockUsdCnyQuote())?.rate).toBe(6.6673);
    expect((await getLiveStockUsdCnyQuote())?.rate).toBe(6.6673);
    expect((await getLiveStockUsdCnyQuote(true))?.rate).toBe(6.68);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('returns last valid quote as stale after a later network failure', async () => {
    clock('2026-11-10T16:53:00');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sina)).mockRejectedValueOnce(new Error('offline'));
    expect((await getLiveStockUsdCnyQuote())?.stale).toBe(false);
    vi.advanceTimersByTime(30_001);
    expect((await getLiveStockUsdCnyQuote())?.stale).toBe(true);
  });
  it('uses a fresh Sina quote at 15:05 without requiring Yahoo history', async () => {
    clock('2026-11-10T15:05:00');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:05:00')));
    expect(await fetchStockUsdCnyAtClose('2026-11-10')).toEqual(closePoint(6.6673, '2026-11-10T07:05:00.000Z'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('hq.sinajs.cn');
  });
  it.each(['15:05:01', '15:30:00', '14:34:59'])('rejects Sina outside the close window: %s', async (time) => {
    clock('2026-11-10T15:05:01');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', time)))
      .mockResolvedValueOnce(historyResponse()).mockResolvedValueOnce(historyResponse(6.8));
    expect(await fetchStockUsdCnyAtClose('2026-11-10')).toEqual(closePoint(6.62, '2026-11-10T07:05:00.000Z', 'yahoo_usdcny_5m'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('accepts the exact 14:35 Sina boundary but not a foreign pair or prior date', async () => {
    clock('2026-11-10T15:05:00');
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '14:35:00')));
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.asOf).toBe('2026-11-10T06:35:00.000Z');
    for (const payload of [sinaAt('2026-11-09', '15:05:00'), sinaAt('2026-11-10', '15:05:00').replace('USDCNY', 'USDCNH')]) {
      __stockUsdCnyTest.reset();
      vi.mocked(fetch).mockReset().mockResolvedValueOnce(new Response(payload))
        .mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
      expect(await fetchStockUsdCnyAtClose('2026-11-10')).toBeNull();
    }
  });
  it('captures before close and preserves an earlier true quote when a later live quote is after cutoff', async () => {
    clock('2026-11-10T15:00:00');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:00:00', 6.61)))
      .mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:30:00', 6.9)));
    expect((await captureStockUsdCnyBeforeClose())?.rate).toBe(6.61);
    vi.setSystemTime(at('2026-11-10T15:30:00'));
    await getLiveStockUsdCnyQuote();
    expect(await fetchStockUsdCnyAtClose('2026-11-10')).toEqual(closePoint(6.61, '2026-11-10T07:00:00.000Z'));
    expect(await fetchStockUsdCnyAtClose('2026-11-10')).toEqual(closePoint(6.61, '2026-11-10T07:00:00.000Z'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('an ordinary live request also captures eligible evidence; stale fallback does not erase it', async () => {
    clock('2026-11-10T15:00:00');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:00:00')))
      .mockRejectedValueOnce(new Error('offline'));
    await getLiveStockUsdCnyQuote();
    vi.setSystemTime(at('2026-11-10T15:05:00'));
    expect((await getLiveStockUsdCnyQuote())?.stale).toBe(true);
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.source).toBe('sina_usdcny');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not promote a stale lastValid quote that was captured too late into close evidence', async () => {
    clock('2026-11-10T15:04:30');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '14:34:00')))
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(historyResponse());
    await getLiveStockUsdCnyQuote();
    vi.setSystemTime(at('2026-11-10T15:05:00'));
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.source).toBe('yahoo_usdcny_5m');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('does not remember a quote even one second ahead of its actual capture time', async () => {
    clock('2026-11-10T15:04:58');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:04:59')))
      .mockResolvedValueOnce(historyResponse());
    expect(await captureStockUsdCnyBeforeClose()).toBeNull();
    vi.setSystemTime(at('2026-11-10T15:06:00'));
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.source).toBe('yahoo_usdcny_5m');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('forces a close request instead of relying on an ineligible 30s page cache', async () => {
    clock('2026-11-10T15:04:58');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:05:01')))
      .mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:05:00')));
    await getLiveStockUsdCnyQuote();
    vi.setSystemTime(at('2026-11-10T15:05:02'));
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.asOf).toBe('2026-11-10T07:05:00.000Z');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('allows refresh through cutoff+30s but not capture after that boundary', async () => {
    clock('2026-11-10T15:05:30');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:05:00')));
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.source).toBe('sina_usdcny');
    __stockUsdCnyTest.reset();
    vi.setSystemTime(at('2026-11-10T15:05:29'));
    fetchMock.mockReset().mockImplementationOnce(async () => {
      vi.setSystemTime(at('2026-11-10T15:05:31'));
      return new Response(sinaAt('2026-11-10', '15:05:00'));
    }).mockResolvedValueOnce(historyResponse());
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.source).toBe('yahoo_usdcny_5m');
  });
  it('never fetches late live Sina to reconstruct a missing 15:05 quote', async () => {
    clock('2026-11-10T15:30:00');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(historyResponse());
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.source).toBe('yahoo_usdcny_5m');
    expect(String(fetchMock.mock.calls[0][0])).toContain('query1.finance.yahoo.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['network', 'http', 'invalid', 'json'])('query1 failure (%s) falls back to query2 strict 5m history', async (failure) => {
    clock('2026-11-10T15:30:00');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'));
    if (failure === 'http') fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    if (failure === 'invalid') fetchMock.mockResolvedValueOnce(Response.json(yahoo([['2026-11-10T15:05:00', 6.9]])));
    if (failure === 'json') fetchMock.mockResolvedValueOnce(new Response('{bad json'));
    fetchMock.mockResolvedValueOnce(historyResponse());
    expect(await fetchStockUsdCnyAtClose('2026-11-10')).toEqual(closePoint(6.62, '2026-11-10T07:05:00.000Z', 'yahoo_usdcny_5m'));
    expect(String(fetchMock.mock.calls[0][0])).toContain('query1.finance.yahoo.com');
    expect(String(fetchMock.mock.calls[1][0])).toContain('query2.finance.yahoo.com');
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes('interval=5m'))).toBe(true);
  });
  it('returns null when both Yahoo hosts fail rather than using a fixed or current quote', async () => {
    clock('2026-11-10T15:30:00');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await fetchStockUsdCnyAtClose('2026-11-10')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects a foreign pair from both hosts on the same date', async () => {
    clock('2026-11-10T15:30:00');
    const payload = yahoo([['2026-11-10T15:00:00', 6.9]]);
    payload.chart.result[0].meta.symbol = 'CNH=X';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(payload));
    expect(await fetchStockUsdCnyAtClose('2026-11-10')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('sampling outside the same-day pre-close window is a no-op and cannot fake capture time', async () => {
    clock('2026-11-10T15:30:00');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:00:00')))
      .mockResolvedValueOnce(historyResponse());
    expect(await captureStockUsdCnyBeforeClose()).toBeNull();
    expect(await captureStockUsdCnyBeforeClose(at('2026-11-10T14:34:59'))).toBeNull();
    expect(await captureStockUsdCnyBeforeClose(new Date(NaN))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await captureStockUsdCnyBeforeClose(at('2026-11-10T15:00:00'))).toBeNull();
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.source).toBe('yahoo_usdcny_5m');
  });
  it('bounds memory to two days and never mixes dates', async () => {
    clock('2026-11-09T15:00:00');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sinaAt('2026-11-09', '15:00:00', 6.5)))
      .mockResolvedValueOnce(new Response(sinaAt('2026-11-10', '15:00:00', 6.6)))
      .mockResolvedValueOnce(new Response(sinaAt('2026-11-11', '15:00:00', 6.8)))
      .mockRejectedValue(new Error('offline'));
    await captureStockUsdCnyBeforeClose();
    vi.setSystemTime(at('2026-11-10T15:00:00'));
    await captureStockUsdCnyBeforeClose();
    vi.setSystemTime(at('2026-11-10T15:30:00'));
    expect((await fetchStockUsdCnyAtClose('2026-11-09'))?.usdCnyRate).toBe(6.5);
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.usdCnyRate).toBe(6.6);
    vi.setSystemTime(at('2026-11-11T15:00:00'));
    await captureStockUsdCnyBeforeClose();
    vi.setSystemTime(at('2026-11-11T15:30:00'));
    expect(await fetchStockUsdCnyAtClose('2026-11-09')).toBeNull();
    expect((await fetchStockUsdCnyAtClose('2026-11-10'))?.usdCnyRate).toBe(6.6);
    expect((await fetchStockUsdCnyAtClose('2026-11-11'))?.usdCnyRate).toBe(6.8);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
