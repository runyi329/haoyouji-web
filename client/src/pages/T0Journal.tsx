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

/** 按单张开仓主单的实际分配数量计算关联平仓的净利润，避免跨主单平仓时重复展示总利润。 */
function buildLinkedClosingDetail(opening: PreviewTrade, allocation: LinkedClosingAllocation): RecentJournalTradeDetail {
  const { trade: closing, quantity } = allocation;
  const side = ACTIONS[opening.action].side;
  const allocatedOpeningFee = opening.quantity > 0 ? opening.fee * (quantity / opening.quantity) : 0;
  const closingFee = closing.quantity > 0 ? closing.fee * (quantity / closing.quantity) : 0;
  const grossPnl = side === "long"
    ? (closing.price - opening.price) * quantity
    : (opening.price - closing.price) * quantity;
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
 * 按顶部“总利润”完全一致的归属档位 FIFO 口径，逐笔还原每条平仓流水的毛收益。
 * 该函数不计入任何手续费或资金费，所有明细相加应与总利润一致。
 */
function buildRealizedGrossProfitDetails(trades: PreviewTrade[]) {
  const positions = new Map<string, { quantity: number; costBasis: number }>();
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
      if (current) {
        current.quantity += trade.quantity;
        current.costBasis += trade.quantity * trade.price;
      } else {
        positions.set(key, { quantity: trade.quantity, costBasis: trade.quantity * trade.price });
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
    const grossPnl = side === "long"
      ? (trade.price - openingAverage) * quantity
      : (openingAverage - trade.price) * quantity;
    target.quantity -= quantity;
    target.costBasis = Math.max(0, target.costBasis - openingAverage * quantity);
    positions.set(key, target);
    details.push({
      trade,
      quantity,
      grossPnl,
    });
  }

  return details.sort((a, b) => b.trade.createdAt.localeCompare(a.trade.createdAt) || b.trade.id.localeCompare(a.trade.id));
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
  const calculateSide = (side: PositionSide) => {
    const active = buckets.filter((bucket) => bucket.side === side && bucket.remainingQuantity > 0.0000001);
    const all = buckets.filter((bucket) => bucket.side === side);
    const sideTrades = trades.filter((trade) => ACTIONS[trade.action].side === side);
    const quantity = active.reduce((total, bucket) => total + bucket.remainingQuantity, 0);
    const weightedCost = active.reduce((total, bucket) => total + bucket.costBasis, 0);
    const average = quantity > 0 ? weightedCost / quantity : 0;
    const unrealized = calculateEstimatedUnrealizedNetPnl(side, markPrice, quantity, weightedCost);
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
  const [journalActionFilters, setJournalActionFilters] = useState<Set<TradeAction>>(
    () => new Set(RECENT_JOURNAL_ACTIONS),
  );
  const [showLinkedJournalGroups, setShowLinkedJournalGroups] = useState(false);
  const [recentJournalPage, setRecentJournalPage] = useState(1);
  const [lastRelatedUserId, setLastRelatedUserId] = useState("");
  const [lastAccountIdByRelatedUser, setLastAccountIdByRelatedUser] = useState<Record<string, string>>({});
  const [lastFundIdByRelatedUser, setLastFundIdByRelatedUser] = useState<Record<string, string>>({});
  const [relatedUserPickerOpen, setRelatedUserPickerOpen] = useState(false);
  const [relatedUserSearch, setRelatedUserSearch] = useState("");
  const [showEntrySheet, setShowEntrySheet] = useState(false);
  const [closeConfirmationStep, setCloseConfirmationStep] = useState<"input" | "review">("input");
  const [expandedOpenedTradeIds, setExpandedOpenedTradeIds] = useState<Set<string>>(() => new Set());
  const [showSettledOpeningHistory, setShowSettledOpeningHistory] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<PreviewTrade | null>(null);
  const [revertCandidate, setRevertCandidate] = useState<PreviewTrade | null>(null);
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
  const [lastSavedQuantity, setLastSavedQuantity] = useState("");
  const [showCumulativeData, setShowCumulativeData] = useState(false);
  const [lastMarkPrice, setLastMarkPrice] = useState<number | null>(null);
  const [previousMarkPrice, setPreviousMarkPrice] = useState<number | null>(null);
  const [liveClock, setLiveClock] = useState(() => new Date());
  const previousFetchedMarkPriceRef = useRef<number | null>(null);
  const hasInitializedJournalFiltersRef = useRef(false);
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
    // 首次进入时，管理员默认“全部账户 + 全部用户 + 全部专项款”；
    // 后续静默同步只校验当前选择仍然有效，不能每五秒覆盖正在查看的筛选。
    const isFirstJournalHydration = !hasInitializedJournalFiltersRef.current;
    if (journal.viewerMode === "admin") {
      setSelectedAccountId((current) => isFirstJournalHydration || (current !== "all" && !nextAccounts.some((account) => account.id === current)) ? "all" : current);
      setRelatedUserFilterId((current) => isFirstJournalHydration || (current !== "all" && current !== "unlinked" && !nextRecentRelatedUsers.some((user) => user.id === current)) ? "all" : current);
      setRelatedFundFilterId((current) => isFirstJournalHydration || (current !== "all" && current !== "unclassified" && !nextRelatedFunds.some((fund) => fund.id === current)) ? "all" : current);
    } else {
      // 成员端：一个选项直接锁定；两个及以上选项才保留“全部 + 分项”的筛选。
      // 后续五秒静默同步只修正已失效的选项，不会覆盖成员主动选择的单项筛选。
      const memberFundFilterIds = [
        ...nextRelatedFunds.map((fund) => fund.id),
        ...(nextTrades.some((trade) => !trade.relatedFundId) ? ["unclassified"] : []),
      ];
      const normalizeMemberFilter = (current: string, optionIds: string[]) => {
        if (optionIds.length === 1) return optionIds[0];
        return isFirstJournalHydration || (current !== "all" && !optionIds.includes(current))
          ? "all"
          : current;
      };
      setSelectedAccountId((current) => normalizeMemberFilter(current, nextAccounts.map((account) => account.id)));
      setRelatedUserFilterId("all");
      setRelatedFundFilterId((current) => normalizeMemberFilter(current, memberFundFilterIds));
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
  const journalScopeTrades = useMemo(
    () => trades.filter((trade) => (
      trade.symbol === "ETH"
      && (selectedAccountId === "all" || trade.accountId === selectedAccountId)
      && (relatedUserFilterId === "all"
        || (relatedUserFilterId === "unlinked" ? !trade.relatedUserId : trade.relatedUserId === relatedUserFilterId))
      && (relatedFundFilterId === "all"
        || (relatedFundFilterId === "unclassified" ? !trade.relatedFundId : trade.relatedFundId === relatedFundFilterId))
    )),
    [trades, selectedAccountId, relatedUserFilterId, relatedFundFilterId],
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
  const memberFundFilterOptionIds = useMemo(() => [
    ...relatedFunds.map((fund) => fund.id),
    ...(trades.some((trade) => !trade.relatedFundId) ? ["unclassified"] : []),
  ], [relatedFunds, trades]);
  const shouldLockMemberAccountFilter = isMemberView && accounts.length === 1;
  const shouldLockMemberFundFilter = isMemberView && memberFundFilterOptionIds.length === 1;
  const lockedAccountName = accounts.find((account) => account.id === selectedAccountId)?.name
    || accounts[0]?.name
    || "暂无账户";
  const lockedRelatedFundName = availableRelatedFunds.find((fund) => fund.id === relatedFundFilterId)?.name
    || availableRelatedFunds[0]?.name
    || (trades.some((trade) => !trade.relatedFundId) ? "未区分项目（历史）" : "暂无项目");
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
  const totalGrossProfitDetails = useMemo(
    () => buildRealizedGrossProfitDetails(selectedTrades),
    [selectedTrades],
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
  const netPositionQuantity = summary.long.quantity - summary.short.quantity;
  const totalGrossProfitClass = totalGrossProfit > 0 ? "text-rose-600" : totalGrossProfit < 0 ? "text-emerald-600" : "text-slate-700";
  const netPositionClass = "text-slate-800";
  const roundedNetPositionText = (() => {
    const rounded = Math.round(netPositionQuantity);
    return `${rounded < 0 ? "−" : ""}${Math.abs(rounded).toLocaleString("en-US")}`;
  })();
  const netPositionBreakdown = useMemo(() => {
    const buildSide = (side: PositionSide) => {
      const levels = buckets
        .filter((bucket) => bucket.side === side && bucket.remainingQuantity > 0.0000001)
        .sort((a, b) => b.price - a.price);
      return {
        levels,
        quantity: levels.reduce((total, bucket) => total + bucket.remainingQuantity, 0),
      };
    };
    return { long: buildSide("long"), short: buildSide("short") };
  }, [buckets]);
  const netPositionDetailText = `${netPositionQuantity < 0 ? "−" : ""}${formatQuantity(Math.abs(netPositionQuantity))}`;
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
  const openingClosingAllocations = useMemo(
    () => buildOpeningClosingAllocations(entryScopedTrades),
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
        const grossPnl = isLongPosition
          ? (closingTrade.price - openingTrade.price) * quantity
          : (openingTrade.price - closingTrade.price) * quantity;
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
            <span className="shrink-0 font-medium text-slate-800">{formatQuantity(closing.quantity)} ETH</span>
            {detail?.buyPrice !== undefined && <span className="shrink-0 text-slate-600">买{formatPrice(detail.buyPrice)}</span>}
            {detail?.sellPrice !== undefined && <span className="shrink-0 text-slate-600">卖{formatPrice(detail.sellPrice)}</span>}
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
          </div>
          {canManage && <div className="mt-1 flex min-h-5 items-center justify-between gap-3">
            {closing.note ? <span className="min-w-0 truncate text-[11px] text-slate-500">{closing.note}</span> : <span />}
            <button
              type="button"
              disabled={Boolean(closing.isSyncing) || revertEntryMutation.isPending}
              onClick={() => setRevertCandidate(closing)}
              className="h-5 shrink-0 rounded border border-amber-200 bg-white px-1.5 text-[10px] font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              回撤
            </button>
          </div>}
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
              <span className="shrink-0 font-medium text-slate-800">{formatQuantity(opening.quantity)} ETH</span>
              <span className="shrink-0 text-slate-600">{isLong ? "买" : "卖"}{formatPrice(opening.price)}</span>
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
            <span className="shrink-0">{formatBeijingMonthDayTime(opening.createdAt)}</span>
          </div>
          {canManage && <div className="mt-1 flex min-h-5 items-center justify-between gap-3">
            {opening.note ? <span className="min-w-0 truncate text-[11px] text-slate-500">{opening.note}</span> : <span />}
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={Boolean(opening.isSyncing)}
                onClick={() => openEditOpeningTrade(opening)}
                className="h-5 rounded border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                编辑
              </button>
              <button
                type="button"
                disabled={Boolean(opening.isSyncing) || revertEntryMutation.isPending}
                onClick={() => setRevertCandidate(opening)}
                className="h-5 rounded border border-amber-200 bg-white px-1.5 text-[10px] font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                回撤
              </button>
              <button
                type="button"
                disabled={Boolean(opening.isSyncing) || deleteOpeningEntryMutation.isPending}
                onClick={() => setDeleteCandidate(opening)}
                className="h-5 rounded border border-rose-200 bg-white px-1.5 text-[10px] font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                删除
              </button>
            </div>
          </div>}
          {!canManage && opening.note && <div className="mt-1 truncate text-[11px] text-slate-500">{opening.note}</div>}
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
                  <span className="shrink-0 font-medium text-slate-800">{formatQuantity(allocation.quantity)} ETH</span>
                  <span className="shrink-0 text-slate-600">{isLong ? "卖" : "买"}{formatPrice(closing.price)}</span>
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
                <span className="ml-auto shrink-0 text-[10px] text-slate-500">净利润</span>
              </div>
              {canManage && <div className="mt-1 flex min-h-5 items-center justify-between gap-3">
                {closing.note ? <span className="min-w-0 truncate text-[11px] text-slate-500">{closing.note}</span> : <span />}
                <button
                  type="button"
                  disabled={Boolean(closing.isSyncing) || revertEntryMutation.isPending}
                  onClick={() => setRevertCandidate(closing)}
                  className="h-5 shrink-0 rounded border border-amber-200 bg-white px-1.5 text-[10px] font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  回撤
                </button>
              </div>}
              {!canManage && closing.note && <div className="mt-1 truncate text-[11px] text-slate-500">{closing.note}</div>}
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
          className="relative overflow-hidden rounded"
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
            className="relative z-[1] border-b px-3 py-2.5"
            style={{
              background: "rgba(255,255,255,0.34)",
              borderColor: "rgba(109,121,137,0.22)",
              boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.62)",
            }}
          >
            <div className="grid grid-cols-[minmax(62px,0.8fr)_minmax(74px,0.95fr)_minmax(112px,1.5fr)] gap-1.5">
              <label className="relative min-w-0">
                {!shouldLockMemberAccountFilter && <span className="pointer-events-none absolute left-1.5 top-1/2 z-10 -translate-y-1/2 text-[11px] font-semibold tracking-wide text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>账户</span>}
                {shouldLockMemberAccountFilter ? <LockedFilterValue label="账户" value={lockedAccountName} /> : (
                  <select
                    value={selectedAccountId}
                    onChange={(event) => {
                      setSelectedAccountId(event.target.value);
                      setRecentJournalPage(1);
                    }}
                    className="h-9 w-full rounded border border-slate-300 bg-white/70 pl-8 pr-4 text-[12px] font-medium text-slate-700 outline-none focus:border-[#1a56db]"
                    style={{
                      textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)",
                      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.96), inset 0 -1px 0 rgba(100,116,139,0.20)",
                    }}
                  >
                    <option value="all">全部账户</option>
                    {accounts.length === 0 && <option value="">暂无账户</option>}
                    {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                )}
              </label>
              <label className="relative min-w-0">
                {!isMemberView && <span className="pointer-events-none absolute left-1.5 top-1/2 z-10 -translate-y-1/2 text-[11px] font-semibold tracking-wide text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>用户</span>}
                {isMemberView ? <LockedFilterValue label="用户" value={memberRelatedUserName} /> : (
                  <select
                    value={relatedUserFilterId}
                    onChange={(event) => {
                      setRelatedUserFilterId(event.target.value);
                      setRelatedFundFilterId("all");
                      setRecentJournalPage(1);
                    }}
                    className="h-9 w-full rounded border border-slate-300 bg-white/70 pl-8 pr-4 text-[12px] font-medium text-slate-700 outline-none focus:border-[#1a56db]"
                    style={{
                      textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)",
                      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.96), inset 0 -1px 0 rgba(100,116,139,0.20)",
                    }}
                  >
                    <option value="all">全部用户</option>
                    {trades.some((trade) => !trade.relatedUserId) && <option value="unlinked">未关联用户（历史）</option>}
                    {recentRelatedUsers.map((user) => (
                      <option key={user.id} value={user.id}>{user.name}{user.username ? ` · @${user.username}` : ""}</option>
                    ))}
                  </select>
                )}
              </label>
              <label className="relative min-w-0">
                {!shouldLockMemberFundFilter && <span className="pointer-events-none absolute left-1.5 top-1/2 z-10 -translate-y-1/2 text-[11px] font-semibold tracking-wide text-slate-500" style={{ textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" }}>项目</span>}
                {shouldLockMemberFundFilter ? <LockedFilterValue label="项目" value={lockedRelatedFundName} /> : (
                  <select
                    value={relatedFundFilterId}
                    onChange={(event) => {
                      setRelatedFundFilterId(event.target.value);
                      setRecentJournalPage(1);
                    }}
                    className="h-9 w-full rounded border border-slate-300 bg-white/70 pl-8 pr-4 text-[12px] font-medium text-slate-700 outline-none focus:border-[#1a56db]"
                    style={{
                      textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.86), 0.6px 0.6px 0 rgba(71,85,105,0.20)",
                      boxShadow: "inset 0 1px 1px rgba(255,255,255,0.96), inset 0 -1px 0 rgba(100,116,139,0.20)",
                    }}
                  >
                    <option value="all">全部项目</option>
                    {trades.some((trade) => !trade.relatedFundId) && <option value="unclassified">未区分项目（历史）</option>}
                    {availableRelatedFunds.map((fund) => (
                      <option key={fund.id} value={fund.id}>{fund.name}{!isMemberView && relatedUserFilterId === "all" ? ` · ${getRelatedFundOwnerName(fund)}` : ""}</option>
                    ))}
                  </select>
                )}
              </label>
            </div>
          </div>

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
          className="overflow-hidden rounded border border-[#b9c2ca] bg-[#eef1f3]"
          style={{
            background: "linear-gradient(145deg, rgba(249,250,251,0.96), rgba(218,224,229,0.88))",
            boxShadow: "0 5px 12px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(71,85,105,0.20)",
          }}
        >
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
            ref={ladderScrollRef}
            className="max-h-[calc(100vh-250px)] overflow-y-auto overscroll-contain"
            style={{
              background: [
                "linear-gradient(135deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.18) 24%, rgba(255,255,255,0) 48%, rgba(0,0,0,0) 64%, rgba(71,85,105,0.08) 100%)",
                "linear-gradient(180deg, rgba(71,85,105,0.04) 0%, rgba(255,255,255,0.18) 42%, rgba(255,255,255,0.12) 62%, rgba(71,85,105,0.05) 100%)",
                "linear-gradient(160deg, #eef1f3 0%, #e3e8ec 44%, #f1f3f5 100%)",
              ].join(", "),
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.86), inset 0 -1px 0 rgba(71,85,105,0.10)",
            }}
          >
            {priceRows.map((row) => (
              <div
                key={priceKey(row.price)}
                data-ladder-price={row.price}
                className="grid grid-cols-[minmax(0,1fr)_64px_minmax(0,1fr)] min-h-[52px] border-b border-[#c7d0d7]/60 last:border-b-0"
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
                </div>
              </div>
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
              {!isMemberView && <div className="flex h-7 items-center">
                <button
                  type="button"
                  onClick={backToLadder}
                  aria-label="返回T型报价"
                  className="-ml-1 inline-flex h-7 items-center gap-1 rounded px-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>返回报价</span>
                </button>
              </div>}
              <div className={`overflow-hidden rounded border ${entrySide === "long" ? "border-rose-200 bg-rose-50/70" : "border-emerald-200 bg-emerald-50/70"}`}>
                <div className="px-3 py-2.5">
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 text-left">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className={`text-base font-semibold ${entrySide === "long" ? "text-rose-600" : "text-emerald-600"}`}>{entryScopeTitle}</span>
                    <span className="text-base font-semibold tabular-nums text-slate-900">{formatQuantity(entrySideSummary.quantity)} ETH</span>
                  </div>
                  <span className="shrink-0 text-base font-medium tabular-nums text-slate-500">均价 {entrySideSummary.quantity > 0 ? formatPrice(entrySideSummary.average) : "--"}</span>
                </div>
                </div>
                <div className={`mx-3 flex items-center justify-between border-t pt-2 pb-2.5 text-[10px] tabular-nums ${entrySide === "long" ? "border-rose-200/80" : "border-emerald-200/80"}`}>
                  <span className={entrySideSummary.unrealized === null ? "text-slate-400" : entrySideSummary.unrealized >= 0 ? "text-rose-600" : "text-emerald-600"}>
                    当前盈亏 {entrySideSummary.unrealized === null ? "--" : `${formatSigned(entrySideSummary.unrealized)} U`}
                  </span>
                  <span className="text-slate-500">当前 {activeOpenedTradeList.length} 笔</span>
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
                    <span>当前未平仓主单</span>
                    <span className="tabular-nums">{activeOpenedTradeList.length} 笔 · {formatQuantity(entrySideSummary.quantity)} ETH</span>
                  </div>
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
                    const floatingPnl = calculateEstimatedUnrealizedNetPnl(
                      ACTIONS[trade.action].side,
                      markPrice,
                      remainingQuantity,
                      trade.price * remainingQuantity,
                    );
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
                              <span className="text-sm font-medium text-slate-700">{ACTIONS[trade.action].label}</span>
                              <span className="text-sm font-medium tabular-nums text-slate-700">{formatQuantity(trade.quantity)} ETH</span>
                              <span className="text-sm font-medium tabular-nums text-slate-700">@ {formatPrice(trade.price)}</span>
                              <span className="shrink-0 text-sm font-medium tabular-nums text-slate-700">
                                {floatingPnl === null ? "--" : `${formatSigned(floatingPnl)} U`}
                              </span>
                            </span>
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium">
                              {linkedClosedQuantity > 0.0000001 && <>
                                <span className="shrink-0 tabular-nums text-slate-600">已平 {formatQuantity(linkedClosedQuantity)} · 剩 {formatQuantity(remainingQuantity)} ETH</span>
                                <span className="text-slate-300">·</span>
                              </>}
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
                                <div className={`mt-0.5 whitespace-nowrap text-[11px] font-semibold ${floatingPnl === null ? "text-slate-400" : floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                  {floatingPnl === null ? "--" : `${formatSigned(floatingPnl)} U`}
                                </div>
                              </div>
                              <div className="min-w-0 text-right">
                                <div className="text-[10px] text-slate-400">开仓时间</div>
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
      className="flex h-9 w-full items-center gap-2 truncate rounded border border-slate-300 bg-white/60 px-2 text-[12px] font-medium text-slate-700"
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

function PositionCell({ bucket, side, markPrice, onClick, readOnly = false }: { bucket?: PositionBucket; side: PositionSide; markPrice: number | null; onClick: () => void; readOnly?: boolean }) {
  const isLong = side === "long";
  if (!bucket || bucket.remainingQuantity <= 0.0000001) {
    return <div className="px-3 flex items-center text-xs text-slate-300">—</div>;
  }
  const tone = isLong
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
  const floatingPnl = calculateEstimatedUnrealizedNetPnl(side, markPrice, bucket.remainingQuantity, bucket.costBasis);
  // 与金额盈亏保持同一口径：逐档预估净盈亏 ÷ 本档剩余持仓成本；不计资金费。
  const floatingReturnRate = floatingPnl === null || bucket.costBasis <= 0
    ? null
    : floatingPnl / bucket.costBasis;
  const pnlTone = floatingPnl !== null && floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600";
  const content = (
    <div className="flex w-full min-w-0 items-center justify-between gap-2 tabular-nums">
      <span className="shrink-0 text-lg font-bold leading-none tracking-tight" style={{ textShadow: "-0.55px -0.55px 0 rgba(255,255,255,0.88), 0.75px 0.75px 0 rgba(71,85,105,0.20)" }}>{formatQuantity(bucket.remainingQuantity)}</span>
      {floatingPnl !== null && (
        <span className={`flex shrink-0 flex-col items-end text-right ${pnlTone}`}>
          <span className="whitespace-nowrap text-[11px] font-semibold leading-none" style={{ textShadow: "-0.35px -0.35px 0 rgba(255,255,255,0.84), 0.55px 0.55px 0 rgba(71,85,105,0.18)" }}>{formatSigned(floatingPnl)}</span>
          {floatingReturnRate !== null && (
            <span className="mt-1 text-[10px] font-medium leading-none opacity-85">{formatSignedPercent(floatingReturnRate)}</span>
          )}
        </span>
      )}
    </div>
  );
  if (readOnly) {
    return <div className={`flex min-h-[52px] w-full min-w-0 items-center px-1.5 py-1.5 ${tone}`} style={sideSurfaceStyle}>{content}</div>;
  }
  return (
    <button onClick={onClick} className={`flex min-h-[52px] w-full min-w-0 items-center px-1.5 py-1.5 text-left transition-[filter] active:brightness-95 ${tone}`} style={sideSurfaceStyle}>
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
}: {
  bucket?: PositionBucket;
  side: PositionSide;
  markPrice: number | null;
  onClose: () => void;
  onOpen: () => void;
  readOnly?: boolean;
}) {
  if (bucket && bucket.remainingQuantity > 0.0000001) {
    return <PositionCell bucket={bucket} side={side} markPrice={markPrice} onClick={onClose} readOnly={readOnly} />;
  }

  const isLong = side === "long";
  if (readOnly) {
    return <div className="min-h-[52px] w-full" />;
  }
  return (
    <button
      onClick={onOpen}
      aria-label={isLong ? "在该价格档位开多" : "在该价格档位开空"}
      className="min-h-[52px] w-full transition-colors hover:bg-white/25 active:brightness-95"
    />
  );
}

/** 独立路由继续使用无参数组件，避免影响 wouter 的路由组件签名。 */
export default function T0Journal() {
  return <T0JournalView />;
}
