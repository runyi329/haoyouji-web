import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { getWalletFlowCurrency, isWalletFlowCurrency, type WalletFlowCurrencySource } from '../shared/wallet-flow-currency';

// 只导入真实纯 helper、读取页面 AST、执行抽出的纯函数/过滤表达式；不导入 React、路由、DB 或网络。
// 以下为单元测试 fixtures，不替换任何生产接口或页面数据。
type Flow = WalletFlowCurrencySource & Readonly<Record<string, unknown>>;
type Entry = {
  assetCode: string; amount: number; balanceAfter: number | null;
  type: string; primary: string; secondary: string; status: string;
  isFrozen: boolean; isRelease: boolean;
};
function parse(path: string) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
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
function declaration(root: ts.SourceFile, name: string): ts.FunctionDeclaration {
  return required(nodes(root, ts.isFunctionDeclaration).find(n => n.name?.text === name), name);
}
function unwrap(expression: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
    ? unwrap(expression.expression) : expression;
}
function evaluate<T>(source: string, bindings: Record<string, unknown>): T {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
function expressionValue<T>(expression: ts.Expression, bindings: Record<string, unknown>): T {
  return evaluate<T>(`(${expression.getText()})`, bindings);
}
function helperCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && node.expression.text === 'isWalletFlowCurrency';
}
function filterCalls(root: ts.Node): ts.CallExpression[] {
  return nodes(root, ts.isCallExpression).filter(n => ts.isPropertyAccessExpression(n.expression)
    && n.expression.name.text === 'filter');
}
function callback(call: ts.CallExpression): ts.ArrowFunction {
  const fn = required(call.arguments[0], 'filter callback');
  if (!ts.isArrowFunction(fn)) throw new Error('Expected production arrow filter');
  return fn;
}
function assertHelperImport(ast: ts.SourceFile) {
  const imports = nodes(ast, ts.isImportDeclaration).filter(n => ts.isStringLiteral(n.moduleSpecifier)
    && n.moduleSpecifier.text === '@shared/wallet-flow-currency');
  expect(imports).toHaveLength(1);
  expect(nodes(imports[0], ts.isImportSpecifier).some(n => n.name.text === 'isWalletFlowCurrency')).toBe(true);
}
function conjunctions(expression: ts.Expression): ts.Expression[] {
  const expr = unwrap(expression);
  return ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ? [...conjunctions(expr.left), ...conjunctions(expr.right)] : [expr];
}
function assertStrictUsdtFilter(call: ts.CallExpression) {
  const fn = callback(call);
  if (ts.isBlock(fn.body)) throw new Error('Expected expression-bodied production currency filter');
  const first = conjunctions(fn.body)[0];
  expect(helperCall(first)).toBe(true);
  if (!helperCall(first)) throw new Error('Expected mandatory positive currency guard, not an OR bypass');
  expect(first.arguments).toHaveLength(2);
  expect(first.arguments[0].getText()).toBe(fn.parameters[0].name.getText());
  expect(ts.isStringLiteral(first.arguments[1]) && first.arguments[1].text).toBe('USDT');
}
function sourceProperties(root: ts.Node): string[] {
  return nodes(root, ts.isPropertyAccessExpression).map(n => n.getText());
}

const crypto = parse('../client/src/pages/CryptoWalletTransactions.tsx');
const transactions = parse('../client/src/pages/WalletTransactions.tsx');
const recharge = parse('../client/src/pages/RechargeHistory.tsx');
const wallet = parse('../client/src/pages/Wallet.tsx');
const getUsdt = declaration(crypto, 'getUsdtEntry');
const getUsdtEntry = evaluate<(item: Flow) => Entry | null>([
  declaration(crypto, 'cleanNote').getText(),
  declaration(crypto, 'hasOrderContext').getText(),
  getUsdt.getText(),
  'getUsdtEntry;',
].join('\n'), {
  isWalletFlowCurrency,
  // 本组无站内转账场景；只隔离展示依赖，币种判定始终使用真实 helper。
  getInternalTransferPresentation: (note: string) => {
    if (note.includes('[站内转账]')) throw new Error('Internal-transfer fixture is outside this test scope');
    return null;
  },
});

