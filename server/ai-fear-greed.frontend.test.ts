import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiFearGreedResult } from '../shared/ai-fear-greed';
import { AI_STOCK_THEME } from '../client/src/lib/ai-stock-theme';
import StockMiniCandlestick from '../client/src/components/StockMiniCandlestick';

const state = vi.hoisted(() => ({ query: vi.fn(), chartData: [] as any[] }));
vi.mock('../client/src/lib/trpc', () => ({ trpc: { aiDashboardFearGreed: { useQuery: state.query } } }));
vi.mock('recharts', async () => {
  const { createElement } = await import('react');
  return {
    ResponsiveContainer: (props: any) => createElement('div', null, props.children),
    LineChart: (props: any) => { state.chartData = props.data; return createElement('div', null, props.children); },
    Line: (props: any) => createElement('span', { 'data-connect-nulls': String(props.connectNulls) }),
    CartesianGrid: () => null, ReferenceLine: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
  };
});
import AiFearGreedSection, { AiFearGreedSectionView } from '../client/src/components/AiFearGreedSection';

// Actual production components with a hard query stub; no application router, DB, network or scheduler.
const pageSource = readFileSync(new URL('../client/src/pages/LedgerAIDatabase.tsx', import.meta.url), 'utf8');
const pageAst = ts.createSourceFile('LedgerAIDatabase.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const data = (score = 6): AiFearGreedResult => ({
  status: 'provisional', methodVersion: 'pulse-a-share-fg-preview-v1', latestDate: '2026-11-26', score,
  band: 'extreme_fear', previousScore: 3, history: [{ date: '2026-11-25', score: 3 }, { date: '2026-11-26', score }],
  factors: [], source: 'isolated test fixture', notes: [], lookback: 504, sampleDays: 816,
});
function render(props: React.ComponentProps<typeof AiFearGreedSectionView> = { data: data() }) {
  return renderToStaticMarkup(React.createElement(AiFearGreedSectionView, props));
}
beforeEach(() => { state.query.mockReset(); state.chartData = []; });

describe('AI dashboard actual frontend: ordering, daily limits and honest fear/greed display', () => {
  it('places lifecycle, daily rise/fall with limits, fear/greed, then bunching in the actual content function', () => {
    const fn = pageAst.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'LedgerAIDatabaseContent');
    expect(fn).toBeDefined();
    const components: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node)) components.push(node.tagName.getText(pageAst));
      ts.forEachChild(node, visit);
    };
    visit(fn!);
    expect(components.filter(name => ['SurvivalSection', 'RisefallSection', 'AiFearGreedSection', 'BunchingEffectSection'].includes(name)))
      .toEqual(['SurvivalSection', 'RisefallSection', 'AiFearGreedSection', 'BunchingEffectSection']);
    expect(pageSource).toContain('title="A 股全生命周期"');
    const daily = pageAst.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === 'RisefallSection')!.getText(pageAst);
    expect(daily).toContain('今日涨跌分布'); expect(daily).toContain('limit_up'); expect(daily).toContain('limit_down');
  });
  it('uses the original lifecycle deep red/green palette across AI pages without modifying ordinary overview', () => {
    expect(AI_STOCK_THEME.rise).toBe('#B71C1C'); expect(AI_STOCK_THEME.fall).toBe('#1B5E20');
    for (const file of ['StockComparison.tsx', 'StockDetail.tsx', 'StockLifecycle.tsx']) {
      const source = readFileSync(new URL('../client/src/pages/' + file, import.meta.url), 'utf8');
      expect(source).toContain('AI_STOCK_THEME.fall');
    }
    expect(pageSource).toContain('const CHART_UP = RED'); expect(pageSource).toContain('const CHART_DOWN = GREEN');
    const detail = readFileSync(new URL('../client/src/pages/StockDetail.tsx', import.meta.url), 'utf8');
    expect(detail).toContain("latest.signal === 'shrink_up_rise' ? RED");
    expect(detail).toContain("latest.signal === 'shrink_up_fall' ? GREEN_A");
  });
  it('renders actual monitor up/down OHLC candles in the same deep red/green without changing prices', () => {
    const candles = [
      { date: '2026-11-25', open: 10, high: 12, low: 9, close: 11 },
      { date: '2026-11-26', open: 10, high: 11, low: 8, close: 9 },
    ];
    const before = JSON.stringify(candles);
    const html = renderToStaticMarkup(React.createElement(StockMiniCandlestick, { name: 'isolated fixture', candles: candles as any }));
    expect(html).toContain('fill="#B71C1C"'); expect(html).toContain('fill="#1B5E20"');
    expect(JSON.stringify(candles)).toBe(before);
  });
  it.each([0, 6, 27, 100])('renders a real valid score %s including both 0/100 boundaries and a pointer', score => {
    const html = render({ data: data(score) });
    expect(html).toContain(`贪婪恐惧指数 ${score}`); expect(html).toContain('data-testid="fear-greed-pointer"');
    expect(html).toContain('2026-11-26'); expect(html).toContain('贪婪恐惧指数');
  });
  it.each(['insufficient', 'unavailable'] as const)('does not disguise %s as a stale successful score or zero', status => {
    const html = render({ data: { ...data(27), status } });
    expect(html).not.toContain('data-testid="fear-greed-pointer"'); expect(html).toMatch(/data-testid="fear-greed-score">—</);
  });
  it('keeps genuine history observations and null gaps, rejecting malformed dates and invalid scores', () => {
    const html = render({ data: { ...data(), history: [
      { date: '2026-11-25', score: 3 }, { date: '2026-11-24', score: null }, { date: '2026-11-26', score: 6 },
      { date: '2026-02-30', score: 88 }, { date: 'not-a-date', score: 44 }, { date: '2026-11-23', score: 101 },
    ] } });
    expect(state.chartData.map(point => [point.date, point.score])).toEqual([
      ['2026-11-23', null], ['2026-11-24', null], ['2026-11-25', 3], ['2026-11-26', 6],
    ]);
    expect(html).toContain('data-connect-nulls="false"'); expect(html).toContain('缺失值断开');
    expect(html).toContain('aria-pressed="true"'); expect(html).toContain('全部');
  });
  it('hides stale scores and history on query failure and uses the actual read-only query with a five-minute stale time', () => {
    const html = render({ data: data(27), hasError: true });
    expect(html).not.toContain('data-testid="fear-greed-pointer"'); expect(state.chartData).toEqual([]);
    state.query.mockReturnValue({ data: data(), isLoading: false, isError: false });
    const queried = renderToStaticMarkup(React.createElement(AiFearGreedSection));
    expect(queried).toContain('data-testid="fear-greed-pointer"');
    expect(state.query).toHaveBeenCalledWith(undefined, { retry: false, staleTime: 300000, refetchOnWindowFocus: false });
  });
});
