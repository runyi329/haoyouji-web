import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { isLedger37FullManager } from '../../../shared/ledger37-permissions';
import { normalizeStockCalendarPoints, stockCalendarScope, sumKnownStockDailyPnl } from './ledger-stock-calendar';

const source = readFileSync(new URL('../pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AA.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actual(name: string, scope: Record<string, any>) {
  let expression = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); if (!expression) throw new Error(`Missing production ${name}`);
  const js = ts.transpileModule(`const actual=${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(scope), `${js};return actual;`)(...Object.values(scope));
}
const previousDates: Record<string, string> = { '2026-11-23': '2026-11-20', '2026-11-24': '2026-11-23' };
const personal = [
  { date: '2026-11-23', pnl: 5, dailyPnl: 5, marketValue: 100, historical: true, priced: true, previousDate: '2026-11-20' },
  { date: '2026-11-24', pnl: -3, dailyPnl: -8, marketValue: 120, historical: true, priced: true, previousDate: '2026-11-23' },
];
const total = [
  { snapshotDate: '2026-11-23', totalPnl: 999999, dailyPnl: 88888, marketValue: 1000000, priced: true, previousDate: '2026-11-20' },
  { snapshotDate: '2026-11-24', totalPnl: 777777, dailyPnl: 55555, marketValue: 2000000, priced: true, previousDate: '2026-11-23' },
];
function scope(patch: Record<string, any> = {}) {
  return { ledgerId: 37, canViewLedger37StockTotal: false, stockParticipantView: true,
    stockTagOverviewQuery: { data: [{ categoryId: 19, points: personal }] }, selectedStockOverview: { points: personal }, stockCalendarScope,
    ...patch };
}
function points(patch: Record<string, any> = {}) {
  const bindings = scope(patch);
  const selectedStockCalendarScope = actual('selectedStockCalendarScope', bindings);
  return actual('stockCalendarPoints', { ...bindings, selectedStockCalendarScope,
    useMemo: (fn: Function) => fn(), isSelectedStockPortfolio: true, selectedTagId: 19,
    stockCalendarSnapshotsQuery: { data: total }, normalizeStockCalendarPoints,
    getPrevStockTradingDay: (date: string) => previousDates[date],
    readTagPauseHistory: () => [], initialBalancesData: { balances: {} }, selectedTag: { name: 'R1' },
    isMemberFacingLedgerView: true, isDateInTagPausePeriod: () => false,
  });
}

describe('R1 calendar actual scope/data source: owner total, all other identities personal', () => {
  it.each(['member', 'admin', 'owner', 'super_admin'])('非真实owner的角色%s只看个人；代看owner也同样', memberRole => {
    const canManageLedger37 = isLedger37FullManager({ ledgerId: 37, userId: 5, ownerId: 999, memberRole });
    const canViewLedger37StockTotal = actual('canViewLedger37StockTotal', { canManageLedger37, viewAsUserId: null });
    expect(canViewLedger37StockTotal).toBe(false);
    expect(actual('selectedStockCalendarScope', scope({ canViewLedger37StockTotal }))).toBe('member');
    expect(actual('canViewLedger37StockTotal', { canManageLedger37: true, viewAsUserId: 5 })).toBe(false);
  });
  it('真实owner即使有个人获配概览也仍看总盘，不等待个人概览完成', () => {
    expect(actual('selectedStockCalendarScope', scope({ canViewLedger37StockTotal: true }))).toBe('total');
    expect(actual('selectedStockCalendarScope', scope({ canViewLedger37StockTotal: true, stockTagOverviewQuery: {} }))).toBe('total');
    expect(points({ canViewLedger37StockTotal: true }).map((p: any) => p.dailyPnl)).toEqual([88888, 55555]);
  });
  it('成员严格取自己points中的日收益和市值，不再取总盘、取反或按总盘比例估算', () => {
    const result = points();
    expect(result.map((p: any) => p.dailyPnl)).toEqual([5, -8]);
    expect(result.map((p: any) => p.marketValue)).toEqual([100, 120]);
    expect(result.map((p: any) => p.totalPnl)).toEqual([5, -3]);
    expect(sumKnownStockDailyPnl(result)).toBe(-3);
    expect(JSON.stringify(result)).not.toMatch(/999999|88888|777777|55555|2000000/);
  });
  it('加载、失败或没有个人获配时不回退到缓存总盘', () => {
    expect(actual('selectedStockCalendarScope', scope({ stockTagOverviewQuery: {}, selectedStockOverview: undefined }))).toBe('loading');
    expect(actual('selectedStockCalendarScope', scope({ stockTagOverviewQuery: { data: [] }, selectedStockOverview: undefined }))).toBe('missing');
    expect(points({ stockTagOverviewQuery: {}, selectedStockOverview: undefined })).toEqual([]);
    expect(points({ stockTagOverviewQuery: { data: [] }, selectedStockOverview: undefined })).toEqual([]);
  });
  it('成员缺价保留null、真0保留0，日历不得用市值变化或累计差填未知日收益', () => {
    const result = points({ selectedStockOverview: { points: [personal[0], { ...personal[1], pnl: 0, dailyPnl: null, marketValue: 0 }] } });
    expect(result[1].dailyPnl).toBeNull(); expect(result[1].totalPnl).toBe(0); expect(result[1].marketValue).toBe(0);
    const pending = points({ selectedStockOverview: { points: [personal[0], { ...personal[1], priced: false }] } });
    expect(pending[1].dailyPnl).toBeNull(); expect(pending[1].marketValue).toBeNull();
  });
  it('日/月/年图及月度合计使用同一个个人series，值模式只显示个人市值', () => {
    const stockCalendarPoints = points();
    const base = { useMemo: (fn: Function) => fn(), calendarDate: { year: 2026, month: 10 }, isSelectedStockPortfolio: true,
      stockCalendarPoints, sumKnownStockDailyPnl, filteredTransactions: [], cumulativeMap: new Map(),
      selectedDailyReturnMap: new Map(), dayMap: new Map(), chartEffectiveStartDate: null };
    const daily = actual('chartData', { ...base, calendarMode: 'daily' });
    expect(daily.map((p: any) => p.balance)).toEqual([5, -8]);
    const values = actual('chartData', { ...base, calendarMode: 'balance' });
    expect(values.map((p: any) => p.balance)).toEqual([100, 120]);
    const monthly = actual('chartData', { ...base, calendarMode: 'monthly' });
    expect(monthly[10].balance).toBe(-3);
    const yearly = actual('chartData', { ...base, calendarMode: 'yearly' });
    expect(yearly.map((p: any) => p.pnl)).toEqual([5, -8]);
  });
  it('普通成员和AI不会预取总盘，也不会启用总盘查询；owner保留原预取', () => {
    const base = { useMemo: (fn: Function) => fn(), ledgerId: 37, initialBalancesData: { balances: {} }, r1ShowsAi: false,
      r1PresentationQuery: { data: {}, isError: false }, allCategories: [{ id: 19, name: 'R1', accountingMode: 'stock_portfolio' }], readTagVisible: () => true };
    expect(actual('stockCalendarPrefetchCategoryIds', { ...base, canViewLedger37StockTotal: false })).toEqual([]);
    expect(actual('stockCalendarPrefetchCategoryIds', { ...base, canViewLedger37StockTotal: true })).toEqual([19]);
    expect(actual('stockCalendarPrefetchCategoryIds', { ...base, canViewLedger37StockTotal: false, r1ShowsAi: true })).toEqual([]);
    const useQuery = vi.fn((options: any) => options);
    const queryBase = { useQuery, stockCalendarOptionsFor: () => ({ queryKey: ['safe'] }), selectedTagId: 19, isSelectedStockPortfolio: true,
      r1PresentationScope: true, r1PresentationQuery: { data: {}, isError: false }, r1ShowsAi: false };
    expect(actual('stockCalendarSnapshotsQuery', { ...queryBase, selectedStockCalendarScope: 'member' }).enabled).toBe(false);
    expect(actual('stockCalendarSnapshotsQuery', { ...queryBase, selectedStockCalendarScope: 'total' }).enabled).toBe(true);
    expect(actual('stockCalendarSnapshotsQuery', { ...queryBase, selectedStockCalendarScope: 'total', r1ShowsAi: true }).enabled).toBe(false);
  });
  it('成员错误来自个人查询，总盘错误不渗透；标题改为个人日结', () => {
    const personalError = new Error('个人读取失败'); const totalError = new Error('总盘读取失败');
    const bindings = { stockTagOverviewQuery: { error: personalError }, stockCalendarSnapshotsQuery: { error: totalError } };
    expect(actual('stockCalendarError', { ...bindings, selectedStockCalendarScope: 'member' })).toBe(personalError);
    expect(actual('stockCalendarError', { ...bindings, selectedStockCalendarScope: 'total' })).toBe(totalError);
    expect(actual('stockCalendarScopeLabel', { selectedStockCalendarScope: 'member' })).toBe('个人日结');
    expect(actual('stockCalendarScopeLabel', { selectedStockCalendarScope: 'total' })).toBe('标签总盘');
  });
  it('不同成员与代看仍使用不同身份查询key，不共用其他人的personal points', () => {
    const bindings = { useQuery: (options: any) => options, ledgerId: 37, marginTargetUserId: 5, viewAsUserId: null,
      trpcUtils: { client: { ledger: { getMyStockTagOverview: { query: vi.fn() } } } } };
    const own = actual('stockTagOverviewQuery', bindings);
    const other = actual('stockTagOverviewQuery', { ...bindings, marginTargetUserId: 6, viewAsUserId: 6 });
    expect(own.queryKey).not.toEqual(other.queryKey);
    expect(own.placeholderData).toBeUndefined();
  });
});
