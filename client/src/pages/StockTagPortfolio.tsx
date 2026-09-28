import { useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, ChevronDown, ChevronUp, History, Loader2, Plus, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
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

function localInputTime(now = new Date()) {
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export default function StockTagPortfolio({ ledgerId, categoryId, categoryName, onBack, participantView = false }: Props) {
  const utils = trpc.useUtils();
  const globalPortfolioQuery = trpc.ledger.getStockTagPortfolio.useQuery(
    { ledgerId, categoryId },
    { enabled: !participantView, refetchOnWindowFocus: true, staleTime: 10_000 },
  );
  const publicPortfolioQuery = trpc.ledger.getStockTagPublicPortfolio.useQuery(
    { ledgerId: 37, categoryId },
    { enabled: participantView && ledgerId === 37, refetchOnWindowFocus: true, staleTime: 10_000 },
  );
  const memberPortfolioQuery = trpc.ledger.getMyStockTagParticipantPortfolio.useQuery(
    { ledgerId: 37, categoryId },
    { enabled: participantView && ledgerId === 37, refetchOnWindowFocus: true, staleTime: 10_000 },
  );
  const globalDailySnapshotsQuery = trpc.ledger.getStockTagDailySnapshots.useQuery(
    { ledgerId, categoryId },
    { enabled: !participantView, refetchOnWindowFocus: true, staleTime: 10_000 },
  );
  const data = participantView ? memberPortfolioQuery.data : globalPortfolioQuery.data;
  const isLoading = participantView ? memberPortfolioQuery.isLoading : globalPortfolioQuery.isLoading;
  const error = participantView ? memberPortfolioQuery.error : globalPortfolioQuery.error;
  const tagData = (participantView ? publicPortfolioQuery.data : globalPortfolioQuery.data) as any;
  const tagSummary = tagData?.summary;
  const tagPositions = tagData?.positions || [];
  // 只有15:05盘尾任务已为某日成功写入有效快照时，才显示日结印章；不以前端当前时间伪造结算。
  const settledSnapshot = participantView ? (memberPortfolioQuery.data as any)?.summary?.latestSnapshot : tagSummary?.latestSnapshot;
  const snapshotStamp = settledSnapshot?.snapshotDate ? `${settledSnapshot.snapshotDate} · 15:05 盘尾快照` : null;
  const dailySnapshots = participantView
    ? ((memberPortfolioQuery.data as any)?.dailySnapshots || [])
    : (globalDailySnapshotsQuery.data || []);
  const [query, setQuery] = useState("");
  const [showCurrent, setShowCurrent] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [showDailySnapshots, setShowDailySnapshots] = useState(false);
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
    },
    onError: (error) => toast.error(`登记失败：${error.message}`),
  });

  const voidEventMutation = trpc.ledger.voidStockTagEvent.useMutation({
    onSuccess: () => {
      toast.success("操作已作废，原始审计记录仍会保留");
      void utils.ledger.getStockTagPortfolio.invalidate({ ledgerId, categoryId });
      void utils.ledger.getMyStockTagParticipantPortfolio.invalidate({ ledgerId: 37, categoryId });
    },
    onError: (error) => toast.error(`作废失败：${error.message}`),
  });

  const correctEventMutation = trpc.ledger.correctStockTagEvent.useMutation({
    onSuccess: () => {
      toast.success("更正已追加；原始操作已保留为作废审计记录");
      closeActionDialog();
      void utils.ledger.getStockTagPortfolio.invalidate({ ledgerId, categoryId });
      void utils.ledger.getMyStockTagParticipantPortfolio.invalidate({ ledgerId: 37, categoryId });
    },
    onError: (error) => toast.error(`更正失败：${error.message}`),
  });

  const filteredPositions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = (data as any)?.positions || [];
    if (!normalized) return rows;
    return rows.filter((row: any) => `${row.symbol} ${row.stockName}`.toLowerCase().includes(normalized));
  }, [data, query]);

  const filteredHistory = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = (data as any)?.history || [];
    if (!normalized) return rows;
    return rows.filter((row: any) => `${row.symbol || ""} ${row.stockName || ""} ${row.note || ""}`.toLowerCase().includes(normalized));
  }, [data, query]);

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

  const summary = (data as any)?.summary;
  // 观察成员与普通成员始终只读；后端亦不会接受其写请求。
  const canEdit = !participantView && Boolean((data as any)?.canEdit);
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
  const pnlTone = Number(summary?.totalPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]";
  const dailyTone = Number(summary?.dailyChange || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]";
  const myHoldingByLotId = new Map<number, { quantity: number; costValue: number }>();
  for (const participation of ((data as any)?.participations || [])) {
    const lotId = Number(participation.lotId);
    const quantity = Number(participation.remainingQuantity || 0);
    if (!lotId || quantity <= 0) continue;
    const current = myHoldingByLotId.get(lotId) || { quantity: 0, costValue: 0 };
    current.quantity += quantity;
    current.costValue += quantity * Number(participation.entryPrice || 0);
    myHoldingByLotId.set(lotId, current);
  }
  // 成员只能查看标签有哪些当前股票和各批次成交信息；标签总市值、总股数、成本及总盈亏不对成员公开。
  const tagHoldingLots = tagPositions.flatMap((position: any) => (position.lots || []).map((lot: any) => {
    const myHolding = myHoldingByLotId.get(Number(lot.id));
    const marketPrice = position.marketPrice;
    const myMarketValue = !myHolding || marketPrice === null || marketPrice === undefined ? null : myHolding.quantity * Number(marketPrice);
    return {
      symbol: position.symbol,
      stockName: position.stockName,
      marketPrice,
      quoteDate: position.quoteDate,
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
    };
  }));

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
        {participantView && (
          <section className="overflow-hidden rounded-2xl border border-[#F1E6DE] bg-white shadow-sm">
            <div className="flex items-center justify-between bg-[#D32F2F] px-4 py-3">
              <div><div className="text-sm font-semibold text-white">{accountName}整体持仓</div><div className="mt-0.5 text-[11px] text-white/75">{accountName}全部 A 股持仓，不等同于您的个人份额</div></div>
              <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] text-white">{accountName}总览</span>
            </div>
            {!tagData ? (
              <div className="px-4 py-7 text-center text-xs text-gray-400"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />正在载入标签整体持仓…</div>
            ) : (
              <>
                <div className="relative border-t border-[#F1E6DE] px-4 py-2.5">
                  {tagHoldingLots.length === 0 ? <div className="py-2 text-center text-sm text-gray-400">标签暂无有效持仓</div> : <div className="space-y-3">{tagHoldingLots.map((holding: any, index: number) => { const changeTone = Number(holding.priceChange || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"; const myPnlTone = Number(holding.myHolding?.floatingPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"; const positionNumber = String(index + 1).padStart(2, "0"); return <div key={`${holding.symbol}-${holding.lot.id}`}><div className="mb-1 text-xs font-medium text-gray-500">持仓编号 {positionNumber}</div><div className="overflow-hidden rounded-[3px] border border-[#D9D9D9] bg-white text-xs"><div className="flex items-center justify-between gap-3 border-b border-[#E6E6E6] px-2.5 py-2.5"><div className="min-w-0 truncate"><span className="font-semibold text-[#222222]">{holding.stockName}</span><span className="ml-1 font-normal text-gray-400">{holding.symbol}</span></div><div className="shrink-0 text-right"><span className="text-[11px] text-gray-400">买入时间</span><span className="ml-1 font-medium text-[#222222]">{formatDateTime(holding.lot.openedAt)}</span></div></div><div className="grid grid-cols-4"><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">买入价</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(holding.lot.unitCost)}</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">当前价</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(holding.marketPrice)}</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">当前涨跌</div><div className={`mt-0.5 truncate font-medium ${changeTone}`}>{holding.priceChange === null ? "—" : signedMoney(holding.priceChange)}</div></div><div className="min-w-0 px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">涨跌幅</div><div className={`mt-0.5 truncate font-medium ${changeTone}`}>{holding.priceChangePercent === null ? "—" : `${holding.priceChangePercent >= 0 ? "+" : ""}${(holding.priceChangePercent * 100).toFixed(2)}%`}</div></div></div>{holding.myHolding && <div className="border-t border-[#D9D9D9] bg-white"><div className="flex items-center justify-between gap-3 border-b border-[#E6E6E6] px-2.5 py-2"><span className="font-semibold text-[#222222]">我的持仓</span><span className="shrink-0 text-[11px] text-gray-500">所需保证金 <b className="ml-0.5 font-semibold text-[#C62828]">{money(holding.myHolding.requiredMargin)}</b></span></div><div className="grid grid-cols-4"><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">我的买入价</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(holding.myHolding.entryPrice)}</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">持仓数量</div><div className="mt-0.5 truncate font-medium text-[#222222]">{formatQuantity(holding.myHolding.quantity)} 股</div></div><div className="min-w-0 border-r border-[#E6E6E6] px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">持仓价值</div><div className="mt-0.5 truncate font-medium text-[#222222]">{money(holding.myHolding.marketValue)}</div></div><div className="min-w-0 px-1.5 py-2.5 text-center"><div className="whitespace-nowrap text-[11px] text-gray-400">浮动盈亏</div><div className={`mt-0.5 truncate font-medium ${myPnlTone}`}>{holding.myHolding.floatingPnl === null ? "—" : signedMoney(holding.myHolding.floatingPnl)}</div></div></div></div>}</div></div>})}</div>}
                {snapshotStamp && <div aria-label={snapshotStamp} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><div className="flex -rotate-12 flex-col items-center rounded-xl border-2 border-[#2586B8]/35 bg-[#E8F6FC]/15 px-5 py-3 text-center text-[#2378A7]/35 opacity-[0.85]"><BadgeCheck className="h-7 w-7" strokeWidth={1.8} /><span className="mt-1 text-sm font-bold tracking-[0.16em]">盘尾已结算</span><span className="mt-1 text-[11px] font-medium tracking-wide">{snapshotStamp}</span></div></div>}
                </div>
              </>
            )}
          </section>
        )}

        <div className="space-y-3">
          {!participantView && <div>
          <div className="flex items-start justify-between gap-3">
            <div><div className="text-xs text-gray-500">{participantView ? "我的当前持仓市值" : "当前持仓市值"} · {summary.positionCount || 0} 只</div><div className="mt-1 text-2xl font-bold text-[#202938]">{money(summary.marketValue)}</div></div>
            <div className="text-right"><div className="text-xs text-gray-500">{participantView ? "我的累计盈亏" : "累计盈亏"}</div><div className={`mt-1 text-lg font-bold ${pnlTone}`}>{signedMoney(summary.totalPnl)}</div></div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-xs">
            <div><div className="text-gray-500">{participantView ? "参与成本" : "持仓成本"}</div><div className="mt-1 font-semibold text-[#202938]">{money(summary.costValue)}</div></div>
            <div><div className="text-gray-500">浮动盈亏</div><div className={`mt-1 font-semibold ${Number(summary.floatingPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{signedMoney(summary.floatingPnl)}</div></div>
            <div><div className="text-gray-500">已实现盈亏</div><div className={`mt-1 font-semibold ${Number(summary.realizedPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{signedMoney(summary.realizedPnl)}</div></div>
          </div>
          {summary.unpricedPositionCount > 0 && <div className="mt-3 text-[11px] text-[#E65100]">有 {summary.unpricedPositionCount} 只持仓尚无有效盘尾行情；不会以 0 计价。</div>}
          <div className="mt-3 text-[11px] text-gray-400">最新盘尾快照：{summary.latestSnapshot ? `${summary.latestSnapshot.snapshotDate} 15:05` : "首次登记后等待盘尾更新"}</div>
          </div>}

        {!participantView && <section className="flex items-center justify-between gap-3 rounded-xl border border-[#E4EAF0] bg-white px-3 py-2.5 shadow-sm">
          <div className="flex items-center gap-2"><span className={`rounded-full p-1 ${Number(summary.dailyChange || 0) >= 0 ? "bg-[#FFEBEE]" : "bg-[#E8F5E9]"}`}>{Number(summary.dailyChange || 0) >= 0 ? <TrendingUp className={`w-3.5 h-3.5 ${dailyTone}`} /> : <TrendingDown className={`w-3.5 h-3.5 ${dailyTone}`} />}</span><div><div className="text-xs font-medium text-[#222222]">{participantView ? "我的相对上一有效交易日" : "相对上一有效交易日"}</div><div className="text-[11px] text-gray-500">{participantView ? "按个人份额的盘尾快照比较" : "按日快照比较，不按日折算成交"}</div></div></div>
          <div className={`text-sm font-semibold ${dailyTone}`}>{summary.dailyChange === null ? "—" : signedMoney(summary.dailyChange)}{summary.dailyChangePercent !== null ? <span className="ml-1 text-[11px]">({(summary.dailyChangePercent * 100).toFixed(2)}%)</span> : null}</div>
        </section>}

        {!participantView && <section className="overflow-hidden rounded-xl border border-[#E4EAF0] bg-white shadow-sm">
          <button onClick={() => setShowDailySnapshots((value) => !value)} className="w-full px-3 py-3 flex items-center justify-between text-sm font-semibold text-[#222222]"><span>{participantView ? "我的每日盈亏" : "每日盘尾估值"} ({dailySnapshots.length})</span>{showDailySnapshots ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
          {showDailySnapshots && <div className="border-t divide-y divide-gray-100">{dailySnapshots.length === 0 ? <div className="px-3 py-6 text-center text-sm text-gray-400">首笔成交后，每个有效交易日 15:05 自动记录盘尾估值</div> : dailySnapshots.map((snapshot: any) => <div key={snapshot.snapshotDate} className="px-3 py-2.5 flex items-center justify-between gap-3 text-xs"><div><div className="font-medium text-[#222222]">{snapshot.snapshotDate} 15:05</div><div className="mt-1 text-gray-500">持仓 {snapshot.positionCount} 只 · 基准 {money(snapshot.costValue)}</div></div><div className="text-right"><div className="font-semibold text-[#222222]">{money(snapshot.marketValue)}</div><div className={`mt-1 ${Number(snapshot.totalPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{signedMoney(snapshot.totalPnl)}</div></div></div>)}</div>}
        </section>}

        {!participantView && <div className="relative"><Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、代码或历史备注" className="h-9 border-[#DCE5ED] bg-white pl-9" /></div>}

        {canEdit && <div className="grid grid-cols-5 gap-1.5"><Button size="sm" variant="outline" onClick={() => openAction("buy")} className="text-xs">买入</Button><Button size="sm" variant="outline" onClick={() => openAction("add")} className="text-xs">加仓</Button><Button size="sm" variant="outline" onClick={() => openAction("reduce")} className="text-xs">减仓</Button><Button size="sm" variant="outline" onClick={() => openAction("sell")} className="text-xs">卖出</Button><Button size="sm" variant="outline" onClick={() => openAction("note")} className="text-xs">备注</Button></div>}

        {!participantView && <section className="overflow-hidden rounded-xl border border-[#E4EAF0] bg-white shadow-sm">
          <button onClick={() => setShowCurrent((value) => !value)} className="w-full px-3 py-3 flex items-center justify-between text-sm font-semibold text-[#222222]"><span>{participantView ? "我的参与持仓" : "当前持仓"} ({filteredPositions.length})</span>{showCurrent ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
          {showCurrent && <div className="border-t divide-y divide-gray-100">{filteredPositions.length === 0 ? <div className="px-3 py-8 text-center text-sm text-gray-400">暂无当前持仓</div> : filteredPositions.map((position: any) => <button key={position.symbol} onClick={() => setSelectedPosition(position)} className="w-full text-left px-3 py-3 hover:bg-[#F7FAFC]"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-sm font-semibold text-[#202938] truncate">{position.stockName} <span className="ml-1 text-xs font-normal text-gray-500">{position.symbol}</span></div><div className="mt-1 text-[11px] text-gray-500">{formatQuantity(position.quantity)} 股 · 入场 {money(position.averageCost)} · 现价 {money(position.marketPrice)}</div></div><div className="shrink-0 text-right"><div className="text-sm font-semibold text-[#202938]">{money(position.marketValue)}</div><div className={`mt-1 text-[11px] ${Number(position.floatingPnl || 0) >= 0 ? "text-[#D32F2F]" : "text-[#2E7D32]"}`}>{signedMoney(position.floatingPnl)}</div></div></div></button>)}</div>}
        </section>}

        {!participantView && <section className="overflow-hidden rounded-xl border border-[#E4EAF0] bg-white shadow-sm">
          <button onClick={() => setShowClosed((value) => !value)} className="w-full px-3 py-3 flex items-center justify-between text-sm font-semibold text-[#222222]"><span>{participantView ? "我的已结束持仓" : "已结束持仓"} ({((data as any).closedLots || []).length})</span>{showClosed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
          {showClosed && <div className="border-t divide-y divide-gray-100">{((data as any).closedLots || []).length === 0 ? <div className="px-3 py-6 text-center text-sm text-gray-400">暂无已结束批次</div> : ((data as any).closedLots || []).map((lot: any, index: number) => <div key={`${lot.symbol}-${lot.openedAt}-${index}`} className="px-3 py-2.5 flex justify-between text-xs"><div><span className="font-medium text-[#222222]">{lot.stockName}</span><span className="ml-1 text-gray-500">{lot.symbol}</span></div><div className="text-right text-gray-500">{formatQuantity(lot.initialQuantity)} 股 · 成本 {money(lot.unitCost)}</div></div>)}</div>}
        </section>}

        <section className={participantView ? "border-t border-[#F1E6DE]" : "overflow-hidden rounded-xl border border-[#E4EAF0] bg-white shadow-sm"}>
          <button onClick={() => setShowHistory((value) => !value)} className="w-full px-3 py-3 flex items-center justify-between text-sm font-semibold text-[#222222]"><span className="flex items-center gap-1.5"><History className="w-4 h-4 text-gray-500" />{participantView ? "标签完整操作历史" : "完整操作历史"} ({filteredHistory.length})</span>{showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
          {showHistory && <div className="border-t divide-y divide-gray-100">{filteredHistory.map((event: any) => <div key={event.id} className={`px-3 py-3 ${event.status === "voided" ? "bg-gray-50 opacity-75" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] ${eventTone[event.type as EventType]}`}>{eventLabels[event.type as EventType]}</span>{event.status === "voided" && <span className="text-[10px] text-gray-500">已作废</span>}<span className="text-xs font-medium text-[#222222] truncate">{event.stockName || "运营备注"}{event.symbol ? ` ${event.symbol}` : ""}</span></div><div className="mt-1 text-[11px] text-gray-500">实际：{formatDateTime(event.actualTradedAt)} · 登记：{formatDateTime(event.serverRegisteredAt)}</div>{event.note && <div className="mt-1 text-[11px] text-gray-600 break-words">{event.note}</div>}{event.status === "voided" && event.voidReason && <div className="mt-1 text-[11px] text-[#C62828]">作废原因：{event.voidReason}</div>}</div><div className="shrink-0 text-right text-xs text-gray-600">{event.quantity !== null ? <>{!participantView && <div>{formatQuantity(event.quantity)} 股</div>}<div className={participantView ? "font-medium text-[#222222]" : "mt-1"}>{money(event.executionPrice)}</div></> : null}{canEdit && event.status === "active" && <div className="mt-2 flex justify-end gap-2"><button onClick={() => openCorrection(event)} className="text-[11px] text-[#1565C0] underline">更正</button><button onClick={() => requestVoid(event)} disabled={voidEventMutation.isPending} className="text-[11px] text-[#C62828] underline">作废</button></div>}</div></div></div>)}</div>}
        </section>
        </div>
      </main>

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
