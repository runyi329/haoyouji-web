import { trpc } from "@/lib/trpc";
import { r1ParticipationMoney } from "@/lib/r1StockPresentation";
import type { Ledger37AiStockPool } from "@shared/ledger37-ai-presentation";

/** Personal safe P/L includes actual current and historical allocations only.
 * Unknown participating P/L propagates; no wallet, observations or dividends added again. */
export function ledger37AiNetDisclosureTotal(pool: Pick<Ledger37AiStockPool, "stocks"> | null | undefined): number | null {
  if (!pool || !Array.isArray(pool.stocks)) return null;
  let total = 0;
  let participated = false;
  for (const row of pool.stocks) {
    if (!row || typeof row.hasParticipation !== "boolean") return null;
    if (!row.hasParticipation) continue;
    participated = true;
    if (typeof row.pnlCny !== "number" || !Number.isFinite(row.pnlCny)) return null;
    total += row.pnlCny;
    if (!Number.isFinite(total)) return null;
  }
  return participated ? total : null;
}

/** Server disclosure issuance date; never substitute today's date or a trading date. */
export function ledger37AiNetDisclosureDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const date = new Date(value), time = date.getTime();
  if (!Number.isFinite(time) || time > Date.now() || date.toISOString() !== value) return null;
  const beijing = new Date(time + 8 * 60 * 60_000).toISOString().slice(0, 10);
  const [year, month, day] = beijing.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

/** Signed display: latest change retains the existing cumulative personal P/L. */
export function Ledger37AiNetValueDisclosureRenderer({ totalPnl, disclosedAt = null, usdCnyRate = null, loading = false, unavailable = false, updating = false, compact = false }: {
  totalPnl: number | null; disclosedAt?: string | null; usdCnyRate?: number | null; loading?: boolean; unavailable?: boolean; updating?: boolean; compact?: boolean;
}) {
  const known = typeof totalPnl === "number" && Number.isFinite(totalPnl) && !loading && !unavailable;
  const converted = known && typeof usdCnyRate === "number" && Number.isFinite(usdCnyRate) && usdCnyRate > 0 && usdCnyRate < 100 ? totalPnl / usdCnyRate : null;
  const totalU = converted !== null && Number.isFinite(converted) ? converted : null;
  const displayedU = totalU !== null && Math.abs(totalU) < 0.005 ? 0 : totalU;
  const displayedCny = known && Math.abs(totalPnl) < 0.005 ? 0 : totalPnl;
  const tone = displayedU === null ? "text-[#61758A]" : displayedU > 0 ? "text-[#D32F2F]" : displayedU < 0 ? "text-[#2E7D32]" : "text-[#142A3F]";
  const dateLabel = known ? ledger37AiNetDisclosureDate(disclosedAt) : null;
  return <section aria-label="净值变动" data-ai-net-disclosure="true" className={compact ? "min-w-0 px-1.5 py-3 text-center" : "flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[#EAF2F7] px-4 py-3"}>
    <div className="min-w-0"><p className={`${compact ? "text-[11px]" : "text-[12px]"} font-medium leading-5 text-[#142A3F]`}>净值变动</p>{dateLabel && !compact && <time data-ai-net-disclosure-date="true" dateTime={disclosedAt!} className="mt-1 block text-[10px] leading-4 tabular-nums text-[#61758A]">{dateLabel}</time>}</div>
    <div className={`min-w-0 max-w-full ${compact ? "mt-2 text-center" : "text-right"}`}>
      <p data-ai-net-disclosure-pnl="true" className={`min-w-0 max-w-full break-words ${compact ? "text-[17px] leading-6" : "text-[21px] leading-7"} font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere] ${tone}`}>{displayedU !== null ? <>{r1ParticipationMoney(displayedU, "USD").replace("US$", "")}<span className={`ml-0.5 align-baseline ${compact ? "text-[9px]" : "text-[11px]"} font-medium leading-none`}>u</span></> : loading ? "读取中…" : unavailable ? "变动暂不可用" : known ? "汇率待更新" : "待更新"}</p>
      {known && <p data-ai-net-disclosure-cny="true" className={`mt-0.5 break-words ${compact ? "text-[9px]" : "text-[10px]"} font-medium leading-4 tabular-nums text-[#61758A]`}>≈ {r1ParticipationMoney(displayedCny).replace("¥", "")}<span className="ml-0.5 align-baseline text-[8px] font-medium leading-none">¥</span></p>}
    </div>
    <p role="status" aria-live="polite" className="sr-only">{updating ? "后台更新最新变动，保留当前数值" : known ? "个人累计盈亏，不含观察" : "暂无完整的个人变动数据，不以零代替"}</p>
  </section>;
}

