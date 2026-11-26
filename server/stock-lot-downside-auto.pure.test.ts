import { describe, expect, it } from 'vitest';
import {
  countedStockLotPrice as counted,
  createStockLotDownsideVersion as create,
  isStockLotDownsideAutoRuleValid as valid,
  isStockLotDownsideAutoWaiting as waiting,
  resolveStockLotDownsideHistoricalRules as resolve,
  selectStockLotDownsideRule as select,
  stockLotDownsideAutoThreshold as threshold,
  stockLotDownsideMemberOffset as offset,
  validateStockLotDownsideAutoDropPercent as validateDrop,
  valueStockLotDownside as value,
  type StockLotDownsideHistoricalQuote,
  type StockLotDownsideMemberEpoch,
  type StockLotDownsideRule,
} from '../shared/stock-lot-downside';
import { stockUserCountedSalePrice as sale, stockUserDownsideRules } from './shared/stock-user-tag-downside';
import type { UserTagDownsideOverride } from '../shared/user-tag-downside-override';

// These tests execute only pure modules. No portfolio/router/index/store imports,
// DB connection, network, scanner, timer or real save is needed.
const armedAt = '2026-11-26T01:45:12.123Z';
const triggeredAt = '2026-11-26T02:30:45.789Z';
const observedAt = '2026-11-26T02:30:44.456Z';
const beforeTrigger = '2026-11-26T02:30:45.788Z';
const openedAt = '2026-11-20T02:00:00.000Z';
const now = new Date('2026-11-26T08:00:00.000Z');
const settings: Parameters<typeof create>[0] = {
  ledgerId: 37, categoryId: 81, lotId: 1, userId: 28, currency: 'USD', enabled: true,
  activationMode: 'auto_drop', autoEntryPrice: 100, autoDropPercent: 10,
  expectedVersion: 0, currentRawPrice: NaN, effectiveAt: armedAt,
};
function preset(patch: Partial<typeof settings> = {}, previous: StockLotDownsideRule | null = null) {
  return create({ ...settings, expectedVersion: previous?.version ?? 0, ...patch }, previous);
}
function trigger(previous = preset(), patch: Partial<typeof settings> = {}) {
  return preset({ autoEntryPrice: previous.autoEntryPrice, autoDropPercent: previous.autoDropPercent,
    armedAt: previous.armedAt, effectiveAt: triggeredAt, triggeredAt,
    triggerPrice: previous.thresholdPrice, triggerQuoteAsOf: observedAt, triggerSource: 'actual_intraday_feed',
    ...patch }, previous);
}
function manual() {
  return create({ ledgerId: 37, categoryId: 81, lotId: 1, userId: 28, currency: 'USD', enabled: true,
    thresholdPrice: 120, downsidePercent: 20, expectedVersion: 0, currentRawPrice: NaN,
    effectiveAt: '2026-11-24T02:00:00.000Z', startDate: '2026-11-24',
    createdAt: '2026-11-24T02:00:00.000Z', baselineSource: 'owner_threshold' }, null);
}
function freeze<T>(input: T): T {
  if (input && typeof input === 'object') {
    Object.values(input).forEach(freeze);
    Object.freeze(input);
  }
  return input;
}
const historicalLot = { lotId: 1, symbol: 'HOOD', openedAt, unitCost: 100 };
const historical = (rules: readonly StockLotDownsideRule[], patch = {}) => resolve({
  rules, lots: [historicalLot], quotes: [], now, ...patch,
});
const entryInput = (rules: readonly StockLotDownsideRule[], assignedAt = '2026-11-26T03:00:00.000Z') => ({
  lotId: 1, participationId: 17, assignedAt, startDate: '2026-11-26', rules,
  epochs: [] as StockLotDownsideMemberEpoch[], asOf: now, entryRawPrice: 80,
});
const epoch = (patch: Partial<StockLotDownsideMemberEpoch> = {}): StockLotDownsideMemberEpoch => ({
  ledgerId: 37, categoryId: 81, lotId: 1, participationId: 17, userId: 99,
  effectiveAt: '2026-11-26T03:00:00.000Z', rawPrice: 80,
  countedPrice: 999, entryCountedOffset: -999, ruleVersion: 1, ...patch,
});

