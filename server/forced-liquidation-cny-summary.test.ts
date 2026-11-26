import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ForcedLiquidationSettingDetail } from '../shared/forced-liquidation-display';
import { USDT_USD_PARITY_POLICY } from '../shared/usdt-usd-parity-policy';

// A regression must fail before any forbidden runtime module or real DB can load.
vi.mock('./db', () => { throw new Error('Pure CNY summaries must not load DB'); });
vi.mock('./routers', () => { throw new Error('Pure CNY summaries must not load routers'); });
vi.mock('./ledger-stock-portfolio', () => { throw new Error('Pure CNY summaries must not load portfolio'); });
vi.mock('./_core/index', () => { throw new Error('Pure CNY summaries must not start server'); });
vi.mock('./stock-usd-cny-rate', () => { throw new Error('Pure CNY summaries must receive, not fetch, FX'); });
import { aggregateForcedLiquidationStockSummaries, forcedLiquidationDetailSummary,
  type ForcedLiquidationCnyFx, type ForcedLiquidationIneffectiveSummary } from './forced-liquidation-setting-summary';

const NOW = Date.parse('2026-11-26T01:00:00.000Z');
const FX: ForcedLiquidationCnyFx = { rate: 7.1234, pair: 'USD/CNY', stale: false,
  source: 'sina_usdcny', asOf: '2026-11-26T00:59:00.000Z' };
function detail(currency = 'CNY', ineffectiveFunds: number | null = 160.123456,
  overrides: Partial<ForcedLiquidationSettingDetail> = {}): ForcedLiquidationSettingDetail {
  return { ledgerId: 37, categoryId: 81, lotId: 101, kind: 'stock', currency,
    initialValue: 100, latestValue: 60, latestDate: '2026-11-25', latestSource: 'real_snapshot',
    remainingQuantity: 10, rule: { version: 1, enabled: true, threshold: 80, downsidePercent: 20,
      startDate: '2026-11-20', baselineSource: 'owner_threshold', baselineStatus: 'pending' },
    status: 'ready', notice: '原币详情的真实说明', capitalChange: 0, withdraw: 0,
    effectiveFunds: 240, ineffectiveFunds, fundBasis: 'segmented_price_drop',
    initialToThresholdPercent: 20, thresholdToLatestPercent: 25, ...overrides };
}
const summary = (currency: string, value: number, fx: ForcedLiquidationCnyFx | null = FX) =>
  forcedLiquidationDetailSummary(detail(currency, value), fx, NOW);
