import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(()=>({ get:vi.fn(), tx:vi.fn() }));
const derived = vi.hoisted(()=>({ ensureRules:vi.fn(async()=>{}), ensureCalendar:vi.fn(async()=>{}),
  dirty:vi.fn(async()=>{}), rebuild:vi.fn(async()=>({categoryId:90250,saved:false,status:'up-to-date'})) }));
vi.mock('./db',()=>({getDbConnection:db.get,getDbTransactionConnection:db.tx}));
vi.mock('./price-scanner',()=>({fetchIntradayStockQuotes:vi.fn(),resolveUsStockExchange:vi.fn(),searchManualStocks:vi.fn()}));
vi.mock('./crypto-portfolio-quotes',()=>({fetchCryptoPortfolioQuotes:vi.fn(),getCachedCryptoPortfolioQuote:vi.fn(),searchCryptoPortfolio:vi.fn()}));
vi.mock('./stock-lot-downside-rules',async importOriginal=>({
  ...await importOriginal<typeof import('./stock-lot-downside-rules')>(), ensureStockLotDownsideRulesTables:derived.ensureRules,
}));
vi.mock('./stock-calendar-result-cache',()=>({ensureStockCalendarResultTable:derived.ensureCalendar,
  markStockCalendarResultDirty:derived.dirty, readStockCalendarResult:vi.fn(async()=>[]), rebuildCachedStockCalendarResult:derived.rebuild}));
