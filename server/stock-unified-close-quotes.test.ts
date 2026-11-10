import { describe, expect, it } from 'vitest';
import { isUnifiedMarketCloseCompleted, marketSessionDateFromBeijingTradeTimestamp, parseYahooSessionClose } from './stock-unified-close-quotes';

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
    const timestamp = Date.parse('2026-11-09T14:30:00Z') / 1000;
    const payload = { chart: { result: [{ meta: { currency: 'USD' }, timestamp: [timestamp], indicators: { quote: [{ close: [59.27] }], adjclose: [{ adjclose: [1] }] } }] } };
    expect(parseYahooSessionClose(payload, 'US', '2026-11-09')).toMatchObject({ price: 59.27, priceDate: '2026-11-09', currency: 'USD', source: 'unified_close_yahoo' });
    expect(parseYahooSessionClose(payload, 'US', '2026-11-10')).toBeNull();
    expect(parseYahooSessionClose(payload, 'A', '2026-11-09')).toBeNull();
  });
});
