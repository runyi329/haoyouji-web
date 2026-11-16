import { describe, expect, it } from 'vitest';
import { cryptoDecimal } from './shared/crypto-portfolio-decimal';
import { buildCryptoPortfolioDailyPayload, type CryptoCalendarInput } from './shared/crypto-portfolio-calendar';

// Synthetic offline fixtures only; no DB, trading scanner or application imports.
const date = '2026-11-16', symbol = 'CRYPTO:BTC-USDT';
function fixture(quantity = 1, entryPrice = 100, quotePrice = 110, rate = 7.19): CryptoCalendarInput {
  return {
    categoryId: 81, snapshotDate: date, activationDate: date, now: new Date(`${date}T16:00:00+08:00`),
    lots: [{ id: 1, symbol, initialQuantity: quantity, unitCost: entryPrice, openingFee: 0,
      openedDate: date, actualTradedAt: `${date}T14:00:00+08:00`, registeredAt: `${date}T14:00:01+08:00` }],
    sales: [], closures: [], participations: [],
    observations: [{ lotId: 1, userId: 99, quantity, entryPrice, startDate: date, pauseDate: null,
      assignedAt: `${date}T14:00:00+08:00`, updatedAt: `${date}T14:00:00+08:00` }],
    quotes: [{ symbol, price: quotePrice, currency: 'USDT', priceDate: date, source: 'crypto_close_gate_1505',
      updatedAt: `${date}T15:05:03+08:00`, cutoffAt: `${date}T15:05:00+08:00` }],
    usdtFx: { snapshotDate: date, usdtCnyRate: rate, pair: 'USDT/CNY',
      source: 'bridge_coinbase_usdt_usd_spot_close_1505_x_yahoo_usdcny_5m', asOf: `${date}T15:04:00+08:00`,
      lockedAt: `${date}T15:05:00+08:00`, carried: false, forexSnapshotDate: date,
      usdCnyRate: rate, usdCnyAsOf: `${date}T15:04:00+08:00`, usdCnySource: 'yahoo_usdcny_5m',
      usdtUsdRate: 1, usdtUsdAsOf: `${date}T15:05:00+08:00`, usdtUsdSource: 'coinbase_usdt_usd_spot_close_1505',
      observedAt: `${date}T15:05:03+08:00` }, usdFx: null,
  };
}

