import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { getWalletFlowCurrency, isWalletFlowCurrency, type WalletFlowCurrencySource } from '../shared/wallet-flow-currency';
import { selectWalletAccountByLatestFlow } from '../client/src/lib/walletAccountSelection';

// 仅导入真实纯 helper；生产 DB/路由/React 模块均不导入、不连接、不初始化。
// 从源码 AST 抽取函数/表达式在 VM 运行，execute 仅接受 SELECT，fixtures 不替代生产数据。
type Flow = WalletFlowCurrencySource & Record<string, any>;
function parse(path: string) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function initializer(root: ts.Node, name: string): ts.Expression {
  return required(nodes(root, ts.isVariableDeclaration).find(n => n.name.getText() === name)?.initializer, name);
}
function declaration(root: ts.Node, name: string): ts.FunctionDeclaration {
  return required(nodes(root, ts.isFunctionDeclaration).find(n => n.name?.text === name), name);
}
function evaluate<T>(source: string, bindings: Record<string, unknown>): T {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
function value<T>(expression: ts.Expression, bindings: Record<string, unknown>): T {
  return evaluate<T>(`(${expression.getText()})`, bindings);
}
const helpers = { getWalletFlowCurrency, isWalletFlowCurrency };
function hasHelperImport(ast: ts.SourceFile, names: string[]) {
  const imports = nodes(ast, ts.isImportDeclaration).filter(n => ts.isStringLiteral(n.moduleSpecifier)
    && /(?:@shared|\.\.\/shared)\/wallet-flow-currency$/.test(n.moduleSpecifier.text));
  expect(imports).toHaveLength(1);
  const imported = nodes(imports[0], ts.isImportSpecifier).map(n => n.name.text);
  for (const name of names) expect(imported).toContain(name);
}
function helperCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && node.expression.getText() === 'isWalletFlowCurrency';
}
function filters(root: ts.Node): ts.CallExpression[] {
  return nodes(root, ts.isCallExpression).filter(n => ts.isPropertyAccessExpression(n.expression)
    && n.expression.name.text === 'filter');
}
function arrow(call: ts.CallExpression): ts.ArrowFunction {
  const fn = required(call.arguments[0], 'callback');
  if (!ts.isArrowFunction(fn)) throw new Error('Expected production arrow callback');
  return fn;
}
function assertStrictUsdt(call: ts.CallExpression) {
  const fn = arrow(call);
  if (ts.isBlock(fn.body)) throw new Error('Expected expression currency guard');
  let first = fn.body;
  while (ts.isParenthesizedExpression(first)) first = first.expression;
  while (ts.isBinaryExpression(first) && first.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    first = first.left;
  }
  expect(helperCall(first)).toBe(true);
  if (!helperCall(first)) throw new Error('Currency guard must be mandatory, never an OR bypass');
  expect(first.arguments[0].getText()).toBe(fn.parameters[0].name.getText());
  expect(ts.isStringLiteral(first.arguments[1]) && first.arguments[1].text).toBe('USDT');
}
function properties(root: ts.Node) {
  return nodes(root, ts.isPropertyAccessExpression).map(n => n.getText());
}
const dbAst = parse('./db-recharge.ts');
const routerAst = parse('./routers.ts');
const rechargeAst = parse('../client/src/pages/Recharge.tsx');
const snapshotAst = parse('../client/src/components/ReadonlyWalletSnapshot.tsx');
const yabanAst = parse('../client/src/pages/yaban/YabanWallet.tsx');
const historyFn = declaration(dbAst, 'getUserBalanceHistory');
const cnyFn = declaration(dbAst, 'getUserCnyHistory');
const afProperty = required(nodes(routerAst, ts.isPropertyAssignment)
  .find(n => n.name.getText() === 'afGetMyRechargeHistory'), 'afGetMyRechargeHistory');
const afQuery = required(nodes(afProperty, ts.isCallExpression).find(n => ts.isPropertyAccessExpression(n.expression)
  && n.expression.name.text === 'query'), 'AF query');
