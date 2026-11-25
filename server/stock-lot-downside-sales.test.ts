import { describe, expect, it, vi } from 'vitest';
import { freezeStockLotDownsideSale } from './stock-lot-downside-rules';
const r={ledger_id:37,category_id:90250,lot_id:1,user_id:7,version:1,enabled:1,threshold_price:100,downside_percent:20,effective_at:'2026-11-23T06:00:00Z',baseline_raw_price:100,baseline_counted_price:100,currency:'CNY',created_at:'2026-11-23T06:00:00Z'};
const x={ledgerId:37,categoryId:90250,lotId:1,eventId:20,rawPrice:90,effectiveAt:'2026-11-23T06:01:00Z'};
describe('独立前瞻卖出价格冻结，不改真实成交/closure',()=>{
 it('only appends own independent table and uses actual sale time, fee/FX untouched',async()=>{
  const conn={execute:vi.fn(async(sql:string)=> sql.includes('FROM ledger_stock_lot_downside_rules') ? [[r]] : sql.includes('INSERT IGNORE') ? [{affectedRows:1}] : [[{counted_price:98,raw_price:90,rule_version:1}]])};
  await freezeStockLotDownsideSale(conn,x);
  expect(conn.execute).toHaveBeenCalledTimes(3);
  const [sql,values]=conn.execute.mock.calls[1]! as unknown as [string,unknown[]];
  expect(sql).toContain('INSERT IGNORE INTO ledger_stock_lot_downside_sales');expect(values.slice(0,7)).toEqual([37,90250,1,20,1,90,98]);
  expect(values[7]).toBe('2026-11-23 06:01:00.000');
  expect(conn.execute.mock.calls.every(([sql])=>!/^\s*(UPDATE|DELETE|CREATE|ALTER)/.test(sql))).toBe(true);
 });
 it('historical sale before first effectiveAt has zero writes',async()=>{
  const conn={execute:vi.fn(async()=>[[r]])}; await freezeStockLotDownsideSale(conn,{...x,effectiveAt:'2026-11-23T05:00:00Z'});expect(conn.execute).toHaveBeenCalledTimes(1);
 });
 it('conflicting already-frozen sale cannot overwrite historical amount',async()=>{
  const conn={execute:vi.fn(async(sql:string)=>sql.includes('FROM ledger_stock_lot_downside_rules')?[[r]]:sql.includes('INSERT IGNORE')?[{affectedRows:0}]:[[{counted_price:97,raw_price:90,rule_version:1}]])};
  await expect(freezeStockLotDownsideSale(conn,x)).rejects.toThrow('禁止回改');expect(conn.execute.mock.calls.every(([sql])=>!sql.includes('UPDATE'))).toBe(true);
 });
 it('same-saved exact evidence is idempotent without overwriting',async()=>{
  const conn={execute:vi.fn(async(sql:string)=>sql.includes('FROM ledger_stock_lot_downside_rules')?[[r]]:sql.includes('INSERT IGNORE')?[{affectedRows:0}]:[[{counted_price:98,raw_price:90,rule_version:1}]])};
  await expect(freezeStockLotDownsideSale(conn,x)).resolves.toBeUndefined();
 });
 it('new date revision preserves older event counted audit without PK conflict',async()=>{
  const rule={ledgerId:37,categoryId:90250,lotId:1,userId:7,version:2,enabled:true,thresholdPrice:100,downsidePercent:30,
   startDate:'2026-11-23',effectiveAt:'2026-11-22T16:00:00Z',baselineRawPrice:100,baselineCountedPrice:100,currency:'CNY' as const};
  const conn={execute:vi.fn(async(sql:string)=>sql.includes('INSERT IGNORE')?[{affectedRows:0}]:[[{counted_price:98,raw_price:90,rule_version:1}]])};
  await expect(freezeStockLotDownsideSale(conn,{...x,rules:[rule]})).resolves.toBeUndefined();
  expect(conn.execute).toHaveBeenCalledTimes(2);expect(conn.execute.mock.calls.every(([sql])=>!/^\s*(UPDATE|DELETE)/.test(sql))).toBe(true);
 });
 it('pending resolved baseline rejects before sale audit INSERT',async()=>{
  const rule={ledgerId:37,categoryId:90250,lotId:1,userId:7,version:2,enabled:true,thresholdPrice:100,downsidePercent:30,
   startDate:'2026-11-23',effectiveAt:'2026-11-22T16:00:00Z',baselineRawPrice:NaN,baselineCountedPrice:NaN,currency:'CNY' as const,baselineStatus:'pending' as const};
  const conn={execute:vi.fn()};await expect(freezeStockLotDownsideSale(conn,{...x,rules:[rule]})).rejects.toThrow('历史基准');
  expect(conn.execute).not.toHaveBeenCalled();
 });
});
