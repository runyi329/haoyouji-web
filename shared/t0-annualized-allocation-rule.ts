export type T0AnnualizedAllocationRule = {
  /** 0：未达目标者均分；1：完全按实际补差金额；中间值混合两者。 */
  influence: number;
  /** 管理员私有目标，单位为百分数（52代表52%）；未配置者沿用平均年化。 */
  targets: Record<string, number>;
  version: number;
};

export const DEFAULT_T0_ANNUALIZED_ALLOCATION_RULE: T0AnnualizedAllocationRule = {
  influence: 1,
  targets: {},
  version: 0,
};

export function getAnnualizedGapWeights<T extends { topUp: number | null }>(rows: T[], influence: number) {
  const eligible = rows.filter((row) => row.topUp !== null && Number.isFinite(row.topUp) && row.topUp > 0.000001);
  const total = eligible.reduce((sum, row) => sum + Number(row.topUp), 0);
  const strength = Math.min(1, Math.max(0, Number.isFinite(influence) ? influence : 1));
  return eligible.map((row) => ({
    row,
    weight: (1 - strength) / eligible.length + strength * Number(row.topUp) / total,
  }));
}

/** 整数分分配：不超过各人目标补差额；余额保留，不强行超额支付。 */
export function allocateCappedAnnualizedCents(
  budgetCents: number,
  candidates: Array<{ userId: string; weight: number; capCents: number }>,
): Array<{ userId: string; cents: number }> {
  let active = candidates.filter((item) => Number.isFinite(item.weight) && item.weight > 0 && Number.isSafeInteger(item.capCents) && item.capCents > 0);
  const result = new Map(active.map((item) => [item.userId, 0]));
  const totalCap = active.reduce((sum, item) => sum + item.capCents, 0);
  if (!Number.isSafeInteger(budgetCents) || budgetCents <= 0 || !Number.isSafeInteger(totalCap)) return [];
  let remaining = Math.min(budgetCents, totalCap);
  while (remaining > 0 && active.length > 0) {
    const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) break;
    const capped = active.filter((item) => remaining * item.weight / totalWeight >= item.capCents);
    if (capped.length > 0) {
      const cappedIds = new Set(capped.map((item) => item.userId));
      for (const item of capped) {
        result.set(item.userId, item.capCents);
        remaining -= item.capCents;
      }
      active = active.filter((item) => !cappedIds.has(item.userId));
      continue;
    }
    const allocations = active.map((item) => {
      const exact = remaining * item.weight / totalWeight;
      return { ...item, cents: Math.floor(exact), fraction: exact - Math.floor(exact) };
    });
    let remainder = remaining - allocations.reduce((sum, item) => sum + item.cents, 0);
    for (const item of [...allocations].sort((a, b) => b.fraction - a.fraction || a.userId.localeCompare(b.userId))) {
      if (remainder <= 0) break;
      if (item.cents < item.capCents) {
        item.cents += 1;
        remainder -= 1;
      }
    }
    for (const item of allocations) result.set(item.userId, item.cents);
    remaining = remainder;
    break;
  }
  return Array.from(result, ([userId, cents]) => ({ userId, cents }));
}
