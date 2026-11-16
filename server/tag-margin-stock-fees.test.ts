import { readFileSync } from 'node:fs';
import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import * as margin from '../shared/tag-margin-assets';
import { getTagMarginStockSaleAmounts, TAG_MARGIN_STOCK_FEE_RATE } from '../shared/tag-margin-stock-fees';
import { validateTagMarginStockSales } from './tag-margin-stock-sales-validation';

const stock = (patch: Record<string, unknown> = {}): margin.TagMarginStockRecord => ({
  assetType: 'stock', symbol: '600519.SH', code: '600519', name: '测试质押股票',
  quantity: 1000, referencePrice: 20, priceDate: '2026-11-13', priceUpdatedAt: '',
  label: '', date: '2026-11-12', ...patch,
} as margin.TagMarginStockRecord);
const sale = (quantity: number, price: number) => ({ quantity, price, feeRate: TAG_MARGIN_STOCK_FEE_RATE });
const validate = (records: unknown, ledgerId = 37) => validateTagMarginStockSales({ ledgerId, marginByCoin: records });
const parseStock = (raw: unknown) => margin.getTagMarginStockRecords(margin.parseTagMarginRecords(raw))[0];
const QUOTES = { '600519.SH': { price: 25 } };
const INVALID = { valid: false, grossValue: 0, buyFee: 0, sellFee: 0, totalFee: 0, netValue: 0 };
const amounts = (value: unknown, purchasePrice?: unknown) => getTagMarginStockSaleAmounts(
  value as Parameters<typeof getTagMarginStockSaleAmounts>[0], purchasePrice as number | undefined,
);

const badRates: Array<[string, unknown]> = [
  ['null', null], ['explicit undefined', undefined], ['false', false], ['zero', 0],
  ['string', '0.001'], ['NaN', NaN], ['Infinity', Infinity], ['negative', -0.001],
  ['other rate', 0.002], ['near rate', 0.0010000000000000002], ['object', { rate: 0.001 }],
];
const badPurchasePrices: Array<[string, unknown]> = [
  ['null', null], ['false', false], ['zero', 0], ['negative', -1],
  ['string', '18'], ['NaN', NaN], ['Infinity', Infinity],
];
const badSales: Array<[string, unknown]> = [
  ['null sale', null], ['array sale', [1, 15]], ['missing quantity', { price: 15 }],
  ['missing price', { quantity: 1 }], ['zero quantity', { quantity: 0, price: 15 }],
  ['negative quantity', { quantity: -1, price: 15 }], ['fractional quantity', { quantity: 1.5, price: 15 }],
  ['unsafe quantity', { quantity: Number.MAX_SAFE_INTEGER + 1, price: 15 }],
  ['string quantity', { quantity: '1', price: 15 }], ['NaN quantity', { quantity: NaN, price: 15 }],
  ['zero price', { quantity: 1, price: 0 }], ['negative price', { quantity: 1, price: -15 }],
  ['string price', { quantity: 1, price: '15' }], ['NaN price', { quantity: 1, price: NaN }],
  ['infinite price', { quantity: 1, price: Infinity }],
];

