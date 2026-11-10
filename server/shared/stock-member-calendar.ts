import { getUnifiedStockClosePublishAt, isStockSessionDate, shiftStockSessionDate } from '../../shared/stock-unified-close-policy';
import { isStockMarketSession, previousStockMarketSession, getOvernightUsSessionDate } from '../../shared/stock-market-session';

const EPSILON = 1e-8;
export type MemberCalendarParticipation = {
  id: number; symbol: string; startDate: string; pauseDate?: string | null;
  /** Physical opening exchange date from actual trade time; null is unknown, never registration time. */
  historyStartDate?: string | null;
  /** Manual participation business-effective A date, distinct from the physical NY opening date. */
  participationEffectiveDate?: string | null;
  remainingQuantity: number; entryPrice: number;
};
export type MemberCalendarClosure = {
  participationId: number; quantity: number; salePrice: number; closeDate: string;
};
export type MemberCalendarQuote = {
  symbol: string; price: number; priceDate: string; capturedAt: string; source: string;
};
export type MemberCalendarFx = { snapshotDate: string; usdCnyRate: number | null; source?: string | null; asOf?: string | null; lockedAt?: string | null };
export type MemberCalendarSnapshot = {
  snapshotDate: string; historical: true; ready: boolean; priced: boolean;
  sourceDates: { A: string; US: string };
  status: 'ready' | 'pending_verification';
  marketValue: number | null; costValue: number | null; floatingPnl: number | null;
  realizedPnl: number | null; totalPnl: number | null; positionCount: number;
  dailyPnl: number | null; dailyPnlReady: boolean; dailyPnlReason: string | null;
  previousKnownEmpty: boolean;
  previousDate: string | null; usdCnyRate: number | null; fxAsOf: string | null;
  fxSource?: string | null; fxLockedAt?: string | null;
  nativePnl: { CNY: number | null; USD: number | null };
  stockDailyPnl: number | null; fxDailyPnl: number | null;
  missingSymbols: string[];
  quoteAsOf: Array<{ symbol: string; priceDate: string; capturedAt: string; source: string; carried: boolean }>;
};

export function memberCalendarMarket(symbol: string): 'A' | 'US' {
  return /^\d{6}\.(SH|SZ|BJ)$/.test(symbol) ? 'A' : 'US';
}
export const isMemberCalendarSession = isStockMarketSession;

