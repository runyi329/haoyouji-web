import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as margin from '../shared/tag-margin-assets';

// Offline production AST execution only: no copied valuation/display implementation,
// page bootstrap, DB, network, mutation, or production-source changes.
const pageSource = readFileSync(new URL('../client/src/pages/DepositManage.tsx', import.meta.url), 'utf8');
const detailSource = readFileSync(new URL('../client/src/components/RightMarginDetail.tsx', import.meta.url), 'utf8');
const saleDetailsSource = readFileSync(new URL('../client/src/components/TagMarginStockSaleDetails.tsx', import.meta.url), 'utf8');
const astCache = new Map<string, ts.SourceFile>();
const jsCache = new Map<string, string>();
function ast(source: string) {
  let file = astCache.get(source);
  if (!file) {
    file = ts.createSourceFile('production.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    astCache.set(source, file);
  }
  return file;
}
function unique(source: string, predicate: (node: ts.Node, file: ts.SourceFile) => boolean, label: string) {
  const file = ast(source), found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node, file)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (found.length !== 1) throw new Error(`Expected one actual production ${label}, found ${found.length}`);
  return found[0];
}
function evaluate(code: string, scope: Record<string, any> = {}) {
  let js = jsCache.get(code);
  if (!js) {
    js = ts.transpileModule(`const actual = (${code});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
    }).outputText;
    jsCache.set(code, js);
  }
  return new Function('React', ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
}
function declaration(source: string, name: string) {
  return unique(source, node =>
    (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && !!node.initializer)
    || (ts.isFunctionDeclaration(node) && node.name?.text === name), name);
}
function actual(source: string, name: string, scope: Record<string, any> = {}) {
  const node = declaration(source, name);
  const code = ts.isVariableDeclaration(node) ? node.initializer!.getText(ast(source))
    : node.getText(ast(source)).replace(/^export\s+(?:default\s+)?/, '');
  return evaluate(code, scope);
}
function labeledSpan(source: string, label: string) {
  return unique(source, (node, file) => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(file) === (label === '合计' ? 'div' : 'span')
    && node.children.some(child => ts.isJsxText(child)
      ? (label === '合计' ? child.text.trim() === label : child.text.trim().startsWith(label))
      : label !== '合计' && ts.isJsxExpression(child) && !!child.expression && ts.isConditionalExpression(child.expression)
        && child.expression.getText(file).includes(label)), `span ${label}`);
}
function actualRow(source: string, label: string, scope: Record<string, any>) {
  const row = labeledSpan(source, label).parent;
  if (!ts.isJsxElement(row)) throw new Error(`Expected actual JSX row for ${label}`);
  return evaluate(row.getText(ast(source)), scope);
}
function htmlRow(source: string, label: string, scope: Record<string, any>) {
  return renderToStaticMarkup(actualRow(source, label, scope));
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
const Details = actual(saleDetailsSource, 'TagMarginStockSaleDetails', margin);
const stock = (patch: Record<string, any> = {}): any => ({
  assetType: 'stock', symbol: '600519.SH', code: '600519', name: '测试股票', quantity: 100,
  purchasePrice: 10, sales: [{ quantity: 101, price: 25 }], referencePrice: 20,
  priceDate: '', priceUpdatedAt: '', label: '保留股票原始备注', date: '2026-11-16', ...patch,
});
const currency = (): margin.TagMarginCurrencyRecord => ({
  assetType: 'currency', coin: 'CNY', amount: 800, label: '合法人民币800不能丢失', date: '2026-11-15',
});
const pages = [['管理页', pageSource, 'locallyComputedRightTotalCNY'],
  ['只读详情', detailSource, 'locallyComputedTotalCNY']] as const;
function harness(source: string, localName: string, records: any[], canonical: any, quotes: any = {}) {
  const resolver = vi.fn(margin.resolveTagMarginTotalCny);
  const scope: Record<string, any> = {
    ...margin, resolveTagMarginTotalCny: resolver, useMemo: (fn: any) => fn(),
    cryptoPrices: { USDT: 7, CNY: 1, RMB: 1 }, CNY_RATE_FALLBACK: 6.8, _cnyRate: 7,
    allMarginStockQuotes: quotes, rightMarginStockQuotes: quotes, canonicalMarginValuation: canonical,
    rightTagConfig: { margin_by_coin: records }, rightTagSummary: { marginByCoin: { CNY: 9999 } },
    savedRightMarginEdits: null, TagMarginStockSaleDetails: Details,
    hasLinkedInterestAdjustment: false,
  };
  scope.isCnyMarginCoin = actual(source, 'isCnyMarginCoin');
  scope.toCNY = actual(source, 'toCNY', scope);
  if (source === pageSource) {
    scope.sortTagMarginRecordsByBusinessDate = actual(source, 'sortTagMarginRecordsByBusinessDate');
    scope.currentRightMarginRecords = actual(source, 'currentRightMarginRecords', scope);
  }
  scope.rightMarginData = actual(source, 'rightMarginData', scope);
  scope[localName] = actual(source, localName, scope);
  scope.rightMarginValueSummary = actual(source, 'rightMarginValueSummary', scope);
  scope.rightTotalCNY = actual(source, 'rightTotalCNY', scope);
  const map = unique(source, (node, file) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'map'
    && node.expression.expression.getText(file) === 'rightMarginData', 'rightMarginData.map') as ts.CallExpression;
  const recordRow = evaluate(map.arguments[0].getText(ast(source)), scope);
  const summaryNode = labeledSpan(source, '合计').parent;
  if (!ts.isJsxElement(summaryNode)) throw new Error('Missing actual summary JSX');
  return { scope, resolver, localTotal: scope[localName], total: scope.rightTotalCNY,
    recordHtml: (record: any, index = 0) => renderToStaticMarkup(recordRow(record, index)),
    totalHtml: () => htmlRow(source, '总担保价值', scope),
    summaryHtml: () => renderToStaticMarkup(evaluate(summaryNode.getText(ast(source)), scope)),
  };
}
function expectUnknownTotal(html: string) {
  expect(html).toContain('估值待获取');
  expect(html).toContain('--');
  expect(html).not.toMatch(/¥(?:0|800)(?:<|\b)|NaN|Infinity|≈\s*0/);
}

const unknownCanonicals: Array<[string, any]> = [
  ['显式null', null], ['totalCny:null', { totalCny: null }], ['缺字段', {}],
  ['totalCny:undefined', { totalCny: undefined }], ['空字符串', { totalCny: '' }],
  ['空白字符串', { totalCny: '   ' }], ['非数值字符串', { totalCny: 'bad' }],
  ['NaN', { totalCny: NaN }], ['Infinity', { totalCny: Infinity }],
  ['字符串Infinity', { totalCny: 'Infinity' }], ['布尔false', { totalCny: false }],
  ['数组', { totalCny: [] }], ['对象', { totalCny: {} }],
];
describe('未知总估值的canonical边界：真实共享resolver', () => {
  it.each(unknownCanonicals)('%s不可回退有效本地800，也不能把未知转换成0', (_label, canonical) => {
    expect(margin.resolveTagMarginTotalCny(canonical, 800)).toBeNull();
    expect(margin.resolveTagMarginTotalCny(canonical, null)).toBeNull();
  });
  it('仅canonical undefined允许finite本地fallback；null、NaN、Infinity本地值仍未知', () => {
    expect(margin.resolveTagMarginTotalCny(undefined, 800)).toBe(800);
    expect(margin.resolveTagMarginTotalCny(undefined, 0)).toBe(0);
    for (const local of [null, NaN, Infinity, -Infinity]) expect(margin.resolveTagMarginTotalCny(undefined, local)).toBeNull();
  });
  it.each([0, '0', ' 0 ', -125, '125.5'])('合法canonical %s保留自身值而非fallback800', canonical => {
    expect(margin.resolveTagMarginTotalCny({ totalCny: canonical }, 800)).toBe(Number(canonical));
    expect(margin.resolveTagMarginTotalCny({ totalCny: canonical }, null)).toBe(Number(canonical));
  });
});

for (const [label, source, localName] of pages) describe(`${label}：真实nullable聚合、明细及合计JSX`, () => {
  it.each([['显式null', null], ['没有canonical', undefined]] as Array<[string, any]>)('100股超卖101@25+CNY800，%s：本地/总合计null且两笔明细保留', (_label, canonical) => {
    const records = [stock(), currency()], before = structuredClone(records);
    // Both orderings ensure an unknown stock poisons the total before AND after a valid currency.
    for (const ordered of [records, [...records].reverse()]) {
      const h = harness(source, localName, ordered, canonical);
      expect(h.scope.rightMarginData).toHaveLength(2);
      expect(h.localTotal).toBeNull(); expect(h.total).toBeNull();
      expect(h.resolver).toHaveBeenCalledOnce(); expect(h.resolver).toHaveBeenCalledWith(canonical, null);
      const stockRecord = h.scope.rightMarginData.find((entry: any) => entry.assetType === 'stock');
      const currencyRecord = h.scope.rightMarginData.find((entry: any) => entry.assetType === 'currency');
      expect(stockRecord).toMatchObject({ quantity: 100, sales: [{ quantity: 101, price: 25 }] });
      const stockHtml = h.recordHtml(stockRecord), currencyHtml = h.recordHtml(currencyRecord, 1);
      expect(stockHtml).toContain('测试股票'); expect(stockHtml).toContain('保留股票原始备注');
      expect(stockHtml).toContain('卖出数据待纠正，估值暂不可用'); expect(stockHtml).toContain('估值待获取');
      expect(stockHtml).not.toMatch(/已卖出价值|全部卖出|¥0|NaN/);
      expect(currencyHtml).toContain('合法人民币800不能丢失'); expect(currencyHtml).toContain('¥800');
      expect(h.scope.rightMarginValueSummary).toMatchObject({ stockCount: 1, stockValueReady: false,
        currencyTotals: { CNY: 800 }, cnyValueCNY: 800 });
      expectUnknownTotal(h.totalHtml());
      expect(htmlRow(source, '股票价值', h.scope)).toContain('--');
      expect(htmlRow(source, '股票价值', h.scope)).not.toMatch(/¥0|NaN/);
      expect(h.summaryHtml()).toContain('人民币价值'); expect(h.summaryHtml()).toContain('¥800');
    }
    expect(records).toEqual(before);
  });
  it.each(unknownCanonicals)('canonical %s即使本地合法800也渲染真实未知合计，不显示假零', (_label, canonical) => {
    const h = harness(source, localName, [currency()], canonical);
    expect(h.localTotal).toBe(800); expect(h.total).toBeNull();
    expectUnknownTotal(h.totalHtml());
    expect(h.summaryHtml()).toContain('¥800');
  });
  it.each([0, '0'])('合法canonical %s覆盖本地800，真实合计显示¥0而非¥800或待获取', zero => {
    const h = harness(source, localName, [currency()], { totalCny: zero });
    expect(h.localTotal).toBe(800); expect(h.total).toBe(0);
    expect(h.totalHtml()).toContain('¥0'); expect(h.totalHtml()).toContain('≈ 0 u');
    expect(h.totalHtml()).not.toMatch(/¥800|估值待获取|NaN|--/);
  });
  it('canonical zero即使本地股票未知也必须保留真实0；股票小计仍未知不伪造', () => {
    const h = harness(source, localName, [stock(), currency()], { totalCny: 0 });
    expect(h.localTotal).toBeNull(); expect(h.total).toBe(0);
    expect(h.totalHtml()).toContain('¥0');
    expect(htmlRow(source, '股票价值', h.scope)).toContain('--');
  });
  it('合法全卖100@25无需quote，固定2500+CNY800=3300；行情变动不影响', () => {
    const record = stock({ referencePrice: 0, sales: [{ quantity: 100, price: 25 }] });
    for (const quotes of [{}, { '600519.SH': { price: 999 } }]) {
      const h = harness(source, localName, [record, currency()], undefined, quotes);
      expect(h.localTotal).toBe(3300); expect(h.total).toBe(3300);
      expect(h.totalHtml()).toContain('¥3,300');
      expect(h.recordHtml(record)).toContain('卖出价值 ¥2,500');
      expect(h.recordHtml(record)).toContain('全部卖出，价值按成交价固定');
      expect(h.summaryHtml()).not.toMatch(/估值待获取|NaN|--/);
      expect(margin.getTagMarginStockSymbols(h.scope.rightMarginData)).toEqual([]);
    }
  });
  const invalidStocks: Array<[string, Record<string, any>]> = [
    ['partial缺quote', { referencePrice: 0, sales: [{ quantity: 20, price: 25 }] }],
    ['sales:null', { sales: null }], ['sale项null', { sales: [null] }],
    ['sale价NaN', { sales: [{ quantity: 20, price: NaN }] }],
    ['sale股数NaN', { sales: [{ quantity: NaN, price: 25 }] }],
    ['sales非array对象', { sales: { quantity: 20, price: 25 } }],
    ['sales非array字符串', { sales: 'bad history' }],
    ['有效sale后null', { sales: [{ quantity: 20, price: 25 }, null] }],
  ];
  it.each(invalidStocks)('%s与CNY800并存：未知传播且股票仍可见，不估成0或仅500已卖款', (_name, patch) => {
    const h = harness(source, localName, [stock(patch), currency()], undefined);
    expect(h.scope.rightMarginData).toHaveLength(2); expect(h.localTotal).toBeNull(); expect(h.total).toBeNull();
    expectUnknownTotal(h.totalHtml());
    const record = h.scope.rightMarginData.find((entry: any) => entry.assetType === 'stock');
    expect(h.recordHtml(record)).toContain('估值待获取'); expect(h.recordHtml(record)).not.toMatch(/NaN|¥0|全部卖出/);
    expect(h.scope.rightMarginValueSummary.stockValueReady).toBe(false);
    if (_name === 'partial缺quote') {
      expect(h.recordHtml(record)).toContain('已卖出价值：¥500.00');
      expect(h.recordHtml(record)).toContain('剩余 80股按参考价估值');
    } else expect(h.recordHtml(record)).toContain('卖出数据待纠正，估值暂不可用');
  });
  it('负旧unsold股票保留减少、负估值及查询符号，不误判为全卖', () => {
    const record = stock({ quantity: -10 }); delete record.sales; delete record.purchasePrice;
    const h = harness(source, localName, [record, currency()], undefined);
    expect(h.localTotal).toBe(600); expect(h.total).toBe(600);
    expect(margin.getTagMarginStockSymbols(h.scope.rightMarginData)).toEqual(['600519.SH']);
    expect(margin.getTagMarginStockMarketValue(record, {})).toBe(-200);
    const html = h.recordHtml(record);
    expect(html).toContain('减少'); expect(html).toContain('约 ¥-200');
    expect(html).not.toMatch(/全部卖出|卖出数据待纠正|估值待获取/);
  });
});

for (const [label, source] of pages) describe(`${label}：真实nullable剩余与比率守卫和显示`, () => {
  function derived(total: number | null, pnl: number | null, balance: number | null, base = 10000, interest = -125) {
    const scope: Record<string, any> = { rightTotalCNY: total, includedInterestDifferenceCny: interest,
      pnl, autoBalanceNum: balance, marginBaseNum: base, _cnyRate: 7, includePendingInterest: false };
    if (source === pageSource) scope.combinedRightMarginCNY = actual(source, 'combinedRightMarginCNY', scope);
    for (const name of ['remainingMargin', 'marginBasePct', 'marginPct']) scope[name] = actual(source, name, scope);
    return scope;
  }
  it('未知总额即使已有盈亏及利息差额也不算剩余、基数比、余额比，真实JSX为--', () => {
    const scope = derived(null, -9000, 1000);
    if (source === pageSource) expect(scope.combinedRightMarginCNY).toBeNull();
    expect(scope.remainingMargin).toBeNull(); expect(scope.marginBasePct).toBeNull(); expect(scope.marginPct).toBeNull();
    const remaining = htmlRow(source, '剩余保证金 (', scope);
    const ratio = htmlRow(source, '剩余保证金占基数比', scope);
    expect(remaining).toContain('--'); expect(remaining).not.toMatch(/NaN|≈|9000|0 u/);
    expect(ratio).toContain('--'); expect(ratio).not.toMatch(/NaN|%/);
  });
  it('合法0不是unknown，合法nullable算术在守卫后继续计算，不丢失利息', () => {
    const scope = derived(0, 0, 1000, 10000, 0);
    expect(scope.remainingMargin).toBe(0); expect(scope.marginBasePct).toBe(0); expect(scope.marginPct).toBe(0);
    expect(htmlRow(source, '剩余保证金占基数比', scope)).toContain('0.0%');
    if (source === pageSource) {
      const withInterest = derived(0, 200, 1000);
      expect(withInterest.combinedRightMarginCNY).toBe(-125); expect(withInterest.remainingMargin).toBe(75);
    }
  });
  it('余额/盈亏未知或分母0也正确守卫；已知总额可以保持独立余额比', () => {
    const noBalance = derived(800, null, null);
    expect(noBalance.remainingMargin).toBeNull(); expect(noBalance.marginBasePct).toBeNull(); expect(noBalance.marginPct).toBeNull();
    const zeroDenominators = derived(800, 0, 0, 0);
    expect(zeroDenominators.remainingMargin).not.toBeNull();
    expect(zeroDenominators.marginBasePct).toBeNull(); expect(zeroDenominators.marginPct).toBeNull();
  });
});

describe('管理页折叠标签：真实聚合、remaining/ratio/warning及header JSX', () => {
  const collapseDecl = declaration(pageSource, 'collapseRatio');
  let callback: ts.Node | undefined = collapseDecl;
  while (callback && !ts.isArrowFunction(callback)) callback = callback.parent;
  if (!callback || !ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) throw new Error('Missing actual tag map callback');
  const block = callback.body;
  const returnNode = block.statements.find(statement => ts.isReturnStatement(statement)) as ts.ReturnStatement;
  const prefix = block.statements.slice(0, block.statements.indexOf(returnNode)).map(node => node.getText(ast(pageSource))).join('\n');
  const card = returnNode.expression;
  if (!card || !ts.isParenthesizedExpression(card) || !ts.isJsxElement(card.expression)) throw new Error('Missing actual tag card JSX');
  const cardJsx = card.expression;
  const header = cardJsx.children.find(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(ast(pageSource)) === 'button') as ts.JsxElement;
  const style = cardJsx.openingElement.attributes.properties.find(node => ts.isJsxAttribute(node) && node.name.getText(ast(pageSource)) === 'style') as ts.JsxAttribute;
  function collapse(records: any[], balance = 1000, initial = 10000, prices: Record<string, number> = { USDT: 7, CNY: 1 }) {
    const scope: Record<string, any> = { ...margin, cat: { id: 1, name: '折叠测试' }, selectedTagForRight: null,
      ledgerId: 37, allTagsMarginSummary: { '折叠测试': { marginByCoin: records, marginBase: '10000',
        latestBalance: { balance }, initialAmount: String(initial), accountMultiplier: '1' } },
      cryptoPrices: prices, allMarginStockQuotes: {}, setSelectedTagForRight: vi.fn(), ChevronUp: 'svg', ChevronDown: 'svg' };
    scope.isCnyMarginCoin = actual(pageSource, 'isCnyMarginCoin'); scope.toCNY = actual(pageSource, 'toCNY', scope);
    Object.assign(scope, evaluate(`() => { ${prefix}\nreturn { isSelected, tagSummaryData, isPaused, collapseRatio, isWarning }; }`, scope)());
    const total = actual(pageSource, 'totalMarginCNY', scope);
    const remaining = actual(pageSource, 'remaining', { ...scope, pnl: balance - initial, totalMarginCNY: total });
    const headerTree = evaluate(header.getText(ast(pageSource)), scope);
    const styleExpression = (style.initializer as ts.JsxExpression).expression!;
    return { scope, total, remaining, headerText: text(headerTree), html: renderToStaticMarkup(headerTree),
      style: evaluate(styleExpression.getText(ast(pageSource)), scope) };
  }
  it.each([
    ['超卖101@25', stock()], ['partial缺行情', stock({ referencePrice: 0, sales: [{ quantity: 20, price: 25 }] })],
    ['sales:null', stock({ sales: null })], ['sale:null', stock({ sales: [null] })],
    ['sale:NaN', stock({ sales: [{ quantity: 20, price: NaN }] })],
    ['sales:nonarray', stock({ sales: { quantity: 20, price: 25 } })],
  ] as Array<[string, any]>)('%s+CNY800：折叠total/remaining/ratio未知，不误报警也不显示假百分比', (_label, record) => {
    for (const records of [[record, currency()], [currency(), record]]) {
      const h = collapse(records);
      expect(h.total).toBeNull(); expect(h.remaining).toBeNull();
      expect(h.scope.collapseRatio).toBeNull(); expect(h.scope.isWarning).toBe(false);
      expect(h.headerText).not.toMatch(/%|NaN/); expect(h.html).not.toContain('#EA580C');
      expect(h.style.border).toBe('1.5px solid transparent');
    }
  });
  it('合法全卖无需行情：折叠3300/remaining3300/ratio33%，真实header显示33.0%且无报警', () => {
    const h = collapse([stock({ referencePrice: 0, sales: [{ quantity: 100, price: 25 }] }), currency()], 10000, 10000);
    expect(h.total).toBe(3300); expect(h.remaining).toBe(3300); expect(h.scope.collapseRatio).toBe(33);
    expect(h.scope.isWarning).toBe(false); expect(h.headerText).toContain('33.0%');
  });
  it('合法零与真正低保证金仍正常计算、显示和报警，不以未知守卫掩盖真实风险', () => {
    const zero = collapse([], 10000, 10000);
    expect(zero.total).toBe(0); expect(zero.remaining).toBe(0); expect(zero.scope.collapseRatio).toBe(0);
    expect(zero.scope.isWarning).toBe(true); expect(zero.headerText).toContain('0.0%');
    expect(zero.style.border).toBe('1.5px solid #F97316');
    const low = collapse([currency()], 10000, 10000);
    expect(low.scope.collapseRatio).toBe(8); expect(low.scope.isWarning).toBe(true); expect(low.headerText).toContain('8.0%');
  });
  it('负旧unsold股票仍进入折叠总额而非按非正剩余过滤：800-200=600即6%', () => {
    const record = stock({ quantity: -10 }); delete record.sales; delete record.purchasePrice;
    const h = collapse([record, currency()], 10000, 10000);
    expect(h.total).toBe(600); expect(h.remaining).toBe(600); expect(h.scope.collapseRatio).toBe(6);
    expect(h.headerText).toContain('6.0%');
  });
});
