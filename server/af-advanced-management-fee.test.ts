import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
  afManagementFeeStartAtSql,
  afHasAdvancedFeeSourceSql,
  getAfManagementFeeStartAt,
} from '../shared/af-management-fee-start';

// Never load routers, DB modules, app entry points or timers. Fixtures are fictional.
// Python's stdlib SQLite uses only ':memory:'; query_only is enabled BEFORE queries.
// Execute SQL emitted by the real shared helper, rather than a copied CASE expression.
type FeeOrder = Parameters<typeof getAfManagementFeeStartAt>[0];
type OrderRow = {
  id: number; ledger_id: number; is_gift: number | null; side: string;
  source_order_id: number | null; status: string | null;
  created_at: string; confirmed_at: string | null;
};
type AdvancedRow = {
  id: number; order_id: number; ledger_id: number; status: string | null;
  fulfilled_at: string | null;
};
type ResultRow = Record<string, string | number | null>;
type Query = { sql: string; params?: Array<string | number | null> };
type SqlResult = {
  results: ResultRow[][]; before: { orders: OrderRow[]; advanced: AdvancedRow[] };
  after: { orders: OrderRow[]; advanced: AdvancedRow[] }; readOnly: number;
};
const submitted = '2026-10-17 10:00:00';
const fulfilled = '2026-11-03 10:00:00';
const confirmed = '2026-11-04 11:00:00';
const today = '2026-11-13 12:00:00';

const pythonSqlite = String.raw`
import json
import sqlite3
import sys
payload = json.load(sys.stdin)
connection = sqlite3.connect(':memory:')
connection.row_factory = sqlite3.Row
connection.execute('''CREATE TABLE af_orders (
  id INTEGER PRIMARY KEY, ledger_id INTEGER NOT NULL, is_gift INTEGER,
  side TEXT NOT NULL, source_order_id INTEGER, status TEXT,
  created_at TEXT NOT NULL, confirmed_at TEXT
)''')
connection.execute('''CREATE TABLE af_advanced_orders (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, ledger_id INTEGER NOT NULL,
  status TEXT, fulfilled_at TEXT
)''')
for table, key in [('af_orders', 'orders'), ('af_advanced_orders', 'advanced')]:
    rows = payload[key]
    if rows:
        columns = list(rows[0].keys())
        connection.executemany(
            'INSERT INTO ' + table + ' (' + ', '.join(columns) + ') VALUES (' + ', '.join('?' for _ in columns) + ')',
            [[row[column] for column in columns] for row in rows])
connection.commit()
connection.execute('PRAGMA query_only = ON')
def snapshot():
    return {'orders': [dict(row) for row in connection.execute('SELECT * FROM af_orders ORDER BY id')],
            'advanced': [dict(row) for row in connection.execute('SELECT * FROM af_advanced_orders ORDER BY id')]}
before = snapshot()
results = [[dict(row) for row in connection.execute(query['sql'], query.get('params', []))]
           for query in payload['queries']]
after = snapshot()
read_only = connection.execute('PRAGMA query_only').fetchone()[0]
connection.close()
print(json.dumps({'results': results, 'before': before, 'after': after, 'readOnly': read_only}))
`;
function runOfflineSql(orders: OrderRow[], advanced: AdvancedRow[], queries: Query[]): SqlResult {
  const snapshot = JSON.stringify({ orders, advanced });
  const child = spawnSync('python3', ['-c', pythonSqlite], {
    input: JSON.stringify({ orders, advanced, queries }), encoding: 'utf8',
    timeout: 10_000, maxBuffer: 1024 * 1024,
    // Deliberately omit all project/production DB configuration.
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', PYTHONIOENCODING: 'utf-8' },
  });
  if (child.error) throw new Error(`Offline Python SQLite unavailable: ${child.error.message}`);
  if (child.status !== 0) throw new Error(`Offline SQLite query failed: ${child.stderr}`);
  const result = JSON.parse(child.stdout) as SqlResult;
  expect(result.readOnly).toBe(1);
  expect(result.after).toEqual(result.before);
  expect(result.before).toEqual({
    orders: [...orders].sort((a, b) => a.id - b.id),
    advanced: [...advanced].sort((a, b) => a.id - b.id),
  });
  expect(JSON.stringify({ orders, advanced })).toBe(snapshot);
  return result;
}
function main(overrides: Partial<OrderRow> = {}): OrderRow {
  return { id: 101, ledger_id: 52, is_gift: 0, side: 'buy', source_order_id: null,
    status: 'completed', created_at: submitted, confirmed_at: confirmed, ...overrides };
}
function gift(overrides: Partial<OrderRow> = {}): OrderRow {
  return main({ id: 102, is_gift: 1, source_order_id: 101,
    created_at: '2026-10-20 08:00:00', confirmed_at: '2026-11-08 12:00:00', ...overrides });
}
function advanced(overrides: Partial<AdvancedRow> = {}): AdvancedRow {
  return { id: 201, order_id: 101, ledger_id: 52, status: 'fulfilled', fulfilled_at: fulfilled, ...overrides };
}
function sqlStart(orders: OrderRow[], advancedRows: AdvancedRow[], orderId = 101, alias = 'o') {
  return runOfflineSql(orders, advancedRows, [{
    sql: `SELECT ${afManagementFeeStartAtSql(alias)} AS management_fee_start_at FROM af_orders ${alias} WHERE ${alias}.id = ?`,
    params: [orderId],
  }]).results[0][0]?.management_fee_start_at;
}

