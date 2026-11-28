import { describe, expect, it } from 'vitest';
import { ledger37DisplayedMoneyValue, ledger37MoneyText, ledger37MoneyColor, ledger37CompactMoneyText, ledger37CompactMoneyColor } from '../client/src/lib/ledger37-money-display';

describe('ledger37 presentation-only money precision', () => {
  it.each([0, -0, -9.094947017729282e-13, -4.547473508864641e-13, 9.094947017729282e-13, -0.0049, 0.0049])('renders %s as unsigned neutral zero', value => {
    expect(ledger37MoneyText(value)).toBe('0.00');
    expect(ledger37MoneyColor(value)).toBe('#555');
    expect(Object.is(ledger37DisplayedMoneyValue(value), -0)).toBe(false);
  });
  it.each([[0.005, '+0.01', '#D32F2F'], [-0.005, '-0.01', '#388E3C'], [1.005, '+1.01', '#D32F2F'], [-1.005, '-1.01', '#388E3C']] as const)('preserves displayed cent boundary %s', (value, text, color) => {
    expect(ledger37MoneyText(value)).toBe(text);
    expect(ledger37MoneyColor(value)).toBe(color);
  });
  it.each([null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('does not fabricate zero for missing or invalid %s', value => {
    expect(ledger37MoneyText(value)).toBe('待更新');
    expect(ledger37MoneyColor(value)).toBe('#9E9E9E');
  });
  it.each([0, -0, -9.094947017729282e-13, 9.094947017729282e-13, -0.49, 0.49, -0.5])('aligns compact zero text and color for %s', value => {
    expect(ledger37CompactMoneyText(value)).toBe('0');
    expect(ledger37CompactMoneyColor(value)).toBe('#555');
  });
  it('preserves calendar nonzero signs, compact units, and expanded exact amount', () => {
    expect(ledger37CompactMoneyText(-0.51)).toBe('-1');
    expect(ledger37CompactMoneyColor(-0.51)).toBe('#388E3C');
    expect(ledger37CompactMoneyText(0.5)).toBe('+1');
    expect(ledger37CompactMoneyColor(0.5)).toBe('#D32F2F');
    expect(ledger37CompactMoneyText(12345)).toBe('1.23万');
    expect(ledger37CompactMoneyText(-12345)).toBe('-1.23万');
    expect(ledger37MoneyText(-0.49)).toBe('-0.49');
    expect(ledger37MoneyColor(-0.49)).toBe('#388E3C');
  });
  it('does not modify raw return data', () => {
    const raw = { dailyPnl: -9.094947017729282e-13 };
    ledger37MoneyText(raw.dailyPnl);
    ledger37MoneyColor(raw.dailyPnl);
    ledger37CompactMoneyText(raw.dailyPnl);
    expect(raw.dailyPnl).toBe(-9.094947017729282e-13);
  });
});
