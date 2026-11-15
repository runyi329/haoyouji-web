import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { TRPCError } from '@trpc/server';
import ts from 'typescript';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { AI_WALLET_ASSET_CATALOG, AI_WALLET_SETTLEMENT_ASSETS } from '../shared/ai-wallet-assets';

// 离线回归：从 AST 抽取真实函数/表达式，不 import DB 或路由模块，不执行模块顶层 DDL。
// 假连接只接受 SELECT；夹具模拟行筛选/排序，不假装是 MySQL 引擎。
// SQL 本身的条件、绑定、COUNT/分页先后与稳定排序另作断言。
// 前端执行实际 scope/effect/JSX 表达式及回调，不复制一份分页算法，也不启动服务。
type Row = {
  id: number; user_id: number; asset_code: string; event_type: string;
  entry_no: string; request_id: string; amount: string; balance_after: string;
  note: string; source_ledger_id: number | string | null; created_at: string;
  sender_name?: string; sender_username?: string; recipient_name?: string;
  recipient_username?: string; transfer_no?: string | null;
};
type Item = {
  id: number; entryNo: string; requestId: string; assetCode: string; assetName: string;
  amount: string; balanceAfter: string; eventType: string; note: string;
  sourceLedgerId: number | null; counterpartyName: string | null;
  transferNo: string | null; createdAt: string;
};
type Page = { items: Item[]; total: number; page: number; pageSize: number; totalPages: number };
type Runtime = {
  getUserMultiAssetHistoryPage: (userId: unknown, page?: unknown, pageSize?: unknown, coin?: unknown) => Promise<Page>;
  getUserMultiAssetHistory: (userId: number, limit?: number) => Promise<Item[]>;
  entryResult: (row: Row) => Item;
};
type Query = { sql: string; bindings: unknown[]; where: string; count: boolean; limit?: number; offset?: number };
type Scope = { userId: number; assetCode: string; page: number };

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST definition: ${label}`);
  return value;
}
function parse(relative: string, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, kind);
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
function evaluate<T>(source: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(source, {
    fileName: 'isolated.tsx',
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  });
  // 无 require/import/process，无数据库配置；仅执行传入的 AST 片段。
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
const dbAst = parse('./db-multi-asset-wallet.ts');
const routeAst = parse('./miban.ts');
const clientAst = parse('../client/src/pages/AfRechargeManage.tsx', ts.ScriptKind.TSX);
const printer = ts.createPrinter();
function productionFunction(name: string) {
  const fn = required(dbAst.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name), name);
  const isolated = ts.factory.updateFunctionDeclaration(fn,
    fn.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword
      && modifier.kind !== ts.SyntaxKind.DefaultKeyword),
    fn.asteriskToken, fn.name, fn.typeParameters, fn.parameters, fn.type, fn.body);
  return printer.printNode(ts.EmitHint.Unspecified, isolated, dbAst);
}
const runtimeSource = ['asRows', 'getAssetName', 'normalizeMultiAssetWalletAsset', 'entryResult',
  'getUserMultiAssetHistory', 'getUserMultiAssetHistoryPage'].map(productionFunction).join('\n')
  + '\n({ getUserMultiAssetHistory, getUserMultiAssetHistoryPage, entryResult });';
function fixture(id: number, overrides: Partial<Row> = {}): Row {
  return Object.freeze({ id, user_id: 28, asset_code: ['BTC', 'ETH', 'SOL'][id % 3],
    event_type: ['admin_adjustment', 'transfer_in', 'transfer_out', 'ledger_dividend', 'ledger_dividend_reversal'][id % 5],
    entry_no: `WAE-${id}`, request_id: `request-${id}`, amount: '-0.000000000000000001',
    balance_after: '123456789012345678.123456789012345678', note: `流水 ${id}`,
    source_ledger_id: 52, created_at: new Date(Date.UTC(2026, 0, 1) + Math.floor(id / 4) * 60_000).toISOString(),
    sender_name: ' 发款人 ', recipient_name: ' 收款人 ', transfer_no: `WAT-${id}`, ...overrides });
}
function fixtures(count = 123): readonly Row[] {
  const visible = Array.from({ length: count }, (_, index) => fixture(index + 1));
  const collateral = Array.from({ length: 160 }, (_, index) => fixture(10_000 + index,
    { event_type: index % 2 ? 'collateral_lock' : 'collateral_release' }));
  const otherUser = Array.from({ length: 11 }, (_, index) => fixture(20_000 + index, { user_id: 29 }));
  // 故意无序，且有相同 created_at；验证时间降序后的 id 降序避免跨页重漏。
  return Object.freeze([...collateral, ...visible.filter(row => row.id % 2), ...otherUser,
    ...visible.filter(row => !(row.id % 2))]);
}
const history = fixtures();
function expectedRows(rows: readonly Row[], userId = 28, coin?: string, excludeCollateral = true) {
  return [...rows].filter(row => row.user_id === userId && (!coin || row.asset_code === coin)
    && (!excludeCollateral || !['collateral_lock', 'collateral_release'].includes(row.event_type)))
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id);
}
function harness(initial: readonly Row[] = history, options: {
  connected?: boolean; errorAt?: 'connection' | 'count' | 'items'; countRows?: unknown;
} = {}) {
  let rows = initial;
  const queries: Query[] = [];
  const failure = new Error('ER_NO_SUCH_TABLE: offline SELECT failure');
  const execute = vi.fn(async (sql: string, bindings: unknown[] = []) => {
    expect(sql.trim()).toMatch(/^SELECT\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|CALL|FOR UPDATE)\b/i);
    expect(sql).not.toContain(';');
    expect((sql.match(/\?/g) ?? []).length).toBe(bindings.length);
    const count = /^SELECT COUNT\(\*\) AS total\b/i.test(sql.trim());
    const paged = /\bOFFSET\b/.test(sql);
    const where = required(/\bWHERE\s+([\s\S]+?)(?:\s+ORDER BY|$)/i.exec(sql)?.[1], 'WHERE').trim();
    const expectedWhere = 'entry.user_id = ?'
      + (count || paged ? " AND entry.event_type NOT IN ('collateral_lock', 'collateral_release')" : '')
      + (bindings.length === 2 ? ' AND entry.asset_code = ?' : '');
    expect(where).toBe(expectedWhere);
    expect(bindings).toHaveLength(bindings.length === 2 ? 2 : 1);
    const query: Query = { sql, bindings: Array.from(bindings), where, count };
    if (!count) {
      expect(sql).toMatch(/ORDER BY entry\.created_at DESC, entry\.id DESC\s+LIMIT\b/);
      const pagination = required(/\bLIMIT (\d+)(?: OFFSET (\d+))?\s*$/.exec(sql) ?? undefined, 'integer pagination');
      query.limit = Number(pagination[1]);
      query.offset = Number(pagination[2] ?? 0);
      expect(Number.isSafeInteger(query.limit)).toBe(true);
      expect(Number.isSafeInteger(query.offset)).toBe(true);
      expect(query.limit).toBeGreaterThanOrEqual(1);
      expect(query.limit).toBeLessThanOrEqual(paged ? 100 : 500);
      expect(query.offset).toBeGreaterThanOrEqual(0);
      expect(sql).toContain('LEFT JOIN ai_wallet_asset_transfers transfer ON transfer.id = entry.related_transfer_id');
      expect(sql).toContain('LEFT JOIN users sender ON sender.id = transfer.from_user_id');
      expect(sql).toContain('LEFT JOIN users recipient ON recipient.id = transfer.to_user_id');
    } else {
      expect(sql).not.toMatch(/\b(?:LIMIT|OFFSET|JOIN|ORDER BY)\b/);
      expect(sql).toMatch(/FROM ai_wallet_asset_entries entry WHERE/);
    }
    queries.push(query);
    if (options.errorAt === (count ? 'count' : 'items')) throw failure;
    const selected = expectedRows(rows, Number(bindings[0]), bindings[1] as string | undefined, count || paged);
    if (count) return [Object.prototype.hasOwnProperty.call(options, 'countRows')
      ? options.countRows : [{ total: String(selected.length) }], []];
    return [selected.slice(query.offset, query.offset! + query.limit!), []];
  });
  const ensure = vi.fn(async (): Promise<void> => { throw new Error('Paged SELECT must not initialize infrastructure'); });
  const getConnection = vi.fn(async () => {
    if (options.errorAt === 'connection') throw failure;
    return options.connected === false ? null : { execute };
  });
  const getTransaction = vi.fn(() => { throw new Error('Read-only test must not open a funds transaction'); });
  const runtime = evaluate<Runtime>(runtimeSource, {
    AI_WALLET_ASSET_CATALOG, MULTI_ASSET_WALLET_ASSETS: AI_WALLET_SETTLEMENT_ASSETS,
    getDbConnection: getConnection, getDbTransactionConnection: getTransaction,
    ensureMultiAssetWalletInfrastructure: ensure,
  });
  return { ...runtime, execute, queries, ensure, getConnection, getTransaction, failure,
    replaceRows: (next: readonly Row[]) => { rows = next; } };
}
function assertCountItemsPair(queries: Query[], userId: number, coin?: string) {
  expect(queries).toHaveLength(2);
  expect(queries.map(query => query.count)).toEqual([true, false]);
  expect(queries[0].where).toBe(queries[1].where);
  expect(queries.map(query => query.bindings)).toEqual(Array(2).fill(coin ? [userId, coin] : [userId]));
  for (const query of queries) {
    // OFFSET 恰巧等于 userId 不代表拼接用户；身份条件必须始终使用占位符。
    expect(query.where).not.toContain(String(userId));
    if (coin) expect(query.sql).not.toContain(coin);
  }
}
const invalidPositiveIntegers = [0, -1, -20, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1,
  Number.MAX_VALUE, '28', '28 OR 1=1; DROP TABLE users;--', null, true];

describe('digital history page: real SELECT functions and full-history pagination', () => {
  it.each([1, 10, 50, 100])('pageSize=%i exposes all 123 visible rows once, never a 100-row audit cutoff', async pageSize => {
    const test = harness();
    const expected = expectedRows(history);
    const totalPages = Math.ceil(123 / pageSize);
    const all: Item[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const before = test.queries.length;
      const result = await test.getUserMultiAssetHistoryPage(28, page, pageSize);
      expect(Object.keys(result).sort()).toEqual(['items', 'total', 'page', 'pageSize', 'totalPages'].sort());
      expect(result).toMatchObject({ page, pageSize, total: 123, totalPages });
      expect(result.items).toEqual(expected.slice((page - 1) * pageSize, page * pageSize).map(test.entryResult));
      expect(result.items.length).toBeGreaterThan(0);
      assertCountItemsPair(test.queries.slice(before), 28);
      expect(test.queries.at(-1)).toMatchObject({ limit: pageSize, offset: (page - 1) * pageSize });
      all.push(...result.items);
    }
    expect(all.map(item => item.id)).toEqual(expected.map(row => row.id));
    expect(new Set(all.map(item => item.id)).size).toBe(123);
    expect(test.ensure).not.toHaveBeenCalled();
    expect(test.getTransaction).not.toHaveBeenCalled();
  });

  it('excludes 160 newer lock/release events before COUNT and LIMIT, so every visible page is populated', async () => {
    const test = harness();
    expect(history.filter(row => ['collateral_lock', 'collateral_release'].includes(row.event_type))).toHaveLength(160);
    const result = await test.getUserMultiAssetHistoryPage(28, 13, 10);
    expect(result).toMatchObject({ page: 13, total: 123, totalPages: 13 });
    expect(result.items).toHaveLength(3);
    expect(result.items.every(item => !['collateral_lock', 'collateral_release'].includes(item.eventType))).toBe(true);
    assertCountItemsPair(test.queries, 28);
    const itemsSql = test.queries[1].sql;
    expect(itemsSql.indexOf('event_type NOT IN')).toBeLessThan(itemsSql.indexOf('ORDER BY'));
    expect(itemsSql.indexOf('ORDER BY')).toBeLessThan(itemsSql.indexOf('LIMIT'));
  });

  it.each(['BTC', 'ETH', 'SOL'])('%s COUNT and items bind the same coin and reach more than 100 matching rows', async coin => {
    const rows = fixtures(369);
    const test = harness(rows);
    const expected = expectedRows(rows, 28, coin);
    expect(expected).toHaveLength(123);
    const all: Item[] = [];
    for (let page = 1; page <= 3; page++) {
      const result = await test.getUserMultiAssetHistoryPage(28, page, 50, coin);
      expect(result).toMatchObject({ total: 123, totalPages: 3, page, pageSize: 50 });
      expect(result.items.every(item => item.assetCode === coin)).toBe(true);
      assertCountItemsPair(test.queries.slice(-2), 28, coin);
      all.push(...result.items);
    }
    expect(all.map(item => item.id)).toEqual(expected.map(row => row.id));
  });

  it('isolates users in both queries, including when the other user has newer records', async () => {
    const test = harness();
    const first = await test.getUserMultiAssetHistoryPage(28, 1, 100, 'ETH');
    const second = await test.getUserMultiAssetHistoryPage(29, 1, 100, 'ETH');
    expect(first.total).toBe(expectedRows(history, 28, 'ETH').length);
    expect(second.total).toBe(expectedRows(history, 29, 'ETH').length);
    expect(second.items.map(item => item.id)).toEqual(expectedRows(history, 29, 'ETH').map(row => row.id));
    expect(first.items.some(item => second.items.some(other => other.id === item.id))).toBe(false);
    expect(test.queries[0].sql).toBe(test.queries[2].sql);
    expect(test.queries[1].sql).toBe(test.queries[3].sql);
    assertCountItemsPair(test.queries.slice(0, 2), 28, 'ETH');
    assertCountItemsPair(test.queries.slice(2), 29, 'ETH');
  });

  it('normalizes a valid coin only in bindings, without interpolating user/coin into SQL', async () => {
    const test = harness();
    await test.getUserMultiAssetHistoryPage(28, 1, 10, ' eth ');
    assertCountItemsPair(test.queries, 28, 'ETH');
    await test.getUserMultiAssetHistoryPage(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 100, 'SOL');
    expect(test.queries.at(-1)?.bindings).toEqual([Number.MAX_SAFE_INTEGER, 'SOL']);
    expect(test.queries.at(-1)?.sql).not.toContain(String(Number.MAX_SAFE_INTEGER));
  });

  it.each([{ label: 'empty', rows: [] as Row[] }, { label: 'collateral only',
    rows: history.filter(row => row.user_id === 28 && ['collateral_lock', 'collateral_release'].includes(row.event_type)) }])
  ('$label history at a stale page returns stable page 1 with just COUNT', async ({ rows }) => {
    const test = harness(rows);
    expect(await test.getUserMultiAssetHistoryPage(28, 99, 10)).toEqual({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
    expect(test.queries).toHaveLength(1);
    expect(test.queries[0].count).toBe(true);
    expect(test.ensure).not.toHaveBeenCalled();
  });

  it('omitted arguments default to page 1 and pageSize 10', async () => {
    const test = harness();
    const result = await test.getUserMultiAssetHistoryPage(28);
    expect(result).toMatchObject({ page: 1, pageSize: 10, total: 123, totalPages: 13 });
    expect(result.items).toHaveLength(10);
    expect(test.queries[1]).toMatchObject({ limit: 10, offset: 0 });
  });

  it.each([999, Number.MAX_SAFE_INTEGER])('clamps stale/huge page %s after full COUNT and before calculating OFFSET', async page => {
    const test = harness();
    const result = await test.getUserMultiAssetHistoryPage(28, page, 50);
    expect(result).toMatchObject({ page: 3, pageSize: 50, total: 123, totalPages: 3 });
    expect(result.items).toHaveLength(23);
    assertCountItemsPair(test.queries, 28);
    expect(test.queries[1]).toMatchObject({ limit: 50, offset: 100 });
  });

  it('deletion of the last page reloads the preceding last page using the same user and coin', async () => {
    const rows = fixtures(369);
    const test = harness(rows);
    const before = await test.getUserMultiAssetHistoryPage(28, 3, 50, 'ETH');
    const deletedIds = new Set(before.items.map(item => item.id));
    test.replaceRows(rows.filter(row => !deletedIds.has(row.id)));
    const after = await test.getUserMultiAssetHistoryPage(28, 3, 50, 'ETH');
    expect(after).toMatchObject({ page: 2, total: 100, totalPages: 2, pageSize: 50 });
    expect(after.items).toHaveLength(50);
    expect(after.items.some(item => deletedIds.has(item.id))).toBe(false);
    assertCountItemsPair(test.queries.slice(-2), 28, 'ETH');
    expect(test.queries.at(-1)).toMatchObject({ limit: 50, offset: 50 });
  });
});

describe('digital page validation, decimal fidelity and fail-closed DB errors', () => {
  it.each(invalidPositiveIntegers)('rejects unsafe positive integer %s for user/page/size before connecting', async value => {
    for (const args of [[value, 1, 10], [28, value, 10], [28, 1, value]]) {
      const test = harness();
      await expect(test.getUserMultiAssetHistoryPage(...args as [unknown, unknown, unknown])).rejects.toThrow();
      expect(test.getConnection).not.toHaveBeenCalled();
      expect(test.execute).not.toHaveBeenCalled();
      expect(test.ensure).not.toHaveBeenCalled();
    }
  });

  it.each([101, 1000, Number.MIN_VALUE])('rejects pageSize %s outside integer range 1..100', async pageSize => {
    const test = harness();
    await expect(test.getUserMultiAssetHistoryPage(28, 1, pageSize)).rejects.toThrow('每页流水数量');
    expect(test.getConnection).not.toHaveBeenCalled();
  });

  it.each(['CNY', 'USDT', 'cny', 'usdt', 'all', 'NOT_A_COIN', '', null, 28, "ETH' OR 1=1; DROP TABLE users;--"])
  ('rejects invalid/legacy-funding coin %s before any DB access', async coin => {
    const test = harness();
    await expect(test.getUserMultiAssetHistoryPage(28, 1, 10, coin)).rejects.toThrow('该资产尚未启用独立钱包账本');
    expect(test.getConnection).not.toHaveBeenCalled();
    expect(test.execute).not.toHaveBeenCalled();
  });

  it('preserves every entryResult field and 18-decimal strings without recalculating or mutating returned rows', async () => {
    const rows = [fixture(1, { asset_code: 'ETH', event_type: 'transfer_in', source_ledger_id: '52', sender_name: '', sender_username: ' sender-login ' }),
      fixture(2, { asset_code: 'ETH', event_type: 'transfer_out', recipient_name: '', recipient_username: ' receiver-login ' }),
      fixture(3, { asset_code: 'ETH', event_type: 'ledger_dividend' }),
      fixture(4, { asset_code: 'ETH', event_type: 'ledger_dividend_reversal' }),
      fixture(5, { asset_code: 'ETH', event_type: 'unknown_legacy', source_ledger_id: null, transfer_no: null })];
    const before = JSON.stringify(rows);
    const test = harness(rows);
    const result = await test.getUserMultiAssetHistoryPage(28, 1, 100, 'ETH');
    expect(result.items).toEqual(expectedRows(rows).map(test.entryResult));
    for (const item of result.items) {
      expect(item.amount).toBe('-0.000000000000000001');
      expect(item.balanceAfter).toBe('123456789012345678.123456789012345678');
      expect(Object.keys(item).sort()).toEqual(['id', 'entryNo', 'requestId', 'assetCode', 'assetName', 'amount',
        'balanceAfter', 'eventType', 'note', 'sourceLedgerId', 'counterpartyName', 'transferNo', 'createdAt'].sort());
    }
    expect(result.items.find(item => item.id === 1)).toMatchObject({ counterpartyName: 'sender-login', sourceLedgerId: 52 });
    expect(result.items.find(item => item.id === 2)).toMatchObject({ counterpartyName: 'receiver-login' });
    expect(result.items.find(item => item.id === 3)).toMatchObject({ eventType: 'ledger_dividend', counterpartyName: null });
    expect(result.items.find(item => item.id === 4)).toMatchObject({ eventType: 'ledger_dividend_reversal', counterpartyName: null });
    expect(result.items.find(item => item.id === 5)).toMatchObject({ eventType: 'admin_adjustment', sourceLedgerId: null, transferNo: null });
    expect(JSON.stringify(rows)).toBe(before);
    expect(test.queries.every(query => !/CAST|SUM\(|balance_after\s*[+\-]/.test(query.sql))).toBe(true);
  });

  it('missing DB rejects without claiming an empty page or creating tables', async () => {
    const test = harness(history, { connected: false });
    await expect(test.getUserMultiAssetHistoryPage(28)).rejects.toThrow('数据库连接失败');
    expect(test.execute).not.toHaveBeenCalled();
    expect(test.ensure).not.toHaveBeenCalled();
    expect(test.getTransaction).not.toHaveBeenCalled();
  });

  it.each(['connection', 'count', 'items'] as const)('%s errors propagate unchanged and never call infrastructure repair', async errorAt => {
    const test = harness(history, { errorAt });
    await expect(test.getUserMultiAssetHistoryPage(28)).rejects.toBe(test.failure);
    expect(test.execute).toHaveBeenCalledTimes(errorAt === 'connection' ? 0 : errorAt === 'count' ? 1 : 2);
    expect(test.ensure).not.toHaveBeenCalled();
    expect(test.getTransaction).not.toHaveBeenCalled();
  });

  it.each([[], [{ total: 'invalid' }], [{ total: -1 }], [{ total: 1.5 }], [{ total: NaN }],
    [{ total: Infinity }], [{ total: Number.MAX_SAFE_INTEGER + 1 }]].map(countRows => ({ countRows })))
  ('invalid COUNT rows fail closed before items SELECT: $countRows', async ({ countRows }) => {
    const test = harness(history, { countRows });
    await expect(test.getUserMultiAssetHistoryPage(28)).rejects.toThrow('流水总数无效');
    expect(test.queries).toHaveLength(1);
    expect(test.ensure).not.toHaveBeenCalled();
  });

  it('legacy getUserMultiAssetHistory still returns an array, retains collateral and uses entryResult', async () => {
    const test = harness();
    // 旧函数仍有 ensure：只 stub，绝不执行该基础设施函数或 DDL。
    test.ensure.mockImplementation(async () => undefined);
    const result = await test.getUserMultiAssetHistory(28, 20);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(expectedRows(history, 28, undefined, false).slice(0, 20).map(test.entryResult));
    expect(result.every(item => ['collateral_lock', 'collateral_release'].includes(item.eventType))).toBe(true);
    expect(result).not.toHaveProperty('items');
    expect(test.queries).toHaveLength(1);
    expect(test.queries[0]).toMatchObject({ count: false, limit: 20, offset: 0, bindings: [28], where: 'entry.user_id = ?' });
    expect(test.ensure).toHaveBeenCalledOnce();
  });
});

function variable(ast: ts.SourceFile, name: string) {
  return required(nodes(ast, ts.isVariableDeclaration).find(node => ts.isIdentifier(node.name) && node.name.text === name), name);
}
function initializer(ast: ts.SourceFile, name: string) {
  return required(variable(ast, name).initializer, `${name} initializer`);
}
function route(name: string) {
  const matches = nodes(routeAst, ts.isPropertyAssignment).filter(node => node.name.getText(routeAst) === name);
  if (matches.length !== 1) throw new Error(`Expected one route named ${name}, got ${matches.length}`);
  return matches[0];
}
function methodCall(root: ts.Node, name: string) {
  return required(nodes(root, ts.isCallExpression).find(node =>
    ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === name), `${name} call`);
}
function routeSchema(name: string) {
  return evaluate<z.ZodObject<z.ZodRawShape>>(`(${methodCall(route(name).initializer, 'input').arguments[0].getText(routeAst)});`,
    { z, AI_WALLET_SETTLEMENT_ASSETS });
}
function routeCallback(name: string, method: 'query' | 'mutation' = 'query') {
  const callback = methodCall(route(name).initializer, method).arguments[0];
  if (!ts.isArrowFunction(callback)) throw new Error(`Expected ${name} ${method} arrow callback`);
  return callback;
}
type RouteArguments = { ctx: { user: { id: number; role?: string } }; input: Record<string, unknown> };
type Middleware = (args: { ctx: RouteArguments['ctx']; next: (args: { ctx: RouteArguments['ctx'] }) => Promise<unknown> }) => Promise<unknown>;
function readRoute(name: string, functions: Record<string, unknown>) {
  // 执行实际 protectedProcedure.use 中间件和实际 input/query 链，仅连接/handler 是 stub。
  const protectedProcedure = {
    use: (middleware: Middleware) => ({
      input: (schema: z.ZodTypeAny) => ({
        query: (callback: (args: RouteArguments) => Promise<unknown>) => async (args: RouteArguments) =>
          middleware({ ctx: args.ctx, next: async ({ ctx }) => callback({ ctx, input: schema.parse(args.input) }) }),
      }),
    }),
  };
  return evaluate<(args: RouteArguments) => Promise<unknown>>(
    `const mibanAdminProcedure = ${initializer(routeAst, 'mibanAdminProcedure').getText(routeAst)};\n`
      + `(${route(name).initializer.getText(routeAst)});`,
    { protectedProcedure, TRPCError, z, AI_WALLET_SETTLEMENT_ASSETS, ...functions });
}

describe('digital history routes: real input schemas, super_admin guard and old array contract', () => {
  it('uses the existing protected mibanAdminProcedure for both old and new query chains', () => {
    for (const name of ['multiAssetWalletHistory', 'multiAssetWalletHistoryPage']) {
      const identifiers = nodes(route(name).initializer, ts.isIdentifier).map(node => node.text);
      expect(identifiers).toContain('mibanAdminProcedure');
      expect(identifiers).not.toContain('publicProcedure');
      expect(nodes(routeCallback(name), ts.isCallExpression).some(call => call.expression.kind === ts.SyntaxKind.ImportKeyword)).toBe(false);
    }
  });

  it('new input defaults match DB, accepts integer sizes 1..100 and all settlement coins, never CNY/USDT', () => {
    const schema = routeSchema('multiAssetWalletHistoryPage');
    expect(schema.parse({ userId: 28 })).toEqual({ userId: 28, page: 1, pageSize: 10 });
    expect(Object.keys(schema.shape).sort()).toEqual(['userId', 'page', 'pageSize', 'assetCode'].sort());
    for (let pageSize = 1; pageSize <= 100; pageSize++) expect(schema.safeParse({ userId: 28, pageSize }).success).toBe(true);
    for (const assetCode of AI_WALLET_SETTLEMENT_ASSETS) expect(schema.safeParse({ userId: 28, assetCode }).success).toBe(true);
    for (const field of ['userId', 'page', 'pageSize']) {
      for (const value of invalidPositiveIntegers) expect(schema.safeParse({ userId: 28, [field]: value }).success).toBe(false);
    }
    for (const pageSize of [101, 1000]) expect(schema.safeParse({ userId: 28, pageSize }).success).toBe(false);
    for (const assetCode of ['USDT', 'CNY', 'all', 'eth', ' eth ', 'NOT_A_COIN', "ETH' OR 1=1", null]) {
      expect(schema.safeParse({ userId: 28, assetCode }).success).toBe(false);
    }
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ userId: Number.MAX_SAFE_INTEGER, page: Number.MAX_SAFE_INTEGER }).success).toBe(true);
  });

  it('super_admin forwards user/page/pageSize/coin positionally and returns the page unchanged', async () => {
    const page: Page = { items: [], total: 41, page: 3, pageSize: 10, totalPages: 5 };
    const getPage = vi.fn(async () => page);
    const query = readRoute('multiAssetWalletHistoryPage', { getUserMultiAssetHistoryPage: getPage });
    expect(await query({ ctx: { user: { id: 1, role: 'super_admin' } }, input: { userId: 28, page: 3, pageSize: 10, assetCode: 'ETH' } })).toBe(page);
    expect(getPage).toHaveBeenLastCalledWith(28, 3, 10, 'ETH');
    await query({ ctx: { user: { id: 1, role: 'super_admin' } }, input: { userId: 29 } });
    expect(getPage).toHaveBeenLastCalledWith(29, 1, 10, undefined);
  });

  it.each(['admin', 'user', 'member', 'super', '', undefined])('%s is forbidden before calling either DB history helper', async role => {
    for (const name of ['multiAssetWalletHistory', 'multiAssetWalletHistoryPage']) {
      const getHistory = vi.fn(async () => []);
      const query = readRoute(name, { getUserMultiAssetHistory: getHistory, getUserMultiAssetHistoryPage: getHistory });
      await expect(query({ ctx: { user: { id: 1, role } }, input: { userId: 28 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(getHistory).not.toHaveBeenCalled();
    }
  });

  it('new route validates caller input before DB and propagates helper errors without returning empty rows', async () => {
    const failure = new Error('missing digital wallet table');
    const getPage = vi.fn(async () => { throw failure; });
    const query = readRoute('multiAssetWalletHistoryPage', { getUserMultiAssetHistoryPage: getPage });
    for (const input of [{ userId: 28, page: 1.5 }, { userId: 28, pageSize: 101 }, { userId: 28, assetCode: 'USDT' }]) {
      await expect(query({ ctx: { user: { id: 1, role: 'super_admin' } }, input })).rejects.toThrow();
    }
    expect(getPage).not.toHaveBeenCalled();
    await expect(query({ ctx: { user: { id: 1, role: 'super_admin' } }, input: { userId: 28 } })).rejects.toBe(failure);
  });

  it('legacy route retains userId/optional limit input and the array response with default limit 100', async () => {
    const schema = routeSchema('multiAssetWalletHistory');
    expect(Object.keys(schema.shape).sort()).toEqual(['userId', 'limit'].sort());
    expect(schema.parse({ userId: 28 })).toEqual({ userId: 28 });
    const items: Item[] = [];
    const getHistory = vi.fn(async () => items);
    const query = readRoute('multiAssetWalletHistory', { getUserMultiAssetHistory: getHistory });
    expect(await query({ ctx: { user: { id: 1, role: 'super_admin' } }, input: { userId: 28 } })).toBe(items);
    expect(getHistory).toHaveBeenLastCalledWith(28, 100);
    await query({ ctx: { user: { id: 1, role: 'super_admin' } }, input: { userId: 29, limit: 20 } });
    expect(getHistory).toHaveBeenLastCalledWith(29, 20);
  });
});

function clientExpression<T>(name: string, bindings: Record<string, unknown>) {
  return evaluate<T>(`(${initializer(clientAst, name).getText(clientAst)});`, bindings);
}
function scopeValues(current: Scope, selectedUserId: number) {
  const userId = clientExpression<number>('adjAssetFlowUserId', { adjSelectedUser: selectedUserId ? { id: selectedUserId } : null });
  const bindings = { adjAssetFlowScope: current, adjAssetFlowUserId: userId };
  return { userId, page: clientExpression<number>('adjAssetFlowPage', bindings),
    coin: clientExpression<string>('adjAssetFlowCurrency', bindings) };
}
const scopeEffects = nodes(clientAst, ts.isCallExpression).filter(call => ts.isIdentifier(call.expression)
  && call.expression.text === 'useEffect' && nodes(call.arguments[0], ts.isIdentifier).some(node => node.text === 'setAdjAssetFlowScope'));
function effect(correctPage: boolean) {
  const matches = scopeEffects.filter(call => nodes(call.arguments[0], ts.isIdentifier)
    .some(node => node.text === 'resolvedPage') === correctPage);
  expect(matches).toHaveLength(1);
  return matches[0];
}
function applyEffect(call: ts.CallExpression, scope: Scope, bindings: Record<string, unknown>) {
  let current = scope;
  const setter = vi.fn((update: Scope | ((value: Scope) => Scope)) => {
    current = typeof update === 'function' ? update(current) : update;
  });
  const callback = evaluate<() => void>(`(${call.arguments[0].getText(clientAst)});`, { ...bindings, setAdjAssetFlowScope: setter });
  callback();
  return { current, setter };
}
type VNode = { type: unknown; props: Record<string, unknown>; children: unknown[] };
const React = { createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): VNode =>
  ({ type, props: props ?? {}, children }) };
function isVNode(value: unknown): value is VNode {
  return !!value && typeof value === 'object' && 'children' in value && 'type' in value;
}
function treeNodes(tree: unknown): VNode[] {
  if (Array.isArray(tree)) return tree.flatMap(treeNodes);
  if (!isVNode(tree)) return [];
  return [tree, ...tree.children.flatMap(treeNodes)];
}
function text(tree: unknown): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (isVNode(tree)) return tree.children.map(text).join('');
  return typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
}
const digitalCard = required(nodes(clientAst, ts.isJsxElement).filter(element =>
  element.openingElement.tagName.getText(clientAst) === 'div'
  && nodes(element, ts.isJsxText).some(node => node.text.trim() === '数字资产流水')
  && nodes(element, ts.isIdentifier).some(node => node.text === 'adjVisibleMultiAssetHistory')
  && nodes(element, ts.isIdentifier).some(node => node.text === 'adjAssetFlowDisplayedPage'))
  .sort((left, right) => (left.end - left.pos) - (right.end - right.pos))[0], 'digital flow card');
function renderDigital(options: { page?: number; totalPages?: number; total?: number; coin?: string;
  loading?: boolean; fetching?: boolean; error?: boolean; items?: Item[] } = {}) {
  const setScope = vi.fn();
  const refetch = vi.fn();
  const tree = evaluate<VNode>(`(${digitalCard.getText(clientAst)});`, {
    React, AI_WALLET_SETTLEMENT_ASSETS, PrevIcon: 'PrevIcon', NextIcon: 'NextIcon',
    adjAssetFlowUserId: 28, adjAssetFlowCurrency: options.coin ?? 'all',
    adjAssetFlowDisplayedPage: options.page ?? 1, adjAssetFlowTotalPages: options.totalPages ?? 13,
    adjAssetFlowTotal: options.total ?? 123, adjVisibleMultiAssetHistory: options.items ?? [],
    adjMultiAssetHistoryQuery: { isLoading: !!options.loading, isFetching: !!options.fetching, isError: !!options.error },
    setAdjAssetFlowScope: setScope, refetchAdjMultiAssetHistory: refetch,
    isReversibleMultiAssetAdjustment: (entry: Item) => entry.eventType === 'admin_adjustment',
    cleanAdjustmentNote: (note: string) => note, openMultiAssetRevoke: vi.fn(), openMultiAssetNoteEditor: vi.fn(),
  });
  const buttons = treeNodes(tree).filter(node => node.type === 'button');
  return { tree, setScope, refetch, buttons, previous: required(buttons.find(node => text(node).includes('上一页')), 'previous'),
    next: required(buttons.find(node => text(node).includes('下一页')), 'next') };
}

describe('AfRechargeManage digital pagination: actual AST state/query/effects and JSX handlers', () => {
  it('requests the new query with scoped user/page/pageSize and optional coin, never limit 100 or a local history slice', () => {
    const useQuery = vi.fn((_input: Record<string, unknown>, _options: { enabled: boolean; staleTime: number }) => ({ marker: 'query' }));
    for (const coin of ['all', 'ETH']) {
      clientExpression('adjMultiAssetHistoryQuery', {
        mtrpc: { adminUser: { multiAssetWalletHistoryPage: { useQuery } } },
        adjAssetFlowUserId: 28, adjAssetFlowPage: 13, adjAssetFlowCurrency: coin,
        ADJ_PAGE_SIZE: clientExpression('ADJ_PAGE_SIZE', {}), adjSelectedUser: { id: 28 },
      });
      expect(useQuery).toHaveBeenLastCalledWith({ userId: 28, page: 13, pageSize: 10,
        ...(coin === 'all' ? {} : { assetCode: coin }) }, { enabled: true, staleTime: 0 });
    }
    clientExpression('adjMultiAssetHistoryQuery', {
      mtrpc: { adminUser: { multiAssetWalletHistoryPage: { useQuery } } },
      adjAssetFlowUserId: 0, adjAssetFlowPage: 1, adjAssetFlowCurrency: 'all', ADJ_PAGE_SIZE: 10, adjSelectedUser: null,
    });
    expect(useQuery.mock.calls.at(-1)?.[1].enabled).toBe(false);
    const items = Array.from({ length: 100 }, (_, index) => ({ id: index }));
    expect(clientExpression('adjVisibleMultiAssetHistory', { adjMultiAssetHistoryQuery: { data: { items } } })).toBe(items);
    expect(clientExpression('adjVisibleMultiAssetHistory', { adjMultiAssetHistoryQuery: {} })).toEqual([]);
    const visibleCalls = nodes(initializer(clientAst, 'adjVisibleMultiAssetHistory'), ts.isCallExpression);
    expect(visibleCalls).toHaveLength(0);
    const historyMaps = nodes(digitalCard, ts.isCallExpression).filter(call => ts.isPropertyAccessExpression(call.expression)
      && ts.isIdentifier(call.expression.expression) && call.expression.expression.text === 'adjVisibleMultiAssetHistory');
    expect(historyMaps).toHaveLength(1);
    expect((historyMaps[0].expression as ts.PropertyAccessExpression).name.text).toBe('map');
  });

  it('user switching renders page1/all immediately, before effect, and the reset effect depends only on user identity', () => {
    const old = { userId: 28, assetCode: 'ETH', page: 13 };
    expect(scopeValues(old, 28)).toEqual({ userId: 28, page: 13, coin: 'ETH' });
    expect(scopeValues(old, 29)).toEqual({ userId: 29, page: 1, coin: 'all' });
    expect(scopeValues(old, 0)).toEqual({ userId: 0, page: 1, coin: 'all' });
    const reset = effect(false);
    expect(evaluate(`(${reset.arguments[1].getText(clientAst)});`, { adjAssetFlowUserId: 29 })).toEqual([29]);
    expect(applyEffect(reset, old, { adjAssetFlowUserId: 29 }).current).toEqual({ userId: 29, assetCode: 'all', page: 1 });
    expect(applyEffect(reset, old, { adjAssetFlowUserId: 28 }).current).toBe(old);
    const sameUser = { userId: 28, assetCode: 'SOL', page: 3 };
    expect(applyEffect(reset, sameUser, { adjAssetFlowUserId: 28 }).current).toBe(sameUser);
  });

  it('coin change handler binds the current user and resets page to 1, with all and settlement-coin options', () => {
    const test = renderDigital({ page: 13, coin: 'ETH' });
    const select = required(treeNodes(test.tree).find(node => node.type === 'select'), 'coin select');
    expect(select.props.value).toBe('ETH');
    (select.props.onChange as (event: unknown) => void)({ target: { value: 'SOL' } });
    expect(test.setScope).toHaveBeenLastCalledWith({ userId: 28, assetCode: 'SOL', page: 1 });
    (select.props.onChange as (event: unknown) => void)({ target: { value: 'all' } });
    expect(test.setScope).toHaveBeenLastCalledWith({ userId: 28, assetCode: 'all', page: 1 });
    expect(treeNodes(select).filter(node => node.type === 'option').map(node => node.props.value))
      .toEqual(['all', ...AI_WALLET_SETTLEMENT_ASSETS]);
  });

  it('server last-page correction is applied only to the captured user/coin/page, never a newer scope', () => {
    const correction = effect(true);
    const old = { userId: 28, assetCode: 'ETH', page: 13 };
    const bindings = { adjMultiAssetHistoryQuery: { data: { page: 12 } }, adjAssetFlowUserId: 28,
      adjAssetFlowCurrency: 'ETH', adjAssetFlowPage: 13 };
    expect(applyEffect(correction, old, bindings).current).toEqual({ ...old, page: 12 });
    for (const newer of [{ userId: 29, assetCode: 'all', page: 1 }, { ...old, assetCode: 'SOL' }, { ...old, page: 5 }]) {
      expect(applyEffect(correction, newer, bindings).current).toBe(newer);
    }
    for (const data of [undefined, { page: 13 }]) {
      expect(applyEffect(correction, old, { ...bindings, adjMultiAssetHistoryQuery: { data } }).setter).not.toHaveBeenCalled();
    }
    expect(evaluate(`(${correction.arguments[1].getText(clientAst)});`, bindings)).toEqual([12, 28, 'ETH', 13]);
  });

  it.each([{ page: 1, totalPages: 13, previous: true, next: false },
    { page: 7, totalPages: 13, previous: false, next: false },
    { page: 13, totalPages: 13, previous: false, next: true },
    { page: 1, totalPages: 1, previous: true, next: true }])
  ('navigation bounds at page $page/$totalPages come from the server and retain user/coin', options => {
    const test = renderDigital({ ...options, coin: 'ETH' });
    expect(test.previous.props.disabled).toBe(options.previous);
    expect(test.next.props.disabled).toBe(options.next);
    (test.previous.props.onClick as () => void)();
    expect(test.setScope).toHaveBeenLastCalledWith({ userId: 28, assetCode: 'ETH', page: Math.max(1, options.page - 1) });
    (test.next.props.onClick as () => void)();
    expect(test.setScope).toHaveBeenLastCalledWith({ userId: 28, assetCode: 'ETH', page: Math.min(options.totalPages, options.page + 1) });
    expect(text(test.tree)).toContain(`${options.page} / ${options.totalPages} 页`);
  });

  it.each([{ fetching: true }, { error: true }, { fetching: true, error: true }])
  ('fetch/error disables both navigation controls even on a middle page: %j', state => {
    const test = renderDigital({ ...state, page: 7 });
    expect(test.previous.props.disabled).toBe(true);
    expect(test.next.props.disabled).toBe(true);
    expect(text(test.tree)).not.toContain('7 / 13 页');
  });

  it('server metadata, not visible row count, controls total/pages/displayed page, with stable empty defaults', () => {
    const bindings = { adjMultiAssetHistoryQuery: { data: { total: 123, totalPages: 13, page: 12 } }, adjAssetFlowPage: 99 };
    expect(clientExpression('adjAssetFlowTotal', bindings)).toBe(123);
    expect(clientExpression('adjAssetFlowTotalPages', bindings)).toBe(13);
    expect(clientExpression('adjAssetFlowDisplayedPage', bindings)).toBe(12);
    const absent = { adjMultiAssetHistoryQuery: {}, adjAssetFlowPage: 1 };
    expect(clientExpression('adjAssetFlowTotal', absent)).toBe(0);
    expect(clientExpression('adjAssetFlowTotalPages', absent)).toBe(1);
    expect(clientExpression('adjAssetFlowDisplayedPage', absent)).toBe(1);
    expect(text(renderDigital({ total: 123 }).tree)).toContain('共 123 条');
  });

  it('loading/error states do not masquerade as empty history, and error offers a real refetch callback', () => {
    const loading = renderDigital({ loading: true, fetching: true });
    expect(text(loading.tree)).toContain('统计中');
    expect(text(loading.tree)).toContain('数字资产流水加载中');
    expect(text(loading.tree)).not.toContain('暂无');
    const failed = renderDigital({ error: true });
    expect(text(failed.tree)).toContain('统计失败');
    expect(text(failed.tree)).toContain('流水加载失败，请重试');
    expect(text(failed.tree)).not.toContain('暂无');
    expect(text(failed.tree)).not.toContain('共 123 条');
    const retry = required(failed.buttons.find(node => text(node) === '重新加载'), 'retry button');
    (retry.props.onClick as () => void)();
    expect(failed.refetch).toHaveBeenCalledOnce();
  });

  it('empty all/coin histories stay visible with stable 1/1 navigation, while populated history maps every returned item', () => {
    for (const coin of ['all', 'ETH']) {
      const test = renderDigital({ total: 0, totalPages: 1, coin });
      expect(text(test.tree)).toContain(coin === 'all' ? '暂无数字资产流水' : '暂无 ETH 流水');
      expect(text(test.tree)).toContain('共 0 条');
      expect(text(test.tree)).toContain('1 / 1 页');
      expect(test.previous.props.disabled).toBe(true);
      expect(test.next.props.disabled).toBe(true);
    }
    const testDb = harness();
    const items = Array.from({ length: 10 }, (_, index) => testDb.entryResult(fixture(index + 1)));
    const card = renderDigital({ items });
    expect(text(card.tree)).not.toContain('暂无');
    expect(treeNodes(card.tree).filter(node => node.props.key != null).map(node => node.props.key)
      .filter(key => typeof key === 'number')).toEqual(items.map(item => item.id));
  });
});

function clientSuccess(name: string) {
  const call = initializer(clientAst, name);
  if (!ts.isCallExpression(call)) throw new Error(`Expected mutation initialization: ${name}`);
  const option = required(nodes(call.arguments[0], ts.isPropertyAssignment).find(node => node.name.getText(clientAst) === 'onSuccess'), 'onSuccess');
  return option.initializer;
}
describe('digital adjustment/revoke/note success and unchanged money mutation contracts', () => {
  it.each(['multiAssetAdjMutation', 'multiAssetRevokeMutation', 'multiAssetUpdateNoteMutation'])
  ('%s success invalidates the new page query as well as legacy history', name => {
    const invalidatePage = vi.fn();
    const invalidateOld = vi.fn();
    const setScope = vi.fn();
    const refetch = vi.fn();
    const success = evaluate<(...args: unknown[]) => void>(`(${clientSuccess(name).getText(clientAst)});`, {
      toast: { success: vi.fn() }, adjSelectedUser: { id: 28 }, rememberRecentAdjUser: vi.fn(),
      setAdjAmount: vi.fn(), setAdjNote: vi.fn(), setShowRevokeDialog: vi.fn(), setRevokeTarget: vi.fn(),
      setShowNoteDialog: vi.fn(), setNoteTarget: vi.fn(), setNoteContent: vi.fn(),
      adjUtils: { adminUser: { list: { invalidate: vi.fn() }, walletGlobalHistory: { invalidate: vi.fn() },
        multiAssetWalletHistory: { invalidate: invalidateOld }, multiAssetWalletHistoryPage: { invalidate: invalidatePage } } },
      setAdjAssetFlowScope: setScope, adjAssetFlowUserId: 28, adjAssetFlowCurrency: 'ETH',
      refetchAdjHistory: vi.fn(), setAdjLogPage: vi.fn(), refetchAdjGlobal: vi.fn(), refetchAdjMultiAssetHistory: refetch,
    });
    success({}, { mode: 'delete' });
    expect(invalidatePage).toHaveBeenCalledOnce();
    expect(invalidatePage).toHaveBeenCalledWith();
    expect(invalidateOld).toHaveBeenCalledOnce();
    if (name === 'multiAssetAdjMutation') expect(setScope).toHaveBeenCalledWith({ userId: 28, assetCode: 'ETH', page: 1 });
    else {
      expect(refetch).toHaveBeenCalledOnce();
      expect(setScope).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['walletAdjust', ['userId', 'currency', 'amount', 'note']],
    ['multiAssetWalletAdjust', ['userId', 'assetCode', 'amount', 'note', 'requestId']],
    ['multiAssetWalletRevokeAdjustment', ['entryId', 'mode']],
    ['multiAssetWalletUpdateAdjustmentNote', ['entryId', 'note']],
  ] as const)('%s input keeps its existing money-operation keys without pagination parameters', (name, keys) => {
    expect(Object.keys(routeSchema(name).shape).sort()).toEqual([...keys].sort());
    const callback = routeCallback(name, 'mutation');
    const inputFields = nodes(callback, ts.isPropertyAccessExpression).filter(node =>
      ts.isIdentifier(node.expression) && node.expression.text === 'input').map(node => node.name.text);
    expect(inputFields.every(field => keys.includes(field as never))).toBe(true);
  });

  it('front-end money mutation payloads have no page/size/filter keys, including both revoke modes and note editing', () => {
    const payloadKeys: Record<string, string[]> = {
      adjMutation: ['userId', 'currency', 'amount', 'note'],
      multiAssetAdjMutation: ['userId', 'assetCode', 'amount', 'note', 'requestId'],
      multiAssetRevokeMutation: ['entryId', 'mode'],
      multiAssetUpdateNoteMutation: ['entryId', 'note'],
    };
    for (const [name, keys] of Object.entries(payloadKeys)) {
      const calls = nodes(clientAst, ts.isCallExpression).filter(call => ts.isPropertyAccessExpression(call.expression)
        && call.expression.name.text === 'mutate' && ts.isIdentifier(call.expression.expression)
        && call.expression.expression.text === name);
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        const argument = call.arguments[0];
        if (!ts.isObjectLiteralExpression(argument)) throw new Error(`Expected explicit ${name} payload`);
        expect(argument.properties.every(ts.isPropertyAssignment)).toBe(true);
        expect(argument.properties.map(property => (property as ts.PropertyAssignment).name.getText(clientAst)).sort()).toEqual([...keys].sort());
      }
    }
  });

  it.each([
    ['multiAssetWalletAdjust', 'adjustMultiAssetBalance', { userId: 28, assetCode: 'ETH', amount: '0.000000000000000001', note: 'test', requestId: 'request_0123456789' },
      { userId: 28, assetCode: 'ETH', amount: '0.000000000000000001', note: 'test', requestId: 'request_0123456789', actorUserId: 1, sourceLedgerId: 52 }],
    ['multiAssetWalletRevokeAdjustment', 'revokeMultiAssetAdminAdjustment', { entryId: 28, mode: 'delete' }, { entryId: 28, mode: 'delete', actorUserId: 1 }],
    ['multiAssetWalletUpdateAdjustmentNote', 'updateMultiAssetAdminAdjustmentNote', { entryId: 28, note: 'new note' }, { entryId: 28, note: 'new note', actorUserId: 1 }],
  ] as const)('%s real callback forwards only original parameters, with fund functions stubbed', async (name, helper, input, expected) => {
    const funds = vi.fn(async () => ({ success: true }));
    const enabled = vi.fn(async () => undefined);
    const callback = evaluate<(args: unknown) => Promise<unknown>>(`(${routeCallback(name, 'mutation').getText(routeAst)});`,
      { [helper]: funds, assertAiWalletOperationEnabled: enabled, TRPCError });
    expect(await callback({ ctx: { user: { id: 1 } }, input })).toEqual({ success: true });
    expect(funds).toHaveBeenCalledOnce();
    expect(funds).toHaveBeenCalledWith(expected);
    if (name === 'multiAssetWalletAdjust') expect(enabled).toHaveBeenCalledWith('ledger:52', 'admin_adjustment');
  });
});
