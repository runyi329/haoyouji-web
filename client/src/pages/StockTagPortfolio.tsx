import { useState } from "react";
import { ArrowLeft, BadgeCheck, ChevronDown, ChevronUp, History, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type EventType = "buy" | "add" | "reduce" | "sell" | "note";

type Props = {
  ledgerId: number;
  categoryId: number;
  categoryName: string;
  onBack: () => void;
  /** Member/observed view: only show this member's allocated lots and P&L baseline. */
  participantView?: boolean;
};

const eventLabels: Record<EventType, string> = {
  buy: "买入",
  add: "加仓",
  reduce: "减仓",
  sell: "卖出",
  note: "备注",
};

const eventTone: Record<EventType, string> = {
  buy: "bg-[#E3F2FD] text-[#1565C0]",
  add: "bg-[#E8F5E9] text-[#2E7D32]",
  reduce: "bg-[#FFF3E0] text-[#E65100]",
  sell: "bg-[#FFEBEE] text-[#C62828]",
  note: "bg-gray-100 text-gray-600",
};

const money = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

const signedMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;
};

const formatQuantity = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 8 });

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replaceAll("/", "-");
};

const formatQuoteUpdate = (value?: string | null) => {
  if (!value) return "更新待获取";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更新待获取";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");
  if (!month || !day || !hour || !minute) return "更新待获取";
  return `更新于${Number(month)}月${Number(day)}日 ${hour}:${minute}`;
};

