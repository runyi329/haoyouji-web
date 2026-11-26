import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  buildOrdinaryDownsideScopes, nullableOrdinaryNumber, ordinaryDownsideChartPoints,
  ordinaryDownsideIdentityQueryKey, sumOrdinaryDownsideDailyPnl,
  type OrdinaryDownsideCategory, type OrdinaryDownsidePoint,
} from '../client/src/lib/ordinary-tag-downside-valuation-display';

const source = readFileSync(new URL('../client/src/pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
const service = readFileSync(new URL('./ordinary-tag-downside-valuation.ts', import.meta.url), 'utf8');
const helperSource = readFileSync(new URL('../client/src/lib/ordinary-tag-downside-valuation-display.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LedgerDetailAA.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function declaration(name: string): ts.VariableDeclaration {
  let found: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!found) throw new Error(`Actual frontend declaration missing: ${name}`);
  return found;
}
function actualFunction(name: string, context: Record<string, unknown>, memo = true) {
  const init = declaration(name).initializer!;
  const arrow = memo ? (init as ts.CallExpression).arguments[0] : init;
  const script = ts.transpileModule(`(${arrow.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return vm.runInNewContext(script, context, { timeout: 1000 });
}
const categories = [{ id: 7, name: '普通', accountingMode: 'manual_balance' }, { id: 8, name: '旧普通', accountingMode: 'manual_balance' },
  { id: 9, name: '股票', accountingMode: 'stock_portfolio' }];
const initialBalancesData = { balances: { 普通: 1000, 普通__ratio: 50, 普通__startDate: '2026-11-01',
  普通__margin: 100, 旧普通: 1000, 旧普通__ratio: 50, 旧普通__startDate: '2026-11-01' } };
const point = (date: string, balance: number, pnl: number | null, dailyPnl: number | null, extra: Partial<OrdinaryDownsidePoint> = {}): OrdinaryDownsidePoint => ({
  date, balance, pnl, dailyPnl, countedBalance: balance + 100, rawPnl: pnl === null ? null : pnl - 50,
  capitalChange: 400, withdrawToDate: 50, capitalChangeToday: 200, withdrawToday: 30, ruleVersion: 1, ...extra,
});
const ready = (points = [point('2026-11-02', 1500, -100, -100), point('2026-11-03', 0, 25, 125)]): OrdinaryDownsideCategory => ({
  categoryId: 7, categoryName: '普通', status: 'ready', points, latestDate: points.at(-1)?.date ?? null, totalPnl: points.at(-1)?.pnl ?? null, todayPnl: points.at(-1)?.dailyPnl ?? null,
});
function scopes(result = ready()) {
  return buildOrdinaryDownsideScopes(37, categories, { ledgerId: 37, categories: [result] });
}
function context(result = ready()) {
  const byId = scopes(result);
  return {
    initialBalancesData, categories: [categories[0]], activeMemberTransactions: [], transactionsData: [],
    filteredTransactions: [], stockTagOverviewById: new Map(), stockParticipantView: true, aaCryptoPrices: {},
    isMemberFacingLedgerView: true, ordinaryDownsideById: byId, selectedOrdinaryDownside: byId.get(7),
    dividendByTag: { 普通: 17 },
    selectedTag: categories[0], selectedTagId: 7, isSelectedStockPortfolio: false, stockCalendarPoints: [],
    capitalHistory: [], withdrawRecords: [], totalWithdraw: 0, capitalByTag: {}, withdrawByTag: {}, tagCashFlows: {},
    ledgerId: 37, ledgerData: {}, cumulativeMap: new Map(), dayMap: new Map(),
    nullableOrdinaryNumber, ordinaryDownsideChartPoints, sumOrdinaryDownsideDailyPnl,
    resolveMarginEntries: () => [{ coin: 'CNY', amount: 100, cnyValue: 100 }],
    readTagPauseHistory: () => [], isDateInTagPausePeriod: () => false, isR1Tag: () => false,
    getPrevTradingDay: () => { throw new Error('Configured path must not run legacy date/records calculation'); },
    stockFocusDate: '2026-11-03', latestCryptoPortfolioSnapshotDate: () => '2026-11-03', stockOverviewSettlementDisplay: () => { throw new Error('Stock path must not be used'); },
  };
}

describe('普通强平估值前端：完整服务端结果、真实金额和隔离', () => {
  it('无saved规则category absent，37旧标签和其他账本不进入新口径', () => {
    expect(buildOrdinaryDownsideScopes(37, categories, { ledgerId: 37, categories: [] }).size).toBe(0);
    expect(buildOrdinaryDownsideScopes(52, categories, { ledgerId: 37, categories: [ready()] }).size).toBe(0);
    expect(scopes().has(8)).toBe(false);
    expect(buildOrdinaryDownsideScopes(37, [categories[2]], { ledgerId: 37, categories: [{ ...ready(), categoryId: 9 }] }).size).toBe(0);
  });
  it('DTO全部点复用、不截断、不丢真实0，也不更改本金、提现、计入值或raw', () => {
    const points = Array.from({ length: 2105 }, (_, i) => point(`2026-${String(i).padStart(6, '0')}`, i === 2104 ? 0 : 1000 + i, i, i ? 1 : 0));
    const frozen = Object.freeze(points.map(p => Object.freeze(p))) as unknown as OrdinaryDownsidePoint[];
    const result = Object.freeze(ready(frozen));
    const before = JSON.stringify(result);
    const scope = scopes(result).get(7)!;
    expect(scope.points.length).toBe(2105);
    expect(scope.points[2104]).toBe(frozen[2104]);
    expect(scope.latestPoint?.balance).toBe(0);
    const chart = ordinaryDownsideChartPoints(scope, 1000, 100);
    expect(chart.at(-1)?.balance).toBe(0);
    for (const field of ['capitalChange', 'withdrawToDate', 'capitalChangeToday', 'withdrawToday', 'rawPnl', 'countedBalance'] as const) {
      expect(chart.at(-1)?.[field]).toBe(frozen.at(-1)?.[field]);
    }
    expect(JSON.stringify(result)).toBe(before);
  });
  it('pending/no_data/null永不Number(null)=0，未授权结果不闪现本地raw收益', () => {
    for (const status of ['pending', 'no_data'] as const) {
      const scope = scopes({ ...ready(), status, totalPnl: null, todayPnl: null }).get(7)!;
      expect(scope.totalPnl).toBeNull(); expect(scope.todayPnl).toBeNull();
    }
    const waiting = buildOrdinaryDownsideScopes(37, categories, undefined, () => true, true).get(7)!;
    expect(waiting.status).toBe('pending'); expect(waiting.totalPnl).toBeNull(); expect(waiting.points).toEqual([]);
    expect(nullableOrdinaryNumber(null)).toBeNull(); expect(nullableOrdinaryNumber(undefined)).toBeNull(); expect(nullableOrdinaryNumber(0)).toBe(0);
    expect(sumOrdinaryDownsideDailyPnl([])).toBeNull();
    expect(sumOrdinaryDownsideDailyPnl([point('a', 0, null, null)])).toBeNull();
  });
  it('暂停后点不透出，最新累计退到最后可见有效点，当日不可冒充0', () => {
    const result = ready([point('2026-11-02', 1000, -10, -10), point('2026-11-03', 900, 100, 110)]);
    const scope = buildOrdinaryDownsideScopes(37, categories, { ledgerId: 37, categories: [result] }, (_tag, date) => date <= '2026-11-02').get(7)!;
    expect(scope.points.map(p => p.date)).toEqual(['2026-11-02']); expect(scope.totalPnl).toBe(-10); expect(scope.todayPnl).toBeNull();
  });
  it('关闭后server恢复raw系列不强制未来为0、保留过去有效版本，不客户端套新规则', () => {
    const result = ready([point('2026-11-02', 1300, -150, -150), point('2026-11-03', 1350, -175, -25, { ruleVersion: 2, countedBalance: 1350, rawPnl: -175 })]);
    const scope = scopes(result).get(7)!;
    expect(scope.points[0].pnl).toBe(-150); expect(scope.points[1].pnl).toBe(-175);
    expect(scope.todayPnl).toBe(-25); expect(sumOrdinaryDownsideDailyPnl(scope.points)).toBe(scope.totalPnl);
    expect(helperSource).not.toMatch(/calculateOrdinaryTagDownside|thresholdAmount|remainingRatio|wallet|fetch\(|\.query\(/);
  });
  it('effective user + viewAs独立缓存，集中tRPC invalidate前缀仍命中全部身份', async () => {
    const base = [['ledger', 'getMyOrdinaryTagDownsideValuations'], { input: { ledgerId: 37 }, type: 'query' }];
    const client = new QueryClient();
    const a = ordinaryDownsideIdentityQueryKey(base, 37, 37, null);
    const b = ordinaryDownsideIdentityQueryKey(base, 37, 38, 38);
    const c = ordinaryDownsideIdentityQueryKey(base, 38, 38, null);
    client.setQueryData(a, 'a'); client.setQueryData(b, 'b'); client.setQueryData(c, 'c');
    expect(client.getQueryData(a)).toBe('a'); expect(client.getQueryData(b)).toBe('b'); expect(client.getQueryData(c)).toBe('c');
    await client.invalidateQueries({ queryKey: base });
    expect(client.getQueryState(a)?.isInvalidated).toBe(true); expect(client.getQueryState(b)?.isInvalidated).toBe(true); expect(client.getQueryState(c)?.isInvalidated).toBe(true);
    client.clear();
  });
});

describe('实际AA页面useMemo/日历/概览分支：只喂离线mock DTO，无DB/API/browser', () => {
  it('allTagsChartData与allTagsStats使用全部DTO，zero B真实保留，收益不乘第二次ratio', () => {
    const ctx = context();
    const rows = actualFunction('allTagsChartData', ctx)();
    expect(rows[0].points.map((p: any) => [p.date, p.pnl, p.balance, p.dailyPnl])).toEqual([
      ['2026-11-02', -100, 1500, -100], ['2026-11-03', 25, 0, 125],
    ]);
    const stats = actualFunction('allTagsStats', ctx)();
    expect(stats.totalPnl).toBe(25); expect(stats.totalMargin).toBe(100);
    expect(stats.perTagDetail[0].latestBalance).toBe(0);
    expect(stats.perTagDetail[0].capitalChange).toBe(400); expect(stats.perTagDetail[0].tagWithdraw).toBe(50);
  });
  it('个人stats/selectedDailyReturnMap/单日格全部同口径，不依赖空的截断交易记录', () => {
    const ctx = context();
    expect(actualFunction('stats', ctx)().totalPnl).toBe(25);
    const daily = actualFunction('selectedDailyReturnMap', ctx)();
    expect(Array.from(daily.values())).toEqual([-100, 125]);
    const cellCtx = { ...ctx, getDateStr: () => '2026-11-03', calendarMode: 'daily', formatMoney: (v: number, prefix = '') => prefix + v };
    expect(actualFunction('getCellValue', cellCtx, false)(3)).toBe('+125');
    expect(actualFunction('getCellPnl', cellCtx, false)(3)).toBe(125);
    expect(actualFunction('getCellValue', { ...cellCtx, calendarMode: 'balance' }, false)(3)).toBe('0');
    expect(actualFunction('getCellValue', { ...cellCtx, getDateStr: () => '2026-11-04' }, false)(4)).toBeNull();
  });
  it('主概览真实tagData.map callback只读server total/today，不用真实raw差/额外占比', () => {
    const init = declaration('tagData').initializer as ts.CallExpression;
    const callback = init.arguments[0];
    const script = ts.transpileModule(`(${callback.getText(ast)})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const ctx = context();
    const tag = actualFunction('allTagsChartData', ctx)()[0];
    const callbackFn = vm.runInNewContext(script, { ...ctx, visibleTags: [tag] }, { timeout: 1000 });
    const row = callbackFn(tag, 0);
    expect(row.latestPnl).toBe(25); expect(row.todayPnl).toBe(125); expect(row.latestBalance).toBe(0);
  });
  it('pending本人与全标签总和都null，不被0余额或有旧交易记录变成0收益', () => {
    const ctx = context({ ...ready(), status: 'pending', points: [point('2026-11-03', 0, null, null)], totalPnl: null, todayPnl: null });
    expect(actualFunction('stats', ctx)().totalPnl).toBeNull();
    expect(actualFunction('allTagsStats', ctx)().totalPnl).toBeNull();
    expect(actualFunction('getCellPnl', { ...ctx, getDateStr: () => '2026-11-03' }, false)(3)).toBeNull();
  });
  it('坏的最新余额null保留坏日期并pending，不用上一日ready余额或收益冒充最新', () => {
    const result = { ...ready(), status: 'pending' as const,
      points: [point('2026-11-02', 900, 50, 50), point('2026-11-03', 0, null, null, { balance: null, countedBalance: null, rawPnl: null })],
      totalPnl: null, todayPnl: null };
    const ctx = context(result);
    const stats = actualFunction('stats', ctx)();
    expect(stats.latestDate).toBe('2026-11-03'); expect(stats.latestBalance).toBeNull(); expect(stats.totalPnl).toBeNull();
    const detail = actualFunction('allTagsStats', ctx)().perTagDetail[0];
    expect(detail.latestDate).toBe('2026-11-03'); expect(detail.latestBalance).toBeNull(); expect(detail.tagPnl).toBeNull();
    const rows = actualFunction('allTagsChartData', ctx)();
    expect(rows[0].points.at(-1).balance).toBeNull(); expect(rows[0].points.at(-1).pnl).toBeNull();
    expect(actualFunction('getCellValue', { ...ctx, getDateStr: () => '2026-11-03', calendarMode: 'balance', formatMoney: String }, false)(3)).toBeNull();
  });
  it('旧ordinary absent真正运行原公式：A+C-B-W乘旧占比，日差原算法保留', () => {
    const old = { ...context(), ordinaryDownsideById: new Map(), selectedOrdinaryDownside: undefined,
      categories: [categories[1]], selectedTag: categories[1], getPrevTradingDay: () => '2026-10-30',
      filteredTransactions: [{ date: '2026-11-02', income: 900, expense: 0 }, { date: '2026-11-03', income: 800, expense: 0 }],
      totalWithdraw: 20, capitalHistory: [{ recordDate: '2026-11-03', amount: 100, description: 'capital_add' }], withdrawRecords: [{ date: '2026-11-03', amount: 20 }] };
    expect(actualFunction('stats', old)().totalPnl).toBe(140);
    expect(Array.from(actualFunction('selectedDailyReturnMap', old)().values())).toEqual([null, 180]);
  });
});

