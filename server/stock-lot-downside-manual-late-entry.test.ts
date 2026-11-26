import { describe, expect, it } from 'vitest';
import {
  createStockLotDownsideVersion,
  selectStockLotDownsideRule,
  stockLotDownsideMemberOffset,
  stockLotDownsidePriceAsOf,
  valueStockLotDownside,
  type StockLotDownsideRule,
} from '../shared/stock-lot-downside';
import { getUnifiedStockClosePublishAt } from '../shared/stock-unified-close-policy';
import { CRYPTO_PORTFOLIO_POLICY_VERSION, cryptoPortfolioCutoffAt } from '../shared/crypto-portfolio-policy';
import { buildMemberStockCalendar, type MemberCalendarParticipation } from './shared/stock-member-calendar';
import {
  buildCryptoPortfolioDailyPayload,
  type CryptoCalendarInput,
  type CryptoCalendarQuote,
} from './shared/crypto-portfolio-calendar';

// A real stock position existed before the member joined. The member's Beijing
// business date is not the physical NY opening date or the selected close date.
const date = '2026-11-25';
const quoteDate = '2026-11-24';
const assignedAt = `${date}T10:00:00+08:00`;
const openedAt = '2026-11-20T22:35:00+08:00';
const quoteAsOf = stockLotDownsidePriceAsOf('HOOD', quoteDate);
const publicationAt = getUnifiedStockClosePublishAt(date);
const now = new Date(`${date}T15:05:03+08:00`);
const usdFx = {
  snapshotDate: date, usdCnyRate: 7, pair: 'USD/CNY' as const,
  source: 'sina_usdcny', asOf: `${date}T15:04:00+08:00`,
  lockedAt: `${date}T15:05:00+08:00`,
};

function manual(pct = 0, patch: Partial<StockLotDownsideRule> = {}): StockLotDownsideRule {
  return {
    ...createStockLotDownsideVersion({
      ledgerId: 37, categoryId: 81, lotId: 1, userId: 28, currency: 'USD',
      enabled: true, thresholdPrice: 100, downsidePercent: pct, expectedVersion: 0,
      currentRawPrice: NaN, startDate: '2026-11-23',
      effectiveAt: '2026-11-23T00:00:00+08:00', createdAt: '2026-11-23T10:00:00+08:00',
      baselineSource: 'owner_threshold', holdingStartAt: openedAt,
    }, null),
    ...patch,
  };
}

function legacy(source: 'opening' | 'verified_close' = 'verified_close'): StockLotDownsideRule {
  // Undated old C(P) retains its original baseline and future-entry contract.
  return {
    ledgerId: 37, categoryId: 81, lotId: 1, userId: 28, currency: 'USD', version: 1,
    enabled: true, thresholdPrice: 100, downsidePercent: 0,
    effectiveAt: '2026-11-23T00:00:00+08:00', baselineRawPrice: 100,
    baselineCountedPrice: 100, baselineStatus: 'ready', baselineSource: source,
  };
}

function offsetInput(rules: readonly StockLotDownsideRule[] = [manual()]): Parameters<typeof stockLotDownsideMemberOffset>[0] {
  return {
    lotId: 1, participationId: 11, assignedAt, startDate: date,
    rules, epochs: [], asOf: quoteAsOf, entryRawPrice: 90,
  };
}

function stockInput(price = 90, rules: readonly StockLotDownsideRule[] = [manual()]) {
  const participation: MemberCalendarParticipation = {
    id: 11, lotId: 1, symbol: 'HOOD', startDate: date, assignedAt,
    historyStartDate: '2026-11-20', participationEffectiveDate: date,
    openedAt, physicalUnitCost: 100, entryPrice: 90, remainingQuantity: 1,
  };
  return {
    participations: [participation], closures: [],
    quotes: [{ symbol: 'HOOD', price, priceDate: quoteDate,
      capturedAt: `${quoteDate}T21:00:03Z`, source: 'unified_close_yahoo' }],
    fx: [usdFx], now, snapshotDates: [date], downsideRules: rules,
  };
}

function stockRow(data = stockInput()) {
  return buildMemberStockCalendar(data).find(row => row.snapshotDate === date)!;
}

