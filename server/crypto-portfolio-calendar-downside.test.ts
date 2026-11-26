import { describe, expect, it } from 'vitest';
import { buildCryptoPortfolioDailyPayload, cryptoPortfolioStockAnchor, type CryptoCalendarInput, type CryptoCalendarQuote } from './shared/crypto-portfolio-calendar';
import { createStockLotDownsideVersion, stockLotDownsidePriceAsOf, type StockLotDownsideRule } from '../shared/stock-lot-downside';
import { CRYPTO_PORTFOLIO_POLICY_VERSION } from '../shared/crypto-portfolio-policy';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';

const date = '2026-11-25', symbol = 'CRYPTO:BTC-USDT';
function quote(s = symbol, d = date, price = 100): CryptoCalendarQuote {
  const crypto = s.startsWith('CRYPTO:'), a = /^\d/.test(s);
  return { symbol: s, price, currency: crypto ? 'USDT' : a ? 'CNY' : 'USD', priceDate: d,
    source: crypto ? 'crypto_close_gate_1505' : a ? 'unified_close_tushare' : 'unified_close_yahoo',
    updatedAt: new Date(Date.parse(stockLotDownsidePriceAsOf(s, d)) + 3_000).toISOString(),
    ...(crypto ? { cutoffAt: stockLotDownsidePriceAsOf(s, d) } : {}) };
}
function input(d = date, price = 100): CryptoCalendarInput {
  const anchor = cryptoPortfolioStockAnchor(d)!.A;
  return { categoryId: 81, snapshotDate: d, activationDate: date, now: new Date(`${d}T16:00:00+08:00`),
    lots: [{ id: 1, symbol, initialQuantity: 2, unitCost: 200, openingFee: null, openedDate: date }],
    sales: [], closures: [], participations: [{ id: 11, lotId: 1, userId: 28, allocatedQuantity: 1,
      remainingQuantity: 1, entryPrice: 200, startDate: date, pauseDate: null,
      assignedAt: `${date}T08:00:00+08:00`, updatedAt: `${date}T08:00:00+08:00` }],
    observations: [{ lotId: 1, userId: 99, quantity: 0.5, entryPrice: 200, startDate: date, pauseDate: null,
      assignedAt: `${date}T08:00:00+08:00`, updatedAt: `${date}T08:00:00+08:00` }],
    quotes: [quote(symbol, d, price)], usdFx: null,
    usdtFx: { snapshotDate: d, usdtCnyRate: 7, pair: 'USDT/CNY', conversionPolicy: USDT_USD_PARITY_POLICY,
      source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny${anchor !== d ? `_carried_A_anchor_${anchor}` : ''}`,
      asOf: `${anchor}T15:04:00+08:00`, lockedAt: `${d}T15:05:00+08:00`, carried: anchor !== d,
      forexSnapshotDate: anchor, usdCnyRate: 7, usdCnyAsOf: `${anchor}T15:04:00+08:00`, usdCnySource: 'sina_usdcny',
      usdtUsdRate: 1, usdtUsdAsOf: `${d}T15:05:00+08:00`, usdtUsdSource: USDT_USD_PARITY_SOURCE,
      observedAt: `${d}T15:05:03+08:00` } };
}
function rule(pct = 20, overrides: Partial<StockLotDownsideRule> = {}): StockLotDownsideRule {
  return { ledgerId: 37, categoryId: 81, lotId: 1, userId: 28, version: 1, enabled: true,
    thresholdPrice: 200, downsidePercent: pct, baselineRawPrice: 200, baselineCountedPrice: 200,
    effectiveAt: `${date}T10:00:00+08:00`, createdAt: `${date}T10:00:00+08:00`, currency: 'USDT', ...overrides };
}

describe('mixed crypto fixed calendar 欠保证金 pure routing', () => {
  it('no rules is byte-identical to explicit [] and keeps legacy short/long units', () => {
    const data = input(), a = buildCryptoPortfolioDailyPayload(data), b = buildCryptoPortfolioDailyPayload({ ...data, downsideRules: [] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.total.nativePnl.USDT).toBe(-200); expect(a.members['28'].nativePnl.USDT).toBe(100);
  });
  it('100 native loss at 20% counts 20 per share for tag/member/display-only observer; raw quotes/entry/FX stay immutable', () => {
    const data = { ...input(), downsideRules: [rule()] }, before = JSON.stringify(data);
    const p = buildCryptoPortfolioDailyPayload(data);
    expect(p.total.nativePnl.USDT).toBe(-40); expect(p.members['28'].nativePnl.USDT).toBe(20);
    expect(p.observations['99'].nativePnl.USDT).toBe(10); expect(p.members['99']).toBeUndefined();
    expect(p.total.totalPnl).toBe(-280); expect(p.members['28'].totalPnl).toBe(140);
    expect(p.quotes[0].price).toBe(100); expect(p.total.quoteAsOf[0]).toMatchObject({ priceDate: date, source: 'crypto_close_gate_1505' });
    expect(p.total.downsideRuleAudit?.[0]).toMatchObject({ lotId: 1, version: 1, rawPrice: 100, countedPrice: 180 });
    expect(p.fx.usdt!.lockedAt).toBe(`${date}T15:05:00+08:00`); expect(JSON.stringify(data)).toBe(before);
    expect(p.policyVersion).toBe(CRYPTO_PORTFOLIO_POLICY_VERSION);
  });
  it.each([[0, 0], [100, 100]])('%s%% endpoint retains %s native member loss', (pct, counted) => {
    const p = buildCryptoPortfolioDailyPayload({ ...input(), downsideRules: [rule(pct)] });
    expect(p.members['28'].nativePnl.USDT).toBe(counted); expect(p.total.nativePnl.USDT).toBe(counted === 0 ? 0 : -counted * 2);
  });
  it('repeated crossings above/below threshold are not a permanent floor or one-way stop', () => {
    for (const [price, pnl] of [[100, 20], [210, -10], [150, 10], [200, 0], [250, -50]]) {
      const p = buildCryptoPortfolioDailyPayload({ ...input(date, price), downsideRules: [rule()] });
      expect(p.members['28'].nativePnl.USDT).toBe(pnl);
    }
  });
  it('quote-before-effective is raw even if imported/captured later; same-day after 15:05 waits next day', () => {
    const data = input(); data.quotes[0].updatedAt = `${date}T15:59:00+08:00`;
    const r = rule(20, { effectiveAt: `${date}T15:05:01+08:00` });
    const old = buildCryptoPortfolioDailyPayload({ ...data, downsideRules: [r] });
    expect(old.members['28'].nativePnl.USDT).toBe(100); expect(old.total.downsideRuleAudit).toBeUndefined();
    const next = buildCryptoPortfolioDailyPayload({ ...input('2026-11-26'), downsideRules: [r], previous: old });
    expect(next.members['28'].nativePnl.USDT).toBe(20);
  });
  it('A, US, crypto use their actual selected close date, distinct lot rules/currencies, no symbol-wide leak', () => {
    const data = input(); data.participations = []; data.observations = [];
    data.lots = [...data.lots,
      { id: 2, symbol: '600519.SH', initialQuantity: 1, unitCost: 200, openingFee: null, openedDate: '2026-11-24' },
      { id: 3, symbol: 'AAPL', initialQuantity: 1, unitCost: 200, openingFee: null, openedDate: '2026-11-24' },
      { id: 4, symbol: 'AAPL', initialQuantity: 1, unitCost: 200, openingFee: null, openedDate: '2026-11-24' }];
    data.quotes.push(quote('600519.SH', date, 100), quote('AAPL', '2026-11-24', 100));
    // Delayed import after the rule cannot turn yesterday NY close into today's applicability.
    data.quotes[2].updatedAt = `${date}T15:50:00+08:00`;
    data.usdFx = { snapshotDate: date, usdCnyRate: 8, pair: 'USD/CNY', source: 'sina_usdcny',
      asOf: `${date}T15:04:00+08:00`, lockedAt: `${date}T15:05:00+08:00` };
    data.downsideRules = [rule(), rule(0, { lotId: 2, currency: 'CNY' }),
      rule(0, { lotId: 3, currency: 'USD', effectiveAt: `${date}T06:00:00+08:00` }),
      rule(0, { lotId: 4, currency: 'USD', effectiveAt: '2026-11-24T22:00:00+08:00' })];
    const p = buildCryptoPortfolioDailyPayload(data);
    expect(p.total.nativePnl).toEqual({ CNY: 0, USD: -100, USDT: -40 });
    expect(p.total.totalPnl).toBe(-1080);
    expect(p.total.quoteAsOf.find(q => q.symbol === 'AAPL')?.priceDate).toBe('2026-11-24');
    expect(p.total.downsideRuleAudit?.map(a => a.lotId).sort()).toEqual([1, 2, 4]);
  });
  it('NY 16:00 selector remains DST-safe in summer and winter', () => {
    expect(Date.parse(stockLotDownsidePriceAsOf('AAPL', '2026-07-01'))).toBe(Date.parse('2026-07-01T20:00:00Z'));
    expect(Date.parse(stockLotDownsidePriceAsOf('AAPL', date))).toBe(Date.parse(`${date}T21:00:00Z`));
  });
  it('late entry at raw90/global counted100 has no instant artificial member loss, backfilled start does not precede assignedAt', () => {
    const data = input(date, 90); data.lots[0].unitCost = 100;
    data.participations[0] = { ...data.participations[0], entryPrice: 90, assignedAt: `${date}T12:00:00+08:00`, updatedAt: `${date}T12:00:00+08:00` };
    data.downsideRules = [rule(0, { thresholdPrice: 100, baselineRawPrice: 100, baselineCountedPrice: 100 })];
    data.downsideMemberEpochs = [{ ledgerId: 37, categoryId: 81, lotId: 1, participationId: 11, userId: 28,
      effectiveAt: `${date}T12:00:00+08:00`, rawPrice: 90, countedPrice: 100, entryCountedOffset: 10 }];
    const p = buildCryptoPortfolioDailyPayload(data);
    expect(p.members['28'].nativePnl.USDT).toBe(0); expect(p.members['28'].marketValue).toBe(630);
    expect(p.total.nativePnl.USDT).toBe(0);
    data.quotes[0].price = 80;
    expect(buildCryptoPortfolioDailyPayload(data).members['28'].nativePnl.USDT).toBe(0);
  });
  it('late real-member missing frozen epoch fails closed; a future/wrong-user epoch cannot backfill today', () => {
    const data = input(date, 90); data.participations[0] = { ...data.participations[0], entryPrice: 90,
      assignedAt: `${date}T12:00:00+08:00`, updatedAt: `${date}T12:00:00+08:00` };
    data.downsideRules = [rule(0, { thresholdPrice: 100, baselineRawPrice: 100, baselineCountedPrice: 100 })];
    expect(buildCryptoPortfolioDailyPayload(data).members['28']).toMatchObject({ ready: false, totalPnl: null,
      dailyPnlReason: 'missing_downside_member_baseline' });
    data.downsideMemberEpochs = [{ ledgerId: 37, categoryId: 81, lotId: 1, participationId: 11, userId: 28,
      effectiveAt: '2026-11-26T12:00:00+08:00', rawPrice: 90, countedPrice: 100, entryCountedOffset: 10 }];
    expect(buildCryptoPortfolioDailyPayload(data).members['28'].ready).toBe(false);
    data.downsideMemberEpochs[0].effectiveAt = `${date}T12:00:00+08:00`; data.downsideMemberEpochs[0].userId = 99;
    expect(buildCryptoPortfolioDailyPayload(data).members['28'].ready).toBe(false);
  });
  it('a new offset after the real sale cannot rewrite the previously frozen member closure', () => {
    const data = input(date, 100); data.downsideRules = [rule()];
    data.downsideMemberEpochs = [{ ledgerId: 37, categoryId: 81, lotId: 1, participationId: 11, userId: 28,
      effectiveAt: `${date}T14:00:00+08:00`, rawPrice: 100, countedPrice: 180, entryCountedOffset: 10 }];
    data.sales = [{ lotId: 1, quantity: 1, salePrice: 100, countedSalePrice: 180, transactionFee: null,
      eventQuantity: 1, closeDate: date, soldAt: `${date}T13:00:00+08:00` }];
    data.closures = [{ participationId: 11, quantity: 0.5, salePrice: 100, countedSalePrice: 180,
      closeDate: date, soldAt: `${date}T13:00:00+08:00` }];
    data.participations[0].remainingQuantity = 0.5;
    const p = buildCryptoPortfolioDailyPayload(data);
    expect(p.members['28'].realizedPnl).toBe(70); // 0.5 * (200-180) * 7, not later offset
    expect(p.members['28'].floatingPnl).toBe(105); // remaining uses the later prospective offset
  });
  it('actual bilateral fees retain full native amounts while only price movement is scaled', () => {
    const data = input(); data.downsideRules = [rule()]; data.participations = []; data.observations = [];
    data.lots[0].openingFee = 2;
    data.sales = [{ lotId: 1, quantity: 1, salePrice: 100, countedSalePrice: 180,
      transactionFee: 2, eventQuantity: 1, closeDate: date }];
    const p = buildCryptoPortfolioDailyPayload(data);
    expect(p.total.realizedPnl).toBe(-161); // (180-200-2 sell-1 buy) * 7
    expect(p.total.floatingPnl).toBe(-140); expect(p.total.nativePnl.USDT).toBe(-43);
    expect(data.sales[0].salePrice).toBe(100); expect(data.sales[0].transactionFee).toBe(2);
  });
  it('partial sale frozen counted180 plus remaining counted180 is conserved; real execution/closure price remain100', () => {
    const data = input(); data.downsideRules = [rule()];
    data.sales = [{ lotId: 1, quantity: 1, salePrice: 100, countedSalePrice: 180, transactionFee: null, eventQuantity: 1, closeDate: date }];
    data.closures = [{ participationId: 11, quantity: 0.5, salePrice: 100, countedSalePrice: 180, closeDate: date }];
    data.participations[0].remainingQuantity = 0.5;
    const before = JSON.stringify(data), p = buildCryptoPortfolioDailyPayload(data);
    expect(p.total.nativePnl.USDT).toBe(-40); expect(p.total.realizedPnl).toBe(-140); expect(p.total.floatingPnl).toBe(-140);
    expect(p.members['28'].nativePnl.USDT).toBe(20); expect(p.members['28'].realizedPnl).toBe(70); expect(p.members['28'].floatingPnl).toBe(70);
    expect(JSON.stringify(data)).toBe(before);
  });
  it('partial sale uses member-specific entry carry without revaluing historical raw sale', () => {
    const data = input(date, 80); data.lots[0].unitCost = 100;
    data.participations[0] = { ...data.participations[0], entryPrice: 90, remainingQuantity: 0.5,
      assignedAt: `${date}T12:00:00+08:00`, updatedAt: `${date}T12:00:00+08:00` };
    data.downsideRules = [rule(0, { thresholdPrice: 100, baselineRawPrice: 100, baselineCountedPrice: 100 })];
    data.downsideMemberEpochs = [{ ledgerId: 37, categoryId: 81, lotId: 1, participationId: 11, userId: 28,
      effectiveAt: `${date}T12:00:00+08:00`, rawPrice: 90, countedPrice: 100, entryCountedOffset: 10 }];
    data.sales = [{ lotId: 1, quantity: 1, salePrice: 80, countedSalePrice: 100, transactionFee: null, eventQuantity: 1, closeDate: date }];
    data.closures = [{ participationId: 11, quantity: 0.5, salePrice: 80, countedSalePrice: 100, closeDate: date }];
    const p = buildCryptoPortfolioDailyPayload(data);
    expect(p.members['28'].nativePnl.USDT).toBe(0); expect(p.total.nativePnl.USDT).toBe(0);
    data.closures[0].countedSalePrice = undefined;
    expect(buildCryptoPortfolioDailyPayload(data).members['28'].realizedPnl).toBe(35);
  });
  it('baseline carry and disable keep accumulated counted PnL, fixed previous/activation anchor are not mutated or double-added', () => {
    const r = rule(20), first = buildCryptoPortfolioDailyPayload({ ...input(), downsideRules: [r] });
    const frozen = JSON.stringify(first);
    const off = createStockLotDownsideVersion({ ledgerId: 37, categoryId: 81, lotId: 1, userId: 28, currency: 'USDT',
      enabled: false, expectedVersion: 1, currentRawPrice: 100, effectiveAt: `${date}T16:00:00+08:00` }, r);
    const next = buildCryptoPortfolioDailyPayload({ ...input('2026-11-26'), downsideRules: [r, off], previous: first });
    expect(next.total.nativePnl.USDT).toBe(-40); expect(next.total.dailyPnl).toBe(0);
    expect(next.members['28'].nativePnl.USDT).toBe(20); expect(next.members['28'].dailyPnl).toBe(0);
    expect(JSON.stringify(first)).toBe(frozen);
    const anchor = { ...first.total, snapshotDate: '2026-11-24' };
    const baseline = { snapshotDate: '2026-11-24', total: anchor, members: { '28': { ...first.members['28'], snapshotDate: '2026-11-24' } } };
    const before = JSON.stringify(baseline), activation = buildCryptoPortfolioDailyPayload({ ...input(), downsideRules: [r], baseline });
    expect(activation.total.dailyPnl).toBe(0); expect(activation.members['28'].dailyPnl).toBe(0); expect(JSON.stringify(baseline)).toBe(before);
  });
  it('weekend/paused scopes use actual carried quote date, not a new rule after the last close', () => {
    const data = input('2026-11-28'); data.lots.push({ id: 2, symbol: '600519.SH', initialQuantity: 1, unitCost: 200, openingFee: null, openedDate: date });
    data.quotes.push(quote('600519.SH', '2026-11-27', 100));
    data.downsideRules = [rule(0, { lotId: 2, currency: 'CNY', effectiveAt: '2026-11-27T22:00:00+08:00' })];
    data.participations[0].pauseDate = date; data.quotes.push(quote(symbol, date, 100));
    data.downsideRules.push(rule(0, { effectiveAt: '2026-11-26T10:00:00+08:00' }));
    const p = buildCryptoPortfolioDailyPayload(data);
    expect(p.total.nativePnl.CNY).toBe(-100); expect(p.members['28'].nativePnl.USDT).toBe(100);
    expect(p.members['28'].quoteAsOf[0].priceDate).toBe(date);
  });
  it('wrong ledger/category/currency rules cannot leak across tenant or lot native currency', () => {
    const p = buildCryptoPortfolioDailyPayload({ ...input(), downsideRules: [rule(0, { ledgerId: 38 }), rule(0, { categoryId: 82 }), rule(0, { currency: 'USD' })] });
    expect(p.total.nativePnl.USDT).toBe(-200); expect(p.total.downsideRuleAudit).toBeUndefined();
  });
  it('missing or untrusted raw price stays fail-closed, even 0% cannot fabricate a guaranteed ready amount', () => {
    const data = { ...input(), downsideRules: [rule(0)], quotes: [] };
    const p = buildCryptoPortfolioDailyPayload(data);
    for (const row of [p.total, p.members['28'], p.observations['99']]) expect(row).toMatchObject({ ready: false, totalPnl: null, missingSymbols: [symbol] });
    const invalid = buildCryptoPortfolioDailyPayload({ ...data, quotes: [{ ...quote(), price: 0 }] });
    expect(invalid.total.ready).toBe(false);
  });
});


describe('owner-input threshold in mixed daily settlement', () => {
  const manualInput = (pct = 20): CryptoCalendarInput => {
    const data = input();
    data.lots[0].openedAt = `${date}T06:00:00+08:00`;
    data.downsideRules = [createStockLotDownsideVersion({ ledgerId: 37, categoryId: 81, lotId: 1, userId: 28,
      currency: 'USDT', enabled: true, thresholdPrice: 200, downsidePercent: pct, expectedVersion: 0,
      currentRawPrice: NaN, startDate: '2026-11-24', effectiveAt: '2026-11-23T16:00:00Z',
      createdAt: `${date}T16:00:00+08:00`, baselineSource: 'owner_threshold' }, null)];
    return data;
  };
  it('no activation close required: manual basis revalues total, member and separate observer without changing raw inputs', () => {
    const data = manualInput(), before = JSON.stringify(data);
    const p = buildCryptoPortfolioDailyPayload(data);
    expect(p.total.ready).toBe(true); expect(p.total.nativePnl.USDT).toBe(-40);
    expect(p.members['28'].ready).toBe(true); expect(p.members['28'].nativePnl.USDT).toBe(20);
    expect(p.observations['99'].ready).toBe(true); expect(p.observations['99'].nativePnl.USDT).toBe(10);
    expect(p.members['99']).toBeUndefined();
    expect(p.total.downsideRuleAudit?.[0]).toMatchObject({ rawPrice: 100, countedPrice: 180 });
    expect(p.quotes[0].price).toBe(100); expect(p.fx.usdt!.usdtCnyRate).toBe(7);
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each([[0, 0], [100, 100]])('manual %s%% preserves the %s native member result', (pct, expected) => {
    const p = buildCryptoPortfolioDailyPayload(manualInput(pct));
    expect(p.members['28'].nativePnl.USDT).toBe(expected);
    expect(p.total.nativePnl.USDT).toBe(expected === 0 ? 0 : -2 * expected);
  });
  it('late participant and observer use their recorded entry price, not an unavailable intraday/previous-close proof', () => {
    const data = manualInput(0);
    data.lots[0].unitCost = 100;
    data.downsideRules![0] = { ...data.downsideRules![0], thresholdPrice: 100, baselineRawPrice: 100, baselineCountedPrice: 100 };
    data.participations[0].entryPrice = 90; data.observations![0].entryPrice = 90;
    data.quotes[0].price = 80;
    const p = buildCryptoPortfolioDailyPayload(data);
    expect(p.total.nativePnl.USDT).toBe(0);
    expect(p.members['28'].ready).toBe(true); expect(p.members['28'].nativePnl.USDT).toBe(0);
    expect(p.observations['99'].ready).toBe(true); expect(p.observations['99'].nativePnl.USDT).toBe(0);
    expect(p.members['28'].marketValue).toBe(90 * 7);
  });
  it('manual 0% never fabricates a missing current close or missing fixed FX', () => {
    const data = manualInput(0);
    data.quotes = [];
    const p = buildCryptoPortfolioDailyPayload(data);
    for (const row of [p.total, p.members['28'], p.observations['99']]) {
      expect(row.ready).toBe(false); expect(row.totalPnl).toBeNull(); expect(row.missingSymbols).toContain(symbol);
    }
    const missingFx = buildCryptoPortfolioDailyPayload({ ...manualInput(0), usdtFx: null });
    expect(missingFx.total.ready).toBe(false); expect(missingFx.total.totalPnl).toBeNull();
  });
  it('manual price basis does not bypass allocation timestamps, share conservation or raw sale evidence', () => {
    const changed = manualInput(); changed.participations[0].updatedAt = `${date}T15:05:01+08:00`;
    expect(() => buildCryptoPortfolioDailyPayload(changed)).toThrow('unverifiable_allocation_history');
    const shares = manualInput(); shares.participations[0].remainingQuantity = 0.5;
    expect(() => buildCryptoPortfolioDailyPayload(shares)).toThrow('unverifiable_allocation_history');
    const sale = manualInput();
    sale.sales = [{ lotId: 1, quantity: 1, salePrice: 100, eventQuantity: 1, transactionFee: null, closeDate: date }];
    const p = buildCryptoPortfolioDailyPayload(sale);
    expect(p.total.ready).toBe(false); expect(p.total.totalPnl).toBeNull();
  });
  it('partial sale uses actual execution with manual member carry, keeps fees and old frozen evidence untouched', () => {
    const data = manualInput();
    data.sales = [{ lotId: 1, quantity: 1, salePrice: 100, countedSalePrice: 999, transactionFee: 2,
      eventQuantity: 1, closeDate: date, soldAt: `${date}T13:00:00+08:00` }];
    data.closures = [{ participationId: 11, quantity: 0.5, salePrice: 100, countedSalePrice: 999,
      closeDate: date, soldAt: `${date}T13:00:00+08:00` }];
    data.participations[0].remainingQuantity = 0.5;
    const before = JSON.stringify(data), p = buildCryptoPortfolioDailyPayload(data);
    expect(p.total.nativePnl.USDT).toBe(-(200 - 180) * 2 - 2 - 200 * 0.001);
    expect(p.members['28'].nativePnl.USDT).toBe(20);
    expect(p.members['28'].realizedPnl).toBe(70); expect(p.members['28'].floatingPnl).toBe(70);
    expect(JSON.stringify(data)).toBe(before);
  });
});
