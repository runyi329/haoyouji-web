import { describe, expect, it } from 'vitest';
import { summarizeStockCustomerPnl } from '../shared/stock-customer-pnl';

describe('管理员用户折叠卡片客户总盈利', () => {
  it('直接汇总客户方向的多个持仓，不反转为账户方向', () => {
    expect(summarizeStockCustomerPnl([2500, -500], [0, 0])).toEqual({
      floatingPnl: 2000, realizedPnl: 0, totalPnl: 2000,
    });
  });
  it('包含完全平仓及部分平仓的已实现收益，并且仅累计一次', () => {
    expect(summarizeStockCustomerPnl([1200, -800], [300, -100, 500])).toEqual({
      floatingPnl: 400, realizedPnl: 700, totalPnl: 1100,
    });
  });
  it('允许客户总盈利为负值，不取绝对值或截为零', () => {
    expect(summarizeStockCustomerPnl([-600], [100]).totalPnl).toBe(-500);
  });
  it('空持仓不制造收益，只有平仓收益时仍可汇总', () => {
    expect(summarizeStockCustomerPnl([], [])).toEqual({ floatingPnl: 0, realizedPnl: 0, totalPnl: 0 });
    expect(summarizeStockCustomerPnl([], [750]).totalPnl).toBe(750);
  });
  it.each([null, undefined, NaN, Infinity, -Infinity])('缺少报价或无效金额 %s 不误报已知部分为总盈利', (value) => {
    expect(summarizeStockCustomerPnl([100, value], [200])).toEqual({
      floatingPnl: null, realizedPnl: 200, totalPnl: null,
    });
    expect(summarizeStockCustomerPnl([100], [value]).totalPnl).toBeNull();
  });
  it('保留精度，在金额展示时才保留两位小数', () => {
    expect(summarizeStockCustomerPnl([1.005, 2.004], [0.006]).totalPnl).toBeCloseTo(3.015, 10);
  });
});
