import { CRYPTO_PORTFOLIO_POLICY_VERSION, cryptoPortfolioCutoffAt } from '../../shared/crypto-portfolio-policy';
import { parsePortfolioInstrument } from '../../shared/portfolio-instruments';
import { isStockSessionDate } from '../../shared/stock-market-session';
import {
  buildCryptoPortfolioDailyPayload, cryptoPortfolioStockAnchor,
  type CryptoCalendarHistory, type CryptoCalendarParticipation, type CryptoCalendarQuote,
  type CryptoPortfolioDailyPayload,
} from './crypto-portfolio-calendar';
import { cryptoDecimal } from './crypto-portfolio-decimal';
import type { MemberCalendarSnapshot } from './stock-member-calendar';

/** SELECT-only, immutable registration evidence. Execution/business dates are NOT registration proof. */
export type CryptoPublicationHistoryProofs = {
  sales: readonly {
    eventId: number; lotId: number; registeredAt: string | null; allocatedAt: string | null;
  }[];
  closures: readonly {
    eventId: number; participationId: number; registeredAt: string | null; recordedAt: string | null;
  }[];
};

export type CryptoPublicationHistory = {
  /** A candidate reconstruction, NOT blanket trusted history. Always check the relevant verified flag. */
  history: CryptoCalendarHistory;
  verifiedTotal: boolean;
  verifiedMemberIds: number[];
  verifiedObservationIds: number[];
};
export type CryptoPublicationHistoryByDate = Readonly<Record<string, CryptoPublicationHistory>>;
export type CryptoPublicationHistoryInput = {
  originalPayloads: readonly CryptoPortfolioDailyPayload[];
  history: CryptoCalendarHistory;
  proofs: CryptoPublicationHistoryProofs;
  /** Already archived quotes only; never used in place of an original payload's close quotes. */
  historicalQuotes?: readonly CryptoCalendarQuote[];
  now?: Date;
};

const time = (value: string | null | undefined) => Date.parse(value ?? '');
const validId = (id: number | undefined): id is number => Number.isSafeInteger(id) && id! > 0;
const clone = <T>(value: T): T => structuredClone(value);
const sameAmount = (a: number | null | undefined, b: number | null | undefined) =>
  typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a - b) <= Math.max(1e-8, Math.abs(b) * 1e-10);

/** Deliberately no missing-native-to-zero fallback, no daily-delta inference and no readiness override. */
function sameEconomics(a: MemberCalendarSnapshot | undefined, b: MemberCalendarSnapshot): boolean {
  return !!a?.ready && b.ready && a.positionCount === b.positionCount
    && sameAmount(a.costValue, b.costValue) && sameAmount(a.marketValue, b.marketValue)
    && sameAmount(a.floatingPnl, b.floatingPnl) && sameAmount(a.realizedPnl, b.realizedPnl)
    && sameAmount(a.totalPnl, b.totalPnl)
    && (['CNY', 'USD', 'USDT'] as const).every(c => sameAmount(a.nativePnl[c], b.nativePnl[c]));
}

/** Conflicting duplicate proof is unknown evidence, rather than last-write-wins. */
function indexProofs<T>(rows: readonly T[], key: (row: T) => string,
  timestamps: (row: T) => readonly (string | null)[]): Map<string, T | null> {
  const result = new Map<string, T | null>();
  for (const row of rows) {
    const id = key(row), previous = result.get(id);
    if (!result.has(id)) result.set(id, row);
    else if (previous === null || timestamps(previous!).some((stamp, i) =>
      time(stamp) !== time(timestamps(row)[i]))) result.set(id, null);
  }
  return result;
}

/**
 * Recover legacy publication-time history in memory, with scope-specific trust.
 *
 * Never feed this result into the old `historyByDate` blanket-trust branch. Consumers must use
 * `publicationHistoryByDate` and require verifiedTotal / membership in verified*Ids separately.
 * A failed scope remains unverified even if another scope on the same date reconciles exactly.
 * Originals (including stored quotes, FX, dates and historyEvidence) are never changed/backfilled.
 *
 * Registration is inclusive at publishedAt. Allocation UPDATE guards remain the production builder's
 * stricter day-cutoff guards. Only an immutable closure timestamp EXACTLY matching updatedAt proves
 * a closure-caused update; quantity conservation and original economics are also mandatory.
 */
