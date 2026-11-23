import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { getWalletCollateralDraftError, getWalletCollateralMaximum } from '../shared/funder-wallet-collateral-input';
import { selectFunderWalletCollateralDisplay } from '../shared/funder-wallet-collateral-display';
import { finitePositive } from '../shared/usdt-cny-display';

// 只导入纯shared函数。生产页/router/DB不导入；真实AST局部执行，资金调用仅离线spy。
const parse = (path: string) => ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const management = parse('../client/src/pages/FunderManagement.tsx');
const card = parse('../client/src/components/FunderOrderCard.tsx');
const shared = parse('../shared/funder-wallet-collateral-input.ts');
function nodes<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T): T[] {
  const result: T[] = []; const visit = (node: ts.Node) => { if (guard(node)) result.push(node); ts.forEachChild(node, visit); }; visit(root); return result;
}
function required<T>(value: T | undefined, label: string): T { if (value === undefined) throw Error(`Missing production AST: ${label}`); return value; }
const initial = (root: ts.Node, name: string) => required(nodes(root, ts.isVariableDeclaration).find(node => node.name.getText() === name)?.initializer, name);
const declarations = (root: ts.Node, names: string[]) => names.map(name => `const ${name} = ${initial(root, name).getText()};`).join('\n');
type VNode = { tag: unknown; props: Record<string, any>; children: unknown[] };
const createElement = (tag: unknown, props: Record<string, any> | null, ...children: unknown[]): VNode => ({ tag, props: props ?? {}, children });
function elements(value: any): VNode[] { return Array.isArray(value) ? value.flatMap(elements) : value?.children ? [value, ...value.children.flatMap(elements)] : []; }
function text(value: any): string { return Array.isArray(value) ? value.map(text).join('') : value?.children ? text(value.children) : value == null || typeof value === 'boolean' ? '' : String(value); }
const button = (tree: unknown, label: string) => required(elements(tree).find(node => node.tag === 'button' && text(node).trim() === label), `button ${label}`);
const compiledCache = new Map<string, Script>();
function vm(bindings: Record<string, any> = {}) {
  const forbidden = vi.fn((): never => { throw Error('Forbidden offline network/DB/funding mutation'); });
  const context = createContext({ getWalletCollateralDraftError, getWalletCollateralMaximum, selectFunderWalletCollateralDisplay, finitePositive,
    React: { createElement, Fragment: 'fragment' }, fetch: forbidden, trpc: new Proxy({}, { get: forbidden }),
    db: new Proxy({}, { get: forbidden }), fundingMutation: forbidden, ...bindings });
  const run = (source: string, values: Record<string, any> = {}): any => {
    Object.assign(context, values);
    let script = compiledCache.get(source);
    if (!script) {
      const ast = ts.createSourceFile('offline.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      if (nodes(ast, ts.isImportDeclaration).length || nodes(ast, ts.isCallExpression).some(n => n.expression.kind === ts.SyntaxKind.ImportKeyword)) throw Error('Offline imports forbidden');
      const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
      script = new Script(compiled); compiledCache.set(source, script);
    }
    return script.runInContext(context, { timeout: 1000 });
  };
  return { context, run, forbidden };
}
type Asset = { coin: string; qty: string; source?: string; note?: string; jointSegmentId?: string };
const wallet = (qty: string, coin = 'USDT', segment = '__primary__'): Asset => ({ coin, qty, source: 'wallet', note: '钱包担保冻结', jointSegmentId: segment });
const manual = Object.freeze({ coin: 'USDT', qty: '250.12345678', source: 'manual', note: '手工原登记' });
const balance = (availableBalance: unknown = '10000.01', assetCode = 'USDT') => ({ assetCode, availableBalance, frozenBalance: '150000', totalBalance: '160000.01' });
const query = (data: any, extra: Record<string, any> = {}) => ({ data, isSuccess: true, isError: false, isLoading: false, ...extra });
const scopeNames = ['walletCollateralContributors', 'currentWalletCollateralContributor', 'confirmedWalletCollateralAssets', 'walletCollateralAmountsReady'];
function managementScope(bindings: Record<string, any> = {}) {
  const scope = { editingOrder: { id: 4860 }, walletCollateralUserId: 1, activeWalletCollateralSegmentId: 'second',
    walletCollateralBalancesQuery: query([balance('10000')]), walletCollateralContributorsQuery: query([
      { userId: 1, assets: [wallet('5000', 'USDT', 'second'), wallet('77777'), wallet('88', 'ETH', 'second')] },
      { userId: 2, assets: [wallet('90000', 'USDT', 'second')] },
    ]), ...bindings };
  return vm(scope).run(`(() => { ${declarations(management, scopeNames)}; return { confirmedWalletCollateralAssets, walletCollateralAmountsReady }; })()`);
}
const rowCallback = (root: ts.Node) => required(nodes(root, ts.isArrowFunction).find(node => ts.isBlock(node.body)
  && node.body.statements.some(s => ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText() === 'maximum' && d.initializer?.getText().startsWith('getWalletCollateralMaximum(')))), 'real wallet balance map callback');
