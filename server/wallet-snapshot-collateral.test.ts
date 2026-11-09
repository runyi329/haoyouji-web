import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  buildWalletDigitalAssets,
  formatDigitalAssetAmount,
  getDigitalAssetDisplayDigits,
  type WalletBalanceSummary,
  type WalletDigitalAsset,
} from '../client/src/lib/walletDigitalAssets';

// 只导入生产纯 helper；React、路由、数据库和价格服务均不加载。
// AST 抽出的生产表达式/查询在限时 VM 中运行；SQL 只进入 SELECT-only fixture 拦截器。
// 单元测试 fixtures 不替换生产接口数据，不执行任何 ensure/迁移/资金写入。
function parse(path: string): ts.SourceFile {
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
function evaluate<T>(source: string, bindings: Record<string, unknown> = {}): T {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
      jsx: ts.JsxEmit.React, jsxFactory: '__element', jsxFragmentFactory: '__fragment',
    },
    transformers: { before: [context => root => {
      const visit: ts.Visitor = node => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const module = node.arguments[0];
          // 唯一允许的动态导入也只替换成 VM 显式绑定，不导入真实价格扫描器。
          if (!module || !ts.isStringLiteral(module) || module.text !== './price-scanner') {
            throw new Error('Unexpected dynamic import in isolated production expression');
          }
          return ts.factory.createIdentifier('priceScannerFixture');
        }
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(root, visit) as ts.SourceFile;
    }] },
  });
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
function value<T>(expression: ts.Expression, bindings: Record<string, unknown>): T {
  return evaluate<T>(`(${expression.getText()})`, bindings);
}
function calls(root: ts.Node, name: string): ts.CallExpression[] {
  return nodes(root, ts.isCallExpression).filter(n => n.expression.getText() === name);
}
function propertyName(node: ts.PropertyName): string {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : node.getText();
}
function hasImport(ast: ts.SourceFile, module: string, name: string) {
  const imports = nodes(ast, ts.isImportDeclaration).filter(n => ts.isStringLiteral(n.moduleSpecifier)
    && n.moduleSpecifier.text === module);
  expect(imports).toHaveLength(1);
  expect(nodes(imports[0], ts.isImportSpecifier).map(n => n.name.text)).toContain(name);
}

const walletAst = parse('../client/src/pages/Wallet.tsx');
const snapshotAst = parse('../client/src/components/ReadonlyWalletSnapshot.tsx');
const listAst = parse('../client/src/components/WalletDigitalAssetList.tsx');
const treeAst = parse('../client/src/pages/AfInviteTreePage.tsx');
const routerAst = parse('./routers.ts');
const fundingAst = parse('./ledger37-wallet.ts');
const yjhId = value<number>(initializer(routerAst, 'YJH_USER_ID'), {});
const ledger52 = value<number>(initializer(routerAst, 'LEDGER_52_ID'), {});
const ledger37 = value<number>(initializer(fundingAst, 'LEDGER_37_ID'), {});
const operator37 = value<number>(initializer(fundingAst, 'LEDGER_37_WALLET_OPERATOR_ID'), {});
const oceanSummary: WalletBalanceSummary = Object.freeze({ total: 20686.37, available: 686.37, frozen: 20000 });
const cnySummary: WalletBalanceSummary = Object.freeze({ total: 1862, available: 1662, frozen: 200 });
const holdings = Object.freeze([
  Object.freeze({ assetCode: 'ETH', totalBalance: 20, availableBalance: 18, frozenBalance: 2, priceUsdt: 3000 }),
  Object.freeze({ assetCode: 'SOL', totalBalance: 211, availableBalance: 0, frozenBalance: 211, priceUsdt: 200 }),
  Object.freeze({ assetCode: 'AAVE', totalBalance: 100, availableBalance: 100, frozenBalance: 0, priceUsdt: 120 }),
]);
const originalFixtures = JSON.stringify([oceanSummary, cnySummary, holdings]);

