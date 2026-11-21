import { parsePortfolioTradeTime } from '../shared/crypto-portfolio-policy';
import { isStockMarketSession } from '../shared/stock-market-session';
import { UNIFIED_STOCK_CLOSE_POLICY_VERSION } from '../shared/stock-unified-close-policy';
import type { StockUsdCnyClosePoint } from './stock-usd-cny-rate';

const MAX_GAP_MS = 30 * 60_000;
const cutoffMs = (date: string) => Date.parse(`${date}T15:05:00+08:00`);
const positiveRate = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string' || typeof value === 'string' && !value.trim()) return null;
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 && rate < 100 ? rate : null;
};
function timestamp(value: unknown): number {
  if (typeof value !== 'string') return Number.NaN;
  try { return parsePortfolioTradeTime(value).getTime(); } catch { return Number.NaN; }
}

/** Pure evidence validation, also applied to injected/upstream legs. No DB/router/scanner imports. */
export function validateCryptoUsdCnyClosePoint(value: unknown, anchor: string, now = Date.now()): StockUsdCnyClosePoint | null {
  const point = value as Partial<StockUsdCnyClosePoint> | null;
  if (!point || !isStockMarketSession(anchor, 'A') || !Number.isFinite(now)
    || point.pair !== 'USD/CNY' || point.snapshotDate !== anchor
    || !['sina_usdcny', 'yahoo_usdcny_5m'].includes(point.source ?? '')) return null;
  const rate = positiveRate(point.usdCnyRate), cutoff = cutoffMs(anchor);
  const asOf = timestamp(point.asOf), lockedAt = timestamp(point.lockedAt);
  if (rate === null || cutoff > now || !Number.isFinite(asOf) || !Number.isFinite(lockedAt)
    || asOf > now || lockedAt > now || asOf > cutoff || cutoff - asOf > MAX_GAP_MS || lockedAt !== cutoff) return null;
  return { snapshotDate: anchor, usdCnyRate: rate, asOf: new Date(asOf).toISOString(),
    source: point.source as StockUsdCnyClosePoint['source'], pair: 'USD/CNY', lockedAt: new Date(lockedAt).toISOString() };
}

/** SQL must return actual scope/date/policy fields; never fill them from requested parameters.
 * pair is the fixed USD/CNY table's schema meaning (SQL literal), not a USDT quote.
 * A duplicate/conflicting row set is not evidence; do not select an arbitrary source.
 */
export function validateCryptoSavedUsdAnchor(rows: readonly unknown[], scope: { ledgerId: number; categoryId: number; anchor: string }, now = Date.now()): StockUsdCnyClosePoint | null {
  if (scope.ledgerId !== 37 || !Number.isSafeInteger(scope.categoryId) || scope.categoryId <= 0 || rows.length !== 1) return null;
  const row = rows[0] as Record<string, unknown> | null;
  if (!row || Number(row.ledger_id) !== scope.ledgerId || Number(row.category_id) !== scope.categoryId
    || row.snapshot_date !== scope.anchor || row.policy_version !== UNIFIED_STOCK_CLOSE_POLICY_VERSION) return null;
  return validateCryptoUsdCnyClosePoint({ snapshotDate: row.snapshot_date, usdCnyRate: row.usd_cny_rate,
    source: row.source, asOf: row.as_of, lockedAt: row.locked_at, pair: row.pair }, scope.anchor, now);
}
