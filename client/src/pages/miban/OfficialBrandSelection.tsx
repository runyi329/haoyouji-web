import { Link, useLocation } from "wouter";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { MibanImage } from "./MibanImage";
import OfficialReferencePrice from "./OfficialReferencePrice";
import { getMibanOfficialBrand, mibanOfficialProducts, mibanOfficialProductPath } from "@shared/miban-official-selection";
import { getMibanOfficialCardVisual } from "@shared/miban-official-card-visuals";

export default function OfficialBrandSelection() {
  const [location] = useLocation();
  const slug = location.split("?")[0].split("/").filter(Boolean).pop() ?? "";
  const brand = getMibanOfficialBrand(slug);
  if (!brand) return <div className="px-5 py-10 text-center text-sm text-gray-400">该精选系列暂不可用</div>;
  const products = mibanOfficialProducts.filter(product => product.brandSlug === brand.slug);
  const { theme } = brand;

  return (
    <div className="min-h-screen pb-8" style={{ background: theme.canvas }}>
      <header className="border-b bg-white px-4" style={{ borderColor: theme.border }}>
        <div className="mx-auto grid h-12 max-w-[480px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Link href="/p/proj_hzxm2t/limited" className="inline-flex min-h-10 items-center gap-1 text-xs" style={{ color: theme.muted }}>
            <ArrowLeft className="h-3.5 w-3.5" />返回
          </Link>
          <h1 className="min-w-0 text-center text-[17px] font-extrabold" style={{ color: theme.navy }}>{brand.title}</h1>
          <MibanImage src={brand.logo} variant="icon" alt={brand.brand} className="h-7 w-10 object-contain" priority />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[512px] px-4 pt-4" data-official-brand={brand.slug}>
        <div className="mb-4 px-1">
          <p className="text-[10px] font-semibold tracking-[0.16em]" style={{ color: theme.primary }}>{brand.eyebrow}</p>
          <p className="mt-1 text-[13px]" style={{ color: theme.navy }}>{brand.description}</p>
          <p className="mt-2 text-[11px] leading-5" style={{ color: theme.muted }}>中国官网产品资料精选，零售价按当前汇率折算为 U。</p>
        </div>
        <div className="space-y-3">
          {products.map((product, index) => {
            const visual = getMibanOfficialCardVisual(product.key);
            const shortSpecification = product.specification.split(/[；;]/)[0];
            return (
              <Link key={product.key} href={mibanOfficialProductPath(product.key)} className="block overflow-hidden rounded-[20px] border bg-white shadow-[0_6px_16px_rgba(0,0,0,0.04)] active:scale-[0.99]" style={{ borderColor: theme.border }}>
                <article className="grid min-h-[210px] grid-cols-[132px_minmax(0,1fr)] max-[360px]:grid-cols-[118px_minmax(0,1fr)]" data-official-product={product.key}>
                  <div data-official-card-visual={visual ? "full-bleed" : "original"} className="relative min-w-0 overflow-hidden" style={{ background: visual?.background ?? theme.surfaceMuted }}>
                    <MibanImage src={visual?.image || product.cardImageUrl || product.heroImageUrl} alt={product.name} variant="thumbnail" priority={index === 0} className={visual ? "absolute inset-0 h-full w-full object-cover object-center" : "absolute inset-0 h-full w-full object-contain p-3"} style={visual?.blend ? { mixBlendMode: visual.blend } : undefined} />
                    {visual && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-r from-transparent to-white" />}
                  </div>
                  <div className="flex min-w-0 flex-col justify-between px-3 py-3 max-[360px]:px-2.5">
                    <div>
                      <p className="text-[10px] font-bold" style={{ color: theme.primary }}>{product.category}</p>
                      <h2 className="mt-1 text-[16px] font-extrabold leading-6" style={{ color: theme.navy }}>{product.name}</h2>
                      <p className="mt-1 text-[11px] leading-4" style={{ color: theme.muted }}>{shortSpecification}</p>
                      <p className="mt-2 line-clamp-2 text-[11px] leading-4" style={{ color: theme.muted }}>{product.summary}</p>
                      {product.priceSourceNotice && <p className="mt-2 text-[10px] leading-4" style={{ color: theme.muted }} data-official-price-origin>{product.priceSourceNotice}</p>}
                      {product.detailStatus === "pending_materials" && <p className="mt-2 text-[10px] leading-4 text-amber-700" data-official-card-pending>部分官方说明待补齐</p>}
                    </div>
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                      <div className="min-w-0" data-official-card-price><OfficialReferencePrice priceCny={product.officialPriceCny} compact /></div>
                      <span data-official-card-action className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1.5 text-[10px] font-bold" style={{ background: theme.surfaceMuted, color: theme.primary }}>查看详情<ChevronRight className="h-3 w-3" /></span>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
        {products.length === 0 && <p className="py-16 text-center text-sm text-gray-400">官网商品资料正在整理</p>}
      </main>
    </div>
  );
}