export function buildLegacyCryptoPublicationHistory(input: CryptoPublicationHistoryInput): CryptoPublicationHistoryByDate {
  const originals = [...input.originalPayloads].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  const categoryId = originals[0]?.categoryId;
  if (originals.some((p, i) => p.ledgerId !== 37 || p.categoryId !== categoryId
    || p.policyVersion !== CRYPTO_PORTFOLIO_POLICY_VERSION || !isStockSessionDate(p.snapshotDate)
    || i > 0 && p.snapshotDate === originals[i - 1].snapshotDate)) throw new Error('invalid_saved_crypto_payload');
  const now = input.now?.getTime() ?? Date.now();
  if (!Number.isFinite(now)) throw new Error('invalid_publication_history_now');
  const salesProofs = indexProofs(input.proofs.sales, p => `${p.eventId}:${p.lotId}`,
    p => [p.registeredAt, p.allocatedAt]);
  const closureProofs = indexProofs(input.proofs.closures, p => `${p.eventId}:${p.participationId}`,
    p => [p.registeredAt, p.recordedAt]);
  const rawQuotes = [...originals.flatMap(p => p.quotes), ...(input.historicalQuotes ?? input.history.historicalQuotes ?? [])];
  const result: Record<string, CryptoPublicationHistory> = {};

  for (const original of originals) {
    // Already frozen evidence belongs to the existing production path; never rewrite it.
    if (original.historyEvidence || time(original.publishedAt) > now
      || cryptoPortfolioCutoffAt(original.snapshotDate).getTime() > now) continue;
    const published = time(original.publishedAt), date = original.snapshotDate;
    const cutoff = cryptoPortfolioCutoffAt(date).getTime(), anchors = cryptoPortfolioStockAnchor(date);
    if (!Number.isFinite(published) || published < cutoff || !anchors) continue;
    const source = clone(input.history);
    const allLots = new Map(source.lots.map(l => [l.id, l]));
    const activeLot = (lotId: number) => {
      const lot = allLots.get(lotId), market = lot && parsePortfolioInstrument(lot.symbol)?.market;
      return !lot || !market || !lot.openedDate || lot.openedDate <= anchors[market];
    };
    const unknownLots = new Set<number>();
    const lots = source.lots.filter(lot => {
      const registered = time(lot.registeredAt);
      if (!Number.isFinite(registered)) { if (activeLot(lot.id)) unknownLots.add(lot.id); return true; }
      return registered <= published;
    });
    const keptLots = new Set(lots.map(l => l.id));
    const unknownSaleLots = new Set<number>();
    const sales = source.sales.filter(sale => {
      if (!keptLots.has(sale.lotId)) return false;
      const proof = validId(sale.eventId) ? salesProofs.get(`${sale.eventId}:${sale.lotId}`) : null;
      const registered = time(proof?.registeredAt), allocated = time(proof?.allocatedAt);
      // A valid late timestamp alone proves absence, even if the other timestamp is unavailable.
      if (registered > published || allocated > published) return false;
      if (!proof || !Number.isFinite(registered) || !Number.isFinite(allocated)) {
        if (activeLot(sale.lotId)) unknownSaleLots.add(sale.lotId);
      }
      return true;
    });
    const ps = source.participations.filter(p => keptLots.has(p.lotId));
    const keptParticipationIds = new Set(ps.map(p => p.id));
    const unknownClosureIds = new Set<number>();
    const removedClosureIds = new Set<typeof source.closures[number]>();
    const closures = source.closures.filter(closure => {
      if (!keptParticipationIds.has(closure.participationId)) return false;
      const proof = validId(closure.eventId)
        ? closureProofs.get(`${closure.eventId}:${closure.participationId}`) : null;
      const registered = time(proof?.registeredAt), recorded = time(proof?.recordedAt);
      if (!proof || !Number.isFinite(registered) || !Number.isFinite(recorded)) unknownClosureIds.add(closure.participationId);
      if (registered > published || recorded > published) { removedClosureIds.add(closure); return false; }
      return true;
    });
    const allClosuresByP = new Map<number, typeof source.closures[number][]>();
    for (const c of source.closures) {
      const list = allClosuresByP.get(c.participationId) ?? [];
      list.push(c); allClosuresByP.set(c.participationId, list);
    }
    const badMemberIds = new Set<number>();
    const participations = ps.map((p): CryptoCalendarParticipation => {
      if (!activeLot(p.lotId)) return p; // Physically future lots cannot contaminate an existing member.
      const allClosed = allClosuresByP.get(p.id) ?? [];
      const removed = allClosed.filter(c => removedClosureIds.has(c));
      let conservative = false;
      if (Number.isFinite(p.allocatedQuantity) && Number.isFinite(p.remainingQuantity)
        && p.allocatedQuantity >= 0 && p.remainingQuantity >= 0
        && allClosed.every(c => Number.isFinite(c.quantity) && c.quantity > 0)) {
        const fullQuantity = allClosed.reduce((n, c) => n.plus(c.quantity), cryptoDecimal());
        conservative = Math.abs(cryptoDecimal(p.remainingQuantity).plus(fullQuantity).minus(p.allocatedQuantity).toNumber())
          <= Math.max(1e-12, Math.abs(p.allocatedQuantity) * Number.EPSILON * 8);
      }
      const closureUpdate = allClosed.some(c => {
        const proof = validId(c.eventId) ? closureProofs.get(`${c.eventId}:${p.id}`) : null;
        return !!proof && Number.isFinite(time(proof.registeredAt)) && Number.isFinite(time(proof.recordedAt))
          && time(proof.recordedAt) === time(p.updatedAt);
      });
      const assigned = time(p.assignedAt), updated = time(p.updatedAt);
      let next = p;
      if (removed.length && conservative && !unknownClosureIds.has(p.id)) {
        const restored = removed.reduce((n, c) => n.plus(c.quantity), cryptoDecimal(p.remainingQuantity)).toNumber();
        next = { ...next, remainingQuantity: restored };
      }
      // No arbitrary updatedAt rewind. Assignment is a known pre-update timestamp, not an invented date.
      if (updated >= cutoff && conservative && closureUpdate && !unknownClosureIds.has(p.id)
        && Number.isFinite(assigned) && assigned < cutoff && updated >= assigned) {
        next = { ...next, updatedAt: p.assignedAt };
      }
      const start = next.startDate ?? allLots.get(next.lotId)?.openedDate;
      const market = parsePortfolioInstrument(allLots.get(next.lotId)?.symbol ?? '')?.market;
      const businessDate = market === 'CRYPTO' ? date : anchors.A;
      const trulyFuture = !!start && start > businessDate && assigned >= cutoff && time(next.updatedAt) >= assigned;
      if (unknownLots.has(p.lotId) || unknownClosureIds.has(p.id) || !conservative
        || !trulyFuture && (!Number.isFinite(assigned) || !Number.isFinite(time(next.updatedAt))
          || assigned >= cutoff || time(next.updatedAt) >= cutoff)) badMemberIds.add(p.userId);
      return next;
    });
    const observations = source.observations.filter(o => keptLots.has(o.lotId));
    const badObservationIds = new Set<number>();
    for (const o of observations) {
      if (!activeLot(o.lotId)) continue;
      const assigned = time(o.assignedAt), updated = time(o.updatedAt);
      const market = parsePortfolioInstrument(allLots.get(o.lotId)?.symbol ?? '')?.market;
      const businessDate = market === 'CRYPTO' ? date : anchors.A;
      const trulyFuture = o.startDate > businessDate && assigned >= cutoff && updated >= assigned;
      if (unknownLots.has(o.lotId) || unknownSaleLots.has(o.lotId)
        || !trulyFuture && (!Number.isFinite(assigned) || !Number.isFinite(updated)
          || assigned >= cutoff || updated >= cutoff)) badObservationIds.add(o.userId);
    }
    const history: CryptoCalendarHistory = { ...source, lots, sales, participations, closures, observations };
    const recovered: CryptoPublicationHistory = {
      history, verifiedTotal: false, verifiedMemberIds: [], verifiedObservationIds: [],
    };
    result[date] = recovered;
    // Exactly the old publication policy: exclude ALL new retroactive revisions, even if created earlier.
    const beforePublicationRules = (source.downsideRules ?? []).filter(r => !r.startDate
      && (!r.createdAt || Number.isFinite(time(r.createdAt)) && time(r.createdAt) <= published));
    const build = (members: readonly CryptoCalendarParticipation[], observers: typeof observations) =>
      buildCryptoPortfolioDailyPayload({ categoryId: original.categoryId, snapshotDate: date,
        activationDate: original.activationDate, persistedActivation: { ledgerId: 37,
          categoryId: original.categoryId, policyVersion: original.policyVersion,
          activationDate: original.activationDate, snapshotDate: date }, now: new Date(published),
        lots, sales, participations: members, closures, observations: observers,
        quotes: original.quotes, usdtFx: original.fx.usdt, usdFx: original.fx.usd,
        historicalQuotes: rawQuotes.filter(q => Number.isFinite(time(q.updatedAt)) && time(q.updatedAt) <= published),
        downsideRules: beforePublicationRules, downsideMemberEpochs: source.downsideMemberEpochs,
        previous: null, baseline: null });
    // Fast path: one builder checks all healthy scopes. Unknown members are isolated as whole users.
    let all: CryptoPortfolioDailyPayload | undefined;
    try { all = build(participations.filter(p => !badMemberIds.has(p.userId)),
      observations.filter(o => !badObservationIds.has(o.userId))); } catch { /* isolate scopes below */ }
    if (!unknownLots.size && !unknownSaleLots.size) {
      try { recovered.verifiedTotal = sameEconomics((all ?? build([], [])).total, original.total); }
      catch { /* unknown/malformed trade history remains unverified */ }
    }
    for (const user of Object.keys(original.members)) {
      const userId = Number(user), memberPs = participations.filter(p => p.userId === userId);
      if (!validId(userId) || badMemberIds.has(userId) || !memberPs.length) continue;
      try {
        if (sameEconomics((all ?? build(memberPs, [])).members[user], original.members[user]))
          recovered.verifiedMemberIds.push(userId);
      } catch { /* this member alone remains unverified */ }
    }
    for (const user of Object.keys(original.observations)) {
      const userId = Number(user), memberOs = observations.filter(o => o.userId === userId);
      if (!validId(userId) || badObservationIds.has(userId) || !memberOs.length) continue;
      try {
        if (sameEconomics((all ?? build([], memberOs)).observations[user], original.observations[user]))
          recovered.verifiedObservationIds.push(userId);
      } catch { /* display-only observation cannot confer participation trust */ }
    }
  }
  return result;
}
