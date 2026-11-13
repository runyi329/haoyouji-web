import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { TRPCError } from '@trpc/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
  afEffectiveOrderStatusSql,
  getAfGiftActivationError,
} from '../shared/af-gift-order-state';

// Do not import server/routers, any DB module, or business entry points here:
// routers starts timers and DB modules may access/migrate the production database.
// This suite executes the actual helper-generated CASE SQL in Python's standard
// library SQLite, always with ':memory:' and query_only enabled after fixtures.
// Integrated route contracts below read text/AST only; no route module is loaded.
type OrderRow = {
  id: number;
  ledger_id: number;
  is_gift: number | null;
  side: string;
  status: string | null;
  source_order_id: number | null;
  sell_status: string | null;
  sell_confirmed_at: string | null;
  buy_confirmed_at: string | null;
  quantity: number;
  fee: number;
};
type SqlResultRow = Record<string, string | number | null>;
type SqlQuery = { sql: string; params?: Array<string | number | null> };
type SqlResult = {
  results: SqlResultRow[][];
  before: OrderRow[];
  after: OrderRow[];
  readOnly: number;
};

const pythonSqlite = String.raw`
import json
import sqlite3
import sys

payload = json.load(sys.stdin)
connection = sqlite3.connect(':memory:')
connection.row_factory = sqlite3.Row
connection.execute('''
CREATE TABLE af_orders (
  id INTEGER PRIMARY KEY,
  ledger_id INTEGER NOT NULL,
  is_gift INTEGER,
  side TEXT NOT NULL,
  status TEXT,
  source_order_id INTEGER,
  sell_status TEXT,
  sell_confirmed_at TEXT,
  buy_confirmed_at TEXT,
  quantity REAL NOT NULL,
  fee REAL NOT NULL
)
''')
columns = ['id', 'ledger_id', 'is_gift', 'side', 'status', 'source_order_id',
           'sell_status', 'sell_confirmed_at', 'buy_confirmed_at', 'quantity', 'fee']
connection.executemany(
    'INSERT INTO af_orders (' + ', '.join(columns) + ') VALUES (' + ', '.join('?' for _ in columns) + ')',
    [[row[column] for column in columns] for row in payload['rows']]
)
connection.commit()
connection.execute('PRAGMA query_only = ON')
before = [dict(row) for row in connection.execute('SELECT * FROM af_orders ORDER BY id')]
results = []
for query in payload['queries']:
    results.append([dict(row) for row in connection.execute(query['sql'], query.get('params', []))])
after = [dict(row) for row in connection.execute('SELECT * FROM af_orders ORDER BY id')]
read_only = connection.execute('PRAGMA query_only').fetchone()[0]
connection.close()
print(json.dumps({'results': results, 'before': before, 'after': after, 'readOnly': read_only}))
`;

function runOfflineSql(rows: OrderRow[], queries: SqlQuery[]): SqlResult {
  const fixtureSnapshot = JSON.stringify(rows);
  const child = spawnSync('python3', ['-c', pythonSqlite], {
    input: JSON.stringify({ rows, queries }),
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    // No project DB settings are forwarded to the offline subprocess.
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', PYTHONIOENCODING: 'utf-8' },
  });
  if (child.error) throw new Error(`Offline Python SQLite unavailable: ${child.error.message}`);
  if (child.status !== 0) throw new Error(`Offline SQLite query failed: ${child.stderr}`);
  const result = JSON.parse(child.stdout) as SqlResult;
  expect(result.readOnly).toBe(1);
  expect(result.after).toEqual(result.before);
  expect(result.before).toEqual([...rows].sort((a, b) => a.id - b.id));
  expect(JSON.stringify(rows)).toBe(fixtureSnapshot);
  return result;
}

function parent(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1179, ledger_id: 52, is_gift: 0, side: 'buy', status: 'cancelled',
    source_order_id: null, sell_status: null, sell_confirmed_at: null,
    buy_confirmed_at: null, quantity: 100, fee: 10, ...overrides,
  };
}

function gift(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1180, ledger_id: 52, is_gift: 1, side: 'buy', status: 'pending',
    source_order_id: 1179, sell_status: null, sell_confirmed_at: null,
    buy_confirmed_at: null, quantity: 10, fee: 2, ...overrides,
  };
}

function effectiveStatus(rows: OrderRow[], alias = 'o', orderId = 1180) {
  return runOfflineSql(rows, [{
    sql: `SELECT ${afEffectiveOrderStatusSql(alias)} AS effective_status FROM af_orders ${alias} WHERE ${alias}.id = ?`,
    params: [orderId],
  }]).results[0][0]?.effective_status;
}

const canceledReason = '正单已撤销，关联赠单已作废，不能重新委买、确认成交或卖出';
const missingReason = '未找到同账本的有效正单，已阻止赠单成交或卖出，请核查关联订单';
const incompleteReason = '正单尚未成交，不能单独确认赠单成交或卖出';
type ActivationInput = Parameters<typeof getAfGiftActivationError>[0];
function activationInput(overrides: Partial<ActivationInput> = {}): ActivationInput {
  return { ledgerId: 52, isGift: 1, sourceStatus: 'cancelled', ...overrides };
}