describe('auto_drop adjustable native threshold and exact server-confirmed constructor', () => {
  it.each([[100, 5, 95], [100, 10, 90], [100, 25, 75], [74.58, 10, 67.122],
    [1.234567890123, 12.345, 1.082160484087], [100, 99.99, 0.01]])(
    'entry %s, drop %s%% derives DECIMAL(30,12) threshold %s', (entry, drop, expected) => {
      expect(threshold(entry, drop)).toBe(expected);
      const rule = preset({ autoEntryPrice: entry, autoDropPercent: drop });
      expect(rule).toMatchObject({ thresholdPrice: expected, downsidePercent: 0,
        baselineSource: 'owner_threshold', baselineStatus: 'ready',
        baselineRawPrice: expected, baselineCountedPrice: expected });
      expect(valid(rule)).toBe(true);
    });
  it.each([undefined, null, NaN, Infinity, 0, -1, 100, 101])('drop %s must be strictly between 0 and 100', drop => {
    expect(() => threshold(100, drop as number)).toThrow();
    expect(() => preset({ autoDropPercent: drop as number })).toThrow();
  });
  it.each([0.1, 12.3456789, 99.99999999, 1e-8])('drop %s survives DECIMAL(12,8) roundtrip without changing intent', drop => {
    expect(() => validateDrop(drop)).not.toThrow();
    const wait = preset({ autoDropPercent: drop }), hit = trigger(wait);
    // Simulate decimal serialization/read-back only; never connect to a real database.
    const roundtrip = (rule: StockLotDownsideRule): StockLotDownsideRule => ({ ...rule,
      autoDropPercent: Number(rule.autoDropPercent!.toFixed(8)),
      autoEntryPrice: Number(rule.autoEntryPrice!.toFixed(12)),
      thresholdPrice: Number(rule.thresholdPrice.toFixed(12)),
      baselineRawPrice: Number(rule.baselineRawPrice.toFixed(12)),
      baselineCountedPrice: Number(rule.baselineCountedPrice.toFixed(12)),
      ...(rule.triggerPrice === undefined ? {} : { triggerPrice: Number(rule.triggerPrice.toFixed(12)) }),
    });
    for (const rule of [wait, hit]) {
      const stored = roundtrip(rule);
      expect(stored.autoDropPercent).toBe(drop);
      expect(stored.thresholdPrice).toBe(threshold(100, drop));
      expect(valid(stored)).toBe(true);
      expect(waiting(stored)).toBe(rule === wait);
    }
  });
  it.each([12.345678901, 1e-9])('in-range drop %s is rejected explicitly, never rounded to a supported value', drop => {
    expect(drop).toBeGreaterThan(0);
    expect(drop).toBeLessThan(100);
    expect(() => validateDrop(drop)).toThrow('最多支持8位小数');
    expect(() => threshold(100, drop)).toThrow('最多支持8位小数');
    expect(() => preset({ autoDropPercent: drop })).toThrow('最多支持8位小数');
    expect(() => preset({ autoDropPercent: drop, enabled: false })).toThrow('最多支持8位小数');
    const unsupportedThreshold = Number((100 * (1 - drop / 100)).toFixed(12));
    const damaged = { ...preset(), autoDropPercent: drop, thresholdPrice: unsupportedThreshold,
      baselineRawPrice: unsupportedThreshold, baselineCountedPrice: unsupportedThreshold };
    expect(valid(damaged)).toBe(false);
    expect(waiting(damaged)).toBe(false);
    expect(counted(70, damaged)).toBeNull();
  });
  it.each([undefined, null, NaN, Infinity, 0, -1])('buy basis %s cannot be fabricated from current price', entry => {
    expect(() => threshold(entry as number, 10)).toThrow();
    expect(() => preset({ autoEntryPrice: entry as number, currentRawPrice: 100 })).toThrow();
  });
  it('rejects a threshold that rounds to zero rather than accepting a meaningless floor', () => {
    expect(() => threshold(1e-14, 10)).toThrow();
  });
  it.each(['CNY', 'USD', 'USDT'] as const)('native %s waiting remains raw and triggered uses the same floor, without FX', currency => {
    const wait = preset({ currency });
    expect(counted(70, wait)).toBe(70);
    expect(counted(70, trigger(wait))).toBe(90);
  });
  it('saving with a startDate label never snaps the precise confirmation to Beijing midnight', () => {
    const rule = preset({ startDate: '2026-11-26', effectiveAt: '2026-11-26T09:45:12.123+08:00' });
    expect(rule.effectiveAt).toBe(armedAt);
    expect(rule.armedAt).toBe(armedAt);
    expect(rule.startDate).toBe('2026-11-26');
    expect(rule.createdAt).toBe(armedAt);
    expect(rule.triggeredAt).toBeUndefined();
    expect(waiting(rule)).toBe(true);
  });
  it('triggered version retains arming and confirms exact triggeredAt, not quote time or midnight', () => {
    const wait = preset();
    const hit = trigger(wait, { effectiveAt: armedAt, currentRawPrice: -1, quoteAsOf: 'ignored external baseline' });
    expect(hit).toMatchObject({ version: 2, armedAt, effectiveAt: triggeredAt, triggeredAt,
      triggerQuoteAsOf: observedAt, triggerPrice: 90, triggerSource: 'actual_intraday_feed',
      startDate: '2026-11-26', downsidePercent: 0, baselineRawPrice: 90, baselineCountedPrice: 90 });
    expect(hit.quoteAsOf).toBeUndefined();
    expect(wait.triggeredAt).toBeUndefined();
    expect(valid(hit)).toBe(true);
    expect(waiting(hit)).toBe(false);
  });
  it('trigger constructor can retain armedAt from its immutable waiting predecessor', () => {
    const wait = preset();
    expect(trigger(wait, { armedAt: undefined }).armedAt).toBe(armedAt);
    expect(() => trigger(wait, { armedAt: '2026-11-26T01:00:00.000Z' })).toThrow('保留原预设时间');
  });
  it.each(['新浪财经', 'Yahoo Finance', 'Binance REST intraday'])('nonempty real audit source %s is not provider-restricted', triggerSource => {
    const hit = trigger(preset(), { triggerSource });
    expect(valid(hit)).toBe(true);
    expect(hit.triggerSource).toBe(triggerSource);
  });
  it('Beijing date labels can change at midnight without changing real instant', () => {
    const wait = preset({ effectiveAt: '2026-11-26T15:59:59.999Z' });
    const hit = trigger(wait, { triggeredAt: '2026-11-26T16:00:00.123Z',
      triggerQuoteAsOf: '2026-11-26T16:00:00.001Z' });
    expect(wait.startDate).toBe('2026-11-26');
    expect(hit.startDate).toBe('2026-11-27');
    expect(hit.effectiveAt).toBe('2026-11-26T16:00:00.123Z');
    expect(hit.armedAt).toBe(wait.armedAt);
  });
  it('rejects injected manual thresholds, ratios and misleading date labels', () => {
    expect(() => preset({ thresholdPrice: 85 })).toThrow();
    expect(() => preset({ downsidePercent: 20 })).toThrow();
    expect(() => preset({ startDate: '2026-11-25' })).toThrow();
    expect(() => preset({ armedAt: '2026-11-26T01:00:00.000Z' })).toThrow();
    expect(preset({ thresholdPrice: 90, downsidePercent: 0 }).thresholdPrice).toBe(90);
  });
  it('CAS, boolean and reverse confirmation time guards still apply', () => {
    const wait = preset();
    expect(() => preset({ expectedVersion: 0 }, wait)).toThrow('版本冲突');
    expect(() => preset({ effectiveAt: '2026-11-26T01:00:00.000Z' }, wait)).toThrow('早于');
    expect(() => preset({ enabled: 1 as unknown as boolean })).toThrow('布尔值');
    expect(() => preset({ effectiveAt: 'invalid' })).toThrow();
    expect(() => preset({ createdAt: 'invalid' })).toThrow();
    expect(() => preset({ activationMode: 'bad' as 'auto_drop' })).toThrow();
  });
});

