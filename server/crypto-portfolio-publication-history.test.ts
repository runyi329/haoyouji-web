import { describe, expect, it, vi } from 'vitest';
import {
  buildCryptoPortfolioDailyPayload, cryptoPortfolioStockAnchor,
  type CryptoCalendarHistory, type CryptoCalendarInput, type CryptoPortfolioDailyPayload,
} from './shared/crypto-portfolio-calendar';
import {
  buildLegacyCryptoPublicationHistory, type CryptoPublicationHistoryProofs,
} from './shared/crypto-portfolio-publication-history';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';

// Synthetic fixture only: no customer identities, quantities, prices or archived payloads.
const categoryId = 71, activationDate = '2026-11-23', stock = '600001.SH', crypto = 'CRYPTO:BTC-USDT';
const assignedAt = '2026-11-23T08:00:00+08:00';
const recordedAt = '2026-11-24T09:35:45+08:00', registeredAt = '2026-11-24T09:35:46+08:00';
const now = new Date('2026-11-26T12:00:00+08:00');
function history(): CryptoCalendarHistory {
  return {
    lots: [
      { id: 1, symbol: stock, initialQuantity: 10, unitCost: 20, openingFee: null, openedDate: '2026-11-23',
        actualTradedAt: '2026-11-23T07:00:00+08:00', registeredAt: '2026-11-23T07:01:00+08:00' },
      { id: 2, symbol: crypto, initialQuantity: 1, unitCost: 200, openingFee: null, openedDate: '2026-11-23',
        actualTradedAt: '2026-11-23T07:00:00+08:00', registeredAt: '2026-11-23T07:01:00+08:00' },
    ],
    sales: [], closures: [], observations: [],
    participations: [101, 102].map((userId, i) => ({ id: 10 + i, lotId: 1, userId, allocatedQuantity: 2,
      remainingQuantity: 2, entryPrice: 20, startDate: '2026-11-23', pauseDate: null, assignedAt, updatedAt: assignedAt })),
  };
}
function input(h: CryptoCalendarHistory, date: string): CryptoCalendarInput {
  const anchor = cryptoPortfolioStockAnchor(date)!.A;
  return { ...h, categoryId, snapshotDate: date, activationDate, now: new Date(`${date}T15:10:00+08:00`),
    quotes: [
      { symbol: stock, price: 18, currency: 'CNY', priceDate: date, source: 'unified_close_sina', updatedAt: `${date}T15:05:00+08:00` },
      { symbol: crypto, price: 180, currency: 'USDT', priceDate: date, source: 'crypto_close_gate_1505',
        updatedAt: `${date}T15:05:03+08:00`, cutoffAt: `${date}T15:05:00+08:00` },
    ], usdFx: null,
    usdtFx: { snapshotDate: date, usdtCnyRate: 7, pair: 'USDT/CNY', conversionPolicy: USDT_USD_PARITY_POLICY,
      source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny`, asOf: `${anchor}T15:04:00+08:00`,
      lockedAt: `${date}T15:05:00+08:00`, carried: false, forexSnapshotDate: anchor,
      usdCnyRate: 7, usdCnyAsOf: `${anchor}T15:04:00+08:00`, usdCnySource: 'sina_usdcny', usdtUsdRate: 1,
      usdtUsdAsOf: `${date}T15:05:00+08:00`, usdtUsdSource: USDT_USD_PARITY_SOURCE,
      observedAt: `${date}T15:05:03+08:00` },
  };
}
function fixture() {
  const before = history();
  const day23 = buildCryptoPortfolioDailyPayload(input(before, '2026-11-23'));
  const current = history();
  current.sales = [{ lotId: 1, eventId: 52, quantity: 4, eventQuantity: 4, salePrice: 17,
    transactionFee: null, closeDate: '2026-11-23', soldAt: '2026-11-23T12:00:00+08:00' }];
  current.closures = [{ participationId: 10, eventId: 52, quantity: 2, salePrice: 17,
    closeDate: '2026-11-23', soldAt: '2026-11-23T12:00:00+08:00' }];
  current.participations = current.participations.map(p => p.id === 10 ? { ...p, remainingQuantity: 0, updatedAt: recordedAt } : p);
  const day24 = buildCryptoPortfolioDailyPayload({ ...input(current, '2026-11-24'), previous: day23 });
  const proofs: CryptoPublicationHistoryProofs = {
    sales: [{ eventId: 52, lotId: 1, registeredAt, allocatedAt: recordedAt }],
    closures: [{ eventId: 52, participationId: 10, registeredAt, recordedAt }],
  };
  return { current, originals: [day23, day24], proofs };
}
function recover(f = fixture()) {
  return buildLegacyCryptoPublicationHistory({ originalPayloads: f.originals, history: f.current, proofs: f.proofs, now });
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}

describe('legacy publication-time immutable registration recovery', () => {
  it('removes a next-day registered sale from day23, retains it on day24, and reconciles both scopes', () => {
    const result = recover();
    expect(result['2026-11-23']).toMatchObject({ verifiedTotal: true, verifiedMemberIds: [101, 102] });
    expect(result['2026-11-24']).toMatchObject({ verifiedTotal: true, verifiedMemberIds: [101, 102] });
    expect(result['2026-11-23'].history.sales).toHaveLength(0);
    expect(result['2026-11-23'].history.closures).toHaveLength(0);
    expect(result['2026-11-23'].history.participations[0]).toMatchObject({ remainingQuantity: 2, updatedAt: assignedAt });
    expect(result['2026-11-24'].history.sales[0]).toMatchObject({ eventId: 52, closeDate: '2026-11-23', salePrice: 17 });
    expect(result['2026-11-24'].history.participations[0].remainingQuantity).toBe(0);
  });
  it('does not mutate any input, frozen payload, proofs, quotes, FX or rule; outputs are detached', () => {
    const f = fixture();
    const before = JSON.stringify(f);
    freeze(f);
    const result = recover(f);
    expect(JSON.stringify(f)).toBe(before);
    result['2026-11-23'].history.participations[0].entryPrice = 123;
    result['2026-11-24'].history.lots[0].unitCost = 456;
    expect(JSON.stringify(f)).toBe(before);
    expect(result['2026-11-23'].history.lots[0].unitCost).toBe(20);
  });
  it('unknown non-closure edit remains unverified even if economics would be identical', () => {
    const f = fixture();
    f.current.participations = f.current.participations.map(p => p.id === 10
      ? { ...p, updatedAt: '2026-11-25T09:35:45+08:00' } : p);
    const result = recover(f);
    expect(result['2026-11-23'].verifiedTotal).toBe(true);
    expect(result['2026-11-23'].verifiedMemberIds).toEqual([102]);
    expect(result['2026-11-24'].verifiedMemberIds).toEqual([102]);
  });
  it.each(['missing', 'wrong second', 'conflicting duplicate'] as const)('closure %s proof fails closed only for its member', reason => {
    const f = fixture();
    f.proofs.closures = reason === 'missing' ? [] : reason === 'wrong second'
      ? [{ ...f.proofs.closures[0], recordedAt: '2026-11-24T09:35:44+08:00' }]
      : [...f.proofs.closures, { ...f.proofs.closures[0], recordedAt: '2026-11-24T09:35:44+08:00' }];
    const result = recover(f);
    expect(result['2026-11-23'].verifiedTotal).toBe(true);
    expect(result['2026-11-23'].verifiedMemberIds).toEqual([102]);
  });
  it('one missing closure timestamp remains unknown even when the other proves late registration', () => {
    const f = fixture();
    f.proofs.closures = [{ ...f.proofs.closures[0], recordedAt: null }];
    expect(recover(f)['2026-11-23'].verifiedMemberIds).toEqual([102]);
  });
  it('a non-finite member quantity fails only its scope instead of aborting publication recovery', () => {
    const f = fixture();
    f.current.participations = f.current.participations.map(p => p.id === 10 ? { ...p, remainingQuantity: NaN } : p);
    const result = recover(f)['2026-11-23'];
    expect(result.verifiedTotal).toBe(true); expect(result.verifiedMemberIds).toEqual([102]);
  });
  it('missing sales registration cannot trust total, but does not contaminate separately proved member economics', () => {
    const f = fixture(); f.proofs.sales = [];
    const result = recover(f);
    expect(result['2026-11-23'].verifiedTotal).toBe(false);
    expect(result['2026-11-23'].verifiedMemberIds).toEqual([101, 102]);
  });
  it('quantity conservation is required before a closure can justify updatedAt rewind', () => {
    const f = fixture();
    f.current.participations = f.current.participations.map(p => p.id === 10 ? { ...p, remainingQuantity: 1 } : p);
    expect(recover(f)['2026-11-23'].verifiedMemberIds).toEqual([102]);
  });
  it('a valid timestamp match still cannot override original economic mismatch', () => {
    const f = fixture();
    f.current.participations = f.current.participations.map(p => p.id === 10 ? { ...p, entryPrice: 21 } : p);
    const result = recover(f)['2026-11-23'];
    expect(result.verifiedTotal).toBe(true); expect(result.verifiedMemberIds).toEqual([102]);
  });
  it('later historical quotes never replace the frozen original close used to verify', () => {
    const f = fixture();
    const historicalQuotes = f.originals.flatMap(p => p.quotes.map(q => ({ ...q, price: q.price + 100,
      updatedAt: '2026-11-25T15:05:05+08:00' })));
    const result = buildLegacyCryptoPublicationHistory({ originalPayloads: f.originals, history: f.current,
      proofs: f.proofs, historicalQuotes, now });
    expect(result['2026-11-23'].verifiedTotal).toBe(true);
    expect(result['2026-11-23'].verifiedMemberIds).toEqual([101, 102]);
  });
  it('an original close subsequently changed cannot be used to bless mismatching stored economics', () => {
    const f = fixture();
    f.originals[0].quotes = f.originals[0].quotes.map(q => ({ ...q, price: q.price + 1 }));
    const result = recover(f)['2026-11-23'];
    expect(result.verifiedTotal).toBe(false); expect(result.verifiedMemberIds).toEqual([]);
  });
  it('does not use a later retroactive rule to reconcile the original publication', () => {
    const f = fixture();
    f.current.downsideRules = [{ ledgerId: 37, categoryId, lotId: 1, userId: 101, version: 1,
      enabled: true, thresholdPrice: 20, downsidePercent: 50, startDate: '2026-11-23',
      effectiveAt: '2026-11-23T00:00:00+08:00', currency: 'CNY', baselineRawPrice: 20,
      baselineCountedPrice: 20, createdAt: '2026-11-25T12:00:00+08:00' }];
    expect(recover(f)['2026-11-23']).toMatchObject({ verifiedTotal: true, verifiedMemberIds: [101, 102] });
  });
  it('never fills a missing native currency with zero just to make economics match', () => {
    const f = fixture(); delete f.originals[0].members['102'].nativePnl.USDT;
    expect(recover(f)['2026-11-23'].verifiedMemberIds).toEqual([101]);
  });
  it('observations reconcile separately; an observer edit cannot bless or poison member scope', () => {
    const h = history();
    h.observations = [{ lotId: 1, userId: 103, quantity: 1, entryPrice: 20,
      startDate: activationDate, pauseDate: null, assignedAt, updatedAt: assignedAt }];
    const original = buildCryptoPortfolioDailyPayload(input(h, activationDate));
    h.observations = h.observations.map(o => ({ ...o, updatedAt: recordedAt }));
    const result = buildLegacyCryptoPublicationHistory({ originalPayloads: [original], history: h,
      proofs: { sales: [], closures: [] }, now })[activationDate];
    expect(result.verifiedObservationIds).toEqual([]);
    expect(result.verifiedMemberIds).toEqual([101, 102]); expect(result.verifiedTotal).toBe(true);
  });
  it.each([-1, 0, 1])('sale registration at publishedAt %+d ms has inclusive publication boundary', delta => {
    const f = fixture(), original = f.originals[0];
    const stamp = new Date(Date.parse(original.publishedAt) + delta).toISOString();
    f.proofs.sales = [{ ...f.proofs.sales[0], registeredAt: stamp, allocatedAt: stamp }];
    if (delta <= 0) {
      // Synthetic original genuinely knew this sale (no member closure in this scope).
      const h = { ...history(), sales: f.current.sales };
      f.originals[0] = buildCryptoPortfolioDailyPayload(input(h, activationDate));
    }
    const result = recover(f)[activationDate];
    expect(result.history.sales).toHaveLength(delta <= 0 ? 1 : 0);
    expect(result.verifiedTotal).toBe(true);
    expect(result.history.sales.every(s => s.closeDate === '2026-11-23')).toBe(true);
  });
  it('lot registration after publication removes lot and its dependent rows without shifting effective dates', () => {
    const f = fixture();
    f.current.lots = [...f.current.lots, { id: 3, symbol: '600002.SH', initialQuantity: 1, unitCost: 1,
      openingFee: null, openedDate: '2026-11-23', registeredAt: '2026-11-25T09:00:00+08:00' }];
    f.current.participations = [...f.current.participations, { ...f.current.participations[1], id: 20, lotId: 3 }];
    const result = recover(f)[activationDate];
    expect(result.history.lots.map(l => l.id)).toEqual([1, 2]);
    expect(result.verifiedTotal).toBe(true); expect(result.verifiedMemberIds).toEqual([101, 102]);
  });
  it('future physical crypto with old manual start does not contaminate an existing member', () => {
    const f = fixture();
    f.current.lots = [...f.current.lots, { id: 3, symbol: 'CRYPTO:SOL-USDT', initialQuantity: 1, unitCost: 100,
      openingFee: null, openedDate: '2026-11-25', actualTradedAt: '2026-11-25T08:00:00+08:00',
      registeredAt: '2026-11-25T08:01:00+08:00' }];
    f.current.participations = [...f.current.participations, { ...f.current.participations[1], id: 20,
      lotId: 3, assignedAt: '2026-11-25T08:02:00+08:00', updatedAt: '2026-11-25T08:03:00+08:00' }];
    const result = recover(f);
    expect(result['2026-11-23'].verifiedMemberIds).toEqual([101, 102]);
    expect(result['2026-11-24'].verifiedMemberIds).toEqual([101, 102]);
    expect(result['2026-11-24'].history.lots.some(l => l.id === 3)).toBe(false);
  });
  it('does not overwrite frozen historyEvidence or return future publications', () => {
    const f = fixture();
    f.originals[0].historyEvidence = { version: 1, ...history() };
    const result = buildLegacyCryptoPublicationHistory({ originalPayloads: f.originals, history: f.current,
      proofs: f.proofs, now: new Date('2026-11-23T16:00:00+08:00') });
    expect(result).toEqual({});
  });
  it('rejects cross-category originals and malformed now rather than broadening trust', () => {
    const f = fixture(); f.originals[1].categoryId++;
    expect(() => recover(f)).toThrow('invalid_saved_crypto_payload');
    expect(() => buildLegacyCryptoPublicationHistory({ originalPayloads: [], history: history(),
      proofs: { sales: [], closures: [] }, now: new Date('invalid') })).toThrow('invalid_publication_history_now');
  });
  it('uses no fetch, DB, router, transaction or background service in the pure recovery path', () => {
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('no network'); });
    try { expect(recover()[activationDate].verifiedTotal).toBe(true); expect(network).not.toHaveBeenCalled(); }
    finally { network.mockRestore(); }
  });
});
