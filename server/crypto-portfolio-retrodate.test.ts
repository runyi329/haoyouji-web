import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { buildCryptoPortfolioDailyPayload, cryptoPortfolioStockAnchor, revalueCryptoPortfolioDailyPayloads,
  cryptoPortfolioDownsideFingerprint, type CryptoCalendarInput, type CryptoCalendarHistory, type CryptoPortfolioDailyPayload } from './shared/crypto-portfolio-calendar';
import { stockLotDownsidePriceAsOf, stockLotDownsideEffectiveAt, type StockLotDownsideRule } from '../shared/stock-lot-downside';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';
const symbol = 'CRYPTO:BTC-USDT', categoryId = 81, activation = '2026-11-21';
function day(date: string, price: number): CryptoCalendarInput {
  const a = cryptoPortfolioStockAnchor(date)!.A;
  return { categoryId, snapshotDate: date, activationDate: activation, now: new Date(`${date}T16:00:00+08:00`),
    lots: [{ id: 1, symbol, initialQuantity: 2, unitCost: 200, openingFee: null, openedDate: activation,
      actualTradedAt: `${activation}T08:00:00+08:00`, registeredAt: `${activation}T08:01:00+08:00` }], sales: [], closures: [],
    participations: [{ id: 11, lotId: 1, userId: 28, allocatedQuantity: 1, remainingQuantity: 1,
      entryPrice: 200, startDate: activation, pauseDate: null, assignedAt: `${activation}T08:02:00+08:00`, updatedAt: `${activation}T08:02:00+08:00` }],
    observations: [{ lotId: 1, userId: 99, quantity: 0.5, entryPrice: 200, startDate: activation, pauseDate: null,
      assignedAt: `${activation}T08:02:00+08:00`, updatedAt: `${activation}T08:02:00+08:00` }],
    quotes: [{ symbol, price, currency: 'USDT', priceDate: date, source: 'crypto_close_gate_1505',
      updatedAt: `${date}T15:05:03+08:00`, cutoffAt: `${date}T15:05:00+08:00` }], usdFx: null,
    usdtFx: { snapshotDate: date, usdtCnyRate: 7, pair: 'USDT/CNY', conversionPolicy: USDT_USD_PARITY_POLICY,
      source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny${a !== date ? `_carried_A_anchor_${a}` : ''}`,
      asOf: `${a}T15:04:00+08:00`, lockedAt: `${date}T15:05:00+08:00`, carried: a !== date,
      forexSnapshotDate: a, usdCnyRate: 7, usdCnyAsOf: `${a}T15:04:00+08:00`, usdCnySource: 'sina_usdcny',
      usdtUsdRate: 1, usdtUsdAsOf: `${date}T15:05:00+08:00`, usdtUsdSource: USDT_USD_PARITY_SOURCE,
      observedAt: `${date}T15:05:03+08:00` }, captureHistoryEvidence: true };
}
function rule(startDate = '2026-11-23', percent = 20, version = 1): StockLotDownsideRule {
  return { ledgerId: 37, categoryId, lotId: 1, userId: 28, version, enabled: true, startDate,
    effectiveAt: stockLotDownsideEffectiveAt(startDate), createdAt: '2026-11-25T12:00:00Z',
    thresholdPrice: 200, downsidePercent: percent, baselineRawPrice: 999, baselineCountedPrice: 999, currency: 'USDT' };
}
function fixture(capture = true) {
  const payloads: CryptoPortfolioDailyPayload[] = [];
  for (const [date, price] of [['2026-11-21', 200], ['2026-11-22', 180], ['2026-11-23', 100], ['2026-11-24', 120], ['2026-11-25', 150]] as const)
    payloads.push(buildCryptoPortfolioDailyPayload({ ...day(date, price), captureHistoryEvidence: capture, previous: payloads.at(-1) }));
  const d = day('2026-11-25', 150);
  const history: CryptoCalendarHistory = { lots: d.lots, sales: d.sales, participations: d.participations, closures: d.closures,
    observations: d.observations ?? [], downsideRules: [rule()] };
  return { categoryId, originalPayloads: payloads, history, now: new Date('2026-11-25T22:00:00+08:00') };
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

describe('crypto mixed retrodate derived revaluation', () => {
  it('earlier raw dates identical; start date changes totals/members/observations, raw JSON and hash immutable', () => {
    const f = fixture(), before = hash(f), oldHashes = f.originalPayloads.map(hash), result = revalueCryptoPortfolioDailyPayloads(f);
    expect(result.payloads[0]).toBe(f.originalPayloads[0]); expect(result.payloads[1]).toBe(f.originalPayloads[1]);
    expect(result.payloads[2].total.nativePnl.USDT).toBe(-72);
    expect(result.payloads[2].members['28'].nativePnl.USDT).toBe(36);
    expect(result.payloads[2].observations['99'].nativePnl.USDT).toBe(18);
    expect(result.payloads[2].members['99']).toBeUndefined();
    expect(result.payloads[2].quotes).toEqual(f.originalPayloads[2].quotes);
    expect(result.payloads[2].fx).toEqual(f.originalPayloads[2].fx);
    expect(result.payloads[2].publishedAt).toBe(f.originalPayloads[2].publishedAt);
    expect(result.payloads[2].policyVersion).toBe(f.originalPayloads[2].policyVersion);
    expect(hash(f)).toBe(before); expect(f.originalPayloads.map(hash)).toEqual(oldHashes);
  });
  it.each([[0, 20], [20, 36], [30, 44], [100, 100]])('remaining%s%% conserves earlier20 loss plus scaled new movement', (p, expected) => {
    const f = fixture(); f.history.downsideRules = [rule('2026-11-23', p)];
    expect(revalueCryptoPortfolioDailyPayloads(f).payloads[2].members['28'].nativePnl.USDT).toBe(expected);
  });
  it('uses revalued prior per day instead of old cumulative, including fixed original FX rates', () => {
    const f = fixture(), r = revalueCryptoPortfolioDailyPayloads(f).payloads;
    expect(r[2].members['28'].dailyPnl).toBe(112); // (36-20)*7
    expect(r[3].members['28'].dailyPnl).toBe(-28); // (32-36)*7, not (32-old100)*7
    expect(r[4].members['28'].dailyPnl).toBe(-42);
    for (let i = 1; i < r.length; i++) expect(r[i].total.dailyPnl).toBe(r[i].total.totalPnl! - r[i - 1].total.totalPnl!);
    expect(r[4].members['28'].usdtCnyRate).toBe(7);
  });
  it('highest applicable revision overrides older later-date settings, before its start old strategy stays', () => {
    const f = fixture(); f.history.downsideRules = [rule('2026-11-24', 0, 1), rule('2026-11-23', 30, 2)];
    const r = revalueCryptoPortfolioDailyPayloads(f).payloads;
    expect(r[1].members['28'].nativePnl.USDT).toBe(20);
    expect(r[2].members['28'].nativePnl.USDT).toBe(44);
    expect(r[3].members['28'].nativePnl.USDT).toBe(38);
    expect(r[3].total.downsideRuleAudit?.[0].version).toBe(2);
  });
  it('partial actual sale and closure reprice latest rule instead of stale frozen count; fees remain full', () => {
    const f = fixture();
    for (const p of f.originalPayloads.filter(p => p.snapshotDate >= '2026-11-23')) {
      const e = p.historyEvidence!;
      e.sales = [{ lotId: 1, quantity: 1, eventQuantity: 1, transactionFee: 2, salePrice: 100, countedSalePrice: 120,
        soldAt: '2026-11-23T13:00:00+08:00', closeDate: '2026-11-23' }];
      e.closures = [{ participationId: 11, quantity: 0.5, salePrice: 100, countedSalePrice: 120,
        soldAt: '2026-11-23T13:00:00+08:00', closeDate: '2026-11-23' }];
      e.participations = e.participations.map(p => ({ ...p, remainingQuantity: 0.5 }));
    }
    const before = hash(f), r = revalueCryptoPortfolioDailyPayloads(f).payloads[2];
    expect(r.members['28'].nativePnl.USDT).toBe(36);
    expect(r.members['28'].realizedPnl).toBe(126); expect(r.members['28'].floatingPnl).toBe(126);
    expect(r.total.nativePnl.USDT).toBe(-74.2); // 36 sold +36 remaining +2sell +.2legacy opening fee
    expect(hash(f)).toBe(before); expect(r.historyEvidence!.sales[0].salePrice).toBe(100);
    expect(r.historyEvidence!.sales[0].countedSalePrice).toBe(120);
  });
  it('missing actual soldAt cannot guess an execution time from snapshot/close date', () => {
    const f = fixture(); f.originalPayloads[2].historyEvidence!.sales = [{ lotId: 1, quantity: 1,
      eventQuantity: 1, transactionFee: null, salePrice: 100, countedSalePrice: 120, closeDate: '2026-11-23' }];
    expect(revalueCryptoPortfolioDailyPayloads(f).payloads[2].total.ready).toBe(false);
  });
  it('missing historical baseline stays pending even if stored fake baseline/today quote looks usable', () => {
    const f = fixture(); f.history.downsideRules = [rule('2026-11-20')];
    f.history.lots = f.history.lots.map(l => ({ ...l, actualTradedAt: '2026-11-19T08:00:00+08:00' }));
    for (const p of f.originalPayloads) p.historyEvidence!.lots = f.history.lots;
    const r = revalueCryptoPortfolioDailyPayloads(f);
    expect(r.payloads[0].total).toMatchObject({ ready: false, totalPnl: null, dailyPnlReason: 'missing_downside_historical_baseline' });
  });
  it('late member old epoch raw-price proof reprices latest revision, never stale offset', () => {
    const f = fixture(); f.history.downsideRules = [rule('2026-11-21', 20)];
    f.history.downsideMemberEpochs = [{ ledgerId: 37, categoryId, lotId: 1, participationId: 11, userId: 28,
      effectiveAt: '2026-11-23T12:00:00+08:00', rawPrice: 100, countedPrice: 120, entryCountedOffset: 20 }];
    for (const p of f.originalPayloads) p.historyEvidence!.participations = p.historyEvidence!.participations.map(p => ({ ...p,
      startDate: '2026-11-23', assignedAt: '2026-11-23T12:00:00+08:00', updatedAt: '2026-11-23T12:00:00+08:00', entryPrice: 100 }));
    const r = revalueCryptoPortfolioDailyPayloads(f).payloads;
    expect(r[2].members['28'].nativePnl.USDT).toBe(0); // latest C100180-offset80 -> raw100
    expect(r[3].members['28'].nativePnl.USDT).toBe(-4);
  });
  it('late member absent epoch can use exact prior verified close proof, but no proof is pending', () => {
    const f = fixture(); f.history.downsideRules = [rule('2026-11-21', 20)];
    for (const p of f.originalPayloads) p.historyEvidence!.participations = p.historyEvidence!.participations.map(p => ({ ...p,
      startDate: '2026-11-23', assignedAt: '2026-11-23T12:00:00+08:00', updatedAt: '2026-11-23T12:00:00+08:00', entryPrice: 180 }));
    const r = revalueCryptoPortfolioDailyPayloads(f).payloads;
    expect(r[2].members['28'].ready).toBe(true); expect(r[2].members['28'].nativePnl.USDT).toBe(16);
    f.originalPayloads = f.originalPayloads.slice(2);
    expect(revalueCryptoPortfolioDailyPayloads(f).payloads[0].members['28']).toMatchObject({ ready: false,
      dailyPnlReason: 'missing_downside_member_baseline' });
  });
  it('legacy payload edited current shares does not silently invent historical client quantity', () => {
    const f = fixture(false); f.history.participations = f.history.participations.map(p => ({ ...p,
      allocatedQuantity: 10, remainingQuantity: 10, updatedAt: '2026-11-25T18:00:00+08:00' }));
    const r = revalueCryptoPortfolioDailyPayloads(f);
    expect(r.payloads[2].total.ready).toBe(true);
    expect(r.payloads[2].members['28']).toMatchObject({ ready: false, totalPnl: null, dailyPnlReason: 'unverifiable_allocation_history' });
    expect(f.originalPayloads[2].members['28'].ready).toBe(true);
  });
  it('legacy unchanged pre-cutoff shares with original economic reconciliation are reusable', () => {
    const f = fixture(false); expect(revalueCryptoPortfolioDailyPayloads(f).payloads[2].members['28'].nativePnl.USDT).toBe(36);
  });
  it('captured publication history wins over subsequent current metadata edits', () => {
    const f = fixture(); f.history.participations = f.history.participations.map(p => ({ ...p,
      entryPrice: 888, allocatedQuantity: 99, remainingQuantity: 99, updatedAt: '2026-11-25T18:00:00+08:00' }));
    expect(revalueCryptoPortfolioDailyPayloads(f).payloads[2].members['28'].nativePnl.USDT).toBe(36);
  });
  it('start before activation requires derived stock baseline; missing baseline does not doublecount old daily', () => {
    const f = fixture(); f.history.downsideRules = [rule('2026-11-20')];
    const r = revalueCryptoPortfolioDailyPayloads(f);
    expect(r.payloads[0].total).toMatchObject({ ready: true, dailyPnlReady: false,
      dailyPnlReason: 'missing_revalued_stock_activation_baseline' });
    expect(r.payloads[1].total.dailyPnlReady).toBe(true);
  });
  it('no rule/no startDate is exact legacy payload; out-of-scope rules do not activate pipeline', () => {
    const f = fixture(); f.history.downsideRules = [];
    expect(revalueCryptoPortfolioDailyPayloads(f).payloads).toEqual(f.originalPayloads);
    f.history.downsideRules = [{ ...rule(), categoryId: 999 }];
    expect(revalueCryptoPortfolioDailyPayloads(f).startDate).toBeNull();
    const r = { ...rule() }; delete r.startDate; f.history.downsideRules = [r];
    expect(revalueCryptoPortfolioDailyPayloads(f).payloads).toEqual(f.originalPayloads);
  });
  it('fingerprint changes for version, ratio and member raw epoch evidence', () => {
    const f = fixture(), a = cryptoPortfolioDownsideFingerprint(categoryId, f.history);
    f.history.downsideRules = [rule('2026-11-23', 30, 2)];
    expect(cryptoPortfolioDownsideFingerprint(categoryId, f.history)).not.toBe(a);
    const b = cryptoPortfolioDownsideFingerprint(categoryId, f.history);
    f.history.downsideMemberEpochs = [{ ledgerId: 37, categoryId, lotId: 1, participationId: 11, userId: 28,
      effectiveAt: '2026-11-23T12:00:00Z', rawPrice: 100, countedPrice: 120, entryCountedOffset: 20 }];
    expect(cryptoPortfolioDownsideFingerprint(categoryId, f.history)).not.toBe(b);
  });
  it('actual US close price day precedes Beijing snapshot; new date cannot rewrite already-completed NY quote', () => {
    const f = fixture(); f.history.downsideRules = [{ ...rule('2026-11-25', 0), lotId: 2, currency: 'USD' }];
    // NY Nov24 16:00 is Beijing Nov25 05:00, so Nov25 midnight DOES apply; 06:00 does not.
    f.history.downsideRules = [{ ...f.history.downsideRules[0], effectiveAt: '2026-11-25T06:00:00+08:00' }];
    for (const p of f.originalPayloads) {
      p.historyEvidence!.lots = [...p.historyEvidence!.lots, { id: 2, symbol: 'AAPL', initialQuantity: 1,
        unitCost: 200, openingFee: null, openedDate: '2026-11-20', actualTradedAt: '2026-11-20T15:00:00Z' }];
      const us = cryptoPortfolioStockAnchor(p.snapshotDate)!.US;
      p.quotes.push({ symbol: 'AAPL', price: 100, currency: 'USD', priceDate: us, source: 'unified_close_yahoo',
        updatedAt: new Date(Date.parse(stockLotDownsidePriceAsOf('AAPL', us)) + 3000).toISOString() });
      const a = cryptoPortfolioStockAnchor(p.snapshotDate)!.A;
      p.fx.usd = { snapshotDate: a, usdCnyRate: 7, pair: 'USD/CNY', source: 'sina_usdcny',
        asOf: `${a}T15:04:00+08:00`, lockedAt: `${a}T15:05:00+08:00` };
    }
    const r = revalueCryptoPortfolioDailyPayloads(f).payloads.at(-1)!;
    expect(r.total.nativePnl.USD).toBe(-100); expect(r.total.downsideRuleAudit?.some(a => a.lotId === 2)).toBeFalsy();
  });
});
