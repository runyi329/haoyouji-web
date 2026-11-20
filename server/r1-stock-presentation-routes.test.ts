import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { isR1StockPresentationScope, R1_STOCK_CATEGORY_ID, r1AiDisplayKey } from '../shared/r1-stock-presentation';

const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const routerAst = ts.createSourceFile('routers.ts', routerSource, ts.ScriptTarget.Latest, true);
const pageSource = readFileSync(new URL('../client/src/pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
const pageAst = ts.createSourceFile('LedgerDetailAA.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root); return result;
}
function required<T>(value: T | undefined, label: string): T { if (value === undefined) throw new Error(`Missing production code: ${label}`); return value; }
function property(name: string) {
  return required(nodes(routerAst, ts.isPropertyAssignment).find(node => node.name.getText(routerAst) === name), name);
}
function argument(name: string, method: string) {
  return required(nodes(property(name), ts.isCallExpression).find(node => ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === method)?.arguments[0], `${name}.${method}`);
}
class OfflineError extends Error { code: string; constructor(input: { code: string; message: string }) { super(input.message); this.code = input.code; } }
function compile<T>(source: string, bindings: Record<string, unknown> = {}): T {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  return runInNewContext(js, { process: undefined, fetch: undefined, require: undefined, ...bindings }, { timeout: 1000 }) as T;
}
function schema(name: string): z.ZodTypeAny { return compile(`(${argument(name, 'input').getText(routerAst)});`, { z, R1_STOCK_CATEGORY_ID }); }
function handler(name: string, backend: Record<string, unknown>) {
  const method = name === 'setR1StockAiDisplay' ? 'mutation' : 'query';
  const source = argument(name, method).getText(routerAst);
  if (name !== 'setR1StockAiDisplay') expect(source).toContain("await import('./ledger-stock-portfolio')");
  return compile<(args: { ctx: any; input: any }) => Promise<any>>(`(${source.replaceAll("await import('./ledger-stock-portfolio')", '__stock')});`, { __stock: backend, TRPCError: OfflineError, assertLedger37RawPresentationRead: async () => {} });
}
const context = (overrides: Record<string, unknown> = {}) => ({ user: { id: 28, role: 'member' }, realUser: { id: 870413, role: 'admin' }, isViewingAs: false, ...overrides });
const inputs = { ledgerId: 37, categoryId: R1_STOCK_CATEGORY_ID, viewAsUserId: 28 };

describe('R1安全展示路由：执行真实input schema和异步handler，不导入数据库', () => {
  it.each(['getR1StockPresentationContext', 'getMyR1AiParticipationPortfolio', 'setR1StockAiDisplay'])('%s严格限定37号安全股票范围和安全整数用户，旧setter保留退休schema', name => {
    const value = name === 'setR1StockAiDisplay' ? { ledgerId: 37, categoryId: R1_STOCK_CATEGORY_ID, targetUserId: 29, enabled: true } : inputs;
    expect(schema(name).parse(value)).toEqual(value);
    for (const invalid of [{ ledgerId: 52 }, { categoryId: name === 'setR1StockAiDisplay' ? 90251 : 0 }]) expect(schema(name).safeParse({ ...value, ...invalid }).success).toBe(false);
    if (name !== 'setR1StockAiDisplay') expect(schema(name).safeParse({ ...value, categoryId: 90251 }).success).toBe(true);
    const field = name === 'setR1StockAiDisplay' ? 'targetUserId' : 'viewAsUserId';
    for (const id of [0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1]) expect(schema(name).safeParse({ ...value, [field]: id }).success).toBe(false);
  });
  it.each(['getR1StockPresentationContext', 'getMyR1AiParticipationPortfolio'])('%s只取ctx有效用户，不拿真实管理员ID替代被代看的成员', async name => {
    const backend = vi.fn(async (input: any) => input), invoke = handler(name, { [name]: backend });
    const result = await invoke({ ctx: context({ isViewingAs: true }), input: inputs });
    expect(result).toEqual({ ledgerId: 37, categoryId: R1_STOCK_CATEGORY_ID, userId: 28, systemRole: 'member', isViewingAs: true });
    await expect(invoke({ ctx: context(), input: { ...inputs, viewAsUserId: 29 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(backend).toHaveBeenCalledTimes(1);
  });
  it('旧标签AI开关已停用，管理员与代看均不能保留第二个保存入口', async () => {
    const backend = vi.fn(async (input: any) => input), invoke = handler('setR1StockAiDisplay', { setR1StockAiDisplay: backend });
    const input = { ledgerId: 37, categoryId: R1_STOCK_CATEGORY_ID, targetUserId: 29, enabled: true };
    await expect(invoke({ ctx: context({ isViewingAs: true }), input })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(backend).not.toHaveBeenCalled();
    await expect(invoke({ ctx: context({ user: { id: 870413, role: 'admin' } }), input })).rejects.toThrow('标签级AI设置已停用');
    expect(backend).not.toHaveBeenCalled();
  });
  it.each(['getStockTagPortfolio', 'getStockTagPublicPortfolio', 'getMyStockTagParticipantPortfolio', 'getStockTagCalendar', 'getStockTagDailySnapshots'])('%s原路由支持显式用户缓存身份但不能读取第三人', async name => {
    const backend = vi.fn(async (input: any) => input), invoke = handler(name, { [name]: backend });
    await expect(invoke({ ctx: context(), input: { ...inputs, viewAsUserId: 29 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(backend).not.toHaveBeenCalled();
    expect(schema(name).parse(inputs)).toEqual(inputs);
    const result = await invoke({ ctx: context(), input: inputs }); expect(result.userId).toBe(28);
    const legacy = await invoke({ ctx: context(), input: { ledgerId: 37, categoryId: R1_STOCK_CATEGORY_ID } }); expect(legacy.userId).toBe(28);
    expect(result.isViewingAs).toBe(false);
  });
  it.each(['getStockTagPortfolio', 'getStockTagPublicPortfolio', 'getMyStockTagParticipantPortfolio', 'getStockTagCalendar', 'getStockTagDailySnapshots', 'getStockLotParticipationMatrix', 'getMyStockTagObservationPortfolio', 'getMyStockTagObservationOverview', 'getMyStockTagOverview'])('%s旧读统一传递代看状态，即便目标也是管理员也不能当实际管理上下文', async name => {
    const backend = vi.fn(async (input: any) => { if (input.isViewingAs) throw new Error('AI raw blocked'); return input; });
    const invoke = handler(name, { [name]: backend });
    await expect(invoke({ ctx: context({ user: { id: 28, role: 'admin' }, isViewingAs: true }), input: inputs })).rejects.toThrow('AI raw blocked');
    expect(backend).toHaveBeenCalledWith(expect.objectContaining({ userId: 28, systemRole: 'admin', isViewingAs: true }));
  });
  it('旧getTagSummary在catch外按稳定R1 ID核验展示权限，改名后AI代看也不返回全员押金/总盘市值', async () => {
    const execute = vi.fn(async (query: string) => query.includes('FROM ledger_categories') ? [[{ id: R1_STOCK_CATEGORY_ID, accounting_mode: 'stock_portfolio' }]] : [[]]);
    const getContext = vi.fn(async () => ({ aiEnabled: true, canManage: false }));
    const marketValue = vi.fn(async () => ({ value: 999 }));
    const source = argument('getTagSummary', 'query').getText(routerAst);
    const invoke = compile<(args: { ctx: any; input: any }) => Promise<any>>(`(${source.replaceAll("await import('./r1-stock-presentation')", '__presentation').replaceAll("await import('./ledger-stock-portfolio')", '__stock')});`, {
      getLedgerDb: async () => ({ execute }), sql: (parts: TemplateStringsArray, ...values: any[]) => parts.reduce((text, part, i) => `${text}${part}${i < values.length ? values[i] : ''}`, ''),
      R1_STOCK_CATEGORY_ID, LEDGER_37_ID: 37, getBeijingLedgerRecordToday: () => '2026-11-18',
      __presentation: { getR1StockPresentationContext: getContext, assertR1RawReadAllowed: (ctx: any) => { if (ctx.aiEnabled && !ctx.canManage) throw new Error('AI raw blocked'); } },
      __stock: { getStockTagCurrentMarketValue: marketValue },
      assertLedger37RawPresentationRead: async () => {},
    });
    await expect(invoke({ ctx: context({ isViewingAs: true }), input: { ledgerId: 37, tagName: 'R1改名' } })).rejects.toThrow('AI raw blocked');
    expect(getContext).toHaveBeenCalledWith(expect.objectContaining({ categoryId: R1_STOCK_CATEGORY_ID, userId: 28, isViewingAs: true }));
    expect(marketValue).not.toHaveBeenCalled();
    getContext.mockResolvedValue({ aiEnabled: false, canManage: false });
    const normal = await invoke({ ctx: context(), input: { ledgerId: 37, tagName: 'R1改名' } });
    expect(normal.currentHoldingValue.value).toBe(999); expect(marketValue).toHaveBeenCalledOnce();
  });
});

describe('主页R1安全入口及稳定ID', () => {
  it('范围只在真实R1 ID，标签改名不会移动配置，其他股票标签不升级', () => {
    expect(isR1StockPresentationScope(37, 90250)).toBe(true);
    expect(isR1StockPresentationScope(52, 90250)).toBe(false);
    expect(isR1StockPresentationScope(37, 90251)).toBe(false);
    expect(r1AiDisplayKey(90250)).toBe('__stockAiDisplay_category_90250');
  });
  it('AI上下文绑定当前有效成员且无placeholder，R1模式确认前不启用旧日历', () => {
    const query = required(nodes(pageAst, ts.isVariableDeclaration)
      .find(node => node.name.getText(pageAst) === 'r1PresentationQuery')?.initializer, 'context query');
    expect(query.getText(pageAst)).toContain('viewAsUserId: marginTargetUserId');
    expect(query.getText(pageAst)).toContain('placeholderData: undefined');
    expect(query.getText(pageAst)).toContain('getLedger37PresentationContext');
    expect(query.getText(pageAst)).not.toContain('categoryId:');
    const calendar = required(nodes(pageAst, ts.isVariableDeclaration).find(node => node.name.getText(pageAst) === 'stockCalendarSnapshotsQuery')?.initializer, 'calendar');
    expect(calendar.getText(pageAst)).toContain('r1PresentationQuery.data && !r1ShowsAi && !r1PresentationQuery.isError');
    expect(pageSource).toContain('r1PresentationQuery.isPending || r1PresentationQuery.isError');
  });
  it('AI用户直接渲染安全全37首页，不须选R1；各子页key按有效用户隔离', () => {
    const gate = required(nodes(pageAst, ts.isIfStatement).find(node => node.expression.getText(pageAst) === 'r1ShowsAi'), 'AI entry');
    expect(gate.getText(pageAst)).toContain('Ledger37AiHome');
    expect(gate.getText(pageAst)).toContain('viewerUserId={marginTargetUserId}');
    expect(gate.getText(pageAst)).toContain('onBack={onBack}');
    for (const node of nodes(pageAst, ts.isJsxSelfClosingElement).filter(node => node.tagName.getText(pageAst) === 'StockTagPortfolio')) {
      expect(node.getText(pageAst)).toContain('marginTargetUserId');
      expect(node.getText(pageAst)).toContain('key=');
    }
    expect(pageSource).not.toContain('r1AiDisplayKey');
    expect(pageSource).toContain('r1ShowsAi || !r1PresentationQuery.data || r1PresentationQuery.isError');
  });
});