import { readStockLotDownsideRules, appendStockLotDownsideRule, freezeStockLotDownsideSale, readStockLotDownsideMemberEpochs } from './stock-lot-downside-rules';
import { getStockLotDownsideRule, setStockLotDownsideRule } from './ledger-stock-portfolio';
const input={ledgerId:37,categoryId:90250,lotId:1,userId:7,enabled:true,thresholdPrice:100,downsidePercent:20,expectedVersion:0,startDate:'2026-11-23'};
const stored={ledger_id:37,category_id:90250,lot_id:1,user_id:7,version:1,enabled:1,threshold_price:'100',downside_percent:'20',effective_at:'2026-11-23T06:00:00Z',baseline_raw_price:'100',baseline_counted_price:'100',currency:'CNY',created_at:'2026-11-23T06:00:00Z'};
beforeEach(()=>vi.clearAllMocks());
describe('append-only downside store offline',()=>{
  it('old database missing table SELECT-only and cached once per category',async()=>{
    const conn={execute:vi.fn(async()=>{throw Object.assign(new Error('missing'),{code:'ER_NO_SUCH_TABLE'});})};
    expect(await readStockLotDownsideRules(conn,37,90250)).toEqual([]);
    expect(await readStockLotDownsideRules(conn,37,90250)).toEqual([]);
    expect(conn.execute).toHaveBeenCalledTimes(1);expect(conn.execute.mock.calls[0]?.[0]).toMatch(/^SELECT/);
  });
  it('owner threshold source and both manual bases survive SELECT decoding without DDL',async()=>{
    const conn={execute:vi.fn(async()=>[[{...stored,start_date:'2026-11-16',baseline_source:'owner_threshold',
      baseline_status:'ready',threshold_price:'74.23',baseline_raw_price:'74.23',baseline_counted_price:'74.23',quote_as_of:null}]])};
    expect((await readStockLotDownsideRules(conn,37,90250))[0]).toMatchObject({baselineSource:'owner_threshold',
      baselineStatus:'ready',baselineRawPrice:74.23,baselineCountedPrice:74.23,quoteAsOf:undefined});
    expect(conn.execute.mock.calls.every(([sql])=>/^SELECT/.test(sql))).toBe(true);
  });
  it('category batch never queries each lot and has scope SQL bindings',async()=>{
    const conn={execute:vi.fn(async()=>[[stored]])};
    const rules=await readStockLotDownsideRules(conn,37,90250);expect(rules[0]).toMatchObject({lotId:1,version:1,thresholdPrice:100});
    expect(conn.execute.mock.calls[0]).toEqual([expect.stringContaining('WHERE ledger_id=? AND category_id=?'),[37,90250]]);
  });
  it('missing member epoch table returns no evidence, zero writes',async()=>{
    const conn={execute:vi.fn(async()=>{throw Object.assign(new Error('missing'),{errno:1146});})};
    expect(await readStockLotDownsideMemberEpochs(conn,37,90250,9)).toEqual([]);
  });
  it('stale CAS rejected before INSERT',async()=>{
    const conn={execute:vi.fn(async()=>[[stored]])};
    await expect(appendStockLotDownsideRule(conn,{...input,currency:'CNY',currentRawPrice:90,effectiveAt:'2026-11-23T07:00:00Z'})).rejects.toThrow('版本冲突');expect(conn.execute).toHaveBeenCalledTimes(1);
  });
  it('unique version duplicate maps to CAS conflict, no UPDATE',async()=>{
    const conn={execute:vi.fn(async(sql:string)=>{if(sql.includes('SELECT'))return [[]];throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});})};
    await expect(appendStockLotDownsideRule(conn,{...input,currency:'CNY',currentRawPrice:100,effectiveAt:'2026-11-23T07:00:00Z'})).rejects.toThrow('版本冲突');
    expect(conn.execute.mock.calls.every(([sql])=>/^\s*(SELECT|INSERT)/.test(sql))).toBe(true);
  });
  it('old lot sale with no rules has no extra write',async()=>{
    const conn={execute:vi.fn(async()=>[[]])};await freezeStockLotDownsideSale(conn,{ledgerId:37,categoryId:90250,lotId:1,eventId:2,rawPrice:90,effectiveAt:'2026-11-23T07:00:00Z'});
    expect(conn.execute).toHaveBeenCalledTimes(1);
  });
});
describe('rule access is actual owner only, no DDL before authorization',()=>{
  it.each([getStockLotDownsideRule,setStockLotDownsideRule])('viewAs rejected before SQL',async handler=>{
    await expect(handler({...input,isViewingAs:true})).rejects.toThrow('代看');expect(db.get).not.toHaveBeenCalled();expect(db.tx).not.toHaveBeenCalled();
  });
  it.each(['admin','super_admin','systemadmin'])('nonowner system role %s cannot configure',async systemRole=>{
    const conn={execute:vi.fn(async()=>[[{id:90250,ledgerId:37,name:'R1',parentId:null,accounting_mode:'stock_portfolio',ledger_owner_id:8,member_user_id:7,member_role:'admin',initialBalances:'{}'}]])};db.get.mockResolvedValue(conn);
    await expect(setStockLotDownsideRule({...input,systemRole})).rejects.toThrow('所有者');expect(conn.execute).toHaveBeenCalledTimes(1);expect(db.tx).not.toHaveBeenCalled();
  });
  it('owner read is SELECT-only and returns null on missing rule table',async()=>{
    const conn={execute:vi.fn(async(sql:string)=>{
      if(sql.includes('FROM ledger_categories c'))return [[{id:90250,ledgerId:37,name:'R1',parentId:null,accounting_mode:'stock_portfolio',ledger_owner_id:7,member_user_id:7,member_role:'member'}]];
      if(sql.includes('FROM ledger_stock_lots l'))return [[{id:1,symbol:'600000.SH',initial_quantity:10,unit_cost:100,allocated_quantity:0}]];
      if(sql.includes('FROM ledger_stock_lot_downside_rules'))throw Object.assign(new Error('missing'),{errno:1146});
      throw new Error('unexpected SQL');
    })};db.get.mockResolvedValue(conn);expect(await getStockLotDownsideRule(input)).toBeNull();expect(conn.execute.mock.calls.every(([sql])=>/^\s*SELECT/.test(sql))).toBe(true);
  });
});