const afFn = arrow(afQuery);
const time = (day: number) => `2026-11-${String(day).padStart(2, '0')}T00:00:00Z`;
const cny: readonly Flow[] = Object.freeze([
  Object.freeze({ id: 101, currency: ' cny ', amount: '1862', type: 'reward', note: '人民币入账', description: '人民币入账', createdAt: time(2) }),
  Object.freeze({ id: 102, currency: 'CNY', amount: '-49', type: 'consume', note: '人民币支出1', description: '人民币支出1', createdAt: time(3) }),
  Object.freeze({ id: 103, currency: null, amount: '-49', type: 'consume', note: ' [cNy] 人民币支出2', description: ' [cNy] 人民币支出2', createdAt: time(5) }),
  Object.freeze({ id: 104, amount: '-49', type: 'consume', note: '[CNY] 人民币支出3', description: '[CNY] 人民币支出3', createdAt: time(7) }),
  Object.freeze({ id: 105, amount: '-49', type: 'consume', note: '[CNY] 人民币支出4', description: '[CNY] 人民币支出4', createdAt: time(9) }),
]);
const oldUsdt: Flow = Object.freeze({
  id: 2, currency: null, amount: '-7.31343284', type: 'consume',
  description: '旧USDT扣款≈49元（≃49CNY）', note: '旧USDT扣款≈49元（≃49CNY）', createdAt: time(4), balanceAfter: '15.93',
});
const credit: Flow = Object.freeze({ id: 1, currency: ' usdt ', amount: '23.24343284', type: 'recharge', createdAt: time(1) });
const unknown: Flow = Object.freeze({ id: 999, currency: 'ETH', amount: '999999', type: 'consume', description: '[CNY] 未知资产', note: '[CNY] 未知资产', createdAt: time(10) });
const manualUsdt: Flow = Object.freeze({ id: 3, amount: '2', note: '普通USDT调账', createdAt: time(6) });
const asManual = (item: Flow) => ({ ...item, created_at: item.createdAt, ledger_id: 52 });
const fixtureBefore = JSON.stringify([cny, oldUsdt, credit, unknown, manualUsdt]);