// The shared resolver chooses the authoritative date only. It preserves the date
// representation/time zone; existing callers remain responsible for inclusive days.
describe('AF management fee start resolver: pure authoritative date selection', () => {
  it.each([submitted, fulfilled, new Date('2026-11-03T02:00:00.000Z')])('camel DTO date %s is returned unchanged', value => {
    expect(getAfManagementFeeStartAt({ managementFeeStartAt: value, createdAt: submitted })).toBe(value);
  });
  it.each([submitted, fulfilled, new Date('2026-11-03T02:00:00.000Z')])('snake SQL date %s is returned unchanged', value => {
    expect(getAfManagementFeeStartAt({ management_fee_start_at: value, created_at: submitted })).toBe(value);
  });
  it.each([null, undefined, '', '   ', 'invalid date', 0, 1730000000000, false, {}, new Date(NaN)])('authoritative camel %s never falls back to snake/creation/metadata', value => {
    expect(getAfManagementFeeStartAt({ managementFeeStartAt: value, management_fee_start_at: fulfilled,
      isAdvanced: true, advancedStatus: 'fulfilled', fulfilledAt: fulfilled, createdAt: submitted })).toBeNull();
  });
  it.each([null, undefined, '', '  ', 'invalid', 0, false, {}, new Date(NaN)])('authoritative snake %s never falls back to creation/metadata', value => {
    expect(getAfManagementFeeStartAt({ management_fee_start_at: value,
      isAdvanced: true, advancedStatus: 'fulfilled', fulfilledAt: fulfilled, created_at: submitted })).toBeNull();
  });
  it('camel own property has priority over a conflicting snake SQL projection', () => {
    expect(getAfManagementFeeStartAt({ managementFeeStartAt: fulfilled, management_fee_start_at: confirmed })).toBe(fulfilled);
  });
  it('inherited authority fields are not treated as DTO projections', () => {
    const order = Object.assign(Object.create({ managementFeeStartAt: null, management_fee_start_at: null }), { createdAt: submitted });
    expect(getAfManagementFeeStartAt(order)).toBe(submitted);
  });
  it.each([{ isAdvanced: true }, { advancedOrderId: 201 }])('advanced identity %j selects fulfilledAt before confirmedAt', identity => {
    expect(getAfManagementFeeStartAt({ ...identity, advancedStatus: 'fulfilled', fulfilledAt: fulfilled,
      confirmedAt: confirmed, createdAt: submitted })).toBe(fulfilled);
  });
  it.each([null, undefined, '', 'invalid', new Date(NaN)])('fulfilled metadata missing/invalid %s falls back to confirmedAt', fulfilledAt => {
    expect(getAfManagementFeeStartAt({ isAdvanced: true, advancedStatus: 'fulfilled', fulfilledAt,
      confirmedAt: confirmed, createdAt: submitted })).toBe(confirmed);
  });
  it('fulfilled advanced record with both dates absent must not charge from submission', () => {
    expect(getAfManagementFeeStartAt({ isAdvanced: true, advancedStatus: 'fulfilled', createdAt: submitted })).toBeNull();
  });
  it('legacy advanced completed DTO can use its confirmation when advancedStatus is absent', () => {
    expect(getAfManagementFeeStartAt({ advancedOrderId: 201, status: 'completed', confirmedAt: confirmed,
      createdAt: submitted })).toBe(confirmed);
  });
  it.each(['active', 'reached', 'cancelled', 'canceled', 'pending'])('advanced status %s cannot charge even with historical dates and completed main status', advancedStatus => {
    expect(getAfManagementFeeStartAt({ isAdvanced: true, advancedStatus, status: 'completed',
      fulfilledAt: fulfilled, confirmedAt: confirmed, createdAt: submitted })).toBeNull();
  });
  it.each(['active', 'reached', 'cancelled', 'pending', undefined])('unfulfilled metadata main status %s without advancedStatus stays non-chargeable', status => {
    expect(getAfManagementFeeStartAt({ isAdvanced: true, status, fulfilledAt: fulfilled,
      confirmedAt: confirmed, createdAt: submitted })).toBeNull();
  });
  it.each([{}, { isAdvanced: false }, { advancedOrderId: 0 }])('ordinary identity %j retains submission regardless of confirmation', identity => {
    expect(getAfManagementFeeStartAt({ ...identity, createdAt: submitted, confirmedAt: confirmed,
      fulfilledAt: fulfilled, status: 'completed' })).toBe(submitted);
  });
  it('ordinary snake creation timestamp is retained', () => {
    expect(getAfManagementFeeStartAt({ created_at: submitted, confirmedAt: confirmed })).toBe(submitted);
  });
  it('ordinary camel creation takes priority over snake and null permits snake fallback', () => {
    expect(getAfManagementFeeStartAt({ createdAt: submitted, created_at: fulfilled })).toBe(submitted);
    expect(getAfManagementFeeStartAt({ createdAt: null, created_at: submitted })).toBe(submitted);
  });
  it.each([undefined, '', 'nonsense', 0, new Date(NaN)])('invalid ordinary creation %s does not manufacture a fee date', createdAt => {
    expect(getAfManagementFeeStartAt({ createdAt, confirmedAt: confirmed })).toBeNull();
  });
  it.each(['2026-11-02T16:05:00.000Z', '2026-11-03T00:05:00+08:00', '2026-11-03 00:05:00'])('time zone representation %s is selected verbatim, without changing day algorithm', fulfilledAt => {
    expect(getAfManagementFeeStartAt({ isAdvanced: true, advancedStatus: 'fulfilled', fulfilledAt, createdAt: submitted })).toBe(fulfilledAt);
  });
  it('resolver does not mutate createdAt or frozen authoritative input', () => {
    const order = Object.freeze({ managementFeeStartAt: fulfilled, createdAt: submitted, confirmedAt: confirmed });
    const snapshot = JSON.stringify(order);
    expect(getAfManagementFeeStartAt(order)).toBe(fulfilled);
    expect(JSON.stringify(order)).toBe(snapshot);
    expect(order.createdAt).toBe(submitted);
  });
});

describe('AF52 advanced fee date SQL: real read-only SQLite execution', () => {
  it('filled main submitted 10/17 accrues from 11/3 while its source dates stay intact', () => {
    expect(sqlStart([main()], [advanced()])).toBe(fulfilled);
  });
  it('fulfilled_at is preferred over main confirmed_at', () => {
    expect(sqlStart([main({ confirmed_at: confirmed })], [advanced()])).toBe(fulfilled);
  });
  it('fulfilled with NULL fulfilled_at falls back to main confirmation', () => {
    expect(sqlStart([main()], [advanced({ fulfilled_at: null })])).toBe(confirmed);
  });
  it('fulfilled with no fulfillment/confirmation date returns NULL, not submitted date', () => {
    expect(sqlStart([main({ confirmed_at: null })], [advanced({ fulfilled_at: null })])).toBeNull();
  });
  it.each(['active', 'reached', 'cancelled', 'canceled', 'pending', null])('advanced SQL status %s returns NULL despite stale date values', status => {
    expect(sqlStart([main()], [advanced({ status })])).toBeNull();
  });
  it('advanced gift uses source_order_id main fulfillment, not gift creation/confirmation', () => {
    expect(sqlStart([main(), gift()], [advanced()], 102)).toBe(fulfilled);
  });
  it('advanced gift fallback uses source main confirmed_at, not gift confirmed_at', () => {
    expect(sqlStart([main(), gift()], [advanced({ fulfilled_at: null })], 102)).toBe(confirmed);
  });
  it('advanced gift with undated filled source returns NULL even if gift has confirmation', () => {
    expect(sqlStart([main({ confirmed_at: null }), gift()], [advanced({ fulfilled_at: null })], 102)).toBeNull();
  });
  it.each(['active', 'reached', 'cancelled', 'canceled', null])('advanced gift source status %s cannot begin fee accrual', status => {
    expect(sqlStart([main(), gift()], [advanced({ status })], 102)).toBeNull();
  });
  it.each([37, 51, 53])('non52 ledger %i preserves created_at despite matching advanced record', ledger_id => {
    expect(sqlStart([main({ ledger_id })], [advanced({ ledger_id })])).toBe(submitted);
    expect(sqlStart([main({ ledger_id }), gift({ ledger_id })], [advanced({ ledger_id })], 102)).toBe(gift().created_at);
  });
  it('ordinary main without advanced record keeps original created_at', () => {
    expect(sqlStart([main()], [])).toBe(submitted);
  });
  it('ordinary gift without advanced source keeps its own created_at', () => {
    expect(sqlStart([main(), gift()], [], 102)).toBe(gift().created_at);
  });
  it('advanced row belonging to another ledger cannot change main date', () => {
    expect(sqlStart([main()], [advanced({ ledger_id: 53 })])).toBe(submitted);
  });
  it('same source ID in another ledger cannot supply advanced gift fulfillment', () => {
    expect(sqlStart([main({ ledger_id: 53 }), gift()], [advanced({ ledger_id: 53 })], 102)).toBe(gift().created_at);
  });
  it('wrong-ledger advanced row with a local main is not a match', () => {
    expect(sqlStart([main(), gift()], [advanced({ ledger_id: 53 })], 102)).toBe(gift().created_at);
  });
  it.each([null, 0, 9999])('invalid gift source %s does not match unrelated advanced records', source_order_id => {
    expect(sqlStart([main(), gift({ source_order_id })], [advanced()], 102)).toBe(gift().created_at);
  });
  it('orphan advanced row without actual main cannot act as a gift source', () => {
    expect(sqlStart([gift()], [advanced()], 102)).toBe(gift().created_at);
  });
  it.each([1, 2])('gift marker %i on alleged main is not a valid non-gift source', is_gift => {
    expect(sqlStart([main({ is_gift }), gift()], [advanced()], 102)).toBe(gift().created_at);
  });
  it('legacy NULL main gift marker is an eligible non-gift source', () => {
    expect(sqlStart([main({ is_gift: null }), gift()], [advanced()], 102)).toBe(fulfilled);
  });
  it.each(['sell', 'other'])('source side %s must not qualify as advanced buy source', side => {
    expect(sqlStart([main({ side }), gift()], [advanced()], 102)).toBe(gift().created_at);
    expect(sqlStart([main({ side })], [advanced()])).toBe(submitted);
  });
  it('gift-linked advanced row must not substitute gift ID for the source ID', () => {
    expect(sqlStart([main(), gift()], [advanced({ order_id: 102 })], 102)).toBe(gift().created_at);
  });
  it('non-gift order ignores unrelated source_order_id and matches its own ID', () => {
    expect(sqlStart([main({ source_order_id: 9999 })], [advanced()])).toBe(fulfilled);
  });
  it('main and multiple gifts share one fee start without rewriting submission or confirmations', () => {
    const orders = [main(), gift(), gift({ id: 103, created_at: '2026-10-22 15:00:00' })];
    const query = { sql: `SELECT o.id, o.created_at, o.confirmed_at, ${afManagementFeeStartAtSql('o')} AS management_fee_start_at FROM af_orders o ORDER BY o.id` };
    const result = runOfflineSql(orders, [advanced()], [query, query]);
    expect(result.results[0]).toEqual(orders.map(({ id, created_at, confirmed_at }) => ({ id, created_at, confirmed_at, management_fee_start_at: fulfilled })));
    expect(result.results[1]).toEqual(result.results[0]);
    for (const row of result.results[0]) expect(getAfManagementFeeStartAt(row)).toBe(fulfilled);
  });
  it('SQLite query-only guard rejects even fixture UPDATEs', () => {
    expect(() => runOfflineSql([main()], [advanced()], [{ sql: "UPDATE af_orders SET created_at = '2026-11-03'" }])).toThrow(/readonly database/);
    expect(() => runOfflineSql([main()], [advanced()], [{ sql: "UPDATE af_advanced_orders SET status = 'fulfilled'" }])).toThrow(/readonly database/);
  });
});

