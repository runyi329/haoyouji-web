import { describe, expect, it } from 'vitest';
import {
  selectFunderHistoricalDisplay, parseFunderHistoricalRecord, readFunderHistoricalNumber,
  readFunderHistoricalOptionQuote, hasValidFunderHistoricalGreeks, getFunderUnknownEstimateText,
  createFunderDisplayFormatter, getFunderRegisteredPaidDisplay, getFunderRegisteredCommissionDisplay,
  getFunderRegisteredCurrencyUnit,
} from '../shared/funder-settled-display';

// Synthetic fixtures belong only to offline tests, never the application UI.
const v1 = { version: 1, usdtCnyRate: 7, priceBySymbol: { ETH: 2000 }, capturedAt: '2020-01-01T00:00:00Z' };
const v2 = { ...v1, version: 2, optionQuote: { markPriceUsdt: 25, indexPriceUsdt: 2000,
  delta: 0.5, gamma: 0.01, theta: -2, vega: 3, iv: 0.4, instrumentName: 'TEST-ONLY' } };

describe('historical source selection is read-only, scope-exact and version-independent', () => {
  it.each([null, undefined, '', '{broken', 'null', '[]', []])('missing %s is unknown while status remains frozen', settlement_snapshot => {
    const selected = selectFunderHistoricalDisplay({ status: 'settled', settlement_snapshot });
    expect(selected.frozen).toBe(true); expect(selected.snapshot).toBeNull();
  });
  it.each([v1, JSON.stringify(v1), v2, JSON.stringify(v2)])('reads valid string/object v1/v2 without freshness checks', snapshot => {
    const order = Object.freeze({ status: 'completed', settlement_snapshot: snapshot });
    const before = JSON.stringify(order);
    expect(selectFunderHistoricalDisplay(order).snapshot?.usdtCnyRate).toBe(7);
    expect(JSON.stringify(order)).toBe(before);
  });
  it.each([false, true])('primary wrapper object/string keeps its own source (serialized=%s)', serialized => {
    const primary = { status: 'SETTLED', settlement_snapshot: JSON.stringify({ ...v2, usdtCnyRate: 8 }) };
    const order = { status: 'active', settlement_snapshot: v1, joint_order_primary_settlement: serialized ? JSON.stringify(primary) : primary };
    expect(selectFunderHistoricalDisplay(order).snapshot?.usdtCnyRate).toBe(8);
    expect(selectFunderHistoricalDisplay(order).frozen).toBe(true);
    expect(selectFunderHistoricalDisplay(order, true).snapshot?.usdtCnyRate).toBe(7);
  });
  it('explicit missing primary/personal/child never borrows a different scope', () => {
    const parent = { status: 'settled', settlement_snapshot: v2, joint_order_primary_settlement: { status: 'completed', settlement_snapshot: null } };
    expect(selectFunderHistoricalDisplay(parent).snapshot).toBeNull();
    expect(selectFunderHistoricalDisplay({ ...parent, settlement_snapshot: null }, true).snapshot).toBeNull();
    expect(selectFunderHistoricalDisplay({ status: 'settled', participantInfo: { userId: 2 }, settlement_snapshot: null }).snapshot).toBeNull();
  });
  it('running order is not frozen merely because an old snapshot is present', () => {
    expect(selectFunderHistoricalDisplay({ status: 'active', settlement_snapshot: v2 }).frozen).toBe(false);
  });
});