const cnyFixtures: readonly Flow[] = Object.freeze([
  Object.freeze({ id: 'cny-credit', currency: 'CNY', amount: '1862', balanceAfter: '1862', note: '人民币入账', sourceType: 'manual' }),
  Object.freeze({ id: 'cny-debit-1', currency: ' cny ', amount: '-49', balanceAfter: '1813', note: '人民币支出1', sourceType: 'manual' }),
  Object.freeze({ id: 'cny-debit-2', amount: '-49', balanceAfter: '1764', note: ' \t[cNy] 人民币支出2', sourceType: 'manual' }),
  Object.freeze({ id: 'cny-debit-3', amount: '-49', balanceAfter: '1715', note: '', description: '[CNY] 人民币支出3', sourceType: 'manual' }),
  Object.freeze({ id: 'cny-debit-4', currency: ' ', assetCode: ' cny ', amount: '-49', balanceAfter: '1666', note: '人民币支出4', sourceType: 'manual' }),
]);
const oldUsdt: Flow = Object.freeze({
  id: 'legacy-usdt', amount: '-7.313433', balanceAfter: '15.93',
  note: '旧USDT扣款≈49元（≃49CNY）', sourceType: 'balance_history', type: 'consume',
});
const unknownFlow: Flow = Object.freeze({ currency: 'UNKNOWN', amount: '-49', balanceAfter: '1666', note: '[CNY] 非钱包币种' });
const screenshotFixtures: readonly Flow[] = Object.freeze([...cnyFixtures, oldUsdt]);
const originalScreenshot = JSON.stringify(screenshotFixtures);
const recentUsdt = initializer(wallet, 'recentUsdtTx');
const walletCurrencyFilters = filterCalls(recentUsdt).filter(n => nodes(callback(n), helperCall).length > 0);

const currencyCases: Array<[string, WalletFlowCurrencySource, string]> = [
  ['明确CNY忽略大小写与首尾空白', { currency: ' \tcNy\n' }, 'CNY'],
  ['明确USDT忽略大小写与首尾空白', { currency: ' usDt ' }, 'USDT'],
  ['空currency回退到规范化assetCode CNY', { currency: ' \t', assetCode: ' cNy ' }, 'CNY'],
  ['缺currency使用规范化assetCode USDT', { assetCode: '\nusdt\t' }, 'USDT'],
  ['旧note开头标记支持空白和大小写', { note: ' \t[cNy] 人民币支出' }, 'CNY'],
  ['空note回退原始description的开头标记', { note: '', description: '\n[CNY] 人民币支出' }, 'CNY'],
  ['备注中间的标记不作为币种', { note: '业务说明 [CNY] 人民币参考' }, 'USDT'],
  ['明确USDT压过冲突assetCode与旧备注', { currency: ' usdt ', assetCode: 'CNY', note: '[CNY] ≃49CNY' }, 'USDT'],
  ['明确CNY压过冲突assetCode且不要求备注', { currency: 'CNY', assetCode: 'USDT', note: '没有标记' }, 'CNY'],
  ['缺字段的普通旧流水仍为USDT而非人民币换算', { description: '扣款≈49元，≃49CNY' }, 'USDT'],
];

