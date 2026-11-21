import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as instruments from '../shared/portfolio-instruments';

// Execute actual TSX expressions only. No backend, scanner, HTTP or DB imports.
const source = readFileSync(new URL('../client/src/pages/StockTagPortfolio.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('actual.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function execute(name: string, scope: Record<string, any> = {}) {
  let expression = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) expression = node.initializer.getText(ast);
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node.getText(ast).replace(/^export\s+(default\s+)?/, '');
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!expression) throw new Error(`Actual expression missing: ${name}`);
  const js = ts.transpileModule(`const actual = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function('React', ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
}
const symbol = 'CRYPTO:UNI-USDT';
const position = { symbol, stockName: 'Uniswap', currency: 'USDT', marketPrice: 4.287, hasPrice: true, lots: [{ id: 29, quantity: 1561.47, unitCost: 4.238, openedAt: '2026-11-21T04:08:00Z' }] };
function base(rate: number | null = null) {
  const scope: Record<string, any> = { ...instruments, instrumentCurrency: instruments.portfolioCurrency, usdCnyRate: 7, usdtCnyRate: rate };
  scope.money = execute('money', scope);
  scope.signedMoney = execute('signedMoney', scope);
  scope.formatQuantity = execute('formatQuantity', scope);
  scope.toCny = execute('toCny', scope);
  scope.CnyUsdValue = execute('CnyUsdValue', scope);
  return scope;
}
function display(value: number | null | undefined, native: number | null | undefined, rate: number | null = null, extra: Record<string, any> = {}) {
  const scope = base(rate);
  const tree = scope.CnyUsdValue({ value, usdValue: native, nativeCurrency: 'USDT', mainClassName: 'main', subClassName: 'sub', ...extra });
  return renderToStaticMarkup(tree);
}
function holding(rate: number | null = null, member = false, marketPrice: number | null = 4.287) {
  const scope = base(rate);
  const myHoldingByLotId = new Map([[29, { quantity: 100, costValue: 423.8 }]]);
  const rows = execute('allTagHoldingLots', { ...scope, tagPositions: [{ ...position, marketPrice }], myHoldingByLotId });
  const tagHoldingLots = rows;
  const summary = { costValue: null, marketValue: null, floatingPnl: null };
  const result = execute(member ? 'memberHoldingSummary' : 'accountHoldingSummary', { ...scope, participantView: member, tagHoldingLots, hasCrypto: true, summary });
  return { scope, rows, result, detail: result.details[0] };
}

describe('保存后数字币价格与独立人民币汇率显示（真实TSX）', () => {
  it.each([4.238, 4.287, 0])('缺FX时原币%j清晰主显示且不把它伪称人民币', native => {
    const html = display(null, native);
    expect(html).toMatch(/class="main\b[^"]*"[^>]*>USDT /);
    expect(html).toContain('人民币汇率暂不可用');
    expect(html).not.toContain('¥');
    expect(html).not.toMatch(/class="main"[^>]*>—/);
  });
  it('成员hideCurrency模式缺FX仍明确标注原币单位', () => {
    expect(display(null, 4.238, null, { hideCurrency: true })).toContain('USDT 4.24');
  });
  it.each([null, undefined, NaN, Infinity, -Infinity])('原币值%j不可用时不造价格或造零', native => {
    const html = display(null, native);
    expect(html).toMatch(/class="main"[^>]*>—/);
    expect(html).not.toContain('USDT 0.00');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
  it('有效FX保留原人民币主行和精确USDT副行', () => {
    const html = display(29.03186, 4.238, 6.85);
    expect(html).toMatch(/class="main"[^>]*>¥29.03/);
    expect(html).toContain('USDT 4.24');
    expect(html).not.toContain('暂不可用');
  });
  it('FX有效但CNY值未知不误报汇率缺失', () => {
    const html = display(null, 4.238, 6.85);
    expect(html).toContain('USDT 4.24');
    expect(html).toContain('人民币参考暂不可用');
    expect(html).not.toContain('人民币汇率暂不可用');
  });
  it('原USDT负盈亏保持符号，零不变未知', () => {
    expect(display(null, -0.049, null, { signed: true })).toContain('−USDT 0.05');
    expect(display(null, 0, null, { signed: true })).toContain('USDT 0.00');
  });
  it.each(['CNY', 'USD'])('%s展示不被USDT降级逻辑改变', currency => {
    const scope = base();
    const html = renderToStaticMarkup(scope.CnyUsdValue({ value: 70, usdValue: 10, nativeCurrency: currency, mainClassName: 'main', subClassName: 'sub' }));
    expect(html).toMatch(/class="main"[^>]*>¥70.00/);
    expect(html).not.toContain('暂不可用');
    expect(html.includes('$10.00')).toBe(currency === 'USD');
  });
  it.each([false, true])('member=%s详情保留原币成交价与实时价，CNY汇总仍未知', member => {
    const h = holding(null, member);
    expect(h.rows[0].nativeUnitCost).toBe(4.238);
    expect(h.rows[0].nativeMarketPrice).toBe(4.287);
    expect(h.rows[0].lot.unitCost).toBeNull();
    expect(h.rows[0].marketPrice).toBeNull();
    expect(h.result.purchaseValue).toBeNull();
    expect(h.result.marketValue).toBeNull();
    expect(h.result.floatingPnl).toBeNull();
    expect(h.detail.nativeCurrency).toBe('USDT');
    expect(h.detail.nativeEntryPrice).toBeCloseTo(4.238, 8);
    expect(h.detail.nativeCurrentPrice).toBe(4.287);
    expect(h.detail.nativePurchaseValue).toBeCloseTo(h.detail.quantity * 4.238, 8);
    expect(h.detail.nativeCurrentValue).toBeCloseTo(h.detail.quantity * 4.287, 8);
    expect(h.detail.nativeFloatingPnl).toBeCloseTo((member ? -1 : 1) * h.detail.quantity * (4.287 - 4.238), 8);
  });
  it.each([false, true])('member=%s缺行情保持原买入价但当前值与盈亏不补历史参考价', member => {
    const h = holding(null, member, null);
    expect(h.detail.nativeEntryPrice).toBeCloseTo(4.238, 8);
    expect(h.detail.nativeCurrentPrice).toBeNull();
    expect(h.detail.nativeCurrentValue).toBeNull();
    expect(h.detail.nativeFloatingPnl).toBeNull();
  });
  it.each([false, true])('member=%s真实推导缺FX显示USDT算式且不误报行情缺失', member => {
    const h = holding(null, member);
    const render = execute('renderHoldingDerivationDetail', h.scope);
    const html = renderToStaticMarkup(render(h.detail, member, null));
    expect(html).toContain('USDT 4.24');
    expect(html).toContain('USDT 4.29');
    expect(html).toContain('人民币汇率暂不可用');
    expect(html).not.toContain('待报价');
    expect(html).not.toContain('待更新');
    expect(html).not.toContain('¥');
    expect(html).toContain(member ? '−USDT 4.90' : '+USDT 76.51');
  });
  it.each([false, true])('member=%s真实推导缺行情不拿成本或参考价冒充当前价', member => {
    const h = holding(null, member, null);
    const render = execute('renderHoldingDerivationDetail', h.scope);
    const html = renderToStaticMarkup(render(h.detail, member, null));
    expect(html).toContain('USDT 4.24');
    expect(html).toContain('待报价');
    expect(html).toContain('待更新');
    expect(html).not.toContain('USDT 4.29');
  });
  it('真实推导有效FX保持CNY并附原USDT明细', () => {
    const h = holding(6.85);
    const render = execute('renderHoldingDerivationDetail', h.scope);
    const html = renderToStaticMarkup(render(h.detail, false, 6.85));
    expect(html).toContain('¥29.03');
    expect(html).toContain('原币明细 · USDT');
    expect(html).toContain('USDT 4.24');
    expect(html).not.toContain('暂不可用');
  });
  it.each(['CNY', 'USD'])('%s推导延续原CNY显示，不新增USDT字段展示', nativeCurrency => {
    const scope = base();
    const render = execute('renderHoldingDerivationDetail', scope);
    const html = renderToStaticMarkup(render({ positionNumber: '01', symbol: nativeCurrency === 'CNY' ? '600519.SH' : 'AAPL', stockName: '证券', nativeCurrency, quantity: 1, entryPrice: 70, purchaseValue: 70, currentPrice: 77, currentValue: 77, floatingPnl: 7 }, false, null));
    expect(html).toContain('¥70.00');
    expect(html).toContain('¥77.00');
    expect(html).not.toContain('USDT');
    expect(html).not.toContain('暂不可用');
  });
  it('缺FX的手机降级值与说明不继承nowrap', () => {
    const html = display(null, 4.238, null, { mainClassName: 'main whitespace-nowrap', subClassName: 'sub whitespace-nowrap' });
    expect(html).not.toContain('whitespace-nowrap');
    expect(html).toContain('whitespace-normal');
    expect(html).toContain('break-words');
  });
  it('真实换汇函数缺FX不拿USDT当USD，不动账务算法', () => {
    const scope = base();
    expect(scope.toCny(4.238, 'USDT')).toBeNull();
    expect(scope.toCny(4.238, 'USD')).toBeCloseTo(29.666);
    expect(scope.toCny(4.238, 'CNY')).toBe(4.238);
  });
});
