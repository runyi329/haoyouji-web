import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ publish: vi.fn(), live: vi.fn(), warm: vi.fn() }));
vi.mock('./crypto-portfolio-settlement', () => ({ publishCryptoPortfolioSnapshots: mocks.publish, refreshCryptoPortfolioIntradaySnapshots: mocks.live }));
vi.mock('./ledger-stock-portfolio', () => ({ warmAllStockTagCalendarResults: mocks.warm }));
vi.mock('./db', () => ({ getDbConnection: () => { throw new Error('真实数据库禁止'); } }));
let api: typeof import('./crypto-portfolio-scheduler');
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-14T15:04:58+08:00'));
  mocks.publish.mockReset().mockImplementation(async ({ snapshotDate }) => ({ categories: 1, published: 0, alreadyPublished: 1, skipped: 0, snapshotDate }));
  mocks.live.mockReset().mockResolvedValue({ categories: 1, symbols: 2, updated: 2 });
  mocks.warm.mockReset().mockResolvedValue({ warmed: 1 });
  api = await import('./crypto-portfolio-scheduler');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('37号数字币独立应用内调度', () => {
  it('模块导入不会启用任务或连接数据库', () => {
    expect(mocks.publish).not.toHaveBeenCalled(); expect(mocks.live).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('周六15:05准点执行自然日，不等证券周一开盘', async () => {
    api.startCryptoPortfolioScheduler();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.publish.mock.calls.some(([input]) => input.snapshotDate === '2026-11-14')).toBe(true);
    expect(mocks.live).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.live).toHaveBeenCalledTimes(2);
    expect(mocks.warm).not.toHaveBeenCalled();
  });
  it('启动重复调用不叠加定时器，24小时实时报价不是按股票开盘时段', async () => {
    api.startCryptoPortfolioScheduler(); api.startCryptoPortfolioScheduler();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.live).toHaveBeenCalledTimes(2);
    expect(mocks.publish.mock.calls.filter(([input]) => input.snapshotDate === '2026-11-14')).toHaveLength(1);
  });
  it('启动补证只给已到期自然日，不能发布明天快照', async () => {
    await api.runCryptoPortfolioCloseCandidates(new Date('2026-11-15T16:00:00+08:00'));
    expect(mocks.publish.mock.calls.map(([input]) => input.snapshotDate)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
  });
  it('只对真实新增日结刷新派生缓存，已有和缺证据都不刷新', async () => {
    mocks.publish.mockResolvedValueOnce({ categories: 1, published: 0, alreadyPublished: 0, skipped: 1, snapshotDate: '2026-11-14' });
    await api.runCryptoPortfolioCloseCandidates(new Date('2026-11-14T16:00:00+08:00'), '2026-11-14');
    expect(mocks.warm).not.toHaveBeenCalled();
    mocks.publish.mockResolvedValueOnce({ categories: 1, published: 1, alreadyPublished: 0, skipped: 0, snapshotDate: '2026-11-14' });
    await api.runCryptoPortfolioCloseCandidates(new Date('2026-11-14T16:00:00+08:00'), '2026-11-14');
    expect(mocks.warm).toHaveBeenCalledTimes(1);
  });
  it('15:05后在同一自然日重试，次日不会继续给昨天写新价格', async () => {
    api.startCryptoPortfolioScheduler();
    await vi.advanceTimersByTimeAsync(2000 + 300000);
    expect(mocks.publish.mock.calls.filter(([input]) => input.snapshotDate === '2026-11-14')).toHaveLength(2);
  });
  it('发布失败不刷新、不写成功标记，并继续允许下一次真实证据重试', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.publish.mockRejectedValueOnce(new Error('缺正确15:05价格'));
    await api.runCryptoPortfolioCloseCandidates(new Date('2026-11-14T16:00:00+08:00'), '2026-11-14');
    expect(mocks.warm).not.toHaveBeenCalled();
    await api.runCryptoPortfolioCloseCandidates(new Date('2026-11-14T16:00:00+08:00'), '2026-11-14');
    expect(mocks.publish).toHaveBeenCalledTimes(2);
  });
  it('日结未完成时不会叠加并发日结', async () => {
    let complete!: (value: any) => void;
    mocks.publish.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const first = api.runCryptoPortfolioCloseCandidates(new Date('2026-11-14T16:00:00+08:00'), '2026-11-14');
    await api.runCryptoPortfolioCloseCandidates(new Date('2026-11-14T16:00:00+08:00'), '2026-11-14');
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    complete({ categories: 1, published: 0, alreadyPublished: 0, skipped: 1, snapshotDate: '2026-11-14' });
    await first;
  });
});