describe('crypto snapshot exact decimal arithmetic', () => {
  it.each([
    [0.1, 0.2, 0.3], [1e-8, 2e-8, 3e-8], [-0.1, -0.2, -0.3], [1e18, 1, 1e18],
  ])('adds decimal inputs %s and %s without binary intermediates', (a, b, expected) => {
    expect(cryptoDecimal(a).plus(b).toNumber()).toBe(expected);
  });
  it('keeps a unit lost by a large Number addition until the API boundary', () => {
    expect(cryptoDecimal(1e18).plus(1).minus(1e18).toNumber()).toBe(1);
  });
  it('preserves exact tiny differences and scientific decimal inputs', () => {
    expect(cryptoDecimal(0.3).minus(0.29999999).toNumber()).toBe(1e-8);
    expect(cryptoDecimal('1.23e-20').times(1e10).toNumber()).toBe(1.23e-10);
    expect(cryptoDecimal('1e-320').toNumber()).toBe(1e-320);
  });
  it('preserves proportional fractions instead of rounding them to a coin quantum', () => {
    expect(cryptoDecimal(1).dividedBy(3).times(3).toNumber()).toBe(1);
    expect(cryptoDecimal(0.3).dividedBy(7).times(7).toNumber()).toBe(0.3);
  });
  it('rejects nonfinite or malformed values and division by zero', () => {
    for (const n of [Infinity, -Infinity, NaN]) expect(() => cryptoDecimal(n)).toThrow('invalid_crypto_decimal');
    expect(() => cryptoDecimal('not-a-number')).toThrow('invalid_crypto_decimal');
    expect(() => cryptoDecimal(1).dividedBy(0)).toThrow('divisor');
  });
  it.each([100.005, 99.995])('returns exact half-cent PnL for close %s', price => {
    const payload = buildCryptoPortfolioDailyPayload(fixture(1, 100, price, 1));
    const expected = price > 100 ? 0.005 : -0.005;
    expect(payload.total.totalPnl).toBe(expected);
    expect(payload.observations['99'].totalPnl).toBe(-expected);
    expect(payload.total.totalPnl!.toFixed(2)).toBe(expected > 0 ? '0.01' : '-0.01');
    expect(Math.abs(payload.total.totalPnl!).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe('0.01');
  });
  it('does not subtract two huge rounded CNY market/cost amounts to derive a tiny PnL', () => {
    const payload = buildCryptoPortfolioDailyPayload(fixture(100000, 99999.99999999, 100000));
    expect(payload.total.nativePnl.USDT).toBe(0.001);
    expect(payload.total.floatingPnl).toBe(0.00719);
    expect(payload.total.totalPnl).toBe(0.00719);
    expect(payload.observations['99'].totalPnl).toBe(-0.00719);
  });
  it.each([[3e-8, 2e-8], [0.3, 0.29999999]])('preserves the exact observation quantum after %s minus %s', (initial, sold) => {
    const input = fixture(initial);
    input.sales = [{ lotId: 1, quantity: sold, salePrice: 100, eventQuantity: sold, transactionFee: null, closeDate: date }];
    const result = buildCryptoPortfolioDailyPayload(input).observations['99'];
    expect(result).toMatchObject({ ready: true, positionCount: 1, marketValue: 0.000007909, totalPnl: -0.000000719 });
    input.quotes = [];
    expect(buildCryptoPortfolioDailyPayload(input).observations['99']).toMatchObject({ ready: false, positionCount: 1, marketValue: null, totalPnl: null, missingSymbols: [symbol] });
  });
  it('does not round a proportional observation estimate to eight places', () => {
    const input = fixture(3, 100, 110, 1); input.observations![0].quantity = 1;
    input.sales = [{ lotId: 1, quantity: 1, salePrice: 100, eventQuantity: 1, transactionFee: null, closeDate: date }];
    const result = buildCryptoPortfolioDailyPayload(input).observations['99'];
    expect(result.marketValue).toBeCloseTo(73.33333333333333, 12);
    expect(result.totalPnl).toBeCloseTo(-6.666666666666667, 12);
  });
});

describe('crypto historical allocation future-start guard', () => {
  it('checks late updatedAt before skipping a future member start date', () => {
    const input = fixture(); input.observations = [];
    input.participations = [{ id: 11, lotId: 1, userId: 28, allocatedQuantity: 0.5, remainingQuantity: 0.5, entryPrice: 100,
      startDate: '2026-11-17', pauseDate: null, assignedAt: `${date}T14:00:00+08:00`, updatedAt: `${date}T16:00:00+08:00` }];
    expect(() => buildCryptoPortfolioDailyPayload(input)).toThrow('unverifiable_allocation_history');
  });
  it('does not falsely reject a future start configured before the cutoff', () => {
    const input = fixture(); input.observations = [];
    input.participations = [{ id: 11, lotId: 1, userId: 28, allocatedQuantity: 0.5, remainingQuantity: 0.5, entryPrice: 100,
      startDate: '2026-11-17', pauseDate: null, assignedAt: `${date}T14:00:00+08:00`, updatedAt: `${date}T14:00:00+08:00` }];
    expect(buildCryptoPortfolioDailyPayload(input).members['28']).toMatchObject({ ready: true, positionCount: 0, totalPnl: 0 });
  });
  it.each([0, 1])('checks late observation edits even if new quantity is %s or start is tomorrow', quantity => {
    const input = fixture(); input.observations![0].quantity = quantity;
    input.observations![0].startDate = '2026-11-17'; input.observations![0].updatedAt = `${date}T16:00:00+08:00`;
    expect(() => buildCryptoPortfolioDailyPayload(input)).toThrow('unverifiable_observation_history');
  });
  it('does not block the old day for a genuinely new future member created after cutoff', () => {
    const input = fixture(); input.observations = [];
    input.participations = [{ id: 11, lotId: 1, userId: 28, allocatedQuantity: 0.5, remainingQuantity: 0.5, entryPrice: 100,
      startDate: '2026-11-17', pauseDate: null, assignedAt: `${date}T16:00:00+08:00`, updatedAt: `${date}T16:00:00+08:00` }];
    const payload = buildCryptoPortfolioDailyPayload(input);
    expect(payload.total.ready).toBe(true);
    expect(payload.members['28']).toMatchObject({ ready: true, positionCount: 0, totalPnl: 0 });
  });
  it('does not block the old day for a genuinely new future observation created after cutoff', () => {
    const input = fixture(); input.observations![0].startDate = '2026-11-17';
    input.observations![0].assignedAt = `${date}T16:00:00+08:00`; input.observations![0].updatedAt = `${date}T16:00:00+08:00`;
    const payload = buildCryptoPortfolioDailyPayload(input);
    expect(payload.total.ready).toBe(true);
    expect(payload.observations['99']).toMatchObject({ ready: true, positionCount: 0, totalPnl: 0 });
  });
});
