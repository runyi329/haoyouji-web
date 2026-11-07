import { z } from "zod";
import {
  DEFAULT_WEIGHTED_ORDER_RULE,
  type WeightedOrderRule,
} from "./t0-weighted-order-rule";
import {
  DEFAULT_SHARED_CONTRIBUTION_RULE,
  type SharedContributionRule,
} from "./t0-shared-contribution-rule";
import {
  DEFAULT_MARKET_CONTRIBUTION_RULE,
  type MarketContributionRule,
} from "./t0-market-contribution-rule";

const influenceSchema = z.number().finite().min(0).max(1);
export const ledger52T0AllocationRuleVersionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const ledger52T0WeightedOrderRuleSchema = z.object({
  distanceInfluence: influenceSchema,
  statusInfluence: influenceSchema,
  pnlInfluence: influenceSchema,
}).strict();

export const ledger52T0SharedContributionRuleSchema = z.object({
  outgoing: influenceSchema,
  incomingAmount: influenceSchema,
  incomingCount: influenceSchema,
}).strict();

export const ledger52T0MarketContributionRuleSchema = z.object({
  referrals: influenceSchema,
  capital: influenceSchema,
  trading: influenceSchema,
  output: influenceSchema,
  indirectDecay: influenceSchema,
  retentionInfluence: influenceSchema,
  retentionDays: z.number().int().min(1).max(365),
}).strict();

/** 本金沿用既有账本级规则及其版本；不属于此存储的可写JSON。 */
export const ledger52T0AllocationPrincipalRuleSchema = z.object({
  curve: z.enum(["linear", "balanced", "strong"]),
  influencePercentage: z.number().int().min(0).max(100),
}).strict();

/** 三项规则一起保存；本金及私有目标年化均禁止进入这个JSON。 */
export const ledger52T0AllocationRuleSettingsSchema = z.object({
  weightedOrder: ledger52T0WeightedOrderRuleSchema,
  contribution: ledger52T0SharedContributionRuleSchema,
  market: ledger52T0MarketContributionRuleSchema,
}).strict();

export const setLedger52T0AllocationRulesInputSchema = ledger52T0AllocationRuleSettingsSchema.extend({
  actorUserId: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  expectedVersion: ledger52T0AllocationRuleVersionSchema,
}).strict();

export type Ledger52T0AllocationRuleSettings = {
  weightedOrder: WeightedOrderRule;
  contribution: SharedContributionRule;
  market: MarketContributionRule;
};
export type Ledger52T0AllocationPrincipalRule = z.infer<typeof ledger52T0AllocationPrincipalRuleSchema>;
export type Ledger52T0AllocationRules = Ledger52T0AllocationRuleSettings & {
  /** 仅三项规则的操作者级配置版本，与本金版本无关。 */
  version: number;
  /** 既有全局52号账本本金规则，只读合并，不在此服务保存。 */
  principal: Ledger52T0AllocationPrincipalRule;
  principalVersion: number;
};
export type SetLedger52T0AllocationRulesInput = z.infer<typeof setLedger52T0AllocationRulesInputSchema>;
export type GetLedger52T0AllocationRulesInput = { actorUserId: number };

/** 每次返回独立对象，避免调用方修改共享默认值。 */
export function getDefaultLedger52T0AllocationRuleSettings(): Ledger52T0AllocationRuleSettings {
  return {
    weightedOrder: { ...DEFAULT_WEIGHTED_ORDER_RULE },
    contribution: { ...DEFAULT_SHARED_CONTRIBUTION_RULE },
    market: { ...DEFAULT_MARKET_CONTRIBUTION_RULE },
  };
}
