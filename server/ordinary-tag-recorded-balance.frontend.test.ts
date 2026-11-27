import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildOrdinaryDownsideScopes, formatOverviewDailyReturn, nullableOrdinaryNumber,
  ordinaryCalendarBalanceColor, ordinaryDownsideChartPoints, ordinaryOverviewDailyReturn,
  ordinaryOverviewRecordedBalance, sumOrdinaryDownsideDailyPnl,
  type OrdinaryDownsideCategory, type OrdinaryDownsidePoint, type OrdinaryDownsideScope,
} from '../client/src/lib/ordinary-tag-downside-valuation-display';
import { aggregateOverviewPnl, formatOverviewPnl } from '../client/src/lib/stock-overview-settlement-display';

// Read the page as text only: no page import, backend import, API, database or browser.
const source = readFileSync(new URL('../client/src/pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LedgerDetailAA.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const TODAY = '2026-11-27';
const TAG = '同花顺5648';
const CATEGORY_ID = 90243;
const categories = [
  { id: CATEGORY_ID, name: TAG, accountingMode: 'manual_balance' },
  { id: 90246, name: 'YCX10', accountingMode: 'manual_balance' },
];
// Regression fixture: 50mily has recorded balances, but no personal principal/start/ratio.
const unconfiguredBalances: Record<string, unknown> = {
  [`${TAG}__visible`]: 1, [`${TAG}__margin`]: 0, [`${TAG}__margins`]: [],
};
const ycxBalances: Record<string, unknown> = {
  YCX10: 100000, YCX10__startDate: '2026-09-11', YCX10__ratio: 0,
  YCX10__visible: 1, YCX10__margin: 0, YCX10__margins: [],
};
const point = (date: string, balance: number | null, pnl: number | null = null,
  dailyPnl: number | null = null): OrdinaryDownsidePoint => ({
  date, balance, pnl, dailyPnl, capitalChange: 0, withdrawToDate: 0,
  capitalChangeToday: 0, withdrawToday: 0,
});
function pending(points = [point('2026-11-26', 184254.06), point(TODAY, 202528.77)]): OrdinaryDownsideCategory {
  return { categoryId: CATEGORY_ID, categoryName: TAG, status: 'pending', points,
    latestDate: points.at(-1)?.date ?? null, totalPnl: null, todayPnl: null };
}
function ycx(): OrdinaryDownsideCategory {
  return { categoryId: 90246, categoryName: 'YCX10', status: 'ready',
    points: [point('2026-11-26', 44915.37, 0, 0)], latestDate: '2026-11-26', totalPnl: 0, todayPnl: 0 };
}
function scope(result = pending()): OrdinaryDownsideScope {
  return buildOrdinaryDownsideScopes(37, categories, { ledgerId: 37, categories: [result] }).get(result.categoryId)!;
}
function declaration(name: string): ts.VariableDeclaration {
  let found: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!found) throw new Error(`Actual frontend declaration missing: ${name}`);
  return found;
}
function execute(code: string, context: Record<string, unknown>): any {
  const compiled = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return vm.runInNewContext(compiled, context, { timeout: 1000 });
}
// Freeze Beijing's date independently of the machine date; no timers or services are started.
class RegressionDate extends Date {
  static now() { return Date.parse('2026-11-27T13:00:00.000Z'); }
}
function pageContext(result = pending(), balances: Record<string, unknown> = unconfiguredBalances,
  identity: Record<string, unknown> = {}) {
  const ordinaryDownside = scope(result);
  const initialBalance = Number(balances[result.categoryName] ?? 0);
  const tag = { name: result.categoryName, color: '#D32F2F', initialBalance, marginCny: 0,
    marginEntries: [], points: ordinaryDownsideChartPoints(ordinaryDownside, initialBalance, 0), ordinaryDownside };
  return {
    Date: RegressionDate, React, tag, visibleTags: [tag], displayedTagData: [],
    initialBalancesData: { balances }, ledgerId: 37, ledgerData: { userRole: 'admin' },
    user: { id: 501, role: 'user' }, userRole: 'admin', viewAsUserId: null, viewAsMember: null,
    // A delegated ledger admin need not have full-manager/edit permissions.
    canEdit: false, canManageLedger37: false, isJiamGSuperAdmin: false,
    isMemberFacingLedgerView: true, ordinaryDownsideById: new Map([[result.categoryId, ordinaryDownside]]),
    ordinaryOverviewRecordedBalance, ordinaryOverviewDailyReturn, ordinaryCalendarBalanceColor,
    ordinaryDownsideChartPoints, nullableOrdinaryNumber, formatOverviewDailyReturn,
    formatOverviewPnl, sumOrdinaryDownsideDailyPnl,
    stockFocusDate: TODAY, latestCryptoPortfolioSnapshotDate: () => TODAY,
    stockOverviewSettlementDisplay: () => { throw new Error('Ordinary fixture must not enter stock valuation'); },
    dividendByTag: {}, _latestDataDate: TODAY, showPausedSummary: false,
    dataCellCls: 'px-1 text-center flex items-center justify-center', rowHeight: 36,
    ...identity,
  };
}
function actualTagData(result = pending(), balances: Record<string, unknown> = unconfiguredBalances,
  identity: Record<string, unknown> = {}) {
  const ctx = pageContext(result, balances, identity);
  const initializer = declaration('tagData').initializer as ts.CallExpression;
  const callback = execute(`(${initializer.arguments[0].getText(ast)})`, ctx);
  return { row: callback(ctx.tag, 0), ctx };
}
function actualDataRowCallback(): ts.ArrowFunction {
  let found: ts.ArrowFunction | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(ast) === 'displayedTagData' && node.expression.name.text === 'map'
      && ts.isArrowFunction(node.arguments[0]) && node.arguments[0].getText(ast).includes('setDailyPnlDetail(')) found = node.arguments[0];
    if (!found) ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!found) throw new Error('Actual displayedTagData.map callback missing');
  return found;
}
function actualTodayCellCode(): string {
  const rowCallback = actualDataRowCallback();
  if (!ts.isBlock(rowCallback.body)) throw new Error('Actual overview row must have a block body');
  // Select the real today-column IIFE by its real detail setter, not a copied JSX implementation.
  let todayArrow: ts.ArrowFunction | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isArrowFunction(node) && ts.isParenthesizedExpression(node.parent)
      && ts.isCallExpression(node.parent.parent) && node.parent.parent.expression === node.parent
      && node.getText(ast).includes('setDailyPnlDetail(')) todayArrow = node;
    if (!todayArrow) ts.forEachChild(node, visit);
  };
  visit(rowCallback.body);
  if (!todayArrow) throw new Error('Actual today-column JSX IIFE missing');
  const beforeReturn: ts.Statement[] = [];
  for (const statement of rowCallback.body.statements) {
    if (ts.isReturnStatement(statement)) break;
    beforeReturn.push(statement);
  }
  // Preserve the actual row binding (including overviewRecordedBalance) and actual local declarations.
  return `((${rowCallback.parameters.map(param => param.getText(ast)).join(', ')}) => {
    ${beforeReturn.map(statement => statement.getText(ast)).join('\n')}
    return (${todayArrow.getText(ast)})();
  })`;
}
function actualTodayCell(row: any, ctx: Record<string, unknown>) {
  const detailCalls: unknown[] = [];
  const callback = execute(actualTodayCellCode(), {
    ...ctx, displayedTagData: [row],
    setDailyPnlDetail: (detail: unknown) => detailCalls.push(detail),
    setOrdinaryPnlDetail: (detail: unknown) => detailCalls.push(detail),
  });
  const element = callback(row, 0) as React.ReactElement;
  return { element, html: renderToStaticMarkup(element), detailCalls };
}
function clickableElements(node: React.ReactNode): React.ReactElement<any>[] {
  if (!React.isValidElement(node)) return [];
  const element = node as React.ReactElement<any>;
  return [typeof element.props.onClick === 'function' ? element : null,
    ...React.Children.toArray(element.props.children).flatMap(child => clickableElements(child))]
    .filter((item): item is React.ReactElement<any> => item !== null);
}
function clickCell(element: React.ReactElement) {
  let stopped = 0;
  for (const child of clickableElements(element)) child.props.onClick({ stopPropagation: () => stopped++ });
  return stopped;
}

