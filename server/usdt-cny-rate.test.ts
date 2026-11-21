import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  USDT_USD_PARITY_POLICY,
  USDT_USD_PARITY_RATE,
  USDT_USD_PARITY_SOURCE,
} from '../shared/usdt-usd-parity-policy';

const mocks = vi.hoisted(() => ({ forexLive: vi.fn(), forexClose: vi.fn() }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: mocks.forexLive, fetchStockUsdCnyAtClose: mocks.forexClose }));
// 不允许重新引入旧crypto桥接（循环依赖）、DB、scanner或routers。
vi.mock('./crypto-portfolio-fx', () => { throw new Error('Crypto FX import forbidden for accounting parity'); });
vi.mock('./db', () => { throw new Error('DB import forbidden for readonly FX'); });
vi.mock('./db-crypto-portfolio', () => { throw new Error('Portfolio DB import forbidden for readonly FX'); });
vi.mock('./price-scanner', () => { throw new Error('Scanner import forbidden for readonly FX'); });
vi.mock('./routers', () => { throw new Error('Router import forbidden for readonly FX'); });

const NOW = Date.parse('2026-11-16T08:00:00Z');
const iso = (time = Date.now()) => new Date(time).toISOString();
const usdQuote = (patch: Record<string, unknown> = {}) => ({
  rate: 6.6714, pair: 'USD/CNY', source: 'sina_usdcny', asOf: iso(NOW - 1000), stale: false, ...patch,
});
const policyQuote = (patch: Record<string, unknown> = {}) => ({
  rate: 6.6714, pair: 'USDT/CNY', source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny`,
  asOf: iso(NOW - 1000), observedAt: iso(NOW), stale: false, carried: false,
  conversionPolicy: USDT_USD_PARITY_POLICY, usdtUsdRate: USDT_USD_PARITY_RATE,
  usdtUsdAsOf: iso(NOW - 1000), usdtUsdSource: USDT_USD_PARITY_SOURCE,
  usdCnyRate: 6.6714, usdCnyAsOf: iso(NOW - 1000), usdCnySource: 'sina_usdcny', ...patch,
});
const sinaAt = (date = '2026-11-16', time = '15:59:59', rate = 6.6714) =>
  `var hq_str_USDCNY="${time},${rate},6.67,6.67,47,6.67,6.67,6.67,6.67,美元人民币,${date}";`;
let api: typeof import('./usdt-cny-rate');
let actualUsd: typeof import('./stock-usd-cny-rate') | undefined;
let network: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  mocks.forexLive.mockReset().mockResolvedValue(usdQuote());
  mocks.forexClose.mockReset().mockRejectedValue(new Error('History must not be fetched'));
  network = vi.fn().mockRejectedValue(new Error('Extra FX request forbidden'));
  vi.stubGlobal('fetch', network);
  actualUsd = undefined;
  api = await import('./usdt-cny-rate'); api.__usdtCnyTest.reset();
});
afterEach(() => {
  api.__usdtCnyTest.reset(); actualUsd?.__stockUsdCnyTest.reset();
  vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks();
});
async function useRealUsd() {
  actualUsd = await vi.importActual<typeof import('./stock-usd-cny-rate')>('./stock-usd-cny-rate');
  actualUsd.__stockUsdCnyTest.reset();
  mocks.forexLive.mockImplementation(actualUsd.getLiveStockUsdCnyQuote);
  network.mockImplementation(async (input: string) => {
    if (input !== 'https://hq.sinajs.cn/list=USDCNY') throw new Error(`Extra FX request forbidden: ${input}`);
    return new Response(sinaAt());
  });
  return actualUsd;
}

describe('授权1 USDT=1 USD，仅复用真实美元人民币证据', () => {
  it('保持USDT/CNY身份，但价格实等USD/CNY，并显式披露政策及美元来源', async () => {
    expect(await api.getLiveUsdtCnyQuote()).toEqual(policyQuote());
    expect(mocks.forexLive).toHaveBeenCalledTimes(1); expect(mocks.forexLive).toHaveBeenCalledWith(false);
    expect(mocks.forexClose).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it('政策常量精确，1不是伪装为交易所价格，也没有固定人民币兜底', async () => {
    expect(USDT_USD_PARITY_POLICY).toBe('usdt-usd-parity-v1');
    expect(USDT_USD_PARITY_SOURCE).toBe('accounting_usdt_usd_parity_v1');
    expect(USDT_USD_PARITY_RATE).toBe(1);
    mocks.forexLive.mockResolvedValue(usdQuote({ rate: 7.123456 }));
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 7.123456, usdCnyRate: 7.123456, usdtUsdRate: 1 });
  });

  it('保留原美元asOf；observedAt只是读取完成时间，政策估值时点不是新USDT采样', async () => {
    mocks.forexLive.mockImplementation(async () => { vi.setSystemTime(NOW + 5000); return usdQuote(); });
    expect(await api.getLiveUsdtCnyQuote()).toEqual(policyQuote({ observedAt: iso(NOW + 5000) }));
  });

  it('上游有缓存也不伪造新美元asOf或沿用上游observedAt为本次组装时间', async () => {
    mocks.forexLive.mockResolvedValue(usdQuote({ observedAt: iso(NOW - 20_000), asOf: iso(NOW - 21_000) }));
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ asOf: iso(NOW - 21_000), usdCnyAsOf: iso(NOW - 21_000),
      usdtUsdAsOf: iso(NOW - 21_000), observedAt: iso(NOW) });
  });

  it.each([NaN, Infinity, -Infinity, 0, -1, null, undefined, true, '7', '', 'NaN'])('拒绝非正有限数字美元价格 %s', async (rate) => {
    mocks.forexLive.mockResolvedValue(usdQuote({ rate }));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull(); expect(api.peekUsdtCnyQuote()).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it.each(['USDT/CNY', 'USDT/USD', 'USD/CNH', 'usd/cny', '', null, undefined, ['USD/CNY']])('拒绝币种身份不符 %j', async (pair) => {
    mocks.forexLive.mockResolvedValue(usdQuote({ pair })); expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it.each([null, undefined, {}, [], { rate: 7 }, { tether: { cny: 7 } }])('缺明确美元证据仍unknown，不访问币圈备用 %j', async (value) => {
    mocks.forexLive.mockResolvedValue(value); expect(await api.getLiveUsdtCnyQuote()).toBeNull();
    expect(network).not.toHaveBeenCalled(); expect(mocks.forexClose).not.toHaveBeenCalled();
  });

  it.each([true, undefined, null, 0, 'false'])('上游stale=%j或无明确fresh契约拒绝使用', async (stale) => {
    mocks.forexLive.mockResolvedValue(usdQuote({ stale })); expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it.each(['', ' ', null, undefined, true, []])('美元来源缺失或非法 %j 不得成为成功值', async (source) => {
    mocks.forexLive.mockResolvedValue(usdQuote({ source })); expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it.each(['invalid', '', ' ', null, undefined, true, NOW, '1970-01-01T00:00:00Z',
    '1969-12-31T23:59:59Z', iso(NOW + 1), iso(NOW + 5000)])('拒绝非法/未来/错误单位美元证据时间 %j', async (asOf) => {
    mocks.forexLive.mockResolvedValue(usdQuote({ asOf })); expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it('读取过程中时钟回退，不能接纳已成为未来的美元证据', async () => {
    mocks.forexLive.mockImplementation(async () => { vi.setSystemTime(NOW - 2000); return usdQuote(); });
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it('周末直接沿用上游有效美元报价，不设30分钟上限、不另取历史anchor', async () => {
    vi.setSystemTime(new Date('2026-11-15T08:00:00Z'));
    const friday = '2026-11-13T07:05:00.000Z';
    mocks.forexLive.mockResolvedValue(usdQuote({ asOf: friday }));
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 6.6714, asOf: friday, usdCnyAsOf: friday,
      usdtUsdAsOf: friday, observedAt: '2026-11-15T08:00:00.000Z', stale: false, carried: false });
    expect(mocks.forexClose).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    expect(api.peekUsdtCnyQuote()).not.toBeNull();
    vi.setSystemTime(Date.now() + 30_000); expect(api.peekUsdtCnyQuote()).toBeNull();
  });

  it('真实美元模块下USDT和USD实同rate，10U反映真实美元；只有一个Sina请求且无额外币圈FX', async () => {
    const usd = await useRealUsd();
    const dollar = await usd.getLiveStockUsdCnyQuote();
    const tether = await api.getLiveUsdtCnyQuote();
    expect(tether!.rate).toBe(dollar!.rate); expect(tether!.rate * 10).toBeCloseTo(66.714, 6);
    expect(tether).toEqual(policyQuote());
    expect(network).toHaveBeenCalledTimes(1);
    expect(network).toHaveBeenCalledWith('https://hq.sinajs.cn/list=USDCNY', expect.any(Object));
    expect(mocks.forexClose).not.toHaveBeenCalled();
  });

  it('真实Sina周末旧有效证据原样保留，不把组装标成新美元采样', async () => {
    await useRealUsd(); vi.setSystemTime(new Date('2026-11-15T08:00:00Z'));
    network.mockResolvedValue(new Response(sinaAt('2026-11-13', '15:05:00')));
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 6.6714, stale: false,
      asOf: '2026-11-13T07:05:00.000Z', usdtUsdAsOf: '2026-11-13T07:05:00.000Z',
      observedAt: '2026-11-15T08:00:00.000Z' });
    expect(network).toHaveBeenCalledTimes(1); expect(mocks.forexClose).not.toHaveBeenCalled();
  });

  it.each(['network', 'http', 'invalid'])('真实美元源%s失败返回unknown，不尝试CoinGecko/OKX/Coinbase', async (reason) => {
    await useRealUsd();
    if (reason === 'network') network.mockRejectedValue(new Error('offline'));
    else if (reason === 'http') network.mockResolvedValue(new Response('', { status: 503 }));
    else network.mockResolvedValue(new Response('invalid'));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull(); expect(network).toHaveBeenCalledTimes(1);
    expect(String(network.mock.calls[0][0])).toBe('https://hq.sinajs.cn/list=USDCNY');
  });

  it('真实美元模块的stale last-good失败降级不能进入USDT成功缓存', async () => {
    await useRealUsd(); expect(await api.getLiveUsdtCnyQuote()).not.toBeNull();
    network.mockRejectedValue(new Error('offline'));
    expect(await api.getLiveUsdtCnyQuote(true)).toBeNull(); expect(api.peekUsdtCnyQuote()).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
  });
});

describe('30s TTL、失败清除/短负缓存、singleflight、copy及reset保护', () => {
  it('并发含forceFresh共享一次美元取数，每次返回独立对象，peek也不可污染缓存', async () => {
    const all = await Promise.all(Array.from({ length: 10 }, (_, i) => api.getLiveUsdtCnyQuote(i % 2 === 0)));
    expect(mocks.forexLive).toHaveBeenCalledTimes(1); expect(mocks.forexLive).toHaveBeenCalledWith(true);
    expect(all[0]).not.toBe(all[1]);
    all[0]!.rate = 999; all[0]!.source = 'invented'; all[0]!.stale = true;
    expect(all[1]!.rate).toBe(6.6714);
    const peek = api.peekUsdtCnyQuote()!; peek.rate = 1; peek.asOf = 'invalid'; peek.usdCnySource = 'invented';
    expect(await api.getLiveUsdtCnyQuote()).toEqual(policyQuote()); expect(mocks.forexLive).toHaveBeenCalledTimes(1);
  });

  it('TTL为30秒，peek不联网且第30000毫秒返回null，下次读取重新取美元', async () => {
    await api.getLiveUsdtCnyQuote();
    vi.setSystemTime(NOW + 29_999); expect(api.peekUsdtCnyQuote()).not.toBeNull();
    await api.getLiveUsdtCnyQuote(); expect(mocks.forexLive).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 30_000); expect(api.peekUsdtCnyQuote()).toBeNull(); expect(mocks.forexLive).toHaveBeenCalledTimes(1);
    expect(await api.getLiveUsdtCnyQuote()).toEqual(policyQuote({ observedAt: iso(NOW + 30_000) }));
    expect(mocks.forexLive).toHaveBeenCalledTimes(2); expect(network).not.toHaveBeenCalled();
  });

  it('系统时钟回退不允许未来组装缓存证据', async () => {
    await api.getLiveUsdtCnyQuote(); vi.setSystemTime(NOW - 1); expect(api.peekUsdtCnyQuote()).toBeNull();
  });

  it('forceFresh跳过成功缓存并传给美元服务，不重标旧美元时间', async () => {
    await api.getLiveUsdtCnyQuote(); vi.setSystemTime(NOW + 1000);
    mocks.forexLive.mockResolvedValue(usdQuote({ rate: 7.11 }));
    expect(await api.getLiveUsdtCnyQuote(true)).toMatchObject({ rate: 7.11, observedAt: iso(NOW + 1000), asOf: iso(NOW - 1000) });
    expect(mocks.forexLive.mock.calls).toEqual([[false], [true]]);
  });

  it.each(['throw', 'null', 'stale', 'invalid'])('美元刷新%s失败返回null并移除旧成功值，不无限last-good', async (reason) => {
    await api.getLiveUsdtCnyQuote(); vi.setSystemTime(NOW + 30_000);
    if (reason === 'throw') mocks.forexLive.mockRejectedValue(new Error('offline'));
    else mocks.forexLive.mockResolvedValue(reason === 'null' ? null : usdQuote(reason === 'stale' ? { stale: true } : { rate: NaN }));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull(); expect(api.peekUsdtCnyQuote()).toBeNull();
    vi.setSystemTime(NOW + 60_000); expect(await api.getLiveUsdtCnyQuote()).toBeNull(); expect(api.peekUsdtCnyQuote()).toBeNull();
  });

  it('强制刷新失败即时清除尚未过期的成功值，不返回last-good', async () => {
    await api.getLiveUsdtCnyQuote(); mocks.forexLive.mockResolvedValue(null);
    expect(await api.getLiveUsdtCnyQuote(true)).toBeNull(); expect(api.peekUsdtCnyQuote()).toBeNull();
    expect(await api.getLiveUsdtCnyQuote()).toBeNull(); expect(mocks.forexLive).toHaveBeenCalledTimes(2);
  });

  it('失败缓存仅5秒；peek不联网不破坏负缓存，forceFresh能绕过', async () => {
    mocks.forexLive.mockResolvedValue(null); expect(await api.getLiveUsdtCnyQuote()).toBeNull();
    for (let i = 0; i < 5; i++) { expect(api.peekUsdtCnyQuote()).toBeNull(); expect(await api.getLiveUsdtCnyQuote()).toBeNull(); }
    expect(mocks.forexLive).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 4999); await api.getLiveUsdtCnyQuote(); expect(mocks.forexLive).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 5000); await api.getLiveUsdtCnyQuote(); expect(mocks.forexLive).toHaveBeenCalledTimes(2);
    mocks.forexLive.mockResolvedValue(usdQuote());
    expect(await api.getLiveUsdtCnyQuote(true)).not.toBeNull(); expect(mocks.forexLive).toHaveBeenLastCalledWith(true);
    expect(mocks.forexLive).toHaveBeenCalledTimes(3);
  });

  it('失败并发singleflight只有一次美元请求，全返回null', async () => {
    mocks.forexLive.mockRejectedValue(new Error('offline'));
    const all = await Promise.all(Array.from({ length: 12 }, () => api.getLiveUsdtCnyQuote(true)));
    expect(all.every(value => value === null)).toBe(true); expect(mocks.forexLive).toHaveBeenCalledTimes(1);
  });

  it('上游对象与返回对象copy隔离，metadata修改不能污染内存', async () => {
    const original = usdQuote(); mocks.forexLive.mockResolvedValue(original);
    const quote = await api.getLiveUsdtCnyQuote(); original.rate = 999; original.source = 'invented';
    quote!.usdCnySource = 'invented'; quote!.usdCnyAsOf = 'invalid';
    expect(api.peekUsdtCnyQuote()).toEqual(policyQuote());
  });

  it('reset清空缓存，未完成旧flight不能在reset后污染新缓存', async () => {
    let resolve!: (value: unknown) => void;
    mocks.forexLive.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const old = api.getLiveUsdtCnyQuote(); api.__usdtCnyTest.reset();
    mocks.forexLive.mockResolvedValue(usdQuote({ rate: 7.15 })); expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 7.15 });
    resolve(usdQuote({ rate: 7.01 })); await old; expect(api.peekUsdtCnyQuote()).toMatchObject({ rate: 7.15 });
    api.__usdtCnyTest.reset(); expect(api.peekUsdtCnyQuote()).toBeNull();
    await api.getLiveUsdtCnyQuote(); expect(mocks.forexLive).toHaveBeenCalledTimes(3);
  });

  it('旧flight结束不能解除reset之后尚在执行的新singleflight', async () => {
    let resolveOld!: (value: unknown) => void; let resolveNew!: (value: unknown) => void;
    mocks.forexLive.mockImplementationOnce(() => new Promise(r => { resolveOld = r; }))
      .mockImplementationOnce(() => new Promise(r => { resolveNew = r; }));
    const old = api.getLiveUsdtCnyQuote(); api.__usdtCnyTest.reset(); const fresh = api.getLiveUsdtCnyQuote(true);
    resolveOld(usdQuote()); await old; const joined = api.getLiveUsdtCnyQuote();
    expect(mocks.forexLive).toHaveBeenCalledTimes(2);
    resolveNew(usdQuote({ rate: 7.2 })); expect(await fresh).toEqual(await joined);
    expect(api.peekUsdtCnyQuote()).toMatchObject({ rate: 7.2 });
  });

  it('导入与peek无网络副作用，实时读取不导入DB/crypto/scanner/routers或启动后台timer', async () => {
    expect(network).not.toHaveBeenCalled(); expect(mocks.forexLive).not.toHaveBeenCalled();
    expect(api.peekUsdtCnyQuote()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    const interval = vi.spyOn(globalThis, 'setInterval');
    await vi.importActual('./stock-usd-cny-rate'); await api.getLiveUsdtCnyQuote();
    expect(interval).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    expect(network).not.toHaveBeenCalled(); expect(mocks.forexClose).not.toHaveBeenCalled();
  });
});
