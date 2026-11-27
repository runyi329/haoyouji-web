import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { isCryptoAssetCode, type CryptoAssetCode } from "@shared/crypto-asset-catalog";

export type DemandCryptoSpotQuote = {
  price: number | null;
  currency: "USDT";
  source: string | null;
  updatedAt: string | null;
  stale: boolean;
};
export type DemandCryptoSpotQuotes = Record<string, DemandCryptoSpotQuote>;
export const DEMAND_CRYPTO_REFETCH_MS = 10_000;
const MAX_QUOTE_AGE_MS = 120_000;

/** Only explicit catalog crypto bases are leased; never pass a stock ticker or the directory. */
export function normalizeDemandCryptoSymbols(rawSymbols: readonly unknown[]): CryptoAssetCode[] {
  const symbols = rawSymbols.map(raw => {
    const value = String(raw ?? "").trim().toUpperCase();
    const instrument = /^CRYPTO:([A-Z0-9_]+)-USDT$/.exec(value);
    return instrument ? instrument[1] : value;
  }).filter((code): code is CryptoAssetCode => code !== "USDT" && code !== "CNY" && isCryptoAssetCode(code));
  return Array.from(new Set(symbols)).sort().slice(0, 216);
}

/** Server stale metadata is mandatory; the browser also expires a disconnected cached response. */
export function getFreshDemandCryptoPrices(
  quotes: DemandCryptoSpotQuotes | undefined,
  symbols: readonly string[],
  now = Date.now(),
): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const symbol of symbols) {
    const quote = quotes?.[symbol];
    if (!quote || quote.stale !== false || quote.currency !== "USDT"
      || typeof quote.price !== "number" || !Number.isFinite(quote.price) || quote.price <= 0
      || !quote.updatedAt) continue;
    const observedAt = Date.parse(quote.updatedAt);
    // BTY MEXC spot snapshots are allowed up to six minutes by the unified quote service.
    const maxAge = symbol === "BTY" && quote.source === "MEXC BTY/USDT 现货" ? 360_000 : MAX_QUOTE_AGE_MS;
    if (!Number.isFinite(observedAt) || observedAt > now + 5_000 || now - observedAt > maxAge) continue;
    prices[symbol] = quote.price;
  }
  return prices;
}

/** Preserve unrelated order quotes, but an unavailable selected asset must not revive an old order price. */
export function mergeDemandCryptoPrices(
  orderPrices: Record<string, number>,
  symbols: readonly string[],
  freshPrices: Record<string, number>,
): Record<string, number> {
  const merged = { ...orderPrices };
  for (const symbol of symbols) {
    delete merged[symbol];
    const price = freshPrices[symbol];
    if (typeof price === "number" && Number.isFinite(price) && price > 0) merged[symbol] = price;
  }
  return merged;
}

/** Read-only selection lease. Closing/unmounting stops renewals; persisted holdings are kept alive server-side. */
export function useDemandCryptoQuotes(rawSymbols: readonly unknown[], enabled = true) {
  const symbolsKey = normalizeDemandCryptoSymbols(enabled ? rawSymbols : []).join("|");
  const symbols = useMemo<CryptoAssetCode[]>(() => normalizeDemandCryptoSymbols(symbolsKey ? symbolsKey.split("|") : []), [symbolsKey]);
  const active = enabled && symbols.length > 0;
  const query = trpc.ledger.getCryptoSpotQuotes.useQuery(
    { symbols },
    {
      enabled: active,
      staleTime: 0,
      refetchInterval: active ? DEMAND_CRYPTO_REFETCH_MS : false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
      // Intentionally no placeholderData: previous BTC data must never become an ETH quote.
    },
  );
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setClock(Date.now()), DEMAND_CRYPTO_REFETCH_MS);
    return () => window.clearInterval(timer);
  }, [active]);
  const quotes = query.data?.quotes as DemandCryptoSpotQuotes | undefined;
  const prices = useMemo(
    () => getFreshDemandCryptoPrices(quotes, symbols, Math.max(clock, Date.now())),
    [quotes, symbols, clock],
  );
  return { ...query, symbols, quotes, prices };
}