// These tests intentionally target the agreed export; do not shim a missing implementation.
describe('ordinaryOverviewRecordedBalance：只读最新真实余额的窄兜底', () => {
  it('50mily同花顺5648 pending、无个人配置时返回11/27真实202528.77，不改收益', () => {
    const current = scope();
    expect(ordinaryOverviewRecordedBalance(current, TODAY, unconfiguredBalances)).toEqual({ amount: 202528.77, date: TODAY });
    expect(current.totalPnl).toBeNull(); expect(current.todayPnl).toBeNull();
    expect(current.latestPoint?.pnl).toBeNull(); expect(current.latestPoint?.dailyPnl).toBeNull();
    expect(ordinaryOverviewDailyReturn(current, TODAY)).toEqual({ amount: null, date: null });
  });
  it('balances未加载不兜底；已加载空配置、缺失或真实0比例不误用默认100%', () => {
    expect(ordinaryOverviewRecordedBalance(scope(), TODAY)).toBeNull();
    expect(ordinaryOverviewRecordedBalance(scope(), TODAY, {})).toEqual({ amount: 202528.77, date: TODAY });
    for (const ratio of [undefined, null, '', 0, '0']) {
      expect(ordinaryOverviewRecordedBalance(scope(), TODAY, { ...unconfiguredBalances, [`${TAG}__ratio`]: ratio }))
        .toEqual({ amount: 202528.77, date: TODAY });
    }
  });
  it('最新真实0保留，而不是通过truthy丢失或显示待更新', () => {
    expect(ordinaryOverviewRecordedBalance(scope(pending([point('2026-11-26', 184254.06), point(TODAY, 0)])), TODAY, unconfiguredBalances))
      .toEqual({ amount: 0, date: TODAY });
  });
  it('允许最新已录入过去日，不要求收益ready或冒充今日余额', () => {
    expect(ordinaryOverviewRecordedBalance(scope(pending([point('2026-11-26', 184254.06)])), TODAY, unconfiguredBalances))
      .toEqual({ amount: 184254.06, date: '2026-11-26' });
  });
  it('空系列和缺少最新点都不伪造0', () => {
    expect(ordinaryOverviewRecordedBalance(scope(pending([])), TODAY, unconfiguredBalances)).toBeNull();
    expect(ordinaryOverviewRecordedBalance({ ...scope(), latestPoint: undefined }, TODAY, unconfiguredBalances)).toBeNull();
  });
  it('最新余额null、缺失、负数、非有限或字符串都不回退上一好点', () => {
    for (const balance of [null, undefined, -1, NaN, Infinity, -Infinity, '', '202528.77']) {
      const bad = { ...point(TODAY, null), balance } as unknown as OrdinaryDownsidePoint;
      expect(ordinaryOverviewRecordedBalance(scope(pending([point('2026-11-26', 184254.06), bad])), TODAY, unconfiguredBalances)).toBeNull();
    }
  });
  it('最新点在未来时不跳过它回退到今天或昨日', () => {
    const future = pending([point(TODAY, 202528.77), point('2026-11-28', 210000)]);
    expect(ordinaryOverviewRecordedBalance(scope(future), TODAY, unconfiguredBalances)).toBeNull();
  });
  it('ready或no_data即使有最新真实余额也不能进入兜底', () => {
    for (const status of ['ready', 'no_data'] as const) {
      expect(ordinaryOverviewRecordedBalance(scope({ ...pending(), status }), TODAY, unconfiguredBalances)).toBeNull();
    }
  });
  it('已配本金或开始日期任意一项即阻断，包括未配齐的管理员配置', () => {
    const configurations = [
      { [TAG]: 100000 }, { [TAG]: 0 }, { [`${TAG}__startDate`]: '2026-09-11' },
      { [TAG]: 100000, [`${TAG}__ratio`]: 0 },
      { [`${TAG}__startDate`]: '2026-09-11', [`${TAG}__ratio`]: 0 },
      { [TAG]: 100000, [`${TAG}__startDate`]: '2026-09-11' },
    ];
    for (const configuration of configurations) {
      expect(ordinaryOverviewRecordedBalance(scope(), TODAY, { ...unconfiguredBalances, ...configuration })).toBeNull();
    }
  });
  it('正比例和损坏比例配置不因Number转换或缺本金而兜底', () => {
    for (const ratio of [1, 50, 100, '50', -1, NaN, Infinity, -Infinity, 'broken', false, {}, []]) {
      expect(ordinaryOverviewRecordedBalance(scope(), TODAY, { ...unconfiguredBalances, [`${TAG}__ratio`]: ratio })).toBeNull();
    }
  });
  it('损坏本金和开始日配置不能伪装成未配置', () => {
    for (const configuration of [{ [TAG]: 'broken' }, { [TAG]: NaN }, { [TAG]: -1 },
      { [`${TAG}__startDate`]: 'not-a-date' }]) {
      expect(ordinaryOverviewRecordedBalance(scope(), TODAY, { ...unconfiguredBalances, ...configuration })).toBeNull();
    }
  });
  it('旧单笔正押金或任意币种正押金都阻断，不用净额/币价隐藏正押金', () => {
    const configurations = [
      { [`${TAG}__margin`]: 100 },
      { [`${TAG}__margins`]: [{ coin: 'CNY', amount: 100 }] },
      { [`${TAG}__margins`]: JSON.stringify([{ coin: 'CNY', amount: 100 }]) },
      { [`${TAG}__margins`]: [{ coin: 'BTC', amount: 0.01 }] },
      { [`${TAG}__margins`]: [{ coin: 'CNY', amount: 100 }, { coin: 'CNY', amount: -100 }] },
    ];
    for (const configuration of configurations) {
      expect(ordinaryOverviewRecordedBalance(scope(), TODAY, { ...unconfiguredBalances, ...configuration })).toBeNull();
    }
  });
  it('空押金JSON与无关标签配置不阻断当前未配置标签', () => {
    const balances = { ...unconfiguredBalances, ...ycxBalances, [`${TAG}__margins`]: '[]' };
    expect(ordinaryOverviewRecordedBalance(scope(), TODAY, balances)).toEqual({ amount: 202528.77, date: TODAY });
  });
  it('损坏旧押金值、损坏JSON或非空押金配置不能被当成无押金', () => {
    for (const configuration of [
      { [`${TAG}__margin`]: 'broken' }, { [`${TAG}__margin`]: NaN },
      { [`${TAG}__margin`]: -1 }, { [`${TAG}__margin`]: false },
      { [`${TAG}__margins`]: 'not-json' }, { [`${TAG}__margins`]: '{}' },
      { [`${TAG}__margins`]: {} }, { [`${TAG}__margins`]: [null] },
    ]) {
      expect(ordinaryOverviewRecordedBalance(scope(), TODAY, { ...unconfiguredBalances, ...configuration })).toBeNull();
    }
  });
  it('YCX10初始100000/start9/11/ratio0 ready零收益不替换成44915.37余额', () => {
    const configured = scope(ycx());
    expect(ordinaryOverviewRecordedBalance(configured, TODAY, ycxBalances)).toBeNull();
    expect(ordinaryOverviewDailyReturn(configured, TODAY)).toEqual({ amount: 0, date: '2026-11-26' });
    expect(configured.totalPnl).toBe(0);
  });
  it('冻结DTO与配置可读且无副作用，不引入私人规则字段', () => {
    const current = scope();
    Object.freeze(current.points); current.points.forEach(Object.freeze);
    Object.freeze(current);
    const balances = Object.freeze({ ...unconfiguredBalances });
    const before = JSON.stringify({ current, balances });
    const display = ordinaryOverviewRecordedBalance(current, TODAY, balances);
    expect(display).toEqual({ amount: 202528.77, date: TODAY });
    expect(Object.keys(display!).sort()).toEqual(['amount', 'date']);
    expect(JSON.stringify({ current, balances })).toBe(before);
  });
});

