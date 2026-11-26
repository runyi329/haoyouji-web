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
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE, USDT_USD_PARITY_RATE } from '../../shared/usdt-usd-parity-policy';
import { valueStockLotDownside, stockLotDownsidePriceAsOf, stockLotDownsideMemberEntryAt,
  stockLotDownsideMemberOffset, selectStockLotDownsideRule, type StockLotDownsideRule, type StockLotDownsideAudit,
  countedStockLotPrice, stockLotDownsideHistoricalEntryProof, resolveStockLotDownsideHistoricalRules,
  type StockLotDownsideHistoricalQuote, type StockLotDownsideMemberEpoch } from '../../shared/stock-lot-downside';

import { isUserTagDownsideExempt, type UserTagDownsideOverride } from '../../shared/user-tag-downside-override';
import { stockUserDownsideRules, isStockUserDownsideExemptSelection, stockUserTagOverridesFingerprint } from './stock-user-tag-downside';

export type CryptoCalendarLot = {
  id: number; symbol: string; initialQuantity: number; unitCost: number; openingFee: number | null;
  /** Stocks: actual exchange day. Crypto: persisted max(actual,registration) effective day. */
  openedDate: string | null; actualTradedAt?: string | null; registeredAt?: string | null;
};
export type CryptoCalendarSale = {
  lotId: number; quantity: number; salePrice: number; transactionFee: number | null;
  eventQuantity: number; closeDate: string | null;
  eventId?: number;
  /** Independent frozen global valuation. salePrice remains the real execution price. */
  countedSalePrice?: number;
  soldAt?: string;
};
export type CryptoCalendarParticipation = {
  id: number; lotId: number; userId: number; allocatedQuantity: number; remainingQuantity: number;
  entryPrice: number; startDate: string | null; pauseDate: string | null;
  assignedAt: string | null; updatedAt: string | null;
  entryAt?: string;
};
export type CryptoCalendarClosure = {
  participationId: number; quantity: number; salePrice: number; closeDate: string | null;
  eventId?: number;
  /** Frozen GLOBAL counted price, before subtracting this member's entry carry. */
  countedSalePrice?: number;
  soldAt?: string;
};
export type CryptoCalendarObservation = {
  lotId: number; userId: number; quantity: number; entryPrice: number;
  startDate: string; pauseDate: string | null; assignedAt: string | null; updatedAt: string | null;
  entryAt?: string;
};
export type CryptoCalendarQuote = {
  symbol: string; price: number; currency: PortfolioCurrency; priceDate: string; source: string;
  updatedAt: string; cutoffAt?: string;
};
export type CryptoCalendarFx = {
  snapshotDate: string; usdtCnyRate: number; asOf: string; source: string; pair: 'USDT/CNY'; lockedAt: string;
  carried?: boolean; forexSnapshotDate?: string;
  /** Absent only for immutable legacy market-bridge evidence; policy legs are not market quotes. */
  conversionPolicy?: string;
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
  /** Immutable publication-time economic evidence; never backfilled into existing stored payloads. */
  historyEvidence?: CryptoCalendarHistoryEvidence;
  /** Derived read metadata only. The stored policy/version and evidence stay untouched. */
  revaluation?: { version: 1; fingerprint: string; startDate: string };
};
export type CryptoCalendarHistoryEvidence = {
  version: 1; lots: readonly CryptoCalendarLot[]; sales: readonly CryptoCalendarSale[];
  participations: readonly CryptoCalendarParticipation[]; closures: readonly CryptoCalendarClosure[];
  observations: readonly CryptoCalendarObservation[];
};
export type CryptoCalendarHistory = Omit<CryptoCalendarHistoryEvidence, 'version'> & {
  userTagDownsideOverrides?: readonly UserTagDownsideOverride[];
  downsideRules?: readonly StockLotDownsideRule[];
  downsideMemberEpochs?: readonly StockLotDownsideMemberEpoch[];
  /** Existing stored raw closes only; not live or newly fetched historical prices. */
  historicalQuotes?: readonly CryptoCalendarQuote[];
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
  /** Pure caller-supplied, scoped append-only history. Never loads a DB here. */
  userTagDownsideOverrides?: readonly UserTagDownsideOverride[];
  downsideRules?: readonly StockLotDownsideRule[];
  downsideMemberEpochs?: readonly StockLotDownsideMemberEpoch[];
  historicalQuotes?: readonly CryptoCalendarQuote[];
  /** New publication only; the revaluation pipeline never replaces this evidence. */
  captureHistoryEvidence?: boolean;
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
export function isCryptoCalendarFxValid(fx: CryptoCalendarFx | CryptoCalendarUsdFx | null, date: string, pair: 'USDT/CNY' | 'USD/CNY', now = Date.now()): boolean {
  if (!fx || fx.pair !== pair || fx.snapshotDate !== date || !fx.source) return false;
  const rate = pair === 'USDT/CNY' ? (fx as CryptoCalendarFx).usdtCnyRate : (fx as CryptoCalendarUsdFx).usdCnyRate;
  const cutoff = cryptoPortfolioCutoffAt(date).getTime(), asOf = Date.parse(fx.asOf);
  if (!Number.isFinite(now) || cutoff > now || !Number.isFinite(rate) || rate <= 0
    || !Number.isFinite(asOf) || asOf > cutoff || Date.parse(fx.lockedAt) !== cutoff) return false;
  if (pair === 'USD/CNY') return cutoff - asOf <= 30 * 60_000 && ['sina_usdcny', 'yahoo_usdcny_5m'].includes(fx.source);
  const bridge = fx as CryptoCalendarFx;
  const anchor = cryptoPortfolioStockAnchor(date)?.A;
  // The weekend composite asOf remains the real older USD evidence, never today's policy time.
  if (!anchor || bridge.forexSnapshotDate !== anchor || bridge.carried !== (anchor !== date)
    || !Number.isFinite(bridge.usdtUsdRate) || bridge.usdtUsdRate! <= 0
    || !Number.isFinite(bridge.usdCnyRate) || bridge.usdCnyRate! <= 0 || bridge.usdCnyRate! >= 100
    || !['sina_usdcny', 'yahoo_usdcny_5m'].includes(bridge.usdCnySource ?? '')) return false;
  const forexCutoff = cryptoPortfolioCutoffAt(anchor).getTime(), forexAsOf = Date.parse(bridge.usdCnyAsOf ?? '');
  const usdtAsOf = Date.parse(bridge.usdtUsdAsOf ?? ''), observedAt = Date.parse(bridge.observedAt ?? '');
  const policyEvidence = bridge.conversionPolicy === USDT_USD_PARITY_POLICY
    && bridge.usdtUsdSource === USDT_USD_PARITY_SOURCE && bridge.usdtUsdRate === USDT_USD_PARITY_RATE
    && bridge.source === `${USDT_USD_PARITY_SOURCE}_x_${bridge.usdCnySource}${bridge.carried ? `_carried_A_anchor_${anchor}` : ''}`
    && usdtAsOf === cutoff; // Accounting applicability time, not a market quote timestamp.
  const legacyEvidence = bridge.conversionPolicy === undefined
    && bridge.usdtUsdSource === 'coinbase_usdt_usd_spot_close_1505'
    && Number.isFinite(usdtAsOf) && usdtAsOf <= cutoff && cutoff - usdtAsOf <= 60_000;
  if (!policyEvidence && !legacyEvidence) return false;
  return Number.isFinite(forexAsOf) && forexAsOf <= forexCutoff && forexCutoff - forexAsOf <= 30 * 60_000
    && Number.isFinite(observedAt) && observedAt >= cutoff && observedAt <= now
    && observedAt >= usdtAsOf && observedAt >= forexAsOf
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

  const downsideRules = (input.downsideRules ?? []).filter(rule => rule.ledgerId === 37 && rule.categoryId === input.categoryId
    && rule.currency === parsePortfolioInstrument(lots.get(rule.lotId)?.symbol)?.currency);
  const downsideMemberEpochs = (input.downsideMemberEpochs ?? []).filter(epoch => epoch.ledgerId === 37 && epoch.categoryId === input.categoryId
    && input.participations.some(p => p.id === epoch.participationId && p.lotId === epoch.lotId && p.userId === epoch.userId));
  const overrides = input.userTagDownsideOverrides ?? [];
  stockUserTagOverridesFingerprint(overrides, input.categoryId); // validate even an empty member scope
  const userRuleCache = new Map<number, StockLotDownsideRule[]>();
  const rulesFor = (row: { userId?: number }) => {
    if (row.userId === undefined) return downsideRules; // physical total and observations stay global
    if (!userRuleCache.has(row.userId)) userRuleCache.set(row.userId, stockUserDownsideRules(downsideRules, overrides, row.userId, input.categoryId));
    return userRuleCache.get(row.userId)!;
  };
  type Position = { userId?: number; lotId: number; symbol: string; quantity: number; entryPrice: number; asOf: string;
    entryAt?: string; participationId?: number; assignedAt?: string; startDate?: string };
  type Realized = { symbol: string; amount: CryptoPortfolioDecimal | null; missingSaleEvidence?: boolean };
  const historicalProofs: StockLotDownsideHistoricalQuote[] = [...(input.historicalQuotes ?? input.quotes)].map(q => ({
    symbol: q.symbol, price: q.price, priceDate: q.priceDate, quoteAsOf: q.updatedAt,
    verified: Date.parse(q.updatedAt) <= now.getTime() && isCryptoCalendarCloseQuote(q, q.priceDate) }));
  const entryProofCache = new Map<string, StockLotDownsideHistoricalQuote | null>();
  const priceAtCache = new Map<string, string>();
  const priceAtFor = (symbol: string, d: string) => {
    const key = `${symbol}:${d}`; let at = priceAtCache.get(key);
    if (!at) { at = stockLotDownsidePriceAsOf(symbol, d); priceAtCache.set(key, at); }
    return at;
  };
  const closeQuoteCache = new Map<string, CryptoCalendarQuote | undefined>();
  const memberOffset = (row: Pick<Position, 'lotId' | 'symbol' | 'entryPrice' | 'entryAt' | 'participationId' | 'assignedAt' | 'startDate' | 'userId'>, asOf: string, participationAsOf: string = asOf) => {
    const memberRules = rulesFor(row);
    if (isStockUserDownsideExemptSelection(memberRules)) return 0;
    if (!row.assignedAt) return undefined;
    const entryAt = row.entryAt ?? stockLotDownsideMemberEntryAt(row.assignedAt, row.startDate ?? '');
    const entryRule = selectStockLotDownsideRule(memberRules, row.lotId, entryAt);
    const currentRule = selectStockLotDownsideRule(memberRules, row.lotId, asOf);
    // Recorded participation/observation price is an input to the owner rule, not an external quote.
    if (entryRule?.baselineSource === 'owner_threshold') {
      if (row.participationId === undefined) {
        if (!Number.isFinite(Date.parse(participationAsOf)) || Date.parse(entryAt) > Date.parse(participationAsOf)) return null;
        const basisRule = Date.parse(entryAt) > Date.parse(asOf) ? currentRule : entryRule;
        if (basisRule?.baselineSource !== 'owner_threshold') return 0;
        const counted = countedStockLotPrice(row.entryPrice, basisRule);
        return counted === null ? null : counted - row.entryPrice;
      }
      return stockLotDownsideMemberOffset({ lotId: row.lotId, participationId: row.participationId,
        assignedAt: row.assignedAt, startDate: row.startDate, rules: memberRules,
        epochs: downsideMemberEpochs, asOf, participationAsOf, entryRawPrice: row.entryPrice });
    }
    if (row.participationId !== undefined && !currentRule?.startDate) {
      const legacyEpoch = downsideMemberEpochs.filter(e => e.lotId === row.lotId && e.participationId === row.participationId
        && Date.parse(e.effectiveAt) <= Date.parse(asOf)).sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt))[0];
      if (legacyEpoch && legacyEpoch.ruleVersion === undefined) return legacyEpoch.entryCountedOffset;
    }
    const proofKey = `${row.symbol}:${entryAt}`;
    if (entryRule?.startDate && !entryProofCache.has(proofKey))
      entryProofCache.set(proofKey, stockLotDownsideHistoricalEntryProof(row.symbol, entryAt, historicalProofs, now));
    const proof = entryRule?.startDate ? entryProofCache.get(proofKey) : null;
    // Observation entry proof remains display-only; it can never create a participation epoch.
    if (row.participationId === undefined) {
      if (!entryRule?.startDate) return undefined;
      const counted = proof ? countedStockLotPrice(proof.price, entryRule) : null;
      return counted === null ? null : counted - proof!.price;
    }
    return stockLotDownsideMemberOffset({ lotId: row.lotId, participationId: row.participationId,
      assignedAt: row.assignedAt, startDate: row.startDate, rules: memberRules, epochs: downsideMemberEpochs, asOf,
      entryRawPrice: proof?.price, entryQuoteAsOf: proof ? stockLotDownsidePriceAsOf(proof.symbol, proof.priceDate) : undefined });
  };
  // Retro revisions reprice raw executions at actual soldAt; old frozen rows remain audit evidence only.
  const frozenSalePrice = (sale: { salePrice: number; countedSalePrice?: number; soldAt?: string; closeDate: string | null }, row: Pick<Position, 'lotId' | 'symbol' | 'entryPrice' | 'entryAt' | 'participationId' | 'assignedAt' | 'startDate' | 'userId'>) => {
    const memberRules = rulesFor(row);
    if (isStockUserDownsideExemptSelection(memberRules)) return finite(sale.salePrice) ? sale.salePrice : null;
    const saleAt = sale.soldAt ?? stockLotDownsidePriceAsOf(row.symbol, sale.closeDate!);
    const applicable = selectStockLotDownsideRule(memberRules, row.lotId, saleAt);
    if (applicable?.startDate) {
      if (!sale.soldAt || !Number.isFinite(Date.parse(sale.soldAt))) return null;
      const price = countedStockLotPrice(sale.salePrice, applicable), offset = memberOffset(row, saleAt);
      return price === null || offset === null ? null : price - (offset ?? 0);
    }
    if (sale.countedSalePrice === undefined) return sale.soldAt && selectStockLotDownsideRule(memberRules, row.lotId, sale.soldAt)
      ? null : sale.salePrice;
    if (!finite(sale.countedSalePrice)) throw new Error('invalid_downside_sale_evidence');
    const offset = memberOffset(row, sale.soldAt ?? stockLotDownsidePriceAsOf(row.symbol, sale.closeDate!));
    if (offset === null) return null;
    if (offset !== undefined) return sale.countedSalePrice - offset;
    // Reuse the pure member baseline helper: at entry, C(E)-adjusted C(E) is exactly entryCarry.
    const entryValue = row.entryAt ? valueStockLotDownside({ ...row, quantity: 1, rawPrice: row.entryPrice,
      rules: memberRules, asOf: row.entryAt }) : null;
    const globalEntryValue = row.entryAt ? valueStockLotDownside({ lotId: row.lotId, entryPrice: row.entryPrice,
      quantity: 1, rawPrice: row.entryPrice, rules: memberRules, asOf: row.entryAt }) : null;
    const entryCarry = entryValue && globalEntryValue ? globalEntryValue.countedMarketPrice! - entryValue.countedMarketPrice! : 0;
    return sale.countedSalePrice - entryCarry;
  };
  const aggregate = (positions: Position[], realizedRows: Realized[], previous?: MemberCalendarSnapshot): MemberCalendarSnapshot => {
    const decimalBucket = () => ({ CNY: cryptoDecimal(), USD: cryptoDecimal(), USDT: cryptoDecimal() });
    const cost = decimalBucket(), market = decimalBucket(), realized = decimalBucket(), floating = decimalBucket();
    const quoteAsOf: MemberCalendarSnapshot['quoteAsOf'] = [];
    const downsideRuleAudit: StockLotDownsideAudit[] = [];
    const required = new Set<PortfolioCurrency>(), positionSymbols = new Set<string>();
    let missingMemberBaseline = false, missingSaleEvidence = false, missingRuleBaseline = false;
    for (const row of Array.from(realizedRows)) {
      const c = parsePortfolioInstrument(row.symbol)!.currency; required.add(c);
      if (row.amount === null) {
        if (row.missingSaleEvidence) missingSaleEvidence = true;
        else missingMemberBaseline = true;
      }
      else realized[c] = realized[c].plus(row.amount);
    }
    const missing = new Set<string>();
    for (const row of Array.from(positions)) {
      const instrument = parsePortfolioInstrument(row.symbol)!; required.add(instrument.currency);
      if (portfolioQuantityIsEmpty(row.symbol, row.quantity)) continue;
      positionSymbols.add(row.symbol); cost[instrument.currency] = cost[instrument.currency].plus(cryptoDecimal(row.quantity).times(row.entryPrice));
      const expected = instrument.market === 'CRYPTO' ? row.asOf
        : isStockMarketSession(row.asOf, instrument.market) ? row.asOf : previousStockMarketSession(row.asOf, instrument.market);
      const quoteKey = `${row.symbol}:${expected}`;
      if (expected && !closeQuoteCache.has(quoteKey)) closeQuoteCache.set(quoteKey, input.quotes.filter(q => q.symbol === row.symbol
        && Date.parse(q.updatedAt) <= now.getTime() && isCryptoCalendarCloseQuote(q, expected)).at(-1));
      const quote = expected ? closeQuoteCache.get(quoteKey) : undefined;
      if (!quote) { missing.add(row.symbol); continue; }
      if (!quoteAsOf.some(q => q.symbol === quote.symbol && q.priceDate === quote.priceDate)) quoteAsOf.push({ symbol: quote.symbol, priceDate: quote.priceDate,
        capturedAt: quote.updatedAt, source: quote.source, carried: quote.priceDate !== date });
      const priceAt = priceAtFor(row.symbol, quote.priceDate);
      const entryCountedOffset = memberOffset(row, priceAt, cryptoPortfolioCutoffAt(date).toISOString());
      if (entryCountedOffset === null) missingMemberBaseline = true;
      const value = valueStockLotDownside({ lotId: row.lotId, quantity: row.quantity, entryPrice: row.entryPrice,
        rawPrice: quote.price, rules: rulesFor(row), asOf: priceAt,
        direction: 'counterparty', entryAt: row.entryAt, entryCountedOffset });
      if (value.countedMarketPrice === null || !finite(value.countedMarketPrice)) {
        if (value.downsideRule?.baselineStatus === 'pending') missingRuleBaseline = true;
        else if (entryCountedOffset !== null) missing.add(row.symbol);
        continue;
      }
      market[instrument.currency] = market[instrument.currency].plus(cryptoDecimal(row.quantity).times(value.countedMarketPrice));
      floating[instrument.currency] = floating[instrument.currency].plus(cryptoDecimal(row.entryPrice).minus(value.countedMarketPrice).times(row.quantity));
      if (value.downsideRule) downsideRuleAudit.push({ lotId: row.lotId, version: value.downsideRule.version,
        rawPrice: quote.price, countedPrice: value.countedMarketPrice, effectiveAt: value.downsideRule.effectiveAt });
    }
    const hasUsd = required.has('USD'), hasUsdt = required.has('USDT');
    const usd = hasUsd && isCryptoCalendarFxValid(input.usdFx, dates.A, 'USD/CNY', now.getTime()) ? input.usdFx!.usdCnyRate : null;
    const usdt = hasUsdt && isCryptoCalendarFxValid(input.usdtFx, date, 'USDT/CNY', now.getTime()) ? input.usdtFx!.usdtCnyRate : null;
    const ready = !missing.size && !missingMemberBaseline && !missingSaleEvidence && !missingRuleBaseline && (!hasUsd || usd !== null) && (!hasUsdt || usdt !== null);
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
      dailyPnlReason: !ready ? missing.size ? 'missing_verified_close' : missingRuleBaseline ? 'missing_downside_historical_baseline'
        : missingSaleEvidence ? 'missing_downside_sale_evidence'
        : missingMemberBaseline ? 'missing_downside_member_baseline'
        : 'missing_historical_fx' : dailyReady ? null : 'missing_reliable_previous_baseline',
      previousDate: priorDate, usdCnyRate: usd, usdtCnyRate: usdt, fxAsOf: input.usdtFx?.asOf ?? input.usdFx?.asOf ?? null,
      fxSource: input.usdtFx?.source ?? input.usdFx?.source ?? null, fxLockedAt: input.usdtFx?.lockedAt ?? input.usdFx?.lockedAt ?? null,
      nativePnl: ready ? nativePnl : { CNY: null, USD: null, USDT: null }, stockDailyPnl,
      fxDailyPnl: stockDailyExact !== null ? dailyExact!.minus(stockDailyExact).toNumber() : null, missingSymbols: [...Array.from(missing)].sort(), quoteAsOf,
      ...(downsideRuleAudit.length ? { downsideRuleAudit } : {}) };
  };
  const totalPositions: Position[] = [], totalRealized: Realized[] = [];
  for (const lot of Array.from(lots.values())) {
    const asOf = cutoffFor(lot.symbol); if (lot.openedDate! > asOf) continue;
    const sold = (salesByLot.get(lot.id) ?? []).filter(sale => sale.closeDate! <= asOf);
    let quantity = lot.initialQuantity - sold.reduce((n, sale) => n + sale.quantity, 0);
    if (parsePortfolioInstrument(lot.symbol)!.market === 'CRYPTO') quantity = Math.round(quantity * 1e8) / 1e8;
    if (quantity < 0 && quantity > -tolerance(lot.initialQuantity)) quantity = 0;
    totalPositions.push({ lotId: lot.id, symbol: lot.symbol, quantity, entryPrice: lot.unitCost, asOf });
    for (const sale of Array.from(sold)) {
      // Same legacy/new fee distinction as stock-total-calendar: NULL fee means legacy no bilateral fee.
      const sellFee = sale.transactionFee === null ? cryptoDecimal() : cryptoDecimal(sale.transactionFee).times(sale.quantity).dividedBy(sale.eventQuantity);
      const buyFee = sale.transactionFee === null ? cryptoDecimal() : (lot.openingFee === null ? cryptoDecimal(lot.unitCost).times(0.001) : cryptoDecimal(lot.openingFee).dividedBy(lot.initialQuantity)).times(sale.quantity);
      const price = frozenSalePrice(sale, { lotId: lot.id, symbol: lot.symbol, entryPrice: lot.unitCost });
      totalRealized.push({ symbol: lot.symbol, missingSaleEvidence: price === null && sale.countedSalePrice === undefined,
        amount: price === null ? null : cryptoDecimal(lot.unitCost).minus(price).times(sale.quantity).plus(sellFee).plus(buyFee) });
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
      const entryAt = p.entryAt ?? stockLotDownsideMemberEntryAt(p.assignedAt!, start);
      const position = { userId, lotId: lot.id, symbol: lot.symbol, quantity: Math.max(0, quantity), entryPrice: p.entryPrice, asOf, entryAt,
        participationId: p.id, assignedAt: p.assignedAt!, startDate: start };
      positions.push(position);
      for (const c of Array.from(closed)) {
        const price = frozenSalePrice(c, position);
        realized.push({ symbol: lot.symbol, missingSaleEvidence: price === null && c.countedSalePrice === undefined,
          amount: price === null ? null : cryptoDecimal(p.entryPrice).minus(price).times(c.quantity) });
      }
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
      const entryAt = o.entryAt ?? stockLotDownsideMemberEntryAt(o.assignedAt!, o.startDate);
      const position = { lotId: lot.id, symbol: lot.symbol, quantity: rawQuantity, entryPrice: o.entryPrice, asOf, entryAt,
        assignedAt: o.assignedAt!, startDate: o.startDate };
      positions.push(position);
      for (const s of Array.from(sales)) {
        const price = frozenSalePrice(s, position);
        realized.push({ symbol: lot.symbol, missingSaleEvidence: price === null && s.countedSalePrice === undefined,
          amount: price === null ? null : cryptoDecimal(o.entryPrice).minus(price).times(o.quantity).times(s.quantity).dividedBy(lot.initialQuantity) });
      }
    }
    observations[String(userId)] = aggregate(positions, realized, input.previous?.observations[String(userId)]);
  }
  return { ledgerId: 37, categoryId: input.categoryId, snapshotDate: date, policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION,
    activationDate: input.activationDate, total, members, observations, quotes: [...Array.from(input.quotes)], fx: { usdt: input.usdtFx, usd: input.usdFx }, publishedAt: now.toISOString(),
    ...(input.captureHistoryEvidence ? { historyEvidence: JSON.parse(JSON.stringify({ version: 1, lots: input.lots,
      sales: input.sales, participations: input.participations, closures: input.closures, observations: input.observations ?? [] })) } : {}) };
}

