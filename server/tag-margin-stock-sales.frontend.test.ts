import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as margin from '../shared/tag-margin-assets';

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
const Editor = actual(editorSource, 'TagMarginStockSaleEditor', { Plus: 'svg', X: 'svg' });
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
    expect(h.savedRecords()[0]).toMatchObject({ quantity: 100, purchasePrice: 9.125, sales: [{ quantity: 20, price: 12.5 }] });
  });
  it('真实Editor连续登记两笔，改单笔股数/价不改变另一笔或原买入价，移除只删目标', () => {
    const h = editorHarness();
    h.click('登记卖出'); h.change('第1笔卖出股数', '20'); h.change('第1笔卖出价格', '12.5');
    h.click('登记卖出'); h.change('第2笔卖出股数', '30'); h.change('第2笔卖出价格', '15');
    const untouched = h.state.sales[1];
    h.change('第1笔卖出价格', '13.25'); h.change('第1笔卖出股数', '25');
    expect(h.state.sales).toEqual([{ quantity: '25', price: '13.25' }, { quantity: '30', price: '15' }]);
    expect(h.state.sales[1]).toBe(untouched);
    expect(h.state.purchasePrice).toBe('9.125'); expect(h.state.quantity).toBe('100');
    h.click('移除第1笔卖出');
    expect(h.state.sales).toEqual([{ quantity: '30', price: '15' }]);
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
    expect(h.state.sales[1]).toEqual({ quantity: '', price: '' });
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
