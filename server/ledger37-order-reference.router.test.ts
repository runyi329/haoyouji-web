import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('routers.ts', source, ts.ScriptTarget.Latest, true);
const queries = [
  ['getTagConfig', 'config'], ['getTagSummary', 'summary'],
  ['getTagMarginValuation', 'valuation'], ['getTagInterestPeriods', 'interest'],
] as const;
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node) => { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(root);
  if (!found) throw new Error('Missing actual router source');
  return found;
}
function property(name: string): ts.PropertyAssignment {
  return find(ast, node => ts.isPropertyAssignment(node) && node.name.getText(ast) === name
    && node.initializer.getText(ast).startsWith('protectedProcedure')) as ts.PropertyAssignment;
}
function handler(name: string, bindings: Record<string, unknown>) {
  const call = find(property(name), node => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'query') as ts.CallExpression;
  const code = ts.transpileModule(`(${call.arguments[0].getText(ast)})`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(code, { TRPCError, ...bindings }, { timeout: 1000 }) as (args: unknown) => Promise<any>;
}
const ctx = { user: { id: 4958125 }, isViewingAs: false };
const scope = { orderId: 283, userId: 4958125 };
const input = { ledgerId: 37, tagName: 'account-2152', reference52: scope };
const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings: Array.from(strings), values });

describe('37号实际只读路由：52订单授权桥接不扩大原始权限', () => {
  it.each(queries)('%s合法52引用先核验订单，不检查37成员/owner身份', async (name, kind) => {
    const connection = { execute: vi.fn() };
    const bridge = vi.fn(async () => true);
    const oldRaw = vi.fn(async () => { throw new Error('37成员身份不应成为订单阻拦'); });
    const oldOwner = vi.fn(async () => { throw new Error('37所有者身份不应成为订单阻拦'); });
    const reachedRead = new Error('authorized read reached');
    const ledgerRead = vi.fn(async () => { throw reachedRead; });
    await expect(handler(name, {
      assertLedger37OrderReferenceRead: bridge, assertLedger37RawPresentationRead: oldRaw,
      assertLedger37Owner: oldOwner, getDbConnection: async () => connection, getLedgerDb: ledgerRead,
    })({ ctx, input })).rejects.toBe(reachedRead);
    expect(bridge).toHaveBeenCalledWith(ctx, input, kind, connection);
    expect(oldRaw).not.toHaveBeenCalled(); expect(oldOwner).not.toHaveBeenCalled();
    expect(ledgerRead).toHaveBeenCalledOnce();
  });
  it.each(queries)('%s无52作用域继续原37权限，不隐式授权', async (name) => {
    const denial = new TRPCError({ code: 'FORBIDDEN' });
    const raw = vi.fn(async () => { throw denial; });
    const owner = vi.fn(async () => { throw denial; });
    const bridge = vi.fn(); const read = vi.fn(); const connection = vi.fn();
    await expect(handler(name, {
      assertLedger37OrderReferenceRead: bridge, assertLedger37RawPresentationRead: raw,
      assertLedger37Owner: owner, getDbConnection: connection, getLedgerDb: read,
    })({ ctx, input: { ledgerId: 37, tagName: 'account-2152' } })).rejects.toBe(denial);
    expect(name === 'getTagInterestPeriods' ? owner : raw).toHaveBeenCalledWith(ctx, 37);
    expect(bridge).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(connection).not.toHaveBeenCalled();
  });
  it.each(queries)('%s引用核验失败不回退管理员读取或执行37数据查询', async (name) => {
    const denial = new TRPCError({ code: 'FORBIDDEN', message: '该订单引用不属于当前用户' });
    const bridge = vi.fn(async () => { throw denial; }); const raw = vi.fn(); const owner = vi.fn(); const read = vi.fn();
    await expect(handler(name, {
      assertLedger37OrderReferenceRead: bridge, assertLedger37RawPresentationRead: raw,
      assertLedger37Owner: owner, getDbConnection: async () => ({}), getLedgerDb: read,
    })({ ctx, input })).rejects.toBe(denial);
    expect(read).not.toHaveBeenCalled(); expect(raw).not.toHaveBeenCalled(); expect(owner).not.toHaveBeenCalled();
  });
  it.each(queries)('%s真实schema仅增加optional订单scope，不改成公开接口', name => {
    const text = property(name).getText(ast);
    expect(text).toContain('reference52: ledger37OrderReferenceSchema.optional()');
    expect(text).toContain('protectedProcedure');
    expect(text).toContain('await assertLedger37OrderReferenceRead(ctx, input');
    expect(text).not.toContain('.mutation(');
  });
  it('52引用标签配置仅返回计算与该标签担保字段，原37响应不变', async () => {
    const row = { tag_name: 'account-2152', initial_amount: '1000000', account_multiplier: '1', margin_base: '1000000',
      margin_by_coin: '[]', pause_date: null, margin_pause_date: null, secret_setting: 'private', created_by: 870413 };
    const call = handler('getTagConfig', {
      assertLedger37OrderReferenceRead: async () => true, assertLedger37RawPresentationRead: async () => undefined,
      getDbConnection: async () => ({}), getLedgerDb: async () => ({ execute: async () => [[row]] }), sql,
    });
    const result = await call({ ctx, input });
    expect(result).toMatchObject({ initial_amount: '1000000', margin_by_coin: '[]' });
    expect(result).not.toHaveProperty('secret_setting'); expect(result).not.toHaveProperty('created_by');
    expect(await call({ ctx, input: { ledgerId: 37, tagName: 'account-2152' } })).toBe(row);
  });
  it('52引用利息只返回当前绑定标签的计算/详情字段，已付标记保留', async () => {
    const row = { id: 1, tag_name: 'account-2772', principal: '-20000.00', annual_rate: '0', is_manual: 1,
      start_date: '2026-11-06', end_date: '2026-11-06', manual_remark: 'registered payment', created_by: 870413, secret_setting: 'private' };
    const execute = vi.fn(async (_query: { strings: string[] }) => [[row]]);
    const result = await handler('getTagInterestPeriods', {
      assertLedger37OrderReferenceRead: async () => true, getDbConnection: async () => ({}),
      getLedgerDb: async () => ({ execute }), sql,
    })({ ctx, input: { ...input, tagName: 'account-2772', reference52: { ...scope, orderId: 273 } } });
    expect(result).toHaveLength(1); expect(result[0]).toMatchObject({ principal: '-20000.00', is_manual: 1 });
    expect(result[0]).not.toHaveProperty('created_by'); expect(result[0]).not.toHaveProperty('secret_setting');
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0][0].strings.join('?')).toContain('AND tag_name =');
  });
  it('R1原始总盘门禁仍在，只有已验证的52订单路径读取其实际绑定摘要', () => {
    const text = property('getTagSummary').getText(ast);
    expect(text).toContain('if (!input.reference52 && input.ledgerId === 37 && Number(category?.id) === R1_STOCK_CATEGORY_ID)');
    expect(text).toContain('assertR1RawReadAllowed(presentation)');
    expect(text.indexOf('await assertLedger37OrderReferenceRead')).toBeLessThan(text.indexOf('const db = await getLedgerDb()'));
  });
});
