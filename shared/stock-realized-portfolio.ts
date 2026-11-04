const STOCK_QUANTITY_EPSILON = 1e-8;

type OptionalNumber = number | null | undefined;

/** Original member-side participation fields, before presentation or FX conversion. */
export interface StockMemberParticipation {
  lotId: OptionalNumber;
  id: OptionalNumber;
  symbol: string;
  stockName: string;
  openedAt: string | null;
  startDate: string;
  allocatedQuantity?: OptionalNumber;
  remainingQuantity?: OptionalNumber;
  closedQuantity?: OptionalNumber;
  closedValue?: OptionalNumber;
  closedAt?: string | null;
  entryPrice?: OptionalNumber;
  realizedPnl?: OptionalNumber;
}

export interface StockMemberRealizedLot {
  lotId: OptionalNumber;
  participationId: OptionalNumber;
  symbol: string;
  stockName: string;
  currency: 'CNY' | 'USD';
  openedAt: string | null;
  startDate: string;
  soldAt: string | null;
  initialQuantity: number | null;
  soldQuantity: number;
  unitCost: number | null;
  buyValue: number | null;
  sellValue: number | null;
  realizedPnl: number | null;
  sellPrice: number | null;
}

function isFiniteNumber(value: OptionalNumber): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteOrNull(value: OptionalNumber): number | null {
  return isFiniteNumber(value) ? value : null;
}

/** Activity depends on holdings/closures, including completely closed, break-even customers. */
export function hasStockCustomerActivity(
  currentPositionCount: number,
  closedQuantities: readonly OptionalNumber[],
): boolean {
  return currentPositionCount > 0 || closedQuantities.some(
    (quantity) => isFiniteNumber(quantity) && quantity > STOCK_QUANTITY_EPSILON,
  );
}

/**
 * Freeze only the sold member-side share of each eligible participation.
 * Partial and complete closures use the same source; do not append legacy
 * closedLots to this result. Authoritative realized P&L is never reconstructed
 * from prices, remaining holdings, account P&L, or a currency conversion.
 * Dates are normalized YYYY-MM-DD strings, as provided by the backend.
 */
export function buildStockMemberRealizedLots(
  participations: readonly StockMemberParticipation[],
  today: string,
): StockMemberRealizedLot[] {
  return participations
    .filter((item) => item.startDate <= today
      && isFiniteNumber(item.closedQuantity)
      && item.closedQuantity > STOCK_QUANTITY_EPSILON)
    .map<StockMemberRealizedLot>((item) => {
      // The filter guarantees a finite, strictly positive divisor.
      const soldQuantity = item.closedQuantity as number;
      const unitCost = finiteOrNull(item.entryPrice);
      const sellValue = finiteOrNull(item.closedValue);
      return {
        lotId: item.lotId,
        participationId: item.id,
        symbol: item.symbol,
        stockName: item.stockName,
        currency: /^\d{6}\.(SH|SZ|BJ)$/i.test(item.symbol) ? 'CNY' : 'USD',
        openedAt: item.openedAt,
        startDate: item.startDate,
        soldAt: item.closedAt ?? null,
        initialQuantity: finiteOrNull(item.allocatedQuantity),
        soldQuantity,
        unitCost,
        buyValue: unitCost === null ? null : finiteOrNull(soldQuantity * unitCost),
        sellValue,
        realizedPnl: finiteOrNull(item.realizedPnl),
        sellPrice: sellValue === null ? null : finiteOrNull(sellValue / soldQuantity),
      };
    });
}
