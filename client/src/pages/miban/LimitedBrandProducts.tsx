import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ChevronRight, PackageOpen } from "lucide-react";
import {
  mibanLimitedProducts,
  type LimitedProduct,
} from "../../../../shared/miban-limited-products";
import { HERBALIFE_THEME } from "../../../../shared/herbalife-theme";
import { getMibanLimitedBrandBySlug } from "../../../../shared/miban-limited-brand-config";
import { cnyToU, useMibanUsdtCnyRate } from "./useMibanUsdtCnyRate";
import { mtrpc } from "./mibanTrpc";
import { LimitedCartButton } from "./LimitedProductCart";

function getActiveSku(
  product: LimitedProduct,
  availability: Map<string, any>,
  useStaticFallback: boolean
) {
  return product.skus.find(sku => {
    if (!sku.active) return false;
    const runtime = availability.get(`${product.key}:${sku.id}`);
    return useStaticFallback || runtime?.isOnSale === true;
  });
}

export default function LimitedBrandProducts() {
  const [location] = useLocation();
  const usdtCnyRate = useMibanUsdtCnyRate();
  const path = location.split("?")[0];
  const localPreviewMode = import.meta.env.DEV;
  const brandSlug = path.endsWith("/tuoquetang") ? "tuoquetang" : "herbalife";
  const brand = getMibanLimitedBrandBySlug(brandSlug);
  const { data: availability, isLoading: availabilityLoading } =
    mtrpc.limitedProduct.publicAvailability.useQuery(undefined, {
      // 本地热预览不触发真实数据库的SKU初始化；生产始终读取运营库存状态。
      enabled: !localPreviewMode,
    });
  const availabilityBySku = useMemo(
    () =>
      new Map<string, any>(
        (availability ?? []).map((item: any) => [
          `${item.productKey}:${item.skuId}`,
          item,
        ])
      ),
    [availability]
  );

  const theme = brand?.theme ?? HERBALIFE_THEME;
  const brandProducts = useMemo(
    () =>
      mibanLimitedProducts.filter(
        product =>
          product.brand === brand?.brand &&
          product.status === "on_sale" &&
          Boolean(
            getActiveSku(
              product,
              availabilityBySku,
              localPreviewMode || availabilityLoading
            )
          )
      ),
    [availabilityBySku, availabilityLoading, brand?.brand, localPreviewMode]
  );

  if (!brand) {
    return (
      <div className="min-h-screen bg-white px-5 pt-10 text-center text-sm text-gray-400">
        品牌资料暂不可用
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: theme.canvas }}>
      <header
        className="border-b bg-white px-5 pb-4 pt-5"
        style={{ borderColor: theme.border }}
      >
        <Link
          href="/p/proj_hzxm2t/limited"
          className="inline-flex items-center gap-1 text-[12px] font-medium active:opacity-65"
          style={{ color: theme.muted }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
          返回
        </Link>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <span
              className="text-[11px] font-bold tracking-[0.12em]"
              style={{ color: theme.primary }}
            >
              {brand.eyebrow}
            </span>
            <h1
              className="mt-1 text-[22px] font-extrabold tracking-tight"
              style={{ color: theme.navy }}
            >
              {brand.title}
            </h1>
            <p className="mt-1 text-[11px]" style={{ color: theme.muted }}>
              {localPreviewMode
                ? "本地上架预览，不会初始化库存状态"
                : "点击商品查看完整图文详情"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <LimitedCartButton compact accent={theme.primary} />
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{
                background: theme.surfaceMuted,
                color: theme.primary,
              }}
            >
              {`${brandProducts.length} 件在售`}
            </span>
          </div>
        </div>
      </header>

      <section
        className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-[480px]"
        aria-label={`${brand.title}商品`}
      >
        {brandProducts.length > 0 ? (
          <div className="space-y-3">
            {brandProducts.map(product => {
              const sku = getActiveSku(
                product,
                availabilityBySku,
                localPreviewMode || availabilityLoading
              );
              const priceU = sku ? cnyToU(sku.priceCny, usdtCnyRate) : null;
              // 图片按钮自适应融合方案：佗鹊堂商品使用为4:5图槽制作的静物图；
              // 右侧文字、金额与按钮采用独立栅格，不在不同手机宽度下争抢同一行。
              const useAdaptiveProductCard = brandSlug === "tuoquetang";
              return (
                <Link
                  key={product.key}
                  href={`/p/proj_hzxm2t/limited/${product.key}${localPreviewMode ? "?preview=1" : ""}`}
                  className="block overflow-hidden rounded-[20px] border bg-white shadow-[0_6px_16px_rgba(0,0,0,0.05)] active:scale-[0.99]"
                  style={{ borderColor: theme.border }}
                >
                  <article className="grid h-[165px] grid-cols-[132px_minmax(0,1fr)] max-[360px]:grid-cols-[118px_minmax(0,1fr)]">
                    <div
                      className="relative flex min-w-0 items-center justify-center overflow-hidden"
                      style={{ background: product.card.theme.background }}
                    >
                      <div
                        className="absolute left-0 top-3 z-10 rounded-r-full px-2.5 py-1 text-[9px] font-bold text-white"
                        style={{ background: product.card.theme.accent }}
                      >
                        {product.card.badge}
                      </div>
                      <img
                        src={product.card.image}
                        alt={product.card.title}
                        className={`h-full w-full ${useAdaptiveProductCard ? "object-cover object-center" : "object-contain p-3"}`}
                      />
                      {useAdaptiveProductCard && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/20 to-transparent" />
                      )}
                    </div>

                    <div className="flex min-w-0 flex-col justify-between px-3.5 py-3 max-[360px]:px-2.5">
                      <div>
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: theme.primary }}
                        >
                          {product.category}
                        </span>
                        <h2
                          className="mt-1 line-clamp-1 text-[16px] font-extrabold leading-5"
                          style={{ color: theme.navy }}
                        >
                          {product.card.title}
                        </h2>
                        <p
                          className="mt-1 line-clamp-2 text-[11px] leading-4"
                          style={{ color: theme.muted }}
                        >
                          {product.card.subtitle}
                        </p>
                        <span
                          className="mt-2 inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[9px] font-medium"
                          style={{
                            color: theme.primary,
                            background: theme.surfaceMuted,
                          }}
                        >
                          {product.card.highlights[0]}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                        <div
                          className="min-w-0 tabular-nums leading-none"
                          style={{ color: theme.price }}
                        >
                          <div className="flex items-baseline gap-0.5 whitespace-nowrap">
                            <span className="text-[20px] font-extrabold tracking-[-0.04em]">
                              {priceU === null ? "--" : priceU.toFixed(2)}
                            </span>
                            <span className="text-[9px] font-bold tracking-normal">
                              USDT
                            </span>
                            {sku && (
                              <span className="ml-0.5 text-[9px] font-medium opacity-70">
                                /{sku.unitLabel}
                              </span>
                            )}
                          </div>
                          {sku && (
                            <div className="mt-1 text-[10px] text-gray-400">
                              ≈ ¥{sku.priceCny.toFixed(2)}
                            </div>
                          )}
                        </div>
                        <span
                          className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[10px] font-bold max-[360px]:px-2"
                          style={{
                            color: theme.primary,
                            background: theme.surfaceMuted,
                          }}
                        >
                          购买
                          <ChevronRight
                            className="h-3.5 w-3.5"
                            strokeWidth={2.4}
                          />
                        </span>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        ) : (
          <div
            className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border bg-white text-center"
            style={{ borderColor: theme.border }}
          >
            <PackageOpen
              className="h-7 w-7"
              style={{ color: theme.subtle }}
              strokeWidth={1.6}
            />
            <p className="mt-2 text-[12px]" style={{ color: theme.subtle }}>
              该系列商品正在上新
            </p>
          </div>
        )}
      </section>

      <p
        className="px-5 pt-5 text-center text-[11px]"
        style={{ color: theme.subtle }}
      >
        {localPreviewMode
          ? "本地上架预览 · 不会初始化库存状态"
          : "点击商品可查看完整图文介绍、规格并购买"}
      </p>
    </div>
  );
}
