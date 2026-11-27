import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { StockSectionImageDownload, StockSectionImageExportProvider } from '../client/src/components/StockSectionImageDownload';
import { AI_STOCK_THEME } from '../client/src/lib/ai-stock-theme';

// Inspect and execute actual production JSX with inert callbacks; no app, DB, network or image-generation side effects.
const source = readFileSync(new URL('../client/src/pages/LedgerAIDatabase.tsx', import.meta.url), 'utf8');
const fearSource = readFileSync(new URL('../client/src/components/AiFearGreedSection.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LedgerAIDatabase.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const sections = ['SurvivalSection', 'RisefallSection', 'BunchingEffectSection', 'UpRateDistSection', 'ValuationSection', 'TradingCostSection', 'MacroSection'];
const titles = ['A 股全生命周期', '涨跌统计', '贪婪恐惧指数', '涨停聚集效应', '涨天率分布', '估值分布', '交易成本', '宏观数据'];
function declaration(name: string) {
  const node = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!node) throw new Error('Missing actual production function: ' + name);
  return node;
}
function visits(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const result: ts.Node[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(node); return result;
}
function actualTitle() {
  const scope = { StockSectionImageDownload, ACCENT_GRAD: AI_STOCK_THEME.accentGradient, TEXT: AI_STOCK_THEME.text, MUTED: AI_STOCK_THEME.muted };
  const js = ts.transpileModule(`const actual = (${declaration('SectionTitle').getText(ast)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function('React', ...Object.keys(scope), `${js}; return actual;`)(React, ...Object.values(scope));
}

describe('AI 股伴 market dashboard independent section downloads', () => {
  it('marks seven ordinary dashboard panels separately and leaves the fear/greed card its own eighth boundary', () => {
    const boundaries = visits(declaration('LedgerAIDatabaseContent'), node => ts.isJsxElement(node) &&
      node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(ast) === 'data-stock-export-section')) as ts.JsxElement[];
    expect(boundaries).toHaveLength(7);
    const nested = boundaries.map(node => visits(node, child => ts.isJsxSelfClosingElement(child)).map(child => (child as ts.JsxSelfClosingElement).tagName.getText(ast)));
    expect(nested.map(names => names.filter(name => name !== 'UnsupportedMarketSection'))).toEqual(sections.map(name => [name]));
    expect(nested.flat()).not.toContain('MarketTabs');
    expect(fearSource).toContain('<section id="fear-greed-index" data-stock-export-section');
    const provider = visits(declaration('LedgerAIDatabaseContent'), node => ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'StockSectionImageExportProvider')[0] as ts.JsxOpeningElement;
    expect(provider.getText(ast)).toContain('stockName="AI 股伴"'); expect(provider.getText(ast)).toContain('marketOverview');
    expect(provider.getText(ast)).not.toContain('data-stock-export-section');
  });
  it.each(titles)('renders one accessible right-side download control for %s while preserving its date', title => {
    const Header = actualTitle();
    const html = renderToStaticMarkup(React.createElement(StockSectionImageExportProvider, {
      stockName: 'AI 股伴', stockCode: '', marketOverview: true,
      children: React.createElement(Header, { title, sub: 'isolated subtitle', extra: React.createElement('p', null, '2026-11-26') }),
    }));
    expect(html).toContain(`aria-label="下载${title}图片"`);
    expect(html.match(/data-stock-export-hide="true"/g)).toHaveLength(1);
    expect(html).toContain('2026-11-26'); expect(html).toContain('items-start gap-1.5');
    expect(html).not.toContain('脉动');
  });
  it('all seven real market panel functions still use the common header and no new market-data or saving API is introduced', () => {
    for (const name of sections) expect(declaration(name).getText(ast)).toContain('<SectionTitle');
    expect(source).not.toContain('脉动'); expect(fearSource).not.toContain('脉动');
    expect(source).not.toMatch(/useMutation|\.mutate\(/);
    expect(fearSource).toContain('StockSectionImageDownload title="贪婪恐惧指数"');
  });
});
