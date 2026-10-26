import { createHash } from "crypto";
import { TRPCError } from "@trpc/server";
import { getDbConnection, withDatabaseLock } from "./db";
import { getLedger52T0Journal, getLedger52T0JournalSettlementFinancialFacts, type T0JournalReadScope } from "./ledger52-t0-journal";
import { listLedger52T0SettlementAdjustments, type Ledger52T0SettlementAdjustment } from "./ledger52-t0-settlement-adjustments";
import {
  createLedger52T0SettlementReconciliationConfirmation,
  getLatestLedger52T0SettlementReconciliationConfirmation,
  type Ledger52T0SettlementReconciliationConfirmation,
} from "./ledger52-t0-settlement-reconciliation-confirmations";
import {
  buildLedger52T0IncomeAttributionContext,
  getLedger52T0TeamOverview,
  type Ledger52T0IncomeAttributionContext,
  type Ledger52T0IncomeReduction,
  type Ledger52T0IncomeSnapshot,
  type Ledger52T0IncomeTrade,
  type Ledger52T0IncomeTransfer,
} from "./ledger52-t0-team-overview";

const LEDGER_ID = 52;
// v2 起，周结算只冻结当周已实现收益；本金和资金进出仍由独立充值/提现流水管理。
const CALCULATION_VERSION = "t0-weekly-income-settlement-v2";
const SETTLEMENT_TIMEZONE = "Asia/Shanghai";
const SETTLEMENT_SNAPSHOT_MINUTE_AFTER_BOUNDARY = 5;
let weeklySettlementSchedulerStarted = false;

type WeekWindow = {
  weekStartBjt: string;
  weekEndExclusiveBjt: string;
  timezone: typeof SETTLEMENT_TIMEZONE;
  periodStartUtc: string;
  periodEndUtc: string;
};

type SettlementIncome = {
  order: number;
  commission: number;
  shared: number;
  total: number;
  orderCount: number;
  commissionCount: number;
  sharedCount: number;
};

type SettlementMember = {
  userId: number;
  name: string;
  income: SettlementIncome;
  /** 仅展示用的北京时间逐日归集；与本周同一批逐笔归属结果同源。旧冻结快照可不含此字段。 */
  dailyIncomeByDate?: Record<string, SettlementIncome>;
};

type SettlementReport = {
  calculationVersion: typeof CALCULATION_VERSION;
  generatedAt: string;
  status: "realtime" | "frozen" | "backfill";
  period: WeekWindow;
  sourceCutoffAt: string;
  sourceCounts: { entries: number; closings: number; sharedTransfers: number };
  summary: {
    participantCount: number;
    income: SettlementIncome;
  };
  members: SettlementMember[];
};

type SettlementHistoryItem = {
  id: string;
  kind: "frozen" | "backfill";
  frozenAt?: string;
  sourceHash?: string;
  report: SettlementReport;
};

type SettlementAllocationIncome = {
  order: number;
  commission: number;
  shared: number;
  /** 追加式结算调整单；不回写或伪装为原订单、分佣、共享收益。 */
  adjustment: number;
  total: number;
};

type SettlementAccountReconciliationClosing = {
  closingEntryId: string;
  occurredAt: string;
  ownerUserId: number;
  ownerName: string;
  action: "closeLong" | "closeShort";
  quantity: number;
  fee: number;
  netPnl: number | null;
  regularDistributable: number | null;
  recordedSharedReduction: number;
  sharedTransferTotal: number;
  allocatedTotal: number;
  variance: number | null;
  allocations: Array<{
    userId: number;
    name: string;
    kind: "order" | "commission" | "shared";
    amount: number;
  }>;
};

type SettlementAccountReconciliationAccount = {
  accountId: string;
  accountName: string;
  closingCount: number;
  unreconciledClosingCount: number;
  recipientCount: number;
  netPnl: number;
  allocatedTotal: number;
  variance: number;
  closings: SettlementAccountReconciliationClosing[];
};

type SettlementAccountReconciliationDestination = {
  userId: number;
  name: string;
  income: SettlementAllocationIncome;
  sources: Array<{
    accountId: string;
    accountName: string;
    closingCount: number;
    income: SettlementAllocationIncome;
  }>;
};

type SettlementAccountReconciliation = {
  generatedAt: string;
  period: WeekWindow;
  sourceCutoffAt: string;
  summary: {
    accountCount: number;
    closingCount: number;
    unreconciledClosingCount: number;
    netPnl: number;
    allocatedTotal: number;
    variance: number;
  };
  accounts: SettlementAccountReconciliationAccount[];
  destinations: SettlementAccountReconciliationDestination[];
  adjustments: Ledger52T0SettlementAdjustment[];
  definition: string;
};

type SettlementReconciliationReference = {
  status: "realtime" | "frozen" | "backfill";
  frozenAt?: string;
  /** 冻结周保存时的不可变周收益来源哈希；实时/回溯周没有这一项。 */
  frozenSourceHash?: string;
  /** 本次账户对账按完整当前事实重算的逐笔账户—用户来源哈希。 */
  sourceHash: string;
  /** 当前周全部追加调整凭证的稳定哈希；包含暂挂说明。 */
  adjustmentHash: string;
  /** 冻结周的当前事实若已不同于冻结快照，不能静默做“账目已平”确认。 */
  frozenSourceChanged: boolean;
};

type SettlementAccountReconciliationView = SettlementAccountReconciliation & {
  reconciliationHash: string;
  settlementReference: SettlementReconciliationReference;
  confirmation: {
    state: "unconfirmed" | "confirmed" | "stale";
    latest: Ledger52T0SettlementReconciliationConfirmation | null;
  };
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDatePartsInBeijing(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SETTLEMENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return {
    year: Number(part("year")),
    month: Number(part("month")),
    day: Number(part("day")),
    hour: Number(part("hour")),
    minute: Number(part("minute")),
    second: Number(part("second")),
  };
}

function toBjtDateText(date: Date) {
  const parts = getDatePartsInBeijing(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addCalendarDays(dateText: string, days: number) {
  const matched = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) throw new Error(`无效的北京时间日期：${dateText}`);
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function beijingDateBoundaryUtc(dateText: string) {
  const matched = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) throw new Error(`无效的北京时间日期：${dateText}`);
  // 北京时间 00:00 = UTC 前一日 16:00；以显式偏移避免服务器时区参与计算。
  return new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]), -8, 0, 0)).toISOString();
}

