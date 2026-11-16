import { describe, expect, it } from 'vitest';
import { cryptoPortfolioCandidateDates, cryptoPortfolioCutoffAt, getCryptoPortfolioEffectiveDate, getCryptoPortfolioTradeSettlementDate, latestCryptoPortfolioSnapshotDate, millisecondsUntilNextCryptoPortfolioClose, parsePortfolioTradeTime, CRYPTO_PORTFOLIO_POLICY_VERSION } from '../shared/crypto-portfolio-policy';
import { cryptoPortfolioSymbol, isValidCryptoPortfolioQuantity, parsePortfolioInstrument, portfolioCashMultiplier, portfolioQuantityIsEmpty } from '../shared/portfolio-instruments';
import { normalizeStockCalendarPoints } from '../client/src/lib/ledger-stock-calendar';
import { millisecondsUntilStockCalendarWake, stockCalendarExpectedVersion, stockCalendarHasExpectedClose, stockCalendarRetryWindowFor, stockCalendarStaleTime } from '../client/src/lib/ledger-stock-calendar-cache';
import { previousStockMarketSession } from '../shared/stock-market-session';

const previousA = (date: string) => previousStockMarketSession(date, 'A') ?? '';
const cryptoRow = { snapshotDate: '2026-11-14', policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION, historical: true, priced: true, ready: true, totalPnl: 120, dailyPnl: 20, previousDate: '2026-11-13', marketValue: 1000, usdtCnyRate: 7.01 };

describe('数字币显式现货身份与金额币种', () => {
  it('ETH裸ticker保持美股，CRYPTO:ETH-USDT才是数字币', () => {
    expect(parsePortfolioInstrument('ETH')?.market).toBe('US');
    expect(parsePortfolioInstrument('CRYPTO:ETH-USDT')).toMatchObject({ market: 'CRYPTO', currency: 'USDT', baseAsset: 'ETH', displaySymbol: 'ETH/USDT', quantityUnit: '币' });
    expect(parsePortfolioInstrument('600519.SH')?.currency).toBe('CNY');
  });
  it.each(['ETH_PERP', 'ETH-USDT-SWAP', 'CRYPTO:USDT-USDT', 'CRYPTO:ETH-USD', 'CRYPTO:ETH-USDT;DROP'])('不把无效/合约身份 %s 当数字币', (symbol) => {
    expect(parsePortfolioInstrument(symbol)?.market).not.toBe('CRYPTO');
  });
  it('保留数字币数字开头代码', () => expect(cryptoPortfolioSymbol('1INCH')).toBe('CRYPTO:1INCH-USDT'));
  it('USDT没有真实汇率时不借用USD汇率，也不能默认乘1', () => {
    expect(portfolioCashMultiplier('USDT', 7.2, null)).toBeNull();
    expect(portfolioCashMultiplier('USDT', 7.2, 7.01)).toBe(7.01);
    expect(portfolioCashMultiplier('USD', 7.2, 7.01)).toBe(7.2);
    expect(portfolioCashMultiplier('CNY', null, null)).toBe(1);
    expect(portfolioCashMultiplier('OTHER', 7.2, 7.01)).toBeNull();
  });
  it.each([1e-8, 0.00000012, 0.1, 2.12345678, 1000000000])('接受合法8位数量 %s', (value) => expect(isValidCryptoPortfolioQuantity(value)).toBe(true));
  it.each([0, -1, 1e-9, 0.0000000100001, 1.123456789, NaN, Infinity])('拒绝超精度/无效数量 %s', (value) => expect(isValidCryptoPortfolioQuantity(value)).toBe(false));
  it('最小1e-8币量不被旧股票EPSILON判断消失', () => {
    expect(portfolioQuantityIsEmpty('CRYPTO:BTC-USDT', 1e-8)).toBe(false);
    expect(portfolioQuantityIsEmpty('CRYPTO:BTC-USDT', 0)).toBe(true);
    expect(portfolioQuantityIsEmpty('AAPL', 1e-8)).toBe(true);
  });
});

