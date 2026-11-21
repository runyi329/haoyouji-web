import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as margin from '../shared/tag-margin-assets';

// Execute production AST fragments and real shared helpers offline: never import the
// backend, query a DB/network, change production sources, or copy valuation logic.
const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const routerSource = read('server/routers.ts');
const pageSource = read('client/src/pages/DepositManage.tsx');
const detailSource = read('client/src/components/RightMarginDetail.tsx');
const cache = new Map<string, ts.SourceFile>();
function ast(source: string) {
  if (!cache.has(source)) cache.set(source, ts.createSourceFile('production.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  return cache.get(source)!;
}
function find(source: string, predicate: (node: ts.Node, file: ts.SourceFile) => boolean, within: ts.Node = ast(source)) {
  const found: ts.Node[] = [], file = ast(source);
  function visit(node: ts.Node) { if (predicate(node, file)) found.push(node); ts.forEachChild(node, visit); }
  visit(within);
  if (found.length !== 1) throw new Error(`Expected unique production AST fragment, found ${found.length}`);
  return found[0];
}
function evaluate(code: string, scope: Record<string, any> = {}) {
  const js = ts.transpileModule(`const actual = (${code});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function('React', ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
}
function actual(source: string, name: string, scope: Record<string, any> = {}) {
  const node = find(source, node => (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name)
    || (ts.isFunctionDeclaration(node) && node.name?.text === name));
  return evaluate(ts.isVariableDeclaration(node) ? node.initializer!.getText(ast(source)) : node.getText(ast(source)), scope);
}
const currency = (coin = 'CNY', amount = 100): margin.TagMarginCurrencyRecord => ({ assetType: 'currency', coin, amount, label: '原币与备注保留', date: '2026-11-16' });
const soldStock = (): margin.TagMarginStockRecord => ({
  assetType: 'stock', symbol: '600519.SH', code: '600519', name: '已卖出股票', quantity: 3000,
  sales: [{ quantity: 3000, price: 18, feeRate: 0.001, date: '2026-11-16' }], purchasePrice: 48,
  referencePrice: 0, priceDate: '', priceUpdatedAt: '', label: '净现金53802', date: '2026-11-15',
});

const liveApi = find(routerSource, node => ts.isPropertyAssignment(node) && node.name.getText(ast(routerSource)) === 'getTagMarginValuation');
const frozenFunction = find(routerSource, node => ts.isFunctionDeclaration(node) && node.name?.text === 'captureFunderExternal37SettlementSnapshot');
function actualServerValuation(within: ts.Node, frozen: boolean) {
  const declaration = find(routerSource, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'fullyValued', within);
  const block = declaration.parent.parent.parent;
  if (!ts.isBlock(block)) throw new Error('Missing actual valuation block');
  const start = block.statements.findIndex(statement => statement === declaration.parent.parent);
  const end = block.statements.findIndex(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(node => ts.isIdentifier(node.name) && node.name.text === 'itemValuesCny'));
  const prefix = block.statements.slice(start, end + 1).map(node => node.getText(ast(routerSource))).join('\n');
  const total = find(routerSource, node => ts.isPropertyAssignment(node) && node.name.getText(ast(routerSource)) === 'totalCny', within) as ts.PropertyAssignment;
  const rate = find(routerSource, node => ts.isPropertyAssignment(node) && node.name.getText(ast(routerSource)) === 'usdtCnyRate', within) as ts.PropertyAssignment;
  return (records: margin.TagMarginRecord[], fx: any, prices: Record<string, any> = { USDT: 1, ETH: 2000 }, quotes: any = {}) => evaluate(
    `() => { ${prefix}; return { totalCny: ${total.initializer.getText(ast(routerSource))}, itemValuesCny, usdtCnyRate: ${rate.initializer.getText(ast(routerSource))} }; }`,
    { ...margin, [frozen ? 'marginRecords' : 'records']: records, [frozen ? 'frozenUsdtCnyRate' : 'usdtCnyRate']: fx,
      stockQuotes: quotes, getLatestPrice: (coin: string) => prices[coin] ?? null },
  )();
}
for (const [label, value] of [['实时API', actualServerValuation(liveApi, false)], ['同源冻结摘要', actualServerValuation(frozenFunction, true)]] as const) {
  describe(`${label}：真实生产AST逐项FX依赖`, () => {
    it.each([null, 0, undefined, NaN, Infinity, -1])('无效FX %s：纯人民币/全卖净现金53902仍完整、空资产为0', fx => {
      expect(margin.getTagMarginStockMarketValue(soldStock(), {})).toBe(53802);
      expect(value([currency(), soldStock()], fx)).toEqual({ totalCny: 53902, itemValuesCny: [100, 53802], usdtCnyRate: null });
      expect(value([currency()], fx).totalCny).toBe(100);
      expect(value([], fx)).toEqual({ totalCny: 0, itemValuesCny: [], usdtCnyRate: null });
    });
    it('可确定人民币股票不需FX，行情缺失股票仍未知', () => {
      const stock = { ...soldStock(), referencePrice: 20 }; delete stock.sales; delete stock.purchasePrice;
      expect(value([stock, currency()], null).totalCny).toBe(60100);
      expect(value([{ ...stock, referencePrice: 0 }, currency()], null)).toMatchObject({ totalCny: null, itemValuesCny: [null, 100] });
    });
    it.each(['USDT', 'ETH'])('%s缺FX：不能冒充完整53902，已知人民币分项保留', coin => {
      expect(value([currency(), soldStock(), currency(coin, 2)], null)).toEqual({ totalCny: null, itemValuesCny: [100, 53802, null], usdtCnyRate: null });
      expect(value([currency(coin, 2)], 0).totalCny).toBeNull();
    });
    it('真实FX与数字币行情正确相乘，原始记录/手续费/日期不变', () => {
      const records = [currency(), soldStock(), currency('USDT', 2), currency('ETH', 3)], before = structuredClone(records);
      const result = value(records, 6.6714);
      expect(result.totalCny).toBeCloseTo(53902 + (2 + 6000) * 6.6714, 8);
      expect(result.itemValuesCny).toEqual([100, 53802, 2 * 6.6714, 3 * 2000 * 6.6714]);
      expect(records).toEqual(before);
    });
    it.each([null, undefined, 0, -1, NaN, Infinity, 'bad'])('坏数字币价格%s不得变成0或已知人民币小计', price => {
      expect(value([currency(), currency('ETH', 2)], 6.6714, { ETH: price })).toMatchObject({ totalCny: null, itemValuesCny: [100, null] });
    });
    it('计算溢出未知，不能输出Infinity或假零', () => {
      expect(value([currency('ETH', Number.MAX_VALUE)], 6.6714).totalCny).toBeNull();
      expect(value([currency('CNY', Number.MAX_VALUE), currency('CNY', Number.MAX_VALUE)], 0).totalCny).toBeNull();
    });
  });
}

function rowHtml(source: string, label: string, scope: Record<string, any>) {
  const span = find(source, node => ts.isJsxElement(node) && node.openingElement.tagName.getText(ast(source)) === 'span'
    && node.children.some(child => ts.isJsxText(child) && child.text.trim() === label));
  return renderToStaticMarkup(evaluate(span.parent.getText(ast(source)), scope));
}
function pageHarness(source: string, records: margin.TagMarginRecord[], raw: any, canonical: any = undefined) {
  const scope: Record<string, any> = { ...margin, useMemo: (fn: any) => fn(), cryptoPricesRaw: raw,
    rightMarginData: records, allMarginStockQuotes: {}, rightMarginStockQuotes: {}, canonicalMarginValuation: canonical };
  scope.isCnyMarginCoin = actual(source, 'isCnyMarginCoin');
  scope.toCNY = actual(source, 'toCNY', scope);
  scope.cryptoPrices = actual(source, 'cryptoPrices', scope);
  scope._cnyRate = Number(scope.cryptoPrices.USDT) || 0;
  const localName = source === pageSource ? 'locallyComputedRightTotalCNY' : 'locallyComputedTotalCNY';
  scope[localName] = actual(source, localName, scope);
  scope.rightTotalCNY = actual(source, 'rightTotalCNY', scope);
  scope.rightMarginValueSummary = actual(source, 'rightMarginValueSummary', scope);
  const map = find(source, (node, file) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'map' && node.expression.expression.getText(file) === 'rightMarginData') as ts.CallExpression;
  // Sale details already have dedicated real-component tests. Here only this child
  // is omitted, so the real stock value/FX guard JSX can be executed in isolation.
  const recordRow = evaluate(map.arguments[0].getText(ast(source)), { ...scope, TagMarginStockSaleDetails: () => null });
  return { scope, localTotal: scope[localName], total: scope.rightTotalCNY,
    row: (label: string) => rowHtml(source, label, scope),
    record: (record: margin.TagMarginRecord) => renderToStaticMarkup(recordRow(record, 0)) };
}
for (const [label, source] of [['管理页', pageSource], ['只读详情', detailSource]] as const) describe(`${label}：真实helper/聚合/人民币主值JSX`, () => {
  it.each([undefined, { usdtCnyRate: null, prices: { USDT: 1, ETH: 2000 } }, { usdtCnyRate: NaN, prices: { ETH: 2000 } }])('全无FX仍显示人民币100/股票净现金53802/总53902，不显示假辅助u', raw => {
    const h = pageHarness(source, [currency(), soldStock()], raw);
    expect(h.localTotal).toBe(53902); expect(h.total).toBe(53902);
    for (const [row, expected] of [['人民币价值', '¥100'], ['股票价值', '¥53,802'], ['总担保价值', '¥53,902']]) {
      const html = h.row(row);
      expect(html).toContain(expected); expect(html).toContain('汇率待更新');
      expect(html).not.toMatch(/NaN|Infinity|≈|6\.8|--/);
    }
    expect(h.record(soldStock())).toContain('卖出价值 ¥53,802');
    expect(h.record(currency())).toContain('¥100');
    expect(h.scope.cryptoPrices.USDT).toBeUndefined();
    expect(h.scope.cryptoPrices.CNY).toBe(1);
  });
  it('空资产本地完整总额0；无FX不错误阻断', () => {
    const h = pageHarness(source, [], undefined);
    expect(h.localTotal).toBe(0); expect(h.total).toBe(0);
    expect(h.row('总担保价值')).toContain('¥0');
  });
  it.each(['USDT', 'ETH'])('%s缺FX：原币分项保留，总额null不冒充53902', coin => {
    const record = currency(coin, 2), h = pageHarness(source, [currency(), soldStock(), record], { usdtCnyRate: null, prices: { ETH: 2000 } });
    expect(h.localTotal).toBeNull(); expect(h.total).toBeNull();
    expect(h.row('人民币价值')).toContain('¥100'); expect(h.row('股票价值')).toContain('¥53,802');
    const total = h.row('总担保价值');
    expect(total).toContain('估值待获取'); expect(total).toContain('汇率待更新'); expect(total).toContain('--');
    expect(total).not.toMatch(/¥53,902|¥0|NaN|Infinity/);
    const item = h.record(record);
    expect(item).toContain('汇率待更新'); expect(item).toContain('原币与备注保留');
    expect(item).toContain(coin === 'USDT' ? '>u<' : '>ETH<'); expect(item).not.toMatch(/¥0|NaN|Infinity/);
  });
  it.each([null, 0, -1, NaN, Infinity, 'bad'])('有FX坏price%s仍未知，不变零；人民币保持', price => {
    const h = pageHarness(source, [currency(), currency('ETH', 2)], { usdtCnyRate: 6.6714, prices: { ETH: price } });
    expect(h.localTotal).toBeNull(); expect(h.total).toBeNull();
    expect(h.record(currency('ETH', 2))).toContain('估值待获取');
    expect(h.record(currency('ETH', 2))).not.toContain('¥0');
    expect(h.row('人民币价值')).toContain('¥100');
  });
  it('显式canonical null不以本地人民币53902冒充完整值', () => {
    const h = pageHarness(source, [currency(), soldStock()], undefined, { totalCny: null });
    expect(h.localTotal).toBe(53902); expect(h.total).toBeNull();
    expect(h.row('总担保价值')).not.toContain('¥53,902');
    expect(h.row('股票价值')).toContain('¥53,802');
  });
  it('有效FX正常转换且合法canonical0仍显示零', () => {
    const h = pageHarness(source, [currency(), currency('ETH', 2)], { usdtCnyRate: 6.6714, prices: { ETH: 2000 } });
    expect(h.total).toBeCloseTo(100 + 2 * 2000 * 6.6714, 8);
    expect(h.row('总担保价值')).toContain(' u');
    const zero = pageHarness(source, [currency()], { usdtCnyRate: 6.6714, prices: {} }, { totalCny: 0 });
    expect(zero.row('总担保价值')).toContain('¥0'); expect(zero.row('总担保价值')).toContain('≈ 0 u');
  });
  it('无效amount/折算输入也必须unknown而非0', () => {
    const h = pageHarness(source, [], undefined);
    for (const amount of ['bad', '', NaN, Infinity]) expect(h.scope.toCNY(amount, 'CNY', {})).toBeNull();
    expect(h.scope.toCNY(0, 'CNY', {})).toBe(0);
    expect(h.scope.toCNY(2, 'ETH', { ETH: null })).toBeNull();
    expect(source).not.toMatch(/CNY_RATE_FALLBACK|6\.8/);
  });
});

describe('管理页：折叠与左侧保证金逐项unknown传播（真实AST）', () => {
  it.each([
    ['人民币股票', [currency(), soldStock()], 53902],
    ['空资产', [], 0],
    ['USDT混合', [currency(), soldStock(), currency('USDT', 2)], null],
    ['ETH混合', [currency(), soldStock(), currency('ETH', 2)], null],
  ] as Array<[string, margin.TagMarginRecord[], number | null]>)('无FX折叠%s保持真实人民币比例或unknown', (_label, records, total) => {
    const declaration = find(pageSource, node => ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'collapseRatio');
    let callback: ts.Node | undefined = declaration;
    while (callback && !ts.isArrowFunction(callback)) callback = callback.parent;
    if (!callback || !ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) throw new Error('Missing actual collapse block');
    const stop = callback.body.statements.findIndex(ts.isReturnStatement);
    const prefix = callback.body.statements.slice(0, stop).map(node => node.getText(ast(pageSource))).join('\n');
    const scope: Record<string, any> = { ...margin, cat: { name: '测试' }, selectedTagForRight: null, ledgerId: 37,
      allTagsMarginSummary: { '测试': { marginByCoin: records, marginBase: '100000', latestBalance: { balance: 1000 }, initialAmount: '1000', accountMultiplier: '1' } },
      cryptoPrices: {}, allMarginStockQuotes: {} };
    scope.isCnyMarginCoin = actual(pageSource, 'isCnyMarginCoin'); scope.toCNY = actual(pageSource, 'toCNY', scope);
    const result = evaluate(`() => { ${prefix}; return { collapseRatio, isWarning }; }`, scope)();
    expect(result.collapseRatio).toBe(total === null ? null : total / 100000 * 100);
    expect(result.isWarning).toBe(total !== null && total < 10000);
  });
  it.each([
    ['人民币', { CNY: 100 }, 100], ['USDT', { CNY: 100, USDT: 2 }, null], ['ETH', { CNY: 100, ETH: 2 }, null],
  ] as Array<[string, Record<string, number>, number | null]>)('左侧%s不将已知人民币小计冒充总额，原币统计保持', (_label, coins, expected) => {
    const categories = Object.keys(coins).map(name => ({ name }));
    const scope: Record<string, any> = { useMemo: (fn: any) => fn(), members: [{ userId: 1, nickname: '测试' }], categories,
      editState: { 1: Object.fromEntries(Object.entries(coins).map(([coin, amount]) => [coin, { margin: String(amount), marginCoin: coin }])) },
      cryptoPrices: {} };
    for (const name of ['isCnyMarginCoin', 'normalizeCoin']) scope[name] = actual(pageSource, name);
    scope.toCNY = actual(pageSource, 'toCNY', scope);
    const stats = actual(pageSource, 'stats', scope);
    expect(stats.totalCNY).toBe(expected); expect(stats.byMember[1].totalCNY).toBe(expected);
    expect(stats.totalCount).toBe(Object.keys(coins).length);
    for (const [coin, amount] of Object.entries(coins)) expect(stats.byCoin[coin]).toMatchObject({ total: amount, count: 1 });
    expect(actual(pageSource, 'calcCNYStr', scope)('2', 'USDT')).toBe('汇率待更新');
  });
});
