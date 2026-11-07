export type SharedContributionRule = {
  outgoing: number;
  incomingAmount: number;
  incomingCount: number;
};

export const DEFAULT_SHARED_CONTRIBUTION_RULE: SharedContributionRule = {
  outgoing: 1,
  incomingAmount: 1,
  incomingCount: 1,
};

export type SharedContributionFact = {
  userId: string;
  outgoingAmount: number;
  outgoingCount: number;
  incomingAmount: number;
  incomingCount: number;
};

export type SharedContributionScore<T extends SharedContributionFact> = {
  fact: T;
  outgoingShare: number;
  incomingAmountShare: number;
  incomingCountShare: number;
  weight: number;
};

/**
 * 合并原三项口径：对外金额/次数综合、收到金额补差、收到次数补差。
 * 各维度先归一化，再按相对影响强度合成；20%均分保障仅计一次。
 * 此函数不读数据库、不改现金流、不计算新的历史收支。
 */
export function calculateSharedContributionWeights<T extends SharedContributionFact>(
  facts: T[],
  rule: SharedContributionRule,
): SharedContributionScore<T>[] {
  if (facts.length === 0) return [];
  // 数据缺失不冒充真实零收支；调用方会提示本维度无法生成分配。
  if (facts.some((fact) => [fact.outgoingAmount, fact.outgoingCount, fact.incomingAmount, fact.incomingCount]
    .some((value) => typeof value !== "number" || !Number.isFinite(value)))) return [];
  if ([rule.outgoing, rule.incomingAmount, rule.incomingCount]
    .some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return [];

  const count = facts.length;
  const equalShare = 1 / count;
  const positive = (value: number) => Math.max(0, value);
  const outgoingTotal = facts.reduce((sum, fact) => sum + positive(fact.outgoingAmount), 0);
  const outgoingCountTotal = facts.reduce((sum, fact) => sum + positive(fact.outgoingCount), 0);
  const outgoingFactors = Number(outgoingTotal > 0.000001) + Number(outgoingCountTotal > 0);
  const maximumIncomingAmount = facts.reduce((maximum, fact) => Math.max(maximum, positive(fact.incomingAmount)), 0);
  const maximumIncomingCount = facts.reduce((maximum, fact) => Math.max(maximum, positive(fact.incomingCount)), 0);
  const amountGaps = facts.map((fact) => maximumIncomingAmount - positive(fact.incomingAmount));
  const countGaps = facts.map((fact) => maximumIncomingCount - positive(fact.incomingCount));
  const amountGapTotal = amountGaps.reduce((sum, value) => sum + value, 0);
  const countGapTotal = countGaps.reduce((sum, value) => sum + value, 0);
  const influenceTotal = rule.outgoing + rule.incomingAmount + rule.incomingCount;

  return facts.map((fact, index) => {
    const outgoingShare = outgoingFactors > 0
      ? ((outgoingTotal > 0.000001 ? positive(fact.outgoingAmount) / outgoingTotal : 0)
        + (outgoingCountTotal > 0 ? positive(fact.outgoingCount) / outgoingCountTotal : 0)) / outgoingFactors
      : equalShare;
    const incomingAmountShare = amountGapTotal > 0.000001 ? amountGaps[index] / amountGapTotal : equalShare;
    const incomingCountShare = countGapTotal > 0.000001 ? countGaps[index] / countGapTotal : equalShare;
    const combinedShare = influenceTotal > 0
      ? (rule.outgoing * outgoingShare + rule.incomingAmount * incomingAmountShare + rule.incomingCount * incomingCountShare) / influenceTotal
      : equalShare;
    return {
      fact, outgoingShare, incomingAmountShare, incomingCountShare,
      weight: 0.2 * equalShare + 0.8 * combinedShare,
    };
  });
}
