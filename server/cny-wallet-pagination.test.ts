import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

// 离线回归：只读取生产源码，不 import DB/路由模块、不初始化真实数据库。
// VM 仅执行 AST 抽出的两项生产函数；ensure 明确 stub，假连接仅接受 SELECT/CTE。
// Fixtures 只模拟数据库返回值。SQL 的余额回放语义以真实 SQL 结构断言验证，
// 不把假连接当成 MySQL 引擎，也不依赖客户端尚未完成的源码。
type Filter = 'all' | 'in' | 'out';
type Row = {
  id: string;
  user_id: number;
  amount: number;
  balance_after: number;
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
};
type Runtime = {
  getUserCnyHistory: (userId: unknown, limit?: unknown, offset?: unknown, filter?: unknown) => Promise<Row[]>;
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
function harness(rows: readonly Row[] = history, connected = true) {
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
    expect(bindings).toHaveLength(5);
    expect((sql.match(/\?/g) ?? []).length).toBe(5);
    expect(bindings.every(value => value === bindings[0])).toBe(true);
    const filter: Filter = sql.includes('WHERE e.amount > 0') ? 'in'
      : sql.includes('WHERE e.amount < 0') ? 'out' : 'all';
    queries.push({ sql, bindings: Array.from(bindings), limit, offset, filter });
    const filtered = rows.filter(row => filter === 'all' || (filter === 'in' ? row.amount > 0 : row.amount < 0));
    return [filtered.slice(offset, offset + limit).map(row => ({ ...row, total_count: String(filtered.length) })), []];
  });
  const ensure = vi.fn(async () => undefined);
  const getConnection = vi.fn(async () => connected ? { execute } : null);
  const runtime = evaluate<Runtime>(runtimeSource, {
    getDbConnection: getConnection,
    ensureLedger37WalletInfrastructure: ensure,
    // VM 中不提供 require/import/process；无法加载生产模块或访问连接配置。
  });
  return { ...runtime, queries, execute, ensure, getConnection };
}
function ctePrefix(sql: string) {
  const finalSelect = sql.indexOf('SELECT CONCAT(e.source_type');
  expect(finalSelect).toBeGreaterThan(0);
  return sql.slice(0, finalSelect);
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
      const final = query.sql.slice(prefix.length);
      expect(final).toMatch(/COUNT\(\*\) OVER\s*\(\s*\) AS total_count/);
      expect(final).toContain('AS balance_after');
      expect(final).toContain('AS available_after');
      expect(final).toContain('first_snapshot.recorded_balance - first_snapshot.snapshot_amount');
      expect(final).toContain('current_snapshot.recorded_balance + current_snapshot.legacy_balance_total');
      expect(final).toContain('e.legacy_delta_since_snapshot - e.frozen_after');
      const orderAt = final.indexOf('ORDER BY e.created_at DESC, e.source_order DESC, e.event_id DESC');
      expect(orderAt).toBeGreaterThan(final.indexOf('LEFT JOIN snapshot_values current_snapshot'));
      expect(final.indexOf('LIMIT 20 OFFSET 40')).toBeGreaterThan(orderAt);
      const condition = query.filter === 'all' ? '' : `WHERE e.amount ${query.filter === 'in' ? '>' : '<'} 0`;
      if (condition) {
        expect(final.match(/WHERE e\.amount/g)).toHaveLength(1);
        expect(final.indexOf(condition)).toBeGreaterThan(final.indexOf('LEFT JOIN snapshot_values current_snapshot'));
        expect(final.indexOf(condition)).toBeLessThan(orderAt);
      } else expect(final).not.toContain('WHERE e.amount');
    }
  });

  it('filtering/paging keeps each returned row at its full-history replay balance', async () => {
    const test = harness();
    const before = JSON.stringify(history);
    const all = await test.getUserCnyHistoryPage(28, { page: 1, pageSize: 100 });
    for (const filter of ['in', 'out'] as const) {
      const expected = history.filter(row => filter === 'in' ? row.amount > 0 : row.amount < 0);
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
      expect(Object.keys(result).sort()).toEqual(['items', 'page', 'pageSize', 'total', 'totalPages', 'hasPrevious', 'hasNext'].sort());
      expect(result).toMatchObject({ page, pageSize, total: 146, totalPages,
        hasPrevious: page > 1, hasNext: page < totalPages });
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
    const expected = history.filter(row => filter === 'in' ? row.amount > 0 : row.amount < 0);
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
