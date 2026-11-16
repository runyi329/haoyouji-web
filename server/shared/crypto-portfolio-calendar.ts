import {
  CRYPTO_PORTFOLIO_POLICY_VERSION, cryptoPortfolioCutoffAt, getCryptoPortfolioEffectiveDate,
} from '../../shared/crypto-portfolio-policy';
import {
  parsePortfolioInstrument, portfolioCashMultiplier, portfolioQuantityIsEmpty,
  isValidCryptoPortfolioQuantity, type PortfolioCurrency,
} from '../../shared/portfolio-instruments';
import { getOvernightUsSessionDate, isStockMarketSession, isStockSessionDate, previousStockMarketSession, shiftStockSessionDate } from '../../shared/stock-market-session';
import { isTrustedMemberCalendarClose, type MemberCalendarSnapshot } from './stock-member-calendar';
import { cryptoDecimal, type CryptoPortfolioDecimal } from './crypto-portfolio-decimal';

export type CryptoCalendarLot = {
  id: number; symbol: string; initialQuantity: number; unitCost: number; openingFee: number | null;
  /** Stocks: actual exchange day. Crypto: persisted max(actual,registration) effective day. */
  openedDate: string | null; actualTradedAt?: string | null; registeredAt?: string | null;
};
export type CryptoCalendarSale = {
  lotId: number; quantity: number; salePrice: number; transactionFee: number | null;
  eventQuantity: number; closeDate: string | null;
};
export type CryptoCalendarParticipation = {
  id: number; lotId: number; userId: number; allocatedQuantity: number; remainingQuantity: number;
  entryPrice: number; startDate: string | null; pauseDate: string | null;
  assignedAt: string | null; updatedAt: string | null;
};
export type CryptoCalendarClosure = { participationId: number; quantity: number; salePrice: number; closeDate: string | null };
export type CryptoCalendarObservation = {
  lotId: number; userId: number; quantity: number; entryPrice: number;
  startDate: string; pauseDate: string | null; assignedAt: string | null; updatedAt: string | null;
};
export type CryptoCalendarQuote = {
  symbol: string; price: number; currency: PortfolioCurrency; priceDate: string; source: string;
  updatedAt: string; cutoffAt?: string;
};
export type CryptoCalendarFx = {
  snapshotDate: string; usdtCnyRate: number; asOf: string; source: string; pair: 'USDT/CNY'; lockedAt: string;
  carried?: boolean; forexSnapshotDate?: string;
  usdCnyRate?: number; usdCnyAsOf?: string; usdCnySource?: string;
  usdtUsdRate?: number; usdtUsdAsOf?: string; usdtUsdSource?: string; observedAt?: string;
};
export type CryptoCalendarUsdFx = {
  snapshotDate: string; usdCnyRate: number; asOf: string; source: string; pair: 'USD/CNY'; lockedAt: string;
};
export type CryptoPortfolioDailyPayload = {
  ledgerId: 37; categoryId: number; snapshotDate: string; policyVersion: string; activationDate: string;
  total: MemberCalendarSnapshot & { scope: 'tag-total' };
  members: Record<string, MemberCalendarSnapshot>;
  /** Observation PnL is display-only, never a participation closure or distribution. */
  observations: Record<string, MemberCalendarSnapshot>;
  quotes: CryptoCalendarQuote[]; fx: { usdt: CryptoCalendarFx | null; usd: CryptoCalendarUsdFx | null };
  publishedAt: string;
};
/** Server SELECT evidence from an existing current-policy snapshot, never a caller's activation hint. */
export type CryptoCalendarPersistedActivation = {
  ledgerId: 37; categoryId: number; policyVersion: string; activationDate: string; snapshotDate: string;
};
export type CryptoCalendarInput = {
  categoryId: number; snapshotDate: string; activationDate: string; now?: Date;
  persistedActivation?: CryptoCalendarPersistedActivation | null;
  lots: readonly CryptoCalendarLot[]; sales: readonly CryptoCalendarSale[];
  participations: readonly CryptoCalendarParticipation[]; closures: readonly CryptoCalendarClosure[];
  observations?: readonly CryptoCalendarObservation[]; quotes: readonly CryptoCalendarQuote[];
  usdtFx: CryptoCalendarFx | null; usdFx: CryptoCalendarUsdFx | null;
  previous?: CryptoPortfolioDailyPayload | null;
  baseline?: { snapshotDate: string; total?: MemberCalendarSnapshot; members?: Record<string, MemberCalendarSnapshot> } | null;
};

