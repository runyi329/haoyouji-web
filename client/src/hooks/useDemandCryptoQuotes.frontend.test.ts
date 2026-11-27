import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as catalog from '../../../shared/crypto-asset-catalog';
import * as instruments from '../../../shared/portfolio-instruments';
import { buildWalletDigitalAssets } from '../lib/walletDigitalAssets';
import * as fx from '../../../shared/usdt-cny-display';

// Execute frontend-only expressions with inert hooks. No app router, scanner, HTTP or DB import.
const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');
const hookSource = read('client/src/hooks/useDemandCryptoQuotes.ts');
const selectSource = read('client/src/components/CryptoAssetSelect.tsx');
const tradeSource = read('client/src/components/StockTagTradeDialog.tsx');
const funderSource = read('client/src/pages/FunderManagement.tsx');
const walletSource = read('client/src/pages/Wallet.tsx');
function execute(source: string, name: string, scope: Record<string, any> = {}) {
  const file = ts.createSourceFile('frontend.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let code = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) code = node.initializer.getText(file);
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(file).replace(/^export\s+(default\s+)?/, '');
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!code) throw new Error(`Missing actual frontend expression: ${name}`);
  const js = ts.transpileModule(`const actual = ${code};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function('React', ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
}
const normalize = execute(hookSource, 'normalizeDemandCryptoSymbols', catalog);
const fresh = execute(hookSource, 'getFreshDemandCryptoPrices', { MAX_QUOTE_AGE_MS: 120_000 });
const merge = execute(hookSource, 'mergeDemandCryptoPrices');
const searchText = execute(selectSource, 'getCryptoAssetSearchText', { ASSET_NAMES: catalog.CRYPTO_ASSET_NAMES });
const now = Date.parse('2026-11-27T15:00:00Z');
const quote = (price: any = 100, overrides = {}) => ({ price, currency: 'USDT', stale: false, source: 'Gate.io', updatedAt: new Date(now).toISOString(), ...overrides });
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}

function tradeHarness(props: Record<string, any> = {}) {
  const state: any[] = [], effects: any[] = [], pending: (() => void)[] = [];
  let stateCursor = 0, effectCursor = 0;
  const prices: Record<string, number> = {};
  const demands: any[] = [], searches: any[] = [];
  const add = { mutate: vi.fn(), isPending: false }, update = { mutate: vi.fn(), isPending: false };
  const portfolio = { canEdit: true, summary: { usdtCnyRate: 7 }, positions: [{ symbol: 'CRYPTO:ETH-USDT', stockName: '以太坊', marketPrice: 42,
    lots: [{ id: 1, quantity: 2, unitCost: 30 }] }] };
  const options = catalog.CRYPTO_ASSET_CODES.map(base => ({ symbol: `CRYPTO:${base}-USDT`, market: 'CRYPTO', currency: 'USDT', name: catalog.CRYPTO_ASSET_NAMES[base], latestPrice: 999 }));
  const scope: Record<string, any> = {
    ...instruments, getCryptoAssetSearchText: searchText,
    formatQuantity: execute(tradeSource, 'formatQuantity'), money: execute(tradeSource, 'money', instruments), STOCK_TRADE_FEE_RATE: .001,
    localInputTime: execute(tradeSource, 'localInputTime'), localInputDate: execute(tradeSource, 'localInputDate'),
    beijingTradeInputTime: execute(tradeSource, 'beijingTradeInputTime'), parseTradeInputTime: execute(tradeSource, 'parseTradeInputTime'),
    toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
    useState: (value: any) => { const i = stateCursor++; if (!(i in state)) state[i] = typeof value === 'function' ? value() : value; return [state[i], (next: any) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
    useMemo: (fn: any) => fn(),
    useEffect: (fn: any, deps: any[]) => { const i = effectCursor++; if (!effects[i] || deps.some((d, n) => !Object.is(d, effects[i][n]))) { effects[i] = deps; pending.push(fn); } },
    useDemandCryptoQuotes: (raw: any[], enabled: boolean) => { const symbols = normalize(enabled ? raw : []); demands.push({ raw, enabled, symbols }); return { prices: Object.fromEntries(symbols.filter((s: string) => s in prices).map((s: string) => [s, prices[s]])), symbols, isFetching: enabled && symbols.some((s: string) => !(s in prices)) }; },
    trpc: {
      useUtils: () => ({ ledger: { getStockTagPortfolio: { invalidate: vi.fn() }, getStockLotParticipationMatrix: { invalidate: vi.fn() }, getStockTagDailySnapshots: { invalidate: vi.fn() } } }),
      exchange: { getRate: { useQuery: () => ({ data: { money: 7 } }) } },
      ledger: { getStockTagPortfolio: { useQuery: () => ({ data: portfolio }) }, getStockLotParticipationMatrix: { useQuery: () => ({ data: { members: [], lots: [] } }) },
        addStockTagEvent: { useMutation: () => add }, updateStockTagSale: { useMutation: () => update } },
      searchManualStocks: { useQuery: (input: any, opts: any) => { searches.push({ input, opts }); return { data: { results: input.query === '*' ? options : [] }, refetch: vi.fn(), isFetching: false }; } },
    },
  };
  for (const name of ['CryptoAssetSelect', 'Loader2', 'Minus', 'Plus', 'Button', 'Input', 'Label', 'Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle']) scope[name] = name;
  const parameters = { categoryId: 123, categoryName: '离线测试', open: true, type: 'buy', onOpenChange: vi.fn(), ...props };
  const component = execute(tradeSource, 'StockTagTradeDialog', scope);
  const once = () => { stateCursor = effectCursor = 0; return component(parameters); };
  const render = () => { let tree = once(); for (let i = 0; pending.length && i < 8; i++) { pending.splice(0).forEach(fn => fn()); tree = once(); } return tree; };
  const button = (label: string) => nodes(render()).find(n => ['button', 'Button'].includes(n.type) && text(n).trim() === label);
  const input = (placeholder: string) => nodes(render()).find(n => n.type === 'Input' && n.props.placeholder === placeholder);
  const selector = () => nodes(render()).find(n => n.type === 'CryptoAssetSelect');
  const choose = (base: string) => { selector().props.onValueChange(base); return render(); };
  return { render, button, input, selector, choose, prices, demands, searches, add, update, scope, parameters };
}

describe('按需报价hook只读契约', () => {
  it('规范化去重，并拒绝CNY/USDT、证券和错误资产身份', () => {
    expect(normalize(['btc', 'BTC', 'CRYPTO:ETH-USDT', 'CNY', 'USDT', 'AAPL', 'CRYPTO:BTC-USD', null])).toEqual(['BTC', 'ETH']);
    expect(normalize(catalog.CRYPTO_ASSET_CODES)).toHaveLength(216);
  });
  it('仅返回所请求资产的fresh价格', () => {
    expect(fresh({ BTC: quote(), ETH: quote(200) }, ['ETH'], now)).toEqual({ ETH: 200 });
  });
  it.each([null, 0, -1, NaN, Infinity, '123'])('无效价格%s不可作新价', price => {
    expect(fresh({ BTC: quote(price) }, ['BTC'], now)).toEqual({});
  });
  it.each([{ stale: true }, { updatedAt: null }, { updatedAt: 'invalid' }, { currency: 'USD' }, { updatedAt: new Date(now - 120_001).toISOString() }, { updatedAt: new Date(now + 5_001).toISOString() }])('失效元数据%j不可延寿', patch => {
    expect(fresh({ BTC: quote(100, patch) }, ['BTC'], now)).toEqual({});
  });
  it('后台断网缓存超过120秒不冒充新价；BTY按统一MEXC六分钟口径', () => {
    expect(fresh({ BTC: quote() }, ['BTC'], now + 130_000)).toEqual({});
    expect(fresh({ BTY: quote(1, { source: 'MEXC BTY/USDT 现货' }) }, ['BTY'], now + 130_000)).toEqual({ BTY: 1 });
  });
  it('合并保留非选择的订单价格，移除选择失效价，不把BTC旧价映射为ETH', () => {
    const orderPrices = { BTC: 100, ETH: 200, AAPL: 50 };
    expect(merge(orderPrices, ['ETH'], {})).toEqual({ BTC: 100, AAPL: 50 });
    expect(merge(orderPrices, ['ETH'], { ETH: 201, BTC: 999 })).toEqual({ BTC: 100, ETH: 201, AAPL: 50 });
    expect(orderPrices).toEqual({ BTC: 100, ETH: 200, AAPL: 50 });
  });
  it('实际hook只启用选中集合，每10秒续租；关闭和空集合不请求', () => {
    const calls: any[] = [], timers: any[] = [], clear = vi.fn(), effects: any[] = [];
    const hook = execute(hookSource, 'useDemandCryptoQuotes', {
      normalizeDemandCryptoSymbols: normalize, getFreshDemandCryptoPrices: fresh, DEMAND_CRYPTO_REFETCH_MS: 10_000,
      useMemo: (fn: any) => fn(), useState: () => [now, vi.fn()], useEffect: (fn: any) => { effects.push(fn); },
      window: { setInterval: (fn: any, ms: number) => { timers.push(ms); return 7; }, clearInterval: clear },
      trpc: { ledger: { getCryptoSpotQuotes: { useQuery: (input: any, opts: any) => { calls.push({ input, opts }); return { data: { quotes: {} } }; } } } },
    });
    hook(['ETH', 'BTC', 'ETH']);
    expect(calls.at(-1)).toMatchObject({ input: { symbols: ['BTC', 'ETH'] }, opts: { enabled: true, staleTime: 0, refetchInterval: 10_000, refetchIntervalInBackground: false } });
    const cleanup = effects.pop()(); expect(timers).toEqual([10_000]); cleanup(); expect(clear).toHaveBeenCalledWith(7);
    expect(calls.at(-1).opts).not.toHaveProperty('placeholderData');
    hook(['BTC'], false); expect(calls.at(-1)).toMatchObject({ input: { symbols: [] }, opts: { enabled: false, refetchInterval: false } });
    hook(['CNY', 'AAPL']); expect(calls.at(-1).opts.enabled).toBe(false);
  });
});

describe('目录可搜索且打开目录不取价格', () => {
  it('216种目录代码、名称与人民币/泰达币均可搜索，选择器没有报价依赖', () => {
    expect(searchText('BTC')).toMatch(/BTC.*比特币/);
    expect(searchText('CNY')).toMatch(/人民币/); expect(searchText('USDT')).toMatch(/Tether/);
    for (const code of catalog.CRYPTO_ASSET_CODES) expect(searchText(code)).toContain(code);
    expect(selectSource).not.toMatch(/useQuery|useDemandCryptoQuotes|getCryptoSpotQuotes/);
    expect(selectSource).toContain('keywords={[getCryptoAssetSearchText(code)]}');
    expect(selectSource).toContain('rounded-[3px]');
  });
  it('融资表单需求来自选中的购买/融资/担保币种，仅showForm非stock启用，不setState合并', () => {
    const capture = vi.fn();
    execute(funderSource, 'formDemandQuotes', { useDemandCryptoQuotes: capture, formData: { coin: 'BTC', amountCurrency: 'ETH', assetType: 'crypto' }, collateralAssets: [{ coin: 'UNI' }, { coin: 'CNY' }], showForm: true });
    expect(capture).toHaveBeenCalledWith(['BTC', 'ETH', 'UNI', 'CNY'], true);
    execute(funderSource, 'formDemandQuotes', { useDemandCryptoQuotes: capture, formData: { coin: 'BTC', amountCurrency: 'CNY', assetType: 'stock' }, collateralAssets: [], showForm: true });
    expect(capture.mock.calls.at(-1)?.[1]).toBe(false);
    expect(funderSource).toMatch(/const formLivePrices = useMemo\(\(\) => mergeDemandCryptoPrices/);
    expect(funderSource).toMatch(/aria-label="融资币种"/); expect(funderSource).toMatch(/aria-label="购买币种"/);
  });
  it('融资币种切换缺价时清除旧单位金额和价，而不是把BTC报价当成ETH', () => {
    const setFormData = vi.fn(), setAmountInputValue = vi.fn(), resetLinkedAmountFields = vi.fn();
    const previous = { amountCurrency: 'BTC', buyPrice: '12' };
    const handler = execute(funderSource, 'handleAmountCurrencyChange', {
      formData: previous, amountInputValue: '2', cnyRate: 7, ...fx,
      toUsdtBase: (value: number) => value * 100, fromUsdtBase: () => null,
      formatLinkedAmountValue: String, resetLinkedAmountFields, setFormData, setAmountInputValue,
      toast: { error: vi.fn() },
    });
    handler('ETH');
    expect(setAmountInputValue).toHaveBeenCalledWith('');
    expect(setFormData.mock.calls[0][0](previous)).toMatchObject({ amountCurrency: 'ETH', buyPrice: '' });
    expect(resetLinkedAmountFields).toHaveBeenCalledOnce();
  });
  it('弹窗默认目录216种无币价请求，名称搜索也不租约搜索结果', () => {
    const h = tradeHarness(); h.button('数字币·USDT').props.onClick(); h.render();
    expect(h.selector().props.options).toHaveLength(216);
    expect(h.demands.at(-1)).toMatchObject({ symbols: [], enabled: false });
    h.input('如 BTC、ETH、比特币（仅USDT现货）').props.onChange({ target: { value: '比特币' } });
    const tree = h.render(); expect(nodes(tree).some(n => n.key === 'CRYPTO:BTC-USDT')).toBe(true);
    expect(h.demands.at(-1).symbols).toEqual([]);
    expect(h.searches.filter(c => c.opts.enabled && c.input.market === 'CRYPTO').every(c => c.input.query === '*')).toBe(true);
  });
  it('选中即租约且持续刷新，切换不使用目录旧999，刷新不改用户手工成交价', () => {
    const h = tradeHarness(); h.button('数字币·USDT').props.onClick(); h.render(); h.choose('BTC');
    expect(h.demands.at(-1)).toMatchObject({ symbols: ['BTC'], enabled: true });
    expect(h.input('0.00').props.value).toBe('');
    h.prices.BTC = 101; h.render(); expect(h.input('0.00').props.value).toBe('101');
    expect(h.demands.at(-1).enabled).toBe(true);
    h.input('0.00').props.onChange({ target: { value: '95' } }); h.prices.BTC = 102; h.render();
    expect(h.input('0.00').props.value).toBe('95');
    h.choose('ETH'); expect(h.demands.at(-1).symbols).toEqual(['ETH']); expect(h.input('0.00').props.value).toBe('');
    h.prices.ETH = 210; h.render(); expect(h.input('0.00').props.value).toBe('210');
    h.parameters.open = false; h.render(); expect(h.demands.at(-1)).toMatchObject({ enabled: false, symbols: [] });
  });
  it('卖出正在查看的币种续租并展示有效新价，不覆盖实际卖出输入', () => {
    const h = tradeHarness({ type: 'sell', initialLotId: 1 });
    h.render(); expect(h.demands.at(-1)).toMatchObject({ symbols: ['ETH'], enabled: true });
    h.prices.ETH = 55; expect(text(h.render())).toContain('当前价 USDT 55.00');
    h.input('0.00').props.onChange({ target: { value: '50' } }); h.prices.ETH = 56; h.render();
    expect(h.input('0.00').props.value).toBe('50');
    delete h.prices.ETH; expect(text(h.render())).toContain('当前价 —');
  });
  it('只读预览不能写，真实购买请求仍保留原始CRYPTO symbol/时间/数量', () => {
    const h = tradeHarness(); h.button('数字币·USDT').props.onClick(); h.render(); h.choose('ETH'); h.prices.ETH = 100; h.render();
    h.input('币数量（最多8位小数）').props.onChange({ target: { value: '0.12345678' } }); h.render();
    h.button('确认买入').props.onClick();
    expect(h.add.mutate).toHaveBeenCalledWith(expect.objectContaining({ ledgerId: 37, categoryId: 123, symbol: 'CRYPTO:ETH-USDT', executionPrice: 100, quantity: .12345678 }));
    h.parameters.readOnlyPreview = true; h.render(); h.button('热预览不可写入').props.onClick(); expect(h.add.mutate).toHaveBeenCalledTimes(1);
  });
});

describe('Wallet真实余额估值只读接线', () => {
  it('只对非零真实余额保活，冻结余额属于真实资产，216零余额不铺卡', () => {
    const rows = catalog.CRYPTO_ASSET_CODES.map(assetCode => ({ assetCode, totalBalance: assetCode === 'BTC' ? 1 : 0 }));
    rows.push({ assetCode: 'ETH', availableBalance: 0, frozenBalance: 2 } as any);
    const capture = vi.fn(); execute(walletSource, 'walletDemandQuotes', { useDemandCryptoQuotes: capture, multiAssetBalancesQuery: { data: rows }, isGlobalWalletView: true });
    expect(capture).toHaveBeenCalledWith(['BTC', 'ETH'], true);
    const assets = buildWalletDigitalAssets({ total: 1, available: 1, frozen: 0 }, rows);
    expect(assets.map(a => a.assetCode)).toEqual(['USDT', 'BTC', 'ETH']);
    expect(walletSource).not.toContain('trpc.getCryptoPrices.useQuery');
    expect(walletSource).toContain('const unifiedPrices = walletDemandQuotes.prices');
  });
  it('有效USDT汇率保留正确换算，失效FX不能回退', () => {
    const data = { success: true, rate: 6.7, money: 6.7, pair: 'USDT/CNY', stale: false, observedAt: new Date().toISOString() };
    const run = (value: any) => execute(walletSource, 'walletFxValuation', { ...fx, usdtTotalBalance: 10, cnyBalance: 100, walletFxQuery: { data: value } });
    expect(run(data)).toMatchObject({ rate: 6.7, usdtValueCny: 67 });
    expect(run({ ...data, stale: true })).toMatchObject({ rate: null, usdtValueCny: null, cnyValueUsdt: null });
  });
});
