import { describe, expect, it } from 'vitest';
import {
  countedStockLotPrice as counted,
  createStockLotDownsideVersion as create,
  latestStockLotDownsideRule as latest,
  resolveStockLotDownsideHistoricalRules as resolve,
  selectStockLotDownsideRule as select,
  stockLotDownsideEffectiveAt as effectiveAt,
  stockLotDownsideMemberOffset as offset,
  valueStockLotDownside as value,
  type StockLotDownsideHistoricalLot,
  type StockLotDownsideHistoricalQuote,
  type StockLotDownsideMemberEpoch,
  type StockLotDownsideRule,
} from '../shared/stock-lot-downside';
import { buildStockTotalCalendar } from './shared/stock-total-calendar';
import { buildMemberStockCalendar } from './shared/stock-member-calendar';

const now = new Date('2026-11-25T14:00:00Z');
const settings: Parameters<typeof create>[0] = {
  ledgerId: 37, categoryId: 90250, lotId: 1, userId: 7, currency: 'USD', enabled: true,
  thresholdPrice: 74.23, downsidePercent: 0, expectedVersion: 0, currentRawPrice: NaN,
  startDate: '2026-11-16', effectiveAt: effectiveAt('2026-11-16'), createdAt: now.toISOString(),
  baselineSource: 'owner_threshold',
};
const manual = (patch: Partial<typeof settings> = {}, previous: StockLotDownsideRule | null = null) =>
  create({ ...settings, expectedVersion: previous?.version ?? 0, ...patch }, previous);
const hoodLot: StockLotDownsideHistoricalLot = {
  lotId: 1, symbol: 'HOOD', openedAt: '2026-11-15T10:00:00+08:00', unitCost: 74.58,
};
const ready = (rules: readonly StockLotDownsideRule[], quotes: readonly StockLotDownsideHistoricalQuote[] = [],
  lots: readonly StockLotDownsideHistoricalLot[] = [hoodLot]) => resolve({ rules, quotes, lots, now });
const historical = (price: number): StockLotDownsideHistoricalQuote => ({
  symbol: 'HOOD', price, priceDate: '2026-11-13', quoteAsOf: '2026-11-13T21:05:00Z', verified: true,
});
const legacy = (patch: Partial<StockLotDownsideRule> = {}): StockLotDownsideRule => ({
  ledgerId: 37, categoryId: 90250, lotId: 1, userId: 7, currency: 'USD', version: 1, enabled: true,
  thresholdPrice: 100, downsidePercent: 20, effectiveAt: '2026-11-14T16:00:00Z',
  baselineRawPrice: 90, baselineCountedPrice: 98, baselineStatus: 'ready', ...patch,
});

function freezeDeep<T>(input: T): T {
  if (input && typeof input === 'object') {
    Object.values(input).forEach(freezeDeep);
    Object.freeze(input);
  }
  return input;
}

