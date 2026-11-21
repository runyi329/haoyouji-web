import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE, USDT_USD_PARITY_RATE } from '../shared/usdt-usd-parity-policy';
import type { StockUsdCnyClosePoint } from './stock-usd-cny-rate';
const forex = vi.hoisted(() => ({ live: vi.fn(), close: vi.fn() }));
const unified = vi.hoisted(() => ({ live: vi.fn() }));
vi.mock('./stock-usd-cny-rate', () => ({ getLiveStockUsdCnyQuote: forex.live, fetchStockUsdCnyAtClose: forex.close }));
vi.mock('./usdt-cny-rate', () => ({ getLiveUsdtCnyQuote: unified.live }));
vi.mock('./db', () => ({ getDbConnection: () => { throw new Error('DB forbidden'); } }));
const NOW = Date.parse('2026-11-16T08:00:00Z'); // 周一16:00北京
let api: typeof import('./crypto-portfolio-fx');
let network: ReturnType<typeof vi.fn>;

function closePoint(date: string, patch = {}): StockUsdCnyClosePoint {
  return { snapshotDate: date, usdCnyRate: 7, asOf: `${date}T07:05:00.000Z`, source: 'yahoo_usdcny_5m', pair: 'USD/CNY' as const, lockedAt: `${date}T15:05:00+08:00`, ...patch };
}
function livePoint(patch = {}) {
  const asOf = new Date(Date.now() - 1000).toISOString(), observedAt = new Date().toISOString();
  return { rate: 7, pair: 'USDT/CNY' as const, stale: false, carried: false,
    conversionPolicy: USDT_USD_PARITY_POLICY, usdtUsdRate: USDT_USD_PARITY_RATE,
    usdtUsdSource: USDT_USD_PARITY_SOURCE, usdtUsdAsOf: observedAt,
    usdCnyRate: 7, usdCnySource: 'sina_usdcny', usdCnyAsOf: asOf,
    source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny`, asOf, observedAt, ...patch };
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(NOW);
  forex.live.mockReset(); forex.close.mockReset().mockImplementation(async (date: string) => closePoint(date));
  unified.live.mockReset().mockImplementation(async () => livePoint());
  network = vi.fn(async () => { throw new Error('unexpected network: no Coinbase/market USDT leg allowed'); });
  vi.stubGlobal('fetch', network);
  api = await import('./crypto-portfolio-fx');
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('USDT/USD记账政策实时统一入口', () => {
  it('直接返回统一入口的真实USD值/来源/时刻，不建立第二个缓存或请求Coinbase', async () => {
    const original = livePoint({ rate: 6.6704, usdCnyRate: 6.6704 });
    unified.live.mockResolvedValue(original);
    const quote = await api.getLiveCryptoUsdtCnyQuote();
    expect(quote).toEqual(original); expect(quote).not.toBe(original);
    quote!.rate = 999;
    expect((await api.getLiveCryptoUsdtCnyQuote())!.rate).toBe(6.6704);
    unified.live.mockResolvedValue(livePoint({ rate: 6.8, usdCnyRate: 6.8 }));
    expect((await api.getLiveCryptoUsdtCnyQuote())!.rate).toBe(6.8);
    expect(unified.live).toHaveBeenCalledTimes(3);
    expect(forex.live).not.toHaveBeenCalled(); expect(forex.close).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it.each(['2026-11-15T08:00:00Z', '2026-11-16T00:10:00+08:00', '2026-11-21T17:00:00+08:00'])('周末/闭市%s不擅自用旧A收盘替换统一实时USD值', async time => {
    vi.setSystemTime(new Date(time));
    const quote = livePoint({ rate: 6.71, usdCnyRate: 6.71 });
    unified.live.mockResolvedValue(quote);
    expect(await api.getLiveCryptoUsdtCnyQuote()).toEqual(quote);
    expect(forex.close).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it('统一入口未知时原样返回null，无Coinbase/收盘/fixed CNY降级', async () => {
    unified.live.mockResolvedValue(null);
    expect(await api.getLiveCryptoUsdtCnyQuote()).toBeNull();
    expect(forex.close).not.toHaveBeenCalled(); expect(forex.live).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-11-16T05:59:59+08:00', true], ['2026-11-16T06:00:00+08:00', false],
    ['2026-07-13T04:59:59+08:00', true], ['2026-07-13T05:00:00+08:00', false],
    ['2026-11-14T05:59:59+08:00', false], ['2026-11-14T06:00:00+08:00', true],
  ])('保留旧纽约17点边界兼容export：%s休市=%s', (time, closed) => {
    expect(api.isCryptoFxWeekendClosed(new Date(time))).toBe(closed);
  });
  it('无效周末时间不误判休市', () => expect(api.isCryptoFxWeekendClosed(new Date(NaN))).toBe(false));
});

describe('15:05 USDT/USD政策=1 × 真实USD/CNY anchor', () => {
  it('只请求当日真实USD close；政策适用时点为本日15:05，不再请求任何USDT/USD market quote', async () => {
    const quote = await api.fetchCryptoUsdtCnyAtClose('2026-11-16');
    expect(quote).toMatchObject({ snapshotDate: '2026-11-16', usdtCnyRate: 7, pair: 'USDT/CNY',
      conversionPolicy: USDT_USD_PARITY_POLICY, usdtUsdRate: 1, usdtUsdSource: USDT_USD_PARITY_SOURCE,
      usdtUsdAsOf: '2026-11-16T07:05:00.000Z', usdCnyRate: 7, usdCnySource: 'yahoo_usdcny_5m', usdCnyAsOf: '2026-11-16T07:05:00.000Z',
      asOf: '2026-11-16T07:05:00.000Z', lockedAt: '2026-11-16T15:05:00+08:00', carried: false,
      observedAt: new Date(NOW).toISOString(), forexSnapshotDate: '2026-11-16', source: `${USDT_USD_PARITY_SOURCE}_x_yahoo_usdcny_5m` });
    expect(forex.close).toHaveBeenCalledTimes(1); expect(forex.close).toHaveBeenCalledWith('2026-11-16');
    expect(forex.live).not.toHaveBeenCalled(); expect(unified.live).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    expect(quote!.source).not.toMatch(/coinbase|market|spot|bridge/);
  });

  it.each([
    ['wrong-pair', { pair: 'USDT/CNY' }], ['wrong-date', { snapshotDate: '2026-11-13' }],
    ['after-cutoff', { asOf: '2026-11-16T07:05:01Z' }], ['future', { asOf: '2026-11-17T07:04:00Z' }],
    ['too-old', { asOf: '2026-11-16T06:34:59Z' }], ['wrong-source', { source: 'invented' }],
    ['missing-asOf', { asOf: undefined }], ['invalid-asOf', { asOf: 'bad' }], ['wrong-lock', { lockedAt: '2026-11-16T15:06:00+08:00' }],
    ['missing-lock', { lockedAt: undefined }], ['future-lock', { lockedAt: '2026-11-17T15:05:00+08:00' }],
    ['zero', { usdCnyRate: 0 }], ['negative', { usdCnyRate: -1 }], ['infinity', { usdCnyRate: Infinity }],
    ['missing-rate', { usdCnyRate: undefined }], ['boolean-rate', { usdCnyRate: true }],
  ])('USD/CNY %s证据拒绝，政策1不是无USD证据的兜底', async (_reason, patch) => {
    forex.close.mockImplementation(async (date) => closePoint(date, patch));
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-16')).toBeNull();
    expect(forex.close).toHaveBeenCalledTimes(1); expect(forex.close).toHaveBeenCalledWith('2026-11-16');
    expect(forex.live).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it('A交易日必须本日anchor，缺当日USD不能回退周五', async () => {
    const supplied = closePoint('2026-11-13'); forex.close.mockResolvedValue(null);
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-16', { usdCnyClose: supplied })).toBeNull();
    expect(forex.close).toHaveBeenCalledTimes(1); expect(forex.close).toHaveBeenCalledWith('2026-11-16');
  });

  it.each(['sina_usdcny', 'yahoo_usdcny_5m'])('复用合法归档%s，原USD来源/实际时间不改写成政策时间，无额外网络', async source => {
    const point = closePoint('2026-11-16', { source, usdCnyRate: 6.6704, asOf: '2026-11-16T07:04:01.000Z' });
    const quote = await api.fetchCryptoUsdtCnyAtClose('2026-11-16', { usdCnyClose: point as any });
    expect(quote).toMatchObject({ usdtCnyRate: 6.6704, usdCnyRate: 6.6704, usdCnySource: source,
      usdCnyAsOf: point.asOf, asOf: point.asOf, usdtUsdAsOf: '2026-11-16T07:05:00.000Z', forexSnapshotDate: '2026-11-16' });
    expect(forex.close).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it('历史近cutoff边界30分钟仍保留真实older asOf，不用当前USD倒填', async () => {
    forex.close.mockResolvedValue(closePoint('2026-11-16', { asOf: '2026-11-16T06:35:00.000Z' }));
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-16')).toMatchObject({ asOf: '2026-11-16T06:35:00.000Z', usdCnyAsOf: '2026-11-16T06:35:00.000Z' });
    expect(forex.live).not.toHaveBeenCalled();
  });

  it.each(['2026-11-14', '2026-11-15', '2026-11-21'])('周末%s沿用最近A日真实USD anchor并标carried；本日15:05仅政策适用时点', async date => {
    vi.setSystemTime(new Date(`${date}T16:00:00+08:00`));
    const anchor = date === '2026-11-21' ? '2026-11-20' : '2026-11-13';
    const quote = await api.fetchCryptoUsdtCnyAtClose(date);
    expect(forex.close).toHaveBeenCalledTimes(1); expect(forex.close).toHaveBeenCalledWith(anchor);
    expect(quote).toMatchObject({ snapshotDate: date, usdtCnyRate: 7, conversionPolicy: USDT_USD_PARITY_POLICY,
      carried: true, forexSnapshotDate: anchor, usdtUsdRate: 1, usdtUsdAsOf: `${date}T07:05:00.000Z`,
      usdCnyAsOf: `${anchor}T07:05:00.000Z`, lockedAt: `${date}T15:05:00+08:00`, asOf: `${anchor}T07:05:00.000Z`,
      source: `${USDT_USD_PARITY_SOURCE}_x_yahoo_usdcny_5m_carried_A_anchor_${anchor}` });
    expect(network).not.toHaveBeenCalled(); expect(forex.live).not.toHaveBeenCalled();
  });

  it('周末anchor无真实价或断网返回null，不回查更旧供应商/实时USD', async () => {
    vi.setSystemTime(new Date('2026-11-15T16:00:00+08:00')); forex.close.mockResolvedValue(null);
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-15')).toBeNull();
    vi.setSystemTime(Date.now() + 30_001); forex.close.mockRejectedValue(new Error('offline'));
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-15')).toBeNull();
    expect(forex.close).toHaveBeenCalledTimes(2); expect(forex.close.mock.calls.every(([date]) => date === '2026-11-13')).toBe(true);
    expect(forex.live).not.toHaveBeenCalled(); expect(unified.live).not.toHaveBeenCalled();
  });

  it('合法归档可越过先前null缓存，不同USD来源独立缓存，不能被旧上游结果遮蔽', async () => {
    forex.close.mockResolvedValue(null);
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-16')).toBeNull();
    const first = await api.fetchCryptoUsdtCnyAtClose('2026-11-16', { usdCnyClose: closePoint('2026-11-16', { source: 'sina_usdcny', usdCnyRate: 6.6704 }) as any });
    const second = await api.fetchCryptoUsdtCnyAtClose('2026-11-16', { usdCnyClose: closePoint('2026-11-16', { usdCnyRate: 6.8 }) });
    expect(first).toMatchObject({ usdCnyRate: 6.6704, usdCnySource: 'sina_usdcny', usdtCnyRate: 6.6704 });
    expect(second).toMatchObject({ usdCnyRate: 6.8, usdCnySource: 'yahoo_usdcny_5m', usdtCnyRate: 6.8 });
    expect(forex.close).toHaveBeenCalledTimes(1);
  });

  it('transaction-owned USD fallback只按合法anchor请求一次，不额外请求默认close', async () => {
    const fallback = vi.fn(async date => closePoint(date));
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-16', { fetchUsdCnyAtClose: fallback })).toMatchObject({ usdtCnyRate: 7 });
    expect(fallback).toHaveBeenCalledTimes(1); expect(fallback).toHaveBeenCalledWith('2026-11-16');
    expect(forex.close).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it('无效/未来日期不发请求；single-flight/历史缓存/拷贝隔离保留，不建立schedule', async () => {
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-02-30')).toBeNull();
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-17')).toBeNull();
    expect(forex.close).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    const all = await Promise.all(Array.from({ length: 8 }, () => api.fetchCryptoUsdtCnyAtClose('2026-11-16')));
    expect(forex.close).toHaveBeenCalledTimes(1); expect(network).not.toHaveBeenCalled();
    all[0]!.usdtCnyRate = 999;
    expect((await api.fetchCryptoUsdtCnyAtClose('2026-11-16'))!.usdtCnyRate).toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('最多4日期并发保留原范围边界，第5个不扩展请求', async () => {
    const resolve: Array<() => void> = [];
    forex.close.mockImplementation(date => new Promise(done => resolve.push(() => done(closePoint(date)))));
    const dates = ['2026-11-16', '2026-11-15', '2026-11-14', '2026-11-13'];
    const pending = dates.map(date => api.fetchCryptoUsdtCnyAtClose(date));
    expect(await api.fetchCryptoUsdtCnyAtClose('2026-11-12')).toBeNull();
    expect(forex.close).toHaveBeenCalledTimes(4); resolve.forEach(done => done());
    expect((await Promise.all(pending)).every(Boolean)).toBe(true);
  });
});