describe('AF52 start-day inclusive fee contracts from evaluated helper SQL', () => {
  function daysFor(orders: OrderRow[], advancedRows: AdvancedRow[], end = today) {
    return runOfflineSql(orders, advancedRows, [{
      sql: `SELECT id, management_fee_start_at,
        CASE WHEN management_fee_start_at IS NULL THEN 0
          ELSE MAX(1, CAST(julianday(date(?)) - julianday(date(management_fee_start_at)) AS INTEGER) + 1) END AS days
        FROM (SELECT o.id, ${afManagementFeeStartAtSql('o')} AS management_fee_start_at FROM af_orders o) ORDER BY id`,
      params: [end],
    }]).results[0];
  }
  it('10/17 submission, 11/3 fill, through 11/13 gives 11 inclusive days for main and gift, not 28 submission days', () => {
    expect(daysFor([main(), gift()], [advanced()])).toEqual([
      { id: 101, management_fee_start_at: fulfilled, days: 11 },
      { id: 102, management_fee_start_at: fulfilled, days: 11 },
    ]);
    expect(daysFor([main()], [])).toEqual([{ id: 101, management_fee_start_at: submitted, days: 28 }]);
  });
  it('same-day fill and charge remains inclusive one day', () => {
    expect(daysFor([main()], [advanced()], '2026-11-03 23:59:59')[0].days).toBe(1);
  });
  it.each(['active', 'reached', 'cancelled', 'canceled', null])('status %s means zero fee days, including related gifts', status => {
    expect(daysFor([main(), gift()], [advanced({ status })]).map(row => row.days)).toEqual([0, 0]);
  });
  it('fulfilled missing all actual fill dates means zero fee days, never submission-day charges', () => {
    expect(daysFor([main({ confirmed_at: null }), gift()], [advanced({ fulfilled_at: null })]).map(row => row.days)).toEqual([0, 0]);
  });
});

describe('AF management fee SQL alias safety', () => {
  it.each(['o', 'g', 'af_orders', 'gift_orders', '_fee', 'O52'])('trusted alias %s executes actual helper SQL', alias => {
    expect(sqlStart([main()], [advanced()], 101, alias)).toBe(fulfilled);
  });
  it.each(['', '52o', 'o.g', 'o g', 'o; DROP TABLE af_orders', 'o--', 'o`', 'o"', 'o\n', 'o\r', '赠单'])('unsafe alias %j is rejected before SQL evaluation', alias => {
    expect(() => afManagementFeeStartAtSql(alias)).toThrow('Invalid AF fee SQL alias');
  });
});

// Source/AST contracts never evaluate the router module or any of its imports.
function descendants(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const matches: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}
const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const routerAst = ts.createSourceFile('routers.ts', routerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function routeProperty(name: string): ts.PropertyAssignment {
  const matches = descendants(routerAst, node => ts.isPropertyAssignment(node)
    && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === name) as ts.PropertyAssignment[];
  if (matches.length !== 1) throw new Error(`Expected exactly one route ${name}, found ${matches.length}`);
  return matches[0];
}
function routeBody(name: string): ts.Block {
  const call = descendants(routeProperty(name).initializer, node => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression) && ['query', 'mutation'].includes(node.expression.name.text)
    && !!node.arguments[0] && ts.isArrowFunction(node.arguments[0]))[0] as ts.CallExpression | undefined;
  if (!call || !ts.isArrowFunction(call.arguments[0]) || !ts.isBlock(call.arguments[0].body)) throw new Error(`Missing route handler ${name}`);
  return call.arguments[0].body;
}
function helperCalls(root: ts.Node, name: string): ts.CallExpression[] {
  return descendants(root, node => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === name) as ts.CallExpression[];
}
function templates(root: ts.Node) {
  return descendants(root, node => ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) as Array<ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral>;
}

describe('AF fee helper source boundaries: no timezone/financial/history rewrite', () => {
  const source = readFileSync(new URL('../shared/af-management-fee-start.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('af-management-fee-start.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  it('pure helper has no module imports, DB, API, timers or timezone/day-calculation calls', () => {
    expect(ast.statements.filter(ts.isImportDeclaration)).toHaveLength(0);
    const calls = descendants(ast, ts.isCallExpression).map(node => (node as ts.CallExpression).expression.getText(ast));
    expect(calls.some(call => /(?:execute|query|fetch|setTimeout|setInterval|toLocaleString|setHours|setDate|floor|ceil)/.test(call))).toBe(false);
  });
  it('SQL generator has SELECT-only projection with no UPDATE/INSERT/DELETE/DDL', () => {
    const declaration = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node)
      && node.name?.text === 'afManagementFeeStartAtSql');
    expect(declaration).toBeDefined();
    expect(declaration!.getText(ast)).not.toMatch(/\b(?:UPDATE|INSERT|DELETE|ALTER|CREATE|DROP)\b/);
  });
});

