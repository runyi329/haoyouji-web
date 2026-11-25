import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { stockRealizedValueCny } from '../shared/stock-realized-portfolio';

const source = readFileSync(new URL('../client/src/components/StockParticipantProfitChart.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes((tree.props as any).children)] : [];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return React.isValidElement(tree) ? text((tree.props as any).children) : String(tree);
}
function harness(input: any[]) {
  const rows = Object.freeze(input.map(row => Object.freeze({ ...row })));
  let state: any;
  const react = { ...React, useState: (initial: any) => [state ??= initial, (next: any) => { state = next; }] };
  const module = { exports: {} as any };
  const context = vm.createContext({ React: react, module, exports: module.exports, require: (name: string) => {
    if (name === 'react') return react;
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  new vm.Script(compiled).runInContext(context);
  const render = () => module.exports.default({ rows });
  const choose = (label: string) => {
    const tab = nodes(render()).find(node => node.props.role === 'tab' && text(node).startsWith(`${label}（`));
    tab.props.onClick(); return render();
  };
  const values = (tree: any) => nodes(tree).filter(node => node.props.role === 'listitem').map(node => node.props['aria-label']);
  return { rows, render, choose, values };
}
const fixture = () => [
  { stockName: ' 苹果 ', status: 'active', pnl: 100 },
  { stockName: '苹果', status: 'closed', pnl: -60 },
  { stockName: '谷歌', status: 'active', pnl: -20 },
  { stockName: '微软', status: 'closed', pnl: 10 },
];
function actualVariable(file: string, name: string, scope: Record<string, any>) {
  const code = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = '';
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); if (!expression) throw new Error(`Missing actual ${name}`);
  const js = ts.transpileModule(`const result=${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), `${js}; return result;`)(...Object.values(scope));
}

describe('个人股票盈亏：真实TSX三标签紧凑列表', () => {
  it('默认进行中，标签按进行中已结束全部排列且只筛选本地展示', () => {
    const h = harness(fixture()), tree = h.render();
    expect(nodes(tree).filter(node => node.props.role === 'tab').map(node => [text(node), node.props['aria-selected']])).toEqual([
      ['进行中（2）', true], ['已结束（2）', false], ['全部（3）', false],
    ]);
    expect(h.values(tree)).toEqual(['苹果 +¥100.00', '谷歌 −¥20.00']);
  });
  it('标签数量按当前范围同名合并后统计，与列表一致；未知和0收益仍计数，空范围显示0', () => {
    const h = harness([...fixture(), { stockName: ' 苹果 ', status: 'active', pnl: null }, { stockName: '谷歌', status: 'active', pnl: 0 }]);
    for (const [label, count] of [['进行中', 2], ['已结束', 2], ['全部', 3]] as const) {
      const tree = h.choose(label);
      const selected = nodes(tree).find(node => node.props.role === 'tab' && node.props['aria-selected']);
      expect(text(selected)).toBe(`${label}（${count}）`);
      expect(h.values(tree)).toHaveLength(count);
      expect(nodes(tree).filter(node => node.props.role === 'tab').map(text)).toEqual(['进行中（2）', '已结束（2）', '全部（3）']);
    }
    const single = harness([{ stockName: '', status: 'active', pnl: 0 }, { stockName: ' ', status: 'active', pnl: null }]);
    expect(nodes(single.render()).filter(node => node.props.role === 'tab').map(text)).toEqual(['进行中（1）', '已结束（0）', '全部（1）']);
    expect(single.values(single.choose('已结束'))).toHaveLength(0);
  });
  it('部分平仓同名先分流再合并；往返不重复累计或反号，不改原始rows', () => {
    const h = harness(fixture()), original = JSON.stringify(h.rows);
    expect(h.values(h.choose('进行中'))).toEqual(['苹果 +¥100.00', '谷歌 −¥20.00']);
    expect(h.values(h.choose('已结束'))).toEqual(['苹果 −¥60.00', '微软 +¥10.00']);
    expect(h.values(h.choose('全部'))).toEqual(['苹果 +¥40.00', '谷歌 −¥20.00', '微软 +¥10.00']);
    expect(h.values(h.choose('进行中'))).toEqual(['苹果 +¥100.00', '谷歌 −¥20.00']);
    expect(JSON.stringify(h.rows)).toBe(original);
  });
  it('进行中缺价不污染已结束；未知保持暂未估值，不冒充0', () => {
    const h = harness([{ stockName: '苹果', status: 'active', pnl: null }, { stockName: '苹果', status: 'closed', pnl: 12 }]);
    expect(h.values(h.render())).toEqual(['苹果 暂未估值']);
    expect(h.values(h.choose('已结束'))).toEqual(['苹果 +¥12.00']);
    expect(h.values(h.choose('进行中'))).toEqual(['苹果 暂未估值']);
    expect(renderToStaticMarkup(h.render())).not.toMatch(/NaN|Infinity/);
  });
  it('筛选空态保留三个标签，允许返回；行18px而标签保留可触摸高度', () => {
    const h = harness([{ stockName: '谷歌', status: 'active', pnl: 0 }]);
    expect(text(h.choose('已结束'))).toContain('暂无已结束股票');
    expect(nodes(h.render()).filter(node => node.props.role === 'tab')).toHaveLength(3);
    const tree = h.choose('全部');
    expect(nodes(tree).find(node => node.props.role === 'listitem').props.className).toContain('h-[18px]');
    expect(nodes(tree).filter(node => node.props.role === 'tab').every(node => node.props.className.includes('min-h-9'))).toBe(true);
    expect(h.values(tree)).toEqual(['谷歌 ¥0.00']);
    expect(harness([]).render()).toBeNull();
  });
  it('真实成员行沿用余仓浮盈和已结束冻结收益，仅追加status', () => {
    const historicalValueCny = actualVariable('../client/src/pages/StockTagPortfolio.tsx', 'historicalValueCny', {
      ledgerId: 37, categoryId: 90250, stockRealizedValueCny,
      toCny: (value: number) => value * 99, instrumentCurrency: () => 'USD',
    });
    const rows = actualVariable('../client/src/pages/StockTagPortfolio.tsx', 'memberStockProfitRows', {
      participantView: true, memberHoldingSummary: { details: [{ stockName: '苹果', floatingPnl: 3 }] },
      memberRealizedLots: [{ stockName: '苹果', symbol: 'AAPL', realizedPnl: -2, realizedPnlCny: -14, fxLocked: true }], historicalValueCny,
    });
    expect(rows).toEqual([{ stockName: '苹果', pnl: 3, status: 'active' }, { stockName: '苹果', pnl: -14, status: 'closed' }]);
  });
  it('观察部分结束按已有floatingPnl/closedPnl拆分，暂停留在进行中，不再重复追加totalPnl', () => {
    const partial = { stockName: '苹果', currency: 'USD', floatingPnl: 3, closedPnl: -2, totalPnl: 1 };
    const rows = actualVariable('../client/src/components/StockObservationAccountSummary.tsx', 'observerProfitRows', {
      currentHoldings: [partial, { stockName: '暂停股', currency: 'CNY', floatingPnl: 8 }], endedHoldings: [partial],
      asCny: (value: number, currency: string) => value * (currency === 'USD' ? 7 : 1), finiteValue: (value: number) => value,
    });
    expect(rows).toEqual([{ stockName: '苹果', pnl: 21, status: 'active' }, { stockName: '暂停股', pnl: 8, status: 'active' }, { stockName: '苹果', pnl: -14, status: 'closed' }]);
    const h = harness(rows);
    expect(h.values(h.choose('全部'))).toContain('苹果 +¥7.00');
  });
  it.each([
    ['全部', ['合计 +¥30.00']],
    ['进行中', ['合计 +¥80.00']],
    ['已结束', ['合计 −¥50.00']],
  ])('%s底部总计严格按当前同名合并行，不重复统计部分平仓', (label, expected) => {
    const h = harness(fixture()), tree = h.choose(label as string);
    const total = nodes(tree).find(node => node.props['aria-label'] === `${label}盈亏总计`);
    expect(nodes(total).filter(node => /^(盈利|亏损|合计) /.test(node.props['aria-label'] || '')).map(node => node.props['aria-label'])).toEqual(expected);
    expect(text(total)).not.toMatch(/盈利|亏损/);
    expect(nodes(total).filter(node => /^合计 /.test(node.props['aria-label'] || ''))).toHaveLength(1);
    expect(total.props['aria-live']).toBe('polite');
  });
  it('当前范围有未知数时合计保持未知；切到已结束独立恢复，空范围显示0', () => {
    const h = harness([{ stockName: '苹果', status: 'active', pnl: null }, { stockName: '苹果', status: 'closed', pnl: 12 }]);
    const totalLabels = (tree: any) => nodes(tree).filter(node => /^(盈利|亏损|合计) /.test(node.props['aria-label'] || '')).map(node => node.props['aria-label']);
    expect(totalLabels(h.render())).toEqual(['合计 暂未估值']);
    expect(totalLabels(h.choose('已结束'))).toEqual(['合计 +¥12.00']);
    const onlyActive = harness([{ stockName: '苹果', status: 'active', pnl: 10 }]);
    expect(totalLabels(onlyActive.choose('已结束'))).toEqual(['合计 ¥0.00']);
  });
});
