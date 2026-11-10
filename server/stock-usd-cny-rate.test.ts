import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __stockUsdCnyTest,
  fetchStockUsdCnyAtClose,
  getLiveStockUsdCnyQuote,
  parseStockUsdCnyHistory,
  parseStockUsdCnySina,
} from './stock-usd-cny-rate';

const at = (value: string) => new Date(`${value}+08:00`);
const sina = 'var hq_str_USDCNY="16:52:00,6.6673,6.6674,6.6748,47,6.6711,6.6718,6.6671,6.6673,美元人民币,2026-11-10";';
const yahoo = (bars: Array<[string, number]>) => ({ chart: { result: [{ meta: { symbol: 'CNY=X', currency: 'CNY', instrumentType: 'CURRENCY', dataGranularity: '5m' }, timestamp: bars.map(([start]) => Math.floor(Date.parse(`${start}+08:00`) / 1000)), indicators: { quote: [{ close: bars.map(([, close]) => close) }] } }] } });

afterEach(() => {
  vi.restoreAllMocks();
  __stockUsdCnyTest.reset();
});

describe('stock USD/CNY rate (offline)', () => {
  it('parses the real Sina GBK-shaped USDCNY payload', () => {
    expect(parseStockUsdCnySina(sina, at('2026-11-10T16:53:00'))).toEqual({
      rate: 6.6673, asOf: '2026-11-10T08:52:00.000Z', source: 'sina_usdcny', pair: 'USD/CNY', stale: false,
    });
  });
  it('accepts GBK bytes and rejects missing/invalid date, time, or rate', () => {
    expect(parseStockUsdCnySina(new TextEncoder().encode(sina), at('2026-11-10T16:53:00'))?.rate).toBe(6.6673);
    expect(parseStockUsdCnySina(sina.replace('2026-11-10', '2026-02-30'), at('2026-11-10T16:53:00'))).toBeNull();
    expect(parseStockUsdCnySina(sina.replace('16:52:00', '25:52:00'), at('2026-11-10T16:53:00'))).toBeNull();
    expect(parseStockUsdCnySina(sina.replace('6.6673', 'USDT'), at('2026-11-10T16:53:00'))).toBeNull();
  });
  it('rejects a future Sina quote instead of inventing a default', () => {
    expect(parseStockUsdCnySina(sina, at('2026-11-10T16:51:00'))).toBeNull();
  });
  it('locks the last closed 5m bar at 15:05, whose close is start plus 300 seconds', () => {
    const result = parseStockUsdCnyHistory(yahoo([
      ['2026-11-10T14:55:00', 6.61], ['2026-11-10T15:00:00', 6.62], ['2026-11-10T15:05:00', 6.63],
    ]), ['2026-11-10'], at('2026-11-10T15:06:00'));
    expect(result).toEqual([{ snapshotDate: '2026-11-10', usdCnyRate: 6.62, asOf: '2026-11-10T07:05:00.000Z', source: 'yahoo_usdcny_5m', pair: 'USD/CNY', lockedAt: '2026-11-10T15:05:00+08:00' }]);
  });
  it('does not use a bar that closes after the cutoff', () => {
    expect(parseStockUsdCnyHistory(yahoo([['2026-11-10T15:05:00', 6.63]]), ['2026-11-10'], at('2026-11-10T15:10:00'))).toEqual([]);
  });
  it('rejects bars more than 30 minutes before 15:05', () => {
    expect(parseStockUsdCnyHistory(yahoo([['2026-11-10T14:29:00', 6.6]]), ['2026-11-10'], at('2026-11-10T15:05:00'))).toEqual([]);
  });
  it('rejects future bars and invalid closes', () => {
    expect(parseStockUsdCnyHistory(yahoo([['2026-11-10T14:55:00', 0], ['2026-11-10T14:55:00', 6.61]]), ['2026-11-10'], at('2026-11-10T14:58:00'))).toEqual([]);
  });
  it('handles multiple A dates independently and ignores invalid dates', () => {
    const result = parseStockUsdCnyHistory(yahoo([
      ['2026-11-09T15:00:00', 6.5], ['2026-11-10T15:00:00', 6.6],
    ]), ['2026-11-09', 'bad', '2026-11-10'], at('2026-11-10T15:06:00'));
    expect(result.map(({ snapshotDate, usdCnyRate }) => [snapshotDate, usdCnyRate])).toEqual([['2026-11-09', 6.5], ['2026-11-10', 6.6]]);
  });
  it('rejects malformed Yahoo chart data without throwing', () => {
    expect(parseStockUsdCnyHistory({ chart: { result: [] } }, ['2026-11-10'], at('2026-11-10T15:06:00'))).toEqual([]);
  });
  it('rejects another currency pair or granularity rather than treating it as USD/CNY', () => {
    const payload = yahoo([['2026-11-10T15:00:00', 6.6]]);
    payload.chart.result[0].meta.symbol = 'CNH=X';
    expect(parseStockUsdCnyHistory(payload, ['2026-11-10'], at('2026-11-10T15:06:00'))).toEqual([]);
    expect(parseStockUsdCnyHistory('{bad json', ['2026-11-10'])).toEqual([]);
    expect(parseStockUsdCnyHistory(yahoo([]), ['2026-13-01'])).toEqual([]);
  });
  it('rejects future close dates before making a Yahoo request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect(await fetchStockUsdCnyAtClose('2099-01-01')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects invalid close dates before making a Yahoo request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect(await fetchStockUsdCnyAtClose('2026-02-30')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('coalesces concurrent Sina requests and caches for 30 seconds', async () => {
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
  it('returns last valid quote as stale after a later network failure', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(sina)).mockRejectedValueOnce(new Error('offline'));
    expect((await getLiveStockUsdCnyQuote())?.stale).toBe(false);
    vi.advanceTimersByTime(30_001);
    expect((await getLiveStockUsdCnyQuote())?.stale).toBe(true);
  });
});
