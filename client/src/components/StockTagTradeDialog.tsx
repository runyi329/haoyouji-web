import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TradeType = "buy" | "sell";

type Props = {
  categoryId: number;
  categoryName: string;
  open: boolean;
  type: TradeType;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** Sandbox hot previews read real ledger data, so transaction writes must stay disabled there. */
  readOnlyPreview?: boolean;
};

const formatQuantity = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: 8 });
const money = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function localInputTime(now = new Date()) {
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

/**
 * New stock-tag trades are deliberately limited to two operations:
 * - buy: create a brand-new numbered lot;
 * - sell: select one existing numbered lot and close all its remaining shares.
 */
export function StockTagTradeDialog({ categoryId, categoryName, open, type, onOpenChange, onSaved, readOnlyPreview = import.meta.env.DEV }: Props) {
  const utils = trpc.useUtils();
  const [symbolQuery, setSymbolQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [quantity, setQuantity] = useState("");
  const [executionPrice, setExecutionPrice] = useState("");
  const [actualTradedAt, setActualTradedAt] = useState(localInputTime());
  const [note, setNote] = useState("");
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);

  const portfolioQuery = trpc.ledger.getStockTagPortfolio.useQuery(
    { ledgerId: 37, categoryId },
    { enabled: open && categoryId > 0, staleTime: 0 },
  );

  const saleLots = useMemo(() => {
    let positionNumber = 0;
    return (((portfolioQuery.data as any)?.positions || []) as any[]).flatMap((position: any) => (
      (position.lots || []).map((lot: any) => {
        positionNumber += 1;
        return {
          id: Number(lot.id),
          positionNumber: String(positionNumber).padStart(2, "0"),
          stockName: String(position.stockName || lot.stockName || "股票"),
          symbol: String(position.symbol || lot.symbol || ""),
          quantity: Number(lot.quantity || 0),
          unitCost: Number(lot.unitCost || 0),
          marketPrice: position.marketPrice === null || position.marketPrice === undefined ? null : Number(position.marketPrice),
        };
      })
    )).filter((lot: any) => lot.id > 0 && lot.quantity > 0);
  }, [portfolioQuery.data]);

  const selectedSaleLot = saleLots.find((lot: any) => lot.id === selectedLotId) || null;
  const shouldSearchStock = open && type === "buy" && symbolQuery.trim().length >= 2 && !selectedStock;
  const suggestionsQuery = trpc.searchManualAshareStocks.useQuery(
    { query: symbolQuery.trim() },
    { enabled: shouldSearchStock, staleTime: 3_000 },
  );
  const suggestions = (suggestionsQuery.data as any)?.results || [];

  const resetForm = () => {
    setSymbolQuery("");
    setSelectedStock(null);
    setQuantity("");
    setExecutionPrice("");
    setActualTradedAt(localInputTime());
    setNote("");
    setSelectedLotId(null);
  };

  useEffect(() => {
    if (open) resetForm();
  }, [open, type]);

  const addEventMutation = trpc.ledger.addStockTagEvent.useMutation({
    onSuccess: () => {
      toast.success(type === "buy" ? "买入已登记并生成新持仓编号" : "卖出已登记并结清所选持仓编号");
      onOpenChange(false);
      void utils.ledger.getStockTagPortfolio.invalidate({ ledgerId: 37, categoryId });
      void utils.ledger.getStockLotParticipationMatrix.invalidate({ ledgerId: 37, categoryId });
      void utils.ledger.getStockTagDailySnapshots.invalidate({ ledgerId: 37, categoryId });
      onSaved?.();
    },
    onError: (error) => toast.error(`登记失败：${error.message}`),
  });

  const submit = () => {
    if (readOnlyPreview) {
      toast.info("热预览仅供核对界面，不会写入正式股票账本");
      return;
    }
    const actualDate = new Date(actualTradedAt);
    if (Number.isNaN(actualDate.getTime())) {
      toast.error("请选择实际成交时间");
      return;
    }
    const price = Number(executionPrice);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("请输入正确的实际成交价格");
      return;
    }

    if (type === "buy") {
      const buyQuantity = Number(quantity);
      if (!selectedStock) {
        toast.error("请从检索结果中选择已核验的股票");
        return;
      }
      if (!Number.isFinite(buyQuantity) || buyQuantity <= 0) {
        toast.error("请输入正确的买入数量");
        return;
      }
      addEventMutation.mutate({
        ledgerId: 37,
        categoryId,
        eventType: "buy",
        symbol: selectedStock.symbol,
        quantity: buyQuantity,
        executionPrice: price,
        actualTradedAt: actualDate.toISOString(),
        note: note.trim() || undefined,
      });
      return;
    }

    if (!selectedSaleLot) {
      toast.error("请选择要卖出的持仓编号");
      return;
    }
    addEventMutation.mutate({
      ledgerId: 37,
      categoryId,
      eventType: "sell",
      lotId: selectedSaleLot.id,
      executionPrice: price,
      actualTradedAt: actualDate.toISOString(),
      note: note.trim() || undefined,
    });
  };

  const dialogTitle = type === "buy" ? `买入股票 · ${categoryName}` : `卖出股票 · ${categoryName}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-1">
          {type === "buy" ? (
            <>
              <div>
                <Label>股票代码、名称或拼音</Label>
                <div className="relative mt-1">
                  <Input value={selectedStock ? `${selectedStock.name} ${selectedStock.symbol}` : symbolQuery} onChange={(event) => { setSelectedStock(null); setSymbolQuery(event.target.value); }} placeholder="如 600519、贵州茅台或 gzm" />
                  {suggestionsQuery.isFetching && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" />}
                </div>
                {!selectedStock && suggestions.length > 0 && <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white">{suggestions.map((stock: any) => <button key={stock.symbol} type="button" onClick={() => { setSelectedStock(stock); setSymbolQuery(""); if (stock.latestPrice) setExecutionPrice(String(stock.latestPrice)); }} className="w-full border-b px-3 py-2.5 text-left last:border-0 hover:bg-[#F4F8FF]"><span className="text-sm font-medium">{stock.name}</span><span className="ml-2 text-xs text-gray-500">{stock.symbol}</span>{stock.latestPrice ? <span className="float-right text-xs text-[#1565C0]">参考 {money(stock.latestPrice)}</span> : null}</button>)}</div>}
                {selectedStock && <div className="mt-1 text-[11px] text-[#1565C0]">已核验：{selectedStock.name} · {selectedStock.symbol}；登记时参考价由服务器留档。</div>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>实际买入价格</Label><Input inputMode="decimal" value={executionPrice} onChange={(event) => setExecutionPrice(event.target.value)} placeholder="0.00" className="mt-1" /></div>
                <div><Label>实际买入数量</Label><Input inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="股数" className="mt-1" /></div>
              </div>
              <div className="rounded-lg bg-[#F5F7FA] px-3 py-2 text-[11px] leading-5 text-gray-600">每次买入都会创建新的持仓编号；已有编号不能再加仓。</div>
            </>
          ) : (
            <>
              <div>
                <Label>卖出持仓编号</Label>
                <select value={selectedLotId ?? ""} onChange={(event) => { const nextLotId = Number(event.target.value) || null; setSelectedLotId(nextLotId); const lot = saleLots.find((item: any) => item.id === nextLotId); if (lot?.marketPrice) setExecutionPrice(String(lot.marketPrice)); }} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-[#C62828]">
                  <option value="">请选择持仓编号</option>
                  {saleLots.map((lot: any) => <option key={lot.id} value={lot.id}>#{lot.positionNumber} · {lot.stockName} {lot.symbol} · {formatQuantity(lot.quantity)} 股</option>)}
                </select>
              </div>
              {portfolioQuery.isLoading && <div className="text-xs text-gray-400">正在载入可卖持仓编号…</div>}
              {selectedSaleLot && <div className="rounded-lg border border-[#F1D8D8] bg-[#FFF8F8] px-3 py-2.5 text-xs leading-5 text-gray-600"><div className="font-semibold text-[#333333]">#{selectedSaleLot.positionNumber} · {selectedSaleLot.stockName} {selectedSaleLot.symbol}</div><div className="mt-1 flex justify-between gap-3"><span>买入价 {money(selectedSaleLot.unitCost)}</span><span>当前价 {money(selectedSaleLot.marketPrice)}</span></div><div className="mt-1 font-medium text-[#C62828]">本次将卖出全部剩余 {formatQuantity(selectedSaleLot.quantity)} 股</div></div>}
              <div><Label>实际卖出价格</Label><Input inputMode="decimal" value={executionPrice} onChange={(event) => setExecutionPrice(event.target.value)} placeholder="0.00" className="mt-1" /></div>
              <div className="rounded-lg bg-[#F5F7FA] px-3 py-2 text-[11px] leading-5 text-gray-600">卖出只能结清一个已选持仓编号的全部剩余股数，不能减仓，也不会跨编号 FIFO 扣仓。</div>
            </>
          )}
          <div><Label>实际成交时间</Label><Input type="datetime-local" value={actualTradedAt} onChange={(event) => setActualTradedAt(event.target.value)} className="mt-1" /></div>
          <div><Label>备注（可选）</Label><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="可填写成交说明或补录原因" /></div>
          <div className="rounded-lg bg-[#FAF3ED] px-3 py-2 text-[11px] text-gray-600">服务器会自动记录登记时间与当时参考价；备注与本次买入或卖出一并留档。{readOnlyPreview ? " 当前为热预览，确认交易已禁用。" : ""}</div>
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>取消</Button><Button className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]" onClick={submit} disabled={addEventMutation.isPending || readOnlyPreview}>{readOnlyPreview ? "热预览不可写入" : addEventMutation.isPending ? "保存中…" : type === "buy" ? "确认买入" : "确认卖出"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
