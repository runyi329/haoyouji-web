import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  getTagMarginCurrencyRecords,
  getTagMarginStockMarketValue,
  getTagMarginStockRecords,
  getTagMarginStockSaleSummary,
  getTagMarginStockSymbols,
  parseTagMarginRecords,
  resolveTagMarginStockQuote,
  type TagMarginStockQuote,
  type TagMarginStockRecord,
} from '../shared/tag-margin-assets';
import { validateTagMarginStockSales } from './tag-margin-stock-sales-validation';

const stock = (patch: Record<string, unknown> = {}): TagMarginStockRecord => ({
  assetType: 'stock', symbol: '600519.SH', code: '600519', name: '测试质押股票',
  quantity: 1000, referencePrice: 20, priceDate: '2026-11-13', priceUpdatedAt: '',
  label: '', date: '2026-11-12', ...patch,
} as TagMarginStockRecord);
const QUOTES = { '600519.SH': { price: 25, priceDate: '2026-11-16', updatedAt: '2026-11-16T15:05:00+08:00' } };
const validate = (records: unknown, ledgerId = 37) => validateTagMarginStockSales({ ledgerId, marginByCoin: records });
const parseStock = (raw: unknown) => getTagMarginStockRecords(parseTagMarginRecords(raw))[0];

const malformed: Array<[string, Record<string, unknown>]> = [
  ['sales null', { sales: null }], ['sales undefined', { sales: undefined }],
  ['sales empty string', { sales: '' }], ['sales object', { sales: { quantity: 10, price: 20 } }],
  ['missing quantity', { sales: [{ price: 20 }] }], ['missing price', { sales: [{ quantity: 10 }] }],
  ['empty pair', { sales: [{}] }], ['null pair', { sales: [null] }], ['array pair', { sales: [[10, 20]] }],
  ['null quantity', { sales: [{ quantity: null, price: 20 }] }],
  ['empty quantity', { sales: [{ quantity: '', price: 20 }] }],
  ['string quantity', { sales: [{ quantity: '10', price: 20 }] }],
  ['zero quantity', { sales: [{ quantity: 0, price: 20 }] }],
  ['negative quantity', { sales: [{ quantity: -10, price: 20 }] }],
  ['fractional quantity', { sales: [{ quantity: 1.5, price: 20 }] }],
  ['NaN quantity', { sales: [{ quantity: NaN, price: 20 }] }],
  ['infinite quantity', { sales: [{ quantity: Infinity, price: 20 }] }],
  ['unsafe quantity', { quantity: 1e20, sales: [{ quantity: Number.MAX_SAFE_INTEGER + 1, price: 20 }] }],
  ['unsafe total', { quantity: 1e20, sales: [{ quantity: Number.MAX_SAFE_INTEGER, price: 1 }, { quantity: 1, price: 1 }] }],
  ['null price', { sales: [{ quantity: 10, price: null }] }],
  ['empty price', { sales: [{ quantity: 10, price: '' }] }],
  ['string price', { sales: [{ quantity: 10, price: '20' }] }],
  ['zero price', { sales: [{ quantity: 10, price: 0 }] }],
  ['negative price', { sales: [{ quantity: 10, price: -20 }] }],
  ['NaN price', { sales: [{ quantity: 10, price: NaN }] }],
  ['infinite price', { sales: [{ quantity: 10, price: Infinity }] }],
  ['overflow sale value', { sales: [{ quantity: 10, price: Number.MAX_VALUE }] }],
  ['oversell', { sales: [{ quantity: 1001, price: 20 }] }],
  ['multiple oversell', { sales: [{ quantity: 600, price: 20 }, { quantity: 401, price: 25 }] }],
  ['negative original holding', { quantity: -1000, sales: [{ quantity: 10, price: 20 }] }],
  ['negative original empty sales', { quantity: -1000, sales: [] }],
  ['zero original holding', { quantity: 0, sales: [{ quantity: 10, price: 20 }] }],
  ['malformed original quantity', { quantity: 'bad', sales: [{ quantity: 10, price: 20 }] }],
  ['invalid stock symbol', { symbol: 'BTC', sales: [{ quantity: 10, price: 20 }] }],
  ['purchasePrice null', { purchasePrice: null }], ['purchasePrice undefined', { purchasePrice: undefined }],
  ['purchasePrice empty', { purchasePrice: '' }], ['purchasePrice string', { purchasePrice: '20' }],
  ['purchasePrice zero', { purchasePrice: 0 }], ['purchasePrice negative', { purchasePrice: -20 }],
  ['purchasePrice NaN', { purchasePrice: NaN }], ['purchasePrice Infinity', { purchasePrice: Infinity }],
];