function mixedInput(price = 90, rules: readonly StockLotDownsideRule[] = [manual()]): CryptoCalendarInput {
  const quote: CryptoCalendarQuote = {
    symbol: 'HOOD', price, currency: 'USD', priceDate: quoteDate,
    updatedAt: `${quoteDate}T21:00:03Z`, source: 'unified_close_yahoo',
  };
  return {
    categoryId: 81, snapshotDate: date, activationDate: date, now,
    // Pure persisted evidence keeps mixed activation legal without inventing a
    // crypto lot, a crypto market quote or an unnecessary USDT/FX policy leg.
    persistedActivation: {
      ledgerId: 37, categoryId: 81, policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION,
      activationDate: date, snapshotDate: date,
    },
    lots: [{ id: 1, symbol: 'HOOD', initialQuantity: 1, unitCost: 100, openingFee: null,
      openedDate: '2026-11-20', actualTradedAt: openedAt, registeredAt: openedAt }],
    sales: [], closures: [],
    participations: [{ id: 11, lotId: 1, userId: 28, allocatedQuantity: 1,
      remainingQuantity: 1, entryPrice: 90, startDate: date, pauseDate: null,
      assignedAt, updatedAt: assignedAt }],
    observations: [{ lotId: 1, userId: 99, quantity: 1, entryPrice: 90,
      startDate: date, pauseDate: null, assignedAt, updatedAt: assignedAt }],
    quotes: [quote], usdFx, usdtFx: null, downsideRules: rules,
  };
}

