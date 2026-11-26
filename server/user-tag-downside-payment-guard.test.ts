import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Install the real TCP tripwire BEFORE any application import. This also catches a
// CommonJS/builtin import that bypasses Vitest's node:net/net module mocks.
const offline = vi.hoisted(() => {
  const attempts: string[] = [];
  const block = (name: string) => vi.fn((..._args: unknown[]): never => {
    attempts.push(name);
    throw new Error(`OFFLINE TEST: ${name} forbidden; no real DB/network allowed`);
  });
  const realNet = process.getBuiltinModule('net') as typeof import('node:net');
  const tcp = vi.spyOn(realNet.Socket.prototype, 'connect').mockImplementation(function (): never {
    attempts.push('real Socket.connect');
    throw new Error('OFFLINE TEST: all real TCP/network connections forbidden');
  });
  const netConnect = vi.spyOn(realNet, 'connect').mockImplementation(block('real net.connect'));
  const netCreateConnection = vi.spyOn(realNet, 'createConnection').mockImplementation(block('real net.createConnection'));
  const netCreateServer = vi.spyOn(realNet, 'createServer').mockImplementation(block('real net.createServer'));
  const realDgram = process.getBuiltinModule('dgram') as typeof import('node:dgram');
  const udp = vi.spyOn(realDgram, 'createSocket').mockImplementation(block('real UDP socket'));
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(block('real fetch'));
  const mysql = {
    createPool: block('MySQL pool'), createConnection: block('MySQL connection'),
    createPoolCluster: block('MySQL pool cluster'),
  };
  const net = {
    Socket: realNet.Socket, connect: block('mock net.connect'),
    createConnection: block('mock net.createConnection'), createServer: block('mock net.createServer'),
  };
  const db = {
    getDbTransactionConnection: block('DB transaction acquisition'), getDb: block('DB acquisition'),
    getLedgerDb: block('ledger DB acquisition'), getDbConnection: block('DB connection acquisition'),
  };
  return { attempts, tcp, netConnect, netCreateConnection, netCreateServer, udp, fetch, mysql, net, db };
});
vi.mock('./db', () => offline.db);
vi.mock('mysql2', () => ({ default: offline.mysql, ...offline.mysql }));
vi.mock('mysql2/promise', () => ({ default: offline.mysql, ...offline.mysql }));
vi.mock('node:net', () => ({ default: offline.net, ...offline.net }));
vi.mock('net', () => ({ default: offline.net, ...offline.net }));

// All application imports use ONE static path. Never resetModules/import a new
// query-suffixed path, import routers/db implementation, or invoke override saves.
import { getDbTransactionConnection } from './db';
import mysql from 'mysql2';
import mysqlPromise from 'mysql2/promise';
import nodeNet from 'node:net';
import bareNet from 'net';
import * as overrideStore from './user-tag-downside-overrides';
import { assertUserTagOverridePaymentVersion } from './user-tag-downside-payment-guard';
import type { UserTagDownsideOverride } from '../shared/user-tag-downside-override';

const actualCategoryReader = overrideStore.readUserTagDownsideCategoryOverrides;
const input = { ledgerId: 37 as const, categoryId: 10, targetUserId: 20, actorUserId: 7, expectedVersion: 0 };
const ledger = { id: 37, ownerId: 7 };
const category = { id: 10, ledgerId: 37, parentId: null, isDefault: 0, accountingMode: 'stock_portfolio' };
const member = { id: 800, ledgerId: 37, userId: 20, memberType: 'real', realUserId: 20 };
const stored = (patch: Record<string, unknown> = {}) => ({ ledger_id: 37, category_id: 10, target_user_id: 20,
  actor_user_id: 7, version: 1, mode: 'exempt', created_at: '2026-11-26T00:00:00.123000Z', ...patch });