/** 返回包含当前时点的北京时间周一 00:00 至下周一 00:00 的稳定窗口。 */
export function getLedger52T0WeekWindow(now = new Date()): WeekWindow {
  const parts = getDatePartsInBeijing(now);
  const bjtTodayAtUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const mondayOffset = (bjtTodayAtUtc.getUTCDay() + 6) % 7;
  const startDate = new Date(bjtTodayAtUtc.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
  const weekStartBjt = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, "0")}-${String(startDate.getUTCDate()).padStart(2, "0")}`;
  const weekEndExclusiveBjt = addCalendarDays(weekStartBjt, 7);
  return {
    weekStartBjt,
    weekEndExclusiveBjt,
    timezone: SETTLEMENT_TIMEZONE,
    periodStartUtc: beijingDateBoundaryUtc(weekStartBjt),
    periodEndUtc: beijingDateBoundaryUtc(weekEndExclusiveBjt),
  };
}

function getWeekWindowFromStart(weekStartBjt: string): WeekWindow {
  const weekEndExclusiveBjt = addCalendarDays(weekStartBjt, 7);
  return {
    weekStartBjt,
    weekEndExclusiveBjt,
    timezone: SETTLEMENT_TIMEZONE,
    periodStartUtc: beijingDateBoundaryUtc(weekStartBjt),
    periodEndUtc: beijingDateBoundaryUtc(weekEndExclusiveBjt),
  };
}

function getWeekStartBjtForDate(dateText: string) {
  const matched = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return addCalendarDays(dateText, -mondayOffset);
}

function getEffectiveTradeOccurredAt(trade: Ledger52T0IncomeTrade) {
  // 挂单按实际成交时点归周。普通成交单的 createdAt 由现有映射对应 trade_time。
  return trade.filledAt || trade.createdAt;
}

function getBeijingDateFromValue(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : toBjtDateText(date);
}

function isDateInWindow(dateText: string | null, window: WeekWindow) {
  return Boolean(dateText && dateText >= window.weekStartBjt && dateText < window.weekEndExclusiveBjt);
}

function isBeforeWindowEnd(dateText: string | null, window: WeekWindow) {
  return Boolean(dateText && dateText < window.weekEndExclusiveBjt);
}

function emptyIncome(): SettlementIncome {
  return { order: 0, commission: 0, shared: 0, total: 0, orderCount: 0, commissionCount: 0, sharedCount: 0 };
}

function getNameMap(journal: any, userIds: number[]) {
  const names = new Map<number, string>();
  for (const entry of Array.isArray(journal?.entries) ? journal.entries : []) {
    const userId = toNumber(entry?.relatedUserId);
    const name = String(entry?.relatedUserName || "").trim();
    if (userId > 0 && name) names.set(userId, name);
  }
  for (const snapshot of Array.isArray(journal?.profitShareSnapshots) ? journal.profitShareSnapshots : []) {
    const userId = toNumber(snapshot?.beneficiaryUserId);
    const name = String(snapshot?.beneficiaryUserName || "").trim();
    if (userId > 0 && name) names.set(userId, name);
  }
  for (const transfer of Array.isArray(journal?.sharedIncomeTransfers) ? journal.sharedIncomeTransfers : []) {
    const userId = toNumber(transfer?.recipientUserId);
    const name = String(transfer?.recipientUserName || "").trim();
    if (userId > 0 && name) names.set(userId, name);
  }
  return { names, missingUserIds: userIds.filter((userId) => !names.has(userId)) };
}

async function addDirectoryNames(names: Map<number, string>, userIds: number[]) {
  const missing = userIds.filter((userId) => userId > 0 && !names.has(userId));
  if (missing.length === 0) return;
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0周结算数据库连接失败" });
  for (let offset = 0; offset < missing.length; offset += 500) {
    const batch = missing.slice(offset, offset + 500);
    const [rows] = await conn.execute(
      `SELECT id, COALESCE(NULLIF(name, ''), NULLIF(username, ''), CONCAT('用户#', id)) AS name FROM users WHERE id IN (${batch.map(() => "?").join(", ")})`,
      batch,
    );
    for (const row of rows as any[]) names.set(toNumber(row.id), String(row.name || `用户#${row.id}`));
  }
}

function mapTrades(entries: any[]): Ledger52T0IncomeTrade[] {
  const allowedActions = new Set(["openLong", "closeLong", "openShort", "closeShort"]);
  return entries.map((entry) => ({
    id: String(entry?.id || ""),
    accountId: String(entry?.accountId || ""),
    accountName: entry?.accountName ? String(entry.accountName) : undefined,
    relatedUserId: toNumber(entry?.relatedUserId),
    relatedFundId: entry?.relatedFundId ? String(entry.relatedFundId) : undefined,
    action: String(entry?.action || "") as Ledger52T0IncomeTrade["action"],
    symbol: String(entry?.symbol || "ETH"),
    instrumentType: entry?.instrumentType,
    optionDirection: entry?.optionDirection,
    optionPremium: entry?.optionPremium === undefined ? undefined : toNumber(entry.optionPremium),
    optionPremiumCurrency: entry?.optionPremiumCurrency,
    optionSettlementPrice: entry?.optionSettlementPrice === undefined ? undefined : toNumber(entry.optionSettlementPrice),
    optionDeliveryPrice: entry?.optionDeliveryPrice === undefined ? undefined : toNumber(entry.optionDeliveryPrice),
    quantity: toNumber(entry?.quantity),
    price: toNumber(entry?.price),
    fee: toNumber(entry?.fee),
    targetPrice: entry?.targetPrice === undefined ? undefined : toNumber(entry.targetPrice),
    targetOpeningEntryId: entry?.targetOpeningEntryId ? String(entry.targetOpeningEntryId) : undefined,
    createdAt: String(entry?.createdAt || ""),
    filledAt: entry?.filledAt ? String(entry.filledAt) : undefined,
    isPending: Boolean(entry?.isPending),
  })).filter((trade) => trade.id && trade.relatedUserId > 0 && allowedActions.has(trade.action));
}

function mapSnapshots(rows: any[]): Ledger52T0IncomeSnapshot[] {
  return rows.map((row) => ({
    entryId: String(row?.entryId || ""),
    openingEntryId: String(row?.openingEntryId || ""),
    beneficiaryUserId: toNumber(row?.beneficiaryUserId),
    beneficiaryUserName: row?.beneficiaryUserName ? String(row.beneficiaryUserName) : undefined,
    percentage: toNumber(row?.percentage),
    matchedQuantity: toNumber(row?.matchedQuantity),
  })).filter((row) => row.entryId && row.openingEntryId && row.beneficiaryUserId > 0);
}

function mapTransfers(rows: any[]): Ledger52T0IncomeTransfer[] {
  return rows.map((row) => ({
    closingEntryId: String(row?.closingEntryId || ""),
    recipientUserId: toNumber(row?.recipientUserId),
    amount: toNumber(row?.amount),
  })).filter((row) => row.closingEntryId && row.recipientUserId > 0 && Number.isFinite(row.amount));
}

function mapReductions(rows: any[]): Ledger52T0IncomeReduction[] {
  return rows.map((row) => ({
    closingEntryId: String(row?.closingEntryId || ""),
    amount: toNumber(row?.amount),
    sourceNetPnl: toNumber(row?.sourceNetPnl),
  })).filter((row) => row.closingEntryId);
}

/** 单次结算请求中可复用的纯事实映射；不包含可变目录名称、调整单或确认状态。 */
type SettlementIncomeFacts = {
  trades: Ledger52T0IncomeTrade[];
  snapshots: Ledger52T0IncomeSnapshot[];
  transfers: Ledger52T0IncomeTransfer[];
  reductions: Ledger52T0IncomeReduction[];
  tradeById: Map<string, Ledger52T0IncomeTrade>;
};

function getSettlementIncomeFacts(journal: any): SettlementIncomeFacts {
  const trades = mapTrades(Array.isArray(journal?.entries) ? journal.entries : []);
  return {
    trades,
    snapshots: mapSnapshots(Array.isArray(journal?.profitShareSnapshots) ? journal.profitShareSnapshots : []),
    transfers: mapTransfers(Array.isArray(journal?.sharedIncomeTransfers) ? journal.sharedIncomeTransfers : []),
    reductions: mapReductions(Array.isArray(journal?.sharedIncomeReductions) ? journal.sharedIncomeReductions : []),
    tradeById: new Map(trades.map((trade) => [trade.id, trade])),
  };
}

function buildSettlementIncomeAttribution(facts: SettlementIncomeFacts) {
  return buildLedger52T0IncomeAttributionContext({
    trades: facts.trades,
    snapshots: facts.snapshots,
    transfers: facts.transfers,
    reductions: facts.reductions,
  });
}

function getSettlementKnownUserIds(facts: SettlementIncomeFacts) {
  return Array.from(new Set([
    ...facts.trades.map((trade) => trade.relatedUserId),
    ...facts.snapshots.map((snapshot) => snapshot.beneficiaryUserId),
    ...facts.transfers.map((transfer) => transfer.recipientUserId),
  ].filter((userId) => userId > 0)));
}

function sumIncomeParts(parts: Iterable<SettlementIncome>) {
  const output = emptyIncome();
  for (const item of parts) {
    output.order += item.order;
    output.commission += item.commission;
    output.shared += item.shared;
    output.orderCount += item.orderCount;
    output.commissionCount += item.commissionCount;
    output.sharedCount += item.sharedCount;
  }
  output.total = output.order + output.commission + output.shared;
  return output;
}

