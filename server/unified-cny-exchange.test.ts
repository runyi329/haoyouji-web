import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const mocks = vi.hoisted(() => ({ usdt: vi.fn(), usd: vi.fn() }));
vi.mock('./usdt-cny-rate', () => ({ getLiveUsdtCnyQuote: mocks.usdt }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: mocks.usd }));
import { readUnifiedCnyExchangeRate, resolveRecordedUsdtCnyRate, readCurrentStockUsdCnyFreezeEvidence } from './unified-cny-exchange';
const quote = (pair = 'USDT/CNY', rate = 6.692) => ({ rate, pair, source: pair === 'USDT/CNY' ? 'coingecko_tether_cny' : 'sina_usdcny', asOf: '2026-11-21T06:40:00Z', observedAt: '2026-11-21T06:41:00Z', stale: false, carried: false });
beforeEach(() => { mocks.usdt.mockReset().mockResolvedValue(quote()); mocks.usd.mockReset().mockResolvedValue(quote('USD/CNY', 6.6714)); });

describe('USD和USDT明确区分的统一CNY接口', () => {
  it('USDT只读取共享USDT报价，结果附带实际来源和时间', async () => {
    expect(await readUnifiedCnyExchangeRate('USDT')).toMatchObject({ success: true, money: '6.692', rate: 6.692, pair: 'USDT/CNY', source: 'coingecko_tether_cny', stale: false });
    expect(mocks.usdt).toHaveBeenCalledTimes(1); expect(mocks.usd).not.toHaveBeenCalled();
  });
  it('USD只读取真实美元报价，不把USDT=USD', async () => {
    expect(await readUnifiedCnyExchangeRate('USD', 2)).toMatchObject({ success: true, money: '13.3428', rate: 6.6714, pair: 'USD/CNY', source: 'sina_usdcny' });
    expect(mocks.usdt).not.toHaveBeenCalled(); expect(mocks.usd).toHaveBeenCalledTimes(1);
  });
  it.each([null, { ...quote(), stale: true }, { ...quote(), pair: 'USD/CNY' }, { ...quote(), rate: 0 }, { ...quote(), rate: NaN }, { ...quote(), rate: Infinity }])('不可用报价不能标成功或套固定汇率 %#', async (value) => {
    mocks.usdt.mockResolvedValue(value);
    expect(await readUnifiedCnyExchangeRate('USDT')).toMatchObject({ success: false, money: '0', rate: null, stale: true });
  });
  it('基础汇率独立于money，先10后1不污染缓存', async () => {
    expect((await readUnifiedCnyExchangeRate('USDT', 10)).money).toBe('66.92');
    expect((await readUnifiedCnyExchangeRate('USDT', 1)).money).toBe('6.692');
    expect((await readUnifiedCnyExchangeRate('USDT', 0)).money).toBe('0');
  });
  it.each([-1, NaN, Infinity])('非法金额%s不能产生成功报价', async (amount) => {
    expect((await readUnifiedCnyExchangeRate('USDT', amount)).success).toBe(false);
  });
});

describe('新增付款登记不猜历史汇率，也不套固定兜底', () => {
  it('历史手工已填有效汇率逐字保留，不调实时源', async () => {
    expect(await resolveRecordedUsdtCnyRate(7.12, '2026-10-02', '2026-11-21')).toBe(7.12);
    expect(mocks.usdt).not.toHaveBeenCalled();
  });
  it('历史未填明确拒绝，不能拿今天补过去', async () => {
    await expect(resolveRecordedUsdtCnyRate(undefined, '2026-10-02', '2026-11-21')).rejects.toThrow('历史付款');
    expect(mocks.usdt).not.toHaveBeenCalled();
  });
  it('今日未填使用同一共享USDT基准价', async () => {
    expect(await resolveRecordedUsdtCnyRate(undefined, '2026-11-21', '2026-11-21')).toBe(6.692);
  });
  it.each([0, -1, NaN, Infinity])('明确填入非法值%s不能默用固定价', async (rate) => {
    await expect(resolveRecordedUsdtCnyRate(rate, '2026-11-21', '2026-11-21')).rejects.toThrow('有效');
  });
  it.each([null, { ...quote(), stale: true }, quote('USD/CNY')])('今日汇率不可用拒绝新增付款 %#', async (value) => {
    mocks.usdt.mockResolvedValue(value);
    await expect(resolveRecordedUsdtCnyRate(undefined, '2026-11-21', '2026-11-21')).rejects.toThrow('暂不可用');
  });
});

describe('只向新建当天股票快照附加真实美元证据', () => {
  it('股票新快照使用真正USD而不是USDT汇率', async () => {
    expect(await readCurrentStockUsdCnyFreezeEvidence('stock', false)).toMatchObject({ rate: 6.6714, pair: 'USD/CNY', source: 'sina_usdcny' });
    expect(mocks.usdt).not.toHaveBeenCalled();
  });
  it('历史和非股票不请求当前USD，不据此补历史', async () => {
    expect(await readCurrentStockUsdCnyFreezeEvidence('stock', true)).toBeNull();
    expect(await readCurrentStockUsdCnyFreezeEvidence('crypto', false)).toBeNull();
    expect(mocks.usd).not.toHaveBeenCalled();
  });
  it.each([null, quote(), { ...quote('USD/CNY'), stale: true }])('无明确美元证据时 %# 不固定1或拿USDT替换', async (value) => {
    mocks.usd.mockResolvedValue(value);
    expect(await readCurrentStockUsdCnyFreezeEvidence('stock', false)).toBeNull();
  });
});