describe('37号股票保证金真实共享函数：保留原股数/买价，现金加未售市值', () => {
  it('未售沿用15:05快照优先、参考价回退、缺价未知；不伪造买入价', () => {
    const record = parseStock(JSON.stringify([stock()]));
    expect(record.quantity).toBe(1000);
    expect(record).not.toHaveProperty('purchasePrice');
    expect(record).not.toHaveProperty('sales');
    expect(getTagMarginStockMarketValue(record, QUOTES)).toBe(25000);
    expect(getTagMarginStockMarketValue(record, undefined)).toBe(20000);
    expect(resolveTagMarginStockQuote(record, QUOTES)).toMatchObject({ price: 25, isCloseSnapshot: true, priceDate: '2026-11-16' });
    expect(getTagMarginStockMarketValue(stock({ referencePrice: 0 }), undefined)).toBeNull();
    expect(getTagMarginStockSaleSummary(record)).toEqual({ soldQuantity: 0, saleValue: 0, remainingQuantity: 1000, valid: true });
  });
  it('部分卖出保持原买价/原股数，成交现金+剩余15:05市值', () => {
    const raw = stock({ purchasePrice: 18, sales: [{ quantity: 300, price: 30 }] });
    const record = parseStock(JSON.stringify([raw]));
    expect(getTagMarginStockSaleSummary(record)).toEqual({ soldQuantity: 300, saleValue: 9000, remainingQuantity: 700, valid: true });
    expect(getTagMarginStockMarketValue(record, QUOTES)).toBe(26500);
    expect(getTagMarginStockMarketValue(record, undefined)).toBe(23000);
    expect(record).toMatchObject({ quantity: 1000, purchasePrice: 18, referencePrice: 20 });
    expect(raw.quantity).toBe(1000);
    expect(raw.purchasePrice).toBe(18);
    expect(getTagMarginStockSymbols([record])).toEqual(['600519.SH']);
    expect(getTagMarginStockMarketValue(stock({ ...record, referencePrice: 0 }), undefined)).toBeNull();
  });
  it('多笔不同成交价逐笔求和，未售股数只减销量不改原库存', () => {
    const record = stock({ sales: [{ quantity: 200, price: 30 }, { quantity: 300, price: 40 }] });
    expect(getTagMarginStockSaleSummary(record)).toEqual({ soldQuantity: 500, saleValue: 18000, remainingQuantity: 500, valid: true });
    expect(getTagMarginStockMarketValue(record, QUOTES)).toBe(30500);
    expect(record.quantity).toBe(1000);
  });
  it('全部卖出不依赖任何行情，价格改变不改变现金价值且无需收集symbol', () => {
    const record = stock({ referencePrice: 0, sales: [{ quantity: 600, price: 30 }, { quantity: 400, price: 40 }] });
    for (const quotes of [undefined, {}, QUOTES, { '600519.SH': { price: 1 } }, { '600519.SH': { price: 9999 } }]) {
      expect(getTagMarginStockMarketValue(record, quotes)).toBe(34000);
    }
    expect(getTagMarginStockSymbols([record])).toEqual([]);
    expect(getTagMarginStockSymbols([record, stock({ symbol: '000001.SZ' }), stock({ symbol: '000001.SZ' })])).toEqual(['000001.SZ']);
  });
  it('空sales为合法未售；旧负数、小数库存保留方向，整数sale可登记小数旧库存的整数部分', () => {
    expect(getTagMarginStockMarketValue(stock({ sales: [] }), QUOTES)).toBe(25000);
    const negative = parseStock([stock({ quantity: -100.5 })]);
    expect(negative.quantity).toBe(-100.5);
    expect(getTagMarginStockMarketValue(negative, QUOTES)).toBe(-2512.5);
    expect(getTagMarginStockSymbols([negative])).toEqual(['600519.SH']);
    expect(() => validate([negative])).not.toThrow();
    expect(getTagMarginStockMarketValue(parseStock([stock({ quantity: 100.5 })]), QUOTES)).toBe(2512.5);
    const fractional = stock({ quantity: 100.5, sales: [{ quantity: 100, price: 20 }] });
    expect(() => validate([fractional])).not.toThrow();
    expect(getTagMarginStockMarketValue(fractional, QUOTES)).toBe(2012.5);
  });
  it('卖出29.88仅为备注，不生成资金，也不把旧initialPrice当买入价', () => {
    const record = parseStock([{ assetType: 'stock', symbol: '600519.sh', amount: '100', initialPrice: '21', note: '卖出29.88' }]);
    expect(record).toMatchObject({ quantity: 100, referencePrice: 21, label: '卖出29.88' });
    expect(record).not.toHaveProperty('sales');
    expect(record).not.toHaveProperty('purchasePrice');
    expect(getTagMarginStockMarketValue(record, undefined)).toBe(2100);
  });
  it.each(malformed)('%s坏新增字段保留记录及字段供纠正，估值fail-closed且其他合法担保物不丢', (_name, patch) => {
    const bad = stock(patch);
    const records = parseTagMarginRecords([bad, { coin: 'USDT', amount: 100, note: '合法币种' }, stock({ symbol: '000001.SZ' })]);
    expect(records).toHaveLength(3);
    const record = getTagMarginStockRecords(records)[0];
    for (const field of ['sales', 'purchasePrice'] as const) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) {
        expect(Object.prototype.hasOwnProperty.call(record, field)).toBe(true);
        expect(record[field]).toBe(bad[field]);
      }
    }
    expect(getTagMarginStockSaleSummary(record).valid).toBe(false);
    expect(getTagMarginStockMarketValue(record, QUOTES)).toBeNull();
    expect(getTagMarginStockSymbols(records)).toEqual(['000001.SZ']);
    expect(getTagMarginCurrencyRecords(records)).toMatchObject([{ coin: 'USDT', amount: 100 }]);
    expect(getTagMarginStockMarketValue(getTagMarginStockRecords(records)[1], undefined)).toBe(20000);
  });
  it('历史坏无新字段行维持忽略行为，不掩盖合法保证金', () => {
    const records = parseTagMarginRecords([stock({ quantity: 0 }), stock({ symbol: 'BAD' }), { coin: 'CNY', amount: 100 }]);
    expect(records).toHaveLength(1);
    expect(getTagMarginCurrencyRecords(records)[0].amount).toBe(100);
  });
});