const rowSources = { management: rowCallback(management).getText(), quick: rowCallback(card).getText() };
function rowHarness(kind: 'management' | 'quick', options: Record<string, any> = {}) {
  const assets: Asset[] = options.assets ?? [manual, wallet('0')];
  // 快捷编辑产品将手工和钱包存于独立state，不能把手工fixture硬塞钱包state制造假失败。
  const state: { assets: Asset[]; manualAssets: Asset[]; drafts: Record<string, string> } = {
    assets: kind === 'quick' ? assets.filter(a => a.source === 'wallet') : assets,
    manualAssets: assets.filter(a => a.source !== 'wallet'), drafts: options.drafts ?? {},
  };
  const bindings: Record<string, any> = {
    editingOrder: options.editingOrder ?? null, walletCollateralEditMode: true,
    isSettlementFinal: false,
    walletCollateralAmountsReady: options.ready ?? true, confirmedWalletCollateralAssets: options.confirmed ?? [],
    quickWalletCollateralBalancesQuery: options.balanceQuery ?? query([balance(options.available)]),
    selectedJointCollateralSegmentId: options.segment ?? '__primary__', selectedJointCollateralSegment: null,
    quickWalletCollateralUserId: options.userId ?? 1,
    order: options.order ?? { id: 4860, wallet_collateral_contributors: [{ userId: 1, assets: options.confirmed ?? [] }] },
    formatFxEstimate: (value: unknown) => String(value ?? '待确认'),
    setCollateralAssets: (next: any) => { state.assets = typeof next === 'function' ? next(state.assets) : next; },
    setWalletCollateralEditItems: (next: any) => { state.assets = typeof next === 'function' ? next(state.assets) : next; },
    setWalletCollateralInputDrafts: (next: any) => { state.drafts = typeof next === 'function' ? next(state.drafts) : next; },
    ...options.bindings,
  };
  const runtime = vm(bindings);
  runtime.run(kind === 'management'
    ? declarations(management, ['isWalletCollateralAsset', 'getWalletAssetDisplayDigits', 'formatWalletAssetAmount', 'formatWalletAssetInput'])
    : declarations(card, ['getSegmentWalletCollateralItems', 'quickWalletCollateralAmountsReady']));
  const render = () => runtime.run(`(${rowSources[kind]})(asset)`, { asset: balance(options.available ?? '10000.01', options.coin ?? 'USDT'),
    collateralAssets: state.assets, walletCollateralEditItems: state.assets, walletCollateralInputDrafts: state.drafts });
  return { ...runtime, state, render };
}
const pendingNames = ['createMutation', 'financeCreateMutation', 'updateMutation', 'updateParticipantOrderMutation', 'saveJointOrderSegmentsMutation', 'saveWalletCollateralMutation'];
function submitHarness(overrides: Record<string, any> = {}) {
  const mutate = vi.fn(); const toast = { error: vi.fn(), success: vi.fn() };
  const bindings: Record<string, any> = {
    ledgerId: 52, editingOrder: null, collateralAssets: [manual, wallet('10000.01')],
    createdOrderRecovery: null, newOrderCreateContextRef: { current: null }, newOrderEditorScopeRef: { current: 1 },
    walletCollateralBalancesQuery: query([balance()]), walletCollateralAmountsReady: true,
    cnyRate: 7, formData: { assetType: 'crypto', userId: 1, coin: 'BTC', amountCurrency: 'USDT',
      buyPrice: '100', buyQuantity: '100', interestEndDate: '', interestStartDate: '2026-11-23', tags: [],
      personalHeaderLabel: '', interestRateAnnual: '12', profitShareType: 'coin', profitShareRatio: '',
      tradingFeeRate: '2', tradingFeeStatus: 'unpaid', ownerVisibleOwnerIds: [] }, optionFormData: {},
    financingAmountUsdt: '10000.00', amountInputValue: '10000', isActiveJointEditorSegmentSettled: false,
    activeJointEditorSegmentId: '__primary__', isEditingJointSegment: false, activeJointEditorSegment: null,
    activeJointOrderTarget: null, jointOrderSegments: [], jointOrderSegmentsDirty: false,
    isSnapshotScopedEdit: false, displayConfig: { collateral: true }, marginAlertThreshold: '',
    collateralRiskFormula: 'principal_coverage', manualLinkedFieldsRef: { current: [] }, derivedLinkedField: null,
    collateralShareMode: 'none', orderCollateralSourceDraft: null, effectivePrincipalLentOut: false,
    normalizeFunderAnnualRate: (v: unknown) => String(v ?? ''), formatTradingFeeRate: (v: unknown) => String(v ?? ''),
    isValidFunderContractInterestPeriod: () => true,
    buildProfitShareDraft: () => ({ enabled: false, commissionShare: '' }),
    ledgerData: { members: [{ userId: 1, role: 'owner' }] }, toast,
    ...Object.fromEntries(pendingNames.map(name => [name, { isPending: false, mutate }])), ...overrides,
  };
  const runtime = vm(bindings);
  runtime.run(declarations(management, ['isWalletCollateralAsset']));
  const submit = runtime.run(`(${initial(management, 'handleSubmit').getText()})`);
  return { ...runtime, bindings, submit, mutate, toast };
}
function persistHarness(overrides: Record<string, any> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue(undefined); const toast = { error: vi.fn() };
  const runtime = vm({ ledgerId: 52, jointOrderSegments: [{ id: 'second', status: 'active', amount: '888', collateral_assets: [manual] }],
    walletCollateralBalancesQuery: query([balance('10000')]), confirmedWalletCollateralAssets: [wallet('5000', 'USDT', 'second')],
    walletCollateralAmountsReady: true, saveWalletCollateralMutation: { mutateAsync }, toast, ...overrides });
  runtime.run(declarations(management, ['isWalletCollateralAsset']));
  const persist = runtime.run(`(${initial(management, 'persistWalletCollateral').getText()})`);
  return { ...runtime, persist, mutateAsync, toast };
}
function quickSubmitHarness(overrides: Record<string, any> = {}) {
  const mutate = vi.fn(); const toast = { error: vi.fn() };
  const runtime = vm({ ledgerId: 52, isSettlementFinal: false, quickWalletCollateralUserId: 1,
    order: { id: 4860, wallet_collateral_contributors: [{ userId: 1, assets: [wallet('5000', 'USDT', 'second')] }] },
    selectedJointCollateralSegmentId: 'second', selectedJointCollateralSegment: null,
    walletCollateralEditItems: [wallet('15000', 'USDT', 'second')], quickWalletCollateralBalancesQuery: query([balance('10000')]),
    _intSaveWalletCollateralMutation: { mutate, isPending: false }, toast, ...overrides });
  runtime.run(declarations(card, ['getSegmentWalletCollateralItems', 'quickWalletCollateralAmountsReady']));
  const submit = runtime.run(`(${initial(card, 'handleSaveWalletCollateral').getText()})`);
  return { ...runtime, submit, mutate, toast };
}
function managementButton(content: string) {
  return required(nodes(management, ts.isJsxElement).find(node => node.openingElement.tagName.getText() === 'button' && node.getText().includes(content)), content);
}
const newCta = managementButton("'保存订单并冻结钱包担保物'");
const footer = managementButton("'确认添加'");
const editCta = managementButton('void persistWalletCollateral(Number(editingOrder.id)');
function attrExpression(node: ts.JsxElement, name: string) {
  const value = required(node.openingElement.attributes.properties.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name)?.initializer, name);
  return required(ts.isJsxExpression(value) ? value.expression : undefined, name).getText();
}