async function runHistory(bh: readonly Flow[], manual: readonly Flow[], limit = 50) {
  const calls: string[] = [];
  const execute = async (sql: string, args: unknown[]) => {
    expect(sql.trim()).toMatch(/^SELECT\b/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
    expect(args).toEqual([77]);
    expect(sql).not.toMatch(/\bLIMIT\b/i); // 所有历史先分流、累计，再截断。
    calls.push(sql);
    if (/FROM balance_history\b/i.test(sql)) {
      expect(sql.split(/\bFROM\b/i)[0]).toMatch(/\bcurrency\b/i);
      expect(sql.split(/\bFROM\b/i)[0]).toMatch(/\bdescription\b/i);
      return [bh];
    }
    if (/FROM af_manual_balances\b/i.test(sql)) {
      expect(sql.split(/\bFROM\b/i)[0]).toMatch(/\bnote\b/i);
      expect(sql).toContain('[AF52本金冻结迁移-');
      return [manual];
    }
    throw new Error(`Unexpected read-only query: ${sql}`);
  };
  const fn = evaluate<(userId: number, limit: number) => Promise<Flow[]>>(
    `${historyFn.getText().replace(/^export\s+/, '')}\ngetUserBalanceHistory;`, {
      ...helpers, getDbConnection: async () => ({ execute }),
    });
  const rows = await fn(77, limit);
  expect(calls).toHaveLength(2);
  return rows;
}
async function runAf(bh: readonly Flow[], manual: readonly Flow[]) {
  const calls: string[] = [];
  const fn = value<(arg: { ctx: { user: { id: number } }; input: Record<string, unknown> }) => Promise<Flow[]>>(afFn, {
    ...helpers,
    // 仅把 Drizzle 的真实 tagged template 转成只读字符串，不加载 Drizzle/连接模块。
    sql: (parts: TemplateStringsArray, ...args: unknown[]) => parts.reduce((s, part, i) => s + part + (i < args.length ? '?' : ''), ''),
    getLedgerDb: async () => ({ execute: async (sql: string) => {
      expect(sql.trim()).toMatch(/^SELECT\b/i);
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
      calls.push(sql);
      if (/FROM recharge_orders r\b/i.test(sql)) return [[]];
      if (/FROM af_manual_balances m\b/i.test(sql)) {
        expect(sql.split(/\bFROM\b/i)[0]).toMatch(/m\.note/);
        return [manual.map(asManual)];
      }
      if (/FROM ai_wallet_project_holds h\b/i.test(sql)) return [[]];
      if (/FROM ai_wallet_project_hold_releases r\b/i.test(sql)) return [[]];
      if (/FROM balance_history\b/i.test(sql)) {
        expect(sql.split(/\bFROM\b/i)[0]).toMatch(/\bcurrency\b/i);
        expect(sql).toContain("'CNY'");
        return [bh.map(r => ({ ...r, created_at: r.createdAt, related_id: r.relatedId }))];
      }
      throw new Error(`Unexpected AF SELECT: ${sql}`);
    } }),
  });
  const rows = await fn({ ctx: { user: { id: 77 } }, input: {} });
  expect(calls).toHaveLength(5);
  return rows;
}

describe('扩展后端：抽取真实 getUserBalanceHistory + SELECT-only mock', () => {
  it('bh/manual 使用真实字段 helper 分流，且在去重/合并/正序余额/limit 之前', () => {
    hasHelperImport(dbAst, ['getWalletFlowCurrency', 'isWalletFlowCurrency']);
    for (const name of ['bhList', 'manualList']) {
      const expr = initializer(historyFn, name);
      const guard = filters(expr).filter(n => nodes(arrow(n), helperCall).length > 0);
      expect(guard).toHaveLength(1);
      assertStrictUsdt(guard[0]);
      expect(nodes(expr, ts.isCallExpression).some(n => n.expression.getText() === 'getWalletFlowCurrency')).toBe(true);
      expect(expr.end).toBeLessThan(initializer(historyFn, 'manualTimes').getStart());
      expect(expr.end).toBeLessThan(initializer(historyFn, 'allRows').getStart());
    }
    expect(properties(initializer(historyFn, 'bhList'))).toEqual(expect.arrayContaining(['r.currency', 'r.description']));
    expect(properties(initializer(historyFn, 'manualList'))).toContain('r.note');
  });
  it('CNY +1862 -49×4 和未知资产不混入USDT累计，旧等值说明保留-7.31343284', async () => {
    const rows = await runHistory([credit, cny[0], cny[1], oldUsdt, cny[2], unknown], [manualUsdt, cny[3], cny[4]]);
    expect(rows.map(r => r.id)).toEqual(['manual-3', 'bh-2', 'bh-1']);
    expect(rows.map(r => r.currency)).toEqual(['USDT', 'USDT', 'USDT']);
    expect(rows.map(r => r.balance)).toEqual([17.93, 15.93, 23.24]);
    expect(rows[1].amount).toBe(-7.31343284);
    expect(rows[1].description).toBe(oldUsdt.description);
    expect(JSON.stringify([cny, oldUsdt, credit, unknown, manualUsdt])).toBe(fixtureBefore);
  });
  it('limit 最后生效，最新CNY/未知记录不占USDT名额，截断不重置历史余额', async () => {
    const bh = [credit, oldUsdt, cny[0], cny[1], cny[2], unknown];
    const manual = [manualUsdt, cny[3], cny[4]];
    const full = await runHistory(bh, manual);
    expect(await runHistory(bh, manual, 1)).toEqual(full.slice(0, 1));
    expect(await runHistory(bh, manual, 2)).toEqual(full.slice(0, 2));
    expect(full[0].balance).toBe(17.93);
  });
  it('仅CNY/老NULL+[CNY]/未知资产时USDT为空，无伪造币种和余额', async () => {
    expect(await runHistory([...cny.slice(0, 3), unknown], cny.slice(3))).toEqual([]);
  });
  it('同币提现同秒同金额的bh/manual重复仍只保留手动冻结一笔', async () => {
    const rows = await runHistory([
      { ...credit, amount: '100' },
      { id: 11, currency: 'USDT', amount: '-10', type: 'withdraw', relatedId: 90, description: '提现申请', createdAt: time(4) },
    ], [{ id: 12, amount: '-10', note: '提现申请冻结 #90', createdAt: time(4) }]);
    expect(rows.map(r => r.id)).toEqual(['manual-12', 'bh-1']);
    expect(rows[0].balance).toBe(90);
  });
  it('CNY同秒同金额手动记录不能吞掉USDT提现事件', async () => {
    const rows = await runHistory([
      { ...credit, amount: '100' },
      { id: 11, currency: 'USDT', amount: '-10', type: 'withdraw', relatedId: 90, description: '提现申请', createdAt: time(4) },
    ], [{ id: 12, amount: '-10', note: '[CNY] 同秒独立支出', createdAt: time(4) }]);
    expect(rows.map(r => r.id)).toEqual(['bh-11', 'bh-1']);
    expect(rows[0]).toMatchObject({ amount: -10, currency: 'USDT', balance: 90 });
  });
});

describe('扩展统一接口：保留混币事实，真实 mapper 与币种独立余额', () => {
  it('真实query不全部过滤USDT，CNY五笔完整保留且旧NULL标记归一到CNY', async () => {
    hasHelperImport(routerAst, ['getWalletFlowCurrency']);
    for (const name of ['allBh']) {
      expect(nodes(initializer(afFn, name), ts.isCallExpression)
        .some(n => n.expression.getText() === 'getWalletFlowCurrency')).toBe(true);
    }
    const manualMaps = nodes(afFn, ts.isBinaryExpression).filter(n => n.left.getText() === 'manualList'
      && n.operatorToken.kind === ts.SyntaxKind.EqualsToken);
    expect(manualMaps).toHaveLength(1);
    expect(nodes(manualMaps[0], ts.isCallExpression).some(n => n.expression.getText() === 'getWalletFlowCurrency')).toBe(true);
    expect(properties(manualMaps[0])).toContain('r.note');
    const rows = await runAf([credit, oldUsdt, ...cny.slice(0, 3)], [manualUsdt, ...cny.slice(3)]);
    const cnyRows = rows.filter(r => r.currency === 'CNY').reverse();
    expect(cnyRows.map(r => r.amount)).toEqual([1862, -49, -49, -49, -49]);
    expect(cnyRows.map(r => r.balanceAfter)).toEqual([1862, 1813, 1764, 1715, 1666]);
    expect(rows.filter(r => r.currency === 'USDT').map(r => r.balanceAfter)).toEqual([17.93, 15.93, 23.24343284]);
    expect(rows.find(r => r.id === 'bh_2')).toMatchObject({ currency: 'USDT', amount: -7.31343284, note: oldUsdt.description });
  });
  it('统一接口同秒同金额CNY手动与USDT历史都是独立事件', async () => {
    const rows = await runAf([{ id: 31, currency: 'USDT', amount: '-10', type: 'consume', description: 'USDT支出', createdAt: time(4) }],
      [{ id: 32, amount: '-10', note: '[CNY] 同秒独立支出', createdAt: time(4) }]);
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.currency === 'USDT')).toMatchObject({ id: 'bh_31', balanceAfter: -10 });
    expect(rows.find(r => r.currency === 'CNY')).toMatchObject({ id: 'm_32', balanceAfter: -10 });
  });
  it('CNY旧NULL迁移副本仍排除，普通老NULL[CNY]记录仍保留', async () => {
    const rows = await runAf([
      { id: 41, currency: null, amount: '49', type: 'reward', description: '[CNY] 旧入账', createdAt: time(2) },
      { id: 42, currency: null, amount: '49', type: 'reward', description: '[CNY] [迁移自af_manual_balances id=43]', createdAt: time(3) },
    ], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'bh_41', currency: 'CNY', amount: 49, balanceAfter: 49 });
  });
});

