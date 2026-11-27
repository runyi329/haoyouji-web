import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { trpc as appTrpc } from "@/lib/trpc";
import {
  MIBAN_BENEFITS_STOREFRONT,
  type BenefitCartItem,
  type BenefitQuote,
  type BenefitResult,
} from "../../../../shared/miban-benefits";

export type BenefitsQuoteInput = {
  storefront: typeof MIBAN_BENEFITS_STOREFRONT;
  items: BenefitCartItem[];
  mode: "once" | "annual";
};
type QuoteOptions = {
  enabled: boolean;
  retry: false;
  staleTime: number;
  refetchInterval: false;
  refetchOnWindowFocus: true;
  refetchOnReconnect: false;
  refetchOnMount: "always";
};
// Narrow, temporary frontend contract while the parent wires the root router.
// This is the actual tRPC proxy, not a mock or an alternate request transport.
const trpc = appTrpc as unknown as {
  benefits: { quote: { useQuery(input: BenefitsQuoteInput, options: QuoteOptions): UseQueryResult<BenefitQuote, Error> } };
};

export function benefitsResultHash(result: BenefitResult): string {
  return JSON.stringify({
    originalCents: result.originalCents,
    totalCents: result.totalCents,
    savedCents: result.savedCents,
    summary: result.summary,
    consumedRuleIds: [...result.consumedRuleIds].sort(),
    couponId: result.couponId ?? null,
    lines: [...result.lines].sort((a, b) => a.productKey.localeCompare(b.productKey) || a.skuId.localeCompare(b.skuId))
      .map(line => [line.productKey, line.skuId, line.quantity, line.originalCents, line.totalCents, line.ruleId ?? null, line.ruleName ?? null]),
  });
}

export function validBenefitsQuote(quote: BenefitQuote | undefined, input: BenefitsQuoteInput, now = Date.now()): quote is BenefitQuote {
  if (!quote?.quoteToken || typeof quote.quoteToken !== "string" || !Number.isFinite(quote.expiresAt) || quote.expiresAt <= now ||
      (quote.storefront != null && quote.storefront !== input.storefront)) return false;
  const result = quote.result;
  if (!result || !Number.isSafeInteger(result.originalCents) || result.originalCents <= 0 ||
      !Number.isSafeInteger(result.totalCents) || result.totalCents <= 0 || result.totalCents > result.originalCents ||
      !Number.isSafeInteger(result.savedCents) || result.savedCents !== result.originalCents - result.totalCents ||
      typeof result.summary !== "string" || !Array.isArray(result.consumedRuleIds) ||
      !result.consumedRuleIds.every(id => typeof id === "string") || !Array.isArray(result.lines)) return false;
  const expected = new Map<string, number>();
  for (const item of input.items) {
    const key = JSON.stringify([item.productKey, item.skuId]);
    expected.set(key, (expected.get(key) ?? 0) + item.quantity * (input.mode === "annual" ? 12 : 1));
  }
  let original = 0, total = 0;
  for (const line of result.lines) {
    const key = JSON.stringify([line.productKey, line.skuId]);
    if (expected.get(key) !== line.quantity || !Number.isSafeInteger(line.originalCents) || line.originalCents <= 0 ||
        !Number.isSafeInteger(line.totalCents) || line.totalCents <= 0 || line.totalCents > line.originalCents) return false;
    expected.delete(key);
    original += line.originalCents;
    total += line.totalCents;
  }
  return expected.size === 0 && result.lines.length > 0 && original === result.originalCents && total === result.totalCents;
}

// Read-only change detection, never authorization: the server still verifies the signature.
// Nonces/expiry differ on every refresh, so compare just the signed pricing/rule revisions.
export function benefitsRevisionFingerprint(quote: BenefitQuote): string | null {
  try {
    const encoded = quote.quoteToken.split(".")[0];
    if (!encoded || encoded.length > 40000) return null;
    const payload: unknown = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload || typeof payload !== "object") return null;
    const revision = payload as Record<string, unknown>;
    if (typeof revision.rulesHash !== "string" || typeof revision.catalogHash !== "string") return null;
    return JSON.stringify([revision.rulesHash, revision.catalogHash]);
  } catch { return null; }
}