describe('真实tagData.map callback：角色、配置与收益隔离', () => {
  it('37账本admin和owner获得单独overviewRecordedBalance，收益字段继续null', () => {
    for (const role of ['admin', 'owner']) {
      const { row } = actualTagData(pending(), unconfiguredBalances, { ledgerData: { userRole: role }, userRole: role });
      expect(row.overviewRecordedBalance).toEqual({ amount: 202528.77, date: TODAY });
      expect(row.latestBalance).toBe(202528.77); expect(row.prevBalance).toBe(184254.06);
      expect(row.todayPnl).toBeNull(); expect(row.latestPnl).toBeNull();
      expect(row.overviewDailyPnl).toBeNull(); expect(row.overviewDailyDate).toBeNull();
    }
  });
  it('普通成员、不认识的角色或未加载角色不调用helper，不能借全局admin/canEdit越权', () => {
    for (const role of ['member', 'user', 'viewer', undefined]) {
      let calls = 0;
      const { row } = actualTagData(pending(), unconfiguredBalances, {
        ledgerData: { userRole: role }, userRole: 'admin', user: { id: 37, role: 'admin' }, canEdit: true,
        canManageLedger37: true,
        ordinaryOverviewRecordedBalance: (...args: Parameters<typeof ordinaryOverviewRecordedBalance>) => {
          calls++; return ordinaryOverviewRecordedBalance(...args);
        },
      });
      expect(calls).toBe(0); expect(row.overviewRecordedBalance ?? null).toBeNull();
      expect(row.todayPnl).toBeNull(); expect(row.latestPnl).toBeNull();
    }
  });
  it('普通成员代看同样无兜底，当前账本角色不被外部管理员身份覆盖', () => {
    let calls = 0;
    const { row } = actualTagData(pending(), unconfiguredBalances, {
      ledgerData: { userRole: 'member' }, userRole: 'member', viewAsUserId: 5648,
      viewAsMember: { userId: 5648, role: 'member' }, user: { id: 37, role: 'admin' }, canEdit: true,
      ordinaryOverviewRecordedBalance: (...args: Parameters<typeof ordinaryOverviewRecordedBalance>) => {
        calls++; return ordinaryOverviewRecordedBalance(...args);
      },
    });
    expect(calls).toBe(0); expect(row.overviewRecordedBalance ?? null).toBeNull(); expect(row.todayPnl).toBeNull();
  });
  it('非37账本owner也不能调用余额兜底helper', () => {
    let calls = 0;
    const { row } = actualTagData(pending(), unconfiguredBalances, {
      ledgerId: 52, ledgerData: { userRole: 'owner' }, userRole: 'owner',
      ordinaryOverviewRecordedBalance: (...args: Parameters<typeof ordinaryOverviewRecordedBalance>) => {
        calls++; return ordinaryOverviewRecordedBalance(...args);
      },
    });
    expect(calls).toBe(0); expect(row.overviewRecordedBalance ?? null).toBeNull();
  });
  it('管理员本金/日期配置缺一项、正比例或损坏配置导致pending，不能兜底掩盖坏收益', () => {
    for (const configuration of [{ [TAG]: 100000 }, { [`${TAG}__startDate`]: '2026-09-11' },
      { [TAG]: 100000, [`${TAG}__startDate`]: '2026-09-11', [`${TAG}__ratio`]: 50 },
      { [`${TAG}__ratio`]: 'broken' }]) {
      const { row } = actualTagData(pending(), { ...unconfiguredBalances, ...configuration });
      expect(row.overviewRecordedBalance ?? null).toBeNull();
      expect(row.todayPnl).toBeNull(); expect(row.latestPnl).toBeNull();
    }
  });
  it('YCX10实际回调保持零收益与余额分离，ready不生成余额兜底', () => {
    const { row } = actualTagData(ycx(), ycxBalances);
    expect(row.overviewRecordedBalance ?? null).toBeNull();
    expect(row.latestPnl).toBe(0); expect(row.todayPnl).toBe(0);
    expect(row.overviewDailyPnl).toBe(0); expect(row.latestBalance).toBe(44915.37);
  });
});

