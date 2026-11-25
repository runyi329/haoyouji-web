import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as instruments from '../../../shared/portfolio-instruments';

// Execute the complete real TSX module and its actual submit closure, never copied business logic.
// UI primitives/hooks and tRPC are inert: no jsdom, HTTP, router, DB, or real order writes.
const source = readFileSync(new URL('./StockTagBuyEditDialog.tsx', import.meta.url), 'utf8');
const tradeSource = readFileSync(new URL('./StockTagTradeDialog.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('StockTagBuyEditDialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const tradeAst = ts.createSourceFile('StockTagTradeDialog.tsx', tradeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const compilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React };
function declaration(file: ts.SourceFile, name: string): ts.Node {
  let found: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) found = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error(`Missing real frontend function: ${name}`);
  return found;
}
function actual(file: ts.SourceFile, name: string, scope: Record<string, any> = {}, preview = false): any {
  const expression = declaration(file, name).getText(file).replace(/^export\s+(default\s+)?/, '').replaceAll('import.meta.env.DEV', '__preview');
  const js = ts.transpileModule(`const execute = ${expression};`, { compilerOptions }).outputText;
  return new Function('React', '__preview', ...Object.keys(scope), `${js}; return execute;`)(React, preview, ...Object.values(scope));
}
const beijingTradeInputTime = actual(tradeAst, 'beijingTradeInputTime');
const parseTradeInputTime = actual(tradeAst, 'parseTradeInputTime');
// Remove imports only, leaving all real declarations, effects, handlers, and JSX intact.
const fullModuleJs = ts.transpileModule(ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(ast)).join('\n').replaceAll('import.meta.env.DEV', '__preview'), { compilerOptions }).outputText;
function loadModule(scope: Record<string, any>, preview: boolean) {
  const exports: Record<string, any> = {};
  new Function('exports', 'React', '__preview', ...Object.keys(scope), fullModuleJs)(exports, React, preview, ...Object.values(scope));
  if (typeof exports.StockTagBuyEditDialog !== 'function') throw new Error('Real TSX module did not export StockTagBuyEditDialog');
  return exports.StockTagBuyEditDialog;
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
const now = Date.parse('2026-11-20T14:30:00.000Z');
const originalNote = '  原开仓说明\n独立于卖出备注  ';
function order(patch: Record<string, any> = {}) {
  return { lotId: 11, eventId: 101, stockName: '苹果', symbol: 'AAPL', quantity: 100.125,
    executionPrice: 10.123456, actualTradedAt: openedAt, note: originalNote, minimumQuantity: 20,
    sellNote: '独立卖出说明，不可预填开仓字段', ...patch };
}
const queryNames = ['getStockTagPortfolio', 'getStockLotParticipationMatrix', 'getMyStockTagParticipantPortfolio', 'getStockTagPublicPortfolio', 'getStockTagDailySnapshots'] as const;
const fieldNames = ['quantity', 'price', 'time', 'note', 'reason'] as const;
type FieldName = typeof fieldNames[number];
function harness(options: { order?: Record<string, any> | null; categoryId?: number; canEdit?: boolean; readOnlyPreview?: boolean; preview?: boolean; onRequestCancel?: (order: Record<string, any>) => void } = {}) {
  const states: any[] = [], effects: any[] = [], pendingEffects: (() => void)[] = [];
  let cursor = 0, effectCursor = 0, renderCount = 0, effectCount = 0;
  const same = (a: any[] | undefined, b: any[]) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const mutation = { mutate: vi.fn(), isPending: false };
  let mutationOptions: any;
  const invalidates = Object.fromEntries(queryNames.map(name => [name, vi.fn().mockResolvedValue(undefined)]));
  const forbiddenSearch = vi.fn(() => { throw new Error('Buy edit must not search or switch instruments'); });
  const forbiddenCreate = vi.fn(() => { throw new Error('Buy edit must not create/void/correct orders'); });
  const props: any = { categoryId: 90250, order: order(), canEdit: true, readOnlyPreview: false, ...options, onClose: vi.fn() };
  delete props.preview;
  const scope: Record<string, any> = {
    ...instruments, beijingTradeInputTime, parseTradeInputTime,
    StockTagDownsideRulePanel: (props: any) => React.createElement('section', { 'data-downside-panel': true, ...props }),
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
      ledger: {
        updateStockTagBuy: { useMutation: (next: any) => { mutationOptions = next; return mutation; } },
        addStockTagEvent: { useMutation: forbiddenCreate }, correctStockTagEvent: { useMutation: forbiddenCreate },
        updateStockTagSale: { useMutation: forbiddenCreate },
      },
      searchManualStocks: { useQuery: forbiddenSearch }, exchange: { getRate: { useQuery: forbiddenSearch } },
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
  const field = (name: FieldName) => {
    const found = nodes(rawRender()).find(node => node.props?.id === `buy-edit-${name}`);
    if (!found) throw new Error(`Real field missing: ${name}`);
    return found;
  };
  const change = (name: FieldName, value: string) => field(name).props.onChange({ target: { value } });
  const button = (label: string) => {
    const found = nodes(rawRender()).find(node => node.type === 'button' && text(node).trim() === label);
    if (!found) throw new Error(`Real button missing: ${label}`);
    return found;
  };
  const save = () => button(mutation.isPending ? '保存中…' : '保存修改').props.onClick();
  const values = () => Object.fromEntries(fieldNames.map(name => [name, field(name).props.value]));
  const validReason = () => change('reason', '核对原始成交');
  const success = () => mutationOptions.onSuccess();
  const error = (message: string) => mutationOptions.onError(new Error(message));
  const closeExternally = () => { props.order = null; render(); };
  return { props, scope, render, rawRender, field, change, button, save, values, validReason, success, error,
    closeExternally, mutation, invalidates, forbiddenSearch, forbiddenCreate, stats: () => ({ renderCount, effectCount }) };
}
function submitScope(patch: Record<string, any> = {}) {
  return { ...instruments, beijingTradeInputTime, parseTradeInputTime, categoryId: 90250, order: order(), canEdit: true,
    readOnlyPreview: false, quantity: '100.125', price: '10.123456', tradedAt: '2026-11-01T00:04', note: originalNote,
    reason: '  核对原成交\n  ', mutation: { mutate: vi.fn(), isPending: false },
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, ...patch };
}
function runSubmit(scope: Record<string, any>, preview = false) { return actual(ast, 'submit', scope, preview)(); }
function expectNoInvalidation(h: ReturnType<typeof harness>) { for (const invalidate of Object.values(h.invalidates)) expect(invalidate).not.toHaveBeenCalled(); }

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); });

