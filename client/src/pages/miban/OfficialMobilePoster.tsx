import { Fragment, useState, type CSSProperties } from "react";
import type { MibanOfficialMobilePoster, MibanOfficialMobilePosterPart, MibanOfficialProduct, MibanOfficialProductImage } from "@shared/miban-official-selection";
import { getMibanOfficialBrand } from "@shared/miban-official-selection";
import { getOfficialPosterLayout, getOfficialStudyHighlights, getOfficialUsageFacts } from "@shared/miban-official-poster-layout";
import { getOfficialImmersiveVisual, type OfficialImmersiveVisual } from "@shared/miban-official-immersive-visuals";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MibanImage } from "./MibanImage";
import "./OfficialMobilePoster.css";

function MobileCopy({ text }: { text: string }) {
  const tokens = text.split(/((?:\d+[–-]\d+|\d+(?:\.\d+)?)(?:ppm|mL|ml|g|%|天|周|岁|个月)?|SPF\d*|ageLOC|AI[+-]?寡肽|A醇)/g);
  return <>{tokens.map((token, index) => index % 2 ? <span key={index} className="inline-block whitespace-nowrap">{token}</span> : <Fragment key={index}>{token}</Fragment>)}</>;
}

/** Contrast-aware defaults for solid/gradient official backgrounds; explicit metadata wins. */
function luminance(color: string): number | undefined {
  const hex = color.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  const rgb = color.trim().match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i);
  const channels = hex ? (hex.length === 3 ? [...hex].map(value => parseInt(value + value, 16)) : [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16))) : rgb ? rgb.slice(1, 4).map(Number) : undefined;
  if (!channels) return undefined;
  const linear = channels.map(value => { const channel = Math.min(255, Math.max(0, value)) / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function canvasStyle(visual: OfficialImmersiveVisual | undefined, poster: MibanOfficialMobilePoster, product?: MibanOfficialProduct): CSSProperties {
  const from = visual?.from ?? poster.background;
  const to = visual?.to ?? poster.background;
  const style: Record<string, string> = { "--poster-from": from, "--poster-to": to };
  if (product?.brandSlug === "nuskin") {
    // Preserve the original four Nu Skin canvases unless metadata explicitly overrides them.
    if (visual?.ink) style["--poster-ink"] = visual.ink;
    if (visual?.muted) style["--poster-muted"] = visual.muted;
    if (visual?.accent) style["--poster-accent"] = visual.accent;
    return style as CSSProperties;
  }
  const brand = getMibanOfficialBrand(product?.brandSlug ?? "");
  const backgrounds = [from, to].map(luminance).filter((value): value is number => value !== undefined);
  function contrast(color: string) {
    const light = luminance(color);
    return light === undefined || !backgrounds.length ? 0 : Math.min(...backgrounds.map(background => (Math.max(light, background) + 0.05) / (Math.min(light, background) + 0.05)));
  }
  const darkInk = brand?.theme.navy ?? "#28232a";
  const lightInk = "#fff9fc";
  const ink = visual?.ink ?? (contrast(lightInk) > contrast(darkInk) ? lightInk : darkInk);
  const muted = ink === lightInk ? "#e9dfe6" : brand?.theme.muted ?? "#655d65";
  const accent = poster.accent || brand?.theme.primary || ink;
  style["--poster-ink"] = ink;
  style["--poster-muted"] = visual?.muted ?? (contrast(muted) >= 4.5 ? muted : ink);
  style["--poster-accent"] = visual?.accent ?? (contrast(accent) >= 4.5 ? accent : ink);
  style["--poster-rule"] = "color-mix(in srgb, var(--poster-ink) 20%, transparent)";
  return style as CSSProperties;
}

function InfoPanel({ part, poster, product }: { part: MibanOfficialMobilePosterPart; poster: MibanOfficialMobilePoster; product?: MibanOfficialProduct }) {
  const [zoomImage, setZoomImage] = useState<MibanOfficialProductImage | null>(null);
  const photos = part.photos ?? [];
  const layout = getOfficialPosterLayout(part);
  const visual = getOfficialImmersiveVisual(product?.key, part.id, poster.background);
  const scene = visual?.scene;
  const highlights = layout === "study" ? getOfficialStudyHighlights(part) : [];
  const isSelfReport = highlights.some(item => item.kind === "self-report");
  const usageFacts = layout === "usage" ? getOfficialUsageFacts(part) : [];
  const title = layout === "product" ? "产品说明" : part.title;
  const brand = getMibanOfficialBrand(product?.brandSlug ?? "");
  const brandName = brand?.brand ?? product?.brand ?? "品牌";
  const eyebrow = part.eyebrow === "NU SKIN" && product?.brandSlug !== "nuskin" ? brand?.eyebrow : part.eyebrow;
  const meaningfulEyebrow = eyebrow && eyebrow !== "官方海报原文";
  const grouped = photos.length > 1;

  function photoButton(photo: MibanOfficialProductImage) {
    const evidence = layout === "study" || layout === "certificate";
    return <button key={photo.url} type="button" aria-label={`放大查看${part.title}原图`} onClick={() => setZoomImage(photo)} className={`official-poster-photo ${evidence ? "official-poster-evidence" : "official-poster-atmosphere"}`}>
      <MibanImage src={photo.url} variant="original" width={photo.width} height={photo.height} alt={photo.caption || `${part.title}官网原图`} className="block h-auto w-full object-contain" />
    </button>;
  }

  return <section data-official-mobile-info={part.id} data-official-mobile-layout={layout} data-official-mobile-source={part.sourceUrl ?? visual?.source} data-official-mobile-range={(part.sourceRange ?? visual?.range)?.join(":")} data-official-mobile-text-location={part.sourceTextLocation ?? visual?.textLocation} data-official-immersive-part={scene ? "native-scene" : "mobile-canvas"} data-official-mobile-visuals={scene ? "full-scene" : photos.length ? "official-photos" : "text-only"} className={`official-immersive-part ${scene ? "official-native-scene" : `official-mobile-canvas${photos.length ? "" : " official-mobile-copy-only"}`}`} style={canvasStyle(visual, poster, product)}>
    {scene ? <>
      {/* Intact official composition: product, flowers, scientific/ingredient artwork and copy stay together. */}
      <MibanImage src={scene.url} variant="original" width={scene.width} height={scene.height} alt={[part.title, eyebrow, ...(part.paragraphs ?? []), ...(part.bullets ?? [])].filter(Boolean).join("。") || `${brandName}官方完整产品场景`} data-official-full-scene className="block h-auto w-full" />
      {/* Full accessible transcript; it is not rendered as a second, detached set of cards. */}
      <div className="official-scene-transcript" data-official-mobile-copy><h2>{part.title}</h2>{part.paragraphs?.map((text, index) => <p key={index}>{text}</p>)}{part.bullets?.map((text, index) => <p key={index}>{text}</p>)}</div>
      {part.footnotes?.length ? <div data-official-mobile-footnotes className="official-scene-transcript">{part.footnotes.map((text, index) => <p key={index}>{text}</p>)}</div> : null}
    </> : <>
      <div className="official-poster-heading">
        {layout !== "note" && <h2 className="text-[26px]"><MobileCopy text={title ?? "产品介绍"} /></h2>}
        {meaningfulEyebrow && <p><MobileCopy text={eyebrow!} /></p>}
        {layout === "product" && <h3><MobileCopy text={part.title ?? product?.name ?? "产品说明"} /></h3>}
      </div>
      {photos.length > 0 && <div className={`official-poster-visuals ${grouped ? "official-poster-visuals-group" : ""}`} data-official-visual-treatment={layout === "study" || layout === "certificate" ? "unaltered-evidence" : "edge-blended-scene"}>{photos.map(photoButton)}</div>}
      <div className="official-poster-copy">
        {usageFacts.length > 0 && <dl data-official-usage-facts className="official-poster-facts">{usageFacts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd><MobileCopy text={fact.value} /></dd></div>)}</dl>}
        {highlights.length > 0 && <div data-official-study-highlights className={`official-poster-metrics ${isSelfReport ? "official-poster-metrics-paired" : ""}`}>{highlights.map(item => <div key={item.original} data-official-study-primary={item.primary || undefined} className={item.primary ? "official-poster-primary-metric" : ""}>
          <p className="official-poster-metric-label">{item.label}</p>
          {item.value && <p data-official-study-value className="official-poster-metric-value"><MobileCopy text={item.value} /></p>}
          <p className="official-poster-metric-description"><MobileCopy text={item.description} /></p>
        </div>)}</div>}
        {isSelfReport && <p data-official-self-report-note className="official-poster-annotation">{part.studyNote || "百分比为消费者自评认可人数占比，不是功效提升幅度。"}</p>}
        {part.paragraphs && part.paragraphs.length > 0 && <div className={`official-poster-paragraphs ${layout === "study" ? "official-poster-study-conditions" : ""}`} data-official-mobile-copy>
          {layout === "study" && <p className="official-poster-condition-heading">数据来源与测试条件</p>}
          {part.paragraphs.map((text, index) => <p key={index}><MobileCopy text={text} /></p>)}
        </div>}
        {part.bullets && part.bullets.length > 0 && layout !== "study" && <ul className="official-poster-list">{part.bullets.map((text, index) => <li key={index}><MobileCopy text={text} /></li>)}</ul>}
        {part.steps && part.steps.length > 0 && <ol className="official-poster-steps" data-official-mobile-steps>{part.steps.map((text, index) => <li key={index}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><p><MobileCopy text={text} /></p></li>)}</ol>}
        {part.specs && part.specs.length > 0 && <dl className="official-poster-specs" data-official-mobile-specs>{part.specs.map((spec, index) => <div key={index}><dt>{spec.label}</dt><dd><MobileCopy text={spec.value} /></dd></div>)}</dl>}
        {part.footnotes && part.footnotes.length > 0 && <div data-official-mobile-footnotes className="official-poster-annotation official-poster-footnotes">{part.footnotes.map((text, index) => <p key={index}><MobileCopy text={text} /></p>)}</div>}
      </div>
    </>}
    <Dialog open={Boolean(zoomImage)} onOpenChange={open => { if (!open) setZoomImage(null); }}><DialogContent className="max-h-[90dvh] w-[calc(100vw-24px)] max-w-[900px] overflow-auto p-3"><DialogTitle className="sr-only">{part.title}官网原图</DialogTitle>{zoomImage && <MibanImage src={zoomImage.url} variant="original" alt={zoomImage.caption} width={zoomImage.width} height={zoomImage.height} className="block h-auto max-w-none" style={{ width: zoomImage.width }} loading="eager" data-official-zoom-image />}</DialogContent></Dialog>
  </section>;
}

/** Edge-to-edge official scenes and source-matched readable canvases, never nested information cards. */
export default function OfficialMobilePoster({ poster, product }: { poster: MibanOfficialMobilePoster; product?: MibanOfficialProduct }) {
  const isNuskin = product?.brandSlug === "nuskin";
  const brandName = getMibanOfficialBrand(product?.brandSlug ?? "")?.brand ?? product?.brand ?? "品牌";
  return <div data-official-mobile-poster data-official-source-poster-count={poster.sourcePosterCount} data-official-substantial-section-count={poster.substantialSections} data-official-poster-style={isNuskin ? "nuskin-immersive-v4" : "official-immersive-v5"} data-official-poster-product={product?.key} data-official-poster-brand={product?.brandSlug ?? "official"} className="official-immersive-poster" style={canvasStyle(undefined, poster, product)}>
    {poster.parts.map(part => part.kind === "image" && part.image ? <MibanImage key={part.id} src={part.image.url} variant="poster" width={part.image.width} height={part.image.height} alt={part.image.caption || `${brandName}官网连续原海报`} data-official-mobile-source={part.sourceUrl} data-official-mobile-range={part.sourceRange?.join(":")} className="block h-auto w-full object-contain object-center" style={{ display: "block", width: "100%", maxWidth: "100%", height: "auto", margin: 0, padding: 0, border: 0 }} /> : <InfoPanel key={part.id} part={part} poster={poster} product={product} />)}
  </div>;
}
