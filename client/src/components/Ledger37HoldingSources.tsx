import { useState } from "react";
import { ArrowDownWideNarrow, ChevronRight, ExternalLink, FileText, Search, X } from "lucide-react";
import type { Ledger37HoldingClosedTrade, Ledger37HoldingMarketValue, Ledger37HoldingPosition, Ledger37HoldingPositionChange, Ledger37HoldingSource, Ledger37HoldingSourceId, Ledger37HoldingSources } from "@shared/ledger37-ai-holdings";

const SOURCE_ORDER: Ledger37HoldingSourceId[] = ["r1", "berkshire", "pelosi", "ark", "nvidia"];
const RING_COLORS = ["#087987", "#459CAF", "#73AFC0", "#86BED1", "#ADCEDC", "#729BAC", "#A5B9CA", "#D2E3EC"];
const NEUTRAL_RING = "#EAF2F7";
// Existing asset map is a lookup, never a source of holdings. Unknown securities use their real code.
const STOCK_ASSET_ROOT = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets";
const STOCK_ICON_PATHS: Record<string, string> = {
  AAPL: "logo_apple_3d_t_16b8b55f.png", MSFT: "logos/logo_microsoft_3d.png",
  NVDA: "logo_nvidia_3d_t_d451eb3d.png", GOOGL: "logos/logo_google_3d.png", GOOG: "logos/logo_google_3d.png",
  AMZN: "logo_amazon_3d_t_0c61d380.png", META: "logo_meta_3d_t_5b7237ab.png", TSLA: "logo_tesla_3d_t_0d585ca4.png",
};
const SATELLITE_POSITIONS = ["left-0 top-0", "right-0 top-0", "right-0 bottom-0", "left-0 bottom-0"];