describe('后端纯校验：只ledger37、只显式新字段、不重写旧JSON', () => {
  it.each(malformed)('%s拒绝整批而非清洗后写入', (_name, patch) => {
    const records = [{ coin: 'CNY', amount: 500 }, stock({ sales: [{ quantity: 100, price: 29.88 }] }), stock(patch)];
    expect(() => validate(records)).toThrow(TRPCError);
    try { validate(records); } catch (error) { expect(error).toMatchObject({ code: 'BAD_REQUEST' }); }
    expect(records[0]).toEqual({ coin: 'CNY', amount: 500 });
    expect(records[2]).toMatchObject(patch);
  });
  it('JSON读取严格拒绝null/不完整pair以及指数溢出；格式坏不得写入', () => {
    for (const raw of [
      '[{"assetType":"stock","symbol":"600519.SH","quantity":100,"sales":[{"quantity":10,"price":1e999}]}]',
      '[{"assetType":"stock","symbol":"600519.SH","quantity":100,"sales":[{"quantity":10,"price":null}]}]',
      '[{"assetType":"stock","symbol":"600519.SH","quantity":100,"purchasePrice":1e999}]',
      '[{"assetType":"stock","symbol":"600519.SH","quantity":100,"sales":[{"quantity":10}]}]',
      '{bad JSON',
    ]) expect(() => validate(raw)).toThrow(TRPCError);
  });
  it('合法新合同返回void并保留JSON原字节、原买价和原股数', () => {
    const raw = ' [ {"assetType":"stock","symbol":"600519.SH","quantity":1000,"purchasePrice":18,"sales":[{"quantity":300,"price":29.88}],"referencePrice":20}, {"coin":"USDC","amount":"0.123456789012345678901"} ] ';
    const input = Object.freeze({ ledgerId: 37, marginByCoin: raw });
    expect(validateTagMarginStockSales(input)).toBeUndefined();
    expect(input.marginByCoin).toBe(raw);
    expect(parseStock(raw)).toMatchObject({ quantity: 1000, purchasePrice: 18, referencePrice: 20 });
  });
  it('多币种currency数组/字典、旧负库存/旧坏行无新字段均兼容，不扩展数字币sale', () => {
    const oldRecords = [{ coin: 'CNY', amount: '123.456' }, { coin: 'USDT', amount: -5 },
      { coin: 'USDC', amount: 8, sales: '不属于股票合同' }, stock({ quantity: -100 }), stock({ symbol: 'BAD' })];
    for (const raw of [oldRecords, JSON.stringify(oldRecords), { CNY: 12, USDT: -5, USDC: 8, BTC: 0.1, sales: 2 },
      '{"CNY":900719925474099312345,"USDT":-5,"USDC":8,"BTC":0.1,"purchasePrice":1}', '', ' ', 'null', '{}', '[]']) {
      expect(() => validate(raw)).not.toThrow();
    }
  });
  it('字段级PATCH未带marginByCoin及明确清空null不会误清空/校验旧库存；其它ledger完全不干预', () => {
    const patch = Object.freeze({ ledgerId: 37 });
    expect(validateTagMarginStockSales(patch)).toBeUndefined();
    expect(patch).not.toHaveProperty('marginByCoin');
    expect(() => validateTagMarginStockSales({ ledgerId: 37, marginByCoin: null })).not.toThrow();
    for (const ledgerId of [36, 38, 52]) {
      expect(() => validate([stock({ sales: [{ quantity: 1001, price: 20 }] })], ledgerId)).not.toThrow();
      expect(() => validate('{bad JSON', ledgerId)).not.toThrow();
    }
  });
  it('校验模块没有DB、DDL、网络、钱包或订单操作', () => {
    const text = readFileSync(new URL('./tag-margin-stock-sales-validation.ts', import.meta.url), 'utf8');
    expect(text).not.toMatch(/\.\/db|routers|\bfetch\(|CREATE TABLE|ALTER TABLE|UPDATE |INSERT |wallet|order/i);
    expect(text).not.toMatch(/JSON\.stringify|parseTagMarginRecords/);
  });
});

const routerText = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('routers.ts', routerText, ts.ScriptTarget.Latest, true);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return result;
}
function required<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`Missing production AST ${label}`);
  return value;
}
const saveRoute = required(nodes(tree, ts.isPropertyAssignment).find(n => n.name.getText(tree) === 'saveTagConfig'), 'saveTagConfig');
const mutation = required(nodes(saveRoute, ts.isCallExpression).find(n => ts.isPropertyAccessExpression(n.expression)
  && n.expression.name.text === 'mutation'), 'save mutation');