export function benefitsNeedReconfirmation(displayed: BenefitQuote, fresh: BenefitQuote, now = Date.now()): boolean {
  return displayed.expiresAt <= now || benefitsResultHash(displayed.result) !== benefitsResultHash(fresh.result) ||
    benefitsRevisionFingerprint(displayed) !== benefitsRevisionFingerprint(fresh);
}

type Snapshot = { owner: string; scope: string; quote: BenefitQuote };
export function useMibanBenefitsQuote({ items, mode = "once", enabled, userId }: {
  items: BenefitCartItem[];
  mode?: "once" | "annual";
  enabled: boolean;
  userId: number | string | null | undefined;
}) {
  const itemKey = JSON.stringify(items.map(item => [item.productKey, item.skuId, item.quantity]));
  const input = useMemo<BenefitsQuoteInput>(() => ({ storefront: MIBAN_BENEFITS_STOREFRONT, items, mode }), [itemKey, mode]);
  const owner = userId == null ? "" : String(userId);
  const active = enabled && !!owner && items.length > 0 && items.every(item => !!item.productKey && !!item.skuId && Number.isSafeInteger(item.quantity) && item.quantity > 0);
  const scope = JSON.stringify([owner, input]);
  const query = trpc.benefits.quote.useQuery(input, {
    enabled: active,
    retry: false,
    staleTime: 0,
    refetchInterval: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: false,
    refetchOnMount: "always",
  });
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const latest = useRef({ active, owner, scope, input });
  latest.current = { active, owner, scope, input };
  const latestQueryState = useRef({ fetching: query.isFetching, error: query.isError, failure });
  latestQueryState.current = { fetching: query.isFetching, error: query.isError, failure };
  const held = useRef<Snapshot | null>(null);
  const settledScope = useRef<string | null>(null);
  const busy = useRef(false);
  const initialRequestScope = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const adopt = useCallback((quote: BenefitQuote, requestScope: string, requestOwner: string) => {
    const next = { quote, scope: requestScope, owner: requestOwner };
    held.current = next;
    setSnapshot(next);
    setFailure(null);
    settledScope.current = requestScope;
  }, []);
  const fetchQuote = useCallback(async (confirm: boolean): Promise<BenefitQuote | null> => {
    const current = latest.current;
    if (!current.active || busy.current || !mounted.current) return null;
    const displayed = held.current?.scope === current.scope ? held.current.quote : null;
    if (confirm && (!displayed || settledScope.current !== current.scope || query.isFetching || query.isError || failure)) return null;
    busy.current = true;
    setChecking(true);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        query.refetch({ cancelRefetch: false }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("优惠报价核验超时，请重试；未提交订单")), 15_000); }),
      ]);
      if (!mounted.current || !latest.current.active || latest.current.scope !== current.scope) return null;
      if (result.isError || !validBenefitsQuote(result.data, current.input)) throw new Error("优惠报价读取失败，请重试；未提交订单");
      const fresh = result.data;
      adopt(fresh, current.scope, current.owner);
      if (confirm && displayed && benefitsNeedReconfirmation(displayed, fresh)) {
        setNotice("金额/优惠已更新，请核对后再次确认支付");
        return null; // Never call the wallet using a stale total from this click.
      }
      if (!confirm && displayed && benefitsNeedReconfirmation(displayed, fresh)) setNotice("金额/优惠已更新，请核对后再次确认支付");
      return fresh;
    } catch (error) {
      if (mounted.current && latest.current.scope === current.scope) setFailure(error instanceof Error ? error.message : "优惠报价读取失败，请重试；未提交订单");
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
      busy.current = false;
      if (mounted.current) setChecking(false);
    }
  }, [query.refetch, query.isFetching, query.isError, failure, adopt]);
  const fetchRef = useRef(fetchQuote);
  fetchRef.current = fetchQuote;
  useEffect(() => {
    settledScope.current = null;
    initialRequestScope.current = null;
    setNotice(null);
    setFailure(null);
  }, [active, scope]);
  useEffect(() => {
    if (!active || checking || initialRequestScope.current === scope) return;
    initialRequestScope.current = scope;
    // Deduplicates the enabled useQuery request; never trusts another user's cached quote.
    void fetchRef.current(false);
  }, [active, scope, checking]);
  useEffect(() => {
    if (!active || query.isFetching || query.isError || checking || settledScope.current !== scope || !validBenefitsQuote(query.data, input)) return;
    const displayed = held.current?.scope === scope ? held.current.quote : null;
    if (displayed && displayed.quoteToken !== query.data.quoteToken) {
      if (benefitsNeedReconfirmation(displayed, query.data)) setNotice("金额/优惠已更新，请核对后再次确认支付");
      adopt(query.data, scope, owner);
    }
  }, [active, query.data, query.isFetching, query.isError, checking, scope, owner, input, adopt]);
  const quote = snapshot?.owner === owner && snapshot.scope === scope && active ? snapshot.quote : null;
  // Keep the last real same-user amount during refetch/quantity changes, not a fictitious original-price fallback.
  const displayQuote = active && snapshot?.owner === owner ? snapshot.quote : null;
  const error = failure ?? (query.isError ? "优惠报价读取失败，请重试；未提交订单" : null);
  const ready = active && !!quote && settledScope.current === scope && !checking && !query.isFetching && !error;
  const isCurrent = useCallback((candidate: BenefitQuote) => {
    const current = latest.current;
    return current.active && held.current?.scope === current.scope && candidate.expiresAt > Date.now() &&
      benefitsResultHash(candidate.result) === benefitsResultHash(held.current.quote.result) && !busy.current &&
      benefitsRevisionFingerprint(candidate) === benefitsRevisionFingerprint(held.current.quote) &&
      !latestQueryState.current.fetching && !latestQueryState.current.error && !latestQueryState.current.failure;
  }, []);
  return {
    quote, displayQuote, ready, error, notice,
    loading: active && (!quote || checking || query.isFetching) && !error,
    totalCny: displayQuote ? displayQuote.result.totalCents / 100 : 0,
    refreshForConfirmation: () => fetchQuote(true),
    retry: () => { void fetchQuote(false); },
    refreshAfterRejection: () => {
      setNotice("金额/优惠已更新，请核对后再次确认支付");
      void fetchQuote(false); // Refresh only: never retry an order or debit automatically.
    },
    isCurrent,
  };
}