function pageAssets(ast: ts.SourceFile, snapshot: Record<string, unknown>): WalletDigitalAsset[] {
  if (ast === snapshotAst) {
    const bindings: Record<string, unknown> = { snapshot, unifiedPrices: {} };
    bindings.usdtBalance = value(initializer(ast, 'usdtBalance'), bindings);
    bindings.multiAssets = value(initializer(ast, 'multiAssets'), bindings);
    bindings.buildWalletDigitalAssets = buildWalletDigitalAssets;
    return value(initializer(ast, 'digitalAssets'), bindings);
  }
  const bindings: Record<string, unknown> = {
    usdtBalanceSummaryQuery: { data: snapshot.usdtBalanceSummary },
    multiAssetBalancesQuery: { data: snapshot.multiAssetBalances },
    balance: snapshot.usdtBalance ?? 0, unifiedPrices: {}, usdtCnyRate: 7.25, isMibanWalletEntry: false,
    buildWalletDigitalAssets,
  };
  bindings.usdtSummary = value(initializer(ast, 'usdtSummary'), bindings);
  bindings.usdtTotalBalance = value(initializer(ast, 'usdtTotalBalance'), bindings);
  bindings.multiAssetBalances = value(initializer(ast, 'multiAssetBalances'), bindings);
  bindings.visibleMultiAssetBalances = value(initializer(ast, 'visibleMultiAssetBalances'), bindings);
  return value(initializer(ast, 'visibleDigitalAssetBalances'), bindings);
}

describe('真实数字资产 helper：Ocean 分层余额、担保持仓与权威字段', () => {
  it('Ocean USDT 20686.37 = 可用686.37 + 担保20000；ETH/SOL/AAVE 独立保留三层数值', () => {
    const assets = buildWalletDigitalAssets(oceanSummary, holdings, 999999);
    expect(assets.map(a => a.assetCode)).toEqual(['USDT', 'ETH', 'SOL', 'AAVE']);
    expect(assets[0]).toEqual({ assetCode: 'USDT', totalBalance: 20686.37, availableBalance: 686.37, frozenBalance: 20000, priceUsdt: 1 });
    for (const source of holdings) {
      expect(assets.find(a => a.assetCode === source.assetCode)).toEqual(source);
      expect(source.totalBalance).toBe(source.availableBalance + source.frozenBalance);
    }
    expect(oceanSummary.total).toBeCloseTo(oceanSummary.available + oceanSummary.frozen, 8);
  });
  it('USDT 固定首位且大小写/空白重复不覆盖正式 summary；其他币按总额估值降序', () => {
    const assets = buildWalletDigitalAssets(oceanSummary, [
      ...holdings.slice().reverse(),
      { assetCode: ' usdt ', totalBalance: 900000, availableBalance: 900000, priceUsdt: 9 },
      { assetCode: 'UsDt', totalBalance: 1, frozenBalance: 1 },
    ]);
    expect(assets.filter(a => a.assetCode === 'USDT')).toHaveLength(1);
    expect(assets[0].totalBalance).toBe(oceanSummary.total);
    const valuations = assets.slice(1).map(a => a.totalBalance * a.priceUsdt);
    expect(valuations).toEqual(valuations.slice().sort((a, b) => b - a));
    expect(assets.map(a => a.assetCode)).toEqual(['USDT', 'ETH', 'SOL', 'AAVE']);
    const tied = buildWalletDigitalAssets(undefined, [
      { assetCode: ' sol ', totalBalance: 2, priceUsdt: 1 },
      { assetCode: ' aave ', totalBalance: 1, priceUsdt: 2 },
    ]);
    expect(tied.map(a => a.assetCode)).toEqual(['AAVE', 'SOL']);
  });
  it('summary 缺失时仅 fallback 总额，可用/担保必须为null而非伪可用或伪零担保', () => {
    const usdt = buildWalletDigitalAssets(undefined, [], oceanSummary.total)[0];
    expect(usdt).toEqual({ assetCode: 'USDT', totalBalance: 20686.37, availableBalance: null, frozenBalance: null, priceUsdt: 1 });
    expect(buildWalletDigitalAssets(undefined, [{ assetCode: 'USDT', totalBalance: 500 }])).toEqual([]);
  });
  it('明确 total 包括零值优先于 fallback/分层重算；缺失非USDT total 才合并 available+frozen', () => {
    expect(buildWalletDigitalAssets({ total: 0, available: 0, frozen: 0 }, [], 999)).toEqual([]);
    const assets = buildWalletDigitalAssets(undefined, [
      { assetCode: 'ZERO', totalBalance: 0, availableBalance: 10, frozenBalance: 10 },
      { assetCode: 'NEGATIVE', totalBalance: -1, availableBalance: 10 },
      { assetCode: 'EMPTY' },
      { assetCode: 'SOL', availableBalance: 0, frozenBalance: 211, priceUsdt: 200 },
      { assetCode: 'ETH', totalBalance: 20, availableBalance: 999, frozenBalance: 888, priceUsdt: 3000 },
    ]);
    expect(assets.map(a => a.assetCode)).toEqual(['ETH', 'SOL']);
    expect(assets[0]).toMatchObject({ totalBalance: 20, availableBalance: 999, frozenBalance: 888 });
    expect(assets[1]).toMatchObject({ totalBalance: 211, availableBalance: 0, frozenBalance: 211 });
    expect(buildWalletDigitalAssets(undefined, [])).toEqual([]);
  });
  it('持仓估值使用 total 包括全额担保SOL，不扣冻结、不修改任何输入 fixtures', () => {
    const assets = buildWalletDigitalAssets(oceanSummary, holdings);
    const total = assets.reduce((sum, a) => sum + a.totalBalance * a.priceUsdt, 0);
    expect(total).toBeCloseTo(oceanSummary.total + holdings.reduce((sum, a) => sum + a.totalBalance * a.priceUsdt, 0), 8);
    const availableValue = assets.reduce((sum, a) => sum + Number(a.availableBalance) * a.priceUsdt, 0);
    const frozenValue = assets.reduce((sum, a) => sum + Number(a.frozenBalance) * a.priceUsdt, 0);
    expect(total).toBeCloseTo(availableValue + frozenValue, 8);
    expect(JSON.stringify([oceanSummary, cnySummary, holdings])).toBe(originalFixtures);
  });
});