describe('owner_threshold carried NY close: participation scope is not price applicability', () => {
  it('fixture separates physical holding, NY close, real entry and both Beijing publication cutoffs', () => {
    expect(Date.parse(quoteAsOf)).toBe(Date.parse(`${date}T05:00:00+08:00`));
    expect(Date.parse(openedAt)).toBeLessThan(Date.parse(manual().effectiveAt));
    expect(Date.parse(quoteAsOf)).toBeLessThan(Date.parse(assignedAt));
    expect(Date.parse(assignedAt)).toBeLessThan(publicationAt.getTime());
    expect(publicationAt.getTime()).toBe(cryptoPortfolioCutoffAt(date).getTime());
    expect(publicationAt.getTime()).toBe(Date.parse(`${date}T15:05:00+08:00`));
  });

  it.each([`${date}T15:05:00+08:00`, publicationAt])('verified scope %s derives F(real entry)-entry without an entry quote or epoch', participationAsOf => {
    const input = { ...offsetInput(), participationAsOf }, before = JSON.stringify(input);
    const carry = stockLotDownsideMemberOffset(input);
    expect(carry).toBe(10);
    expect(valueStockLotDownside({ lotId: 1, quantity: 1, entryPrice: 90, rawPrice: 90,
      rules: input.rules, asOf: quoteAsOf, direction: 'counterparty', entryCountedOffset: carry }))
      .toMatchObject({ countedMarketPrice: 90, countedMarketValue: 90, countedFloatingPnl: 0 });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('omitting participation scope keeps the pre-existing future-entry zero guard', () => {
    expect(stockLotDownsideMemberOffset(offsetInput())).toBe(0);
  });

  it.each([`${date}T09:59:59+08:00`, assignedAt])('scope at/before real entry %s cannot prove participation and returns null', participationAsOf => {
    expect(stockLotDownsideMemberOffset({ ...offsetInput(), participationAsOf })).toBeNull();
  });

  it('an entry genuinely after the real publication remains pending rather than zero', () => {
    expect(stockLotDownsideMemberOffset({ ...offsetInput(), assignedAt: `${date}T15:05:01+08:00`,
      participationAsOf: publicationAt })).toBeNull();
  });

  it.each(['invalid-scope', new Date(NaN)])('invalid participation scope %s cannot fabricate an owner carry', participationAsOf => {
    expect(stockLotDownsideMemberOffset({ ...offsetInput(), participationAsOf })).toBeNull();
  });

  it.each([null, NaN, 0])('verified scope does not fabricate missing/invalid real entry %s', entryRawPrice => {
    expect(stockLotDownsideMemberOffset({ ...offsetInput(), entryRawPrice, participationAsOf: publicationAt })).toBeNull();
  });

  it.each(['opening', 'verified_close'] as const)('legacy %s preserves future-entry zero even with a later verified scope', source => {
    const input = offsetInput([legacy(source)]);
    expect(stockLotDownsideMemberOffset(input)).toBe(0);
    expect(stockLotDownsideMemberOffset({ ...input, participationAsOf: publicationAt })).toBe(0);
    expect(stockLotDownsideMemberOffset({ ...input, participationAsOf: `${date}T09:00:00+08:00` })).toBe(0);
  });

  it('a manual rule effective after quotation but before entry/scope never prices the older raw quote', () => {
    const rules = [manual(0, { effectiveAt: `${date}T06:00:00+08:00` })];
    expect(selectStockLotDownsideRule(rules, 1, quoteAsOf)).toBeNull();
    expect(selectStockLotDownsideRule(rules, 1, assignedAt)?.baselineSource).toBe('owner_threshold');
    expect(stockLotDownsideMemberOffset({ ...offsetInput(rules), participationAsOf: publicationAt })).toBe(0);
    expect(valueStockLotDownside({ lotId: 1, quantity: 1, entryPrice: 90, rawPrice: 80,
      rules, asOf: quoteAsOf, direction: 'counterparty', entryCountedOffset: 0 }))
      .toMatchObject({ countedMarketPrice: 80, countedFloatingPnl: 10, downsideRuleVersion: 0 });
  });

  it('a newer manual entry version cannot mismatch the owner version selected by the actual quotation', () => {
    const rules = [manual(20), manual(100, { version: 2, thresholdPrice: 120,
      baselineRawPrice: 120, baselineCountedPrice: 120, effectiveAt: `${date}T06:00:00+08:00` })];
    expect(selectStockLotDownsideRule(rules, 1, quoteAsOf)?.version).toBe(1);
    expect(selectStockLotDownsideRule(rules, 1, assignedAt)?.version).toBe(2);
    const carry = stockLotDownsideMemberOffset({ ...offsetInput(rules), participationAsOf: publicationAt });
    expect(carry).toBe(8); // Quote-version F1(90)=98, not entry-version F2(90)=90.
    expect(valueStockLotDownside({ lotId: 1, quantity: 1, entryPrice: 90, rawPrice: 80,
      rules, asOf: quoteAsOf, direction: 'counterparty', entryCountedOffset: carry }))
      .toMatchObject({ countedMarketPrice: 88, countedFloatingPnl: 2, downsideRuleVersion: 1 });
  });
});

describe('owner_threshold HOOD late-entry pure stock and mixed calendars', () => {
  it('independent stock-member calendar is ready at 11/25 with zero native USD and CNY market value 630', () => {
    const input = stockInput(), before = JSON.stringify(input), row = stockRow(input);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ snapshotDate: date, ready: true, status: 'ready',
      totalPnl: 0, floatingPnl: 0, marketValue: 630, costValue: 630,
      nativePnl: { USD: 0 }, usdCnyRate: 7, sourceDates: { A: date, US: quoteDate } });
    expect(row.quoteAsOf[0]).toMatchObject({ symbol: 'HOOD', priceDate: quoteDate,
      source: 'unified_close_yahoo', carried: true });
    expect(row.fxLockedAt).toBe(usdFx.lockedAt);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('mixed member and separate observer agree on ready/zero/630 using legitimate persisted activation', () => {
    const input = mixedInput(), before = JSON.stringify(input), payload = buildCryptoPortfolioDailyPayload(input);
    expect(payload.total).toMatchObject({ ready: true, totalPnl: 0, nativePnl: { USD: 0 } });
    for (const row of [payload.members['28'], payload.observations['99']]) {
      expect(row).toMatchObject({ ready: true, totalPnl: 0, floatingPnl: 0,
        nativePnl: { USD: 0 }, marketValue: 630, usdCnyRate: 7 });
      expect(row.quoteAsOf[0]).toMatchObject({ symbol: 'HOOD', priceDate: quoteDate, carried: true });
    }
    expect(payload.members['99']).toBeUndefined();
    expect(payload.quotes).toEqual(input.quotes);
    expect(payload.fx).toEqual({ usd: usdFx, usdt: null });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('20% uses the participation price difference: entry90/current80 counts 2 USD, not the physical threshold gap', () => {
    const rules = [manual(20)], row = stockRow(stockInput(80, rules));
    expect(row).toMatchObject({ ready: true, nativePnl: { USD: 2 }, totalPnl: 14, marketValue: 616 });
    const payload = buildCryptoPortfolioDailyPayload(mixedInput(80, rules));
    for (const member of [payload.members['28'], payload.observations['99']]) {
      expect(member).toMatchObject({ ready: true, nativePnl: { USD: 2 }, totalPnl: 14, marketValue: 616 });
    }
    expect(payload.total.nativePnl.USD).toBe(-4);
  });

  it('stock entry after publication is pending only in owner mode; old C(P) stays ready with its original future guard', () => {
    const input = stockInput(); input.participations[0].assignedAt = `${date}T15:05:01+08:00`;
    expect(stockRow(input)).toMatchObject({ ready: false, totalPnl: null, marketValue: null, nativePnl: { USD: null } });
    expect(stockRow({ ...input, downsideRules: [legacy()] })).toMatchObject({
      ready: true, totalPnl: -70, nativePnl: { USD: -10 }, marketValue: 700,
    });
  });

  it.each(['assignedAt', 'updatedAt'] as const)('mixed member %s after publication still throws its original timestamp guard', field => {
    const input = mixedInput();
    input.participations = input.participations.map(p => ({ ...p, [field]: `${date}T15:05:01+08:00` }));
    expect(() => buildCryptoPortfolioDailyPayload(input)).toThrow('unverifiable_allocation_history');
  });

  it.each(['assignedAt', 'updatedAt'] as const)('mixed observation %s after publication still throws its original timestamp guard', field => {
    const input = mixedInput();
    input.observations = input.observations!.map(o => ({ ...o, [field]: `${date}T15:05:01+08:00` }));
    expect(() => buildCryptoPortfolioDailyPayload(input)).toThrow('unverifiable_observation_history');
  });

  it('both calendars and observation keep quotation-before-manual raw, even though the owner rule is active by entry/publication', () => {
    const rules = [manual(0, { effectiveAt: `${date}T06:00:00+08:00` })];
    const row = stockRow(stockInput(80, rules));
    expect(row).toMatchObject({ ready: true, nativePnl: { USD: 10 }, totalPnl: 70, marketValue: 560 });
    expect(row.downsideRuleAudit).toBeUndefined();
    const payload = buildCryptoPortfolioDailyPayload(mixedInput(80, rules));
    for (const member of [payload.members['28'], payload.observations['99']]) {
      expect(member).toMatchObject({ ready: true, nativePnl: { USD: 10 }, totalPnl: 70, marketValue: 560 });
      expect(member.downsideRuleAudit).toBeUndefined();
    }
    expect(payload.total.nativePnl.USD).toBe(-20);
    expect(payload.total.downsideRuleAudit).toBeUndefined();
  });

  it('different manual versions remain quotation-matched in stock, mixed member and display-only observation', () => {
    const rules = [manual(20), manual(100, { version: 2, thresholdPrice: 120,
      baselineRawPrice: 120, baselineCountedPrice: 120, effectiveAt: `${date}T06:00:00+08:00` })];
    const row = stockRow(stockInput(80, rules));
    expect(row).toMatchObject({ ready: true, nativePnl: { USD: 2 }, totalPnl: 14, marketValue: 616 });
    expect(row.downsideRuleAudit?.[0]).toMatchObject({ lotId: 1, version: 1, rawPrice: 80, countedPrice: 88 });
    const payload = buildCryptoPortfolioDailyPayload(mixedInput(80, rules));
    for (const member of [payload.members['28'], payload.observations['99']]) {
      expect(member).toMatchObject({ ready: true, nativePnl: { USD: 2 }, totalPnl: 14, marketValue: 616 });
      expect(member.downsideRuleAudit?.[0]).toMatchObject({ lotId: 1, version: 1, rawPrice: 80, countedPrice: 88 });
    }
  });

  it('same late input under the old source remains byte-identical across both legacy sources, with no manual carry', () => {
    const opening = [legacy('opening')], verified = [legacy('verified_close')];
    const a = stockRow(stockInput(90, opening)), b = stockRow(stockInput(90, verified));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a).toMatchObject({ ready: true, nativePnl: { USD: -10 }, totalPnl: -70, marketValue: 700 });
    const x = buildCryptoPortfolioDailyPayload(mixedInput(90, opening));
    const y = buildCryptoPortfolioDailyPayload(mixedInput(90, verified));
    expect(JSON.stringify(x)).toBe(JSON.stringify(y));
    for (const member of [x.members['28'], x.observations['99']]) {
      expect(member).toMatchObject({ ready: true, nativePnl: { USD: -10 }, totalPnl: -70, marketValue: 700 });
    }
  });
});
