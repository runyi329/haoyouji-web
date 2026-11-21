import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as display from './stock-overview-settlement-display';
import { expectedStockSettlementDate, nullableStockNumber, normalizeStockCalendarPoints, isCryptoPortfolioCalendarPoint } from './ledger-stock-calendar';
import { latestCryptoPortfolioSnapshotDate, CRYPTO_PORTFOLIO_POLICY_VERSION } from '../../../shared/crypto-portfolio-policy';

// Execute production AST/JSX, not a copied view. Inert callbacks only; no app/backend, HTTP or DB.
const source = readFileSync(new URL('../pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LedgerDetailAA.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function unique(predicate: (n: ts.Node) => boolean) {
  const found: ts.Node[] = []; const visit = (n: ts.Node) => { if (predicate(n)) found.push(n); ts.forEachChild(n, visit); };
  visit(ast); if (found.length !== 1) throw new Error(`Actual production AST expected unique node, found ${found.length}`); return found[0];
}
function execute(code: string, scope: Record<string, any>) {
  const js = ts.transpileModule(`const actual = (${code});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function('React', ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
}
function initializer(name: string, scope: Record<string, any>) {
  const n = unique(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name) as ts.VariableDeclaration;
  return execute(n.initializer!.getText(ast), scope);
}
const overviewArrow = unique(n => ts.isArrowFunction(n) && ts.isBlock(n.body) && n.body.statements.some(s =>
  ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(ast) === 'visibleTags')));
const ready = (patch: Record<string, any> = {}) => ({ date: '2026-11-20', snapshotDate: '2026-11-20', totalPnl: 76907.616, pnl: 76907.616,
  dailyPnl: 8412.302, dailyPnlReady: true, ready: true, marketValue: 12345, costValue: 20000, previousDate: '2026-11-19', historical: true, ...patch });
const pending = (patch: Record<string, any> = {}) => ready({ date: '2026-11-21', snapshotDate: '2026-11-21', totalPnl: null, pnl: null,
  dailyPnl: null, dailyPnlReady: false, ready: false, status: 'pending', marketValue: null, ...patch });
function dto(policy = 'mixed-crypto-natural-day', patch: Record<string, any> = {}) {
  return { categoryId: 1, startDate: '2026-11-01', summary: {
    totalPnl: null, marketValue: null, latestSnapshot: pending(), priorSnapshot: ready(), lastConfirmedSnapshot: ready(),
    confirmedTotalPnl: 76907.616, confirmedAsOf: '2026-11-20', settlementPolicy: policy,
    expectedDate: policy === 'stock-trading-day' ? '2026-11-20' : '2026-11-21', ...patch }, points: [ready(), pending()] };
}
function tag(data = dto(), name = 'R1') {
  const scope = { useMemo: (fn: any) => fn(), initialBalancesData: { balances: {} }, categories: [{ id: 1, name, accountingMode: 'stock_portfolio' }],
    stockTagOverviewById: new Map([[1, data]]), aaCryptoPrices: {}, readTagPauseHistory: () => [], resolveMarginEntries: () => [],
    isR1Tag: (name: string) => name === 'R1', isMemberFacingLedgerView: true, isDateInTagPausePeriod: () => false,
    activeMemberTransactions: [], tagCashFlows: {}, stockParticipantView: true,
    normalizeStockCalendarPoints, nullableStockNumber, isCryptoPortfolioCalendarPoint, getPrevStockTradingDay: () => '2026-11-19' };
  return initializer('allTagsChartData', scope)[0];
}
function tree(tags: any[], patch: Record<string, any> = {}) {
  const scope = { ...display, expectedStockSettlementDate, latestCryptoPortfolioSnapshotDate, nullableStockNumber,
    allTagsChartData: tags, initialBalancesData: { balances: {} }, isNonTradingDateStr: (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() % 6 === 0,
    overviewSort: null, dividendByTag: {}, overviewTotalPnlRef: { current: 0 }, isR1Tag: (name: string) => name === 'R1',
    overviewFocusMetric: 'today', showPausedTagDetails: false, OVERVIEW_FOCUS_OPTIONS: [
      { key: 'today', label: '今日' }, { key: 'pnl', label: '回报' }, { key: 'amount', label: '押金' }, { key: 'dividend', label: '分红' }, { key: 'annualized', label: '年化' }],
    capitalByTag: {}, showActiveMarginSummary: false, stockTagOverviewQuery: {}, overviewNativeScrollRef: { current: null }, overviewScrollMaxHeight: null,
    canManageDividends: false, tooltipRatioTag: null, ChevronRight: 'span', categories: [], stockTagOverviewById: new Map(),
    marginNoteCounts: {}, dividendNoteCounts: {}, setShowPausedTagDetails: vi.fn(),
    formatSignedMarginCny: initializer('formatSignedMarginCny', {}), formatSignedMarginNumber: initializer('formatSignedMarginNumber', {}), ...patch };
  return execute(overviewArrow.getText(ast), scope)();
}
function nodes(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : []; }
function text(tree: any): string { return Array.isArray(tree) ? tree.map(text).join('') : tree == null || typeof tree === 'boolean' ? '' : typeof tree === 'object' ? text(tree.props?.children) : String(tree); }
function titled(tree: any, phrase: string) { return nodes(tree).find(n => n.type === 'span' && typeof n.props?.title === 'string' && n.props.title.includes(phrase)); }
function rowPnl(tree: any) { return titled(tree, '个人已确认累计回报') ?? titled(tree, '个人累计回报待更新'); }
function freeze() { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-21T09:00:00Z')); }
afterEach(() => vi.useRealTimers());

describe('ordinary R1 overview: actual production AST/JSX and nullable settlement helper', () => {
  it('yesterday ready/today pending retains confirmed CNY cumulative, not yesterday daily as today', () => {
    freeze(); const view = tree([tag()]);
    expect(text(rowPnl(view))).toBe('76,908截至11/20');
    const daily = titled(view, '个人混合组合自然日日结 2026-11-21');
    expect(text(daily)).toBe('--待更新'); expect(text(daily)).not.toContain('8,412');
    expect(rowPnl(view).props.title).toContain('2026-11-20');
    const html = renderToStaticMarkup(view); expect(html).not.toMatch(/NaN|Infinity/);
  });
  it('explicit personal stock policy wins even old points contain crypto; latest trading day is not Saturday today', () => {
    freeze(); const data = dto('stock-trading-day'); data.points[0].policyVersion = CRYPTO_PORTFOLIO_POLICY_VERSION;
    const view = tree([tag(data)]); expect(text(titled(view, '个人股票最近交易日日结 2026-11-20'))).toBe('8,41211/20日结');
    expect(text(view)).toContain('股票最近交易日日结 11/20'); expect(text(view)).not.toContain('股票最近交易日日结 11/21');
    const daily = titled(view, '个人股票最近交易日日结 2026-11-20'); expect(daily.props.title).not.toContain('今日');
  });
  it('real zero cumulative and daily render 0, null/nonfinite remain pending, never zero', () => {
    freeze(); const zero = dto('stock-trading-day', { confirmedTotalPnl: 0, lastConfirmedSnapshot: ready({ totalPnl: 0, pnl: 0, dailyPnl: 0 }), priorSnapshot: null });
    zero.points = [ready({ totalPnl: 0, pnl: 0, dailyPnl: 0 })];
    const view = tree([tag(zero)]); expect(text(rowPnl(view))).toBe('0截至11/20'); expect(text(titled(view, '个人股票最近交易日日结'))).toBe('011/20日结');
    const unknown = dto('stock-trading-day', { confirmedTotalPnl: null, confirmedAsOf: null, lastConfirmedSnapshot: null, priorSnapshot: null }); unknown.points = [pending()];
    expect(text(rowPnl(tree([tag(unknown)])))).toBe('--待更新');
    for (const value of [null, NaN, Infinity]) expect(display.formatOverviewPnl(value)).toBe('--');
  });
  it('legacy nullable contract falls back to latest finite ready, not unconfirmed latest or current empty positions', () => {
    const old = { totalPnl: null, latestSnapshot: pending(), priorSnapshot: ready(), positions: [] };
    const result = display.stockOverviewSettlementDisplay({ summary: old, points: [ready(), pending({ policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION })], expectedStockDate: '2026-11-20', expectedCryptoDate: '2026-11-21' });
    expect(result.confirmedTotalPnl).toBe(76907.616); expect(result.confirmedAsOf).toBe('2026-11-20'); expect(result.dailyPnl).toBeNull();
    expect(result.usesCryptoPolicy).toBe(true);
    const pure = display.stockOverviewSettlementDisplay({ summary: { ...old, settlementPolicy: 'stock-trading-day', expectedDate: '2026-11-20' }, points: [ready()], expectedStockDate: 'WRONG', expectedCryptoDate: 'WRONG' });
    expect(pure.dailyPnl).toBe(8412.302); expect(pure.expectedDate).toBe('2026-11-20');
  });
  it.each([null, { col: 'pnl', dir: 'asc' }, { col: 'pnl', dir: 'desc' }, { col: 'today', dir: 'asc' }])('actual filtered/sorted rows never form complete total with unknown stock: %j', overviewSort => {
    freeze(); const unknown = dto('stock-trading-day', { confirmedTotalPnl: null, confirmedAsOf: null, lastConfirmedSnapshot: null, priorSnapshot: null }); unknown.points = [pending()];
    const view = tree([tag(unknown), tag(dto('stock-trading-day'), 'Other')], { overviewSort });
    const total = titled(view, '累计合计待更新'); expect(text(total)).toBe('--待更新'); expect(total.props.title).toContain('未按0');
    const dailyTotal = nodes(view).find(n => n.type === 'span' && n.props?.title?.includes('合计待更新，未将未知'));
    expect(text(dailyTotal)).toBe('--待更新');
    expect(text(titled(tree([tag(dto('stock-trading-day'), 'Other')], { overviewSort }), '各行展示口径累计合计'))).toBe('76,908已确认11/20');
  });
  it('stock/mixed coexist: no fake same-day title or incomplete daily full amount, cumulative cutoff remains accurate', () => {
    freeze(); const view = tree([tag(dto('stock-trading-day')), tag(dto(), 'Mixed')]);
    expect(text(view)).toContain('日结/当日');
    expect(text(titled(view, '个人股票最近交易日日结 2026-11-20'))).toContain('8,412');
    expect(text(titled(view, '个人混合组合自然日日结 2026-11-21'))).toBe('--待更新');
    expect(text(titled(view, '各行展示口径累计合计'))).toBe('153,815已确认11/20');
    expect(text(nodes(view).find(n => n.type === 'span' && n.props?.title?.includes('合计待更新，未将未知')))).toBe('--待更新');
  });
  it('refresh new ready replaces old confirmed cumulative and daily without stale retained values', () => {
    freeze(); const before = tree([tag()]); expect(text(rowPnl(before))).toContain('截至11/20');
    const next = ready({ date: '2026-11-21', snapshotDate: '2026-11-21', totalPnl: 80000, pnl: 80000, dailyPnl: 3092.384 });
    const data = dto('mixed-crypto-natural-day', { latestSnapshot: next, confirmedTotalPnl: 80000, confirmedAsOf: '2026-11-21', lastConfirmedSnapshot: next }); data.points = [ready(), next];
    const after = tree([tag(data)]); expect(text(rowPnl(after))).toBe('80,000截至11/21'); expect(text(titled(after, '个人混合组合自然日日结 2026-11-21'))).toBe('3,092');
  });
  it('paused unknown stays unknown in folded aggregate, unrelated ordinary dividend and focus buttons unchanged', () => {
    freeze(); const unknown = dto('stock-trading-day', { confirmedTotalPnl: null, confirmedAsOf: null, lastConfirmedSnapshot: null, priorSnapshot: null }); unknown.points = [pending()];
    const balances = { R1__pauseDate: '2026-11-21' };
    const view = tree([tag(unknown)], { initialBalancesData: { balances } });
    expect(text(titled(view, '累计合计待更新'))).toBe('--待更新'); expect(text(view)).toContain('已暂停 1 人');
    const ordinary = { name: 'Ordinary', points: [{ date: '2026-11-21', pnl: 100, balance: 900 }], initialBalance: 1000, marginCny: 200, marginEntries: [] };
    const ordinaryView = tree([ordinary], { dividendByTag: { Ordinary: 25 } }); expect(text(ordinaryView)).toContain('25');
    expect(nodes(ordinaryView).filter(n => n.type === 'button' && n.props['aria-pressed'] !== undefined).map(text)).toEqual(['今日', '回报', '押金', '分红', '年化']);
  });
  it('metadata/helper never read raw prices/positions/AI payload, and actual AA AI early-return does not render ordinary overview', () => {
    freeze(); const data = dto(); Object.assign(data.summary, { secret: 'SECRET_NOTE', marketPrice: 987654321, positions: [{ symbol: 'SECRET_SYMBOL' }], categoryName: 'SECRET_TAG' });
    const html = renderToStaticMarkup(tree([tag(data)])); expect(html).not.toMatch(/SECRET_|987654321/);
    const branch = unique(n => ts.isIfStatement(n) && n.expression.getText(ast) === 'r1ShowsAi' && n.getText(ast).includes('<Ledger37AiHome'));
    const render = execute(`() => { ${branch.getText(ast)} }`, { r1ShowsAi: true, Ledger37AiHome: 'safe-home', marginTargetUserId: 901, onBack: vi.fn(), r1PresentationQuery: { data: {} } });
    expect(render().type).toBe('safe-home'); expect(text(render())).not.toMatch(/R1|76,908|日结/);
  });
});
