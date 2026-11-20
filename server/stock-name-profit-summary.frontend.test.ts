import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { parsePortfolioInstrument, portfolioDisplaySymbol, portfolioQuantityUnit } from '../shared/portfolio-instruments';

type Scope = 'holding' | 'closed' | 'all';
type Dimension = 'value' | 'pnl' | 'ratio';
type Row = {
  stockName: string;
  symbol: string;
  lotId: number;
  state: 'holding' | 'closed';
  openingValue: number | null;
  pnl: number | null;
  quantity?: number | null;
  [extra: string]: unknown;
};

// Execute the entire actual TSX module, including its real grouping/formatting helpers.
// Only hooks and non-accounting leaf components are inert. No app/backend import, HTTP or DB.
// The project has no jsdom; real React element trees plus SSR and actual handlers suffice here.
const source = readFileSync(new URL('../client/src/components/StockNameProfitSummary.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'StockNameProfitSummary.tsx',
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
const Download = (_props: any) => null;
const Icon = (_props: any) => null;
// Keep the actual menu element/handler props inspectable without executing Radix internals.
// Closed, portaled menu content is inert in SSR, just as it is before opening in the browser.
const DropdownMenu = ({ children }: any) => React.createElement(React.Fragment, null, children);
const DropdownMenuTrigger = ({ children }: any) => children;
const DropdownMenuContent = (_props: any) => null;
const DropdownMenuRadioGroup = (_props: any) => null;
const DropdownMenuRadioItem = (_props: any) => null;
const dropdownMenu = { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem };
const scopeLabels: Record<Scope, string> = { holding: '持仓中', closed: '已平仓', all: '全部' };
const dimensionLabels: Record<Dimension, string> = { value: '市值', pnl: '盈亏', ratio: '盈亏比' };
const totalLabels: Record<Dimension, string> = { value: '合计开仓市值', pnl: '合计盈亏', ratio: '整体盈亏比' };
const barLabels: Record<Dimension, string> = { value: '合计开仓市值', pnl: '总盈亏', ratio: '盈亏比' };

function children(tree: any): any[] {
  const value = tree?.props?.children;
  return (Array.isArray(value) ? value.flat(Infinity) : [value]).filter(child => child != null && typeof child !== 'boolean');
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...children(tree).flatMap(nodes)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return React.isValidElement(tree) ? children(tree).map(text).join('') : String(tree);
}
function find(tree: any, predicate: (node: any) => boolean, description: string): any {
  const node = nodes(tree).find(predicate);
  if (!node) throw new Error(`Actual rendered element missing: ${description}`);
  return node;
}
function exportTree(tree: any): any {
  if (Array.isArray(tree)) return tree.map(exportTree).filter(child => child != null);
  if (!React.isValidElement(tree)) return tree;
  const node = tree as any;
  // The actual exporter removes every node bearing this attribute, including its children.
  if (Object.prototype.hasOwnProperty.call(node.props, 'data-summary-export-hide')) return null;
  return React.cloneElement(node, {}, ...children(node).map(exportTree));
}
function panel(tree: any) {
  return find(tree, node => node.props.role === 'tabpanel', 'stock metric panel');
}
function metricRows(tree: any): Record<string, string> {
  return Object.fromEntries(children(panel(tree)).filter(row => React.isValidElement(row) && row.key != null).map(row => {
    const name = find(row, node => node.props['data-summary-stock-name'] !== undefined, 'stock name');
    const metric = find(row, node => node.props['data-summary-stock-metric'] !== undefined, 'stock metric');
    return [text(name), text(metric)];
  }));
}
function quantityRows(tree: any): Record<string, string> {
  return Object.fromEntries(children(panel(tree)).filter(row => React.isValidElement(row) && row.key != null).map(row => [
    text(find(row, node => node.props['data-summary-stock-name'] !== undefined, 'stock name')),
    text(find(row, node => node.props['data-summary-stock-quantity'] !== undefined, 'stock quantity')),
  ]));
}
function topPnl(tree: any) {
  const summary = find(tree, node => node.type === 'summary', 'details title');
  return text(find(summary, node => node.props['aria-live'] === 'polite', 'title total P&L'));
}
function pie(tree: any) {
  return find(tree, node => node.props.role === 'img' && node.props['aria-label']?.startsWith('各股票盈亏金额构成：'), 'P&L pie');
}
function totalMetric(tree: any, scope: Scope, dimension: Dimension) {
  const label = `${totalLabels[dimension]}（${scopeLabels[scope]}）`;
  const row = find(tree, node => node.type === 'div' && children(node).some(child => child.type === 'span' && text(child) === label), label);
  return text(children(row).find(child => child.type === 'span' && text(child) !== label));
}
function explanation(tree: any) {
  const body = children(tree).find(child => child.type === 'div');
  return text(children(body).at(-1));
}
function expectCount(tree: any, scope: Scope, count: number) {
  expect(text(tree)).toContain(`${scopeLabels[scope]} · ${count} 只股票 · 同名合并 · 人民币`);
  expect(text(pie(tree))).toBe(`盈亏构成${count}只`);
}
function assertPie(tree: any, shares: Record<string, string>) {
  const chart = pie(tree);
  const prefix = '各股票盈亏金额构成：';
  const composition = chart.props['aria-label'].slice(prefix.length).split('。')[0];
  expect(composition.split('，').filter(Boolean).sort()).toEqual(Object.entries(shares).map(([name, share]) => `${name} ${share}`).sort());
  const legendNames = nodes(tree).filter(node => node.type === 'span' && node.props.title).map(node => node.props.title);
  expect(legendNames.sort()).toEqual(Object.keys(shares).sort());
  const segments = [...chart.props.style.background.matchAll(/#[0-9a-f]{6} ([\d.]+)% ([\d.]+)%/gi)];
  const knownNonzero = Object.values(shares).filter(share => share !== '—' && Number.parseFloat(share.replace('−', '-')) !== 0).length;
  expect(segments).toHaveLength(knownNonzero);
  if (segments.length) {
    expect(Number(segments[0][1])).toBe(0);
    expect(Number(segments.at(-1)![2])).toBeCloseTo(100);
    segments.forEach((segment, index) => {
      expect(Number(segment[2])).toBeGreaterThan(Number(segment[1]));
      if (index) expect(Number(segment[1])).toBeCloseTo(Number(segments[index - 1][2]));
    });
  } else {
    expect(chart.props.style.background).toBe('#EEE9E5');
  }
}
function harness(input: Row[] = fixture()) {
  // Frozen test-only fixtures catch accidental mutation without mocking a production page.
  const rows = Object.freeze(input.map(row => Object.freeze({ ...row })));
  const state: any[] = [], refs: any[] = [];
  let cursor = 0, refCursor = 0;
  const react = {
    ...React,
    useState: (initial: any) => {
      const slot = cursor++;
      if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
      return [state[slot], (next: any) => { state[slot] = typeof next === 'function' ? next(state[slot]) : next; }];
    },
    useRef: (initial: any) => {
      const slot = refCursor++;
      return refs[slot] ??= { current: initial };
    },
  };
  const module = { exports: {} as any };
  const context = vm.createContext({
    React: react, module, exports: module.exports,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === 'lucide-react') return { ChevronDown: Icon };
      if (name === './StockSummaryImageDownload') return { StockSummaryImageDownload: Download };
      if (name === './ui/dropdown-menu') return dropdownMenu;
      if (name === '@shared/portfolio-instruments') return { parsePortfolioInstrument, portfolioDisplaySymbol, portfolioQuantityUnit };
      throw new Error(`Unexpected dependency in offline frontend test: ${name}`);
    },
  });
  new vm.Script(compiled, { filename: 'actual-StockNameProfitSummary.js' }).runInContext(context, { timeout: 1000 });
  const component = module.exports.default;
  const render = () => {
    cursor = refCursor = 0;
    return component({ rows });
  };
  const radioGroup = () => find(render(), node => node.type === DropdownMenuRadioGroup, 'scope radio group');
  const trigger = () => find(render(), node => node.type === 'button' && node.props['aria-label'] === '股票汇总统计范围', 'title menu button');
  const menuContent = () => find(render(), node => node.type === DropdownMenuContent, 'scope menu content');
  const choose = (scope: Scope | string) => { radioGroup().props.onValueChange(scope); return render(); };
  const tab = (dimension: Dimension) => {
    find(render(), node => node.props.role === 'tab' && text(node) === dimensionLabels[dimension], `${dimension} tab`).props.onClick();
    return render();
  };
  return { render, radioGroup, trigger, menuContent, choose, tab, rows };
}

// Apple lot 11 is partially sold: remaining and sold portions deliberately share lotId.
// The second holding lot uses a trimmed name. Extra live-price fields must not change
// the existing openingValue (buy price × the quantity belonging to that portion) basis.
function fixture(): Row[] {
  return [
    { stockName: ' 苹果 ', symbol: 'AAPL', lotId: 11, state: 'holding', openingValue: 600, pnl: 60, unitCost: 100, quantity: 6, marketPrice: 900, marketValue: 5400 },
    { stockName: '苹果', symbol: 'AAPL', lotId: 12, state: 'holding', openingValue: 400, pnl: 40, unitCost: 100, quantity: 4, marketPrice: 900, marketValue: 3600 },
    { stockName: '苹果', symbol: 'AAPL', lotId: 11, state: 'closed', openingValue: 500, pnl: -60, quantity: 5, soldQuantity: 5, sellValue: 440 },
    { stockName: '贵州茅台', symbol: '600519.SH', lotId: 13, state: 'holding', openingValue: 2000, pnl: -50, quantity: 2 },
    { stockName: '微软', symbol: 'MSFT', lotId: 14, state: 'closed', openingValue: 800, pnl: 160 },
  ];
}
const expected: Record<Scope, {
  pnl: string;
  totals: Record<Dimension, string>;
  rows: Record<Dimension, Record<string, string>>;
  shares: Record<string, string>;
}> = {
  holding: {
    pnl: '+¥50.00', totals: { value: '¥3,000.00', pnl: '+¥50.00', ratio: '+1.67%' },
    rows: {
      value: { AAPL: '¥1,000.00', 贵州茅台: '¥2,000.00' },
      pnl: { 苹果: '+¥100.00', 贵州茅台: '−¥50.00' },
      ratio: { 苹果: '+10.00%', 贵州茅台: '-2.50%' },
    }, shares: { 苹果: '+66.7%', 贵州茅台: '−33.3%' },
  },
  closed: {
    pnl: '+¥100.00', totals: { value: '¥1,300.00', pnl: '+¥100.00', ratio: '+7.69%' },
    rows: {
      value: { AAPL: '¥500.00', MSFT: '¥800.00' },
      pnl: { 苹果: '−¥60.00', 微软: '+¥160.00' },
      ratio: { 苹果: '-12.00%', 微软: '+20.00%' },
    }, shares: { 苹果: '−27.3%', 微软: '+72.7%' },
  },
  all: {
    pnl: '+¥150.00', totals: { value: '¥4,300.00', pnl: '+¥150.00', ratio: '+3.49%' },
    rows: {
      value: { AAPL: '¥1,500.00', 贵州茅台: '¥2,000.00', MSFT: '¥800.00' },
      pnl: { 苹果: '+¥40.00', 贵州茅台: '−¥50.00', 微软: '+¥160.00' },
      ratio: { 苹果: '+2.67%', 贵州茅台: '-2.50%', 微软: '+20.00%' },
    }, shares: { 苹果: '+16.0%', 贵州茅台: '−20.0%', 微软: '+64.0%' },
  },
};

const scopes: Scope[] = ['holding', 'closed', 'all'];
const dimensions: Dimension[] = ['value', 'pnl', 'ratio'];

describe('股票名称盈亏汇总：真实 TSX 离线交互', () => {
  it('股票盈亏汇总标题本身是唯一菜单入口，默认持仓中并提供精确三选项；默认不计已平仓且仍按开仓金额展示市值', () => {
    const h = harness();
    const tree = h.render(), group = h.radioGroup(), button = h.trigger();
    expect(group.props.value).toBe('holding');
    expect(nodes(group).filter(node => node.type === DropdownMenuRadioItem).map(node => [node.props.value, text(node)])).toEqual([
      ['holding', '持仓中'], ['closed', '已平仓'], ['all', '全部'],
    ]);
    const title = find(tree, node => node.type === 'summary', 'title');
    const menu = find(title, node => node.type === DropdownMenu, 'title dropdown root');
    const trigger = find(menu, node => node.type === DropdownMenuTrigger, 'title dropdown trigger');
    expect(menu.props.modal).toBe(false);
    expect(trigger.props.asChild).toBe(true);
    expect(children(trigger)).toHaveLength(1);
    expect(children(trigger)[0].type).toBe('button');
    expect(children(trigger)[0].props['aria-label']).toBe('股票汇总统计范围');
    expect(button.props.type).toBe('button');
    expect(text(button)).toContain('股票盈亏汇总');
    expect(text(button)).toContain('持仓中');
    expect(nodes(button).some(node => node.type === Icon)).toBe(true);
    expect(nodes(tree).filter(node => node.props['aria-label'] === '股票汇总统计范围')).toHaveLength(1);
    expect(nodes(tree).filter(node => node.type === DropdownMenuTrigger)).toHaveLength(1);
    expect(nodes(tree).filter(node => node.type === 'select' || node.type === 'option' || node.props.role === 'combobox')).toHaveLength(0);
    const summaryRef = find(tree, node => node.type === 'details', 'summary details ref').props.ref;
    for (const item of nodes(group).filter(node => node.type === DropdownMenuRadioItem)) {
      summaryRef.current = null;
      expect(() => item.props.onSelect()).not.toThrow();
      summaryRef.current = { open: false };
      item.props.onSelect();
      expect(summaryRef.current.open).toBe(true);
      // Selecting the already-current default item must also expand, not require a value change.
      expect(h.radioGroup().props.value).toBe('holding');
    }
    summaryRef.current = null;
    expect(topPnl(tree)).toBe('+¥50.00');
    expect(metricRows(tree)).toEqual(expected.holding.rows.value);
    expectCount(tree, 'holding', 2);
    assertPie(tree, expected.holding.shares);
    expect(nodes(tree).filter(node => node.props.role === 'tab' && node.props['aria-selected']).map(text)).toEqual(['市值']);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('<button type="button" aria-label="股票汇总统计范围"');
    expect(html).not.toMatch(/<select\b|<option\b|role="combobox"/);
    expect(html).not.toContain('微软');
    expect(totalMetric(tree, 'holding', 'value')).toBe('¥3,000.00');
    expect(explanation(tree)).toContain('不是实时市值');
  });

  it.each(scopes)('%s：顶部、数量、饼图及三维度的总额/行金额/加权盈亏比使用同一范围，切维度不改scope', scope => {
    const h = harness();
    h.choose(scope);
    const initialChart = pie(h.render()).props;
    for (const dimension of [...dimensions, 'value'] as Dimension[]) {
      const tree = h.tab(dimension);
      expect(h.radioGroup().props.value).toBe(scope);
      expect(text(h.trigger())).toContain(scopeLabels[scope]);
      expect(topPnl(tree)).toBe(expected[scope].pnl);
      expect(totalMetric(tree, scope, dimension)).toBe(expected[scope].totals[dimension]);
      expect(metricRows(tree)).toEqual(expected[scope].rows[dimension]);
      expectCount(tree, scope, Object.keys(expected[scope].shares).length);
      assertPie(tree, expected[scope].shares);
      expect(pie(tree).props['aria-label']).toBe(initialChart['aria-label']);
      expect(pie(tree).props.style.background).toBe(initialChart.style.background);
      expect(panel(tree).props['aria-labelledby']).toBe(`stock-summary-${dimension}-tab`);
      for (const [name, value] of Object.entries(expected[scope].rows[dimension])) {
        expect(nodes(panel(tree)).filter(node => node.props.role === 'img').map(node => node.props['aria-label'])).toContain(`${name}${barLabels[dimension]} ${value}`);
      }
    }
    // Independent literal expectations above distinguish weighted totals from average ratios:
    // holding: 50/3000; closed: 100/1300; all: 150/4300, not the mean of per-stock ratios.
  });

  it('holding → closed → all → holding能交互返回；部分卖出同lotId份额恰好计一次，同名多笔只显示一股', () => {
    const h = harness();
    const untouched = JSON.stringify(h.rows);
    h.tab('pnl');
    for (const scope of ['holding', 'closed', 'all', 'holding'] as Scope[]) {
      const tree = h.choose(scope);
      expect(h.radioGroup().props.value).toBe(scope);
      expect(text(h.trigger())).toContain(scopeLabels[scope]);
      expect(topPnl(tree)).toBe(expected[scope].pnl);
      expect(metricRows(tree)).toEqual(expected[scope].rows.pnl);
      expect(totalMetric(tree, scope, 'pnl')).toBe(expected[scope].pnl);
      expectCount(tree, scope, scope === 'all' ? 3 : 2);
      expect(Object.keys(metricRows(tree)).filter(name => name === '苹果')).toHaveLength(1);
      expect(nodes(tree).filter(node => node.props.role === 'tab' && node.props['aria-selected']).map(text)).toEqual(['盈亏']);
    }
    h.choose('all');
    expect(metricRows(h.tab('value')).AAPL).toBe('¥1,500.00');
    expect(metricRows(h.tab('ratio')).苹果).toBe('+2.67%');
    expect(JSON.stringify(h.rows)).toBe(untouched);
  });

  it.each(scopes)('%s：市值/盈亏/盈亏比说明随范围一致，导出保留范围但隐藏选择控件', scope => {
    const h = harness();
    h.choose(scope);
    const valueText = explanation(h.tab('value'));
    expect(valueText).toContain('买入价');
    if (scope === 'holding') {
      expect(valueText).toContain('当前剩余股数');
      expect(valueText).toContain('不含已平仓部分');
      expect(valueText).toContain('不是实时市值');
    } else if (scope === 'closed') {
      expect(valueText).toContain('已卖出股数');
      expect(valueText).toContain('不是卖出金额');
    } else {
      expect(valueText).toContain('包含持仓中及已平仓部分');
      expect(valueText).toContain('不是实时市值');
    }
    const pnlText = explanation(h.tab('pnl'));
    if (scope === 'holding') expect(pnlText).toContain('当前持仓浮盈，不含已平仓净盈亏');
    if (scope === 'closed') expect(pnlText).toContain('已平仓净盈亏，已扣双边手续费');
    if (scope === 'all') expect(pnlText).toContain('持仓浮盈 + 已平仓净盈亏');
    const tree = h.tab('ratio');
    expect(explanation(tree)).toContain(`当前统计${scopeLabels[scope]}`);
    expect(explanation(tree)).toContain('整体按合计金额计算，不直接平均各股百分比');
    expect(find(tree, node => node.type === Download, 'image download').props.title).toBe(`股票盈亏汇总-${scopeLabels[scope]}`);
    expect(h.menuContent().props['data-summary-export-hide']).toBe('true');
    const exported = exportTree(tree);
    const exportedTitle = text(find(exported, node => node.type === 'summary', 'exported title'));
    expect(exportedTitle).toContain('股票盈亏汇总');
    expect(exportedTitle).toContain(scopeLabels[scope]);
    expect(text(exported)).toContain(`${scopeLabels[scope]} · ${scope === 'all' ? 3 : 2} 只股票 · 同名合并 · 人民币`);
    expect(nodes(exported).some(node => node.type === DropdownMenuContent || node.type === DropdownMenuRadioGroup || node.type === DropdownMenuRadioItem)).toBe(false);
    expectCount(tree, scope, scope === 'all' ? 3 : 2);
  });

  it('标题按钮和菜单click/键盘只停止冒泡，不preventDefault阻断菜单打开选择；非法下拉值不能改变现有范围', () => {
    const h = harness();
    h.choose('closed');
    h.tab('ratio');
    for (const element of [h.trigger(), h.menuContent()]) {
      for (const [handler, key] of [['onClick', undefined], ['onKeyDown', 'ArrowDown'], ['onKeyDown', 'Enter'], ['onKeyDown', ' ']]) {
        const event = { key, stopPropagation: vi.fn(), preventDefault: vi.fn() };
        element.props[handler!](event);
        expect(event.stopPropagation).toHaveBeenCalledOnce();
        expect(event.preventDefault).not.toHaveBeenCalled();
      }
    }
    for (const invalid of ['', 'invalid', 'Holding']) {
      const tree = h.choose(invalid);
      expect(h.radioGroup().props.value).toBe('closed');
      expect(text(h.trigger())).toContain('已平仓');
      expect(topPnl(tree)).toBe('+¥100.00');
      expect(metricRows(tree)).toEqual(expected.closed.rows.ratio);
    }
  });

  it('只有已平仓数据时默认持仓为空，数量/图/总金额不偷用历史；切换及返回空态正常', () => {
    const h = harness([{ stockName: '历史专属', symbol: 'UNVERIFIED:CLOSED', lotId: 21, state: 'closed', openingValue: 700, pnl: 77 }]);
    const empty = h.render();
    expect(text(panel(empty))).toBe('暂无持仓中股票');
    expect(metricRows(empty)).toEqual({});
    expectCount(empty, 'holding', 0);
    expect(topPnl(empty)).toBe('+¥0.00');
    expect(totalMetric(empty, 'holding', 'value')).toBe('¥0.00');
    assertPie(empty, {});
    expect(text(empty)).not.toContain('历史专属');
    for (const scope of ['closed', 'all'] as Scope[]) {
      const tree = h.choose(scope);
      expect(metricRows(tree)).toEqual({ 历史专属: '¥700.00' });
      expectCount(tree, scope, 1);
      expect(topPnl(tree)).toBe('+¥77.00');
      assertPie(tree, { 历史专属: '+100.0%' });
    }
    const returned = h.choose('holding');
    expect(text(panel(returned))).toBe('暂无持仓中股票');
    assertPie(returned, {});
  });

  it.each(scopes)('完全无记录的%s范围：所有维度保留对应空态，数量0、图为空、盈亏比未知而不是NaN', scope => {
    const h = harness([]);
    h.choose(scope);
    for (const dimension of dimensions) {
      const tree = h.tab(dimension);
      expect(text(panel(tree))).toBe(scope === 'all' ? '暂无股票记录' : `暂无${scopeLabels[scope]}股票`);
      expect(metricRows(tree)).toEqual({});
      expectCount(tree, scope, 0);
      expect(topPnl(tree)).toBe('+¥0.00');
      expect(totalMetric(tree, scope, dimension)).toBe(dimension === 'ratio' ? '—' : dimension === 'pnl' ? '+¥0.00' : '¥0.00');
      assertPie(tree, {});
      expect(renderToStaticMarkup(tree)).not.toMatch(/NaN|Infinity/);
    }
  });

  it.each(['holding', 'closed'] as const)('%s缺价null只污染自身：同名/同lotId未知部分不污染另一范围，all未知且返回已知恢复', unknownScope => {
    const knownScope = unknownScope === 'holding' ? 'closed' : 'holding';
    const h = harness([
      { stockName: '苹果', symbol: 'AAPL', lotId: 31, state: knownScope, openingValue: 1000, pnl: 100 },
      { stockName: '苹果', symbol: 'AAPL', lotId: 31, state: unknownScope, openingValue: null, pnl: null },
      { stockName: '缺价证券', symbol: 'UNVERIFIED:UNKNOWN', lotId: 32, state: unknownScope, openingValue: null, pnl: null },
    ]);
    const assertKnown = () => {
      h.choose(knownScope);
      for (const dimension of dimensions) {
        const tree = h.tab(dimension);
        expect(topPnl(tree)).toBe('+¥100.00');
        const value = dimension === 'value' ? '¥1,000.00' : dimension === 'pnl' ? '+¥100.00' : '+10.00%';
        expect(totalMetric(tree, knownScope, dimension)).toBe(value);
        expect(metricRows(tree)).toEqual({ [dimension === 'value' ? 'AAPL' : '苹果']: value });
        expectCount(tree, knownScope, 1);
        assertPie(tree, { 苹果: '+100.0%' });
        expect(text(tree)).not.toContain('缺价证券');
      }
    };
    assertKnown();
    for (const scope of [unknownScope, 'all'] as Scope[]) {
      h.choose(scope);
      for (const dimension of dimensions) {
        const tree = h.tab(dimension);
        expect(topPnl(tree)).toBe('暂未估值');
        expect(totalMetric(tree, scope, dimension)).toBe(dimension === 'ratio' ? '—' : '暂未估值');
        expect(metricRows(tree)).toEqual({ [dimension === 'value' ? 'AAPL' : '苹果']: dimension === 'ratio' ? '—' : '暂未估值', 缺价证券: dimension === 'ratio' ? '—' : '暂未估值' });
        expectCount(tree, scope, 2);
        assertPie(tree, { 苹果: '—', 缺价证券: '—' });
        expect(text(tree)).not.toMatch(/¥0\.00|NaN|Infinity/);
        const bars = nodes(panel(tree)).filter(node => node.props.role === 'img');
        expect(bars.map(bar => children(bar)[0].props.style.width)).toEqual(['0%', '0%']);
      }
    }
    assertKnown();
  });

  it.each([
    { name: '开仓金额未知但盈亏已知', openingValue: null, pnl: 100, value: '暂未估值', profit: '+¥100.00', shares: '+100.0%' },
    { name: '盈亏未知但开仓金额已知', openingValue: 1000, pnl: null, value: '¥1,000.00', profit: '暂未估值', shares: '—' },
  ])('$name：未知金额不伪装0，已知维度独立可用，比例不冒充可计算', example => {
    const h = harness([{ stockName: '独立维度', symbol: 'UNVERIFIED:ONE', lotId: 41, state: 'holding', openingValue: example.openingValue, pnl: example.pnl }]);
    const valueTree = h.render();
    expect(topPnl(valueTree)).toBe(example.profit);
    expect(metricRows(valueTree)).toEqual({ 独立维度: example.value });
    expect(totalMetric(valueTree, 'holding', 'value')).toBe(example.value);
    assertPie(valueTree, { 独立维度: example.shares });
    expect(metricRows(h.tab('pnl'))).toEqual({ 独立维度: example.profit });
    const ratioTree = h.tab('ratio');
    expect(metricRows(ratioTree)).toEqual({ 独立维度: '—' });
    expect(totalMetric(ratioTree, 'holding', 'ratio')).toBe('—');
    expectCount(ratioTree, 'holding', 1);
  });

  it('已知零与未知null不同：零盈亏保留股票数但无扇区，零开仓金额盈亏比保持—', () => {
    const h = harness([{ stockName: '零值证券', symbol: 'UNVERIFIED:ZERO', lotId: 51, state: 'holding', openingValue: 0, pnl: 0 }]);
    expect(topPnl(h.render())).toBe('+¥0.00');
    expect(metricRows(h.render())).toEqual({ 零值证券: '¥0.00' });
    expectCount(h.render(), 'holding', 1);
    assertPie(h.render(), { 零值证券: '—' });
    const tree = h.tab('ratio');
    expect(totalMetric(tree, 'holding', 'ratio')).toBe('—');
    expect(metricRows(tree)).toEqual({ 零值证券: '—' });
    expect(renderToStaticMarkup(tree)).not.toMatch(/NaN|Infinity|暂未估值/);
  });
});

const quantityFixture = (patch: Partial<Row> = {}): Row => ({ stockName: '苹果', symbol: 'AAPL', lotId: 61,
  state: 'holding', openingValue: 100, pnl: 10, quantity: 1, ...patch });

describe('市值股数与真实美股代码：真实组件回归', () => {
  it.each([
    ['holding', { AAPL: '10 股', 贵州茅台: '2 股' }],
    ['closed', { AAPL: '5 股', MSFT: '股数待更新' }],
    ['all', { AAPL: '15 股', 贵州茅台: '2 股', MSFT: '股数待更新' }],
  ] as [Scope, Record<string, string>][])('%s按真实剩余或卖出份额汇总，部分卖出同lot总15而不重复', (scope, quantities) => {
    const h = harness(); const tree = h.choose(scope);
    expect(quantityRows(tree)).toEqual(quantities);
    expect(metricRows(tree)).toEqual(expected[scope].rows.value);
    expect(topPnl(tree)).toBe(expected[scope].pnl);
  });
  it.each([null, undefined, NaN, Infinity, -Infinity, -1])('缺失或非法quantity=%s不能冒充0且不影响原金额', quantity => {
    const tree = harness([quantityFixture({ quantity })]).render();
    expect(quantityRows(tree)).toEqual({ AAPL: '股数待更新' });
    expect(metricRows(tree)).toEqual({ AAPL: '¥100.00' });
    expect(renderToStaticMarkup(tree)).not.toMatch(/NaN|Infinity/);
  });
  it('合法0股保持0，缺数同symbol组不拿已知子量伪装合计', () => {
    expect(quantityRows(harness([quantityFixture({ quantity: 0 })]).render())).toEqual({ AAPL: '0 股' });
    const h = harness([quantityFixture({ quantity: 8 }), quantityFixture({ lotId: 62, quantity: null })]);
    expect(quantityRows(h.render())).toEqual({ AAPL: '股数待更新' });
    expect(metricRows(h.render())).toEqual({ AAPL: '¥200.00' });
  });
  it('同名多lots合计数量仅最终8dp格式化，不泄露IEEE浮点尾数', () => {
    const tree = harness([quantityFixture({ quantity: 0.1 }), quantityFixture({ lotId: 62, quantity: 0.2 })]).render();
    expect(quantityRows(tree)).toEqual({ AAPL: '0.3 股' });
    expect(text(tree)).not.toContain('0.30000000000000004');
    const precise = harness([quantityFixture({ quantity: 1234.123456789 })]).render();
    expect(quantityRows(precise)).toEqual({ AAPL: '1,234.12345679 股' });
  });
  it('最小数字币1e-8保留币单位和原全名，不套用股票零阈值', () => {
    const tree = harness([quantityFixture({ stockName: '比特币', symbol: 'CRYPTO:BTC-USDT', quantity: 1e-8 })]).render();
    expect(quantityRows(tree)).toEqual({ 比特币: '0.00000001 币' });
    expect(metricRows(tree)).toEqual({ 比特币: '¥100.00' });
  });
  it('同原全名多USsymbol保留一金额组，但名称列并列真实symbol、股数按instrument分段', () => {
    const tree = harness([quantityFixture({ stockName: '共同全名', quantity: 2 }),
      quantityFixture({ stockName: '共同全名', symbol: 'MSFT', lotId: 62, quantity: 3 })]).render();
    expect(metricRows(tree)).toEqual({ 'AAPL / MSFT': '¥200.00' });
    const quantities = quantityRows(tree)['AAPL / MSFT'];
    expect(quantities).toContain('AAPL'); expect(quantities).toContain('2 股');
    expect(quantities).toContain('MSFT'); expect(quantities).toContain('3 股');
    expect(quantities).not.toBe('5 股');
    expectCount(tree, 'holding', 1); assertPie(tree, { 共同全名: '+100.0%' });
  });
  it.each([['AAPL', '600519.SH'], ['600519.SH', 'AAPL'], ['AAPL', 'CRYPTO:BTC-USDT']])(
    '同名混市场%s/%s不得first归错简称，股币不混加', (first, second) => {
      const tree = harness([quantityFixture({ stockName: '混合原全名', symbol: first, quantity: 2 }),
        quantityFixture({ stockName: '混合原全名', symbol: second, lotId: 62, quantity: 3 })]).render();
      expect(metricRows(tree)).toEqual({ 混合原全名: '¥200.00' });
      const quantities = quantityRows(tree).混合原全名;
      expect(quantities).toContain(portfolioDisplaySymbol(first)); expect(quantities).toContain(portfolioDisplaySymbol(second));
      expect(quantities).toContain(`2 ${portfolioQuantityUnit(first)}`); expect(quantities).toContain(`3 ${portfolioQuantityUnit(second)}`);
      expect(quantities).not.toBe('5 股'); expect(quantities).not.toBe('5 币');
    });
  it.each([
    ['ROBINHOOD MARKETS INC', 'HOOD'], ['COINBASE GLOBAL INC', 'COIN'],
    ['APPLIED OPTOELECTRONICS INC', 'AAOI'], ['CIRCLE INTERNET GROUP INC', 'CRCL'],
  ])('%s只在市值使用已有ticker %s，盈亏/比率/饼图/图例保持原全称', (stockName, symbol) => {
    const h = harness([quantityFixture({ stockName, symbol: ` ${symbol.toLowerCase()} ` })]);
    expect(metricRows(h.render())).toEqual({ [symbol]: '¥100.00' });
    assertPie(h.render(), { [stockName]: '+100.0%' });
    for (const dimension of ['pnl', 'ratio'] as Dimension[]) {
      const tree = h.tab(dimension);
      expect(metricRows(tree)).toEqual({ [stockName]: dimension === 'pnl' ? '+¥10.00' : '+10.00%' });
      expect(nodes(tree).filter(node => node.props['data-summary-stock-quantity'] !== undefined)).toHaveLength(0);
      assertPie(tree, { [stockName]: '+100.0%' });
    }
  });
  it('没有真实可解析USsymbol时不靠公司全名猜HOOD或映射股票代码', () => {
    const tree = harness([quantityFixture({ stockName: 'ROBINHOOD MARKETS INC', symbol: '' })]).render();
    expect(metricRows(tree)).toEqual({ 'ROBINHOOD MARKETS INC': '¥100.00' });
  });
  it('反复范围/维度切换没有qty副作用，金额和源rows保持不变', () => {
    const h = harness(); const untouched = JSON.stringify(h.rows);
    for (const scope of ['holding', 'closed', 'all', 'holding'] as Scope[]) {
      h.choose(scope);
      for (const dimension of dimensions) {
        const tree = h.tab(dimension);
        expect(metricRows(tree)).toEqual(expected[scope].rows[dimension]);
        expect(h.radioGroup().props.value).toBe(scope);
        expect(nodes(tree).filter(node => node.props['data-summary-stock-quantity'] !== undefined)).toHaveLength(dimension === 'value' ? Object.keys(expected[scope].rows.value).length : 0);
      }
    }
    expect(JSON.stringify(h.rows)).toBe(untouched);
  });
  it('移动端行名称金额独立，股数可换行而不挤金额或截断隐藏内容', () => {
    const tree = harness([quantityFixture({ stockName: '移动端很长全名', symbol: '600519.SH', quantity: 1234.12345678 })]).render();
    const row = children(panel(tree)).find(node => node.key != null);
    const name = find(row, node => node.props['data-summary-stock-name'] !== undefined, 'name');
    const metric = find(row, node => node.props['data-summary-stock-metric'] !== undefined, 'metric');
    const quantity = find(row, node => node.props['data-summary-stock-quantity'] !== undefined, 'quantity');
    expect(text(name)).toBe('移动端很长全名'); expect(text(metric)).toBe('¥100.00');
    expect(metric.props.className).toContain('shrink-0');
    const line = find(row, node => children(node).includes(name) && children(node).includes(quantity) && children(node).includes(metric), 'name/quantity/amount line');
    expect(line.props.className).toContain('flex-wrap');
    expect(name.props.className).toContain('min-w-0');
    expect(name.props.className).toMatch(/break-words|break-all/);
    expect(quantity.props.className).not.toMatch(/truncate|line-clamp/);
    expect(renderToStaticMarkup(row)).toContain('1,234.12345678 股');
  });
});
