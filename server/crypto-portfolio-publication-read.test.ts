import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CryptoCalendarInput, CryptoPortfolioDailyPayload } from './shared/crypto-portfolio-calendar';
import type { MemberCalendarSnapshot } from './shared/stock-member-calendar';
import { CRYPTO_PORTFOLIO_POLICY_VERSION } from '../shared/crypto-portfolio-policy';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';

// Synthetic fixtures only. Every production I/O boundary fails closed, including import-time paths.
const m = vi.hoisted(() => {
  const network = vi.fn(() => { throw new Error('禁止真实网络'); });
  vi.stubGlobal('fetch', network);
  return {
    network,
    db: vi.fn(() => { throw new Error('必须注入 SELECT-only mock conn'); }),
    write: vi.fn(() => { throw new Error('禁止事务、DDL、DML及dirty write'); }),
    background: vi.fn(() => { throw new Error('禁止启动后台任务'); }),
    revaluation: vi.fn(),
  };
});
vi.mock('./db', () => ({
  getDb: m.db, getLedgerDb: m.db, getDbConnection: m.db, getDbTransactionConnection: m.write,
}));
vi.mock('./crypto-portfolio-quotes', () => ({
  fetchCryptoPortfolioCloseQuotes: m.network, fetchCryptoPortfolioQuotes: m.network,
}));
vi.mock('./crypto-portfolio-fx', () => ({ fetchCryptoUsdtCnyAtClose: m.network }));
vi.mock('./stock-usd-cny-rate', () => ({ fetchStockUsdCnyAtClose: m.network }));
vi.mock('./stock-unified-close-quotes', async importOriginal => ({
  ...await importOriginal<typeof import('./stock-unified-close-quotes')>(),
  fetchOvernightUnifiedCloseQuotes: m.network,
  fetchUnifiedCloseQuotes: m.network,
}));
vi.mock('./stock-calendar-result-cache', () => ({
  decodeStockCalendarResult: JSON.parse, markStockCalendarResultDirty: m.write,
}));
// The optional lazy baseline import must never load core DB/bootstrap/schedulers in this suite.
vi.mock('./ledger-stock-portfolio', () => ({
  readStockLotDownsideCalendarBaselines: m.db,
  ensureStockPortfolioTables: m.write,
  warmAllStockTagCalendarResults: m.background,
}));
vi.mock('./crypto-portfolio-scheduler', () => ({
  startCryptoPortfolioScheduler: m.background, runCryptoPortfolioCloseCandidates: m.background,
}));
vi.mock('./shared/crypto-portfolio-calendar', async importOriginal => {
  const actual = await importOriginal<typeof import('./shared/crypto-portfolio-calendar')>();
  return {
    ...actual,
    // Observe the actual async core, never replace proof/economic decisions with a test stub.
    revalueCryptoPortfolioDailyPayloadsAsync: async (...args: Parameters<typeof actual.revalueCryptoPortfolioDailyPayloadsAsync>) => {
      const result = await actual.revalueCryptoPortfolioDailyPayloadsAsync(...args);
      m.revaluation(args[0], result);
      return result;
    },
  };
});
import { buildCryptoPortfolioDailyPayload, cryptoPortfolioStockAnchor } from './shared/crypto-portfolio-calendar';
import { invalidateCryptoPortfolioDerivedReadCaches, readCryptoPortfolioCalendar } from './crypto-portfolio-settlement';

const categoryId = 87654;
const activation = '2026-11-21';
const lateMember = 71001, ruleMember = 71002, cryptoMember = 71003;
const lateSymbol = '600111.SH', ruleSymbol = '000321.SZ', cryptoSymbol = 'CRYPTO:ADA-USDT';
const now = new Date('2026-11-25T22:00:00+08:00');
const saleAt = '2026-11-23T12:00:00+08:00';
const recordedAt = '2026-11-24T09:35:00+08:00';
const saleEventId = 901;
const days = ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'] as const;
const prices: Record<string, readonly [number, number, number]> = {
  '2026-11-21': [20, 100, 100], '2026-11-22': [20, 100, 98],
  '2026-11-23': [17, 60, 95], '2026-11-24': [19, 70, 96], '2026-11-25': [16, 80, 99],
};
const wall = (s: string | null | undefined) => s ? s.slice(0, 19).replace('T', ' ') : null;