describe('auto_drop waiting supersedes old manual; no intraday retroactivity; stateless recovery', () => {
  it('a future manual business date can be replaced by an auto preset waiting from now', () => {
    const old = create({ ledgerId: 37, categoryId: 81, lotId: 1, userId: 28, currency: 'USD', enabled: true,
      thresholdPrice: 120, downsidePercent: 20, expectedVersion: 0, currentRawPrice: NaN,
      effectiveAt: '2026-12-01T00:00:00+08:00', startDate: '2026-12-01',
      createdAt: '2026-11-24T02:00:00.000Z', baselineSource: 'owner_threshold' }, null);
    const wait = preset({}, old);
    expect(wait).toMatchObject({ version: 2, effectiveAt: armedAt, armedAt });
    expect(select([old, wait], 1, armedAt)).toBe(wait);
    expect(select([old, wait], 1, '2026-12-02T01:00:00.000Z')).toBe(wait);
    expect(counted(80, wait)).toBe(80);
  });
  it('raw waiting neutralizes earlier manual only at exact save time, even below the threshold', () => {
    const old = manual(), wait = preset({}, old), hit = trigger(wait), rules = [old, wait, hit];
    expect(counted(80, select(rules, 1, '2026-11-26T01:45:12.122Z'))).toBe(112);
    expect(select(rules, 1, armedAt)).toBe(wait);
    expect(counted(80, select(rules, 1, armedAt))).toBe(80);
    expect(select(rules, 1, beforeTrigger)).toBe(wait);
    expect(counted(80, select(rules, 1, beforeTrigger))).toBe(80);
    expect(select(rules, 1, observedAt)).toBe(wait);
    expect(counted(80, select(rules, 1, triggeredAt))).toBe(90);
    expect(hit.version).toBe(3);
  });
  it('trigger equality is inclusive; evidence above threshold is rejected', () => {
    const hit = trigger();
    expect(valid(hit)).toBe(true);
    expect(hit.triggerPrice).toBe(hit.thresholdPrice);
    expect(counted(90, hit)).toBe(90);
    expect(() => trigger(preset(), { triggerPrice: 90.000000000001 })).toThrow();
    expect(trigger(preset(), { triggerPrice: 80 }).triggerPrice).toBe(80);
  });
  it('no rule is activated by an older same-day quote, opening or Beijing label', () => {
    const wait = preset(), hit = trigger(wait), rules = [wait, hit];
    expect(select(rules, 1, '2026-11-26T00:00:00+08:00')).toBeNull();
    expect(value({ lotId: 1, quantity: 2, entryPrice: 100, rawPrice: 70, rules,
      asOf: '2026-11-26T01:45:12.122Z' }).countedFloatingPnl).toBe(-60);
    expect(value({ lotId: 1, quantity: 2, entryPrice: 100, rawPrice: 70, rules,
      asOf: beforeTrigger }).countedFloatingPnl).toBe(-60);
    expect(value({ lotId: 1, quantity: 2, entryPrice: 100, rawPrice: 70, rules,
      asOf: triggeredAt }).countedFloatingPnl).toBe(-20);
  });
  it('recovering above K restores 100%, later dips floor again without altering first audit', () => {
    const hit = freeze(trigger()), before = JSON.stringify(hit);
    expect([80, 90, 95, 100, 110, 89, 70, 105, 80].map(price => counted(price, hit)))
      .toEqual([90, 90, 95, 100, 110, 90, 90, 105, 90]);
    expect(JSON.stringify(hit)).toBe(before);
  });
  it('disabled waiting and disabled triggered versions are raw, never inherit earlier manual carry', () => {
    const old = manual(), wait = preset({ enabled: false }, old);
    expect(waiting(wait)).toBe(true);
    expect(counted(70, wait)).toBe(70);
    const hit = { ...trigger(preset()), enabled: false };
    expect(valid(hit)).toBe(true);
    expect(counted(70, hit)).toBe(70);
  });
  it('explicitly resetting triggered preset creates a fresh waiting version and leaves old audit intact', () => {
    const wait = preset(), hit = freeze(trigger(wait)), before = JSON.stringify(hit);
    const resetAt = '2026-11-26T03:30:00.321Z';
    const reset = preset({ effectiveAt: resetAt, autoDropPercent: 25 }, hit);
    expect(reset).toMatchObject({ version: 3, effectiveAt: resetAt, armedAt: resetAt, thresholdPrice: 75 });
    expect(waiting(reset)).toBe(true);
    expect(reset.triggeredAt).toBeUndefined();
    expect(counted(70, select([wait, hit, reset], 1, resetAt))).toBe(70);
    expect(counted(70, select([wait, hit, reset], 1, beforeTrigger))).toBe(70);
    expect(JSON.stringify(hit)).toBe(before);
  });
  it.each([null, NaN, Infinity, -1, 0])('missing/invalid price %s remains unknown even with a floor', price => {
    expect(counted(price, preset())).toBeNull();
    expect(counted(price, trigger())).toBeNull();
  });
  it('other real lots are unaffected by this rule', () => {
    expect(value({ lotId: 2, quantity: 1, entryPrice: 100, rawPrice: 70,
      rules: [trigger()], asOf: now }).countedMarketPrice).toBe(70);
  });
});

