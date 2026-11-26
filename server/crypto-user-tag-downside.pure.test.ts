import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildCryptoPortfolioDailyPayload, revalueCryptoPortfolioDailyPayloads, cryptoPortfolioStockAnchor,
  cryptoPortfolioDownsideFingerprint, type CryptoCalendarInput, type CryptoCalendarHistory } from './shared/crypto-portfolio-calendar';
import { stockLotDownsideEffectiveAt, type StockLotDownsideRule } from '../shared/stock-lot-downside';
import type { UserTagDownsideOverride } from '../shared/user-tag-downside-override';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';
const categoryId = 81, activation = '2026-11-24', symbol = 'CRYPTO:BTC-USDT';
const override = (mode: 'exempt' | 'follow_tag' = 'exempt', version = 1): UserTagDownsideOverride => ({
  ledgerId: 37, categoryId, targetUserId: 101, actorUserId: 7, mode, version, createdAt: '2026-11-26T03:00:00.000Z' });
const rule = (retro = false): StockLotDownsideRule => ({ ledgerId: 37, categoryId, lotId: 1, userId: 7, version: 1,
  currency: 'USDT', enabled: true, thresholdPrice: 200, downsidePercent: 20, baselineRawPrice: 200, baselineCountedPrice: 200,
  effectiveAt: retro ? stockLotDownsideEffectiveAt(activation) : `${activation}T10:00:00+08:00`, createdAt: '2026-11-23T10:00:00Z',
  ...(retro ? { startDate: activation, baselineSource: 'owner_threshold' as const } : {}) });
