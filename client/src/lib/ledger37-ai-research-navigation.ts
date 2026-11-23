/** Navigation metadata only; permissions remain in the confirmed ledger37 context. */
export function isLedger37AiResearchVisit(search: string): boolean {
  return new URLSearchParams(search).get("fromLedger37Ai") === "1";
}

/** Preview and viewing-as research never save the actor's local favorites. */
export function isLedger37AiResearchReadOnly(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has("previewKey") || (isLedger37AiResearchVisit(search) && params.has("viewAs"));
}

export function ledger37AiResearchEntryHref(viewAsUserId: number | undefined, search = ""): string {
  const params = new URLSearchParams({ fromLedger37Ai: "1" });
  if (Number.isSafeInteger(viewAsUserId) && (viewAsUserId ?? 0) > 0) params.set("viewAs", String(viewAsUserId));
  const current = new URLSearchParams(search);
  for (const key of ["previewKey", "v"]) {
    const value = current.get(key);
    if (value) params.set(key, value);
  }
  return `/ledger/37/ai-database?${params.toString()}`;
}

/** Keep ledger37 AI identity through existing public research tabs and stock details. */
export function preserveLedger37AiResearchScope(href: string, search: string): string {
  if (!isLedger37AiResearchVisit(search)) return href;
  const target = new URL(href, "https://ledger37.invalid");
  if (target.origin !== "https://ledger37.invalid"
    || !/^(?:\/ledger\/37(?:\/(?:ai-database|stock-compare|stock-monitor|stock-lifecycle))?|\/stock\/[A-Za-z0-9-]+)\/?$/.test(target.pathname)) return href;
  const current = new URLSearchParams(search);
  for (const key of ["fromLedger37Ai", "viewAs", "previewKey", "v"]) {
    const value = current.get(key);
    if (value && !target.searchParams.has(key)) target.searchParams.set(key, value);
  }
  return `${target.pathname}${target.search}${target.hash}`;
}
