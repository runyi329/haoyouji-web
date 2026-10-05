import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import {
  ArrowLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type TradeAction = "openLong" | "closeLong" | "openShort" | "closeShort";
type PositionSide = "long" | "short";

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
  relatedUserId?: string;
  relatedUserName?: string;
  relatedUsername?: string;
  relatedUserAvatar?: string;
  relatedFundId?: string;
  relatedFundName?: string;
  symbol: string;
  action: TradeAction;
  quantity: number;
  price: number;
  fee: number;
  createdAt: string;
  targetPrice?: number;
  note?: string;
  clientRequestId?: string;
  isSyncing?: boolean;
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
    relatedUserId: entry.relatedUserId === undefined || entry.relatedUserId === null ? undefined : String(entry.relatedUserId),
    relatedUserName: entry.relatedUserName ? String(entry.relatedUserName) : undefined,
    relatedUsername: entry.relatedUsername ? String(entry.relatedUsername) : undefined,
    relatedUserAvatar: entry.relatedUserAvatar ? String(entry.relatedUserAvatar) : undefined,
    relatedFundId: entry.relatedFundId === undefined || entry.relatedFundId === null ? undefined : String(entry.relatedFundId),
    relatedFundName: entry.relatedFundName ? String(entry.relatedFundName) : undefined,
    symbol: String(entry.symbol || "ETH"),
    action: entry.action as TradeAction,
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
  /** T 型报价展示和开平匹配使用的归属档位（非实际成交价）。 */
  price: number;
  originalQuantity: number;
  remainingQuantity: number;
  /** 剩余仓位按实际成交价累计的成本，用于均价与盈亏。 */
  costBasis: number;
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

/** 某一开仓主单被分批平掉时，对应的平仓流水及本次分配数量。 */
type LinkedClosingAllocation = {
  trade: PreviewTrade;
  quantity: number;
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
  quantity: string;
  price: string;
  note: string;
  targetPrice?: number;
  editingEntryId?: string;
};

const ACTIONS: Record<TradeAction, { label: string; side: PositionSide; opening: boolean; activeClass: string; idleClass: string }> = {
  openLong: {
    label: "开多",
    side: "long",
    opening: true,
    activeClass: "border-rose-500 bg-rose-600 text-white",
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

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const LADDER_MIN_PRICE = 2500;
const LADDER_MAX_PRICE = 3000;
const LADDER_STEP = 10;
const LADDER_NEAR_VISIBLE_STEPS = 3;
const POSITION_ARCHIVE_STEP = 10;
const T0_PRICE_REFRESH_INTERVAL_MS = 3_000;
const DEFAULT_QUANTITY_QUICK_OPTIONS = ["10.00", "20.00", "30.00", "40.00", "50.00"];
const OKX_VIP2_TAKER_FEE_RATE = 0.00036;
const OKX_VIP2_TAKER_FEE_LABEL = "0.0360%";
const ETH_QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;

function priceKey(price: number) {
  return Number(price).toFixed(2);
}

/**
 * 不受点击格影响，始终按实际成交价的十美元档归类：
 * - 多仓向上归档，如 2701 → 2710；
 * - 空仓向下归档，如 2701 → 2700；
 * 精确落在十位线的价格保留原档。
 */
function archivePriceForSide(side: PositionSide, value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scaled = value / POSITION_ARCHIVE_STEP;
  const rounded = side === "long"
    ? Math.ceil(scaled - 1e-9)
    : Math.floor(scaled + 1e-9);
  return Number((rounded * POSITION_ARCHIVE_STEP).toFixed(2));
}

function archivePriceForTrade(trade: PreviewTrade) {
  const side = ACTIONS[trade.action].side;
  // 开仓永远以真实成交价归类，兼容此前被按方向写入错误百元档的旧流水。
  const sourcePrice = ACTIONS[trade.action].opening
    ? trade.price
    : (trade.targetPrice !== undefined && trade.targetPrice > 0 ? trade.targetPrice : trade.price);
  return archivePriceForSide(side, sourcePrice);
}

function formatPrice(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return "--";
  return numberFormatter.format(value);
}

function formatLadderPrice(value: number) {
  return String(Math.round(value));
}

/**
 * 只保留必要价格档：
 * - 实时价所在十元档上下各 3 档，便于快速开平；
 * - 每个已有未平仓的归属档，无论距离当前价多远都固定保留；
 * - 没有仓位、且不在实时价附近的空白档自动隐藏。
 */
function buildAdaptiveLadderLevels(markLadderPrice: number | null, positionPrices: number[] = []) {
  const defaultCenter = Math.round((LADDER_MIN_PRICE + LADDER_MAX_PRICE) / 2 / LADDER_STEP) * LADDER_STEP;
  const center = Math.min(LADDER_MAX_PRICE, Math.max(LADDER_MIN_PRICE, markLadderPrice ?? defaultCenter));
  const levels = new Set<number>();

  for (let offset = -LADDER_NEAR_VISIBLE_STEPS; offset <= LADDER_NEAR_VISIBLE_STEPS; offset += 1) {
    const price = center + offset * LADDER_STEP;
    if (price >= LADDER_MIN_PRICE && price <= LADDER_MAX_PRICE) levels.add(price);
  }
  if (markLadderPrice !== null) levels.add(markLadderPrice);
  // 远端空白价位可以折叠，但已有仓位的十元归档档位必须始终可见。
  for (const price of positionPrices) {
    if (Number.isFinite(price) && price >= LADDER_MIN_PRICE && price <= LADDER_MAX_PRICE) {
      levels.add(price);
    }
  }
  return Array.from(levels).sort((a, b) => b - a);
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value) || value === 0) return "0.00";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  grossPnl?: number;
  netPnl?: number;
  allocatedOpeningFee?: number;
  closingFee?: number;
};

function buildRecentJournalTradeDetails(trades: PreviewTrade[]) {
  const positions = new Map<string, { quantity: number; costBasis: number; openingFeeBasis: number }>();
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
      const current = positions.get(key) ?? { quantity: 0, costBasis: 0, openingFeeBasis: 0 };
      current.quantity += trade.quantity;
      current.costBasis += trade.quantity * trade.price;
      current.openingFeeBasis += trade.fee;
      positions.set(key, current);
      details.set(trade.id, side === "long" ? { buyPrice: trade.price } : { sellPrice: trade.price });
      continue;
    }

    const current = positions.get(key);
    const matchedQuantity = current ? Math.min(current.quantity, trade.quantity) : 0;
    const openingAverage = current && current.quantity > 0 ? current.costBasis / current.quantity : undefined;
    const allocatedOpeningFee = current && current.quantity > 0 && matchedQuantity > 0
      ? current.openingFeeBasis * (matchedQuantity / current.quantity)
      : 0;
    if (current && openingAverage !== undefined && matchedQuantity > 0) {
      current.quantity -= matchedQuantity;
      current.costBasis = Math.max(0, current.costBasis - openingAverage * matchedQuantity);
      current.openingFeeBasis = Math.max(0, current.openingFeeBasis - allocatedOpeningFee);
      positions.set(key, current);
    }

    if (side === "long") {
      const grossPnl = openingAverage === undefined || matchedQuantity <= 0
        ? undefined
        : (trade.price - openingAverage) * matchedQuantity;
      details.set(trade.id, {
        buyPrice: openingAverage,
        sellPrice: trade.price,
        grossPnl,
        netPnl: grossPnl === undefined ? undefined : grossPnl - allocatedOpeningFee - trade.fee,
        allocatedOpeningFee,
        closingFee: trade.fee,
      });
    } else {
      const grossPnl = openingAverage === undefined || matchedQuantity <= 0
        ? undefined
        : (openingAverage - trade.price) * matchedQuantity;
      details.set(trade.id, {
        buyPrice: trade.price,
        sellPrice: openingAverage,
        grossPnl,
        netPnl: grossPnl === undefined ? undefined : grossPnl - allocatedOpeningFee - trade.fee,
        allocatedOpeningFee,
        closingFee: trade.fee,
      });
    }
  }

  return details;
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
      if (existing) {
        existing.originalQuantity += trade.quantity;
        existing.remainingQuantity += trade.quantity;
        existing.costBasis += trade.quantity * trade.price;
        existing.openingFeeBasis += trade.fee;
      } else {
        buckets.set(key, {
          key,
          side,
          price: archivePrice,
          originalQuantity: trade.quantity,
          remainingQuantity: trade.quantity,
          costBasis: trade.quantity * trade.price,
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
    const averageCost = target.costBasis / target.remainingQuantity;
    const allocatedOpeningFee = target.openingFeeBasis * (closedQuantity / target.remainingQuantity);
    const grossPnl = side === "long"
      ? (trade.price - averageCost) * closedQuantity
      : (averageCost - trade.price) * closedQuantity;
    target.remainingQuantity -= closedQuantity;
    target.costBasis = Math.max(0, target.costBasis - averageCost * closedQuantity);
    target.openingFeeBasis = Math.max(0, target.openingFeeBasis - allocatedOpeningFee);
    target.realizedGrossPnl += grossPnl;
    target.realizedOpeningFee += allocatedOpeningFee;
    target.realizedClosingFee += trade.fee;
    target.realizedPnl += grossPnl - allocatedOpeningFee - trade.fee;
    target.closedQuantity += closedQuantity;
    target.closedCostBasis += averageCost * closedQuantity;
    target.closedNotional += trade.price * closedQuantity;
  }

  return Array.from(buckets.values()).filter((bucket) => bucket.originalQuantity > 0);
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

function calculateSummary(buckets: PositionBucket[], markPrice: number | null, trades: PreviewTrade[]) {
  const calculateSide = (side: PositionSide) => {
    const active = buckets.filter((bucket) => bucket.side === side && bucket.remainingQuantity > 0.0000001);
    const all = buckets.filter((bucket) => bucket.side === side);
    const sideTrades = trades.filter((trade) => ACTIONS[trade.action].side === side);
    const quantity = active.reduce((total, bucket) => total + bucket.remainingQuantity, 0);
    const weightedCost = active.reduce((total, bucket) => total + bucket.costBasis, 0);
    const average = quantity > 0 ? weightedCost / quantity : 0;
    const unrealized = markPrice && quantity > 0
      ? (side === "long" ? markPrice - average : average - markPrice) * quantity
      : null;
    const realized = all.reduce((total, bucket) => total + bucket.realizedPnl, 0);
    const realizedGross = all.reduce((total, bucket) => total + bucket.realizedGrossPnl, 0);
    const realizedOpeningFee = all.reduce((total, bucket) => total + bucket.realizedOpeningFee, 0);
    const realizedClosingFee = all.reduce((total, bucket) => total + bucket.realizedClosingFee, 0);
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
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [relatedUserFilterId, setRelatedUserFilterId] = useState("all");
  const [relatedFundFilterId, setRelatedFundFilterId] = useState("all");
  const [journalAccountFilterId, setJournalAccountFilterId] = useState("all");
  const [journalRelatedUserFilterId, setJournalRelatedUserFilterId] = useState("all");
  const [journalRelatedFundFilterId, setJournalRelatedFundFilterId] = useState("all");
  const [lastRelatedUserId, setLastRelatedUserId] = useState("");
  const [lastAccountIdByRelatedUser, setLastAccountIdByRelatedUser] = useState<Record<string, string>>({});
  const [lastFundIdByRelatedUser, setLastFundIdByRelatedUser] = useState<Record<string, string>>({});
  const [relatedUserPickerOpen, setRelatedUserPickerOpen] = useState(false);
  const [relatedUserSearch, setRelatedUserSearch] = useState("");
  const [showEntrySheet, setShowEntrySheet] = useState(false);
  const [closeConfirmationStep, setCloseConfirmationStep] = useState<"input" | "review">("input");
  const [expandedOpenedTradeIds, setExpandedOpenedTradeIds] = useState<Set<string>>(() => new Set());
  const [deleteCandidate, setDeleteCandidate] = useState<PreviewTrade | null>(null);
  const [revertCandidate, setRevertCandidate] = useState<PreviewTrade | null>(null);
  const [netProfitDetail, setNetProfitDetail] = useState<{ trade: PreviewTrade; detail: RecentJournalTradeDetail } | null>(null);
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
  const [lastSavedQuantity, setLastSavedQuantity] = useState("");
  const [showRecentRecords, setShowRecentRecords] = useState(true);
  const [showCumulativeData, setShowCumulativeData] = useState(false);
  const [lastMarkPrice, setLastMarkPrice] = useState<number | null>(null);
  const [previousMarkPrice, setPreviousMarkPrice] = useState<number | null>(null);
  const previousFetchedMarkPriceRef = useRef<number | null>(null);
  const ladderScrollRef = useRef<HTMLDivElement>(null);
  const [entryForm, setEntryForm] = useState<EntryForm>({
    action: "openLong",
    accountId: "",
    accountName: "",
    relatedUserId: "",
    relatedUserName: "",
    relatedUsername: "",
    relatedFundId: "",
    relatedFundName: "",
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
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: T0_PRICE_REFRESH_INTERVAL_MS,
    staleTime: 2500,
  });
  const t0JournalQuery = trpc.ledger.t0GetJournal.useQuery(
    { ledgerId: 52 },
    { enabled: canAccess, staleTime: 10_000 },
  );
  const isMemberView = (t0JournalQuery.data as any)?.viewerMode === "member";
  const canManage = canAccess && (t0JournalQuery.data as any)?.viewerMode === "admin";
  const relatedUserSearchQuery = trpc.ledger.t0SearchRelatedUsers.useQuery(
    { ledgerId: 52, query: relatedUserSearch.trim() },
    {
      enabled: canManage && relatedUserPickerOpen && relatedUserSearch.trim().length > 0,
      staleTime: 30_000,
    },
  );

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
  // 合约速记只使用服务端统一缓存的 ETH 永续标记价（Gate → HTX）；失败时由后端保留最近成功价。
  const markPriceRaw = (cryptoPricesRaw as any)?.prices?.ETH_PERP
    ?? (cryptoPricesRaw as any)?.ETH_PERP;
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
    const nextTrades: PreviewTrade[] = Array.isArray(journal.entries)
      ? journal.entries.map(previewTradeFromEntry)
      : [];
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
    const latestSavedEntry = nextTrades
      .filter((entry) => entry.symbol === "ETH")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setLastSavedQuantity(latestSavedEntry ? normalizeEthQuantity(String(latestSavedEntry.quantity)) : "");
    // 总览始终跨全部下单账户汇总：管理员默认“全部账户 + 全部用户 + 全部专项款”，
    // 成员个人视图则固定聚合本人关联的全部账户，避免账户维度遮住同一用户的资金仓位。
    if (journal.viewerMode === "admin") {
      setSelectedAccountId("all");
      setRelatedUserFilterId("all");
      setRelatedFundFilterId("all");
    } else {
      setSelectedAccountId("all");
      setRelatedUserFilterId((current) => current === "all" || current === "unlinked" || nextRecentRelatedUsers.some((user) => user.id === current)
        ? current
        : "all");
      setRelatedFundFilterId((current) => current === "all" || current === "unclassified" || nextRelatedFunds.some((fund) => fund.id === current)
        ? current
        : "all");
    }
    setLastRelatedUserId((current) => nextRecentRelatedUsers.some((user) => user.id === current)
      ? current
      : (nextRecentRelatedUsers[0]?.id || ""));
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
      : "text-indigo-700";

  const selectedTrades = useMemo(
    () => trades.filter((trade) => (
      (selectedAccountId === "all" || trade.accountId === selectedAccountId)
      && trade.symbol === "ETH"
      && (relatedUserFilterId === "all"
        || (relatedUserFilterId === "unlinked" ? !trade.relatedUserId : trade.relatedUserId === relatedUserFilterId))
      && (relatedFundFilterId === "all"
        || (relatedFundFilterId === "unclassified" ? !trade.relatedFundId : trade.relatedFundId === relatedFundFilterId))
    )),
    [trades, selectedAccountId, relatedUserFilterId, relatedFundFilterId],
  );
  const recentJournalTrades = useMemo(
    () => trades.filter((trade) => (
      trade.symbol === "ETH"
      && (journalAccountFilterId === "all" || trade.accountId === journalAccountFilterId)
      && (journalRelatedUserFilterId === "all"
        || (journalRelatedUserFilterId === "unlinked" ? !trade.relatedUserId : trade.relatedUserId === journalRelatedUserFilterId))
      && (journalRelatedFundFilterId === "all"
        || (journalRelatedFundFilterId === "unclassified" ? !trade.relatedFundId : trade.relatedFundId === journalRelatedFundFilterId))
    )),
    [trades, journalAccountFilterId, journalRelatedUserFilterId, journalRelatedFundFilterId],
  );
  const recentJournalTradeDetails = useMemo(() => buildRecentJournalTradeDetails(trades), [trades]);
  const getTradeAccountName = (trade: PreviewTrade) => trade.accountName
    || accounts.find((account) => account.id === trade.accountId)?.name
    || "未命名账户";
  const getTradeRelatedUserName = (trade: PreviewTrade) => trade.relatedUserName
    || trade.relatedUsername
    || (trade.relatedUserId ? `用户#${trade.relatedUserId}` : "未关联用户");
  const getTradeRelatedFundName = (trade: PreviewTrade) => trade.relatedFundName
    || (trade.relatedFundId ? `专项款#${trade.relatedFundId}` : "未区分专项款（历史）");
  const memberRelatedUserName = useMemo(() => {
    const ownTrade = trades.find((trade) => Boolean(trade.relatedUserId));
    return ownTrade ? getTradeRelatedUserName(ownTrade) : "本人";
  }, [trades]);
  const getRelatedFundOwnerName = (fund: PreviewRelatedFund) => {
    const user = recentRelatedUsers.find((item) => item.id === fund.relatedUserId);
    return user ? (user.username ? `${user.name} · @${user.username}` : user.name) : "关联用户";
  };
  const availableRelatedFunds = useMemo(
    () => relatedFunds.filter((fund) => relatedUserFilterId === "all" || fund.relatedUserId === relatedUserFilterId),
    [relatedFunds, relatedUserFilterId],
  );
  const journalAvailableRelatedFunds = useMemo(
    () => relatedFunds.filter((fund) => journalRelatedUserFilterId === "all" || fund.relatedUserId === journalRelatedUserFilterId),
    [relatedFunds, journalRelatedUserFilterId],
  );
  const entryRelatedFunds = useMemo(
    () => relatedFunds.filter((fund) => fund.relatedUserId === entryForm.relatedUserId),
    [relatedFunds, entryForm.relatedUserId],
  );
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
    const quantity = Number(normalizeEthQuantity(entryForm.quantity));
    const price = Number(entryForm.price);
    if (quantityFormatError || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) return null;
    return Number((quantity * price * OKX_VIP2_TAKER_FEE_RATE).toFixed(8));
  }, [entryForm.quantity, entryForm.price, quantityFormatError]);
  const openingArchivePrice = useMemo(() => {
    const price = Number(entryForm.price);
    if (!ACTIONS[entryForm.action].opening || !Number.isFinite(price) || price <= 0) return null;
    return archivePriceForSide(ACTIONS[entryForm.action].side, price);
  }, [entryForm.action, entryForm.price]);
  const buckets = useMemo(() => buildPositionBuckets(selectedTrades), [selectedTrades]);
  const summary = useMemo(() => calculateSummary(buckets, markPrice, selectedTrades), [buckets, markPrice, selectedTrades]);
  // 首屏总览：累计利润保持与多/空“累计利润”一致的未扣手续费口径；总仓位为多仓减空仓后的净额。
  const totalGrossProfit = summary.long.realizedGross + summary.short.realizedGross;
  const netPositionQuantity = summary.long.quantity - summary.short.quantity;
  const totalGrossProfitClass = totalGrossProfit > 0 ? "text-rose-600" : totalGrossProfit < 0 ? "text-emerald-600" : "text-slate-700";
  const netPositionClass = "text-slate-800";
  const totalGrossProfitSurfaceClass = "border-slate-200 bg-white";
  const netPositionSurfaceClass = netPositionQuantity > 0
    ? "border-rose-100/80 bg-white"
    : netPositionQuantity < 0
      ? "border-emerald-100/80 bg-white"
      : "border-slate-200 bg-white";
  const markPriceSurfaceClass = priceTrend === "up"
    ? "border-rose-100/80 bg-white"
    : priceTrend === "down"
      ? "border-emerald-100/80 bg-white"
      : "border-indigo-100/80 bg-white";
  const roundedNetPositionText = (() => {
    const rounded = Math.round(netPositionQuantity);
    return `${rounded < 0 ? "−" : ""}${Math.abs(rounded).toLocaleString("en-US")}`;
  })();
  // 从某个T型档位进入时，详情仅展示该方向、该归属档位的订单和汇总；
  // 从底部通用开平按钮进入时没有指定档位，才保留方向总览。
  const entryScopedTrades = useMemo(() => selectedTrades.filter((trade) => {
    if (ACTIONS[trade.action].side !== entrySide) return false;
    return entryForm.targetPrice === undefined
      || priceKey(archivePriceForTrade(trade)) === priceKey(entryForm.targetPrice);
  }), [selectedTrades, entrySide, entryForm.targetPrice]);
  const entryScopedBuckets = useMemo(() => buckets.filter((bucket) => {
    if (bucket.side !== entrySide) return false;
    return entryForm.targetPrice === undefined
      || priceKey(bucket.price) === priceKey(entryForm.targetPrice);
  }), [buckets, entrySide, entryForm.targetPrice]);
  const entryScopedSummary = useMemo(
    () => calculateSummary(entryScopedBuckets, markPrice, entryScopedTrades),
    [entryScopedBuckets, markPrice, entryScopedTrades],
  );
  const entrySideSummary = entrySide === "long" ? entryScopedSummary.long : entryScopedSummary.short;
  // 档位详情已由用户刚点击的价格格定位，无需在标题重复显示档位，避免移动端换行。
  // 顶部始终明确为当前档位或当前方向范围的汇总，逐笔订单在下方直接展示。
  const entryScopeTitle = `${entrySide === "long" ? "多仓" : "空仓"}汇总`;
  const openedTradeList = useMemo(
    () => entryScopedTrades
      .filter((trade) => ACTIONS[trade.action].opening)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [entryScopedTrades],
  );
  const openingClosingAllocations = useMemo(
    () => buildOpeningClosingAllocations(entryScopedTrades),
    [entryScopedTrades],
  );
  const isEditingEntry = Boolean(entryForm.editingEntryId);
  const isClosingEntry = !ACTIONS[entryForm.action].opening;
  const isCloseReview = isClosingEntry && closeConfirmationStep === "review";
  const markLadderPrice = markPrice
    ? Math.min(LADDER_MAX_PRICE, Math.max(LADDER_MIN_PRICE, Math.round(markPrice / LADDER_STEP) * LADDER_STEP))
    : null;
  const priceRows = useMemo(() => {
    const activePositionPrices = buckets
      .filter((bucket) => bucket.remainingQuantity > 0.0000001)
      .map((bucket) => bucket.price);
    return buildAdaptiveLadderLevels(markLadderPrice, activePositionPrices).map((price) => ({
      price,
      long: buckets.find((bucket) => bucket.side === "long" && priceKey(bucket.price) === priceKey(price)),
      short: buckets.find((bucket) => bucket.side === "short" && priceKey(bucket.price) === priceKey(price)),
      isMark: markLadderPrice === price,
    }));
  }, [buckets, markLadderPrice]);

  useEffect(() => {
    if (markLadderPrice === null) return;
    let firstFrame = 0;
    let secondFrame = 0;
    let settledFrame = 0;

    const centerCurrentPriceRow = () => {
      const container = ladderScrollRef.current;
      if (!container || container.clientHeight <= 0) return;
      const row = container.querySelector<HTMLElement>(`[data-ladder-price="${markLadderPrice}"]`);
      if (!row) return;
      // offsetTop 会受页面外层定位上下文影响；以两者当前可视坐标换算，才能精确居中。
      const containerRect = container.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const rowCenterInViewport = rowRect.top - containerRect.top + rowRect.height / 2;
      const targetTop = Math.max(0, container.scrollTop + rowCenterInViewport - container.clientHeight / 2);
      container.scrollTo({ top: targetTop, behavior: "auto" });
    };

    const scheduleCentering = () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settledFrame);
      firstFrame = window.requestAnimationFrame(() => {
        centerCurrentPriceRow();
        secondFrame = window.requestAnimationFrame(centerCurrentPriceRow);
        // 覆盖浏览器返回页面或首屏布局完成后可能恢复的旧滚动位置。
        settledFrame = window.setTimeout(centerCurrentPriceRow, 180);
      });
    };

    scheduleCentering();
    window.addEventListener("pageshow", scheduleCentering);
    window.addEventListener("resize", scheduleCentering);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settledFrame);
      window.removeEventListener("pageshow", scheduleCentering);
      window.removeEventListener("resize", scheduleCentering);
    };
  }, [markLadderPrice, priceRows.length]);

  const openEntrySheet = (action: TradeAction = "openLong", targetPrice?: number) => {
    setEntrySide(ACTIONS[action].side);
    setCloseConfirmationStep("input");
    const rememberedAccount = getRememberedAccountForRelatedUser(lastRelatedUser?.id);
    const defaultRelatedFund = getRememberedFundForRelatedUser(lastRelatedUser?.id);
    setEntryForm({
      action,
      accountId: rememberedAccount?.id ?? "",
      accountName: rememberedAccount?.name ?? "",
      relatedUserId: lastRelatedUser?.id ?? "",
      relatedUserName: lastRelatedUser?.name ?? "",
      relatedUsername: lastRelatedUser?.username ?? "",
      relatedFundId: defaultRelatedFund?.id ?? "",
      relatedFundName: defaultRelatedFund?.name ?? "",
      quantity: "",
      // 开仓成交价由管理员实际录入；保留浅色 0.00 占位，避免误把参考价写入流水。
      price: "",
      note: "",
      targetPrice,
    });
    setShowEntrySheet(true);
  };

  const openQuickCloseSheet = (trade: PreviewTrade) => {
    const side = ACTIONS[trade.action].side;
    // 未关联用户的订单也可独立平仓；空关联值会稳定归到同一“未关联”仓位池，
    // 不会和任何已关联用户的订单互相抵扣。
    const relatedUserKey = trade.relatedUserId ?? "";
    const relatedFundKey = trade.relatedFundId ?? "";
    const tradeUserBuckets = buildPositionBuckets(selectedTrades.filter((item) => (
      item.accountId === trade.accountId
      && (item.relatedUserId ?? "") === relatedUserKey
      && (item.relatedFundId ?? "") === relatedFundKey
    )));
    const target = tradeUserBuckets.find((bucket) => bucket.side === side && priceKey(bucket.price) === priceKey(archivePriceForTrade(trade)));
    if (!target || target.remainingQuantity <= 0.0000001) {
      toast.error("该笔仓位已无可平数量");
      return;
    }
    const action: TradeAction = side === "long" ? "closeLong" : "closeShort";
    setEntrySide(side);
    setCloseConfirmationStep("input");
    setEntryForm({
      action,
      accountId: trade.accountId,
      accountName: getTradeAccountName(trade),
      relatedUserId: trade.relatedUserId ?? "",
      relatedUserName: trade.relatedUserName ?? trade.relatedUsername ?? "",
      relatedUsername: trade.relatedUsername ?? "",
      relatedFundId: trade.relatedFundId ?? "legacy",
      relatedFundName: trade.relatedFundName ?? "",
      quantity: formatQuantity(Math.min(target.remainingQuantity, trade.quantity)),
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
    setEntrySide(ACTIONS[trade.action].side);
    setCloseConfirmationStep("input");
    setEntryForm({
      action: trade.action,
      accountId: trade.accountId,
      accountName: accounts.find((account) => account.id === trade.accountId)?.name ?? "",
      relatedUserId: trade.relatedUserId ?? "",
      relatedUserName: trade.relatedUserName ?? trade.relatedUsername ?? "",
      relatedUsername: trade.relatedUsername ?? "",
      relatedFundId: trade.relatedFundId ?? "legacy",
      relatedFundName: trade.relatedFundName ?? "",
      quantity: formatQuantity(trade.quantity),
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
      setSelectedAccountId((current) => current === "all" ? current : account.id);
      const savedQuantity = String(variables.quantity || "").trim();
      if (savedQuantity) {
        setLastSavedQuantity(savedQuantity);
      }
      toast.success("速记已保存");
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
        quantity: Number(data.entry.quantity),
        price: Number(data.entry.price),
        fee: Number(data.entry.fee || 0),
        createdAt: String(data.entry.createdAt),
        targetPrice: data.entry.targetPrice === undefined || data.entry.targetPrice === null ? undefined : Number(data.entry.targetPrice),
        note: data.entry.note || undefined,
      };
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
      setShowEntrySheet(false);
      setCloseConfirmationStep("input");
      toast.success("开仓记录已修改");
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
      accountId: rememberedAccount?.id ?? "",
      accountName: rememberedAccount?.name ?? "",
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
      accountId: rememberedAccount?.id ?? "",
      accountName: rememberedAccount?.name ?? "",
      relatedUserId: "",
      relatedUserName: "",
      relatedUsername: "",
      relatedFundId: "",
      relatedFundName: "",
    }));
    setRelatedUserSearch("");
    setRelatedUserPickerOpen(false);
  };

  const handleSaveEntry = () => {
    const normalizedQuantity = normalizeEthQuantity(entryForm.quantity);
    const quantity = Number(normalizedQuantity);
    const price = Number(entryForm.price);
    const fee = estimatedFeeUsdt ?? 0;
    const selectedAction = ACTIONS[entryForm.action];
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
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("请输入成交价格");
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

    if (entryForm.editingEntryId) {
      const entryId = Number(entryForm.editingEntryId);
      if (!selectedAction.opening || !Number.isInteger(entryId) || entryId <= 0) {
        toast.error("仅可编辑有效的开仓记录");
        return;
      }
      updateOpeningEntryMutation.mutate({
        ledgerId: 52,
        entryId,
        relatedUserId: normalizedRelatedUserId,
        relatedFundId: normalizedRelatedFundId,
        relatedFundName: normalizedRelatedFundName || undefined,
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
      const closeScopeTrades = trades.filter((trade) => (
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
    setSelectedAccountId((current) => current === "all" ? current : accountId);
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
    setShowEntrySheet(false);
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
    <div className={`${embedded ? "min-h-0 w-full" : "min-h-screen max-w-md mx-auto"} bg-slate-50 pb-6`}>
      {!(embedded && isMemberView) && (
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
          <div className="h-14 px-4 flex items-center gap-3">
            {!embedded && <button onClick={backToLedger} aria-label="返回52号账本" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center active:scale-95">
              <ArrowLeft className="w-5 h-5 text-slate-800" />
            </button>}
            <div className="min-w-0 flex-1">
              <h1 className="font-semibold text-slate-900">T+0 速记账本</h1>
            </div>
            <button
              onClick={() => window.location.reload()}
              aria-label="强制刷新整个页面"
              title="强制刷新整个页面"
              className="h-8 rounded border border-indigo-100 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 active:scale-95"
            >
              刷新
            </button>
          </div>
        </header>
      )}

      <main className="px-4 pt-4 space-y-4">
        <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-3 gap-1.5 bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 p-2">
            <div className={`min-w-0 rounded border px-1.5 py-2.5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.025)] ${totalGrossProfitSurfaceClass}`}>
              <div className="text-[10px] font-semibold text-slate-500">总利润</div>
              <div className={`mt-1 flex items-baseline justify-center gap-0.5 whitespace-nowrap text-[17px] font-bold leading-none tabular-nums ${totalGrossProfitClass}`}>
                <span>{formatSigned(totalGrossProfit)}</span>
                <span className="text-[10px] font-semibold opacity-65">U</span>
              </div>
            </div>
            <div className={`min-w-0 rounded border px-1.5 py-2.5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.025)] ${netPositionSurfaceClass}`}>
              <div className="text-[10px] font-semibold text-slate-500">实时总仓位</div>
              <div className={`mt-1 flex items-baseline justify-center gap-0.5 whitespace-nowrap text-[15px] font-bold leading-none tabular-nums ${netPositionClass}`}>
                <span>{roundedNetPositionText}</span>
                <span className="text-[10px] font-semibold opacity-65">ETH</span>
              </div>
            </div>
            <div className={`min-w-0 rounded border px-1.5 py-2.5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.025)] ${markPriceSurfaceClass}`}>
              <div className="text-[10px] font-semibold text-slate-500">实时参考价</div>
              <div className={`mt-1 flex items-baseline justify-center gap-0.5 whitespace-nowrap text-[15px] font-bold leading-none tabular-nums ${priceTrendClass}`}>
                {priceTrend === "up" && <span role="img" aria-label="价格上涨" className="inline-block h-0 w-0 border-x-[3px] border-b-[5px] border-x-transparent border-b-current" />}
                {priceTrend === "down" && <span role="img" aria-label="价格下跌" className="inline-block h-0 w-0 border-x-[3px] border-t-[5px] border-x-transparent border-t-current" />}
                <span>{formatPrice(markPrice)}</span>
                <span className="text-[10px] font-semibold opacity-65">U</span>
              </div>
            </div>
          </div>
          <div className="border-t border-slate-200/80 bg-white px-4 py-2.5">
            <div className="grid grid-cols-3 gap-2">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] text-slate-400">下单账户</span>
                <select
                  value={selectedAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                  className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="all">全部账户</option>
                  {accounts.length === 0 && <option value="">暂无账户</option>}
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] text-slate-400">关联用户</span>
                <select
                  value={relatedUserFilterId}
                  onChange={(event) => {
                    setRelatedUserFilterId(event.target.value);
                    setRelatedFundFilterId("all");
                  }}
                  disabled={isMemberView}
                  className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 disabled:cursor-default disabled:bg-slate-50"
                >
                  {isMemberView ? <option value="all">{memberRelatedUserName}</option> : <>
                    <option value="all">全部用户</option>
                    {trades.some((trade) => !trade.relatedUserId) && <option value="unlinked">未关联用户（历史）</option>}
                    {recentRelatedUsers.map((user) => (
                      <option key={user.id} value={user.id}>{user.name}{user.username ? ` · @${user.username}` : ""}</option>
                    ))}
                  </>}
                </select>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] text-slate-400">专项款</span>
                <select
                  value={relatedFundFilterId}
                  onChange={(event) => setRelatedFundFilterId(event.target.value)}
                  className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="all">全部专项款</option>
                  {trades.some((trade) => !trade.relatedFundId) && <option value="unclassified">未区分专项款（历史）</option>}
                  {availableRelatedFunds.map((fund) => (
                    <option key={fund.id} value={fund.id}>{fund.name}{!isMemberView && relatedUserFilterId === "all" ? ` · ${getRelatedFundOwnerName(fund)}` : ""}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

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
        </section>

        <section className="rounded bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div ref={ladderScrollRef} className="max-h-[calc(100vh-250px)] overflow-y-auto overscroll-contain">
            {priceRows.map((row) => (
              <div
                key={priceKey(row.price)}
                data-ladder-price={row.price}
                className={`grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] min-h-[52px] border-b border-slate-100 last:border-b-0 ${row.isMark ? (priceTrend === "up" ? "bg-rose-100/80" : priceTrend === "down" ? "bg-sky-100/80" : "bg-slate-100") : "bg-white"}`}
              >
                <LadderCell
                  bucket={row.long}
                  side="long"
                  markPrice={markPrice}
                  readOnly={isMemberView}
                  onClose={() => {
                    if (!row.long) return;
                    // 点已有仓位永远先进入本档订单详情，管理员可逐笔编辑或对单笔快捷平仓；
                    // 不因关联用户尚未标注而阻断查看。
                    openEntrySheet("openLong", row.long.price);
                  }}
                  // 空档位新建订单也保留当前十美元档位作为“查看范围”；
                  // 最终归档仍只按实际录入成交价计算，绝不按点击格写入。
                  onOpen={() => openEntrySheet("openLong", row.price)}
                />
                <div className={`border-x border-slate-100 flex items-center justify-center px-0.5 ${row.isMark ? (priceTrend === "up" ? "bg-rose-200 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.25)]" : priceTrend === "down" ? "bg-sky-200 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.25)]" : "bg-slate-200") : "bg-slate-50"}`}>
                  <span className={`text-[13px] tabular-nums font-bold ${row.isMark && priceTrend === "up" ? "text-rose-700" : row.isMark && priceTrend === "down" ? "text-sky-700" : "text-slate-900"}`}>
                    {formatLadderPrice(row.isMark && markPrice ? markPrice : row.price)}
                  </span>
                </div>
                <LadderCell
                  bucket={row.short}
                  side="short"
                  markPrice={markPrice}
                  readOnly={isMemberView}
                  onClose={() => {
                    if (!row.short) return;
                    // 同上：空仓格点击仅打开当前档订单详情，不强制先筛选关联用户。
                    openEntrySheet("openShort", row.short.price);
                  }}
                  // 同上：从空仓空档位开单时，详情只展示当前空仓价格档的订单。
                  onOpen={() => openEntrySheet("openShort", row.price)}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded bg-white border border-slate-200 shadow-sm overflow-hidden">
          <button onClick={() => setShowRecentRecords((value) => !value)} className="w-full px-4 py-3 flex items-center justify-between text-left">
            <div>
              <div className="text-sm font-semibold text-slate-900">最近速记</div>
              <div className="mt-0.5 text-[11px] text-slate-500">已保存的开平记录会同步影响上方价格簿</div>
            </div>
            <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showRecentRecords ? "rotate-90" : ""}`} />
          </button>
          {showRecentRecords && (
            <div className="border-t border-slate-100">
              <div className="grid grid-cols-3 gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-slate-400">下单账户</span>
                  <select
                    value={journalAccountFilterId}
                    onChange={(event) => setJournalAccountFilterId(event.target.value)}
                    className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
                  >
                    <option value="all">全部账户</option>
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-slate-400">关联用户</span>
                  <select
                    value={journalRelatedUserFilterId}
                    disabled={isMemberView}
                    onChange={(event) => {
                      setJournalRelatedUserFilterId(event.target.value);
                      setJournalRelatedFundFilterId("all");
                    }}
                    className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 disabled:cursor-default disabled:bg-slate-50"
                  >
                    {isMemberView ? <option value="all">{memberRelatedUserName}</option> : <>
                      <option value="all">全部用户</option>
                      {trades.some((trade) => !trade.relatedUserId) && <option value="unlinked">未关联用户</option>}
                      {recentRelatedUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </>}
                  </select>
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] text-slate-400">专项款</span>
                  <select
                    value={journalRelatedFundFilterId}
                    onChange={(event) => setJournalRelatedFundFilterId(event.target.value)}
                    className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500"
                  >
                    <option value="all">全部专项款</option>
                    {trades.some((trade) => !trade.relatedFundId) && <option value="unclassified">未区分专项</option>}
                    {journalAvailableRelatedFunds.map((fund) => (
                      <option key={fund.id} value={fund.id}>{fund.name}{!isMemberView && journalRelatedUserFilterId === "all" ? ` · ${getRelatedFundOwnerName(fund)}` : ""}</option>
                    ))}
                  </select>
                </label>
              </div>
              {recentJournalTrades.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-slate-500">当前筛选范围还没有速记记录</div>
              ) : [...recentJournalTrades].reverse().map((trade) => {
                const detail = recentJournalTradeDetails.get(trade.id);
                const isOpening = ACTIONS[trade.action].opening;
                const isLong = ACTIONS[trade.action].side === "long";
                return (
                  <div key={trade.id} className="px-4 py-2.5 border-b border-slate-100 last:border-b-0">
                    <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap text-xs tabular-nums">
                      <div className="flex min-w-0 items-baseline gap-x-1.5 overflow-hidden">
                        <span className={`shrink-0 font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[trade.action].label}</span>
                        <span className="shrink-0 font-medium text-slate-800">{formatQuantity(trade.quantity)} ETH</span>
                        {detail?.buyPrice !== undefined && <span className="shrink-0 text-slate-600">买{formatPrice(detail.buyPrice)}</span>}
                        {detail?.sellPrice !== undefined && <span className="shrink-0 text-slate-600">卖{formatPrice(detail.sellPrice)}</span>}
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
                          {formatSigned(detail.netPnl)}
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
                      <span className="shrink-0">{formatBeijingMonthDayTime(trade.createdAt)}</span>
                      {!isOpening && detail?.netPnl !== undefined && <>
                        <span className="text-slate-300">·</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-500">净利润</span>
                      </>}
                    </div>
                    {canManage && <div className="mt-1 flex min-h-5 items-center justify-between gap-3">
                      {trade.note ? <span className="min-w-0 truncate text-[11px] text-slate-500">{trade.note}</span> : <span />}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isOpening && <button
                          type="button"
                          disabled={Boolean(trade.isSyncing)}
                          onClick={() => openEditOpeningTrade(trade)}
                          className="h-5 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          编辑
                        </button>}
                        <button
                          type="button"
                          disabled={Boolean(trade.isSyncing) || revertEntryMutation.isPending}
                          onClick={() => setRevertCandidate(trade)}
                          className="h-5 rounded border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          回撤
                        </button>
                        {isOpening && <button
                          type="button"
                          disabled={Boolean(trade.isSyncing) || deleteOpeningEntryMutation.isPending}
                          onClick={() => setDeleteCandidate(trade)}
                          className="h-5 rounded border border-rose-200 bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          删除
                        </button>}
                      </div>
                    </div>}
                    {!canManage && trade.note && <div className="mt-1 truncate text-[11px] text-slate-500">{trade.note}</div>}
                  </div>
                );
              })}
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
          )}
        </section>

        {!isMemberView && (
          <section className="px-1 py-1">
            <div className="text-[11px] leading-5 text-slate-500">
              速记仅记录交易信息，不会触发交易所下单；下单账户与流水仅对当前管理员本人可见。
            </div>
          </section>
        )}
      </main>

      {showEntrySheet && (
        <div
          className={isMemberView ? "fixed inset-0 z-40 overflow-y-auto bg-slate-50" : "fixed inset-0 z-40 flex items-end bg-slate-950/35"}
          role="dialog"
          aria-modal="true"
          aria-label={isMemberView ? "仓位明细" : "速记一笔"}
        >
          <div className={isMemberView ? "min-h-full w-full bg-slate-50" : "w-full max-w-md mx-auto rounded-t bg-white shadow-2xl max-h-[92vh] overflow-y-auto"}>
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
                <h1 className="text-base font-semibold text-slate-900">仓位明细</h1>
              </header>
            ) : (
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 pb-2 pt-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-900">{isEditingEntry ? "编辑开仓记录" : isClosingEntry ? `${ACTIONS[entryForm.action].label}设置` : "速记一笔"}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">{isEditingEntry ? "可修改数量、成交价、关联用户、专项款与备注；修改会保留审计快照" : isClosingEntry ? "填写平仓数量与成交价后，需两次确认才会记账" : "本地先显示，后台立即保存；不会触发交易所下单"}</div>
                </div>
              </div>
            )}

            <div className="p-4 space-y-4">
              <div className={`overflow-hidden rounded border ${entrySide === "long" ? "border-rose-200 bg-rose-50/70" : "border-emerald-200 bg-emerald-50/70"}`}>
                <div className="flex items-center gap-1.5 px-3 py-2.5">
                  {!isMemberView && <button
                    type="button"
                    onClick={backToLadder}
                    aria-label="返回T型报价"
                    className="shrink-0 rounded p-0.5 text-slate-500 transition hover:bg-white/70 hover:text-slate-900 active:scale-90"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>}
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-left">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className={`text-base font-semibold ${entrySide === "long" ? "text-rose-600" : "text-emerald-600"}`}>{entryScopeTitle}</span>
                    <span className="text-base font-semibold tabular-nums text-slate-900">{formatQuantity(entrySideSummary.quantity)} ETH</span>
                  </div>
                  <span className="shrink-0 text-base font-medium tabular-nums text-slate-500">均价 {entrySideSummary.quantity > 0 ? formatPrice(entrySideSummary.average) : "--"}</span>
                </div>
                </div>
                <div className={`mx-3 flex items-center justify-between border-t pt-2 pb-2.5 text-[10px] tabular-nums ${entrySide === "long" ? "border-rose-200/80" : "border-emerald-200/80"}`}>
                  <span className={entrySideSummary.unrealized === null ? "text-slate-400" : entrySideSummary.unrealized >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    当前盈亏 {entrySideSummary.unrealized === null ? "--" : `${formatSigned(entrySideSummary.unrealized)} U`}
                  </span>
                  <span className="text-slate-500">已开 {openedTradeList.length} 笔</span>
                </div>
              </div>

              {isCloseReview && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <div className="text-xs font-semibold text-amber-800">第 2 次确认</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                    {ACTIONS[entryForm.action].label} {formatQuantity(Number(entryForm.quantity))} ETH @ {formatPrice(Number(entryForm.price))}
                  </div>
                  <div className="mt-1 text-[11px] text-amber-800/80">对应开仓价 {entryForm.targetPrice === undefined ? "--" : formatPrice(entryForm.targetPrice)}；确认后立即写入速记流水。</div>
                </div>
              )}

              <div className="space-y-1.5">
                  <div className="flex items-center justify-between px-0.5 text-[11px] text-slate-500">
                    <span>逐笔开仓记录</span>
                    <span className="tabular-nums">{openedTradeList.length} 笔</span>
                  </div>
                  {openedTradeList.length === 0 && (
                    <div className="rounded border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">当前方向没有已开订单</div>
                  )}
                  {openedTradeList.map((trade) => {
                    const linkedClosings = openingClosingAllocations.get(trade.id) ?? [];
                    const linkedClosedQuantity = linkedClosings.reduce((total, item) => total + item.quantity, 0);
                    const remainingQuantity = Math.max(0, trade.quantity - linkedClosedQuantity);
                    const floatingPnl = markPrice === null
                      ? null
                      : ACTIONS[trade.action].side === "long"
                        ? (markPrice - trade.price) * remainingQuantity
                        : (trade.price - markPrice) * remainingQuantity;
                    const openingValue = trade.quantity * trade.price;
                    const closeAction: TradeAction = ACTIONS[trade.action].side === "long" ? "closeLong" : "closeShort";
                    const canQuickClose = remainingQuantity > 0.0000001;
                    const isExpanded = expandedOpenedTradeIds.has(trade.id);
                    return (
                      <div key={trade.id} className="rounded border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedOpenedTradeIds((current) => {
                            const next = new Set(current);
                            if (next.has(trade.id)) next.delete(trade.id);
                            else next.add(trade.id);
                            return next;
                          })}
                          className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 text-left"
                        >
                          <div className="min-w-0">
                            <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
                              <span className={`text-base font-semibold ${ACTIONS[trade.action].side === "long" ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[trade.action].label}</span>
                              <span className="text-base font-semibold tabular-nums text-slate-900">{formatQuantity(trade.quantity)} ETH</span>
                              <span className="text-sm font-medium tabular-nums text-slate-500">@ {formatPrice(trade.price)}</span>
                            </span>
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium">
                              {!isMemberView && <>
                                <span title={getTradeAccountName(trade)} className="max-w-[32%] truncate text-slate-500">{getTradeAccountName(trade)}</span>
                                <span className="text-slate-300">·</span>
                              </>}
                              <span title={getTradeRelatedUserName(trade)} className="max-w-[34%] truncate text-slate-500">{getTradeRelatedUserName(trade)}</span>
                              <span className="text-slate-300">·</span>
                              <span title={getTradeRelatedFundName(trade)} className="max-w-[38%] truncate text-slate-500">{getTradeRelatedFundName(trade)}</span>
                            </div>
                          </div>
                          <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>
                        {isExpanded && (
                          <>
                            <div className="mt-2 grid grid-cols-3 gap-x-2 border-t border-slate-200 pt-2 tabular-nums">
                              <div className="min-w-0">
                                <div className="text-[10px] text-slate-400">开仓价值</div>
                                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-700">{formatPrice(openingValue)} U</div>
                              </div>
                              <div className="min-w-0 text-center">
                                <div className="text-[10px] text-slate-400">当前盈亏</div>
                                <div className={`mt-0.5 whitespace-nowrap text-[11px] font-semibold ${floatingPnl === null ? "text-slate-400" : floatingPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                  {floatingPnl === null ? "--" : `${formatSigned(floatingPnl)} U`}
                                </div>
                              </div>
                              <div className="min-w-0 text-right">
                                <div className="text-[10px] text-slate-400">开仓时间</div>
                                <div className="mt-0.5 whitespace-nowrap text-[11px] font-medium text-slate-700">{trade.isSyncing ? "后台保存中" : formatBeijingMonthDayTime(trade.createdAt)}</div>
                              </div>
                              <div className="col-span-3 grid grid-cols-3 gap-x-2 border-t border-slate-200 pt-2">
                                <div className="min-w-0">
                                  <div className="text-[10px] text-slate-400">下单账户</div>
                                  <div title={getTradeAccountName(trade)} className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{getTradeAccountName(trade)}</div>
                                </div>
                                <div className="min-w-0 text-center">
                                  <div className="text-[10px] text-slate-400">关联用户</div>
                                  <div title={getTradeRelatedUserName(trade)} className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{getTradeRelatedUserName(trade)}</div>
                                </div>
                                <div className="min-w-0 text-right">
                                  <div className="text-[10px] text-slate-400">专项款</div>
                                  <div title={getTradeRelatedFundName(trade)} className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{getTradeRelatedFundName(trade)}</div>
                                </div>
                              </div>
                            </div>
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
                            {canManage && <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                              <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isCloseReview || Boolean(trade.isSyncing)}
                                    onClick={() => openEditOpeningTrade(trade)}
                                    className="h-8 rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isCloseReview || Boolean(trade.isSyncing)}
                                    onClick={() => setDeleteCandidate(trade)}
                                    className="h-8 rounded border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    删除
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  disabled={isCloseReview || !canQuickClose}
                                  onClick={() => openQuickCloseSheet(trade)}
                                  className={`h-8 rounded border px-3 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${ACTIONS[closeAction].idleClass}`}
                                >
                                  {ACTIONS[closeAction].label}
                                </button>
                              </div>}
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>

              {canManage && <>
              <div className="grid grid-cols-1 gap-3">
                <div className="grid grid-cols-2 gap-3 items-start">
                  <Field label={<span className="text-sm font-semibold text-slate-800">数量（ETH）</span>}>
                    <input
                      inputMode="decimal"
                      maxLength={7}
                      disabled={isCloseReview}
                      aria-invalid={Boolean(quantityFormatError)}
                      value={entryForm.quantity}
                      onChange={(event) => setEntryForm((current) => ({ ...current, quantity: event.target.value }))}
                      onBlur={() => setEntryForm((current) => ({ ...current, quantity: normalizeEthQuantity(current.quantity) }))}
                      placeholder="0.00"
                      className={`w-full h-14 rounded border px-3 text-xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 ${quantityFormatError ? "border-rose-400 bg-rose-50 focus:border-rose-500" : "border-slate-200 focus:border-indigo-500"}`}
                    />
                    <div className={`mt-1.5 text-[10px] leading-4 ${quantityFormatError ? "font-medium text-rose-600" : "text-slate-400"}`}>
                      {quantityFormatError || "整数最多4位 · 离开后固定显示2位小数"}
                    </div>
                  </Field>

                  <Field label={
                    <span className="inline-flex max-w-full items-baseline gap-1 text-sm font-semibold text-slate-800">
                      <span>{ACTIONS[entryForm.action].opening ? "成交价" : "平仓价"}</span>
                      <span className="truncate text-[9px] font-normal tabular-nums text-slate-400">手续费 {OKX_VIP2_TAKER_FEE_LABEL} · {estimatedFeeUsdt === null ? "--" : `${formatFee(estimatedFeeUsdt)} U`}</span>
                    </span>
                  }>
                    <input
                      inputMode="decimal"
                      disabled={isCloseReview}
                      value={entryForm.price}
                      onChange={(event) => setEntryForm((current) => ({ ...current, price: event.target.value }))}
                      placeholder="0.00"
                      className="w-full h-14 rounded border border-slate-200 px-3 text-xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                    />
                    {openingArchivePrice !== null && (
                      <div className={`mt-1.5 text-[10px] tabular-nums ${ACTIONS[entryForm.action].side === "long" ? "text-rose-600" : "text-emerald-600"}`}>
                        {ACTIONS[entryForm.action].side === "long" ? "向上归档" : "向下归档"}至 {formatPrice(openingArchivePrice)} 档
                      </div>
                    )}
                  </Field>
                </div>

                <div className="-mt-1 flex flex-wrap items-center gap-1.5">
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
                </div>

                <div className="grid grid-cols-2 items-start gap-3">
                  <Field label={<span>下单账户 <span className="text-rose-500">*</span></span>}>
                    {accounts.length > 0 ? (
                      <select
                        disabled={isCloseReview || isEditingEntry}
                        value={entryForm.accountId}
                        onChange={(event) => selectOrderAccount(event.target.value)}
                        className="h-11 w-full rounded border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500"
                      >
                        <option value="">新建账户</option>
                        {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                      </select>
                    ) : null}
                    {!entryForm.accountId && (
                      <input
                        disabled={isCloseReview || isEditingEntry}
                        value={entryForm.accountName}
                        onChange={(event) => setEntryForm((current) => ({ ...current, accountName: event.target.value }))}
                        placeholder="新账户名称"
                        className="mt-2 h-11 w-full rounded border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                      />
                    )}
                  </Field>

                  <Field label={<span>关联用户 <span className="text-slate-400">（可选）</span></span>}>
                    <button
                      type="button"
                      disabled={isCloseReview}
                      onClick={() => {
                        setRelatedUserPickerOpen((current) => !current);
                        setRelatedUserSearch("");
                      }}
                      className={`flex h-11 w-full items-center gap-2 rounded border px-3 text-left text-sm outline-none transition disabled:opacity-40 ${entryForm.relatedUserId ? "border-indigo-200 bg-indigo-50/60 text-slate-800" : "border-slate-200 bg-white text-slate-400"}`}
                    >
                      <UserRound className="h-4 w-4 shrink-0 text-indigo-500" />
                      <span className="min-w-0 flex-1 truncate font-medium">{entryForm.relatedUserName || entryForm.relatedUsername || "暂不关联"}</span>
                      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    </button>
                  </Field>
                </div>

                <div className="-mt-1 grid grid-cols-2 gap-3 text-[10px] leading-4 text-slate-400">
                  <span>首次可新建；后续按关联用户记忆账户。</span>
                  <span>可暂不关联；关联后按专项款区分资金。</span>
                </div>

                <Field label={<span>专项款 {entryForm.relatedUserId && <span className="text-rose-500">*</span>} {!entryForm.relatedUserId && <span className="text-slate-400">（请先选关联用户）</span>}</span>}>
                  <select
                    disabled={!entryForm.relatedUserId || isCloseReview || isClosingEntry}
                    value={entryForm.relatedFundId}
                    onChange={(event) => selectRelatedFund(event.target.value)}
                    className="h-11 w-full rounded border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">新建专项款</option>
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

                {relatedUserPickerOpen && (
                  <div className="overflow-hidden rounded border border-indigo-100 bg-white shadow-sm">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <Search className="h-4 w-4 shrink-0 text-slate-400" />
                      <input
                        autoFocus
                        value={relatedUserSearch}
                        onChange={(event) => setRelatedUserSearch(event.target.value)}
                        placeholder="用户名或昵称模糊搜索"
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
                    <button
                      type="button"
                      onClick={clearRelatedUser}
                      className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left text-xs font-medium text-slate-600 active:bg-slate-50"
                    >
                      <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                      <span>暂不关联，稍后补充</span>
                    </button>
                    {relatedUserSearch.trim().length === 0 ? (
                      recentRelatedUsers.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto py-1">
                          <div className="px-3 py-1.5 text-[10px] font-medium text-slate-400">最近选择</div>
                          {recentRelatedUsers.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => selectRelatedUser(user)}
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-indigo-50"
                            >
                              <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{user.name}</span>
                              {user.username && <span className="max-w-[42%] truncate text-xs text-slate-400">@{user.username}</span>}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-4 text-center text-xs text-slate-400">输入用户名或昵称，搜索全局用户</div>
                      )
                    ) : relatedUserSearchQuery.isFetching ? (
                      <div className="px-3 py-4 text-center text-xs text-slate-400">正在搜索用户…</div>
                    ) : Array.isArray(relatedUserSearchQuery.data) && relatedUserSearchQuery.data.length > 0 ? (
                      <div className="max-h-56 overflow-y-auto py-1">
                        {(relatedUserSearchQuery.data as any[]).map((candidate) => {
                          const user: PreviewRelatedUser = {
                            id: String(candidate.id),
                            name: String(candidate.name || candidate.username || `用户#${candidate.id}`),
                            username: candidate.username ? String(candidate.username) : undefined,
                            avatar: candidate.avatar ? String(candidate.avatar) : undefined,
                          };
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => selectRelatedUser(user)}
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-indigo-50"
                            >
                              <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{user.name}</span>
                              {user.username && <span className="max-w-[42%] truncate text-xs text-slate-400">@{user.username}</span>}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-3 py-4 text-center text-xs text-slate-400">未找到匹配用户</div>
                    )}
                  </div>
                )}
              </div>
              </>}

            </div>
            {canManage && <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              {isCloseReview ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCloseConfirmationStep("input")}
                    className="h-12 rounded border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:scale-[0.99]"
                  >
                    返回修改
                  </button>
                  <button
                    disabled={saveEntryMutation.isPending}
                    onClick={handleSaveEntry}
                    className="h-12 rounded bg-amber-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40 active:scale-[0.99]"
                  >
                    再次确认并记账
                  </button>
                </div>
              ) : (
                <button
                  disabled={isEditingEntry ? updateOpeningEntryMutation.isPending : saveEntryMutation.isPending || (isClosingEntry && entryForm.targetPrice === undefined)}
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

  return (
    <div className="border-t border-slate-200/80 bg-slate-50/80 p-2.5">
      <div className="overflow-hidden rounded border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <span className="text-[11px] text-slate-500">持仓详情</span>
          <button
            type="button"
            onClick={onToggleCumulativeData}
            aria-label={showCumulativeData ? "收起持仓与累计数据" : "展开持仓与累计数据"}
            aria-expanded={showCumulativeData}
            className="flex h-4 w-4 items-center justify-center text-slate-400 transition-colors active:text-slate-700"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${showCumulativeData ? "rotate-90" : ""}`} />
          </button>
        </div>
        <div className="grid grid-cols-2">
          {sides.map(({ side, data }) => {
            const isLong = side === "long";
            return (
              <div
                key={side}
                className={`min-w-0 px-3 py-3 text-left ${isLong ? "border-r border-slate-100" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className={`shrink-0 text-xs font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{isLong ? "多仓" : "空仓"}</span>
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

        {showCumulativeData && (
          <div className="grid grid-cols-2 border-t border-slate-100 text-[11px] tabular-nums">
            {sides.map(({ side, data }) => {
              const isLong = side === "long";
              const labelTone = isLong ? "text-rose-600 bg-rose-50/50" : "text-emerald-600 bg-emerald-50/50";
              const profitTone = data.realizedGross >= 0 ? "text-rose-600 border-rose-500" : "text-emerald-600 border-emerald-500";
              return (
                <section key={side} className={`min-w-0 ${isLong ? "border-r border-slate-100" : ""}`}>
                  <div className={`px-3 py-2 text-[11px] font-semibold ${labelTone}`}>{isLong ? "多仓详情" : "空仓详情"}</div>
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
      </div>
    </div>
  );
}

function PositionCell({ bucket, side, markPrice, onClick }: { bucket?: PositionBucket; side: PositionSide; markPrice: number | null; onClick: () => void }) {
  const isLong = side === "long";
  if (!bucket || bucket.remainingQuantity <= 0.0000001) {
    return <div className="px-3 flex items-center text-xs text-slate-300">—</div>;
  }

  const tone = isLong
    ? "bg-rose-50/75 text-rose-800 hover:bg-rose-100"
    : "bg-emerald-50/75 text-emerald-800 hover:bg-emerald-100";
  const averageCost = bucket.remainingQuantity > 0 ? bucket.costBasis / bucket.remainingQuantity : 0;
  const floatingPnl = markPrice === null
    ? null
    : isLong
      ? (markPrice - averageCost) * bucket.remainingQuantity
      : (averageCost - markPrice) * bucket.remainingQuantity;
  // 与金额盈亏保持同一口径：逐档未实现盈亏 ÷ 本档剩余持仓成本，不含尚未实际支付的资金费。
  const floatingReturnRate = floatingPnl === null || bucket.costBasis <= 0
    ? null
    : floatingPnl / bucket.costBasis;
  const pnlTone = floatingPnl !== null && floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600";

  return (
    <button onClick={onClick} className={`min-h-[52px] w-full min-w-0 px-1.5 py-1.5 text-left transition-colors active:brightness-95 ${tone}`}>
      <div className="flex w-full min-w-0 items-center justify-between gap-2 tabular-nums">
        <span className="shrink-0 text-lg font-bold leading-none tracking-tight">{formatQuantity(bucket.remainingQuantity)}</span>
        {floatingPnl !== null && (
          <span className={`flex shrink-0 flex-col items-end text-right ${pnlTone}`}>
            <span className="whitespace-nowrap text-[11px] font-semibold leading-none">{formatSigned(floatingPnl)}</span>
            {floatingReturnRate !== null && (
              <span className="mt-1 text-[10px] font-medium leading-none opacity-85">{formatSignedPercent(floatingReturnRate)}</span>
            )}
          </span>
        )}
      </div>
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
}: {
  bucket?: PositionBucket;
  side: PositionSide;
  markPrice: number | null;
  onClose: () => void;
  onOpen: () => void;
  readOnly?: boolean;
}) {
  if (bucket && bucket.remainingQuantity > 0.0000001) {
    return <PositionCell bucket={bucket} side={side} markPrice={markPrice} onClick={onClose} />;
  }

  const isLong = side === "long";
  if (readOnly) {
    return <div className={`min-h-[52px] w-full ${isLong ? "bg-rose-50/45" : "bg-emerald-50/45"}`} />;
  }
  return (
    <button
      onClick={onOpen}
      aria-label={isLong ? "在该价格档位开多" : "在该价格档位开空"}
      className={`min-h-[52px] w-full transition-colors active:brightness-95 ${isLong ? "bg-rose-50/45 hover:bg-rose-100/80" : "bg-emerald-50/45 hover:bg-emerald-100/80"}`}
    />
  );
}

/** 独立路由继续使用无参数组件，避免影响 wouter 的路由组件签名。 */
export default function T0Journal() {
  return <T0JournalView />;
}
