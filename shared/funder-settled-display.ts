import { finitePositive, formatFxEstimate } from './usdt-cny-display';

/** Display-only historical evidence. Never mutate an order, combine scopes, or fetch live data. */
export function parseFunderHistoricalRecord(value: unknown): Record<string, any> | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

export function isFunderSettledStatus(status: unknown): boolean {
  return ['settled', 'completed'].includes(String(status ?? '').trim().toLowerCase());
}

/** The API-projected personal order is already the viewer's scope. Explicit null is not a fallback. */
export function selectFunderHistoricalDisplay(order: any, jointSegmentMode = false) {
  const primary = jointSegmentMode ? null : parseFunderHistoricalRecord(order?.joint_order_primary_settlement);
  const primarySettled = !jointSegmentMode && isFunderSettledStatus(primary?.status);
  const frozen = isFunderSettledStatus(order?.status) || primarySettled;
  const snapshot = parseFunderHistoricalRecord(primarySettled ? primary?.settlement_snapshot : order?.settlement_snapshot);
  return { frozen, primary, primarySettled, snapshot };
}

/** null/blank/NaN are unknown; genuine zero (including a numeric string) is evidence. */
export function readFunderHistoricalNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function readFunderHistoricalOptionQuote(snapshot: unknown) {
  const record = parseFunderHistoricalRecord(snapshot);
  const quote = parseFunderHistoricalRecord(record?.optionQuote);
  if (!quote) return null;
  const rawMark = readFunderHistoricalNumber(quote.markPriceUsdt);
  return {
    instrumentName: typeof quote.instrumentName === 'string' ? quote.instrumentName : '',
    markPrice: rawMark !== null && rawMark >= 0 ? rawMark : null,
    indexPrice: readFunderHistoricalNumber(quote.indexPriceUsdt),
    delta: readFunderHistoricalNumber(quote.delta),
    gamma: readFunderHistoricalNumber(quote.gamma),
    theta: readFunderHistoricalNumber(quote.theta),
    vega: readFunderHistoricalNumber(quote.vega),
    iv: readFunderHistoricalNumber(quote.iv),
    source: quote.source ?? null,
    quotedAt: quote.quotedAt || record?.capturedAt || null,
    error: quote.unavailableReason ?? null,
  };
}

/** A mark/index price is not a Greek. A partial saved Greek remains useful. */
export function hasValidFunderHistoricalGreeks(quote: unknown): boolean {
  const record = parseFunderHistoricalRecord(quote);
  return !!record && ['delta', 'gamma', 'theta', 'vega', 'iv'].some(key => readFunderHistoricalNumber(record[key]) !== null);
}

export function getFunderUnknownEstimateText(frozen: boolean, historicalFx: unknown): string {
  return frozen ? (finitePositive(historicalFx) === null ? '未保存结算汇率' : '未保存结算估值') : '汇率/估值待更新';
}

/** Bind missing-estimate wording to this card's historical scope, retaining the existing formatting API. */
export function createFunderDisplayFormatter(frozen: boolean, historicalFx: unknown): typeof formatFxEstimate {
  return ((value: unknown, method: 'toFixed' | 'toLocaleString', arg?: number | string | string[], options?: Intl.NumberFormatOptions) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return getFunderUnknownEstimateText(frozen, historicalFx);
    return method === 'toFixed' ? formatFxEstimate(value, 'toFixed', arg as number | undefined)
      : formatFxEstimate(value, 'toLocaleString', arg as string | string[] | undefined, options);
  }) as typeof formatFxEstimate;
}

export function normalizeFunderRegisteredCurrency(value: unknown): string | null {
  const currency = String(value ?? '').trim().toUpperCase();
  if (['CNY', 'RMB', '人民币', '元'].includes(currency)) return 'CNY';
  if (['U', 'USDT'].includes(currency)) return 'USDT';
  return currency || null;
}

/** Only a UI fallback: do not feed this native amount back into risk or ledger calculations. */
export function getFunderRegisteredPaidDisplay(paidTotal: unknown, legacyBaseCurrency: unknown, convertedValue: number, requestedCurrency: unknown) {
  const record = parseFunderHistoricalRecord(paidTotal);
  const amount = readFunderHistoricalNumber(record?.amount);
  const currency = normalizeFunderRegisteredCurrency(record?.currency) ?? normalizeFunderRegisteredCurrency(legacyBaseCurrency);
  const requested = normalizeFunderRegisteredCurrency(requestedCurrency);
  if (record && amount === null) return { value: Number.NaN, currency, nativeFallback: currency !== requested };
  if (record && amount !== null && currency && (currency === requested || !Number.isFinite(convertedValue))) {
    return { value: amount, currency, nativeFallback: currency !== requested };
  }
  return { value: convertedValue, currency: requested, nativeFallback: false };
}

/** A registered commission is not the pending share derived from PnL or a percentage. */
export function getFunderRegisteredCommissionDisplay(order: any) {
  const info = parseFunderHistoricalRecord(order?.participantInfo);
  const value = readFunderHistoricalNumber(info?.paidCommission);
  return value === null ? null : { value, currency: normalizeFunderRegisteredCurrency(info?.interestBaseCurrency) };
}

export function getFunderRegisteredCurrencyUnit(currency: string | null): string {
  return currency === 'CNY' ? '元' : currency === 'USDT' ? 'u' : currency || '（原登记值，币种未保存）';
}