export function cryptoPortfolioStockAnchor(date: string): { A: string; US: string; CRYPTO: string } | null {
  if (!isStockSessionDate(date)) return null;
  const A = isStockMarketSession(date, 'A') ? date : previousStockMarketSession(date, 'A');
  const US = A ? getOvernightUsSessionDate(A) : null;
  return A && US ? { A, US, CRYPTO: date } : null;
}
export function isCryptoCalendarCloseQuote(quote: CryptoCalendarQuote, expectedDate: string): boolean {
  const instrument = parsePortfolioInstrument(quote.symbol);
  const captured = Date.parse(quote.updatedAt);
  if (!instrument || instrument.currency !== quote.currency || quote.priceDate !== expectedDate
    || !Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(captured)) return false;
  if (instrument.market !== 'CRYPTO') return isTrustedMemberCalendarClose({ ...quote, capturedAt: quote.updatedAt });
  const cutoff = cryptoPortfolioCutoffAt(expectedDate).getTime();
  return ['crypto_close_gate_1505', 'crypto_close_htx_1505'].includes(quote.source) && captured >= cutoff
    && (!quote.cutoffAt || Date.parse(quote.cutoffAt) === cutoff);
}
export function isCryptoCalendarFxValid(fx: CryptoCalendarFx | CryptoCalendarUsdFx | null, date: string, pair: 'USDT/CNY' | 'USD/CNY'): boolean {
  if (!fx || fx.pair !== pair || fx.snapshotDate !== date || !fx.source) return false;
  const rate = pair === 'USDT/CNY' ? (fx as CryptoCalendarFx).usdtCnyRate : (fx as CryptoCalendarUsdFx).usdCnyRate;
  const cutoff = cryptoPortfolioCutoffAt(date).getTime(), asOf = Date.parse(fx.asOf);
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(asOf) || asOf > cutoff || Date.parse(fx.lockedAt) !== cutoff) return false;
  if (pair === 'USD/CNY') return cutoff - asOf <= 30 * 60_000 && ['sina_usdcny', 'yahoo_usdcny_5m'].includes(fx.source);
  const bridge = fx as CryptoCalendarFx;
  const anchor = cryptoPortfolioStockAnchor(date)?.A;
  // A weekend's composite asOf is correctly the older Forex leg, not today's USDT leg.
  // Verify both independent prices and timestamps; never relabel Friday Forex as Saturday.
  if (!anchor || bridge.forexSnapshotDate !== anchor || bridge.carried !== (anchor !== date)
    || !Number.isFinite(bridge.usdtUsdRate) || bridge.usdtUsdRate! <= 0
    || !Number.isFinite(bridge.usdCnyRate) || bridge.usdCnyRate! <= 0
    || bridge.usdtUsdSource !== 'coinbase_usdt_usd_spot_close_1505'
    || !['sina_usdcny', 'yahoo_usdcny_5m'].includes(bridge.usdCnySource ?? '')) return false;
  const forexCutoff = cryptoPortfolioCutoffAt(anchor).getTime(), forexAsOf = Date.parse(bridge.usdCnyAsOf ?? '');
  const usdtAsOf = Date.parse(bridge.usdtUsdAsOf ?? ''), observedAt = Date.parse(bridge.observedAt ?? '');
  return Number.isFinite(forexAsOf) && forexAsOf <= forexCutoff && forexCutoff - forexAsOf <= 30 * 60_000
    && Number.isFinite(usdtAsOf) && usdtAsOf <= cutoff && cutoff - usdtAsOf <= 60_000
    && Number.isFinite(observedAt) && observedAt >= cutoff && observedAt >= usdtAsOf
    && asOf === Math.min(usdtAsOf, forexAsOf)
    && Math.abs(rate - bridge.usdtUsdRate! * bridge.usdCnyRate!) <= Math.max(1e-10, rate * 1e-10);
}

