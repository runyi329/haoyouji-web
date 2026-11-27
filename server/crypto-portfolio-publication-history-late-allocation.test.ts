import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCryptoPortfolioDailyPayload, revalueCryptoPortfolioDailyPayloads,
  type CryptoCalendarHistory, type CryptoCalendarInput,
} from './shared/crypto-portfolio-calendar';
import { buildLegacyCryptoPublicationHistory } from './shared/crypto-portfolio-publication-history';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';

// Synthetic only: the private real-row replay is not checked into the repository.
const categoryId = 72, activationDate = '2026-11-23';
const stock = '600001.SH', coin = 'CRYPTO:BTC-USDT';
const assignedAt = '2026-11-23T08:00:00+08:00';
const late = '2026-11-27T13:20:00+08:00';
const now = new Date('2026-11-27T16:00:00+08:00');
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function history(): CryptoCalendarHistory {
  return { lots: [
    { id: 1, symbol: stock, initialQuantity: 10, unitCost: 20, openingFee: null,
      openedDate: activationDate, actualTradedAt: '2026-11-23T07:00:00+08:00', registeredAt: '2026-11-23T07:01:00+08:00' },
    { id: 2, symbol: coin, initialQuantity: 1, unitCost: 200, openingFee: null,
      openedDate: activationDate, actualTradedAt: '2026-11-23T07:00:00+08:00', registeredAt: '2026-11-23T07:01:00+08:00' },
    // Physical lot existed on day25, but the target member's allocation did not.
    { id: 3, symbol: '600002.SH', initialQuantity: 10, unitCost: 30, openingFee: null,
      openedDate: '2026-11-25', actualTradedAt: '2026-11-25T13:00:00+08:00', registeredAt: '2026-11-25T13:01:00+08:00' },
  ], sales: [], closures: [], observations: [],
  participations: [101, 102].map((userId, i) => ({ id: 10 + i, lotId: 1, userId,
    allocatedQuantity: 2, remainingQuantity: 2, entryPrice: 20, startDate: activationDate,
    pauseDate: null, assignedAt, updatedAt: assignedAt })),
  };
}
function input(h: CryptoCalendarHistory, date: string): CryptoCalendarInput {
  return { ...h, categoryId, snapshotDate: date, activationDate, now: new Date(`${date}T15:10:00+08:00`),
    quotes: [
      { symbol: stock, price: 18, currency: 'CNY', priceDate: date, source: 'unified_close_sina', updatedAt: `${date}T15:05:00+08:00` },
      { symbol: '600002.SH', price: 29, currency: 'CNY', priceDate: date, source: 'unified_close_sina', updatedAt: `${date}T15:05:00+08:00` },
      { symbol: coin, price: 180, currency: 'USDT', priceDate: date, source: 'crypto_close_gate_1505', updatedAt: `${date}T15:05:03+08:00` },
    ], usdFx: null,
    usdtFx: { snapshotDate: date, usdtCnyRate: 7, pair: 'USDT/CNY', conversionPolicy: USDT_USD_PARITY_POLICY,
      source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny`, asOf: `${date}T15:04:00+08:00`,
      lockedAt: `${date}T15:05:00+08:00`, carried: false, forexSnapshotDate: date,
      usdCnyRate: 7, usdCnyAsOf: `${date}T15:04:00+08:00`, usdCnySource: 'sina_usdcny', usdtUsdRate: 1,
      usdtUsdAsOf: `${date}T15:05:00+08:00`, usdtUsdSource: USDT_USD_PARITY_SOURCE,
      observedAt: `${date}T15:05:03+08:00` },
  };
}
function fixture() {
  const old = history();
  const originals = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'].map(date =>
    buildCryptoPortfolioDailyPayload({ ...input(old, date), captureHistoryEvidence: date === '2026-11-26' }));
  const current = history();
  current.participations = [...current.participations, { id: 20, lotId: 3, userId: 101,
    allocatedQuantity: 3, remainingQuantity: 3, entryPrice: 30, startDate: '2026-11-25',
    pauseDate: null, assignedAt: late, updatedAt: late }];
  originals.push(buildCryptoPortfolioDailyPayload({ ...input(current, '2026-11-27'), captureHistoryEvidence: true }));
  current.downsideRules = [{ ledgerId: 37, categoryId, lotId: 1, userId: 101, version: 1,
    enabled: true, thresholdPrice: 20, downsidePercent: 50, startDate: activationDate,
    effectiveAt: '2026-11-23T00:00:00+08:00', currency: 'CNY', baselineRawPrice: 20,
    baselineCountedPrice: 20, baselineStatus: 'ready', baselineSource: 'owner_threshold',
    createdAt: '2026-11-27T12:00:00+08:00' }];
  return { current, originals, proofs: { sales: [], closures: [] } };
}
function recover(f = fixture()) {
  return buildLegacyCryptoPublicationHistory({ originalPayloads: f.originals, history: f.current, proofs: f.proofs, now });
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}

describe('publication-time late first allocation on an existing physical lot', () => {
  it('removes only the late member row, keeps the physical lot, and verifies old raw economics', () => {
    const result = recover()['2026-11-25'];
    expect(result.history.lots.some(l => l.id === 3)).toBe(true);
    expect(result.history.participations.map(p => p.id)).toEqual([10, 11]);
    expect(result.verifiedTotal).toBe(true);
    expect(result.verifiedMemberIds).toEqual([101, 102]);
  });
  it('restores day25/day26 daily readiness without adding the day27 backdated share to older days', () => {
    const f = fixture(), publicationHistoryByDate = recover(f);
    const result = revalueCryptoPortfolioDailyPayloads({ categoryId, originalPayloads: f.originals,
      history: f.current, publicationHistoryByDate, now });
    expect(result.payloads.map(p => p.members['101'].totalPnl)).toEqual([2, 2, 2, 2, 5]);
    for (const date of ['2026-11-25', '2026-11-26']) {
      const s = result.payloads.find(p => p.snapshotDate === date)!.members['101'];
      expect(s).toMatchObject({ ready: true, dailyPnlReady: true, dailyPnl: 0, dailyPnlReason: null });
    }
    expect(result.payloads.at(-1)!.members['101']).toMatchObject({ totalPnl: 5, dailyPnl: 3, dailyPnlReady: true });
    expect(result.payloads.at(-1)!.historyEvidence).toEqual(f.originals.at(-1)!.historyEvidence);
  });
  it('leaves day23/day24/day27 exactly equal to a no-late-allocation reference replay', () => {
    const f = fixture(), recovered = recover(f);
    const result = revalueCryptoPortfolioDailyPayloads({ categoryId, originalPayloads: f.originals,
      history: f.current, publicationHistoryByDate: recovered, now });
    // Before the new share existed, old-day reconstruction had only the original member rows.
    // Keep current identity membership for frozen day27, but build old-day proof without the late row.
    const referenceProof = recover({ ...f, current: { ...f.current,
      participations: f.current.participations.filter(p => p.id !== 20) } });
    const reference = revalueCryptoPortfolioDailyPayloads({ categoryId, originalPayloads: f.originals,
      history: f.current, publicationHistoryByDate: referenceProof, now });
    for (const date of ['2026-11-23', '2026-11-24', '2026-11-27'])
      expect(result.payloads.find(p => p.snapshotDate === date)!.members['101'])
        .toEqual(reference.payloads.find(p => p.snapshotDate === date)!.members['101']);
  });
  it.each([null, '', 'not-a-time'])('unknown first-assignment proof %s stays present and rejects only that user', assignedAt => {
    const f = fixture(); f.current.participations[2].assignedAt = assignedAt;
    const result = recover(f)['2026-11-25'];
    expect(result.history.participations.some(p => p.id === 20)).toBe(true);
    expect(result.verifiedMemberIds).toEqual([102]);
    expect(result.verifiedTotal).toBe(true);
  });
  it('an old row updated late is not mistaken for a newly registered allocation', () => {
    const f = fixture(); f.current.participations[0].updatedAt = late;
    const result = recover(f)['2026-11-25'];
    expect(result.history.participations.some(p => p.id === 10)).toBe(true);
    expect(result.verifiedMemberIds).toEqual([102]);
  });
  it('continues strict sameEconomics verification after removing a late row', () => {
    const f = fixture(); f.current.participations[0].entryPrice = 21;
    const result = recover(f)['2026-11-25'];
    expect(result.verifiedTotal).toBe(true);
    expect(result.verifiedMemberIds).toEqual([102]);
  });
  it('retains a later closure belonging to a removed allocation only outside the old candidate', () => {
    const f = fixture(); f.current.participations[2].remainingQuantity = 0;
    f.current.closures = [{ participationId: 20, eventId: 50, quantity: 3, salePrice: 28,
      closeDate: '2026-11-27', soldAt: late }];
    // No closure proof is needed to prove a not-yet-assigned member was absent on 25.
    const result = recover(f)['2026-11-25'];
    expect(result.history.closures).toEqual([]);
    expect(result.verifiedMemberIds).toEqual([101, 102]);
    expect(f.current.closures).toHaveLength(1);
  });
  it('a later registered physical lot is removed independently of backdated manual starts', () => {
    const f = fixture(); f.current.lots[2].registeredAt = late; f.current.lots[2].openedDate = activationDate;
    const result = recover(f)['2026-11-23'];
    expect(result.history.lots.some(l => l.id === 3)).toBe(false);
    expect(result.verifiedMemberIds).toEqual([101, 102]);
  });
  it.each([-1, 0, 1])('assignment publishedAt %+d ms uses an inclusive registration boundary without cutoff rewind', delta => {
    const f = fixture(), original = f.originals.find(p => p.snapshotDate === '2026-11-25')!;
    const stamp = new Date(Date.parse(original.publishedAt) + delta).toISOString();
    f.current.participations[2].assignedAt = stamp; f.current.participations[2].updatedAt = stamp;
    const result = recover(f)['2026-11-25'];
    expect(result.history.participations.some(p => p.id === 20)).toBe(delta <= 0);
    expect(result.verifiedMemberIds).toEqual(delta <= 0 ? [102] : [101, 102]);
  });
  it('never blesses an original claiming the late share existed despite removal proof', () => {
    const f = fixture(); f.originals.find(p => p.snapshotDate === '2026-11-25')!.members['101'].costValue! += 90;
    expect(recover(f)['2026-11-25'].verifiedMemberIds).toEqual([102]);
  });
  it('does not invent a verified empty member scope if all that user rows are provably late', () => {
    const f = fixture(); f.current.participations[0].assignedAt = late;
    const result = recover(f)['2026-11-25'];
    expect(result.history.participations.filter(p => p.userId === 101)).toEqual([]);
    expect(result.verifiedMemberIds).toEqual([102]);
  });
  it('preserves original JSON, history, quotes, FX and proof hashes on deeply frozen input', () => {
    const f = freeze(fixture()), before = hash(f);
    const result = recover(f);
    revalueCryptoPortfolioDailyPayloads({ categoryId, originalPayloads: f.originals,
      history: f.current, publicationHistoryByDate: result, now });
    expect(hash(f)).toBe(before);
    result['2026-11-25'].history.participations[0].entryPrice = 1;
    expect(hash(f)).toBe(before);
  });
  it('executes pure helpers without invoking network services', () => {
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('network forbidden'); });
    try { expect(recover()['2026-11-25'].verifiedMemberIds).toEqual([101, 102]); expect(network).not.toHaveBeenCalled(); }
    finally { network.mockRestore(); }
  });
});
