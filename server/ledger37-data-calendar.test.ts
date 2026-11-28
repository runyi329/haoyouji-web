import { describe, expect, it } from 'vitest';
import type { Ledger37DataTag } from '../shared/ledger37-data-management';
import {
  ledger37CalendarMonth,
  ledger37MemberReturnCurve,
} from '../shared/ledger37-data-calendar';

function tag(
  name: string,
  startDate: string | null,
  points: Ledger37DataTag['points'],
  overrides: Partial<Ledger37DataTag> = {},
): Ledger37DataTag {
  return {
    categoryId: 1,
    name,
    accountingMode: 'manual_balance',
    startDate,
    status: 'active',
    totalPnl: null,
    asOf: null,
    dailyPnl: null,
    dailyDate: null,
    notice: null,
    points,
    ...overrides,
  };
}

describe('ledger37CalendarMonth', () => {
  it('uses UTC Monday as the first column and handles leap years', () => {
    expect(ledger37CalendarMonth('2024-02')).toEqual({
      leadingEmpty: 3,
      days: Array.from({ length: 29 }, (_, index) => ({
          date: `2024-02-${String(index + 1).padStart(2, '0')}`,
          day: index + 1,
        })),
    });
  });

  it('rejects non-YYYY-MM and out-of-range months', () => {
    expect(() => ledger37CalendarMonth('2024-2')).toThrow(RangeError);
    expect(() => ledger37CalendarMonth('1899-12')).toThrow(RangeError);
    expect(() => ledger37CalendarMonth('2201-01')).toThrow(RangeError);
    expect(() => ledger37CalendarMonth('2024-13')).toThrow(RangeError);
    expect(() => ledger37CalendarMonth('2024-00')).toThrow(RangeError);
  });

  it('returns correct month length at boundaries', () => {
    expect(ledger37CalendarMonth('1900-02').days).toHaveLength(28);
    expect(ledger37CalendarMonth('2000-02').days).toHaveLength(29);
    expect(ledger37CalendarMonth('2200-02').days).toHaveLength(28);
  });
});

describe('ledger37MemberReturnCurve', () => {
  it('unions point dates, carries latest confirmed totals, and never sums dailyPnl', () => {
    const result = ledger37MemberReturnCurve([
      tag('基金', '2024-01-01', [
        { date: '2024-01-01', totalPnl: 10, dailyPnl: 10 },
        { date: '2024-01-03', totalPnl: 15, dailyPnl: 5 },
      ]),
      tag('股票', null, [
        { date: '2024-01-02', totalPnl: 7, dailyPnl: 70 },
      ]),
    ]);

    expect(result).toEqual([
      { date: '2024-01-01', totalPnl: null, verifiedSubtotal: 10, pendingTagNames: ['股票'] },
      { date: '2024-01-02', totalPnl: 17, verifiedSubtotal: 17, pendingTagNames: [] },
      { date: '2024-01-03', totalPnl: 22, verifiedSubtotal: 22, pendingTagNames: [] },
    ]);
  });

  it('excludes tags before startDate, keeps paused history, and leaves unknown-start gaps pending', () => {
    const result = ledger37MemberReturnCurve([
      tag('未来标签', '2024-01-03', [
        { date: '2024-01-01', totalPnl: 99, dailyPnl: 99 },
        { date: '2024-01-03', totalPnl: 5, dailyPnl: 5 },
      ]),
      tag('暂停标签', '2024-01-01', [
        { date: '2024-01-01', totalPnl: 4, dailyPnl: 4 },
      ], { status: 'paused', pausePeriods: [{ pauseDate: '2024-01-02' }] }),
      tag('未知开始', null, []),
    ]);

    expect(result).toEqual([
      { date: '2024-01-01', totalPnl: null, verifiedSubtotal: 4, pendingTagNames: ['未知开始'] },
      { date: '2024-01-03', totalPnl: null, verifiedSubtotal: 9, pendingTagNames: ['未知开始'] },
    ]);
  });

  it('treats latest duplicate null as explicit missing evidence and does not fall back', () => {
    const result = ledger37MemberReturnCurve([
      tag('重复点', '2024-01-01', [
        { date: '2024-01-01', totalPnl: 8, dailyPnl: 8 },
        { date: '2024-01-02', totalPnl: 12, dailyPnl: 4 },
        { date: '2024-01-02', totalPnl: null, dailyPnl: null },
        { date: '2024-01-03', totalPnl: 0, dailyPnl: 0 },
      ]),
      tag('真实零', '2024-01-01', [
        { date: '2024-01-01', totalPnl: 0, dailyPnl: 100 },
      ]),
    ]);

    expect(result).toEqual([
      { date: '2024-01-01', totalPnl: 8, verifiedSubtotal: 8, pendingTagNames: [] },
      { date: '2024-01-02', totalPnl: null, verifiedSubtotal: 0, pendingTagNames: ['重复点'] },
      { date: '2024-01-03', totalPnl: 0, verifiedSubtotal: 0, pendingTagNames: [] },
    ]);
  });

  it('does not pick a winner from duplicate valid points or null followed by valid', () => {
    const result = ledger37MemberReturnCurve([
      tag('重复有效值', '2024-01-01', [
        { date: '2024-01-01', totalPnl: 8, dailyPnl: 8 },
        { date: '2024-01-01', totalPnl: 12, dailyPnl: 12 },
      ]),
      tag('缺值后有效', '2024-01-01', [
        { date: '2024-01-01', totalPnl: null, dailyPnl: null },
        { date: '2024-01-01', totalPnl: 20, dailyPnl: 20 },
      ]),
    ]);
    expect(result).toEqual([
      { date: '2024-01-01', totalPnl: null, verifiedSubtotal: null, pendingTagNames: ['重复有效值', '缺值后有效'] },
    ]);
  });

  it('returns null subtotal when no participating tag has confirmed data', () => {
    expect(ledger37MemberReturnCurve([
      tag('待确认', '2024-01-01', [
        { date: '2024-01-02', totalPnl: null, dailyPnl: 50 },
      ]),
    ])).toEqual([
      { date: '2024-01-02', totalPnl: null, verifiedSubtotal: null, pendingTagNames: ['待确认'] },
    ]);
  });
});