const currencies: PortfolioCurrency[] = ['CNY', 'USD', 'USDT'];
const bucket = () => ({ CNY: 0, USD: 0, USDT: 0 });
const finite = (n: number) => Number.isFinite(n);
const tolerance = (n: number) => Math.max(1e-12, Math.abs(n) * Number.EPSILON * 8);
const validQuantity = (symbol: string, n: number, zero = false) => finite(n) && n >= 0
  && (zero && n === 0 || (parsePortfolioInstrument(symbol)?.market === 'CRYPTO' ? isValidCryptoPortfolioQuantity(n) : n > 0));

export function pendingCryptoCalendarSnapshot(date: string, reason = 'unpublished_daily_snapshot'): MemberCalendarSnapshot {
  const sourceDates = cryptoPortfolioStockAnchor(date) ?? { A: '', US: '', CRYPTO: date };
  return { snapshotDate: date, historical: true, ready: false, priced: false, sourceDates,
    policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION, status: 'pending_verification', marketValue: null, costValue: null,
    floatingPnl: null, realizedPnl: null, totalPnl: null, positionCount: 0, dailyPnl: null,
    dailyPnlReady: false, dailyPnlReason: reason, previousKnownEmpty: false, previousDate: shiftStockSessionDate(date, -1),
    usdCnyRate: null, usdtCnyRate: null, fxAsOf: null, nativePnl: { CNY: null, USD: null, USDT: null },
    stockDailyPnl: null, fxDailyPnl: null, missingSymbols: [], quoteAsOf: [] };
}