describe('买入订单编辑：真实完整TSX与submit离线回归', () => {
  it('完整模块useEffect重渲染，预填原数量、未换汇原币价、北京时间和独立开仓note', () => {
    const h = harness();
    expect(h.values()).toEqual({ quantity: '100.125', price: '10.123456', time: '2026-11-01T00:04', note: originalNote, reason: '' });
    expect(h.stats().effectCount).toBe(1); expect(h.stats().renderCount).toBeGreaterThanOrEqual(2);
    expect(text(h.render())).toContain('实际买入时间（北京时间）');
    expect(text(h.render())).not.toContain(h.props.order.sellNote);
    expect(h.mutation.mutate).not.toHaveBeenCalled();
  });
  it('取消后二次打开同一个订单对象也重置reason及全部临时草稿', () => {
    const h = harness(); const original = h.props.order;
    h.change('quantity', '222'); h.change('price', '33'); h.change('note', '临时开仓'); h.change('reason', '上一次原因');
    h.button('取消').props.onClick(); h.closeExternally();
    expect(h.render()).toBeNull(); h.props.order = original;
    expect(h.values()).toEqual({ quantity: '100.125', price: '10.123456', time: '2026-11-01T00:04', note: originalNote, reason: '' });
    expect(h.mutation.mutate).not.toHaveBeenCalled();
  });
  it('切换另一原订单时重新预填，空note不能带入旧批次备注或原因', () => {
    const h = harness(); h.change('note', '第一批草稿'); h.change('reason', '第一批原因');
    h.props.order = order({ lotId: 12, eventId: 102, quantity: 30, executionPrice: 99, note: '', actualTradedAt: '2026-11-02T01:05:44Z' });
    expect(h.values()).toEqual({ quantity: '30', price: '99', time: '2026-11-02T09:05', note: '', reason: '' });
  });
  it('同order引用的普通重渲染不会重复effect覆盖编辑草稿', () => {
    const h = harness(); h.change('note', '保留草稿'); h.change('reason', '保留原因');
    h.render(); h.render(); expect(h.values().note).toBe('保留草稿'); expect(h.values().reason).toBe('保留原因');
    expect(h.stats().effectCount).toBe(1);
  });
  it('A股/美股/数字币仅用原标的对应币种和股/币单位，不换算原价格', () => {
    for (const [symbol, prefix, unit] of [['600519.SH', '¥', '股'], ['AAPL', 'US$', '股'], ['CRYPTO:BTC-USDT', 'USDT ', '币']]) {
      const h = harness({ order: order({ symbol }) }); const tree = h.render();
      expect(text(nodes(tree).find(node => node.type === 'label' && node.props.htmlFor === 'buy-edit-price'))).toBe(`买入价格（${prefix}）`);
      expect(text(nodes(tree).find(node => node.type === 'label' && node.props.htmlFor === 'buy-edit-quantity'))).toBe(`原买入数量（${unit}）`);
      expect(h.field('price').props.value).toBe('10.123456');
    }
  });
  it('真实模块固定symbol，无搜索、切市场或创建/作废/更正订单接口', () => {
    const h = harness(); const tree = h.render();
    expect(text(tree)).toContain('苹果 AAPL'); expect(text(tree)).toContain('不会重新开仓');
    expect(nodes(tree).filter(node => node.type === 'select')).toHaveLength(0);
    expect(nodes(tree).filter(node => node.type === 'button').map(node => text(node))).toEqual(['修改', '欠保证金', '取消', '保存修改']);
    expect(nodes(tree).some(node => /search|symbol|market/i.test(String(node.props?.id || node.props?.placeholder || '')))).toBe(false);
    h.validReason(); h.save(); expect(h.mutation.mutate).toHaveBeenCalledOnce();
    expect(h.forbiddenSearch).not.toHaveBeenCalled(); expect(h.forbiddenCreate).not.toHaveBeenCalled();
    const calls: string[] = [];
    function visit(node: ts.Node) { if (ts.isCallExpression(node)) calls.push(node.expression.getText(ast)); ts.forEachChild(node, visit); }
    visit(ast);
    expect(calls.filter(name => name.endsWith('.useMutation'))).toEqual(['trpc.ledger.updateStockTagBuy.useMutation']);
    expect(calls.filter(name => name.endsWith('.useQuery'))).toEqual([]);
  });
  it('已有卖出批次三个成交field disabled，但开仓备注与原因可改并保留成交snapshot', () => {
    const h = harness({ order: order({ hasSales: true }) });
    for (const name of ['quantity', 'price', 'time'] as const) expect(h.field(name).props.disabled).toBe(true);
    for (const name of ['note', 'reason'] as const) expect(h.field(name).props.disabled).toBe(false);
    expect(text(h.render())).toContain('成交信息已锁定'); h.change('note', '  只改开仓\n  '); h.validReason(); h.save();
    expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ quantity: 100.125, executionPrice: 10.123456,
      actualTradedAt: openedAt, note: '  只改开仓\n  ', expected: expect.objectContaining({ note: originalNote }) }));
    expect(h.props.order.sellNote).toBe('独立卖出说明，不可预填开仓字段');
  });
  it('直接执行真实submit不能绕过已卖出成交锁定：数量、价格和时间分别拒绝', () => {
    for (const patch of [{ quantity: '101' }, { price: '12' }, { tradedAt: '2026-11-01T00:05' }]) {
      const scope = submitScope({ order: order({ hasSales: true }), ...patch }); runSubmit(scope);
      expect(scope.mutation.mutate).not.toHaveBeenCalled(); expect(scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('只能修改备注'));
    }
  });
  it('普通取消及Dialog关闭不提交、不刷新，允许onClose各一次', () => {
    const h = harness(); h.change('note', '未保存'); h.button('取消').props.onClick();
    expect(h.props.onClose).toHaveBeenCalledOnce(); h.rawRender().props.onOpenChange(true);
    expect(h.props.onClose).toHaveBeenCalledOnce(); h.rawRender().props.onOpenChange(false);
    expect(h.props.onClose).toHaveBeenCalledTimes(2); expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
  });
  it('pending取消/保存均disabled，直接handler及Dialog关闭也不能取消或重入提交', () => {
    const h = harness(); h.validReason(); h.save(); h.mutation.isPending = true;
    for (const label of ['取消', '保存中…']) { const button = h.button(label); expect(button.props.disabled).toBe(true); button.props.onClick(); }
    h.rawRender().props.onOpenChange(false);
    expect(h.props.onClose).not.toHaveBeenCalled(); expect(h.mutation.mutate).toHaveBeenCalledOnce(); expectNoInvalidation(h);
  });
  it('pending全部五个真实输入field都disabled', () => {
    const h = harness(); h.render(); h.mutation.isPending = true;
    for (const name of fieldNames) expect(h.field(name).props.disabled, name).toBe(true);
  });
  it('pending直接调用五个onChange也有字段guard，不污染正在保存的草稿', () => {
    const h = harness(); h.validReason(); const before = h.values(); h.save(); h.mutation.isPending = true;
    for (const name of fieldNames) h.change(name, `pending不应写入-${name}`);
    expect(h.values()).toEqual(before); expect(h.mutation.mutate).toHaveBeenCalledOnce();
  });
  it('真实submit canEdit=false的禁写守卫不能通过直接执行绕过', () => {
    const scope = submitScope({ canEdit: false }); runSubmit(scope); expect(scope.mutation.mutate).not.toHaveBeenCalled();
  });
  it('无order完整模块不出现Dialog且直接submit也不能写入', () => {
    const h = harness({ order: null }); expect(h.render()).toBeNull();
    const scope = submitScope({ order: null }); runSubmit(scope); expect(scope.mutation.mutate).not.toHaveBeenCalled();
  });
  it('非法categoryId/lotId/eventId含0、负数、小数、NaN、Infinity均被真实submit挡住', () => {
    for (const name of ['categoryId', 'lotId', 'eventId']) for (const value of [0, -1, 1.5, NaN, Infinity]) {
      const patch = name === 'categoryId' ? { categoryId: value } : { order: order({ [name]: value }) };
      const scope = submitScope(patch); runSubmit(scope); expect(scope.mutation.mutate, `${name}=${value}`).not.toHaveBeenCalled();
    }
  });
  it('readOnlyPreview prop真实按钮disabled，直接UI/submit都只提示不mutate', () => {
    const h = harness({ readOnlyPreview: true }); h.validReason(); expect(h.button('保存修改').props.disabled).toBe(true); h.save();
    expect(text(h.render())).toContain('不会保存到正式账目'); expect(h.scope.toast.info).toHaveBeenCalledOnce();
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
    const scope = submitScope({ readOnlyPreview: true }); runSubmit(scope); expect(scope.mutation.mutate).not.toHaveBeenCalled();
    expect(scope.toast.info).toHaveBeenCalledOnce();
  });
  it('import.meta.env.DEV真实完整模块和提取submit都阻止写入但保留预览草稿', () => {
    const h = harness({ preview: true }); h.validReason(); h.change('note', '热预览草稿'); h.save();
    expect(h.button('保存修改').props.disabled).toBe(true); expect(h.field('note').props.value).toBe('热预览草稿');
    expect(h.scope.toast.info).toHaveBeenCalledOnce(); expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
    const scope = submitScope(); runSubmit(scope, true); expect(scope.mutation.mutate).not.toHaveBeenCalled(); expect(scope.toast.info).toHaveBeenCalledOnce();
  });
  it('非法数量：空白、0、负数、非数字及非有限值均不提交', () => {
    for (const quantity of ['', '  ', '0', '-1', 'oops', 'NaN', 'Infinity']) {
      const h = harness(); h.validReason(); h.change('quantity', quantity); h.save();
      expect(h.mutation.mutate, quantity).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalledWith('请输入正确的买入数量');
    }
  });
  it('非法原币价格：空白、0、负数、非数字及非有限值均不提交', () => {
    for (const price of ['', '  ', '0', '-1', 'oops', 'NaN', 'Infinity']) {
      const h = harness(); h.validReason(); h.change('price', price); h.save();
      expect(h.mutation.mutate, price).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalledWith('请输入正确的买入价格');
    }
  });
  it('数字币小于1e-8、九位小数及超大数量不能通过实际field/submit', () => {
    for (const quantity of ['0.000000001', '0.123456789', '1e-9', '10000000000000000']) {
      const h = harness({ order: order({ symbol: 'CRYPTO:BTC-USDT', minimumQuantity: 0 }) }); h.validReason(); h.change('quantity', quantity); h.save();
      expect(h.mutation.mutate, quantity).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('最多8位小数'));
    }
  });
  it('数字币最小1e-8和八位精度按数字原样提交，不丢币、不换币种', () => {
    for (const quantity of ['0.00000001', '0.12345678']) {
      const h = harness({ order: order({ symbol: 'CRYPTO:BTC-USDT', minimumQuantity: 0 }) }); h.validReason(); h.change('quantity', quantity); h.save();
      expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ quantity: Number(quantity), executionPrice: 10.123456 }));
      expect(h.mutation.mutate.mock.calls[0][0]).not.toHaveProperty('symbol');
    }
  });
  it('普通股票不误套数字币八位小数规则', () => {
    const h = harness({ order: order({ minimumQuantity: 0 }) }); h.validReason(); h.change('quantity', '1.123456789'); h.save();
    expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ quantity: 1.123456789 }));
  });
  it('低于已有成员minimumQuantity拒绝，等于分配下限允许修改', () => {
    const h = harness(); h.validReason(); h.change('quantity', '19.99999999'); h.save();
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('不能小于已有成员份额'));
    h.change('quantity', '20'); h.save(); expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ quantity: 20 }));
  });
  it('非法日期格式/无效月份/时刻拒绝，不能发送Invalid Date或默认今天', () => {
    for (const tradedAt of ['', 'not-a-date', '2026-11-01', '2026-11-01T00:05:00Z', '2026-13-01T00:05', '2026-11-01T99:05']) {
      const h = harness(); h.validReason(); h.change('time', tradedAt); h.save();
      expect(h.mutation.mutate, tradedAt).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalledWith('请选择有效的买入时间');
    }
  });
  it('北京时间未来一分钟拒绝；等于固定当前时刻允许', () => {
    const h = harness(); h.validReason(); h.change('time', '2026-11-20T22:31'); h.save();
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalledWith('买入时间不能晚于当前时间');
    h.change('time', '2026-11-20T22:30'); h.save();
    expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ actualTradedAt: '2026-11-20T14:30:00.000Z' }));
  });
  it('空原因、空格和纯换行原因均拒绝，不能仅靠按钮外观绕过', () => {
    for (const reason of ['', '  ', '\n\t  ']) {
      const h = harness(); h.change('reason', reason); h.save(); expect(h.mutation.mutate).not.toHaveBeenCalled();
      expect(h.scope.toast.error).toHaveBeenCalledWith('请填写修改原因');
    }
  });
  it('payload仅原订单编辑业务字段和expected原snapshot，不带symbol/type/新开仓或份额字段', () => {
    const h = harness(); const before = { ...h.props.order };
    h.change('quantity', '150.25'); h.change('price', '11.75'); h.change('time', '2026-11-02T01:30');
    h.change('note', '  修改后的独立开仓备注\n  '); h.change('reason', '  核对真实原订单\n  '); h.save();
    expect(h.mutation.mutate).toHaveBeenCalledOnce();
    expect(h.mutation.mutate).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250, lotId: 11, eventId: 101,
      quantity: 150.25, executionPrice: 11.75, actualTradedAt: '2026-11-01T17:30:00.000Z', note: '  修改后的独立开仓备注\n  ', reason: '核对真实原订单',
      expected: { quantity: 100.125, executionPrice: 10.123456, actualTradedAt: openedAt, note: originalNote } });
    expect(h.props.order).toEqual(before); expect(h.forbiddenCreate).not.toHaveBeenCalled();
  });
  it('时间未动保留原秒钟和毫秒，不被datetime-local分钟精度截断', () => {
    const h = harness(); h.validReason(); h.change('note', '只改说明'); h.save();
    expect(h.field('time').props.value).toBe('2026-11-01T00:04');
    expect(h.mutation.mutate.mock.calls[0][0].actualTradedAt).toBe('2026-10-31T16:04:37.456Z');
  });
  it('三个市场改time一律按Beijing +08:00跨UTC日期，不依赖机器当地时区', () => {
    for (const symbol of ['600519.SH', 'AAPL', 'CRYPTO:BTC-USDT']) {
      const h = harness({ order: order({ symbol }) }); h.validReason(); h.change('time', '2026-11-02T00:15'); h.save();
      expect(h.mutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ actualTradedAt: '2026-11-01T16:15:00.000Z' }));
    }
  });
  it('成功只关闭一次、提示并准确invalidate全部五个queries一次，带ledger37/category', () => {
    const h = harness(); h.validReason(); h.save(); expectNoInvalidation(h); expect(h.props.onClose).not.toHaveBeenCalled(); h.success();
    expect(h.props.onClose).toHaveBeenCalledOnce(); expect(h.scope.toast.success).toHaveBeenCalledWith('买入订单已修改，原编号及成员份额保留');
    for (const name of queryNames) {
      expect(h.invalidates[name], name).toHaveBeenCalledOnce();
      expect(h.invalidates[name], name).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 90250 });
    }
    h.closeExternally(); expect(h.render()).toBeNull(); expect(h.mutation.mutate).toHaveBeenCalledOnce();
  });
  it('onError保留全部草稿/打开状态和原snapshot，不关闭、不invalidate，允许再次提交', () => {
    const h = harness(); h.change('quantity', '130'); h.change('price', '12'); h.change('time', '2026-11-02T00:15');
    h.change('note', '  失败草稿\n  '); h.change('reason', '失败原因'); const draft = h.values(); const snapshot = { ...h.props.order };
    h.save(); h.mutation.isPending = true; h.error('离线并发冲突'); h.mutation.isPending = false;
    expect(h.values()).toEqual(draft); expect(h.props.order).toEqual(snapshot); expect(h.render()).not.toBeNull();
    expect(h.scope.toast.error).toHaveBeenCalledWith('修改失败：离线并发冲突'); expect(h.props.onClose).not.toHaveBeenCalled(); expectNoInvalidation(h);
    h.save(); expect(h.mutation.mutate).toHaveBeenCalledTimes(2); expect(h.mutation.mutate.mock.calls[1][0]).toEqual(h.mutation.mutate.mock.calls[0][0]);
  });
  it('普通成员/AI只读上下文即使误传order也不出现弹窗或秘密note，并守住隐藏handler', () => {
    // Scope is deliberately this component only; parent owns the actual page/AI entrypoint integration tests.
    for (const context of ['普通成员', 'AI只读']) {
      const h = harness({ canEdit: false }); const tree = h.render();
      expect(tree, context).toBeNull(); expect(renderToStaticMarkup(tree)).toBe('');
      expect(text(tree)).not.toContain(originalNote); expect(h.rawRender().props.open).toBe(false);
      h.validReason(); expect(h.button('保存修改').props.disabled).toBe(true); h.save(); expect(h.mutation.mutate).not.toHaveBeenCalled();
    }
  });
  it('stockName、开仓note和reason恶意HTML通过React文本/value转义，绝不dangerouslySetInnerHTML', () => {
    const attack = '<script>alert("unsafe")</script> & <img src=x onerror=alert(1)>';
    const h = harness({ order: order({ stockName: attack, note: `  第一行\n${attack}  ` }) }); h.change('reason', attack); const tree = h.render();
    expect(nodes(tree).some(node => node.props?.dangerouslySetInnerHTML)).toBe(false);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('&lt;script&gt;'); expect(html).toContain('&lt;img'); expect(html).toContain('&amp;');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img ');
    expect(h.field('note').props.value).toBe(`  第一行\n${attack}  `);
  });
  it('备注3000字符真实onChange截断且清空可提交；原因控件声明300字符限制', () => {
    const h = harness(); expect(h.field('note').props.maxLength).toBe(3000); expect(h.field('reason').props.maxLength).toBe(300);
    h.change('note', ` \n${'甲'.repeat(3100)}`); expect(h.field('note').props.value).toBe(` \n${'甲'.repeat(2998)}`);
    h.change('note', ''); h.validReason(); h.save(); expect(h.mutation.mutate.mock.calls[0][0].note).toBe('');
    expect(h.mutation.mutate.mock.calls[0][0].expected.note).toBe(originalNote);
  });
});

