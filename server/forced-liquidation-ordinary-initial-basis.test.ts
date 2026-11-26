import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const isolation = vi.hoisted(() => ({ denied: vi.fn(() => { throw new Error('real DB/network forbidden'); }) }));
vi.mock('./db', () => ({ getDbConnection: isolation.denied, getDbTransactionConnection: isolation.denied }));
vi.mock('mysql2/promise', () => ({ default: { createConnection: isolation.denied, createPool: isolation.denied }, createConnection: isolation.denied, createPool: isolation.denied }));
vi.mock('mysql2', () => ({ default: { createConnection: isolation.denied, createPool: isolation.denied }, createConnection: isolation.denied, createPool: isolation.denied }));
vi.mock('node:http', () => ({ default: { request: isolation.denied, get: isolation.denied }, request: isolation.denied, get: isolation.denied }));
vi.mock('node:https', () => ({ default: { request: isolation.denied, get: isolation.denied }, request: isolation.denied, get: isolation.denied }));
vi.mock('node:net', () => ({ default: { connect: isolation.denied, createConnection: isolation.denied }, connect: isolation.denied, createConnection: isolation.denied }));
vi.mock('node:tls', () => ({ default: { connect: isolation.denied }, connect: isolation.denied }));
// Only encryption decoding is stubbed; the real cash-neutral engine remains unchanged.
vi.mock('./encryption', () => ({ isEncrypted: (v: string) => v.startsWith('enc:v1:'),
  decryptValue: (v: string) => v === 'enc:v1:known-capital-add' ? 'capital_add' : v }));
