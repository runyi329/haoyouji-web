import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const forex = vi.hoisted(() => ({ live: vi.fn(), close: vi.fn() }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: forex.live, fetchStockUsdCnyAtClose: forex.close }));
vi.mock('./db', () => ({ getDbConnection: () => { throw new Error('DB forbidden'); } }));
const NOW = Date.parse('2026-11-16T08:00:00Z'); // 周一16:00北京
const OPEN = Date.parse('2026-11-16T15:04:00+08:00') / 1000;
const response = (data: unknown) => ({ ok: true, json: async () => data });
let api: typeof import('./crypto-portfolio-fx');
let network: ReturnType<typeof vi.fn>;

function closePoint(date: string, patch = {}) {
  return { snapshotDate: date, usdCnyRate: 7, asOf: `${date}T07:05:00.000Z`, source: 'yahoo_usdcny_5m', pair: 'USD/CNY', lockedAt: `${date}T15:05:00+08:00`, ...patch };
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  forex.live.mockReset().mockResolvedValue({ rate: 7, asOf: new Date(NOW - 1000).toISOString(), source: 'sina_usdcny', pair: 'USD/CNY', stale: false });
  forex.close.mockReset().mockImplementation(async (date: string) => closePoint(date));
  network = vi.fn(async (input: string) => {
    const url = new URL(input);
    if (url.hostname === 'api.coinbase.com') return response({ data: { base: 'USDT', currency: 'USD', amount: '0.99' } });
    return response([[OPEN, 0.98, 1.01, 1, 0.99, 20]]);
  });
  vi.stubGlobal('fetch', network);
  api = await import('./crypto-portfolio-fx');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('USDT/CNY明确真实双腿桥接', () => {
  it('两腿分别留来源与采样时刻，不把USDT默作USD；live single-flight缓存和拷贝隔离', async () => {
    const all = await Promise.all(Array.from({ length: 8 }, () => api.getLiveCryptoUsdtCnyQuote()));
    expect(all[0]).toMatchObject({ rate: 6.93, pair: 'USDT/CNY', stale: false, carried: false,
      usdtUsdRate: 0.99, usdtUsdSource: 'coinbase_usdt_usd_spot_reference_sampled', usdCnyRate: 7,
      usdCnySource: 'sina_usdcny', asOf: new Date(NOW - 1000).toISOString(), observedAt: new Date(NOW).toISOString() });
    expect(all[0]!.source).toContain('coinbase'); expect(all[0]!.source).toContain('sina');
    expect(forex.live).toHaveBeenCalledTimes(1); expect(network).toHaveBeenCalledTimes(1);
    all[0]!.rate = 999;
    expect((await api.getLiveCryptoUsdtCnyQuote())!.rate).toBe(6.93);
  });

  it.each(['USD', 'ETH'])('Coinbase返回base=%s不匹配不得桥接', async (base) => {
    network.mockResolvedValue(response({ data: { base, currency: 'USD', amount: '1' } }));
    expect(await api.getLiveCryptoUsdtCnyQuote()).toBeNull();
  });

  it.each([0, -1, null, true, 'NaN', 'Infinity'])('USDT/USD非正有效价格%s不固定1兜底', async (amount) => {
    network.mockResolvedValue(response({ data: { base: 'USDT', currency: 'USD', amount } }));
    expect(await api.getLiveCryptoUsdtCnyQuote()).toBeNull();
  });

  it('任何一腿缺证据都返回null，失败不退到7.2/USDT_CNY/OKX', async () => {
    forex.live.mockResolvedValue(null);
    expect(await api.getLiveCryptoUsdtCnyQuote()).toBeNull();
    expect(network.mock.calls.every(([url]) => !/okx|USDT_CNY|gateio/i.test(String(url)))).toBe(true);
    vi.setSystemTime(NOW + 30_001);
    forex.live.mockResolvedValue({ rate: 7, asOf: new Date(Date.now()).toISOString(), source: 'sina_usdcny', pair: 'USD/CNY', stale: false });
    network.mockRejectedValue(new Error('offline'));
    expect(await api.getLiveCryptoUsdtCnyQuote()).toBeNull();
  });

  it('证券模块上游stale或采样超过30分钟必须标stale，不能伪装实时', async () => {
    forex.live.mockResolvedValue({ rate: 7, asOf: new Date(NOW - 31 * 60_000).toISOString(), source: 'sina_usdcny', pair: 'USD/CNY', stale: false });
    expect((await api.getLiveCryptoUsdtCnyQuote())!.stale).toBe(true);
    vi.setSystemTime(NOW + 30_001);
    forex.live.mockResolvedValue({ rate: 7, asOf: new Date(NOW).toISOString(), source: 'sina_usdcny', pair: 'USD/CNY', stale: true });
    expect((await api.getLiveCryptoUsdtCnyQuote())!.stale).toBe(true);
  });

  it('周末live读取最近A日真实15:05 forex anchor，carried而不是周末新外汇', async () => {
    vi.setSystemTime(Date.parse('2026-11-15T08:00:00Z'));
    const quote = await api.getLiveCryptoUsdtCnyQuote();
    expect(forex.live).not.toHaveBeenCalled(); expect(forex.close).toHaveBeenCalledWith('2026-11-13');
    expect(quote).toMatchObject({ carried: true, forexSnapshotDate: '2026-11-13', stale: false,
      usdCnyAsOf: '2026-11-13T07:05:00.000Z', usdtUsdAsOf: '2026-11-15T08:00:00.000Z', asOf: '2026-11-13T07:05:00.000Z' });
    expect(quote!.source).toContain('carried_A_anchor_2026-11-13');
  });

  it('北京周一00:10纽约仍是周日11:10，延用周五已完成anchor且两腿时刻各自保留', async () => {
    vi.setSystemTime(new Date('2026-11-16T00:10:00+08:00'));
    const quote = await api.getLiveCryptoUsdtCnyQuote();
    expect(forex.live).not.toHaveBeenCalled(); expect(forex.close).toHaveBeenCalledWith('2026-11-13');
    expect(quote).toMatchObject({ carried: true, forexSnapshotDate: '2026-11-13', stale: false, rate: 6.93,
      usdCnyAsOf: '2026-11-13T07:05:00.000Z', usdtUsdAsOf: '2026-11-15T16:10:00.000Z' });
  });

  it.each([
    ['2026-11-16T05:59:59+08:00', true], ['2026-11-16T06:00:00+08:00', false],
    ['2026-07-13T04:59:59+08:00', true], ['2026-07-13T05:00:00+08:00', false],
    ['2026-11-14T05:59:59+08:00', false], ['2026-11-14T06:00:00+08:00', true],
  ])('纽约17点边界含夏令时：%s休市=%s', (time, closed) => {
    expect(api.isCryptoFxWeekendClosed(new Date(time))).toBe(closed);
  });

  it('外汇正常开市后陈旧或断网不延用周五，仍返回未知而不伪装实时', async () => {
    vi.setSystemTime(new Date('2026-11-16T06:00:01+08:00')); forex.live.mockResolvedValue(null);
    expect(await api.getLiveCryptoUsdtCnyQuote()).toBeNull(); expect(forex.close).not.toHaveBeenCalled();
  });
});

describe('15:05真实USDT/USD历史分钟 × 真实USD/CNY close', () => {
  it('Coinbase精确USDT-USD请求start/end/60；仅取15:04 row[4] close，保留取数真实时刻', async () => {
    network.mockImplementation(async (input) => {
      const url = new URL(input);
      expect(url.pathname).toBe('/products/USDT-USD/candles');
      expect(Object.fromEntries(url.searchParams)).toEqual({ granularity: '60', start: '2026-11-16T07:04:00.000Z', end: '2026-11-16T07:05:00.000Z' });
      return response([[OPEN + 60, 1, 1, 1, 9], [OPEN, 0.98, 1.01, 1.005, 0.99, 10], [OPEN - 60, 1, 1, 1, 2]]);
    });
    const quote = await api.fetchCryptoUsdtCnyAtClose('2026-11-16');
    expect(quote).toMatchObject({ snapshotDate: '2026-11-16', usdtCnyRate: 6.93, pair: 'USDT/CNY',
      asOf: '2026-11-16T07:05:00.000Z', lockedAt: '2026-11-16T15:05:00+08:00', carried: false,
      observedAt: new Date(NOW).toISOString(), usdtUsdRate: 0.99, forexSnapshotDate: '2026-11-16' });
    expect(forex.live).not.toHaveBeenCalled();
  });

  it.each(['future', 'past', 'millisecond', 'missing', 'duplicate', 'zero'])('Coinbase历史%s缺确证返回null，不用live补过去', async (reason) => {
    const row = [reason === 'future' ? OPEN + 60 : reason === 'past' ? OPEN - 60 : reason === 'millisecond' ? OPEN * 1000 : OPEN, 1, 1, 1, reason === 'zero' ? 0 : 1, 1];
    network.mockResolvedValue(response(reason === 'missing' ? [] : reason === 'duplicate' ? [row, row] : [row]));
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-16')).toBeNull();
    expect(forex.live).not.toHaveBeenCalled();
    expect(network.mock.calls.every(([url]) => !String(url).includes('/spot'))).toBe(true);
  });

  it.each(['wrong-pair', 'wrong-date', 'after-cutoff', 'too-old', 'wrong-source'])('USD/CNY %s证据拒绝', async (reason) => {
    forex.close.mockImplementation(async (date) => closePoint(date, reason === 'wrong-pair' ? { pair: 'USDT/CNY' }
      : reason === 'wrong-date' ? { snapshotDate: '2026-11-13' }
      : reason === 'after-cutoff' ? { asOf: '2026-11-16T07:06:00Z' }
      : reason === 'too-old' ? { asOf: '2026-11-16T06:34:59Z' } : { source: 'invented' }));
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-16')).toBeNull();
  });

  it('周末结算保留当日USDT历史腿，USD腿沿用周五15:05并标carried', async () => {
    const date = '2026-11-15';
    vi.setSystemTime(Date.parse('2026-11-15T08:00:00Z'));
    const openedAt = Date.parse(`${date}T15:04:00+08:00`) / 1000;
    network.mockResolvedValue(response([[openedAt, 0.98, 1.01, 1, 0.99, 1]]));
    const quote = await api.fetchCryptoUsdtCnyAtClose(date);
    expect(forex.close).toHaveBeenCalledWith('2026-11-13');
    expect(quote).toMatchObject({ snapshotDate: date, carried: true, forexSnapshotDate: '2026-11-13',
      usdtUsdAsOf: '2026-11-15T07:05:00.000Z', usdCnyAsOf: '2026-11-13T07:05:00.000Z',
      lockedAt: '2026-11-15T15:05:00+08:00', asOf: '2026-11-13T07:05:00.000Z' });
  });

  it('周末anchor无真实价则返回null；不能一路回查猜选一个供应商价格', async () => {
    vi.setSystemTime(Date.parse('2026-11-15T08:00:00Z'));
    forex.close.mockResolvedValue(null);
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-15')).toBeNull();
    expect(forex.close).toHaveBeenCalledTimes(1);
    expect(forex.live).not.toHaveBeenCalled();
  });

  it('无效/未来日期不发请求；single-flight和历史缓存隔离于实时行情', async () => {
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-02-30')).toBeNull();
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-17')).toBeNull();
    expect(network).not.toHaveBeenCalled();
    const all = await Promise.all(Array.from({ length: 8 }, () => api.fetchCryptoUsdtCnyAtClose('2026-11-16')));
    expect(network).toHaveBeenCalledTimes(1); expect(forex.close).toHaveBeenCalledTimes(1);
    all[0]!.usdtCnyRate = 999;
    expect((await api.fetchCryptoUsdtCnyAtClose('2026-11-16'))!.usdtCnyRate).toBe(6.93);
    expect(vi.getTimerCount()).toBe(0);
  });
});
