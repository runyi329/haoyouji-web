import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { stockUserDownsideRules, stockUserCountedSalePrice, isStockUserDownsideExemptSelection,
  stockUserTagOverrideVersion, stockUserTagOverridesFingerprint } from './shared/stock-user-tag-downside';
import { valueStockLotDownside, stockLotDownsideMemberOffset, selectStockLotDownsideRule,
  stockLotDownsideMemberEntryAt, stockLotDownsideHistoricalEntryProof, type StockLotDownsideRule } from '../shared/stock-lot-downside';
import { aggregateFrozenStockSaleAmounts, type StockSaleFxLock } from './stock-sale-fx-locks';
import { readUserTagDownsideOverrides } from './user-tag-downside-overrides';
import type { UserTagDownsideOverride } from '../shared/user-tag-downside-override';
import { buildMemberStockCalendar } from './shared/stock-member-calendar';
const source = fs.readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('offline.ts', source, ts.ScriptTarget.Latest, true);
function extracted(name: string, deps: Record<string, unknown>) {
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  if (!node) throw new Error(`missing function ${name}`);
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  // Only this named function executes, never a production import, initialization, scanner or router.
  return new Function(...Object.keys(deps), `${js}; return ${name}`)(...Object.values(deps));
}
const categoryId = 90250, targetUserId = 101, date = '2026-11-24T13:00:00+08:00';
const override = (mode: 'exempt' | 'follow_tag' = 'exempt', version = 1): UserTagDownsideOverride => ({
  ledgerId: 37, categoryId, targetUserId, actorUserId: 7, mode, version, createdAt: '2026-11-26T03:00:00.000Z',
});
const legacy: StockLotDownsideRule = { ledgerId: 37, categoryId, lotId: 1, userId: 7, version: 1, currency: 'USD',
  enabled: true, thresholdPrice: 100, downsidePercent: 0, effectiveAt: '2026-11-20T00:00:00Z',
  baselineRawPrice: 100, baselineCountedPrice: 100 };
const numberSource = (value: unknown) => value === null || value === undefined || value === '' ? NaN : Number(value);
const wall = (v: unknown) => typeof v === 'string' && v ? v.replace(' ', 'T') + (v.includes('T') ? '' : '+08:00') : '';
const offsetDeps = { isStockUserDownsideExemptSelection, stockLotDownsideMemberOffset, stockLotDownsideMemberEntryAt,
  selectStockLotDownsideRule, stockLotDownsideHistoricalEntryProof, historicalDownsideEvidence: new WeakMap() };
const offset = extracted('resolvedDownsideMemberOffset', offsetDeps);
const lock = (eventId: number, cnyRate: number): StockSaleFxLock => ({ eventId, ledgerId: 37, categoryId, currency: 'USD',
  cnyRate, source: 'sina_usdcny', lockKind: 'sale', quoteAsOf: date, lockedAt: date });
