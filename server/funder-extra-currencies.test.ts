import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// 只读取生产源码，执行纯名单/枚举/交易对表达式；不导入 React、路由或扫描器，不连接数据库和网络。
const NEW_COINS = ['TAO', 'PENDLE', 'NEAR', 'INJ', 'STRK'];
const EXISTING_COINS = ['ENA', 'LDO', 'ONDO', 'UNI', 'DOGE'];
const ALL_COINS = [...NEW_COINS, ...EXISTING_COINS];
function parse(path: string) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
const card = parse('../client/src/components/FunderOrderCard.tsx');
const finance = parse('../client/src/pages/FinanceManagement.tsx');
const routers = parse('./routers.ts');
const scanner = parse('./price-scanner.ts');
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing production definition: ${name}`);
  return value;
}
function initializer(root: ts.Node, name: string): ts.Expression {
  return required(nodes(root, ts.isVariableDeclaration).find(n => n.name.getText() === name)?.initializer, name);
}
function unwrap(expression: ts.Expression): ts.Expression {
  return ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)
    ? unwrap(expression.expression) : expression;
}
function strings(expression: ts.Expression): string[] {
  const array = unwrap(expression);
  if (!ts.isArrayLiteralExpression(array)) throw new Error('Expected production literal coin list');
  return array.elements.map(element => {
    if (!ts.isStringLiteral(element)) throw new Error('Expected literal coin');
    return element.text;
  });
}
function coversAllWithoutDuplicates(list: string[]) {
  expect(list).toEqual(expect.arrayContaining(ALL_COINS));
  expect(new Set(list).size).toBe(list.length);
}
function route(name: string): ts.Expression {
  return required(nodes(routers, ts.isPropertyAssignment).find(n => n.name.getText() === name)?.initializer, name);
}
function coinSchema(name: string): ts.Expression {
  const input = required(nodes(route(name), ts.isCallExpression).find(n =>
    ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'input'), `${name}.input`);
  const objectCall = required(input.arguments[0], `${name}.input argument`);
  if (!ts.isCallExpression(objectCall) || objectCall.expression.getText() !== 'z.object'
    || !objectCall.arguments[0] || !ts.isObjectLiteralExpression(objectCall.arguments[0])) {
    throw new Error(`Expected ${name} input z.object`);
  }
  const property = objectCall.arguments[0].properties.find(n => ts.isPropertyAssignment(n) && n.name.getText() === 'coin');
  if (!property || !ts.isPropertyAssignment(property)) throw new Error(`Missing ${name}.coin`);
  return property.initializer;
}
const quote = required(scanner.statements.find(n => ts.isFunctionDeclaration(n)
  && n.name?.text === 'fetchCryptoQuote'), 'fetchCryptoQuote');
const quoteRequests = nodes(quote, ts.isCallExpression).filter(n => n.expression.getText() === 'fetchCryptoJson');
function requestUrls(coin: string): string[] {
  // 仅求值模板字符串，不执行 fetchCryptoQuote 或任何请求函数。
  const pair = new Function('coin', `return (${initializer(quote, 'pair').getText()});`)(coin);
  return quoteRequests.map(call => {
    const template = required(call.arguments[0], 'spot request URL');
    if (!ts.isTemplateExpression(template)) throw new Error('Expected generic spot URL template');
    return new Function('coin', 'pair', `return (${template.getText()});`)(coin, pair);
  });
}

describe('52融资付息币种在新旧前端入口一致可选', () => {
  it.each([['FunderOrderCard', card], ['FinanceManagement', finance]] as const)(
    '%s包含全部10币且名单不重复', (_name, ast) => {
      coversAllWithoutDuplicates(strings(initializer(ast, 'COIN_OPTIONS')));
    });
  it.each([['FunderOrderCard', card], ['FinanceManagement', finance]] as const)(
    '%s为全部10币提供有效颜色且颜色键不重复', (_name, ast) => {
      const colors = unwrap(initializer(ast, 'COIN_COLORS'));
      if (!ts.isObjectLiteralExpression(colors)) throw new Error('Expected production color map');
      const entries = colors.properties.map(property => {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
          throw new Error('Expected literal coin color');
        }
        const key = ts.isStringLiteral(property.name) ? property.name.text : property.name.getText();
        return [key, property.initializer.text] as const;
      });
      expect(new Set(entries.map(([key]) => key)).size).toBe(entries.length);
      for (const coin of ALL_COINS) expect(entries.find(([key]) => key === coin)?.[1], coin).toMatch(/^#[\da-f]{6}$/i);
    });
});

describe('保存枚举与回包行情名单覆盖新增币种并保留旧币', () => {
  it.each(['funderCreateAssetOrder', 'financeCreateOrder', 'financeUpdateOrder'])(
    '%s的生产coin枚举接受5个新币和5个既有币且无重复', name => {
      const expression = coinSchema(name);
      const enumCall = required(nodes(expression, ts.isCallExpression).find(n => n.expression.getText() === 'z.enum'), `${name}.coin z.enum`);
      coversAllWithoutDuplicates(strings(required(enumCall.arguments[0], `${name}.coin enum list`)));
      const schema = new Function('z', `return (${expression.getText()});`)(z) as z.ZodType;
      for (const coin of ALL_COINS) expect(schema.safeParse(coin).success, coin).toBe(true);
      expect(schema.safeParse('NOT_A_COIN').success).toBe(false);
    });
  it('financeUpdateOrder的coin仍为optional，支持不修改币种的更新', () => {
    const expression = coinSchema('financeUpdateOrder');
    expect(expression.getText()).toMatch(/\.optional\(\)$/);
    const schema = new Function('z', `return (${expression.getText()});`)(z) as z.ZodType;
    expect(schema.safeParse(undefined).success).toBe(true);
  });
  it.each(['funderGetAssetOrders', 'funderGetSharedCollateralPool', 'financeGetAssetSummary'])(
    '%s实际填充livePrices的循环涵盖全部10币且不重复', name => {
      const loops = nodes(route(name), ts.isForOfStatement).filter(n =>
        nodes(n.statement, ts.isElementAccessExpression).some(access => access.expression.getText() === 'livePrices'));
      expect(loops).toHaveLength(1);
      expect(loops[0].statement.getText()).toContain('getLatestPrice(coin)');
      coversAllWithoutDuplicates(strings(loops[0].expression));
    });
});

describe('新增币种沿用扫描器真实USDT现货链路', () => {
  it('CRYPTO_COINS覆盖全部10币且无重复', () => {
    coversAllWithoutDuplicates(strings(initializer(scanner, 'CRYPTO_COINS')));
  });
  it('全部10币均使用自身代码构造Gate、HTX和OKX现货交易对', () => {
    for (const coin of ALL_COINS) expect(requestUrls(coin)).toEqual([
      `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${coin}_USDT`,
      `https://api.huobi.pro/market/detail/merged?symbol=${coin.toLowerCase()}usdt`,
      `https://www.okx.com/api/v5/market/ticker?instId=${coin}-USDT`,
    ]);
  });
  it('fetchCryptoQuote保留Gate→HTX→OKX的顺序和对应来源', () => {
    expect(quoteRequests).toHaveLength(3);
    const sources = nodes(quote, ts.isPropertyAssignment).filter(n => n.name.getText() === 'source');
    expect(sources.map(n => n.initializer.getText())).toEqual(["'Gate.io'", "'HTX'", "'OKX'"]);
    expect(nodes(quote, ts.isTryStatement)).toHaveLength(3);
    expect(nodes(quote, ts.isAwaitExpression).map(n => n.expression.getText()))
      .toEqual(quoteRequests.map(n => n.getText()));
  });
  it('通用现货函数不硬编码ETH或从ETH价格反推其他币种', () => {
    expect(quote.getText()).not.toMatch(/\bETH\b|fetchEth|futures|SWAP|mark_price/);
    expect(quote.getText()).toContain('Number(row?.last)');
    expect(quote.getText()).toContain('Number(tick?.close)');
  });
});
