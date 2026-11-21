import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildWalletDigitalAssets } from '../client/src/lib/walletDigitalAssets';
import { calculateMibanWalletValue } from '../shared/miban-wallet-value';
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

function renderSnapshot(rate: unknown, account: 'CRYPTO' | 'CNY', stale = false) {
  const snapshot = { usdtBalance: 10, cnyBalance: 100, usdtCnyRate: 7.25, multiAssetBalances: [], member: { name: '回归测试成员' } };
  let stateIndex = 0;
  const Icon = () => React.createElement('svg');
  const api = functionsFrom('client/src/components/ReadonlyWalletSnapshot.tsx', {
    React,
    useEffect: () => {}, useRef: (value: unknown) => ({ current: value }),
    useState: (value: any) => [stateIndex++ === 0 ? account : typeof value === 'function' ? value() : value, () => {}],
    trpc: { getCryptoPrices: { useQuery: () => ({ data: { prices: {}, usdtCnyRate: rate, usdtCnyFx: { stale } } }) } },
    WalletCards: Icon, X: Icon, getCryptoAssetIconSrc: () => null,
    selectWalletAccountByLatestFlow: () => account, isWalletFlowCurrency: () => true,
    getInternalTransferPresentation: () => null, buildWalletDigitalAssets,
    WalletDigitalAssetList: ({ assets }: any) => React.createElement('div', {}, assets.map((a: any) => `${a.totalBalance} ${a.assetCode}`).join(',')),
  }, ['ReadonlyWalletSnapshot']);
  return renderToStaticMarkup(React.createElement(api.ReadonlyWalletSnapshot, { snapshot, onClose: () => {} }));
}

describe('52共用只读钱包实际TSX（真实render，不导入业务后端）', () => {
  it.each([null, 0, NaN, Infinity])('FX%s缺价不使用快照7.25，10USDT原币仍可见', rate => {
    const html = renderSnapshot(rate, 'CRYPTO');
    expect(html).toContain('人民币汇率暂不可用'); expect(html).toContain('10 USDT');
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
});

function runMibanWallet(rate: number | null) {
  const query = (data: unknown) => ({ useQuery: () => ({ data, refetch: async () => {}, isLoading: false }) });
  const calculate = vi.fn(calculateMibanWalletValue);
  const api = functionsFrom('client/src/pages/miban/useMibanWalletValue.ts', {
    useAuth: () => ({ isAuthenticated: true, loading: false, error: null }),
    useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
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
