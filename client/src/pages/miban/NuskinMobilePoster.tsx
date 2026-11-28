import posterData from "@shared/miban-nuskin-mobile-poster.json";
import { Fragment } from "react";
import { MibanImage } from "./MibanImage";
import NuskinProductGuide from "./NuskinProductGuide";

type Asset = { url: string; width: number; height: number };
type SourceRange = { id: string; startY: number; endY: number };
type StudyNote = { label: string; text: string };
type Comparison = { label: string; detail?: string; images: Asset[] };
type ImagePart = SourceRange & Asset & { kind: "image" };
type GuidePart = SourceRange & { kind: "guide" };
type StudyPart = SourceRange & {
  kind: "study";
  title: string;
  note?: string;
  finding: string;
  findingChunks?: string[];
  chart?: Asset;
  comparisons?: Comparison[];
  studyNotes?: StudyNote[];
  citation: string;
};
const parts = posterData.parts as Array<ImagePart | StudyPart | GuidePart>;

function comparisonRatio(columns: Comparison[], row: number) {
  const images = columns.flatMap(column => column.images[row] ? [column.images[row]] : []);
  return `${Math.max(...images.map(image => image.width))} / ${Math.max(...images.map(image => image.height))}`;
}

/** Keep only short numeric/ingredient tokens together; Chinese sentences still wrap. */
function ResearchText({ text }: { text: string }) {
  const tokens = text.split(/((?:\d+[–-]\d+|\d+(?:\.\d+)?)(?:ppm|%|天|周|岁)?|AI[+-]?寡肽|A醇)/g);
  return <>{tokens.map((token, index) => index % 2
    ? <span key={index} className="inline-block whitespace-nowrap">{token}</span>
    : <Fragment key={index}>{token}</Fragment>)}</>;
}

/** Evidence sits directly on the continuous canvas, never inside a presentation card. */
function StudySection({ part }: { part: StudyPart }) {
  const columns = part.comparisons ?? [];
  const isPeptide = part.id.startsWith("peptide-study-");
  return (
    <section
      data-nuskin-study={part.id}
      data-nuskin-source-range={`${part.startY}:${part.endY}`}
      data-nuskin-clean-study={isPeptide ? true : undefined}
      className="min-w-0 w-full"
      style={{
        background: "linear-gradient(180deg, #294967 0%, #355674 48%, #294967 100%)",
        fontSize: 14,
        lineHeight: 1.6,
        color: "#F3F7FB",
      }}
    >
      <header className="min-w-0 px-5 pb-6 pt-9 text-center">
        <h3 className="text-[15px] font-medium leading-6 text-[#E2EBF3]" style={{ textWrap: "balance" }}>
          <ResearchText text={part.title} />
        </h3>
        {part.note && <p className="mt-1.5 text-[12px] leading-5 text-[#CCD9E6]" style={{ textWrap: "balance" }}>
          <ResearchText text={`（${part.note}）`} />
        </p>}
        <p
          className="mt-4 min-w-0 text-[28px] font-bold leading-[1.4] text-white"
          data-nuskin-finding
          style={{ textWrap: "balance", overflowWrap: "anywhere" }}
        >
          {(part.findingChunks ?? [part.finding]).map(chunk => <span key={chunk} className="block min-w-0">
            <ResearchText text={chunk} />
          </span>)}
        </p>
      </header>

      {/* Original scientific pixels: full proportions, no crop, filter, blend, or corner mask. */}
      {part.chart && <div className="min-w-0 w-full">
        <MibanImage
          src={part.chart.url}
          width={part.chart.width}
          height={part.chart.height}
          variant="original"
          alt={`${part.title}官网原始研究图表`}
          className="block h-auto w-full object-contain"
          style={{ width: "100%", height: "auto", borderRadius: 0, filter: "none", mixBlendMode: "normal" }}
        />
      </div>}

      {columns.length > 0 && <div className="grid min-w-0 w-full grid-cols-2 gap-x-1 gap-y-2" data-nuskin-comparison-grid>
        {columns.map((column, columnIndex) => <Fragment key={column.label}>
          <p
            data-nuskin-comparison-label
            className="mx-3 min-w-0 border-t border-[#A6BDCF]/50 px-1 pt-2 text-center text-[13px] font-medium leading-6 text-[#F1F6FA]"
            style={{ gridColumn: columnIndex + 1, gridRow: 1, textWrap: "balance", overflowWrap: "anywhere" }}
          >
            <ResearchText text={column.label} />
          </p>
          <div className="min-w-0 space-y-1" style={{ gridColumn: columnIndex + 1, gridRow: 2 }}>
            {column.images.map((asset, index) => <div
              key={asset.url}
              data-nuskin-comparison-frame
              className="w-full"
              style={{ aspectRatio: comparisonRatio(columns, index) }}
            >
              <MibanImage
                src={asset.url}
                variant="original"
                width={asset.width}
                height={asset.height}
                alt={`${part.title} ${column.label} 官网原始对照照片 ${index + 1}`}
                className="block h-full w-full object-contain"
                style={{ borderRadius: 0, filter: "none", mixBlendMode: "normal" }}
              />
            </div>)}
          </div>
          {column.detail && <p
            className="min-w-0 px-2 text-center text-[12px] leading-5 text-[#D6E2EC]"
            style={{ gridColumn: columnIndex + 1, gridRow: 3, textWrap: "balance" }}
          >
            <ResearchText text={column.detail} />
          </p>}
        </Fragment>)}
      </div>}

      <div className="min-w-0 px-5 pb-8 pt-5" data-nuskin-study-notes={isPeptide ? true : undefined}>
        {part.studyNotes ? <div className="border-t border-[#A6BDCF]/40 pt-3">
          <p className="mb-2 text-[12px] font-semibold leading-5 text-[#E5EDF4]">数据来源</p>
          <dl className="space-y-1.5 text-[12px] leading-[1.8] text-[#D0DDE8]">
            {part.studyNotes.map(note => <div key={note.label} className="grid grid-cols-[36px_minmax(0,1fr)] items-start gap-x-3">
              <dt className="text-[#AEC4D7]">{note.label}</dt>
              <dd className="m-0 min-w-0 break-words"><ResearchText text={note.text} /></dd>
            </div>)}
          </dl>
        </div> : part.citation ? <p className="break-words border-t border-[#A6BDCF]/40 pt-3 text-[12px] leading-[1.8] text-[#D0DDE8]">
          <ResearchText text={part.citation} />
        </p> : null}
      </div>
    </section>
  );
}

/** Responsive presentation of one official source poster, not new evidence. */
export default function NuskinMobilePoster() {
  return (
    <div
      data-nuskin-mobile-poster
      data-official-source-poster-count={posterData.sourcePosterCount}
      className="min-w-0 w-full"
      style={{ background: "#294967" }}
    >
      {parts.map(part => part.kind === "guide" ? <NuskinProductGuide key={part.id} /> : part.kind === "image" ? (
        <MibanImage
          key={part.id}
          src={part.url}
          variant="poster"
          width={part.width}
          height={part.height}
          alt="如新官网连续详情原图段落"
          data-nuskin-source-range={`${part.startY}:${part.endY}`}
          className="block h-auto w-full object-contain object-center"
          style={{ display: "block", width: "100%", height: "auto", margin: 0, padding: 0, border: 0 }}
        />
      ) : <StudySection key={part.id} part={part} />)}
    </div>
  );
}
