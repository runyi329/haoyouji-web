import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  getBeijingStockClock,
  getUnifiedStockCloseCandidateDates,
  getUnifiedStockClosePublishAt,
  getUnifiedStockCloseSnapshotDate,
  getUnifiedStockCloseVersion,
  isUnifiedStockClosePublicationComplete,
  isUnifiedStockCloseQuoteForDate,
  prioritizeUnifiedStockCloseCandidates,
  isUnifiedStockCloseReady,
  isUnifiedStockCloseRetryWindow,
  millisecondsUntilNextUnifiedStockClose,
  UNIFIED_STOCK_CLOSE_POLICY_VERSION,
  UNIFIED_STOCK_CLOSE_RETRY_INTERVAL_MS,
} from '../shared/stock-unified-close-policy';
import {
  getOvernightUsSessionDate,
  isStockMarketSession,
  previousStockMarketSession,
} from '../shared/stock-market-session';
const at = (dateTime: string) => new Date(`${dateTime}+08:00`);

describe('37 A-day 15:05 + overnight US policy (offline; no DB or capture)', () => {
  it('11/10 15:04 falls back to 11/9, 15:05 publishes 11/10 with exact Beijing timestamp', () => {
    expect(getUnifiedStockCloseSnapshotDate(at('2026-11-10T15:04:59'))).toBe('2026-11-09');
    expect(getUnifiedStockCloseSnapshotDate(at('2026-11-10T15:05:00'))).toBe('2026-11-10');
    expect(getUnifiedStockClosePublishAt('2026-11-10').toISOString()).toBe('2026-11-10T07:05:00.000Z');
    expect(isUnifiedStockCloseReady('2026-11-10', at('2026-11-10T15:04:59'))).toBe(false);
    expect(isUnifiedStockCloseReady('2026-11-10', at('2026-11-10T15:05:00'))).toBe(true);
  });
  it('Monday A D uses NY Friday; Tuesday uses Monday, never same-day night US', () => {
    expect(previousStockMarketSession('2026-11-09', 'A')).toBe('2026-11-06');
    expect(getOvernightUsSessionDate('2026-11-09')).toBe('2026-11-06');
    expect(getOvernightUsSessionDate('2026-11-10')).toBe('2026-11-09');
    expect(getUnifiedStockCloseSnapshotDate(at('2026-11-10T23:59:59'))).toBe('2026-11-10');
    expect(getUnifiedStockCloseSnapshotDate(at('2026-11-11T04:59:00'))).toBe('2026-11-10');
  });
  it('weekends create no new candidate, no retry, and next first attempt is Monday 15:05', () => {
    const saturday = at('2026-11-07T15:05:00');
    const sunday = at('2026-11-08T18:05:00');
    expect(getUnifiedStockCloseSnapshotDate(saturday)).toBe('2026-11-06');
    expect(getUnifiedStockCloseSnapshotDate(sunday)).toBe('2026-11-06');
    const candidates = getUnifiedStockCloseCandidateDates(sunday);
    expect(candidates).not.toContain('2026-11-07');
    expect(candidates).not.toContain('2026-11-08');
    expect(candidates.every(day => isStockMarketSession(day, 'A'))).toBe(true);
    expect(isUnifiedStockCloseReady('2026-11-07', sunday)).toBe(false);
    expect(isUnifiedStockCloseRetryWindow(saturday)).toBe(false);
    expect(getOvernightUsSessionDate('2026-11-07')).toBeNull();
    const next = new Date(saturday.getTime() + millisecondsUntilNextUnifiedStockClose(saturday));
    expect(next.toISOString()).toBe(getUnifiedStockClosePublishAt('2026-11-09').toISOString());
  });
  it('US MLK and Thanksgiving holidays strictly fall back; early-close session remains a session', () => {
    expect(isStockMarketSession('2026-01-19', 'US')).toBe(false);
    expect(isStockMarketSession('2026-01-19', 'A')).toBe(true);
    expect(getOvernightUsSessionDate('2026-01-20')).toBe('2026-01-16');
    expect(isStockMarketSession('2026-11-26', 'US')).toBe(false);
    expect(getOvernightUsSessionDate('2026-11-27')).toBe('2026-11-25');
    expect(isStockMarketSession('2026-11-27', 'US')).toBe(true);
  });
  it('A National Day gap carries accumulated US changes to next A date, no holiday snapshot', () => {
    const duringHoliday = at('2026-10-06T20:00:00');
    expect(isStockMarketSession('2026-10-06', 'A')).toBe(false);
    expect(isStockMarketSession('2026-10-06', 'US')).toBe(true);
    expect(getUnifiedStockCloseSnapshotDate(duringHoliday)).toBe('2026-09-30');
    expect(previousStockMarketSession('2026-10-08', 'A')).toBe('2026-09-30');
    expect(getOvernightUsSessionDate('2026-10-08')).toBe('2026-10-07');
    const candidates = getUnifiedStockCloseCandidateDates(at('2026-10-08T15:05:00'));
    expect(candidates).toContain('2026-09-30');
    expect(candidates).toContain('2026-10-08');
    expect(candidates.some(day => day >= '2026-10-01' && day <= '2026-10-07')).toBe(false);
  });
  it('startup candidates are bounded, chronological, A-only and already due', () => {
    const now = at('2026-11-10T15:04:00');
    const candidates = getUnifiedStockCloseCandidateDates(now, 4);
    expect(candidates).toEqual(['2026-11-06', '2026-11-09']);
    expect(candidates.every(day => isUnifiedStockCloseReady(day, now))).toBe(true);
    expect(() => getUnifiedStockCloseCandidateDates(now, 0)).toThrow();
    expect(() => getUnifiedStockCloseCandidateDates(now, 367)).toThrow();
  });
  it('prioritizes today after 15:05 while preserving bounded historical dates and caller input', () => {
    const days = ['2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11'];
    expect(prioritizeUnifiedStockCloseCandidates(days, at('2026-11-11T15:05:00')))
      .toEqual(['2026-11-11', '2026-11-06', '2026-11-09', '2026-11-10']);
    expect(days).toEqual(['2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11']);
    expect(prioritizeUnifiedStockCloseCandidates(days.slice(0, 3), at('2026-11-11T15:04:59')))
      .toEqual(days.slice(0, 3));
    expect(prioritizeUnifiedStockCloseCandidates(['2026-11-10', '2026-11-09'], at('2026-11-14T15:05:00')))
      .toEqual(['2026-11-09', '2026-11-10']);
  });
  it('daily first attempt uses default bounded 14-day candidates and delegates published dates to publisher', () => {
    const now = at('2026-11-10T15:05:00');
    const candidates = getUnifiedStockCloseCandidateDates(now);
    expect(candidates).toEqual(getUnifiedStockCloseCandidateDates(now, 14));
    expect(candidates.length).toBeLessThanOrEqual(14);
    expect(candidates).toContain('2026-11-09');
    expect(candidates.at(-1)).toBe('2026-11-10');
    expect(candidates).toEqual([...candidates].sort());
    expect(candidates.every(date => isUnifiedStockCloseReady(date, now))).toBe(true);
    const source = readFileSync(new URL('./manual-stock-close-scheduler.ts', import.meta.url), 'utf8');
    const daily = source.slice(source.indexOf('function scheduleNextUnifiedStockClose'), source.indexOf('function isBeijingTradingWindow'));
    expect(daily).toContain('await runUnifiedStockCloseWithRetry();');
    expect(daily).not.toContain('runUnifiedStockCloseWithRetry(getBeijingStockClock(now).date)');
    const publication = source.slice(source.indexOf('async function refreshUnifiedStockCloseCandidates'), source.indexOf('function scheduleUnifiedStockCloseRetry'));
    expect(publication).toContain(': getUnifiedStockCloseCandidateDates(now);');
    expect(publication).toContain('await refreshLedgerStockTagCloseSnapshots({ snapshotDate });');
    expect(publication).not.toMatch(/SELECT\s+1\s+FROM\s+ledger_stock_unified_close_publications|\bpublished\s+as\s+any\[\]/);
    expect(publication).toContain('INSERT IGNORE INTO ledger_stock_unified_close_publications');
    expect(publication).not.toMatch(/UPDATE\s+ledger_stock_unified_close_publications|DELETE\s+FROM/);
  });
  it('scheduler reuses one bounded 5-minute timer and retries only the current date, not all 14 days', () => {
    const source = readFileSync(new URL('./manual-stock-close-scheduler.ts', import.meta.url), 'utf8');
    expect(source).toContain('const UNIFIED_STOCK_CLOSE_SCHEDULER_RETRY_INTERVAL_MS = 5 * 60 * 1000;');
    const retry = source.slice(source.indexOf('function scheduleUnifiedStockCloseRetry'), source.indexOf('async function runUnifiedStockCloseWithRetry'));
    expect(retry).toContain('if (unifiedCloseRetryTimer || !isUnifiedStockCloseRetryWindow(now)');
    expect(retry).toContain('if (!isUnifiedStockCloseRetryWindow(nextAttempt)) return;');
    expect(retry).toContain('void runUnifiedStockCloseWithRetry(snapshotDate);');
    expect(retry).toContain('}, UNIFIED_STOCK_CLOSE_SCHEDULER_RETRY_INTERVAL_MS);');
    const publication = source.slice(source.indexOf('async function refreshUnifiedStockCloseCandidates'), source.indexOf('function scheduleUnifiedStockCloseRetry'));
    expect(publication).toContain('? [retrySnapshotDate].filter(date => date === getBeijingStockClock(now).date');
    expect(publication).toContain('&& isUnifiedStockCloseRetryWindow(now) && isUnifiedStockCloseReady(date, now)');
    const first = at('2026-11-10T15:05:00').getTime();
    const end = at('2026-11-10T18:05:00').getTime();
    const interval = 5 * 60 * 1000;
    const attempts = Array.from({ length: (end - first) / interval + 1 }, (_, i) => new Date(first + i * interval));
    expect(attempts.length).toBe(37);
    expect(attempts.every(isUnifiedStockCloseRetryWindow)).toBe(true);
    expect(isUnifiedStockCloseRetryWindow(new Date(end + interval))).toBe(false);
  });
  it('shared 15-minute helper remains unchanged; date/version and finite retry window are stable', () => {
    expect(UNIFIED_STOCK_CLOSE_RETRY_INTERVAL_MS).toBe(900000);
    expect(isUnifiedStockCloseRetryWindow(at('2026-11-10T15:04:59'))).toBe(false);
    expect(isUnifiedStockCloseRetryWindow(at('2026-11-10T15:05:00'))).toBe(true);
    expect(isUnifiedStockCloseRetryWindow(at('2026-11-10T18:05:00'))).toBe(true);
    expect(isUnifiedStockCloseRetryWindow(at('2026-11-10T18:06:00'))).toBe(false);
    const first = at('2026-11-10T15:05:00').getTime();
    const attempts = Array.from({ length: 13 }, (_, i) => new Date(first + i * UNIFIED_STOCK_CLOSE_RETRY_INTERVAL_MS));
    expect(new Set(attempts.map(now => getUnifiedStockCloseVersion(getUnifiedStockCloseSnapshotDate(now)))).size).toBe(1);
    expect(attempts.every(isUnifiedStockCloseRetryWindow)).toBe(true);
    expect(getBeijingStockClock(at('2026-11-10T18:05:00')).minutes).toBe(1085);
  });
  it('new publication version rejects legacy completion and accepts exact idempotent saved categories', () => {
    const date = '2026-11-10';
    expect(UNIFIED_STOCK_CLOSE_POLICY_VERSION).toBe('cn-day-us-overnight-1505-v1');
    const result = { categories: 2, symbols: 3, updated: 0, complete: true, publishedCategories: 0,
      alreadyPublishedCategories: 2, skippedCategories: 0, snapshotDate: date, version: getUnifiedStockCloseVersion(date) };
    expect(isUnifiedStockClosePublicationComplete(result, date)).toBe(true);
    expect(isUnifiedStockClosePublicationComplete({ ...result, version: `cn-us-regular-close-v1:${date}` }, date)).toBe(false);
    expect(isUnifiedStockClosePublicationComplete({ ...result, alreadyPublishedCategories: 1 }, date)).toBe(false);
    expect(isUnifiedStockClosePublicationComplete({ ...result, skippedCategories: 1 }, date)).toBe(false);
    expect(isUnifiedStockClosePublicationComplete({ ...result, snapshotDate: '2026-11-07', version: getUnifiedStockCloseVersion('2026-11-07') }, '2026-11-07')).toBe(false);
  });
  it('quote evidence retains actual NY session date and rejects conflicting aliases', () => {
    const usDate = getOvernightUsSessionDate('2026-11-10')!;
    const raw = Object.freeze({ price: 50, priceDate: usDate, date: usDate });
    expect(isUnifiedStockCloseQuoteForDate(raw, usDate)).toBe(true);
    expect(isUnifiedStockCloseQuoteForDate(raw, '2026-11-10')).toBe(false);
    expect(isUnifiedStockCloseQuoteForDate({ ...raw, date: '2026-11-10' }, usDate)).toBe(false);
    expect(raw.priceDate).toBe('2026-11-09');
    expect(previousStockMarketSession('invalid', 'US')).toBeNull();
    expect(isStockMarketSession('2026-02-30', 'A')).toBe(false);
  });
  it('scheduler preserves 52 sampling and reference quotes; retry date is bound and old time absent', () => {
    const source = readFileSync(new URL('./manual-stock-close-scheduler.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/06:15|09:15/);
    expect(source).toContain('refreshUnifiedStockCloseCandidates(now, retrySnapshotDate)');
    expect(source).toContain('runUnifiedStockCloseWithRetry(snapshotDate)');
    expect(source).toContain('getBeijingStockClock(now).date !== snapshotDate');
    expect(source).toContain('scheduleNextManualStockClose();');
    expect(source).toContain('refreshLedgerStockTagIntradaySnapshots(),');
    expect(source).toContain('clock.minutes >= 16 * 60');
    expect(source).not.toContain('UPDATE ledger_stock_unified_close_prices');
    const publication = source.slice(source.indexOf('async function refreshUnifiedStockCloseCandidates'), source.indexOf('function scheduleUnifiedStockCloseRetry'));
    expect(publication).toContain('await warmAllStockTagCalendarResults();');
    expect(publication).toContain('for (const snapshotDate of prioritizeUnifiedStockCloseCandidates(candidates, now))');
    expect(publication).toContain('if (snapshotDate === getBeijingStockClock(now).date) await warmAllStockTagCalendarResults();');
    const intraday = source.slice(source.indexOf('function scheduleNextManualStockIntradayRefresh'), source.indexOf('function refreshIntradayQuotesOnStartup'));
    expect(intraday).not.toContain('refreshLedgerStockTagCloseSnapshots');
    expect(intraday).not.toContain('warmAllStockTagCalendarResults');
    expect(intraday).toContain('await captureStockUsdCnyBeforeClose()');
    expect(intraday.indexOf('await captureStockUsdCnyBeforeClose()')).toBeLessThan(intraday.indexOf('refreshManualStockIntradaySnapshots()'));
  });
});
