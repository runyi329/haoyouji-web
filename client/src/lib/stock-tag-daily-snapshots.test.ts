import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { mapStockTagDailySnapshots } from './stock-tag-daily-snapshots';

const policyVersion = 'mixed-crypto-natural-day-1505-v1';
const legacy = (snapshotDate: string, totalPnl: unknown, patch: Record<string, unknown> = {}) => ({
  snapshotDate, totalPnl, marketValue: 1000, costValue: 900, ...patch,
});
const modern = (snapshotDate: string, totalPnl: unknown, dailyPnl: unknown, patch: Record<string, unknown> = {}) => ({
  ...legacy(snapshotDate, totalPnl), ready: true, priced: true, status: 'ready',
  dailyPnl, dailyPnlReady: true, policyVersion, ...patch,
});

test('ready → pending → ready retains the pending row and never bridges a missing baseline', () => {
  const rows = mapStockTagDailySnapshots([
    modern('2026-11-23', 140, null, { dailyPnlReady: false, previousDate: '2026-11-22', dailyPnlReason: 'missing_reliable_previous_baseline' }),
    modern('2026-11-21', 100, 8),
    modern('2026-11-22', null, null, { ready: false, priced: false, status: 'pending_verification', dailyPnlReady: false, marketValue: null, costValue: null }),
  ]);
  assert.deepEqual(rows.map(row => row.date), ['2026-11-21', '2026-11-22', '2026-11-23']);
  assert.deepEqual(rows.map(row => row.totalPnl), [100, null, 140]);
  assert.deepEqual(rows.map(row => row.totalPnlReady), [true, false, true]);
  assert.deepEqual(rows.map(row => row.dailyPnl), [8, null, null]);
  assert.deepEqual(rows.map(row => row.dailyPnlReady), [true, false, false]);
  assert.equal(rows[1].ready, false);
  assert.equal(rows[1].priced, false);
  assert.equal(rows[1].status, 'pending_verification');
  assert.equal(rows[1].marketValue, null);
  assert.equal(rows[1].costValue, null);
  assert.equal(rows[2].dailyPnlReason, 'missing_reliable_previous_baseline');
  assert.equal(rows[2].previousDate, '2026-11-22');
});

test('repeated reads ready → pending → ready never reuse the formerly ready amount', () => {
  const ready = modern('2026-11-23', 100, 10);
  const pending = { ...ready, totalPnl: null, dailyPnl: null, ready: false, status: 'pending_verification', dailyPnlReady: false };
  const recovered = { ...ready, totalPnl: 105, dailyPnl: 15 };
  assert.deepEqual([ready, pending, recovered].map(row => {
    const [mapped] = mapStockTagDailySnapshots([row]);
    return [mapped.totalPnl, mapped.dailyPnl, mapped.ready];
  }), [[100, 10, true], [null, null, false], [105, 15, true]]);
});

test('mixed dailyPnl is authoritative, not recomputed from neighbouring totals', () => {
  const rows = mapStockTagDailySnapshots([modern('2026-11-21', 100, 8), modern('2026-11-22', 140, 7)]);
  assert.equal(rows[1].dailyPnl, 7);
  assert.equal(rows[1].policyVersion, policyVersion);
  assert.equal(rows[1].mixedNaturalDay, true);
  assert.equal(rows[1].serverDailyPnlReady, true);
});

test('dailyPnlReady false suppresses a finite server amount but not a ready cumulative amount', () => {
  const [row] = mapStockTagDailySnapshots([modern('2026-11-23', 140, 40, { dailyPnlReady: false })]);
  assert.equal(row.totalPnl, 140);
  assert.equal(row.totalPnlReady, true);
  assert.equal(row.dailyPnl, null);
  assert.equal(row.dailyPnlReady, false);
  assert.equal(row.serverDailyPnlReady, false);
});