describe('独立共享卖出手续费：逐笔买卖各1‰，分位half-up', () => {
  it('常量与helper从资产模块原样re-export，前端无需引入server', () => {
    expect(TAG_MARGIN_STOCK_FEE_RATE).toBe(0.001);
    expect(margin.TAG_MARGIN_STOCK_FEE_RATE).toBe(TAG_MARGIN_STOCK_FEE_RATE);
    expect(margin.getTagMarginStockSaleAmounts).toBe(getTagMarginStockSaleAmounts);
    const text = readFileSync(new URL('../shared/tag-margin-stock-fees.ts', import.meta.url), 'utf8');
    expect(text).not.toMatch(/\bimport\b|\d+n\b|\bfetch\(|\.\/db|routers/);
  });
  it('仅对本笔已售股数扣对应买方和卖方费用，不扣整笔原库存买费', () => {
    expect(amounts(sale(300, 30), 18)).toEqual({
      valid: true, grossValue: 9000, buyFee: 5.4, sellFee: 9, totalFee: 14.4, netValue: 8985.6,
    });
  });
  it('精确半分0.015向上为0.02，不受二进制浮点下偏影响', () => {
    expect(amounts(sale(1, 15), 15)).toEqual({
      valid: true, grossValue: 15, buyFee: 0.02, sellFee: 0.02, totalFee: 0.04, netValue: 14.96,
    });
    expect(amounts(sale(1, 14.999), 14.999)).toMatchObject({ buyFee: 0.01, sellFee: 0.01 });
    expect(amounts(sale(1, 15.001), 15.001)).toMatchObject({ buyFee: 0.02, sellFee: 0.02 });
  });
  it('两种费用分别四舍五入再精确相加，不额外税费或最低5元', () => {
    expect(amounts(sale(1, 200), 100)).toEqual({
      valid: true, grossValue: 200, buyFee: 0.1, sellFee: 0.2, totalFee: 0.3, netValue: 199.7,
    });
    expect(amounts(sale(1, 1e-7), 2e-7)).toEqual({
      valid: true, grossValue: 1e-7, buyFee: 0, sellFee: 0, totalFee: 0, netValue: 1e-7,
    });
  });
  it('支持小数科学计数法与大数科学计数法', () => {
    expect(amounts(sale(100000000, 1e-7), 2e-7)).toEqual({
      valid: true, grossValue: 10, buyFee: 0.02, sellFee: 0.01, totalFee: 0.03, netValue: 9.97,
    });
    expect(amounts(sale(1, 1e21), 2e21)).toEqual({
      valid: true, grossValue: 1e21, buyFee: 2e18, sellFee: 1e18, totalFee: 3e18, netValue: 9.97e20,
    });
    expect(amounts(sale(1, Number.MIN_VALUE), Number.MIN_VALUE)).toMatchObject({
      valid: true, buyFee: 0, sellFee: 0, netValue: Number.MIN_VALUE,
    });
  });
  it('新计费gross与net使用精确十进制，只将两项手续费舍入到分', () => {
    expect(amounts(sale(1, 15.12345), 15)).toEqual({
      valid: true, grossValue: 15.12345, buyFee: 0.02, sellFee: 0.02, totalFee: 0.04, netValue: 15.08345,
    });
    expect(amounts(sale(3, 0.1), 0.1)).toMatchObject({ grossValue: 0.3, netValue: 0.3 });
  });
  it('旧缺feeRate无需买入价，即使单独helper收到坏买价也不追扣或舍入', () => {
    const legacy = { quantity: 3, price: 0.1 };
    for (const purchasePrice of [undefined, null, '18', NaN, Infinity]) {
      expect(amounts(legacy, purchasePrice)).toEqual({
        valid: true, grossValue: legacy.price * legacy.quantity, buyFee: 0, sellFee: 0,
        totalFee: 0, netValue: legacy.price * legacy.quantity,
      });
    }
    expect(legacy).not.toHaveProperty('feeRate');
  });
  it.each(badRates)('feeRate字段存在且为%s必须拒绝，不视为旧缺字段', (_label, feeRate) => {
    expect(amounts({ quantity: 1, price: 15, feeRate }, 18)).toEqual(INVALID);
  });
  it.each(badPurchasePrices)('计费sale买价%s必须拒绝，不从行情推断', (_label, purchasePrice) => {
    expect(amounts(sale(1, 15), purchasePrice)).toEqual(INVALID);
  });
  it.each(badSales)('%s严格拒绝，不清洗或强制类型转换', (_label, value) => {
    expect(amounts(value, 18)).toEqual(INVALID);
  });
  it('gross、单项手续费及总手续费溢出都拒绝', () => {
    expect(amounts({ quantity: 2, price: Number.MAX_VALUE })).toEqual(INVALID);
    expect(amounts(sale(2, Number.MAX_VALUE), 18)).toEqual(INVALID);
    expect(amounts(sale(1001, 1), Number.MAX_VALUE)).toEqual(INVALID);
    expect(amounts(sale(1000, Number.MAX_VALUE / 1000), Number.MAX_VALUE)).toEqual(INVALID);
  });
  it('买入总金额中间值会溢出但实际1‰费用及净值有限时，仍用精确十进制计算', () => {
    expect(amounts(sale(10, 1), Number.MAX_VALUE)).toMatchObject({ valid: true, buyFee: 1.7976931348623157e306 });
  });
});

describe('真实共享资产估值：净卖出额加剩余行情，不改原股数/买价', () => {
  it('部分卖出summary仅原四个keys，净额加剩余行情；缺剩余行情为未知', () => {
    const record = stock({ purchasePrice: 18, sales: [sale(300, 30)] });
    expect(margin.getTagMarginStockSaleSummary(record)).toEqual({
      soldQuantity: 300, saleValue: 8985.6, remainingQuantity: 700, valid: true,
    });
    expect(margin.getTagMarginStockMarketValue(record, QUOTES)).toBe(26485.6);
    expect(margin.getTagMarginStockMarketValue(record, undefined)).toBe(22985.6);
    expect(margin.getTagMarginStockMarketValue(stock({ ...record, referencePrice: 0 }), undefined)).toBeNull();
    expect(record).toMatchObject({ quantity: 1000, purchasePrice: 18 });
  });
  it('多笔不同成交价只扣各自本笔股数买费，累计净现金', () => {
    const record = stock({ purchasePrice: 18, sales: [sale(200, 30), sale(300, 40)] });
    expect(margin.getTagMarginStockSaleSummary(record)).toEqual({
      soldQuantity: 500, saleValue: 17973, remainingQuantity: 500, valid: true,
    });
    expect(margin.getTagMarginStockMarketValue(record, QUOTES)).toBe(30473);
  });
  it('同一库存分两笔登记时按每笔分别分位舍入，不合并后舍入', () => {
    const record = stock({ quantity: 2, purchasePrice: 15, sales: [sale(1, 15), sale(1, 15)] });
    expect(margin.getTagMarginStockSaleSummary(record).saleValue).toBe(29.92);
    expect(amounts(sale(2, 15), 15).netValue).toBe(29.94);
  });
  it('混合旧无feeRate/new0.001两行，旧成交现金不追扣', () => {
    const oldSale = { quantity: 200, price: 30 };
    const record = stock({ purchasePrice: 18, sales: [oldSale, sale(300, 40)] });
    expect(margin.getTagMarginStockSaleSummary(record)).toEqual({
      soldQuantity: 500, saleValue: 17982.6, remainingQuantity: 500, valid: true,
    });
    expect(margin.getTagMarginStockMarketValue(record, QUOTES)).toBe(30482.6);
    expect(oldSale).not.toHaveProperty('feeRate');
  });
  it('全部卖出不依赖quote，quote999或缺行情均不改变净现金，也不收集symbol', () => {
    const record = stock({ referencePrice: 0, purchasePrice: 18, sales: [sale(1000, 30)] });
    for (const quotes of [undefined, {}, QUOTES, { '600519.SH': { price: 999 } }]) {
      expect(margin.getTagMarginStockMarketValue(record, quotes)).toBe(29952);
    }
    expect(margin.getTagMarginStockSymbols([record])).toEqual([]);
    expect(record).toMatchObject({ quantity: 1000, purchasePrice: 18 });
  });
  it('手续费超过成交额时保留实际负净额，不截为0', () => {
    const record = stock({ quantity: 1, purchasePrice: 10000, sales: [sale(1, 1)] });
    expect(amounts(record.sales![0], record.purchasePrice)).toEqual({
      valid: true, grossValue: 1, buyFee: 10, sellFee: 0, totalFee: 10, netValue: -9,
    });
    expect(margin.getTagMarginStockMarketValue(record, { '600519.SH': { price: 999 } })).toBe(-9);
    expect(() => validate([record])).not.toThrow();
  });
  it('旧负/小数库存无sales不改变，旧sale仍保留未舍入gross', () => {
    for (const quantity of [-100.5, 100.5]) {
      const record = parseStock([stock({ quantity })]);
      expect(margin.getTagMarginStockMarketValue(record, QUOTES)).toBe(quantity * 25);
      expect(() => validate([record])).not.toThrow();
      expect(record).not.toHaveProperty('sales');
    }
    const record = stock({ quantity: 3, sales: [{ quantity: 3, price: 0.1 }] });
    expect(margin.getTagMarginStockSaleSummary(record).saleValue).toBe(0.1 * 3);
    expect(margin.getTagMarginStockMarketValue(record, undefined)).toBe(0.1 * 3);
  });
  it('已存feeRate读回多次只按原成交额扣一次，不累计重复扣费', () => {
    const raw = JSON.stringify([stock({ purchasePrice: 18, sales: [sale(300, 30)] })]);
    for (let iteration = 0; iteration < 3; iteration++) {
      const record = parseStock(raw);
      expect(margin.getTagMarginStockMarketValue(record, QUOTES)).toBe(26485.6);
      expect(margin.getTagMarginStockMarketValue(record, QUOTES)).toBe(26485.6);
      expect(record.sales![0]).toEqual(sale(300, 30));
      expect(validate(raw)).toBeUndefined();
      expect(JSON.stringify([record])).toBe(raw);
    }
  });
  it('保留原sales数组及单笔对象，不清洗feeRate未知字段或改写冻结输入', () => {
    const savedSale = Object.freeze({ ...sale(300, 30), auditNote: '原始登记' });
    const sales = Object.freeze([savedSale]);
    const record = Object.freeze(stock({ purchasePrice: 18, sales }));
    const records = Object.freeze([record]);
    const normalized = parseStock(records);
    expect(normalized.sales).toBe(sales);
    expect(normalized.sales![0]).toBe(savedSale);
    expect(amounts(savedSale, 18).netValue).toBe(8985.6);
    expect(margin.getTagMarginStockMarketValue(normalized, QUOTES)).toBe(26485.6);
    expect(validate(records)).toBeUndefined();
    expect(record).toMatchObject({ quantity: 1000, purchasePrice: 18, sales: [savedSale] });
  });
  it('单笔合法但累计净额溢出仍fail-closed', () => {
    const record = stock({ quantity: 1200, purchasePrice: Number.MAX_VALUE, sales: [sale(600, 1), sale(600, 1)] });
    expect(amounts(record.sales![0], record.purchasePrice).valid).toBe(true);
    expect(margin.getTagMarginStockSaleSummary(record).valid).toBe(false);
    expect(margin.getTagMarginStockMarketValue(record, QUOTES)).toBeNull();
    expect(() => validate([record])).toThrow(TRPCError);
  });
});

describe('真实服务端校验：feeRate坏新增数据fail-closed，仅作用ledger37', () => {
  it.each(badRates)('坏费率%s保留原字段供纠正、估值未知并拒绝保存', (_label, feeRate) => {
    const savedSale = { quantity: 1, price: 15, feeRate };
    const raw = stock({ purchasePrice: 18, sales: [savedSale] });
    const parsed = parseStock([raw]);
    expect(parsed.sales).toBe(raw.sales);
    expect(parsed.sales![0]).toBe(savedSale);
    expect(Object.prototype.hasOwnProperty.call(parsed.sales![0], 'feeRate')).toBe(true);
    expect(margin.getTagMarginStockSaleSummary(parsed).valid).toBe(false);
    expect(margin.getTagMarginStockMarketValue(parsed, QUOTES)).toBeNull();
    expect(margin.getTagMarginStockSymbols([parsed])).toEqual([]);
    expect(() => validate([raw])).toThrow('买卖手续费固定千分之一');
    expect(savedSale.feeRate).toBe(feeRate);
  });
  it.each(badPurchasePrices)('显式坏买价%s估值未知且拒绝保存，即使reference/quote有效', (_label, purchasePrice) => {
    const raw = stock({ sales: [sale(1, 15)], purchasePrice });
    const parsed = parseStock([raw]);
    expect(margin.getTagMarginStockMarketValue(parsed, QUOTES)).toBeNull();
    expect(() => validate([raw])).toThrow(TRPCError);
  });
  it('JSON坏费率null/字符串/指数溢出整批拒绝，不影响其它合法资产保留', () => {
    for (const feeRate of ['null', '"0.001"', '1e999', '0.002']) {
      const raw = `[{"assetType":"stock","symbol":"600519.SH","quantity":1000,"purchasePrice":18,"sales":[{"quantity":1,"price":15,"feeRate":${feeRate}}]},{"coin":"CNY","amount":500}]`;
      expect(() => validate(raw)).toThrow(TRPCError);
      const parsed = margin.parseTagMarginRecords(raw);
      expect(parsed).toHaveLength(2);
      expect(margin.getTagMarginStockMarketValue(margin.getTagMarginStockRecords(parsed)[0], QUOTES)).toBeNull();
      expect(margin.getTagMarginCurrencyRecords(parsed)[0].amount).toBe(500);
    }
  });
  it('合法JSON验证返回void且保留原字节、成交总额、费率、原买价与股数', () => {
    const raw = ' [ {"assetType":"stock","symbol":"600519.SH","quantity":1000,"purchasePrice":18,"sales":[{"quantity":300,"price":30,"feeRate":0.001}],"referencePrice":20} ] ';
    const input = Object.freeze({ ledgerId: 37, marginByCoin: raw });
    expect(validateTagMarginStockSales(input)).toBeUndefined();
    expect(input.marginByCoin).toBe(raw);
    expect(parseStock(raw)).toMatchObject({ quantity: 1000, purchasePrice: 18, sales: [sale(300, 30)] });
  });
  it('只有ledger37股票sales受约束：其它ledger、currency、旧字典以及不带margin的PATCH不干预', () => {
    const invalid = [stock({ sales: [{ quantity: 1, price: 15, feeRate: null }] })];
    expect(() => validate(invalid)).toThrow(TRPCError);
    for (const ledgerId of [36, 38, 52]) {
      expect(() => validate(invalid, ledgerId)).not.toThrow();
      expect(() => validate('{bad JSON', ledgerId)).not.toThrow();
    }
    for (const records of [
      [{ coin: 'CNY', amount: 500, feeRate: null, sales: [sale(1, 15)] }],
      { CNY: 500, feeRate: null }, null, undefined,
      [stock({ sales: [{ quantity: 1, price: 15 }] })],
    ]) expect(() => validate(records)).not.toThrow();
    expect(validateTagMarginStockSales(Object.freeze({ ledgerId: 37 }))).toBeUndefined();
  });
});


describe('最终确认规则：买价选填，未填双边按卖额，逐笔卖出日期独立', () => {
  it('未填买价也可保存，买卖各按卖额1‰；不从参考价或行情伪造买入价', () => {
    const record = stock({ quantity: 100, sales: [sale(100, 12)] });
    expect(amounts(record.sales![0])).toEqual({ valid: true, grossValue: 1200, buyFee: 1.2, sellFee: 1.2, totalFee: 2.4, netValue: 1197.6 });
    expect(() => validate([record])).not.toThrow();
    for (const quote of [undefined, {}, QUOTES, { '600519.SH': { price: 9999 } }]) {
      expect(margin.getTagMarginStockMarketValue(record, quote)).toBe(1197.6);
    }
    expect(record).not.toHaveProperty('purchasePrice');
  });
  it('原始十进制成交额扣分位费用后保留精确半分，显示2.99而不是2.98', () => {
    const result = amounts(sale(3, 1.005), 10);
    expect(result).toEqual({ valid: true, grossValue: 3.015, buyFee: 0.03, sellFee: 0, totalFee: 0.03, netValue: 2.985 });
    expect(result.netValue.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe('2.99');
  });
  it('合法历史卖出日期保留各笔信息、原买入日期和股数，日期不改变成交价或手续费', () => {
    const record = stock({ quantity: 100, date: '2023-01-01', sales: [
      { ...sale(40, 12), date: '2024-02-29' }, { ...sale(60, 12), date: '2024-03-01' },
    ] });
    const before = structuredClone(record);
    expect(() => validate(JSON.stringify([record]))).not.toThrow();
    const parsed = parseStock(JSON.stringify([record]));
    expect(parsed.sales?.map((s) => s.date)).toEqual(['2024-02-29', '2024-03-01']);
    expect(parsed.date).toBe('2023-01-01');
    expect(parsed.quantity).toBe(100);
    expect(margin.getTagMarginStockMarketValue(parsed, undefined)).toBe(1197.6);
    expect(record).toEqual(before);
  });
  it.each(['', ' ', '2024-02-30', '2023-02-29', '2024-13-01', '2024-01-32', '24-01-01', '2024/01/01', '2024-01-01T00:00:00Z', '9999-01-01', null, undefined, 20240101])('显式坏或未来卖出日期%s不得当作缺省旧日期，估值未知且保存拒绝', (date) => {
    const record = stock({ quantity: 100, sales: [{ ...sale(100, 12), date }] });
    expect(margin.getTagMarginStockSaleSummary(record).valid).toBe(false);
    expect(margin.getTagMarginStockMarketValue(record, QUOTES)).toBeNull();
    expect(() => validate([record])).toThrow(TRPCError);
    const parsed = parseStock([record]);
    expect(parsed.sales).toBe(record.sales);
    expect(Object.prototype.hasOwnProperty.call(parsed.sales![0], 'date')).toBe(true);
  });
  it('旧无日期无手续费登记仍保留gross，不自动补日期或买入价', () => {
    const record = stock({ sales: [{ quantity: 1000, price: 12 }] });
    const before = structuredClone(record);
    expect(() => validate([record])).not.toThrow();
    const parsed = parseStock(JSON.stringify([record]));
    expect(parsed.sales![0]).not.toHaveProperty('date');
    expect(parsed.sales![0]).not.toHaveProperty('feeRate');
    expect(parsed).not.toHaveProperty('purchasePrice');
    expect(margin.getTagMarginStockMarketValue(parsed, undefined)).toBe(12000);
    expect(record).toEqual(before);
  });
});