// SQL expectations are intentionally evaluated, not regex-matched against the CASE.
describe('AF52 gift effective order status: real offline SQLite execution', () => {
  it('1179 cancelled without confirmation makes raw pending 1180/1181 effectively cancelled without creating fills', () => {
    const rows = [parent(), gift(), gift({ id: 1181 })];
    const result = runOfflineSql(rows, [{
      sql: `SELECT o.id, o.status AS raw_status, ${afEffectiveOrderStatusSql('o')} AS status,
        o.buy_confirmed_at, o.sell_confirmed_at FROM af_orders o ORDER BY o.id`,
    }]);
    expect(result.results[0]).toEqual([
      { id: 1179, raw_status: 'cancelled', status: 'cancelled', buy_confirmed_at: null, sell_confirmed_at: null },
      { id: 1180, raw_status: 'pending', status: 'cancelled', buy_confirmed_at: null, sell_confirmed_at: null },
      { id: 1181, raw_status: 'pending', status: 'cancelled', buy_confirmed_at: null, sell_confirmed_at: null },
    ]);
    expect(result.after.filter(row => row.is_gift === 1).map(row => row.status)).toEqual(['pending', 'pending']);
  });

  it.each(['pending', 'completed'])('unsold raw %s gift becomes cancelled', status => {
    expect(effectiveStatus([parent(), gift({ status })])).toBe('cancelled');
  });

  it.each([null, '', 'pending', 'holding', 'selling', 'cancelled'])('unsold sell_status %s does not keep a canceled-source gift active', sell_status => {
    expect(effectiveStatus([parent(), gift({ status: 'completed', sell_status })])).toBe('cancelled');
  });

  it.each(['pending', 'completed'])('actual sold history preserves raw %s even when source is cancelled', status => {
    expect(effectiveStatus([parent(), gift({ status, sell_status: 'sold' })])).toBe(status);
  });

  it.each([
    ['pending', null, '2026-11-01 09:00:00'],
    ['completed', 'selling', '2026-11-01 09:00:00'],
    ['completed', 'sold', '2026-11-01 09:00:00'],
    ['pending', null, ''],
  ] as const)('sell-confirmed audit row status=%s sell_status=%s confirmed=%s is preserved', (status, sell_status, sell_confirmed_at) => {
    expect(effectiveStatus([parent(), gift({ status, sell_status, sell_confirmed_at })])).toBe(status);
  });

  it('a gift buy confirmation alone does not exempt an unsold completed gift from cancellation', () => {
    expect(effectiveStatus([parent(), gift({ status: 'completed', buy_confirmed_at: '2026-10-01 10:00:00' })])).toBe('cancelled');
  });

  it('source cancelled status stays authoritative even if historical source buy confirmation exists', () => {
    expect(effectiveStatus([parent({ buy_confirmed_at: '2026-10-01 10:00:00' }), gift()])).toBe('cancelled');
  });

  it.each(['cancelled', 'sold', 'selling', 'rejected', null])('raw status %s outside pending/completed is untouched', status => {
    expect(effectiveStatus([parent(), gift({ status })])).toBe(status);
  });

  it.each([37, 51, 53])('ledger %i gifts are not subject to AF52 cancellation policy', ledger_id => {
    expect(effectiveStatus([parent({ ledger_id }), gift({ ledger_id })])).toBe('pending');
  });

  it.each([0, null, 2])('non-gift marker %s remains unchanged', is_gift => {
    expect(effectiveStatus([parent(), gift({ is_gift })])).toBe('pending');
  });

  it.each(['pending', 'completed', 'sold', null])('source status %s does not imply cancellation or automatic gift fill', status => {
    expect(effectiveStatus([parent({ status }), gift()])).toBe('pending');
  });

  it('completed source does not rewrite a raw pending gift to completed', () => {
    const rows = [parent({ status: 'completed', buy_confirmed_at: '2026-11-01 09:00:00' }), gift()];
    const result = runOfflineSql(rows, [{
      sql: `SELECT ${afEffectiveOrderStatusSql('o')} AS status, o.buy_confirmed_at FROM af_orders o WHERE o.id = 1180`,
    }]);
    expect(result.results[0]).toEqual([{ status: 'pending', buy_confirmed_at: null }]);
  });

  it('same source ID in a different ledger cannot cancel the gift', () => {
    expect(effectiveStatus([parent({ ledger_id: 53 }), gift()])).toBe('pending');
  });

  it('unrelated cancelled source in same ledger cannot cancel the gift', () => {
    expect(effectiveStatus([parent({ id: 1178 }), parent({ status: 'completed' }), gift()])).toBe('pending');
  });

  it.each([null, 0, 9999])('missing source_order_id %s must not assume cancellation', source_order_id => {
    expect(effectiveStatus([parent(), gift({ source_order_id })])).toBe('pending');
  });

  it('absent source row must not assume cancellation', () => {
    expect(effectiveStatus([gift()])).toBe('pending');
  });

  it.each([1, 2])('source is_gift=%i is not a valid non-gift parent', is_gift => {
    expect(effectiveStatus([parent({ is_gift }), gift()])).toBe('pending');
  });

  it('NULL source is_gift is accepted as legacy non-gift', () => {
    expect(effectiveStatus([parent({ is_gift: null }), gift()])).toBe('cancelled');
  });

  it.each(['sell', 'other'])('source side %s is not a non-gift buy parent', side => {
    expect(effectiveStatus([parent({ side }), gift()])).toBe('pending');
  });

  it('a canceled gift source cannot propagate cancellation transitively to another gift', () => {
    expect(effectiveStatus([
      parent(), gift({ id: 1181, status: 'cancelled' }), gift({ source_order_id: 1181 }),
    ])).toBe('pending');
  });

  it('completed/available-sell filters exclude both legacy pending and completed canceled-source gifts', () => {
    const rows = [parent(), gift(), gift({ id: 1181, status: 'completed' }),
      parent({ id: 1200, status: 'completed' }),
      gift({ id: 1201, source_order_id: 1200, status: 'completed' }),
      gift({ id: 1202, status: 'completed', sell_status: 'sold' }),
    ];
    const status = afEffectiveOrderStatusSql('o');
    const result = runOfflineSql(rows, [
      { sql: `SELECT o.id FROM af_orders o WHERE ${status} = 'completed' ORDER BY o.id` },
      { sql: `SELECT o.id FROM af_orders o WHERE ${status} = 'completed'
        AND COALESCE(o.sell_status, '') != 'sold' AND o.sell_confirmed_at IS NULL ORDER BY o.id` },
    ]);
    expect(result.results[0]).toEqual([{ id: 1200 }, { id: 1201 }, { id: 1202 }]);
    expect(result.results[1]).toEqual([{ id: 1200 }, { id: 1201 }]);
  });

  it('effective-status fee and holding math excludes canceled gifts while retaining sold audit fees', () => {
    const rows = [parent(), gift(), gift({ id: 1181, status: 'completed', quantity: 20, fee: 3 }),
      parent({ id: 1200, status: 'completed', quantity: 40, fee: 4 }),
      gift({ id: 1201, source_order_id: 1200, status: 'completed', quantity: 5, fee: 1 }),
      gift({ id: 1202, status: 'completed', sell_status: 'sold', quantity: 7, fee: 6 }),
    ];
    const status = afEffectiveOrderStatusSql('o');
    const result = runOfflineSql(rows, [{
      sql: `SELECT SUM(CASE WHEN ${status} = 'completed' THEN o.fee ELSE 0 END) AS total_fee,
        SUM(CASE WHEN ${status} = 'completed' AND COALESCE(o.sell_status, '') != 'sold'
          AND o.sell_confirmed_at IS NULL THEN o.quantity ELSE 0 END) AS held_quantity,
        SUM(CASE WHEN ${status} = 'cancelled' AND o.is_gift = 1 THEN 1 ELSE 0 END) AS cancelled_gifts
        FROM af_orders o`,
    }]);
    expect(result.results[0]).toEqual([{ total_fee: 11, held_quantity: 45, cancelled_gifts: 2 }]);
  });

  it('repeated and nested read projections reconcile identically without writing raw nested gifts', () => {
    const status = afEffectiveOrderStatusSql('g');
    const query = { sql: `SELECT g.id, g.status AS raw_status, ${status} AS status
      FROM af_orders g JOIN af_orders p ON p.id = g.source_order_id AND p.ledger_id = g.ledger_id
      WHERE p.id = 1179 AND g.is_gift = 1 ORDER BY g.id` };
    const result = runOfflineSql([parent(), gift(), gift({ id: 1181 })], [query, query]);
    expect(result.results[0]).toEqual([
      { id: 1180, raw_status: 'pending', status: 'cancelled' },
      { id: 1181, raw_status: 'pending', status: 'cancelled' },
    ]);
    expect(result.results[1]).toEqual(result.results[0]);
  });

  it('SQLite query-only guard refuses any UPDATE even on the fixture database', () => {
    expect(() => runOfflineSql([parent(), gift()], [
      { sql: "UPDATE af_orders SET status = 'completed' WHERE id = 1180" },
    ])).toThrow(/readonly database/);
  });
});

describe('AF effective SQL alias safety', () => {
  it.each(['o', 'g', 'af_orders', 'gift_orders', '_gift', 'O52'])('valid alias %s executes the real CASE SQL', alias => {
    expect(effectiveStatus([parent(), gift()], alias)).toBe('cancelled');
  });

  it.each(['', '52o', 'o.g', 'o g', 'o; DROP TABLE af_orders', 'o--', 'o`', 'o"', 'o\n', '赠单'])('invalid alias %j is rejected before SQL execution', alias => {
    expect(() => afEffectiveOrderStatusSql(alias)).toThrow('Invalid AF order SQL alias');
  });
});

