import type { WeightedOrderFact } from "../shared/t0-weighted-order-rule";
import type { SharedContributionFact } from "../shared/t0-shared-contribution-rule";
import {
  buildOpeningClosingAllocations,
  buildRecentDetails,
  calculateLedger52T0IncomeByUser,
  type Ledger52T0IncomeParts,
  type Ledger52T0IncomeSnapshot,
  type Ledger52T0IncomeTrade,
  type Ledger52T0IncomeTransfer,
  type Ledger52T0IncomeReduction,
} from "./ledger52-t0-team-overview";

/** Structural counterpart of the financial reader; identifiers keep their raw journal forms. */
export type T0AllocationFinancialFacts = {
  entries: Array<Omit<Ledger52T0IncomeTrade, "accountId" | "relatedUserId" | "relatedFundId"> & {
    accountId: string | number;
    relatedUserId?: number;
    relatedFundId?: string | number;
    filledPrice?: number;
    executionStatus?: string;
  }>;
  profitShareSnapshots: Ledger52T0IncomeSnapshot[];
  sharedIncomeTransfers: Array<Ledger52T0IncomeTransfer & { sourceUserId?: number; createdAt?: string }>;
  sharedIncomeReductions: Ledger52T0IncomeReduction[];
  payoutCashFlows: Array<{ relatedUserId: number; occurredOn: string; direction: "deposit" | "withdrawal"; amount: number }>;
  /** Actual full-journal field; the dedicated financial reader does not currently return it. */
  payoutDepositTotals?: Array<{ relatedUserId: number; cumulativeDepositAmount: number; relatedUserName?: string; relatedUsername?: string }>;
};

export type T0AllocationCandidate = {
  userId: number;
  depositAmount: number;
  cashFlows: Array<{ occurredOn: string; amount: number; direction: "deposit" | "withdrawal" }>;
  terminalValue: number;
  contribution: SharedContributionFact;
};

export type T0AllocationFacts = {
  trades: Ledger52T0IncomeTrade[];
  incomeByUser: Map<number, Ledger52T0IncomeParts>;
  weightedFacts: WeightedOrderFact[];
  candidates: T0AllocationCandidate[];
};

function validDate(value: string) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
}

/**
 * Request-local, side-effect-free allocation inputs. No DB/wallet reads, visibility filters,
 * mirrored directions, synthetic closing, XIRR solver, or new FIFO implementation.
 * The caller must apply current user existence/deletion/team scope authorization separately.
 */
