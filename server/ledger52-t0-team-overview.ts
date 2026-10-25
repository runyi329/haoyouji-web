import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import { getLedger52T0JournalTeamFinancialFacts } from "./ledger52-t0-journal";

/** 首批仅由产品明确授权的团队负责人可查看其递归下属的汇总财务数据。 */
export const LEDGER52_T0_TEAM_OVERVIEW_LEADER_IDS = new Set<number>([4952766]);
const LEDGER_ID = 52;

type Action = "openLong" | "closeLong" | "openShort" | "closeShort";
type Side = "long" | "short";

export type Ledger52T0IncomeTrade = {
  id: string;
  accountId: string;
  /** 仅供管理员结算对账展示；收益归属计算始终以 accountId 为准。 */
  accountName?: string;
  relatedUserId: number;
  relatedFundId?: string;
  action: Action;
  symbol: string;
  instrumentType?: "spot" | "contract" | "option" | "grid";
  optionDirection?: "long_call" | "long_put" | "short_call" | "short_put";
  optionPremium?: number;
  optionPremiumCurrency?: "USDT" | "ETH";
  optionSettlementPrice?: number;
  optionDeliveryPrice?: number;
  quantity: number;
  price: number;
  fee: number;
  targetPrice?: number;
  targetOpeningEntryId?: string;
  createdAt: string;
  filledAt?: string;
  isPending?: boolean;
};

export type Ledger52T0IncomeSnapshot = {
  entryId: string;
  openingEntryId: string;
  beneficiaryUserId: number;
  beneficiaryUserName?: string;
  percentage: number;
  matchedQuantity: number;
};

export type Ledger52T0IncomeTransfer = {
  closingEntryId: string;
  recipientUserId: number;
  amount: number;
};

export type Ledger52T0IncomeReduction = { closingEntryId: string; amount: number; sourceNetPnl: number };

type TeamMember = {
  userId: number;
  parentUserId: number;
  depth: number;
  name: string;
  username?: string;
  avatar?: string;
};

export type Ledger52T0IncomeParts = { orderIncome: number; commissionIncome: number; sharedIncome: number };

/** 一笔已平仓收益在用户侧的最终归属类别。 */
export type Ledger52T0IncomeAllocationKind = "order" | "commission" | "shared";

export type Ledger52T0IncomeAllocationLine = {
  userId: number;
  kind: Ledger52T0IncomeAllocationKind;
  amount: number;
};

/**
 * 账户—用户结算桥的最小可审计单元。来源始终是一笔实际平仓；
 * 若历史数据无法重新匹配开仓，netPnl/variance 会明确为 null，而不会伪造为零。
 */
export type Ledger52T0ClosingIncomeAllocation = {
  closing: Ledger52T0IncomeTrade;
  netPnl: number | null;
  regularDistributable: number | null;
  recordedSharedReduction: number;
  appliedSharedReduction: number | null;
  sharedTransferTotal: number;
  allocations: Ledger52T0IncomeAllocationLine[];
  allocatedTotal: number;
  variance: number | null;
};

type RecentDetail = { netPnl?: number };
type TeamXirrCashFlow = { occurredOn: string; amount: number; atEndOfBeijingDay?: boolean };