describe('实际当日列JSX：真实余额标识、颜色和不可打开收益明细', () => {
  it('实际回调产生的202528.77按概览原精度显示数字和小字余额，不显示待更新', () => {
    const { row, ctx } = actualTagData();
    const { html, element, detailCalls } = actualTodayCell(row, ctx);
    expect(html).toContain(formatOverviewDailyReturn(202528.77));
    expect(html).toMatch(/<span[^>]*(?:text-\[9px\]|font-size:9px)[^>]*>余额<\/span>/);
    expect(html).not.toContain('待更新'); expect(html).not.toContain('--');
    expect(html).toContain('cursor:default'); expect(html).not.toContain('text-decoration:underline');
    clickCell(element); expect(detailCalls).toEqual([]);
  });
  it('实际旧日期余额灰显并注明已登记日期，不冒充今日收益或打开收益计算', () => {
    const { row, ctx } = actualTagData(pending([point('2026-11-25', 180000), point('2026-11-26', 184254.06)]));
    expect(row.overviewRecordedBalance).toEqual({ amount: 184254.06, date: '2026-11-26' });
    const { html, element, detailCalls } = actualTodayCell(row, ctx);
    expect(html).toContain(formatOverviewDailyReturn(184254.06));
    expect(html).toContain('title="2026-11-26已登记余额"');
    expect(html.toLowerCase()).toContain('color:#bdbdbd');
    expect(html).toContain('余额'); expect(html).not.toContain('待更新');
    expect(row.todayPnl).toBeNull(); expect(row.latestPnl).toBeNull();
    clickCell(element); expect(detailCalls).toEqual([]);
  });
  it('实际余额上涨红、下跌绿，不按个人对赌收益方向倒置', () => {
    const scenarios = [
      { balance: 202528.77, color: '#D32F2F' },
      { balance: 180000, color: '#4CAF50' },
    ];
    for (const scenario of scenarios) {
      const { row, ctx } = actualTagData(pending([point('2026-11-26', 184254.06), point(TODAY, scenario.balance)]));
      const { html } = actualTodayCell(row, ctx);
      expect(html.toLowerCase()).toContain(`color:${scenario.color.toLowerCase()}`);
      expect(html).toContain(formatOverviewDailyReturn(scenario.balance));
      expect(html).toContain('余额'); expect(html).not.toContain('待更新');
      expect(row.todayPnl).toBeNull(); expect(row.latestPnl).toBeNull();
    }
  });
  it('最新真实0实际JSX显示0余额，跌至0沿用真实余额绿色，点击无个人收益明细', () => {
    const { row, ctx } = actualTagData(pending([point('2026-11-26', 184254.06), point(TODAY, 0)]));
    expect(row.overviewRecordedBalance).toEqual({ amount: 0, date: TODAY });
    const { html, element, detailCalls } = actualTodayCell(row, ctx);
    expect(html).toMatch(/>0<span[^>]*>余额<\/span>/);
    expect(html.toLowerCase()).toContain('color:#4caf50');
    expect(html).not.toContain('待更新'); expect(html).not.toContain('--');
    clickCell(element); expect(detailCalls).toEqual([]);
  });
  it('普通成员及普通成员代看实际当日列仍待更新，不显示余额', () => {
    for (const viewAsUserId of [null, 5648]) {
      const { row, ctx } = actualTagData(pending(), unconfiguredBalances, {
        ledgerData: { userRole: 'member' }, userRole: 'member', viewAsUserId,
        user: { id: 37, role: 'admin' }, canEdit: true,
      });
      const { html, element, detailCalls } = actualTodayCell(row, ctx);
      expect(html).toContain('待更新'); expect(html).not.toContain('余额');
      expect(html).not.toContain(formatOverviewDailyReturn(202528.77));
      clickCell(element); expect(detailCalls).toEqual([]);
    }
  });
  it('最新坏余额或个人配置缺项时实际当日列待更新，不回退旧真实余额', () => {
    for (const sample of [
      { result: pending([point('2026-11-26', 184254.06), point(TODAY, null)]), balances: unconfiguredBalances },
      { result: pending(), balances: { ...unconfiguredBalances, [TAG]: 100000 } },
      { result: pending(), balances: { ...unconfiguredBalances, [`${TAG}__startDate`]: '2026-09-11' } },
    ]) {
      const { row, ctx } = actualTagData(sample.result, sample.balances);
      const { html } = actualTodayCell(row, ctx);
      expect(html).toContain('待更新'); expect(html).not.toContain('余额');
      expect(html).not.toContain(formatOverviewDailyReturn(184254.06));
      expect(html).not.toContain(formatOverviewDailyReturn(202528.77));
    }
  });
  it('YCX10真实零收益实际JSX仍可打开原个人收益明细，不标成余额', () => {
    const { row, ctx } = actualTagData(ycx(), ycxBalances);
    const { html, element, detailCalls } = actualTodayCell(row, ctx);
    expect(html).toContain('>0</span>'); expect(html).not.toContain('余额'); expect(html).not.toContain('待更新');
    expect(html).toContain('cursor:pointer');
    expect(clickCell(element)).toBeGreaterThan(0);
    expect(detailCalls).toHaveLength(1);
    expect(detailCalls[0]).toMatchObject({ tagName: 'YCX10', todayPnl: 0, latestPnl: 0, latestBalance: 44915.37 });
  });
  it('即使意外携带规则字段，实际tagData和当日列仅展示余额数字与余额标签', () => {
    const malicious = pending();
    Object.assign(malicious.points[1], {
      rawPnl: 987654321, countedBalance: 876543210, ruleVersion: 99, thresholdAmount: 765432109, remainingRatio: 0.23,
    });
    const { row, ctx } = actualTagData(malicious);
    expect(Object.keys(row.overviewRecordedBalance).sort()).toEqual(['amount', 'date']);
    const { html } = actualTodayCell(row, ctx);
    expect(html).toContain('余额'); expect(html).toContain(formatOverviewDailyReturn(202528.77));
    expect(html).not.toMatch(/强平|规则|计入|派生|raw|保证金|已隐藏|threshold|remainingRatio|ruleVersion|987654321|876543210|765432109|987,654,321|876,543,210|765,432,109/);
  });
});

