import { Link } from "wouter";
import { getMibanLimitedProduct, getMibanLimitedProductSku } from "@shared/miban-limited-products";
import type { MidaniangSelectionItem } from "@shared/midaniang-selection-catalog";
import { LimitedCartButton, useLimitedProductCart } from "./LimitedProductCart";

export default function MidaniangPurchaseActions({ item }: { item: MidaniangSelectionItem }) {
  const { addItem } = useLimitedProductCart();
  const product = getMibanLimitedProduct(item.productKey);
  const sku = product ? getMibanLimitedProductSku(product, item.skuId) : undefined;
  if (!product || product.status !== "on_sale" || !sku) return null;
  const checkoutPath = `/p/proj_hzxm2t/limited/${product.key}/buy?sku=${encodeURIComponent(sku.id)}`;

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
    quantity: 1,
    accent: "#8d292c",
  });

  return (
    <div className="mt-5 flex items-center gap-2" data-testid="midaniang-purchase-actions">
      <LimitedCartButton compact accent="#8d292c" />
      <button type="button" onClick={addToCart} className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#8d292c] px-2 text-[12px] font-medium text-[#8d292c]" data-testid="midaniang-add-to-cart">加入购物车</button>
      <Link href={checkoutPath} className="flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-lg bg-[#8d292c] px-2 text-[12px] font-medium text-white" data-testid="midaniang-buy-now">立即购买</Link>
    </div>
  );
}
