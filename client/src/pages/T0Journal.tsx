import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Lock,
  LockOpen,
  MoreHorizontal,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useOptionGreeks } from "@/hooks/useOptionGreeks";

type TradeAction = "openLong" | "closeLong" | "openShort" | "closeShort";
type PositionSide = "long" | "short";
type T0InstrumentType = "spot" | "contract" | "option";
type T0OptionDirection = "long_call" | "long_put" | "short_call" | "short_put";
type T0OptionPremiumCurrency = "USDT" | "ETH";
type T0ExecutionFilter = "all" | "filled" | "pending";
const T0_INSTRUMENT_TYPES: Array<{ value: T0InstrumentType; label: string; shortLabel: string }> = [
  { value: "spot", label: "现货", shortLabel: "现" },
  { value: "contract", label: "合约", shortLabel: "合" },
  { value: "option", label: "期权", shortLabel: "期" },
];
const T0_INSTRUMENT_FILTER_OPTIONS: T0MultiSelectOption[] = T0_INSTRUMENT_TYPES.map((item) => ({
  id: item.value,
  label: item.label,
}));

/** 空数组代表全部；勾满三个类型同样回归“全部类型”，避免出现重复的全选状态。 */
function normalizeT0InstrumentTypeFilterIds(ids: string[]): T0InstrumentType[] {
  const selected = T0_INSTRUMENT_TYPES
    .map((item) => item.value)
    .filter((type) => ids.includes(type));
  return selected.length === T0_INSTRUMENT_TYPES.length ? [] : selected;
}

function getT0InstrumentFilterSummary(selectedTypes: T0InstrumentType[]): string {
  if (selectedTypes.length === 0) return "类型全部";
  if (selectedTypes.length === 1) {
    return T0_INSTRUMENT_TYPES.find((item) => item.value === selectedTypes[0])?.label ?? "类型";
  }
  return `已选 ${selectedTypes.length} 项`;
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
  /** 到期自动结算时每 ETH 期权获得或支付的最终价值（USDT）。 */
  optionSettlementPrice?: number;
  /** Deribit 最终 delivery 使用的 ETH 指数交割价（USDT）。 */
  optionDeliveryPrice?: number;
  optionSettledAt?: string;
  optionSettlementSource?: string;
  /** 开仓主单的展示锁定标记；成员端只读展示。 */
  isLocked?: boolean;
  /** 管理员报价专用：挂单在触发前不进入真实仓位、盈亏或费用计算。 */
  isPending?: boolean;
  /** 挂单实际触发成交的系统时间与统一行情价格；关联成员可只读查看。 */
  filledAt?: string;
  filledPrice?: number;
  quantity: number;
  price: number;
  fee: number;
  createdAt: string;
  targetPrice?: number;
  note?: string;
  clientRequestId?: string;
  isSyncing?: boolean;
  /** 仅成员收益投影视图使用：ETH 数量保持完整，利润与交易成本按此比例结算。 */
  profitShareRate?: number;
};

type LadderOptionMetadata = {
  direction?: T0OptionDirection;
  expiryDate?: string;
  strikePrice?: number;
  premium?: number;
  premiumCurrency?: T0OptionPremiumCurrency;
};

