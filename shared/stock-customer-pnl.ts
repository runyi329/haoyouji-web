/**
 * Sum already-valued customer-side P&L, never account-side stock gains.
 * Inputs use the same display currency and authoritative participation results
 * as the expanded details. Missing valuations must not silently become zero.
 */
export function summarizeStockCustomerPnl(
  floatingPnls: readonly (number | null | undefined)[],
  realizedPnls: readonly (number | null | undefined)[],
) {
  const sumPriced = (values: readonly (number | null | undefined)[]): number | null => {
    if (values.some((value) => value === null || value === undefined || !Number.isFinite(value))) return null;
    return values.reduce<number>((total, value) => total + (value as number), 0);
  };
  const floatingPnl = sumPriced(floatingPnls);
  const realizedPnl = sumPriced(realizedPnls);
  return {
    floatingPnl,
    realizedPnl,
    totalPnl: floatingPnl === null || realizedPnl === null ? null : floatingPnl + realizedPnl,
  };
}