test('modern null daily remains unknown even with two ready finite cumulative amounts', () => {
  const rows = mapStockTagDailySnapshots([modern('2026-11-22', 100, 8), modern('2026-11-23', 140, null)]);
  assert.equal(rows[1].dailyPnl, null);
  assert.equal(rows[1].serverDailyPnlReady, true);
  assert.equal(rows[1].dailyPnlReady, false);
});

test('finite numeric/string zero is real zero, including daily, market and cost amounts', () => {
  const [row] = mapStockTagDailySnapshots([modern('2026-11-23', '0', 0, { marketValue: 0, costValue: '0' })]);
  assert.equal(row.totalPnl, 0);
  assert.equal(row.totalPnlReady, true);
  assert.equal(row.dailyPnl, 0);
  assert.equal(row.dailyPnlReady, true);
  assert.equal(row.marketValue, 0);
  assert.equal(row.costValue, 0);
});

test('ready/priced false or non-ready status overrides stale finite zero or nonzero values', () => {
  for (const patch of [{ ready: false }, { priced: false }, { status: 'pending' }, { status: 'pending_verification' }, { status: 'missing' }]) {
    const [row] = mapStockTagDailySnapshots([modern('2026-11-23', 0, 5, patch)]);
    assert.equal(row.totalPnl, 0);
    assert.equal(row.totalPnlReady, false);
    assert.equal(row.dailyPnl, null);
  }
});

test('invalid/missing values never coerce to zero, and non-finite daily amounts stay pending', () => {
  for (const value of [null, undefined, '', ' ', NaN, Infinity, -Infinity, 'NaN', 'Infinity', 'bad', false, true, [], {}]) {
    const [row] = mapStockTagDailySnapshots([modern('2026-11-23', value, value, { marketValue: value, costValue: value })]);
    assert.equal(row.totalPnl, null);
    assert.equal(row.totalPnlReady, false);
    assert.equal(row.dailyPnl, null);
    assert.equal(row.marketValue, null);
    assert.equal(row.costValue, null);
    assert.equal(mapStockTagDailySnapshots([modern('2026-11-23', 100, value)])[0].dailyPnl, null);
  }
});

test('legacy adjacent trading-day snapshots support signed differences without invented first-day zero', () => {
  const rows = mapStockTagDailySnapshots([legacy('2026-11-25', 80), legacy('2026-11-23', 100), legacy('2026-11-24', '140')]);
  assert.deepEqual(rows.map(row => row.dailyPnl), [null, 40, -60]);
  assert.deepEqual(rows.map(row => row.ready), [null, null, null]);
  assert.deepEqual(rows.map(row => row.status), [null, null, null]);
});

test('legacy finite zero baseline and finite zero difference are valid', () => {
  const rows = mapStockTagDailySnapshots([legacy('2026-11-23', 0), legacy('2026-11-24', 10), legacy('2026-11-25', 10)]);
  assert.deepEqual(rows.map(row => row.dailyPnl), [null, 10, 0]);
  assert.equal(rows[2].dailyPnlReady, true);
});

test('legacy ready → pending → ready cannot skip the pending row or treat its null as zero', () => {
  const rows = mapStockTagDailySnapshots([
    legacy('2026-11-23', 100, { ready: true }),
    legacy('2026-11-24', null, { ready: false, status: 'pending_verification' }),
    legacy('2026-11-25', 140, { ready: true }),
  ]);
  assert.deepEqual(rows.map(row => row.dailyPnl), [null, null, null]);
  assert.equal(rows.length, 3);
});

test('legacy missing trading-day row is a gap, while an actual weekend is not a trading-day gap', () => {
  assert.equal(mapStockTagDailySnapshots([legacy('2026-11-23', 100), legacy('2026-11-25', 140)])[1].dailyPnl, null);
  assert.equal(mapStockTagDailySnapshots([legacy('2026-11-20', 100), legacy('2026-11-23', 140)])[1].dailyPnl, 40);
  assert.equal(mapStockTagDailySnapshots([legacy('2026-11-20', 100), legacy('2026-11-21', 140)])[1].dailyPnl, null);
});