function source(file: string) { return ts.createSourceFile(file, fs.readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true); }
function executeFunction(file: string, name: string, scope: Record<string, unknown>) {
  const tree = source(file);
  const node = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
  if (!node) throw new Error(`真实函数缺失 ${file}:${name}`);
  const js = ts.transpileModule(node.getText(tree).replace(/^export\s+/, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`${js}; ${name}`, scope);
}
function cryptoPriceQuery(scope: Record<string, unknown>) {
  const tree = source('routers.ts'); let handler: ts.Node | undefined;
  function walk(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'getCryptoPrices' && ts.isCallExpression(node.initializer)) handler = node.initializer.arguments[0];
    if (!handler) ts.forEachChild(node, walk);
  }
  walk(tree); if (!handler) throw new Error('getCryptoPrices真实handler缺失');
  const js = ts.transpileModule(handler.getText(tree).replace(/await import\('([^']+)'\)/g, 'await modules["$1"]'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`(${js.trim().replace(/;$/, '')})`, scope);
}

describe('实际37/52代码接线执行（无DB与完整路由导入）', () => {
  it('37数字币与52接口读取同一共享函数，并过滤过期/错误币种', async () => {
    const getLiveUsdtCnyQuote = vi.fn().mockResolvedValue(quote());
    const fn = executeFunction('ledger-stock-portfolio.ts', 'readLiveUsdtCnyRate', { getLiveUsdtCnyQuote, isCryptoPortfolioSymbol: (s: string) => s.startsWith('CRYPTO:') });
    expect(await fn(['CRYPTO:UNI-USDT'])).toBe(6.692);
    getLiveUsdtCnyQuote.mockResolvedValue({ ...quote(), stale: true }); expect(await fn(['CRYPTO:UNI-USDT'])).toBeNull();
    getLiveUsdtCnyQuote.mockResolvedValue(quote('USD/CNY')); expect(await fn(['CRYPTO:UNI-USDT'])).toBeNull();
    getLiveUsdtCnyQuote.mockClear(); expect(await fn(['GOOGL'])).toBeNull(); expect(getLiveUsdtCnyQuote).not.toHaveBeenCalled();
  });
  it('37美元实时组合不读取USDT扫描器缓存', async () => {
    const getLiveStockUsdCnyQuote = vi.fn().mockResolvedValue(quote('USD/CNY', 6.6714));
    const fn = executeFunction('ledger-stock-portfolio.ts', 'readLiveUsdCnyRate', { getLiveStockUsdCnyQuote });
    expect(await fn()).toBe(6.6714);
    getLiveStockUsdCnyQuote.mockResolvedValue({ ...quote('USD/CNY'), stale: true }); expect(await fn()).toBe(0);
    getLiveStockUsdCnyQuote.mockRejectedValue(new Error('offline')); expect(await fn()).toBe(0);
  });
  it('52实际getCryptoPrices输出同一报价及provenance，币价不受缺FX影响', async () => {
    const getLiveUsdtCnyQuote = vi.fn().mockResolvedValue(quote());
    const fn = cryptoPriceQuery({ modules: {
      './price-scanner': { getAllLatestPrices: () => ({ UNI: { price: 4.298, updatedAt: 'now' } }), getMarketPriceHealth: () => ({}) },
      './usdt-cny-rate': { getLiveUsdtCnyQuote },
    }});
    expect(await fn()).toMatchObject({ prices: { UNI: 4.298 }, usdtCnyRate: 6.692, usdtCnyFx: { pair: 'USDT/CNY', source: 'coingecko_tether_cny' } });
    getLiveUsdtCnyQuote.mockResolvedValue(null);
    expect(await fn()).toMatchObject({ prices: { UNI: 4.298 }, usdtCnyRate: null, usdtCnyFx: null });
  });
  it('同步旧getter只是有效共享缓存，过期必须未知而非固定6.7', () => {
    const peekUsdtCnyQuote = vi.fn().mockReturnValue(quote());
    const fn = executeFunction('price-scanner.ts', 'getUsdtCnyRate', { peekUsdtCnyQuote });
    expect(fn()).toBe(6.692); peekUsdtCnyQuote.mockReturnValue(null); expect(fn()).toBe(0);
  });
  it('扫描器刷新成功/失败采用同一共享服务，而非伪造人民币现货币对', async () => {
    const getLiveUsdtCnyQuote = vi.fn().mockResolvedValue(quote());
    const fn = executeFunction('price-scanner.ts', 'refreshUsdtCnyRate', { getLiveUsdtCnyQuote });
    expect(await fn()).toBe(6.692); getLiveUsdtCnyQuote.mockResolvedValue(null); expect(await fn()).toBe(0);
  });
  it('历史crypto日结仍调用原有精确15:05历史函数，不用新live服务覆盖', () => {
    const text = fs.readFileSync(new URL('./crypto-portfolio-settlement.ts', import.meta.url), 'utf8');
    expect(text).toContain('fetchCryptoUsdtCnyAtClose'); expect(text).not.toContain('getLiveUsdtCnyQuote');
  });
});