type LadderCellMetadata = {
  accountName: string;
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
    instrumentType: entry.instrumentType === "spot" || entry.instrumentType === "contract" || entry.instrumentType === "option"
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
    optionSettlementPrice: entry.optionSettlementPrice === undefined || entry.optionSettlementPrice === null
      ? undefined
      : Number(entry.optionSettlementPrice),
    optionDeliveryPrice: entry.optionDeliveryPrice === undefined || entry.optionDeliveryPrice === null
      ? undefined
      : Number(entry.optionDeliveryPrice),
    optionSettledAt: entry.optionSettledAt ? String(entry.optionSettledAt) : undefined,
    optionSettlementSource: entry.optionSettlementSource ? String(entry.optionSettlementSource) : undefined,
    isLocked: Boolean(entry.isLocked),
    isPending: Boolean(entry.isPending),
    filledAt: entry.filledAt ? String(entry.filledAt) : undefined,
    filledPrice: entry.filledPrice === undefined || entry.filledPrice === null ? undefined : Number(entry.filledPrice),
    quantity: Number(entry.quantity),
    price: Number(entry.price),
    fee: Number(entry.fee || 0),
    createdAt: String(entry.createdAt),
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
  /** 管理员“逐笔报价”模式中对应的单条未平仓主单。 */
  openingTrade?: PreviewTrade;
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
  /** 开仓订单默认为未锁；锁定后仅管理员逐笔报价使用黑金标识。 */
  isLocked: boolean;
  /** 仅开仓：默认直接成交；设为挂单后等待统一标记价自动触发。 */
  isPending: boolean;
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

const LADDER_MIN_PRICE = 2500;
const LADDER_MAX_PRICE = 3000;
const LADDER_STEP = 10;
const LADDER_NEAR_VISIBLE_STEPS = 3;
const POSITION_ARCHIVE_STEP = 10;
const INTEGRATED_ARCHIVE_STEPS = [10, 25, 50, 100, 250, 500] as const;
type IntegratedArchiveStep = (typeof INTEGRATED_ARCHIVE_STEPS)[number];
// T+0 只读取服务端的 ETH 永续专用内存缓存；500ms 的页面节拍可呈现实时流，同时不直连外部交易所。
const T0_PRICE_REFRESH_INTERVAL_MS = 500;
const T0_JOURNAL_REFRESH_INTERVAL_MS = 5_000;
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
  const defaultCenter = Math.round((LADDER_MIN_PRICE + LADDER_MAX_PRICE) / 2 / safeStep) * safeStep;
  const center = Math.min(LADDER_MAX_PRICE, Math.max(LADDER_MIN_PRICE, markLadderPrice ?? defaultCenter));
  const levels = new Set<number>();

  for (let offset = -LADDER_NEAR_VISIBLE_STEPS; offset <= LADDER_NEAR_VISIBLE_STEPS; offset += 1) {
    const price = center + offset * safeStep;
    if (price >= LADDER_MIN_PRICE && price <= LADDER_MAX_PRICE) levels.add(price);
  }
  if (markLadderPrice !== null) levels.add(markLadderPrice);
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

/** 已触发的挂单同时保留原始挂单时间与实际成交时间；普通成交单仅展示原始下单时间。 */
function formatT0TradeTimeline(trade: Pick<PreviewTrade, "createdAt" | "filledAt">) {
  const createdAt = formatBeijingMonthDayTime(trade.createdAt);
  return trade.filledAt
    ? `挂单 ${createdAt} · 成交 ${formatBeijingMonthDayTime(trade.filledAt)}`
    : createdAt;
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

function buildRecentJournalTradeDetails(trades: PreviewTrade[]) {
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
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  for (const trade of orderedTrades) {
    const config = ACTIONS[trade.action];
    const side = config.side;
    const key = [
      side,
      priceKey(archivePriceForTrade(trade)),
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

function buildPositionBuckets(trades: PreviewTrade[]) {
  const buckets = new Map<string, PositionBucket>();
  const orderedTrades = [...trades].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

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
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

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
    .sort((a, b) => b.trade.createdAt.localeCompare(a.trade.createdAt) || b.trade.id.localeCompare(a.trade.id));
}

/**
 * 将平仓流水按同一账户、关联用户、专项款、方向和十美元归属档位，依时间顺序分配至开仓主单。
 * 这是价格簿现有平仓可用量口径的逐笔展开：一笔平仓若跨越多张主单，会在各主单下显示实际分配量。
 */
function buildOpeningClosingAllocations(trades: PreviewTrade[]) {
  const openingQueues = new Map<string, Array<{ entryId: string; remainingQuantity: number }>>();
  const allocations = new Map<string, LinkedClosingAllocation[]>();
  const orderedTrades = [...trades]
    .filter((trade) => trade.symbol === "ETH")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

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
      queue.push({ entryId: trade.id, remainingQuantity: trade.quantity });
      openingQueues.set(scopeKey, queue);
      continue;
    }

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

/**
 * 整合报价的宽档仅聚合展示：先沿用十美元真实 FIFO 得出每张主单的剩余数量，
 * 再按所选宽度归档。因此切换 25/50/100U 等宽度不会让已平仓位回补，也不会改变真实可平数量。
 */
function buildIntegratedDisplayBuckets(
  trades: PreviewTrade[],
  allocations: Map<string, LinkedClosingAllocation[]>,
  archiveStep: number,
) {
  const displayBuckets = new Map<string, PositionBucket>();

  for (const trade of trades) {
    if (!ACTIONS[trade.action].opening || trade.isPending || trade.symbol !== "ETH") continue;
    const linkedClosings = allocations.get(trade.id) ?? [];
    const closedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
    const remainingQuantity = Math.max(0, trade.quantity - closedQuantity);
    if (remainingQuantity <= 0.0000001) continue;

    const side = ACTIONS[trade.action].side;
    const displayPrice = archivePriceForTrade(trade, archiveStep);
    const key = `${side}:${priceKey(displayPrice)}`;
    const remainingFinancialQuantity = getTradeFinancialQuantity(trade, remainingQuantity);
    const remainingOpeningFee = trade.quantity > 0 ? trade.fee * (remainingQuantity / trade.quantity) : 0;
    const existing = displayBuckets.get(key);

    if (existing) {
      // 整合报价只在整档全部为期权时显示紫色金属底；混合档仍按普通仓位展示，避免错误归类。
      if (existing.instrumentType !== trade.instrumentType) existing.instrumentType = undefined;
      existing.originalQuantity += remainingQuantity;
      existing.remainingQuantity += remainingQuantity;
      existing.costBasis += remainingQuantity * trade.price;
      existing.financialQuantity += remainingFinancialQuantity;
      existing.financialCostBasis += remainingFinancialQuantity * trade.price;
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
      costBasis: remainingQuantity * trade.price,
      financialQuantity: remainingFinancialQuantity,
      financialCostBasis: remainingFinancialQuantity * trade.price,
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
    quantity,
    fee: trade.quantity > 0 ? trade.fee * (quantity / trade.quantity) : 0,
    instrumentType: opening.instrumentType,
  })));
  return [...openings, ...closings].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** 开平仓保持完整 ETH 数量，收益与交易成本按同一开仓的多人快照分配；所有受益人比例严格合计100%。 */
function projectMemberProfitShareTrades(rawTrades: PreviewTrade[], snapshots: ProfitShareSnapshot[], viewerUserId: string) {
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

  return [...openingGroups, ...unmatchedClosingGroups];
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
  // 空数组代表“全部”；有选择时按同一维度的并集、不同维度的交集筛选。
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [relatedUserFilterIds, setRelatedUserFilterIds] = useState<string[]>([]);
  const [relatedFundFilterIds, setRelatedFundFilterIds] = useState<string[]>([]);
  const [instrumentTypeFilterIds, setInstrumentTypeFilterIds] = useState<T0InstrumentType[]>([]);
  const [executionFilter, setExecutionFilter] = useState<T0ExecutionFilter>("all");
  // 历史记录拥有独立筛选范围：不影响上方持仓汇总与T形交割表。
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);
  const [historyAccountFilterIds, setHistoryAccountFilterIds] = useState<string[]>([]);
  const [historyRelatedUserFilterIds, setHistoryRelatedUserFilterIds] = useState<string[]>([]);
  const [historyRelatedFundFilterIds, setHistoryRelatedFundFilterIds] = useState<string[]>([]);
  const [historyInstrumentTypeFilterIds, setHistoryInstrumentTypeFilterIds] = useState<T0InstrumentType[]>([]);
  const [historyExecutionFilter, setHistoryExecutionFilter] = useState<T0ExecutionFilter>("all");
  const [journalActionFilters, setJournalActionFilters] = useState<Set<TradeAction>>(
    () => new Set(RECENT_JOURNAL_ACTIONS),
  );
  const [showLinkedJournalGroups, setShowLinkedJournalGroups] = useState(false);
  const [recentJournalPage, setRecentJournalPage] = useState(1);
  const [lastRelatedUserId, setLastRelatedUserId] = useState("");
  const [lastAccountIdByRelatedUser, setLastAccountIdByRelatedUser] = useState<Record<string, string>>({});
  const [lastFundIdByRelatedUser, setLastFundIdByRelatedUser] = useState<Record<string, string>>({});
  const [, setRelatedUserQuickPickerOpen] = useState(false);
  const [relatedUserPickerOpen, setRelatedUserPickerOpen] = useState(false);
  const [relatedUserSearch, setRelatedUserSearch] = useState("");
  const [profitShareSource, setProfitShareSource] = useState<PreviewRelatedFund | null>(null);
  const [profitShareRecipientSearch, setProfitShareRecipientSearch] = useState("");
  const [profitShareAllocations, setProfitShareAllocations] = useState<ProfitShareAllocationDraft[]>([]);
  const [directoryManagerKind, setDirectoryManagerKind] = useState<JournalDirectoryKind | null>(null);
  const [directoryRenameTarget, setDirectoryRenameTarget] = useState<JournalDirectoryRenameTarget | null>(null);
  const [directoryDeleteTarget, setDirectoryDeleteTarget] = useState<JournalDirectoryTarget | null>(null);
  const [directoryRenameDraft, setDirectoryRenameDraft] = useState("");
  const [showEntrySheet, setShowEntrySheet] = useState(false);
  const [closeConfirmationStep, setCloseConfirmationStep] = useState<"input" | "review">("input");
  const [expandedOpenedTradeIds, setExpandedOpenedTradeIds] = useState<Set<string>>(() => new Set());
  const [showSettledOpeningHistory, setShowSettledOpeningHistory] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<PreviewTrade | null>(null);
  const [revertCandidate, setRevertCandidate] = useState<PreviewTrade | null>(null);
  const [historyActionMenuTradeId, setHistoryActionMenuTradeId] = useState<string | null>(null);
  const [netProfitDetail, setNetProfitDetail] = useState<{ trade: PreviewTrade; detail: RecentJournalTradeDetail } | null>(null);
  const [showTotalGrossProfitDetail, setShowTotalGrossProfitDetail] = useState(false);
  const [showTotalRevenueCostHint, setShowTotalRevenueCostHint] = useState(false);
  const [totalRevenueDetailPage, setTotalRevenueDetailPage] = useState(1);
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
  const hasInitializedJournalFiltersRef = useRef(false);
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
    isLocked: false,
    isPending: false,
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
  const t0JournalQuery = trpc.ledger.t0GetJournal.useQuery(
    { ledgerId: 52 },
    {
      enabled: canAccess,
      staleTime: T0_JOURNAL_REFRESH_INTERVAL_MS,
      // 仅在用户停留于当前T+0页面时静默同步；回到页面时立即补拉一次。
      refetchInterval: T0_JOURNAL_REFRESH_INTERVAL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    },
  );
  const isMemberView = (t0JournalQuery.data as any)?.viewerMode === "member";
  const canManage = canAccess && (t0JournalQuery.data as any)?.viewerMode === "admin";
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
    const profitShareSnapshots: ProfitShareSnapshot[] = Array.isArray(journal.profitShareSnapshots)
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
      ? projectMemberProfitShareTrades(rawTrades, profitShareSnapshots, String(journal.viewerRelatedUserId || ""))
      : rawTrades;
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
    setRelatedFunds(nextRelatedFunds);
    setTrades(nextTrades);
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
    // 首次进入时，管理员默认“全部账户 + 全部用户 + 全部项目”；
    // 后续静默同步只剔除已失效的多选项，不能每五秒覆盖正在查看的筛选。
    const isFirstJournalHydration = !hasInitializedJournalFiltersRef.current;
    if (journal.viewerMode === "admin") {
      setSelectedAccountIds((current) => isFirstJournalHydration ? [] : current.filter((id) => nextAccounts.some((account) => account.id === id)));
      setRelatedUserFilterIds((current) => isFirstJournalHydration ? [] : current.filter((id) => id === "unlinked" || nextRecentRelatedUsers.some((user) => user.id === id)));
      setRelatedFundFilterIds((current) => isFirstJournalHydration ? [] : current.filter((id) => id === "unclassified" || nextRelatedFunds.some((fund) => fund.id === id)));
    } else {
      // 成员端：一个选项直接锁定；两个及以上选项才保留“全部 + 分项”的筛选。
      // 后续五秒静默同步只修正已失效的选项，不会覆盖成员主动选择的单项筛选。
      const memberFundFilterIds = [
        ...nextRelatedFunds.map((fund) => fund.id),
        ...(nextTrades.some((trade) => !trade.relatedFundId) ? ["unclassified"] : []),
      ];
      const normalizeMemberFilter = (current: string[], optionIds: string[]) => {
        if (optionIds.length === 1) return optionIds;
        return isFirstJournalHydration ? [] : current.filter((id) => optionIds.includes(id));
      };
      setSelectedAccountIds((current) => normalizeMemberFilter(current, nextAccounts.map((account) => account.id)));
      setRelatedUserFilterIds([]);
      setRelatedFundFilterIds((current) => normalizeMemberFilter(current, memberFundFilterIds));
    }
    setLastRelatedUserId((current) => nextRecentRelatedUsers.some((user) => user.id === current)
      ? current
      : (nextRecentRelatedUsers[0]?.id || ""));
    hasInitializedJournalFiltersRef.current = true;
  }, [t0JournalQuery.data]);

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
      : trades.filter((trade) => executionFilter === "pending" ? Boolean(trade.isPending) : !trade.isPending),
    [trades, executionFilter],
  );
  const instrumentScopedTrades = useMemo(
    () => filterTradesByInstrumentTypes(executionScopedTrades, instrumentTypeFilterIds),
    [executionScopedTrades, instrumentTypeFilterIds],
  );
  const selectedTrades = useMemo(
    () => instrumentScopedTrades.filter((trade) => (
      (selectedAccountIds.length === 0 || selectedAccountIds.includes(trade.accountId))
      && trade.symbol === "ETH"
      && (relatedUserFilterIds.length === 0
        || relatedUserFilterIds.some((id) => id === "unlinked" ? (!trade.relatedUserId || trade.relatedUserHidden) : trade.relatedUserId === id))
      && (relatedFundFilterIds.length === 0
        || relatedFundFilterIds.some((id) => id === "unclassified" ? (!trade.relatedFundId || trade.relatedFundHidden) : trade.relatedFundId === id))
    )),
    [instrumentScopedTrades, selectedAccountIds, relatedUserFilterIds, relatedFundFilterIds],
  );
  // 挂单仅作管理员报价与状态统计展示；成交前绝不进入真实仓位、FIFO、手续费、浮盈或收益汇总。
  const selectedFilledTrades = useMemo(
    () => selectedTrades.filter((trade) => !trade.isPending),
    [selectedTrades],
  );
  const historyExecutionScopedTrades = useMemo(
    () => historyExecutionFilter === "all"
      ? trades
      : trades.filter((trade) => historyExecutionFilter === "pending" ? Boolean(trade.isPending) : !trade.isPending),
    [trades, historyExecutionFilter],
  );
  const historyInstrumentScopedTrades = useMemo(
    () => filterTradesByInstrumentTypes(historyExecutionScopedTrades, historyInstrumentTypeFilterIds),
    [historyExecutionScopedTrades, historyInstrumentTypeFilterIds],
  );
  const journalScopeTrades = useMemo(
    () => historyInstrumentScopedTrades.filter((trade) => (
      trade.symbol === "ETH"
      && (historyAccountFilterIds.length === 0 || historyAccountFilterIds.includes(trade.accountId))
      && (historyRelatedUserFilterIds.length === 0
        || historyRelatedUserFilterIds.some((id) => id === "unlinked" ? (!trade.relatedUserId || trade.relatedUserHidden) : trade.relatedUserId === id))
      && (historyRelatedFundFilterIds.length === 0
        || historyRelatedFundFilterIds.some((id) => id === "unclassified" ? (!trade.relatedFundId || trade.relatedFundHidden) : trade.relatedFundId === id))
    )),
    [historyInstrumentScopedTrades, historyAccountFilterIds, historyRelatedUserFilterIds, historyRelatedFundFilterIds],
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
  const recentJournalTotalPages = Math.max(1, Math.ceil(
    (showLinkedJournalGroups ? linkedJournalGroups.length : recentJournalTrades.length) / RECENT_JOURNAL_PAGE_SIZE,
  ));
  const pagedRecentJournalTrades = useMemo(() => {
    const newestFirst = [...recentJournalTrades].reverse();
    const start = (recentJournalPage - 1) * RECENT_JOURNAL_PAGE_SIZE;
    return newestFirst.slice(start, start + RECENT_JOURNAL_PAGE_SIZE);
  }, [recentJournalTrades, recentJournalPage]);
  const pagedLinkedJournalGroups = useMemo(() => {
    const start = (recentJournalPage - 1) * RECENT_JOURNAL_PAGE_SIZE;
    return linkedJournalGroups.slice(start, start + RECENT_JOURNAL_PAGE_SIZE);
  }, [linkedJournalGroups, recentJournalPage]);
  useEffect(() => {
    setRecentJournalPage((current) => Math.min(current, recentJournalTotalPages));
  }, [recentJournalTotalPages]);
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
  const memberRelatedUserName = useMemo(() => {
    const selfName = String((me as any)?.name || (me as any)?.username || "").trim();
    if (selfName) return selfName;
    const ownTrade = trades.find((trade) => Boolean(trade.relatedUserId));
    return ownTrade ? getTradeRelatedUserName(ownTrade) : "本人";
  }, [me, trades]);
  const availableRelatedFunds = useMemo(
    () => relatedUserFilterIds.length === 0
      ? relatedFunds
      : relatedFunds.filter((fund) => Boolean(fund.relatedUserId) && relatedUserFilterIds.includes(fund.relatedUserId!)),
    [relatedFunds, relatedUserFilterIds],
  );
  const memberFundFilterOptionIds = useMemo(() => [
    ...relatedFunds.map((fund) => fund.id),
    ...(trades.some((trade) => !trade.relatedFundId) ? ["unclassified"] : []),
  ], [relatedFunds, trades]);
  const shouldLockMemberAccountFilter = isMemberView && accounts.length === 1;
  const shouldLockMemberFundFilter = isMemberView && memberFundFilterOptionIds.length === 1;
  const lockedAccountName = accounts.find((account) => selectedAccountIds.includes(account.id))?.name
    || accounts[0]?.name
    || "暂无账户";
  const lockedRelatedFundName = availableRelatedFunds.find((fund) => relatedFundFilterIds.includes(fund.id))?.name
    || availableRelatedFunds[0]?.name
    || (trades.some((trade) => !trade.relatedFundId) ? "未区分项目（历史）" : "暂无项目");
  const accountFilterOptions = accounts.map((account) => ({ id: account.id, label: account.name }));
  const relatedUserFilterOptions = [
    ...(trades.some((trade) => !trade.relatedUserId) ? [{ id: "unlinked", label: "未关联用户（历史）" }] : []),
    // 下拉内保留昵称和用户名便于辨认；顶部筛选框选中后只展示昵称，节省移动端空间。
    ...recentRelatedUsers.map((user) => ({ id: user.id, label: `${user.name}${user.username ? ` · @${user.username}` : ""}`, summaryLabel: user.name })),
  ];
  const relatedFundFilterOptions = [
    ...(trades.some((trade) => !trade.relatedFundId) ? [{ id: "unclassified", label: "未区分项目（历史）" }] : []),
    ...availableRelatedFunds.map((fund) => ({ id: fund.id, label: fund.name })),
  ];
  const historyAvailableRelatedFunds = useMemo(
    () => historyRelatedUserFilterIds.length === 0
      ? relatedFunds
      : relatedFunds.filter((fund) => Boolean(fund.relatedUserId) && historyRelatedUserFilterIds.includes(fund.relatedUserId!)),
    [relatedFunds, historyRelatedUserFilterIds],
  );
  const historyRelatedFundFilterOptions = [
    ...(trades.some((trade) => !trade.relatedFundId) ? [{ id: "unclassified", label: "未区分项目（历史）" }] : []),
    ...historyAvailableRelatedFunds.map((fund) => ({ id: fund.id, label: fund.name })),
  ];
  const historyFilterGridTemplateColumns = useMemo(() => {
    const summaryFor = (label: string, options: T0MultiSelectOption[], selectedIds: string[]) => {
      const selected = options.filter((option) => selectedIds.includes(option.id));
      if (selected.length === 0) return `${label}全部`;
      if (selected.length === 1) return selected[0].summaryLabel ?? selected[0].label;
      return `已选 ${selected.length} 项`;
    };
    return buildT0FilterGridTemplateColumns([
      { summary: summaryFor("账户", accountFilterOptions, historyAccountFilterIds), selectedCount: historyAccountFilterIds.length },
      { summary: summaryFor("用户", relatedUserFilterOptions, historyRelatedUserFilterIds), selectedCount: historyRelatedUserFilterIds.length },
      { summary: summaryFor("项目", historyRelatedFundFilterOptions, historyRelatedFundFilterIds), selectedCount: historyRelatedFundFilterIds.length },
    ]);
  }, [accountFilterOptions, relatedUserFilterOptions, historyRelatedFundFilterOptions, historyAccountFilterIds, historyRelatedUserFilterIds, historyRelatedFundFilterIds]);
  const hasActiveHistoryDetailFilters = historyAccountFilterIds.length > 0
    || historyRelatedUserFilterIds.length > 0
    || historyRelatedFundFilterIds.length > 0
    || historyInstrumentTypeFilterIds.length > 0
    || historyExecutionFilter !== "all";
  const historyInstrumentFilterSummary = getT0InstrumentFilterSummary(historyInstrumentTypeFilterIds);
  const historyExecutionFilterSummary = historyExecutionFilter === "all"
    ? "状态全部"
    : historyExecutionFilter === "filled"
      ? "未挂单"
      : "已挂单";
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
    setHistoryRelatedUserFilterIds((current) => current.filter((id) => id === "unlinked" || recentRelatedUsers.some((user) => user.id === id)));
    setHistoryRelatedFundFilterIds((current) => current.filter((id) => id === "unclassified" || relatedFunds.some((fund) => fund.id === id)));
  }, [accounts, recentRelatedUsers, relatedFunds]);
  const topFilterGridTemplateColumns = useMemo(() => {
    const summaryFor = (label: string, options: T0MultiSelectOption[], selectedIds: string[]) => {
      const selected = options.filter((option) => selectedIds.includes(option.id));
      if (selected.length === 0) return `${label}全部`;
      if (selected.length === 1) return selected[0].summaryLabel ?? selected[0].label;
      return `已选 ${selected.length} 项`;
    };
    // 成员端的账户与本人虽不可切换，但仍是明确的当前条件；
    // 将其纳入选中态，才能与管理员选择条件后的三栏宽度算法完全一致。
    const accountSummary = shouldLockMemberAccountFilter
      ? `账户${lockedAccountName}`
      : summaryFor("账户", accountFilterOptions, selectedAccountIds);
    const userSummary = isMemberView
      ? `用户${memberRelatedUserName}`
      : summaryFor("用户", relatedUserFilterOptions, relatedUserFilterIds);
    const fundSummary = shouldLockMemberFundFilter
      ? `项目${lockedRelatedFundName}`
      : summaryFor("项目", relatedFundFilterOptions, relatedFundFilterIds);
    // 成员视图的三项都已经代表当前可见范围（即使项目暂为“全部”），
    // 因此始终按三项均已选中来共同分配空间，让每项文字拥有相近的左右留白。
    const accountSpec = { summary: accountSummary, selectedCount: isMemberView ? 1 : selectedAccountIds.length };
    const userSpec = { summary: userSummary, selectedCount: isMemberView ? 1 : relatedUserFilterIds.length };
    const fundSpec = { summary: fundSummary, selectedCount: isMemberView ? 1 : relatedFundFilterIds.length };
    return buildT0FilterGridTemplateColumns([
      accountSpec,
      userSpec,
      fundSpec,
    ]);
  }, [accountFilterOptions, isMemberView, lockedAccountName, lockedRelatedFundName, memberRelatedUserName, relatedFundFilterOptions, relatedUserFilterOptions, relatedFundFilterIds, relatedUserFilterIds, selectedAccountIds, shouldLockMemberAccountFilter, shouldLockMemberFundFilter]);
  const topInstrumentFilterSummary = getT0InstrumentFilterSummary(instrumentTypeFilterIds);
  const topExecutionFilterSummary = executionFilter === "all"
    ? "状态全部"
    : executionFilter === "filled"
      ? "未挂单"
      : "已挂单";
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
  const toggleJournalActionFilter = (action: TradeAction) => {
    setRecentJournalPage(1);
    setJournalActionFilters((current) => {
      // “全部”状态下点某一动作，直接聚焦该动作；后续可继续复选其他动作。
      if (availableJournalActions.every((item) => current.has(item))) {
        return new Set([action]);
      }
      const next = new Set(current);
      if (next.has(action)) {
        next.delete(action);
      } else {
        next.add(action);
      }
      return next;
    });
  };
  const entryRelatedFunds = useMemo(
    () => relatedFunds.filter((fund) => fund.relatedUserId === entryForm.relatedUserId),
    [relatedFunds, entryForm.relatedUserId],
  );
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
  const estimatedFeeUsdt = useMemo(() => {
    if (entryForm.instrumentType === "option") return 0;
    const quantity = Number(normalizeEthQuantity(entryForm.quantity));
    const price = Number(entryForm.price);
    if (quantityFormatError || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) return null;
    return Number((quantity * price * OKX_VIP2_TAKER_FEE_RATE).toFixed(8));
  }, [entryForm.instrumentType, entryForm.quantity, entryForm.price, quantityFormatError]);
  const openingArchivePrice = useMemo(() => {
    const price = Number(entryForm.price);
    if (!ACTIONS[entryForm.action].opening || !Number.isFinite(price) || price <= 0) return null;
    return archivePriceForSide(ACTIONS[entryForm.action].side, price);
  }, [entryForm.action, entryForm.price]);
  // 资金、盈亏、手续费和 FIFO 仍仅使用实际成交单；挂单在成交前绝不参与这些财务口径。
  const buckets = useMemo(() => buildPositionBuckets(selectedFilledTrades), [selectedFilledTrades]);
  // “总仓位”则忠实反映顶部状态筛选：状态为全部时同时展示挂单与已成交数量，
  // 切换至“未挂单”或“已挂单”后只统计对应状态的数量。
  const totalPositionBuckets = useMemo(() => buildPositionBuckets(selectedTrades), [selectedTrades]);
  const ladderOpeningClosingAllocations = useMemo(
    () => buildOpeningClosingAllocations(selectedFilledTrades),
    [selectedFilledTrades],
  );
  const integratedDisplayBuckets = useMemo(
    () => buildIntegratedDisplayBuckets(selectedFilledTrades, ladderOpeningClosingAllocations, integratedArchiveStep),
    [selectedFilledTrades, ladderOpeningClosingAllocations, integratedArchiveStep],
  );
  // 逐笔详情恒定按真实十美元档展开；整合详情沿用进入时选定的宽档。
  const isIndividualQuoteDetail = entrySheetLadderDisplayModeRef.current === "individual";
  const entryArchiveStep = isIndividualQuoteDetail || (!ACTIONS[entryForm.action].opening && closingSourceTrade)
    ? POSITION_ARCHIVE_STEP
    : entrySheetArchiveStepRef.current;
  const summary = useMemo(() => calculateSummary(buckets, markPrice, selectedFilledTrades), [buckets, markPrice, selectedFilledTrades]);
  // 首屏总览：累计利润保持与多/空“累计利润”一致的未扣手续费口径；总仓位为多仓减空仓后的净额。
  const totalGrossProfit = summary.long.realizedGross + summary.short.realizedGross;
  const totalGrossProfitDetails = useMemo(
    () => buildRealizedGrossProfitDetails(selectedFilledTrades),
    [selectedFilledTrades],
  );
  const totalRevenueDetailTotalPages = Math.max(1, Math.ceil(
    totalGrossProfitDetails.length / TOTAL_REVENUE_DETAIL_PAGE_SIZE,
  ));
  const pagedTotalGrossProfitDetails = useMemo(() => {
    const start = (totalRevenueDetailPage - 1) * TOTAL_REVENUE_DETAIL_PAGE_SIZE;
    return totalGrossProfitDetails.slice(start, start + TOTAL_REVENUE_DETAIL_PAGE_SIZE);
  }, [totalGrossProfitDetails, totalRevenueDetailPage]);
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
  const totalGrossProfitClass = totalGrossProfit > 0 ? "text-rose-600" : totalGrossProfit < 0 ? "text-emerald-600" : "text-slate-700";
  const netPositionClass = "text-slate-800";
  const roundedNetPositionText = (() => {
    const rounded = Math.round(totalPositionQuantity);
    return `${rounded < 0 ? "−" : ""}${Math.abs(rounded).toLocaleString("en-US")}`;
  })();
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
  const entryScopeTitle = isOptionEntryContext ? "期权汇总" : `${entrySide === "long" ? "多仓" : "空仓"}汇总`;
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
  const visibleOpenedTradeRows = useMemo(() => [
    ...activeOpenedTradeList.map((trade) => ({ kind: "active" as const, trade })),
    ...(settledOpenedTradeList.length > 0 ? [{ kind: "history-toggle" as const }] : []),
    ...(showSettledOpeningHistory
      ? settledOpenedTradeList.map((trade) => ({ kind: "history" as const, trade }))
      : []),
  ], [activeOpenedTradeList, settledOpenedTradeList, showSettledOpeningHistory]);
  const isEditingEntry = Boolean(entryForm.editingEntryId);
  const isClosingEntry = !ACTIONS[entryForm.action].opening;
  const isOptionOpeningEntry = isOptionEntryContext;
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
  const isCloseReview = isClosingEntry && closeConfirmationStep === "review";
  // 平仓必须继承所选开仓单的账户、用户与项目归属，首次输入和二次确认均不可改。
  // 开仓编辑受后端 FIFO 依赖校验保护；未发生后续平仓时，管理员必须能改到既有账户。
  const isAccountSelectionLocked = isClosingEntry || (isCloseReview && !isEditingEntry);
  const isCloseAssociationLocked = isClosingEntry || isCloseReview;
  const markLadderPrice = markPrice
    ? Math.min(LADDER_MAX_PRICE, Math.max(LADDER_MIN_PRICE, Math.round(markPrice / LADDER_STEP) * LADDER_STEP))
    : null;
  const integratedMarkLadderPrice = markPrice
    ? Math.min(
      LADDER_MAX_PRICE,
      Math.max(LADDER_MIN_PRICE, Math.round(markPrice / integratedArchiveStep) * integratedArchiveStep),
    )
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
  // 管理员整合报价保留按价位汇总；成员端则按开仓主单逐笔显示，
  // 这样每格都能准确标明账户、本人、专项款与现货/合约/期权类型，且不混淆多笔来源。
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
      // 管理员逐笔模式一张主单只对应一行，价位取本笔真实成交价的四舍五入整数；
      // 原始成交价仍用于成本、盈亏和 FIFO，十美元归档价仅服务于整合报价和可用量校验。
      const price = Math.round(trade.price);
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
    if (markLadderPrice !== null) individualLevels.add(markLadderPrice);
    return Array.from(individualLevels).sort((a, b) => b - a).flatMap((price) => {
      const rowsAtPrice = [...(rowsByPrice.get(priceKey(price)) ?? [])]
        .sort((a, b) => b.trade.createdAt.localeCompare(a.trade.createdAt) || b.trade.id.localeCompare(a.trade.id));
      if (rowsAtPrice.length === 0) {
        return [{
          key: `individual-empty-${priceKey(price)}`,
          price,
          isMark: markLadderPrice === price,
        }];
      }
      return rowsAtPrice.map(({ trade, bucket }, index) => ({
        key: `individual-entry-${trade.id}`,
        price,
        long: bucket.side === "long" ? bucket : undefined,
        short: bucket.side === "short" ? bucket : undefined,
        // 同一报价档可以连续出现多条主单；实时价只强调其中第一条，避免连续高亮干扰阅读。
        isMark: markLadderPrice === price && index === 0,
        openingTrade: trade,
      }));
    });
  }, [selectedTrades, ladderOpeningClosingAllocations, markLadderPrice]);
  const isIndividualLadderView = canManage && adminLadderDisplayMode === "individual";
  const displayedPriceRows = isIndividualLadderView
    ? individualPriceRows
    : isMemberView
      ? individualPriceRows
      : priceRows;

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
    // 现货/合约保留左多右空；期权不继承点击侧，而由四种期权方向决定最终展示侧。
    const initialInstrumentType = ACTIONS[action].opening ? lastOpeningInstrumentType : undefined;
    const initialOptionDirection: T0OptionDirection = "long_call";
    const initialAction = initialInstrumentType === "option"
      ? getOptionOpeningAction(initialOptionDirection)
      : action;
    setEntrySide(ACTIONS[initialAction].side);
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
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
      isLocked: false,
      isPending: false,
      quantity: "",
      // 开仓成交价由管理员实际录入；保留浅色 0.00 占位，避免误把参考价写入流水。
      price: "",
      note: "",
      targetPrice,
    });
    setShowEntrySheet(true);
  };

  const openQuickCloseSheet = (trade: PreviewTrade) => {
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
      isLocked: false,
      isPending: false,
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
    setEntrySide(ACTIONS[trade.action].side);
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
    setEntryForm({
      action: trade.action,
      accountId: trade.accountId,
      accountName: accounts.find((account) => account.id === trade.accountId)?.name ?? "",
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
      isLocked: Boolean(trade.isLocked),
      isPending: Boolean(trade.isPending),
      // 编辑输入使用机器可解析的原始数值；展示层才使用千分位格式。
      quantity: normalizeEthQuantity(String(trade.quantity)),
      price: trade.price.toFixed(2),
      note: trade.note ?? "",
      editingEntryId: trade.id,
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
      toast.success("收益分配已保存，仅影响此后新开的订单");
    },
    onError: (error) => toast.error(error.message || "收益分配保存失败"),
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
        instrumentType: data.entry.instrumentType === "spot" || data.entry.instrumentType === "contract" || data.entry.instrumentType === "option"
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
        isLocked: Boolean(data.entry.isLocked),
        isPending: Boolean(data.entry.isPending),
        filledAt: data.entry.filledAt ? String(data.entry.filledAt) : undefined,
        filledPrice: data.entry.filledPrice === undefined || data.entry.filledPrice === null ? undefined : Number(data.entry.filledPrice),
        quantity: Number(data.entry.quantity),
        price: Number(data.entry.price),
        fee: Number(data.entry.fee || 0),
        createdAt: String(data.entry.createdAt),
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
      setTrades((current) => current.map((trade) => trade.clientRequestId === variables.clientRequestId ? entry : trade));
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
    onSuccess: (data: any) => {
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
        instrumentType: data.entry.instrumentType === "spot" || data.entry.instrumentType === "contract" || data.entry.instrumentType === "option"
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
        isLocked: Boolean(data.entry.isLocked),
        isPending: Boolean(data.entry.isPending),
        filledAt: data.entry.filledAt ? String(data.entry.filledAt) : undefined,
        filledPrice: data.entry.filledPrice === undefined || data.entry.filledPrice === null ? undefined : Number(data.entry.filledPrice),
        quantity: Number(data.entry.quantity),
        price: Number(data.entry.price),
        fee: Number(data.entry.fee || 0),
        createdAt: String(data.entry.createdAt),
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
      setTrades((current) => current.map((trade) => trade.id === entry.id ? entry : trade));
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
        isLocked: false,
        isPending: false,
        quantity: "",
        price: "",
        note: "",
        targetPrice: undefined,
      });
      setShowEntrySheet(true);
      toast.success(entry.isPending ? "挂单已保存，等待统一参考价触发成交" : entry.isLocked ? "开仓已锁定，逐笔报价将显示黑金锁标" : "开仓记录已修改");
    },
    onError: (error) => toast.error(error.message || "开仓记录修改失败"),
  });

  const deleteOpeningEntryMutation = trpc.ledger.t0DeleteOpeningEntry.useMutation({
    onSuccess: (data: any) => {
      const entryId = String(data.entryId);
      setTrades((current) => current.filter((trade) => trade.id !== entryId));
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
      setTrades((current) => current.filter((trade) => trade.id !== entryId));
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
      setTrades((current) => [...current.filter((trade) => trade.id !== entry.id), entry]);
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

  const closeProfitShareManager = () => {
    if (setProfitShareRuleMutation.isPending) return;
    setProfitShareSource(null);
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

  const handleSaveEntry = () => {
    const normalizedQuantity = normalizeEthQuantity(entryForm.quantity);
    const quantity = Number(normalizedQuantity);
    const price = Number(entryForm.price);
    const fee = estimatedFeeUsdt ?? 0;
    const selectedAction = ACTIONS[entryForm.action];
    const isOptionOpening = selectedAction.opening && entryForm.instrumentType === "option";
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
      toast.error("请选择现货、合约或期权");
      return;
    }
    if (isOptionOpening) {
      if (optionFormValidationMessage) {
        toast.error(optionFormValidationMessage);
        return;
      }
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error(isOptionOpening ? "请输入行权价" : "请输入成交价格");
      return;
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
        toast.error("请选择现货、合约或期权");
        return;
      }
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
        isPending: entryForm.isPending,
        optionDirection: isOptionOpening ? entryForm.optionDirection : undefined,
        optionExpiryDate: isOptionOpening ? entryForm.optionExpiryDate : undefined,
        optionPremium: isOptionOpening ? entryForm.optionPremium.trim() : undefined,
        optionPremiumCurrency: isOptionOpening ? entryForm.optionPremiumCurrency : undefined,
        quantity: normalizedQuantity,
        price: entryForm.price.trim(),
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
      isLocked: selectedAction.opening ? entryForm.isLocked : false,
      isPending: selectedAction.opening ? entryForm.isPending : false,
      quantity,
      price,
      fee,
      createdAt: new Date().toISOString(),
      targetPrice: archiveTargetPrice,
      note: entryForm.note.trim() || undefined,
      clientRequestId,
      isSyncing: true,
    };
    setTrades((current) => [...current, trade]);
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
      action: entryForm.action,
      instrumentType: selectedAction.opening ? entryForm.instrumentType : undefined,
      isLocked: selectedAction.opening ? entryForm.isLocked : undefined,
      isPending: selectedAction.opening ? entryForm.isPending : undefined,
      optionDirection: isOptionOpening ? entryForm.optionDirection : undefined,
      optionExpiryDate: isOptionOpening ? entryForm.optionExpiryDate : undefined,
      optionPremium: isOptionOpening ? entryForm.optionPremium.trim() : undefined,
      optionPremiumCurrency: isOptionOpening ? entryForm.optionPremiumCurrency : undefined,
      quantity: normalizedQuantity,
      price: entryForm.price.trim(),
      targetPrice: archiveTargetPrice === undefined ? undefined : String(archiveTargetPrice),
      note: entryForm.note.trim() || undefined,
      clientRequestId,
    });
  };

  const backToLedger = () => {
    if (!embedded) setLocation(`/ledger/${ledgerId}`);
  };
  const backToLadder = () => {
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
    setShowEntrySheet(false);
    if (canManage) setAdminLadderDisplayMode(entrySheetLadderDisplayModeRef.current);
  };
  const backToOrderList = () => {
    if (!isClosingEntry) return;
    setCloseConfirmationStep("input");
    setClosingSourceTrade(null);
    setEntryForm((current) => ({
      ...current,
      action: entrySide === "long" ? "openLong" : "openShort",
      instrumentType: lastOpeningInstrumentType,
      isLocked: false,
      isPending: false,
      quantity: "",
      price: "",
      note: "",
      editingEntryId: undefined,
    }));
  };

  const renderHistoryActionMenuButton = (trade: PreviewTrade) => {
    if (!canManage) return null;
    const isOpen = historyActionMenuTradeId === trade.id;
    return (
      <button
        type="button"
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

  const renderHistoryActionMenu = (trade: PreviewTrade) => {
    if (!canManage || historyActionMenuTradeId !== trade.id) return null;
    const isOpening = ACTIONS[trade.action].opening;
    return (
      <div className="mt-1 flex justify-end gap-1.5" aria-label="历史记录管理操作">
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
      const detail = recentJournalTradeDetails.get(closing.id);
      const isLong = ACTIONS[closing.action].side === "long";
      return (
        <div key={group.id} className="mx-3 my-2 rounded border border-dashed border-amber-200 bg-amber-50/35 px-3 py-2.5">
          <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
            <span className="shrink-0 text-[10px] font-medium text-amber-700">未匹配开仓</span>
            <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[closing.action].label}</span>
            <span className="shrink-0 font-medium text-slate-800">{formatQuantity(closing.quantity)}E</span>
            {detail?.buyPrice !== undefined && <span className="shrink-0 text-slate-600">买{detail.buyQuote ?? formatPrice(detail.buyPrice)}</span>}
            {detail?.sellPrice !== undefined && <span className="shrink-0 text-slate-600">卖{detail.sellQuote ?? formatPrice(detail.sellPrice)}</span>}
            {detail?.isOptionQuote && <span className="shrink-0 text-violet-700">行权{formatPrice(closing.price)}</span>}
            {!detail && <span className="shrink-0 text-slate-600">{isLong ? "卖" : "买"}{formatPrice(closing.price)}</span>}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[11px] text-slate-500">
            <span className="min-w-0 truncate" title={getTradeAccountName(closing)}>{getTradeAccountName(closing)}</span>
            <span className="text-slate-300">·</span>
            <span className="min-w-0 truncate" title={getTradeRelatedUserName(closing)}>{getTradeRelatedUserName(closing)}</span>
            <span className="text-slate-300">·</span>
            <span className="min-w-0 truncate" title={getTradeRelatedFundName(closing)}>{getTradeRelatedFundName(closing)}</span>
            <span className="text-slate-300">·</span>
            <span className="shrink-0">{formatBeijingMonthDayTime(closing.createdAt)}</span>
            {renderHistoryActionMenuButton(closing)}
          </div>
          {renderHistoryActionMenu(closing)}
          {closing.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{closing.note.trim()}</div>}
        </div>
      );
    }

    const opening = group.opening;
    const isLong = ACTIONS[opening.action].side === "long";
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
              <span className="shrink-0 text-slate-600">{isLong ? "买" : "卖"}{opening.instrumentType === "option" && opening.optionPremium !== undefined && opening.optionPremiumCurrency ? formatOptionQuote(opening.optionPremium, opening.optionPremiumCurrency) : formatPrice(opening.price)}</span>
              {opening.instrumentType === "option" && <span className="shrink-0 text-violet-700">行权{formatPrice(opening.price)}</span>}
            </div>
            <span className="ml-auto shrink-0 text-[10px] font-medium text-slate-500">
              {closedQuantity > 0 ? `已平 ${formatQuantity(closedQuantity)} · 剩 ${formatQuantity(remainingQuantity)}` : "未平"}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[11px] text-slate-500">
            <span className="min-w-0 truncate" title={getTradeAccountName(opening)}>{getTradeAccountName(opening)}</span>
            <span className="text-slate-300">·</span>
            <span className="min-w-0 truncate" title={getTradeRelatedUserName(opening)}>{getTradeRelatedUserName(opening)}</span>
            <span className="text-slate-300">·</span>
            <span className="min-w-0 truncate" title={getTradeRelatedFundName(opening)}>{getTradeRelatedFundName(opening)}</span>
            <span className="text-slate-300">·</span>
            <span className="shrink-0">{formatT0TradeTimeline(opening)}</span>
            {renderHistoryActionMenuButton(opening)}
          </div>
          {renderHistoryActionMenu(opening)}
          {opening.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{opening.note.trim()}</div>}
        </div>
        {group.closings.map((allocation, index) => {
          const closing = allocation.trade;
          const detail = buildLinkedClosingDetail(opening, allocation);
          const allocatedClosing = { ...closing, quantity: allocation.quantity, fee: detail.closingFee ?? closing.fee };
          const isLastClosing = index === group.closings.length - 1;
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
                  {detail.isOptionQuote ? <>
                    <span className="shrink-0 text-slate-600">买{detail.buyQuote ?? formatPrice(detail.buyPrice)}</span>
                    <span className="shrink-0 text-slate-600">卖{detail.sellQuote ?? formatPrice(detail.sellPrice)}</span>
                    <span className="shrink-0 text-violet-700">行权{formatPrice(closing.price)}</span>
                  </> : <span className="shrink-0 text-slate-600">{isLong ? "卖" : "买"}{formatPrice(closing.price)}</span>}
                </div>
                <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-1px] border-t border-dotted border-slate-400/80" />
                <button
                  type="button"
                  onClick={() => setNetProfitDetail({ trade: allocatedClosing, detail })}
                  className={`shrink-0 border-b border-dotted pb-0.5 font-semibold outline-none ${detail.netPnl! >= 0 ? "border-rose-500 text-rose-600" : "border-emerald-500 text-emerald-600"}`}
                  aria-label="查看关联平仓净利润计算明细"
                >
                  {formatSigned(detail.netPnl!)}<span className="ml-0.5 text-slate-500">u</span>
                </button>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[11px] text-slate-500">
                <span className="text-[10px] text-slate-400">关联平仓</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400">{formatBeijingMonthDayTime(closing.createdAt)}</span>
                {canManage ? renderHistoryActionMenuButton(closing) : <span className="ml-auto shrink-0 text-[10px] text-slate-500">净利润</span>}
              </div>
              {renderHistoryActionMenu(closing)}
              {closing.note?.trim() && <div className="mt-1 truncate text-[11px] text-slate-500"><span>备注：</span>{closing.note.trim()}</div>}
            </div>
          );
        })}
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
      {!(embedded && isMemberView) && (
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-[0_1px_3px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="h-14 px-4 flex items-center gap-3">
            {!embedded && <button onClick={backToLedger} aria-label="返回52号账本" className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white active:scale-95">
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </button>}
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold tracking-[0.01em] text-slate-900">T+0 速记账本</h1>
            </div>
            <button
              onClick={() => window.location.reload()}
              aria-label="强制刷新整个页面"
              title="强制刷新整个页面"
              className="h-8 rounded border border-slate-200 bg-slate-900 px-3 text-xs font-semibold text-white active:scale-95"
            >
              刷新
            </button>
          </div>
        </header>
      )}

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
            className="relative z-[1] grid grid-cols-[minmax(0,1.45fr)_minmax(max-content,0.9fr)] p-2"
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
                setShowTotalRevenueCostHint(false);
                setTotalRevenueDetailPage(1);
                setShowTotalGrossProfitDetail(true);
              }}
              aria-haspopup="dialog"
              aria-label="查看总收益明细"
              className="flex min-w-0 items-center justify-between gap-2 border-r px-3 py-3 text-left transition-opacity active:opacity-60"
              style={{
                borderColor: "rgba(100,116,139,0.26)",
                boxShadow: "inset -1px 0 0 rgba(255,255,255,0.70)",
              }}
            >
              <div className="shrink-0 text-[11px] font-semibold text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>总利润</div>
              <div className={`ml-auto flex items-baseline gap-0.5 whitespace-nowrap text-[clamp(18px,5vw,22px)] font-bold leading-none tabular-nums ${totalGrossProfitClass}`} style={{ textShadow: "-0.9px -0.9px 0 rgba(255,255,255,0.88), 1.15px 1.15px 1px rgba(15,23,42,0.22)" }}>
                <span>{formatSigned(totalGrossProfit)}</span>
                <span className="text-[12px] font-semibold opacity-65">U</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShowNetPositionDetail(true)}
              aria-haspopup="dialog"
              aria-label="查看总仓位对冲明细"
              className="flex min-w-0 items-center justify-between gap-2 px-3 py-3 text-left transition-opacity active:opacity-60"
            >
              <div className="shrink-0 text-[11px] font-semibold text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>总仓位</div>
              <div className={`ml-auto flex items-baseline gap-0.5 whitespace-nowrap text-[clamp(18px,5vw,22px)] font-bold leading-none tabular-nums ${netPositionClass}`} style={{ textShadow: "-0.9px -0.9px 0 rgba(255,255,255,0.88), 1.15px 1.15px 1px rgba(15,23,42,0.22)" }}>
                <span>{roundedNetPositionText}</span>
                <span className="text-[12px] font-semibold opacity-65">ETH</span>
              </div>
            </button>
          </div>

          <div className="relative z-[1]">
            <AccountOverview
              summary={summary}
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
              className="grid grid-cols-3 gap-1.5 transition-[grid-template-columns] duration-200"
              style={{
                gridTemplateColumns: topFilterGridTemplateColumns,
              }}
            >
              {shouldLockMemberAccountFilter ? <LockedFilterValue label="账户" value={lockedAccountName} /> : (
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
                  onChange={(ids) => {
                    setRelatedUserFilterIds(ids);
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
                onChange={(ids) => {
                  setInstrumentTypeFilterIds(normalizeT0InstrumentTypeFilterIds(ids));
                  setRecentJournalPage(1);
                }}
              />
              <T0SelectFilter
                label="状态"
                value={executionFilter}
                ariaLabel="按成交状态筛选"
                focusClassName="focus-within:border-sky-600"
                onChange={(value) => {
                  setExecutionFilter(value as T0ExecutionFilter);
                  setRecentJournalPage(1);
                }}
              >
                <option value="all">全部状态</option>
                <option value="filled">未挂单（已成交）</option>
                <option value="pending">已挂单</option>
              </T0SelectFilter>
            </div>}
          </div>
          {canManage && <div
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
              const individualMetadata = (isIndividualLadderView || isMemberView) && row.openingTrade
                ? {
                  accountName: getTradeAccountName(row.openingTrade),
                  relatedUserName: getTradeRelatedUserName(row.openingTrade),
                  relatedFundName: getTradeRelatedFundName(row.openingTrade),
                  instrumentShortLabel: getInstrumentShortLabel(row.openingTrade.instrumentType, row.openingTrade.optionExpiryDate),
                  option: row.openingTrade.instrumentType === "option"
                    ? {
                      direction: row.openingTrade.optionDirection,
                      expiryDate: row.openingTrade.optionExpiryDate,
                      strikePrice: row.openingTrade.price,
                      premium: row.openingTrade.optionPremium,
                      premiumCurrency: row.openingTrade.optionPremiumCurrency,
                    }
                    : undefined,
                }
                : undefined;
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
                  metadata={individualMetadata}
                  isLocked={Boolean(row.long && row.openingTrade?.isLocked)}
                  isPending={Boolean(row.long && row.openingTrade?.isPending)}
                  readOnly={isMemberView}
                  onClose={() => {
                    if (!row.long) return;
                    // 不论整合或逐笔报价，已有多仓均进入同一报价详情页：
                    // 可新增多仓，并可对该价档内的老单逐笔编辑或卖出平仓。
                    // 逐笔行展示真实成交价的四舍五入整数，详情页/FIFO 则仍按十美元归档价定位。
                    openEntrySheet(
                      "openLong",
                      row.openingTrade ? archivePriceForTrade(row.openingTrade) : row.long.price,
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
                    })() : formatLadderPrice(row.price)}
                  </span>
                </div>
                <LadderCell
                  bucket={row.short}
                  side="short"
                  markPrice={markPrice}
                  metadata={individualMetadata}
                  isLocked={Boolean(row.short && row.openingTrade?.isLocked)}
                  isPending={Boolean(row.short && row.openingTrade?.isPending)}
                  readOnly={isMemberView}
                  onClose={() => {
                    if (!row.short) return;
                    // 不论整合或逐笔报价，已有空仓均进入同一报价详情页：
                    // 可新增空仓，并可对该价档内的老单逐笔编辑或买入平仓。
                    // 逐笔行展示真实成交价的四舍五入整数，详情页/FIFO 则仍按十美元归档价定位。
                    openEntrySheet(
                      "openShort",
                      row.openingTrade ? archivePriceForTrade(row.openingTrade) : row.short.price,
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
            className="flex items-center justify-center border-b border-[#c7d0d7]/80 px-4 py-2.5"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.58), rgba(208,215,221,0.34))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.78), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            <span className="inline-flex items-baseline gap-1.5 text-[13px] font-semibold tracking-[0.08em] text-slate-700" style={{ textShadow: "-0.4px -0.4px 0 rgba(255,255,255,0.88), 0.55px 0.55px 0 rgba(71,85,105,0.18)" }}>
              历史记录
              <span className="text-[11px] font-medium tracking-normal text-slate-500">{recentJournalTrades.length} 笔</span>
            </span>
          </div>
          <div>
              <div
                className="border-b border-[#c7d0d7]/70 px-4 py-2.5"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.30), rgba(208,215,221,0.16))" }}
              >
                <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="历史记录动作筛选">
                  {availableJournalActions.length > 1 && <button
                    type="button"
                    aria-pressed={allJournalActionsSelected}
                    disabled={showLinkedJournalGroups}
                    onClick={() => {
                      setJournalActionFilters(new Set(availableJournalActions));
                      setRecentJournalPage(1);
                    }}
                    className={`h-6 rounded-[3px] border px-2 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-40 ${allJournalActionsSelected ? "border-[#75818c] bg-[#75818c] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    全部
                  </button>}
                  {availableJournalActions.map((action) => {
                    const selected = journalActionFilters.has(action);
                    return (
                      <button
                        key={action}
                        type="button"
                        aria-pressed={selected}
                        disabled={showLinkedJournalGroups}
                        onClick={() => toggleJournalActionFilter(action)}
                        className={`h-6 rounded-[3px] border px-2 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-40 ${selected ? ACTIONS[action].activeClass : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                      >
                        {ACTIONS[action].label}
                      </button>
                    );
                  })}
                  {hasLinkedJournalPairs && <button
                    type="button"
                    aria-pressed={showLinkedJournalGroups}
                    onClick={() => {
                      setShowLinkedJournalGroups((current) => !current);
                      setRecentJournalPage(1);
                    }}
                    className={`h-6 rounded-[3px] border px-2 text-[11px] font-medium transition-colors ${showLinkedJournalGroups ? "border-[#75818c] bg-[#75818c] text-white" : "border-[#c7d0d7] bg-white/28 text-slate-600"}`}
                  >
                    关联
                  </button>}
                  {canManage && <button
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
                </div>
              </div>
              {canManage && showHistoryFilters && <div
                className="relative z-20 border-b border-[#c7d0d7]/70 px-4 py-2.5"
                style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.52), rgba(208,215,221,0.28))" }}
              >
                <div
                  data-t0-filter-row
                  className="grid grid-cols-3 gap-1.5 transition-[grid-template-columns] duration-200"
                  style={{ gridTemplateColumns: historyFilterGridTemplateColumns }}
                >
                  <T0MultiSelect
                    label="账户"
                    options={accountFilterOptions}
                    selectedIds={historyAccountFilterIds}
                    emptyLabel="暂无账户"
                    onChange={(ids) => {
                      setHistoryAccountFilterIds(ids);
                      setRecentJournalPage(1);
                    }}
                  />
                  <T0MultiSelect
                    label="用户"
                    options={relatedUserFilterOptions}
                    selectedIds={historyRelatedUserFilterIds}
                    emptyLabel="暂无用户"
                    constrainRightToFilterRow
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
                    onChange={(ids) => {
                        setHistoryInstrumentTypeFilterIds(normalizeT0InstrumentTypeFilterIds(ids));
                        setRecentJournalPage(1);
                    }}
                  />
                  <label className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 text-[11px] font-semibold tracking-wide text-slate-500">状态</span>
                    <select
                      value={historyExecutionFilter}
                      onChange={(event) => {
                        setHistoryExecutionFilter(event.target.value as T0ExecutionFilter);
                        setRecentJournalPage(1);
                      }}
                      className="h-8 min-w-0 flex-1 rounded border border-slate-300 bg-white/70 px-2 text-[12px] font-medium text-slate-700 outline-none focus:border-sky-600"
                      aria-label="按历史成交状态筛选"
                    >
                      <option value="all">全部状态</option>
                      <option value="filled">未挂单（已成交）</option>
                      <option value="pending">已挂单</option>
                    </select>
                  </label>
                </div>
              </div>}
              {recentJournalTrades.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-slate-500">当前筛选范围还没有历史记录</div>
              ) : showLinkedJournalGroups ? (
                pagedLinkedJournalGroups.map((group) => renderLinkedJournalGroup(group))
              ) : pagedRecentJournalTrades.map((trade) => {
                const detail = recentJournalTradeDetails.get(trade.id);
                const isOpening = ACTIONS[trade.action].opening;
                const isLong = ACTIONS[trade.action].side === "long";
                return (
                <div key={trade.id} className="border-b border-[#c7d0d7]/60 px-4 py-2.5 last:border-b-0">
                    <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
                      <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
                        <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[trade.action].label}</span>
                        <span className="shrink-0 font-medium text-slate-800">{formatQuantity(trade.quantity)}E</span>
                        {trade.isPending && <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-sky-700"><Clock3 className="h-3 w-3" />挂单</span>}
                        {detail?.buyPrice !== undefined && <span className="shrink-0 text-slate-600">买{detail.buyQuote ?? formatPrice(detail.buyPrice)}</span>}
                        {detail?.sellPrice !== undefined && <span className="shrink-0 text-slate-600">卖{detail.sellQuote ?? formatPrice(detail.sellPrice)}</span>}
                        {detail?.isOptionQuote && <span className="shrink-0 text-violet-700">行权{formatPrice(trade.price)}</span>}
                        {!detail && <span className="shrink-0 text-slate-600">{isLong ? "买" : "卖"}{formatPrice(trade.price)}</span>}
                        {trade.isSyncing && <span className="shrink-0 text-amber-600">保存中</span>}
                      </div>
                      {!isOpening && detail?.netPnl !== undefined && <>
                        <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-1px] border-t border-dotted border-slate-400/80" />
                        <button
                          type="button"
                          onClick={() => setNetProfitDetail({ trade, detail })}
                          className={`shrink-0 border-b border-dotted pb-0.5 font-semibold outline-none ${detail.netPnl >= 0 ? "border-rose-500 text-rose-600" : "border-emerald-500 text-emerald-600"}`}
                          aria-label="查看净利润计算明细"
                        >
                          {formatSigned(detail.netPnl)}<span className="ml-0.5 text-slate-500">u</span>
                        </button>
                      </>}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-[11px] text-slate-500">
                      <span className="min-w-0 truncate" title={getTradeAccountName(trade)}>{getTradeAccountName(trade)}</span>
                      <span className="text-slate-300">·</span>
                      <span className="min-w-0 truncate" title={getTradeRelatedUserName(trade)}>{getTradeRelatedUserName(trade)}</span>
                      <span className="text-slate-300">·</span>
                      <span className="min-w-0 truncate" title={getTradeRelatedFundName(trade)}>{getTradeRelatedFundName(trade)}</span>
                      <span className="text-slate-300">·</span>
                      <span className="shrink-0">{formatT0TradeTimeline(trade)}</span>
                      {canManage ? renderHistoryActionMenuButton(trade) : !isOpening && detail?.netPnl !== undefined && <>
                        <span className="text-slate-300">·</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-500">净利润</span>
                      </>}
                    </div>
                    {renderHistoryActionMenu(trade)}
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
              {canManage && recoverableEntries.length > 0 && (
                <div className="border-t border-slate-200 bg-amber-50/45">
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
              <div className={`overflow-hidden rounded border ${isOptionEntryContext ? "border-violet-200 bg-violet-50/70" : entrySide === "long" ? "border-rose-200 bg-rose-50/70" : "border-emerald-200 bg-emerald-50/70"}`}>
                <div className="px-3 py-2.5">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-left">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className={`text-base font-semibold ${isOptionEntryContext ? "text-violet-700" : entrySide === "long" ? "text-rose-600" : "text-emerald-600"}`}>{entryScopeTitle}</span>
                    <span className="text-base font-semibold tabular-nums text-slate-900">{formatQuantity(entrySideSummary.quantity)} ETH</span>
                  </div>
                  <span className="shrink-0 text-base font-medium tabular-nums text-slate-500">{isOptionEntryContext ? "行权价" : "均价"} {entrySideSummary.quantity > 0 ? formatPrice(entrySideSummary.average) : "--"}</span>
                </div>
                </div>
                <div className={`mx-3 flex items-center justify-between border-t pt-2 pb-2.5 text-[10px] tabular-nums ${isOptionEntryContext ? "border-violet-200/80" : entrySide === "long" ? "border-rose-200/80" : "border-emerald-200/80"}`}>
                  <span className={entrySideSummary.unrealized === null ? "text-slate-400" : entrySideSummary.unrealized >= 0 ? "text-rose-600" : "text-emerald-600"}>
                    当前盈亏 {entrySideSummary.unrealized === null ? "--" : `${formatSigned(entrySideSummary.unrealized)} U`}
                  </span>
                  <span className="text-slate-500">当前 {activeOpenedTradeList.length} 笔</span>
                </div>
              </div>

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

              {!isEditingEntry && <div className="space-y-1.5">
                  {activeOpenedTradeList.length === 0 && (
                    <div className="rounded border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">当前档位没有未平仓主单</div>
                  )}
                  {visibleOpenedTradeRows.map((row) => {
                    if (row.kind === "history-toggle") {
                      return (
                        <button
                          key="settled-opening-history-toggle"
                          type="button"
                          onClick={() => setShowSettledOpeningHistory((current) => !current)}
                          aria-expanded={showSettledOpeningHistory}
                          className="mt-3 flex w-full items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] text-slate-600 transition active:bg-slate-100"
                        >
                          <span className="min-w-0 shrink-0 font-medium">已平仓历史主单</span>
                          <span className="ml-2 flex min-w-0 items-center gap-1 tabular-nums">
                            <span className="whitespace-nowrap text-[10px] text-slate-500">已归档 {settledOpenedTradeSummary.count} 笔 / 已实现利润</span>
                            <span className={`whitespace-nowrap text-[10px] font-semibold ${settledOpenedTradeSummary.realizedNet > 0 ? "text-rose-600" : settledOpenedTradeSummary.realizedNet < 0 ? "text-emerald-600" : "text-slate-600"}`}>
                              {formatSigned(settledOpenedTradeSummary.realizedNet)} U
                            </span>
                            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showSettledOpeningHistory ? "rotate-90" : ""}`} />
                          </span>
                        </button>
                      );
                    }
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
                    const canQuickClose = remainingQuantity > 0.0000001;
                    const isExpanded = expandedOpenedTradeIds.has(trade.id);
                    return (
                      <div key={trade.id} className="rounded border border-slate-200 bg-slate-50/80 px-3 py-2.5">
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
                            <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
                              <span className={`shrink-0 text-sm font-semibold ${ACTIONS[trade.action].side === "long" ? "text-rose-600" : "text-emerald-600"}`}>持仓{ACTIONS[trade.action].side === "long" ? "多单" : "空单"}</span>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatQuantity(trade.quantity)}</span>
                              <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">@ {formatPrice(trade.price)}</span>
                              {trade.isPending ? <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-sky-700"><Clock3 className="h-3.5 w-3.5" />挂单</span> : <span className={`shrink-0 text-sm font-semibold tabular-nums ${floatingPnl === null ? "text-slate-400" : floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{floatingPnl === null ? "--" : `${formatSigned(floatingPnl)} U`}</span>}
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
                        <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-[10px] font-medium">
                          {!isExpanded && <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            {linkedClosedQuantity > 0.0000001 && <>
                              <span className="shrink-0 tabular-nums text-slate-600">已平 {formatQuantity(linkedClosedQuantity)} · 剩 {formatQuantity(remainingQuantity)} ETH</span>
                              <span className="shrink-0 text-slate-300">·</span>
                            </>}
                            {!isMemberView && <>
                              <span title={getTradeAccountName(trade)} className="shrink-0 whitespace-nowrap text-slate-500">{getTradeAccountName(trade)}</span>
                              <span className="shrink-0 text-slate-300">·</span>
                            </>}
                            <span title={getTradeRelatedUserName(trade)} className="shrink-0 whitespace-nowrap text-slate-500">{getTradeRelatedUserName(trade)}</span>
                            <span className="shrink-0 text-slate-300">·</span>
                            <span title={getTradeRelatedFundName(trade)} className="shrink-0 whitespace-nowrap text-slate-500">{getTradeRelatedFundName(trade)}</span>
                          </div>
                          }
                          {canManage && <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              disabled={isCloseReview || Boolean(trade.isSyncing)}
                              onClick={() => openEditOpeningTrade(trade)}
                              className="h-6 rounded border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-600 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              disabled={isCloseReview || Boolean(trade.isSyncing)}
                              onClick={() => setDeleteCandidate(trade)}
                              className="h-6 rounded border border-rose-200 bg-white px-2 text-[10px] font-semibold text-rose-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              删除
                            </button>
                            {row.kind === "active" && !trade.isPending && trade.instrumentType !== "option" && <button
                              type="button"
                              disabled={!canQuickClose || Boolean(trade.isSyncing) || isCloseReview}
                              onClick={() => openQuickCloseSheet(trade)}
                              className={`h-6 rounded border px-2 text-[10px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${ACTIONS[closeAction].idleClass}`}
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
                                <div className={`mt-0.5 whitespace-nowrap text-[11px] font-semibold ${floatingPnl === null ? "text-slate-400" : floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                  {floatingPnl === null ? trade.instrumentType === "option" ? "待接入期权标记价" : "--" : `${formatSigned(floatingPnl)} U`}
                                </div>
                              </div>
                              <div className="min-w-0 text-right">
                                <div className="text-[10px] text-slate-400">{trade.filledAt ? "挂单时间" : "开仓时间"}</div>
                                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-700">{trade.isSyncing ? "后台保存中" : formatBeijingMonthDayTime(trade.createdAt)}</div>
                              </div>
                              <div className="col-span-3 grid grid-cols-3 gap-x-2 border-t border-slate-200 pt-2">
                                <div className="min-w-0">
                                  <div className="text-[10px] text-slate-400">账户</div>
                                  <div title={getTradeAccountName(trade)} className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{getTradeAccountName(trade)}</div>
                                </div>
                                <div className="min-w-0 text-center">
                                  <div className="text-[10px] text-slate-400">用户</div>
                                  <div title={getTradeRelatedUserName(trade)} className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{getTradeRelatedUserName(trade)}</div>
                                </div>
                                <div className="min-w-0 text-right">
                                  <div className="text-[10px] text-slate-400">专项款</div>
                                  <div title={getTradeRelatedFundName(trade)} className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{getTradeRelatedFundName(trade)}</div>
                                </div>
                              </div>
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
                  })}
              </div>}

              {canManage && <>
              <div className="grid grid-cols-1 gap-3">
                {isEditingEntry && (
                  <div className="rounded border border-indigo-200 bg-indigo-50/70 px-3 py-2.5">
                    <div className="text-xs font-semibold text-indigo-800">正在编辑本笔开仓</div>
                    <div className="mt-1 text-sm font-semibold tabular-nums text-slate-800">
                      {ACTIONS[entryForm.action].label} {formatQuantity(Number(entryForm.quantity))} ETH @ {formatPrice(Number(entryForm.price))}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-indigo-700/80">请直接修改下方字段，完成后点击底部“保存修改”。</div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 items-start">
                  <Field label={<span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800">数量（ETH）{isOptionOpeningEntry && <span className="text-rose-500">*</span>}{ACTIONS[entryForm.action].opening && entryForm.isPending && <span className="text-[10px] font-bold text-sky-600">挂单</span>}</span>}>
                    <div className="relative">
                      <input
                        inputMode="decimal"
                        maxLength={7}
                        disabled={isCloseReview}
                        aria-invalid={Boolean(quantityFormatError)}
                        value={entryForm.quantity}
                        onChange={(event) => setEntryForm((current) => ({ ...current, quantity: event.target.value }))}
                        onBlur={() => setEntryForm((current) => ({ ...current, quantity: normalizeEthQuantity(current.quantity) }))}
                        placeholder="0.00"
                        className={`h-14 w-full rounded border px-3 pr-[4.75rem] text-xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 ${quantityFormatError ? "border-rose-400 bg-rose-50 focus:border-rose-500" : "border-slate-200 focus:border-indigo-500"}`}
                      />
                      {ACTIONS[entryForm.action].opening && <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                        <button
                          type="button"
                          disabled={isCloseReview}
                          aria-pressed={entryForm.isLocked}
                          aria-label={entryForm.isLocked ? "解除本笔开仓锁定" : "锁定本笔开仓"}
                          title={entryForm.isLocked ? "已锁定，点击解除" : "未锁定，点击锁定"}
                          onClick={() => setEntryForm((current) => ({ ...current, isLocked: !current.isLocked }))}
                          className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isLocked ? "border-[#c9a84c]/75 bg-[#141414] text-[#f5d78e] shadow-[inset_0_1px_0_rgba(245,215,142,0.16),inset_0_-1px_0_rgba(0,0,0,0.7)]" : "border-slate-300 bg-slate-50 text-slate-500"}`}
                        >
                          {entryForm.isLocked ? <Lock className="h-4 w-4" strokeWidth={2.3} /> : <LockOpen className="h-4 w-4" strokeWidth={2.3} />}
                        </button>
                        <button
                          type="button"
                          disabled={isCloseReview || entryForm.instrumentType === "option"}
                          aria-pressed={entryForm.isPending}
                          aria-label={entryForm.instrumentType === "option" ? "期权订单仅支持直接成交" : entryForm.isPending ? "取消本笔开仓挂单，改为直接成交" : "设为本笔开仓挂单"}
                          title={entryForm.instrumentType === "option" ? "期权订单仅支持直接成交" : entryForm.isPending ? "挂单中，点击改为直接成交" : "直接成交，点击改为挂单"}
                          onClick={() => setEntryForm((current) => ({ ...current, isPending: !current.isPending }))}
                          className={`flex h-8 w-8 items-center justify-center rounded border transition active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40 ${entryForm.isPending ? "border-sky-500/75 bg-sky-50 text-sky-600" : "border-slate-300 bg-slate-50 text-slate-500"}`}
                        >
                          <Clock3 className="h-4 w-4" strokeWidth={2.3} />
                        </button>
                      </div>}
                    </div>
                    {quantityFormatError && <div className="mt-1.5 text-[10px] font-medium leading-4 text-rose-600">{quantityFormatError}</div>}
                  </Field>

                  <Field label={
                    <span className="inline-flex max-w-full items-baseline gap-1 text-sm font-semibold text-slate-800">
                      <span>{ACTIONS[entryForm.action].opening ? isOptionOpeningEntry ? "行权价" : "成交价" : "平仓价"}{isOptionOpeningEntry && <span className="text-rose-500">*</span>}</span>
                      <span className="truncate text-[9px] font-normal tabular-nums text-slate-400">{isOptionOpeningEntry ? "期权不计合约手续费" : `手续费 ${OKX_VIP2_TAKER_FEE_LABEL} · ${estimatedFeeUsdt === null ? "--" : `${formatFee(estimatedFeeUsdt)} U`}`}</span>
                    </span>
                  }>
                    {isOptionOpeningEntry ? (
                      <select
                        disabled={isCloseReview || !t0OptionDeribitLabel || t0OptionStrikesQuery.isLoading}
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
                    ) : <input
                      inputMode="decimal"
                      disabled={isCloseReview}
                      value={entryForm.price}
                      onChange={(event) => setEntryForm((current) => ({ ...current, price: event.target.value }))}
                      placeholder="0.00"
                      className="w-full h-14 rounded border border-slate-200 px-3 text-xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                    />}
                    {!isOptionOpeningEntry && openingArchivePrice !== null && (
                      <div className={`mt-1.5 text-[10px] tabular-nums ${ACTIONS[entryForm.action].side === "long" ? "text-rose-600" : "text-emerald-600"}`}>
                        {ACTIONS[entryForm.action].side === "long" ? "向上归档" : "向下归档"}至 {formatPrice(openingArchivePrice)} 档
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
                  {quantityQuickOptions.map((value, index) => {
                    const isActive = entryForm.quantity === value;
                    const displayValue = isActive ? value : formatQuantityQuickOption(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={isCloseReview}
                        onClick={() => setEntryForm((current) => ({ ...current, quantity: normalizeEthQuantity(value) }))}
                        className={`h-7 rounded border px-2 text-[11px] font-medium tabular-nums transition active:scale-95 ${isActive ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        {index === 0 && lastSavedQuantity ? `最近 ${displayValue}` : displayValue}
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
                        disabled={isCloseReview}
                        onClick={() => {
                          if (instrument.value === "option" && !entryForm.editingEntryId) {
                            setEntrySide(getOptionLadderSide(entryForm.optionDirection));
                          }
                          setEntryForm((current) => {
                            if (instrument.value !== "option") return { ...current, instrumentType: instrument.value };
                            const isNewOption = current.instrumentType !== "option";
                            return {
                              ...current,
                              action: current.editingEntryId ? current.action : getOptionOpeningAction(current.optionDirection),
                              instrumentType: "option",
                              isPending: false,
                              optionExpiryDate: isNewOption ? "" : current.optionExpiryDate,
                              optionPremium: isNewOption ? "" : current.optionPremium,
                              price: isNewOption ? "" : current.price,
                            };
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

                {isOptionOpeningEntry && <div className="-mt-0.5 rounded border border-violet-200 bg-violet-50/60 p-3">
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
                </div>}

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
                <div className="grid grid-cols-2 items-start gap-3">
                  <Field label={<span className="flex items-center justify-between gap-1"><span>下单账户 <span className="text-rose-500">*</span></span>{accounts.length > 0 && !isClosingEntry && <button type="button" onClick={() => openDirectoryManager("account")} className="shrink-0 text-[11px] font-semibold text-indigo-600 active:opacity-70">管理</button>}</span>}>
                    {accounts.length > 0 ? (
                      <select
                        disabled={isAccountSelectionLocked}
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
                        disabled={isAccountSelectionLocked}
                        value={entryForm.accountName}
                        onChange={(event) => setEntryForm((current) => ({ ...current, accountName: event.target.value }))}
                        placeholder="新账户名称"
                        className="mt-2 h-11 w-full rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                      />
                    )}
                  </Field>

                  <Field label={<span className="flex items-center justify-between gap-1"><span>关联用户</span><span className="flex shrink-0 items-center gap-2">{recentRelatedUsers.length > 0 && !isClosingEntry && <button type="button" onClick={() => openDirectoryManager("relatedUser")} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">管理</button>}</span></span>}>
                    <div className={`flex h-11 w-full overflow-hidden rounded border text-sm outline-none transition ${isCloseAssociationLocked ? "border-slate-200 bg-slate-50 text-slate-500" : entryForm.relatedUserId ? "border-indigo-200 bg-indigo-50/60 text-slate-800" : "border-slate-200 bg-white text-slate-400"}`}>
                      <select
                        disabled={isCloseAssociationLocked}
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
                          const user = recentRelatedUsers.find((item) => item.id === userId);
                          if (user) selectRelatedUser(user);
                        }}
                        aria-label="选择已有订单关联用户"
                        className="h-full min-w-0 flex-1 appearance-auto bg-transparent px-3 text-sm font-medium outline-none disabled:cursor-not-allowed"
                      >
                        <option value="">暂不关联</option>
                        {recentRelatedUsers.length > 0 && <option value="__manage_related_users__">编辑 / 删除关联用户…</option>}
                        {recentRelatedUsers.map((user) => <option key={user.id} value={user.id}>{user.name}{user.username ? ` · @${user.username}` : ""}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={isCloseAssociationLocked}
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

                <div className="-mt-1 grid grid-cols-2 gap-3 text-[10px] leading-4 text-slate-400">
                  <span>{isEditingEntry ? "可选择、新建或管理账户；保存前校验后续平仓并保留审计。" : "优先按关联用户记忆账户；无记录则保留当前账户。"}</span>
                  <span>仅搜索并引用全局已有用户；关联后按项目区分资金。</span>
                </div>

                <Field label={<span className="flex items-center justify-between gap-1"><span>项目 {entryForm.relatedUserId && <span className="text-rose-500">*</span>} {!entryForm.relatedUserId && <span className="text-slate-400">（请先选关联用户）</span>}</span><span className="flex shrink-0 items-center gap-2">{(entryForm.relatedFundId || entryForm.relatedFundName.trim()) && entryForm.relatedFundId !== "legacy" && !isClosingEntry && !isEditingEntry && <button type="button" onClick={() => { const fund = entryRelatedFunds.find((item) => item.id === entryForm.relatedFundId) ?? { id: "", name: entryForm.relatedFundName.trim(), relatedUserId: entryForm.relatedUserId || undefined }; if (fund.name) openProfitShareManager(fund); }} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">收益分配</button>}{entryRelatedFunds.length > 0 && !isClosingEntry && <button type="button" onClick={() => openDirectoryManager("relatedFund")} className="text-[11px] font-semibold text-indigo-600 active:opacity-70">管理</button>}</span></span>}>
                  <select
                    disabled={!entryForm.relatedUserId || isCloseReview || isClosingEntry}
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
                      disabled={isCloseReview || isClosingEntry}
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
                    disabled={isCloseReview}
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
                  disabled={(isEditingEntry ? updateOpeningEntryMutation.isPending : saveEntryMutation.isPending || (isClosingEntry && entryForm.targetPrice === undefined)) || Boolean(optionFormValidationMessage)}
                  onClick={handleSaveEntry}
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
        <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/40 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label={`确认${ACTIONS[entryForm.action].label}`}>
          <div className="w-full rounded-t border border-amber-200 bg-white p-4 shadow-2xl sm:max-w-sm sm:rounded">
            <div className="text-sm font-semibold text-amber-800">再次确认</div>
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2.5">
              <div className="text-base font-semibold tabular-nums text-slate-900">
                {ACTIONS[entryForm.action].label} {formatQuantity(Number(entryForm.quantity))} ETH @ {formatPrice(Number(entryForm.price))}
              </div>
              <div className="mt-1 text-[11px] leading-4 text-amber-800/85">对应开仓价 {entryForm.targetPrice === undefined ? "--" : formatPrice(entryForm.targetPrice)}；确认后立即写入速记流水并返回报价页。</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={saveEntryMutation.isPending}
                onClick={() => setCloseConfirmationStep("input")}
                className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:scale-[0.99] disabled:opacity-40"
              >
                返回修改
              </button>
              <button
                disabled={saveEntryMutation.isPending}
                onClick={handleSaveEntry}
                className="h-11 rounded bg-amber-600 text-sm font-semibold text-white shadow-sm active:scale-[0.99] disabled:opacity-40"
              >
                确认平仓
              </button>
            </div>
          </div>
        </div>
      )}

      {canManage && profitShareSource && (
        <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/40 sm:items-center sm:justify-center sm:px-5" role="dialog" aria-modal="true" aria-label="管理收益分配">
          <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-t bg-white p-5 shadow-2xl sm:rounded">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">收益分配</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">为项目 {profitShareSource.name} 设置用户收益分配清单</p>
              </div>
              <button type="button" onClick={closeProfitShareManager} aria-label="关闭收益分配" className="rounded p-1 text-slate-400 active:scale-90">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
              项目是下单归属，受益人只能选择全局用户。每位比例为1–100的整数，所有用户合计必须恰好100%。仅之后新开的订单会固化本清单；平仓沿用对应开仓当时比例，并按同一比例承担开、平交易成本。
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

            {activeProfitShareRules.length > 0 && <div className="mt-3 text-[11px] leading-5 text-slate-500">当前规则已生效；保存修改后仅后续新开订单使用新清单，历史订单保持原快照。</div>}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={closeProfitShareManager} className="h-11 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700">取消</button>
              <button type="button" disabled={setProfitShareRuleMutation.isPending || profitShareDraftTotal !== 100} onClick={submitProfitShareRule} className="h-11 rounded bg-indigo-600 text-sm font-semibold text-white disabled:opacity-40">保存清单</button>
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

      {showTotalGrossProfitDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="总收益明细">
          <div className="max-h-[88vh] w-full max-w-sm overflow-y-auto rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">总收益明细</div>
                <div className="mt-1 text-xs text-slate-500">当前筛选范围内的已平仓订单</div>
              </div>
              <button type="button" onClick={() => {
                setShowTotalRevenueCostHint(false);
                setShowTotalGrossProfitDetail(false);
              }} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭总收益明细">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm font-semibold text-slate-700">总收益</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTotalRevenueCostHint((current) => !current)}
                    aria-expanded={showTotalRevenueCostHint}
                    aria-label="查看总收益交易成本提示"
                    className={`whitespace-nowrap border-b border-dashed pb-0.5 text-lg font-bold ${totalGrossProfitClass}`}
                  >
                    {formatSigned(totalGrossProfit)} <span className="text-xs font-semibold text-slate-500">U</span>
                  </button>
                  {showTotalRevenueCostHint && (
                    <div role="status" className="absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 shadow-md">
                      未扣除交易成本
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                <span>订单</span>
                <span>{totalGrossProfitDetails.length} 笔</span>
              </div>
              {totalGrossProfitDetails.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {pagedTotalGrossProfitDetails.map((detail) => {
                    const isLong = ACTIONS[detail.trade.action].side === "long";
                    return (
                      <div key={detail.trade.id} className="flex min-w-0 items-center gap-2 px-3 py-2 text-[11px] tabular-nums whitespace-nowrap">
                        <span className="shrink-0 text-slate-400">{formatBeijingMonthDayTime(detail.trade.createdAt)}</span>
                        <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[detail.trade.action].label}</span>
                        <span className="shrink-0 font-medium text-slate-700">{formatQuantity(detail.quantity)} ETH</span>
                        <span className={`ml-auto shrink-0 font-semibold ${detail.grossPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(detail.grossPnl)} U</span>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="px-3 py-5 text-center text-xs text-slate-400">当前筛选范围暂无已平仓记录</div>}
              {totalGrossProfitDetails.length > 0 && totalRevenueDetailTotalPages > 1 && (
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

            <button type="button" onClick={() => {
              setShowTotalRevenueCostHint(false);
              setShowTotalGrossProfitDetail(false);
            }} className="mt-5 h-11 w-full rounded bg-[#1a56db] text-sm font-semibold text-white active:scale-[0.99]">知道了</button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="累计利润说明">
          <div className="w-full max-w-sm rounded bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold text-slate-900">{isMemberView ? "累计利润说明" : `${grossProfitDetail.side === "long" ? "多仓" : "空仓"}累计利润明细`}</div>
                {!isMemberView && <div className="mt-1 text-xs text-slate-500">已平仓部分按实际成交价汇总</div>}
              </div>
              <button type="button" onClick={() => setGrossProfitDetail(null)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭累计利润说明">
                <X className="h-5 w-5" />
              </button>
            </div>
            {isMemberView ? (
              <div className="mt-5 rounded bg-slate-50 px-4 py-4 text-center text-sm leading-6 text-slate-600">未扣除交易手续费、未扣除交易成本的毛利润。</div>
            ) : <>
              <div className="mt-4 space-y-2 text-sm tabular-nums">
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">毛收益</span><span className={`font-medium ${grossProfitDetail.gross >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(grossProfitDetail.gross)} U</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">开仓手续费分摊</span><span className="font-medium text-slate-700">−{formatFee(grossProfitDetail.openingFee)} U</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">平仓手续费</span><span className="font-medium text-slate-700">−{formatFee(grossProfitDetail.closingFee)} U</span></div>
                <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-2"><span className="font-semibold text-slate-800">净利润</span><span className={`font-semibold ${grossProfitDetail.net >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(grossProfitDetail.net)} U</span></div>
              </div>
              <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">累计利润为未扣手续费的毛收益；净利润已扣除已平部分的开仓手续费分摊及平仓手续费。</div>
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
                <div className="text-base font-semibold text-slate-900">{isMemberView ? "净利润说明" : "净利润计算明细"}</div>
                {!isMemberView && <div className="mt-1 text-xs text-slate-500">已扣除开仓与平仓两次实际手续费</div>}
              </div>
              <button type="button" onClick={() => setNetProfitDetail(null)} className="rounded p-1 text-slate-400 active:scale-90" aria-label="关闭净利润说明">
                <X className="h-5 w-5" />
              </button>
            </div>
            {isMemberView ? (
              <div className="mt-5 rounded bg-slate-50 px-4 py-4 text-center text-sm text-slate-600">已扣除交易成本后的净利润。</div>
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
                onClick={() => deleteOpeningEntryMutation.mutate({ ledgerId: 52, entryId: Number(deleteCandidate.id) })}
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
                onClick={() => revertEntryMutation.mutate({ ledgerId: 52, entryId: Number(revertCandidate.id) })}
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

/** 与多选筛选框同高的单选容器；用于类型、状态等有限枚举条件。 */
function T0SelectFilter({
  label,
  value,
  onChange,
  ariaLabel,
  focusClassName,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  focusClassName: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative flex h-10 min-w-0 items-center gap-1.5 rounded border border-slate-300 bg-white/70 px-2.5 text-[13px] font-medium text-slate-700 transition-colors ${focusClassName}`}
      style={{
        textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.96), inset 0 -1px 0 rgba(100,116,139,0.20)",
      }}
    >
      <span className="shrink-0 text-[11px] font-semibold tracking-wide text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 appearance-none bg-transparent py-0 pr-4 text-[13px] font-medium text-slate-700 outline-none"
        aria-label={ariaLabel}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-500" strokeWidth={2.25} />
    </div>
  );
}

type T0MultiSelectOption = {
  id: string;
  label: string;
  /** 下拉选项可展示完整识别信息；顶部已选摘要可使用更短文案。 */
  summaryLabel?: string;
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
}: {
  label: string;
  options: T0MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
  align?: "left" | "right";
  /** 左缘固定在本筛选框，右缘不超过同一筛选行最右侧的项目框。 */
  constrainRightToFilterRow?: boolean;
  /** 历史筛选栏使用与同行状态控件一致的紧凑高度。 */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [constrainedMenuWidth, setConstrainedMenuWidth] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedSet = new Set(selectedIds);
  const selectedOptions = options.filter((option) => selectedSet.has(option.id));
  const summary = selectedOptions.length === 0
    ? "全部"
    : selectedOptions.length === 1
      ? selectedOptions[0].summaryLabel ?? selectedOptions[0].label
      : `已选 ${selectedOptions.length} 项`;
  const selectedTitle = selectedOptions.length === 0
    ? `${label}：全部`
    : `${label}：${selectedOptions.map((option) => option.label).join("、")}`;

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

  const toggleOption = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(options.filter((option) => next.has(option.id)).map((option) => option.id));
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
              // 用户框左缘不动；菜单宽度只使用其至项目框右缘之间的可用空间。
              const availableWidth = Math.max(triggerBounds.width, rowBounds.right - triggerBounds.left);
              setConstrainedMenuWidth(Math.min(260, Math.floor(availableWidth)));
            }
          } else if (!nextOpen) {
            setConstrainedMenuWidth(null);
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
        {selectedOptions.length === 0 && <span className={`${compact ? "text-[11px]" : "text-[12px]"} shrink-0 font-semibold tracking-wide text-slate-500`}>{label}</span>}
        <span className={`min-w-0 flex-1 truncate ${selectedOptions.length === 0 ? "text-left" : "text-center"}`}>{summary}</span>
        {selectedOptions.length === 0 && <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label}多选`}
          className={`absolute top-[calc(100%+4px)] z-40 max-h-80 w-[min(260px,calc(100vw-32px))] overflow-y-auto rounded border py-1.5 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}
          style={{
            width: constrainedMenuWidth ? `${constrainedMenuWidth}px` : undefined,
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
          <button
            type="button"
            role="option"
            aria-selected={selectedIds.length === 0}
            onClick={() => onChange([])}
            className={`flex min-h-12 w-full items-center gap-3 px-3.5 py-3 text-left text-[15px] font-bold ${selectedIds.length === 0 ? "bg-white/60 text-[#1a56db]" : "text-slate-700 active:bg-white/55"}`}
          >
            {renderCheck(selectedIds.length === 0)}
            <span>全部</span>
          </button>
          <div className="my-1 border-t border-slate-500/20" />
          {options.map((option) => {
            const checked = selectedSet.has(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggleOption(option.id)}
                className={`flex min-h-12 w-full items-center gap-3 px-3.5 py-3 text-left text-[15px] font-bold ${checked ? "bg-white/55 text-[#1a56db]" : "text-slate-700 active:bg-white/55"}`}
              >
                {renderCheck(checked)}
                <span className="min-w-0 flex-1 truncate" title={option.label}>{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccountOverview({
  summary,
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
            return (
              <div
                key={side}
                className={`min-w-0 px-3 py-2.5 text-left ${isLong ? "border-r border-slate-100" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className={`shrink-0 text-xs font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{isLong ? "多" : "空"}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{data.activeLevels}档</span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-1">
                    <span className="text-sm tabular-nums font-semibold text-slate-900">{formatQuantity(data.quantity)}</span>
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
              const profitTone = data.realizedGross >= 0 ? "text-rose-600 border-rose-500" : "text-emerald-600 border-emerald-500";
              return (
                <section key={side} className={`min-w-0 ${isLong ? "border-r border-slate-100" : ""}`}>
                  <div className="space-y-0">
                    <div className="flex h-9 items-center justify-between gap-1 border-t border-slate-100 px-3">
                      <span className="whitespace-nowrap text-slate-500">累计利润</span>
                      <button
                        type="button"
                        onClick={() => onExplainGrossProfit(side, data)}
                        className={`whitespace-nowrap border-b border-dotted pb-0.5 text-[11px] font-semibold outline-none ${profitTone}`}
                        aria-label={`查看${isLong ? "多仓" : "空仓"}累计利润说明`}
                      >
                        {formatSigned(data.realizedGross)} U
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

function PositionCell({ bucket, side, markPrice, onClick, readOnly = false, metadata, isLocked = false, isPending = false }: {
  bucket: PositionBucket;
  side: PositionSide;
  markPrice: number | null;
  onClick: () => void;
  readOnly?: boolean;
  metadata?: LadderCellMetadata;
  /** 仅管理员逐笔报价使用的黑金锁定外观。 */
  isLocked?: boolean;
  /** 仅管理员逐笔报价使用：挂单未成交，采用浅蓝状态底并不展示盈亏。 */
  isPending?: boolean;
}) {
  const isLong = side === "long";
  const isOption = bucket.instrumentType === "option";
  const optionMetadata = metadata?.option;
  const optionGreeks = useOptionGreeks({
    currency: "ETH",
    exerciseDate: optionMetadata?.expiryDate ?? "",
    strikePrice: Number(optionMetadata?.strikePrice) || 0,
    direction: optionMetadata?.direction ?? "long_call",
    enabled: isOption && !isPending && Boolean(optionMetadata?.expiryDate) && Number(optionMetadata?.strikePrice) > 0,
  });
  const optionPnlResult = isOption && !isPending
    ? calculateOptionUnrealizedPnl({
      quantity: bucket.remainingQuantity,
      optionMarkPrice: optionGreeks.data?.markPrice ?? null,
      premium: optionMetadata?.premium,
      premiumCurrency: optionMetadata?.premiumCurrency,
      ethMarkPrice: markPrice,
      direction: optionMetadata?.direction,
    })
    : null;
  const tone = isPending
    ? `text-slate-700${readOnly ? "" : " hover:brightness-[0.98]"}`
    : isLocked
    ? `text-[#f5d78e]${readOnly ? "" : " hover:brightness-110"}`
    : isOption
    ? `text-[#f5e9ff]${readOnly ? "" : " hover:brightness-110"}`
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
  const surfaceStyle = isPending
    ? pendingSurfaceStyle
    : isLocked
    ? lockedSurfaceStyle
    : isOption
    ? T0_OPTION_METAL_SURFACE_STYLE
    : sideSurfaceStyle;
  const quantityTextStyle = isPending
    ? { textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.92), 0.75px 0.75px 0 rgba(2,132,199,0.18)" }
    : isLocked
    ? {
      background: "linear-gradient(180deg, #fff1bd 0%, #f5d78e 38%, #c9a84c 72%, #f5d78e 100%)",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.92))",
    }
    : isOption
    ? { textShadow: "0 1px 1.5px rgba(46,16,101,0.88), 0 -0.5px 1px rgba(255,255,255,0.30)" }
    : { textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.88), 0.75px 0.75px 0 rgba(71,85,105,0.20)" };
  const floatingPnl = isPending
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
      <div className="flex w-full min-w-0 items-center justify-between gap-2 tabular-nums">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`shrink-0 font-bold leading-none tracking-tight ${metadata ? "text-xl" : "text-lg"} ${isPending ? "text-sky-700" : ""}`} style={quantityTextStyle}>{formatLadderQuantity(bucket.remainingQuantity)}</span>
        </div>
        {floatingPnl !== null && (
          <span className={`flex shrink-0 flex-col items-end text-right ${pnlTone}`} style={isOption ? { color: optionPnlColor, textShadow: "none" } : undefined}>
            <span className={`whitespace-nowrap font-semibold leading-none ${metadata ? "text-[10px]" : "text-[11px]"}`} style={pnlTextStyle}>{formatSigned(floatingPnl)}</span>
            {floatingReturnRate !== null && (
              <span className={`${metadata ? "mt-0.5 text-[9px]" : "mt-1 text-[10px]"} font-medium leading-none opacity-85`}>{formatSignedPercent(floatingReturnRate)}</span>
            )}
          </span>
        )}
      </div>
      {metadata && <div className={`mt-1 flex min-w-0 items-center text-left text-[9px] font-medium leading-none ${isLocked && !isPending ? "text-[#c9a84c]/85" : isOption ? "text-violet-100/90" : "text-slate-500"}`} aria-label={`账户 ${metadata.accountName}，用户 ${metadata.relatedUserName}，项目 ${metadata.relatedFundName}${metadata.instrumentShortLabel ? `，类型 ${metadata.instrumentShortLabel}` : ""}${isPending ? "，挂单待成交" : ""}`}>
        <div className="flex min-w-0 flex-1 items-center overflow-hidden">
          <span className="min-w-0 shrink truncate" title={`账户：${metadata.accountName}`}>{metadata.accountName}</span>
          <span className="shrink-0">·</span>
          <span className="min-w-0 shrink truncate" title={`用户：${metadata.relatedUserName}`}>{metadata.relatedUserName}</span>
          <span className="shrink-0">·</span>
          <span className="min-w-0 shrink truncate" title={`项目：${metadata.relatedFundName}`}>{metadata.relatedFundName}</span>
        </div>
        {(isLocked || isPending || metadata.instrumentShortLabel) && <div className="ml-1 flex shrink-0 items-center gap-0.5">
          {isLocked && <Lock className="h-2.5 w-2.5 shrink-0 text-[#f5d78e]/85" strokeWidth={2.5} aria-label="已锁定" />}
          {isPending && <Clock3 className="h-2.5 w-2.5 shrink-0 text-sky-600" strokeWidth={2.5} aria-label="挂单待成交" />}
          {metadata.instrumentShortLabel && <span className={isLocked && !isPending ? "text-[#f5d78e]/85" : isOption ? "text-violet-100" : "text-slate-500"} title={metadata.instrumentShortLabel}>{metadata.instrumentShortLabel}</span>}
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
  isPending = false,
}: {
  bucket?: PositionBucket;
  side: PositionSide;
  markPrice: number | null;
  onClose: () => void;
  onOpen: () => void;
  readOnly?: boolean;
  metadata?: LadderCellMetadata;
  isLocked?: boolean;
  isPending?: boolean;
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
    return <PositionCell bucket={bucket} side={side} markPrice={markPrice} onClick={requireDoubleActivation(onClose)} readOnly={readOnly} metadata={metadata} isLocked={isLocked} isPending={isPending} />;
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