describe('数字资产实际金额格式：大小边界、小额精度与USDT两位', () => {
  it.each([
    ['ETH', 1000, 2], ['ETH', 999.9999, 4], ['ETH', 1, 4], ['ETH', 0.999999, 6],
    ['SOL', 0.01, 6], ['SOL', 0.00999999, 8], ['AAVE', 0, 8], ['ETH', -1000, 2],
    ['ETH', -0.01, 6], ['ETH', 0.00000001, 8], ['USDT', 0.00000001, 2], ['USDT', 20000, 2],
  ] as const)('%s %s 使用最大%s位小数', (code, amount, digits) => {
    expect(getDigitalAssetDisplayDigits(code, amount)).toBe(digits);
  });
  it.each([
    ['USDT', 20686.37, '20,686.37'], ['USDT', 686.37, '686.37'], ['USDT', 20000, '20,000.00'],
    ['USDT', 0, '0.00'], ['ETH', 20, '20'], ['ETH', 1.234567, '1.2346'],
    ['SOL', 0.12345678, '0.123457'], ['ETH', 0.00000123, '0.00000123'],
    ['ETH', 0.00000001, '0.00000001'], ['ETH', -0.00000001, '-0.00000001'],
    ['AAVE', 1234.567, '1,234.57'], ['AAVE', 0, '0'],
  ] as const)('%s %s 实际输出 %s', (code, amount, formatted) => {
    expect(formatDigitalAssetAmount(code, amount)).toBe(formatted);
  });
});