// 只抽取 CNY 的 balance_history SQL WHERE；将其有限且明确的 SQL 原子转成可执行布尔表达式。
// 不执行 getUserCnyHistory（包含 ensure），不连接 SQLite/MySQL，不复制一个测试自制币种判断。
function cnySqlPredicate(): (row: Flow) => boolean {
  const execute = required(nodes(cnyFn, ts.isCallExpression).find(n => n.expression.getText() === 'conn.execute'), 'CNY SELECT');
  const sql = value<string>(required(execute.arguments[0], 'CNY SQL'), { safeLimit: 50, safeOffset: 0, flowCondition: '', sourceUnion: '' });
  const where = required(sql.match(/FROM balance_history h\s+WHERE ([\s\S]*?)\s+UNION ALL/i)?.[1], 'CNY bh WHERE');
  expect(where).toContain("COALESCE(h.description, '') NOT LIKE '%[迁移自af_manual_balances id=%'");
  let expression = where.replace(/h\.user_id\s*=\s*\?/, 'row.userId === 77')
    .replace(/UPPER\(TRIM\(h\.currency\)\)\s*=\s*'CNY'/, "upper(trim(row.currency)) === 'CNY'")
    .replace(/h\.currency IS NULL/, 'row.currency == null')
    .replace(/TRIM\(h\.currency\)\s*=\s*''/, "trim(row.currency) === ''")
    .replace(/LTRIM\(COALESCE\(h\.description,\s*''\)\)\s+LIKE\s+'([^']+)'/, (_m, pattern) => `like(ltrim(coalesce(row.description)), ${JSON.stringify(pattern)})`)
    .replace(/COALESCE\(h\.description,\s*''\)\s+NOT LIKE\s+'([^']+)'/, (_m, pattern) => `!like(coalesce(row.description), ${JSON.stringify(pattern)})`)
    .replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||');
  expect(expression).not.toMatch(/\bh\.|\b(?:LIKE|COALESCE|TRIM|UPPER|IS NULL)\b/);
  return evaluate<(row: Flow) => boolean>(`(row => (${expression}))`, {
    upper: (s: string | null) => s == null ? null : s.toUpperCase(),
    trim: (s: unknown) => s == null ? null : String(s).replace(/^ +| +$/g, ''),
    ltrim: (s: string) => s.replace(/^ +/g, ''),
    coalesce: (s: unknown) => String(s ?? ''),
    like: (s: string, pattern: string) => new RegExp('^' + pattern.split('%')
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(s),
  });
}
describe('独立CNY SQL的缺字段兼容不绕过迁移排除（无ensure执行）', () => {
  it('真实WHERE支持trim大小写CNY及NULL/空currency+[CNY]，不吸入明确USDT/未知', () => {
    const predicate = cnySqlPredicate();
    for (const row of [
      { currency: ' cNy ', description: '普通入账' },
      { currency: null, description: '  [CNY] 旧记录' },
      { currency: '', description: '[cNy] 旧记录' },
      { currency: '  ', description: '[CNY] 旧记录' },
    ]) expect(predicate({ ...row, userId: 77 })).toBe(true);
    for (const row of [
      { currency: 'USDT', description: '[CNY] 仅参考' },
      { currency: 'UNKNOWN', description: '[CNY] 仅参考' },
      { currency: null, description: '旧USDT≈49元≃49CNY' },
      { currency: null, description: '说明 [CNY]' },
      { currency: 'CNY', description: '他人记录', userId: 78 },
    ]) expect(predicate({ userId: 77, ...row })).toBe(false);
  });
  it('迁移排除作用于明确CNY和缺字段兼容两分支，而不是只排除其中之一', () => {
    const predicate = cnySqlPredicate();
    for (const currency of ['CNY', ' cny ', null, '', ' ']) {
      expect(predicate({ userId: 77, currency, description: '[CNY] [迁移自af_manual_balances id=43]' })).toBe(false);
      expect(predicate({ userId: 77, currency, description: '[CNY] 正常独立记录' })).toBe(true);
    }
  });
});