describe('钱包流水币种真实helper的归一化与权威字段', () => {
  it.each(currencyCases)('%s', (_name, item, expected) => {
    expect(getWalletFlowCurrency(item)).toBe(expected);
    expect(isWalletFlowCurrency(item, expected.toLowerCase())).toBe(true);
    expect(isWalletFlowCurrency(item, expected === 'CNY' ? 'USDT' : 'CNY')).toBe(false);
  });
  it('未知非空currency或assetCode不被兜底改成USDT/CNY', () => {
    for (const [item, expected] of [
      [{ currency: ' unknown ', assetCode: 'USDT', note: '[CNY]' }, 'UNKNOWN'],
      [{ assetCode: ' eth ', note: '[CNY]' }, 'ETH'],
      [{ currency: 0, assetCode: 'USDT' }, '0'],
      [{ currency: false, note: '[CNY]' }, 'FALSE'],
    ] as const) {
      expect(getWalletFlowCurrency(item)).toBe(expected);
      expect(isWalletFlowCurrency(item, 'USDT')).toBe(false);
      expect(isWalletFlowCurrency(item, 'CNY')).toBe(false);
    }
  });
  it('旧标记只认完整开头[CNY]，不认内嵌/缺括号/近似金额', () => {
    for (const note of ['说明\n[CNY]', '[CNYX] 支出', '[ CNY ] 支出', 'CNY 支出', '≈49元', '≃49CNY']) {
      expect(getWalletFlowCurrency({ note }), note).toBe('USDT');
    }
    expect(getWalletFlowCurrency({ note: '\n \t[CNY]支出' })).toBe('CNY');
  });
  it('原始note || description优先级不被清理或trim改变', () => {
    expect(getWalletFlowCurrency({ note: '普通备注', description: '[CNY] 描述' })).toBe('USDT');
    expect(getWalletFlowCurrency({ note: ' ', description: '[CNY] 描述' })).toBe('USDT');
    expect(getWalletFlowCurrency({ note: '[CNY] 备注', description: 'USDT描述' })).toBe('CNY');
    for (const item of [{}, { currency: null, assetCode: undefined }, { currency: '', assetCode: ' ', note: null }]) {
      expect(getWalletFlowCurrency(item)).toBe('USDT');
    }
  });
  it('isWalletFlowCurrency只做精确币种相等且不换算或修改金额余额', () => {
    const item = Object.freeze({ currency: ' eth ', amount: '-7.313433', balanceAfter: '15.93', note: '≃49CNY' });
    const before = JSON.stringify(item);
    expect(isWalletFlowCurrency(item, ' ETH ')).toBe(true);
    for (const code of ['USDT', 'CNY', 'ET', 'ETHX', '']) expect(isWalletFlowCurrency(item, code)).toBe(false);
    expect(JSON.stringify(item)).toBe(before);
    expect(item.amount).toBe('-7.313433');
    expect(item.balanceAfter).toBe('15.93');
  });
});

describe('截图回归：人民币五笔与旧USDT参考人民币备注严格分流', () => {
  it('USDT仅保留真实旧USDT扣款，-7.313433和余额15.93未转换为49元', () => {
    const filtered = screenshotFixtures.filter(item => isWalletFlowCurrency(item, 'USDT'));
    expect(filtered).toEqual([oldUsdt]);
    expect(filtered[0]).toBe(oldUsdt);
    expect(filtered[0].amount).toBe('-7.313433');
    expect(filtered[0].balanceAfter).toBe('15.93');
  });
  it('CNY完整保留+1862及四笔-49和全部原始余额快照', () => {
    const filtered = screenshotFixtures.filter(item => isWalletFlowCurrency(item, 'CNY'));
    expect(filtered).toHaveLength(5);
    expect(filtered.map(item => item.amount)).toEqual(['1862', '-49', '-49', '-49', '-49']);
    expect(filtered.map(item => item.balanceAfter)).toEqual(['1862', '1813', '1764', '1715', '1666']);
    filtered.forEach((item, index) => expect(item).toBe(cnyFixtures[index]));
  });
  it('不同用户ID和账本上下文复用相同分流，四个USDT入口均不漏入人民币', () => {
    for (const userId of [1, 987654]) {
      const fixture = Object.freeze(screenshotFixtures.map(item => Object.freeze({ ...item, userId, ledgerId: 52 })));
      const before = JSON.stringify(fixture);
      const cryptoResult = fixture.map(getUsdtEntry).filter(entry => entry !== null);
      expect(cryptoResult).toHaveLength(1);
      expect(cryptoResult[0]).toMatchObject({ amount: -7.313433, balanceAfter: 15.93, assetCode: 'USDT' });
      for (const [ast, name, query] of [
        [transactions, 'allItems', 'historyQuery'], [recharge, 'afData', 'afHistoryQuery'],
      ] as const) {
        const result = expressionValue<Flow[]>(initializer(ast, name), { [query]: { data: fixture }, isWalletFlowCurrency });
        expect(result).toHaveLength(1);
        expect(result[0]).toBe(fixture[5]);
      }
      for (const call of walletCurrencyFilters) {
        const predicate = expressionValue<(item: Flow) => boolean>(callback(call), { isWalletFlowCurrency });
        expect(fixture.filter(predicate)).toEqual([fixture[5]]);
      }
      expect(fixture.filter(item => isWalletFlowCurrency(item, 'CNY'))).toEqual(fixture.slice(0, 5));
      expect(JSON.stringify(fixture)).toBe(before);
    }
  });
  it('双向筛选不mutate任何原始记录，unknown两边都不混入', () => {
    const mixed = [...screenshotFixtures, unknownFlow];
    expect(mixed.filter(item => isWalletFlowCurrency(item, 'USDT'))).toEqual([oldUsdt]);
    expect(mixed.filter(item => isWalletFlowCurrency(item, 'CNY'))).toEqual(cnyFixtures);
    expect(JSON.stringify(screenshotFixtures)).toBe(originalScreenshot);
    expect(Object.isFrozen(screenshotFixtures)).toBe(true);
    expect(screenshotFixtures.every(item => Object.isFrozen(item))).toBe(true);
    expect(unknownFlow.currency).toBe('UNKNOWN');
  });
});