describe('date persistence and read-only compatibility (mock DB only)',()=>{
  const owner={id:90250,ledgerId:37,name:'R1',parentId:null,accounting_mode:'stock_portfolio',ledger_owner_id:7,member_user_id:7,member_role:'member'};
  const mockOwner=(rules:any[]=[])=>({execute:vi.fn(async(sql:string)=>{
    if(sql.includes('FROM ledger_categories c'))return [[owner]];
    if(sql.includes('FROM ledger_stock_lot_downside_rules'))return [rules];
    if(sql.includes('FROM ledger_stock_lots l'))return [[{id:1,symbol:'600000.SH',initial_quantity:10,unit_cost:100,allocated_quantity:0,actual_traded_at:'2026-11-20 10:00:00'}]];
    if(sql.includes('FROM ledger_stock_unified_close_prices')||sql.includes('FROM ledger_stock_price_snapshots')||sql.includes('FROM ledger_crypto_portfolio_daily_snapshots'))return [[]];
    throw new Error(`Unexpected mock SQL: ${sql}`);
  })});
  it.each(['2026-02-30','2026-11-31',''])('invalid %s is rejected before evidence or DDL',async startDate=>{
    const conn=mockOwner();db.get.mockResolvedValue(conn);
    await expect(setStockLotDownsideRule({...input,startDate})).rejects.toThrow('启用日期');
    expect(conn.execute).toHaveBeenCalledTimes(1);expect(db.tx).not.toHaveBeenCalled();
  });
  it('future highest version readable although active date is older, with real createdAt',async()=>{
    const future={...stored,version:2,start_date:'2099-12-01',effective_at:'2099-11-30T16:00:00Z',
      created_at:'2026-11-25T14:00:00Z',baseline_raw_price:null,baseline_counted_price:null,baseline_status:'pending'};
    const conn=mockOwner([stored,future]);db.get.mockResolvedValue(conn);
    expect(await getStockLotDownsideRule(input)).toMatchObject({version:2,startDate:'2099-12-01',createdAt:'2026-11-25T14:00:00Z',baselineStatus:'pending'});
    expect(conn.execute.mock.calls.every(([sql])=>/^\s*SELECT/.test(sql))).toBe(true);
  });
  it('old schema date columns absent falls back SELECT-only, preserves effectiveAt',async()=>{
    const conn={execute:vi.fn(async(sql:string)=>{
      if(sql.includes('start_date'))throw Object.assign(new Error('old'),{errno:1054});return [[stored]];
    })};
    expect((await readStockLotDownsideRules(conn,37,90250))[0]).toMatchObject({version:1,effectiveAt:stored.effective_at});
    expect(conn.execute).toHaveBeenCalledTimes(2);expect(conn.execute.mock.calls.every(([sql])=>/^SELECT/.test(sql))).toBe(true);
  });
  it('retro append stores start date business midnight and actual audit separately, no UPDATE',async()=>{
    const conn={execute:vi.fn(async(sql:string)=>sql.startsWith('SELECT')?[[stored]]:[{affectedRows:1}])};
    const r=await appendStockLotDownsideRule(conn,{...input,expectedVersion:1,currency:'CNY',currentRawPrice:100,
      effectiveAt:'2026-11-22T16:00:00Z',createdAt:'2026-11-25T14:00:00Z',beforeStartRule:null});
    expect(r).toMatchObject({version:2,startDate:'2026-11-23',effectiveAt:'2026-11-22T16:00:00.000Z',createdAt:'2026-11-25T14:00:00Z'});
    const [sql,values]=conn.execute.mock.calls[1]! as unknown as [string,unknown[]];
    expect(sql).toContain('start_date');expect(values[8]).toBe('2026-11-22 16:00:00.000');expect(values[13]).toBe('2026-11-25 14:00:00.000');
    expect(values[14]).toBe('2026-11-23');expect(conn.execute.mock.calls.every(([sql])=>/^\s*(SELECT|INSERT)/.test(sql))).toBe(true);
  });
  it('pending future appends null baselines rather than save-today faux quote',async()=>{
    const conn={execute:vi.fn(async(sql:string)=>sql.startsWith('SELECT')?[[]]:[{affectedRows:1}])};
    const r=await appendStockLotDownsideRule(conn,{...input,startDate:'2099-12-01',currency:'CNY',currentRawPrice:NaN,
      effectiveAt:'2099-11-30T16:00:00Z',createdAt:'2026-11-25T14:00:00Z',baselineStatus:'pending'});
    expect(r.baselineStatus).toBe('pending');const values=(conn.execute.mock.calls[1] as unknown as [string,unknown[]])[1];
    expect(values[9]).toBeNull();expect(values[10]).toBeNull();
  });
  it('manual append persists owner basis rather than inheriting an old counted carry',async()=>{
    const old={...stored,baseline_raw_price:'80',baseline_counted_price:'96'};
    const conn={execute:vi.fn(async(sql:string)=>sql.startsWith('SELECT')?[[old]]:[{affectedRows:1}])};
    const r=await appendStockLotDownsideRule(conn,{...input,thresholdPrice:74.23,downsidePercent:0,expectedVersion:1,
      currency:'USD',currentRawPrice:NaN,effectiveAt:'2026-11-22T16:00:00Z',baselineSource:'owner_threshold'});
    expect(r).toMatchObject({version:2,baselineSource:'owner_threshold',baselineRawPrice:74.23,baselineCountedPrice:74.23});
    const values=(conn.execute.mock.calls[1] as unknown as [string,unknown[]])[1];
    expect(values[9]).toBe(74.23);expect(values[10]).toBe(74.23);expect(values[16]).toBe('owner_threshold');
    expect(conn.execute.mock.calls.every(([sql])=>/^\s*(SELECT|INSERT)/.test(sql))).toBe(true);
  });
});

