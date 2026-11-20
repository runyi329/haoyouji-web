import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as instruments from '../shared/portfolio-instruments';

// Only execute real frontend expressions/handlers with inert tRPC hooks; no HTTP, DB or accounting.
const tradeSource = readFileSync(new URL('../client/src/components/StockTagTradeDialog.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../client/src/pages/StockTagPortfolio.tsx', import.meta.url), 'utf8');
const allocationSource = readFileSync(new URL('../client/src/pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
const astCache = new Map<string, ts.SourceFile>();
function execute(source: string, name: string, scope: Record<string, any> = {}) {
  let file = astCache.get(source);
  if (!file) { file = ts.createSourceFile('frontend.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); astCache.set(source, file); }
  let code = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file!) === name && node.initializer) code = node.initializer.getText(file!);
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(file!).replace(/^export\s+(default\s+)?/, '');
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!code) throw new Error(`Missing actual frontend expression: ${name}`);
  const js = ts.transpileModule(`const actual = ${code.replace(/import\.meta\.env\.DEV/g, 'false')};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function('React', ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
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
const localInputTime = execute(tradeSource, 'localInputTime');
const localInputDate = execute(tradeSource, 'localInputDate');
const beijingTradeInputTime = execute(tradeSource, 'beijingTradeInputTime');
const parseTradeInputTime = execute(tradeSource, 'parseTradeInputTime');
const symbol = 'CRYPTO:BTC-USDT';
const crypto = { symbol, name: '比特币', market: 'CRYPTO', currency: 'USDT', latestPrice: 100, source: 'gate', updatedAt: '2026-11-15T08:00:00Z' };
const ethCrypto = { ...crypto, symbol: 'CRYPTO:ETH-USDT', name: '以太坊', latestPrice: 200 };
// Simulate the server's 38-item default directory without importing any quote/scanner module.
const cryptoCatalogBases = [
  'BTC', 'ETH', 'SOL', 'BNB', 'HYPE', 'TRUMP', 'PENGU', 'XPL', 'WLFI',
  'AVAX', 'DOGE', 'XLM', 'TIA', 'EIGEN', 'FET', 'AAVE', 'SUI', 'ONDO',
  'ASTER', 'LDO', 'ENA', 'ARKM', 'UNI', 'SEI', 'PLUME', 'ADA', 'ZRO',
  'WLD', 'LINK', 'POL', 'CRV', 'PEPE', 'B2', 'TAO', 'PENDLE', 'NEAR', 'INJ', 'STRK',
];
const cryptoCatalog = cryptoCatalogBases.map(base => ({
  ...crypto, symbol: `CRYPTO:${base}-USDT`,
  name: base === 'BTC' ? '比特币' : base === 'ETH' ? '以太坊' : base === 'SOL' ? 'Solana' : `${base}全名`,
  displaySymbol: `${base}/USDT`, latestPrice: null, source: null, updatedAt: null,
}));

function tradeHarness(props: Record<string, any> = {}) {
  const state: any[] = [], memos: any[] = [], effects: any[] = [];
  let cursor = 0, memoCursor = 0, effectCursor = 0, searchCursor = 0;
  const data = { canEdit: true, positions: [{ symbol, stockName: '比特币', currency: 'USDT', marketPrice: 110, lots: [{ id: 1, quantity: 0.12345678, unitCost: 100 }] }, { symbol: 'ETH', stockName: 'ETH美股', currency: 'USD', marketPrice: 50, lots: [{ id: 2, quantity: 3, unitCost: 45 }] }] };
  const searchArgs: any[] = [];
  let results: any[] = [crypto];
  let searchState = { isFetching: false, error: null as Error | null };
  const searchRefetch = vi.fn();
  let catalogResults = cryptoCatalog;
  let catalogState = { isFetching: false, error: null as Error | null };
  const catalogArgs: any[] = [], selectionQuoteArgs: any[] = [], suggestionsArgs: any[] = [];
  const catalogRefetch = vi.fn(), selectionQuoteRefetch = vi.fn(), selectionQuoteRequest = vi.fn();
  const selectionQuotes = new Map<string, { data: { results: any[] }; isFetching: boolean; error: Error | null }>();
  const emptySelectionQuote = { data: { results: [] }, isFetching: false, error: null };
  let enabledSelectionQuoteKey: string | null = null;
  const add = { mutate: vi.fn(), isPending: false }, update = { mutate: vi.fn(), isPending: false };
  const pendingEffects: (() => void)[] = [];
  const same = (a: any[], b: any[]) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const scope: Record<string, any> = {
    ...instruments, localInputTime, localInputDate, beijingTradeInputTime, parseTradeInputTime,
    money: execute(tradeSource, 'money', instruments), formatQuantity: execute(tradeSource, 'formatQuantity'), STOCK_TRADE_FEE_RATE: 0.001,
    toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
    useState: (initial: any) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], (v: any) => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; },
    useMemo: (fn: any, deps: any[]) => { const i = memoCursor++; if (!memos[i] || !same(memos[i].deps, deps)) memos[i] = { value: fn(), deps }; return memos[i].value; },
    useEffect: (fn: any, deps: any[]) => { const i = effectCursor++; if (!effects[i] || !same(effects[i], deps)) { effects[i] = deps; pendingEffects.push(fn); } },
    trpc: {
      useUtils: () => ({ ledger: { getStockTagPortfolio: { invalidate: vi.fn() }, getStockLotParticipationMatrix: { invalidate: vi.fn() }, getStockTagDailySnapshots: { invalidate: vi.fn() } } }),
      exchange: { getRate: { useQuery: (args: any) => ({ data: args.fromcoin === 'USD' ? { money: 7 } : { money: null } }) } },
      ledger: {
        getStockTagPortfolio: { useQuery: () => ({ data, isLoading: false }) },
        getStockLotParticipationMatrix: { useQuery: () => ({ data: { members: [], lots: [] }, isLoading: false }) },
        addStockTagEvent: { useMutation: () => add }, updateStockTagSale: { useMutation: () => update },
      },
      searchManualStocks: { useQuery: (args: any, options: any) => {
        // Keep hook calls in source order: searchArgs.at(-1) must remain suggestionsQuery.
        searchArgs.push(args);
        const slot = searchCursor++;
        if (slot === 0) {
          catalogArgs.push({ args, options });
          return { data: { results: catalogResults }, ...catalogState, isFetching: !!options.enabled && catalogState.isFetching, refetch: catalogRefetch };
        }
        if (slot === 1) {
          selectionQuoteArgs.push({ args, options });
          const key = options.enabled ? `${args.market}:${args.query}` : null;
          // Model an enabled query/key transition, not a request for every React render.
          if (key && key !== enabledSelectionQuoteKey) selectionQuoteRequest(args);
          enabledSelectionQuoteKey = key;
          const quote = selectionQuotes.get(args.query) ?? emptySelectionQuote;
          return { ...quote, isFetching: !!options.enabled && quote.isFetching, refetch: selectionQuoteRefetch };
        }
        if (slot !== 2) throw new Error('Unexpected extra searchManualStocks hook');
        suggestionsArgs.push({ args, options });
        return { data: { results }, ...searchState, isFetching: !!options.enabled && searchState.isFetching, refetch: searchRefetch };
      } },
    },
  };
  for (const key of ['Loader2', 'Minus', 'Plus', 'Button', 'Input', 'Label', 'Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle']) scope[key] = key;
  const parameters = { categoryId: 222, categoryName: '测试现货', open: true, type: 'buy', onOpenChange: vi.fn(), ...props };
  const component = execute(tradeSource, 'StockTagTradeDialog', scope);
  const renderOnce = () => { cursor = memoCursor = effectCursor = searchCursor = 0; return component(parameters); };
  const render = () => { let tree = renderOnce(); for (let i = 0; pendingEffects.length && i < 5; i++) { pendingEffects.splice(0).forEach(fn => fn()); tree = renderOnce(); } return tree; };
  const button = (label: string) => nodes(render()).find(node => ['button', 'Button'].includes(node.type) && text(node).trim() === label);
  const input = (placeholder: string) => nodes(render()).find(node => node.type === 'Input' && node.props.placeholder === placeholder);
  const suggestion = (stockSymbol: string) => nodes(render()).find(node => node.type === 'button' && node.key === stockSymbol);
  const cryptoSelect = () => nodes(render()).find(node => node.type === 'select' && node.props['aria-label'] === '下拉选择数字币');
  const chooseCatalog = (stockSymbol: string) => { cryptoSelect().props.onChange({ target: { value: stockSymbol } }); return render(); };
  const chooseCrypto = () => { button('数字币·USDT').props.onClick(); render(); input('如 BTC、ETH、比特币（仅USDT现货）').props.onChange({ target: { value: 'BTC' } }); suggestion(symbol).props.onClick(); render(); };
  return {
    scope, parameters, data, state, render, button, input, suggestion, cryptoSelect, chooseCatalog, chooseCrypto, add, update,
    searchArgs, searchRefetch, catalogArgs, catalogRefetch, selectionQuoteArgs, selectionQuoteRequest, selectionQuoteRefetch, suggestionsArgs,
    setSearchState: (next: typeof searchState) => { searchState = next; }, setResults: (next: any[]) => { results = next; },
    setCatalogResults: (next: typeof cryptoCatalog) => { catalogResults = next; }, setCatalogState: (next: typeof catalogState) => { catalogState = next; },
    setSelectionQuote: (query: string, next: any[], isFetching = false) => { selectionQuotes.set(query, { data: { results: next }, isFetching, error: null }); },
  };
}

function allocationHarness() {
  const lot: any = { id: 1, symbol, stockName: '比特币', status: 'active', currentQuantity: 0.12345678, initialQuantity: 0.12345678, unitCost: 100, marketPrice: 110, openedAt: '2026-11-15T08:05:00Z', participations: [{ userId: 901, remainingQuantity: 0.01234567, entryPrice: 100 }, { userId: 902, remainingQuantity: 0.02, entryPrice: 100 }], observations: [] };
  const scope: Record<string, any> = {
    ...instruments, stockParticipationMatrix: { canEdit: true, members: [{ userId: 901, name: '成员甲' }, { userId: 902, name: '成员乙' }], lots: [lot] }, stockParticipationError: null,
    stockAllocationFocus: { categoryId: 222, lotId: 1 }, usdCnyRate: 7, usdtCnyRate: null,
    expandedStockLots: new Set([1]), editingStockLots: new Set([1]), savingStockLots: new Set(), stockLotMemberEditOrders: { 1: [902, 901] },
    getStockLotSavedMemberOrder: execute(allocationSource, 'getStockLotSavedMemberOrder'), stockParticipationDrafts: {}, stockObservationDrafts: {},
    activeStockParticipationCategoryId: 222, categories: [{ id: 222, name: '测试' }], editState: {}, getSavedTagVisible: () => true, Fragment: React.Fragment,
    setMutation: { isPending: false }, isLocalHotPreview: true, toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
    setStockParticipationMutation: { mutateAsync: vi.fn() }, setStockObservationMutation: { mutateAsync: vi.fn() },
    setSavingStockLots: vi.fn(), discardStockLotDrafts: vi.fn(), finishStockLotEditing: vi.fn(), startStockLotEditing: vi.fn(), toggleStockLotExpanded: vi.fn(), saveStockTagVisibility: vi.fn(),
    refetchStockParticipationMatrix: vi.fn(), onStockAllocationSaved: vi.fn(),
    renderLedger37AiBadge: () => null, // 原数字币回归保持全局AI关闭，不改变报价、币数量或份额行为。
  };
  for (const key of ['Switch', 'Eye', 'EyeOff', 'Minus', 'Plus', 'X', 'ChevronDown', 'Save']) scope[key] = key;
  scope.setStockParticipationDraft = vi.fn((key, patch, fallback) => { scope.stockParticipationDrafts[key] = { ...(scope.stockParticipationDrafts[key] ?? fallback), ...patch }; });
  scope.setStockObservationDraft = vi.fn((key, patch, fallback) => { scope.stockObservationDrafts[key] = { ...(scope.stockObservationDrafts[key] ?? fallback), ...patch }; });
  const render = () => execute(allocationSource, 'renderStockParticipationEditor', scope)({ selectedUserId: 0, accentColor: '#777' });
  const row = (id = 901) => nodes(render()).find(node => node.key === String(id));
  const field = (label: string, id = 901) => nodes(row(id)).find(node => node.props?.['aria-label'] === label);
  return { scope, lot, render, row, field };
}

describe('37号CRYPTO现货前端（完全离线）', () => {
  it('三个市场沿原useQuery接口，ETH美股和ETH/USDT身份不碰撞', () => {
    const h = tradeHarness();
    expect(h.button('A 股 · 人民币')).toBeTruthy(); expect(h.button('美股 · 美元')).toBeTruthy(); expect(h.button('数字币·USDT')).toBeTruthy();
    h.button('美股 · 美元').props.onClick(); h.render(); expect(h.searchArgs.at(-1).market).toBe('US');
    h.button('数字币·USDT').props.onClick(); h.render(); expect(h.searchArgs.at(-1).market).toBe('CRYPTO');
    expect(instruments.portfolioCurrency('ETH')).toBe('USD'); expect(instruments.portfolioCurrency('CRYPTO:ETH-USDT')).toBe('USDT');
  });
  it('无需输入即有38默认数字币下拉，完整保留模拟目录顺序且不批量取价', () => {
    const h = tradeHarness(); h.render();
    expect(h.catalogArgs.at(-1).options.enabled).toBe(false);
    expect(h.selectionQuoteRequest).not.toHaveBeenCalled();
    h.button('数字币·USDT').props.onClick(); const tree = h.render();
    expect(h.input('如 BTC、ETH、比特币（仅USDT现货）').props.value).toBe('');
    const options = nodes(h.cryptoSelect()).filter(node => node.type === 'option' && node.props.value);
    expect(options).toHaveLength(38);
    expect(options.map(node => text(node))).toEqual(cryptoCatalogBases);
    expect(options.map(node => node.props.value)).toEqual(cryptoCatalogBases.map(base => `CRYPTO:${base}-USDT`));
    expect(options.map(node => node.key)).toEqual(options.map(node => node.props.value));
    expect(h.catalogArgs.at(-1)).toEqual({ args: { query: '*', market: 'CRYPTO' }, options: { enabled: true, staleTime: 600_000 } });
    expect(h.suggestionsArgs.at(-1).options.enabled).toBe(false);
    expect(h.searchArgs.at(-1)).toEqual(h.suggestionsArgs.at(-1).args);
    expect(h.selectionQuoteRequest).not.toHaveBeenCalled();
    expect(text(tree)).not.toMatch(/比特币|以太坊|Solana|全名|(?:BTC|ETH)\/USDT/);
    expect(h.add.mutate).not.toHaveBeenCalled(); expect(h.update.mutate).not.toHaveBeenCalled();
  });
  it('下拉BTC通过真实selectStock启用一次精确query，等待报价并补价后仍以原始symbol提交', () => {
    const h = tradeHarness(); h.setResults([ethCrypto]); h.setSelectionQuote('BTC', [], true);
    h.button('数字币·USDT').props.onClick(); h.render();
    expect(h.selectionQuoteRequest).not.toHaveBeenCalled();
    h.chooseCatalog(symbol);
    expect(h.selectionQuoteArgs.at(-1)).toEqual({ args: { query: 'BTC', market: 'CRYPTO' }, options: { enabled: true, staleTime: 0 } });
    expect(h.selectionQuoteRequest).toHaveBeenCalledOnce();
    expect(h.selectionQuoteRequest).toHaveBeenCalledWith({ query: 'BTC', market: 'CRYPTO' });
    expect(h.searchArgs.at(-1)).toEqual({ query: 'A', market: 'CRYPTO' });
    expect(h.suggestionsArgs.at(-1).options.enabled).toBe(false);
    expect(h.input('如 BTC、ETH、比特币（仅USDT现货）').props.value).toBe('BTC');
    expect(h.input('0.00').props.value).toBe('');
    expect(text(h.render())).toContain('正在读取 BTC 实时报价');
    h.render(); h.render(); expect(h.selectionQuoteRequest).toHaveBeenCalledOnce();
    // Ignore other symbols and malformed market/currency results even in the exact query.
    h.setSelectionQuote('BTC', [ethCrypto, { ...crypto, market: 'US', latestPrice: 999 }, { ...crypto, currency: 'USD', latestPrice: 888 }, crypto]);
    const tree = h.render();
    expect(h.input('0.00').props.value).toBe('100');
    expect(h.input('如 BTC、ETH、比特币（仅USDT现货）').props.value).toBe('BTC');
    expect(text(tree)).toContain('已核验：BTC · USDT现货计价');
    expect(text(tree)).not.toMatch(/比特币|BTC\/USDT|正在读取|参考价暂不可用/);
    expect(h.selectionQuoteArgs.at(-1).options.enabled).toBe(false);
    expect(h.selectionQuoteRequest).toHaveBeenCalledOnce();
    h.input('币数量（最多8位小数）').props.onChange({ target: { value: '0.12345678' } });
    h.button('确认买入').props.onClick();
    expect(h.add.mutate).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'CRYPTO:BTC-USDT', executionPrice: 100 }));
  });
  it('下拉晚到的BTC报价更新参考信息但不覆盖用户手输成交价格', () => {
    const h = tradeHarness(); h.setSelectionQuote('BTC', [], true);
    h.button('数字币·USDT').props.onClick(); h.chooseCatalog(symbol);
    h.input('0.00').props.onChange({ target: { value: '123.45' } }); h.render();
    h.setSelectionQuote('BTC', [{ ...crypto, latestPrice: 101 }]); const tree = h.render();
    expect(h.input('0.00').props.value).toBe('123.45');
    expect(h.input('如 BTC、ETH、比特币（仅USDT现货）').props.value).toBe('BTC');
    expect(text(tree)).not.toContain('参考价暂不可用');
    expect(h.selectionQuoteRequest).toHaveBeenCalledOnce();
    h.input('币数量（最多8位小数）').props.onChange({ target: { value: '1' } }); h.button('确认买入').props.onClick();
    expect(h.add.mutate).toHaveBeenCalledWith(expect.objectContaining({ symbol, executionPrice: 123.45 }));
  });
  it('等待BTC报价时切换美股，晚报价不能恢复币种或覆盖美股手输价', () => {
    const h = tradeHarness(); h.setSelectionQuote('BTC', [], true);
    h.button('数字币·USDT').props.onClick(); h.chooseCatalog(symbol);
    h.button('美股 · 美元').props.onClick(); h.render();
    expect(h.input('0.00').props.value).toBe('');
    expect(h.input('如 CRCL、Circle、AAPL 或 BRK.B').props.value).toBe('');
    expect(h.selectionQuoteArgs.at(-1).options.enabled).toBe(false);
    h.setResults([{ symbol: 'ETH', name: 'ETH美股', market: 'US', currency: 'USD', latestPrice: 50 }]);
    h.input('如 CRCL、Circle、AAPL 或 BRK.B').props.onChange({ target: { value: 'ETH' } });
    h.suggestion('ETH').props.onClick(); h.input('0.00').props.onChange({ target: { value: '55.5' } }); h.render();
    h.setSelectionQuote('BTC', [crypto]); const tree = h.render();
    expect(h.input('0.00').props.value).toBe('55.5');
    expect(h.input('如 CRCL、Circle、AAPL 或 BRK.B').props.value).toBe('ETH美股 ETH');
    expect(text(tree)).not.toContain('已核验：BTC'); expect(h.cryptoSelect()).toBeUndefined();
    h.input('股数').props.onChange({ target: { value: '1' } }); h.button('确认买入').props.onClick();
    expect(h.add.mutate).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'ETH', executionPrice: 55.5 }));
    expect(h.selectionQuoteRequest).toHaveBeenCalledOnce();
  });
  it('等待BTC时切换下拉ETH，BTC晚报价不覆盖ETH；只有匹配ETH报价可补价', () => {
    const h = tradeHarness(); h.setSelectionQuote('BTC', [], true); h.setSelectionQuote('ETH', [], true);
    h.button('数字币·USDT').props.onClick(); h.chooseCatalog(symbol); h.chooseCatalog(ethCrypto.symbol);
    expect(h.input('如 BTC、ETH、比特币（仅USDT现货）').props.value).toBe('ETH');
    expect(h.input('0.00').props.value).toBe('');
    h.setSelectionQuote('BTC', [crypto]); h.render();
    expect(h.input('0.00').props.value).toBe('');
    expect(text(h.render())).toContain('正在读取 ETH 实时报价');
    // An old BTC result reaching the current hook must not be accepted for ETH either.
    h.setSelectionQuote('ETH', [crypto]); h.render();
    expect(h.input('如 BTC、ETH、比特币（仅USDT现货）').props.value).toBe('ETH');
    expect(h.input('0.00').props.value).toBe('');
    h.setSelectionQuote('ETH', [crypto, ethCrypto]); const tree = h.render();
    expect(h.input('0.00').props.value).toBe('200');
    expect(text(tree)).toContain('已核验：ETH · USDT现货计价'); expect(text(tree)).not.toContain('已核验：BTC');
    expect(h.selectionQuoteRequest.mock.calls.map(([args]) => args)).toEqual([{ query: 'BTC', market: 'CRYPTO' }, { query: 'ETH', market: 'CRYPTO' }]);
    h.input('币数量（最多8位小数）').props.onChange({ target: { value: '1' } }); h.button('确认买入').props.onClick();
    expect(h.add.mutate).toHaveBeenCalledWith(expect.objectContaining({ symbol: ethCrypto.symbol, executionPrice: 200 }));
  });
  it.each([crypto, ethCrypto])('搜索和下拉的$symbol仅显示代码，选中不带全名或币对', stock => {
    const h = tradeHarness(); h.setResults([crypto, ethCrypto]); h.button('数字币·USDT').props.onClick();
    h.input('如 BTC、ETH、比特币（仅USDT现货）').props.onChange({ target: { value: instruments.cryptoPortfolioBase(stock.symbol) } });
    const tree = h.render();
    for (const item of [crypto, ethCrypto]) {
      const suggestion = h.suggestion(item.symbol);
      const title = nodes(suggestion).find(node => node.type === 'span' && node.props.className === 'text-sm font-medium');
      expect(text(title)).toBe(instruments.cryptoPortfolioBase(item.symbol));
      expect(text(suggestion)).not.toMatch(/比特币|以太坊|(?:BTC|ETH)\/USDT|CRYPTO:/);
      const option = nodes(h.cryptoSelect()).find(node => node.type === 'option' && node.key === item.symbol);
      expect(text(option)).toBe(instruments.cryptoPortfolioBase(item.symbol));
    }
    expect(text(tree)).not.toMatch(/比特币|以太坊|(?:BTC|ETH)\/USDT/);
    h.suggestion(stock.symbol).props.onClick();
    expect(h.input('如 BTC、ETH、比特币（仅USDT现货）').props.value).toBe(instruments.cryptoPortfolioBase(stock.symbol));
    expect(h.input('0.00').props.value).toBe(String(stock.latestPrice));
    expect(text(h.render())).not.toMatch(/比特币|以太坊|(?:BTC|ETH)\/USDT/);
    expect(h.selectionQuoteRequest).not.toHaveBeenCalled();
    h.chooseCatalog(stock.symbol);
    expect(h.input('如 BTC、ETH、比特币（仅USDT现货）').props.value).toBe(instruments.cryptoPortfolioBase(stock.symbol));
    expect(h.input('0.00').props.value).toBe('');
    expect(text(h.render())).not.toMatch(/比特币|以太坊|(?:BTC|ETH)\/USDT/);
  });
  it.each([
    { market: 'A', button: 'A 股 · 人民币', symbol: '600519.SH', name: '贵州茅台', currency: 'CNY', placeholder: '如 600519、贵州茅台或 gzm' },
    { market: 'US', button: '美股 · 美元', symbol: 'AAPL', name: 'Apple Inc.', currency: 'USD', placeholder: '如 CRCL、Circle、AAPL 或 BRK.B' },
  ])('$market原股票搜索建议、选中输入及核验UI保留全名', stock => {
    const h = tradeHarness(); h.setResults([{ ...stock, latestPrice: 50 }]); h.button(stock.button).props.onClick();
    h.input(stock.placeholder).props.onChange({ target: { value: stock.symbol } });
    expect(text(h.suggestion(stock.symbol))).toContain(stock.name);
    expect(text(h.suggestion(stock.symbol))).toContain(stock.symbol);
    h.suggestion(stock.symbol).props.onClick(); const tree = h.render();
    expect(h.input(stock.placeholder).props.value).toBe(`${stock.name} ${stock.symbol}`);
    expect(text(tree)).toContain(`已核验：${stock.name} · ${stock.symbol}`);
    expect(h.input('0.00').props.value).toBe('50'); expect(h.cryptoSelect()).toBeUndefined();
    expect(h.selectionQuoteRequest).not.toHaveBeenCalled();
  });
  it('下拉加载或失败不污染搜索；重载下拉只调用目录refetch不写账', () => {
    const h = tradeHarness(); h.setCatalogResults([]); h.setCatalogState({ isFetching: true, error: null });
    h.button('数字币·USDT').props.onClick();
    expect(h.cryptoSelect().props.disabled).toBe(true); expect(text(h.cryptoSelect())).toBe('加载中');
    h.setCatalogState({ isFetching: false, error: new Error('catalog failed') });
    expect(text(h.render())).toContain('币种下拉暂未加载，可输入代码搜索');
    h.button('重载下拉').props.onClick(); expect(h.catalogRefetch).toHaveBeenCalledOnce();
    expect(h.searchRefetch).not.toHaveBeenCalled(); expect(h.selectionQuoteRefetch).not.toHaveBeenCalled();
    h.setCatalogResults(cryptoCatalog); h.setCatalogState({ isFetching: false, error: null });
    expect(h.cryptoSelect().props.disabled).toBe(false);
    expect(nodes(h.cryptoSelect()).filter(node => node.type === 'option' && node.props.value)).toHaveLength(38);
    expect(h.add.mutate).not.toHaveBeenCalled(); expect(h.update.mutate).not.toHaveBeenCalled();
  });
  it('输入字母走顶层检索，加载和失败有反馈，重试只重新查询而不写入', () => {
    const h = tradeHarness(); h.button('数字币·USDT').props.onClick(); h.setResults([]);
    h.input('如 BTC、ETH、比特币（仅USDT现货）').props.onChange({ target: { value: 'e' } });
    h.setSearchState({ isFetching: true, error: null }); expect(text(h.render())).toContain('正在搜索币种');
    expect(h.searchArgs.at(-1)).toEqual({ query: 'e', market: 'CRYPTO' });
    h.setSearchState({ isFetching: false, error: new Error('read failed') }); expect(text(h.render())).toContain('搜索暂未完成');
    h.button('重试').props.onClick(); expect(h.searchRefetch).toHaveBeenCalledOnce();
    expect(h.add.mutate).not.toHaveBeenCalled(); expect(h.update.mutate).not.toHaveBeenCalled();
  });
  it('空结果有提示，币种列表恢复后可选中参考价，选中后不残留空结果或搜索提示', () => {
    const h = tradeHarness(); h.button('数字币·USDT').props.onClick(); h.setResults([]);
    h.input('如 BTC、ETH、比特币（仅USDT现货）').props.onChange({ target: { value: 'BTC' } });
    expect(text(h.render())).toContain('暂未找到匹配币种');
    h.setResults([crypto]); const item = h.suggestion(symbol);
    item.props.onClick(); expect(h.input('0.00').props.value).toBe('100'); expect(text(h.render())).not.toContain('暂未找到匹配币种');
  });
  it('数字币建议过滤裸ticker/非USDT，仅允许服务器核验现货；null不继承上一价格', () => {
    const h = tradeHarness(); h.setResults([crypto, { ...crypto, symbol: 'ETH', name: '裸ETH' }, { ...crypto, symbol: 'CRYPTO:SOL-USDT', currency: 'USD', name: '错误币种' }]);
    h.chooseCrypto(); expect(h.input('如 BTC、ETH、比特币（仅USDT现货）').props.value).toBe('BTC'); expect(text(h.render())).not.toContain('BTC/USDT');
    h.input('如 BTC、ETH、比特币（仅USDT现货）').props.onChange({ target: { value: 'SOL' } }); h.setResults([{ ...crypto, symbol: 'CRYPTO:SOL-USDT', name: 'Solana', latestPrice: null }]);
    const tree = h.render(); expect(text(tree)).not.toContain('裸ETH'); expect(text(tree)).not.toContain('错误币种');
    expect(h.suggestion('ETH')).toBeUndefined(); expect(h.suggestion('CRYPTO:SOL-USDT')).toBeTruthy();
    h.suggestion('CRYPTO:SOL-USDT').props.onClick();
    expect(h.input('0.00').props.value).toBe(''); expect(text(h.render())).toContain('参考价暂不可用');
  });
  it.each(['0.00000001', '0.12345678'])('买入币数量%s和15:05后的北京时间原样提交', quantity => {
    const h = tradeHarness(); h.chooseCrypto();
    h.input('币数量（最多8位小数）').props.onChange({ target: { value: quantity } });
    nodes(h.render()).find(node => node.type === 'Input' && node.props.type === 'datetime-local').props.onChange({ target: { value: '2026-11-15T16:06' } });
    h.button('确认买入').props.onClick(); expect(h.add.mutate).toHaveBeenCalledWith(expect.objectContaining({ symbol, quantity: Number(quantity), actualTradedAt: '2026-11-15T08:06:00.000Z' }));
    expect(text(h.render())).not.toContain('US$'); expect(text(h.render())).toContain('USDT'); expect(text(h.render())).toContain('汇率暂不可用');
  });
  it.each(['0.000000001', '0.123456789', '0', '-1'])('拒绝现货无效数量%s，未调用mutation', quantity => {
    const h = tradeHarness(); h.chooseCrypto(); h.input('币数量（最多8位小数）').props.onChange({ target: { value: quantity } }); h.button('确认买入').props.onClick(); expect(h.add.mutate).not.toHaveBeenCalled(); expect(h.scope.toast.error).toHaveBeenCalled();
  });
  it('币卖出datetime-local保留16:06，切到ETH美股仍date中午；编辑币单同步冻结成交时间', () => {
    const h = tradeHarness({ type: 'sell' });
    const select = () => nodes(h.render()).find(node => node.type === 'select');
    select().props.onChange({ target: { value: '1' } });
    const field = nodes(h.render()).find(node => node.type === 'Input' && node.props.type === 'datetime-local'); expect(field).toBeTruthy(); field.props.onChange({ target: { value: '2026-11-15T16:06' } });
    h.button('确认卖出').props.onClick(); expect(h.add.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ lotId: 1, actualTradedAt: '2026-11-15T08:06:00.000Z' }));
    select().props.onChange({ target: { value: '2' } }); const date = nodes(h.render()).find(node => node.type === 'Input' && node.props.type === 'date'); expect(date.props.value).toMatch(/^\d{4}-\d{2}-\d{2}$/); date.props.onChange({ target: { value: '2026-11-15' } });
    h.button('确认卖出').props.onClick(); expect(h.add.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ lotId: 2, actualTradedAt: '2026-11-15T04:00:00.000Z' }));
    const edit = tradeHarness({ type: 'sell', editingSale: { eventId: 8, lotId: 1, symbol, stockName: '比特币', currency: 'USDT', soldQuantity: 1, unitCost: 100, sellPrice: 120, soldAt: '2026-11-15T08:09:00Z' } });
    expect(nodes(edit.render()).find(node => node.props.type === 'datetime-local').props.value).toBe('2026-11-15T16:09');
  });
  it.each(['readonly', 'member'])('%s不能实际登记买卖，即使直接调用handler', mode => {
    const h = tradeHarness({ readOnlyPreview: mode === 'readonly' }); if (mode === 'member') h.data.canEdit = false; h.chooseCrypto();
    h.input('币数量（最多8位小数）').props.onChange({ target: { value: '1' } });
    const confirm = h.button(mode === 'readonly' ? '热预览不可写入' : '确认买入'); expect(confirm.props.disabled).toBe(true); confirm.props.onClick(); expect(h.add.mutate).not.toHaveBeenCalled();
  });
  it('真实共用编辑器显示币/8位/USDT，缺FX金额禁反推且百分号独立后缀、顺序冻结保留', () => {
    const h = allocationHarness(); const initial = h.render(); expect(text(initial)).toContain('BTC/USDT'); expect(text(initial)).toContain('0.12345678 币'); expect(text(initial)).toContain('0.01234567 币'); expect(text(initial)).toContain('USDT'); expect(text(initial)).toContain('参考人民币金额与保证金显示—');
    const amount = h.field('分配金额（人民币）'); expect(amount.props.value).toBe(''); expect(amount.props.placeholder).toBe('—'); expect(amount.props.disabled).toBe(true); amount.props.onChange({ target: { value: '100' } }); expect(h.scope.setStockParticipationDraft).not.toHaveBeenCalled();
    const input = h.field('分配比例'); expect(input.props.value).not.toContain('%'); input.props.onChange({ target: { value: '30%' } }); expect(h.field('分配比例').props.value).toBe('30');
    expect(nodes(h.render()).filter(node => ['901', '902'].includes(node.key)).map(node => node.key)).toEqual(['902', '901']);
    expect(nodes(h.row()).some(node => node.type === 'span' && text(node) === '%' && node.props.className.includes('pointer-events-none'))).toBe(true);
    expect(h.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
  });
  it('共用编辑器独立观察数量使用币与8位，缺FX不降为人民币原价', () => {
    const h = allocationHarness(); h.field('成员甲的观察配额').props.onCheckedChange(true); const count = h.field('成员甲的独立观察币数量'); count.props.onChange({ target: { value: '0.00000001' } }); expect(h.field('成员甲的独立观察币数量').props.value).toBe('0.00000001'); expect(h.field('成员甲的观察金额（人民币）').props.disabled).toBe(true);
    expect(h.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled(); expect(h.scope.setStockObservationMutation.mutateAsync).not.toHaveBeenCalled();
  });
  it('组合换汇真实函数对USDT缺失返回null，USDT前缀不变CNY，混合汇总优先服务端', () => {
    const fn = execute(pageSource, 'toCny', { ...instruments, usdCnyRate: 7, usdtCnyRate: null }); expect(fn(100, 'USDT')).toBeNull(); expect(fn(100, 'USD')).toBe(700);
    const normalize = execute(pageSource, 'normalizeCurrency'); expect(normalize('USDT')).toBe('USDT');
    expect(execute(pageSource, 'money', instruments)(100, 2, 'USDT')).toBe('USDT 100.00');
    expect(pageSource).toContain("hasCrypto ? (summary?.marketValue ?? null)"); expect(pageSource).toContain("hasCrypto ? (summary?.costValue ?? null)");
  });
  it('真实USDT观察适配冻结值/对手盘方向，缺FX只显示—不当0', () => {
    const holding = { symbol, lotId: 1, stockName: '比特币', status: 'paused', entryPrice: 100, marketPrice: 80, currentQuantity: 0.00000001, closedQuantity: 0, floatingPnl: 0.0000002, closedPnl: 0, totalPnl: 0.0000002, frozenSalePrice: 80 };
    const scope: Record<string, any> = { ...instruments, instrumentCurrency: instruments.portfolioCurrency, useCryptoObservation: () => ({ data: { holdings: [holding] } }), money: execute(pageSource, 'money', instruments), signedMoney: execute(pageSource, 'signedMoney', { money: execute(pageSource, 'money', instruments) }), formatQuantity: execute(pageSource, 'formatQuantity'), formatDateTime: execute(pageSource, 'formatDateTime'), StockObservationPortfolio: 'StockObservationPortfolio' };
    const tree = execute(pageSource, 'CryptoAwareObservationPortfolio', scope)({ categoryId: 222, usdCnyRate: 7, usdtCnyRate: null, publicPositions: [{ symbol, marketPrice: 200 }] }); expect(text(tree)).toContain('已暂停 · 冻结估值'); expect(text(tree)).toContain('USDT 80.00'); expect(text(tree)).toContain('0.00000001 币'); expect(text(tree)).toContain('汇率暂不可用'); expect(text(tree)).not.toContain('200.00');
  });
  it('仅组合查询有限轮询，后台停止，不添加日历轮询/浏览器交易所请求', () => {
    expect(pageSource).toContain("? 5_000 : false, refetchIntervalInBackground: false");
    const start = pageSource.indexOf('const dailySnapshotsQuery'); const end = pageSource.indexOf('const publicPortfolioQuery', start); expect(pageSource.slice(start, end)).not.toContain('refetchInterval');
    const browserExchangeRequest = /https?:\/\/[^\s]*gate|\bfetch\s*\(/;
    expect(tradeSource).not.toMatch(browserExchangeRequest); expect(pageSource).not.toMatch(browserExchangeRequest);
    expect('fetch("/quote")').toMatch(browserExchangeRequest); expect('window.fetch ("/quote")').toMatch(browserExchangeRequest);
    expect('cryptoCatalogQuery.refetch(); suggestionsQuery.refetch();').not.toMatch(browserExchangeRequest);
    expect(pageSource).toContain('default: module.LedgerAAInitialBalanceContent'); expect(pageSource).toContain('readOnlyPreview={isLocalHotPreview || !canEdit}');
  });
  it('USDT只用服务端独立桥接summary汇率，禁止旧exchange别名；有效FX按独立值显示', () => {
    expect(tradeSource).not.toContain("fromcoin: 'USDT'"); expect(allocationSource).not.toContain("fromcoin: 'USDT'");
    expect(tradeSource).toContain('(portfolioQuery.data as any)?.summary?.usdtCnyRate');
    expect(allocationSource).toContain('(stockCashFxQuery.data as any)?.summary?.usdtCnyRate');
    const h = allocationHarness(); h.scope.usdtCnyRate = 6.91; const tree = h.render();
    expect(text(tree)).toContain('USDT'); expect(text(tree)).not.toContain('汇率暂不可用'); expect(h.field('分配金额（人民币）').props.disabled).toBe(false);
  });
  it('真实数字币平仓helper保留1e-8币、USDT和冻结利润，不重算对手盘方向', () => {
    const fn = execute(pageSource, 'buildCryptoAwareMemberRealizedLots', { ...instruments, buildStockMemberRealizedLots: () => [] });
    const rows = fn([{ symbol, stockName: '比特币', startDate: '2026-11-15', closedQuantity: 1e-8, closedValue: 0.000002, entryPrice: 100, realizedPnl: -0.000001, closedAt: '2026-11-15T08:06:00Z' }], '2026-11-15');
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ soldQuantity: 1e-8, currency: 'USDT', realizedPnl: -0.000001, soldAt: '2026-11-15T08:06:00Z' });
  });
  it('真实更正表单数字币保持北京时间和8位，热预览/成员handler不能写入', () => {
    const scope: Record<string, any> = { ...instruments, canEdit: true, isLocalHotPreview: false, correctingEvent: { id: 8 }, correctionReason: '离线更正', eventType: 'buy', selectedStock: crypto, correctionStockMarket: 'CRYPTO', quantity: '0.12345678', executionPrice: '100', actualTradedAt: '2026-11-15T16:06', note: '', parseTradeInputTime, toast: { error: vi.fn(), info: vi.fn() }, correctEventMutation: { mutate: vi.fn() }, categoryId: 222 };
    execute(pageSource, 'submitEvent', scope)(); expect(scope.correctEventMutation.mutate).toHaveBeenCalledWith(expect.objectContaining({ symbol, quantity: 0.12345678, actualTradedAt: '2026-11-15T08:06:00.000Z' }));
    scope.correctEventMutation.mutate.mockClear(); scope.isLocalHotPreview = true; execute(pageSource, 'submitEvent', scope)(); expect(scope.correctEventMutation.mutate).not.toHaveBeenCalled();
    scope.isLocalHotPreview = false; scope.canEdit = false; execute(pageSource, 'submitEvent', scope)(); expect(scope.correctEventMutation.mutate).not.toHaveBeenCalled();
  });
  it('真实组合整页离线渲染，未缺FX仍显示USDT原值和币、无初始化时序崩溃', () => {
    const data = { canEdit: false, history: [], summary: { costValue: 10, marketValue: 11, floatingPnl: 1, usdtCnyRate: 6.91 }, positions: [{ symbol, stockName: '比特币', currency: 'USDT', marketPrice: 110, lots: [{ id: 1, quantity: 0.12345678, unitCost: 100, openedAt: '2026-11-15T08:00:00Z' }] }] };
    const query = { data, isLoading: false, error: null };
    const scope: Record<string, any> = { ...instruments, instrumentCurrency: instruments.portfolioCurrency, useState: (initial: any) => [initial, vi.fn()], useAuth: () => ({ user: { id: 901, name: '成员甲' } }), localInputTime, beijingTradeInputTime, parseTradeInputTime,
      trpc: { useUtils: () => ({}), stock: { getUsdCnyRate: { useQuery: () => ({ data: { success: true, rate: 7 } }) } }, ledger: { getStockTagPortfolio: { useQuery: () => query }, getStockTagPublicPortfolio: { useQuery: () => query }, getMyStockTagParticipantPortfolio: { useQuery: () => query }, getStockTagDailySnapshots: { useQuery: () => ({ data: [] }) }, getStockLotParticipationMatrix: { useQuery: () => ({ data: { lots: [], members: [] } }) }, correctStockTagEvent: { useMutation: () => ({}) }, updateStockTagLotNote: { useMutation: () => ({}) } }, searchManualStocks: { useQuery: () => ({ data: { results: [] } }) } },
      eventLabels: { buy: '买入', sell: '卖出' }, eventTone: {}, summarizeStockCustomerPnl: () => ({}), hasStockCustomerActivity: () => false,
    };
    for (const name of ['normalizeCurrency', 'money', 'formatQuantity', 'formatDateTime', 'daysSinceBeijingDate', 'formatMonthDay', 'formatQuoteUpdate', 'formatCompactQuoteUpdate']) scope[name] = execute(pageSource, name, scope);
    scope.signedMoney = execute(pageSource, 'signedMoney', scope);
    for (const name of ['ArrowLeft', 'BadgeCheck', 'ChevronDown', 'ChevronUp', 'History', 'Loader2', 'Plus', 'X', 'Button', 'Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'Avatar', 'AvatarImage', 'AvatarFallback', 'Input', 'Label', 'Sheet', 'SheetContent', 'SheetHeader', 'SheetTitle', 'StockTagTradeDialog', 'StockNameProfitSummary', 'StockQuoteUpdateIndicator', 'StockParticipantProfitChart', 'CryptoAwareObservationAccountSummary', 'CryptoAwareObservationPortfolio']) scope[name] = name;
    const tree = execute(pageSource, 'LegacyStockTagPortfolio', scope)({ ledgerId: 37, categoryId: 222, categoryName: '测试现货', onBack: vi.fn() });
    expect(text(tree)).toContain('BTC/USDT'); expect(text(tree)).toContain('0.12345678 币'); expect(text(tree)).not.toContain('0.12345678 股');
  });
});