const ledgerList = initializer(rechargeAst, 'ledgerHistoryList');
const ledgerMap = required(nodes(rechargeAst, ts.isCallExpression).find(n => ts.isPropertyAccessExpression(n.expression)
  && n.expression.name.text === 'map' && properties(n.expression).includes('sorted.slice')), 'Recharge sorted map');
const ledgerRow = arrow(ledgerMap);
if (!ts.isBlock(ledgerRow.body)) throw new Error('Expected Recharge row statements');
const rowStatements = ledgerRow.body.statements.filter(n => !ts.isReturnStatement(n)).map(n => n.getText()).join('\n');
const rowBalance = evaluate<(item: Flow, i?: number) => { balanceAfter: number | null; showBalance: boolean; amt: number }>(
  `(function(item, i = 0) { ${rowStatements}\nreturn { balanceAfter, showBalance, amt }; })`, {});

describe('Recharge AST真实列表与余额快照展示', () => {
  it('ledgerHistoryList实际filter真实helper，仅保留USDT而不mutate/换算', () => {
    hasHelperImport(rechargeAst, ['isWalletFlowCurrency']);
    const calls = filters(ledgerList);
    expect(calls).toHaveLength(1);
    assertStrictUsdt(calls[0]);
    // helper参数由AST验证，源必须为真实接口变量，而非旁路的测试专用数组。
    expect(nodes(ledgerList, ts.isIdentifier).some(n => n.text === 'ledgerHistoryData')).toBe(true);
    const rows = value<Flow[]>(ledgerList, { ledgerHistoryData: [...cny, oldUsdt, unknown], ...helpers });
    expect(rows).toEqual([oldUsdt]);
    expect(rows[0]).toBe(oldUsdt);
    expect(value<Flow[]>(ledgerList, { ledgerHistoryData: undefined, ...helpers })).toEqual([]);
  });
  it('UI不再runningBalance累计，直接item.balanceAfter；有效零值和金额保持原值', () => {
    expect(nodes(rechargeAst, ts.isIdentifier).some(n => n.text === 'runningBalance')).toBe(false);
    expect(properties(initializer(ledgerRow, 'balanceAfter'))).toContain('item.balanceAfter');
    expect(rowBalance(oldUsdt)).toEqual({ amt: -7.31343284, balanceAfter: 15.93, showBalance: true });
    expect(rowBalance({ amount: '999', balanceAfter: 0 })).toMatchObject({ balanceAfter: 0, showBalance: true });
    expect(rowBalance({ amount: '999', balanceAfter: '17.93' })).toMatchObject({ balanceAfter: 17.93, showBalance: true });
    const displayGuard = nodes(ledgerRow, ts.isBinaryExpression).filter(n => n.left.getText() === 'showBalance'
      && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken);
    expect(displayGuard).toHaveLength(1);
    expect(properties(displayGuard[0]).some(text => text.includes('toLocaleString'))).toBe(true);
  });
  it('undefined/null/非有限余额不展示，wallet_hold缺快照不会拿金额造零或累计余额', () => {
    for (const balanceAfter of [undefined, null, 'invalid', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rowBalance({ amount: '-100', balanceAfter }).showBalance).toBe(false);
      expect(rowBalance({ amount: '-100', balanceAfter, sourceType: 'wallet_hold' }).showBalance).toBe(false);
    }
    expect(rowBalance({ amount: '-100', sourceType: 'wallet_hold', balanceAfter: null })).toEqual({ amt: -100, balanceAfter: null, showBalance: false });
    expect(rowBalance({ amount: '100', sourceType: 'wallet_hold', type: 'principal_hold_release' })).toEqual({ amt: 100, balanceAfter: null, showBalance: false });
  });
});