const saveCallback = mutation.arguments[0];
if (!ts.isArrowFunction(saveCallback) || !ts.isBlock(saveCallback.body)) throw new Error('Expected production async save body');
const saveBody = saveCallback.body;
const linkedCalc = required(nodes(tree, ts.isVariableDeclaration).find(n => n.name.getText(tree) === 'calculateLinked37Collateral'), 'linked calculator');
const linkedArrow = linkedCalc.initializer;
if (!linkedArrow || !ts.isArrowFunction(linkedArrow) || !ts.isBlock(linkedArrow.body)) throw new Error('Expected linked calculator arrow');
const linkedBody = linkedArrow.body;
const marginTry = required(linkedBody.statements.find(ts.isTryStatement), 'linked margin try');
const linkedLoop = required(linkedBody.statements.find(ts.isForOfStatement), 'linked entries loop');

function evaluateLinked(records: unknown, quotes: Record<string, TagMarginStockQuote> = QUOTES) {
  const parsed = parseTagMarginRecords(records);
  const declarations = linkedBody.statements.filter(ts.isVariableStatement).filter(statement =>
    statement.declarationList.declarations.some(n => ['entries', 'allPricesKnown', 'collateralValue'].includes(n.name.getText(tree))));
  const code = `(function () {\n${declarations[0].getText(tree)}\n${marginTry.getText(tree)}\n${declarations.slice(1).map(n => n.getText(tree)).join('\n')}\n${linkedLoop.getText(tree)}\nreturn { entries, allPricesKnown, collateralValue }; })()`;
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new vm.Script(js).runInNewContext({
    source: { collateralTagName: '测试' },
    linkedTagMarginByName: new Map([['测试', getTagMarginCurrencyRecords(parsed)]]),
    linkedTagStockMarginsByName: new Map([['测试', getTagMarginStockRecords(parsed)]]),
    linkedMarginStockQuotes: quotes, getTagMarginStockMarketValue, usdtCnyRate: 8,
    getLatestPrice: () => { throw new Error('离线测试禁止外部行情'); },
  });
}