describe('前端source-contract安全边界', () => {
  it('单次身份缓存完整接口，37/rawpresentation/visible gate和切换取消生效', () => {
    expect(source.match(/getMyOrdinaryTagDownsideValuations\.query\(/g)).toHaveLength(1);
    expect(source).toContain('getQueryKey(trpc.ledger.getMyOrdinaryTagDownsideValuations, { ledgerId: 37 }');
    expect(source).toContain('Number(user?.id ?? 0), marginTargetUserId, viewAsUserId');
    expect(source).toContain('ordinaryDownsideIdentityRef.current !== ordinaryDownsideIdentity');
    expect(source).toContain('!r1PresentationQuery.isError && !r1ShowsAi');
    expect(source).toContain("categories.some((category: any) => category.accountingMode !== 'stock_portfolio')");
    expect(source).toContain('enabled: ordinaryDownsideQueryEnabled');
    expect(source).toContain('void queryClient.cancelQueries({ queryKey: getQueryKey(trpc.ledger.getMyOrdinaryTagDownsideValuations');
  });
  it('汇总日历、概览、选中日差和收益详情显式scope，不伪造旧余额公式', () => {
    expect(source).toContain('if (selectedOrdinaryDownside) return new Map(selectedOrdinaryDownside.points.map');
    expect(source).toContain(': ordinaryDownside ? ordinaryDownside.todayPnl');
    expect(source).toContain('if ((tag as any).ordinaryDownside) {');
    expect(source).toContain('const val = nullableOrdinaryNumber(point.dailyPnl)');
    expect(source).toContain('ordinarySummaryPendingDates');
    expect(source).toContain('if (selectedOrdinaryDownside) return <OrdinaryDownsideReturnDialog');
    for (const label of ['强平规则计入收益', '真实账户余额 B', '原始收益（raw）', '规则派生差（计入 − raw）', '规则计入值（非账户余额）']) expect(source).toContain(label);
    expect(source).toContain('不代表已实收分红');
    expect(source).toContain('const divAmt = dividendByTag[tag.name] ?? 0');
    expect(source).toContain('const totalDividend = Object.values(dividendByTag).reduce');
  });
  it('保留旧无规则算法/真实现金流/钱包/股票/照片双击权限，无普通管理入口', () => {
    expect(source).toContain('const pnl = (effectiveInitial - d.balance - withdrawToDate) * ratio');
    expect(source).toContain('const rawPnl = currentCapital - latestBalance - totalWithdraw');
    expect(source).toContain('const currentPrincipal = Number(balances[marginNoteTag] ?? 0) + (capitalByTag[marginNoteTag] || 0)');
    expect(source).toContain('const referenceDeposit = currentPrincipal * (ratioPercent / 100) * 0.2');
    expect(source).toContain('normalizeStockCalendarPoints(stockOverview.points || [],');
    expect(source).toContain('stockOverviewSettlementDisplay({');
    expect(source).toContain('consumeLedgerCalendarDoubleTap(calendarNumberTapRef');
    expect(source).toContain('onDoubleClick={() => { if (canRecordCalendarCell) openCalendarNumberEditor(day); }}');
    expect(source).not.toMatch(/ordinaryDownside.*(?:save|useMutation|setRule|walletHold)/);
    expect(helperSource).not.toMatch(/(?:capitalChange|withdrawToDate|withdrawToday)\s*\*/);
  });
  it('规则与全历史服务批量一次读取，无category循环N+1、无limit2000/200、无私人规则参数DTO', () => {
    expect(service.match(/await readAllOrdinaryTagDownsideRules\(/g)).toHaveLength(1);
    expect(service).not.toMatch(/for\s*\([^)]*(?:categor|rule)[^)]*\)[\s\S]{0,100}await.*(?:execute|selectRows)/);
    expect(service).not.toMatch(/LIMIT\s+(?:200|2000)\b/i);
    const dto = service.slice(service.indexOf('export type OrdinaryTagDownsideValuationPoint'), service.indexOf('export type BuildOrdinary'));
    expect(dto).not.toMatch(/threshold|remainingRatio|rules:|userId/);
    expect(service).toContain('rules: rules.get(category.id)!');
  });
});