describe('ReadonlyWalletSnapshot两处真实filter与usdtFlows链', () => {
  it('默认账户选择先过滤balanceHistory，较新的CNY不伪装成数字币；CNY独立历史不丢失', () => {
    hasHelperImport(snapshotAst, ['isWalletFlowCurrency']);
    const balanceFilters = filters(snapshotAst).filter(n => properties(n.expression).includes('snapshot?.balanceHistory'));
    expect(balanceFilters).toHaveLength(2);
    balanceFilters.forEach(assertStrictUsdt);
    const accountCall = required(nodes(snapshotAst, ts.isCallExpression)
      .find(n => n.expression.getText() === 'selectWalletAccountByLatestFlow'), 'default account');
    const snapshot = { balanceHistory: [...cny, oldUsdt, unknown], cnyHistory: cny, multiAssetHistory: [] };
    expect(value(accountCall, { snapshot, isWalletFlowCurrency, selectWalletAccountByLatestFlow })).toBe('CNY');
    expect(value(accountCall, { snapshot: { balanceHistory: cny, cnyHistory: cny }, isWalletFlowCurrency, selectWalletAccountByLatestFlow })).toBe('CNY');
    expect(value(accountCall, { snapshot: undefined, isWalletFlowCurrency, selectWalletAccountByLatestFlow })).toBe('CRYPTO');
    expect(value<Flow[]>(initializer(snapshotAst, 'cnyFlows'), { snapshot })).toEqual(cny);
  });
  it('实际usdtFlows在map强制assetCode前过滤；allFlows保留真正多资产来源但不混入CNY/未知bh', () => {
    const expr = initializer(snapshotAst, 'usdtFlows');
    const guards = filters(expr);
    expect(guards).toHaveLength(1);
    assertStrictUsdt(guards[0]);
    if (!ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression)) throw new Error('Expected actual filter.map chain');
    expect(expr.expression.name.text).toBe('map');
    expect(expr.expression.expression).toBe(guards[0]);
    const snapshot = { balanceHistory: [...cny, oldUsdt, unknown] };
    const usdtFlows = value<Flow[]>(expr, { snapshot, isWalletFlowCurrency });
    expect(usdtFlows).toEqual([{ ...oldUsdt, assetCode: 'USDT', flowType: 'usdt' }]);
    expect(usdtFlows[0].amount).toBe('-7.31343284');
    expect(usdtFlows[0].balanceAfter).toBe('15.93');
    const multiHistory = [{ id: 'btc', assetCode: 'BTC', amount: '0.1', eventType: 'transfer_in', createdAt: time(8) }];
    const allFlows = value<Flow[]>(initializer(snapshotAst, 'allFlows'), { usdtFlows, multiHistory });
    expect(allFlows.map(r => r.assetCode)).toEqual(['BTC', 'USDT']);
    expect(value<Flow[]>(expr, { snapshot: undefined, isWalletFlowCurrency })).toEqual([]);
    expect(JSON.stringify([cny, oldUsdt, credit, unknown, manualUsdt])).toBe(fixtureBefore);
  });
});

