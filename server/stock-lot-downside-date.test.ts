import { describe, expect, it } from 'vitest';
import { validateStockLotDownsideStartDate, stockLotDownsideEffectiveAt, createStockLotDownsideVersion,
  resolveStockLotDownsideHistoricalRules as resolve, stockLotDownsideHistoricalEntryProof as entryProof,
  selectStockLotDownsideRule as select, latestStockLotDownsideRule as latest, countedStockLotPrice as C,
  stockLotDownsideMemberOffset as offset, valueStockLotDownside as value, type StockLotDownsideRule } from '../shared/stock-lot-downside';
import { buildStockTotalCalendar } from './shared/stock-total-calendar';
import { buildMemberStockCalendar, memberCalendarSettlementSummary } from './shared/stock-member-calendar';
const now = new Date('2026-11-25T14:00:00Z');
const base = { ledgerId:37,categoryId:90250,lotId:1,userId:7,currency:'CNY' as const,
  enabled:true,thresholdPrice:100,downsidePercent:20,expectedVersion:0,currentRawPrice:NaN,
  effectiveAt:'2026-11-22T16:00:00Z',createdAt:now.toISOString(),startDate:'2026-11-23',baselineStatus:'pending' as const };
const next = (date:string, previous:StockLotDownsideRule|null=null, ratio=20) => createStockLotDownsideVersion({ ...base,
  startDate:date,downsidePercent:ratio,expectedVersion:previous?.version??0 }, previous);
const lots=[{lotId:1,symbol:'600000.SH',openedAt:'2026-11-20T10:00:00+08:00',unitCost:100}];
const q = (date:string,price:number,symbol='600000.SH') => ({symbol,price,priceDate:date,
  quoteAsOf:`${date}T15:05:00+08:00`,verified:true});
const history=[q('2026-11-20',100),q('2026-11-23',90),q('2026-11-24',80),q('2026-11-25',70)];
const ready = (rules:StockLotDownsideRule[], proof=history) => resolve({rules,lots,quotes:proof,now});
const calQuote=(date:string,price:number,symbol='600000.SH')=>({symbol,price,priceDate:date,
  capturedAt:`${date}T15:05:00+08:00`,source:'unified_close_tushare'});
const calendarInput={lots:[{id:1,symbol:'600000.SH',initialQuantity:10,unitCost:100,openingFee:null,
  openedDate:'2026-11-20',openedAt:lots[0].openedAt}],sales:[],quotes:[calQuote('2026-11-20',100),calQuote('2026-11-23',90),calQuote('2026-11-24',80),calQuote('2026-11-25',70)],fx:[],now};
