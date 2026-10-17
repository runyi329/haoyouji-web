import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  NotebookTabs,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Lock,
  Repeat2,
  LockOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useOptionGreeks } from "@/hooks/useOptionGreeks";
import { OrderCardImageDownload } from "@/components/OrderCardImageDownload";

type TradeAction = "openLong" | "closeLong" | "openShort" | "closeShort";
type PositionSide = "long" | "short";
type T0InstrumentType = "spot" | "contract" | "option" | "grid";
type T0OptionDirection = "long_call" | "long_put" | "short_call" | "short_put";
type T0OptionPremiumCurrency = "USDT" | "ETH";
type T0GridDirection = "long" | "short";
type T0JournalPayoutDirection = "withdrawal" | "deposit";
type T0JournalPayoutLogView = "all" | T0JournalPayoutDirection;
type T0JournalPayoutLog = {
  id: string;
  relatedUserId: number;
  relatedUserName: string;
  occurredOn: string;
  direction: T0JournalPayoutDirection;
  amount: number;
  note?: string;
  createdAt: string;
};
type SharedIncomeTransfer = {
  id: string;
  closingEntryId: string;
  sourceUserId: number;
  sourceUserName: string;
  recipientUserId: number;
  recipientUserName: string;
  recipientUsername?: string;
  amount: number;
  sourceNetPnl: number;
  managerPoolAmount: number;
  createdAt: string;
};
function getBeijingDateInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

type T0XirrCashFlow = {
  occurredOn: string;
  amount: number;
  /** 当前账面净值按北京时间截至日收盘时点计入，首日与截至日均纳入持有期。 */
  atEndOfBeijingDay?: boolean;
};

function getT0CalendarDateUtc(value: string) {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const [, yearText, monthText, dayText] = matched;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp
    : null;
}

/**
 * 使用与 Excel XIRR 相同的现金流折现公式，并统一以北京时间自然日作为日期口径。
 * 当前期末净值按截至日收盘时点计入，因此投入首日与截至日均纳入持有期。
 */
function calculateT0Xirr(cashFlows: T0XirrCashFlow[]) {
  const grouped = new Map<number, number>();
  cashFlows.forEach((cashFlow) => {
    const calendarTimestamp = getT0CalendarDateUtc(cashFlow.occurredOn);
    if (calendarTimestamp === null || !Number.isFinite(cashFlow.amount) || Math.abs(cashFlow.amount) < 0.000001) return;
    const timestamp = calendarTimestamp + (cashFlow.atEndOfBeijingDay ? 24 * 60 * 60 * 1000 : 0);
    grouped.set(timestamp, (grouped.get(timestamp) || 0) + cashFlow.amount);
  });
  const flows = Array.from(grouped.entries())
    .map(([timestamp, amount]) => ({ timestamp, amount }))
    .filter((cashFlow) => Math.abs(cashFlow.amount) >= 0.000001)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (flows.length < 2 || !flows.some((cashFlow) => cashFlow.amount < 0) || !flows.some((cashFlow) => cashFlow.amount > 0)) return null;
  const firstTimestamp = flows[0].timestamp;
  const lastTimestamp = flows[flows.length - 1].timestamp;
  if (lastTimestamp <= firstTimestamp) return null;

  const npv = (rate: number) => {
    if (rate <= -1) return Number.POSITIVE_INFINITY;
    return flows.reduce((total, cashFlow) => {
      const years = (cashFlow.timestamp - firstTimestamp) / (365 * 24 * 60 * 60 * 1000);
      return total + cashFlow.amount / Math.pow(1 + rate, years);
    }, 0);
  };

  let lower = -0.999999999;
  let upper = 1;
  let lowerValue = npv(lower);
  let upperValue = npv(upper);
  if (!Number.isFinite(lowerValue) || Number.isNaN(upperValue)) return null;
  // 短期内出现较高收益时，真实年化 XIRR 可远超 1e15；继续扩展上界而非误判为无解。
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
      upperValue = middleValue;
    }
  }
  const result = (lower + upper) / 2;
  return Number.isFinite(result) ? result : null;
}

function formatT0AnnualizedReturn(rate: number | null) {
  if (rate === null || !Number.isFinite(rate)) return "--";
  const percentage = rate * 100;
  const absolute = Math.abs(percentage);
  if (absolute >= 1_000_000_000) return `${percentage >= 0 ? "+" : ""}${percentage.toExponential(2)}%`;
  const maximumFractionDigits = absolute >= 1000 ? 0 : absolute >= 100 ? 1 : 2;
  return `${percentage >= 0 ? "+" : ""}${percentage.toLocaleString("zh-CN", { maximumFractionDigits })}%`;
}

/**
 * 反算为达到指定已实现年化收益所需的本次共享收益。
 * 仅使用投入、提现、平仓盈利及既得共享收益现金流；不包含持仓浮盈亏。
 */
function calculateT0XirrTargetTopUp(cashFlows: T0XirrCashFlow[], currentTerminalValue: number, targetRate: number, asOfDate = getBeijingDateInputValue()) {
  if (!Number.isFinite(currentTerminalValue) || !Number.isFinite(targetRate) || targetRate <= -1) return null;
  const terminalDate = getT0CalendarDateUtc(asOfDate);
  if (terminalDate === null) return null;
  const terminalTimestamp = terminalDate + 24 * 60 * 60 * 1000;
  let hasInvestmentCashFlow = false;
  let requiredTerminalValue = 0;
  for (const cashFlow of cashFlows) {
    const calendarTimestamp = getT0CalendarDateUtc(cashFlow.occurredOn);
    if (calendarTimestamp === null || !Number.isFinite(cashFlow.amount)) continue;
    const timestamp = calendarTimestamp + (cashFlow.atEndOfBeijingDay ? 24 * 60 * 60 * 1000 : 0);
    if (timestamp > terminalTimestamp) continue;
    if (cashFlow.amount < 0) hasInvestmentCashFlow = true;
    const yearsToTerminal = (terminalTimestamp - timestamp) / (365 * 24 * 60 * 60 * 1000);
    requiredTerminalValue -= cashFlow.amount * Math.pow(1 + targetRate, yearsToTerminal);
  }
  if (!hasInvestmentCashFlow || !Number.isFinite(requiredTerminalValue)) return null;
  const topUp = requiredTerminalValue - currentTerminalValue;
  return Number.isFinite(topUp) ? Math.max(0, topUp) : null;
}
/** 已锁定是已成交仓位的附加状态，不与“已成交”互斥。 */
type T0ExecutionFilter = "all" | "filled" | "pending";
const T0_INSTRUMENT_TYPES: Array<{ value: T0InstrumentType; label: string; shortLabel: string }> = [
  { value: "spot", label: "现货", shortLabel: "现" },
  { value: "contract", label: "合约", shortLabel: "合" },
  { value: "option", label: "期权", shortLabel: "期" },
  { value: "grid", label: "网格", shortLabel: "网" },
];
const T0_GRID_DIRECTIONS: Array<{ value: T0GridDirection; label: string }> = [
  { value: "long", label: "做多网格" },
  { value: "short", label: "做空网格" },
];
const T0_INSTRUMENT_FILTER_OPTIONS: T0MultiSelectOption[] = T0_INSTRUMENT_TYPES.map((item) => ({
  id: item.value,
  label: item.label,
}));
const T0_EXECUTION_FILTER_OPTIONS: T0MultiSelectOption[] = [
  { id: "filled", label: "已成交" },
  { id: "pending", label: "已挂单" },
];

/** 空数组代表全部；勾满全部类型同样回归“全部类型”，避免出现重复的全选状态。 */
function normalizeT0InstrumentTypeFilterIds(ids: string[]): T0InstrumentType[] {
  const selected = T0_INSTRUMENT_TYPES
    .map((item) => item.value)
    .filter((type) => ids.includes(type));
  return selected.length === T0_INSTRUMENT_TYPES.length ? [] : selected;
}

function matchesT0ExecutionFilter(trade: Pick<PreviewTrade, "isPending" | "isLocked">, filter: T0ExecutionFilter) {
  if (filter === "all") return true;
  if (filter === "pending") return Boolean(trade.isPending);
  return !trade.isPending;
}

function getT0ExecutionFilterSummary(filter: T0ExecutionFilter, hideLocked = false) {
  const summary = filter === "filled"
    ? "已成交"
    : filter === "pending"
      ? "已挂单"
      : "状态全部";
  return hideLocked ? `${summary}·隐藏已锁定` : summary;
}

type T0PersistedTopFilters = {
  accountIds: string[];
  relatedUserIds: string[];
  /** 成员端用于区分“首次默认本人”与用户明确点选的“全部”（空数组）。 */
  memberRelatedUserFilterTouched: boolean;
  relatedFundIds: string[];
  instrumentTypeIds: T0InstrumentType[];
  executionFilter: T0ExecutionFilter;
  /** 独立于成交/挂单状态：勾选时从展示、汇总与历史中排除已锁定订单。 */
  hideLocked: boolean;
};

const T0_TOP_FILTER_STORAGE_PREFIX = "haoyouji:t0-top-filters:v1";
const T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX = "referral-descendants:";

type T0ResolvedRelatedUserFilter = {
  userIds: Set<string>;
  includesUnlinked: boolean;
  waitingForReferralData: boolean;
};

function createT0ReferralDescendantsToken(rootUserId: string) {
  return `${T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX}${rootUserId}`;
}

function getT0ReferralDescendantsRootUserId(value: string): string | null {
  if (!value.startsWith(T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX)) return null;
  const rootUserId = value.slice(T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX.length);
  return /^\d+$/.test(rootUserId) ? rootUserId : null;
}

/** 将“推荐”筛选令牌展开为真实关联用户 ID；推荐集合本身绝不代表根用户。 */
function resolveT0RelatedUserFilter(
  selectedIds: string[],
  descendantsByRootUserId: Map<string, string[]>,
  referralDataLoaded: boolean,
): T0ResolvedRelatedUserFilter {
  const userIds = new Set<string>();
  let includesUnlinked = false;
  let waitingForReferralData = false;
  for (const id of selectedIds) {
    if (id === "unlinked") {
      includesUnlinked = true;
      continue;
    }
    const rootUserId = getT0ReferralDescendantsRootUserId(id);
    if (rootUserId) {
      const descendants = descendantsByRootUserId.get(rootUserId);
      if (descendants) {
        descendants.forEach((descendantUserId) => userIds.add(descendantUserId));
      } else if (!referralDataLoaded) {
        // 本地存储恢复后，先等待服务端树数据；此时不以不完整条件误筛流水。
        waitingForReferralData = true;
      }
      continue;
    }
    userIds.add(id);
  }
  return { userIds, includesUnlinked, waitingForReferralData };
}

function isT0RelatedUserSelectionEquivalentToAll(
  selectedIds: string[],
  resolvedFilter: T0ResolvedRelatedUserFilter,
  selectableUserIds: string[],
  hasUnlinkedTrades: boolean,
) {
  if (selectedIds.length === 0 || resolvedFilter.waitingForReferralData) return false;
  return selectableUserIds.every((userId) => resolvedFilter.userIds.has(userId))
    && (!hasUnlinkedTrades || resolvedFilter.includesUnlinked);
}

function sanitizeT0FilterIds(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)))
    : [];
}

function getT0TopFilterStorageKey(ledgerId: number, viewerMode: "admin" | "member", viewerId: string) {
  return `${T0_TOP_FILTER_STORAGE_PREFIX}:${ledgerId}:${viewerMode}:${viewerId}`;
}

function readPersistedT0TopFilters(storageKey: string | null): T0PersistedTopFilters | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "null") as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const executionFilter = parsed.executionFilter;
    return {
      accountIds: sanitizeT0FilterIds(parsed.accountIds),
      relatedUserIds: sanitizeT0FilterIds(parsed.relatedUserIds),
      memberRelatedUserFilterTouched: parsed.memberRelatedUserFilterTouched === true,
      relatedFundIds: sanitizeT0FilterIds(parsed.relatedFundIds),
      instrumentTypeIds: normalizeT0InstrumentTypeFilterIds(sanitizeT0FilterIds(parsed.instrumentTypeIds)),
      // 旧版“已锁定”是互斥状态；迁移后锁定归入已成交，因此恢复为全部而非反向隐藏。
      executionFilter: executionFilter === "filled" || executionFilter === "pending" ? executionFilter : "all",
      hideLocked: parsed.hideLocked === true,
    };
  } catch {
    return null;
  }
}

function persistT0TopFilters(storageKey: string | null, filters: T0PersistedTopFilters) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(filters));
  } catch {
    // 私密模式或浏览器存储不可用时，筛选仍可在当前页面正常使用。
  }
}

function getT0InstrumentFilterSummary(selectedTypes: T0InstrumentType[]): string {
  if (selectedTypes.length === 0) return "类型全部";
  return T0_INSTRUMENT_TYPES
    .filter((item) => selectedTypes.includes(item.value))
    .map((item) => item.label)
    .join("、") || "类型";
}

function getOptionDaysToExpiry(expiryDate?: string) {
  const matched = expiryDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) return undefined;
  const [, year, month, day] = matched;
  const expiryDay = Date.UTC(Number(year), Number(month) - 1, Number(day));
  // 订单页面统一按北京时间的自然日表达“距到期日还有几天”，避免 UTC 跨日造成提前少一天。
  const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const today = Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate());
  return Math.max(0, Math.round((expiryDay - today) / (24 * 60 * 60 * 1000)));
}

function getInstrumentShortLabel(value?: T0InstrumentType, optionExpiryDate?: string) {
  const shortLabel = T0_INSTRUMENT_TYPES.find((item) => item.value === value)?.shortLabel;
  if (value !== "option" || !shortLabel) return shortLabel;
  const daysToExpiry = getOptionDaysToExpiry(optionExpiryDate);
  return daysToExpiry === undefined ? shortLabel : `${daysToExpiry}天·${shortLabel}`;
}

// 期权格只保留紫色拉丝底；边界完全交给梯形行的统一分隔线，
// 避免期权格自身边框/暗边造成与中间价格列视觉高度不一致。
const T0_OPTION_METAL_SURFACE_STYLE = {
  background: [
    "repeating-linear-gradient(168deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, transparent 1px, transparent 4px)",
    "linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 38%, rgba(0,0,0,0.05) 100%)",
    "linear-gradient(90deg, #6d28d9 0%, #7c3aed 48%, #6d28d9 100%)",
  ].join(", "),
  border: "none",
  boxShadow: "none",
  boxSizing: "border-box" as const,
  color: "rgba(255,255,255,0.95)",
  textShadow: "0 1px 2.5px rgba(0,0,0,0.60), 0 -0.5px 1px rgba(255,255,255,0.22)",
};

const T0_OPTION_DIRECTIONS: Array<{ value: T0OptionDirection; label: string }> = [
  { value: "long_call", label: "买入看涨" },
  { value: "short_call", label: "卖出看涨" },
  { value: "long_put", label: "买入看跌" },
  { value: "short_put", label: "卖出看跌" },
];
function getOptionDirectionLabel(value?: T0OptionDirection) {
  return T0_OPTION_DIRECTIONS.find((item) => item.value === value)?.label;
}
/**
 * 期权的左右报价侧按到期收益的涨跌方向归类，而不是按买入/卖出归类：
 * 左侧（看涨）= 买入看涨、卖出看跌；右侧（看跌）= 买入看跌、卖出看涨。
 */
function getOptionLadderSide(direction: T0OptionDirection): PositionSide {
  return direction === "long_call" || direction === "short_put" ? "long" : "short";
}
function getOptionOpeningAction(direction: T0OptionDirection): Extract<TradeAction, "openLong" | "openShort"> {
  return getOptionLadderSide(direction) === "long" ? "openLong" : "openShort";
}
type PreviewAccount = {
  id: string;
  name: string;
  lastUsedAt?: string | null;
};

type PreviewRelatedUser = {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  lastUsedAt?: string | null;
};

type PreviewRelatedFund = {
  id: string;
  relatedUserId?: string;
  name: string;
  lastUsedAt?: string | null;
};

type PreviewTrade = {
  id: string;
  accountId: string;
  accountName?: string;
  accountHidden?: boolean;
  relatedUserId?: string;
  relatedUserName?: string;
  relatedUsername?: string;
  relatedUserAvatar?: string;
  relatedUserHidden?: boolean;
  relatedFundId?: string;
  relatedFundName?: string;
  relatedFundHidden?: boolean;
  symbol: string;
  action: TradeAction;
  instrumentType?: T0InstrumentType;
  optionDirection?: T0OptionDirection;
  optionExpiryDate?: string;
  optionPremium?: number;
  optionPremiumCurrency?: T0OptionPremiumCurrency;
  gridDirection?: T0GridDirection;
  gridRangeMin?: number;
  gridRangeMax?: number;
  gridLeverage?: number;
  gridCount?: number;
  /** 账本接口下发的最近有效期权标记价，用于刷新首屏与轮询间隙的可靠兜底。 */
  optionMarkPrice?: number;
  /** 到期自动结算时每 ETH 期权获得或支付的最终价值（USDT）。 */
  optionSettlementPrice?: number;
  /** Deribit 最终 delivery 使用的 ETH 指数交割价（USDT）。 */
  optionDeliveryPrice?: number;
  optionSettledAt?: string;
  optionSettlementSource?: string;
  /** 开仓主单的展示锁定标记；成员端只读展示。 */
  isLocked?: boolean;
  /** 开仓主单：管理员展示相反多空与损益，成员始终保留原始订单视图。 */
  isCounterparty?: boolean;
  /** 管理端反向投影标识；平仓由其 FIFO 对应的开仓标记自动派生。 */
  isCounterpartyView?: boolean;
  /** 管理端反向投影保留的真实流水键与原始字段，供编辑、回撤及写库使用。 */
  sourceEntryId?: string;
  /** 仅用于前端收益展示：筛选投影前可计算净收益的流水键，不参与任何写库操作。 */
  detailEntryId?: string;
  sourceAction?: TradeAction;
  sourceOptionDirection?: T0OptionDirection;
  sourceGridDirection?: T0GridDirection;
  sourceFee?: number;
  /** 管理员报价专用：挂单在触发前不进入真实仓位、盈亏或费用计算。 */
  isPending?: boolean;
  /** 挂单实际触发成交的系统时间与统一行情价格；关联成员可只读查看。 */
  filledAt?: string;
  filledPrice?: number;
  /** 仅现货/合约开仓支持的自动止盈计划与实际触发信息。 */
  takeProfitEnabled?: boolean;
  takeProfitPrice?: number;
  takeProfitQuantity?: number;
  takeProfitTriggeredAt?: string;
  takeProfitTriggeredPrice?: number;
  takeProfitTriggeredQuantity?: number;
  takeProfitPlans?: T0TakeProfitPlan[];
  quantity: number;
  price: number;
  fee: number;
  createdAt: string;
  /** 服务端落库时间，仅用于系统自动动作的历史排序；交易时间仍按 createdAt 展示。 */
  recordedAt?: string;
  targetPrice?: number;
  note?: string;
  clientRequestId?: string;
  isSyncing?: boolean;
  /** 仅成员收益投影视图使用：ETH 数量保持完整，利润与交易成本按此比例结算。 */
  profitShareRate?: number;
  /** 仅成员收益投影视图使用：用于让“本人”筛选保留其作为受益人的订单，同时仍显示原始关联用户。 */
  profitShareBeneficiaryUserId?: string;
};

type LadderOptionMetadata = {
  direction?: T0OptionDirection;
  expiryDate?: string;
  strikePrice?: number;
  premium?: number;
  premiumCurrency?: T0OptionPremiumCurrency;
  cachedMarkPrice?: number;
};

type LadderCellMetadata = {
  accountName?: string;
  relatedUserName: string;
  relatedFundName: string;
  instrumentShortLabel?: string;
  option?: LadderOptionMetadata;
};

type ProfitShareSnapshot = {
  entryId: string;
  openingEntryId: string;
  relatedFundId: number;
  relatedFundName?: string;
  sourceUserId: number;
  beneficiaryUserId: number;
  percentage: number;
  matchedQuantity: number;
  sourceUserName?: string;
  beneficiaryUserName?: string;
};

type ProfitShareRule = {
  id: number;
  relatedFundId: number;
  relatedFundName: string;
  sourceUserId: number;
  sourceUserName: string;
  beneficiaryUserId: number;
  beneficiaryUserName: string;
  percentage: number;
  createdAt: string;
};

type ProfitShareAllocationDraft = {
  user: PreviewRelatedUser;
  percentage: string;
};

const UNLINKED_USER_ACCOUNT_MEMORY_KEY = "__unlinked__";

function relatedUserAccountMemoryKey(relatedUserId?: string) {
  return relatedUserId || UNLINKED_USER_ACCOUNT_MEMORY_KEY;
}

type RecoverableTrade = {
  auditId: string;
  operation: "delete" | "revert";
  revertedAt: string;
  trade: PreviewTrade;
};

function previewTradeFromEntry(entry: any): PreviewTrade {
  return {
    id: String(entry.id),
    accountId: String(entry.accountId),
    accountName: entry.accountName ? String(entry.accountName) : undefined,
    accountHidden: Boolean(entry.accountHidden),
    relatedUserId: entry.relatedUserId === undefined || entry.relatedUserId === null ? undefined : String(entry.relatedUserId),
    relatedUserName: entry.relatedUserName ? String(entry.relatedUserName) : undefined,
    relatedUsername: entry.relatedUsername ? String(entry.relatedUsername) : undefined,
    relatedUserAvatar: entry.relatedUserAvatar ? String(entry.relatedUserAvatar) : undefined,
    relatedUserHidden: Boolean(entry.relatedUserHidden),
    relatedFundId: entry.relatedFundId === undefined || entry.relatedFundId === null ? undefined : String(entry.relatedFundId),
    relatedFundName: entry.relatedFundName ? String(entry.relatedFundName) : undefined,
    relatedFundHidden: Boolean(entry.relatedFundHidden),
    symbol: String(entry.symbol || "ETH"),
    action: entry.action as TradeAction,
    instrumentType: entry.instrumentType === "spot" || entry.instrumentType === "contract" || entry.instrumentType === "option" || entry.instrumentType === "grid"
      ? entry.instrumentType
      : undefined,
    optionDirection: entry.optionDirection === "long_call" || entry.optionDirection === "long_put" || entry.optionDirection === "short_call" || entry.optionDirection === "short_put"
      ? entry.optionDirection
      : undefined,
    optionExpiryDate: entry.optionExpiryDate ? String(entry.optionExpiryDate) : undefined,
    optionPremium: entry.optionPremium === undefined || entry.optionPremium === null ? undefined : Number(entry.optionPremium),
    optionPremiumCurrency: entry.optionPremiumCurrency === "USDT" || entry.optionPremiumCurrency === "ETH"
      ? entry.optionPremiumCurrency
      : undefined,
    gridDirection: entry.gridDirection === "long" || entry.gridDirection === "short"
      ? entry.gridDirection
      : undefined,
    gridRangeMin: entry.gridRangeMin === undefined || entry.gridRangeMin === null ? undefined : Number(entry.gridRangeMin),
    gridRangeMax: entry.gridRangeMax === undefined || entry.gridRangeMax === null ? undefined : Number(entry.gridRangeMax),
    gridLeverage: entry.gridLeverage === undefined || entry.gridLeverage === null ? undefined : Number(entry.gridLeverage),
    gridCount: entry.gridCount === undefined || entry.gridCount === null ? undefined : Number(entry.gridCount),
    optionMarkPrice: Number.isFinite(Number(entry.optionMarkPrice)) && Number(entry.optionMarkPrice) > 0
      ? Number(entry.optionMarkPrice)
      : undefined,
    optionSettlementPrice: entry.optionSettlementPrice === undefined || entry.optionSettlementPrice === null
      ? undefined
      : Number(entry.optionSettlementPrice),
    optionDeliveryPrice: entry.optionDeliveryPrice === undefined || entry.optionDeliveryPrice === null
      ? undefined
      : Number(entry.optionDeliveryPrice),
    optionSettledAt: entry.optionSettledAt ? String(entry.optionSettledAt) : undefined,
    optionSettlementSource: entry.optionSettlementSource ? String(entry.optionSettlementSource) : undefined,
    isLocked: Boolean(entry.isLocked),
    isCounterparty: Boolean(entry.isCounterparty),
    isPending: Boolean(entry.isPending),
    filledAt: entry.filledAt ? String(entry.filledAt) : undefined,
    filledPrice: entry.filledPrice === undefined || entry.filledPrice === null ? undefined : Number(entry.filledPrice),
    takeProfitEnabled: Boolean(entry.takeProfitEnabled),
    takeProfitPrice: entry.takeProfitPrice === undefined || entry.takeProfitPrice === null ? undefined : Number(entry.takeProfitPrice),
    takeProfitQuantity: entry.takeProfitQuantity === undefined || entry.takeProfitQuantity === null ? undefined : Number(entry.takeProfitQuantity),
    takeProfitTriggeredAt: entry.takeProfitTriggeredAt ? String(entry.takeProfitTriggeredAt) : undefined,
    takeProfitTriggeredPrice: entry.takeProfitTriggeredPrice === undefined || entry.takeProfitTriggeredPrice === null ? undefined : Number(entry.takeProfitTriggeredPrice),
    takeProfitTriggeredQuantity: entry.takeProfitTriggeredQuantity === undefined || entry.takeProfitTriggeredQuantity === null ? undefined : Number(entry.takeProfitTriggeredQuantity),
    takeProfitPlans: Array.isArray(entry.takeProfitPlans) ? entry.takeProfitPlans.map((plan: any) => ({
      id: String(plan.id || ''), triggerPrice: Number(plan.triggerPrice), quantity: Number(plan.quantity),
      status: plan.status === 'triggered' || plan.status === 'cancelled' ? plan.status : 'pending',
      triggeredAt: plan.triggeredAt ? String(plan.triggeredAt) : undefined,
      triggeredPrice: plan.triggeredPrice === undefined || plan.triggeredPrice === null ? undefined : Number(plan.triggeredPrice),
      triggeredQuantity: plan.triggeredQuantity === undefined || plan.triggeredQuantity === null ? undefined : Number(plan.triggeredQuantity),
      closingEntryId: plan.closingEntryId === undefined || plan.closingEntryId === null ? undefined : String(plan.closingEntryId),
    })) : undefined,
    quantity: Number(entry.quantity),
    price: Number(entry.price),
    fee: Number(entry.fee || 0),
    createdAt: String(entry.createdAt),
    recordedAt: entry.recordedAt ? String(entry.recordedAt) : undefined,
    targetPrice: entry.targetPrice === undefined || entry.targetPrice === null ? undefined : Number(entry.targetPrice),
    note: entry.note || undefined,
  };
}

type PositionBucket = {
  key: string;
  side: PositionSide;
  /** 期权行权价不参与现货/合约的标记价盈亏计算。 */
  instrumentType?: T0InstrumentType;
  /** T 型报价展示和开平匹配使用的归属档位（非实际成交价）。 */
  price: number;
  originalQuantity: number;
  remainingQuantity: number;
  /** 整合报价中的未成交挂单数量：只参与展示数量，不参与仓位、盈亏、手续费或可平数量。 */
  pendingQuantity?: number;
  /** 整合报价中已锁定的剩余数量；逐笔报价继续由对应主单决定黑金外观。 */
  lockedRemainingQuantity?: number;
  /** 剩余仓位按实际成交价累计的成本，用于均价与盈亏。 */
  costBasis: number;
  /** 收益分配后参与净利润计算的等效数量，不改变展示、开平仓与 FIFO 的实际 ETH 数量。 */
  financialQuantity: number;
  /** 收益分配后参与净利润计算的成本，用于未平仓净利润与收益率。 */
  financialCostBasis: number;
  /** 尚未随已平数量分摊的开仓手续费。 */
  openingFeeBasis: number;
  /** 已平部分未扣任何手续费的毛利润。 */
  realizedGrossPnl: number;
  /** 已平部分分摊的开仓手续费。 */
  realizedOpeningFee: number;
  /** 已平部分实际发生的平仓手续费。 */
  realizedClosingFee: number;
  realizedPnl: number;
  /** 已平部分按原始开仓成本累计，用于已平仓成本统计。 */
  closedQuantity: number;
  closedCostBasis: number;
  /** 已平部分的实际平仓成交名义金额。 */
  closedNotional: number;
  openedAt: string;
};

type AdminLadderDisplayMode = "integrated" | "individual";

type LadderPriceRow = {
  key: string;
  price: number;
  long?: PositionBucket;
  short?: PositionBucket;
  isMark: boolean;
  /** 管理员“逐笔报价”模式中，左右两侧各自对应的独立未平仓主单。 */
  longOpeningTrade?: PreviewTrade;
  shortOpeningTrade?: PreviewTrade;
};

/** 某一开仓主单被分批平掉时，对应的平仓流水及本次分配数量。 */
type LinkedClosingAllocation = {
  trade: PreviewTrade;
  quantity: number;
};

/** 历史记录“关联”模式的一组开仓主单及其 FIFO 分配的平仓流水。 */
type LinkedJournalGroup = {
  id: string;
  opening?: PreviewTrade;
  closings: LinkedClosingAllocation[];
};

type T0TakeProfitPlan = {
  id?: string;
  triggerPrice: number;
  quantity: number;
  status: "pending" | "triggered" | "cancelled";
  triggeredAt?: string;
  triggeredPrice?: number;
  triggeredQuantity?: number;
  /** 已触发计划明确绑定本次自动生成的平仓流水，不能再依赖时间顺序推断。 */
  closingEntryId?: string;
};

type T0TakeProfitPlanDraft = { price: string; quantity: string };

function normalizeTakeProfitPlanDrafts(plans: T0TakeProfitPlanDraft[]) {
  return plans.map((plan) => ({
    price: plan.price.trim(),
    quantity: normalizeEthQuantity(plan.quantity),
  }));
}

function getTradeTakeProfitPlanDrafts(trade: PreviewTrade): T0TakeProfitPlanDraft[] {
  const pending = (trade.takeProfitPlans ?? [])
    .filter((plan) => plan.status === "pending")
    .map((plan) => ({ price: String(plan.triggerPrice), quantity: normalizeEthQuantity(String(plan.quantity)) }));
  if (pending.length > 0) return pending;
  return trade.takeProfitEnabled && trade.takeProfitPrice !== undefined && trade.takeProfitQuantity !== undefined
    ? [{ price: String(trade.takeProfitPrice), quantity: normalizeEthQuantity(String(trade.takeProfitQuantity)) }]
    : [];
}

type EntryForm = {
  action: TradeAction;
  accountId: string;
  accountName: string;
  relatedUserId: string;
  relatedUserName: string;
  relatedUsername: string;
  relatedFundId: string;
  relatedFundName: string;
  instrumentType?: T0InstrumentType;
  optionDirection: T0OptionDirection;
  optionExpiryDate: string;
  optionPremium: string;
  optionPremiumCurrency: T0OptionPremiumCurrency;
  gridDirection: T0GridDirection;
  gridRangeMin: string;
  gridRangeMax: string;
  gridLeverage: string;
  gridCount: string;
  /** 开仓订单默认为未锁；锁定后仅管理员逐笔报价使用黑金标识。 */
  isLocked: boolean;
  /** 仅开仓：管理员按相反多空与盈亏展示，成员仍按原始订单展示。 */
  isCounterparty: boolean;
  /** 仅开仓：默认直接成交；设为挂单后等待统一标记价自动触发。 */
  isPending: boolean;
  /** 仅现货/合约开仓：止盈可预设在挂单上，成交后才由统一标记价自动触发。 */
  isTakeProfit: boolean;
  takeProfitPrice: string;
  takeProfitQuantity: string;
  takeProfitPlans: T0TakeProfitPlanDraft[];
  quantity: string;
  price: string;
  note: string;
  targetPrice?: number;
  editingEntryId?: string;
};

type JournalDirectoryKind = "account" | "relatedUser" | "relatedFund";
type JournalDirectoryRenameKind = Exclude<JournalDirectoryKind, "relatedUser">;
type JournalDirectoryTarget = {
  kind: JournalDirectoryKind;
  id: string;
  name: string;
  username?: string;
};
type JournalDirectoryRenameTarget = {
  kind: JournalDirectoryRenameKind;
  id: string;
  name: string;
  username?: string;
};

const ACTIONS: Record<TradeAction, { label: string; side: PositionSide; opening: boolean; activeClass: string; idleClass: string }> = {
  openLong: {
    label: "开多",
    side: "long",
    opening: true,
    activeClass: "border-rose-600 bg-rose-700 text-white",
    idleClass: "border-rose-200 bg-rose-50 text-rose-700",
  },
  closeLong: {
    label: "平多",
    side: "long",
    opening: false,
    activeClass: "border-rose-600 bg-rose-700 text-white",
    idleClass: "border-rose-200 bg-white text-rose-700",
  },
  openShort: {
    label: "开空",
    side: "short",
    opening: true,
    activeClass: "border-emerald-600 bg-emerald-600 text-white",
    idleClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  closeShort: {
    label: "平空",
    side: "short",
    opening: false,
    activeClass: "border-emerald-700 bg-emerald-700 text-white",
    idleClass: "border-emerald-200 bg-white text-emerald-700",
  },
};

const RECENT_JOURNAL_ACTIONS: TradeAction[] = ["openLong", "openShort", "closeLong", "closeShort"];
const RECENT_JOURNAL_PAGE_SIZE = 10;
const TOTAL_REVENUE_DETAIL_PAGE_SIZE = 10;

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// 仅作为未取得实时价时的首屏中心位。真实行情和历史订单不设人为上下限，
// 否则 ETH 跌破 2500 时会把 2433.92 这样的实时价错误塞进 2500 档位。
const LADDER_DEFAULT_CENTER_PRICE = 2750;
const LADDER_STEP = 10;
const LADDER_NEAR_VISIBLE_STEPS = 3;
const POSITION_ARCHIVE_STEP = 10;
const INTEGRATED_ARCHIVE_STEPS = [10, 25, 50, 100, 250, 500] as const;
type IntegratedArchiveStep = (typeof INTEGRATED_ARCHIVE_STEPS)[number];
// T+0 只读取服务端的 ETH 永续专用内存缓存；500ms 的页面节拍可呈现实时流，同时不直连外部交易所。
const T0_PRICE_REFRESH_INTERVAL_MS = 500;
// 账本数据由 App 的52号账本前台统一两秒调度刷新，避免该页产生第二个重叠轮询。
const T0_JOURNAL_STALE_TIME_MS = 2_000;
const DEFAULT_QUANTITY_QUICK_OPTIONS = ["10.00", "20.00", "30.00", "40.00", "50.00"];
const OKX_VIP2_TAKER_FEE_RATE = 0.00036;
const OKX_VIP2_TAKER_FEE_LABEL = "0.0360%";
const ETH_QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;

/**
 * 未平仓利润统一按开仓名义金额预提双边手续费：已发生开仓手续费 + 按同价估算的未来平仓手续费。
 * 这是展示层的净利润预估，不计资金费；实际平仓后仍以实际成交价及实际手续费结算。
 */
function calculateEstimatedUnrealizedNetPnl(
  side: PositionSide,
  markPrice: number | null,
  quantity: number,
  openingCostBasis: number,
): number | null {
  if (markPrice === null || quantity <= 0 || openingCostBasis <= 0) return null;
  const openingAverage = openingCostBasis / quantity;
  const grossPnl = side === "long"
    ? (markPrice - openingAverage) * quantity
    : (openingAverage - markPrice) * quantity;
  const estimatedRoundTripFee = openingCostBasis * OKX_VIP2_TAKER_FEE_RATE * 2;
  return grossPnl - estimatedRoundTripFee;
}

/**
 * T+0 期权浮盈严格使用同一份期权合约标记价与开仓权利金：
 * 多头 = （期权标记价 − 权利金单价）× 未平数量；空头方向相反。此处明确不计手续费。
 * Greeks 接口已将期权标记价统一为 USDT/张；ETH 计价权利金则按 T+0 的内部 ETH 参考价换算。
 */
function calculateOptionUnrealizedPnl({
  quantity,
  optionMarkPrice,
  premium,
  premiumCurrency,
  ethMarkPrice,
  direction,
}: {
  quantity: number;
  optionMarkPrice: number | null;
  premium?: number;
  premiumCurrency?: T0OptionPremiumCurrency;
  ethMarkPrice: number | null;
  direction?: T0OptionDirection;
}) {
  // 行情尚在请求、合约临时无报价时，null 经 Number(null) 会变成 0，
  // 从而把“尚未取得价格”误算成权利金全损。此时应等待真实期权价格，不能展示盈亏。
  if (optionMarkPrice === null || optionMarkPrice === undefined) return null;
  const safeQuantity = Number(quantity);
  const safeOptionMarkPrice = Number(optionMarkPrice);
  const safePremium = Number(premium);
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0
    || !Number.isFinite(safeOptionMarkPrice) || safeOptionMarkPrice < 0
    || !Number.isFinite(safePremium) || safePremium <= 0) return null;
  const premiumUsdtPerContract = premiumCurrency === "ETH"
    ? (ethMarkPrice !== null && Number.isFinite(ethMarkPrice) && ethMarkPrice > 0 ? safePremium * ethMarkPrice : null)
    : safePremium;
  if (premiumUsdtPerContract === null || !Number.isFinite(premiumUsdtPerContract) || premiumUsdtPerContract <= 0) return null;
  const isShortOption = direction === "short_call" || direction === "short_put";
  const pnlPerContract = isShortOption
    ? premiumUsdtPerContract - safeOptionMarkPrice
    : safeOptionMarkPrice - premiumUsdtPerContract;
  return {
    pnl: pnlPerContract * safeQuantity,
    premiumTotal: premiumUsdtPerContract * safeQuantity,
  };
}

/** 实时请求偶发零值、空值或尚未返回时，始终保留账本首屏下发的最近正数报价。 */
function resolveUsableOptionMarkPrice(liveMarkPrice: unknown, cachedMarkPrice?: number): number | null {
  const live = Number(liveMarkPrice);
  if (Number.isFinite(live) && live > 0) return live;
  const cached = Number(cachedMarkPrice);
  return Number.isFinite(cached) && cached > 0 ? cached : null;
}

function formatOptionQuote(value: number, currency: T0OptionPremiumCurrency) {
  if (!Number.isFinite(value)) return "--";
  const precision = Math.abs(value) < 1 ? 6 : 2;
  const formatted = Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: precision === 6 ? 2 : 2,
    maximumFractionDigits: precision,
  });
  return `${formatted} ${currency === "ETH" ? "ETH" : "U"}`;
}

/** 自动到期结算以开仓权利金和Deribit官方交割价计算；普通开平仓继续沿用既有成交价口径。 */
function calculateOptionExpiryCloseDetail(
  opening: PreviewTrade,
  closing: PreviewTrade,
  quantity: number,
): RecentJournalTradeDetail | null {
  if (opening.instrumentType !== "option" || closing.instrumentType !== "option"
    || closing.optionSettlementPrice === undefined || closing.optionDeliveryPrice === undefined
    || opening.optionPremium === undefined || !opening.optionPremiumCurrency || !opening.optionDirection) return null;
  const matchedQuantity = Number(quantity);
  const deliveryPrice = Number(closing.optionDeliveryPrice);
  const settlementPrice = Number(closing.optionSettlementPrice);
  const premium = Number(opening.optionPremium);
  if (![matchedQuantity, deliveryPrice, settlementPrice, premium].every(Number.isFinite)
    || matchedQuantity <= 0 || deliveryPrice <= 0 || settlementPrice < 0 || premium <= 0) return null;
  const premiumUsdtPerEth = opening.optionPremiumCurrency === "ETH" ? premium * deliveryPrice : premium;
  const financialQuantity = getTradeFinancialQuantity(closing, matchedQuantity);
  const isShortOption = opening.optionDirection.startsWith("short");
  const grossPnl = (isShortOption
    ? premiumUsdtPerEth - settlementPrice
    : settlementPrice - premiumUsdtPerEth) * financialQuantity;
  const allocatedOpeningFee = opening.quantity > 0 ? opening.fee * (matchedQuantity / opening.quantity) : 0;
  // 自动到期流水的 fee 已同时固化开仓与到期结算两边的交易成本。
  const closingFee = closing.quantity > 0 ? closing.fee * (matchedQuantity / closing.quantity) : 0;
  const premiumQuote = formatOptionQuote(premium, opening.optionPremiumCurrency);
  const settlementQuote = formatOptionQuote(settlementPrice, "USDT");
  return isShortOption
    ? {
      buyPrice: settlementPrice,
      sellPrice: premiumUsdtPerEth,
      buyQuote: settlementQuote,
      sellQuote: premiumQuote,
      grossPnl,
      netPnl: grossPnl - allocatedOpeningFee - closingFee,
      allocatedOpeningFee,
      closingFee,
      isOptionQuote: true,
      isOptionExpirySettlement: true,
    }
    : {
      buyPrice: premiumUsdtPerEth,
      sellPrice: settlementPrice,
      buyQuote: premiumQuote,
      sellQuote: settlementQuote,
      grossPnl,
      netPnl: grossPnl - allocatedOpeningFee - closingFee,
      allocatedOpeningFee,
      closingFee,
      isOptionQuote: true,
      isOptionExpirySettlement: true,
    };
}

/**
 * 会员收益分配仅影响利润与交易成本，不得缩减订单本身的 ETH 数量。
 * 非收益投影视图没有该字段，按完整订单（100%）核算。
 */
function getTradeProfitShareRate(trade: PreviewTrade) {
  const rate = Number(trade.profitShareRate);
  return Number.isFinite(rate) && rate > 0 && rate <= 1 ? rate : 1;
}

function getTradeFinancialQuantity(trade: PreviewTrade, quantity = trade.quantity) {
  const normalizedQuantity = Number(quantity);
  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) return 0;
  return normalizedQuantity * getTradeProfitShareRate(trade);
}

function priceKey(price: number) {
  return Number(price).toFixed(2);
}

/**
 * 多仓向上、空仓向下归档；默认十美元档用于真实开平匹配。
 * 整合报价可传入更宽的展示档位，但绝不改变真实成交、FIFO 或可平数量口径。
 */
function archivePriceForSide(side: PositionSide, value: number, archiveStep = POSITION_ARCHIVE_STEP) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const safeArchiveStep = Number.isFinite(archiveStep) && archiveStep > 0 ? archiveStep : POSITION_ARCHIVE_STEP;
  const scaled = value / safeArchiveStep;
  const rounded = side === "long"
    ? Math.ceil(scaled - 1e-9)
    : Math.floor(scaled + 1e-9);
  return Number((rounded * safeArchiveStep).toFixed(2));
}

function archivePriceForTrade(trade: PreviewTrade, archiveStep = POSITION_ARCHIVE_STEP) {
  const side = ACTIONS[trade.action].side;
  // 开仓永远以真实成交价归类，兼容此前被按方向写入错误百元档的旧流水。
  const sourcePrice = ACTIONS[trade.action].opening
    ? trade.price
    : (trade.targetPrice !== undefined && trade.targetPrice > 0 ? trade.targetPrice : trade.price);
  return archivePriceForSide(side, sourcePrice, archiveStep);
}

function formatPrice(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "--";
  return numberFormatter.format(value);
}

function formatLadderPrice(value: number) {
  return String(Math.round(value));
}

/**
 * 实时标记价保留两位小数：整数部分维持报价档主视觉，小数作为紧凑的精度提示。
 * 其他非实时档继续显示整数，避免梯形报价表产生视觉噪音。
 */
function splitLadderMarkPrice(value: number) {
  const [integerPart, fractionalPart = "00"] = value.toFixed(2).split(".");
  return { integerPart, fractionalPart };
}

/**
 * 只保留必要价格档：
 * - 实时价所在十元档上下各 3 档，便于快速开平；
 * - 每个已有未平仓的归属档，无论距离当前价多远都固定保留；
 * - 没有仓位、且不在实时价附近的空白档自动隐藏。
 */
function buildAdaptiveLadderLevels(markLadderPrice: number | null, positionPrices: number[] = [], step = LADDER_STEP) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : LADDER_STEP;
  const defaultCenter = Math.round(LADDER_DEFAULT_CENTER_PRICE / safeStep) * safeStep;
  // 实时价是价格簿的坐标基准，不能再限制在旧的 2500–3000 区间。
  // 只排除非正数，既能覆盖 ETH 当前的低价区间，也保留极端行情的真实顺序。
  const center = markLadderPrice !== null && Number.isFinite(markLadderPrice) && markLadderPrice > 0
    ? markLadderPrice
    : defaultCenter;
  const levels = new Set<number>();

  for (let offset = -LADDER_NEAR_VISIBLE_STEPS; offset <= LADDER_NEAR_VISIBLE_STEPS; offset += 1) {
    const price = center + offset * safeStep;
    if (price > 0) levels.add(price);
  }
  if (markLadderPrice !== null && Number.isFinite(markLadderPrice) && markLadderPrice > 0) levels.add(markLadderPrice);
  // 远端空白价位可以折叠，但已有仓位的十元归档档位必须始终可见。
  // 不能复用实时价格的2500–3000展示边界：旧仓可能在区间外，
  // 仍须保留为一个独立档位，且不补齐两者之间的数百个空白档。
  for (const price of positionPrices) {
    if (Number.isFinite(price) && price > 0) {
      levels.add(price);
    }
  }
  return Array.from(levels).sort((a, b) => b - a);
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0.00";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 梯形报价表空间有限：只压缩展示精度，不影响订单原始数量、FIFO 或盈亏计算。
function formatLadderQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (Math.abs(value) < 100) {
    return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

/** 整合报价的挂单/锁定摘要统一保留一位小数，区别于大数量的紧凑展示精度。 */
function formatIntegratedStatusQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.0";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** 止盈计划覆盖本笔全部剩余仓位时只标“止盈”；部分计划则明确标出计划止盈数量。 */
function getTakeProfitMarkerLabel(enabled: boolean | undefined, plannedQuantity: number | undefined, remainingQuantity: number) {
  if (!enabled) return null;
  const quantity = Number(plannedQuantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= remainingQuantity - 0.0000001) return "止盈";
  return `止盈${formatLadderQuantity(quantity)}`;
}

function getTradeTakeProfitPlans(trade: PreviewTrade): T0TakeProfitPlan[] {
  if (trade.takeProfitPlans && trade.takeProfitPlans.length > 0) return trade.takeProfitPlans;
  if (trade.takeProfitPrice !== undefined && trade.takeProfitQuantity !== undefined) {
    return [{
      triggerPrice: trade.takeProfitPrice,
      quantity: trade.takeProfitQuantity,
      status: trade.takeProfitEnabled ? "pending" : "triggered",
      triggeredAt: trade.takeProfitTriggeredAt,
      triggeredPrice: trade.takeProfitTriggeredPrice,
      triggeredQuantity: trade.takeProfitTriggeredQuantity,
    }];
  }
  return [];
}

function getPendingTakeProfitQuantity(trade: PreviewTrade) {
  return getTradeTakeProfitPlans(trade)
    .filter((plan) => plan.status === "pending")
    .reduce((total, plan) => total + plan.quantity, 0);
}

function formatQuantityQuickOption(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function normalizeEthQuantity(value: string) {
  const trimmed = value.trim();
  if (!ETH_QUANTITY_PATTERN.test(trimmed) || Number(trimmed) <= 0) return trimmed;
  const [integerPart, fractionalPart = ""] = trimmed.split(".");
  return `${integerPart}.${fractionalPart.padEnd(2, "0")}`;
}

function formatFee(value: number) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBeijingMonthDayTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${Number(values.month)}/${Number(values.day)} ${values.hour}:${values.minute}`;
}

/** 历史列表按真正发生的成交/触发活动排序：挂单取成交时间，自动止盈兼容旧记录取实际落库时间。 */
function getTradeActivityTime(trade: Pick<PreviewTrade, "createdAt" | "filledAt" | "recordedAt" | "note">) {
  if (trade.filledAt) return trade.filledAt;
  if (trade.note?.includes("[系统自动止盈]") && trade.recordedAt) return trade.recordedAt;
  return trade.createdAt;
}

/** 已触发的挂单同时保留原始挂单时间与实际成交时间；普通成交单仅展示原始下单时间。 */
function formatT0TradeTimeline(trade: Pick<PreviewTrade, "createdAt" | "filledAt">) {
  const createdAt = formatBeijingMonthDayTime(trade.createdAt);
  return trade.filledAt
    ? `挂单 ${createdAt} · 成交 ${formatBeijingMonthDayTime(trade.filledAt)}`
    : createdAt;
}

/** 系统自动成交／结算需要保留完整上下文，避免账户、用户或专项资金被省略号截断。 */
function hasSystemGeneratedSettlementNote(note?: string | null) {
  const normalizedNote = note?.trim() ?? "";
  return normalizedNote.includes("[系统自动成交]") || normalizedNote.includes("[系统自动结算]");
}

function getHistoryContextLayoutClass(showFullContext: boolean) {
  return showFullContext
    ? "mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 text-slate-500"
    : "mt-1 flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[11px] text-slate-500";
}

function getHistoryContextValueClass(showFullContext: boolean) {
  return showFullContext
    ? "max-w-full whitespace-normal break-words"
    : "min-w-0 truncate";
}

function formatBeijingLiveTime(value: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function formatSigned(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${numberFormatter.format(Math.abs(value))}`;
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${(Math.abs(value) * 100).toFixed(2)}%`;
}

function formatAmount(value: number) {
  return Number.isFinite(value) ? numberFormatter.format(value) : "--";
}

/**
 * 最近速记中的平仓展示按实际买卖口径计算净利润：
 * 多仓为卖出价－买入均价，空仓为卖出均价－买入价；
 * 再按已平数量分摊开仓手续费，并扣除本笔平仓手续费。
 * 同一账户、关联用户、专项款与十美元归属档位分别独立核算，避免拼单资金互相串仓。
 */
type RecentJournalTradeDetail = {
  buyPrice?: number;
  sellPrice?: number;
  /** 期权保留原计价币种的开仓权利金与到期结算报价。 */
  buyQuote?: string;
  sellQuote?: string;
  isOptionQuote?: boolean;
  isOptionExpirySettlement?: boolean;
  grossPnl?: number;
  netPnl?: number;
  allocatedOpeningFee?: number;
  closingFee?: number;
};

/** 与顶部总利润采用同一档位匹配口径的单笔已实现毛收益。 */
type RealizedGrossProfitDetail = {
  trade: PreviewTrade;
  quantity: number;
  grossPnl: number;
};

/**
 * 速记历史的开平成本匹配：默认严格按报价归属档位；旧流水若因 targetPrice 与原开仓档位不一致
 * 无法匹配时，退回至同账户、用户、项目和方向内的时间 FIFO，仅用于补全历史收益展示。
 * 仓位、可平数量和关联组单仍沿用严格档位规则，绝不因展示兜底改变现有持仓或审计归属。
 */
function buildRecentJournalTradeDetailsByScope(trades: PreviewTrade[], strictArchiveMatch: boolean) {
  const positions = new Map<string, {
    quantity: number;
    costBasis: number;
    financialQuantity: number;
    financialCostBasis: number;
    openingFeeBasis: number;
  }>();
  const details = new Map<string, RecentJournalTradeDetail>();
  const orderedTrades = [...trades]
    .filter((trade) => trade.symbol === "ETH")
    .sort((a, b) => getTradeActivityTime(a).localeCompare(getTradeActivityTime(b)) || a.id.localeCompare(b.id));

  for (const trade of orderedTrades) {
    const config = ACTIONS[trade.action];
    const side = config.side;
    const key = [
      side,
      ...(strictArchiveMatch ? [priceKey(archivePriceForTrade(trade))] : []),
      trade.accountId,
      trade.relatedUserId ?? "legacy-user",
      trade.relatedFundId ?? "legacy-fund",
    ].join(":");

    if (config.opening) {
      const current = positions.get(key) ?? {
        quantity: 0,
        costBasis: 0,
        financialQuantity: 0,
        financialCostBasis: 0,
        openingFeeBasis: 0,
      };
      const financialQuantity = getTradeFinancialQuantity(trade);
      current.quantity += trade.quantity;
      current.costBasis += trade.quantity * trade.price;
      current.financialQuantity += financialQuantity;
      current.financialCostBasis += financialQuantity * trade.price;
      current.openingFeeBasis += trade.fee;
      positions.set(key, current);
      const optionQuote = trade.instrumentType === "option" && trade.optionPremium !== undefined && trade.optionPremiumCurrency
        ? formatOptionQuote(trade.optionPremium, trade.optionPremiumCurrency)
        : undefined;
      details.set(trade.id, side === "long"
        ? { buyPrice: trade.price, buyQuote: optionQuote, isOptionQuote: Boolean(optionQuote) }
        : { sellPrice: trade.price, sellQuote: optionQuote, isOptionQuote: Boolean(optionQuote) });
      continue;
    }

    const current = positions.get(key);
    const matchedQuantity = current ? Math.min(current.quantity, trade.quantity) : 0;
    const openingAverage = current && current.quantity > 0 ? current.costBasis / current.quantity : undefined;
    const matchedFinancialQuantity = current ? getTradeFinancialQuantity(trade, matchedQuantity) : 0;
    const openingFinancialAverage = current && current.financialQuantity > 0
      ? current.financialCostBasis / current.financialQuantity
      : undefined;
    const allocatedOpeningFee = current && current.financialQuantity > 0 && matchedFinancialQuantity > 0
      ? current.openingFeeBasis * (matchedFinancialQuantity / current.financialQuantity)
      : 0;
    const closingFee = trade.quantity > 0 ? trade.fee * (matchedQuantity / trade.quantity) : 0;
    if (current && openingAverage !== undefined && openingFinancialAverage !== undefined && matchedQuantity > 0) {
      current.quantity -= matchedQuantity;
      current.costBasis = Math.max(0, current.costBasis - openingAverage * matchedQuantity);
      current.financialQuantity = Math.max(0, current.financialQuantity - matchedFinancialQuantity);
      current.financialCostBasis = Math.max(0, current.financialCostBasis - openingFinancialAverage * matchedFinancialQuantity);
      current.openingFeeBasis = Math.max(0, current.openingFeeBasis - allocatedOpeningFee);
      positions.set(key, current);
    }

    if (side === "long") {
      const grossPnl = openingFinancialAverage === undefined || matchedFinancialQuantity <= 0
        ? undefined
        : (trade.price - openingFinancialAverage) * matchedFinancialQuantity;
      details.set(trade.id, {
        buyPrice: openingAverage,
        sellPrice: trade.price,
        grossPnl,
        netPnl: grossPnl === undefined ? undefined : grossPnl - allocatedOpeningFee - closingFee,
        allocatedOpeningFee,
        closingFee,
      });
    } else {
      const grossPnl = openingFinancialAverage === undefined || matchedFinancialQuantity <= 0
        ? undefined
        : (openingFinancialAverage - trade.price) * matchedFinancialQuantity;
      details.set(trade.id, {
        buyPrice: trade.price,
        sellPrice: openingAverage,
        grossPnl,
        netPnl: grossPnl === undefined ? undefined : grossPnl - allocatedOpeningFee - closingFee,
        allocatedOpeningFee,
        closingFee,
      });
    }
  }

  // 自动到期平仓保存的是行权价与最终期权结算价，不能套用普通现货/合约的 price 差额公式。
  // 以 FIFO 已分配的原开仓单覆盖该类明细，保证历史单条、关联视图与净利润一致。
  const allocations = buildOpeningClosingAllocations(trades);
  for (const opening of trades) {
    if (!ACTIONS[opening.action].opening || opening.instrumentType !== "option") continue;
    for (const allocation of allocations.get(opening.id) ?? []) {
      const optionExpiryDetail = calculateOptionExpiryCloseDetail(opening, allocation.trade, allocation.quantity);
      if (optionExpiryDetail) details.set(allocation.trade.id, optionExpiryDetail);
    }
  }
  return details;
}

function buildRecentJournalTradeDetails(trades: PreviewTrade[]) {
  const strictDetails = buildRecentJournalTradeDetailsByScope(trades, true);
  const fallbackDetails = buildRecentJournalTradeDetailsByScope(trades, false);
  fallbackDetails.forEach((fallbackDetail, entryId) => {
    const strictDetail = strictDetails.get(entryId);
    if (strictDetail?.netPnl === undefined && fallbackDetail.netPnl !== undefined) {
      strictDetails.set(entryId, fallbackDetail);
    }
  });
  // 自动止盈已持久化“计划 → 平仓流水”的精确外键。普通历史列表也必须优先使用它：
  // 旧自动流水的 trade_time 可能因时区写入早于原开仓，不能再仅靠时间 FIFO 推断卖出价和收益。
  applyTriggeredTakeProfitHistoryDetails(trades, strictDetails);
  return strictDetails;
}

/** 按单张开仓主单的实际分配数量计算关联平仓的净利润，避免跨主单平仓时重复展示总利润。 */
function buildLinkedClosingDetail(opening: PreviewTrade, allocation: LinkedClosingAllocation): RecentJournalTradeDetail {
  const { trade: closing, quantity } = allocation;
  const optionExpiryDetail = calculateOptionExpiryCloseDetail(opening, closing, quantity);
  if (optionExpiryDetail) return optionExpiryDetail;
  const side = ACTIONS[opening.action].side;
  const allocatedOpeningFee = opening.quantity > 0 ? opening.fee * (quantity / opening.quantity) : 0;
  const closingFee = closing.quantity > 0 ? closing.fee * (quantity / closing.quantity) : 0;
  const financialQuantity = getTradeFinancialQuantity(closing, quantity);
  const grossPnl = side === "long"
    ? (closing.price - opening.price) * financialQuantity
    : (opening.price - closing.price) * financialQuantity;
  return side === "long"
    ? {
      buyPrice: opening.price,
      sellPrice: closing.price,
      grossPnl,
      netPnl: grossPnl - allocatedOpeningFee - closingFee,
      allocatedOpeningFee,
      closingFee,
    }
    : {
      buyPrice: closing.price,
      sellPrice: opening.price,
      grossPnl,
      netPnl: grossPnl - allocatedOpeningFee - closingFee,
      allocatedOpeningFee,
      closingFee,
    };
}

/** 用已触发止盈计划的不可变平仓外键覆盖普通历史明细，保证其卖出价和收益来自正确的开仓主单。 */
function applyTriggeredTakeProfitHistoryDetails(trades: PreviewTrade[], details: Map<string, RecentJournalTradeDetail>) {
  const closingsByStoredEntryId = new Map<string, PreviewTrade[]>();
  for (const trade of trades) {
    if (ACTIONS[trade.action].opening) continue;
    const closingEntryId = getStoredEntryId(trade);
    const rows = closingsByStoredEntryId.get(closingEntryId) ?? [];
    rows.push(trade);
    closingsByStoredEntryId.set(closingEntryId, rows);
  }

  const assignedClosingEntryIds = new Set<string>();
  for (const opening of trades) {
    if (!ACTIONS[opening.action].opening) continue;
    let remainingOpeningQuantity = opening.quantity;
    for (const plan of opening.takeProfitPlans ?? []) {
      if (plan.status !== "triggered" || !plan.closingEntryId || remainingOpeningQuantity <= 0.0000001) continue;
      const closingEntryId = String(plan.closingEntryId);
      if (assignedClosingEntryIds.has(closingEntryId)) continue;
      const closingRows = closingsByStoredEntryId.get(closingEntryId) ?? [];
      let remainingPlanQuantity = Number(plan.triggeredQuantity ?? plan.quantity);
      if (!Number.isFinite(remainingPlanQuantity) || remainingPlanQuantity <= 0.0000001) continue;
      let applied = false;
      for (const closing of closingRows) {
        if (ACTIONS[closing.action].side !== ACTIONS[opening.action].side || remainingPlanQuantity <= 0.0000001) continue;
        const quantity = Math.min(closing.quantity, remainingPlanQuantity, remainingOpeningQuantity);
        if (quantity <= 0.0000001) continue;
        details.set(closing.id, buildLinkedClosingDetail(opening, { trade: closing, quantity }));
        remainingPlanQuantity -= quantity;
        remainingOpeningQuantity -= quantity;
        applied = true;
      }
      if (applied) assignedClosingEntryIds.add(closingEntryId);
    }
  }
}

type ProfitShareDistributionItem = {
  beneficiaryUserId: number;
  beneficiaryUserName: string;
  percentageLabel: string;
  netPnl: number;
};

/**
 * 管理员历史记录的逐人分配明细：严格以平仓时继承的开仓快照为准。
 * 一笔平仓若 FIFO 关联多张开仓，逐张先扣对应手续费、再按该张开仓快照拆分，最后汇总到受益人。
 */
function buildClosingProfitShareDistribution(input: {
  trades: PreviewTrade[];
  snapshots: ProfitShareSnapshot[];
  closing: PreviewTrade;
  displayedNetPnl: number;
}): ProfitShareDistributionItem[] {
  const { trades, snapshots, closing, displayedNetPnl } = input;
  const closingEntryId = getStoredEntryId(closing);
  const closingSnapshots = snapshots.filter((snapshot) => snapshot.entryId === closingEntryId);
  if (closingSnapshots.length === 0 || !Number.isFinite(displayedNetPnl)) return [];

  const snapshotsByOpeningId = new Map<string, ProfitShareSnapshot[]>();
  for (const snapshot of closingSnapshots) {
    const rows = snapshotsByOpeningId.get(snapshot.openingEntryId) ?? [];
    rows.push(snapshot);
    snapshotsByOpeningId.set(snapshot.openingEntryId, rows);
  }

  const allocationsByOpening = buildOpeningClosingAllocations(trades);
  const totals = new Map<number, { name: string; netPnl: number; percentages: Set<number> }>();
  const handledOpeningIds = new Set<string>();
  for (const opening of trades) {
    if (!ACTIONS[opening.action].opening) continue;
    const openingEntryId = getStoredEntryId(opening);
    if (handledOpeningIds.has(openingEntryId)) continue;
    const openingSnapshots = snapshotsByOpeningId.get(openingEntryId);
    if (!openingSnapshots?.length) continue;
    handledOpeningIds.add(openingEntryId);
    const matchingClosings = (allocationsByOpening.get(opening.id) ?? [])
      .filter((allocation) => getStoredEntryId(allocation.trade) === closingEntryId);
    for (const allocation of matchingClosings) {
      const segmentNetPnl = buildLinkedClosingDetail(opening, allocation).netPnl;
      if (segmentNetPnl === undefined || !Number.isFinite(segmentNetPnl)) continue;
      for (const snapshot of openingSnapshots) {
        const current = totals.get(snapshot.beneficiaryUserId) ?? {
          name: snapshot.beneficiaryUserName || `用户#${snapshot.beneficiaryUserId}`,
          netPnl: 0,
          percentages: new Set<number>(),
        };
        current.netPnl += segmentNetPnl * (snapshot.percentage / 100);
        current.percentages.add(snapshot.percentage);
        totals.set(snapshot.beneficiaryUserId, current);
      }
    }
  }

  // 罕见的旧流水或投影视图无法回溯 FIFO 时，仍只使用已固化快照按实际匹配数量归一化拆分，绝不读取当前规则。
  if (totals.size === 0) {
    const weightedRows = closingSnapshots.map((snapshot) => ({
      snapshot,
      weight: Math.max(0, snapshot.matchedQuantity) * Math.max(0, snapshot.percentage),
    }));
    const totalWeight = weightedRows.reduce((total, item) => total + item.weight, 0);
    for (const { snapshot, weight } of weightedRows) {
      const current = totals.get(snapshot.beneficiaryUserId) ?? {
        name: snapshot.beneficiaryUserName || `用户#${snapshot.beneficiaryUserId}`,
        netPnl: 0,
        percentages: new Set<number>(),
      };
      current.netPnl += displayedNetPnl * (totalWeight > 0 ? weight / totalWeight : snapshot.percentage / 100);
      current.percentages.add(snapshot.percentage);
      totals.set(snapshot.beneficiaryUserId, current);
    }
  }

  const calculatedTotal = Array.from(totals.values()).reduce((total, item) => total + item.netPnl, 0);
  // 统一以历史列表中显示的净利润为总额，消除浮点尾差及反向展示视图带来的展示口径差异。
  const scale = Math.abs(calculatedTotal) > 1e-9 ? displayedNetPnl / calculatedTotal : 1;
  return Array.from(totals.entries())
    .map(([beneficiaryUserId, item]) => ({
      beneficiaryUserId,
      beneficiaryUserName: item.name,
      percentageLabel: Array.from(item.percentages).sort((left, right) => left - right).map((percentage) => `${formatPrice(percentage)}%`).join(" / "),
      netPnl: item.netPnl * scale,
    }))
    .sort((left, right) => right.netPnl - left.netPnl || left.beneficiaryUserName.localeCompare(right.beneficiaryUserName, "zh-CN"));
}

/**
 * 持仓详情只读取开仓当时固化的收益分配快照，不读取当前项目规则。
 * 正常情况下 entryId 与 openingEntryId 相同；旧数据缺少原始开仓快照时，才以同一开仓
 * 后续平仓继承的快照回填展示，且每位受益人只保留一条比例。
 */
function getOpeningProfitShareSnapshotAllocations(snapshots: ProfitShareSnapshot[], openingEntryId: string) {
  const inheritedSnapshots = snapshots.filter((snapshot) => snapshot.openingEntryId === openingEntryId && snapshot.percentage > 0);
  const directSnapshots = inheritedSnapshots.filter((snapshot) => snapshot.entryId === openingEntryId);
  const candidates = directSnapshots.length > 0 ? directSnapshots : inheritedSnapshots;
  const byBeneficiary = new Map<number, ProfitShareSnapshot>();
  for (const snapshot of candidates) {
    if (!byBeneficiary.has(snapshot.beneficiaryUserId)) byBeneficiary.set(snapshot.beneficiaryUserId, snapshot);
  }
  return Array.from(byBeneficiary.values())
    .map((snapshot) => ({
      beneficiaryUserId: snapshot.beneficiaryUserId,
      beneficiaryUserName: snapshot.beneficiaryUserName || `用户#${snapshot.beneficiaryUserId}`,
      percentage: snapshot.percentage,
    }))
    .sort((left, right) => right.percentage - left.percentage || left.beneficiaryUserName.localeCompare(right.beneficiaryUserName, "zh-CN"));
}

function formatProfitSharePercentage(percentage: number) {
  if (!Number.isFinite(percentage)) return "0%";
  return `${Number(percentage.toFixed(4)).toString()}%`;
}

function buildPositionBuckets(trades: PreviewTrade[]) {
  const buckets = new Map<string, PositionBucket>();
  const orderedTrades = [...trades]
    .sort((a, b) => getTradeActivityTime(a).localeCompare(getTradeActivityTime(b)) || a.id.localeCompare(b.id));

  for (const trade of orderedTrades) {
    const config = ACTIONS[trade.action];
    const side = config.side;

    if (config.opening) {
      const archivePrice = archivePriceForTrade(trade);
      const key = `${side}:${priceKey(archivePrice)}`;
      const existing = buckets.get(key);
      const financialQuantity = trade.instrumentType === "option" ? 0 : getTradeFinancialQuantity(trade);
      if (existing) {
        // 同档混有不同类型时，不能把整档误标成期权；仅纯期权档使用专属视觉与无伪浮盈口径。
        if (existing.instrumentType !== trade.instrumentType) existing.instrumentType = undefined;
        existing.originalQuantity += trade.quantity;
        existing.remainingQuantity += trade.quantity;
        existing.costBasis += trade.quantity * trade.price;
        existing.financialQuantity += financialQuantity;
        existing.financialCostBasis += financialQuantity * trade.price;
        existing.openingFeeBasis += trade.fee;
      } else {
        buckets.set(key, {
          key,
          side,
          instrumentType: trade.instrumentType,
          price: archivePrice,
          originalQuantity: trade.quantity,
          remainingQuantity: trade.quantity,
          costBasis: trade.quantity * trade.price,
          financialQuantity,
          financialCostBasis: financialQuantity * trade.price,
          openingFeeBasis: trade.fee,
          realizedGrossPnl: 0,
          realizedOpeningFee: 0,
          realizedClosingFee: 0,
          realizedPnl: 0,
          closedQuantity: 0,
          closedCostBasis: 0,
          closedNotional: 0,
          openedAt: trade.createdAt,
        });
      }
      continue;
    }

    if (!trade.targetPrice) continue;
    const archivePrice = archivePriceForSide(side, trade.targetPrice);
    const targetKey = `${side}:${priceKey(archivePrice)}`;
    const target = buckets.get(targetKey);
    if (!target || target.remainingQuantity <= 0) continue;

    const closedQuantity = Math.min(target.remainingQuantity, trade.quantity);
    const closedFinancialQuantity = getTradeFinancialQuantity(trade, closedQuantity);
    const averageCost = target.costBasis / target.remainingQuantity;
    const financialAverageCost = target.financialQuantity > 0
      ? target.financialCostBasis / target.financialQuantity
      : averageCost;
    const allocatedOpeningFee = target.financialQuantity > 0
      ? target.openingFeeBasis * (closedFinancialQuantity / target.financialQuantity)
      : 0;
    const closingFee = trade.quantity > 0 ? trade.fee * (closedQuantity / trade.quantity) : 0;
    const grossPnl = side === "long"
      ? (trade.price - financialAverageCost) * closedFinancialQuantity
      : (financialAverageCost - trade.price) * closedFinancialQuantity;
    target.remainingQuantity -= closedQuantity;
    target.costBasis = Math.max(0, target.costBasis - averageCost * closedQuantity);
    target.financialQuantity = Math.max(0, target.financialQuantity - closedFinancialQuantity);
    target.financialCostBasis = Math.max(0, target.financialCostBasis - financialAverageCost * closedFinancialQuantity);
    target.openingFeeBasis = Math.max(0, target.openingFeeBasis - allocatedOpeningFee);
    target.realizedGrossPnl += grossPnl;
    target.realizedOpeningFee += allocatedOpeningFee;
    target.realizedClosingFee += closingFee;
    target.realizedPnl += grossPnl - allocatedOpeningFee - closingFee;
    target.closedQuantity += closedQuantity;
    target.closedCostBasis += averageCost * closedQuantity;
    target.closedNotional += trade.price * closedQuantity;
  }

  return Array.from(buckets.values()).filter((bucket) => bucket.originalQuantity > 0);
}

/**
 * 按顶部“总利润”完全一致的归属档位 FIFO 口径，逐笔还原每条平仓流水的毛收益。
 * 该函数不计入任何手续费或资金费，所有明细相加应与总利润一致。
 */
function buildRealizedGrossProfitDetails(trades: PreviewTrade[]) {
  const positions = new Map<string, {
    quantity: number;
    costBasis: number;
    financialQuantity: number;
    financialCostBasis: number;
  }>();
  const details: RealizedGrossProfitDetail[] = [];
  const orderedTrades = [...trades]
    .filter((trade) => trade.symbol === "ETH")
    .sort((a, b) => getTradeActivityTime(a).localeCompare(getTradeActivityTime(b)) || a.id.localeCompare(b.id));

  for (const trade of orderedTrades) {
    const config = ACTIONS[trade.action];
    const side = config.side;
    if (config.opening) {
      const archivePrice = archivePriceForTrade(trade);
      const key = `${side}:${priceKey(archivePrice)}`;
      const current = positions.get(key);
      const financialQuantity = getTradeFinancialQuantity(trade);
      if (current) {
        current.quantity += trade.quantity;
        current.costBasis += trade.quantity * trade.price;
        current.financialQuantity += financialQuantity;
        current.financialCostBasis += financialQuantity * trade.price;
      } else {
        positions.set(key, {
          quantity: trade.quantity,
          costBasis: trade.quantity * trade.price,
          financialQuantity,
          financialCostBasis: financialQuantity * trade.price,
        });
      }
      continue;
    }

    if (!trade.targetPrice) continue;
    const archivePrice = archivePriceForSide(side, trade.targetPrice);
    const key = `${side}:${priceKey(archivePrice)}`;
    const target = positions.get(key);
    if (!target || target.quantity <= 0) continue;

    const quantity = Math.min(target.quantity, trade.quantity);
    const openingAverage = target.costBasis / target.quantity;
    const financialQuantity = getTradeFinancialQuantity(trade, quantity);
    const financialOpeningAverage = target.financialQuantity > 0
      ? target.financialCostBasis / target.financialQuantity
      : openingAverage;
    const grossPnl = side === "long"
      ? (trade.price - financialOpeningAverage) * financialQuantity
      : (financialOpeningAverage - trade.price) * financialQuantity;
    target.quantity -= quantity;
    target.costBasis = Math.max(0, target.costBasis - openingAverage * quantity);
    target.financialQuantity = Math.max(0, target.financialQuantity - financialQuantity);
    target.financialCostBasis = Math.max(0, target.financialCostBasis - financialOpeningAverage * financialQuantity);
    positions.set(key, target);
    details.push({
      trade,
      quantity,
      grossPnl,
    });
  }

  const journalDetails = buildRecentJournalTradeDetails(trades);
  return details
    .map((detail) => {
      const optionDetail = journalDetails.get(detail.trade.id);
      return optionDetail?.isOptionExpirySettlement && optionDetail.grossPnl !== undefined
        ? { ...detail, grossPnl: optionDetail.grossPnl }
        : detail;
    })
    .sort((a, b) => getTradeActivityTime(b.trade).localeCompare(getTradeActivityTime(a.trade)) || b.trade.id.localeCompare(a.trade.id));
}

/**
 * 将平仓流水按同一账户、关联用户、专项款、方向和十美元归属档位，依时间顺序分配至开仓主单。
 * 这是价格簿现有平仓可用量口径的逐笔展开：一笔平仓若跨越多张主单，会在各主单下显示实际分配量。
 */
function buildOpeningClosingAllocations(trades: PreviewTrade[]) {
  const openingQueues = new Map<string, Array<{ entryId: string; remainingQuantity: number }>>();
  const allocations = new Map<string, LinkedClosingAllocation[]>();
  const sourceOpeningById = new Map<string, PreviewTrade>();
  const sourceClosingById = new Map<string, PreviewTrade[]>();

  for (const trade of trades) {
    if (trade.symbol !== "ETH") continue;
    if (ACTIONS[trade.action].opening) {
      sourceOpeningById.set(getStoredEntryId(trade), trade);
      continue;
    }
    const sourceId = getStoredEntryId(trade);
    const rows = sourceClosingById.get(sourceId) ?? [];
    rows.push(trade);
    sourceClosingById.set(sourceId, rows);
  }

  // 自动止盈在服务端记录了“计划 → 平仓流水”的不可变外键。先按该外键分配：即使旧记录
  // 曾以错误时区写入 trade_time，也绝不会被 FIFO 误认为发生在开仓之前。
  const directlyLinkedClosingIds = new Set<string>();
  const directlyClosedByOpeningId = new Map<string, number>();
  for (const opening of Array.from(sourceOpeningById.values())) {
    const directRows = allocations.get(opening.id) ?? [];
    let directlyClosed = 0;
    for (const plan of opening.takeProfitPlans ?? []) {
      if (plan.status !== "triggered" || !plan.closingEntryId) continue;
      const closingRows = sourceClosingById.get(String(plan.closingEntryId)) ?? [];
      for (const closing of closingRows) {
        if (directlyLinkedClosingIds.has(closing.id)) continue;
        const configuredQuantity = Number(plan.triggeredQuantity ?? plan.quantity);
        const availableQuantity = Math.max(0, opening.quantity - directlyClosed);
        const quantity = Math.min(closing.quantity, configuredQuantity, availableQuantity);
        if (quantity <= 0.0000001) continue;
        directRows.push({ trade: closing, quantity });
        directlyClosed += quantity;
        directlyLinkedClosingIds.add(closing.id);
      }
    }
    if (directRows.length > 0) {
      directRows.sort((a, b) => getTradeActivityTime(a.trade).localeCompare(getTradeActivityTime(b.trade)) || a.trade.id.localeCompare(b.trade.id));
      allocations.set(opening.id, directRows);
      directlyClosedByOpeningId.set(opening.id, directlyClosed);
    }
  }

  const orderedTrades = [...trades]
    .filter((trade) => trade.symbol === "ETH")
    .sort((a, b) => getTradeActivityTime(a).localeCompare(getTradeActivityTime(b)) || a.id.localeCompare(b.id));

  const scopeKeyFor = (trade: PreviewTrade) => [
    ACTIONS[trade.action].side,
    priceKey(archivePriceForTrade(trade)),
    trade.accountId,
    trade.relatedUserId ?? "legacy-user",
    trade.relatedFundId ?? "legacy-fund",
  ].join(":");

  for (const trade of orderedTrades) {
    const config = ACTIONS[trade.action];
    const scopeKey = scopeKeyFor(trade);
    if (config.opening) {
      const queue = openingQueues.get(scopeKey) ?? [];
      const directQuantity = directlyClosedByOpeningId.get(trade.id) ?? 0;
      queue.push({ entryId: trade.id, remainingQuantity: Math.max(0, trade.quantity - directQuantity) });
      openingQueues.set(scopeKey, queue);
      continue;
    }

    if (directlyLinkedClosingIds.has(trade.id)) continue;
    let remainingToAllocate = trade.quantity;
    const queue = openingQueues.get(scopeKey) ?? [];
    for (const opening of queue) {
      if (remainingToAllocate <= 0.0000001) break;
      if (opening.remainingQuantity <= 0.0000001) continue;
      const allocatedQuantity = Math.min(opening.remainingQuantity, remainingToAllocate);
      opening.remainingQuantity -= allocatedQuantity;
      remainingToAllocate -= allocatedQuantity;
      const linkedRows = allocations.get(opening.entryId) ?? [];
      linkedRows.push({ trade, quantity: allocatedQuantity });
      allocations.set(opening.entryId, linkedRows);
    }
  }

  return allocations;
}
function invertTradeAction(action: TradeAction): TradeAction {
  switch (action) {
    case "openLong": return "openShort";
    case "closeLong": return "closeShort";
    case "openShort": return "openLong";
    case "closeShort": return "closeLong";
  }
}

function invertOptionDirection(direction?: T0OptionDirection): T0OptionDirection | undefined {
  if (!direction) return undefined;
  const opposite: Record<T0OptionDirection, T0OptionDirection> = {
    long_call: "short_call",
    short_call: "long_call",
    long_put: "short_put",
    short_put: "long_put",
  };
  return opposite[direction];
}

function invertGridDirection(direction?: T0GridDirection): T0GridDirection | undefined {
  return direction === "long" ? "short" : direction === "short" ? "long" : undefined;
}

function getStoredEntryId(trade: PreviewTrade) {
  return trade.sourceEntryId ?? trade.id;
}
function getDetailEntryId(trade: PreviewTrade) {
  return trade.detailEntryId ?? trade.id;
}
function getStoredAction(trade: PreviewTrade): TradeAction {
  return trade.sourceAction ?? trade.action;
}

function getStoredOptionDirection(trade: PreviewTrade) {
  return trade.sourceOptionDirection ?? trade.optionDirection;
}

function getStoredGridDirection(trade: PreviewTrade) {
  return trade.sourceGridDirection ?? trade.gridDirection;
}

/**
 * 管理端镜像仅改变可见投影：开平方向反转，手续费同号反转后令净收益严格等于用户端净收益的相反数。
 * 数据库仍保存用户原始方向；关闭标记后重新拉取即可完整回到普通展示。
 */
function asAdminCounterpartyTrade(trade: PreviewTrade): PreviewTrade {
  const sourceAction = getStoredAction(trade);
  const sourceFee = trade.sourceFee ?? trade.fee;
  return {
    ...trade,
    action: invertTradeAction(sourceAction),
    optionDirection: invertOptionDirection(getStoredOptionDirection(trade)),
    gridDirection: invertGridDirection(getStoredGridDirection(trade)),
    fee: -sourceFee,
    sourceEntryId: getStoredEntryId(trade),
    sourceAction,
    sourceOptionDirection: getStoredOptionDirection(trade),
    sourceGridDirection: getStoredGridDirection(trade),
    sourceFee,
    isCounterpartyView: true,
  };
}

/**
 * 平仓标记并不落库：按原始 FIFO 找到其归属开仓后，在管理员侧拆分为可独立展示的片段。
 * 这样同一笔平仓跨越普通与反向开仓时，数量、手续费及盈亏仍可逐段精确对应。
 */
function projectAdminCounterpartyTrades(rawTrades: PreviewTrade[]): PreviewTrade[] {
  const allocations = buildOpeningClosingAllocations(rawTrades);
  const slicesByClosingId = new Map<string, Array<{ trade: PreviewTrade; quantity: number; isCounterparty: boolean }>>();
  for (const opening of rawTrades) {
    if (!ACTIONS[opening.action].opening) continue;
    for (const allocation of allocations.get(opening.id) ?? []) {
      const slices = slicesByClosingId.get(allocation.trade.id) ?? [];
      slices.push({ trade: allocation.trade, quantity: allocation.quantity, isCounterparty: Boolean(opening.isCounterparty) });
      slicesByClosingId.set(allocation.trade.id, slices);
    }
  }

  return rawTrades.flatMap((trade) => {
    if (ACTIONS[trade.action].opening) {
      return trade.isCounterparty ? [asAdminCounterpartyTrade(trade)] : [trade];
    }
    const slices = slicesByClosingId.get(trade.id);
    if (!slices || slices.length === 0) return [trade];
    const allocatedQuantity = slices.reduce((total, slice) => total + slice.quantity, 0);
    const projected = slices.map((slice, index) => {
      const ratio = trade.quantity > 0 ? slice.quantity / trade.quantity : 0;
      const sliceTrade: PreviewTrade = {
        ...trade,
        id: `fifo-${trade.id}-${index + 1}`,
        sourceEntryId: trade.id,
        quantity: slice.quantity,
        fee: trade.fee * ratio,
      };
      return slice.isCounterparty ? asAdminCounterpartyTrade(sliceTrade) : sliceTrade;
    });
    const unmatchedQuantity = Math.max(0, trade.quantity - allocatedQuantity);
    if (unmatchedQuantity > 0.0000001) {
      projected.push({
        ...trade,
        id: `fifo-${trade.id}-unmatched`,
        sourceEntryId: trade.id,
        quantity: unmatchedQuantity,
        fee: trade.quantity > 0 ? trade.fee * (unmatchedQuantity / trade.quantity) : 0,
      });
    }
    return projected;
  });
}

/**
 * 已有平仓的开仓不能再改动会影响 FIFO 的字段；但单独切换管理员反向展示或锁定标记，
 * 都不会改变任何真实成交、数量或配对关系。前端据此走受限更新分支，服务端只更新对应单列作为最终保护。
 */
function getSafeDependentOpeningEdit(input: {
  form: EntryForm;
  original: PreviewTrade | null;
  normalizedQuantity: string;
  effectivePrice: string;
  /** 部分平仓时，表单展示的是剩余可操作数量，而不是原始开仓总量。 */
  editableQuantity?: number;
}): "counterparty" | "lock" | null {
  const { form, original, normalizedQuantity, effectivePrice, editableQuantity } = input;
  if (!original || !form.editingEntryId) return null;
  const sameNumber = (left: string | number, right: number | undefined) => Math.abs(Number(left) - Number(right ?? 0)) <= 0.0000001;
  const originalRelatedUserId = original.relatedUserId ?? "";
  const originalRelatedFundId = original.relatedFundId ?? "legacy";
  const originalInstrumentType = original.instrumentType ?? "contract";
  const sameOption = originalInstrumentType !== "option" || (
    form.optionDirection === getStoredOptionDirection(original)
    && form.optionExpiryDate === (original.optionExpiryDate ?? "")
    && sameNumber(form.optionPremium || "0", original.optionPremium)
    && form.optionPremiumCurrency === (original.optionPremiumCurrency ?? "USDT")
  );
  const sameGrid = originalInstrumentType !== "grid" || (
    form.gridDirection === getStoredGridDirection(original)
    && sameNumber(form.gridRangeMin || "0", original.gridRangeMin)
    && sameNumber(form.gridRangeMax || "0", original.gridRangeMax)
    && sameNumber(form.gridLeverage || "0", original.gridLeverage)
    && Number(form.gridCount || 0) === Number(original.gridCount ?? 0)
  );

  const isOtherwiseUnchanged = form.action === getStoredAction(original)
    && form.accountId === original.accountId
    && form.relatedUserId === originalRelatedUserId
    && form.relatedFundId === originalRelatedFundId
    && form.instrumentType === originalInstrumentType
    && sameNumber(normalizedQuantity, editableQuantity ?? original.quantity)
    && sameNumber(effectivePrice, original.price)
    && form.isLocked === Boolean(original.isLocked)
    && form.isPending === Boolean(original.isPending)
    && form.note.trim() === (original.note ?? "").trim()
    && sameOption
    && sameGrid;
  if (!isOtherwiseUnchanged) return null;

  const isCounterpartyChanged = Boolean(form.isCounterparty) !== Boolean(original.isCounterparty);
  const isLockChanged = Boolean(form.isLocked) !== Boolean(original.isLocked);
  if (isCounterpartyChanged && !isLockChanged) return "counterparty";
  if (isLockChanged && !isCounterpartyChanged) return "lock";
  return null;
}

/**
 * 整合报价的宽档仅聚合展示：先沿用十美元真实 FIFO 得出每张已成交主单的剩余数量，
 * 再按所选宽度归档；挂单也显示在对应档位，但绝不进入仓位、盈亏、手续费或可平数量。
 * 因此切换 25/50/100U 等宽度不会让已平仓位回补，也不会改变真实可平数量。
 */
function buildIntegratedDisplayBuckets(
  trades: PreviewTrade[],
  allocations: Map<string, LinkedClosingAllocation[]>,
  archiveStep: number,
) {
  const displayBuckets = new Map<string, PositionBucket>();

  for (const trade of trades) {
    if (!ACTIONS[trade.action].opening || trade.symbol !== "ETH") continue;
    const isPending = Boolean(trade.isPending);
    const linkedClosings = isPending ? [] : (allocations.get(trade.id) ?? []);
    const closedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
    const remainingQuantity = isPending ? trade.quantity : Math.max(0, trade.quantity - closedQuantity);
    if (remainingQuantity <= 0.0000001) continue;

    const side = ACTIONS[trade.action].side;
    const displayPrice = archivePriceForTrade(trade, archiveStep);
    const key = `${side}:${priceKey(displayPrice)}`;
    const remainingFinancialQuantity = isPending ? 0 : getTradeFinancialQuantity(trade, remainingQuantity);
    const remainingOpeningFee = isPending ? 0 : (trade.quantity > 0 ? trade.fee * (remainingQuantity / trade.quantity) : 0);
    const existing = displayBuckets.get(key);

    if (existing) {
      // 整合报价只在整档全部为期权时显示紫色金属底；混合档仍按普通仓位展示，避免错误归类。
      if (existing.instrumentType !== trade.instrumentType) existing.instrumentType = undefined;
      existing.originalQuantity += remainingQuantity;
      existing.remainingQuantity += remainingQuantity;
      existing.pendingQuantity = (existing.pendingQuantity ?? 0) + (isPending ? remainingQuantity : 0);
      existing.lockedRemainingQuantity = (existing.lockedRemainingQuantity ?? 0) + (!isPending && trade.isLocked ? remainingQuantity : 0);
      existing.costBasis += isPending ? 0 : remainingQuantity * trade.price;
      existing.financialQuantity += remainingFinancialQuantity;
      existing.financialCostBasis += isPending ? 0 : remainingFinancialQuantity * trade.price;
      existing.openingFeeBasis += remainingOpeningFee;
      if (trade.createdAt < existing.openedAt) existing.openedAt = trade.createdAt;
      continue;
    }

    displayBuckets.set(key, {
      key,
      side,
      instrumentType: trade.instrumentType,
      price: displayPrice,
      originalQuantity: remainingQuantity,
      remainingQuantity,
      pendingQuantity: isPending ? remainingQuantity : 0,
      lockedRemainingQuantity: !isPending && trade.isLocked ? remainingQuantity : 0,
      costBasis: isPending ? 0 : remainingQuantity * trade.price,
      financialQuantity: remainingFinancialQuantity,
      financialCostBasis: isPending ? 0 : remainingFinancialQuantity * trade.price,
      openingFeeBasis: remainingOpeningFee,
      // 宽档只承担未平仓展示，已平仓明细仍按真实十美元档与主单 FIFO 展示。
      realizedGrossPnl: 0,
      realizedOpeningFee: 0,
      realizedClosingFee: 0,
      realizedPnl: 0,
      closedQuantity: 0,
      closedCostBasis: 0,
      closedNotional: 0,
      openedAt: trade.createdAt,
    });
  }

  return Array.from(displayBuckets.values());
}

/**
 * 类型是开仓研究维度。筛选时不能直接过滤平仓流水，否则已平数量会被错误地回补为未平仓；
 * 因此先按完整 FIFO 找到每张开仓对应的平仓，再仅投影该类型开仓所分摊的平仓数量。
 */
function filterTradesByInstrumentTypes(trades: PreviewTrade[], selectedTypes: T0InstrumentType[]) {
  if (selectedTypes.length === 0) return trades;
  const selectedTypeSet = new Set(selectedTypes);
  const matches = (trade: PreviewTrade) => Boolean(trade.instrumentType && selectedTypeSet.has(trade.instrumentType));
  const openings = trades.filter((trade) => ACTIONS[trade.action].opening && matches(trade));
  const allocations = buildOpeningClosingAllocations(trades);
  const filterKey = selectedTypes.join("-");
  const closings = openings.flatMap((opening) => (allocations.get(opening.id) ?? []).map(({ trade, quantity }) => ({
    ...trade,
    id: `instrument-${filterKey}-${trade.id}-${opening.id}`,
    sourceEntryId: getStoredEntryId(trade),
    detailEntryId: getDetailEntryId(trade),
    quantity,
    fee: trade.quantity > 0 ? trade.fee * (quantity / trade.quantity) : 0,
    instrumentType: opening.instrumentType,
  })));
  return [...openings, ...closings].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** 开平仓保持完整 ETH 数量，收益与交易成本按同一开仓的多人快照分配；所有受益人比例严格合计100%。 */
function projectMemberProfitShareTrades(
  rawTrades: PreviewTrade[],
  snapshots: ProfitShareSnapshot[],
  viewerUserId: string,
) {
  const viewerId = Number(viewerUserId);
  if (!Number.isInteger(viewerId) || viewerId <= 0) return rawTrades;
  const beneficiarySnapshotsByEntry = new Map<string, ProfitShareSnapshot[]>();
  const entriesWithSnapshots = new Set<string>();
  for (const snapshot of snapshots) {
    entriesWithSnapshots.add(snapshot.entryId);
    if (snapshot.beneficiaryUserId === viewerId) {
      const entryRows = beneficiarySnapshotsByEntry.get(snapshot.entryId) ?? [];
      entryRows.push(snapshot);
      beneficiarySnapshotsByEntry.set(snapshot.entryId, entryRows);
    }
  }
  const projected: PreviewTrade[] = [];
  for (const trade of rawTrades) {
    // 关联用户本人始终查看完整原始订单；收益分配只影响其他受益人的投影，不能把本人的开仓隐藏。
    // 这也保证反向展示订单在成员端始终保留原方向、完整数量及原始损益口径。
    if (Number(trade.relatedUserId || 0) === viewerId) {
      projected.push(trade);
      continue;
    }
    const beneficiarySnapshots = beneficiarySnapshotsByEntry.get(trade.id) ?? [];
    if (beneficiarySnapshots.length === 0) {
      // 规则上线前的历史订单没有快照，订单本人继续按完整原单查看，保证历史可追溯。
      if (!entriesWithSnapshots.has(trade.id) && Number(trade.relatedUserId || 0) === viewerId) projected.push(trade);
      continue;
    }
    for (const snapshot of beneficiarySnapshots) {
      const rate = Number(snapshot.percentage || 0) / 100;
      if (rate <= 0.0000001) continue;
      const matchedQuantity = ACTIONS[trade.action].opening ? trade.quantity : snapshot.matchedQuantity;
      if (!Number.isFinite(matchedQuantity) || matchedQuantity <= 0) continue;
      const allocatedFee = ACTIONS[trade.action].opening
        ? trade.fee * rate
        : (trade.quantity > 0 ? trade.fee * (matchedQuantity / trade.quantity) * rate : 0);
      projected.push({
        ...trade,
        id: `beneficiary-${trade.id}-${snapshot.openingEntryId}-${snapshot.beneficiaryUserId}`,
        quantity: matchedQuantity,
        fee: allocatedFee,
        profitShareRate: rate,
        profitShareBeneficiaryUserId: String(viewerId),
      });
    }
  }
  return projected.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * 历史记录的关联视图：每张开仓单与其对应平仓流水组成一组。
 * 无法由现有 FIFO 口径匹配到开仓单的平仓记录也单独保留，避免审计流水被隐藏。
 */
function buildLinkedJournalGroups(trades: PreviewTrade[]): LinkedJournalGroup[] {
  const allocations = buildOpeningClosingAllocations(trades);
  const linkedClosingIds = new Set<string>();
  const openingGroups = trades
    .filter((trade) => trade.symbol === "ETH" && ACTIONS[trade.action].opening)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .map((opening) => {
      const closings = allocations.get(opening.id) ?? [];
      closings.forEach(({ trade }) => linkedClosingIds.add(trade.id));
      return { id: `opening-${opening.id}`, opening, closings } satisfies LinkedJournalGroup;
    });
  const unmatchedClosingGroups = trades
    .filter((trade) => trade.symbol === "ETH" && !ACTIONS[trade.action].opening && !linkedClosingIds.has(trade.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .map((trade) => ({
      id: `unmatched-${trade.id}`,
      closings: [{ trade, quantity: trade.quantity }],
    }) satisfies LinkedJournalGroup);

  return [...openingGroups, ...unmatchedClosingGroups]
    .sort((left, right) => {
      const activityTime = (group: LinkedJournalGroup) => [group.opening, ...group.closings.map((item) => item.trade)]
        .filter((trade): trade is PreviewTrade => Boolean(trade))
        .map((trade) => getTradeActivityTime(trade))
        .sort()
        .at(-1) ?? "";
      return activityTime(right).localeCompare(activityTime(left)) || right.id.localeCompare(left.id);
    });
}

function calculateSummary(buckets: PositionBucket[], markPrice: number | null, trades: PreviewTrade[]) {
  // 期权自动到期时 price 仍保留行权价供 FIFO 匹配，故累计收益必须复用历史明细中的权利金/结算价公式。
  const realizedDetails = buildRecentJournalTradeDetails(trades);
  const calculateSide = (side: PositionSide) => {
    const active = buckets.filter((bucket) => bucket.side === side && bucket.remainingQuantity > 0.0000001);
    const all = buckets.filter((bucket) => bucket.side === side);
    const sideTrades = trades.filter((trade) => ACTIONS[trade.action].side === side);
    const quantity = active.reduce((total, bucket) => total + bucket.remainingQuantity, 0);
    const weightedCost = active.reduce((total, bucket) => total + bucket.costBasis, 0);
    const average = quantity > 0 ? weightedCost / quantity : 0;
    const financialQuantity = active.reduce((total, bucket) => total + bucket.financialQuantity, 0);
    const financialCostBasis = active.reduce((total, bucket) => total + bucket.financialCostBasis, 0);
    const unrealized = calculateEstimatedUnrealizedNetPnl(side, markPrice, financialQuantity, financialCostBasis);
    const realizedClosingTrades = sideTrades.filter((trade) => !ACTIONS[trade.action].opening);
    const realized = realizedClosingTrades.reduce((total, trade) => total + (realizedDetails.get(trade.id)?.netPnl ?? 0), 0);
    const realizedGross = realizedClosingTrades.reduce((total, trade) => total + (realizedDetails.get(trade.id)?.grossPnl ?? 0), 0);
    const realizedOpeningFee = realizedClosingTrades.reduce((total, trade) => total + (realizedDetails.get(trade.id)?.allocatedOpeningFee ?? 0), 0);
    const realizedClosingFee = realizedClosingTrades.reduce((total, trade) => total + (realizedDetails.get(trade.id)?.closingFee ?? 0), 0);
    const closedQuantity = all.reduce((total, bucket) => total + bucket.closedQuantity, 0);
    const closedCostBasis = all.reduce((total, bucket) => total + bucket.closedCostBasis, 0);
    const closedNotional = all.reduce((total, bucket) => total + bucket.closedNotional, 0);
    const closedAverageCost = closedQuantity > 0 ? closedCostBasis / closedQuantity : 0;
    const closedAveragePrice = closedQuantity > 0 ? closedNotional / closedQuantity : 0;
    // 累计交易额口径：当前账户、当前方向下，所有已保存开/平仓成交名义金额之和。
    const turnover = sideTrades.reduce((total, trade) => total + trade.quantity * trade.price, 0);
    // 累计佣金口径：当前账户、当前方向下，所有已保存开/平仓实际发生的手续费之和。
    const commission = sideTrades.reduce((total, trade) => total + trade.fee, 0);
    return {
      quantity,
      average,
      unrealized,
      realizedGross,
      realizedOpeningFee,
      realizedClosingFee,
      realized,
      turnover,
      commission,
      closedQuantity,
      closedAverageCost,
      closedAveragePrice,
      activeLevels: active.length,
    };
  };

  const long = calculateSide("long");
  const short = calculateSide("short");
  return {
    long,
    short,
    realized: long.realized + short.realized,
    unrealized: (long.unrealized ?? 0) + (short.unrealized ?? 0),
  };
}

type T0JournalProps = {
  /** 资金方“融资复息订单”页内直接展示个人只读仓位时使用，不再显示路由返回按钮。 */
  embedded?: boolean;
  /** 仅由52号账本管理员代入成员时传入；后端仍会强制返回目标成员的只读范围。 */
  allowAdminViewAs?: boolean;
};

export function T0JournalView({ embedded = false, allowAdminViewAs = false }: T0JournalProps) {
  const { id } = useParams<{ id: string }>();
  const ledgerId = Number(id);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const [accounts, setAccounts] = useState<PreviewAccount[]>([]);
  const [recentRelatedUsers, setRecentRelatedUsers] = useState<PreviewRelatedUser[]>([]);
  const [relatedFunds, setRelatedFunds] = useState<PreviewRelatedFund[]>([]);
  const [trades, setTrades] = useState<PreviewTrade[]>([]);
  // 管理员切换历史呈现时保留原始流水；用户呈现基于它重新走与成员端相同的投影。
  const [rawJournalTrades, setRawJournalTrades] = useState<PreviewTrade[]>([]);
  // 空数组代表“全部”；有选择时按同一维度的并集、不同维度的交集筛选。
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [relatedUserFilterIds, setRelatedUserFilterIds] = useState<string[]>([]);
  const [relatedFundFilterIds, setRelatedFundFilterIds] = useState<string[]>([]);
  const [instrumentTypeFilterIds, setInstrumentTypeFilterIds] = useState<T0InstrumentType[]>([]);
  const [executionFilter, setExecutionFilter] = useState<T0ExecutionFilter>("all");
  const [hideLocked, setHideLocked] = useState(false);
  // 成员端用户范围固定为本人；保留旧状态字段仅用于兼容此前浏览器保存的筛选状态。
  const [memberRelatedUserFilterTouched, setMemberRelatedUserFilterTouched] = useState(false);
  // 历史记录拥有独立筛选范围：不影响上方持仓汇总与T形交割表。
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  // 管理员筛到单个用户后，可在历史区仅切换展示口径，不改变其实际管理权限。
  const [historyPresentation, setHistoryPresentation] = useState<"admin" | "member">("admin");
  const [historyAccountFilterIds, setHistoryAccountFilterIds] = useState<string[]>([]);
  const [historyRelatedUserFilterIds, setHistoryRelatedUserFilterIds] = useState<string[]>([]);
  const [historyRelatedFundFilterIds, setHistoryRelatedFundFilterIds] = useState<string[]>([]);
  const [historyInstrumentTypeFilterIds, setHistoryInstrumentTypeFilterIds] = useState<T0InstrumentType[]>([]);
  const [historyExecutionFilter, setHistoryExecutionFilter] = useState<T0ExecutionFilter>("all");
  const [historyHideLocked, setHistoryHideLocked] = useState(false);
  const [journalActionFilters, setJournalActionFilters] = useState<Set<TradeAction>>(
    () => new Set(RECENT_JOURNAL_ACTIONS),
  );
  /** 仅显示已实现净收益为正的平多、平空历史记录；管理员与成员端共用同一口径。 */
  const [showOnlyProfitableHistory, setShowOnlyProfitableHistory] = useState(false);
  const [showLinkedJournalGroups, setShowLinkedJournalGroups] = useState(false);
  const [recentJournalPage, setRecentJournalPage] = useState(1);
  const [lastRelatedUserId, setLastRelatedUserId] = useState("");
  const [lastAccountIdByRelatedUser, setLastAccountIdByRelatedUser] = useState<Record<string, string>>({});
  const [lastFundIdByRelatedUser, setLastFundIdByRelatedUser] = useState<Record<string, string>>({});
  const [, setRelatedUserQuickPickerOpen] = useState(false);
  const [relatedUserPickerOpen, setRelatedUserPickerOpen] = useState(false);
  const [relatedUserSearch, setRelatedUserSearch] = useState("");
  // 管理员的“用户视角预览”只影响当前T+0页面读取范围，不改变登录会话身份。
  const [previewUserId, setPreviewUserId] = useState<number | null>(null);
  const [previewMemberPickerOpen, setPreviewMemberPickerOpen] = useState(false);
  const [previewMemberSearch, setPreviewMemberSearch] = useState("");
  const [profitShareSource, setProfitShareSource] = useState<PreviewRelatedFund | null>(null);
  const [profitShareRecipientSearch, setProfitShareRecipientSearch] = useState("");
  const [profitShareAllocations, setProfitShareAllocations] = useState<ProfitShareAllocationDraft[]>([]);
  const [entryProfitShareEditTarget, setEntryProfitShareEditTarget] = useState<PreviewTrade | null>(null);
  const [profitShareSnapshots, setProfitShareSnapshots] = useState<ProfitShareSnapshot[]>([]);
  const [directoryManagerKind, setDirectoryManagerKind] = useState<JournalDirectoryKind | null>(null);
  const [directoryRenameTarget, setDirectoryRenameTarget] = useState<JournalDirectoryRenameTarget | null>(null);
  const [directoryDeleteTarget, setDirectoryDeleteTarget] = useState<JournalDirectoryTarget | null>(null);
  const [directoryRenameDraft, setDirectoryRenameDraft] = useState("");
  const [showEntrySheet, setShowEntrySheet] = useState(false);
  const [closeConfirmationStep, setCloseConfirmationStep] = useState<"input" | "review">("input");
  /** 平仓确认中的共享收益草案：仅在提交当下传入服务端，额度仍由服务端用收益快照复核。 */
  const [sharedIncomeDrafts, setSharedIncomeDrafts] = useState<Record<string, string>>({});
  const [sharedIncomeTargetSelections, setSharedIncomeTargetSelections] = useState<Record<string, number>>({});
  const [expandedOpenedTradeIds, setExpandedOpenedTradeIds] = useState<Set<string>>(() => new Set());
  const [showSettledOpeningHistory, setShowSettledOpeningHistory] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<PreviewTrade | null>(null);
  const [revertCandidate, setRevertCandidate] = useState<PreviewTrade | null>(null);
  const [historyActionMenuTradeId, setHistoryActionMenuTradeId] = useState<string | null>(null);
  const [netProfitDetail, setNetProfitDetail] = useState<{
    trade: PreviewTrade;
    detail: RecentJournalTradeDetail;
    presentation?: "admin" | "member";
    viewerUserId?: number;
  } | null>(null);
  const [showTotalNetProfitDetail, setShowTotalNetProfitDetail] = useState(false);
  const [totalRevenueDetailPage, setTotalRevenueDetailPage] = useState(1);
  const [showPayoutLog, setShowPayoutLog] = useState(false);
  const [showPayoutXirrHelp, setShowPayoutXirrHelp] = useState(false);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutDirection, setPayoutDirection] = useState<T0JournalPayoutDirection>("withdrawal");
  const [payoutLogView, setPayoutLogView] = useState<T0JournalPayoutLogView>("all");
  const [payoutOccurredOn, setPayoutOccurredOn] = useState(() => getBeijingDateInputValue());
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [editingPayoutLog, setEditingPayoutLog] = useState<T0JournalPayoutLog | null>(null);
  const [isPayoutListEditing, setIsPayoutListEditing] = useState(false);
  const [deletePayoutLogId, setDeletePayoutLogId] = useState<string | null>(null);
  const [showNetPositionDetail, setShowNetPositionDetail] = useState(false);
  const [grossProfitDetail, setGrossProfitDetail] = useState<{
    side: PositionSide;
    gross: number;
    openingFee: number;
    closingFee: number;
    net: number;
  } | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<RecoverableTrade | null>(null);
  const [recoverableEntries, setRecoverableEntries] = useState<RecoverableTrade[]>([]);
  const [showRecoverableRecords, setShowRecoverableRecords] = useState(false);
  const [entrySide, setEntrySide] = useState<PositionSide>("long");
  /** 当前由哪张开仓主单发起平仓；仅用于详情页精确提示与重选，不改变后端 FIFO 核算。 */
  const [closingSourceTrade, setClosingSourceTrade] = useState<PreviewTrade | null>(null);
  /** 编辑已有开仓时保留原始快照，用于识别不影响 FIFO 的“仅反向展示切换”。 */
  const [editingOriginalTrade, setEditingOriginalTrade] = useState<PreviewTrade | null>(null);
  const [lastSavedQuantity, setLastSavedQuantity] = useState("");
  const [lastOpeningInstrumentType, setLastOpeningInstrumentType] = useState<T0InstrumentType>("contract");
  const [showCumulativeData, setShowCumulativeData] = useState(false);
  const [adminLadderDisplayMode, setAdminLadderDisplayMode] = useState<AdminLadderDisplayMode>("individual");
  /** 仅控制整合报价的显示聚合宽度；真实成交、FIFO 与平仓匹配始终使用十美元档。 */
  const [integratedArchiveStep, setIntegratedArchiveStep] = useState<IntegratedArchiveStep>(POSITION_ARCHIVE_STEP);
  const [lastMarkPrice, setLastMarkPrice] = useState<number | null>(null);
  const [previousMarkPrice, setPreviousMarkPrice] = useState<number | null>(null);
  const [liveClock, setLiveClock] = useState(() => new Date());
  const previousFetchedMarkPriceRef = useRef<number | null>(null);
  /** “盈利”历史记录截图入口：仅导出当前历史记录区块。 */
  const profitableHistoryExportRef = useRef<HTMLElement | null>(null);
  const payoutSharedContentRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedJournalFiltersRef = useRef(false);
  const activeTopFilterStorageKeyRef = useRef<string | null>(null);
  const [hydratedTopFilterStorageKey, setHydratedTopFilterStorageKey] = useState<string | null>(null);
  // 从报价表进入表单后，返回与保存必须回到原先的整合/逐笔模式。
  const entrySheetLadderDisplayModeRef = useRef<AdminLadderDisplayMode>("individual");
  // 整合报价详情必须沿用进入时的展示归档宽度，避免详情范围在交互中漂移。
  const entrySheetArchiveStepRef = useRef<number>(POSITION_ARCHIVE_STEP);
  const [entryForm, setEntryForm] = useState<EntryForm>({
    action: "openLong",
    accountId: "",
    accountName: "",
    relatedUserId: "",
    relatedUserName: "",
    relatedUsername: "",
    relatedFundId: "",
    relatedFundName: "",
    instrumentType: "contract",
    optionDirection: "long_call",
    optionExpiryDate: "",
    optionPremium: "",
    optionPremiumCurrency: "USDT",
    gridDirection: "long",
    gridRangeMin: "",
    gridRangeMax: "",
    gridLeverage: "",
    gridCount: "",
    isLocked: false,
    isCounterparty: false,
    isPending: false,
    isTakeProfit: false,
    takeProfitPrice: "",
    takeProfitQuantity: "",
    takeProfitPlans: [],
    quantity: "",
    price: "",
    note: "",
  });

  const viewAsUserId = searchParams.get("viewAs") || (typeof window !== "undefined" ? window.sessionStorage.getItem("view-as-user-id") : null);
  const { data: me, isLoading: meLoading } = trpc.auth.me.useQuery(undefined, { retry: false });
  const { data: ledgerData, isLoading: ledgerLoading } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: Number.isFinite(ledgerId) && ledgerId > 0 },
  );
  const isLedgerAdmin = (ledgerData as any)?.userRole === "admin" || (ledgerData as any)?.userRole === "owner";
  const isSuperAdmin = (me as any)?.role === "super_admin" || (me as any)?.role === "admin";
  const hasLedgerMembership = Boolean((ledgerData as any)?.userRole);
  // 账本成员可读取个人范围；仅嵌入页允许管理员代入成员读取该成员的同一只读范围。
  const canAccess = ledgerId === 52
    && (hasLedgerMembership || isSuperAdmin)
    && (!viewAsUserId || (embedded && allowAdminViewAs));
  const { data: t0MarkPriceRaw } = trpc.getT0EthPerpetualMark.useQuery(undefined, {
    enabled: canAccess,
    refetchInterval: T0_PRICE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 250,
  });
  const canUseMemberPreview = canAccess && (isLedgerAdmin || isSuperAdmin) && !Boolean(viewAsUserId);
  const t0JournalQuery = trpc.ledger.t0GetJournal.useQuery(
    { ledgerId: 52, previewUserId: previewUserId || undefined },
    {
      enabled: canAccess,
      staleTime: T0_JOURNAL_STALE_TIME_MS,
      // 统一由52号账本活动页面的两秒调度失效并重拉，后台页面不会请求。
      refetchOnWindowFocus: true,
    },
  );
  const queriedViewerMode = (t0JournalQuery.data as any)?.viewerMode;
  const isUserPreview = previewUserId !== null;
  // 管理员切回时不能用上一位成员的缓存数据短暂放开编辑按钮；等待完整管理范围重新返回。
  const isPreviewSwitching = isUserPreview
    ? Number((t0JournalQuery.data as any)?.viewerRelatedUserId || 0) !== previewUserId
    : canUseMemberPreview && queriedViewerMode !== undefined && queriedViewerMode !== "admin";
  const isMemberView = isUserPreview || (!canUseMemberPreview && queriedViewerMode === "member");
  const canManage = canAccess && queriedViewerMode === "admin" && !isUserPreview && !isPreviewSwitching;
  const sharedIncomeTransfers = useMemo<SharedIncomeTransfer[]>(() => {
    const rows = (t0JournalQuery.data as any)?.sharedIncomeTransfers;
    return Array.isArray(rows) ? rows.map((item: any) => ({
      id: String(item.id),
      closingEntryId: String(item.closingEntryId),
      sourceUserId: Number(item.sourceUserId),
      sourceUserName: String(item.sourceUserName || `用户#${item.sourceUserId}`),
      recipientUserId: Number(item.recipientUserId),
      recipientUserName: String(item.recipientUserName || `用户#${item.recipientUserId}`),
      recipientUsername: item.recipientUsername ? String(item.recipientUsername) : undefined,
      amount: Number(item.amount || 0),
      sourceNetPnl: Number(item.sourceNetPnl || 0),
      managerPoolAmount: Number(item.managerPoolAmount || 0),
      createdAt: String(item.createdAt || ""),
    })).filter((item) => item.id && Number.isFinite(item.amount) && item.amount > 0) : [];
  }, [t0JournalQuery.data]);
  const payoutDepositAmountByRelatedUser = useMemo(() => new Map(
    (Array.isArray((t0JournalQuery.data as any)?.payoutDepositTotals)
      ? (t0JournalQuery.data as any).payoutDepositTotals
      : [])
      .map((item: any) => [String(item.relatedUserId), Math.max(0, Number(item.cumulativeDepositAmount) || 0)] as const),
  ), [t0JournalQuery.data]);
  const payoutCashFlowsByRelatedUser = useMemo(() => {
    const cashFlowsByUser = new Map<string, Array<{ occurredOn: string; direction: T0JournalPayoutDirection; amount: number }>>();
    const rows = Array.isArray((t0JournalQuery.data as any)?.payoutCashFlows)
      ? (t0JournalQuery.data as any).payoutCashFlows
      : [];
    for (const row of rows) {
      const relatedUserId = String(row.relatedUserId || "");
      const amount = Number(row.amount || 0);
      const occurredOn = String(row.occurredOn || "").slice(0, 10);
      if (!relatedUserId || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) continue;
      const direction: T0JournalPayoutDirection = row.direction === "deposit" ? "deposit" : "withdrawal";
      cashFlowsByUser.set(relatedUserId, [...(cashFlowsByUser.get(relatedUserId) || []), { occurredOn, direction, amount }]);
    }
    return cashFlowsByUser;
  }, [t0JournalQuery.data]);
  const t0PreviewMembersQuery = trpc.ledger.t0GetPreviewMembers.useQuery(
    { ledgerId: 52 },
    {
      enabled: canUseMemberPreview,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  );
  const previewMembers = useMemo(() => Array.isArray(t0PreviewMembersQuery.data)
    ? t0PreviewMembersQuery.data.map((member: any) => ({
      id: Number(member.id),
      name: String(member.name || `用户#${member.id}`),
      username: member.username ? String(member.username) : undefined,
    })).filter((member) => Number.isInteger(member.id) && member.id > 0)
    : [], [t0PreviewMembersQuery.data]);
  const selectedPreviewMember = previewMembers.find((member) => member.id === previewUserId) ?? null;
  const visiblePreviewMembers = useMemo(() => {
    const keyword = previewMemberSearch.trim().toLowerCase();
    if (!keyword) return previewMembers;
    return previewMembers.filter((member) => `${member.name} ${member.username || ""} ${member.id}`.toLowerCase().includes(keyword));
  }, [previewMemberSearch, previewMembers]);
  // 仅管理员已在顶部筛选出一位真实用户时，才允许将“历史记录”切换为该用户登录后的呈现。
  const historyPerspectiveTargetUserId = canManage
    && relatedUserFilterIds.length === 1
    && /^\d+$/.test(relatedUserFilterIds[0])
    ? Number(relatedUserFilterIds[0])
    : 0;
  const isHistoryUserPerspective = Boolean(
    historyPresentation === "member" && historyPerspectiveTargetUserId > 0,
  );
  const historyIsMemberPresentation = isMemberView || isHistoryUserPerspective;
  useEffect(() => {
    if (historyPerspectiveTargetUserId === 0 && historyPresentation !== "admin") {
      setHistoryPresentation("admin");
    }
  }, [historyPerspectiveTargetUserId, historyPresentation]);
  const payoutTargetRelatedUserId = isUserPreview
    ? previewUserId
    : isMemberView
      ? Number((t0JournalQuery.data as any)?.viewerRelatedUserId || 0)
    : (canManage && relatedUserFilterIds.length === 1 && /^\d+$/.test(relatedUserFilterIds[0])
      ? Number(relatedUserFilterIds[0])
      : 0);
  const t0PayoutLogsQuery = trpc.ledger.t0GetPayoutLogs.useQuery(
    { ledgerId: 52, relatedUserId: payoutTargetRelatedUserId || undefined, previewUserId: previewUserId || undefined },
    {
      enabled: canAccess && payoutTargetRelatedUserId > 0,
      staleTime: 0,
      refetchOnWindowFocus: true,
    },
  );
  const t0Utils = trpc.useUtils();
  const resetPayoutLogForm = () => {
    setEditingPayoutLog(null);
    setPayoutAmount("");
    setPayoutNote("");
    setPayoutDirection("withdrawal");
    setPayoutOccurredOn(getBeijingDateInputValue());
    setShowPayoutForm(false);
  };
  const openPayoutLogForm = (direction: T0JournalPayoutDirection) => {
    setEditingPayoutLog(null);
    setPayoutDirection(direction);
    setPayoutLogView(direction);
    setPayoutAmount("");
    setPayoutNote("");
    setPayoutOccurredOn(getBeijingDateInputValue());
    setShowPayoutForm(true);
  };
  const createPayoutLogMutation = trpc.ledger.t0CreatePayoutLog.useMutation({
    onSuccess: async (createdLog) => {
      const payoutLogQueryInput = { ledgerId: 52 as const, relatedUserId: payoutTargetRelatedUserId || undefined };
      // 先将服务端刚写入的真实记录放入当前缓存，避免移动端请求重排时弹窗短暂显示“暂无资金记录”。
      t0Utils.ledger.t0GetPayoutLogs.setData(payoutLogQueryInput, (current) => [
        createdLog,
        ...(Array.isArray(current) ? current.filter((log) => log.id !== createdLog.id) : []),
      ]);
      resetPayoutLogForm();
      setPayoutLogView(createdLog.direction === "deposit" ? "deposit" : "withdrawal");
      await t0Utils.ledger.t0GetPayoutLogs.invalidate(payoutLogQueryInput);
      toast.success("资金流水已保存");
    },
    onError: (error) => toast.error(error.message || "资金流水保存失败"),
  });
  const updatePayoutLogMutation = trpc.ledger.t0UpdatePayoutLog.useMutation({
    onSuccess: async (updatedLog) => {
      const payoutLogQueryInput = { ledgerId: 52 as const, relatedUserId: payoutTargetRelatedUserId || undefined };
      t0Utils.ledger.t0GetPayoutLogs.setData(payoutLogQueryInput, (current) => [
        updatedLog,
        ...(Array.isArray(current) ? current.filter((log) => log.id !== updatedLog.id) : []),
      ]);
      resetPayoutLogForm();
      setPayoutLogView(updatedLog.direction === "deposit" ? "deposit" : "withdrawal");
      await t0Utils.ledger.t0GetPayoutLogs.invalidate(payoutLogQueryInput);
      toast.success("资金流水已更新");
    },
    onError: (error) => toast.error(error.message || "资金流水更新失败"),
  });
  const deletePayoutLogMutation = trpc.ledger.t0DeletePayoutLog.useMutation({
    onSuccess: async (deletedLog) => {
      const payoutLogQueryInput = { ledgerId: 52 as const, relatedUserId: payoutTargetRelatedUserId || undefined };
      t0Utils.ledger.t0GetPayoutLogs.setData(payoutLogQueryInput, (current) =>
        Array.isArray(current) ? current.filter((log) => log.id !== deletedLog.id) : [],
      );
      setDeletePayoutLogId(null);
      if (editingPayoutLog?.id === deletedLog.id) resetPayoutLogForm();
      await t0Utils.ledger.t0GetPayoutLogs.invalidate(payoutLogQueryInput);
      toast.success("资金流水已删除");
    },
    onError: (error) => toast.error(error.message || "资金流水删除失败"),
  });
  // 推荐树仅供管理员在完整管理视图内筛选，普通成员不读取任何下线名单。
  const t0ReferralFilterQuery = trpc.ledger.t0GetReferralFilterOptions.useQuery(
    { ledgerId: 52 },
    {
      enabled: canAccess && canManage,
      staleTime: 60_000,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  );
  const referralDescendantsByRootUserId = useMemo(() => {
    const raw = (t0ReferralFilterQuery.data as any)?.descendantsByUserId;
    const map = new Map<string, string[]>();
    if (!raw || typeof raw !== "object") return map;
    for (const [rootUserId, descendantUserIds] of Object.entries(raw as Record<string, unknown>)) {
      if (!/^\d+$/.test(rootUserId) || !Array.isArray(descendantUserIds)) continue;
      const descendants = Array.from(new Set(descendantUserIds
        .map((userId) => String(userId))
        .filter((userId) => /^\d+$/.test(userId) && userId !== rootUserId)));
      if (descendants.length > 0) map.set(rootUserId, descendants);
    }
    return map;
  }, [t0ReferralFilterQuery.data]);
  const currentReferralRootUserId = useMemo(() => {
    // 用户预览必须从目标成员本人作为筛选根节点，不能沿用管理员浏览器缓存的用户筛选。
    if (isUserPreview && previewUserId) return String(previewUserId);
    const apiRootUserId = String((t0ReferralFilterQuery.data as any)?.rootUserId || "");
    if (/^\d+$/.test(apiRootUserId)) return apiRootUserId;
    const signedInUserId = String((me as any)?.id || "");
    return canManage && /^\d+$/.test(signedInUserId) ? signedInUserId : "";
  }, [canManage, isUserPreview, me, previewUserId, t0ReferralFilterQuery.data]);
  const referralDataLoaded = !canManage || t0ReferralFilterQuery.isSuccess;
  const referralDescendantsForCurrentRoot = currentReferralRootUserId
    ? referralDescendantsByRootUserId.get(currentReferralRootUserId)
    : undefined;
  const topFilterStorageKey = useMemo(() => {
    // 预览是管理员当前会话内的临时只读核对，不读取或覆写被预览用户在其他设备上的筛选偏好。
    if (isUserPreview) return null;
    const journal = t0JournalQuery.data as any;
    const viewerMode = journal?.viewerMode;
    const memberViewerId = journal?.viewerRelatedUserId;
    const signedInUserId = (me as any)?.id;
    if ((viewerMode !== "admin" && viewerMode !== "member") || !signedInUserId) return null;
    const viewerId = viewerMode === "member" ? String(memberViewerId || signedInUserId) : String(signedInUserId);
    return getT0TopFilterStorageKey(ledgerId, viewerMode, viewerId);
  }, [isUserPreview, ledgerId, me, t0JournalQuery.data]);
  const directoryImpactTarget = directoryRenameTarget || directoryDeleteTarget;
  const directoryImpactDimension = directoryImpactTarget?.kind === "account"
    ? "account"
    : directoryImpactTarget?.kind === "relatedFund"
      ? "related_fund"
      : "related_user";
  const directoryImpactQuery = trpc.ledger.t0GetDirectoryImpact.useQuery(
    {
      ledgerId: 52,
      dimension: directoryImpactDimension,
      dimensionId: Number(directoryImpactTarget?.id || 0),
    },
    {
      enabled: canManage && Boolean(directoryImpactTarget?.id),
      staleTime: 0,
      refetchOnWindowFocus: false,
    },
  );
  const relatedUserSearchQuery = trpc.ledger.t0SearchRelatedUsers.useQuery(
    { ledgerId: 52, query: relatedUserSearch.trim() },
    {
      enabled: canManage && relatedUserPickerOpen && relatedUserSearch.trim().length > 0,
      staleTime: 30_000,
    },
  );
  const profitShareRecipientSearchQuery = trpc.ledger.t0SearchRelatedUsers.useQuery(
    { ledgerId: 52, query: profitShareRecipientSearch.trim() },
    {
      enabled: canManage && Boolean(profitShareSource) && profitShareRecipientSearch.trim().length > 0,
      staleTime: 30_000,
    },
  );
  const profitShareRules = useMemo<ProfitShareRule[]>(() => {
    const rows = (t0JournalQuery.data as any)?.profitShareRules;
    return Array.isArray(rows) ? rows.map((rule: any) => ({
      id: Number(rule.id),
      relatedFundId: Number(rule.relatedFundId),
      relatedFundName: String(rule.relatedFundName || `项目#${rule.relatedFundId}`),
      sourceUserId: Number(rule.sourceUserId),
      sourceUserName: String(rule.sourceUserName || `用户#${rule.sourceUserId}`),
      beneficiaryUserId: Number(rule.beneficiaryUserId),
      beneficiaryUserName: String(rule.beneficiaryUserName || `用户#${rule.beneficiaryUserId}`),
      percentage: Number(rule.percentage || 0),
      createdAt: String(rule.createdAt || ""),
    })) : [];
  }, [t0JournalQuery.data]);
  const activeProfitShareRules = profitShareSource
    ? profitShareRules.filter((rule) => rule.relatedFundId === Number(profitShareSource.id))
    : [];
  const profitShareDraftTotal = profitShareAllocations.reduce((total, allocation) => total + (Number.isInteger(Number(allocation.percentage)) ? Number(allocation.percentage) : 0), 0);
  const netProfitShareDistribution = useMemo(() => {
    if (!canManage || netProfitDetail?.presentation === "member" || !netProfitDetail || netProfitDetail.detail.netPnl === undefined) return [];
    return buildClosingProfitShareDistribution({
      trades,
      snapshots: profitShareSnapshots,
      closing: netProfitDetail.trade,
      displayedNetPnl: netProfitDetail.detail.netPnl,
    });
  }, [canManage, netProfitDetail, profitShareSnapshots, trades]);

  const lastRelatedUser = recentRelatedUsers.find((user) => user.id === lastRelatedUserId)
    ?? recentRelatedUsers[0]
    ?? null;
  /**
   * 下单账户按关联用户单独记忆；没有关联用户时使用独立的“未关联”记忆。
   * 刷新页面后优先从该用户最近保存的流水恢复，因此不受点击哪个价格档位影响。
   */
  const getRememberedAccountForRelatedUser = (relatedUserId?: string) => {
    const memoryKey = relatedUserAccountMemoryKey(relatedUserId);
    const rememberedId = lastAccountIdByRelatedUser[memoryKey];
    const rememberedAccount = rememberedId ? accounts.find((account) => account.id === rememberedId) : undefined;
    if (rememberedAccount) return rememberedAccount;

    const savedTrade = trades
      .filter((trade) => trade.symbol === "ETH" && relatedUserAccountMemoryKey(trade.relatedUserId) === memoryKey)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return savedTrade ? accounts.find((account) => account.id === savedTrade.accountId) : undefined;
  };
  /** 专项款同样按关联用户独立记忆，避免不同用户的资金项目串用。 */
  const getRememberedFundForRelatedUser = (relatedUserId?: string) => {
    if (!relatedUserId) return undefined;
    const rememberedId = lastFundIdByRelatedUser[relatedUserId];
    const rememberedFund = rememberedId ? relatedFunds.find((fund) => fund.id === rememberedId && fund.relatedUserId === relatedUserId) : undefined;
    if (rememberedFund) return rememberedFund;
    return [...relatedFunds]
      .filter((fund) => fund.relatedUserId === relatedUserId)
      .sort((a, b) => String(b.lastUsedAt ?? "").localeCompare(String(a.lastUsedAt ?? "")))[0];
  };
  // 合约速记只使用服务端统一缓存的 ETH 永续标记价；Gate实时流断线时由 Gate → HTX REST 保温。
  const markPriceRaw = (t0MarkPriceRaw as any)?.price;
  const fetchedMarkPrice = Number(markPriceRaw) > 0 ? Number(markPriceRaw) : null;
  const markPrice = fetchedMarkPrice ?? lastMarkPrice;

  useEffect(() => {
    if (!fetchedMarkPrice) return;
    const previous = previousFetchedMarkPriceRef.current;
    if (previous !== null) {
      setPreviousMarkPrice(previous);
    }
    previousFetchedMarkPriceRef.current = fetchedMarkPrice;
    setLastMarkPrice(fetchedMarkPrice);
  }, [fetchedMarkPrice]);

  useEffect(() => {
    const timer = window.setInterval(() => setLiveClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const liveBeijingTime = useMemo(() => formatBeijingLiveTime(liveClock), [liveClock]);

  useEffect(() => {
    if (showEntrySheet) setShowSettledOpeningHistory(false);
  }, [showEntrySheet, entryForm.targetPrice, entrySide]);
  useEffect(() => {
    if (closeConfirmationStep === "input" || !showEntrySheet) {
      setSharedIncomeDrafts({});
      setSharedIncomeTargetSelections({});
    }
  }, [closeConfirmationStep, showEntrySheet]);

  useEffect(() => {
    const journal = t0JournalQuery.data as any;
    if (!journal) return;
    const nextAccounts: PreviewAccount[] = Array.isArray(journal.accounts)
      ? journal.accounts.map((account: any) => ({
        id: String(account.id),
        name: String(account.name || ""),
        lastUsedAt: account.lastUsedAt ?? null,
      }))
      : [];
    const nextRecentRelatedUsers: PreviewRelatedUser[] = Array.isArray(journal.recentUsers)
      ? journal.recentUsers.map((user: any) => ({
        id: String(user.id),
        name: String(user.name || user.username || `用户#${user.id}`),
        username: user.username ? String(user.username) : undefined,
        avatar: user.avatar ? String(user.avatar) : undefined,
        lastUsedAt: user.lastUsedAt ?? null,
      }))
      : [];
    const nextRelatedFunds: PreviewRelatedFund[] = Array.isArray(journal.relatedFunds)
      ? journal.relatedFunds.map((fund: any) => ({
        id: String(fund.id),
        relatedUserId: fund.relatedUserId === undefined || fund.relatedUserId === null ? undefined : String(fund.relatedUserId),
        name: String(fund.name || "未命名专项款"),
        lastUsedAt: fund.lastUsedAt ?? null,
      }))
      : [];
    const rawTrades: PreviewTrade[] = Array.isArray(journal.entries)
      ? journal.entries.map(previewTradeFromEntry)
      : [];
    const nextProfitShareSnapshots: ProfitShareSnapshot[] = Array.isArray(journal.profitShareSnapshots)
      ? journal.profitShareSnapshots.map((snapshot: any) => ({
        entryId: String(snapshot.entryId),
        openingEntryId: String(snapshot.openingEntryId),
        relatedFundId: Number(snapshot.relatedFundId || 0),
        relatedFundName: snapshot.relatedFundName ? String(snapshot.relatedFundName) : undefined,
        sourceUserId: Number(snapshot.sourceUserId),
        beneficiaryUserId: Number(snapshot.beneficiaryUserId),
        percentage: Number(snapshot.percentage || 0),
        matchedQuantity: Number(snapshot.matchedQuantity || 0),
        sourceUserName: snapshot.sourceUserName ? String(snapshot.sourceUserName) : undefined,
        beneficiaryUserName: snapshot.beneficiaryUserName ? String(snapshot.beneficiaryUserName) : undefined,
      }))
      : [];
    const nextTrades = journal.viewerMode === "member"
      ? projectMemberProfitShareTrades(
        rawTrades,
        nextProfitShareSnapshots,
        String(journal.viewerRelatedUserId || ""),
      )
      : projectAdminCounterpartyTrades(rawTrades);
    const nextRecoverableEntries: RecoverableTrade[] = Array.isArray(journal.recoverableEntries)
      ? journal.recoverableEntries.map((item: any) => ({
        auditId: String(item.auditId),
        operation: item.operation === "delete" ? "delete" : "revert",
        revertedAt: String(item.revertedAt),
        trade: previewTradeFromEntry(item.entry),
      }))
      : [];
    setAccounts(nextAccounts);
    setRecentRelatedUsers(nextRecentRelatedUsers);
    setRawJournalTrades(rawTrades);
    setRelatedFunds(nextRelatedFunds);
    setTrades(nextTrades);
    setProfitShareSnapshots(nextProfitShareSnapshots);
    setRecoverableEntries(nextRecoverableEntries);
    const latestTypedOpening = nextTrades
      .filter((entry) => ACTIONS[entry.action].opening && entry.instrumentType)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latestTypedOpening?.instrumentType) {
      setLastOpeningInstrumentType(latestTypedOpening.instrumentType);
    }
    const latestSavedEntry = nextTrades
      .filter((entry) => entry.symbol === "ETH")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setLastSavedQuantity(latestSavedEntry ? normalizeEthQuantity(String(latestSavedEntry.quantity)) : "");
    // 顶部五项筛选按“账本 + 当前身份”单独保存：强制刷新、关闭浏览器后再次进入均恢复；
    // 静默同步只剔除已失效的选项，不能覆盖仍有效的已选条件。
    const hasTopFilterScopeChanged = activeTopFilterStorageKeyRef.current !== topFilterStorageKey;
    const shouldRestoreTopFilters = !hasInitializedJournalFiltersRef.current || hasTopFilterScopeChanged;
    const persistedTopFilters = shouldRestoreTopFilters ? readPersistedT0TopFilters(topFilterStorageKey) : null;
    const restoredMemberRelatedUserFilterTouched = Boolean(persistedTopFilters?.memberRelatedUserFilterTouched);
    if (hasTopFilterScopeChanged) {
      activeTopFilterStorageKeyRef.current = topFilterStorageKey;
      setHydratedTopFilterStorageKey(null);
    }
    if (shouldRestoreTopFilters) setMemberRelatedUserFilterTouched(restoredMemberRelatedUserFilterTouched);
    if (journal.viewerMode === "admin") {
      setSelectedAccountIds((current) => {
        const preferred = shouldRestoreTopFilters ? (persistedTopFilters?.accountIds ?? []) : current;
        return preferred.filter((id) => nextAccounts.some((account) => account.id === id));
      });
      setRelatedUserFilterIds((current) => {
        const preferred = shouldRestoreTopFilters ? (persistedTopFilters?.relatedUserIds ?? []) : current;
        return preferred.filter((id) => {
          if (id === "unlinked" || nextRecentRelatedUsers.some((user) => user.id === id)) return true;
          const rootUserId = getT0ReferralDescendantsRootUserId(id);
          // 下线树异步返回前不能清掉 localStorage 中的选择；树到位后再剔除失效根用户。
          return Boolean(rootUserId && (!referralDataLoaded || referralDescendantsByRootUserId.has(rootUserId)));
        });
      });
      setRelatedFundFilterIds((current) => {
        const preferred = shouldRestoreTopFilters ? (persistedTopFilters?.relatedFundIds ?? []) : current;
        return preferred.filter((id) => id === "unclassified" || nextRelatedFunds.some((fund) => fund.id === id));
      });
    } else {
      // 成员端不展示、也不保留账户筛选；账户仅用于管理员识别订单落在哪个下单账户。
      // 用户与项目一个选项直接锁定；两个及以上选项才保留“全部 + 分项”的筛选。
      // 后续五秒静默同步只修正已失效的选项，不会覆盖成员主动选择的单项筛选。
      const memberFundFilterIds = [
        ...nextRelatedFunds.map((fund) => fund.id),
        ...(nextTrades.some((trade) => !trade.relatedFundId) ? ["unclassified"] : []),
      ];
      const normalizeMemberFilter = (current: string[], optionIds: string[]) => {
        if (optionIds.length === 1) return optionIds;
        return current.filter((id) => optionIds.includes(id));
      };
      setSelectedAccountIds((current) => current.length === 0 ? current : []);
      setRelatedUserFilterIds((current) => {
        const preferred = shouldRestoreTopFilters ? (persistedTopFilters?.relatedUserIds ?? []) : current;
        const hasExplicitMemberSelection = shouldRestoreTopFilters
          ? restoredMemberRelatedUserFilterTouched
          : memberRelatedUserFilterTouched;
        // 推荐树尚未返回时也立即展示本人，避免首屏短暂显示“全部”；
        // 已保存的推荐令牌则先原样保留，待树数据到位后统一校验。
        if (!referralDataLoaded) {
          return preferred.length === 0 && !hasExplicitMemberSelection && currentReferralRootUserId
            ? [currentReferralRootUserId]
            : preferred;
        }
        const selectableMemberUserIds = new Set([
          currentReferralRootUserId,
          ...(currentReferralDescendants ?? []),
        ]);
        const normalized = preferred.filter((id) => {
          const rootUserId = getT0ReferralDescendantsRootUserId(id);
          return rootUserId
            ? rootUserId === currentReferralRootUserId && selectableMemberUserIds.size > 1
            : selectableMemberUserIds.has(id);
        });
        // 首次打开（含旧版仅保存空数组的记录）始终落在本人；用户主动选择“全部”后，
        // memberRelatedUserFilterTouched 会把空数组按明确意图保留，刷新/重开也不重置。
        return normalized.length === 0 && !hasExplicitMemberSelection && currentReferralRootUserId
          ? [currentReferralRootUserId]
          : normalized;
      });
      setRelatedFundFilterIds((current) => normalizeMemberFilter(
        shouldRestoreTopFilters ? (persistedTopFilters?.relatedFundIds ?? []) : current,
        memberFundFilterIds,
      ));
    }
    setInstrumentTypeFilterIds((current) => shouldRestoreTopFilters
      ? (persistedTopFilters?.instrumentTypeIds ?? [])
      : normalizeT0InstrumentTypeFilterIds(current));
    setExecutionFilter((current) => shouldRestoreTopFilters ? (persistedTopFilters?.executionFilter ?? "all") : current);
    setHideLocked((current) => shouldRestoreTopFilters ? Boolean(persistedTopFilters?.hideLocked) : current);
    setLastRelatedUserId((current) => nextRecentRelatedUsers.some((user) => user.id === current)
      ? current
      : (nextRecentRelatedUsers[0]?.id || ""));
    hasInitializedJournalFiltersRef.current = true;
    setHydratedTopFilterStorageKey(topFilterStorageKey);
  }, [memberRelatedUserFilterTouched, referralDataLoaded, referralDescendantsByRootUserId, relatedUserFilterIds, t0JournalQuery.data, topFilterStorageKey]);

  useEffect(() => {
    if (!topFilterStorageKey || hydratedTopFilterStorageKey !== topFilterStorageKey) return;
    persistT0TopFilters(topFilterStorageKey, {
      accountIds: selectedAccountIds,
      relatedUserIds: relatedUserFilterIds,
      memberRelatedUserFilterTouched,
      relatedFundIds: relatedFundFilterIds,
      instrumentTypeIds: instrumentTypeFilterIds,
      executionFilter,
      hideLocked,
    });
  }, [executionFilter, hideLocked, hydratedTopFilterStorageKey, instrumentTypeFilterIds, memberRelatedUserFilterTouched, relatedFundFilterIds, relatedUserFilterIds, selectedAccountIds, topFilterStorageKey]);

  const priceTrend = previousMarkPrice === null || markPrice === null
    ? "flat"
    : markPrice > previousMarkPrice
      ? "up"
      : markPrice < previousMarkPrice
        ? "down"
        : "flat";
  const priceTrendClass = priceTrend === "up"
    ? "text-rose-600"
    : priceTrend === "down"
      ? "text-emerald-600"
      : "text-rose-600";

  const executionScopedTrades = useMemo(
    () => executionFilter === "all"
      ? trades
      : trades.filter((trade) => matchesT0ExecutionFilter(trade, executionFilter)),
    [trades, executionFilter],
  );
  const lockVisibilityScopedTrades = useMemo(
    () => hideLocked
      ? executionScopedTrades.filter((trade) => !trade.isLocked)
      : executionScopedTrades,
    [executionScopedTrades, hideLocked],
  );
  const instrumentScopedTrades = useMemo(
    () => filterTradesByInstrumentTypes(lockVisibilityScopedTrades, instrumentTypeFilterIds),
    [lockVisibilityScopedTrades, instrumentTypeFilterIds],
  );
  const topRelatedUserFilter = useMemo(
    () => resolveT0RelatedUserFilter(
      relatedUserFilterIds,
      referralDescendantsByRootUserId,
      referralDataLoaded,
    ),
    [referralDataLoaded, referralDescendantsByRootUserId, relatedUserFilterIds],
  );
  // 管理员筛选某位用户时，除该用户原始下单外，还必须看到该用户作为分佣受益人的
  // 完整开平仓链路。快照只在成交时落库，因此同时收集开仓主单与对应平仓流水键。
  const topProfitShareBeneficiaryEntryIds = useMemo(() => {
    const entryIds = new Set<string>();
    if (isMemberView || relatedUserFilterIds.length === 0 || topRelatedUserFilter.waitingForReferralData) return entryIds;
    for (const snapshot of profitShareSnapshots) {
      if (snapshot.percentage <= 0 || !topRelatedUserFilter.userIds.has(String(snapshot.beneficiaryUserId))) continue;
      entryIds.add(snapshot.openingEntryId);
      entryIds.add(snapshot.entryId);
    }
    return entryIds;
  }, [isMemberView, profitShareSnapshots, relatedUserFilterIds.length, topRelatedUserFilter]);
  const selectedTrades = useMemo(
    () => instrumentScopedTrades.filter((trade) => (
      // 成员端账户不属于筛选维度，必须忽略旧版 localStorage 中可能残留的账户条件。
      (isMemberView || selectedAccountIds.length === 0 || selectedAccountIds.includes(trade.accountId))
      && trade.symbol === "ETH"
      && (relatedUserFilterIds.length === 0
        || topRelatedUserFilter.waitingForReferralData
        || (topRelatedUserFilter.includesUnlinked && (!trade.relatedUserId || trade.relatedUserHidden))
        || Boolean(trade.relatedUserId && topRelatedUserFilter.userIds.has(trade.relatedUserId))
        || Boolean(trade.profitShareBeneficiaryUserId && topRelatedUserFilter.userIds.has(trade.profitShareBeneficiaryUserId))
        || (!isMemberView && topProfitShareBeneficiaryEntryIds.has(getStoredEntryId(trade))))
      && (relatedFundFilterIds.length === 0
        || relatedFundFilterIds.some((id) => id === "unclassified" ? (!trade.relatedFundId || trade.relatedFundHidden) : trade.relatedFundId === id))
    )),
    [instrumentScopedTrades, isMemberView, selectedAccountIds, relatedUserFilterIds, relatedFundFilterIds, topProfitShareBeneficiaryEntryIds, topRelatedUserFilter],
  );
  // 挂单仅作管理员报价与状态统计展示；成交前绝不进入真实仓位、FIFO、手续费、浮盈或收益汇总。
  const selectedFilledTrades = useMemo(
    () => selectedTrades.filter((trade) => !trade.isPending),
    [selectedTrades],
  );
  // 历史记录先严格继承管理员端的账户、用户、项目、类型与状态筛选；成员端不含账户维度，
  // 再按历史面板内的条件作进一步细分，避免顶部筛到某位用户时历史仍显示全部流水。
  // 管理员切为用户呈现时，历史区从原始流水重新生成与该用户本人相同的订单投影。
  const historyPerspectiveTrades = useMemo(
    () => isHistoryUserPerspective
      ? projectMemberProfitShareTrades(
        rawJournalTrades,
        profitShareSnapshots,
        String(historyPerspectiveTargetUserId),
      )
      : selectedTrades,
    [historyPerspectiveTargetUserId, isHistoryUserPerspective, profitShareSnapshots, rawJournalTrades, selectedTrades],
  );
  const historyExecutionScopedTrades = useMemo(
    () => historyExecutionFilter === "all"
      ? historyPerspectiveTrades
      : historyPerspectiveTrades.filter((trade) => matchesT0ExecutionFilter(trade, historyExecutionFilter)),
    [historyPerspectiveTrades, historyExecutionFilter],
  );
  const historyLockVisibilityScopedTrades = useMemo(
    () => historyHideLocked
      ? historyExecutionScopedTrades.filter((trade) => !trade.isLocked)
      : historyExecutionScopedTrades,
    [historyExecutionScopedTrades, historyHideLocked],
  );
  const historyInstrumentScopedTrades = useMemo(
    () => filterTradesByInstrumentTypes(historyLockVisibilityScopedTrades, historyInstrumentTypeFilterIds),
    [historyLockVisibilityScopedTrades, historyInstrumentTypeFilterIds],
  );
  const historyRelatedUserFilter = useMemo(
    () => resolveT0RelatedUserFilter(
      historyRelatedUserFilterIds,
      referralDescendantsByRootUserId,
      referralDataLoaded,
    ),
    [historyRelatedUserFilterIds, referralDataLoaded, referralDescendantsByRootUserId],
  );
  const historyProfitShareBeneficiaryEntryIds = useMemo(() => {
    const entryIds = new Set<string>();
    if (isMemberView || historyRelatedUserFilterIds.length === 0 || historyRelatedUserFilter.waitingForReferralData) return entryIds;
    for (const snapshot of profitShareSnapshots) {
      if (snapshot.percentage <= 0 || !historyRelatedUserFilter.userIds.has(String(snapshot.beneficiaryUserId))) continue;
      entryIds.add(snapshot.openingEntryId);
      entryIds.add(snapshot.entryId);
    }
    return entryIds;
  }, [historyRelatedUserFilter, historyRelatedUserFilterIds.length, isMemberView, profitShareSnapshots]);
  const journalScopeTrades = useMemo(
    () => historyInstrumentScopedTrades.filter((trade) => (
      trade.symbol === "ETH"
      && (historyIsMemberPresentation || historyAccountFilterIds.length === 0 || historyAccountFilterIds.includes(trade.accountId))
      // 用户呈现已在源数据层严格按本人/分层快照过滤，不能再套用管理员的用户、推荐或账户筛选。
      && (isHistoryUserPerspective
        || historyRelatedUserFilterIds.length === 0
        || historyRelatedUserFilter.waitingForReferralData
        || (historyRelatedUserFilter.includesUnlinked && (!trade.relatedUserId || trade.relatedUserHidden))
        || Boolean(trade.relatedUserId && historyRelatedUserFilter.userIds.has(trade.relatedUserId))
        || Boolean(trade.profitShareBeneficiaryUserId && historyRelatedUserFilter.userIds.has(trade.profitShareBeneficiaryUserId))
        || (!isMemberView && historyProfitShareBeneficiaryEntryIds.has(getStoredEntryId(trade))))
      && (historyRelatedFundFilterIds.length === 0
        || historyRelatedFundFilterIds.some((id) => id === "unclassified" ? (!trade.relatedFundId || trade.relatedFundHidden) : trade.relatedFundId === id))
    )),
    [historyInstrumentScopedTrades, historyIsMemberPresentation, isHistoryUserPerspective, isMemberView, historyAccountFilterIds, historyProfitShareBeneficiaryEntryIds, historyRelatedUserFilter, historyRelatedUserFilterIds, historyRelatedFundFilterIds],
  );
  const availableJournalActions = useMemo(
    () => RECENT_JOURNAL_ACTIONS.filter((action) => journalScopeTrades.some((trade) => trade.action === action)),
    [journalScopeTrades],
  );
  const availableJournalActionKey = availableJournalActions.join("|");
  const recentJournalTrades = useMemo(
    () => showLinkedJournalGroups
      ? journalScopeTrades
      : journalScopeTrades.filter((trade) => journalActionFilters.has(trade.action)),
    [journalScopeTrades, journalActionFilters, showLinkedJournalGroups],
  );
  const linkedJournalGroups = useMemo(
    () => buildLinkedJournalGroups(journalScopeTrades),
    [journalScopeTrades],
  );
  const hasLinkedJournalPairs = useMemo(
    () => linkedJournalGroups.some((group) => Boolean(group.opening) && group.closings.length > 0),
    [linkedJournalGroups],
  );
  useEffect(() => {
    setJournalActionFilters((current) => {
      const availableSet = new Set(availableJournalActions);
      const validCurrent = new Set(Array.from(current).filter((action) => availableSet.has(action)));
      if (validCurrent.size === 0 && availableJournalActions.length > 0) {
        return new Set(availableJournalActions);
      }
      if (validCurrent.size === current.size) return current;
      return validCurrent;
    });
  }, [availableJournalActionKey]);
  useEffect(() => {
    if (!hasLinkedJournalPairs && showLinkedJournalGroups) {
      setShowLinkedJournalGroups(false);
    }
  }, [hasLinkedJournalPairs, showLinkedJournalGroups]);
  const recentJournalTradeDetails = useMemo(() => buildRecentJournalTradeDetails(trades), [trades]);
  const historyPerspectiveTradeDetails = useMemo(
    () => buildRecentJournalTradeDetails(historyPerspectiveTrades),
    [historyPerspectiveTrades],
  );
  // 顶部类型筛选会将平仓投影为“对应开仓类型的数量切片”。先在当前历史范围内重建一次
  // 明细，可保证合约/现货/期权的开平仓在任意组合筛选下都用同一条切片收益展示；
  // 原始流水映射保留为历史异常记录的兜底。
  const scopedRecentJournalTradeDetails = useMemo(
    () => buildRecentJournalTradeDetails(journalScopeTrades),
    [journalScopeTrades],
  );
  const getHistoricalTradeDetail = (trade: PreviewTrade) => (
    scopedRecentJournalTradeDetails.get(trade.id)
    ?? scopedRecentJournalTradeDetails.get(getDetailEntryId(trade))
    ?? (isHistoryUserPerspective
      ? historyPerspectiveTradeDetails.get(getDetailEntryId(trade))
      : recentJournalTradeDetails.get(getDetailEntryId(trade)))
  );
  const getTradeAccountName = (trade: PreviewTrade) => trade.accountHidden
    ? "未关联账户"
    : trade.accountName
    || accounts.find((account) => account.id === trade.accountId)?.name
    || "未命名账户";
  const getTradeRelatedUserName = (trade: PreviewTrade) => trade.relatedUserHidden
    ? "未关联用户"
    : trade.relatedUserName
    || trade.relatedUsername
    || (trade.relatedUserId ? `用户#${trade.relatedUserId}` : "未关联用户");
  const getTradeRelatedFundName = (trade: PreviewTrade) => trade.relatedFundHidden
    ? "未关联项目"
    : trade.relatedFundName
      || (trade.relatedFundId ? `专项款#${trade.relatedFundId}` : "未区分专项款（历史） ");
  const memberViewerRelatedUserId = Number((t0JournalQuery.data as any)?.viewerRelatedUserId || 0);
  const viewerProfitShareBeneficiaryUserId = Number(
    (t0JournalQuery.data as any)?.viewerProfitShareBeneficiaryUserId
      || memberViewerRelatedUserId
      || 0,
  );
  /**
   * 成员呈现始终展示该用户本单可得；管理员“全部”视图展示完整订单的总净利润。
   * 管理员仅在明确筛选单一用户时，才显示该用户的实际可得；不能把订单关联用户
   * 或当前登录管理员自动误当作受益人。点击总净利润可展开全部分佣明细。
  */
  const resolveMemberPayout = (
    trade: PreviewTrade,
    displayedNetPnlInput: number | undefined,
    viewerUserId: number,
    viewerTrades: PreviewTrade[],
  ) => {
    const displayedNetPnl = Number(displayedNetPnlInput);
    if (!Number.isFinite(displayedNetPnl) || !Number.isInteger(viewerUserId) || viewerUserId <= 0) return null;
    // 分层受益人的流水已在成员投影时完成数量、手续费与净收益的折算。
    if (trade.profitShareBeneficiaryUserId) return { netPnl: displayedNetPnl, isProfitShared: true };
    const allocations = buildClosingProfitShareDistribution({
      trades: viewerTrades,
      snapshots: profitShareSnapshots,
      closing: trade,
      displayedNetPnl,
    });
    if (allocations.length === 0) return null;
    const allocation = allocations.find((item) => item.beneficiaryUserId === viewerUserId);
    return { netPnl: allocation?.netPnl ?? 0, isProfitShared: true };
  };
  const resolveDisplayedPayout = (trade: PreviewTrade, displayedNetPnlInput: number | undefined) => {
    const displayedNetPnl = Number(displayedNetPnlInput);
    const selectedAdminBeneficiaryUserId = !isMemberView
      && relatedUserFilterIds.length === 1
      && /^\d+$/.test(relatedUserFilterIds[0])
      ? Number(relatedUserFilterIds[0])
      : 0;
    if (isMemberView) {
      return resolveMemberPayout(trade, displayedNetPnl, viewerProfitShareBeneficiaryUserId, trades);
    }
    if (!Number.isFinite(displayedNetPnl) || selectedAdminBeneficiaryUserId <= 0) return null;
    const allocations = buildClosingProfitShareDistribution({
      trades,
      snapshots: profitShareSnapshots,
      closing: trade,
      displayedNetPnl,
    });
    if (allocations.length === 0) return null;
    const allocation = allocations.find((item) => item.beneficiaryUserId === selectedAdminBeneficiaryUserId);
    return { netPnl: allocation?.netPnl ?? 0, isProfitShared: true };
  };
  const resolveViewerPayout = (trade: PreviewTrade, detail?: RecentJournalTradeDetail) => {
    return resolveDisplayedPayout(trade, detail?.netPnl);
  };
  const resolveHistoryViewerPayout = (trade: PreviewTrade, detail?: RecentJournalTradeDetail) => {
    if (isHistoryUserPerspective) {
      return resolveMemberPayout(
        trade,
        detail?.netPnl,
        historyPerspectiveTargetUserId,
        historyPerspectiveTrades,
      );
    }
    return resolveViewerPayout(trade, detail);
  };
  const visibleSharedIncomeTransfers = useMemo(() => {
    if (isMemberView) return sharedIncomeTransfers;
    const userPerspectiveId = isHistoryUserPerspective ? historyPerspectiveTargetUserId : 0;
    if (userPerspectiveId > 0) return sharedIncomeTransfers.filter((item) => item.recipientUserId === userPerspectiveId);
    if (historyRelatedUserFilterIds.length === 1 && /^\d+$/.test(historyRelatedUserFilterIds[0])) {
      return sharedIncomeTransfers.filter((item) => item.recipientUserId === Number(historyRelatedUserFilterIds[0]));
    }
    return sharedIncomeTransfers;
  }, [historyPerspectiveTargetUserId, historyRelatedUserFilterIds, isHistoryUserPerspective, isMemberView, sharedIncomeTransfers]);
  // “盈利”严格使用列表当前展示的净收益：成员端及管理员的用户呈现均按该用户实际可得收益；
  // 管理员完整视角则按订单总净收益。开仓没有已实现收益，不纳入此筛选。
  const profitableRecentJournalTrades = useMemo(() => recentJournalTrades.filter((trade) => {
    if (ACTIONS[trade.action].opening) return false;
    const detail = getHistoricalTradeDetail(trade);
    const displayedNetPnl = resolveHistoryViewerPayout(trade, detail)?.netPnl ?? detail?.netPnl;
    const normalizedNetPnl = Number(displayedNetPnl);
    return Number.isFinite(normalizedNetPnl) && normalizedNetPnl > 0;
  }), [recentJournalTrades, getHistoricalTradeDetail, resolveHistoryViewerPayout]);
  const visibleRecentJournalTrades = showOnlyProfitableHistory
    ? profitableRecentJournalTrades
    : recentJournalTrades;
  const recentJournalTotalPages = Math.max(1, Math.ceil(
    (showLinkedJournalGroups ? linkedJournalGroups.length : visibleRecentJournalTrades.length) / RECENT_JOURNAL_PAGE_SIZE,
  ));
  const pagedRecentJournalTrades = useMemo(() => {
    const newestFirst = [...visibleRecentJournalTrades]
      .sort((a, b) => getTradeActivityTime(b).localeCompare(getTradeActivityTime(a)) || b.id.localeCompare(a.id));
    const start = (recentJournalPage - 1) * RECENT_JOURNAL_PAGE_SIZE;
    return newestFirst.slice(start, start + RECENT_JOURNAL_PAGE_SIZE);
  }, [visibleRecentJournalTrades, recentJournalPage]);
  const pagedLinkedJournalGroups = useMemo(() => {
    const start = (recentJournalPage - 1) * RECENT_JOURNAL_PAGE_SIZE;
    return linkedJournalGroups.slice(start, start + RECENT_JOURNAL_PAGE_SIZE);
  }, [linkedJournalGroups, recentJournalPage]);
  useEffect(() => {
    setRecentJournalPage((current) => Math.min(current, recentJournalTotalPages));
  }, [recentJournalTotalPages]);
  /**
   * 共享收益平仓预览：候选人只来自当前仍有未平仓位的其他关联用户；
   * 管理员可用额度只取这张待平仓订单按开仓快照分给管理员的正收益部分。
   */
  const sharedIncomeClosePreview = useMemo(() => {
    const closeQuantity = Number(normalizeEthQuantity(entryForm.quantity));
    const closePrice = Number(entryForm.price);
    const sourceUserId = Number(entryForm.relatedUserId);
    // 共享收益的候选仓位、已平盈亏与 XIRR 只认可现货和合约；期权、网格一律不计入。
    const isEligibleSharedIncomeInstrument = (instrumentType: T0InstrumentType | undefined) => instrumentType === "spot" || instrumentType === "contract";
    if (!canManage || closeConfirmationStep !== "review" || ACTIONS[entryForm.action].opening
      || !isEligibleSharedIncomeInstrument(entryForm.instrumentType)
      || !Number.isFinite(closeQuantity) || closeQuantity <= 0 || !Number.isFinite(closePrice) || closePrice <= 0
      || !Number.isInteger(sourceUserId) || sourceUserId <= 0) {
      return { sourceNetPnl: 0, managerPoolAmount: 0, candidates: [] as Array<{ userId: string; name: string; username?: string; remainingQuantity: number; longQuantity: number; shortQuantity: number; cumulativeDepositAmount: number; hasPrincipal: boolean; holdingNetPnl: number; closedNetPnl: number; receivedSharedIncome: number; realizedCashFlows: T0XirrCashFlow[]; realizedTerminalValue: number; heldDays: number; settlementAgeDays: number | null; annualizedReference: number | null }> };
    }
    const syntheticClosing: PreviewTrade = {
      id: "shared-income-close-preview",
      accountId: entryForm.accountId,
      relatedUserId: String(sourceUserId),
      relatedFundId: entryForm.relatedFundId && entryForm.relatedFundId !== "legacy" ? entryForm.relatedFundId : undefined,
      symbol: "ETH",
      action: entryForm.action,
      quantity: closeQuantity,
      price: closePrice,
      fee: closeQuantity * closePrice * OKX_VIP2_TAKER_FEE_RATE,
      createdAt: new Date().toISOString(),
      targetPrice: entryForm.targetPrice,
    };
    const allTrades = [...trades.filter((trade) => !trade.isSyncing), syntheticClosing];
    const allocations = buildOpeningClosingAllocations(allTrades);
    const managerUserId = Number((me as any)?.id || 0);
    let sourceNetPnl = 0;
    let managerPoolAmount = 0;
    for (const opening of allTrades) {
      if (!ACTIONS[opening.action].opening || !isEligibleSharedIncomeInstrument(opening.instrumentType)) continue;
      const matched = (allocations.get(opening.id) || []).filter((allocation) => allocation.trade.id === syntheticClosing.id);
      if (matched.length === 0) continue;
      const snapshots = getOpeningProfitShareSnapshotAllocations(profitShareSnapshots, getStoredEntryId(opening));
      const managerPercentage = snapshots
        .filter((snapshot) => snapshot.beneficiaryUserId === managerUserId)
        .reduce((total, snapshot) => total + Number(snapshot.percentage || 0), 0);
      for (const allocation of matched) {
        const netPnl = Number(buildLinkedClosingDetail(opening, allocation).netPnl || 0);
        sourceNetPnl += netPnl;
        managerPoolAmount += Math.max(0, netPnl) * Math.max(0, managerPercentage) / 100;
      }
    }
    const candidateByUser = new Map<string, { userId: string; name: string; username?: string; remainingQuantity: number; longQuantity: number; shortQuantity: number; firstOpenedAt: string; basis: number; unrealizedPnl: number }>();
    const closedNetPnlByUser = new Map<string, number>();
    const lastSettlementDateByUser = new Map<string, string>();
    const recordSettlementDate = (relatedUserId: string | number, settledOn: string) => {
      if (!relatedUserId || getT0CalendarDateUtc(settledOn) === null) return;
      const userId = String(relatedUserId);
      const previousSettlementDate = lastSettlementDateByUser.get(userId);
      if (!previousSettlementDate || settledOn.localeCompare(previousSettlementDate) > 0) {
        lastSettlementDateByUser.set(userId, settledOn);
      }
    };
    const historicalClosingAllocations = buildOpeningClosingAllocations(trades);
    // 平仓流水历史上没有可靠的 instrumentType；必须从其 FIFO 配对的开仓单继承类型，不能直接按平仓行过滤。
    for (const opening of trades) {
      if (!ACTIONS[opening.action].opening || !isEligibleSharedIncomeInstrument(opening.instrumentType) || !opening.relatedUserId || opening.isPending) continue;
      for (const allocation of historicalClosingAllocations.get(opening.id) || []) {
        if (allocation.trade.isPending) continue;
        const netPnl = Number(buildLinkedClosingDetail(opening, allocation).netPnl || 0);
        const settledOn = getBeijingDateInputValue(new Date(getTradeActivityTime(allocation.trade)));
        // 自己订单只要已平仓即属于结算，不以盈亏为条件。
        recordSettlementDate(opening.relatedUserId, settledOn);
        // 候选人“已平总盈利”只累计正向已结算收益；亏损平仓不写入这项参考收益。
        if (Number.isFinite(netPnl) && netPnl > 0.000001) {
          closedNetPnlByUser.set(opening.relatedUserId, (closedNetPnlByUser.get(opening.relatedUserId) || 0) + netPnl);
          // 分佣结算：正向平仓按开仓时固化的分佣比例给每位受益人计一次结算。
          for (const distribution of getOpeningProfitShareSnapshotAllocations(profitShareSnapshots, getStoredEntryId(opening))) {
            if (netPnl * Number(distribution.percentage || 0) > 0.000001) {
              recordSettlementDate(distribution.beneficiaryUserId, settledOn);
            }
          }
        }
      }
    }
    // 共享收益到账同样属于一次结算；只为实际受益人重置计时。
    for (const transfer of sharedIncomeTransfers) {
      if (!Number.isFinite(Number(transfer.amount)) || Number(transfer.amount) <= 0) continue;
      recordSettlementDate(transfer.recipientUserId, getBeijingDateInputValue(new Date(transfer.createdAt)));
    }
    for (const opening of trades) {
      if (!ACTIONS[opening.action].opening || !isEligibleSharedIncomeInstrument(opening.instrumentType) || opening.isPending || !opening.relatedUserId || opening.relatedUserId === String(sourceUserId) || opening.relatedUserId === String(managerUserId)) continue;
      const closingQuantity = (buildOpeningClosingAllocations(trades).get(opening.id) || []).reduce((total, allocation) => total + allocation.quantity, 0);
      const remainingQuantity = Math.max(0, opening.quantity - closingQuantity);
      if (remainingQuantity <= 0.000001) continue;
      const current = candidateByUser.get(opening.relatedUserId) || {
        userId: opening.relatedUserId,
        name: opening.relatedUserName || opening.relatedUsername || `用户#${opening.relatedUserId}`,
        username: opening.relatedUsername,
        remainingQuantity: 0,
        longQuantity: 0,
        shortQuantity: 0,
        firstOpenedAt: opening.createdAt,
        basis: 0,
        unrealizedPnl: 0,
      };
      const markPrice = lastMarkPrice ?? opening.price;
      const gross = ACTIONS[opening.action].side === "long"
        ? (markPrice - opening.price) * remainingQuantity
        : (opening.price - markPrice) * remainingQuantity;
      const estimatedFee = opening.price * remainingQuantity * OKX_VIP2_TAKER_FEE_RATE * 2;
      current.remainingQuantity += remainingQuantity;
      if (ACTIONS[opening.action].side === "long") current.longQuantity += remainingQuantity;
      else current.shortQuantity += remainingQuantity;
      current.basis += opening.price * remainingQuantity;
      current.unrealizedPnl += gross - estimatedFee;
      if (opening.createdAt < current.firstOpenedAt) current.firstOpenedAt = opening.createdAt;
      candidateByUser.set(opening.relatedUserId, current);
    }
    const now = Date.now();
    const candidates = Array.from(candidateByUser.values()).map((candidate) => {
      const heldDays = Math.max(1, Math.floor((now - new Date(candidate.firstOpenedAt).getTime()) / 86_400_000) + 1);
      const lastSettlementDate = lastSettlementDateByUser.get(candidate.userId);
      const settlementTimestamp = lastSettlementDate
        ? getT0CalendarDateUtc(lastSettlementDate)
        : null;
      const currentSettlementTimestamp = getT0CalendarDateUtc(getBeijingDateInputValue(new Date(now)));
      // 按北京时间自然日计数：今天结算为 0 天，次日无结算为 1 天未结算。
      const settlementAgeDays = settlementTimestamp !== null && currentSettlementTimestamp !== null
        ? Math.max(0, Math.floor((currentSettlementTimestamp - settlementTimestamp) / 86_400_000))
        : null;
      const cumulativeDepositAmount = payoutDepositAmountByRelatedUser.get(candidate.userId) || 0;
      const userCashFlows = payoutCashFlowsByRelatedUser.get(candidate.userId) || [];
      const cumulativeWithdrawalAmount = userCashFlows
        .filter((cashFlow) => cashFlow.direction === "withdrawal")
        .reduce((total, cashFlow) => total + cashFlow.amount, 0);
      const receivedSharedIncome = sharedIncomeTransfers
        .filter((transfer) => transfer.recipientUserId === Number(candidate.userId))
        .reduce((total, transfer) => total + transfer.amount, 0);
      // 已结算年化口径：只计实际投入/提现、已平订单收益及既得共享收益；当前持仓浮盈亏仅展示参考，不计入年化。
      const closedNetPnl = closedNetPnlByUser.get(candidate.userId) || 0;
      const currentNetValue = cumulativeDepositAmount + closedNetPnl + receivedSharedIncome - cumulativeWithdrawalAmount;
      const realizedCashFlows: T0XirrCashFlow[] = [
        ...userCashFlows.map((cashFlow) => ({
          occurredOn: cashFlow.occurredOn,
          amount: cashFlow.direction === "deposit" ? -cashFlow.amount : cashFlow.amount,
        })),
      ];
      const annualizedReference = calculateT0Xirr([
        ...realizedCashFlows,
        { occurredOn: getBeijingDateInputValue(), amount: currentNetValue, atEndOfBeijingDay: true },
      ]);
      return {
        ...candidate,
        cumulativeDepositAmount,
        hasPrincipal: cumulativeDepositAmount > 0,
        holdingNetPnl: candidate.unrealizedPnl,
        closedNetPnl,
        receivedSharedIncome,
        realizedCashFlows,
        realizedTerminalValue: currentNetValue,
        heldDays,
        settlementAgeDays,
        annualizedReference,
      };
    }).sort((left, right) => Number(right.hasPrincipal) - Number(left.hasPrincipal) || (left.annualizedReference ?? Number.POSITIVE_INFINITY) - (right.annualizedReference ?? Number.POSITIVE_INFINITY) || right.heldDays - left.heldDays);
    return {
      sourceNetPnl,
      managerPoolAmount: Math.floor((managerPoolAmount + 1e-9) * 100) / 100,
      candidates,
    };
  }, [canManage, closeConfirmationStep, entryForm.action, entryForm.accountId, entryForm.instrumentType, entryForm.price, entryForm.quantity, entryForm.relatedFundId, entryForm.relatedUserId, entryForm.targetPrice, lastMarkPrice, me, payoutCashFlowsByRelatedUser, payoutDepositAmountByRelatedUser, profitShareSnapshots, recentJournalTradeDetails, sharedIncomeTransfers, trades]);
  const sharedIncomeAllocatedTotal = useMemo(() => Object.values(sharedIncomeDrafts).reduce((total, amount) => total + (Number(amount) || 0), 0), [sharedIncomeDrafts]);
  const sharedIncomeSaveAllocations = useMemo(() => Object.entries(sharedIncomeDrafts)
    .map(([recipientUserId, amount]) => ({ recipientUserId: Number(recipientUserId), amount: (Number(amount) || 0).toFixed(2) }))
    .filter((allocation) => Number.isInteger(allocation.recipientUserId) && allocation.recipientUserId > 0 && Number(allocation.amount) > 0), [sharedIncomeDrafts]);

  const netProfitDetailUsesMemberPresentation = Boolean(
    netProfitDetail && (isMemberView || netProfitDetail.presentation === "member"),
  );
  const memberProfitShareDetail = netProfitDetail && netProfitDetailUsesMemberPresentation
    ? resolveMemberPayout(
      netProfitDetail.trade,
      netProfitDetail.detail.netPnl,
      netProfitDetail.presentation === "member"
        ? Number(netProfitDetail.viewerUserId || 0)
        : viewerProfitShareBeneficiaryUserId,
      netProfitDetail.presentation === "member" ? historyPerspectiveTrades : trades,
    )
    : null;
  const memberRelatedUserName = useMemo(() => {
    if (isUserPreview) return selectedPreviewMember?.name || `用户#${previewUserId}`;
    const selfName = String((me as any)?.name || (me as any)?.username || "").trim();
    if (selfName) return selfName;
    const ownTrade = trades.find((trade) => Boolean(trade.relatedUserId));
    return ownTrade ? getTradeRelatedUserName(ownTrade) : "本人";
  }, [isUserPreview, me, previewUserId, selectedPreviewMember, trades]);
  const payoutLogs = useMemo<T0JournalPayoutLog[]>(() => {
    const rows = t0PayoutLogsQuery.data;
    return Array.isArray(rows) ? rows.map((row: any) => ({
      id: String(row.id),
      relatedUserId: Number(row.relatedUserId || 0),
      relatedUserName: String(row.relatedUserName || "当前用户"),
      occurredOn: String(row.occurredOn || "").slice(0, 10),
      direction: String(row.direction) === "deposit" ? "deposit" : "withdrawal",
      amount: Number(row.amount || 0),
      note: String(row.note || "").trim() || undefined,
      createdAt: String(row.createdAt || ""),
    })) : [];
  }, [t0PayoutLogsQuery.data]);
  const availableRelatedFunds = useMemo(
    () => relatedUserFilterIds.length === 0 || topRelatedUserFilter.waitingForReferralData
      ? relatedFunds
      : relatedFunds.filter((fund) => Boolean(fund.relatedUserId) && topRelatedUserFilter.userIds.has(fund.relatedUserId!)),
    [relatedFunds, relatedUserFilterIds.length, topRelatedUserFilter],
  );
  const memberFundFilterOptionIds = useMemo(() => [
    ...relatedFunds.map((fund) => fund.id),
    ...(trades.some((trade) => !trade.relatedFundId) ? ["unclassified"] : []),
  ], [relatedFunds, trades]);
  const shouldLockMemberFundFilter = isMemberView && memberFundFilterOptionIds.length === 1;
  const lockedRelatedFundName = availableRelatedFunds.find((fund) => relatedFundFilterIds.includes(fund.id))?.name
    || availableRelatedFunds[0]?.name
    || (trades.some((trade) => !trade.relatedFundId) ? "未区分项目（历史）" : "暂无项目");
  const accountFilterOptions = accounts.map((account) => ({ id: account.id, label: account.name }));
  const hasUnlinkedTrades = trades.some((trade) => !trade.relatedUserId || trade.relatedUserHidden);
  const selectedReferralFilterIds = new Set([
    ...relatedUserFilterIds,
    ...historyRelatedUserFilterIds,
  ]);
  const currentReferralRootUser = recentRelatedUsers.find((user) => user.id === currentReferralRootUserId);
  const currentReferralDescendants = currentReferralRootUserId
    ? referralDescendantsByRootUserId.get(currentReferralRootUserId)
    : undefined;
  const currentReferralToken = currentReferralRootUserId
    ? createT0ReferralDescendantsToken(currentReferralRootUserId)
    : "";
  const shouldKeepCurrentReferralLoadingOption = Boolean(
    currentReferralToken
    && selectedReferralFilterIds.has(currentReferralToken)
    && !referralDataLoaded,
  );
  const toRelatedUserFilterOption = (
    user: PreviewRelatedUser,
    kind?: T0MultiSelectOption["kind"],
  ): T0MultiSelectOption => ({
    // 下拉内保留昵称和用户名便于辨认；顶部筛选框选中后只展示昵称，节省移动端空间。
    id: user.id,
    label: `${user.name}${user.username ? ` · @${user.username}` : ""}`,
    summaryLabel: user.name,
    kind,
  });
  const relatedUserFilterOptions: T0MultiSelectOption[] = isMemberView
    ? []
    : [
      // 管理员只在本人下方显示一条递归“推荐”，不再为每位关联用户重复展示其推荐分支。
      ...(currentReferralRootUser ? [toRelatedUserFilterOption(currentReferralRootUser)] : []),
      ...(currentReferralDescendants || shouldKeepCurrentReferralLoadingOption ? [{
        id: currentReferralToken,
        // 数字只统计当前 T+0 中实际有订单、可被筛选命中的递归推荐用户。
        label: `推荐（${currentReferralDescendants ? currentReferralDescendants.length : "读取中"}）`,
        summaryLabel: `推荐${currentReferralDescendants ? `（${currentReferralDescendants.length}）` : ""}`,
        kind: "referral-descendants" as const,
      }] : []),
      ...recentRelatedUsers
        .filter((user) => user.id !== currentReferralRootUserId)
        .map((user) => toRelatedUserFilterOption(user)),
      ...(hasUnlinkedTrades ? [{ id: "unlinked", label: "未关联用户（历史）" }] : []),
    ];
  const payoutTargetUserIdentity = useMemo(() => {
    if (payoutTargetRelatedUserId <= 0) return { name: "当前用户", username: "" };
    if (isMemberView) {
      return {
        name: memberRelatedUserName || "本人",
        username: String((me as any)?.username || "").trim(),
      };
    }
    const targetId = String(payoutTargetRelatedUserId);
    const relatedUser = recentRelatedUsers.find((user) => user.id === targetId);
    const relatedTrade = trades.find((trade) => trade.relatedUserId === targetId);
    const payoutUserName = payoutLogs[0]?.relatedUserName || "";
    return {
      name: relatedUser?.name || relatedTrade?.relatedUserName || relatedTrade?.relatedUsername || payoutUserName || "当前用户",
      username: relatedUser?.username || relatedTrade?.relatedUsername || "",
    };
  }, [isMemberView, me, memberRelatedUserName, payoutLogs, payoutTargetRelatedUserId, recentRelatedUsers, trades]);

  const relatedFundFilterOptions = [
    ...(trades.some((trade) => !trade.relatedFundId) ? [{ id: "unclassified", label: "未区分项目（历史）" }] : []),
    ...availableRelatedFunds.map((fund) => ({ id: fund.id, label: fund.name })),
  ];
  const historyAvailableRelatedFunds = useMemo(
    () => historyRelatedUserFilterIds.length === 0 || historyRelatedUserFilter.waitingForReferralData
      ? relatedFunds
      : relatedFunds.filter((fund) => Boolean(fund.relatedUserId) && historyRelatedUserFilter.userIds.has(fund.relatedUserId!)),
    [historyRelatedUserFilter, historyRelatedUserFilterIds.length, relatedFunds],
  );
  const historyRelatedFundFilterOptions = [
    ...(trades.some((trade) => !trade.relatedFundId) ? [{ id: "unclassified", label: "未区分项目（历史）" }] : []),
    ...historyAvailableRelatedFunds.map((fund) => ({ id: fund.id, label: fund.name })),
  ];
  const topSelectableRelatedUserIds = isMemberView ? [] : recentRelatedUsers.map((user) => user.id);
  const topRelatedUserSelectionIsAll = isT0RelatedUserSelectionEquivalentToAll(
    relatedUserFilterIds,
    topRelatedUserFilter,
    topSelectableRelatedUserIds,
    isMemberView ? false : hasUnlinkedTrades,
  );
  const historyRelatedUserSelectionIsAll = isT0RelatedUserSelectionEquivalentToAll(
    historyRelatedUserFilterIds,
    historyRelatedUserFilter,
    recentRelatedUsers.map((user) => user.id),
    hasUnlinkedTrades,
  );
  const historyFilterGridTemplateColumns = useMemo(() => {
    const summaryFor = (label: string, options: T0MultiSelectOption[], selectedIds: string[]) => {
    if (label === "用户" && historyRelatedUserSelectionIsAll) return "用户全部";
    const selected = options.filter((option) => selectedIds.includes(option.id));
    if (selected.length === 0) return `${label}全部`;
    if (selected.length === 1) return `${label}${selected[0].summaryLabel ?? selected[0].label}`;
    return `${label}已选 ${selected.length} 项`;
    };
    const filters = [
      { summary: summaryFor("用户", relatedUserFilterOptions, historyRelatedUserFilterIds), selectedCount: historyRelatedUserFilterIds.length },
      { summary: summaryFor("项目", historyRelatedFundFilterOptions, historyRelatedFundFilterIds), selectedCount: historyRelatedFundFilterIds.length },
    ];
    if (!isMemberView) {
      filters.unshift({ summary: summaryFor("账户", accountFilterOptions, historyAccountFilterIds), selectedCount: historyAccountFilterIds.length });
    }
    return buildT0FilterGridTemplateColumns(filters);
  }, [accountFilterOptions, isMemberView, relatedUserFilterOptions, historyRelatedFundFilterOptions, historyAccountFilterIds, historyRelatedUserFilterIds, historyRelatedFundFilterIds, historyRelatedUserSelectionIsAll]);
  const hasActiveHistoryDetailFilters = (!isMemberView && historyAccountFilterIds.length > 0)
    || historyRelatedUserFilterIds.length > 0
    || historyRelatedFundFilterIds.length > 0
    || historyInstrumentTypeFilterIds.length > 0
    || historyExecutionFilter !== "all"
    || historyHideLocked;
  const historyInstrumentFilterSummary = getT0InstrumentFilterSummary(historyInstrumentTypeFilterIds);
  const historyExecutionFilterSummary = getT0ExecutionFilterSummary(historyExecutionFilter, historyHideLocked);
  const historyTypeStatusGridTemplateColumns = useMemo(
    () => buildT0FilterGridTemplateColumns([
      // 两项都按当前文字共同分配空间；不能因另一项仍为“全部”而把已选类型压成极窄固定宽度。
      { summary: historyInstrumentFilterSummary, selectedCount: 1 },
      { summary: historyExecutionFilterSummary, selectedCount: 1 },
    ]),
    [historyInstrumentFilterSummary, historyExecutionFilterSummary],
  );
  useEffect(() => {
    setHistoryAccountFilterIds((current) => current.filter((id) => accounts.some((account) => account.id === id)));
    setHistoryRelatedUserFilterIds((current) => current.filter((id) => {
      if (id === "unlinked" || recentRelatedUsers.some((user) => user.id === id)) return true;
      const rootUserId = getT0ReferralDescendantsRootUserId(id);
      return Boolean(rootUserId && (!referralDataLoaded || referralDescendantsByRootUserId.has(rootUserId)));
    }));
    setHistoryRelatedFundFilterIds((current) => current.filter((id) => id === "unclassified" || relatedFunds.some((fund) => fund.id === id)));
  }, [accounts, recentRelatedUsers, referralDataLoaded, referralDescendantsByRootUserId, relatedFunds]);
  // 成员端没有独立的历史用户筛选面板；历史记录沿用服务端的严格本人/显式分层可见范围。
  useEffect(() => {
    if (!isMemberView) return;
    setHistoryAccountFilterIds((current) => current.length === 0 ? current : []);
    setHistoryRelatedUserFilterIds((current) => current.join("|") === relatedUserFilterIds.join("|")
      ? current
      : relatedUserFilterIds);
    setHistoryRelatedFundFilterIds([]);
  }, [isMemberView, relatedUserFilterIds]);
  const topFilterGridTemplateColumns = useMemo(() => {
    const summaryFor = (label: string, options: T0MultiSelectOption[], selectedIds: string[]) => {
      if (label === "用户" && topRelatedUserSelectionIsAll) return "用户全部";
      const selected = options.filter((option) => selectedIds.includes(option.id));
      if (selected.length === 0) return `${label}全部`;
      if (selected.length === 1) return `${label}${selected[0].summaryLabel ?? selected[0].label}`;
      return `${label}已选 ${selected.length} 项`;
    };
    // 管理员保留账户、用户、项目三项；成员端仅展示用户与项目，均按内容智能分配宽度。
    const accountSummary = summaryFor("账户", accountFilterOptions, selectedAccountIds);
    const userSummary = isMemberView
      ? `用户${memberRelatedUserName}`
      : summaryFor("用户", relatedUserFilterOptions, relatedUserFilterIds);
    const fundSummary = shouldLockMemberFundFilter
      ? `项目${lockedRelatedFundName}`
      : summaryFor("项目", relatedFundFilterOptions, relatedFundFilterIds);
    const accountSpec = {
      summary: accountSummary,
      selectedCount: selectedAccountIds.length,
    };
    const userSpec = {
      summary: userSummary,
      // 成员端用户固定为本人，不作为可操作筛选：用户 / 项目初始保持等宽。
      selectedCount: isMemberView
        ? 0
        : (topRelatedUserSelectionIsAll ? 0 : relatedUserFilterIds.length),
    };
    const fundSpec = {
      summary: fundSummary,
      // 只有一个项目时显示为固定默认值，但不应挤占成员端两栏的初始等宽布局。
      selectedCount: isMemberView && shouldLockMemberFundFilter ? 0 : relatedFundFilterIds.length,
    };
    return buildT0FilterGridTemplateColumns(isMemberView
      ? [userSpec, fundSpec]
      : [accountSpec, userSpec, fundSpec]);
  }, [accountFilterOptions, isMemberView, lockedRelatedFundName, memberRelatedUserName, relatedFundFilterOptions, relatedUserFilterOptions, relatedFundFilterIds, relatedUserFilterIds, selectedAccountIds, shouldLockMemberFundFilter, topRelatedUserSelectionIsAll]);
  const topInstrumentFilterSummary = getT0InstrumentFilterSummary(instrumentTypeFilterIds);
  const topExecutionFilterSummary = getT0ExecutionFilterSummary(executionFilter, hideLocked);
  const topTypeStatusGridTemplateColumns = useMemo(
    () => buildT0FilterGridTemplateColumns([
      // 管理端与用户端均以当前两项文字作为整体智能分配，保证“期权 + 全部状态”等组合不挤压类型。
      { summary: topInstrumentFilterSummary, selectedCount: 1 },
      { summary: topExecutionFilterSummary, selectedCount: 1 },
    ]),
    [topExecutionFilterSummary, topInstrumentFilterSummary],
  );
  const allJournalActionsSelected = availableJournalActions.length > 0
    && availableJournalActions.every((action) => journalActionFilters.has(action));
  const selectJournalActionFilter = (action: TradeAction) => {
    setRecentJournalPage(1);
    // 历史动作标签采用单选语义，避免“盈利 / 全部 / 多个动作”同时高亮而难以辨认当前口径。
    setJournalActionFilters(new Set([action]));
  };
  const entryRelatedFunds = useMemo(
    () => relatedFunds.filter((fund) => fund.relatedUserId === entryForm.relatedUserId),
    [relatedFunds, entryForm.relatedUserId],
  );
  // 速记账本会定时同步历史关联用户；刚从全局搜索选中的用户尚未产生流水时，
  // 服务端列表不会立刻包含他。把当前表单选择单独补入下拉，避免移动端回跳成“暂不关联”。
  const entryRelatedUserOptions = useMemo<PreviewRelatedUser[]>(() => {
    if (!entryForm.relatedUserId || recentRelatedUsers.some((user) => user.id === entryForm.relatedUserId)) {
      return recentRelatedUsers;
    }
    return [{
      id: entryForm.relatedUserId,
      name: entryForm.relatedUserName || entryForm.relatedUsername || `用户#${entryForm.relatedUserId}`,
      username: entryForm.relatedUsername || undefined,
    }, ...recentRelatedUsers];
  }, [entryForm.relatedUserId, entryForm.relatedUserName, entryForm.relatedUsername, recentRelatedUsers]);
  const directoryManagerItems = useMemo<Array<{ id: string; name: string; secondary?: string }>>(() => {
    if (directoryManagerKind === "account") {
      return accounts.map((account) => ({ id: account.id, name: account.name }));
    }
    if (directoryManagerKind === "relatedFund") {
      return entryRelatedFunds.map((fund) => ({ id: fund.id, name: fund.name }));
    }
    if (directoryManagerKind === "relatedUser") {
      return recentRelatedUsers.map((user) => ({
        id: user.id,
        name: user.name,
        secondary: user.username ? `@${user.username}` : undefined,
      }));
    }
    return [];
  }, [accounts, directoryManagerKind, entryRelatedFunds, recentRelatedUsers]);
  const directoryManagerTitle = directoryManagerKind === "account"
    ? "管理账户名称"
    : directoryManagerKind === "relatedFund"
      ? "管理项目名称"
      : "管理已关联用户";
  const quantityQuickOptions = useMemo(
    () => Array.from(new Set([lastSavedQuantity, ...DEFAULT_QUANTITY_QUICK_OPTIONS].filter(Boolean).map(normalizeEthQuantity))),
    [lastSavedQuantity],
  );
  const quantityFormatError = useMemo(() => {
    const value = entryForm.quantity.trim();
    if (!value) return null;
    if (!ETH_QUANTITY_PATTERN.test(value)) return "整数最多4位，小数最多2位";
    if (Number(value) <= 0) return "数量必须大于 0";
    return null;
  }, [entryForm.quantity]);
  const isGridOpeningEntry = ACTIONS[entryForm.action].opening && entryForm.instrumentType === "grid";
  const gridReferencePrice = useMemo(() => {
    if (!isGridOpeningEntry) return null;
    const reference = entryForm.gridDirection === "long" ? entryForm.gridRangeMin : entryForm.gridRangeMax;
    const price = Number(reference);
    return Number.isFinite(price) && price > 0 ? price : null;
  }, [entryForm.gridDirection, entryForm.gridRangeMax, entryForm.gridRangeMin, isGridOpeningEntry]);
  const estimatedFeeUsdt = useMemo(() => {
    if (entryForm.instrumentType === "option") return 0;
    const quantity = Number(normalizeEthQuantity(entryForm.quantity));
    const price = gridReferencePrice ?? Number(entryForm.price);
    if (quantityFormatError || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) return null;
    return Number((quantity * price * OKX_VIP2_TAKER_FEE_RATE).toFixed(8));
  }, [entryForm.instrumentType, entryForm.quantity, entryForm.price, gridReferencePrice, quantityFormatError]);
  const openingArchivePrice = useMemo(() => {
    const price = gridReferencePrice ?? Number(entryForm.price);
    if (!ACTIONS[entryForm.action].opening || !Number.isFinite(price) || price <= 0) return null;
    return archivePriceForSide(ACTIONS[entryForm.action].side, price);
  }, [entryForm.action, entryForm.price, gridReferencePrice]);
  // 资金、盈亏、手续费和 FIFO 仍仅使用实际成交单；挂单在成交前绝不参与这些财务口径。
  const buckets = useMemo(() => buildPositionBuckets(selectedFilledTrades), [selectedFilledTrades]);
  // “总仓位”则忠实反映顶部状态筛选：状态为全部时同时展示挂单与已成交数量，
  // 切换至“已成交”或“已挂单”后只统计对应状态的数量。
  const totalPositionBuckets = useMemo(() => buildPositionBuckets(selectedTrades), [selectedTrades]);
  const ladderOpeningClosingAllocations = useMemo(
    () => buildOpeningClosingAllocations(selectedFilledTrades),
    [selectedFilledTrades],
  );
  const integratedDisplayBuckets = useMemo(
    () => buildIntegratedDisplayBuckets(selectedTrades, ladderOpeningClosingAllocations, integratedArchiveStep),
    [selectedTrades, ladderOpeningClosingAllocations, integratedArchiveStep],
  );
  // 逐笔详情恒定按真实十美元档展开；整合详情沿用进入时选定的宽档。
  const isIndividualQuoteDetail = entrySheetLadderDisplayModeRef.current === "individual";
  const entryArchiveStep = isIndividualQuoteDetail || (!ACTIONS[entryForm.action].opening && closingSourceTrade)
    ? POSITION_ARCHIVE_STEP
    : entrySheetArchiveStepRef.current;
  const summary = useMemo(() => calculateSummary(buckets, markPrice, selectedFilledTrades), [buckets, markPrice, selectedFilledTrades]);
  // 首屏、分方向累计与历史逐笔明细统一使用已扣开仓、平仓手续费的净收益口径。
  const totalNetProfitDetails = useMemo(() => {
    const detailsByEntryId = buildRecentJournalTradeDetails(selectedFilledTrades);
    const rawDetails = selectedFilledTrades
      .filter((trade) => trade.symbol === "ETH" && !ACTIONS[trade.action].opening)
      .map((trade) => {
        const detail = detailsByEntryId.get(trade.id);
        return detail?.netPnl === undefined ? null : {
          trade,
          quantity: trade.quantity,
          netPnl: detail.netPnl,
        };
      })
      .filter((detail): detail is { trade: PreviewTrade; quantity: number; netPnl: number } => detail !== null)
      .sort((left, right) => right.trade.createdAt.localeCompare(left.trade.createdAt) || right.trade.id.localeCompare(left.trade.id));
    return rawDetails.map((item) => {
      const payout = resolveDisplayedPayout(item.trade, item.netPnl);
      return payout ? { ...item, netPnl: payout.netPnl } : item;
    });
  }, [isMemberView, profitShareSnapshots, selectedFilledTrades, trades, viewerProfitShareBeneficiaryUserId]);
  const totalNetProfit = totalNetProfitDetails.reduce((total, detail) => total + detail.netPnl, 0);
  const totalProfitAttribution = useMemo(() => {
    const targetUserId = payoutTargetRelatedUserId;
    const hasIndividualScope = Number.isInteger(targetUserId) && targetUserId > 0;
    const ownTradingDetails = hasIndividualScope
      ? totalNetProfitDetails.filter((detail) => Number(detail.trade.relatedUserId || 0) === targetUserId)
      : totalNetProfitDetails;
    const commissionShareDetails = hasIndividualScope
      ? totalNetProfitDetails.filter((detail) => Number(detail.trade.relatedUserId || 0) !== targetUserId)
      : [];
    const ownTradingNetProfit = ownTradingDetails.reduce((total, detail) => total + detail.netPnl, 0);
    const commissionShareNetProfit = commissionShareDetails.reduce((total, detail) => total + detail.netPnl, 0);
    const contributionBase = Math.abs(ownTradingNetProfit) + Math.abs(commissionShareNetProfit);
    const ownTradingRatio = contributionBase > 0.000001 ? Math.abs(ownTradingNetProfit) / contributionBase : 0;
    return {
      hasIndividualScope,
      ownTradingNetProfit,
      commissionShareNetProfit,
      ownTradingCount: ownTradingDetails.length,
      commissionShareCount: commissionShareDetails.length,
      ownTradingRatio,
      commissionShareRatio: contributionBase > 0.000001 ? Math.abs(commissionShareNetProfit) / contributionBase : 0,
      // 总数始终直接复用页面顶部“总收益”的同一汇总值，展示与归因两处绝不因浮点累加顺序出现尾差。
      total: totalNetProfit,
      targetLabel: hasIndividualScope ? payoutTargetUserIdentity.name : "当前筛选范围",
    };
  }, [payoutTargetRelatedUserId, payoutTargetUserIdentity.name, totalNetProfit, totalNetProfitDetails]);
  // 资金账本只对账，不回写或扣减订单收益：投入、提现为两条独立方向；仅提现受当前正向总收益上限约束。
  const withdrawalLogs = payoutLogs.filter((log) => log.direction === "withdrawal");
  const depositLogs = payoutLogs.filter((log) => log.direction === "deposit");
  const cumulativePayoutAmount = withdrawalLogs.reduce((total, log) => total + (Number.isFinite(log.amount) ? log.amount : 0), 0);
  const cumulativeDepositAmount = depositLogs.reduce((total, log) => total + (Number.isFinite(log.amount) ? log.amount : 0), 0);
  const payoutProfitCap = Math.max(0, totalNetProfit);
  const payoutXirrSummary = useMemo(() => {
    const asOfDate = getBeijingDateInputValue();
    // 收益账本的“当前总收益”不因提现回写扣减，因此期末账面净值须减去已提现收益，避免在 XIRR 中重复计入。
    const currentNetValue = cumulativeDepositAmount + totalNetProfit - cumulativePayoutAmount;
    const cashFlows: T0XirrCashFlow[] = [
      ...depositLogs.map((log) => ({ occurredOn: log.occurredOn, amount: -log.amount })),
      ...withdrawalLogs.map((log) => ({ occurredOn: log.occurredOn, amount: log.amount })),
      { occurredOn: asOfDate, amount: currentNetValue, atEndOfBeijingDay: true },
    ];
    const investmentDates = depositLogs
      .map((log) => getT0CalendarDateUtc(log.occurredOn))
      .filter((timestamp): timestamp is number => timestamp !== null);
    const firstInvestmentTimestamp = investmentDates.length > 0 ? Math.min(...investmentDates) : null;
    const asOfTimestamp = getT0CalendarDateUtc(asOfDate);
    const daysHeld = firstInvestmentTimestamp !== null && asOfTimestamp !== null
      ? Math.max(1, Math.floor((asOfTimestamp - firstInvestmentTimestamp) / (24 * 60 * 60 * 1000)) + 1)
      : 0;
    return {
      asOfDate,
      currentNetValue,
      daysHeld,
      rate: calculateT0Xirr(cashFlows),
    };
  }, [cumulativeDepositAmount, cumulativePayoutAmount, depositLogs, totalNetProfit, withdrawalLogs]);
  const remainingPayoutAmount = Math.max(0, payoutProfitCap - cumulativePayoutAmount);
  const payoutFormWithdrawalLimit = Math.max(
    0,
    payoutProfitCap - (cumulativePayoutAmount - (editingPayoutLog?.direction === "withdrawal" ? editingPayoutLog.amount : 0)),
  );
  const visiblePayoutLogs = payoutLogView === "all" ? payoutLogs : payoutLogs.filter((log) => log.direction === payoutLogView);
  const payoutLogSectionLabel = payoutLogView === "all" ? "资金流水" : payoutLogView === "deposit" ? "投入流水" : "提现流水";
  // 总览展开后的多/空累计收益必须与顶部“总收益”使用相同的当前用户实际可得口径。
  // 原 summary 的 realized 是订单原始净额；筛选某位用户时会混入其他受益人的分成。
  const overviewSummary = useMemo(() => {
    const realizedBySide = totalNetProfitDetails.reduce<Record<PositionSide, number>>((totals, detail) => {
      totals[ACTIONS[detail.trade.action].side] += detail.netPnl;
      return totals;
    }, { long: 0, short: 0 });
    return {
      ...summary,
      long: { ...summary.long, realized: realizedBySide.long },
      short: { ...summary.short, realized: realizedBySide.short },
      realized: realizedBySide.long + realizedBySide.short,
    };
  }, [summary, totalNetProfitDetails]);
  const totalRevenueDetailTotalPages = Math.max(1, Math.ceil(
    totalNetProfitDetails.length / TOTAL_REVENUE_DETAIL_PAGE_SIZE,
  ));
  const pagedTotalNetProfitDetails = useMemo(() => {
    const start = (totalRevenueDetailPage - 1) * TOTAL_REVENUE_DETAIL_PAGE_SIZE;
    return totalNetProfitDetails.slice(start, start + TOTAL_REVENUE_DETAIL_PAGE_SIZE);
  }, [totalNetProfitDetails, totalRevenueDetailPage]);
  useEffect(() => {
    setTotalRevenueDetailPage((current) => Math.min(current, totalRevenueDetailTotalPages));
  }, [totalRevenueDetailTotalPages]);
  const totalPositionQuantity = useMemo(() => {
    const longQuantity = totalPositionBuckets
      .filter((bucket) => bucket.side === "long" && bucket.remainingQuantity > 0.0000001)
      .reduce((total, bucket) => total + bucket.remainingQuantity, 0);
    const shortQuantity = totalPositionBuckets
      .filter((bucket) => bucket.side === "short" && bucket.remainingQuantity > 0.0000001)
      .reduce((total, bucket) => total + bucket.remainingQuantity, 0);
    return longQuantity - shortQuantity;
  }, [totalPositionBuckets]);
  const totalNetProfitClass = totalNetProfit > 0 ? "text-rose-600" : totalNetProfit < 0 ? "text-emerald-600" : "text-slate-700";
  const netPositionClass = "text-slate-800";
  const roundedNetPositionText = (() => {
    const rounded = Math.round(totalPositionQuantity);
    return `${rounded < 0 ? "−" : ""}${Math.abs(rounded).toLocaleString("en-US")}`;
  })();
  const totalNetProfitText = formatSigned(totalNetProfit);
  const netPositionBreakdown = useMemo(() => {
    const buildSide = (side: PositionSide) => {
      const levels = totalPositionBuckets
        .filter((bucket) => bucket.side === side && bucket.remainingQuantity > 0.0000001)
        .sort((a, b) => b.price - a.price);
      return {
        levels,
        quantity: levels.reduce((total, bucket) => total + bucket.remainingQuantity, 0),
      };
    };
    return { long: buildSide("long"), short: buildSide("short") };
  }, [totalPositionBuckets]);
  const netPositionDetailText = `${totalPositionQuantity < 0 ? "−" : ""}${formatQuantity(Math.abs(totalPositionQuantity))}`;
  // 从某个T型档位进入时，详情仅展示该方向、该归属档位的订单和汇总；
  // 从底部通用开平按钮进入时没有指定档位，才保留方向总览。
  const entryScopedTrades = useMemo(() => {
    const matchingSide = (trade: PreviewTrade) => ACTIONS[trade.action].side === entrySide;
    const targetPrice = entryForm.targetPrice;
    if (targetPrice === undefined) return selectedTrades.filter(matchingSide);

    if (entryArchiveStep === POSITION_ARCHIVE_STEP) {
      return selectedTrades.filter((trade) => matchingSide(trade)
        && priceKey(archivePriceForTrade(trade)) === priceKey(targetPrice));
    }

    // 宽档详情按每张开仓主单的实际成交价归类，并投影其真实 FIFO 平仓分配。
    // 这样 25/50/100U 的展示合并不会误把已经平掉的十美元档重新显示为未平仓。
    const openings = selectedTrades.filter((trade) => matchingSide(trade)
      && ACTIONS[trade.action].opening
      && !trade.isPending
      && priceKey(archivePriceForTrade(trade, entryArchiveStep)) === priceKey(targetPrice));
    const scopedClosings = openings.flatMap((opening) => (
      (ladderOpeningClosingAllocations.get(opening.id) ?? []).map(({ trade, quantity }) => ({
        ...trade,
        id: `display-${entryArchiveStep}-${trade.id}-${opening.id}`,
        quantity,
        fee: trade.quantity > 0 ? trade.fee * (quantity / trade.quantity) : 0,
      }))
    ));
    return [...openings, ...scopedClosings]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [selectedTrades, entrySide, entryForm.targetPrice, entryArchiveStep, ladderOpeningClosingAllocations]);
  const entryScopedBuckets = useMemo(() => {
    const source = entryArchiveStep === POSITION_ARCHIVE_STEP ? buckets : integratedDisplayBuckets;
    return source.filter((bucket) => bucket.side === entrySide && (
      entryForm.targetPrice === undefined || priceKey(bucket.price) === priceKey(entryForm.targetPrice)
    ));
  }, [buckets, integratedDisplayBuckets, entryArchiveStep, entrySide, entryForm.targetPrice]);
  const entryScopedFilledTrades = useMemo(
    () => entryScopedTrades.filter((trade) => !trade.isPending),
    [entryScopedTrades],
  );
  const entryScopedSummary = useMemo(
    () => calculateSummary(entryScopedBuckets, markPrice, entryScopedFilledTrades),
    [entryScopedBuckets, markPrice, entryScopedFilledTrades],
  );
  const entrySideSummary = entrySide === "long" ? entryScopedSummary.long : entryScopedSummary.short;
  const isOptionEntryContext = ACTIONS[entryForm.action].opening && entryForm.instrumentType === "option";
  // 档位详情已由用户刚点击的价格格定位，无需在标题重复显示档位，避免移动端换行。
  // 顶部始终明确为当前档位或当前方向范围的汇总，逐笔订单在下方直接展示。
  const entryScopeTitle = isOptionEntryContext ? "期权汇总" : isGridOpeningEntry ? "网格汇总" : `${entrySide === "long" ? "多仓" : "空仓"}汇总`;
  const openingClosingAllocations = useMemo(
    () => buildOpeningClosingAllocations(entryScopedTrades.filter((trade) => !trade.isPending)),
    [entryScopedTrades],
  );
  const openedTradeList = useMemo(
    () => entryScopedTrades
      .filter((trade) => ACTIONS[trade.action].opening)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entryScopedTrades],
  );
  const { activeOpenedTradeList, settledOpenedTradeList } = useMemo(() => {
    const active: PreviewTrade[] = [];
    const settled: PreviewTrade[] = [];
    for (const trade of openedTradeList) {
      const linkedClosings = openingClosingAllocations.get(trade.id) ?? [];
      const closedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
      if (trade.quantity - closedQuantity > 0.0000001) active.push(trade);
      else settled.push(trade);
    }
    return { activeOpenedTradeList: active, settledOpenedTradeList: settled };
  }, [openedTradeList, openingClosingAllocations]);
  const settledOpenedTradeSummary = useMemo(() => {
    const realizedNet = settledOpenedTradeList.reduce((total, openingTrade) => {
      const isLongPosition = ACTIONS[openingTrade.action].side === "long";
      const linkedClosings = openingClosingAllocations.get(openingTrade.id) ?? [];
      const openingNet = linkedClosings.reduce((openingTotal, { trade: closingTrade, quantity }) => {
        const financialQuantity = getTradeFinancialQuantity(closingTrade, quantity);
        const grossPnl = isLongPosition
          ? (closingTrade.price - openingTrade.price) * financialQuantity
          : (openingTrade.price - closingTrade.price) * financialQuantity;
        const allocatedOpeningFee = openingTrade.quantity > 0
          ? openingTrade.fee * (quantity / openingTrade.quantity)
          : 0;
        const allocatedClosingFee = closingTrade.quantity > 0
          ? closingTrade.fee * (quantity / closingTrade.quantity)
          : 0;
        return openingTotal + grossPnl - allocatedOpeningFee - allocatedClosingFee;
      }, 0);
      return total + openingNet;
    }, 0);
    return { count: settledOpenedTradeList.length, realizedNet };
  }, [settledOpenedTradeList, openingClosingAllocations]);
  const activeOpenedTradeRows = useMemo(
    () => activeOpenedTradeList.map((trade) => ({ kind: "active" as const, trade })),
    [activeOpenedTradeList],
  );
  const settledOpenedTradeRows = useMemo(
    () => showSettledOpeningHistory
      ? settledOpenedTradeList.map((trade) => ({ kind: "history" as const, trade }))
      : [],
    [settledOpenedTradeList, showSettledOpeningHistory],
  );
  const isEditingEntry = Boolean(entryForm.editingEntryId);
  /** 既有挂单在编辑时保留时钟按钮；取消选中后，点击保存才确认成交。 */
  const isEditingOriginalPendingOpening = Boolean(isEditingEntry && editingOriginalTrade?.isPending);
  const isEditingPendingOpening = Boolean(isEditingOriginalPendingOpening && entryForm.isPending);
  const isPendingFillConfirmationQueued = Boolean(isEditingOriginalPendingOpening && !entryForm.isPending);
  const isClosingEntry = !ACTIONS[entryForm.action].opening;
  // 编辑一张已部分平仓的主单时，锁定只标识尚未平掉的余额；已实现的平仓记录仍保持独立审计。
  const editingRemainingQuantity = useMemo(() => {
    if (!isEditingEntry || !editingOriginalTrade) return null;
    const linkedClosings = openingClosingAllocations.get(editingOriginalTrade.id) ?? [];
    const closedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
    return Math.max(0, editingOriginalTrade.quantity - closedQuantity);
  }, [editingOriginalTrade, isEditingEntry, openingClosingAllocations]);
  // 一旦发生关联平仓，原始开仓字段都要保留审计；仅有剩余仓位时才允许切换锁定状态。
  const hasDependentCloseOpeningEdit = Boolean(
    isEditingEntry
    && editingOriginalTrade
    && editingRemainingQuantity !== null
    && editingRemainingQuantity < editingOriginalTrade.quantity - 0.0000001,
  );
  const isPartiallyClosedOpeningEdit = Boolean(
    hasDependentCloseOpeningEdit
    && editingRemainingQuantity !== null
    && editingRemainingQuantity > 0.0000001,
  );
  const isFullyClosedOpeningEdit = Boolean(
    hasDependentCloseOpeningEdit
    && editingRemainingQuantity !== null
    && editingRemainingQuantity <= 0.0000001,
  );
  const hasPartialOpeningMarkerChange = Boolean(
    isPartiallyClosedOpeningEdit
    && editingOriginalTrade
    && entryForm.isLocked !== Boolean(editingOriginalTrade.isLocked),
  );
  const hasPartialTakeProfitChange = Boolean(
    isPartiallyClosedOpeningEdit
    && editingOriginalTrade
    && (
      entryForm.isTakeProfit !== Boolean(editingOriginalTrade.takeProfitEnabled)
      || (entryForm.isTakeProfit && (
        JSON.stringify(normalizeTakeProfitPlanDrafts(entryForm.takeProfitPlans))
          !== JSON.stringify(normalizeTakeProfitPlanDrafts(getTradeTakeProfitPlanDrafts(editingOriginalTrade)))
      ))
    ),
  );
  const isOptionOpeningEntry = isOptionEntryContext;
  const isTakeProfitAvailable = ACTIONS[entryForm.action].opening
    && (entryForm.instrumentType === "spot" || entryForm.instrumentType === "contract");
  // T+0 期权固定为 ETH 标的：复用融资付息订单已接入的 Deribit 缓存。
  // 到期日与行权价均从市场合约列表选择，避免手填出不存在的合约组合。
  const t0OptionExpiriesQuery = (trpc.ledger as any).deribitGetExpiries.useQuery(
    { currency: "ETH" as const },
    {
      enabled: canManage && showEntrySheet && isOptionOpeningEntry,
      staleTime: 5 * 60 * 1000,
    },
  );
  const t0OptionExpiries = ((t0OptionExpiriesQuery.data as any)?.expiries ?? []) as Array<{
    deribitLabel: string;
    ts: number;
    diffDays: number;
    dateStr?: string;
  }>;
  const t0SelectedOptionExpiry = t0OptionExpiries.find(
    (expiry) => new Date(expiry.ts).toISOString().slice(0, 10) === entryForm.optionExpiryDate,
  );
  const t0OptionDeribitLabel = t0SelectedOptionExpiry?.deribitLabel ?? "";
  const t0OptionStrikesQuery = (trpc.ledger as any).deribitGetStrikes.useQuery(
    { currency: "ETH" as const, deribitLabel: t0OptionDeribitLabel },
    {
      enabled: canManage && showEntrySheet && isOptionOpeningEntry && Boolean(t0OptionDeribitLabel),
      staleTime: 5 * 60 * 1000,
    },
  );
  const t0OptionStrikeRows = (((t0OptionStrikesQuery.data as any)?.strikes ?? []) as unknown[]);
  const t0OptionStrikes = t0OptionStrikeRows
    .map((strike) => Number(strike))
    .filter((strike: number) => Number.isFinite(strike) && strike > 0);
  // 期权不是只有数量和行权价：方向、Deribit 到期日、行权价、权利金及计价币任缺其一，都不能提交。
  // 与服务端 resolveOptionParameters 双重校验，避免移动端在字段未完整时误触保存。
  const optionFormValidationMessage = useMemo(() => {
    if (!isOptionOpeningEntry) return null;
    const quantity = Number(normalizeEthQuantity(entryForm.quantity));
    const strikePrice = Number(entryForm.price);
    const premium = Number(entryForm.optionPremium);
    if (quantityFormatError || !Number.isFinite(quantity) || quantity <= 0) return "请填写大于 0 的期权数量";
    if (!T0_OPTION_DIRECTIONS.some((option) => option.value === entryForm.optionDirection)) return "请选择期权方向";
    if (!entryForm.optionExpiryDate) return "请选择期权到期日";
    if (!entryForm.editingEntryId && !t0OptionDeribitLabel) return "请从 Deribit 可用到期日中选择期权到期日";
    if (!Number.isFinite(strikePrice) || strikePrice <= 0) return "请选择期权行权价";
    if (t0OptionDeribitLabel && t0OptionStrikesQuery.isLoading) return "行权价列表加载中，请稍候";
    if (t0OptionDeribitLabel && !t0OptionStrikes.some((strike) => Math.abs(strike - strikePrice) < 0.0000001)) return "请选择所选到期日对应的 Deribit 行权价";
    if (!entryForm.optionPremium.trim() || !Number.isFinite(premium) || premium <= 0) return "请输入大于 0 的权利金";
    if (!(["USDT", "ETH"] as T0OptionPremiumCurrency[]).includes(entryForm.optionPremiumCurrency)) return "请选择权利金计价币种";
    return null;
  }, [entryForm.editingEntryId, entryForm.optionDirection, entryForm.optionExpiryDate, entryForm.optionPremium, entryForm.optionPremiumCurrency, entryForm.price, entryForm.quantity, isOptionOpeningEntry, quantityFormatError, t0OptionDeribitLabel, t0OptionStrikes, t0OptionStrikesQuery.isLoading]);
  const gridFormValidationMessage = useMemo(() => {
    if (!isGridOpeningEntry) return null;
    const lower = Number(entryForm.gridRangeMin);
    const upper = Number(entryForm.gridRangeMax);
    const leverage = Number(entryForm.gridLeverage);
    const count = Number(entryForm.gridCount);
    if (!(entryForm.gridDirection === "long" || entryForm.gridDirection === "short")) return "请选择做多或做空网格";
    if (entryForm.gridDirection === "long") {
      if (!Number.isFinite(lower) || lower <= 0) return "请输入大于 0 的网格下限";
      if (!Number.isFinite(upper) || upper <= 0) return "请输入大于 0 的网格上限";
    } else {
      if (!Number.isFinite(upper) || upper <= 0) return "请输入大于 0 的网格上限";
      if (!Number.isFinite(lower) || lower <= 0) return "请输入大于 0 的网格下限";
    }
    if (upper <= lower) return "网格上限必须大于下限";
    if (!Number.isFinite(leverage) || leverage <= 0) return "请输入大于 0 的网格杠杆倍数";
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000) return "网格数量须为 1 至 10000 的整数";
    return null;
  }, [entryForm.gridCount, entryForm.gridDirection, entryForm.gridLeverage, entryForm.gridRangeMax, entryForm.gridRangeMin, isGridOpeningEntry]);
  const isCloseReview = isClosingEntry && closeConfirmationStep === "review";
  // 平仓必须继承所选开仓单的账户、用户与项目归属，首次输入和二次确认均不可改。
  // 开仓编辑受后端 FIFO 依赖校验保护；未发生后续平仓时，管理员必须能改到既有账户。
  const isAccountSelectionLocked = isClosingEntry || (isCloseReview && !isEditingEntry);
  const isCloseAssociationLocked = isClosingEntry || isCloseReview;
  // 逐笔报价的订单按分位精确排布，实时价也必须作为独立精确参考行插入；
  // 不能再先归入十美元档，否则例如 2546.03 会视觉上覆盖 2550.00 的真实订单行。
  const individualMarkLadderPrice = markPrice && Number.isFinite(markPrice) && markPrice > 0
    ? Number(markPrice.toFixed(2))
    : null;
  const integratedMarkLadderPrice = markPrice && Number.isFinite(markPrice) && markPrice > 0
    ? Math.round(markPrice / integratedArchiveStep) * integratedArchiveStep
    : null;
  // 平仓百分比快捷键以“本张开仓主单尚未平掉的数量”和当前价档可平数量两者较小者为基数。
  // 因此同价位存在多张订单或已有部分平仓时，快捷键也不会超过本次实际可平上限。
  const closingAvailableQuantity = useMemo(() => {
    if (!isClosingEntry || !closingSourceTrade) return 0;
    const side = ACTIONS[closingSourceTrade.action].side;
    const relatedUserKey = closingSourceTrade.relatedUserId ?? "";
    const relatedFundKey = closingSourceTrade.relatedFundId ?? "";
    const sourceClosingAllocations = ladderOpeningClosingAllocations.get(closingSourceTrade.id) ?? [];
    const sourceClosedQuantity = sourceClosingAllocations.reduce((total, allocation) => total + allocation.quantity, 0);
    const sourceRemainingQuantity = Math.max(0, closingSourceTrade.quantity - sourceClosedQuantity);
    const targetPrice = entryForm.targetPrice ?? archivePriceForTrade(closingSourceTrade);
    const scopeBuckets = buildPositionBuckets(selectedFilledTrades.filter((trade) => (
      trade.accountId === closingSourceTrade.accountId
      && (trade.relatedUserId ?? "") === relatedUserKey
      && (trade.relatedFundId ?? "") === relatedFundKey
    )));
    const targetBucket = scopeBuckets.find((bucket) => bucket.side === side && priceKey(bucket.price) === priceKey(targetPrice));
    return Math.max(0, Math.min(sourceRemainingQuantity, targetBucket?.remainingQuantity ?? 0));
  }, [closingSourceTrade, entryForm.targetPrice, isClosingEntry, ladderOpeningClosingAllocations, selectedFilledTrades]);
  // 整合报价按价位汇总；逐笔报价则按开仓主单逐笔显示，
  // 两种展示都只使用当前身份本来可见的流水，不改变成员只读权限。
  const ladderIntegratedDisplayBuckets = integratedDisplayBuckets;
  const priceRows = useMemo<LadderPriceRow[]>(() => {
    const activePositionPrices = ladderIntegratedDisplayBuckets
      .filter((bucket) => bucket.remainingQuantity > 0.0000001)
      .map((bucket) => bucket.price);
    return buildAdaptiveLadderLevels(integratedMarkLadderPrice, activePositionPrices, integratedArchiveStep).map((price) => ({
      key: `integrated-${priceKey(price)}`,
      price,
      long: ladderIntegratedDisplayBuckets.find((bucket) => bucket.side === "long" && priceKey(bucket.price) === priceKey(price)),
      short: ladderIntegratedDisplayBuckets.find((bucket) => bucket.side === "short" && priceKey(bucket.price) === priceKey(price)),
      isMark: integratedMarkLadderPrice === price,
    }));
  }, [ladderIntegratedDisplayBuckets, integratedMarkLadderPrice, integratedArchiveStep]);
  const individualPriceRows = useMemo<LadderPriceRow[]>(() => {
    const individualBuckets: Array<{ trade: PreviewTrade; bucket: PositionBucket }> = [];
    for (const trade of selectedTrades) {
      if (!ACTIONS[trade.action].opening) continue;
      const linkedClosings = ladderOpeningClosingAllocations.get(trade.id) ?? [];
      const closedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
      const remainingQuantity = Math.max(0, trade.quantity - closedQuantity);
      if (remainingQuantity <= 0.0000001) continue;
      const side = ACTIONS[trade.action].side;
      const isPending = Boolean(trade.isPending);
      // 逐笔报价以成交价精确到 0.01 U 作为配对键：只有分位完全相同的左右订单才同一行。
      // 原始成交价仍用于成本、盈亏和 FIFO，十美元归档价仅服务于整合报价和可用量校验。
      const price = Number(trade.price.toFixed(2));
      const remainingRatio = trade.quantity > 0 ? remainingQuantity / trade.quantity : 0;
      individualBuckets.push({
        trade,
        bucket: {
          key: `entry:${trade.id}`,
          side,
          instrumentType: trade.instrumentType,
          price,
          originalQuantity: trade.quantity,
          remainingQuantity,
          costBasis: trade.price * remainingQuantity,
          financialQuantity: isPending ? 0 : getTradeFinancialQuantity(trade, remainingQuantity),
          financialCostBasis: isPending ? 0 : trade.price * getTradeFinancialQuantity(trade, remainingQuantity),
          openingFeeBasis: isPending ? 0 : trade.fee * remainingRatio,
          realizedGrossPnl: 0,
          realizedOpeningFee: 0,
          realizedClosingFee: 0,
          realizedPnl: 0,
          closedQuantity,
          closedCostBasis: trade.price * closedQuantity,
          closedNotional: 0,
          openedAt: trade.createdAt,
        },
      });
    }
    const rowsByPrice = new Map<string, Array<{ trade: PreviewTrade; bucket: PositionBucket }>>();
    for (const item of individualBuckets) {
      const key = priceKey(item.bucket.price);
      const rows = rowsByPrice.get(key) ?? [];
      rows.push(item);
      rowsByPrice.set(key, rows);
    }
    // 逐笔报价只展示每笔未平仓订单的实际成交价位；不沿用整合报价的实时价邻近空档。
    // 为确认当前市场位置，若实时价档尚无订单，只额外保留这一条可为空的参考价档。
    const individualLevels = new Set<number>(individualBuckets.map((item) => item.bucket.price));
    if (individualMarkLadderPrice !== null) individualLevels.add(individualMarkLadderPrice);
    return Array.from(individualLevels).sort((a, b) => b - a).flatMap((price) => {
      const rowsAtPrice = [...(rowsByPrice.get(priceKey(price)) ?? [])]
        .sort((a, b) => b.trade.createdAt.localeCompare(a.trade.createdAt) || b.trade.id.localeCompare(a.trade.id));
      if (rowsAtPrice.length === 0) {
        return [{
          key: `individual-empty-${priceKey(price)}`,
          price,
          isMark: individualMarkLadderPrice === price,
        }];
      }
      // 同一显示价格的左右订单应在同一行视觉配对；每一笔仍独立保留自己的 bucket、标记及操作入口。
      // 若同侧有多笔，按开仓时间逐笔向下延展，而不是合并数量或改写 FIFO。
      const longRows = rowsAtPrice.filter(({ bucket }) => bucket.side === "long");
      const shortRows = rowsAtPrice.filter(({ bucket }) => bucket.side === "short");
      const pairedRowCount = Math.max(longRows.length, shortRows.length);
      return Array.from({ length: pairedRowCount }, (_, index) => {
        const longRow = longRows[index];
        const shortRow = shortRows[index];
        return {
          key: `individual-pair-${priceKey(price)}-${longRow?.trade.id ?? "empty"}-${shortRow?.trade.id ?? "empty"}`,
          price,
          long: longRow?.bucket,
          short: shortRow?.bucket,
          // 同一报价档可能向下延展多行；实时价只强调第一对，避免连续高亮干扰阅读。
          isMark: individualMarkLadderPrice === price && index === 0,
          longOpeningTrade: longRow?.trade,
          shortOpeningTrade: shortRow?.trade,
        };
      });
    });
  }, [selectedTrades, ladderOpeningClosingAllocations, individualMarkLadderPrice]);
  const isIndividualLadderView = adminLadderDisplayMode === "individual";
  const displayedPriceRows = isIndividualLadderView ? individualPriceRows : priceRows;

  const openEntrySheet = (
    action: TradeAction = "openLong",
    targetPrice?: number,
    sourceLadderDisplayMode?: AdminLadderDisplayMode,
  ) => {
    // 从报价单元格直接进入时显式携带来源模式，避免 React 状态批处理期间误回退到整合报价。
    const sourceMode = sourceLadderDisplayMode ?? adminLadderDisplayMode;
    entrySheetLadderDisplayModeRef.current = sourceMode;
    entrySheetArchiveStepRef.current = sourceMode === "integrated"
      ? integratedArchiveStep
      : POSITION_ARCHIVE_STEP;
    // 现货/合约保留左多右空；期权虽可选四个组合，但空档入口仍必须继承所点左右侧。
    // 左侧默认买入看涨，右侧默认买入看跌，确保同价位另一侧的订单绝不被带入详情。
    const initialInstrumentType = ACTIONS[action].opening ? lastOpeningInstrumentType : undefined;
    const initialOptionDirection: T0OptionDirection = action === "openShort" ? "long_put" : "long_call";
    const initialGridDirection: T0GridDirection = action === "openShort" ? "short" : "long";
    const initialAction = initialInstrumentType === "option"
      ? getOptionOpeningAction(initialOptionDirection)
      : action;
    setEntrySide(ACTIONS[initialAction].side);
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
    setEditingOriginalTrade(null);
    const rememberedAccount = getRememberedAccountForRelatedUser(lastRelatedUser?.id);
    const defaultRelatedFund = getRememberedFundForRelatedUser(lastRelatedUser?.id);
    setEntryForm({
      action: initialAction,
      accountId: rememberedAccount?.id ?? "",
      accountName: rememberedAccount?.name ?? "",
      relatedUserId: lastRelatedUser?.id ?? "",
      relatedUserName: lastRelatedUser?.name ?? "",
      relatedUsername: lastRelatedUser?.username ?? "",
      relatedFundId: defaultRelatedFund?.id ?? "",
      relatedFundName: defaultRelatedFund?.name ?? "",
      instrumentType: initialInstrumentType,
      optionDirection: initialOptionDirection,
      optionExpiryDate: "",
      optionPremium: "",
      optionPremiumCurrency: "USDT",
      gridDirection: initialGridDirection,
      gridRangeMin: "",
      gridRangeMax: "",
      gridLeverage: "",
      gridCount: "",
      isLocked: false,
      isCounterparty: false,
      isPending: false,
      isTakeProfit: false,
      takeProfitPrice: "",
      takeProfitQuantity: "",
      takeProfitPlans: [],
      quantity: "",
      // 开仓成交价由管理员实际录入；保留浅色 0.00 占位，避免误把参考价写入流水。
      price: "",
      note: "",
      targetPrice,
    });
    setShowEntrySheet(true);
  };

  const openQuickCloseSheet = (trade: PreviewTrade) => {
    // 锁定是剩余仓位的操作保护：必须先通过“编辑”解除锁定，才允许创建新的平仓流水。
    // 服务端也会按 FIFO 实际匹配结果复核，避免已打开的表单绕过此处的前端提示。
    if (trade.isLocked) {
      toast.error("该笔剩余仓位已锁定，请先点击“编辑”解除锁定后再平仓");
      return;
    }
    // 在报价详情内切换至平仓表单时，沿用最初进入详情页的报价模式；
    // 从历史记录直接打开时才以当前管理员模式为来源。
    if (!showEntrySheet) entrySheetLadderDisplayModeRef.current = adminLadderDisplayMode;
    setRelatedUserQuickPickerOpen(false);
    setRelatedUserPickerOpen(false);
    setRelatedUserSearch("");
    const side = ACTIONS[trade.action].side;
    // 未关联用户的订单也可独立平仓；空关联值会稳定归到同一“未关联”仓位池，
    // 不会和任何已关联用户的订单互相抵扣。
    const relatedUserKey = trade.relatedUserId ?? "";
    const relatedFundKey = trade.relatedFundId ?? "";
    const tradeUserBuckets = buildPositionBuckets(selectedFilledTrades.filter((item) => (
      item.accountId === trade.accountId
      && (item.relatedUserId ?? "") === relatedUserKey
      && (item.relatedFundId ?? "") === relatedFundKey
    )));
    const target = tradeUserBuckets.find((bucket) => bucket.side === side && priceKey(bucket.price) === priceKey(archivePriceForTrade(trade)));
    if (!target || target.remainingQuantity <= 0.0000001) {
      toast.error("该笔仓位已无可平数量");
      return;
    }
    // 数量预填必须取这张主单本身尚未关联平仓的剩余量，不能误用同价位汇总仓量。
    const sourceClosingAllocations = buildOpeningClosingAllocations(selectedFilledTrades).get(trade.id) ?? [];
    const sourceClosedQuantity = sourceClosingAllocations.reduce((total, allocation) => total + allocation.quantity, 0);
    const sourceRemainingQuantity = Math.max(0, trade.quantity - sourceClosedQuantity);
    const closableQuantity = Math.min(target.remainingQuantity, sourceRemainingQuantity);
    if (closableQuantity <= 0.0000001) {
      toast.error("该笔订单已无可平数量");
      return;
    }
    const action: TradeAction = side === "long" ? "closeLong" : "closeShort";
    setEntrySide(side);
    setCloseConfirmationStep("input");
    setClosingSourceTrade(trade);
    setEditingOriginalTrade(null);
    setEntryForm({
      action,
      accountId: trade.accountId,
      accountName: getTradeAccountName(trade),
      relatedUserId: trade.relatedUserId ?? "",
      relatedUserName: trade.relatedUserName ?? trade.relatedUsername ?? "",
      relatedUsername: trade.relatedUsername ?? "",
      relatedFundId: trade.relatedFundId ?? "legacy",
      relatedFundName: trade.relatedFundName ?? "",
      instrumentType: trade.instrumentType,
      optionDirection: trade.optionDirection ?? "long_call",
      optionExpiryDate: trade.optionExpiryDate ?? "",
      optionPremium: trade.optionPremium === undefined ? "" : String(trade.optionPremium),
      optionPremiumCurrency: trade.optionPremiumCurrency ?? "USDT",
      gridDirection: trade.gridDirection ?? (side === "long" ? "long" : "short"),
      gridRangeMin: trade.gridRangeMin === undefined ? "" : String(trade.gridRangeMin),
      gridRangeMax: trade.gridRangeMax === undefined ? "" : String(trade.gridRangeMax),
      gridLeverage: trade.gridLeverage === undefined ? "" : String(trade.gridLeverage),
      gridCount: trade.gridCount === undefined ? "" : String(trade.gridCount),
      isLocked: false,
      isCounterparty: false,
      isPending: false,
      isTakeProfit: false,
      takeProfitPrice: "",
      takeProfitQuantity: "",
      // 表单值不能带千分位逗号，否则超过千位的数量会无法通过数值校验。
      quantity: normalizeEthQuantity(String(closableQuantity)),
      price: markPrice ? markPrice.toFixed(2) : "",
      note: "",
      targetPrice: target.price,
    });
    setShowEntrySheet(true);
  };

  const openEditOpeningTrade = (trade: PreviewTrade) => {
    if (!ACTIONS[trade.action].opening) {
      toast.error("当前仅支持编辑开仓记录");
      return;
    }
    // 同上：详情页中的“编辑”不得覆盖其原始逐笔/整合报价来源。
    if (!showEntrySheet) entrySheetLadderDisplayModeRef.current = adminLadderDisplayMode;
    // 反向订单在管理员端显示为相反方向，但编辑表单必须回到真实流水方向，
    // 否则保存后会错误改变下一笔开仓的默认方向。
    setEntrySide(ACTIONS[getStoredAction(trade)].side);
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
    setEditingOriginalTrade(trade);
    setEntryProfitShareEditTarget(null);
    // 已关联平仓的主单保留原始数量供 FIFO 与审计使用；编辑视图仅展示剩余余额。
    const linkedClosings = openingClosingAllocations.get(trade.id) ?? [];
    const closedQuantity = linkedClosings.reduce((total, allocation) => total + allocation.quantity, 0);
    const remainingQuantity = Math.max(0, trade.quantity - closedQuantity);
    const editableQuantity = closedQuantity > 0.0000001 && remainingQuantity > 0.0000001
      ? remainingQuantity
      : trade.quantity;
    setEntryForm({
      action: getStoredAction(trade),
      accountId: trade.accountId,
      accountName: accounts.find((account) => account.id === trade.accountId)?.name ?? "",
      relatedUserId: trade.relatedUserId ?? "",
      relatedUserName: trade.relatedUserName ?? trade.relatedUsername ?? "",
      relatedUsername: trade.relatedUsername ?? "",
      relatedFundId: trade.relatedFundId ?? "legacy",
      relatedFundName: trade.relatedFundName ?? "",
      instrumentType: trade.instrumentType,
      optionDirection: getStoredOptionDirection(trade) ?? "long_call",
      optionExpiryDate: trade.optionExpiryDate ?? "",
      optionPremium: trade.optionPremium === undefined ? "" : String(trade.optionPremium),
      optionPremiumCurrency: trade.optionPremiumCurrency ?? "USDT",
      gridDirection: getStoredGridDirection(trade) ?? (ACTIONS[getStoredAction(trade)].side === "long" ? "long" : "short"),
      gridRangeMin: trade.gridRangeMin === undefined ? "" : String(trade.gridRangeMin),
      gridRangeMax: trade.gridRangeMax === undefined ? "" : String(trade.gridRangeMax),
      gridLeverage: trade.gridLeverage === undefined ? "" : String(trade.gridLeverage),
      gridCount: trade.gridCount === undefined ? "" : String(trade.gridCount),
      isLocked: Boolean(trade.isLocked),
      isCounterparty: Boolean(trade.isCounterparty),
      isPending: Boolean(trade.isPending),
      isTakeProfit: Boolean(trade.takeProfitEnabled),
      takeProfitPrice: trade.takeProfitPrice === undefined ? "" : String(trade.takeProfitPrice),
      takeProfitQuantity: trade.takeProfitQuantity === undefined ? "" : normalizeEthQuantity(String(trade.takeProfitQuantity)),
      takeProfitPlans: getTradeTakeProfitPlanDrafts(trade),
      // 部分平仓时表单只展示剩余可操作量；服务端 lockOnly 分支只更新标记，不改写原始订单数量。
      quantity: normalizeEthQuantity(String(editableQuantity)),
      price: trade.price.toFixed(2),
      note: trade.note ?? "",
      editingEntryId: getStoredEntryId(trade),
    });
    setShowEntrySheet(true);
  };

  const selectAccountMutation = trpc.ledger.t0SelectAccount.useMutation({
    onSuccess: (data: any) => {
      const account: PreviewAccount = {
        id: String(data.account.id),
        name: String(data.account.name),
        lastUsedAt: data.account.lastUsedAt ?? null,
      };
      setAccounts((current) => [account, ...current.filter((item) => item.id !== account.id)]);
    },
    onError: (error) => toast.error(error.message || "下单账户选择未保存"),
  });

  const renameAccountMutation = trpc.ledger.t0RenameAccount.useMutation({
    onSuccess: (data: any) => {
      const account: PreviewAccount = {
        id: String(data.account.id),
        name: String(data.account.name),
        lastUsedAt: data.account.lastUsedAt ?? null,
      };
      setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, name: account.name } : item));
      setTrades((current) => current.map((trade) => trade.accountId === account.id ? { ...trade, accountName: account.name } : trade));
      setEntryForm((current) => current.accountId === account.id ? { ...current, accountName: account.name } : current);
      setDirectoryRenameTarget(null);
      setDirectoryDeleteTarget(null);
      void t0JournalQuery.refetch();
      toast.success("账户名称已更新，历史记录已同步显示新名称");
    },
    onError: (error) => toast.error(error.message || "账户名称修改失败"),
  });

  const renameRelatedFundMutation = trpc.ledger.t0RenameRelatedFund.useMutation({
    onSuccess: (data: any) => {
      const fund: PreviewRelatedFund = {
        id: String(data.relatedFund.id),
        relatedUserId: data.relatedFund.relatedUserId === undefined ? undefined : String(data.relatedFund.relatedUserId),
        name: String(data.relatedFund.name),
        lastUsedAt: data.relatedFund.lastUsedAt ?? null,
      };
      setRelatedFunds((current) => current.map((item) => item.id === fund.id ? { ...item, name: fund.name } : item));
      setTrades((current) => current.map((trade) => trade.relatedFundId === fund.id ? { ...trade, relatedFundName: fund.name } : trade));
      setEntryForm((current) => current.relatedFundId === fund.id ? { ...current, relatedFundName: fund.name } : current);
      setDirectoryRenameTarget(null);
      setDirectoryDeleteTarget(null);
      void t0JournalQuery.refetch();
      toast.success("项目名称已更新，历史记录已同步显示新名称");
    },
    onError: (error) => toast.error(error.message || "项目名称修改失败"),
  });

  const deleteDirectoryItemMutation = trpc.ledger.t0DeleteDirectoryItem.useMutation({
    onSuccess: (data: any, variables: any) => {
      const target = directoryDeleteTarget;
      if (variables.dimension === "account") {
        const deletedId = String(variables.dimensionId);
        setAccounts((current) => current.filter((item) => item.id !== deletedId));
        setEntryForm((current) => current.accountId === deletedId
          ? { ...current, accountId: "", accountName: "" }
          : current);
        setSelectedAccountIds((current) => current.filter((id) => id !== deletedId));
      } else if (variables.dimension === "related_fund") {
        const deletedId = String(variables.dimensionId);
        setRelatedFunds((current) => current.filter((item) => item.id !== deletedId));
        setEntryForm((current) => current.relatedFundId === deletedId
          ? { ...current, relatedFundId: "", relatedFundName: "" }
          : current);
        setRelatedFundFilterIds((current) => current.filter((id) => id !== deletedId));
      } else {
        const deletedId = String(variables.dimensionId);
        setRecentRelatedUsers((current) => current.filter((item) => item.id !== deletedId));
        setEntryForm((current) => current.relatedUserId === deletedId
          ? { ...current, relatedUserId: "", relatedUserName: "", relatedUsername: "", relatedFundId: "", relatedFundName: "" }
          : current);
        setRelatedUserFilterIds((current) => current.filter((id) => id !== deletedId));
      }
      setDirectoryDeleteTarget(null);
      void t0JournalQuery.refetch();
      toast.success(target?.kind === "relatedUser"
        ? `关联用户已从当前T+0账本移除；${Number(data?.impact?.affectedEntryCount || 0)} 条历史记录现显示为未关联`
        : `${target?.kind === "account" ? "账户" : "项目"}已删除；${Number(data?.impact?.affectedEntryCount || 0)} 条历史记录现显示为未关联`);
    },
    onError: (error) => toast.error(error.message || "目录删除失败"),
  });

  const setProfitShareRuleMutation = trpc.ledger.t0SetProfitShareRule.useMutation({
    onSuccess: (data: any) => {
      const savedFund = Array.isArray(data?.rules) ? data.rules[0] : null;
      if (savedFund?.relatedFundId && profitShareSource && !profitShareSource.id) {
        const id = String(savedFund.relatedFundId);
        const name = String(savedFund.relatedFundName || profitShareSource.name);
        const fund: PreviewRelatedFund = { id, name, relatedUserId: profitShareSource.relatedUserId };
        setRelatedFunds((current) => [fund, ...current.filter((item) => item.id !== id)]);
        setEntryForm((current) => current.relatedFundId
          ? current
          : { ...current, relatedFundId: id, relatedFundName: name });
      }
      setProfitShareSource(null);
      setProfitShareAllocations([]);
      setProfitShareRecipientSearch("");
      void t0JournalQuery.refetch();
      const syncedActiveOpeningCount = Number(data?.syncedActiveOpeningCount || 0);
      toast.success(syncedActiveOpeningCount > 0
        ? `收益分配已保存，已同步${syncedActiveOpeningCount}笔进行中订单与后续新订单`
        : "收益分配已保存；后续新订单将采用新清单，已平历史保持不变");
    },
    onError: (error) => toast.error(error.message || "收益分配保存失败"),
  });

  const updateOpeningProfitShareMutation = trpc.ledger.t0UpdateOpeningProfitShare.useMutation({
    onSuccess: () => {
      setProfitShareSource(null);
      setEntryProfitShareEditTarget(null);
      setProfitShareAllocations([]);
      setProfitShareRecipientSearch("");
      void t0JournalQuery.refetch();
      toast.success("本单剩余仓位与后续新订单的收益分配已保存；已平历史保持不变");
    },
    onError: (error) => toast.error(error.message || "本单收益分配保存失败"),
  });

  const saveEntryMutation = trpc.ledger.t0CreateEntry.useMutation({
    onSuccess: (data: any, variables: any) => {
      const account: PreviewAccount = {
        id: String(data.account.id),
        name: String(data.account.name),
        lastUsedAt: data.account.lastUsedAt ?? null,
      };
      const entry: PreviewTrade = {
        id: String(data.entry.id),
        accountId: String(data.entry.accountId),
        accountName: data.entry.accountName ? String(data.entry.accountName) : account.name,
        relatedUserId: data.entry.relatedUserId === undefined || data.entry.relatedUserId === null ? undefined : String(data.entry.relatedUserId),
        relatedUserName: data.entry.relatedUserName ? String(data.entry.relatedUserName) : undefined,
        relatedUsername: data.entry.relatedUsername ? String(data.entry.relatedUsername) : undefined,
        relatedUserAvatar: data.entry.relatedUserAvatar ? String(data.entry.relatedUserAvatar) : undefined,
        relatedFundId: data.entry.relatedFundId === undefined || data.entry.relatedFundId === null ? undefined : String(data.entry.relatedFundId),
        relatedFundName: data.entry.relatedFundName ? String(data.entry.relatedFundName) : undefined,
        symbol: String(data.entry.symbol || "ETH"),
        action: data.entry.action as TradeAction,
        instrumentType: data.entry.instrumentType === "spot" || data.entry.instrumentType === "contract" || data.entry.instrumentType === "option" || data.entry.instrumentType === "grid"
          ? data.entry.instrumentType
          : undefined,
        optionDirection: data.entry.optionDirection === "long_call" || data.entry.optionDirection === "long_put" || data.entry.optionDirection === "short_call" || data.entry.optionDirection === "short_put"
          ? data.entry.optionDirection
          : undefined,
        optionExpiryDate: data.entry.optionExpiryDate ? String(data.entry.optionExpiryDate) : undefined,
        optionPremium: data.entry.optionPremium === undefined || data.entry.optionPremium === null ? undefined : Number(data.entry.optionPremium),
        optionPremiumCurrency: data.entry.optionPremiumCurrency === "USDT" || data.entry.optionPremiumCurrency === "ETH"
          ? data.entry.optionPremiumCurrency
          : undefined,
        gridDirection: data.entry.gridDirection === "long" || data.entry.gridDirection === "short" ? data.entry.gridDirection : undefined,
        gridRangeMin: data.entry.gridRangeMin === undefined || data.entry.gridRangeMin === null ? undefined : Number(data.entry.gridRangeMin),
        gridRangeMax: data.entry.gridRangeMax === undefined || data.entry.gridRangeMax === null ? undefined : Number(data.entry.gridRangeMax),
        gridLeverage: data.entry.gridLeverage === undefined || data.entry.gridLeverage === null ? undefined : Number(data.entry.gridLeverage),
        gridCount: data.entry.gridCount === undefined || data.entry.gridCount === null ? undefined : Number(data.entry.gridCount),
        isLocked: Boolean(data.entry.isLocked),
        isCounterparty: Boolean(data.entry.isCounterparty),
        isPending: Boolean(data.entry.isPending),
        filledAt: data.entry.filledAt ? String(data.entry.filledAt) : undefined,
        filledPrice: data.entry.filledPrice === undefined || data.entry.filledPrice === null ? undefined : Number(data.entry.filledPrice),
        takeProfitEnabled: Boolean(data.entry.takeProfitEnabled),
        takeProfitPrice: data.entry.takeProfitPrice === undefined || data.entry.takeProfitPrice === null ? undefined : Number(data.entry.takeProfitPrice),
        takeProfitQuantity: data.entry.takeProfitQuantity === undefined || data.entry.takeProfitQuantity === null ? undefined : Number(data.entry.takeProfitQuantity),
        takeProfitTriggeredAt: data.entry.takeProfitTriggeredAt ? String(data.entry.takeProfitTriggeredAt) : undefined,
        takeProfitTriggeredPrice: data.entry.takeProfitTriggeredPrice === undefined || data.entry.takeProfitTriggeredPrice === null ? undefined : Number(data.entry.takeProfitTriggeredPrice),
        takeProfitTriggeredQuantity: data.entry.takeProfitTriggeredQuantity === undefined || data.entry.takeProfitTriggeredQuantity === null ? undefined : Number(data.entry.takeProfitTriggeredQuantity),
        takeProfitPlans: Array.isArray(data.entry.takeProfitPlans) ? data.entry.takeProfitPlans.map((plan: any) => ({ id: String(plan.id || ''), triggerPrice: Number(plan.triggerPrice), quantity: Number(plan.quantity), status: plan.status === 'triggered' || plan.status === 'cancelled' ? plan.status : 'pending', triggeredAt: plan.triggeredAt ? String(plan.triggeredAt) : undefined, triggeredPrice: plan.triggeredPrice === undefined || plan.triggeredPrice === null ? undefined : Number(plan.triggeredPrice), triggeredQuantity: plan.triggeredQuantity === undefined || plan.triggeredQuantity === null ? undefined : Number(plan.triggeredQuantity), closingEntryId: plan.closingEntryId === undefined || plan.closingEntryId === null ? undefined : String(plan.closingEntryId) })) : undefined,
        quantity: Number(data.entry.quantity),
        price: Number(data.entry.price),
        fee: Number(data.entry.fee || 0),
        createdAt: String(data.entry.createdAt),
        recordedAt: data.entry.recordedAt ? String(data.entry.recordedAt) : undefined,
        targetPrice: data.entry.targetPrice === undefined || data.entry.targetPrice === null ? undefined : Number(data.entry.targetPrice),
        note: data.entry.note || undefined,
        clientRequestId: variables.clientRequestId,
      };
      setAccounts((current) => [account, ...current.filter((item) => item.id !== account.id && item.name !== account.name)]);
      setLastAccountIdByRelatedUser((current) => ({
        ...current,
        [relatedUserAccountMemoryKey(entry.relatedUserId)]: account.id,
      }));
      if (entry.relatedUserId) {
        const relatedUser: PreviewRelatedUser = {
          id: entry.relatedUserId,
          name: entry.relatedUserName || entry.relatedUsername || `用户#${entry.relatedUserId}`,
          username: entry.relatedUsername,
          avatar: entry.relatedUserAvatar,
          lastUsedAt: new Date().toISOString(),
        };
        setLastRelatedUserId(relatedUser.id);
        setRecentRelatedUsers((current) => [relatedUser, ...current.filter((item) => item.id !== relatedUser.id)]);
      }
      if (entry.relatedFundId && entry.relatedFundName && entry.relatedUserId) {
        const fund: PreviewRelatedFund = {
          id: entry.relatedFundId,
          relatedUserId: entry.relatedUserId,
          name: entry.relatedFundName,
          lastUsedAt: new Date().toISOString(),
        };
        setRelatedFunds((current) => [fund, ...current.filter((item) => item.id !== fund.id)]);
        setLastFundIdByRelatedUser((current) => ({ ...current, [entry.relatedUserId!]: fund.id }));
      }
      setTrades((current) => current.map((trade) => {
        if (trade.clientRequestId !== variables.clientRequestId) return trade;
        return canManage && (entry.isCounterparty || trade.isCounterpartyView)
          ? asAdminCounterpartyTrade(entry)
          : entry;
      }));
      setSelectedAccountIds((current) => current.length === 0 ? current : Array.from(new Set([...current, account.id])));
      const savedQuantity = String(variables.quantity || "").trim();
      if (savedQuantity) {
        setLastSavedQuantity(savedQuantity);
      }
      if (entry.instrumentType) setLastOpeningInstrumentType(entry.instrumentType);
      toast.success(entry.isPending ? "挂单已保存，等待统一参考价触发成交" : entry.isLocked ? "速记已保存，逐笔报价将显示黑金锁标" : "速记已保存");
    },
    onError: (error, variables: any) => {
      setTrades((current) => current.filter((trade) => trade.clientRequestId !== variables.clientRequestId));
      if (!variables.accountId) {
        setAccounts((current) => current.filter((account) => account.id !== `pending-account-${variables.clientRequestId}`));
      }
      toast.error(error.message || "速记保存失败，已撤回本地显示");
    },
  });

  const updateOpeningEntryMutation = trpc.ledger.t0UpdateOpeningEntry.useMutation({
    onSuccess: (data: any, variables: any) => {
      const entry: PreviewTrade = {
        id: String(data.entry.id),
        accountId: String(data.entry.accountId),
        accountName: data.entry.accountName
          ? String(data.entry.accountName)
          : accounts.find((account) => account.id === String(data.entry.accountId))?.name,
        relatedUserId: data.entry.relatedUserId === undefined || data.entry.relatedUserId === null ? undefined : String(data.entry.relatedUserId),
        relatedUserName: data.entry.relatedUserName ? String(data.entry.relatedUserName) : undefined,
        relatedUsername: data.entry.relatedUsername ? String(data.entry.relatedUsername) : undefined,
        relatedUserAvatar: data.entry.relatedUserAvatar ? String(data.entry.relatedUserAvatar) : undefined,
        relatedFundId: data.entry.relatedFundId === undefined || data.entry.relatedFundId === null ? undefined : String(data.entry.relatedFundId),
        relatedFundName: data.entry.relatedFundName ? String(data.entry.relatedFundName) : undefined,
        symbol: String(data.entry.symbol || "ETH"),
        action: data.entry.action as TradeAction,
        instrumentType: data.entry.instrumentType === "spot" || data.entry.instrumentType === "contract" || data.entry.instrumentType === "option" || data.entry.instrumentType === "grid"
          ? data.entry.instrumentType
          : undefined,
        optionDirection: data.entry.optionDirection === "long_call" || data.entry.optionDirection === "long_put" || data.entry.optionDirection === "short_call" || data.entry.optionDirection === "short_put"
          ? data.entry.optionDirection
          : undefined,
        optionExpiryDate: data.entry.optionExpiryDate ? String(data.entry.optionExpiryDate) : undefined,
        optionPremium: data.entry.optionPremium === undefined || data.entry.optionPremium === null ? undefined : Number(data.entry.optionPremium),
        optionPremiumCurrency: data.entry.optionPremiumCurrency === "USDT" || data.entry.optionPremiumCurrency === "ETH"
          ? data.entry.optionPremiumCurrency
          : undefined,
        gridDirection: data.entry.gridDirection === "long" || data.entry.gridDirection === "short" ? data.entry.gridDirection : undefined,
        gridRangeMin: data.entry.gridRangeMin === undefined || data.entry.gridRangeMin === null ? undefined : Number(data.entry.gridRangeMin),
        gridRangeMax: data.entry.gridRangeMax === undefined || data.entry.gridRangeMax === null ? undefined : Number(data.entry.gridRangeMax),
        gridLeverage: data.entry.gridLeverage === undefined || data.entry.gridLeverage === null ? undefined : Number(data.entry.gridLeverage),
        gridCount: data.entry.gridCount === undefined || data.entry.gridCount === null ? undefined : Number(data.entry.gridCount),
        isLocked: Boolean(data.entry.isLocked),
        isCounterparty: Boolean(data.entry.isCounterparty),
        isPending: Boolean(data.entry.isPending),
        filledAt: data.entry.filledAt ? String(data.entry.filledAt) : undefined,
        filledPrice: data.entry.filledPrice === undefined || data.entry.filledPrice === null ? undefined : Number(data.entry.filledPrice),
        takeProfitEnabled: Boolean(data.entry.takeProfitEnabled),
        takeProfitPrice: data.entry.takeProfitPrice === undefined || data.entry.takeProfitPrice === null ? undefined : Number(data.entry.takeProfitPrice),
        takeProfitQuantity: data.entry.takeProfitQuantity === undefined || data.entry.takeProfitQuantity === null ? undefined : Number(data.entry.takeProfitQuantity),
        takeProfitTriggeredAt: data.entry.takeProfitTriggeredAt ? String(data.entry.takeProfitTriggeredAt) : undefined,
        takeProfitTriggeredPrice: data.entry.takeProfitTriggeredPrice === undefined || data.entry.takeProfitTriggeredPrice === null ? undefined : Number(data.entry.takeProfitTriggeredPrice),
        takeProfitTriggeredQuantity: data.entry.takeProfitTriggeredQuantity === undefined || data.entry.takeProfitTriggeredQuantity === null ? undefined : Number(data.entry.takeProfitTriggeredQuantity),
        takeProfitPlans: Array.isArray(data.entry.takeProfitPlans) ? data.entry.takeProfitPlans.map((plan: any) => ({ id: String(plan.id || ''), triggerPrice: Number(plan.triggerPrice), quantity: Number(plan.quantity), status: plan.status === 'triggered' || plan.status === 'cancelled' ? plan.status : 'pending', triggeredAt: plan.triggeredAt ? String(plan.triggeredAt) : undefined, triggeredPrice: plan.triggeredPrice === undefined || plan.triggeredPrice === null ? undefined : Number(plan.triggeredPrice), triggeredQuantity: plan.triggeredQuantity === undefined || plan.triggeredQuantity === null ? undefined : Number(plan.triggeredQuantity), closingEntryId: plan.closingEntryId === undefined || plan.closingEntryId === null ? undefined : String(plan.closingEntryId) })) : undefined,
        quantity: Number(data.entry.quantity),
        price: Number(data.entry.price),
        fee: Number(data.entry.fee || 0),
        createdAt: String(data.entry.createdAt),
        recordedAt: data.entry.recordedAt ? String(data.entry.recordedAt) : undefined,
        targetPrice: data.entry.targetPrice === undefined || data.entry.targetPrice === null ? undefined : Number(data.entry.targetPrice),
        note: data.entry.note || undefined,
      };
      const account: PreviewAccount = {
        id: String(data.account?.id ?? entry.accountId),
        name: String(data.account?.name ?? entry.accountName ?? ""),
        lastUsedAt: data.account?.lastUsedAt ?? new Date().toISOString(),
      };
      setAccounts((current) => [account, ...current.filter((item) => item.id !== account.id && item.name !== account.name)]);
      setLastAccountIdByRelatedUser((current) => ({
        ...current,
        [relatedUserAccountMemoryKey(entry.relatedUserId)]: account.id,
      }));
      setTrades((current) => current.map((trade) => getStoredEntryId(trade) === entry.id
        ? (canManage && entry.isCounterparty ? asAdminCounterpartyTrade(entry) : entry)
        : trade));
      if (entry.relatedFundId && entry.relatedFundName && entry.relatedUserId) {
        const fund: PreviewRelatedFund = {
          id: entry.relatedFundId,
          relatedUserId: entry.relatedUserId,
          name: entry.relatedFundName,
          lastUsedAt: new Date().toISOString(),
        };
        setRelatedFunds((current) => [fund, ...current.filter((item) => item.id !== fund.id)]);
        setLastFundIdByRelatedUser((current) => ({ ...current, [entry.relatedUserId!]: fund.id }));
      }
      setCloseConfirmationStep("input");
      if (entry.instrumentType) setLastOpeningInstrumentType(entry.instrumentType);
      // 编辑完成后保留当前“速记一笔”上下文及报价展示模式，便于继续查看或处理同档订单。
      setEntrySide(ACTIONS[entry.action].side);
      setClosingSourceTrade(null);
      setEditingOriginalTrade(null);
      setEntryProfitShareEditTarget(null);
      setEntryForm({
        action: entry.action,
        accountId: entry.accountId,
        accountName: entry.accountName ?? "",
        relatedUserId: entry.relatedUserId ?? "",
        relatedUserName: entry.relatedUserName ?? entry.relatedUsername ?? "",
        relatedUsername: entry.relatedUsername ?? "",
        relatedFundId: entry.relatedFundId ?? "",
        relatedFundName: entry.relatedFundName ?? "",
        instrumentType: entry.instrumentType ?? lastOpeningInstrumentType,
        optionDirection: entry.optionDirection ?? "long_call",
        optionExpiryDate: entry.optionExpiryDate ?? "",
        optionPremium: entry.optionPremium === undefined ? "" : String(entry.optionPremium),
        optionPremiumCurrency: entry.optionPremiumCurrency ?? "USDT",
        gridDirection: entry.gridDirection ?? (ACTIONS[entry.action].side === "long" ? "long" : "short"),
        gridRangeMin: entry.gridRangeMin === undefined ? "" : String(entry.gridRangeMin),
        gridRangeMax: entry.gridRangeMax === undefined ? "" : String(entry.gridRangeMax),
        gridLeverage: entry.gridLeverage === undefined ? "" : String(entry.gridLeverage),
        gridCount: entry.gridCount === undefined ? "" : String(entry.gridCount),
        isLocked: false,
        isCounterparty: false,
        isPending: false,
        isTakeProfit: false,
        takeProfitPrice: "",
        takeProfitQuantity: "",
        quantity: "",
        price: "",
        note: "",
        targetPrice: undefined,
      });
      setShowEntrySheet(true);
      if (variables?.profitShareAllocations) void t0JournalQuery.refetch();
      toast.success(variables?.manualConfirmPendingFill
        ? `挂单已手动确认成交，成交价 ${formatPrice(entry.price)}`
        : entry.isPending
          ? "挂单已保存，等待统一参考价触发成交"
          : entry.isLocked
            ? "开仓已锁定，逐笔报价将显示黑金锁标"
            : "开仓记录已修改");
    },
    onError: (error) => toast.error(error.message || "开仓记录修改失败"),
  });

  const deleteOpeningEntryMutation = trpc.ledger.t0DeleteOpeningEntry.useMutation({
    onSuccess: (data: any) => {
      const entryId = String(data.entryId);
      setTrades((current) => current.filter((trade) => getStoredEntryId(trade) !== entryId));
      setExpandedOpenedTradeIds((current) => {
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
      setDeleteCandidate(null);
      if (data.auditId && data.entry) {
        setRecoverableEntries((current) => [{
          auditId: String(data.auditId),
          operation: "delete",
          revertedAt: new Date().toISOString(),
          trade: previewTradeFromEntry(data.entry),
        }, ...current.filter((item) => item.auditId !== String(data.auditId))]);
      }
      toast.success("开仓记录已删除，可在最近撤回中恢复");
    },
    onError: (error) => toast.error(error.message || "开仓记录删除失败"),
  });

  const revertEntryMutation = trpc.ledger.t0RevertEntry.useMutation({
    onSuccess: (data: any) => {
      const entryId = String(data.entryId);
      setTrades((current) => current.filter((trade) => getStoredEntryId(trade) !== entryId));
      setExpandedOpenedTradeIds((current) => {
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
      if (data.auditId && data.entry) {
        setRecoverableEntries((current) => [{
          auditId: String(data.auditId),
          operation: "revert",
          revertedAt: new Date().toISOString(),
          trade: previewTradeFromEntry(data.entry),
        }, ...current.filter((item) => item.auditId !== String(data.auditId))]);
      }
      setRevertCandidate(null);
      toast.success("速记已回撤，可在最近撤回中恢复");
    },
    onError: (error) => toast.error(error.message || "速记回撤失败"),
  });

  const restoreEntryMutation = trpc.ledger.t0RestoreEntry.useMutation({
    onSuccess: (data: any, variables: any) => {
      const entry = previewTradeFromEntry(data.entry);
      const visibleEntry = canManage && entry.isCounterparty ? asAdminCounterpartyTrade(entry) : entry;
      setTrades((current) => [...current.filter((trade) => getStoredEntryId(trade) !== entry.id), visibleEntry]);
      setRecoverableEntries((current) => current.filter((item) => item.auditId !== String(variables.auditId)));
      setRestoreCandidate(null);
      toast.success("速记已恢复");
    },
    onError: (error) => toast.error(error.message || "速记恢复失败"),
  });

  const openProfitShareManager = (source: PreviewRelatedFund) => {
    const currentRules = profitShareRules.filter((rule) => rule.relatedFundId === Number(source.id));
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
    setDirectoryManagerKind(null);
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(null);
    setEntryProfitShareEditTarget(null);
    setProfitShareSource(source);
    setProfitShareAllocations(currentRules.length > 0
      ? currentRules.map((rule) => ({
        user: { id: String(rule.beneficiaryUserId), name: rule.beneficiaryUserName },
        percentage: String(rule.percentage),
      }))
      : (() => {
        const owner = recentRelatedUsers.find((user) => user.id === source.relatedUserId);
        return owner ? [{ user: owner, percentage: "100" }] : [];
      })());
    setProfitShareRecipientSearch("");
  };

  const openEntryProfitShareManager = () => {
    const opening = editingOriginalTrade;
    if (!opening || opening.isPending || !opening.relatedFundId || !opening.relatedUserId) {
      toast.error("仅已成交且已关联项目的持仓单可以编辑收益分配");
      return;
    }
    const source = relatedFunds.find((fund) => fund.id === opening.relatedFundId) ?? {
      id: opening.relatedFundId,
      name: opening.relatedFundName || "当前项目",
      relatedUserId: opening.relatedUserId,
    };
    const openingAllocations = getOpeningProfitShareSnapshotAllocations(profitShareSnapshots, getStoredEntryId(opening));
    const draft = openingAllocations.map((allocation) => ({
      user: { id: String(allocation.beneficiaryUserId), name: allocation.beneficiaryUserName },
      percentage: String(allocation.percentage),
    }));
    if (draft.length === 0) {
      toast.error("该持仓单尚未固化收益分配，无法直接编辑");
      return;
    }
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
    setDirectoryManagerKind(null);
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(null);
    setEntryProfitShareEditTarget(opening);
    setProfitShareSource(source);
    setProfitShareAllocations(draft);
    setProfitShareRecipientSearch("");
  };

  const closeProfitShareManager = () => {
    if (setProfitShareRuleMutation.isPending || updateOpeningProfitShareMutation.isPending) return;
    setProfitShareSource(null);
    setEntryProfitShareEditTarget(null);
    setProfitShareAllocations([]);
    setProfitShareRecipientSearch("");
  };

  const submitProfitShareRule = () => {
    if (!profitShareSource || profitShareAllocations.length === 0) {
      toast.error("请设置完整的收益分配清单");
      return;
    }
    const allocations = profitShareAllocations.map((allocation) => ({
      beneficiaryUserId: Number(allocation.user.id),
      percentage: Number(allocation.percentage),
    }));
    if (allocations.some((allocation) => !Number.isInteger(allocation.beneficiaryUserId) || !Number.isFinite(allocation.percentage) || allocation.percentage <= 0 || allocation.percentage > 100)) {
      toast.error("每位分配人的比例必须大于0%且不超过100%");
      return;
    }
    const totalPercentage = allocations.reduce((total, allocation) => total + allocation.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.00001) {
      toast.error(`分配合计必须为100%，当前为${totalPercentage.toFixed(2)}%`);
      return;
    }
    if (entryProfitShareEditTarget) {
      const entryId = Number(getStoredEntryId(entryProfitShareEditTarget));
      if (!Number.isInteger(entryId) || entryId <= 0) {
        toast.error("未能识别当前持仓单，请关闭后重新打开编辑");
        return;
      }
      updateOpeningProfitShareMutation.mutate({ ledgerId: 52, entryId, allocations });
      return;
    }
    setProfitShareRuleMutation.mutate({
      ledgerId: 52,
      relatedFundId: profitShareSource.id ? Number(profitShareSource.id) : undefined,
      relatedUserId: profitShareSource.id ? undefined : Number(profitShareSource.relatedUserId),
      relatedFundName: profitShareSource.id ? undefined : profitShareSource.name,
      allocations,
    });
  };

  const openDirectoryManager = (kind: JournalDirectoryKind) => {
    if (kind === "relatedFund" && !entryForm.relatedUserId) {
      toast.error("请先选择关联用户，再管理该用户的项目名称");
      return;
    }
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
    setRelatedUserSearch("");
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(null);
    setDirectoryRenameDraft("");
    setDirectoryManagerKind(kind);
  };

  const openDirectoryRename = (target: JournalDirectoryRenameTarget) => {
    setDirectoryRenameTarget(target);
    setDirectoryRenameDraft(target.name);
  };

  const openDirectoryDelete = (target: JournalDirectoryTarget) => {
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(target);
  };

  const closeDirectoryManager = () => {
    setDirectoryRenameTarget(null);
    setDirectoryDeleteTarget(null);
    setDirectoryRenameDraft("");
    setDirectoryManagerKind(null);
  };

  const submitDirectoryRename = () => {
    if (!directoryRenameTarget) return;
    const name = directoryRenameDraft.trim();
    if (!name) {
      toast.error("请输入新名称");
      return;
    }
    if (name === directoryRenameTarget.name) {
      setDirectoryRenameTarget(null);
      return;
    }
    if (directoryRenameTarget.kind === "account") {
      renameAccountMutation.mutate({ ledgerId: 52, accountId: Number(directoryRenameTarget.id), name });
      return;
    }
    if (directoryRenameTarget.kind === "relatedFund") {
      renameRelatedFundMutation.mutate({ ledgerId: 52, relatedFundId: Number(directoryRenameTarget.id), name });
    }
  };

  const isDirectoryRenamePending = renameAccountMutation.isPending
    || renameRelatedFundMutation.isPending;
  const isDirectoryDeletePending = deleteDirectoryItemMutation.isPending;

  const selectOrderAccount = (accountId: string) => {
    const account = accounts.find((item) => item.id === accountId);
    setEntryForm((current) => ({ ...current, accountId, accountName: account?.name ?? "" }));
    if (account) {
      const memoryKey = relatedUserAccountMemoryKey(entryForm.relatedUserId);
      setLastAccountIdByRelatedUser((current) => ({ ...current, [memoryKey]: account.id }));
    }
    if (!account) return;
    selectAccountMutation.mutate({ ledgerId: 52, accountId: Number(account.id) });
  };

  const selectRelatedUser = (user: PreviewRelatedUser) => {
    const rememberedAccount = getRememberedAccountForRelatedUser(user.id);
    const defaultFund = getRememberedFundForRelatedUser(user.id);
    setEntryForm((current) => ({
      ...current,
      // 已有记忆账户时优先带入；新用户没有记忆时保留管理员刚填写的新账户。
      accountId: rememberedAccount?.id ?? current.accountId,
      accountName: rememberedAccount?.name ?? current.accountName,
      relatedUserId: user.id,
      relatedUserName: user.name,
      relatedUsername: user.username ?? "",
      relatedFundId: defaultFund?.id ?? "",
      relatedFundName: defaultFund?.name ?? "",
    }));
    setLastRelatedUserId(user.id);
    setRecentRelatedUsers((current) => [{ ...user, lastUsedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== user.id)]);
    setRelatedUserSearch("");
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
  };

  const selectRelatedFund = (fundId: string) => {
    if (fundId === "legacy") {
      setEntryForm((current) => ({ ...current, relatedFundId: "legacy", relatedFundName: "" }));
      return;
    }
    const fund = entryRelatedFunds.find((item) => item.id === fundId);
    setEntryForm((current) => ({
      ...current,
      relatedFundId: fundId,
      relatedFundName: fund?.name ?? "",
    }));
    if (fund && entryForm.relatedUserId) {
      setLastFundIdByRelatedUser((current) => ({ ...current, [entryForm.relatedUserId]: fund.id }));
    }
  };

  const clearRelatedUser = () => {
    const rememberedAccount = getRememberedAccountForRelatedUser();
    setEntryForm((current) => ({
      ...current,
      // 取消关联同样不能意外清空尚未保存的新账户。
      accountId: rememberedAccount?.id ?? current.accountId,
      accountName: rememberedAccount?.name ?? current.accountName,
      relatedUserId: "",
      relatedUserName: "",
      relatedUsername: "",
      relatedFundId: "",
      relatedFundName: "",
    }));
    setRelatedUserSearch("");
    setRelatedUserPickerOpen(false);
    setRelatedUserQuickPickerOpen(false);
  };

  const handleSaveEntry = (manualConfirmPendingFill = false) => {
    const normalizedQuantity = normalizeEthQuantity(entryForm.quantity);
    const quantity = Number(normalizedQuantity);
    const selectedAction = ACTIONS[entryForm.action];
    const isCounterpartyClosing = !selectedAction.opening && Boolean(closingSourceTrade?.isCounterpartyView);
    // 管理员反向投影下的“平空/平多”仅是展示方向；写库仍沿用用户端原始方向，确保 FIFO 永远以真实流水核算。
    const storedAction = isCounterpartyClosing ? invertTradeAction(entryForm.action) : entryForm.action;
    const isOptionOpening = selectedAction.opening && entryForm.instrumentType === "option";
    const isGridOpening = selectedAction.opening && entryForm.instrumentType === "grid";
    const effectivePriceInput = isGridOpening && gridReferencePrice !== null
      ? String(gridReferencePrice)
      : entryForm.price.trim();
    const price = Number(effectivePriceInput);
    const fee = estimatedFeeUsdt ?? 0;
    const normalizedAccountName = entryForm.accountName.trim();
    const hasPersistedAccountId = /^\d+$/.test(entryForm.accountId);
    const relatedUserId = Number(entryForm.relatedUserId);
    const normalizedRelatedUserId = Number.isInteger(relatedUserId) && relatedUserId > 0
      ? relatedUserId
      : undefined;
    const relatedFundId = Number(entryForm.relatedFundId);
    const normalizedRelatedFundId = Number.isInteger(relatedFundId) && relatedFundId > 0
      ? relatedFundId
      : undefined;
    const normalizedRelatedFundName = entryForm.relatedFundName.trim();

    if (quantityFormatError) {
      toast.error(quantityFormatError);
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("请输入大于 0 的 ETH 数量");
      return;
    }
    if (selectedAction.opening && !entryForm.instrumentType) {
      toast.error("请选择现货、合约、期权或网格");
      return;
    }
    if (isOptionOpening) {
      if (optionFormValidationMessage) {
        toast.error(optionFormValidationMessage);
        return;
      }
    }
    if (isGridOpening && gridFormValidationMessage) {
      toast.error(gridFormValidationMessage);
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error(isOptionOpening ? "请输入行权价" : isGridOpening ? "请先填写网格区间" : "请输入成交价格");
      return;
    }
    const takeProfitPlans = entryForm.isTakeProfit ? normalizeTakeProfitPlanDrafts(entryForm.takeProfitPlans) : [];
    const isTakeProfitEligible = selectedAction.opening
      && (entryForm.instrumentType === "spot" || entryForm.instrumentType === "contract");
    if (entryForm.isTakeProfit) {
      if (!isTakeProfitEligible) {
        toast.error("止盈仅支持现货和合约开仓");
        return;
      }
      if (takeProfitPlans.length === 0) {
        toast.error("请至少添加一段止盈计划");
        return;
      }
      let takeProfitTotalQuantity = 0;
      for (let index = 0; index < takeProfitPlans.length; index += 1) {
        const plan = takeProfitPlans[index];
        const takeProfitPrice = Number(plan.price);
        const takeProfitQuantity = Number(plan.quantity);
        if (!Number.isFinite(takeProfitPrice) || takeProfitPrice <= 0) {
          toast.error(`第 ${index + 1} 段止盈价格无效`);
          return;
        }
        if (!Number.isFinite(takeProfitQuantity) || takeProfitQuantity <= 0) {
          toast.error(`第 ${index + 1} 段止盈数量无效`);
          return;
        }
        if (selectedAction.side === "long" && takeProfitPrice <= price) {
          toast.error(`第 ${index + 1} 段多单止盈价须高于开仓价`);
          return;
        }
        if (selectedAction.side === "short" && takeProfitPrice >= price) {
          toast.error(`第 ${index + 1} 段空单止盈价须低于开仓价`);
          return;
        }
        takeProfitTotalQuantity += takeProfitQuantity;
      }
      if (takeProfitTotalQuantity > quantity + 0.0000001) {
        toast.error("全部止盈数量合计不得超过本笔可用数量");
        return;
      }
    }
    const archiveTargetPrice = selectedAction.opening
      ? archivePriceForSide(selectedAction.side, price)
      : entryForm.targetPrice === undefined
        ? undefined
        : archivePriceForSide(selectedAction.side, entryForm.targetPrice);
    if (!hasPersistedAccountId && !normalizedAccountName) {
      toast.error("请在最后选择或新建下单账户");
      return;
    }
    if (entryForm.relatedUserId && !normalizedRelatedUserId) {
      toast.error("关联用户信息无效，请重新选择或暂不关联");
      return;
    }
    if (entryForm.relatedFundId && entryForm.relatedFundId !== "legacy" && !normalizedRelatedFundId) {
      toast.error("专项款信息无效，请重新选择或新建");
      return;
    }
    if (!normalizedRelatedUserId && (normalizedRelatedFundId || normalizedRelatedFundName)) {
      toast.error("请先选择关联用户，再选择专项款");
      return;
    }
    if (selectedAction.opening && !entryForm.editingEntryId && normalizedRelatedUserId && !normalizedRelatedFundId && !normalizedRelatedFundName) {
      toast.error("关联用户开仓时，请选择或新建专项款");
      return;
    }
    if (selectedAction.opening && !entryForm.editingEntryId && normalizedRelatedUserId
      && ((normalizedRelatedFundId && !profitShareRules.some((rule) => rule.relatedFundId === normalizedRelatedFundId))
        || (!normalizedRelatedFundId && Boolean(normalizedRelatedFundName)))) {
      toast.error("请先点击项目右侧的“收益分配”，完成合计100%的用户分配设置");
      return;
    }

    if (entryForm.editingEntryId) {
      const entryId = Number(entryForm.editingEntryId);
      if (!selectedAction.opening || !Number.isInteger(entryId) || entryId <= 0) {
        toast.error("仅可编辑有效的开仓记录");
        return;
      }
      const editingInstrumentType = entryForm.instrumentType;
      if (!editingInstrumentType) {
        toast.error("请选择现货、合约、期权或网格");
        return;
      }
      const safeDependentEdit = getSafeDependentOpeningEdit({
        form: entryForm,
        original: editingOriginalTrade,
        normalizedQuantity,
        effectivePrice: effectivePriceInput,
        editableQuantity: isPartiallyClosedOpeningEdit ? editingRemainingQuantity ?? undefined : undefined,
      });
      // 部分平仓表单已冻结所有业务字段，唯一可操作项就是锁定/解锁。
      // 直接按该界面状态发送 lockOnly，避免格式化后的历史字段（如项目/备注）影响受限更新判定。
      const partialLockOnlyUpdate = Boolean(
        isPartiallyClosedOpeningEdit
        && editingOriginalTrade
        && entryForm.isLocked !== Boolean(editingOriginalTrade.isLocked),
      );
      updateOpeningEntryMutation.mutate({
        ledgerId: 52,
        entryId,
        accountId: hasPersistedAccountId ? Number(entryForm.accountId) : undefined,
        accountName: hasPersistedAccountId ? undefined : normalizedAccountName,
        relatedUserId: normalizedRelatedUserId,
        relatedFundId: normalizedRelatedFundId,
        relatedFundName: normalizedRelatedFundName || undefined,
        instrumentType: editingInstrumentType,
        isLocked: entryForm.isLocked,
        isCounterparty: entryForm.isCounterparty,
        counterpartyOnly: !partialLockOnlyUpdate && safeDependentEdit === "counterparty",
        lockOnly: partialLockOnlyUpdate || safeDependentEdit === "lock",
        // 编辑挂单时，先取消时钟“挂单”选中状态，再点击“保存修改”才确认成交。
        isPending: manualConfirmPendingFill ? false : entryForm.isPending,
        manualConfirmPendingFill: manualConfirmPendingFill || undefined,
        takeProfitEnabled: isTakeProfitEligible ? entryForm.isTakeProfit : false,
        takeProfitPrice: isTakeProfitEligible && entryForm.isTakeProfit ? takeProfitPlans[0]?.price : undefined,
        takeProfitQuantity: isTakeProfitEligible && entryForm.isTakeProfit ? takeProfitPlans[0]?.quantity : undefined,
        takeProfitPlans: isTakeProfitEligible && entryForm.isTakeProfit ? takeProfitPlans : undefined,
        takeProfitOnly: isPartiallyClosedOpeningEdit && hasPartialTakeProfitChange,
        optionDirection: isOptionOpening ? entryForm.optionDirection : undefined,
        optionExpiryDate: isOptionOpening ? entryForm.optionExpiryDate : undefined,
        optionPremium: isOptionOpening ? entryForm.optionPremium.trim() : undefined,
        optionPremiumCurrency: isOptionOpening ? entryForm.optionPremiumCurrency : undefined,
        gridDirection: isGridOpening ? entryForm.gridDirection : undefined,
        gridRangeMin: isGridOpening ? entryForm.gridRangeMin.trim() : undefined,
        gridRangeMax: isGridOpening ? entryForm.gridRangeMax.trim() : undefined,
        gridLeverage: isGridOpening ? entryForm.gridLeverage.trim() : undefined,
        gridCount: isGridOpening ? Number(entryForm.gridCount) : undefined,
        quantity: normalizedQuantity,
        price: effectivePriceInput,
        note: entryForm.note.trim() || undefined,
      });
      return;
    }

    if (!selectedAction.opening) {
      if (archiveTargetPrice === undefined) {
        toast.error("请先在价格簿中点选要平的价格档位");
        return;
      }
      const side = selectedAction.side;
      const closeScopeTrades = trades.filter((trade) => !trade.isPending && (
        trade.accountId === entryForm.accountId
        && trade.symbol === "ETH"
        && (trade.relatedUserId ?? "") === (entryForm.relatedUserId ?? "")
        && (trade.relatedFundId ?? "") === (normalizedRelatedFundId ? String(normalizedRelatedFundId) : "")
      ));
      const closeScopeBuckets = buildPositionBuckets(closeScopeTrades);
      const target = closeScopeBuckets.find((bucket) => bucket.side === side && priceKey(bucket.price) === priceKey(archiveTargetPrice));
      if (!target || target.remainingQuantity <= 0) {
        toast.error("该价格档位已无可平数量");
        return;
      }
      if (quantity - target.remainingQuantity > 0.0000001) {
        toast.error(`该价格档位最多可平 ${formatQuantity(target.remainingQuantity)} ETH`);
        return;
      }
      if (closeConfirmationStep === "input") {
        setCloseConfirmationStep("review");
        return;
      }
    }

    const clientRequestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `t0-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    const accountId = entryForm.accountId || `pending-account-${clientRequestId}`;
    if (!entryForm.accountId) {
      setAccounts((current) => [{ id: accountId, name: normalizedAccountName }, ...current]);
    }
    setSelectedAccountIds((current) => current.length === 0 ? current : Array.from(new Set([...current, accountId])));
    const trade: PreviewTrade = {
      id: `pending-entry-${clientRequestId}`,
      accountId,
      accountName: normalizedAccountName || entryForm.accountName,
      relatedUserId: entryForm.relatedUserId || undefined,
      relatedUserName: entryForm.relatedUserName || undefined,
      relatedUsername: entryForm.relatedUsername || undefined,
      relatedFundId: normalizedRelatedFundId ? String(normalizedRelatedFundId) : undefined,
      relatedFundName: normalizedRelatedFundId || !normalizedRelatedFundName ? undefined : normalizedRelatedFundName,
      symbol: "ETH",
      action: entryForm.action,
      instrumentType: selectedAction.opening ? entryForm.instrumentType : undefined,
      optionDirection: isOptionOpening ? entryForm.optionDirection : undefined,
      optionExpiryDate: isOptionOpening ? entryForm.optionExpiryDate : undefined,
      optionPremium: isOptionOpening ? Number(entryForm.optionPremium) : undefined,
      optionPremiumCurrency: isOptionOpening ? entryForm.optionPremiumCurrency : undefined,
      gridDirection: isGridOpening ? entryForm.gridDirection : undefined,
      gridRangeMin: isGridOpening ? Number(entryForm.gridRangeMin) : undefined,
      gridRangeMax: isGridOpening ? Number(entryForm.gridRangeMax) : undefined,
      gridLeverage: isGridOpening ? Number(entryForm.gridLeverage) : undefined,
      gridCount: isGridOpening ? Number(entryForm.gridCount) : undefined,
      isLocked: selectedAction.opening ? entryForm.isLocked : false,
      isCounterparty: selectedAction.opening ? entryForm.isCounterparty : false,
      isPending: selectedAction.opening ? entryForm.isPending : false,
      takeProfitEnabled: selectedAction.opening && isTakeProfitAvailable ? entryForm.isTakeProfit : false,
      takeProfitPrice: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? Number(takeProfitPlans[0]?.price) : undefined,
      takeProfitQuantity: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? Number(takeProfitPlans[0]?.quantity) : undefined,
      takeProfitPlans: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? takeProfitPlans.map((plan) => ({ triggerPrice: Number(plan.price), quantity: Number(plan.quantity), status: "pending" as const })) : undefined,
      quantity,
      price,
      fee,
      createdAt: new Date().toISOString(),
      targetPrice: archiveTargetPrice,
      note: entryForm.note.trim() || undefined,
      clientRequestId,
      isSyncing: true,
    };
    const visibleTrade = canManage && (Boolean(trade.isCounterparty) || isCounterpartyClosing)
      ? asAdminCounterpartyTrade(trade)
      : trade;
    setTrades((current) => [...current, visibleTrade]);
    setShowEntrySheet(false);
    setCloseConfirmationStep("input");
    if (canManage) setAdminLadderDisplayMode(entrySheetLadderDisplayModeRef.current);
    toast.message("已速记，正在后台保存");
    saveEntryMutation.mutate({
      ledgerId: 52,
      accountId: hasPersistedAccountId ? Number(entryForm.accountId) : undefined,
      accountName: hasPersistedAccountId ? undefined : normalizedAccountName,
      relatedUserId: normalizedRelatedUserId,
      relatedFundId: normalizedRelatedFundId,
      relatedFundName: normalizedRelatedFundName || undefined,
      symbol: "ETH",
      action: storedAction,
      instrumentType: selectedAction.opening ? entryForm.instrumentType : undefined,
      isLocked: selectedAction.opening ? entryForm.isLocked : undefined,
      isCounterparty: selectedAction.opening ? entryForm.isCounterparty : undefined,
      isPending: selectedAction.opening ? entryForm.isPending : undefined,
      takeProfitEnabled: selectedAction.opening && isTakeProfitAvailable ? entryForm.isTakeProfit : undefined,
      takeProfitPrice: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? takeProfitPlans[0]?.price : undefined,
      takeProfitQuantity: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? takeProfitPlans[0]?.quantity : undefined,
      takeProfitPlans: selectedAction.opening && isTakeProfitAvailable && entryForm.isTakeProfit ? takeProfitPlans : undefined,
      optionDirection: isOptionOpening ? entryForm.optionDirection : undefined,
      optionExpiryDate: isOptionOpening ? entryForm.optionExpiryDate : undefined,
      optionPremium: isOptionOpening ? entryForm.optionPremium.trim() : undefined,
      optionPremiumCurrency: isOptionOpening ? entryForm.optionPremiumCurrency : undefined,
      gridDirection: isGridOpening ? entryForm.gridDirection : undefined,
      gridRangeMin: isGridOpening ? entryForm.gridRangeMin.trim() : undefined,
      gridRangeMax: isGridOpening ? entryForm.gridRangeMax.trim() : undefined,
      gridLeverage: isGridOpening ? entryForm.gridLeverage.trim() : undefined,
      gridCount: isGridOpening ? Number(entryForm.gridCount) : undefined,
      quantity: normalizedQuantity,
      price: effectivePriceInput,
      targetPrice: archiveTargetPrice === undefined ? undefined : String(archiveTargetPrice),
      note: entryForm.note.trim() || undefined,
      sharedIncomeAllocations: !selectedAction.opening && sharedIncomeSaveAllocations.length > 0 ? sharedIncomeSaveAllocations : undefined,
      clientRequestId,
    });
  };

  const forceRefreshJournal = () => {
    // 立即落盘，保证用户刚选完筛选条件便点击“刷新”时也不会丢失。
    persistT0TopFilters(topFilterStorageKey, {
      accountIds: selectedAccountIds,
      relatedUserIds: relatedUserFilterIds,
      memberRelatedUserFilterTouched,
      relatedFundIds: relatedFundFilterIds,
      instrumentTypeIds: instrumentTypeFilterIds,
      executionFilter,
      hideLocked,
    });
    window.location.reload();
  };

  const backToLedger = () => {
    if (!embedded) setLocation(`/ledger/${ledgerId}`);
  };
  const backToLadder = () => {
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
    setEditingOriginalTrade(null);
    setShowEntrySheet(false);
    if (canManage) setAdminLadderDisplayMode(entrySheetLadderDisplayModeRef.current);
  };
  const backToOrderList = () => {
    if (!isClosingEntry) return;
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
    setEditingOriginalTrade(null);
    setEntryForm((current) => ({
      ...current,
      action: entrySide === "long" ? "openLong" : "openShort",
      instrumentType: lastOpeningInstrumentType,
      isLocked: false,
      isCounterparty: false,
      isPending: false,
      quantity: "",
      price: "",
      note: "",
      editingEntryId: undefined,
    }));
  };

  const renderHistoryActionMenuButton = (trade: PreviewTrade, memberPresentation = false) => {
    if (!canManage || memberPresentation) return null;
    const isOpen = historyActionMenuTradeId === trade.id;
    return (
      <button
        type="button"
        data-card-export-hide="true"
        disabled={Boolean(trade.isSyncing)}
        onClick={() => setHistoryActionMenuTradeId((current) => current === trade.id ? null : trade.id)}
        aria-label="打开历史记录管理操作"
        aria-expanded={isOpen}
        className="ml-auto flex h-5 w-6 shrink-0 items-center justify-center rounded text-slate-500 transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2.25} />
      </button>
    );
  };

  const renderHistoryActionMenu = (trade: PreviewTrade, memberPresentation = false) => {
    if (!canManage || memberPresentation || historyActionMenuTradeId !== trade.id) return null;
    const isOpening = ACTIONS[trade.action].opening;
    return (
      <div data-card-export-hide="true" className="mt-1 flex justify-end gap-1.5" aria-label="历史记录管理操作">
        {isOpening && <button
          type="button"
          disabled={Boolean(trade.isSyncing)}
          onClick={() => {
            setHistoryActionMenuTradeId(null);
            openEditOpeningTrade(trade);
          }}
          className="h-6 rounded border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          编辑
        </button>}
        <button
          type="button"
          disabled={Boolean(trade.isSyncing) || revertEntryMutation.isPending}
          onClick={() => {
            setHistoryActionMenuTradeId(null);
            setRevertCandidate(trade);
          }}
          className="h-6 rounded border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          回撤
        </button>
        {isOpening && <button
          type="button"
          disabled={Boolean(trade.isSyncing) || deleteOpeningEntryMutation.isPending}
          onClick={() => {
            setHistoryActionMenuTradeId(null);
            setDeleteCandidate(trade);
          }}
          className="h-6 rounded border border-rose-200 bg-rose-50 px-2 text-[10px] font-semibold text-rose-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          删除
        </button>}
      </div>
    );
  };

  const renderLinkedJournalGroup = (group: LinkedJournalGroup) => {
    if (!group.opening) {
      const allocation = group.closings[0];
      if (!allocation) return null;
        const closing = allocation.trade;
        const detail = getHistoricalTradeDetail(closing);
        const isLong = ACTIONS[closing.action].side === "long";
        const showFullClosingContext = hasSystemGeneratedSettlementNote(closing.note);
        const viewerPayout = resolveHistoryViewerPayout(closing, detail);
        const hideRepeatedSettlementPrices = historyIsMemberPresentation && Boolean(viewerPayout);
        return (
          <div key={group.id} className="mx-3 my-2 rounded border border-dashed border-amber-200 bg-amber-50/35 px-3 py-2.5">
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
              <span className="shrink-0 text-[10px] font-medium text-amber-700">未匹配开仓</span>
              <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[closing.action].label}</span>
              <span className="shrink-0 font-medium text-slate-800">{formatQuantity(closing.quantity)}E</span>
              {!hideRepeatedSettlementPrices && detail?.buyPrice !== undefined && <span className="shrink-0 text-slate-600">买{detail.buyQuote ?? formatPrice(detail.buyPrice)}</span>}
              {!hideRepeatedSettlementPrices && detail?.sellPrice !== undefined && <span className="shrink-0 text-slate-600">卖{detail.sellQuote ?? formatPrice(detail.sellPrice)}</span>}
            {!hideRepeatedSettlementPrices && detail?.isOptionQuote && <span className="shrink-0 text-violet-700">行权{formatPrice(closing.price)}</span>}
            {!detail && <span className="shrink-0 text-slate-600">{isLong ? "卖" : "买"}{formatPrice(closing.price)}</span>}
          </div>
          <div className={getHistoryContextLayoutClass(showFullClosingContext)}>
            {!historyIsMemberPresentation && <>
              <span className={getHistoryContextValueClass(showFullClosingContext)} title={getTradeAccountName(closing)}>{getTradeAccountName(closing)}</span>
              <span className="text-slate-300">·</span>
            </>}
            <span className={getHistoryContextValueClass(showFullClosingContext)} title={getTradeRelatedUserName(closing)}>{getTradeRelatedUserName(closing)}</span>
            <span className="text-slate-300">·</span>
            <span className={getHistoryContextValueClass(showFullClosingContext)} title={getTradeRelatedFundName(closing)}>{getTradeRelatedFundName(closing)}</span>
            <span className="text-slate-300">·</span>
            <span className="shrink-0">{formatBeijingMonthDayTime(closing.createdAt)}</span>
            {renderHistoryActionMenuButton(closing, historyIsMemberPresentation)}
          </div>
          {renderHistoryActionMenu(closing, historyIsMemberPresentation)}
          {closing.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{closing.note.trim()}</div>}
        </div>
      );
    }

    const opening = group.opening;
    const isLong = ACTIONS[opening.action].side === "long";
    const showFullOpeningContext = hasSystemGeneratedSettlementNote(opening.note);
    const closedQuantity = group.closings.reduce((total, allocation) => total + allocation.quantity, 0);
    const remainingQuantity = Math.max(0, opening.quantity - closedQuantity);
    const groupTone = isLong
      ? "border-rose-200 border-l-rose-500"
      : "border-emerald-200 border-l-emerald-500";
    const openingSurface = isLong ? "bg-rose-50/35" : "bg-emerald-50/35";

    return (
      <div key={group.id} className={`mx-3 my-2 overflow-hidden rounded border border-l-[3px] ${groupTone}`}>
        <div className={`px-3 py-2.5 ${openingSurface}`}>
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
            <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
              <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[opening.action].label}</span>
              <span className="shrink-0 font-medium text-slate-800">{formatQuantity(opening.quantity)}E</span>
              {opening.isPending && <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-sky-700"><Clock3 className="h-3 w-3" />挂单</span>}
              {opening.isCounterpartyView && <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-violet-700"><Repeat2 className="h-3 w-3" strokeWidth={2.4} />反向</span>}
              <span className="shrink-0 text-slate-600">{isLong ? "买" : "卖"}{opening.instrumentType === "option" && opening.optionPremium !== undefined && opening.optionPremiumCurrency ? formatOptionQuote(opening.optionPremium, opening.optionPremiumCurrency) : formatPrice(opening.price)}</span>
              {opening.instrumentType === "option" && <span className="shrink-0 text-violet-700">行权{formatPrice(opening.price)}</span>}
            </div>
            <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-500">
              {closedQuantity > 0 ? `已平 ${formatQuantity(closedQuantity)} · 剩 ${formatQuantity(remainingQuantity)}` : "未平"}
            </span>
            </div>
          <div className={getHistoryContextLayoutClass(showFullOpeningContext)}>
            {!historyIsMemberPresentation && <>
              <span className={getHistoryContextValueClass(showFullOpeningContext)} title={getTradeAccountName(opening)}>{getTradeAccountName(opening)}</span>
              <span className="text-slate-300">·</span>
            </>}
            <span className={getHistoryContextValueClass(showFullOpeningContext)} title={getTradeRelatedUserName(opening)}>{getTradeRelatedUserName(opening)}</span>
            <span className="text-slate-300">·</span>
            <span className={getHistoryContextValueClass(showFullOpeningContext)} title={getTradeRelatedFundName(opening)}>{getTradeRelatedFundName(opening)}</span>
            <span className="text-slate-300">·</span>
            <span className="shrink-0">{formatT0TradeTimeline(opening)}</span>
            {renderHistoryActionMenuButton(opening, historyIsMemberPresentation)}
          </div>
          {renderHistoryActionMenu(opening, historyIsMemberPresentation)}
          {opening.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{opening.note.trim()}</div>}
        </div>
        {group.closings.map((allocation, index) => {
          const closing = allocation.trade;
          const detail = buildLinkedClosingDetail(opening, allocation);
          const allocatedClosing = { ...closing, quantity: allocation.quantity, fee: detail.closingFee ?? closing.fee };
          const isLastClosing = index === group.closings.length - 1;
          const viewerPayout = resolveHistoryViewerPayout(allocatedClosing, detail);
          const displayedNetPnl = viewerPayout?.netPnl ?? detail.netPnl;
          const hideRepeatedSettlementPrices = historyIsMemberPresentation && Boolean(viewerPayout);
          return (
            <div key={`${closing.id}-${index}`} className="relative border-t border-[#c7d0d7]/60 bg-white/28 px-3 py-2.5 pl-8">
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-3 top-0 border-l border-dashed border-slate-300 ${isLastClosing ? "h-1/2" : "bottom-0"}`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 w-3 border-t border-dashed border-slate-300" />
              <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
                <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
                  <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[closing.action].label}</span>
                  <span className="shrink-0 font-medium text-slate-800">{formatQuantity(allocation.quantity)}E</span>
                  {!hideRepeatedSettlementPrices && detail.isOptionQuote ? <>
                    <span className="shrink-0 text-slate-600">买{detail.buyQuote ?? formatPrice(detail.buyPrice)}</span>
                    <span className="shrink-0 text-slate-600">卖{detail.sellQuote ?? formatPrice(detail.sellPrice)}</span>
                    <span className="shrink-0 text-violet-700">行权{formatPrice(closing.price)}</span>
                  </> : !hideRepeatedSettlementPrices && <span className="shrink-0 text-slate-600">{isLong ? "卖" : "买"}{formatPrice(closing.price)}</span>}
                </div>
                <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-1px] border-t border-dotted border-slate-400/80" />
                <button
                  type="button"
                  onClick={() => setNetProfitDetail({
                    trade: allocatedClosing,
                    detail,
                    presentation: historyIsMemberPresentation ? "member" : "admin",
                    viewerUserId: historyIsMemberPresentation ? (isHistoryUserPerspective ? historyPerspectiveTargetUserId : viewerProfitShareBeneficiaryUserId) : undefined,
                  })}
                  className={`shrink-0 border-b border-dotted pb-0.5 font-semibold outline-none ${displayedNetPnl! >= 0 ? "border-rose-500 text-rose-600" : "border-emerald-500 text-emerald-600"}`}
                  aria-label={viewerPayout ? (historyIsMemberPresentation ? "查看关联平仓本单可得明细" : "查看关联平仓本单分成与全体分佣明细") : "查看关联平仓净利润计算明细"}
                >
                  {formatSigned(displayedNetPnl!)}<span className="ml-0.5 text-slate-500">u</span>
                </button>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[11px] text-slate-500">
                <span className="text-[10px] text-slate-400">关联平仓</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">{formatBeijingMonthDayTime(closing.createdAt)}</span>
                {canManage && !historyIsMemberPresentation ? renderHistoryActionMenuButton(closing) : <span className="ml-auto shrink-0 text-[10px] text-slate-500">{viewerPayout ? "本单可得" : "净利润"}</span>}
              </div>
              {renderHistoryActionMenu(closing, historyIsMemberPresentation)}
              {closing.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{closing.note.trim()}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  const renderOpenedTradeRow = (row: { kind: "active" | "history"; trade: PreviewTrade }) => {
  const trade = row.trade;
  const linkedClosings = openingClosingAllocations.get(trade.id) ?? [];
  const linkedClosedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
  const remainingQuantity = Math.max(0, trade.quantity - linkedClosedQuantity);
  const financialRemainingQuantity = getTradeFinancialQuantity(trade, remainingQuantity);
  const floatingPnl = trade.isPending || trade.instrumentType === "option" ? null : calculateEstimatedUnrealizedNetPnl(
    ACTIONS[trade.action].side,
    markPrice,
    financialRemainingQuantity,
    trade.price * financialRemainingQuantity,
  );
  const openingValue = trade.quantity * trade.price;
  const closeAction: TradeAction = ACTIONS[trade.action].side === "long" ? "closeLong" : "closeShort";
  // 锁定不改变已成交/已平仓流水，只保护尚余可平数量；解锁后立即恢复平仓能力。
  const canQuickClose = remainingQuantity > 0.0000001 && !trade.isLocked;
  const takeProfitPlans = getTradeTakeProfitPlans(trade);
  const pendingTakeProfitQuantity = getPendingTakeProfitQuantity(trade);
  const takeProfitMarkerLabel = getTakeProfitMarkerLabel(trade.takeProfitEnabled, pendingTakeProfitQuantity, remainingQuantity);
  const openingProfitShareAllocations = getOpeningProfitShareSnapshotAllocations(profitShareSnapshots, getStoredEntryId(trade));
  const visibleProfitShareAllocations = isMemberView
    ? openingProfitShareAllocations.filter((allocation) => allocation.beneficiaryUserId === viewerProfitShareBeneficiaryUserId)
    : openingProfitShareAllocations;
  const profitShareSummary = visibleProfitShareAllocations
    .map((allocation) => `${allocation.beneficiaryUserName}${formatProfitSharePercentage(allocation.percentage)}`)
    .join(" · ");
  const isExpanded = expandedOpenedTradeIds.has(trade.id);
  return (
    <div key={trade.id} className="rounded border border-slate-200 bg-slate-50/80 px-3 py-2">
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setExpandedOpenedTradeIds((current) => {
            const next = new Set(current);
            if (next.has(trade.id)) next.delete(trade.id);
            else next.add(trade.id);
            return next;
          })}
          className="min-w-0 text-left"
        >
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 leading-5">
                              <span className={`shrink-0 text-sm font-semibold ${ACTIONS[trade.action].side === "long" ? "text-rose-600" : "text-emerald-600"}`}>持仓{ACTIONS[trade.action].side === "long" ? "多单" : "空单"}</span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatQuantity(trade.quantity)} ETH</span>
                              <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">@ {formatPrice(trade.price)}</span>
                              {trade.isPending && <span className="inline-flex shrink-0 items-center gap-1 rounded bg-sky-50 px-1 py-0.5 text-sm font-semibold text-sky-700"><Clock3 className="h-3.5 w-3.5" />挂单</span>}
                              {takeProfitMarkerLabel && <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-amber-700"><Target className="h-3.5 w-3.5" strokeWidth={2.4} />{takeProfitMarkerLabel}</span>}
                              {!trade.isPending && (trade.isLocked ? <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-amber-700"><Lock className="h-3.5 w-3.5" />已锁定</span> : trade.instrumentType === "option" ? <OptionUnrealizedPnlText trade={trade} remainingQuantity={remainingQuantity} ethMarkPrice={markPrice} className="shrink-0 text-sm font-semibold tabular-nums" /> : <span className={`shrink-0 text-sm font-semibold tabular-nums ${floatingPnl === null ? "text-slate-400" : floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{floatingPnl === null ? "--" : `${formatSigned(floatingPnl)} U`}</span>)}
          </span>
        </button>
        <button
          type="button"
          aria-label={isExpanded ? "收起本笔开仓详情" : "展开本笔开仓详情"}
          onClick={() => setExpandedOpenedTradeIds((current) => {
            const next = new Set(current);
            if (next.has(trade.id)) next.delete(trade.id);
            else next.add(trade.id);
            return next;
          })}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-400 active:scale-95"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
        </button>
      </div>
      <div className="mt-1.5 flex min-w-0 items-end justify-between gap-2 text-[10px] font-medium">
        {!isExpanded && <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 leading-4">
          {linkedClosedQuantity > 0.0000001 && <>
            <span className="shrink-0 tabular-nums text-slate-600">已平 {formatQuantity(linkedClosedQuantity)} · 剩 {formatQuantity(remainingQuantity)} ETH</span>
          </>}
          {!isMemberView && <span title={getTradeAccountName(trade)} className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap"><span className="text-slate-400">账户</span><span className="text-slate-600">{getTradeAccountName(trade)}</span></span>}
          <span title={getTradeRelatedUserName(trade)} className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap"><span className="text-slate-400">用户</span><span className="text-slate-600">{getTradeRelatedUserName(trade)}</span></span>
          <span title={getTradeRelatedFundName(trade)} className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap"><span className="text-slate-400">项目</span><span className="text-slate-600">{getTradeRelatedFundName(trade)}</span></span>
          {visibleProfitShareAllocations.length > 0 && <span title={profitShareSummary} className="inline-flex min-w-0 flex-1 items-baseline gap-0.5 text-indigo-700"><span className="shrink-0 text-indigo-400">分配</span><span className="min-w-0 truncate">{isMemberView ? formatProfitSharePercentage(visibleProfitShareAllocations[0].percentage) : profitShareSummary}</span></span>}
        </div>
        }
        {canManage && <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={isCloseReview || Boolean(trade.isSyncing)}
            onClick={() => setDeleteCandidate(trade)}
            className="h-9 rounded border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            删除
          </button>
          <button
            type="button"
            disabled={isCloseReview || Boolean(trade.isSyncing)}
            onClick={() => openEditOpeningTrade(trade)}
            className="h-9 rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            编辑
          </button>
          {row.kind === "active" && !trade.isPending && trade.instrumentType !== "option" && <button
            type="button"
            disabled={!canQuickClose || Boolean(trade.isSyncing) || isCloseReview}
            onClick={() => openQuickCloseSheet(trade)}
            title={trade.isLocked ? "本笔剩余仓位已锁定，请先点击“编辑”解除锁定后再平仓" : undefined}
            className={`h-9 rounded border px-3 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${ACTIONS[closeAction].idleClass}`}
          >
            {ACTIONS[closeAction].label}
          </button>}
        </div>}
      </div>
      {isExpanded && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-x-2 border-t border-slate-200 pt-2 tabular-nums">
            <div className="min-w-0">
              <div className="text-[10px] text-slate-400">{trade.isPending ? "挂单状态" : trade.instrumentType === "option" ? "行权价" : "开仓价值"}</div>
              <div className={`mt-0.5 whitespace-nowrap text-[11px] font-medium ${trade.isPending ? "text-sky-700" : "text-slate-700"}`}>{trade.isPending ? "等待触发" : trade.instrumentType === "option" ? `${formatPrice(trade.price)} U` : `${formatPrice(openingValue)} U`}</div>
            </div>
            <div className="min-w-0 text-center">
              <div className="text-[10px] text-slate-400">{trade.isPending ? "盈亏" : trade.instrumentType === "option" ? "实时盈亏" : "当前盈亏"}</div>
              {trade.instrumentType === "option" && !trade.isPending ? (
                <OptionUnrealizedPnlText trade={trade} remainingQuantity={remainingQuantity} ethMarkPrice={markPrice} emptyLabel="期权报价加载中" className="mt-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums" />
              ) : (
                <div className={`mt-0.5 whitespace-nowrap text-[11px] font-semibold ${floatingPnl === null ? "text-slate-400" : floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {floatingPnl === null ? "--" : `${formatSigned(floatingPnl)} U`}
                </div>
              )}
            </div>
            <div className="min-w-0 text-right">
              <div className="text-[10px] text-slate-400">{trade.filledAt ? "挂单时间" : "开仓时间"}</div>
              <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-700">{trade.isSyncing ? "后台保存中" : formatBeijingMonthDayTime(trade.createdAt)}</div>
            </div>
            <div className={`col-span-3 grid gap-x-2 border-t border-slate-200 pt-2 ${isMemberView ? "grid-cols-2" : "grid-cols-3"}`}>
              {!isMemberView && <div className="min-w-0">
                <div className="text-[10px] text-slate-400">账户</div>
                <div title={getTradeAccountName(trade)} className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{getTradeAccountName(trade)}</div>
              </div>}
              <div className={`min-w-0 ${isMemberView ? "text-left" : "text-center"}`}>
                <div className="text-[10px] text-slate-400">用户</div>
                <div title={getTradeRelatedUserName(trade)} className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{getTradeRelatedUserName(trade)}</div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[10px] text-slate-400">专项款</div>
                <div title={getTradeRelatedFundName(trade)} className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{getTradeRelatedFundName(trade)}</div>
              </div>
            </div>
            {visibleProfitShareAllocations.length > 0 && <div className="col-span-3 border-t border-indigo-100 pt-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-800"><UserRound className="h-3 w-3 text-indigo-600" />{isMemberView ? "本单分配" : "收益分配"}</span>
                <span className="shrink-0 text-[10px] text-indigo-600">开仓快照 · {visibleProfitShareAllocations.length} 人</span>
              </div>
              <div className="mt-1.5 overflow-hidden rounded border border-indigo-100 bg-indigo-50/40">
                {visibleProfitShareAllocations.map((allocation, allocationIndex) => <div key={allocation.beneficiaryUserId} className={`flex items-center justify-between gap-3 px-2.5 py-1.5 text-[11px] tabular-nums ${allocationIndex > 0 ? "border-t border-indigo-100/80" : ""}`}>
                  <span className="min-w-0 truncate font-medium text-slate-700">{allocation.beneficiaryUserName}</span>
                  <span className="shrink-0 font-semibold text-indigo-700">{formatProfitSharePercentage(allocation.percentage)}</span>
                </div>)}
              </div>
              <div className="mt-1.5 text-[10px] leading-4 text-slate-500">已平流水按当时比例永久固定；管理员可在“编辑”中调整本单剩余仓位，并同步此项目之后新开的订单。</div>
            </div>}
            {trade.instrumentType === "option" && <div className="col-span-3 grid grid-cols-3 gap-x-2 border-t border-slate-200 pt-2">
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400">期权方向</div>
                <div className="mt-0.5 truncate text-[11px] font-medium text-violet-700">{getOptionDirectionLabel(trade.optionDirection) ?? "未标注"}</div>
              </div>
              <div className="min-w-0 text-center">
                <div className="text-[10px] text-slate-400">到期日</div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-700">{trade.optionExpiryDate || "未设置"}</div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[10px] text-slate-400">权利金</div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-700">{trade.optionPremium === undefined ? "未设置" : `${formatPrice(trade.optionPremium)} ${trade.optionPremiumCurrency ?? "USDT"}`}</div>
              </div>
            </div>}
            {canManage && trade.instrumentType === "grid" && <div className="col-span-3 grid grid-cols-3 gap-x-2 border-t border-cyan-200 pt-2">
              <div className="min-w-0">
                <div className="text-[10px] text-slate-400">网格方向</div>
                <div className="mt-0.5 truncate text-[11px] font-medium text-cyan-800">{trade.gridDirection === "long" ? "做多网格" : trade.gridDirection === "short" ? "做空网格" : "未设置"}</div>
              </div>
              <div className="min-w-0 text-center">
                <div className="text-[10px] text-slate-400">网格范围</div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium tabular-nums text-slate-700">{trade.gridRangeMin === undefined || trade.gridRangeMax === undefined ? "未设置" : trade.gridDirection === "short" ? `${formatPrice(trade.gridRangeMax)}–${formatPrice(trade.gridRangeMin)}` : `${formatPrice(trade.gridRangeMin)}–${formatPrice(trade.gridRangeMax)}`}</div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[10px] text-slate-400">杠杆 · 格数</div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium tabular-nums text-slate-700">{trade.gridLeverage === undefined || trade.gridCount === undefined ? "未设置" : `${formatPrice(trade.gridLeverage)}× · ${trade.gridCount}格`}</div>
              </div>
            </div>}
            {ACTIONS[trade.action].opening && (trade.instrumentType === "spot" || trade.instrumentType === "contract") && takeProfitPlans.length > 0 && <div className="col-span-3 border-t border-amber-200 pt-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><Target className="h-3 w-3 text-amber-600" />止盈计划</span>
                <span className="text-[10px] font-medium text-amber-700">待触发 {formatQuantity(pendingTakeProfitQuantity)} ETH · {takeProfitPlans.filter((plan) => plan.status === "pending").length} 段</span>
              </div>
              <div className="space-y-1">
                {takeProfitPlans.map((plan, planIndex) => (
                  <div key={`${plan.id || "take-profit"}-${planIndex}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded border border-amber-100 bg-amber-50/45 px-2 py-1 text-[10px] tabular-nums">
                    <span className={`font-semibold ${plan.status === "pending" ? "text-amber-700" : plan.status === "triggered" ? "text-slate-500" : "text-slate-400"}`}>第{planIndex + 1}段</span>
                    <span className="min-w-0 truncate text-slate-700">{formatPrice(plan.triggerPrice)} U · {formatQuantity(plan.quantity)} ETH</span>
                    <span className={`whitespace-nowrap ${plan.status === "pending" ? "text-amber-700" : "text-slate-500"}`}>{plan.status === "pending" ? (ACTIONS[trade.action].side === "long" ? "向上触发" : "向下触发") : plan.status === "triggered" ? "已触发" : "已取消"}</span>
                  </div>
                ))}
              </div>
            </div>}
            {trade.note?.trim() && (
              <div className="col-span-3 border-t border-slate-200 pt-2">
                <div className="text-[10px] text-slate-400">备注</div>
                <div className="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-4 text-slate-600">{trade.note}</div>
              </div>
            )}
          </div>
          {trade.filledAt && <div className="mt-2 flex items-center gap-1.5 border-t border-slate-200 pt-2 text-[10px] font-medium text-slate-500">
            <Clock3 className="h-3 w-3 shrink-0 text-sky-600" />
            成交时间：{formatBeijingMonthDayTime(trade.filledAt)} · 参考价触发 {formatPrice(trade.filledPrice ?? trade.price)} U
          </div>}
          {linkedClosings.length > 0 && (
            <div className="mt-2 border-t border-slate-200 pt-2">
              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                <span className="font-medium text-slate-600">关联平仓记录</span>
                <span className="whitespace-nowrap tabular-nums">已平 {formatQuantity(linkedClosedQuantity)} · 剩 {formatQuantity(remainingQuantity)} ETH</span>
              </div>
              <div className="mt-1.5 space-y-1">
                {linkedClosings.map(({ trade: closingTrade, quantity }, index) => {
                  const isLongPosition = ACTIONS[trade.action].side === "long";
                  return (
                    <div key={`${closingTrade.id}-${index}`} className="flex items-center justify-between gap-2 border-l-2 border-slate-200 bg-white/70 px-2 py-1.5 text-[11px] tabular-nums">
                      <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                        <span className={`font-semibold ${isLongPosition ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[closingTrade.action].label}</span>
                        <span className="font-medium text-slate-700">{formatQuantity(quantity)} ETH</span>
                        <span className="text-slate-500">{isLongPosition ? "卖" : "买"} {formatPrice(closingTrade.price)}</span>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-slate-400">{formatBeijingMonthDayTime(closingTrade.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
  };

  if (meLoading || ledgerLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">正在核验访问权限…</div>;
  }

  if (!canAccess) {
    return (
      <div className={`${embedded ? "min-h-0 w-full" : "min-h-screen max-w-md mx-auto"} bg-slate-50 flex flex-col`}>
        <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-slate-100">
          {!embedded && <button onClick={backToLedger} aria-label="返回52号账本" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>}
          <div className="min-w-0">
            <div className="font-semibold text-slate-900">T+0 速记账本</div>
            <div className="text-xs text-slate-500 mt-0.5">52 号账本内部工具</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
          <div className="w-12 h-12 rounded bg-slate-200 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-slate-500" />
          </div>
          <div className="text-base font-semibold text-slate-800">当前身份不可访问</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">仅 52 号账本成员可访问。管理员可管理全部关联用户数据；成员只可查看本人关联的仓位与流水，代入成员视角不会开放。</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${embedded ? "min-h-0 w-full" : "min-h-screen max-w-md mx-auto"} bg-slate-50 pb-8`}>
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-[0_1px_3px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="h-14 px-4 flex items-center gap-3">
            {!embedded && <button onClick={backToLedger} aria-label="返回52号账本" className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white active:scale-95">
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </button>}
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <h1 className="shrink-0 font-semibold tracking-[0.01em] text-slate-900">T+0 速记账本</h1>
              <button
                type="button"
                onClick={() => {
                  if (payoutTargetRelatedUserId <= 0) {
                    toast.message("请先在用户筛选中单选一位用户，再查看收益账本");
                    return;
                  }
                  setShowPayoutForm(false);
                  setShowPayoutXirrHelp(false);
                  setShowPayoutLog(true);
                }}
                aria-haspopup="dialog"
                aria-label="查看收益账本"
                title="收益账本（记事本）"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-50 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] transition active:scale-95 active:bg-slate-100"
                style={{ color: "#7b8794" }}
              >
                <NotebookTabs className="h-[16px] w-[16px] !text-slate-500" stroke="currentColor" strokeWidth={2.15} />
              </button>
            </div>
            <button
              onClick={forceRefreshJournal}
              aria-label="强制刷新整个页面"
              title="强制刷新整个页面"
              className="h-8 rounded border border-slate-200 bg-slate-900 px-3 text-xs font-semibold text-white active:scale-95"
            >
              刷新
            </button>
          </div>
          {canUseMemberPreview && <div className={`flex min-h-10 items-center justify-between gap-2 border-t px-4 py-1.5 text-[11px] ${isUserPreview ? "border-indigo-200 bg-indigo-50/80" : "border-slate-100 bg-slate-50/80"}`} aria-live="polite">
            {isUserPreview ? <>
              <div className="min-w-0 leading-4 text-indigo-900">
                <span className="font-semibold">正在预览：</span>
                <span className="font-semibold">{selectedPreviewMember?.name || `用户#${previewUserId}`}</span>
                {selectedPreviewMember?.username && <span className="ml-1 text-indigo-600">· {selectedPreviewMember.username}</span>}
                <span className="ml-1.5 text-indigo-700">用户视角 · 只读{isPreviewSwitching ? "（切换中…）" : ""}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewMemberSearch("");
                    setPreviewMemberPickerOpen(true);
                  }}
                  className="h-7 rounded border border-indigo-200 bg-white px-2 text-[11px] font-semibold text-indigo-700 active:scale-95"
                >
                  换用户
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUserId(null);
                    setPreviewMemberPickerOpen(false);
                    setShowEntrySheet(false);
                    setShowPayoutLog(false);
                    setHistoryPresentation("admin");
                    setHistoryActionMenuTradeId(null);
                    setRecentJournalPage(1);
                  }}
                  className="h-7 rounded bg-indigo-700 px-2 text-[11px] font-semibold text-white active:scale-95"
                >
                  返回管理员
                </button>
              </div>
            </> : <>
              <div className="min-w-0 text-slate-500"><span className="font-semibold text-slate-700">管理员视角</span><span className="ml-1.5">可核对成员实际可见的整页数据与展示规则</span></div>
              <button
                type="button"
                onClick={() => {
                  setPreviewMemberSearch("");
                  setPreviewMemberPickerOpen(true);
                }}
                className="h-7 shrink-0 rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-700 active:scale-95"
              >
                预览用户
              </button>
            </>}
          </div>}
        </header>

      <main className="space-y-4 px-4 pt-4">
        <section
          className="relative rounded"
          style={{
            background: [
              "linear-gradient(135deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.32) 25%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.19) 100%)",
              "linear-gradient(90deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 40%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.12) 100%)",
              "linear-gradient(180deg, rgba(0,0,0,0.07) 0%, rgba(255,255,255,0.20) 36%, rgba(255,255,255,0.28) 52%, rgba(255,255,255,0.09) 70%, rgba(0,0,0,0.10) 100%)",
              "linear-gradient(160deg, #e4e7eb 0%, #c9cfd6 20%, #dde1e6 45%, #bec6cf 65%, #d7dce2 80%, #e2e6ea 100%)",
            ].join(", "),
            border: "1.5px solid rgba(178,187,198,0.96)",
            boxShadow: "0 7px 18px rgba(15,23,42,0.16), 0 2px 4px rgba(15,23,42,0.10), inset 0 2px 0 rgba(255,255,255,0.94), inset 0 -2px 0 rgba(71,85,105,0.44), inset 1.5px 0 rgba(255,255,255,0.50), inset -1.5px 0 rgba(71,85,105,0.14)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 rounded"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75 0.02' numOctaves='4' seed='5'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.30'/%3E%3C/svg%3E")`,
              backgroundSize: "160px 160px",
              mixBlendMode: "overlay",
              filter: "contrast(1.16)",
            }}
          />
          <div
            className="relative z-[1] flex min-w-0 items-center p-2"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(203,213,225,0.14))",
              borderTop: "1px solid rgba(100,116,139,0.20)",
              borderBottom: "1px solid rgba(255,255,255,0.62)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setTotalRevenueDetailPage(1);
                setShowTotalNetProfitDetail(true);
              }}
              aria-haspopup="dialog"
              aria-label="查看总收益归因报告"
              className="flex min-w-0 flex-1 items-center gap-1.5 border-r px-2.5 py-3 text-left transition-opacity active:opacity-60"
              style={{
                borderColor: "rgba(100,116,139,0.26)",
                boxShadow: "inset -1px 0 0 rgba(255,255,255,0.70)",
              }}
            >
              <div className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>总收益</div>
              <div className={`flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-[clamp(18px,5vw,22px)] font-bold leading-none tabular-nums ${totalNetProfitClass}`} style={{ textShadow: "-0.9px -0.9px 0 rgba(255,255,255,0.88), 1.15px 1.15px 1px rgba(15,23,42,0.22)" }}>
                <span>{totalNetProfitText}</span>
                <span className="text-[12px] font-semibold opacity-65">U</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShowNetPositionDetail(true)}
              aria-haspopup="dialog"
              aria-label="查看总仓位对冲明细"
              className="flex shrink-0 items-center gap-1.5 px-2.5 py-3 text-left transition-opacity active:opacity-60"
            >
              <div className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>总仓位</div>
              <div className={`flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-[clamp(18px,5vw,22px)] font-bold leading-none tabular-nums ${netPositionClass}`} style={{ textShadow: "-0.9px -0.9px 0 rgba(255,255,255,0.88), 1.15px 1.15px 1px rgba(15,23,42,0.22)" }}>
                <span>{roundedNetPositionText}</span>
                <span className="text-[12px] font-semibold opacity-65">ETH</span>
              </div>
            </button>
          </div>

          <div className="relative z-[1]">
            <AccountOverview
              summary={overviewSummary}
              positionStats={{
                long: {
                  quantity: netPositionBreakdown.long.quantity,
                  activeLevels: netPositionBreakdown.long.levels.length,
                },
                short: {
                  quantity: netPositionBreakdown.short.quantity,
                  activeLevels: netPositionBreakdown.short.levels.length,
                },
              }}
              showCumulativeData={showCumulativeData}
              onToggleCumulativeData={() => setShowCumulativeData((current) => !current)}
              showCommission={!isMemberView}
              isMemberView={isMemberView}
              onExplainGrossProfit={(side, data) => setGrossProfitDetail({
                side,
                gross: data.realizedGross,
                openingFee: data.realizedOpeningFee,
                closingFee: data.realizedClosingFee,
                net: data.realized,
              })}
            />
          </div>
        </section>

        <section
          className="relative overflow-visible rounded border border-[#b9c2ca] bg-[#eef1f3]"
          style={{
            background: "linear-gradient(145deg, rgba(249,250,251,0.96), rgba(218,224,229,0.88))",
            boxShadow: "0 5px 12px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(71,85,105,0.20)",
          }}
        >
          <div
            className="relative z-40 border-b px-3 py-2.5"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.84), rgba(218,224,229,0.66))",
              borderColor: "rgba(109,121,137,0.24)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            <div
              data-t0-filter-row
              className={`grid gap-1.5 transition-[grid-template-columns] duration-200 ${isMemberView ? "grid-cols-2" : "grid-cols-3"}`}
              style={{
                gridTemplateColumns: topFilterGridTemplateColumns,
              }}
            >
              {!isMemberView && (
                <T0MultiSelect
                  label="账户"
                  options={accountFilterOptions}
                  selectedIds={selectedAccountIds}
                  emptyLabel="暂无账户"
                  onChange={(ids) => {
                    setSelectedAccountIds(ids);
                    setRecentJournalPage(1);
                  }}
                />
              )}
              {isMemberView ? <LockedFilterValue label="用户" value={memberRelatedUserName} /> : (
                <T0MultiSelect
                  label="用户"
                  options={relatedUserFilterOptions}
                  selectedIds={relatedUserFilterIds}
                  emptyLabel="暂无用户"
                  constrainRightToFilterRow
                  treatSelectionAsAll={topRelatedUserSelectionIsAll}
                  onChange={(ids) => {
                    setRelatedUserFilterIds(ids);
                    if (isMemberView) {
                      setMemberRelatedUserFilterTouched(true);
                      setHistoryRelatedUserFilterIds(ids);
                    }
                    // 项目只属于用户；改动用户范围后重置项目，避免保留不可见的跨用户项目条件。
                    setRelatedFundFilterIds([]);
                    setRecentJournalPage(1);
                  }}
                />
              )}
              {shouldLockMemberFundFilter ? <LockedFilterValue label="项目" value={lockedRelatedFundName} /> : (
                <T0MultiSelect
                  label="项目"
                  options={relatedFundFilterOptions}
                  selectedIds={relatedFundFilterIds}
                  emptyLabel="暂无项目"
                  align="right"
                  onChange={(ids) => {
                    setRelatedFundFilterIds(ids);
                    setRecentJournalPage(1);
                  }}
                />
              )}
            </div>
            {(canManage || isMemberView) && <div className="mt-2 grid grid-cols-2 gap-1.5 transition-[grid-template-columns] duration-200" style={{ gridTemplateColumns: topTypeStatusGridTemplateColumns }}>
              <T0MultiSelect
                label="类型"
                options={T0_INSTRUMENT_FILTER_OPTIONS}
                selectedIds={instrumentTypeFilterIds}
                emptyLabel="暂无类型"
                showSelectedLabels
                onChange={(ids) => {
                  setInstrumentTypeFilterIds(normalizeT0InstrumentTypeFilterIds(ids));
                  setRecentJournalPage(1);
                }}
              />
              <T0MultiSelect
                label="状态"
                options={T0_EXECUTION_FILTER_OPTIONS}
                selectedIds={executionFilter === "all" ? [] : [executionFilter]}
                emptyLabel="暂无状态"
                align="right"
                singleSelect
                summarySuffix={hideLocked ? "隐藏已锁定" : undefined}
                additionalToggle={{
                  label: "隐藏已锁定",
                  checked: hideLocked,
                  onCheckedChange: (checked) => {
                    setHideLocked(checked);
                    setRecentJournalPage(1);
                  },
                }}
                onChange={(ids) => {
                  const value = ids[0];
                  setExecutionFilter(value === "filled" || value === "pending" ? value : "all");
                  setRecentJournalPage(1);
                }}
              />
            </div>}
          </div>
          {(canManage || isMemberView) && <div
            className="flex h-9 items-center justify-center gap-1.5 border-b border-[#aeb8c1]/50 px-3"
            aria-label="T形交割表报价模式"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(218,224,229,0.60))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            <button
              type="button"
              aria-pressed={adminLadderDisplayMode === "individual"}
              aria-label={`当前${adminLadderDisplayMode === "individual" ? "逐笔报价" : "整合报价"}，点击切换至${adminLadderDisplayMode === "individual" ? "整合报价" : "逐笔报价"}`}
              title={`切换至${adminLadderDisplayMode === "individual" ? "整合报价" : "逐笔报价"}`}
              onClick={() => setAdminLadderDisplayMode((current) => current === "individual" ? "integrated" : "individual")}
              className="h-6 rounded border border-rose-600 bg-rose-600 px-3 text-[11px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] transition active:scale-[0.98]"
            >
              {adminLadderDisplayMode === "individual" ? "逐笔报价" : "整合报价"}
            </button>
            {adminLadderDisplayMode === "integrated" && (
              <select
                value={integratedArchiveStep}
                onChange={(event) => setIntegratedArchiveStep(Number(event.target.value) as IntegratedArchiveStep)}
                aria-label="整合报价归档宽度"
                title="仅合并整合报价的显示档位；真实成交、FIFO 与可平数量仍按十美元档核算"
                className="h-6 rounded border border-slate-300 bg-white/80 px-1.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-rose-500"
              >
                {INTEGRATED_ARCHIVE_STEPS.map((step) => (
                  <option key={step} value={step}>归档 {step}U</option>
                ))}
              </select>
            )}
          </div>}
          <div
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-[#aeb8c1]/50 px-3 py-2.5"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.72), rgba(208,215,221,0.56))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(71,85,105,0.14)",
            }}
          >
            <time className="min-w-0 truncate whitespace-nowrap text-[10px] font-medium tabular-nums text-slate-500" style={{ textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)" }} dateTime={liveClock.toISOString()}>
              {liveBeijingTime}
            </time>
            <span className="text-[13px] font-semibold tracking-[0.08em] text-slate-800" style={{ textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>T形交割表</span>
            <div className={`flex min-w-0 justify-self-end items-center justify-end gap-0.5 whitespace-nowrap text-[10px] font-medium tabular-nums ${priceTrendClass}`} style={{ textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)" }}>
              <span className="text-slate-500">实时参考价</span>
              {priceTrend === "up" && <span role="img" aria-label="价格上涨" className="inline-block h-0 w-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-current" />}
              {priceTrend === "down" && <span role="img" aria-label="价格下跌" className="inline-block h-0 w-0 border-x-[3px] border-t-[5px] border-x-transparent border-t-current" />}
              <span>{formatPrice(markPrice)}</span>
            </div>
          </div>
          <div
            style={{
              background: [
                "linear-gradient(135deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.18) 24%, rgba(255,255,255,0) 48%, rgba(0,0,0,0) 64%, rgba(71,85,105,0.08) 100%)",
                "linear-gradient(180deg, rgba(71,85,105,0.04) 0%, rgba(255,255,255,0.18) 42%, rgba(255,255,255,0.12) 62%, rgba(71,85,105,0.05) 100%)",
                "linear-gradient(160deg, #eef1f3 0%, #e3e8ec 44%, #f1f3f5 100%)",
              ].join(", "),
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.86), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            {displayedPriceRows.map((row) => {
              const getIndividualMetadata = (openingTrade?: PreviewTrade) => isIndividualLadderView && openingTrade
                ? {
                  // 成员只收到本人或被明确授予收益分配的订单；对这些已授权订单，
                  // 报价格底部应与管理员一致，完整显示账户、订单人及专项款。
                  accountName: getTradeAccountName(openingTrade),
                  relatedUserName: getTradeRelatedUserName(openingTrade),
                  relatedFundName: getTradeRelatedFundName(openingTrade),
                  instrumentShortLabel: getInstrumentShortLabel(openingTrade.instrumentType, openingTrade.optionExpiryDate),
                  option: openingTrade.instrumentType === "option"
                    ? {
                      direction: openingTrade.optionDirection,
                      expiryDate: openingTrade.optionExpiryDate,
                      strikePrice: openingTrade.price,
                      premium: openingTrade.optionPremium,
                      premiumCurrency: openingTrade.optionPremiumCurrency,
                      cachedMarkPrice: openingTrade.optionMarkPrice,
                    }
                    : undefined,
                }
                : undefined;
              const individualLongMetadata = getIndividualMetadata(row.longOpeningTrade);
              const individualShortMetadata = getIndividualMetadata(row.shortOpeningTrade);
              const resolveLockedDisplay = (bucket?: PositionBucket, openingTrade?: PreviewTrade) => {
                const lockedQuantity = openingTrade?.isLocked
                  ? bucket?.remainingQuantity ?? 0
                  : bucket?.lockedRemainingQuantity ?? 0;
                const hasLockedPosition = lockedQuantity > 0.0000001;
                return {
                  hasLockedPosition,
                  isFullyLocked: hasLockedPosition && Boolean(bucket) && lockedQuantity >= (bucket?.remainingQuantity ?? 0) - 0.0000001,
                };
              };
              const longLockDisplay = resolveLockedDisplay(row.long, row.longOpeningTrade);
              const shortLockDisplay = resolveLockedDisplay(row.short, row.shortOpeningTrade);
              return (
                <div
                  key={row.key}
                  data-ladder-price={row.price}
                  className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] min-h-[52px] border-b border-[#c7d0d7]/60 last:border-b-0"
                >
                <LadderCell
                  bucket={row.long}
                  side="long"
                  markPrice={markPrice}
                  metadata={individualLongMetadata}
                  isLocked={longLockDisplay.isFullyLocked}
                  hasLockedPosition={longLockDisplay.hasLockedPosition}
                  isCounterparty={Boolean(row.long && row.longOpeningTrade?.isCounterpartyView)}
                  isPending={Boolean(row.long && row.longOpeningTrade?.isPending)}
                  takeProfitEnabled={Boolean(row.long && row.longOpeningTrade?.takeProfitEnabled)}
                  takeProfitQuantity={row.longOpeningTrade ? getPendingTakeProfitQuantity(row.longOpeningTrade) : undefined}
                  readOnly={isMemberView}
                  onClose={() => {
                    if (!row.long) return;
                    // 不论整合或逐笔报价，已有多仓均进入同一报价详情页：
                    // 可新增多仓，并可对该价档内的老单逐笔编辑或卖出平仓。
                    // 逐笔行展示真实成交价的四舍五入整数，详情页/FIFO 则仍按十美元归档价定位。
                    openEntrySheet(
                      "openLong",
                      row.longOpeningTrade ? archivePriceForTrade(row.longOpeningTrade) : row.long.price,
                      isIndividualLadderView ? "individual" : "integrated",
                    );
                  }}
                  // 空档位新建订单也保留当前十美元档位作为“查看范围”；
                  // 最终归档仍只按实际录入成交价计算，绝不按点击格写入。
                  onOpen={() => openEntrySheet("openLong", row.price, isIndividualLadderView ? "individual" : "integrated")}
                />
                <div
                  className="flex items-center justify-center border-x border-[#b9c2ca] px-0.5"
                  style={{
                    background: row.isMark
                      ? priceTrend === "down"
                        ? [
                          "linear-gradient(135deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.15) 22%, rgba(255,255,255,0) 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.20) 100%)",
                          "linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 38%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.12) 100%)",
                          "linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(255,255,255,0.14) 35%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.06) 70%, rgba(0,0,0,0.08) 100%)",
                          "linear-gradient(160deg, #064e3b 0%, #065f46 18%, #047857 40%, #059669 62%, #047857 80%, #064e3b 100%)",
                        ].join(", ")
                        : [
                          "linear-gradient(135deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.15) 22%, rgba(255,255,255,0) 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.20) 100%)",
                          "linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 38%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.12) 100%)",
                          "linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(255,255,255,0.14) 35%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.06) 70%, rgba(0,0,0,0.08) 100%)",
                          "linear-gradient(160deg, #7f1d1d 0%, #991b1b 18%, #b91c1c 40%, #dc2626 62%, #b91c1c 80%, #7f1d1d 100%)",
                        ].join(", ")
                      : "linear-gradient(90deg, rgba(210,217,224,0.94), rgba(244,247,249,0.98) 48%, rgba(205,213,220,0.94))",
                    boxShadow: row.isMark
                      ? priceTrend === "down"
                        ? "inset 0 1.5px 0 rgba(167,243,208,0.88), inset 0 -1.5px 0 rgba(2,44,34,0.62), inset 1.5px 0 rgba(110,231,183,0.28), inset -1.5px 0 rgba(0,0,0,0.16)"
                        : "inset 0 1.5px 0 rgba(254,202,202,0.88), inset 0 -1.5px 0 rgba(69,10,10,0.62), inset 1.5px 0 rgba(252,165,165,0.28), inset -1.5px 0 rgba(0,0,0,0.16)"
                      : "inset 1px 0 0 rgba(255,255,255,0.84), inset -1px 0 0 rgba(71,85,105,0.22), inset 0 1px 0 rgba(255,255,255,0.76)",
                  }}
                >
                  <span className={`text-[13px] tabular-nums font-bold ${row.isMark ? (priceTrend === "down" ? "text-emerald-50" : "text-rose-50") : "text-slate-800"}`} style={{ textShadow: row.isMark ? "0 1px 2px rgba(0,0,0,0.60), 0 -0.5px 1px rgba(255,255,255,0.22)" : "-0.55px -0.55px 0 rgba(255,255,255,0.92), 0.75px 0.75px 0 rgba(71,85,105,0.28)" }}>
                    {row.isMark && markPrice ? (() => {
                      const { integerPart, fractionalPart } = splitLadderMarkPrice(markPrice);
                      return (
                        <span className="inline-flex items-baseline whitespace-nowrap" aria-label={`${integerPart}.${fractionalPart}`}>
                          <span>{integerPart}</span>
                          <span className="-ml-px text-[8px] font-semibold leading-none tracking-tight opacity-95">.{fractionalPart}</span>
                        </span>
                      );
                    })() : isIndividualLadderView ? (() => {
                      const { integerPart, fractionalPart } = splitLadderMarkPrice(row.price);
                      return (
                        <span className="inline-flex items-baseline whitespace-nowrap" aria-label={`${integerPart}.${fractionalPart}`}>
                          <span>{integerPart}</span>
                          <span className="-ml-px text-[8px] font-semibold leading-none tracking-tight opacity-80">.{fractionalPart}</span>
                        </span>
                      );
                    })() : formatLadderPrice(row.price)}
                  </span>
                </div>
                <LadderCell
                  bucket={row.short}
                  side="short"
                  markPrice={markPrice}
                  metadata={individualShortMetadata}
                  isLocked={shortLockDisplay.isFullyLocked}
                  hasLockedPosition={shortLockDisplay.hasLockedPosition}
                  isCounterparty={Boolean(row.short && row.shortOpeningTrade?.isCounterpartyView)}
                  isPending={Boolean(row.short && row.shortOpeningTrade?.isPending)}
                  takeProfitEnabled={Boolean(row.short && row.shortOpeningTrade?.takeProfitEnabled)}
                  takeProfitQuantity={row.shortOpeningTrade ? getPendingTakeProfitQuantity(row.shortOpeningTrade) : undefined}
                  readOnly={isMemberView}
                  onClose={() => {
                    if (!row.short) return;
                    // 不论整合或逐笔报价，已有空仓均进入同一报价详情页：
                    // 可新增空仓，并可对该价档内的老单逐笔编辑或买入平仓。
                    // 逐笔行展示真实成交价的四舍五入整数，详情页/FIFO 则仍按十美元归档价定位。
                    openEntrySheet(
                      "openShort",
                      row.shortOpeningTrade ? archivePriceForTrade(row.shortOpeningTrade) : row.short.price,
                      isIndividualLadderView ? "individual" : "integrated",
                    );
                  }}
                  // 同上：从空仓空档位开单时，详情只展示当前空仓价格档的订单。
                  onOpen={() => openEntrySheet("openShort", row.price, isIndividualLadderView ? "individual" : "integrated")}
                />
                </div>
              );
            })}
          </div>
        </section>

        <section
          ref={profitableHistoryExportRef}
          className="overflow-hidden rounded border border-[#b9c2ca] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
          style={{
            background: [
              "linear-gradient(135deg, rgba(255,255,255,0.52) 0%, rgba(255,255,255,0.12) 24%, rgba(255,255,255,0) 48%, rgba(0,0,0,0) 64%, rgba(71,85,105,0.07) 100%)",
              "linear-gradient(180deg, rgba(71,85,105,0.04) 0%, rgba(255,255,255,0.14) 42%, rgba(255,255,255,0.10) 62%, rgba(71,85,105,0.05) 100%)",
              "linear-gradient(160deg, #edf0f2 0%, #e1e6ea 48%, #eff2f4 100%)",
            ].join(", "),
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.88), inset 0 -1px 0 rgba(71,85,105,0.12)",
          }}
        >
          <div
            className="relative flex items-center justify-center border-b border-[#c7d0d7]/80 px-4 py-2.5"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.58), rgba(208,215,221,0.34))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            <span className="inline-flex items-baseline gap-1.5 text-[13px] font-semibold tracking-[0.08em] text-slate-700" style={{ textShadow: "-0.4px -0.4px 0 rgba(255,255,255,0.88), 0.55px 0.55px 0 rgba(71,85,105,0.18)" }}>
              历史记录
              <span className="text-[11px] font-medium tracking-normal text-slate-500">{visibleRecentJournalTrades.length} 笔</span>
            </span>
            {canManage && historyPerspectiveTargetUserId > 0 && <button
              type="button"
              data-card-export-hide="true"
              aria-pressed={isHistoryUserPerspective}
              aria-label={isHistoryUserPerspective ? "切换为管理员视角" : "切换为用户视角"}
              title={isHistoryUserPerspective ? "切换为管理员视角" : "切换为用户视角"}
              onClick={() => {
                setHistoryPresentation((current) => current === "admin" ? "member" : "admin");
                setHistoryActionMenuTradeId(null);
                setNetProfitDetail(null);
                setShowHistoryFilters(false);
                setRecentJournalPage(1);
              }}
              className={`absolute right-4 h-6 rounded-[3px] border px-2 text-[11px] font-medium transition-colors active:scale-95 ${isHistoryUserPerspective ? "border-[#1a56db] bg-[#1a56db] text-white" : "border-[#c7d0d7] bg-white/40 text-slate-600"}`}
            >
              {isHistoryUserPerspective ? "用户视角" : "管理员视角"}
            </button>}
          </div>
          <div>
              <div
                data-card-export-hide="true"
                className="border-b border-[#c7d0d7]/70 px-2 py-1.5 sm:px-3 sm:py-2"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.30), rgba(208,215,221,0.16))" }}
              >
                <div className="flex flex-nowrap items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1" role="group" aria-label="历史记录动作筛选">
                  {availableJournalActions.length > 1 && <button
                    type="button"
                    aria-pressed={allJournalActionsSelected && !showOnlyProfitableHistory && !showLinkedJournalGroups}
                    onClick={() => {
                      setShowOnlyProfitableHistory(false);
                      setShowLinkedJournalGroups(false);
                      setJournalActionFilters(new Set(availableJournalActions));
                      setRecentJournalPage(1);
                    }}
                    className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${allJournalActionsSelected && !showOnlyProfitableHistory && !showLinkedJournalGroups ? "border-[#75818c] bg-[#75818c] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    全部
                  </button>}
                  <button
                    type="button"
                    aria-pressed={showOnlyProfitableHistory}
                    aria-label="仅显示盈利的平多与平空记录"
                    title="仅显示净收益大于 0 的平多与平空记录"
                    onClick={() => {
                      setShowOnlyProfitableHistory((current) => !current);
                      setShowLinkedJournalGroups(false);
                      // 进入“盈利”时必须同时覆盖平多和平空，不能继承此前单一动作的筛选。
                      setJournalActionFilters(new Set(availableJournalActions));
                      setRecentJournalPage(1);
                    }}
                    className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${showOnlyProfitableHistory ? "border-rose-600 bg-rose-700 text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    盈利
                  </button>
                  {availableJournalActions.map((action) => {
                    const selected = !showOnlyProfitableHistory
                      && !showLinkedJournalGroups
                      && !allJournalActionsSelected
                      && journalActionFilters.has(action);
                    return (
                      <button
                        key={action}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setShowOnlyProfitableHistory(false);
                          setShowLinkedJournalGroups(false);
                          selectJournalActionFilter(action);
                        }}
                        className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${selected ? ACTIONS[action].activeClass : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                      >
                        {ACTIONS[action].label}
                      </button>
                    );
                  })}
                  {hasLinkedJournalPairs && <button
                    type="button"
                    aria-pressed={showLinkedJournalGroups}
                    onClick={() => {
                      setShowOnlyProfitableHistory(false);
                      setJournalActionFilters(new Set(availableJournalActions));
                      setShowLinkedJournalGroups((current) => !current);
                      setRecentJournalPage(1);
                    }}
                    className={`h-[22px] shrink-0 whitespace-nowrap rounded-[3px] border px-1 text-[10px] font-medium leading-none transition-colors active:scale-95 ${showLinkedJournalGroups ? "border-[#75818c] bg-[#75818c] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    关联
                  </button>}
                  {canManage && !isHistoryUserPerspective && <button
                    type="button"
                    aria-label={showHistoryFilters ? "收起并清空历史筛选" : "筛选历史记录"}
                    aria-expanded={showHistoryFilters}
                    title={showHistoryFilters ? "收起并恢复全部" : "筛选历史记录"}
                    onClick={() => {
                      if (showHistoryFilters) {
                        // 第二次点击在收起面板的同时清空五项条件，快速回到全部历史记录。
                        setHistoryAccountFilterIds([]);
                        setHistoryRelatedUserFilterIds([]);
                        setHistoryRelatedFundFilterIds([]);
                        setHistoryInstrumentTypeFilterIds([]);
                        setHistoryExecutionFilter("all");
                        setHistoryHideLocked(false);
                        setRecentJournalPage(1);
                        setShowHistoryFilters(false);
                        return;
                      }
                      setShowHistoryFilters(true);
                    }}
                    className={`ml-0.5 flex h-6 w-7 shrink-0 items-center justify-center rounded-[3px] border transition-colors active:scale-95 ${showHistoryFilters || hasActiveHistoryDetailFilters ? "border-[#1a56db] bg-[#1a56db] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>}
                  {(showOnlyProfitableHistory || showLinkedJournalGroups) && <div data-card-export-hide="true" className="ml-auto flex shrink-0 items-center">
                    <OrderCardImageDownload
                      targetRef={profitableHistoryExportRef}
                      currentUser={me as any}
                      orderNo={showLinkedJournalGroups ? "关联历史" : "盈利历史"}
                      filenamePrefix={showLinkedJournalGroups ? "52号账本T0关联" : "52号账本T0盈利"}
                      previewTitle={showLinkedJournalGroups ? "T+0关联历史记录图片预览" : "T+0盈利历史记录图片预览"}
                      previewHint={showLinkedJournalGroups
                        ? "仅包含当前关联历史记录；筛选菜单与管理控件已隐藏"
                        : "仅包含当前筛选结果的历史记录；筛选菜单与管理控件已隐藏"}
                      color="#111827"
                      outerPadding={12}
                      captureFullContent
                      exportBackground="#F8FAFC"
                      variant="bare"
                      watermarkMode="time-only"
                      watermarkOpacity={0.045}
                    />
                  </div>}
                </div>
              </div>
              {canManage && !isHistoryUserPerspective && showHistoryFilters && <div
                data-card-export-hide="true"
                className="relative z-20 border-b border-[#c7d0d7]/70 px-4 py-2.5"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.52), rgba(208,215,221,0.28))" }}
              >
                <div
                  data-t0-filter-row
                  className={`grid gap-1.5 transition-[grid-template-columns] duration-200 ${isMemberView ? "grid-cols-2" : "grid-cols-3"}`}
                  style={{ gridTemplateColumns: historyFilterGridTemplateColumns }}
                >
                  {!isMemberView && <T0MultiSelect
                    label="账户"
                    options={accountFilterOptions}
                    selectedIds={historyAccountFilterIds}
                    emptyLabel="暂无账户"
                    onChange={(ids) => {
                      setHistoryAccountFilterIds(ids);
                      setRecentJournalPage(1);
                    }}
                  />}
                  <T0MultiSelect
                    label="用户"
                    options={relatedUserFilterOptions}
                    selectedIds={historyRelatedUserFilterIds}
                    emptyLabel="暂无用户"
                    constrainRightToFilterRow
                    treatSelectionAsAll={historyRelatedUserSelectionIsAll}
                    onChange={(ids) => {
                      setHistoryRelatedUserFilterIds(ids);
                      // 项目只属于用户，切换用户范围时同步清空旧项目条件。
                      setHistoryRelatedFundFilterIds([]);
                      setRecentJournalPage(1);
                    }}
                  />
                  <T0MultiSelect
                    label="项目"
                    options={historyRelatedFundFilterOptions}
                    selectedIds={historyRelatedFundFilterIds}
                    emptyLabel="暂无项目"
                    align="right"
                    onChange={(ids) => {
                      setHistoryRelatedFundFilterIds(ids);
                      setRecentJournalPage(1);
                    }}
                  />
                </div>
                <div
                  className="mt-2 grid grid-cols-2 gap-2 transition-[grid-template-columns] duration-200"
                  style={{ gridTemplateColumns: historyTypeStatusGridTemplateColumns }}
                >
                  <T0MultiSelect
                    label="类型"
                    options={T0_INSTRUMENT_FILTER_OPTIONS}
                    selectedIds={historyInstrumentTypeFilterIds}
                    emptyLabel="暂无类型"
                    compact
                    showSelectedLabels
                    onChange={(ids) => {
                        setHistoryInstrumentTypeFilterIds(normalizeT0InstrumentTypeFilterIds(ids));
                        setRecentJournalPage(1);
                    }}
                  />
                  <T0MultiSelect
                    label="状态"
                    options={T0_EXECUTION_FILTER_OPTIONS}
                    selectedIds={historyExecutionFilter === "all" ? [] : [historyExecutionFilter]}
                    emptyLabel="暂无状态"
                    compact
                    align="right"
                    singleSelect
                    summarySuffix={historyHideLocked ? "隐藏已锁定" : undefined}
                    additionalToggle={{
                      label: "隐藏已锁定",
                      checked: historyHideLocked,
                      onCheckedChange: (checked) => {
                        setHistoryHideLocked(checked);
                        setRecentJournalPage(1);
                      },
                    }}
                    onChange={(ids) => {
                      const value = ids[0];
                      setHistoryExecutionFilter(value === "filled" || value === "pending" ? value : "all");
                      setRecentJournalPage(1);
                    }}
                  />
                </div>
              </div>}
              {visibleSharedIncomeTransfers.map((transfer) => (
                <div key={`shared-income-${transfer.id}`} className="border-b border-indigo-100 bg-indigo-50/35 px-4 py-2.5">
                  <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
                    <span className="shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">共享收益订单</span>
                    <span className="min-w-0 truncate font-semibold text-slate-800">{isMemberView || isHistoryUserPerspective ? transfer.sourceUserName : `${transfer.recipientUserName} · 来源 ${transfer.sourceUserName}`}</span>
                    <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-1px] border-t border-dotted border-slate-400/80" />
                    <span className="shrink-0 font-semibold text-rose-600">+{formatPrice(transfer.amount)}<span className="ml-0.5 text-slate-500">u</span></span>
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="truncate">来源订单 #{transfer.closingEntryId}</span>
                    <span className="text-slate-300">·</span>
                    <span className="shrink-0">{formatT0TradeTimeline({ createdAt: transfer.createdAt, recordedAt: transfer.createdAt } as PreviewTrade)}</span>
                    {canManage && !isHistoryUserPerspective && <><span className="text-slate-300">·</span><span className="ml-auto shrink-0">管理员划出</span></>}
                  </div>
                </div>
              ))}
              {visibleRecentJournalTrades.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-slate-500">当前筛选范围还没有历史记录</div>
              ) : showLinkedJournalGroups ? (
                pagedLinkedJournalGroups.map((group) => renderLinkedJournalGroup(group))
              ) : pagedRecentJournalTrades.map((trade) => {
                const detail = getHistoricalTradeDetail(trade);
                const isOpening = ACTIONS[trade.action].opening;
                const isLong = ACTIONS[trade.action].side === "long";
                const showFullHistoryContext = hasSystemGeneratedSettlementNote(trade.note);
                const isAutomaticTakeProfit = trade.note?.includes("[系统自动止盈]") ?? false;
                const viewerPayout = resolveHistoryViewerPayout(trade, detail);
                const displayedNetPnl = viewerPayout?.netPnl ?? detail?.netPnl;
                const hideRepeatedSettlementPrices = historyIsMemberPresentation && Boolean(viewerPayout);
                return (
                <div key={trade.id} className="border-b border-[#c7d0d7]/60 px-4 py-2.5 last:border-b-0">
                    <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
                      <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
                        <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[trade.action].label}</span>
                        {isAutomaticTakeProfit && <Target className="h-3.5 w-3.5 shrink-0 text-emerald-600" strokeWidth={2.5} aria-label="系统自动止盈" />}
                        <span className="shrink-0 font-medium text-slate-800">{formatQuantity(trade.quantity)}E</span>
                        {trade.isPending && <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-sky-700"><Clock3 className="h-3 w-3" />挂单</span>}
                        {!hideRepeatedSettlementPrices && detail?.buyPrice !== undefined && <span className="shrink-0 text-slate-600">买{detail.buyQuote ?? formatPrice(detail.buyPrice)}</span>}
                        {!hideRepeatedSettlementPrices && detail?.sellPrice !== undefined && <span className="shrink-0 text-slate-600">卖{detail.sellQuote ?? formatPrice(detail.sellPrice)}</span>}
                        {!hideRepeatedSettlementPrices && detail?.isOptionQuote && <span className="shrink-0 text-violet-700">行权{formatPrice(trade.price)}</span>}
                        {!detail && <span className="shrink-0 text-slate-600">{isLong ? "买" : "卖"}{formatPrice(trade.price)}</span>}
                        {trade.isSyncing && <span className="shrink-0 text-amber-600">保存中</span>}
                      </div>
                      {!isOpening && detail && displayedNetPnl !== undefined && <>
                        <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-1px] border-t border-dotted border-slate-400/80" />
                        <button
                          type="button"
                          onClick={() => setNetProfitDetail({
                            trade,
                            detail,
                            presentation: historyIsMemberPresentation ? "member" : "admin",
                            viewerUserId: historyIsMemberPresentation ? (isHistoryUserPerspective ? historyPerspectiveTargetUserId : viewerProfitShareBeneficiaryUserId) : undefined,
                          })}
                          className={`shrink-0 border-b border-dotted pb-0.5 font-semibold outline-none ${displayedNetPnl >= 0 ? "border-rose-500 text-rose-600" : "border-emerald-500 text-emerald-600"}`}
                          aria-label={viewerPayout ? (historyIsMemberPresentation ? "查看本单可得明细" : "查看本单分成与全体分佣明细") : "查看净利润计算明细"}
                        >
                          {formatSigned(displayedNetPnl)}<span className="ml-0.5 text-slate-500">u</span>
                        </button>
                      </>}
                    </div>
                    <div className={getHistoryContextLayoutClass(showFullHistoryContext)}>
                      {!historyIsMemberPresentation && <>
                        <span className={getHistoryContextValueClass(showFullHistoryContext)} title={getTradeAccountName(trade)}>{getTradeAccountName(trade)}</span>
                        <span className="text-slate-300">·</span>
                      </>}
                      <span className={getHistoryContextValueClass(showFullHistoryContext)} title={getTradeRelatedUserName(trade)}>{getTradeRelatedUserName(trade)}</span>
                      <span className="text-slate-300">·</span>
                      <span className={getHistoryContextValueClass(showFullHistoryContext)} title={getTradeRelatedFundName(trade)}>{getTradeRelatedFundName(trade)}</span>
                      <span className="text-slate-300">·</span>
                      <span className="shrink-0">{formatT0TradeTimeline(trade)}</span>
                      {canManage && !historyIsMemberPresentation ? renderHistoryActionMenuButton(trade) : !isOpening && detail && displayedNetPnl !== undefined && <>
                        <span className="text-slate-300">·</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-500">{viewerPayout ? "本单可得" : "净利润"}</span>
                      </>}
                    </div>
                    {renderHistoryActionMenu(trade, historyIsMemberPresentation)}
                    {trade.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{trade.note.trim()}</div>}
                  </div>
                );
              })}
              {(showLinkedJournalGroups ? linkedJournalGroups.length : recentJournalTrades.length) > 0 && recentJournalTotalPages > 1 && (
                <div
                  className="flex items-center justify-between gap-3 border-t border-[#c7d0d7]/80 px-4 py-2.5 text-[11px] tabular-nums"
                  style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.42), rgba(208,215,221,0.34))", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)" }}
                >
                  <button
                  type="button"
                  disabled={recentJournalPage <= 1}
                  onClick={() => setRecentJournalPage((current) => Math.max(1, current - 1))}
                  className="h-7 rounded-[3px] border border-[#b9c2ca] bg-white/38 px-2.5 font-medium text-slate-600 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    上一页
                  </button>
                  <span className="whitespace-nowrap text-slate-500">第 {recentJournalPage} 页 / 共 {recentJournalTotalPages} 页</span>
                  <button
                  type="button"
                  disabled={recentJournalPage >= recentJournalTotalPages}
                  onClick={() => setRecentJournalPage((current) => Math.min(recentJournalTotalPages, current + 1))}
                  className="h-7 rounded-[3px] border border-[#b9c2ca] bg-white/38 px-2.5 font-medium text-slate-600 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    下一页
                  </button>
                </div>
              )}
              {canManage && !isHistoryUserPerspective && recoverableEntries.length > 0 && (
                <div data-card-export-hide="true" className="border-t border-slate-200 bg-amber-50/45">
                  <button
                    type="button"
                    onClick={() => setShowRecoverableRecords((value) => !value)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                  >
                    <span className="text-xs font-semibold text-amber-800">最近撤回 · 可恢复 {recoverableEntries.length} 笔</span>
                    <ChevronRight className={`h-4 w-4 text-amber-600 transition-transform ${showRecoverableRecords ? "rotate-90" : ""}`} />
                  </button>
                  {showRecoverableRecords && (
                    <div className="border-t border-amber-100 bg-white/75">
                      {recoverableEntries.map((item) => (
                        <div key={item.auditId} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-amber-100 last:border-b-0">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-700">{ACTIONS[item.trade.action].label} {formatQuantity(item.trade.quantity)} ETH @ {formatPrice(item.trade.price)}</div>
                            <div className="mt-0.5 text-[10px] text-slate-500">账户 {getTradeAccountName(item.trade)} · 用户 {getTradeRelatedUserName(item.trade)} · {item.operation === "delete" ? "删除" : "回撤"}于 {formatBeijingMonthDayTime(item.revertedAt)}</div>
                          </div>
                          <button
                            type="button"
                            disabled={restoreEntryMutation.isPending}
                            onClick={() => setRestoreCandidate(item)}
                            className="h-7 shrink-0 rounded border border-indigo-200 bg-white px-2 text-[11px] font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            恢复
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
          </div>
        </section>

        {!isMemberView && (
          <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-200 px-1 pt-2 text-[10px] leading-4 text-slate-400">
            <span>内部速记账本 · 不触发交易所下单</span>
            <span>下单账户与管理流水仅当前管理员可见</span>
          </footer>
        )}
      </main>

      {canUseMemberPreview && previewMemberPickerOpen && (
        <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label="选择用户视角">
          <div className="w-full max-h-[82vh] overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:max-w-md sm:rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">选择用户视角</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">按该成员实际权限重新加载整页数据；不会切换登录身份，全部编辑入口保持只读。</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewMemberPickerOpen(false)}
                aria-label="关闭用户选择"
                className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 active:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              value={previewMemberSearch}
              onChange={(event) => setPreviewMemberSearch(event.target.value)}
              autoFocus
              placeholder="搜索姓名、账号或用户编号"
              aria-label="搜索可预览用户"
              className="mt-4 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white"
            />
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              {t0PreviewMembersQuery.isLoading ? <div className="px-3 py-8 text-center text-sm text-slate-400">正在读取可预览成员…</div>
                : t0PreviewMembersQuery.isError ? <div className="px-3 py-8 text-center text-sm text-rose-600">成员名单加载失败，请关闭后重试</div>
                  : visiblePreviewMembers.length === 0 ? <div className="px-3 py-8 text-center text-sm text-slate-400">没有匹配的可预览成员</div>
                    : <div className="divide-y divide-slate-100">
                      {visiblePreviewMembers.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            setPreviewUserId(member.id);
                            setPreviewMemberPickerOpen(false);
                            setPreviewMemberSearch("");
                            setShowEntrySheet(false);
                            setShowPayoutLog(false);
                            setHistoryPresentation("admin");
                            setHistoryActionMenuTradeId(null);
                            setRecentJournalPage(1);
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors active:bg-indigo-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-800">{member.name}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-slate-500">{member.username ? member.username : `用户编号 ${member.id}`}</span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-indigo-600">预览</span>
                        </button>
                      ))}
                    </div>}
            </div>
          </div>
        </div>
      )}

      {showEntrySheet && (
        <div
          className={isMemberView ? "fixed inset-0 z-40 overflow-y-auto bg-slate-50" : "fixed inset-0 z-40 bg-white"}
          role="dialog"
          aria-modal="true"
          aria-label={isMemberView ? "仓位明细" : "速记一笔"}
        >
          <div className={isMemberView ? "min-h-full w-full bg-slate-50" : "h-full w-full overflow-y-auto bg-white"}>
            {isMemberView ? (
              <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur">
                <button
                  type="button"
                  onClick={backToLadder}
                  aria-label="返回T加零价格簿"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 active:scale-95"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h1 className="min-w-0 flex-1 text-base font-semibold text-slate-900">仓位明细</h1>
                <button
                  type="button"
                  onClick={backToLadder}
                  aria-label="关闭并返回T加零价格簿"
                  title="关闭"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition active:scale-95"
                >
                  <X className="h-6 w-6" strokeWidth={2.25} />
                </button>
              </header>
            ) : (
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 pb-2 pt-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold text-slate-900">{isEditingEntry ? "编辑开仓记录" : isClosingEntry ? `${ACTIONS[entryForm.action].label}设置` : "速记一笔"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={backToLadder}
                    aria-label="关闭并返回T型报价"
                    title="关闭"
                    className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition active:scale-95"
                  >
                    <X className="h-6 w-6" strokeWidth={2.25} />
                  </button>
                </div>
              </div>
            )}

            <div className={`p-4 space-y-4 ${canManage && !isMemberView ? "pb-24" : ""}`}>
              <div className={`overflow-hidden rounded border ${isOptionEntryContext ? "border-violet-200" : isGridOpeningEntry ? "border-cyan-200" : entrySide === "long" ? "border-rose-200" : "border-emerald-200"}`}>
                <div className={isOptionEntryContext ? "bg-violet-50/70" : isGridOpeningEntry ? "bg-cyan-50/70" : entrySide === "long" ? "bg-rose-50/70" : "bg-emerald-50/70"}>
                <div className="px-3 py-2.5">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-left">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className={`text-base font-semibold ${isOptionEntryContext ? "text-violet-700" : isGridOpeningEntry ? "text-cyan-800" : entrySide === "long" ? "text-rose-600" : "text-emerald-600"}`}>{entryScopeTitle}</span>
                    <span className="text-base font-semibold tabular-nums text-slate-900">{formatQuantity(entrySideSummary.quantity)} ETH</span>
                  </div>
                  <span className="shrink-0 text-base font-medium tabular-nums text-slate-500">{isOptionEntryContext ? "行权价" : isGridOpeningEntry ? "参考价" : "均价"} {entrySideSummary.quantity > 0 ? formatPrice(entrySideSummary.average) : "--"}</span>
                </div>
                </div>
                <div className={`mx-3 flex min-w-0 items-center justify-between gap-2 border-t pt-2 pb-2.5 text-[10px] tabular-nums ${isOptionEntryContext ? "border-violet-200/80" : isGridOpeningEntry ? "border-cyan-200/80" : entrySide === "long" ? "border-rose-200/80" : "border-emerald-200/80"}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 ${entrySideSummary.unrealized === null ? "text-slate-400" : entrySideSummary.unrealized >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      当前盈亏 {entrySideSummary.unrealized === null ? "--" : `${formatSigned(entrySideSummary.unrealized)} U`}
                    </span>
                    <span className="shrink-0 text-slate-500">当前 {activeOpenedTradeList.length} 笔</span>
                  </div>
                  {settledOpenedTradeSummary.count > 0 && <button
                    type="button"
                    onClick={() => setShowSettledOpeningHistory((current) => !current)}
                    aria-expanded={showSettledOpeningHistory}
                    className="flex shrink-0 items-center gap-1 whitespace-nowrap text-slate-500 transition active:opacity-60"
                  >
                    <span>历史平仓 {settledOpenedTradeSummary.count} 笔</span>
                    <span className={`font-semibold ${settledOpenedTradeSummary.realizedNet > 0 ? "text-rose-600" : settledOpenedTradeSummary.realizedNet < 0 ? "text-emerald-600" : "text-slate-600"}`}>
                      {formatSigned(settledOpenedTradeSummary.realizedNet)} U
                    </span>
                    <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showSettledOpeningHistory ? "rotate-90" : ""}`} />
                  </button>}
                </div>
                </div>
                {!isEditingEntry && settledOpenedTradeRows.length > 0 && (
                  <div className="space-y-1.5 border-t border-slate-200 bg-white/70 px-3 py-3">
                    {settledOpenedTradeRows.map(renderOpenedTradeRow)}
                  </div>
                )}

              {isClosingEntry && closingSourceTrade && (
                <div className="flex items-center justify-between gap-3 rounded border border-indigo-200 bg-indigo-50/70 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-indigo-600">当前选择的开仓订单</div>
                    <div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-slate-800">
                      {ACTIONS[closingSourceTrade.action].label} {formatQuantity(closingSourceTrade.quantity)} ETH @ {formatPrice(closingSourceTrade.price)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isCloseReview}
                    onClick={backToOrderList}
                    className="h-8 shrink-0 rounded border border-indigo-200 bg-white px-2.5 text-[11px] font-semibold text-indigo-700 active:scale-[0.98] disabled:opacity-40"
                  >
                    重选订单
                  </button>
                </div>
              )}
              </div>

              {!isEditingEntry && <div className="space-y-1.5">
                  {activeOpenedTradeRows.length === 0 && (
                    <div className="rounded border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">当前档位没有未平仓主单</div>
                  )}
                  {activeOpenedTradeRows.map(renderOpenedTradeRow)}
              </div>}

              {canManage && <>
              <div className="grid grid-cols-1 gap-3">
                {isEditingEntry && (
                  <div className="rounded border border-indigo-200 bg-indigo-50/70 px-3 py-2.5">
                    <div className="text-xs font-semibold text-indigo-800">{isFullyClosedOpeningEdit ? "本笔开仓已全部平仓" : isPartiallyClosedOpeningEdit ? "正在编辑本笔剩余仓位" : "正在编辑本笔开仓"}</div>
                    <div className="mt-1 text-sm font-semibold tabular-nums text-slate-800">
                      {ACTIONS[entryForm.action].label} {formatQuantity(Number(entryForm.quantity))} ETH @ {formatPrice(Number(entryForm.price))}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-indigo-700/80">
                      {isFullyClosedOpeningEdit && editingOriginalTrade
                        ? `原始 ${formatQuantity(editingOriginalTrade.quantity)} ETH 已全部平仓；关联历史不可编辑。`
                        : isPartiallyClosedOpeningEdit && editingOriginalTrade && editingRemainingQuantity !== null
                        ? `原始 ${formatQuantity(editingOriginalTrade.quantity)} ETH，已平 ${formatQuantity(editingOriginalTrade.quantity - editingRemainingQuantity)} ETH；当前可管理剩余 ${formatQuantity(editingRemainingQuantity)} ETH 的锁定、止盈或收益分配。`
                        : isEditingPendingOpening
                          ? "挂单按钮已选中；取消选中后，点击底部“保存修改”才会按当前成交价确认成交。"
                          : isPendingFillConfirmationQueued
                            ? "已取消挂单选择；点击底部“保存修改”后，将按当前成交价确认成交并计入仓位。"
                          : "请直接修改下方字段，完成后点击底部“保存修改”。"}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] gap-3 items-start">
                  <Field label={<span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800">{isFullyClosedOpeningEdit ? "已全部平仓（ETH）" : isPartiallyClosedOpeningEdit ? "剩余可操作（ETH）" : "数量（ETH）"}{isOptionOpeningEntry && <span className="text-rose-500">*</span>}{ACTIONS[entryForm.action].opening && entryForm.isPending && <span className="text-[10px] font-bold text-sky-600">挂单</span>}</span>}>
                    <div className="relative">
                      <input
                        inputMode="decimal"
                        maxLength={7}
                        disabled={isCloseReview || hasDependentCloseOpeningEdit}
                        aria-invalid={Boolean(quantityFormatError)}
                        value={entryForm.quantity}
                        onChange={(event) => setEntryForm((current) => ({ ...current, quantity: event.target.value }))}
                        onBlur={() => setEntryForm((current) => ({ ...current, quantity: normalizeEthQuantity(current.quantity) }))}
                        placeholder="0.00"
                        className={`h-14 w-full rounded border px-3 pr-[8.9rem] text-xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50 ${quantityFormatError ? "border-rose-400 bg-rose-50 focus:border-rose-500" : "border-slate-200 focus:border-indigo-500"}`}
                      />
                      {ACTIONS[entryForm.action].opening && <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                        <button
                          type="button"
                          disabled={isCloseReview || entryForm.isPending || isFullyClosedOpeningEdit}
                          aria-pressed={entryForm.isLocked}
                          aria-label={entryForm.isPending ? "挂单不可锁定" : entryForm.isLocked ? "解除本笔开仓锁定" : "锁定本笔开仓"}
                          title={entryForm.isPending ? "挂单不可锁定；成交后才可设为锁定" : entryForm.isLocked ? "已锁定，点击解除" : "未锁定，点击锁定"}
                          onClick={() => setEntryForm((current) => ({ ...current, isLocked: !current.isLocked }))}
                          className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isLocked ? "border-[#c9a84c]/75 bg-[#141414] text-[#f5d78e] shadow-[inset_0_1px_0_rgba(245,215,142,0.16),inset_0_-1px_0_rgba(0,0,0,0.7)]" : "border-slate-300 bg-slate-50 text-slate-500"}`}
                        >
                          {entryForm.isLocked ? <Lock className="h-4 w-4" strokeWidth={2.3} /> : <LockOpen className="h-4 w-4" strokeWidth={2.3} />}
                        </button>
                        {(!isEditingEntry || isEditingOriginalPendingOpening) && <button
                          type="button"
                          disabled={isCloseReview || entryForm.instrumentType === "option" || entryForm.instrumentType === "grid"}
                          aria-pressed={entryForm.isPending}
                          aria-label={entryForm.instrumentType === "grid" ? "网格参数仅作策略记录，不支持挂单自动成交" : entryForm.instrumentType === "option" ? "期权订单仅支持直接成交" : entryForm.isPending ? isEditingOriginalPendingOpening ? "取消挂单选择，保存时确认成交" : "取消本笔开仓挂单，改为直接成交" : isEditingOriginalPendingOpening ? "恢复挂单选择" : "设为本笔开仓挂单"}
                          title={entryForm.instrumentType === "grid" ? "网格参数仅作策略记录，不支持挂单自动成交" : entryForm.instrumentType === "option" ? "期权订单仅支持直接成交" : entryForm.isPending ? isEditingOriginalPendingOpening ? "挂单已选中；取消后需点击保存修改才确认成交" : "挂单中，点击改为直接成交" : isEditingOriginalPendingOpening ? "已取消挂单选择；点击可恢复挂单" : "直接成交，点击改为挂单"}
                          onClick={() => setEntryForm((current) => ({
                            ...current,
                            isPending: !current.isPending,
                            // 挂单成交前不允许锁定；改为挂单时立即解除已有锁定标记。
                            isLocked: current.isPending ? current.isLocked : false,
                          }))}
                          className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isPending ? "border-sky-500/75 bg-sky-50 text-sky-600" : "border-slate-300 bg-slate-50 text-slate-500"}`}
                        >
                          <Clock3 className="h-4 w-4" strokeWidth={2.3} />
                        </button>}
                        {isTakeProfitAvailable && <button
                          type="button"
                          disabled={isCloseReview || isFullyClosedOpeningEdit}
                          aria-pressed={entryForm.isTakeProfit}
                          aria-label={entryForm.isTakeProfit ? "关闭本笔开仓止盈" : "设置本笔开仓止盈"}
                          title={entryForm.isTakeProfit ? "止盈已开启，点击关闭" : "设置止盈价与止盈数量"}
                          onClick={() => setEntryForm((current) => ({
                            ...current,
                            isTakeProfit: !current.isTakeProfit,
                            takeProfitPrice: current.isTakeProfit ? "" : current.takeProfitPrice,
                            takeProfitQuantity: current.isTakeProfit ? "" : (current.takeProfitQuantity || normalizeEthQuantity(current.quantity)),
                            takeProfitPlans: current.isTakeProfit ? [] : (current.takeProfitPlans.length > 0
                              ? current.takeProfitPlans
                              : [{ price: current.takeProfitPrice, quantity: normalizeEthQuantity(current.quantity) }]),
                          }))}
                          className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isTakeProfit ? "border-amber-500/80 bg-amber-500 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]" : "border-slate-300 bg-slate-50 text-slate-500"}`}
                        >
                          <Target className="h-4 w-4" strokeWidth={2.3} />
                        </button>}
                        <button
                          type="button"
                          disabled={isCloseReview || hasDependentCloseOpeningEdit}
                          aria-pressed={entryForm.isCounterparty}
                          aria-label={entryForm.isCounterparty ? "关闭管理员反向展示" : "开启管理员反向展示"}
                          title={entryForm.isCounterparty ? "管理员反向展示已开启，点击关闭" : "用户与管理员使用相反多空和损益展示"}
                          onClick={() => setEntryForm((current) => ({ ...current, isCounterparty: !current.isCounterparty }))}
                          className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isCounterparty ? "border-violet-500/80 bg-violet-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]" : "border-slate-300 bg-slate-50 text-slate-500"}`}
                        >
                          <Repeat2 className="h-4 w-4" strokeWidth={2.35} />
                        </button>
                      </div>}
                    </div>
                    {ACTIONS[entryForm.action].opening && entryForm.isCounterparty && <div className="mt-1.5 flex items-start gap-1.5 text-[10px] font-medium leading-4 text-violet-700"><Repeat2 className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.4} /><span>反向展示已开启：用户保持本单原始多空与损益；管理员按相反数字展示。关闭后订单保留并立即恢复普通展示。</span></div>}
                    {isPartiallyClosedOpeningEdit && editingOriginalTrade && editingRemainingQuantity !== null && !entryForm.isPending && (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[10px] font-medium leading-4 text-amber-700">
                        <Lock className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.4} />
                        <span>本单已平 {formatQuantity(editingOriginalTrade.quantity - editingRemainingQuantity)} ETH；数量由剩余仓位决定。锁定与止盈都只作用于剩余 {formatQuantity(editingRemainingQuantity)} ETH，不影响已平部分。</span>
                      </div>
                    )}
                    {quantityFormatError && <div className="mt-1.5 text-[10px] font-medium leading-4 text-rose-600">{quantityFormatError}</div>}
                  </Field>

                  <Field label={
                    <span className="inline-flex whitespace-nowrap text-sm font-semibold text-slate-800">
                      {ACTIONS[entryForm.action].opening ? isOptionOpeningEntry ? "行权价" : isGridOpeningEntry ? "网格参考价" : "成交价" : "平仓价"}{(isOptionOpeningEntry || isGridOpeningEntry) && <span className="text-rose-500">*</span>}
                    </span>
                  }>
                    {isOptionOpeningEntry ? (
                      <select
                        disabled={isCloseReview || hasDependentCloseOpeningEdit || !t0OptionDeribitLabel || t0OptionStrikesQuery.isLoading}
                        value={entryForm.price}
                        onChange={(event) => setEntryForm((current) => ({ ...current, price: event.target.value }))}
                        className="h-14 w-full rounded border border-violet-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                      >
                        <option value="">
                          {!t0OptionDeribitLabel
                            ? "请先选择到期日"
                            : t0OptionStrikesQuery.isLoading
                              ? "Deribit 行权价加载中…"
                              : "请选择行权价"}
                        </option>
                        {!t0OptionDeribitLabel && entryForm.price && <option value={entryForm.price}>当前：{formatPrice(Number(entryForm.price))}</option>}
                        {t0OptionStrikes.map((strike) => <option key={strike} value={String(strike)}>{strike.toLocaleString()}</option>)}
                      </select>
                    ) : isGridOpeningEntry ? <input
                      readOnly
                      value={gridReferencePrice === null ? "" : formatPrice(gridReferencePrice)}
                      placeholder={entryForm.gridDirection === "long" ? "填写网格下限后生成" : "填写网格上限后生成"}
                      className="h-14 w-full rounded border border-cyan-200 bg-cyan-50/70 px-3 text-xl font-semibold tabular-nums text-cyan-950 outline-none placeholder:text-cyan-500/65"
                    /> : <input
                      inputMode="decimal"
                      disabled={isCloseReview || hasDependentCloseOpeningEdit}
                      value={entryForm.price}
                      onChange={(event) => setEntryForm((current) => ({ ...current, price: event.target.value }))}
                      placeholder="0.00"
                      className="min-w-0 w-full h-14 rounded border border-slate-200 px-2.5 text-[19px] font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                    />}
                    {!isOptionOpeningEntry && openingArchivePrice !== null && (
                      <div className={`mt-1.5 text-[10px] tabular-nums ${ACTIONS[entryForm.action].side === "long" ? "text-rose-600" : "text-emerald-600"}`}>
                        {isGridOpeningEntry
                          ? `${entryForm.gridDirection === "long" ? "做多下限" : "做空上限"}自动归档至 ${formatPrice(openingArchivePrice)} 档`
                          : `${ACTIONS[entryForm.action].side === "long" ? "向上归档" : "向下归档"}至 ${formatPrice(openingArchivePrice)} 档`}
                      </div>
                    )}
                  </Field>
                </div>

                {isClosingEntry && <div className="-mt-1 grid grid-cols-8 gap-1" aria-label="按可平数量选择百分比">
                  {[10, 20, 25, 30, 33, 50, 75, 100].map((percentage) => {
                    const amount = percentage === 100
                      ? closingAvailableQuantity
                      : Number((closingAvailableQuantity * percentage / 100).toFixed(2));
                    const isActive = amount > 0 && Math.abs(Number(entryForm.quantity) - amount) < 0.0000001;
                    return (
                      <button
                        key={percentage}
                        type="button"
                        disabled={isCloseReview || amount <= 0}
                        onClick={() => setEntryForm((current) => ({ ...current, quantity: normalizeEthQuantity(String(amount)) }))}
                        className={`h-7 min-w-0 rounded border px-0.5 text-[10px] font-semibold tabular-nums transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${isActive ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                        aria-label={`平仓可用数量的 ${percentage}%`}
                      >
                        {percentage}%
                      </button>
                    );
                  })}
                </div>}

                {!isClosingEntry && <div className="-mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] text-slate-400">数量快选</span>
                  {quantityQuickOptions.map((value) => {
                    const isActive = entryForm.quantity === value;
                    const displayValue = isActive ? value : formatQuantityQuickOption(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={isCloseReview || hasDependentCloseOpeningEdit}
                        onClick={() => setEntryForm((current) => ({ ...current, quantity: normalizeEthQuantity(value) }))}
                        className={`h-7 rounded border px-2 text-[11px] font-medium tabular-nums transition active:scale-95 ${isActive ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        {displayValue}
                      </button>
                    );
                  })}
                </div>}

                {ACTIONS[entryForm.action].opening && <div className="-mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[11px] text-slate-400">类型</span>
                  {T0_INSTRUMENT_TYPES.map((instrument) => {
                    const isActive = entryForm.instrumentType === instrument.value;
                    return (
                      <button
                        key={instrument.value}
                        type="button"
                        disabled={isCloseReview || hasDependentCloseOpeningEdit}
                        onClick={() => {
                          if (instrument.value === "option" && !entryForm.editingEntryId) {
                            setEntrySide(getOptionLadderSide(entryForm.optionDirection));
                          }
                          if (instrument.value === "grid" && !entryForm.editingEntryId) {
                            setEntrySide(entryForm.gridDirection === "long" ? "long" : "short");
                          }
                          setEntryForm((current) => {
                            if (instrument.value === "option") {
                              const isNewOption = current.instrumentType !== "option";
                              return {
                                ...current,
                                action: current.editingEntryId ? current.action : getOptionOpeningAction(current.optionDirection),
                                instrumentType: "option",
                                isPending: false,
                                isTakeProfit: false,
                                takeProfitPrice: "",
                                takeProfitQuantity: "",
                                takeProfitPlans: [],
                                optionExpiryDate: isNewOption ? "" : current.optionExpiryDate,
                                optionPremium: isNewOption ? "" : current.optionPremium,
                                price: isNewOption ? "" : current.price,
                              };
                            }
                            if (instrument.value === "grid") {
                              return {
                                ...current,
                                action: current.editingEntryId ? current.action : current.gridDirection === "long" ? "openLong" : "openShort",
                                instrumentType: "grid",
                                isPending: false,
                                isTakeProfit: false,
                                takeProfitPrice: "",
                                takeProfitQuantity: "",
                                takeProfitPlans: [],
                                price: "",
                              };
                            }
                            return { ...current, instrumentType: instrument.value };
                          });
                        }}
                        className={`h-7 rounded border px-3 text-[11px] font-medium transition active:scale-95 ${isActive ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                        aria-pressed={isActive}
                      >
                        {instrument.label}
                      </button>
                    );
                  })}
                </div>}

                {isTakeProfitAvailable && entryForm.isTakeProfit && <div className="-mt-0.5 rounded border border-amber-200 bg-amber-50/65 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-900"><Target className="h-3.5 w-3.5" strokeWidth={2.4} />分段止盈</span>
                    <span className="text-[10px] font-medium text-amber-700">{entryForm.isPending ? "先成交后触发" : "统一标记价触发"}</span>
                  </div>
                  <div className="space-y-2">
                    {entryForm.takeProfitPlans.map((plan, index) => (
                      <div key={`take-profit-plan-${index}`} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded border border-amber-200/80 bg-white/75 p-2">
                        <Field label={<span>止盈价 <span className="text-rose-500">*</span></span>}>
                          <input
                            inputMode="decimal"
                            disabled={isCloseReview || isFullyClosedOpeningEdit}
                            value={plan.price}
                            onChange={(event) => setEntryForm((current) => ({ ...current, takeProfitPlans: current.takeProfitPlans.map((item, planIndex) => planIndex === index ? { ...item, price: event.target.value } : item) }))}
                            placeholder={ACTIONS[entryForm.action].side === "long" ? "高于成交价" : "低于成交价"}
                            className="h-10 w-full rounded border border-amber-200 bg-white px-2.5 text-sm font-semibold tabular-nums text-slate-900 outline-none placeholder:text-amber-600/50 focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                          />
                        </Field>
                        <Field label={<span>数量（ETH） <span className="text-rose-500">*</span></span>}>
                          <input
                            inputMode="decimal"
                            maxLength={7}
                            disabled={isCloseReview || isFullyClosedOpeningEdit}
                            value={plan.quantity}
                            onChange={(event) => setEntryForm((current) => ({ ...current, takeProfitPlans: current.takeProfitPlans.map((item, planIndex) => planIndex === index ? { ...item, quantity: event.target.value } : item) }))}
                            onBlur={() => setEntryForm((current) => ({ ...current, takeProfitPlans: current.takeProfitPlans.map((item, planIndex) => planIndex === index ? { ...item, quantity: normalizeEthQuantity(item.quantity) } : item) }))}
                            placeholder="部分数量"
                            className="h-10 w-full rounded border border-amber-200 bg-white px-2.5 text-sm font-semibold tabular-nums text-slate-900 outline-none placeholder:text-amber-600/50 focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                          />
                        </Field>
                        <button
                          type="button"
                          disabled={isCloseReview || isFullyClosedOpeningEdit || entryForm.takeProfitPlans.length <= 1}
                          onClick={() => setEntryForm((current) => ({ ...current, takeProfitPlans: current.takeProfitPlans.filter((_, planIndex) => planIndex !== index) }))}
                          className="mb-px flex h-10 w-10 items-center justify-center rounded border border-amber-200 bg-amber-50 text-amber-700 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                          aria-label={`删除第 ${index + 1} 段止盈`}
                          title="删除本段止盈"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={isCloseReview || isFullyClosedOpeningEdit || entryForm.takeProfitPlans.length >= 20}
                      onClick={() => setEntryForm((current) => ({ ...current, takeProfitPlans: [...current.takeProfitPlans, { price: "", quantity: "" }] }))}
                      className="inline-flex h-8 items-center gap-1 rounded border border-amber-300 bg-white px-2.5 text-[11px] font-semibold text-amber-800 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />添加一段
                    </button>
                    <span className="text-right text-[10px] leading-4 text-amber-800">合计 {formatQuantity(entryForm.takeProfitPlans.reduce((total, plan) => total + (Number(plan.quantity) || 0), 0))} / {formatQuantity(Number(entryForm.quantity) || 0)} ETH</span>
                  </div>
                  <div className="mt-2 text-[10px] leading-4 text-amber-800">
                    {ACTIONS[entryForm.action].side === "long" ? "多单在标记价达到或高于对应止盈价时，按该段数量自动平仓。" : "空单在标记价达到或低于对应止盈价时，按该段数量自动平仓。"} 可设置多段；所有未触发段落合计不得超过本笔可用数量，锁定状态下会等待解锁后触发。
                  </div>
                </div>}

                {isOptionOpeningEntry && <fieldset disabled={isCloseReview || hasDependentCloseOpeningEdit} className="contents">
                  <div className="-mt-0.5 rounded border border-violet-200 bg-violet-50/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-violet-800">期权参数</span>
                    <span className="text-[10px] font-medium text-violet-600">标的固定 ETH · Deribit</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={<span>方向 <span className="text-rose-500">*</span></span>}>
                      <div className="grid grid-cols-2 gap-1.5">
                        {T0_OPTION_DIRECTIONS.map((option) => {
                          const active = entryForm.optionDirection === option.value;
                          return <button
                            key={option.value}
                            type="button"
                            disabled={isCloseReview}
                            onClick={() => {
                              if (!entryForm.editingEntryId) setEntrySide(getOptionLadderSide(option.value));
                              setEntryForm((current) => ({
                                ...current,
                                action: current.editingEntryId ? current.action : getOptionOpeningAction(option.value),
                                optionDirection: option.value,
                              }));
                            }}
                            className={`h-11 rounded border px-1 text-[11px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${active ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white text-slate-600"}`}
                            aria-pressed={active}
                          >{option.label}</button>;
                        })}
                      </div>
                    </Field>
                    <Field label={<span>到期日 <span className="text-rose-500">*</span></span>}>
                      <select
                        disabled={isCloseReview || t0OptionExpiriesQuery.isLoading}
                        value={t0OptionDeribitLabel}
                        onChange={(event) => {
                          const nextExpiry = t0OptionExpiries.find((expiry) => expiry.deribitLabel === event.target.value);
                          if (!nextExpiry) return;
                          setEntryForm((current) => ({
                            ...current,
                            optionExpiryDate: new Date(nextExpiry.ts).toISOString().slice(0, 10),
                            price: "",
                          }));
                        }}
                        className="h-11 w-full rounded border border-violet-200 bg-white px-2 text-xs font-medium tabular-nums text-slate-800 outline-none focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                      >
                        <option value="">
                          {t0OptionExpiriesQuery.isLoading
                            ? "Deribit 到期日加载中…"
                            : entryForm.optionExpiryDate
                              ? `当前：${entryForm.optionExpiryDate}`
                              : "请选择到期日"}
                        </option>
                        {t0OptionExpiries.map((expiry) => (
                          <option key={expiry.deribitLabel} value={expiry.deribitLabel}>
                            {expiry.dateStr || expiry.deribitLabel}（{expiry.diffDays > 0 ? `余${expiry.diffDays}天` : "即将到期"}）
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={<span>权利金 <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="decimal"
                        disabled={isCloseReview}
                        value={entryForm.optionPremium}
                        onChange={(event) => setEntryForm((current) => ({ ...current, optionPremium: event.target.value }))}
                        placeholder="0.00"
                        className="h-11 w-full rounded border border-violet-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                    <Field label={<span>权利金计价 <span className="text-rose-500">*</span></span>}>
                      <div className="grid h-11 grid-cols-2 overflow-hidden rounded border border-violet-200 bg-white">
                        {(["USDT", "ETH"] as T0OptionPremiumCurrency[]).map((currency) => {
                          const active = entryForm.optionPremiumCurrency === currency;
                          return <button
                            key={currency}
                            type="button"
                            disabled={isCloseReview}
                            onClick={() => setEntryForm((current) => ({ ...current, optionPremiumCurrency: currency }))}
                            className={`text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-violet-600 text-white" : "text-slate-600"}`}
                          >{currency}</button>;
                        })}
                      </div>
                    </Field>
                  </div>
                  <div className={`mt-2 text-[10px] font-medium leading-4 ${optionFormValidationMessage ? "text-rose-600" : "text-violet-700"}`}>
                    {optionFormValidationMessage ?? "期权参数已完整，可保存。"}
                  </div>
                  </div>
                </fieldset>}

                {isGridOpeningEntry && <fieldset disabled={isCloseReview || hasDependentCloseOpeningEdit} className="contents">
                  <div className="-mt-0.5 rounded border border-cyan-200 bg-cyan-50/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-cyan-900">网格参数</span>
                    <span className="text-[10px] font-medium text-cyan-700">做多取下限归左 · 做空取上限归右</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={<span>方向 <span className="text-rose-500">*</span></span>}>
                      <div className="grid h-11 grid-cols-2 overflow-hidden rounded border border-cyan-200 bg-white">
                        {T0_GRID_DIRECTIONS.map((direction) => {
                          const active = entryForm.gridDirection === direction.value;
                          const wouldChangeSide = entryForm.editingEntryId && entryForm.action !== (direction.value === "long" ? "openLong" : "openShort");
                          return <button
                            key={direction.value}
                            type="button"
                            disabled={Boolean(isCloseReview || wouldChangeSide)}
                            title={wouldChangeSide ? "编辑时不能跨越报价侧，请新建该方向网格" : undefined}
                            onClick={() => {
                              if (!entryForm.editingEntryId) setEntrySide(direction.value === "long" ? "long" : "short");
                              setEntryForm((current) => ({
                                ...current,
                                action: current.editingEntryId ? current.action : direction.value === "long" ? "openLong" : "openShort",
                                gridDirection: direction.value,
                                isPending: false,
                              }));
                            }}
                            className={`text-[11px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-cyan-700 text-white" : "text-slate-600"}`}
                            aria-pressed={active}
                          >{direction.label}</button>;
                        })}
                      </div>
                    </Field>
                    <Field label={<span>杠杆倍数 <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="decimal"
                        disabled={isCloseReview}
                        value={entryForm.gridLeverage}
                        onChange={(event) => setEntryForm((current) => ({ ...current, gridLeverage: event.target.value }))}
                        placeholder="例如 3"
                        className="h-11 w-full rounded border border-cyan-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                    <Field label={<span>{entryForm.gridDirection === "long" ? "区间下限" : "区间上限"} <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="decimal"
                        disabled={isCloseReview}
                        value={entryForm.gridDirection === "long" ? entryForm.gridRangeMin : entryForm.gridRangeMax}
                        onChange={(event) => setEntryForm((current) => entryForm.gridDirection === "long"
                          ? { ...current, gridRangeMin: event.target.value }
                          : { ...current, gridRangeMax: event.target.value })}
                        placeholder={entryForm.gridDirection === "long" ? "例如 2200" : "例如 2900"}
                        className="h-11 w-full rounded border border-cyan-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                    <Field label={<span>{entryForm.gridDirection === "long" ? "区间上限" : "区间下限"} <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="decimal"
                        disabled={isCloseReview}
                        value={entryForm.gridDirection === "long" ? entryForm.gridRangeMax : entryForm.gridRangeMin}
                        onChange={(event) => setEntryForm((current) => entryForm.gridDirection === "long"
                          ? { ...current, gridRangeMax: event.target.value }
                          : { ...current, gridRangeMin: event.target.value })}
                        placeholder={entryForm.gridDirection === "long" ? "例如 2700" : "例如 2400"}
                        className="h-11 w-full rounded border border-cyan-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                    <Field label={<span>网格数量 <span className="text-rose-500">*</span></span>}>
                      <input
                        inputMode="numeric"
                        disabled={isCloseReview}
                        value={entryForm.gridCount}
                        onChange={(event) => setEntryForm((current) => ({ ...current, gridCount: event.target.value.replace(/[^0-9]/g, "") }))}
                        placeholder="例如 20"
                        className="h-11 w-full rounded border border-cyan-200 bg-white px-3 text-base font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-600 disabled:cursor-not-allowed disabled:bg-slate-50"
                      />
                    </Field>
                  </div>
                  <div className={`mt-2 text-[10px] font-medium leading-4 ${gridFormValidationMessage ? "text-rose-600" : "text-cyan-800"}`}>
                    {gridFormValidationMessage ?? (entryForm.gridDirection === "long" ? "做多网格将按区间下限放入左侧报价。" : "做空网格将按区间上限放入右侧报价。")}
                  </div>
                  </div>
                </fieldset>}

                {isClosingEntry ? (
                  <>
                    <div className="grid grid-cols-3 gap-2" aria-label="继承自开仓单的账户用户和项目">
                      <div title={entryForm.accountName || "未关联账户"} className="flex h-10 min-w-0 items-center truncate rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600">
                        {entryForm.accountName || "未关联账户"}
                      </div>
                      <div title={entryForm.relatedUserName || entryForm.relatedUsername || "未关联用户"} className="flex h-10 min-w-0 items-center truncate rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600">
                        {entryForm.relatedUserName || entryForm.relatedUsername || "未关联用户"}
                      </div>
                      <div title={entryForm.relatedFundName || (entryForm.relatedFundId === "legacy" ? "未区分项目" : "未关联项目")} className="flex h-10 min-w-0 items-center truncate rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600">
                        {entryForm.relatedFundName || (entryForm.relatedFundId === "legacy" ? "未区分项目" : "未关联项目")}
                      </div>
                    </div>
                    <Field label="备注（可选）">
                      <input
                        disabled={isCloseReview}
                        value={entryForm.note}
                        onChange={(event) => setEntryForm((current) => ({ ...current, note: event.target.value }))}
                        placeholder="不填则不生成默认备注"
                        className="w-full h-11 rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                      />
                    </Field>
                  </>
                ) : <>
                <div className="grid grid-cols-[minmax(6.75rem,0.7fr)_minmax(0,1.3fr)] items-start gap-3">
                  <Field label={<span className="flex items-center justify-between gap-1"><span>下单账户 <span className="text-rose-500">*</span></span>{accounts.length > 0 && !isClosingEntry && !hasDependentCloseOpeningEdit && <button type="button" onClick={() => openDirectoryManager("account")} className="shrink-0 text-[11px] font-semibold text-indigo-600 active:opacity-70">管理</button>}</span>}>
                    {accounts.length > 0 ? (
                      <select
                        disabled={isAccountSelectionLocked || hasDependentCloseOpeningEdit}
                        value={entryForm.accountId}
                        onChange={(event) => {
                          if (event.target.value === "__manage_accounts__") {
                            openDirectoryManager("account");
                            return;
                          }
                          selectOrderAccount(event.target.value);
                        }}
                        className="h-11 w-full rounded border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        <option value="">新建账户</option>
                        <option value="__manage_accounts__">编辑 / 删除账户…</option>
                        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                      </select>
                    ) : null}
                    {!entryForm.accountId && (
                      <input
                        disabled={isAccountSelectionLocked || hasDependentCloseOpeningEdit}
                        value={entryForm.accountName}
                        onChange={(event) => setEntryForm((current) => ({ ...current, accountName: event.target.value }))}
                        placeholder="新账户名称"
                        className="mt-2 h-11 w-full rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                      />
                    )}
                  </Field>

                  <Field label={<span className="flex items-center justify-between gap-1"><span>关联用户</span><span className="flex shrink-0 items-center gap-2">{recentRelatedUsers.length > 0 && !isClosingEntry && !hasDependentCloseOpeningEdit && <button type="button" onClick={() => openDirectoryManager("relatedUser")} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">管理</button>}</span></span>}>
                    <div className={`flex h-11 w-full overflow-hidden rounded border text-sm outline-none transition ${isCloseAssociationLocked || hasDependentCloseOpeningEdit ? "border-slate-200 bg-slate-50 text-slate-500" : entryForm.relatedUserId ? "border-indigo-200 bg-indigo-50/60 text-slate-800" : "border-slate-200 bg-white text-slate-400"}`}>
                      <select
                        disabled={isCloseAssociationLocked || hasDependentCloseOpeningEdit}
                        value={entryForm.relatedUserId}
                        onChange={(event) => {
                          const userId = event.target.value;
                          if (userId === "__manage_related_users__") {
                            openDirectoryManager("relatedUser");
                            return;
                          }
                          setRelatedUserPickerOpen(false);
                          setRelatedUserSearch("");
                          if (!userId) {
                            clearRelatedUser();
                            return;
                          }
                          const user = entryRelatedUserOptions.find((item) => item.id === userId);
                          if (user) selectRelatedUser(user);
                        }}
                        aria-label="选择已有订单关联用户"
                        className="h-full min-w-0 flex-1 appearance-auto bg-transparent px-3 text-sm font-medium outline-none disabled:cursor-not-allowed"
                      >
                        <option value="">暂不关联</option>
                        {recentRelatedUsers.length > 0 && <option value="__manage_related_users__">编辑 / 删除关联用户…</option>}
                        {entryRelatedUserOptions.map((user) => <option key={user.id} value={user.id}>{user.name}{user.username ? ` · @${user.username}` : ""}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={isCloseAssociationLocked || hasDependentCloseOpeningEdit}
	                        aria-label="搜索并添加未在订单中出现过的关联用户"
	                        title="搜索全局用户并添加"
	                        onClick={() => {
	                          setRelatedUserQuickPickerOpen(false);
	                          setRelatedUserSearch("");
	                          setRelatedUserPickerOpen(true);
	                        }}
	                        className="flex w-10 shrink-0 items-center justify-center border-l border-slate-200/80 text-slate-400 transition active:bg-indigo-100/60 active:text-indigo-600 disabled:opacity-40"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                    </div>
                  </Field>
                </div>

	                {relatedUserPickerOpen && (
	                  <div className="overflow-hidden rounded border border-indigo-100 bg-white shadow-sm">
	                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
	                      <Search className="h-4 w-4 shrink-0 text-indigo-500" />
	                      <input
	                        autoFocus
	                        value={relatedUserSearch}
	                        onChange={(event) => setRelatedUserSearch(event.target.value)}
	                        placeholder="搜索全局用户并添加"
	                        className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
	                      />
	                      <button
	                        type="button"
	                        onClick={() => {
	                          setRelatedUserPickerOpen(false);
	                          setRelatedUserSearch("");
	                        }}
	                        aria-label="关闭关联用户搜索"
	                        className="rounded p-0.5 text-slate-400 active:scale-90"
	                      >
	                        <X className="h-4 w-4" />
	                      </button>
	                    </div>
	                    {relatedUserSearch.trim().length === 0 ? (
	                      <div className="px-3 py-4 text-center text-xs text-slate-400">输入用户名或昵称，添加此前未在本账本订单出现过的用户</div>
	                    ) : relatedUserSearchQuery.isFetching ? (
	                      <div className="px-3 py-4 text-center text-xs text-slate-400">正在搜索全局用户…</div>
	                    ) : Array.isArray(relatedUserSearchQuery.data) && relatedUserSearchQuery.data.length > 0 ? (
	                      <div className="max-h-56 overflow-y-auto py-1">
	                        {(relatedUserSearchQuery.data as any[]).map((candidate) => {
	                          const user: PreviewRelatedUser = {
	                            id: String(candidate.id),
	                            name: String(candidate.name || candidate.username || `用户#${candidate.id}`),
	                            username: candidate.username ? String(candidate.username) : undefined,
	                            avatar: candidate.avatar ? String(candidate.avatar) : undefined,
	                          };
	                          const isNewToJournal = !recentRelatedUsers.some((existing) => existing.id === user.id);
	                          return (
	                            <button
	                              key={user.id}
	                              type="button"
	                              onClick={() => selectRelatedUser(user)}
	                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-indigo-50"
	                            >
	                              <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
	                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{user.name}</span>
	                              {isNewToJournal && <span className="shrink-0 text-[10px] font-semibold text-indigo-600">新增</span>}
	                              {user.username && <span className="max-w-[32%] truncate text-xs text-slate-400">@{user.username}</span>}
	                            </button>
	                          );
	                        })}
	                      </div>
	                    ) : (
	                      <div className="px-3 py-4 text-center text-xs text-slate-400">未找到匹配的全局用户</div>
	                    )}
	                  </div>
	                )}

                <div className="-mt-1 grid grid-cols-[minmax(6.75rem,0.7fr)_minmax(0,1.3fr)] gap-3 text-[10px] leading-4 text-slate-400">
                  <span>{hasDependentCloseOpeningEdit ? "已有平仓流水；账户、用户、项目、数量、价格、类型、备注与反向展示均保留审计，不可修改。" : isEditingEntry ? "可选择、新建或管理账户；保存前校验后续平仓并保留审计。" : "优先按关联用户记忆账户；无记录则保留当前账户。"}</span>
                  <span>仅搜索并引用全局已有用户；关联后按项目区分资金。</span>
                </div>

                <Field label={<span className="flex items-center justify-between gap-1"><span>项目 {entryForm.relatedUserId && <span className="text-rose-500">*</span>} {!entryForm.relatedUserId && <span className="text-slate-400">（请先选关联用户）</span>}</span><span className="flex shrink-0 items-center gap-2">{(entryForm.relatedFundId || entryForm.relatedFundName.trim()) && entryForm.relatedFundId !== "legacy" && !isClosingEntry && !isEditingEntry && <button type="button" onClick={() => { const fund = entryRelatedFunds.find((item) => item.id === entryForm.relatedFundId) ?? { id: "", name: entryForm.relatedFundName.trim(), relatedUserId: entryForm.relatedUserId || undefined }; if (fund.name) openProfitShareManager(fund); }} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">收益分配</button>}{isEditingEntry && !isClosingEntry && !entryForm.isPending && entryForm.relatedFundId && entryForm.relatedFundId !== "legacy" && <button type="button" onClick={openEntryProfitShareManager} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">本单分配</button>}{entryRelatedFunds.length > 0 && !isClosingEntry && !hasDependentCloseOpeningEdit && <button type="button" onClick={() => openDirectoryManager("relatedFund")} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">管理</button>}</span></span>}>
                  <select
                    disabled={!entryForm.relatedUserId || isCloseReview || isClosingEntry || hasDependentCloseOpeningEdit}
                    value={entryForm.relatedFundId}
                    onChange={(event) => {
                      if (event.target.value === "__manage_related_funds__") {
                        openDirectoryManager("relatedFund");
                        return;
                      }
                      selectRelatedFund(event.target.value);
                    }}
                    className="h-11 w-full rounded border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">新建专项款</option>
                    {entryRelatedFunds.length > 0 && <option value="__manage_related_funds__">编辑 / 删除项目…</option>}
                    {(isEditingEntry || isClosingEntry) && entryForm.relatedFundId === "legacy" && <option value="legacy">未区分专项款（历史）</option>}
                    {entryRelatedFunds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                  </select>
                  {entryForm.relatedUserId && entryForm.relatedFundId === "" && (
                    <input
                      disabled={isCloseReview || isClosingEntry || hasDependentCloseOpeningEdit}
                      value={entryForm.relatedFundName}
                      onChange={(event) => setEntryForm((current) => ({ ...current, relatedFundName: event.target.value }))}
                      placeholder="新专项款名称，例如：10月拼单"
                      className="mt-2 h-11 w-full rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50"
                    />
                  )}
                  {entryForm.relatedFundId === "legacy" && (
                    <div className="mt-1.5 text-[10px] leading-4 text-amber-700">这是功能上线前的未区分专项款记录；编辑时可改为该用户的专项款。</div>
                  )}
                </Field>

                <Field label="备注（可选）">
                  <input
                    disabled={isCloseReview || hasDependentCloseOpeningEdit}
                    value={entryForm.note}
                    onChange={(event) => setEntryForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder="不填则不生成默认备注"
                    className="w-full h-11 rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                  />
                </Field>
                </>}
              </div>
              </>}

            </div>
            {canManage && <div className={isMemberView
              ? "sticky bottom-0 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur"
              : "fixed inset-x-0 bottom-0 z-20 border-t border-slate-100 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur"
            }>
              {!isCloseReview && (
                <button
                  disabled={(isEditingEntry ? updateOpeningEntryMutation.isPending || (hasDependentCloseOpeningEdit && (!isPartiallyClosedOpeningEdit || (!hasPartialOpeningMarkerChange && !hasPartialTakeProfitChange))) : saveEntryMutation.isPending || (isClosingEntry && entryForm.targetPrice === undefined)) || Boolean(optionFormValidationMessage)}
                  onClick={() => handleSaveEntry(isPendingFillConfirmationQueued)}
                  className="w-full h-12 rounded bg-indigo-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40 active:scale-[0.99]"
                >
                  {isEditingEntry ? "保存修改" : isClosingEntry ? `确认${ACTIONS[entryForm.action].label}参数` : "快速保存并记账"}
                </button>
              )}
            </div>}
          </div>
        </div>
      )}

      {canManage && showEntrySheet && isClosingEntry && isCloseReview && (
        <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label={`确认${ACTIONS[entryForm.action].label}`}>
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t border border-amber-200 bg-white shadow-2xl sm:max-w-md sm:rounded">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-amber-800">确认平仓与共享收益</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">共享收益仅从本单管理员份额划拨，不影响订单关联用户的收益。</div>
                </div>
                <span className={`rounded px-2 py-1 text-[11px] font-semibold tabular-nums ${sharedIncomeClosePreview.sourceNetPnl > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  净收益 {sharedIncomeClosePreview.sourceNetPnl > 0 ? "+" : ""}{formatPrice(sharedIncomeClosePreview.sourceNetPnl)} U
                </span>
              </div>
              <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2.5">
                <div className="text-base font-semibold tabular-nums text-slate-900">
                  {ACTIONS[entryForm.action].label} {formatQuantity(Number(entryForm.quantity))} ETH @ {formatPrice(Number(entryForm.price))}
                </div>
                <div className="mt-1 text-[11px] leading-4 text-amber-800/85">对应开仓价 {entryForm.targetPrice === undefined ? "--" : formatPrice(entryForm.targetPrice)}；确认后立即写入速记流水。</div>
              </div>
            </div>
            {sharedIncomeClosePreview.managerPoolAmount > 0 && sharedIncomeClosePreview.sourceNetPnl > 0 ? <div className="px-4 py-3">
              <div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">共享收益建议</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">按已实现年化收益排序：计入投入、提现、平仓盈利与共享收益；不含持仓总盈亏。</div>
                </div>
                <div className="mt-2 grid grid-cols-3 divide-x divide-rose-100 overflow-hidden rounded border border-rose-100 bg-rose-50/70 text-center">
                  <div className="min-w-0 px-1.5 py-2">
                    <div className="whitespace-nowrap text-[10px] text-slate-500">本单全部收益</div>
                    <div className="mt-0.5 whitespace-nowrap text-[13px] font-bold tabular-nums text-rose-600">+{formatPrice(sharedIncomeClosePreview.sourceNetPnl)}<span className="ml-0.5 text-[10px] font-semibold">U</span></div>
                  </div>
                  <div className="min-w-0 px-1.5 py-2">
                    <div className="whitespace-nowrap text-[10px] text-slate-500">本单管理员可用</div>
                    <div className="mt-0.5 whitespace-nowrap text-[13px] font-bold tabular-nums text-rose-600">{formatPrice(sharedIncomeClosePreview.managerPoolAmount)}<span className="ml-0.5 text-[10px] font-semibold">U</span></div>
                  </div>
                  <div className="min-w-0 px-1.5 py-2">
                    <div className="whitespace-nowrap text-[10px] text-slate-500">可用占比</div>
                    <div className="mt-0.5 whitespace-nowrap text-[13px] font-bold tabular-nums text-rose-600">{formatPrice(sharedIncomeClosePreview.managerPoolAmount / sharedIncomeClosePreview.sourceNetPnl * 100)}<span className="ml-0.5 text-[10px] font-semibold">%</span></div>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => {
                  const recipients = sharedIncomeClosePreview.candidates.filter((candidate) => candidate.hasPrincipal).slice(0, Math.min(3, sharedIncomeClosePreview.candidates.filter((candidate) => candidate.hasPrincipal).length));
                  if (recipients.length === 0) return;
                  const base = Math.floor(sharedIncomeClosePreview.managerPoolAmount * 100 / recipients.length) / 100;
                  setSharedIncomeDrafts(Object.fromEntries(recipients.map((candidate, index) => [candidate.userId, (index === 0 ? sharedIncomeClosePreview.managerPoolAmount - base * (recipients.length - 1) : base).toFixed(2)])));
                  setSharedIncomeTargetSelections({});
                }} className="h-8 rounded border border-indigo-200 bg-indigo-50 px-2.5 text-[11px] font-semibold text-indigo-700 active:scale-[0.98]">智能均分</button>
                <button type="button" onClick={() => { setSharedIncomeDrafts({}); setSharedIncomeTargetSelections({}); }} className="h-8 rounded border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 active:scale-[0.98]">跳过共享</button>
                <span className={`ml-auto self-center whitespace-nowrap text-[10px] font-semibold tabular-nums ${sharedIncomeAllocatedTotal - sharedIncomeClosePreview.managerPoolAmount > 0.00001 ? "text-rose-600" : "text-slate-500"}`}>分配 {formatPrice(sharedIncomeAllocatedTotal)} · 留存 {formatPrice(Math.max(0, sharedIncomeClosePreview.managerPoolAmount - sharedIncomeAllocatedTotal))} U</span>
              </div>
              {sharedIncomeClosePreview.candidates.length > 0 ? <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded border border-slate-200">
                {sharedIncomeClosePreview.candidates.slice(0, 6).map((candidate) => {
                  const currentSharedIncomeDraft = Number(sharedIncomeDrafts[candidate.userId] ?? 0);
                  const currentSharedIncomeAmount = Number.isFinite(currentSharedIncomeDraft) ? Math.max(0, currentSharedIncomeDraft) : 0;
                  const displayedRealizedAnnualized = calculateT0Xirr([
                    ...candidate.realizedCashFlows,
                    { occurredOn: getBeijingDateInputValue(), amount: candidate.realizedTerminalValue + currentSharedIncomeAmount, atEndOfBeijingDay: true },
                  ]);
                  const allocationReservedForOthers = Math.max(0, sharedIncomeAllocatedTotal - currentSharedIncomeAmount);
                  const availableForCandidate = Math.max(0, sharedIncomeClosePreview.managerPoolAmount - allocationReservedForOthers);
                  const selectedTargetRate = sharedIncomeTargetSelections[candidate.userId];
                  const onePercentShareAmount = candidate.cumulativeDepositAmount * 0.01;
                  const canAllocateOnePercent = onePercentShareAmount > 0.004 && onePercentShareAmount <= availableForCandidate + 0.004;
                  const twoPercentShareAmount = candidate.cumulativeDepositAmount * 0.02;
                  const canAllocateTwoPercent = twoPercentShareAmount > 0.004 && twoPercentShareAmount <= availableForCandidate + 0.004;
                  const annualizedTargetOptions = [3.65, 1, 0.52, 1.04].map((targetRate) => ({
                    targetRate,
                    topUp: calculateT0XirrTargetTopUp(candidate.realizedCashFlows, candidate.realizedTerminalValue, targetRate),
                  }));
                  const settlementAgeDays = currentSharedIncomeAmount > 0 ? 0 : candidate.settlementAgeDays;
                  const settlementEnergyCells = settlementAgeDays === null ? 0 : Math.min(10, settlementAgeDays);
                  const settlementEnergyTone = settlementAgeDays === null || settlementAgeDays >= 8
                    ? "bg-rose-500"
                    : settlementAgeDays >= 6
                      ? "bg-orange-500"
                      : settlementAgeDays >= 4
                        ? "bg-amber-400"
                        : settlementAgeDays >= 3
                          ? "bg-lime-500"
                          : "bg-emerald-500";
                  const settlementEnergyLabel = settlementAgeDays === null ? "尚未盈利结算" : `${settlementAgeDays} 天未结算`;
                  return <div key={candidate.userId} className={`grid grid-cols-[minmax(0,1fr)_5.75rem] items-stretch gap-x-2 gap-y-1 px-2 py-2 ${candidate.hasPrincipal ? "" : "bg-slate-50/80 opacity-55"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-semibold text-slate-800">{candidate.name}{candidate.username ? <span className="ml-1 font-normal text-slate-500">@{candidate.username}</span> : null}</div>
                      <div className="mt-0.5 whitespace-nowrap text-[10px] text-slate-500">多 {formatQuantity(candidate.longQuantity)} ETH · 空 {formatQuantity(candidate.shortQuantity)} ETH · 本金 {candidate.hasPrincipal ? `${formatPrice(candidate.cumulativeDepositAmount)} U` : "未登记"}</div>
                      {candidate.hasPrincipal ? <>
                        <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-500">
                          <span>历史共享 <b className={candidate.receivedSharedIncome > 0 ? "font-semibold text-rose-600" : "font-semibold text-slate-500"}>{candidate.receivedSharedIncome > 0 ? "+" : ""}{candidate.receivedSharedIncome === 0 ? "0" : formatPrice(candidate.receivedSharedIncome)} U</b></span>
                          <span className="text-slate-300">·</span>
                          <span>本单共享 <b className={currentSharedIncomeAmount > 0 ? "font-semibold text-rose-600" : "font-semibold text-slate-500"}>{currentSharedIncomeAmount > 0 ? "+" : ""}{currentSharedIncomeAmount === 0 ? "0" : formatPrice(currentSharedIncomeAmount)} U</b></span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[10px] text-slate-500">
                          <span>已平仓总利润 <b className="font-semibold text-rose-600">+{formatPrice(candidate.closedNetPnl)} U</b></span>
                          <span className="text-slate-300">·</span>
                          <span>已实现年化 <b className={displayedRealizedAnnualized !== null && Number.isFinite(displayedRealizedAnnualized) ? (displayedRealizedAnnualized >= 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600") : "font-semibold text-slate-400"}>{displayedRealizedAnnualized === null || !Number.isFinite(displayedRealizedAnnualized) ? "--" : formatT0AnnualizedReturn(displayedRealizedAnnualized)}</b></span>
                        </div>
                        <div className="mt-0.5 whitespace-nowrap text-[10px] text-slate-500">持仓总盈亏 <b className={candidate.holdingNetPnl >= 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>{formatSigned(candidate.holdingNetPnl)} U</b></div>
                      </> : <div className="mt-0.5 text-[10px] text-slate-500">未投入本金，不参与共享收益分配</div>}
                    </div>
                    <div className="flex w-[92px] flex-col items-end justify-between gap-2 self-stretch">
                      {candidate.hasPrincipal && <div className="grid w-full grid-cols-2 gap-1">
                        {annualizedTargetOptions.map(({ targetRate, topUp }) => {
                          const hasAlreadyReachedTarget = candidate.annualizedReference !== null
                            && Number.isFinite(candidate.annualizedReference)
                            && candidate.annualizedReference >= targetRate - 0.000001;
                          const isAvailable = topUp !== null && !hasAlreadyReachedTarget && topUp <= availableForCandidate + 0.004;
                          const isSelectedTarget = selectedTargetRate === targetRate;
                          const isOtherTargetDimmed = selectedTargetRate !== undefined && !isSelectedTarget;
                          const targetLabel = `${Math.round(targetRate * 100)}%`;
                          return <button key={targetRate} type="button" aria-label={`目标年化 ${targetLabel}`} disabled={!isAvailable} title={topUp === null ? "缺少有效投入现金流，无法计算目标年化" : hasAlreadyReachedTarget ? `该用户历史已实现年化已达到 ${targetLabel}` : topUp > availableForCandidate + 0.004 ? `需要 ${formatPrice(topUp)} U，超过本次可用额度` : `补 ${formatPrice(topUp)} U 后达到 ${targetLabel} 年化`} onClick={() => {
                            if (!isAvailable || topUp === null) return;
                            setSharedIncomeTargetSelections((current) => ({ ...current, [candidate.userId]: targetRate }));
                            setSharedIncomeDrafts((current) => {
                              if (topUp <= 0.004) { const { [candidate.userId]: _removed, ...rest } = current; return rest; }
                              return { ...current, [candidate.userId]: topUp.toFixed(2) };
                            });
                          }} className={`h-5 rounded border text-[8px] font-semibold tabular-nums active:scale-[0.98] disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300 ${isSelectedTarget ? "border-indigo-600 bg-indigo-600 text-white" : isOtherTargetDimmed ? "border-slate-200 bg-slate-100 text-slate-400" : "border-indigo-200 bg-indigo-50 text-indigo-700"}`}>{targetLabel}</button>;
                        })}
                        <button type="button" disabled={!canAllocateOnePercent} title={canAllocateOnePercent ? `按该用户累计投入本金的 1% 分配，即 ${formatPrice(onePercentShareAmount)} U` : `剩余额度不足以分配 ${formatPrice(onePercentShareAmount)} U`} onClick={() => {
                          if (!canAllocateOnePercent) return;
                          setSharedIncomeTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; });
                          setSharedIncomeDrafts((current) => ({ ...current, [candidate.userId]: onePercentShareAmount.toFixed(2) }));
                        }} className="h-5 rounded border border-amber-200 bg-amber-50 text-[8px] font-semibold tabular-nums text-amber-700 active:scale-[0.98] disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300">1%</button>
                        <button type="button" disabled={!canAllocateTwoPercent} title={canAllocateTwoPercent ? `按该用户累计投入本金的 2% 分配，即 ${formatPrice(twoPercentShareAmount)} U` : `剩余额度不足以分配 ${formatPrice(twoPercentShareAmount)} U`} onClick={() => {
                          if (!canAllocateTwoPercent) return;
                          setSharedIncomeTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; });
                          setSharedIncomeDrafts((current) => ({ ...current, [candidate.userId]: twoPercentShareAmount.toFixed(2) }));
                        }} className="h-5 rounded border border-amber-200 bg-amber-50 text-[8px] font-semibold tabular-nums text-amber-700 active:scale-[0.98] disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300">2%</button>
                      </div>}
                      <div className="relative w-full"><input aria-label={`${candidate.name}共享收益金额`} disabled={!candidate.hasPrincipal} value={sharedIncomeDrafts[candidate.userId] ?? ""} onChange={(event) => {
                        const nextValue = event.target.value.replace(/[^0-9.]/g, "");
                        setSharedIncomeTargetSelections((current) => { const { [candidate.userId]: _removed, ...rest } = current; return rest; });
                        setSharedIncomeDrafts((current) => {
                          if (!candidate.hasPrincipal) return current;
                          if (!nextValue) { const { [candidate.userId]: _removed, ...rest } = current; return rest; }
                          return { ...current, [candidate.userId]: nextValue };
                        });
                      }} inputMode="decimal" className="h-8 w-full rounded border border-slate-200 bg-white pr-4 text-right text-[12px] font-semibold tabular-nums text-slate-800 outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-300" /><span className="pointer-events-none absolute bottom-1.5 right-1.5 text-[10px] leading-none text-slate-400">U</span></div>
                    </div>
                    {candidate.hasPrincipal && <div className="col-span-2 mt-0.5 flex items-center gap-1.5">
                      <span className={`shrink-0 text-[9px] font-medium ${settlementAgeDays === null || settlementAgeDays >= 8 ? "text-rose-600" : settlementAgeDays >= 4 ? "text-amber-600" : "text-emerald-600"}`}>{settlementEnergyLabel}</span>
                      <div className="flex min-w-0 flex-1 items-center gap-px" aria-label={settlementEnergyLabel}>
                        {Array.from({ length: settlementEnergyCells }, (_, index) => <span key={index} className={`h-2 w-2 shrink-0 rounded-[1px] ${settlementEnergyTone}`} />)}
                      </div>
                    </div>}
                  </div>;
                })}
              </div> : <div className="mt-2 rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">当前没有符合条件的其他未平仓关联用户；可直接跳过共享并确认平仓。</div>}
              <div className="mt-2 rounded bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-500">平仓后会以“共享收益订单”写入受益用户的交易流水；来源订单编号会保留供用户核对。管理员端同时保留给出与收到的平衡参考。</div>
            </div> : <div className="px-4 py-3 text-[11px] leading-5 text-slate-500">本单没有可用于共享的管理员正向收益份额，可直接确认平仓；收益为负、无管理员份额或未关联用户的订单不会触发共享分配。</div>}
            <div className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              <button type="button" disabled={saveEntryMutation.isPending} onClick={() => setCloseConfirmationStep("input")} className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:scale-[0.99] disabled:opacity-40">返回修改</button>
              <button disabled={saveEntryMutation.isPending || sharedIncomeAllocatedTotal - sharedIncomeClosePreview.managerPoolAmount > 0.00001} onClick={() => handleSaveEntry()} className="h-11 rounded bg-amber-600 text-sm font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-40">{sharedIncomeSaveAllocations.length > 0 ? `确认平仓并共享 ${formatPrice(sharedIncomeAllocatedTotal)} U` : "确认平仓"}</button>
            </div>
          </div>
        </div>
      )}

      {canManage && profitShareSource && (
        <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/40 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label={entryProfitShareEditTarget ? "编辑本单收益分配" : "管理收益分配"}>
          <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-t bg-white p-5 shadow-2xl sm:rounded">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{entryProfitShareEditTarget ? "编辑本单收益分配" : "收益分配"}</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{entryProfitShareEditTarget ? `调整持仓单的剩余仓位，并同步项目 ${profitShareSource.name} 之后新开的订单` : `为项目 ${profitShareSource.name} 设置用户收益分配清单`}</p>
              </div>
              <button type="button" onClick={closeProfitShareManager} aria-label="关闭收益分配" className="rounded p-1 text-slate-400 active:scale-90">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
              {entryProfitShareEditTarget
                ? "保存到本单后，已平仓流水与其收益分配永久不变；本单尚未平掉的数量，以及本项目之后新开的订单，均采用此清单。"
                : "项目是下单归属，受益人只能选择全局用户。每位比例为1–100的整数，所有用户合计必须恰好100%。仅之后新开的订单会固化本清单；平仓沿用对应开仓当时比例，并按同一比例承担开、平交易成本。"}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-700">收益分配人（全局用户）</div>
                <div className={`text-xs font-semibold tabular-nums ${profitShareDraftTotal === 100 ? "text-emerald-600" : "text-rose-600"}`}>合计 {profitShareDraftTotal}% / 100%</div>
              </div>
              <div className="mt-2 overflow-hidden rounded border border-slate-200">
                {profitShareAllocations.map((allocation, index) => {
                  return <div key={allocation.user.id} className={`flex items-center gap-2 px-3 py-2.5 ${index > 0 ? "border-t border-slate-100" : ""}`}>
                    <UserRound className="h-4 w-4 shrink-0 text-indigo-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{allocation.user.name}</div>
                      <div className="text-[10px] text-slate-400">{allocation.user.username ? `@${allocation.user.username}` : "收益分配人"}</div>
                    </div>
                    <div className="flex w-[76px] items-center rounded border border-slate-200 px-2 focus-within:border-indigo-500">
                      <input type="number" inputMode="numeric" min={1} max={100} step={1} value={allocation.percentage} onChange={(event) => setProfitShareAllocations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, percentage: event.target.value } : item))} className="h-9 min-w-0 flex-1 text-right text-sm font-semibold tabular-nums text-slate-800 outline-none" />
                      <span className="text-xs text-slate-500">%</span>
                    </div>
                    <button type="button" onClick={() => setProfitShareAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-semibold text-rose-600">移除</button>
                  </div>;
                })}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded border border-slate-200">
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input value={profitShareRecipientSearch} onChange={(event) => setProfitShareRecipientSearch(event.target.value)} placeholder="搜索并添加分配人" className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400" />
              </div>
              {profitShareRecipientSearch.trim().length === 0 ? <div className="px-3 py-2.5 text-xs text-slate-400">仅可搜索引用全局已有用户；添加后请在上方调整整数比例。</div>
                : profitShareRecipientSearchQuery.isFetching ? <div className="px-3 py-2.5 text-xs text-slate-400">正在搜索用户…</div>
                  : Array.isArray(profitShareRecipientSearchQuery.data) && profitShareRecipientSearchQuery.data.length > 0 ? <div className="max-h-40 overflow-y-auto border-t border-slate-100 py-1">
                    {(profitShareRecipientSearchQuery.data as any[]).map((candidate) => {
                      const candidateUser: PreviewRelatedUser = { id: String(candidate.id), name: String(candidate.name || candidate.username || `用户#${candidate.id}`), username: candidate.username ? String(candidate.username) : undefined };
                      const alreadyAdded = profitShareAllocations.some((allocation) => allocation.user.id === candidateUser.id);
                      return <button key={candidateUser.id} type="button" disabled={alreadyAdded || profitShareAllocations.length >= 20} onClick={() => { setProfitShareAllocations((current) => [...current, { user: candidateUser, percentage: "1" }]); setProfitShareRecipientSearch(""); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left disabled:opacity-40 active:bg-indigo-50">
                        <UserRound className="h-4 w-4 shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{candidateUser.name}</span>{candidateUser.username && <span className="max-w-[35%] truncate text-xs text-slate-400">@{candidateUser.username}</span>}
                      </button>;
                    })}
                  </div> : <div className="px-3 py-2.5 text-xs text-slate-400">未找到匹配用户</div>}
            </div>

            {entryProfitShareEditTarget ? <div className="mt-3 text-[11px] leading-5 text-indigo-700">点击下方“保存本单与后续新单”即刻生效，无需再点击持仓编辑页底部“保存修改”。</div> : activeProfitShareRules.length > 0 && <div className="mt-3 text-[11px] leading-5 text-slate-500">保存后，本项目仍有剩余仓位的订单与后续新订单都会采用新清单；已全部平仓的历史订单保持原快照。</div>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={closeProfitShareManager} className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700">取消</button>
              <button type="button" disabled={setProfitShareRuleMutation.isPending || updateOpeningProfitShareMutation.isPending || profitShareDraftTotal !== 100} onClick={submitProfitShareRule} className="h-11 rounded bg-indigo-600 text-sm font-semibold text-white disabled:opacity-40">{entryProfitShareEditTarget ? "保存本单与后续新单" : "保存并同步进行中订单"}</button>
            </div>
          </div>
        </div>
      )}

      {canManage && directoryManagerKind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label={directoryManagerTitle}>
          <div className="max-h-[84vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{directoryManagerTitle}</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {directoryManagerKind === "relatedUser"
                    ? "关联用户仅引用全局已有用户，本页不能创建或改名；移除只在当前T+0账本隐藏该关联，不会更改全局用户资料。"
                    : "改名会同步历史展示；删除后不再用于新订单，历史字段显示为未关联。"}
                </p>
              </div>
              <button type="button" onClick={closeDirectoryManager} aria-label="关闭名称管理" className="rounded p-1 text-slate-400 active:scale-90">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded border border-slate-200">
              {directoryManagerItems.length > 0 ? directoryManagerItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-3 py-3 ${index > 0 ? "border-t border-slate-100" : ""}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{item.name}</span>
                  {item.secondary && <span className="max-w-[34%] truncate text-xs text-slate-400">{item.secondary}</span>}
                  <div className="flex shrink-0 items-center gap-2">
                    {directoryManagerKind !== "relatedUser" && (
                      <button
                        type="button"
                        onClick={() => openDirectoryRename({ kind: directoryManagerKind, id: item.id, name: item.name, username: item.secondary })}
                        className="text-xs font-semibold text-indigo-600"
                      >
                        编辑
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openDirectoryDelete({ kind: directoryManagerKind, id: item.id, name: item.name, username: item.secondary })}
                      className="text-xs font-semibold text-rose-600"
                    >
                      {directoryManagerKind === "relatedUser" ? "移除" : "删除"}
                    </button>
                  </div>
                </div>
              )) : (
                <div className="px-4 py-8 text-center text-sm text-slate-400">
                  {directoryManagerKind === "relatedFund" ? "该用户暂未保存项目" : "暂未保存可管理的名称"}
                </div>
              )}
            </div>

            <button type="button" onClick={closeDirectoryManager} className="mt-4 h-10 w-full rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50">
              完成
            </button>
          </div>
        </div>
      )}

      {canManage && directoryRenameTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-5" role="dialog" aria-modal="true" aria-label="确认修改名称">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">
              修改{directoryRenameTarget.kind === "account" ? "账户" : "项目"}名称
            </div>
            {directoryImpactQuery.isLoading ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">正在核对历史流水影响范围…</div>
            ) : directoryImpactQuery.data ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                <div className="font-semibold text-slate-700">改名会同步更新 {(directoryImpactQuery.data as any).affectedEntryCount} 条历史记录</div>
                {(directoryImpactQuery.data as any).accounts?.length > 0 && (
                  <div className="mt-1 truncate">涉及账户：{(directoryImpactQuery.data as any).accounts.map((item: any) => `${item.name}（${item.count}条）`).join("、")}</div>
                )}
              </div>
            ) : null}
            <input
              autoFocus
              value={directoryRenameDraft}
              maxLength={80}
              onChange={(event) => setDirectoryRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitDirectoryRename();
              }}
              className="mt-4 h-11 w-full rounded border border-slate-300 px-3 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isDirectoryRenamePending}
                onClick={() => setDirectoryRenameTarget(null)}
                className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isDirectoryRenamePending || !directoryRenameDraft.trim()}
                onClick={submitDirectoryRename}
                className="h-11 rounded bg-indigo-600 text-sm font-semibold text-white active:bg-indigo-700 disabled:opacity-50"
              >
                {isDirectoryRenamePending ? "保存中…" : "确认改名"}
              </button>
            </div>
          </div>
        </div>
      )}

      {canManage && directoryDeleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-5" role="dialog" aria-modal="true" aria-label="确认删除目录项">
          <div className="max-h-[86vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">
              {directoryDeleteTarget.kind === "relatedUser" ? "移除关联用户？" : `删除${directoryDeleteTarget.kind === "account" ? "账户" : "项目"}？`}
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-700">{directoryDeleteTarget.name}</div>
            {directoryImpactQuery.isLoading ? (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">正在核对历史流水与未平仓数量…</div>
            ) : directoryImpactQuery.data ? (() => {
              const impact: any = directoryImpactQuery.data;
              const hasOutstandingPosition = Number(impact.outstandingQuantity || 0) > 0;
              const summaryRows = [
                ["账户", impact.accounts],
                ["用户", impact.users],
                ["项目", impact.funds],
              ].filter(([, items]: any) => Array.isArray(items) && items.length > 0) as Array<[string, Array<{ id: number; name: string; count: number }>]>;
              return <>
                <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
                  <div className="font-semibold">将影响 {impact.affectedEntryCount} 条已保存历史记录</div>
                  <div className="mt-1">{directoryDeleteTarget.kind === "relatedUser"
                    ? "移除后，该用户仅从当前T+0账本的新订单选择与筛选中隐藏；不会创建、修改或删除全局用户资料。相关历史字段会显示为“未关联”。"
                    : "删除后，该项不再出现在新订单选择与筛选中；相关历史字段会显示为“未关联”。"} 稳定关联键仍保留在审计与仓位核对中，不会破坏既有开平匹配。</div>
                </div>
                <div className="mt-3 overflow-hidden rounded border border-slate-200 text-xs leading-5">
                  {summaryRows.map(([label, items], index) => (
                    <div key={label} className={`px-3 py-2 ${index > 0 ? "border-t border-slate-100" : ""}`}>
                      <span className="font-semibold text-slate-700">涉及{label}：</span>
                      <span className="text-slate-600">{items.map((item) => `${item.name}（${item.count}条）`).join("、")}</span>
                    </div>
                  ))}
                </div>
                {hasOutstandingPosition && (
                  <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
                    当前仍有 {Number(impact.outstandingQuantity).toFixed(2)} ETH 未平仓。删除后不会影响这部分旧仓继续平仓与FIFO核对，但其历史字段会立即显示为“未关联”。
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isDirectoryDeletePending}
                    onClick={() => setDirectoryDeleteTarget(null)}
                    className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={isDirectoryDeletePending}
                    onClick={() => deleteDirectoryItemMutation.mutate({
                      ledgerId: 52,
                      dimension: directoryDeleteTarget.kind === "account" ? "account" : directoryDeleteTarget.kind === "relatedFund" ? "related_fund" : "related_user",
                      dimensionId: Number(directoryDeleteTarget.id),
                      expectedAffectedEntryCount: Number(impact.affectedEntryCount || 0),
                    })}
                    className="h-11 rounded bg-rose-600 text-sm font-semibold text-white active:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isDirectoryDeletePending ? "处理中…" : directoryDeleteTarget.kind === "relatedUser" ? "确认移除关联" : "确认删除"}
                  </button>
                </div>
              </>;
            })() : (
              <div className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">无法读取影响范围，请关闭后重试。</div>
            )}
          </div>
        </div>
      )}

      {showPayoutLog && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="T+0收益账本">
          <div className="flex max-h-[88vh] w-full max-w-sm flex-col overflow-y-auto rounded-xl bg-white p-4 shadow-2xl">
            {canManage && (
              <div data-html2canvas-ignore="true" className="order-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500"><span>操作面板</span><span className="flex items-center gap-1"><OrderCardImageDownload targetRef={payoutSharedContentRef} currentUser={me as any} orderNo={`${payoutTargetUserIdentity.name}-${payoutLogSectionLabel}`} filenamePrefix="T+0收益账本" previewTitle="T+0收益账本图片预览" previewHint="包含昵称、用户名、收益统计与当前展示流水" color="#475569" outerPadding={12} captureFullContent exportBackground="#F8FAFC" variant="bare" buttonLabel="下载" /><button type="button" onClick={() => { setIsPayoutListEditing((current) => !current); setDeletePayoutLogId(null); }} className={`flex h-7 items-center gap-1 rounded px-1.5 font-medium ${isPayoutListEditing ? "bg-slate-700 text-white" : "text-slate-600 active:bg-slate-100"}`}><Pencil className="h-3.5 w-3.5" />{isPayoutListEditing ? "完成" : "编辑"}</button></span></div>
                <div className="p-3">
                {!showPayoutForm ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => openPayoutLogForm("deposit")} className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sm font-semibold text-sky-700 shadow-sm active:scale-[0.99]">
                      <ArrowDownLeft className="h-4 w-4" /> 登记投入
                    </button>
                    <button type="button" onClick={() => openPayoutLogForm("withdrawal")} className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-800 text-sm font-semibold text-white shadow-sm active:scale-[0.99]">
                      <ArrowUpRight className="h-4 w-4" /> 登记提现
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {editingPayoutLog && <div className="mb-2 text-[11px] font-medium text-slate-500">编辑资金流水</div>}
                    <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-white p-1 text-xs font-semibold">
                      <button type="button" onClick={() => { setPayoutDirection("deposit"); setPayoutLogView("deposit"); }} className={`h-8 rounded transition ${payoutDirection === "deposit" ? "bg-sky-600 text-white" : "text-slate-500"}`}>投入</button>
                      <button type="button" onClick={() => { setPayoutDirection("withdrawal"); setPayoutLogView("withdrawal"); }} className={`h-8 rounded transition ${payoutDirection === "withdrawal" ? "bg-slate-800 text-white" : "text-slate-500"}`}>提现</button>
                    </div>
                    <div className="mt-2 grid gap-2">
                      <label className="min-w-0 text-[11px] font-medium text-slate-600">日期
                        <input type="date" value={payoutOccurredOn} onChange={(event) => setPayoutOccurredOn(event.target.value)} className="t0-journal-date-input mt-1 block h-9 min-h-0 w-full appearance-none rounded border border-slate-300 bg-white px-2 py-0 font-sans text-sm leading-5 text-slate-800" style={{ WebkitAppearance: "none", appearance: "none" }} />
                      </label>
                      <label className="min-w-0 text-[11px] font-medium text-slate-600">金额（U）
                        <input inputMode="decimal" placeholder="0.00" value={payoutAmount} onChange={(event) => setPayoutAmount(event.target.value)} className="mt-1 block h-9 min-h-0 w-full rounded border border-slate-300 bg-white px-2 py-0 font-sans text-sm leading-5 tabular-nums text-slate-800" />
                      </label>
                    </div>
                    <label className="mt-2 block text-[11px] font-medium text-slate-600">备注（可选）
                      <input value={payoutNote} onChange={(event) => setPayoutNote(event.target.value)} maxLength={300} placeholder={payoutDirection === "withdrawal" ? "例如：微信提现" : "例如：追加投入"} className="mt-1 block h-9 min-h-0 w-full rounded border border-slate-300 bg-white px-2 py-0 font-sans text-sm leading-5 text-slate-800" />
                    </label>
                    {payoutDirection === "withdrawal" && <div className="mt-2 text-[11px] text-slate-500">本次提现不超过可提现的 {formatPrice(payoutFormWithdrawalLimit)} U。</div>}
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={resetPayoutLogForm} className="h-9 flex-1 rounded border border-slate-300 bg-white text-sm font-medium text-slate-600 active:scale-[0.99]">取消</button>
                      <button
                        type="button"
                        disabled={createPayoutLogMutation.isPending || updatePayoutLogMutation.isPending}
                        onClick={() => {
                          const amount = Number(payoutAmount);
                          if (!payoutOccurredOn) { toast.error("请选择登记日期"); return; }
                          if (!Number.isFinite(amount) || amount <= 0) { toast.error("请输入有效的登记金额"); return; }
                          if (payoutDirection === "withdrawal" && amount > payoutFormWithdrawalLimit + 0.005) { toast.error(`本次提现不能超过可提现的 ${formatPrice(payoutFormWithdrawalLimit)} U`); return; }
                          const payload = {
                            ledgerId: 52 as const,
                            relatedUserId: payoutTargetRelatedUserId,
                            occurredOn: payoutOccurredOn,
                            amount: amount.toFixed(2),
                            direction: payoutDirection,
                            note: payoutNote.trim() || undefined,
                            maximumTotalAmount: payoutDirection === "withdrawal" ? payoutProfitCap.toFixed(2) : undefined,
                          };
                          if (editingPayoutLog) updatePayoutLogMutation.mutate({ ...payload, id: editingPayoutLog.id });
                          else createPayoutLogMutation.mutate(payload);
                        }}
                        className={`h-9 flex-1 rounded text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-45 ${payoutDirection === "withdrawal" ? "bg-slate-800" : "bg-sky-600"}`}
                      >{createPayoutLogMutation.isPending || updatePayoutLogMutation.isPending ? "保存中" : editingPayoutLog ? "保存修改" : `保存${payoutDirection === "withdrawal" ? "提现" : "投入"}`}</button>
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}

            <div ref={payoutSharedContentRef} className="order-3 mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-900">T+0收益账本</div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    昵称：{payoutTargetUserIdentity.name}{payoutTargetUserIdentity.username ? ` · 用户名：@${payoutTargetUserIdentity.username}` : ""}
                  </div>
                </div>
                <button type="button" data-card-export-hide="true" onClick={() => setShowPayoutLog(false)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭T+0收益账本">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-center tabular-nums">
                <button type="button" onClick={() => { setTotalRevenueDetailPage(1); setShowTotalNetProfitDetail(true); }} aria-haspopup="dialog" aria-label="查看总收益归因报告" className="min-w-0 px-1 py-2 transition active:bg-slate-100"><div className="whitespace-nowrap text-[10px] text-slate-500">当前总收益</div><div className={`mt-0.5 flex items-baseline justify-center whitespace-nowrap text-[clamp(10px,3.2vw,14px)] font-bold leading-none ${totalNetProfitClass}`}><span>{formatSigned(totalNetProfit)}</span><span className="ml-0.5 text-[10px] font-semibold opacity-75">U</span></div></button>
                <button type="button" aria-pressed={payoutLogView === "deposit"} onClick={() => setPayoutLogView("deposit")} className={`min-w-0 px-1 py-2 transition ${payoutLogView === "deposit" ? "bg-white shadow-[inset_0_-2px_0_#0284c7]" : "active:bg-slate-100"}`}><div className="whitespace-nowrap text-[10px] text-slate-500">累计投入</div><div className="mt-0.5 flex items-baseline justify-center whitespace-nowrap text-[clamp(10px,3.2vw,14px)] font-bold leading-none text-sky-700"><span>+{formatPrice(cumulativeDepositAmount)}</span><span className="ml-0.5 text-[10px] font-semibold opacity-75">U</span></div></button>
                <button type="button" aria-pressed={payoutLogView === "withdrawal"} onClick={() => setPayoutLogView("withdrawal")} className={`min-w-0 px-1 py-2 transition ${payoutLogView === "withdrawal" ? "bg-white shadow-[inset_0_-2px_0_#475569]" : "active:bg-slate-100"}`}><div className="whitespace-nowrap text-[10px] text-slate-500">累计提现</div><div className="mt-0.5 flex items-baseline justify-center whitespace-nowrap text-[clamp(10px,3.2vw,14px)] font-bold leading-none text-slate-800"><span>+{formatPrice(cumulativePayoutAmount)}</span><span className="ml-0.5 text-[10px] font-semibold opacity-75">U</span></div></button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50/55 px-3 py-2 tabular-nums">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-indigo-900">实际年化回报率 <button type="button" onClick={() => setShowPayoutXirrHelp(true)} aria-haspopup="dialog" aria-label="查看XIRR计算说明" className="border-b border-dotted border-indigo-400 pb-px font-medium text-indigo-600 active:opacity-60">XIRR</button></div>
                  <div className="mt-0.5 truncate text-[10px] text-indigo-700/75">
                    {payoutXirrSummary.rate === null
                      ? "需至少一笔跨日投入，以及当前账面净值或已提现收益"
                      : `持有期：${payoutXirrSummary.daysHeld} 天`}
                  </div>
                </div>
                <div className={`shrink-0 text-right text-base font-bold ${payoutXirrSummary.rate === null ? "text-slate-400" : payoutXirrSummary.rate >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {formatT0AnnualizedReturn(payoutXirrSummary.rate)}
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500"><span>{payoutLogSectionLabel}</span><span>{visiblePayoutLogs.length} 笔</span></div>
              {t0PayoutLogsQuery.isLoading ? <div className="px-3 py-5 text-center text-xs text-slate-400">加载中…</div>
                : visiblePayoutLogs.length > 0 ? <div className="divide-y divide-slate-100">{visiblePayoutLogs.map((log) => {
                  const isDeposit = log.direction === "deposit";
                  return <div key={log.id} className="px-3 py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5 overflow-hidden font-medium text-slate-700"><span className="shrink-0">{log.occurredOn.replaceAll("-", "/")}</span><span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${isDeposit ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600"}`}>{isDeposit ? "投入" : "提现"}</span>{log.note && <span className="min-w-0 truncate text-[11px] font-normal text-slate-400">· {log.note}</span>}</span><span className="flex shrink-0 items-center gap-1"><span className={`font-bold tabular-nums ${isDeposit ? "text-sky-700" : "text-slate-800"}`}>{isDeposit ? "+" : "−"}{formatPrice(log.amount)} U</span>{canManage && isPayoutListEditing && deletePayoutLogId !== log.id && <><button type="button" onClick={() => { setEditingPayoutLog(log); setIsPayoutListEditing(false); setPayoutDirection(log.direction); setPayoutLogView(log.direction); setPayoutOccurredOn(log.occurredOn); setPayoutAmount(log.amount.toFixed(2)); setPayoutNote(log.note || ""); setShowPayoutForm(true); }} className="flex h-7 w-7 items-center justify-center rounded text-slate-500 active:bg-slate-100" aria-label="编辑资金流水" title="编辑"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setDeletePayoutLogId(log.id)} className="flex h-7 w-7 items-center justify-center rounded text-rose-500 active:bg-rose-50" aria-label="删除资金流水" title="删除"><Trash2 className="h-3.5 w-3.5" /></button></>}</span></div>
                    {canManage && isPayoutListEditing && deletePayoutLogId === log.id && <div className="mt-2 flex items-center justify-end gap-2 text-[11px]"><span className="mr-auto text-rose-600">确认删除这笔记录？</span><button type="button" onClick={() => setDeletePayoutLogId(null)} className="h-7 rounded border border-slate-300 bg-white px-2 font-medium text-slate-600">保留</button><button type="button" disabled={deletePayoutLogMutation.isPending} onClick={() => deletePayoutLogMutation.mutate({ ledgerId: 52, relatedUserId: payoutTargetRelatedUserId, id: log.id })} className="h-7 rounded bg-rose-600 px-2 font-semibold text-white disabled:opacity-45">{deletePayoutLogMutation.isPending ? "删除中" : "确认删除"}</button></div>}
                  </div>;
                })}</div> : <div className="px-3 py-5 text-center text-xs text-slate-400">暂无{payoutLogSectionLabel}记录</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPayoutLog && showPayoutXirrHelp && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-5" role="dialog" aria-modal="true" aria-label="XIRR年化回报率计算说明">
          <div className="max-h-[86vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">XIRR 实际年化回报率</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">按每笔资金在北京时间的实际占用日数计算，适用于分批投入、分批提现。</div>
              </div>
              <button type="button" onClick={() => setShowPayoutXirrHelp(false)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭XIRR计算说明">
                <X className="h-5 w-5" />
              </button>
            </div>

            <section className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/55 p-3">
              <div className="text-xs font-semibold text-indigo-900">本账本的现金流口径</div>
              <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-600">
                <div className="flex gap-2"><span className="shrink-0 font-semibold text-sky-700">投入（负）</span><span>每笔登记投入，按实际发生日记为投资人现金流出。</span></div>
                <div className="flex gap-2"><span className="shrink-0 font-semibold text-slate-700">提现（正）</span><span>每笔登记提现，按实际发生日记为投资人现金流入。</span></div>
                <div className="flex gap-2"><span className="shrink-0 font-semibold text-indigo-700">期末净值（正）</span><span>当前仍留在账本中的资金价值，按北京时间今天收盘时作为期末现金流。</span></div>
              </div>
            </section>

            <section className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">期末净值与公式</div>
              <div className="space-y-3 px-3 py-3 text-[11px] leading-5 text-slate-600">
                <div>
                  <div className="text-slate-400">期末账面净值</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-slate-800">累计投入 + 当前总收益 − 累计提现</div>
                  <div className="mt-1 font-semibold tabular-nums text-indigo-700">当前期末净值：{formatSigned(payoutXirrSummary.currentNetValue)} U</div>
                </div>
                <div>
                  <div className="text-slate-400">XIRR 求解公式</div>
                  <div className="mt-0.5 break-words font-mono text-[10px] text-slate-800">Σ [ CFᵢ ÷ (1 + r)^(dᵢ ÷ 365) ] = 0</div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-500">CFᵢ 为每笔现金流；dᵢ 为该笔现金流距首笔投入的北京时间计算天数；首日与截至日均计入持有期；r 为求得的实际年化回报率。</div>
                </div>
              </div>
            </section>

            <section className="mt-3 grid grid-cols-3 divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-center tabular-nums">
              <div className="px-2 py-2"><div className="text-[10px] text-slate-500">投入笔数</div><div className="mt-0.5 text-sm font-semibold text-sky-700">{depositLogs.length}</div></div>
              <div className="px-2 py-2"><div className="text-[10px] text-slate-500">提现笔数</div><div className="mt-0.5 text-sm font-semibold text-slate-700">{withdrawalLogs.length}</div></div>
              <div className="px-2 py-2"><div className="text-[10px] text-slate-500">持有期</div><div className="mt-0.5 text-sm font-semibold text-indigo-700">{payoutXirrSummary.daysHeld} 天</div></div>
            </section>

            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">短期持有时，少量收益会因按全年复利折算而显著放大年化读数；XIRR 反映截至当前的历史资金效率，不代表未来收益预期。</div>
            <button type="button" onClick={() => setShowPayoutXirrHelp(false)} className="mt-5 h-11 w-full rounded bg-indigo-700 text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
          </div>
        </div>
      )}

      {showTotalNetProfitDetail && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="总收益归因报告">
          <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">总收益归因报告</div>
                <div className="mt-1 text-xs text-slate-500">{totalProfitAttribution.targetLabel} · 已实现收益，已扣开仓与平仓手续费</div>
              </div>
              <button type="button" onClick={() => {
                setShowTotalNetProfitDetail(false);
              }} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭总收益归因报告">
                <X className="h-5 w-5" />
              </button>
            </div>

            <section className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="bg-gradient-to-br from-slate-50 via-white to-rose-50/45 px-4 py-3.5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-slate-500">总收益</div>
                    <div className="mt-1 text-[10px] text-slate-400">自身交易净收益 + 佣金分成</div>
                  </div>
                  <div className={`shrink-0 whitespace-nowrap text-[26px] font-bold leading-none tabular-nums ${totalNetProfitClass}`}>{formatSigned(totalProfitAttribution.total)} <span className="text-xs font-semibold opacity-70">U</span></div>
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-100 bg-white text-center tabular-nums">
                <div className="min-w-0 px-3 py-3">
                  <div className="truncate text-[10px] text-slate-500">{totalProfitAttribution.hasIndividualScope ? "自身交易净收益" : "订单交易净收益"}</div>
                  <div className={`mt-1 whitespace-nowrap text-base font-bold ${totalProfitAttribution.ownTradingNetProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(totalProfitAttribution.ownTradingNetProfit)} <span className="text-[10px]">U</span></div>
                  <div className="mt-1 text-[10px] text-slate-400">{totalProfitAttribution.ownTradingCount} 笔已平仓</div>
                </div>
                <div className="min-w-0 px-3 py-3">
                  <div className="truncate text-[10px] text-slate-500">佣金分成收入</div>
                  <div className={`mt-1 whitespace-nowrap text-base font-bold ${totalProfitAttribution.commissionShareNetProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(totalProfitAttribution.commissionShareNetProfit)} <span className="text-[10px]">U</span></div>
                  <div className="mt-1 text-[10px] text-slate-400">{totalProfitAttribution.commissionShareCount} 笔关联收益</div>
                </div>
              </div>
            </section>

            <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-800">收益构成</div>
                <div className="text-[10px] text-slate-400">占比按两项收益绝对值计算</div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div
                  className="relative h-[68px] w-[68px] shrink-0 rounded-full"
                  style={{ background: (totalProfitAttribution.ownTradingRatio + totalProfitAttribution.commissionShareRatio) > 0
                    ? `conic-gradient(${totalProfitAttribution.ownTradingNetProfit >= 0 ? "#e11d48" : "#059669"} 0 ${(totalProfitAttribution.ownTradingRatio * 100).toFixed(3)}%, ${totalProfitAttribution.commissionShareNetProfit >= 0 ? "#fb7185" : "#34d399"} ${(totalProfitAttribution.ownTradingRatio * 100).toFixed(3)}% 100%)`
                    : "#cbd5e1" }}
                >
                  <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-white"><span className="text-[9px] text-slate-400">总收益</span><span className={`mt-0.5 text-[11px] font-bold tabular-nums ${totalNetProfitClass}`}>{formatSigned(totalProfitAttribution.total)}</span></div>
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px]"><span className="min-w-0 truncate text-slate-600">{totalProfitAttribution.hasIndividualScope ? "自身交易" : "订单交易"}</span><span className={`shrink-0 font-semibold tabular-nums ${totalProfitAttribution.ownTradingNetProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{Math.round(totalProfitAttribution.ownTradingRatio * 100)}%</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${totalProfitAttribution.ownTradingNetProfit >= 0 ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${totalProfitAttribution.ownTradingRatio * 100}%` }} /></div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px]"><span className="min-w-0 truncate text-slate-600">佣金分成</span><span className={`shrink-0 font-semibold tabular-nums ${totalProfitAttribution.commissionShareNetProfit >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{Math.round(totalProfitAttribution.commissionShareRatio * 100)}%</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${totalProfitAttribution.commissionShareNetProfit >= 0 ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${totalProfitAttribution.commissionShareRatio * 100}%` }} /></div>
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-3 overflow-hidden rounded border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                <span>已实现订单明细</span>
                <span>{totalNetProfitDetails.length} 笔</span>
              </div>
              {totalNetProfitDetails.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {pagedTotalNetProfitDetails.map((detail) => {
                    const isLong = ACTIONS[detail.trade.action].side === "long";
                    return (
                      <div key={detail.trade.id} className="flex min-w-0 items-center gap-2 px-3 py-2 text-[11px] tabular-nums whitespace-nowrap">
                        <span className="shrink-0 text-slate-400">{formatBeijingMonthDayTime(detail.trade.createdAt)}</span>
                        <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[detail.trade.action].label}</span>
                        <span className="shrink-0 font-medium text-slate-700">{formatQuantity(detail.quantity)} ETH</span>
                        <span className={`ml-auto shrink-0 font-semibold ${detail.netPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(detail.netPnl)} U</span>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="px-3 py-5 text-center text-xs text-slate-400">当前筛选范围暂无已平仓记录</div>}
              {totalNetProfitDetails.length > 0 && totalRevenueDetailTotalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] tabular-nums">
                  <button
                  type="button"
                  disabled={totalRevenueDetailPage <= 1}
                  onClick={() => setTotalRevenueDetailPage((current) => Math.max(1, current - 1))}
                    className="h-7 rounded border border-slate-200 bg-white px-2.5 font-medium text-slate-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    上一页
                  </button>
                  <span className="whitespace-nowrap text-slate-500">第 {totalRevenueDetailPage} 页 / 共 {totalRevenueDetailTotalPages} 页</span>
                  <button
                  type="button"
                  disabled={totalRevenueDetailPage >= totalRevenueDetailTotalPages}
                  onClick={() => setTotalRevenueDetailPage((current) => Math.min(totalRevenueDetailTotalPages, current + 1))}
                    className="h-7 rounded border border-slate-200 bg-white px-2.5 font-medium text-slate-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    下一页
                  </button>
                </div>
              )}
            </div>

            <button type="button" onClick={() => setShowTotalNetProfitDetail(false)} className="mt-5 h-11 w-full rounded bg-[#1a56db] text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
          </div>
        </div>
      )}

      {showNetPositionDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="总仓位对冲明细">
          <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">总仓位明细</div>
                <div className="mt-1 text-xs text-slate-500">当前筛选范围内的未平仓档位</div>
              </div>
              <button type="button" onClick={() => setShowNetPositionDetail(false)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭总仓位明细">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 tabular-nums">
              <section className="overflow-hidden rounded border border-rose-200">
                <div className="flex items-center justify-between gap-3 bg-rose-50/70 px-3 py-2">
                  <span
                    className="min-w-0 truncate text-sm font-semibold text-rose-600"
                    title={netPositionBreakdown.long.levels.length > 0 ? `多仓 · ${netPositionBreakdown.long.levels.length}档（${netPositionBreakdown.long.levels.map((bucket) => `${formatLadderPrice(bucket.price)}档`).join("、")}）` : "多仓 · 0档"}
                  >
                    多仓 · {netPositionBreakdown.long.levels.length}档{netPositionBreakdown.long.levels.length > 0 ? `（${netPositionBreakdown.long.levels.map((bucket) => formatLadderPrice(bucket.price)).join("、")}）` : ""}
                  </span>
                  <span className="whitespace-nowrap text-xs font-semibold text-slate-700">合计 {formatQuantity(netPositionBreakdown.long.quantity)} ETH</span>
                </div>
                {netPositionBreakdown.long.levels.length > 0 ? (
                  <div className="divide-y divide-rose-100">
                    {netPositionBreakdown.long.levels.map((bucket) => (
                      <div key={bucket.key} className="flex items-center justify-between gap-4 px-3 py-2 text-xs">
                        <span className="text-slate-500">{formatLadderPrice(bucket.price)} 档</span>
                        <span className="font-medium text-slate-800">{formatQuantity(bucket.remainingQuantity)} ETH</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="px-3 py-3 text-center text-xs text-slate-400">暂无多仓</div>}
              </section>

              <section className="overflow-hidden rounded border border-emerald-200">
                <div className="flex items-center justify-between gap-3 bg-emerald-50/70 px-3 py-2">
                  <span
                    className="min-w-0 truncate text-sm font-semibold text-emerald-600"
                    title={netPositionBreakdown.short.levels.length > 0 ? `空仓 · ${netPositionBreakdown.short.levels.length}档（${netPositionBreakdown.short.levels.map((bucket) => `${formatLadderPrice(bucket.price)}档`).join("、")}）` : "空仓 · 0档"}
                  >
                    空仓 · {netPositionBreakdown.short.levels.length}档{netPositionBreakdown.short.levels.length > 0 ? `（${netPositionBreakdown.short.levels.map((bucket) => formatLadderPrice(bucket.price)).join("、")}）` : ""}
                  </span>
                  <span className="whitespace-nowrap text-xs font-semibold text-slate-700">合计 {formatQuantity(netPositionBreakdown.short.quantity)} ETH</span>
                </div>
                {netPositionBreakdown.short.levels.length > 0 ? (
                  <div className="divide-y divide-emerald-100">
                    {netPositionBreakdown.short.levels.map((bucket) => (
                      <div key={bucket.key} className="flex items-center justify-between gap-4 px-3 py-2 text-xs">
                        <span className="text-slate-500">{formatLadderPrice(bucket.price)} 档</span>
                        <span className="font-medium text-slate-800">{formatQuantity(bucket.remainingQuantity)} ETH</span>
                      </div>
                    ))}
                  </div>
                ) : <div className="px-3 py-3 text-center text-xs text-slate-400">暂无空仓</div>}
              </section>

              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-semibold text-slate-700">合计总仓位</span>
                  <span className="whitespace-nowrap text-lg font-bold text-slate-900">{netPositionDetailText} <span className="text-xs font-semibold text-slate-500">ETH</span></span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">多 {formatQuantity(netPositionBreakdown.long.quantity)} ETH − 空 {formatQuantity(netPositionBreakdown.short.quantity)} ETH</div>
              </div>
            </div>

            <button type="button" onClick={() => setShowNetPositionDetail(false)} className="mt-5 h-11 w-full rounded bg-[#1a56db] text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
          </div>
        </div>
      )}

      {grossProfitDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="累计净收益说明">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{isMemberView ? "累计净收益说明" : `${grossProfitDetail.side === "long" ? "多仓" : "空仓"}累计净收益明细`}</div>
                {!isMemberView && <div className="mt-1 text-xs text-slate-500">已平仓部分按实际成交价汇总</div>}
              </div>
              <button type="button" onClick={() => setGrossProfitDetail(null)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭累计净收益说明">
                <X className="h-5 w-5" />
              </button>
            </div>
            {isMemberView ? (
              <div className="mt-5 rounded bg-slate-50 px-4 py-4 text-center text-sm leading-6 text-slate-600">累计净收益已扣除开仓与平仓交易手续费。</div>
            ) : <>
              <div className="mt-4 space-y-2 text-sm tabular-nums">
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">毛收益</span><span className={`font-medium ${grossProfitDetail.gross >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(grossProfitDetail.gross)} U</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">开仓手续费分摊</span><span className="font-medium text-slate-700">−{formatFee(grossProfitDetail.openingFee)} U</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">平仓手续费</span><span className="font-medium text-slate-700">−{formatFee(grossProfitDetail.closingFee)} U</span></div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2"><span className="font-semibold text-slate-800">累计净收益</span><span className={`font-semibold ${grossProfitDetail.net >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(grossProfitDetail.net)} U</span></div>
              </div>
              <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">累计净收益已扣除已平部分的开仓手续费分摊及平仓手续费。</div>
            </>}
            <button type="button" onClick={() => setGrossProfitDetail(null)} className="mt-5 h-11 w-full rounded bg-slate-800 text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
          </div>
        </div>
      )}

      {netProfitDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="净利润计算明细">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{netProfitDetailUsesMemberPresentation && memberProfitShareDetail ? "本单收益" : netProfitDetailUsesMemberPresentation ? "净利润说明" : "净利润计算明细"}</div>
                {!netProfitDetailUsesMemberPresentation && <div className="mt-1 text-xs text-slate-500">已扣除开仓与平仓两次实际手续费</div>}
              </div>
              <button type="button" onClick={() => setNetProfitDetail(null)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭净利润说明">
                <X className="h-5 w-5" />
              </button>
            </div>
            {netProfitDetailUsesMemberPresentation ? (
              memberProfitShareDetail ? <>
                <div className="mt-4 overflow-hidden rounded border border-indigo-100 bg-indigo-50/45 text-sm tabular-nums">
                  <div className="flex items-center justify-between gap-4 px-3 py-3.5">
                    <span className="font-semibold text-slate-800">本单可得</span>
                    <span className={`text-lg font-semibold ${memberProfitShareDetail.netPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(memberProfitShareDetail.netPnl)} U</span>
                  </div>
                </div>
                <div className="mt-3 px-1 text-[11px] leading-5 text-slate-400">已按本单实际归属计算，扣除交易费、手续费及分成后的净利润。</div>
              </> : <>
                <div className="mt-5 rounded bg-slate-50 px-4 py-4 text-center text-sm text-slate-600">已扣除交易成本后的净利润。</div>
                {(netProfitDetail.detail.buyPrice !== undefined || netProfitDetail.detail.sellPrice !== undefined) && <div className="mt-3 px-1 text-[11px] tabular-nums text-slate-400">
                  成交参考：{netProfitDetail.detail.buyPrice !== undefined && <>买 {netProfitDetail.detail.buyQuote ?? formatPrice(netProfitDetail.detail.buyPrice)}</>}{netProfitDetail.detail.buyPrice !== undefined && netProfitDetail.detail.sellPrice !== undefined && <span className="px-1.5 text-slate-300">·</span>}{netProfitDetail.detail.sellPrice !== undefined && <>卖 {netProfitDetail.detail.sellQuote ?? formatPrice(netProfitDetail.detail.sellPrice)}</>}
                </div>}
              </>
            ) : <>
              <div className="mt-4 rounded bg-slate-50 px-3 py-2.5 text-xs tabular-nums text-slate-700">
                {ACTIONS[netProfitDetail.trade.action].label} {formatQuantity(netProfitDetail.trade.quantity)} ETH
              </div>
              <div className="mt-3 space-y-2 text-sm tabular-nums">
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">毛收益</span><span className="font-medium text-slate-700">{formatSigned(netProfitDetail.detail.grossPnl ?? 0)} U</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">开仓手续费分摊</span><span className="font-medium text-slate-700">−{formatFee(netProfitDetail.detail.allocatedOpeningFee ?? 0)} U</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">本笔平仓手续费</span><span className="font-medium text-slate-700">−{formatFee(netProfitDetail.detail.closingFee ?? 0)} U</span></div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2"><span className="font-semibold text-slate-800">净利润</span><span className={`font-semibold ${(netProfitDetail.detail.netPnl ?? 0) >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(netProfitDetail.detail.netPnl ?? 0)} U</span></div>
              </div>
              {netProfitShareDistribution.length > 0 && <div className="mt-4 overflow-hidden rounded border border-indigo-100 bg-indigo-50/45">
                <div className="border-b border-indigo-100 bg-white/60 px-3 py-2">
                  <div className="text-xs font-semibold text-indigo-900">分佣明细（开仓快照）</div>
                  <div className="mt-0.5 text-[10px] leading-4 text-indigo-700/80">当前没有额外管理费；已先扣除上方开仓与平仓交易手续费，再按开仓时固化的比例拆分。</div>
                </div>
                <div className="divide-y divide-indigo-100/90 bg-white/55">
                  {netProfitShareDistribution.map((allocation) => <div key={allocation.beneficiaryUserId} className="flex items-center justify-between gap-3 px-3 py-2 text-xs tabular-nums">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-800">{allocation.beneficiaryUserName}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">分成 {allocation.percentageLabel}</div>
                    </div>
                    <div className={`shrink-0 text-sm font-semibold ${allocation.netPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(allocation.netPnl)} U</div>
                  </div>)}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-indigo-100 bg-white/70 px-3 py-2 text-xs tabular-nums">
                  <span className="font-semibold text-slate-700">分配合计</span>
                  <span className={`font-semibold ${(netProfitDetail.detail.netPnl ?? 0) >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(netProfitShareDistribution.reduce((total, allocation) => total + allocation.netPnl, 0))} U</span>
                </div>
              </div>}
            </>}
            <button type="button" onClick={() => setNetProfitDetail(null)} className="mt-5 h-11 w-full rounded bg-slate-800 text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
          </div>
        </div>
      )}

      {canManage && deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="删除开仓记录">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">删除这笔开仓记录？</div>
            <div className="mt-2 text-sm tabular-nums text-slate-700">
              {ACTIONS[deleteCandidate.action].label} {formatQuantity(deleteCandidate.quantity)} ETH @ {formatPrice(deleteCandidate.price)}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">删除后该开仓不再计入价格簿、仓位和盈亏，删除前记录、操作时间与操作人会保留在审计记录中。若此开仓已有对应平仓记录，系统会拒绝删除，须先回撤对应平仓流水。</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={deleteOpeningEntryMutation.isPending}
                onClick={() => setDeleteCandidate(null)}
                className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                取消
              </button>
              <button
                disabled={deleteOpeningEntryMutation.isPending}
                onClick={() => deleteOpeningEntryMutation.mutate({ ledgerId: 52, entryId: Number(getStoredEntryId(deleteCandidate)) })}
                className="h-11 rounded bg-rose-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {canManage && revertCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="回撤速记流水">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">回撤这笔速记？</div>
            <div className="mt-2 text-sm tabular-nums text-slate-700">
              {ACTIONS[revertCandidate.action].label} {formatQuantity(revertCandidate.quantity)} ETH @ {formatPrice(revertCandidate.price)}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">
              回撤后，该笔不会再影响价格簿、多空仓位和盈亏；原始流水会保留在“最近撤回”中，可随时恢复。
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={revertEntryMutation.isPending}
                onClick={() => setRevertCandidate(null)}
                className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                取消
              </button>
              <button
                disabled={revertEntryMutation.isPending}
                onClick={() => revertEntryMutation.mutate({ ledgerId: 52, entryId: Number(getStoredEntryId(revertCandidate)) })}
                className="h-11 rounded bg-amber-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                确认回撤
              </button>
            </div>
          </div>
        </div>
      )}

      {canManage && restoreCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="恢复速记流水">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">恢复这笔速记？</div>
            <div className="mt-2 text-sm tabular-nums text-slate-700">
              {ACTIONS[restoreCandidate.trade.action].label} {formatQuantity(restoreCandidate.trade.quantity)} ETH @ {formatPrice(restoreCandidate.trade.price)}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">
              恢复后将重新计入价格簿、仓位和盈亏。若其为平仓记录，系统会先复核对应档位的可平数量。
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={restoreEntryMutation.isPending}
                onClick={() => setRestoreCandidate(null)}
                className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                取消
              </button>
              <button
                disabled={restoreEntryMutation.isPending}
                onClick={() => restoreEntryMutation.mutate({ ledgerId: 52, auditId: Number(restoreCandidate.auditId) })}
                className="h-11 rounded bg-indigo-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                确认恢复
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 mb-2">{label}</span>
      {children}
    </label>
  );
}

function LockedFilterValue({ label, value }: { label?: string; value: string }) {
  return (
    <div
      title={value}
      className="flex h-10 w-full items-center gap-1.5 truncate rounded border border-slate-300 bg-white/60 px-2.5 text-[13px] font-medium text-slate-700"
      style={{
        textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.96), inset 0 -1px 0 rgba(100,116,139,0.20)",
      }}
    >
      {label && <span className="shrink-0 text-[11px] font-semibold tracking-wide text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>{label}</span>}
      <span className="truncate">{value}</span>
    </div>
  );
}

type T0MultiSelectOption = {
  id: string;
  label: string;
  /** 下拉选项可展示完整识别信息；顶部已选摘要可使用更短文案。 */
  summaryLabel?: string;
  /** 推荐总项用靛蓝色区分；推荐子用户与总项同级缩进，明确其为子分类。 */
  kind?: "referral-descendants" | "referral-member";
};

/** 三项多选框按内容保留统一左右留白，初始状态则均分整行宽度。 */
function buildT0FilterGridTemplateColumns(filterSpecs: Array<{ summary: string; selectedCount: number }>) {
  if (filterSpecs.every((spec) => spec.selectedCount === 0)) return undefined;
  const visualUnits = (text: string) => Array.from(text).reduce(
    (total, character) => total + (/^[\x00-\xff]$/.test(character) ? 1 : 2),
    0,
  );
  const widestIndex = filterSpecs.reduce(
    (widest, spec, index) => visualUnits(spec.summary) >= visualUnits(filterSpecs[widest].summary) ? index : widest,
    0,
  );
  if (filterSpecs.every((spec) => spec.selectedCount > 0)) {
    return filterSpecs
      .map((spec) => `minmax(44px, ${Math.max(7, Math.min(24, visualUnits(spec.summary) + 8))}fr)`)
      .join(" ");
  }
  return filterSpecs
    .map((spec, index) => {
      const units = visualUnits(spec.summary);
      if (spec.selectedCount > 0 && index !== widestIndex) {
        return `${Math.max(44, Math.min(148, 20 + units * 7))}px`;
      }
      return `minmax(${spec.selectedCount > 0 ? 52 : 78}px, ${Math.max(5, Math.min(16, units))}fr)`;
    })
    .join(" ");
}

/**
 * T+0 顶部筛选专用：不选任一项即代表全部；勾选多项时在同一维度按并集筛选。
 * 使用普通按钮与小方框勾选，避免移动端原生 multiple select 的长按交互。
 */
function T0MultiSelect({
  label,
  options,
  selectedIds,
  onChange,
  emptyLabel,
  align = "left",
  constrainRightToFilterRow = false,
  compact = false,
  showSelectedLabels = false,
  singleSelect = false,
  treatSelectionAsAll = false,
  summarySuffix,
  additionalToggle,
}: {
  label: string;
  options: T0MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
  align?: "left" | "right";
  /** 菜单右缘固定对齐同一筛选行最右侧的项目框。 */
  constrainRightToFilterRow?: boolean;
  /** 历史筛选栏使用与同行状态控件一致的紧凑高度。 */
  compact?: boolean;
  /** 对类型等短枚举项，直接展示已选名称，而非“已选 N 项”。 */
  showSelectedLabels?: boolean;
  /** 状态等枚举条件只允许选择一个值；“全部”仍通过清空选择表达。 */
  singleSelect?: boolean;
  /** 组合的本人和推荐已覆盖全部可筛选用户时，按“全部”展示但保留可恢复的选择令牌。 */
  treatSelectionAsAll?: boolean;
  /** 独立附加条件的当前摘要，例如“隐藏已锁定”。 */
  summarySuffix?: string;
  /** 在枚举项末尾追加不与主筛选互斥的勾选条件。 */
  additionalToggle?: {
    label: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  };
}) {
  const [open, setOpen] = useState(false);
  const [constrainedMenuWidth, setConstrainedMenuWidth] = useState<number | null>(null);
  const [constrainedMenuRightOffset, setConstrainedMenuRightOffset] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollHapticTimerRef = useRef<number | null>(null);
  const selectedSet = new Set(selectedIds);
  const selectedOptions = options.filter((option) => selectedSet.has(option.id));
  const selectionRepresentsAll = selectedIds.length === 0 || treatSelectionAsAll;
  const baseSummary = selectionRepresentsAll
    ? "全部"
    : selectedOptions.length === 1
      ? selectedOptions[0].summaryLabel ?? selectedOptions[0].label
      : showSelectedLabels
        ? selectedOptions.map((option) => option.summaryLabel ?? option.label).join("、")
        : `已选 ${selectedOptions.length} 项`;
  const summary = summarySuffix ? `${baseSummary} · ${summarySuffix}` : baseSummary;
  const baseSelectedTitle = selectionRepresentsAll
    ? `${label}：全部`
    : `${label}：${selectedOptions.map((option) => option.label).join("、")}`;
  const selectedTitle = summarySuffix ? `${baseSelectedTitle}；${summarySuffix}` : baseSelectedTitle;

  useLayoutEffect(() => {
    if (!open || !constrainRightToFilterRow || !rootRef.current) return;
    const filterRow = rootRef.current.closest("[data-t0-filter-row]");
    if (!(filterRow instanceof HTMLElement)) return;
    const syncMenuRightEdge = () => {
      const triggerBounds = rootRef.current?.getBoundingClientRect();
      const rowBounds = filterRow.getBoundingClientRect();
      if (!triggerBounds) return;
      setConstrainedMenuWidth(Math.min(260, Math.floor(rowBounds.width)));
      setConstrainedMenuRightOffset(Math.floor(triggerBounds.right - rowBounds.right));
    };
    syncMenuRightEdge();
    // 选中单个用户会触发三栏宽度动画；跟随用户框尺寸变化持续重算，
    // 使菜单在动画过程中和结束后都严格对齐项目框右缘。
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(syncMenuRightEdge);
    resizeObserver?.observe(rootRef.current);
    resizeObserver?.observe(filterRow);
    window.addEventListener("resize", syncMenuRightEdge);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncMenuRightEdge);
    };
  }, [constrainRightToFilterRow, open, selectedIds.join("|")]);

  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeWhenEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeWhenOutside);
    window.addEventListener("keydown", closeWhenEscape);
    return () => {
      window.removeEventListener("pointerdown", closeWhenOutside);
      window.removeEventListener("keydown", closeWhenEscape);
    };
  }, []);

  useEffect(() => () => {
    if (scrollHapticTimerRef.current !== null) window.clearTimeout(scrollHapticTimerRef.current);
  }, []);

  const toggleOption = (id: string) => {
    if (singleSelect) {
      onChange([id]);
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(options.filter((option) => next.has(option.id)).map((option) => option.id));
  };

  const handleMenuScroll = () => {
    // 卡点由 scroll-snap 提供；支持 Vibration API 的手机在滚动停下时补一记极短触感。
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (scrollHapticTimerRef.current !== null) window.clearTimeout(scrollHapticTimerRef.current);
    scrollHapticTimerRef.current = window.setTimeout(() => {
      navigator.vibrate(7);
      scrollHapticTimerRef.current = null;
    }, 90);
  };

  const renderCheck = (checked: boolean) => (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border ${checked ? "border-[#1a56db] bg-[#1a56db] text-white" : "border-slate-300 bg-white text-transparent"}`}
    >
      <Check className="h-3.5 w-3.5 stroke-[3]" />
    </span>
  );

  if (options.length === 0) {
    return <LockedFilterValue label={label} value={emptyLabel} />;
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          const nextOpen = !open;
          if (nextOpen && constrainRightToFilterRow && rootRef.current) {
            const filterRow = rootRef.current.closest("[data-t0-filter-row]");
            if (filterRow instanceof HTMLElement) {
              const triggerBounds = rootRef.current.getBoundingClientRect();
              const rowBounds = filterRow.getBoundingClientRect();
              // 无论用户框在智能栅格中被压缩到多窄，菜单右缘都要与项目框右缘重合；
              // 宽度同时不得超过整行，避免窄屏向任一侧越界。
              setConstrainedMenuWidth(Math.min(260, Math.floor(rowBounds.width)));
              setConstrainedMenuRightOffset(Math.floor(triggerBounds.right - rowBounds.right));
            }
          } else if (!nextOpen) {
            setConstrainedMenuWidth(null);
            setConstrainedMenuRightOffset(null);
          }
          setOpen(nextOpen);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selectedTitle}
        className={`flex w-full min-w-0 items-center gap-1.5 rounded border border-slate-300 bg-white/70 font-medium text-slate-700 outline-none transition-colors focus:border-[#1a56db] active:bg-white ${compact ? "h-8 px-2 text-[12px]" : "h-10 px-2.5 text-[13px]"}`}
        style={{
          textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)",
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.96), inset 0 -1px 0 rgba(100,116,139,0.20)",
        }}
      >
        {selectedIds.length === 0 && <span className={`${compact ? "text-[11px]" : "text-[12px]"} shrink-0 font-semibold tracking-wide text-slate-500`}>{label}</span>}
        <span className={`min-w-0 flex-1 truncate ${selectedIds.length === 0 ? "text-left" : "text-center"}`}>{summary}</span>
        {selectedIds.length === 0 && <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label}多选`}
          onScroll={handleMenuScroll}
          className={`absolute top-[calc(100%+4px)] z-40 max-h-80 w-[min(260px,calc(100vw-32px))] snap-y snap-proximity overscroll-contain overflow-y-auto rounded border py-0 shadow-xl ${constrainedMenuRightOffset !== null ? "" : align === "right" ? "right-0" : "left-0"}`}
          style={{
            width: constrainedMenuWidth ? `${constrainedMenuWidth}px` : undefined,
            right: constrainedMenuRightOffset === null ? undefined : `${constrainedMenuRightOffset}px`,
            background: [
              "linear-gradient(135deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.32) 25%, rgba(255,255,255,0) 50%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.19) 100%)",
              "linear-gradient(90deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 40%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.12) 100%)",
              "linear-gradient(180deg, rgba(0,0,0,0.07) 0%, rgba(255,255,255,0.20) 36%, rgba(255,255,255,0.28) 52%, rgba(255,255,255,0.09) 70%, rgba(0,0,0,0.10) 100%)",
              "linear-gradient(160deg, #e4e7eb 0%, #c9cfd6 20%, #dde1e6 45%, #bec6cf 65%, #d7dce2 80%, #e2e6ea 100%)",
            ].join(", "),
            borderColor: "rgba(153,164,177,0.96)",
            boxShadow: "0 12px 22px rgba(15,23,42,0.20), 0 3px 7px rgba(15,23,42,0.12), inset 0 1.5px 0 rgba(255,255,255,0.92), inset 0 -1.5px 0 rgba(71,85,105,0.28)",
          }}
        >
          <div
            role="option"
            aria-selected={selectionRepresentsAll}
            className={`flex min-h-12 w-full snap-start items-center gap-2 border-b border-slate-500/25 px-3.5 py-2 text-[15px] font-bold shadow-[inset_0_-1px_0_rgba(255,255,255,0.58)] ${selectionRepresentsAll ? "bg-white/68 text-[#1a56db]" : "bg-white/30 text-slate-700"}`}
          >
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex min-h-8 min-w-0 flex-1 items-center gap-3 text-left active:opacity-70"
            >
              {renderCheck(selectionRepresentsAll)}
              <span>全部</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConstrainedMenuWidth(null);
                setConstrainedMenuRightOffset(null);
              }}
              aria-label={`确认${label}筛选`}
              className="h-8 shrink-0 rounded border border-slate-400/70 bg-white/78 px-3 text-[12px] font-bold text-[#1a56db] shadow-[inset_0_1px_0_rgba(255,255,255,0.96),inset_0_-1px_0_rgba(71,85,105,0.24),0_1px_1px_rgba(15,23,42,0.12)] transition active:scale-95 active:bg-white"
            >
              确定
            </button>
          </div>
          {options.map((option) => {
            const checked = selectedSet.has(option.id);
            const isReferralChild = option.kind === "referral-descendants" || option.kind === "referral-member";
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggleOption(option.id)}
                className={`flex min-h-12 w-full snap-start items-center gap-3 border-b border-slate-500/20 py-3 text-left text-[15px] font-bold shadow-[inset_0_-1px_0_rgba(255,255,255,0.5)] last:border-b-0 last:shadow-none ${isReferralChild ? "pl-8 pr-3.5" : "px-3.5"} ${checked ? "bg-white/55 text-[#1a56db]" : option.kind === "referral-descendants" ? "text-indigo-700 active:bg-indigo-50/60" : "text-slate-700 active:bg-white/55"}`}
              >
                {renderCheck(checked)}
                <span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
              </button>
            );
          })}
          {additionalToggle && <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={additionalToggle.checked}
            onClick={() => additionalToggle.onCheckedChange(!additionalToggle.checked)}
            className={`flex min-h-12 w-full snap-start items-center gap-3 border-t border-slate-500/30 px-3.5 py-3 text-left text-[15px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.58)] ${additionalToggle.checked ? "bg-white/55 text-[#1a56db]" : "text-slate-700 active:bg-white/55"}`}
          >
            {renderCheck(additionalToggle.checked)}
            <span className="min-w-0 flex-1 truncate">{additionalToggle.label}</span>
          </button>}
        </div>
      )}
    </div>
  );
}

function AccountOverview({
  summary,
  positionStats,
  showCumulativeData,
  onToggleCumulativeData,
  showCommission = true,
  isMemberView = false,
  onExplainGrossProfit,
}: {
  summary: {
    long: { quantity: number; average: number; unrealized: number | null; realizedGross: number; realizedOpeningFee: number; realizedClosingFee: number; realized: number; turnover: number; commission: number; closedQuantity: number; closedAverageCost: number; closedAveragePrice: number; activeLevels: number };
    short: { quantity: number; average: number; unrealized: number | null; realizedGross: number; realizedOpeningFee: number; realizedClosingFee: number; realized: number; turnover: number; commission: number; closedQuantity: number; closedAverageCost: number; closedAveragePrice: number; activeLevels: number };
  };
  /** 顶行仓位严格按状态筛选范围统计；下方财务数据仍仅来自实际成交单。 */
  positionStats?: Record<PositionSide, { quantity: number; activeLevels: number }>;
  showCumulativeData: boolean;
  onToggleCumulativeData: () => void;
  showCommission?: boolean;
  isMemberView?: boolean;
  onExplainGrossProfit: (side: PositionSide, data: { realizedGross: number; realizedOpeningFee: number; realizedClosingFee: number; realized: number }) => void;
}) {
  const pnlColor = (value: number | null) => value === null ? "text-slate-400" : value >= 0 ? "text-rose-600" : "text-emerald-600";
  const sides: Array<{ side: PositionSide; data: typeof summary.long }> = [
    { side: "long", data: summary.long },
    { side: "short", data: summary.short },
  ];

  if (isMemberView) return null;

  return (
    <div className="border-t border-slate-100 bg-slate-50 p-2">
      <div className="overflow-hidden rounded border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.035)]">
        <div className="grid grid-cols-2">
          {sides.map(({ side, data }) => {
            const isLong = side === "long";
            const positionData = positionStats?.[side] ?? data;
            return (
              <div
                key={side}
                className={`min-w-0 px-3 py-2.5 text-left ${isLong ? "border-r border-slate-100" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className={`shrink-0 text-xs font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{isLong ? "多" : "空"}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{positionData.activeLevels}档</span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-1">
                    <span className="text-sm tabular-nums font-semibold text-slate-900">{formatQuantity(positionData.quantity)}</span>
                    <span className="text-[11px] text-slate-500">ETH</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {!isMemberView && showCumulativeData && (
          <div className="grid grid-cols-2 border-t border-slate-100 text-[11px] tabular-nums">
            {sides.map(({ side, data }) => {
              const isLong = side === "long";
              const profitTone = data.realized >= 0 ? "text-rose-600 border-rose-500" : "text-emerald-600 border-emerald-500";
              return (
                <section key={side} className={`min-w-0 ${isLong ? "border-r border-slate-100" : ""}`}>
                  <div className="space-y-0">
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">累计净收益</span>
                      <button
                        type="button"
                        onClick={() => onExplainGrossProfit(side, data)}
                        className={`whitespace-nowrap border-b border-dotted pb-0.5 text-[11px] font-semibold outline-none ${profitTone}`}
                        aria-label={`查看${isLong ? "多仓" : "空仓"}累计净收益说明`}
                      >
                        {formatSigned(data.realized)} U
                      </button>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">持仓均价</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{data.quantity > 0 ? formatPrice(data.average) : formatAmount(0)} U</span>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">累计平仓</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{formatQuantity(data.closedQuantity)} ETH</span>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">原始平均成本</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{data.closedQuantity > 0 ? formatPrice(data.closedAverageCost) : formatAmount(0)} U</span>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">平均平仓价</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{data.closedQuantity > 0 ? formatPrice(data.closedAveragePrice) : formatAmount(0)} U</span>
                    </div>
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">累计交易额</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{formatAmount(data.turnover)} U</span>
                    </div>
                    {showCommission && <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">累计佣金</span>
                      <span className="whitespace-nowrap text-[11px] font-semibold text-slate-700">{formatAmount(data.commission)} U</span>
                    </div>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        {!isMemberView && <button
          type="button"
          onClick={onToggleCumulativeData}
          aria-label={showCumulativeData ? "收起持仓与累计数据" : "展开持仓与累计数据"}
          aria-expanded={showCumulativeData}
          className="flex w-full items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2 text-left text-slate-600 transition-colors active:bg-slate-100"
        >
          <span className="text-[11px] font-medium">{showCumulativeData ? "收起" : "详情"}</span>
          <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${showCumulativeData ? "-rotate-90" : "rotate-90"}`} />
        </button>}
      </div>
    </div>
  );
}

/**
 * 期权在仓位详情中也必须显示与报价格相同的实时收益。
 * 成员端仅将收益按分配比例折算，订单数量仍展示完整的原始数量。
 */
function OptionUnrealizedPnlText({
  trade,
  remainingQuantity,
  ethMarkPrice,
  emptyLabel = "--",
  className = "",
}: {
  trade: PreviewTrade;
  remainingQuantity: number;
  ethMarkPrice: number | null;
  emptyLabel?: string;
  className?: string;
}) {
  const optionGreeks = useOptionGreeks({
    currency: "ETH",
    exerciseDate: trade.optionExpiryDate ?? "",
    strikePrice: Number(trade.price) || 0,
    direction: trade.optionDirection ?? "long_call",
    enabled: trade.instrumentType === "option" && !trade.isPending && Boolean(trade.optionExpiryDate) && Number(trade.price) > 0,
  });
  const optionPnl = calculateOptionUnrealizedPnl({
    quantity: getTradeFinancialQuantity(trade, remainingQuantity),
    optionMarkPrice: resolveUsableOptionMarkPrice(optionGreeks.data?.markPrice, trade.optionMarkPrice),
    premium: trade.optionPremium,
    premiumCurrency: trade.optionPremiumCurrency,
    ethMarkPrice,
    direction: trade.optionDirection,
  })?.pnl ?? null;
  const tone = optionPnl === null
    ? "text-slate-400"
    : optionPnl >= 0
      ? "text-rose-600"
      : "text-emerald-600";
  return <span className={`${className} ${tone}`}>{optionPnl === null ? emptyLabel : `${formatSigned(optionPnl)} U`}</span>;
}

function PositionCell({ bucket, side, markPrice, onClick, readOnly = false, metadata, isLocked = false, hasLockedPosition = false, isCounterparty = false, isPending = false, takeProfitEnabled = false, takeProfitQuantity }: {
  bucket: PositionBucket;
  side: PositionSide;
  markPrice: number | null;
  onClick: () => void;
  readOnly?: boolean;
  metadata?: LadderCellMetadata;
  /** 仅管理员逐笔报价使用的黑金锁定外观。 */
  isLocked?: boolean;
  /** 整合报价档位中含有锁定仓位时展示黑金锁标；仅全部锁定时整格切换黑金底。 */
  hasLockedPosition?: boolean;
  /** 管理端反向展示订单，使用紫色双向图标与普通多空区分。 */
  isCounterparty?: boolean;
  /** 仅管理员逐笔报价使用：挂单未成交，采用浅蓝状态底并不展示盈亏。 */
  isPending?: boolean;
  /** 已设止盈在挂单成交后继续保留；部分止盈同时显示计划数量。 */
  takeProfitEnabled?: boolean;
  takeProfitQuantity?: number;
}) {
  const isLong = side === "long";
  const isOption = bucket.instrumentType === "option";
  const isGrid = bucket.instrumentType === "grid";
  // 有订单元数据即逐笔报价；整合报价只用灰字摘要表达挂/锁，始终保留基础多红空绿底色。
  const isIndividualQuote = Boolean(metadata);
  const pendingQuantity = Math.min(bucket.remainingQuantity, Math.max(0, bucket.pendingQuantity ?? 0));
  const hasPendingQuantity = pendingQuantity > 0.0000001;
  const isPendingOnly = isPending || (hasPendingQuantity && pendingQuantity >= bucket.remainingQuantity - 0.0000001);
  const hasMixedPending = hasPendingQuantity && !isPendingOnly;
  const lockedQuantity = Math.min(
    bucket.remainingQuantity,
    Math.max(0, bucket.lockedRemainingQuantity ?? (isLocked ? bucket.remainingQuantity : 0)),
  );
  const hasLockedQuantity = lockedQuantity > 0.0000001;
  const takeProfitMarkerLabel = getTakeProfitMarkerLabel(takeProfitEnabled, takeProfitQuantity, bucket.remainingQuantity);
  // T 型报价中，全数止盈仅保留目标图标；部分止盈才紧跟计划数量，避免与“合/期”类型字抢占空间。
  const takeProfitMarkerQuantity = takeProfitMarkerLabel?.replace(/^止盈/, "") || null;
  // 整合报价用第二行摘要呈现挂单/锁定数量，避免与第一行的数量和盈亏金额抢占横向空间。
  const integratedStatusSummary = !isIndividualQuote
    ? [
      hasPendingQuantity ? `挂 ${formatIntegratedStatusQuantity(pendingQuantity)}` : null,
      hasLockedQuantity ? `锁 ${formatIntegratedStatusQuantity(lockedQuantity)}` : null,
    ].filter((item): item is string => Boolean(item)).join(" · ")
    : "";
  const usePendingStatusSkin = isIndividualQuote && isPendingOnly;
  const useLockedStatusSkin = isIndividualQuote && isLocked;
  const optionMetadata = metadata?.option;
  const optionGreeks = useOptionGreeks({
    currency: "ETH",
    exerciseDate: optionMetadata?.expiryDate ?? "",
    strikePrice: Number(optionMetadata?.strikePrice) || 0,
    direction: optionMetadata?.direction ?? "long_call",
    enabled: isOption && !isPendingOnly && Boolean(optionMetadata?.expiryDate) && Number(optionMetadata?.strikePrice) > 0,
  });
  const optionPnlResult = isOption && !isPendingOnly
    ? calculateOptionUnrealizedPnl({
      // 成员收益投影视图保留原始 ETH 数量展示，但收益必须按其分配比例折算。
      quantity: bucket.financialQuantity,
      optionMarkPrice: resolveUsableOptionMarkPrice(optionGreeks.data?.markPrice, optionMetadata?.cachedMarkPrice),
      premium: optionMetadata?.premium,
      premiumCurrency: optionMetadata?.premiumCurrency,
      ethMarkPrice: markPrice,
      direction: optionMetadata?.direction,
    })
    : null;
  const tone = usePendingStatusSkin
    ? `text-slate-700${readOnly ? "" : " hover:brightness-[0.98]"}`
    : useLockedStatusSkin
    ? `text-[#f5d78e]${readOnly ? "" : " hover:brightness-110"}`
    : isOption
    ? `text-[#f5e9ff]${readOnly ? "" : " hover:brightness-110"}`
    : isGrid
    ? `text-cyan-950${readOnly ? "" : " hover:brightness-105"}`
    : isLong
    ? `text-rose-600${readOnly ? "" : " hover:brightness-105"}`
    : `text-emerald-800${readOnly ? "" : " hover:brightness-105"}`;
  const sideSurfaceStyle = isLong
    ? {
      background: "linear-gradient(90deg, rgba(255,255,255,0.56), rgba(255,228,230,0.70) 58%, rgba(254,205,211,0.54))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.88), inset 0 -1px 0 rgba(159,18,57,0.11)",
    }
    : {
      background: "linear-gradient(90deg, rgba(209,250,229,0.54), rgba(236,253,245,0.70) 42%, rgba(255,255,255,0.56))",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.88), inset 0 -1px 0 rgba(6,95,70,0.11)",
    };
  const lockedSurfaceStyle = {
    background: [
      "linear-gradient(115deg, rgba(245,215,142,0.18) 0%, rgba(245,215,142,0.04) 23%, transparent 46%, rgba(201,168,76,0.12) 100%)",
      "repeating-linear-gradient(170deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 4px)",
      "linear-gradient(135deg, #090909 0%, #19150e 48%, #11100d 100%)",
    ].join(", "),
    boxShadow: "inset 0 1px 0 rgba(245,215,142,0.24), inset 0 -1px 0 rgba(0,0,0,0.82), inset 1px 0 0 rgba(201,168,76,0.22), inset -1px 0 0 rgba(201,168,76,0.16)",
  };
  const pendingSurfaceStyle = {
    background: "linear-gradient(90deg, rgba(239,246,255,0.96), rgba(219,234,254,0.78) 58%, rgba(224,242,254,0.64))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(2,132,199,0.14), inset 1px 0 0 rgba(56,189,248,0.10)",
  };
  const gridSurfaceStyle = {
    background: "linear-gradient(112deg, rgba(236,254,255,0.96), rgba(207,250,254,0.78) 52%, rgba(165,243,252,0.60))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(8,145,178,0.18), inset 1px 0 0 rgba(34,211,238,0.16)",
  };
  const surfaceStyle = usePendingStatusSkin
    ? pendingSurfaceStyle
    : useLockedStatusSkin
    ? lockedSurfaceStyle
    : isOption
    ? T0_OPTION_METAL_SURFACE_STYLE
    : isGrid
    ? gridSurfaceStyle
    : sideSurfaceStyle;
  const quantityTextStyle = usePendingStatusSkin
    ? { textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.92), 0.75px 0.75px 0 rgba(2,132,199,0.18)" }
    : useLockedStatusSkin
    ? {
      background: "linear-gradient(180deg, #fff1bd 0%, #f5d78e 38%, #c9a84c 72%, #f5d78e 100%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.92))",
    }
    : isOption
    ? { textShadow: "0 1px 1.5px rgba(46,16,101,0.88), 0 -0.5px 1px rgba(255,255,255,0.30)" }
    : isGrid
    ? { textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.94), 0.75px 0.75px 0 rgba(8,145,178,0.22)" }
    : { textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.88), 0.75px 0.75px 0 rgba(71,85,105,0.20)" };
  const floatingPnl = isPendingOnly
    ? null
    : isOption
    ? optionPnlResult?.pnl ?? null
    : calculateEstimatedUnrealizedNetPnl(side, markPrice, bucket.financialQuantity, bucket.financialCostBasis);
  // 期权收益率以开仓权利金总成本为基数，普通仓位继续使用剩余成交成本；两者均不计资金费。
  const floatingReturnBase = isOption ? optionPnlResult?.premiumTotal ?? null : bucket.financialCostBasis;
  const floatingReturnRate = floatingPnl === null || floatingReturnBase === null || floatingReturnBase <= 0
    ? null
    : floatingPnl / floatingReturnBase;
  const pnlTone = floatingPnl !== null && floatingPnl >= 0
    ? (isOption ? "text-rose-200" : "text-rose-600")
    : (isOption ? "text-emerald-200" : "text-emerald-600");
  // 全局盈亏颜色口径：盈利红、亏损绿。紫色金属底采用高饱和亮红/亮绿，避免浅粉在手机屏上显成金色。
  const optionPnlColor = floatingPnl !== null && floatingPnl >= 0 ? "#ff4d4f" : "#4ade80";
  // 精确沿用黑金锁定格金额的细白高光与单侧灰影；不再使用厚重的四向描边。
  const pnlTextStyle = { textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.84), 0.55px 0.55px 0 rgba(71,85,105,0.18)" };
  const content = (
    <div className="w-full min-w-0">
      <div className={`flex w-full min-w-0 justify-between gap-2 tabular-nums ${metadata ? "items-center" : "items-start"}`}>
        <div className={metadata ? "flex min-w-0 items-center gap-1.5" : "flex min-h-[30px] min-w-0 flex-col justify-between"}>
          <span className={`shrink-0 font-bold leading-none tracking-tight ${metadata ? "text-xl" : "text-lg"} ${usePendingStatusSkin ? "text-sky-700" : ""}`} style={quantityTextStyle}>{formatLadderQuantity(bucket.remainingQuantity)}</span>
          {!metadata && integratedStatusSummary && <span className="shrink-0 whitespace-nowrap text-[9px] font-medium leading-none text-slate-400" title={`本档${integratedStatusSummary}`} aria-label={`本档${integratedStatusSummary}`}>{integratedStatusSummary}</span>}
          {hasMixedPending && metadata && <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold leading-none text-sky-700" title={`含挂单 ${formatLadderQuantity(pendingQuantity)} ETH`} aria-label={`含挂单 ${formatLadderQuantity(pendingQuantity)} ETH`}><Clock3 className="h-3 w-3" strokeWidth={2.35} /><span>挂{formatLadderQuantity(pendingQuantity)}</span></span>}
        </div>
        {floatingPnl !== null && (
          <span className={`flex min-h-[30px] shrink-0 flex-col items-end justify-between text-right ${pnlTone}`} style={isOption ? { color: optionPnlColor, textShadow: "none" } : undefined}>
            <span className={`whitespace-nowrap font-semibold leading-none ${metadata ? "text-[10px]" : "text-[11px]"}`} style={pnlTextStyle}>{formatSigned(floatingPnl)}</span>
            {floatingReturnRate !== null && (
              <span className={`${metadata ? "mt-0.5 text-[9px]" : "text-[10px]"} font-medium leading-none opacity-85`}>{formatSignedPercent(floatingReturnRate)}</span>
            )}
          </span>
        )}
      </div>
      {metadata && <div className={`mt-1 flex min-w-0 items-center text-left text-[9px] font-medium leading-none ${isLocked && !isPendingOnly ? "text-[#c9a84c]/85" : isOption ? "text-violet-100/90" : isGrid ? "text-cyan-800/90" : "text-slate-500"}`} aria-label={`${metadata.accountName ? `账户 ${metadata.accountName}，` : ""}用户 ${metadata.relatedUserName}，项目 ${metadata.relatedFundName}${metadata.instrumentShortLabel ? `，类型 ${metadata.instrumentShortLabel}` : ""}${isPendingOnly ? "，挂单待成交" : ""}`}>
        <div className="flex min-w-0 flex-1 items-center overflow-hidden">
          {metadata.accountName && <>
            <span className="min-w-0 shrink truncate" title={`账户：${metadata.accountName}`}>{metadata.accountName}</span>
            <span className="shrink-0">·</span>
          </>}
          <span className="min-w-0 shrink truncate" title={`用户：${metadata.relatedUserName}`}>{metadata.relatedUserName}</span>
          <span className="shrink-0">·</span>
          <span className="min-w-0 shrink truncate" title={`项目：${metadata.relatedFundName}`}>{metadata.relatedFundName}</span>
        </div>
        {(isLocked || isCounterparty || isPendingOnly || takeProfitMarkerLabel || metadata.instrumentShortLabel) && <div className="ml-1 flex shrink-0 items-center gap-0.5">
          {isLocked && <Lock className="h-2 w-2 shrink-0 -translate-y-px text-[#f5d78e]/85" strokeWidth={2.5} aria-label="已锁定" />}
          {isCounterparty && <Repeat2 className="h-2.5 w-2.5 shrink-0 text-violet-700" strokeWidth={2.7} aria-label="管理员反向展示" />}
          {isPendingOnly && <Clock3 className="h-[9px] w-[9px] shrink-0 -translate-y-px text-sky-600" strokeWidth={2.5} aria-label="挂单待成交" />}
          {takeProfitMarkerLabel && <span className={`inline-flex shrink-0 items-center gap-px font-semibold ${isLocked && !isPendingOnly ? "text-[#f5d78e]/85" : "text-amber-600"}`} title={takeProfitMarkerLabel} aria-label={takeProfitMarkerLabel}><Target className="h-[9px] w-[9px] -translate-y-px" strokeWidth={2.5} />{takeProfitMarkerQuantity && <span>{takeProfitMarkerQuantity}</span>}</span>}
          {metadata.instrumentShortLabel && <span className={isLocked && !isPendingOnly ? "text-[#f5d78e]/85" : isOption ? "text-violet-100" : isGrid ? "text-cyan-800" : "text-slate-500"} title={metadata.instrumentShortLabel}>{metadata.instrumentShortLabel}</span>}
        </div>}
      </div>}
    </div>
  );
  const minHeightClass = metadata ? "min-h-[58px]" : "min-h-[52px]";
  if (readOnly) {
    return <div className={`flex ${minHeightClass} w-full min-w-0 items-center px-1.5 py-1.5 ${tone}`} style={surfaceStyle}>{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="双击查看该价格档订单详情"
      title="双击查看详情"
      className={`flex ${minHeightClass} w-full min-w-0 items-center px-1.5 py-1.5 text-left transition-[filter] active:brightness-95 ${tone}`}
      style={{ ...surfaceStyle, touchAction: "manipulation" }}
    >
      {content}
    </button>
  );
}

function LadderCell({
  bucket,
  side,
  markPrice,
  onClose,
  onOpen,
  readOnly = false,
  metadata,
  isLocked = false,
  hasLockedPosition = false,
  isCounterparty = false,
  isPending = false,
  takeProfitEnabled = false,
  takeProfitQuantity,
}: {
  bucket?: PositionBucket;
  side: PositionSide;
  markPrice: number | null;
  onClose: () => void;
  onOpen: () => void;
  readOnly?: boolean;
  metadata?: LadderCellMetadata;
  isLocked?: boolean;
  hasLockedPosition?: boolean;
  isCounterparty?: boolean;
  isPending?: boolean;
  takeProfitEnabled?: boolean;
  takeProfitQuantity?: number;
}) {
  // 统一由报价格本身处理：移动端与桌面端都必须在同一格 700ms 内连续点击两次，
  // 才允许打开已有订单详情、编辑页或空档位的新开仓录入，杜绝单击误触。
  const activationTapAtRef = useRef(0);
  const requireDoubleActivation = (action: () => void) => () => {
    const now = Date.now();
    if (now - activationTapAtRef.current > 700) {
      activationTapAtRef.current = now;
      return;
    }
    activationTapAtRef.current = 0;
    action();
  };
  if (bucket && bucket.remainingQuantity > 0.0000001) {
    return <PositionCell bucket={bucket} side={side} markPrice={markPrice} onClick={requireDoubleActivation(onClose)} readOnly={readOnly} metadata={metadata} isLocked={isLocked} hasLockedPosition={hasLockedPosition} isCounterparty={isCounterparty} isPending={isPending} takeProfitEnabled={takeProfitEnabled} takeProfitQuantity={takeProfitQuantity} />;
  }

  const isLong = side === "long";
  if (readOnly) {
    return <div className="min-h-[52px] w-full" />;
  }
  return (
    <button
      type="button"
      onClick={requireDoubleActivation(onOpen)}
      aria-label={isLong ? "双击在该价格档位开多" : "双击在该价格档位开空"}
      title={isLong ? "双击开多" : "双击开空"}
      className="min-h-[52px] w-full transition-colors hover:bg-white/25 active:brightness-95"
      style={{ touchAction: "manipulation" }}
    />
  );
}

/** 独立路由继续使用无参数组件，避免影响 wouter 的路由组件签名。 */
export default function T0Journal() {
  return <T0JournalView />;
}