describe('生产页面 AST：正式钱包与只读快照共同消费真实 helper 和共享资产行', () => {
  it.each([['Wallet', walletAst], ['ReadonlyWalletSnapshot', snapshotAst]] as const)(
    '%s 导入并调用同一个 helper、组件而非注释命中；profile 币名单不隐藏持仓', (_name, ast) => {
      hasImport(ast, '@/lib/walletDigitalAssets', 'buildWalletDigitalAssets');
      hasImport(ast, '@/components/WalletDigitalAssetList', 'WalletDigitalAssetList');
      expect(calls(ast, 'buildWalletDigitalAssets')).toHaveLength(1);
      const tags = nodes(ast, ts.isJsxSelfClosingElement).filter(n => n.tagName.getText() === 'WalletDigitalAssetList');
      expect(tags).toHaveLength(1);
      const assetsProp = required(tags[0].attributes.properties.find(n => ts.isJsxAttribute(n)
        && n.name.getText() === 'assets'), 'shared asset list assets');
      expect(assetsProp.getText()).toContain(ast === walletAst ? 'visibleDigitalAssetBalances' : 'digitalAssets');
      for (const visibleAssets of [[], ['BTC'], ['USDT']]) {
        const assets = pageAssets(ast, { usdtBalanceSummary: oceanSummary, usdtBalance: 999999, multiAssetBalances: holdings, visibleAssets });
        expect(assets).toEqual(buildWalletDigitalAssets(oceanSummary, holdings));
        expect(assets.find(a => a.assetCode === 'SOL')).toMatchObject({ totalBalance: 211, availableBalance: 0, frozenBalance: 211 });
        expect(assets.some(a => a.assetCode === 'AAVE')).toBe(true);
      }
    });
  it.each([['Wallet', walletAst], ['ReadonlyWalletSnapshot', snapshotAst]] as const)(
    '%s 加载fallback不传入伪造summary，可用/担保为null；总额零不显示行', (_name, ast) => {
      const assets = pageAssets(ast, { usdtBalance: oceanSummary.total, multiAssetBalances: [] });
      expect(assets[0]).toMatchObject({ totalBalance: 20686.37, availableBalance: null, frozenBalance: null });
      expect(pageAssets(ast, { usdtBalanceSummary: { total: 0, available: 0, frozen: 0 }, usdtBalance: 999, multiAssetBalances: [] })).toEqual([]);
    });
  it('两个页面的实际估值表达式都包含全部担保数量；CNY正式summary.total压过旧余额', () => {
    const assets = buildWalletDigitalAssets(oceanSummary, holdings);
    const expected = assets.reduce((sum, a) => sum + a.totalBalance * a.priceUsdt, 0);
    const cryptoTotalUsdt = value<number>(initializer(walletAst, 'cryptoTotalUsdt'), { visibleMultiAssetBalances: holdings });
    expect(value<number>(initializer(walletAst, 'digitalTotalUsdt'), { usdtTotalBalance: oceanSummary.total, cryptoTotalUsdt })).toBeCloseTo(expected, 8);
    expect(value<number>(initializer(snapshotAst, 'digitalTotalUsdt'), { digitalAssets: assets })).toBeCloseTo(expected, 8);
    expect(value<number>(initializer(snapshotAst, 'cnyBalance'), { snapshot: { cnyBalanceSummary: cnySummary, cnyBalance: 999999 } })).toBe(cnySummary.total);
  });
  it('推荐快照保持零stale、每次挂载/焦点刷新、15秒轮询和打开/权限门控', () => {
    const query = initializer(treeAst, 'walletSnapshotQuery');
    if (!ts.isCallExpression(query)) throw new Error('Expected production snapshot useQuery');
    expect(query.expression.getText()).toBe('trpc.ledger.afGetInviteeWalletSnapshot.useQuery');
    const options = required(query.arguments[1], 'snapshot options');
    expect(value(options, { walletSnapshotUser: { id: 77 }, ledgerLoaded: true, canSeeInviteWalletSnapshots: true })).toEqual({
      enabled: true, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchInterval: 15000,
    });
    for (const bindings of [
      { walletSnapshotUser: null, ledgerLoaded: true, canSeeInviteWalletSnapshots: true },
      { walletSnapshotUser: { id: 77 }, ledgerLoaded: false, canSeeInviteWalletSnapshots: true },
      { walletSnapshotUser: { id: 77 }, ledgerLoaded: true, canSeeInviteWalletSnapshots: false },
    ]) expect(value<{ enabled: boolean }>(options, bindings).enabled).toBe(false);
  });
});