describe('AF52 gift activation guard (pure function, no wallet/DB operations)', () => {
  it.each([
    { status: 'pending' },
    { status: 'completed' },
    { sellStatus: 'selling' },
    { sellStatus: 'sold' },
    { status: 'cancelled', sellStatus: 'selling' },
    { status: 'pending', sellStatus: 'sold' },
  ])('canceled parent blocks any activation request %j', request => {
    expect(getAfGiftActivationError(activationInput(request))).toBe(canceledReason);
  });

  it.each([
    { status: 'pending' },
    { status: 'completed' },
    { sellStatus: 'selling' },
    { sellStatus: 'sold' },
  ])('missing same-ledger parent blocks activation request %j with a missing-source reason', request => {
    expect(getAfGiftActivationError(activationInput({ sourceStatus: null, ...request }))).toBe(missingReason);
  });

  it.each([
    { status: 'completed' },
    { sellStatus: 'selling' },
    { sellStatus: 'sold' },
  ])('not-yet-completed parent blocks gift fill/sale request %j', request => {
    expect(getAfGiftActivationError(activationInput({ sourceStatus: 'pending', ...request }))).toBe(incompleteReason);
  });

  it('an unexpected non-completed source status cannot authorize a gift fill', () => {
    expect(getAfGiftActivationError(activationInput({ sourceStatus: 'sold', status: 'completed' }))).toBe(incompleteReason);
  });

  it('pre-generated pending gift may stay pending while its parent is pending', () => {
    expect(getAfGiftActivationError(activationInput({ sourceStatus: 'pending', status: 'pending' }))).toBeNull();
  });

  it.each([
    { status: 'pending' },
    { status: 'completed' },
    { sellStatus: 'selling' },
    { sellStatus: 'sold' },
    { status: 'completed', sellStatus: 'selling' },
  ])('completed parent permits normal activation %j', request => {
    expect(getAfGiftActivationError(activationInput({ sourceStatus: 'completed', ...request }))).toBeNull();
  });

  it.each(['cancelled', null, 'pending'])('source %s does not block cancel or metadata-only updates', sourceStatus => {
    expect(getAfGiftActivationError(activationInput({ sourceStatus, status: 'cancelled' }))).toBeNull();
    expect(getAfGiftActivationError(activationInput({ sourceStatus }))).toBeNull();
    expect(getAfGiftActivationError(activationInput({ sourceStatus, sellStatus: 'holding' }))).toBeNull();
    expect(getAfGiftActivationError(activationInput({ sourceStatus, sellStatus: 'cancelled' }))).toBeNull();
  });

  it.each([37, 51, 53])('ledger %i is outside this AF52-specific activation guard', ledgerId => {
    expect(getAfGiftActivationError(activationInput({ ledgerId, status: 'completed', sellStatus: 'sold' }))).toBeNull();
  });

  it.each([0, null, undefined, false, '0', 2])('non-gift marker %s is outside this activation guard', isGift => {
    expect(getAfGiftActivationError(activationInput({ isGift, status: 'completed', sellStatus: 'sold' }))).toBeNull();
  });

  it.each([1, '1', true])('gift marker %s is normalized and cannot bypass canceled-parent guard', isGift => {
    expect(getAfGiftActivationError(activationInput({ isGift, status: 'completed' }))).toBe(canceledReason);
  });

  it('guard does not mutate its input or turn a pending gift into completed', () => {
    const input = Object.freeze(activationInput({ sourceStatus: 'pending', status: 'pending' }));
    const snapshot = JSON.stringify(input);
    expect(getAfGiftActivationError(input)).toBeNull();
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input.status).toBe('pending');
  });
});

// Read TSX as text only; compile just the two declarations, never the page module
// (and therefore never React, trpc hooks, query clients or payment handlers).
const pageSource = readFileSync(new URL('../client/src/pages/AfOrderManage.tsx', import.meta.url), 'utf8');
const pageAst = ts.createSourceFile('AfOrderManage.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function pageFunction(name: string): ts.FunctionDeclaration {
  const node = pageAst.statements.find((statement): statement is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node?.body) throw new Error(`Missing frontend declaration: ${name}`);
  return node;
}
const summaryNode = pageFunction('calculateAfActiveRelatedOrdersSummary');
const feeNode = pageFunction('FeeRow');
const compiledPageFunctions = ts.transpileModule(
  [summaryNode, feeNode].map(node => node.getText(pageAst).replace(/^export /, '')).join('\n')
    + '\nglobalThis.entries = { calculateAfActiveRelatedOrdersSummary, FeeRow };',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } },
).outputText;
type Summary = {
  nominalQuantityTotal: number; activeQuantityTotal: number; activeMainCount: number;
  activeGiftCount: number; activeOrderCount: number; hasCancelledOrders: boolean;
};
type PageOrder = { id?: number; status: string; quantity?: string | number | null; sellStatus?: string };
type OfflineElement = { tag: unknown; props: Record<string, unknown>; children: unknown[] };
function pageHarness() {
  const getBJDateOnly = vi.fn((value: string) => new Date(value.slice(0, 10) + 'T00:00:00.000Z'));
  const getTodayBJDateOnly = vi.fn(() => new Date('2026-11-13T00:00:00.000Z'));
  const createElement = vi.fn((tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): OfflineElement =>
    ({ tag, props: props ?? {}, children }));
  const context: Record<string, any> = {
    React: { createElement }, ChevronDown: 'offline-chevron', getBJDateOnly, getTodayBJDateOnly,
  };
  runInNewContext(compiledPageFunctions, context, { timeout: 1000 });
  return {
    summary: context.entries.calculateAfActiveRelatedOrdersSummary as (main: PageOrder | null, gifts: PageOrder[]) => Summary,
    fee: context.entries.FeeRow as (props: Record<string, unknown>) => OfflineElement,
    getBJDateOnly, getTodayBJDateOnly, createElement,
  };
}
function renderedText(element: unknown): string {
  if (element == null || typeof element === 'boolean') return '';
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(renderedText).join('');
  return (element as OfflineElement).children.map(renderedText).join('');
}

