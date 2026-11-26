import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as instruments from '../shared/portfolio-instruments';
import * as cryptoPolicy from '../shared/crypto-portfolio-policy';
import { marketSessionDateFromBeijingTradeTimestamp } from './stock-unified-close-quotes';
import { buildMemberStockCalendar, memberCalendarSettlementSummary, type MemberCalendarSnapshot } from './shared/stock-member-calendar';
import { mergeCryptoPortfolioCalendarSnapshots } from './shared/crypto-portfolio-calendar-integration';
import { pendingCryptoCalendarSnapshot } from './shared/crypto-portfolio-calendar';
import { stockUserDownsideRules, stockUserTagOverrideVersion, stockUserTagOverridesFingerprint,
  isStockUserDownsideExemptSelection, stockUserCountedSalePrice } from './shared/stock-user-tag-downside';
import { stockLotDownsideMemberEntryAt, stockLotDownsideMemberOffset, selectStockLotDownsideRule,
  stockLotDownsideHistoricalEntryProof, valueStockLotDownside } from '../shared/stock-lot-downside';
import { aggregateFrozenStockSaleAmounts, isR1StockSaleFxScope } from './stock-sale-fx-locks';

// Load actual production declarations; only DB/HTTP/auth boundaries are injected.
// This must never import routers, start the server, issue DDL, or reach a real database.
const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('production.ts', source, ts.ScriptTarget.Latest, true);
function declaration(name: string) {
  const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name
    || ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => ts.isIdentifier(item.name) && item.name.text === name));
  if (!node) throw new Error(`Missing production declaration: ${name}`);
  return node.getText(ast);
}
const names = ['STOCK_LEDGER_ID', 'EPSILON', 'STOCK_UNIFIED_CLOSE_FX_POLICY_VERSION', 'r1MemberPresentationRows',
  'beijingDate', 'stockCurrency', 'stockMarket', 'numberValue', 'normalizeStoredDate', 'toIso', 'toBeijingWallClockIso',
  'summarizePositionsByCurrency', 'summarizePositionsInCny', 'mergeLatestQuoteMaps', 'mergeLivePortfolioQuoteMaps',
  'calendarSourceNumber', 'frozenParticipationAmountsOrFallback', 'resolvedDownsideMemberOffset',
  'readCountedNativeParticipationAmounts', 'countedDownsideSalePrice', 'mapCountedMemberCalendarClosures',
  'memberCryptoParticipationStartDate', 'buildMemberStockPortfolio', 'buildMyStockTagOverview',
  'projectMemberSettlementSnapshotForAi', 'getMyStockTagOverview', 'getStockTagCalendar'];