type Element = { tag: unknown; props: Record<string, unknown>; children: unknown[] };
function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && 'tag' in value && 'children' in value;
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('');
  if (isElement(value)) return value.children.map(text).join('');
  return value === null || value === undefined || typeof value === 'boolean' ? '' : String(value);
}
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  return isElement(value) ? [value, ...value.children.flatMap(elements)] : [];
}
const listFunction = evaluate<(props: {
  assets: ReadonlyArray<WalletDigitalAsset>; usdtCnyRate: number; mask?: (value: string) => string;
}) => Element>([
  `const COLORS = ${initializer(listAst, 'COLORS').getText()};`,
  declaration(listAst, 'WalletDigitalAssetList').getText().replace(/^export\s+/, ''),
  'WalletDigitalAssetList;',
].join('\n'), {
  formatDigitalAssetAmount,
  getCryptoAssetIconSrc: () => null, // 图标无网络/DOM；金额与行结构执行生产函数。
  __element: (tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element => ({ tag, props: props ?? {}, children }),
});

describe('隔离执行共享资产行：独立可用/担保两行、原有估值顺序与mask', () => {
  it('真实组件渲染每币总额、可用、担保；可用0的SOL仍显示全额担保211', () => {
    hasImport(listAst, '@/lib/walletDigitalAssets', 'formatDigitalAssetAmount');
    const rendered = listFunction({ assets: buildWalletDigitalAssets(oceanSummary, holdings), usdtCnyRate: 7.25 });
    const rows = elements(rendered).filter(e => typeof e.props.key === 'string');
    expect(rows.map(e => e.props.key)).toEqual(['USDT', 'ETH', 'SOL', 'AAVE']);
    for (const [row, available, frozen] of [
      [rows[0], '可用 686.37', '担保 20,000.00'], [rows[1], '可用 18', '担保 2'],
      [rows[2], '可用 0', '担保 211'], [rows[3], '可用 100', '担保 0'],
    ] as const) {
      const descendants = elements(row);
      const availableLine = descendants.find(e => text(e) === available);
      const frozenLine = descendants.find(e => text(e) === frozen);
      expect(availableLine).toBeDefined();
      expect(frozenLine).toBeDefined();
      expect(availableLine).not.toBe(frozenLine);
      expect(descendants.indexOf(required(availableLine, 'available line'))).toBeLessThan(descendants.indexOf(required(frozenLine, 'frozen line')));
    }
    // 总量在首行右侧；可用旁保留首估值，担保旁保留非USDT的人民币估值。
    // 检查实际布局容器的子元素顺序，不钉死字号/颜色等脆弱style细节。
    const ethGrid = required(elements(rows[1]).find(e => e.children.some(c => isElement(c) && text(c) === '可用 18')), 'ETH row layout');
    const children = ethGrid.children.filter(isElement).map(text);
    expect(children[1]).toBe('ETH');
    expect(children[2]).toBe('20');
    expect(children[3]).toBe('可用 18');
    expect(children[4]).toContain('≈ ');
    expect(children[4]).toMatch(/ u$/);
    expect(children[5]).toBe('担保 2');
    expect(children[6]).toMatch(/^≈ .*元$/);
    expect(text(rows[0])).toContain('≈ ¥');
  });
  it('mask遮挡总额、两层金额及两类估值；正式钱包仍向共享组件传递mask', () => {
    const rendered = listFunction({ assets: buildWalletDigitalAssets(oceanSummary, holdings), usdtCnyRate: 7.25, mask: () => '••••' });
    const display = text(rendered);
    expect(display).toContain('可用 ••••');
    expect(display).toContain('担保 ••••');
    expect(display).toContain('≈ ¥••••');
    expect(display).toContain('≈ •••• u');
    expect(display).toContain('≈ ••••元');
    expect(display).not.toMatch(/\d/);
    const tag = required(nodes(walletAst, ts.isJsxSelfClosingElement).find(n => n.tagName.getText() === 'WalletDigitalAssetList'), 'wallet list');
    expect(nodes(tag, ts.isJsxAttribute).some(n => n.name.getText() === 'mask'
      && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression?.getText() === 'mask')).toBe(true);
  });
  it('缺失summary显示两处破折号而不显示总额为可用；共享组件/快照无mutation调用', () => {
    const display = text(listFunction({ assets: buildWalletDigitalAssets(undefined, [], oceanSummary.total), usdtCnyRate: 7.25 }));
    expect(display).toContain('可用 —');
    expect(display).toContain('担保 —');
    expect(display).not.toContain('可用 20,686.37');
    for (const ast of [snapshotAst, listAst]) {
      expect(nodes(ast, ts.isPropertyAccessExpression).map(n => n.name.text)
        .filter(n => ['useMutation', 'mutate', 'mutateAsync', 'mutation'].includes(n))).toEqual([]);
    }
  });
});

const routes = ['afGetInviteeWalletSnapshot', 'adminGetLedger37MemberWalletSnapshot'] as const;
type RouteName = typeof routes[number];
function routeProperty(name: RouteName): ts.PropertyAssignment {
  return required(nodes(routerAst, ts.isPropertyAssignment).find(n => propertyName(n.name) === name), name);
}
function routeQuery(name: RouteName): ts.ArrowFunction {
  const query = required(nodes(routeProperty(name), ts.isCallExpression).find(n => ts.isPropertyAccessExpression(n.expression)
    && n.expression.name.text === 'query'), `${name} query`);
  const fn = required(query.arguments[0], 'query callback');
  if (!ts.isArrowFunction(fn)) throw new Error('Expected production query arrow');
  return fn;
}
type QueryArgs = { ctx: { user: { id: number; role: string } }; input: { ledgerId: number; targetUserId: number } };
type SnapshotResult = {
  member: { id: number; name: string; username: string };
  usdtBalance: number; cnyBalance: number;
  usdtBalanceSummary: WalletBalanceSummary; cnyBalanceSummary: WalletBalanceSummary;
  multiAssetBalances: WalletDigitalAsset[];
};
type ReadCall = { name: string; args: unknown[] };
class FixtureTRPCError extends Error {
  readonly code: string;
  constructor(options: { code: string; message: string }) {
    super(options.message);
    this.code = options.code;
  }
}
function isolatedRoute(name: RouteName, options: {
  targetId?: number; invitations?: Map<number, number>; membership?: { memberType: string } | null; missingMember?: boolean;
} = {}) {
  const targetId = options.targetId ?? 77;
  const sqlCalls: Array<{ sql: string; args: unknown[] }> = [];
  const readCalls: ReadCall[] = [];
  const member = { id: targetId, name: 'Ocean', username: 'ocean' };
  const invitations = options.invitations ?? new Map([[targetId, yjhId]]);
  const execute = async (query: string, args: unknown[]) => {
    expect(query.trim()).toMatch(/^SELECT\b/i);
    expect(query).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|REPLACE|CALL)\b/i);
    expect(query).not.toMatch(/\b(?:phone|mobile|password|token|email)\b/i);
    sqlCalls.push({ sql: query, args });
    if (/SELECT invited_by_user_id FROM users\b/i.test(query)) {
      return [[{ invited_by_user_id: invitations.get(Number(args[0])) ?? 0 }]];
    }
    if (/SELECT id, name, username FROM users\b/i.test(query)) {
      expect(args).toEqual([targetId]);
      return [options.missingMember ? [] : [member]];
    }
    if (/FROM af_manual_balances\b/i.test(query)) {
      expect(args).toEqual([targetId]);
      return [[]];
    }
    if (/FROM ai_wallet_project_profiles\b/i.test(query)) {
      expect(args).toEqual([]);
      return [[{ enabled: 1, visible_assets: '["BTC"]' }]];
    }
    throw new Error(`Unexpected isolated SELECT: ${query}`);
  };
  const read = (method: string, result: unknown) => async (...args: unknown[]) => {
    readCalls.push({ name: method, args });
    return result;
  };
  const dbRecharge = Object.fromEntries([
    ['getUserUsdtBalanceSummary', oceanSummary], ['getUserCnyBalanceSummary', cnySummary],
    ['getUserRechargeOrders', []], ['getUserWithdrawHistory', []], ['getUserBalanceHistory', []], ['getUserCnyHistory', []],
  ].map(([method, result]) => [String(method), read(String(method), result)]));
  const fn = value<(args: QueryArgs) => Promise<SnapshotResult>>(routeQuery(name), {
    YJH_USER_ID: yjhId, LEDGER_52_ID: ledger52, LEDGER_37_ID: ledger37, LEDGER_37_WALLET_OPERATOR_ID: operator37,
    TRPCError: FixtureTRPCError, getDbConnection: async () => ({ execute }), dbRecharge,
    dbMultiAssetWallet: { getUserMultiAssetBalances: read('getUserMultiAssetBalances', holdings), getUserMultiAssetHistory: read('getUserMultiAssetHistory', []) },
    dbLedger: { getUserMembership: read('getUserMembership', options.membership === undefined ? { memberType: 'real' } : options.membership) },
    priceScannerFixture: { getLatestPrice: (code: string) => holdings.find(a => a.assetCode === code)?.priceUsdt ?? 0, getUsdtCnyRate: () => 7.25 },
  });
  return { fn, readCalls, sqlCalls, targetId };
}
function queryArgs(name: RouteName, targetUserId = 77, overrides: Partial<QueryArgs['ctx']['user']> = {}): QueryArgs {
  return {
    ctx: { user: { id: name === routes[0] ? yjhId : operator37, role: 'user', ...overrides } },
    input: { ledgerId: name === routes[0] ? ledger52 : ledger37, targetUserId },
  };
}
function responseObject(fn: ts.ArrowFunction): ts.ObjectLiteralExpression {
  const returns = nodes(fn, ts.isReturnStatement).filter(n => n.expression && ts.isObjectLiteralExpression(n.expression));
  const expression = required(returns.at(-1)?.expression, 'snapshot response');
  if (!ts.isObjectLiteralExpression(expression)) throw new Error('Expected snapshot data object');
  return expression;
}
function assertDataOnly(data: unknown) {
  expect(typeof data).not.toBe('function');
  if (Array.isArray(data)) data.forEach(assertDataOnly);
  else if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      expect(key).not.toMatch(/(?:mutation|capabilit|canTransfer|canWithdraw|canRecharge|phone|mobile|password|token|email)/i);
      assertDataOnly(value);
    }
  }
}

