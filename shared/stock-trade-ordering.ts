type StockEventType = 'buy' | 'add' | 'reduce' | 'sell' | 'note';

/**
 * Screen numbers are temporary list positions, not security IDs or lot IDs.
 * A new buy creates an independent lot; a sale selected by its actual stored
 * lot ID consumes only that holding. Neither depends on other lots of the
 * same stock. Preserve the historical FIFO guard for unscoped operations.
 */
export function requiresStockTradeOrderCheck(
  eventType: StockEventType,
  correctsEventId?: number | null,
  lotId?: number | null,
): boolean {
  const selectedHoldingSale = eventType === 'sell' && typeof lotId === 'number' && Number.isInteger(lotId) && lotId > 0;
  return eventType !== 'buy' && !selectedHoldingSale && !correctsEventId;
}

function beijingTradingDate(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const getPart = (type: string) => parts.find(part => part.type === type)?.value;
  return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
}

/** Sales use a date-only input; noon is not the actual intraday execution time. */
export function isStockLotSaleDateValid(soldAt: Date | string, openedAt: Date | string): boolean {
  const saleDate = beijingTradingDate(soldAt);
  const openingDate = beijingTradingDate(openedAt);
  return saleDate !== null && openingDate !== null && saleDate >= openingDate;
}
