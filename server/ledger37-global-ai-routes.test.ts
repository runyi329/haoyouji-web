import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { describe, it, expect, vi } from 'vitest';
import { R1_STOCK_CATEGORY_ID } from '../shared/r1-stock-presentation';
const source = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('routers.ts', source, ts.ScriptTarget.Latest, true);
function find<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T, predicate: (node: T) => boolean): T {
  let found: T | undefined;
  const visit = (node: ts.Node) => { if (!found && guard(node) && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); };
  visit(root); if (!found) throw new Error('Missing actual source'); return found;
}
function arg(name: string, method: string) {
  const procedure = name === 'getPublicCategories' ? 'publicProcedure' : 'protectedProcedure';
  const prop = find(ast, ts.isPropertyAssignment, node => node.name.getText(ast) === name && node.initializer.getText(ast).startsWith(procedure)
    && (name !== 'getTransactions' || node.initializer.getText(ast).includes('dbLedger.getTransactionsList')));
  return find(prop, ts.isCallExpression, node => ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === method).arguments[0].getText(ast);
}
class OfflineError extends Error { code: string; constructor(input: { code: string; message: string }) { super(input.message); this.code = input.code; } }
function compile<T>(code: string, bindings: Record<string, any> = {}): T {
  return runInNewContext(ts.transpileModule(`(${code});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { TRPCError: OfflineError, z, R1_STOCK_CATEGORY_ID, process: undefined, require: undefined, fetch: undefined, ...bindings }, { timeout: 1000 });
}
const schema = (name: string): z.ZodTypeAny => compile(arg(name, 'input'));
const ctx = (overrides = {}): any => ({ user: { id: 28, role: 'member' }, realUser: { id: 870413, role: 'admin' }, isViewingAs: false, ...overrides });
function invoke(name: string, backend: Record<string, any> = {}, extra: Record<string, any> = {}) {
  const method = name.startsWith('set') ? 'mutation' : 'query';
  const code = arg(name, method).replaceAll("await import('./ledger37-ai-presentation')", '__global').replaceAll("await import('./ledger-stock-portfolio')", '__stock').replaceAll("await import('./ledger37-ai-wallet-value')", '__global').replaceAll("await import('./ledger37-holding-sources')", '__global');
  return compile<(args: { ctx: any; input: any }) => Promise<any>>(code, { __global: backend, __stock: backend, assertLedger37RawPresentationRead: async () => {}, ...extra });
}

describe('37号每成员全局AI：真实路由与schema，无DB/网络/写入', () => {
  it.each(['getLedger37PresentationContext', 'getMyLedger37AiOverview', 'getMyLedger37AiStockPool', 'getMyLedger37AiWalletValue', 'getMyLedger37HoldingSources', 'setLedger37AiDisplay'])('%s只按37+用户控制，不接受标签/订单/份额字段', name => {
    const valid = name.startsWith('set') ? { ledgerId: 37, targetUserId: 29, enabled: true } : { ledgerId: 37, viewAsUserId: 28 };
    expect(schema(name).parse(valid)).toEqual(valid);
    for (const change of [{ ledgerId: 52 }, { ledgerId: 36 }, { categoryId: 90250 }, { lotId: 3 }, { amount: '100' }, { userId: 29 }]) expect(schema(name).safeParse({ ...valid, ...change }).success).toBe(false);
    const key = name.startsWith('set') ? 'targetUserId' : 'viewAsUserId';
    for (const id of [0, -1, 1.1, '28', Number.MAX_SAFE_INTEGER + 1, Infinity]) expect(schema(name).safeParse({ ...valid, [key]: id }).success).toBe(false);
  });
  it.each(['getLedger37PresentationContext', 'getMyLedger37AiOverview', 'getMyLedger37AiStockPool', 'getMyLedger37AiWalletValue', 'getMyLedger37HoldingSources'])('%s只信有效ctx成员，不能借真实管理员或参数读取第三人', async name => {
    const spy = vi.fn(async value => value), call = invoke(name, { [name]: spy });
    const result = await call({ ctx: ctx({ isViewingAs: true }), input: { ledgerId: 37, viewAsUserId: 28 } });
    expect(result).toEqual({ ledgerId: 37, userId: 28, systemRole: 'member', isViewingAs: true });
    await expect(call({ ctx: ctx(), input: { ledgerId: 37, viewAsUserId: 29 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(spy).toHaveBeenCalledOnce();
  });
  it.each(['getR1StockPresentationContext', 'getMyR1AiParticipationPortfolio', 'getMyLedger37AiOverview'])('%s不能成为AI客户读取内部参与项目的旧入口', async name => {
    const spy = vi.fn();
    const guard = vi.fn(async () => { throw new OfflineError({ code: 'FORBIDDEN', message: 'private project blocked' }); });
    const call = invoke(name, { [name]: spy }, { assertLedger37RawPresentationRead: guard });
    await expect(call({ ctx: ctx(), input: { ledgerId: 37, categoryId: 90250, viewAsUserId: 28 } })).rejects.toThrow('private project blocked');
    expect(spy).not.toHaveBeenCalled();
    expect(guard).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 28, role: 'member' } }), 37);
  });
  it('全局设置只发送ledger+target+boolean，代看禁止且不调用后端', async () => {
    const spy = vi.fn(async value => value), call = invoke('setLedger37AiDisplay', { setLedger37AiDisplay: spy });
    const input = { ledgerId: 37, targetUserId: 29, enabled: true };
    await expect(call({ ctx: ctx({ isViewingAs: true }), input })).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(spy).not.toHaveBeenCalled();
    expect(await call({ ctx: ctx({ user: { id: 870413, role: 'admin' } }), input })).toEqual({ ...input, userId: 870413, systemRole: 'admin', isViewingAs: false });
  });
  it('旧标签级setter明确退休，不保留第二个可写入口', async () => {
    const spy = vi.fn(), call = invoke('setR1StockAiDisplay', { setR1StockAiDisplay: spy });
    await expect(call({ ctx: ctx({ user: { id: 870413, role: 'admin' } }), input: { ledgerId: 37, categoryId: 90250, targetUserId: 29, enabled: true } })).rejects.toThrow('标签级AI设置已停用');
    expect(spy).not.toHaveBeenCalled();
  });
  it.each(['getR1StockPresentationContext', 'getMyR1AiParticipationPortfolio'])('%s安全stock读支持两笔不同标签、权限仍在真实服务校验', name => {
    for (const categoryId of [90250, 90251]) expect(schema(name).parse({ ledgerId: 37, categoryId, viewAsUserId: 28 })).toEqual({ ledgerId: 37, categoryId, viewAsUserId: 28 });
    expect(schema(name).safeParse({ ledgerId: 52, categoryId: 90250 }).success).toBe(false);
  });
  it('通用原始读取守卫全37同源，普通模式/真实管理不受影响、其他账本不读AI配置', async () => {
    const fn = find(ast, ts.isFunctionDeclaration, node => node.name?.text === 'assertLedger37RawPresentationRead').getText(ast);
    const read = vi.fn(async () => ({ aiEnabled: true, canManage: false }));
    const guard = compile<(context: any, ledgerId: number) => Promise<void>>(fn.replaceAll("await import('./ledger37-ai-presentation')", '__global'), { __global: { getLedger37PresentationContext: read } });
    await expect(guard(ctx({ user: { id: 28, role: 'admin' }, isViewingAs: true }), 37)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(read).toHaveBeenCalledWith({ ledgerId: 37, userId: 28, systemRole: 'admin', isViewingAs: true });
    read.mockResolvedValue({ aiEnabled: false, canManage: false }); await expect(guard(ctx(), 37)).resolves.toBeUndefined();
    read.mockResolvedValue({ aiEnabled: true, canManage: true }); await expect(guard(ctx(), 37)).resolves.toBeUndefined();
    read.mockClear(); await expect(guard(ctx(), 52)).resolves.toBeUndefined(); expect(read).not.toHaveBeenCalled();
  });
  it.each(['getTransactions', 'getCategories', 'getMyInitialBalances', 'getTagConfig', 'getTagSummary', 'getAllTagsConfigByLedger', 'getAllTagsMarginSummary', 'getDividendSummary', 'getDividendRecords', 'getActiveMarginTags', 'getMyStockTagObservationOverview', 'getMyStockTagOverview'])('%s原始入口先阻断AI，不在后台读旧数据后再前端隐藏', async name => {
    const guard = vi.fn(async () => { throw new OfflineError({ code: 'FORBIDDEN', message: 'AI raw blocked' }); });
    const call = invoke(name, {}, { assertLedger37RawPresentationRead: guard });
    await expect(call({ ctx: ctx(), input: { ledgerId: 37, tagName: 'any tag' } })).rejects.toThrow('AI raw blocked');
    expect(guard).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 28, role: 'member' } }), 37);
  });
  it('未登录公共分类不能旁路37号真实标签名，拒绝发生在DB之前', async () => {
    const query = compile<(args: { input: any }) => Promise<any>>(arg('getPublicCategories', 'query'));
    await expect(query({ input: { ledgerId: 37 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