function day(date = '2026-11-25', price = 100): CryptoCalendarInput {
  const a = cryptoPortfolioStockAnchor(date)!.A;
  return { categoryId, snapshotDate: date, activationDate: activation, now: new Date(`${date}T16:00:00+08:00`),
    lots: [{ id: 1, symbol, initialQuantity: 4, unitCost: 200, openingFee: null, openedDate: activation,
      actualTradedAt: `${activation}T08:00:00+08:00`, registeredAt: `${activation}T08:01:00+08:00` }],
    participations: [101, 102].map((userId, i) => ({ id: 11 + i, lotId: 1, userId, allocatedQuantity: 1, remainingQuantity: 1,
      entryPrice: 200, startDate: activation, pauseDate: null, assignedAt: `${activation}T08:02:00+08:00`, updatedAt: `${activation}T08:02:00+08:00` })),
    sales: [], closures: [], observations: [{ lotId: 1, userId: 101, quantity: 0.5, entryPrice: 200, startDate: activation,
      pauseDate: null, assignedAt: `${activation}T08:02:00+08:00`, updatedAt: `${activation}T08:02:00+08:00` }],
    quotes: [{ symbol, currency: 'USDT', price, priceDate: date, source: 'crypto_close_gate_1505', updatedAt: `${date}T15:05:03+08:00`, cutoffAt: `${date}T15:05:00+08:00` }],
    usdFx: null, usdtFx: { snapshotDate: date, pair: 'USDT/CNY', usdtCnyRate: 7, conversionPolicy: USDT_USD_PARITY_POLICY,
      source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny`, asOf: `${a}T15:04:00+08:00`, lockedAt: `${date}T15:05:00+08:00`,
      carried: false, forexSnapshotDate: a, usdCnyRate: 7, usdCnyAsOf: `${a}T15:04:00+08:00`, usdCnySource: 'sina_usdcny',
      usdtUsdRate: 1, usdtUsdAsOf: `${date}T15:05:00+08:00`, usdtUsdSource: USDT_USD_PARITY_SOURCE, observedAt: `${date}T15:05:03+08:00` },
    captureHistoryEvidence: true };
}
const history = (d: CryptoCalendarInput): CryptoCalendarHistory => ({ lots: d.lots, sales: d.sales, participations: d.participations,
  closures: d.closures, observations: d.observations ?? [], downsideRules: d.downsideRules, downsideMemberEpochs: d.downsideMemberEpochs,
  userTagDownsideOverrides: d.userTagDownsideOverrides });
function sold(d: CryptoCalendarInput, fully = false): CryptoCalendarInput {
  const qs = fully ? [0.25, 0.75] : [0.25, 0.25];
  return { ...d, participations: d.participations.map(p => ({ ...p, remainingQuantity: 1 - qs.reduce((a,b) => a+b,0) })),
    sales: qs.map((q, i) => ({ lotId: 1, eventId: 91+i, quantity: q*2, eventQuantity: q*2, salePrice: 80-i*20,
      countedSalePrice: 176-i*4, transactionFee: null, soldAt: `2026-11-25T1${i}:00:00+08:00`, closeDate: '2026-11-25' })),
    closures: d.participations.flatMap(p => qs.map((q, i) => ({ participationId: p.id, quantity: q,
      salePrice: 80-i*20, countedSalePrice: 176-i*4, soldAt: `2026-11-25T1${i}:00:00+08:00`, closeDate: '2026-11-25', eventId: 91+i }))) };
}
describe('crypto user/tag exemption pure derived accounting', () => {
  it('same tag A raw/B follow; physical total, retained account self-share and observation unchanged', () => {
    const d = { ...day(), downsideRules: [rule(true)] }, old = buildCryptoPortfolioDailyPayload(d);
    const derived = buildCryptoPortfolioDailyPayload({ ...d, userTagDownsideOverrides: [override()] });
    expect(derived.members['101'].nativePnl.USDT).toBe(100);
    expect(derived.members['102']).toEqual(old.members['102']);
    expect(derived.total).toEqual(old.total); expect(derived.observations).toEqual(old.observations);
    expect(derived.members['101'].positionCount).toBe(1); expect(derived.members['101'].downsideRuleAudit).toBeUndefined();
  });
  it.each([false, true])('legacy saved counted sale ignored only by exempt, partial/full closed=%s', fully => {
    const d = sold({ ...day(), downsideRules: [rule()] }, fully);
    const a = buildCryptoPortfolioDailyPayload({ ...d, userTagDownsideOverrides: [override()] });
    const raw = buildCryptoPortfolioDailyPayload({ ...d, downsideRules: [],
      sales: d.sales.map(s => ({ ...s, countedSalePrice: undefined })), closures: d.closures.map(c => ({ ...c, countedSalePrice: undefined })) });
    const follow = buildCryptoPortfolioDailyPayload(d);
    expect(a.members['101']).toEqual(raw.members['101']); expect(a.members['102']).toEqual(follow.members['102']);
    expect(a.total).toEqual(follow.total); expect(a.fx).toEqual(d.usdtFx ? { usdt: d.usdtFx, usd: d.usdFx } : a.fx);
  });
  it('entry below K uses zero exempt offset, epoch never leaks into raw sale/current', () => {
    const d = { ...day(), downsideRules: [rule(true)], userTagDownsideOverrides: [override()],
      participations: day().participations.map(p => ({ ...p, entryPrice: 150 })),
      downsideMemberEpochs: [{ ledgerId: 37, categoryId, lotId: 1, participationId: 11, userId: 101,
        effectiveAt: `${activation}T08:02:00+08:00`, rawPrice: 150, countedPrice: 190, entryCountedOffset: 40 }] };
    expect(buildCryptoPortfolioDailyPayload(d).members['101'].nativePnl.USDT).toBe(50);
  });
  it('no retro rule immutable old payload still derives exempt across all history, never compares raw to old counted as corrupt', () => {
    const d = sold({ ...day(), downsideRules: [rule()] }, true), old = buildCryptoPortfolioDailyPayload(d);
    const before = JSON.stringify(old), h = { ...history(d), userTagDownsideOverrides: [override()] };
    const f = { categoryId, originalPayloads: [old], history: h, now: new Date('2026-11-26T02:00:00Z') };
    const r = revalueCryptoPortfolioDailyPayloads(f);
    expect(r.startDate).toBe('2026-11-25'); expect(r.payloads[0].members['101'].ready).toBe(true);
    expect(r.payloads[0].members['101'].nativePnl.USDT).toBe(135);
    expect(r.payloads[0].total).toBe(old.total); expect(r.payloads[0].members['102']).toBe(old.members['102']);
    expect(r.payloads[0].observations).toEqual(old.observations); expect(r.payloads[0].fx).toEqual(old.fx);
    expect(JSON.stringify(old)).toBe(before);
    const restored = revalueCryptoPortfolioDailyPayloads({ ...f, history: { ...h, userTagDownsideOverrides: [override(), override('follow_tag', 2)] } });
    expect(restored.payloads[0]).toBe(old);
    expect(r.fingerprint).not.toBe(restored.fingerprint);
  });
  it('legacy no immutable evidence reconciles with old follow policy before applying raw override', () => {
    const d = sold({ ...day(), downsideRules: [rule()], captureHistoryEvidence: false }, true);
    const old = buildCryptoPortfolioDailyPayload(d);
    const r = revalueCryptoPortfolioDailyPayloads({ categoryId, originalPayloads: [old], history: { ...history(d), userTagDownsideOverrides: [override()] },
      now: new Date('2026-11-26T02:00:00Z') });
    expect(r.payloads[0].members['101'].ready).toBe(true); expect(r.payloads[0].members['101'].nativePnl.USDT).toBe(135);
  });
  it('latest follow cancels exempt ALL historical retro dates; fixed payload and FX immutable', () => {
    const d = { ...day(), downsideRules: [rule(true)] }, original = buildCryptoPortfolioDailyPayload({ ...d, downsideRules: [] });
    const common = { categoryId, originalPayloads: [original], history: history(d), now: new Date('2026-11-26T02:00:00Z') };
    const follow = revalueCryptoPortfolioDailyPayloads(common);
    const canceled = revalueCryptoPortfolioDailyPayloads({ ...common, history: { ...common.history, userTagDownsideOverrides: [override(), override('follow_tag', 2)] } });
    expect(canceled.payloads[0].members).toEqual(follow.payloads[0].members);
    expect(canceled.payloads[0].total).toEqual(follow.payloads[0].total);
  });
  it('deleted current participation, edited legacy rows, missing quote/FX are pending not invented zero', () => {
    const d = { ...day(), downsideRules: [rule()] }, original = buildCryptoPortfolioDailyPayload(d);
    const common = { categoryId, originalPayloads: [original], history: { ...history(d), userTagDownsideOverrides: [override()] }, now: new Date('2026-11-26T02:00:00Z') };
    const deleted = revalueCryptoPortfolioDailyPayloads({ ...common, history: { ...common.history, participations: d.participations.filter(p => p.userId !== 101) } });
    expect(deleted.payloads[0].members['101']).toMatchObject({ ready: false, totalPnl: null });
    const legacy = { ...original, historyEvidence: undefined };
    const edited = revalueCryptoPortfolioDailyPayloads({ ...common, originalPayloads: [legacy], history: { ...common.history,
      participations: d.participations.map(p => ({ ...p, updatedAt: '2026-11-26T00:00:00Z' })) } });
    expect(edited.payloads[0].members['101']).toMatchObject({ ready: false, totalPnl: null });
    const missingFx = buildCryptoPortfolioDailyPayload({ ...d, userTagDownsideOverrides: [override()], usdtFx: null });
    expect(missingFx.members['101']).toMatchObject({ ready: false, totalPnl: null });
    const missingQuote = buildCryptoPortfolioDailyPayload({ ...d, userTagDownsideOverrides: [override()], quotes: [] });
    expect(missingQuote.members['101']).toMatchObject({ ready: false, totalPnl: null });
  });
  it('override cache identity includes versions/mode even without any global rule', () => {
    expect(cryptoPortfolioDownsideFingerprint(categoryId, { userTagDownsideOverrides: [override()] }))
      .not.toBe(cryptoPortfolioDownsideFingerprint(categoryId, { userTagDownsideOverrides: [override(), override('follow_tag', 2)] }));
  });
  it('static read-path forces no-retro exemption derive; writes publish global and paid/wallet unchanged', () => {
    const s = fs.readFileSync(new URL('./crypto-portfolio-settlement.ts', import.meta.url), 'utf8');
    const derived = s.slice(s.indexOf('async function readDerivedPayloads'), s.indexOf('/** SELECT-only derived read.'));
    expect(derived).toContain('if ((!retro && !hasExempt) || !originals.length)');
    expect(derived).toContain('userTagDownsideOverrides: overrides');
    expect(derived).not.toMatch(/INSERT|UPDATE|DELETE|CREATE|ensure\w+\(/);
    const pub = s.slice(s.indexOf('export async function publishCryptoPortfolioSnapshots'), s.indexOf('const derivedCalendarCaches'));
    expect(pub).toContain('readDerivedPayloads(tx, categoryId, activationDate, new Date(), false)');
    expect(pub).not.toContain('readUserTagDownsideOverrides');
  });
});