describe('数字币北京时间15:05自然日日结', () => {
  it.each([
    ['2026-11-14T15:04:59+08:00', '2026-11-14'],
    ['2026-11-14T15:05:00+08:00', '2026-11-15'],
    ['2026-11-15T22:00:00+08:00', '2026-11-16'],
    ['2026-11-14 15:04:59', '2026-11-14'],
  ])('实际成交%s归属%s', (timestamp, date) => expect(getCryptoPortfolioTradeSettlementDate(timestamp)).toBe(date));
  it('盘后或迟补录不会倒改已定格日，实际成交时间仍被保留解析', () => {
    expect(getCryptoPortfolioEffectiveDate('2026-11-13 10:00:00', '2026-11-15T16:00:00+08:00')).toBe('2026-11-16');
    expect(parsePortfolioTradeTime('2026-11-13 10:00:00').toISOString()).toBe('2026-11-13T02:00:00.000Z');
  });
  it.each(['2026-02-30 15:00:00', '2026-11-15', '2026-11-15T24:00:00Z', '2026-11-15T10:00:00'])('拒绝无效/不完整时间%s', (value) => expect(() => getCryptoPortfolioTradeSettlementDate(value)).toThrow());
  it('周六15:05前是周五，15:05后是周六，不跳到周一', () => {
    expect(latestCryptoPortfolioSnapshotDate(new Date('2026-11-14T15:04:59+08:00'))).toBe('2026-11-13');
    expect(latestCryptoPortfolioSnapshotDate(new Date('2026-11-14T15:05:00+08:00'))).toBe('2026-11-14');
    expect(cryptoPortfolioCandidateDates(new Date('2026-11-15T16:00:00+08:00'))).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
  });
  it('下一快照和唤醒按自然日15:05', () => {
    const now = new Date('2026-11-14T15:04:00+08:00');
    expect(millisecondsUntilNextCryptoPortfolioClose(now)).toBe(60000);
    expect(millisecondsUntilStockCalendarWake(now, true)).toBe(60000);
    expect(cryptoPortfolioCutoffAt('2026-11-14').toISOString()).toBe('2026-11-14T07:05:00.000Z');
  });
});

describe('日历只读接线不再过滤周末数字币', () => {
  it('保留数字币周末点、自然日前日和独立USDT汇率', () => {
    const points = normalizeStockCalendarPoints([cryptoRow], 'total', previousA, new Date('2026-11-14T16:00:00+08:00'));
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ date: '2026-11-14', dailyPnl: 20, previousDate: '2026-11-13', usdtCnyRate: 7.01, policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION });
  });
  it('周日比较周六，不用上一个A股交易日', () => {
    const row = { ...cryptoRow, snapshotDate: '2026-11-15', previousDate: '2026-11-14' };
    expect(normalizeStockCalendarPoints([row], 'total', previousA, new Date('2026-11-15T16:00:00+08:00'))[0].dailyPnl).toBe(20);
  });
  it('日结时点前不展示未到期的周末日历点', () => expect(normalizeStockCalendarPoints([cryptoRow], 'total', previousA, new Date('2026-11-14T15:04:59+08:00'))).toEqual([]));
  it('旧股票周末点仍然被原策略过滤', () => expect(normalizeStockCalendarPoints([{ ...cryptoRow, policyVersion: undefined }], 'total', previousA, new Date('2026-11-14T16:00:00+08:00'))).toEqual([]));
  it('缺价的数字币点保持null而非0', () => {
    const points = normalizeStockCalendarPoints([{ ...cryptoRow, priced: false, ready: false }], 'total', previousA, new Date('2026-11-14T16:00:00+08:00'));
    expect(points[0].dailyPnl).toBeNull();
    expect(points[0].marketValue).toBeNull();
  });
  it('缓存版本和到点重读按该数据策略选择，不改变纯股票版本', () => {
    const now = new Date('2026-11-14T16:00:00+08:00');
    expect(stockCalendarHasExpectedClose([cryptoRow], now)).toBe(true);
    expect(stockCalendarHasExpectedClose([{ ...cryptoRow, priced: false }], now)).toBe(false);
    expect(stockCalendarExpectedVersion(now, true)).toContain('2026-11-14');
    expect(stockCalendarExpectedVersion(now)).toContain('2026-11-13');
    expect(stockCalendarRetryWindowFor([cryptoRow], now)).toBe(true);
    expect(stockCalendarStaleTime(37, now.getTime(), [{ ...cryptoRow, priced: false }])).toBe(300000);
  });
});