describe('FX, option mark and Greeks are separate historical evidence', () => {
  it('v1 FX is usable even with no optionQuote/Greeks', () => {
    expect(parseFunderHistoricalRecord(JSON.stringify(v1))?.usdtCnyRate).toBe(7);
    expect(readFunderHistoricalOptionQuote(v1)).toBeNull();
    expect(hasValidFunderHistoricalGreeks(readFunderHistoricalOptionQuote(v1))).toBe(false);
  });
  it('full v2 retains all saved values', () => {
    const quote = readFunderHistoricalOptionQuote(JSON.stringify(v2));
    expect(quote).toMatchObject({ markPrice: 25, delta: 0.5, theta: -2, iv: 0.4 });
    expect(hasValidFunderHistoricalGreeks(quote)).toBe(true);
  });
  it.each([0, '0'])('zero mark %s is valid, not proof of saved Greeks', markPriceUsdt => {
    const quote = readFunderHistoricalOptionQuote({ optionQuote: { markPriceUsdt } });
    expect(quote?.markPrice).toBe(0); expect(hasValidFunderHistoricalGreeks(quote)).toBe(false);
  });
  it.each(['delta', 'gamma', 'theta', 'vega', 'iv'])('a single genuine zero %s is valid history', key => {
    const quote = readFunderHistoricalOptionQuote({ optionQuote: { markPriceUsdt: null, [key]: 0 } });
    expect(quote?.markPrice).toBeNull(); expect(hasValidFunderHistoricalGreeks(quote)).toBe(true);
  });
  it.each([null, undefined, '', ' ', NaN, Infinity, -Infinity, false, [], {}])('rejects unknown %s instead of zero', value => {
    expect(readFunderHistoricalNumber(value)).toBeNull();
    const quote = readFunderHistoricalOptionQuote({ optionQuote: { markPriceUsdt: value, delta: value, iv: value } });
    expect(quote?.markPrice).toBeNull(); expect(hasValidFunderHistoricalGreeks(quote)).toBe(false);
  });
  it('negative mark is invalid while negative theta is preserved', () => {
    expect(readFunderHistoricalOptionQuote({ optionQuote: { markPriceUsdt: -1, theta: -1 } })).toMatchObject({ markPrice: null, theta: -1 });
  });
  it('missing FX means not-saved in history, pending only when running', () => {
    expect(getFunderUnknownEstimateText(true, null)).toBe('未保存结算汇率');
    expect(getFunderUnknownEstimateText(true, 7)).toBe('未保存结算估值');
    expect(getFunderUnknownEstimateText(false, null)).toBe('汇率/估值待更新');
    const format = createFunderDisplayFormatter(true, null);
    expect(format(NaN, 'toFixed', 2)).toBe('未保存结算汇率');
    expect(format(null, 'toLocaleString')).toBe('未保存结算汇率');
    expect(format(0, 'toFixed', 2)).toBe('0.00'); expect(format(125, 'toFixed', 2)).toBe('125.00');
  });
});

describe('registered original currency survives missing FX without changing converted risk values', () => {
  it.each(['CNY', 'U', 'ETH'])('keeps registered %s payment if alternate valuation is unknown', currency => {
    const paid = Object.freeze({ amount: '125', currency });
    const row = getFunderRegisteredPaidDisplay(paid, 'USDT', NaN, currency === 'CNY' ? 'USDT' : 'CNY');
    expect(row.value).toBe(125); expect(row.currency).toBe(currency === 'U' ? 'USDT' : currency);
    expect(row.nativeFallback).toBe(true); expect(paid.amount).toBe('125');
  });
  it('explicit paid currency is authoritative for same-currency display', () => {
    expect(getFunderRegisteredPaidDisplay({ amount: 125, currency: 'CNY' }, 'USDT', 875, 'CNY')).toMatchObject({ value: 125, currency: 'CNY' });
  });
  it('keeps existing finite alternate display and legacy base-currency compatibility', () => {
    expect(getFunderRegisteredPaidDisplay({ amount: 125, currency: 'CNY' }, 'CNY', 25, 'USDT').value).toBe(25);
    expect(getFunderRegisteredPaidDisplay({ amount: 125 }, 'CNY', NaN, 'USDT')).toMatchObject({ value: 125, currency: 'CNY' });
  });
  it('invalid payment is not zero and legal zero remains visible', () => {
    expect(getFunderRegisteredPaidDisplay({ amount: null, currency: 'CNY' }, 'CNY', NaN, 'USDT').value).toBeNaN();
    expect(getFunderRegisteredPaidDisplay({ amount: 0, currency: 'CNY' }, 'CNY', NaN, 'USDT').value).toBe(0);
  });
  it('registered commission ignores absent mark/FX and does not derive from a percentage', () => {
    const order = { status: 'settled', settlement_snapshot: null, commission_share: '利润分成50%', participantInfo: { paidCommission: '125', interestBaseCurrency: 'CNY' } };
    expect(getFunderRegisteredCommissionDisplay(order)).toEqual({ value: 125, currency: 'CNY' });
    expect(getFunderRegisteredCommissionDisplay({ participantInfo: { paidCommission: null } })).toBeNull();
    expect(getFunderRegisteredCommissionDisplay({ participantInfo: { paidCommission: '0' } })).toEqual({ value: 0, currency: null });
    expect(getFunderRegisteredCurrencyUnit(null)).toContain('币种未保存');
  });
});