describe('date rule validation and latest revision semantics',()=>{
  it.each(['2026-02-30','2025-02-29','2026-13-01','2026-00-01','2026-11-31','2026-1-01','2026-11-25T00:00:00Z','',null])('reject invalid %s',date=>{
    expect(()=>validateStockLotDownsideStartDate(date as string)).toThrow('启用日期');
  });
  it('accepts leap date and Beijing midnight not audit time',()=>{
    expect(()=>validateStockLotDownsideStartDate('2024-02-29')).not.toThrow();
    expect(stockLotDownsideEffectiveAt('2026-11-23')).toBe('2026-11-22T16:00:00.000Z');
    const r=next('2026-11-23');expect(r.createdAt).toBe(now.toISOString());expect(r.effectiveAt).not.toBe(r.createdAt);
  });
  it('today uses previous verified close, not today quote',()=>{
    const r=ready([next('2026-11-25')])[0];
    expect(r).toMatchObject({baselineRawPrice:80,baselineSource:'verified_close',baselineStatus:'ready'});
    expect(r.quoteAsOf).toBe('2026-11-24T15:05:00+08:00');expect(C(70,r)).toBe(78);
  });
  it('past date uses prior session close, no save-time baseline',()=>{
    const r=ready([next('2026-11-23')])[0];expect(r.baselineRawPrice).toBe(100);expect(C(90,r)).toBe(98);
    expect(select([r],1,'2026-11-22T15:59:59Z')).toBeNull();
  });
  it('latest retro revision beats an older later effectiveAt',()=>{
    const a=next('2026-11-24');const b=next('2026-11-23',a,30);const rules=ready([a,b]);
    expect(select(rules,1,'2026-11-25T07:00:00Z')?.version).toBe(2);
    expect(select(rules,1,'2026-11-23T07:00:00Z')?.version).toBe(2);
    expect(C(80,select(rules,1,'2026-11-24T07:00:00Z'))).toBe(94);
  });
  it('future config readable/editable via latest and CAS; active remains original',()=>{
    const a=ready([next('2026-11-23')])[0];const future=next('2026-12-01',a);const rules=ready([a,future]);
    expect(latest(rules,1)?.version).toBe(2);expect(select(rules,1,now)?.version).toBe(1);
    expect(rules[1].baselineStatus).toBe('pending');expect(rules[1].baselineRawPrice).toBeNaN();
    expect(()=>createStockLotDownsideVersion({...base,expectedVersion:1},rules[1])).toThrow('版本冲突');
    const edited=next('2026-11-24',rules[1],30);expect(edited.version).toBe(3);
  });
  it('old rule before new date remains then carries continuously',()=>{
    const a=next('2026-11-23');const b=next('2026-11-25',a,0);const rules=ready([a,b]);
    expect(select(rules,1,'2026-11-24T15:00:00+08:00')?.version).toBe(1);
    expect(rules[1].baselineCountedPrice).toBe(96);expect(C(70,rules[1])).toBe(96);
  });
  it('legacy missing startDate/effectiveAt unchanged',()=>{
    const legacy={...ready([next('2026-11-23')])[0]};delete legacy.startDate;
    expect(resolve({rules:[legacy],lots:[],quotes:[],now})[0]).toEqual(legacy);
  });
});
describe('immutable historical evidence and pending failure',()=>{
  it('opening same day starts at real unitCost, not preholding quote',()=>{
    const r=resolve({rules:[next('2026-11-20')],lots,quotes:[q('2026-11-19',500),...history],now})[0];
    expect(r.baselineSource).toBe('opening');expect(r.baselineRawPrice).toBe(100);
    expect(select([r],1,'2026-11-20T09:00:00+08:00')).toBeNull();
  });
  it('start before actual holding never values past unowned quotes',()=>{
    const r=resolve({rules:[next('2026-11-18')],lots,quotes:history,now})[0];
    expect(select([r],1,'2026-11-19T15:00:00+08:00')).toBeNull();expect(r.baselineRawPrice).toBe(100);
    expect(buildStockTotalCalendar({...calendarInput,downsideRules:[r]}).find(x=>x.snapshotDate==='2026-11-19')).toBeUndefined();
  });
  it('missing prior expected close, reference/unverified and current quote never fabricated',()=>{
    const r=ready([next('2026-11-25')],[q('2026-11-25',70),{...q('2026-11-24',80),verified:false}])[0];
    expect(r.baselineStatus).toBe('pending');expect(C(70,r)).toBeNull();expect(r.baselineRawPrice).toBeNaN();
  });
  it('conflicting historical prices fail closed',()=>expect(ready([next('2026-11-25')],[...history,q('2026-11-24',81)])[0].baselineStatus).toBe('pending'));
  it('delayed capture accepted only actual earlier close, never future capture',()=>{
    const proof={...q('2026-11-24',80),quoteAsOf:'2026-11-25T10:00:00+08:00'};
    expect(ready([next('2026-11-25')],[proof])[0].baselineRawPrice).toBe(80);
    expect(ready([next('2026-11-25')],[{...proof,quoteAsOf:'2026-11-26T10:00:00+08:00'}])[0].baselineStatus).toBe('pending');
  });
  it('future stays pending until actual preceding close arrives',()=>{
    const f=next('2026-11-26');expect(ready([f])[0].baselineStatus).toBe('pending');
    const r=resolve({rules:[f],lots,quotes:history,now:new Date('2026-11-26T02:00:00Z')})[0];
    expect(r.baselineRawPrice).toBe(70);expect(r.baselineStatus).toBe('ready');
  });
  it('all source rule/quotes bytes retained',()=>{
    const input={rules:[next('2026-11-23')],lots,quotes:history,now};const before=JSON.stringify(input);resolve(input);expect(JSON.stringify(input)).toBe(before);
  });
});
describe('derived stock calendars: retro partial sale, fixed FX, personal entry and AI summary',()=>{
  it('reconstructs daily total and difference from new rule, before-date unchanged',()=>{
    const a=next('2026-11-24');const b=next('2026-11-23',a,30);
    const old=buildStockTotalCalendar({...calendarInput,downsideRules:[a]});
    const derived=buildStockTotalCalendar({...calendarInput,downsideRules:[a,b]});
    expect(derived[0]).toEqual(old[0]);expect(derived.find(x=>x.snapshotDate==='2026-11-23')?.totalPnl).toBe(-30);
    expect(derived.find(x=>x.snapshotDate==='2026-11-24')?.totalPnl).toBe(-60);
    for(let i=1;i<derived.length;i++) expect(derived[i].dailyPnl).toBeCloseTo(derived[i].totalPnl!-derived[i-1].totalPnl!);
    expect(memberCalendarSettlementSummary(derived,{now}).totalPnl).toBe(-90);
  });
  it('sold partial reprice ignores stale frozen version; original price and fees unchanged',()=>{
    const a=next('2026-11-24');const b=next('2026-11-23',a,20);
    const sale={lotId:1,quantity:5,salePrice:90,countedSalePrice:90,eventQuantity:5,transactionFee:5,
      closeDate:'2026-11-23',actualAt:'2026-11-23T14:00:00+08:00'};
    const before=JSON.stringify(sale);
    const out=buildStockTotalCalendar({...calendarInput,lots:[{...calendarInput.lots[0],openingFee:10}],sales:[sale],downsideRules:[a,b]}).find(x=>x.snapshotDate==='2026-11-24')!;
    expect(out.realizedPnl).toBe(-20);expect(out.floatingPnl).toBe(-20);expect(out.totalPnl).toBe(-40);expect(JSON.stringify(sale)).toBe(before);
  });
  it('sale before start unchanged, same-day sale uses actual time',()=>{
    const sale={lotId:1,quantity:5,salePrice:90,countedSalePrice:90,eventQuantity:5,transactionFee:null,closeDate:'2026-11-23',actualAt:'2026-11-23T14:00:00+08:00'};
    const out=buildStockTotalCalendar({...calendarInput,sales:[sale],downsideRules:[next('2026-11-24')]}).find(x=>x.snapshotDate==='2026-11-24')!;
    expect(out.realizedPnl).toBe(-50);expect(sale.salePrice).toBe(90);
  });
  it('missing baseline yields pending calendar/AI, not old fixed amount',()=>{
    const out=buildStockTotalCalendar({...calendarInput,quotes:[calQuote('2026-11-25',70)],downsideRules:[next('2026-11-25')]});
    const point=out.find(x=>x.snapshotDate==='2026-11-25')!;expect(point.ready).toBe(false);expect(point.totalPnl).toBeNull();
    expect(memberCalendarSettlementSummary(out,{now}).totalPnl).toBeNull();
  });
  it('member late entry reprices epoch raw proof and removes inherited virtual loss',()=>{
    const a=next('2026-11-24');const b=next('2026-11-23',a,20);const rules=ready([a,b]);
    const at='2026-11-24T10:00:00+08:00';const epoch={ledgerId:37,categoryId:90250,lotId:1,participationId:7,userId:8,effectiveAt:at,
      rawPrice:90,countedPrice:90,entryCountedOffset:0,ruleVersion:1};
    const carry=offset({lotId:1,participationId:7,assignedAt:at,startDate:'2026-11-24',rules,epochs:[epoch],asOf:now});
    expect(carry).toBe(8);expect(value({lotId:1,quantity:2,entryPrice:90,rawPrice:90,rules,asOf:now,direction:'counterparty',entryCountedOffset:carry}).countedFloatingPnl).toBe(0);
    expect(epoch.entryCountedOffset).toBe(0);
  });
  it('member business start prior-close proof preserves real entryPrice and scope',()=>{
    const p={id:7,lotId:1,symbol:'600000.SH',startDate:'2026-11-24',entryPrice:90,remainingQuantity:2,
      assignedAt:'2026-11-24T10:00:00+08:00',openedAt:lots[0].openedAt,physicalUnitCost:100};
    const before=JSON.stringify(p);
    const out=buildMemberStockCalendar({participations:[p],closures:[],quotes:calendarInput.quotes,fx:[],now,downsideRules:[next('2026-11-23')]});
    expect(out.find(x=>x.snapshotDate==='2026-11-24')?.totalPnl).toBe(4);expect(JSON.stringify(p)).toBe(before);
    expect(offset({lotId:1,participationId:8,assignedAt:p.assignedAt,rules:ready([next('2026-11-23')]),epochs:[],asOf:now})).toBeNull();
  });
  it('USD native rule and exact historical FX remain independent, no currency rescale',()=>{
    const rule={...next('2026-11-24'),currency:'USD' as const};
    const input={lots:[{...calendarInput.lots[0],symbol:'AAPL',openedDate:'2026-11-20',openedAt:'2026-11-20T20:00:00Z'}],sales:[],
      quotes:[{...calQuote('2026-11-20',100,'AAPL'),capturedAt:'2026-11-20T21:05:00Z',source:'unified_close_yahoo'},
        {...calQuote('2026-11-23',90,'AAPL'),capturedAt:'2026-11-23T21:05:00Z',source:'unified_close_yahoo'},
        {...calQuote('2026-11-24',80,'AAPL'),capturedAt:'2026-11-24T21:05:00Z',source:'unified_close_yahoo'}],
      fx:[{snapshotDate:'2026-11-23',usdCnyRate:7},{snapshotDate:'2026-11-24',usdCnyRate:7.1},{snapshotDate:'2026-11-25',usdCnyRate:7.2}],now,downsideRules:[rule]};
    const before=JSON.stringify(input);const out=buildStockTotalCalendar(input).find(x=>x.snapshotDate==='2026-11-25')!;
    expect(out.nativePnl.USD).toBe((80-100)*0.2*10);expect(out.totalPnl).toBe((80-100)*0.2*10*7.2);expect(out.usdCnyRate).toBe(7.2);expect(JSON.stringify(input)).toBe(before);
    expect(entryProof('AAPL','2026-11-24T00:00:00+08:00',input.quotes.map(q=>({...q,quoteAsOf:q.capturedAt,verified:true})),now)?.price).toBe(100);
  });
});
