import { describe, expect, it, vi } from 'vitest';
import {
  aggregateFrozenStockSaleAmounts, buildStockSaleFxLock, inheritStockSaleFxLock,
  insertStockSaleFxLock, isR1StockSaleFxScope, readStockSaleFxLocks, validateStockSaleFxLock,
  type StockSaleFxCurrency, type StockSaleFxLock, type StockSaleFxQuote,
} from './stock-sale-fx-locks';
import { buildStockMemberRealizedLots, stockRealizedValueCny } from '../shared/stock-realized-portfolio';

const lockedAt = '2026-11-25T04:00:00.000Z';
const quote = (rate = 7): StockSaleFxQuote => ({ rate, asOf: '2026-11-25T03:59:00.000Z', source: 'unit-test-current-quote', pair: 'USD/CNY', stale: false });
const lock = (eventId = 81, rate = 7, currency: StockSaleFxCurrency = 'USD', lockKind: StockSaleFxLock['lockKind'] = 'sale') =>
  buildStockSaleFxLock({ eventId, ledgerId: 37, categoryId: 90250, currency, quote: quote(rate), lockedAt, lockKind });
const dbRow = (entry: StockSaleFxLock) => ({ event_id: entry.eventId, ledger_id: entry.ledgerId, category_id: entry.categoryId,
  currency: entry.currency, cny_rate: String(entry.cnyRate), quote_as_of: '2026-11-25 11:59:00.000000',
  locked_at: '2026-11-25 12:00:00.000000', source: entry.source, lock_kind: entry.lockKind });

