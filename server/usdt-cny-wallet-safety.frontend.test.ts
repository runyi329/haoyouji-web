import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildWalletDigitalAssets, formatDigitalAssetAmount } from '../client/src/lib/walletDigitalAssets';
import { calculateMibanWalletValue } from '../shared/miban-wallet-value';
import { isCryptoAssetCode } from '../shared/crypto-asset-catalog';
const root = new URL('../', import.meta.url);
function functionsFrom(file: string, scope: Record<string, unknown>, names: string[]) {
  const text = fs.readFileSync(new URL(file, root), 'utf8');
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const clean = tree.statements.filter(n => !ts.isImportDeclaration(n) && !ts.isExportDeclaration(n)).map(n => n.getFullText(tree)).join('\n').replace(/\bexport\s+/g, '');
  const js = ts.transpileModule(clean, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return vm.runInNewContext(`${js}; ({ ${names.join(',')} });`, scope);
}
const fx = { rate: 6.7, pair: 'USDT/CNY', stale: false };
let fetcher: ReturnType<typeof vi.fn>;
let now: number;
let api: Record<string, (...args: any[]) => any>;
beforeEach(() => {
  now = Date.parse('2026-11-21T07:00:00Z');
  fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ result: { data: { json: { prices: { UNI: 4.3 }, usdtCnyRate: 6.7, usdtCnyFx: fx } } } }) }));
  const FakeDate = class extends Date { static now() { return now; } };
  api = functionsFrom('client/src/lib/useLivePrice.ts', { fetch: fetcher, Date: FakeDate, AbortSignal }, ['fetchCryptoPrices', 'fetchUsdCnyRate']);
});

describe('共用前端行情缓存不延寿失效FX', () => {
  it('真实6.7是合法外部数值，不按数字猜无价', async () => {
    expect(await api.fetchCryptoPrices(['UNI'])).toMatchObject({ prices: { UNI: 4.3 }, usdtCnyRate: 6.7 });
  });
  it('刷新返回null清除FX，不偷用前次6.7，UNI原币价仍存在', async () => {
    await api.fetchCryptoPrices(['UNI']); now += 3000;
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: { prices: { UNI: 4.4 }, usdtCnyRate: null } } } }) });
    expect(await api.fetchCryptoPrices(['UNI'])).toMatchObject({ prices: { UNI: 4.4 }, usdtCnyRate: null });
  });
  it.each(['http', 'offline', 'stale', 'nonfinite'])('请求%s不以旧6.7或固定6.8伪成功', async (reason) => {
    await api.fetchCryptoPrices(['UNI']); now += 3000;
    if (reason === 'http') fetcher.mockResolvedValue({ ok: false });
    else if (reason === 'offline') fetcher.mockRejectedValue(new Error('offline'));
    else fetcher.mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: { prices: { UNI: 4.3 }, usdtCnyRate: reason === 'stale' ? 6.7 : Infinity, usdtCnyFx: { stale: reason === 'stale' } } } } }) });
    expect((await api.fetchCryptoPrices(['UNI'])).usdtCnyRate).toBeNull();
  });
  it('美元明确走USD服务端输入且正确解json envelope，失败不浏览器直连其他源', async () => {
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ result: { data: { json: { success: true, money: '6.6714', stale: false } } } }) });
    expect(await api.fetchUsdCnyRate()).toBe(6.6714);
    const path = new URL(fetcher.mock.calls[0][0], 'https://local.test');
    expect(JSON.parse(path.searchParams.get('input')!)).toEqual({ json: { fromcoin: 'USD', tocoin: 'CNY', money: 1 } });
    now += 60_001; fetcher.mockRejectedValue(new Error('offline'));
    expect(await api.fetchUsdCnyRate()).toBe(0); expect(fetcher.mock.calls).toHaveLength(2);
  });
});

function actualDemandHook(useSpot: ReturnType<typeof vi.fn>) {
  const FakeDate = class extends Date { static now() { return now; } };
  return functionsFrom('client/src/hooks/useDemandCryptoQuotes.ts', {
    trpc: { ledger: { getCryptoSpotQuotes: { useQuery: useSpot } } },
    isCryptoAssetCode, Date: FakeDate,
    useMemo: (fn: () => unknown) => fn(), useEffect: () => {},
    useState: (value: any) => [typeof value === 'function' ? value() : value, () => {}],
  }, ['useDemandCryptoQuotes', 'normalizeDemandCryptoSymbols', 'getFreshDemandCryptoPrices']);
}