function localInputTime(now = new Date()) {
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function StockTagPortfolio({ ledgerId, categoryId, categoryName, onBack, participantView = false }: Props) {
  const utils = trpc.useUtils();
  const { user: currentUser } = useAuth();
  const globalPortfolioQuery = trpc.ledger.getStockTagPortfolio.useQuery(
    { ledgerId, categoryId },
    { enabled: !participantView, refetchOnWindowFocus: true, staleTime: 10_000 },
  );
  const dailySnapshotsQuery = trpc.ledger.getStockTagDailySnapshots.useQuery(
    { ledgerId, categoryId },
    { enabled: !participantView && Boolean(categoryId), refetchOnWindowFocus: true, staleTime: 10_000 },
  );
  const publicPortfolioQuery = trpc.ledger.getStockTagPublicPortfolio.useQuery(
    { ledgerId: 37, categoryId },
    { enabled: participantView && ledgerId === 37, refetchOnWindowFocus: true, staleTime: 10_000 },
  );
  const memberPortfolioQuery = trpc.ledger.getMyStockTagParticipantPortfolio.useQuery(
    { ledgerId: 37, categoryId },
    { enabled: participantView && ledgerId === 37, refetchOnWindowFocus: true, staleTime: 10_000 },
  );

  const data = participantView ? memberPortfolioQuery.data : globalPortfolioQuery.data;
  const isLoading = participantView ? memberPortfolioQuery.isLoading : globalPortfolioQuery.isLoading;
  const error = participantView ? memberPortfolioQuery.error : globalPortfolioQuery.error;
  const canEdit = !participantView && Boolean((data as any)?.canEdit);
  // Only administrators receive the named, all-member allocation matrix.  The
  // ordinary member route deliberately stays limited to its own allocation.
  const allocationMatrixQuery = trpc.ledger.getStockLotParticipationMatrix.useQuery(
    { ledgerId: 37, categoryId },
    { enabled: canEdit, refetchOnWindowFocus: true, staleTime: 10_000 },
  );
  const tagData = (participantView ? publicPortfolioQuery.data : globalPortfolioQuery.data) as any;
  const tagSummary = tagData?.summary;
  const tagPositions = tagData?.positions || [];
  // 只有15:05盘尾任务已为某日成功写入有效快照时，才显示日结印章；不以前端当前时间伪造结算。
  const settledSnapshot = participantView ? (memberPortfolioQuery.data as any)?.summary?.latestSnapshot : tagSummary?.latestSnapshot;
  const snapshotStamp = settledSnapshot?.snapshotDate ? `${settledSnapshot.snapshotDate} · 15:05 盘尾快照` : null;

  const [showHistory, setShowHistory] = useState(false);
  const [showPnlFormula, setShowPnlFormula] = useState(false);
  const [showDailyPnlHistory, setShowDailyPnlHistory] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<any | null>(null);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [eventType, setEventType] = useState<EventType>("buy");
  const [symbolQuery, setSymbolQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [quantity, setQuantity] = useState("");
  const [executionPrice, setExecutionPrice] = useState("");
  const [actualTradedAt, setActualTradedAt] = useState(localInputTime());
  const [note, setNote] = useState("");
  const [correctingEvent, setCorrectingEvent] = useState<any | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [editingLotNoteId, setEditingLotNoteId] = useState<number | null>(null);
  const [lotNoteDraft, setLotNoteDraft] = useState("");
  const [expandedAdminLotIds, setExpandedAdminLotIds] = useState<Set<number>>(new Set());

  const shouldSearchStock = showActionDialog && eventType !== "note" && symbolQuery.trim().length >= 2 && !selectedStock;
  const { data: suggestionsData, isFetching: isSearchingStock } = trpc.searchManualAshareStocks.useQuery(
    { query: symbolQuery.trim() },
    { enabled: shouldSearchStock, staleTime: 3_000 },
  );
  const suggestions = (suggestionsData as any)?.results || [];

  const addEventMutation = trpc.ledger.addStockTagEvent.useMutation({
    onSuccess: () => {
      toast.success(`${eventLabels[eventType]}已登记，并保留服务器登记时间`);
      closeActionDialog();
      void utils.ledger.getStockTagPortfolio.invalidate({ ledgerId, categoryId });
      void utils.ledger.getMyStockTagParticipantPortfolio.invalidate({ ledgerId: 37, categoryId });
      void utils.ledger.getStockTagDailySnapshots.invalidate({ ledgerId, categoryId });
      void utils.ledger.getStockLotParticipationMatrix.invalidate({ ledgerId: 37, categoryId });
    },
    onError: (error) => toast.error(`登记失败：${error.message}`),
  });

  const voidEventMutation = trpc.ledger.voidStockTagEvent.useMutation({
    onSuccess: () => {
      toast.success("操作已作废，原始审计记录仍会保留");
      void utils.ledger.getStockTagPortfolio.invalidate({ ledgerId, categoryId });
      void utils.ledger.getMyStockTagParticipantPortfolio.invalidate({ ledgerId: 37, categoryId });
      void utils.ledger.getStockLotParticipationMatrix.invalidate({ ledgerId: 37, categoryId });
    },
    onError: (error) => toast.error(`作废失败：${error.message}`),
  });

  const correctEventMutation = trpc.ledger.correctStockTagEvent.useMutation({
    onSuccess: () => {
      toast.success("更正已追加；原始操作已保留为作废审计记录");
      closeActionDialog();
      void utils.ledger.getStockTagPortfolio.invalidate({ ledgerId, categoryId });
      void utils.ledger.getMyStockTagParticipantPortfolio.invalidate({ ledgerId: 37, categoryId });
      void utils.ledger.getStockLotParticipationMatrix.invalidate({ ledgerId: 37, categoryId });
    },
    onError: (error) => toast.error(`更正失败：${error.message}`),
  });

  const updateLotNoteMutation = trpc.ledger.updateStockTagLotNote.useMutation({
    onSuccess: () => {
      toast.success("持仓编号备注已保存");
      setEditingLotNoteId(null);
      setLotNoteDraft("");
      void utils.ledger.getStockTagPortfolio.invalidate({ ledgerId, categoryId });
      void utils.ledger.getStockLotParticipationMatrix.invalidate({ ledgerId: 37, categoryId });
    },
    onError: (error) => toast.error(`备注保存失败：${error.message}`),
  });

  const historyRows = ((data as any)?.history || []) as any[];

  const closeActionDialog = () => {
    setShowActionDialog(false);
    setEventType("buy");
    setSymbolQuery("");
    setSelectedStock(null);
    setQuantity("");
    setExecutionPrice("");
    setActualTradedAt(localInputTime());
    setNote("");
    setCorrectingEvent(null);
    setCorrectionReason("");
  };

  const openAction = (type: EventType) => {
    setCorrectingEvent(null);
    setEventType(type);
    setShowActionDialog(true);
  };

  const openCorrection = (event: any) => {
    setCorrectingEvent(event);
    setEventType(event.type as EventType);
    setSelectedStock(event.symbol ? { symbol: event.symbol, name: event.stockName || event.symbol } : null);
    setSymbolQuery("");
    setQuantity(event.quantity === null ? "" : String(event.quantity));
    setExecutionPrice(event.executionPrice === null ? "" : String(event.executionPrice));
    setActualTradedAt(localInputTime(event.actualTradedAt ? new Date(event.actualTradedAt) : new Date()));
    setNote(event.note || "");
    setCorrectionReason("");
    setShowActionDialog(true);
  };

  const submitEvent = () => {
    const correctionPayload = correctingEvent ? { eventId: correctingEvent.id, reason: correctionReason.trim() } : null;
    if (correctionPayload && !correctionPayload.reason) return toast.error("请填写更正原因");
    if (eventType === "note") {
      if (!note.trim()) return toast.error("请填写备注内容");
      const payload = { ledgerId: 37 as const, categoryId, eventType, note: note.trim(), actualTradedAt: new Date(actualTradedAt).toISOString() };
      if (correctionPayload) correctEventMutation.mutate({ ...payload, ...correctionPayload });
      else addEventMutation.mutate(payload);
      return;
    }
    if (!selectedStock) return toast.error("请从检索结果中选择已核验的股票");
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(executionPrice);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return toast.error("请输入正确的成交数量");
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return toast.error("请输入正确的成交价格");
    const actualDate = new Date(actualTradedAt);
    if (Number.isNaN(actualDate.getTime())) return toast.error("请选择实际成交/接单时间");
    const payload = {
      ledgerId: 37 as const,
      categoryId,
      eventType,
      symbol: selectedStock.symbol,
      quantity: parsedQuantity,
      executionPrice: parsedPrice,
      actualTradedAt: actualDate.toISOString(),
      note: note.trim() || undefined,
    };
    if (correctionPayload) correctEventMutation.mutate({ ...payload, ...correctionPayload });
    else addEventMutation.mutate(payload);
  };

  const requestVoid = (event: any) => {
    const reason = window.prompt("填写作废原因（原记录不会删除）：");
    if (!reason?.trim()) return;
    voidEventMutation.mutate({ ledgerId: 37, categoryId, eventId: event.id, reason: reason.trim() });
  };

  const beginLotNoteEdit = (lotId: number, currentNote: string) => {
    setEditingLotNoteId(lotId);
    setLotNoteDraft(currentNote);
  };

  const cancelLotNoteEdit = () => {
    if (updateLotNoteMutation.isPending) return;
    setEditingLotNoteId(null);
    setLotNoteDraft("");
  };

  const saveLotNote = (lotId: number) => {
    updateLotNoteMutation.mutate({ ledgerId: 37, categoryId, lotId, note: lotNoteDraft });
  };

  const summary = (data as any)?.summary;
  // 优先使用两个盘尾快照的累计盈亏差额。这样本地热预览即使仍在读取尚未部署的
  // 服务端摘要字段，也不会把当天新增的持仓本金误显示为当日盈亏。
  const dailyPnlFromSnapshots = (() => {
    const latestTotalPnl = summary?.latestSnapshot?.totalPnl;
    const priorTotalPnl = summary?.priorSnapshot?.totalPnl;
    if (latestTotalPnl !== null && latestTotalPnl !== undefined && priorTotalPnl !== null && priorTotalPnl !== undefined) {
      const latest = Number(latestTotalPnl);
      const prior = Number(priorTotalPnl);
      if (Number.isFinite(latest) && Number.isFinite(prior)) return latest - prior;
    }
    return summary?.dailyChange ?? null;
  })();
  const dailyPnlRecords = !participantView
    ? [...(((dailySnapshotsQuery.data || []) as any[]))]
      .sort((left, right) => String(left.snapshotDate).localeCompare(String(right.snapshotDate)))
      .map((snapshot, index, rows) => {
        const totalPnl = Number(snapshot.totalPnl || 0);
        const previousTotalPnl = index > 0 ? Number(rows[index - 1]?.totalPnl || 0) : 0;
        return {
          date: String(snapshot.snapshotDate),
          totalPnl,
          dailyPnl: index === 0 ? totalPnl : totalPnl - previousTotalPnl,
          marketValue: snapshot.marketValue === null || snapshot.marketValue === undefined ? null : Number(snapshot.marketValue),
          costValue: snapshot.costValue === null || snapshot.costValue === undefined ? null : Number(snapshot.costValue),
        };
      })
    : [];
  const dailyPnlHistoryRecords = dailyPnlRecords.slice().reverse();
  const openDailyPnlHistory = () => setShowDailyPnlHistory(true);
  // 观察成员与普通成员始终只读；后端亦不会接受其写请求。
  // 标签名称即账户名称来源；已含“账户”时避免重复拼接。
  const accountName = categoryName.trim().endsWith("账户") ? categoryName.trim() : `${categoryName.trim() || "股票"}账户`;
  const selectedHistory = selectedPosition
    ? ((data as any)?.history || []).filter((event: any) => event.symbol === selectedPosition.symbol)
    : [];

  if (isLoading) {
    return <div className="min-h-screen bg-[#FAF3ED] flex items-center justify-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" />正在加载股票持仓…</div>;
  }
  if (error || !data) {
    return <div className="min-h-screen bg-[#FAF3ED] p-5"><button onClick={onBack} className="flex items-center text-sm text-gray-600"><ArrowLeft className="w-4 h-4 mr-1" />返回</button><div className="mt-10 text-center text-gray-500">股票标签无法加载：{error?.message || "请稍后重试"}</div></div>;
  }

  // A 股惯例：红涨绿跌。标签总账与“我的参与”必须各自使用独立口径。
  // 成员页的整体行情仍可读取标签的公开市场数据，但“持仓编号”必须只列出
  // 当前成员已经分配、已到开始日期且仍有持仓的批次。不能用标签全量 lots 直接渲染。
  const visibleMemberLots = participantView
    ? (((data as any)?.positions || []) as any[]).flatMap((position: any) => position.lots || [])
    : [];
  const myHoldingByLotId = new Map<number, { quantity: number; costValue: number }>();
  for (const participation of visibleMemberLots) {
    const lotId = Number(participation.lotId ?? participation.id);
    const quantity = Number(participation.remainingQuantity ?? participation.quantity ?? 0);
    if (!lotId || quantity <= 0) continue;
    const current = myHoldingByLotId.get(lotId) || { quantity: 0, costValue: 0 };
    current.quantity += quantity;
    current.costValue += quantity * Number(participation.entryPrice ?? participation.unitCost ?? 0);
    myHoldingByLotId.set(lotId, current);
  }
  // 成员只能查看标签有哪些当前股票和各批次成交信息；标签总市值、总股数、成本及总盈亏不对成员公开。
  const allTagHoldingLots = tagPositions.flatMap((position: any) => (position.lots || []).map((lot: any) => {
    const myHolding = myHoldingByLotId.get(Number(lot.id));
    const marketPrice = position.marketPrice;
    const myMarketValue = !myHolding || marketPrice === null || marketPrice === undefined ? null : myHolding.quantity * Number(marketPrice);
    const accountCostValue = Number(lot.quantity || 0) * Number(lot.unitCost || 0);
    const accountMarketValue = marketPrice === null || marketPrice === undefined ? null : Number(lot.quantity || 0) * Number(marketPrice);
    return {
      position,
      symbol: position.symbol,
      stockName: position.stockName,
      marketPrice,
      quoteDate: position.quoteDate,
      quoteUpdatedAt: position.quoteUpdatedAt,
      lot,
      priceChange: marketPrice === null || marketPrice === undefined ? null : Number(marketPrice) - Number(lot.unitCost || 0),
      priceChangePercent: marketPrice === null || marketPrice === undefined || !Number(lot.unitCost) ? null : (Number(marketPrice) - Number(lot.unitCost)) / Number(lot.unitCost),
      myHolding: myHolding ? {
        quantity: myHolding.quantity,
        entryPrice: myHolding.quantity > 0 ? myHolding.costValue / myHolding.quantity : null,
        marketValue: myMarketValue,
        requiredMargin: myMarketValue === null ? null : myMarketValue * 0.2,
        floatingPnl: myMarketValue === null ? null : myHolding.costValue - myMarketValue,
      } : null,
      accountHolding: {
        quantity: Number(lot.quantity || 0),
        costValue: accountCostValue,
        marketValue: accountMarketValue,
        floatingPnl: accountMarketValue === null ? null : accountMarketValue - accountCostValue,
      },
    };
  })).map((holding: any, index: number) => ({ ...holding, positionNumber: index + 1 }));
  const tagHoldingLots = allTagHoldingLots.filter((holding: any) => !participantView || Number(holding.myHolding?.quantity || 0) > 0);
  const memberHoldingSummary = participantView ? (() => {
    const hasUnpricedHolding = tagHoldingLots.some((holding: any) => holding.myHolding?.marketValue === null || holding.myHolding?.marketValue === undefined);
    const purchaseValue = tagHoldingLots.reduce((total: number, holding: any) => (
      total + Number(holding.myHolding?.quantity || 0) * Number(holding.myHolding?.entryPrice || 0)
    ), 0);
    const marketValue = hasUnpricedHolding
      ? null
      : tagHoldingLots.reduce((total: number, holding: any) => total + Number(holding.myHolding?.marketValue || 0), 0);
    const floatingPnl = marketValue === null ? null : purchaseValue - marketValue;
    const floatingPnlPercent = floatingPnl === null || purchaseValue <= 0 ? null : floatingPnl / purchaseValue;
    return {
      positionNumbers: tagHoldingLots.map((holding: any) => String(holding.positionNumber).padStart(2, "0")),
      purchaseValue,
      marketValue,
      requiredMargin: marketValue === null ? null : marketValue * 0.2,
      floatingPnl,
      floatingPnlPercent,
      details: tagHoldingLots.map((holding: any) => {
        const quantity = Number(holding.myHolding?.quantity || 0);
        const entryPrice = Number(holding.myHolding?.entryPrice || 0);
        const purchaseValue = quantity * entryPrice;
        const currentPrice = holding.marketPrice === null || holding.marketPrice === undefined ? null : Number(holding.marketPrice);
        const currentValue = holding.myHolding?.marketValue === null || holding.myHolding?.marketValue === undefined
          ? null
          : Number(holding.myHolding.marketValue);
        return {
          positionNumber: String(holding.positionNumber).padStart(2, "0"),
          stockName: String(holding.stockName || "股票"),
          symbol: String(holding.symbol || ""),
          quantity,
          entryPrice,
          purchaseValue,
          currentPrice,
          currentValue,
          floatingPnl: currentValue === null ? null : purchaseValue - currentValue,
        };
      }),
    };
  })() : null;
  // 管理员使用标签全部仍持有批次的真实成本与市值口径；与成员个人对赌口径分开，
  // 但保持同一套红色汇总信息结构，便于在两个视图间快速核对。
  const accountHoldingSummary = !participantView ? (() => {
    const hasUnpricedHolding = tagHoldingLots.some((holding: any) => holding.accountHolding?.marketValue === null || holding.accountHolding?.marketValue === undefined);
    const purchaseValue = tagHoldingLots.reduce((total: number, holding: any) => total + Number(holding.accountHolding?.costValue || 0), 0);
    const marketValue = hasUnpricedHolding
      ? null
      : tagHoldingLots.reduce((total: number, holding: any) => total + Number(holding.accountHolding?.marketValue || 0), 0);
    const floatingPnl = marketValue === null ? null : marketValue - purchaseValue;
    const floatingPnlPercent = floatingPnl === null || purchaseValue <= 0 ? null : floatingPnl / purchaseValue;
    return {
      positionNumbers: tagHoldingLots.map((holding: any) => String(holding.positionNumber).padStart(2, "0")),
      purchaseValue,
      marketValue,
      requiredMargin: marketValue === null ? null : marketValue * 0.2,
      floatingPnl,
      floatingPnlPercent,
      details: tagHoldingLots.map((holding: any) => {
        const quantity = Number(holding.accountHolding?.quantity || 0);
        const entryPrice = Number(holding.lot?.unitCost || 0);
        const purchaseValue = Number(holding.accountHolding?.costValue || 0);
        const currentPrice = holding.marketPrice === null || holding.marketPrice === undefined ? null : Number(holding.marketPrice);
        const currentValue = holding.accountHolding?.marketValue === null || holding.accountHolding?.marketValue === undefined
          ? null
          : Number(holding.accountHolding.marketValue);
        return {
          positionNumber: String(holding.positionNumber).padStart(2, "0"),
          stockName: String(holding.stockName || "股票"),
          symbol: String(holding.symbol || ""),
          quantity,
          entryPrice,
          purchaseValue,
          currentPrice,
          currentValue,
          floatingPnl: currentValue === null ? null : currentValue - purchaseValue,
        };
      }),
    };
  })() : null;
  const holdingSummary = participantView ? memberHoldingSummary : accountHoldingSummary;
  const holdingSummaryPnlLabel = participantView ? "总浮动盈亏" : "账户浮动盈亏";
  const holdingSummaryCostLabel = participantView ? "参与买入市值" : "账户持仓成本";
  const allocationMembersById = new Map<number, any>(
    (((allocationMatrixQuery.data as any)?.members || []) as any[]).map((member) => [Number(member.userId), member]),
  );
  const allocationLotById = new Map<number, any>(
    (((allocationMatrixQuery.data as any)?.lots || []) as any[]).map((lot) => [Number(lot.id), lot]),
  );
  // Preview is proxied to production while this page is still unshipped, so use
  // the authenticated browser identity as the immediate fallback for “我”.
  const viewerUserId = Number((data as any)?.viewerUserId || currentUser?.id || 0);

  const renderHoldingTables = () => {
    if (tagHoldingLots.length === 0) {
      return <div className="py-8 text-center text-sm text-gray-400">标签暂无有效持仓</div>;
    }
    return <div className="space-y-3">{tagHoldingLots.map((holding: any) => {
      const changeTone = Number(holding.priceChange || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]";
      const ownerHolding = holding.accountHolding;
      const personalHolding = holding.myHolding;
      const currentLotAllocations = ((allocationLotById.get(Number(holding.lot.id))?.participations || []) as any[])
        .filter((allocation) => Number(allocation.remainingQuantity || 0) > 0)
        .map((allocation) => ({
          ...allocation,
          userId: Number(allocation.userId),
          quantity: Number(allocation.remainingQuantity || 0),
          memberName: String(allocationMembersById.get(Number(allocation.userId))?.name || `用户${allocation.userId}`),
        }));
      const myAllocation = currentLotAllocations.find((allocation) => allocation.userId === viewerUserId) || null;
      // The administrator's view is a single allocation ledger: every active member
      // appears in descending share order, with the current administrator marked “我”.
      const sortedAllocations = [...currentLotAllocations].sort((left, right) =>
        right.quantity - left.quantity || left.memberName.localeCompare(right.memberName, "zh-CN"),
      );
      const allocatedQuantity = sortedAllocations.reduce((total, allocation) => total + allocation.quantity, 0);
      const allocationPercent = (quantity: number) => ownerHolding.quantity > 0 ? (quantity / ownerHolding.quantity) * 100 : 0;
      const allocationRate = allocationPercent(allocatedQuantity);
      const remainingForAllocation = Math.max(0, ownerHolding.quantity - allocatedQuantity);
      const allocatedEntryValue = sortedAllocations.reduce(
        (total, allocation) => total + allocation.quantity * Number(allocation.entryPrice || 0),
        0,
      );
      const hasUnpricedAllocation = sortedAllocations.some((allocation) =>
        allocation.floatingPnl === null || allocation.floatingPnl === undefined,
      );
      const allocatedFloatingPnl = hasUnpricedAllocation
        ? null
        : sortedAllocations.reduce((total, allocation) => total + Number(allocation.floatingPnl || 0), 0);
      const allocatedFloatingPnlTone = Number(allocatedFloatingPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]";
      const holdingPnl = participantView ? personalHolding?.floatingPnl : ownerHolding?.floatingPnl;
      const holdingPnlTone = Number(holdingPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]";
      const positionNumber = String(holding.positionNumber).padStart(2, "0");
      const lotId = Number(holding.lot.id);
      // The local hot preview proxies reads to the currently deployed API. Until the new
      // lot-note field is deployed, show the existing opening-event note as a read-only
      // compatibility fallback. Once the backend returns `lot.note`, even an intentional
      // empty note remains empty and never falls back to historical audit text.
      const hasLotNoteField = Object.prototype.hasOwnProperty.call(holding.lot, "note");
      const openingAuditNote = !hasLotNoteField ? String(historyRows.find((event: any) => (
        (event.type === "buy" || event.type === "add")
        && event.status === "active"
        && event.symbol === holding.symbol
        && Math.abs(Number(event.executionPrice || 0) - Number(holding.lot.unitCost || 0)) < 0.00000001
        && new Date(event.actualTradedAt || 0).getTime() === new Date(holding.lot.openedAt || 0).getTime()
      ))?.note || "") : "";
      const lotNote = hasLotNoteField ? String(holding.lot.note ?? "") : openingAuditNote;
      const isEditingLotNote = canEdit && editingLotNoteId === lotId;
      // 管理员默认只看每个持仓编号的核心行情；成员保持原有完整只读页。
      const isAdminLotExpanded = !canEdit || expandedAdminLotIds.has(lotId);
      return <div key={`${holding.symbol}-${holding.lot.id}`}>
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-gray-500">
          <span>持仓编号 {positionNumber}</span>
          {canEdit && <div className="flex items-center gap-2"><button type="button" onClick={() => setSelectedPosition(holding.position)} className="text-[#C62828]">审计</button><button type="button" aria-label={isAdminLotExpanded ? `收起持仓编号 ${positionNumber}` : `展开持仓编号 ${positionNumber}`} title={isAdminLotExpanded ? "收起详情" : "展开详情"} onClick={() => setExpandedAdminLotIds((previous) => { const next = new Set(previous); if (next.has(lotId)) next.delete(lotId); else next.add(lotId); return next; })} className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"><ChevronDown size={15} className="transition-transform" style={{ transform: isAdminLotExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} /></button></div>}
        </div>
        <div className="relative overflow-hidden rounded-[3px] border border-[#D9D9D9] bg-white text-xs">
          <div className="flex items-center justify-between gap-3 border-b border-[#E6E6E6] px-2.5 py-2.5">
            <div className="min-w-0 truncate"><span className="font-semibold text-[#222222]">{holding.stockName}</span><span className="ml-1 font-normal text-gray-400">{holding.symbol}</span></div>
            <div className="shrink-0 text-right"><span className="text-[11px] text-gray-400">买入时间</span><span className="ml-1 font-medium text-[#222222]">{formatDateTime(holding.lot.openedAt)}</span></div>
          </div>
          {!participantView && canEdit && !isAdminLotExpanded && <div className="grid grid-cols-4 bg-[#FCFCFC]"><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">持仓</div><div className="mt-0.5 truncate font-medium text-[#222222]">{formatQuantity(ownerHolding.quantity)} 股</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">均价</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(holding.lot.unitCost)}</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">当前价</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(holding.marketPrice)}</div></div><div className="min-w-0 px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">浮动盈亏</div><div className={`mt-0.5 truncate font-medium ${holdingPnlTone}`}>{ownerHolding.floatingPnl === null ? "—" : signedMoney(ownerHolding.floatingPnl)}</div></div></div>}
          {(participantView || isAdminLotExpanded) && <>
          {!participantView && canEdit && <div className="border-b border-[#E6E6E6] bg-[#FFFDFC] px-2.5 py-2">
            {isEditingLotNote ? <div className="space-y-1.5"><div className="text-[11px] font-medium text-gray-600">持仓编号 {positionNumber} 备注</div><textarea value={lotNoteDraft} onChange={(event) => setLotNoteDraft(event.target.value.slice(0, 3000))} maxLength={3000} rows={2} placeholder="填写本持仓编号的备注" disabled={updateLotNoteMutation.isPending} className="w-full resize-none rounded-md border border-[#E4D8D0] bg-white px-2 py-1.5 text-xs text-[#333333] outline-none placeholder:text-gray-400 focus:border-[#C62828] disabled:opacity-60" /><div className="flex justify-end gap-2"><button type="button" onClick={cancelLotNoteEdit} disabled={updateLotNoteMutation.isPending} className="h-7 rounded-md px-2.5 text-[11px] text-gray-500 disabled:opacity-50">取消</button><button type="button" onClick={() => saveLotNote(lotId)} disabled={updateLotNoteMutation.isPending} className="h-7 rounded-md bg-[#C62828] px-2.5 text-[11px] font-medium text-white disabled:opacity-60">{updateLotNoteMutation.isPending ? "保存中" : "保存备注"}</button></div></div> : <div className="flex items-start gap-2"><span className="shrink-0 text-[11px] text-gray-400">批次备注</span><span className={lotNote ? "min-w-0 flex-1 break-words text-xs text-[#333333]" : "min-w-0 flex-1 text-xs text-gray-400"}>{lotNote || "未填写"}</span><button type="button" onClick={() => beginLotNoteEdit(lotId, lotNote)} className="shrink-0 text-[11px] text-[#C62828] underline underline-offset-2">编辑</button></div>}
          </div>}
          <div className="grid grid-cols-4">
            <div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">买入价</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(holding.lot.unitCost)}</div></div>
            <div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">当前价</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(holding.marketPrice)}</div></div>
            <div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">当前涨跌</div><div className={`mt-0.5 truncate font-medium ${changeTone}`}>{holding.priceChange === null ? "—" : signedMoney(holding.priceChange)}</div></div>
            <div className="min-w-0 px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">涨跌幅</div><div className={`mt-0.5 truncate font-medium ${changeTone}`}>{holding.priceChangePercent === null ? "—" : `${holding.priceChangePercent >= 0 ? "+" : ""}${(holding.priceChangePercent * 100).toFixed(2)}%`}</div></div>
          </div>
          {participantView ? personalHolding && <div className="border-t border-[#D9D9D9] bg-white"><div className="flex items-center justify-between gap-3 border-b border-[#E6E6E6] px-2.5 py-2"><span className="flex min-w-0 items-center gap-1.5"><span className="font-semibold text-[#222222]">我的持仓</span><span className="whitespace-nowrap text-[10px] text-gray-400">{formatQuoteUpdate(holding.quoteUpdatedAt)}</span></span><span className="shrink-0 text-[11px] text-gray-500">所需保证金 <b className="ml-0.5 font-semibold text-[#C62828]">{money(personalHolding.requiredMargin)}</b></span></div><div className="grid grid-cols-4"><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">我的买入价</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(personalHolding.entryPrice)}</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">持仓数量</div><div className="mt-0.5 truncate font-medium text-[#222222]">{formatQuantity(personalHolding.quantity)} 股</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">持仓价值</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(personalHolding.marketValue)}</div></div><div className="min-w-0 px-1.5 py-2.5 text-center"><button type="button" onClick={() => setShowPnlFormula(true)} className="border-b border-dashed border-gray-400 pb-px whitespace-nowrap text-[11px] text-gray-400 hover:border-[#C62828] hover:text-[#C62828]" aria-label={`查看持仓编号 ${positionNumber} 的浮动盈亏计算公式`}>浮动盈亏</button><div className={`mt-0.5 truncate font-medium ${holdingPnlTone}`}>{personalHolding.floatingPnl === null ? "—" : signedMoney(personalHolding.floatingPnl)}</div></div></div></div> : <><div className="border-t border-[#D9D9D9] bg-white"><div className="flex items-center justify-between gap-3 border-b border-[#E6E6E6] px-2.5 py-2"><span className="font-semibold text-[#222222]">账户持仓</span><span className="shrink-0 text-[11px] text-gray-500">所需保证金 <b className="ml-0.5 font-semibold text-[#C62828]">{money(ownerHolding.marketValue === null ? null : ownerHolding.marketValue * 0.2)}</b></span></div><div className="grid grid-cols-4"><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">持仓数量</div><div className="mt-0.5 truncate font-medium text-[#222222]">{formatQuantity(ownerHolding.quantity)} 股</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">持仓成本</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(ownerHolding.costValue)}</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">持仓价值</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(ownerHolding.marketValue)}</div></div><div className="min-w-0 px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">浮动盈亏</div><div className={`mt-0.5 truncate font-medium ${holdingPnlTone}`}>{ownerHolding.floatingPnl === null ? "—" : signedMoney(ownerHolding.floatingPnl)}</div></div></div></div>{canEdit && <div className="border-t border-[#D9D9D9] bg-[#FFFDFC]">
            <div className="flex items-start justify-between gap-3 border-b border-[#E6E6E6] px-2.5 py-2">
              <span className="pt-0.5 font-semibold text-[#222222]">份额分配</span>
              <div className="text-right text-[11px] leading-5 text-gray-500">
                <div>已分配 <b className="font-semibold text-[#222222]">{formatQuantity(allocatedQuantity)} / {formatQuantity(ownerHolding.quantity)} 股</b></div>
                <div>分配率 <b className="font-semibold text-[#C62828]">{allocationRate.toFixed(0)}%</b> · 余量 {formatQuantity(remainingForAllocation)} 股</div>
                <div>持仓成本 <b className="font-semibold text-[#222222]">{money(allocatedEntryValue)}</b></div>
                <div>总浮动盈亏 <b className={`font-semibold ${allocatedFloatingPnlTone}`}>{allocatedFloatingPnl === null ? "—" : signedMoney(allocatedFloatingPnl)}</b></div>
              </div>
            </div>
            {allocationMatrixQuery.isLoading ? <div className="px-2.5 py-3 text-[11px] text-gray-400">正在载入成员份额…</div> : <div className="divide-y divide-[#EEE8E4]">
              <div className="bg-[#FFF9F7] px-2.5 py-1.5 text-[11px] text-gray-500">成员份额（按当前股数由多到少）</div>
              {sortedAllocations.map((allocation) => {
                const isMine = allocation.userId === viewerUserId;
                const allocationPnlTone = Number(allocation.floatingPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]";
                return <div key={allocation.id} className={`flex items-center justify-between gap-3 px-2.5 py-2 ${isMine ? "bg-[#FFF6F4]" : ""}`}>
                  <span className={`min-w-0 truncate ${isMine ? "font-medium text-[#C62828]" : "text-[#333333]"}`}>{allocation.memberName}{isMine && <span className="ml-1 text-[10px]">（我）</span>}</span>
                  <span className="shrink-0 whitespace-nowrap text-right"><span className="block"><b className="font-medium text-[#222222]">{formatQuantity(allocation.quantity)} 股</b><span className="mx-1 text-[11px] text-gray-500">·</span><span className="text-[11px] text-gray-500">{allocationPercent(allocation.quantity).toFixed(0)}%</span><span className="mx-1 text-[11px] text-gray-500">·</span><span className="text-[11px] text-gray-500">持仓成本 {money(allocation.quantity * Number(allocation.entryPrice || 0))}</span></span><span className={`mt-0.5 block text-[11px] ${allocationPnlTone}`}>本批浮动盈亏 {allocation.floatingPnl === null ? "—" : signedMoney(allocation.floatingPnl)}</span></span>
                </div>;
              })}
              {sortedAllocations.length === 0 && <div className="px-2.5 py-2 text-[11px] text-gray-400">当前尚未给任何成员分配本批次</div>}
              {!myAllocation && <div className="px-2.5 py-2 text-[11px] text-gray-400">我的份额：0 股（0%）</div>}
            </div>}
          </div>}</>}
          </>}
          {snapshotStamp && <div aria-label={snapshotStamp} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><div className="flex -rotate-12 flex-col items-center rounded-xl border-2 border-[#2586B8]/20 bg-[#E8F6FC]/5 px-4 py-2 text-center text-[#2378A7]/20 opacity-[0.55]"><BadgeCheck className="h-6 w-6" strokeWidth={1.8} /><span className="mt-0.5 text-xs font-bold tracking-[0.14em]">盘尾已结算</span><span className="mt-0.5 text-[9px] font-medium tracking-wide">{snapshotStamp}</span></div></div>}
        </div>
      </div>;
    })}</div>;
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-8">
      <header className="sticky top-0 z-20 bg-[#D32F2F] text-white px-4 pt-3 pb-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="返回"><ArrowLeft className="w-5 h-5" /></button>
          <div className="min-w-0 flex-1"><div className="text-base font-semibold truncate">{categoryName}</div><div className="text-[11px] text-white/75">A 股账户 · {participantView ? "成员只读查看" : canEdit ? "管理员维护" : "只读查看"}</div></div>
          {canEdit && <button onClick={() => openAction("buy")} className="rounded-full bg-white text-[#D32F2F] p-2 shadow-sm" aria-label="新增成交"><Plus className="w-5 h-5" /></button>}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-3 pt-3 space-y-3">
        <section className="overflow-hidden rounded-2xl border border-[#F1E6DE] bg-white shadow-sm">
          <div className="bg-[#D32F2F] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="truncate text-sm font-semibold text-white">{accountName}整体持仓</div><div className="mt-0.5 text-[11px] text-white/75">{participantView ? `${accountName}全部 A 股持仓，不等同于您的个人份额` : `${accountName}全部 A 股持仓 · 管理员维护视图`}</div></div>
              <span className="shrink-0 rounded-full bg-white/15 px-2 py-1 text-[10px] text-white">{participantView ? `${accountName}总览` : "账户总览"}</span>
            </div>
            {holdingSummary && <div className="mt-2 border-t border-white/20 pt-2">
              <div className="flex items-center justify-between gap-3 text-[11px]"><span className="shrink-0 text-white/70">{participantView ? "当前参与持仓编号" : "当前账户持仓编号"}</span><div className="flex flex-wrap justify-end gap-1.5">{holdingSummary.positionNumbers.length > 0 ? holdingSummary.positionNumbers.map((positionNumber: string) => <span key={positionNumber} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/80 text-[10px] font-bold leading-none text-[#9F1D1D]" style={{ background: "radial-gradient(circle at 31% 24%, #FFFFFF 0%, #FFFFFF 12%, #FFF7F7 13%, #FFD8D8 48%, #F09D9D 74%, #B71C1C 100%)", boxShadow: "inset 1px 1px 2px rgba(255,255,255,.95), inset -2px -2px 3px rgba(125,20,20,.42), 0 2px 3px rgba(77,12,12,.30)" }}>{positionNumber}</span>) : <span className="font-semibold text-white">—</span>}</div></div>
              <div className="mt-2 grid grid-cols-3 divide-x divide-white/20 rounded-md bg-black/10 text-center text-[10px]">
                <div className="px-1.5 py-1.5"><div className="text-white/65">{holdingSummaryCostLabel}</div><div className="mt-0.5 truncate font-semibold text-white">{money(holdingSummary.purchaseValue)}</div></div>
                <div className="px-1.5 py-1.5"><div className="text-white/65">当前持仓价值</div><div className="mt-0.5 truncate font-semibold text-white">{money(holdingSummary.marketValue)}</div></div>
                <div className="px-1.5 py-1.5"><div className="text-white/65">所需保证金</div><div className="mt-0.5 truncate font-semibold text-white">{money(holdingSummary.requiredMargin)}</div></div>
              </div>
              <div className={`mt-1 grid ${participantView ? "grid-cols-2" : "grid-cols-3"} divide-x divide-[#F2D0D0] rounded-md border border-white/60 bg-white text-center text-[10px] shadow-sm`}>
                <div className="px-2 py-1.5"><button type="button" onClick={() => setShowPnlFormula(true)} className="border-b border-dashed border-gray-400 pb-px text-gray-500 hover:border-[#C62828] hover:text-[#C62828]" aria-label={`查看${holdingSummaryPnlLabel}计算公式`}>{holdingSummaryPnlLabel}</button><div className={`mt-0.5 truncate font-semibold ${holdingSummary.floatingPnl === null ? "text-gray-500" : holdingSummary.floatingPnl >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{holdingSummary.floatingPnl === null ? "—" : signedMoney(holdingSummary.floatingPnl)}</div></div>
                <div className="px-2 py-1.5"><div className="text-gray-500">盈亏幅度</div><div className={`mt-0.5 truncate font-semibold ${holdingSummary.floatingPnlPercent === null ? "text-gray-500" : holdingSummary.floatingPnlPercent >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{holdingSummary.floatingPnlPercent === null ? "—" : `${holdingSummary.floatingPnlPercent >= 0 ? "+" : ""}${(holdingSummary.floatingPnlPercent * 100).toFixed(2)}%`}</div></div>
                {!participantView && <div className="px-2 py-1.5"><button type="button" onClick={openDailyPnlHistory} className="border-b border-dashed border-gray-400 pb-px text-gray-500 hover:border-[#C62828] hover:text-[#C62828]" aria-label="查看每日盈亏记录">当日盈亏</button><div className={`mt-0.5 truncate font-semibold ${dailyPnlFromSnapshots === null ? "text-gray-500" : dailyPnlFromSnapshots >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{dailyPnlFromSnapshots === null ? "—" : signedMoney(dailyPnlFromSnapshots)}</div></div>}
              </div>
            </div>}
          </div>
          {!tagData ? (
            <div className="px-4 py-7 text-center text-xs text-gray-400"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />正在载入标签整体持仓…</div>
          ) : (
            <>
              {canEdit && <div className="grid grid-cols-5 gap-px border-b border-[#F1E6DE] bg-[#F1E6DE]">{(["buy", "add", "reduce", "sell", "note"] as EventType[]).map((type) => <button key={type} onClick={() => openAction(type)} className="bg-white px-1 py-2 text-xs font-medium text-[#C62828] hover:bg-[#FFF6F4]">{eventLabels[type]}</button>)}</div>}
              <div className="relative px-4 py-2.5">
                {renderHoldingTables()}
              </div>
            </>
          )}
        </section>

        <div className="space-y-3">








        <section className={participantView ? "border-t border-[#F1E6DE]" : "overflow-hidden rounded-xl border border-[#E4EAF0] bg-white shadow-sm"}>
          <button onClick={() => setShowHistory((value) => !value)} className="w-full px-3 py-3 flex items-center justify-between text-sm font-semibold text-[#222222]"><span className="flex items-center gap-1.5"><History className="w-4 h-4 text-gray-500" />{participantView ? "标签完整操作历史" : "完整操作历史"} ({historyRows.length})</span>{showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
          {showHistory && <div className="border-t divide-y divide-gray-100">{historyRows.map((event: any) => <div key={event.id} className={`px-3 py-3 ${event.status === "voided" ? "bg-gray-50 opacity-75" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] ${eventTone[event.type as EventType]}`}>{eventLabels[event.type as EventType]}</span>{event.status === "voided" && <span className="text-[10px] text-gray-500">已作废</span>}<span className="text-xs font-medium text-[#222222] truncate">{event.stockName || "运营备注"}{event.symbol ? ` ${event.symbol}` : ""}</span></div><div className="mt-1 text-[11px] text-gray-500">实际：{formatDateTime(event.actualTradedAt)} · 登记：{formatDateTime(event.serverRegisteredAt)}</div>{event.note && <div className="mt-1 text-[11px] text-gray-600 break-words">{event.note}</div>}{event.status === "voided" && event.voidReason && <div className="mt-1 text-[11px] text-[#C62828]">作废原因：{event.voidReason}</div>}</div><div className="shrink-0 text-right text-xs text-gray-600">{event.quantity !== null ? <>{!participantView && <div>{formatQuantity(event.quantity)} 股</div>}<div className={participantView ? "font-medium text-[#222222]" : "mt-1"}>{money(event.executionPrice)}</div></> : null}{canEdit && event.status === "active" && <div className="mt-2 flex justify-end gap-2"><button onClick={() => openCorrection(event)} className="text-[11px] text-[#1565C0] underline">更正</button><button onClick={() => requestVoid(event)} disabled={voidEventMutation.isPending} className="text-[11px] text-[#C62828] underline">作废</button></div>}</div></div></div>)}</div>}
        </section>
        </div>
      </main>

      <Dialog open={showDailyPnlHistory} onOpenChange={setShowDailyPnlHistory}>
        <DialogContent className="max-h-[86vh] max-w-md overflow-y-auto px-4 pb-6">
          <DialogHeader><DialogTitle className="text-left">每日盈亏记录</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="rounded-xl border border-[#F1D8D8] bg-[#FFF8F8] px-3 py-2.5 text-[11px] leading-5 text-gray-600">当日盈亏 = 当天盘尾累计盈亏 − 上一有效盘尾累计盈亏。新开仓、加仓或减仓的本金变动不会计入当日盈亏；首个有效盘尾以 0 为比较基准。</div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs"><span className="font-semibold text-[#333333]">盘尾净值记录</span><span className="text-[10px] text-gray-400">最新在上 · 仅有效交易日</span></div>
              {dailySnapshotsQuery.isLoading ? <div className="rounded-lg bg-[#F7F7F7] px-3 py-3 text-center text-xs text-gray-400"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />正在载入盘尾记录…</div> : dailyPnlHistoryRecords.length > 0 ? <div className="divide-y overflow-hidden rounded-xl border border-[#ECE6E2] bg-white">{dailyPnlHistoryRecords.map((record) => <div key={record.date} className="px-3 py-2.5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-[#333333]">{record.date}<span className="ml-1.5 text-[10px] font-normal text-gray-400">15:05 盘尾</span></div><div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-gray-400"><span>累计盈亏 {signedMoney(record.totalPnl)}</span><span>持仓市值 {money(record.marketValue)}</span><span>持仓成本 {money(record.costValue)}</span></div></div><div className="shrink-0 text-right"><div className="text-[10px] text-gray-400">当日盈亏</div><div className={`mt-0.5 text-sm font-bold ${record.dailyPnl >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{signedMoney(record.dailyPnl)}</div></div></div></div>)}</div> : <div className="rounded-lg bg-[#F7F7F7] px-3 py-3 text-center text-xs text-gray-400">暂无有效盘尾记录</div>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPnlFormula} onOpenChange={setShowPnlFormula}>
        <DialogContent className="max-h-[82vh] max-w-md overflow-y-auto px-4 pb-6">
          <DialogHeader><DialogTitle className="text-left">浮动盈亏推导</DialogTitle></DialogHeader>
          {holdingSummary && <div className="space-y-3 pt-1">
            <div className="rounded-xl border border-[#F1D8D8] bg-[#FFF8F8] px-3 py-2.5">
              <div className="text-xs font-semibold text-[#742020]">总公式</div>
              <div className="mt-1 text-[11px] leading-5 text-gray-600">{participantView ? "总浮动盈亏 = 所有参与批次的买入市值 − 所有参与批次的当前持仓价值" : "账户浮动盈亏 = 全部当前持仓价值 − 全部持仓成本"}</div>
              <div className="mt-2 grid grid-cols-3 divide-x divide-[#F2DDDD] rounded-lg border border-[#F2DDDD] bg-white text-center text-[10px]">
                <div className="px-1.5 py-1.5"><div className="text-gray-500">{participantView ? "买入市值" : "持仓成本"}</div><div className="mt-0.5 font-semibold text-[#222222]">{money(holdingSummary.purchaseValue)}</div></div>
                <div className="px-1.5 py-1.5"><div className="text-gray-500">当前价值</div><div className="mt-0.5 font-semibold text-[#222222]">{money(holdingSummary.marketValue)}</div></div>
                <div className="px-1.5 py-1.5"><div className="text-gray-500">{holdingSummaryPnlLabel}</div><div className={`mt-0.5 font-semibold ${holdingSummary.floatingPnl === null ? "text-gray-500" : holdingSummary.floatingPnl >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{holdingSummary.floatingPnl === null ? "—" : signedMoney(holdingSummary.floatingPnl)}</div></div>
              </div>
              <div className="mt-2 text-center text-[11px] text-gray-500">盈亏幅度：{holdingSummary.floatingPnlPercent === null ? "—" : `${holdingSummary.floatingPnlPercent >= 0 ? "+" : ""}${(holdingSummary.floatingPnlPercent * 100).toFixed(2)}%`}</div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-semibold text-[#333333]">按{participantView ? "参与" : "账户"}持仓编号逐笔推导</div>
              <div className="space-y-2">
                {holdingSummary.details.map((detail: any) => <div key={detail.positionNumber} className="rounded-xl border border-[#E8E8E8] bg-white p-3 text-[11px]">
                  <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-1.5"><span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#EDB6B6] bg-[#FFF5F5] text-[9px] font-bold text-[#A42222]">{detail.positionNumber}</span><span className="truncate font-semibold text-[#222222]">{detail.stockName}</span><span className="shrink-0 text-gray-400">{detail.symbol}</span></div><span className={`shrink-0 font-semibold ${detail.floatingPnl === null ? "text-gray-400" : detail.floatingPnl >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{detail.floatingPnl === null ? "待报价" : signedMoney(detail.floatingPnl)}</span></div>
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-[#FAFAFA] px-2 py-1.5 text-gray-600"><div>买入：{formatQuantity(detail.quantity)} 股 × {money(detail.entryPrice)} = <b className="font-medium text-[#222222]">{money(detail.purchaseValue)}</b></div><div>当前：{detail.currentPrice === null ? "待更新" : `${formatQuantity(detail.quantity)} 股 × ${money(detail.currentPrice)} = ${money(detail.currentValue)}`}</div></div>
                  <div className="mt-1.5 text-gray-500">本批浮动盈亏 = {participantView ? `${money(detail.purchaseValue)} − ${detail.currentValue === null ? "当前持仓价值（待更新）" : money(detail.currentValue)}` : `${detail.currentValue === null ? "当前持仓价值（待更新）" : money(detail.currentValue)} − ${money(detail.purchaseValue)}`}{detail.floatingPnl === null ? "" : ` = ${signedMoney(detail.floatingPnl)}`}</div>
                </div>)}
              </div>
            </div>
            <div className="rounded-lg bg-[#F5F7FA] px-3 py-2 text-[10px] leading-4 text-gray-500">{participantView ? "按个人对应批次的买入价与当前盘尾报价计算；当前价格未更新的批次不会纳入总浮动盈亏。" : "按各股票批次的实际持仓成本与当前盘尾报价计算；当前价格未更新的批次不会纳入账户浮动盈亏。"}</div>
          </div>}
        </DialogContent>
      </Dialog>

      <Sheet open={!!selectedPosition} onOpenChange={(open) => !open && setSelectedPosition(null)}>
        <SheetContent side="bottom" className="max-h-[82vh] rounded-t-2xl overflow-y-auto px-4 pb-6">
          <SheetHeader><SheetTitle className="text-left">{selectedPosition?.stockName} <span className="ml-1 text-sm font-normal text-gray-500">{selectedPosition?.symbol}</span></SheetTitle></SheetHeader>
          {selectedPosition && <div className="mt-4 space-y-4"><div className="grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-[#FAF3ED] p-3"><div className="text-xs text-gray-500">当前市值</div><div className="mt-1 font-semibold">{money(selectedPosition.marketValue)}</div></div><div className="rounded-lg bg-[#FAF3ED] p-3"><div className="text-xs text-gray-500">浮动盈亏</div><div className={`mt-1 font-semibold ${Number(selectedPosition.floatingPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{signedMoney(selectedPosition.floatingPnl)}</div></div></div><div><div className="mb-2 text-sm font-semibold">持仓批次</div><div className="space-y-2">{selectedPosition.lots.map((lot: any) => <div key={lot.id} className="rounded-lg border border-gray-100 px-3 py-2 text-xs"><div className="flex justify-between"><span>{formatQuantity(lot.quantity)} 股 · 成本 {money(lot.unitCost)}</span><span className="text-gray-500">{formatDateTime(lot.openedAt)}</span></div></div>)}</div></div><div><div className="mb-2 text-sm font-semibold">审计证据</div><div className="space-y-2">{selectedHistory.map((event: any) => <div key={event.id} className="rounded-lg border border-gray-100 px-3 py-2 text-xs"><div className="flex justify-between gap-3"><span>{eventLabels[event.type as EventType]} · {event.quantity === null ? "备注" : `${formatQuantity(event.quantity)} 股 @ ${money(event.executionPrice)}`}</span><span className={event.status === "voided" ? "text-[#C62828]" : "text-gray-500"}>{event.status === "voided" ? "已作废" : "有效"}</span></div><div className="mt-1 text-gray-500">实际成交/接单：{formatDateTime(event.actualTradedAt)}</div><div className="text-gray-500">服务器登记：{formatDateTime(event.serverRegisteredAt)} · 管理员：{event.adminName}</div>{event.marketReferencePrice !== null && <div className="text-gray-500">登记时参考：{money(event.marketReferencePrice)} · {formatDateTime(event.marketReferenceAt)}</div>}</div>)}</div></div></div>}
        </SheetContent>
      </Sheet>

      <Dialog open={showActionDialog} onOpenChange={(open) => !open && closeActionDialog()}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{correctingEvent ? "更正股票操作" : "登记股票操作"}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1"><div className="grid grid-cols-5 gap-1">{(Object.keys(eventLabels) as EventType[]).map((type) => <button key={type} disabled={!!correctingEvent && type !== eventType} onClick={() => { setEventType(type); setSelectedStock(null); setSymbolQuery(""); }} className={`rounded-md px-1 py-2 text-xs ${eventType === type ? "bg-[#D32F2F] text-white" : "bg-gray-100 text-gray-600"} ${correctingEvent && type !== eventType ? "opacity-40" : ""}`}>{eventLabels[type]}</button>)}</div>
            {eventType !== "note" && <><div><Label>股票代码、名称或拼音</Label><div className="relative mt-1"><Input value={selectedStock ? `${selectedStock.name} ${selectedStock.symbol}` : symbolQuery} onChange={(event) => { setSelectedStock(null); setSymbolQuery(event.target.value); }} placeholder="如 600519、贵州茅台或 gzm" />{isSearchingStock && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-gray-400" />}</div>{!selectedStock && suggestions.length > 0 && <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white">{suggestions.map((stock: any) => <button key={stock.symbol} onClick={() => { setSelectedStock(stock); setSymbolQuery(""); if (stock.latestPrice) setExecutionPrice(String(stock.latestPrice)); }} className="w-full px-3 py-2.5 text-left border-b last:border-0 hover:bg-[#F4F8FF]"><span className="text-sm font-medium">{stock.name}</span><span className="ml-2 text-xs text-gray-500">{stock.symbol}</span>{stock.latestPrice ? <span className="float-right text-xs text-[#1565C0]">参考 {money(stock.latestPrice)}</span> : null}</button>)}</div>}{selectedStock && <div className="mt-1 text-[11px] text-[#1565C0]">已核验：{selectedStock.name} · {selectedStock.symbol}；登记时参考价由服务器留档。</div>}</div><div className="grid grid-cols-2 gap-3"><div><Label>实际成交价格</Label><Input inputMode="decimal" value={executionPrice} onChange={(event) => setExecutionPrice(event.target.value)} placeholder="0.00" className="mt-1" /></div><div><Label>实际成交数量</Label><Input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="股数" className="mt-1" /></div></div></>}
            <div><Label>实际成交 / 接单时间</Label><Input type="datetime-local" value={actualTradedAt} onChange={(event) => setActualTradedAt(event.target.value)} className="mt-1" /></div><div><Label>{eventType === "note" ? "备注内容" : "备注（可选）"}</Label><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder={eventType === "note" ? "记录说明、补录原因等" : "可填写成交说明或补录原因"} /></div>{correctingEvent && <div><Label>更正原因</Label><Input value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="例如：实际成交价更正" className="mt-1" /></div>}<div className="rounded-lg bg-[#FAF3ED] px-3 py-2 text-[11px] text-gray-600">服务器会自动记录登记时间与当时参考价；后续更正或作废只追加审计记录，不会覆盖原成交。</div><div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={closeActionDialog}>取消</Button><Button className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]" onClick={submitEvent} disabled={addEventMutation.isPending || correctEventMutation.isPending}>{addEventMutation.isPending || correctEventMutation.isPending ? "保存中…" : correctingEvent ? "确认更正" : `登记${eventLabels[eventType]}`}</Button></div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