function displayedCents(value: number): number {
  return Number(value.toFixed(2).replace('.', ''));
}
function nativeFields(s: ForcedLiquidationIneffectiveSummary) {
  return { ineffectiveFunds: s.ineffectiveFunds, ineffectiveCurrency: s.ineffectiveCurrency,
    ineffectiveNotice: s.ineffectiveNotice, ineffectiveStatus: s.ineffectiveStatus,
    ineffectiveCurrencies: s.ineffectiveCurrencies };
}

 describe('detail CNY display is isolated from native DTO and accounting', () => {
  it('CNY needs no FX, keeps raw native precision and a signed ordinary recovery', () => {
    expect(summary('CNY', 160.123456, null)).toMatchObject({ ineffectiveFunds: 160.123456,
      ineffectiveCurrency: 'CNY', ineffectiveStatus: 'ready', ineffectiveFundsCny: 160.12,
      ineffectiveCnyStatus: 'ready' });
    const dto = detail('CNY', -8.126, { kind: 'ordinary', lotId: null,
      fundBasis: 'cashflow_neutral_replay', rawPnl: -10.25, countedPnl: -2.124 });
    const s = forcedLiquidationDetailSummary(dto, null, NOW);
    expect(s).toMatchObject({ ineffectiveFunds: -8.126, ineffectiveFundsCny: -8.13,
      ineffectiveStatus: 'ready', ineffectiveCnyStatus: 'ready' });
    expect(s.ineffectiveCnyFx).toBeUndefined(); expect(s.ineffectiveCnyPolicy).toBeUndefined();
  });
  it('even invalid/stale injected FX cannot invalidate CNY passthrough', () => {
    expect(summary('CNY', 12.345, { ...FX, stale: true, rate: NaN, source: '' })).toMatchObject({
      ineffectiveFundsCny: 12.35, ineffectiveCnyStatus: 'ready' });
    expect(forcedLiquidationDetailSummary(detail('CNY', 12.345))).toMatchObject({ ineffectiveFundsCny: 12.35 });
  });
  it.each(['USD', 'USDT'])('%s converts with the identical validated USD/CNY quote', currency => {
    const s = summary(currency, 10.125);
    expect(s).toMatchObject({ ineffectiveFunds: 10.125, ineffectiveCurrency: currency,
      ineffectiveStatus: 'ready', ineffectiveFundsCny: 72.12, ineffectiveCnyStatus: 'ready', ineffectiveCnyFx: FX });
    expect(s.ineffectiveCnyFx).not.toBe(FX);
    expect(s.ineffectiveCnyPolicy).toBe(currency === 'USDT' ? USDT_USD_PARITY_POLICY : undefined);
    if (currency === 'USDT') expect(s.ineffectiveCnyNotice).toContain('USDT=USD');
  });
  it('USD and USDT share amount/evidence and preserve signed values', () => {
    const usd = summary('USD', -3.246), usdt = summary('USDT', -3.246);
    expect(usd.ineffectiveFundsCny).toBe(-23.12);
    expect(usdt.ineffectiveFundsCny).toBe(usd.ineffectiveFundsCny);
    expect(usdt.ineffectiveCnyFx).toEqual(usd.ineffectiveCnyFx);
  });
  it.each([['CNY', 0], ['USD', 0], ['USDT', 0], ['CNY', -0], ['USD', -0], ['USDT', -0]] as const)(
    '%s zero (%s) is ready +0, never a missing placeholder', (currency, value) => {
      const s = summary(currency, value);
      expect(s.ineffectiveFundsCny).toBe(0); expect(Object.is(s.ineffectiveFundsCny, -0)).toBe(false);
      expect(s.ineffectiveCnyStatus).toBe('ready');
    });
  it.each([[1.005, 1.01], [-1.005, -1.01], [2.675, 2.68], [-2.675, -2.68], [0.005, 0.01],
    [-0.005, -0.01], [0.0049, 0], [-0.0049, 0], [1e-7, 0]])(
    'display decimal rounding %s -> %s leaves native unrounded', (value, expected) => {
      const s = summary('CNY', value, null);
      expect(s.ineffectiveFundsCny).toBe(expected); expect(s.ineffectiveFunds).toBe(value);
    });
  it('detail DTO, native notice/rule/precision/PnL are never mutated, including shared FX evidence', () => {
    const dto = detail('USDT', -8.123456789, { kind: 'ordinary', fundBasis: 'cashflow_neutral_replay',
      rawPnl: -10.123456789, countedPnl: -2, capitalChange: 50.123456789, withdraw: 5.123456789 });
    const before = structuredClone(dto); Object.freeze(dto.rule); Object.freeze(dto);
    const fx = Object.freeze({ ...FX });
    const s = forcedLiquidationDetailSummary(dto, fx, NOW);
    expect(dto).toEqual(before); expect(nativeFields(s)).toEqual({ ineffectiveFunds: before.ineffectiveFunds,
      ineffectiveCurrency: before.currency, ineffectiveNotice: before.notice, ineffectiveStatus: before.status,
      ineffectiveCurrencies: undefined });
    expect(fx).toEqual(FX);
    s.ineffectiveCnyFx!.rate = 1;
    expect(fx.rate).toBe(FX.rate);
  });
});