describe('auto_drop audit/config corruption fails closed and does not repair evidence', () => {
  const damagedWaiting: Partial<StockLotDownsideRule>[] = [
    { autoEntryPrice: undefined }, { autoEntryPrice: NaN }, { autoEntryPrice: 0 },
    { autoDropPercent: undefined }, { autoDropPercent: 0 }, { autoDropPercent: 100 },
    { thresholdPrice: 80 }, { downsidePercent: 20 }, { baselineRawPrice: 80 },
    { baselineCountedPrice: 80 }, { baselineStatus: 'pending' }, { baselineStatus: undefined },
    { baselineSource: 'verified_close' }, { enabled: 1 as unknown as boolean },
    { armedAt: undefined }, { armedAt: 'invalid' }, { armedAt: triggeredAt },
    { effectiveAt: 'invalid' }, { startDate: '2026-11-25' }, { createdAt: 'invalid' },
    { triggerPrice: 90 }, { triggerQuoteAsOf: observedAt }, { triggerSource: 'stray audit' },
    { triggeredAt: '' }, { triggeredAt: null as unknown as string },
  ];
  it.each(damagedWaiting)('damaged waiting config is not activated or repaired (%j)', patch => {
    const damaged = freeze({ ...preset(), ...patch }), before = JSON.stringify(damaged);
    expect(valid(damaged)).toBe(false);
    expect(waiting(damaged)).toBe(false);
    expect(counted(70, damaged)).toBeNull();
    const resolved = historical([damaged])[0];
    expect(resolved.baselineStatus).toBe('pending');
    expect(counted(70, resolved)).toBeNull();
    expect(JSON.stringify(damaged)).toBe(before);
  });
  const damagedTriggered: Partial<StockLotDownsideRule>[] = [
    { triggeredAt: 'invalid' }, { triggeredAt: undefined }, { effectiveAt: armedAt },
    { triggeredAt: armedAt }, { triggerPrice: undefined }, { triggerPrice: NaN },
    { triggerPrice: Infinity }, { triggerPrice: 0 }, { triggerPrice: -1 }, { triggerPrice: 91 },
    { triggerQuoteAsOf: undefined }, { triggerQuoteAsOf: 'invalid' },
    { triggerQuoteAsOf: '2026-11-26T01:45:12.122Z' },
    { triggerQuoteAsOf: '2026-11-26T02:30:45.790Z' },
    { triggerSource: undefined }, { triggerSource: '' }, { triggerSource: '  ' },
  ];
  it.each(damagedTriggered)('damaged first-confirmation audit never becomes ready (%j)', patch => {
    const damaged = { ...trigger(), ...patch };
    expect(valid(damaged)).toBe(false);
    expect(waiting(damaged)).toBe(false);
    expect(counted(70, damaged)).toBeNull();
    expect(historical([damaged])[0].baselineStatus).toBe('pending');
  });
  it.each([
    { triggerPrice: 0 }, { triggerPrice: 91 }, { triggerPrice: undefined },
    { triggerQuoteAsOf: undefined }, { triggerQuoteAsOf: 'invalid' },
    { triggerQuoteAsOf: '2026-11-26T01:00:00Z' }, { triggerQuoteAsOf: '2026-11-26T03:00:00Z' },
    { triggerSource: undefined }, { triggerSource: '' }, { triggerSource: '  ' },
    { triggeredAt: 'invalid' }, { armedAt: 'invalid' },
  ])('constructor refuses damaged trigger audit (%j)', patch => {
    expect(() => trigger(preset(), patch)).toThrow();
  });
  it('waiting constructor rejects stray triggered evidence rather than silently laundering it', () => {
    expect(() => preset({ triggerPrice: 90 })).toThrow();
    expect(() => preset({ triggerQuoteAsOf: observedAt })).toThrow();
    expect(() => preset({ triggerSource: 'feed' })).toThrow();
  });
  it('disabled damaged auto config also fails closed', () => {
    expect(counted(70, { ...preset({ enabled: false }), autoDropPercent: 100 })).toBeNull();
    expect(counted(70, { ...trigger(), enabled: false, triggerSource: '' })).toBeNull();
  });
});