describe('AF advanced fulfillment transaction date contracts: source/AST only', () => {
  const body = routeBody('afAdminFulfillAdvancedOrder');
  const fillTransaction = body.statements.find((node): node is ts.TryStatement => ts.isTryStatement(node)
    && templates(node.tryBlock).some(template => /^`UPDATE\s+af_advanced_orders\b/.test(template.getText(routerAst))));
  if (!fillTransaction) throw new Error('Missing main advanced fulfillment transaction');
  const updateTemplates = templates(fillTransaction.tryBlock).filter(node => /^`UPDATE\s+af_(?:advanced_orders|orders)\b/.test(node.getText(routerAst)));
  it('actual advanced fill continues to write fulfilled_at = NOW(), not submission date', () => {
    const update = updateTemplates.filter(node => /^`UPDATE\s+af_advanced_orders\b/.test(node.getText(routerAst)));
    expect(update).toHaveLength(1);
    expect(update[0].getText(routerAst)).toMatch(/status\s*=\s*'fulfilled'/);
    expect(update[0].getText(routerAst)).toMatch(/fulfilled_at\s*=\s*NOW\(\)/);
    expect(update[0].getText(routerAst)).toContain("status IN ('active', 'reached')");
  });
  it('actual main fill continues to write confirmed_at = NOW(), not changing created_at', () => {
    const update = updateTemplates.filter(node => /^`UPDATE\s+af_orders\b/.test(node.getText(routerAst)));
    expect(update).toHaveLength(1);
    expect(update[0].getText(routerAst)).toMatch(/status\s*=\s*'completed'/);
    expect(update[0].getText(routerAst)).toMatch(/confirmed_at\s*=\s*NOW\(\)/);
    expect(update[0].getText(routerAst)).toContain('ledger_id = ?');
  });
  it('both actual fill timestamp writes remain inside the same transaction before commit', () => {
    const transaction = body.statements.find((node): node is ts.TryStatement => ts.isTryStatement(node)
      && templates(node.tryBlock).some(template => updateTemplates.includes(template)));
    expect(transaction).toBeDefined();
    expect(templates(transaction!.tryBlock).filter(node => updateTemplates.includes(node))).toHaveLength(2);
    const text = transaction!.tryBlock.getText(routerAst);
    const finalCommit = text.lastIndexOf('.commit()');
    expect(finalCommit).toBeGreaterThan(text.indexOf('fulfilled_at = NOW()'));
    expect(finalCommit).toBeGreaterThan(text.indexOf('confirmed_at = NOW()'));
    expect(transaction!.catchClause!.getText(routerAst)).toContain('.rollback()');
    expect(body.getText(routerAst)).toContain('.beginTransaction()');
  });
  it('advanced fulfillment never rewrites created_at or backdates historical fee records', () => {
    expect(updateTemplates).toHaveLength(2);
    for (const node of updateTemplates) expect(node.getText(routerAst)).not.toMatch(/created_at\s*=/);
    expect(templates(body).map(node => node.getText(routerAst)).join('\n')).not.toMatch(/UPDATE\s+(?:af_manual_balances|af_fee_prepaid_logs)/);
  });
});

// Isolate declarations/callbacks only; do not load React, trpc, page hooks or payments.
const pageSource = readFileSync(new URL('../client/src/pages/AfOrderManage.tsx', import.meta.url), 'utf8');
const pageAst = ts.createSourceFile('AfOrderManage.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const treeSource = readFileSync(new URL('../client/src/pages/AfInviteTreePage.tsx', import.meta.url), 'utf8');
const treeAst = ts.createSourceFile('AfInviteTreePage.tsx', treeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const forecastSource = readFileSync(new URL('../client/src/pages/AfProfitForecast.tsx', import.meta.url), 'utf8');
const forecastAst = ts.createSourceFile('AfProfitForecast.tsx', forecastSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function pageFunction(name: string): ts.FunctionDeclaration {
  const declaration = pageAst.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration?.body) throw new Error(`Missing page function ${name}`);
  return declaration;
}
function variable(ast: ts.SourceFile, name: string): ts.VariableDeclaration {
  const declarations = descendants(ast, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) as ts.VariableDeclaration[];
  if (declarations.length !== 1 || !declarations[0].initializer) throw new Error(`Expected one ${ast.fileName}:${name}, found ${declarations.length}`);
  return declarations[0];
}
function memoCallback(ast: ts.SourceFile, name: string): ts.ArrowFunction {
  const initializer = variable(ast, name).initializer!;
  if (!ts.isCallExpression(initializer) || !ts.isArrowFunction(initializer.arguments[0])) throw new Error(`Missing memo callback ${name}`);
  return initializer.arguments[0];
}
class FixedDate extends Date {
  constructor(...args: any[]) {
    if (!args.length) super('2026-11-13T12:00:00.000Z');
    else if (args.length === 1) super(args[0]);
    else super(args[0], args[1], args[2] ?? 1, args[3] ?? 0, args[4] ?? 0, args[5] ?? 0, args[6] ?? 0);
  }
  static now() { return new Date('2026-11-13T12:00:00.000Z').getTime(); }
}
type OfflineElement = { tag: unknown; props: Record<string, unknown>; children: unknown[] };
function renderedText(value: unknown): string {
  if (value == null || typeof value === 'boolean') return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(renderedText).join('');
  return (value as OfflineElement).children.map(renderedText).join('');
}
function compileOffline(source: string, context: Record<string, any>): Record<string, any> {
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } }).outputText;
  expect(compiled).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
  runInNewContext(compiled, context, { timeout: 1000 });
  return context;
}
function pageHarness(orderMultiplier = 10) {
  const dateSource = ['getBJDateOnly', 'getTodayBJDateOnly'].map(name => `const ${variable(pageAst, name).getText(pageAst)};`).join('\n');
  const feeSpy = vi.fn(getAfManagementFeeStartAt);
  const context = compileOffline(dateSource + '\n'
    + [pageFunction('FeeRow'), pageFunction('FeeDetailModal')].map(node => node.getText(pageAst)).join('\n')
    + `\nconst calculateProfit = ${variable(pageAst, 'calculateProfit').initializer!.getText(pageAst)};`
    + '\nglobalThis.entries = { FeeRow, FeeDetailModal, calculateProfit, getBJDateOnly };', {
    Date: FixedDate, getAfManagementFeeStartAt: feeSpy, orderMultiplier,
    EQUITY_DISCOUNT_RATES: { 0: 1, 1: 0.6667 },
    ORDER_TAG_CLASS: 'offline-tag', ORDER_TAG_COLORS: { cancelled: 'gray', fee: 'blue', gift: 'pink' },
    ChevronDown: 'offline-chevron', X: 'offline-close',
    React: { createElement: (tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): OfflineElement => ({ tag, props: props ?? {}, children }) },
  });
  return { ...context.entries, feeSpy } as Record<string, any>;
}
function pageOrder(overrides: Record<string, unknown> = {}) {
  return { id: 101, ledgerId: 52, side: 'buy', status: 'completed', isGift: 0,
    amount: '100', limitPrice: '2100', quantity: '1', coin: 'ETH', createdAt: submitted,
    isAdvanced: true, advancedStatus: 'fulfilled', managementFeeStartAt: fulfilled, ...overrides };
}

