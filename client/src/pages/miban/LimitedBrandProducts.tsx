import { MibanImage } from "./MibanImage";
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
import ChongbanSectionTabs from "@/components/ChongbanSectionTabs";
import { getMibanLimitedCollection } from "../../../../shared/miban-limited-collections";
import { LimitedOffShelfBadge, useMibanLimitedCollections } from "./useMibanLimitedCollections";
import { getMibanCountryCollection } from "../../../../shared/miban-country-collections";

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
  const brandSlug = path.split("/").filter(Boolean).pop() ?? "";
  const brand = getMibanLimitedBrandBySlug(brandSlug);
  const collection = getMibanLimitedCollection(brandSlug);
  const country = getMibanCountryCollection(brandSlug);
  const collectionsQuery = useMibanLimitedCollections();
  const { canPreviewInactive, viewerUserId } = collectionsQuery;
  const categoryOffShelf = collectionsQuery.inactiveSlugs.has(brandSlug);
  const { data: availability, isLoading: availabilityLoading } =
    mtrpc.limitedProduct.publicAvailability.useQuery({ viewerUserId }, {
      // 本地热预览不触发真实数据库的SKU初始化；生产始终读取运营库存状态。
      enabled: (!localPreviewMode || canPreviewInactive) && mibanLimitedProducts.some(product => product.brand === brand?.brand),
      staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true, refetchInterval: 15_000,
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

  const theme = brand?.theme ?? (country
    ? { ...HERBALIFE_THEME, primary: country.accent, navy: country.accent, canvas: country.background }
    : HERBALIFE_THEME);
  const brandProducts = useMemo(
    () =>
      mibanLimitedProducts.filter(
        product =>
          product.brand === brand?.brand &&
          (canPreviewInactive || product.status === "on_sale") &&
          Boolean(
            canPreviewInactive ? (!availabilityLoading && product.skus[0]) : getActiveSku(
              product,
              availabilityBySku,
              localPreviewMode
            )
          )
      ),
    [availabilityBySku, availabilityLoading, brand?.brand, localPreviewMode, canPreviewInactive]
  );

  if ((!brand && !collection) || (brand && brand.status !== "on_sale" && !localPreviewMode && !canPreviewInactive)) {
    return (
      <div className="min-h-screen bg-white px-5 pt-10 text-center text-sm text-gray-400">
        品牌资料暂不可用
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8" style={{ background: theme.canvas }}>
      <header
        className="grid h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b bg-white px-4"
        style={{ borderColor: theme.border }}
      >
        <Link
          href="/p/proj_hzxm2t/limited"
          className="inline-flex h-8 items-center gap-1 text-[12px] font-medium active:opacity-65"
          style={{ color: theme.muted }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
          返回
        </Link>
        <h1
          className="min-w-0 truncate text-center text-[17px] font-extrabold tracking-tight"
          style={{ color: theme.navy }}
        >
          {brand?.title ?? collection?.title}
        </h1>
        {country ? <span aria-hidden="true" className="w-8" /> : <LimitedCartButton compact accent={theme.primary} />}
      </header>

      {brandSlug === "wangka" && <ChongbanSectionTabs active="shop" />}

      <section
        className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-[480px]"
        aria-label={`${brand?.title ?? collection?.title}商品`}
      >
        {brandProducts.length > 0 ? (
          <div className="space-y-3">
            {brandProducts.map((product, imageIndex) => {
              const sku = getActiveSku(
                product,
                availabilityBySku,
                localPreviewMode
              ) ?? (canPreviewInactive ? product.skus.find(sku => sku.featured) ?? product.skus[0] : undefined);
              const isDraftPreview = product.status === "draft";
              const isOffShelf = canPreviewInactive && (categoryOffShelf || product.status !== "on_sale" || product.skus.every(item => !item.active || availabilityBySku.get(`${product.key}:${item.id}`)?.isOffShelf === true));
              const hasInactiveSku = canPreviewInactive && !isOffShelf && product.skus.some(item => !item.active || availabilityBySku.get(`${product.key}:${item.id}`)?.isOffShelf === true);
              const priceU = sku ? cnyToU(sku.priceCny, usdtCnyRate) : null;
              // 图片按钮自适应融合方案：佗鹊堂商品使用为4:5图槽制作的静物图；
              // 右侧文字、金额与按钮采用独立栅格，不在不同手机宽度下争抢同一行。
              const useAdaptiveProductCard =
                brandSlug === "tuoquetang" || brandSlug === "lingchuang";
              const useBlendedWineCard = brandSlug === "spain";
              return (
                <Link
                  key={product.key}
                  data-product-key={product.key}
                  href={`/p/proj_hzxm2t/limited/${product.key}${localPreviewMode ? "?preview=1" : ""}`}
                  className="block overflow-hidden rounded-[20px] border bg-white shadow-[0_6px_16px_rgba(0,0,0,0.05)] active:scale-[0.99]"
                  style={{ borderColor: theme.border }}
                >
                  <article className="grid h-[165px] grid-cols-[132px_minmax(0,1fr)] max-[360px]:grid-cols-[118px_minmax(0,1fr)]">
                    <div
                      className="relative flex min-w-0 items-center justify-center overflow-hidden"
                      style={{ background: useBlendedWineCard ? "#FFFFFF" : product.card.theme.background }}
                    >
                      {!useBlendedWineCard && <div
                        className="absolute left-0 top-3 z-10 rounded-r-full px-2.5 py-1 text-[9px] font-bold text-white"
                        style={{ background: product.card.theme.accent }}
                      >
                        {product.card.badge}
                      </div>}
                      <MibanImage variant="thumbnail" priority={imageIndex === 0}
                        src={product.card.image}
                        alt={product.card.title}
                        className={`h-full w-full ${useAdaptiveProductCard || useBlendedWineCard ? "object-cover object-center" : "object-contain p-3"}`}
                      />
                      {useBlendedWineCard && (
                        <div
                          aria-hidden="true"
                          data-testid="spain-list-image-blend"
                          className="pointer-events-none absolute inset-0"
                          style={{ background: product.key === "spain-marthu"
                            ? "linear-gradient(180deg,#FFFFFF 0%,rgba(255,255,255,0) 18%,rgba(255,255,255,0) 80%,#FFFFFF 100%),linear-gradient(90deg,rgba(255,255,255,0) 76%,#FFFFFF 100%)"
                            : "linear-gradient(180deg,rgba(255,255,255,0.35) 0%,rgba(255,255,255,0) 6%,rgba(255,255,255,0) 94%,rgba(255,255,255,0.35) 100%),linear-gradient(90deg,rgba(255,255,255,0) 76%,#FFFFFF 100%)" }}
                        />
                      )}
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
                        {isOffShelf && <LimitedOffShelfBadge className="ml-2" />}
                        {hasInactiveSku && <span className="ml-2 text-[10px] text-gray-500">部分规格已下架</span>}
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
                          {isOffShelf ? "查看" : isDraftPreview ? "资料预览" : "购买"}
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
              {country ? "该专区暂未添加商品" : brandSlug === "midaniang"
                ? "首批两款大米资料整理中"
                : "该系列商品正在上新"}
            </p>
            {country && <p className="mt-2 px-5 text-[11px] leading-5" style={{ color: theme.muted }}>
              商品、规格和价格确认后再添加。
            </p>}
            {brandSlug === "midaniang" && (
              <p className="mt-2 px-5 text-[11px] leading-5" style={{ color: theme.muted }}>
                先看品牌新形象，商品与规格确认后再开放购买。
              </p>
            )}
            {brandSlug === "wangka" && (
              <p className="mt-2 px-5 text-[11px] leading-5" style={{ color: theme.muted }}>
                图片为精选陈列展示，具体商品与规格确认后开放购买。
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
