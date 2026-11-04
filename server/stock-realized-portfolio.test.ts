import { describe, expect, it } from 'vitest';
import {
  buildStockMemberRealizedLots,
  hasStockCustomerActivity,
  type StockMemberParticipation,
} from '../shared/stock-realized-portfolio';

const today = '2026-11-04';

function participation(overrides: Partial<StockMemberParticipation> = {}): StockMemberParticipation {
  return {
    lotId: 101,
    id: 201,
    symbol: '600000.SH',
    stockName: '测试股票',
    openedAt: '2026-10-01T02:00:00.000Z',
    startDate: '2026-10-01',
    allocatedQuantity: 100,
    remainingQuantity: 60,
    closedQuantity: 40,
    closedValue: 360,
    closedAt: '2026-11-03T07:00:00.000Z',
    entryPrice: 10,
    realizedPnl: 40,
    ...overrides,
  };
}

describe('hasStockCustomerActivity', () => {
  it('存在持仓时保留客户，不依赖已实现盈亏', () => {
    expect(hasStockCustomerActivity(1, [])).toBe(true);
    expect(hasStockCustomerActivity(2, [0, null, NaN])).toBe(true);
  });

  it('只有已平仓且零盈亏的客户仍保留', () => {
    const closed = participation({ remainingQuantity: 0, closedQuantity: 100, closedValue: 1000, realizedPnl: 0 });
    const lots = buildStockMemberRealizedLots([closed], today);
    expect(hasStockCustomerActivity(0, [closed.closedQuantity])).toBe(true);
    expect(lots).toHaveLength(1);
    expect(lots[0].realizedPnl).toBe(0);
  });

  it('任一有效已平数量即可保留客户，不要求第一条有效', () => {
    expect(hasStockCustomerActivity(0, [undefined, 0, NaN, 40])).toBe(true);
  });

  it('无持仓且无有效已平数量时排除客户', () => {
    expect(hasStockCustomerActivity(0, [])).toBe(false);
    expect(hasStockCustomerActivity(0, [null, undefined, NaN, Infinity, -Infinity, -1, 0, 1e-9, 1e-8])).toBe(false);
    expect(hasStockCustomerActivity(0, [1.00000001e-8])).toBe(true);
  });
});

