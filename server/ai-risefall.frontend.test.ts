import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AI_STOCK_THEME } from '../client/src/lib/ai-stock-theme';
import type { AiRisefallMarket, AiRisefallPeriod, AiRisefallResult, AiRisefallToday } from '../shared/ai-risefall';

// Compile the actual page declarations, not a reimplementation/snapshot of its JSX.
// Only hooks, query and chart/export boundaries are inert. Never import the page,
// app/router/server index, start a browser, connect a DB, or perform HTTP requests.
const source = readFileSync(new URL('../client/src/pages/LedgerAIDatabase.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LedgerAIDatabase.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionNames = ['pct', 'fmt', 'fmtDate', 'Skeleton', 'EmptyState', 'SectionTitle', 'RisefallSection'];
const constantNames = new Set(['RED', 'CARD', 'SURFACE', 'BORDER', 'TEXT', 'MUTED', 'DIM', 'ACCENT', 'ACCENT_SOFT', 'ACCENT_GRAD', 'GREEN', 'CHART_UP', 'CHART_DOWN', 'GRAD_UP', 'GRAD_DOWN', 'CARD_SHADOW']);
const constants = ast.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && constantNames.has(decl.name.text)));
const declarations = functionNames.map(name => {
  const node = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error(`Missing actual production function: ${name}`);
  return node.getText(ast);
});
if (constants.length !== constantNames.size) throw new Error('Missing production theme declarations');
const code = ts.transpileModule(`${constants.map(node => node.getText(ast)).join('\n')}\n${declarations.join('\n')}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
}).outputText;

// Each chart boundary has a distinct identity, so its actual props and tooltip
// callback can be inspected without Recharts/DOM effects. Its output adds no data.
const chartNames = ['ResponsiveContainer', 'BarChart', 'CartesianGrid', 'XAxis', 'YAxis', 'Tooltip', 'Bar', 'Cell'] as const;
const charts = Object.fromEntries(chartNames.map(name => [name, ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children)])) as Record<typeof chartNames[number], React.FC<any>>;
const Download = ({ title }: { title: string }) => React.createElement('button', {
  type: 'button', 'data-stock-export-hide': true, 'aria-label': `下载${title}图片`,
});
const buildActual = new Function('React', 'AI_STOCK_THEME', 'StockSectionImageDownload', ...chartNames, 'useState', 'trpc', `${code}\nreturn RisefallSection;`);

const markets: AiRisefallMarket[] = ['all', 'SH', 'SZ', 'GEM', 'STAR'];
const bucketLabels = ['<30%', '30~40%', '40~50%', '50~60%', '60~70%', '>70%'];
function period(requestedDays: number): AiRisefallPeriod {
  const counts = requestedDays === 5 ? [0, 1, 1, 1, 1, 1] : requestedDays === 20 ? [2, 3, 4, 5, 3, 3] : [6, 10, 12, 14, 10, 8];
  return {
    label: `近${requestedDays}日`, total: requestedDays, requestedDays,
    windowStart: requestedDays === 5 ? '2026-11-23' : requestedDays === 20 ? '2026-11-02' : '2026-09-01',
    windowEnd: '2026-11-27', distribution: bucketLabels.map((label, i) => ({ label, count: counts[i] })),
  };
}
function fixture(today: Partial<AiRisefallToday> = {}, overrides: Partial<AiRisefallResult> = {}): AiRisefallResult {
  return {
    latestDate: '2026-11-27', status: 'available', source: 'daily',
    today: { total: 100, up: 51, down: 44, flat: 5, limit_up: 3, limit_down: 2,
      max_rise: 9.125, max_fall: -8.375, excluded: 2, limitEvaluated: 100, limitUnknown: 0, ...today },
    periods: [period(5), period(20), period(60)], ...overrides,
  };
}
type QueryState = { data?: AiRisefallResult; isLoading?: boolean; isError?: boolean; isFetching?: boolean };
type Element = React.ReactElement<Record<string, any>>;
function elements(node: React.ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, any>>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement<Record<string, any>>(node) ? text(node.props.children) : '';
}
function metric(tree: React.ReactNode, label: string): Element {
  const pair = elements(tree).find(node => node.type === 'div' && Array.isArray(node.props.children)
    && node.props.children.length === 2 && node.props.children.some((child: React.ReactNode) => text(child) === label));
  if (!pair) throw new Error(`Missing actual metric: ${label}`);
  const value = (pair.props.children as React.ReactNode[]).find(child => text(child) !== label);
  if (!React.isValidElement<Record<string, any>>(value)) throw new Error(`Missing metric value: ${label}`);
  return value;
}
function button(tree: React.ReactNode, label: string): Element {
  const found = elements(tree).find(node => node.type === 'button' && text(node) === label);
  if (!found) throw new Error(`Missing actual button: ${label}`);
  return found;
}
function panel(state: QueryState = { data: fixture() }, market: AiRisefallMarket = 'all', initialPeriod = 0) {
  const refetch = vi.fn();
  const query = vi.fn(() => ({ isLoading: false, isError: false, isFetching: false, ...state, refetch }));
  let selectedPeriod = initialPeriod;
  const setPeriodIdx = vi.fn((next: number) => { selectedPeriod = next; });
  const actual = buildActual(React, AI_STOCK_THEME, Download, ...chartNames.map(name => charts[name]),
    () => [selectedPeriod, setPeriodIdx], { aiDashboardRisefall: { useQuery: query } });
  const render = () => {
    const tree = actual({ market }) as Element;
    return { tree, html: renderToStaticMarkup(tree) };
  };
  return { ...render(), render, query, refetch, setPeriodIdx };
}
function expectNoInventedData(html: string) {
  expect(html).not.toMatch(/非交易日|今日无交易|NaN|Infinity|最新交易日涨跌分布|日线有效样本/);
}

describe('AI risefall actual frontend query, states and export', () => {
  it.each(markets)('passes the original {%s} market unchanged and keeps a single section download', market => {
    const result = panel({ data: fixture() }, market);
    expect(result.query).toHaveBeenCalledOnce();
    expect(result.query).toHaveBeenCalledWith({ market });
    expect(result.html.match(/aria-label="下载涨跌统计图片"/g)).toHaveLength(1);
    expect(result.html.match(/data-stock-export-hide="true"/g)).toHaveLength(1);
    expect(result.html).not.toMatch(/aria-pressed|市场筛选/);
  });
  it('shows NULL closing limit counts as em dashes, never numeric zeros', () => {
    const { tree, html } = panel({ data: fixture({ limit_up: null, limit_down: null, limitEvaluated: 75, limitUnknown: 25 }) });
    for (const label of ['收盘涨停', '收盘跌停']) {
      expect(text(metric(tree, label))).toBe('—');
      expect(metric(tree, label).props.style.color).toBe(AI_STOCK_THEME.dim);
    }
    expect(html).toContain('同日涨跌停价仅核验 75 / 100 只');
    expect(html).toContain('暂不显示完整涨跌停总数');
  });
  it('shows genuine zero closing limit counts in neutral text, not rise/fall colors', () => {
    const { tree } = panel({ data: fixture({ limit_up: 0, limit_down: 0 }) });
    for (const label of ['收盘涨停', '收盘跌停']) {
      expect(text(metric(tree, label))).toBe('0');
      expect(metric(tree, label).props.style.color).toBe(AI_STOCK_THEME.text);
    }
  });
  it.each([
    ['上涨', { up: 0, down: 95, flat: 5, limit_up: 0 }],
    ['下跌', { up: 95, down: 0, flat: 5, limit_down: 0 }],
    ['平盘', { up: 51, down: 49, flat: 0 }],
  ] as const)('shows a genuine zero %s count in neutral text', (label, today) => {
    const { tree } = panel({ data: fixture(today) });
    expect(text(metric(tree, label))).toBe('0');
    expect(metric(tree, label).props.style.color).toBe(AI_STOCK_THEME.text);
  });
  it.each([
    ['missing today', { data: fixture({}, { today: null }) }, /行情|数据/, 'status'],
    ['insufficient samples', { data: fixture({}, { today: null, status: 'insufficient' }) }, /有效行情样本不足/, 'status'],
    ['no data', { data: undefined }, /行情|数据/, 'status'],
    ['network failure', { data: undefined, isError: true }, /行情读取失败.*重试/, 'alert'],
  ] as const)('renders an honest %s state and retry instead of inventing a non-trading day', (_label, state, copy, role) => {
    const result = panel(state);
    expect(result.html).toMatch(copy);
    expect(result.html).toContain(`role="${role}"`);
    expect(text(button(result.tree, '重新读取'))).toBe('重新读取');
    expectNoInventedData(result.html);
  });
  it('distinguishes missing today from no response, insufficient data and network failure', () => {
    const states = [
      panel({ data: fixture({}, { today: null }) }),
      panel({ data: undefined }),
      panel({ data: fixture({}, { today: null, status: 'insufficient' }) }),
      panel({ isError: true }),
    ];
    const copies = states.map(({ tree }) => {
      const status = elements(tree).find(node => node.type === 'div' && ['status', 'alert'].includes(node.props.role));
      if (!status) throw new Error('Missing query state');
      // The actual EmptyState function is expanded by React static render.
      return renderToStaticMarkup((status.props.children as React.ReactNode[])[0]);
    });
    expect(new Set(copies).size).toBe(4);
  });
  it('calls the real returned retry button callback to refetch', () => {
    const result = panel({ isError: true });
    expect(result.refetch).not.toHaveBeenCalled();
    button(result.tree, '重新读取').props.onClick();
    expect(result.refetch).toHaveBeenCalledOnce();
    expect(result.refetch).toHaveBeenCalledWith();
  });
  it('disables retry during a fetch without misclassifying the query state', () => {
    const result = panel({ isError: true, isFetching: true });
    expect(button(result.tree, '重新读取').props.disabled).toBe(true);
    expect(result.html).toContain('行情读取失败，请重试');
    expectNoInventedData(result.html);
  });
  it('shows actual loading skeletons while no usable data exists', () => {
    const { html } = panel({ isLoading: true });
    expect(html.match(/animate-pulse/g)).toHaveLength(2);
    expect(html).not.toContain('重新读取');
    expectNoInventedData(html);
  });
  it('retains valid daily data during background update failure and refetches from its own retry button', () => {
    const result = panel({ data: fixture(), isError: true });
    expect(result.html).toContain('更新失败，保留上次成功数据');
    expect(result.html).toContain('最新交易日 2026-11-27');
    expect(text(metric(result.tree, '上涨'))).toBe('51');
    expect(text(metric(result.tree, '下跌'))).toBe('44');
    button(result.tree, '重试').props.onClick();
    expect(result.refetch).toHaveBeenCalledOnce();
    expect(result.refetch).toHaveBeenCalledWith();
    expect(result.html).not.toContain('行情读取失败，请重试');
  });
  it('keeps usable data visible even while loading/fetching flags are set', () => {
    const result = panel({ data: fixture(), isLoading: true, isFetching: true });
    expect(text(metric(result.tree, '上涨'))).toBe('51');
    expect(result.html).not.toContain('animate-pulse');
  });
  it('disables the background error retry while fetching but preserves prior values', () => {
    const result = panel({ data: fixture(), isError: true, isFetching: true });
    expect(button(result.tree, '重试').props.disabled).toBe(true);
    expect(text(metric(result.tree, '收盘涨停'))).toBe('3');
  });
});

describe('AI risefall refuses invalid or contradictory actual samples', () => {
  it.each([
    ['zero total', { total: 0, up: 0, down: 0, flat: 0 }],
    ['negative total', { total: -100 }],
    ['negative up', { up: -1 }],
    ['negative down', { down: -1 }],
    ['negative flat', { flat: -1 }],
    ['fractional total', { total: 100.5 }],
    ['fractional up', { up: 51.5 }],
    ['fractional down', { down: 44.5 }],
    ['fractional flat', { flat: 5.5 }],
    ['NaN up', { up: NaN }],
    ['infinite down', { down: Infinity }],
    ['unsafe total', { total: Number.MAX_SAFE_INTEGER + 1 }],
    ['sum below total', { flat: 4 }],
    ['sum above total', { flat: 6 }],
    ['missing up', { up: undefined }],
    ['missing down', { down: undefined }],
    ['missing flat', { flat: undefined }],
  ] as const)('does not display fabricated valid metrics for %s', (_label, today) => {
    const result = panel({ data: fixture(today) });
    expectNoInventedData(result.html);
    expect(result.html).toMatch(/暂|不足|无有效|无法/);
    expect(result.html).not.toMatch(/width:[^;\"]*(?:NaN|Infinity)/);
  });
  it('does not accept a missing actual trading date as valid current data', () => {
    expectNoInventedData(panel({ data: fixture({}, { latestDate: null }) }).html);
  });
  it.each([
    ['negative', -1, -1], ['fractional', 0.5, 0.5],
    ['beyond corresponding population', 52, 45], ['non-finite', NaN, Infinity],
  ] as const)('withholds %s closing limit counts instead of displaying a fake total', (_label, limit_up, limit_down) => {
    const result = panel({ data: fixture({ limit_up, limit_down }) });
    expect(text(metric(result.tree, '收盘涨停'))).toBe('—');
    expect(text(metric(result.tree, '收盘跌停'))).toBe('—');
    expect(result.html).toContain('暂不显示完整涨跌停总数');
    expect(result.html).not.toMatch(/NaN|Infinity/);
  });
  it('does not display a partially evaluated limit subset as a complete market total', () => {
    const result = panel({ data: fixture({ limit_up: 3, limit_down: 2, limitEvaluated: 75, limitUnknown: 25 }, { status: 'partial' }) });
    expect(text(metric(result.tree, '收盘涨停'))).toBe('—');
    expect(text(metric(result.tree, '收盘跌停'))).toBe('—');
    expect(result.html).toContain('仅核验 75 / 100 只');
    expect(result.html).toContain('暂不显示完整涨跌停总数');
    expect(text(metric(result.tree, '上涨'))).toBe('51');
  });
  it('keeps valid price samples and excludes missing prices rather than counting them as flat', () => {
    const result = panel({ data: fixture({ limit_up: null, limit_down: null, limitEvaluated: 75, limitUnknown: 25 }, { status: 'partial' }) });
    expect(text(metric(result.tree, '平盘'))).toBe('5');
    expect(result.html).toContain('日线有效样本 100 只');
    expect(result.html).toContain('2 只缺少有效价格，未计入');
    expect(result.html).toContain('停牌或缺行情不计作平盘');
    expect(result.html).not.toContain('日线有效样本 102 只');
  });
});

describe('AI risefall extrema, actual dates and trading-day distribution', () => {
  it('formats positive rise and negative fall once, with no plus-minus or NaN', () => {
    const result = panel();
    expect(text(metric(result.tree, '最大涨幅'))).toBe('+9.13%');
    expect(text(metric(result.tree, '最大跌幅'))).toBe('-8.38%');
    expect(result.html).not.toMatch(/\+-|--\d|NaN|Infinity/);
  });
  it('hides NULL extrema instead of inventing zero percentages', () => {
    const result = panel({ data: fixture({ max_rise: null, max_fall: null }) });
    expect(text(metric(result.tree, '最大涨幅'))).toBe('—');
    expect(text(metric(result.tree, '最大跌幅'))).toBe('—');
  });
  it.each([
    ['wrong signs', -8, 9], ['zero', 0, 0], ['NaN', NaN, NaN], ['Infinity', Infinity, -Infinity],
  ] as const)('hides %s extrema instead of malformed percentage values', (_label, max_rise, max_fall) => {
    const result = panel({ data: fixture({ max_rise, max_fall }) });
    expect(text(metric(result.tree, '最大涨幅'))).toBe('—');
    expect(text(metric(result.tree, '最大跌幅'))).toBe('—');
    expect(result.html).not.toMatch(/\+-|NaN|Infinity/);
  });
  it.each(['2025-12-31', '2024-01-02', '2026-01-05'])('retains the real old/cross-year latest date %s instead of substituting today', latestDate => {
    const result = panel({ data: fixture({}, { latestDate }) });
    expect(result.html).toContain(`数据截至 ${latestDate}`);
    expect(result.html).toContain(`最新交易日 ${latestDate}`);
    expect(result.html).not.toContain('非交易日');
  });
  it('retains the full year across a distribution window crossing New Year', () => {
    const data = fixture({}, { latestDate: '2026-01-05' });
    data.periods[0].windowStart = '2025-12-29';
    data.periods[0].windowEnd = '2026-01-05';
    expect(panel({ data }).html).toContain('2025-12-29 至 2026-01-05');
  });
  it.each([0, 1, 2])('keeps all six interval buckets for the actual near-5/20/60 selection %s', index => {
    const data = fixture();
    const result = panel({ data }, 'all', index);
    const treeNodes = elements(result.tree);
    const actualChart = treeNodes.find(node => node.type === charts.BarChart);
    expect(actualChart?.props.data).toBe(data.periods[index].distribution);
    expect(actualChart?.props.data.map((item: { label: string }) => item.label)).toEqual(bucketLabels);
    expect(treeNodes.filter(node => node.type === charts.Cell)).toHaveLength(6);
    expect(treeNodes.filter(node => node.type === 'button').map(node => text(node))).toEqual(['近5日', '近20日', '近60日']);
    expect(result.html).toContain('横轴：每日上涨股票占比 · 纵轴：交易日数');
  });
  it('operates the actual returned period buttons and changes the actual chart data', () => {
    const data = fixture();
    const result = panel({ data });
    for (const [index, label] of ['近5日', '近20日', '近60日'].entries()) {
      button(result.tree, label).props.onClick();
      expect(result.setPeriodIdx).toHaveBeenLastCalledWith(index);
      const rerendered = result.render();
      const actualChart = elements(rerendered.tree).find(node => node.type === charts.BarChart);
      expect(actualChart?.props.data).toBe(data.periods[index].distribution);
      expect(button(rerendered.tree, label).props.style.background).toBe(AI_STOCK_THEME.accent);
    }
  });
  it.each([0, 1, 2])('uses the actual tooltip callback to label trading days, not stock counts, in selection %s', index => {
    const result = panel({ data: fixture() }, 'all', index);
    const tooltip = elements(result.tree).find(node => node.type === charts.Tooltip);
    expect(tooltip?.props.formatter(3)).toEqual(['3', '交易日数']);
    expect(tooltip?.props.formatter(0)).toEqual(['0', '交易日数']);
  });
  it.each([5, 20, 60])('explains an actual short window instead of implying %s complete trading days', requestedDays => {
    const data = fixture();
    const index = data.periods.findIndex(item => item.requestedDays === requestedDays);
    data.periods[index] = { ...data.periods[index], total: 3,
      distribution: bucketLabels.map((label, i) => ({ label, count: i === 3 ? 3 : 0 })) };
    const result = panel({ data }, 'all', index);
    expect(result.html).toContain(`实际仅 3 个有效交易日，不足 ${requestedDays} 日。`);
    expect(elements(result.tree).find(node => node.type === charts.BarChart)?.props.data).toHaveLength(6);
  });
  it('does not claim a short window when all requested trading days are present', () => {
    expect(panel().html).not.toContain('实际仅');
  });
  it('does not invent period charts when no period distribution is returned', () => {
    const result = panel({ data: fixture({}, { periods: [] }) });
    expect(elements(result.tree).filter(node => node.type === charts.BarChart)).toHaveLength(0);
    expect(result.html).not.toContain('区间涨跌分布');
    expect(text(metric(result.tree, '上涨'))).toBe('51');
  });
});