function input(date: string, sold: boolean, captureHistoryEvidence = false): CryptoCalendarInput {
  const anchor = cryptoPortfolioStockAnchor(date)!.A;
  const [latePrice, rulePrice, cryptoPrice] = prices[date];
  const stockAssigned = '2026-11-20T10:02:00+08:00';
  return {
    categoryId, snapshotDate: date, activationDate: activation,
    now: new Date(`${date}T16:00:00+08:00`), captureHistoryEvidence,
    lots: [
      { id: 11, symbol: lateSymbol, initialQuantity: 300, unitCost: 20, openingFee: null,
        openedDate: '2026-11-20', actualTradedAt: '2026-11-20T10:00:00+08:00', registeredAt: '2026-11-20T10:01:00+08:00' },
      { id: 22, symbol: ruleSymbol, initialQuantity: 40, unitCost: 100, openingFee: null,
        openedDate: '2026-11-20', actualTradedAt: '2026-11-20T10:00:00+08:00', registeredAt: '2026-11-20T10:01:00+08:00' },
      { id: 33, symbol: cryptoSymbol, initialQuantity: 2, unitCost: 100, openingFee: null,
        openedDate: activation, actualTradedAt: `${activation}T08:00:00+08:00`, registeredAt: `${activation}T08:01:00+08:00` },
    ],
    sales: sold ? [{ lotId: 11, eventId: saleEventId, quantity: 300, eventQuantity: 300,
      salePrice: 18, transactionFee: null, closeDate: '2026-11-23', soldAt: saleAt }] : [],
    closures: sold ? [{ participationId: 111, eventId: saleEventId, quantity: 300,
      salePrice: 18, closeDate: '2026-11-23', soldAt: saleAt }] : [],
    participations: [
      { id: 111, lotId: 11, userId: lateMember, allocatedQuantity: 300, remainingQuantity: sold ? 0 : 300,
        entryPrice: 20, startDate: '2026-11-20', pauseDate: null, assignedAt: stockAssigned,
        updatedAt: sold ? recordedAt : stockAssigned },
      { id: 222, lotId: 22, userId: ruleMember, allocatedQuantity: 40, remainingQuantity: 40,
        entryPrice: 100, startDate: '2026-11-20', pauseDate: null, assignedAt: stockAssigned, updatedAt: stockAssigned },
      { id: 333, lotId: 33, userId: cryptoMember, allocatedQuantity: 1, remainingQuantity: 1,
        entryPrice: 100, startDate: activation, pauseDate: null,
        assignedAt: `${activation}T08:02:00+08:00`, updatedAt: `${activation}T08:02:00+08:00` },
    ],
    observations: [],
    quotes: [
      { symbol: lateSymbol, price: latePrice, currency: 'CNY', priceDate: anchor,
        source: 'unified_close_sina', updatedAt: `${anchor}T15:05:03+08:00` },
      { symbol: ruleSymbol, price: rulePrice, currency: 'CNY', priceDate: anchor,
        source: 'unified_close_sina', updatedAt: `${anchor}T15:05:03+08:00` },
      { symbol: cryptoSymbol, price: cryptoPrice, currency: 'USDT', priceDate: date,
        source: 'crypto_close_gate_1505', updatedAt: `${date}T15:05:03+08:00`, cutoffAt: `${date}T15:05:00+08:00` },
    ],
    usdFx: null,
    usdtFx: {
      snapshotDate: date, usdtCnyRate: 7, pair: 'USDT/CNY', conversionPolicy: USDT_USD_PARITY_POLICY,
      source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny${anchor !== date ? `_carried_A_anchor_${anchor}` : ''}`,
      asOf: `${anchor}T15:04:00+08:00`, lockedAt: `${date}T15:05:00+08:00`, carried: anchor !== date,
      forexSnapshotDate: anchor, usdCnyRate: 7, usdCnyAsOf: `${anchor}T15:04:00+08:00`, usdCnySource: 'sina_usdcny',
      usdtUsdRate: 1, usdtUsdAsOf: `${date}T15:05:00+08:00`, usdtUsdSource: USDT_USD_PARITY_SOURCE,
      observedAt: `${date}T15:05:03+08:00`,
    },
  };
}

type Scenario = { capture?: boolean; missingRegistration?: boolean; unknownUpdatedAt?: boolean };
type SqlCall = { sql: string; params: unknown[] };
const isSalesProof = (sql: string) => /^SELECT a\.event_id,a\.lot_id,/.test(sql);
const isClosuresProof = (sql: string) => /^SELECT c\.participation_id,c\.sell_event_id,/.test(sql)
  && sql.includes('c.closed_at');

function database(options: Scenario = {}) {
  const originals: CryptoPortfolioDailyPayload[] = [];
  for (const date of days) originals.push(buildCryptoPortfolioDailyPayload({
    ...input(date, date >= '2026-11-24', options.capture), previous: originals.at(-1),
  }));
  // Database holds immutable raw JSON, not today's regenerated historical payloads.
  const saved = originals.map(p => JSON.stringify(p));
  const before = JSON.stringify(saved);
  const current = input('2026-11-25', true);
  const calls: SqlCall[] = [];
  const conn = {
    beginTransaction: m.write, commit: m.write, rollback: m.write, query: m.write,
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params: [...params] });
      if (!/^SELECT\b/.test(sql) || /\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|CALL|FOR UPDATE|GET_LOCK|RELEASE_LOCK)\b/i.test(sql)) {
        m.write();
      }
      if (sql.includes('FROM ledger_user_tag_downside_overrides')) {
        expect(sql.replace(/\s+/g, ' ').trim()).toBe("SELECT ledger_id,category_id,target_user_id,actor_user_id,version,mode, DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created_at FROM ledger_user_tag_downside_overrides WHERE ledger_id=? ORDER BY target_user_id,category_id,version");
        expect(params).toEqual([37]);
        return [[]];
      }
      if (params[0] !== 37 || params[1] !== categoryId) throw new Error('必须保持标签与账本scope');
      if (sql.includes('MIN(e.settlement_effective_date)')) return [[{ activation_date: activation }]];
      if (sql.includes('MIN(activation_date)')) return [[{
        ledger_id: 37, category_id: categoryId, policy_version: CRYPTO_PORTFOLIO_POLICY_VERSION,
        activation_date: activation, snapshot_date: activation,
      }]];
      if (sql.startsWith('SELECT payload FROM ledger_crypto')) return [saved.map(payload => ({ payload }))];
      if (sql.includes('FROM ledger_stock_lot_downside_rules')) return [[{
        ledger_id: 37, category_id: categoryId, lot_id: 22, user_id: ruleMember, version: 1, enabled: 1,
        threshold_price: 100, downside_percent: 20, start_date: '2026-11-23',
        effective_at: '2026-11-23T00:00:00+08:00', created_at: '2026-11-25T20:00:00+08:00',
        baseline_raw_price: 100, baseline_counted_price: 100, currency: 'CNY',
      }]];
      // Independent proof SELECTs deliberately do not reuse dates present on normal history rows.
      if (options.missingRegistration && (isSalesProof(sql) || isClosuresProof(sql))) return [[]];
      if (isSalesProof(sql)) return [[{
        event_id: saleEventId, lot_id: 11,
        registered_at: wall(recordedAt), allocated_at: wall(recordedAt),
      }]];
      if (isClosuresProof(sql)) return [[{
        participation_id: 111, sell_event_id: saleEventId,
        registered_at: wall(recordedAt), recorded_at: wall(recordedAt),
      }]];
      if (sql.startsWith('SELECT l.id,l.symbol')) return [current.lots.map(l => ({
        id: l.id, symbol: l.symbol, initial_quantity: l.initialQuantity, unit_cost: l.unitCost,
        opening_fee: l.openingFee, actual_traded_at: wall(l.actualTradedAt), registered_at: wall(l.registeredAt),
        effective_date: l.openedDate,
      }))];
      if (sql.includes('FROM ledger_stock_event_lot_allocations')) return [[{
        lot_id: 11, sell_event_id: saleEventId, quantity: 300, execution_price: 18, event_quantity: 300,
        transaction_fee: null, symbol: lateSymbol, actual_traded_at: wall(saleAt),
        registered_at: wall(recordedAt), effective_date: '2026-11-23',
      }]];
      if (sql.includes('FROM ledger_stock_lot_participations p INNER JOIN')) return [current.participations.map(p => ({
        id: p.id, lot_id: p.lotId, user_id: p.userId, allocated_quantity: p.allocatedQuantity,
        remaining_quantity: p.remainingQuantity, entry_price: p.entryPrice, start_date: p.startDate,
        pause_date: p.pauseDate, assigned_at: wall(p.assignedAt),
        updated_at: options.unknownUpdatedAt && p.userId === ruleMember ? null : wall(p.updatedAt),
      }))];
      if (sql.includes('FROM ledger_stock_participation_closures')) return [[{
        participation_id: 111, sell_event_id: saleEventId, lot_id: 11, quantity: 300,
        sale_price: 18, symbol: lateSymbol, actual_traded_at: wall(saleAt),
        registered_at: wall(recordedAt), effective_date: '2026-11-23',
      }]];
      if (/FROM ledger_stock_(lot_downside_sales|lot_downside_member_epochs|lot_observations|unified_close_prices)/.test(sql)) return [[]];
      if (sql.startsWith('SELECT p.id FROM ledger_stock_lot_participations')) return [[]];
      throw new Error(`unexpected SQL ${sql}`);
    }),
  };
  return { conn, calls, saved, originals, before, current };
}

function row(rows: MemberCalendarSnapshot[], date: string) {
  const found = rows.find(r => r.snapshotDate === date);
  expect(found, `missing ${date}`).toBeDefined();
  return found!;
}
function assertSafe(s: ReturnType<typeof database>) {
  expect(s.calls.length).toBeGreaterThan(0);
  expect(s.calls.every(c => /^SELECT\b/.test(c.sql))).toBe(true);
  for (const c of s.calls) {
    if (c.sql.includes('FROM ledger_user_tag_downside_overrides')) expect(c.params).toEqual([37]);
    else expect(c.params[0] === 37 && c.params[1] === categoryId).toBe(true);
  }
  expect(JSON.stringify(s.saved)).toBe(s.before);
  expect(m.db).not.toHaveBeenCalled();
  expect(m.write).not.toHaveBeenCalled();
  expect(m.network).not.toHaveBeenCalled();
  expect(m.background).not.toHaveBeenCalled();
}
function assertProofBatch(s: ReturnType<typeof database>, count: number) {
  const sales = s.calls.filter(c => isSalesProof(c.sql));
  const closures = s.calls.filter(c => isClosuresProof(c.sql));
  expect(sales).toHaveLength(count);
  expect(closures).toHaveLength(count);
  for (const c of sales) {
    expect(c.sql).toContain('e.server_registered_at');
    expect(c.sql).toContain('a.created_at');
  }
  for (const c of closures) {
    expect(c.sql).toContain('e.server_registered_at');
    expect(c.sql).toContain('c.closed_at');
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', m.network);
  invalidateCryptoPortfolioDerivedReadCaches();
});
afterEach(() => {
  invalidateCryptoPortfolioDerivedReadCaches();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('legacy publication production read via SELECT-only mock', () => {
  it('uses only scoped SELECTs; no DML/DDL, network, transactions, dirty marks or background bootstrap', async () => {
    const s = database();
    await readCryptoPortfolioCalendar(categoryId, undefined, now, s.conn);
    await readCryptoPortfolioCalendar(categoryId, lateMember, now, s.conn);
    expect(await readCryptoPortfolioCalendar(categoryId, 79999, now, s.conn)).toEqual([]);
    assertProofBatch(s, 1);
    assertSafe(s);
  });

  it('recovers Nov23 unsold publication and Nov24/25 sold publication from independent registration/closure evidence', async () => {
    const s = database();
    expect(s.originals.every(p => p.historyEvidence === undefined)).toBe(true);
    expect(s.originals[2].total).toMatchObject({ positionCount: 3, realizedPnl: 0 });
    expect(s.originals[3].total).toMatchObject({ positionCount: 2, realizedPnl: -600 });
    expect(s.current.sales[0]).toMatchObject({ closeDate: '2026-11-23', soldAt: saleAt });
    expect(s.current.participations[0]).toMatchObject({ remainingQuantity: 0, updatedAt: recordedAt });
    const [total, late, rule, crypto] = await Promise.all([
      undefined, lateMember, ruleMember, cryptoMember,
    ].map(id => readCryptoPortfolioCalendar(categoryId, id, now, s.conn)));
    const expected = [
      { date: '2026-11-23', total: -1290, totalDaily: -1262, late: 900, lateDaily: 900, rule: 320, ruleDaily: 320, crypto: 35, cryptoDaily: 21 },
      { date: '2026-11-24', total: -896, totalDaily: 394, late: 600, lateDaily: -300, rule: 240, ruleDaily: -80, crypto: 28, cryptoDaily: -7 },
      { date: '2026-11-25', total: -774, totalDaily: 122, late: 600, lateDaily: 0, rule: 160, ruleDaily: -80, crypto: 7, cryptoDaily: -21 },
    ];
    for (const e of expected) {
      for (const [rows, pnl, daily] of [
        [total, e.total, e.totalDaily], [late, e.late, e.lateDaily],
        [rule, e.rule, e.ruleDaily], [crypto, e.crypto, e.cryptoDaily],
      ] as const) expect(row(rows, e.date)).toMatchObject({
        ready: true, dailyPnlReady: true, dailyPnlReason: null, totalPnl: pnl, dailyPnl: daily,
      });
    }
    expect(row(total, '2026-11-23')).toMatchObject({ positionCount: 3, realizedPnl: 0 });
    expect(row(total, '2026-11-24')).toMatchObject({ positionCount: 2, realizedPnl: -600 });
    expect(row(late, '2026-11-23')).toMatchObject({ positionCount: 1, realizedPnl: 0 });
    expect(row(late, '2026-11-24')).toMatchObject({ positionCount: 0, realizedPnl: 600 });
    for (const rows of [late, rule, crypto]) {
      expect(rows.every(r => r.downsideRuleAudit === undefined)).toBe(true);
      expect(JSON.stringify(rows)).not.toContain('thresholdPrice');
    }
    assertProofBatch(s, 1);
    assertSafe(s);
  });

  it('keeps every original payload JSON, saved quote, FX leg and publication metadata byte-for-byte unchanged', async () => {
    const s = database(), originalJson = JSON.stringify(s.originals);
    const quoteJson = s.originals.map(p => JSON.stringify(p.quotes));
    const fxJson = s.originals.map(p => JSON.stringify(p.fx));
    const total = await readCryptoPortfolioCalendar(categoryId, undefined, now, s.conn);
    expect(row(total, '2026-11-23').totalPnl).not.toBe(s.originals[2].total.totalPnl);
    expect(m.revaluation).toHaveBeenCalledTimes(1);
    const [readInput, result] = m.revaluation.mock.calls[0];
    expect(readInput.originalPayloads.map((p: CryptoPortfolioDailyPayload) => JSON.stringify(p))).toEqual(s.saved);
    const derived = result.payloads as CryptoPortfolioDailyPayload[];
    expect(derived.map(p => JSON.stringify(p.quotes))).toEqual(quoteJson);
    expect(derived.map(p => JSON.stringify(p.fx))).toEqual(fxJson);
    for (let i = 0; i < derived.length; i++) {
      expect(derived[i].publishedAt).toBe(s.originals[i].publishedAt);
      expect(derived[i].policyVersion).toBe(s.originals[i].policyVersion);
      expect(derived[i].historyEvidence).toBeUndefined();
    }
    expect(JSON.stringify(s.originals)).toBe(originalJson);
    assertSafe(s);
  });

  it('same-batch concurrent total/member readers singleflight raw history and both new proof SELECTs', async () => {
    const s = database();
    const reads = await Promise.all([
      lateMember, ruleMember, cryptoMember, undefined, lateMember, ruleMember, undefined, cryptoMember,
    ].map(id => readCryptoPortfolioCalendar(categoryId, id, now, s.conn)));
    expect(reads).toHaveLength(8);
    expect(s.calls.filter(c => c.sql.startsWith('SELECT payload FROM ledger_crypto'))).toHaveLength(1);
    expect(s.calls.filter(c => c.sql.startsWith('SELECT l.id,l.symbol'))).toHaveLength(1);
    assertProofBatch(s, 1);
    expect(m.revaluation).toHaveBeenCalledTimes(1);
    const before = s.calls.length;
    await readCryptoPortfolioCalendar(categoryId, lateMember, now, s.conn);
    expect(s.calls.length).toBeGreaterThan(before); // Fresh activation/rule revision SELECTs still happen.
    assertProofBatch(s, 1);
    reads[0][0].totalPnl = 999999;
    expect(row(await readCryptoPortfolioCalendar(categoryId, lateMember, now, s.conn), '2026-11-25').totalPnl).toBe(600);
    assertSafe(s);
  });

  it('missing independent registration proof stays pending on the mismatched publication, without poisoning other accounts', async () => {
    const good = database(), missing = database({ missingRegistration: true });
    const [goodRule, goodCrypto, total, late, rule, crypto] = await Promise.all([
      readCryptoPortfolioCalendar(categoryId, ruleMember, now, good.conn),
      readCryptoPortfolioCalendar(categoryId, cryptoMember, now, good.conn),
      readCryptoPortfolioCalendar(categoryId, undefined, now, missing.conn),
      readCryptoPortfolioCalendar(categoryId, lateMember, now, missing.conn),
      readCryptoPortfolioCalendar(categoryId, ruleMember, now, missing.conn),
      readCryptoPortfolioCalendar(categoryId, cryptoMember, now, missing.conn),
    ]);
    expect(row(total, '2026-11-23')).toMatchObject({ ready: false, totalPnl: null, dailyPnlReady: false });
    expect(row(late, '2026-11-23')).toMatchObject({
      ready: false, totalPnl: null, dailyPnlReady: false, dailyPnlReason: 'unverifiable_allocation_history',
    });
    for (const date of days) {
      expect(row(rule, date)).toEqual(row(goodRule, date));
      expect(row(crypto, date)).toEqual(row(goodCrypto, date));
    }
    assertProofBatch(missing, 1);
    assertSafe(good);
    assertSafe(missing);
  });

  it('unknown participation updatedAt remains pending even with valid late-sale proof; healthy accounts and total stay isolated', async () => {
    const good = database(), unknown = database({ unknownUpdatedAt: true });
    const [goodTotal, goodLate, goodCrypto, total, late, crypto, rule] = await Promise.all([
      readCryptoPortfolioCalendar(categoryId, undefined, now, good.conn),
      readCryptoPortfolioCalendar(categoryId, lateMember, now, good.conn),
      readCryptoPortfolioCalendar(categoryId, cryptoMember, now, good.conn),
      readCryptoPortfolioCalendar(categoryId, undefined, now, unknown.conn),
      readCryptoPortfolioCalendar(categoryId, lateMember, now, unknown.conn),
      readCryptoPortfolioCalendar(categoryId, cryptoMember, now, unknown.conn),
      readCryptoPortfolioCalendar(categoryId, ruleMember, now, unknown.conn),
    ]);
    for (const date of days.slice(2)) {
      expect(row(rule, date)).toMatchObject({ ready: false, totalPnl: null, dailyPnlReady: false,
        dailyPnlReason: 'unverifiable_allocation_history' });
      expect(row(total, date)).toEqual(row(goodTotal, date));
      expect(row(late, date)).toEqual(row(goodLate, date));
      expect(row(crypto, date)).toEqual(row(goodCrypto, date));
    }
    assertSafe(good);
    assertSafe(unknown);
  });

  it('fully captured publication history performs no new proof SELECTs and ignores missing current registration evidence', async () => {
    const legacy = database(), captured = database({ capture: true, missingRegistration: true });
    expect(captured.originals.every(p => p.historyEvidence?.version === 1)).toBe(true);
    for (const id of [undefined, lateMember, ruleMember, cryptoMember]) {
      const expected = await readCryptoPortfolioCalendar(categoryId, id, now, legacy.conn);
      expect(await readCryptoPortfolioCalendar(categoryId, id, now, captured.conn)).toEqual(expected);
    }
    assertProofBatch(legacy, 1);
    assertProofBatch(captured, 0);
    expect(captured.calls.filter(c => c.sql.startsWith('SELECT l.id,l.symbol'))).toHaveLength(1);
    assertSafe(legacy);
    assertSafe(captured);
  });
});
