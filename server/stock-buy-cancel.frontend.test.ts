import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as instruments from '../shared/portfolio-instruments';

// Execute the complete real TSX (including effects, state and handlers) offline.
// Only imports are removed; inert UI hooks/tRPC never import a router, DB or perform HTTP.
const source = readFileSync(new URL('../client/src/components/StockTagBuyCancelDialog.tsx', import.meta.url), 'utf8');
const tradeSource = readFileSync(new URL('../client/src/components/StockTagTradeDialog.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../client/src/pages/StockTagPortfolio.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('StockTagBuyCancelDialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const tradeAst = ts.createSourceFile('StockTagTradeDialog.tsx', tradeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pageAst = ts.createSourceFile('StockTagPortfolio.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React };
function declaration(file: ts.SourceFile, name: string): ts.Node {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) found = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error(`Missing real frontend declaration: ${name}`);
  return found;
}
function evaluate(expression: string, scope: Record<string, any> = {}, preview = false): any {
  const js = ts.transpileModule(`const execute = ${expression.replace(/^export\s+(default\s+)?/, '').replaceAll('import.meta.env.DEV', '__preview')};`, { compilerOptions }).outputText;
  return new Function('React', '__preview', ...Object.keys(scope), `${js}; return execute;`)(React, preview, ...Object.values(scope));
}
function actual(file: ts.SourceFile, name: string, scope: Record<string, any> = {}, preview = false) {
  return evaluate(declaration(file, name).getText(file), scope, preview);
}
const beijingTradeInputTime = actual(tradeAst, 'beijingTradeInputTime');
const fullModuleJs = ts.transpileModule(ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n').replaceAll('import.meta.env.DEV', '__preview'), { compilerOptions }).outputText;
function loadModule(scope: Record<string, any>, preview: boolean) {
  const exports: Record<string, any> = {};
  new Function('exports', 'React', '__preview', ...Object.keys(scope), fullModuleJs)(exports, React, preview, ...Object.values(scope));
  if (typeof exports.StockTagBuyCancelDialog !== 'function') throw new Error('Real TSX module did not export StockTagBuyCancelDialog');
  return exports.StockTagBuyCancelDialog;
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
function expand(tree: any): any {
  if (Array.isArray(tree)) return tree.map((child, i) => {
    const value = expand(child);
    return React.isValidElement(value) ? React.cloneElement(value, { key: value.key ?? i }) : value;
  });
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function') return expand(tree.type(tree.props));
  return React.cloneElement(tree, tree.props, expand(tree.props?.children));
}
const openedAt = '2026-10-31T16:04:37.456Z';
const originalNote = '  原开仓说明\n与卖出备注独立  ';
const now = Date.parse('2026-11-20T14:30:00.000Z');
function order(patch: Record<string, any> = {}) {
  return { lotId: 11, eventId: 101, stockName: '苹果', symbol: 'AAPL', quantity: 100.125,
    executionPrice: 10.123456, actualTradedAt: openedAt, note: originalNote, minimumQuantity: 0,
    hasSales: false, sellNote: '不得带入的独立卖出备注', ...patch };
}
const queryNames = ['getStockTagPortfolio', 'getStockLotParticipationMatrix', 'getMyStockTagParticipantPortfolio', 'getStockTagPublicPortfolio', 'getStockTagDailySnapshots'] as const;
type Options = { order?: Record<string, any> | null; categoryId?: number; canEdit?: boolean; readOnlyPreview?: boolean; preview?: boolean };
function harness(options: Options = {}) {
  const states: any[] = [], effects: any[] = [], pendingEffects: (() => void)[] = [];
  let cursor = 0, effectCursor = 0, renderCount = 0, effectCount = 0;
  const same = (a: any[] | undefined, b: any[]) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const mutation = { mutate: vi.fn(), isPending: false };
  let mutationOptions: any;
  const invalidates = Object.fromEntries(queryNames.map(name => [name, vi.fn().mockResolvedValue(undefined)]));
  const forbiddenWrite = vi.fn(() => { throw new Error('Cancel must not sell/create/update/void/correct orders or alter cash'); });
  const forbiddenQuery = vi.fn(() => { throw new Error('Cancel must not call real queries, search or exchange'); });
  const ledger = new Proxy({ cancelStockTagBuy: { useMutation: (next: any) => { mutationOptions = next; return mutation; } } } as Record<string, any>, {
    get: (target, name: string) => name in target ? target[name] : { useMutation: forbiddenWrite, useQuery: forbiddenQuery },
  });
  const props: any = { categoryId: 90250, order: order(), canEdit: true, readOnlyPreview: false, ...options, onClose: vi.fn() };
  delete props.preview;
  const scope: Record<string, any> = {
    ...instruments, beijingTradeInputTime,
    useState: (initial: any) => {
      const i = cursor++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], (value: any) => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useEffect: (fn: () => void, deps: any[]) => {
      const i = effectCursor++;
      if (!same(effects[i], deps)) { effects[i] = [...deps]; pendingEffects.push(() => { effectCount++; fn(); }); }
    },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    trpc: {
      useUtils: () => ({ ledger: Object.fromEntries(queryNames.map(name => [name, { invalidate: invalidates[name] }])) }),
      ledger, searchManualStocks: { useQuery: forbiddenQuery }, exchange: { getRate: { useQuery: forbiddenQuery } },
    },
    Button: 'button', Input: 'input', Label: 'label', DialogContent: 'section', DialogHeader: 'header', DialogTitle: 'h2',
    Dialog: (p: any) => p.open ? React.createElement('div', { role: 'dialog' }, p.children) : null,
  };
  const component = loadModule(scope, !!options.preview);
  const renderOnce = () => { cursor = effectCursor = 0; renderCount++; return component(props); };
  const rawRender = () => {
    let tree = renderOnce();
    for (let i = 0; pendingEffects.length && i < 10; i++) { pendingEffects.splice(0).forEach(fn => fn()); tree = renderOnce(); }
    if (pendingEffects.length) throw new Error('Real component effects did not stabilize');
    return tree;
  };
  const render = () => expand(rawRender());
  const field = (name: 'reason' | 'confirm') => {
    const found = nodes(rawRender()).find(node => node.props?.id === `buy-cancel-${name}`);
    if (!found) throw new Error(`Real cancel field missing: ${name}`);
    return found;
  };
  const changeReason = (value: string) => field('reason').props.onChange({ target: { value } });
  const confirm = (checked = true) => field('confirm').props.onChange({ target: { checked } });
  const button = (label: string) => {
    const found = nodes(rawRender()).find(node => node.type === 'button' && text(node).trim() === label);
    if (!found) throw new Error(`Real button missing: ${label}`);
    return found;
  };
  const save = () => button(mutation.isPending ? '撤销中…' : '确认撤销').props.onClick();
  const ready = () => { changeReason('核对原录入，整笔录错'); confirm(); };
  const values = () => ({ reason: field('reason').props.value, confirmed: field('confirm').props.checked });
  const closeExternally = () => { props.order = null; render(); };
  return { props, scope, rawRender, render, field, changeReason, confirm, button, save, ready, values, closeExternally,
    mutation, invalidates, forbiddenWrite, forbiddenQuery, success: () => mutationOptions.onSuccess(),
    error: (message: string) => mutationOptions.onError(new Error(message)), stats: () => ({ renderCount, effectCount }) };
}
function submitScope(patch: Record<string, any> = {}) {
  return { ...instruments, beijingTradeInputTime, categoryId: 90250, order: order(), canEdit: true,
    readOnlyPreview: false, reason: '  原订单整笔录错\n  ', confirmed: true, mutation: { mutate: vi.fn(), isPending: false },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, ...patch };
}
function runSubmit(scope: Record<string, any>, preview = false) { return actual(ast, 'submit', scope, preview)(); }
function expectNoInvalidation(h: ReturnType<typeof harness>) {
  for (const invalidate of Object.values(h.invalidates)) expect(invalidate).not.toHaveBeenCalled();
}
function pageDialog(name: string): ts.JsxSelfClosingElement {
  const matches: ts.JsxSelfClosingElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(pageAst) === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(pageAst); expect(matches).toHaveLength(1); return matches[0];
}
function pageAttribute(node: ts.JsxSelfClosingElement, name: string): ts.Expression {
  const attribute = node.attributes.properties.find(property => ts.isJsxAttribute(property) && property.name.getText(pageAst) === name);
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer || !ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) {
    throw new Error(`Missing real JSX attribute: ${name}`);
  }
  return attribute.initializer.expression;
}
function dialogExpression(node: ts.JsxSelfClosingElement): string {
  let parent: ts.Node = node;
  while (parent.parent && !ts.isJsxExpression(parent)) parent = parent.parent;
  if (!ts.isJsxExpression(parent) || !parent.expression) throw new Error('Dialog must be inside a guarded JSX expression');
  return parent.expression.getText(pageAst);
}

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); });

describe('撤销买入：真实完整TSX离线hook/重渲染', () => {
  it('初次打开reason空、confirmed=false，预览原数量和北京时间且不自动提交', () => {
    const h = harness(); expect(h.values()).toEqual({ reason: '', confirmed: false });
    expect(h.stats().effectCount).toBe(1); expect(h.stats().renderCount).toBeGreaterThanOrEqual(2);
    const tree = h.render(); expect(text(tree)).toContain('苹果 AAPL'); expect(text(tree)).toContain('100.125 股');
    expect(text(tree)).toContain('2026-11-01 00:04'); expect(text(tree)).toContain('北京时间');
    expect(text(tree)).toContain('不是卖出'); expect(text(tree)).toContain('操作日志'); expect(text(tree)).not.toContain(h.props.order.sellNote);
    expect(h.field('confirm').props.type).toBe('checkbox'); expect(h.button('确认撤销').props.disabled).toBe(true);
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
  });
  it('切换订单重新清空原因与确认，不能把上笔确认带给新订单', () => {
    const h = harness(); h.ready(); h.props.order = order({ lotId: 12, eventId: 102, quantity: 30, note: '' });
    expect(h.values()).toEqual({ reason: '', confirmed: false }); expect(h.button('确认撤销').props.disabled).toBe(true);
    h.save(); expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
  });
  it('关闭后重新打开同一个order对象，useEffect重置reason和confirmation', () => {
    const h = harness(); const original = h.props.order; h.ready(); h.button('返回').props.onClick(); h.closeExternally();
    expect(h.render()).toBeNull(); h.props.order = original;
    expect(h.values()).toEqual({ reason: '', confirmed: false }); expect(h.stats().effectCount).toBe(3);
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
  });
  it('同order引用正常重渲染不会重复effect覆盖草稿或确认', () => {
    const h = harness(); h.ready(); const before = h.values(); h.render(); h.render();
    expect(h.values()).toEqual(before); expect(h.stats().effectCount).toBe(1);
  });
  it('确认checkbox和非空原因是双重guard：强行调用disabled提交handler也不写', () => {
    const h = harness(); h.changeReason('完整撤销原因'); expect(h.button('确认撤销').props.disabled).toBe(true); h.save();
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('请先确认'));
    h.confirm(); expect(h.button('确认撤销').props.disabled).toBe(false); h.confirm(false);
    h.save(); expect(h.mutation.mutate).not.toHaveBeenCalled();
    const direct = submitScope({ confirmed: false }); runSubmit(direct); expect(direct.mutation.mutate).not.toHaveBeenCalled();
  });
  it('空/纯空白原因均被真实handler阻止，不仅依赖控件disabled', () => {
    for (const reason of ['', '  ', '\n\t  ']) {
      const h = harness(); h.changeReason(reason); h.confirm(); expect(h.button('确认撤销').props.disabled).toBe(true); h.save();
      expect(h.mutation.mutate, JSON.stringify(reason)).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('撤销原因'));
    }
  });
  it('原因最多300：控件maxLength、直接onChange超长、提取submit都不能绕过', () => {
    const h = harness(); expect(h.field('reason').props.maxLength).toBe(300); h.changeReason('甲'.repeat(301)); h.confirm(); h.save();
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('最多300'));
    const direct = submitScope({ reason: '乙'.repeat(301) }); runSubmit(direct); expect(direct.mutation.mutate).not.toHaveBeenCalled();
    h.changeReason(`  ${'甲'.repeat(300)}\n  `); h.save();
    expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ reason: '甲'.repeat(300) }));
  });
  it('payload只有ledger37/category/原ID/reason/expected，无卖出或金额变动字段，原note不trim', () => {
    const h = harness(); const snapshot = { ...h.props.order }; h.changeReason('  整笔错误录入\n  '); h.confirm(); h.save();
    expect(h.mutation.mutate).toHaveBeenCalledOnce();
    expect(h.mutation.mutate).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, lotId: 11, eventId: 101, reason: '整笔错误录入',
      expected: { quantity: 100.125, executionPrice: 10.123456, actualTradedAt: openedAt, note: originalNote } });
    const payload = h.mutation.mutate.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['categoryId', 'eventId', 'expected', 'ledgerId', 'lotId', 'reason'].sort());
    expect(Object.keys(payload.expected).sort()).toEqual(['quantity', 'executionPrice', 'actualTradedAt', 'note'].sort());
    expect(h.props.order).toEqual(snapshot); expect(h.props.onClose).not.toHaveBeenCalled(); expectNoInvalidation(h);
    expect(h.forbiddenWrite).not.toHaveBeenCalled(); expect(h.forbiddenQuery).not.toHaveBeenCalled();
  });
  it('原snapshot含秒毫秒/空note及股票/数字币精度原样保留，不混入其他订单字段', () => {
    for (const [symbol, quantity, unit] of [['600519.SH', 1.123456789, '股'], ['AAPL', 100.125, '股'], ['CRYPTO:BTC-USDT', 0.00000001, '币']] as const) {
      const h = harness({ order: order({ symbol, quantity, note: '' }) }); h.ready(); h.save();
      expect(text(h.render())).toContain(unit); expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({
        expected: { quantity, executionPrice: 10.123456, actualTradedAt: openedAt, note: '' },
      })); expect(h.mutation.mutate.mock.calls[0][0]).not.toHaveProperty('symbol');
    }
  });
  it('真实AST只注册专用cancelStockTagBuy mutation，无query、通用void/correct或卖出/现金接口', () => {
    const calls: string[] = [];
    function visit(node: ts.Node) { if (ts.isCallExpression(node)) calls.push(node.expression.getText(ast)); ts.forEachChild(node, visit); }
    visit(ast);
    expect(calls.filter(name => name.endsWith('.useMutation'))).toEqual(['trpc.ledger.cancelStockTagBuy.useMutation']);
    expect(calls.filter(name => name.endsWith('.useQuery'))).toEqual([]);
    const h = harness(); h.ready(); h.save(); expect(h.forbiddenWrite).not.toHaveBeenCalled(); expect(h.forbiddenQuery).not.toHaveBeenCalled();
  });
  it('hasSales禁撤销：按钮disabled和真实handler/提取submit都守住原成交', () => {
    const h = harness({ order: order({ hasSales: true }) }); const snapshot = { ...h.props.order }; h.ready();
    expect(h.button('确认撤销').props.disabled).toBe(true); h.save(); expect(h.mutation.mutate).not.toHaveBeenCalled();
    expect(h.scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('已有卖出或结算')); expect(h.props.order).toEqual(snapshot); expectNoInvalidation(h);
    const direct = submitScope({ order: order({ hasSales: true }) }); runSubmit(direct); expect(direct.mutation.mutate).not.toHaveBeenCalled();
  });
  it('所有categoryId/lotId/eventId必须为正safeinteger，非法值不能通过真实submit', () => {
    for (const name of ['categoryId', 'lotId', 'eventId']) for (const value of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '11', null, undefined]) {
      const patch = name === 'categoryId' ? { categoryId: value } : { order: order({ [name]: value }) };
      const direct = submitScope(patch); runSubmit(direct); expect(direct.mutation.mutate, `${name}=${String(value)}`).not.toHaveBeenCalled();
    }
    const direct = submitScope({ categoryId: Number.MAX_SAFE_INTEGER, order: order({ lotId: Number.MAX_SAFE_INTEGER, eventId: Number.MAX_SAFE_INTEGER }) });
    runSubmit(direct); expect(direct.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ ledgerId: 37,
      categoryId: Number.MAX_SAFE_INTEGER, lotId: Number.MAX_SAFE_INTEGER, eventId: Number.MAX_SAFE_INTEGER }));
  });
  it('完整模块category/原ID非法也不能通过UI实际handler写入', () => {
    for (const options of [{ categoryId: 0 }, { categoryId: Number.MAX_SAFE_INTEGER + 1 }, { order: order({ lotId: -1 }) }, { order: order({ eventId: 1.5 }) }]) {
      const h = harness(options); h.ready(); h.save(); expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
    }
  });
  it('原数量和原币价格必须为有限正number，非法snapshot绝不能写', () => {
    for (const name of ['quantity', 'executionPrice']) for (const value of [0, -1, NaN, Infinity, -Infinity, '', '10', null, undefined]) {
      const direct = submitScope({ order: order({ [name]: value }) }); runSubmit(direct);
      expect(direct.mutation.mutate, `${name}=${String(value)}`).not.toHaveBeenCalled();
      expect(direct.toast.error).toHaveBeenCalledWith(expect.stringContaining('原买入信息不完整'));
    }
  });
  it('真实submit验证原日期，不发送Invalid Date或替换为当前时间', () => {
    for (const actualTradedAt of ['', 'not-a-date', '2026-13-01T00:05:00Z', '2026-11-01T99:05:00Z', null, undefined]) {
      const direct = submitScope({ order: order({ actualTradedAt }) }); runSubmit(direct);
      expect(direct.mutation.mutate, String(actualTradedAt)).not.toHaveBeenCalled();
      expect(direct.toast.error).toHaveBeenCalledWith(expect.stringContaining('原买入信息不完整'));
    }
  });
  it('非法原日期完整TSX应安全显示并由submit拒绝，不能在预览格式化时崩溃', () => {
    const h = harness({ order: order({ actualTradedAt: 'not-a-date' }) });
    expect(() => h.render()).not.toThrow(); h.ready(); h.save();
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
  });
  it('readOnlyPreview和DEV完整UI及真实submit只提示，不写正式订单、不刷新', () => {
    for (const options of [{ readOnlyPreview: true }, { preview: true }]) {
      const h = harness(options); h.ready(); expect(h.button('确认撤销').props.disabled).toBe(true); const draft = h.values(); h.save();
      expect(text(h.render())).toContain('不会撤销正式订单'); expect(h.scope.toast.info).toHaveBeenCalledWith(expect.stringContaining('不会撤销正式订单'));
      expect(h.mutation.mutate).not.toHaveBeenCalled(); expect(h.values()).toEqual(draft); expect(h.props.onClose).not.toHaveBeenCalled(); expectNoInvalidation(h);
      const direct = submitScope({ readOnlyPreview: !!options.readOnlyPreview }); runSubmit(direct, !!options.preview);
      expect(direct.mutation.mutate).not.toHaveBeenCalled(); expect(direct.toast.info).toHaveBeenCalledOnce();
    }
  });
  it('无order不渲染Dialog、submit不写；普通成员/AI只读误传order也不泄露', () => {
    const missing = harness({ order: null }); expect(missing.render()).toBeNull(); const direct = submitScope({ order: null });
    runSubmit(direct); expect(direct.mutation.mutate).not.toHaveBeenCalled();
    for (const context of ['普通成员', 'AI只读']) {
      const h = harness({ canEdit: false }); expect(h.render(), context).toBeNull(); expect(renderToStaticMarkup(h.render())).toBe('');
      expect(text(h.render())).not.toContain(originalNote); h.ready(); expect(h.button('确认撤销').props.disabled).toBe(true); h.save();
      expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
      const direct = submitScope({ canEdit: false }); runSubmit(direct); expect(direct.mutation.mutate).not.toHaveBeenCalled();
    }
  });
  it('pending原因/checkbox/返回/提交都disabled，直接字段handler不能污染正在提交的草稿', () => {
    const h = harness(); h.ready(); const draft = h.values(); h.save(); h.mutation.isPending = true;
    for (const name of ['reason', 'confirm'] as const) expect(h.field(name).props.disabled).toBe(true);
    h.changeReason('pending不应写入'); h.confirm(false); expect(h.values()).toEqual(draft);
    for (const label of ['返回', '撤销中…']) { const button = h.button(label); expect(button.props.disabled).toBe(true); button.props.onClick(); }
    h.rawRender().props.onOpenChange(false); h.rawRender().props.onOpenChange(true);
    expect(h.mutation.mutate).toHaveBeenCalledOnce(); expect(h.props.onClose).not.toHaveBeenCalled(); expectNoInvalidation(h);
    const direct = submitScope({ mutation: { mutate: vi.fn(), isPending: true } }); runSubmit(direct); expect(direct.mutation.mutate).not.toHaveBeenCalled();
  });
  it('普通返回及onOpenChange(false)只关闭，open=true不关闭，均不提交或invalidate', () => {
    const h = harness(); h.ready(); h.button('返回').props.onClick(); expect(h.props.onClose).toHaveBeenCalledOnce();
    h.rawRender().props.onOpenChange(true); expect(h.props.onClose).toHaveBeenCalledOnce();
    h.rawRender().props.onOpenChange(false); expect(h.props.onClose).toHaveBeenCalledTimes(2);
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
  });
  it('成功只关闭一次并准确invalidate五个queries一次，使用实际category和ledger37', () => {
    for (const categoryId of [90250, 90251]) {
      const h = harness({ categoryId }); h.ready(); h.save(); expectNoInvalidation(h); expect(h.props.onClose).not.toHaveBeenCalled(); h.success();
      expect(h.props.onClose).toHaveBeenCalledOnce(); expect(h.scope.toast.success).toHaveBeenCalledWith(expect.stringContaining('原记录保留'));
      for (const name of queryNames) {
        expect(h.invalidates[name], name).toHaveBeenCalledOnce(); expect(h.invalidates[name], name).toHaveBeenCalledWith({ ledgerId: 37, categoryId });
      }
      h.closeExternally(); expect(h.render()).toBeNull(); expect(h.mutation.mutate).toHaveBeenCalledOnce();
    }
  });
  it('失败保留原因/确认/order和打开状态、不关闭不刷新，允许重新提交相同snapshot', () => {
    const h = harness(); h.changeReason('  失败后保留的撤销草稿\n  '); h.confirm(); const draft = h.values(); const original = h.props.order;
    const snapshot = { ...original }; h.save(); h.mutation.isPending = true; h.error('原订单已被其他人修改'); h.mutation.isPending = false;
    expect(h.values()).toEqual(draft); expect(h.props.order).toBe(original); expect(h.props.order).toEqual(snapshot); expect(h.render()).not.toBeNull();
    expect(h.scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('原订单已被其他人修改'));
    expect(h.props.onClose).not.toHaveBeenCalled(); expectNoInvalidation(h); h.save();
    expect(h.mutation.mutate).toHaveBeenCalledTimes(2); expect(h.mutation.mutate.mock.calls[1][0]).toEqual(h.mutation.mutate.mock.calls[0][0]);
  });
  it('stockName/原因/原note恶意HTML只经React文本/value处理，不使用dangerouslySetInnerHTML', () => {
    const attack = '<script>alert("unsafe")</script> & <img src=x onerror=alert(1)>';
    const h = harness({ order: order({ stockName: attack, note: attack }) }); h.changeReason(attack); const tree = h.render();
    expect(nodes(tree).some(node => node.props?.dangerouslySetInnerHTML)).toBe(false); expect(source).not.toContain('dangerouslySetInnerHTML');
    const html = renderToStaticMarkup(tree); expect(html).toContain('&lt;script&gt;'); expect(html).toContain('&lt;img'); expect(html).toContain('&amp;');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img '); expect(h.field('reason').props.value).toBe(attack);
    h.confirm(); h.save(); expect(h.mutation.mutate.mock.calls[0][0].expected.note).toBe(attack);
  });
});

