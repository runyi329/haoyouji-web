import guideData from "@shared/miban-nuskin-product-guide.json";
import { getMibanOfficialProduct } from "@shared/miban-official-selection";
import { Moon, ShieldCheck, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { MibanImage } from "./MibanImage";

type Guide = {
  source: { startY: number; endY: number; url: string; width: number; height: number };
  usage: { frequency: string; time: string; steps: string[] };
  tolerance: { title: string; subtitle: string; retinolName: string; hydrationName: string; weeks: Array<{ label: string; retinolDays: string; hydrationDays: string }> };
  sunAdvice: { title: string; text: string };
  product: { name: string; photo: { url: string; width: number; height: number }; details: Array<{ label: string; value: string }>; notices: Array<{ label: string; text: string }> };
};
const guide = guideData as Guide;

function PosterSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section data-nuskin-guide-section={id} className="min-w-0 w-full px-5 pb-8 pt-8">
    <h2 className="mb-6 text-center text-[28px] font-bold leading-[1.4] text-[#28445C]" style={{ textWrap: "balance" }}>{title}</h2>
    {children}
  </section>;
}

/** Verified content shares one full-width canvas; rules replace nested card outlines. */
export default function NuskinProductGuide() {
  const product = getMibanOfficialProduct("nuskin-official-1")!;
  return <div
    data-nuskin-product-guide
    data-nuskin-source-range={`${guide.source.startY}:${guide.source.endY}`}
    aria-label="使用方法与产品说明海报"
    className="min-w-0 w-full"
    style={{ background: "linear-gradient(180deg, #294967 0px, #DCE6EF 80px, #E8EEF4 440px, #DCE6EF 100%)", color: "#28445C", fontSize: 14, lineHeight: 1.7, overflowWrap: "anywhere" }}
  >
    <div aria-hidden="true" className="h-20 w-full" />
    <PosterSection id="usage" title="使用方法">
      <div className="grid min-w-0 grid-cols-2 divide-x divide-[#9DB2C4] border-y border-[#9DB2C4] py-5 text-center">
        <div className="min-w-0 px-2">
          <p className="text-[12px] text-[#536D83]">使用频次</p>
          <p data-nuskin-guide-frequency className="mt-1 text-[27px] font-bold leading-[1.4]" style={{ textWrap: "balance" }}>{guide.usage.frequency}</p>
        </div>
        <div className="min-w-0 px-2">
          <p className="text-[12px] text-[#536D83]">使用时段</p>
          <p className="mt-1 text-[23px] font-bold leading-[1.5]" style={{ textWrap: "balance" }}>{guide.usage.time}</p>
        </div>
      </div>
      <p className="mb-1 mt-7 text-[12px] font-semibold tracking-wide text-[#536D83]">护肤顺序</p>
      <ol className="min-w-0" data-nuskin-guide-steps>
        {guide.usage.steps.map((step, index) => <li key={step} className="flex min-w-0 items-center gap-5 border-b border-[#B7C8D6] py-4">
          <span aria-hidden="true" className="shrink-0 text-[28px] font-light leading-none text-[#728FA8]">{String(index + 1).padStart(2, "0")}</span>
          <p className="min-w-0 text-[17px] font-semibold leading-7" style={{ textWrap: "balance" }}>{step}</p>
        </li>)}
      </ol>
    </PosterSection>

    <PosterSection id="tolerance" title="新手耐受指南">
      <p className="text-center text-[17px] font-bold leading-7" style={{ textWrap: "balance" }}>{guide.tolerance.title}</p>
      <p className="mt-2 text-center text-[14px] leading-6 text-[#536D83]" style={{ textWrap: "balance" }}>{guide.tolerance.subtitle}</p>
      <div className="mt-6 min-w-0 border-t border-[#9DB2C4]" data-nuskin-tolerance-weeks>
        {guide.tolerance.weeks.map(week => <div key={week.label} className="min-w-0 border-b border-[#9DB2C4] py-5">
          <h3 className="mb-3 text-[18px] font-bold leading-7 text-[#355B79]">{week.label}</h3>
          <dl className="space-y-2 text-[14px] leading-6">
            <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3"><dt className="text-[#536D83]">精华乳</dt><dd className="m-0 min-w-0 font-semibold" data-nuskin-tolerance-days>{week.retinolDays}</dd></div>
            <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3"><dt className="text-[#536D83]">补水面膜</dt><dd className="m-0 min-w-0" data-nuskin-tolerance-days>{week.hydrationDays}</dd></div>
          </dl>
        </div>)}
      </div>
      <p className="mt-4 text-[12px] leading-[1.8] text-[#536D83]">上述日期对应官网三周图示；未列出的日期为原图未标示，不另作停用解释。精华乳为{guide.tolerance.retinolName}，补水面膜为{guide.tolerance.hydrationName}。请结合肌肤状况及品牌说明使用。</p>
    </PosterSection>

    <PosterSection id="sun-care" title={guide.sunAdvice.title}>
      <div className="mb-5 grid min-w-0 grid-cols-2 divide-x divide-[#9DB2C4] border-y border-[#9DB2C4] py-4 text-center text-[14px] font-semibold">
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 px-2"><Moon aria-hidden="true" className="h-5 w-5 shrink-0 text-[#4C648B]" /><span>夜间使用</span></div>
        <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 px-2"><Sun aria-hidden="true" className="h-5 w-5 shrink-0 text-[#567F7A]" /><span>日间防晒</span></div>
      </div>
      <p className="text-[14px] leading-7 text-[#445F76]">{guide.sunAdvice.text}</p>
    </PosterSection>

    <section data-nuskin-guide-section="product" className="min-w-0 w-full pb-8 pt-8">
      <h2 className="mb-6 px-5 text-center text-[28px] font-bold leading-[1.4]" style={{ textWrap: "balance" }}>产品说明</h2>
      {/* The official blue product photo is a full-size focal point, not a rounded thumbnail. */}
      <div
        className="min-w-0 w-full px-5 pb-9 pt-8 text-center text-white"
        style={{ background: "linear-gradient(180deg, #DCE6EF 0%, #355674 17%, #355674 83%, #DCE6EF 100%)" }}
      >
        <p className="text-[12px] font-semibold tracking-[0.16em] text-[#D9E5EF]">NU SKIN · ageLOC</p>
        <MibanImage
          src={guide.product.photo.url}
          variant="original"
          width={guide.product.photo.width}
          height={guide.product.photo.height}
          alt="如新官网原始产品照片"
          className="mx-auto mb-5 mt-6 block h-auto w-[116px] max-w-full object-contain"
          style={{ borderRadius: 0, mixBlendMode: "lighten" }}
        />
        <h3 className="mx-auto min-w-0 max-w-[360px] text-[22px] font-bold leading-[1.5]" style={{ textWrap: "balance" }}>{guide.product.name}</h3>
      </div>
      <div className="min-w-0 px-5 pt-3">
        <dl className="min-w-0 border-t border-[#9DB2C4]" data-nuskin-product-specs>
          {guide.product.details.map(detail => <div key={detail.label} className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] gap-x-4 border-b border-[#B7C8D6] py-3.5">
            <dt className="text-[13px] text-[#536D83]">{detail.label}</dt>
            <dd className="m-0 min-w-0 text-[16px] font-semibold leading-6">{detail.value}</dd>
          </div>)}
        </dl>
        <dl className="mt-6 space-y-5" data-nuskin-product-notices>
          {guide.product.notices.map(notice => <div key={notice.label}>
            <dt className="text-[14px] font-bold">{notice.label}</dt>
            <dd className="m-0 mt-1.5 text-[14px] leading-7 text-[#445F76]">{notice.text}</dd>
          </div>)}
        </dl>
      </div>
    </section>

    <PosterSection id="ingredients" title="成分说明">
      <p className="text-[14px] leading-7 text-[#445F76]">{product.ingredients}</p>
      <div className="mt-5 flex items-start gap-2.5 border-t border-[#9DB2C4] pt-4">
        <ShieldCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#557E86]" />
        <p className="min-w-0 text-[12px] leading-6 text-[#536D83]">{product.warnings[0]}</p>
      </div>
    </PosterSection>
  </div>;
}
