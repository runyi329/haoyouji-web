/** Settlement evidence only. No router, database, market service or payment computation. */
export function readFunderEvidenceNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function readFunderOptionSettlementMark(value: unknown): number | null {
  const number = readFunderEvidenceNumber(value);
  return number !== null && number >= 0 ? number : null;
}

export type FunderOptionInstrument = {
  currency: 'BTC' | 'ETH'; instrumentName: string; gateSymbol: string; cacheKey: string;
};

export function buildFunderOptionInstrument(optionInfo: Record<string, any> | null): FunderOptionInstrument | null {
  const currency = String(optionInfo?.coin || '').trim().toUpperCase();
  const strikePrice = readFunderEvidenceNumber(optionInfo?.strikePrice);
  const direction = optionInfo?.direction;
  if ((currency !== 'BTC' && currency !== 'ETH') || strikePrice === null || strikePrice <= 0
    || !['long_call', 'short_call', 'long_put', 'short_put'].includes(direction)) return null;
  const raw = typeof optionInfo?.exerciseDate === 'string' ? optionInfo.exerciseDate.trim() : '';
  let exerciseDate = raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // Retain the existing UTC-ISO -> Beijing natural-day compatibility, not JS's permissive date parser.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return null;
    const rawDay = raw.slice(0, 10);
    const calendarDay = new Date(`${rawDay}T08:00:00Z`);
    if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0, 10) !== rawDay) return null;
    const timestamp = new Date(raw);
    if (!Number.isFinite(timestamp.getTime())) return null;
    exerciseDate = new Date(timestamp.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
  const date = new Date(`${exerciseDate}T08:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== exerciseDate) return null;
  const optionType = direction === 'long_call' || direction === 'short_call' ? 'C' : 'P';
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const instrumentName = `${currency}-${date.getUTCDate()}${months[date.getUTCMonth()]}${String(date.getUTCFullYear()).slice(2)}-${strikePrice}-${optionType}`;
  return {
    currency, instrumentName,
    gateSymbol: `${currency}_USDT-${exerciseDate.replace(/-/g, '')}-${strikePrice}-${optionType}`,
    cacheKey: `greeks:${instrumentName}`,
  };
}

export type FunderOptionSettlementQuote = {
  instrumentName: string | null;
  markPriceUsdt: string | null;
  indexPriceUsdt: string | null;
  delta: number | null; gamma: number | null; theta: number | null; vega: number | null; iv: number | null;
  source: string | null; quotedAt: string; unavailableReason?: string;
};

/** Manual prices apply on today's date too, including an explicit zero-value expiry. */
export async function captureFunderOptionEvidence(
  optionInfo: Record<string, any> | null,
  options: { isHistorical: boolean; manualMarkPrice?: unknown; quotedAt: string },
  loadQuote: (instrument: FunderOptionInstrument) => Promise<any>,
): Promise<FunderOptionSettlementQuote> {
  const instrument = buildFunderOptionInstrument(optionInfo);
  const empty: FunderOptionSettlementQuote = {
    instrumentName: instrument?.instrumentName ?? null,
    markPriceUsdt: null, indexPriceUsdt: null,
    delta: null, gamma: null, theta: null, vega: null, iv: null,
    source: null, quotedAt: options.quotedAt,
  };
  if (!instrument) return { ...empty, unavailableReason: '期权合约身份不完整或无效' };
  const manualWasSupplied = options.manualMarkPrice !== undefined;
  const manualMark = readFunderOptionSettlementMark(options.manualMarkPrice);
  if (manualWasSupplied || options.isHistorical) {
    return {
      ...empty, markPriceUsdt: manualMark === null ? null : String(manualMark),
      source: options.isHistorical ? 'manual_historical' : 'manual_confirmed',
      ...(manualMark === null ? { unavailableReason: '请管理员填写真实期权合约结算价（u/张，有限且非负，归零可填0）' } : {}),
    };
  }
  try {
    const quote = await loadQuote(instrument);
    if (quote?.instrumentName !== instrument.instrumentName || quote?.cacheStale === true) {
      return { ...empty, unavailableReason: '未取得同一合约的当前有效报价，请管理员填写真实期权合约结算价' };
    }
    const mark = readFunderOptionSettlementMark(quote?.markPrice);
    const index = readFunderEvidenceNumber(quote?.indexPrice);
    return {
      ...empty,
      markPriceUsdt: mark === null ? null : String(mark),
      indexPriceUsdt: index !== null && index > 0 ? String(index) : null,
      delta: readFunderEvidenceNumber(quote?.delta), gamma: readFunderEvidenceNumber(quote?.gamma),
      theta: readFunderEvidenceNumber(quote?.theta), vega: readFunderEvidenceNumber(quote?.vega), iv: readFunderEvidenceNumber(quote?.iv),
      source: typeof quote?.source === 'string' ? quote.source : null,
      ...(mark === null ? { unavailableReason: '结清时缺少有效合约报价，请管理员填写真实期权合约结算价（u/张，归零可填0）' } : {}),
    };
  } catch {
    // Do not leak provider/connection errors; the mandatory evidence gate handles this missing quote.
    return { ...empty, unavailableReason: '期权行情请求失败，请管理员填写真实期权合约结算价（u/张，归零可填0）' };
  }
}

export function getFunderOptionSettlementEvidenceError(assetType: unknown, quote: FunderOptionSettlementQuote | undefined): string | null {
  if (assetType !== 'crypto_option') return null;
  if (!quote?.instrumentName?.trim()) return '期权合约身份不完整，请先填写真实标的、到期日、行权价及买卖方向';
  if (readFunderOptionSettlementMark(quote.markPriceUsdt) === null) {
    return '合约报价缺失或无效，请填写真实期权合约结算价（u/张，有限且非负，归零可填0）；不能用标的现货价替代';
  }
  return null;
}

export type FunderSettlementEvidenceScope = {
  ledgerId: number;
  orderId: number;
  userId: number;
  participantId: number | null;
  jointSegmentId: string | null;
  physicalOwnerUserId: number;
  sourceKind: 'primary_order' | 'individual_snapshot' | 'joint_primary' | 'joint_segment';
};

const termFields = [
  'coin', 'asset_type', 'amount', 'amount_currency', 'buy_price', 'buy_quantity',
  'interest_base', 'interest_base_currency', 'interest_rate_annual', 'interest_rate_currency',
  'interest_payment_type', 'interest_start_date', 'contract_interest_end_date', 'finance_type', 'commission_share',
] as const;
const optionTermFields = ['coin', 'exerciseDate', 'strikePrice', 'direction', 'premium', 'premiumCurrency', 'denomination', 'buyQty', 'buyPrice', 'buyTotal'] as const;

/** Raw registered terms, not recomputed principal, interest, profit sharing or final cash settlement. */
export function buildFunderRegisteredSettlementEvidence(sourceOrder: Record<string, any>, scope: FunderSettlementEvidenceScope) {
  const registeredTerms: Record<string, string | number | null> = {};
  for (const field of termFields) {
    const value = sourceOrder[field];
    registeredTerms[field] = typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  let info: any = sourceOrder.option_info;
  try { if (typeof info === 'string') info = JSON.parse(info); } catch { info = null; }
  const optionTerms: Record<string, string | number | null> = {};
  if (info && typeof info === 'object' && !Array.isArray(info)) {
    for (const field of optionTermFields) {
      const value = info[field];
      optionTerms[field] = typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
  }
  return {
    registeredTerms: { ...registeredTerms, ...(Object.keys(optionTerms).length ? { option: optionTerms } : {}) },
    evidenceScope: { ...scope, termsBasis: 'registered_effective_terms_with_parent_defaults' as const, isFinalCashSettlement: false as const },
    // This is a source declaration ONLY. No non-atomic extra query, guessed total or rate-based reconstruction.
    registeredPayments: {
      status: 'not_captured' as const,
      source: 'ledger_order_payments' as const,
      participantUserId: scope.jointSegmentId && scope.jointSegmentId !== '__primary__'
        ? scope.userId : scope.userId === scope.physicalOwnerUserId ? null : scope.userId,
      jointSegmentId: scope.jointSegmentId === '__primary__' ? null : scope.jointSegmentId,
      currencyPolicy: 'separate_registered_currencies_no_conversion' as const,
      reason: '未在同一事务中捕获权威已付记录；不代表已付为0，也不是最终结算收付款',
    },
  };
}
