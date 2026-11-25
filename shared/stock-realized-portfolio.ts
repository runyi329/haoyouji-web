import { portfolioCurrency } from './portfolio-instruments';

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
  closedBuyValueCny?: OptionalNumber;
  closedSellValueCny?: OptionalNumber;
  realizedPnlCny?: OptionalNumber;
  closedFxLocked?: boolean;
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
  buyValueCny: number | null;
  sellValueCny: number | null;
  realizedPnlCny: number | null;
  fxLocked: boolean;
}

function isFiniteNumber(value: OptionalNumber): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function finiteOrNull(value: OptionalNumber): number | null {
  return isFiniteNumber(value) ? value : null;
}

/**
 * CNY uses its known native amount; foreign currencies require a finite frozen
 * CNY field and must not be explicitly unlocked. Native zero can aggregate
 * closures at different rates into nonzero CNY, so it never substitutes for a
 * frozen amount. Unknown native amounts stay unknown; today's FX is never used.
 */
export function stockRealizedValueCny(
  lot: { symbol: string; fxLocked?: boolean } & Partial<Record<
    'buyValue' | 'sellValue' | 'realizedPnl' | 'accountNetProfit'
    | 'buyValueCny' | 'sellValueCny' | 'realizedPnlCny' | 'accountNetProfitCny', unknown>>,
  field: 'buyValue' | 'sellValue' | 'realizedPnl' | 'accountNetProfit',
): number | null {
  const native = finiteOrNull(lot[field] as OptionalNumber);
  if (native === null) return null;
  if (portfolioCurrency(lot.symbol) === 'CNY') return native;
  if (lot.fxLocked === false) return null;
  return finiteOrNull(lot[`${field}Cny`] as OptionalNumber);
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
      const soldQuantity = item.closedQuantity as number;
      const unitCost = finiteOrNull(item.entryPrice);
      const sellValue = finiteOrNull(item.closedValue);
      const currency = /^\d{6}\.(SH|SZ|BJ)$/i.test(item.symbol) ? 'CNY' : 'USD';
      const buyValue = unitCost === null ? null : finiteOrNull(soldQuantity * unitCost);
      const realizedPnl = finiteOrNull(item.realizedPnl);
      return {
        lotId: item.lotId,
        participationId: item.id,
        symbol: item.symbol,
        stockName: item.stockName,
        currency,
        openedAt: item.openedAt,
        startDate: item.startDate,
        soldAt: item.closedAt ?? null,
        initialQuantity: finiteOrNull(item.allocatedQuantity),
        soldQuantity,
        unitCost,
        buyValue,
        sellValue,
        realizedPnl,
        sellPrice: sellValue === null ? null : finiteOrNull(sellValue / soldQuantity),
        buyValueCny: currency === 'CNY' ? buyValue : finiteOrNull(item.closedBuyValueCny),
        sellValueCny: currency === 'CNY' ? sellValue : finiteOrNull(item.closedSellValueCny),
        realizedPnlCny: currency === 'CNY' ? realizedPnl : finiteOrNull(item.realizedPnlCny),
        fxLocked: currency === 'CNY' || item.closedFxLocked === true,
      };
    });
}