/** One immutable natural day, reconstructed from original lots and effective sales, not live balances. */
export function buildCryptoPortfolioDailyPayload(input: CryptoCalendarInput): CryptoPortfolioDailyPayload {
  const date = input.snapshotDate, now = input.now ?? new Date(), dates = cryptoPortfolioStockAnchor(date);
  if (!dates || !isStockSessionDate(input.activationDate) || date < input.activationDate
    || now.getTime() < cryptoPortfolioCutoffAt(date).getTime()) throw new Error('crypto_snapshot_not_due');
  if (!Number.isSafeInteger(input.categoryId) || input.categoryId <= 0) throw new Error('invalid_category');
  const persisted = input.persistedActivation;
  if (persisted && (persisted.ledgerId !== 37 || persisted.categoryId !== input.categoryId
    || persisted.policyVersion !== CRYPTO_PORTFOLIO_POLICY_VERSION || !isStockSessionDate(persisted.activationDate)
    || persisted.activationDate !== input.activationDate || !isStockSessionDate(persisted.snapshotDate)
    || persisted.snapshotDate < persisted.activationDate || persisted.snapshotDate > date
    || !Number.isFinite(now.getTime()) || cryptoPortfolioCutoffAt(persisted.snapshotDate).getTime() > now.getTime())) {
    throw new Error('invalid_persisted_crypto_activation');
  }
  if (!persisted && !input.lots.some(lot => parsePortfolioInstrument(lot.symbol)?.market === 'CRYPTO'
    && lot.openedDate !== null && lot.openedDate <= date)) throw new Error('no_effective_crypto_lots');
  const lots = new Map<number, CryptoCalendarLot>();
  const cutoffFor = (symbol: string) => dates[parsePortfolioInstrument(symbol)!.market];
  for (const lot of Array.from(input.lots)) {
    if (lots.has(lot.id) || !Number.isSafeInteger(lot.id) || lot.id <= 0 || !parsePortfolioInstrument(lot.symbol)
      || !lot.openedDate || !isStockSessionDate(lot.openedDate) || !validQuantity(lot.symbol, lot.initialQuantity)
      || !finite(lot.unitCost) || lot.unitCost <= 0 || lot.openingFee !== null && (!finite(lot.openingFee) || lot.openingFee < 0)) {
      throw new Error('invalid_trade_history');
    }
    if (parsePortfolioInstrument(lot.symbol)!.market === 'CRYPTO' && lot.actualTradedAt && lot.registeredAt
      && lot.openedDate !== getCryptoPortfolioEffectiveDate(lot.actualTradedAt, lot.registeredAt)) throw new Error('invalid_crypto_effective_date');
    lots.set(lot.id, lot);
  }
  const salesByLot = new Map<number, CryptoCalendarSale[]>();
  for (const sale of Array.from(input.sales)) {
    const lot = lots.get(sale.lotId);
    if (!lot || !sale.closeDate || !isStockSessionDate(sale.closeDate) || sale.closeDate < lot.openedDate!
      || !validQuantity(lot.symbol, sale.quantity) || !finite(sale.salePrice) || sale.salePrice <= 0
      || !finite(sale.eventQuantity) || sale.eventQuantity <= 0 || sale.quantity > sale.eventQuantity
      || sale.transactionFee !== null && (!finite(sale.transactionFee) || sale.transactionFee < 0)) throw new Error('invalid_sale_history');
    const list = salesByLot.get(lot.id) ?? []; list.push(sale); salesByLot.set(lot.id, list);
  }
  for (const [id, sales] of Array.from(salesByLot)) if (sales.reduce((n, s) => n + s.quantity, 0) > lots.get(id)!.initialQuantity + tolerance(lots.get(id)!.initialQuantity)) throw new Error('oversold_lot');

  type Position = { symbol: string; quantity: number; entryPrice: number; asOf: string };
  type Realized = { symbol: string; amount: CryptoPortfolioDecimal };
  const aggregate = (positions: Position[], realizedRows: Realized[], previous?: MemberCalendarSnapshot): MemberCalendarSnapshot => {
    const decimalBucket = () => ({ CNY: cryptoDecimal(), USD: cryptoDecimal(), USDT: cryptoDecimal() });
    const cost = decimalBucket(), market = decimalBucket(), realized = decimalBucket(), floating = decimalBucket();
    const quoteAsOf: MemberCalendarSnapshot['quoteAsOf'] = [];
    const required = new Set<PortfolioCurrency>(), positionSymbols = new Set<string>();
    for (const row of Array.from(realizedRows)) { const c = parsePortfolioInstrument(row.symbol)!.currency; required.add(c); realized[c] = realized[c].plus(row.amount); }
    const missing = new Set<string>();
    for (const row of Array.from(positions)) {
      const instrument = parsePortfolioInstrument(row.symbol)!; required.add(instrument.currency);
      if (portfolioQuantityIsEmpty(row.symbol, row.quantity)) continue;
      positionSymbols.add(row.symbol); cost[instrument.currency] = cost[instrument.currency].plus(cryptoDecimal(row.quantity).times(row.entryPrice));
      const expected = instrument.market === 'CRYPTO' ? row.asOf
        : isStockMarketSession(row.asOf, instrument.market) ? row.asOf : previousStockMarketSession(row.asOf, instrument.market);
      const quote = expected ? input.quotes.filter(q => q.symbol === row.symbol && Date.parse(q.updatedAt) <= now.getTime()
        && isCryptoCalendarCloseQuote(q, expected)).at(-1) : undefined;
      if (!quote) { missing.add(row.symbol); continue; }
      market[instrument.currency] = market[instrument.currency].plus(cryptoDecimal(row.quantity).times(quote.price));
      floating[instrument.currency] = floating[instrument.currency].plus(cryptoDecimal(row.entryPrice).minus(quote.price).times(row.quantity));
      if (!quoteAsOf.some(q => q.symbol === quote.symbol && q.priceDate === quote.priceDate)) quoteAsOf.push({ symbol: quote.symbol, priceDate: quote.priceDate,
        capturedAt: quote.updatedAt, source: quote.source, carried: quote.priceDate !== date });
    }
    const hasUsd = required.has('USD'), hasUsdt = required.has('USDT');
    const usd = hasUsd && isCryptoCalendarFxValid(input.usdFx, dates.A, 'USD/CNY') ? input.usdFx!.usdCnyRate : null;
    const usdt = hasUsdt && isCryptoCalendarFxValid(input.usdtFx, date, 'USDT/CNY') ? input.usdtFx!.usdtCnyRate : null;
    const ready = !missing.size && (!hasUsd || usd !== null) && (!hasUsdt || usdt !== null);
    const convert = (values: ReturnType<typeof decimalBucket>) => values.CNY.plus(values.USD.times(usd ?? 0)).plus(values.USDT.times(usdt ?? 0));
    const nativeExact = { CNY: floating.CNY.plus(realized.CNY), USD: floating.USD.plus(realized.USD), USDT: floating.USDT.plus(realized.USDT) };
    const nativePnl = { CNY: nativeExact.CNY.toNumber(), USD: nativeExact.USD.toNumber(), USDT: nativeExact.USDT.toNumber() };
    // Direction is selected by caller: member/observation short, physical total long.
    const priorDate = shiftStockSessionDate(date, -1);
    const previousReliable = previous?.ready === true && previous.totalPnl !== null
      && (previous.snapshotDate === priorDate || date === input.activationDate && previous.snapshotDate === input.baseline?.snapshotDate);
    const dailyReady = ready && previousReliable;
    const nativePrior = { CNY: previous?.nativePnl.CNY ?? null, USD: previous?.nativePnl.USD ?? null,
      USDT: previous?.nativePnl.USDT ?? (date === input.activationDate ? 0 : null) };
    const nativeDailyReady = dailyReady && currencies.every(c => nativePrior[c] !== null);
    const stockDailyExact = nativeDailyReady ? currencies.reduce((n, c) => n.plus(nativeExact[c].minus(nativePrior[c]!).times(portfolioCashMultiplier(c, usd, usdt) ?? 0)), cryptoDecimal()) : null;
    const stockDailyPnl = stockDailyExact?.toNumber() ?? null;
    const totalExact = ready ? convert(nativeExact) : null;
    const totalPnl = totalExact?.toNumber() ?? null;
    const dailyExact = dailyReady ? totalExact!.minus(previous!.totalPnl!) : null;
    const dailyPnl = dailyExact?.toNumber() ?? null;
    return { ...pendingCryptoCalendarSnapshot(date), ready, priced: ready, status: ready ? 'ready' : 'pending_verification',
      marketValue: ready ? convert(market).toNumber() : null, costValue: ready ? convert(cost).toNumber() : null,
      floatingPnl: ready ? convert(floating).toNumber() : null, realizedPnl: ready ? convert(realized).toNumber() : null,
      totalPnl, positionCount: positionSymbols.size, dailyPnl, dailyPnlReady: !!dailyReady,
      dailyPnlReason: !ready ? missing.size ? 'missing_verified_close' : 'missing_historical_fx' : dailyReady ? null : 'missing_reliable_previous_baseline',
      previousDate: priorDate, usdCnyRate: usd, usdtCnyRate: usdt, fxAsOf: input.usdtFx?.asOf ?? input.usdFx?.asOf ?? null,
      fxSource: input.usdtFx?.source ?? input.usdFx?.source ?? null, fxLockedAt: input.usdtFx?.lockedAt ?? input.usdFx?.lockedAt ?? null,
      nativePnl: ready ? nativePnl : { CNY: null, USD: null, USDT: null }, stockDailyPnl,
      fxDailyPnl: stockDailyExact !== null ? dailyExact!.minus(stockDailyExact).toNumber() : null, missingSymbols: [...Array.from(missing)].sort(), quoteAsOf };
  };
  const totalPositions: Position[] = [], totalRealized: Realized[] = [];
  for (const lot of Array.from(lots.values())) {
    const asOf = cutoffFor(lot.symbol); if (lot.openedDate! > asOf) continue;
    const sold = (salesByLot.get(lot.id) ?? []).filter(sale => sale.closeDate! <= asOf);
    let quantity = lot.initialQuantity - sold.reduce((n, sale) => n + sale.quantity, 0);
    if (parsePortfolioInstrument(lot.symbol)!.market === 'CRYPTO') quantity = Math.round(quantity * 1e8) / 1e8;
    if (quantity < 0 && quantity > -tolerance(lot.initialQuantity)) quantity = 0;
    totalPositions.push({ symbol: lot.symbol, quantity, entryPrice: lot.unitCost, asOf });
    for (const sale of Array.from(sold)) {
      // Same legacy/new fee distinction as stock-total-calendar: NULL fee means legacy no bilateral fee.
      const sellFee = sale.transactionFee === null ? cryptoDecimal() : cryptoDecimal(sale.transactionFee).times(sale.quantity).dividedBy(sale.eventQuantity);
      const buyFee = sale.transactionFee === null ? cryptoDecimal() : (lot.openingFee === null ? cryptoDecimal(lot.unitCost).times(0.001) : cryptoDecimal(lot.openingFee).dividedBy(lot.initialQuantity)).times(sale.quantity);
      totalRealized.push({ symbol: lot.symbol, amount: cryptoDecimal(lot.unitCost).minus(sale.salePrice).times(sale.quantity).plus(sellFee).plus(buyFee) });
    }
  }
  const previousTotal = input.previous?.total ?? input.baseline?.total;
  // Engine computes short PnL. Reverse both today's amount and the long prior before differencing.
  const reverse = (n: number | null) => n === null ? null : n === 0 ? 0 : -n;
  const shortPrior = previousTotal ? { ...previousTotal, totalPnl: reverse(previousTotal.totalPnl), nativePnl: {
    CNY: reverse(previousTotal.nativePnl.CNY), USD: reverse(previousTotal.nativePnl.USD), USDT: reverse(previousTotal.nativePnl.USDT ?? 0) } } : undefined;
  const rawTotal = aggregate(totalPositions, totalRealized, shortPrior);
  const total = { ...rawTotal, scope: 'tag-total' as const, floatingPnl: reverse(rawTotal.floatingPnl), realizedPnl: reverse(rawTotal.realizedPnl),
    totalPnl: reverse(rawTotal.totalPnl), dailyPnl: reverse(rawTotal.dailyPnl), stockDailyPnl: reverse(rawTotal.stockDailyPnl), fxDailyPnl: reverse(rawTotal.fxDailyPnl),
    nativePnl: { CNY: reverse(rawTotal.nativePnl.CNY), USD: reverse(rawTotal.nativePnl.USD), USDT: reverse(rawTotal.nativePnl.USDT ?? null) } };
  const members: Record<string, MemberCalendarSnapshot> = {}, observations: Record<string, MemberCalendarSnapshot> = {};
  const userIds = new Set(input.participations.map(p => p.userId));
  for (const userId of Array.from(userIds)) {
    const positions: Position[] = [], realized: Realized[] = [];
    for (const p of Array.from(input.participations.filter(p => p.userId === userId))) {
      const lot = lots.get(p.lotId); if (!lot) throw new Error('unknown_participation_lot');
      const cutoff = cutoffFor(lot.symbol), businessDate = parsePortfolioInstrument(lot.symbol)!.market === 'CRYPTO' ? date : dates.A;
      const start = p.startDate ?? lot.openedDate;
      if (!start || !isStockSessionDate(start) || !validQuantity(lot.symbol, p.allocatedQuantity, true)
        || !validQuantity(lot.symbol, p.remainingQuantity, true) || !finite(p.entryPrice) || p.entryPrice <= 0
        || p.pauseDate && (!isStockSessionDate(p.pauseDate) || p.pauseDate < start)) throw new Error('invalid_participation_history');
      if (lot.openedDate! > cutoff) continue;
      const assignedAt = Date.parse(p.assignedAt ?? ''), updatedAt = Date.parse(p.updatedAt ?? '');
      const publicationCutoff = cryptoPortfolioCutoffAt(date).getTime();
      if (!finite(assignedAt) || !finite(updatedAt)) throw new Error('unverifiable_allocation_history');
      // A row genuinely first created after this cutoff and starting in the
      // future never belonged to this historical day. An OLD row whose start
      // was subsequently moved forward must still fail the timestamp guard.
      if (start > businessDate && assignedAt >= publicationCutoff && updatedAt >= assignedAt) continue;
      // Mutable source rows edited after the historical publication cutoff cannot reconstruct that day.
      if (assignedAt >= publicationCutoff || updatedAt >= publicationCutoff) throw new Error('unverifiable_allocation_history');
      if (start > businessDate) continue;
      const asOf = p.pauseDate && p.pauseDate < cutoff ? p.pauseDate : cutoff;
      const closures = input.closures.filter(c => c.participationId === p.id);
      if (closures.some(c => !c.closeDate || !isStockSessionDate(c.closeDate) || !validQuantity(lot.symbol, c.quantity)
        || !finite(c.salePrice) || c.salePrice <= 0)) throw new Error('invalid_closure_history');
      const allClosed = closures.reduce((n, c) => n + c.quantity, 0);
      if (Math.abs(p.remainingQuantity + allClosed - p.allocatedQuantity) > tolerance(p.allocatedQuantity)) throw new Error('unverifiable_allocation_history');
      const closed = closures.filter(c => c.closeDate! <= asOf);
      const rawQuantity = p.allocatedQuantity - closed.reduce((n, c) => n + c.quantity, 0);
      const quantity = parsePortfolioInstrument(lot.symbol)!.market === 'CRYPTO' ? Math.round(rawQuantity * 1e8) / 1e8 : rawQuantity;
      if (quantity < -tolerance(p.allocatedQuantity)) throw new Error('oversold_participation');
      positions.push({ symbol: lot.symbol, quantity: Math.max(0, quantity), entryPrice: p.entryPrice, asOf });
      for (const c of Array.from(closed)) realized.push({ symbol: lot.symbol, amount: cryptoDecimal(p.entryPrice).minus(c.salePrice).times(c.quantity) });
    }
    members[String(userId)] = aggregate(positions, realized, input.previous?.members[String(userId)] ?? input.baseline?.members?.[String(userId)]);
  }
  for (const userId of Array.from(new Set((input.observations ?? []).map(o => o.userId)))) {
    const positions: Position[] = [], realized: Realized[] = [];
    for (const o of Array.from((input.observations ?? []).filter(o => o.userId === userId))) {
      const lot = lots.get(o.lotId); if (!lot) throw new Error('unknown_observation_lot');
      const cutoff = cutoffFor(lot.symbol), businessDate = parsePortfolioInstrument(lot.symbol)!.market === 'CRYPTO' ? date : dates.A;
      if (!isStockSessionDate(o.startDate) || !validQuantity(lot.symbol, o.quantity, true) || !finite(o.entryPrice) || o.entryPrice <= 0
        || o.pauseDate && (!isStockSessionDate(o.pauseDate) || o.pauseDate < o.startDate)) throw new Error('invalid_observation_history');
      if (lot.openedDate! > cutoff) continue;
      const assignedAt = Date.parse(o.assignedAt ?? ''), updatedAt = Date.parse(o.updatedAt ?? '');
      const publicationCutoff = cryptoPortfolioCutoffAt(date).getTime();
      if (!finite(assignedAt) || !finite(updatedAt)) throw new Error('unverifiable_observation_history');
      if (o.startDate > businessDate && assignedAt >= publicationCutoff && updatedAt >= assignedAt) continue;
      if (assignedAt >= publicationCutoff || updatedAt >= publicationCutoff) throw new Error('unverifiable_observation_history');
      if (o.startDate > businessDate || o.quantity === 0) continue;
      const asOf = o.pauseDate && o.pauseDate < cutoff ? o.pauseDate : cutoff;
      const sales = (salesByLot.get(lot.id) ?? []).filter(s => s.closeDate! <= asOf);
      const sold = sales.reduce((n, s) => n.plus(s.quantity), cryptoDecimal());
      const rawQuantity = cryptoDecimal(lot.initialQuantity).minus(sold).times(o.quantity).dividedBy(lot.initialQuantity).toNumber();
      positions.push({ symbol: lot.symbol, quantity: rawQuantity, entryPrice: o.entryPrice, asOf });
      for (const s of Array.from(sales)) realized.push({ symbol: lot.symbol, amount: cryptoDecimal(o.entryPrice).minus(s.salePrice).times(o.quantity).times(s.quantity).dividedBy(lot.initialQuantity) });
    }
    observations[String(userId)] = aggregate(positions, realized, input.previous?.observations[String(userId)]);
  }
  return { ledgerId: 37, categoryId: input.categoryId, snapshotDate: date, policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION,
    activationDate: input.activationDate, total, members, observations, quotes: [...Array.from(input.quotes)], fx: { usdt: input.usdtFx, usd: input.usdFx }, publishedAt: now.toISOString() };
}
