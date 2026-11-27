import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { buildOrdinaryDownsideScopes, ordinaryCalendarBalanceColor, type OrdinaryDownsidePoint, type OrdinaryDownsideScope } from '../client/src/lib/ordinary-tag-downside-valuation-display';

const aa = readFileSync(new URL('../client/src/pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
const point = (date: string, balance: number | null, dailyPnl: number | null = 0): OrdinaryDownsidePoint => ({ date, balance, dailyPnl, pnl: 0, capitalChange: 0, withdrawToDate: 0, capitalChangeToday: 0, withdrawToday: 0 });
const scope = (points: OrdinaryDownsidePoint[]): OrdinaryDownsideScope => ({ categoryId: 7, categoryName: '余额', status: 'ready', points, latestPoint: points.at(-1), latestDate: points.at(-1)?.date ?? null, totalPnl: 0, todayPnl: 0, pointByDate: new Map(points.map(item => [item.date, item])) });
const balances = scope([
  point('2026-11-23', 46586.83), point('2026-11-24', 46105.83),
  point('2026-11-25', 42804.37), point('2026-11-26', 44915.37),
]);

function actualOrdinaryColor(selectedOrdinaryDownside: OrdinaryDownsideScope, dateStr: string, calendarMode = 'balance', startDate = '') {
  const ast = ts.createSourceFile('actual.tsx', aa, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body = '';
  const visit = (node: ts.Node) => {
    if (ts.isIfStatement(node) && node.expression.getText(ast) === 'selectedOrdinaryDownside'
      && node.thenStatement.getText(ast).includes('valueColor =')) body = node.thenStatement.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!body) throw new Error('Missing actual ordinary calendar color branch');
  const output = ts.transpileModule(`let valueColor = '#D32F2F'; ${body}; return valueColor;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function('selectedOrdinaryDownside', 'dateStr', 'calendarMode', 'ordinaryCalendarBalanceColor', 'selectedTag', 'initialBalancesData', output)(
    selectedOrdinaryDownside, dateStr, calendarMode, ordinaryCalendarBalanceColor,
    { name: '余额' }, { balances: { '余额__startDate': startDate } },
  );
}

describe('普通标签值模式按相邻真实余额，而非零比例个人日收益配色', () => {
  it.each([
    ['2026-11-23', '#222222'], ['2026-11-24', '#4CAF50'],
    ['2026-11-25', '#4CAF50'], ['2026-11-26', '#D32F2F'],
  ])('%s 的实际 JSX 配色为 %s，个人日收益全为0也不影响', (date, color) => {
    expect(balances.points.every(item => item.dailyPnl === 0)).toBe(true);
    expect(ordinaryCalendarBalanceColor(balances, date)).toBe(color);
    expect(actualOrdinaryColor(balances, date)).toBe(color);
  });
  it('日收益模式仍使用本人收益：0灰、正红、负绿，与余额比较隔离', () => {
    for (const [dailyPnl, color] of [[0, '#9E9E9E'], [1, '#D32F2F'], [-1, '#4CAF50']] as const) {
      expect(actualOrdinaryColor(scope([point('2026-11-23', 100, dailyPnl)]), '2026-11-23', 'daily')).toBe(color);
    }
  });
  it('第一条和标签开始日期保持黑色，不把强平启用日期当标签开始日期', () => {
    expect(actualOrdinaryColor(balances, '2026-11-25', 'balance', '2026-11-25')).toBe('#222222');
    expect(actualOrdinaryColor(balances, '2026-11-25', 'balance', '2026-09-11')).toBe('#4CAF50');
  });
  it('比较未四舍五入的余额：万元文本相同仍按实际增减着色', () => {
    const values = scope([point('2026-11-23', 44915.37), point('2026-11-24', 44915.38), point('2026-11-25', 44915.37)]);
    expect(ordinaryCalendarBalanceColor(values, '2026-11-24')).toBe('#D32F2F');
    expect(ordinaryCalendarBalanceColor(values, '2026-11-25')).toBe('#4CAF50');
  });
  it('相同余额灰色；前一条为0是合法余额，不因truthy检查跳过', () => {
    expect(ordinaryCalendarBalanceColor(scope([point('2026-11-23', 0), point('2026-11-24', 0)]), '2026-11-24')).toBe('#9E9E9E');
    expect(ordinaryCalendarBalanceColor(scope([point('2026-11-23', 0), point('2026-11-24', 1)]), '2026-11-24')).toBe('#D32F2F');
  });
  it.each([null, NaN, Infinity, -Infinity])('前一条无效余额%s时置灰，不当成0也不跨过空值', (balance) => {
    const values = scope([point('2026-11-22', 100), point('2026-11-23', balance), point('2026-11-24', 90)]);
    expect(ordinaryCalendarBalanceColor(values, '2026-11-24')).toBe('#9E9E9E');
  });
  it.each([null, NaN, Infinity, -Infinity])('当天无效余额%s时置灰，不制造涨跌', (balance) => {
    expect(ordinaryCalendarBalanceColor(scope([point('2026-11-23', 100), point('2026-11-24', balance)]), '2026-11-24')).toBe('#9E9E9E');
  });
  it('今天没有记录仍保持空值和待更新语义，不取昨日余额假造今天', () => {
    expect(balances.pointByDate.get('2026-11-27')).toBeUndefined();
    expect(ordinaryCalendarBalanceColor(balances, '2026-11-27')).toBe('#9E9E9E');
  });
  it('跨月、周末跳过交易日时比较上一条记录，且不依赖points数组顺序', () => {
    const values = scope([point('2026-11-02', 99), point('2026-10-30', 100)]);
    expect(ordinaryCalendarBalanceColor(values, '2026-11-02')).toBe('#4CAF50');
    expect(ordinaryCalendarBalanceColor(values, '2026-10-30')).toBe('#222222');
  });
  it('可见日期裁剪后只比较可见数据，不暴露成员不可见的历史余额', () => {
    const scopes = buildOrdinaryDownsideScopes(37, [{ id: 7, name: '余额' }], {
      ledgerId: 37, categories: [balances],
    }, (_name, date) => date >= '2026-11-24');
    expect(ordinaryCalendarBalanceColor(scopes.get(7)!, '2026-11-24')).toBe('#222222');
    expect(ordinaryCalendarBalanceColor(scopes.get(7)!, '2026-11-25')).toBe('#4CAF50');
  });
  it('股票市值黑色分支没有更改，不把普通账户配色用在R1股票日历', () => {
    expect(aa).toContain('valueColor = point?.marketValue === null || point?.marketValue === undefined ? "#9E9E9E" : "#222222"');
  });
});
