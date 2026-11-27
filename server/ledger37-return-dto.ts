/** Response-only projection for ledger 37. Never use this as an authorization or calculation helper.
 * canManage must come from the existing authenticated server-side access check, not request input.
 * Actual owner management responses keep their original shape; all viewing-as responses are member DTOs.
 */
export type Ledger37ReturnPresentation = {
  ledgerId: number;
  canManage: boolean;
  isViewingAs?: boolean;
};

// These are internal rule/configuration/proof fields, not actual prices, financial amounts,
// settlement policy versions, verification status, or generic financial/transaction audit records.
const INTERNAL_RULE_KEYS = new Set([
  'downsideRule', 'downsideRules', 'downsideRuleAudit', '__stockLotDownside',
  'downsideRuleVersion', 'ruleVersion', 'userTagOverrideVersion', 'entryCountedOffset',
  'countedMarketPrice',
]);
const INTERNAL_PENDING_REASONS = new Set([
  'missing_downside_historical_baseline', 'missing_downside_sale_evidence',
  'missing_downside_member_baseline',
]);

type ProjectionKind = 'ordinary' | 'stock';
function projectValue(value: unknown, kind: ProjectionKind): unknown {
  if (Array.isArray(value)) return value.map(item => projectValue(item, kind));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (INTERNAL_RULE_KEYS.has(key)) continue;
    // Ordinary readers already have the correct final pnl/dailyPnl. The alternate rule comparison
    // amounts are disclosure-only; keep actual balance and all true cashflow/entry amounts intact.
    if (kind === 'ordinary' && (key === 'rawPnl' || key === 'countedBalance')) continue;
    // Preserve pending/ready and null returns; only replace the internal reason with a neutral one.
    if (key === 'dailyPnlReason' && typeof item === 'string' && INTERNAL_PENDING_REASONS.has(item)) {
      result[key] = 'pending_verification';
    } else {
      result[key] = projectValue(item, kind);
    }
  }
  return result;
}

function project<T>(dto: T, presentation: Ledger37ReturnPresentation, kind: ProjectionKind): T {
  if (presentation.ledgerId !== 37 || (presentation.canManage && !presentation.isViewingAs)) return dto;
  // A new object is essential: shared valuation/cache objects still feed internal calculations/admin views.
  return projectValue(dto, kind) as T;
}
export function projectLedger37OrdinaryReturnDto<T>(dto: T, presentation: Ledger37ReturnPresentation): T {
  return project(dto, presentation, 'ordinary');
}
export function projectLedger37StockReturnDto<T>(dto: T, presentation: Ledger37ReturnPresentation): T {
  return project(dto, presentation, 'stock');
}