describe('两路专属只读快照：AST权限/输入范围及官方summary同目标用户', () => {
  it.each(routes)('%s protected query仅接受ledgerId/正整数targetUserId，不扩成手机号或任意搜索接口', name => {
    const prop = routeProperty(name);
    let root: ts.Expression = prop.initializer;
    while (ts.isCallExpression(root) && ts.isPropertyAccessExpression(root.expression)) root = root.expression.expression;
    expect(root.getText()).toBe('protectedProcedure');
    const methods = nodes(prop, ts.isCallExpression).filter(n => ts.isPropertyAccessExpression(n.expression)).map(n => {
      const access = n.expression as ts.PropertyAccessExpression;
      return access.name.text;
    });
    expect(methods.filter(n => n === 'query')).toHaveLength(1);
    expect(methods).not.toContain('mutation');
    const input = required(nodes(prop, ts.isCallExpression).find(n => ts.isPropertyAccessExpression(n.expression)
      && n.expression.name.text === 'input'), 'input schema');
    const shape = required(nodes(input, ts.isObjectLiteralExpression)[0], 'input shape');
    expect(shape.properties.map(n => n.name ? propertyName(n.name) : '')).toEqual(['ledgerId', 'targetUserId']);
    const target = required(shape.properties.find(n => n.name && propertyName(n.name) === 'targetUserId'), 'target schema');
    expect(nodes(target, ts.isPropertyAccessExpression).map(n => n.name.text)).toEqual(expect.arrayContaining(['number', 'int', 'positive']));
    if (name === routes[1]) expect(calls(shape, 'z.literal')[0].arguments[0].getText()).toBe('37');
    const fn = routeQuery(name);
    for (const summary of ['getUserUsdtBalanceSummary', 'getUserCnyBalanceSummary']) {
      const invocations = calls(fn, `dbRecharge.${summary}`);
      expect(invocations).toHaveLength(1);
      expect(invocations[0].arguments.map(n => n.getText())).toEqual(['targetUserId']);
    }
    expect(calls(fn, 'dbRecharge.getUserUsdtBalance')).toEqual([]);
    expect(calls(fn, 'dbRecharge.getUserCnyBalance')).toEqual([]);
    const response = responseObject(fn);
    const assignments = nodes(response, ts.isPropertyAssignment);
    expect(required(assignments.find(n => propertyName(n.name) === 'usdtBalance'), 'legacy USDT total').initializer.getText()).toBe('usdtBalanceSummary.total');
    expect(required(assignments.find(n => propertyName(n.name) === 'cnyBalance'), 'legacy CNY total').initializer.getText()).toBe('cnyBalanceSummary.total');
    expect(response.properties.map(n => n.name ? propertyName(n.name) : '')).toEqual(expect.arrayContaining(['usdtBalanceSummary', 'cnyBalanceSummary']));
    const member = required(assignments.find(n => propertyName(n.name) === 'member'), 'member projection').initializer;
    if (!ts.isObjectLiteralExpression(member)) throw new Error('Expected explicit privacy projection');
    expect(member.properties.map(n => n.name ? propertyName(n.name) : '')).toEqual(['id', 'name', 'username']);
  });
  it.each(routes)('%s 隔离执行真实query：两币summary和全部持仓/history同target，legacy总额等于summary.total', async name => {
    for (const targetId of [77, 987654]) {
      const run = isolatedRoute(name, { targetId });
      const result = await run.fn(queryArgs(name, targetId));
      expect(result.member).toEqual({ id: targetId, name: 'Ocean', username: 'ocean' });
      expect(result.usdtBalanceSummary).toBe(oceanSummary);
      expect(result.cnyBalanceSummary).toBe(cnySummary);
      expect(result.usdtBalance).toBe(oceanSummary.total);
      expect(result.cnyBalance).toBe(cnySummary.total);
      const finance = run.readCalls.filter(call => call.name !== 'getUserMembership');
      expect(finance).toHaveLength(8);
      finance.forEach(call => expect(call.args[0]).toBe(targetId));
      for (const method of ['getUserUsdtBalanceSummary', 'getUserCnyBalanceSummary']) {
        expect(finance.filter(call => call.name === method).map(call => call.args)).toEqual([[targetId]]);
      }
      expect(result.multiAssetBalances.map(a => a.assetCode)).toEqual(['ETH', 'SOL', 'AAVE']);
      expect(pageAssets(snapshotAst, result)).toEqual(buildWalletDigitalAssets(oceanSummary, holdings));
      assertDataOnly(result);
      expect(run.sqlCalls.length).toBeGreaterThan(0);
    }
  });
});