describe('牙伴真实manual/consume/refund币种过滤', () => {
  it('两处filter均mandatory helper；consume/refund类型限制不被币种修复扩大', () => {
    hasHelperImport(yabanAst, ['isWalletFlowCurrency']);
    const chain = initializer(yabanAst, 'recentUsdtTx');
    const manual = filters(initializer(chain, 'manuals'));
    const history = filters(initializer(chain, 'balanceHistoryItems'));
    expect(manual).toHaveLength(1);
    expect(history).toHaveLength(1);
    [...manual, ...history].forEach(assertStrictUsdt);
    const predicate = value<(flow: Flow) => boolean>(arrow(history[0]), { isWalletFlowCurrency });
    expect(predicate({ ...oldUsdt, type: 'consume' })).toBe(true);
    expect(predicate({ ...oldUsdt, type: 'refund' })).toBe(true);
    for (const type of ['reward', 'commission', 'withdraw', 'recharge']) expect(predicate({ ...oldUsdt, type })).toBe(false);
    for (const item of [...cny, unknown]) {
      expect(predicate({ ...item, type: 'consume' })).toBe(false);
      expect(predicate({ ...item, type: 'refund' })).toBe(false);
    }
  });
  it('执行recentUsdtTx实际合并排序slice；更新的CNY/未知不会挤掉USDT，金额只保留既有绝对值展示', () => {
    const extractWcTeamCode = evaluate<(note: string) => string | null>(
      `${declaration(yabanAst, 'extractWcTeamCode').getText()}\nextractWcTeamCode;`, {});
    const rows = value<Flow[]>(initializer(yabanAst, 'recentUsdtTx'), {
      isWalletFlowCurrency, extractWcTeamCode,
      recentRechargeQuery: { data: [] }, recentWithdrawQuery: { data: [] },
      recentManualQuery: { data: [...cny.map(asManual), asManual(unknown), asManual(manualUsdt)] },
      recentBalanceHistoryQuery: { data: [...cny, unknown, oldUsdt, { ...oldUsdt, id: 6, type: 'refund', amount: '1.5', createdAt: time(1) }] },
    });
    expect(rows.map(r => r.id)).toEqual(['m-3', 'bh-2', 'bh-6']);
    expect(rows.map(r => r.amount)).toEqual([2, 7.31343284, 1.5]);
    expect(rows[1].note).toBe(oldUsdt.description);
    expect(JSON.stringify([cny, oldUsdt, credit, unknown, manualUsdt])).toBe(fixtureBefore);
  });
});
