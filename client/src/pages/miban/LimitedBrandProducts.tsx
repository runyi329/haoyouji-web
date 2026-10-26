import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, ChevronRight, PackageOpen } from "lucide-react";
import {
  mibanLimitedProducts,
  type LimitedProduct,
} from "../../../../shared/miban-limited-products";
import { HERBALIFE_THEME } from "../../../../shared/herbalife-theme";
import { cnyToU, useMibanUsdtCnyRate } from "./useMibanUsdtCnyRate";
import { mtrpc } from "./mibanTrpc";

const BRAND = "康宝莱";
const HERBALIFE_ACCENT = HERBALIFE_THEME.primary;

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
  const usdtCnyRate = useMibanUsdtCnyRate();
  const { data: availability, isLoading: availabilityLoading } =
    mtrpc.limitedProduct.publicAvailability.useQuery();
  const availabilityBySku = useMemo(
    () =>
      new Map(
        (availability ?? []).map((item: any) => [
          `${item.productKey}:${item.skuId}`,
          item,
        ])
      ),
    [availability]
  );
  const brandProducts = useMemo(
    () =>
      mibanLimitedProducts.filter(
        product =>
          product.brand === BRAND &&
          product.status === "on_sale" &&
          Boolean(getActiveSku(product, availabilityBySku, availabilityLoading))
      ),
    [availabilityBySku, availabilityLoading]
  );

  return (
    <div
      className="min-h-screen pb-8"
      style={{ background: HERBALIFE_THEME.canvas }}
    >
      <header
        className="border-b bg-white px-5 pb-4 pt-5"
        style={{ borderColor: HERBALIFE_THEME.border }}
      >
        <Link
          href="/p/proj_hzxm2t/limited"
          className="inline-flex items-center gap-1 text-[12px] font-medium active:opacity-65"
          style={{ color: HERBALIFE_THEME.muted }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
          返回
        </Link>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <span
              className="text-[11px] font-bold tracking-[0.12em]"
              style={{ color: HERBALIFE_THEME.primary }}
            >
              HERBALIFE
            </span>
            <h1
              className="mt-1 text-[22px] font-extrabold tracking-tight"
              style={{ color: HERBALIFE_THEME.navy }}
            >
              康宝莱系列
            </h1>
            <p
              className="mt-1 text-[11px]"
              style={{ color: HERBALIFE_THEME.muted }}
            >
              点击商品查看完整图文详情
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{
              background: HERBALIFE_THEME.surfaceMuted,
              color: HERBALIFE_THEME.primary,
            }}
          >
            {brandProducts.length} 件在售
          </span>
        </div>
      </header>

      <section className="mx-4 mt-4" aria-label="康宝莱系列商品">
        {brandProducts.length > 0 ? (
          <div className="space-y-3">
            {brandProducts.map(product => {
              const sku = getActiveSku(
                product,
                availabilityBySku,
                availabilityLoading
              );
              const priceU = sku ? cnyToU(sku.priceCny, usdtCnyRate) : null;
              return (
                <Link
                  key={product.key}
                  href={`/p/proj_hzxm2t/limited/${product.key}`}
                  className="block overflow-hidden rounded-[20px] border bg-white shadow-[0_6px_16px_rgba(0,0,0,0.05)] active:scale-[0.99]"
                  style={{ borderColor: HERBALIFE_THEME.border }}
                >
                  <article className="flex h-[142px]">
                    <div
                      className="relative flex w-[42%] shrink-0 items-center justify-center overflow-hidden"
                      style={{ background: product.card.theme.background }}
                    >
                      <div
                        className="absolute left-0 top-3 rounded-r-full px-2.5 py-1 text-[9px] font-bold text-white"
                        style={{ background: HERBALIFE_ACCENT }}
                      >
                        精选
                      </div>
                      <img
                        src={product.card.image}
                        alt={product.card.title}
                        className="h-[142px] w-full object-contain p-3"
                      />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-between p-3.5">
                      <div>
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: HERBALIFE_ACCENT }}
                        >
                          {product.category}
                        </span>
                        <h2
                          className="mt-1 line-clamp-1 text-[16px] font-extrabold leading-5"
                          style={{ color: HERBALIFE_THEME.navy }}
                        >
                          {product.card.title}
                        </h2>
                        <p
                          className="mt-1 line-clamp-2 text-[11px] leading-4"
                          style={{ color: HERBALIFE_THEME.muted }}
                        >
                          {product.card.subtitle}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {product.card.highlights
                            .slice(0, 2)
                            .map(highlight => (
                              <span
                                key={highlight}
                                className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                                style={{
                                  color: HERBALIFE_ACCENT,
                                  background: HERBALIFE_THEME.surfaceMuted,
                                }}
                              >
                                {highlight}
                              </span>
                            ))}
                        </div>
                      </div>

                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div
                          className="leading-none"
                          style={{ color: HERBALIFE_THEME.price }}
                        >
                          <div className="flex items-baseline">
                            <span className="text-[21px] font-extrabold">
                              {priceU === null ? "--" : priceU.toFixed(2)}
                            </span>
                            <span className="ml-0.5 text-[11px] font-bold">
                              U
                            </span>
                            {sku && (
                              <span className="ml-1 text-[10px] font-medium opacity-70">
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
                          className="inline-flex items-center gap-0.5 text-[10px] font-bold"
                          style={{ color: HERBALIFE_ACCENT }}
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
            style={{ borderColor: HERBALIFE_THEME.border }}
          >
            <PackageOpen
              className="h-7 w-7"
              style={{ color: HERBALIFE_THEME.subtle }}
              strokeWidth={1.6}
            />
            <p
              className="mt-2 text-[12px]"
              style={{ color: HERBALIFE_THEME.subtle }}
            >
              该系列商品正在上新
            </p>
          </div>
        )}
      </section>

      <p
        className="px-5 pt-5 text-center text-[11px]"
        style={{ color: HERBALIFE_THEME.subtle }}
      >
        点击商品可查看完整图文介绍、规格并购买
      </p>
    </div>
  );
}