describe('AST抽取生产getUsdtEntry：先守卫再读取金额/清理备注', () => {
  it('人民币五笔与unknown均返回null，不能套上USDT单位', () => {
    for (const item of [...cnyFixtures, unknownFlow]) expect(getUsdtEntry(item)).toBeNull();
  });
  it('明确CNY在读取amount、balanceAfter、note等展示字段之前已返回', () => {
    const item = Object.freeze({
      currency: ' cNy ',
      get amount() { throw new Error('CNY amount must not be read'); },
      get balanceAfter() { throw new Error('CNY balance must not be read'); },
      get note() { throw new Error('Explicit CNY note must not be cleaned'); },
    });
    expect(getUsdtEntry(item)).toBeNull();
  });
  it('真实USDT执行生产展示函数保留原金额、余额和人民币参考备注', () => {
    const entry = required(getUsdtEntry(oldUsdt) ?? undefined, 'legacy USDT entry');
    expect(entry.assetCode).toBe('USDT');
    expect(entry.amount).toBe(-7.313433);
    expect(entry.balanceAfter).toBe(15.93);
    expect(entry.secondary).toBe(oldUsdt.note);
    expect(entry.isFrozen).toBe(false);
    expect(JSON.stringify(screenshotFixtures)).toBe(originalScreenshot);
  });
  it('明确USDT即便有[CNY]旧备注也仍可展示，缺余额依然为null', () => {
    const item = Object.freeze({ currency: 'USDT', assetCode: 'CNY', amount: '-7.313433', note: '[CNY] 参考≈49元' });
    const entry = required(getUsdtEntry(item) ?? undefined, 'explicit USDT entry');
    expect(entry.assetCode).toBe('USDT');
    expect(entry.amount).toBe(-7.313433);
    expect(entry.balanceAfter).toBeNull();
    expect(entry.secondary).toBe('参考≈49元');
    expect(item.note).toBe('[CNY] 参考≈49元');
  });
  it('wallet_hold本金冻结/解冻仍为frozen，不误改成支出或换算金额', () => {
    for (const [type, amount, balanceAfter, isRelease, primary, status] of [
      ['principal_hold', '-100', '15.93', false, '谷底征筹本金冻结', '本金已冻结'],
      ['principal_hold_release', '100', '115.93', true, '谷底征筹本金解冻', '本金已解冻'],
    ] as const) {
      const item = Object.freeze({ currency: 'USDT', sourceType: 'wallet_hold', type, amount, balanceAfter, note: '订单本金 ≃49CNY' });
      const before = JSON.stringify(item);
      expect(getUsdtEntry(item)).toMatchObject({
        assetCode: 'USDT', type: 'frozen', amount: Number(amount), balanceAfter: Number(balanceAfter),
        isFrozen: true, isRelease, primary, status,
      });
      expect(JSON.stringify(item)).toBe(before);
      expect(getUsdtEntry({ ...item, currency: 'CNY' })).toBeNull();
    }
  });
});