test('legacy explicit previousDate mismatch/null cannot authorize an alternate baseline', () => {
  for (const previousDate of [null, '2026-11-20', 'invalid']) {
    assert.equal(mapStockTagDailySnapshots([legacy('2026-11-23', 100), legacy('2026-11-24', 140, { previousDate })])[1].dailyPnl, null);
  }
});

test('presence of either modern daily field blocks legacy fallback, including undefined', () => {
  for (const patch of [{ dailyPnl: undefined }, { dailyPnl: null }, { dailyPnlReady: false }, { dailyPnlReady: true }, { dailyPnlReady: undefined }]) {
    assert.equal(mapStockTagDailySnapshots([legacy('2026-11-23', 100), legacy('2026-11-24', 140, patch)])[1].dailyPnl, null);
  }
});

test('mixed policy never uses legacy fallback even if daily fields are omitted', () => {
  const rows = mapStockTagDailySnapshots([legacy('2026-11-23', 100, { policyVersion }), legacy('2026-11-24', 140, { policyVersion })]);
  assert.deepEqual(rows.map(row => row.dailyPnl), [null, null]);
});

test('server verified first-day amount/known-empty contract is accepted; legacy first day is not inferred', () => {
  const [stock] = mapStockTagDailySnapshots([modern('2026-11-23', 100, 100, { policyVersion: 'cn-day-us-overnight-1505-v1', previousKnownEmpty: true })]);
  assert.equal(stock.dailyPnl, 100);
  assert.equal(stock.previousKnownEmpty, true);
  assert.equal(stock.mixedNaturalDay, false);
  assert.equal(mapStockTagDailySnapshots([legacy('2026-11-23', 100, { previousKnownEmpty: true })])[0].dailyPnl, null);
  assert.equal(mapStockTagDailySnapshots([modern('2026-11-23', 100, null, { dailyPnlReady: false })])[0].dailyPnl, null);
});

test('a filtered response may start with verified server daily; it is never borrowed from local prior rows', () => {
  const [row] = mapStockTagDailySnapshots([modern('2026-11-23', 100, -25, { previousDate: '2026-11-22' })]);
  assert.equal(row.dailyPnl, -25);
});

test('daily-only older modern contract may display a finite amount; explicit false still blocks it', () => {
  const row = legacy('2026-11-23', 100, { dailyPnl: -10 });
  assert.equal(mapStockTagDailySnapshots([row])[0].dailyPnl, -10);
  assert.equal(mapStockTagDailySnapshots([{ ...row, dailyPnlReady: false }])[0].dailyPnl, null);
});

test('mapping does not mutate inputs and overflow differences remain unknown', () => {
  const frozen = Object.freeze([Object.freeze(legacy('2026-11-24', Number.MAX_VALUE)), Object.freeze(legacy('2026-11-23', -Number.MAX_VALUE))]);
  const rows = mapStockTagDailySnapshots(frozen);
  assert.equal(frozen[0].snapshotDate, '2026-11-24');
  assert.equal(rows[1].dailyPnl, null);
  assert.deepEqual(mapStockTagDailySnapshots([]), []);
});

test('page uses the pure mapper and readiness-aware dialog, without importing/executing the page', () => {
  const source = readFileSync(new URL('../pages/StockTagPortfolio.tsx', import.meta.url), 'utf8');
  assert.match(source, /mapStockTagDailySnapshots\(\(dailySnapshotsQuery\.data \|\| \[\]\)/);
  assert.match(source, /record\.totalPnlReady \? signedMoney\(record\.totalPnl, portfolioCurrency\) : "待核验"/);
  assert.match(source, /record\.dailyPnlReady \? signedMoney\(record\.dailyPnl, portfolioCurrency\) : "待核验"/);
  assert.match(source, /record\.mixedNaturalDay \? "自然日日结" : "股票日结"/);
  assert.match(source, /保留待核验记录/);
  assert.doesNotMatch(source, /Number\(snapshot\.totalPnl \|\| 0\)|首个有效盘尾以 0|仅有效交易日|上一有效盘尾累计盈亏/);
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
  assert.deepEqual(output.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error), []);
});
