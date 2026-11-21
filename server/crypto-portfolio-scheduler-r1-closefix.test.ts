import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ publish: vi.fn(), live: vi.fn(), warm: vi.fn() }));
vi.mock('./crypto-portfolio-settlement', () => ({ publishCryptoPortfolioSnapshots: mocks.publish, refreshCryptoPortfolioIntradaySnapshots: mocks.live }));
vi.mock('./ledger-stock-portfolio', () => ({ warmAllStockTagCalendarResults: mocks.warm }));
const date = '2026-11-21';
const fail = (snapshotDate = date) => ({ categories: 1, published: 0, alreadyPublished: 0, skipped: 1, snapshotDate,
  failures: [{ categoryId: 90250, snapshotDate, reason: 'missing_verified_close', missingSymbols: ['CRYPTO:UNI-USDT'] }] });
const success = (snapshotDate = date) => ({ categories: 1, published: 0, alreadyPublished: 1, skipped: 0, snapshotDate });
let api: typeof import('./crypto-portfolio-scheduler');
let warning: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T15:05:00+08:00`));
  mocks.publish.mockReset().mockImplementation(async ({ snapshotDate }) => fail(snapshotDate));
  mocks.live.mockReset().mockResolvedValue({}); mocks.warm.mockReset().mockResolvedValue({});
  warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  api = await import('./crypto-portfolio-scheduler');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('R1 failed-return diagnostics and bounded retries', () => {
  it('returned category failures are visible with scope/date/reason/symbol, deduplicated while retries continue then stop after 3h', async () => {
    await api.runCryptoPortfolioCloseCandidates(new Date(), date);
    expect(warning).toHaveBeenCalledWith(expect.any(String), { scope: { ledgerId: 37, categoryId: 90250 }, date,
      reason: 'missing_verified_close', missingSymbols: ['CRYPTO:UNI-USDT'] });
    expect(vi.getTimerCount()).toBe(1); expect(mocks.warm).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3 * 60 * 60_000 + 10 * 60_000);
    expect(mocks.publish).toHaveBeenCalledTimes(37); expect(warning).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    expect(mocks.publish).toHaveBeenCalledTimes(37);
  });
  it('a successful immutable retry stops immediately, never warms or endlessly retries existing rows', async () => {
    mocks.publish.mockResolvedValueOnce(fail()).mockResolvedValue(success());
    await api.runCryptoPortfolioCloseCandidates(new Date(), date);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.publish).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2 * 60 * 60_000); expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.warm).not.toHaveBeenCalled();
  });
  it('thrown errors are finite safe diagnostics without raw credentials and still get bounded retry', async () => {
    mocks.publish.mockRejectedValue(new Error('private DB URL and password must not log'));
    await api.runCryptoPortfolioCloseCandidates(new Date(), date);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(mocks.publish).toHaveBeenCalledTimes(2); expect(warning).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warning.mock.calls)).not.toContain('password');
    expect(warning.mock.calls[0][1]).toMatchObject({ reason: 'publication_failed', scope: { ledgerId: 37, categoryId: null }, missingSymbols: [] });
  });
  it.each(['2026-11-20', '2026-11-19'])('old candidate %s diagnoses but cannot schedule ongoing writes on a later natural date', async past => {
    await api.runCryptoPortfolioCloseCandidates(new Date(), past);
    expect(warning.mock.calls[0][1]).toMatchObject({ date: past }); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5 * 60_000); expect(mocks.publish).toHaveBeenCalledTimes(1);
  });
  it('outside retry window no timer, log has finite symbol count/length and duplicate failures are one record', async () => {
    vi.setSystemTime(new Date(`${date}T18:06:00+08:00`));
    const row = fail(); row.failures[0].missingSymbols = Array.from({ length: 500 }, (_, i) => `${i}-${'X'.repeat(200)}`);
    row.failures = [row.failures[0], row.failures[0]];
    mocks.publish.mockResolvedValue(row);
    await api.runCryptoPortfolioCloseCandidates(new Date(), date);
    expect(warning).toHaveBeenCalledTimes(1); const logged = warning.mock.calls[0][1];
    expect(logged.missingSymbols).toHaveLength(20); expect(logged.missingSymbols.every((s: string) => s.length <= 64)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('64-record cap prevents changed causes flooding logs and always preserves finite retry window', async () => {
    for (let i = 0; i < 100; i++) {
      mocks.publish.mockResolvedValue({ ...fail(), failures: [{ ...fail().failures[0], categoryId: 1000 + i }] });
      await api.runCryptoPortfolioCloseCandidates(new Date(), date);
    }
    expect(warning).toHaveBeenCalledTimes(64); expect(vi.getTimerCount()).toBe(1);
  });
  it('new publication warms only once; cache failure is diagnosed but is not another publication retry', async () => {
    mocks.publish.mockResolvedValue({ ...success(), published: 1, alreadyPublished: 0 }); mocks.warm.mockRejectedValue(new Error('cache error'));
    await api.runCryptoPortfolioCloseCandidates(new Date(), date);
    expect(mocks.warm).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    expect(warning.mock.calls[0][1]).toMatchObject({ reason: 'derived_cache_warm_failed' });
  });
});
