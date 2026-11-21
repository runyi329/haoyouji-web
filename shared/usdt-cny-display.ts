/** Display-only FX helpers. Never invent a rate or rewrite a historical snapshot. */
export function finitePositive(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function getUsdtCnyRate(quote: unknown): number | null {
  if (!quote || typeof quote !== 'object') return null;
  const fx = quote as { success?: boolean; stale?: boolean; rate?: unknown; money?: unknown; pair?: string; fromcoin?: string; observedAt?: string | null };
  if (fx.success !== true || fx.stale === true || (fx.pair !== undefined && fx.pair !== 'USDT/CNY')
    || (fx.fromcoin !== undefined && fx.fromcoin !== 'USDT') || !usableObservation(fx.observedAt)) return null;
  return finitePositive(fx.rate ?? fx.money);
}

/** 兼容旧success/money包装，但只允许明确美元身份，不能把USDT换成USD。 */
export function getUsdCnyRate(quote: unknown): number | null {
  if (!quote || typeof quote !== 'object') return null;
  const fx = quote as { success?: boolean; stale?: boolean; rate?: unknown; money?: unknown; pair?: string; fromcoin?: string };
  if (fx.success !== true || fx.stale === true || (fx.pair !== undefined && fx.pair !== 'USD/CNY')
    || (fx.fromcoin !== undefined && fx.fromcoin !== 'USD')) return null;
  return finitePositive(fx.rate ?? fx.money);
}

/** 容纳60秒页面轮询；网络失败后不能无限展示旧的“实时”USDT值。 */
function usableObservation(value: string | null | undefined): boolean {
  if (value == null) return true; // 旧包装兼容；新版服务均提供真实observedAt。
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= Date.now() + 5_000 && Date.now() - at <= 120_000;
}

export function getUsdtCnyRateFromPrices(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const prices = data as { usdtCnyRate?: unknown; usdtCnyFx?: unknown };
  // Metadata is mandatory: a bare cached number cannot establish freshness/success.
  const metadata = prices.usdtCnyFx as { pair?: string; stale?: boolean; rate?: unknown; source?: string; asOf?: string; observedAt?: string; success?: boolean } | null;
  if (!metadata || metadata.stale === true || metadata.success === false || !usableObservation(metadata.observedAt)) return null;
  const rate = metadata.success === true ? getUsdtCnyRate(metadata)
    : metadata.pair === 'USDT/CNY' && metadata.source && metadata.asOf ? finitePositive(metadata.rate) : null;
  const displayed = finitePositive(prices.usdtCnyRate);
  return rate !== null && displayed !== null && Math.abs(rate - displayed) <= rate * 1e-12 ? rate : null;
}

export function getOrderUsdtCnyRate(frozen: boolean, snapshotRate: unknown, liveQuote: unknown): number | null {
  // Frozen means frozen, including missing historical data. Never fill it with today's quote.
  return frozen ? finitePositive(snapshotRate) : getUsdtCnyRate(liveQuote);
}

export function resolveUsdtCnyPaymentRate(input: unknown, liveRate: unknown): number | null {
  const hasInput = input !== null && input !== undefined && String(input).trim() !== '';
  return hasInput ? finitePositive(input) : finitePositive(liveRate);
}

export function usdtToCny(amount: number, rate: unknown): number | null {
  const usable = finitePositive(rate);
  const result = usable !== null ? amount * usable : NaN;
  return Number.isFinite(amount) && Number.isFinite(result) ? result : null;
}

export function cnyToUsdt(amount: number, rate: unknown): number | null {
  const usable = finitePositive(rate);
  const result = usable !== null ? amount / usable : NaN;
  return Number.isFinite(amount) && Number.isFinite(result) ? result : null;
}

/** Keep non-finite intermediate estimates internal; only explicit pending text reaches the UI. */
export function formatFxEstimate(value: unknown, method: 'toFixed', digits?: number): string;
export function formatFxEstimate(value: unknown, method: 'toLocaleString', locales?: string | string[], options?: Intl.NumberFormatOptions): string;
export function formatFxEstimate(value: unknown, method: 'toFixed' | 'toLocaleString', arg?: number | string | string[], options?: Intl.NumberFormatOptions): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '汇率/估值待更新';
  return method === 'toFixed' ? value.toFixed(arg as number | undefined) : value.toLocaleString(arg as string | string[] | undefined, options);
}

export function getWalletFxValuation(usdtTotal: number, cnyTotal: number, prices: unknown) {
  const rate = getUsdtCnyRateFromPrices(prices);
  return { rate, usdtTotal, cnyTotal, usdtValueCny: usdtToCny(usdtTotal, rate), cnyValueUsdt: cnyToUsdt(cnyTotal, rate) };
}
