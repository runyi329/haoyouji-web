import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { isCryptoPortfolioSymbol, isValidCryptoPortfolioQuantity } from '../shared/portfolio-instruments';
import * as cryptoPolicy from '../shared/crypto-portfolio-policy';
import { isStockSessionDate } from '../shared/stock-market-session';
import { assertStockBuySnapshotSafe } from './stock-buy-snapshot-guard';

// Never import the backend module (and hence never load its DB/network modules).
// Execute its current TypeScript AST declarations, with real pure shared policies.
const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('production.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function declaration(name: string, file = ast): string {
  const node = file.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name
    || ts.isVariableStatement(item) && item.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name));
  if (!node) throw new Error(`Missing real declaration: ${name}`);
  return node.getText(file);
}
function load(names: string[], deps: Record<string, unknown>, file = ast): any {
  const js = ts.transpileModule(names.map(name => declaration(name, file)).join('\n') + `\nglobalThis.subject = { ${names.join(',')} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context: any = { exports: {}, Date, Intl, Buffer, ...deps };
  runInNewContext(js, context, { timeout: 1000 });
  return context.subject;
}
const pureNames = ['EPSILON', 'STOCK_TRADE_FEE_RATE', 'numberValue', 'normalizeStoredDate', 'toIso',
  'toBeijingWallClockIso', 'toMysqlBeijingDateTime', 'parsePortfolioActualTime', 'validateCryptoQuantity', 'portfolioQuantityExceeds'];
const stockTime = '2026-11-10T02:00:00.000Z';
const cryptoTime = '2026-11-20T06:00:00.000Z';
const clone = <T>(value: T): T => structuredClone(value);
type Row = Record<string, any>;
type Options = { crypto?: boolean; event?: Row; lot?: Row; participations?: Row[]; observations?: Row[];
  sales?: number; closures?: number; observationTable?: boolean; activation?: string | null; savedActivation?: string | null; missingEvent?: boolean;
  fail?: 'begin' | 'event' | 'lot' | 'audit' | 'dirty' | 'commit'; advanceAt?: 'event' | 'lot' | 'audit' | 'dirty'; };
const harnesses: ReturnType<typeof harness>[] = [];
function harness(options: Options = {}) {
  const symbol = options.crypto ? 'CRYPTO:BTC-USDT' : 'AAPL';
  const event: Row = { id: 101, event_type: 'buy', status: 'active', symbol, quantity: '10.00000000', execution_price: '20.00000000',
    transaction_fee: '0.20000000', actual_traded_at: options.crypto ? '2026-11-20 14:00:00' : stockTime,
    server_registered_at: options.crypto ? '2026-11-20 14:01:00' : '2026-11-10T02:01:00.000Z',
    settlement_effective_date: options.crypto ? '2026-11-20' : null, note: '原订单备注', created_by: 701,
    market_reference_price: '20.12345678', market_reference_at: '2026-11-10T02:00:01.000Z', ...options.event };
  const lot: Row = { id: 11, symbol: event.symbol, stock_name: '离线资产', opened_event_id: 101, opened_at: event.actual_traded_at,
    initial_quantity: event.quantity, unit_cost: event.execution_price, note: '  原开仓备注\n完整保留  ', ...options.lot };
  const participations = clone(options.participations ?? []);
  const observations = clone(options.observations ?? []);
  const original = clone({ event, lot, participations, observations });
  let committed = clone(original);
  let pending = clone(original);
  let auditNotes: string[] = [], pendingAudit: string[] = [];
  const order: string[] = [];
  const calls: { sql: string; params: any[] }[] = [];
  const rollback = vi.fn(async () => { order.push('rollback'); pending = clone(original); pendingAudit = []; });
  const commit = vi.fn(async () => {
    order.push('commit'); if (options.fail === 'commit') throw new Error('FAIL_commit');
    committed = clone(pending); auditNotes = [...pendingAudit];
  });
  const beginTransaction = vi.fn(async () => { order.push('begin'); if (options.fail === 'begin') throw new Error('FAIL_begin'); });
  const release = vi.fn(() => { order.push('release'); });
  const execute = vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (/^\s*SELECT/.test(sql)) {
      if (/FROM ledger_stock_lots WHERE/.test(sql)) { order.push('lot-lock'); return [[Object.freeze(clone(lot))]]; }
      if (/FROM ledger_stock_events WHERE/.test(sql)) {
        order.push('event-lock');
        const wall = (value: unknown) => {
          try { return value == null ? null : subject.toMysqlBeijingDateTime(cryptoPolicy.parsePortfolioTradeTime(String(value)).toISOString()); } catch { return null; }
        };
        return [options.missingEvent ? [] : [Object.freeze({ ...clone(event), actual_traded_at_wall: wall(event.actual_traded_at),
          server_registered_at_wall: wall(event.server_registered_at), effective_date_wall: event.settlement_effective_date })]];
      }
      if (/FROM ledger_stock_event_lot_allocations/.test(sql)) return [[{ count: options.sales ?? 0 }]];
      if (/FROM ledger_stock_participation_closures/.test(sql)) return [[{ count: options.closures ?? 0 }]];
      if (/FROM ledger_stock_lot_participations/.test(sql)) return [participations.map(row => Object.freeze(clone(row)))];
      if (/FROM ledger_stock_lot_observations/.test(sql)) return [observations.filter(row => Number(row.enabled ?? 1) === 1).map(row => Object.freeze(clone(row)))];
      // Source activation and persisted activation are separate, SELECT-only evidence.
      if (/crypto_activation_date/.test(sql) && /FROM ledger_stock_lots/.test(sql)) return [options.activation !== undefined ? [{ crypto_activation_date: options.activation }] : []];
      if (/FROM ledger_crypto_portfolio_daily_snapshots/.test(sql)) return [options.savedActivation !== undefined ? [{ crypto_activation_date: options.savedActivation }] : []];
      if (/information_schema/.test(sql)) return [options.observationTable === false ? [] : [{ count: 1, table_name: 'ledger_stock_lot_observations' }]];
      throw new Error(`Unapproved offline SELECT: ${sql}`);
    }
    if (/^\s*UPDATE ledger_stock_(events|lots)\b/.test(sql)) {
      const kind = /UPDATE ledger_stock_events/.test(sql) ? 'event' : 'lot';
      order.push(kind);
      if (options.fail === kind) throw new Error(`FAIL_${kind}`);
      const fields = sql.match(/SET\s+([\s\S]*?)\s+WHERE/i)![1].split(',').map(field => field.trim().match(/^(\w+)\s*=/)![1]);
      const target = kind === 'event' ? pending.event : pending.lot;
      fields.forEach((field, index) => { target[field] = params[index] instanceof Date ? params[index].toISOString() : params[index]; });
      if (kind === options.advanceAt) vi.setSystemTime(new Date('2026-11-20T07:05:00.000Z'));
      return [{ affectedRows: 1 }];
    }
    if (/^\s*INSERT INTO ledger_stock_events\b/.test(sql) && /'note'/.test(sql)) {
      order.push('audit'); if (options.fail === 'audit') throw new Error('FAIL_audit');
      const note = params.find(value => typeof value === 'string' && value.includes('买入订单修改'));
      if (note === undefined) throw new Error('Audit evidence missing');
      if (options.advanceAt === 'audit') vi.setSystemTime(new Date('2026-11-20T07:05:00.000Z'));
      pendingAudit.push(note); return [{ affectedRows: 1, insertId: 9001 }];
    }
    throw new Error(`Forbidden offline mutation/DDL: ${sql}`);
  });
  const tx = { execute, beginTransaction, commit, rollback, release };
  const getTx = vi.fn(async () => tx);
  const access = vi.fn(async () => ({ ledgerId: 37, categoryId: 301, canEdit: true }));
  const ensure = vi.fn();
  const dirty = vi.fn(async (connection: any, categoryId: number) => {
    expect(connection).toBe(tx); expect(categoryId).toBe(301); order.push('dirty');
    if (options.fail === 'dirty') throw new Error('FAIL_dirty');
    if (options.advanceAt === 'dirty') vi.setSystemTime(new Date('2026-11-20T07:05:00.000Z'));
  });
  const invalidate = vi.fn(() => { order.push('invalidate'); });
  const rebuild = vi.fn(() => { order.push('rebuild'); });
  const observationExists = vi.fn(async () => options.observationTable !== false);
  const subject = load([...pureNames, 'stockBuySnapshotRecheck', 'updateStockTagBuy'], {
    isCryptoPortfolioSymbol, isValidCryptoPortfolioQuantity, ...cryptoPolicy, isStockSessionDate, assertStockBuySnapshotSafe,
    assertStockTagAccess: access, ensureStockCalendarResultTable: ensure, getDbTransactionConnection: getTx,
    stockObservationTableExists: observationExists,
    readStockLotDownsideRules: async () => [],
    markStockCalendarResultDirty: dirty, invalidateMemberStockReadCaches: invalidate, queueStockCalendarResultRebuild: rebuild,
  });
  const expected = { quantity: Number(event.quantity), executionPrice: Number(event.execution_price),
    actualTradedAt: new Date(options.crypto ? subject.toBeijingWallClockIso(event.actual_traded_at) : event.actual_traded_at).toISOString(), note: String(lot.note ?? event.note ?? '') };
  const input: any = { ledgerId: 37, categoryId: 301, lotId: 11, eventId: 101, quantity: Number(event.quantity),
    executionPrice: Number(event.execution_price), actualTradedAt: expected.actualTradedAt, note: expected.note,
    reason: '  核对原成交  ', expected, userId: 870413, systemRole: 'user', isViewingAs: false };
  const h = { tx, calls, order, input, original, access, ensure, getTx, dirty, invalidate, rebuild, observationExists,
    run: (patch: Row = {}) => subject.updateStockTagBuy({ ...input, ...patch }),
    state: () => committed, audit: () => auditNotes,
    writes: () => calls.filter(call => /^\s*(UPDATE|INSERT|DELETE|REPLACE|CREATE|ALTER|DROP)\b/.test(call.sql)),
    assertBeforeWriteBlock: () => {
      expect(h.writes()).toEqual([]); expect(dirty).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled(); expect(rollback).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce(); expect(invalidate).not.toHaveBeenCalled(); expect(rebuild).not.toHaveBeenCalled();
    },
    assertUntouched: () => {
      expect(committed.participations).toEqual(original.participations); expect(committed.observations).toEqual(original.observations);
      expect(event).toEqual(original.event); expect(lot).toEqual(original.lot);
      for (const { sql } of calls) {
        expect(sql).not.toMatch(/\b(?:DELETE|REPLACE|VOID|CREATE|ALTER|DROP)\b|status\s*=\s*'voided'/i);
        expect(sql).not.toMatch(/INSERT\s+(?:IGNORE\s+)?INTO\s+ledger_stock_lots/i);
        expect(sql).not.toMatch(/(?:INSERT\s+INTO|UPDATE)\s+(?:ledger_stock_lot_participations|ledger_stock_lot_observations|balance_history|users|recharge_orders|af_manual_balances)\b/i);
      }
    },
  };
  harnesses.push(h);
  return h;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T06:30:00.000Z'));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline tests prohibit HTTP'); }));
});
afterEach(() => {
  for (const h of harnesses.splice(0)) h.assertUntouched();
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.useRealTimers();
});

const realMembers = [
  { id: 41, user_id: 201, allocated_quantity: '3.00000000', remaining_quantity: '3.00000000', entry_price: '12.12345678', start_date: '2026-11-12' },
  { id: 42, user_id: 202, allocated_quantity: '2.00000000', remaining_quantity: '2.00000000', entry_price: '18.87654321', start_date: '2026-11-13' },
];
const observers = [
  { user_id: 203, quantity: '5.00000000', entry_price: '30.12345678', start_date: '2026-11-12', enabled: 1 },
  { user_id: 204, quantity: '4.00000000', entry_price: '40.87654321', start_date: '2026-11-13', enabled: 1 },
  { user_id: 205, quantity: '1000.00000000', start_date: '2026-01-01', enabled: 0 },
];
describe('opening order in-place edit: real production AST, pure policies, isolated transaction spies', () => {
  it('begins, locks numbered lot before scoped opening event, updates fixed IDs, commits before cache/rebuild and always releases', async () => {
    const h = harness(); expect(await h.run({ executionPrice: 21 })).toEqual({ success: true, changed: true });
    expect(h.access.mock.calls).toEqual([[37, 301, 870413, 'user', true, true, false]]);
    expect(h.order.slice(0, 3)).toEqual(['begin', 'lot-lock', 'event-lock']);
    for (const [index, id] of [[0, 11], [1, 101]]) {
      expect(h.calls[index].sql).toMatch(/WHERE id = \? AND ledger_id = \? AND category_id = \?.*FOR UPDATE/);
      expect(h.calls[index].params).toEqual([id, 37, 301]);
    }
    const eventWrite = h.writes().find(call => /^\s*UPDATE ledger_stock_events/.test(call.sql))!;
    const lotWrite = h.writes().find(call => /^\s*UPDATE ledger_stock_lots/.test(call.sql))!;
    expect(eventWrite.params.slice(-3)).toEqual([101, 37, 301]); expect(eventWrite.sql).toContain("status = 'active'");
    expect(lotWrite.params.slice(-3)).toEqual([11, 37, 301]);
    expect(h.state().event.id).toBe(101); expect(h.state().lot.id).toBe(11); expect(h.state().lot.opened_event_id).toBe(101);
    expect(h.order.slice(-5)).toEqual(['dirty', 'commit', 'invalidate', 'rebuild', 'release']);
    expect(h.tx.rollback).not.toHaveBeenCalled(); expect(h.getTx).toHaveBeenCalledOnce();
  });
  it('also edits active legacy add in place, not through create/void/correct', async () => {
    const h = harness({ event: { event_type: 'add' } }); await h.run({ executionPrice: 21 });
    expect(h.state().event.event_type).toBe('add'); expect(h.audit()).toHaveLength(1);
  });
  it('allocated stocks allow price/time/quantity within capacity and preserve every independent member/observer field', async () => {
    const h = harness({ participations: realMembers, observations: observers });
    await h.run({ quantity: 6, executionPrice: 25, actualTradedAt: '2026-11-11T02:00:00.000Z', note: '修改开仓说明' });
    expect(h.state().event.quantity).toBe(6); expect(h.state().lot.initial_quantity).toBe(6);
    expect(h.state().lot.unit_cost).toBe(25); expect(h.state().lot.opened_at).toBe('2026-11-11T02:00:00.000Z');
    expect(h.state().event.note).toBe('原订单备注'); expect(h.state().lot.note).toBe('修改开仓说明');
  });
  it.each(['quantity', 'executionPrice', 'actualTradedAt', 'note'])('stale expected %s blocks before every write/audit/dirty', async field => {
    const h = harness(); const stale: any = { ...h.input.expected, [field]: field === 'quantity' ? 9 : field === 'executionPrice' ? 19 : field === 'actualTradedAt' ? '2026-11-09T02:00:00.000Z' : '被另一管理员改过' };
    await expect(h.run({ executionPrice: 21, expected: stale })).rejects.toThrow(/刷新|覆盖/); h.assertBeforeWriteBlock();
  });
  it('expected note uses lot note over event note, falls back for NULL without overwriting raw original event note', async () => {
    const h = harness(); await expect(h.run({ note: '新说明', expected: { ...h.input.expected, note: '原订单备注' } })).rejects.toThrow(/刷新|覆盖/); h.assertBeforeWriteBlock();
    const fallback = harness({ lot: { note: null } }); await fallback.run({ note: '新的开仓备注' });
    expect(fallback.state().event.note).toBe('原订单备注'); expect(fallback.state().lot.note).toBe('新的开仓备注');
  });
  it('mismatched opening event link, scoped event absence/type/status/symbol and inconsistent lot economics all fail before writes', async () => {
    for (const options of [
      { lot: { opened_event_id: 102 } }, { event: { event_type: 'sell' } }, { event: { status: 'voided' } },
      { event: { symbol: 'MSFT' }, lot: { symbol: 'AAPL' } }, { lot: { initial_quantity: '11.00000000' } }, { lot: { unit_cost: '21.00000000' } }, { missingEvent: true },
    ]) { const h = harness(options); await expect(h.run({ executionPrice: 22 })).rejects.toThrow(/不匹配|有效|不一致/); h.assertBeforeWriteBlock(); }
  });
  it('quantity minimum is real allocated sum, not each member individually', async () => {
    const h = harness({ participations: realMembers }); await expect(h.run({ quantity: 4 })).rejects.toThrow(/分配|成员/); h.assertBeforeWriteBlock();
  });
  it('negative or inconsistent allocated/remaining quantities fail closed without rewriting allocation', async () => {
    for (const row of [ { allocated_quantity: 6, remaining_quantity: 2 }, { allocated_quantity: -1, remaining_quantity: -1 }, { allocated_quantity: 2, remaining_quantity: -1 } ]) {
      const h = harness({ participations: [{ id: 41, start_date: '2026-11-12', ...row }] });
      await expect(h.run({ executionPrice: 21 })).rejects.toThrow(); h.assertBeforeWriteBlock();
    }
  });
  it('observation capacity uses MAX enabled observer, not SUM, with disabled quantities/dates ignored', async () => {
    const h = harness({ participations: realMembers, observations: observers }); await h.run({ quantity: 5 });
    expect(h.state().lot.initial_quantity).toBe(5);
    const tooSmall = harness({ observations: observers }); await expect(tooSmall.run({ quantity: 4 })).rejects.toThrow(/观察/); tooSmall.assertBeforeWriteBlock();
    const select = h.calls.find(call => /FROM ledger_stock_lot_observations/.test(call.sql))!;
    expect(select.sql).toContain('enabled = 1'); expect(select.sql).toContain('FOR UPDATE'); expect(select.params).toEqual([11, 37, 301]);
  });
  it('historical observers above lot quantity do not block price/time edit when order quantity is unchanged', async () => {
    const h = harness({ observations: [{ quantity: 100, start_date: '2026-11-12', enabled: 1 }] });
    await expect(h.run({ executionPrice: 21, actualTradedAt: '2026-11-11T02:00:00.000Z' })).resolves.toMatchObject({ changed: true });
  });
  it('member/observer start dates compare Beijing day across UTC midnight, allowing equality and rejecting next day', async () => {
    const h = harness({ participations: [{ id: 41, allocated_quantity: 2, remaining_quantity: 2, start_date: '2026-11-11' }] });
    await expect(h.run({ actualTradedAt: '2026-11-11T16:01:00.000Z' })).rejects.toThrow(/开始日期/); h.assertBeforeWriteBlock();
    const same = harness({ observations: [{ quantity: 2, start_date: new Date('2026-11-10T16:00:00.000Z'), enabled: 1 }] });
    await expect(same.run({ actualTradedAt: '2026-11-10T16:01:00.000Z' })).resolves.toMatchObject({ changed: true });
  });
  it('NULL legacy member start date rejects actual-time changes but allows price-only and never fills NULL', async () => {
    const options = { participations: [{ id: 41, allocated_quantity: 2, remaining_quantity: 2, start_date: null }] };
    const h = harness(options); await expect(h.run({ actualTradedAt: '2026-11-11T02:00:00.000Z' })).rejects.toThrow(); h.assertBeforeWriteBlock();
    const price = harness(options); await expect(price.run({ executionPrice: 21 })).resolves.toMatchObject({ changed: true });
    expect(price.state().participations[0].start_date).toBeNull();
  });
  it('active sell or ANY member closure prevents every economic edit before writes', async () => {
    for (const options of [{ sales: 1 }, { closures: 1 }]) {
      for (const patch of [{ quantity: 11 }, { executionPrice: 21 }, { actualTradedAt: '2026-11-11T02:00:00.000Z' }]) {
        const h = harness(options); await expect(h.run(patch)).rejects.toThrow(/卖出|结算/); h.assertBeforeWriteBlock();
        const sales = h.calls.find(call => /FROM ledger_stock_event_lot_allocations/.test(call.sql))!;
        expect(sales.sql).toContain("e.status = 'active'"); expect(sales.sql).toMatch(/event_type IN \('reduce','sell'\)/);
        const closure = h.calls.find(call => /FROM ledger_stock_participation_closures/.test(call.sql))!;
        expect(closure.sql).not.toContain("status = 'active'");
      }
    }
  });
  it('note-only works for partially sold stocks and fixed/settled crypto; no economic writes/dirty/rebuild', async () => {
    for (const options of [{ sales: 1, closures: 1 }, { crypto: true, sales: 1, closures: 1, event: { settlement_effective_date: '2026-11-19' } }]) {
      const h = harness(options); await expect(h.run({ note: '只改开仓备注' })).resolves.toEqual({ success: true, changed: true });
      expect(h.writes().filter(call => /^\s*UPDATE/.test(call.sql))).toHaveLength(1);
      expect(h.writes()[0].sql).toMatch(/UPDATE ledger_stock_lots SET note = \?/);
      expect(h.state().event).toEqual(h.original.event); expect(h.dirty).not.toHaveBeenCalled(); expect(h.rebuild).not.toHaveBeenCalled();
      expect(h.invalidate).toHaveBeenCalledOnce(); expect(h.audit()).toHaveLength(1);
    }
  });
  it('legacy NULL fee stays gross and never acquires an implicit fee', async () => {
    const h = harness({ event: { transaction_fee: null } }); await h.run({ quantity: 12, executionPrice: 25 });
    expect(h.state().event.transaction_fee).toBeNull(); expect(Number(h.state().event.quantity) * Number(h.state().event.execution_price)).toBe(300);
  });
  it('new fee follows quantity * price * 0.001 rounded to 8 digits, including explicit old zero fee', async () => {
    const h = harness({ event: { transaction_fee: 0 } }); await h.run({ quantity: 12.3456789, executionPrice: 25.12345678 });
    expect(h.state().event.transaction_fee).toBe(Number((12.3456789 * 25.12345678 * 0.001).toFixed(8)));
  });
  it('audit note holds reason, before/after, original author/registered/reference, with no correction link/quantity columns', async () => {
    const h = harness(); await h.run({ executionPrice: 21, note: '完整新开仓备注' });
    const audit = h.writes().find(call => /^\s*INSERT INTO ledger_stock_events/.test(call.sql))!;
    const columns = audit.sql.match(/ledger_stock_events\s*\(([^)]*)\)/)![1];
    expect(columns).toContain('event_type'); expect(audit.sql).toContain("'note'");
    expect(columns).not.toMatch(/corrects_event_id|quantity|execution_price|transaction_fee|settlement_effective_date/);
    const evidence = h.audit()[0]; expect(evidence).toContain('101'); expect(evidence).toContain('11');
    expect(evidence).toContain('核对原成交'); expect(evidence).toContain('701'); expect(evidence).toContain('20.12345678');
    expect(evidence).toContain('2026-11-10'); expect(evidence).toContain('完整新开仓备注');
    expect(h.state().event.created_by).toBe(701); expect(h.state().event.server_registered_at).toBe(h.original.event.server_registered_at);
    expect(h.state().event.market_reference_price).toBe('20.12345678'); expect(h.state().event.market_reference_at).toBe(h.original.event.market_reference_at);
  });
  it('audit retains raw decimal strings, both raw notes and NULL, raw actual/effective timestamps and structured version/kind', async () => {
    const h = harness({ event: { quantity: '10.00000000', execution_price: '20.00000000', note: '原event独立说明' }, lot: { note: null } });
    await h.run({ executionPrice: 21, note: '新lot说明' }); const evidence = h.audit()[0];
    expect(evidence).toContain('10.00000000'); expect(evidence).toContain('20.00000000'); expect(evidence).toContain('原event独立说明');
    expect(evidence).toMatch(/"(?:note|lotNote|lot_note)":null/);
    expect(evidence).toMatch(/"version"\s*:/); expect(evidence).toMatch(/"kind"\s*:/);
    expect(evidence).toMatch(/(?:settlement_effective_date|settlementEffectiveDate|effectiveDate)/);
    expect(evidence).toMatch(/(?:before|原信息)/); expect(evidence).toMatch(/(?:after|修改后)/);
  });
  it('audit UTF8 TEXT overflow (escaped multi-byte originals) is rejected before writes, not silently truncated', async () => {
    const h = harness({ event: { note: '繁'.repeat(30000) } });
    await expect(h.run({ note: '新说明' })).rejects.toThrow(/审计|过长|长度|备注/); h.assertBeforeWriteBlock();
  });
  it.each(['begin', 'event', 'lot', 'audit', 'dirty', 'commit'] as const)('%s failure rolls back event+lot+audit, skips cache/rebuild and releases', async fail => {
    const h = harness({ fail }); await expect(h.run({ executionPrice: 21 })).rejects.toThrow(`FAIL_${fail}`);
    expect(h.tx.rollback).toHaveBeenCalledOnce(); expect(h.state()).toEqual(h.original); expect(h.audit()).toEqual([]);
    expect(h.invalidate).not.toHaveBeenCalled(); expect(h.rebuild).not.toHaveBeenCalled(); expect(h.tx.release).toHaveBeenCalledOnce();
    if (fail !== 'commit') expect(h.tx.commit).not.toHaveBeenCalled();
  });
  it('no-op commits/release only: no audit, dirty, invalidation or rebuild', async () => {
    const h = harness({ crypto: true, sales: 1, closures: 1 }); expect(await h.run()).toEqual({ success: true, changed: false });
    expect(h.writes()).toEqual([]); expect(h.dirty).not.toHaveBeenCalled(); expect(h.invalidate).not.toHaveBeenCalled(); expect(h.rebuild).not.toHaveBeenCalled();
    expect(h.tx.commit).toHaveBeenCalledOnce(); expect(h.tx.release).toHaveBeenCalledOnce(); expect(h.tx.rollback).not.toHaveBeenCalled();
  });
  it('crypto accepts 8-digit quantities including minimum atom, rejects 9 digits and never rounds input', async () => {
    const valid = harness({ crypto: true }); await valid.run({ quantity: 0.00000001 }); expect(valid.state().event.quantity).toBe(0.00000001);
    for (const quantity of [0.000000001, 1.123456789]) {
      const h = harness({ crypto: true }); await expect(h.run({ quantity })).rejects.toThrow(/8位|最小/); h.assertBeforeWriteBlock();
    }
  });
  it('crypto min capacity does not ignore an 8th decimal atom in real sum or maximum observer', async () => {
    for (const options of [
      { participations: [{ id: 41, allocated_quantity: '0.00000002', remaining_quantity: '0.00000002', start_date: '2026-11-20' }] },
      { observations: [{ quantity: '0.00000002', start_date: '2026-11-20', enabled: 1 }] },
    ]) { const h = harness({ crypto: true, ...options }); await expect(h.run({ quantity: 0.00000001 })).rejects.toThrow(/分配|观察/); h.assertBeforeWriteBlock(); }
  });
  it('crypto effective date at/before latest snapshot due blocks economics even with no snapshot proof', async () => {
    vi.setSystemTime(new Date('2026-11-20T07:05:00.000Z'));
    const h = harness({ crypto: true }); await expect(h.run({ executionPrice: 21 })).rejects.toThrow(/15:05|日结|生效/); h.assertBeforeWriteBlock();
    expect(h.calls.some(call => /daily_snapshots/.test(call.sql))).toBe(false);
  });
  it('only not-yet-effective crypto can edit: registered/effective stay fixed and MySQL writes retain Beijing wall clock', async () => {
    const h = harness({ crypto: true }); await h.run({ executionPrice: 21, actualTradedAt: '2026-11-20T06:02:00.000Z' });
    expect(h.state().event.actual_traded_at).toBe('2026-11-20 14:02:00'); expect(h.state().lot.opened_at).toBe('2026-11-20 14:02:00');
    expect(h.state().event.server_registered_at).toBe('2026-11-20 14:01:00'); expect(h.state().event.settlement_effective_date).toBe('2026-11-20');
  });
  it('crypto inconsistent/missing effective or registration evidence and changed effective date fail closed', async () => {
    for (const event of [{ settlement_effective_date: null }, { settlement_effective_date: '2026-11-21' }, { server_registered_at: null }]) {
      const h = harness({ crypto: true, event }); await expect(h.run({ executionPrice: 21 })).rejects.toThrow(/15:05|日结|生效/); h.assertBeforeWriteBlock();
    }
    vi.setSystemTime(new Date('2026-11-20T08:00:00.000Z'));
    // Original actual after cutoff => Nov21, registration before cutoff => Nov20.
    // Nov21 is NOT due yet; moving actual back before cutoff must still be blocked.
    const changeEffective = harness({ crypto: true, event: { actual_traded_at: '2026-11-20 15:06:00', settlement_effective_date: '2026-11-21' } });
    await expect(changeEffective.run({ actualTradedAt: cryptoTime })).rejects.toThrow(/15:05|日结|生效/); changeEffective.assertBeforeWriteBlock();
    const unchangedEffective = harness({ crypto: true, event: { actual_traded_at: '2026-11-20 15:06:00', settlement_effective_date: '2026-11-21' } });
    await expect(unchangedEffective.run({ executionPrice: 21 })).resolves.toMatchObject({ changed: true });
  });
  it('crypto and mixed stock crossing 15:05 during dirty step recheck before commit and roll all writes back', async () => {
    for (const options of [{ crypto: true }, { activation: '2026-11-19', event: { symbol: '600519.SH', actual_traded_at: '2026-11-20T05:16:00.000Z', server_registered_at: null } }]) {
      vi.setSystemTime(new Date('2026-11-20T07:04:59.000Z'));
      const h = harness({ ...options, advanceAt: 'dirty' }); await expect(h.run({ executionPrice: 21 })).rejects.toThrow(/15:05|日结|生效/);
      expect(h.writes()).toHaveLength(3); expect(h.dirty).toHaveBeenCalledOnce(); expect(h.tx.rollback).toHaveBeenCalledOnce();
      expect(h.tx.commit).not.toHaveBeenCalled(); expect(h.state()).toEqual(h.original); expect(h.audit()).toEqual([]);
      expect(h.invalidate).not.toHaveBeenCalled(); expect(h.rebuild).not.toHaveBeenCalled(); expect(h.tx.release).toHaveBeenCalledOnce();
    }
  });
  it('per-order mixed history locks old stock without proof, permits new A 13:16 with NULL registration, preserves note-only/future activation', async () => {
    const h = harness({ activation: '2026-11-19' }); await expect(h.run({ executionPrice: 21 })).rejects.toThrow(/日结|数字币|15:05/); h.assertBeforeWriteBlock();
    const activationRead = h.calls.find(call => /crypto_activation_date/.test(call.sql) && /FROM ledger_stock_lots/.test(call.sql))!;
    expect(activationRead.params).toEqual([37, 301]);
    const saved = harness({ savedActivation: '2026-11-19' }); await expect(saved.run({ executionPrice: 21 })).rejects.toThrow(/日结|数字币|15:05/); saved.assertBeforeWriteBlock();
    const savedRead = saved.calls.find(call => /FROM ledger_crypto_portfolio_daily_snapshots/.test(call.sql))!;
    expect(savedRead.params).toEqual([37, 301, cryptoPolicy.CRYPTO_PORTFOLIO_POLICY_VERSION]);
    const note = harness({ activation: '2026-11-19' }); await expect(note.run({ note: '备注不倒改日结' })).resolves.toMatchObject({ changed: true });
    const future = harness({ activation: '2026-11-20' }); await expect(future.run({ executionPrice: 21 })).resolves.toMatchObject({ changed: true });
    const fresh = harness({ activation: '2026-11-18', event: { symbol: '600519.SH', actual_traded_at: '2026-11-20T05:16:00.000Z', server_registered_at: null } });
    await expect(fresh.run({ quantity: 11, executionPrice: 21 })).resolves.toMatchObject({ changed: true });
    expect(fresh.state().event.server_registered_at).toBeNull();
    expect(fresh.writes().map(call => call.sql).join('\n')).not.toMatch(/SET[^;]*server_registered_at\s*=/);
  });
  it('original sealed date cannot be moved forward, and fresh stocks cannot be backdated into history', async () => {
    const old = harness({ activation: '2026-11-18', event: { symbol: '600519.SH', actual_traded_at: '2026-11-19T05:16:00.000Z' } });
    await expect(old.run({ actualTradedAt: '2026-11-20T05:16:00.000Z' })).rejects.toThrow(/历史日结/); old.assertBeforeWriteBlock();
    const fresh = harness({ activation: '2026-11-18', event: { symbol: '600519.SH', actual_traded_at: '2026-11-20T05:16:00.000Z' } });
    await expect(fresh.run({ actualTradedAt: '2026-11-19T05:16:00.000Z' })).rejects.toThrow(/历史日结/); fresh.assertBeforeWriteBlock();
  });
  it('US uses its real NY day and strictly older anchor, not Beijing A date', async () => {
    const fresh = harness({ activation: '2026-11-18', event: { actual_traded_at: '2026-11-19T20:16:00.000Z' } });
    await expect(fresh.run({ executionPrice: 21 })).resolves.toMatchObject({ changed: true });
    const sealed = harness({ activation: '2026-11-18', event: { actual_traded_at: '2026-11-19T02:16:00.000Z' } });
    await expect(sealed.run({ executionPrice: 21 })).rejects.toThrow(/历史日结/); sealed.assertBeforeWriteBlock();
  });
  it.each(['event', 'lot', 'audit'] as const)('stock crosses 15:05 at %s and stops before the next write, rolling back', async advanceAt => {
    vi.setSystemTime(new Date('2026-11-20T07:04:59.000Z'));
    const h = harness({ activation: '2026-11-18', advanceAt, event: { symbol: '600519.SH', actual_traded_at: '2026-11-20T05:16:00.000Z' } });
    await expect(h.run({ executionPrice: 21 })).rejects.toThrow(/历史日结/);
    expect(h.writes()).toHaveLength(advanceAt === 'event' ? 1 : advanceAt === 'lot' ? 2 : 3);
    expect(h.state()).toEqual(h.original); expect(h.tx.commit).not.toHaveBeenCalled(); expect(h.tx.rollback).toHaveBeenCalledOnce();
  });
  it('NULL/illegal original actual date and NULL/illegal activation or crypto date fail closed, never substitute registration', async () => {
    for (const activation of [null, '2026-02-30', 'garbage']) {
      const h = harness({ activation }); await expect(h.run({ executionPrice: 21 })).rejects.toThrow(/日结/); h.assertBeforeWriteBlock();
    }
    for (const originalActualTradedAt of [null, '2026-02-30 13:16:00', '2026-11-20', 'garbage']) {
      expect(() => assertStockBuySnapshotSafe({ symbol: '600519.SH', originalActualTradedAt, nextActualTradedAt: '2026-11-20 13:16:00',
        registeredAt: '2026-11-20 13:17:00', effectiveDate: null, activationDates: ['2026-11-18'], operation: 'edit', now: new Date() })).toThrow(/历史日结/);
    }
    const invalidCrypto = harness({ crypto: true, event: { settlement_effective_date: '2026-02-30' } });
    await expect(invalidCrypto.run({ executionPrice: 21 })).rejects.toThrow(/历史日结/); invalidCrypto.assertBeforeWriteBlock();
  });
  it('backend input finite/positive/safe-ID/future/reason checks happen before any transaction', async () => {
    for (const patch of [{ quantity: NaN }, { quantity: Infinity }, { quantity: 0 }, { executionPrice: Infinity }, { executionPrice: 0 },
      { lotId: 0 }, { eventId: 1.5 }, { actualTradedAt: '2026-11-21T02:00:00.000Z' }, { reason: '   ' }]) {
      const h = harness(); await expect(h.run(patch)).rejects.toThrow(); expect(h.getTx).not.toHaveBeenCalled(); expect(h.calls).toEqual([]);
    }
  });
});

const routerAst = ts.createSourceFile('routers.ts', routerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function routeNode(name: string): ts.PropertyAssignment {
  let found: ts.PropertyAssignment | undefined;
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(routerAst) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(routerAst); if (!found) throw new Error(`Missing real route: ${name}`); return found;
}
function routeSchema() {
  let found: ts.Expression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'input') found = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(routeNode('updateStockTagBuy')); if (!found) throw new Error('Route input schema missing');
  const js = ts.transpileModule(`globalThis.schema = ${found.getText(routerAst)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const context: any = { z }; runInNewContext(js, context, { timeout: 1000 }); return context.schema as z.ZodTypeAny;
}
describe('buy-edit actual router schema/owner wiring and old correction compatibility', () => {
  it('actual Zod route schema accepts expected snapshot and rejects nonfinite IDs/economics, stale/missing expected shape, invalid timestamps/reason/length/ledger', () => {
    const schema = routeSchema(); const input = { ledgerId: 37, categoryId: 301, lotId: 11, eventId: 101, quantity: 10, executionPrice: 20,
      actualTradedAt: stockTime, note: '', reason: ' 核对 ', expected: { quantity: 10, executionPrice: 20, actualTradedAt: stockTime, note: '' } };
    expect(schema.parse(input).reason).toBe('核对');
    for (const patch of [{ ledgerId: 52 }, { categoryId: 1.5 }, { lotId: 0 }, { eventId: Infinity }, { quantity: NaN }, { quantity: Infinity },
      { executionPrice: Infinity }, { quantity: 1_000_000_001 }, { executionPrice: 10_000_001 }, { actualTradedAt: '2026-11-10' },
      { reason: '  ' }, { reason: '繁'.repeat(301) }, { note: '繁'.repeat(3001) }, { expected: undefined },
      { expected: { ...input.expected, quantity: Infinity } }, { expected: { ...input.expected, executionPrice: NaN } },
      { expected: { ...input.expected, actualTradedAt: 'bad' } }, { expected: { ...input.expected, note: undefined } }]) {
      expect(schema.safeParse({ ...input, ...patch }).success, JSON.stringify(patch)).toBe(false);
    }
  });
  it('route is protected, awaits owner before import/call, binds ctx identity and explicitly forwards viewingAs; backend rechecks it', () => {
    const route = routeNode('updateStockTagBuy').getText(routerAst);
    expect(route).toContain('protectedProcedure'); expect(route).toContain('await assertLedger37Owner(ctx, input.ledgerId)');
    expect(route.indexOf('await assertLedger37Owner')).toBeLessThan(route.indexOf("import('./ledger-stock-portfolio')"));
    expect(route).toContain('userId: ctx.user.id'); expect(route).toContain('systemRole: (ctx.user as any).role');
    expect(route).toContain('isViewingAs: Boolean(ctx.isViewingAs)');
    expect(declaration('updateStockTagBuy')).toContain('true, true, input.isViewingAs');
  });
  it('old correct buy/add path still checks later sales then voids and creates linked replacement; it never delegates to in-place buy edit', async () => {
    const log: string[] = [];
    const execute = vi.fn(async (sql: string) => {
      log.push('read'); if (/SELECT event_type, symbol/.test(sql)) return [[{ event_type: 'buy', symbol: 'AAPL' }]];
      if (/COUNT\(\*\)/.test(sql)) return [[{ count: 0 }]]; throw new Error(`Unexpected correction SQL: ${sql}`);
    });
    const voidEvent = vi.fn(async () => { log.push('void'); });
    const create = vi.fn(async () => { log.push('create'); return { eventId: 9002 }; });
    const subject = load(['correctStockTagEvent'], {
      assertStockTagAccess: vi.fn(), getDbConnection: async () => ({ execute }), voidStockTagEvent: voidEvent, createStockTagEvent: create,
      isR1StockSaleFxScope: () => true,
    });
    const input = { ledgerId: 37, categoryId: 301, eventId: 101, userId: 870413, eventType: 'buy', reason: '旧更正' };
    await expect(subject.correctStockTagEvent(input)).resolves.toEqual({ eventId: 9002 });
    expect(log).toEqual(['read', 'read', 'void', 'create']); expect(create.mock.calls[0][0]).toMatchObject({ correctsEventId: 101 });
    expect(voidEvent.mock.calls[0][0]).toMatchObject({ eventId: 101, reason: '更正：旧更正' });
    expect(declaration('correctStockTagEvent')).not.toContain('updateStockTagBuy');
  });
});