const PORTRAIT_CREDITS: Partial<Record<Ledger37HoldingSourceId, { author: string; license: string; page: string; licenseUrl?: string }>> = {
  berkshire: { author: "USA International Trade Administration / Wikimedia Commons", license: "公共领域", page: "https://commons.wikimedia.org/wiki/File:Warren_Buffett_at_the_2015_SelectUSA_Investment_Summit_%28cropped%29.jpg" },
  pelosi: { author: "United States Congress / Wikimedia Commons", license: "公共领域", page: "https://commons.wikimedia.org/wiki/File:Nancy_Pelosi_official_portrait.jpg" },
  ark: { author: "Caroline Wood / Wikimedia Commons", license: "CC BY-SA 4.0", page: "https://commons.wikimedia.org/wiki/File:Cathie_Wood_ARK_Invest_Photo.jpg", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/" },
  nvidia: { author: "總統府 / Wikimedia Commons", license: "CC BY 2.0", page: "https://commons.wikimedia.org/wiki/File:Jensen_Huang_20231109_%28cropped2%29.jpg", licenseUrl: "https://creativecommons.org/licenses/by/2.0/" },
};

function PortraitCredit({ source }: { source: Ledger37HoldingSource }) {
  const credit = PORTRAIT_CREDITS[source.id];
  if (!credit) return null;
  return <details className="mt-3 border-t border-[#DCE7F0] pt-1 text-[10px] leading-5 text-[#61758A]">
    <summary className="min-h-[44px] cursor-pointer py-3 font-medium">图片来源与许可</summary>
    <p className="break-words">{credit.author} · {credit.license}</p>
    <div className="flex flex-wrap gap-x-4"><a href={credit.page} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[#087987]">查看原图与署名</a>{credit.licenseUrl && <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[#087987]">许可条款</a>}</div>
    <p>原文件未修改，仅以圆形样式展示。人物肖像用于识别来源，不代表产品背书。{source.id === "nvidia" && "英伟达来源为公司 13F 披露，并非黄仁勋个人持仓。"}</p>
  </details>;
}

export function ledger37DisclosedWeight(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function ledger37HoldingWeightLabel(value: number | null): string {
  const weight = ledger37DisclosedWeight(value);
  if (weight === null) return "未披露";
  if (weight > 0 && weight < 0.01) return "<0.01%";
  return `${weight.toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function ledger37HoldingMarketValueLabel(value: Ledger37HoldingMarketValue | null | undefined, valuationAsOf?: string | null, reportingCurrency?: Ledger37HoldingMarketValue['currency'] | null): string | null {
  if (!value || typeof value.amount !== "string" || !/^\d{1,195}(?:\.\d{1,24})?$/.test(value.amount)
    || !["CNY", "USD", "USDT"].includes(value.currency) || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)
    || (valuationAsOf !== undefined && (!valuationAsOf || value.asOf !== valuationAsOf))
    || (reportingCurrency !== undefined && (!reportingCurrency || value.currency !== reportingCurrency))) return null;
  const date = new Date(`${value.asOf}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.asOf) return null;
  const [whole, fraction = ""] = value.amount.split(".");
  let units = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  if (fraction.length > 2 && fraction[2] >= "5") units += BigInt(1);
  const number = `${String(units / BigInt(100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(units % BigInt(100)).padStart(2, "0")}`;
  return `${number} ${value.currency === "CNY" ? "元" : value.currency === "USD" ? "美元" : "USDT"}`;
}

// Optional identifiers can only come from the API; never infer tickers from issuer names.
export function ledger37HoldingSymbol(row: Ledger37HoldingPosition & { displaySymbol?: string }): string {
  return typeof row.displaySymbol === "string" && row.displaySymbol.trim() ? row.displaySymbol.trim() : row.symbol;
}
function holdingSecurityId(row: Ledger37HoldingPosition & { securityId?: string }): string | null {
  if (typeof row.securityId === "string" && row.securityId.trim()) return row.securityId.trim();
  return ledger37HoldingSymbol(row) !== row.symbol ? row.symbol : null;
}
type HoldingSort = "weight-desc" | "weight-asc" | "name";
export function ledger37OrderedHoldings(holdings: Ledger37HoldingPosition[], search = "", sort: HoldingSort = "weight-desc"): Ledger37HoldingPosition[] {
  const term = search.trim().toLocaleLowerCase();
  return holdings.filter(row => !term || `${row.symbol} ${ledger37HoldingSymbol(row)} ${row.stockName} ${holdingSecurityId(row) || ""}`.toLocaleLowerCase().includes(term)).slice().sort((a, b) => {
    if (sort === "name") return (a.stockName || ledger37HoldingSymbol(a)).localeCompare(b.stockName || ledger37HoldingSymbol(b), "zh-CN");
    const left = ledger37DisclosedWeight(a.weightPct), right = ledger37DisclosedWeight(b.weightPct);
    if (left === null) return right === null ? 0 : 1;
    if (right === null) return -1;
    return sort === "weight-asc" ? left - right : right - left;
  });
}

/** Absolute disclosed percentages only. Floating-point noise is not portfolio normalization. */
export function ledger37HoldingRing(holdings: Ledger37HoldingPosition[]): { background: string; label: string; hasWeight: boolean } {
  const rows = ledger37OrderedHoldings(holdings);
  const weights = rows.map(row => ledger37DisclosedWeight(row.weightPct));
  const total = weights.reduce<number>((sum, weight) => sum + (weight ?? 0), 0);
  // Bound addition error at a 100% scale. Only an endpoint may be clamped; no weights are rescaled.
  const tolerance = Number.EPSILON * 100 * Math.max(1, weights.length) * 2;
  if (total > 100 + tolerance) return { background: NEUTRAL_RING, label: "披露权重合计异常，暂不绘制比例环图", hasWeight: false };
  let cumulative = 0;
  const stops: string[] = [];
  const labels: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const weight = weights[i];
    if (weight === null || weight === 0) continue;
    const start = Math.min(cumulative, 100);
    cumulative += weight;
    const end = Math.min(cumulative, 100);
    stops.push(`${RING_COLORS[i % RING_COLORS.length]} ${start}% ${end}%`);
    if (labels.length < 5) labels.push(`${ledger37HoldingSymbol(rows[i])} ${weight}%`);
  }
  if (!stops.length) return { background: NEUTRAL_RING, label: "暂无可绘制的已披露持仓权重，中性空环不代表零持仓", hasWeight: false };
  if (cumulative < 100) stops.push(`${NEUTRAL_RING} ${cumulative}% 100%`);
  return { background: `conic-gradient(from -90deg, ${stops.join(", ")})`, label: `已披露持仓比例：${labels.join("，")}。灰色为未展示或未披露部分，不以股数推算。`, hasWeight: true };
}

/** Maximum four unique, actual securities; unavailable snapshots never leak stale satellites. */
export function ledger37SourceHighlights(source: Ledger37HoldingSource): Ledger37HoldingPosition[] {
  if (source.status !== "available") return [];
  const seen = new Set<string>();
  return ledger37OrderedHoldings(source.holdings).filter(row => {
    const key = `${row.symbol}\0${row.currency}`;
    if (!row.symbol.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 4);
}

function sourceDate(value: string | null): string {
  if (!value) return "未提供";
  return /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? value.slice(0, 10) : value;
}
function sourceDateLabel(source: Ledger37HoldingSource): string {
  if (source.asOf) return `资料截至 ${sourceDate(source.asOf)}`;
  if (source.publishedAt) return `披露日期 ${sourceDate(source.publishedAt)}`;
  if (source.checkedAt) return `核验日期 ${sourceDate(source.checkedAt)}`;
  return "资料日期未提供";
}
function sourceKindLabel(source: Ledger37HoldingSource): string {
  return source.kind === "internal" ? "内部股票目录" : source.kind === "13f" ? "13F 公开披露" : source.kind === "etf" ? "ETF 基金披露" : "公开交易披露";
}
function sourceStatusLabel(source: Ledger37HoldingSource): string {
  return source.status === "unavailable" ? "资料暂不可用" : source.id === "r1" ? String(source.holdings.length) : source.holdings.length ? `${source.holdings.length} 只已接入证券` : "暂无股票记录";
}
function officialSourceHref(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; } catch { return null; }
}

function SourcePortrait({ source }: { source: Ledger37HoldingSource }) {
  const [failed, setFailed] = useState(false);
  const fallback = source.id === "r1" ? "R1" : source.id === "ark" ? "ARK" : source.id === "nvidia" ? "NV" : source.displayName.slice(0, 1);
  return <span className="absolute inset-[11px] flex items-center justify-center overflow-hidden rounded-full border-[3px] border-[#FFFFFF] bg-[#EAF2F7] text-[22px] font-semibold tracking-tight text-[#087987] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
    {source.id === "r1" || failed ? <span aria-label={`${source.displayName}标识`}>{fallback}</span> : <img src={`/holdings/${source.id}.jpg`} alt={source.entityName} onError={() => setFailed(true)} className="h-full w-full object-cover object-center" loading="lazy" />}
  </span>;
}
function HoldingLogo({ symbol, satellite = false }: { symbol: string; satellite?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const code = symbol.toUpperCase().replace(/\.(?:US|O|N)$/, "");
  const path = STOCK_ICON_PATHS[code];
  return <span aria-hidden="true" className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-[#DCE7F0] bg-[#FFFFFF] font-semibold text-[#142A3F] ${satellite ? "h-8 w-8 rounded-full text-[8px] shadow-[0_2px_6px_rgba(21,53,77,0.08)]" : "h-10 w-10 rounded-xl text-[10px]"}`}>
    {(!path || failed || !loaded) && <span className="max-w-full truncate px-0.5">{code}</span>}
    {path && !failed && <img src={`${STOCK_ASSET_ROOT}/${path}`} alt="" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} className={`absolute ${satellite ? "h-6 w-6" : "h-8 w-8"} object-contain ${loaded ? "opacity-100" : "opacity-0"}`} loading="lazy" />}
  </span>;
}
function SourceRing({ source }: { source: Ledger37HoldingSource }) {
  const ring = ledger37HoldingRing(source.status === "available" ? source.holdings : []);
  if (source.id === "r1" || source.id === "berkshire") return <span data-holding-orbit="true" data-holding-style="minimal" className="relative block h-[96px] w-[96px] shrink-0">
    <span data-holding-ring={ring.hasWeight ? "disclosed" : "neutral"} className="absolute inset-0 rounded-full p-[3px] shadow-[0_2px_8px_rgba(21,53,77,0.04)]" style={{ background: ring.background }}>
      <span role="img" aria-label={ring.label} className="absolute inset-0 rounded-full" />
      <SourcePortrait key={source.id} source={source} />
    </span>
  </span>;
  const highlights = ledger37SourceHighlights(source);
  return <span data-holding-orbit="true" className="relative block h-[124px] w-[124px] shrink-0">
    <span className="absolute inset-[9px] rounded-full border border-dashed border-[#DCE7F0]" aria-hidden="true" />
    <span data-holding-ring={ring.hasWeight ? "disclosed" : "neutral"} className="absolute left-[14px] top-[14px] block h-[96px] w-[96px] rounded-full p-[3px] shadow-[0_2px_8px_rgba(21,53,77,0.04)]" style={{ background: ring.background }}>
      <span role="img" aria-label={ring.label} className="absolute inset-0 rounded-full" />
      <SourcePortrait key={source.id} source={source} />
    </span>
    {highlights.map((row, index) => {
      const symbol = ledger37HoldingSymbol(row);
      const weight = ledger37DisclosedWeight(row.weightPct);
      return <span key={`${row.symbol}:${row.currency}`} data-holding-satellite={row.symbol} title={`${row.stockName || symbol} · ${symbol} · ${weight === null ? "比例未披露，仅股票名录" : `${weight}% 已披露权重`}`} className={`absolute z-10 ${SATELLITE_POSITIONS[index]}`}><span className="sr-only">{symbol}：{weight === null ? "比例未披露，仅股票名录" : `${weight}% 已披露权重`}</span><HoldingLogo key={symbol} symbol={symbol} satellite /></span>;
    })}
  </span>;
}
function OfficialSourceLink({ source }: { source: Ledger37HoldingSource }) {
  const href = officialSourceHref(source.sourceUrl);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-[#087987] underline-offset-4 hover:underline"><ExternalLink size={13} />查看原始公开资料</a> : null;
}

function HoldingCompactRow({ row, detail = false }: { row: Ledger37HoldingPosition; detail?: boolean }) {
  const weight = ledger37DisclosedWeight(row.weightPct);
  const name = row.stockName || ledger37HoldingSymbol(row);
  return <li data-holding-compact="true" data-inline-holding-row={detail ? undefined : row.symbol} data-holding-row={detail ? "true" : undefined} className="flex min-h-9 min-w-0 flex-wrap items-center gap-3 gap-y-0 py-2">
    <span title={name} className="min-w-0 flex-[1.3] truncate text-[12px] font-medium leading-5 text-[#142A3F]">{name}</span>
    <div aria-hidden="true" data-holding-bar={weight === null ? "neutral" : "disclosed"} className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-[#EAF2F7]">{weight !== null && <div className="h-full rounded-full bg-[#087987]" style={{ width: `${weight}%` }} />}</div>
    <span className={`w-14 shrink-0 text-right text-[11px] font-semibold leading-5 tabular-nums ${weight === null ? "text-[#61758A]" : "text-[#142A3F]"}`}>{ledger37HoldingWeightLabel(weight)}</span>
  </li>;
}

function SourceInlineHoldings({ source }: { source: Ledger37HoldingSource }) {
  const holdings = ledger37OrderedHoldings(source.status === "available" ? source.holdings : []);
  return <div className="border-t border-[#EAF2F7] px-3 pb-2">
    <div className="flex justify-between gap-3 py-2 text-[10px] text-[#61758A]"><span>全部持仓 · {holdings.length} 只</span><span>持仓比例</span></div>
    <ul aria-label={`${source.displayName}全部持仓`} className="divide-y divide-[#EAF2F7]">
      {holdings.map((row, index) => <HoldingCompactRow key={`${row.symbol}:${row.currency}:${index}`} row={row} />)}
    </ul>
    <details className="border-t border-[#EAF2F7] text-[10px] leading-5 text-[#61758A]"><summary className="min-h-[44px] cursor-pointer py-3">资料来源与说明</summary><p className="break-words">{source.coverageNote}</p><p className="mt-2">仅展示该期已披露股票，不代表完整资产或实时持仓。比例按原披露权重显示。</p><OfficialSourceLink source={source} /><PortraitCredit source={source} /></details>
  </div>;
}

export function ledger37HoldingSourceHasDetails(source: Ledger37HoldingSource): boolean {
  return source.status === "available" && (source.holdings.length > 0 || source.id === "r1" && (
    (source.memberPortfolio?.holdings.length || 0) > 0 || (source.memberPortfolio?.positionChanges?.length || 0) > 0
    || (source.memberPortfolio?.closedTrades?.length || 0) > 0));
}

export function Ledger37HoldingSourceList({ data, onOpen }: { data: Ledger37HoldingSources; onOpen: (id: Ledger37HoldingSourceId) => void }) {
  const ordered = data.sources.filter(ledger37HoldingSourceHasDetails).sort((a, b) => SOURCE_ORDER.indexOf(a.id) - SOURCE_ORDER.indexOf(b.id));
  return <main data-holding-layout="mobile" data-holding-theme="home" className="mx-auto w-full min-w-0 max-w-[480px] bg-[#F2F6FA] px-3 pb-8 pt-3">
    <section aria-label="持仓来源列表" className="space-y-3">
      {ordered.map(source => {
        const highlights = ledger37SourceHighlights(source);
        const ring = ledger37HoldingRing(source.status === "available" ? source.holdings : []);
        const inline = source.id === "berkshire" || source.id === "nvidia";
        const heading = source.id === "r1" ? <>
            <span className="min-w-0 flex-1">
              <h3 className="break-words text-[20px] font-semibold leading-7 tracking-tight text-[#142A3F]">{source.displayName}</h3>
              <span className="mt-2 block text-[24px] font-semibold leading-8 tabular-nums text-[#087987]">{sourceStatusLabel(source)}</span>
              <span className="mt-1 block text-[10px] leading-5 text-[#61758A]">{sourceDateLabel(source)}</span>
              {!ring.hasWeight && <span className="block text-[10px] leading-5 text-[#61758A]">比例待更新</span>}
            </span>
            <SourceRing source={source} />
          </> : <>
            <span className="min-w-0 flex-1">
              <span className="mb-2 inline-flex items-center gap-1.5 text-[9px] font-medium text-[#61758A]"><span className={`h-1 w-1 rounded-full ${source.status === "available" ? "bg-[#087987]" : "bg-[#74869A]"}`} />{sourceKindLabel(source)}</span>
              <h3 className="break-words text-[18px] font-semibold leading-6 tracking-tight text-[#142A3F]">{source.displayName}</h3>
              <span className="mt-1 block break-words text-[10px] leading-4 text-[#61758A]">{source.entityName}</span>
              <span className={`mt-2.5 block text-[11px] font-medium leading-5 ${source.status === "unavailable" ? "text-[#61758A]" : "text-[#142A3F]"}`}>{sourceStatusLabel(source)}</span>
              <span className="mt-0.5 block text-[9px] leading-4 text-[#61758A]">{sourceDateLabel(source)}</span>
              {!inline && highlights.length > 0 && <span className="mt-2.5 block border-t border-[#EAF2F7] pt-2"><span className="block text-[8px] font-semibold tracking-[0.12em] text-[#087987]">{ring.hasWeight ? "TOP HOLDINGS" : "股票名录 · 比例未披露"}</span><span className="mt-1 block truncate text-[10px] font-medium tracking-wide text-[#142A3F]">{highlights.slice(0, 3).map(ledger37HoldingSymbol).join(" · ")}</span></span>}
            </span>
            <SourceRing source={source} />{!inline && <ChevronRight size={13} className="shrink-0 text-[#61758A]" />}
          </>;
        return <article key={source.id} data-holding-source={source.id} className={`rounded-[16px] border bg-[#FFFFFF] shadow-[0_4px_18px_rgba(21,53,77,0.06)] ${source.id === "r1" ? "border-[#DCE7F0]" : "border-[#DCE7F0]"}`}>
          {inline ? <div className="flex min-h-[136px] w-full items-center gap-2 rounded-[16px] px-3 py-4">{heading}</div> : <button type="button" onClick={() => onOpen(source.id)} aria-label={`查看${source.displayName}详情`} className={`flex w-full items-center gap-3 rounded-[16px] px-4 py-4 text-left transition-colors hover:bg-[#EAF2F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#087987] ${source.id === "r1" ? "min-h-[128px]" : "min-h-[136px]"}`}>{heading}</button>}
          {inline && <SourceInlineHoldings source={source} />}
        </article>;
      })}
      {!ordered.length && <p className="rounded-2xl border border-[#DCE7F0] bg-[#FFFFFF] px-4 py-5 text-center text-xs text-[#61758A]">暂无已接入来源</p>}
    </section>
    <footer className="mt-5 flex items-start gap-2 px-1 text-[10px] leading-5 text-[#61758A]"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#EAF2F7]" /><p>环图仅展示已披露持仓权重；灰色不是零持仓。不同来源的范围与资料日期不同，不合并比较收益。</p></footer>
  </main>;
}

type HoldingTab = "holdings" | "changes" | "about";
const HOLDING_TABS: { id: HoldingTab; label: string }[] = [{ id: "holdings", label: "持股列表" }, { id: "changes", label: "交易变动" }, { id: "about", label: "简介" }];

export function ledger37HoldingTradeDate(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function HoldingPositionChangeList({ changes, trades }: { changes?: Ledger37HoldingPositionChange[]; trades?: Ledger37HoldingClosedTrade[] }) {
  const [page, setPage] = useState(0);
  // New safe records are authoritative, including an empty array. Legacy cached
  // closures remain compatible, but never infer additions from current holdings.
  const known = changes === undefined ? Array.isArray(trades) : Array.isArray(changes);
  const records: Ledger37HoldingPositionChange[] = changes === undefined
    ? (Array.isArray(trades) ? trades : []).filter(row => row && typeof row.symbol === "string" && typeof row.stockName === "string")
      .slice().sort((a, b) => (ledger37HoldingTradeDate(b.closedDate) || "").localeCompare(ledger37HoldingTradeDate(a.closedDate) || ""))
      .map(row => ({ symbol: row.symbol, stockName: row.stockName, action: "decrease" }))
    : Array.isArray(changes) ? changes : [];
  const rows = records.filter(row => row && typeof row.symbol === "string" && row.symbol.trim() && typeof row.stockName === "string"
    && ["new", "increase", "decrease"].includes(row.action));
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  const currentPage = Math.min(page, pages - 1);
  return <div className="overflow-hidden rounded-[18px] border border-[#DCE7F0] bg-[#FFFFFF]">
    <p className="border-b border-[#EAF2F7] px-3 py-3 text-[11px] text-[#61758A]">我的仓位变动</p>
    {rows.length ? <ul aria-label="仓位变动记录" className="divide-y divide-[#EAF2F7] px-3">{rows.slice(currentPage * 20, (currentPage + 1) * 20).map((row, index) => <li key={`${row.symbol}:${row.action}:${currentPage}:${index}`} data-holding-position-change={row.action} className="flex min-w-0 items-center justify-between gap-3 py-3">
      <span title={row.stockName || row.symbol} className="min-w-0 truncate text-[12px] font-medium text-[#142A3F]">{row.stockName || row.symbol}</span>
      <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] ${row.action === "decrease" ? "bg-[#EAF5EF] text-[#2E7D32]" : "bg-[#E4F4F6] text-[#087987]"}`}>{row.action === "new" ? "新增" : row.action === "increase" ? "增持" : "减持"}</span>
    </li>)}</ul> : <p className="px-4 py-6 text-center text-xs text-[#61758A]">{known ? "暂无仓位变动记录" : "交易记录待更新"}</p>}
    {pages > 1 && <nav aria-label="交易变动分页" className="flex items-center justify-between border-t border-[#EAF2F7] px-3 text-[11px] text-[#61758A]"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="min-h-[44px] px-2 disabled:opacity-40">上一页</button><span>{currentPage + 1} / {pages}</span><button type="button" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} className="min-h-[44px] px-2 disabled:opacity-40">下一页</button></nav>}
  </div>;
}

function R1HoldingIntroduction() {
  return <div className="rounded-[18px] border border-[#DCE7F0] bg-[#FFFFFF] px-4 py-4">
    <h3 className="text-sm font-semibold text-[#142A3F]">AI 如何辅助选股</h3>
    <p className="mt-3 text-xs leading-7 text-[#61758A]">AI 可快速整理海量财报与行情数据，配合回测工具批量验证策略、比较历史表现，减少手工分析和测试的时间，让选股研究更高效。</p>
    <p className="mt-3 text-[11px] leading-6 text-[#61758A]">回测结果不代表未来收益，具体功能以实际提供为准。</p>
    <details className="mt-3 border-t border-[#EAF2F7] text-[10px] text-[#61758A]"><summary className="min-h-[44px] cursor-pointer py-3">资料参考</summary><div className="flex flex-wrap gap-x-4"><a href="https://www.iosco.org/library/pubdocs/pdf/IOSCOPD788.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[#087987]">IOSCO：资本市场中的 AI</a><a href="https://www.cfainstitute.org/sites/default/files/-/media/documents/article/industry-research/Ethics-and-Artificial-Intelligence-in-Investment-Management_Online.pdf" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[#087987]">CFA Institute：AI 与投资管理</a></div></details>
  </div>;
}

export function Ledger37HoldingSourceDetail({ source }: { source: Ledger37HoldingSource }) {
  const [tab, setTab] = useState<HoldingTab>("holdings");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<HoldingSort>("weight-desc");
  const personal = source.id === "r1";
  const available = source.status === "available" ? personal ? source.memberPortfolio?.holdings || [] : source.holdings : [];
  const holdings = ledger37OrderedHoldings(available, personal ? "" : search, sort);
  const hasWeight = ledger37HoldingRing(available).hasWeight;
  const displaySource = personal ? { ...source, holdings: available, asOf: source.memberPortfolio?.valuationAsOf || null, publishedAt: null, checkedAt: null } : source;
  const personalBasis = source.memberPortfolio?.valuationAsOf
    ? `持股百分比按当前用户真实剩余份额与${source.memberPortfolio.valuationAsOf}统一日结行情计算，反映个人持仓构成，不是R1总仓位比例；并非该日期的历史持仓快照。`
    : "仅展示当前用户已获配的真实剩余份额。个人日结行情或汇率证据不完整时，比例待更新，不以R1总仓位或钱包余额替代。";
  return <main data-holding-layout="mobile" data-holding-theme="home" className="mx-auto w-full min-w-0 max-w-[480px] bg-[#F2F6FA] px-3 pb-8 pt-4">
    <section className="rounded-[16px] border border-[#DCE7F0] bg-[#FFFFFF] px-3 py-4 shadow-[0_4px_18px_rgba(21,53,77,0.06)]">
      <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="text-[9px] font-semibold tracking-wide text-[#087987]">{personal ? "持股百分比" : sourceKindLabel(source)}</p><h2 className="mt-2 break-words text-[22px] font-semibold leading-7 tracking-tight text-[#142A3F]">{source.displayName}</h2><p className="mt-1 break-words text-[11px] leading-5 text-[#61758A]">{source.entityName}</p></div><SourceRing source={displaySource} /></div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#DCE7F0] pt-3"><p className="text-[11px] font-medium text-[#142A3F]">{sourceStatusLabel(displaySource)}</p><p className="text-[10px] tabular-nums text-[#61758A]">{sourceDateLabel(displaySource)}</p></div>
      {available.length > 0 && <p className="mt-2 text-[9px] leading-4 text-[#61758A]">{hasWeight ? personal ? "环图按持股百分比绘制" : "TOP HOLDINGS · 环图按已披露权重绘制" : "股票名录 · 无可绘制比例，灰环不表示零持仓"}</p>}
    </section>
    <div role="tablist" aria-label={`${source.displayName}详情`} className="mt-4 grid grid-cols-3 border-b border-[#DCE7F0]">
      {HOLDING_TABS.map(item => <button key={item.id} type="button" role="tab" id={`holding-${source.id}-${item.id}-tab`} aria-controls={`holding-${source.id}-panel`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
        event.preventDefault();
        const next = (HOLDING_TABS.findIndex(value => value.id === tab) + (event.key === "ArrowRight" ? 1 : 2)) % 3;
        setTab(HOLDING_TABS[next].id);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }} className={`min-h-[48px] border-b-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087987] ${tab === item.id ? "border-[#087987] text-[#087987]" : "border-transparent text-[#61758A]"}`}>{item.label}</button>)}
    </div>
    <section role="tabpanel" id={`holding-${source.id}-panel`} aria-labelledby={`holding-${source.id}-${tab}-tab`} className="pt-4">
      {tab === "holdings" ? <>
        {!personal && <div className="mb-3 flex min-h-[44px] items-center gap-2 rounded-xl border border-[#DCE7F0] bg-[#FFFFFF] px-3 focus-within:border-[#087987]"><Search size={15} className="shrink-0 text-[#61758A]" /><input type="search" aria-label="搜索股票名称或代码" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索股票名称 / 代码" className="min-w-0 flex-1 bg-transparent py-3 text-xs text-[#142A3F] outline-none placeholder:text-[#61758A]" />{search && <button type="button" aria-label="清空搜索" onClick={() => setSearch("")} className="flex h-11 w-11 items-center justify-center text-[#61758A]"><X size={15} /></button>}</div>}
        <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-x-2 text-[10px] text-[#61758A]"><span>{source.status === "unavailable" ? "资料暂不可用" : personal ? "持仓" : `已接入证券 · ${holdings.length} 只`}</span><label className="flex min-h-[44px] min-w-0 items-center gap-1"><ArrowDownWideNarrow size={13} className="shrink-0" /><select aria-label="持股排序" value={sort} onChange={event => setSort(event.target.value as HoldingSort)} className="min-h-[44px] max-w-[152px] rounded-md bg-transparent pr-1 text-[10px] text-[#142A3F] outline-none focus-visible:ring-2 focus-visible:ring-[#087987]"><option value="weight-desc">{personal ? "持仓比例 ↓" : "已披露权重 ↓"}</option><option value="weight-asc">{personal ? "持仓比例 ↑" : "已披露权重 ↑"}</option><option value="name">名称排序</option></select></label></div>
        <div className="overflow-hidden rounded-[18px] border border-[#DCE7F0] bg-[#FFFFFF]">
          {holdings.length ? <ul className="divide-y divide-[#EAF2F7] px-3">{holdings.map((row, index) => <HoldingCompactRow key={`${row.symbol}:${row.currency}:${index}`} row={row} detail />)}</ul> : <div className="flex items-start gap-3 px-4 py-5"><FileText size={22} strokeWidth={1.5} className="mt-0.5 shrink-0 text-[#61758A]" /><div><h3 className="text-xs font-medium text-[#142A3F]">{source.status === "unavailable" ? "持仓资料暂不可用" : search.trim() ? "没有匹配的股票" : personal ? source.memberPortfolio ? "暂无已分配持仓" : "我的份额待更新" : "暂无已接入股票记录"}</h3><p className="mt-1 text-[10px] leading-5 text-[#61758A]">{source.status === "unavailable" ? "未知不表示零持仓，请以原始披露为准。" : search.trim() ? "尝试其它名称或证券代码。" : "有可靠资料后再展示比例，不以缺数据填零。"}</p></div></div>}
        </div>
        <p className="mt-3 px-1 text-[10px] leading-5 text-[#61758A]">{personal ? "百分比仅表示我的持仓构成，不代表可提现余额或收益。" : "未披露比例不表示零持仓。"}</p>
      </> : tab === "changes" ? personal ? <HoldingPositionChangeList key={source.id} changes={source.status === "available" ? source.memberPortfolio?.positionChanges : undefined} trades={source.status === "available" ? source.memberPortfolio?.closedTrades : undefined} /> : <div className="rounded-[18px] border border-[#DCE7F0] bg-[#FFFFFF] px-4 py-5"><div className="flex items-start gap-3"><FileText size={23} strokeWidth={1.5} className="shrink-0 text-[#61758A]" /><div><h3 className="text-sm font-medium text-[#142A3F]">暂无已接入交易数据</h3><p className="mt-2 text-xs leading-6 text-[#61758A]">持仓快照不等于成交记录。当前接口未提供正式交易披露，不据此推断买卖、成交日期或价格。</p></div></div><OfficialSourceLink source={source} /></div> : personal ? <R1HoldingIntroduction /> : <div className="rounded-[18px] border border-[#DCE7F0] bg-[#FFFFFF] px-4 py-4"><h3 className="text-sm font-semibold text-[#142A3F]">主体与资料范围</h3><p className="mt-2 whitespace-pre-line break-words text-xs leading-6 text-[#61758A]">{source.description || "主体简介暂未提供"}</p></div>}
    </section>
    <aside aria-label="资料范围说明" className="mt-5 border-t border-[#DCE7F0] px-1 pt-2 text-[10px] leading-5 text-[#61758A]">
      <details><summary className="min-h-[44px] cursor-pointer py-3 font-medium text-[#142A3F]">资料范围与披露说明</summary><p className="whitespace-pre-line break-words">{personal ? personalBasis : source.coverageNote || "来源范围暂未提供，请以原始资料为准。"}</p>{source.kind === "13f" && <p className="mt-2">13F 为滞后披露的特定证券快照，不代表完整资产或实时持仓。</p>}{source.id === "ark" && <p className="mt-2">本来源仅对应 ARKK 特定基金，不代表 ARK 全部基金。</p>}{source.id === "pelosi" && <p className="mt-2">家族交易披露并非完整持仓清单，不能据此声称精确全面的个人组合。</p>}<p className="mt-2">{personal ? "环图为个人持股百分比；灰环表示资料不完整，不代表零持仓。" : "环图使用绝对披露比例；灰色为未展示或未披露部分。徽章只代表此来源已接入证券，不表示等比例或实时持仓。"}</p><dl className="mt-3 space-y-1 border-t border-[#DCE7F0] pt-3">{(personal ? [{ label: "行情截至", value: displaySource.asOf }] : [{ label: "资料截至", value: source.asOf }, { label: "披露日期", value: source.publishedAt }, { label: "核验日期", value: source.checkedAt }]).map(item => <div key={item.label} className="flex justify-between gap-3"><dt>{item.label}</dt><dd className="break-words text-right tabular-nums text-[#142A3F]">{sourceDate(item.value)}</dd></div>)}</dl><OfficialSourceLink source={source} /></details>
      <PortraitCredit source={source} />
    </aside>
  </main>;
}

export function Ledger37HoldingSourcesRenderer({ data, selectedSourceId, onOpen, updating = false }: { data: Ledger37HoldingSources; selectedSourceId: Ledger37HoldingSourceId | null; onOpen: (id: Ledger37HoldingSourceId) => void; updating?: boolean }) {
  const selected = data.sources.find(source => source.id === selectedSourceId && source.id !== "berkshire" && source.id !== "nvidia" && ledger37HoldingSourceHasDetails(source));
  return <><p role="status" aria-live="polite" className="sr-only">{updating ? "后台更新中，保留当前来源资料" : "持仓来源资料已确认"}</p>{selected ? <Ledger37HoldingSourceDetail key={`${data.viewerUserId}:${selected.id}`} source={selected} /> : <Ledger37HoldingSourceList data={data} onOpen={onOpen} />}</>;
}
