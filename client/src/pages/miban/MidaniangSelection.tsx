import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { midaniangSelectionCatalog } from "@shared/midaniang-selection-catalog";
import { midaniangSelectionAssets } from "@shared/midaniang-selection-assets";
import { cnyToU, useMibanUsdtCnyRate } from "./useMibanUsdtCnyRate";
import MidaniangOrganicMark from "./MidaniangOrganicMark";
import { MibanImage, getMibanImageSource } from "./MibanImage";

export const MIDANIANG_SELECTION_PATH = "/p/proj_hzxm2t/limited/midaniang";

export default function MidaniangSelection() {
  const [merchantIntroductionOpen, setMerchantIntroductionOpen] =
    useState(false);
  const usdtCnyRate = useMibanUsdtCnyRate();

  return (
    <main
      className="mx-auto min-h-screen w-full max-w-[480px] bg-[#f7f4ee] pb-10 text-[#343a31]"
      data-testid="midaniang-selection"
    >
      <header className="grid min-h-14 grid-cols-[64px_minmax(0,1fr)_64px] items-center border-b border-[#e5e0d5] px-4">
        <Link
          href="/p/proj_hzxm2t/limited"
          aria-label="返回品牌列表"
          className="inline-flex min-h-11 items-center gap-1 text-[12px] text-[#8d292c]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回
        </Link>
        <h1 className="min-w-0 text-center text-[18px] font-semibold tracking-[0.06em]">
          米大娘精选
        </h1>
        <span aria-hidden="true" />
      </header>

      <section aria-label="米大娘品牌介绍" className="px-4 pb-4 pt-6">
        <div className="flex items-center gap-4">
          <MibanImage
            variant="icon"
            src={midaniangSelectionAssets.logo}
            alt="米大娘品牌Logo"
            width={72}
            height={72}
            className="h-[72px] w-[72px] shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center justify-between gap-2"
              data-testid="midaniang-brand-title-row"
            >
              <p className="shrink-0 text-[20px] font-medium tracking-[0.12em] text-[#8d292c]">
                米大娘
              </p>
              <button
                type="button"
                aria-expanded={merchantIntroductionOpen}
                aria-controls="midaniang-merchant-introduction"
                data-testid="midaniang-merchant-introduction-toggle"
                onClick={() => setMerchantIntroductionOpen(open => !open)}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg text-[12px] text-[#8d292c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8d292c]"
              >
                商家介绍
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${merchantIntroductionOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
            </div>
            <p className="mt-1 text-[12px] leading-6 text-[#676b60]">
              一份米粮，一份日常心意
            </p>
            <p className="text-[11px] text-[#676b60]">
              商家产地介绍 · 五常龙凤山镇
            </p>
          </div>
        </div>
        <div
          id="midaniang-merchant-introduction"
          data-testid="midaniang-merchant-introduction"
          hidden={!merchantIntroductionOpen}
        >
          {merchantIntroductionOpen && (
            <p className="mt-3 border-t border-[#e5e0d5] pt-3 text-[12px] leading-6 text-[#676b60]">
              米大娘关注有机稻田与日常餐桌，商家确认产品已获有机认证。一年一季，包装设有编号；实际批次、认证范围与信息以认证证书和实物标签为准。
            </p>
          )}
        </div>
      </section>

      <section aria-label="米大娘精选资料列表" className="px-4">
        <div className="space-y-3" data-testid="midaniang-product-list">
          {midaniangSelectionCatalog.map((item, index) => {
            const priceU = cnyToU(item.priceCny, usdtCnyRate);
            return (
              <div
                key={item.key}
                className="relative"
                data-testid="midaniang-product-card"
              >
                <Link
                  href={`${MIDANIANG_SELECTION_PATH}/${item.key}`}
                  aria-label={`查看${item.title}详情`}
                  className="block overflow-hidden rounded-[20px] border border-[#e5e0d5] bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8d292c]"
                  data-selection-key={item.key}
                >
                  <article
                    className="grid min-h-[165px] grid-cols-[132px_minmax(0,1fr)_24px] max-[360px]:grid-cols-[106px_minmax(0,1fr)_20px]"
                    data-testid="midaniang-product-row"
                  >
                    <div
                      className="relative isolate min-w-0 overflow-hidden bg-[#eee8dd]"
                      data-testid="midaniang-product-media"
                    >
                      <div
                        aria-hidden="true"
                        className="absolute -inset-3 bg-cover bg-center opacity-60 blur-[10px]"
                        style={{
                          backgroundImage: `url("${getMibanImageSource(midaniangSelectionAssets.grid[item.key], "thumbnail")}")`,
                        }}
                      />
                      <MibanImage
                        variant="thumbnail"
                        priority={index === 0}
                        src={midaniangSelectionAssets.grid[item.key]}
                        alt={`米大娘${item.title}包装示意`}
                        width={1024}
                        height={1024}
                        loading={index === 0 ? "eager" : "lazy"}
                        className="absolute inset-0 block h-full w-full object-contain"
                        style={{
                          maskImage:
                            "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)",
                          WebkitMaskImage:
                            "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)",
                        }}
                      />
                      <div
                        aria-hidden="true"
                        data-testid="midaniang-product-media-gradient"
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(90deg, rgba(255,255,255,0) 60%, rgba(255,255,255,0.35) 80%, #fff 100%)",
                        }}
                      />
                      <div
                        aria-hidden="true"
                        data-testid="midaniang-product-media-vertical-gradient"
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.55) 8%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 78%, rgba(255,255,255,0.55) 92%, #fff 100%)",
                        }}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col justify-between px-3 py-3 max-[360px]:px-2.5">
                      <div className="min-w-0 pr-6">
                        <h2
                          className="min-h-11 line-clamp-2 break-words text-[16px] font-medium leading-[22px]"
                          data-testid="midaniang-product-name"
                        >
                          {item.title}
                        </h2>
                        <p className="mt-1 break-words text-[11px] leading-[18px] text-[#676b60]">
                          {item.specification}
                        </p>
                      </div>
                      <div className="mt-3 min-w-0">
                        <p
                          className="flex flex-wrap items-baseline gap-x-1 tabular-nums text-[#8d292c]"
                          data-testid="midaniang-list-price-u"
                        >
                          <span className="text-[20px] font-medium leading-6">
                            {priceU.toFixed(2)}
                          </span>
                          <span className="text-[10px]">USDT /盒</span>
                        </p>
                        <p
                          className="mt-1 text-[10px] leading-4 text-[#777b70]"
                          data-testid="midaniang-list-price-cny"
                        >
                          ≈ ¥{item.priceCny.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <span
                      aria-hidden="true"
                      data-testid="midaniang-product-entry-arrow"
                      className="flex items-center justify-center text-[#8d292c]/70"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </article>
                </Link>
                <MidaniangOrganicMark
                  variant="compact"
                  className="absolute right-2 top-3 z-10"
                  data-testid={`midaniang-list-organic-mark-${item.key}`}
                />
              </div>
            );
          })}
        </div>
      </section>
      <footer className="mt-8 border-t border-[#e5e0d5] px-4 pt-5 text-[11px] leading-6 text-[#777b70]">
        商品信息由商家提供，包装图片为设计展示，实际规格、批次与日期以实物标签为准。人民币为商家推荐零售价，USDT价格按实时汇率折算。
      </footer>
    </main>
  );
}
