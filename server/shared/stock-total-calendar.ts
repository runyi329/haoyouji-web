import {
  buildMemberStockCalendar,
  memberCalendarMarket,
  type MemberCalendarClosure,
  type MemberCalendarFx,
  type MemberCalendarParticipation,
  type MemberCalendarQuote,
  type MemberCalendarSnapshot,
} from './stock-member-calendar';
import { isStockSessionDate } from '../../shared/stock-unified-close-policy';

// Keep identical to ledger-stock-portfolio.ts/getSoldLots; importing that DB module
// would make this otherwise offline reconstruction depend on infrastructure.
const STOCK_TRADE_FEE_RATE = 0.001;

export type TotalCalendarLot = {
  id: number;
  symbol: string;
  initialQuantity: number;
  /** Actual holding price, excluding the opening transaction fee. */
  unitCost: number;
  openingFee: number | null;
  /** Actual exchange opening date (NY for US), never registration/effective date. */
  openedDate: string | null;
};

export type TotalCalendarSale = {
  lotId: number;
  quantity: number;
  salePrice: number;
  transactionFee: number | null;
  /** Whole sell-event quantity, not this lot's allocated sold quantity. */
  eventQuantity: number;
  closeDate: string | null;
};

export type TotalCalendarSnapshot = MemberCalendarSnapshot & { scope: 'tag-total' };
export type TotalCalendarInput = {
  /** All physical lots, including fully sold lots; no member allocations. */
  lots: readonly TotalCalendarLot[];
  /** All active global reduce/sell allocations for those lots. */
  sales: readonly TotalCalendarSale[];
  quotes: readonly MemberCalendarQuote[];
  fx: readonly MemberCalendarFx[];
  now?: Date;
};

const reversePnl = (value: number | null): number | null => value === null ? null : value === 0 ? 0 : -value;

/**
 * Global physical stock return. Reuse the member engine's verified A-day /
 * overnight-US / exact-day-FX reconstruction, reversing its counterparty PnL.
 * Buy fees accrue only to the actual sales' closeDate (legacy sales have neither
 * buy nor sell fees). Nothing reads or changes member configuration or funds.
 */
export function buildStockTotalCalendar(input: TotalCalendarInput): TotalCalendarSnapshot[] {
  const lotsById = new Map<number, TotalCalendarLot>();
  const invalidTrade = new Set<number>();
  const soldById = new Map<number, number>();
  const closures: MemberCalendarClosure[] = [];

  for (const lot of input.lots) {
    // Duplicate/missing identities are structural errors, unlike corrupt quantities.
    if (!Number.isSafeInteger(lot.id) || lot.id <= 0 || lotsById.has(lot.id)) {
      throw new Error('Invalid or duplicate global stock lot identity');
    }
    lotsById.set(lot.id, lot);
    if (!Number.isFinite(lot.initialQuantity) || lot.initialQuantity <= 0
      || !Number.isFinite(lot.unitCost) || lot.unitCost <= 0
      || (lot.openingFee !== null && (!Number.isFinite(lot.openingFee) || lot.openingFee < 0))) {
      invalidTrade.add(lot.id);
    }
  }

  for (const sale of input.sales) {
    const lot = lotsById.get(sale.lotId);
    if (!lot) throw new Error('Global stock sale references an unknown lot');
    const validQuantity = Number.isFinite(sale.quantity) && sale.quantity >= 0;
    if (!validQuantity || sale.quantity > lot.initialQuantity
      || !Number.isFinite(sale.salePrice) || sale.salePrice <= 0
      || (sale.closeDate && lot.openedDate && isStockSessionDate(sale.closeDate)
        && isStockSessionDate(lot.openedDate) && sale.closeDate < lot.openedDate)) {
      invalidTrade.add(lot.id);
    }
    const sold = (soldById.get(lot.id) ?? 0) + sale.quantity;
    soldById.set(lot.id, sold);
    if (!Number.isFinite(sold) || sold > lot.initialQuantity) invalidTrade.add(lot.id);

    let sellFeePerShare = 0;
    let buyFeePerShare = 0;
    // A saved zero fee is still new-style; a null fee is the legacy rule.
    if (sale.transactionFee !== null) {
      if (!Number.isFinite(sale.transactionFee) || sale.transactionFee < 0
        || !Number.isFinite(sale.eventQuantity) || sale.eventQuantity <= 0
        || sale.quantity > sale.eventQuantity) invalidTrade.add(lot.id);
      sellFeePerShare = sale.transactionFee / sale.eventQuantity;
      buyFeePerShare = lot.openingFee !== null
        ? lot.openingFee / lot.initialQuantity
        : lot.unitCost * STOCK_TRADE_FEE_RATE;
    }
    closures.push({
      participationId: lot.id,
      quantity: sale.quantity,
      salePrice: sale.salePrice - sellFeePerShare - buyFeePerShare,
      // Preserve null/invalid history as invalid, never replace it with today's date.
      closeDate: sale.closeDate ?? '',
    });
  }

  const participations: MemberCalendarParticipation[] = input.lots.map(lot => ({
    id: lot.id,
    symbol: lot.symbol,
    startDate: lot.openedDate ?? '',
    historyStartDate: lot.openedDate,
    entryPrice: lot.unitCost,
    // Do not clamp oversold/NaN quantities into apparently valid realized PnL.
    // A negative sentinel makes the engine's related historical rows unknown.
    remainingQuantity: invalidTrade.has(lot.id) ? -1 : lot.initialQuantity - (soldById.get(lot.id) ?? 0),
  }));

  return buildMemberStockCalendar({ participations, closures, quotes: input.quotes, fx: input.fx, now: input.now })
    .map(row => ({
      ...row,
      scope: 'tag-total' as const,
      floatingPnl: reversePnl(row.floatingPnl),
      realizedPnl: reversePnl(row.realizedPnl),
      totalPnl: reversePnl(row.totalPnl),
      dailyPnl: reversePnl(row.dailyPnl),
      stockDailyPnl: reversePnl(row.stockDailyPnl),
      fxDailyPnl: reversePnl(row.fxDailyPnl),
      nativePnl: {
        // Missing closes must not expose a partial native return as real data.
        CNY: row.missingSymbols.some(symbol => memberCalendarMarket(symbol) === 'A') ? null : reversePnl(row.nativePnl.CNY),
        USD: row.missingSymbols.some(symbol => memberCalendarMarket(symbol) === 'US') ? null : reversePnl(row.nativePnl.USD),
      },
    }));
}
