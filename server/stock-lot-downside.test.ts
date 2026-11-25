import { describe, expect, it } from 'vitest';
import { applyStockLotDownsidePrice as F, countedStockLotPrice as C, createStockLotDownsideVersion as next,
  valueStockLotDownside as value, selectStockLotDownsideRule as select, stockLotDownsideMemberOffset as offset,
  stockLotDownsidePriceAsOf, type StockLotDownsideRule, type StockLotDownsideMemberEpoch } from '../shared/stock-lot-downside';
import { buildStockTotalCalendar } from './shared/stock-total-calendar';
import { buildMemberStockCalendar } from './shared/stock-member-calendar';
const at = '2026-11-23T06:00:00.000Z';
const settings = { ledgerId: 37, categoryId: 90250, lotId: 1, userId: 7, currency: 'CNY' as const, enabled: true,
  thresholdPrice: 100, downsidePercent: 20, expectedVersion: 0, currentRawPrice: 100, effectiveAt: at };
const rule = next(settings, null);
const quote = (date: string, price: number) => ({ symbol: '600000.SH', price, priceDate: date, capturedAt: `${date}T07:05:00Z`, source: 'unified_close_tushare' });

describe('欠保证金逐笔前瞻价格与剩余保证金比例', () => {
  it.each([[0,100],[20,98],[100,90]])('r=%s', (r, expected) => expect(F(90,100,r)).toBe(expected));
  it('above threshold counts 100%, equality continuous', () => { expect(F(110,100,0)).toBe(110); expect(F(100,100,20)).toBe(100); });
  it('crosses threshold repeatedly, never permanent pause', () => expect([110,90,105,80,100,110].map(p => C(p,rule))).toEqual([110,98,105,96,100,110]));
  it('counterparty raw +100 counts +20, long -20', () => {
    expect(value({lotId:1, quantity:10, entryPrice:100, rawPrice:90, rules:[rule], asOf:at, direction:'counterparty'}).countedFloatingPnl).toBe(20);
    expect(value({lotId:1, quantity:10, entryPrice:100, rawPrice:90, rules:[rule], asOf:at}).countedFloatingPnl).toBe(-20);
  });
  it('same symbol different lots stay independent', () => {
    expect([1,2].map(lotId => value({lotId,quantity:10,entryPrice:100,rawPrice:90,rules:[rule],asOf:at}).countedFloatingPnl)).toEqual([-20,-100]);
  });
  it.each(['USD','USDT','CNY'] as const)('native %s is unchanged/no FX conflation', currency => {
    const r = {...rule,currency}; expect(value({lotId:1,quantity:10,entryPrice:100,rawPrice:90,rules:[r],asOf:at}).countedMarketValue).toBe(980);
  });
  it.each([null, NaN, Infinity, -1, 0])('missing/invalid price %s remains unknown', rawPrice => expect(value({lotId:1,quantity:10,entryPrice:100,rawPrice,rules:[rule],asOf:at}).countedFloatingPnl).toBeNull());
  it('before effectiveAt exactly raw', () => { expect(select([rule],1,'2026-11-23T05:59:59Z')).toBeNull(); expect(value({lotId:1,quantity:10,entryPrice:100,rawPrice:90,rules:[rule],asOf:'2026-11-23T05:59:59Z'}).countedMarketValue).toBe(900); });
  it('first save below threshold preserves existing PnL', () => { const r = next({...settings,currentRawPrice:90},null); expect(C(90,r)).toBe(90); expect(C(80,r)).toBe(88); });
  it('adjust then disable continuously preserves earned carry', () => {
    const r2 = next({...settings,currentRawPrice:90,expectedVersion:1,downsidePercent:0,effectiveAt:'2026-11-23T06:01:00Z'},rule);
    expect(C(90,r2)).toBe(98); expect(C(80,r2)).toBe(98);
    const r3 = next({...settings,enabled:false,currentRawPrice:80,expectedVersion:2,effectiveAt:'2026-11-23T06:02:00Z'},r2);
    expect(C(80,r3)).toBe(98); expect(C(70,r3)).toBe(88); expect(C(110,r3)).toBe(128);
    expect(rule.baselineCountedPrice).toBe(100);
  });
  it('CAS rejects duplicate/outdated version and reverse timestamps', () => {
    expect(() => next(settings,rule)).toThrow('版本冲突');
    expect(() => next({...settings,expectedVersion:1,effectiveAt:'2026-11-22T06:00:00Z'},rule)).toThrow('早于');
  });
  it('new member epoch does not inherit earlier carry, retains business initial raw difference', () => {
    const v = value({lotId:1,quantity:10,entryPrice:90,rawPrice:90,rules:[rule],asOf:at,direction:'counterparty',entryCountedOffset:8}); expect(v.countedFloatingPnl).toBe(0);
    expect(value({lotId:1,quantity:10,entryPrice:95,rawPrice:90,rules:[rule],asOf:at,direction:'counterparty',entryCountedOffset:8}).countedFloatingPnl).toBe(50);
  });
  it('epoch lookup uses personal scope, missing future proof unknown', () => {
    const epoch: StockLotDownsideMemberEpoch = {ledgerId:37,categoryId:90250,lotId:1,participationId:2,userId:3,effectiveAt:at,rawPrice:90,countedPrice:98,entryCountedOffset:8};
    expect(offset({lotId:1,participationId:2,assignedAt:at,rules:[rule],epochs:[epoch],asOf:at})).toBe(8);
    expect(offset({lotId:1,participationId:4,assignedAt:at,rules:[rule],epochs:[epoch],asOf:at})).toBeNull();
    expect(offset({lotId:1,participationId:4,assignedAt:'2026-11-22T06:00:00Z',rules:[rule],epochs:[],asOf:at})).toBe(0);
    expect(value({lotId:1,quantity:10,entryPrice:90,rawPrice:90,rules:[rule],asOf:at,entryCountedOffset:null}).countedMarketValue).toBeNull();
  });
  it('NY16 cutoff handles DST, A/crypto preserve own cutoff', () => {
    expect(stockLotDownsidePriceAsOf('AAPL','2026-11-23')).toBe('2026-11-23T21:00:00Z');
    expect(stockLotDownsidePriceAsOf('AAPL','2026-07-23')).toBe('2026-07-23T20:00:00Z');
    expect(stockLotDownsidePriceAsOf('600000.SH','2026-11-23')).toBe('2026-11-23T15:00:00+08:00');
    expect(stockLotDownsidePriceAsOf('CRYPTO:BTC-USDT','2026-11-23')).toBe('2026-11-23T15:05:00+08:00');
  });
});
describe('offline stock calendars prospective/frozen sales', () => {
  const lot = {id:1,symbol:'600000.SH',initialQuantity:10,unitCost:100,openingFee:null,openedDate:'2026-11-20'};
  const input = {lots:[lot],sales:[],quotes:[quote('2026-11-20',100),quote('2026-11-23',90),quote('2026-11-24',80)],fx:[],now:new Date('2026-11-24T08:00:00Z')};
  it('historical snapshots identical and quote evidence immutable after setting', () => {
    const original = JSON.stringify(input); const raw = buildStockTotalCalendar(input); const counted = buildStockTotalCalendar({...input,downsideRules:[rule]});
    expect(counted[0]).toEqual(raw[0]); expect(counted.find(r=>r.snapshotDate==='2026-11-23')?.floatingPnl).toBe(-20);
    expect(counted.find(r=>r.snapshotDate==='2026-11-23')?.downsideRuleAudit?.[0].version).toBe(1); expect(JSON.stringify(input)).toBe(original);
  });
  it('partial sale freezes counted proceeds, preserves raw sale input', () => {
    const sale = {lotId:1,quantity:5,salePrice:90,countedSalePrice:98,eventQuantity:5,transactionFee:null,closeDate:'2026-11-23'};
    const out = buildStockTotalCalendar({...input,sales:[sale],downsideRules:[rule]}).find(r=>r.snapshotDate==='2026-11-24')!;
    expect(out.realizedPnl).toBe(-10); expect(out.floatingPnl).toBe(-20); expect(out.totalPnl).toBe(-30); expect(sale.salePrice).toBe(90);
  });
  it('member reverse direction and scope unaffected by someone else lot', () => {
    const out=buildMemberStockCalendar({participations:[{id:7,lotId:1,symbol:'600000.SH',startDate:'2026-11-20',entryPrice:100,remainingQuantity:2}],closures:[],quotes:input.quotes,fx:[],now:input.now,downsideRules:[rule]});
    expect(out.find(r=>r.snapshotDate==='2026-11-23')?.floatingPnl).toBe(4);
  });
});