// SQL is an inert in-memory call recorder; no DB module, HTTP client or credentials imported.
describe('历史锁汇：R1 卖出冻结汇率纯函数与连接内存 stub', () => {
  it('历史锁汇：限定 ledger37/category90250，不扩大其他账本或标签', () => {
    expect(isR1StockSaleFxScope(37, 90250)).toBe(true);
    for (const [ledgerId, categoryId] of [[52, 90250], [37, 90249], [37, 90251]]) {
      expect(isR1StockSaleFxScope(ledgerId, categoryId)).toBe(false);
      expect(() => buildStockSaleFxLock({ eventId: 81, ledgerId, categoryId, currency: 'USD', quote: quote(), lockedAt })).toThrow();
    }
  });
  it('历史锁汇：既有历史统一使用本次一个当前quote，不按旧卖出日期追溯；未来登记按新quote且不改旧锁', () => {
    const current = quote(7);
    const existing = [81, 82, 83].map(eventId => buildStockSaleFxLock({ eventId, ledgerId: 37, categoryId: 90250,
      currency: 'USD', quote: current, lockedAt, lockKind: 'existing_baseline' }));
    const original = JSON.stringify(existing);
    const future = buildStockSaleFxLock({ eventId: 84, ledgerId: 37, categoryId: 90250, currency: 'USD',
      quote: { ...quote(8), asOf: '2026-11-26T04:59:00Z' }, lockedAt: '2026-11-26T05:00:00Z' });
    expect(existing.map(entry => [entry.cnyRate, entry.lockKind, entry.quoteAsOf, entry.lockedAt])).toEqual(
      [81, 82, 83].map(() => [7, 'existing_baseline', current.asOf, lockedAt]));
    expect(future).toMatchObject({ cnyRate: 8, lockKind: 'sale', lockedAt: '2026-11-26T05:00:00Z' });
    expect(JSON.stringify(existing)).toBe(original);
  });
  it.each(['USD', 'USDT'] as const)('历史锁汇：%s采用显式quote但币种身份严格保留，不能跨币匹配卖出证据', currency => {
    const entry = lock(81, 7, currency);
    expect(entry).toMatchObject({ currency, cnyRate: 7 });
    expect(validateStockSaleFxLock(entry, { eventId: 81, currency })).toBe(true);
    const otherCurrency = currency === 'USD' ? 'USDT' : 'USD';
    expect(validateStockSaleFxLock(entry, { currency: otherCurrency })).toBe(false);
    expect(aggregateFrozenStockSaleAmounts([{ eventId: 81, currency: otherCurrency, buyValue: 10, sellValue: 8, realizedPnl: 2, lock: entry }])).toMatchObject({
      buyValueCny: null, sellValueCny: null, realizedPnlCny: null, fxLocked: false,
    });
  });
  it('历史锁汇：CNY天然rate1，不需要quote也不接受伪造外币汇率', () => {
    const entry = buildStockSaleFxLock({ eventId: 81, ledgerId: 37, categoryId: 90250, currency: 'CNY', lockedAt });
    expect(entry).toMatchObject({ cnyRate: 1, source: 'cny_identity', quoteAsOf: lockedAt });
    expect(validateStockSaleFxLock({ ...entry, cnyRate: 7 })).toBe(false);
    expect(aggregateFrozenStockSaleAmounts([{ eventId: 81, currency: 'CNY', buyValue: 40, sellValue: 32, realizedPnl: 8 }])).toEqual({
      buyValueCny: 40, sellValueCny: 32, realizedPnlCny: 8, fxLocked: true, fxRate: 1, fxLockedAt: null,
    });
  });
  it.each([
    null, { ...quote(), stale: true }, { ...quote(), pair: 'USDT/CNY' }, { ...quote(), pair: 'CNY/USD' },
    ...[0, -1, 100, NaN, Infinity, '7'].map(rate => ({ ...quote(), rate })),
    { ...quote(), asOf: '2026-11-25 11:59:00' }, { ...quote(), asOf: 'not-a-date' },
    { ...quote(), asOf: '2026-11-25T04:01:00Z' }, { ...quote(), source: '' },
  ])('历史锁汇：无有效当前quote不得登记外币卖出：%j', candidate => {
    expect(() => buildStockSaleFxLock({ eventId: 81, ledgerId: 37, categoryId: 90250, currency: 'USD',
      quote: candidate as StockSaleFxQuote | null, lockedAt })).toThrow();
  });
  it.each([
    { eventId: 0 }, { eventId: 1.5 }, { ledgerId: 52 }, { categoryId: 90249 }, { currency: 'EUR' },
    { cnyRate: 0 }, { cnyRate: NaN }, { quoteAsOf: '2026-11-25 11:59:00' },
    { lockedAt: '2026-11-25T03:58:00Z' }, { source: ' ' }, { source: 'x'.repeat(81) }, { lockKind: 'history_lookup' },
  ])('历史锁汇：持久化证据非法字段拒绝：%j', patch => {
    expect(validateStockSaleFxLock({ ...lock(), ...patch })).toBe(false);
  });
  it('历史锁汇：部分卖出和最后清仓分别按各自event rate累计，不用末次率重估全部原币', () => {
    const earlier = Object.freeze(lock(81, 7));
    const later = Object.freeze({ ...lock(82, 8), lockedAt: '2026-11-26T05:00:00Z' });
    const rows = Object.freeze([
      Object.freeze({ eventId: 81, currency: 'USD' as const, buyValue: 40, sellValue: 32, realizedPnl: 8, lock: earlier }),
      Object.freeze({ eventId: 82, currency: 'USD' as const, buyValue: 60, sellValue: 75, realizedPnl: -15, lock: later }),
    ]);
    expect(aggregateFrozenStockSaleAmounts(rows)).toEqual({ buyValueCny: 760, sellValueCny: 824, realizedPnlCny: -64,
      fxLocked: true, fxRate: null, fxLockedAt: later.lockedAt });
    expect(aggregateFrozenStockSaleAmounts([...rows].reverse())).toEqual(aggregateFrozenStockSaleAmounts(rows));
    expect(rows.map(row => row.lock.cnyRate)).toEqual([7, 8]);
  });
  it('历史锁汇：重复同率只报告一个率，有效零保留，空集合是有效零而非未知', () => {
    expect(aggregateFrozenStockSaleAmounts([{ eventId: 81, currency: 'USD', buyValue: 0, sellValue: 0, realizedPnl: 0, lock: lock() }])).toEqual({
      buyValueCny: 0, sellValueCny: 0, realizedPnlCny: 0, fxLocked: true, fxRate: 7, fxLockedAt: lockedAt,
    });
    expect(aggregateFrozenStockSaleAmounts([])).toEqual({ buyValueCny: 0, sellValueCny: 0, realizedPnlCny: 0, fxLocked: true, fxRate: null, fxLockedAt: null });
  });
  it('历史锁汇：外币缺锁、event不匹配或非法金额使整个汇总未知，不能把已知部分当完整总额', () => {
    const good = { eventId: 81, currency: 'USD' as const, buyValue: 40, sellValue: 32, realizedPnl: 8, lock: lock() };
    for (const patch of [{ lock: null }, { eventId: 82 }, { buyValue: NaN }, { sellValue: Infinity }, { realizedPnl: NaN }]) {
      expect(aggregateFrozenStockSaleAmounts([good, { ...good, ...patch }])).toEqual({
        buyValueCny: null, sellValueCny: null, realizedPnlCny: null, fxLocked: false, fxRate: null, fxLockedAt: null,
      });
    }
  });
  it('历史锁汇：shared成员helper同时透传部分/完全平仓锁金额，保留原币方向与零，不追加重复legacy记录', () => {
    const base = { lotId: 11, id: 1, symbol: 'AAPL', stockName: '苹果', openedAt: '2026-11-01', startDate: '2026-11-01',
      allocatedQuantity: 10, remainingQuantity: 6, closedQuantity: 4, closedValue: 32, entryPrice: 10, realizedPnl: 8,
      closedBuyValueCny: 250, closedSellValueCny: 200, realizedPnlCny: 50, closedFxLocked: true };
    const rows = Object.freeze([Object.freeze(base), Object.freeze({ ...base, id: 2, lotId: 12, remainingQuantity: 0,
      realizedPnl: 0, realizedPnlCny: 0 }), Object.freeze({ ...base, id: 3, closedQuantity: 0 }),
      Object.freeze({ ...base, id: 4, startDate: '2026-12-01' })]);
    const lots = buildStockMemberRealizedLots(rows, '2026-11-25');
    expect(lots).toHaveLength(2);
    expect(lots[0]).toMatchObject({ buyValue: 40, sellValue: 32, realizedPnl: 8, buyValueCny: 250, sellValueCny: 200, realizedPnlCny: 50, fxLocked: true });
    expect(lots[1]).toMatchObject({ realizedPnl: 0, realizedPnlCny: 0, fxLocked: true });
    expect(stockRealizedValueCny(lots[0], 'realizedPnl')).toBe(50); expect(stockRealizedValueCny(lots[1], 'realizedPnl')).toBe(0);
  });
  it.each(['buyValue', 'sellValue', 'realizedPnl', 'accountNetProfit'] as const)('历史锁汇：shared固定%s缺失时外币不取live率，显式未锁不信伪fixed值，仅CNY天然固定', field => {
    const lot = { symbol: 'AAPL', [field]: 8, [`${field}Cny`]: 50, fxLocked: true };
    expect(stockRealizedValueCny(lot, field)).toBe(50);
    expect(stockRealizedValueCny({ ...lot, [`${field}Cny`]: 0 }, field)).toBe(0);
    expect(stockRealizedValueCny({ ...lot, fxLocked: false }, field)).toBeNull();
    for (const fixed of [null, undefined, NaN, Infinity, '50']) expect(stockRealizedValueCny({ ...lot, [`${field}Cny`]: fixed }, field)).toBeNull();
    expect(stockRealizedValueCny({ ...lot, symbol: 'CRYPTO:UNI-USDT', [`${field}Cny`]: undefined }, field)).toBeNull();
    expect(stockRealizedValueCny({ ...lot, symbol: '600009.SH', fxLocked: false, [`${field}Cny`]: undefined }, field)).toBe(8);
    expect(stockRealizedValueCny({ ...lot, [field]: 0, fxLocked: false, [`${field}Cny`]: undefined }, field)).toBeNull();
    for (const native of [null, undefined, NaN, Infinity, '8']) expect(stockRealizedValueCny({ ...lot, [field]: native }, field)).toBeNull();
  });
  describe.each([
    { symbol: 'AAPL', currency: 'USD' },
    { symbol: 'CRYPTO:UNI-USDT', currency: 'USDT' },
  ] as const)('历史锁汇：$symbol 原币零不等于冻结人民币零', ({ symbol, currency }) => {
    it.each(['realizedPnl', 'accountNetProfit'] as const)('%s正负收益按不同closure汇率冻结，原币抵消仍保留人民币-8', field => {
      const rows = Object.freeze([
        Object.freeze({ eventId: 81, currency, buyValue: 40, sellValue: 32, realizedPnl: 8, lock: Object.freeze(lock(81, 7, currency)) }),
        Object.freeze({ eventId: 82, currency, buyValue: 40, sellValue: 48, realizedPnl: -8, lock: Object.freeze(lock(82, 8, currency)) }),
      ]);
      const native = rows.reduce((sum, row) => sum + row.realizedPnl, 0);
      const frozen = aggregateFrozenStockSaleAmounts(rows);
      expect(native).toBe(0);
      expect(frozen).toMatchObject({ realizedPnlCny: -8, fxLocked: true, fxRate: null });
      expect(aggregateFrozenStockSaleAmounts([...rows].reverse())).toEqual(frozen);
      const lot = { symbol, [field]: native, [`${field}Cny`]: frozen.realizedPnlCny, fxLocked: frozen.fxLocked };
      expect(stockRealizedValueCny(lot, field)).toBe(-8);
      expect(stockRealizedValueCny({ ...lot, fxLocked: undefined }, field)).toBe(-8);
      expect(stockRealizedValueCny({ ...lot, fxLocked: false }, field)).toBeNull();
    });
    it.each(['buyValue', 'sellValue', 'realizedPnl', 'accountNetProfit'] as const)('%s原币零只读取有效冻结值，缺失/非法/显式未锁不能补零', field => {
      const lot = { symbol, [field]: 0, [`${field}Cny`]: 0, fxLocked: true };
      for (const fxLocked of [true, undefined]) {
        expect(stockRealizedValueCny({ ...lot, fxLocked }, field)).toBe(0);
        expect(stockRealizedValueCny({ ...lot, fxLocked, [`${field}Cny`]: -8 }, field)).toBe(-8);
        for (const fixed of [null, undefined, NaN, Infinity, -Infinity, '0', '']) {
          expect(stockRealizedValueCny({ ...lot, fxLocked, [`${field}Cny`]: fixed }, field)).toBeNull();
        }
      }
      expect(stockRealizedValueCny({ symbol, [field]: 0 }, field)).toBeNull();
      expect(stockRealizedValueCny({ ...lot, fxLocked: false }, field)).toBeNull();
      for (const native of [null, undefined, NaN, Infinity, -Infinity, '0']) {
        expect(stockRealizedValueCny({ ...lot, [field]: native }, field)).toBeNull();
      }
    });
  });
  it.each(['buyValue', 'sellValue', 'realizedPnl', 'accountNetProfit'] as const)('历史锁汇：CNY的%s保持原币值，零天然固定且未知仍未知', field => {
    for (const native of [0, 8, -8]) {
      for (const fixed of [undefined, null, NaN, Infinity, -8]) {
        expect(stockRealizedValueCny({ symbol: '600009.SH', [field]: native, [`${field}Cny`]: fixed, fxLocked: false }, field)).toBe(native);
      }
    }
    for (const native of [null, undefined, NaN, Infinity, '0']) {
      expect(stockRealizedValueCny({ symbol: '600009.SH', [field]: native, [`${field}Cny`]: 0, fxLocked: true }, field)).toBeNull();
    }
  });
  it('历史锁汇：读取函数只SELECT，不自动DDL/写锁/请求行情，去重ID并限定scope', async () => {
    const execute = vi.fn(async (sql: string) => sql.includes('information_schema') ? [[{ TABLE_NAME: 'ledger_stock_sale_fx_locks' }]] : [[dbRow(lock())]]);
    const result = await readStockSaleFxLocks({ execute }, { ledgerId: 37, categoryId: 90250, eventIds: [81, 81, 0, -1, NaN, 1.5] });
    expect([...result.keys()]).toEqual([81]); expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true);
    expect((execute.mock.calls[1] as any)[1]).toEqual([37, 90250, 81]);
    expect(result.get(81)).toMatchObject({ currency: 'USD', cnyRate: 7, lockedAt: '2026-11-25T12:00:00.000000+08:00' });
    execute.mockClear();
    expect(await readStockSaleFxLocks({ execute }, { ledgerId: 52, categoryId: 90250, eventIds: [81] })).toEqual(new Map());
    expect(await readStockSaleFxLocks({ execute }, { ledgerId: 37, categoryId: 90250, eventIds: [] })).toEqual(new Map());
    expect(execute).not.toHaveBeenCalled();
  });
  it('历史锁汇：缺锁表读取保持未知且不永久缓存缺表，后续连接内仍能读到迁移后新锁', async () => {
    let exists = false;
    const execute = vi.fn(async (sql: string) => sql.includes('information_schema') ? [exists ? [{ TABLE_NAME: 'ledger_stock_sale_fx_locks' }] : []] : [[dbRow(lock())]]);
    const conn = { execute }, input = { ledgerId: 37, categoryId: 90250, eventIds: [81] };
    expect(await readStockSaleFxLocks(conn, input)).toEqual(new Map()); exists = true;
    expect((await readStockSaleFxLocks(conn, input)).get(81)?.cnyRate).toBe(7);
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it('历史锁汇：只读返回过滤非法或错误scope证据，不跨event混入金额', async () => {
    const execute = vi.fn(async (sql: string) => sql.includes('information_schema') ? [[{ TABLE_NAME: 'ledger_stock_sale_fx_locks' }]] : [[
      dbRow(lock()), { ...dbRow(lock(82)), ledger_id: 52 }, { ...dbRow(lock(83)), cny_rate: 'NaN' }, dbRow(lock(84)),
    ]]);
    const result = await readStockSaleFxLocks({ execute }, { ledgerId: 37, categoryId: 90250, eventIds: [81, 82, 83] });
    expect([...result.keys()]).toEqual([81]);
  });
  it('历史锁汇：写锁仅append INSERT且参数化，重复event不得upsert覆盖历史rate或锁时刻', async () => {
    const entry = lock(), execute = vi.fn(async () => []);
    await insertStockSaleFxLock({ execute }, entry);
    const [sql, params] = execute.mock.calls[0] as any;
    expect(sql).toMatch(/^INSERT INTO ledger_stock_sale_fx_locks/); expect(sql).not.toMatch(/UPDATE|REPLACE|IGNORE|ON DUPLICATE/i);
    expect(params).toEqual([81, 37, 90250, 'USD', 7, '2026-11-25 11:59:00.000', '2026-11-25 12:00:00.000', entry.source, 'sale']);
    const duplicate = new Error('ER_DUP_ENTRY'); execute.mockRejectedValueOnce(duplicate);
    await expect(insertStockSaleFxLock({ execute }, { ...entry, cnyRate: 8 })).rejects.toBe(duplicate);
    const invalidExecute = vi.fn(); await expect(insertStockSaleFxLock({ execute: invalidExecute }, { ...entry, cnyRate: 0 })).rejects.toThrow();
    expect(invalidExecute).not.toHaveBeenCalled();
  });
  it('历史锁汇：更正交易继承原始基准锁rate/source/time/kind，不按当前汇率重锁', async () => {
    const original = lock(81, 7, 'USD', 'existing_baseline');
    const execute = vi.fn(async (sql: string) => sql.includes('information_schema') ? [[{ TABLE_NAME: 'ledger_stock_sale_fx_locks' }]] : sql.startsWith('SELECT') ? [[dbRow(original)]] : []);
    await inheritStockSaleFxLock({ execute }, { eventId: 91, originalEventId: 81, ledgerId: 37, categoryId: 90250, currency: 'USD' });
    const [sql, params] = execute.mock.calls[2] as any;
    expect(sql).toMatch(/^INSERT/); expect(params).toEqual([91, 37, 90250, 'USD', 7, '2026-11-25 11:59:00.000', '2026-11-25 12:00:00.000', original.source, 'existing_baseline']);
    expect(execute.mock.calls).toHaveLength(3);
  });
  it.each(['USD', 'USDT'] as const)('历史锁汇：更正%s缺原始锁须失败，不能生成今日替代锁或跨USD/USDT继承', async currency => {
    for (const rows of [[], [dbRow(lock(81, 7, currency === 'USD' ? 'USDT' : 'USD'))]]) {
      const execute = vi.fn(async (sql: string) => sql.includes('information_schema') ? [[{ TABLE_NAME: 'ledger_stock_sale_fx_locks' }]] : [rows]);
      await expect(inheritStockSaleFxLock({ execute }, { eventId: 91, originalEventId: 81, ledgerId: 37, categoryId: 90250, currency })).rejects.toThrow();
      expect(execute.mock.calls.every(([sql]) => /^\s*SELECT\b/.test(sql))).toBe(true);
    }
  });
});