describe('隔离执行原权限：推荐关系和37号真实成员限制不扩大（无真实连接）', () => {
  it('推荐入口拒绝非52账本、普通用户/普通admin、YJH本人，拒绝后不读取任何财务summary', async () => {
    const invalid = [
      { ...queryArgs(routes[0]), input: { ledgerId: ledger37, targetUserId: 77 } },
      queryArgs(routes[0], 77, { id: 999, role: 'user' }),
      queryArgs(routes[0], 77, { id: 999, role: 'admin' }),
      queryArgs(routes[0], yjhId),
    ];
    for (const args of invalid) {
      const run = isolatedRoute(routes[0]);
      await expect(run.fn(args)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(run.sqlCalls).toEqual([]);
      expect(run.readCalls).toEqual([]);
    }
  });
  it('非推荐成员、循环邀请链和超过32层均拒绝；super_admin也不能横向读取树外任意目标', async () => {
    const longChain = new Map<number, number>(Array.from({ length: 33 }, (_, i) => [77 + i, 78 + i]));
    longChain.set(110, yjhId);
    for (const invitations of [new Map<number, number>(), new Map([[77, 78], [78, 77]]), longChain]) {
      for (const actor of [{ id: yjhId, role: 'user' }, { id: 999, role: 'super_admin' }]) {
        const run = isolatedRoute(routes[0], { invitations });
        await expect(run.fn(queryArgs(routes[0], 77, actor))).rejects.toMatchObject({ code: 'FORBIDDEN' });
        expect(run.readCalls).toEqual([]);
        expect(run.sqlCalls.length).toBeLessThanOrEqual(32);
      }
    }
  });
  it('YJH和super_admin保留真实间接推荐成员只读权限；树内不存在用户返回NOT_FOUND', async () => {
    for (const actor of [{ id: yjhId, role: 'user' }, { id: 999, role: 'super_admin' }]) {
      const run = isolatedRoute(routes[0], { invitations: new Map([[77, 78], [78, yjhId]]) });
      expect((await run.fn(queryArgs(routes[0], 77, actor))).usdtBalanceSummary).toBe(oceanSummary);
      expect(run.sqlCalls.filter(call => /SELECT invited_by_user_id/.test(call.sql)).map(call => call.args)).toEqual([[77], [78]]);
    }
    const missing = isolatedRoute(routes[0], { missingMember: true });
    await expect(missing.fn(queryArgs(routes[0]))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(missing.readCalls).toEqual([]);
  });
  it('37入口仅指定操作者，普通admin/super_admin不扩大；不存在/AI成员不允许任意target', async () => {
    for (const role of ['user', 'admin', 'super_admin']) {
      const run = isolatedRoute(routes[1]);
      await expect(run.fn(queryArgs(routes[1], 77, { id: 999, role }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(run.sqlCalls).toEqual([]);
      expect(run.readCalls).toEqual([]);
    }
    for (const membership of [null, { memberType: 'ai' }]) {
      const run = isolatedRoute(routes[1], { membership });
      await expect(run.fn(queryArgs(routes[1]))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(run.readCalls).toEqual([{ name: 'getUserMembership', args: [ledger37, 77] }]);
      expect(run.sqlCalls).toEqual([]);
    }
    const missing = isolatedRoute(routes[1], { missingMember: true });
    await expect(missing.fn(queryArgs(routes[1]))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(missing.readCalls.every(call => call.name === 'getUserMembership')).toBe(true);
  });
});
