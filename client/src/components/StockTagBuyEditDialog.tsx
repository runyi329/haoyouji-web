import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { beijingTradeInputTime, parseTradeInputTime } from "@/components/StockTagTradeDialog";
import { isValidCryptoPortfolioQuantity, portfolioMarket, portfolioQuantityUnit, portfolioQuotePrefix, portfolioCurrency, portfolioDisplaySymbol } from "@shared/portfolio-instruments";

export type EditableStockBuyOrder = {
  lotId: number;
  eventId: number;
  stockName: string;
  symbol: string;
  quantity: number;
  executionPrice: number;
  actualTradedAt: string;
  note: string;
  minimumQuantity?: number;
  hasSales?: boolean;
};

type Props = {
  categoryId: number;
  order: EditableStockBuyOrder | null;
  canEdit: boolean;
  readOnlyPreview?: boolean;
  onClose: () => void;
  onRequestCancel?: (order: EditableStockBuyOrder) => void;
};

/** Modify the original opening order without voiding/reopening a numbered lot. */
export function StockTagBuyEditDialog({ categoryId, order, canEdit, readOnlyPreview = false, onClose, onRequestCancel }: Props) {
  const utils = trpc.useUtils();
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [tradedAt, setTradedAt] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!order) return;
    setQuantity(String(order.quantity));
    setPrice(String(order.executionPrice));
    setTradedAt(beijingTradeInputTime(new Date(order.actualTradedAt)));
    setNote(order.note);
    setReason("");
  }, [order]);
  const mutation = trpc.ledger.updateStockTagBuy.useMutation({
    onSuccess: () => {
      toast.success("买入订单已修改，原编号及成员份额保留");
      onClose();
      for (const name of ["getStockTagPortfolio", "getStockLotParticipationMatrix", "getMyStockTagParticipantPortfolio", "getStockTagPublicPortfolio", "getStockTagDailySnapshots"] as const) {
        void utils.ledger[name].invalidate({ ledgerId: 37, categoryId });
      }
    },
    onError: error => toast.error(`修改失败：${error.message}`),
  });
  const close = () => { if (!mutation.isPending) onClose(); };
  const submit = () => {
    if (!canEdit || !order || mutation.isPending || !Number.isInteger(categoryId) || categoryId <= 0
      || !Number.isInteger(order.lotId) || order.lotId <= 0 || !Number.isInteger(order.eventId) || order.eventId <= 0) return;
    if (readOnlyPreview || import.meta.env.DEV) return toast.info("热预览仅展示编辑，不会修改正式订单");
    const parsedQuantity = Number(quantity);
    const executionPrice = Number(price);
    const isCrypto = portfolioMarket(order.symbol) === "CRYPTO";
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return toast.error("请输入正确的买入数量");
    if (isCrypto && !isValidCryptoPortfolioQuantity(quantity)) return toast.error("币数量最小0.00000001，最多8位小数");
    if (!Number.isFinite(executionPrice) || executionPrice <= 0) return toast.error("请输入正确的买入价格");
    if (parsedQuantity < Number(order.minimumQuantity || 0)) return toast.error("买入数量不能小于已有成员份额，请先调整分配");
    if (!reason.trim()) return toast.error("请填写修改原因");
    const originalInputTime = beijingTradeInputTime(new Date(order.actualTradedAt));
    const actualDate = tradedAt === originalInputTime ? new Date(order.actualTradedAt) : parseTradeInputTime(tradedAt, "buy", true);
    if (!Number.isFinite(actualDate.getTime())) return toast.error("请选择有效的买入时间");
    if (actualDate.getTime() > Date.now()) return toast.error("买入时间不能晚于当前时间");
    if (order.hasSales && (parsedQuantity !== order.quantity || executionPrice !== order.executionPrice || actualDate.getTime() !== Date.parse(order.actualTradedAt))) {
      return toast.error("本批次已有卖出记录，只能修改备注，不能改动历史成交金额或日期");
    }
    mutation.mutate({
      ledgerId: 37, categoryId, lotId: order.lotId, eventId: order.eventId,
      quantity: parsedQuantity, executionPrice, actualTradedAt: actualDate.toISOString(), note, reason: reason.trim(),
      expected: { quantity: order.quantity, executionPrice: order.executionPrice, actualTradedAt: order.actualTradedAt, note: order.note },
    });
  };
  const requestCancel = () => {
    if (!canEdit || !order || order.hasSales || mutation.isPending || !onRequestCancel) return;
    if (readOnlyPreview || import.meta.env.DEV) return toast.info("热预览仅展示，不会撤销正式订单");
    onRequestCancel(order);
  };
  return <Dialog open={!!order && canEdit} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>修改买入订单</DialogTitle></DialogHeader>
      {order && <div className="space-y-4 pt-1">
        <div className="rounded-lg bg-[#FAF3ED] px-3 py-2">
          <div className="break-words text-sm font-semibold">{order.stockName} <span className="text-xs font-normal text-gray-500">{portfolioDisplaySymbol(order.symbol)}</span></div>
          <div className="mt-1 text-[11px] text-gray-500">保留原持仓编号及股票标的，不会重新开仓。</div>
        </div>
        {order.hasSales && <div role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">本批次已有卖出记录：成交信息已锁定，仍可修改开仓备注。</div>}
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="buy-edit-price">买入价格（{portfolioQuotePrefix(portfolioCurrency(order.symbol))}）</Label><Input id="buy-edit-price" inputMode="decimal" value={price} onChange={event => { if (!mutation.isPending && !order.hasSales) setPrice(event.target.value); }} disabled={mutation.isPending || order.hasSales} className="mt-1" /></div>
          <div><Label htmlFor="buy-edit-quantity">原买入数量（{portfolioQuantityUnit(order.symbol)}）</Label><Input id="buy-edit-quantity" inputMode="decimal" value={quantity} onChange={event => { if (!mutation.isPending && !order.hasSales) setQuantity(event.target.value); }} disabled={mutation.isPending || order.hasSales} className="mt-1" /></div>
        </div>
        <div><Label htmlFor="buy-edit-time">实际买入时间（北京时间）</Label><Input id="buy-edit-time" type="datetime-local" value={tradedAt} onChange={event => { if (!mutation.isPending && !order.hasSales) setTradedAt(event.target.value); }} disabled={mutation.isPending || order.hasSales} className="mt-1" /></div>
        <div><Label htmlFor="buy-edit-note">开仓备注</Label><textarea id="buy-edit-note" rows={3} maxLength={3000} value={note} onChange={event => { if (!mutation.isPending) setNote(event.target.value.slice(0, 3000)); }} disabled={mutation.isPending} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <div><Label htmlFor="buy-edit-reason">修改原因</Label><Input id="buy-edit-reason" maxLength={300} value={reason} onChange={event => { if (!mutation.isPending) setReason(event.target.value); }} disabled={mutation.isPending} placeholder="例如：买入价格填错" className="mt-1" /></div>
        <div className="rounded-lg bg-[#FAF3ED] px-3 py-2 text-[11px] leading-5 text-gray-600">修改不会自动改变成员份额、入场价和参与日期。需要调整份额，请到“分配”操作。已计入历史日结或已有卖出、结算的买入记录不能直接改成交信息；修改前的信息会保留在操作日志。</div>
        {(readOnlyPreview || import.meta.env.DEV) && <div role="status" className="text-xs text-gray-500">此热链接只供预览，不会保存到正式账目。</div>}
        <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={close} disabled={mutation.isPending}>取消</Button><Button className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]" onClick={submit} disabled={mutation.isPending || !canEdit || readOnlyPreview || import.meta.env.DEV}>{mutation.isPending ? "保存中…" : "保存修改"}</Button></div>
        {onRequestCancel && !order.hasSales && <button type="button" data-buy-cancel-entry onClick={requestCancel} disabled={mutation.isPending || !canEdit || readOnlyPreview || import.meta.env.DEV} className="w-full py-1 text-xs text-gray-500 underline underline-offset-2 disabled:opacity-50">整笔录错？撤销录入</button>}
      </div>}
    </DialogContent>
  </Dialog>;
}