describe('rule save lot-first current-state recheck (offline concurrency mock)',()=>{
  const originalLot={id:1,ledger_owner_id:7,symbol:'600000.SH',opened_event_id:11,
    opened_at:'2026-11-20 10:00:00',initial_quantity:'10.00000000',unit_cost:'100.00000000',allocated_quantity:0};
  const originalOpening={id:11,ledger_id:37,category_id:90250,event_type:'buy',status:'active',symbol:'600000.SH',
    quantity:'10.00000000',execution_price:'100.00000000',actual_traded_at:'2026-11-20 10:00:00',actual_traded_at_wall:'2026-11-20 10:00:00'};
  beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-25T14:00:00Z'));});
  afterEach(()=>vi.useRealTimers());
  const setup=(lotChanges:Partial<typeof originalLot>={},eventChanges:Partial<typeof originalOpening>={},sold=0,
    preChanges:Partial<typeof originalLot>={},missingOpening=false)=>{
    const preLot={...originalLot,...preChanges};
    const conn={execute:vi.fn(async(sql:string)=>{
      if(!/^\s*SELECT/.test(sql))throw new Error(`Forbidden mock pre-read write/DDL: ${sql}`);
      if(sql.includes('FROM ledger_categories c'))return [[{id:90250,ledgerId:37,name:'R1',parentId:null,
        accounting_mode:'stock_portfolio',ledger_owner_id:7,member_user_id:7,member_role:'member'}]];
      if(sql.includes('FROM ledger_stock_lot_downside_rules'))return [[]];
      if(sql.includes('FROM ledger_stock_lots l'))return [[{...preLot,actual_traded_at:preLot.opened_at}]];
      if(sql.includes('FROM ledger_stock_unified_close_prices')||sql.includes('FROM ledger_stock_price_snapshots')
        ||sql.includes('FROM ledger_crypto_portfolio_daily_snapshots'))return [[]];
      throw new Error(`Unexpected pre-read mock SQL: ${sql}`);
    })};
    // The lock returns the competing writer's committed state, not the transaction-external draft.
    const currentLot={...preLot,...lotChanges};
    const opening={...originalOpening,symbol:preLot.symbol,quantity:preLot.initial_quantity,
      execution_price:preLot.unit_cost,actual_traded_at:preLot.opened_at,actual_traded_at_wall:preLot.opened_at,...eventChanges};
    const tx={beginTransaction:vi.fn(async()=>{}),commit:vi.fn(async()=>{}),rollback:vi.fn(async()=>{}),release:vi.fn(),
      execute:vi.fn(async(sql:string)=>{
        if(sql.includes('FROM ledger_stock_lots l'))return [[currentLot]];
        if(sql.includes('FROM ledger_stock_events WHERE'))return [missingOpening?[]:[opening]];
        if(sql.includes('FROM ledger_stock_event_lot_allocations a'))return [[{quantity:String(sold)}]];
        if(sql.startsWith('SELECT')&&sql.includes('FROM ledger_stock_lot_downside_rules'))return [[]];
        if(sql.startsWith('INSERT INTO ledger_stock_lot_downside_rules'))return [{affectedRows:1}];
        throw new Error(`Unexpected transaction mock SQL / forbidden DDL: ${sql}`);
      })};
    db.get.mockResolvedValue(conn);db.tx.mockResolvedValue(tx);
    return {conn,tx};
  };
  const expectRejected=async(mock:ReturnType<typeof setup>,message='刷新')=>{
    await expect(setStockLotDownsideRule({...input,startDate:'2026-11-20'})).rejects.toThrow(message);
    expect(mock.tx.beginTransaction).toHaveBeenCalledOnce();expect(mock.tx.rollback).toHaveBeenCalledOnce();
    expect(mock.tx.commit).not.toHaveBeenCalled();expect(mock.tx.release).toHaveBeenCalledOnce();
    expect(mock.tx.execute.mock.calls.every(([sql])=>/^\s*SELECT/.test(sql))).toBe(true);
    expect(derived.dirty).not.toHaveBeenCalled();expect(derived.rebuild).not.toHaveBeenCalled();
  };
  it('concurrent opening void rolls back before rule append',async()=>{
    const mock=setup({}, {status:'voided'});await expectRejected(mock);
    const [lotLock,eventLock]=mock.tx.execute.mock.calls;
    expect(lotLock?.[0]).toContain('FROM ledger_stock_lots l');expect(lotLock?.[0]).toContain('FOR UPDATE');
    for(const column of ['l.symbol','l.initial_quantity','l.unit_cost','l.opened_event_id'])expect(lotLock?.[0]).toContain(column);
    expect(eventLock?.[0]).toContain('FROM ledger_stock_events WHERE');expect(eventLock?.[0]).toContain('FOR UPDATE');
    expect(mock.tx.execute.mock.calls[0]).toEqual([expect.any(String),[1,37,90250]]);
    expect(mock.tx.execute.mock.calls[1]).toEqual([expect.any(String),[11,37,90250]]);
  });
  it.each([{ledger_id:38},{category_id:90251},{id:12},{event_type:'sell'},{symbol:'AAPL'}])('rejects foreign/inactive opening %j',async change=>{
    await expectRejected(setup({},change));
  });
  it('missing opening rolls back',async()=>await expectRejected(setup({}, {},0,{},true)));
  it('current owner recheck remains required despite successful preauthorization',async()=>{
    await expectRejected(setup({ledger_owner_id:8}),'所有者');
  });
  it('quantity changed and fully sold uses current quantity, not larger stale draft',async()=>{
    await expectRejected(setup({initial_quantity:'6.00000000'},{quantity:'6.00000000'},6),'已平仓');
  });
  it('concurrent full sale without opening change also rejects',async()=>await expectRejected(setup({}, {},10),'已平仓'));
  it('quantity changed but still open rejects stale draft',async()=>{
    await expectRejected(setup({initial_quantity:'8.00000000'},{quantity:'8.00000000'}));
  });
  it('concurrent opening price edit rejects precomputed opening baseline',async()=>{
    await expectRejected(setup({unit_cost:'101.00000000'},{execution_price:'101.00000000'}));
  });
  it('concurrent opening time edit rejects stale holding start',async()=>{
    await expectRejected(setup({opened_at:'2026-11-21 10:00:00'},
      {actual_traded_at:'2026-11-21 10:00:00',actual_traded_at_wall:'2026-11-21 10:00:00'}));
  });
  it.each([{quantity:'8.00000000'},{execution_price:'101.00000000'},
    {actual_traded_at:'2026-11-21 10:00:00',actual_traded_at_wall:'2026-11-21 10:00:00'}])('event-only change %j rejects stale baseline',async change=>{
    await expectRejected(setup({},change));
  });
  it('concurrent symbol change rejects stale currency/baseline',async()=>{
    await expectRejected(setup({symbol:'AAPL'},{symbol:'AAPL'}));
  });
  it('concurrent opening link replacement rejects stale draft',async()=>{
    await expectRejected(setup({opened_event_id:12},{id:12}));
  });
  it.each(['600000.SH','AAPL','CRYPTO:BTC-USDT'])('unchanged %s opening plus partial sale saves owner basis',async symbol=>{
    const mock=setup({}, {},2,{symbol});
    const rule=await setStockLotDownsideRule({...input,startDate:'2026-11-20'});
    expect(rule).toMatchObject({version:1,baselineSource:'owner_threshold',baselineStatus:'ready',baselineRawPrice:100,baselineCountedPrice:100});
    expect(mock.tx.commit).toHaveBeenCalledOnce();expect(mock.tx.rollback).not.toHaveBeenCalled();
    expect(mock.tx.release).toHaveBeenCalledOnce();expect(derived.dirty).toHaveBeenCalledWith(mock.tx,90250);
    expect(derived.rebuild).not.toHaveBeenCalled();expect(derived.ensureRules).toHaveBeenCalledOnce();
    expect(derived.ensureCalendar).toHaveBeenCalledOnce();
    expect(mock.tx.execute.mock.calls[2]).toEqual([expect.stringContaining('e.ledger_id=? AND e.category_id=?'),[1,37,90250]]);
    const writes=mock.tx.execute.mock.calls.filter(([sql])=>!/^\s*SELECT/.test(sql));
    expect(writes).toHaveLength(1);expect(writes[0]?.[0]).toMatch(/^INSERT INTO ledger_stock_lot_downside_rules/);
    expect(db.tx).toHaveBeenCalledOnce();
  });
  it('past start accepts manual threshold without historical close queries',async()=>{
    const mock=setup();
    expect(await setStockLotDownsideRule(input)).toMatchObject({baselineSource:'owner_threshold',baselineStatus:'ready',
      baselineRawPrice:100,baselineCountedPrice:100,startDate:'2026-11-23'});
    expect(mock.conn.execute.mock.calls.every(([sql])=>/^\s*SELECT/.test(sql))).toBe(true);
    expect(mock.conn.execute.mock.calls.some(([sql])=>/close_prices|price_snapshots|daily_snapshots/.test(sql))).toBe(false);
    expect(mock.tx.commit).toHaveBeenCalledOnce();expect(derived.rebuild).not.toHaveBeenCalled();
  });
  it('HOOD 74.23 and 0% from November 16 is the authoritative stored rule',async()=>{
    const mock=setup({}, {},0,{symbol:'HOOD',unit_cost:'74.58000000',initial_quantity:'415.00000000',opened_at:'2026-11-15 22:51:00'});
    const rule=await setStockLotDownsideRule({...input,thresholdPrice:74.23,downsidePercent:0,startDate:'2026-11-16'});
    expect(rule).toMatchObject({currency:'USD',thresholdPrice:74.23,downsidePercent:0,startDate:'2026-11-16',
      baselineSource:'owner_threshold',baselineRawPrice:74.23,baselineCountedPrice:74.23,quoteAsOf:undefined});
    expect(mock.tx.commit).toHaveBeenCalledOnce();expect(derived.rebuild).not.toHaveBeenCalled();
    expect(mock.conn.execute.mock.calls.some(([sql])=>/close_prices|price_snapshots|daily_snapshots/.test(sql))).toBe(false);
  });
  it('future owner basis is saved ready without requiring a future quote',async()=>{
    const mock=setup();
    const rule=await setStockLotDownsideRule({...input,startDate:'2099-12-01'});
    expect(rule).toMatchObject({startDate:'2099-12-01',baselineSource:'owner_threshold',baselineStatus:'ready'});
    expect(mock.tx.commit).toHaveBeenCalledOnce();expect(derived.rebuild).not.toHaveBeenCalled();
  });
});