describe('定点额度与真实草稿校验，不浮点扩大额度', () => {
  it('真实修改TSX/shared语法完整，BigInt无default-target不兼容literal', () => {
    for (const ast of [management, card, shared]) expect((ast as any).parseDiagnostics).toEqual([]);
    expect(nodes(shared, ts.isBigIntLiteral)).toHaveLength(0);
  });
  it.each([
    ['10000.01', [], '10000.01'], ['10000', [wallet('5000')], '15000'],
    ['-100', [wallet('5000')], '4900'], ['-6000', [wallet('5000')], '0'], ['-0.01', [], '0'],
    ['0.1', [wallet('0.2')], '0.3'], ['0.00000001', [wallet('0.00000002')], '0.00000003'],
    ['0.123456789123456789', [wallet('0.000000000000000001')], '0.12345678912345679'],
    ['9007199254740993.123456789123456789', [], '9007199254740993.123456789123456789'],
    ['1e-18', [], '0.000000000000000001'],
  ])('available=%s + confirmed → exact %s', (available, confirmed, maximum) => {
    expect(getWalletCollateralMaximum(available, 'USDT', confirmed as Asset[])).toBe(maximum);
  });
  it('其他币种不加入当前币种上限；输入和真实钱字段不改', () => {
    const available = Object.freeze(balance('10000.01'));
    const confirmed = Object.freeze([Object.freeze(wallet('5000', 'ETH'))]);
    const before = JSON.stringify([available, confirmed]);
    expect(getWalletCollateralMaximum(available.availableBalance, 'USDT', confirmed)).toBe('10000.01');
    expect(JSON.stringify([available, confirmed])).toBe(before);
  });
  it.each([undefined, null, '', 'bad', NaN, Infinity, false])('未知available %s返回null不伪0', available => {
    expect(getWalletCollateralMaximum(available, 'USDT', [wallet('5000')])).toBeNull();
    expect(getWalletCollateralDraftError([wallet('0.5')], [{ ...balance(), availableBalance: available }], [], true)).toContain('尚未确认');
  });
  it.each(['0.5', '0.00000001', '0.000000000000000001', '0.123456789123456789', '10000.010000000000000000'])('合法正小数%s精确校验通过', qty => {
    expect(getWalletCollateralDraftError([wallet(qty)], [balance()], [], true)).toBeNull();
  });
  it.each(['0', '-1', '01', '1e-8', '0.1234567891234567891', '10000.010000000000000001'])('无效或超额%s拒绝', qty => {
    expect(getWalletCollateralDraftError([wallet(qty)], [balance()], [], true)).toBeTruthy();
  });
  it('note识别旧钱包条目；重复币种与未知币种拒绝，手工不受钱包校验', () => {
    expect(getWalletCollateralDraftError([{ coin: 'USDT', qty: '10000.02', note: '钱包担保冻结' }], [balance()], [], true)).toContain('超过');
    expect(getWalletCollateralDraftError([wallet('1'), wallet('2')], [balance()], [], true)).toContain('重复');
    expect(getWalletCollateralDraftError([wallet('1', 'UNKNOWN')], [balance()], [], true)).toContain('尚未确认');
    expect(getWalletCollateralDraftError([manual], [], [], false)).toBeNull();
  });
});