/** Proof versions label storage, not the business publication policy. Never shift a saved priceDate. */
export function isTrustedMemberCalendarClose(quote: MemberCalendarQuote): boolean {
  if (!Number.isFinite(quote.price) || quote.price <= 0 || !isStockSessionDate(quote.priceDate)) return false;
  const market = memberCalendarMarket(quote.symbol);
  if (!isStockMarketSession(quote.priceDate, market)) return false;
  const capture = Date.parse(quote.capturedAt);
  if (!Number.isFinite(capture)) return false;
  if (quote.source === 'unified_close_yahoo' || quote.source === 'unified_close_tushare') {
    if (market === 'A') return capture >= Date.parse(`${quote.priceDate}T15:00:00+08:00`);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(capture));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}` >= `${quote.priceDate}T16:00`;
  }
  // Only the old A saved exchange-date close is known; legacy US Beijing-date closes are unsafe.
  return market === 'A' && (quote.source === 'close' || quote.source === 'price_snapshot')
    && capture >= Date.parse(`${quote.priceDate}T15:00:00+08:00`);
}

/** Pure reconstruction. A_D uses A_D + the last completed NY session strictly before D. */
export function buildMemberStockCalendar(input: {
  participations: readonly MemberCalendarParticipation[]; closures: readonly MemberCalendarClosure[];
  quotes: readonly MemberCalendarQuote[]; fx: readonly MemberCalendarFx[];
  candidateDates?: readonly string[]; now?: Date;
}): MemberCalendarSnapshot[] {
  const now = input.now ?? new Date();
  const quotesBySymbol = new Map<string, MemberCalendarQuote[]>();
  for (const quote of input.quotes.filter(isTrustedMemberCalendarClose)) {
    const list = quotesBySymbol.get(quote.symbol) ?? [];
    list.push(quote); quotesBySymbol.set(quote.symbol, list);
  }
  for (const list of quotesBySymbol.values()) list.sort((a, b) => a.priceDate.localeCompare(b.priceDate) || a.capturedAt.localeCompare(b.capturedAt));
  const fxByDate = new Map(input.fx.map(row => [row.snapshotDate, row]));
  const candidates = new Set([...(input.candidateDates ?? []), ...input.quotes.map(row => row.priceDate), ...input.fx.map(row => row.snapshotDate),
    ...input.participations.map(item => item.participationEffectiveDate ?? (item.historyStartDate === undefined ? item.startDate : item.historyStartDate))].filter(isStockSessionDate));
  // Include missing A sessions as pending, and map Friday's US proof to the next A day.
  const firstDate = [...candidates].sort()[0];
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (firstDate) for (let date = firstDate; date <= today; date = shiftStockSessionDate(date, 1)) candidates.add(date);
  const closuresById = new Map<number, MemberCalendarClosure[]>();
  for (const closure of input.closures) {
    const list = closuresById.get(closure.participationId) ?? [];
    list.push(closure); closuresById.set(closure.participationId, list);
  }
  const snapshots: MemberCalendarSnapshot[] = [];
  // An actually empty prior scope needs no quote/FX. Unknown dates or existing shares never imply zero.
  const wasKnownEmpty = (priorA: string | null): boolean => {
    if (!priorA || !input.participations.length) return false;
    const priorUs = getOvernightUsSessionDate(priorA);
    if (!priorUs) return false;
    for (const item of input.participations) {
      const opening = item.historyStartDate === undefined ? item.startDate : item.historyStartDate;
      const effective = item.participationEffectiveDate;
      if (!opening || !isStockSessionDate(opening)
        || (effective !== undefined && (!effective || !isStockSessionDate(effective)))) return false;
      const cutoff = memberCalendarMarket(item.symbol) === 'US' ? priorUs : priorA;
      if ((!effective || effective <= priorA) && opening <= cutoff) return false;
    }
    return input.closures.every(closure => {
      const item = input.participations.find(row => row.id === closure.participationId);
      return !!item && isStockSessionDate(closure.closeDate)
        && closure.closeDate > (memberCalendarMarket(item.symbol) === 'US' ? priorUs : priorA);
    });
  };
  for (const date of [...candidates].filter(date => isStockMarketSession(date, 'A')).sort()) {
    if (now.getTime() < getUnifiedStockClosePublishAt(date).getTime()) continue;
    const usCutoff = getOvernightUsSessionDate(date);
    if (!usCutoff) continue;
    let invalidHistory = false;
    const started = input.participations.filter(item => {
      const effectiveDate = item.participationEffectiveDate;
      if (effectiveDate && isStockSessionDate(effectiveDate) && effectiveDate > date) return false;
      const start = item.historyStartDate === undefined ? item.startDate : item.historyStartDate;
      if (!start || !isStockSessionDate(start)) { invalidHistory = true; return false; }
      if (effectiveDate !== undefined && (!effectiveDate || !isStockSessionDate(effectiveDate))) { invalidHistory = true; return false; }
      return start <= (memberCalendarMarket(item.symbol) === 'US' ? usCutoff : date);
    });
    if (!started.length && !invalidHistory) continue;
    const missingSymbols = new Set<string>();
    const quoteAsOf = new Map<string, MemberCalendarSnapshot['quoteAsOf'][number]>();
    let cost = 0, marketValue = 0, realized = 0, fxMissing = false;
    const nativeCost = { CNY: 0, USD: 0 }, nativeMarket = { CNY: 0, USD: 0 }, nativeRealized = { CNY: 0, USD: 0 };
    const positions = new Set<string>();
    const hasUsd = started.some(item => memberCalendarMarket(item.symbol) === 'US');
    const fxRow = hasUsd ? fxByDate.get(date) : undefined;
    const fxDate = hasUsd && fxRow?.usdCnyRate != null && fxRow.usdCnyRate > 0 ? date : null;
    const fxRate = fxDate ? fxRow!.usdCnyRate : null;
    if (hasUsd && (fxRate === null || !Number.isFinite(fxRate) || fxRate <= 0)) fxMissing = true;
    for (const item of started) {
      const market = memberCalendarMarket(item.symbol);
      const cutoff = market === 'US' ? usCutoff : date;
      const asOf = item.pauseDate && item.pauseDate < cutoff ? item.pauseDate : cutoff;
      const closures = closuresById.get(item.id) ?? [];
      if (!Number.isFinite(item.remainingQuantity) || item.remainingQuantity < 0 || !Number.isFinite(item.entryPrice)
        || (item.pauseDate && !isStockSessionDate(item.pauseDate))
        || closures.some(row => !isStockSessionDate(row.closeDate) || !Number.isFinite(row.quantity) || row.quantity < 0 || !Number.isFinite(row.salePrice))) invalidHistory = true;
      // Restore shares sold after this market's price cutoff, not after the A publication date.
      const quantity = item.remainingQuantity + closures.filter(row => row.closeDate > cutoff).reduce((sum, row) => sum + row.quantity, 0);
      const multiplier = market === 'US' ? fxRate ?? 0 : 1;
      // A pause freezes open-share valuation, but is not itself a sale.
      const currency = market === 'US' ? 'USD' : 'CNY';
      nativeRealized[currency] += closures.filter(row => row.closeDate <= cutoff).reduce((sum, row) => sum + row.quantity * (item.entryPrice - row.salePrice), 0);
      if (quantity <= EPSILON) continue;
      positions.add(item.symbol);
      nativeCost[currency] += quantity * item.entryPrice;
      cost += quantity * item.entryPrice * multiplier;
      // Known market holidays alone may carry a previous actual close; open-session gaps never carry.
      const expected = isStockMarketSession(asOf, market) ? asOf : previousStockMarketSession(asOf, market);
      const quote = (quotesBySymbol.get(item.symbol) ?? []).filter(row => row.priceDate === expected).at(-1);
      if (!quote) { missingSymbols.add(item.symbol); continue; }
      nativeMarket[currency] += quantity * quote.price;
      marketValue += quantity * quote.price * multiplier;
      const key = `${item.symbol}:${quote.priceDate}`;
      quoteAsOf.set(key, { symbol: item.symbol, priceDate: quote.priceDate, capturedAt: quote.capturedAt, source: quote.source, carried: quote.priceDate !== date });
    }
    realized = nativeRealized.CNY + (fxRate ?? 0) * nativeRealized.USD;
    const ready = !missingSymbols.size && !fxMissing && !invalidHistory;
    const previousDate = previousStockMarketSession(date, 'A');
    const previous = snapshots.find(row => row.snapshotDate === previousDate);
    const totalPnl = ready ? cost - marketValue + realized : null;
    const nativePnl = {
      CNY: invalidHistory ? null : nativeCost.CNY - nativeMarket.CNY + nativeRealized.CNY,
      USD: hasUsd && !fxMissing && !invalidHistory ? nativeCost.USD - nativeMarket.USD + nativeRealized.USD : (hasUsd ? null : 0),
    };
    const previousKnownEmpty = !previous && wasKnownEmpty(previousDate);
    const dailyPnlReady = ready && (previousKnownEmpty || (!!previous?.ready && previous.totalPnl !== null));
    const previousNative = previous?.nativePnl ?? { CNY: null, USD: null };
    const stockDailyPnl = dailyPnlReady && nativePnl.CNY !== null && nativePnl.USD !== null
      ? nativePnl.CNY - (previousKnownEmpty ? 0 : previousNative.CNY ?? 0)
        + (nativePnl.USD - (previousKnownEmpty ? 0 : previousNative.USD ?? 0)) * fxRate!
      : null;
    const fxDailyPnl = !dailyPnlReady ? null
      : (!hasUsd ? 0
        : (!previousKnownEmpty && previous && nativePnl.USD !== null && previousNative.USD !== null && previous.usdCnyRate !== null
          ? previousNative.USD * (fxRate! - previous.usdCnyRate) : 0));
    snapshots.push({
      sourceDates: { A: date, US: usCutoff },
      snapshotDate: date, historical: true, ready, priced: ready, status: ready ? 'ready' : 'pending_verification',
      marketValue: ready ? marketValue : null, costValue: fxMissing || invalidHistory ? null : cost,
      floatingPnl: ready ? cost - marketValue : null, realizedPnl: fxMissing || invalidHistory ? null : realized,
      totalPnl, positionCount: positions.size, previousDate,
      dailyPnl: dailyPnlReady ? stockDailyPnl! + fxDailyPnl! : null, nativePnl, stockDailyPnl, fxDailyPnl, dailyPnlReady, previousKnownEmpty,
      dailyPnlReason: dailyPnlReady ? null : !ready ? (fxMissing ? 'missing_historical_fx' : invalidHistory ? 'invalid_trade_history' : 'missing_verified_close') : !previous ? 'missing_previous_session' : 'previous_session_unready',
      usdCnyRate: fxRate, fxAsOf: hasUsd && !fxMissing ? fxRow?.asOf ?? null : null,
      fxSource: hasUsd && !fxMissing ? fxRow?.source ?? null : null,
      fxLockedAt: hasUsd && !fxMissing ? fxRow?.lockedAt ?? null : null,
      missingSymbols: [...missingSymbols].sort(), quoteAsOf: [...quoteAsOf.values()],
    });
  }
  return snapshots;
}

/** Overview-only mapping. Portfolio/funds APIs retain their existing live summary untouched. */
export function memberCalendarSettlementSummary(snapshots: readonly MemberCalendarSnapshot[]) {
  const sorted = [...snapshots].sort((a, b) => b.snapshotDate.localeCompare(a.snapshotDate));
  const latestSnapshot = sorted[0] ?? null;
  const priorSnapshot = sorted.find(row => row.snapshotDate === latestSnapshot?.previousDate) ?? null;
  const dailyChange = latestSnapshot?.dailyPnl ?? null;
  return {
    reportingCurrency: 'CNY' as const, usdCnyRate: latestSnapshot?.usdCnyRate ?? null,
    sourceDates: latestSnapshot?.sourceDates ?? null,
    marketValue: latestSnapshot?.marketValue ?? null, costValue: latestSnapshot?.costValue ?? null,
    floatingPnl: latestSnapshot?.floatingPnl ?? null, realizedPnl: latestSnapshot?.realizedPnl ?? null,
    totalPnl: latestSnapshot?.totalPnl ?? null, positionCount: latestSnapshot?.positionCount ?? null,
    unpricedPositionCount: latestSnapshot?.missingSymbols.length ?? null,
    dailyChange, dailyChangePercent: dailyChange !== null && priorSnapshot?.costValue != null && Math.abs(priorSnapshot.costValue) > EPSILON ? dailyChange / priorSnapshot.costValue : null,
    dailyChangeReady: latestSnapshot?.dailyPnlReady ?? false, dailyChangeDate: latestSnapshot?.snapshotDate ?? null,
    previousDate: latestSnapshot?.previousDate ?? null, latestSnapshot, priorSnapshot,
    valuationDate: latestSnapshot?.ready ? latestSnapshot.snapshotDate : null,
    awaitingFirstClose: !sorted.some(row => row.ready),
  };
}