describe('买入编辑可选撤销入口：只交接原order，绝不代写', () => {
  const entry = (h: ReturnType<typeof harness>) => nodes(h.rawRender()).find(node => node.props?.['data-buy-cancel-entry'] !== undefined);
  it('不传callback时保持原有取消/保存两个按钮且没有撤销入口', () => {
    const h = harness();
    expect(entry(h)).toBeUndefined();
    expect(nodes(h.render()).filter(node => node.type === 'button').map(text)).toEqual(['修改', '欠保证金', '取消', '保存修改']);
    expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
  });
  it('callback入口点击把同一个原order而非编辑草稿交给父，不提交/关闭/刷新', () => {
    const onRequestCancel = vi.fn(); const h = harness({ onRequestCancel }); const original = h.props.order;
    h.change('quantity', '777'); h.change('price', '66'); h.change('time', '2026-11-02T00:15');
    h.change('note', '未保存的编辑说明'); h.change('reason', '未保存修改原因'); const draft = h.values();
    const button = entry(h); expect(button).toBeDefined(); expect(text(button)).toContain('整笔录错'); expect(text(button)).toContain('撤销录入');
    expect(button.props.disabled).toBe(false); button.props.onClick();
    expect(onRequestCancel).toHaveBeenCalledOnce(); expect(onRequestCancel.mock.calls[0][0]).toBe(original);
    expect(onRequestCancel.mock.calls[0][0]).toEqual(order()); expect(h.values()).toEqual(draft);
    expect(h.props.onClose).not.toHaveBeenCalled(); expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
    expect(h.forbiddenCreate).not.toHaveBeenCalled(); expect(h.forbiddenSearch).not.toHaveBeenCalled();
  });
  it('canEdit=false完整Dialog隐藏，即使强行点击真实入口handler也不能交接', () => {
    const onRequestCancel = vi.fn(); const h = harness({ canEdit: false, onRequestCancel });
    expect(h.render()).toBeNull(); expect(renderToStaticMarkup(h.render())).toBe('');
    expect(entry(h).props.disabled).toBe(true); entry(h).props.onClick();
    expect(onRequestCancel).not.toHaveBeenCalled(); expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
  });
  it('readOnlyPreview和DEV入口禁用，真实handler不能交接或写入', () => {
    for (const options of [{ readOnlyPreview: true }, { preview: true }]) {
      const onRequestCancel = vi.fn(); const h = harness({ ...options, onRequestCancel });
      expect(entry(h).props.disabled).toBe(true); entry(h).props.onClick();
      expect(onRequestCancel).not.toHaveBeenCalled(); expect(h.scope.toast.info).toHaveBeenCalledWith(expect.stringContaining('不会撤销正式订单'));
      expect(h.mutation.mutate).not.toHaveBeenCalled(); expect(h.props.onClose).not.toHaveBeenCalled(); expectNoInvalidation(h);
    }
  });
  it('pending入口disabled，直接点击也不跳走、不重入、不丢草稿', () => {
    const onRequestCancel = vi.fn(); const h = harness({ onRequestCancel }); h.validReason(); h.save(); const draft = h.values();
    h.mutation.isPending = true; expect(entry(h).props.disabled).toBe(true); entry(h).props.onClick();
    expect(onRequestCancel).not.toHaveBeenCalled(); expect(h.props.onClose).not.toHaveBeenCalled();
    expect(h.mutation.mutate).toHaveBeenCalledOnce(); expect(h.values()).toEqual(draft); expectNoInvalidation(h);
  });
  it('hasSales不渲染入口，并挡住变化前保留的真实闭包入口', () => {
    const onRequestCancel = vi.fn(); const h = harness({ onRequestCancel }); const staleEntry = entry(h);
    h.props.order.hasSales = true; expect(entry(h)).toBeUndefined(); staleEntry.props.onClick();
    expect(onRequestCancel).not.toHaveBeenCalled(); expect(h.mutation.mutate).not.toHaveBeenCalled(); expectNoInvalidation(h);
    const direct = submitScope({ order: order({ hasSales: true }), onRequestCancel });
    actual(ast, 'requestCancel', direct)(); expect(onRequestCancel).not.toHaveBeenCalled();
  });
  it('真实requestCancel没有order/callback也安全退出，绝不代替父执行撤销mutation', () => {
    for (const patch of [{ order: null, onRequestCancel: vi.fn() }, { onRequestCancel: undefined }]) {
      const scope = submitScope(patch); actual(ast, 'requestCancel', scope)();
      expect(scope.mutation.mutate).not.toHaveBeenCalled(); if (scope.onRequestCancel) expect(scope.onRequestCancel).not.toHaveBeenCalled();
    }
  });
  it('传callback不放宽原金额/日期/成员下限/币精度/hasSales规则，也不把保存失败自动转成撤销', () => {
    const cases = [
      { field: 'quantity', value: '0', patch: {} },
      { field: 'price', value: '-1', patch: {} },
      { field: 'time', value: '2026-11-20T22:31', patch: {} },
      { field: 'quantity', value: '19.999', patch: {} },
      { field: 'quantity', value: '0.123456789', patch: { symbol: 'CRYPTO:BTC-USDT', minimumQuantity: 0 } },
    ] as const;
    for (const { field, value, patch } of cases) {
      const onRequestCancel = vi.fn(); const h = harness({ order: order(patch), onRequestCancel }); h.validReason(); h.change(field, value); h.save();
      expect(h.mutation.mutate, `${field}=${value}`).not.toHaveBeenCalled(); expect(onRequestCancel).not.toHaveBeenCalled(); expectNoInvalidation(h);
    }
    const onRequestCancel = vi.fn(); const scope = submitScope({ order: order({ hasSales: true }), quantity: '101', onRequestCancel });
    runSubmit(scope); expect(scope.mutation.mutate).not.toHaveBeenCalled(); expect(onRequestCancel).not.toHaveBeenCalled();
    expect(scope.toast.error).toHaveBeenCalledWith(expect.stringContaining('只能修改备注'));
  });
});

