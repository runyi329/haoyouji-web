import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { portfolioCashMultiplier } from '../shared/portfolio-instruments';

const portfolio = readFileSync(new URL('../client/src/components/StockObservationPortfolio.tsx', import.meta.url), 'utf8');
const account = readFileSync(new URL('../client/src/components/StockObservationAccountSummary.tsx', import.meta.url), 'utf8');
const indicator = readFileSync(new URL('../client/src/components/StockQuoteUpdateIndicator.tsx', import.meta.url), 'utf8');
function initializer(source: string, name: string) {
  const ast = ts.createSourceFile('component.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let value: ts.Expression | undefined;
  function visit(n: ts.Node) { if (!value && ts.isVariableDeclaration(n) && n.name.getText(ast) === name && n.initializer) value = n.initializer; ts.forEachChild(n, visit); }
  visit(ast); if (!value) throw new Error(name);
  return ts.transpileModule(`const result = ${value.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
function asCny(source: string, usd: number, usdt: number | null) {
  const dependencies = { usdCnyRate: usd, usdtCnyRate: usdt, finiteValue: (value: any) => typeof value === 'number' && Number.isFinite(value) ? value : null, portfolioCashMultiplier };
  return new Function(...Object.keys(dependencies), `${initializer(source, 'asCny')} return result;`)(...Object.values(dependencies));
}

describe('USDT观察共用组件兼容：真实处理器，离线', () => {
  it('人民币原值不变，美元沿原汇率，USDT绝不偷用美元汇率', () => {
    const convert = asCny(portfolio, 7, 8);
    expect(convert(10, 'CNY')).toBe(10); expect(convert(10, 'USD')).toBe(70); expect(convert(10, 'USDT')).toBe(80);
  });
  it('USDT缺独立汇率时人民币未知；原始USDT金额仍保留于真实JSX', () => {
    expect(asCny(portfolio, 7, null)(10, 'USDT')).toBeNull();
    expect(portfolio).toContain("currency === 'USDT' ? 'USDT ' : ''");
    expect(portfolio).toContain("holding.currency === 'USDT' ? '币' : '股'");
  });
  it('零或无效独立汇率不能显示伪人民币，零原币在有真实FX时是合法0', () => {
    expect(asCny(portfolio, 7, 0)(10, 'USDT')).toBeNull();
    expect(asCny(portfolio, 7, 8)(null, 'USDT')).toBeNull();
    expect(asCny(portfolio, 7, 8)(0, 'USDT')).toBe(0);
  });
  it('共用账户合计也只用USDT独立腿，不把crypto观察累计收益改成美元', () => {
    expect(asCny(account, 7, null)(10, 'USDT')).toBeNull();
    expect(asCny(account, 7, 8)(10, 'USDT')).toBe(80);
    expect(asCny(account, 7, 8)(10, 'USD')).toBe(70);
  });
  it('行情指示器明确数字币24小时市场开放，不把周末说成休盘或把市场灯当价格新鲜证明', () => {
    expect(indicator).toContain("const marketOpen = currency === 'USDT' ||");
    expect(indicator).toContain('数字币24小时交易，报价时刻另示');
    expect(indicator).toContain('Quote availability remains separate in the timestamp and tooltip.');
  });
});