function emptyAllocationIncome(): SettlementAllocationIncome {
  return { order: 0, commission: 0, shared: 0, adjustment: 0, total: 0 };
}

function addAllocationIncome(target: SettlementAllocationIncome, kind: "order" | "commission" | "shared", amount: number) {
  target[kind] += amount;
  target.total = target.order + target.commission + target.shared + target.adjustment;
}

function addSettlementAdjustmentIncome(target: SettlementAllocationIncome, amount: number) {
  target.adjustment += amount;
  target.total = target.order + target.commission + target.shared + target.adjustment;
}

const SETTLEMENT_RECONCILIATION_TOLERANCE = 0.000001;

/**
 * 管理员专用的账户—用户结算桥。只读复用统一收益归属引擎：
 * 每笔来源平仓的实际净收益，必须等于订单/分佣/共享三类用户去向加上明确差额。
 */
function buildWeeklySettlementAccountReconciliation(
  journal: any,
  window: WeekWindow,
  generatedAt = new Date().toISOString(),
  resolvedNames?: Map<number, string>,
  facts?: SettlementIncomeFacts,
  attribution?: Ledger52T0IncomeAttributionContext,
): SettlementAccountReconciliation {
  const settlementFacts = facts ?? getSettlementIncomeFacts(journal);
  const { trades } = settlementFacts;
  const isClosing = (trade: Ledger52T0IncomeTrade) => trade.action === "closeLong" || trade.action === "closeShort";
  const inPeriodClosing = (trade: Ledger52T0IncomeTrade) => isClosing(trade)
    && !trade.isPending
    && isDateInWindow(getBeijingDateFromValue(getEffectiveTradeOccurredAt(trade)), window);
  const rows = (attribution ?? buildSettlementIncomeAttribution(settlementFacts)).closings.filter((row) => inPeriodClosing(row.closing));
  const userIds = new Set<number>();
  const accountRows = new Map<string, {
    accountId: string;
    accountName: string;
    closingCount: number;
    unreconciledClosingCount: number;
    recipientIds: Set<number>;
    netPnl: number;
    allocatedTotal: number;
    variance: number;
    closings: SettlementAccountReconciliationClosing[];
  }>();
  const destinationRows = new Map<number, {
    userId: number;
    income: SettlementAllocationIncome;
    sources: Map<string, { accountId: string; accountName: string; closingIds: Set<string>; income: SettlementAllocationIncome }>;
  }>();

  for (const row of rows) {
    const accountId = row.closing.accountId || "unknown";
    const accountName = row.closing.accountName?.trim() || `账户#${accountId}`;
    const account = accountRows.get(accountId) ?? {
      accountId,
      accountName,
      closingCount: 0,
      unreconciledClosingCount: 0,
      recipientIds: new Set<number>(),
      netPnl: 0,
      allocatedTotal: 0,
      variance: 0,
      closings: [],
    };
    account.closingCount += 1;
    if (row.netPnl !== null) account.netPnl += row.netPnl;
    account.allocatedTotal += row.allocatedTotal;
    if (row.variance !== null) account.variance += row.variance;
    if (row.netPnl === null || row.variance === null || Math.abs(row.variance) > SETTLEMENT_RECONCILIATION_TOLERANCE) {
      account.unreconciledClosingCount += 1;
    }
    userIds.add(row.closing.relatedUserId);
    const allocations = row.allocations.map((allocation) => {
      userIds.add(allocation.userId);
      account.recipientIds.add(allocation.userId);
      const destination = destinationRows.get(allocation.userId) ?? {
        userId: allocation.userId,
        income: emptyAllocationIncome(),
        sources: new Map(),
      };
      addAllocationIncome(destination.income, allocation.kind, allocation.amount);
      const source = destination.sources.get(accountId) ?? {
        accountId,
        accountName,
        closingIds: new Set<string>(),
        income: emptyAllocationIncome(),
      };
      source.closingIds.add(row.closing.id);
      addAllocationIncome(source.income, allocation.kind, allocation.amount);
      destination.sources.set(accountId, source);
      destinationRows.set(allocation.userId, destination);
      return { userId: allocation.userId, name: `用户#${allocation.userId}`, kind: allocation.kind, amount: allocation.amount };
    });
    account.closings.push({
      closingEntryId: row.closing.id,
      occurredAt: getEffectiveTradeOccurredAt(row.closing),
      ownerUserId: row.closing.relatedUserId,
      ownerName: `用户#${row.closing.relatedUserId}`,
      action: row.closing.action as "closeLong" | "closeShort",
      quantity: row.closing.quantity,
      fee: row.closing.fee,
      netPnl: row.netPnl,
      regularDistributable: row.regularDistributable,
      recordedSharedReduction: row.recordedSharedReduction,
      sharedTransferTotal: row.sharedTransferTotal,
      allocatedTotal: row.allocatedTotal,
      variance: row.variance,
      allocations,
    });
    accountRows.set(accountId, account);
  }

  const names = resolvedNames ?? getNameMap(journal, Array.from(userIds)).names;
  const accounts = Array.from(accountRows.values()).map((account) => ({
    accountId: account.accountId,
    accountName: account.accountName,
    closingCount: account.closingCount,
    unreconciledClosingCount: account.unreconciledClosingCount,
    recipientCount: account.recipientIds.size,
    netPnl: account.netPnl,
    allocatedTotal: account.allocatedTotal,
    variance: account.variance,
    closings: account.closings
      .map((closing) => ({
        ...closing,
        ownerName: names.get(closing.ownerUserId) || closing.ownerName,
        allocations: closing.allocations.map((allocation) => ({ ...allocation, name: names.get(allocation.userId) || allocation.name })),
      }))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.closingEntryId.localeCompare(left.closingEntryId)),
  })).sort((left, right) => right.netPnl - left.netPnl || left.accountName.localeCompare(right.accountName, "zh-CN"));
  const destinations = Array.from(destinationRows.values()).map((destination) => ({
    userId: destination.userId,
    name: names.get(destination.userId) || `用户#${destination.userId}`,
    income: destination.income,
    sources: Array.from(destination.sources.values())
      .map((source) => ({ accountId: source.accountId, accountName: source.accountName, closingCount: source.closingIds.size, income: source.income }))
      .sort((left, right) => right.income.total - left.income.total || left.accountName.localeCompare(right.accountName, "zh-CN")),
  })).sort((left, right) => right.income.total - left.income.total || left.name.localeCompare(right.name, "zh-CN"));
  const summary = accounts.reduce((total, account) => ({
    accountCount: total.accountCount + 1,
    closingCount: total.closingCount + account.closingCount,
    unreconciledClosingCount: total.unreconciledClosingCount + account.unreconciledClosingCount,
    netPnl: total.netPnl + account.netPnl,
    allocatedTotal: total.allocatedTotal + account.allocatedTotal,
    variance: total.variance + account.variance,
  }), { accountCount: 0, closingCount: 0, unreconciledClosingCount: 0, netPnl: 0, allocatedTotal: 0, variance: 0 });
  return {
    generatedAt,
    period: window,
    sourceCutoffAt: window.periodEndUtc,
    summary,
    accounts,
    destinations,
    adjustments: [],
    definition: "来源为本周实际平仓后的净收益（已扣开仓与平仓手续费）；用户去向为订单、冻结分佣与共享收益。每笔平仓均单独核对：来源净收益 = 用户去向合计 + 差额。",
  };
}

/**
 * 调整单是原始订单、分佣快照、共享流水之外的独立追加层。
 * 其金额已由保存事务校验：账户收益补正 = 用户去向合计；用户去向调整合计 = 0。
 */