export type CryptoPortfolioRevaluationIssue = {
  snapshotDate: string; scope: 'tag-total' | 'member' | 'observation' | 'baseline'; userId?: number; reason: string;
};
/** Recovered publication history: each scope is independently verified against its saved economics. */
export type CryptoCalendarPublicationHistory = {
  history: CryptoCalendarHistory; verifiedTotal: boolean;
  verifiedMemberIds: readonly number[]; verifiedObservationIds: readonly number[];
};
export type CryptoPortfolioRevaluationInput = {
  categoryId: number; originalPayloads: readonly CryptoPortfolioDailyPayload[]; history: CryptoCalendarHistory;
  /** Trusted publication-time history supplied by an offline evidence extractor, never today's edited shares. */
  historyByDate?: Readonly<Record<string, CryptoCalendarHistory>>;
  /** Strict recovered proof, not blanket trust for every member in the candidate history. */
  publicationHistoryByDate?: Readonly<Record<string, CryptoCalendarPublicationHistory>>;
  /** Must already reflect the selected revision when its start is before crypto activation. */
  baseline?: CryptoCalendarInput['baseline']; now?: Date;
};
/** Collision-free canonical revision identity, including carry and entry evidence, not just the policy v1 label. */
export function cryptoPortfolioDownsideFingerprint(categoryId: number, history: Pick<CryptoCalendarHistory, 'downsideRules' | 'downsideMemberEpochs' | 'userTagDownsideOverrides'>): string {
  return JSON.stringify({ categoryId,
    userTagOverrides: stockUserTagOverridesFingerprint(history.userTagDownsideOverrides ?? [], categoryId),
    rules: [...(history.downsideRules ?? [])].filter(r => r.ledgerId === 37 && r.categoryId === categoryId)
      .sort((a, b) => a.lotId - b.lotId || a.version - b.version).map(r => [r.lotId, r.version, r.startDate ?? null,
        r.effectiveAt, r.enabled, r.thresholdPrice, r.downsidePercent, r.baselineRawPrice, r.baselineCountedPrice,
        r.baselineStatus ?? null, r.holdingStartAt ?? null, r.quoteAsOf ?? null, r.createdAt ?? null, r.baselineSource ?? null]),
    epochs: [...(history.downsideMemberEpochs ?? [])].filter(e => e.ledgerId === 37 && e.categoryId === categoryId)
      .sort((a, b) => a.participationId - b.participationId || a.effectiveAt.localeCompare(b.effectiveAt))
      .map(e => [e.lotId, e.participationId, e.userId, e.effectiveAt, e.rawPrice, e.ruleVersion ?? null, e.entryCountedOffset]),
  });
}