describe('auto owner_threshold historical resolution and real member basis without external quotes', () => {
  it('waiting and triggered are resolved solely from real holding evidence, never read quotes', () => {
    const wait = preset(), hit = trigger(wait);
    const quotes = [{ get symbol(): string { throw new Error('external quote proof must not be read'); } }] as StockLotDownsideHistoricalQuote[];
    const result = historical([wait, hit], { quotes });
    expect(result.map(rule => rule.baselineStatus)).toEqual(['ready', 'ready']);
    expect(result.map(rule => rule.holdingStartAt)).toEqual([openedAt, openedAt]);
    expect(result.map(rule => counted(70, rule))).toEqual([70, 90]);
  });
  it('historical resolution does not mutate raw rules, source audit or lot evidence', () => {
    const wait = preset(), hit = trigger(wait), rules = freeze([wait, hit]), lots = freeze([historicalLot]);
    const before = JSON.stringify({ rules, lots });
    const result = historical(rules, { lots });
    expect(result[0]).not.toBe(rules[0]);
    expect(result[1]).not.toBe(rules[1]);
    expect(result[1]).toMatchObject({ triggeredAt, triggerPrice: 90, triggerQuoteAsOf: observedAt });
    expect(JSON.stringify({ rules, lots })).toBe(before);
  });
  it.each([
    { lots: [] }, { lots: [{ ...historicalLot, openedAt: 'invalid' }] },
    { lots: [{ ...historicalLot, openedAt: '2026-11-27T02:00:00Z' }] },
    { lots: [{ ...historicalLot, openedAt: '2026-11-26T02:00:00Z' }] },
    { lots: [{ ...historicalLot, unitCost: 99 }] }, { lots: [{ ...historicalLot, unitCost: NaN }] },
  ])('missing, impossible or changed real buy basis remains pending (%j)', ({ lots }) => {
    const result = historical([trigger()], { lots })[0];
    expect(result.baselineStatus).toBe('pending');
    expect(counted(70, result)).toBeNull();
  });
  it('late entry derives F(real entry)-entry without quote or epoch, preserving zero initial PnL', () => {
    const rules = historical([trigger()]), input = entryInput(rules), carry = offset(input);
    expect(carry).toBe(10);
    expect(offset({ ...input, entryQuoteAsOf: 'not an external proof' })).toBe(10);
    expect(value({ lotId: 1, quantity: 2, entryPrice: 80, rawPrice: 80,
      rules, asOf: now, direction: 'counterparty', entryCountedOffset: carry }).countedFloatingPnl).toBe(0);
    expect(value({ lotId: 1, quantity: 2, entryPrice: 80, rawPrice: 70,
      rules, asOf: now, direction: 'counterparty', entryCountedOffset: carry }).countedFloatingPnl).toBe(0);
  });
  it('waiting entry is zero offset and stays zero after subsequent trigger, not retrospectively repriced', () => {
    const wait = preset(), hit = trigger(wait), rules = historical([wait, hit]);
    expect(offset(entryInput(rules, '2026-11-26T02:00:00.000Z'))).toBe(0);
    expect(offset(entryInput(rules, openedAt))).toBe(0);
  });
  it('exact entry epoch may supply raw only; stale counted and ruleVersion never become entry proof', () => {
    const rules = historical([trigger()]);
    const proof = freeze(epoch()), before = JSON.stringify(proof);
    expect(offset({ ...entryInput(rules), entryRawPrice: undefined, epochs: [proof] })).toBe(10);
    expect(offset({ ...entryInput(rules), entryRawPrice: 75, epochs: [proof] })).toBe(15);
    expect(offset({ ...entryInput(rules), entryRawPrice: undefined,
      epochs: [epoch({ effectiveAt: '2026-11-26T03:00:00.001Z' })] })).toBeNull();
    expect(JSON.stringify(proof)).toBe(before);
  });
  it.each([null, NaN, Infinity, 0, -1])('damaged explicit participation price %s stays null, even with a valid exact epoch', entryRawPrice => {
    const input = { ...entryInput(historical([trigger()])), entryRawPrice };
    expect(offset(input)).toBeNull();
    expect(offset({ ...input, epochs: [epoch()] })).toBeNull();
  });
  it('future-entry scope still matches older actual quote rule, not a later triggered rule', () => {
    const wait = preset(), hit = trigger(wait), rules = historical([wait, hit]);
    const input = { ...entryInput(rules), asOf: beforeTrigger, participationAsOf: now };
    expect(offset(input)).toBe(0);
    expect(value({ lotId: 1, quantity: 1, entryPrice: 80, rawPrice: 70, rules,
      asOf: beforeTrigger, direction: 'counterparty', entryCountedOffset: offset(input) })
      .countedFloatingPnl).toBe(10);
    expect(offset({ ...input, participationAsOf: input.assignedAt })).toBeNull();
  });
});

