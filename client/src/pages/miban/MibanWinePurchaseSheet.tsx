import * as Dialog from "@radix-ui/react-dialog";
import { Check, Minus, Plus, X } from "lucide-react";
import type { LimitedProductSku } from "../../../../shared/miban-limited-products";
import { cnyToU } from "./useMibanUsdtCnyRate";
import { MibanImage } from "./MibanImage";
import { LimitedOffShelfBadge } from "./useMibanLimitedCollections";

export type WinePurchaseAction = "buy" | "cart";

type Props = {
  action: WinePurchaseAction | null;
  title: string;
  skus: LimitedProductSku[];
  selectedSku: LimitedProductSku;
  quantity: number;
  maxQuantity: number;
  usdtCnyRate: number;
  accent: string;
  surface: string;
  busy?: boolean;
  purchaseDisabled?: boolean;
  offShelfSkuIds?: string[];
  onClose: () => void;
  onSelectSku: (sku: LimitedProductSku) => void;
  onQuantityChange: (quantity: number) => void;
  onConfirm: () => void;
};

function WineSelectionPrice({ cny, rate, accent }: { cny: number; rate: number; accent: string }) {
  const validRate = Number.isFinite(rate) && rate > 0;
  return (
    <span className="inline-flex flex-col tabular-nums">
      <span className="whitespace-nowrap text-[23px] font-extrabold leading-7" style={{ color: accent }}>
        {validRate ? cnyToU(cny, rate).toFixed(2) : "--"}
        <span className="ml-1 text-[11px]">USDT</span>
      </span>
      <span className="mt-0.5 text-[10px] leading-4 text-gray-400">≈ ¥{cny.toFixed(2)}</span>
    </span>
  );
}

export function winePurchaseQuantityText(sku: LimitedProductSku, quantity: number) {
  const bottles = sku.bottleCountPerUnit;
  return sku.unitLabel === "箱" && bottles && bottles > 1
    ? `${quantity}箱 · 共${quantity * bottles}瓶`
    : `${quantity}${sku.unitLabel}`;
}

/** Purchase selection only: no order creation, wallet requests or quote tokens. */
export function MibanWinePurchaseSheet({
  action, title, skus, selectedSku, quantity, maxQuantity, usdtCnyRate,
  accent, surface, busy = false, onClose, onSelectSku, onQuantityChange, onConfirm,
  purchaseDisabled = false, offShelfSkuIds = [],
}: Props) {
  return (
    <Dialog.Root open={action !== null} onOpenChange={open => { if (!open && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <Dialog.Content
          data-testid="wine-purchase-selection"
          className="fixed inset-x-0 bottom-0 z-[81] mx-auto flex max-h-[90dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-t-[8px] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 shadow-2xl focus:outline-none"
        >
          <Dialog.Close disabled={busy} aria-label="关闭规格选择" className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-[4px] bg-gray-100 text-gray-500">
            <X size={18} />
          </Dialog.Close>
          <div className="flex min-w-0 gap-3 pr-8">
            <MibanImage src={selectedSku.image} variant="thumbnail" alt={title} className="h-[82px] w-[66px] shrink-0 rounded-[4px] object-cover" />
            <div className="min-w-0">
              <Dialog.Title className="text-[17px] font-extrabold leading-6 text-gray-900">选择规格与数量</Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] leading-5 text-gray-500">{title}</Dialog.Description>
              <div className="mt-1"><WineSelectionPrice cny={selectedSku.priceCny} rate={usdtCnyRate} accent={accent} /></div>
            </div>
          </div>
          <fieldset disabled={busy} className="mt-5 min-w-0">
            <legend className="mb-2 text-[13px] font-bold text-gray-800">选择规格</legend>
            <div className="space-y-2">
              {skus.map(sku => (
                <button
                  type="button"
                  key={sku.id}
                  aria-pressed={sku.id === selectedSku.id}
                  onClick={() => onSelectSku(sku)}
                  className="flex w-full items-center justify-between gap-3 rounded-[4px] border px-3 py-3 text-left"
                  style={{ borderColor: sku.id === selectedSku.id ? accent : "#e5e7eb", background: sku.id === selectedSku.id ? surface : "#fff" }}
                >
                  <span className="min-w-0"><span className="block text-[13px] font-bold text-gray-800">{sku.name}</span><span className="mt-1 block text-[11px] text-gray-500">{sku.netContentText} · {sku.subtitle}</span></span>
                  {offShelfSkuIds.includes(sku.id) && <LimitedOffShelfBadge />}
                  {sku.id === selectedSku.id && <Check size={17} className="shrink-0" style={{ color: accent }} />}
                </button>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <div><div className="text-[13px] font-bold text-gray-800">购买数量</div><p className="mt-1 text-[10px] text-gray-400">单笔1–{maxQuantity}{selectedSku.unitLabel}</p></div>
              <div className="flex items-center gap-2">
                <button type="button" aria-label="减少购买数量" disabled={busy || quantity <= 1} onClick={() => onQuantityChange(quantity - 1)} className="flex h-10 w-10 items-center justify-center rounded-[4px] border border-gray-200 text-gray-700 disabled:text-gray-300"><Minus size={16} /></button>
                <input type="number" inputMode="numeric" min={1} max={maxQuantity} step={1} aria-label="购买数量" value={quantity} onChange={event => onQuantityChange(Number(event.target.value))} className="h-10 w-12 rounded-[4px] border border-gray-200 text-center text-[17px] font-extrabold text-gray-900 outline-none" />
                <button type="button" aria-label="增加购买数量" disabled={busy || quantity >= maxQuantity} onClick={() => onQuantityChange(quantity + 1)} className="flex h-10 w-10 items-center justify-center rounded-[4px] border disabled:opacity-40" style={{ borderColor: accent, color: accent }}><Plus size={16} /></button>
              </div>
            </div>
          </fieldset>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <div><div className="text-[12px] font-bold text-gray-800">商品小计 · {winePurchaseQuantityText(selectedSku, quantity)}</div><p className="mt-1 text-[10px] text-gray-400">按平台汇率折算</p></div>
            <div data-testid="wine-selection-subtotal"><WineSelectionPrice cny={selectedSku.priceCny * quantity} rate={usdtCnyRate} accent={accent} /></div>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-gray-400">优惠及最终扣款金额以支付确认页的有效报价为准。</p>
          <button type="button" disabled={busy || purchaseDisabled || !selectedSku.active || offShelfSkuIds.includes(selectedSku.id)} onClick={onConfirm} className="mt-4 h-12 shrink-0 rounded-[4px] text-[14px] font-extrabold text-white disabled:opacity-40" style={{ background: accent }}>{offShelfSkuIds.includes(selectedSku.id) ? "已下架" : action === "cart" ? "确认加入购物车" : "确认规格，下一步"}</button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