function snapshotHarness(rate: unknown, account: 'CRYPTO' | 'CNY', stale = false, options: {
  assets?: any[]; quotes?: Record<string, any>; compatibilityPrices?: Record<string, number>; snapshot?: any;
} = {}) {
  const snapshot = 'snapshot' in options ? options.snapshot : { usdtBalance: 10, cnyBalance: 100, usdtCnyRate: 7.25, multiAssetBalances: options.assets ?? [], member: { name: '回归测试成员' } };
  const usePrices = vi.fn(() => ({ data: { prices: options.compatibilityPrices ?? {}, usdtCnyRate: rate, usdtCnyFx: { stale } } }));
  const spot = { data: options.quotes === undefined ? undefined : { quotes: options.quotes }, isLoading: options.quotes === undefined, error: null, refetch: vi.fn() };
  const useSpot = vi.fn(() => spot);
  const demand = actualDemandHook(useSpot);
  let stateIndex = 0;
  const Icon = () => React.createElement('svg');
  const list = functionsFrom('client/src/components/WalletDigitalAssetList.tsx', {
    React, formatDigitalAssetAmount, getCryptoAssetIconSrc: () => null,
  }, ['WalletDigitalAssetList']);
  const api = functionsFrom('client/src/components/ReadonlyWalletSnapshot.tsx', {
    React,
    useEffect: () => {}, useRef: (value: unknown) => ({ current: value }),
    useState: (value: any) => [stateIndex++ === 0 ? account : typeof value === 'function' ? value() : value, () => {}],
    trpc: { getCryptoPrices: { useQuery: usePrices } },
    useDemandCryptoQuotes: demand.useDemandCryptoQuotes, isCryptoAssetCode,
    WalletCards: Icon, X: Icon, getCryptoAssetIconSrc: () => null,
    selectWalletAccountByLatestFlow: () => account, isWalletFlowCurrency: () => true,
    getInternalTransferPresentation: () => null, buildWalletDigitalAssets, formatDigitalAssetAmount,
    WalletDigitalAssetList: list.WalletDigitalAssetList,
  }, ['ReadonlyWalletSnapshot']);
  const onClose = vi.fn();
  return { snapshot, spot, useSpot, usePrices, onClose, render: () => {
    stateIndex = 0;
    return renderToStaticMarkup(React.createElement(api.ReadonlyWalletSnapshot, { snapshot, onClose }));
  } };
}

function renderSnapshot(rate: unknown, account: 'CRYPTO' | 'CNY', stale = false) {
  return snapshotHarness(rate, account, stale).render();
}

