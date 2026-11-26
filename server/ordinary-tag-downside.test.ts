import { describe, expect, it } from 'vitest';
import { calculateOrdinaryTagDownsideSeries, countedOrdinaryTagBalance, ordinaryTagCountedPnl,
  ordinaryTagDownsideEntryOffset, ordinaryTagDownsidePnlAdjustment, selectOrdinaryTagDownsideRule,
  validateOrdinaryTagDownsideSettings, validateOrdinaryTagDownsideStartDate,
  type OrdinaryTagDownsidePoint, type OrdinaryTagDownsideRule, type OrdinaryTagDownsideSeriesInput } from '../shared/ordinary-tag-downside';
const rule = (patch: Partial<OrdinaryTagDownsideRule> = {}): OrdinaryTagDownsideRule => ({ ledgerId: 37,
  categoryId: 10, userId: 7, version: 1, enabled: true, thresholdAmount: 100, downsidePercent: 20,
  startDate: '2026-11-01', createdAt: '2026-11-25T00:00:00.000Z', ...patch });
const point = (date: string, rawBalance: number | null, capitalChange = 0, withdraw = 0): OrdinaryTagDownsidePoint => ({ date, rawBalance, capitalChange, withdraw });
const series = (points: OrdinaryTagDownsidePoint[], patch: Partial<OrdinaryTagDownsideSeriesInput> = {}) => calculateOrdinaryTagDownsideSeries({
  ledgerId: 37, categoryId: 10, initialAmount: 100, entryDate: '2026-11-01', ratio: 100, rules: [rule()], points, ...patch });