export function deriveT0AllocationFacts(
  facts: T0AllocationFinancialFacts,
  context: { actorUserId: number; sourceUserId: number; closePrice: number; asOf: string },
): T0AllocationFacts {
  const inputDate = validDate(context.asOf);
  if (!inputDate) throw new Error("T+0 allocation asOf date is invalid");
  const asOfTimestamp = context.asOf.length === 10
    ? Date.parse(`${inputDate}T23:59:59.999+08:00`)
    : Date.parse(context.asOf);
  if (!Number.isFinite(asOfTimestamp)) throw new Error("T+0 allocation asOf timestamp is invalid");
  const asOfDate = new Date(asOfTimestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const opening = (trade: Ledger52T0IncomeTrade) => trade.action === "openLong" || trade.action === "openShort";
  const trades: Ledger52T0IncomeTrade[] = facts.entries
    .filter((entry) => entry.symbol === "ETH"
      && (entry.instrumentType === undefined || entry.instrumentType === "spot" || entry.instrumentType === "contract")
      && ["openLong", "openShort", "closeLong", "closeShort"].includes(entry.action)
      && entry.executionStatus !== "cancelled" && entry.executionStatus !== "canceled"
      && Number.isInteger(entry.relatedUserId) && Number(entry.relatedUserId) > 0
      && Number.isFinite(entry.quantity) && entry.quantity > 0
      && Number.isFinite(entry.price) && entry.price > 0
      && Number.isFinite(entry.fee)
      && Number.isFinite(Date.parse(entry.filledAt || entry.createdAt))
      && Date.parse(entry.filledAt || entry.createdAt) <= asOfTimestamp)
    .map((entry) => ({
      id: String(entry.id), accountId: String(entry.accountId), accountName: entry.accountName,
      relatedUserId: Number(entry.relatedUserId), relatedFundId: entry.relatedFundId === undefined ? undefined : String(entry.relatedFundId),
      action: entry.action, symbol: entry.symbol, instrumentType: entry.instrumentType,
      quantity: entry.quantity, price: entry.price,
      fee: entry.fee, targetPrice: entry.targetPrice, targetOpeningEntryId: entry.targetOpeningEntryId,
      createdAt: entry.createdAt, filledAt: entry.filledAt, isPending: Boolean(entry.isPending),
    }));
  const tradeIds = new Set(trades.map((trade) => trade.id));
  const closingIds = new Set(trades.filter((trade) => !opening(trade) && !trade.isPending).map((trade) => trade.id));
  const snapshots = facts.profitShareSnapshots.filter((snapshot) => tradeIds.has(snapshot.openingEntryId) && closingIds.has(snapshot.entryId));
  const transfers = facts.sharedIncomeTransfers.filter((transfer) => closingIds.has(transfer.closingEntryId)
    && Number.isFinite(transfer.amount)
    && (!transfer.createdAt || (Number.isFinite(Date.parse(transfer.createdAt)) && Date.parse(transfer.createdAt) <= asOfTimestamp)));
  const reductions = facts.sharedIncomeReductions.filter((reduction) => closingIds.has(reduction.closingEntryId));
  const incomeByUser = calculateLedger52T0IncomeByUser({ trades, snapshots, transfers, reductions });
  const allocations = buildOpeningClosingAllocations(trades);
  const weightedFacts: WeightedOrderFact[] = [];
  for (const trade of trades) {
    if (!opening(trade)) continue;
    const closedQuantity = trade.isPending ? 0 : (allocations.get(trade.id) ?? []).reduce((total, match) => total + match.quantity, 0);
    const quantity = Math.max(0, trade.quantity - closedQuantity);
    if (quantity <= 0.000001) continue;
    weightedFacts.push({
      userId: String(trade.relatedUserId), quantity, price: !trade.isPending && Number(facts.entries.find((entry) => String(entry.id) === trade.id)?.filledPrice) > 0
        ? Number(facts.entries.find((entry) => String(entry.id) === trade.id)?.filledPrice) : trade.price,
      status: trade.isPending ? "pending" : "filled", side: trade.action === "openLong" ? "long" : "short",
      openingFee: trade.isPending ? 0 : trade.fee * quantity / trade.quantity,
    });
  }

  // Positive source settlements are counted once per closing, never once per recipient.
  // This requested source-PnL baseline deliberately differs from legacy transfer-only totals.
  const details = buildRecentDetails(trades, snapshots);
  const contributionByUser = new Map<number, SharedContributionFact>();
  const outgoingClosingIds = new Map<number, Set<string>>();
  const incomingClosingIds = new Map<number, Set<string>>();
  const contributionFor = (userId: number) => {
    let contribution = contributionByUser.get(userId);
    if (!contribution) {
      contribution = { userId: String(userId), outgoingAmount: 0, outgoingCount: 0, incomingAmount: 0, incomingCount: 0 };
      contributionByUser.set(userId, contribution);
    }
    return contribution;
  };
  for (const closing of trades) {
    if (!closingIds.has(closing.id)) continue;
    const netPnl = details.get(closing.id)?.netPnl;
    if (netPnl === undefined || !Number.isFinite(netPnl) || netPnl <= 0) continue;
    const ids = outgoingClosingIds.get(closing.relatedUserId) ?? new Set<string>();
    if (ids.has(closing.id)) continue;
    ids.add(closing.id);
    outgoingClosingIds.set(closing.relatedUserId, ids);
    const contribution = contributionFor(closing.relatedUserId);
    contribution.outgoingAmount += netPnl;
    contribution.outgoingCount = ids.size;
  }
  for (const transfer of transfers) {
    if (transfer.amount <= 0 || !Number.isInteger(transfer.recipientUserId) || transfer.recipientUserId <= 0) continue;
    const contribution = contributionFor(transfer.recipientUserId);
    contribution.incomingAmount += transfer.amount;
    const ids = incomingClosingIds.get(transfer.recipientUserId) ?? new Set<string>();
    ids.add(transfer.closingEntryId);
    incomingClosingIds.set(transfer.recipientUserId, ids);
    contribution.incomingCount = ids.size;
  }

  const cashFlowsByUser = new Map<number, T0AllocationCandidate["cashFlows"]>();
  const depositsByUser = new Map<number, number>();
  const futureDepositsByUser = new Map<number, number>();
  for (const flow of facts.payoutCashFlows) {
    const occurredOn = validDate(flow.occurredOn);
    if (!occurredOn || !Number.isInteger(flow.relatedUserId) || flow.relatedUserId <= 0
      || !Number.isFinite(flow.amount) || flow.amount <= 0
      || (flow.direction !== "deposit" && flow.direction !== "withdrawal")) continue;
    if (occurredOn > asOfDate) {
      if (flow.direction === "deposit") futureDepositsByUser.set(flow.relatedUserId, (futureDepositsByUser.get(flow.relatedUserId) ?? 0) + flow.amount);
      continue;
    }
    const cashFlows = cashFlowsByUser.get(flow.relatedUserId) ?? [];
    cashFlows.push({ occurredOn, amount: flow.amount, direction: flow.direction });
    cashFlowsByUser.set(flow.relatedUserId, cashFlows);
    if (flow.direction === "deposit") depositsByUser.set(flow.relatedUserId, (depositsByUser.get(flow.relatedUserId) ?? 0) + flow.amount);
  }
  // Complete dated flows take precedence over un-dated totals. A totals-only depositor
  // cannot supply historical annualized facts, so do not invent flows or terminal value.
  for (const total of facts.payoutDepositTotals ?? []) {
    if (!Number.isInteger(total.relatedUserId) || total.relatedUserId <= 0 || !Number.isFinite(total.cumulativeDepositAmount)) continue;
    if (!depositsByUser.has(total.relatedUserId) && cashFlowsByUser.has(total.relatedUserId)) {
      depositsByUser.set(total.relatedUserId, Math.max(0, total.cumulativeDepositAmount - (futureDepositsByUser.get(total.relatedUserId) ?? 0)));
    }
  }
  const candidates = [...depositsByUser.entries()]
    .filter(([userId, amount]) => amount > 0 && userId !== context.actorUserId && userId !== context.sourceUserId)
    .sort(([left], [right]) => left - right)
    .map(([userId, depositAmount]): T0AllocationCandidate => {
      const cashFlows = [...(cashFlowsByUser.get(userId) ?? [])].sort((left, right) => left.occurredOn.localeCompare(right.occurredOn));
      const withdrawalAmount = cashFlows.reduce((total, flow) => total + (flow.direction === "withdrawal" ? flow.amount : 0), 0);
      const income = incomeByUser.get(userId);
      const realizedIncome = income ? income.orderIncome + income.commissionIncome + income.sharedIncome : 0;
      return {
        userId, depositAmount, cashFlows,
        terminalValue: depositAmount - withdrawalAmount + realizedIncome,
        contribution: { ...contributionFor(userId) },
      };
    });
  return { trades, incomeByUser, weightedFacts, candidates };
}
