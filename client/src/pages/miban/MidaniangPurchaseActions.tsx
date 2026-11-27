import { useState } from "react";
import { Link } from "wouter";
import { Minus, Plus } from "lucide-react";
import { getMibanLimitedProduct, getMibanLimitedProductSku } from "@shared/miban-limited-products";
import type { MidaniangSelectionItem } from "@shared/midaniang-selection-catalog";
import { LimitedCartButton, useLimitedProductCart } from "./LimitedProductCart";
import { cnyToU } from "./useMibanUsdtCnyRate";

export default function MidaniangPurchaseActions({ item, usdtCnyRate }: { item: MidaniangSelectionItem; usdtCnyRate: number }) {
  const { addItem } = useLimitedProductCart();
  const [annual, setAnnual] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const product = getMibanLimitedProduct(item.productKey);
  const sku = product ? getMibanLimitedProductSku(product, item.skuId) : undefined;
  if (!product || product.status !== "on_sale" || !sku) return null;

  const months = annual ? 12 : 1;
  const monthlyCny = sku.priceCny * quantity;
  const totalCny = monthlyCny * months;
  const checkoutPath = `/p/proj_hzxm2t/limited/${product.key}/buy?sku=${encodeURIComponent(sku.id)}&quantity=${quantity}${annual ? "&plan=annual" : ""}`;
  const addToCart = () => addItem({
    checkoutGroupKey: product.checkoutGroupKey ?? product.key,
    groupLabel: "米大娘精选",
    productKey: product.key,
    productName: product.detail.title,
    skuId: sku.id,
    skuName: sku.name,
    image: sku.image ?? product.detail.productImage,
    unitLabel: sku.unitLabel,
    netContentText: sku.netContentText,
    priceCny: sku.priceCny,
    maxPurchaseQty: sku.maxPurchaseQty,
    quantity,
    accent: "#8d292c",
  });

  return (
    <div className="mt-5" data-testid="midaniang-purchase-actions">
      <section className="rounded-xl border border-[#e5e0d5] bg-white p-4" aria-label="购买计划与份数">
        <p className="text-[13px] font-medium text-[#343a31]">选择计划</p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="购买计划">
          {[
            { annual: false, title: "单月购买", caption: "本次购买，一次发货" },
            { annual: true, title: "全年计划", caption: "长期计划 · 连续12个月" },
          ].map(plan => (
            <button
              key={plan.title}
              type="button"
              aria-pressed={annual === plan.annual}
              onClick={() => setAnnual(plan.annual)}
              className={`min-h-16 rounded-lg border px-2 py-3 text-center ${annual === plan.annual ? "border-[#8d292c] bg-[#8d292c]/5 text-[#8d292c]" : "border-[#e5e0d5] text-[#676b60]"}`}
            >
              <span className="block text-[14px] font-medium">{plan.title}</span>
              <span className="mt-1 block text-[10px] leading-4">{plan.caption}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-[12px] font-medium text-[#343a31]">{annual ? "每月发几份" : "购买份数"}</p>
        <div className="mt-2 flex items-center justify-between gap-3" data-testid="midaniang-quantity-row">
          <div className="min-w-0 flex-1" data-testid="midaniang-box-specification">
            <p className="text-[13px] font-medium leading-5 text-[#343a31]">1份 = 1盒</p>
            {sku.netContentText.split(" · ").map((line, index) => (
              <p key={line} className="mt-0.5 break-words text-[11px] leading-[18px] text-[#676b60]">{index === 0 ? line : `净含量${line}`}</p>
            ))}
          </div>
          <div className="flex shrink-0 items-center overflow-hidden rounded-xl border border-[#8d292c]/25 bg-[#f7f4ee]" role="group" aria-label={annual ? "每月发货份数" : "单月购买份数"} data-testid="midaniang-quantity-stepper">
            <button type="button" aria-label="减少份数" disabled={quantity <= 1} onClick={() => setQuantity(count => Math.max(1, count - 1))} className="flex h-14 w-12 items-center justify-center text-[#8d292c] transition-colors hover:bg-[#8d292c]/5 active:bg-[#8d292c]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#8d292c] disabled:text-[#ccc]">
              <Minus className="h-[22px] w-[22px]" aria-hidden="true" />
            </button>
            <span className="min-w-11 text-center text-[24px] font-semibold tabular-nums text-[#343a31]" aria-live="polite" aria-atomic="true" data-testid="midaniang-quantity-value">{quantity}</span>
            <button type="button" aria-label="增加份数" disabled={quantity >= sku.maxPurchaseQty} onClick={() => setQuantity(count => Math.min(sku.maxPurchaseQty, count + 1))} className="flex h-14 w-12 items-center justify-center text-[#8d292c] transition-colors hover:bg-[#8d292c]/5 active:bg-[#8d292c]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#8d292c] disabled:text-[#ccc]">
              <Plus className="h-[22px] w-[22px]" aria-hidden="true" />
            </button>
          </div>
        </div>
        {annual && (
          <div className="mt-4 rounded-lg bg-[#f7f4ee] px-3 py-3 text-[12px] leading-6" data-testid="midaniang-annual-delivery-notice">
            <p className="font-medium text-[#8d292c]">按月发货，不一次发完</p>
            <p className="text-[#676b60]">每月{quantity}份，连续12个月，全年共{quantity * 12}份。首期核单后安排发货，后续按月配送。</p>
          </div>
        )}
        <div className="mt-4 flex items-end justify-between gap-3 border-t border-[#e5e0d5] pt-3">
          <div className="text-[11px] leading-5 text-[#676b60]">
            <p>{annual ? "全年合计 · 一次支付" : "本次合计"}</p>
            {annual && <p>每月 ¥{monthlyCny.toFixed(2)} × 12个月</p>}
          </div>
          <div className="min-w-0 text-right tabular-nums text-[#8d292c]">
            <p className="break-words text-[19px] font-medium">{cnyToU(totalCny, usdtCnyRate).toFixed(2)} <span className="text-[10px]">USDT</span></p>
            <p className="mt-1 text-[11px] text-[#777b70]">≈ ¥{totalCny.toFixed(2)}</p>
          </div>
        </div>
      </section>
      <div className="mt-3 flex items-center gap-2">
        <LimitedCartButton compact accent="#8d292c" />
        {!annual && <button type="button" onClick={addToCart} className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#8d292c] px-2 text-[12px] font-medium text-[#8d292c]" data-testid="midaniang-add-to-cart">加入购物车</button>}
        <Link href={checkoutPath} className="flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-lg bg-[#8d292c] px-2 text-[12px] font-medium text-white" data-testid="midaniang-buy-now">{annual ? "购买全年计划" : "立即购买"}</Link>
      </div>
      {annual && <p className="mt-2 text-[10px] leading-5 text-[#777b70]">全年计划单独下单，按月发货，不与一次性发货商品合单。</p>}
    </div>
  );
}