import { buildForcedLiquidationOrdinaryDetail, forcedLiquidationDetailSummary } from './forced-liquidation-setting-summary';
import { calculateOrdinaryTagDownsideSeries, type OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';

const input = { ledgerId: 37, userId: 7, categoryId: 81 };
const name = '真实标签';
const config = (value: unknown = 100) => ({ ledger_id: 37, tag_name: name, initial_amount: value });
const rule = (overrides: Partial<OrdinaryTagDownsideRule> = {}): OrdinaryTagDownsideRule => ({ ledgerId: 37,
  categoryId: 81, userId: 7, version: 1, enabled: true, thresholdAmount: 80, downsidePercent: 20,
  startDate: '2026-11-20', createdAt: '2026-11-26T00:00:00.000Z', ...overrides });
const record = (id: number, recordDate: string, amount: unknown, overrides: Record<string, unknown> = {}) => ({
  ledgerId: 37, categoryId: 81, id, recordDate, amount, type: 'income',
  createdAt: `${recordDate} 12:00:00.000000`, deletedAt: null, description: null, ...overrides });
const balanceRecords = () => [record(1, '2026-11-20', 100), record(2, '2026-11-25', 60)];
const build = (configs: any[] = [config()], records: any[] = balanceRecords(), rules = [rule()]) =>
  buildForcedLiquidationOrdinaryDetail(input, name, configs, records, rules, '2026-11-26');
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', isolation.denied); });
afterEach(() => { expect(isolation.denied).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe('ordinary initial amount priority and evidence', () => {
  it('configured principal can differ from first canonical balance, keeps observed initial date and source', () => {
    const records = balanceRecords(); records[0].amount = 99;
    const before = JSON.stringify(records);
    const dto = build([config('100')], records);
    expect(dto).toMatchObject({ initialValue: 100, initialBasis: 'configured', initialSource: 'ledger_tag_config:initial_amount',
      initialDate: '2026-11-20', latestValue: 60, rawPnl: 40, effectiveFunds: 24, ineffectiveFunds: 16, status: 'ready' });
    expect(dto.notice).toContain('管理员配置'); expect(dto.notice).toContain('不代表真实开户日或管理员填写日');
    expect(dto.notice).toContain('不是钱包金额或实际成交'); expect(JSON.stringify(records)).toBe(before);
  });
  it.each([null, undefined, '', '  \t\n'])('empty %s uses first balance, never account/member/threshold/date guess', initial => {
    const dto = build([{ ...config(), initial_amount: initial, account_balance: 999, original_amount: 888, __startDate: '2026-01-01' }]);
    expect(dto).toMatchObject({ initialBasis: 'first_balance', initialValue: 100, initialSource: 'ledger_records:1',
      initialDate: '2026-11-20', rawPnl: 40, effectiveFunds: 24, status: 'ready' });
    expect(dto.notice).toContain('此前和同日资金流已包含于首余额，不重复计入');
  });
  it('no config or missing initial column uses first canonical balance, not a later valid row', () => {
    for (const configs of [[], [{ ledger_id: 37, tag_name: name }]]) {
      expect(build(configs)).toMatchObject({ initialValue: 100, initialBasis: 'first_balance', status: 'ready' });
    }
  });
  it.each([0, '0', ' 0 '])('real configured zero %s is not missing even when first balance is nonzero', initial => {
    const dto = build([config(initial)], [record(1, '2026-11-20', 50), record(2, '2026-11-25', 50)], [rule({ enabled: false })]);
    expect(dto).toMatchObject({ initialValue: 0, initialBasis: 'configured', status: 'ready', rawPnl: -50,
      effectiveFunds: -50, ineffectiveFunds: 0, initialToThresholdPercent: null });
  });
  it('fallback real zero is an available first balance', () => {
    expect(build([], [record(1, '2026-11-20', 0), record(2, '2026-11-25', 0)])).toMatchObject({
      initialValue: 0, initialBasis: 'first_balance', status: 'ready', rawPnl: 0, effectiveFunds: 0 });
  });
  it.each([-1, '-1', 'bad', '1e309', Infinity, NaN, false, {}, 'enc:v1:broken'])('explicit invalid %s cannot wash into fallback', initial => {
    expect(build([config(initial)])).toMatchObject({ initialValue: null, initialBasis: 'configured', status: 'pending',
      latestValue: 60, effectiveFunds: null, ineffectiveFunds: null });
  });
  it.each([[{ ledger_id: 52, tag_name: name, initial_amount: 100 }],
    [{ ledger_id: 37, tag_name: '另一标签', initial_amount: null }], [config(), config()],
    [config(), { ledger_id: 52, tag_name: name, initial_amount: 100 }], [null]].map(configs => ({ configs })))('duplicate/mismatched/damaged config %o stays pending', ({ configs }) => {
    const dto = build(configs);
    expect(dto).toMatchObject({ initialValue: null, status: 'pending', effectiveFunds: null });
    expect(dto.initialBasis).toBeUndefined(); expect(dto.notice).toContain('范围不匹配或配置重复');
  });
  it.each([null, 'bad', -1, '1e309'])('invalid first canonical %s cannot skip to later balance under either source', initial => {
    const records = [record(1, '2026-11-20', 100), record(3, '2026-11-20', initial), record(4, '2026-11-25', 60)];
    for (const configs of [[], [config()]]) {
      const dto = build(configs, records);
      expect(dto).toMatchObject({ status: 'pending', latestValue: 60, effectiveFunds: null });
      expect(dto.notice).toContain('首个canonical真实余额无效');
    }
  });
  it('same-day canonical last by microseconds/id, not earliest individual row', () => {
    const records = [record(4, '2026-11-20', 98, { createdAt: '2026-11-20 12:00:00.000001' }),
      record(3, '2026-11-20', 'bad'), ...balanceRecords()];
    expect(build([], records)).toMatchObject({ initialValue: 98, initialSource: 'ledger_records:4', status: 'ready' });
  });
  it('no real balance is no_data for both sources, never transfer/config synthetic balance', () => {
    const records = [record(1, '2026-11-20', 100, { type: 'transfer', description: 'capital_add' })];
    for (const configs of [[], [config()]]) expect(build(configs, records)).toMatchObject({ status: 'no_data', latestValue: null, effectiveFunds: null });
  });
});

describe('ordinary true history flow and rule boundaries', () => {
  it('configured replays preceding transfer-only and first balance day flows in full, without synthetic baseline', () => {
    const records = [record(1, '2026-11-19', 20, { type: 'transfer', description: 'capital_add' }),
      record(2, '2026-11-20', 10, { type: 'transfer', description: 'capital_add' }),
      record(3, '2026-11-20', 130), record(4, '2026-11-25', 130)];
    expect(build([config()], records)).toMatchObject({ initialDate: '2026-11-19', initialValue: 100, status: 'ready',
      capitalChange: 30, withdraw: 0, rawPnl: 0, effectiveFunds: 0, ineffectiveFunds: 0 });
  });
  it.each([['capital_add', 20, 120, 20, 0], ['capital_remove', 20, 80, -20, 0], ['withdraw', 20, 80, 0, 20]] as const)(
    'configured first-day pure %s is fair zero performance', (description, amount, balance, capitalChange, withdraw) => {
      const records = [record(1, '2026-11-20', amount, { type: 'transfer', description }), record(2, '2026-11-20', balance), record(3, '2026-11-25', balance)];
      expect(build([config()], records)).toMatchObject({ status: 'ready', capitalChange, withdraw, rawPnl: 0,
        countedPnl: 0, effectiveFunds: 0, ineffectiveFunds: 0 });
    });
  it('fallback ignores valid preceding/same-day flows already in baseline, then replays all later real flows', () => {
    const records = [record(1, '2026-11-19', 20, { type: 'transfer', description: 'capital_add' }),
      record(2, '2026-11-20', 10, { type: 'transfer', description: 'capital_add' }), record(3, '2026-11-20', 130),
      record(4, '2026-11-21', 30, { type: 'transfer', description: 'capital_add' }),
      record(5, '2026-11-22', 20, { type: 'transfer', description: 'withdraw' }), record(6, '2026-11-25', 140)];
    expect(build([], records)).toMatchObject({ initialDate: '2026-11-20', initialValue: 130, initialBasis: 'first_balance',
      capitalChange: 30, withdraw: 20, rawPnl: 0, countedPnl: 0, status: 'ready' });
  });
  it.each([['capital_add', 20, 80], ['capital_remove', 20, 40], ['withdraw', 20, 40]] as const)(
    'fallback below-K baseline pure %s remains zero performance', (description, amount, latest) => {
      const records = [record(1, '2026-11-20', 60), record(2, '2026-11-22', amount, { type: 'transfer', description }), record(3, '2026-11-25', latest)];
      expect(build([], records)).toMatchObject({ initialValue: 60, initialBasis: 'first_balance', status: 'ready',
        rawPnl: 0, countedPnl: 0, effectiveFunds: 0, ineffectiveFunds: 0 });
    });
  it.each(['2026-11-19', '2026-11-20', '2026-11-22', '2026-11-26'])('undecodable/invalid transfer on %s cannot disappear under either source', day => {
    for (const configs of [[], [config()]]) for (const bad of [{ amount: 'bad', description: 'capital_add' }, { amount: 10, description: 'enc:v1:unreadable' }]) {
      const dto = build(configs, [...balanceRecords(), record(3, day, bad.amount, { type: 'transfer', description: bad.description })]);
      expect(dto).toMatchObject({ status: 'pending', effectiveFunds: null, ineffectiveFunds: null });
    }
  });
  it('decoded transfer uses its actual capital classification', () => {
    const records = [record(1, '2026-11-20', 100), record(2, '2026-11-22', 20, { type: 'transfer', description: 'enc:v1:known-capital-add' }), record(3, '2026-11-25', 120)];
    expect(build([config()], records)).toMatchObject({ status: 'ready', capitalChange: 20, rawPnl: 0, effectiveFunds: 0 });
  });
  it('valid transfer-only after latest balance is not invented as a new balance or silently dropped', () => {
    expect(build([config()], [...balanceRecords(), record(3, '2026-11-26', 10, { type: 'transfer', description: 'capital_add' })])).toMatchObject({
      status: 'pending', latestDate: '2026-11-25', latestValue: 60, effectiveFunds: null });
  });
  it('foreign ledger/category/deleted/future bad balances and transfers cannot contaminate either source', () => {
    const foreign = [{ ledgerId: 52 }, { categoryId: 82 }, { deletedAt: '2026-11-26 00:00:00' }, { deleted_at: '2026-11-26 00:00:00' }, { recordDate: '2099-01-01' }];
    const injected = foreign.flatMap((scope, i) => [record(10 + i, '2026-11-19', 'bad', scope), record(20 + i, '2026-11-26', 'bad', { type: 'transfer', ...scope })]);
    for (const configs of [[], [config()]]) expect(build(configs, [...balanceRecords(), ...injected])).toMatchObject({
      status: 'ready', initialDate: '2026-11-20', initialValue: 100, latestValue: 60, effectiveFunds: 24 });
  });
  it.each([{ thresholdAmount: NaN }, { downsidePercent: 101 }, { startDate: 'bad' }, { version: NaN }, { enabled: 1 as any }])('latest invalid rule %o stays pending, never older fallback', bad => {
    expect(build([config()], balanceRecords(), [rule(), rule({ version: 3, ...bad })])).toMatchObject({ status: 'pending', effectiveFunds: null });
  });
  it('latest future rule remains pending and foreign rules cannot affect replay', () => {
    expect(build([config()], balanceRecords(), [rule(), rule({ version: 3, startDate: '2099-01-01' })])).toMatchObject({ status: 'pending', rule: { version: 3 }, effectiveFunds: null });
    expect(build([config()], balanceRecords(), [rule(), rule({ ledgerId: 52 as any, version: 99, downsidePercent: NaN }), rule({ categoryId: 82, version: 100 })])).toMatchObject({ status: 'ready', effectiveFunds: 24 });
  });
  it('cumulative transfer overflow and numeric performance overflow stay pending', () => {
    for (const configs of [[], [config()]]) expect(build(configs, [...balanceRecords(),
      record(3, '2026-11-21', '1e308', { type: 'transfer', description: 'capital_add' }),
      record(4, '2026-11-22', '1e308', { type: 'transfer', description: 'capital_add' })])).toMatchObject({ status: 'pending', effectiveFunds: null });
    expect(build([], [...balanceRecords(),
      record(3, '2026-11-18', '1e308', { type: 'transfer', description: 'capital_add' }),
      record(4, '2026-11-19', '1e308', { type: 'transfer', description: 'capital_add' })])).toMatchObject({ status: 'pending', effectiveFunds: null });
    expect(build([config('1e308')], [record(1, '2026-11-20', '1e308'), record(2, '2026-11-21', '1e308', { type: 'transfer', description: 'capital_add' }), record(3, '2026-11-25', 0)])).toMatchObject({ status: 'pending', effectiveFunds: null });
  });
});

// Only the authorized category's canonical dates/amounts from the read-only snapshot are
// embedded. No personal data, credentials, production DB read, or private-path dependency.
const realBalances: Array<[string, number]> = [
  ['2026-09-15', 97878.50], ['2026-09-16', 98269.50], ['2026-09-17', 98813.50], ['2026-09-18', 107721.50],
  ['2026-09-21', 106956.50], ['2026-09-22', 105188.50], ['2026-09-23', 104287.50], ['2026-09-24', 100054.50],
  ['2026-09-28', 93934.50], ['2026-09-29', 93424.50], ['2026-09-30', 92608.50], ['2026-10-08', 90364.50],
  ['2026-10-09', 88426.50], ['2026-10-12', 80062.50], ['2026-10-13', 82238.50], ['2026-10-14', 81830.50],
  ['2026-10-15', 78209.50], ['2026-10-16', 78549.50], ['2026-10-19', 77716.50], ['2026-10-20', 78243.50],
  ['2026-10-21', 81014.50], ['2026-10-22', 75914.50], ['2026-10-23', 77665.50], ['2026-10-26', 74826.50],
  ['2026-10-27', 72514.50], ['2026-10-28', 74724.50], ['2026-10-29', 70134.50], ['2026-10-30', 64898.50],
  ['2026-11-02', 67686.50], ['2026-11-03', 62348.50], ['2026-11-04', 68111.50], ['2026-11-05', 68111.50],
  ['2026-11-06', 64863.37], ['2026-11-09', 65025.37], ['2026-11-10', 66393.37], ['2026-11-11', 68139.37],
  ['2026-11-12', 66393.37], ['2026-11-13', 59877.37], ['2026-11-16', 56050.30], ['2026-11-17', 52702.30],
  ['2026-11-18', 56230.30], ['2026-11-19', 50656.83], ['2026-11-20', 45587.83], ['2026-11-23', 46586.83],
  ['2026-11-24', 46105.83], ['2026-11-25', 42804.37], ['2026-11-26', 44915.37],
];

describe('authorized YCX10 snapshot replay: config 100000 != first 97878.50', () => {
  it('all 47 actual balances ready; 2026-11-25 K90000/r80 does not backfill earlier downside', () => {
    const categoryId = 90246, target = 'YCX10同花顺0911';
    const records = realBalances.map(([day, balance], i) => record(i === 0 ? 3604 : i === 46 ? 4815 : 5000 + i, day, balance, { categoryId, type: 'expense' }));
    const rules = [rule({ categoryId, version: 1, thresholdAmount: 90000, downsidePercent: 80, startDate: '2026-11-26' }),
      rule({ categoryId, version: 2, thresholdAmount: 90000, downsidePercent: 80, startDate: '2026-11-25' }),
      rule({ categoryId, version: 3, thresholdAmount: 90000, downsidePercent: 80, startDate: '2026-11-25' })];
    const before = JSON.stringify({ records, rules });
    const dto = buildForcedLiquidationOrdinaryDetail({ ...input, categoryId }, target,
      [{ ledger_id: 37, tag_name: target, initial_amount: '100000' }], records, rules, '2026-11-26');
    const points = realBalances.map(([date, rawBalance]) => ({ date, rawBalance, capitalChange: 0, withdraw: 0 }));
    const series = calculateOrdinaryTagDownsideSeries({ ledgerId: 37, categoryId, initialAmount: 100000, entryDate: '2026-09-15', ratio: 100, points, rules });
    expect(series).toHaveLength(47);
    for (const point of series.filter(p => p.date < '2026-11-25')) { expect(point.status).toBe('ready'); expect(point.countedPnl).toBe(point.rawPnl); expect(point.ruleVersion).toBe(0); }
    expect(dto).toMatchObject({ initialBasis: 'configured', initialSource: 'ledger_tag_config:initial_amount', initialValue: 100000,
      initialDate: '2026-09-15', latestValue: 44915.37, latestDate: '2026-11-26', latestSource: 'ledger_records:4815',
      rule: { version: 3, startDate: '2026-11-25' }, status: 'ready', capitalChange: 0, withdraw: 0 });
    expect(dto.rawPnl).toBeCloseTo(55084.63, 8); expect(dto.countedPnl).toBeCloseTo(54846.538, 8);
    expect(dto.effectiveFunds).toBeCloseTo(54846.538, 8); expect(dto.ineffectiveFunds).toBeCloseTo(238.092, 8);
    expect(forcedLiquidationDetailSummary(dto)).toMatchObject({ ineffectiveStatus: 'ready', ineffectiveFundsCny: 238.09 });
    const retroactive = calculateOrdinaryTagDownsideSeries({ ledgerId: 37, categoryId, initialAmount: 100000,
      entryDate: '2026-09-15', ratio: 100, points, rules: [rule({ categoryId, thresholdAmount: 90000, downsidePercent: 80, startDate: '2026-09-15' })] }).at(-1)!;
    expect(retroactive.countedPnl).toBeCloseTo(46067.704, 8); expect(dto.countedPnl).not.toBeCloseTo(retroactive.countedPnl!, 4);
    expect(dto.notice).toContain('启用日期前保留raw收益，不追溯'); expect(JSON.stringify({ records, rules })).toBe(before);
  });
  it('summary source remains pure and never imports router/portfolio/index startup or writes', () => {
    const source = readFileSync(new URL('./forced-liquidation-setting-summary.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*(?:routers|ledger-stock-portfolio|\/index|\/db)['"]|\b(?:fetch|setInterval|setTimeout|beginTransaction)\b/);
  });
});