describe('实际map JSX/onClick/setter：全部不累计，真实用户订单段隔离', () => {
  it.each(['management', 'quick'] as const)('%s首次全部10000.01，重复25次仍10000.01，历史150000不加入', kind => {
    const h = rowHarness(kind, { assets: [manual, wallet('150000')], available: '10000.01' });
    for (let i = 0; i < 25; i++) {
      const tree = h.render(); const all = button(tree, '全部'); expect(all.props.disabled).toBe(false); all.props.onClick();
      expect(h.state.assets.find(a => a.source === 'wallet')?.qty).toBe('10000.01');
      expect(kind === 'management' ? h.state.assets[0] : h.state.manualAssets[0]).toBe(manual);
      expect(elements(h.render()).find(n => n.tag === 'input')?.props.max).toBe('10000.01');
      expect(elements(h.render()).find(n => n.tag === 'input')?.props.value).toBe('10000.01');
    }
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it('主页面新建真实baseline恒空，即使查询残留历史150000', () => {
    const result = managementScope({ editingOrder: null, walletCollateralContributorsQuery: query([{ userId: 1, assets: [wallet('150000', 'USDT', 'second')] }]) });
    expect(result.confirmedWalletCollateralAssets).toEqual([]);
    expect(getWalletCollateralMaximum('10000.01', 'USDT', result.confirmedWalletCollateralAssets)).toBe('10000.01');
  });
  it('主页面真实baseline只选当前user和当前segment，其他币种由shared隔离', () => {
    const result = managementScope();
    expect(result.confirmedWalletCollateralAssets.map((a: Asset) => [a.coin, a.qty])).toEqual([['USDT', '5000'], ['ETH', '88']]);
    expect(getWalletCollateralMaximum('10000', 'USDT', result.confirmedWalletCollateralAssets)).toBe('15000');
  });
  it.each(['management', 'quick'] as const)('%s编辑真冻结5000+可用10000恒15000，移除重选不丢baseline和手工', kind => {
    const confirmed = [wallet('5000', 'USDT', 'second'), wallet('77', 'ETH', 'second')];
    const h = rowHarness(kind, { assets: [manual, wallet('5000')], available: '10000', confirmed, segment: 'second', editingOrder: { id: 4860 } });
    for (let i = 0; i < 25; i++) button(h.render(), '全部').props.onClick();
    expect(h.state.assets.find(a => a.source === 'wallet')?.qty).toBe('15000');
    button(h.render(), '移除').props.onClick(); expect(h.state.assets).toEqual(kind === 'management' ? [manual] : []);
    expect(h.state.manualAssets).toEqual([manual]);
    button(h.render(), '选择').props.onClick(); button(h.render(), '全部').props.onClick();
    expect(h.state.assets.find(a => a.source === 'wallet')?.qty).toBe('15000');
    expect(kind === 'management' ? h.state.assets[0] : h.state.manualAssets[0]).toBe(manual);
    expect(confirmed[0].qty).toBe('5000'); expect(h.forbidden).not.toHaveBeenCalled();
  });
  it('快捷map直接调用真实getSegmentWalletCollateralItems，其他user/segment不加', () => {
    const h = rowHarness('quick', { available: '10000', segment: 'second', order: { id: 4860, wallet_collateral_contributors: [
      { userId: 1, assets: [wallet('5000', 'USDT', 'second'), wallet('100000')] },
      { userId: 2, assets: [wallet('200000', 'USDT', 'second')] },
    ] } });
    expect(elements(h.render()).find(n => n.tag === 'input')?.props.max).toBe('15000');
  });
  it('实际余额查询只携带当前用户，台账查询严格当前orderId且保留admin/52权限', () => {
    const seen: any[] = []; const useQuery = vi.fn((...args: any[]) => { seen.push(args); return query([]); });
    const h = vm({ trpc: { ledger: { funderGetWalletCollateralBalances: { useQuery }, funderGetOrderWalletCollateralContributors: { useQuery } } },
      ledgerId: 52, showForm: true, isAdminUser: true, walletCollateralUserId: 1, editingOrder: { id: 4860 } });
    h.run(`(${initial(management, 'walletCollateralBalancesQuery').getText()})`);
    h.run(`(${initial(management, 'walletCollateralContributorsQuery').getText()})`);
    expect(seen.map(args => args[0])).toEqual([{ ledgerId: 52, userId: 1 }, { ledgerId: 52, orderId: 4860 }]);
    for (const args of seen) expect(args[1].enabled).toBe(true);
    for (const changes of [{ isAdminUser: false }, { ledgerId: 37 }, { showForm: false }]) {
      h.run(`(${initial(management, 'walletCollateralBalancesQuery').getText()})`, changes);
      expect(seen.at(-1)[1].enabled).toBe(false);
      h.run(`(${initial(management, 'walletCollateralContributorsQuery').getText()})`);
      expect(seen.at(-1)[1].enabled).toBe(false);
      Object.assign(h.context, { ledgerId: 52, showForm: true, isAdminUser: true });
    }
  });
  it.each([
    { walletCollateralBalancesQuery: query(undefined, { isSuccess: false }) },
    { walletCollateralBalancesQuery: query([balance()], { isError: true }) },
    { walletCollateralContributorsQuery: query(undefined, { isSuccess: false }) },
    { walletCollateralContributorsQuery: query([], { isError: true }) },
  ])('主页面真实ready失效，不把unknown冻结台账算成可用成功', changes => {
    const scoped = managementScope(changes); expect(scoped.walletCollateralAmountsReady).toBe(false);
    const h = rowHarness('management', { ready: scoped.walletCollateralAmountsReady, confirmed: scoped.confirmedWalletCollateralAssets });
    const before = JSON.stringify(h.state); const all = button(h.render(), '全部'); expect(all.props.disabled).toBe(true);
    all.props.onClick(); expect(JSON.stringify(h.state)).toBe(before); expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each(['management', 'quick'] as const)('%s未知额度没有max=0且全部不写草稿', kind => {
    const h = rowHarness(kind, { available: 'bad' }); const before = JSON.stringify(h.state);
    const tree = h.render(); expect(elements(tree).find(n => n.tag === 'input')?.props.max).toBeUndefined();
    const all = button(tree, '全部'); expect(all.props.disabled).toBe(true); all.props.onClick();
    expect(JSON.stringify(h.state)).toBe(before); expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each(['management', 'quick'] as const)('%s余额成功但冻结未加载时全部必须禁用且不能将unknown当零基线', kind => {
    const h = rowHarness(kind, { ready: false, order: { id: 4860 }, editingOrder: { id: 4860 } });
    const before = JSON.stringify(h.state); const all = button(h.render(), '全部'); expect(all.props.disabled).toBe(true);
    all.props.onClick(); expect(JSON.stringify(h.state)).toBe(before);
  });
  it.each(['management', 'quick'] as const)('%s全部不触及真实余额字段、冻结字段或其它段手工资产', kind => {
    const other = Object.freeze(wallet('42', 'BTC', 'third')); const h = rowHarness(kind, { assets: [manual, wallet('1'), other] });
    const originalOrder = JSON.stringify(h.context.order); button(h.render(), '全部').props.onClick();
    expect(kind === 'management' ? h.state.assets[0] : h.state.manualAssets[0]).toBe(manual);
    expect(h.state.assets.find(a => a.coin === 'BTC')).toBe(other);
    expect(JSON.stringify(h.context.order)).toBe(originalOrder); expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each(['management', 'quick'] as const)('%s实际input onChange精确保留0.x/8/18小数原字符串', kind => {
    const h = rowHarness(kind);
    for (const value of ['0.5', '0.12345678', '0.123456789123456789', '10000.010000000000000000']) {
      const input = required(elements(h.render()).find(n => n.tag === 'input'), 'input'); input.props.onChange({ target: { value } });
      expect(h.state.assets.find(a => a.source === 'wallet')?.qty).toBe(value);
      expect(elements(h.render()).find(n => n.tag === 'input')?.props.value).toBe(value);
    }
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it('主页面input onBlur不得将18位原字符串按展示精度重写', () => {
    const h = rowHarness('management'); const value = '0.123456789123456789';
    required(elements(h.render()).find(n => n.tag === 'input'), 'input').props.onChange({ target: { value } });
    required(elements(h.render()).find(n => n.tag === 'input'), 'input').props.onBlur();
    expect(h.state.assets.find(a => a.source === 'wallet')?.qty).toBe(value);
    expect(elements(h.render()).find(n => n.tag === 'input')?.props.value).toBe(value);
  });
  it.each(['management', 'quick'] as const)('%s编辑已水合18位真实数量，无input draft时也不能按展示精度缩短', kind => {
    const value = '0.123456789123456789'; const h = rowHarness(kind, { assets: [manual, wallet(value)], editingOrder: { id: 4860 }, confirmed: [wallet(value)] });
    expect(elements(h.render()).find(n => n.tag === 'input')?.props.value).toBe(value);
    expect(h.state.assets.find(a => a.source === 'wallet')?.qty).toBe(value);
  });
});

describe('真实提交前守卫和新旧保存按钮接线，创建一单后才冻结', () => {
  it.each(['10000.02', '10000.010000000000000001'])('main超额typed %s在任何创建/资金动作前截下', qty => {
    const h = submitHarness({ collateralAssets: [manual, wallet(qty)] }); h.submit();
    expect(h.mutate).not.toHaveBeenCalled(); expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining('超过'));
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each([false, true])('main unknown/failed ready=%s拒绝创建，不freeze/不改钱', isError => {
    const h = submitHarness({ walletCollateralAmountsReady: false, walletCollateralBalancesQuery: query(undefined, { isSuccess: false, isError }) });
    h.submit(); expect(h.mutate).not.toHaveBeenCalled(); expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining('尚未确认'));
  });
  it.each(pendingNames)('main真实busy包含%s，拒绝再次点击', pendingName => {
    const h = submitHarness({ [pendingName]: { isPending: true, mutate: vi.fn() } });
    h.submit(); h.submit(); expect(h.mutate).not.toHaveBeenCalled(); expect(h.toast.error).not.toHaveBeenCalled();
  });
  it.each(['owner', 'member'])('新增CTA和底部是同handleSubmit，%s分流只创建一单，无提前freeze', role => {
    const create = { isPending: false, mutate: vi.fn(() => { create.isPending = true; }) };
    const finance = { isPending: false, mutate: vi.fn(() => { finance.isPending = true; }) };
    const freeze = vi.fn(); const h = submitHarness({ ledgerData: { members: [{ userId: 1, role }] }, createMutation: create, financeCreateMutation: finance,
      saveWalletCollateralMutation: { isPending: false, mutate: freeze } });
    expect(attrExpression(newCta, 'onClick')).toBe('handleSubmit'); expect(attrExpression(footer, 'onClick')).toBe('handleSubmit');
    const upper = h.run(`(${attrExpression(newCta, 'onClick')})`, { handleSubmit: h.submit });
    const lower = h.run(`(${attrExpression(footer, 'onClick')})`); expect(upper).toBe(lower);
    upper(); lower(); for (let i = 0; i < 20; i++) upper();
    expect(create.mutate.mock.calls.length + finance.mutate.mock.calls.length).toBe(1); expect(freeze).not.toHaveBeenCalled();
    const called = role === 'owner' ? create.mutate : finance.mutate;
    expect(called).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, ledgerId: 52, amount: '10000.00', collateralAssets: [manual] }));
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it('新增按钮与页尾保存的忙碌禁用包含financeCreate/saveWallet；未知时新CTA不可点击', () => {
    const base = Object.fromEntries(pendingNames.map(name => [name, { isPending: false }]));
    const h = vm({ ...base, walletCollateralUserId: 1, walletCollateralAmountsReady: true, createdOrderRecovery: null, editingOrder: null });
    for (const name of ['financeCreateMutation', 'saveWalletCollateralMutation']) {
      for (const node of [newCta, footer]) expect(h.run(`(${attrExpression(node, 'disabled')})`, { ...base, [name]: { isPending: true } })).toBe(true);
    }
    expect(h.run(`(${attrExpression(newCta, 'disabled')})`, { ...base, walletCollateralAmountsReady: false })).toBe(true);
    expect(newCta.getText()).not.toContain('persistWalletCollateral');
    expect(management.getText()).toContain('此按钮与底部“确认添加”是同一次保存');
  });
  it('编辑态独立保存仍只钱包回调并携带当前段，不走创建/主订单更新', () => {
    expect(attrExpression(editCta, 'onClick')).toContain('persistWalletCollateral'); expect(attrExpression(editCta, 'onClick')).not.toContain('handleSubmit');
    const persist = vi.fn().mockResolvedValue(undefined); const h = vm({ persistWalletCollateral: persist, editingOrder: { id: 4860 }, walletCollateralUserId: 1,
      collateralAssets: [manual, wallet('1')], activeWalletCollateralSegmentId: 'second' });
    h.run(`(${attrExpression(editCta, 'onClick')})()`);
    expect(persist).toHaveBeenCalledWith(4860, 1, [manual, wallet('1')], 'second');
  });
  it.each(['15000.000000000000000001', '99999'])('独立钱包保存超额%s抛错误不调用freeze', async qty => {
    const h = persistHarness(); await expect(h.persist(4860, 1, [manual, wallet(qty)], 'second')).rejects.toThrow('超过');
    expect(h.mutateAsync).not.toHaveBeenCalled(); expect(h.forbidden).not.toHaveBeenCalled();
  });
  it('独立钱包保存unknown或结清段不freeze；合法数量精确送当前scope无钱字段', async () => {
    const unknown = persistHarness({ walletCollateralAmountsReady: false });
    await expect(unknown.persist(4860, 1, [wallet('0.5')], 'second')).rejects.toThrow('尚未确认'); expect(unknown.mutateAsync).not.toHaveBeenCalled();
    const final = persistHarness({ jointOrderSegments: [{ id: 'second', status: 'settled' }] });
    await final.persist(4860, 1, [wallet('1')], 'second'); expect(final.mutateAsync).not.toHaveBeenCalled();
    const h = persistHarness(); const qty = '0.123456789123456789'; await h.persist(4860, 1, [manual, wallet(qty)], 'second');
    expect(h.mutateAsync).toHaveBeenCalledWith({ ledgerId: 52, orderId: 4860, userId: 1, jointSegmentId: 'second', assets: [{ coin: 'USDT', qty }], autoRegisterOwner: true });
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each(['15000.000000000000000001', '0'])('快捷钱包保存typed%s提交前拒绝且不资金mutation', qty => {
    const h = quickSubmitHarness({ walletCollateralEditItems: [wallet(qty)] }); h.submit();
    expect(h.mutate).not.toHaveBeenCalled(); expect(h.toast.error).toHaveBeenCalled(); expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each(['0.5', '0.12345678', '0.123456789123456789', '15000'])('快捷合法正小数%s按真实当前user/order/segment精确保存', qty => {
    const h = quickSubmitHarness({ walletCollateralEditItems: [wallet(qty)] }); h.submit();
    expect(h.mutate).toHaveBeenCalledWith({ ledgerId: 52, orderId: 4860, userId: 1, jointSegmentId: 'second', assets: [{ coin: 'USDT', qty }], autoRegisterOwner: true });
    expect(h.toast.error).not.toHaveBeenCalled(); expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each([
    { order: { id: 4860 } }, { order: { id: 4860, wallet_collateral_contributors: [], wallet_collateral_contributors_status: 'error' } },
    { quickWalletCollateralBalancesQuery: query(undefined, { isSuccess: false }) }, { quickWalletCollateralBalancesQuery: query([balance()], { isError: true }) },
    { isSettlementFinal: true },
  ])('快捷真实提交unknown/failed/历史冻结不freeze', changes => {
    const h = quickSubmitHarness(changes); h.submit(); expect(h.mutate).not.toHaveBeenCalled(); expect(h.toast.error).toHaveBeenCalled();
  });
  it.each(['createMutation', 'financeCreateMutation'])('%s真实成功回调先获得orderId再冻结；冻结未完成不关闭，失败不伪成功', async name => {
    const timeline: string[] = []; let resolve!: () => void; const pending = new Promise<void>(r => { resolve = r; });
    const freeze = vi.fn(() => { timeline.push('freeze'); return pending; }); const toast = { success: vi.fn(() => timeline.push('success')), error: vi.fn(), warning: vi.fn() };
    const close = vi.fn(() => timeline.push('close')); const h = vm({ trpc: { ledger: new Proxy({}, { get: () => ({ useMutation: (config: any) => config }) }) },
      collateralAssets: [manual, wallet('0.5')], formData: { userId: 1 }, participants: [], persistWalletCollateral: freeze, toast,
      newOrderEditorScopeRef: { current: 1 }, newOrderCreateContextRef: { current: { scope: 1, ledgerId: 52, userId: 1, assets: [manual, wallet('0.5')] } },
      setCreatedOrderRecovery: vi.fn(),
      setShowForm: close, refetchOrders: vi.fn(), trpcUtils: { ledger: { funderGetAssetOrders: { invalidate: vi.fn() } } }, ledgerId: 52 });
    h.run(declarations(management, ['isWalletCollateralAsset', 'completeNewOrderCreation', 'handleNewOrderCreateError'])); const config = h.run(`(${initial(management, name).getText()})`);
    const saving = config.onSuccess({ orderId: 4860 });
    expect(freeze).toHaveBeenCalledWith(4860, 1, [manual, wallet('0.5')]); expect(close).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
    resolve(); await saving; expect(timeline).toEqual(['freeze', 'success', 'close']);
    freeze.mockRejectedValueOnce(Error('offline freeze failed')); toast.success.mockClear(); close.mockClear();
    h.context.newOrderCreateContextRef.current = { scope: 1, ledgerId: 52, userId: 1, assets: [manual, wallet('0.5')] };
    await config.onSuccess({ orderId: 4861 }); expect(toast.success).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });
});

function completionHarness(overrides: Record<string, any> = {}) {
  const freeze = vi.fn().mockResolvedValue(undefined); const persistParticipants = vi.fn().mockResolvedValue(undefined);
  const toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() }; const close = vi.fn(); const refetch = vi.fn();
  const h = submitHarness({ persistWalletCollateral: freeze, persistParticipantViews: persistParticipants,
    participants: [], toast, setShowForm: close, refetchOrders: refetch,
    trpcUtils: { ledger: { funderGetAssetOrders: { invalidate: vi.fn() } } },
    trpc: { ledger: new Proxy({}, { get: () => ({ useMutation: (config: any) => config }) }) }, ...overrides });
  const recovery = vi.fn((value: any) => { h.context.createdOrderRecovery = value; });
  h.context.setCreatedOrderRecovery = recovery;
  h.run(declarations(management, ['completeNewOrderCreation', 'handleNewOrderCreateError']));
  const complete = h.run('completeNewOrderCreation');
  const createConfig = h.run(`(${initial(management, 'createMutation').getText()})`);
  const financeConfig = h.run(`(${initial(management, 'financeCreateMutation').getText()})`);
  return { ...h, freeze, persistParticipants, toast, close, refetch, recovery, complete, createConfig, financeConfig };
}
describe('父新增fail-closed创建恢复：真实上下文、共同完成回调、旧scope隔离', () => {
  it('两个create类型实际同一完成/error callback，不分别复制或提前冻结', () => {
    const h = completionHarness();
    expect(h.createConfig.onSuccess).toBe(h.financeConfig.onSuccess); expect(h.createConfig.onSuccess).toBe(h.complete);
    expect(h.createConfig.onError).toBe(h.financeConfig.onError);
    expect(h.freeze).not.toHaveBeenCalled(); expect(h.close).not.toHaveBeenCalled();
  });
  it('同步捕获context阻止React未rerender的多点；assets逐项克隆而非实时draft', () => {
    const input = [Object.freeze({ ...manual }), wallet('0.123456789123456789')];
    const h = completionHarness({ collateralAssets: input }); h.submit();
    const captured = h.context.newOrderCreateContextRef.current;
    expect(captured).toMatchObject({ scope: 1, ledgerId: 52, userId: 1, assets: input });
    expect(captured.assets).not.toBe(input); expect(captured.assets[0]).not.toBe(input[0]); expect(captured.assets[1]).not.toBe(input[1]);
    input[1].qty = '99999'; h.context.collateralAssets = [wallet('77777')]; h.context.formData = { ...h.context.formData, userId: 2 };
    h.submit(); h.submit(); expect(h.mutate).toHaveBeenCalledOnce();
    expect(captured.assets[1].qty).toBe('0.123456789123456789'); expect(h.freeze).not.toHaveBeenCalled();
  });
  it.each(['createConfig', 'financeConfig'] as const)('%s冻结失败后recovery保存真实orderId，重点击两按钮不再create', async name => {
    const h = completionHarness(); h.submit(); h.freeze.mockRejectedValueOnce(Error('offline freeze failed'));
    await h[name].onSuccess({ orderId: 4860 });
    expect(h.context.createdOrderRecovery).toEqual({ orderId: 4860, userId: 1 });
    expect(h.context.newOrderCreateContextRef.current).toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining('#4860'));
    expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining('不要重复添加'));
    expect(h.toast.success).not.toHaveBeenCalled(); expect(h.close).not.toHaveBeenCalled();
    const upper = h.run(`(${attrExpression(newCta, 'onClick')})`, { handleSubmit: h.submit });
    const lower = h.run(`(${attrExpression(footer, 'onClick')})`);
    for (let i = 0; i < 25; i++) { upper(); lower(); }
    expect(h.mutate).toHaveBeenCalledOnce(); expect(h.freeze).toHaveBeenCalledOnce();
    for (const node of [newCta, footer]) expect(h.run(`(${attrExpression(node, 'disabled')})`, { walletCollateralUserId: 1 })).toBe(true);
    const notice = required(nodes(management, ts.isJsxElement).find(n => n.openingElement.attributes.getText().includes('role="alert"') && n.getText().includes('主体已创建')), 'create recovery alert');
    const exit = vi.fn(); const tree = h.run(`(${notice.getText()})`, { closeOrderEditor: exit });
    expect(text(tree)).toContain('#4860'); expect(text(tree)).toContain('已阻止重复添加');
    button(tree, '返回订单列表，编辑已有订单继续保存').props.onClick(); expect(exit).toHaveBeenCalledOnce();
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it('真实完成回调使用提交时context的user/assets，不读取期间改动的实时draft', async () => {
    const original = [manual, wallet('0.123456789123456789')]; const h = completionHarness({ collateralAssets: original }); h.submit();
    h.context.collateralAssets = [wallet('99999')]; h.context.formData = { ...h.context.formData, userId: 2 };
    await h.complete({ orderId: 4860 });
    expect(h.freeze).toHaveBeenCalledWith(4860, 1, original); expect(h.close).toHaveBeenCalledWith(false);
    expect(h.context.createdOrderRecovery).toBeNull(); expect(h.toast.success).toHaveBeenCalledOnce();
  });
  it('冻结后成员仍pending时不close；成员保存也成功后才clear恢复态并提示成功', async () => {
    let resolve!: () => void; const pending = new Promise<void>(r => { resolve = r; });
    const h = completionHarness({ participants: [{ userId: 2 }] }); h.submit(); h.persistParticipants.mockReturnValueOnce(pending);
    const completing = h.complete({ orderId: 4860 }); await new Promise<void>(r => setImmediate(r));
    expect(h.freeze).toHaveBeenCalledOnce(); expect(h.persistParticipants).toHaveBeenCalledWith(4860);
    expect(h.close).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.context.createdOrderRecovery?.orderId).toBe(4860);
    resolve(); await completing; expect(h.close).toHaveBeenCalledWith(false); expect(h.toast.success).toHaveBeenCalledOnce();
    expect(h.context.createdOrderRecovery).toBeNull();
  });
  it('成员失败同样保留已有订单恢复态，不重复create、不伪成功', async () => {
    const h = completionHarness({ participants: [{ userId: 2 }] }); h.submit(); h.persistParticipants.mockRejectedValueOnce(Error('offline participant failed'));
    await h.complete({ orderId: 4860 }); h.submit();
    expect(h.context.createdOrderRecovery?.orderId).toBe(4860); expect(h.mutate).toHaveBeenCalledOnce();
    expect(h.toast.success).not.toHaveBeenCalled(); expect(h.close).not.toHaveBeenCalled();
  });
  it.each([{ scope: 0, ledgerId: 52 }, { scope: 1, ledgerId: 37 }])('旧scope/其它ledger返回%s不freeze、不关另一editor、不写成员', async stale => {
    const h = completionHarness({ participants: [{ userId: 999 }], newOrderCreateContextRef: { current: { ...stale, userId: 1, assets: [wallet('1')] } } });
    await h.complete({ orderId: 4860 });
    expect(h.freeze).not.toHaveBeenCalled(); expect(h.persistParticipants).not.toHaveBeenCalled(); expect(h.close).not.toHaveBeenCalled();
    expect(h.recovery).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled(); expect(h.toast.warning).toHaveBeenCalledWith(expect.stringContaining('#4860'));
  });
  it('freeze await期间关闭/换editor：旧scope不得继续写新成员或关闭新form', async () => {
    let resolve!: () => void; const pending = new Promise<void>(r => { resolve = r; });
    const h = completionHarness({ participants: [{ userId: 2 }] }); h.submit(); h.freeze.mockReturnValueOnce(pending);
    const completing = h.complete({ orderId: 4860 }); expect(h.freeze).toHaveBeenCalledOnce();
    h.context.newOrderEditorScopeRef.current += 1; h.context.participants = [{ userId: 999 }]; h.context.createdOrderRecovery = null;
    resolve(); await completing;
    expect(h.persistParticipants).not.toHaveBeenCalled(); expect(h.close).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.context.createdOrderRecovery).toBeNull();
  });
  it('成员await期间换scope，旧完成不关闭新form或宣称成功', async () => {
    let resolve!: () => void; const pending = new Promise<void>(r => { resolve = r; });
    const h = completionHarness({ participants: [{ userId: 2 }] }); h.submit(); h.persistParticipants.mockReturnValueOnce(pending);
    const completing = h.complete({ orderId: 4860 }); await new Promise<void>(r => setImmediate(r));
    expect(h.persistParticipants).toHaveBeenCalledOnce(); h.context.newOrderEditorScopeRef.current += 1;
    resolve(); await completing; expect(h.close).not.toHaveBeenCalled(); expect(h.toast.success).not.toHaveBeenCalled();
  });
  it('未返回orderId fail-closed，不把未完成冻结当成功或重新创建', async () => {
    const h = completionHarness(); h.submit(); await h.complete({}); h.submit();
    expect(h.context.createdOrderRecovery).toEqual({ orderId: 0, userId: 1 });
    expect(h.freeze).not.toHaveBeenCalled(); expect(h.mutate).toHaveBeenCalledOnce(); expect(h.close).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });
  it('新建/编辑/关闭真实局部scope递增并清恢复态，避免旧响应落入新editor', () => {
    for (const name of ['handleOpenCreate', 'handleOpenEdit', 'closeOrderEditor']) {
      const arrow = initial(management, name);
      if (!ts.isArrowFunction(arrow) || !ts.isBlock(arrow.body)) throw Error('Expected editor action block');
      const scopeStatements = arrow.body.statements.filter(s => s.getText().includes('newOrderEditorScopeRef.current') || s.getText().startsWith('setCreatedOrderRecovery('));
      expect(scopeStatements).toHaveLength(2);
      const ref = { current: 7 }; const clear = vi.fn(); const h = vm({ newOrderEditorScopeRef: ref, setCreatedOrderRecovery: clear });
      h.run(scopeStatements.map(s => s.getText()).join('\n'));
      expect(ref.current).toBe(8); expect(clear).toHaveBeenCalledWith(null);
    }
  });
});

describe('零/负可用余额也复用当前真实冻结，选择按钮不得错误阻断', () => {
  it.each(['management', 'quick'] as const)('%s可用0、当前真锁5，移除后可重选并全部仍5', kind => {
    const h = rowHarness(kind, { available: '0', confirmed: [wallet('5')], editingOrder: { id: 4860 }, assets: [manual, wallet('5')] });
    button(h.render(), '移除').props.onClick(); const choose = button(h.render(), '选择');
    expect(choose.props.disabled).toBe(false); choose.props.onClick(); button(h.render(), '全部').props.onClick();
    expect(h.state.assets.find(a => a.source === 'wallet')?.qty).toBe('5');
    expect(kind === 'management' ? h.state.assets[0] : h.state.manualAssets[0]).toBe(manual);
    expect(h.forbidden).not.toHaveBeenCalled();
  });
  it.each(['management', 'quick'] as const)('%s负可用-2真锁5，只能全部3，typed3.000000000000000001超额', kind => {
    const confirmed = [wallet('5')]; const h = rowHarness(kind, { available: '-2', confirmed, editingOrder: { id: 4860 }, assets: [manual, wallet('5')] });
    button(h.render(), '移除').props.onClick(); const choose = button(h.render(), '选择'); expect(choose.props.disabled).toBe(false);
    choose.props.onClick(); button(h.render(), '全部').props.onClick(); expect(h.state.assets.find(a => a.source === 'wallet')?.qty).toBe('3');
    expect(getWalletCollateralDraftError([wallet('3.000000000000000001')], [balance('-2')], confirmed, true)).toContain('超过');
  });
});
