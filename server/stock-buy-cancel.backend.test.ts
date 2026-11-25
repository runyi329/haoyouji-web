import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { isCryptoPortfolioSymbol, isValidCryptoPortfolioQuantity } from '../shared/portfolio-instruments';
import { isStockSessionDate } from '../shared/stock-market-session';
import { isLedger37FullManager } from '../shared/ledger37-permissions';
import * as cryptoPolicy from '../shared/crypto-portfolio-policy';
import { assertStockBuySnapshotSafe } from './stock-buy-snapshot-guard';

// AST-only backend execution: never import DB, router or the backend module.
const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('production.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function declaration(name: string) {
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name
    || ts.isVariableStatement(item) && item.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name));
  if (!node) throw new Error(`Missing real declaration: ${name}`);
  return node.getText(ast);
}
function load(names: string[], deps: Record<string, unknown>): any {
  const js = ts.transpileModule(names.map(declaration).join('\n') + `\nglobalThis.subject = { ${names.join(',')} };`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context: any = { exports: {}, Date, Intl, Buffer, ...deps };
  runInNewContext(js, context, { timeout: 1000 });
  return context.subject;
}
const pure = ['STOCK_LEDGER_ID', 'numberValue', 'toIso', 'toBeijingWallClockIso', 'toMysqlBeijingDateTime', 'validateCryptoQuantity'];
type Row = Record<string, any>;
type Options = { crypto?: boolean; us?: boolean; event?: Row; lot?: Row; activation?: unknown; savedActivation?: unknown;
  sales?: number; closures?: number; members?: Row[]; observers?: Row[]; ownerId?: number; observationTable?: boolean;
  missingLot?: boolean; missingEvent?: boolean; affectedRows?: number;
  fail?: 'begin' | 'void' | 'audit' | 'dirty' | 'commit'; advanceAt?: 'void' | 'audit' | 'dirty' };
const clone = <T>(value: T): T => structuredClone(value);
const harnesses: ReturnType<typeof harness>[] = [];
function harness(options: Options = {}) {
  const symbol = options.crypto ? 'CRYPTO:BTC-USDT' : options.us ? 'AAPL' : '600519.SH';
  const event: Row = { id: 101, ledger_id: 37, category_id: 301, event_type: 'buy', status: 'active', symbol,
    stock_name: '离线资产', quantity: '10.00000000', execution_price: '20.00000000', transaction_fee: '0.20000000',
    actual_traded_at: options.crypto ? '2026-11-20 13:16:00' : '2026-11-20T05:16:00.000Z',
    server_registered_at: options.crypto ? '2026-11-20 13:17:00' : null, settlement_effective_date: options.crypto ? '2026-11-20' : null,
    note: '原event独立备注', created_by: 701, market_reference_price: '20.12345678', market_reference_at: '2026-11-20T05:16:01.000Z', ...options.event };
  const lot: Row = { id: 11, ledger_id: 37, category_id: 301, symbol, stock_name: '离线资产', opened_event_id: 101,
    opened_at: event.actual_traded_at, initial_quantity: event.quantity, unit_cost: event.execution_price, note: '  原lot备注\n完整保留  ', ...options.lot };
  const original = clone({ event, lot });
  let committed = clone(original), pending = clone(original), audits: string[] = [], pendingAudits: string[] = [];
  const calls: { sql: string; params: any[] }[] = [], order: string[] = [];
  const advance = (stage: string) => { if (options.advanceAt === stage) vi.setSystemTime(new Date('2026-11-20T07:05:00.000Z')); };
  const beginTransaction = vi.fn(async () => { order.push('begin'); if (options.fail === 'begin') throw new Error('FAIL_begin'); pending = clone(committed); pendingAudits = [...audits]; });
  const commit = vi.fn(async () => { order.push('commit'); if (options.fail === 'commit') throw new Error('FAIL_commit'); committed = clone(pending); audits = [...pendingAudits]; });
  const rollback = vi.fn(async () => { order.push('rollback'); pending = clone(committed); pendingAudits = [...audits]; });
  const release = vi.fn(() => order.push('release'));
  const execute = vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (/^\s*SELECT/.test(sql)) {
      if (/FROM ledger_stock_lots WHERE/.test(sql)) { order.push('lot-lock'); return [options.missingLot ? [] : [clone(committed.lot)]]; }
      if (/FROM ledger_stock_events WHERE/.test(sql)) {
        order.push('event-lock');
        const wall = (value: unknown) => { try { return value == null ? null : subject.toMysqlBeijingDateTime(cryptoPolicy.parsePortfolioTradeTime(String(value)).toISOString()); } catch { return null; } };
        const row = clone(committed.event);
        return [options.missingEvent ? [] : [{ ...row, actual_traded_at_wall: wall(row.actual_traded_at),
          server_registered_at_wall: wall(row.server_registered_at), effective_date_wall: row.settlement_effective_date }]];
      }
      if (/FROM ledger_stock_event_lot_allocations/.test(sql)) return [[{ count: options.sales ?? 0 }]];
      if (/FROM ledger_stock_participation_closures/.test(sql)) return [[{ count: options.closures ?? 0 }]];
      if (/FROM ledger_stock_lot_participations/.test(sql)) return [clone(options.members ?? [])];
      if (/FROM ledger_stock_lot_observations/.test(sql)) return [clone((options.observers ?? []).filter(row => Number(row.enabled) === 1))];
      if (/crypto_activation_date/.test(sql) && /FROM ledger_stock_lots/.test(sql)) return [options.activation === undefined ? [] : [{ crypto_activation_date: options.activation }]];
      if (/FROM ledger_crypto_portfolio_daily_snapshots/.test(sql)) return [options.savedActivation === undefined ? [] : [{ crypto_activation_date: options.savedActivation }]];
      if (/information_schema/.test(sql)) return [[{ TABLE_NAME: 'ledger_crypto_portfolio_daily_snapshots' }]];
      throw new Error(`Forbidden offline SELECT: ${sql}`);
    }
    if (/^\s*UPDATE ledger_stock_events SET status = 'voided'/.test(sql)) {
      order.push('void'); if (options.fail === 'void') throw new Error('FAIL_void');
      pending.event.status = 'voided'; pending.event.void_reason = params[0]; pending.event.voided_by = params[1]; pending.event.voided_at = new Date().toISOString();
      advance('void'); return [{ affectedRows: options.affectedRows ?? 1 }];
    }
    if (/^\s*INSERT INTO ledger_stock_events/.test(sql) && /'note'/.test(sql)) {
      order.push('audit'); if (options.fail === 'audit') throw new Error('FAIL_audit');
      const audit = params.find(value => typeof value === 'string' && value.includes('买入订单撤销'));
      if (!audit) throw new Error('Missing complete cancel evidence');
      pendingAudits.push(audit); advance('audit'); return [{ affectedRows: 1 }];
    }
    throw new Error(`Forbidden offline mutation/DDL: ${sql}`);
  });
  const tx = { execute, beginTransaction, commit, rollback, release };
  const getTx = vi.fn(async () => tx), ensure = vi.fn(), infrastructure = vi.fn();
  // Execute the REAL owner/viewingAs checker against isolated SELECT-only access evidence.
  const accessExecute = vi.fn(async () => [[{ id: 301, ledgerId: 37, name: '离线标签', parentId: null, accounting_mode: 'stock_portfolio',
    ledger_owner_id: options.ownerId ?? 870413, member_user_id: 870413, member_role: 'admin', initialBalances: '{}' }]]);
  const accessSubject = load(['STOCK_LEDGER_ID', 'assertStockTagAccess'], {
    getDbConnection: async () => ({ execute: accessExecute }), isLedger37FullManager, readTagVisible: () => true, ensureLedgerStockPortfolioTables: infrastructure,
  });
  const access = vi.fn(accessSubject.assertStockTagAccess);
  const dirty = vi.fn(async (connection: unknown, categoryId: number) => {
    expect(connection).toBe(tx); expect(categoryId).toBe(301); order.push('dirty'); if (options.fail === 'dirty') throw new Error('FAIL_dirty'); advance('dirty');
  });
  const invalidate = vi.fn(() => order.push('invalidate')), rebuild = vi.fn(() => order.push('rebuild'));
  const subject = load([...pure, 'stockBuySnapshotRecheck', 'cancelStockTagBuy'], {
    isCryptoPortfolioSymbol, isValidCryptoPortfolioQuantity, isStockSessionDate, ...cryptoPolicy, assertStockBuySnapshotSafe,
    assertStockTagAccess: access, ensureStockCalendarResultTable: ensure, getDbTransactionConnection: getTx,
    stockObservationTableExists: async () => options.observationTable !== false,
    readStockLotDownsideRules: async () => [],
    markStockCalendarResultDirty: dirty, invalidateMemberStockReadCaches: invalidate, queueStockCalendarResultRebuild: rebuild,
  });
  const originalTime = options.crypto ? subject.toBeijingWallClockIso(event.actual_traded_at) : subject.toIso(event.actual_traded_at);
  const input: Row = { ledgerId: 37, categoryId: 301, lotId: 11, eventId: 101, reason: '  核对后撤销录入  ',
    expected: { quantity: Number(event.quantity), executionPrice: Number(event.execution_price), actualTradedAt: originalTime, note: String(lot.note ?? event.note ?? '') },
    userId: 870413, systemRole: 'admin', isViewingAs: false };
  const h = { input, original, tx, calls, order, dirty, invalidate, rebuild, access, infrastructure, accessExecute, ensure, getTx,
    run: (patch: Row = {}) => subject.cancelStockTagBuy({ ...input, ...patch }), state: () => committed, audits: () => audits,
    writes: () => calls.filter(call => /^\s*(UPDATE|INSERT|DELETE|REPLACE|CREATE|ALTER|DROP)/.test(call.sql)),
    beforeWriteBlock: () => { expect(h.writes()).toEqual([]); expect(rollback).toHaveBeenCalledOnce(); expect(commit).not.toHaveBeenCalled(); expect(dirty).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled(); expect(rebuild).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce(); },
  };
  harnesses.push(h); return h;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-20T06:30:00.000Z'));
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Offline tests prohibit HTTP'); }));
});
afterEach(() => {
  for (const h of harnesses.splice(0)) {
    expect(h.state().lot).toEqual(h.original.lot);
    for (const field of Object.keys(h.original.event).filter(field => field !== 'status')) expect(h.state().event[field]).toEqual(h.original.event[field]);
    for (const { sql } of h.calls) {
      expect(sql).not.toMatch(/\b(?:DELETE|REPLACE|CREATE|ALTER|DROP)\b/i);
      expect(sql).not.toMatch(/(?:INSERT\s+INTO|UPDATE)\s+(?:ledger_stock_lots|ledger_stock_event_lot_allocations|ledger_stock_lot_participations|ledger_stock_lot_observations|ledger_stock_participation_closures|ledger_stock_sale_fx_locks|ledger_crypto_portfolio_daily_snapshots|balance_history|users|recharge_orders|af_manual_balances)\b/i);
      if (/^\s*UPDATE/.test(sql)) expect(sql).toMatch(/^\s*UPDATE ledger_stock_events SET status = 'voided', void_reason = \?, voided_by = \?, voided_at = NOW\(\)/);
    }
  }
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('cancel opening: real production AST and pure guard with isolated lot-first transactions', () => {
  it.each(['buy', 'add'])('voids only active %s with original fields intact, complete audit, commit before invalidation/rebuild', async event_type => {
    const h = harness({ activation: '2026-11-18', event: { event_type } });
    await expect(h.run()).resolves.toEqual({ success: true });
    expect(h.access.mock.calls).toEqual([[37, 301, 870413, 'admin', true, true, false]]);
    expect(h.order).toEqual(['begin', 'lot-lock', 'event-lock', 'void', 'audit', 'dirty', 'commit', 'invalidate', 'rebuild', 'release']);
    expect(h.calls[0].params).toEqual([11, 37, 301]); expect(h.calls[1].params).toEqual([101, 37, 301]);
    expect(h.calls[0].sql).toContain('FOR UPDATE'); expect(h.calls[1].sql).toContain('FOR UPDATE');
    expect(h.state().event.status).toBe('voided'); expect(h.state().event.void_reason).toBe('核对后撤销录入'); expect(h.state().event.voided_by).toBe(870413);
    expect(h.writes()).toHaveLength(2); expect(h.tx.rollback).not.toHaveBeenCalled();
    const audit = h.audits()[0];
    for (const token of ['buy_cancel_audit', 'version', '原信息', '撤销后', '10.00000000', '20.00000000', '0.20000000', '原event独立备注', '原lot备注', '701', '20.12345678', 'serverRegisteredAt', 'settlementEffectiveDate', '"serverRegisteredAt":null']) expect(audit).toContain(token);
    const insert = h.writes()[1].sql;
    expect(insert).toContain("'note'"); expect(insert).not.toMatch(/corrects_event_id|quantity|execution_price|transaction_fee|settlement_effective_date/);
  });
  it('no-crypto stock cancellation protects old history while today pre-cutoff and NULL registration are allowed', async () => {
    const fresh = harness(); await expect(fresh.run()).resolves.toEqual({ success: true });
    const old = harness({ event: { actual_traded_at: '2026-11-19T05:16:00.000Z' } });
    await expect(old.run()).rejects.toThrow(/历史日结/); old.beforeWriteBlock();
  });
  it('mixed source/persisted activation protects old stock even when due snapshot is missing, new stock still cancels', async () => {
    for (const config of [{ activation: '2026-11-18' }, { savedActivation: '2026-11-18' }]) {
      const old = harness({ ...config, event: { actual_traded_at: '2026-11-19T05:16:00.000Z' } });
      await expect(old.run()).rejects.toThrow(/历史日结/); old.beforeWriteBlock();
      const fresh = harness(config); await expect(fresh.run()).resolves.toEqual({ success: true });
    }
  });
  it('US cancellation uses NY actual day and distinct anchor instead of A/Beijing date', async () => {
    const fresh = harness({ us: true, activation: '2026-11-18', event: { actual_traded_at: '2026-11-19T20:16:00.000Z' } });
    await expect(fresh.run()).resolves.toEqual({ success: true });
    const old = harness({ us: true, event: { actual_traded_at: '2026-11-19T02:16:00.000Z' } });
    await expect(old.run()).rejects.toThrow(/历史日结/); old.beforeWriteBlock();
  });
  it('crypto only cancels when original registration/effective proof agrees and effective is not due', async () => {
    const fresh = harness({ crypto: true }); await expect(fresh.run()).resolves.toEqual({ success: true });
    for (const event of [{ server_registered_at: null }, { settlement_effective_date: null }, { settlement_effective_date: '2026-11-21' },
      { settlement_effective_date: '2026-02-30' }, { server_registered_at: 'garbage' }]) {
      const h = harness({ crypto: true, event }); await expect(h.run()).rejects.toThrow(/历史日结/); h.beforeWriteBlock();
    }
    vi.setSystemTime(new Date('2026-11-20T07:05:00.000Z'));
    const due = harness({ crypto: true }); await expect(due.run()).rejects.toThrow(/历史日结/); due.beforeWriteBlock();
  });
  it('active sell/reduce or ANY closure refuses cancel even without current allocation', async () => {
    for (const options of [{ sales: 1 }, { closures: 1 }]) {
      const h = harness(options); await expect(h.run()).rejects.toThrow(/卖出|成员结算/); h.beforeWriteBlock();
      const sale = h.calls.find(call => /FROM ledger_stock_event_lot_allocations/.test(call.sql))!;
      expect(sale.sql).toContain("e.status = 'active'"); expect(sale.sql).toContain("e.event_type IN ('reduce','sell')");
      const closure = h.calls.find(call => /FROM ledger_stock_participation_closures/.test(call.sql))!;
      expect(closure.sql).not.toContain("status = 'active'");
    }
  });
  it('any real member participation (including zero) or enabled observer requires explicit prior removal, never silently deletes', async () => {
    for (const options of [{ members: [{ id: 51, remaining_quantity: 3 }] }, { members: [{ id: 51, remaining_quantity: 0 }] }, { observers: [{ id: 71, quantity: 0, enabled: 1 }] }]) {
      const h = harness(options); await expect(h.run()).rejects.toThrow(/请先在分配中移除/); h.beforeWriteBlock();
    }
    const disabled = harness({ observers: [{ id: 71, quantity: 5, enabled: 0 }] }); await expect(disabled.run()).resolves.toEqual({ success: true });
  });
  it.each(['quantity', 'executionPrice', 'actualTradedAt', 'note'])('stale expected %s blocks all writes', async field => {
    const h = harness(); const value = field === 'quantity' ? 9 : field === 'executionPrice' ? 19 : field === 'actualTradedAt' ? '2026-11-20T05:15:00.000Z' : '旧备注';
    await expect(h.run({ expected: { ...h.input.expected, [field]: value } })).rejects.toThrow(/刷新|覆盖/); h.beforeWriteBlock();
  });
  it('missing/wrong scope, inactive/type/symbol/link and lot economics/date inconsistency fail before any writes', async () => {
    for (const options of [{ missingLot: true }, { missingEvent: true }, { lot: { ledger_id: 52 } }, { lot: { category_id: 302 } },
      { event: { ledger_id: 52 } }, { event: { category_id: 302 } }, { lot: { id: 12 } }, { event: { id: 102 } }, { lot: { opened_event_id: 102 } },
      { event: { status: 'voided' } }, { event: { event_type: 'sell' } }, { event: { symbol: 'MSFT' } },
      { lot: { initial_quantity: '11' } }, { lot: { unit_cost: '21' } }, { lot: { opened_at: '2026-11-20T05:15:00.000Z' } }]) {
      const h = harness(options); await expect(h.run()).rejects.toThrow(/不匹配|有效|不一致/); h.beforeWriteBlock();
    }
  });
  it('NULL/illegal original actual proof and NULL/illegal activation never use registration as fallback', async () => {
    for (const actual_traded_at of [null, 'garbage', '2026-02-30 13:16:00']) {
      const h = harness({ event: { actual_traded_at } });
      await expect(h.run({ expected: { ...h.input.expected, actualTradedAt: '2026-11-20T05:16:00.000Z' } })).rejects.toThrow(); h.beforeWriteBlock();
    }
    for (const activation of [null, '2026-02-30', 'garbage']) {
      const h = harness({ activation }); await expect(h.run()).rejects.toThrow(/历史日结/); h.beforeWriteBlock();
    }
  });
  it('not owner, system admin and viewingAs fail through the actual access checker before transaction or infrastructure', async () => {
    for (const [options, patch] of [[{ ownerId: 999 }, {}], [{}, { isViewingAs: true }], [{ ownerId: 999 }, { systemRole: 'super_admin' }]] as const) {
      const h = harness(options); await expect(h.run(patch)).rejects.toThrow(/所有者|代看/);
      expect(h.getTx).not.toHaveBeenCalled(); expect(h.infrastructure).not.toHaveBeenCalled(); expect(h.ensure).not.toHaveBeenCalled(); expect(h.calls).toEqual([]);
    }
  });
  it('ledger37/safe IDs/reason length and complete bounded expected validation happen before access or transaction', async () => {
    const patches = [{ ledgerId: 52 }, { categoryId: 1.5 }, { lotId: 0 }, { eventId: Infinity }, { userId: NaN }, { reason: '  ' }, { reason: '繁'.repeat(301) }, { expected: undefined }];
    for (const patch of patches) {
      const h = harness(); await expect(h.run(patch)).rejects.toThrow(); expect(h.access).not.toHaveBeenCalled(); expect(h.getTx).not.toHaveBeenCalled();
    }
    for (const patch of [{ quantity: Infinity }, { quantity: 0 }, { quantity: '10' }, { executionPrice: NaN }, { executionPrice: 10_000_001 },
      { actualTradedAt: '2026-02-30T05:16:00.000Z' }, { actualTradedAt: '2026-11-20' }, { note: undefined }, { note: '繁'.repeat(3001) }]) {
      const h = harness(); await expect(h.run({ expected: { ...h.input.expected, ...patch } })).rejects.toThrow(); expect(h.access).not.toHaveBeenCalled(); expect(h.getTx).not.toHaveBeenCalled();
    }
  });
  it.each(['begin', 'void', 'audit', 'dirty', 'commit'] as const)('%s failure rolls back original event/lot and audit with no invalidation/rebuild', async fail => {
    const h = harness({ fail }); await expect(h.run()).rejects.toThrow(`FAIL_${fail}`);
    expect(h.state()).toEqual(h.original); expect(h.audits()).toEqual([]); expect(h.tx.rollback).toHaveBeenCalledOnce(); expect(h.tx.release).toHaveBeenCalledOnce();
    expect(h.invalidate).not.toHaveBeenCalled(); expect(h.rebuild).not.toHaveBeenCalled();
  });
  it.each(['void', 'audit', 'dirty'] as const)('A/crypto crossing 15:05 at %s rechecks, rolls all writes back and never commits', async advanceAt => {
    for (const crypto of [false, true]) {
      vi.setSystemTime(new Date('2026-11-20T07:04:59.000Z'));
      const h = harness({ crypto, advanceAt, activation: '2026-11-18' }); await expect(h.run()).rejects.toThrow(/历史日结/);
      expect(h.writes()).toHaveLength(advanceAt === 'void' ? 1 : 2); expect(h.tx.commit).not.toHaveBeenCalled(); expect(h.tx.rollback).toHaveBeenCalledOnce();
      expect(h.state()).toEqual(h.original); expect(h.audits()).toEqual([]); expect(h.invalidate).not.toHaveBeenCalled(); expect(h.rebuild).not.toHaveBeenCalled();
    }
  });
  it('failed conditional active status update rolls back, no audit', async () => {
    const h = harness({ affectedRows: 0 }); await expect(h.run()).rejects.toThrow(/状态已变化/);
    expect(h.writes()).toHaveLength(1); expect(h.audits()).toEqual([]); expect(h.tx.rollback).toHaveBeenCalledOnce(); expect(h.tx.commit).not.toHaveBeenCalled();
  });
  it('repeat cancellation is rejected under locks without creating a second audit', async () => {
    const h = harness(); await h.run(); await expect(h.run()).rejects.toThrow(/有效/);
    expect(h.writes()).toHaveLength(2); expect(h.audits()).toHaveLength(1); expect(h.tx.commit).toHaveBeenCalledOnce(); expect(h.tx.rollback).toHaveBeenCalledOnce();
  });
  it('complete audit TEXT overflow is rejected before writes, not truncated', async () => {
    const h = harness({ event: { note: '繁'.repeat(30000) } });
    await expect(h.run()).rejects.toThrow(/审计|过长/); h.beforeWriteBlock();
  });
});
