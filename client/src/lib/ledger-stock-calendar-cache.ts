import { queryOptions } from '@tanstack/react-query';
import {
  getBeijingStockClock,
  getUnifiedStockCloseSnapshotDate,
  getUnifiedStockCloseVersion,
  isUnifiedStockCloseRetryWindow,
  millisecondsUntilNextUnifiedStockClose,
  UNIFIED_STOCK_CLOSE_RETRY_END_MINUTE,
} from '@shared/stock-unified-close-policy';

export const STOCK_CALENDAR_RETRY_MS = 5 * 60 * 1000;
export const STOCK_CALENDAR_GC_MS = 60 * 60 * 1000;
export type StockCalendarCacheIdentity = {
  ledgerId: number;
  userId: number;
  targetUserId: number;
  viewAsUserId: number | null;
};
type CalendarPublicationPoint = { snapshotDate?: string; ready?: boolean; priced?: boolean; totalPnl?: unknown };

// Version is an invalidation epoch, NOT another query-key segment: retaining the
// same identity × category query preserves historical points during publication.
// The unchanged array response has no publication version; a ready current-day
// point confirms its availability, not an invented backend publication receipt.
export function stockCalendarExpectedVersion(now = new Date()) {
  return getUnifiedStockCloseVersion(getUnifiedStockCloseSnapshotDate(now));
}

export function stockCalendarHasExpectedClose(rows: unknown, now = new Date()): boolean {
  const expectedDate = getUnifiedStockCloseSnapshotDate(now);
  return Array.isArray(rows) && rows.some((row: CalendarPublicationPoint) => row?.snapshotDate === expectedDate
    && row.priced === true && row.ready !== false
    && row.totalPnl !== null && row.totalPnl !== undefined && Number.isFinite(Number(row.totalPnl)));
}

export function stockCalendarStaleTime(ledgerId: number, updatedAt: number, rows: unknown): number {
  if (ledgerId !== 37 || !updatedAt) return STOCK_CALENDAR_RETRY_MS;
  const updated = new Date(updatedAt);
  if (isUnifiedStockCloseRetryWindow(updated) && !stockCalendarHasExpectedClose(rows, updated)) {
    return STOCK_CALENDAR_RETRY_MS;
  }
  return millisecondsUntilNextUnifiedStockClose(updated);
}

export function stockCalendarPrefetchBlocked(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { data?: { code?: string }; message?: string };
  return ['FORBIDDEN', 'UNAUTHORIZED'].includes(failure.data?.code ?? '')
    || /尚未对您开放|无权|无权限|没有权限|权限不足|未登录|视角已切换/.test(failure.message ?? '');
}

export function stockCalendarQueryOptions<T>(
  identity: StockCalendarCacheIdentity,
  categoryId: number,
  read: (input: { ledgerId: number; categoryId: number }, signal: AbortSignal) => Promise<T>,
) {
  return queryOptions({
    queryKey: ['ledger-aa-stock', identity.ledgerId, identity.userId, identity.targetUserId, identity.viewAsUserId,
      identity.ledgerId === 37 ? 'tag-total-calendar' : 'snapshots', categoryId] as const,
    queryFn: ({ signal }) => read({ ledgerId: identity.ledgerId, categoryId }, signal),
    staleTime: (query) => stockCalendarStaleTime(identity.ledgerId, query.state.dataUpdatedAt, query.state.data),
    gcTime: STOCK_CALENDAR_GC_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    // The server checks eligibility. Ineligible early-prefetch errors must not
    // fan out automatic retries; a later visibility/identity change can try anew.
    retry: false,
    placeholderData: undefined,
  });
}

// One timeout chain for both next real A-session 15:05 and late-publication
// reads. No polling outside the 15:05–18:05 window; no weekend/holiday timer.
export function millisecondsUntilStockCalendarWake(now = new Date()): number {
  const boundary = millisecondsUntilNextUnifiedStockClose(now);
  if (!isUnifiedStockCloseRetryWindow(now)) return boundary;
  const { date } = getBeijingStockClock(now);
  const retryEnd = new Date(`${date}T${String(Math.floor(UNIFIED_STOCK_CLOSE_RETRY_END_MINUTE / 60)).padStart(2, '0')}:${String(UNIFIED_STOCK_CLOSE_RETRY_END_MINUTE % 60).padStart(2, '0')}:00+08:00`).getTime();
  const nextRetry = (Math.floor(now.getTime() / STOCK_CALENDAR_RETRY_MS) + 1) * STOCK_CALENDAR_RETRY_MS;
  return nextRetry <= retryEnd ? Math.min(boundary, nextRetry - now.getTime()) : boundary;
}