const actionInfo: Record<Action, { opening: boolean; side: Side }> = {
  openLong: { opening: true, side: "long" },
  closeLong: { opening: false, side: "long" },
  openShort: { opening: true, side: "short" },
  closeShort: { opening: false, side: "short" },
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCalendarDateUtc(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const [, yearText, monthText, dayText] = matched;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? timestamp : null;
}

function getBeijingDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** 团队成员起始日仅比较充值发生日与非期权订单创建日，统一回传北京时间自然日。 */
function getCalendarDateText(value: unknown) {
  const matched = String(value || "").match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (!matched) return null;
  const date = `${matched[1]}-${matched[2]}-${matched[3]}`;
  return getCalendarDateUtc(date) === null ? null : date;
}

function recordEarlierCalendarDate(target: Map<number, string>, userId: number, value: unknown) {
  const date = getCalendarDateText(value);
  if (userId <= 0 || !date) return;
  const current = target.get(userId);
  if (!current || date < current) target.set(userId, date);
}

/** 与个人收益账本相同：以北京时间自然日对每笔资金流和期末净值计算实际年化 XIRR。 */
function calculateTeamXirr(cashFlows: TeamXirrCashFlow[]) {
  const grouped = new Map<number, number>();
  for (const cashFlow of cashFlows) {
    const calendarTimestamp = getCalendarDateUtc(cashFlow.occurredOn);
    if (calendarTimestamp === null || !Number.isFinite(cashFlow.amount) || Math.abs(cashFlow.amount) < 0.000001) continue;
    const timestamp = calendarTimestamp + (cashFlow.atEndOfBeijingDay ? 24 * 60 * 60 * 1000 : 0);
    grouped.set(timestamp, (grouped.get(timestamp) || 0) + cashFlow.amount);
  }
  const flows = Array.from(grouped.entries())
    .map(([timestamp, amount]) => ({ timestamp, amount }))
    .filter((cashFlow) => Math.abs(cashFlow.amount) >= 0.000001)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (flows.length < 2 || !flows.some((cashFlow) => cashFlow.amount < 0) || !flows.some((cashFlow) => cashFlow.amount > 0)) return null;
  const firstTimestamp = flows[0].timestamp;
  const lastTimestamp = flows[flows.length - 1].timestamp;
  if (lastTimestamp <= firstTimestamp) return null;
  const npv = (rate: number) => rate <= -1 ? Number.POSITIVE_INFINITY : flows.reduce((total, cashFlow) => {
    const years = (cashFlow.timestamp - firstTimestamp) / (365 * 24 * 60 * 60 * 1000);
    return total + cashFlow.amount / Math.pow(1 + rate, years);
  }, 0);
  let lower = -0.999999999;
  let upper = 1;
  let lowerValue = npv(lower);
  let upperValue = npv(upper);
  if (!Number.isFinite(lowerValue) || Number.isNaN(upperValue)) return null;
  for (let index = 0; index < 256 && lowerValue * upperValue > 0; index += 1) {
    upper = upper * 2 + 1;
    upperValue = npv(upper);
    if (Number.isNaN(upperValue) || !Number.isFinite(upper)) return null;
  }
  if (lowerValue * upperValue > 0) return null;
  for (let index = 0; index < 128; index += 1) {
    const middle = (lower + upper) / 2;
    const middleValue = npv(middle);
    if (!Number.isFinite(middleValue)) return null;
    if (Math.abs(middleValue) < 0.0000001) return middle;
    if (lowerValue * middleValue > 0) {
      lower = middle;
      lowerValue = middleValue;
    } else {
      upper = middle;
    }
  }
  const result = (lower + upper) / 2;
  return Number.isFinite(result) ? result : null;
}

function archivePrice(side: Side, value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scaled = value / 10;
  const rounded = side === "long" ? Math.ceil(scaled - 1e-9) : Math.floor(scaled + 1e-9);
  return Number((rounded * 10).toFixed(2));
}

function scopeKey(trade: Ledger52T0IncomeTrade) {
  const action = actionInfo[trade.action];
  const sourcePrice = action.opening ? trade.price : (trade.targetPrice && trade.targetPrice > 0 ? trade.targetPrice : trade.price);
  return [
    action.side,
    archivePrice(action.side, sourcePrice).toFixed(2),
    trade.accountId,
    trade.relatedUserId || "legacy-user",
    trade.relatedFundId || "legacy-fund",
  ].join(":");
}

/** 无冻结来源快照的旧记录继续按原创建记录顺序走 FIFO。 */
function sortByTime<T extends { createdAt: string; id: string }>(rows: T[]) {
  return [...rows].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

/**
 * 与T+0前端历史净收益相同的双口径匹配：先严格按报价归属档位，无法匹配的旧流水再按同账户/用户/项目FIFO回补。
 */
function buildRealizedDetails(trades: Ledger52T0IncomeTrade[], strictArchiveMatch: boolean) {
  const positions = new Map<string, { quantity: number; costBasis: number; openingFeeBasis: number }>();
  const details = new Map<string, RecentDetail>();
  for (const trade of sortByTime(trades.filter((item) => item.symbol === "ETH" && !item.isPending))) {
    const action = actionInfo[trade.action];
    const key = [
      action.side,
      ...(strictArchiveMatch ? [archivePrice(action.side, action.opening ? trade.price : (trade.targetPrice && trade.targetPrice > 0 ? trade.targetPrice : trade.price)).toFixed(2)] : []),
      trade.accountId,
      trade.relatedUserId || "legacy-user",
      trade.relatedFundId || "legacy-fund",
    ].join(":");
    if (action.opening) {
      const current = positions.get(key) ?? { quantity: 0, costBasis: 0, openingFeeBasis: 0 };
      current.quantity += trade.quantity;
      current.costBasis += trade.quantity * trade.price;
      current.openingFeeBasis += trade.fee;
      positions.set(key, current);
      continue;
    }
    const current = positions.get(key);
    const matchedQuantity = current ? Math.min(current.quantity, trade.quantity) : 0;
    const openingAverage = current && current.quantity > 0 ? current.costBasis / current.quantity : undefined;
    const allocatedOpeningFee = current && current.quantity > 0 && matchedQuantity > 0
      ? current.openingFeeBasis * (matchedQuantity / current.quantity)
      : 0;
    const closingFee = trade.quantity > 0 ? trade.fee * (matchedQuantity / trade.quantity) : 0;
    if (current && openingAverage !== undefined && matchedQuantity > 0) {
      current.quantity -= matchedQuantity;
      current.costBasis = Math.max(0, current.costBasis - openingAverage * matchedQuantity);
      current.openingFeeBasis = Math.max(0, current.openingFeeBasis - allocatedOpeningFee);
      positions.set(key, current);
    }
    if (openingAverage === undefined || matchedQuantity <= 0) {
      details.set(trade.id, {});
      continue;
    }
    const grossPnl = action.side === "long"
      ? (trade.price - openingAverage) * matchedQuantity
      : (openingAverage - trade.price) * matchedQuantity;
    details.set(trade.id, { netPnl: grossPnl - allocatedOpeningFee - closingFee });
  }
  return details;
}

function buildRecentDetails(trades: Ledger52T0IncomeTrade[], snapshots: Ledger52T0IncomeSnapshot[] = []) {
  const strict = buildRealizedDetails(trades, true);
  const fallback = buildRealizedDetails(trades, false);
  for (const [id, detail] of fallback) {
    if (strict.get(id)?.netPnl === undefined && detail.netPnl !== undefined) strict.set(id, detail);
  }
  // 冻结分佣快照是历史归属审计事实；仅在其完整覆盖一笔平仓时覆盖普通 FIFO 的推断结果。
  for (const [id, detail] of buildFrozenSnapshotDetails(trades, snapshots)) strict.set(id, detail);
  return strict;
}

type Allocation = { trade: Ledger52T0IncomeTrade; quantity: number };

/** 与逐笔报价一致：指定来源优先，历史记录才按同档位FIFO回退。 */
function buildOpeningClosingAllocations(trades: Ledger52T0IncomeTrade[]) {
  const queues = new Map<string, Array<{ id: string; remainingQuantity: number }>>();
  const allocations = new Map<string, Allocation[]>();
  for (const trade of sortByTime(trades.filter((item) => item.symbol === "ETH" && !item.isPending))) {
    const action = actionInfo[trade.action];
    const key = scopeKey(trade);
    if (action.opening) {
      const queue = queues.get(key) ?? [];
      queue.push({ id: trade.id, remainingQuantity: trade.quantity });
      queues.set(key, queue);
      continue;
    }
    const queue = queues.get(key) ?? [];
    const targets = trade.targetOpeningEntryId
      ? queue.filter((opening) => opening.id === trade.targetOpeningEntryId)
      : queue;
    let remaining = trade.quantity;
    for (const opening of targets) {
      if (remaining <= 0.0000001) break;
      if (opening.remainingQuantity <= 0.0000001) continue;
      const quantity = Math.min(opening.remainingQuantity, remaining);
      opening.remainingQuantity -= quantity;
      remaining -= quantity;
      const rows = allocations.get(opening.id) ?? [];
      rows.push({ trade, quantity });
      allocations.set(opening.id, rows);
      if (trade.targetOpeningEntryId) break;
    }
  }
  return allocations;
}

function linkedNetPnl(opening: Ledger52T0IncomeTrade, closing: Ledger52T0IncomeTrade, quantity: number) {
  if (opening.instrumentType === "option" && closing.instrumentType === "option"
    && opening.optionPremium !== undefined && opening.optionPremiumCurrency
    && opening.optionDirection && closing.optionSettlementPrice !== undefined && closing.optionDeliveryPrice !== undefined) {
    const premium = opening.optionPremiumCurrency === "ETH"
      ? opening.optionPremium * closing.optionDeliveryPrice
      : opening.optionPremium;
    const gross = (opening.optionDirection.startsWith("short")
      ? premium - closing.optionSettlementPrice
      : closing.optionSettlementPrice - premium) * quantity;
    const openingFee = opening.quantity > 0 ? opening.fee * (quantity / opening.quantity) : 0;
    const closingFee = closing.quantity > 0 ? closing.fee * (quantity / closing.quantity) : 0;
    return gross - openingFee - closingFee;
  }
  const openingFee = opening.quantity > 0 ? opening.fee * (quantity / opening.quantity) : 0;
  const closingFee = closing.quantity > 0 ? closing.fee * (quantity / closing.quantity) : 0;
  const side = actionInfo[opening.action].side;
  const gross = side === "long"
    ? (closing.price - opening.price) * quantity
    : (opening.price - closing.price) * quantity;
  return gross - openingFee - closingFee;
}

type FrozenSnapshotOpeningLink = {
  opening: Ledger52T0IncomeTrade;
  snapshots: Ledger52T0IncomeSnapshot[];
  matchedQuantity: number;
};

/**
 * 冻结分佣快照已经记录了某笔平仓实际对应的开仓。只有快照完整覆盖平仓数量时才采用，
 * 以避免旧记录的 createdAt / filledAt 写入时序不一致时，普通 FIFO 错配或漏配来源。
 */
function getFrozenSnapshotOpeningLinks(input: {
  trades: Ledger52T0IncomeTrade[];
  closing: Ledger52T0IncomeTrade;
  snapshots: Ledger52T0IncomeSnapshot[];
}) {
  const byOpening = new Map<string, Ledger52T0IncomeSnapshot[]>();
  for (const snapshot of input.snapshots) {
    if (snapshot.entryId !== input.closing.id) continue;
    const rows = byOpening.get(snapshot.openingEntryId) ?? [];
    rows.push(snapshot);
    byOpening.set(snapshot.openingEntryId, rows);
  }
  if (byOpening.size === 0) return null;
  const openingById = new Map(input.trades
    .filter((trade) => actionInfo[trade.action].opening && !trade.isPending)
    .map((trade) => [trade.id, trade]));
  const links: FrozenSnapshotOpeningLink[] = [];
  let totalMatchedQuantity = 0;
  for (const [openingEntryId, snapshots] of byOpening) {
    const opening = openingById.get(openingEntryId);
    const matchedQuantity = Math.max(...snapshots.map((snapshot) => Number(snapshot.matchedQuantity || 0)));
    if (!opening || !Number.isFinite(matchedQuantity) || matchedQuantity <= 0) return null;
    links.push({ opening, snapshots, matchedQuantity });
    totalMatchedQuantity += matchedQuantity;
  }
  return Math.abs(totalMatchedQuantity - input.closing.quantity) <= 0.000001 ? links : null;
}

function buildFrozenSnapshotDetails(trades: Ledger52T0IncomeTrade[], snapshots: Ledger52T0IncomeSnapshot[]) {
  const details = new Map<string, RecentDetail>();
  for (const closing of trades) {
    if (closing.isPending || actionInfo[closing.action].opening) continue;
    const links = getFrozenSnapshotOpeningLinks({ trades, closing, snapshots });
    if (!links) continue;
    const netPnl = links.reduce((total, link) => total + linkedNetPnl(link.opening, closing, link.matchedQuantity), 0);
    if (Number.isFinite(netPnl)) details.set(closing.id, { netPnl });
  }
  return details;
}

function regularDistributable(sourceNetPnl: number, reduction?: Ledger52T0IncomeReduction) {
  if (!Number.isFinite(sourceNetPnl) || sourceNetPnl <= 0) return sourceNetPnl;
  const amount = Number(reduction?.amount || 0);
  return Number.isFinite(amount) && amount > 0 ? Math.max(0, sourceNetPnl - Math.min(sourceNetPnl, amount)) : sourceNetPnl;
}

function buildProfitDistribution(input: {
  trades: Ledger52T0IncomeTrade[];
  snapshots: Ledger52T0IncomeSnapshot[];
  closing: Ledger52T0IncomeTrade;
  displayedNetPnl: number;
  reductions: ReadonlyMap<string, Ledger52T0IncomeReduction>;
  allocations: ReadonlyMap<string, Allocation[]>;
}) {
  const closingSnapshots = input.snapshots.filter((snapshot) => snapshot.entryId === input.closing.id);
  if (closingSnapshots.length === 0 || !Number.isFinite(input.displayedNetPnl)) return [] as Array<{ userId: number; amount: number }>;
  const byOpening = new Map<string, Ledger52T0IncomeSnapshot[]>();
  for (const snapshot of closingSnapshots) {
    const rows = byOpening.get(snapshot.openingEntryId) ?? [];
    rows.push(snapshot);
    byOpening.set(snapshot.openingEntryId, rows);
  }
  const totals = new Map<number, number>();
  const frozenLinks = getFrozenSnapshotOpeningLinks({
    trades: input.trades,
    closing: input.closing,
    snapshots: closingSnapshots,
  });
  if (frozenLinks) {
    for (const link of frozenLinks) {
      const pnl = linkedNetPnl(link.opening, input.closing, link.matchedQuantity);
      for (const snapshot of link.snapshots) {
        totals.set(snapshot.beneficiaryUserId, (totals.get(snapshot.beneficiaryUserId) || 0) + pnl * (snapshot.percentage / 100));
      }
    }
  } else {
    for (const opening of input.trades) {
      if (!actionInfo[opening.action].opening) continue;
      const snapshots = byOpening.get(opening.id);
      if (!snapshots?.length) continue;
      const rows = (input.allocations.get(opening.id) ?? []).filter((item) => item.trade.id === input.closing.id);
      for (const row of rows) {
        const pnl = linkedNetPnl(opening, row.trade, row.quantity);
        for (const snapshot of snapshots) {
          totals.set(snapshot.beneficiaryUserId, (totals.get(snapshot.beneficiaryUserId) || 0) + pnl * (snapshot.percentage / 100));
        }
      }
    }
  }
  if (totals.size === 0) {
    const weighted = closingSnapshots.map((snapshot) => ({ snapshot, weight: Math.max(0, snapshot.matchedQuantity) * Math.max(0, snapshot.percentage) }));
    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    for (const { snapshot, weight } of weighted) {
      const rate = totalWeight > 0 ? weight / totalWeight : snapshot.percentage / 100;
      totals.set(snapshot.beneficiaryUserId, (totals.get(snapshot.beneficiaryUserId) || 0) + input.displayedNetPnl * rate);
    }
  }
  const calculated = Array.from(totals.values()).reduce((sum, amount) => sum + amount, 0);
  const distributable = regularDistributable(input.displayedNetPnl, input.reductions.get(input.closing.id));
  const scale = Math.abs(calculated) > 1e-9 ? distributable / calculated : 1;
  return Array.from(totals.entries()).map(([userId, amount]) => ({ userId, amount: amount * scale }));
}

type Ledger52T0IncomeCalculationInput = {
  trades: Ledger52T0IncomeTrade[];
  snapshots: Ledger52T0IncomeSnapshot[];
  transfers: Ledger52T0IncomeTransfer[];
  reductions: Ledger52T0IncomeReduction[];
  includeClosing?: (closing: Ledger52T0IncomeTrade) => boolean;
};

/**
 * 统一的已实现收入归属引擎（逐笔视图）。周结算可通过 includeClosing 只计入指定时间窗的平仓，
 * 但仍传入完整历史开仓序列，使 FIFO、分佣快照和共享扣减不因截断历史而漂移。
 */
export function calculateLedger52T0IncomeByClosing(input: Ledger52T0IncomeCalculationInput) {
  const reductions = new Map(input.reductions.map((item) => [item.closingEntryId, item]));
  const details = buildRecentDetails(input.trades, input.snapshots);
  const openingClosingAllocations = buildOpeningClosingAllocations(input.trades);
  const transfersByClosing = new Map<string, Ledger52T0IncomeTransfer[]>();
  for (const transfer of input.transfers) {
    const rows = transfersByClosing.get(transfer.closingEntryId) ?? [];
    rows.push(transfer);
    transfersByClosing.set(transfer.closingEntryId, rows);
  }
  const result: Ledger52T0ClosingIncomeAllocation[] = [];
  for (const closing of input.trades) {
    if (closing.isPending || actionInfo[closing.action].opening) continue;
    if (input.includeClosing && !input.includeClosing(closing)) continue;
    const calculatedNetPnl = details.get(closing.id)?.netPnl;
    const netPnl = typeof calculatedNetPnl === "number" && Number.isFinite(calculatedNetPnl) ? calculatedNetPnl : null;
    const reduction = reductions.get(closing.id);
    const allocationLines: Ledger52T0IncomeAllocationLine[] = [];
    let regularDistributableAmount: number | null = null;
    if (netPnl !== null) {
      regularDistributableAmount = regularDistributable(netPnl, reduction);
      const distributions = buildProfitDistribution({
        trades: input.trades,
        snapshots: input.snapshots,
        closing,
        displayedNetPnl: netPnl,
        reductions,
        allocations: openingClosingAllocations,
      });
      if (distributions.length === 0) {
        allocationLines.push({ userId: closing.relatedUserId, kind: "order", amount: regularDistributableAmount });
      } else {
        for (const distribution of distributions) {
          allocationLines.push({
            userId: distribution.userId,
            kind: distribution.userId === closing.relatedUserId ? "order" : "commission",
            amount: distribution.amount,
          });
        }
      }
    }
    const sharedTransfers = transfersByClosing.get(closing.id) ?? [];
    for (const transfer of sharedTransfers) {
      allocationLines.push({ userId: transfer.recipientUserId, kind: "shared", amount: transfer.amount });
    }
    const allocatedTotal = allocationLines.reduce((total, item) => total + item.amount, 0);
    const sharedTransferTotal = sharedTransfers.reduce((total, item) => total + item.amount, 0);
    result.push({
      closing,
      netPnl,
      regularDistributable: regularDistributableAmount,
      recordedSharedReduction: Number(reduction?.amount || 0),
      appliedSharedReduction: netPnl === null || regularDistributableAmount === null ? null : netPnl - regularDistributableAmount,
      sharedTransferTotal,
      allocations: allocationLines,
      allocatedTotal,
      variance: netPnl === null ? null : netPnl - allocatedTotal,
    });
  };
  return result;
}

/** 统一的按用户已实现收益聚合，复用逐笔结果以保证与账户对账完全同源。 */
export function calculateLedger52T0IncomeByUser(input: Ledger52T0IncomeCalculationInput) {
  const income = new Map<number, Ledger52T0IncomeParts>();
  const add = (userId: number, field: keyof Ledger52T0IncomeParts, amount: number) => {
    if (!Number.isInteger(userId) || userId <= 0 || !Number.isFinite(amount)) return;
    const current = income.get(userId) ?? { orderIncome: 0, commissionIncome: 0, sharedIncome: 0 };
    current[field] += amount;
    income.set(userId, current);
  };
  for (const closing of calculateLedger52T0IncomeByClosing(input)) {
    for (const allocation of closing.allocations) {
      add(allocation.userId, `${allocation.kind}Income` as keyof Ledger52T0IncomeParts, allocation.amount);
    }
  }
  return income;
}

async function getRecursiveTeamMembers(rootUserId: number) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0团队数据库连接失败" });
  const members: TeamMember[] = [];
  const visited = new Set<number>([rootUserId]);
  let frontier = [rootUserId];
  let depth = 0;
  while (frontier.length > 0 && depth < 100 && members.length < 10_000) {
    const next: number[] = [];
    for (let offset = 0; offset < frontier.length; offset += 500) {
      const batch = frontier.slice(offset, offset + 500);
      const [rows] = await conn.execute(
        `SELECT id, invited_by_user_id, COALESCE(NULLIF(name, ''), NULLIF(username, ''), CONCAT('用户#', id)) AS name, NULLIF(username, '') AS username, NULLIF(avatar, '') AS avatar
           FROM users WHERE invited_by_user_id IN (${batch.map(() => "?").join(", ")}) ORDER BY id ASC`,
        batch,
      );
      for (const row of rows as any[]) {
        const userId = toNumber(row.id);
        if (userId <= 0 || visited.has(userId)) continue;
        visited.add(userId);
        members.push({
          userId,
          parentUserId: toNumber(row.invited_by_user_id),
          depth: depth + 1,
          name: String(row.name || `用户#${userId}`),
          username: row.username ? String(row.username) : undefined,
          avatar: row.avatar ? String(row.avatar) : undefined,
        });
        next.push(userId);
      }
    }
    frontier = next;
    depth += 1;
  }
  return members;
}

/** 团队页属于52号账本下的T+0功能：推荐关系存在但未加入52号账本的人不进入名单。 */
async function getLedger52MemberUserIds(userIds: number[]) {
  if (userIds.length === 0) return new Set<number>();
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0团队数据库连接失败" });
  const memberIds = new Set<number>();
  for (let offset = 0; offset < userIds.length; offset += 500) {
    const batch = userIds.slice(offset, offset + 500);
    const [rows] = await conn.execute(
      `SELECT userId FROM ledger_members WHERE ledgerId = ? AND userId IN (${batch.map(() => "?").join(", ")})`,
      [LEDGER_ID, ...batch],
    );
    for (const row of rows as any[]) memberIds.add(toNumber(row.userId));
  }
  return memberIds;
}

export async function getLedger52T0TeamOverview(input: {
  journalOwnerUserId: number;
  rootUserId: number;
}) {
  if (!LEDGER52_T0_TEAM_OVERVIEW_LEADER_IDS.has(input.rootUserId)) return { enabled: false as const };
  const [allDescendants, journal] = await Promise.all([
    getRecursiveTeamMembers(input.rootUserId),
    // 团队页只在负责人实际点开时读取完整历史；专用读取器分批取收益和XIRR所需事实，
    // 不沿用报价页首屏限流，也不加载无关目录、行情、审计或提醒。
    getLedger52T0JournalTeamFinancialFacts({ journalOwnerUserId: input.journalOwnerUserId }),
  ]);
  const entries = Array.isArray((journal as any).entries) ? (journal as any).entries : [];
  const transfers = Array.isArray((journal as any).sharedIncomeTransfers) ? (journal as any).sharedIncomeTransfers : [];
  const cashFlows = Array.isArray((journal as any).payoutCashFlows) ? (journal as any).payoutCashFlows : [];
  // 团队总览不纳入期权：期权订单及其预设分佣、共享到账均不作为团队资格或收益。
  const nonOptionEntries = entries.filter((entry: any) => String(entry?.instrumentType || "contract") !== "option" && Math.abs(toNumber(entry?.quantity)) > 0.000001);
  const nonOptionEntryIds = new Set(nonOptionEntries.map((entry: any) => String(entry.id)));
  const nonOptionSnapshots = ((journal as any).profitShareSnapshots ?? []).filter((snapshot: any) => nonOptionEntryIds.has(String(snapshot?.openingEntryId)));
  const nonOptionTransfers = transfers.filter((transfer: any) => nonOptionEntryIds.has(String(transfer?.closingEntryId)) && Math.abs(toNumber(transfer?.amount)) > 0.000001);
  const nonOptionReductions = ((journal as any).sharedIncomeReductions ?? []).filter((row: any) => nonOptionEntryIds.has(String(row?.closingEntryId)));
  // 成员卡不展示来源类型：只在充值与非期权订单两个时间点中取较早的自然日。
  const firstActivityOnByUser = new Map<number, string>();
  for (const entry of nonOptionEntries) {
    recordEarlierCalendarDate(firstActivityOnByUser, toNumber(entry?.relatedUserId), entry?.createdAt);
  }
  for (const flow of cashFlows) {
    if (String(flow?.direction) !== "deposit" || Math.abs(toNumber(flow?.amount)) <= 0.000001) continue;
    recordEarlierCalendarDate(firstActivityOnByUser, toNumber(flow?.relatedUserId), flow?.occurredOn);
  }
  // 最低准入：本人有普通T+0订单、收到普通订单分佣/共享，或有真实入金/提现流水。只有推荐关系不够。
  const t0ActivityUserIds = new Set<number>();
  for (const entry of nonOptionEntries) {
    const userId = toNumber(entry?.relatedUserId);
    if (userId > 0) t0ActivityUserIds.add(userId);
  }
  for (const snapshot of nonOptionSnapshots) {
    const userId = toNumber(snapshot?.beneficiaryUserId);
    if (userId > 0) t0ActivityUserIds.add(userId);
  }
  for (const transfer of nonOptionTransfers) {
    const userId = toNumber(transfer?.recipientUserId);
    if (userId > 0) t0ActivityUserIds.add(userId);
  }
  for (const flow of cashFlows) {
    const userId = toNumber(flow?.relatedUserId);
    if (userId > 0 && Math.abs(toNumber(flow?.amount)) > 0.000001) t0ActivityUserIds.add(userId);
  }
  const ledgerMemberIds = await getLedger52MemberUserIds(allDescendants.map((member) => member.userId));
  const rawMemberById = new Map(allDescendants.map((member) => [member.userId, member]));
  const eligibleMemberIds = new Set(allDescendants
    .filter((member) => ledgerMemberIds.has(member.userId) && t0ActivityUserIds.has(member.userId))
    .map((member) => member.userId));
  // 若中间推荐节点没有T+0活动，不展示该节点；有活动的后代提升到最近可展示祖先，图形仍保持可读。
  const visibleMembersById = new Map<number, TeamMember>();
  for (const member of [...allDescendants].sort((left, right) => left.depth - right.depth || left.userId - right.userId)) {
    if (!eligibleMemberIds.has(member.userId)) continue;
    let parentUserId = member.parentUserId;
    const visitedParents = new Set<number>();
    while (parentUserId > 0 && parentUserId !== input.rootUserId && !visibleMembersById.has(parentUserId) && !visitedParents.has(parentUserId)) {
      visitedParents.add(parentUserId);
      parentUserId = rawMemberById.get(parentUserId)?.parentUserId || input.rootUserId;
    }
    const visibleParent = visibleMembersById.get(parentUserId);
    visibleMembersById.set(member.userId, {
      ...member,
      parentUserId: parentUserId || input.rootUserId,
      depth: visibleParent ? visibleParent.depth + 1 : 1,
    });
  }
  const members = Array.from(visibleMembersById.values());
  const memberIds = new Set(members.map((member) => member.userId));
  // 上方已显式请求完整历史；若读取异常会直接返回可见错误，不能用截断结果伪造收益。
  const incomeComplete = true;
  const trades: Ledger52T0IncomeTrade[] = nonOptionEntries.map((entry: any) => ({
    id: String(entry.id), accountId: String(entry.accountId), relatedUserId: toNumber(entry.relatedUserId), relatedFundId: entry.relatedFundId ? String(entry.relatedFundId) : undefined,
    action: String(entry.action) as Action, symbol: String(entry.symbol || "ETH"), instrumentType: entry.instrumentType,
    optionDirection: entry.optionDirection, optionPremium: entry.optionPremium === undefined ? undefined : toNumber(entry.optionPremium), optionPremiumCurrency: entry.optionPremiumCurrency,
    optionSettlementPrice: entry.optionSettlementPrice === undefined ? undefined : toNumber(entry.optionSettlementPrice), optionDeliveryPrice: entry.optionDeliveryPrice === undefined ? undefined : toNumber(entry.optionDeliveryPrice),
    quantity: toNumber(entry.quantity), price: toNumber(entry.price), fee: toNumber(entry.fee), targetPrice: entry.targetPrice === undefined ? undefined : toNumber(entry.targetPrice),
    targetOpeningEntryId: entry.targetOpeningEntryId ? String(entry.targetOpeningEntryId) : undefined, createdAt: String(entry.createdAt || ""), filledAt: entry.filledAt ? String(entry.filledAt) : undefined, isPending: Boolean(entry.isPending),
  })).filter((trade) => Boolean(actionInfo[trade.action]) && trade.relatedUserId > 0);
  const incomeByUser = incomeComplete ? calculateLedger52T0IncomeByUser({
    trades,
    snapshots: nonOptionSnapshots,
    transfers: nonOptionTransfers.map((transfer: any) => ({ closingEntryId: String(transfer.closingEntryId), recipientUserId: toNumber(transfer.recipientUserId), amount: toNumber(transfer.amount) })),
    reductions: nonOptionReductions.map((row: any) => ({ closingEntryId: String(row.closingEntryId), amount: toNumber(row.amount), sourceNetPnl: toNumber(row.sourceNetPnl) })),
  }) : new Map<number, Ledger52T0IncomeParts>();
  const deposits = new Map<number, number>();
  const withdrawals = new Map<number, number>();
  const investmentCashFlowsByUser = new Map<number, TeamXirrCashFlow[]>();
  for (const flow of cashFlows) {
    const userId = toNumber(flow.relatedUserId);
    if (!memberIds.has(userId)) continue;
    const amount = toNumber(flow.amount);
    const isDeposit = String(flow.direction) === "deposit";
    const target = isDeposit ? deposits : withdrawals;
    target.set(userId, (target.get(userId) || 0) + amount);
    if (Math.abs(amount) > 0.000001) {
      const userCashFlows = investmentCashFlowsByUser.get(userId) || [];
      userCashFlows.push({ occurredOn: String(flow.occurredOn || "").slice(0, 10), amount: isDeposit ? -amount : amount });
      investmentCashFlowsByUser.set(userId, userCashFlows);
    }
  }
  const asOfDate = getBeijingDateValue();
  const memberRows = members.map((member) => {
    const depositAmount = deposits.get(member.userId) || 0;
    const withdrawalAmount = withdrawals.get(member.userId) || 0;
    const income = incomeByUser.get(member.userId) ?? { orderIncome: 0, commissionIncome: 0, sharedIncome: 0 };
    const currentCumulativeIncome = income.orderIncome + income.commissionIncome + income.sharedIncome;
    // 已实现收益未被提现回写扣减，期末净值按与个人账本相同口径扣除累计提现，避免在XIRR中重复计入。
    const currentNetValue = depositAmount + currentCumulativeIncome - withdrawalAmount;
    const annualizedReturn = incomeComplete ? calculateTeamXirr([
      ...(investmentCashFlowsByUser.get(member.userId) || []),
      { occurredOn: asOfDate, amount: currentNetValue, atEndOfBeijingDay: true },
    ]) : null;
    return {
      ...member,
      firstActivityOn: firstActivityOnByUser.get(member.userId) || null,
      cumulativeDepositAmount: depositAmount,
      currentCumulativeIncome: incomeComplete ? currentCumulativeIncome : null,
      cumulativeWithdrawalAmount: withdrawalAmount,
      realizedIncomeRate: incomeComplete && depositAmount > 0 ? currentCumulativeIncome / depositAmount : null,
      annualizedReturn,
      hasT0FinancialData: true,
    };
  }).sort((left, right) => left.depth - right.depth || left.name.localeCompare(right.name, "zh-CN") || left.userId - right.userId);
  const directMemberCount = memberRows.filter((member) => member.depth === 1).length;
  const cumulativeDepositAmount = memberRows.reduce((sum, member) => sum + member.cumulativeDepositAmount, 0);
  const cumulativeWithdrawalAmount = memberRows.reduce((sum, member) => sum + member.cumulativeWithdrawalAmount, 0);
  const currentCumulativeIncome = incomeComplete ? memberRows.reduce((sum, member) => sum + Number(member.currentCumulativeIncome || 0), 0) : null;
  return {
    enabled: true as const,
    asOf: new Date().toISOString(),
    relation: {
      rootUserId: input.rootUserId,
      rootIncluded: false,
      directMemberCount,
      recursiveMemberCount: memberRows.length,
      qualification: "52号账本成员且有非期权T+0下单、入金/提现、收到分佣或收到共享记录",
    },
    financialDefinition: {
      income: "非期权本人订单实际归属 + 收到分佣 + 已到账共享收益",
      excludes: ["期权订单及其分佣共享", "未平仓浮盈亏", "提现冲减", "钱包余额"],
      rate: "回报率为累计已实现收益 ÷ 累计入金；年化回报为逐笔入金、提现及当前非期权已实现净值的实际年化XIRR",
    },
    dataCompleteness: {
      isComplete: incomeComplete,
      reason: incomeComplete ? undefined : "当前账本读取已达到历史记录上限，累计收益待全量核算",
      calculationVersion: "t0-team-income-v1",
    },
    summary: {
      cumulativeDepositAmount,
      currentCumulativeIncome,
      cumulativeWithdrawalAmount,
      realizedIncomeRate: incomeComplete && cumulativeDepositAmount > 0 && currentCumulativeIncome !== null
        ? currentCumulativeIncome / cumulativeDepositAmount
        : null,
    },
    members: memberRows,
  };
}
