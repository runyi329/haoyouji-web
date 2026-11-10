import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  millisecondsUntilStockCalendarWake,
  STOCK_CALENDAR_GC_MS,
  STOCK_CALENDAR_RETRY_MS,
  stockCalendarExpectedVersion,
  stockCalendarHasExpectedClose,
  stockCalendarPrefetchBlocked,
  stockCalendarQueryOptions,
  stockCalendarStaleTime,
} from './ledger-stock-calendar-cache';

const identity = { ledgerId: 37, userId: 870413, targetUserId: 11, viewAsUserId: 11 };
const at = (clock: string) => new Date(clock);

test('query keys isolate ledger, authenticated identity, target, viewAs and tag', () => {
  const read = async () => [];
  const options = stockCalendarQueryOptions(identity, 101, read);
  for (const changed of [{ ledgerId: 38 }, { userId: 28 }, { targetUserId: 12 }, { viewAsUserId: null }]) {
    assert.notDeepEqual(stockCalendarQueryOptions({ ...identity, ...changed }, 101, read).queryKey, options.queryKey);
  }
  assert.notDeepEqual(stockCalendarQueryOptions(identity, 102, read).queryKey, options.queryKey);
  assert.equal(options.gcTime, STOCK_CALENDAR_GC_MS);
  assert.equal(options.refetchOnMount, true);
  assert.equal(options.refetchOnWindowFocus, true);
  assert.equal(options.retry, false);
  assert.equal(options.placeholderData, undefined);
});

test('authorization failures stop prefetch; temporary publication/network failures may recover', () => {
  assert.equal(stockCalendarPrefetchBlocked({ data: { code: 'FORBIDDEN' } }), true);
  assert.equal(stockCalendarPrefetchBlocked(new Error('该股票标签尚未对您开放')), true);
  assert.equal(stockCalendarPrefetchBlocked(new Error('数据库连接不可用')), false);
  assert.equal(stockCalendarPrefetchBlocked(new Error('Failed to fetch')), false);
});

test('homepage prefetch and selected query deduplicate; invalidation retains own history, never other tag', async () => {
  const client = new QueryClient();
  let calls = 0;
  let finish!: (rows: { snapshotDate: string }[]) => void;
  const read = () => { calls++; return new Promise<{ snapshotDate: string }[]>(resolve => { finish = resolve; }); };
  const options = stockCalendarQueryOptions(identity, 101, read);
  const first = client.prefetchQuery(options);
  const second = client.fetchQuery(stockCalendarQueryOptions(identity, 101, read));
  assert.equal(calls, 1);
  const history = [{ snapshotDate: '2026-11-09' }];
  finish(history);
  await Promise.all([first, second]);
  await client.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: 'none' });
  assert.deepEqual(client.getQueryData(options.queryKey), history);
  const observer = new QueryObserver(client, options);
  assert.deepEqual(observer.getCurrentResult().data, history);
  observer.setOptions(stockCalendarQueryOptions(identity, 102, read));
  assert.equal(observer.getCurrentResult().data, undefined);
  observer.setOptions(stockCalendarQueryOptions({ ...identity, userId: 28 }, 101, read));
  assert.equal(observer.getCurrentResult().data, undefined);
  observer.destroy();
  client.clear();
});

test('version changes at Beijing A-day 15:05 and skips weekend/holiday', () => {
  assert.match(stockCalendarExpectedVersion(at('2026-11-10T15:04:59+08:00')), /:2026-11-09$/);
  assert.match(stockCalendarExpectedVersion(at('2026-11-10T15:05:00+08:00')), /:2026-11-10$/);
  assert.equal(millisecondsUntilStockCalendarWake(at('2026-11-10T15:04:59+08:00')), 1_000);
  assert.equal(millisecondsUntilStockCalendarWake(at('2026-10-01T12:00:00+08:00')),
    at('2026-10-08T15:05:00+08:00').getTime() - at('2026-10-01T12:00:00+08:00').getTime());
  assert.equal(millisecondsUntilStockCalendarWake(at('2026-11-13T18:06:00+08:00')),
    at('2026-11-16T15:05:00+08:00').getTime() - at('2026-11-13T18:06:00+08:00').getTime());
});

test('late publication checks only missing/unpriced current point every five minutes, ending at 18:05', () => {
  const now = at('2026-11-10T15:05:00+08:00');
  const ready = [{ snapshotDate: '2026-11-10', ready: true, priced: true, totalPnl: 0 }];
  assert.equal(stockCalendarHasExpectedClose(ready, now), true);
  assert.equal(stockCalendarHasExpectedClose([{ ...ready[0], priced: false }], now), false);
  assert.equal(stockCalendarHasExpectedClose([{ ...ready[0], snapshotDate: '2026-11-09' }], now), false);
  assert.equal(stockCalendarStaleTime(37, now.getTime(), []), STOCK_CALENDAR_RETRY_MS);
  assert.equal(stockCalendarStaleTime(37, now.getTime(), ready),
    at('2026-11-11T15:05:00+08:00').getTime() - now.getTime());
  assert.equal(millisecondsUntilStockCalendarWake(now), STOCK_CALENDAR_RETRY_MS);
  assert.equal(millisecondsUntilStockCalendarWake(at('2026-11-10T18:00:00+08:00')), STOCK_CALENDAR_RETRY_MS);
  assert.equal(millisecondsUntilStockCalendarWake(at('2026-11-10T18:05:00+08:00')),
    at('2026-11-11T15:05:00+08:00').getTime() - at('2026-11-10T18:05:00+08:00').getTime());
});
