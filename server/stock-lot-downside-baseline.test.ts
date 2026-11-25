import { describe, expect, it } from 'vitest';
import { isStockLotDownsideBaselineQuoteValid as valid, stockLotDownsideBaselineMarketContext as context } from '../shared/stock-lot-downside';
describe('欠保证金当前真价基准严格校验',()=>{
  it('rejects reference, missing, stale and future quotes',()=>{
    const x={price:100,quoteAsOf:'2026-11-25T05:00:00Z',priceDate:'2026-11-25',now:new Date('2026-11-25T05:01:00Z'),kind:'live' as const};
    expect(valid(x)).toBe(true);expect(valid({...x,kind:'reference'})).toBe(false);expect(valid({...x,price:NaN})).toBe(false);
    expect(valid({...x,now:new Date('2026-11-25T05:03:00Z')})).toBe(false);expect(valid({...x,quoteAsOf:'2026-11-25T05:02:00Z'})).toBe(false);
  });
  it('US preopen accepts only last verified session close and not very old close',()=>{
    const now=new Date('2026-11-25T14:00:00Z');const market=context('AAPL',now);
    expect(market).toEqual({marketOpen:false,expectedCloseDate:'2026-11-24'});
    expect(valid({price:100,quoteAsOf:'2026-11-24T21:00:00Z',priceDate:'2026-11-24',now,kind:'close',...market})).toBe(true);
    expect(valid({price:100,quoteAsOf:'2026-11-23T21:00:00Z',priceDate:'2026-11-23',now,kind:'close',...market})).toBe(false);
  });
  it('US open market cannot substitute yesterday close',()=>{
    const now=new Date('2026-11-25T15:00:00Z');const market=context('AAPL',now);expect(market.marketOpen).toBe(true);
    expect(valid({price:100,quoteAsOf:'2026-11-24T21:00:00Z',priceDate:'2026-11-24',now,kind:'close',...market})).toBe(false);
  });
  it('A weekend and long holiday use actual previous session',()=>{
    expect(context('600000.SH',new Date('2026-11-22T05:00:00Z'))).toEqual({marketOpen:false,expectedCloseDate:'2026-11-20'});
    expect(context('600000.SH',new Date('2026-10-06T05:00:00Z'))).toEqual({marketOpen:false,expectedCloseDate:'2026-09-30'});
  });
});