const decoded = (version: number, patch: Partial<UserTagDownsideOverride> = {}): UserTagDownsideOverride => ({
  ledgerId: 37, categoryId: 10, targetUserId: 20, actorUserId: 7, version,
  mode: 'exempt', createdAt: '2026-11-26T00:00:00.123000Z', ...patch,
});
type Stage = 'ledger' | 'category' | 'realmember' | 'override';
type FixtureOptions = {
  ledgerRows?: unknown; categoryRows?: unknown; memberRows?: unknown; overrideRows?: unknown;
  failure?: { at: Stage; error: Error };
};
function fixture(options: FixtureOptions = {}) {
  const events: Stage[] = [];
  const forbidden = (name: string) => vi.fn((): never => { throw new Error(`OFFLINE TEST: caller owns ${name}`); });
  const connection = {
    execute: vi.fn(async (sql: string, params: unknown[]) => {
      // A changed implementation cannot write even to the fake connection.
      expect(sql).toMatch(/^SELECT\b/);
      expect(sql.replace(/FOR UPDATE/g, '')).not.toMatch(/\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE|REPLACE|CALL|BEGIN|COMMIT|ROLLBACK)\b/i);
      expect(sql).not.toMatch(/;|wallet|dividend_records|ledger_records|initial_balances/i);
      let stage: Stage;
      let result: unknown;
      if (sql.includes('FROM ledgers')) {
        stage = 'ledger'; result = options.ledgerRows ?? [ledger];
        expect(params).toEqual([37]);
      } else if (sql.includes('FROM ledger_categories')) {
        stage = 'category'; result = options.categoryRows ?? [category];
        expect(params).toEqual([37, 10]);
        expect(sql).toContain('WHERE ledgerId=? AND id=?');
      } else if (sql.includes('FROM ledger_members')) {
        stage = 'realmember'; result = options.memberRows ?? [member];
        expect(params).toEqual([37, 20]);
        expect(sql).toContain('INNER JOIN users u ON u.id=m.userId');
        expect(sql).toContain("m.member_type='real'");
      } else if (sql.includes('FROM ledger_user_tag_downside_overrides')) {
        stage = 'override'; result = options.overrideRows ?? [];
        expect(params).toEqual([37, 20, 10]);
        expect(sql).toContain('WHERE ledger_id=? AND target_user_id=? AND category_id=?');
        expect(sql).toContain('ORDER BY target_user_id,category_id,version');
        // The ledger lock serializes override saves; the actual read-only store
        // deliberately reads all versions, not a fabricated fourth FOR UPDATE.
        expect(sql).not.toMatch(/FOR UPDATE|LIMIT|NOW\(|CURRENT_DATE|created_at\s*[<>]|effective_at|start_date/i);
      } else {
        throw new Error(`Unexpected SQL in offline payment-guard fixture: ${sql}`);
      }
      if (stage !== 'override') expect(sql).toMatch(/FOR UPDATE$/);
      events.push(stage);
      if (options.failure?.at === stage) throw options.failure.error;
      return [result];
    }),
    query: forbidden('query'), beginTransaction: forbidden('beginTransaction'),
    commit: forbidden('commit'), rollback: forbidden('rollback'), release: forbidden('release'),
    end: forbidden('end'), destroy: forbidden('destroy'),
  };
  const result = { events, connection };
  fixtures.push(result);
  return result;
}
let fixtures: ReturnType<typeof fixture>[] = [];
let reader: ReturnType<typeof vi.spyOn<typeof overrideStore, 'readUserTagDownsideCategoryOverrides'>>;
function mockVersions(f: ReturnType<typeof fixture>, versions: UserTagDownsideOverride[] = []) {
  reader.mockImplementation(async (conn, ledgerId, targetUserId, categoryId) => {
    expect(conn).toBe(f.connection);
    expect([ledgerId, targetUserId, categoryId]).toEqual([37, 20, 10]);
    f.events.push('override');
    return versions;
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  fixtures = [];
  reader = vi.spyOn(overrideStore, 'readUserTagDownsideCategoryOverrides').mockImplementation(actualCategoryReader);
});
afterEach(() => {
  try {
    // Attempts are recorded outside clearAllMocks: even swallowed network errors
    // or DB acquisition attempts must fail the entire test, never quietly pass.
    expect(offline.attempts).toEqual([]);
    for (const blocked of [...Object.values(offline.db), ...Object.values(offline.mysql),
      offline.tcp, offline.netConnect, offline.netCreateConnection, offline.netCreateServer,
      offline.net.connect, offline.net.createConnection, offline.net.createServer, offline.udp, offline.fetch]) {
      expect(blocked).not.toHaveBeenCalled();
    }
    for (const f of fixtures) {
      for (const name of ['query', 'beginTransaction', 'commit', 'rollback', 'release', 'end', 'destroy'] as const) {
        expect(f.connection[name]).not.toHaveBeenCalled();
      }
      expect(f.connection.execute.mock.calls.every(([sql]) => /^SELECT\b/.test(sql))).toBe(true);
    }
  } finally { reader.mockRestore(); }
});
afterAll(() => {
  try { expect(offline.attempts).toEqual([]); }
  finally {
    // Restore only after all application/test activity is complete.
    for (const spy of [offline.tcp, offline.netConnect, offline.netCreateConnection, offline.netCreateServer, offline.udp, offline.fetch]) spy.mockRestore();
  }
});

describe('offline import boundaries and caller-owned SELECT-only payment guard', () => {
  it('resolves the top-level DB/MySQL/both net mocks without running any real implementation', () => {
    expect(getDbTransactionConnection).toBe(offline.db.getDbTransactionConnection);
    expect(mysql.createPool).toBe(offline.mysql.createPool);
    expect(mysqlPromise.createConnection).toBe(offline.mysql.createConnection);
    expect(nodeNet.connect).toBe(offline.net.connect);
    expect(bareNet.createConnection).toBe(offline.net.createConnection);
    expect(vi.isMockFunction(offline.tcp)).toBe(true);
  });
  it.each(['stock_portfolio', 'manual_balance'])('locks ledger → %s category → real member before exact target override read', async accountingMode => {
    const f = fixture({ categoryRows: [{ ...category, accountingMode }] }); mockVersions(f);
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).resolves.toBeUndefined();
    expect(f.events).toEqual(['ledger', 'category', 'realmember', 'override']);
    expect(f.connection.execute).toHaveBeenCalledTimes(3);
    expect(f.connection.execute.mock.calls.every(([sql]) => sql.endsWith('FOR UPDATE'))).toBe(true);
    expect(reader).toHaveBeenCalledOnce();
    expect(reader).toHaveBeenCalledWith(f.connection, 37, 20, 10);
  });
  it('uses actor actualowner for authorization and a DIFFERENT target user for membership/configuration', async () => {
    const f = fixture(); mockVersions(f, [decoded(3)]);
    await assertUserTagOverridePaymentVersion(f.connection, { ...input, expectedVersion: 3 });
    expect(input.actorUserId).not.toBe(input.targetUserId);
    expect(f.connection.execute.mock.calls[2][1]).toEqual([37, input.targetUserId]);
    expect(reader).toHaveBeenCalledWith(f.connection, 37, input.targetUserId, 10);
  });
  it.each([
    { ledgerId: 38 }, { ledgerId: '37' }, { categoryId: 0 }, { categoryId: 1.5 }, { categoryId: '10' },
    { targetUserId: -1 }, { targetUserId: NaN }, { targetUserId: '20' }, { targetUserId: Number.MAX_SAFE_INTEGER + 1 },
    { actorUserId: 0 }, { actorUserId: true }, { actorUserId: Infinity },
    { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: '0' },
    { expectedVersion: undefined }, { expectedVersion: NaN }, { expectedVersion: Infinity },
    { expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
  ])('invalid candidate scope/version rejects BEFORE SQL %j', async patch => {
    const f = fixture(); mockVersions(f);
    await expect(assertUserTagOverridePaymentVersion(f.connection, { ...input, ...patch } as any)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(f.events).toEqual([]); expect(reader).not.toHaveBeenCalled();
  });
  it.each([null, undefined, {}, { execute: undefined }])('missing caller connection fails without acquiring another connection %j', async conn => {
    await expect(assertUserTagOverridePaymentVersion(conn, input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(reader).not.toHaveBeenCalled();
  });
  it.each([
    { rows: [], actorUserId: 7 }, { rows: [{ id: 38, ownerId: 7 }], actorUserId: 7 },
    { rows: [ledger, ledger], actorUserId: 7 }, { rows: [{ id: 37, ownerId: 8 }], actorUserId: 7 },
    { rows: [ledger], actorUserId: 20 },
  ])('nonowner/changed actualowner/missing or ambiguous ledger stops after FIRST lock %j', async ({ rows, actorUserId }) => {
    const f = fixture({ ledgerRows: rows }); mockVersions(f);
    await expect(assertUserTagOverridePaymentVersion(f.connection, { ...input, actorUserId })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(f.events).toEqual(['ledger']); expect(reader).not.toHaveBeenCalled();
  });
  it.each([{ id: 11 }, { ledgerId: 38 }, { parentId: 1 }, { parentId: 0 }, { isDefault: 1 },
    { accountingMode: 'ordinary' }, { accountingMode: null }])('changed category scope rejects before member/config lock %j', async patch => {
    const f = fixture({ categoryRows: [{ ...category, ...patch }] }); mockVersions(f);
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(f.events).toEqual(['ledger', 'category']); expect(reader).not.toHaveBeenCalled();
  });
  it.each([{ rows: [] }, { rows: [category, category] }])('missing/ambiguous category does not read member or overrides %j', async ({ rows }) => {
    const f = fixture({ categoryRows: rows }); mockVersions(f);
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(f.events).toEqual(['ledger', 'category']); expect(reader).not.toHaveBeenCalled();
  });
  it.each([{ ledgerId: 38 }, { userId: 21 }, { realUserId: 21 }, { realUserId: null },
    { memberType: 'ai' }, { memberType: 'virtual' }, { memberType: undefined }])('cross-ledger/AI/fake/mismatched real member rejects before override read %j', async patch => {
    const f = fixture({ memberRows: [{ ...member, ...patch }] }); mockVersions(f);
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(f.events).toEqual(['ledger', 'category', 'realmember']); expect(reader).not.toHaveBeenCalled();
  });
  it.each([{ rows: [] }, { rows: [member, member] }])('removed or duplicate real membership rejects before override read %j', async ({ rows }) => {
    const f = fixture({ memberRows: rows }); mockVersions(f);
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(f.events).toEqual(['ledger', 'category', 'realmember']); expect(reader).not.toHaveBeenCalled();
  });
  it.each(['ledger', 'category', 'realmember'] as const)('non-array %s lock result is fail-closed', async stage => {
    const key = { ledger: 'ledgerRows', category: 'categoryRows', realmember: 'memberRows' }[stage];
    const f = fixture({ [key]: { affectedRows: 0 } }); mockVersions(f);
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(reader).not.toHaveBeenCalled();
  });
  it.each(['ledger', 'category', 'realmember'] as const)('%s lock DB error propagates unchanged, no version-zero fallback or transaction cleanup', async at => {
    const error = new Error(`offline ${at} SELECT failure`);
    const f = fixture({ failure: { at, error } }); mockVersions(f);
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toBe(error);
    expect(reader).not.toHaveBeenCalled();
  });
});

describe('locked candidate version comparison with isolated read-only store', () => {
  it('takes the MAX of all versions, not row order, audit date, saved actor, or mode', async () => {
    const f = fixture();
    mockVersions(f, [decoded(9, { mode: 'follow_tag', createdAt: '9999-12-31T00:00:00.000000Z', actorUserId: 8 }), decoded(2), decoded(5)]);
    await expect(assertUserTagOverridePaymentVersion(f.connection, { ...input, expectedVersion: 9 })).resolves.toBeUndefined();
    expect(f.events).toEqual(['ledger', 'category', 'realmember', 'override']);
  });
  it.each([
    { versions: [decoded(1)], expectedVersion: 0 }, // changed after candidate calculation
    { versions: [decoded(3), decoded(1)], expectedVersion: 1 },
    { versions: [decoded(3, { mode: 'exempt' }), decoded(1, { mode: 'exempt' })], expectedVersion: 1 }, // same mode still new revision
    { versions: [decoded(1)], expectedVersion: 2 }, { versions: [], expectedVersion: 1 },
  ])('stale/newer/missing candidate revision rejects with CONFLICT, never pays stale PnL %j', async ({ versions, expectedVersion }) => {
    const f = fixture(); mockVersions(f, versions);
    await expect(assertUserTagOverridePaymentVersion(f.connection, { ...input, expectedVersion })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.events).toEqual(['ledger', 'category', 'realmember', 'override']);
  });
  it('re-reads each invocation so a concurrent revision is rejected rather than cached', async () => {
    const f = fixture();
    reader.mockResolvedValueOnce([decoded(1)]).mockResolvedValueOnce([decoded(2)]);
    await assertUserTagOverridePaymentVersion(f.connection, { ...input, expectedVersion: 1 });
    await expect(assertUserTagOverridePaymentVersion(f.connection, { ...input, expectedVersion: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(reader).toHaveBeenCalledTimes(2); expect(f.connection.execute).toHaveBeenCalledTimes(6);
  });
  it('store rejection is not swallowed into an absent/default version', async () => {
    const f = fixture(); const error = new Error('offline corrupt/read error');
    reader.mockRejectedValue(error);
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toBe(error);
    expect(reader).toHaveBeenCalledOnce();
    expect(reader).toHaveBeenCalledWith(f.connection, 37, 20, 10);
  });
});

describe('actual statically imported SELECT-only store + fake connection compatibility', () => {
  it('empty history is version 0; three FOR UPDATE locks precede one actual scoped history SELECT', async () => {
    const f = fixture();
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).resolves.toBeUndefined();
    expect(f.events).toEqual(['ledger', 'category', 'realmember', 'override']);
    expect(f.connection.execute).toHaveBeenCalledTimes(4);
    expect(f.connection.execute.mock.calls.filter(([sql]) => sql.includes('FOR UPDATE'))).toHaveLength(3);
  });
  it.each([{ code: 'ER_NO_SUCH_TABLE' }, { errno: 1146 }])('ONLY missing override table defaults to version 0 without DDL %j', async patch => {
    const error = Object.assign(new Error('offline missing override table'), patch);
    const f = fixture({ failure: { at: 'override', error } });
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).resolves.toBeUndefined();
    await expect(assertUserTagOverridePaymentVersion(f.connection, { ...input, expectedVersion: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(f.events).toEqual(['ledger', 'category', 'realmember', 'override', 'ledger', 'category', 'realmember', 'override']);
  });
  it('actual store decodes numeric versions and the guard compares full history maximum', async () => {
    const f = fixture({ overrideRows: [stored({ version: '2' }), stored({ version: '5', mode: 'follow_tag' }), stored()] });
    await assertUserTagOverridePaymentVersion(f.connection, { ...input, expectedVersion: 5 });
    await expect(assertUserTagOverridePaymentVersion(f.connection, { ...input, expectedVersion: 2 })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it.each([{ mode: 'raw' }, { version: 0 }, { version: 'NaN' }, { created_at: '2026-02-30T00:00:00.000000Z' },
    { ledger_id: 38 }, { category_id: 11 }, { target_user_id: 21 }])('corrupt persisted config or query scope never falls back to version 0 %j', async patch => {
    const f = fixture({ overrideRows: [stored(patch)] });
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(f.events).toEqual(['ledger', 'category', 'realmember', 'override']);
  });
  it.each([{ rows: [stored(), stored()] }, { rows: { affectedRows: 0 } }])('duplicate saved revisions or malformed store result is not absent history %j', async ({ rows }) => {
    const f = fixture({ overrideRows: rows });
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
  it.each([
    new Error('offline timeout'), Object.assign(new Error('offline denied'), { errno: 1142 }),
    Object.assign(new Error('offline connection reset'), { code: 'ECONNRESET' }),
  ])('non-missing-table store DB error propagates, never resets candidate to 0 %j', async error => {
    const f = fixture({ failure: { at: 'override', error } });
    await expect(assertUserTagOverridePaymentVersion(f.connection, input)).rejects.toBe(error);
    expect(f.events).toEqual(['ledger', 'category', 'realmember', 'override']);
  });
});

// Source parsing ONLY: no import, transpilation, eval, vm execution or router calls.
const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const routerAst = ts.createSourceFile('routers.ts', routerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function descendants<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root); return result;
}
function route(name: string): ts.Expression {
  const matches = descendants(routerAst, ts.isPropertyAssignment).filter(node => node.name.getText(routerAst) === name);
  expect(matches, `unique router property ${name}`).toHaveLength(1);
  return matches[0].initializer;
}
function calls(root: ts.Node, name: string): ts.CallExpression[] {
  return descendants(root, ts.isCallExpression).filter(node => node.expression.getText(routerAst) === name);
}
function onlyCall(root: ts.Node, name: string): ts.CallExpression {
  const matches = calls(root, name); expect(matches, `unique ${name} call`).toHaveLength(1); return matches[0];
}
function enclosing<T extends ts.Node>(node: ts.Node, predicate: (parent: ts.Node) => parent is T): T {
  let current = node.parent;
  while (current && !predicate(current)) current = current.parent;
  if (!current) throw new Error('Missing expected AST ancestor');
  return current as T;
}
function objectArguments(call: ts.CallExpression): Record<string, string> {
  expect(call.arguments[0].getText(routerAst)).toBe('transaction');
  const value = call.arguments[1]; expect(ts.isObjectLiteralExpression(value)).toBe(true);
  return Object.fromEntries((value as ts.ObjectLiteralExpression).properties.map(property => {
    if (!ts.isPropertyAssignment(property)) throw new Error('Expected explicit scope/version binding');
    return [property.name.getText(routerAst), property.initializer.getText(routerAst)];
  }));
}
const wiringCases = [
  { name: 'settleLedger37PausedTag', condition: '!ordinaryReadback.applicable',
    user: 'input.targetUserId', tag: 'input.tagName', category: 'Number(category.id)', version: 'availabilityTag?.userTagOverrideVersion',
    overwrite: 'cumulativeReturn = Math.round(ordinaryReadback.cumulativeReturn * 100) / 100' },
  { name: 'adminExecuteLedger37DividendBatch', condition: '!ordinaryReadback.applicable && candidate.categoryId !== undefined',
    user: 'candidate.userId', tag: 'candidate.tagName', category: 'candidate.categoryId', version: 'candidate.userTagOverrideVersion',
    overwrite: 'lockedCumulativeReturn = roundCny(ordinaryReadback.cumulativeReturn)' },
];
describe('routers source AST wiring only; stock notApplicable CAS and ordinary full readback', () => {
  it.each(wiringCases)('$name passes the SERVER candidate version and separate actor/target only in notApplicable branch', config => {
    const node = route(config.name);
    const guard = onlyCall(node, 'assertUserTagOverridePaymentVersion');
    expect(objectArguments(guard)).toEqual({ ledgerId: 'LEDGER_37_ID', categoryId: config.category,
      targetUserId: config.user, actorUserId: 'ctx.user.id', expectedVersion: config.version });
    const branch = enclosing(guard, ts.isIfStatement);
    expect(branch.expression.getText(routerAst)).toBe(config.condition);
    expect(guard.getStart(routerAst)).toBeGreaterThan(branch.thenStatement.getStart(routerAst));
    expect(branch.thenStatement.getText(routerAst)).toContain("import('./user-tag-downside-payment-guard')");
    const tx = enclosing(guard, ts.isTryStatement);
    const begin = onlyCall(tx.tryBlock, 'transaction.beginTransaction');
    const readback = onlyCall(tx.tryBlock, 'readOrdinaryTagDownsidePaymentReturn');
    expect(begin.getStart(routerAst)).toBeLessThan(readback.getStart(routerAst));
    expect(readback.getStart(routerAst)).toBeLessThan(guard.getStart(routerAst));
    const sqlCalls = calls(tx.tryBlock, 'transaction.execute'); expect(sqlCalls.length).toBeGreaterThan(0);
    expect(guard.getStart(routerAst)).toBeLessThan(sqlCalls[0].getStart(routerAst));
    for (const name of ['createLedger37Dividend', 'recoverLedger37Dividend', 'releaseLedger37WalletHold']) {
      for (const payment of calls(tx.tryBlock, name)) expect(guard.getStart(routerAst)).toBeLessThan(payment.getStart(routerAst));
    }
  });
  it.each(wiringCases)('$name retains complete ordinary lock/readback readiness checks and uses readback return, not candidate CAS alone', config => {
    const node = route(config.name); const readback = onlyCall(node, 'readOrdinaryTagDownsidePaymentReturn');
    expect(objectArguments(readback)).toEqual({ ledgerId: 'LEDGER_37_ID', userId: config.user, tagName: config.tag,
      actorUserId: 'ctx.user.id', expectedCategoryId: config.category, today: 'getBeijingLedgerRecordToday()' });
    const applicable = descendants(node, ts.isIfStatement).filter(branch => branch.expression.getText(routerAst) === 'ordinaryReadback.applicable');
    expect(applicable).toHaveLength(1);
    const text = applicable[0].thenStatement.getText(routerAst);
    expect(text).toContain("ordinaryReadback.status !== 'ready'");
    expect(text).toContain('ordinaryReadback.cumulativeReturn === null');
    expect(text).toContain('!Number.isFinite(ordinaryReadback.cumulativeReturn)');
    expect(text).toContain("code: 'PRECONDITION_FAILED'");
    expect(text).toContain('throw new TRPCError');
    expect(text).toContain(config.overwrite);
    expect(calls(applicable[0].thenStatement, 'assertUserTagOverridePaymentVersion')).toEqual([]);
  });
  it('batch candidate captures exact snapshot override version without zero fallback or using actor as target', () => {
    const node = route('adminExecuteLedger37DividendBatch'); const push = onlyCall(node, 'candidates.push');
    const candidate = push.arguments[0]; expect(ts.isObjectLiteralExpression(candidate)).toBe(true);
    const properties = Object.fromEntries((candidate as ts.ObjectLiteralExpression).properties.map(property => {
      if (!ts.isPropertyAssignment(property)) throw new Error('Expected explicit candidate binding');
      return [property.name.getText(routerAst), property.initializer.getText(routerAst)];
    }));
    expect(properties.userTagOverrideVersion).toBe('tag.userTagOverrideVersion');
    expect(properties.userId).toBe('Number(member.userId)');
    expect(properties.categoryId).toBe('Number.isSafeInteger(tag.categoryId) && tag.categoryId > 0 ? tag.categoryId : undefined');
    const source = node.getText(routerAst);
    expect(source).toContain('Number(member.userId) !== input.targetUserId');
    expect(source).toContain('const candidate = candidates[index]');
    expect(source).not.toMatch(/userTagOverrideVersion\s*(?:\?\?|\|\|)\s*0/);
  });
  it('paused candidate is selected by target user/tag and is not replaced by zero on missing version', () => {
    const node = route('settleLedger37PausedTag');
    const declaration = descendants(node, ts.isVariableDeclaration).filter(item => item.name.getText(routerAst) === 'availabilityTag');
    expect(declaration).toHaveLength(1);
    const selection = declaration[0].initializer!.getText(routerAst);
    expect(selection).toContain('Number(member.userId) === input.targetUserId');
    expect(selection).toContain('String(tag.tagName) === input.tagName');
    expect(objectArguments(onlyCall(node, 'assertUserTagOverridePaymentVersion')).expectedVersion).toBe('availabilityTag?.userTagOverrideVersion');
  });
  it('guard source has only static lightweight store/TRPC imports and no transaction lifetime or financial write calls', () => {
    const source = readFileSync(new URL('./user-tag-downside-payment-guard.ts', import.meta.url), 'utf8');
    const ast = ts.createSourceFile('guard.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const imports = descendants(ast, ts.isImportDeclaration).map(node => (node.moduleSpecifier as ts.StringLiteral).text);
    expect(imports).toEqual(['@trpc/server', './user-tag-downside-overrides']);
    expect(descendants(ast, ts.isCallExpression).some(node => node.expression.kind === ts.SyntaxKind.ImportKeyword)).toBe(false);
    expect(source).not.toMatch(/\.(?:beginTransaction|commit|rollback|release|end|destroy|query)\s*\(/);
    expect(source).not.toMatch(/\b(?:createLedger37Dividend|recoverLedger37Dividend|setUserTagDownsideOverride|createPool|createConnection)\s*\(/);
  });
});