describe('missing or invalid CNY evidence stays null/pending, never native fallback or fake zero', () => {
  it.each(['USD', 'USDT'])('%s requires FX even for a genuine native zero', currency => {
    for (const value of [160, 0]) {
      const s = summary(currency, value, null);
      expect(s).toMatchObject({ ineffectiveFunds: value, ineffectiveStatus: 'ready',
        ineffectiveFundsCny: null, ineffectiveCnyStatus: 'pending' });
      expect(s.ineffectiveCnyNotice).toBeTruthy(); expect(s.ineffectiveCnyFx).toBeUndefined();
    }
  });
  const invalidFx: Array<[string, Record<string, unknown>]> = [
    ['stale', { stale: true }], ['missing stale', { stale: undefined }], ['non-boolean stale', { stale: 0 }],
    ['wrong pair', { pair: 'USDT/CNY' }], ['missing pair', { pair: undefined }],
    ['zero rate', { rate: 0 }], ['negative rate', { rate: -7 }], ['NaN rate', { rate: NaN }],
    ['infinite rate', { rate: Infinity }], ['negative infinity rate', { rate: -Infinity }], ['string rate', { rate: '7' }],
    ['empty source', { source: '' }], ['blank source', { source: ' \t ' }],
    ['missing source', { source: undefined }], ['non-string source', { source: 1 }],
    ['invalid asOf', { asOf: 'bad' }], ['empty asOf', { asOf: '' }], ['blank asOf', { asOf: ' ' }],
    ['non-string asOf', { asOf: NOW }], ['missing asOf', { asOf: undefined }],
    ['impossible calendar date', { asOf: '2026-02-30T00:00:00.000Z' }],
    ['future by 1ms', { asOf: '2026-11-26T01:00:00.001Z' }], ['future date', { asOf: '2099-01-01T00:00:00Z' }],
  ];
  it.each(invalidFx)('%s cannot support USD or USDT display', (_name, override) => {
    const fx = { ...FX, ...override } as ForcedLiquidationCnyFx;
    for (const currency of ['USD', 'USDT']) {
      const s = summary(currency, 160, fx);
      expect(s).toMatchObject({ ineffectiveFunds: 160, ineffectiveStatus: 'ready', ineffectiveFundsCny: null,
        ineffectiveCnyStatus: 'pending' }); expect(s.ineffectiveCnyFx).toBeUndefined();
    }
  });
  it('upstream stale=false owns market-close/holiday age; no alternate freshness threshold', () => {
    const oldButUpstreamValid = { ...FX, asOf: '2026-11-20T08:00:00.000Z' };
    expect(summary('USD', 1, oldButUpstreamValid).ineffectiveCnyStatus).toBe('ready');
    expect(summary('USD', 1, { ...FX, asOf: new Date(NOW).toISOString() }).ineffectiveCnyStatus).toBe('ready');
    expect(forcedLiquidationDetailSummary(detail('USD', 1), FX, NaN).ineffectiveCnyStatus).toBe('pending');
  });
  it.each(['pending', 'no_data'] as const)('%s detail cannot be made ready by FX or a numeric native placeholder', status => {
    const dto = detail('USD', 160, { status }); const before = structuredClone(dto);
    expect(forcedLiquidationDetailSummary(dto, FX, NOW)).toMatchObject({ ineffectiveFunds: null,
      ineffectiveStatus: status, ineffectiveFundsCny: null, ineffectiveCnyStatus: 'pending' });
    expect(dto).toEqual(before);
  });
  it.each([null, NaN, Infinity, -Infinity])('nonfinite/null native %s stays raw while CNY becomes pending', value => {
    const s = forcedLiquidationDetailSummary(detail('CNY', value), FX, NOW);
    expect(s.ineffectiveFunds).toBe(value); expect(s.ineffectiveStatus).toBe('ready');
    expect(s.ineffectiveFundsCny).toBeNull(); expect(s.ineffectiveCnyStatus).toBe('pending');
  });
  it.each(['HKD', '', 'usd', 'UNKNOWN'])('unknown %s never borrows a native or category currency', currency => {
    expect(summary(currency, 100)).toMatchObject({ ineffectiveFunds: 100, ineffectiveStatus: 'ready',
      ineffectiveFundsCny: null, ineffectiveCnyStatus: 'pending' });
    expect(summary(currency, 100).ineffectiveCurrency).toBeUndefined();
  });
  it.each(['CNY', 'USD', 'USDT'])('%s overflow/unsafe cents gives null/pending without affecting native', currency => {
    for (const value of [Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_SAFE_INTEGER]) {
      expect(summary(currency, value)).toMatchObject({ ineffectiveFunds: value, ineffectiveStatus: 'ready',
        ineffectiveFundsCny: null, ineffectiveCnyStatus: 'pending' });
    }
  });
  it('finite rate/native product overflow is not silently replaced by native or zero', () => {
    expect(summary('USD', 2, { ...FX, rate: Number.MAX_VALUE })).toMatchObject({
      ineffectiveFunds: 2, ineffectiveFundsCny: null, ineffectiveCnyStatus: 'pending' });
  });
  it('even safe integer cents must survive display number rendering exactly', () => {
    expect(summary('CNY', 90071992547409.9, null)).toMatchObject({ ineffectiveFundsCny: null,
      ineffectiveCnyStatus: 'pending' });
  });
});