export function MibanBenefitsQuoteSummary({ benefits, originalCny, accent = "#0D7A3E" }: {
  benefits: Pick<ReturnType<typeof useMibanBenefitsQuote>, "displayQuote" | "loading" | "error" | "notice" | "retry">;
  originalCny: number;
  accent?: string;
}) {
  const result = benefits.displayQuote?.result;
  return <div data-benefits-quote-summary aria-busy={benefits.loading} className="min-h-[64px] min-w-0 py-2 text-[11px] leading-5">
    <p className="text-gray-400">商品原价 ¥{(result ? result.originalCents / 100 : originalCny).toFixed(2)}</p>
    <p className="truncate" title={result?.summary} style={{ color: result?.savedCents ? accent : "#6b7280" }}>
      {result ? result.savedCents > 0 ? `已自动选用：${result.summary} / 已优惠¥${(result.savedCents / 100).toFixed(2)}` : "正常售价，暂无可用优惠" : "正在查询本人优惠…"}
    </p>
    <p role={benefits.error ? "alert" : "status"} aria-live="polite" className="flex h-5 min-w-0 items-center gap-2 text-gray-500">
      <span className="truncate">{benefits.error ?? benefits.notice ?? (benefits.loading ? "正在核验优惠报价，暂不可付款" : "付款前再次核验优惠")}</span>
      {benefits.error && <button type="button" onClick={benefits.retry} className="shrink-0 font-semibold underline" style={{ color: accent }}>重试</button>}
    </p>
  </div>;
}