describe('真实router AST写前接线与共享池consumer回归（不导入router/DB）', () => {
  it('校验helper确实从新模块导入，并在任何暂停联动/DDL/配置写入前无条件执行', () => {
    const helperImport = required(tree.statements.filter(ts.isImportDeclaration).find(n =>
      ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text === './tag-margin-stock-sales-validation'), 'validation import');
    expect(helperImport.getText(tree)).toContain('validateTagMarginStockSales');
    const guardStatement = required(saveBody.statements.find(n => ts.isExpressionStatement(n)
      && ts.isCallExpression(n.expression) && n.expression.expression.getText(tree) === 'validateTagMarginStockSales'), 'top-level guard');
    expect(guardStatement.getText(tree)).toBe('validateTagMarginStockSales(input);');
    const writes = nodes(saveBody, ts.isCallExpression).filter(n =>
      n.expression.getText(tree) === 'setLedger37TagGlobalPause' || /\.execute$/.test(n.expression.getText(tree)));
    expect(writes.length).toBeGreaterThan(5);
    for (const write of writes) expect(guardStatement.end).toBeLessThan(write.pos);
    expect(saveBody.getText(tree)).toContain("if (input.marginByCoin !== undefined) { setParts.push('margin_by_coin = ?'); setValues.push(input.marginByCoin); }");
    expect(nodes(saveBody, ts.isBinaryExpression).filter(n => n.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && n.left.getText(tree) === 'input.marginByCoin')).toHaveLength(0);
  });
  it('执行真实写前prefix：非法sale且带pauseDate仍在模拟任何写入前失败', async () => {
    const pauseStatement = required(saveBody.statements.find(n => n.getText(tree).includes('const linkedGlobalPauseResult')), 'pause statement');
    const prefix = saveBody.statements.filter(n => n.end <= pauseStatement.pos).map(n => n.getText(tree)).join('\n')
      .replace("await import('./db-ledger')", '__dbLedgerMod');
    const code = ts.transpileModule(`(async () => { ${prefix}; __write(); })()`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const write = vi.fn();
    const context = {
      input: { ledgerId: 37, tagName: '测试', pauseDate: '2026-11-16', marginByCoin: JSON.stringify([stock({ sales: [{ quantity: 1001, price: 20 }] })]) },
      ctx: { user: { id: 1 } }, console: { log: () => undefined },
      __dbLedgerMod: { getUserMembership: async () => ({ role: 'owner' }) },
      validateTagMarginStockSales, TRPCError, __write: write,
    };
    await expect(new vm.Script(code).runInNewContext(context)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(write).not.toHaveBeenCalled();
    await expect(new vm.Script(code).runInNewContext({ ...context, input: { ledgerId: 37, tagName: '测试', note: '仅PATCH' } })).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledOnce();
  });
  it('联动37共享池股票映射/风险循环真实AST使用valueCny，不再qty*price且保留旧展示字段', () => {
    const stockEntries = required(nodes(marginTry, ts.isVariableDeclaration).find(n => n.name.getText(tree) === 'stockEntries'), 'stock mapping');
    const marketCall = required(nodes(stockEntries, ts.isCallExpression).find(n => n.expression.getText(tree) === 'getTagMarginStockMarketValue'), 'sale-aware value call');
    expect(marketCall.arguments.map(n => n.getText(tree))).toEqual(['stock', 'linkedMarginStockQuotes']);
    expect(stockEntries.getText(tree)).toContain('valueCny: getTagMarginStockMarketValue(stock, linkedMarginStockQuotes)');
    for (const field of ['qty: stock.quantity', 'name: stock.name', 'code: stock.code', 'price,']) expect(stockEntries.getText(tree)).toContain(field);
    expect(linkedLoop.getText(tree)).toContain('entry.valueCny == null');
    expect(linkedLoop.getText(tree)).toContain('entry.valueCny / usdtCnyRate');
    expect(linkedLoop.getText(tree)).not.toMatch(/entry\.qty\s*\*\s*entry\.price/);
    expect(marginTry.getText(tree) + linkedLoop.getText(tree)).not.toMatch(/wallet|\.execute\(|UPDATE |INSERT |order/i);
  });
  it('执行真实联动映射/循环：部分和多价全部卖出现金加入风险值，保留qty/price显示', () => {
    const partial = evaluateLinked([stock({ sales: [{ quantity: 300, price: 30 }] }), { coin: 'CNY', amount: 800 }, { coin: 'USDT', amount: 10 }]);
    expect(partial.allPricesKnown).toBe(true);
    expect(partial.collateralValue).toBe(3422.5);
    expect(partial.entries.find((entry: any) => entry.assetType === 'stock')).toMatchObject({ qty: 1000, price: 25, valueCny: 26500 });
    const full = [stock({ referencePrice: 0, sales: [{ quantity: 600, price: 30 }, { quantity: 400, price: 40 }] })];
    for (const quotes of [{}, QUOTES, { '600519.SH': { price: 9999 } }]) {
      expect(evaluateLinked(full, quotes)).toMatchObject({ allPricesKnown: true, collateralValue: 4250 });
    }
  });
  it('真实联动缺价/坏sales/坏quantity必须unknown，同时保留其它合法currency价值', () => {
    for (const bad of [stock({ referencePrice: 0 }), stock({ sales: [{ quantity: 1001, price: 20 }] }),
      stock({ quantity: 'bad', sales: [{ quantity: 1, price: 20 }] }), stock({ quantity: 0, sales: [{ quantity: 1, price: 20 }] })]) {
      const result = evaluateLinked([bad, { coin: 'CNY', amount: 800 }], {});
      expect(result.allPricesKnown).toBe(false);
      expect(result.collateralValue).toBe(100);
      expect(result.entries).toHaveLength(2);
    }
    expect(evaluateLinked([stock({ quantity: -100 })])).toMatchObject({ allPricesKnown: true, collateralValue: -312.5 });
  });
});
