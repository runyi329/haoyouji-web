import { parsePortfolioInstrument } from '../../shared/portfolio-instruments';
import { isStockSessionDate } from '../../shared/stock-market-session';
import { USDT_USD_PARITY_POLICY } from '../../shared/usdt-usd-parity-policy';
import type { Ledger37HoldingQuote } from '../../shared/ledger37-ai-holdings';

export type Ledger37ValuationPosition = {
  categoryId: number; symbol: string; currency: 'CNY' | 'USD' | 'USDT'; shares: bigint;
};
export type Ledger37LiveHoldingQuote = { symbol: string; price: number; priceDate: string; updatedAt: string };
export type Ledger37LiveHoldingValuation = {
  values: Map<string, bigint>; decimalPlaces: number; valuationAsOf: string; reportingCurrency: 'CNY';
  quotes: Map<string, Ledger37HoldingQuote>;
};
const zero = BigInt(0), ten = BigInt(10);
const power = (places: number) => ten ** BigInt(places);
export const ledger37HoldingKey = (symbol: string, currency: string) => JSON.stringify([symbol, currency]);
type Decimal = { coefficient: bigint; places: number };
/** Parse the original saved decimal representation, including small JSON exponents.
 * No quantity, price, FX or value multiplication uses floating point. */
function positiveDecimal(value: unknown): Decimal | null {
  if (typeof value !== 'number' && typeof value !== 'string' || !Number.isFinite(Number(value))) return null;
  const match = /^(\d{1,65})(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) return null;
  let coefficient = BigInt(match[1] + (match[2] || ''));
  let places = (match[2] || '').length - Number(match[3] || 0);
  if (coefficient <= zero || Math.abs(places) > 400) return null;
  if (places < 0) { coefficient *= power(-places); places = 0; }
  while (places > 0 && coefficient % ten === zero) { coefficient /= ten; places--; }
  return { coefficient, places };
}
function instant(value: unknown): number {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    ? Date.parse(value) : NaN;
}
/** Latest real market evidence, not a 15:05 historical calendar close.
 * Securities may retain their actual latest exchange date during a closure;
 * crypto must be real fresh spot evidence. Future/invalid evidence never wins. */
export function isLedger37LiveHoldingQuoteValid(quote: Ledger37LiveHoldingQuote | undefined, now: number): boolean {
  if (!quote || !parsePortfolioInstrument(quote.symbol) || !Number.isFinite(now)
    || typeof quote.price !== 'number' || !Number.isFinite(quote.price) || quote.price <= 0
    || !isStockSessionDate(quote.priceDate)) return false;
  const captured = instant(quote.updatedAt);
  if (!Number.isFinite(captured) || captured > now || captured <= 0) return false;
  const today = new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return quote.priceDate <= today && (parsePortfolioInstrument(quote.symbol)!.market !== 'CRYPTO'
    || now - captured <= 120_000 && quote.priceDate === today);
}

/** Pure valuation of current exact remaining shares. One live USD/CNY evidence
 * applies to BOTH USD and USDT under the already-authorized accounting parity;
 * no Coinbase bridge, reference/buy price, equal weights or missing-price zeros.
 * A single missing leg makes the entire current denominator unknown. */
export function valueLedger37LiveHoldings(input: {
  current: readonly Ledger37ValuationPosition[]; quotes: Record<string, Ledger37LiveHoldingQuote>;
  usdFx: { rate: number; asOf: string; source: string; pair: string; stale: boolean } | null;
  conversionPolicy: string; now: number;
}): Ledger37LiveHoldingValuation | null {
  const { current, quotes, usdFx, now } = input;
  if (!Number.isFinite(now) || !current.length || input.conversionPolicy !== USDT_USD_PARITY_POLICY) return null;
  const fxAt = instant(usdFx?.asOf);
  if (!usdFx || usdFx.pair !== 'USD/CNY' || usdFx.stale !== false
    || typeof usdFx.rate !== 'number' || !Number.isFinite(usdFx.rate) || usdFx.rate <= 0 || usdFx.rate >= 100
    || !['sina_usdcny', 'yahoo_usdcny_5m'].includes(usdFx.source) || !Number.isFinite(fxAt) || fxAt > now || fxAt <= 0) return null;
  const fx = positiveDecimal(usdFx.rate);
  if (!fx) return null;
  const contributions: Array<{ key: string; value: Decimal }> = [];
  const verifiedQuotes = new Map<string, Ledger37HoldingQuote>();
  for (const row of current) {
    const instrument = parsePortfolioInstrument(row.symbol), quote = quotes[row.symbol];
    if (!instrument || instrument.currency !== row.currency || row.shares <= zero
      || !Number.isSafeInteger(row.categoryId) || row.categoryId <= 0
      || quote?.symbol !== row.symbol || !isLedger37LiveHoldingQuoteValid(quote, now)) return null;
    const price = positiveDecimal(quote.price);
    if (!price) return null;
    const digits = String(price.coefficient).padStart(price.places + 1, '0');
    verifiedQuotes.set(ledger37HoldingKey(row.symbol, row.currency), {
      amount: price.places ? `${digits.slice(0, -price.places)}.${digits.slice(-price.places)}` : digits,
      currency: row.currency, asOf: quote.priceDate,
    });
    const multiplier = row.currency === 'CNY' ? { coefficient: BigInt(1), places: 0 } : fx;
    contributions.push({ key: ledger37HoldingKey(row.symbol, row.currency), value: {
      coefficient: row.shares * price.coefficient * multiplier.coefficient,
      places: 8 + price.places + multiplier.places,
    } });
  }
  const decimalPlaces = Math.max(...contributions.map(row => row.value.places));
  const values = new Map<string, bigint>();
  for (const row of contributions) values.set(row.key, (values.get(row.key) || zero)
    + row.value.coefficient * power(decimalPlaces - row.value.places));
  return { values, decimalPlaces, quotes: verifiedQuotes,
    valuationAsOf: new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10), reportingCurrency: 'CNY' };
}

/** Largest-remainder apportionment of the EXACT complete denominator, to 12dp %.
 * Only sub-precision rounding residue is allocated, never missing evidence. */
export function ledger37HoldingWeights(values: readonly bigint[]): number[] | null {
  if (!values.length || values.some(value => value <= zero)) return null;
  const total = values.reduce((sum, value) => sum + value, zero);
  const unit = BigInt('1000000000000'), full = BigInt(100) * unit;
  const rows = values.map((value, index) => ({ index, units: value * full / total, remainder: value * full % total }));
  let residue = full - rows.reduce((sum, row) => sum + row.units, zero);
  const ranked = rows.slice().sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) { if (residue === zero) break; row.units++; residue--; }
  const weights = rows.map(row => Number(row.units) / Number(unit));
  // Remove binary Number summation residue only; the apportioned decimal sum is exactly 100.
  weights[weights.length - 1] = 100 - weights.slice(0, -1).reduce((sum, value) => sum + value, 0);
  return weights.every(weight => Number.isFinite(weight) && weight >= 0 && weight <= 100) ? weights : null;
}
export function ledger37HoldingAmount(value: bigint, places: number): string {
  const unit = power(18);
  const rounded = places > 18 ? (value + power(places - 18) / BigInt(2)) / power(places - 18) : value * power(18 - places);
  const fraction = String(rounded % unit).padStart(18, '0').replace(/0+$/, '');
  return String(rounded / unit) + (fraction ? `.${fraction}` : '');
}