function applyWeeklySettlementAdjustments(
  report: SettlementAccountReconciliation,
  adjustments: Ledger52T0SettlementAdjustment[],
): SettlementAccountReconciliation {
  if (adjustments.length === 0) return report;
  const accountRows = new Map(report.accounts.map((account) => [account.accountId, {
    ...account,
    closings: account.closings.map((closing) => ({ ...closing, allocations: closing.allocations.map((allocation) => ({ ...allocation })) })),
  }]));
  const recipientIdsByAccount = new Map(report.accounts.map((account) => [
    account.accountId,
    new Set(account.closings.flatMap((closing) => closing.allocations.map((allocation) => allocation.userId))),
  ]));
  const destinationRows = new Map(report.destinations.map((destination) => [destination.userId, {
    userId: destination.userId,
    name: destination.name,
    income: { ...destination.income },
    sources: new Map(destination.sources.map((source) => [source.accountId, {
      accountId: source.accountId,
      accountName: source.accountName,
      closingCount: source.closingCount,
      income: { ...source.income },
    }])),
  }]));

  for (const adjustment of adjustments) {
    const allocationDelta = adjustment.allocations.reduce((total, line) => total + line.amount, 0);
    let account = adjustment.accountId ? accountRows.get(adjustment.accountId) : undefined;
    if (adjustment.accountId && !account) {
      account = {
        accountId: adjustment.accountId,
        accountName: adjustment.accountName || `账户#${adjustment.accountId}`,
        closingCount: 0,
        unreconciledClosingCount: 0,
        recipientCount: 0,
        netPnl: 0,
        allocatedTotal: 0,
        variance: 0,
        closings: [],
      };
      accountRows.set(adjustment.accountId, account);
      recipientIdsByAccount.set(adjustment.accountId, new Set());
    }
    if (account) {
      if (adjustment.type === "source_correction") account.netPnl += adjustment.sourceNetPnlDelta;
      account.allocatedTotal += allocationDelta;
      account.variance = account.netPnl - account.allocatedTotal;
    }
    for (const line of adjustment.allocations) {
      if (!Number.isFinite(line.amount) || Math.abs(line.amount) <= SETTLEMENT_RECONCILIATION_TOLERANCE) continue;
      const destination = destinationRows.get(line.userId) ?? {
        userId: line.userId,
        name: line.name || `用户#${line.userId}`,
        income: emptyAllocationIncome(),
        sources: new Map<string, { accountId: string; accountName: string; closingCount: number; income: SettlementAllocationIncome }>(),
      };
      addSettlementAdjustmentIncome(destination.income, line.amount);
      if (account) {
        const source = destination.sources.get(account.accountId) ?? {
          accountId: account.accountId,
          accountName: account.accountName,
          closingCount: 0,
          income: emptyAllocationIncome(),
        };
        addSettlementAdjustmentIncome(source.income, line.amount);
        destination.sources.set(account.accountId, source);
        const recipients = recipientIdsByAccount.get(account.accountId) ?? new Set<number>();
        recipients.add(line.userId);
        recipientIdsByAccount.set(account.accountId, recipients);
      }
      destinationRows.set(line.userId, destination);
    }
  }

  const accounts = Array.from(accountRows.values()).map((account) => ({
    ...account,
    recipientCount: recipientIdsByAccount.get(account.accountId)?.size || 0,
  })).sort((left, right) => right.netPnl - left.netPnl || left.accountName.localeCompare(right.accountName, "zh-CN"));
  const destinations = Array.from(destinationRows.values()).map((destination) => ({
    userId: destination.userId,
    name: destination.name,
    income: destination.income,
    sources: Array.from(destination.sources.values())
      .sort((left, right) => right.income.total - left.income.total || left.accountName.localeCompare(right.accountName, "zh-CN")),
  })).sort((left, right) => right.income.total - left.income.total || left.name.localeCompare(right.name, "zh-CN"));
  const summary = accounts.reduce((total, account) => ({
    accountCount: total.accountCount + 1,
    closingCount: total.closingCount + account.closingCount,
    unreconciledClosingCount: total.unreconciledClosingCount + account.unreconciledClosingCount,
    netPnl: total.netPnl + account.netPnl,
    allocatedTotal: total.allocatedTotal + account.allocatedTotal,
    variance: total.variance + account.variance,
  }), { accountCount: 0, closingCount: 0, unreconciledClosingCount: 0, netPnl: 0, allocatedTotal: 0, variance: 0 });
  return {
    ...report,
    summary,
    accounts,
    destinations,
    adjustments,
    definition: `${report.definition} 结算调整以独立追加记录叠加展示，绝不改写原订单、分佣快照、共享流水或冻结周报。`,
  };
}

/**
 * 从完整、只读的T+0事实数据计算一个北京时间周的实时/冻结结算报表。
 * FIFO 需使用所有历史成交；周报只冻结归属于周窗的已实现订单、分佣与共享收益。
 */
function buildWeeklySettlementReport(
  journal: any,
  window: WeekWindow,
  status: SettlementReport["status"],
  generatedAt = new Date().toISOString(),
  facts?: SettlementIncomeFacts,
  attribution?: Ledger52T0IncomeAttributionContext,
): SettlementReport {
  const settlementFacts = facts ?? getSettlementIncomeFacts(journal);
  const entries = Array.isArray(journal?.entries) ? journal.entries : [];
  const { trades, snapshots, transfers, tradeById } = settlementFacts;
  const isClosing = (trade: Ledger52T0IncomeTrade) => trade.action === "closeLong" || trade.action === "closeShort";
  const effectiveTradeDate = (trade: Ledger52T0IncomeTrade) => getBeijingDateFromValue(getEffectiveTradeOccurredAt(trade));
  const inPeriodClosing = (trade: Ledger52T0IncomeTrade) => isClosing(trade) && !trade.isPending && isDateInWindow(effectiveTradeDate(trade), window);
  const beforePeriodEndClosing = (trade: Ledger52T0IncomeTrade) => isClosing(trade) && !trade.isPending && isBeforeWindowEnd(effectiveTradeDate(trade), window);
  const periodClosingIds = new Set(trades.filter(inPeriodClosing).map((trade) => trade.id));
  // 每日明细与周汇总必须复用同一份逐笔归属结果，不能在浏览器侧重新做FIFO或分佣推导。
  const periodClosingIncome = (attribution ?? buildSettlementIncomeAttribution(settlementFacts)).closings
    .filter((closingIncome) => inPeriodClosing(closingIncome.closing));

  const participantIds = new Set<number>();
  for (const trade of trades) {
    const occurredOn = getBeijingDateFromValue(getEffectiveTradeOccurredAt(trade));
    if (isBeforeWindowEnd(occurredOn, window)) participantIds.add(trade.relatedUserId);
  }
  for (const snapshot of snapshots) {
    const closing = tradeById.get(snapshot.entryId);
    if (closing && beforePeriodEndClosing(closing)) participantIds.add(snapshot.beneficiaryUserId);
  }
  for (const transfer of transfers) {
    const closing = tradeById.get(transfer.closingEntryId);
    if (closing && beforePeriodEndClosing(closing)) participantIds.add(transfer.recipientUserId);
  }
  const userIds = Array.from(participantIds).filter((userId) => userId > 0).sort((left, right) => left - right);
  const { names } = getNameMap(journal, userIds);

  const periodIncomeByUser = new Map<number, SettlementIncome>();
  const dailyIncomeByUser = new Map<number, Map<string, SettlementIncome>>();
  const getIncome = (target: Map<number, SettlementIncome>, userId: number) => {
    const current = target.get(userId) || emptyIncome();
    target.set(userId, current);
    return current;
  };
  for (const userId of userIds) {
    getIncome(periodIncomeByUser, userId);
  }
  for (const trade of trades.filter(inPeriodClosing)) {
    const entryOwner = getIncome(periodIncomeByUser, trade.relatedUserId);
    entryOwner.orderCount += 1;
  }
  for (const snapshot of snapshots) {
    const closing = tradeById.get(snapshot.entryId);
    if (closing && inPeriodClosing(closing) && snapshot.beneficiaryUserId !== closing.relatedUserId) {
      getIncome(periodIncomeByUser, snapshot.beneficiaryUserId).commissionCount += 1;
    }
  }
  for (const transfer of transfers) {
    if (periodClosingIds.has(transfer.closingEntryId)) getIncome(periodIncomeByUser, transfer.recipientUserId).sharedCount += 1;
  }
  for (const closingIncome of periodClosingIncome) {
    const occurredOn = getBeijingDateFromValue(getEffectiveTradeOccurredAt(closingIncome.closing));
    if (!occurredOn || !isDateInWindow(occurredOn, window)) continue;
    for (const allocation of closingIncome.allocations) {
      const periodIncome = getIncome(periodIncomeByUser, allocation.userId);
      periodIncome[allocation.kind] += allocation.amount;
      periodIncome.total = periodIncome.order + periodIncome.commission + periodIncome.shared;
      const days = dailyIncomeByUser.get(allocation.userId) || new Map<string, SettlementIncome>();
      const income = days.get(occurredOn) || emptyIncome();
      income[allocation.kind] += allocation.amount;
      if (allocation.kind === "order") income.orderCount += 1;
      if (allocation.kind === "commission") income.commissionCount += 1;
      if (allocation.kind === "shared") income.sharedCount += 1;
      income.total = income.order + income.commission + income.shared;
      days.set(occurredOn, income);
      dailyIncomeByUser.set(allocation.userId, days);
    }
  }

  const members = userIds.map((userId) => {
    const income = periodIncomeByUser.get(userId) || emptyIncome();
    const dailyIncome = dailyIncomeByUser.get(userId);
    return {
      userId,
      name: names.get(userId) || `用户#${userId}`,
      income,
      ...(dailyIncome && dailyIncome.size > 0 ? {
        dailyIncomeByDate: Object.fromEntries(
          Array.from(dailyIncome.entries()).sort(([left], [right]) => left.localeCompare(right)),
        ),
      } : {}),
    };
  }).sort((left, right) => right.income.total - left.income.total || left.name.localeCompare(right.name, "zh-CN"));

  return {
    calculationVersion: CALCULATION_VERSION,
    generatedAt,
    status,
    period: window,
    sourceCutoffAt: window.periodEndUtc,
    sourceCounts: {
      entries: entries.length,
      closings: trades.filter(beforePeriodEndClosing).length,
      sharedTransfers: transfers.filter((transfer) => {
        const closing = tradeById.get(transfer.closingEntryId);
        return Boolean(closing && beforePeriodEndClosing(closing));
      }).length,
    },
    summary: {
      participantCount: members.length,
      income: sumIncomeParts(members.map((member) => member.income)),
    },
    members,
  };
}