describe('修改/欠保证金页签隔离', () => {
  it('每次打开默认左修改，切右不调用原订单mutation且不要求修改原因', () => {
    const h = harness();
    expect(h.button('修改').props['aria-selected']).toBe(true);
    expect(h.button('欠保证金').props['aria-selected']).toBe(false);
    h.change('note', '左侧未保存草稿'); h.button('欠保证金').props.onClick();
    expect(h.button('欠保证金').props['aria-selected']).toBe(true);
    expect(nodes(h.rawRender()).some(node => node.props?.id === 'buy-edit-reason')).toBe(false);
    expect(nodes(h.render()).some(node => node.props?.['data-downside-panel'])).toBe(true);
    expect(h.mutation.mutate).not.toHaveBeenCalled(); h.button('修改').props.onClick();
    expect(h.field('note').props.value).toBe('左侧未保存草稿'); expect(h.field('reason').props.value).toBe('');
    const original = h.props.order; h.closeExternally(); h.props.order = original;
    expect(h.button('修改').props['aria-selected']).toBe(true);
  });
  it('canEdit=false不出现右tab或规则组件，代看与非R1也隐藏右tab', () => {
    const member = harness({ canEdit: false }); expect(member.render()).toBeNull();
    expect(nodes(member.rawRender()).some(node => node.props?.id === 'stock-buy-downside-tab')).toBe(false);
    for (const patch of [{ isViewingAs: true }, { allowDownside: false }]) {
      const h = harness(); Object.assign(h.props, patch);
      expect(nodes(h.render()).some(node => node.props?.id === 'stock-buy-downside-tab')).toBe(false);
      expect(nodes(h.render()).some(node => node.props?.['data-downside-panel'])).toBe(false);
    }
  });
  it('DEV仍禁止原订单保存，仅显式预览回调交给右组件', () => {
    const h = harness({ preview: true, readOnlyPreview: true });
    const onPreviewDownsideChange = vi.fn(); Object.assign(h.props, { onPreviewDownsideChange, previewDownsideRule: { lotId: 11, version: 2, enabled: true, thresholdPrice: 10, downsidePercent: 0, startDate: '2026-11-01' } });
    h.validReason(); h.save(); expect(h.mutation.mutate).not.toHaveBeenCalled(); h.button('欠保证金').props.onClick();
    const panel = nodes(h.render()).find(node => node.props?.['data-downside-panel']);
    expect(panel.props.readOnlyPreview).toBe(true); expect(panel.props.onPreviewDownsideChange).toBe(onPreviewDownsideChange);
    expect(panel.props.previewDownsideRule.downsidePercent).toBe(0); expect(onPreviewDownsideChange).not.toHaveBeenCalled();
    expect(panel.props.previewDownsideRule.startDate).toBe('2026-11-01');
    const draft = { enabled: true, thresholdPrice: 10, downsidePercent: 0, startDate: '2026-11-02', expectedVersion: 2 };
    panel.props.onPreviewDownsideChange(11, draft);
    expect(onPreviewDownsideChange).toHaveBeenCalledWith(11, draft); expect(h.mutation.mutate).not.toHaveBeenCalled();
  });
  it('右规则保存pending阻止tab切换及Dialog关闭', () => {
    const h = harness(); h.button('欠保证金').props.onClick();
    nodes(h.render()).find(node => node.props?.['data-downside-panel']).props.onPendingChange(true);
    expect(h.button('修改').props.disabled).toBe(true); h.button('修改').props.onClick();
    expect(h.button('欠保证金').props['aria-selected']).toBe(true); h.rawRender().props.onOpenChange(false);
    expect(h.props.onClose).not.toHaveBeenCalled(); expect(h.mutation.mutate).not.toHaveBeenCalled();
  });
});
