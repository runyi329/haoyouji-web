import { describe, expect, it } from 'vitest';
import { ledger37DataDailyRows, ledger37TagParticipatesOnDate, ledger37DataManagementPath, ledger37MemberConfigPath, type Ledger37DataTag } from '../shared/ledger37-data-management';
const tag = (id: number, patch: Partial<Ledger37DataTag> = {}): Ledger37DataTag => ({ categoryId: id, name: `标签${id}`, accountingMode: 'manual_balance', startDate: '2026-11-01', status: 'active', totalPnl: 10, asOf: '2026-11-27', dailyPnl: 1, dailyDate: '2026-11-27', notice: null, points: [], ...patch });
describe('37数据管理每日个人汇总', () => {
  it('只合计同日点，缺数据不补0', () => {
    const rows = ledger37DataDailyRows([tag(1, { points: [{ date: '2026-11-27', dailyPnl: 5, totalPnl: 8 }] }), tag(2, { points: [{ date: '2026-11-26', dailyPnl: -3, totalPnl: 4 }] })]);
    expect(rows[0].amount).toBeNull(); expect(rows[0].pending).toBe(1); expect(rows[0].parts[1].point).toBeUndefined();
    expect(rows[0].verifiedSubtotal).toBe(5);
  });
  it('真实0保留，可对正负回报完整合计', () => {
    const rows = ledger37DataDailyRows([tag(1, { points: [{ date: '2026-11-27', dailyPnl: 0, totalPnl: 0 }] }), tag(2, { points: [{ date: '2026-11-27', dailyPnl: -3, totalPnl: 4 }] })]);
    expect(rows[0].amount).toBe(-3); expect(rows[0].pending).toBe(0);
  });
  it('暂停日计入，暂停后不参与，恢复当日重新参与', () => {
    const paused = tag(1, { pausePeriods: [{ pauseDate: '2026-11-20', resumeDate: '2026-11-27' }] });
    expect(ledger37TagParticipatesOnDate(paused, '2026-11-20')).toBe(true);
    expect(ledger37TagParticipatesOnDate(paused, '2026-11-21')).toBe(false);
    expect(ledger37TagParticipatesOnDate(paused, '2026-11-27')).toBe(true);
    const rows = ledger37DataDailyRows([paused, tag(2, { points: [{ date: '2026-11-21', dailyPnl: 5, totalPnl: 8 }] })]);
    expect(rows[0].amount).toBe(5); expect(rows[0].parts.map(p => p.categoryId)).toEqual([2]);
  });
  it('开始日前不参与，结束标志不能代替真实冻结证据', () => {
    const rows = ledger37DataDailyRows([tag(1, { startDate: '2026-11-28' }), tag(2, { status: 'ended', points: [{ date: '2026-11-27', dailyPnl: 2, totalPnl: 8 }] })]);
    expect(rows[0].amount).toBe(2); expect(rows[0].parts.map(p => p.categoryId)).toEqual([2]);
  });
  it('无人实际参与的入场前基准点不作为每日回报行', () => {
    expect(ledger37DataDailyRows([tag(1, { points: [{ date: '2026-10-30', dailyPnl: 8, totalPnl: 8 }] })])).toEqual([]);
  });
  it('重复同日点或非有限金额不伪造完整合计', () => {
    const rows = ledger37DataDailyRows([tag(1, { points: [{ date: '2026-11-27', dailyPnl: 2, totalPnl: 8 }, { date: '2026-11-27', dailyPnl: 3, totalPnl: 9 }] })]);
    expect(rows[0].amount).toBeNull(); expect(rows[0].pending).toBe(1);
    expect(ledger37DataDailyRows([tag(1, { points: [{ date: '2026-11-27', dailyPnl: Infinity, totalPnl: 8 }] })])[0].amount).toBeNull();
  });
  it('直达用户设置并返回详情，不使用viewAs切换身份', () => {
    expect(ledger37MemberConfigPath(123)).toBe('/ledger/37/aa-initial-balance?view=user&userId=123&from=data-management');
    expect(ledger37DataManagementPath(123)).toBe('/ledger/37/data-management?userId=123');
  });
});
