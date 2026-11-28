import { useState } from "react";
import { Link, useRoute } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MibanImage } from "./MibanImage";
import { getMibanOfficialBrand, getMibanOfficialProduct, mibanOfficialBrandPath } from "@shared/miban-official-selection";
import { getOfficialPosterLayout } from "@shared/miban-official-poster-layout";
import NuskinMobilePoster from "./NuskinMobilePoster";
import OfficialMobilePoster from "./OfficialMobilePoster";
import OfficialReferencePrice from "./OfficialReferencePrice";

export default function OfficialProductDetail() {
  const [, params] = useRoute("/p/proj_hzxm2t/limited/official/:productKey");
  const product = getMibanOfficialProduct(params?.productKey ?? "");
  const brand = getMibanOfficialBrand(product?.brandSlug ?? "");
  const [slide, setSlide] = useState(0);
  if (!product || !brand) return <div className="px-5 py-10 text-center text-sm text-gray-400">该商品资料暂不可用</div>;
  const { theme } = brand;
  const packImages = [product.heroImageUrl, ...product.gallery.filter(image => image.kind === "packaging").map(image => image.url)].filter((url, index, all) => url && all.indexOf(url) === index);
  const currentSlide = Math.min(slide, packImages.length - 1);
  const posters = product.gallery.filter(image => image.kind !== "packaging" && image.url !== product.heroImageUrl);
  const isFullPosterHero = currentSlide === 0 && product.heroLayout === "poster";
  const hasMobileGuide = product.key === "nuskin-official-1" || Boolean(product.mobilePoster);
  const salePrice = product.officialPriceCny;
  const hasSalePrice = typeof salePrice === "number" && Number.isFinite(salePrice) && salePrice > 0;
  const hasExpandedPoster = product.key !== "nuskin-official-1" && Boolean(product.mobilePoster);
  const detailSections = [
    { title: "产品介绍", selector: "[data-official-poster-stack]", exists: true },
    { title: "使用方法", selector: '[data-official-mobile-layout="usage"]', exists: product.mobilePoster?.parts.some(part => getOfficialPosterLayout(part) === "usage") },
    { title: "产品说明", selector: '[data-official-mobile-layout="product"]', exists: product.mobilePoster?.parts.some(part => getOfficialPosterLayout(part) === "product") },
    ...product.brandSlug !== "nuskin" ? [
      { title: "成分说明", selector: '[data-official-mobile-layout="ingredients"]', exists: product.mobilePoster?.parts.some(part => getOfficialPosterLayout(part) === "ingredients") },
      { title: "研究资料", selector: '[data-official-mobile-layout="study"]', exists: product.mobilePoster?.parts.some(part => getOfficialPosterLayout(part) === "study") },
      { title: "资质说明", selector: '[data-official-mobile-layout="certificate"]', exists: product.mobilePoster?.parts.some(part => getOfficialPosterLayout(part) === "certificate") },
    ] : [],
  ].filter(section => section.exists);
  function goToDetails(selector: string) {
    const target = document.querySelector(selector);
    if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 112, behavior: "smooth" });
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[480px] bg-white pb-8" data-official-detail={product.key} data-official-detail-brand={brand.slug}>
      <header className="sticky top-[52px] z-30 grid h-12 grid-cols-[40px_minmax(0,1fr)_40px] items-center border-b bg-white/95 px-4 backdrop-blur" style={{ borderColor: theme.border }}>
        <Link href={mibanOfficialBrandPath(brand.slug)} aria-label={`返回${brand.title}`} className="flex h-10 w-10 items-center justify-center"><ChevronLeft className="h-5 w-5" /></Link>
        <span className="text-center text-[14px] font-bold" style={{ color: theme.navy }}>产品详情</span>
        <MibanImage src={brand.logo} variant="icon" alt={brand.brand} className="h-6 w-10 object-contain" />
      </header>
      <section className="relative" style={{ background: theme.canvas }} aria-label="官方产品展示图">
        <div className={isFullPosterHero ? "w-full" : "aspect-square w-full"} data-official-hero-layout={isFullPosterHero ? "poster" : "packaging"}>
          <MibanImage key={packImages[currentSlide]} src={packImages[currentSlide]} variant="hero" priority width={isFullPosterHero ? product.heroImageSize?.width : undefined} height={isFullPosterHero ? product.heroImageSize?.height : undefined} alt={`${product.name}官方产品展示图 ${currentSlide + 1}`} className={isFullPosterHero ? "block h-auto w-full object-contain object-center" : "h-full w-full object-contain p-6"} />
        </div>
        {packImages.length > 1 && <>
          <button type="button" aria-label="上一张产品图" onClick={() => setSlide((currentSlide + packImages.length - 1) % packImages.length)} className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-sm"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" aria-label="下一张产品图" onClick={() => setSlide((currentSlide + 1) % packImages.length)} className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-sm"><ChevronRight className="h-5 w-5" /></button>
          <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5">{packImages.map((url, index) => <button key={url} type="button" aria-label={`查看第${index + 1}张产品图`} onClick={() => setSlide(index)} className="h-1.5 rounded-full" style={{ width: index === currentSlide ? 18 : 6, background: index === currentSlide ? theme.primary : theme.border }} />)}</div>
        </>}
      </section>
      <section className="border-b px-5 py-5" style={{ borderColor: theme.border }}>
        <p className="text-[11px] font-semibold" style={{ color: theme.primary }}>{brand.brand} · {product.category}</p>
        <h1 className="mt-2 text-[23px] font-extrabold leading-8" style={{ color: theme.navy }}>{product.name}</h1>
        <p className="mt-2 text-[13px] leading-6" style={{ color: theme.muted }}>{product.summary}</p>
        <p className="mt-3 text-[12px] text-gray-500">规格：{product.specification || "请以实物包装说明为准"}</p>
        <div data-official-sale-price data-price-status={hasSalePrice ? "confirmed" : "pending"} className="mt-4 rounded-[18px] border px-4 py-3" style={{ background: theme.canvas, borderColor: theme.border }}>
          <OfficialReferencePrice priceCny={salePrice} />
          {hasSalePrice && product.officialPriceCheckedDate && <p data-official-price-checked className="mt-1 text-[11px] leading-5" style={{ color: theme.muted }}>价格核验日期：{product.officialPriceCheckedDate}</p>}
          {product.priceSourceNotice && <p data-official-price-origin className="mt-2 text-[11px] leading-5" style={{ color: theme.muted }}>{product.priceSourceNotice}</p>}
          <p className="mt-1 text-[11px] leading-5" style={{ color: theme.muted }}>本页展示产品资料与官网参考价，此页不收款、不创建订单。</p>
        </div>
        {product.detailStatus === "pending_materials" && <div data-official-details-pending className="mt-4 border-l-2 border-amber-300 pl-3 text-[12px] leading-6 text-amber-900"><p className="font-semibold">部分官方说明待补齐</p><p className="mt-1">{product.materialsNotice || "当前仅展示已核验资料，尚未取得的说明不会以其他商品内容补写。"}</p></div>}
      </section>
      {hasExpandedPoster && <nav aria-label="产品详情章节" data-official-detail-navigation className={product.brandSlug === "nuskin" ? "grid gap-2 px-5 py-4" : "flex flex-wrap border-b px-5 py-2"} style={product.brandSlug === "nuskin" ? { gridTemplateColumns: `repeat(${detailSections.length}, minmax(0, 1fr))` } : { borderColor: theme.border }}>
        {detailSections.map(section => <button key={section.title} type="button" onClick={() => goToDetails(section.selector)} className={product.brandSlug === "nuskin" ? "rounded-full border border-[#CAD5E0] bg-[#F5F7FA] px-2 py-2.5 text-[12px] font-semibold text-[#28445C]" : "min-h-11 flex-1 whitespace-nowrap px-3 py-2.5 text-[14px] font-semibold"} style={product.brandSlug === "nuskin" ? undefined : { color: theme.navy }}>{section.title}</button>)}
      </nav>}
      <section className="px-5 py-5" aria-label="产品特点">
        <h2 className="text-[17px] font-extrabold" style={{ color: theme.navy }}>产品特点</h2>
        <div className="mt-3 space-y-3">{product.features.map((feature, index) => <div key={feature} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: theme.surfaceMuted, color: theme.primary }}>{String(index + 1).padStart(2, "0")}</span><p className="text-[13px] leading-6 text-gray-600">{feature}</p></div>)}</div>
      </section>
      {(posters.length > 0 || product.mobilePoster) && <section aria-label="中国官网图文介绍">
        <div className="px-5 pb-3"><h2 className="text-[17px] font-extrabold" style={{ color: theme.navy }}>产品图文介绍</h2><p className="mt-1 text-[11px] text-gray-400">{product.key === "nuskin-official-1" ? "中国官网连续海报，研究与使用说明已做手机排版，保留原始图表、照片和研究条件。" : product.brandSlug === "nuskin" ? "中国官网完整场景连续展示，研究、用法与规格适配手机阅读。" : "官方图文连续展示，已取得的研究与产品资料按手机排版。"}</p></div>
        <div data-official-poster-stack={posters.length} style={{ margin: 0, padding: 0, lineHeight: 0, fontSize: 0 }}>
          {product.key === "nuskin-official-1" ? <NuskinMobilePoster /> : product.mobilePoster ? <OfficialMobilePoster poster={product.mobilePoster} product={product} /> : posters.map((image, index) => <MibanImage key={image.url} src={image.url} variant="poster" width={image.width} height={image.height} alt={image.caption || `${product.name}官网介绍 ${index + 1}`} className="block h-auto w-full object-contain object-center" style={{ display: "block", width: "100%", maxWidth: "100%", height: "auto", objectFit: "contain", objectPosition: "center", margin: 0, padding: 0, border: 0 }} loading="lazy" />)}
        </div>
      </section>}
      {!hasMobileGuide && <section className="space-y-5 px-5 pb-5 text-[13px] leading-6 text-gray-600">
        {product.usage && <div><h2 className="text-[17px] font-extrabold" style={{ color: theme.navy }}>使用方法</h2><p className="mt-2 whitespace-pre-line">{product.usage}</p></div>}
        {product.ingredients && <div><h2 className="text-[17px] font-extrabold" style={{ color: theme.navy }}>成分说明</h2><p className="mt-2 whitespace-pre-line">{product.ingredients}</p></div>}
        {product.warnings.length > 0 && <div className="rounded-xl bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-800"><h2 className="font-bold">使用提示</h2>{product.warnings.map(warning => <p key={warning} className="mt-1">{warning}</p>)}</div>}
      </section>}
    </main>
  );
}
