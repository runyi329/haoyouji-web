/** Lazy owner-only 37 ledger detail. Values are source-native, never wallet/member principal. */
export type ForcedLiquidationSettingDetail = {
  ledgerId: 37;
  categoryId: number;
  lotId: number | null;
  kind: 'stock' | 'ordinary';
  currency: string;
  initialValue: number | null;
  latestValue: number | null;
  latestDate: string | null;
  latestSource: string | null;
  remainingQuantity: number | null;
  rule: {
    version: number;
    enabled: boolean;
    threshold: number;
    downsidePercent: number;
    startDate: string;
    baselineSource?: string;
    baselineStatus?: string;
    activationMode?: 'manual' | 'auto_drop';
    autoDropPercent?: number;
    armedAt?: string;
    triggeredAt?: string;
    triggerPrice?: number;
    triggerQuoteAsOf?: string;
    triggerSource?: string;
  } | null;
  status: 'ready' | 'pending' | 'no_data';
  notice: string | null;
  capitalChange: number | null;
  withdraw: number | null;
  /** Stock: user-defined current segmented decline display; not historical accounted PnL.
   * Ordinary: cashflow-neutral replay, only when full global initial/flow evidence exists. */
  effectiveFunds: number | null;
  ineffectiveFunds: number | null;
  fundBasis: 'segmented_price_drop' | 'cashflow_neutral_replay';
  initialToThresholdPercent: number | null;
  thresholdToLatestPercent: number | null;
  /** Signed real replay profit (downside contract direction), not an endpoint difference. */
  rawPnl?: number | null;
  countedPnl?: number | null;
  initialDate?: string | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
const clean = (value: number) => value === 0 ? 0 : value;
export type ForcedLiquidationDrop = {
  effectiveFunds: number | null;
  ineffectiveFunds: number | null;
};
/** Current user-defined price-drop amounts, NOT historical counted profit, F(P)*quantity or wallet balance.
 * Below-K interval is clipped to min(I,K): K>I cannot create an unobserved loss.
 * Rebounds are stateless. Disabled rules count the entire observed nonnegative drop.
 */
export function segmentedForcedLiquidationPriceDrop(input: {
  initialPrice: number | null; latestPrice: number | null; remainingQuantity: number | null;
  threshold: number | null; downsidePercent: number | null; enabled: boolean;
}): ForcedLiquidationDrop {
  const missing = { effectiveFunds: null, ineffectiveFunds: null };
  const { initialPrice: initial, latestPrice: latest, remainingQuantity: quantity,
    threshold, downsidePercent: percent } = input;
  if (!positive(initial) || !positive(latest) || !finite(quantity) || quantity < 0
    || !positive(threshold) || !finite(percent) || percent < 0 || percent > 100
    || typeof input.enabled !== 'boolean') return missing;
  const total = Math.max(0, initial - latest) * quantity;
  const below = Math.max(0, Math.min(initial, threshold) - Math.min(initial, latest)) * quantity;
  const ineffective = input.enabled ? below * ((100 - percent) / 100) : 0;
  const effective = total - ineffective;
  if (![total, below, effective, ineffective].every(Number.isFinite) || effective < 0) return missing;
  return { effectiveFunds: clean(effective), ineffectiveFunds: clean(ineffective) };
}
/** Signed source-level percentage changes, deliberately not a money formula. */
export function forcedLiquidationLevelPercents(initial: number | null, threshold: number | null, latest: number | null) {
  const first = positive(initial) && positive(threshold) ? ((initial - threshold) / initial) * 100 : null;
  const second = positive(threshold) && finite(latest) && latest >= 0 ? ((threshold - latest) / threshold) * 100 : null;
  return {
    initialToThresholdPercent: first !== null && Number.isFinite(first) ? clean(first) : null,
    thresholdToLatestPercent: second !== null && Number.isFinite(second) ? clean(second) : null,
  };
}
export type ForcedLiquidationStockQuote = {
  symbol: string; price: number | null; priceDate: string; updatedAt: string; source: string;
};
/** Independent SELECT-read counterpart of ledger-stock-portfolio mergeLatestQuoteMaps:
 * business price date first, captured time second, later source wins an exact tie.
 * No portfolio import, quote fetching, DDL or background/cache work. The selected latest
 * invalid price remains missing; it cannot revive an older quote.
 */
export function chooseLatestStockQuote(quotes: readonly ForcedLiquidationStockQuote[], symbol: string): ForcedLiquidationStockQuote | null {
  let latest: ForcedLiquidationStockQuote | null = null;
  for (const quote of quotes) {
    if (quote.symbol !== symbol) continue;
    if (!latest || quote.priceDate > latest.priceDate
      || (quote.priceDate === latest.priceDate && quote.updatedAt >= latest.updatedAt)) latest = quote;
  }
  return latest;
}
