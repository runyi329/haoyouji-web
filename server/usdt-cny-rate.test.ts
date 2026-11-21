import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ bridge: vi.fn(), forexLive: vi.fn(), forexClose: vi.fn() }));
vi.mock('./crypto-portfolio-fx', () => ({ getLiveCryptoUsdtCnyQuote: mocks.bridge }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: mocks.forexLive, fetchStockUsdCnyAtClose: mocks.forexClose }));
// 导入任何 DB 模块都应立即使本测试失败，而不是只禁止其中某个写函数。
vi.mock('./db', () => { throw new Error('DB import forbidden for readonly FX'); });
vi.mock('./db-crypto-portfolio', () => { throw new Error('Portfolio DB import forbidden for readonly FX'); });

const NOW = Date.parse('2026-11-16T08:00:00Z');
const iso = (time = Date.now()) => new Date(time).toISOString();
const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => data });
const cgPayload = (patch: Record<string, unknown> = {}) => ({ tether: { cny: 7.03, last_updated_at: Math.floor(Date.now() / 1000) - 2, ...patch } });
const okxPayload = (buy: unknown[] = [{ price: '7.06' }], patch: Record<string, unknown> = {}) => ({ code: '0', data: { buy }, ...patch });
const bridgeQuote = (patch: Record<string, unknown> = {}) => ({
  rate: 6.93, pair: 'USDT/CNY', source: 'bridge_coinbase_usdt_usd_spot_reference_sampled_x_sina_usdcny',
  asOf: iso(Date.now() - 1000), observedAt: iso(), stale: false, carried: false,
  usdtUsdRate: 0.99, usdtUsdAsOf: iso(), usdtUsdSource: 'coinbase_usdt_usd_spot_reference_sampled',
  usdCnyRate: 7, usdCnyAsOf: iso(Date.now() - 1000), usdCnySource: 'sina_usdcny', ...patch,
});
let api: typeof import('./usdt-cny-rate');
let network: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  mocks.bridge.mockReset().mockResolvedValue(null);
  mocks.forexLive.mockReset().mockResolvedValue({ rate: 7, pair: 'USD/CNY', source: 'sina_usdcny', asOf: iso(NOW - 1000), stale: false });
  mocks.forexClose.mockReset().mockImplementation(async (date: string) => ({
    snapshotDate: date, usdCnyRate: 7, asOf: `${date}T07:05:00.000Z`, source: 'yahoo_usdcny_5m', pair: 'USD/CNY', lockedAt: `${date}T15:05:00+08:00`,
  }));
  network = vi.fn(async () => response(cgPayload()));
  vi.stubGlobal('fetch', network);
  api = await import('./usdt-cny-rate');
  api.__usdtCnyTest.reset();
});
afterEach(() => { api.__usdtCnyTest.reset(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

function failDirect() { network.mockResolvedValue(response({})); }
async function realBridge() {
  const actual = await vi.importActual<typeof import('./crypto-portfolio-fx')>('./crypto-portfolio-fx');
  mocks.bridge.mockImplementation(actual.getLiveCryptoUsdtCnyQuote);
  network.mockImplementation(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === 'api.coinbase.com') return response({ data: { base: 'USDT', currency: 'USD', amount: '0.99' } });
    return response({});
  });
}

describe('主 CoinGecko tether/CNY 实时证据', () => {
  it('主源使用指定真实URL，provider asOf与实际 observedAt分别保留，成功不调用备用', async () => {
    const quote = await api.getLiveUsdtCnyQuote();
    expect(quote).toEqual({ rate: 7.03, pair: 'USDT/CNY', source: 'coingecko_tether_cny',
      asOf: iso(NOW - 2000), observedAt: iso(NOW), stale: false, carried: false });
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toBe('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=cny&include_last_updated_at=true');
    expect(mocks.bridge).not.toHaveBeenCalled();
  });

  it('observedAt 使用响应读取完成时间而非请求开始或last_updated_at', async () => {
    network.mockImplementation(async () => ({ ok: true, json: async () => { vi.setSystemTime(NOW + 5000); return { tether: { cny: 7.03, last_updated_at: NOW / 1000 - 2 } }; } }));
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ asOf: iso(NOW - 2000), observedAt: iso(NOW + 5000) });
  });

  it.each([NaN, Infinity, -Infinity, 0, -1, null, undefined, true, '7', '', 'NaN'])('拒绝非正有限数字价格 %s', async (cny) => {
    network.mockResolvedValue(response(cgPayload({ cny })));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
    expect(mocks.bridge).toHaveBeenCalledTimes(1);
  });

  it.each([NaN, Infinity, 0, null, undefined, true, String(NOW / 1000), NOW / 1000 + 1, NOW / 1000 - 601, NOW, NOW / 1000 - 0.5])('拒绝无效/未来/过旧或错误单位last_updated_at %s', async (last_updated_at) => {
    network.mockResolvedValue(response(cgPayload({ last_updated_at })));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it('10分钟边界可用，但已缓存证据越过边界即失效，不等完整TTL', async () => {
    network.mockResolvedValue(response(cgPayload({ last_updated_at: NOW / 1000 - 600 })));
    expect(await api.getLiveUsdtCnyQuote()).not.toBeNull();
    vi.setSystemTime(NOW + 1);
    expect(api.peekUsdtCnyQuote()).toBeNull();
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it.each([{ usd: { cny: 7, last_updated_at: NOW / 1000 } }, { tether: { usd: 1, last_updated_at: NOW / 1000 } }, null, [], {}])('USD或错误shape不等于USDT/CNY：%j', async (payload) => {
    network.mockResolvedValue(response(payload));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });
});

describe('备用 OKX C2C 买价 sampled_reference', () => {
  it('主源失败才尝试现有52真实官方URL，只读buy，不把无时间价格标成成交时刻', async () => {
    network.mockImplementation(async (input: string) => input.includes('coingecko') ? response({}) : response(okxPayload()));
    const quote = await api.getLiveUsdtCnyQuote();
    expect(quote).toEqual({ rate: 7.06, pair: 'USDT/CNY', source: 'okx_c2c_usdt_cny_buy_sampled_reference',
      asOf: iso(NOW), observedAt: iso(NOW), stale: false, carried: false });
    expect(network.mock.calls[1][0]).toBe('https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=CNY&baseCurrency=USDT&side=buy&paymentMethod=all&userType=all&showTrade=false&showFollow=false&showAlreadyTraded=false&isAbleFilter=false');
    expect(mocks.bridge).not.toHaveBeenCalled();
  });

  it('兼容官方小写usdt/cny字段，保留明确的USDT/CNY身份与采样元数据', async () => {
    network.mockImplementation(async (input: string) => input.includes('coingecko') ? response({})
      : response({ code: 0, data: { buy: [{ baseCurrency: 'usdt', quoteCurrency: 'cny', side: 'buy', price: '6.73' }] } }));
    expect(await api.getLiveUsdtCnyQuote()).toEqual({ rate: 6.73, pair: 'USDT/CNY',
      source: 'okx_c2c_usdt_cny_buy_sampled_reference', asOf: iso(NOW), observedAt: iso(NOW), stale: false, carried: false });
    expect(mocks.bridge).not.toHaveBeenCalled();
  });

  it('大小写规范也适用于顶层/嵌套身份和方向，但绝不把usd别名为usdt', async () => {
    network.mockImplementation(async (input: string) => input.includes('coingecko') ? response({})
      : response({ code: '0', baseCurrency: 'uSdT', quoteCurrency: 'cNy', side: 'BUY', pair: 'usdt/cny',
        data: { baseCurrency: 'usdt', quoteCurrency: 'CNY', buy: [{ baseCurrency: 'USDT', quoteCurrency: 'cny', side: 'Buy', price: '6.73' }] } }));
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 6.73, pair: 'USDT/CNY' });
    api.__usdtCnyTest.reset();
    network.mockImplementation(async (input: string) => input.includes('coingecko') ? response({})
      : response({ code: 0, data: { buy: [{ baseCurrency: 'usd', quoteCurrency: 'cny', side: 'buy', price: '6.73' }] } }));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it.each([null, 1, true, ['usdt'], 'USDT-USD'])('规范大小写仍拒绝非法币种字段 %j', async (baseCurrency) => {
    network.mockImplementation(async (input: string) => input.includes('coingecko') ? response({})
      : response({ code: 0, data: { buy: [{ baseCurrency, quoteCurrency: 'cny', price: '6.73' }] } }));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it('采样时间在读取完成时取得；供应商其他时间字段不伪称交易时间', async () => {
    network.mockImplementation(async (input: string) => {
      if (input.includes('coingecko')) return response({});
      return { ok: true, json: async () => { vi.setSystemTime(NOW + 1000); return okxPayload([{ price: '7.08', updateTime: '2000-01-01T00:00:00Z' }]); } };
    });
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 7.08, asOf: iso(NOW + 1000), observedAt: iso(NOW + 1000) });
  });

  it('跳过无效买价并选首个有效买价，不拿sell列表', async () => {
    network.mockImplementation(async (input: string) => input.includes('coingecko') ? response({})
      : response({ data: { buy: [{ price: '' }, { price: '7.1USD' }, { price: '7.04' }, { price: '9' }], sell: [{ price: '8' }] } }));
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 7.04 });
  });

  it.each([NaN, Infinity, 0, -1, null, undefined, true, '', ' ', '7USD', 'Infinity', 'NaN'])('拒绝无效价格 %s，不固定人民币率兜底', async (price) => {
    network.mockImplementation(async (input: string) => input.includes('coingecko') ? response({}) : response(okxPayload([{ price }])));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it.each([
    { data: { buy: [{ price: '7' }], baseCurrency: 'USD', quoteCurrency: 'CNY' } },
    { data: { buy: [{ price: '7' }], baseCurrency: 'USDT', quoteCurrency: 'USD' } },
    { data: { buy: [{ price: '7', baseCurrency: 'USD' }] } },
    { data: { buy: [{ price: '7', quoteCurrency: 'USD' }] } },
    { data: { buy: [{ price: '7', pair: 'USD/CNY' }] } },
    { data: { buy: [{ price: '7', side: 'sell' }] } },
    { pair: 'USD/CNY', data: { buy: [{ price: '7' }] } },
    { code: '500', data: { buy: [{ price: '7' }] } },
    { data: { sell: [{ price: '7' }] } },
    { data: { buy: '7' } },
  ])('拒绝身份不符或不成功的OKX响应 %j', async (payload) => {
    network.mockImplementation(async (input: string) => input.includes('coingecko') ? response({}) : response(payload));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });
});

describe('第三源真实双腿桥接且保留周末carry', () => {
  it('两直接源失败才调用既有导出并保留全部两腿证据与原observedAt', async () => {
    failDirect();
    const quote = bridgeQuote({ observedAt: iso(NOW - 500), usdtUsdAsOf: iso(NOW - 500) });
    mocks.bridge.mockResolvedValue(quote);
    expect(await api.getLiveUsdtCnyQuote()).toEqual(quote);
    expect(network).toHaveBeenCalledTimes(2); expect(mocks.bridge).toHaveBeenCalledTimes(1);
  });

  it.each([
    { pair: 'USD/CNY' }, { pair: 'USDT/USD' }, { pair: undefined }, { rate: NaN }, { rate: Infinity }, { rate: 0 },
    { stale: true }, { stale: undefined }, { carried: undefined }, { source: '' },
    { usdtUsdRate: undefined }, { usdtUsdRate: NaN }, { usdtUsdRate: 1 },
    { usdtUsdSource: undefined }, { usdCnySource: ' ' }, { usdCnyRate: null },
    { asOf: 'invalid' }, { observedAt: 'invalid' }, { observedAt: iso(NOW + 1) },
    { observedAt: iso(NOW - 30_000) }, { usdtUsdAsOf: iso(NOW + 1) }, { usdCnyAsOf: iso(NOW + 1) },
    { usdtUsdAsOf: iso(NOW - 601_000), asOf: iso(NOW - 601_000) },
    { usdCnyAsOf: iso(NOW - 1_800_001), asOf: iso(NOW - 1_800_001) },
    { asOf: iso(NOW - 2000) }, { rate: 7 },
  ])('拒绝stale、错误pair、无源、非法时间或USD替代真实USDT腿 %j', async (patch) => {
    failDirect(); mocks.bridge.mockResolvedValue(bridgeQuote(patch));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
    expect(api.peekUsdtCnyQuote()).toBeNull();
  });

  it('真实旧crypto导出计算0.99×7而非把USD/CNY=7当USDT/CNY，未调用历史', async () => {
    await realBridge();
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 6.93, usdtUsdRate: 0.99, usdCnyRate: 7, pair: 'USDT/CNY', stale: false });
    expect(mocks.forexClose).not.toHaveBeenCalled();
    expect(network.mock.calls.some(([url]) => String(url) === 'https://api.coinbase.com/v2/prices/USDT-USD/spot')).toBe(true);
    expect(network.mock.calls.some(([url]) => String(url).includes('/candles'))).toBe(false);
  });

  it.each(['USD', 'ETH'])('真实桥接不能接受Coinbase base=%s，不能默置USDT/USD=1', async (base) => {
    await realBridge();
    network.mockImplementation(async (input: string) => input.includes('coinbase')
      ? response({ data: { base, currency: 'USD', amount: '1' } }) : response({}));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it('真实桥接证券腿stale=true直接拒绝，而非展示旧汇率为可用', async () => {
    await realBridge(); mocks.forexLive.mockResolvedValue({ rate: 7, pair: 'USD/CNY', source: 'sina_usdcny', asOf: iso(NOW - 1000), stale: true });
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it('真实周末桥接保留周五forexAnchor、carried以及旧asOf，但USDT腿与observedAt仍新鲜', async () => {
    vi.setSystemTime(new Date('2026-11-15T08:00:00Z'));
    await realBridge();
    const quote = await api.getLiveUsdtCnyQuote();
    expect(quote).toMatchObject({ rate: 6.93, pair: 'USDT/CNY', carried: true, stale: false, forexSnapshotDate: '2026-11-13',
      asOf: '2026-11-13T07:05:00.000Z', usdCnyAsOf: '2026-11-13T07:05:00.000Z',
      usdtUsdAsOf: '2026-11-15T08:00:00.000Z', observedAt: '2026-11-15T08:00:00.000Z' });
    expect(quote!.source).toContain('carried_A_anchor_2026-11-13');
    expect(mocks.forexClose).toHaveBeenCalledWith('2026-11-13'); expect(mocks.forexLive).not.toHaveBeenCalled();
    expect(api.peekUsdtCnyQuote()).toEqual(quote);
    vi.setSystemTime(Date.now() + 30_000);
    expect(api.peekUsdtCnyQuote()).toBeNull();
  });

  it.each([{ forexSnapshotDate: undefined }, { forexSnapshotDate: '2026-02-30' }, { forexSnapshotDate: '2026-11-17' }, { forexSnapshotDate: '2026-11-16' }])('carried无合法对应anchor不被误用 %j', async (patch) => {
    failDirect(); mocks.bridge.mockResolvedValue(bridgeQuote({ carried: true,
      asOf: '2026-11-13T07:05:00Z', usdCnyAsOf: '2026-11-13T07:05:00Z', ...patch }));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it('上游bridge缓存已采样20秒，本服务剩余有效期10秒，不给它再添30秒寿命', async () => {
    failDirect(); mocks.bridge.mockResolvedValue(bridgeQuote({ observedAt: iso(NOW - 20_000),
      usdtUsdAsOf: iso(NOW - 20_000), usdCnyAsOf: iso(NOW - 21_000), asOf: iso(NOW - 21_000) }));
    expect(await api.getLiveUsdtCnyQuote()).not.toBeNull();
    vi.setSystemTime(NOW + 9999); expect(api.peekUsdtCnyQuote()).not.toBeNull();
    vi.setSystemTime(NOW + 10_000); expect(api.peekUsdtCnyQuote()).toBeNull();
  });
});

describe('30s TTL、失败短负缓存、singleflight、拷贝隔离', () => {
  it('并发含forceFresh共享一次取数，每次返回独立对象，peek也不得污染缓存', async () => {
    const all = await Promise.all(Array.from({ length: 10 }, (_, i) => api.getLiveUsdtCnyQuote(i % 2 === 0)));
    expect(network).toHaveBeenCalledTimes(1);
    expect(all[0]).not.toBe(all[1]);
    all[0]!.rate = 999; all[0]!.source = 'invented'; all[0]!.stale = true;
    expect(all[1]!.rate).toBe(7.03);
    const peek = api.peekUsdtCnyQuote()!; peek.rate = 1; peek.asOf = 'invalid';
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 7.03, source: 'coingecko_tether_cny', stale: false });
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('TTL为30秒，peek不联网且第30000毫秒返回null，下一读取重新取数', async () => {
    await api.getLiveUsdtCnyQuote();
    vi.setSystemTime(NOW + 29_999); expect(api.peekUsdtCnyQuote()).not.toBeNull();
    await api.getLiveUsdtCnyQuote(); expect(network).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 30_000); expect(api.peekUsdtCnyQuote()).toBeNull(); expect(network).toHaveBeenCalledTimes(1);
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ observedAt: iso(NOW + 30_000) });
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('系统时钟回退不允许未来缓存证据', async () => {
    await api.getLiveUsdtCnyQuote(); vi.setSystemTime(NOW - 1);
    expect(api.peekUsdtCnyQuote()).toBeNull();
  });

  it('forceFresh跳过正缓存，实际读取新quote，但不复制旧缓存为成功', async () => {
    await api.getLiveUsdtCnyQuote(); vi.setSystemTime(NOW + 1000);
    network.mockResolvedValue(response(cgPayload({ cny: 7.11 })));
    expect(await api.getLiveUsdtCnyQuote(true)).toMatchObject({ rate: 7.11, observedAt: iso(NOW + 1000) });
    expect(network).toHaveBeenCalledTimes(2);
  });

  it.each(['network', 'http', 'json'])('全源%s失败返回null，旧成功值不无限保留', async (reason) => {
    await api.getLiveUsdtCnyQuote(); vi.setSystemTime(NOW + 30_000);
    if (reason === 'network') network.mockRejectedValue(new Error('offline'));
    else if (reason === 'http') network.mockResolvedValue(response(cgPayload(), false));
    else network.mockResolvedValue({ ok: true, json: async () => { throw new Error('bad JSON'); } });
    mocks.bridge.mockRejectedValue(new Error('bridge offline'));
    expect(await api.getLiveUsdtCnyQuote()).toBeNull(); expect(api.peekUsdtCnyQuote()).toBeNull();
    vi.setSystemTime(NOW + 60_000);
    expect(await api.getLiveUsdtCnyQuote()).toBeNull(); expect(api.peekUsdtCnyQuote()).toBeNull();
  });

  it('强制刷新失败即移除原先仍未过期的成功缓存，不返回last-good', async () => {
    await api.getLiveUsdtCnyQuote(); failDirect();
    expect(await api.getLiveUsdtCnyQuote(true)).toBeNull();
    expect(api.peekUsdtCnyQuote()).toBeNull(); expect(await api.getLiveUsdtCnyQuote()).toBeNull();
  });

  it('失败缓存仅5秒，forceFresh可绕过；peek无网络且不破坏短负缓存', async () => {
    failDirect(); expect(await api.getLiveUsdtCnyQuote()).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 5; i++) { expect(api.peekUsdtCnyQuote()).toBeNull(); expect(await api.getLiveUsdtCnyQuote()).toBeNull(); }
    expect(network).toHaveBeenCalledTimes(2);
    vi.setSystemTime(NOW + 4999); await api.getLiveUsdtCnyQuote(); expect(network).toHaveBeenCalledTimes(2);
    vi.setSystemTime(NOW + 5000); await api.getLiveUsdtCnyQuote(); expect(network).toHaveBeenCalledTimes(4);
    network.mockResolvedValue(response(cgPayload()));
    expect(await api.getLiveUsdtCnyQuote(true)).not.toBeNull(); expect(network).toHaveBeenCalledTimes(5);
  });

  it('失败并发singleflight，一次主+备+bridge，所有调用返回null', async () => {
    failDirect();
    const all = await Promise.all(Array.from({ length: 12 }, () => api.getLiveUsdtCnyQuote(true)));
    expect(all.every(value => value === null)).toBe(true); expect(network).toHaveBeenCalledTimes(2); expect(mocks.bridge).toHaveBeenCalledTimes(1);
  });

  it('上游对象与服务返回副本隔离，metadata修改不会污染内存', async () => {
    failDirect(); const original = bridgeQuote(); mocks.bridge.mockResolvedValue(original);
    const quote = await api.getLiveUsdtCnyQuote();
    original.rate = 999; original.usdtUsdRate = 999; quote!.usdCnySource = 'invented';
    expect(api.peekUsdtCnyQuote()).toMatchObject({ rate: 6.93, usdtUsdRate: 0.99, usdCnySource: 'sina_usdcny' });
  });

  it('reset清空缓存，下次请求重新取源；未完成的旧flight不能在reset后污染缓存', async () => {
    let resolve!: (value: unknown) => void;
    network.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const old = api.getLiveUsdtCnyQuote();
    api.__usdtCnyTest.reset(); network.mockResolvedValue(response(cgPayload({ cny: 7.15 })));
    expect(await api.getLiveUsdtCnyQuote()).toMatchObject({ rate: 7.15 });
    resolve(response(cgPayload({ cny: 7.01 }))); await old;
    expect(api.peekUsdtCnyQuote()).toMatchObject({ rate: 7.15 });
    api.__usdtCnyTest.reset(); expect(api.peekUsdtCnyQuote()).toBeNull();
  });

  it('真实旧crypto与stock模块导入也不触网、导入DB或注册后台定时器', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    await vi.importActual('./stock-usd-cny-rate');
    await vi.importActual('./crypto-portfolio-fx');
    expect(network).not.toHaveBeenCalled(); expect(mocks.forexLive).not.toHaveBeenCalled();
    expect(mocks.forexClose).not.toHaveBeenCalled(); expect(interval).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('导入无网络副作用，peek不触发fetch；实时读取不启动DB/interval/后台timer', async () => {
    expect(network).not.toHaveBeenCalled(); expect(mocks.bridge).not.toHaveBeenCalled();
    expect(api.peekUsdtCnyQuote()).toBeNull(); expect(network).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    const interval = vi.spyOn(globalThis, 'setInterval');
    await api.getLiveUsdtCnyQuote();
    expect(interval).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