describe('AF order management related-order summary: isolated AST/VM execution', () => {
  it('1179/1180/1181 cancelled remain nominal audit records but effective total and counts are all zero', () => {
    const main = Object.freeze({ id: 1179, status: 'cancelled', quantity: '5' });
    const gifts = [Object.freeze({ id: 1180, status: 'cancelled', quantity: '1' }),
      Object.freeze({ id: 1181, status: 'cancelled', quantity: '1.25' })];
    const snapshot = JSON.stringify([main, gifts]);
    expect(pageHarness().summary(main, gifts)).toEqual({
      nominalQuantityTotal: 7.25, activeQuantityTotal: 0, activeMainCount: 0,
      activeGiftCount: 0, activeOrderCount: 0, hasCancelledOrders: true,
    });
    expect(JSON.stringify([main, gifts])).toBe(snapshot);
  });

  it('SQLite effective statuses feed the frontend 1179/1180/1181 summary without any fixture changes', () => {
    const result = runOfflineSql([parent({ quantity: 5 }), gift({ quantity: 1 }), gift({ id: 1181, quantity: 1.25 })], [{
      sql: `SELECT o.id, ${afEffectiveOrderStatusSql('o')} AS status, o.quantity FROM af_orders o ORDER BY o.id`,
    }]);
    const [main, ...gifts] = result.results[0] as PageOrder[];
    expect(pageHarness().summary(main, gifts)).toMatchObject({
      nominalQuantityTotal: 7.25, activeQuantityTotal: 0, activeOrderCount: 0, hasCancelledOrders: true,
    });
  });

  it('normal main plus two gifts keeps the 7.25 sum and 1+2=3 counts', () => {
    expect(pageHarness().summary({ status: 'completed', quantity: '5' }, [
      { status: 'pending', quantity: '1' }, { status: 'completed', quantity: '1.25' },
    ])).toEqual({
      nominalQuantityTotal: 7.25, activeQuantityTotal: 7.25, activeMainCount: 1,
      activeGiftCount: 2, activeOrderCount: 3, hasCancelledOrders: false,
    });
  });

  it('partial gift cancellation excludes only that gift and preserves the other nominal record', () => {
    expect(pageHarness().summary({ status: 'completed', quantity: 5 }, [
      { status: 'cancelled', quantity: 1 }, { status: 'completed', quantity: 1.25 },
    ])).toEqual({
      nominalQuantityTotal: 7.25, activeQuantityTotal: 6.25, activeMainCount: 1,
      activeGiftCount: 1, activeOrderCount: 2, hasCancelledOrders: true,
    });
  });

  it('summary does not invent cancellation: supplied active gifts are retained even if main is cancelled', () => {
    expect(pageHarness().summary({ status: 'cancelled', quantity: 5 }, [
      { status: 'completed', quantity: 1 }, { status: 'cancelled', quantity: 1.25 },
    ])).toEqual({
      nominalQuantityTotal: 7.25, activeQuantityTotal: 1, activeMainCount: 0,
      activeGiftCount: 1, activeOrderCount: 1, hasCancelledOrders: true,
    });
  });

  it.each(['pending', 'completed', 'sold'])('normal status %s with sold sellStatus retains historical quantity in totals', status => {
    expect(pageHarness().summary({ status: 'completed', quantity: 5, sellStatus: 'sold' }, [
      { status, quantity: 2.25, sellStatus: 'sold' },
    ])).toMatchObject({ activeQuantityTotal: 7.25, activeOrderCount: 2, hasCancelledOrders: false });
  });

  it('a cancelled gift is excluded by status even if it has sold metadata', () => {
    expect(pageHarness().summary({ status: 'completed', quantity: 5 }, [
      { status: 'cancelled', quantity: 2.25, sellStatus: 'sold' },
    ])).toMatchObject({ nominalQuantityTotal: 7.25, activeQuantityTotal: 5, activeGiftCount: 0 });
  });

  it('missing main permits gift-only summary without a phantom main count', () => {
    expect(pageHarness().summary(null, [{ status: 'completed', quantity: '1.25' }])).toEqual({
      nominalQuantityTotal: 1.25, activeQuantityTotal: 1.25, activeMainCount: 0,
      activeGiftCount: 1, activeOrderCount: 1, hasCancelledOrders: false,
    });
  });

  it('empty related records produce zero quantities and counts', () => {
    expect(pageHarness().summary(null, [])).toEqual({
      nominalQuantityTotal: 0, activeQuantityTotal: 0, activeMainCount: 0,
      activeGiftCount: 0, activeOrderCount: 0, hasCancelledOrders: false,
    });
  });

  it('zero, null and omitted quantities are counted as records but add no quantity', () => {
    expect(pageHarness().summary({ status: 'completed', quantity: 0 }, [
      { status: 'pending', quantity: null }, { status: 'completed' },
    ])).toMatchObject({ activeQuantityTotal: 0, activeMainCount: 1, activeGiftCount: 2, activeOrderCount: 3 });
  });
});

describe('AF FeeRow canceled fees and sold audit: isolated AST/VM, no payments', () => {
  it.each([undefined, 'holding', 'selling', 'cancelled'])('cancelled unsold sellStatus=%s renders gray void notice before any amount/date calculation', sellStatus => {
    const harness = pageHarness();
    const order = Object.freeze({
      status: 'cancelled', sellStatus,
      get amount(): never { throw new Error('A void fee row must not calculate fees'); },
    });
    const rendered = harness.fee({ order, ledgerId: 52, orderMultiplier: 10 });
    expect(rendered.tag).toBe('div');
    expect(rendered.props.className).toContain('text-gray-400');
    expect(renderedText(rendered)).toBe('订单已撤销，管理费及手续费作废');
    expect(renderedText(rendered)).not.toContain('应付费用');
    expect(harness.getBJDateOnly).not.toHaveBeenCalled();
    expect(harness.getTodayBJDateOnly).not.toHaveBeenCalled();
  });

  it.each(['completed', 'cancelled'])('sold %s row retains stop-counting historical fees and uses sell confirmation date', status => {
    const harness = pageHarness();
    const order = Object.freeze({ status, sellStatus: 'sold', isGift: 1, amount: '1600',
      createdAt: '2026-11-01T08:00:00', sellConfirmedAt: '2026-11-03T08:00:00' });
    const snapshot = JSON.stringify(order);
    const text = renderedText(harness.fee({ order, ledgerId: 52, orderMultiplier: 10 }));
    expect(text).toContain('11月1日至11月3日，共3天');
    expect(text).toContain('已停计');
    expect(text).toContain('应付费用');
    expect(text).toContain((1600 * 0.16 / 365 * 3 + 1600 * 0.002).toFixed(2) + ' u');
    expect(text).not.toContain('手续费作废');
    expect(harness.getBJDateOnly).toHaveBeenNthCalledWith(2, order.sellConfirmedAt);
    expect(harness.getTodayBJDateOnly).not.toHaveBeenCalled();
    expect(JSON.stringify(order)).toBe(snapshot);
  });

  it('normal pending fee still warns that cancellation voids fees without creating a payment', () => {
    const harness = pageHarness();
    const text = renderedText(harness.fee({
      order: { status: 'pending', sellStatus: 'holding', isGift: 1, amount: '1600', createdAt: '2026-11-01T08:00:00' },
      ledgerId: 52, orderMultiplier: 10,
    }));
    expect(text).toContain('撤单则作废');
    expect(text).toContain('应付费用');
    expect(harness.getTodayBJDateOnly).toHaveBeenCalledOnce();
  });
});

describe('AF frontend source wiring regression (AST/text only)', () => {
  it('related display uses active quantities and counts from the pure helper, not nominal totals', () => {
    expect(pageSource).toContain('calculateAfActiveRelatedOrdersSummary(relationOrder, giftOrders)');
    expect(pageSource).toMatch(/const linkedQuantityTotal\s*=\s*relatedSummary\.activeQuantityTotal/);
    expect(pageSource).toMatch(/const linkedOrderCount\s*=\s*relatedSummary\.activeOrderCount/);
    expect(pageSource).toContain('relatedSummary.activeMainCount');
    expect(pageSource).toContain('relatedSummary.activeGiftCount');
    expect(pageSource).toMatch(/relatedSummary\.hasCancelledOrders\s*\?\s*'有效合计'/);
  });

  it('regular and directed gifts retain canceled audit rows with gray void labels instead of hiding records', () => {
    const regularStart = pageSource.indexOf('regularGifts.map');
    const directedStart = pageSource.indexOf('directedGifts.map', regularStart);
    const summaryEnd = pageSource.indexOf('relatedSummary.activeMainCount', directedStart);
    for (const section of [pageSource.slice(regularStart, directedStart), pageSource.slice(directedStart, summaryEnd)]) {
      expect(section).toContain("gift.status === 'cancelled'");
      expect(section).toContain('text-gray-400');
      expect(section).toContain('已作废');
      expect(section).toContain('gift.quantity');
    }
  });

  it('FeeRow cancellation guard is the first statement and retains the sold-history exception', () => {
    const first = feeNode.body!.statements[0];
    expect(ts.isIfStatement(first)).toBe(true);
    if (!ts.isIfStatement(first)) throw new Error('FeeRow missing leading cancellation guard');
    expect(first.expression.getText(pageAst)).toBe("order.status === 'cancelled' && order.sellStatus !== 'sold'");
    expect(first.thenStatement.getText(pageAst)).toContain('管理费及手续费作废');
    expect(first.thenStatement.getText(pageAst)).toContain('text-gray-400');
  });

  it('extracted summary/FeeRow contain no DB, trpc, fetch or actual wallet/payment calls', () => {
    const calls: string[] = [];
    for (const root of [summaryNode, feeNode]) {
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) calls.push(node.expression.getText(pageAst));
        ts.forEachChild(node, visit);
      };
      visit(root);
    }
    expect(calls.some(call => /(?:trpc|fetch|mutate|execute|wallet|payment|recharge)/i.test(call))).toBe(false);
    expect(compiledPageFunctions).not.toMatch(/\brequire\s*\(/);
  });
});