describe('category CNY equals every enabled displayed child in integer cents', () => {
  it('mixed CNY/USD/USDT total can be ready while legacy native aggregation is mixed/pending', () => {
    const stocks = [summary('CNY', 10.125), summary('USD', 10.125), summary('USDT', 10.125)];
    const before = structuredClone(stocks);
    const result = aggregateForcedLiquidationStockSummaries(stocks);
    expect(result).toMatchObject({ ineffectiveFundsCny: 154.37, ineffectiveCnyStatus: 'ready',
      ineffectiveFunds: null, ineffectiveStatus: 'pending', ineffectiveCurrencies: ['CNY', 'USD', 'USDT'] });
    expect(result.ineffectiveCurrency).toBeUndefined(); expect(result.ineffectiveNotice).toContain('不跨币种');
    expect(result.ineffectiveCnyFx).toBeUndefined(); expect(stocks).toEqual(before);
    expect(displayedCents(result.ineffectiveFundsCny!)).toBe(stocks.reduce((n, s) => n + displayedCents(s.ineffectiveFundsCny!), 0));
  });
  it('sum per-child display rounding, not raw native sum then rounding', () => {
    const stocks = [summary('CNY', 0.005), summary('CNY', 0.005), summary('CNY', 0.005)];
    const result = aggregateForcedLiquidationStockSummaries(stocks);
    expect(stocks.map(s => s.ineffectiveFundsCny)).toEqual([0.01, 0.01, 0.01]);
    expect(result.ineffectiveFunds).toBe(0.015); expect(result.ineffectiveFundsCny).toBe(0.03);
    expect(displayedCents(result.ineffectiveFundsCny!)).toBe(stocks.reduce((n, s) => n + displayedCents(s.ineffectiveFundsCny!), 0));
  });
  it('large repeated child count still sums display cents, including signed values and zero', () => {
    const stocks = Array.from({ length: 1000 }, () => summary('CNY', 0.105));
    stocks.push(summary('USD', -0.01), summary('USDT', 0));
    const result = aggregateForcedLiquidationStockSummaries(stocks);
    expect(result.ineffectiveFundsCny).toBe(109.93);
    expect(displayedCents(result.ineffectiveFundsCny!)).toBe(stocks.reduce((n, s) => n + displayedCents(s.ineffectiveFundsCny!), 0));
  });
  it('uses existing display evidence, never recalculates native/FX even when they differ', () => {
    const stocks: ForcedLiquidationIneffectiveSummary[] = [
      { ineffectiveFunds: 999, ineffectiveCurrency: 'USD', ineffectiveStatus: 'ready',
        ineffectiveFundsCny: 0.01, ineffectiveCnyStatus: 'ready' },
      { ineffectiveFunds: 1, ineffectiveCurrency: 'USDT', ineffectiveStatus: 'ready',
        ineffectiveFundsCny: 0.02, ineffectiveCnyStatus: 'ready' },
    ];
    expect(aggregateForcedLiquidationStockSummaries(stocks)).toMatchObject({ ineffectiveFundsCny: 0.03,
      ineffectiveCnyStatus: 'ready', ineffectiveFunds: null, ineffectiveStatus: 'pending' });
  });
  it('genuine mixed-currency all-zero parent is ready positive zero', () => {
    const result = aggregateForcedLiquidationStockSummaries(['CNY', 'USD', 'USDT'].map(c => summary(c, 0)));
    expect(result.ineffectiveFundsCny).toBe(0); expect(Object.is(result.ineffectiveFundsCny, -0)).toBe(false);
    expect(result.ineffectiveCnyStatus).toBe('ready');
  });
  const missing: Array<[string, ForcedLiquidationIneffectiveSummary]> = [
    ['missing fields', {}], ['legacy native only', { ineffectiveFunds: 160, ineffectiveCurrency: 'CNY', ineffectiveStatus: 'ready' }],
    ['pending', { ineffectiveFundsCny: 100, ineffectiveCnyStatus: 'pending' }],
    ['no data', { ineffectiveFundsCny: null, ineffectiveCnyStatus: 'no_data' }],
    ['null ready', { ineffectiveFundsCny: null, ineffectiveCnyStatus: 'ready' }],
    ['NaN ready', { ineffectiveFundsCny: NaN, ineffectiveCnyStatus: 'ready' }],
    ['infinity ready', { ineffectiveFundsCny: Infinity, ineffectiveCnyStatus: 'ready' }],
    ['unrounded child', { ineffectiveFundsCny: 0.005, ineffectiveCnyStatus: 'ready' }],
    ['unsafe cents', { ineffectiveFundsCny: Number.MAX_SAFE_INTEGER, ineffectiveCnyStatus: 'ready' }],
  ];
  it.each(missing)('%s in any enabled child blocks the entire CNY sum', (_name, child) => {
    const result = aggregateForcedLiquidationStockSummaries([summary('CNY', 160), child]);
    expect(result.ineffectiveFundsCny).toBeNull(); expect(result.ineffectiveCnyStatus).toBe('pending');
    expect(result.ineffectiveCnyNotice).toBeTruthy();
  });
  it('mixed enabled partial FX blocks CNY, while same-currency native still independently ready', () => {
    expect(aggregateForcedLiquidationStockSummaries([summary('CNY', 160), summary('USD', 160, null)])).toMatchObject({
      ineffectiveFundsCny: null, ineffectiveCnyStatus: 'pending', ineffectiveFunds: null, ineffectiveStatus: 'pending' });
    expect(aggregateForcedLiquidationStockSummaries([summary('USD', 160), summary('USD', 160, null)])).toMatchObject({
      ineffectiveFundsCny: null, ineffectiveCnyStatus: 'pending', ineffectiveFunds: 320, ineffectiveStatus: 'ready' });
  });
  it('safe child cents but unsafe parent total becomes pending; no partial sum', () => {
    const stocks = [summary('CNY', 50_000_000_000_000), summary('CNY', 50_000_000_000_000)];
    expect(stocks.every(s => s.ineffectiveCnyStatus === 'ready')).toBe(true);
    expect(aggregateForcedLiquidationStockSummaries(stocks)).toMatchObject({ ineffectiveFunds: 100_000_000_000_000,
      ineffectiveStatus: 'ready', ineffectiveFundsCny: null, ineffectiveCnyStatus: 'pending' });
  });
  it('empty enabled-stock input remains exactly {}, without synthetic zero/status', () => {
    expect(aggregateForcedLiquidationStockSummaries([])).toEqual({});
  });
});