describe('52共用只读钱包实际TSX（真实render，不导入业务后端）', () => {
  it.each([null, 0, NaN, Infinity])('FX%s缺价不使用快照7.25，10USDT原币仍可见', rate => {
    const html = renderSnapshot(rate, 'CRYPTO');
    expect(html).toContain('人民币汇率暂不可用'); expect(html).toContain('10.00'); expect(html).toContain('USDT');
    expect(html).not.toContain('72.50'); expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('CNY主余额始终可见，缺FX不除0造Infinity', () => {
    const html = renderSnapshot(null, 'CNY');
    expect(html).toContain('100.00'); expect(html).toContain('人民币汇率暂不可用'); expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('统一真实6.7准确显示67.00人民币，stale时必须转未知', () => {
    expect(renderSnapshot(6.7, 'CRYPTO')).toContain('67.00');
    expect(renderSnapshot(6.7, 'CRYPTO', true)).toContain('人民币汇率暂不可用');
  });
  it('FX失效仍显示原币和冻结数量，不让资产行出现人民币零估值', () => {
    const html = snapshotHarness(6.7, 'CRYPTO', true, {
      assets: [{ assetCode: 'ETH', totalBalance: 2, availableBalance: 0, frozenBalance: 2 }],
      quotes: { ETH: freshQuote(2000) },
    }).render();
    expect(html).toContain('2 ETH'); expect(html).toContain('担保 2'); expect(html).toContain('4,000.00 USDT');
    expect(html).toContain('人民币汇率暂不可用'); expect(html).not.toMatch(/≈ ¥0|≈ 0元|NaN|Infinity/);
  });
});

function freshQuote(price: number) {
  return { price, currency: 'USDT', source: 'same-provider spot', updatedAt: new Date(now).toISOString(), stale: false };
}

describe('只读快照真实按需hook：仅真实持仓、行情失效不复活、无写接口', () => {
  const frozenEth = { assetCode: 'ETH', totalBalance: 2, availableBalance: 0, frozenBalance: 2, priceUsdt: 98765 };

  it('冷启动保留币种与担保数量，但不显示旧snapshot或cache估值及零行情', () => {
    const harness = snapshotHarness(6.7, 'CRYPTO', false, { assets: [frozenEth], compatibilityPrices: { ETH: 99999 } });
    const html = harness.render();
    expect(html).toContain('ETH'); expect(html).toContain('担保 2');
    expect(html).toContain('估值待更新'); expect(html).toContain('行情加载中');
    expect(html).not.toMatch(/197,530|199,998|98765|99999|≈ 0 u|NaN|Infinity/);
    expect(harness.useSpot).toHaveBeenCalledWith({ symbols: ['ETH'] }, expect.objectContaining({ enabled: true, staleTime: 0 }));
    expect(harness.spot.refetch).not.toHaveBeenCalled(); expect(harness.onClose).not.toHaveBeenCalled();
  });

  it('新鲜同provider价计入全额冻结资产，旧行情不是来源', () => {
    const harness = snapshotHarness(6.7, 'CRYPTO', false, { assets: [frozenEth], quotes: { ETH: freshQuote(2000) }, compatibilityPrices: { ETH: 99999 } });
    const html = harness.render();
    expect(html).toContain('4,010.00'); expect(html).toContain('26,867.00');
    expect(html).toContain('担保 2'); expect(html).not.toContain('估值待更新');
    expect(html).not.toMatch(/197,530|199,998|98765|99999/);
  });

  it.each(['stale', 'expired', 'zero', 'nonfinite', 'no-metadata'])('%s响应不复活余额snapshot旧价或cache旧价', reason => {
    const quote: any = freshQuote(2000);
    if (reason === 'stale') quote.stale = true;
    if (reason === 'expired') quote.updatedAt = new Date(now - 121_000).toISOString();
    if (reason === 'zero') quote.price = 0;
    if (reason === 'nonfinite') quote.price = Infinity;
    if (reason === 'no-metadata') delete quote.updatedAt;
    const html = snapshotHarness(6.7, 'CRYPTO', false, { assets: [frozenEth], quotes: { ETH: quote }, compatibilityPrices: { ETH: 99999 } }).render();
    expect(html).toContain('估值待更新'); expect(html).toContain('行情加载中'); expect(html).toContain('担保 2');
    expect(html).not.toMatch(/4,010|197,530|199,998|≈ 0 u|NaN|Infinity/);
  });

  it('成功后断线浏览器时钟超时也立即转未知，不延寿旧价', () => {
    const harness = snapshotHarness(6.7, 'CRYPTO', false, { assets: [frozenEth], quotes: { ETH: freshQuote(2000) }, compatibilityPrices: { ETH: 99999 } });
    expect(harness.render()).toContain('4,010.00');
    now += 121_000;
    const html = harness.render();
    expect(html).toContain('估值待更新'); expect(html).not.toContain('4,010.00'); expect(html).not.toContain('199,998');
  });

  it('只租约非零total（冻结fallback也计入），证券、USDT、零目录与交易对不进入请求', () => {
    const assets = [
      frozenEth,
      { assetCode: 'SOL', availableBalance: 0, frozenBalance: 3 },
      { assetCode: 'BTC', totalBalance: 0, availableBalance: 99, frozenBalance: 99 },
      { assetCode: 'AAPL', totalBalance: 4, availableBalance: 3, frozenBalance: 1, priceUsdt: 99999 },
      { assetCode: 'USDT', totalBalance: 500, availableBalance: 500, frozenBalance: 0 },
      { assetCode: 'CRYPTO:BTC-USD', totalBalance: 0 },
      { assetCode: 'BTCUSDT', totalBalance: 0 },
    ];
    const original = JSON.stringify(assets);
    const harness = snapshotHarness(6.7, 'CNY', false, { assets, quotes: { ETH: freshQuote(2000), SOL: freshQuote(100) }, compatibilityPrices: { AAPL: 200, ETH: 99999, SOL: 99999 } });
    expect(harness.render()).toContain('100.00');
    expect(harness.useSpot).toHaveBeenCalledWith({ symbols: ['ETH', 'SOL'] }, expect.objectContaining({ enabled: true }));
    expect(JSON.stringify(assets)).toBe(original);
    const cryptoHtml = snapshotHarness(6.7, 'CRYPTO', false, { assets, quotes: { ETH: freshQuote(2000), SOL: freshQuote(100) }, compatibilityPrices: { AAPL: 200 } }).render();
    expect(cryptoHtml).toContain('5,110.00'); expect(cryptoHtml).toContain('AAPL'); expect(cryptoHtml).toContain('≈ 800 u');
    expect(cryptoHtml).not.toMatch(/99999|399,996/);
  });

  it.each([null, {}, { multiAssetBalances: [] }])('无真实余额%s不发起目录请求或手动refetch', snapshot => {
    const harness = snapshotHarness(6.7, 'CRYPTO', false, { snapshot });
    harness.render();
    expect(harness.useSpot).toHaveBeenCalledWith({ symbols: [] }, expect.objectContaining({ enabled: false, refetchInterval: false }));
    expect(harness.spot.refetch).not.toHaveBeenCalled();
    if (snapshot === null) expect(harness.usePrices).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false }));
  });

  it('实际只读消费者不包含任何mutation或资金写入路径', () => {
    const source = fs.readFileSync(new URL('client/src/components/ReadonlyWalletSnapshot.tsx', root), 'utf8');
    const tree = ts.createSourceFile('snapshot.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const properties: string[] = [];
    const visit = (node: ts.Node) => { if (ts.isPropertyAccessExpression(node)) properties.push(node.name.text); ts.forEachChild(node, visit); };
    visit(tree);
    expect(properties.filter(name => ['useMutation', 'mutate', 'mutateAsync'].includes(name))).toEqual([]);
  });
});

function runMibanWallet(rate: number | null) {
  const query = (data: unknown) => ({ useQuery: () => ({ data, refetch: async () => {}, isLoading: false }) });
  const useSpot = vi.fn(() => ({ data: undefined, refetch: vi.fn(), isLoading: true }));
  const calculate = vi.fn(calculateMibanWalletValue);
  const api = functionsFrom('client/src/pages/miban/useMibanWalletValue.ts', {
    useAuth: () => ({ isAuthenticated: true, loading: false, error: null }),
    useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
    useDemandCryptoQuotes: actualDemandHook(useSpot).useDemandCryptoQuotes, isCryptoAssetCode,
    calculateMibanWalletValue: calculate,
    trpc: {
      recharge: {
        getUsdtBalanceSummary: query({ available: 10, frozen: 0, total: 10 }),
        getCnyBalanceSummary: query({ available: 100, frozen: 0, total: 100 }),
        getMultiAssetBalances: query([]),
      },
      getCryptoPrices: query({ prices: {}, usdtCnyRate: rate }),
    },
  }, ['useMibanWalletValue']);
  return { result: api.useMibanWalletValue(), calculate };
}

describe('米伴真实估值hook兼容共享汇率null边界', () => {
  it('null明确未知，不向数字计算器传null或固定兜底', () => {
    const { result, calculate } = runMibanWallet(null);
    expect(result.value).toBeNull(); expect(result.error).toBe('人民币汇率暂不可用');
    expect(calculate).not.toHaveBeenCalled();
  });
  it('真实6.7保持10USDT加100人民币的准确合计', () => {
    const { result, calculate } = runMibanWallet(6.7);
    expect(result.value.totalCny).toBe(167); expect(result.error).toBeNull();
    expect(calculate).toHaveBeenCalledOnce();
  });
  it.each([0, NaN, Infinity])('非法汇率%s不生成零余额或Infinity估值', rate => {
    const { result } = runMibanWallet(rate);
    expect(result.value).toBeNull(); expect(result.error).toBeTruthy();
  });
});