describe('owner_threshold: native manual basis and stateless F(P)', () => {
  it('HOOD 11/15 entry 74.58, K=74.23 r=0 from 11/16 counts current 65.82 as 74.23 without history', () => {
    const rule = ready([manual()])[0];
    expect(rule).toMatchObject({ baselineSource: 'owner_threshold', baselineRawPrice: 74.23,
      baselineCountedPrice: 74.23, baselineStatus: 'ready', holdingStartAt: hoodLot.openedAt });
    expect(rule.quoteAsOf).toBeUndefined();
    expect(counted(65.82, rule)).toBe(74.23);
    const result = value({ lotId: 1, quantity: 10, entryPrice: hoodLot.unitCost, rawPrice: 65.82,
      rules: [rule], asOf: now, entryAt: hoodLot.openedAt });
    expect(result.countedMarketPrice).toBe(74.23);
    expect(result.countedFloatingPnl).toBeCloseTo((74.23 - 74.58) * 10);
  });
  it.each([[0, 100], [20, 98], [100, 90]])('r=%s%% counts raw 90 as %s with K=100', (ratio, expected) => {
    const rule = manual({ thresholdPrice: 100, downsidePercent: ratio });
    expect(counted(90, rule)).toBe(expected);
    expect(counted(100, rule)).toBe(100);
    expect(counted(110, rule)).toBe(110);
  });
  it('repeated down/up crossings do not accumulate or inherit carry', () => {
    const rule = manual({ thresholdPrice: 100, downsidePercent: 20, currentRawPrice: 20 });
    expect([110, 90, 105, 80, 100, 110, 90].map(price => counted(price, rule)))
      .toEqual([110, 98, 105, 96, 100, 110, 98]);
    expect(rule.baselineRawPrice).toBe(100);
  });
  it.each([NaN, Infinity, -1, 0, 65.82, 120])('saving below threshold needs no external currentRawPrice (%s)', currentRawPrice => {
    const rule = manual({ currentRawPrice, baselineStatus: 'pending', quoteAsOf: 'untrusted quote timestamp' });
    expect(rule).toMatchObject({ baselineRawPrice: 74.23, baselineCountedPrice: 74.23, baselineStatus: 'ready' });
    expect(rule.quoteAsOf).toBeUndefined();
  });
  it.each(['CNY', 'USD', 'USDT'] as const)('manual prices stay native in %s without FX rescaling', currency => {
    const rule = manual({ currency });
    expect(counted(65.82, rule)).toBe(74.23);
    expect(rule.currency).toBe(currency);
  });
  it.each([null, NaN, Infinity, -1, 0])('manual basis cannot replace missing or invalid current price %s', price => {
    expect(counted(price, manual())).toBeNull();
    expect(value({ lotId: 1, quantity: 10, entryPrice: 74.58, rawPrice: price,
      rules: [manual()], asOf: now }).countedMarketValue).toBeNull();
  });
});

describe('owner_threshold: dates, holding evidence and immutable historical resolver', () => {
  it('date selects applicability only; before start remains raw', () => {
    const rules = ready([manual()]);
    const before = '2026-11-15T23:59:59+08:00';
    expect(select(rules, 1, before)).toBeNull();
    expect(value({ lotId: 1, quantity: 10, entryPrice: 74.58, rawPrice: 65.82, rules, asOf: before })
      .countedMarketPrice).toBe(65.82);
    expect(select(rules, 1, '2026-11-16T00:00:00+08:00')?.baselineSource).toBe('owner_threshold');
  });
  it('future manual basis is ready now but inactive until its date', () => {
    const first = manual();
    const future = manual({ startDate: '2026-12-01', thresholdPrice: 80 }, first);
    const rules = ready([first, future]);
    expect(rules[1]).toMatchObject({ baselineStatus: 'ready', baselineRawPrice: 80, baselineCountedPrice: 80 });
    expect(latest(rules, 1)?.version).toBe(2);
    expect(select(rules, 1, now)?.version).toBe(1);
    expect(select(rules, 1, '2026-12-01T00:00:00+08:00')?.version).toBe(2);
    expect(counted(65.82, rules[1])).toBe(80);
  });
  it('a manual date before opening never applies before the actual holding instant', () => {
    const rule = ready([manual({ startDate: '2026-11-10', holdingStartAt: '2020-01-01T00:00:00Z' })])[0];
    expect(rule.holdingStartAt).toBe(hoodLot.openedAt);
    expect(select([rule], 1, '2026-11-15T09:59:59+08:00')).toBeNull();
    expect(select([rule], 1, hoodLot.openedAt)).toBe(rule);
  });
  it.each([{ lots: [] }, { lots: [{ ...hoodLot, openedAt: 'invalid' }] },
    { lots: [{ ...hoodLot, openedAt: '2026-12-01T00:00:00Z' }] }])
    ('missing, invalid or future actual holding evidence fails closed (%j)', ({ lots }) => {
      const original = manual({ holdingStartAt: '2020-01-01T00:00:00Z' });
      const rule = ready([original], [], lots)[0];
      expect(rule.baselineStatus).toBe('pending');
      expect(counted(65.82, select([rule], 1, now))).toBeNull();
      expect(rule.baselineRawPrice).toBe(74.23);
      expect(rule.baselineCountedPrice).toBe(74.23);
      expect(original.baselineStatus).toBe('ready');
    });
  it('different or conflicting historical prices never overwrite a manual K basis', () => {
    const proofs = [historical(69), historical(70), { ...historical(100), verified: false }];
    const rule = ready([manual()], proofs)[0];
    expect(rule.baselineRawPrice).toBe(74.23);
    expect(rule.baselineCountedPrice).toBe(74.23);
    expect(rule.baselineStatus).toBe('ready');
    expect(rule.quoteAsOf).toBeUndefined();
    expect(counted(65.82, rule)).toBe(74.23);
  });
  it('resolver never even reads external quote properties for all-manual rules', () => {
    const quotes = [{ get symbol(): string { throw new Error('manual basis attempted historical quote lookup'); } }] as StockLotDownsideHistoricalQuote[];
    expect(ready([manual()], quotes)[0].baselineStatus).toBe('ready');
  });
  it('resolver returns fresh objects and preserves all rule, lot, quote and FX evidence', () => {
    const rules = freezeDeep([manual({ quoteAsOf: 'preserve stored metadata, do not fabricate proof' })]);
    const lots = freezeDeep([hoodLot]);
    const quotes = freezeDeep([historical(69), historical(70)]);
    const fx = freezeDeep([{ snapshotDate: '2026-11-25', usdCnyRate: 7.2, source: 'fixed historical' }]);
    const before = JSON.stringify({ rules, lots, quotes, fx });
    const resolved = resolve({ rules, lots, quotes, now });
    expect(resolved[0]).not.toBe(rules[0]);
    expect(resolved[0].quoteAsOf).toBe(rules[0].quoteAsOf);
    expect(JSON.stringify({ rules, lots, quotes, fx })).toBe(before);
  });
});

