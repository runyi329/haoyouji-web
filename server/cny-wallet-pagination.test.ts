import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { parseHistoricalPrincipalSources, type HistoricalPrincipalSource } from '../shared/wallet-historical-principal';

// 离线回归：只读取生产源码，不 import DB/路由模块、不初始化真实数据库。
// VM 仅执行 AST 抽出的两项生产函数；ensure 明确 stub，假连接仅接受 SELECT/CTE。
// Fixtures 只模拟数据库返回值。SQL 的余额回放语义以真实 SQL 结构断言验证，
// 不把假连接当成 MySQL 引擎，也不依赖客户端尚未完成的源码。
type Filter = 'all' | 'in' | 'out';
type Row = {
  id: string;
  user_id: number;
  amount: number | string;
  balance_after: number | null;
  available_after?: number | null;
  business_date?: string | null;
  note?: string;
  created_at: string;
  source_type: string;
  total_count?: string | number;
};
type Query = { sql: string; bindings: unknown[]; limit: number; offset: number; filter: Filter };
type Page = {
  items: Row[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  historicalSourceCount: number;
};
type Runtime = {
  getUserCnyHistory: (userId: unknown, limit?: unknown, offset?: unknown, filter?: unknown,
    sources?: HistoricalPrincipalSource[]) => Promise<Row[]>;
  getUserCnyHistoryPage: (userId: unknown, input?: Record<string, unknown>) => Promise<Page>;
};

function parse(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST definition: ${label}`);
  return value;
}
function evaluate<T>(source: string, bindings: Record<string, unknown>): T {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}

const dbAst = parse('./db-recharge.ts');
const routerAst = parse('./routers.ts');
const printer = ts.createPrinter();
function productionFunction(name: string) {
  const fn = required(dbAst.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name), name);
  // 仅去掉导出修饰符，签名及函数体完全来自生产 AST，避免执行模块顶层代码。
  const isolated = ts.factory.updateFunctionDeclaration(fn,
    fn.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword
      && modifier.kind !== ts.SyntaxKind.DefaultKeyword),
    fn.asteriskToken, fn.name, fn.typeParameters, fn.parameters, fn.type, fn.body);
  return printer.printNode(ts.EmitHint.Unspecified, isolated, dbAst);
}
const runtimeSource = [
  productionFunction('getUserCnyHistory'),
  productionFunction('getUserCnyHistoryPage'),
  '({ getUserCnyHistory, getUserCnyHistoryPage });',
].join('\n');

function fixtures(count = 146): readonly Row[] {
  let balance = 0;
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const amount = index % 3 === 0 ? 100 : -7;
    balance += amount;
    return Object.freeze({
      id: `manual_balance-${index + 1}`, user_id: 28, amount, balance_after: balance,
      created_at: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
      source_type: 'manual_balance',
    });
  }).reverse());
}
const history = fixtures();
function withoutTotal(row: Row) {
  const { total_count: _total, ...rest } = row;
  return rest;
}
function sourceFixtureBindings(source: HistoricalPrincipalSource, userId: unknown) {
  return [source.id, userId, source.amount, `[CNY]历史微信存入 · ${source.sourceTag} · ${source.note}`,
    `${source.businessDate} 00:00:00`, source.linkedWalletEntryId];
}
function sourceDisplayFixture(source: HistoricalPrincipalSource): Row {
  return { id: source.id, user_id: 28, amount: source.amount,
    note: `[CNY]历史微信存入 · ${source.sourceTag} · ${source.note}`,
    created_at: `${source.businessDate} 00:00:00`, business_date: source.businessDate,
    source_type: 'historical_principal_source', balance_after: null, available_after: null };
}
function dateSortedFixtures(rows: readonly Row[]): Row[] {
  // 只对预先定义的数据库返回夹具排序，不解析 UNION/窗口函数或重算余额。
  return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}
function harness(rows: readonly Row[] = history, connected = true, historicalRows: HistoricalPrincipalSource[] = []) {
  const queries: Query[] = [];
  const execute = vi.fn(async (sql: string, bindings: unknown[] = []) => {
    expect(sql.trim()).toMatch(/^(?:SELECT\b|WITH\b)/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|GRANT|CALL)\b/i);
    expect(sql).not.toContain(';');
    const pagination = required(/\bLIMIT (\d+) OFFSET (\d+)\s*$/.exec(sql) ?? undefined, 'safe inline pagination');
    const limit = Number(pagination[1]);
    const offset = Number(pagination[2]);
    expect(Number.isSafeInteger(limit)).toBe(true);
    expect(limit).toBeGreaterThanOrEqual(1);
    expect(limit).toBeLessThanOrEqual(100);
    expect(Number.isSafeInteger(offset)).toBe(true);
    expect(offset).toBeGreaterThanOrEqual(0);
    const sourceCount = (bindings.length - 5) / 6;
    expect(Number.isInteger(sourceCount)).toBe(true);
    expect(sourceCount).toBeGreaterThanOrEqual(0);
    expect(bindings).toHaveLength(5 + 6 * sourceCount);
    expect((sql.match(/\?/g) ?? []).length).toBe(5 + 6 * sourceCount);
    expect(bindings.slice(0, 5)).toEqual(Array(5).fill(bindings[0]));
    const sourceRows = Array.from({ length: sourceCount }, (_, index) => {
      const bound = bindings.slice(5 + index * 6, 11 + index * 6);
      const source = required(historicalRows.find(row => row.id === bound[0]), 'known source fixture');
      expect(bound).toEqual(sourceFixtureBindings(source, bindings[0]));
      return sourceDisplayFixture(source);
    });
    const filter: Filter = sql.includes('WHERE e.amount > 0') ? 'in'
      : sql.includes('WHERE e.amount < 0') ? 'out' : 'all';
    queries.push({ sql, bindings: Array.from(bindings), limit, offset, filter });
    const filtered = dateSortedFixtures([...rows, ...sourceRows])
      .filter(row => filter === 'all' || (filter === 'in' ? Number(row.amount) > 0 : Number(row.amount) < 0));
    return [filtered.slice(offset, offset + limit).map(row => ({ ...row, total_count: String(filtered.length) })), []];
  });
  const ensure = vi.fn(async () => undefined);
  const getConnection = vi.fn(async () => connected ? { execute } : null);
  const getHistoricalSources = vi.fn(async () => historicalRows);
  const runtime = evaluate<Runtime>(runtimeSource, {
    getDbConnection: getConnection,
    ensureLedger37WalletInfrastructure: ensure,
    getUserCnyHistoricalPrincipalSources: getHistoricalSources,
    // VM 中不提供 require/import/process；无法加载生产模块或访问连接配置。
  });
  return { ...runtime, queries, execute, ensure, getConnection, getHistoricalSources };
}
function ctePrefix(sql: string) {
  const displayAt = sql.indexOf('), wallet_display_rows AS (');
  expect(displayAt).toBeGreaterThan(0);
  return sql.slice(0, displayAt);
}
function route(name: string) {
  const properties = nodes(routerAst, ts.isPropertyAssignment).filter(node => node.name.getText(routerAst) === name);
  expect(properties).toHaveLength(1);
  return required(properties[0], name);
}
function routeQuery(name: string) {
  const property = route(name);
  const query = required(nodes(property.initializer, ts.isCallExpression).find(call =>
    ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'query'), `${name}.query`);
  const arrow = required(query.arguments[0], `${name} query callback`);
  if (!ts.isArrowFunction(arrow)) throw new Error('Expected production query callback');
  return arrow;
}
function routeSchema(name: string) {
  const input = required(nodes(route(name).initializer, ts.isCallExpression).find(call =>
    ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'input'), `${name}.input`);
  const schema = required(input.arguments[0], `${name} input schema`);
  return evaluate<z.ZodTypeAny>(`(${schema.getText(routerAst)});`, { z });
}

// 直接调用底层函数时也必须安全；输入 schema 的拒绝行为另行检查。
describe('CNY history: real source, finite integer SQL and SELECT-only isolation', () => {
  it('defaults to LIMIT 50 OFFSET 0 and keeps all five userId parameters bound', async () => {
    const test = harness();
    const items = await test.getUserCnyHistory(28);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(50);
    expect(test.queries[0]).toMatchObject({ limit: 50, offset: 0, filter: 'all', bindings: Array(5).fill(28) });
    expect(test.ensure).toHaveBeenCalledOnce();
    expect(test.getConnection).toHaveBeenCalledOnce();
    expect(test.execute).toHaveBeenCalledOnce();
    expect(test.getHistoricalSources).not.toHaveBeenCalled();
  });

  it.each([
    ['fractional numbers', 20.9, 2.9, 20, 2],
    ['negative numbers', -50, -10, 1, 0],
    ['zero limit defaults', 0, 0, 50, 0],
    ['limit maximum', 1000, 100.8, 100, 100],
    ['Infinity', Infinity, Infinity, 50, 0],
    ['negative Infinity', -Infinity, -Infinity, 50, 0],
    ['NaN', NaN, NaN, 50, 0],
    ['numeric strings', '20.9', '2.9', 20, 2],
    ['malicious strings', '50; DROP TABLE users;--', '0 UNION SELECT 1', 50, 0],
    ['non-numeric strings', 'NaN', 'Infinity', 50, 0],
    ['largest finite number', Number.MAX_VALUE, Number.MAX_VALUE, 100, Number.MAX_SAFE_INTEGER],
    ['smallest positive number', Number.MIN_VALUE, Number.MIN_VALUE, 1, 0],
    ['undefined values', undefined, undefined, 50, 0],
    ['null values', null, null, 50, 0],
  ])('%s are clamped to safe integer literals', async (_label, limit, offset, expectedLimit, expectedOffset) => {
    const test = harness();
    await test.getUserCnyHistory(28, limit, offset);
    expect(test.queries[0]).toMatchObject({ limit: expectedLimit, offset: expectedOffset });
    expect(test.queries[0].sql).not.toMatch(/(?:NaN|Infinity|UNION SELECT 1|DROP TABLE)/);
  });

  it('hostile filter/limit/offset cannot change SQL, and hostile userId stays only in bindings', async () => {
    const test = harness();
    await test.getUserCnyHistory(28);
    const baseline = test.queries[0].sql;
    const hostile = "28' OR 1=1; DROP TABLE users;--";
    await test.getUserCnyHistory(hostile, '50; SELECT 1', '0; DELETE FROM users', 'in OR 1=1');
    expect(test.queries[1].sql).toBe(baseline);
    expect(test.queries[1].bindings).toEqual(Array(5).fill(hostile));
    expect(test.queries[1].sql).not.toContain(hostile);
  });

  it('no connection returns an array without running ensure or any SQL', async () => {
    const test = harness(history, false);
    expect(await test.getUserCnyHistory(28)).toEqual([]);
    expect(test.ensure).not.toHaveBeenCalled();
    expect(test.execute).not.toHaveBeenCalled();
  });
});

describe('CNY SQL: full-history balances precede flow filter, COUNT and pagination', () => {
  it('all/in/out retain identical CTEs and all four unbounded replay windows', async () => {
    const test = harness();
    for (const filter of ['all', 'in', 'out'] as const) await test.getUserCnyHistory(28, 20, 40, filter);
    const baseline = ctePrefix(test.queries[0].sql);
    for (const query of test.queries) {
      const prefix = ctePrefix(query.sql);
      expect(prefix).toBe(baseline);
      expect(prefix).not.toMatch(/\b(?:LIMIT|OFFSET)\b|WHERE e\.amount/);
      expect(prefix.match(/ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW/g)).toHaveLength(4);
      expect(prefix.match(/ORDER BY created_at ASC, source_order ASC, event_id ASC/g)).toHaveLength(4);
      expect(prefix).toContain('PARTITION BY user_id, snapshot_sequence');
      for (const cte of ['cny_events', 'sequenced_events', 'state_after_snapshot', 'snapshot_values']) expect(prefix).toContain(cte);
      const combinedAt = query.sql.indexOf('), combined_display_rows AS (');
      const finalAt = query.sql.indexOf('SELECT e.id, e.user_id');
      const wallet = query.sql.slice(prefix.length, combinedAt);
      expect(wallet).toContain('AS balance_after');
      expect(wallet).toContain('AS available_after');
      expect(wallet).toContain('first_snapshot.recorded_balance - first_snapshot.snapshot_amount');
      expect(wallet).toContain('current_snapshot.recorded_balance + current_snapshot.legacy_balance_total');
      expect(wallet).toContain('e.legacy_delta_since_snapshot - e.frozen_after');
      expect(wallet).toContain('LEFT JOIN snapshot_values current_snapshot');
      expect(wallet).not.toMatch(/COUNT\(\*\)|WHERE e\.amount|\b(?:LIMIT|OFFSET)\b/);
      expect(finalAt).toBeGreaterThan(combinedAt);
      const final = query.sql.slice(finalAt);
      expect(final).toMatch(/COUNT\(\*\) OVER\s*\(\s*\) AS total_count/);
      expect(final).toContain('FROM combined_display_rows e');
      const orderAt = final.indexOf('ORDER BY e.created_at DESC, e.source_order DESC, e.event_id DESC');
      expect(orderAt).toBeGreaterThan(final.indexOf('FROM combined_display_rows e'));
      expect(final.indexOf('LIMIT 20 OFFSET 40')).toBeGreaterThan(orderAt);
      const condition = query.filter === 'all' ? '' : `WHERE e.amount ${query.filter === 'in' ? '>' : '<'} 0`;
      if (condition) {
        expect(final.match(/WHERE e\.amount/g)).toHaveLength(1);
        expect(final.indexOf(condition)).toBeGreaterThan(final.indexOf('FROM combined_display_rows e'));
        expect(final.indexOf(condition)).toBeLessThan(orderAt);
      } else expect(final).not.toContain('WHERE e.amount');
    }
  });

  it('filtering/paging keeps each returned row at its full-history replay balance', async () => {
    const test = harness();
    const before = JSON.stringify(history);
    const all = await test.getUserCnyHistoryPage(28, { page: 1, pageSize: 100 });
    for (const filter of ['in', 'out'] as const) {
      const expected = history.filter(row => filter === 'in' ? Number(row.amount) > 0 : Number(row.amount) < 0);
      const result = await test.getUserCnyHistoryPage(28, { page: 2, pageSize: 20, filter });
      expect(result.total).toBe(expected.length);
      expect(result.items.map(withoutTotal)).toEqual(expected.slice(20, 40));
      for (const item of result.items) {
        expect(item.balance_after).toBe(required(history.find(row => row.id === item.id), item.id).balance_after);
      }
      expect(ctePrefix(test.queries.at(-1)!.sql)).toBe(ctePrefix(test.queries[0].sql));
    }
    expect(all.total).toBe(history.length);
    expect(JSON.stringify(history)).toBe(before);
  });
});

describe('CNY page contract: 146 rows, supported sizes and stale-page recovery', () => {
  it.each([20, 50, 100])('pageSize=%i covers all 146 records once with correct page metadata', async pageSize => {
    const test = harness();
    const totalPages = Math.ceil(history.length / pageSize);
    const items: Row[] = [];
    const lengths: number[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const result = await test.getUserCnyHistoryPage(28, { page, pageSize });
      const expectedLength = Math.min(pageSize, history.length - (page - 1) * pageSize);
      expect(Object.keys(result).sort()).toEqual(['items', 'page', 'pageSize', 'total', 'totalPages',
        'hasPrevious', 'hasNext', 'historicalSourceCount'].sort());
      expect(result).toMatchObject({ page, pageSize, total: 146, totalPages,
        hasPrevious: page > 1, hasNext: page < totalPages, historicalSourceCount: 0 });
      expect(result.items).toHaveLength(expectedLength);
      expect(test.queries.at(-1)).toMatchObject({ limit: pageSize, offset: (page - 1) * pageSize });
      items.push(...result.items);
      lengths.push(result.items.length);
    }
    if (pageSize === 50) expect(lengths).toEqual([50, 50, 46]);
    if (pageSize === 100) expect(lengths).toEqual([100, 46]);
    if (pageSize === 20) {
      expect(totalPages).toBe(8);
      expect(lengths).toEqual(Array.from({ length: totalPages }, (_, index) => Math.min(pageSize, history.length - index * pageSize)));
    }
    expect(items.map(withoutTotal)).toEqual(history);
    expect(new Set(items.map(row => row.id)).size).toBe(146);
    expect(test.queries).toHaveLength(totalPages);
  });

  it.each([20, 50, 100])('empty stale page first reads one row then clamps to last page for size %i', async pageSize => {
    const test = harness();
    const lastPage = Math.ceil(history.length / pageSize);
    const result = await test.getUserCnyHistoryPage(28, { page: 999, pageSize, filter: 'all' });
    expect(test.queries.map(({ limit, offset }) => ({ limit, offset }))).toEqual([
      { limit: pageSize, offset: (999 - 1) * pageSize },
      { limit: 1, offset: 0 },
      { limit: pageSize, offset: (lastPage - 1) * pageSize },
    ]);
    expect(result).toMatchObject({ page: lastPage, pageSize, total: 146, totalPages: lastPage, hasPrevious: true, hasNext: false });
    expect(result.items.map(withoutTotal)).toEqual(history.slice((lastPage - 1) * pageSize));
  });

  it.each(['in', 'out'] as const)('stale %s page probes and reloads using the same filter', async filter => {
    const test = harness();
    const expected = history.filter(row => filter === 'in' ? Number(row.amount) > 0 : Number(row.amount) < 0);
    const lastPage = Math.ceil(expected.length / 20);
    const result = await test.getUserCnyHistoryPage(28, { page: 999, pageSize: 20, filter });
    expect(test.queries.map(query => query.filter)).toEqual([filter, filter, filter]);
    expect(test.queries[1]).toMatchObject({ limit: 1, offset: 0 });
    expect(result).toMatchObject({ page: lastPage, total: expected.length, totalPages: lastPage, hasNext: false });
    expect(result.items.map(withoutTotal)).toEqual(expected.slice((lastPage - 1) * 20));
  });

  it.each([1, 9])('empty total=0 at requested page %i returns stable page 1 and no reload', async page => {
    const test = harness([]);
    expect(await test.getUserCnyHistoryPage(28, { page })).toEqual({
      items: [], page: 1, pageSize: 50, total: 0, totalPages: 1, hasPrevious: false, hasNext: false,
      historicalSourceCount: 0,
    });
    expect(test.queries).toHaveLength(page === 1 ? 1 : 2);
    if (page > 1) expect(test.queries[1]).toMatchObject({ limit: 1, offset: 0 });
  });

  it('omitted input defaults to the first 50-row page', async () => {
    const test = harness();
    expect(await test.getUserCnyHistoryPage(28)).toMatchObject({ page: 1, pageSize: 50, total: 146,
      totalPages: 3, hasPrevious: false, hasNext: true });
  });

  it.each([
    ['fractional', 2.9, 2], ['numeric string', '2.9', 2],
    ['negative', -10, 1], ['zero', 0, 1], ['NaN', NaN, 1],
    ['Infinity', Infinity, 1], ['negative Infinity', -Infinity, 1],
    ['malicious string', '2; DROP TABLE users;--', 1],
    ['huge finite', Number.MAX_VALUE, 10000],
  ])('%s page is normalized before SQL offset calculation', async (_label, rawPage, requestedPage) => {
    const test = harness();
    const result = await test.getUserCnyHistoryPage(28, { page: rawPage });
    expect(test.queries[0]).toMatchObject({ limit: 50, offset: (requestedPage - 1) * 50 });
    expect(result.page).toBe(Math.min(requestedPage, Math.ceil(history.length / 50)));
  });

  it.each([0, -20, 10, 20.9, NaN, Infinity, '20', '100', '50; DROP TABLE users;--'])
  ('unsupported pageSize %s and hostile filter fall back to fixed defaults', async pageSize => {
    const test = harness();
    const result = await test.getUserCnyHistoryPage(28, { pageSize, filter: 'out; DELETE FROM users' });
    expect(result).toMatchObject({ page: 1, pageSize: 50, total: 146, totalPages: 3 });
    expect(test.queries[0]).toMatchObject({ limit: 50, offset: 0, filter: 'all' });
  });
});

describe('CNY pagination routes: extracted schemas and identity guards only', () => {
  it('both routes remain protected and expose only fixed page sizes/filters', () => {
    for (const name of ['getCnyHistoryPage', 'adminGetUserCnyHistoryPage']) {
      const property = route(name);
      expect(nodes(property.initializer, ts.isIdentifier).some(node => node.text === 'protectedProcedure')).toBe(true);
      const schema = routeSchema(name);
      const base = name.startsWith('admin') ? { userId: 28 } : {};
      expect(schema.parse(base)).toMatchObject({ page: 1, pageSize: 50, filter: 'all' });
      for (const pageSize of [20, 50, 100]) expect(schema.safeParse({ ...base, pageSize }).success).toBe(true);
      for (const filter of ['all', 'in', 'out']) expect(schema.safeParse({ ...base, filter }).success).toBe(true);
      for (const page of [0, -1, 1.5, NaN, Infinity, 10001, '2', '1; SELECT 1']) {
        expect(schema.safeParse({ ...base, page }).success).toBe(false);
      }
      for (const pageSize of [0, 10, 20.5, NaN, Infinity, '20', '50; SELECT 1']) {
        expect(schema.safeParse({ ...base, pageSize }).success).toBe(false);
      }
      expect(schema.safeParse({ ...base, filter: 'in OR 1=1' }).success).toBe(false);
    }
    const adminSchema = routeSchema('adminGetUserCnyHistoryPage');
    for (const userId of [0, -1, 1.5, NaN, Infinity, '28', '28 OR 1=1']) {
      expect(adminSchema.safeParse({ userId }).success).toBe(false);
    }
  });

  it('self callback binds ctx.user.id, never a caller-supplied userId', async () => {
    const getPage = vi.fn(async () => ({ marker: 'self' }));
    const query = evaluate<(args: Record<string, unknown>) => Promise<unknown>>(
      `(${routeQuery('getCnyHistoryPage').getText(routerAst)});`, { dbRecharge: { getUserCnyHistoryPage: getPage } });
    const input = { userId: 999999, page: 2, pageSize: 20, filter: 'out' };
    expect(await query({ ctx: { user: { id: 28, role: 'user' } }, input })).toEqual({ marker: 'self' });
    expect(getPage).toHaveBeenLastCalledWith(28, input);
    await query({ ctx: { user: { id: 29, role: 'user' } }, input: undefined });
    expect(getPage).toHaveBeenLastCalledWith(29, {});
  });

  it.each(['admin', 'super_admin'])('%s may query the explicit target user', async role => {
    const getPage = vi.fn(async () => ({ marker: 'admin' }));
    const query = evaluate<(args: Record<string, unknown>) => Promise<unknown>>(
      `(${routeQuery('adminGetUserCnyHistoryPage').getText(routerAst)});`, { dbRecharge: { getUserCnyHistoryPage: getPage } });
    const input = { userId: 1234, page: 3, pageSize: 50, filter: 'in' };
    expect(await query({ ctx: { user: { id: 28, role } }, input })).toEqual({ marker: 'admin' });
    expect(getPage).toHaveBeenCalledOnce();
    expect(getPage).toHaveBeenCalledWith(1234, input);
  });

  it.each(['user', 'member', 'super', 'admin_like', '', undefined])('%s is denied before any DB function call', async role => {
    const getPage = vi.fn(async () => []);
    const query = evaluate<(args: Record<string, unknown>) => Promise<unknown>>(
      `(${routeQuery('adminGetUserCnyHistoryPage').getText(routerAst)});`, { dbRecharge: { getUserCnyHistoryPage: getPage } });
    await expect(query({ ctx: { user: { id: 28, role } }, input: { userId: 1234 } })).rejects.toThrow('无权限');
    expect(getPage).not.toHaveBeenCalled();
  });
});

// 来源是同一明细中的展示行，进入尾层 COUNT/分页，但绝不进入资金事件/余额回放。
function historicalFixture() {
  // 故意不按日期提供，迁入日与业务日不同；覆盖早于146条资金记录的2025-12-29。
  return ['2026-01-05', '2025-12-29', '2026-05-05', '2026-01-01'].flatMap((businessDate, index) =>
    parseHistoricalPrincipalSources({
      id: 9001 + index, ledger_id: 37, amount: '100', created_at: '2026-06-01 10:00:00',
      note: '[CNY]历史手工保证金迁入并冻结 · 历史保证金 · startDate=2026-06-01'
        + `[历史微信本金V1:${businessDate},100,LQY]`,
    }));
}

describe('CNY historical sources share dated items/pagination but never wallet accounting', () => {
  it.each(['all', 'in'] as const)('%s binds sources only after all replay CTEs and wallet balances', async filter => {
    const sources = historicalFixture();
    expect(sources).toHaveLength(4);
    const test = harness(history, true, sources);
    const baseline = harness();
    const result = await test.getUserCnyHistoryPage(28, { page: 1, pageSize: 100, filter });
    await baseline.getUserCnyHistory(28, 100, 0, filter);
    expect(result).not.toHaveProperty('historicalSources');
    expect(result.historicalSourceCount).toBe(4);
    expect(test.getHistoricalSources).toHaveBeenCalledOnce();
    expect(test.getHistoricalSources).toHaveBeenCalledWith(28);
    expect(test.getHistoricalSources.mock.invocationCallOrder[0]).toBeLessThan(test.execute.mock.invocationCallOrder[0]);
    const { sql, bindings } = test.queries[0];
    expect(ctePrefix(sql)).toBe(ctePrefix(baseline.queries[0].sql));
    expect(ctePrefix(sql)).not.toContain('historical_principal_source');
    expect(ctePrefix(sql).match(/ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW/g)).toHaveLength(4);
    const combinedAt = sql.indexOf('), combined_display_rows AS (');
    const finalAt = sql.indexOf('SELECT e.id, e.user_id');
    const walletAt = sql.indexOf('), wallet_display_rows AS (');
    expect(walletAt).toBeGreaterThan(sql.indexOf('), snapshot_values AS ('));
    const wallet = sql.slice(walletAt, combinedAt);
    expect(wallet).toBe(baseline.queries[0].sql.slice(walletAt, baseline.queries[0].sql.indexOf('), combined_display_rows AS (')));
    expect(wallet).not.toContain('historical_principal_source');
    const combined = sql.slice(combinedAt, finalAt);
    expect(combined).toContain('SELECT * FROM wallet_display_rows');
    expect(combined.match(/UNION ALL SELECT \?, \?, CAST\(\? AS DECIMAL\(36,18\)\), \?, CAST\(\? AS DATETIME\),\s*'historical_principal_source', NULL, NULL, 0, \?/g)).toHaveLength(4);
    expect(combined).not.toMatch(/COALESCE|SUM\(|OVER\s*\(|COUNT\(\*\)|balance_after\s*=\s*0/);
    const final = sql.slice(finalAt);
    expect(final).toContain("CASE WHEN e.source_type = 'historical_principal_source'");
    expect(final).toContain("THEN DATE_FORMAT(e.created_at, '%Y-%m-%d') ELSE NULL END AS business_date");
    expect(final).toContain('e.balance_after, e.available_after, COUNT(*) OVER () AS total_count');
    expect(final).not.toMatch(/COALESCE|SUM\(/);
    expect(final.indexOf('FROM combined_display_rows e')).toBeLessThan(final.indexOf('ORDER BY e.created_at DESC'));
    expect(final.indexOf('LIMIT 100 OFFSET 0')).toBeGreaterThan(final.indexOf('ORDER BY e.created_at DESC'));
    if (filter === 'in') expect(final.indexOf('WHERE e.amount > 0')).toBeGreaterThan(final.indexOf('FROM combined_display_rows e'));
    expect(bindings).toEqual([...Array(5).fill(28), ...sources.flatMap(source => sourceFixtureBindings(source, 28))]);
    expect(bindings).toHaveLength(29);
    expect(sources.every(source => source.countsTowardBalance === false)).toBe(true);
    for (const source of sources) {
      expect(sql).not.toContain(source.businessDate);
      expect(sql).not.toContain(source.id);
      expect(sql).not.toContain(source.note);
    }
  });

  it.each([20, 50, 100])('pageSize=%i returns exactly 150 mixed-date rows once, including 4 NULL-balance sources', async pageSize => {
    const sources = historicalFixture();
    const before = JSON.stringify([history, sources]);
    const expected = dateSortedFixtures([...history, ...sources.map(sourceDisplayFixture)]);
    const test = harness(history, true, sources);
    const totalPages = Math.ceil(150 / pageSize);
    const items: Row[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const result = await test.getUserCnyHistoryPage(28, { page, pageSize });
      expect(Object.keys(result).sort()).toEqual(['items', 'page', 'pageSize', 'total', 'totalPages',
        'hasPrevious', 'hasNext', 'historicalSourceCount'].sort());
      expect(result).toMatchObject({ page, pageSize, total: 150, totalPages, historicalSourceCount: 4,
        hasPrevious: page > 1, hasNext: page < totalPages });
      expect(result.items.map(withoutTotal)).toEqual(expected.slice((page - 1) * pageSize, page * pageSize));
      expect(result.items.every(item => item.total_count === '150')).toBe(true);
      expect(test.queries.at(-1)!.bindings).toHaveLength(29);
      items.push(...result.items);
    }
    expect(items).toHaveLength(150);
    expect(new Set(items.map(item => item.id)).size).toBe(150);
    expect(items.filter(item => item.source_type !== 'historical_principal_source').map(withoutTotal)).toEqual(history);
    const sourceItems = items.filter(item => item.source_type === 'historical_principal_source');
    expect(sourceItems.map(item => item.business_date)).toEqual(['2026-05-05', '2026-01-05', '2026-01-01', '2025-12-29']);
    expect(items.at(-1)).toMatchObject({ business_date: '2025-12-29', created_at: '2025-12-29 00:00:00' });
    for (const source of sourceItems) {
      expect(source.balance_after).toBeNull();
      expect(source.available_after).toBeNull();
      expect(source.balance_after).not.toBe(0);
      expect(source.available_after).not.toBe(0);
      expect(source.amount).toBe('100');
      expect(source.created_at).not.toContain('2026-06-01');
    }
    expect(test.getHistoricalSources).toHaveBeenCalledTimes(totalPages);
    expect(test.queries).toHaveLength(totalPages);
    expect(JSON.stringify([history, sources])).toBe(before);
  });

  it.each(['all', 'in'] as const)('stale %s page reuses the same four sources for initial query, count probe and reload', async filter => {
    const sources = historicalFixture();
    const test = harness(history, true, sources);
    const expected = dateSortedFixtures([...history, ...sources.map(sourceDisplayFixture)])
      .filter(item => filter === 'all' || Number(item.amount) > 0);
    const lastPage = Math.ceil(expected.length / 20);
    const result = await test.getUserCnyHistoryPage(28, { page: 999, pageSize: 20, filter });
    expect(result).toMatchObject({ page: lastPage, total: expected.length, totalPages: lastPage,
      historicalSourceCount: 4, hasNext: false });
    expect(result.items.map(withoutTotal)).toEqual(expected.slice((lastPage - 1) * 20));
    expect(test.queries.map(({ limit, offset }) => ({ limit, offset }))).toEqual([
      { limit: 20, offset: 998 * 20 }, { limit: 1, offset: 0 }, { limit: 20, offset: (lastPage - 1) * 20 },
    ]);
    expect(test.getHistoricalSources).toHaveBeenCalledOnce();
    expect(test.queries.map(query => query.filter)).toEqual([filter, filter, filter]);
    expect(test.queries.map(query => query.bindings)).toEqual(Array(3).fill([
      ...Array(5).fill(28), ...sources.flatMap(source => sourceFixtureBindings(source, 28)),
    ]));
  });

  it('out never obtains sources, including stale-page probing/reload', async () => {
    const test = harness(history, true, historicalFixture());
    const result = await test.getUserCnyHistoryPage(28, { page: 999, pageSize: 20, filter: 'out' });
    expect(result).not.toHaveProperty('historicalSources');
    expect(result.historicalSourceCount).toBe(0);
    expect(test.getHistoricalSources).not.toHaveBeenCalled();
    expect(test.queries.map(query => query.filter)).toEqual(['out', 'out', 'out']);
    expect(test.queries.every(query => query.bindings.length === 5)).toBe(true);
    expect(result.total).toBe(history.filter(item => Number(item.amount) < 0).length);
    expect(result.items.some(item => item.source_type === 'historical_principal_source')).toBe(false);
  });

  it('source-only history is four display rows with NULL balances, never manufactured accounting rows', async () => {
    const test = harness([], true, historicalFixture());
    const result = await test.getUserCnyHistoryPage(28, { page: 99, pageSize: 20 });
    expect(result).toMatchObject({ total: 4, totalPages: 1, page: 1, historicalSourceCount: 4 });
    expect(result.items).toHaveLength(4);
    expect(result.items.every(item => item.source_type === 'historical_principal_source'
      && item.balance_after === null && item.available_after === null)).toBe(true);
    expect(test.getHistoricalSources).toHaveBeenCalledOnce();
    expect(test.getHistoricalSources).toHaveBeenCalledWith(28);
    expect(test.queries).toHaveLength(3);
  });

  it('source text remains bound even with hostile punctuation; explicit fifth argument never fetches sources', async () => {
    const source = { ...historicalFixture()[0], sourceTag: "LQY' OR 1=1; DROP TABLE users;--",
      note: "历史来源'); SELECT * FROM users; -- ?" };
    const test = harness([], true, [source]);
    const result = await test.getUserCnyHistory(28, 20, 0, 'all', [source]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ balance_after: null, available_after: null });
    expect(test.queries[0].sql).not.toContain(source.sourceTag);
    expect(test.queries[0].sql).not.toContain(source.note);
    expect(test.queries[0].bindings).toEqual([...Array(5).fill(28), ...sourceFixtureBindings(source, 28)]);
    expect(test.getHistoricalSources).not.toHaveBeenCalled();
  });

  it('legacy getUserCnyHistory remains an array and never fetches sources', async () => {
    const test = harness(history, true, historicalFixture());
    const result = await test.getUserCnyHistory(28, 20, 0);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(20);
    expect(result.map(withoutTotal)).toEqual(history.slice(0, 20));
    expect(result.every(item => item.source_type === 'manual_balance')).toBe(true);
    expect(test.queries[0].bindings).toEqual(Array(5).fill(28));
    expect(ctePrefix(test.queries[0].sql)).not.toContain('historical_principal_source');
    expect(result).not.toHaveProperty('historicalSources');
    expect(test.getHistoricalSources).not.toHaveBeenCalled();
  });
});

describe('historical principal source query: SELECT-only current-user ledger-37 isolation', () => {
  function sourceHarness(connected = true) {
    const execute = vi.fn(async () => [[], []]);
    const parseSource = vi.fn(parseHistoricalPrincipalSources);
    const getConnection = vi.fn(async () => connected ? { execute } : null);
    const runtime = evaluate<{ getUserCnyHistoricalPrincipalSources: (userId: unknown) => Promise<HistoricalPrincipalSource[]> }>(
      `${productionFunction('getUserCnyHistoricalPrincipalSources')}\n({ getUserCnyHistoricalPrincipalSources });`,
      { getDbConnection: getConnection, parseHistoricalPrincipalSources: parseSource });
    return { ...runtime, execute, parseSource };
  }

  it('selects source-note fields from only user_id bound and ledger 37, without ledger 52/other-table scans', async () => {
    const test = sourceHarness();
    expect(await test.getUserCnyHistoricalPrincipalSources(28)).toEqual([]);
    expect(test.execute).toHaveBeenCalledOnce();
    const [sql, bindings] = test.execute.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql.trim()).toMatch(/^SELECT id, ledger_id, amount, note,\s+DATE_FORMAT\(created_at, '%Y-%m-%d %H:%i:%s'\) AS created_at\s+FROM af_manual_balances\b/);
    expect(sql).toMatch(/WHERE user_id = \? AND ledger_id = 37/);
    expect(sql).toContain("note LIKE '[CNY]历史手工保证金迁入并冻结%'");
    expect(sql).toContain("LOCATE('[历史微信本金V1:', note) > 0");
    expect(sql.match(/\?/g)).toHaveLength(1);
    expect(bindings).toEqual([28]);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|CALL|UNION|JOIN|COUNT)\b|ledger_id\s*=\s*52|balance_after/i);
    expect(sql).not.toContain(';');
    expect(test.parseSource).not.toHaveBeenCalled();
  });

  it('changing target user changes only bound user id and hostile values never enter SQL', async () => {
    const test = sourceHarness();
    const hostile = "28' OR 1=1; SELECT * FROM af_manual_balances WHERE ledger_id=52;--";
    await test.getUserCnyHistoricalPrincipalSources(28);
    await test.getUserCnyHistoricalPrincipalSources(29);
    await test.getUserCnyHistoricalPrincipalSources(hostile);
    const calls = test.execute.mock.calls as unknown as [string, unknown[]][];
    expect(calls.map(call => call[0])).toEqual(Array(3).fill(calls[0][0]));
    expect(calls.map(call => call[1])).toEqual([[28], [29], [hostile]]);
    expect(calls[2][0]).not.toContain(hostile);
  });

  it('fails closed without a connection rather than claiming there are no sources', async () => {
    const test = sourceHarness(false);
    await expect(test.getUserCnyHistoricalPrincipalSources(28)).rejects.toThrow('历史本金来源暂时无法读取');
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.parseSource).not.toHaveBeenCalled();
  });
});