describe('生产AST接线回归：拒绝只在comment中出现helper', () => {
  it('getUsdtEntry签名允许null且函数第一条是严格USDT拒绝守卫', () => {
    assertHelperImport(crypto);
    const type = required(getUsdt.type, 'getUsdtEntry return type');
    expect(ts.isUnionTypeNode(type)).toBe(true);
    if (!ts.isUnionTypeNode(type)) throw new Error('Expected nullable HistoryEntry');
    expect(type.types.map(n => n.getText())).toEqual(['HistoryEntry', 'null']);
    const guard = required(getUsdt.body?.statements[0], 'first guard');
    expect(ts.isIfStatement(guard)).toBe(true);
    if (!ts.isIfStatement(guard)) throw new Error('Expected first-statement guard');
    const condition = unwrap(guard.expression);
    expect(ts.isPrefixUnaryExpression(condition) && condition.operator).toBe(ts.SyntaxKind.ExclamationToken);
    if (!ts.isPrefixUnaryExpression(condition) || !helperCall(condition.operand)) throw new Error('Expected !isWalletFlowCurrency');
    expect(condition.operand.arguments.map(n => n.getText())).toEqual(['item', '"USDT"']);
    const returns = nodes(guard.thenStatement, ts.isReturnStatement);
    expect(returns).toHaveLength(1);
    expect(returns[0].expression?.kind).toBe(ts.SyntaxKind.NullKeyword);
    for (const read of nodes(getUsdt, ts.isPropertyAccessExpression).filter(n => ['item.amount', 'item.balanceAfter'].includes(n.getText()))) {
      expect(read.getStart()).toBeGreaterThan(guard.end);
    }
    expect(required(nodes(getUsdt, ts.isCallExpression).find(n => n.expression.getText() === 'cleanNote'), 'cleanNote call').getStart())
      .toBeGreaterThan(guard.end);
  });
  it('allEntries的真实usdt管道map(getUsdtEntry)后过滤null并可运行截图fixture', () => {
    const usdt = initializer(initializer(crypto, 'allEntries'), 'usdt');
    const filters = filterCalls(usdt);
    expect(filters).toHaveLength(1);
    const fn = callback(filters[0]);
    if (ts.isBlock(fn.body)) throw new Error('Expected null filter expression');
    expect(ts.isBinaryExpression(fn.body) && fn.body.operatorToken.kind).toBe(ts.SyntaxKind.ExclamationEqualsEqualsToken);
    if (!ts.isBinaryExpression(fn.body)) throw new Error('Expected entry !== null');
    expect(fn.body.left.getText()).toBe(fn.parameters[0].name.getText());
    expect(fn.body.right.kind).toBe(ts.SyntaxKind.NullKeyword);
    const access = filters[0].expression;
    if (!ts.isPropertyAccessExpression(access)) throw new Error('Expected chained filter');
    expect(ts.isCallExpression(access.expression) && access.expression.expression.getText()).toMatch(/\.map$/);
    expect(nodes(access.expression, ts.isCallExpression).some(n => n.expression.getText() === 'getUsdtEntry')).toBe(true);
    const result = expressionValue<Entry[]>(usdt, { usdtHistoryQuery: { data: screenshotFixtures }, getUsdtEntry });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ assetCode: 'USDT', amount: -7.313433, balanceAfter: 15.93 });
  });
  it.each([
    ['WalletTransactions', transactions, 'allItems', 'historyQuery'],
    ['RechargeHistory', recharge, 'afData', 'afHistoryQuery'],
  ] as const)('%s直接对接口数据严格filter真实helper，再交给UI', (_name, ast, name, query) => {
    assertHelperImport(ast);
    const expr = initializer(ast, name);
    const filters = filterCalls(expr);
    expect(filters).toHaveLength(1);
    assertStrictUsdtFilter(filters[0]);
    expect(sourceProperties(filters[0].expression)).toContain(`${query}.data`);
    const result = expressionValue<Flow[]>(expr, { [query]: { data: [...screenshotFixtures, unknownFlow] }, isWalletFlowCurrency });
    expect(result).toEqual([oldUsdt]);
    expect(result[0]).toBe(oldUsdt);
    expect(expressionValue<Flow[]>(expr, { [query]: { data: undefined }, isWalletFlowCurrency })).toEqual([]);
    expect(JSON.stringify(screenshotFixtures)).toBe(originalScreenshot);
  });
  it('Wallet recentUsdtTx四处真实源filter均为强制helper而非!=CNY宽松排除', () => {
    assertHelperImport(wallet);
    expect(walletCurrencyFilters).toHaveLength(4);
    const sources = walletCurrencyFilters.map(call => {
      assertStrictUsdtFilter(call);
      const access = call.expression;
      if (!ts.isPropertyAccessExpression(access)) throw new Error('Expected source filter');
      return sourceProperties(access.expression).filter(n => n.endsWith('.data'));
    });
    expect(sources).toEqual([
      ['ledger52UsdtHistoryQuery.data'], ['recentManualQuery.data'],
      ['recentManualQuery.data'], ['recentBalanceHistoryQuery.data'],
    ]);
    for (const call of walletCurrencyFilters) {
      const predicate = expressionValue<(item: Flow) => boolean>(callback(call), { isWalletFlowCurrency });
      const result = [...screenshotFixtures, unknownFlow].filter(predicate);
      expect(result).toEqual([oldUsdt]);
      expect(result[0]).toBe(oldUsdt);
    }
  });
  it('Wallet全局回退仍排除base/本金迁移，balance_history仍只保留consume/refund', () => {
    const fallback = required(walletCurrencyFilters[1], 'global manual fallback');
    const startsWith = nodes(callback(fallback), ts.isCallExpression).filter(n => ts.isPropertyAccessExpression(n.expression)
      && n.expression.name.text === 'startsWith');
    expect(startsWith.map(n => n.arguments[0].getText())).toEqual(['"[BALANCE_BASE]"', '"[AF52本金冻结迁移-"']);
    const predicate = expressionValue<(item: Flow) => boolean>(callback(fallback), { isWalletFlowCurrency });
    expect(predicate(oldUsdt)).toBe(true);
    for (const note of ['[BALANCE_BASE] 期初', '[AF52本金冻结迁移-123] 迁移']) {
      expect(predicate({ ...oldUsdt, note })).toBe(false);
    }
    const historyPredicate = expressionValue<(item: Flow) => boolean>(callback(walletCurrencyFilters[3]), { isWalletFlowCurrency });
    expect(historyPredicate({ ...oldUsdt, type: 'consume' })).toBe(true);
    expect(historyPredicate({ ...oldUsdt, type: 'refund' })).toBe(true);
    expect(historyPredicate({ ...oldUsdt, type: 'reward' })).toBe(false);
    expect(historyPredicate({ ...oldUsdt, currency: 'CNY', type: 'consume' })).toBe(false);
    expect(historyPredicate({ ...oldUsdt, currency: 'UNKNOWN', type: 'refund' })).toBe(false);
  });
  it('UI仍显示USDT/entry.assetCode，但消费的是前面已严格守卫的管道', () => {
    const itemMaps = nodes(transactions, ts.isCallExpression).filter(n => n.expression.getText() === 'filteredItems.map');
    expect(itemMaps).toHaveLength(2);
    expect(sourceProperties(initializer(transactions, 'filteredItems'))).toContain('allItems.filter');
    for (const map of itemMaps) {
      expect(map.getStart()).toBeGreaterThan(initializer(transactions, 'allItems').end);
      expect(nodes(map, ts.isJsxText).some(n => n.text.trim() === 'USDT')).toBe(true);
      expect(nodes(map, ts.isCallExpression).some(n => n.expression.getText() === 'amt.toFixed')).toBe(true);
    }
    const afMap = required(nodes(recharge, ts.isCallExpression).find(n => ts.isPropertyAccessExpression(n.expression)
      && n.expression.name.text === 'map' && sourceProperties(n.expression).some(text => text.includes('afData'))), 'AF UI map');
    expect(afMap.getStart()).toBeGreaterThan(initializer(recharge, 'afData').end);
    const amountDisplay = initializer(afMap, 'amtDisplay');
    expect(ts.isTemplateExpression(amountDisplay)).toBe(true);
    if (!ts.isTemplateExpression(amountDisplay)) throw new Error('Expected production USDT amount template');
    expect(amountDisplay.templateSpans.at(-1)?.literal.text.trim()).toBe('USDT');
    const entryReturn = required(nodes(getUsdt, ts.isReturnStatement).find(n => n.expression && ts.isObjectLiteralExpression(n.expression)), 'USDT entry object');
    expect(required(nodes(entryReturn, ts.isPropertyAssignment).find(n => n.name.getText() === 'assetCode'), 'USDT assetCode').initializer.getText()).toBe('"USDT"');
    expect(nodes(crypto, ts.isJsxExpression).some(n => n.expression?.getText() === 'entry.assetCode')).toBe(true);
    const digital = initializer(wallet, 'allRecentDigitalTx');
    const usdtMap = required(nodes(digital, ts.isCallExpression).find(n => n.expression.getText() === 'recentUsdtTx.map'), 'recent USDT UI map');
    expect(usdtMap.getStart()).toBeGreaterThan(recentUsdt.end);
    expect(required(nodes(usdtMap, ts.isPropertyAssignment).find(n => n.name.getText() === 'assetCode'), 'recent USDT unit').initializer.getText()).toBe('"USDT"');
  });
});