describe('auto exact sale history and highest-priority user exemption; manual and legacy untouched', () => {
  it('automatic decimal precision never adds a restriction to manual threshold or remaining percentage', () => {
    const rule = create({ ...settings, activationMode: 'manual', thresholdPrice: 87.654321099,
      downsidePercent: 12.345678901, autoDropPercent: 1e-9,
      startDate: '2026-11-24', baselineSource: 'owner_threshold' }, null);
    expect(rule.thresholdPrice).toBe(87.654321099);
    expect(rule.downsidePercent).toBe(12.345678901);
    expect(rule.activationMode).not.toBe('auto_drop');
    expect(rule.autoDropPercent).toBeUndefined();
    expect(counted(100, rule)).toBe(100);
  });
  it('sales before save/trigger use raw even if saved evidence would imply a future floor', () => {
    const wait = preset(), hit = trigger(wait), rules = [wait, hit];
    const saved = freeze({ countedPrice: 999, effectiveAt: triggeredAt });
    expect(sale(rules, 1, 70, '2026-11-26T01:45:12.122Z', saved)).toBe(70);
    expect(sale(rules, 1, 70, armedAt, saved)).toBe(70);
    expect(sale(rules, 1, 70, observedAt, saved)).toBe(70);
    expect(sale(rules, 1, 70, beforeTrigger, saved)).toBe(70);
    expect(sale(rules, 1, 70, triggeredAt, saved)).toBe(90);
    expect(sale(rules, 1, 95, triggeredAt, saved)).toBe(95);
    expect(saved.countedPrice).toBe(999);
  });
  it('auto mode recognizes exact history even if compatibility date label is damaged or missing', () => {
    const damaged = { ...trigger(), startDate: undefined };
    expect(sale([damaged], 1, 70, triggeredAt)).toBeNull();
    expect(sale([damaged], 1, 70, '', undefined)).toBeNull();
  });
  it('missing actual sale time can use saved audited instant, but no date evidence fails closed', () => {
    const hit = trigger();
    expect(sale([hit], 1, 70, '', { countedPrice: 999, effectiveAt: triggeredAt })).toBe(90);
    expect(sale([hit], 1, 70, '')).toBeNull();
    expect(sale([hit], 1, NaN, triggeredAt)).toBeNull();
  });
  it('manual and disabled auto historical sales stay version-matched', () => {
    const old = manual(), wait = preset({}, old), hit = trigger(wait), disabled = { ...hit, enabled: false };
    expect(sale([old, wait, hit], 1, 70, '2026-11-25T02:00:00Z')).toBe(110);
    expect(sale([old, wait, hit], 1, 70, beforeTrigger)).toBe(70);
    expect(sale([old, wait, disabled], 1, 70, triggeredAt)).toBe(70);
  });
  it('exempt users always retain raw executed/current prices despite damaged auto audits or frozen sale', () => {
    const rules = [preset(), { ...trigger(), triggerSource: '' }];
    const override: UserTagDownsideOverride = { ledgerId: 37, categoryId: 81, targetUserId: 99,
      actorUserId: 28, version: 1, mode: 'exempt', createdAt: '2026-11-26T08:00:00.000Z' };
    const exempt = stockUserDownsideRules(rules, [override], 99, 81);
    const follow = stockUserDownsideRules(rules, [override], 100, 81);
    expect(follow).toBe(rules);
    expect(sale(follow, 1, 70, triggeredAt)).toBeNull();
    expect(sale(exempt, 1, 70, '', { countedPrice: 999, effectiveAt: triggeredAt })).toBe(70);
    expect(offset({ ...entryInput(exempt), entryRawPrice: 70 })).toBe(0);
    expect(value({ lotId: 1, quantity: 1, entryPrice: 100, rawPrice: 70, rules: exempt,
      asOf: now, direction: 'counterparty' }).countedFloatingPnl).toBe(30);
  });
  it('manual explicit mode retains K/ratio/start-of-day semantics and old saved undated sale stays counted', () => {
    const input = { ...settings, activationMode: 'manual' as const, thresholdPrice: 120,
      downsidePercent: 20, startDate: '2026-11-24', baselineSource: 'owner_threshold' as const };
    const result = create(input, null);
    expect(result.effectiveAt).toBe('2026-11-23T16:00:00.000Z');
    expect(counted(70, result)).toBe(110);
    const legacy: StockLotDownsideRule = { ...manual(), startDate: undefined, baselineSource: 'verified_close',
      thresholdPrice: 100, baselineRawPrice: 90, baselineCountedPrice: 98, downsidePercent: 20 };
    expect(counted(80, legacy)).toBe(96);
    expect(sale([legacy], 1, 70, triggeredAt, { countedPrice: 97, effectiveAt: triggeredAt })).toBe(97);
    expect(sale([], 1, 70, '', { countedPrice: 97, effectiveAt: triggeredAt })).toBe(97);
  });
});