const rows = [101, 102].flatMap((user, i) => [
  { participation_id: i + 11, user_id: user, lot_id: 1, sell_event_id: 91, quantity: 2, entry_price: 100,
    sale_price: 70, symbol: 'HOOD', assigned_at: '2026-11-19 12:00:00', actual_traded_at: '2026-11-24 13:00:00', start_date: '2026-11-19' },
  { participation_id: i + 11, user_id: user, lot_id: 1, sell_event_id: 92, quantity: 3, entry_price: 100,
    sale_price: 60, symbol: 'HOOD', assigned_at: '2026-11-19 12:00:00', actual_traded_at: '2026-11-25 13:00:00', start_date: '2026-11-19' },
]);
const saved = [{ lotId: 1, eventId: 91, countedPrice: 100, effectiveAt: date }, { lotId: 1, eventId: 92, countedPrice: 100, effectiveAt: date }];
function deps(overrides: readonly UserTagDownsideOverride[] = [override()]) {
  return { STOCK_LEDGER_ID: 37, isR1StockSaleFxScope: () => true, aggregateFrozenStockSaleAmounts,
    readStockSaleFxLocks: vi.fn(async () => new Map([[91, lock(91, 7)], [92, lock(92, 8)]])),
    readStockLotDownsideRules: vi.fn(async () => [legacy]), readUserTagDownsideOverrides: vi.fn(async () => overrides),
    readStockLotDownsideSales: vi.fn(async () => saved), readStockLotDownsideMemberEpochs: vi.fn(async () => []),
    stockUserDownsideRules, isStockUserDownsideExemptSelection, calendarSourceNumber: numberSource,
    numberValue: Number, toBeijingWallClockIso: wall, resolvedDownsideMemberOffset: offset,
    countedDownsideSalePrice: stockUserCountedSalePrice, stockCurrency: () => 'USD' };
}
describe('stock user/tag highest-priority exempt: pure and extracted offline reads', () => {
  it('A exempt/B follow; follow preserves original rule array and historical WeakMap proof', () => {
    const rules = [legacy], evidence = { quotes: ['proof'] };
    const proof = new WeakMap([[rules, evidence]]);
    expect(stockUserDownsideRules(rules, [override()], 102, categoryId)).toBe(rules);
    expect(proof.get(stockUserDownsideRules(rules, [override()], 102, categoryId))).toBe(evidence);
    const a = stockUserDownsideRules(rules, [override()], 101, categoryId);
    expect(a).toEqual([]); expect(isStockUserDownsideExemptSelection(a)).toBe(true);
    expect(rules).toEqual([legacy]);
  });
  it('legacy no-startDate saved counted sale remains for follow but exempt uses raw, offset zero even entry below K', () => {
    const rawRules = stockUserDownsideRules([legacy], [override()], 101, categoryId);
    expect(stockUserCountedSalePrice(rawRules, 1, 60, '', saved[0])).toBe(60);
    expect(stockUserCountedSalePrice([], 1, 60, '', saved[0])).toBe(100);
    expect(stockUserCountedSalePrice([legacy], 1, 60, date, saved[0])).toBe(100);
    expect(offset({ rules: rawRules, epochs: [{ entryCountedOffset: 40 }], lotId: 1, participationId: 11,
      assignedAt: '', entryRawPrice: 60, asOf: date })).toBe(0);
    const a = valueStockLotDownside({ lotId: 1, quantity: 5, entryPrice: 60, rawPrice: 40,
      rules: rawRules, asOf: date, direction: 'counterparty', entryCountedOffset: 0 });
    expect(a.countedMarketPrice).toBe(40); expect(a.countedFloatingPnl).toBe(100);
  });
  it('highest follow cancels exempt retroactively and revision fingerprint changes', () => {
    const rules = [legacy], history = [override(), override('follow_tag', 2)];
    expect(stockUserDownsideRules(rules, history, 101, categoryId)).toBe(rules);
    expect(stockUserTagOverrideVersion(history, 101, categoryId)).toBe(2);
    expect(stockUserTagOverridesFingerprint(history)).not.toBe(stockUserTagOverridesFingerprint([override()]));
    expect(stockUserTagOverrideVersion([], 101, categoryId)).toBe(0);
  });
  it('frozen all-user closure batch resolves each user and preserves each sell-event FX for fully-closed/FIFO slices', async () => {
    const d = deps(), read = extracted('readFrozenParticipationAmounts', d);
    const conn = { execute: vi.fn(async (sql: string) => { expect(sql.startsWith('SELECT')).toBe(true); expect(sql).toContain('p.user_id'); return [rows]; }) };
    const before = JSON.stringify({ rows, saved });
    const counted = await read(conn, categoryId, undefined, true);
    const raw = await read(conn, categoryId, undefined, false);
    expect(counted.get(11)).toEqual(raw.get(11));
    expect(counted.get(11).realizedPnlCny).toBe(1380); // 2*(100-70)*7 + 3*(100-60)*8
    expect(counted.get(12).realizedPnlCny).toBe(0);
    expect(counted.get(11).fxRate).toBeNull(); expect(counted.get(11).fxLocked).toBe(true);
    expect(d.readUserTagDownsideOverrides).toHaveBeenCalledTimes(1);
    expect(d.readStockSaleFxLocks).toHaveBeenCalledTimes(2);
    expect(JSON.stringify({ rows, saved })).toBe(before);
  });
  it('native closure batch follows personal resolver and does not reread global rules', async () => {
    const d = deps(), read = extracted('readCountedNativeParticipationAmounts', d);
    const conn = { execute: vi.fn(async () => [rows]) };
    const amounts = await read(conn, categoryId, undefined, [legacy], [override()]);
    expect(amounts.get(11)).toBe(180); expect(amounts.get(12)).toBe(0);
    expect(d.readStockLotDownsideRules).not.toHaveBeenCalled(); expect(d.readUserTagDownsideOverrides).not.toHaveBeenCalled();
  });
  it('stock historical member calendar uses raw current plus closed execution only for exempt', async () => {
    const rules = [{ ...legacy, currency: 'CNY' as const }], rawRules = stockUserDownsideRules(rules, [override()], 101, categoryId);
    const mapper = extracted('mapCountedMemberCalendarClosures', { ...deps(),
      marketSessionDateFromBeijingTradeTimestamp: (s: string) => s.slice(0, 10), stockMarket: () => 'A' });
    const participation = { id: 11, lotId: 1, symbol: '600000.SH', startDate: '2026-11-19', assignedAt: '2026-11-19T12:00:00+08:00',
      historyStartDate: '2026-11-19', remainingQuantity: 1, entryPrice: 100 };
    const common = { participations: [participation], fx: [], snapshotDates: ['2026-11-24'], now: new Date('2026-11-24T16:00:00+08:00'),
      quotes: [{ symbol: participation.symbol, price: 60, priceDate: '2026-11-24', capturedAt: '2026-11-24T15:05:00+08:00', source: 'price_snapshot' }] };
    const closureRows = [{ ...rows[0], quantity: 1 }];
    const aClosures = await mapper({}, categoryId, closureRows, [participation], rawRules);
    const bClosures = await mapper({}, categoryId, closureRows, [participation], rules);
    expect(aClosures[0].countedSalePrice).toBeUndefined(); expect(aClosures[0].salePrice).toBe(70);
    expect(bClosures[0].countedSalePrice).toBe(100);
    const a = buildMemberStockCalendar({ ...common, closures: aClosures, downsideRules: rawRules, downsideMemberEpochs: [] }).at(-1)!;
    const b = buildMemberStockCalendar({ ...common, closures: bClosures, downsideRules: rules, downsideMemberEpochs: [] }).at(-1)!;
    expect(a).toMatchObject({ ready: true, floatingPnl: 40, realizedPnl: 30, totalPnl: 70 });
    expect(b).toMatchObject({ ready: true, floatingPnl: 0, realizedPnl: 0, totalPnl: 0 });
  });
  it('unknown price/quantity and missing foreign FX remain unknown, never Number(null)=0', async () => {
    const d = deps(), read = extracted('readFrozenParticipationAmounts', d);
    const bad = [{ ...rows[0], sale_price: null }];
    const result = await read({ execute: async () => [bad] }, categoryId, undefined, true);
    expect(result.get(11).realizedPnlCny).toBeNull();
    d.readStockSaleFxLocks = vi.fn(async () => new Map());
    const noFx = await extracted('readFrozenParticipationAmounts', d)({ execute: async () => [[rows[0]]] }, categoryId, undefined, true);
    expect(noFx.get(11).realizedPnlCny).toBeNull();
    expect(stockUserCountedSalePrice(stockUserDownsideRules([legacy], [override()], 101, categoryId), 1, NaN, date, saved[0])).toBeNull();
  });
  it('fresh revision is consulted before cache; mode change cannot reuse cached member portfolio', async () => {
    let history = [override()], builds = 0;
    const cache = new Map();
    const read = extracted('getCachedMemberStockPortfolio', { getDbConnection: async () => ({}), STOCK_LEDGER_ID: 37,
      readUserTagDownsideOverrides: async () => history, stockUserTagOverridesFingerprint, memberPortfolioReadCache: cache,
      buildMemberStockPortfolio: async (_c: number, _u: number, os: UserTagDownsideOverride[]) => ({ build: ++builds, version: os.at(-1)!.version }),
      readShortLivedCache: async (m: Map<string, unknown>, k: string, load: () => Promise<unknown>) => { if (!m.has(k)) m.set(k, await load()); return m.get(k); } });
    expect((await read(categoryId, 101)).version).toBe(1); await read(categoryId, 101); expect(builds).toBe(1);
    history = [override(), override('follow_tag', 2)]; expect((await read(categoryId, 101)).version).toBe(2); expect(builds).toBe(2);
  });
  it('missing override table follows legacy; DB error and corrupt mode fail closed', async () => {
    const missing = { execute: vi.fn(async () => { throw Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' }); }) };
    expect(await readUserTagDownsideOverrides(missing, 37, 101)).toEqual([]);
    await expect(readUserTagDownsideOverrides({ execute: async () => { throw new Error('DB unavailable'); } }, 37, 101)).rejects.toThrow('DB unavailable');
    expect(() => stockUserDownsideRules([legacy], [{ ...override(), mode: null } as any], 101, categoryId)).toThrow();
  });
  it('AST wiring: matrix physical lot stays global, members use user rules; overview revision and summary exposed', () => {
    const matrix = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'getStockLotParticipationMatrixInternal')!.getText(ast);
    expect(matrix.match(/readUserTagDownsideOverrides\(/g)).toHaveLength(1);
    expect(matrix).toContain('rawPrice: marketPrice, rules: downsideRules');
    expect(matrix).toContain('rawPrice: marketPrice, rules: userRulesFor(item.userId)');
    expect(source).toContain('userTagOverrideVersion,');
    expect(source).toContain('stockUserTagOverridesFingerprint(overrides)}`');
  });
});