describe('ordinary balance threshold is stateless F(B), never modifies raw', () => {
  it.each([[0, 0, 100], [0, 20, 80], [0, 100, 0], [80, 0, 100], [80, 20, 96], [80, 100, 80],
    [100, 0, 100], [120, 20, 120], [120, 0, 120]])('B=%s r=%s gives %s', (balance, percent, expected) => {
    expect(countedOrdinaryTagBalance(balance, rule({ downsidePercent: percent }))).toBe(expected);
  });
  it('repeated crossings fully recover, no ratchet', () => {
    const r = Object.freeze(rule());
    expect([120, 80, 110, 60, 130].map(b => countedOrdinaryTagBalance(b, r))).toEqual([120, 96, 110, 92, 130]);
  });
  it.each([null, undefined, NaN, -1, Infinity, '0'])('missing/invalid %s stays pending even disabled', raw => {
    expect(countedOrdinaryTagBalance(raw as number, rule())).toBeNull();
    expect(countedOrdinaryTagBalance(raw as number, rule({ enabled: false }))).toBeNull();
  });
  it('off/null returns raw including zero', () => {
    expect(countedOrdinaryTagBalance(0, null)).toBe(0);
    expect(countedOrdinaryTagBalance(60, rule({ enabled: false }))).toBe(60);
  });
  it('foreign ledger or damaged rule is pending', () => {
    expect(countedOrdinaryTagBalance(80, rule({ ledgerId: 38 as 37 }))).toBeNull();
    expect(countedOrdinaryTagBalance(80, rule({ thresholdAmount: 0 }))).toBeNull();
  });
  it.each([0, -1, NaN, Infinity, null, '100'])('threshold %s rejected', amount => expect(() => validateOrdinaryTagDownsideSettings(amount as number, 20)).toThrow());
  it.each([-1, 101, NaN, Infinity, null, '20'])('percent %s rejected', percent => expect(() => validateOrdinaryTagDownsideSettings(100, percent as number)).toThrow());
  it.each(['1000-01-01', '9999-12-31', '2000-02-29', '2024-02-29'])('real date %s valid', date => expect(() => validateOrdinaryTagDownsideStartDate(date)).not.toThrow());
  it.each(['0999-12-31', '10000-01-01', '2026-02-29', '2026-02-30', '2026-11-31', '1900-02-29', '20261125', '', null])('date %s rejected', date => expect(() => validateOrdinaryTagDownsideStartDate(date as string)).toThrow());
});
describe('effective date/version and actual entry scope', () => {
  it('highest saved applicable version wins; future never activates', () => {
    const rules = Object.freeze([rule({ version: 99, startDate: '2026-10-01' }), rule({ version: 2 }),
      rule({ version: 3 }), rule({ version: 4, startDate: '2099-01-01' })]);
    expect(selectOrdinaryTagDownsideRule(rules, 10, '2026-11-03')?.version).toBe(99);
    expect(selectOrdinaryTagDownsideRule(rules, 10, '2026-10-20')?.version).toBe(99);
    expect(selectOrdinaryTagDownsideRule(rules, 10, '2026-09-01')).toBeNull();
    expect(selectOrdinaryTagDownsideRule(rules, 10, '2099-01-01')?.version).toBe(99);
  });
  it('backfilled v2 start11/10 does not revert to v1 on11/16; future v3 waits12/1', () => {
    const rules = [rule({ version: 1, startDate: '2026-11-16' }),
      rule({ version: 2, startDate: '2026-11-10', downsidePercent: 0 }),
      rule({ version: 3, startDate: '2026-12-01', enabled: false })];
    expect(selectOrdinaryTagDownsideRule(rules, 10, '2026-11-09')).toBeNull();
    for (const date of ['2026-11-10', '2026-11-16', '2026-11-30']) expect(selectOrdinaryTagDownsideRule(rules, 10, date)?.version).toBe(2);
    expect(selectOrdinaryTagDownsideRule(rules, 10, '2026-12-01')?.version).toBe(3);
    const out = series([point('2026-11-10', 80), point('2026-11-16', 70), point('2026-12-01', 70)], { rules });
    expect(out.map(p => p.ruleVersion)).toEqual([2, 2, 3]);
    expect(out.map(p => p.countedPnl)).toEqual([0, 0, 30]);
  });
  it('same startDate highest version and same version latest date tie-break', () => {
    expect(selectOrdinaryTagDownsideRule([rule(), rule({ version: 2 })], 10, '2026-11-25')?.version).toBe(2);
    expect(selectOrdinaryTagDownsideRule([rule(), rule({ startDate: '2026-11-03' })], 10, '2026-11-25')?.startDate).toBe('2026-11-03');
  });
  it('scope/invalid dates cannot leak another category/ledger', () => {
    expect(selectOrdinaryTagDownsideRule([rule({ ledgerId: 38 as 37 }), rule({ categoryId: 11 })], 10, '2026-11-20')).toBeNull();
    expect(selectOrdinaryTagDownsideRule([rule()], 10, '2026-02-30')).toBeNull();
  });
  it('entry after enable offsets belowK; pre-enable actual entry does not fabricate baseline', () => {
    const base = { rules: [rule()], categoryId: 10, entryAmount: 60, asOfDate: '2026-11-25' };
    expect(ordinaryTagDownsideEntryOffset({ ...base, entryDate: '2026-11-02' })).toBe(32);
    expect(ordinaryTagDownsideEntryOffset({ ...base, entryDate: '2026-10-01' })).toBe(0);
    expect(ordinaryTagDownsideEntryOffset({ ...base, entryDate: null })).toBeNull();
    expect(ordinaryTagDownsideEntryOffset({ ...base, entryDate: '2026-11-02', entryAmount: null })).toBeNull();
    expect(ordinaryTagDownsideEntryOffset({ ...base, entryDate: '2026-12-01' })).toBeNull();
    expect(ordinaryTagDownsideEntryOffset({ ...base, ledgerId: 38, entryDate: '2026-11-02' })).toBeNull();
  });
  it('off/new rule never inherits prior entry carry', () => {
    expect(ordinaryTagDownsideEntryOffset({ rules: [rule(), rule({ enabled: false, version: 2, startDate: '2026-11-10' })],
      categoryId: 10, entryAmount: 60, entryDate: '2026-11-02', asOfDate: '2026-11-25' })).toBe(0);
  });
});
describe('official day series cash-neutral settlement contract', () => {
  it('no rule preserves original reverse raw formula and capital is not scaled', () => {
    const out = series([point('2026-11-02', 110, 20, 5), point('2026-11-03', 120, 10)], { rules: [], ratio: 50 });
    expect(out.map(p => p.rawPnl)).toEqual([2.5, 2.5]);
    expect(out.map(p => p.countedPnl)).toEqual([2.5, 2.5]);
    expect(out.map(p => p.dailyCountedPnl)).toEqual([2.5, 0]);
  });
  it('new entry below threshold has no virtual loss or profit', () => {
    const out = series([point('2026-11-01', 60), point('2026-11-02', 50)], { initialAmount: 60 });
    expect(out[0]).toMatchObject({ rawPnl: 0, countedPnl: 0, countedBalance: 92, status: 'ready' });
    expect(out[1]).toMatchObject({ rawPnl: 10, countedPnl: 2, dailyCountedPnl: 2 });
  });
  it.each([0, 20, 100])('pure add/remove/withdraw across K remains 0 at r=%s', downsidePercent => {
    const out = series([point('2026-11-02', 80, 20), point('2026-11-03', 120, 40), point('2026-11-04', 70, -30, 20),
      point('2026-11-05', 0, 0, 70), point('2026-11-06', 60, 60)], { initialAmount: 60, rules: [rule({ downsidePercent })] });
    for (const p of out) expect(p).toMatchObject({ rawPnl: 0, countedPnl: 0, dailyCountedPnl: 0, status: 'ready' });
  });
  it('flow first derived Q gives correct belowK loss after deposit', () => {
    const out = series([point('2026-11-02', 70, 20)], { initialAmount: 60 });
    expect(out[0]).toMatchObject({ rawPnl: 10, countedPnl: 2, dailyCountedPnl: 2, countedBalance: 94 });
    expect(out[0]).not.toHaveProperty('actualBeforeTransferBalance');
  });
  it('round trips no flow have no ratchet and 100% above threshold', () => {
    const out = series([point('2026-11-02', 80), point('2026-11-03', 120), point('2026-11-04', 80), point('2026-11-05', 100)]);
    expect(out.map(p => p.countedPnl)).toEqual([4, -20, 4, 0]);
    expect(out.map(p => p.dailyCountedPnl)).toEqual([4, -24, 24, -4]);
  });
  it('start uses last actual before enable, preserves earlier raw earnings', () => {
    const out = series([point('2026-11-02', 80), point('2026-11-10', 70)], { rules: [rule({ startDate: '2026-11-10' })] });
    expect(out[0]).toMatchObject({ rawPnl: 20, countedPnl: 20, ruleVersion: 0 });
    expect(out[1]).toMatchObject({ rawPnl: 30, countedPnl: 22, dailyCountedPnl: 2 });
  });
  it('date revision each day fresh-replays own window, disabled restores raw and no old carry', () => {
    const rules = [rule(), rule({ version: 2, startDate: '2026-11-03', downsidePercent: 0 }),
      rule({ version: 3, startDate: '2026-11-05', enabled: false })];
    const out = series([point('2026-11-02', 80), point('2026-11-03', 70), point('2026-11-04', 60), point('2026-11-05', 60)], { rules });
    expect(out.map(p => p.countedPnl)).toEqual([4, 20, 20, 40]);
    expect(out.map(p => p.ruleVersion)).toEqual([1, 2, 2, 3]);
    expect(out[3].dailyCountedPnl).toBe(20);
  });
  it('same-date retroactive replacement replays its new K/r not saved carry', () => {
    const points = [point('2026-11-02', 80), point('2026-11-03', 70, 10)];
    const out = series(points, { rules: [rule(), rule({ version: 2, downsidePercent: 100 })] });
    expect(out.map(p => p.countedPnl)).toEqual(out.map(p => p.rawPnl));
  });
  it('future highest version does not affect present', () => {
    const out = series([point('2026-11-02', 80)], { rules: [rule(), rule({ version: 2, enabled: false, startDate: '2099-01-01' })] });
    expect(out[0]).toMatchObject({ countedPnl: 4, ruleVersion: 1 });
  });
  it('real zero B and zero ratio are valid, never defaulted', () => {
    expect(series([point('2026-11-02', 0)])[0]).toMatchObject({ rawPnl: 100, countedPnl: 20, status: 'ready' });
    expect(series([point('2026-11-02', 80)], { ratio: 0 })[0]).toMatchObject({ rawPnl: 0, countedPnl: 0, status: 'ready' });
  });
  it('transfer-only dates pending, proven flow accumulates until next actual balance, not fabricated', () => {
    const out = series([point('2026-11-02', null, 20), point('2026-11-03', 80)], { initialAmount: 60 });
    expect(out[0]).toMatchObject({ rawBalance: null, countedBalance: null, countedPnl: null, status: 'pending' });
    expect(out[1]).toMatchObject({ rawPnl: 0, countedPnl: 0, status: 'ready' });
  });
  it.each([{ initialAmount: null }, { initialAmount: -1 }, { entryDate: null }, { entryDate: '2026-02-30' },
    { ledgerId: 38 as 37 }, { categoryId: 0 }, { ratio: NaN }])('invalid initial/scope remains pending %j', patch => {
    expect(series([point('2026-11-02', 80)], patch)[0].status).toBe('pending');
  });
  it('duplicate or invalid observation dates invalidate range, input is sorted without mutation', () => {
    expect(series([point('2026-11-02', 80), point('2026-11-02', 60)]).every(p => p.status === 'pending')).toBe(true);
    expect(series([point('2026-02-30', 80)]).every(p => p.status === 'pending')).toBe(true);
    const points = [point('2026-11-03', 70), point('2026-11-02', 80)];
    const original = structuredClone(points);
    expect(series(points).map(p => p.date)).toEqual(['2026-11-02', '2026-11-03']);
    expect(points).toEqual(original);
  });
  it('missing actual flow evidence cannot be inferred from B; bad B poisons subsequent history', () => {
    const out = series([{ ...point('2026-11-02', 80), capitalChange: null }, point('2026-11-03', 70)]);
    expect(out.every(p => p.rawPnl === null && p.countedPnl === null)).toBe(true);
    expect(series([point('2026-11-02', -1), point('2026-11-03', 80)]).every(p => p.countedPnl === null)).toBe(true);
  });
  it('Q below zero is pending for active counted performance, not fabricated market evidence', () => {
    expect(series([point('2026-11-02', 0, -101)])[0]).toMatchObject({ rawPnl: -1, countedPnl: null, status: 'pending' });
  });
  it('outside participation scope ignored, actual entry initial remains intact', () => {
    const out = series([point('2026-10-01', 999, 100), point('2026-11-01', 60)], { initialAmount: 60 });
    expect(out[0].status).toBe('before-entry');
    expect(out[1]).toMatchObject({ rawPnl: 0, countedPnl: 0 });
  });
  it('frozen originals /本金/加减本金/withdraw/records/wallet do not mutate', () => {
    const wallet = Object.freeze({ balance: 888, transactions: Object.freeze([{ amount: 20 }]) });
    const points = Object.freeze([Object.freeze(point('2026-11-02', 80, 20))]);
    const rules = Object.freeze([Object.freeze(rule())]);
    const input = Object.freeze({ ledgerId: 37 as const, categoryId: 10, initialAmount: 60, entryDate: '2026-11-01', ratio: 100, points, rules });
    const snapshot = JSON.stringify({ input, wallet });
    calculateOrdinaryTagDownsideSeries(input);
    expect(JSON.stringify({ input, wallet })).toBe(snapshot);
  });
});
describe('unified read adapter requires flow evidence while preserving raw when off', () => {
  const base = { ledgerId: 37, categoryId: 10, rules: [rule()], rawPnl: 0, rawBalance: 80, initialAmount: 60,
    entryDate: '2026-11-01', asOfDate: '2026-11-02', ratio: 100 };
  it('plain endpoints pending; complete flow-neutral series produces counted difference', () => {
    expect(ordinaryTagCountedPnl(base)).toBeNull();
    expect(ordinaryTagDownsidePnlAdjustment(base)).toBeNull();
    const input = { ...base, points: [point('2026-11-02', 80, 20)] };
    expect(ordinaryTagCountedPnl(input)).toBe(0);
    expect(ordinaryTagDownsidePnlAdjustment(input)).toBe(0);
  });
  it('raw mismatch or balance mismatch refuses silent replacement', () => {
    const input = { ...base, points: [point('2026-11-02', 80, 20)] };
    expect(ordinaryTagCountedPnl({ ...input, rawPnl: 1 })).toBeNull();
    expect(ordinaryTagCountedPnl({ ...input, rawBalance: 81 })).toBeNull();
  });
  it('no rule/disabled returns original raw without requiring unavailable evidence', () => {
    expect(ordinaryTagCountedPnl({ ...base, rules: [], rawPnl: 19, initialAmount: null, rawBalance: null })).toBe(19);
    expect(ordinaryTagCountedPnl({ ...base, rules: [rule({ enabled: false })], rawPnl: 19 })).toBe(19);
    expect(ordinaryTagCountedPnl({ ...base, rules: [], rawPnl: null })).toBeNull();
    expect(ordinaryTagCountedPnl({ ...base, ledgerId: 38 })).toBeNull();
  });
});
