import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_RATE, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';
const mocks = vi.hoisted(() => ({ usdt: vi.fn(), usd: vi.fn() }));
vi.mock('./usdt-cny-rate', () => ({ getLiveUsdtCnyQuote: mocks.usdt }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: mocks.usd }));
vi.mock('./crypto-portfolio-fx', () => { throw new Error('No crypto FX dependency for unified accounting parity'); });
vi.mock('./db', () => { throw new Error('No DB dependency for unified readonly FX'); });
import { readUnifiedCnyExchangeRate, resolveRecordedUsdtCnyRate, readCurrentStockUsdCnyFreezeEvidence } from './unified-cny-exchange';
const POLICY_SOURCE = `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny`;
const quote = (pair = 'USDT/CNY', rate = 6.6714) => ({
  rate, pair, source: pair === 'USDT/CNY' ? POLICY_SOURCE : 'sina_usdcny',
  asOf: '2026-11-21T06:40:00Z', observedAt: '2026-11-21T06:41:00Z', stale: false, carried: false,
  ...(pair === 'USDT/CNY' ? { conversionPolicy: USDT_USD_PARITY_POLICY, usdtUsdRate: USDT_USD_PARITY_RATE,
    usdtUsdAsOf: '2026-11-21T06:40:00Z', usdtUsdSource: USDT_USD_PARITY_SOURCE,
    usdCnyRate: rate, usdCnyAsOf: '2026-11-21T06:40:00Z', usdCnySource: 'sina_usdcny' } : {}),
});
beforeEach(() => { mocks.usdt.mockReset().mockResolvedValue(quote()); mocks.usd.mockReset().mockResolvedValue(quote('USD/CNY')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('1USDT=1USD授权记账政策下的统一CNY接口', () => {
  it('USDT只读取共享政策报价，响应披露政策与真实美元证据', async () => {
    expect(await readUnifiedCnyExchangeRate('USDT')).toMatchObject({ success: true, money: '6.6714', rate: 6.6714,
      pair: 'USDT/CNY', source: POLICY_SOURCE, stale: false, conversionPolicy: 'usdt-usd-parity-v1',
      usdtUsdRate: 1, usdtUsdSource: 'accounting_usdt_usd_parity_v1', usdtUsdAsOf: '2026-11-21T06:40:00Z',
      usdCnyRate: 6.6714, usdCnyAsOf: '2026-11-21T06:40:00Z', usdCnySource: 'sina_usdcny' });
    expect(mocks.usdt).toHaveBeenCalledTimes(1); expect(mocks.usd).not.toHaveBeenCalled();
  });
  it('USD仍有明确真实美元身份，不伪装为USDT政策报价', async () => {
    expect(await readUnifiedCnyExchangeRate('USD', 2)).toMatchObject({ success: true, money: '13.3428', rate: 6.6714,
      pair: 'USD/CNY', source: 'sina_usdcny', conversionPolicy: null, usdtUsdRate: null, usdtUsdSource: null });
    expect(mocks.usdt).not.toHaveBeenCalled(); expect(mocks.usd).toHaveBeenCalledTimes(1);
  });
  it('真实共享USDT实现与USD接口实同rate，10U随真实美元汇率变化，无额外币圈FX请求', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-21T07:00:00Z'));
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Extra crypto FX forbidden'));
    const actualUsdt = await vi.importActual<typeof import('./usdt-cny-rate')>('./usdt-cny-rate');
    actualUsdt.__usdtCnyTest.reset(); mocks.usdt.mockImplementation(actualUsdt.getLiveUsdtCnyQuote);
    try {
      const dollar = await readUnifiedCnyExchangeRate('USD', 10);
      const tether = await readUnifiedCnyExchangeRate('USDT', 10);
      expect(tether.rate).toBe(dollar.rate); expect(tether.money).toBe('66.714'); expect(tether.money).toBe(dollar.money);
      expect(tether.conversionPolicy).toBe(USDT_USD_PARITY_POLICY); expect(network).not.toHaveBeenCalled();
      actualUsdt.__usdtCnyTest.reset(); mocks.usd.mockResolvedValue(quote('USD/CNY', 7.12345));
      expect(await readUnifiedCnyExchangeRate('USDT', 10)).toMatchObject({ money: '71.2345', rate: 7.12345, usdCnyRate: 7.12345 });
      mocks.usd.mockResolvedValue(null); actualUsdt.__usdtCnyTest.reset();
      expect(await readUnifiedCnyExchangeRate('USDT', 10)).toMatchObject({ success: false, rate: null, money: '0', conversionPolicy: null });
      expect(network).not.toHaveBeenCalled();
    } finally { actualUsdt.__usdtCnyTest.reset(); }
  });
  it.each([null, { ...quote(), stale: true }, { ...quote(), pair: 'USD/CNY' }, { ...quote(), rate: 0 },
    { ...quote(), rate: -1 }, { ...quote(), rate: NaN }, { ...quote(), rate: Infinity }])('不可用报价不能标成功或套固定人民币价 %#', async (value) => {
    mocks.usdt.mockResolvedValue(value);
    expect(await readUnifiedCnyExchangeRate('USDT')).toMatchObject({ success: false, money: '0', rate: null, stale: true });
  });
  it.each([null, { ...quote('USD/CNY'), stale: true }, quote(), quote('USD/CNY', NaN), quote('USD/CNY', 0)])('美元缺证据或非法时USD同样unknown %#', async (value) => {
    mocks.usd.mockResolvedValue(value);
    expect(await readUnifiedCnyExchangeRate('USD')).toMatchObject({ success: false, money: '0', rate: null, stale: true });
  });
  it('基础汇率独立于money，先10后1不污染缓存', async () => {
    expect((await readUnifiedCnyExchangeRate('USDT', 10)).money).toBe('66.714');
    expect((await readUnifiedCnyExchangeRate('USDT', 1)).money).toBe('6.6714');
    expect((await readUnifiedCnyExchangeRate('USDT', 0)).money).toBe('0');
  });
  it.each([-1, NaN, Infinity, -Infinity, Number.MAX_VALUE])('非法金额或乘积溢出%s不能产生成功报价', async (amount) => {
    expect((await readUnifiedCnyExchangeRate('USDT', amount)).success).toBe(false);
  });
});

describe('新增付款登记不猜历史汇率，也不套固定兜底', () => {
  it('历史手工已填有效汇率逐字保留，即使与当前平价政策不同也不改、不调实时源', async () => {
    expect(await resolveRecordedUsdtCnyRate(7.12, '2026-10-02', '2026-11-21')).toBe(7.12);
    expect(mocks.usdt).not.toHaveBeenCalled(); expect(mocks.usd).not.toHaveBeenCalled();
  });
  it('今日手工已填真实付款汇率也优先保留，不强制覆盖为政策报价', async () => {
    expect(await resolveRecordedUsdtCnyRate(6.987654, '2026-11-21', '2026-11-21')).toBe(6.987654);
    expect(mocks.usdt).not.toHaveBeenCalled();
  });
  it('历史未填明确拒绝，不能拿今天补过去', async () => {
    await expect(resolveRecordedUsdtCnyRate(undefined, '2026-10-02', '2026-11-21')).rejects.toThrow('历史付款');
    expect(mocks.usdt).not.toHaveBeenCalled();
  });
  it('今日未填使用同一共享政策USDT基准价', async () => {
    expect(await resolveRecordedUsdtCnyRate(undefined, '2026-11-21', '2026-11-21')).toBe(6.6714);
  });
  it.each([0, -1, NaN, Infinity])('明确填入非法值%s不能默用固定价', async (rate) => {
    await expect(resolveRecordedUsdtCnyRate(rate, '2026-11-21', '2026-11-21')).rejects.toThrow('有效');
  });
  it.each([null, { ...quote(), stale: true }, quote('USD/CNY'), quote('USDT/CNY', 0), quote('USDT/CNY', NaN)])('今日汇率不可用拒绝新增付款 %#', async (value) => {
    mocks.usdt.mockResolvedValue(value);
    await expect(resolveRecordedUsdtCnyRate(undefined, '2026-11-21', '2026-11-21')).rejects.toThrow('暂不可用');
  });
});

describe('只向新建当天股票快照附加真实美元证据，不回写旧快照', () => {
  it('股票新快照使用真正USD来源，尽管授权政策下数值与USDT相同', async () => {
    expect(await readCurrentStockUsdCnyFreezeEvidence('stock', false)).toEqual({ rate: 6.6714,
      pair: 'USD/CNY', source: 'sina_usdcny', asOf: '2026-11-21T06:40:00Z' });
    expect(mocks.usdt).not.toHaveBeenCalled();
  });
  it('历史和非股票不请求当前USD，不据此补历史；既有冻结值不被更改', async () => {
    const frozen = Object.freeze({ rate: 7.42, asOf: '2026-10-02T07:05:00Z', source: 'old_frozen_reference' });
    expect(await readCurrentStockUsdCnyFreezeEvidence('stock', true)).toBeNull();
    expect(await readCurrentStockUsdCnyFreezeEvidence('crypto', false)).toBeNull();
    expect(frozen).toEqual({ rate: 7.42, asOf: '2026-10-02T07:05:00Z', source: 'old_frozen_reference' });
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
  it('37数字币与52接口读取同一政策共享函数，并过滤过期/错误币种', async () => {
    const getLiveUsdtCnyQuote = vi.fn().mockResolvedValue(quote());
    const fn = executeFunction('ledger-stock-portfolio.ts', 'readLiveUsdtCnyRate', { getLiveUsdtCnyQuote, isCryptoPortfolioSymbol: (s: string) => s.startsWith('CRYPTO:') });
    expect(await fn(['CRYPTO:UNI-USDT'])).toBe(6.6714);
    getLiveUsdtCnyQuote.mockResolvedValue({ ...quote(), stale: true }); expect(await fn(['CRYPTO:UNI-USDT'])).toBeNull();
    getLiveUsdtCnyQuote.mockResolvedValue(quote('USD/CNY')); expect(await fn(['CRYPTO:UNI-USDT'])).toBeNull();
    getLiveUsdtCnyQuote.mockClear(); expect(await fn(['GOOGL'])).toBeNull(); expect(getLiveUsdtCnyQuote).not.toHaveBeenCalled();
  });
  it('37美元实时组合不读取USDT扫描器缓存', async () => {
    const getLiveStockUsdCnyQuote = vi.fn().mockResolvedValue(quote('USD/CNY'));
    const fn = executeFunction('ledger-stock-portfolio.ts', 'readLiveUsdCnyRate', { getLiveStockUsdCnyQuote });
    expect(await fn()).toBe(6.6714);
    getLiveStockUsdCnyQuote.mockResolvedValue({ ...quote('USD/CNY'), stale: true }); expect(await fn()).toBe(0);
    getLiveStockUsdCnyQuote.mockRejectedValue(new Error('offline')); expect(await fn()).toBe(0);
  });
  it('52实际getCryptoPrices输出同一政策报价及provenance，币价不受缺FX影响', async () => {
    const getLiveUsdtCnyQuote = vi.fn().mockResolvedValue(quote());
    const fn = cryptoPriceQuery({ modules: {
      './price-scanner': { getAllLatestPrices: () => ({ UNI: { price: 4.298, updatedAt: 'now' } }), getMarketPriceHealth: () => ({}) },
      './usdt-cny-rate': { getLiveUsdtCnyQuote },
    }});
    expect(await fn()).toMatchObject({ prices: { UNI: 4.298 }, usdtCnyRate: 6.6714,
      usdtCnyFx: { pair: 'USDT/CNY', source: POLICY_SOURCE, conversionPolicy: USDT_USD_PARITY_POLICY, usdtUsdRate: 1 } });
    getLiveUsdtCnyQuote.mockResolvedValue(null);
    expect(await fn()).toMatchObject({ prices: { UNI: 4.298 }, usdtCnyRate: null, usdtCnyFx: null });
  });
  it('同步旧getter只是有效共享缓存，过期必须未知而非固定6.7', () => {
    const peekUsdtCnyQuote = vi.fn().mockReturnValue(quote());
    const fn = executeFunction('price-scanner.ts', 'getUsdtCnyRate', { peekUsdtCnyQuote });
    expect(fn()).toBe(6.6714); peekUsdtCnyQuote.mockReturnValue(null); expect(fn()).toBe(0);
  });
  it('扫描器刷新成功/失败采用同一共享服务，而非伪造人民币现货币对', async () => {
    const getLiveUsdtCnyQuote = vi.fn().mockResolvedValue(quote());
    const fn = executeFunction('price-scanner.ts', 'refreshUsdtCnyRate', { getLiveUsdtCnyQuote });
    expect(await fn()).toBe(6.6714); getLiveUsdtCnyQuote.mockResolvedValue(null); expect(await fn()).toBe(0);
  });
  it('历史crypto日结仍调用精确15:05历史函数，不用新live服务回写旧冻结证据', () => {
    const text = fs.readFileSync(new URL('./crypto-portfolio-settlement.ts', import.meta.url), 'utf8');
    expect(text).toContain('fetchCryptoUsdtCnyAtClose'); expect(text).not.toContain('getLiveUsdtCnyQuote');
  });
});