// Parsing source does not evaluate imports, routes, schema helpers or timers.
const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const routerAst = ts.createSourceFile('routers.ts', routerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function descendants(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const matches: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}
function routeProperties(name: string): ts.PropertyAssignment[] {
  return descendants(routerAst, node => ts.isPropertyAssignment(node)
    && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === name) as ts.PropertyAssignment[];
}
function routeProperty(name: string): ts.PropertyAssignment {
  const nodes = routeProperties(name);
  if (nodes.length !== 1) throw new Error(`Expected exactly one route ${name}, found ${nodes.length}`);
  return nodes[0];
}
function routeHandler(name: string): ts.ArrowFunction {
  const node = descendants(routeProperty(name).initializer, node => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ['query', 'mutation'].includes(node.expression.name.text)
    && !!node.arguments[0] && ts.isArrowFunction(node.arguments[0]))[0] as ts.CallExpression | undefined;
  if (!node || !ts.isArrowFunction(node.arguments[0]) || !ts.isBlock(node.arguments[0].body)) {
    throw new Error(`Missing route handler: ${name}`);
  }
  return node.arguments[0];
}
function routeBody(name: string): ts.Block {
  return routeHandler(name).body as ts.Block;
}
function sqlTemplates(root: ts.Node): Array<ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral> {
  return descendants(root, node => ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) as Array<ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral>;
}
function effectiveTemplates(root: ts.Node) {
  return sqlTemplates(root).filter(node => node.getText(routerAst).includes('afEffectiveOrderStatusSql('));
}
function helperCalls(root: ts.Node, name: string): ts.CallExpression[] {
  return descendants(root, node => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === name) as ts.CallExpression[];
}
function findTopLevelIf(name: string, predicate: (node: ts.IfStatement) => boolean): ts.IfStatement {
  const matches = routeBody(name).statements.filter((node): node is ts.IfStatement => ts.isIfStatement(node) && predicate(node));
  if (matches.length !== 1) throw new Error(`Expected one matching ${name} conditional, found ${matches.length}`);
  return matches[0];
}
const activationGuard = findTopLevelIf('afAdminUpdateOrder', node => helperCalls(node, 'getAfGiftActivationError').length > 0);
const cancelCascade = findTopLevelIf('afAdminUpdateOrder', node => node.expression.getText(routerAst) === "newStatus === 'cancelled'");
const pendingRefund = findTopLevelIf('afAdminUpdateOrder', node => node.expression.getText(routerAst).includes("oldStatus === 'pending'")
  && node.thenStatement.getText(routerAst).includes('balanceAdjust = oldAmount'));
const completedRefund = findTopLevelIf('afAdminUpdateOrder', node => node.expression.getText(routerAst).includes("oldStatus === 'completed'")
  && node.thenStatement.getText(routerAst).includes('balanceAdjust = oldAmount'));
const amountAdjustment = findTopLevelIf('afAdminUpdateOrder', node => node.thenStatement.getText(routerAst).includes('balanceAdjust += -diff'));
const balanceWrite = findTopLevelIf('afAdminUpdateOrder', node => node.expression.getText(routerAst).includes('Math.abs(balanceAdjust)')
  && node.thenStatement.getText(routerAst).includes('INSERT INTO af_manual_balances'));
const userRefund = findTopLevelIf('afCancelOrder', node => node.thenStatement.getText(routerAst).includes('INSERT INTO af_manual_balances'));

function offlineSqlTag(parts: TemplateStringsArray, ...values: unknown[]): string {
  return parts.reduce((text, part, index) => text + part + (index < values.length ? String(values[index] ?? 'NULL') : ''), '');
}
const sqlBinding = Object.assign(offlineSqlTag, { raw: (value: unknown) => value });
function compileIsolatedRouteFunction(body: string, signature: string, context: Record<string, any>) {
  const compiled = ts.transpileModule(`async function isolated(${signature}) { ${body} }\nglobalThis.isolated = isolated;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  // Only AST-selected code is compiled; there must not be any module loader.
  expect(compiled).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
  runInNewContext(compiled, context, { timeout: 1000 });
  return context.isolated as (...args: any[]) => Promise<any>;
}
function guardHarness(sourceRows: Array<{ status: string }> = []) {
  const sourceSelect = vi.fn(async (query: string) => {
    if (!/^SELECT status FROM af_orders/.test(query.trim())) throw new Error(`Forbidden offline query: ${query}`);
    return [sourceRows];
  });
  const afterGuard = vi.fn();
  const guardSpy = vi.fn(getAfGiftActivationError);
  const run = compileIsolatedRouteFunction(activationGuard.getText(routerAst) + '\nafterGuard(); return true;', 'input, order', {
    db: { execute: sourceSelect }, sql: sqlBinding, TRPCError,
    getAfGiftActivationError: guardSpy, afterGuard,
  });
  return { run, sourceSelect, afterGuard, guardSpy };
}
function financeHarness() {
  const writes: string[] = [];
  const execute = vi.fn(async (query: string) => { writes.push(query); return []; });
  const context = { db: { execute }, sql: sqlBinding };
  const adminBody = `
    const oldStatus = order.status;
    const oldAmount = parseFloat(order.amount || '0');
    const newAmount = input.amount ? parseFloat(input.amount) : oldAmount;
    const newStatus = input.status || oldStatus;
    const userId = order.user_id;
    const coin = order.coin;
    const isSimulated = Number(order.is_simulated || 0) === 1;
    let balanceAdjust = 0;
    let balanceNote = '';
    ${[pendingRefund, completedRefund, amountAdjustment, balanceWrite].map(node => node.getText(routerAst)).join('\n')}
    return { balanceAdjust, balanceNote };
  `;
  const runAdmin = compileIsolatedRouteFunction(adminBody, 'input, order', { ...context });
  const userBody = `
    if (order.status !== 'pending') throw new Error('只有委托中的订单才能撤单');
    const amount = parseFloat(order.amount || '0');
    ${userRefund.getText(routerAst)}
    return true;
  `;
  const runUser = compileIsolatedRouteFunction(userBody, 'input, order, ctx', { ...context });
  return { runAdmin, runUser, writes, execute };
}

describe('AF route effective-status read contracts (source/AST only, no router import)', () => {
  it('router imports both shared helpers from the pure state module', () => {
    const imports = routerAst.statements.filter(ts.isImportDeclaration);
    const matching = imports.filter(node => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@shared/af-gift-order-state');
    expect(matching).toHaveLength(1);
    expect(matching[0].getText(routerAst)).toContain('afEffectiveOrderStatusSql');
    expect(matching[0].getText(routerAst)).toContain('getAfGiftActivationError');
  });

  it.each(['afGetOrders', 'afAdminGetOrders'])('%s main SELECT exposes effective status and never a second raw o.status column', name => {
    const templates = effectiveTemplates(routeProperty(name)).filter(node => node.getText(routerAst).includes('SELECT o.id'));
    expect(templates).toHaveLength(1);
    const text = templates[0].getText(routerAst);
    expect(text).toMatch(/afEffectiveOrderStatusSql\("o"\).*?AS status/);
    const selectedColumns = text.slice(0, text.indexOf('FROM af_orders o'));
    expect(selectedColumns).not.toMatch(/\bo\.status\b/);
    expect(text).toContain('o.ledger_id');
  });

  it('admin nested gifts select effective g.status, retain cancelled audit rows, and map it unchanged', () => {
    const route = routeProperty('afAdminGetOrders');
    const templates = effectiveTemplates(route).filter(node => node.getText(routerAst).includes('SELECT g.id'));
    expect(templates).toHaveLength(1);
    const text = templates[0].getText(routerAst);
    expect(text).toMatch(/afEffectiveOrderStatusSql\("g"\).*?AS status/);
    expect(text.slice(0, text.indexOf('FROM af_orders g'))).not.toMatch(/\bg\.status\b/);
    expect(text).toContain('g.ledger_id = ?');
    expect(text).not.toMatch(/g\.status\s*(?:=|!=|<>)\s*'cancelled'/);
    expect(route.getText(routerAst)).toContain("status: String(g.status || '')");
  });

  it('available-sell quantity aggregation uses completed effective status before offering sellable quantity', () => {
    const templates = effectiveTemplates(routeProperty('afGetAvailableSell'));
    expect(templates).toHaveLength(1);
    expect(templates[0].getText(routerAst)).toContain('SUM(CAST(quantity');
    expect(templates[0].getText(routerAst)).toMatch(/afEffectiveOrderStatusSql\("o"\).*?= 'completed'/);
    expect(templates[0].getText(routerAst)).toContain('sell_cancelled');
  });

  it('admin fee input query filters out effectively cancelled gifts while retaining sold audit rows', () => {
    const templates = effectiveTemplates(routeProperty('afAdminGetStats'));
    expect(templates).toHaveLength(1);
    const text = templates[0].getText(routerAst);
    expect(text).toContain('o.sell_confirmed_at');
    expect(text).toMatch(/afEffectiveOrderStatusSql\("o"\).*?= 'completed'/);
    expect(text).not.toMatch(/sell_status\s*(?:!=|<>)\s*'sold'/);
    expect(routeProperty('afAdminGetStats').getText(routerAst)).toContain("bo.sell_status_val === 'sold'");
  });

  it('tree stats counts/amounts/pending/holding use the derived effective-status table, not raw af_orders', () => {
    const templates = effectiveTemplates(routeProperty('afGetTreeOrderStats'));
    const aggregate = templates.find(node => node.getText(routerAst).includes('af_effective_orders'));
    expect(aggregate).toBeDefined();
    const text = aggregate!.getText(routerAst);
    expect(text).toContain('FROM (');
    expect(text).toMatch(/afEffectiveOrderStatusSql\("o"\).*?AS status/);
    for (const column of ['normalCount', 'giftCount', 'totalCount', 'totalAmount', 'currentNormalHoldingCount',
      'currentGiftHoldingCount', 'currentNormalPendingBuyCount', 'currentGiftPendingBuyCount']) {
      expect(text).toContain(column);
    }
    expect(text).toContain("status!='cancelled'");
    expect(text).toContain("status='completed'");
    expect(text).toContain("status='pending'");
  });

  it('tree per-coin discounted holding query filters effective completed before tier discount math', () => {
    const templates = effectiveTemplates(routeProperty('afGetTreeOrderStats'));
    const holding = templates.find(node => node.getText(routerAst).includes('max_tier'));
    expect(holding).toBeDefined();
    expect(holding!.getText(routerAst)).toMatch(/afEffectiveOrderStatusSql\("o"\).*?= 'completed'/);
    expect(holding!.getText(routerAst)).toContain('o.ledger_id');
  });

  it('tree nested and extra gifts project effective status; extra holding gifts also filter effective completed', () => {
    const route = routeProperty('afGetTreeOrders');
    const templates = effectiveTemplates(route);
    expect(templates).toHaveLength(2);
    for (const template of templates) {
      const text = template.getText(routerAst);
      expect(text).toMatch(/afEffectiveOrderStatusSql\("g"\).*?AS status/);
      expect(text.slice(0, text.indexOf('FROM af_orders g'))).not.toMatch(/\bg\.status\b/);
      expect(text).toContain('g.ledger_id');
    }
    const extra = templates.find(node => node.getText(routerAst).includes('src.id as src_id'));
    const nested = templates.find(node => !node.getText(routerAst).includes('src.id as src_id'));
    expect(extra!.getText(routerAst)).toMatch(/afEffectiveOrderStatusSql\("g"\).*?= 'completed'/s);
    expect(nested!.getText(routerAst)).not.toMatch(/g\.status\s*(?:=|!=|<>)\s*'cancelled'/);
    expect(route.getText(routerAst)).toContain("status: g.status || ''");
  });

  it.each([0, 1])('recent-gift route occurrence %i filters effectively completed, including the later shadowing route', occurrence => {
    const routes = routeProperties('afGetRecentGiftOrders');
    expect(routes).toHaveLength(2);
    const templates = effectiveTemplates(routes[occurrence]);
    expect(templates).toHaveLength(1);
    const text = templates[0].getText(routerAst);
    expect(text).toMatch(/afEffectiveOrderStatusSql\("o"\).*?= 'completed'/);
    expect(text).toContain('o.ledger_id');
    expect(text).toContain('o.is_gift=1');
  });
});

describe('AF admin activation protection wiring and isolated guard execution', () => {
  it('guard is after original order lookup but before any mutation, settlement, wallet write or timer', () => {
    const body = routeBody('afAdminUpdateOrder');
    const guardPosition = activationGuard.getStart(routerAst);
    const orderLookup = sqlTemplates(body).find(node => node.getText(routerAst).includes('SELECT id, user_id, coin, side, limit_price'));
    expect(orderLookup!.getStart(routerAst)).toBeLessThan(guardPosition);
    const statementsAfter = body.statements.filter(node => node.getStart(routerAst) > guardPosition);
    expect(statementsAfter.some(node => node.getText(routerAst).includes('INSERT INTO af_manual_balances'))).toBe(true);
    for (const template of sqlTemplates(body).filter(node => /\b(?:INSERT INTO|UPDATE af_orders|DELETE FROM)\b/.test(node.getText(routerAst)))) {
      expect(template.getStart(routerAst)).toBeGreaterThan(activationGuard.end);
    }
    for (const call of descendants(body, node => ts.isCallExpression(node) && /(?:releaseLedger37WalletHold|setTimeout|beginTransaction)/.test(node.expression.getText(routerAst)))) {
      expect(call.getStart(routerAst)).toBeGreaterThan(activationGuard.end);
    }
    expect(body.statements.filter(node => node.getStart(routerAst) < guardPosition)
      .map(node => node.getText(routerAst)).join('\n')).not.toContain('balanceAdjust');
  });

  it('source lookup is constrained by source ID, same ledger, non-gift and buy side', () => {
    const sourceSql = sqlTemplates(activationGuard);
    expect(sourceSql).toHaveLength(1);
    const text = sourceSql[0].getText(routerAst);
    expect(text).toContain('id = ${order.source_order_id}');
    expect(text).toContain('ledger_id = ${input.ledgerId}');
    expect(text).toContain('COALESCE(is_gift, 0) = 0');
    expect(text).toContain("side = 'buy'");
    const guardCall = helperCalls(activationGuard, 'getAfGiftActivationError')[0].getText(routerAst);
    expect(guardCall).toContain('status: input.status');
    expect(guardCall).toContain('sellStatus: input.sellStatus');
    expect(guardCall).toContain('sourceStatus: source?.status ? String(source.status) : null');
    expect(activationGuard.getText(routerAst)).toContain("code: 'PRECONDITION_FAILED'");
  });

  it.each([
    ['cancelled', { status: 'completed' }, canceledReason],
    ['cancelled', { sellStatus: 'selling' }, canceledReason],
    ['cancelled', { sellStatus: 'sold' }, canceledReason],
    [null, { status: 'completed' }, missingReason],
    [null, { sellStatus: 'sold' }, missingReason],
    ['pending', { status: 'completed' }, incompleteReason],
    ['pending', { sellStatus: 'selling' }, incompleteReason],
  ] as const)('isolated actual guard source=%s request=%j rejects before continuation', async (sourceStatus, request, reason) => {
    const harness = guardHarness(sourceStatus ? [{ status: sourceStatus }] : []);
    const input = { ledgerId: 52, orderId: 1180, ...request };
    const order = Object.freeze({ is_gift: 1, source_order_id: 1179, status: 'pending' });
    await expect(harness.run(input, order)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: reason });
    expect(harness.afterGuard).not.toHaveBeenCalled();
    expect(harness.sourceSelect).toHaveBeenCalledOnce();
  });

  it.each([
    ['cancelled', { status: 'cancelled' }],
    ['cancelled', { quantity: '1.5' }],
    [null, { status: 'cancelled' }],
    ['pending', { status: 'pending' }],
    ['completed', { status: 'completed' }],
  ] as const)('isolated actual guard source=%s permits safe request=%j', async (sourceStatus, request) => {
    const harness = guardHarness(sourceStatus ? [{ status: sourceStatus }] : []);
    await expect(harness.run({ ledgerId: 52, orderId: 1180, ...request }, { is_gift: 1, source_order_id: 1179 })).resolves.toBe(true);
    expect(harness.afterGuard).toHaveBeenCalledOnce();
  });

  it.each([[52, 0], [52, null], [37, 1]])('ledger=%i is_gift=%s bypasses only this gift-specific guard and does no source lookup', async (ledgerId, is_gift) => {
    const harness = guardHarness();
    await expect(harness.run({ ledgerId, status: 'completed' }, { is_gift })).resolves.toBe(true);
    expect(harness.sourceSelect).not.toHaveBeenCalled();
    expect(harness.guardSpy).not.toHaveBeenCalled();
  });

  it('repeat-save cancellation cascade has no old-status requirement and remains ledger/source/gift scoped', () => {
    expect(cancelCascade.expression.getText(routerAst)).toBe("newStatus === 'cancelled'");
    expect(cancelCascade.expression.getText(routerAst)).not.toContain('oldStatus');
    const template = sqlTemplates(cancelCascade)[0].getText(routerAst);
    expect(template).toContain('source_order_id = ${input.orderId}');
    expect(template).toContain('ledger_id = ${input.ledgerId}');
    expect(template).toContain('is_gift = 1');
    expect(template).toContain("status != 'cancelled'");
  });
});

describe('AF gift principal refund isolation: AST-selected finance branches, fake writes only', () => {
  it('admin pending refund and pending amount adjustment are both explicitly non-gift', () => {
    expect(pendingRefund.expression.getText(routerAst)).toContain('Number(order.is_gift || 0) !== 1');
    expect(amountAdjustment.expression.getText(routerAst)).toContain('Number(order.is_gift || 0) !== 1');
    expect(pendingRefund.expression.getText(routerAst)).toContain("oldStatus === 'pending'");
    expect(completedRefund.expression.getText(routerAst)).toContain("oldStatus === 'completed'");
  });

  it.each([1, '1'])('pending gift 1180 marker=%s cancellation produces no principal refund', async is_gift => {
    const harness = financeHarness();
    const result = await harness.runAdmin({ ledgerId: 52, status: 'cancelled' }, {
      id: 1180, user_id: 28, coin: 'ETH', status: 'pending', amount: '100', is_gift,
    });
    expect(result.balanceAdjust).toBe(0);
    expect(harness.writes).toEqual([]);
  });

  it.each([0, 1])('repeat cancelled marker=%i produces no duplicate refund even though gift cascade can rerun', async is_gift => {
    const harness = financeHarness();
    expect((await harness.runAdmin({ ledgerId: 52, status: 'cancelled' }, {
      id: 1179, user_id: 28, coin: 'ETH', status: 'cancelled', amount: '100', is_gift,
    })).balanceAdjust).toBe(0);
    expect(harness.writes).toEqual([]);
  });

  it('pending gift amount change never debits or credits principal', async () => {
    const harness = financeHarness();
    const result = await harness.runAdmin({ ledgerId: 52, amount: '160' }, {
      id: 1180, user_id: 28, coin: 'ETH', status: 'pending', amount: '100', is_gift: 1,
    });
    expect(result.balanceAdjust).toBe(0);
    expect(harness.writes).toEqual([]);
  });

  it.each(['pending', 'completed'])('non-gift legacy %s cancellation retains original 100 principal refund', async status => {
    const harness = financeHarness();
    const result = await harness.runAdmin({ ledgerId: 52, status: 'cancelled' }, {
      user_id: 28, coin: 'ETH', status, amount: '100', is_gift: 0,
    });
    expect(result.balanceAdjust).toBe(100);
    expect(harness.writes).toHaveLength(1);
    expect(harness.writes[0]).toContain('INSERT INTO af_manual_balances');
  });

  it('non-gift pending amount increase retains original difference-only debit', async () => {
    const harness = financeHarness();
    const result = await harness.runAdmin({ ledgerId: 52, amount: '160' }, {
      user_id: 28, coin: 'ETH', status: 'pending', amount: '100', is_gift: 0,
    });
    expect(result.balanceAdjust).toBe(-60);
    expect(harness.writes).toHaveLength(1);
  });

  it('simulated normal cancellation still creates no wallet write', async () => {
    const harness = financeHarness();
    await harness.runAdmin({ ledgerId: 52, status: 'cancelled' }, {
      user_id: 28, coin: 'ETH', status: 'pending', amount: '100', is_gift: 0, is_simulated: 1,
    });
    expect(harness.writes).toEqual([]);
  });

  it('user cancel SELECT actually supplies is_gift before the non-gift refund condition', () => {
    const route = routeProperty('afCancelOrder');
    const originalSelect = sqlTemplates(route).find(node => node.getText(routerAst).includes('SELECT id, user_id, coin, side, amount'));
    expect(originalSelect!.getText(routerAst)).toMatch(/COALESCE\(is_gift, 0\) AS is_gift/);
    expect(originalSelect!.getStart(routerAst)).toBeLessThan(userRefund.getStart(routerAst));
    expect(userRefund.expression.getText(routerAst)).toContain('Number(order.is_gift || 0) !== 1');
  });

  it.each([1, '1'])('user legacy cancel gift marker=%s writes no principal refund', async is_gift => {
    const harness = financeHarness();
    await harness.runUser({ ledgerId: 52 }, { status: 'pending', amount: '100', is_gift, coin: 'ETH' }, { user: { id: 28 } });
    expect(harness.writes).toEqual([]);
  });

  it('user non-gift legacy cancellation retains original refund', async () => {
    const harness = financeHarness();
    await harness.runUser({ ledgerId: 52 }, { status: 'pending', amount: '100', is_gift: 0, coin: 'ETH' }, { user: { id: 28 } });
    expect(harness.writes).toHaveLength(1);
    expect(harness.writes[0]).toContain('INSERT INTO af_manual_balances');
    expect(harness.writes[0]).toContain('用户撤单');
  });

  it('user repeated legacy cancellation is rejected before refund', async () => {
    const harness = financeHarness();
    await expect(harness.runUser({ ledgerId: 52 }, { status: 'cancelled', amount: '100', is_gift: 0 }, { user: { id: 28 } }))
      .rejects.toThrow('只有委托中的订单才能撤单');
    expect(harness.writes).toEqual([]);
  });
});

// Exercise the complete callbacks as well as targeted branches. Dynamic imports
// are rewritten to an explicit offline stub before compilation, so even a future
// reached import cannot load './db' or start scanners. Timers always fail closed.
const compiledMutations = new Map<string, string>();
function compiledOfflineMutation(name: string): string {
  const cached = compiledMutations.get(name);
  if (cached) return cached;
  const compiled = ts.transpileModule(`globalThis.mutation = ${routeHandler(name).getText(routerAst)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    transformers: {
      before: [context => root => {
        const visit: ts.Visitor = node => {
          if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            return ts.factory.createCallExpression(ts.factory.createIdentifier('offlineImport'), undefined, [...node.arguments]);
          }
          return ts.visitEachChild(node, visit, context);
        };
        return ts.visitNode(root, visit) as ts.SourceFile;
      }],
    },
  }).outputText;
  expect(compiled).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
  compiledMutations.set(name, compiled);
  return compiled;
}
function fullMutationHarness(name: 'afAdminUpdateOrder' | 'afCancelOrder', options: {
  status?: string; isGift?: number | string; sourceStatus?: string | null; amount?: string;
} = {}) {
  const isGift = options.isGift ?? 1;
  const order = Object.freeze({
    id: Number(isGift) === 1 ? 1180 : 1179, user_id: 28, coin: 'ETH', side: 'buy',
    status: options.status ?? 'pending', is_gift: isGift, source_order_id: 1179,
    amount: options.amount ?? '100', quantity: '1', limit_price: '100',
    sell_status: null, sell_price: null, sell_confirmed_at: null, created_at: '2026-11-01T00:00:00Z',
    principal_hold_id: null, is_simulated: 0,
  });
  const reads: string[] = [];
  const writes: string[] = [];
  const sourceStatus = options.sourceStatus === undefined ? 'cancelled' : options.sourceStatus;
  const execute = vi.fn(async (query: string) => {
    const text = query.trim();
    if (/^SELECT role FROM ledger_members/.test(text)) { reads.push(text); return [[{ role: 'admin' }]]; }
    if (/^SELECT id, user_id, coin, side,/.test(text)) { reads.push(text); return [[order]]; }
    if (/^SELECT status FROM af_orders/.test(text)) {
      reads.push(text); return [sourceStatus == null ? [] : [{ status: sourceStatus }]];
    }
    if (/^SELECT id FROM af_advanced_orders/.test(text) || /^SELECT is_locked, lock_expiry/.test(text)
      || /^SELECT beneficiary_user_id, ratio FROM af_payout_ratios/.test(text)) {
      reads.push(text); return [[]];
    }
    if (/^(?:UPDATE af_orders|INSERT INTO af_manual_balances)\b/.test(text)) {
      writes.push(text); return [{ affectedRows: 1 }];
    }
    throw new Error(`Forbidden/unexpected full offline mutation SQL: ${text}`);
  });
  const connection = { execute };
  const getDbConnection = vi.fn(async () => connection);
  const timer = vi.fn(() => { throw new Error('Timers/scanners are forbidden in this offline suite'); });
  const context: Record<string, any> = {
    getLedgerDb: vi.fn(async () => connection), getDbConnection, sql: sqlBinding, TRPCError,
    ensureAfSimulationColumns: vi.fn(async () => undefined),
    ensureAfWalletHoldColumns: vi.fn(async () => undefined),
    ensureAfAdvancedOrdersTable: vi.fn(async () => undefined),
    getAfGiftActivationError, setTimeout: timer,
    offlineImport: vi.fn(async (path: string) => {
      if (path !== './db') throw new Error(`Forbidden offline dynamic import: ${path}`);
      return { getDbConnection };
    }),
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  runInNewContext(compiledOfflineMutation(name), context, { timeout: 1000 });
  const snapshot = JSON.stringify(order);
  const run = async (request: Record<string, unknown>) => {
    try {
      return await context.mutation({ ctx: { user: { id: 28, role: 'admin' } },
        input: { ledgerId: 52, orderId: order.id, ...request } });
    } finally {
      expect(JSON.stringify(order)).toBe(snapshot);
      expect(timer).not.toHaveBeenCalled();
    }
  };
  return { run, reads, writes, execute, order };
}

describe('AF complete mutation callbacks in fail-closed offline VM', () => {
  it.each([{ status: 'completed' }, { sellStatus: 'selling' }, { sellStatus: 'sold' }])('admin cancelled-parent gift request=%j rejects with no wallet or order writes', async request => {
    const harness = fullMutationHarness('afAdminUpdateOrder');
    await expect(harness.run(request)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: canceledReason });
    expect(harness.writes).toEqual([]);
    expect(harness.reads.some(query => query.startsWith('SELECT id FROM af_advanced_orders'))).toBe(false);
  });

  it('admin missing source rejects gift fill before all writes', async () => {
    const harness = fullMutationHarness('afAdminUpdateOrder', { sourceStatus: null });
    await expect(harness.run({ status: 'completed' })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: missingReason });
    expect(harness.writes).toEqual([]);
  });

  it('admin gift 1180 cancel changes order state but never inserts principal refund', async () => {
    const harness = fullMutationHarness('afAdminUpdateOrder');
    await expect(harness.run({ status: 'cancelled' })).resolves.toMatchObject({ success: true });
    expect(harness.writes).toHaveLength(2);
    expect(harness.writes.every(query => query.startsWith('UPDATE af_orders'))).toBe(true);
    expect(harness.writes.some(query => query.includes('source_order_id = 1180'))).toBe(true);
  });

  it.each([0, 1])('admin repeat cancelled isGift=%i repairs child cancellation without repeated refund', async isGift => {
    const harness = fullMutationHarness('afAdminUpdateOrder', { status: 'cancelled', isGift });
    await expect(harness.run({ status: 'cancelled' })).resolves.toMatchObject({ success: true });
    expect(harness.writes.some(query => query.includes('source_order_id ='))).toBe(true);
    expect(harness.writes.some(query => query.includes('af_manual_balances'))).toBe(false);
  });

  it('admin pending pre-generated gift amount metadata update never adjusts wallet', async () => {
    const harness = fullMutationHarness('afAdminUpdateOrder', { sourceStatus: 'pending' });
    await expect(harness.run({ amount: '160' })).resolves.toMatchObject({ success: true });
    expect(harness.writes.some(query => query.includes('af_manual_balances'))).toBe(false);
    expect(harness.reads.some(query => query.includes('af_payout_ratios'))).toBe(true);
  });

  it.each(['pending', 'completed'])('admin non-gift legacy %s cancellation preserves original refund', async status => {
    const harness = fullMutationHarness('afAdminUpdateOrder', { status, isGift: 0 });
    await expect(harness.run({ status: 'cancelled' })).resolves.toMatchObject({ success: true });
    const walletWrites = harness.writes.filter(query => query.includes('af_manual_balances'));
    expect(walletWrites).toHaveLength(1);
    expect(walletWrites[0]).toContain('100');
    expect(walletWrites[0]).toContain('撤单退回');
  });

  it('user gift 1180 legacy cancellation writes status only, not a gift-value refund', async () => {
    const harness = fullMutationHarness('afCancelOrder');
    await expect(harness.run({ cancelType: 'buy' })).resolves.toMatchObject({ success: true });
    expect(harness.writes).toHaveLength(2);
    expect(harness.writes.every(query => query.startsWith('UPDATE af_orders'))).toBe(true);
  });

  it('user non-gift legacy cancellation retains one principal refund plus status/child writes', async () => {
    const harness = fullMutationHarness('afCancelOrder', { isGift: 0 });
    await expect(harness.run({ cancelType: 'buy' })).resolves.toMatchObject({ success: true });
    expect(harness.writes.filter(query => query.includes('af_manual_balances'))).toHaveLength(1);
    expect(harness.writes.filter(query => query.startsWith('UPDATE af_orders'))).toHaveLength(2);
  });

  it('user repeated cancelled order rejects without any order or wallet write', async () => {
    const harness = fullMutationHarness('afCancelOrder', { status: 'cancelled', isGift: 0 });
    await expect(harness.run({ cancelType: 'buy' })).rejects.toThrow('只有委托中的订单才能撤单');
    expect(harness.writes).toEqual([]);
  });
});
