import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { getAfManagementFeeStartAt } from '../shared/af-management-fee-start';

// OFFLINE ONLY: never import scanner/routers/db, start the app, or call live prices.
// Actual source declarations are AST-selected and compiled into a closed VM.
// SQLite fixtures are fictional, ':memory:' only, query_only BEFORE candidate SELECTs.
// The scan adapter only records price logs/stats/triggers in JS Maps; order/wallet
// DML is forbidden. Existing gift triggers are never copied from their parent.
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing actual AST: ${label}`);
  return value;
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
function parse(path: string, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, kind);
}
const scannerAst = parse('./af-tier-scanner.ts');
const routerAst = parse('./routers.ts');
const pageAst = parse('../client/src/pages/CryptoPrediction.tsx', ts.ScriptKind.TSX);
function declaration(root: ts.Node, name: string) {
  const found = nodes(root, ts.isFunctionDeclaration).filter(node => node.name?.text === name);
  if (found.length !== 1) throw new Error(`Expected one actual function ${name}, found ${found.length}`);
  return found[0];
}
function variable(root: ts.Node, name: string) {
  const found = nodes(root, ts.isVariableDeclaration).filter(node => ts.isIdentifier(node.name) && node.name.text === name);
  if (found.length !== 1) throw new Error(`Expected one actual variable ${name}, found ${found.length}`);
  required(found[0].initializer, name);
  return found[0];
}
function plainFunction(node: ts.FunctionDeclaration) {
  return node.getText().replace(/^export\s+(?:default\s+)?/, '');
}
function compile(code: string, bindings: Record<string, any> = {}) {
  const ast = ts.createSourceFile('offline.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (nodes(ast, ts.isImportDeclaration).length || nodes(ast, ts.isCallExpression).some(
    node => node.expression.kind === ts.SyntaxKind.ImportKeyword)) throw new Error('Module imports prohibited in offline VM');
  const output = ts.transpileModule(code, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
    jsxFactory: '__element', jsxFragmentFactory: '__fragment',
  } }).outputText;
  expect(output).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
  runInNewContext(output, bindings, { timeout: 1000 });
  return bindings;
}
// Replace ONLY whitelisted dynamic imports inside selected VM source, never disk.
function offlineImports(code: string, imports: Record<string, string>) {
  const ast = ts.createSourceFile('isolated.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const seen: string[] = [];
  const transformed = ts.transform(ast, [context => root => {
    const visit: ts.Visitor = node => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = required(node.arguments[0], 'dynamic import argument');
        if (!ts.isStringLiteral(argument)) throw new Error('Nonliteral offline import forbidden');
        const loader = required(imports[argument.text], `allowed VM loader ${argument.text}`);
        seen.push(argument.text);
        return ts.factory.createCallExpression(ts.factory.createIdentifier(loader), undefined, []);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitNode(root, visit) as ts.SourceFile;
  }]);
  try {
    expect(seen.sort()).toEqual(Object.keys(imports).sort());
    return ts.createPrinter().printFile(transformed.transformed[0]);
  } finally { transformed.dispose(); }
}
function routeBody(name: string): ts.Block {
  const properties = nodes(routerAst, ts.isPropertyAssignment).filter(node =>
    (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === name);
  if (properties.length !== 1) throw new Error(`Expected one route ${name}`);
  const call = required(nodes(properties[0], ts.isCallExpression).find(node =>
    ts.isPropertyAccessExpression(node.expression) && ['mutation', 'query'].includes(node.expression.name.text)
    && !!node.arguments[0] && ts.isArrowFunction(node.arguments[0])), `${name} handler`);
  const handler = call.arguments[0] as ts.ArrowFunction;
  if (!ts.isBlock(handler.body)) throw new Error('Expected block route handler');
  return handler.body;
}
const querySource = plainFunction(declaration(scannerAst, 'getAfTierScanOrdersQuery'));
const queryVm = compile(querySource + '\nglobalThis.query = getAfTierScanOrdersQuery;');
type Query = { query: string; params: Array<string | number> };
const actualQuery = queryVm.query as (coin: string, targetOrderId?: number) => Query;
type OrderRow = {
  id: number; ledger_id: number; user_id: number; coin: string; limit_price: string;
  order_type: string | null; side: string; status: string | null; is_gift: number | null;
  source_order_id: number | null; confirmed_at: string | null; sell_status: string | null;
};
type AdvancedRow = {
  id: number; ledger_id: number; order_id: number; status: string | null;
  fulfilled_at: string | null; limit_price: string;
};
type Candidate = Pick<OrderRow, 'id' | 'ledger_id' | 'user_id' | 'coin' | 'limit_price'>;
const fixtureDate = '2025-02-12 10:00:00';
function main(overrides: Partial<OrderRow> = {}): OrderRow {
  return { id: 8101, ledger_id: 52, user_id: 901, coin: 'ETH', limit_price: '2100',
    order_type: '高级委托', side: 'buy', status: 'completed', is_gift: 0,
    source_order_id: null, confirmed_at: fixtureDate, sell_status: null, ...overrides };
}
function gift(overrides: Partial<OrderRow> = {}): OrderRow {
  return main({ id: 8201, user_id: 902, order_type: null, is_gift: 1, source_order_id: 8101, ...overrides });
}
function advanced(overrides: Partial<AdvancedRow> = {}): AdvancedRow {
  return { id: 8301, ledger_id: 52, order_id: 8101, status: 'fulfilled',
    fulfilled_at: fixtureDate, limit_price: '2800', ...overrides };
}
const sqliteScript = String.raw`
import json, sqlite3, sys
payload = json.load(sys.stdin)
conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
conn.execute('''CREATE TABLE af_orders (
 id INTEGER PRIMARY KEY, ledger_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
 coin TEXT NOT NULL, limit_price TEXT NOT NULL, order_type TEXT, side TEXT NOT NULL,
 status TEXT, is_gift INTEGER, source_order_id INTEGER, confirmed_at TEXT, sell_status TEXT
)''')
conn.execute('''CREATE TABLE af_advanced_orders (
 id INTEGER PRIMARY KEY, ledger_id INTEGER NOT NULL, order_id INTEGER NOT NULL,
 status TEXT, fulfilled_at TEXT, limit_price TEXT NOT NULL
)''')
for table, key in [('af_orders', 'orders'), ('af_advanced_orders', 'advanced')]:
 rows = payload[key]
 if rows:
  columns = list(rows[0].keys())
  conn.executemany('INSERT INTO ' + table + ' (' + ','.join(columns) + ') VALUES (' + ','.join('?' for _ in columns) + ')',
                   [[row[column] for column in columns] for row in rows])