/** Capital is a server-issued personal scalar. Net value may legitimately be negative. */
export function Ledger37AiRequiredCapitalRenderer({ amountCny, usdCnyRate = null, loading = false, unavailable = false, netValue = false, compact = false }: {
  amountCny: number | null; usdCnyRate?: number | null; loading?: boolean; unavailable?: boolean; netValue?: boolean; compact?: boolean;
}) {
  const known = typeof amountCny === "number" && Number.isFinite(amountCny) && (netValue || amountCny >= 0) && !loading && !unavailable;
  const converted = known && typeof usdCnyRate === "number" && Number.isFinite(usdCnyRate) && usdCnyRate > 0 && usdCnyRate < 100
    ? amountCny / usdCnyRate : null;
  const amountU = converted !== null && Number.isFinite(converted) ? converted : null;
  const money = (value: number) => (Math.abs(value) < 0.005 ? 0 : value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const title = netValue ? "余额" : "初始本金";
  return <section aria-label={title} data-ai-required-capital={netValue ? undefined : "true"} data-ai-account-net-value={netValue ? "true" : undefined} className={compact ? "min-w-0 px-1.5 py-3 text-center" : "flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[#EAF2F7] bg-[#F8FBFD] px-4 py-3"}>
    <p className={`${compact ? "text-[11px]" : "text-[12px]"} font-medium leading-5 text-[#142A3F]`}>{title}</p>
    <div className={`min-w-0 max-w-full ${compact ? "mt-2 text-center" : "text-right"}`}>
      <p data-ai-required-capital-usd={netValue ? undefined : "true"} data-ai-account-net-value-usd={netValue ? "true" : undefined} className={`min-w-0 max-w-full break-words ${compact ? "text-[17px] leading-6" : "text-[24px] leading-8"} font-semibold tracking-tight tabular-nums text-[#142A3F] [overflow-wrap:anywhere]`}>{amountU !== null ? <>{money(amountU)}<span className={`ml-0.5 align-baseline ${compact ? "text-[9px]" : "text-[11px]"} font-medium leading-none`}>u</span></> : loading ? "读取中…" : known ? "汇率待更新" : "待更新"}</p>
      {known && <p data-ai-required-capital-cny={netValue ? undefined : "true"} data-ai-account-net-value-cny={netValue ? "true" : undefined} className={`mt-0.5 break-words ${compact ? "text-[9px]" : "text-[10px]"} font-medium leading-4 tabular-nums text-[#61758A]`}>≈ {money(amountCny)}<span className="ml-0.5 align-baseline text-[8px] font-medium leading-none">¥</span></p>}
    </div>
  </section>;
}

/** Sum unrounded CNY first. One verified FX rate keeps all three displayed values consistent. */
export function ledger37AiAccountNetValue(capitalCny: number | null | undefined, totalPnl: number | null | undefined): number | null {
  if (typeof capitalCny !== "number" || !Number.isFinite(capitalCny) || capitalCny < 0 || typeof totalPnl !== "number" || !Number.isFinite(totalPnl)) return null;
  const total = capitalCny + totalPnl;
  return Number.isFinite(total) ? total : null;
}

export function Ledger37AiAccountSummaryRenderer({ capitalCny, totalPnl, disclosedAt = null, usdCnyRate = null, loading = false, unavailable = false, updating = false }: {
  capitalCny: number | null; totalPnl: number | null; disclosedAt?: string | null; usdCnyRate?: number | null; loading?: boolean; unavailable?: boolean; updating?: boolean;
}) {
  const dateLabel = !loading && !unavailable ? ledger37AiNetDisclosureDate(disclosedAt) : null;
  return <>
    {dateLabel && <time data-ai-net-disclosure-date="true" dateTime={disclosedAt!} className="block px-4 pb-3 text-left text-[10px] leading-4 tabular-nums text-[#61758A]">{dateLabel}</time>}
    <div data-ai-account-summary="true" className="border-t border-[#EAF2F7] bg-[#F8FBFD]">
    <div data-ai-account-summary-grid="true" className="grid min-w-0 grid-cols-3 items-start divide-x divide-[#EAF2F7]">
      <Ledger37AiRequiredCapitalRenderer amountCny={capitalCny} usdCnyRate={usdCnyRate} loading={loading} unavailable={unavailable} compact />
      <Ledger37AiNetValueDisclosureRenderer totalPnl={totalPnl} usdCnyRate={usdCnyRate} loading={loading} unavailable={unavailable} updating={updating} compact />
      <Ledger37AiRequiredCapitalRenderer amountCny={ledger37AiAccountNetValue(capitalCny, totalPnl)} usdCnyRate={usdCnyRate} loading={loading} unavailable={unavailable} netValue compact />
    </div>
    </div>
  </>;
}

/** Mount only within the confirmed AI tree; safe query never reads a raw portfolio. */
export default function Ledger37AiNetValueDisclosure({ viewerUserId, adminPreview = false }: { viewerUserId: number; adminPreview?: boolean }) {
  const validViewer = Number.isSafeInteger(viewerUserId) && viewerUserId > 0;
  const query = trpc.ledger.getMyLedger37AiStockPool.useQuery(
    { ledgerId: 37, viewAsUserId: viewerUserId },
    { enabled: validViewer, placeholderData: undefined, retry: false, staleTime: 60_000, refetchOnMount: "always", refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  const pool = validViewer && !query.error && query.isFetchedAfterMount && query.data?.viewerUserId === viewerUserId && (query.data.aiEnabled === true || adminPreview) ? query.data : undefined;
  return <Ledger37AiAccountSummaryRenderer capitalCny={pool?.requiredCapitalCny ?? null} totalPnl={ledger37AiNetDisclosureTotal(pool)} disclosedAt={pool?.disclosedAt ?? null} usdCnyRate={pool?.capitalUsdCnyRate ?? pool?.disclosureUsdCnyRate ?? null} loading={validViewer && !query.error && !query.isFetchedAfterMount} unavailable={Boolean(query.error)} updating={Boolean(pool && query.isFetching)} />;
}