const code = ts.transpileModule(names.map(declaration).join('\n').replace(/\bexport\s+/g, ''),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const NOW = new Date('2026-11-21T17:00:00+08:00');
const scope = { ledgerId: 37, categoryId: 301, userId: 4957188 };
const stock = Object.freeze({ id: 1, lot_id: 11, symbol: '600000.SH', stock_name: '敏感证券名称',
  allocated_quantity: 100, remaining_quantity: 100, entry_price: 10, initial_quantity: 100,
  start_date: '2026-11-18', opened_at: '2026-11-18 10:00:00', opening_actual_traded_at: '2026-11-18 10:00:00',
  opening_status: 'active', closed_quantity: 0, closed_value: 0, realized_pnl: 0 });
function crypto(overrides: Record<string, unknown> = {}) {
  return { ...stock, id: 2, lot_id: 29, symbol: 'CRYPTO:UNI-USDT', stock_name: '敏感数字币名称',
    allocated_quantity: 1, remaining_quantity: 1, initial_quantity: 1, start_date: '2026-11-19',
    opened_at: '2026-11-19 12:08:00', opening_actual_traded_at: '2026-11-19 12:08:00',
    opening_settlement_effective_date: '2026-11-19', ...overrides };
}
function ready(date: string, totalPnl: number): MemberCalendarSnapshot {
  return { ...pendingCryptoCalendarSnapshot(date), ready: true, priced: true, status: 'ready', totalPnl,
    dailyPnl: 8412.302732, dailyPnlReady: true, floatingPnl: totalPnl, realizedPnl: 0,
    marketValue: 1234567, costValue: 9876543, positionCount: 999,
    quoteAsOf: [{ symbol: 'SECRET', priceDate: date, capturedAt: `${date}T15:05:00+08:00`, source: 'sensitive', carried: false }],
    policyVersion: cryptoPolicy.CRYPTO_PORTFOLIO_POLICY_VERSION };
}
function harness(options: { rows?: any[]; activation?: string | null; mixed?: MemberCalendarSnapshot[]; ai?: boolean; canManage?: boolean } = {}) {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  const rows = options.rows ?? [stock];
  const execute = vi.fn(async (sql: string, params: unknown[]) => {
    expect(sql).toMatch(/^\s*SELECT\b/i);
    if (sql.includes('SELECT p.id, p.lot_id')) {
      expect(params).toEqual([301, scope.userId]);
      expect(sql).toContain('p.allocated_quantity > 0');
      expect(sql).not.toContain('p.remaining_quantity > 0');
      return [rows];
    }
    if (sql.includes('SELECT DISTINCT c.id')) return [[{ id: 301, name: '真实R1项目名称' }]];
    if (sql.includes('information_schema.tables')) return [[{ TABLE_NAME: 'ledger_crypto_portfolio_daily_snapshots' }]];
    if (sql.includes('FROM ledger_stock_price_snapshots')) return [[
      { symbol: stock.symbol, price_date: '2026-11-18', price: 10, captured_at: '2026-11-18 15:05:00' },
      { symbol: stock.symbol, price_date: '2026-11-19', price: 9, captured_at: '2026-11-19 15:05:00' },
      { symbol: stock.symbol, price_date: '2026-11-20', price: 8, captured_at: '2026-11-20 15:05:00' },
    ]];
    if (sql.includes('FROM ledger_stock_participation_closures')) return [[]];
    throw new Error(`Unexpected offline SQL: ${sql}`);
  });
  const conn = { execute };
  const activation = vi.fn(async () => options.activation === undefined ? '2026-11-19' : options.activation);
  const mixed = vi.fn(async () => options.mixed ?? [pendingCryptoCalendarSnapshot('2026-11-21')]);
  const total = Object.freeze([Object.freeze({ ...pendingCryptoCalendarSnapshot('2026-11-21'), scope: 'tag-total' }),
    Object.freeze({ ...ready('2026-11-20', 777), scope: 'tag-total' })]);
  const readTotal = vi.fn(async () => total);
  const auth = vi.fn(async () => ({ categoryName: '真实R1项目名称', context: { aiEnabled: !!options.ai, canManage: !!options.canManage } }));
  let subject: any;
  const dependencies = { ...instruments, ...cryptoPolicy, marketSessionDateFromBeijingTradeTimestamp,
    buildMemberStockCalendar, memberCalendarSettlementSummary, mergeCryptoPortfolioCalendarSnapshots,
    getDbConnection: async () => conn,
    readUserTagDownsideOverrides: async () => [],
    stockUserDownsideRules, stockUserTagOverrideVersion, stockUserTagOverridesFingerprint,
    isStockUserDownsideExemptSelection, stockUserCountedSalePrice,
    stockLotDownsideMemberEntryAt, stockLotDownsideMemberOffset, selectStockLotDownsideRule,
    stockLotDownsideHistoricalEntryProof, valueStockLotDownside,
    aggregateFrozenStockSaleAmounts, isR1StockSaleFxScope,
    readStockLotDownsideRules: async () => [], historicalDownsideEvidence: new WeakMap(),
    readFrozenParticipationAmounts: async () => new Map(),
    getLatestReferenceQuotes: async () => ({}), getLatestQuotes: async () => ({}), getLatestIntradayQuotes: async () => ({}),
    getUsStockExchangeMap: async () => ({}), getLiveCryptoQuotes: async () => ({}),
    readLiveUsdtCnyRate: async () => null, readLiveUsdCnyRate: async () => 7,
    getCryptoPortfolioActivationDate: activation, readCryptoPortfolioCalendar: mixed,
    r1PnlSummary: (floatingPnl: unknown, realizedPnl: unknown) => ({ floatingPnl, realizedPnl }),
    getCachedMemberStockPortfolio: (...args: unknown[]) => subject.buildMemberStockPortfolio(...args),
    getLedger37PresentationContext: async () => ({ aiEnabled: !!options.ai, canManage: !!options.canManage }),
    readR1StockPresentationState: auth, memberOverviewReadCache: new Map(),
    readShortLivedCache: (_cache: unknown, _key: string, loader: () => unknown) => loader(),
    assertStockPresentationReadAccess: async () => ({ categoryId: 301, ledgerId: 37, canEdit: false }),
    isStockCalendarMemberEligible: async () => true, readStockCalendarResult: readTotal,
  };
  subject = new Function(...Object.keys(dependencies), `${code}\nreturn { buildMemberStockPortfolio, getMyStockTagOverview, getStockTagCalendar };`)(...Object.values(dependencies));
  return { subject, activation, mixed, execute, conn, readTotal, total, auth };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('member-specific settlement policy (real production functions, strictly offline)', () => {
  it('category has crypto but member never allocated: preserves personal securities legacy history and never calls mixed read', async () => {
    const h = harness();
    const member = await h.subject.buildMemberStockPortfolio(301, scope.userId);
    expect(member.settlementSummary).toMatchObject({ settlementPolicy: 'stock-trading-day', expectedDate: '2026-11-20',
      confirmedAsOf: '2026-11-20', confirmedTotalPnl: 200, totalPnl: 200, dailyChange: 100,
      latestSnapshot: { snapshotDate: '2026-11-20', ready: true } });
    expect(h.activation).not.toHaveBeenCalled(); expect(h.mixed).not.toHaveBeenCalled();
  });
  it('closed crypto history keeps mixed policy even with no current crypto position; yesterday confirmed stays separate from today pending', async () => {
    const yesterday = Object.freeze(ready('2026-11-20', 76907.616558));
    const pending = Object.freeze(pendingCryptoCalendarSnapshot('2026-11-21'));
    const h = harness({ rows: [stock, crypto({ remaining_quantity: 0, closed_quantity: 1, closed_value: 9, realized_pnl: 1 })], mixed: [pending, yesterday] });
    const member = await h.subject.buildMemberStockPortfolio(301, scope.userId);
    expect(member.positions.every((p: any) => !instruments.isCryptoPortfolioSymbol(p.symbol))).toBe(true);
    expect(member.settlementSummary).toMatchObject({ settlementPolicy: 'mixed-crypto-natural-day', expectedDate: '2026-11-21',
      latestSnapshot: pending, dailyChange: null, dailyChangeReady: false, totalPnl: null, valuationDate: null,
      lastConfirmedSnapshot: yesterday, confirmedTotalPnl: 76907.616558, confirmedAsOf: '2026-11-20' });
    expect(member.settlementSummary.latestSnapshot).toBe(pending);
    expect(member.settlementSummary.lastConfirmedSnapshot).toBe(yesterday);
    expect(h.mixed).toHaveBeenCalledWith(301, scope.userId, expect.any(Date), h.conn);
    expect(yesterday.dailyPnl).toBe(8412.302732); expect(pending.ready).toBe(false);
  });
  it.each([
    { start_date: '2026-11-22' },
    { opening_settlement_effective_date: '2026-11-22' },
    { opening_actual_traded_at: '2026-11-22 12:00:00' },
  ])('known future crypto allocation/opening %j does not switch policy early', async (override) => {
    const h = harness({ rows: [stock, crypto(override)] });
    const member = await h.subject.buildMemberStockPortfolio(301, scope.userId);
    expect(member.settlementSummary).toMatchObject({ settlementPolicy: 'stock-trading-day', confirmedAsOf: '2026-11-20', confirmedTotalPnl: 200 });
    expect(h.activation).not.toHaveBeenCalled(); expect(h.mixed).not.toHaveBeenCalled();
  });
  it('first crypto effective today switches only at personal start, preserving yesterday securities confirmed result', async () => {
    const h = harness({ rows: [stock, crypto({ start_date: '2026-11-21', opening_actual_traded_at: '2026-11-21 12:08:00',
      opening_settlement_effective_date: '2026-11-21' })], activation: '2026-11-19' });
    const member = await h.subject.buildMemberStockPortfolio(301, scope.userId);
    expect(member.settlementSummary).toMatchObject({ settlementPolicy: 'mixed-crypto-natural-day', latestSnapshot: { snapshotDate: '2026-11-21', ready: false },
      confirmedAsOf: '2026-11-20', confirmedTotalPnl: 200 });
  });
  it('zero allocation and voided opening are not real crypto participation; observation tables are never read for policy', async () => {
    const h = harness({ rows: [stock, crypto({ allocated_quantity: 0 }), crypto({ id: 3, opening_status: 'voided' })] });
    const member = await h.subject.buildMemberStockPortfolio(301, scope.userId);
    expect(member.settlementSummary.settlementPolicy).toBe('stock-trading-day');
    expect(h.mixed).not.toHaveBeenCalled();
    expect(h.execute.mock.calls.map(([sql]) => sql).join('\n')).not.toContain('ledger_stock_lot_observations');
    expect(declaration('memberCryptoParticipationStartDate')).not.toContain('remaining_quantity');
  });
  it('unknown real opening date remains mixed pending rather than inventing a ready securities result', async () => {
    const h = harness({ rows: [stock, crypto({ start_date: null, opening_actual_traded_at: null, opening_settlement_effective_date: null })] });
    const member = await h.subject.buildMemberStockPortfolio(301, scope.userId);
    expect(member.settlementSummary).toMatchObject({ settlementPolicy: 'mixed-crypto-natural-day', latestSnapshot: { ready: false } });
    expect(h.mixed).toHaveBeenCalledOnce();
  });
  it('member securities fallback cannot rewrite or replace tag-total pending / stored total amounts', async () => {
    const h = harness(); const before = JSON.stringify(h.total);
    const member = await h.subject.buildMemberStockPortfolio(301, scope.userId);
    await expect(h.subject.getStockTagCalendar(scope)).rejects.toThrow('仅37号账本所有者可以查看标签总盘日历');
    const total = h.total;
    expect(member.settlementSummary.confirmedTotalPnl).toBe(200);
    expect(total).toBe(h.total); expect(total[0]).toMatchObject({ ready: false, totalPnl: null, scope: 'tag-total' });
    expect(total[1].totalPnl).toBe(777); expect(JSON.stringify(h.total)).toBe(before);
    expect(h.readTotal).not.toHaveBeenCalled();
    expect(h.execute.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true);
  });
});

describe('confirmed cumulative is nullable and policy clocks retain 15:05 boundary', () => {
  const summary = (rows: readonly MemberCalendarSnapshot[], now = NOW) => memberCalendarSettlementSummary(rows, { settlementPolicy: 'mixed-crypto-natural-day', now });
  it('true confirmed zero differs from no ready, null, NaN and infinite totals', () => {
    const zero = Object.freeze(ready('2026-11-20', 0));
    const pending = Object.freeze(pendingCryptoCalendarSnapshot('2026-11-21'));
    expect(summary([zero, pending])).toMatchObject({ totalPnl: null, dailyChange: null, dailyChangeReady: false,
      confirmedTotalPnl: 0, confirmedAsOf: '2026-11-20', lastConfirmedSnapshot: zero });
    expect(summary([pending])).toMatchObject({ confirmedTotalPnl: null, confirmedAsOf: null, lastConfirmedSnapshot: null });
    for (const totalPnl of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(summary([{ ...zero, totalPnl }])).toMatchObject({ confirmedTotalPnl: null, confirmedAsOf: null, lastConfirmedSnapshot: null });
    }
    expect(summary([]).confirmedTotalPnl).toBeNull();
  });
  it('chooses most recent finite ready regardless of order, without mutating input or requiring daily ready', () => {
    const row = Object.freeze({ ...ready('2026-11-20', -1), dailyPnl: null, dailyPnlReady: false });
    const rows = Object.freeze([row, Object.freeze(ready('2026-11-19', 40)), Object.freeze(pendingCryptoCalendarSnapshot('2026-11-21'))]);
    expect(summary(rows).lastConfirmedSnapshot).toBe(row);
    expect(summary(rows).confirmedTotalPnl).toBe(-1);
    expect(rows[0]).toBe(row);
  });
  it('expectedDate respects pre-15:05 and weekends without changing saved snapshots', () => {
    expect(summary([], new Date('2026-11-21T15:04:59+08:00')).expectedDate).toBe('2026-11-20');
    expect(summary([], new Date('2026-11-21T15:05:00+08:00')).expectedDate).toBe('2026-11-21');
    expect(memberCalendarSettlementSummary([], { now: NOW })).toMatchObject({ settlementPolicy: 'stock-trading-day', expectedDate: '2026-11-20' });
    expect(memberCalendarSettlementSummary([], { now: new Date('2026-11-20T15:04:59+08:00') }).expectedDate).toBe('2026-11-19');
  });
});

describe('nonowner AI overview retains settlement metadata without raw amounts / positions / project details', () => {
  it('real mapped AI response keeps pending and confirmed separately, original allowed PnL only', async () => {
    const yesterday = ready('2026-11-20', 0);
    const h = harness({ ai: true, rows: [stock, crypto()], mixed: [yesterday, pendingCryptoCalendarSnapshot('2026-11-21')] });
    const rows = await h.subject.getMyStockTagOverview(scope);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: '股票项目301', summary: { settlementPolicy: 'mixed-crypto-natural-day', expectedDate: '2026-11-21',
      confirmedAsOf: '2026-11-20', confirmedTotalPnl: 0, dailyChangeReady: false,
      dailyChangeDate: '2026-11-21', lastConfirmedSnapshot: { snapshotDate: '2026-11-20', ready: true, totalPnl: 0 } } });
    for (const forbidden of ['marketValue', 'costValue', 'quantity', 'positionCount', 'quoteAsOf', 'missingSymbols', 'symbol', 'stockName',
      'latestSnapshot', '真实R1项目名称', '敏感证券名称', '敏感数字币名称', 'SECRET', '1234567', '9876543']) expect(JSON.stringify(rows)).not.toContain(forbidden);
    expect(rows[0].points.at(-1)).toMatchObject({ ready: false, policyVersion: cryptoPolicy.CRYPTO_PORTFOLIO_POLICY_VERSION });
    expect(h.auth).toHaveBeenCalledTimes(2);
  });
  it('AI disabled and owner keep full originally authorized DTO, not the restricted mapping', async () => {
    for (const options of [{ ai: false }, { ai: true, canManage: true }]) {
      const h = harness(options);
      const rows = await h.subject.getMyStockTagOverview(scope);
      expect(rows[0].name).toBe('真实R1项目名称');
      expect(rows[0].summary.lastConfirmedSnapshot.marketValue).toBe(800);
      expect(rows[0].summary.confirmedAsOf).toBe('2026-11-20');
    }
  });
});