describe('owner_threshold: new versions, validation and unchanged old C(P)', () => {
  it.each(['opening', 'verified_close', undefined] as const)('old source %s retains historical carry formula exactly', baselineSource => {
    const old = legacy({ baselineSource });
    expect(counted(90, old)).toBe(98);
    expect(counted(80, old)).toBe(96);
    expect(counted(110, old)).toBe(110);
    const disabled = { ...old, enabled: false };
    expect(counted(80, disabled)).toBe(88);
  });
  it('old below-threshold activation and nonzero carry are not silently replaced with manual F(P)', () => {
    const old = legacy({ baselineCountedPrice: 90, baselineSource: 'verified_close' });
    expect(counted(90, old)).toBe(90);
    expect(counted(80, old)).toBe(88);
    expect(counted(110, old)).toBe(102);
    expect(counted(80, manual({ thresholdPrice: 100, downsidePercent: 20 }))).toBe(96);
  });
  it.each(['opening', 'verified_close', undefined] as const)('old pending source %s stays pending and is not auto-converted', baselineSource => {
    const old = legacy({ baselineSource, baselineStatus: 'pending', baselineRawPrice: NaN, baselineCountedPrice: NaN });
    const resolved = ready([old])[0];
    expect(resolved).toEqual(old);
    expect(resolved.baselineSource).toBe(baselineSource);
    expect(counted(65.82, resolved)).toBeNull();
  });
  it('old dated rule remains pending without verified history, even when manual follows it', () => {
    const old = legacy({ startDate: '2026-11-16', effectiveAt: effectiveAt('2026-11-16'), baselineSource: 'verified_close' });
    const next = manual({ startDate: '2026-11-23' }, old);
    const rules = ready([old, next]);
    expect(rules[0].baselineStatus).toBe('pending');
    expect(rules[0].baselineSource).toBe('verified_close');
    expect(counted(65.82, select(rules, 1, '2026-11-20T12:00:00+08:00'))).toBeNull();
    expect(rules[1].baselineStatus).toBe('ready');
    expect(counted(65.82, select(rules, 1, now))).toBe(74.23);
  });
  it('explicit manual source never inherits old rule carry, including an explicit pending beforeStartRule', () => {
    const old = legacy();
    const pending = legacy({ baselineStatus: 'pending', baselineRawPrice: NaN, baselineCountedPrice: NaN });
    const next = manual({ currentRawPrice: 80, beforeStartRule: pending }, old);
    expect(next).toMatchObject({ version: 2, baselineSource: 'owner_threshold', baselineRawPrice: 74.23,
      baselineCountedPrice: 74.23, baselineStatus: 'ready' });
    const rules = ready([old, next]);
    expect(select(rules, 1, '2026-11-15T12:00:00+08:00')?.version).toBe(1);
    expect(counted(80, select(rules, 1, '2026-11-15T12:00:00+08:00'))).toBe(96);
    expect(counted(80, select(rules, 1, now))).toBe(80);
    expect(old.baselineCountedPrice).toBe(98);
  });
  it('disabling returns raw; reenabling and changing threshold/date establish fresh K with no carry', () => {
    const first = manual();
    const off = manual({ enabled: false, startDate: '2026-11-20', currentRawPrice: 60 }, first);
    const on = manual({ startDate: '2026-11-23', thresholdPrice: 80, downsidePercent: 20, currentRawPrice: 50 }, off);
    const rules = ready([first, off, on]);
    expect(counted(60, select(rules, 1, '2026-11-19T12:00:00+08:00'))).toBe(74.23);
    expect(counted(60, select(rules, 1, '2026-11-20T12:00:00+08:00'))).toBe(60);
    expect(off.baselineRawPrice).toBe(74.23);
    expect(off.baselineCountedPrice).toBe(74.23);
    expect(on.baselineRawPrice).toBe(80);
    expect(on.baselineCountedPrice).toBe(80);
    expect(counted(50, select(rules, 1, now))).toBe(74);
  });
  it('retroactive manual date revisions are allowed and latest saved revision wins', () => {
    const first = manual({ startDate: '2026-11-23' });
    const revision = manual({ startDate: '2026-11-16', thresholdPrice: 80 }, first);
    const rules = ready([first, revision]);
    expect(select(rules, 1, '2026-11-17T12:00:00+08:00')?.version).toBe(2);
    expect(select(rules, 1, now)?.version).toBe(2);
    expect(counted(65.82, rules[1])).toBe(80);
  });
  it.each([-1, 0, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('CAS refuses invalid or stale expectedVersion %s', expectedVersion => {
    expect(() => manual({ expectedVersion }, manual())).toThrow('版本冲突');
  });
  it('CAS uses latest saved future revision, not the currently active version', () => {
    const first = manual();
    const future = manual({ startDate: '2026-12-01' }, first);
    expect(() => manual({ expectedVersion: 1 }, future)).toThrow('版本冲突');
    expect(manual({ startDate: '2026-11-23' }, future).version).toBe(3);
  });
  it.each([0, -1, NaN, Infinity])('saving invalid threshold %s remains rejected', thresholdPrice => {
    expect(() => manual({ thresholdPrice })).toThrow('价格门槛');
  });
  it('first manual rule cannot invent a threshold from a current market quote', () => {
    expect(() => manual({ thresholdPrice: undefined, currentRawPrice: 74.58 })).toThrow('价格门槛');
  });
  it.each([-1, 101, NaN, Infinity])('saving invalid ratio %s remains rejected', downsidePercent => {
    expect(() => manual({ downsidePercent })).toThrow('比例');
  });
  it.each(['2026-02-30', '2026-13-01', '2026-1-01', ''])('saving invalid business date %s remains rejected', startDate => {
    expect(() => manual({ startDate })).toThrow('启用日期');
  });
  it('audit timestamp validation and boolean validation are not bypassed by manual source', () => {
    expect(() => manual({ createdAt: 'invalid' })).toThrow();
    expect(() => manual({ enabled: 1 as unknown as boolean })).toThrow('布尔值');
  });
  it.each([
    { baselineRawPrice: NaN }, { baselineRawPrice: Infinity }, { baselineRawPrice: 0 },
    { baselineRawPrice: -1 }, { baselineRawPrice: 74.58 }, { baselineCountedPrice: NaN },
    { baselineCountedPrice: Infinity }, { baselineCountedPrice: 0 }, { baselineCountedPrice: 74.58 },
    { thresholdPrice: NaN }, { thresholdPrice: 0 }, { downsidePercent: 101 },
    { downsidePercent: NaN }, { baselineStatus: 'pending' as const }, { baselineStatus: undefined },
  ])('persisted damaged manual basis fails closed, never repaired (%j)', patch => {
    const damaged = { ...manual(), ...patch };
    expect(counted(65.82, damaged)).toBeNull();
    const resolved = ready([damaged], [historical(74.23)])[0];
    expect(resolved.baselineStatus).toBe('pending');
    expect(resolved.baselineRawPrice).toBe(damaged.baselineRawPrice);
    expect(resolved.baselineCountedPrice).toBe(damaged.baselineCountedPrice);
    expect(counted(65.82, resolved)).toBeNull();
    expect(damaged.baselineStatus).toBe(patch.baselineStatus ?? (Object.hasOwn(patch, 'baselineStatus') ? undefined : 'ready'));
  });
  it('disabled corrupt manual basis remains pending rather than laundering damaged data into raw', () => {
    expect(counted(65.82, { ...manual({ enabled: false }), baselineCountedPrice: 99 })).toBeNull();
  });
});

const entryAt = '2026-11-24T10:00:00+08:00';
const participation = {
  lotId: 1, participationId: 7, assignedAt: entryAt, startDate: '2026-11-24',
  rules: ready([manual()]), epochs: [] as StockLotDownsideMemberEpoch[], asOf: now,
};
const epoch = (patch: Partial<StockLotDownsideMemberEpoch> = {}): StockLotDownsideMemberEpoch => ({
  ledgerId: 37, categoryId: 90250, lotId: 1, participationId: 7, userId: 8, effectiveAt: entryAt,
  rawPrice: 70, countedPrice: 1, entryCountedOffset: -999, ruleVersion: 1, ...patch,
});
describe('owner_threshold: actual personal participation price, not fabricated quote proof', () => {
  it('late entry without historical quote computes F(real entry)-entry and preserves zero initial PnL', () => {
    const carry = offset({ ...participation, entryRawPrice: 65.82 });
    expect(carry).toBeCloseTo(74.23 - 65.82);
    expect(carry).not.toBe(0);
    expect(value({ lotId: 1, quantity: 2, entryPrice: 65.82, rawPrice: 65.82,
      rules: participation.rules, asOf: now, direction: 'counterparty', entryCountedOffset: carry })
      .countedFloatingPnl).toBeCloseTo(0);
  });
  it.each([0, 20, 100])('late entry r=%s%% follows actual entry and current price difference consistently', downsidePercent => {
    const rules = ready([manual({ thresholdPrice: 100, downsidePercent })]);
    const carry = offset({ ...participation, rules, entryRawPrice: 90 });
    expect(carry).toBeCloseTo(100 + (90 - 100) * downsidePercent / 100 - 90);
    const result = value({ lotId: 1, quantity: 2, entryPrice: 90, rawPrice: 80,
      rules, asOf: now, direction: 'counterparty', entryCountedOffset: carry });
    expect(result.countedFloatingPnl).toBeCloseTo((90 - 80) * downsidePercent / 100 * 2);
  });
  it('explicit participation entry price wins over old epoch raw and never mutates epoch metadata', () => {
    const proof = freezeDeep(epoch());
    expect(offset({ ...participation, epochs: [proof], entryRawPrice: 65.82 })).toBeCloseTo(74.23 - 65.82);
    expect(proof.rawPrice).toBe(70);
    expect(proof.entryCountedOffset).toBe(-999);
  });
  it('missing explicit entry may use exact matching epoch raw, but not its stale counted/offset values', () => {
    expect(offset({ ...participation, epochs: [epoch()] })).toBeCloseTo(74.23 - 70);
  });
  it.each([
    { lotId: 2 }, { participationId: 8 }, { effectiveAt: '2026-11-24T09:59:59+08:00' },
    { effectiveAt: '2026-11-24T10:00:01+08:00' }, { effectiveAt: '2026-11-26T10:00:00+08:00' },
  ])('no explicit entry and nonexact/out-of-scope epoch stays pending (%j)', patch => {
    expect(offset({ ...participation, epochs: [epoch(patch)] })).toBeNull();
  });
  it.each([undefined, null, NaN, Infinity, 0, -1])('missing or invalid actual participation price %s stays pending, not zero', entryRawPrice => {
    expect(offset({ ...participation, entryRawPrice })).toBeNull();
  });
  it('invalid explicit entry does not fall back to otherwise valid epoch', () => {
    expect(offset({ ...participation, entryRawPrice: NaN, epochs: [epoch()] })).toBeNull();
  });
  it('manual business entry does not require or validate an external entryQuoteAsOf', () => {
    expect(offset({ ...participation, entryRawPrice: 65.82, entryQuoteAsOf: 'not external historical proof' }))
      .toBeCloseTo(74.23 - 65.82);
  });
  it('entry before rule date retains no offset; future entry remains outside current participation scope', () => {
    expect(offset({ ...participation, assignedAt: hoodLot.openedAt, startDate: '2026-11-15', entryRawPrice: 65.82 })).toBe(0);
    expect(offset({ ...participation, assignedAt: '2026-12-01T10:00:00+08:00', startDate: '2026-12-01', entryRawPrice: 65.82 })).toBe(0);
  });
  it('invalid assignment or business date never invents a zero entry continuity offset', () => {
    expect(offset({ ...participation, assignedAt: 'invalid', entryRawPrice: 65.82 })).toBeNull();
    expect(offset({ ...participation, startDate: 'invalid', entryRawPrice: 65.82 })).toBeNull();
  });
  it('old dated quote-based rules still require external entry quote evidence without an epoch', () => {
    const rules = [legacy({ startDate: '2026-11-16', baselineSource: 'verified_close' })];
    expect(offset({ ...participation, rules, entryRawPrice: 90 })).toBeNull();
    expect(offset({ ...participation, rules, entryRawPrice: 90, entryQuoteAsOf: '2026-11-24T09:00:00+08:00' })).toBe(8);
  });
  it('pending manual basis does not disguise missing evidence as zero entry offset', () => {
    const rules = [{ ...manual(), baselineStatus: 'pending' as const }];
    expect(offset({ ...participation, rules, entryRawPrice: 65.82 })).toBeNull();
  });
});

const cnQuote = (date: string, price: number) => ({ symbol: '600000.SH', price, priceDate: date,
  capturedAt: `${date}T15:05:00+08:00`, source: 'unified_close_tushare' });
const cnLot = { id: 1, symbol: '600000.SH', initialQuantity: 10, unitCost: 74.58, openingFee: null,
  openedDate: '2026-11-20', openedAt: '2026-11-20T10:00:00+08:00' };
const cnRule = manual({ currency: 'CNY', startDate: '2026-11-23' });
const cnCalendar = { lots: [cnLot], sales: [], quotes: [cnQuote('2026-11-20', 74.58), cnQuote('2026-11-23', 65.82),
  cnQuote('2026-11-24', 60), cnQuote('2026-11-25', 80)], fx: [], now, downsideRules: [cnRule] };

describe('owner_threshold: pure derived total/personal calendar and locked FX regression', () => {
  it('global calendar uses manual K, leaves before-date row unchanged, and can recover above threshold', () => {
    const before = JSON.stringify(cnCalendar);
    const raw = buildStockTotalCalendar({ ...cnCalendar, downsideRules: [] });
    const result = buildStockTotalCalendar(cnCalendar);
    expect(result.find(row => row.snapshotDate === '2026-11-20')).toEqual(raw.find(row => row.snapshotDate === '2026-11-20'));
    for (const date of ['2026-11-23', '2026-11-24']) {
      const row = result.find(row => row.snapshotDate === date)!;
      expect(row.ready).toBe(true);
      expect(row.totalPnl).toBeCloseTo((74.23 - 74.58) * 10);
      expect(row.downsideRuleAudit?.[0]).toMatchObject({ rawPrice: date === '2026-11-23' ? 65.82 : 60, countedPrice: 74.23 });
    }
    expect(result.find(row => row.snapshotDate === '2026-11-25')?.totalPnl).toBeCloseTo((80 - 74.58) * 10);
    expect(result.find(row => row.snapshotDate === '2026-11-24')?.dailyPnl).toBeCloseTo(0);
    expect(JSON.stringify(cnCalendar)).toBe(before);
  });
  it('manual baseline does not make a missing actual daily close ready', () => {
    const result = buildStockTotalCalendar({ ...cnCalendar, quotes: [], snapshotDates: ['2026-11-24'] });
    const row = result.find(row => row.snapshotDate === '2026-11-24')!;
    expect(row.ready).toBe(false);
    expect(row.totalPnl).toBeNull();
    expect(row.missingSymbols).toContain('600000.SH');
  });
  it('partial sale uses F(executed raw), while price and fees remain unchanged', () => {
    const sale = { lotId: 1, quantity: 5, eventQuantity: 5, salePrice: 65.82, countedSalePrice: 10,
      transactionFee: 5, closeDate: '2026-11-23', actualAt: '2026-11-23T14:00:00+08:00' };
    const input = { ...cnCalendar, lots: [{ ...cnLot, openingFee: 10 }], sales: [sale] };
    const before = JSON.stringify(input);
    const row = buildStockTotalCalendar(input).find(row => row.snapshotDate === '2026-11-24')!;
    expect(row.realizedPnl).toBeCloseTo((74.23 - 74.58) * 5 - 5 - 10 / 10 * 5);
    expect(row.floatingPnl).toBeCloseTo((74.23 - 74.58) * 5);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('late personal calendar accepts actual configured participation entry without historical entry quote', () => {
    const p = { id: 7, lotId: 1, symbol: '600000.SH', startDate: '2026-11-24', assignedAt: entryAt,
      remainingQuantity: 2, entryPrice: 65.82, openedAt: cnLot.openedAt, physicalUnitCost: cnLot.unitCost };
    const quotes = [cnQuote('2026-11-24', 65.82), cnQuote('2026-11-25', 60)];
    const input = { participations: [p], closures: [], quotes, fx: [], now, downsideRules: [cnRule] };
    const before = JSON.stringify(input);
    const result = buildMemberStockCalendar(input);
    expect(result.find(row => row.snapshotDate === '2026-11-24')?.ready).toBe(true);
    expect(result.find(row => row.snapshotDate === '2026-11-24')?.totalPnl).toBeCloseTo(0);
    expect(result.find(row => row.snapshotDate === '2026-11-25')?.totalPnl).toBeCloseTo(0);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('personal calendar missing or invalid actual participation entry remains pending', () => {
    const result = buildMemberStockCalendar({ participations: [{ id: 7, lotId: 1, symbol: '600000.SH',
      startDate: '2026-11-24', assignedAt: entryAt, remainingQuantity: 2, entryPrice: NaN,
      openedAt: cnLot.openedAt, physicalUnitCost: cnLot.unitCost }], closures: [],
      quotes: [cnQuote('2026-11-24', 65.82)], fx: [], now, downsideRules: [cnRule] });
    const row = result.find(row => row.snapshotDate === '2026-11-24')!;
    expect(row.ready).toBe(false);
    expect(row.totalPnl).toBeNull();
  });
  it('manual USD valuation requires current close and exact-day locked FX, not an activation quote', () => {
    const quotes = [{ symbol: 'HOOD', price: 65.82, priceDate: '2026-11-24',
      capturedAt: '2026-11-24T21:05:00Z', source: 'unified_close_yahoo' }];
    const fx = [{ snapshotDate: '2026-11-25', usdCnyRate: 7.2, source: 'locked_historical',
      asOf: '2026-11-25T15:00:00+08:00', lockedAt: '2026-11-25T15:05:00+08:00' }];
    const input = { lots: [{ id: 1, symbol: 'HOOD', initialQuantity: 10, unitCost: 74.58, openingFee: null,
      openedDate: '2026-11-13', openedAt: hoodLot.openedAt }], sales: [], quotes, fx, now,
      snapshotDates: ['2026-11-25'], downsideRules: [manual()] };
    const before = JSON.stringify(input);
    const row = buildStockTotalCalendar(input).find(row => row.snapshotDate === '2026-11-25')!;
    expect(row.ready).toBe(true);
    expect(row.nativePnl.USD).toBeCloseTo((74.23 - 74.58) * 10);
    expect(row.totalPnl).toBeCloseTo((74.23 - 74.58) * 10 * 7.2);
    expect(row.usdCnyRate).toBe(7.2);
    expect(row.fxSource).toBe('locked_historical');
    expect(row.fxAsOf).toBe(fx[0].asOf);
    expect(row.fxLockedAt).toBe(fx[0].lockedAt);
    expect(row.quoteAsOf[0]).toMatchObject({ symbol: 'HOOD', priceDate: '2026-11-24', capturedAt: quotes[0].capturedAt });
    expect(JSON.stringify(input)).toBe(before);
    expect(buildStockTotalCalendar({ ...input, fx: [] }).find(row => row.snapshotDate === '2026-11-25')?.totalPnl).toBeNull();
  });
});