describe('buildStockMemberRealizedLots', () => {
  it('部分平仓只冻结已售40股，保留客户方向盈亏，不混入剩余60股浮盈或开仓总额', () => {
    const source = {
      ...participation(),
      floatingPnl: 120,
      totalPnl: 160,
      openingValue: 1000,
    };
    const lots = buildStockMemberRealizedLots([source], today);
    expect(lots).toEqual([{
      lotId: 101,
      participationId: 201,
      symbol: '600000.SH',
      stockName: '测试股票',
      currency: 'CNY',
      openedAt: '2026-10-01T02:00:00.000Z',
      startDate: '2026-10-01',
      soldAt: '2026-11-03T07:00:00.000Z',
      initialQuantity: 100,
      soldQuantity: 40,
      unitCost: 10,
      buyValue: 400,
      sellValue: 360,
      realizedPnl: 40,
      sellPrice: 9,
    }]);
    expect(source.floatingPnl).toBe(120);
    expect(source.totalPnl).toBe(160);
    expect(source.openingValue).toBe(1000);
  });

  it('完全平仓按自身参与份额冻结，不叠加已有closedLots', () => {
    const closed = participation({ remainingQuantity: 0, closedQuantity: 100, closedValue: 900, realizedPnl: 100 });
    const member = {
      participations: [closed],
      closedLots: [{ lotId: 101, soldQuantity: 100, realizedPnl: 100 }],
    };
    const lots = buildStockMemberRealizedLots(member.participations, today);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ initialQuantity: 100, soldQuantity: 100, buyValue: 1000, sellValue: 900, realizedPnl: 100 });
    expect(lots.reduce((total, lot) => total + (lot.realizedPnl ?? 0), 0)).toBe(100);
  });

  it('同批次不同参与记录保持独立，不按lotId去重或合并', () => {
    const lots = buildStockMemberRealizedLots([
      participation({ id: 202, closedQuantity: 10, closedValue: 90, realizedPnl: 10 }),
      participation({ id: 201 }),
    ], today);
    expect(lots.map((lot) => lot.participationId)).toEqual([202, 201]);
    expect(lots.map((lot) => lot.soldQuantity)).toEqual([10, 40]);
  });

  it('未来开始参与排除，当日开始参与包含，不依赖剩余数量', () => {
    const lots = buildStockMemberRealizedLots([
      participation({ id: 202, startDate: '2026-11-05', remainingQuantity: 0 }),
      participation({ id: 203, startDate: today, remainingQuantity: null }),
      participation({ id: 204, startDate: '2026-11-03', remainingQuantity: undefined }),
    ], today);
    expect(lots.map((lot) => lot.participationId)).toEqual([203, 204]);
  });

  it.each([null, undefined, NaN, Infinity, -Infinity, -1, 0, 1e-9, 1e-8])('排除无效或不超过阈值的已平数量 %s', (closedQuantity) => {
    expect(buildStockMemberRealizedLots([participation({ closedQuantity })], today)).toEqual([]);
  });

  it('刚超过阈值的已平数量不被舍入为零', () => {
    const quantity = 1.00000001e-8;
    expect(buildStockMemberRealizedLots([participation({ closedQuantity: quantity })], today)[0].soldQuantity).toBe(quantity);
  });

  it.each(['600000.SH', '000001.SZ', '830001.BJ'])('六位A股代码 %s 使用CNY', (symbol) => {
    expect(buildStockMemberRealizedLots([participation({ symbol })], today)[0].currency).toBe('CNY');
  });

  it.each(['AAPL', 'BRK.B', '00700.HK', '60000.SH', '1600000.SZ', '600000.SH.EXTRA'])('其他代码 %s 使用USD，价格金额不强制汇率换算', (symbol) => {
    expect(buildStockMemberRealizedLots([participation({ symbol })], today)[0]).toMatchObject({
      currency: 'USD', unitCost: 10, buyValue: 400, sellValue: 360, sellPrice: 9, realizedPnl: 40,
    });
  });

  it('保留数量、原始价格金额及派生运算精度，不做toFixed舍入', () => {
    const input = participation({
      allocatedQuantity: 100.123456789123,
      closedQuantity: 40.123456789123,
      entryPrice: 10.123456789123,
      closedValue: 360.123456789123,
      realizedPnl: 40.123456789123,
    });
    expect(buildStockMemberRealizedLots([input], today)[0]).toMatchObject({
      initialQuantity: input.allocatedQuantity,
      soldQuantity: input.closedQuantity,
      unitCost: input.entryPrice,
      sellValue: input.closedValue,
      realizedPnl: input.realizedPnl,
      buyValue: input.closedQuantity! * input.entryPrice!,
      sellPrice: input.closedValue! / input.closedQuantity!,
    });
  });

  it.each([null, undefined, NaN, Infinity, -Infinity])('价格、价值、盈亏的未知或非有限值 %s 返回null，不制造零或反推盈亏', (value) => {
    expect(buildStockMemberRealizedLots([participation({ entryPrice: value })], today)[0]).toMatchObject({
      unitCost: null, buyValue: null, sellValue: 360, sellPrice: 9, realizedPnl: 40,
    });
    expect(buildStockMemberRealizedLots([participation({ closedValue: value })], today)[0]).toMatchObject({
      unitCost: 10, buyValue: 400, sellValue: null, sellPrice: null, realizedPnl: 40,
    });
    expect(buildStockMemberRealizedLots([participation({ realizedPnl: value })], today)[0]).toMatchObject({
      buyValue: 400, sellValue: 360, realizedPnl: null,
    });
    expect(buildStockMemberRealizedLots([participation({ allocatedQuantity: value })], today)[0].initialQuantity).toBeNull();
  });

  it('有效的零价格、零价值和零盈亏保持零，而不是null', () => {
    expect(buildStockMemberRealizedLots([participation({ entryPrice: 0, closedValue: 0, realizedPnl: 0 })], today)[0]).toMatchObject({
      unitCost: 0, buyValue: 0, sellValue: 0, sellPrice: 0, realizedPnl: 0,
    });
  });

  it('直接使用已有盈亏值，即使与价格反推不一致，亏损也不翻转', () => {
    expect(buildStockMemberRealizedLots([participation({ realizedPnl: -73.123456789 })], today)[0].realizedPnl).toBe(-73.123456789);
  });

  it('派生乘除溢出也输出null', () => {
    expect(buildStockMemberRealizedLots([
      participation({ closedQuantity: Number.MAX_VALUE, entryPrice: 2 }),
    ], today)[0].buyValue).toBeNull();
    expect(buildStockMemberRealizedLots([
      participation({ closedQuantity: 1e-7, closedValue: Number.MAX_VALUE }),
    ], today)[0].sellPrice).toBeNull();
  });

  it('不改变只读输入，也不为缺失平仓日期编造日期', () => {
    const input = Object.freeze(participation({ closedAt: undefined }));
    const inputs = Object.freeze([input]);
    const lots = buildStockMemberRealizedLots(inputs, today);
    expect(lots[0].soldAt).toBeNull();
    expect(input.closedAt).toBeUndefined();
    expect(input.remainingQuantity).toBe(60);
    expect(lots[0]).not.toBe(input);
    expect(buildStockMemberRealizedLots([], today)).toEqual([]);
  });
});
