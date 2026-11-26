import { describe, expect, it } from 'vitest';
import { buildForcedLiquidationStockDetail } from './forced-liquidation-setting-summary';
import { createStockLotDownsideVersion, type StockLotDownsideRule } from '../shared/stock-lot-downside';
const input = { ledgerId: 37, userId: 7, categoryId: 81, lotId: 101 };
const lot = { id: 101, ledger_id: 37, category_id: 81, symbol: '600000.SH', unit_cost: 100,
  initial_quantity: 20, allocated_quantity: 10, opening_status: 'active', opening_event_type: 'buy',
  actual_traded_at: '2026-11-20 10:00:00' };
const armedAt = '2026-11-26T06:30:17.123Z';
const triggeredAt = '2026-11-26T06:35:17.456Z';
const now = Date.parse('2026-11-26T06:36:00Z');
function waiting(enabled = true) {
  return createStockLotDownsideVersion({ ledgerId: 37, categoryId: 81, lotId: 101, userId: 7, currency: 'CNY',
    expectedVersion: 0, enabled, activationMode: 'auto_drop', autoDropPercent: 12.5, autoEntryPrice: 100,
    currentRawPrice: NaN, effectiveAt: armedAt, armedAt, createdAt: armedAt,
    holdingStartAt: '2026-11-20T10:00:00+08:00' }, null);
}
function triggered() {
  const old = waiting();
  return createStockLotDownsideVersion({ ...old, expectedVersion: old.version,
    currentRawPrice: NaN, effectiveAt: triggeredAt, triggeredAt, createdAt: triggeredAt,
    triggerQuoteAsOf: '2026-11-26T06:35:16.000Z', triggerPrice: 70, triggerSource: '新浪财经' }, old);
}
function stored(r: StockLotDownsideRule, changes: Record<string, unknown> = {}) {
  return { ledger_id: r.ledgerId, category_id: r.categoryId, lot_id: r.lotId, user_id: r.userId, version: r.version,
    enabled: Number(r.enabled), threshold_price: r.thresholdPrice, downside_percent: r.downsidePercent,
    start_date: r.startDate, effective_at: r.effectiveAt, baseline_raw_price: r.baselineRawPrice,
    baseline_counted_price: r.baselineCountedPrice, baseline_source: r.baselineSource, baseline_status: r.baselineStatus,
    holding_start_at: r.holdingStartAt, currency: r.currency, activation_mode: r.activationMode,
    auto_drop_percent: r.autoDropPercent, auto_entry_price: r.autoEntryPrice, armed_at: r.armedAt,
    triggered_at: r.triggeredAt ?? null, trigger_price: r.triggerPrice ?? null,
    trigger_quote_as_of: r.triggerQuoteAsOf ?? null, trigger_source: r.triggerSource ?? null, ...changes };
}
function detail(rule: StockLotDownsideRule, price = 70, changes: Record<string, unknown> = {}, clock = now) {
  return buildForcedLiquidationStockDetail(input, [lot], [{ symbol: lot.symbol, price,
    priceDate: '2026-11-26', updatedAt: '2026-11-26T06:35:16.000Z', source: 'intraday' }], [stored(rule, changes)], clock);
}
describe('automatic settings detail uses persisted trigger only, never activates on read', () => {
  it('waiting below configured floor shows all observed decline effective and zero ineffective', () => {
    const r = waiting(); const before = JSON.stringify(r); const dto = detail(r);
    expect(dto).toMatchObject({ status: 'ready', initialValue: 100, latestValue: 70, remainingQuantity: 10,
      effectiveFunds: 300, ineffectiveFunds: 0 });
    expect(dto.rule).toMatchObject({ activationMode: 'auto_drop', threshold: 87.5, autoDropPercent: 12.5, downsidePercent: 0, armedAt });
    expect(dto.rule?.triggeredAt).toBeUndefined(); expect(dto.notice).toContain('页面读取不会触发');
    expect(JSON.stringify(r)).toBe(before);
  });
  it('confirmed exact intraday rule is ready without pretending effectiveAt is midnight', () => {
    const r = triggered(); const dto = detail(r);
    expect(dto).toMatchObject({ status: 'ready', effectiveFunds: 125, ineffectiveFunds: 175 });
    expect(dto.rule).toMatchObject({ triggeredAt, triggerPrice: 70, triggerQuoteAsOf: '2026-11-26T06:35:16.000Z' });
    expect(dto.notice).toContain('精确时刻'); expect(r.effectiveAt).toBe(triggeredAt);
  });
  it('recovery above the floor restores full calculation while first confirmation audit is retained', () => {
    const r = triggered(); const dto = detail(r, 95);
    expect(dto).toMatchObject({ status: 'ready', effectiveFunds: 50, ineffectiveFunds: 0 });
    expect(dto.rule?.triggeredAt).toBe(triggeredAt); expect(r.triggerPrice).toBe(70);
    expect(detail(r, 70)).toMatchObject({ effectiveFunds: 125, ineffectiveFunds: 175 });
  });
  it('disabled preset remains normal even below the floor', () => {
    expect(detail(waiting(false))).toMatchObject({ status: 'ready', effectiveFunds: 300, ineffectiveFunds: 0 });
  });
  it.each([{ auto_drop_percent: 100 }, { auto_entry_price: 101 }, { downside_percent: 20 },
    { armed_at: null }, { triggered_at: null }, { trigger_quote_as_of: null }, { trigger_price: 90 },
    { effective_at: '2026-11-25T16:00:00Z' }, { start_date: '2026-11-25' }, { trigger_source: '' }])('damaged automatic audit %o stays pending, never convincing money', changes => {
    expect(detail(triggered(), 70, changes)).toMatchObject({ status: 'pending', effectiveFunds: null, ineffectiveFunds: null });
  });
  it('future confirmation does not become effective because its Beijing day matches', () => {
    expect(detail(triggered(), 70, {}, Date.parse('2026-11-26T06:34:00Z'))).toMatchObject({ status: 'pending', ineffectiveFunds: null });
  });
});