describe('old native aggregation remains compatible and pure', () => {
  const native = (value: number, currency: 'CNY' | 'USD' | 'USDT' = 'CNY'): ForcedLiquidationIneffectiveSummary =>
    ({ ineffectiveFunds: value, ineffectiveCurrency: currency, ineffectiveStatus: 'ready' });
  it.each(['CNY', 'USD', 'USDT'] as const)('%s same-currency native raw sum is unchanged without CNY evidence', currency => {
    const s = aggregateForcedLiquidationStockSummaries([native(160.123456, currency), native(0, currency), native(5, currency)]);
    expect(nativeFields(s)).toEqual({ ineffectiveFunds: 165.123456, ineffectiveCurrency: currency,
      ineffectiveStatus: 'ready', ineffectiveCurrencies: [currency],
      ineffectiveNotice: '仅汇总同币种已开启真实持仓的当期分段无效金额，不含未开启持仓、历史PnL或钱包余额' });
    expect(s.ineffectiveFundsCny).toBeNull(); expect(s.ineffectiveCnyStatus).toBe('pending');
  });
  it.each([['CNY', 'USD'], ['USD', 'USDT'], ['USDT', 'CNY']] as const)('native mixed %s/%s remains pending', (left, right) => {
    const s = aggregateForcedLiquidationStockSummaries([native(160, left), native(5, right)]);
    expect(s.ineffectiveFunds).toBeNull(); expect(s.ineffectiveStatus).toBe('pending');
    expect(s.ineffectiveCurrency).toBeUndefined(); expect(s.ineffectiveCurrencies).toEqual([left, right]);
  });
  it('native partial/no_data/nonfinite/overflow remain null rather than changing the old contract', () => {
    for (const child of [{ ...native(5), ineffectiveStatus: 'pending' as const },
      { ...native(5), ineffectiveStatus: 'no_data' as const }, native(NaN), native(Infinity), {}]) {
      expect(aggregateForcedLiquidationStockSummaries([native(160), child])).toMatchObject({
        ineffectiveFunds: null, ineffectiveStatus: 'pending' });
    }
    expect(aggregateForcedLiquidationStockSummaries([native(Number.MAX_VALUE), native(Number.MAX_VALUE)])).toMatchObject({
      ineffectiveFunds: null, ineffectiveStatus: 'pending', ineffectiveNotice: '同币种已开启持仓汇总溢出' });
  });
  it('summary source has no DB/network/timer or production runtime import', () => {
    const source = readFileSync(new URL('./forced-liquidation-setting-summary.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/getDbConnection|\.execute\(|\b(?:fetch|setInterval|setTimeout|beginTransaction)\s*\(/);
    expect(source).not.toMatch(/from ['"][^'"]*(?:routers|ledger-stock-portfolio|stock-usd-cny-rate|_core\/index)/);
  });
});
