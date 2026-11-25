import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { beijingTradeInputTime } from "@/components/StockTagTradeDialog";
import { portfolioDisplaySymbol, portfolioQuantityUnit } from "@shared/portfolio-instruments";
import type { EditableStockBuyOrder } from "@/components/StockTagBuyEditDialog";

type Props = {
  categoryId: number;
  order: EditableStockBuyOrder | null;
  canEdit: boolean;
  readOnlyPreview?: boolean;
  onClose: () => void;
};

/** Cancel an erroneous opening entry, never sell it or delete its audit evidence. */
export function StockTagBuyCancelDialog({ categoryId, order, canEdit, readOnlyPreview = false, onClose }: Props) {
  const utils = trpc.useUtils();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    setReason("");
    setConfirmed(false);
  }, [order]);
  const mutation = trpc.ledger.cancelStockTagBuy.useMutation({
    onSuccess: () => {
      toast.success("错误录入已撤销，原记录保留在操作日志；可重新添加");
      onClose();
      for (const name of ["getStockTagPortfolio", "getStockLotParticipationMatrix", "getMyStockTagParticipantPortfolio", "getStockTagPublicPortfolio", "getStockTagDailySnapshots"] as const) {
        void utils.ledger[name].invalidate({ ledgerId: 37, categoryId });
      }
    },
    onError: error => toast.error(`撤销失败：${error.message}`),
  });
  const close = () => { if (!mutation.isPending) onClose(); };
  const submit = () => {
    if (!canEdit || !order || mutation.isPending || !Number.isSafeInteger(categoryId) || categoryId <= 0
      || !Number.isSafeInteger(order.lotId) || order.lotId <= 0 || !Number.isSafeInteger(order.eventId) || order.eventId <= 0) return;
    if (readOnlyPreview || import.meta.env.DEV) return toast.info("热预览仅展示，不会撤销正式订单");
    if (order.hasSales) return toast.error("这笔买入已有卖出或结算，不能直接撤销录入");
    if (!Number.isFinite(order.quantity) || order.quantity <= 0 || !Number.isFinite(order.executionPrice) || order.executionPrice <= 0
      || !Number.isFinite(Date.parse(order.actualTradedAt))) return toast.error("原买入信息不完整，请刷新后重试");
    if (!reason.trim() || reason.trim().length > 300) return toast.error("请填写撤销原因（最多300字）");
    if (!confirmed) return toast.error("请先确认要撤销这笔错误录入");
    mutation.mutate({
      ledgerId: 37, categoryId, lotId: order.lotId, eventId: order.eventId, reason: reason.trim(),
      expected: { quantity: order.quantity, executionPrice: order.executionPrice, actualTradedAt: order.actualTradedAt, note: order.note },
    });
  };
  const originalBuyTime = order && Number.isFinite(Date.parse(order.actualTradedAt))
    ? beijingTradeInputTime(new Date(order.actualTradedAt)).replace("T", " ") : "—";
  return <Dialog open={!!order && canEdit} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-buy-cancel-dialog>
      <DialogHeader><DialogTitle>撤销录入</DialogTitle></DialogHeader>
      {order && <div className="space-y-4 pt-1">
        <div className="rounded-lg bg-[#FAF3ED] px-3 py-2">
          <div className="break-words text-sm font-semibold">{order.stockName} <span className="text-xs font-normal text-gray-500">{portfolioDisplaySymbol(order.symbol)}</span></div>
          <div className="mt-1 text-xs text-gray-600">原买入：{order.quantity} {portfolioQuantityUnit(order.symbol)} · {originalBuyTime}（北京时间）</div>
        </div>
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">仅撤销这笔错误录入，不是卖出，不计算卖出收益。原记录保留在操作日志，撤销后可重新添加。已计入历史日结、已有卖出或结算的记录不能直接撤销；仍有成员份额或观察配置的，请先在“分配”中移除。</div>
        <div><Label htmlFor="buy-cancel-reason">撤销原因</Label><Input id="buy-cancel-reason" value={reason} onChange={event => { if (!mutation.isPending) setReason(event.target.value); }} maxLength={300} disabled={mutation.isPending} placeholder="例如：股数填错，撤销后重新录入" className="mt-1" /></div>
        <label htmlFor="buy-cancel-confirm" className="flex items-start gap-2 text-xs leading-5 text-gray-600"><input id="buy-cancel-confirm" type="checkbox" checked={confirmed} onChange={event => { if (!mutation.isPending) setConfirmed(event.target.checked); }} disabled={mutation.isPending} className="mt-1 accent-[#C62828]" />我确认这笔是错误录入，并要撤销。</label>
        {(readOnlyPreview || import.meta.env.DEV) && <div role="status" className="text-xs text-gray-500">此热链接只供预览，不会撤销正式订单。</div>}
        <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={close} disabled={mutation.isPending}>返回</Button><Button className="flex-1 bg-[#D32F2F] hover:bg-[#B71C1C]" onClick={submit} disabled={mutation.isPending || !canEdit || !confirmed || !reason.trim() || !!order.hasSales || readOnlyPreview || import.meta.env.DEV}>{mutation.isPending ? "撤销中…" : "确认撤销"}</Button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}
