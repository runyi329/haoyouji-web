import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: async () => state }));
import { clearAiFearGreedCacheForTests, getAiFearGreedIndex, readAiFearGreedRows } from './ai-fear-greed-service';
const row = { canonicaldate: '20261126', rawCount: '5221', validCount: '5221', upCount: '1683', downCount: '3375', upAmount: '100', downAmount: '200', totalAmount: '310', meanReturn: '-0.005013576326' };
const verified = { ...row, source: 'tushare_daily', source_hash: 'a'.repeat(64), source_rows: 5578, verified_at: '2026-11-27 01:00:00' };
function mockRows(observation = row, cache: any[] = []) {
  state.execute.mockImplementation(async (sql: string, params: string[]) => {
    if (sql.includes('AS latestDate')) return [[{ latestDate: '20261126' }]];
    if (sql.includes('FROM ai_fear_greed_market_daily')) return [cache];
    return [[...(params[0] <= observation.canonicaldate && params[1] >= observation.canonicaldate ? [observation] : [])]];
  });
}
beforeEach(() => { clearAiFearGreedCacheForTests(); state.execute.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-27T01:12:00Z')); });
afterEach(() => vi.useRealTimers());
describe('A股情绪只读服务（数据库硬mock）', () => {
  it('uses ts_code and bounded nonoverlapping year ranges when verified history is absent', async () => {
    mockRows(); const rows = await readAiFearGreedRows(state);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ canonicaldate: '2026-11-26', validCount: 5221, meanReturn: -0.005013576326 });
    expect(state.execute.mock.calls[0][1]).toEqual(['20261126']);
    expect(state.execute.mock.calls[2][1]).toEqual(['20221126', '20231125']);
    expect(state.execute.mock.calls[6][1]).toEqual(['20261126', '20261126']);
    for (const [sql] of state.execute.mock.calls) { expect(sql).toMatch(/^SELECT/); expect(sql).toContain('MAX_EXECUTION_TIME(20000)'); expect(sql).not.toMatch(/\bcode LIKE|\b(?:UPDATE|INSERT|DELETE|JOIN)\b/); }
  });
  it('keeps SQL null returns null and missing numeric fields invalid', async () => {
    mockRows({ ...row, meanReturn: null, totalAmount: null } as any);
    const [result] = await readAiFearGreedRows(state); expect(result.meanReturn).toBeNull(); expect(Number.isNaN(result.totalAmount)).toBe(true);
  });
  it('does not accept future source dates', async () => {
    state.execute.mockResolvedValueOnce([[{ latestDate: '20261127' }]]);
    await expect(readAiFearGreedRows(state, '20261126')).rejects.toThrow('Invalid source date'); expect(state.execute).toHaveBeenCalledTimes(1);
  });
  it('prefers verified official market history without raw full-market scans', async () => {
    mockRows(row, [verified]); const rows = await readAiFearGreedRows(state);
    expect(rows[0].meanReturn).toBe(-0.005013576326); expect(state.execute).toHaveBeenCalledTimes(2);
  });
  it('preserves pending calendar days as null instead of bridging gaps', async () => {
    mockRows(row, [verified, { ...verified, canonicaldate: '20261125', source: 'pending', source_hash: '0'.repeat(64), verified_at: null }]);
    const rows = await readAiFearGreedRows(state); expect(rows.map(x => x.canonicaldate)).toEqual(['2026-11-25', '2026-11-26']);
    expect(rows[0].meanReturn).toBeNull(); expect(rows[0].validCount).toBe(0);
  });
  it('rejects unverified or undersized cache observations', async () => {
    mockRows(row, [{ ...verified, rawCount: 999 }]); const rows = await readAiFearGreedRows(state); expect(rows[0].meanReturn).toBeNull();
  });
  it('appends later actual market dates rather than showing an old cached day as current', async () => {
    mockRows(row, [{ ...verified, canonicaldate: '20261125' }]); const rows = await readAiFearGreedRows(state);
    expect(rows.map(x => x.canonicaldate)).toEqual(['2026-11-25', '2026-11-26']); expect(state.execute).toHaveBeenCalledTimes(3);
    expect(state.execute.mock.calls[2][1]).toEqual(['20261126', '20261126']);
  });
  it('shares in-flight requests and caches honest insufficient results', async () => {
    mockRows(); const [a, b] = await Promise.all([getAiFearGreedIndex(), getAiFearGreedIndex()]);
    expect(a).toBe(b); expect(a.status).toBe('insufficient'); expect(a.score).toBeNull();
    expect(await getAiFearGreedIndex()).toBe(a); expect(state.execute).toHaveBeenCalledTimes(7);
  });
  it('never exposes database secrets and only caches failure for one minute', async () => {
    state.execute.mockRejectedValue(new Error('private SQL and secret connection details'));
    const result = await getAiFearGreedIndex(); expect(result.status).toBe('unavailable'); expect(JSON.stringify(result)).not.toMatch(/private|secret|connection details/);
    expect(result.factors.reduce((sum, f) => sum + f.weight, 0)).toBe(1);
    await getAiFearGreedIndex(); expect(state.execute).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60001); await getAiFearGreedIndex(); expect(state.execute).toHaveBeenCalledTimes(2);
  });
});
