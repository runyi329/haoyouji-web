import { describe, expect, it } from 'vitest';
import { isUserTagDownsideExempt, userStockDownsideRules, type UserTagDownsideOverride } from '../shared/user-tag-downside-override';
import { countedStockLotPrice, stockLotDownsideMemberOffset, selectStockLotDownsideRule, type StockLotDownsideRule } from '../shared/stock-lot-downside';

const override = (patch: Partial<UserTagDownsideOverride> = {}): UserTagDownsideOverride => ({
  ledgerId: 37, categoryId: 10, targetUserId: 20, actorUserId: 7, version: 1,
  mode: 'exempt', createdAt: '2026-11-26T00:00:00.000Z', ...patch,
});
const rule = (patch: Partial<StockLotDownsideRule> = {}): StockLotDownsideRule => ({
  ledgerId: 37, categoryId: 10, userId: 7, lotId: 100, version: 1, enabled: true,
  thresholdPrice: 100, downsidePercent: 20, effectiveAt: '2020-01-01T00:00:00Z',
  baselineRawPrice: 100, baselineCountedPrice: 100, currency: 'CNY', ...patch,
});

describe('user × category highest saved revision, all-history contract', () => {
  it('no config and explicit follow_tag retain tag rules', () => {
    expect(isUserTagDownsideExempt([], 20, 10)).toBe(false);
    expect(isUserTagDownsideExempt([override({ mode: 'follow_tag' })], 20, 10)).toBe(false);
    const rules = Object.freeze([Object.freeze(rule())]);
    const kept = userStockDownsideRules(rules, [], 20, 10);
    expect(kept).toEqual(rules); expect(kept).not.toBe(rules); expect(kept[0]).toBe(rules[0]);
  });
  it('latest saved VERSION wins independent of array order/audit dates, without effective-date fields', () => {
    const saved = [override({ version: 2, mode: 'follow_tag', createdAt: '1000-01-01T00:00:00.000Z' }),
      override({ version: 1, createdAt: '9999-12-31T00:00:00.000Z' })];
    expect(isUserTagDownsideExempt(saved, 20, 10)).toBe(false);
    expect(isUserTagDownsideExempt([...saved].reverse(), 20, 10)).toBe(false);
    const newest = override({ version: 3, createdAt: '9999-12-31T00:00:00.000Z' });
    expect(isUserTagDownsideExempt([...saved, newest], 20, 10)).toBe(true);
    expect(newest).not.toHaveProperty('startDate'); expect(newest).not.toHaveProperty('effectiveAt');
  });
  it('exempt is isolated by TARGET user and category, never by actor or stock-rule audit user', () => {
    const saved = [override()];
    expect(isUserTagDownsideExempt(saved, 21, 10)).toBe(false);
    expect(isUserTagDownsideExempt(saved, 20, 11)).toBe(false);
    expect(isUserTagDownsideExempt(saved, 7, 10)).toBe(false);
    expect(userStockDownsideRules([rule({ userId: 20 }), rule({ userId: 7 })], saved, 20, 10)).toEqual([]);
    expect(userStockDownsideRules([rule()], saved, 21, 10)).toHaveLength(1);
  });
  it('removes all lot revisions/enabled states only in ledger37 requested category, without mutation', () => {
    const rules = Object.freeze([rule(), rule({ lotId: 101 }), rule({ version: 2, enabled: false }),
      rule({ ledgerId: 38 }), rule({ categoryId: 11 })].map(value => Object.freeze(value)));
    const saved = Object.freeze([Object.freeze(override())]);
    const beforeRules = JSON.stringify(rules), beforeSaved = JSON.stringify(saved);
    const result = userStockDownsideRules(rules, saved, 20, 10);
    expect(result).toEqual([rules[3], rules[4]]);
    expect(result[0]).toBe(rules[3]); expect(JSON.stringify(rules)).toBe(beforeRules);
    expect(JSON.stringify(saved)).toBe(beforeSaved);
    expect(userStockDownsideRules(rules, saved, 20, 11)).toEqual(rules);
    expect(userStockDownsideRules(rules, saved, 21, 10)).toEqual(rules);
  });
  it('latest exempt restores raw even at OLD historical instants and old member epochs become inapplicable', () => {
    const saved = [override({ createdAt: '9999-12-31T00:00:00.000Z' })];
    const rawRules = [rule()];
    const filtered = userStockDownsideRules(rawRules, saved, 20, 10);
    const oldAt = '2020-01-03T00:00:00Z';
    expect(countedStockLotPrice(50, selectStockLotDownsideRule(rawRules, 100, oldAt))).toBe(90);
    expect(countedStockLotPrice(50, selectStockLotDownsideRule(filtered, 100, oldAt))).toBe(50);
    expect(stockLotDownsideMemberOffset({ lotId: 100, participationId: 88,
      assignedAt: '2020-01-02T00:00:00Z', rules: filtered, asOf: oldAt,
      epochs: [{ ledgerId: 37, categoryId: 10, lotId: 100, participationId: 88, userId: 20,
        effectiveAt: '2020-01-02T00:00:00Z', rawPrice: 50, countedPrice: 90, entryCountedOffset: 40 }] })).toBe(0);
  });
  it.each([{}, { mode: 'follow_tag' }])('even identical or conflicting duplicate revisions must throw %j', patch => {
    expect(() => isUserTagDownsideExempt([override(), override(patch as Partial<UserTagDownsideOverride>)], 20, 10)).toThrow('重复版本');
  });
  it('version uniqueness is per user/category, unrelated valid scope never conflicts', () => {
    expect(isUserTagDownsideExempt([override(), override({ targetUserId: 21 }), override({ categoryId: 11 })], 20, 10)).toBe(true);
  });
  it.each([
    { ledgerId: 38 }, { categoryId: 0 }, { categoryId: '10' }, { categoryId: null },
    { targetUserId: -1 }, { targetUserId: 1.5 }, { actorUserId: 0 }, { actorUserId: Number.MAX_SAFE_INTEGER + 1 },
    { version: 0 }, { version: NaN }, { version: '1' }, { mode: 'normal' }, { mode: null },
    { createdAt: '2026-02-30T00:00:00.000Z' }, { createdAt: '2026-11-26T25:00:00.000Z' },
    { createdAt: '2026-11-26 00:00:00' }, { createdAt: '2026-11-26T00:00:00+08:00' }, { createdAt: undefined },
  ])('damaged contract throws instead of allowing exemption %j', patch => {
    const damaged = override(patch as unknown as Partial<UserTagDownsideOverride>);
    expect(() => isUserTagDownsideExempt([damaged], 20, 10)).toThrow();
    expect(() => userStockDownsideRules([rule()], [damaged], 20, 10)).toThrow();
    // A corrupted unrelated record is never silently accepted either.
    expect(() => isUserTagDownsideExempt([damaged], 999, 999)).toThrow();
  });
  it.each([[0, 10], [20, 0], [NaN, 10], [20, 1.5]])('invalid lookup scope %j throws', (target, category) => {
    expect(() => isUserTagDownsideExempt([], target, category)).toThrow();
  });
  it('nonarray/null override data and malformed rule scopes fail closed', () => {
    expect(() => isUserTagDownsideExempt(null as any, 20, 10)).toThrow();
    expect(() => isUserTagDownsideExempt([null] as any, 20, 10)).toThrow();
    expect(() => userStockDownsideRules([rule({ ledgerId: NaN })], [override()], 20, 10)).toThrow();
    expect(() => userStockDownsideRules([rule({ categoryId: 0 })], [], 20, 10)).toThrow();
  });
});