function selectReportForViewer(report: SettlementReport, targetUserId?: number) {
  if (!targetUserId) return report;
  const member = report.members.find((item) => item.userId === targetUserId);
  const visibleMembers = member ? [member] : [];
  return {
    ...report,
    summary: {
      participantCount: visibleMembers.length,
      income: sumIncomeParts(visibleMembers.map((item) => item.income)),
    },
    members: visibleMembers,
  };
}

function stableSourceHash(report: SettlementReport) {
  // generatedAt/status 会随重试变化，不能作为同一源数据快照的哈希输入。
  const source = {
    calculationVersion: report.calculationVersion,
    period: report.period,
    sourceCutoffAt: report.sourceCutoffAt,
    sourceCounts: report.sourceCounts,
    summary: report.summary,
    members: report.members,
  };
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

/** 冻结周与当前回放的事实对比忽略目录姓名、生成时间和逐日展示字段，避免重命名造成假阳性。 */
function stableSettlementFactHash(report: SettlementReport) {
  const source = {
    calculationVersion: report.calculationVersion,
    period: report.period,
    sourceCutoffAt: report.sourceCutoffAt,
    sourceCounts: report.sourceCounts,
    summary: report.summary,
    members: report.members
      .map((member) => ({ userId: member.userId, income: member.income }))
      .sort((left, right) => left.userId - right.userId),
  };
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

function assertWeekStartBjt(value: string) {
  const text = String(value || "").trim();
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) throw new TRPCError({ code: "BAD_REQUEST", message: "对账结算周须为 YYYY-MM-DD 格式的周一" });
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])));
  if (date.getUTCFullYear() !== Number(matched[1]) || date.getUTCMonth() !== Number(matched[2]) - 1 || date.getUTCDate() !== Number(matched[3]) || date.getUTCDay() !== 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "对账结算周必须选择北京时间周一" });
  }
  return text;
}

