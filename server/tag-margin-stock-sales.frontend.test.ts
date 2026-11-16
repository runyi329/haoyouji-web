import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as margin from '../shared/tag-margin-assets';
import { getBeijingLedgerRecordToday } from '../shared/ledger-record-date';

// Offline only: execute production AST expressions/TSX with inert state setters and tRPC spies.
// No parallel valuation/save implementation, browser, application bootstrap, DB or HTTP imports.
const pageSource = readFileSync(new URL('../client/src/pages/DepositManage.tsx', import.meta.url), 'utf8');
const readOnlySource = readFileSync(new URL('../client/src/components/RightMarginDetail.tsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('../client/src/components/TagMarginStockSaleEditor.tsx', import.meta.url), 'utf8');
const detailsSource = readFileSync(new URL('../client/src/components/TagMarginStockSaleDetails.tsx', import.meta.url), 'utf8');
const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
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
function matching(source: string, predicate: (node: ts.Node, file: ts.SourceFile) => boolean): ts.Node[] {
  const file = ast(source), results: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node, file)) results.push(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return results;
}
function unique(source: string, predicate: (node: ts.Node, file: ts.SourceFile) => boolean, label: string) {
  const results = matching(source, predicate);
  if (results.length !== 1) throw new Error(`Expected one actual production ${label}, found ${results.length}`);
  return results[0];
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
function actualMap(source: string, receiver: string, scope: Record<string, any>) {
  const call = unique(source, (node, file) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'map'
    && node.expression.expression.getText(file) === receiver, `${receiver}.map`) as ts.CallExpression;
  return evaluate(call.arguments[0].getText(ast(source)), scope);
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
function button(tree: any, label: string) {
  const found = nodes(tree).find(node => node.type === 'button' && (text(node).trim() === label || node.props['aria-label'] === label));
  if (!found) throw new Error(`Missing actual production button: ${label}`);
  return found;
}
function field(tree: any, label: string) {
  const found = nodes(tree).find(node => node.type === 'input' && node.props['aria-label'] === label);
  if (!found) throw new Error(`Missing actual production field: ${label}`);
  return found;
}
const emptyCurrencyMargin = actual(pageSource, 'emptyCurrencyMargin');
const emptyStockMargin = actual(pageSource, 'emptyStockMargin');
const toRightMarginEdit = actual(pageSource, 'toRightMarginEdit');
const sortTagMarginRecordsByBusinessDate = actual(pageSource, 'sortTagMarginRecordsByBusinessDate');
const Details = actual(detailsSource, 'TagMarginStockSaleDetails', margin);
const today = getBeijingLedgerRecordToday();
const Editor = actual(editorSource, 'TagMarginStockSaleEditor', { ...margin, getBeijingLedgerRecordToday, Plus: 'svg', X: 'svg' });
const fixtureStock = (patch: Record<string, any> = {}): any => ({
  assetType: 'stock', symbol: '600519.SH', code: '600519', name: '贵州茅台', quantity: 100,
  purchasePrice: 9.125, sales: [{ quantity: 20, price: 12.5 }, { quantity: 30, price: 15 }],
  referencePrice: 18, priceDate: '2026-11-13', priceUpdatedAt: '2026-11-13T07:05:00Z',
  label: '原始担保物\n保留备注', date: '2026-11-12', ...patch,
});
const fixtureCurrency = () => ({ assetType: 'currency', coin: 'ETH', amount: -2.5, label: '旧币流水', date: '2026-11-11' });

function pageHarness(records: any[] = [fixtureStock()]) {
  const scope: Record<string, any> = {
    ...margin, emptyCurrencyMargin, emptyStockMargin, toRightMarginEdit, sortTagMarginRecordsByBusinessDate,
    ledgerId: 37, selectedTagForRight: '测试担保标签', rightTagConfig: {
      margin_by_coin: JSON.stringify(records), initial_amount: '10000', account_multiplier: '2', margin_base: '5000',
    },
    rightMarginEdits: [], savedRightMarginEdits: null, rightEditMode: false, rightSaving: false,
    rightMarginStockLookupRow: null, rightMarginStockLookupInput: '', rightMarginStockLookupQuery: '',
    rightMarginStockLookupResult: { isFetching: false }, rightMarginStockSuggestions: [],
    CRYPTO_COINS: ['BTC', 'ETH', 'SOL', 'LDO', 'USDT', '元'], TagMarginStockSaleEditor: Editor,
    toast: { error: vi.fn(), success: vi.fn() },
    saveTagConfigMutation: { mutateAsync: vi.fn().mockResolvedValue({}) },
    addMarginLogMutation: { mutateAsync: vi.fn().mockResolvedValue({}) }, refetchMarginLogs: vi.fn(),
    Plus: 'svg', X: 'svg',
  };
  for (const name of ['RightMarginEdits', 'SavedRightMarginEdits', 'RightEditMode', 'RightSaving',
    'RightMarginStockLookupRow', 'RightMarginStockLookupInput', 'RightMarginStockLookupQuery']) {
    const key = name[0].toLowerCase() + name.slice(1);
    scope[`set${name}`] = vi.fn((value: any) => { scope[key] = typeof value === 'function' ? value(scope[key]) : value; });
  }
  for (const name of ['handleStartRightEditing', 'updateRightMarginEntry', 'selectRightMarginAshareStock', 'handleSaveRightMargin']) {
    scope[name] = (...args: any[]) => actual(pageSource, name, scope)(...args);
  }
  const editNode = unique(pageSource, (node, file) => ts.isJsxExpression(node) && !!node.expression
    && ts.isBinaryExpression(node.expression) && node.expression.left.getText(file) === 'rightEditMode'
    && node.expression.getText(file).includes('rightMarginEdits.map'), 'right-margin editing JSX') as ts.JsxExpression;
  const render = () => evaluate(editNode.expression!.getText(ast(pageSource)), scope);
  const currentRecords = () => actual(pageSource, 'currentRightMarginRecords', { ...scope, useMemo: (fn: any) => fn() });
  const save = () => scope.handleSaveRightMargin();
  const payload = () => scope.saveTagConfigMutation.mutateAsync.mock.calls.at(-1)?.[0];
  const savedRecords = () => JSON.parse(payload().marginByCoin);
  scope.handleStartRightEditing();
  return { scope, render, currentRecords, save, payload, savedRecords };
}
function editorHarness(initial: Record<string, any> = {}) {
  const state: Record<string, any> = { quantity: '100', purchasePrice: '9.125', sales: [], ...initial };
  const onChange = vi.fn((patch: any) => Object.assign(state, patch));
  const render = () => Editor({ ...state, onChange });
  const click = (label: string) => {
    const target = button(render(), label);
    expect(target.props.disabled).not.toBe(true);
    target.props.onClick();
  };
  const change = (label: string, value: string) => field(render(), label).props.onChange({ target: { value } });
  return { state, onChange, render, click, change };
}
function rowRender(source: string, record: any, quotes: any = {}) {
  const scope: Record<string, any> = {
    ...margin, TagMarginStockSaleDetails: Details, allMarginStockQuotes: quotes, rightMarginStockQuotes: quotes,
    cryptoPrices: { USDT: 7 }, CNY_RATE_FALLBACK: 6.8, _cnyRate: 7,
  };
  const row = actualMap(source, 'rightMarginData', scope)(record, 0);
  return { row, html: renderToStaticMarkup(row) };
}

describe('37号质押A股卖出登记：真实生产前端（完全离线）', () => {
  it.each([['stock', emptyStockMargin], ['currency', emptyCurrencyMargin]] as const)('%s新增草稿买入价、原股数及卖出清单为空', (assetType, factory) => {
    const first = factory('2026-11-16'), second = factory('2026-11-16');
    expect(first).toMatchObject({ assetType, quantity: '', referencePrice: '', purchasePrice: '', sales: [], date: '2026-11-16' });
    expect(first.sales).not.toBe(second.sales);
    first.sales.push({ quantity: '1', price: '2' });
    expect(second.sales).toEqual([]);
  });
  it('toRightMarginEdit保留原100股、显式买入价和两笔独立成交价，不修改原记录', () => {
    const record = fixtureStock(), before = structuredClone(record);
    const edit = toRightMarginEdit(record, '2026-11-16');
    expect(edit).toMatchObject({ quantity: '100', purchasePrice: '9.125', referencePrice: '18',
      sales: [{ quantity: '20', price: '12.5' }, { quantity: '30', price: '15' }], label: record.label, date: record.date });
    edit.sales[0].price = '99';
    expect(record).toEqual(before);
  });
  it('旧股票无买入价不会从参考价伪造；旧currency编辑草稿不带股票数据', () => {
    const stock = fixtureStock(); delete stock.purchasePrice; delete stock.sales;
    expect(toRightMarginEdit(stock, '2026-11-16')).toMatchObject({ purchasePrice: '', sales: [], quantity: '100', referencePrice: '18' });
    expect(toRightMarginEdit(fixtureCurrency(), '2026-11-16')).toMatchObject({ assetType: 'currency', amount: '-2.5', quantity: '', purchasePrice: '', sales: [] });
  });
  it('真实保存完整JSON及原配置、ledger/tag；股数不扣卖出、买入价不替换，各笔股数价格不合并', async () => {
    const h = pageHarness([fixtureStock(), fixtureCurrency()]);
    const drafts = structuredClone(h.scope.rightMarginEdits);
    await h.save();
    expect(h.scope.saveTagConfigMutation.mutateAsync).toHaveBeenCalledOnce();
    expect(h.payload()).toEqual({ ledgerId: 37, tagName: '测试担保标签', marginByCoin: expect.any(String),
      initialAmount: '10000', accountMultiplier: '2', marginBase: '5000' });
    expect(h.savedRecords()).toEqual([fixtureCurrency(), fixtureStock()]);
    expect(h.scope.rightMarginEdits).toEqual(drafts);
    expect(h.scope.addMarginLogMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ ledgerId: 37,
      tagName: '测试担保标签', detail: expect.stringContaining('买入价¥9.125，卖出20股×¥12.5、30股×¥15') }));
  });
  it('缺tag直接退出，任何save/log/cache写入都不发生', async () => {
    const h = pageHarness(); h.scope.selectedTagForRight = null;
    await h.save();
    expect(h.scope.saveTagConfigMutation.mutateAsync).not.toHaveBeenCalled();
    expect(h.scope.addMarginLogMutation.mutateAsync).not.toHaveBeenCalled();
    expect(h.scope.setSavedRightMarginEdits).not.toHaveBeenCalled();
  });
  const invalidDrafts: Array<[string, Record<string, any>]> = [
    ['累计超卖', { sales: [{ quantity: '80', price: '12.5' }, { quantity: '21', price: '15' }] }],
    ['卖出价空', { sales: [{ quantity: '20', price: '' }] }],
    ['卖出价0', { sales: [{ quantity: '20', price: '0' }] }],
    ['卖出价负', { sales: [{ quantity: '20', price: '-1' }] }],
    ['卖出价空白', { sales: [{ quantity: '20', price: '   ' }] }],
    ['卖出价非数字', { sales: [{ quantity: '20', price: 'bad' }] }],
    ['卖出价Infinity', { sales: [{ quantity: '20', price: 'Infinity' }] }],
    ['第二笔价缺失', { sales: [{ quantity: '20', price: '12.5' }, { quantity: '30' }] }],
    ['卖出股数缺失', { sales: [{ price: '12.5' }] }],
    ['卖出股数空', { sales: [{ quantity: '', price: '12.5' }] }],
    ['卖出股数0', { sales: [{ quantity: '0', price: '12.5' }] }],
    ['卖出股数负', { sales: [{ quantity: '-1', price: '12.5' }] }],
    ['卖出股数小数', { sales: [{ quantity: '1.5', price: '12.5' }] }],
    ['卖出股数非数字', { sales: [{ quantity: 'bad', price: '12.5' }] }],
    ['卖出股数非安全整数', { sales: [{ quantity: '9007199254740992', price: '12.5' }] }],
    ['买入价0', { purchasePrice: '0' }], ['买入价负', { purchasePrice: '-2' }],
    ['买入价非数字', { purchasePrice: 'bad' }], ['买入价Infinity', { purchasePrice: 'Infinity' }],
    ['原股数负', { quantity: '-100' }], ['原股数空', { quantity: '' }],
    ['原股数0', { quantity: '0' }], ['原股数非数字', { quantity: 'bad' }],
    ['原股数Infinity', { quantity: 'Infinity' }], ['股票代码未核验', { symbol: 'AAPL' }],
    ['仅填买入价的未选股票草稿', { ...emptyStockMargin('2026-11-16'), purchasePrice: '9.125' }],
    ['仅增加卖出行的未选股票草稿', { ...emptyStockMargin('2026-11-16'), sales: [{ quantity: '', price: '' }] }],
  ];
  it.each(invalidDrafts)('%s：真实现有守卫阻止整个保存，前面有效币种也不得部分提交', async (_name, patch) => {
    const h = pageHarness([fixtureCurrency(), fixtureStock()]);
    h.scope.rightMarginEdits[1] = { ...h.scope.rightMarginEdits[1], ...patch };
    const before = structuredClone(h.scope.rightMarginEdits);
    await h.save();
    expect(h.scope.toast.error).toHaveBeenCalledOnce();
    expect(h.scope.saveTagConfigMutation.mutateAsync).not.toHaveBeenCalled();
    expect(h.scope.addMarginLogMutation.mutateAsync).not.toHaveBeenCalled();
    expect(h.scope.setSavedRightMarginEdits).not.toHaveBeenCalled();
    expect(h.scope.rightSaving).toBe(false);
    expect(h.scope.rightMarginEdits).toEqual(before);
  });
  it('保存成功后陈旧查询仍在：本地cache显示和再次编辑全部保留，再保存JSON一致', async () => {
    const staleStock = fixtureStock(); delete staleStock.purchasePrice; delete staleStock.sales;
    const h = pageHarness([staleStock]);
    h.scope.updateRightMarginEntry(0, { purchasePrice: '9.125', sales: [{ quantity: '20', price: '12.5' }, { quantity: '30', price: '15' }] });
    await h.save();
    expect(h.currentRecords()).toEqual([fixtureStock()]);
    const firstPayload = h.payload().marginByCoin;
    expect(JSON.parse(h.scope.rightTagConfig.margin_by_coin)[0]).not.toHaveProperty('sales');
    h.scope.handleStartRightEditing();
    expect(h.scope.rightMarginEdits[0]).toMatchObject({ quantity: '100', purchasePrice: '9.125',
      sales: [{ quantity: '20', price: '12.5' }, { quantity: '30', price: '15' }] });
    await h.save();
    expect(h.payload().marginByCoin).toBe(firstPayload);
  });
  it('真实远端保存拒绝不会替换本地已保存cache或丢失当前未保存草稿', async () => {
    const h = pageHarness();
    const saved = [toRightMarginEdit(fixtureStock(), '2026-11-16')];
    h.scope.savedRightMarginEdits = saved;
    h.scope.updateRightMarginEntry(0, { purchasePrice: '8.75' });
    const drafts = structuredClone(h.scope.rightMarginEdits);
    h.scope.saveTagConfigMutation.mutateAsync.mockRejectedValueOnce(new Error('offline rejection'));
    await h.save();
    expect(h.scope.savedRightMarginEdits).toBe(saved);
    expect(h.scope.setSavedRightMarginEdits).not.toHaveBeenCalled();
    expect(h.scope.rightMarginEdits).toEqual(drafts);
    expect(h.scope.addMarginLogMutation.mutateAsync).not.toHaveBeenCalled();
  });
  it.each(['添加股票', '添加数字币 / 人民币', '+ 添加数字币 / 人民币'])('真实点击%s追加空草稿，不丢弃旧记录或当前未保存成交价格，保存跳过空行', async label => {
    const h = pageHarness([fixtureStock(), fixtureCurrency()]);
    h.scope.updateRightMarginEntry(0, { purchasePrice: '8.75', sales: [{ quantity: '20', price: '13.25' }, { quantity: '30', price: '15' }], label: '尚未保存的备注' });
    const drafts = structuredClone(h.scope.rightMarginEdits);
    button(h.render(), label).props.onClick();
    expect(h.scope.rightMarginEdits).toHaveLength(3);
    expect(h.scope.rightMarginEdits.filter((entry: any) => entry.symbol || entry.amount)).toEqual(drafts);
    await h.save();
    expect(h.savedRecords()).toHaveLength(2);
    expect(h.savedRecords().find((entry: any) => entry.assetType === 'stock')).toMatchObject({ quantity: 100,
      purchasePrice: 8.75, sales: [{ quantity: 20, price: 13.25 }, { quantity: 30, price: 15 }], label: '尚未保存的备注' });
  });
  it('currency行反向点击新增股票也保留旧未保存币种金额和原股票卖出字段', async () => {
    const h = pageHarness([fixtureStock(), fixtureCurrency()]);
    h.scope.updateRightMarginEntry(1, { amount: '-3.75', label: '币种草稿' });
    const drafts = structuredClone(h.scope.rightMarginEdits);
    button(h.render(), '+ 添加股票').props.onClick();
    expect(h.scope.rightMarginEdits.slice(0, 2)).toEqual(drafts);
    await h.save();
    expect(h.savedRecords()[0]).toEqual({ ...fixtureCurrency(), amount: -3.75, label: '币种草稿' });
    expect(h.savedRecords()[1]).toEqual(fixtureStock());
  });
  it('旧currency序列化仍只含原币种字段，默认草稿stock字段不泄漏', async () => {
    const h = pageHarness([fixtureCurrency()]);
    await h.save();
    expect(h.savedRecords()).toEqual([fixtureCurrency()]);
    expect(Object.keys(h.savedRecords()[0]).sort()).toEqual(['amount', 'assetType', 'coin', 'date', 'label']);
    expect(h.currentRecords()).toEqual([fixtureCurrency()]);
  });
  it('真实页面Editor接收同一草稿，登记/输入价股数通过生产onChange进入完整save payload', async () => {
    const stock = fixtureStock(); delete stock.sales;
    const h = pageHarness([stock]);
    const component = () => nodes(h.render()).find(node => node.type === Editor);
    expect(component().props).toMatchObject({ quantity: '100', purchasePrice: '9.125', sales: [] });
    button(Editor(component().props), '登记卖出').props.onClick();
    field(Editor(component().props), '第1笔卖出股数').props.onChange({ target: { value: '20' } });
    field(Editor(component().props), '第1笔卖出价格').props.onChange({ target: { value: '12.5' } });
    await h.save();
    expect(h.savedRecords()[0]).toMatchObject({ quantity: 100, purchasePrice: 9.125, sales: [{ quantity: 20, price: 12.5, feeRate: 0.001, date: today }] });
  });
  it('真实Editor连续登记两笔，改单笔股数/价不改变另一笔或原买入价，移除只删目标', () => {
    const h = editorHarness();
    h.click('登记卖出'); h.change('第1笔卖出股数', '20'); h.change('第1笔卖出价格', '12.5');
    h.click('登记卖出'); h.change('第2笔卖出股数', '30'); h.change('第2笔卖出价格', '15');
    const untouched = h.state.sales[1];
    h.change('第1笔卖出价格', '13.25'); h.change('第1笔卖出股数', '25');
    expect(h.state.sales).toEqual([{ quantity: '25', price: '13.25', feeRate: 0.001, date: today }, { quantity: '30', price: '15', feeRate: 0.001, date: today }]);
    expect(h.state.sales[1]).toBe(untouched);
    expect(h.state.purchasePrice).toBe('9.125'); expect(h.state.quantity).toBe('100');
    h.click('移除第1笔卖出');
    expect(h.state.sales).toEqual([{ quantity: '30', price: '15', feeRate: 0.001, date: today }]);
    expect(h.state.sales[0]).toBe(untouched); expect(h.state.purchasePrice).toBe('9.125');
  });
  it('剩余全卖只填扣除其它销售的剩余股数，保留该笔成交价和其他行及买入价', () => {
    const h = editorHarness({ sales: [{ quantity: '20', price: '12.5' }, { quantity: '10', price: '15' }] });
    const first = h.state.sales[0];
    const row = nodes(h.render()).find(node => node.props?.['data-stock-sale-row'] === 1);
    button(row, '剩余全卖').props.onClick();
    expect(h.state.sales).toEqual([{ quantity: '20', price: '12.5' }, { quantity: '80', price: '15' }]);
    expect(h.state.sales[0]).toBe(first); expect(h.state.purchasePrice).toBe('9.125'); expect(h.state.quantity).toBe('100');
    expect(button(h.render(), '登记卖出').props.disabled).toBe(true);
    expect(text(h.render())).toContain('已卖 100 股 · 剩余 0 股');
  });
  it('买入价真实输入只更新buyprice，不改变sales；新增卖出初值不是参考价或买入价', () => {
    const h = editorHarness({ sales: [{ quantity: '20', price: '12.5' }] });
    const sales = h.state.sales;
    h.change('买入价（保留）', '7.875');
    expect(h.state.sales).toBe(sales); expect(h.state.purchasePrice).toBe('7.875');
    h.click('登记卖出');
    expect(h.state.sales[1]).toEqual({ quantity: '', price: '', feeRate: 0.001, date: today });
    expect(text(h.render())).toContain('这里只登记，不发起实际交易');
  });
  it.each(['', '0', '-1', 'NaN'])('原股数%s时登记卖出入口禁用', quantity => {
    const h = editorHarness({ quantity });
    expect(button(h.render(), '登记卖出').props.disabled).toBe(true);
    expect(h.onChange).not.toHaveBeenCalled();
  });
  it('真实选股回填/晚行情只更新reference字段；用户买入价与各笔成交价始终不反向覆盖', async () => {
    const h = pageHarness();
    h.scope.updateRightMarginEntry(0, { purchasePrice: '8.75', sales: [{ quantity: '20', price: '13.25' }, { quantity: '30', price: '15' }] });
    const entered = structuredClone(h.scope.rightMarginEdits[0]);
    for (const latestPrice of [999, 0, 21]) {
      h.scope.selectRightMarginAshareStock(0, { symbol: '600519.SH', code: '600519', name: '贵州茅台', latestPrice,
        latestPriceDate: '2026-11-16', latestPriceUpdatedAt: '2026-11-16T07:05:00Z' });
      expect(h.scope.rightMarginEdits[0]).toMatchObject({ quantity: entered.quantity, purchasePrice: entered.purchasePrice, sales: entered.sales });
    }
    const quoteEffects = matching(pageSource, (node, file) => ts.isCallExpression(node)
      && node.expression.getText(file) === 'useEffect' && !!node.arguments[1]
      && /allMarginStockQuotes|allMarginStockCloseQuery/.test(node.arguments[1].getText(file)));
    for (const effect of quoteEffects) expect((effect as ts.CallExpression).arguments[0].getText(ast(pageSource)))
      .not.toMatch(/setRightMarginEdits|updateRightMarginEntry|purchasePrice|sales/);
    await h.save();
    expect(h.savedRecords()[0]).toMatchObject({ purchasePrice: 8.75, quantity: 100, referencePrice: 21,
      sales: [{ quantity: 20, price: 13.25 }, { quantity: 30, price: 15 }] });
  });
  it('Details真实服务端渲染显示买入价和每笔卖出股数/独立价格/价值', () => {
    const html = renderToStaticMarkup(React.createElement(Details, { record: fixtureStock() }));
    expect(html).toContain('买入价：¥9.125');
    expect(html).toContain('卖出 ¥12.5 × 20股 = ¥250.00');
    expect(html).toContain('卖出 ¥15 × 30股 = ¥450.00');
    expect(html).toContain('已卖出价值：¥700.00');
    expect(html).toContain('剩余 50股按参考价估值');
    expect(html).not.toContain('全部卖出');
  });
  it('旧未登记购买价有sales显示“未登记”，纯旧未卖出行不伪造任何买入价', () => {
    const record = fixtureStock(); delete record.purchasePrice;
    const html = renderToStaticMarkup(React.createElement(Details, { record }));
    expect(html).toContain('买入价：未登记'); expect(html).not.toContain('买入价：¥18');
    delete record.sales;
    expect(Details({ record })).toBeNull();
    expect(renderToStaticMarkup(React.createElement(Details, { record }))).toBe('');
  });
  it('Details无效卖出真实渲染为待纠正，不呈现伪造价值或伪全卖', () => {
    const record = fixtureStock({ sales: [{ quantity: 101, price: 15 }] });
    const html = renderToStaticMarkup(React.createElement(Details, { record }));
    expect(html).toContain('卖出数据待纠正，估值暂不可用');
    expect(html).not.toContain('已卖出价值'); expect(html).not.toContain('全部卖出');
  });
  it('页面与只读真实股票行都接相同Details(record)和同一shared估值函数', () => {
    const record = fixtureStock(), before = structuredClone(record);
    const value = vi.fn(margin.getTagMarginStockMarketValue);
    const quotes = { '600519.SH': { price: 20, priceDate: '2026-11-16', updatedAt: '2026-11-16T07:05:00Z' } };
    for (const source of [pageSource, readOnlySource]) {
      const scope = { ...margin, getTagMarginStockMarketValue: value, TagMarginStockSaleDetails: Details,
        allMarginStockQuotes: quotes, rightMarginStockQuotes: quotes, cryptoPrices: { USDT: 7 }, _cnyRate: 7, CNY_RATE_FALLBACK: 6.8 };
      const row = actualMap(source, 'rightMarginData', scope)(record, 0);
      const details = nodes(row).filter(node => node.type === Details);
      expect(details).toHaveLength(1); expect(details[0].props.record).toBe(record);
      const html = renderToStaticMarkup(row);
      expect(html).toContain('保证金价值 ¥1,700'); expect(html).toContain('买入价：¥9.125');
      expect(html).toContain('已卖出价值：¥700.00'); expect(html).toContain('剩余 50股按参考价估值');
    }
    expect(value).toHaveBeenCalledTimes(2);
    expect(value).toHaveBeenNthCalledWith(1, record, quotes); expect(value).toHaveBeenNthCalledWith(2, record, quotes);
    expect(record).toEqual(before);
  });
  it.each([['管理页', pageSource], ['只读详情', readOnlySource]])('%s全部卖出无需任何报价，显示成交价值及fixed，不显示行情/估值待获取', (_name, source) => {
    const record = fixtureStock({ referencePrice: 0, sales: [{ quantity: 20, price: 12.5 }, { quantity: 80, price: 15 }] });
    const before = structuredClone(record);
    const noQuote = rowRender(source, record), changedQuote = rowRender(source, record, { '600519.SH': { price: 999 } });
    expect(noQuote.html).toContain('卖出价值 ¥1,450'); expect(noQuote.html).toContain('已卖出价值：¥1,450.00');
    expect(noQuote.html).toContain('全部卖出，价值按成交价固定'); expect(noQuote.html).toContain('买入价：¥9.125');
    expect(noQuote.html).not.toMatch(/估值待获取|暂用参考价|参考价 ¥|999/);
    expect(changedQuote.html).toBe(noQuote.html);
    expect(margin.getTagMarginStockSymbols([record])).toEqual([]);
    expect(record).toEqual(before);
  });
  it('只读整组件真实渲染全卖仍有股票合计，无持仓代码不启用报价查询、不注册任何mutation', () => {
    const record = fixtureStock({ referencePrice: 0, sales: [{ quantity: 100, price: 15 }] });
    const calls: Array<{ name: string; args: any; options: any }> = [];
    const scope: Record<string, any> = { ...margin, TagMarginStockSaleDetails: Details,
      CNY_RATE_FALLBACK: 6.8, isCnyMarginCoin: actual(readOnlySource, 'isCnyMarginCoin'), useMemo: (fn: any) => fn() };
    scope.toCNY = actual(readOnlySource, 'toCNY', scope);
    const response: Record<string, any> = { getCategories: [], getTagConfig: { margin_by_coin: JSON.stringify([record]) },
      getTagSummary: {}, getTransactions: [], getCryptoPrices: { usdtCnyRate: 7, prices: {} },
      getTagMarginValuation: undefined, getManualStockCloseSnapshots: { quotes: {} } };
    const endpoint = (name: string) => ({ useQuery: (args: any, options: any) => {
      if (!(name in response)) throw new Error(`Unexpected production query ${name}`);
      calls.push({ name, args, options }); return { data: response[name] };
    }, useMutation: () => { throw new Error('Read-only component must never create a mutation'); } });
    const ledger = Object.fromEntries(Object.keys(response).map(name => [name, endpoint(name)]));
    scope.trpc = { ledger, getCryptoPrices: endpoint('getCryptoPrices'), getManualStockCloseSnapshots: endpoint('getManualStockCloseSnapshots') };
    const tree = actual(readOnlySource, 'RightMarginDetail', scope)({ ledgerId: 37, tagName: '测试担保标签' });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('卖出价值 ¥1,500'); expect(html).toContain('全部卖出，价值按成交价固定');
    expect(html).toContain('股票价值'); expect(html).not.toContain('估值待获取');
    expect(calls.find(call => call.name === 'getManualStockCloseSnapshots')).toMatchObject({ args: { symbols: [] }, options: { enabled: false } });
    expect(calls.find(call => call.name === 'getTagMarginValuation')).toMatchObject({ args: { ledgerId: 37, tagName: '测试担保标签' } });
    expect(nodes(tree).some(node => node.type === Editor)).toBe(false);
  });
});

describe('登记边界：生产AST守卫（不启动后端）', () => {
  it('saveTagConfig仍为protectedProcedure，真实owner/admin membership守卫位于校验与DB操作之前', () => {
    const property = unique(routerSource, node => ts.isPropertyAssignment(node)
      && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === 'saveTagConfig', 'saveTagConfig route') as ts.PropertyAssignment;
    let root: ts.Expression = property.initializer;
    while (ts.isCallExpression(root) || ts.isPropertyAccessExpression(root)) root = root.expression;
    expect(root.getText(ast(routerSource))).toBe('protectedProcedure');
    const mutation = unique(property.getText(ast(routerSource)), node => ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'mutation', 'saveTagConfig mutation') as ts.CallExpression;
    const callback = mutation.arguments[0] as ts.ArrowFunction;
    expect(ts.isArrowFunction(callback) && ts.isBlock(callback.body)).toBe(true);
    const block = callback.body as ts.Block;
    const routeFile = ast(property.getText(ast(routerSource)));
    const statements = [...block.statements];
    const membership = statements.find(statement => ts.isVariableStatement(statement)
      && statement.declarationList.declarations.some(item => item.name.getText(routeFile) === 'myMembership'))!;
    expect(membership.getText(routeFile)).toContain('getUserMembership(input.ledgerId, ctx.user.id)');
    const guard = statements.find(statement => ts.isIfStatement(statement)
      && statement.expression.getText(routeFile).includes('myMembership.role')) as ts.IfStatement;
    expect(guard).toBeTruthy();
    const validationIndex = statements.findIndex(statement => ts.isExpressionStatement(statement)
      && ts.isCallExpression(statement.expression) && statement.expression.expression.getText(routeFile) === 'validateTagMarginStockSales');
    const dbIndex = statements.findIndex(statement => ts.isVariableStatement(statement)
      && statement.declarationList.declarations.some(item => item.name.getText(routeFile) === 'db'));
    expect(statements.indexOf(membership)).toBeLessThan(statements.indexOf(guard));
    expect(statements.indexOf(guard)).toBeLessThan(validationIndex); expect(validationIndex).toBeLessThan(dbIndex);
    class OfflineTRPCError extends Error { code: string; constructor(options: { code: string; message: string }) { super(options.message); this.code = options.code; } }
    for (const role of [null, 'member', 'viewer', 'OWNER', 'owner', 'admin']) {
      const run = evaluate(`() => { ${guard.getText(routeFile)}; return 'allowed'; }`, {
        myMembership: role === null ? null : { role }, TRPCError: OfflineTRPCError,
      });
      if (role === 'owner' || role === 'admin') expect(run()).toBe('allowed');
      else expect(run).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    }
  });
  it('前端登记走原saveTagConfig，无fetch/axios/交易所SDK/WebSocket直连，不添加买卖mutation', () => {
    const save = declaration(pageSource, 'handleSaveRightMargin').getText(ast(pageSource));
    expect(save).toContain('saveTagConfigMutation.mutateAsync');
    for (const source of [pageSource, readOnlySource, editorSource, detailsSource]) {
      const directTransport = matching(source, (node, file) => {
        if (ts.isNewExpression(node)) return /(?:^|\.)(?:WebSocket|XMLHttpRequest)$/.test(node.expression.getText(file));
        if (!ts.isCallExpression(node)) return false;
        const callee = node.expression.getText(file);
        return /(?:^|\.)(?:fetch|fetchOrder|createOrder)$/.test(callee) || /^axios(?:\.|$)/.test(callee);
      });
      expect(directTransport).toEqual([]);
      const exchangeURLs = matching(source, node => ts.isStringLiteralLike(node)
        && /^https?:\/\//.test(node.text) && /gate(?:io|\.io)|binance|okx|coinbase|exchange/i.test(node.text));
      expect(exchangeURLs).toEqual([]);
      const forbiddenImports = matching(source, node => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
        && /ccxt|axios|gate-api|binance|okx/i.test(node.moduleSpecifier.text));
      expect(forbiddenImports).toEqual([]);
      const tradeMutations = matching(source, (node, file) => ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'useMutation'
        && /StockTagEvent|StockTagSale|StockTrade|createOrder|executeTrade/.test(node.expression.getText(file)));
      expect(tradeMutations).toEqual([]);
    }
  });
});

const allocationSource = readFileSync(new URL('../client/src/pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
describe('历史纠错与股票身份：真实生产前端回归', () => {
  it.each([
    ['null', null], ['对象', { quantity: 20, price: 12.5 }], ['字符串', 'bad historical sales'],
    ['数字', 1], ['数组null项', [null]], ['数组缺股数', [{ price: 12.5 }]],
    ['数组缺价格', [{ quantity: 20 }]], ['有效行后null', [{ quantity: 20, price: 12.5 }, null]],
  ] as Array<[string, any]>)('历史sales为%s：真实回填不崩溃、不静默清空，空行修复或主动移除后才允许保存', async (_label, sales) => {
    const record = fixtureStock({ sales }), before = structuredClone(record);
    const h = pageHarness([record]);
    const edit = h.scope.rightMarginEdits[0];
    expect(edit).toMatchObject({ quantity: '100', purchasePrice: '9.125' });
    expect(edit.sales.length).toBeGreaterThan(0);
    expect(edit.sales.at(-1)).toEqual({ quantity: sales?.[0]?.quantity === 20 && sales?.length === 1 ? '20' : '',
      price: sales?.[0]?.price === 12.5 && sales?.length === 1 ? '12.5' : '' });
    expect(() => renderToStaticMarkup(Editor(nodes(h.render()).find(node => node.type === Editor).props))).not.toThrow();
    await h.save();
    expect(h.scope.saveTagConfigMutation.mutateAsync).not.toHaveBeenCalled();
    expect(h.scope.toast.error).toHaveBeenCalled();
    expect(h.scope.setSavedRightMarginEdits).not.toHaveBeenCalled();
    // The administrator explicitly removes only the malformed registration using its real button.
    const component = nodes(h.render()).find(node => node.type === Editor);
    button(Editor(component.props), `移除第${edit.sales.length}笔卖出`).props.onClick();
    await h.save();
    expect(h.scope.saveTagConfigMutation.mutateAsync).toHaveBeenCalledOnce();
    expect(h.savedRecords()[0]).toMatchObject({ quantity: 100, purchasePrice: 9.125 });
    if (Array.isArray(sales) && sales.length === 2) expect(h.savedRecords()[0].sales).toEqual([{ quantity: 20, price: 12.5 }]);
    else expect(h.savedRecords()[0]).not.toHaveProperty('sales');
    expect(record).toEqual(before);
  });
  it('历史非法sales空行可通过真实Editor补股数和成交价再保存，不要求重新录入buyprice', async () => {
    const h = pageHarness([fixtureStock({ sales: null })]);
    const component = () => nodes(h.render()).find(node => node.type === Editor);
    field(Editor(component().props), '第1笔卖出股数').props.onChange({ target: { value: '25' } });
    field(Editor(component().props), '第1笔卖出价格').props.onChange({ target: { value: '16.125' } });
    await h.save();
    expect(h.savedRecords()[0]).toMatchObject({ quantity: 100, purchasePrice: 9.125, sales: [{ quantity: 25, price: 16.125 }] });
  });
  it.each([
    ['只登记买入价', { purchasePrice: 9.125, sales: [] }],
    ['只登记卖出', { sales: [{ quantity: 20, price: 12.5 }] }],
    ['两类成交数据', {}], ['历史非法sales空行', { sales: null }],
  ] as Array<[string, Record<string, any>]>)('%s存在时真实选股拒绝切到另一六码，草稿身份、买入价和sales原封不动', (_name, patch) => {
    const stock = fixtureStock(patch);
    if (_name === '只登记卖出') delete stock.purchasePrice;
    const h = pageHarness([stock]);
    h.scope.rightMarginStockLookupRow = 0; h.scope.rightMarginStockLookupInput = '平安银行';
    const before = structuredClone(h.scope.rightMarginEdits);
    h.scope.selectRightMarginAshareStock(0, { symbol: '000001.SZ', code: '000001', name: '平安银行', latestPrice: 20 });
    expect(h.scope.rightMarginEdits).toEqual(before);
    expect(h.scope.toast.error).toHaveBeenCalledOnce();
    expect(h.scope.setRightMarginEdits).toHaveBeenCalledOnce(); // Initial edit only; rejected selection has no setter.
    expect(h.scope.rightMarginStockLookupRow).toBe(0);
    expect(h.scope.rightMarginStockLookupInput).toBe('平安银行');
    expect(h.scope.saveTagConfigMutation.mutateAsync).not.toHaveBeenCalled();
  });
  it('没有任何成交数据的旧草稿仍可正常选另一股，新参考价不伪造买入价或sales', async () => {
    const stock = fixtureStock(); delete stock.purchasePrice; delete stock.sales;
    const h = pageHarness([stock]);
    h.scope.selectRightMarginAshareStock(0, { symbol: '000001.SZ', code: '000001', name: '平安银行', latestPrice: 20 });
    expect(h.scope.rightMarginEdits[0]).toMatchObject({ symbol: '000001.SZ', code: '000001', name: '平安银行',
      referencePrice: '20', purchasePrice: '', sales: [], quantity: '100' });
    expect(h.scope.toast.error).not.toHaveBeenCalled();
    await h.save();
    expect(h.savedRecords()[0]).toMatchObject({ symbol: '000001.SZ', code: '000001', referencePrice: 20 });
    expect(h.savedRecords()[0]).not.toHaveProperty('purchasePrice'); expect(h.savedRecords()[0]).not.toHaveProperty('sales');
  });
  it.each([
    ['buyprice', { purchasePrice: '9.125', sales: [] }],
    ['sales', { purchasePrice: '', sales: [{ quantity: '20', price: '12.5' }] }],
    ['both', { purchasePrice: '9.125', sales: [{ quantity: '20', price: '12.5' }] }],
  ] as Array<[string, Record<string, any>]>)('手输symbol绕过切股：保留%s但六码code不同，真实save禁止提交而不丢草稿', async (_label, additions) => {
    const h = pageHarness([fixtureCurrency(), fixtureStock()]);
    h.scope.updateRightMarginEntry(1, { ...additions, symbol: '000001.SZ' });
    const before = structuredClone(h.scope.rightMarginEdits);
    await h.save();
    expect(h.scope.saveTagConfigMutation.mutateAsync).not.toHaveBeenCalled();
    expect(h.scope.addMarginLogMutation.mutateAsync).not.toHaveBeenCalled();
    expect(h.scope.setSavedRightMarginEdits).not.toHaveBeenCalled();
    expect(h.scope.toast.error).toHaveBeenCalledOnce(); expect(h.scope.rightSaving).toBe(false);
    expect(h.scope.rightMarginEdits).toEqual(before);
  });
  it('原负股数历史共享读口径不改；本轮登记仍只允许正原股数加正卖出股数', () => {
    const record = fixtureStock({ quantity: -10 }); delete record.purchasePrice; delete record.sales;
    expect(margin.getTagMarginStockSaleSummary(record)).toMatchObject({ valid: true, remainingQuantity: -10 });
    expect(margin.getTagMarginStockMarketValue(record, {})).toBe(-180);
    expect(margin.getTagMarginStockSaleSummary(fixtureStock({ quantity: -10, sales: [{ quantity: 1, price: 12.5 }] })).valid).toBe(false);
  });
});

function allocationSettingsHarness(ledgerId: number, raw: string | undefined) {
  const scope: Record<string, any> = {
    ledgerId, selectedTagName: '测试担保标签', isLocalHotPreview: false,
    tagConfigData: { margin_by_coin: raw },
    marginEdits: [{ coin: 'ETH', amount: '2.5' }, { coin: '元', amount: '-100' }, { coin: 'USDT', amount: '' }],
    pnlManualEdits: [{ reason: '真实设置更正', amount: '-3.5' }, { reason: '空项', amount: '' }],
    tagConfigForm: { settlementAmount: '2000', interestMode: 'profit_only', interestRate: '1.5', interestBaseAmount: '500',
      interestStartDate: '2026-11-01', pauseDate: '2026-11-15', endDate: '2026-12-01', note: '只改配置不动质押股票',
      pnlNote: '盈亏备注', originalAmount: '10000', targetTotal: '12000' },
    setTagConfigSaving: vi.fn(), toast: { info: vi.fn() }, saveTagConfigMutation: { mutate: vi.fn() },
  };
  const run = () => actual(allocationSource, 'handleSaveTagConfig', scope)();
  const payload = () => scope.saveTagConfigMutation.mutate.mock.calls.at(-1)?.[0];
  return { scope, run, payload };
}
describe('旧标签设置页不覆盖37号结构化保证金：真实handleSaveTagConfig', () => {
  it.each([['带买入价及sales', JSON.stringify([fixtureStock(), fixtureCurrency()])], ['空数组', '[]'],
    ['只含currency逐笔记录', JSON.stringify([fixtureCurrency()])]])('37号%s保留结构化margin_by_coin，wire payload不传marginByCoin且其它配置正常保存', (_label, raw) => {
    const h = allocationSettingsHarness(37, raw);
    // Simulate the old editor's dangerous array-to-dictionary draft. The actual handler must not send it.
    h.scope.marginEdits = [{ coin: '0', amount: '[object Object]' }];
    h.run();
    expect(h.scope.saveTagConfigMutation.mutate).toHaveBeenCalledOnce();
    expect(h.payload()).toEqual({ ledgerId: 37, tagName: '测试担保标签', settlementAmount: '2000', interestMode: 'profit_only',
      interestRate: '1.5', interestBaseAmount: '500', interestStartDate: '2026-11-01', pauseDate: '2026-11-15',
      endDate: '2026-12-01', note: '只改配置不动质押股票', marginByCoin: undefined,
      pnlManual: JSON.stringify([{ reason: '真实设置更正', amount: -3.5 }]), pnlNote: '盈亏备注',
      originalAmount: '10000', targetTotal: '12000' });
    expect(JSON.parse(JSON.stringify(h.payload()))).not.toHaveProperty('marginByCoin');
    expect(h.scope.tagConfigData.margin_by_coin).toBe(raw);
    expect(h.scope.setTagConfigSaving).toHaveBeenCalledWith(true);
  });
  it.each([
    ['37号旧字典', 37, '{"ETH":1}'], ['37号缺省', 37, undefined], ['37号损坏JSON', 37, '{bad'],
    ['37号null', 37, 'null'], ['非37号结构化数组', 52, JSON.stringify([fixtureStock()])],
    ['非37号旧字典', 52, '{"ETH":1}'],
  ] as Array<[string, number, string | undefined]>)('%s维持原字典序列化，不把其它账本升级为新编辑器', (_label, ledgerId, raw) => {
    const h = allocationSettingsHarness(ledgerId, raw); h.run();
    expect(h.scope.saveTagConfigMutation.mutate).toHaveBeenCalledOnce();
    expect(h.payload()).toMatchObject({ ledgerId, tagName: '测试担保标签', note: '只改配置不动质押股票', targetTotal: '12000' });
    expect(JSON.parse(h.payload().marginByCoin)).toEqual({ ETH: 2.5, 元: -100 });
    expect(h.scope.tagConfigData.margin_by_coin).toBe(raw);
  });
  it.each(['hot-preview', 'missing-tag'])('原%s守卫依然阻止旧设置保存及saving状态切换', mode => {
    const h = allocationSettingsHarness(37, JSON.stringify([fixtureStock()]));
    if (mode === 'hot-preview') h.scope.isLocalHotPreview = true;
    else h.scope.selectedTagName = null;
    h.run();
    expect(h.scope.saveTagConfigMutation.mutate).not.toHaveBeenCalled();
    expect(h.scope.setTagConfigSaving).not.toHaveBeenCalled();
  });
});

// Fee regressions reuse the production AST harness above; all amounts/valuation come
// from the actual shared exports. Literal expectations pin the business contract.
function pageEditor(h: ReturnType<typeof pageHarness>, index = 0) {
  const render = () => {
    const component = nodes(h.render()).filter(node => node.type === Editor)[index];
    if (!component) throw new Error(`Missing production Editor ${index}`);
    return Editor(component.props);
  };
  return {
    render,
    click: (label: string) => {
      const target = button(render(), label);
      expect(target.props.disabled).not.toBe(true);
      target.props.onClick();
    },
    change: (label: string, value: string) => field(render(), label).props.onChange({ target: { value } }),
  };
}
const feeStock = (patch: Record<string, any> = {}) => fixtureStock({
  sales: [{ quantity: 20, price: 12.5, feeRate: 0.001 }, { quantity: 30, price: 15, feeRate: 0.001 }], ...patch,
});
const registeredFeeStock = () => feeStock({
  sales: [{ quantity: 20, price: 12.5, feeRate: 0.001, date: today }, { quantity: 30, price: 15, feeRate: 0.001, date: today }],
});
function expectNoSave(h: ReturnType<typeof pageHarness>) {
  expect(h.scope.saveTagConfigMutation.mutateAsync).not.toHaveBeenCalled();
  expect(h.scope.addMarginLogMutation.mutateAsync).not.toHaveBeenCalled();
  expect(h.scope.setSavedRightMarginEdits).not.toHaveBeenCalled();
  expect(h.scope.refetchMarginLogs).not.toHaveBeenCalled();
  expect(h.scope.rightSaving).toBe(false);
}
function feeTotalHarness(source: string, localName: string, records: any[], canonical: any = undefined) {
  const scope: Record<string, any> = {
    ...margin, useMemo: (fn: any) => fn(), rightMarginData: records,
    cryptoPrices: { USDT: 7, CNY: 1, RMB: 1 }, CNY_RATE_FALLBACK: 6.8, _cnyRate: 7,
    allMarginStockQuotes: {}, rightMarginStockQuotes: {}, canonicalMarginValuation: canonical,
  };
  scope.isCnyMarginCoin = actual(source, 'isCnyMarginCoin');
  scope.toCNY = actual(source, 'toCNY', scope);
  scope[localName] = actual(source, localName, scope);
  scope.rightMarginValueSummary = actual(source, 'rightMarginValueSummary', scope);
  scope.rightTotalCNY = actual(source, 'rightTotalCNY', scope);
  const label = unique(source, (node, file) => ts.isJsxElement(node)
    && node.openingElement.tagName.getText(file) === 'span'
    && node.children.some(child => ts.isJsxText(child) && child.text.trim() === '总担保价值'), 'fee total label');
  if (!ts.isJsxElement(label.parent)) throw new Error('Missing actual total row');
  return { scope, html: renderToStaticMarkup(evaluate(label.parent.getText(ast(source)), scope)) };
}

describe('1‰手续费：真实前端事件、保存、缓存与共享估值', () => {
  it('真实公开helper固定1‰且旧summary契约不增加key，legacy仍为gross', () => {
    expect(margin.TAG_MARGIN_STOCK_FEE_RATE).toBe(0.001);
    expect(margin.getTagMarginStockSaleAmounts({ quantity: 20, price: 12.5, feeRate: 0.001 }, 9.125))
      .toEqual({ valid: true, grossValue: 250, buyFee: 0.18, sellFee: 0.25, totalFee: 0.43, netValue: 249.57 });
    expect(margin.getTagMarginStockSaleAmounts({ quantity: 20, price: 12.5 }))
      .toEqual({ valid: true, grossValue: 250, buyFee: 0, sellFee: 0, totalFee: 0, netValue: 250 });
    expect(margin.getTagMarginStockSaleSummary(fixtureStock()))
      .toEqual({ valid: true, soldQuantity: 50, saleValue: 700, remainingQuantity: 50 });
    expect(Object.keys(margin.getTagMarginStockSaleSummary(feeStock())).sort())
      .toEqual(['remainingQuantity', 'saleValue', 'soldQuantity', 'valid']);
  });
  it('新行自动1‰；输入、剩余全卖和删除保留本行费率且不动另一行、买价、原库存', () => {
    const h = editorHarness();
    h.click('登记卖出');
    expect(h.state.sales).toEqual([{ quantity: '', price: '', feeRate: 0.001, date: today }]);
    h.change('第1笔卖出股数', '20'); h.change('第1笔卖出价格', '12.5');
    h.click('登记卖出'); h.change('第2笔卖出价格', '15');
    const first = h.state.sales[0];
    const secondRow = nodes(h.render()).find(node => node.props?.['data-stock-sale-row'] === 1);
    button(secondRow, '剩余全卖').props.onClick();
    expect(h.state.sales).toEqual([{ quantity: '20', price: '12.5', feeRate: 0.001, date: today }, { quantity: '80', price: '15', feeRate: 0.001, date: today }]);
    expect(h.state.sales[0]).toBe(first);
    expect(text(h.render())).toContain('已卖 100 股 · 剩余 0 股');
    expect(button(h.render(), '登记卖出').props.disabled).toBe(true);
    h.click('移除第2笔卖出');
    expect(h.state.sales).toEqual([{ quantity: '20', price: '12.5', feeRate: 0.001, date: today }]);
    expect(h.state.sales[0]).toBe(first);
    expect(h.state).toMatchObject({ quantity: '100', purchasePrice: '9.125' });
  });
  it('Editor与Details逐笔显示本笔q的两费、合计、净额，不按原库存收取买入费', () => {
    const record = feeStock(), before = structuredClone(record);
    const edit = toRightMarginEdit(record, '2026-11-16');
    const editor = Editor({ ...edit, onChange: vi.fn() }), details = Details({ record });
    const expected = [
      { buy: '0.18', sell: '0.25', total: '0.43', net: '249.57' },
      { buy: '0.27', sell: '0.45', total: '0.72', net: '449.28' },
    ];
    expected.forEach((value, index) => {
      const editText = text(nodes(editor).find(node => node.props?.['data-stock-sale-fees'] === index));
      const detailText = text(nodes(details).find(node => node.props?.['data-stock-sale-detail'] === index));
      expect(editText).toContain(`买入手续费 ¥${value.buy}`);
      expect(editText).toContain(`卖出手续费 ¥${value.sell}`);
      expect(detailText).toContain(`买入手续费（1‰）：¥${value.buy}`);
      expect(detailText).toContain(`卖出手续费（1‰）：¥${value.sell}`);
      for (const output of [editText, detailText]) {
        expect(output).toContain(`手续费合计：¥${value.total}`);
        expect(output).toContain(`扣费后卖出价值：¥${value.net}`);
      }
    });
    expect(text(details)).toContain('买入价：¥9.125');
    expect(text(details)).toContain('已卖出价值：¥698.85（已扣登记手续费）');
    expect(margin.getTagMarginStockSaleSummary(record))
      .toEqual({ valid: true, soldQuantity: 50, saleValue: expect.closeTo(698.85, 10), remainingQuantity: 50 });
    expect(margin.getTagMarginStockMarketValue(record, {})).toBe(1598.85);
    expect(record).toEqual(before);
  });
  it('分别half-up到分，分两笔不可先合并股数/两费才舍入；真实显示保留结果', async () => {
    const record = feeStock({ purchasePrice: 5, referencePrice: 0, quantity: 2,
      sales: [{ quantity: 1, price: 5, feeRate: 0.001 }, { quantity: 1, price: 5, feeRate: 0.001 }] });
    for (const sale of record.sales) expect(margin.getTagMarginStockSaleAmounts(sale, 5))
      .toEqual({ valid: true, grossValue: 5, buyFee: 0.01, sellFee: 0.01, totalFee: 0.02, netValue: 4.98 });
    const h = pageHarness([record]);
    await h.save();
    expect(h.savedRecords()).toEqual([record]);
    expect(margin.getTagMarginStockMarketValue(h.currentRecords()[0] as any, {})).toBe(9.96);
    const html = renderToStaticMarkup(React.createElement(Details, { record }));
    expect(html.match(/买入手续费（1‰）：¥0\.01/g)).toHaveLength(2);
    expect(html.match(/卖出手续费（1‰）：¥0\.01/g)).toHaveLength(2);
    expect(html).toContain('已卖出价值：¥9.96');
    expect(margin.getTagMarginStockSaleAmounts({ quantity: 1000, price: 1.005, feeRate: 0.001 }, 1.005))
      .toMatchObject({ buyFee: 1.01, sellFee: 1.01, totalFee: 2.02 });
  });
  it.each(['0', '-1', 'bad', 'NaN', 'Infinity'])('计费行显式非法买入价%s：不显示假0费，真实保存阻断全部mutation；补有效买价后可保存', async purchasePrice => {
    const stock = fixtureStock({ sales: [] }); delete stock.purchasePrice;
    const h = pageHarness([fixtureCurrency(), stock]);
    const editor = pageEditor(h);
    editor.click('登记卖出'); editor.change('第1笔卖出股数', '20'); editor.change('第1笔卖出价格', '12.5');
    editor.change('买入价（保留）', purchasePrice);
    const before = structuredClone(h.scope.rightMarginEdits), output = text(editor.render());
    expect(output).toContain('买入价选填，填写时须为正数');
    expect(output).not.toMatch(/买入手续费 ¥0\.00|卖出手续费 ¥0\.00|手续费合计：¥0\.00|扣费后卖出价值：¥0\.00/);
    const invalidRecord = feeStock({ purchasePrice: purchasePrice.trim() ? Number(purchasePrice) : undefined });
    const html = renderToStaticMarkup(React.createElement(Details, { record: invalidRecord }));
    expect(html).toContain('卖出数据待纠正，估值暂不可用');
    expect(html).not.toMatch(/买入手续费（1‰）|扣费后卖出价值：¥0\.00/);
    await h.save();
    expectNoSave(h);
    expect(h.scope.toast.error).toHaveBeenCalledOnce();
    expect(h.scope.rightMarginEdits).toEqual(before);
    editor.change('买入价（保留）', '9.125');
    await h.save();
    expect(h.scope.saveTagConfigMutation.mutateAsync).toHaveBeenCalledOnce();
    expect(h.scope.addMarginLogMutation.mutateAsync).toHaveBeenCalledOnce();
    expect(h.savedRecords()[1]).toMatchObject({ quantity: 100, purchasePrice: 9.125,
      sales: [{ quantity: 20, price: 12.5, feeRate: 0.001, date: today }] });
  });
  it.each(['', '   '])('买价选填%s：新登记双边按卖额各1‰，保存/cache/回填不伪造买价且feeRate保留', async purchasePrice => {
    const stock = fixtureStock({ sales: [] }); delete stock.purchasePrice;
    const h = pageHarness([fixtureCurrency(), stock]), editor = pageEditor(h);
    editor.change('买入价（保留）', purchasePrice);
    editor.click('登记卖出'); editor.change('第1笔卖出股数', '20'); editor.change('第1笔卖出价格', '12.5');
    editor.click('登记卖出'); editor.change('第2笔卖出股数', '30'); editor.change('第2笔卖出价格', '15');
    const rows = nodes(editor.render()).filter(node => node.props?.['data-stock-sale-fees'] !== undefined);
    expect(text(rows[0])).toContain('买入手续费 ¥0.25'); expect(text(rows[0])).toContain('卖出手续费 ¥0.25');
    expect(text(rows[0])).toContain('手续费合计：¥0.50'); expect(text(rows[0])).toContain('扣费后卖出价值：¥249.50');
    expect(text(rows[1])).toContain('买入手续费 ¥0.45'); expect(text(rows[1])).toContain('卖出手续费 ¥0.45');
    expect(text(rows[1])).toContain('手续费合计：¥0.90'); expect(text(rows[1])).toContain('扣费后卖出价值：¥449.10');
    const expected = registeredFeeStock(); delete expected.purchasePrice;
    await h.save();
    expect(h.scope.toast.error).not.toHaveBeenCalled();
    expect(h.scope.saveTagConfigMutation.mutateAsync).toHaveBeenCalledOnce();
    expect(h.savedRecords()).toEqual([fixtureCurrency(), expected]);
    expect(h.savedRecords()[1]).not.toHaveProperty('purchasePrice');
    expect(h.currentRecords()).toEqual([fixtureCurrency(), expected]);
    const wire = h.payload().marginByCoin;
    expect(margin.parseTagMarginRecords(wire)).toEqual([fixtureCurrency(), expected]);
    expect(toRightMarginEdit(expected, '2026-11-16')).toMatchObject({ quantity: '100', purchasePrice: '',
      sales: [{ quantity: '20', price: '12.5', feeRate: 0.001 }, { quantity: '30', price: '15', feeRate: 0.001 }] });
    h.scope.handleStartRightEditing();
    expect(h.scope.rightMarginEdits[1]).toMatchObject({ purchasePrice: '', quantity: '100' });
    expect(margin.getTagMarginStockSaleSummary(h.currentRecords()[1] as any))
      .toEqual({ valid: true, soldQuantity: 50, remainingQuantity: 50, saleValue: expect.closeTo(698.60, 10) });
    await h.save(); expect(h.payload().marginByCoin).toBe(wire);
    const detail = h.scope.addMarginLogMutation.mutateAsync.mock.calls[0][0].detail;
    expect(detail).toContain('20股×¥12.5，买入费¥0.25、卖出费¥0.25，净额¥249.50');
    expect(detail).toContain('30股×¥15，买入费¥0.45、卖出费¥0.45，净额¥449.10');
    expect(detail).not.toContain('买入价¥');
    editor.change('买入价（保留）', '9.125'); await h.save();
    expect(h.savedRecords()[1]).toEqual(registeredFeeStock());
    expect(text(editor.render())).toContain('买入手续费 ¥0.18');
  });
  it('JSON、parse、current缓存、再次编辑回填保留.001，旧查询刷新前重复保存不二次扣股或扣费；日志净额一致', async () => {
    const stale = fixtureStock({ sales: [] }); delete stale.purchasePrice;
    const h = pageHarness([stale]), editor = pageEditor(h);
    editor.change('买入价（保留）', '9.125');
    editor.click('登记卖出'); editor.change('第1笔卖出股数', '20'); editor.change('第1笔卖出价格', '12.5');
    editor.click('登记卖出'); editor.change('第2笔卖出股数', '30'); editor.change('第2笔卖出价格', '15');
    const draft = structuredClone(h.scope.rightMarginEdits);
    await h.save();
    const wire = h.payload().marginByCoin;
    expect(h.savedRecords()).toEqual([registeredFeeStock()]);
    expect(margin.parseTagMarginRecords(wire)).toEqual([registeredFeeStock()]);
    expect(h.scope.rightMarginEdits).toEqual(draft);
    expect(h.currentRecords()).toEqual([registeredFeeStock()]);
    expect(h.scope.savedRightMarginEdits[0]).toMatchObject({ quantity: '100', purchasePrice: '9.125',
      sales: [{ quantity: '20', price: '12.5', feeRate: 0.001 }, { quantity: '30', price: '15', feeRate: 0.001 }] });
    expect(JSON.parse(h.scope.rightTagConfig.margin_by_coin)[0]).toEqual(stale);
    expect(toRightMarginEdit(h.currentRecords()[0], '2026-11-16')).toEqual(h.scope.savedRightMarginEdits[0]);
    const log = h.scope.addMarginLogMutation.mutateAsync.mock.calls[0][0];
    expect(log).toMatchObject({ ledgerId: 37, tagName: '测试担保标签', action: '修改保证金' });
    expect(log.detail).toContain('20股×¥12.5，买入费¥0.18、卖出费¥0.25，净额¥249.57');
    expect(log.detail).toContain('30股×¥15，买入费¥0.27、卖出费¥0.45，净额¥449.28');
    h.scope.handleStartRightEditing();
    expect(h.scope.rightMarginEdits).toEqual(draft);
    expect(text(pageEditor(h).render())).toContain('扣费后卖出价值：¥249.57');
    await h.save();
    expect(h.payload().marginByCoin).toBe(wire);
    expect(h.currentRecords()).toEqual([registeredFeeStock()]);
    expect(margin.getTagMarginStockMarketValue(h.currentRecords()[0] as any, {})).toBe(1598.85);
    expect(h.scope.addMarginLogMutation.mutateAsync.mock.calls[1][0].detail).toBe(log.detail);
  });
  it('同一原100股分两次登记保存：只扣各笔q，原库存不改，第二次不再收第一笔费', async () => {
    const h = pageHarness([fixtureStock({ sales: [] })]), editor = pageEditor(h);
    editor.click('登记卖出'); editor.change('第1笔卖出股数', '20'); editor.change('第1笔卖出价格', '12.5');
    await h.save();
    expect(margin.getTagMarginStockSaleSummary(h.currentRecords()[0] as any))
      .toEqual({ valid: true, soldQuantity: 20, saleValue: 249.57, remainingQuantity: 80 });
    h.scope.handleStartRightEditing();
    const next = pageEditor(h);
    next.click('登记卖出'); next.change('第2笔卖出价格', '15');
    next.change('第2笔卖出股数', '30');
    await h.save();
    expect(h.savedRecords()).toEqual([registeredFeeStock()]);
    expect((h.currentRecords()[0] as any).quantity).toBe(100);
    expect(margin.getTagMarginStockSaleSummary(h.currentRecords()[0] as any))
      .toEqual({ valid: true, soldQuantity: 50, saleValue: expect.closeTo(698.85, 10), remainingQuantity: 50 });
    expect(text(next.render())).toContain('已卖 50 股 · 剩余 50 股');
  });
  it('old无费率保存不加新字段、gross及旧日志不变；改买价/成交价也不自动添加费率', async () => {
    const record = fixtureStock(), h = pageHarness([record]), editor = pageEditor(h);
    expect(text(editor.render())).toContain('原记录未计手续费');
    expect(text(editor.render())).not.toContain('扣费后卖出价值');
    await h.save();
    expect(h.savedRecords()).toEqual([record]);
    for (const sale of h.savedRecords()[0].sales) expect(Object.keys(sale).sort()).toEqual(['price', 'quantity']);
    const log = h.scope.addMarginLogMutation.mutateAsync.mock.calls[0][0].detail;
    expect(log).toBe(`贵州茅台 100股，买入价¥9.125，卖出20股×¥12.5、30股×¥15 (${record.label})`);
    expect(log).not.toMatch(/买入费|卖出费|净额/);
    editor.change('买入价（保留）', '8.75'); editor.change('第1笔卖出价格', '13.25');
    await h.save();
    expect(h.savedRecords()[0]).toMatchObject({ quantity: 100, purchasePrice: 8.75,
      sales: [{ quantity: 20, price: 13.25 }, { quantity: 30, price: 15 }] });
    for (const sale of h.savedRecords()[0].sales) expect(sale).not.toHaveProperty('feeRate');
    expect(margin.getTagMarginStockSaleSummary(h.savedRecords()[0]).saleValue).toBe(715);
  });
  it('old缺买价无费率仍可保存gross；只有真实手动按1‰才生成费率且只修改目标旧行', async () => {
    const stock = fixtureStock(); delete stock.purchasePrice;
    const h = pageHarness([stock]), editor = pageEditor(h);
    await h.save();
    expect(h.savedRecords()).toEqual([stock]);
    expect(margin.getTagMarginStockMarketValue(h.currentRecords()[0] as any, {})).toBe(1600);
    h.scope.handleStartRightEditing();
    const secondBefore = h.scope.rightMarginEdits[0].sales[1];
    const firstRow = nodes(editor.render()).find(node => node.props?.['data-stock-sale-row'] === 0);
    button(firstRow, '按 1‰ 计费').props.onClick();
    expect(h.scope.rightMarginEdits[0].sales).toEqual([
      { quantity: '20', price: '12.5', feeRate: 0.001 }, { quantity: '30', price: '15' },
    ]);
    expect(h.scope.rightMarginEdits[0].sales[1]).toBe(secondBefore);
    await h.save();
    expect(h.scope.saveTagConfigMutation.mutateAsync).toHaveBeenCalledTimes(2);
    expect(h.savedRecords()[0]).not.toHaveProperty('purchasePrice');
    expect(h.savedRecords()[0].sales).toEqual([{ quantity: 20, price: 12.5, feeRate: 0.001 }, { quantity: 30, price: 15 }]);
    expect(text(editor.render())).toContain('买入手续费 ¥0.25');
    expect(text(editor.render())).toContain('扣费后卖出价值：¥249.50');
    expect(margin.getTagMarginStockSaleSummary(h.savedRecords()[0]).saleValue).toBe(699.5);
    expect(h.scope.addMarginLogMutation.mutateAsync.mock.calls[1][0].detail)
      .toContain('买入费¥0.25、卖出费¥0.25，净额¥249.50、30股×¥15');
    editor.change('买入价（保留）', '9.125');
    await h.save();
    expect(h.savedRecords()[0].sales).toEqual([{ quantity: 20, price: 12.5, feeRate: 0.001 }, { quantity: 30, price: 15 }]);
    expect(margin.getTagMarginStockSaleSummary(h.savedRecords()[0]).saleValue).toBeCloseTo(699.57, 10);
    expect(h.scope.addMarginLogMutation.mutateAsync.mock.calls[2][0].detail)
      .toContain('净额¥249.57、30股×¥15');
  });
  it.each([
    ['none/undefined', undefined], ['零', 0], ['false', false], ['null', null], ['字符串率', '0.001'],
    ['none字符串', 'none'], ['空字符串', ''], ['其它率', 0.002], ['负率', -0.001],
    ['NaN', NaN], ['Infinity', Infinity], ['数组', []], ['对象', {}],
  ] as Array<[string, any]>)('显式非法feeRate %s必须保留，不降级legacy，真实save阻断；手动恢复才可保存', async (_label, feeRate) => {
    const record = fixtureStock({ sales: [{ quantity: 20, price: 12.5, feeRate }] });
    const direct = toRightMarginEdit(record, '2026-11-16');
    expect(direct.sales[0]).toHaveProperty('feeRate');
    expect(direct.sales[0].feeRate).toEqual(feeRate);
    const h = pageHarness([fixtureCurrency(), fixtureStock({ sales: [] })]);
    h.scope.updateRightMarginEntry(1, { sales: direct.sales });
    const editor = pageEditor(h);
    editor.change('第1笔卖出股数', '20'); editor.change('第1笔卖出价格', '12.5');
    expect(h.scope.rightMarginEdits[1].sales[0]).toHaveProperty('feeRate');
    expect(h.scope.rightMarginEdits[1].sales[0].feeRate).toEqual(feeRate);
    h.scope.savedRightMarginEdits = structuredClone(h.scope.rightMarginEdits);
    const cached = h.currentRecords().find((entry: any) => entry.assetType === 'stock') as any;
    expect(cached.sales[0]).toHaveProperty('feeRate'); expect(cached.sales[0].feeRate).toEqual(feeRate);
    expect(margin.getTagMarginStockSaleSummary(cached).valid).toBe(false);
    const output = text(editor.render());
    expect(output).toContain('恢复 1‰ 费率');
    expect(output).not.toContain('扣费后卖出价值：¥');
    expect(renderToStaticMarkup(React.createElement(Details, { record: cached })))
      .toContain('卖出数据待纠正，估值暂不可用');
    const before = structuredClone(h.scope.rightMarginEdits);
    await h.save(); expectNoSave(h);
    expect(h.scope.rightMarginEdits).toEqual(before);
    editor.click('恢复 1‰ 费率'); await h.save();
    expect(h.scope.saveTagConfigMutation.mutateAsync).toHaveBeenCalledOnce();
    expect(h.savedRecords()[1].sales).toEqual([{ quantity: 20, price: 12.5, feeRate: 0.001 }]);
  });
  it.each(['累计超卖', '负股数', '小数股数', '空卖价', '未核验symbol'])('feeRate存在仍不弱化%s守卫，前面有效currency不得部分提交', async mode => {
    const h = pageHarness([fixtureCurrency(), feeStock()]);
    const patches: Record<string, any> = {
      累计超卖: { sales: [{ quantity: '101', price: '15', feeRate: 0.001 }] },
      负股数: { sales: [{ quantity: '-1', price: '15', feeRate: 0.001 }] },
      小数股数: { sales: [{ quantity: '1.5', price: '15', feeRate: 0.001 }] },
      空卖价: { sales: [{ quantity: '20', price: '', feeRate: 0.001 }] },
      未核验symbol: { symbol: 'AAPL' },
    };
    h.scope.updateRightMarginEntry(1, patches[mode]);
    const before = structuredClone(h.scope.rightMarginEdits);
    await h.save(); expectNoSave(h);
    expect(h.scope.rightMarginEdits).toEqual(before);
  });
  it('计费新字段不套另一股票：真实选股拒绝切码，手输symbol也不能绕过保存身份守卫', async () => {
    const h = pageHarness([feeStock()]);
    const before = structuredClone(h.scope.rightMarginEdits);
    h.scope.selectRightMarginAshareStock(0, { symbol: '000001.SZ', code: '000001', name: '平安银行', latestPrice: 20 });
    expect(h.scope.rightMarginEdits).toEqual(before);
    expect(h.scope.toast.error).toHaveBeenCalledOnce();
    expect(h.scope.setRightMarginEdits).toHaveBeenCalledOnce();
    h.scope.updateRightMarginEntry(0, { symbol: '000001.SZ' });
    await h.save(); expectNoSave(h);
    expect(h.scope.rightMarginEdits[0].sales).toEqual(before[0].sales);
    expect(h.scope.rightMarginEdits[0]).toMatchObject({ code: '600519', quantity: '100', purchasePrice: '9.125' });
  });
  it('另一股票新条目不会继承旧股票计费行、买价或净额', async () => {
    const h = pageHarness([feeStock()]);
    button(h.render(), '添加股票').props.onClick();
    expect(h.scope.rightMarginEdits[1]).toMatchObject({ sales: [], purchasePrice: '', quantity: '' });
    h.scope.selectRightMarginAshareStock(1, { symbol: '000001.SZ', code: '000001', name: '平安银行', latestPrice: 20 });
    h.scope.updateRightMarginEntry(1, { quantity: '10' });
    await h.save();
    const original = h.savedRecords().find((entry: any) => entry.symbol === '600519.SH');
    const added = h.savedRecords().find((entry: any) => entry.symbol === '000001.SZ');
    expect(original).toEqual(feeStock());
    expect(added).toMatchObject({ quantity: 10, referencePrice: 20 });
    expect(added).not.toHaveProperty('purchasePrice'); expect(added).not.toHaveProperty('sales');
  });
  it('负净额真实保存、cache、Editor及日志保留-99，不clamp零', async () => {
    const record = feeStock({ purchasePrice: 1000, referencePrice: 0,
      sales: [{ quantity: 100, price: 0.01, feeRate: 0.001 }] });
    const h = pageHarness([record]);
    expect(text(pageEditor(h).render())).toContain('扣费后卖出价值：¥-99.00');
    expect(margin.getTagMarginStockSaleAmounts(record.sales[0], record.purchasePrice))
      .toEqual({ valid: true, grossValue: 1, buyFee: 100, sellFee: 0, totalFee: 100, netValue: -99 });
    await h.save();
    expect(h.savedRecords()).toEqual([record]); expect(h.currentRecords()).toEqual([record]);
    expect(margin.getTagMarginStockMarketValue(h.currentRecords()[0] as any, {})).toBe(-99);
    expect(h.scope.addMarginLogMutation.mutateAsync.mock.calls[0][0].detail)
      .toContain('100股×¥0.01，买入费¥100.00、卖出费¥0.00，净额¥-99.00');
  });
  it('半分净额2.985：编辑器、详情与真实保存日志均显示2.99，不记录2.98', async () => {
    const record = feeStock({ quantity: 3, purchasePrice: 10, referencePrice: 0,
      sales: [{ quantity: 3, price: 1.005, feeRate: 0.001 }] });
    const h = pageHarness([record]);
    expect(text(pageEditor(h).render())).toContain('扣费后卖出价值：¥2.99');
    expect(renderToStaticMarkup(React.createElement(Details, { record }))).toContain('¥2.99');
    await h.save();
    const detail = h.scope.addMarginLogMutation.mutateAsync.mock.calls[0][0].detail;
    expect(detail).toContain('买入费¥0.03、卖出费¥0.00，净额¥2.99');
    expect(detail).not.toContain('净额¥2.98');
    expect(h.savedRecords()).toEqual([record]);
    expect(margin.getTagMarginStockMarketValue(h.currentRecords()[0] as any, {})).toBe(2.985);
  });
});

const feePages = [['管理页', pageSource, 'locallyComputedRightTotalCNY'],
  ['只读详情', readOnlySource, 'locallyComputedTotalCNY']] as const;
describe.each(feePages)('%s手续费显示与unknown传播：真实生产AST', (_name, source, localName) => {
  it('partial本笔两费金额与同一Details一致，仍用原100股减本笔50股估剩余', () => {
    const record = feeStock(), before = structuredClone(record);
    const rendered = rowRender(source, record);
    const detailNode = nodes(rendered.row).find(node => node.type === Details);
    expect(detailNode.props.record).toBe(record);
    expect(renderToStaticMarkup(detailNode)).toBe(renderToStaticMarkup(React.createElement(Details, { record })));
    expect(rendered.html).toContain('保证金价值 ¥1,598.85');
    expect(rendered.html).toContain('买入价：¥9.125');
    expect(rendered.html).toContain('买入手续费（1‰）：¥0.18 · 卖出手续费（1‰）：¥0.25');
    expect(rendered.html).toContain('买入手续费（1‰）：¥0.27 · 卖出手续费（1‰）：¥0.45');
    expect(rendered.html).toContain('已卖出价值：¥698.85（已扣登记手续费）');
    expect(rendered.html).toContain('剩余 50股按参考价估值');
    expect(feeTotalHarness(source, localName, [record]).scope.rightTotalCNY).toBe(1598.85);
    expect(record).toEqual(before);
  });
  it('full扣费净额无quote仍正确，不二次扣原库存，报价改变不能改变fixed现金', () => {
    const record = feeStock({ referencePrice: 0,
      sales: [{ quantity: 20, price: 12.5, feeRate: 0.001 }, { quantity: 80, price: 15, feeRate: 0.001 }] });
    const before = structuredClone(record);
    expect(margin.getTagMarginStockSaleSummary(record))
      .toEqual({ valid: true, soldQuantity: 100, saleValue: expect.closeTo(1447.64, 10), remainingQuantity: 0 });
    const noQuote = rowRender(source, record), changed = rowRender(source, record, { '600519.SH': { price: 999 } });
    expect(noQuote.html).toContain('卖出价值 ¥1,447.64');
    expect(noQuote.html).toContain('已卖出价值：¥1,447.64（已扣登记手续费）');
    expect(noQuote.html).toContain('买入手续费（1‰）：¥0.73 · 卖出手续费（1‰）：¥1.20');
    expect(noQuote.html).toContain('手续费合计：¥1.93 · 扣费后卖出价值：¥1,198.07');
    expect(noQuote.html).toContain('全部卖出，价值按成交价固定');
    expect(noQuote.html).not.toMatch(/估值待获取|暂用参考价|参考价 ¥|999/);
    expect(changed.html).toBe(noQuote.html);
    expect(margin.getTagMarginStockSymbols([record])).toEqual([]);
    expect(feeTotalHarness(source, localName, [record]).scope.rightTotalCNY).toBeCloseTo(1447.64, 10);
    expect(record).toEqual(before);
  });
  it.each(['非法买价', '非法费率', 'partial缺报价'])('%s计费行与有效CNY800并存，真实local total与合计仍unknown，不伪0/已卖款', mode => {
    const record = feeStock({ referencePrice: 0 });
    if (mode === '非法买价') record.purchasePrice = 0;
    if (mode === '非法费率') record.sales[0].feeRate = null;
    const cny = { ...fixtureCurrency(), coin: 'CNY', amount: 800 };
    for (const records of [[record, cny], [cny, record]]) {
      const h = feeTotalHarness(source, localName, records);
      expect(h.scope[localName]).toBeNull(); expect(h.scope.rightTotalCNY).toBeNull();
      expect(h.scope.rightMarginValueSummary.stockValueReady).toBe(false);
      expect(h.html).toContain('估值待获取'); expect(h.html).toContain('--');
      expect(h.html).not.toMatch(/¥(?:0|800)(?:<|\b)|NaN|Infinity|≈\s*0/);
      const html = rowRender(source, record).html;
      expect(html).toContain('估值待获取');
      if (mode !== 'partial缺报价') expect(html).toContain('卖出数据待纠正，估值暂不可用');
    }
  });
  it.each([null, {}, { totalCny: null }])('canonical显式unknown %j不回退已知full净额，不能把未知变0', canonical => {
    const record = feeStock({ referencePrice: 0, sales: [{ quantity: 100, price: 15, feeRate: 0.001 }] });
    const h = feeTotalHarness(source, localName, [record], canonical);
    expect(h.scope[localName]).not.toBeNull(); expect(h.scope.rightTotalCNY).toBeNull();
    expect(h.html).toContain('估值待获取'); expect(h.html).toContain('--');
    expect(h.html).not.toMatch(/¥0|≈\s*0/);
  });
  it('负净额两页Details、行价值和总额真实保留，不clamp零', () => {
    const record = feeStock({ purchasePrice: 1000, referencePrice: 0,
      sales: [{ quantity: 100, price: 0.01, feeRate: 0.001 }] });
    const html = rowRender(source, record).html;
    expect(html).toContain('卖出价值 ¥-99');
    expect(html).toContain('买入价：¥1,000');
    expect(html).toContain('扣费后卖出价值：¥-99.00');
    expect(html).toContain('已卖出价值：¥-99.00');
    const h = feeTotalHarness(source, localName, [record]);
    expect(h.scope[localName]).toBe(-99); expect(h.scope.rightTotalCNY).toBe(-99);
    expect(h.html).toContain('¥-99'); expect(h.html).not.toContain('估值待获取');
  });
});

describe('买入价选填：真实helper及两页回归', () => {
  it('未填买价双边按成交金额各自half-up，非合并2‰后舍入；显式非法值仍拒绝', () => {
    expect(margin.getTagMarginStockSaleAmounts({ quantity: 1, price: 5, feeRate: 0.001 }))
      .toEqual({ valid: true, grossValue: 5, buyFee: 0.01, sellFee: 0.01, totalFee: 0.02, netValue: 4.98 });
    expect(margin.getTagMarginStockSaleAmounts({ quantity: 20, price: 12.5, feeRate: 0.001 }))
      .toEqual({ valid: true, grossValue: 250, buyFee: 0.25, sellFee: 0.25, totalFee: 0.5, netValue: 249.5 });
    for (const invalid of [0, -1, NaN, Infinity, null, false, '']) {
      expect(margin.getTagMarginStockSaleAmounts({ quantity: 20, price: 12.5, feeRate: 0.001 }, invalid as any).valid).toBe(false);
    }
  });
  it.each(feePages)('%s未填买价full净额不依赖quote，两笔双边费一致且不展示虚构买价', (_name, source, localName) => {
    const record = feeStock({ referencePrice: 0, quantity: 2,
      sales: [{ quantity: 1, price: 5, feeRate: 0.001 }, { quantity: 1, price: 5, feeRate: 0.001 }] });
    delete record.purchasePrice;
    const before = structuredClone(record), html = rowRender(source, record).html;
    expect(html).toContain('买入价：未登记');
    expect(html).not.toContain('买入价：¥');
    expect(html.match(/买入手续费（1‰）：¥0\.01/g)).toHaveLength(2);
    expect(html.match(/卖出手续费（1‰）：¥0\.01/g)).toHaveLength(2);
    expect(html.match(/手续费合计：¥0\.02 · 扣费后卖出价值：¥4\.98/g)).toHaveLength(2);
    expect(html).toContain('已卖出价值：¥9.96'); expect(html).toContain('全部卖出，价值按成交价固定');
    expect(html).not.toContain('估值待获取');
    expect(margin.getTagMarginStockSymbols([record])).toEqual([]);
    expect(feeTotalHarness(source, localName, [record]).scope.rightTotalCNY).toBe(9.96);
    expect(record).toEqual(before);
  });
});

describe('逐笔卖出日期：真实Editor处理器、save及两页Details', () => {
  it('新登记使用真实北京时间今天，type=date及max一致，改单笔日期不改另一笔或原买入/质押日期', async () => {
    const h = pageHarness([fixtureStock({ sales: [] })]), editor = pageEditor(h);
    editor.click('登记卖出'); editor.change('第1笔卖出股数', '20'); editor.change('第1笔卖出价格', '12.5');
    editor.click('登记卖出'); editor.change('第2笔卖出股数', '30'); editor.change('第2笔卖出价格', '15');
    expect(h.scope.rightMarginEdits[0].sales.map((sale: any) => sale.date)).toEqual([today, today]);
    expect(field(editor.render(), '第1笔卖出日期').props).toMatchObject({ type: 'date', value: today, max: today });
    const second = h.scope.rightMarginEdits[0].sales[1], originalDate = h.scope.rightMarginEdits[0].date;
    editor.change('第1笔卖出日期', '2026-11-13');
    expect(h.scope.rightMarginEdits[0].sales[1]).toBe(second);
    expect(h.scope.rightMarginEdits[0]).toMatchObject({ date: originalDate, purchasePrice: '9.125', quantity: '100' });
    editor.change('第2笔卖出日期', '2026-11-14');
    const record = feeStock({ sales: [
      { quantity: 20, price: 12.5, feeRate: 0.001, date: '2026-11-13' },
      { quantity: 30, price: 15, feeRate: 0.001, date: '2026-11-14' },
    ] });
    await h.save();
    expect(h.savedRecords()).toEqual([record]); expect(h.currentRecords()).toEqual([record]);
    expect(margin.parseTagMarginRecords(h.payload().marginByCoin)).toEqual([record]);
    expect(toRightMarginEdit(record, today)).toEqual(h.scope.savedRightMarginEdits[0]);
    const wire = h.payload().marginByCoin;
    h.scope.handleStartRightEditing();
    expect(field(pageEditor(h).render(), '第1笔卖出日期').props.value).toBe('2026-11-13');
    expect(field(pageEditor(h).render(), '第2笔卖出日期').props.value).toBe('2026-11-14');
    await h.save(); expect(h.payload().marginByCoin).toBe(wire);
    expect(h.scope.addMarginLogMutation.mutateAsync.mock.calls[0][0].detail)
      .toContain('2026-11-13 20股×¥12.5，买入费¥0.18、卖出费¥0.25，净额¥249.57');
    expect(h.scope.addMarginLogMutation.mutateAsync.mock.calls[0][0].detail)
      .toContain('2026-11-14 30股×¥15，买入费¥0.27、卖出费¥0.45，净额¥449.28');
    expect(margin.getTagMarginStockSaleSummary(record).saleValue).toBeCloseTo(698.85, 10);
  });
  it('旧无date/feeRate回显未登记，不因查看或改价格/买价插入日期；真实补单笔日期不追计手续费', async () => {
    const record = fixtureStock(), h = pageHarness([record]), editor = pageEditor(h);
    expect(field(editor.render(), '第1笔卖出日期').props.value).toBe('');
    expect(text(editor.render())).toContain('原卖出日期未登记');
    expect(text(Details({ record })).match(/卖出日期：未登记/g)).toHaveLength(2);
    await h.save(); expect(h.savedRecords()).toEqual([record]);
    editor.change('买入价（保留）', '9.125'); editor.change('第1笔卖出价格', '12.5');
    await h.save(); expect(h.savedRecords()).toEqual([record]);
    editor.change('第1笔卖出日期', '2026-11-13'); await h.save();
    expect(h.savedRecords()[0].sales).toEqual([{ quantity: 20, price: 12.5, date: '2026-11-13' }, { quantity: 30, price: 15 }]);
    expect(h.savedRecords()[0].date).toBe(record.date);
    expect(margin.getTagMarginStockSaleSummary(h.savedRecords()[0]).saleValue).toBe(700);
    for (const sale of h.savedRecords()[0].sales) expect(sale).not.toHaveProperty('feeRate');
  });
  it.each([
    ['空', ''], ['非补零', '2026-1-02'], ['坏字符串', 'bad'], ['不存在日期', '2026-02-30'],
    ['非闰年', '2025-02-29'], ['未来', '9999-01-01'], ['null', null], ['undefined', undefined], ['数字', 20261113],
  ] as Array<[string, any]>)('显式非法sale日期%s必须保留，shared与真实handleSave拦截整批提交', async (_label, date) => {
    const record = feeStock({ sales: [{ quantity: 20, price: 12.5, feeRate: 0.001, date }] });
    const edit = toRightMarginEdit(record, today);
    expect(edit.sales[0]).toHaveProperty('date'); expect(edit.sales[0].date).toBe(String(date ?? ''));
    expect(margin.getTagMarginStockSaleSummary(record).valid).toBe(false);
    const h = pageHarness([fixtureCurrency(), fixtureStock({ sales: [] })]);
    h.scope.updateRightMarginEntry(1, { sales: edit.sales });
    h.scope.savedRightMarginEdits = structuredClone(h.scope.rightMarginEdits);
    const cached = h.currentRecords()[1] as any;
    expect(cached.sales[0]).toHaveProperty('date'); expect(cached.sales[0].date).toBe(String(date ?? ''));
    const before = structuredClone(h.scope.rightMarginEdits);
    await h.save(); expectNoSave(h);
    expect(h.scope.toast.error).toHaveBeenCalledOnce(); expect(h.scope.rightMarginEdits).toEqual(before);
    pageEditor(h).change('第1笔卖出日期', '2026-11-13'); await h.save();
    expect(h.savedRecords()[1].sales).toEqual([{ quantity: 20, price: 12.5, feeRate: 0.001, date: '2026-11-13' }]);
  });
  it.each(feePages)('%s逐笔不同日期与价格两费同栏，日期不参与估值且原质押日期不变', (_name, source) => {
    const record = feeStock({ sales: [
      { quantity: 20, price: 12.5, feeRate: 0.001, date: '2026-11-13' },
      { quantity: 30, price: 15, feeRate: 0.001, date: '2026-11-14' },
    ] }), before = structuredClone(record);
    const details = Details({ record });
    const first = text(nodes(details).find(node => node.props?.['data-stock-sale-detail'] === 0));
    const second = text(nodes(details).find(node => node.props?.['data-stock-sale-detail'] === 1));
    expect(first).toContain('卖出日期：2026-11-13'); expect(first).toContain('卖出 ¥12.5 × 20股');
    expect(first).toContain('买入手续费（1‰）：¥0.18'); expect(first).toContain('扣费后卖出价值：¥249.57');
    expect(second).toContain('卖出日期：2026-11-14'); expect(second).toContain('卖出 ¥15 × 30股');
    expect(second).toContain('买入手续费（1‰）：¥0.27'); expect(second).toContain('扣费后卖出价值：¥449.28');
    const html = rowRender(source, record).html;
    expect(html).toContain('卖出日期：2026-11-13'); expect(html).toContain('卖出日期：2026-11-14');
    expect(html).toContain('买入价：¥9.125'); expect(html).toContain('保证金价值 ¥1,598.85');
    expect(margin.getTagMarginStockMarketValue(record, {})).toBe(margin.getTagMarginStockMarketValue(feeStock(), {}));
    expect(record).toEqual(before); expect(record.date).toBe('2026-11-12');
  });
});
