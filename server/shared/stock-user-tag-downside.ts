import { isUserTagDownsideExempt, userStockDownsideRules, assertUserTagDownsideOverrides,
  type UserTagDownsideOverride } from '../../shared/user-tag-downside-override';
import { countedStockLotPrice, selectStockLotDownsideRule, type StockLotDownsideRule } from '../../shared/stock-lot-downside';

// A deliberate exempt selection is NOT a legacy empty-rule selection: legacy frozen counted
// sale evidence must remain compatible for follow_tag. No source rule/evidence is mutated.
const exemptSelections = new WeakSet<readonly StockLotDownsideRule[]>();
export function stockUserDownsideRules(rules: StockLotDownsideRule[], overrides: readonly UserTagDownsideOverride[],
  targetUserId: number, categoryId: number): StockLotDownsideRule[] {
  if (!isUserTagDownsideExempt(overrides, targetUserId, categoryId)) return rules;
  const selected = userStockDownsideRules(rules, overrides, targetUserId, categoryId);
  exemptSelections.add(selected);
  return selected;
}
export const isStockUserDownsideExemptSelection = (rules: readonly StockLotDownsideRule[]) => exemptSelections.has(rules);

export function stockUserTagOverrideVersion(overrides: readonly UserTagDownsideOverride[], targetUserId: number, categoryId: number): number {
  // Same fail-closed contract as the mode resolver; no Number(null) coercion.
  isUserTagDownsideExempt(overrides, targetUserId, categoryId);
  return overrides.reduce((version, row) => row.ledgerId === 37 && row.targetUserId === targetUserId && row.categoryId === categoryId
    ? Math.max(version, row.version) : version, 0);
}
export function stockUserTagOverridesFingerprint(overrides: readonly UserTagDownsideOverride[], categoryId?: number): string {
  assertUserTagDownsideOverrides(overrides);
  return JSON.stringify(overrides.filter(row => categoryId === undefined || row.categoryId === categoryId)
    .slice().sort((a, b) => a.categoryId - b.categoryId || a.targetUserId - b.targetUserId || a.version - b.version)
    .map(row => [row.ledgerId, row.categoryId, row.targetUserId, row.version, row.mode]));
}
/** Explicit raw branch ignores frozen counted sale evidence ONLY for selected exempt members. */
export function stockUserCountedSalePrice(rules: StockLotDownsideRule[], lotId: number, rawPrice: number,
  actualAt: string, saved?: { countedPrice: number; effectiveAt: string }): number | null {
  if (!Number.isFinite(rawPrice)) return null;
  if (isStockUserDownsideExemptSelection(rules)) return Number.isFinite(rawPrice) ? rawPrice : null;
  const at = Number.isFinite(Date.parse(actualAt)) ? actualAt : saved?.effectiveAt ?? '';
  if (!Number.isFinite(Date.parse(at))) return rules.some(r => r.lotId === lotId && r.startDate) ? null : saved?.countedPrice ?? rawPrice;
  const rule = selectStockLotDownsideRule(rules, lotId, at);
  return rule?.startDate ? countedStockLotPrice(rawPrice, rule) : saved?.countedPrice ?? rawPrice;
}
