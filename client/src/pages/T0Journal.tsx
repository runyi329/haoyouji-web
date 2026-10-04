import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import {
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
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

type PreviewTrade = {
  id: string;
  accountId: string;
  accountName?: string;
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
  realizedPnl: number;
  openedAt: string;
};

type EntryForm = {
  action: TradeAction;
  accountId: string;
  accountName: string;
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

const ACTION_GROUPS: Array<{ side: PositionSide; actions: TradeAction[]; groupClass: string }> = [
  { side: "long", actions: ["openLong", "closeLong"], groupClass: "bg-rose-50/80" },
  { side: "short", actions: ["openShort", "closeShort"], groupClass: "bg-emerald-50/80" },
];

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
 * 不分多空、也不受点击格影响：一律按实际成交价向上归入最近的 10U 档。
 * 例如 2606 → 2610，2695 / 2696 → 2700；精确落在十位线的价格保留原档。
 */
function archivePriceForSide(_side: PositionSide, value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const scaled = value / POSITION_ARCHIVE_STEP;
  const rounded = Math.ceil(scaled - 1e-9);
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

function formatAmount(value: number) {
  return Number.isFinite(value) ? numberFormatter.format(value) : "--";
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
      } else {
        buckets.set(key, {
          key,
          side,
          price: archivePrice,
          originalQuantity: trade.quantity,
          remainingQuantity: trade.quantity,
          costBasis: trade.quantity * trade.price,
          realizedPnl: 0,
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
    const grossPnl = side === "long"
      ? (trade.price - averageCost) * closedQuantity
      : (averageCost - trade.price) * closedQuantity;
    target.remainingQuantity -= closedQuantity;
    target.costBasis = Math.max(0, target.costBasis - averageCost * closedQuantity);
    target.realizedPnl += grossPnl - trade.fee;
  }

  return Array.from(buckets.values()).filter((bucket) => bucket.originalQuantity > 0);
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
    // 累计交易额口径：当前账户、当前方向下，所有已保存开/平仓成交名义金额之和。
    const turnover = sideTrades.reduce((total, trade) => total + trade.quantity * trade.price, 0);
    return { quantity, average, unrealized, realized, turnover, activeLevels: active.length };
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

export default function T0Journal() {
  const { id } = useParams<{ id: string }>();
  const ledgerId = Number(id);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const [accounts, setAccounts] = useState<PreviewAccount[]>([]);
  const [trades, setTrades] = useState<PreviewTrade[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [showEntrySheet, setShowEntrySheet] = useState(false);
  const [closeConfirmationStep, setCloseConfirmationStep] = useState<"input" | "review">("input");
  const [expandedOpenedTradeIds, setExpandedOpenedTradeIds] = useState<Set<string>>(() => new Set());
  const [showOpenedTradeList, setShowOpenedTradeList] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<PreviewTrade | null>(null);
  const [revertCandidate, setRevertCandidate] = useState<PreviewTrade | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<RecoverableTrade | null>(null);
  const [recoverableEntries, setRecoverableEntries] = useState<RecoverableTrade[]>([]);
  const [showRecoverableRecords, setShowRecoverableRecords] = useState(false);
  const [entrySide, setEntrySide] = useState<PositionSide>("long");
  const [lastSavedQuantity, setLastSavedQuantity] = useState("");
  const [showRecentRecords, setShowRecentRecords] = useState(true);
  const [lastMarkPrice, setLastMarkPrice] = useState<number | null>(null);
  const [previousMarkPrice, setPreviousMarkPrice] = useState<number | null>(null);
  const previousFetchedMarkPriceRef = useRef<number | null>(null);
  const ladderScrollRef = useRef<HTMLDivElement>(null);
  const [entryForm, setEntryForm] = useState<EntryForm>({
    action: "openLong",
    accountId: "",
    accountName: "",
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
  const canAccess = ledgerId === 52 && !viewAsUserId && (isLedgerAdmin || isSuperAdmin);
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: T0_PRICE_REFRESH_INTERVAL_MS,
    staleTime: 2500,
  });
  const t0JournalQuery = trpc.ledger.t0GetJournal.useQuery(
    { ledgerId: 52 },
    { enabled: canAccess, staleTime: 10_000 },
  );

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
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
    setTrades(nextTrades);
    setRecoverableEntries(nextRecoverableEntries);
    const latestSavedEntry = nextTrades
      .filter((entry) => entry.symbol === "ETH")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setLastSavedQuantity(latestSavedEntry ? normalizeEthQuantity(String(latestSavedEntry.quantity)) : "");
    // 首次进入优先展示最近有速记流水的账户，避免空账户标签把已保存的价格簿和流水“遮住”。
    const latestTradeAccountId = latestSavedEntry?.accountId || "";
    setSelectedAccountId((current) => nextAccounts.some((account) => account.id === current)
      ? current
      : (nextAccounts.some((account) => account.id === latestTradeAccountId) ? latestTradeAccountId : (nextAccounts[0]?.id || "")));
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
    () => trades.filter((trade) => trade.accountId === selectedAccountId && trade.symbol === "ETH"),
    [trades, selectedAccountId],
  );
  const getTradeAccountName = (trade: PreviewTrade) => trade.accountName
    || accounts.find((account) => account.id === trade.accountId)?.name
    || "未命名账户";
  const openedTradeList = useMemo(
    () => selectedTrades
      .filter((trade) => ACTIONS[trade.action].opening)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [selectedTrades],
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
  const entrySideSummary = entrySide === "long" ? summary.long : summary.short;
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
    setShowOpenedTradeList(false);
    setEntryForm({
      action,
      accountId: selectedAccountId,
      accountName: selectedAccount?.name ?? "",
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
    const target = buckets.find((bucket) => bucket.side === side && priceKey(bucket.price) === priceKey(archivePriceForTrade(trade)));
    if (!target || target.remainingQuantity <= 0.0000001) {
      toast.error("该笔仓位已无可平数量");
      return;
    }
    const action: TradeAction = side === "long" ? "closeLong" : "closeShort";
    setEntrySide(side);
    setCloseConfirmationStep("input");
    setShowOpenedTradeList(false);
    setEntryForm({
      action,
      accountId: selectedAccountId,
      accountName: selectedAccount?.name ?? "",
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
    setShowOpenedTradeList(false);
    setEntryForm({
      action: trade.action,
      accountId: trade.accountId,
      accountName: accounts.find((account) => account.id === trade.accountId)?.name ?? "",
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
      setTrades((current) => current.map((trade) => trade.clientRequestId === variables.clientRequestId ? entry : trade));
      setSelectedAccountId(account.id);
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
    if (!account) return;
    setSelectedAccountId(account.id);
    selectAccountMutation.mutate({ ledgerId: 52, accountId: Number(account.id) });
  };

  const handleSaveEntry = () => {
    const normalizedQuantity = normalizeEthQuantity(entryForm.quantity);
    const quantity = Number(normalizedQuantity);
    const price = Number(entryForm.price);
    const fee = estimatedFeeUsdt ?? 0;
    const selectedAction = ACTIONS[entryForm.action];
    const normalizedAccountName = entryForm.accountName.trim();
    const hasPersistedAccountId = /^\d+$/.test(entryForm.accountId);

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

    if (entryForm.editingEntryId) {
      const entryId = Number(entryForm.editingEntryId);
      if (!selectedAction.opening || !Number.isInteger(entryId) || entryId <= 0) {
        toast.error("仅可编辑有效的开仓记录");
        return;
      }
      updateOpeningEntryMutation.mutate({
        ledgerId: 52,
        entryId,
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
      const target = buckets.find((bucket) => bucket.side === side && priceKey(bucket.price) === priceKey(archiveTargetPrice));
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
    setSelectedAccountId(accountId);
    const trade: PreviewTrade = {
      id: `pending-entry-${clientRequestId}`,
      accountId,
      accountName: normalizedAccountName || selectedAccount?.name,
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
      symbol: "ETH",
      action: entryForm.action,
      quantity: normalizedQuantity,
      price: entryForm.price.trim(),
      targetPrice: archiveTargetPrice === undefined ? undefined : String(archiveTargetPrice),
      note: entryForm.note.trim() || undefined,
      clientRequestId,
    });
  };

  const backToLedger = () => setLocation(`/ledger/${ledgerId}`);
  const backToLadder = () => {
    setCloseConfirmationStep("input");
    setShowOpenedTradeList(false);
    setShowEntrySheet(false);
  };

  if (meLoading || ledgerLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">正在核验访问权限…</div>;
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-slate-50 max-w-md mx-auto flex flex-col">
        <div className="flex items-center gap-3 px-4 py-4 bg-white border-b border-slate-100">
          <button onClick={backToLedger} aria-label="返回52号账本" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <ArrowLeft className="w-5 h-5 text-slate-700" />
          </button>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900">T+0 速记账本</div>
            <div className="text-xs text-slate-500 mt-0.5">52 号账本内部工具</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-200 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-slate-500" />
          </div>
          <div className="text-base font-semibold text-slate-800">当前身份不可访问</div>
          <p className="mt-2 text-sm leading-6 text-slate-500">该工具只在 52 号账本的管理身份下显示，代入成员视角时不会开放。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 max-w-md mx-auto pb-28">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="h-14 px-4 flex items-center gap-3">
          <button onClick={backToLedger} aria-label="返回52号账本" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center active:scale-95">
            <ArrowLeft className="w-5 h-5 text-slate-800" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-semibold text-slate-900">T+0 速记账本</h1>
          </div>
          <button
            onClick={() => window.location.reload()}
            aria-label="强制刷新整个页面"
            title="强制刷新整个页面"
            className="h-8 rounded-lg border border-indigo-100 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 active:scale-95"
          >
            刷新
          </button>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-4">
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] text-slate-400">账户总览</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-slate-400">实时参考价</div>
                <div className={`mt-0.5 flex items-center justify-end gap-0.5 text-sm font-semibold tabular-nums ${priceTrendClass}`}>
                  {priceTrend === "up" && <span role="img" aria-label="价格上涨" className="inline-block h-0 w-0 border-x-[4px] border-b-[6px] border-x-transparent border-b-current" />}
                  {priceTrend === "down" && <span role="img" aria-label="价格下跌" className="inline-block h-0 w-0 border-x-[4px] border-t-[6px] border-x-transparent border-t-current" />}
                  {formatPrice(markPrice)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b border-slate-100">
            <SummaryCard side="long" summary={summary.long} />
            <SummaryCard side="short" summary={summary.short} />
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div ref={ladderScrollRef} className="max-h-[calc(100vh-250px)] overflow-y-auto overscroll-contain">
            {priceRows.map((row) => (
              <div
                key={priceKey(row.price)}
                data-ladder-price={row.price}
                className={`grid grid-cols-[1fr_88px_1fr] min-h-[52px] border-b border-slate-100 last:border-b-0 ${row.isMark ? (priceTrend === "up" ? "bg-rose-100/80" : priceTrend === "down" ? "bg-sky-100/80" : "bg-slate-100") : "bg-white"}`}
              >
                <LadderCell
                  bucket={row.long}
                  side="long"
                  markPrice={markPrice}
                  onClose={() => row.long && openEntrySheet("closeLong", row.long.price)}
                  onOpen={() => openEntrySheet("openLong")}
                />
                <div className={`border-x border-slate-100 flex items-center justify-center px-1 ${row.isMark ? (priceTrend === "up" ? "bg-rose-200 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.25)]" : priceTrend === "down" ? "bg-sky-200 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.25)]" : "bg-slate-200") : "bg-slate-50"}`}>
                  <span className={`text-sm tabular-nums font-bold ${row.isMark && priceTrend === "up" ? "text-rose-700" : row.isMark && priceTrend === "down" ? "text-sky-700" : "text-slate-900"}`}>
                    {row.isMark && markPrice ? markPrice.toFixed(2) : formatLadderPrice(row.price)}
                  </span>
                </div>
                <LadderCell
                  bucket={row.short}
                  side="short"
                  markPrice={markPrice}
                  onClose={() => row.short && openEntrySheet("closeShort", row.short.price)}
                  onOpen={() => openEntrySheet("openShort")}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <button onClick={() => setShowRecentRecords((value) => !value)} className="w-full px-4 py-3 flex items-center justify-between text-left">
            <div>
              <div className="text-sm font-semibold text-slate-900">最近速记</div>
              <div className="mt-0.5 text-[11px] text-slate-500">已保存的开平记录会同步影响上方价格簿</div>
            </div>
            <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showRecentRecords ? "rotate-90" : ""}`} />
          </button>
          {showRecentRecords && (
            <div className="border-t border-slate-100">
              {selectedTrades.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-slate-500">所选账户还没有速记记录</div>
              ) : [...selectedTrades].reverse().map((trade) => (
                  <div key={trade.id} className="px-4 py-3 border-b border-slate-100 last:border-b-0 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold ${ACTIONS[trade.action].side === "long" ? "text-rose-600" : "text-sky-700"}`}>{ACTIONS[trade.action].label}</span>
                      <span title={getTradeAccountName(trade)} className="max-w-[96px] truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">账户 {getTradeAccountName(trade)}</span>
                      {trade.targetPrice !== undefined && <span className="text-[11px] text-slate-400">{ACTIONS[trade.action].opening ? `归档 ${formatPrice(archivePriceForTrade(trade))}` : `对应 ${formatPrice(archivePriceForTrade(trade))}`}</span>}
                      {trade.isSyncing && <span className="text-[11px] text-amber-600">保存中</span>}
                    </div>
                    <div className="mt-1 text-xs text-slate-700 tabular-nums">{formatQuantity(trade.quantity)} ETH @ {formatPrice(trade.price)}</div>
                    {trade.note && <div className="mt-1 text-[11px] text-slate-500 truncate">{trade.note}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <div className="text-right text-[11px] text-slate-400 whitespace-nowrap">{new Date(trade.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</div>
                    <button
                      type="button"
                      disabled={Boolean(trade.isSyncing) || revertEntryMutation.isPending}
                      onClick={() => setRevertCandidate(trade)}
                      className="h-6 rounded-md border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-semibold text-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      回撤
                    </button>
                  </div>
                </div>
              ))}
              {recoverableEntries.length > 0 && (
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
                            <div className="mt-0.5 text-[10px] text-slate-500">账户 {getTradeAccountName(item.trade)} · {item.operation === "delete" ? "删除" : "回撤"}于 {formatBeijingMonthDayTime(item.revertedAt)}</div>
                          </div>
                          <button
                            type="button"
                            disabled={restoreEntryMutation.isPending}
                            onClick={() => setRestoreCandidate(item)}
                            className="h-7 shrink-0 rounded-lg border border-indigo-200 bg-white px-2 text-[11px] font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
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

        <section className="px-1 py-1">
          <div className="text-[11px] leading-5 text-slate-500">速记仅记录交易信息，不会触发交易所下单；下单账户与流水仅对当前管理员本人可见。</div>
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-md border-t border-slate-200 bg-white/95 backdrop-blur px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(ACTIONS) as TradeAction[]).map((action) => {
            const config = ACTIONS[action];
            const isClosing = !config.opening;
            const canOpen = !isClosing || buckets.some((bucket) => bucket.side === config.side && bucket.remainingQuantity > 0.0000001);
            return (
              <button
                key={action}
                disabled={!canOpen}
                onClick={() => openEntrySheet(action)}
                className={`h-10 rounded-xl border text-xs font-semibold transition disabled:opacity-35 ${config.idleClass}`}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {showEntrySheet && (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label="速记一笔">
          <div className="w-full max-w-md mx-auto rounded-t-3xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="px-4 pt-3 pb-2 flex items-center gap-3 sticky top-0 bg-white z-10 border-b border-slate-100">
              <button
                type="button"
                onClick={backToLadder}
                aria-label="返回梯形报价"
                className="h-9 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 flex items-center gap-1 active:scale-[0.98]"
              >
                <ArrowLeft className="h-4 w-4" />
                返回报价
              </button>
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900">{isEditingEntry ? "编辑开仓记录" : isClosingEntry ? `${ACTIONS[entryForm.action].label}设置` : "速记一笔"}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{isEditingEntry ? "仅可修改数量、成交价与备注；修改会保留审计快照" : isClosingEntry ? "填写平仓数量与成交价后，需两次确认才会记账" : "本地先显示，后台立即保存；不会触发交易所下单"}</div>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className={`overflow-hidden rounded-2xl border ${entrySide === "long" ? "border-rose-200 bg-rose-50/70" : "border-emerald-200 bg-emerald-50/70"}`}>
                <button
                  type="button"
                  aria-expanded={showOpenedTradeList}
                  aria-label={`展开${entrySide === "long" ? "多仓" : "空仓"}订单列表`}
                  onClick={() => setShowOpenedTradeList((value) => !value)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 px-3 py-2.5 text-left"
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className={`text-base font-semibold ${entrySide === "long" ? "text-rose-600" : "text-emerald-600"}`}>{entrySide === "long" ? "多仓汇总" : "空仓汇总"}</span>
                    <span className="text-base font-semibold tabular-nums text-slate-900">{formatQuantity(entrySideSummary.quantity)} ETH</span>
                  </div>
                  <span className="shrink-0 text-base font-medium tabular-nums text-slate-500">均价 {entrySideSummary.quantity > 0 ? formatPrice(entrySideSummary.average) : "--"}</span>
                  <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${showOpenedTradeList ? "rotate-90" : ""}`} />
                </button>
                <div className={`mx-3 flex items-center justify-between border-t pt-2 pb-2.5 text-[10px] tabular-nums ${entrySide === "long" ? "border-rose-200/80" : "border-emerald-200/80"}`}>
                  <span className={entrySideSummary.unrealized === null ? "text-slate-400" : entrySideSummary.unrealized >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    当前盈亏 {entrySideSummary.unrealized === null ? "--" : `${formatSigned(entrySideSummary.unrealized)} U`}
                  </span>
                  <span className="text-slate-500">已开 {openedTradeList.length} 笔</span>
                </div>
              </div>

              {isCloseReview && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <div className="text-xs font-semibold text-amber-800">第 2 次确认</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                    {ACTIONS[entryForm.action].label} {formatQuantity(Number(entryForm.quantity))} ETH @ {formatPrice(Number(entryForm.price))}
                  </div>
                  <div className="mt-1 text-[11px] text-amber-800/80">对应开仓价 {entryForm.targetPrice === undefined ? "--" : formatPrice(entryForm.targetPrice)}；确认后立即写入速记流水。</div>
                </div>
              )}

              {showOpenedTradeList && (
                <div className="space-y-1.5">
                  {openedTradeList.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">当前方向没有已开订单</div>
                  )}
                  {openedTradeList.map((trade) => {
                    const floatingPnl = markPrice === null
                      ? null
                      : ACTIONS[trade.action].side === "long"
                        ? (markPrice - trade.price) * trade.quantity
                        : (trade.price - markPrice) * trade.quantity;
                    const openingValue = trade.quantity * trade.price;
                    const closeAction: TradeAction = ACTIONS[trade.action].side === "long" ? "closeLong" : "closeShort";
                    const canQuickClose = buckets.some((bucket) => bucket.side === ACTIONS[trade.action].side && priceKey(bucket.price) === priceKey(archivePriceForTrade(trade)) && bucket.remainingQuantity > 0.0000001);
                    const isExpanded = expandedOpenedTradeIds.has(trade.id);
                    return (
                      <div key={trade.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedOpenedTradeIds((current) => {
                            const next = new Set(current);
                            if (next.has(trade.id)) next.delete(trade.id);
                            else next.add(trade.id);
                            return next;
                          })}
                          className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 text-left"
                        >
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className={`text-base font-semibold ${ACTIONS[trade.action].side === "long" ? "text-rose-600" : "text-emerald-600"}`}>{ACTIONS[trade.action].label}</span>
                            <span className="text-base font-semibold tabular-nums text-slate-900">{formatQuantity(trade.quantity)} ETH</span>
                            <span title={getTradeAccountName(trade)} className="min-w-0 truncate text-[11px] font-medium text-slate-500">账户 {getTradeAccountName(trade)}</span>
                          </div>
                          <span className="shrink-0 text-base font-medium tabular-nums text-slate-500">开仓价 {formatPrice(trade.price)}</span>
                          <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </button>
                        {isExpanded && (
                          <>
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-200 pt-2 tabular-nums">
                              <div>
                                <div className="text-[10px] text-slate-400">开仓价值</div>
                                <div className="mt-0.5 text-xs font-medium text-slate-700">{formatPrice(openingValue)} U</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-slate-400">开仓时间</div>
                                <div className="mt-0.5 text-xs font-medium text-slate-700">{trade.isSyncing ? "后台保存中" : formatBeijingMonthDayTime(trade.createdAt)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-slate-400">手续费</div>
                                <div className="mt-0.5 text-xs font-medium text-slate-700">{formatFee(trade.fee)} U</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-slate-400">当前盈亏</div>
                                <div className={`mt-0.5 text-xs font-semibold ${floatingPnl === null ? "text-slate-400" : floatingPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                  {floatingPnl === null ? "--" : `${formatSigned(floatingPnl)} U`}
                                </div>
                              </div>
                              <div className="col-span-2 flex items-center justify-between border-t border-slate-200 pt-2">
                                <span className="text-[10px] text-slate-400">下单账户</span>
                                <span className="text-xs font-medium text-slate-700">{getTradeAccountName(trade)}</span>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isCloseReview || Boolean(trade.isSyncing)}
                                  onClick={() => openEditOpeningTrade(trade)}
                                  className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  disabled={isCloseReview || Boolean(trade.isSyncing)}
                                  onClick={() => setDeleteCandidate(trade)}
                                  className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-700 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  删除
                                </button>
                              </div>
                              <button
                                type="button"
                                disabled={isCloseReview || !canQuickClose}
                                onClick={() => openQuickCloseSheet(trade)}
                                className={`h-8 rounded-lg border px-3 text-xs font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${ACTIONS[closeAction].idleClass}`}
                              >
                                {ACTIONS[closeAction].label}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <div className="text-xs font-medium text-slate-600 mb-2">{entrySide === "long" ? "多仓操作" : "空仓操作"}</div>
                {ACTION_GROUPS.filter((group) => group.side === entrySide).map((group) => (
                  <div key={group.side} className={`grid grid-cols-2 gap-2 rounded-2xl p-1 ${group.groupClass}`}>
                    {group.actions.map((action) => {
                      const config = ACTIONS[action];
                      const selected = entryForm.action === action;
                      const disabled = isCloseReview || isEditingEntry || (!config.opening && !entryForm.targetPrice);
                      return (
                        <button
                          key={action}
                          disabled={disabled}
                          onClick={() => {
                            setCloseConfirmationStep("input");
                            setEntryForm((current) => ({ ...current, action, targetPrice: config.opening ? undefined : current.targetPrice }));
                          }}
                          className={`h-10 rounded-xl border text-xs font-semibold disabled:opacity-35 ${selected ? config.activeClass : config.idleClass}`}
                        >
                          {`ETH ${config.label}`}
                        </button>
                      );
                    })}
                  </div>
                ))}
                {!ACTIONS[entryForm.action].opening && entryForm.targetPrice !== undefined && (
                  <div className="mt-2 text-xs text-slate-500">将平 {formatPrice(entryForm.targetPrice)} 的 {ACTIONS[entryForm.action].side === "long" ? "多仓" : "空仓"}</div>
                )}
                {!ACTIONS[entryForm.action].opening && entryForm.targetPrice === undefined && (
                  <div className="mt-2 text-xs text-amber-700">请先关闭面板，再从价格簿中点选要平的仓位。</div>
                )}
              </div>

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
                      className={`w-full h-14 rounded-xl border px-3 text-xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 ${quantityFormatError ? "border-rose-400 bg-rose-50 focus:border-rose-500" : "border-slate-200 focus:border-indigo-500"}`}
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
                      className="w-full h-14 rounded-xl border border-slate-200 px-3 text-xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500"
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
                        className={`h-7 rounded-lg border px-2 text-[11px] font-medium tabular-nums transition active:scale-95 ${isActive ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        {index === 0 && lastSavedQuantity ? `最近 ${displayValue}` : displayValue}
                      </button>
                    );
                  })}
                </div>

                <Field label="备注（可选）">
                  <input
                    disabled={isCloseReview}
                    value={entryForm.note}
                    onChange={(event) => setEntryForm((current) => ({ ...current, note: event.target.value }))}
                    placeholder="不填则不生成默认备注"
                    className="w-full h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                  />
                </Field>

                <Field label="下单账户">
                  {accounts.length > 0 ? (
                    <select
                      disabled={isCloseReview || isEditingEntry}
                      value={entryForm.accountId}
                      onChange={(event) => selectOrderAccount(event.target.value)}
                      className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-500"
                    >
                      <option value="">新建下单账户</option>
                      {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  ) : null}
                  {!entryForm.accountId && (
                    <input
                      disabled={isCloseReview || isEditingEntry}
                      value={entryForm.accountName}
                      onChange={(event) => setEntryForm((current) => ({ ...current, accountName: event.target.value }))}
                      placeholder="例如：AC账户、主账户"
                      className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500"
                    />
                  )}
                  <div className="mt-1.5 text-[11px] leading-4 text-slate-400">新建后仅当前管理员可见；下次速记默认选用最近一次选择的账户。</div>
                </Field>
              </div>

            </div>
            <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
              {isCloseReview ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCloseConfirmationStep("input")}
                    className="h-12 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:scale-[0.99]"
                  >
                    返回修改
                  </button>
                  <button
                    disabled={saveEntryMutation.isPending}
                    onClick={handleSaveEntry}
                    className="h-12 rounded-xl bg-amber-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40 active:scale-[0.99]"
                  >
                    再次确认并记账
                  </button>
                </div>
              ) : (
                <button
                  disabled={isEditingEntry ? updateOpeningEntryMutation.isPending : saveEntryMutation.isPending || (isClosingEntry && entryForm.targetPrice === undefined)}
                  onClick={handleSaveEntry}
                  className="w-full h-12 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40 active:scale-[0.99]"
                >
                  {isEditingEntry ? "保存修改" : isClosingEntry ? `确认${ACTIONS[entryForm.action].label}参数` : "快速保存并记账"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="删除开仓记录">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">删除这笔开仓记录？</div>
            <div className="mt-2 text-sm tabular-nums text-slate-700">
              {ACTIONS[deleteCandidate.action].label} {formatQuantity(deleteCandidate.quantity)} ETH @ {formatPrice(deleteCandidate.price)}
            </div>
            <div className="mt-2 text-[11px] leading-5 text-slate-500">删除后不再显示于速记账本；删除前记录、操作时间与操作人会保留在审计记录中。</div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={deleteOpeningEntryMutation.isPending}
                onClick={() => setDeleteCandidate(null)}
                className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                取消
              </button>
              <button
                disabled={deleteOpeningEntryMutation.isPending}
                onClick={() => deleteOpeningEntryMutation.mutate({ ledgerId: 52, entryId: Number(deleteCandidate.id) })}
                className="h-11 rounded-xl bg-rose-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {revertCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="回撤速记流水">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
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
                className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                取消
              </button>
              <button
                disabled={revertEntryMutation.isPending}
                onClick={() => revertEntryMutation.mutate({ ledgerId: 52, entryId: Number(revertCandidate.id) })}
                className="h-11 rounded-xl bg-amber-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
              >
                确认回撤
              </button>
            </div>
          </div>
        </div>
      )}

      {restoreCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" role="dialog" aria-modal="true" aria-label="恢复速记流水">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
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
                className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 disabled:opacity-40"
              >
                取消
              </button>
              <button
                disabled={restoreEntryMutation.isPending}
                onClick={() => restoreEntryMutation.mutate({ ledgerId: 52, auditId: Number(restoreCandidate.auditId) })}
                className="h-11 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
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

function SummaryCard({
  side,
  summary,
}: {
  side: PositionSide;
  summary: { quantity: number; average: number; unrealized: number | null; realized: number; turnover: number; activeLevels: number };
}) {
  const isLong = side === "long";
  const pnlColor = (value: number | null) => value === null ? "text-slate-400" : value >= 0 ? "text-rose-600" : "text-emerald-600";

  return (
    <div className={`p-3 ${isLong ? "border-r border-slate-100" : ""}`}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg tabular-nums font-semibold text-slate-900">{formatQuantity(summary.quantity)}</span>
        <span className="text-[11px] text-slate-500">ETH</span>
        <span className={`text-xs font-semibold ${isLong ? "text-rose-600" : "text-emerald-600"}`}>{isLong ? "多仓" : "空仓"}</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">均价 {summary.quantity > 0 ? formatPrice(summary.average) : formatAmount(0)}</div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">浮动结果</span>
        <span className={`font-semibold tabular-nums ${pnlColor(summary.unrealized)}`}>{formatSigned(summary.unrealized ?? 0)} U</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">累计盈利</span>
        <span className={`font-semibold tabular-nums ${pnlColor(summary.realized)}`}>{formatSigned(summary.realized)} U</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">价格档位</span>
        <span className="font-medium tabular-nums text-slate-700">{summary.activeLevels}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">累计交易额</span>
        <span className="font-semibold tabular-nums text-slate-700">{formatAmount(summary.turnover)} U</span>
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

  return (
    <button onClick={onClick} className={`min-h-[52px] w-full min-w-0 px-3 py-1.5 text-left transition-colors active:brightness-95 ${tone}`}>
      <div className="flex w-full min-w-0 items-center justify-between gap-2 tabular-nums">
        <span className="shrink-0 text-base font-bold leading-none tracking-tight">{formatQuantity(bucket.remainingQuantity)}</span>
        {floatingPnl !== null && (
          <span className={`min-w-0 truncate text-right text-[11px] font-semibold ${floatingPnl >= 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatSigned(floatingPnl)}</span>
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
}: {
  bucket?: PositionBucket;
  side: PositionSide;
  markPrice: number | null;
  onClose: () => void;
  onOpen: () => void;
}) {
  if (bucket && bucket.remainingQuantity > 0.0000001) {
    return <PositionCell bucket={bucket} side={side} markPrice={markPrice} onClick={onClose} />;
  }

  const isLong = side === "long";
  return (
    <button
      onClick={onOpen}
      aria-label={isLong ? "在该价格档位开多" : "在该价格档位开空"}
      className={`min-h-[52px] w-full transition-colors active:brightness-95 ${isLong ? "bg-rose-50/45 hover:bg-rose-100/80" : "bg-emerald-50/45 hover:bg-emerald-100/80"}`}
    />
  );
}
