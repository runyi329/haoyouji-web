import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as instruments from '../shared/portfolio-instruments';

// Select actual TSX nodes and execute only pure expressions; never load page/backend modules.
const source = readFileSync(new URL('../client/src/pages/StockTagPortfolio.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('actual-StockTagPortfolio.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function select(predicate: (node: ts.Node) => boolean, root: ts.Node = ast): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root); return found;
}
function declaration(name: string): ts.VariableDeclaration {
  const node = select(node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)[0];
  if (!node || !ts.isVariableDeclaration(node) || !node.initializer) throw new Error(`Missing actual declaration: ${name}`);
  return node;
}
function execute(node: ts.Node, scope: Record<string, any>) {
  const code = ts.transpileModule(`const result = (${node.getText(ast)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function('React', ...Object.keys(scope), `${code}; return result;`)(React, ...Object.values(scope));
}
const rowNode = declaration('stockNameProfitRows').initializer!;
const fullname = 'ROBINHOOD MARKETS INC';
const tagHoldingLots = [
  { stockName: fullname, symbol: 'HOOD', lot: { id: 11, quantity: 15, initialQuantity: 15 },
    accountHolding: { quantity: 6, costValue: 432, floatingPnl: 43.2 }, myHolding: { quantity: 2 } },
  { stockName: fullname, symbol: 'HOOD', lot: { id: 12, quantity: 4 },
    accountHolding: { quantity: 4, costValue: 288, floatingPnl: 28.8 } },
];
const accountRealizedLots = [
  { stockName: fullname, symbol: 'HOOD', lotId: 11, quantity: 15, soldQuantity: 5,
    buyValue: 50, sellValue: 48, accountNetProfit: -3, realizedPnl: 999 },
  { stockName: '贵州茅台', symbol: '600519.SH', lotId: 13, quantity: 999, soldQuantity: 2,
    buyValue: 2000, sellValue: 2100, accountNetProfit: 80 },
];
function toCny(value: number | null, currency: string) {
  if (value === null) return null;
  const multiplier = instruments.portfolioCashMultiplier(currency, 7.2, 7.1);
  return multiplier === null ? null : value * multiplier;
}
function wire(patch: Record<string, any> = {}) {
  return execute(rowNode, { participantView: false, canEdit: true, tagHoldingLots, accountRealizedLots,
    instrumentCurrency: instruments.portfolioCurrency, toCny, ...patch });
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function summaryExpression(): ts.JsxExpression {
  const calls = select(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'StockNameProfitSummary');
  expect(calls).toHaveLength(1);
  let current: ts.Node = calls[0];
  while (!ts.isJsxExpression(current)) {
    if (!current.parent) throw new Error('Summary is missing a JSX permission expression');
    current = current.parent;
  }
  return current as ts.JsxExpression;
}

describe('股票市值股数数据链路：真实页面AST完全离线', () => {
  it('holding只传账户真实剩余quantity，不传原lot总量或本人获配量', () => {
    const rows = wire().filter((row: any) => row.state === 'holding');
    expect(rows.map((row: any) => row.quantity)).toEqual([6, 4]);
    expect(rows.map((row: any) => row.stockName)).toEqual([fullname, fullname]);
    expect(rows.map((row: any) => row.openingValue)).toEqual([432, 288]);
    expect(rows.map((row: any) => row.pnl)).toEqual([43.2, 28.8]);
  });
  it('closed只传实际soldQuantity，不用原lot.quantity；买入金额和含手续费账户Pnl按原汇率', () => {
    const rows = wire().filter((row: any) => row.state === 'closed');
    expect(rows.map((row: any) => row.quantity)).toEqual([5, 2]);
    expect(rows[0]).toEqual(expect.objectContaining({ stockName: fullname, symbol: 'HOOD', lotId: 11,
      openingValue: 360, pnl: -21.6 }));
    expect(rows[1]).toEqual(expect.objectContaining({ openingValue: 2000, pnl: 80 }));
  });
  it('部分卖出同lot分两个state且只各一次，总剩余+已卖数量15，不复活原量', () => {
    const rows = wire();
    const sameStock = rows.filter((row: any) => row.symbol === 'HOOD');
    expect(sameStock.map((row: any) => [row.lotId, row.state, row.quantity])).toEqual([
      [11, 'holding', 6], [12, 'holding', 4], [11, 'closed', 5],
    ]);
    expect(sameStock.reduce((sum: number, row: any) => sum + row.quantity, 0)).toBe(15);
  });
  it.each([null, undefined, NaN, Infinity, -1])('未知/非法账户quantity %s不在wiring层静默补0', quantity => {
    const rows = wire({ tagHoldingLots: [{ ...tagHoldingLots[0], accountHolding: { ...tagHoldingLots[0].accountHolding, quantity } }] });
    expect(rows[0].quantity).not.toBe(0);
    expect(rows[0].openingValue).toBe(432); expect(rows[0].pnl).toBe(43.2);
  });
  it.each([null, undefined, NaN, Infinity, -1])('未知/非法soldQuantity %s不拿lot.quantity或0代替', soldQuantity => {
    const rows = wire({ accountRealizedLots: [{ ...accountRealizedLots[0], soldQuantity }] });
    const closed = rows.find((row: any) => row.state === 'closed');
    expect(closed.quantity).not.toBe(0); expect(closed.quantity).not.toBe(15);
    expect(closed.openingValue).toBe(360); expect(closed.pnl).toBeCloseTo(-21.6);
  });
  it('合法零数量保留零；缺价buyValue/Pnl仍null而非0', () => {
    const rows = wire({ accountRealizedLots: [{ ...accountRealizedLots[0], soldQuantity: 0, buyValue: null, accountNetProfit: undefined }] });
    const closed = rows.find((row: any) => row.state === 'closed');
    expect(closed.quantity).toBe(0); expect(closed.openingValue).toBeNull(); expect(closed.pnl).toBeNull();
  });
  it('A股与crypto继续全名并使用原币汇率，最小币quantity不截零', () => {
    const rows = wire({ accountRealizedLots: [{ ...accountRealizedLots[0], stockName: '比特币', symbol: 'CRYPTO:BTC-USDT', soldQuantity: 1e-8 }] });
    const closed = rows.find((row: any) => row.state === 'closed');
    expect(closed.stockName).toBe('比特币'); expect(closed.quantity).toBe(1e-8);
    expect(closed.openingValue).toBe(355); expect(closed.pnl).toBeCloseTo(-21.3);
  });
  it('冻结实际输入可执行，原lot.quantity、money、全称都未被改写', () => {
    const holdings = freeze(structuredClone(tagHoldingLots)), closed = freeze(structuredClone(accountRealizedLots));
    const before = JSON.stringify({ holdings, closed });
    expect(() => wire({ tagHoldingLots: holdings, accountRealizedLots: closed })).not.toThrow();
    expect(JSON.stringify({ holdings, closed })).toBe(before);
    expect(holdings[0].lot.quantity).toBe(15); expect(closed[0].quantity).toBe(15);
  });
  it.each([{ canEdit: false, participantView: false }, { canEdit: true, participantView: true }, { canEdit: false, participantView: true }])(
    '非管理员范围%j既无summary数据也无真实JSX挂载', options => {
      expect(wire(options)).toEqual([]);
      const expression = summaryExpression();
      const marker = (props: any) => React.createElement('span', { 'data-real-summary': true }, String(props.rows.length));
      const tree = execute(expression.expression!, { ...options, stockNameProfitRows: wire(), StockNameProfitSummary: marker });
      expect(renderToStaticMarkup(React.createElement(React.Fragment, null, tree))).not.toContain('data-real-summary');
    });
  it('管理员真实JSX仍将完整stockNameProfitRows传给唯一summary', () => {
    const rows = wire();
    const marker = (props: any) => React.createElement('span', { 'data-real-summary': true }, String(props.rows.length));
    const tree = execute(summaryExpression().expression!, { canEdit: true, participantView: false,
      stockNameProfitRows: rows, StockNameProfitSummary: marker });
    expect(tree.props.children.props.rows).toBe(rows);
    expect(renderToStaticMarkup(tree)).toContain('data-real-summary="true"');
  });
  it('下方持仓列表实际span继续holding.stockName全称，卖出明细lot.stockName全称', () => {
    const holdingSpans = select(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'span' &&
      node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(ast) === 'holding.stockName')) as ts.JsxElement[];
    const mainHolding = holdingSpans.find(node => node.openingElement.attributes.properties.some(attr =>
      ts.isJsxAttribute(attr) && attr.name.getText(ast) === 'title' && attr.initializer?.getText(ast) === '{holding.stockName}'));
    expect(mainHolding).toBeTruthy();
    const tree = execute(mainHolding!, { holding: { stockName: fullname, symbol: 'HOOD' }, participantView: false });
    expect(renderToStaticMarkup(tree)).toContain(`>${fullname}</span>`);
    expect(tree.props.title).toBe(fullname);
    const lotSpans = select(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'span' &&
      node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(ast) === 'lot.stockName')) as ts.JsxElement[];
    expect(lotSpans.length).toBeGreaterThanOrEqual(1);
    for (const span of lotSpans) expect(renderToStaticMarkup(execute(span, { lot: { stockName: fullname } }))).toContain(`>${fullname}</span>`);
  });
});
