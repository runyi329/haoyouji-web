import type { WeightedOrderFact } from "./t0-weighted-order-rule";

export const T0_SHARED_ALLOCATION_METRICS = ["principal", "weightedOpeningQuantity", "realizedAnnualized", "sharedContribution", "marketContribution"] as const;
export type T0SharedAllocationMetric = typeof T0_SHARED_ALLOCATION_METRICS[number];
export type T0SharedAllocationAction = "closeLong" | "closeShort";
export type T0SharedAllocationBudgetMode = "percentage" | "amount";
export type T0SharedIncomeAllocation = { recipientUserId: number; amount: string };
export type T0SharedAllocationCandidate = {
  userId: string; name: string; username?: string;
  remainingQuantity: number; longQuantity: number; shortQuantity: number;
  cumulativeDepositAmount: number; withdrawalProgressPercentage: number | null; hasPrincipal: boolean;
  holdingNetPnl: number; closedNetPnl: number; closedLossPnl: number; historicalProfit: number;
  sharedIncomeEnabled: boolean; receivedSharedIncome: number; receivedSharedIncomeCount: number;
  contributedSharedIncome: number; contributedSharedIncomeOrderCount: number; openingOrderCount: number;
  realizedCashFlows: Array<{ occurredOn: string; amount: number; direction?: "deposit" | "withdrawal"; atEndOfBeijingDay?: boolean }>;
  realizedTerminalValue: number; heldDays: number; settlementAgeDays: number | null; annualizedReference: number | null;
  annualizedTargetTopUps: Array<{ targetRate: number; topUp: number | null }>;
};
export type T0SharedIncomeAllocationPlan = {
  allocations: T0SharedIncomeAllocation[];
  sourceNetPnl?: number;
  shareableAmount: number; allocatedTotal: number; retainedAmount: number;
  asOf: string; planToken: string;
  rulesVersion: number; principalVersion: number; annualizedVersion: number;
  limitations: string[]; candidates: T0SharedAllocationCandidate[]; weightedFacts: WeightedOrderFact[];
};
