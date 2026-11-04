import { describe, expect, it } from 'vitest';
import { isStockLotSaleDateValid, requiresStockTradeOrderCheck } from '../shared/stock-trade-ordering';

describe('当前列表序号不参与买卖顺序限制', () => {
  it.each(['10:37', '11:30', '12:01'])('独立买入 %s 不受其他持仓当天12:00卖出占位时间限制', (time) => {
    expect(Number.isFinite(new Date(`2026-11-04T${time}:00+08:00`).getTime())).toBe(true);
    expect(requiresStockTradeOrderCheck('buy')).toBe(false);
  });

  it('卖旧持仓、买入新持仓、再卖新持仓，均不查询同股票其他记录的时间', () => {
    expect(requiresStockTradeOrderCheck('sell', undefined, 45)).toBe(false);
    expect(requiresStockTradeOrderCheck('buy')).toBe(false);
    expect(requiresStockTradeOrderCheck('sell', undefined, 57)).toBe(false);
  });

  it('按内部持仓ID卖出，不依赖列表当前显示第几个序号', () => {
    expect(requiresStockTradeOrderCheck('sell', undefined, 902)).toBe(false);
  });

  it.each(['sell', 'reduce', 'add'] as const)('历史未指定持仓的 %s 保留旧顺序保护', (eventType) => {
    expect(requiresStockTradeOrderCheck(eventType)).toBe(true);
  });

  it.each([0, -1, Number.NaN, 1.5])('无效持仓ID %s 不能绕过旧流程保护', (lotId) => {
    expect(requiresStockTradeOrderCheck('sell', undefined, lotId)).toBe(true);
  });

  it('不改变已有更正流程', () => {
    expect(requiresStockTradeOrderCheck('sell', 18)).toBe(false);
    expect(requiresStockTradeOrderCheck('buy', 5)).toBe(false);
  });
});

describe('卖出仅核对实际持仓的买入日期', () => {
  it('同日买入卖出允许，12:00只是日期占位而不是实际卖出时刻', () => {
    expect(isStockLotSaleDateValid('2026-11-04T12:00:00+08:00', '2026-11-04T14:05:00+08:00')).toBe(true);
  });

  it('买入后另一天卖出允许', () => {
    expect(isStockLotSaleDateValid('2026-11-05T12:00:00+08:00', '2026-11-04T10:37:00+08:00')).toBe(true);
  });

  it('不可在该笔持仓买入之前的日期卖出', () => {
    expect(isStockLotSaleDateValid('2026-11-03T12:00:00+08:00', '2026-11-04T10:37:00+08:00')).toBe(false);
  });

  it('无效日期不能放行', () => {
    expect(isStockLotSaleDateValid('invalid', '2026-11-04T10:37:00+08:00')).toBe(false);
    expect(isStockLotSaleDateValid(new Date(Number.NaN), new Date())).toBe(false);
  });
});
