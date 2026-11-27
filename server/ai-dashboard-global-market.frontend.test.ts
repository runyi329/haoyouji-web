import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { AI_STOCK_THEME } from '../client/src/lib/ai-stock-theme';

// Execute actual production functions with inert query/hooks. No router, DB, HTTP, scheduler or app boot.
const source = readFileSync(new URL('../client/src/pages/LedgerAIDatabase.tsx', import.meta.url), 'utf8');
const fearSource = readFileSync(new URL('../client/src/components/AiFearGreedSection.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LedgerAIDatabase.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const markets = ['all', 'SH', 'SZ', 'GEM', 'STAR', 'DELISTED'] as const;
const labels = ['全市场', '沪市', '深市', '创业板', '科创板', '退市'];
const keys = markets.map((key, i) => ({ key, label: labels[i] }));
const panels = ['SurvivalSection', 'RisefallSection', 'BunchingEffectSection', 'UpRateDistSection', 'ValuationSection'];
const endpoints = ['aiDashboardSurvival', 'aiDashboardRisefall', 'aiDashboardBunchingEffect', 'aiDashboardUpRateDist', 'aiDashboardValuation'];
const constants = { BG: AI_STOCK_THEME.background, CARD: AI_STOCK_THEME.card, SURFACE: AI_STOCK_THEME.surface, BORDER: AI_STOCK_THEME.border, TEXT: AI_STOCK_THEME.text, MUTED: AI_STOCK_THEME.muted, DIM: AI_STOCK_THEME.dim, ACCENT: AI_STOCK_THEME.accent, ACCENT_SOFT: AI_STOCK_THEME.accentSoft, ACCENT_GRAD: AI_STOCK_THEME.accentGradient, CARD_SHADOW: AI_STOCK_THEME.shadow, RED: AI_STOCK_THEME.rise, GREEN: AI_STOCK_THEME.fall, CHART_UP: AI_STOCK_THEME.rise, CHART_DOWN: AI_STOCK_THEME.fall, GRAD_UP: AI_STOCK_THEME.riseGradient, GRAD_DOWN: AI_STOCK_THEME.fallGradient, AI_STOCK_THEME, MARKET_KEYS: keys, fmt: (n: number | null) => n == null ? '—' : n.toLocaleString('zh-CN'), pct: (n: number, total: number) => total ? (n / total * 100).toFixed(1) : '0.0', fmtDate: (value: string) => value };
function declaration(name: string) {
  const node = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error('Missing actual production function ' + name);
  return node;
}
function compile(name: string, scope: Record<string, any>) {
  const declarationText = declaration(name).getText(ast).replace(/^export /, '');
  const code = ts.transpileModule(`const actual = (${declarationText});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  return new Function('React', ...Object.keys(scope), `${code}; return actual;`)(React, ...Object.values(scope));
}
const Download = ({ title }: { title: string }) => React.createElement('button', { 'data-stock-export-hide': true, 'aria-label': `下载${title}图片` });
const Header = compile('SectionTitle', { ...constants, StockSectionImageDownload: Download });
const shared = { ...constants, SectionTitle: Header, Skeleton: () => React.createElement('div', null, 'loading'), EmptyState: ({ label }: { label: string }) => React.createElement('p', null, label), EraBarChart: () => null, useCountUp: (target: number) => target, useEffect: () => {}, useState: (initial: any) => [initial, vi.fn()] };
const Unsupported = compile('UnsupportedMarketSection', shared);

function page(market: string) {
  const calls: { name: string; market: string }[] = [];
  const countQuery = vi.fn(() => ({ data: Object.fromEntries(markets.map(key => [key, 123])) }));
  const setMarket = vi.fn();
  const components = Object.fromEntries(panels.map(name => [name, ({ market }: { market: string }) => { calls.push({ name, market }); return React.createElement('div', { 'data-panel-market': market }, name); }]));
  let exportMarket: string | undefined;
  const scope = { ...constants, ...components, useParams: () => ({ id: '37' }), useLocation: () => ['', vi.fn()], useState: () => [market, setMarket], trpc: { aiDashboardMarketCount: { useQuery: countQuery } }, MarketTabs: compile('MarketTabs', constants), UnsupportedMarketSection: Unsupported, StockSectionImageExportProvider: (props: any) => { exportMarket = props.marketLabel; return props.children; }, AIStockNavigation: () => null, AiFearGreedSection: () => React.createElement('div', null, 'whole-market fear greed'), TradingCostSection: () => React.createElement('div', null, 'whole-market trading cost'), MacroSection: () => React.createElement('div', null, 'whole-market macro') };
  const html = renderToStaticMarkup(React.createElement(compile('LedgerAIDatabaseContent', scope)));
  return { html, calls, countQuery, setMarket, exportMarket, scope };
}

describe('AI dashboard single global market filter', () => {
  it.each(markets)('renders exactly one six-market selector and routes %s without stale/whole-market fallback', market => {
    const result = page(market);
    expect(result.html.match(/data-ai-market-filter="true"/g)).toHaveLength(1);
    expect(result.html.match(/aria-pressed="true"/g)).toHaveLength(1);
    for (const label of labels) expect(result.html).toContain(label);
    expect(result.countQuery).toHaveBeenCalledOnce();
    expect(result.exportMarket).toBe(labels[markets.indexOf(market)]);
    expect(result.html).toContain('贪婪恐惧指数、交易成本和宏观数据为全市场指标');
    if (market === 'DELISTED') {
      expect(result.calls).toEqual([]);
      expect(result.html.match(/退市股票暂无该项统计数据/g)).toHaveLength(5);
      expect(result.html.match(/data-stock-export-hide="true"/g)).toHaveLength(5);
    } else expect(result.calls).toEqual(panels.map(name => ({ name, market })));
  });
  it('global button callbacks update the one parent state, and the filter is outside section export boundaries', () => {
    const result = page('all');
    const tree = compile('MarketTabs', constants)({ market: 'all', counts: {}, onChange: result.setMarket });
    const buttons = tree.props.children;
    buttons[1].props.onClick(); expect(result.setMarket).toHaveBeenLastCalledWith('SH');
    buttons[5].props.onClick(); expect(result.setMarket).toHaveBeenLastCalledWith('DELISTED');
    expect(source.match(/const \[market, setMarket\]/g)).toHaveLength(1);
    expect(source.match(/<MarketTabs /g)).toHaveLength(1);
    expect(source).not.toMatch(/MARKET_TABS|MARKET_KEYS_NO_DELISTED/);
    expect(source.indexOf('<MarketTabs ')).toBeLessThan(source.indexOf('<div data-stock-export-section>'));
  });
  it.each(markets.filter(market => market !== 'DELISTED'))('all actual queries receive %s from their props; no local market state/selector remains', market => {
    for (let i = 0; i < panels.length; i++) {
      const query = vi.fn(() => ({ data: undefined, isLoading: true }));
      const trendQuery = vi.fn(() => ({ data: undefined, isLoading: true }));
      const scope = { ...shared, trpc: { [endpoints[i]]: { useQuery: query }, aiDashboardTrend: { useQuery: trendQuery } } };
      const html = renderToStaticMarkup(React.createElement(compile(panels[i], scope), { market }));
      expect(query).toHaveBeenCalledWith({ market });
      if (i === 0) expect(trendQuery).toHaveBeenCalledWith({ granularity: 'day', market });
      expect(html).not.toContain('aria-pressed');
      expect(declaration(panels[i]).getText(ast)).not.toContain('setMarket');
    }
  });
  it('keeps independent time ranges/valuation tabs and explicitly labels whole-market-only exports', () => {
    expect(declaration('SurvivalSection').getText(ast)).toContain('setTrendGranularity');
    expect(declaration('RisefallSection').getText(ast)).toContain('setPeriodIdx');
    expect(declaration('ValuationSection').getText(ast)).toContain('setSubTab');
    expect(declaration('MacroSection').getText(ast)).toContain('marketLabel="全市场"');
    expect(declaration('TradingCostSection').getText(ast)).toContain('marketLabel="全市场"');
    expect(fearSource).toContain('title="贪婪恐惧指数" marketLabel="全市场"');
    expect(fearSource).not.toMatch(/自研|脉动/);
  });
});
