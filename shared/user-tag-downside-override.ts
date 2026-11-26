import type { StockLotDownsideRule } from './stock-lot-downside';

/** Latest saved version replaces the entire history; createdAt is audit-only, NOT an effective date. */
export type UserTagDownsideOverride = {
  ledgerId: 37;
  categoryId: number;
  targetUserId: number;
  actorUserId: number;
  version: number;
  mode: 'follow_tag' | 'exempt';
  createdAt: string;
};

const positiveId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Reject corrupt persisted contracts rather than silently producing exempt/raw results. */
export function assertUserTagDownsideOverride(value: unknown): asserts value is UserTagDownsideOverride {
  const row = value as UserTagDownsideOverride | null;
  if (!row || typeof row !== 'object' || row.ledgerId !== 37
    || ![row.categoryId, row.targetUserId, row.actorUserId, row.version].every(positiveId)
    || (row.mode !== 'follow_tag' && row.mode !== 'exempt')) {
    throw new Error('用户标签强平控制范围、版本或模式损坏');
  }
  const time = row.createdAt;
  if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(time)
    || !Number.isFinite(Date.parse(time))
    || new Date(time).toISOString().slice(0, 19) !== time.slice(0, 19)) {
    throw new Error('用户标签强平控制审计时间损坏');
  }
}

/** Validate every scope and every saved version, including duplicate revisions that must not win by order. */
export function assertUserTagDownsideOverrides(overrides: readonly UserTagDownsideOverride[]): void {
  if (!Array.isArray(overrides)) throw new Error('用户标签强平控制列表损坏');
  const seen = new Set<string>();
  for (const override of overrides) {
    assertUserTagDownsideOverride(override);
    const key = `${override.ledgerId}:${override.categoryId}:${override.targetUserId}:${override.version}`;
    if (seen.has(key)) throw new Error('用户标签强平控制重复版本冲突');
    seen.add(key);
  }
}

/** No saved override means follow_tag. Highest saved version wins for ALL dates, irrespective of audit time. */
export function isUserTagDownsideExempt(
  overrides: readonly UserTagDownsideOverride[], targetUserId: number, categoryId: number,
): boolean {
  if (!positiveId(targetUserId) || !positiveId(categoryId)) throw new Error('用户标签强平控制查询范围无效');
  assertUserTagDownsideOverrides(overrides);
  let latest: UserTagDownsideOverride | undefined;
  for (const override of overrides) {
    if (override.ledgerId === 37 && override.targetUserId === targetUserId && override.categoryId === categoryId
      && (!latest || override.version > latest.version)) latest = override;
  }
  return latest?.mode === 'exempt';
}

/** Remove ALL revisions/lots only in the requested ledger-37 category for this target user.
 * Rule.userId is the rule's audit actor, not its beneficiary: never use it as targetUserId.
 * Other categories/ledgers remain intact. Caller must pass this new array to every valuation/epoch path.
 */
export function userStockDownsideRules(
  rules: readonly StockLotDownsideRule[], overrides: readonly UserTagDownsideOverride[],
  targetUserId: number, categoryId: number,
): StockLotDownsideRule[] {
  const exempt = isUserTagDownsideExempt(overrides, targetUserId, categoryId);
  if (!Array.isArray(rules) || rules.some(rule => !rule || !positiveId(rule.ledgerId) || !positiveId(rule.categoryId))) {
    throw new Error('逐笔强平规则范围损坏');
  }
  return rules.filter(rule => !(exempt && rule.ledgerId === 37 && rule.categoryId === categoryId));
}
