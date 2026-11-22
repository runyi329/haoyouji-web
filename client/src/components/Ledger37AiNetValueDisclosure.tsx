import { trpc } from "@/lib/trpc";
import { r1ParticipationMoney } from "@/lib/r1StockPresentation";
import type { Ledger37AiStockPool } from "@shared/ledger37-ai-presentation";

/** Safe stock-pool values are already personal native P/L converted to CNY.
 * Include both current and historical actual allocations; no observations,
 * wallet cash, dividends added again, stock values or normalized NAV baseline.
 * Unknown participating P/L propagates instead of understating a partial total.
 */
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

/** Disclosure issuance date, not a trading day or an immutable 15:05 NAV.
 * Only the safe server response supplies the timestamp; never substitute today.
 */
export function ledger37AiNetDisclosureDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const date = new Date(value), time = date.getTime();
  if (!Number.isFinite(time) || time > Date.now() || date.toISOString() !== value) return null;
  const beijing = new Date(time + 8 * 60 * 60_000).toISOString().slice(0, 10);
  const [year, month, day] = beijing.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

/** The heading is a disclosure label, not a claim about unit NAV or total assets. */
export function Ledger37AiNetValueDisclosureRenderer({ totalPnl, disclosedAt = null, usdCnyRate = null, loading = false, unavailable = false, updating = false }: {
  totalPnl: number | null; disclosedAt?: string | null; usdCnyRate?: number | null; loading?: boolean; unavailable?: boolean; updating?: boolean;
}) {
  const known = typeof totalPnl === "number" && Number.isFinite(totalPnl) && !loading && !unavailable;
  const converted = known && typeof usdCnyRate === "number" && Number.isFinite(usdCnyRate) && usdCnyRate > 0 && usdCnyRate < 100 ? totalPnl / usdCnyRate : null;
  const totalU = converted !== null && Number.isFinite(converted) ? converted : null;
  const tone = totalU === null ? "text-[#61758A]" : totalU > 0 ? "text-[#D32F2F]" : totalU < 0 ? "text-[#2E7D32]" : "text-[#142A3F]";
  const dateLabel = known ? ledger37AiNetDisclosureDate(disclosedAt) : null;
  return <section aria-label="最新净值披露" data-ai-net-disclosure="true" className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[#EAF2F7] px-4 py-3">
    <div className="min-w-0"><p className="text-[12px] font-medium leading-5 text-[#142A3F]">最新净值披露</p>{dateLabel && <time data-ai-net-disclosure-date="true" dateTime={disclosedAt!} className="mt-1 block text-[10px] leading-4 tabular-nums text-[#61758A]">{dateLabel}</time>}</div>
    <div className="min-w-0 max-w-full text-right">
      <p data-ai-net-disclosure-pnl="true" className={`min-w-0 max-w-full break-words text-[21px] font-semibold leading-7 tracking-tight tabular-nums [overflow-wrap:anywhere] ${tone}`}>{totalU !== null ? <>{r1ParticipationMoney(totalU, "USD").replace("US$", "")}<span className="ml-0.5 align-baseline text-[11px] font-medium leading-none">u</span></> : loading ? "读取中…" : unavailable ? "披露暂不可用" : known ? "汇率待更新" : "待披露"}</p>
      {known && <p data-ai-net-disclosure-cny="true" className="mt-0.5 break-words text-[10px] font-medium leading-4 tabular-nums text-[#61758A]">≈ {r1ParticipationMoney(totalPnl).replace("¥", "")}<span className="ml-0.5 align-baseline text-[8px] font-medium leading-none">¥</span></p>}
    </div>
    <p role="status" aria-live="polite" className="sr-only">{updating ? "后台更新净值披露，保留当前数值" : known ? "个人累计盈亏，不含观察，不是持仓市值或可提现余额" : "暂无完整的个人盈亏数据，不以零代替"}</p>
  </section>;
}

/** The parent mounts this only within the confirmed AI source tree.
 * A separate safe query keeps a P/L failure from breaking the holdings list.
 */
export default function Ledger37AiNetValueDisclosure({ viewerUserId, adminPreview = false }: { viewerUserId: number; adminPreview?: boolean }) {
  const validViewer = Number.isSafeInteger(viewerUserId) && viewerUserId > 0;
  const query = trpc.ledger.getMyLedger37AiStockPool.useQuery(
    { ledgerId: 37, viewAsUserId: viewerUserId },
    { enabled: validViewer, placeholderData: undefined, retry: false, staleTime: 60_000, refetchOnMount: "always", refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  const pool = validViewer && !query.error && query.isFetchedAfterMount && query.data?.viewerUserId === viewerUserId && (query.data.aiEnabled === true || adminPreview) ? query.data : undefined;
  return <Ledger37AiNetValueDisclosureRenderer totalPnl={ledger37AiNetDisclosureTotal(pool)} disclosedAt={pool?.disclosedAt ?? null} usdCnyRate={pool?.disclosureUsdCnyRate ?? null} loading={validViewer && !query.error && !query.isFetchedAfterMount} unavailable={Boolean(query.error)} updating={Boolean(pool && query.isFetching)} />;
}
