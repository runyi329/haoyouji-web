/** 挂单加权 v1：仅供新方案试算，不替代服务端资金资格及成交快照。 */
export type WeightedOrderRule = {
  distanceInfluence: number;
  statusInfluence: number;
  pnlInfluence: number;
};
export const DEFAULT_WEIGHTED_ORDER_RULE: WeightedOrderRule = {
  distanceInfluence: 1,
  statusInfluence: 1,
  pnlInfluence: 1,
};
export const WEIGHTED_ORDER_MAX_DISTANCE = 0.2;
export type WeightedOrderFact = {
  userId: string;
  quantity: number;
  price: number;
  status: "pending" | "filled";
  side: "long" | "short";
  /** 仅剩余未平数量所对应的真实开仓手续费。 */
  openingFee: number;
};
export type WeightedOrderScore = {
  userId: string;
  pendingQuantity: number;
  filledQuantity: number;
  netPnl: number;
  netPnlRate: number | null;
  pnlFactor: number;
  score: number;
  details: Array<{
    quantity: number;
    price: number;
    status: "pending" | "filled";
    distance: number;
    distanceFactor: number;
    statusFactor: number;
    pnlFactor: number;
    score: number;
  }>;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function normalizeWeightedOrderRule(rule: WeightedOrderRule): WeightedOrderRule {
  const normalize = (value: number) => Number.isFinite(value) ? clamp(value, 0, 1) : 1;
  return {
    distanceInfluence: normalize(rule.distanceInfluence),
    statusInfluence: normalize(rule.statusInfluence),
    pnlInfluence: normalize(rule.pnlInfluence),
  };
}
/**
 * 同一成交参考价、真实用户方向、同币种全持仓先汇总净盈亏，再施加有界盈亏系数。
 * 多空数量分别计入；不净额扣掉ETH，不按订单笔数加分，不给待成交单虚拟盈亏。
 */
export function calculateWeightedOrderScores(
  facts: WeightedOrderFact[],
  closePrice: number,
  rawRule: WeightedOrderRule,
  estimatedClosingFeeRate = 0.00036,
): Map<string, WeightedOrderScore> {
  const result = new Map<string, WeightedOrderScore>();
  if (!Number.isFinite(closePrice) || closePrice <= 0 || !Number.isFinite(estimatedClosingFeeRate) || estimatedClosingFeeRate < 0) return result;
  const rule = normalizeWeightedOrderRule(rawRule);
  const validFacts = facts.filter((fact) => fact.userId && Number.isFinite(fact.quantity) && fact.quantity > 0
    && Number.isFinite(fact.price) && fact.price > 0 && Number.isFinite(fact.openingFee)
    && (fact.status === "pending" || fact.status === "filled") && (fact.side === "long" || fact.side === "short"));
  const basisByUser = new Map<string, number>();
  for (const fact of validFacts) {
    const user = result.get(fact.userId) || {
      userId: fact.userId, pendingQuantity: 0, filledQuantity: 0, netPnl: 0,
      netPnlRate: null, pnlFactor: 1, score: 0, details: [],
    };
    if (fact.status === "pending") user.pendingQuantity += fact.quantity;
    else {
      user.filledQuantity += fact.quantity;
      const gross = (fact.side === "long" ? closePrice - fact.price : fact.price - closePrice) * fact.quantity;
      user.netPnl += gross - fact.openingFee - closePrice * fact.quantity * estimatedClosingFeeRate;
      basisByUser.set(fact.userId, (basisByUser.get(fact.userId) || 0) + fact.price * fact.quantity);
    }
    result.set(fact.userId, user);
  }
  for (const user of result.values()) {
    const basis = basisByUser.get(user.userId) || 0;
    user.netPnlRate = basis > 0 ? user.netPnl / basis : null;
    user.pnlFactor = user.netPnlRate === null ? 1
      : 1 - 0.5 * rule.pnlInfluence * clamp(user.netPnlRate / 0.1, -1, 1);
  }
  for (const fact of validFacts) {
    const user = result.get(fact.userId)!;
    const distance = Math.abs(fact.price - closePrice) / closePrice;
    // 20%是固定资格范围；把距离影响调为0，也不能令极远挂单重新获得权重。
    const distanceFactor = distance >= WEIGHTED_ORDER_MAX_DISTANCE ? 0
      : (1 - rule.distanceInfluence) + rule.distanceInfluence * (1 - distance / WEIGHTED_ORDER_MAX_DISTANCE) ** 2;
    const statusFactor = fact.status === "pending" ? 1 - 0.75 * rule.statusInfluence : 1;
    const pnlFactor = fact.status === "pending" ? 1 : user.pnlFactor;
    const score = fact.quantity * distanceFactor * statusFactor * pnlFactor;
    user.score += score;
    user.details.push({ quantity: fact.quantity, price: fact.price, status: fact.status, distance, distanceFactor, statusFactor, pnlFactor, score });
  }
  return result;
}