describe('AF advanced fee display/profit: real frontend AST in isolated VM', () => {
  it.each([0, 1])('main/gift=%i displays 11/3 through 11/13 = 11 days, not 10/17', isGift => {
    const harness = pageHarness();
    const order = Object.freeze(pageOrder({ isGift }));
    const text = renderedText(harness.FeeRow({ order, ledgerId: 52, orderMultiplier: 10 }));
    expect(text).toContain('11月3日至11月13日，共11天');
    expect(text).not.toContain('10月17日');
    expect(text).toContain('成交日起计费');
    const tradeValue = isGift ? 100 : 100 * 10;
    expect(text).toContain((tradeValue * 0.16 / 365 * 11 + (isGift ? tradeValue * 0.002 : 0)).toFixed(2) + ' u');
    expect(harness.feeSpy).toHaveBeenCalledWith(order);
    expect(order.createdAt).toBe(submitted);
  });
  it('same-day frontend fee stays inclusive one day', () => {
    const text = renderedText(pageHarness().FeeRow({ order: pageOrder({ managementFeeStartAt: '2026-11-13 10:00:00' }), ledgerId: 52, orderMultiplier: 10 }));
    expect(text).toContain('11月13日至11月13日，共1天');
  });
  it('sold advanced fee display stops on actual sell confirmation, not today', () => {
    const text = renderedText(pageHarness().FeeRow({ order: pageOrder({ sellStatus: 'sold', sellConfirmedAt: '2026-11-06 10:00:00' }), ledgerId: 52, orderMultiplier: 10 }));
    expect(text).toContain('11月3日至11月6日，共4天');
    expect(text).toContain('已停计');
  });
  it.each(['active', 'reached'])('unfulfilled advanced %s does not read amount or calculate charges', advancedStatus => {
    const order = Object.freeze({ ...pageOrder({ status: 'pending', advancedStatus, managementFeeStartAt: null }),
      get amount(): never { throw new Error('Unfilled fee row must not calculate amounts'); } });
    const text = renderedText(pageHarness().FeeRow({ order, ledgerId: 52, orderMultiplier: 10 }));
    expect(text).toContain('成交后开始计费');
    expect(text).toContain('0天 / 0管理费');
    expect(text).not.toContain('应付费用');
  });
  it('fulfilled missing timestamp does not fall back to 10/17 or render payable management fees', () => {
    const order = Object.freeze({ ...pageOrder({ managementFeeStartAt: null }),
      get amount(): never { throw new Error('Undated filled fee row must not calculate amounts'); } });
    const text = renderedText(pageHarness().FeeRow({ order, ledgerId: 52, orderMultiplier: 10 }));
    expect(text).toContain('成交时间待核对');
    expect(text).toContain('0天 / 0管理费');
    expect(text).not.toContain('应付费用');
  });
  it('cancelled unsold advanced row has no fees even before invoking resolver', () => {
    const harness = pageHarness();
    const order = Object.freeze({ status: 'cancelled', isAdvanced: true,
      get managementFeeStartAt(): never { throw new Error('Cancelled row must exit before date resolution'); } });
    expect(renderedText(harness.FeeRow({ order, ledgerId: 52, orderMultiplier: 10 }))).toBe('订单已撤销，管理费及手续费作废');
    expect(harness.feeSpy).not.toHaveBeenCalled();
  });
  it('ordinary fee keeps original creation-day policy and has no advanced fill label', () => {
    const order = { id: 101, status: 'completed', amount: '100', createdAt: submitted, confirmedAt: fulfilled };
    const text = renderedText(pageHarness().FeeRow({ order, ledgerId: 52, orderMultiplier: 10 }));
    expect(text).toContain('10月17日至11月13日，共28天');
    expect(text).not.toContain('成交日起计费');
  });
  it('actual Beijing date helper sees a UTC boundary as 11/3 without resolver normalization', () => {
    const harness = pageHarness();
    const utcBoundary = '2026-11-02T16:05:00.000Z';
    const order = pageOrder({ managementFeeStartAt: utcBoundary });
    expect(harness.getBJDateOnly(getAfManagementFeeStartAt(order)).toISOString()).toBe('2026-11-03T00:00:00.000Z');
    expect(renderedText(harness.FeeRow({ order, ledgerId: 52, orderMultiplier: 10 }))).toContain('11月3日至11月13日，共11天');
  });
  it('fee modal uses fill days yet retains 10/17 submission-based order number', () => {
    const order = pageOrder();
    const text = renderedText(pageHarness().FeeDetailModal({ orders: [order], onClose: () => {}, orderMultiplier: 10 }));
    expect(text).toContain('AF261017000101');
    expect(text).toContain('11 天');
    expect(text).toContain((100 * 10 / 0.75 * 0.12 / 365 * 11).toFixed(4) + ' U');
    expect(text).not.toContain('AF261103000101');
  });
  it('modal undated fulfillment displays 0 days/fees while cancelled rows remain excluded', () => {
    const text = renderedText(pageHarness().FeeDetailModal({ orders: [pageOrder({ managementFeeStartAt: null }), pageOrder({ id: 999, status: 'cancelled' })], onClose: () => {}, orderMultiplier: 10 }));
    expect(text).toContain('0 天');
    expect(text).toContain('成交时间待核对 · 0天 / 0管理费');
    expect(text).not.toContain('000999');
  });
  it.each([0, 1])('actual sell preview main/gift=%i deducts 11 fill-day fees without changing principal policy', isGift => {
    const order = Object.freeze(pageOrder({ isGift }));
    const result = pageHarness().calculateProfit(order, '2200');
    expect(result.holdDays).toBe(11);
    expect(result.managementFee).toBeCloseTo((isGift ? 100 : 1000) / 0.75 * 0.12 / 365 * 11, 12);
    expect(result.totalRefund).toBe(isGift ? 100 : 200);
    expect(order.createdAt).toBe(submitted);
  });
  it.each([null, ''])('actual sell preview authoritative missing fee start %s deducts no management fee', managementFeeStartAt => {
    const result = pageHarness().calculateProfit(pageOrder({ managementFeeStartAt }), '2200');
    expect(result.holdDays).toBe(0);
    expect(result.managementFee).toBe(0);
    expect(result.actualRefund).toBe(result.totalRefund);
  });
  it('ordinary sell preview remains 28 submission days', () => {
    const result = pageHarness().calculateProfit({ amount: '100', limitPrice: '2100', quantity: '1', createdAt: submitted, confirmedAt: fulfilled }, '2200');
    expect(result.holdDays).toBe(28);
  });
});

describe('AF fee forecast and invite tree: actual memo callbacks only, offline VM', () => {
  it('forecast totals main/gift from filled date and excludes undated fulfillment, sold and cancelled', () => {
    const orders = [pageOrder(), pageOrder({ id: 102, isGift: 1 }), pageOrder({ id: 103, managementFeeStartAt: null }),
      pageOrder({ id: 104, sellStatus: 'sold' }), pageOrder({ id: 105, status: 'cancelled' })];
    const callback = memoCallback(forecastAst, 'totalMgmtFee');
    const context = compileOffline(`globalThis.result = (${callback.getText(forecastAst)})();`, {
      Date: FixedDate, coinOrders: orders, orderMultiplier: 10, getAfManagementFeeStartAt,
    });
    expect(context.result).toBeCloseTo((1000 + 100) / 0.75 * 0.12 / 365 * 11, 12);
  });
  it('forecast ordinary order remains 28 original days', () => {
    const callback = memoCallback(forecastAst, 'totalMgmtFee');
    const context = compileOffline(`globalThis.result = (${callback.getText(forecastAst)})();`, {
      Date: FixedDate, coinOrders: [{ side: 'buy', status: 'completed', amount: '100', createdAt: submitted, confirmedAt: fulfilled }],
      orderMultiplier: 10, getAfManagementFeeStartAt,
    });
    expect(context.result).toBeCloseTo(1000 / 0.75 * 0.12 / 365 * 28, 12);
  });
  it('invite fee summary does not charge unfilled/undated/cancelled advanced orders', () => {
    const callback = memoCallback(treeAst, 'afFeeByUser');
    const dateDeclarations = ['getBJDateOnly_Tree', 'getTodayBJDateOnly_Tree'].map(name => `const ${variable(treeAst, name).getText(treeAst)};`).join('\n');
    const context = compileOffline(dateDeclarations + `\nglobalThis.result = (${callback.getText(treeAst)})();`, {
      Date: FixedDate, getAfManagementFeeStartAt,
      afFeeOrders: [pageOrder({ userId: 1, userBalance: 50 }), pageOrder({ id: 102, userId: 1, isGift: 1 }),
        pageOrder({ userId: 2, managementFeeStartAt: null }), pageOrder({ userId: 3, status: 'cancelled' }),
        pageOrder({ userId: 4, status: 'pending', advancedStatus: 'active', managementFeeStartAt: null })],
    });
    expect(Object.keys(context.result)).toEqual(['1']);
    // Preserve this page's existing 5.25 multiplier; this change only selects dates.
    expect(context.result[1].pending).toBeCloseTo((100 * 5.25 + 100) / 0.75 * 0.12 / 365 * 11, 12);
  });
});