conn.commit()
conn.execute('PRAGMA query_only = ON')
def snapshot():
 return {'orders': [dict(row) for row in conn.execute('SELECT * FROM af_orders ORDER BY id')],
         'advanced': [dict(row) for row in conn.execute('SELECT * FROM af_advanced_orders ORDER BY id')]}
before = snapshot()
results = [[dict(row) for row in conn.execute(query['query'], query['params'])] for query in payload['queries']]
after = snapshot()
read_only = conn.execute('PRAGMA query_only').fetchone()[0]
conn.close()
print(json.dumps({'results': results, 'before': before, 'after': after, 'readOnly': read_only}))
`;
function offlineSelect(orders: OrderRow[], advancedRows: AdvancedRow[], queries: Query[]): Candidate[][] {
  const snapshot = JSON.stringify({ orders, advancedRows });
  const child = spawnSync('python3', ['-c', sqliteScript], {
    input: JSON.stringify({ orders, advanced: advancedRows, queries }), encoding: 'utf8', timeout: 10_000,
    maxBuffer: 1024 * 1024,
    // Deliberately do not forward DATABASE_URL/.env/production credentials.
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', PYTHONIOENCODING: 'utf-8' },
  });
  if (child.error) throw new Error(`Offline SQLite unavailable: ${child.error.message}`);
  if (child.status !== 0) throw new Error(`Offline SQLite failure: ${child.stderr}`);
  const result = JSON.parse(child.stdout);
  expect(result.readOnly).toBe(1);
  expect(result.after).toEqual(result.before);
  expect(result.before).toEqual({ orders: [...orders].sort((a, b) => a.id - b.id),
    advanced: [...advancedRows].sort((a, b) => a.id - b.id) });
  expect(JSON.stringify({ orders, advancedRows })).toBe(snapshot);
  return result.results;
}
function selectedIds(orders: OrderRow[], advancedRows: AdvancedRow[], target?: number, coin = 'ETH') {
  return offlineSelect(orders, advancedRows, [actualQuery(coin, target)])[0].map(row => row.id).sort((a, b) => a - b);
}

// The 4 + 11 topology is a synthetic analogue, not a production snapshot or low.
function fourGroups() {
  const orders: OrderRow[] = [];
  const advancedRows: AdvancedRow[] = [];
  const giftIds: number[] = [];
  for (const [index, count] of [3, 3, 3, 2].entries()) {
    const id = 8101 + index;
    orders.push(main({ id, user_id: 901 + index }));
    advancedRows.push(advanced({ id: 8301 + index, order_id: id }));
    for (let child = 0; child < count; child++) {
      const giftId = 8201 + index * 10 + child;
      giftIds.push(giftId);
      orders.push(gift({ id: giftId, user_id: 950 + giftIds.length, source_order_id: id,
        order_type: [null, '', '无损合约', '高级委托'][giftIds.length % 4] }));
    }
  }
  return { orders, advancedRows, giftIds };
}

describe('AF tier candidate SELECT: actual AST helper + read-only offline SQLite', () => {
  it.each(['无损合约', null, ''])('52 ordinary type=%s main and same-source gifts keep eligibility', order_type => {
    expect(selectedIds([main({ order_type }), gift({ order_type })], [])).toEqual([8101, 8201]);
  });
  it.each(['无损合约', null, '', '高级委托'])('fulfilled advanced source includes completed gift type=%s', order_type => {
    expect(selectedIds([main(), gift({ order_type })], [advanced()])).toEqual([8101, 8201]);
  });
  it('fulfilled_at permits a main without confirmed_at and NULL fulfilled_at falls back to source confirmation', () => {
    expect(selectedIds([main({ confirmed_at: null }), gift()], [advanced()])).toEqual([8101, 8201]);
    expect(selectedIds([main(), gift()], [advanced({ fulfilled_at: null })])).toEqual([8101, 8201]);
  });
  it('legacy NULL non-gift marker supports advanced source; non-gift ignores unrelated source_order_id', () => {
    expect(selectedIds([main({ is_gift: null, source_order_id: 99999 }), gift()], [advanced()])).toEqual([8101, 8201]);
  });
  it.each(['active', 'reached', 'cancelled', 'pending', null])('advanced status=%s excludes source and related gifts despite stale fill dates', status => {
    expect(selectedIds([main(), gift()], [advanced({ status })])).toEqual([]);
  });
  it('fulfilled missing BOTH fulfillment and source confirmation excludes even independently dated gifts', () => {
    expect(selectedIds([main({ confirmed_at: null }), gift()], [advanced({ fulfilled_at: null })])).toEqual([]);
  });
  it.each(['pending', 'cancelled', 'sold', null])('noncompleted advanced source status=%s excludes all related completed gifts', status => {
    expect(selectedIds([main({ status }), gift()], [advanced()])).toEqual([]);
  });
  it.each(['pending', 'cancelled', 'sold', null])('gift candidate raw status=%s never auto-completes from fulfilled source', status => {
    expect(selectedIds([main(), gift({ status })], [advanced()])).toEqual([8101]);
  });
  it.each([null, '', 'selling', 'sell_cancelled'])('candidate sell_status=%s retains the scanner original unsold policy', sell_status => {
    expect(selectedIds([main({ sell_status }), gift({ sell_status })], [advanced()])).toEqual([8101, 8201]);
  });
  it('sold candidate excluded independently, without erasing sibling/source eligibility', () => {
    expect(selectedIds([main(), gift({ sell_status: 'sold' })], [advanced()])).toEqual([8101]);
    expect(selectedIds([main({ sell_status: 'sold' }), gift()], [advanced()])).toEqual([8201]);
  });
  it.each(['pending', 'cancelled', 'holding'])('unrecognised sell_status=%s keeps original exclusion', sell_status => {
    expect(selectedIds([main({ sell_status }), gift({ sell_status })], [advanced()])).toEqual([]);
  });
  it.each(['sell', 'other'])('source side=%s cannot authorize a buy gift', side => {
    expect(selectedIds([main({ side }), gift()], [advanced()])).toEqual([]);
  });
  it.each([1, 2])('alleged source is_gift=%s must not act as a non-gift source', is_gift => {
    expect(selectedIds([main({ is_gift }), gift()], [advanced()])).toEqual([]);
  });
  it.each([null, 0, 99999])('missing/orphan gift source ID=%s cannot use unrelated advanced record', source_order_id => {
    expect(selectedIds([main(), gift({ source_order_id })], [advanced()])).toEqual([8101]);
  });
  it('orphan advanced row is not a substitute for the actual main', () => {
    expect(selectedIds([gift()], [advanced()])).toEqual([]);
  });
  it.each([37, 53])('cross-ledger=%s source cannot authorize local gift', ledger_id => {
    expect(selectedIds([main({ ledger_id }), gift()], [advanced({ ledger_id })])).toEqual([]);
  });
  it('cross-coin source cannot authorize local ETH gift', () => {
    expect(selectedIds([main({ coin: 'BTC' }), gift()], [advanced()])).toEqual([]);
  });
  it('advanced metadata must join same source order and same ledger, never gift order ID', () => {
    expect(selectedIds([main(), gift()], [advanced({ ledger_id: 53 })])).toEqual([]);
    expect(selectedIds([main(), gift()], [advanced({ order_id: 8201 })])).toEqual([]);
    expect(selectedIds([main(), gift()], [])).toEqual([]);
  });
  it.each(['普通委托', '现货', '高级委托'])('52 gift with non-lossless ordinary source type=%s is excluded without valid advanced fulfillment', order_type => {
    expect(selectedIds([main({ order_type }), gift()], [])).toEqual([]);
  });
  it.each(['现货', '普通委托'])('noncontract gift type=%s excluded even when advanced source is fulfilled', order_type => {
    expect(selectedIds([main(), gift({ order_type })], [advanced()])).toEqual([8101]);
  });
  it.each(['pending', 'cancelled'])('ordinary source status=%s also excludes its completed gift', status => {
    expect(selectedIds([main({ order_type: '无损合约', status }), gift()], [])).toEqual([]);
  });
  it('52 ordinary orphan/cross-ledger/cross-coin/non-buy/gift source do not get admitted by NULL gift type', () => {
    const variants = [undefined, main({ order_type: '无损合约', ledger_id: 53 }),
      main({ order_type: '无损合约', coin: 'BTC' }), main({ order_type: '无损合约', side: 'sell' }),
      main({ order_type: '无损合约', is_gift: 1 })];
    for (const source of variants) {
      const ids = selectedIds(source ? [source, gift()] : [gift()], []);
      expect(ids).not.toContain(8201);
    }
  });
  it.each([37, 51, 53])('ordinary other-ledger=%s retains old type/null/empty policy even with orphan or invalid source', ledger_id => {
    const orders = ['无损合约', null, ''].flatMap((order_type, index) => [
      main({ id: 8400 + index, ledger_id, order_type }),
      gift({ id: 8500 + index, ledger_id, order_type, source_order_id: 99999 }),
    ]);
    expect(selectedIds(orders, [])).toEqual([8400, 8401, 8402, 8500, 8501, 8502]);
    expect(selectedIds([main({ ledger_id }), gift({ ledger_id, order_type: '高级委托' })],
      [advanced({ ledger_id })])).toEqual([]);
  });
  it('52 ordinary rows ignore wrong-ledger advanced metadata but not a matched unfulfilled advanced record', () => {
    const orders = [main({ order_type: '无损合约' }), gift()];
    expect(selectedIds(orders, [advanced({ ledger_id: 53 })])).toEqual([8101, 8201]);
    expect(selectedIds(orders, [advanced({ status: 'active' })])).toEqual([]);
  });
  it('coin and source ID are bound parameters; directed parent includes its own gifts only', () => {
    const { orders, advancedRows } = fourGroups();
    const query = actualQuery('ETH', 8101);
    expect(query.params).toEqual(['ETH', 8101, 8101]);
    expect(selectedIds(orders, advancedRows, 8101)).toEqual([8101, 8201, 8202, 8203]);
    expect(selectedIds(orders, advancedRows, 8201)).toEqual([8201]);
    expect(selectedIds(orders, advancedRows, 99999)).toEqual([]);
    expect(selectedIds(orders, advancedRows, undefined, "ETH' OR 1=1 --")).toEqual([]);
  });
  it('synthetic four completed main + eleven gifts produce fifteen independent candidates and repeat SELECTs are unchanged', () => {
    const { orders, advancedRows, giftIds } = fourGroups();
    const query = actualQuery('ETH');
    const result = offlineSelect(orders, advancedRows, [query, query]);
    expect(result[0]).toHaveLength(15);
    expect(result[0].map(row => row.id).sort((a, b) => a - b)).toEqual([8101, 8102, 8103, 8104, ...giftIds]);
    expect(result[1]).toEqual(result[0]);
  });
  it('supplied read-only IDs: 1173 includes exactly 1173/1221/1222/1223, not 1172/1168/1167 groups', () => {
    // Only supplied IDs/relationships are represented. No production lookup or
    // inferred IDs for the other eight gifts; 4+11 is covered synthetically above.
    const ids = [1173, 1172, 1168, 1167];
    const confirmed_at = '2026-11-09 10:00:00';
    const orders = [
      ...ids.map(id => main({ id, confirmed_at })),
      ...[1221, 1222, 1223].map(id => gift({ id, source_order_id: 1173, confirmed_at })),
    ];
    const advancedRows = ids.map((id, index) => advanced({ id: 8600 + index,
      order_id: id, fulfilled_at: confirmed_at }));
    expect(selectedIds(orders, advancedRows)).toEqual([1167, 1168, 1172, 1173, 1221, 1222, 1223]);
    expect(selectedIds(orders, advancedRows, 1173)).toEqual([1173, 1221, 1222, 1223]);
  });
  it('SELECT emits the candidate own actual o.limit_price, not the preserved advanced entrust audit price', () => {
    const rows = offlineSelect([main(), gift({ limit_price: '2000' })], [advanced()], [actualQuery('ETH')])[0];
    expect(rows).toEqual([
      { id: 8101, ledger_id: 52, user_id: 901, coin: 'ETH', limit_price: '2100' },
      { id: 8201, ledger_id: 52, user_id: 902, coin: 'ETH', limit_price: '2000' },
    ]);
  });
  it('query_only rejects order and advanced writes even on the fixture DB', () => {
    for (const query of ["UPDATE af_orders SET status = 'completed'", "DELETE FROM af_advanced_orders"])
      expect(() => offlineSelect([main()], [advanced()], [{ query, params: [] }])).toThrow(/readonly database/);
  });
});

type Stats = { scan_count: number; all_time_low_price: string; all_time_low_at: string; last_low_price: string };
type Trigger = { order_id: number; ledger_id: number; coin: string; tier: number; trigger_price: string };
function scanAdapter(orders = [main(), gift()], advancedRows = [advanced()]) {
  const stats = new Map<number, Stats>();
  const triggers: Trigger[] = [];
  const priceLogs: Array<Array<string | number | null>> = [];
  const forbidden = vi.fn((query: string): never => { throw new Error(`Forbidden offline DB operation: ${query}`); });
  const snapshot = JSON.stringify({ orders, advancedRows });
  const execute = vi.fn(async (query: string, params: any[] = []) => {
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (/^SELECT o\.id, o\.ledger_id, o\.user_id, o\.coin, o\.limit_price FROM af_orders o /.test(normalized))
      return [offlineSelect(orders, advancedRows, [{ query, params }])[0]];
    if (/^INSERT INTO af_price_scan_logs /.test(normalized)) {
      priceLogs.push([...params]); return [{ affectedRows: 1 }];
    }
    if (/^SELECT scan_count, all_time_low_price, all_time_low_at FROM af_order_scan_stats /.test(normalized))
      return [stats.has(params[0]) ? [{ ...stats.get(params[0])! }] : []];
    if (/^INSERT INTO af_order_scan_stats /.test(normalized)) {
      const [id, , low] = params;
      if (stats.has(id)) throw new Error('Duplicate offline stats');
      stats.set(id, { scan_count: 1, all_time_low_price: low, all_time_low_at: fixtureDate, last_low_price: low });
      return [{ affectedRows: 1 }];
    }
    if (/^UPDATE af_order_scan_stats SET /.test(normalized)) {
      const [lowString, low, , , id] = params;
      const row = required(stats.get(id), `existing stats ${id}`);
      row.scan_count++;
      row.last_low_price = lowString;
      if (low < Number(row.all_time_low_price)) {
        row.all_time_low_price = lowString; row.all_time_low_at = fixtureDate;
      }
      return [{ affectedRows: 1 }];
    }
    if (/^SELECT COALESCE\(MAX\(tier\), 0\) as maxTier FROM af_order_tier_triggers /.test(normalized))
      return [[{ maxTier: Math.max(0, ...triggers.filter(t => t.order_id === params[0]).map(t => t.tier)) }]];
    if (/^INSERT INTO af_order_tier_triggers /.test(normalized)) {
      const [order_id, ledger_id, coin, tier, trigger_price] = params;
      if (triggers.some(t => t.order_id === order_id && t.tier === tier)) throw new Error('Duplicate offline trigger');
      triggers.push({ order_id, ledger_id, coin, tier, trigger_price });
      return [{ affectedRows: 1 }];
    }
    return forbidden(query);
  });
  return { execute, stats, triggers, priceLogs, forbidden, unchanged: () =>
    expect(JSON.stringify({ orders, advancedRows })).toBe(snapshot) };
}
const scannerSource = offlineImports([
  `const ${variable(scannerAst, 'COIN_SYMBOLS').getText()};`,
  `const ${variable(scannerAst, 'scanStatus').getText()};`,
  `let ${variable(scannerAst, 'globalScanLock').getText()};`,
  ...['getAfTierScanOrdersQuery', 'runTierScan', 'getScanStatus', 'triggerImmediateScan']
    .map(name => plainFunction(declaration(scannerAst, name))),
  'globalThis.entries = { runTierScan, getScanStatus, triggerImmediateScan };',
].join('\n'), { './db': '__loadOfflineDb' });
function scannerHarness(adapter = scanAdapter(), env: Record<string, string> = {}) {
  let low: number | null = 1809; // Explicit synthetic input, never read from an API.
  const timers: Array<{ callback: () => Promise<void>; delay: number }> = [];
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const network = vi.fn((): never => { throw new Error('Live network forbidden'); });
  const loadDb = vi.fn(async () => ({ getDbConnection }));
  const getDbConnection = vi.fn(async () => ({ execute: adapter.execute }));
  const fetchLow = vi.fn(async (_coin: string) => low === null ? null : ({ low,
    scanFrom: new Date('2025-02-12T02:00:00Z'), scanTo: new Date('2025-02-12T06:00:00Z') }));
  const context = compile(scannerSource, {
    process: { env: { ...env } }, console: logger, fetch: network,
    fetch4hLowPrice: fetchLow, __loadOfflineDb: loadDb,
    setTimeout: vi.fn((callback: () => Promise<void>, delay: number) => { timers.push({ callback, delay }); return timers.length; }),
    setInterval: () => { throw new Error('Real interval forbidden'); },
  });
  return { ...adapter, logger, network, loadDb, getDbConnection, fetchLow, timers,
    run: context.entries.runTierScan as (id?: number, coin?: string) => Promise<void>,
    status: context.entries.getScanStatus as (coin: string) => any,
    trigger: context.entries.triggerImmediateScan as (id: number) => void,
    setLow: (value: number | null) => { low = value; } };
}
function maxTier(harness: ReturnType<typeof scannerHarness>, id: number) {
  return Math.max(0, ...harness.triggers.filter(t => t.order_id === id).map(t => t.tier));
}
// Use the existing financial rate expression only; no sell route/wallet execution.
const updateBody = routeBody('afAdminUpdateOrder');
const rates = variable(updateBody, 'equityDiscountRates');
const rateAssignment = required(nodes(updateBody, ts.isBinaryExpression).find(node =>
  node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)
  && node.left.text === 'discountRate' && nodes(node.right, ts.isIdentifier).some(id => id.text === 'equityDiscountRates')),
  'actual equity discount assignment');
const rateVm = compile(`function actualRate(maxTier) { const ${rates.getText()}; let discountRate = 1;
  ${rateAssignment.getText()}; return discountRate; } globalThis.actualRate = actualRate;`);

describe('runTierScan: actual scanner VM with SQLite candidates and fake 4h low/connection', () => {
  it('2100 -> synthetic 1809 gives independent tier1 and keeps actual old 0.6667 financial ratio', async () => {
    const h = scannerHarness();
    await h.run(8101, 'ETH');
    expect(h.fetchLow).toHaveBeenCalledOnce();
    expect(h.fetchLow).toHaveBeenCalledWith('ETH');
    expect([...h.stats.keys()].sort()).toEqual([8101, 8201]);
    expect(h.triggers).toEqual([8101, 8201].map(order_id =>
      ({ order_id, ledger_id: 52, coin: 'ETH', tier: 1, trigger_price: '1809' })));
    expect(rateVm.actualRate(maxTier(h, 8101))).toBe(0.6667);
    expect(rateVm.actualRate(0)).toBe(1);
    expect(h.stats.get(8101)?.scan_count).toBe(1);
    expect(h.stats.get(8201)?.scan_count).toBe(1);
    expect(h.forbidden).not.toHaveBeenCalled();
    expect(h.network).not.toHaveBeenCalled();
    h.unchanged();
  });
  it('rescan updates each stats count without duplicate tier; rebound never restores tier/history/ratio', async () => {
    const h = scannerHarness();
    await h.run(8101, 'ETH');
    const first = structuredClone(h.triggers);
    await h.run(8101, 'ETH');
    expect(h.triggers).toEqual(first);
    h.setLow(2300);
    await h.run(8101, 'ETH');
    expect(h.triggers).toEqual(first);
    for (const id of [8101, 8201]) {
      expect(h.stats.get(id)).toMatchObject({ scan_count: 3, all_time_low_price: '1809', last_low_price: '2300' });
      expect(maxTier(h, id)).toBe(1);
      expect(rateVm.actualRate(maxTier(h, id))).toBe(0.6667);
    }
    expect(h.priceLogs).toHaveLength(3);
    expect(h.forbidden).not.toHaveBeenCalled();
    h.unchanged();
  });
  it('uses own actual execution price, not advanced audit limit; gifts have independent tier/stats', async () => {
    const h = scannerHarness(scanAdapter([main(), gift({ limit_price: '1800' }),
      gift({ id: 8202, limit_price: '3000' })], [advanced({ limit_price: '2800' })]));
    await h.run(8101, 'ETH');
    expect(maxTier(h, 8101)).toBe(1); // audit 2800 would wrongly produce tier3
    expect(maxTier(h, 8201)).toBe(0); // parent tier1 must not be moved/copied to gift
    expect(maxTier(h, 8202)).toBe(3);
    expect([...h.stats.keys()].sort()).toEqual([8101, 8201, 8202]);
    for (const id of [8101, 8201, 8202]) expect(h.stats.get(id)?.scan_count).toBe(1);
    h.unchanged();
  });
  it('four previously unscanned mains get own tier1 while eleven pretriggered gifts are neither reset nor duplicated', async () => {
    const { orders, advancedRows, giftIds } = fourGroups();
    const h = scannerHarness(scanAdapter(orders, advancedRows));
    for (const id of giftIds) {
      h.triggers.push({ order_id: id, ledger_id: 52, coin: 'ETH', tier: 1, trigger_price: '1800' });
      h.stats.set(id, { scan_count: 7, all_time_low_price: '1800', all_time_low_at: fixtureDate, last_low_price: '1800' });
    }
    const historicalGifts = structuredClone(h.triggers);
    for (const id of [8101, 8102, 8103, 8104]) expect(h.stats.has(id)).toBe(false);
    await h.run(undefined, 'ETH');
    expect(h.stats.size).toBe(15);
    expect(h.triggers).toHaveLength(15);
    expect(h.triggers.filter(t => giftIds.includes(t.order_id))).toEqual(historicalGifts);
    for (const id of [8101, 8102, 8103, 8104]) {
      expect(h.stats.get(id)?.scan_count).toBe(1);
      expect(h.triggers.find(t => t.order_id === id)).toMatchObject({ tier: 1, trigger_price: '1809' });
    }
    for (const id of giftIds) expect(h.stats.get(id)).toMatchObject({ scan_count: 8, all_time_low_price: '1800' });
    h.unchanged();
  });
  it('directed parent scans only its source group; other group tiers/stats stay untouched', async () => {
    const { orders, advancedRows } = fourGroups();
    const h = scannerHarness(scanAdapter(orders, advancedRows));
    await h.run(8101, 'eth');
    expect([...h.stats.keys()].sort()).toEqual([8101, 8201, 8202, 8203]);
    expect(h.triggers.map(t => t.order_id).sort()).toEqual([8101, 8201, 8202, 8203]);
    expect(h.fetchLow).toHaveBeenCalledOnce();
    expect(h.fetchLow).toHaveBeenCalledWith('ETH');
    expect(h.stats.has(8102)).toBe(false);
    h.unchanged();
  });
  it.each(['PREVIEW_READONLY', 'FAST_PREVIEW'])('%s=true returns before db import/connect, mock low, fetch or writes for full AND directed scans', async flag => {
    const h = scannerHarness(scanAdapter(), { [flag]: 'true' });
    await h.run();
    await h.run(8101, 'ETH');
    expect(h.loadDb).not.toHaveBeenCalled();
    expect(h.getDbConnection).not.toHaveBeenCalled();
    expect(h.fetchLow).not.toHaveBeenCalled();
    expect(h.network).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.stats.size).toBe(0);
    expect(h.triggers).toEqual([]);
    expect(h.priceLogs).toEqual([]);
    expect(h.status('ETH')).toBeNull();
    expect(h.timers).toHaveLength(0);
    h.unchanged();
  });
  it('absent mock low produces no logs, stats or triggers and releases scanning state', async () => {
    const h = scannerHarness(); h.setLow(null);
    await h.run(8101, 'ETH');
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.status('ETH').scanning).toBe(false);
    expect(h.triggers).toEqual([]);
    expect(h.network).not.toHaveBeenCalled();
  });
  it('missing fake connection returns before mock low and full lock is released for next run', async () => {
    const h = scannerHarness();
    h.getDbConnection.mockResolvedValueOnce(null as any);
    await h.run(undefined, 'ETH');
    expect(h.fetchLow).not.toHaveBeenCalled();
    await h.run(undefined, 'ETH');
    expect(h.fetchLow).toHaveBeenCalledOnce();
    expect(maxTier(h, 8101)).toBe(1);
  });
  it('a scanner adapter error is logged, contained, and does not write order/wallet or retain full lock', async () => {
    const h = scannerHarness();
    h.execute.mockRejectedValueOnce(new Error('offline log failure'));
    await expect(h.run(undefined, 'ETH')).resolves.toBeUndefined();
    expect(h.logger.warn).toHaveBeenCalled();
    await h.run(undefined, 'ETH');
    expect(h.stats.get(8101)?.scan_count).toBe(2);
    expect(h.triggers).toHaveLength(2);
    expect(h.forbidden).not.toHaveBeenCalled();
    h.unchanged();
  });
  it('candidate SELECT rejection is contained by the real per-coin catch and the next full scan can proceed', async () => {
    const h = scannerHarness();
    const originalExecute = required(h.execute.getMockImplementation(), 'fake execute implementation');
    let fail = true;
    h.execute.mockImplementation(async (query, params = []) => {
      if (fail && /^SELECT o\.id/.test(query)) {
        fail = false;
        throw new Error('synthetic candidate SELECT failure');
      }
      return originalExecute(query, params);
    });
    await expect(h.run(undefined, 'ETH')).resolves.toBeUndefined();
    expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining('ETH 处理出错'), expect.any(Error));
    expect(h.stats.size).toBe(0);
    expect(h.triggers).toEqual([]);
    expect(h.status('ETH').scanning).toBe(false);
    await h.run(undefined, 'ETH');
    expect(h.stats.get(8101)?.scan_count).toBe(1);
    expect(maxTier(h, 8101)).toBe(1);
    expect(h.forbidden).not.toHaveBeenCalled();
    h.unchanged();
  });
});

describe('triggerImmediateScan: actual timer callback, manually advanced with no live timer', () => {
  it('schedules exactly 3000ms, performs no scan synchronously and dispatches the same source ID afterwards', async () => {
    const h = scannerHarness();
    h.trigger(8101);
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0].delay).toBe(3000);
    expect(h.loadDb).not.toHaveBeenCalled();
    expect(h.execute).not.toHaveBeenCalled();
    await h.timers[0].callback();
    const candidates = h.execute.mock.calls.filter(([query]) => /^SELECT o\.id/.test(query));
    expect(candidates).toHaveLength(3);
    expect(candidates.map(([, params]) => params)).toEqual([
      ['BTC', 8101, 8101], ['ETH', 8101, 8101], ['SOL', 8101, 8101],
    ]);
    expect(h.triggers.map(t => t.order_id).sort()).toEqual([8101, 8201]);
    expect(h.network).not.toHaveBeenCalled();
    h.unchanged();
  });
  it('actual delayed callback catches a scan/db-loader rejection instead of surfacing it', async () => {
    const h = scannerHarness();
    h.loadDb.mockRejectedValueOnce(new Error('offline scanner unavailable'));
    h.trigger(8101);
    await expect(h.timers[0].callback()).resolves.toBeUndefined();
    expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining('即时扫描订单#8101失败'), expect.any(Error));
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.forbidden).not.toHaveBeenCalled();
  });
});

const fulfillBody = routeBody('afAdminFulfillAdvancedOrder');
const postCommitSchedule = required(fulfillBody.statements.find((statement): statement is ts.ExpressionStatement =>
  ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression)
  && ts.isIdentifier(statement.expression.expression) && statement.expression.expression.text === 'setTimeout'),
  'actual postcommit gift scheduling');
const postCommitCall = postCommitSchedule.expression as ts.CallExpression;
const followup = required(postCommitCall.arguments[0], 'actual followup callback');
if (!ts.isArrowFunction(followup) || !ts.isBlock(followup.body)) throw new Error('Expected actual followup arrow block');
const followTry = required(followup.body.statements.find(ts.isTryStatement), 'actual followup try');
const followFinally = required(followTry.finallyBlock, 'actual followup finally');
const scheduleIndex = fulfillBody.statements.indexOf(postCommitSchedule);
const postCommitSource = offlineImports(`async function afterCommittedFill() {
  ${fulfillBody.statements.slice(scheduleIndex - 1).map(node => node.getText()).join('\n')}
} globalThis.run = afterCommittedFill;`, { './af-tier-scanner': '__loadOfflineScanner' });
function finallyHarness(mode: 'nonYjh' | 'giftError' | 'noConnection' | 'eligible' = 'nonYjh') {
  const timers: Array<{ callback: () => Promise<void>; delay: number }> = [];
  const scan = vi.fn();
  const scanImport = vi.fn(async () => ({ triggerImmediateScan: scan }));
  const logger = { log: vi.fn(), error: vi.fn() };
  const forbidden = vi.fn((name: string): never => { throw new Error(`Forbidden postcommit write: ${name}`); });
  const execute = vi.fn(async (query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (mode === 'giftError') throw new Error('synthetic gift lookup failure');
    if (/^SELECT beneficiary_user_id, ratio FROM af_payout_ratios /.test(normalized)) return [[]];
    if (/^SELECT enabled, target_user_id, gift_ratio FROM af_525_switch /.test(normalized)) return [[{ enabled: 0 }]];
    return forbidden(query);
  });
  const transaction = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  const connection = { execute, ...transaction };
  const getDbConnection = vi.fn(async () => mode === 'noConnection' ? null : connection);
  const eligible = vi.fn(async () => mode === 'eligible');
  const fulfilledOrder = Object.freeze({ id: 8101, userId: 901, coin: 'ETH', amount: 100, limitPrice: 2100, quantity: '1' });
  const context = compile(postCommitSource, {
    input: Object.freeze({ ledgerId: 52, orderId: 8101 }), fulfilledOrder, console: logger,
    getDbConnection, isAf525EligibleSourceUser: eligible, __loadOfflineScanner: scanImport,
    conn: transaction, wallet: new Proxy({}, { get: (_target, name) => forbidden(String(name)) }),
    fetch: () => forbidden('fetch'),
    setTimeout: vi.fn((callback: () => Promise<void>, delay: number) => { timers.push({ callback, delay }); return 1; }),
  });
  return { run: context.run as () => Promise<any>, timers, scan, scanImport, logger,
    execute, eligible, transaction, forbidden, fulfilledOrder, getDbConnection };
}

describe('advanced fulfillment: execute actual postcommit return + gift try/catch/finally in isolated VM', () => {
  it('actual scheduling is after commit/rollback/release scope and has a protected finally', () => {
    const transaction = required(fulfillBody.statements.find((node): node is ts.TryStatement =>
      ts.isTryStatement(node) && nodes(node.tryBlock, ts.isCallExpression).some(call =>
        ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'commit')), 'fulfillment transaction');
    expect(fulfillBody.statements.indexOf(transaction)).toBeLessThan(scheduleIndex);
    const calls = nodes(followFinally, ts.isCallExpression);
    expect(calls.filter(call => ts.isIdentifier(call.expression) && call.expression.text === 'triggerImmediateScan')).toHaveLength(1);
    expect(calls.some(call => ts.isPropertyAccessExpression(call.expression)
      && ['commit', 'rollback', 'execute', 'beginTransaction'].includes(call.expression.name.text))).toBe(false);
    const scanTry = required(followFinally.statements.find(ts.isTryStatement), 'scan dispatch try/catch');
    expect(scanTry.catchClause).toBeDefined();
  });
  it.each(['nonYjh', 'giftError', 'noConnection', 'eligible'] as const)('%s branch returns committed success and still dispatches scan in the actual finally', async mode => {
    const h = finallyHarness(mode);
    await expect(h.run()).resolves.toEqual({ success: true, orderId: 8101, fulfilledPrice: 2100 });
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0].delay).toBe(0);
    expect(h.scan).not.toHaveBeenCalled(); // route return does not await scanner
    await expect(h.timers[0].callback()).resolves.toBeUndefined();
    expect(h.scanImport).toHaveBeenCalledOnce();
    expect(h.scan).toHaveBeenCalledOnce();
    expect(h.scan).toHaveBeenCalledWith(8101);
    if (mode === 'nonYjh') {
      expect(h.eligible).toHaveBeenCalledOnce();
      expect(h.eligible).toHaveBeenCalledWith(expect.anything(), 901);
    }
    if (mode === 'giftError') expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining('赠单或扫描联动失败'), expect.any(Error));
    for (const operation of Object.values(h.transaction)) expect(operation).not.toHaveBeenCalled();
    expect(h.forbidden).not.toHaveBeenCalled();
    expect(h.fulfilledOrder.limitPrice).toBe(2100);
  });
  it.each(['import', 'dispatch'] as const)('scanner %s error cannot force rollback, alter wallet/order, or reject committed route success', async failure => {
    const h = finallyHarness('nonYjh');
    if (failure === 'import') h.scanImport.mockRejectedValueOnce(new Error('synthetic scan import failure'));
    else h.scan.mockImplementationOnce(() => { throw new Error('synthetic dispatch failure'); });
    const result = await h.run();
    expect(result).toEqual({ success: true, orderId: 8101, fulfilledPrice: 2100 });
    await expect(h.timers[0].callback()).resolves.toBeUndefined();
    expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining('档位扫描调度失败'), expect.any(Error));
    for (const operation of Object.values(h.transaction)) expect(operation).not.toHaveBeenCalled();
    expect(h.forbidden).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, orderId: 8101, fulfilledPrice: 2100 });
  });
  it('actual finally hands source ID to actual 3s trigger, with no synchronous database/network/wallet work', async () => {
    const h = finallyHarness('nonYjh');
    const scanner = scannerHarness();
    h.scan.mockImplementation(scanner.trigger);
    await h.run();
    await h.timers[0].callback();
    expect(scanner.timers[0].delay).toBe(3000);
    expect(scanner.execute).not.toHaveBeenCalled();
    await scanner.timers[0].callback();
    expect([...scanner.stats.keys()].sort()).toEqual([8101, 8201]);
    expect(scanner.forbidden).not.toHaveBeenCalled();
    expect(scanner.network).not.toHaveBeenCalled();
    expect(h.transaction.rollback).not.toHaveBeenCalled();
    scanner.unchanged();
  });
});

type Element = { tag: unknown; props: Record<string, any>; children: unknown[] };
function element(tag: unknown, props: Record<string, any> | null, ...children: unknown[]): Element {
  return { tag, props: props ?? {}, children };
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('');
  if (value && typeof value === 'object' && 'children' in value) return (value as Element).children.map(text).join('');
  return value == null || typeof value === 'boolean' ? '' : String(value);
}
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  return value && typeof value === 'object' && 'children' in value
    ? [value as Element, ...(value as Element).children.flatMap(elements)] : [];
}
const detail = declaration(pageAst, 'OrderDetail');
const equitySection = required(nodes(detail, ts.isJsxExpression).find(node => {
  const expression = node.expression;
  return !!expression && ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    && nodes(expression.left, ts.isIdentifier).some(id => id.text === 'isContract')
    && nodes(expression.right, ts.isJsxText).some(label => label.text.trim() === '当前收益权');
}), 'actual isContract-guarded current-equity section');
const frontendDeclarations = ['triggeredTiers', 'maxTriggered', 'currentTier', 'isAdvanced', 'isCompleted',
  'isCompletedAdvancedContract', 'isContract', 'feeStartAt'].map(name => `const ${variable(detail, name).getText()};`).join('\n');
const detailSource = `const ${variable(pageAst, 'TIER_LABELS').getText()};
function offlineDetail({ order, ledgerId = 52, tierData = null, tierLoading = false, livePrice = 0, orderMultiplier = 5.25 }) {
  ${frontendDeclarations}
  return { isAdvanced, isCompleted, isCompletedAdvancedContract, isContract, currentTier,
    tree: (${required(equitySection.expression, 'actual equity expression').getText()}) };
} globalThis.render = offlineDetail;`;
function detailHarness() {
  const forbidden = vi.fn((name: string): never => { throw new Error(`Forbidden UI dependency: ${name}`); });
  const context = compile(detailSource, {
    __element: element, __fragment: 'fragment', Loader2: 'offline-loader', getAfManagementFeeStartAt,
    formatCoinQty: (amount: number) => amount.toFixed(4),
    fetch: () => forbidden('fetch'), trpc: new Proxy({}, { get: (_target, name) => forbidden(String(name)) }),
    window: new Proxy({}, { get: (_target, name) => forbidden(String(name)) }),
  });
  return { render: context.render as (props: Record<string, any>) => any, forbidden };
}
function pageOrder(overrides: Record<string, unknown> = {}) {
  return { id: 8101, coin: 'ETH', side: 'buy', status: 'completed', orderType: '高级委托',
    isAdvanced: true, advancedStatus: 'fulfilled', limitPrice: '2100', advancedLimitPrice: '2800',
    quantity: '1', amount: '100', createdAt: fixtureDate, managementFeeStartAt: fixtureDate, ...overrides };
}

describe('user OrderDetail: execute actual identity declarations and isContract-guarded equity JSX offline', () => {
  it.each([52, 37, 51, 53])('completed fulfilled advanced identity is a contract ONLY on ledger=%s when it is 52', ledgerId => {
    const h = detailHarness();
    const result = h.render({ order: Object.freeze(pageOrder()), ledgerId });
    expect(result.isAdvanced).toBe(true);
    expect(result.isCompletedAdvancedContract).toBe(ledgerId === 52);
    expect(result.isContract).toBe(ledgerId === 52);
    expect(text(result.tree).includes('当前收益权')).toBe(ledgerId === 52);
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each(['active', 'reached', 'pending', 'cancelled', null, undefined])('advancedStatus=%s never enters equity even if main is completed or simulated', advancedStatus => {
    const h = detailHarness();
    for (const isSimulated of [false, true]) {
      const result = h.render({ order: pageOrder({ advancedStatus, isSimulated }) });
      expect(result.isCompletedAdvancedContract).toBe(false);
      expect(result.isContract).toBe(false);
      expect(text(result.tree)).toBe('');
    }
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each(['pending', 'cancelled', 'sold', undefined])('uncompleted main status=%s cannot enter advanced equity despite fulfilled metadata', status => {
    const result = detailHarness().render({ order: pageOrder({ status }) });
    expect(result.isCompleted).toBe(false);
    expect(result.isContract).toBe(false);
    expect(text(result.tree)).toBe('');
  });
  it('orderType高级委托 fallback counts as advanced even when flag false; explicit flag also counts for other type', () => {
    for (const order of [pageOrder({ isAdvanced: false }), pageOrder({ orderType: '现货' })]) {
      const result = detailHarness().render({ order });
      expect(result.isAdvanced).toBe(true);
      expect(result.isContract).toBe(true);
      expect(text(result.tree)).toContain('当前收益权');
    }
  });
  it.each(['无损合约', null, '', undefined])('legacy ordinary type=%s retains old contract equity display', orderType => {
    const result = detailHarness().render({ order: pageOrder({ orderType, isAdvanced: false, advancedStatus: undefined }), ledgerId: 37 });
    expect(result.isAdvanced).toBe(false);
    expect(result.isCompletedAdvancedContract).toBe(false);
    expect(result.isContract).toBe(true);
    expect(text(result.tree)).toContain('收益权档位表');
  });
  it('ordinary simulated custom type retains old display; real noncontract custom type remains excluded', () => {
    for (const isSimulated of [true, false]) {
      const result = detailHarness().render({ order: pageOrder({ isAdvanced: false, orderType: '现货', isSimulated }) });
      expect(result.isContract).toBe(isSimulated);
      expect(text(result.tree).includes('当前收益权')).toBe(isSimulated);
    }
  });
  it('buy-only actual guard excludes sell equity without changing the fulfilled contract identity', () => {
    const result = detailHarness().render({ order: pageOrder({ side: 'sell' }) });
    expect(result.isContract).toBe(true);
    expect(text(result.tree)).toBe('');
  });
  it('actual current-equity JSX consumes this order tier1/stats and preserves displayed 66.7%, not an unguarded duplicate', async () => {
    const scan = scannerHarness();
    await scan.run(8101, 'ETH');
    const h = detailHarness();
    const order = Object.freeze(pageOrder());
    const before = JSON.stringify(order);
    const result = h.render({ order, tierData: {
      triggers: scan.triggers.filter(t => t.order_id === order.id).map(t =>
        ({ tier: t.tier, triggerPrice: t.trigger_price, triggeredAt: fixtureDate })),
      scanCount: scan.stats.get(order.id)?.scan_count, latestLowPrice: '1809', allTimeLowPrice: '1809',
      scanStatus: { scanning: false, lowestPrice: '1809', lastScanAt: fixtureDate },
    } });
    expect(result.currentTier).toBe(1);
    const summary = required(elements(result.tree).find(e => e.tag === 'div'
      && e.props.className === 'mt-2 rounded-lg p-3'), 'rendered current equity summary');
    expect(text(summary)).toContain('当前收益权66.7%(1/2)');
    expect(text(summary)).toContain('1.0000 × 66.7% = 0.6670 ETH');
    expect(text(result.tree)).toContain('累计扫描1 次');
    expect(text(result.tree)).toContain('1,809');
    expect(JSON.stringify(order)).toBe(before);
    expect(h.forbidden).not.toHaveBeenCalled();
    scan.unchanged();
  });
  it('related gifts rendered with their own trigger data never borrow the parent currentTier', () => {
    const h = detailHarness();
    const mainResult = h.render({ order: pageOrder(), tierData: { triggers: [{ tier: 1 }] } });
    const giftResult = h.render({ order: pageOrder({ id: 8201, isGift: 1, isAdvanced: false, orderType: null }),
      tierData: { triggers: [], scanCount: 1 } });
    expect(mainResult.currentTier).toBe(1);
    expect(giftResult.currentTier).toBe(0);
    expect(text(giftResult.tree)).toContain('当前收益权100%(1/1)');
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it('sold fulfilled advanced keeps historical equity section with 已结束 rather than restarting scans', () => {
    const h = detailHarness();
    const result = h.render({ order: pageOrder({ sellStatus: 'sold', sellConfirmedAt: fixtureDate }) });
    expect(result.isContract).toBe(true);
    expect(text(result.tree)).toContain('已结束');
    expect(h.forbidden).not.toHaveBeenCalled();
  });
});
