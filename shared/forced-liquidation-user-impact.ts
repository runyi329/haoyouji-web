import type { UserTagDownsideOverride } from './user-tag-downside-override';

export type ForcedLiquidationUserOption = { userId: number; displayName: string; username: string };
export type ForcedLiquidationUserImpactLine = {
  kind: 'stock' | 'ordinary';
  participationId: number | null;
  lotId: number | null;
  symbol: string | null;
  stockName: string | null;
  /** This member's actual remaining quantity, never the global lot quantity. */
  quantity: number | null;
  entryDate: string | null;
  latestDate: string | null;
  currency: 'CNY' | 'USD' | 'USDT';
  rawPnl: number | null;
  countedPnl: number | null;
  /** Display reconciliation uses the same real FX legs and exact cents as impact. */
  rawPnlCny?: number | null;
  countedPnlCny?: number | null;
  /** no_data_zero is an owner-confirmed statistics convention, never a zero account balance. */
  profitBasis?: 'recorded' | 'no_data_zero';
  ineffectiveFunds: number | null;
  ineffectiveFundsCny: number | null;
  status: 'ready' | 'pending' | 'no_data';
  notice: string;
};
export type ForcedLiquidationUserImpactCategory = {
  categoryId: number;
  categoryName: string;
  accountingMode: 'stock_portfolio' | 'manual_balance';
  lifecycleStatus: 'active' | 'paused' | 'ended';
  globalEnabled: boolean;
  /** Latest saved user mode. It takes priority over every historical global revision. */
  override: Pick<UserTagDownsideOverride, 'mode' | 'version'>;
  participationStatus: 'participating' | 'none' | 'pending';
  ineffectiveFundsCny: number | null;
  status: 'ready' | 'pending' | 'no_data';
  notice: string;
  lines: ForcedLiquidationUserImpactLine[];
};
export type ForcedLiquidationUserImpact = {
  ledgerId: 37;
  targetUserId: number;
  displayName: string;
  canEdit: true;
  /** Actual member raw cumulative PnL minus counted cumulative PnL, not global segmented funds. */
  basis: 'member_raw_minus_counted';
  asOf: string;
  categories: ForcedLiquidationUserImpactCategory[];
  totalImpactCny: number | null;
  totalRawPnlCny: number | null;
  totalCountedPnlCny: number | null;
  /** Independent from impact: known zero impact never fabricates unknown absolute profit. */
  profitPendingCount: number;
  /** Unresolved categories are excluded whole; explicit no_data_zero conventions remain included. */
  profitScope: 'complete' | 'verified_only';
  excludedProfitCategories: Array<{ categoryId: number; categoryName: string; lineCount: number; notice: string }>;
  verifiedProfitImpactCny: number | null;
  /** Only true when the verified-profit difference is also the complete all-tag impact. */
  profitImpactMatchesTotal: boolean;
  status: 'ready' | 'pending';
  pendingCount: number;
  notice: string;
};