/**
 * Rebuild derived counted returns only, in natural-day order. Original quotes, fixed FX,
 * raw executions, publication timestamps, policy v1 and raw history evidence are never replaced.
 * Unknown mutable member history is pending in that member scope, never today's invented shares.
 */
type CryptoPortfolioRevaluationResult = {
  payloads: CryptoPortfolioDailyPayload[]; fingerprint: string; startDate: string | null; issues: CryptoPortfolioRevaluationIssue[];
};
/** Offline compatibility API; server reads use the cooperative async variant below. */
export function revalueCryptoPortfolioDailyPayloads(input: CryptoPortfolioRevaluationInput): CryptoPortfolioRevaluationResult {
  const steps = revalueCryptoPortfolioDailyPayloadSteps(input);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
/** Same economics/evidence checks, but do not block unrelated HTTP requests for every historical day. */
export async function revalueCryptoPortfolioDailyPayloadsAsync(input: CryptoPortfolioRevaluationInput,
  yieldToEventLoop: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0))): Promise<CryptoPortfolioRevaluationResult> {
  const steps = revalueCryptoPortfolioDailyPayloadSteps(input);
  let step = steps.next();
  while (!step.done) { await yieldToEventLoop(); step = steps.next(); }
  return step.value;
}
function* revalueCryptoPortfolioDailyPayloadSteps(input: CryptoPortfolioRevaluationInput): Generator<void, CryptoPortfolioRevaluationResult> {
  const originals = [...input.originalPayloads].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  if (originals.some((p, i) => p.ledgerId !== 37 || p.categoryId !== input.categoryId
    || p.policyVersion !== CRYPTO_PORTFOLIO_POLICY_VERSION || !isStockSessionDate(p.snapshotDate)
    || i > 0 && p.snapshotDate === originals[i - 1].snapshotDate)) throw new Error('invalid_saved_crypto_payload');
  const rules = (input.history.downsideRules ?? []).filter(r => r.ledgerId === 37 && r.categoryId === input.categoryId);
  const retroDates = rules.map(r => r.startDate).filter((d): d is string => !!d && isStockSessionDate(d));
  const overrides = input.history.userTagDownsideOverrides ?? [];
  const exemptUserIds = new Set(overrides.filter(r => r.categoryId === input.categoryId)
    .map(r => r.targetUserId).filter(id => isUserTagDownsideExempt(overrides, id, input.categoryId)));
  const retroStartDate = retroDates.sort()[0] ?? null;
  const startDate = exemptUserIds.size && originals.length ? [originals[0].snapshotDate, retroStartDate].filter((d): d is string => !!d).sort()[0] : retroStartDate;
  const fingerprint = cryptoPortfolioDownsideFingerprint(input.categoryId, input.history);
  const issues: CryptoPortfolioRevaluationIssue[] = [];
  if (!startDate) return { payloads: originals, fingerprint, startDate, issues };
  const now = input.now ?? new Date();
  if (!originals.some(p => p.snapshotDate >= startDate && cryptoPortfolioCutoffAt(p.snapshotDate).getTime() <= now.getTime()))
    return { payloads: originals, fingerprint, startDate, issues };
  const rawQuotes = [...originals.flatMap(p => p.quotes), ...(input.history.historicalQuotes ?? [])];
  const proofs: StockLotDownsideHistoricalQuote[] = rawQuotes.map(q => ({ symbol: q.symbol, price: q.price,
    priceDate: q.priceDate, quoteAsOf: q.updatedAt,
    verified: Date.parse(q.updatedAt) <= now.getTime() && isCryptoCalendarCloseQuote(q, q.priceDate) }));
  const earliestEvidence = new Map<number, CryptoCalendarLot>();
  for (const p of originals) for (const lot of p.historyEvidence?.lots ?? []) if (!earliestEvidence.has(lot.id)) earliestEvidence.set(lot.id, lot);
  for (const lot of input.history.lots) if (!earliestEvidence.has(lot.id)) earliestEvidence.set(lot.id, lot);
  const resolvedRules = resolveStockLotDownsideHistoricalRules({ rules,
    lots: Array.from(earliestEvidence.values()).map(l => ({ lotId: l.id, symbol: l.symbol,
      openedAt: l.actualTradedAt ?? '', unitCost: l.unitCost })), quotes: proofs, now });
  const payloads: CryptoPortfolioDailyPayload[] = [];
  const sameAmount = (a: number | null | undefined, b: number | null | undefined) => a === b
    || typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-10);
  const sameEconomics = (a: MemberCalendarSnapshot, b: MemberCalendarSnapshot) => a.ready && b.ready
    && a.positionCount === b.positionCount && ['costValue', 'marketValue', 'floatingPnl', 'realizedPnl', 'totalPnl'].every(k =>
      sameAmount(a[k as keyof MemberCalendarSnapshot] as number | null, b[k as keyof MemberCalendarSnapshot] as number | null))
    && currencies.every(c => sameAmount(a.nativePnl[c] ?? 0, b.nativePnl[c] ?? 0));
  for (const original of originals) {
    if (original.snapshotDate < startDate || cryptoPortfolioCutoffAt(original.snapshotDate).getTime() > now.getTime()) {
      payloads.push(original); continue;
    }
    const date = original.snapshotDate;
    const publicationProof = input.publicationHistoryByDate?.[date];
    const evidence = input.historyByDate?.[date] ?? original.historyEvidence ?? publicationProof?.history ?? input.history;
    const trustedPublicationHistory = !!input.historyByDate?.[date] || original.historyEvidence?.version === 1;
    const trustedTotalHistory = trustedPublicationHistory || publicationProof?.verifiedTotal === true;
    const trustedMemberHistory = (userId: number) => trustedPublicationHistory || publicationProof?.verifiedMemberIds.includes(userId) === true;
    const trustedObservationHistory = (userId: number) => trustedPublicationHistory || publicationProof?.verifiedObservationIds.includes(userId) === true;
    const common = { categoryId: input.categoryId, snapshotDate: date, activationDate: original.activationDate,
      persistedActivation: { ledgerId: 37 as const, categoryId: input.categoryId,
        policyVersion: original.policyVersion, activationDate: original.activationDate, snapshotDate: date },
      now: new Date(original.publishedAt), lots: evidence.lots, sales: evidence.sales, quotes: original.quotes,
      historicalQuotes: rawQuotes, closures: evidence.closures, usdtFx: original.fx.usdt, usdFx: original.fx.usd,
      userTagDownsideOverrides: overrides,
      downsideRules: resolvedRules, downsideMemberEpochs: input.history.downsideMemberEpochs,
      previous: payloads.at(-1) ?? null,
      baseline: date === original.activationDate ? input.baseline : null,
    } satisfies Partial<CryptoCalendarInput>;
    const derived: CryptoPortfolioDailyPayload = { ...original, quotes: [...original.quotes], fx: { ...original.fx },
      members: {}, observations: {}, revaluation: { version: 1, fingerprint, startDate } };
    const beforePublicationRules = rules.filter(r => !r.startDate && (!r.createdAt || Date.parse(r.createdAt) <= Date.parse(original.publishedAt)));
    const build = (ps: readonly CryptoCalendarParticipation[], os: readonly CryptoCalendarObservation[], verify = false) =>
      buildCryptoPortfolioDailyPayload({ ...common, participations: ps, observations: os,
        ...(verify ? { downsideRules: beforePublicationRules, userTagDownsideOverrides: [], previous: null, baseline: null } : {}) });
    const cutoff = cryptoPortfolioCutoffAt(date).getTime();
    const dates = cryptoPortfolioStockAnchor(date)!;
    const lotsById = new Map(evidence.lots.map(lot => [lot.id, lot]));
    const outsideHistoricalDay = (lotId: number, startDate: string | null, assigned: number, updated: number) => {
      const lot = lotsById.get(lotId), instrument = parsePortfolioInstrument(lot?.symbol);
      // Match the builder's physical effective-day skip before its mutable-row guard.
      // Unknown instruments/dates cannot establish historical non-membership.
      if (!lot || !instrument || !lot.openedDate || !isStockSessionDate(lot.openedDate)) return false;
      if (lot.openedDate > dates[instrument.market]) return true;
      const start = startDate ?? lot.openedDate;
      const businessDate = instrument.market === 'CRYPTO' ? date : dates.A;
      // Only genuinely newly assigned future rows are excluded. Moving an old
      // member's start forward must still fail the publication timestamp guard.
      return isStockSessionDate(start) && start > businessDate && assigned >= cutoff && updated >= assigned;
    };
    const badMemberIds = new Set(evidence.participations.filter(p => {
      const assigned = Date.parse(p.assignedAt ?? ''), updated = Date.parse(p.updatedAt ?? '');
      const trulyFuture = outsideHistoricalDay(p.lotId, p.startDate, assigned, updated);
      return !trulyFuture && (!finite(assigned) || !finite(updated) || assigned >= cutoff || updated >= cutoff);
    }).map(p => p.userId));
    const badObserverIds = new Set((evidence.observations ?? []).filter(o => {
      const assigned = Date.parse(o.assignedAt ?? ''), updated = Date.parse(o.updatedAt ?? '');
      const trulyFuture = outsideHistoricalDay(o.lotId, o.startDate, assigned, updated);
      return !trulyFuture && (!finite(assigned) || !finite(updated) || assigned >= cutoff || updated >= cutoff);
    }).map(o => o.userId));
    const validPs = evidence.participations.filter(p => !badMemberIds.has(p.userId));
    const validOs = (evidence.observations ?? []).filter(o => !badObserverIds.has(o.userId));
    // Healthy histories need two full-scope builders per date, not two per member.
    // One unverifiable mutable row falls back to isolated scopes so it cannot poison other clients.
    let allDerived: CryptoPortfolioDailyPayload | undefined, allVerified: CryptoPortfolioDailyPayload | undefined;
    try { allDerived = build(validPs, validOs); } catch { /* isolate below */ }
    if (!trustedPublicationHistory) {
      try { allVerified = build(validPs, validOs, true); } catch { /* isolate below */ }
    }
    const pending = (scope: CryptoPortfolioRevaluationIssue['scope'], reason: string, userId?: number) => {
      issues.push({ snapshotDate: date, scope, reason, ...(userId === undefined ? {} : { userId }) });
      return pendingCryptoCalendarSnapshot(date, reason);
    };
    const preserveActivationDelta = (next: MemberCalendarSnapshot, old: MemberCalendarSnapshot, memberExempt = false) => {
      if (date !== original.activationDate || input.baseline) return next;
      if (startDate < original.activationDate || memberExempt) {
        issues.push({ snapshotDate: date, scope: 'baseline', reason: 'missing_revalued_stock_activation_baseline' });
        return { ...next, dailyPnl: null, stockDailyPnl: null, fxDailyPnl: null, dailyPnlReady: false,
          dailyPnlReason: next.ready ? 'missing_revalued_stock_activation_baseline' : next.dailyPnlReason };
      }
      // Unaffected stock anchor can be recovered from old cumulative minus old daily, without adding it twice.
      if (next.ready && old.ready && old.dailyPnlReady && old.dailyPnl !== null && old.totalPnl !== null && next.totalPnl !== null) {
        const delta = cryptoDecimal(next.totalPnl).minus(old.totalPnl);
        const dailyPnl = cryptoDecimal(old.dailyPnl).plus(delta).toNumber();
        const stockDailyPnl = old.stockDailyPnl === null ? null : cryptoDecimal(old.stockDailyPnl).plus(delta).toNumber();
        return { ...next, dailyPnl, stockDailyPnl, fxDailyPnl: old.fxDailyPnl, dailyPnlReady: true, dailyPnlReason: null };
      }
      return next;
    };
    const globalRevaluationApplies = retroStartDate !== null && date >= retroStartDate;
    try {
      if (!globalRevaluationApplies) derived.total = original.total;
      else {
        const total = (allDerived ?? build([], [])).total;
        if (!trustedTotalHistory && !sameEconomics((allVerified ?? build([], [], true)).total, original.total))
          derived.total = { ...pending('tag-total', 'unverifiable_trade_history'), scope: 'tag-total' };
        else derived.total = { ...preserveActivationDelta(total, original.total), scope: 'tag-total' };
      }
    } catch (e: any) { derived.total = { ...pending('tag-total', e?.message ?? 'unverifiable_trade_history'), scope: 'tag-total' }; }
    for (const user of Object.keys(original.members)) {
      if (!globalRevaluationApplies && !exemptUserIds.has(Number(user))) { derived.members[user] = original.members[user]; continue; }
      const ps = evidence.participations.filter(p => String(p.userId) === user);
      try {
        if (!ps.length || ps.some(p => !input.history.participations.some(current => current.id === p.id && current.userId === p.userId && current.lotId === p.lotId)) || badMemberIds.has(Number(user))) throw new Error('unverifiable_allocation_history');
        const next = (allDerived ?? build(ps, [])).members[user];
        if (!next || !trustedMemberHistory(Number(user)) && !sameEconomics((allVerified ?? build(ps, [], true)).members[user], original.members[user]))
          throw new Error('unverifiable_allocation_history');
        derived.members[user] = preserveActivationDelta(next, original.members[user], exemptUserIds.has(Number(user)));
      } catch (e: any) { derived.members[user] = pending('member', e?.message ?? 'unverifiable_allocation_history', Number(user)); }
    }
    for (const user of Object.keys(original.observations)) {
      if (!globalRevaluationApplies) { derived.observations[user] = original.observations[user]; continue; }
      const os = (evidence.observations ?? []).filter(o => String(o.userId) === user);
      try {
        if (!os.length || badObserverIds.has(Number(user))) throw new Error('unverifiable_observation_history');
        const next = (allDerived ?? build([], os)).observations[user];
        if (!next || !trustedObservationHistory(Number(user)) && !sameEconomics((allVerified ?? build([], os, true)).observations[user], original.observations[user]))
          throw new Error('unverifiable_observation_history');
        derived.observations[user] = next;
      } catch (e: any) { derived.observations[user] = pending('observation', e?.message ?? 'unverifiable_observation_history', Number(user)); }
    }
    for (const [scope, rows] of [['tag-total', [derived.total]], ['member', Object.values(derived.members)], ['observation', Object.values(derived.observations)]] as const)
      for (const row of rows) if (!row.ready && !issues.some(i => i.snapshotDate === date && i.scope === scope && i.reason === row.dailyPnlReason))
        issues.push({ snapshotDate: date, scope, reason: row.dailyPnlReason ?? 'pending_verification' });
    payloads.push(derived);
    yield;
  }
  return { payloads, fingerprint, startDate, issues };
}