function stableReconciliationSourceHash(report: SettlementAccountReconciliation) {
  // 生成时间、说明文案和追加调整均不参与；此哈希只覆盖逐账户、逐平仓和用户去向的当前事实回放。
  const source = {
    version: "t0-weekly-account-reconciliation-source-v1",
    period: report.period,
    sourceCutoffAt: report.sourceCutoffAt,
    summary: report.summary,
    accounts: report.accounts,
    destinations: report.destinations,
  };
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

function stableReconciliationAdjustmentHash(adjustments: Ledger52T0SettlementAdjustment[]) {
  // 含暂挂说明；展示姓名不参与，避免目录改名造成原本未变的调整事实被误判为过期。
  const source = adjustments
    .map((adjustment) => ({
      id: adjustment.id,
      weekStartBjt: adjustment.weekStartBjt,
      type: adjustment.type,
      accountId: adjustment.accountId,
      sourceClosingEntryId: adjustment.sourceClosingEntryId,
      sourceNetPnlDelta: adjustment.sourceNetPnlDelta,
      allocations: adjustment.allocations.map((line) => ({ userId: line.userId, amount: line.amount })).sort((left, right) => left.userId - right.userId),
      reason: adjustment.reason,
      createdByUserId: adjustment.createdByUserId,
      createdAt: adjustment.createdAt,
    }))
    .sort((left, right) => Number(left.id) - Number(right.id) || left.id.localeCompare(right.id));
  return createHash("sha256").update(JSON.stringify({ version: "t0-weekly-account-reconciliation-adjustments-v1", adjustments: source })).digest("hex");
}

function stableReconciliationHash(input: {
  report: SettlementAccountReconciliation;
  sourceHash: string;
  adjustmentHash: string;
  reference: Omit<SettlementReconciliationReference, "sourceHash" | "adjustmentHash">;
}) {
  const source = {
    version: "t0-weekly-account-reconciliation-confirmation-v1",
    period: input.report.period,
    sourceCutoffAt: input.report.sourceCutoffAt,
    reference: input.reference,
    sourceHash: input.sourceHash,
    adjustmentHash: input.adjustmentHash,
    summary: input.report.summary,
    accounts: input.report.accounts,
    destinations: input.report.destinations,
  };
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

function isAccountReconciliationBalanced(report: SettlementAccountReconciliation) {
  return report.summary.unreconciledClosingCount === 0 && Math.abs(report.summary.variance) <= SETTLEMENT_RECONCILIATION_TOLERANCE;
}

async function ensureWeeklySettlementTables() {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0周结算数据库连接失败" });
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ledger52_t0_weekly_settlement_settings (
      ledger_id INT NOT NULL,
      journal_owner_user_id INT NOT NULL,
      enabled_from_week_start_bjt DATE NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (ledger_id, journal_owner_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='52号账本T+0周结算：启用周锚点，仅用于自动冻结范围控制'
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ledger52_t0_weekly_settlement_reports (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      ledger_id INT NOT NULL,
      journal_owner_user_id INT NOT NULL,
      week_start_bjt DATE NOT NULL,
      week_end_exclusive_bjt DATE NOT NULL,
      period_start_utc DATETIME(3) NOT NULL,
      period_end_utc DATETIME(3) NOT NULL,
      calculation_version VARCHAR(64) NOT NULL,
      snapshot_json LONGTEXT NOT NULL,
      source_hash CHAR(64) NOT NULL,
      frozen_at DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_t0_weekly_settlement_report (ledger_id, journal_owner_user_id, week_start_bjt, calculation_version),
      KEY idx_t0_weekly_settlement_owner_week (ledger_id, journal_owner_user_id, week_start_bjt DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='52号账本T+0周结算：追加式不可变冻结报表，不回写订单、收益或资金流水'
  `);
}

function isTableMissing(error: unknown) {
  const code = String((error as any)?.code || "");
  return code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_TABLE_ERROR";
}

async function listFrozenReports(journalOwnerUserId: number, targetUserId?: number): Promise<SettlementHistoryItem[]> {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0周结算数据库连接失败" });
  try {
    const [rows] = await conn.execute(
      `SELECT id, week_start_bjt, week_end_exclusive_bjt, calculation_version, snapshot_json, source_hash, frozen_at
         FROM ledger52_t0_weekly_settlement_reports
        WHERE ledger_id = ? AND journal_owner_user_id = ? AND calculation_version = ?
        ORDER BY week_start_bjt DESC, id DESC
        LIMIT 52`,
      [LEDGER_ID, journalOwnerUserId, CALCULATION_VERSION],
    );
    return (rows as any[]).flatMap((row) => {
      try {
        const snapshot = JSON.parse(String(row.snapshot_json || "")) as SettlementReport;
        if (!snapshot || !Array.isArray(snapshot.members)) return [];
        return [{
          id: String(row.id),
          kind: "frozen" as const,
          frozenAt: new Date(row.frozen_at).toISOString(),
          sourceHash: String(row.source_hash),
          report: selectReportForViewer({ ...snapshot, status: "frozen" }, targetUserId),
        }];
      } catch {
        return [];
      }
    });
  } catch (error) {
    // 首次生产部署的表尚未由服务端调度建好前，实时结算仍可使用；不能让查询路径自己建表。
    if (isTableMissing(error)) return [];
    throw error;
  }
}

/** 账户对账切换历史周时只需该周快照，不应为此反复解析完整历史列表。 */
async function getFrozenReportForWeek(input: {
  journalOwnerUserId: number;
  weekStartBjt: string;
  targetUserId?: number;
}): Promise<SettlementHistoryItem | null> {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0周结算数据库连接失败" });
  try {
    const [rows] = await conn.execute(
      `SELECT id, week_start_bjt, week_end_exclusive_bjt, calculation_version, snapshot_json, source_hash, frozen_at
         FROM ledger52_t0_weekly_settlement_reports
        WHERE ledger_id = ? AND journal_owner_user_id = ? AND week_start_bjt = ? AND calculation_version = ?
        ORDER BY id DESC
        LIMIT 1`,
      [LEDGER_ID, input.journalOwnerUserId, input.weekStartBjt, CALCULATION_VERSION],
    );
    const row = (rows as any[])[0];
    if (!row) return null;
    const snapshot = JSON.parse(String(row.snapshot_json || "")) as SettlementReport;
    if (!snapshot || !Array.isArray(snapshot.members)) return null;
    return {
      id: String(row.id),
      kind: "frozen",
      frozenAt: new Date(row.frozen_at).toISOString(),
      sourceHash: String(row.source_hash),
      report: selectReportForViewer({ ...snapshot, status: "frozen" }, input.targetUserId),
    };
  } catch (error) {
    if (isTableMissing(error)) return null;
    throw error;
  }
}

function hasSettlementIncome(report: SettlementReport) {
  const income = report.summary.income;
  return income.orderCount > 0 || income.commissionCount > 0 || income.sharedCount > 0 || Math.abs(income.total) > 0.0000001;
}

/**
 * 周结算上线前的已结束历史周，只基于当前完整事实数据动态回溯，绝不写入或伪装成冻结周报。
 * 一旦某周已有冻结快照，始终由不可变快照优先展示，不重复返回回溯结果。
 */
async function listHistoricalBackfillReports(input: {
  journal: any;
  currentWindow: WeekWindow;
  targetUserId?: number;
  frozenWeekStarts: ReadonlySet<string>;
  facts: SettlementIncomeFacts;
  attribution: Ledger52T0IncomeAttributionContext;
}): Promise<SettlementHistoryItem[]> {
  const { trades } = input.facts;
  const weekStarts = Array.from(new Set(trades.flatMap((trade) => {
    const isClosing = trade.action === "closeLong" || trade.action === "closeShort";
    const occurredOn = getBeijingDateFromValue(getEffectiveTradeOccurredAt(trade));
    const weekStart = occurredOn ? getWeekStartBjtForDate(occurredOn) : null;
    return isClosing && !trade.isPending && weekStart && weekStart < input.currentWindow.weekStartBjt && !input.frozenWeekStarts.has(weekStart)
      ? [weekStart]
      : [];
  }))).sort((left, right) => right.localeCompare(left));
  if (weekStarts.length === 0) return [];

  const reports = weekStarts
    .map((weekStart) => buildWeeklySettlementReport(
      input.journal,
      getWeekWindowFromStart(weekStart),
      "backfill",
      undefined,
      input.facts,
      input.attribution,
    ))
    .filter(hasSettlementIncome);
  if (reports.length === 0) return [];

  const userIds = Array.from(new Set(reports.flatMap((report) => report.members.map((member) => member.userId))));
  const names = getNameMap(input.journal, userIds).names;
  await addDirectoryNames(names, userIds);
  return reports.flatMap((report) => {
    const namedReport: SettlementReport = {
      ...report,
      members: report.members.map((member) => ({ ...member, name: names.get(member.userId) || member.name })),
    };
    const visibleReport = selectReportForViewer(namedReport, input.targetUserId);
    if (!hasSettlementIncome(visibleReport)) return [];
    return [{
      id: `backfill:${visibleReport.period.weekStartBjt}`,
      kind: "backfill" as const,
      report: visibleReport,
    }];
  });
}

export async function getLedger52T0WeeklySettlementCenter(input: {
  journalOwnerUserId: number;
  targetUserId?: number;
}) {
  const journal = await getLedger52T0JournalSettlementFinancialFacts({ journalOwnerUserId: input.journalOwnerUserId });
  const facts = getSettlementIncomeFacts(journal);
  const attribution = buildSettlementIncomeAttribution(facts);
  const current = buildWeeklySettlementReport(journal, getLedger52T0WeekWindow(), "realtime", undefined, facts, attribution);
  const currentWithDirectory = getNameMap(journal, current.members.map((member) => member.userId));
  await addDirectoryNames(currentWithDirectory.names, current.members.map((member) => member.userId));
  const renamedCurrent: SettlementReport = {
    ...current,
    members: current.members.map((member) => ({ ...member, name: currentWithDirectory.names.get(member.userId) || member.name })),
  };
  const frozenHistory = await listFrozenReports(input.journalOwnerUserId, input.targetUserId);
  const historicalBackfills = await listHistoricalBackfillReports({
    journal,
    currentWindow: current.period,
    targetUserId: input.targetUserId,
    frozenWeekStarts: new Set(frozenHistory.map((item) => item.report.period.weekStartBjt)),
    facts,
    attribution,
  });
  const history = [...frozenHistory, ...historicalBackfills]
    .sort((left, right) => right.report.period.weekStartBjt.localeCompare(left.report.period.weekStartBjt));
  return {
    timezone: SETTLEMENT_TIMEZONE,
    view: input.targetUserId ? "member" as const : "admin" as const,
    current: selectReportForViewer(renamedCurrent, input.targetUserId),
    history,
    definition: {
      income: "订单收益按实际平仓成交时间归周，分佣和共享跟随来源平仓；已扣开仓与平仓手续费。",
      freeze: "本金与充值、提现由独立资金流水管理，不进入本周收益结算。历史回溯仅为当前事实数据的未冻结核算；北京时间每周一00:05后冻结上一完整周收益，冻结报告不可改写，后续差异另行追加调整报告。",
    },
  };
}

/**
 * 团队负责人在个人结算页的第二张滑动卡：只展示其递归下属的本周收益汇总。
 * 名单严格复用团队总览的52号账本、非期权T+0活动筛选；负责人本人不包含在成员或汇总中。
 * 只读实时计算，不返回成员订单、资金流水或历史周报，更不会冻结、写入或调整任何结算数据。
 */
export async function getLedger52T0TeamWeeklySettlement(input: {
  journalOwnerUserId: number;
  rootUserId: number;
}) {
  const [teamOverview, journal] = await Promise.all([
    getLedger52T0TeamOverview({ journalOwnerUserId: input.journalOwnerUserId, rootUserId: input.rootUserId }),
    getLedger52T0Journal(
      { mode: "admin", journalOwnerUserId: input.journalOwnerUserId } satisfies T0JournalReadScope,
      { skipTableEnsure: true, fullRead: true },
    ),
  ]);
  if (!teamOverview.enabled) return { enabled: false as const };

  // 团队口径完整排除期权：不仅排除期权平仓，也排除以期权开仓/平仓为来源的分佣与共享。
  const nonOptionEntries = (Array.isArray((journal as any)?.entries) ? (journal as any).entries : [])
    .filter((entry: any) => String(entry?.instrumentType || "contract") !== "option");
  const nonOptionEntryIds = new Set(nonOptionEntries.map((entry: any) => String(entry.id)));
  const teamJournal = {
    ...journal,
    entries: nonOptionEntries,
    profitShareSnapshots: (Array.isArray((journal as any)?.profitShareSnapshots) ? (journal as any).profitShareSnapshots : [])
      .filter((snapshot: any) => nonOptionEntryIds.has(String(snapshot?.openingEntryId))),
    sharedIncomeTransfers: (Array.isArray((journal as any)?.sharedIncomeTransfers) ? (journal as any).sharedIncomeTransfers : [])
      .filter((transfer: any) => nonOptionEntryIds.has(String(transfer?.closingEntryId))),
    sharedIncomeReductions: (Array.isArray((journal as any)?.sharedIncomeReductions) ? (journal as any).sharedIncomeReductions : [])
      .filter((reduction: any) => nonOptionEntryIds.has(String(reduction?.closingEntryId))),
  };
  const current = buildWeeklySettlementReport(teamJournal, getLedger52T0WeekWindow(), "realtime");
  const currentMemberByUserId = new Map(current.members.map((member) => [member.userId, member]));
  const members = teamOverview.members.map((member) => {
    const currentMember = currentMemberByUserId.get(member.userId);
    return {
      userId: member.userId,
      name: member.name,
      avatar: member.avatar,
      income: currentMember ? { ...currentMember.income } : emptyIncome(),
    };
  }).sort((left, right) => right.income.total - left.income.total || left.name.localeCompare(right.name, "zh-CN") || left.userId - right.userId);
  return {
    enabled: true as const,
    generatedAt: current.generatedAt,
    period: current.period,
    summary: {
      participantCount: members.length,
      income: sumIncomeParts(members.map((member) => member.income)),
    },
    members,
    definition: "仅展示负责人递归下属的本周已实现订单、分佣与共享收益；不含负责人本人、未平仓浮盈亏、本金、充值、提现、钱包余额、期权及其相关收益。",
  };
}

/**
 * 管理员全局结算页的按需账户对账查询。
 * 支持当前及历史已结束周；冻结周收益始终引用原冻结报告，账户明细只按完整事实回放以供核对，绝不改写冻结周报。
 */
export async function getLedger52T0WeeklySettlementAccountReconciliation(input: {
  journalOwnerUserId: number;
  weekStartBjt?: string;
}): Promise<SettlementAccountReconciliationView> {
  const journal = await getLedger52T0JournalSettlementFinancialFacts({ journalOwnerUserId: input.journalOwnerUserId });
  const generatedAt = new Date().toISOString();
  const currentWindow = getLedger52T0WeekWindow();
  const selectedWeekStart = input.weekStartBjt ? assertWeekStartBjt(input.weekStartBjt) : currentWindow.weekStartBjt;
  if (selectedWeekStart > currentWindow.weekStartBjt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "不能读取未来结算周的账户对账" });
  }
  const window = selectedWeekStart === currentWindow.weekStartBjt ? currentWindow : getWeekWindowFromStart(selectedWeekStart);
  const facts = getSettlementIncomeFacts(journal);
  const attribution = buildSettlementIncomeAttribution(facts);
  const userIds = getSettlementKnownUserIds(facts);
  const { names } = getNameMap(journal, userIds);
  await addDirectoryNames(names, userIds);
  const baseReport = buildWeeklySettlementAccountReconciliation(journal, window, generatedAt, names, facts, attribution);
  const adjustments = await listLedger52T0SettlementAdjustments({
    journalOwnerUserId: input.journalOwnerUserId,
    weekStartBjt: window.weekStartBjt,
  });
  const report = applyWeeklySettlementAdjustments(baseReport, adjustments);
  const frozen = window.weekStartBjt === currentWindow.weekStartBjt ? null : await getFrozenReportForWeek({
    journalOwnerUserId: input.journalOwnerUserId,
    weekStartBjt: window.weekStartBjt,
  });
  const settlementStatus: SettlementReconciliationReference["status"] = frozen
    ? "frozen"
    : window.weekStartBjt === currentWindow.weekStartBjt
      ? "realtime"
      : "backfill";
  const liveSettlementReport = buildWeeklySettlementReport(journal, window, settlementStatus, generatedAt, facts, attribution);
  const frozenSourceHash = frozen?.sourceHash;
  const sourceHash = stableReconciliationSourceHash(baseReport);
  const adjustmentHash = stableReconciliationAdjustmentHash(adjustments);
  const reference: Omit<SettlementReconciliationReference, "sourceHash" | "adjustmentHash"> = {
    status: settlementStatus,
    ...(frozen?.frozenAt ? { frozenAt: frozen.frozenAt } : {}),
    ...(frozenSourceHash ? { frozenSourceHash } : {}),
    frozenSourceChanged: Boolean(frozen && stableSettlementFactHash(frozen.report) !== stableSettlementFactHash(liveSettlementReport)),
  };
  const reconciliationHash = stableReconciliationHash({ report, sourceHash, adjustmentHash, reference });
  const latestConfirmation = await getLatestLedger52T0SettlementReconciliationConfirmation({
    journalOwnerUserId: input.journalOwnerUserId,
    weekStartBjt: window.weekStartBjt,
  });
  return {
    ...report,
    definition: `${report.definition} ${settlementStatus === "frozen" ? "本周收益总额以既有冻结周报为准；账户逐笔明细仅按当前完整事实回放核对，若与冻结来源不一致将禁止确认已平。" : settlementStatus === "backfill" ? "该历史周尚未冻结，当前为可随来源事实变化的回溯核算；确认仅证明本次回放依据。" : "当前进行周仅供实时核对，结束后方可确认已平。"}`,
    reconciliationHash,
    settlementReference: { ...reference, sourceHash, adjustmentHash },
    confirmation: {
      state: latestConfirmation ? latestConfirmation.basisHash === reconciliationHash ? "confirmed" : "stale" : "unconfirmed",
      latest: latestConfirmation,
    },
  };
}

/**
 * 银行式“账目已平”确认：服务端对客户端哈希重新计算，且只允许结束周、逐笔已对齐、无暂挂、冻结来源一致时追加确认凭证。
 */
async function confirmLedger52T0WeeklySettlementAccountReconciliationUnlocked(input: {
  journalOwnerUserId: number;
  actorUserId: number;
  weekStartBjt: string;
  expectedReconciliationHash: string;
  note?: string;
  clientRequestId: string;
}) {
  const report = await getLedger52T0WeeklySettlementAccountReconciliation({
    journalOwnerUserId: input.journalOwnerUserId,
    weekStartBjt: input.weekStartBjt,
  });
  const currentWindow = getLedger52T0WeekWindow();
  if (report.period.weekStartBjt >= currentWindow.weekStartBjt || report.settlementReference.status === "realtime") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "正在进行的本周仅供实时核对，周结束后才可确认账目已平" });
  }
  if (report.settlementReference.frozenSourceChanged) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "冻结周收益与当前追溯来源不一致，需先核对来源事实，不能直接确认已平" });
  }
  if (report.adjustments.some((adjustment) => adjustment.type === "hold")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "本周仍有暂挂说明，处理完成前不能确认账目已平" });
  }
  if (!isAccountReconciliationBalanced(report)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "仍有逐笔差额或待核对平仓，不能确认账目已平" });
  }
  if (String(input.expectedReconciliationHash || "").toLowerCase() !== report.reconciliationHash) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "对账数据刚刚变化，请刷新后重新核对再确认" });
  }
  const basisSnapshot = {
    version: "t0-weekly-account-reconciliation-confirmation-v1",
    period: report.period,
    settlementReference: report.settlementReference,
    reconciliationHash: report.reconciliationHash,
    summary: report.summary,
    accounts: report.accounts,
    destinations: report.destinations,
    adjustments: report.adjustments,
  };
  return await createLedger52T0SettlementReconciliationConfirmation({
    journalOwnerUserId: input.journalOwnerUserId,
    actorUserId: input.actorUserId,
    weekStartBjt: report.period.weekStartBjt,
    basisHash: report.reconciliationHash,
    settlementSourceStatus: report.settlementReference.status,
    settlementSourceHash: report.settlementReference.frozenSourceHash || report.settlementReference.sourceHash,
    basisSnapshot,
    note: input.note,
    clientRequestId: input.clientRequestId,
  });
}

/** 与调整单按“账本所有者 + 结算周”串行，保证确认时复算的调整集合不会在写入中途变化。 */
export async function confirmLedger52T0WeeklySettlementAccountReconciliation(input: {
  journalOwnerUserId: number;
  actorUserId: number;
  weekStartBjt: string;
  expectedReconciliationHash: string;
  note?: string;
  clientRequestId: string;
}) {
  const weekStartBjt = assertWeekStartBjt(input.weekStartBjt);
  return await withDatabaseLock(
    `ledger52:t0:settlement-reconciliation:${input.journalOwnerUserId}:${weekStartBjt}`,
    () => confirmLedger52T0WeeklySettlementAccountReconciliationUnlocked({ ...input, weekStartBjt }),
  );
}

async function freezeOneWeeklySettlement(journalOwnerUserId: number, window: WeekWindow) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0周结算数据库连接失败" });
  const [existing] = await conn.execute(
    `SELECT id FROM ledger52_t0_weekly_settlement_reports
      WHERE ledger_id = ? AND journal_owner_user_id = ? AND week_start_bjt = ? AND calculation_version = ? LIMIT 1`,
    [LEDGER_ID, journalOwnerUserId, window.weekStartBjt, CALCULATION_VERSION],
  );
  if ((existing as any[]).length > 0) return { status: "existing" as const, weekStartBjt: window.weekStartBjt };
  const journal = await getLedger52T0Journal(
    { mode: "admin", journalOwnerUserId } satisfies T0JournalReadScope,
    { skipTableEnsure: true, fullRead: true },
  );
  const report = buildWeeklySettlementReport(journal, window, "frozen");
  const names = getNameMap(journal, report.members.map((member) => member.userId)).names;
  await addDirectoryNames(names, report.members.map((member) => member.userId));
  report.members = report.members.map((member) => ({ ...member, name: names.get(member.userId) || member.name }));
  const sourceHash = stableSourceHash(report);
  const [result] = await conn.execute(
    `INSERT IGNORE INTO ledger52_t0_weekly_settlement_reports
      (ledger_id, journal_owner_user_id, week_start_bjt, week_end_exclusive_bjt, period_start_utc, period_end_utc, calculation_version, snapshot_json, source_hash, frozen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [
      LEDGER_ID,
      journalOwnerUserId,
      window.weekStartBjt,
      window.weekEndExclusiveBjt,
      window.periodStartUtc.replace("T", " ").replace("Z", ""),
      window.periodEndUtc.replace("T", " ").replace("Z", ""),
      CALCULATION_VERSION,
      JSON.stringify(report),
      sourceHash,
    ],
  );
  return { status: (result as any).affectedRows > 0 ? "frozen" as const : "existing" as const, weekStartBjt: window.weekStartBjt };
}

/** 只由生产服务启动；热预览、快速预览和开发旁路认证环境绝不建立任何周报或设置表。 */
export async function freezeLedger52T0CompletedWeeks() {
  if (process.env.FAST_PREVIEW === "true" || process.env.PREVIEW_READONLY === "true" || process.env.DEV_BYPASS_AUTH === "true") {
    return { status: "skipped-readonly" as const, frozenWeeks: [] as string[] };
  }
  await ensureWeeklySettlementTables();
  const { getLedger52T0JournalOwnerUserId } = await import("./ledger52-t0-journal");
  const journalOwnerUserId = await getLedger52T0JournalOwnerUserId();
  const currentWeek = getLedger52T0WeekWindow();
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0周结算数据库连接失败" });
  // 初次启用从当前周开始，避免未获人工确认地回补所有旧历史周；此后服务重启可安全补冻已结束缺失周。
  await conn.execute(
    `INSERT IGNORE INTO ledger52_t0_weekly_settlement_settings (ledger_id, journal_owner_user_id, enabled_from_week_start_bjt)
     VALUES (?, ?, ?)`,
    [LEDGER_ID, journalOwnerUserId, currentWeek.weekStartBjt],
  );
  const [settingRows] = await conn.execute(
    `SELECT enabled_from_week_start_bjt FROM ledger52_t0_weekly_settlement_settings WHERE ledger_id = ? AND journal_owner_user_id = ? LIMIT 1`,
    [LEDGER_ID, journalOwnerUserId],
  );
  const enabledFrom = String((settingRows as any[])[0]?.enabled_from_week_start_bjt || currentWeek.weekStartBjt).slice(0, 10);
  const frozenWeeks: string[] = [];
  for (let weekStart = enabledFrom; weekStart < currentWeek.weekStartBjt; weekStart = addCalendarDays(weekStart, 7)) {
    const result = await freezeOneWeeklySettlement(journalOwnerUserId, {
      weekStartBjt: weekStart,
      weekEndExclusiveBjt: addCalendarDays(weekStart, 7),
      timezone: SETTLEMENT_TIMEZONE,
      periodStartUtc: beijingDateBoundaryUtc(weekStart),
      periodEndUtc: beijingDateBoundaryUtc(addCalendarDays(weekStart, 7)),
    });
    if (result.status === "frozen") frozenWeeks.push(result.weekStartBjt);
  }
  return { status: "ok" as const, frozenWeeks };
}

function getNextWeeklyFreezeAt(now = new Date()) {
  const currentWeek = getLedger52T0WeekWindow(now);
  const targetBjt = currentWeek.weekEndExclusiveBjt;
  const boundary = new Date(beijingDateBoundaryUtc(targetBjt));
  boundary.setUTCMinutes(boundary.getUTCMinutes() + SETTLEMENT_SNAPSHOT_MINUTE_AFTER_BOUNDARY);
  return boundary;
}

/** 生产进程的应用内周一冻结调度。重复启动安全；冻结本身由唯一索引保证幂等。 */
export function startLedger52T0WeeklySettlementScheduler() {
  if (weeklySettlementSchedulerStarted) return;
  weeklySettlementSchedulerStarted = true;
  if (process.env.FAST_PREVIEW === "true" || process.env.PREVIEW_READONLY === "true" || process.env.DEV_BYPASS_AUTH === "true") {
    console.log("[T+0周结算] 开发/预览只读模式，未启动冻结调度");
    return;
  }
  const schedule = () => {
    const target = getNextWeeklyFreezeAt();
    const delay = Math.max(1_000, target.getTime() - Date.now());
    setTimeout(async () => {
      try {
        const result = await freezeLedger52T0CompletedWeeks();
        if (result.status === "ok") console.log(`[T+0周结算] 周报冻结完成：${result.frozenWeeks.join(", ") || "无待冻结周"}`);
      } catch (error) {
        console.error("[T+0周结算] 周报冻结失败：", error);
      } finally {
        schedule();
      }
    }, delay);
  };
  void freezeLedger52T0CompletedWeeks().catch((error) => console.error("[T+0周结算] 启动补冻检查失败：", error));
  schedule();
}
