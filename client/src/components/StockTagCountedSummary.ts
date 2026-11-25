export type StockTagCountedFields = {
  countedMarketValue?: number | null;
  countedFloatingPnl?: number | null;
};
export type StockTagServerSummary = {
  costValue?: number | null;
  marketValue?: number | null;
  floatingPnl?: number | null;
  totalPnl?: number | null;
  realizedPnl?: number | null;
};

/** Missing fields may fall back for old servers; explicit null and 0 must never become raw values. */
export function stockTagCountedValue(counted: number | null | undefined, raw: number | null): number | null {
  return counted === undefined ? raw : counted === null || !Number.isFinite(counted) ? null : counted;
}

export function stockTagServerAggregate(summary: StockTagServerSummary | null | undefined, field: keyof StockTagServerSummary, fallback: number | null): number | null {
  return stockTagCountedValue(summary?.[field], fallback);
}

/** Use this per lot (not its parent symbol total) before any filtered sum. */
export function stockTagCountedLotValues(lot: StockTagCountedFields, rawMarketValue: number | null, rawFloatingPnl: number | null) {
  return {
    marketValue: stockTagCountedValue(lot.countedMarketValue, rawMarketValue),
    floatingPnl: stockTagCountedValue(lot.countedFloatingPnl, rawFloatingPnl),
  };
}

/** Legacy member DTOs have quantity/entryPrice but no per-lot PnL fields.
 * Only absent fields permit reconstruction; explicit pending/null is never replaced.
 * Use this member's exact remaining quantity and entry, not the tag total or another member.
 */
export function stockTagCountedMemberFloatingPnl(source: StockTagCountedFields & {
  floatingPnl?: number | null; remainingQuantity?: number | null; quantity?: number | null;
  entryPrice?: number | null; unitCost?: number | null;
}, rawMarketPrice: number | null): number | null {
  if (source.countedFloatingPnl !== undefined) return stockTagCountedValue(source.countedFloatingPnl, null);
  if (source.floatingPnl !== undefined) return stockTagCountedValue(source.floatingPnl, null);
  const quantity = source.remainingQuantity === undefined ? source.quantity : source.remainingQuantity;
  const entry = source.entryPrice === undefined ? source.unitCost : source.entryPrice;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) return null;
  if (quantity === 0) return 0;
  if (typeof entry !== 'number' || !Number.isFinite(entry) || entry <= 0
    || typeof rawMarketPrice !== 'number' || !Number.isFinite(rawMarketPrice) || rawMarketPrice <= 0) return null;
  return stockTagCountedValue(quantity * (entry - rawMarketPrice), null);
}

/** Aggregate only: details keep their immutable real close/FX figures. Never revalue a foreign close at live FX. */
export function stockTagCountedHistoricalPnl(source: {
  countedRealizedPnl?: number | null; countedRealizedPnlCny?: number | null;
  countedAccountNetProfit?: number | null; countedAccountNetProfitCny?: number | null;
  fxLocked?: boolean; closedFxLocked?: boolean;
}, field: 'realizedPnl' | 'accountNetProfit', currency: 'CNY' | 'USD' | 'USDT', raw: number | null): number | null {
  const native = field === 'realizedPnl' ? source.countedRealizedPnl : source.countedAccountNetProfit;
  const frozenCny = field === 'realizedPnl' ? source.countedRealizedPnlCny : source.countedAccountNetProfitCny;
  if (native === undefined && frozenCny === undefined) return raw;
  if (currency === 'CNY') return stockTagCountedValue(native, raw);
  if (source.fxLocked === false || source.closedFxLocked === false) return null;
  return stockTagCountedValue(frozenCny, null);
}