describe('AF frontend fee source wiring: source/AST only', () => {
  it.each([[pageAst, pageSource], [treeAst, treeSource], [forecastAst, forecastSource]] as const)('%s imports the real pure shared date helper', (ast, source) => {
    const imports = ast.statements.filter(ts.isImportDeclaration).filter(node => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@shared/af-management-fee-start');
    expect(imports).toHaveLength(1);
    expect(imports[0].getText(ast)).toContain('getAfManagementFeeStartAt');
    expect(source).not.toMatch(/getBJDateOnly(?:_Tree)?\((?:order|o)\.createdAt\)/);
  });
  it('order modal, fee row, profit, holding totals and both interval displays are all connected', () => {
    expect(helperCalls(pageFunction('FeeRow'), 'getAfManagementFeeStartAt')).toHaveLength(1);
    expect(helperCalls(pageFunction('FeeDetailModal'), 'getAfManagementFeeStartAt').length).toBeGreaterThanOrEqual(2);
    expect(helperCalls(variable(pageAst, 'calculateProfit'), 'getAfManagementFeeStartAt')).toHaveLength(1);
    expect(helperCalls(pageAst, 'getAfManagementFeeStartAt').length).toBeGreaterThanOrEqual(7);
    expect(pageSource).toMatch(/const startDate = feeStartAt \? (?:getBJDateOnly|new Date)\(feeStartAt\) : null/);
    expect(pageSource).toContain("if (!feeStartAt) return `${order.status === 'pending' ? '成交后开始计费' : '成交时间待核对'} · 0天 / 0管理费`");
    expect(pageSource).toContain('if (amount > 0 && feeStartAt)');
  });
  it('invite tree fee date display uses the same helper but order number keeps original date', () => {
    expect(treeSource).toContain('feeStartAt ? fmtBJTime_Tree(feeStartAt, false)');
    expect(treeSource).toContain('const orderDate = new Date(o.createdAt)');
    expect(helperCalls(treeAst, 'getAfManagementFeeStartAt')).toHaveLength(2);
  });
  it('extracted fee code contains no DB, API, timer, wallet or mutation calls', () => {
    const roots = [pageFunction('FeeRow'), pageFunction('FeeDetailModal'), variable(pageAst, 'calculateProfit')];
    const calls = roots.flatMap(root => descendants(root, ts.isCallExpression).map(node => (node as ts.CallExpression).expression.getText(pageAst)));
    expect(calls.some(call => /(?:execute|fetch|trpc|setTimeout|setInterval|mutate|payment|wallet)/i.test(call))).toBe(false);
  });
});

const detailSource = readFileSync(new URL('../client/src/pages/AfFeeDetail.tsx', import.meta.url), 'utf8');
const detailAst = ts.createSourceFile('AfFeeDetail.tsx', detailSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const ledgerSource = readFileSync(new URL('../client/src/pages/LedgerDetail.tsx', import.meta.url), 'utf8');
const ledgerAst = ts.createSourceFile('LedgerDetail.tsx', ledgerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function detailHarness() {
  const declaration = detailAst.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'calcFeeItem');
  if (!declaration) throw new Error('Missing calcFeeItem');
  const context = compileOffline(`const now = new Date(); const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());\n${declaration.getText(detailAst)}\nglobalThis.calcFeeItem = calcFeeItem;`, {
    Date: FixedDate, getAfManagementFeeStartAt, EQUITY_DISCOUNT_RATES: { 0: 1, 1: 0.6667 },
  });
  return context.calcFeeItem as (order: Record<string, unknown>, multiplier: number) => any;
}
describe('AF fee detail and ledger shortfall: isolated original frontend calculations', () => {
  it.each([0, 1])('fee detail main/gift=%i computes both existing 16%% and 12%% rates from fill date', isGift => {
    const result = detailHarness()(pageOrder({ isGift }), 10);
    const tradeValue = isGift ? 100 : 1000;
    expect(result.holdDays).toBe(11);
    expect(result.totalFee).toBeCloseTo(tradeValue / 0.75 * 0.12 / 365 * 11, 12);
    expect(result.totalFee12).toBeCloseTo(tradeValue * 0.12 / 365 * 11, 12);
    expect(result.orderNo).toBe('AF261017000101');
    expect(result.createdAt).toBe(submitted);
  });
  it('fee detail ordinary order and its order number keep original submission date', () => {
    const result = detailHarness()({ id: 101, amount: '100', createdAt: submitted, confirmedAt: fulfilled }, 10);
    expect(result.holdDays).toBe(28);
    expect(result.orderNo).toBe('AF261017000101');
  });
  it('fee detail sold advanced order stops on actual sell date', () => {
    const result = detailHarness()(pageOrder({ sellStatus: 'sold', sellConfirmedAt: '2026-11-06 10:00:00' }), 10);
    expect(result.holdDays).toBe(4);
    expect(result.feeType).toBe('settled');
  });
  it.each([null, ''])('fee detail missing authoritative date %s zeros both fee rates and totals', managementFeeStartAt => {
    const result = detailHarness()(pageOrder({ managementFeeStartAt }), 10);
    expect(result.holdDays).toBe(0);
    expect(result.dailyFee).toBe(0);
    expect(result.dailyFee12).toBe(0);
    expect(result.totalFee).toBe(0);
    expect(result.totalFee12).toBe(0);
  });
  it('ledger shortfall memo counts 11 fill days, preserves ordinary 28 days, excludes unfilled/sold/cancelled', () => {
    const callback = memoCallback(ledgerAst, 'afFeeByUser');
    const context = compileOffline(`globalThis.result = (${callback.getText(ledgerAst)})();`, {
      Date: FixedDate, getAfManagementFeeStartAt,
      afAdminOrdersForTree: [pageOrder({ userId: 1, prepaidFee: 0.5 }),
        { id: 102, userId: 2, side: 'buy', status: 'completed', amount: '100', createdAt: submitted, confirmedAt: fulfilled },
        pageOrder({ userId: 3, managementFeeStartAt: null }), pageOrder({ userId: 4, sellStatus: 'sold' }),
        pageOrder({ userId: 5, status: 'cancelled' })],
    });
    expect([...context.result.keys()]).toEqual([1, 2]);
    expect(context.result.get(1).pendingFee).toBeCloseTo(100 * 5.25 / 0.75 * 0.12 / 365 * 11 - 0.5, 12);
    expect(context.result.get(2).pendingFee).toBeCloseTo(100 * 5.25 / 0.75 * 0.12 / 365 * 28, 12);
  });
  it('detail date grouping, active forecasts and both modals use shared start-date resolver', () => {
    expect(helperCalls(detailAst, 'getAfManagementFeeStartAt').length).toBeGreaterThanOrEqual(7);
    expect(detailSource).toContain('const orderDate = new Date(o.createdAt)');
    expect(detailSource).toContain('if (!getAfManagementFeeStartAt(item)) continue');
    expect(detailSource).toContain('const feeStartAt = getAfManagementFeeStartAt(d)');
    expect(detailSource).toContain('const feeStartAt = getAfManagementFeeStartAt(order)');
    expect(detailSource).not.toMatch(/new Date\((?:o|item|order|d)\.confirmedAt\s*\|\|\s*(?:o|item|order|d)\.createdAt\)/);
  });
  it('detail fee inputs filter cancelled orders before calculating a fee item', () => {
    const initializer = variable(detailAst, 'feeItems').initializer!.getText(detailAst);
    expect(initializer).toContain("o.side === 'buy' && o.status === 'completed'");
    expect(initializer).toContain('calcFeeItem(order, orderMultiplier)');
  });
  it('ledger and fee detail import shared helper without local alternative resolver', () => {
    for (const ast of [ledgerAst, detailAst]) {
      const imports = ast.statements.filter(ts.isImportDeclaration).filter(node => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@shared/af-management-fee-start');
      expect(imports).toHaveLength(1);
      expect(helperCalls(ast, 'getAfManagementFeeStartAt').length).toBeGreaterThan(0);
    }
  });
});

// Select a fee computation slice from the actual handler AST after integration.
// No entire route is imported/evaluated. Reject imports, awaits, DB/API calls and
// mutation statements; the only injected values are fictional rows and constants.
function feeSlice(name: string, totalVariable: string) {
  const body = routeBody(name);
  const total = descendants(body, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
    && node.name.text === totalVariable) as ts.VariableDeclaration[];
  if (total.length !== 1) throw new Error(`Expected one ${name}:${totalVariable}, found ${total.length}`);
  const totalStatement = total[0].parent.parent;
  if (!ts.isVariableStatement(totalStatement) || !ts.isBlock(totalStatement.parent)) throw new Error(`Missing fee slice block ${name}`);
  const block = totalStatement.parent;
  const end = block.statements.indexOf(totalStatement);
  const start = block.statements.findIndex(statement => helperCalls(statement, 'getAfManagementFeeStartAt').length > 0);
  if (start < 0 || start > end) throw new Error(`Missing shared fee start before ${name}:${totalVariable}`);
  const slice = block.statements.slice(start, end + 1).filter(statement => {
    // Multiplier lookup sits between dates and total in the sale handler. Do not
    // evaluate it: its verified existing result is provided as an offline constant.
    if (descendants(statement, ts.isAwaitExpression).length) {
      if (!statement.getText(routerAst).includes('getAfOrderMultiplierForLedger')) throw new Error(`Unexpected async fee statement in ${name}`);
      return false;
    }
    return true;
  });
  const text = slice.map(node => node.getText(routerAst)).join('\n');
  const forbidden = descendants(block, node => slice.some(statement => statement === node));
  expect(forbidden.length).toBe(slice.length);
  expect(text).not.toMatch(/\b(?:import\s*\(|db\.execute|conn\.execute|fetch\s*\(|setTimeout\s*\(|setInterval\s*\()/);
  return text + `\nreturn { ${totalVariable}, holdDays };`;
}
function offlineRouteFee(name: string, totalVariable: string, order: Record<string, unknown>) {
  const context = compileOffline(`function selectedFee() { ${feeSlice(name, totalVariable)} }\nglobalThis.result = selectedFee();`, {
    Date: FixedDate, getAfManagementFeeStartAt, order,
    input: { ledgerId: 52, orderId: 101, amount: 1 },
    activeOrderMultiplier: 10, oldAmount: 100, isGift: false,
    dailyFee: 1000 / 0.75 * 0.12 / 365,
    TRPCError: class OfflineTRPCError extends Error { constructor(options: { message: string }) { super(options.message); } },
  });
  return context.result as { holdDays: number; [key: string]: number };
}

// Parent-supplied read-only date snapshot: no live order/DB/API access here.
const affectedSnapshots = [
  { id: 1173, name: '英姐', created_at: '2026-09-17 12:00:00', oldDays: 58 },
  { id: 1172, name: '梓淇', created_at: '2026-09-17 12:00:00', oldDays: 58 },
  { id: 1168, name: 'Ocean', created_at: '2026-09-14 12:00:00', oldDays: 61 },
  { id: 1167, name: 'chance', created_at: '2026-09-14 12:00:00', oldDays: 61 },
] as const;
const actualAffectedFill = '2026-11-09 06:46:00';
describe('AF52 four affected 2100 advanced orders: supplied date snapshot, offline only', () => {
  it.each(affectedSnapshots)('$id $name uses 11/9 actual fill through 11/13 = 5 days, not $oldDays submission days', snapshot => {
    const orders = [main({ id: snapshot.id, created_at: snapshot.created_at, confirmed_at: actualAffectedFill })];
    const sourceRows = [advanced({ order_id: snapshot.id, fulfilled_at: actualAffectedFill })];
    const start = sqlStart(orders, sourceRows, snapshot.id);
    expect(start).toBe(actualAffectedFill);
    const dto = pageOrder({ id: snapshot.id, createdAt: snapshot.created_at, managementFeeStartAt: start });
    const detail = detailHarness()(dto, 10);
    expect(detail.holdDays).toBe(5);
    expect(detail.totalFee).toBeCloseTo(1000 / 0.75 * 0.12 / 365 * 5, 12);
    expect(detail.createdAt).toBe(snapshot.created_at);
    expect(detailHarness()({ id: snapshot.id, amount: '100', createdAt: snapshot.created_at }, 10).holdDays).toBe(snapshot.oldDays);
    expect(renderedText(pageHarness().FeeRow({ order: dto, ledgerId: 52, orderMultiplier: 10 }))).toContain('11月9日至11月13日，共5天');
    for (const [route, total] of [['afAdminUpdateOrder', 'totalManagementFee'], ['afAdminCollectPrepaidFee', 'totalFee'], ['afGetPrepaidFeeLogs', 'totalFee']] as const) {
      expect(offlineRouteFee(route, total, { created_at: snapshot.created_at, management_fee_start_at: start, prepaid_fee: 0 }).holdDays).toBe(5);
    }
  });
});

describe('AF advanced fee source SQL shares ledger/non-gift-buy rules with date selection', () => {
  it.each(['active', 'reached', 'fulfilled', 'cancelled', null])('valid main and gift source stays classified advanced regardless of status %s', status => {
    const rows = runOfflineSql([main(), gift()], [advanced({ status })], [{
      sql: `SELECT o.id, ${afHasAdvancedFeeSourceSql('o')} AS has_advanced_fee_source FROM af_orders o ORDER BY id`,
    }]).results[0];
    expect(rows).toEqual([{ id: 101, has_advanced_fee_source: 1 }, { id: 102, has_advanced_fee_source: 1 }]);
  });
  it.each([
    { parent: { ledger_id: 53 }, source: { ledger_id: 53 } },
    { parent: { is_gift: 1 }, source: {} },
    { parent: { side: 'sell' }, source: {} },
    { parent: {}, source: { ledger_id: 53 } },
  ])('invalid advanced gift source %j is not classified advanced', ({ parent, source }) => {
    expect(runOfflineSql([main(parent), gift()], [advanced(source)], [{
      sql: `SELECT ${afHasAdvancedFeeSourceSql('g')} AS has_advanced_fee_source FROM af_orders g WHERE g.id = 102`,
    }]).results[0]).toEqual([{ has_advanced_fee_source: 0 }]);
  });
  it.each(['', 'o;DROP', 'o.g', 'o\n', '52o'])('advanced source classifier also rejects unsafe alias %j', alias => {
    expect(() => afHasAdvancedFeeSourceSql(alias)).toThrow('Invalid AF fee SQL alias');
  });
});

describe('AF integrated route date projections and DTO contracts: AST/source only', () => {
  it('router imports all three actual shared date/source functions', () => {
    const imports = routerAst.statements.filter(ts.isImportDeclaration).filter(node => ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '@shared/af-management-fee-start');
    expect(imports).toHaveLength(1);
    for (const name of ['getAfManagementFeeStartAt', 'afManagementFeeStartAtSql', 'afHasAdvancedFeeSourceSql']) expect(imports[0].getText(routerAst)).toContain(name);
  });
  it.each(['afGetOrders', 'afAdminGetOrders', 'afAdminGetStats', 'afAdminUpdateOrder', 'afAdminCollectPrepaidFee', 'afGetPrepaidFeeLogs', 'afGetPnlSummary', 'afGetTreeOrders'])('%s projects real helper SQL as management_fee_start_at alongside original created_at', name => {
    const projections = templates(routeProperty(name)).filter(node => node.getText(routerAst).includes('afManagementFeeStartAtSql('));
    expect(projections.length).toBeGreaterThan(0);
    for (const node of projections) {
      const text = node.getText(routerAst);
      expect(text).toMatch(/afManagementFeeStartAtSql\("(?:o|g|src)"\)/);
      expect(text).toContain('AS management_fee_start_at');
      expect(text).toContain('created_at');
      expect(text).not.toMatch(/UPDATE\s+af_orders/);
    }
  });
  it.each(['afGetOrders', 'afAdminGetOrders', 'afGetTreeOrders'])('%s returns camel DTO authority without replacing source createdAt', name => {
    const text = routeProperty(name).getText(routerAst);
    expect(text).toContain('managementFeeStartAt: r.management_fee_start_at || null');
    expect(text).toMatch(/createdAt:\s*r\.created_at/);
    expect(text).not.toMatch(/createdAt:\s*(?:r\.management_fee_start_at|getAfManagementFeeStartAt)/);
  });
  it('nested admin/tree gifts and extra tree source main all receive authoritative fee date', () => {
    expect(routeProperty('afAdminGetOrders').getText(routerAst)).toContain('managementFeeStartAt: g.management_fee_start_at || null');
    const tree = routeProperty('afGetTreeOrders').getText(routerAst);
    expect(tree.match(/managementFeeStartAt: g\.management_fee_start_at \|\| null/g)).toHaveLength(2);
    expect(tree).toContain('managementFeeStartAt: g.src_management_fee_start_at || null');
    expect(tree).toContain('afManagementFeeStartAtSql("src")');
  });
  it('all eight original server fee sites use resolver/null guarding, with normal sold algorithm unchanged', () => {
    const sites: Record<string, number> = { afAdminGetStats: 1, afAdminUpdateOrder: 1, afAdminCollectPrepaidFee: 1, afGetPrepaidFeeLogs: 1, afGetPnlSummary: 3 };
    for (const [name, count] of Object.entries(sites)) expect(helperCalls(routeProperty(name), 'getAfManagementFeeStartAt')).toHaveLength(count);
    expect(routeProperty('afAdminGetStats').getText(routerAst)).toContain('if (!feeStartAt) continue');
    const pnl = routeProperty('afGetPnlSummary').getText(routerAst);
    expect(pnl).toContain('const createdDay2 = feeStartAt2 ? new Date(feeStartAt2) : null');
    expect(pnl).toContain('const cd = feeStartAt ? new Date(feeStartAt) : null');
    expect(pnl).toContain('if (Number(order.has_advanced_fee_source) === 1)');
    expect(pnl).toContain('startDay && endDay ? Math.max(1');
  });
  it('fee collection still formats original created_at as its order number', () => {
    expect(routeProperty('afAdminCollectPrepaidFee').getText(routerAst)).toContain('const orderDate = new Date(order.created_at)');
    expect(routeProperty('afAdminGetOrders').getText(routerAst)).toContain('const giftCreatedAt = g.created_at ? new Date(g.created_at) : new Date()');
  });
});

describe('AF actual sale/collection/log fee snippets: isolated original AST, no actual payment', () => {
  it.each([['afAdminUpdateOrder', 'totalManagementFee'], ['afAdminCollectPrepaidFee', 'totalFee'], ['afGetPrepaidFeeLogs', 'totalFee']] as const)('%s actual computation retains ordinary 28 days and advanced 11 days', (route, total) => {
    const ordinary = offlineRouteFee(route, total, { created_at: submitted, confirmed_at: fulfilled });
    expect(ordinary.holdDays).toBe(28);
    expect(ordinary[total]).toBeCloseTo(1000 / 0.75 * 0.12 / 365 * 28, 12);
    const advancedResult = offlineRouteFee(route, total, { created_at: submitted, management_fee_start_at: fulfilled });
    expect(advancedResult.holdDays).toBe(11);
    expect(advancedResult[total]).toBeCloseTo(1000 / 0.75 * 0.12 / 365 * 11, 12);
  });
  it.each(['afAdminUpdateOrder', 'afAdminCollectPrepaidFee'])('%s refuses active/reached/fulfilled missing-date rows before any finance writes', route => {
    const total = route === 'afAdminUpdateOrder' ? 'totalManagementFee' : 'totalFee';
    for (const advancedStatus of ['active', 'reached', 'fulfilled', 'cancelled']) {
      expect(() => offlineRouteFee(route, total, { created_at: submitted, management_fee_start_at: null, advancedStatus })).toThrow(/成交时间|计费起点/);
    }
    const body = routeBody(route);
    const start = helperCalls(body, 'getAfManagementFeeStartAt')[0];
    const guard = descendants(body, node => ts.isIfStatement(node) && node.expression.getText(routerAst) === '!feeStartAt')[0] as ts.IfStatement;
    expect(guard.getStart(routerAst)).toBeGreaterThan(start.getStart(routerAst));
    expect(guard.getText(routerAst)).toContain("code: 'PRECONDITION_FAILED'");
    for (const write of templates(body).filter(node => /INSERT INTO af_(?:manual_balances|fee_prepaid_logs)/.test(node.getText(routerAst)))) expect(write.getStart(routerAst)).toBeGreaterThan(guard.end);
  });
  it('logs undated advanced authority means exactly zero days and total fees', () => {
    expect(offlineRouteFee('afGetPrepaidFeeLogs', 'totalFee', { created_at: submitted, management_fee_start_at: null })).toEqual({ holdDays: 0, totalFee: 0 });
  });
  it('advanced sold logs stop at sell confirmation while ordinary logs preserve existing today policy', () => {
    const row = { created_at: submitted, management_fee_start_at: fulfilled, sell_status: 'sold', sell_confirmed_at: '2026-11-06 10:00:00' };
    expect(offlineRouteFee('afGetPrepaidFeeLogs', 'totalFee', { ...row, has_advanced_fee_source: 1 }).holdDays).toBe(4);
    expect(offlineRouteFee('afGetPrepaidFeeLogs', 'totalFee', { ...row, has_advanced_fee_source: 0 }).holdDays).toBe(11);
  });
});