describe('StockTagPortfolio只读AST集成：不执行页面查询/HTTP', () => {
  it('canEdit来自真实页面data.canEdit且participantView强制禁写，AI/成员不能误取owner权限', () => {
    for (const participantView of [false, true]) for (const permission of [false, true]) {
      const result = actual(pageAst, 'canEdit', { participantView, data: { canEdit: permission } });
      expect(result).toBe(!participantView && permission);
    }
    expect(actual(pageAst, 'canEdit', { participantView: false, data: undefined })).toBe(false);
    expect(actual(pageAst, 'isLocalHotPreview', {}, true)).toBe(true);
    expect(actual(pageAst, 'isLocalHotPreview', {}, false)).toBe(false);
  });
  it('edit/cancel均只在canEdit&&!participantView&&ledgerId37真实JSX分支挂载，并传原状态/预览参数', () => {
    const editingBuy = order(); const cancelingBuy = order({ lotId: 12, eventId: 102 });
    for (const name of ['StockTagBuyEditDialog', 'StockTagBuyCancelDialog']) {
      const node = pageDialog(name); const expression = dialogExpression(node);
      expect(expression).toContain('canEdit'); expect(expression).toContain('!participantView'); expect(expression).toContain('ledgerId === 37');
      for (const canEdit of [false, true]) for (const participantView of [false, true]) for (const ledgerId of [36, 37, 38]) {
        const scope = { canEdit, participantView, ledgerId, categoryId: 90250, editingBuy, cancelingBuy, isLocalHotPreview: false,
          StockTagBuyEditDialog: 'edit-dialog', StockTagBuyCancelDialog: 'cancel-dialog', setEditingBuy: vi.fn(), setCancelingBuy: vi.fn() };
        const result = evaluate(expression, scope); const allowed = canEdit && !participantView && ledgerId === 37;
        expect(React.isValidElement(result), `${name}:${canEdit}/${participantView}/${ledgerId}`).toBe(allowed);
        if (allowed) {
          expect(result.props.order).toBe(name === 'StockTagBuyEditDialog' ? editingBuy : cancelingBuy);
          expect(result.props.categoryId).toBe(90250); expect(result.props.canEdit).toBe(true); expect(result.props.readOnlyPreview).toBe(false);
        }
      }
      expect(pageAttribute(node, 'readOnlyPreview').getText(pageAst)).toBe('isLocalHotPreview');
    }
  });
  it('真实父onRequestCancel仅owner非participant/ledger37/非热预览能交接原order，不自动mutation', () => {
    const node = pageDialog('StockTagBuyEditDialog'); const callbackSource = pageAttribute(node, 'onRequestCancel').getText(pageAst);
    expect(callbackSource).not.toMatch(/\.mutate\s*\(|\.invalidate\s*\(/);
    const original = order();
    for (const canEdit of [false, true]) for (const participantView of [false, true]) for (const ledgerId of [36, 37]) for (const isLocalHotPreview of [false, true]) {
      const setEditingBuy = vi.fn(), setCancelingBuy = vi.fn();
      const callback = evaluate(callbackSource, { canEdit, participantView, ledgerId, isLocalHotPreview, setEditingBuy, setCancelingBuy }); callback(original);
      const allowed = canEdit && !participantView && ledgerId === 37 && !isLocalHotPreview;
      expect(setEditingBuy.mock.calls.length).toBe(allowed ? 1 : 0); expect(setCancelingBuy.mock.calls.length).toBe(allowed ? 1 : 0);
      if (allowed) { expect(setEditingBuy).toHaveBeenCalledWith(null); expect(setCancelingBuy.mock.calls[0][0]).toBe(original); }
    }
  });
  it('撤销Dialog onClose只清空cancelingBuy，不操作编辑订单/成交/金额', () => {
    const node = pageDialog('StockTagBuyCancelDialog'); const setCancelingBuy = vi.fn();
    const onClose = evaluate(pageAttribute(node, 'onClose').getText(pageAst), { setCancelingBuy }); onClose();
    expect(setCancelingBuy).toHaveBeenCalledOnce(); expect(setCancelingBuy).toHaveBeenCalledWith(null);
    expect(pageAttribute(node, 'order').getText(pageAst)).toBe('cancelingBuy');
  });
});
