import { describe, expect, it } from 'vitest';
import { chooseLatestStockQuote, forcedLiquidationLevelPercents, segmentedForcedLiquidationPriceDrop } from './forced-liquidation-display';

const drop = (initial: number, latest: number, threshold: number, percent: number, quantity = 10, enabled = true) =>
  segmentedForcedLiquidationPriceDrop({ initialPrice: initial, latestPrice: latest, remainingQuantity: quantity,
    threshold, downsidePercent: percent, enabled });
describe('详情纯分段：收益跌幅金额，不是F(P)乘数量', () => {
  it.each([
    [100, 60, 80, 20, 240, 160],
    [100, 60, 80, 0, 200, 200],
    [100, 60, 80, 100, 400, 0],
    [100, 90, 80, 20, 100, 0],
    [100, 100, 80, 20, 0, 0],
    [100, 120, 80, 20, 0, 0],
    [100, 60, 120, 20, 80, 320],
    [100, 110, 120, 20, 0, 0],
    [60, 40, 80, 20, 40, 160],
    [60, 70, 80, 20, 0, 0],
  ])('I=%s P=%s K=%s r=%s', (initial, latest, threshold, percent, effective, ineffective) => {
    const result = drop(initial, latest, threshold, percent);
    expect(result.effectiveFunds).toBeCloseTo(effective, 10);
    expect(result.ineffectiveFunds).toBeCloseTo(ineffective, 10);
    expect(result.effectiveFunds! + result.ineffectiveFunds!).toBeCloseTo(Math.max(0, initial - latest) * 10, 10);
  });
  it('0%及K>I只能计观察段，下方回升不创造金额', () => {
    expect(drop(100, 60, 120, 0)).toEqual({ effectiveFunds: 0, ineffectiveFunds: 400 });
    expect(drop(100, 90, 120, 0)).toEqual({ effectiveFunds: 0, ineffectiveFunds: 100 });
    expect(drop(100, 110, 120, 0)).toEqual({ effectiveFunds: 0, ineffectiveFunds: 0 });
  });
  it('关闭保留100%真实跌幅；零剩余量真实为零', () => {
    expect(drop(100, 60, 80, 0, 10, false)).toEqual({ effectiveFunds: 400, ineffectiveFunds: 0 });
    expect(drop(100, 60, 80, 20, 0)).toEqual({ effectiveFunds: 0, ineffectiveFunds: 0 });
  });
  it.each([
    { initialPrice: null }, { initialPrice: 0 }, { latestPrice: null }, { latestPrice: 0 }, { latestPrice: -1 },
    { remainingQuantity: null }, { remainingQuantity: -1 }, { threshold: null }, { threshold: -1 },
    { downsidePercent: null }, { downsidePercent: -1 }, { downsidePercent: 101 }, { initialPrice: Infinity },
    { latestPrice: NaN }, { remainingQuantity: 1e308, initialPrice: 1e308 },
  ])('missing/invalid/overflow %o不变成0', override => {
    expect(segmentedForcedLiquidationPriceDrop({ initialPrice: 100, latestPrice: 60, remainingQuantity: 10,
      threshold: 80, downsidePercent: 20, enabled: true, ...override })).toEqual({ effectiveFunds: null, ineffectiveFunds: null });
  });
  it('无状态穿越门槛、回升无棘轮；独立历史不变', () => {
    const expected = drop(100, 90, 80, 20);
    drop(100, 30, 80, 20); drop(100, 140, 80, 20);
    expect(drop(100, 90, 80, 20)).toEqual(expected);
  });
  it('包含确定性多组合非负跌幅恒等式', () => {
    for (const initial of [1, 60, 100, 150]) for (const latest of [0.5, 40, 90, 200])
      for (const threshold of [10, 80, 200]) for (const percent of [0, 20, 100]) {
        const r = drop(initial, latest, threshold, percent, 2.5);
        expect(r.effectiveFunds).toBeGreaterThanOrEqual(0); expect(r.ineffectiveFunds).toBeGreaterThanOrEqual(0);
        expect(r.effectiveFunds! + r.ineffectiveFunds!).toBeCloseTo(Math.max(0, initial - latest) * 2.5, 8);
      }
  });
});
describe('服务百分比和报价选择纯语义', () => {
  it('真实分母，K>I显式负值；missing和overflow不补0', () => {
    expect(forcedLiquidationLevelPercents(100, 120, 60)).toEqual({ initialToThresholdPercent: -20, thresholdToLatestPercent: 50 });
    expect(forcedLiquidationLevelPercents(null, 80, null)).toEqual({ initialToThresholdPercent: null, thresholdToLatestPercent: null });
    expect(forcedLiquidationLevelPercents(0, 80, 0)).toEqual({ initialToThresholdPercent: null, thresholdToLatestPercent: 100 });
    expect(forcedLiquidationLevelPercents(1e-308, 1e308, 60).initialToThresholdPercent).toBeNull();
  });
  it('业务价日期优先于capturedAt，同日后时间胜，精确同时间后source胜', () => {
    const q = (priceDate: string, updatedAt: string, source: string, symbol = 'AAPL', price: number | null = 60) =>
      ({ symbol, priceDate, updatedAt, source, price });
    const newerDay = q('2026-11-25', '2026-11-25T09:00:00+08:00', 'close');
    const later = q('2026-11-25', '2026-11-25T15:05:00+08:00', 'intraday');
    const tie = { ...later, source: 'later-source' };
    expect(chooseLatestStockQuote([newerDay, q('2026-11-24', '2026-11-26T15:05:00+08:00', 'old'), later, tie,
      q('2099-11-26', '2099-11-26T15:05:00+08:00', 'foreign', 'MSFT')], 'AAPL')).toBe(tie);
  });
  it('无数据返回null，最后无效报价不可退到旧有效报价', () => {
    expect(chooseLatestStockQuote([], 'AAPL')).toBeNull();
    const bad = { symbol: 'AAPL', price: null, priceDate: '2026-11-26', updatedAt: '2026-11-26T09:05:00+08:00', source: 'intraday' };
    expect(chooseLatestStockQuote([{ ...bad, price: 100, priceDate: '2026-11-25' }, bad], 'AAPL')).toBe(bad);
  });
});