describe('实际收益合计：余额只展示，不混入累计或今日收益', () => {
  it('实际累计合计函数保留pending未知，混入YCX10真实0也不能把余额当收益', () => {
    const recorded = actualTagData().row;
    const configured = actualTagData(ycx(), ycxBalances).row;
    expect(aggregateOverviewPnl([configured]).total).toBe(0);
    const total = aggregateOverviewPnl([recorded, configured]);
    expect(total.total).toBeNull(); expect(total.missingCount).toBe(1); expect(total.note).toBe('待更新');
    expect(total.title).not.toContain('202528');
  });
  it('真实今日合计执行页面实际updatedTagsData/totalTodayPnl表达式，不统计余额行', () => {
    const recorded = actualTagData().row;
    const configured = actualTagData(ycx(), ycxBalances).row;
    const tagData = [recorded, configured];
    const updated = execute(`(${declaration('updatedTagsData').initializer!.getText(ast)})`, { tagData, _latestDataDate: TODAY });
    expect(updated).not.toContain(recorded);
    expect(updated).toHaveLength(0); // YCX10 last updated 11/26 is not today's 11/27 return.
    const amount = execute(`(${declaration('totalTodayPnl').initializer!.getText(ast)})`, { updatedTagsData: updated });
    expect(amount).toBe(0); // The raw subtotal is 0; the UI's completeness gate must still show unknown.
    expect(recorded.todayPnl).toBeNull(); expect(recorded.latestPnl).toBeNull();
  });
});
