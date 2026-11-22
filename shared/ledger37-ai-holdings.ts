export const LEDGER37_HOLDING_SOURCE_IDS = ['r1', 'berkshire', 'pelosi', 'ark', 'nvidia', 'soros', 'pershing', 'himalaya', 'bridgewater'] as const;
export type Ledger37HoldingSourceId = typeof LEDGER37_HOLDING_SOURCE_IDS[number];
export type Ledger37HoldingMarketValue = {
  /** Exact decimal valuation of this member's remaining allocated quantity, not wallet cash. */
  amount: string;
  currency: 'CNY' | 'USD' | 'USDT';
  asOf: string;
};
export type Ledger37HoldingQuote = {
  /** Verified market price per share/coin in its native currency, never cost or member value. */
  amount: string;
  currency: 'CNY' | 'USD' | 'USDT';
  /** Actual market evidence date, not the portfolio reporting date. */
  asOf: string;
};
export type Ledger37HoldingPosition = {
  symbol: string;
  /** Verified ticker for display only; symbol retains the original security identifier. */
  displaySymbol?: string;
  stockName: string;
  currency: 'CNY' | 'USD' | 'USDT';
  shares: string | null;
  weightPct: number | null;
  marketValue?: Ledger37HoldingMarketValue | null;
  /** Member detail only; source-wide holdings do not expose market-price detail. */
  quote?: Ledger37HoldingQuote | null;
};
export type Ledger37HoldingClosedTrade = {
  symbol: string;
  stockName: string;
  /** Beijing calendar dates from real trading records; unknown dates stay null. */
  openedDate: string | null;
  closedDate: string | null;
};
/** Proven member allocations/sales only; no dates, quantities or project/order identifiers. */
export type Ledger37HoldingPositionChange = {
  symbol: string;
  stockName: string;
  action: 'new' | 'increase' | 'decrease';
};
export type Ledger37HoldingSource = {
  id: Ledger37HoldingSourceId;
  displayName: string;
  entityName: string;
  kind: 'internal' | '13f' | 'etf' | 'disclosure';
  status: 'available' | 'unavailable';
  asOf: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
  sourceUrl: string | null;
  description: string;
  coverageNote: string;
  holdings: Ledger37HoldingPosition[];
  /** Only for R1 detail. Source-wide holdings and portrait ring remain separate. */
  memberPortfolio?: {
    holdings: Ledger37HoldingPosition[];
    valuationAsOf: string | null;
    reportingCurrency: 'CNY' | 'USD' | 'USDT' | null;
    closedTrades?: Ledger37HoldingClosedTrade[];
    /** Ordered by verified records on the server, never inferred from holding snapshots. */
    positionChanges?: Ledger37HoldingPositionChange[];
  };
};
export type Ledger37HoldingSources = {
  viewerUserId: number;
  aiEnabled: boolean;
  sources: Ledger37HoldingSource[];
};
